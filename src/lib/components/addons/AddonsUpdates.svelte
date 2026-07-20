<script lang="ts">
  import type { InstalledAddon } from '$lib/plugins/host.svelte';

  interface Props {
    addons: InstalledAddon[];
  }

  let { addons }: Props = $props();

  let updatable = $derived(addons.filter((addon) => addon.hasUpdate));
</script>

{#if updatable.length === 0}
  <div class="empty">All installed add-ons are up to date.</div>
{:else}
  <div class="list">
    {#each updatable as addon (addon.id)}
      <article class="ec-panel card">
        <h3>{addon.name}</h3>
        <p class="meta">Current: v{addon.version}</p>
        <p class="meta">Available: v{addon.updateVersion ?? 'unknown'}</p>
        <button class="btn btn-ghost" type="button" disabled>Update (planned)</button>
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
  h3 {
    font-size: 12px;
    font-weight: 700;
  }
  .meta {
    font-size: 11px;
    color: var(--c-accent);
    margin-top: 3px;
  }
  .card .btn {
    margin-top: 8px;
  }
</style>
