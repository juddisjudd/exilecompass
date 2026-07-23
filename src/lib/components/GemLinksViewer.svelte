<script lang="ts">
  import { onMount } from 'svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { loadPoe1Build, type Poe1Build, type Poe1GemLinkGem } from '$lib/poe1Pob';
  import { poe1ViewState, syncGemsSelectionToBuild } from '$lib/poe1ViewState.svelte';

  // Display-only reference view of the imported build's skill setups
  // (upstream exile-leveling's "Gems" sidebar tab). All display fields were
  // resolved at import time — no game data loads here.
  let build = $state<Poe1Build | null>(null);

  onMount(() => {
    build = loadPoe1Build();
    if (build) syncGemsSelectionToBuild(build.importedAt, build.activeSkillSet);
  });

  const skillSets = $derived(build?.skillSets ?? []);
  const multiSet = $derived(skillSets.length > 1);
  const groups = $derived(
    skillSets[poe1ViewState.gemsActiveSet]?.gemLinks ?? skillSets[0]?.gemLinks ?? [],
  );

  function sourceTitle(gem: Poe1GemLinkGem): string | undefined {
    return gem.sources.length > 0 ? gem.sources.join('\n') : undefined;
  }
</script>

<div class="gems-view">
  <div class="gems-header ec-panel">
    <h3>{m.nav_gems()}</h3>
    {#if build}
      <span class="build-chip">{build.characterClass}</span>
    {/if}
  </div>

  {#if multiSet}
    <label class="set-select">
      <span class="set-select-label">{m.gems_set_label()}</span>
      <select
        value={poe1ViewState.gemsActiveSet}
        onchange={(e) => (poe1ViewState.gemsActiveSet = +(e.currentTarget as HTMLSelectElement).value)}
      >
        {#each skillSets as s, i (s.id)}
          <option value={i}>{s.title}</option>
        {/each}
      </select>
    </label>
  {/if}

  {#if !build}
    <p class="gems-status">{m.tree_no_build()}</p>
  {:else if groups.length === 0}
    <p class="gems-status">{m.gems_reimport_hint()}</p>
  {:else}
    {#each groups as group, i (i)}
      <div class="group ec-panel">
        <div class="group-title">{group.title}</div>
        <div class="group-body">
          {#each group.primary as gem (gem.id)}
            <div class="gem primary" title={sourceTitle(gem)}>
              <span class="gem-dot" style="background: {gem.colour}" aria-hidden="true"></span>
              <span class="gem-name">{gem.name}</span>
            </div>
          {/each}
          {#if group.secondary.length > 0}
            <div class="supports">
              {#each group.secondary as gem (gem.id)}
                <div class="gem support" title={sourceTitle(gem)}>
                  <span class="gem-dot" style="background: {gem.colour}" aria-hidden="true"></span>
                  <span class="gem-name">{gem.name}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .gems-view {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .gems-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    margin-bottom: 2px;
  }

  .gems-header h3 {
    margin: 0;
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-primary);
  }

  .build-chip {
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 0.04em;
    color: var(--c-red-bright);
    border: 1px solid color-mix(in srgb, var(--c-red) 40%, transparent);
    padding: 2px 7px;
  }

  .gems-status {
    font-size: 11px;
    color: var(--c-accent);
    padding: 8px 2px;
  }

  .set-select {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .set-select-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-red) 70%, transparent);
    flex-shrink: 0;
  }

  .set-select select {
    flex: 1;
    min-width: 0;
    padding: 4px 20px 4px 6px;
    background-color: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-red) 32%, transparent);
    border-radius: var(--radius);
    color: var(--c-red-bright);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s;
  }
  .set-select select:hover,
  .set-select select:focus {
    border-color: color-mix(in srgb, var(--c-red) 55%, transparent);
  }
  .set-select option {
    background: var(--c-bg);
    color: var(--c-red-bright);
  }

  .group {
    overflow: hidden;
  }

  .group-title {
    padding: 6px 12px;
    background: color-mix(in srgb, var(--c-bg) 84%, var(--c-mid));
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c-accent);
  }

  .group-body {
    padding: 6px 12px 8px;
  }

  .gem {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 0;
  }

  .gem-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 1px solid rgba(0, 0, 0, 0.4);
  }

  .gem.primary .gem-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--c-primary);
  }

  .supports {
    margin: 3px 0 0 4px;
    padding-left: 10px;
    border-left: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent);
  }

  .gem.support .gem-dot {
    width: 7px;
    height: 7px;
  }

  .gem.support .gem-name {
    font-size: 10.5px;
    color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%);
  }
</style>
