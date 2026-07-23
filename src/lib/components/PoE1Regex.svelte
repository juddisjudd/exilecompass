<script lang="ts">
  import { onMount } from 'svelte';
  import { m } from '$lib/paraglide/messages.js';
  import {
    builder1,
    initBuilder1,
    resetCategory,
    saveFavorite1,
    deleteFavorite1,
    toggleInArray,
  } from '$lib/regex1/builderState.svelte';
  import type { Category } from '$lib/regex1/types';
  import { GIANNA_PRESET, GIANNA_PLUS_ONE_PRESET } from '$lib/regex1/generators/heist';

  onMount(() => {
    initBuilder1();
  });

  let copied = $state(false);
  let showSaveFav = $state(false);
  let favName = $state('');
  let copiedFavId = $state<number | null>(null);
  let view = $state<'build' | 'favorites'>('build');

  // Independent search filters per list (several categories show more than
  // one searchable list at once — e.g. Items' base picker + mod picker).
  let gemFilter = $state('');
  let itemBaseFilter = $state('');
  let itemModFilter = $state('');
  let jewelPrefixFilter = $state('');
  let jewelSuffixFilter = $state('');
  let mapModGoodFilter = $state('');
  let mapModBadFilter = $state('');
  let mapNameFilter = $state('');
  let expeditionFilter = $state('');
  let flaskPrefixFilter = $state('');
  let flaskSuffixFilter = $state('');
  let beastFilter = $state('');
  let tattooFilter = $state('');
  let runegraftFilter = $state('');
  let runegraftTattooFilter = $state('');
  let scarabFilter = $state('');

  const CATEGORIES: { id: Category; label: () => string }[] = [
    { id: 'vendor', label: () => m.poe1regex_cat_vendor() },
    { id: 'items', label: () => m.poe1regex_cat_items() },
    { id: 'mapMods', label: () => m.poe1regex_cat_mapmods() },
    { id: 'mapNames', label: () => m.poe1regex_cat_mapnames() },
    { id: 'expedition', label: () => m.poe1regex_cat_expedition() },
    { id: 'heist', label: () => m.poe1regex_cat_heist() },
    { id: 'flasks', label: () => m.poe1regex_cat_flasks() },
    { id: 'beast', label: () => m.poe1regex_cat_beast() },
    { id: 'tattoo', label: () => m.poe1regex_cat_tattoo() },
    { id: 'runegraft', label: () => m.poe1regex_cat_runegraft() },
    { id: 'scarab', label: () => m.poe1regex_cat_scarab() },
    { id: 'jewel', label: () => m.poe1regex_cat_jewel() },
  ];

  const assembled = $derived(builder1.result);
  const charCount = $derived(assembled.length);
  // PoE's vendor/stash search box has a widely-cited ~50 char practical limit
  // (poe-vendor-string itself enforces 250 in one place but shows a "50
  // characters" message in another — we pick one consistent number instead
  // of carrying that mismatch forward).
  const charOver = $derived(charCount >= 50);
  const charWarn = $derived(charCount >= 40 && !charOver);

  const settings = builder1.settings;

  async function copy() {
    if (!assembled) return;
    await navigator.clipboard.writeText(assembled);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function confirmSaveFav() {
    saveFavorite1(favName);
    favName = '';
    showSaveFav = false;
  }

  async function copyFav(fav: { id: number; regex: string }) {
    await navigator.clipboard.writeText(fav.regex);
    copiedFavId = fav.id;
    setTimeout(() => (copiedFavId = null), 1500);
  }

  function matches(text: string, query: string): boolean {
    const q = query.trim().toLowerCase();
    return q === '' || text.toLowerCase().includes(q);
  }

  function heistLevel(name: string): { start: number; end: number } {
    return (settings.heist.contractLevels[name] ??= { start: 0, end: 0 });
  }

  function applyHeistPreset(preset: Record<string, { start: number; end: number }>) {
    for (const [name, level] of Object.entries(preset)) {
      settings.heist.contractLevels[name] = { ...level };
    }
  }

  function rareModValue(key: string, index: number): string {
    return settings.items.rareModValues[key]?.[index] ?? '';
  }
  function setRareModValue(key: string, index: number, value: string) {
    (settings.items.rareModValues[key] ??= {})[index] = value;
  }
</script>

<div class="regex-builder">
  <!-- Category selector -->
  <div class="cat-tabs" role="tablist" aria-label="PoE1 regex categories">
    {#each CATEGORIES as cat (cat.id)}
      <button
        class="cat-tab"
        class:active={view === 'build' && builder1.category === cat.id}
        onclick={() => {
          builder1.category = cat.id;
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
      {#if builder1.favorites.length > 0}<span class="badge badge-neutral fav-count">{builder1.favorites.length}</span>{/if}
    </button>
  </div>

  {#if view === 'favorites'}
    <div class="options-panel fav-panel ec-panel">
      {#if builder1.favorites.length === 0}
        <span class="empty-hint">{m.regex_no_favorites()}</span>
      {:else}
        {#each builder1.favorites as fav (fav.id)}
          <div class="fav-item ec-panel">
            <div class="fav-item-head">
              <span class="fav-cat">{fav.category}</span>
              <span class="fav-item-name">{fav.name}</span>
              <div class="fav-item-actions">
                <button class="act-btn" class:copied={copiedFavId === fav.id} onclick={() => copyFav(fav)} title={m.regex_copy()}>
                  {#if copiedFavId === fav.id}<span class="copied-check">✓</span>{:else}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  {/if}
                </button>
                <button class="act-btn act-clear" onclick={() => deleteFavorite1(fav.id)} title="Delete">✕</button>
              </div>
            </div>
            <code class="fav-item-regex">{fav.regex}</code>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <!-- Output -->
    <div class="output-section ec-panel">
      <code class="output-text" class:empty={!assembled}>{assembled || m.regex_placeholder_output()}</code>
      <div class="output-actions">
        <button class="act-btn" class:copied onclick={copy} disabled={!assembled} title={m.regex_copy()}>
          {#if copied}<span class="copied-check">✓</span>{:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          {/if}
        </button>
        <button class="act-btn act-save" onclick={() => (showSaveFav = !showSaveFav)} disabled={!assembled} title={m.regex_save_fav()}>★</button>
        <div class="char-bar">
          <div class="char-track">
            <div class="char-fill" class:warn={charWarn} class:over={charOver} style="width: {Math.min((charCount / 50) * 100, 100)}%"></div>
          </div>
          <span class="char-label" class:warn={charWarn} class:over={charOver}>{charCount}/50{charOver ? ` (+${charCount - 50})` : ''}</span>
        </div>
        <button class="reset-btn" onclick={() => resetCategory(builder1.category)} title={m.action_reset()}>
          <span class="reset-icon" aria-hidden="true">↺</span>
          {m.action_reset()}
        </button>
      </div>
      {#if showSaveFav}
        <div class="fav-save-inline">
          <input class="mini-input" bind:value={favName} placeholder={m.regex_fav_name_placeholder()} spellcheck="false" onkeydown={(e) => e.key === 'Enter' && confirmSaveFav()} />
          <button class="mini-btn" onclick={confirmSaveFav} disabled={!assembled}>{m.regex_save_fav()}</button>
          <button class="mini-btn" onclick={() => (showSaveFav = false)}>✕</button>
        </div>
      {/if}
    </div>

    <!-- Options -->
    <div class="options-panel ec-panel">
      {#if builder1.category === 'vendor'}
        {#if !builder1.gemTokens}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <div class="group-label">{m.poe1regex_vendor_links()}</div>
          <div class="opt-grid opt-grid-tight">
            {#snippet vc(key: keyof typeof settings.vendor.colors, label: string)}
              <label class="opt" class:on={settings.vendor.colors[key] as boolean}>
                <input type="checkbox" checked={settings.vendor.colors[key] as boolean} onchange={(e) => ((settings.vendor.colors[key] as boolean) = e.currentTarget.checked)} />
                <span>{label}</span>
              </label>
            {/snippet}
            {@render vc('rrr', 'R-R-R')}{@render vc('ggg', 'G-G-G')}{@render vc('bbb', 'B-B-B')}
            {@render vc('rrA', 'R-R-Any')}{@render vc('ggA', 'G-G-Any')}{@render vc('bbA', 'B-B-Any')}
            {@render vc('rrg', 'R-R-G')}{@render vc('rrb', 'R-R-B')}{@render vc('ggr', 'G-G-R')}
            {@render vc('ggb', 'G-G-B')}{@render vc('bbr', 'B-B-R')}{@render vc('bbg', 'B-B-G')}
            {@render vc('rgb', 'R-G-B')}
            {@render vc('raa', 'R-Any-Any')}{@render vc('gaa', 'G-Any-Any')}{@render vc('baa', 'B-Any-Any')}
            {@render vc('rr', 'R-R (2L)')}{@render vc('gg', 'G-G (2L)')}{@render vc('bb', 'B-B (2L)')}
            {@render vc('rb', 'R-B (2L)')}{@render vc('gr', 'G-R (2L)')}{@render vc('bg', 'B-G (2L)')}
          </div>
          <div class="opt-grid opt-grid-tight" style="margin-top:6px">
            {#snippet vs(key: 'anyTwoLink'|'anyThreeLink'|'anyFourLink'|'anyFiveLink'|'anySixLink'|'anyTwoColorLink'|'anyThreeColorLink'|'anyFourColorLink'|'anyFiveColorLink'|'anySixColorLink'|'anySixSocket', label: string)}
              <label class="opt" class:on={settings.vendor[key]}>
                <input type="checkbox" checked={settings.vendor[key]} onchange={(e) => (settings.vendor[key] = e.currentTarget.checked)} />
                <span>{label}</span>
              </label>
            {/snippet}
            {@render vs('anyTwoLink', 'Any 2-Link')}{@render vs('anyThreeLink', 'Any 3-Link')}{@render vs('anyFourLink', 'Any 4-Link')}
            {@render vs('anyFiveLink', 'Any 5-Link')}{@render vs('anySixLink', 'Any 6-Link')}{@render vs('anySixSocket', 'Any 6-Socket')}
            {@render vs('anyTwoColorLink', 'Any 2 Colored')}{@render vs('anyThreeColorLink', 'Any 3 Colored')}{@render vs('anyFourColorLink', 'Any 4 Colored')}
            {@render vs('anyFiveColorLink', 'Any 5 Colored')}{@render vs('anySixColorLink', 'Any 6 Colored')}
          </div>
          <label class="opt" class:on={settings.vendor.colors.specLink} style="margin-top:6px">
            <input type="checkbox" checked={settings.vendor.colors.specLink} onchange={(e) => (settings.vendor.colors.specLink = e.currentTarget.checked)} />
            <span>{m.poe1regex_vendor_speclink()}</span>
          </label>
          {#if settings.vendor.colors.specLink}
            <div class="minmax">
              <label>R <input type="number" min="0" max="6" value={settings.vendor.colors.specLinkColors.r ?? ''} oninput={(e) => (settings.vendor.colors.specLinkColors.r = e.currentTarget.value ? Number(e.currentTarget.value) : undefined)} /></label>
              <label>G <input type="number" min="0" max="6" value={settings.vendor.colors.specLinkColors.g ?? ''} oninput={(e) => (settings.vendor.colors.specLinkColors.g = e.currentTarget.value ? Number(e.currentTarget.value) : undefined)} /></label>
              <label>B <input type="number" min="0" max="6" value={settings.vendor.colors.specLinkColors.b ?? ''} oninput={(e) => (settings.vendor.colors.specLinkColors.b = e.currentTarget.value ? Number(e.currentTarget.value) : undefined)} /></label>
            </div>
          {/if}

          <div class="group-label">{m.poe1regex_vendor_movement()}</div>
          <div class="opt-grid opt-grid-tight">
            <label class="opt" class:on={settings.vendor.movement.ten}><input type="checkbox" checked={settings.vendor.movement.ten} onchange={(e) => (settings.vendor.movement.ten = e.currentTarget.checked)} /><span>10%</span></label>
            <label class="opt" class:on={settings.vendor.movement.fifteen}><input type="checkbox" checked={settings.vendor.movement.fifteen} onchange={(e) => (settings.vendor.movement.fifteen = e.currentTarget.checked)} /><span>15%</span></label>
          </div>

          <div class="group-label">{m.poe1regex_vendor_plusgems()}</div>
          <div class="opt-grid opt-grid-tight">
            {#snippet pg(key: keyof typeof settings.vendor.plusGems, label: string)}
              <label class="opt" class:on={settings.vendor.plusGems[key]}><input type="checkbox" checked={settings.vendor.plusGems[key]} onchange={(e) => (settings.vendor.plusGems[key] = e.currentTarget.checked)} /><span>{label}</span></label>
            {/snippet}
            {@render pg('any', 'Any Element')}{@render pg('fire', 'Fire')}{@render pg('cold', 'Cold')}
            {@render pg('lightning', 'Lightning')}{@render pg('chaos', 'Chaos')}{@render pg('phys', 'Phys')}
          </div>

          <div class="group-label">{m.poe1regex_vendor_damage()}</div>
          <div class="opt-grid opt-grid-tight">
            {#snippet dm(key: keyof typeof settings.vendor.damage, label: string)}
              <label class="opt" class:on={settings.vendor.damage[key]}><input type="checkbox" checked={settings.vendor.damage[key]} onchange={(e) => (settings.vendor.damage[key] = e.currentTarget.checked)} /><span>{label}</span></label>
            {/snippet}
            {@render dm('phys', 'Phys (Glint/Heavy)')}{@render dm('firemult', 'Fire DoT Mult')}
            {@render dm('coldmult', 'Cold DoT Mult')}{@render dm('chaosmult', 'Chaos DoT Mult')}
          </div>

          <div class="group-label">{m.poe1regex_vendor_weapon()}</div>
          <div class="opt-grid opt-grid-tight">
            {#snippet wp(key: keyof typeof settings.vendor.weapon, label: string)}
              <label class="opt" class:on={settings.vendor.weapon[key]}><input type="checkbox" checked={settings.vendor.weapon[key]} onchange={(e) => (settings.vendor.weapon[key] = e.currentTarget.checked)} /><span>{label}</span></label>
            {/snippet}
            {@render wp('sceptre', 'Sceptre')}{@render wp('mace', 'Mace')}{@render wp('axe', 'Axe')}
            {@render wp('sword', 'Sword')}{@render wp('bow', 'Bow')}{@render wp('claw', 'Claw')}
            {@render wp('dagger', 'Dagger')}{@render wp('staff', 'Staff')}{@render wp('wand', 'Wand')}
            {@render wp('shield', 'Shield')}
          </div>
          <p class="field-help-inline">{m.poe1regex_vendor_weapon_warning()}</p>

          <div class="group-label">{m.poe1regex_vendor_gems()}</div>
          <input class="custom-input" bind:value={gemFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
          <div class="pick-list">
            {#each builder1.gemTokens.filter((t) => matches(t.rawText, gemFilter)) as token (token.id)}
              <button type="button" class="pick-row" class:on={settings.vendor.gems.includes(token.id)} onclick={() => toggleInArray(settings.vendor.gems, token.id)}>
                <span class="gem-color gem-{token.options.c}"></span>{token.rawText}
              </button>
            {/each}
          </div>
        {/if}

      {:else if builder1.category === 'items'}
        {#if !builder1.itemBases || !builder1.itemMods || !builder1.affixMap}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <div class="group-label">{m.poe1regex_items_base()}</div>
          <input class="custom-input" bind:value={itemBaseFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
          <div class="pick-list">
            {#each builder1.itemBases.flatMap((b) => b.items.map((item) => ({ baseType: b.name, item }))).filter((e) => matches(`${e.baseType} ${e.item}`, itemBaseFilter)) as entry (entry.baseType + '::' + entry.item)}
              <button
                type="button"
                class="pick-row"
                class:on={settings.items.baseType === entry.baseType && settings.items.item === entry.item}
                onclick={() => { settings.items.baseType = entry.baseType; settings.items.item = entry.item; }}
              >{entry.item} <span class="pick-row-sub">— {entry.baseType}</span></button>
            {/each}
          </div>

          {#if settings.items.baseType}
            <div class="seg-row" style="margin-top:8px">
              <button class="seg-btn" class:active={settings.items.rarity === 'rare'} onclick={() => (settings.items.rarity = 'rare')} type="button">{m.poe1regex_items_rarity_rare()}</button>
              <button class="seg-btn" class:active={settings.items.rarity === 'magic'} onclick={() => (settings.items.rarity = 'magic')} type="button">{m.poe1regex_items_rarity_magic()}</button>
            </div>

            {#if settings.items.rarity === 'rare'}
              <div class="seg-row" style="margin-top:6px">
                <button class="seg-btn" class:active={settings.items.rareMatchMode === 'all'} onclick={() => (settings.items.rareMatchMode = 'all')} type="button">{m.poe1regex_items_match_all()}</button>
                <button class="seg-btn" class:active={settings.items.rareMatchMode === 'any'} onclick={() => (settings.items.rareMatchMode = 'any')} type="button">{m.poe1regex_items_match_any()}</button>
                <button class="seg-btn" class:active={settings.items.rareMatchMode === 'prefixAndSuffix'} onclick={() => (settings.items.rareMatchMode = 'prefixAndSuffix')} type="button">{m.poe1regex_items_match_prefix_suffix()}</button>
              </div>
              <input class="custom-input" bind:value={itemModFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" style="margin-top:6px" />
              <div class="pick-list pick-list-tall">
                {#each Object.values(builder1.affixMap).filter((mod) => mod.baseType === settings.items.baseType && matches(mod.desc, itemModFilter)) as mod (mod.key)}
                  {@const selected = !!settings.items.selectedRareMods[mod.key]}
                  <div class="mod-row" class:on={selected}>
                    <label class="opt" class:on={selected}>
                      <input type="checkbox" checked={selected} onchange={(e) => (settings.items.selectedRareMods[mod.key] = e.currentTarget.checked)} />
                      <span>{mod.desc}<span class="pick-row-sub"> · {mod.affixtype}</span></span>
                    </label>
                    {#if selected && mod.stats.some((_, i) => !mod.disabled.includes(i))}
                      <div class="stat-inputs">
                        {#each mod.stats as stat, i (i)}
                          {#if !mod.disabled.includes(i)}
                            <input class="stat-input" type="text" placeholder={`${stat.min}-${stat.max}`} value={rareModValue(mod.key, i)} oninput={(e) => setRareModValue(mod.key, i, e.currentTarget.value)} />
                          {/if}
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="seg-row" style="margin-top:6px">
                <button class="seg-btn" class:active={settings.items.magicMatchMode === 'any'} onclick={() => (settings.items.magicMatchMode = 'any')} type="button">{m.poe1regex_items_magic_any()}</button>
                <button class="seg-btn" class:active={settings.items.magicMatchMode === 'prefixAndSuffix'} onclick={() => (settings.items.magicMatchMode = 'prefixAndSuffix')} type="button">{m.poe1regex_items_magic_both()}</button>
                <button class="seg-btn" class:active={settings.items.magicMatchMode === 'openAffix'} onclick={() => (settings.items.magicMatchMode = 'openAffix')} type="button">{m.poe1regex_items_magic_open()}</button>
              </div>
              <input class="custom-input" bind:value={itemModFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" style="margin-top:6px" />
              <div class="pick-list pick-list-tall">
                {#each Object.values(builder1.affixMap).filter((mod) => mod.baseType === settings.items.baseType && matches(mod.desc, itemModFilter)) as mod (mod.key)}
                  {@const selected = !!settings.items.selectedMagicMods[mod.key]}
                  <label class="opt" class:on={selected}>
                    <input type="checkbox" checked={selected} onchange={(e) => (settings.items.selectedMagicMods[mod.key] = e.currentTarget.checked)} />
                    <span>{mod.desc}<span class="pick-row-sub"> · {mod.affixtype}</span></span>
                  </label>
                {/each}
              </div>
            {/if}
          {/if}
        {/if}

      {:else if builder1.category === 'jewel'}
        {#if !builder1.jewelData}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <div class="seg-row">
            <button class="seg-btn" class:active={!settings.jewel.abyssJewel} onclick={() => (settings.jewel.abyssJewel = false)} type="button">{m.poe1regex_jewel_type_regular()}</button>
            <button class="seg-btn" class:active={settings.jewel.abyssJewel} onclick={() => (settings.jewel.abyssJewel = true)} type="button">{m.poe1regex_jewel_type_abyss()}</button>
          </div>
          <label class="opt" class:on={settings.jewel.magicOnly} style="margin-top:6px">
            <input type="checkbox" checked={settings.jewel.magicOnly} onchange={(e) => (settings.jewel.magicOnly = e.currentTarget.checked)} />
            <span>{m.poe1regex_jewel_magic_only()}</span>
          </label>
          {#if settings.jewel.magicOnly}
            <label class="opt" class:on={settings.jewel.matchBothPrefixAndSuffix}>
              <input type="checkbox" checked={settings.jewel.matchBothPrefixAndSuffix} onchange={(e) => (settings.jewel.matchBothPrefixAndSuffix = e.currentTarget.checked)} />
              <span>{m.poe1regex_jewel_both()}</span>
            </label>
            <label class="opt" class:on={settings.jewel.matchOpenPrefixSuffix}>
              <input type="checkbox" checked={settings.jewel.matchOpenPrefixSuffix} onchange={(e) => (settings.jewel.matchOpenPrefixSuffix = e.currentTarget.checked)} />
              <span>{m.poe1regex_jewel_open()}</span>
            </label>
          {:else}
            <label class="opt" class:on={settings.jewel.allMatch}>
              <input type="checkbox" checked={settings.jewel.allMatch} onchange={(e) => (settings.jewel.allMatch = e.currentTarget.checked)} />
              <span>{m.poe1regex_jewel_match_all()}</span>
            </label>
          {/if}

          {#each [{ prefix: true, label: m.poe1regex_jewel_prefix(), filter: jewelPrefixFilter, setFilter: (v: string) => (jewelPrefixFilter = v) }, { prefix: false, label: m.poe1regex_jewel_suffix(), filter: jewelSuffixFilter, setFilter: (v: string) => (jewelSuffixFilter = v) }] as col (col.prefix ? 'p' : 's')}
            {@const pool = (settings.jewel.abyssJewel ? builder1.jewelData.jewelAbyss : builder1.jewelData.jewelRegular).filter((j) => j.isPrefix === col.prefix)}
            {@const selectedArr = settings.jewel.abyssJewel ? settings.jewel.selectedAbyss : settings.jewel.selectedRegular}
            <div class="group-label">{col.label}</div>
            <input class="custom-input" value={col.filter} oninput={(e) => col.setFilter(e.currentTarget.value)} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
            <div class="pick-list">
              {#each pool.filter((j) => matches(j.mod, col.filter)) as j (j.mod)}
                <button type="button" class="pick-row" class:on={selectedArr.includes(j.mod)} onclick={() => toggleInArray(selectedArr, j.mod)}>{j.mod}</button>
              {/each}
            </div>
          {/each}
        {/if}

      {:else if builder1.category === 'mapMods'}
        {#if !builder1.mapModsData}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <label class="opt" class:on={settings.mapMods.displayNightmareMods}>
            <input type="checkbox" checked={settings.mapMods.displayNightmareMods} onchange={(e) => (settings.mapMods.displayNightmareMods = e.currentTarget.checked)} />
            <span>{m.poe1regex_mapmods_nightmare()}</span>
          </label>

          <div class="group-label">{m.poe1regex_mapmods_good()}</div>
          <div class="seg-row">
            <button class="seg-btn" class:active={settings.mapMods.allGoodMods} onclick={() => (settings.mapMods.allGoodMods = true)} type="button">{m.poe1regex_mapmods_good_all()}</button>
            <button class="seg-btn" class:active={!settings.mapMods.allGoodMods} onclick={() => (settings.mapMods.allGoodMods = false)} type="button">{m.poe1regex_mapmods_good_any()}</button>
          </div>
          <input class="custom-input" bind:value={mapModGoodFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
          <div class="pick-list">
            {#each builder1.mapModsData.tokens.filter((t) => (settings.mapMods.displayNightmareMods || !t.options.nm) && matches(t.rawText, mapModGoodFilter)) as t (t.id)}
              <button type="button" class="pick-row" class:on={settings.mapMods.goodIds.includes(t.id)} onclick={() => toggleInArray(settings.mapMods.goodIds, t.id)}>{t.rawText}</button>
            {/each}
          </div>

          <div class="group-label">{m.poe1regex_mapmods_bad()}</div>
          <input class="custom-input" bind:value={mapModBadFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
          <div class="pick-list">
            {#each builder1.mapModsData.tokens.filter((t) => (settings.mapMods.displayNightmareMods || !t.options.nm) && matches(t.rawText, mapModBadFilter)) as t (t.id)}
              <button type="button" class="pick-row" class:on={settings.mapMods.badIds.includes(t.id)} onclick={() => toggleInArray(settings.mapMods.badIds, t.id)}>{t.rawText}</button>
            {/each}
          </div>

          <div class="group-label">{m.poe1regex_mapmods_structural()}</div>
          <div class="kv"><span>{m.poe1regex_mapmods_quantity()}</span><input type="text" bind:value={settings.mapMods.quantity} /></div>
          <div class="kv"><span>{m.poe1regex_mapmods_packsize()}</span><input type="text" bind:value={settings.mapMods.packsize} /></div>
          <div class="kv"><span>{m.poe1regex_mapmods_dropchance()}</span><input type="text" bind:value={settings.mapMods.mapDropChance} /></div>
          <div class="kv"><span>{m.poe1regex_mapmods_itemrarity()}</span><input type="text" bind:value={settings.mapMods.itemRarity} /></div>
          <label class="opt" class:on={settings.mapMods.optimizeQuant}>
            <input type="checkbox" checked={settings.mapMods.optimizeQuant} onchange={(e) => (settings.mapMods.optimizeQuant = e.currentTarget.checked)} />
            <span>{m.poe1regex_mapmods_optimize()}</span>
          </label>
          <div class="kv"><span>{m.poe1regex_mapmods_packsize()} ({m.poe1regex_mapmods_optimize()})</span>
            <input type="checkbox" checked={settings.mapMods.optimizePacksize} onchange={(e) => (settings.mapMods.optimizePacksize = e.currentTarget.checked)} />
          </div>

          <div class="group-label">{m.poe1regex_mapmods_rarity()}</div>
          <div class="opt-grid opt-grid-tight">
            <label class="opt" class:on={settings.mapMods.filterRarity.normal}><input type="checkbox" checked={settings.mapMods.filterRarity.normal} onchange={(e) => (settings.mapMods.filterRarity.normal = e.currentTarget.checked)} /><span>Normal</span></label>
            <label class="opt" class:on={settings.mapMods.filterRarity.magic}><input type="checkbox" checked={settings.mapMods.filterRarity.magic} onchange={(e) => (settings.mapMods.filterRarity.magic = e.currentTarget.checked)} /><span>Magic</span></label>
            <label class="opt" class:on={settings.mapMods.filterRarity.rare}><input type="checkbox" checked={settings.mapMods.filterRarity.rare} onchange={(e) => (settings.mapMods.filterRarity.rare = e.currentTarget.checked)} /><span>Rare</span></label>
          </div>
          <div class="seg-row">
            <button class="seg-btn" class:active={settings.mapMods.rarityInclude} onclick={() => (settings.mapMods.rarityInclude = true)} type="button">{m.poe1regex_mapmods_include()}</button>
            <button class="seg-btn" class:active={!settings.mapMods.rarityInclude} onclick={() => (settings.mapMods.rarityInclude = false)} type="button">{m.poe1regex_mapmods_exclude()}</button>
          </div>

          <div class="opt-grid" style="margin-top:6px">
            <div class="opt-group">
              <label class="opt" class:on={settings.mapMods.filterCorrupted}><input type="checkbox" checked={settings.mapMods.filterCorrupted} onchange={(e) => (settings.mapMods.filterCorrupted = e.currentTarget.checked)} /><span>{m.poe1regex_mapmods_corrupted()}</span></label>
              {#if settings.mapMods.filterCorrupted}
                <div class="seg-row">
                  <button class="seg-btn" class:active={settings.mapMods.corruptedInclude} onclick={() => (settings.mapMods.corruptedInclude = true)} type="button">{m.poe1regex_mapmods_include()}</button>
                  <button class="seg-btn" class:active={!settings.mapMods.corruptedInclude} onclick={() => (settings.mapMods.corruptedInclude = false)} type="button">{m.poe1regex_mapmods_exclude()}</button>
                </div>
              {/if}
            </div>
            <div class="opt-group">
              <label class="opt" class:on={settings.mapMods.filterUnidentified}><input type="checkbox" checked={settings.mapMods.filterUnidentified} onchange={(e) => (settings.mapMods.filterUnidentified = e.currentTarget.checked)} /><span>{m.poe1regex_mapmods_unidentified()}</span></label>
              {#if settings.mapMods.filterUnidentified}
                <div class="seg-row">
                  <button class="seg-btn" class:active={settings.mapMods.unidentifiedInclude} onclick={() => (settings.mapMods.unidentifiedInclude = true)} type="button">{m.poe1regex_mapmods_include()}</button>
                  <button class="seg-btn" class:active={!settings.mapMods.unidentifiedInclude} onclick={() => (settings.mapMods.unidentifiedInclude = false)} type="button">{m.poe1regex_mapmods_exclude()}</button>
                </div>
              {/if}
            </div>
          </div>

          <div class="group-label">{m.poe1regex_mapmods_quality()}</div>
          <div class="kv"><span>Regular</span><input type="text" bind:value={settings.mapMods.quality.regular} /></div>
          <div class="kv"><span>Currency</span><input type="text" bind:value={settings.mapMods.quality.currency} /></div>
          <div class="kv"><span>Divination</span><input type="text" bind:value={settings.mapMods.quality.divination} /></div>
          <div class="kv"><span>Rarity</span><input type="text" bind:value={settings.mapMods.quality.rarity} /></div>
          <div class="kv"><span>Pack Size</span><input type="text" bind:value={settings.mapMods.quality.packSize} /></div>
          <div class="kv"><span>Scarab</span><input type="text" bind:value={settings.mapMods.quality.scarab} /></div>
          <label class="opt" class:on={settings.mapMods.optimizeQuality}><input type="checkbox" checked={settings.mapMods.optimizeQuality} onchange={(e) => (settings.mapMods.optimizeQuality = e.currentTarget.checked)} /><span>{m.poe1regex_mapmods_optimize()}</span></label>
          <label class="opt" class:on={settings.mapMods.anyQuality}><input type="checkbox" checked={settings.mapMods.anyQuality} onchange={(e) => (settings.mapMods.anyQuality = e.currentTarget.checked)} /><span>{m.poe1regex_mapmods_quality_any()}</span></label>
        {/if}

      {:else if builder1.category === 'mapNames'}
        {#if !builder1.mapNamesData}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <label class="opt" class:on={settings.mapNames.mapTabSearch}>
            <input type="checkbox" checked={settings.mapNames.mapTabSearch} onchange={(e) => (settings.mapNames.mapTabSearch = e.currentTarget.checked)} />
            <span>{m.poe1regex_mapnames_tabsearch()}</span>
          </label>
          <input class="custom-input" bind:value={mapNameFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
          <div class="pick-list pick-list-tall">
            {#each Object.entries(builder1.mapNamesData).filter(([, v]) => matches(v.name, mapNameFilter)) as [key, v] (key)}
              <button type="button" class="pick-row" class:on={settings.mapNames.selected.includes(key)} onclick={() => toggleInArray(settings.mapNames.selected, key)}>{v.name}</button>
            {/each}
          </div>
        {/if}

      {:else if builder1.category === 'expedition'}
        {#if !builder1.expeditionData}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <p class="field-help-inline">{m.poe1regex_expedition_hint()}</p>
          <input class="custom-input" bind:value={expeditionFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
          <div class="pick-list pick-list-tall">
            {#each Object.entries(builder1.expeditionData).filter(([key, v]) => matches(key, expeditionFilter) || v.items.some((i) => matches(i.name, expeditionFilter))) as [key, v] (key)}
              <button type="button" class="pick-row" class:on={settings.expedition.selectedBaseTypes.includes(key)} onclick={() => toggleInArray(settings.expedition.selectedBaseTypes, key)}>
                {key}<span class="pick-row-sub"> — {v.items.map((i) => i.name).join(', ')}</span>
              </button>
            {/each}
          </div>
        {/if}

      {:else if builder1.category === 'heist'}
        {#if !builder1.heistData}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <div class="seg-row">
            <button class="seg-btn" onclick={() => applyHeistPreset(GIANNA_PRESET)} type="button">{m.poe1regex_heist_preset_gianna()}</button>
            <button class="seg-btn" onclick={() => applyHeistPreset(GIANNA_PLUS_ONE_PRESET)} type="button">{m.poe1regex_heist_preset_gianna_plus1()}</button>
          </div>
          {#each Object.keys(builder1.heistData.heistContractTypes) as name (name)}
            <div class="kv">
              <span>{name}</span>
              <div class="minmax">
                <label>Min <input type="number" min="0" max="6" value={heistLevel(name).start} oninput={(e) => (heistLevel(name).start = Number(e.currentTarget.value))} /></label>
                <label>Max <input type="number" min="0" max="6" value={heistLevel(name).end} oninput={(e) => (heistLevel(name).end = Number(e.currentTarget.value))} /></label>
              </div>
            </div>
          {/each}
          <div class="kv" style="margin-top:6px"><span>{m.poe1regex_heist_target()}</span><input type="number" min="0" bind:value={settings.heist.targetValue} /></div>
          <label class="opt" class:on={settings.heist.requireCoinValue}>
            <input type="checkbox" checked={settings.heist.requireCoinValue} onchange={(e) => (settings.heist.requireCoinValue = e.currentTarget.checked)} />
            <span>{m.poe1regex_heist_require_both()}</span>
          </label>
        {/if}

      {:else if builder1.category === 'flasks'}
        {#if !builder1.flaskModsData}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <div class="kv"><span>{m.poe1regex_flasks_itemlevel()}</span><input type="number" min="1" max="100" bind:value={settings.flasks.itemLevel} /></div>
          <label class="opt" class:on={settings.flasks.matchBothPrefixAndSuffix}><input type="checkbox" checked={settings.flasks.matchBothPrefixAndSuffix} onchange={(e) => (settings.flasks.matchBothPrefixAndSuffix = e.currentTarget.checked)} /><span>{m.poe1regex_flasks_both()}</span></label>
          <label class="opt" class:on={settings.flasks.matchOpenPrefixSuffix}><input type="checkbox" checked={settings.flasks.matchOpenPrefixSuffix} onchange={(e) => (settings.flasks.matchOpenPrefixSuffix = e.currentTarget.checked)} /><span>{m.poe1regex_flasks_open()}</span></label>
          <label class="opt" class:on={settings.flasks.ignoreEffectTiers}><input type="checkbox" checked={settings.flasks.ignoreEffectTiers} onchange={(e) => (settings.flasks.ignoreEffectTiers = e.currentTarget.checked)} /><span>{m.poe1regex_flasks_ignore_effect()}</span></label>

          {#each [{ prefix: true, label: m.poe1regex_jewel_prefix(), list: builder1.flaskModsData.flaskPrefix, selected: settings.flasks.selectedPrefix, filter: flaskPrefixFilter, setFilter: (v: string) => (flaskPrefixFilter = v), onlyMax: settings.flasks.onlyMaxPrefixTierMod, setOnlyMax: (v: boolean) => (settings.flasks.onlyMaxPrefixTierMod = v) }, { prefix: false, label: m.poe1regex_jewel_suffix(), list: builder1.flaskModsData.flaskSuffix, selected: settings.flasks.selectedSuffix, filter: flaskSuffixFilter, setFilter: (v: string) => (flaskSuffixFilter = v), onlyMax: settings.flasks.onlyMaxSuffixTierMod, setOnlyMax: (v: boolean) => (settings.flasks.onlyMaxSuffixTierMod = v) }] as col (col.prefix ? 'p' : 's')}
            <div class="group-label">{col.label}</div>
            <label class="opt" class:on={col.onlyMax}><input type="checkbox" checked={col.onlyMax} onchange={(e) => col.setOnlyMax(e.currentTarget.checked)} /><span>{col.prefix ? m.poe1regex_flasks_only_max_prefix() : m.poe1regex_flasks_only_max_suffix()}</span></label>
            <input class="custom-input" value={col.filter} oninput={(e) => col.setFilter(e.currentTarget.value)} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
            <div class="pick-list">
              {#each col.list.filter((g) => g.mods.some((mm) => mm.level <= settings.flasks.itemLevel) && matches(g.description, col.filter)) as g (g.description)}
                <button type="button" class="pick-row" class:on={col.selected.includes(g.description)} onclick={() => toggleInArray(col.selected, g.description)}>{g.description}</button>
              {/each}
            </div>
          {/each}
        {/if}

      {:else if builder1.category === 'beast'}
        {#if !builder1.beasts}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <label class="opt" class:on={settings.beast.includeHarvest}><input type="checkbox" checked={settings.beast.includeHarvest} onchange={(e) => (settings.beast.includeHarvest = e.currentTarget.checked)} /><span>{m.poe1regex_beast_harvest()}</span></label>
          <label class="opt" class:on={settings.beast.redBeastsOnly}><input type="checkbox" checked={settings.beast.redBeastsOnly} onchange={(e) => (settings.beast.redBeastsOnly = e.currentTarget.checked)} /><span>{m.poe1regex_beast_red()}</span></label>
          <input class="custom-input" bind:value={beastFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
          <div class="pick-list pick-list-tall">
            {#each builder1.beasts.filter((b) => (settings.beast.includeHarvest || !b.harvest) && (!settings.beast.redBeastsOnly || b.red) && matches(b.beast, beastFilter)) as b (b.beast)}
              <button type="button" class="pick-row" class:on={settings.beast.selected.includes(b.beast)} onclick={() => toggleInArray(settings.beast.selected, b.beast)}>{b.beast}</button>
            {/each}
          </div>
        {/if}

      {:else if builder1.category === 'tattoo'}
        {#if !builder1.tattoos}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <input class="custom-input" bind:value={tattooFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
          <div class="pick-list pick-list-tall">
            {#each builder1.tattoos.filter((t) => matches(`${t.tattoo} ${t.description}`, tattooFilter)) as t (t.tattoo)}
              <button type="button" class="pick-row" class:on={settings.tattoo.selected.includes(t.tattoo)} onclick={() => toggleInArray(settings.tattoo.selected, t.tattoo)}>{t.tattoo}<span class="pick-row-sub"> — {t.description}</span></button>
            {/each}
          </div>
        {/if}

      {:else if builder1.category === 'runegraft'}
        {#if !builder1.runegrafts}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <input class="custom-input" bind:value={runegraftFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
          <div class="pick-list">
            {#each builder1.runegrafts.filter((r) => matches(`${r.runegraft} ${r.description}`, runegraftFilter)) as r (r.runegraft)}
              <button type="button" class="pick-row" class:on={settings.runegraft.selected.includes(r.runegraft)} onclick={() => toggleInArray(settings.runegraft.selected, r.runegraft)}>{r.runegraft}<span class="pick-row-sub"> — {r.description}</span></button>
            {/each}
          </div>
          <label class="opt" class:on={settings.runegraft.includeTattoos} style="margin-top:6px">
            <input type="checkbox" checked={settings.runegraft.includeTattoos} onchange={(e) => (settings.runegraft.includeTattoos = e.currentTarget.checked)} />
            <span>{m.poe1regex_runegraft_include_tattoos()}</span>
          </label>
          {#if settings.runegraft.includeTattoos && builder1.tattoos}
            <input class="custom-input" bind:value={runegraftTattooFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
            <div class="pick-list">
              {#each builder1.tattoos.filter((t) => matches(`${t.tattoo} ${t.description}`, runegraftTattooFilter)) as t (t.tattoo)}
                <button type="button" class="pick-row" class:on={settings.runegraft.selectedTattoos.includes(t.tattoo)} onclick={() => toggleInArray(settings.runegraft.selectedTattoos, t.tattoo)}>{t.tattoo}<span class="pick-row-sub"> — {t.description}</span></button>
              {/each}
            </div>
          {/if}
        {/if}

      {:else if builder1.category === 'scarab'}
        {#if !builder1.scarabs}
          <span class="empty-hint">{m.regex_loading()}</span>
        {:else}
          <input class="custom-input" bind:value={scarabFilter} placeholder={m.poe1regex_search_placeholder()} spellcheck="false" />
          <div class="pick-list pick-list-tall">
            {#each Object.entries(builder1.scarabs).filter(([, v]) => matches(v.name, scarabFilter)) as [key, v] (key)}
              <button type="button" class="pick-row" class:on={settings.scarab.selected.includes(key)} onclick={() => toggleInArray(settings.scarab.selected, key)}>{v.name}<span class="pick-row-sub"> — {v.description}</span></button>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .regex-builder {
    --c-on: var(--c-success);
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .cat-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    flex-shrink: 0;
  }
  .cat-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 26px;
    padding: 4px 7px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: var(--radius);
    color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
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
    padding: 4px 8px;
  }
  .cat-tab-fav .star {
    font-size: 12px;
    line-height: 1;
    color: color-mix(in srgb, var(--c-primary) 80%, var(--c-accent));
  }
  .cat-tab-fav.active .star {
    color: var(--c-primary);
  }
  .fav-count {
    padding: 0 5px;
    font-size: 9px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--c-primary);
    border-color: color-mix(in srgb, var(--c-primary) 40%, transparent);
    background: color-mix(in srgb, var(--c-primary) 22%, transparent);
  }

  .output-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    flex-shrink: 0;
  }
  .output-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .output-text {
    display: block;
    font-family: 'Fira Mono', ui-monospace, monospace;
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
  .output-text::-webkit-scrollbar { height: 6px; }
  .output-text::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--c-accent) 40%, transparent); border-radius: var(--radius); }
  .output-text::-webkit-scrollbar-track { background: transparent; }
  .output-text.empty { color: color-mix(in srgb, var(--c-accent) 60%, transparent); font-style: italic; }

  .act-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: var(--radius);
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    cursor: pointer;
    transition: all 0.12s;
  }
  .act-btn:hover:not(:disabled) { color: var(--c-primary); border-color: color-mix(in srgb, var(--c-primary) 40%, transparent); }
  .act-btn:disabled { opacity: 0.3; cursor: default; }
  .act-btn.copied { border-color: color-mix(in srgb, var(--c-success) 40%, transparent); }
  .copied-check { color: var(--c-success); font-size: 13px; font-weight: 700; }
  .act-clear:hover:not(:disabled) { border-color: color-mix(in srgb, var(--c-red) 40%, transparent); }
  .act-save { font-size: 14px; line-height: 1; color: color-mix(in srgb, var(--c-primary) 75%, var(--c-accent)); }
  .act-save:hover:not(:disabled) { color: var(--c-primary); border-color: color-mix(in srgb, var(--c-primary) 50%, transparent); }
  .act-btn svg { display: block; opacity: 0.7; transition: opacity 0.12s; }
  .act-btn:hover:not(:disabled) svg { opacity: 1; }

  .char-bar { display: flex; align-items: center; gap: 6px; flex: 1; margin-left: 4px; }
  .reset-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 9px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-red) 32%, transparent);
    border-radius: var(--radius);
    color: color-mix(in srgb, var(--c-red) 82%, var(--c-accent));
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.12s;
  }
  .reset-btn:hover { background: color-mix(in srgb, var(--c-red) 14%, transparent); border-color: color-mix(in srgb, var(--c-red) 55%, transparent); color: var(--c-red-bright); }
  .reset-icon { font-size: 13px; line-height: 1; }
  .char-track { flex: 1; height: 3px; background: color-mix(in srgb, var(--c-mid) 40%, transparent); border-radius: var(--radius); overflow: hidden; }
  .char-fill { height: 100%; background: color-mix(in srgb, var(--c-accent) 60%, transparent); border-radius: var(--radius); transition: width 0.15s, background 0.15s; }
  .char-fill.warn { background: #d97706; }
  .char-fill.over { background: var(--c-red); }
  .char-label { font-size: 9.5px; font-variant-numeric: tabular-nums; color: color-mix(in srgb, var(--c-accent) 75%, transparent); white-space: nowrap; }
  .char-label.warn { color: #d97706; }
  .char-label.over { color: var(--c-red-bright); font-weight: 600; }

  .empty-hint { font-size: 11px; font-style: italic; color: color-mix(in srgb, var(--c-accent) 70%, transparent); }
  .field-help-inline { font-size: 10.5px; color: color-mix(in srgb, var(--c-accent) 75%, transparent); margin: 2px 0 4px; }

  .fav-panel { display: flex; flex-direction: column; gap: 6px; }
  .fav-item { display: flex; flex-direction: column; gap: 4px; padding: 7px 8px; }
  .fav-item-head { display: flex; align-items: center; gap: 8px; }
  .fav-item-name { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--c-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fav-item-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .fav-item-actions .act-btn { width: 22px; height: 22px; }
  .fav-item-actions .act-clear { color: color-mix(in srgb, var(--c-muted) 80%, transparent); font-size: 11px; }
  .fav-item-actions .act-clear:hover { color: var(--c-red-bright); }
  .fav-item-regex { font-family: 'Fira Mono', ui-monospace, monospace; font-size: 10.5px; line-height: 1.4; color: color-mix(in srgb, var(--c-accent) 92%, #fff 18%); word-break: break-all; }
  .fav-cat { flex-shrink: 0; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 6px; border-radius: var(--radius); background: color-mix(in srgb, var(--c-accent) 16%, transparent); color: color-mix(in srgb, var(--c-accent) 95%, #fff 20%); }
  .fav-save-inline { display: flex; align-items: center; gap: 4px; }
  .mini-input { flex: 1; min-width: 0; padding: 4px 7px; background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid)); border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent); border-radius: var(--radius); color: var(--c-primary); font-size: 11px; outline: none; }
  .mini-input::placeholder { color: color-mix(in srgb, var(--c-accent) 60%, transparent); }
  .mini-btn { padding: 3px 9px; background: transparent; border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent); border-radius: var(--radius); color: color-mix(in srgb, var(--c-accent) 92%, #fff 10%); font-size: 10.5px; font-weight: 600; cursor: pointer; transition: all 0.12s; white-space: nowrap; }
  .mini-btn:hover:not(:disabled) { color: var(--c-primary); border-color: color-mix(in srgb, var(--c-primary) 40%, transparent); }
  .mini-btn:disabled { opacity: 0.3; cursor: default; }

  .options-panel { flex: 1 1 auto; min-height: 120px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 2px; }
  .group-label { margin: 10px 0 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: color-mix(in srgb, var(--c-primary) 70%, var(--c-accent)); }
  .group-label:first-child { margin-top: 0; }
  .opt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 4px 10px; align-items: start; }
  .opt-grid-tight { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
  .opt-group { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .opt { display: flex; align-items: center; gap: 6px; padding: 2.5px 0; font-size: 11.5px; color: color-mix(in srgb, var(--c-accent) 96%, #fff 22%); cursor: pointer; }
  .opt:hover { color: var(--c-primary); }
  .opt.on { color: var(--c-on); font-weight: 600; }
  .opt input[type='checkbox'] { accent-color: var(--c-primary); cursor: pointer; }
  .opt.on input[type='checkbox'] { accent-color: var(--c-on); }

  .minmax { display: flex; gap: 6px; }
  .minmax label, .kv { display: flex; align-items: center; gap: 4px; font-size: 11px; color: color-mix(in srgb, var(--c-accent) 90%, #fff 12%); }
  .kv { justify-content: space-between; padding: 1.5px 0; }
  .minmax input, .kv input[type='text'], .kv input[type='number'] {
    width: 70px;
    padding: 3px 5px;
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent);
    border-radius: var(--radius);
    color: var(--c-primary);
    font-size: 11px;
    outline: none;
  }

  .seg-row { display: flex; flex-wrap: wrap; gap: 3px; }
  .seg-btn {
    padding: 3px 8px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-accent) 32%, transparent);
    border-radius: var(--radius);
    color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%);
    font-size: 10.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s;
  }
  .seg-btn.active { background: color-mix(in srgb, var(--c-primary) 16%, transparent); border-color: color-mix(in srgb, var(--c-primary) 50%, transparent); color: var(--c-primary); }
  .seg-btn:hover:not(.active) { border-color: color-mix(in srgb, var(--c-accent) 50%, transparent); }

  .custom-input {
    width: 100%;
    padding: 5px 8px;
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 30%, transparent);
    border-radius: var(--radius);
    color: var(--c-primary);
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 11px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
    margin: 4px 0;
  }
  .custom-input:focus { border-color: color-mix(in srgb, var(--c-accent) 55%, transparent); }
  .custom-input::placeholder { color: color-mix(in srgb, var(--c-accent) 60%, transparent); }

  .pick-list {
    display: flex;
    flex-direction: column;
    /* flex-shrink: 0 is load-bearing — a flex child with overflow != visible
       gets its automatic minimum size reset to 0 per the flexbox spec, so
       without this the options-panel's flex layout squeezes this list down
       to ~0px height (rows still render in the DOM, just with no visible
       area) instead of respecting max-height and letting the parent scroll. */
    flex-shrink: 0;
    gap: 1px;
    max-height: 180px;
    overflow-y: auto;
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-radius: var(--radius);
    padding: 2px;
  }
  .pick-list-tall { max-height: 320px; }
  .pick-row {
    display: block;
    width: 100%;
    text-align: left;
    padding: 4px 6px;
    background: transparent;
    border: none;
    border-radius: var(--radius);
    color: color-mix(in srgb, var(--c-accent) 92%, #fff 12%);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .pick-row:hover { background: color-mix(in srgb, var(--c-accent) 10%, transparent); }
  .pick-row.on { background: color-mix(in srgb, var(--c-success) 16%, transparent); color: var(--c-on); font-weight: 600; }
  .pick-row-sub { font-weight: 400; color: color-mix(in srgb, var(--c-accent) 70%, transparent); font-size: 10px; }

  .mod-row { display: flex; flex-direction: column; gap: 2px; padding: 1px 0; }
  .stat-inputs { display: flex; flex-wrap: wrap; gap: 4px; padding-left: 20px; }
  .stat-input {
    width: 64px;
    padding: 2px 5px;
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent);
    border-radius: var(--radius);
    color: var(--c-primary);
    font-size: 10.5px;
    outline: none;
  }

  .gem-color { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
  .gem-color.gem-r { background: #d33; }
  .gem-color.gem-g { background: #2b2; }
  .gem-color.gem-b { background: #38d; }
  .gem-color.gem-w { background: #ccc; }
</style>
