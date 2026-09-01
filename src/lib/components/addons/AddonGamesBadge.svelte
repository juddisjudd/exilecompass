<script lang="ts">
  import { gameMode } from '$lib/gameMode.svelte';

  // Which games an add-on supports. An empty list (older manifests with no
  // registry entry to borrow from) renders nothing rather than guessing.
  let { games }: { games: string[] } = $props();

  const label = $derived(
    games.length >= 2 ? 'PoE1 & PoE2' : games[0] === 'poe1' ? 'PoE1 only' : 'PoE2 only',
  );
  // Single-game add-ons that don't cover the game the overlay currently
  // targets get the amber treatment — not broken, just not for right now.
  const mismatch = $derived(games.length === 1 && games[0] !== gameMode.current);
</script>

{#if games.length > 0}
  <span
    class="badge {mismatch ? 'badge-offgame' : 'badge-neutral'}"
    title={mismatch
      ? `Made for ${games[0] === 'poe1' ? 'Path of Exile 1' : 'Path of Exile 2'} — the overlay is currently in ${gameMode.current === 'poe1' ? 'PoE1' : 'PoE2'} mode`
      : undefined}
  >
    {label}
  </span>
{/if}

<style>
  .badge-offgame {
    color: #f0c77f;
    border-color: color-mix(in srgb, #f0c77f 45%, transparent);
    background: color-mix(in srgb, #f0c77f 14%, transparent);
  }
</style>
