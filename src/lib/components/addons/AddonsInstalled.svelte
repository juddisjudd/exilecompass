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
      <article class="card">
        <header class="head">
          <h3>{addon.name}</h3>
          <div class="badges">
            {#if addon.pinned && addon.hasPanel}
              <span class="badge pinned">pinned</span>
            {/if}
            <span class="badge {addon.trust}">{addon.trust}</span>
          </div>
        </header>
        <p class="meta">{addon.id}</p>
        <p class="meta">v{addon.version} • {addon.source}</p>
        <p class="meta">Permissions: {addon.permissions.join(', ') || 'none'}</p>
        {#if addon.lastError}
          <p class="warn">{addon.lastError}</p>
        {/if}
        <div class="actions">
          <button class="btn" onclick={() => onToggle(addon.id)} type="button">
            {addon.enabled ? 'Disable' : 'Enable'}
          </button>
          {#if addon.hasPanel}
            <button class="btn" onclick={() => onTogglePin(addon.id)} type="button" disabled={!addon.enabled}>
              {addon.pinned ? 'Unpin' : 'Pin to tabs'}
            </button>
            <button class="btn" onclick={() => onOpenPanel(addon.id)} type="button" disabled={!addon.enabled}>
              Open
            </button>
          {/if}
          <button class="btn danger" onclick={() => onUninstall(addon.id)} type="button">Uninstall</button>
        </div>
      </article>
    {/each}
  </div>
{/if}

<style>
  .empty {
    font-size: 12px;
    color: #b8b4ae;
    padding: 10px;
    border: 1px dashed color-mix(in srgb, #b8b4ae 35%, transparent);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card {
    border: 1px solid color-mix(in srgb, #b8b4ae 28%, transparent);
    background: color-mix(in srgb, #111 82%, transparent);
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
    color: #b8b4ae;
    margin-top: 2px;
  }
  .warn {
    margin-top: 6px;
    font-size: 11px;
    color: #f0c3b5;
  }
  .badges {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .badge {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 2px 6px;
    border: 1px solid;
  }
  .badge.pinned {
    color: #e8d070;
    border-color: color-mix(in srgb, #e8d070 52%, transparent);
  }
  .badge.verified {
    color: #89e5b5;
    border-color: color-mix(in srgb, #89e5b5 52%, transparent);
  }
  .badge.unverified {
    color: #f0c77f;
    border-color: color-mix(in srgb, #f0c77f 52%, transparent);
  }
  .actions {
    margin-top: 8px;
    display: flex;
    gap: 6px;
  }
  .btn {
    border: 1px solid color-mix(in srgb, #b8b4ae 35%, transparent);
    color: #e8e4de;
    background: color-mix(in srgb, #171719 86%, transparent);
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .btn:hover {
    border-color: color-mix(in srgb, #e8d070 55%, transparent);
  }
  .btn.danger {
    color: #f4b7ab;
    border-color: color-mix(in srgb, #f4b7ab 45%, transparent);
  }
</style>
