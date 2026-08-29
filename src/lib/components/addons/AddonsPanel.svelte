<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { persistGet, persistSet } from '$lib/persist';
  import { loadStoredBuild, BUILD_CHANGED_EVENT } from '$lib/pob';
  import { gameMode } from '$lib/gameMode.svelte';
  import type { InstalledAddon } from '$lib/plugins/host.svelte';

  interface AddonRequestResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
  }

  interface Props {
    addon: InstalledAddon | null;
    onClose?: () => void;
    /** Hidden when the panel is shown as its own top-level tab. */
    showHeader?: boolean;
  }

  let { addon, onClose, showHeader = true }: Props = $props();

  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let errorMsg = $state('');

  // Per-load handshake state (reset whenever the active addon changes).
  let panelCode: string | null = null;
  let frameReady = false;
  let inited = false;

  // Namespaced, per-addon storage key so add-ons can't read each other's data.
  function storageKey(id: string, key: string): string {
    return `EXILECOMPASS_ADDON_${id}__${key}`;
  }

  function httpsHost(url: string): string | null {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' ? u.hostname.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  // `network.fetch:poe.ninja` covers poe.ninja and its subdomains.
  function hostAllowed(permissions: string[], prefixes: string[], host: string): boolean {
    return permissions.some((p) => {
      const prefix = prefixes.find((pre) => p.startsWith(pre));
      if (!prefix) return false;
      const allowed = p.slice(prefix.length).toLowerCase();
      return host === allowed || host.endsWith(`.${allowed}`);
    });
  }

  // `network.request:<host>` is the stronger grant (POST, response headers),
  // so it implies plain GET access to the same host.
  const fetchAllowed = (permissions: string[], host: string) =>
    hostAllowed(permissions, ['network.fetch:', 'network.request:'], host);
  const requestAllowed = (permissions: string[], host: string) =>
    hostAllowed(permissions, ['network.request:'], host);
  const openAllowed = (permissions: string[], host: string) =>
    hostAllowed(permissions, ['shell.open:'], host);

  // Sandboxed bootstrap document. `allow-scripts` WITHOUT `allow-same-origin`
  // gives the iframe an opaque origin: no access to the parent DOM, app
  // localStorage, or Tauri APIs. It imports the addon bundle from a blob and
  // talks to the host only over postMessage. (App CSP is null, so blob module
  // imports and this inline script are permitted.)
  // As a top-level tab the view's own padding already insets the frame, so the
  // document keeps only a hairline of its own — at the default window size the
  // panel is ~490px wide and every 10px counts.
  const bootstrap = (padding: number) => `<!doctype html><html><head><meta charset="utf-8" />
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; }
  body {
    font: 11px/1.45 system-ui, sans-serif;
    color: #ede6d5;
    background: transparent;
    padding: ${padding}px;
    box-sizing: border-box;
    --c-primary: #ede6d5; --c-accent: #a79a85; --c-muted: #4a4438;
  }
  #ec-root { height: 100%; }
</style></head><body><div id="ec-root"></div>
<script type="module">
  const pending = new Map();
  let seq = 0;
  function rpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      parent.postMessage({ __ec: 'req', id, method, params }, '*');
    });
  }
  const buildChangeCbs = new Set();
  const gameChangeCbs = new Set();
  const host = {
    storage: {
      get: (key) => rpc('storage.get', { key: String(key) }),
      set: (key, value) => rpc('storage.set', { key: String(key), value: String(value) }),
    },
    builds: {
      getActive: () => rpc('builds.getActive'),
      // Subscribe to build imports/changes while the panel is open. Returns an
      // unsubscribe function. The callback receives the new build (or null).
      onChange: (cb) => {
        if (typeof cb !== 'function') return () => {};
        buildChangeCbs.add(cb);
        return () => { buildChangeCbs.delete(cb); };
      },
    },
    net: {
      fetch: (url) => rpc('net.fetch', { url: String(url) }),
      fetchImage: (url) => rpc('net.fetchImage', { url: String(url) }),
      fetchCached: (url, maxAgeSeconds) =>
        rpc('net.fetchCached', {
          url: String(url),
          maxAgeSecs: maxAgeSeconds == null ? undefined : Number(maxAgeSeconds),
        }),
      request: (opts) => {
        const o = opts || {};
        const headers = {};
        if (o.headers) for (const k of Object.keys(o.headers)) headers[String(k)] = String(o.headers[k]);
        return rpc('net.request', {
          url: String(o.url || ''),
          method: o.method ? String(o.method) : 'GET',
          headers,
          body: o.body == null ? '' : String(o.body),
        });
      },
    },
    shell: {
      openExternal: (url) => rpc('shell.openExternal', { url: String(url) }),
    },
    game: {
      get: () => rpc('game.get'),
      onChange: (cb) => {
        if (typeof cb !== 'function') return () => {};
        gameChangeCbs.add(cb);
        return () => { gameChangeCbs.delete(cb); };
      },
    },
  };
  addEventListener('message', async (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.__ec === 'res') {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      d.error ? p.reject(new Error(d.error)) : p.resolve(d.result);
      return;
    }
    if (d.__ec === 'event') {
      if (d.name === 'builds.changed')
        for (const cb of buildChangeCbs) { try { cb(d.build ?? null); } catch (_) {} }
      if (d.name === 'game.changed')
        for (const cb of gameChangeCbs) { try { cb(d.game); } catch (_) {} }
      return;
    }
    if (d.__ec === 'init') {
      try {
        const url = URL.createObjectURL(new Blob([d.code], { type: 'text/javascript' }));
        let mod;
        try { mod = await import(url); } finally { URL.revokeObjectURL(url); }
        const mount = mod.default || mod.mount;
        if (typeof mount !== 'function')
          throw new Error('panel bundle must default-export a mount(ctx) function');
        await mount({ root: document.getElementById('ec-root'), host });
        parent.postMessage({ __ec: 'mounted' }, '*');
      } catch (err) {
        parent.postMessage({ __ec: 'error', message: String((err && err.message) || err) }, '*');
      }
    }
  });
  parent.postMessage({ __ec: 'ready' }, '*');
<\/script></body></html>`;

  function tryInit() {
    if (!frameReady || panelCode == null || inited || !iframeEl) return;
    inited = true;
    iframeEl.contentWindow?.postMessage({ __ec: 'init', code: panelCode }, '*');
  }

  async function handleMessage(e: MessageEvent) {
    if (!iframeEl || e.source !== iframeEl.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    const cur = addon;

    if (d.__ec === 'ready') {
      frameReady = true;
      tryInit();
      return;
    }
    if (d.__ec === 'mounted') {
      status = 'ready';
      return;
    }
    if (d.__ec === 'error') {
      status = 'error';
      errorMsg = d.message || 'Panel failed to load.';
      return;
    }
    if (d.__ec === 'req' && cur) {
      const reply = (result?: unknown, error?: string) =>
        iframeEl?.contentWindow?.postMessage({ __ec: 'res', id: d.id, result, error }, '*');
      try {
        const key = String(d.params?.key ?? '');
        if (d.method === 'storage.get') {
          if (!cur.permissions.includes('storage.read'))
            return reply(undefined, 'permission denied: storage.read');
          reply((await persistGet(storageKey(cur.id, key))) ?? null);
        } else if (d.method === 'storage.set') {
          if (!cur.permissions.includes('storage.write'))
            return reply(undefined, 'permission denied: storage.write');
          await persistSet(storageKey(cur.id, key), String(d.params?.value ?? ''));
          reply(null);
        } else if (d.method === 'builds.getActive') {
          if (!cur.permissions.includes('builds.read'))
            return reply(undefined, 'permission denied: builds.read');
          // Read-only snapshot of the player's active imported build (or null).
          reply(loadStoredBuild());
        } else if (d.method === 'net.fetch') {
          const url = String(d.params?.url ?? '');
          const host = httpsHost(url);
          if (!host || !fetchAllowed(cur.permissions, host))
            return reply(undefined, `permission denied: network.fetch:${host ?? 'invalid url'}`);
          reply(await invoke<{ status: number; body: string }>('addons_fetch_text', { url }));
        } else if (d.method === 'net.fetchImage') {
          const url = String(d.params?.url ?? '');
          const host = httpsHost(url);
          if (!host || !fetchAllowed(cur.permissions, host))
            return reply(undefined, `permission denied: network.fetch:${host ?? 'invalid url'}`);
          reply(await invoke<string>('addons_fetch_image', { url }));
        } else if (d.method === 'net.fetchCached') {
          const url = String(d.params?.url ?? '');
          const host = httpsHost(url);
          if (!host || !fetchAllowed(cur.permissions, host))
            return reply(undefined, `permission denied: network.fetch:${host ?? 'invalid url'}`);
          const maxAge = Number(d.params?.maxAgeSecs);
          reply(
            await invoke<{ status: number; body: string }>('addons_fetch_cached', {
              url,
              maxAgeSecs: Number.isFinite(maxAge) ? Math.floor(maxAge) : null,
            }),
          );
        } else if (d.method === 'net.request') {
          const url = String(d.params?.url ?? '');
          const host = httpsHost(url);
          if (!host || !requestAllowed(cur.permissions, host))
            return reply(undefined, `permission denied: network.request:${host ?? 'invalid url'}`);
          const rawHeaders = (d.params?.headers ?? {}) as Record<string, unknown>;
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(rawHeaders)) headers[String(k)] = String(v);
          reply(
            await invoke<AddonRequestResponse>('addons_request', {
              url,
              method: String(d.params?.method ?? 'GET'),
              headers,
              body: String(d.params?.body ?? ''),
            }),
          );
        } else if (d.method === 'shell.openExternal') {
          const url = String(d.params?.url ?? '');
          const host = httpsHost(url);
          if (!host || !openAllowed(cur.permissions, host))
            return reply(undefined, `permission denied: shell.open:${host ?? 'invalid url'}`);
          await openUrl(url);
          reply(null);
        } else if (d.method === 'game.get') {
          if (!cur.permissions.includes('game.read'))
            return reply(undefined, 'permission denied: game.read');
          reply(gameMode.current);
        } else {
          reply(undefined, `unknown host method: ${d.method}`);
        }
      } catch (err) {
        reply(undefined, err instanceof Error ? err.message : String(err));
      }
    }
  }

  $effect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });

  // Push build imports/changes to a panel that's allowed to read them, so addons
  // can react live without polling getActive().
  $effect(() => {
    const onBuildChange = () => {
      const cur = addon;
      if (!cur?.enabled || !cur.permissions.includes('builds.read')) return;
      iframeEl?.contentWindow?.postMessage(
        { __ec: 'event', name: 'builds.changed', build: loadStoredBuild() },
        '*',
      );
    };
    window.addEventListener(BUILD_CHANGED_EVENT, onBuildChange);
    return () => window.removeEventListener(BUILD_CHANGED_EVENT, onBuildChange);
  });

  // Tell a panel that follows the footer game switch when it flips.
  $effect(() => {
    const game = gameMode.current;
    const cur = addon;
    if (!cur?.enabled || !cur.permissions.includes('game.read')) return;
    iframeEl?.contentWindow?.postMessage({ __ec: 'event', name: 'game.changed', game }, '*');
  });

  // (Re)load the panel bundle whenever the active, enabled addon changes.
  // The {#key} block remounts the iframe per addon, so a fresh `ready` fires.
  $effect(() => {
    const cur = addon;
    panelCode = null;
    frameReady = false;
    inited = false;
    errorMsg = '';

    if (!cur || !cur.enabled) {
      status = 'idle';
      return;
    }

    status = 'loading';
    let cancelled = false;
    invoke<{ code: string; title: string }>('addons_read_panel', { id: cur.id })
      .then((payload) => {
        if (cancelled) return;
        panelCode = payload.code;
        tryInit();
      })
      .catch((e) => {
        if (cancelled) return;
        status = 'error';
        errorMsg = typeof e === 'string' ? e : 'This add-on does not provide a panel.';
      });

    return () => {
      cancelled = true;
    };
  });
</script>

{#if !addon}
  <div class="empty">No add-on selected. Open a panel from Installed.</div>
{:else if !addon.enabled}
  <div class="empty">{addon.name} is disabled. Enable it in Installed first.</div>
{:else}
  <section class="ec-panel panel-shell" class:bare={!showHeader}>
    {#if showHeader}
      <header class="panel-head">
        <div>
          <h3>{addon.name}</h3>
          <p class="meta">{addon.id} • v{addon.version}</p>
        </div>
        {#if onClose}
          <button class="btn btn-ghost" type="button" onclick={onClose}>Back to Installed</button>
        {/if}
      </header>
    {/if}

    {#if status === 'error'}
      <div class="empty error">{errorMsg}</div>
    {:else}
      <div class="frame-wrap">
        {#key addon.id}
          <iframe
            bind:this={iframeEl}
            class="panel-frame"
            class:loading={status !== 'ready'}
            title={addon.name}
            sandbox="allow-scripts"
            srcdoc={bootstrap(showHeader ? 10 : 4)}
          ></iframe>
        {/key}
        {#if status === 'loading'}
          <div class="frame-loading">Loading panel…</div>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .empty {
    font-size: 12px;
    color: var(--c-accent);
    padding: 10px;
    border: 1px dashed color-mix(in srgb, var(--c-accent) 35%, transparent);
  }

  .empty.error {
    color: var(--c-red-bright);
    border-color: color-mix(in srgb, var(--c-red) 40%, transparent);
  }

  .panel-shell {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
  }

  /* As a top-level tab the surrounding view already provides chrome. */
  .panel-shell.bare {
    border: none;
    background: transparent;
    padding: 0;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  h3 {
    font-size: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--c-primary);
  }

  .meta {
    margin-top: 2px;
    font-size: 10px;
    color: var(--c-accent);
  }

  .frame-wrap {
    position: relative;
    flex: 1;
    min-height: 200px;
  }

  .panel-frame {
    width: 100%;
    height: 100%;
    border: 1px solid color-mix(in srgb, var(--c-accent) 26%, transparent);
    background: var(--c-bg);
  }

  .panel-frame.loading {
    visibility: hidden;
  }

  .frame-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: var(--c-accent);
  }
</style>
