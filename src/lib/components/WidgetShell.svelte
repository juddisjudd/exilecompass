<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { listen } from '@tauri-apps/api/event';
  import { persistGet, persistSet } from '$lib/persist';

  let { children }: { children?: Snippet } = $props();

  // The window's own label is the natural per-widget persistence key — no
  // need to thread it through as a prop from the /widget route.
  const label = getCurrentWindow().label;
  const OPACITY_KEY = `EXILECOMPASS_WIDGET_OPACITY_V1_${label}`;
  const POS_KEY = `EXILECOMPASS_WIDGET_POS_V1_${label}`;

  // Opacity is controlled from Settings (main window), not a slider here —
  // this widget only reads its last-set value on mount and listens for live
  // changes (see widgets.ts's getWidgetOpacity/setWidgetOpacity).
  let opacity = $state(1);

  $effect(() => {
    (async () => {
      const saved = await persistGet(OPACITY_KEY);
      const parsed = saved ? parseFloat(saved) : NaN;
      if (!Number.isNaN(parsed)) opacity = parsed;
    })();

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const handle = await listen<{ label: string; opacity: number }>('ec-widget-opacity', (event) => {
        if (event.payload.label === label) opacity = event.payload.opacity;
      });
      if (cancelled) handle();
      else unlisten = handle;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  });

  async function close() {
    await getCurrentWindow().close();
  }

  // Debounced position save so a drag doesn't spam disk writes.
  $effect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const win = getCurrentWindow();
      const handle = await win.onMoved(() => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          try {
            const pos = await win.outerPosition();
            await persistSet(POS_KEY, JSON.stringify({ x: pos.x, y: pos.y }));
          } catch { /* best effort */ }
        }, 400);
      });
      if (cancelled) handle();
      else unlisten = handle;
    })();

    return () => {
      cancelled = true;
      if (saveTimer) clearTimeout(saveTimer);
      unlisten?.();
    };
  });
</script>

<!-- `app-shell` here is a marker only, not styling: app.html's bootstrap
     watchdog does a plain `document.querySelector('.app-shell')` 5s after
     load and shows a "failed to render" overlay if nothing matches. It's not
     Svelte-scoped, so this doesn't pull in +page.svelte's `.app-shell` rule
     (100vw/100vh opaque panel) — only `.widget-shell` below applies here. -->
<div class="widget-shell app-shell" style={`opacity:${opacity}`}>
  <div class="widget-header" data-tauri-drag-region>
    <button class="widget-close" onclick={close} title="Close">×</button>
  </div>
  <div class="widget-body">
    {@render children?.()}
  </div>
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background: transparent;
    overflow: hidden;
  }

  .widget-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    color: var(--c-primary);
    font-family: 'Inter', sans-serif;
    font-size: 12px;
  }

  .widget-header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: 20px;
    padding: 4px 6px;
    background: color-mix(in srgb, var(--c-mid) 85%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 25%, transparent);
    cursor: move;
  }

  .widget-close {
    background: none;
    border: none;
    color: var(--c-accent);
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    padding: 0 4px;
  }

  .widget-close:hover {
    color: var(--c-red-bright);
  }

  .widget-body {
    flex: 1;
    overflow: auto;
  }
</style>
