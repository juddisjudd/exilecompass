<script lang="ts">
  import { onMount } from 'svelte';
  import { m } from '$lib/paraglide/messages.js';
  import {
    builder,
    initBuilder,
    resetAll,
    doImport,
    saveFavorite,
    deleteFavorite,
    applyFavorite,
    toggleCondition,
    conditionGroupOf,
    findCondition,
    setConditionValue,
    removeConditionAt,
    addGroup,
    removeGroup,
    toggleArrayCondition,
    arrayCondition,
    setArrayValue,
  } from '$lib/regex/builderState.svelte';
  import type { Category } from '$lib/regex/settings';
  import type { SelectOption } from '$lib/regex/types';
  import { VENDOR_OPTIONS, VENDOR_SECTIONS } from '$lib/regex/vendorOptions';

  onMount(() => {
    initBuilder();
  });

  let copied = $state(false);
  let importText = $state('');
  let showSaveFav = $state(false);
  let favName = $state('');
  let affixFilter = $state('');
  // Top-level view: the four build categories, or the saved-regex library.
  let view = $state<'build' | 'favorites'>('build');
  let copiedFavId = $state<number | null>(null);

  const CATEGORIES: { id: Category; label: () => string }[] = [
    { id: 'vendor', label: () => m.regex_cat_vendor() },
    { id: 'waystone', label: () => m.regex_cat_waystone() },
    { id: 'tablet', label: () => m.regex_cat_tablet() },
    { id: 'relic', label: () => m.regex_cat_relic() },
  ];

  const assembled = $derived(builder.result);
  const charCount = $derived(assembled.length);
  const charOver = $derived(charCount >= 250);
  const charWarn = $derived(charCount >= 200 && !charOver);

  // Reset the affix filter when switching categories.
  let lastCat: Category = builder.category;
  $effect(() => {
    if (builder.category !== lastCat) {
      lastCat = builder.category;
      affixFilter = '';
    }
  });

  async function copy() {
    if (!assembled) return;
    await navigator.clipboard.writeText(assembled);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function loadImport() {
    doImport(importText);
    importText = '';
  }

  function confirmSaveFav() {
    saveFavorite(favName);
    favName = '';
    showSaveFav = false;
  }

  async function copyFav(fav: { id: number; regex: string }) {
    await navigator.clipboard.writeText(fav.regex);
    copiedFavId = fav.id;
    setTimeout(() => (copiedFavId = null), 1500);
  }

  // `##%`-style affixes expose a numeric minimum threshold input.
  function hasRange(o: { name: string; ranges: number[][] }): boolean {
    return o.name.startsWith('##%') && o.ranges.length > 0 && o.ranges[0][0] > 0;
  }
  function affixLabel(name: string): string {
    const d = name.replace(/\|/g, ' • ');
    return name.startsWith('##%') ? d.replace(/##/, '') : d.replace(/##/g, '#');
  }

  function filtered<T extends { name: string }>(list: T[]): T[] {
    const q = affixFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o) => o.name.toLowerCase().includes(q));
  }
</script>

<div class="regex-builder">
  <!-- Category selector -->
  <div class="cat-tabs" role="tablist" aria-label="Item categories">
    {#each CATEGORIES as cat (cat.id)}
      <button
        class="cat-tab"
        class:active={view === 'build' && builder.category === cat.id}
        onclick={() => {
          builder.category = cat.id;
          view = 'build';
        }}
        type="button"
      >{cat.label()}</button>
    {/each}
    <button
      class="cat-tab cat-tab-fav"
      class:active={view === 'favorites'}
      onclick={() => (view = 'favorites')}
      title={m.regex_favorites()}
      aria-label={m.regex_favorites()}
      type="button"
    >
      <span class="star">★</span>
      {#if builder.favorites.length > 0}<span class="fav-count">{builder.favorites.length}</span>{/if}
    </button>
  </div>

  {#if view === 'favorites'}
    <!-- Saved regex library -->
    <div class="options-panel fav-panel">
      {#if builder.favorites.length === 0}
        <span class="empty-hint">{m.regex_no_favorites()}</span>
      {:else}
        {#each builder.favorites as fav (fav.id)}
          <div class="fav-item">
            <div class="fav-item-head">
              <span class="fav-cat">{fav.category}</span>
              <span class="fav-item-name">{fav.name}</span>
              <div class="fav-item-actions">
                <button
                  class="act-btn"
                  class:copied={copiedFavId === fav.id}
                  onclick={() => copyFav(fav)}
                  title={m.regex_copy()}
                >
                  {#if copiedFavId === fav.id}<span class="copied-check">✓</span>{:else}
                    <img src="/ui/fouriconcopy.webp" width="14" height="14" alt="" aria-hidden="true" />
                  {/if}
                </button>
                <button
                  class="mini-btn"
                  onclick={() => {
                    applyFavorite(fav);
                    view = 'build';
                  }}
                >{m.regex_fav_load()}</button>
                <button class="act-btn act-clear" onclick={() => deleteFavorite(fav.id)} title="Delete">
                  ✕
                </button>
              </div>
            </div>
            <code class="fav-item-regex">{fav.regex}</code>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <!-- Output -->
    <div class="output-section">
      <code class="output-text" class:empty={!assembled}>{assembled || m.regex_placeholder_output()}</code>
      <div class="output-actions">
        <button class="act-btn" class:copied onclick={copy} disabled={!assembled} title={m.regex_copy()}>
          {#if copied}<span class="copied-check">✓</span>{:else}
            <img src="/ui/fouriconcopy.webp" width="16" height="16" alt="" aria-hidden="true" />
          {/if}
        </button>
        <button
          class="act-btn act-save"
          onclick={() => (showSaveFav = !showSaveFav)}
          disabled={!assembled}
          title={m.regex_save_fav()}
        >★</button>
        <button class="act-btn act-clear" onclick={resetAll} title={m.regex_reset()}>
          <img src="/ui/fouriconclear.webp" width="16" height="16" alt="" aria-hidden="true" />
        </button>
        <div class="char-bar">
          <div class="char-track">
            <div
              class="char-fill"
              class:warn={charWarn}
              class:over={charOver}
              style="width: {Math.min((charCount / 250) * 100, 100)}%"
            ></div>
          </div>
          <span class="char-label" class:warn={charWarn} class:over={charOver}>
            {charCount}/250{charOver ? ` (+${charCount - 250})` : ''}
          </span>
        </div>
      </div>
      {#if showSaveFav}
        <div class="fav-save-inline">
          <input
            class="mini-input"
            bind:value={favName}
            placeholder={m.regex_fav_name_placeholder()}
            spellcheck="false"
            onkeydown={(e) => e.key === 'Enter' && confirmSaveFav()}
          />
          <button class="mini-btn" onclick={confirmSaveFav} disabled={!assembled}>
            {m.regex_save_fav()}
          </button>
          <button class="mini-btn" onclick={() => (showSaveFav = false)}>✕</button>
        </div>
      {/if}
    </div>

    <!-- Group bar: same group = OR, separate groups = AND -->
    <div class="group-bar">
      <span class="section-label">{m.regex_groups()}</span>
      <div class="group-chips">
        {#each builder.groups as g, gi (g.id)}
          <div class="group-chip" class:active={builder.activeGroup === gi}>
            <button class="group-chip-sel" onclick={() => (builder.activeGroup = gi)} type="button">
              {gi + 1}{#if g.conditions.length}<span class="group-chip-count">{g.conditions.length}</span>{/if}
            </button>
            <button class="group-chip-x" onclick={() => removeGroup(gi)} type="button" title={m.regex_group_remove()}>✕</button>
          </div>
        {/each}
        <button class="group-add" onclick={addGroup} type="button" title={m.regex_group_add()}>＋</button>
      </div>
      <span class="group-hint">{m.regex_groups_hint2()}</span>
    </div>
    {#if builder.groups[builder.activeGroup]?.conditions.length}
      <div class="active-conditions">
        {#each builder.groups[builder.activeGroup].conditions as c, ci (c.id)}
          <span class="cond-chip">
            <span class="cond-label">{affixLabel(c.name)}</span>
            <button onclick={() => removeConditionAt(builder.activeGroup, ci)} title={m.regex_group_remove()}>✕</button>
          </span>
        {/each}
      </div>
    {/if}

    <!-- Options -->
    <div class="options-panel">
      {#if !builder.loaded}
        <span class="empty-hint">{m.regex_loading()}</span>
      {:else if builder.category === 'vendor'}
        {@render vendorPanel()}
      {:else if builder.category === 'waystone'}
        {@render waystonePanel()}
      {:else if builder.category === 'tablet'}
        {@render tabletPanel()}
      {:else}
        {@render relicPanel()}
      {/if}
    </div>

    <!-- Custom text + excludes + import -->
    <div class="bottom-section">
      <div class="row-head">
        <span class="section-label">{m.regex_exclude_text()}</span>
      </div>
      <input
        class="custom-input"
        value={builder.settings[builder.category].resultSettings.excludeKeywords}
        oninput={(e) =>
          (builder.settings[builder.category].resultSettings.excludeKeywords = e.currentTarget.value)}
        placeholder={m.regex_exclude_placeholder()}
        spellcheck="false"
      />
      <div class="row-head">
        <span class="section-label">{m.regex_custom_text()}</span>
      </div>
      <input
        class="custom-input"
        value={builder.settings[builder.category].resultSettings.customText}
        oninput={(e) =>
          (builder.settings[builder.category].resultSettings.customText = e.currentTarget.value)}
        placeholder={m.regex_custom_placeholder()}
        spellcheck="false"
      />
      <div class="import-bar">
        <input
          class="custom-input"
          bind:value={importText}
          placeholder={m.regex_import_placeholder()}
          spellcheck="false"
          onkeydown={(e) => e.key === 'Enter' && loadImport()}
        />
        <button class="mini-btn" onclick={loadImport} disabled={!importText.trim()}>
          {m.regex_import_load()}
        </button>
      </div>
      <span class="import-hint">{builder.importNote || m.regex_import_hint()}</span>
    </div>
  {/if}
</div>

<!-- ────────────────────────── Reusable snippets ────────────────────────── -->

{#snippet check(obj: Record<string, unknown>, key: string, label: string)}
  <label class="opt" class:on={obj[key] as boolean}>
    <input
      type="checkbox"
      checked={obj[key] as boolean}
      onchange={(e) => (obj[key] = e.currentTarget.checked)}
    />
    <span>{label}</span>
  </label>
{/snippet}

{#snippet affixSearch()}
  <input class="custom-input" bind:value={affixFilter} placeholder="Filter mods…" spellcheck="false" />
{/snippet}

<!-- A toggleable palette option. Clicking adds it to the active group (or moves
     it here from another group); a badge shows which group it's in. -->
{#snippet paletteItem(opt: { id: number; name: string; regex: string; ranges: number[][] }, showRange: boolean)}
  {@const gi = conditionGroupOf(opt.id)}
  {@const sel = gi >= 0}
  {@const cond = sel ? findCondition(opt.id) : undefined}
  <div class="affix-row" class:active={sel}>
    {#if showRange && hasRange(opt) && cond}
      <input
        class="affix-val"
        type="text"
        placeholder={`${opt.ranges[0][0]}-${opt.ranges[0][1]}`}
        value={cond.value ?? ''}
        onclick={(e) => e.stopPropagation()}
        oninput={(e) =>
          setConditionValue(opt.id, e.currentTarget.value ? Number(e.currentTarget.value) : null)}
      />
    {/if}
    <button class="affix-name" type="button" onclick={() => toggleCondition(opt)}>
      {affixLabel(opt.name)}
    </button>
    {#if sel}<span class="grp-badge">{gi + 1}</span>{/if}
  </div>
{/snippet}

{#snippet affixGroupList(list: { id: number; name: string; regex: string; ranges: number[][] }[])}
  <div class="affix-list">
    {#each filtered(list) as opt (opt.id)}
      {@render paletteItem(opt, true)}
    {/each}
  </div>
{/snippet}

<!-- Plain (ungrouped) list for waystone "unwanted" exclusions. -->
{#snippet unwantedList(list: { id: number; name: string; regex: string; ranges: number[][] }[], arr: SelectOption[])}
  <div class="affix-list">
    {#each filtered(list) as opt (opt.id)}
      {@const sel = arrayCondition(arr, opt.id)}
      <div class="affix-row" class:excluded={!!sel}>
        {#if hasRange(opt) && sel}
          <input
            class="affix-val"
            type="text"
            placeholder={`${opt.ranges[0][0]}-${opt.ranges[0][1]}`}
            value={sel.value ?? ''}
            onclick={(e) => e.stopPropagation()}
            oninput={(e) =>
              setArrayValue(arr, opt.id, e.currentTarget.value ? Number(e.currentTarget.value) : null)}
          />
        {/if}
        <button class="affix-name" type="button" onclick={() => toggleArrayCondition(arr, opt)}>
          {affixLabel(opt.name)}
        </button>
      </div>
    {/each}
  </div>
{/snippet}

<!-- ────────────────────────── Vendor ────────────────────────── -->
{#snippet vendorPanel()}
  {@const v = builder.settings.vendor}
  {@const q = affixFilter.trim().toLowerCase()}
  {@render affixSearch()}
  <div class="opt-grid">
    {#each VENDOR_SECTIONS as section (section)}
      {@const opts = VENDOR_OPTIONS.filter((o) => o.section === section && o.label.toLowerCase().includes(q))}
      {#if opts.length}
        <div class="opt-group">
          <p class="group-label">{section}</p>
          {#each opts as o (o.id)}
            {@render paletteItem({ id: o.id, name: o.label, regex: o.regex, ranges: [] }, false)}
          {/each}
        </div>
      {/if}
    {/each}
    <div class="opt-group">
      <p class="group-label">Item level</p>
      <div class="minmax">
        <label>Min<input type="number" min="0" max="100" bind:value={v.itemLevel.min} /></label>
        <label>Max<input type="number" min="0" max="100" bind:value={v.itemLevel.max} /></label>
      </div>
      <p class="group-label">Character level</p>
      <div class="minmax">
        <label>Min<input type="number" min="0" max="100" bind:value={v.characterLevel.min} /></label>
        <label>Max<input type="number" min="0" max="100" bind:value={v.characterLevel.max} /></label>
      </div>
    </div>
  </div>
{/snippet}

<!-- ────────────────────────── Waystone ────────────────────────── -->
{#snippet waystonePanel()}
  {@const w = builder.settings.waystone}
  <div class="opt-grid">
    <div class="opt-group">
      <p class="group-label">Tier</p>
      <div class="minmax">
        <label>Min<input type="number" min="1" max="16" bind:value={w.tier.min} /></label>
        <label>Max<input type="number" min="1" max="16" bind:value={w.tier.max} /></label>
      </div>
      <p class="group-label">Quantity &amp; yield (min %)</p>
      <label class="kv">IIQ<input type="text" bind:value={w.itemQuantity} /></label>
      <label class="kv">IIR<input type="text" bind:value={w.itemRarity} /></label>
      <label class="kv">Drop chance<input type="text" bind:value={w.waystoneDropChance} /></label>
      <label class="kv">Magic monsters<input type="text" bind:value={w.magicMonsters} /></label>
      <label class="kv">Rare monsters<input type="text" bind:value={w.rareMonsters} /></label>
      <p class="group-label">State</p>
      {@render check(w.state, 'corrupted', 'Corrupted')}
      {@render check(w.state, 'uncorrupted', 'Uncorrupted')}
      {@render check(w.state, 'delirious', 'Delirious')}
      {@render check(w.modifier, 'round10', 'Round down to nearest 10 (shorter)')}
    </div>

    <div class="opt-group opt-group-wide">
      <p class="group-label">Wanted mods</p>
      {@render affixSearch()}
      {@render affixGroupList(builder.waystoneAffixes)}
    </div>

    <div class="opt-group opt-group-wide">
      <p class="group-label">Unwanted mods (excluded)</p>
      {@render unwantedList(builder.waystoneAffixes, w.modifier.unwantedMods)}
    </div>
  </div>
{/snippet}

<!-- ────────────────────────── Tablet ────────────────────────── -->
{#snippet tabletPanel()}
  {@const t = builder.settings.tablet}
  <div class="opt-grid">
    <div class="opt-group">
      <p class="group-label">Rarity</p>
      {@render check(t.rarity, 'normal', 'Normal')}
      {@render check(t.rarity, 'magic', 'Magic')}
      <p class="group-label">Type</p>
      {@render check(t.type, 'breach', 'Breach')}
      {@render check(t.type, 'delirium', 'Delirium')}
      {@render check(t.type, 'irradiated', 'Irradiated')}
      {@render check(t.type, 'expedition', 'Expedition')}
      {@render check(t.type, 'ritual', 'Ritual')}
      {@render check(t.type, 'overseer', 'Overseer')}
      <p class="group-label">Uses remaining</p>
      {@render check(t.modifier, 'usesRemaining', 'Filter by uses remaining')}
      <label class="kv">Min uses<input type="number" min="1" max="18" bind:value={t.modifier.numUsesRemaining} /></label>
      {@render check(t.modifier, 'round10', 'Round down to nearest 10 (shorter)')}
    </div>

    <div class="opt-group opt-group-wide">
      <p class="group-label">Modifiers</p>
      {@render affixSearch()}
      {@render affixGroupList(builder.tabletAffixes)}
    </div>
  </div>
{/snippet}

<!-- ────────────────────────── Relic ────────────────────────── -->
{#snippet relicPanel()}
  <div class="opt-grid">
    <div class="opt-group opt-group-wide">
      {@render affixSearch()}
      <p class="group-label">Prefixes</p>
      {@render affixGroupList(builder.relicPrefixes)}
    </div>
    <div class="opt-group opt-group-wide">
      <p class="group-label">Suffixes</p>
      {@render affixGroupList(builder.relicSuffixes)}
    </div>
  </div>
{/snippet}

<style>
  .regex-builder {
    /* Green used to flag selected/active options at a glance. */
    --c-on: #5fd98a;
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* Category tabs */
  .cat-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr) auto;
    gap: 3px;
    flex-shrink: 0;
  }
  .cat-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    padding: 5px 8px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.12s;
    text-align: center;
  }
  .cat-tab.active {
    background: color-mix(in srgb, var(--c-primary) 14%, transparent);
    border-color: color-mix(in srgb, var(--c-primary) 50%, transparent);
    color: var(--c-primary);
  }
  .cat-tab:hover:not(.active) {
    border-color: color-mix(in srgb, var(--c-accent) 42%, transparent);
    color: color-mix(in srgb, var(--c-accent) 100%, #fff 20%);
  }
  .cat-tab-fav {
    gap: 4px;
    padding: 5px 9px;
  }
  .cat-tab-fav .star {
    font-size: 13px;
    line-height: 1;
    color: color-mix(in srgb, var(--c-primary) 80%, var(--c-accent));
  }
  .cat-tab-fav.active .star {
    color: var(--c-primary);
  }
  .fav-count {
    font-size: 9px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 1px 5px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--c-primary) 22%, transparent);
    color: var(--c-primary);
  }

  /* Output */
  .output-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    background: color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent);
    border-radius: 3px;
    flex-shrink: 0;
  }
  .output-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* Single fixed-height line so the panel never reflows as the query grows;
     long patterns scroll horizontally (we cap at 250 chars anyway). */
  .output-text {
    display: block;
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: 11px;
    color: var(--c-primary);
    white-space: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    line-height: 1.5;
    height: 28px;
    padding: 2px 2px 0;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--c-accent) 45%, transparent) transparent;
  }
  .output-text::-webkit-scrollbar {
    height: 6px;
  }
  .output-text::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--c-accent) 40%, transparent);
    border-radius: 3px;
  }
  .output-text::-webkit-scrollbar-track {
    background: transparent;
  }
  .output-text.empty {
    color: color-mix(in srgb, var(--c-accent) 60%, transparent);
    font-style: italic;
  }
  .act-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    cursor: pointer;
    transition: all 0.12s;
  }
  .act-btn:hover:not(:disabled) {
    color: var(--c-primary);
    border-color: color-mix(in srgb, var(--c-primary) 40%, transparent);
  }
  .act-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .act-btn.copied {
    border-color: color-mix(in srgb, #4ade80 40%, transparent);
  }
  .copied-check {
    color: #4ade80;
    font-size: 13px;
    font-weight: 700;
  }
  .act-clear:hover:not(:disabled) {
    border-color: color-mix(in srgb, #f38d78 40%, transparent);
  }
  .act-save {
    font-size: 14px;
    line-height: 1;
    color: color-mix(in srgb, var(--c-primary) 75%, var(--c-accent));
  }
  .act-save:hover:not(:disabled) {
    color: var(--c-primary);
    border-color: color-mix(in srgb, var(--c-primary) 50%, transparent);
  }
  .act-btn img {
    display: block;
    opacity: 0.7;
    transition: opacity 0.12s;
  }
  .act-btn:hover:not(:disabled) img {
    opacity: 1;
  }

  .char-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    margin-left: 4px;
  }
  .char-track {
    flex: 1;
    height: 3px;
    background: color-mix(in srgb, var(--c-mid) 40%, transparent);
    border-radius: 2px;
    overflow: hidden;
  }
  .char-fill {
    height: 100%;
    background: color-mix(in srgb, var(--c-accent) 60%, transparent);
    border-radius: 2px;
    transition:
      width 0.15s,
      background 0.15s;
  }
  .char-fill.warn {
    background: #d97706;
  }
  .char-fill.over {
    background: #f38d78;
  }
  .char-label {
    font-size: 9.5px;
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--c-accent) 75%, transparent);
    white-space: nowrap;
  }
  .char-label.warn {
    color: #d97706;
  }
  .char-label.over {
    color: #f38d78;
    font-weight: 600;
  }

  /* Shared headings */
  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 10%);
  }
  .empty-hint {
    font-size: 11px;
    font-style: italic;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
  }

  /* Saved regex library (favorites view) */
  .fav-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .fav-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 7px 8px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    border-radius: 3px;
  }
  .fav-item-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fav-item-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--c-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fav-item-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .fav-item-actions .act-btn {
    width: 22px;
    height: 22px;
  }
  .fav-item-actions .act-clear {
    color: color-mix(in srgb, var(--c-muted) 80%, transparent);
    font-size: 11px;
  }
  .fav-item-actions .act-clear:hover {
    color: #f38d78;
  }
  .fav-item-regex {
    font-family: 'JetBrains Mono', 'Consolas', monospace;
    font-size: 10.5px;
    line-height: 1.4;
    color: color-mix(in srgb, var(--c-accent) 92%, #fff 18%);
    word-break: break-all;
  }
  .fav-cat {
    flex-shrink: 0;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--c-accent) 16%, transparent);
    color: color-mix(in srgb, var(--c-accent) 95%, #fff 20%);
  }
  .fav-save-inline {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .mini-input {
    flex: 1;
    min-width: 0;
    padding: 4px 7px;
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent);
    border-radius: 2px;
    color: var(--c-primary);
    font-size: 11px;
    outline: none;
  }
  .mini-input::placeholder {
    color: color-mix(in srgb, var(--c-accent) 60%, transparent);
  }
  .mini-btn {
    padding: 3px 9px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-accent) 92%, #fff 10%);
    font-size: 10.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .mini-btn:hover:not(:disabled) {
    color: var(--c-primary);
    border-color: color-mix(in srgb, var(--c-primary) 40%, transparent);
  }
  .mini-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* Options panel */
  .options-panel {
    flex: 1 1 auto;
    min-height: 120px;
    overflow-y: auto;
    padding: 8px;
    background: color-mix(in srgb, var(--c-bg) 96%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 14%, transparent);
    border-radius: 3px;
  }
  .opt-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
    align-items: start;
    /* Breathing room below the "Filter mods…" box so the first section labels
       (Item Rarity, Properties) don't touch it. */
    margin-top: 12px;
  }
  .opt-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .opt-group-wide {
    grid-column: span 2;
  }
  .group-label {
    margin: 10px 0 3px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-primary) 70%, var(--c-accent));
  }
  .group-label:first-child {
    margin-top: 0;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2.5px 0;
    font-size: 11.5px;
    color: color-mix(in srgb, var(--c-accent) 96%, #fff 22%);
    cursor: pointer;
  }
  .opt:hover {
    color: var(--c-primary);
  }
  /* Selected options turn green for quick at-a-glance scanning. */
  .opt.on {
    color: var(--c-on);
    font-weight: 600;
  }
  .opt input[type='checkbox'] {
    accent-color: var(--c-primary);
    cursor: pointer;
  }
  .opt.on input[type='checkbox'] {
    accent-color: var(--c-on);
  }
  .minmax {
    display: flex;
    gap: 6px;
  }
  .minmax label,
  .kv {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: color-mix(in srgb, var(--c-accent) 90%, #fff 12%);
  }
  .kv {
    justify-content: space-between;
    padding: 1.5px 0;
  }
  .minmax input,
  .kv input {
    width: 56px;
    padding: 3px 5px;
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent);
    border-radius: 2px;
    color: var(--c-primary);
    font-size: 11px;
    outline: none;
  }
  /* Group bar */
  .group-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    flex-shrink: 0;
  }
  .group-chips {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .group-chip {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid color-mix(in srgb, var(--c-accent) 30%, transparent);
    border-radius: 3px;
    overflow: hidden;
  }
  .group-chip.active {
    border-color: color-mix(in srgb, var(--c-on) 70%, transparent);
    background: color-mix(in srgb, var(--c-on) 14%, transparent);
  }
  .group-chip-sel {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--c-accent) 90%, #fff 12%);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .group-chip.active .group-chip-sel {
    color: var(--c-on);
  }
  .group-chip-count {
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    padding: 0 4px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--c-accent) 22%, transparent);
    color: var(--c-primary);
  }
  .group-chip-x {
    padding: 0 5px;
    background: transparent;
    border: none;
    border-left: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    color: color-mix(in srgb, var(--c-muted) 70%, transparent);
    font-size: 9px;
    cursor: pointer;
  }
  .group-chip-x:hover {
    color: #f38d78;
  }
  .group-add {
    padding: 2px 8px;
    background: transparent;
    border: 1px dashed color-mix(in srgb, var(--c-accent) 35%, transparent);
    border-radius: 3px;
    color: color-mix(in srgb, var(--c-accent) 85%, transparent);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }
  .group-add:hover {
    color: var(--c-primary);
    border-color: color-mix(in srgb, var(--c-primary) 45%, transparent);
  }
  .group-hint {
    font-size: 10px;
    color: color-mix(in srgb, #fff 80%, var(--c-accent));
    margin-left: auto;
  }
  .active-conditions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 50px;
    overflow-y: auto;
    flex-shrink: 0;
  }
  .cond-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 160px;
    padding: 2px 4px 2px 7px;
    background: color-mix(in srgb, var(--c-on) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--c-on) 40%, transparent);
    border-radius: 10px;
    font-size: 10px;
    color: var(--c-on);
  }
  .cond-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cond-chip button {
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--c-on) 75%, transparent);
    font-size: 9px;
    cursor: pointer;
    padding: 0 1px;
  }
  .cond-chip button:hover {
    color: #f38d78;
  }
  .grp-badge {
    flex-shrink: 0;
    min-width: 14px;
    text-align: center;
    font-size: 8.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 1px 4px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--c-on) 22%, transparent);
    color: var(--c-on);
  }

  /* Affix list */
  .affix-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid color-mix(in srgb, var(--c-accent) 12%, transparent);
    border-radius: 2px;
    padding: 2px;
  }
  .affix-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 1px 2px;
    border-radius: 2px;
  }
  .affix-row.active {
    background: color-mix(in srgb, var(--c-on) 12%, transparent);
  }
  .affix-row.excluded {
    background: color-mix(in srgb, #f38d78 12%, transparent);
  }
  .affix-row.excluded .affix-name {
    color: #f3a78d;
    font-weight: 600;
  }
  .affix-name {
    flex: 1;
    text-align: left;
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--c-accent) 94%, #fff 20%);
    font-size: 11px;
    line-height: 1.35;
    cursor: pointer;
    padding: 3px 2px;
  }
  .affix-row.active .affix-name {
    color: var(--c-on);
    font-weight: 600;
  }
  .affix-name:hover {
    color: var(--c-primary);
  }
  .affix-val {
    width: 46px;
    flex-shrink: 0;
    padding: 2px 4px;
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 40%, transparent);
    border-radius: 2px;
    color: var(--c-primary);
    font-size: 11px;
    outline: none;
  }

  /* Bottom (custom text + import) */
  .bottom-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }
  .custom-input {
    width: 100%;
    padding: 5px 8px;
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 30%, transparent);
    border-radius: 2px;
    color: var(--c-primary);
    font-family: 'JetBrains Mono', 'Consolas', monospace;
    font-size: 11px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .custom-input:focus {
    border-color: color-mix(in srgb, var(--c-accent) 55%, transparent);
  }
  .custom-input::placeholder {
    color: color-mix(in srgb, var(--c-accent) 60%, transparent);
  }
  .import-bar {
    display: flex;
    gap: 4px;
  }
  .import-bar .custom-input {
    flex: 1;
  }
  .import-hint {
    font-size: 10px;
    line-height: 1.35;
    color: color-mix(in srgb, var(--c-accent) 72%, transparent);
  }
</style>
