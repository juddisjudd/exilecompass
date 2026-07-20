<script lang="ts">
  import type { InstalledAddon } from '$lib/plugins/host.svelte';

  interface Props {
    addons: InstalledAddon[];
    onToggle: (id: string) => void | Promise<void>;
    onTogglePin: (id: string) => void | Promise<void>;
    onUninstall: (id: string) => void | Promise<void>;
    onOpenPanel: (id: string) => void | Promise<void>;
  }

  let { addons, onToggle, onTogglePin, onUninstall, onOpenPanel }: Props = $props();
</script>

{#if addons.length === 0}
  <div class="empty">No add-ons installed yet. Use Discover or Install from file to begin.</div>
{:else}
  <div class="list">
    {#each addons as addon (addon.id)}
      <article class="ec-panel card">
        <header class="head">
          <h3>{addon.name}</h3>
          <div class="badges">
            {#if addon.pinned && addon.hasPanel}
              <span class="badge badge-neutral">pinned</span>
            {/if}
            <span class="badge {addon.trust === 'verified' ? 'badge-ok' : 'badge-unverified'}">{addon.trust}</span>
          </div>
        </header>
        <p class="meta">{addon.id}</p>
        <p class="meta">v{addon.version} • {addon.source}</p>
        <p class="meta">Permissions: {addon.permissions.join(', ') || 'none'}</p>
        {#if addon.lastError}
          <p class="warn">{addon.lastError}</p>
        {/if}
        <div class="actions">
          <button class="btn btn-ghost" onclick={() => onToggle(addon.id)} type="button">
            {addon.enabled ? 'Disable' : 'Enable'}
          </button>
          {#if addon.hasPanel}
            <button class="btn btn-ghost" onclick={() => onTogglePin(addon.id)} type="button" disabled={!addon.enabled}>
              {addon.pinned ? 'Unpin' : 'Pin to tabs'}
            </button>
            <button class="btn btn-ghost" onclick={() => onOpenPanel(addon.id)} type="button" disabled={!addon.enabled}>
              Open
            </button>
          {/if}
          <button class="btn btn-danger" onclick={() => onUninstall(addon.id)} type="button">Uninstall</button>
        </div>
      </article>
    {/each}
  </div>
{/if}

<style>
  .empty {
    font-size: 12px;
    color: var(--c-accent);
    padding: 10px;
    border: 1px dashed color-mix(in srgb, var(--c-accent) 35%, transparent);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card {
    padding: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  h3 {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .meta {
    font-size: 11px;
    color: var(--c-accent);
    margin-top: 2px;
  }
  .warn {
    margin-top: 6px;
    font-size: 11px;
    color: var(--c-red-bright);
  }
  .badges {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  /* Unverified trust state has no shared badge variant (amber is a distinct
     third state alongside the shared ok/bad/neutral pills). */
  .badge-unverified {
    color: #f0c77f;
    border-color: color-mix(in srgb, #f0c77f 45%, transparent);
    background: color-mix(in srgb, #f0c77f 14%, transparent);
  }
  .actions {
    margin-top: 8px;
    display: flex;
    gap: 6px;
  }
</style>
