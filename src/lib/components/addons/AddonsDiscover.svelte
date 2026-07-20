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
      <article class="ec-panel card">
        <header class="head">
          <h3>{addon.name} &lt;{addon.latestVersion}&gt;</h3>
          <span class="badge {addon.trust === 'verified' ? 'badge-ok' : 'badge-unverified'}">{addon.trust}</span>
        </header>
        <p class="meta">{addon.id}</p>
        <p class="meta">by {addon.author}</p>
        <a class="repo-link" href={addon.repoUrl} target="_blank" rel="noreferrer noopener">{addon.repoUrl}</a>
        <p class="desc">[{addon.description}]</p>
        <div class="actions">
          <button
            class="btn btn-primary"
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
  .desc {
    margin-top: 6px;
    font-size: 11px;
    color: var(--c-primary);
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
  /* Unverified trust state has no shared badge variant (amber is a distinct
     third state alongside the shared ok/bad/neutral pills). */
  .badge-unverified {
    color: #f0c77f;
    border-color: color-mix(in srgb, #f0c77f 45%, transparent);
    background: color-mix(in srgb, #f0c77f 14%, transparent);
  }
  .actions {
    margin-top: 8px;
  }
</style>
