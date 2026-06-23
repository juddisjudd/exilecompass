<script lang="ts">
  import type { DiscoverAddon } from '$lib/plugins/host.svelte';

  interface Props {
    addons: DiscoverAddon[];
    installedIds: string[];
    onInstall: (id: string) => void | Promise<void>;
  }

  let { addons, installedIds, onInstall }: Props = $props();
</script>

{#if addons.length === 0}
  <div class="empty">No registry results yet.</div>
{:else}
  <div class="list">
    {#each addons as addon (addon.id)}
      <article class="card">
        <header class="head">
          <h3>{addon.name} &lt;{addon.latestVersion}&gt;</h3>
          <span class="badge {addon.trust}">{addon.trust}</span>
        </header>
        <p class="meta">{addon.id}</p>
        <p class="meta">by {addon.author}</p>
        <a class="repo-link" href={addon.repoUrl} target="_blank" rel="noreferrer noopener">{addon.repoUrl}</a>
        <p class="desc">[{addon.description}]</p>
        <div class="actions">
          <button
            class="btn"
            disabled={installedIds.includes(addon.id) || !addon.compatible}
            onclick={() => onInstall(addon.id)}
            type="button"
          >
            {#if installedIds.includes(addon.id)}Installed{:else if !addon.compatible}Incompatible{:else}Install{/if}
          </button>
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
  .desc {
    margin-top: 6px;
    font-size: 11px;
    color: #d8d2c9;
  }
  .repo-link {
    display: inline-block;
    margin-top: 4px;
    font-size: 10px;
    color: #9ecdf1;
    text-decoration: none;
    word-break: break-all;
  }
  .repo-link:hover {
    color: #c2e4fb;
    text-decoration: underline;
  }
  .badge {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 2px 6px;
    border: 1px solid;
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
  }
  .btn {
    border: 1px solid color-mix(in srgb, #b8b4ae 35%, transparent);
    color: #e8e4de;
    background: color-mix(in srgb, #171719 86%, transparent);
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
