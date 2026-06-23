<script lang="ts">
  import type { InstalledAddon } from '$lib/plugins/host.svelte';

  interface Props {
    addons: InstalledAddon[];
  }

  let { addons }: Props = $props();

  let failed = $derived(addons.filter((addon) => !!addon.lastError));
</script>

{#if failed.length === 0}
  <div class="empty">No addon diagnostics to report.</div>
{:else}
  <div class="list">
    {#each failed as addon (addon.id)}
      <article class="card">
        <h3>{addon.name}</h3>
        <p class="meta">{addon.id}</p>
        <p class="err">{addon.lastError}</p>
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
  .err {
    font-size: 11px;
    color: #f0c3b5;
    margin-top: 7px;
  }
</style>
