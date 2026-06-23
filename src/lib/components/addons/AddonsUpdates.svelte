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
      <article class="card">
        <h3>{addon.name}</h3>
        <p class="meta">Current: v{addon.version}</p>
        <p class="meta">Available: v{addon.updateVersion ?? 'unknown'}</p>
        <button class="btn" type="button" disabled>Update (planned)</button>
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
  h3 {
    font-size: 12px;
    font-weight: 700;
  }
  .meta {
    font-size: 11px;
    color: #b8b4ae;
    margin-top: 3px;
  }
  .btn {
    margin-top: 8px;
    border: 1px solid color-mix(in srgb, #b8b4ae 35%, transparent);
    color: #e8e4de;
    background: color-mix(in srgb, #171719 86%, transparent);
    padding: 4px 8px;
    font-size: 11px;
    opacity: 0.55;
  }
</style>
