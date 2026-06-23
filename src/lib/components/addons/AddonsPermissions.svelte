<script lang="ts">
  import type { InstalledAddon } from '$lib/plugins/host.svelte';

  interface Props {
    addons: InstalledAddon[];
  }

  let { addons }: Props = $props();
</script>

{#if addons.length === 0}
  <div class="empty">No installed add-ons to inspect.</div>
{:else}
  <div class="list">
    {#each addons as addon (addon.id)}
      <article class="card">
        <h3>{addon.name}</h3>
        <p class="meta">{addon.id}</p>
        <p class="meta">Requested permissions:</p>
        {#if addon.permissions.length === 0}
          <p class="perm">none</p>
        {:else}
          <ul class="perms">
            {#each addon.permissions as permission (permission)}
              <li class="perm">{permission}</li>
            {/each}
          </ul>
        {/if}
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
  .perms {
    margin-top: 5px;
    margin-left: 14px;
  }
  .perm {
    font-size: 11px;
    color: #e0ddd7;
    margin-top: 2px;
  }
</style>
