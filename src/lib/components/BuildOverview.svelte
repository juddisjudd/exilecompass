<script lang="ts">
  import {
    stripPobColors, clearBuild,
    SLOT_ORDER, RARITY_COLOR,
    type PobBuild, type PobItem, type BuildFileEntry,
  } from '$lib/pob';
  import { recommendVendorOptionsForItem } from '$lib/regex/buildRecommend';
  import { loadVendorRecommendation } from '$lib/regex/builderState.svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { m } from '$lib/paraglide/messages.js';

  async function openSourceUrl(url: string) {
    try { await openUrl(url); } catch { /* ignore */ }
  }

  // Localized slot + rarity labels (keys mirror the canonical slot/rarity ids)
  const SLOT_MSG: Record<string, () => string> = {
    weapon1: m.slot_weapon1, offhand: m.slot_offhand, weapon2: m.slot_weapon2,
    helm: m.slot_helm, body: m.slot_body, gloves: m.slot_gloves, boots: m.slot_boots,
    amulet: m.slot_amulet, ring1: m.slot_ring1, ring2: m.slot_ring2, belt: m.slot_belt,
    flask1: m.slot_flask1, flask2: m.slot_flask2, flask3: m.slot_flask3,
    charm1: m.slot_charm1, charm2: m.slot_charm2, charm3: m.slot_charm3,
    trinket: m.slot_trinket,
  };
  function slotLabel(key: string): string {
    return SLOT_MSG[key]?.() ?? key;
  }

  const RARITY_MSG: Record<string, () => string> = {
    Normal: m.rarity_normal, Magic: m.rarity_magic, Rare: m.rarity_rare, Unique: m.rarity_unique,
  };
  function rarityLabel(r: string): string {
    return RARITY_MSG[r]?.() ?? r;
  }

  interface Props {
    build: PobBuild | null;
    onClear: () => void;
    onOpenImport: () => void;
    onSkillSetChange?: (index: number) => void;
    onItemSetChange?: (index: number) => void;
    // Build folder library — list of `.build` files the user can switch between
    buildFiles?: BuildFileEntry[];
    activeBuildPath?: string;
    onLoadBuild?: (path: string) => void;
    onRefreshBuilds?: () => void;
    // Requested when a per-item "find upgrades" search has been loaded into the
    // regex builder — the parent switches to the Stash tab.
    onOpenStash?: () => void;
  }

  let {
    build, onClear, onOpenImport, onSkillSetChange, onItemSetChange,
    buildFiles = [], activeBuildPath = '', onLoadBuild, onRefreshBuilds,
    onOpenStash,
  }: Props = $props();

  // Active indices — initialised from the stored build defaults
  let activeSkill = $state(0);
  let activeItem  = $state(0);

  // Reset selections when a different build is imported
  let lastImportedAt = $state(-1);
  $effect(() => {
    if (build && build.importedAt !== lastImportedAt) {
      lastImportedAt = build.importedAt;
      activeSkill = build.activeSkillSet;
      activeItem  = build.activeItemSet;
    }
  });

  function selectSkill(idx: number) { activeSkill = idx; onSkillSetChange?.(idx); }
  function selectItem(idx: number)  { activeItem  = idx; onItemSetChange?.(idx); }

  const skillSet = $derived(build?.skillSets[activeSkill] ?? build?.skillSets[0] ?? null);
  const itemSet  = $derived(build?.itemSets[activeItem]   ?? build?.itemSets[0]  ?? null);

  const multiSkill = $derived((build?.skillSets.length ?? 0) > 1);
  const multiItem  = $derived((build?.itemSets.length  ?? 0) > 1);

  // Notes
  const cleanNotes  = $derived(build ? stripPobColors(build.notes) : '');
  const hasNotes    = $derived(cleanNotes.trim().length > 0);
  let notesExpanded = $state(false);

  // Hovercard
  let hoveredItem = $state<PobItem | null>(null);
  let cardX = $state(0);
  let cardY = $state(0);
  const CARD_W = 248;

  function updatePos(e: MouseEvent) {
    const winW = window.innerWidth, winH = window.innerHeight;
    const est  = Math.round(winH * 0.60);
    let x = e.clientX + 14, y = e.clientY - 6;
    if (x + CARD_W > winW - 4) x = e.clientX - CARD_W - 14;
    if (y + est   > winH - 4)  y = winH - est - 6;
    if (y < 4) y = 4;
    if (x < 4) x = 4;
    cardX = x; cardY = y;
  }

  function onEnter(e: MouseEvent, item: PobItem | undefined) {
    if (!item) return;
    hoveredItem = item;
    updatePos(e);
  }
  function onMove(e: MouseEvent) { if (hoveredItem) updatePos(e); }
  function onLeave() { hoveredItem = null; }

  function handleClear() { clearBuild(); onClear(); }

  function gemTypeClass(type: string) {
    return type === 'spirit' ? 'gem-spirit' : type === 'support' ? 'gem-support' : 'gem-skill';
  }

  const GEM_TYPE_MSG: Record<string, () => string> = {
    skill: m.gem_type_skill, spirit: m.gem_type_spirit, support: m.gem_type_support,
  };
  function gemTypeLabel(type: string): string {
    return GEM_TYPE_MSG[type]?.() ?? type;
  }

  // Gem hovercard (reuses cardX/cardY — only one card is ever shown at a time)
  interface HoveredGem {
    name: string;
    type: string;
    level?: number;
    quality?: number;
    fromLevel?: number;
    /** For a main gem: the supports linked into it. */
    supports?: string[];
    /** For a support: the main gem it's linked into. */
    linkedTo?: string;
  }
  let hoveredGem = $state<HoveredGem | null>(null);
  const GEM_CARD_W = 188;

  function updateGemPos(e: MouseEvent, gem: HoveredGem) {
    const winW = window.innerWidth, winH = window.innerHeight;
    const extraRows = (gem.supports?.length ?? 0) + (gem.linkedTo ? 1 : 0)
      + (gem.level || gem.quality || gem.fromLevel ? 1 : 0);
    const h = 46 + extraRows * 16;
    let x = e.clientX + 14, y = e.clientY + 16;
    if (x + GEM_CARD_W > winW - 4) x = e.clientX - GEM_CARD_W - 14;
    if (y + h > winH - 4) y = e.clientY - h - 14;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    cardX = x; cardY = y;
  }
  function onGemEnter(e: MouseEvent, gem: HoveredGem) {
    hoveredGem = gem;
    updateGemPos(e, gem);
  }
  function onGemMove(e: MouseEvent) { if (hoveredGem) updateGemPos(e, hoveredGem); }
  function onGemLeave() { hoveredGem = null; }

  // Items present in this set, ordered by the canonical slot order
  const orderedItems = $derived.by(() => {
    if (!itemSet) return [];
    const bySlot = new Map(itemSet.items.map(i => [i.slot, i]));
    return SLOT_ORDER.map(k => bySlot.get(k)).filter((x): x is PobItem => x !== undefined);
  });

  function rc(item?: PobItem) {
    return item ? (RARITY_COLOR[item.rarity] ?? '#b8b4ae') : 'transparent';
  }

  function reqLine(item: PobItem): string {
    const r = item.requirements;
    if (!r) return '';
    return [r.level&&`Lv ${r.level}`,r.str&&`Str ${r.str}`,r.dex&&`Dex ${r.dex}`,r.int&&`Int ${r.int}`]
      .filter(Boolean).join(' · ');
  }

  // ── Build-aware regex: turn an item's mods into a stash/vendor search ────────
  let searchToast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function flash(msg: string) {
    searchToast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (searchToast = ''), 2600);
  }

  async function findUpgrades(item: PobItem) {
    const { count, regex } = loadVendorRecommendation(
      recommendVendorOptionsForItem(item),
      m.build_recommended_search({ slot: slotLabel(item.slot) }),
    );
    if (count === 0) {
      flash(m.build_no_searchable_mods());
      return;
    }
    try {
      await navigator.clipboard.writeText(regex);
    } catch {
      // Clipboard blocked — the search is still loaded in the Stash tab.
    }
    onOpenStash?.();
  }
</script>

<div class="build-overview">
  <!-- Build library — pick a build from the configured folder (Settings) -->
  {#if buildFiles.length > 0}
    <div class="build-library">
      <span class="set-select-label">{m.build_library_label()}</span>
      <select
        value={activeBuildPath}
        onchange={(e) => onLoadBuild?.((e.currentTarget as HTMLSelectElement).value)}
      >
        {#if !buildFiles.some(f => f.path === activeBuildPath)}
          <option value="" disabled>{m.build_library_placeholder()}</option>
        {/if}
        {#each buildFiles as f (f.path)}
          <option value={f.path}>{f.name}</option>
        {/each}
      </select>
      <button
        class="library-refresh"
        onclick={() => onRefreshBuilds?.()}
        title={m.action_refresh()}
        aria-label={m.action_refresh()}
        type="button"
      >⟳</button>
    </div>
  {/if}

  {#if !build}
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <p class="empty-title">{m.build_empty_title()}</p>
      <p class="empty-sub">{m.build_empty_sub()}</p>
      <button class="btn btn-primary" onclick={onOpenImport}>{m.action_import_build()}</button>
    </div>
  {:else}
    <!-- Build header -->
    <div class="build-header">
      <div class="build-identity">
        <span class="build-name" title={build.buildName || build.ascendClassName || build.className}>
          {build.buildName || build.ascendClassName || build.className}
        </span>
        <div class="build-subline">
          {#if build.buildName && (build.ascendClassName || build.className)}
            <span class="build-fact build-fact-class">{build.ascendClassName || build.className}</span>
          {:else if build.ascendClassName}
            <span class="build-fact build-fact-class">{build.className}</span>
          {/if}
          {#if build.level > 0}
            <span class="build-fact">{m.build_level_prefix()} {build.level}</span>
          {/if}
          {#if build.author}
            <span class="build-fact">{m.build_by_author({ author: build.author })}</span>
          {/if}
        </div>
      </div>
      <div class="build-actions">
        {#if build.sourceUrl}
          <button
            class="build-source-link"
            type="button"
            title={build.sourceUrl}
            aria-label={m.build_open_source()}
            onclick={() => openSourceUrl(build.sourceUrl!)}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            {m.build_open_source()}
          </button>
        {/if}
        <button class="btn btn-danger btn-sm" onclick={handleClear}>{m.action_clear()}</button>
      </div>
    </div>

    <!-- Set selectors — each shown only when there is more than one -->
    {#if multiSkill || multiItem}
      <div class="set-selectors">
        {#if multiItem}
          <label class="set-select">
            <span class="set-select-label">{m.build_set_items()}</span>
            <select
              value={activeItem}
              onchange={(e) => selectItem(+(e.currentTarget as HTMLSelectElement).value)}
            >
              {#each build.itemSets as s, i (s.id)}
                <option value={i}>{s.name}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if multiSkill}
          <label class="set-select">
            <span class="set-select-label">{m.build_set_skills()}</span>
            <select
              value={activeSkill}
              onchange={(e) => selectSkill(+(e.currentTarget as HTMLSelectElement).value)}
            >
              {#each build.skillSets as s, i (s.id)}
                <option value={i}>{s.name}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>
    {/if}

    <!-- Equipment -->
    {#if itemSet && itemSet.items.length > 0}
      <div class="section">
        <div class="panel-header section-label">
          {m.build_section_equipment()}
          {#if multiItem}<span class="section-hint">{itemSet.name}</span>{/if}
        </div>
        <div class="equip-grid">
          {#each orderedItems as item (item.slot)}
            <div
              class="slot-cell has-item"
              onmouseenter={(e) => onEnter(e, item)}
              onmousemove={onMove} onmouseleave={onLeave}
              role="none"
            >
              <span class="slot-tag">{slotLabel(item.slot)}</span>
              <span class="slot-name" style="color:{rc(item)}">{item.name}</span>
              {#if item.base !== item.name}<span class="slot-base">{item.base}</span>{/if}
              <button
                class="slot-search"
                type="button"
                title={m.build_find_upgrades_title()}
                aria-label={m.build_find_upgrades_aria({ slot: slotLabel(item.slot) })}
                onclick={(e) => { e.stopPropagation(); findUpgrades(item); }}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="2" />
                  <path d="M20 20l-3.6-3.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Skill links -->
    {#if skillSet && skillSet.skillGroups.length > 0}
      <div class="section">
        <div class="panel-header section-label">
          {m.build_section_skills()}
          {#if multiSkill}<span class="section-hint">{skillSet.name}</span>{/if}
          <span class="gem-legend">
            <span class="legend-item legend-skill">{m.gem_type_skill()}</span>
            <span class="legend-item legend-spirit">{m.gem_type_spirit()}</span>
            <span class="legend-item legend-support">{m.gem_type_support()}</span>
          </span>
        </div>
        <div class="skill-groups">
          {#each skillSet.skillGroups as group, gi (gi)}
            <div class="skill-group">
              <button
                class="gem-node main {gemTypeClass(group.mainType)}"
                onmouseenter={(e) => onGemEnter(e, {
                  name: group.mainSkill, type: group.mainType,
                  level: group.mainLevel, quality: group.mainQuality, fromLevel: group.mainFromLevel,
                  supports: group.supports.map((s) => s.name),
                })}
                onmousemove={onGemMove} onmouseleave={onGemLeave}
                aria-label="{group.mainSkill} ({gemTypeLabel(group.mainType)})"
                type="button"
              ></button>
              {#each group.supports as sup, si (si)}
                <span class="gem-link" aria-hidden="true"></span>
                <button
                  class="gem-node {gemTypeClass(sup.type)}"
                  onmouseenter={(e) => onGemEnter(e, {
                    name: sup.name, type: sup.type,
                    level: sup.level, quality: sup.quality, fromLevel: sup.fromLevel,
                    linkedTo: group.mainSkill,
                  })}
                  onmousemove={onGemMove} onmouseleave={onGemLeave}
                  aria-label="{sup.name} ({gemTypeLabel(sup.type)})"
                  type="button"
                ></button>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Notes -->
    {#if hasNotes}
      <div class="section">
        <button class="panel-header notes-toggle" onclick={() => (notesExpanded = !notesExpanded)} type="button">
          <span class="notes-toggle-label">
            <span class="guide-toggle-icon" class:expanded={notesExpanded}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></span>
            {m.build_section_notes()}
          </span>
        </button>
        {#if notesExpanded}
          <pre class="notes-body">{cleanNotes}</pre>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- Hovercard -->
{#if hoveredItem}
  {@const item = hoveredItem}
  <div class="hovercard" style="left:{cardX}px; top:{cardY}px; width:{CARD_W}px; --rc:{rc(item)}">
    <div class="hc-header">
      <div>
        <div class="hc-name" style="color:{rc(item)}">{item.name}</div>
        {#if item.base !== item.name}<div class="hc-base">{item.base}</div>{/if}
      </div>
      <div class="hc-badges">
        <span class="hc-rarity hc-{item.rarity.toLowerCase()}">{rarityLabel(item.rarity)}</span>
        {#if item.quality}<span class="hc-quality">Q{item.quality}%</span>{/if}
      </div>
    </div>

    {#if item.mods.length > 0}
      <div class="hc-sep"></div>
      <div class="hc-mods">
        {#each item.mods as mod, mi (mi)}<div class="hc-mod">{mod}</div>{/each}
      </div>
    {/if}

    {#if item.requirements || item.itemLevel || item.corrupted || item.fromLevel}
      <div class="hc-sep"></div>
      <div class="hc-footer">
        {#if item.fromLevel}<span class="hc-from">{m.item_from_level({ level: String(item.fromLevel) })}</span>{/if}
        {#if reqLine(item)}<span class="hc-req">{reqLine(item)}</span>{/if}
        {#if item.itemLevel}<span class="hc-ilv">iLv {item.itemLevel}</span>{/if}
        {#if item.corrupted}<span class="hc-corrupted">{m.item_corrupted()}</span>{/if}
      </div>
    {/if}
  </div>
{/if}

<!-- Gem hovercard -->
{#if hoveredGem}
  <div class="gem-hovercard {gemTypeClass(hoveredGem.type)}" style="left:{cardX}px; top:{cardY}px; width:{GEM_CARD_W}px">
    <span class="ghc-name">{hoveredGem.name}</span>
    <span class="ghc-meta">
      <span class="ghc-type">{gemTypeLabel(hoveredGem.type)}</span>
      {#if hoveredGem.level}<span class="ghc-stat">{m.gem_level({ level: String(hoveredGem.level) })}</span>{/if}
      {#if hoveredGem.quality}<span class="ghc-stat">{m.gem_quality({ quality: String(hoveredGem.quality) })}</span>{/if}
      {#if hoveredGem.fromLevel}<span class="ghc-from">{m.gem_from_level({ level: String(hoveredGem.fromLevel) })}</span>{/if}
    </span>
    {#if hoveredGem.supports && hoveredGem.supports.length > 0}
      <div class="ghc-sep"></div>
      <span class="ghc-label">{m.gem_linked_supports()}</span>
      {#each hoveredGem.supports as sup, i (i)}
        <span class="ghc-link-item">{sup}</span>
      {/each}
    {:else if hoveredGem.linkedTo}
      <div class="ghc-sep"></div>
      <span class="ghc-label">{m.gem_linked_to({ skill: hoveredGem.linkedTo })}</span>
    {/if}
  </div>
{/if}

<!-- Transient confirmation for the "find upgrades" action -->
{#if searchToast}
  <div class="search-toast" role="status">{searchToast}</div>
{/if}

<style>
  .build-overview { display: flex; flex-direction: column; gap: 6px; }

  /* ── Empty state ──────────────────────────────────────── */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 32px 16px; text-align: center; border: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent); border-radius: var(--radius); background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid)); }
  .empty-icon { color: color-mix(in srgb, var(--c-muted) 50%, transparent); }
  .empty-title { font-size: 12px; font-weight: 600; letter-spacing: 0.05em; color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%); }
  .empty-sub { font-size: 11px; color: color-mix(in srgb, var(--c-muted) 80%, transparent); max-width: 240px; line-height: 1.5; }
  .empty-state .btn { margin-top: 4px; }

  /* ── Build header ──────────────────────────────────────── */
  /* Two-line identity (name, then class · level · author) with the actions
     pinned right, so long guide names wrap instead of squeezing everything
     onto one baseline. */
  .build-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 10px 12px; background: color-mix(in srgb, var(--c-bg) 86%, var(--c-mid)); border: 1px solid color-mix(in srgb, var(--c-accent) 38%, transparent); border-radius: var(--radius); }
  .build-identity { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
  .build-name { font-family: var(--font-ui); font-size: 13px; font-weight: 600; letter-spacing: 0.04em; line-height: 1.3; color: var(--c-primary); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .build-subline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0; }
  .build-fact { font-size: 10px; letter-spacing: 0.03em; color: color-mix(in srgb, var(--c-accent) 72%, transparent); white-space: nowrap; }
  .build-fact-class { color: color-mix(in srgb, var(--c-accent) 90%, #fff 10%); font-weight: 600; }
  .build-fact + .build-fact::before { content: '·'; margin: 0 7px; color: color-mix(in srgb, var(--c-muted) 70%, transparent); }
  .build-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; padding-top: 1px; }
  .build-source-link { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border: 1px solid color-mix(in srgb, var(--c-accent) 30%, transparent); border-radius: var(--radius); background: transparent; color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%); font-family: var(--font-ui); font-size: 10px; font-weight: 500; letter-spacing: 0.04em; cursor: pointer; transition: border-color 0.12s ease, color 0.12s ease; }
  .build-source-link:hover { border-color: var(--c-red); color: var(--c-red-bright); }
  .btn-sm { height: 22px; padding: 0 8px; font-size: 10px; font-weight: 500; letter-spacing: 0.06em; }

  /* ── Set selectors (skill set / item set dropdowns) ────── */
  .set-selectors {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .set-select {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
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
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s;
  }
  .set-select select:hover {
    border-color: color-mix(in srgb, var(--c-red) 55%, transparent);
  }
  .set-select option {
    background: var(--c-bg);
    color: var(--c-red-bright);
  }

  /* ── Build library picker ──────────────────────────────── */
  .build-library {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .build-library select {
    flex: 1;
    min-width: 0;
    padding: 4px 20px 4px 6px;
    background-color: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-red) 32%, transparent);
    border-radius: var(--radius);
    color: var(--c-red-bright);
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s;
  }
  .build-library select:hover {
    border-color: color-mix(in srgb, var(--c-red) 55%, transparent);
  }
  .build-library option {
    background: var(--c-bg);
    color: var(--c-red-bright);
  }
  .library-refresh {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-red) 32%, transparent);
    border-radius: var(--radius);
    color: var(--c-red-bright);
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s;
  }
  .library-refresh:hover {
    border-color: color-mix(in srgb, var(--c-red) 55%, transparent);
    color: var(--c-primary);
  }

  /* ── Section ───────────────────────────────────────────── */
  .section { display: flex; flex-direction: column; border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent); border-radius: var(--radius); overflow: hidden; }
  .section-label { gap: 6px; }
  .section-hint { font-size: 9px; font-weight: 400; letter-spacing: 0.04em; text-transform: none; color: color-mix(in srgb, var(--c-red) 60%, transparent); }

  /* ── Equipment grid ────────────────────────────────────── */
  .equip-grid { display: grid; grid-template-columns: 1fr 1fr; background: color-mix(in srgb, var(--c-bg) 96%, var(--c-mid)); }
  .slot-cell { position: relative; display: flex; flex-direction: column; gap: 1px; padding: 5px 10px; border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 8%, transparent); border-right: 1px solid color-mix(in srgb, var(--c-accent) 8%, transparent); min-width: 0; user-select: none; transition: background 0.1s; }
  .slot-cell:nth-child(even) { border-right: none; }
  .slot-cell.has-item { cursor: pointer; }
  .slot-cell.has-item:hover { background: color-mix(in srgb, var(--c-accent) 5%, transparent); }

  /* Per-item "find upgrades" action — reveals on cell hover/focus so it doesn't
     clutter the grid. Builds a stash search from the item's mods. */
  .slot-search { position: absolute; top: 4px; right: 6px; width: 18px; height: 18px; padding: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--c-bg) 80%, var(--c-mid)); border: 1px solid color-mix(in srgb, var(--c-primary) 30%, transparent); border-radius: var(--radius); color: color-mix(in srgb, var(--c-primary) 75%, var(--c-accent)); cursor: pointer; opacity: 0; transition: opacity 0.12s, border-color 0.12s, color 0.12s, background 0.12s; }
  .slot-search svg { width: 12px; height: 12px; }
  .slot-cell:hover .slot-search,
  .slot-search:focus-visible { opacity: 1; }
  .slot-search:hover { color: var(--c-primary); border-color: color-mix(in srgb, var(--c-primary) 60%, transparent); background: color-mix(in srgb, var(--c-primary) 12%, transparent); }

  /* Confirmation toast for the find-upgrades action */
  .search-toast { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 9999; padding: 7px 14px; background: var(--c-mid); border: 1px solid color-mix(in srgb, var(--c-primary) 40%, transparent); border-radius: var(--radius); color: color-mix(in srgb, var(--c-primary) 90%, #fff 10%); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; box-shadow: var(--shadow-pop); pointer-events: none; }
  .slot-tag  { font-size: 8px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: color-mix(in srgb, var(--c-muted) 55%, transparent); }
  .slot-name { font-size: 10px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
  .slot-base { font-size: 9px; color: color-mix(in srgb, var(--c-muted) 65%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── Hovercard ─────────────────────────────────────────── */
  .hovercard { position: fixed; z-index: 9999; pointer-events: none; padding: 10px 12px; background: var(--c-mid); border: 1px solid color-mix(in srgb, var(--rc, #888) 45%, transparent); border-top: 2px solid color-mix(in srgb, var(--rc, #888) 70%, transparent); border-radius: var(--radius); box-shadow: var(--shadow-pop); display: flex; flex-direction: column; gap: 6px; max-height: 60vh; overflow: hidden; }
  .hc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .hc-name { font-size: 12px; font-weight: 700; letter-spacing: 0.02em; line-height: 1.3; }
  .hc-base { font-size: 10px; color: color-mix(in srgb, var(--c-accent) 65%, transparent); margin-top: 2px; }
  .hc-badges { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
  .hc-rarity { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 1px 5px; border-radius: var(--radius); border: 1px solid; white-space: nowrap; }
  /* Item-rarity colors mirror in-game rarity (Normal/Magic/Rare/Unique) — left as-is intentionally. */
  .hc-normal  { color: #b8b4ae; border-color: rgba(184,180,174,.3); background: rgba(184,180,174,.08); }
  .hc-magic   { color: #8ba4e8; border-color: rgba(139,164,232,.3); background: rgba(139,164,232,.08); }
  .hc-rare    { color: #e8d56e; border-color: rgba(232,213,110,.3); background: rgba(232,213,110,.08); }
  .hc-unique  { color: #c28e4a; border-color: rgba(194,142,74,.3);  background: rgba(194,142,74,.08); }
  .hc-quality { font-size: 9px; font-weight: 600; color: color-mix(in srgb, #86efac 70%, transparent); }
  .hc-sep { height: 1px; background: color-mix(in srgb, var(--c-accent) 15%, transparent); margin: 1px 0; }
  .hc-mods { display: flex; flex-direction: column; gap: 3px; }
  .hc-mod { font-size: 10px; line-height: 1.4; color: color-mix(in srgb, #c8d4e0 90%, #fff 10%); }
  .hc-footer { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .hc-req { font-size: 9px; color: color-mix(in srgb, var(--c-muted) 75%, transparent); }
  .hc-ilv { font-size: 9px; color: color-mix(in srgb, var(--c-muted) 55%, transparent); }
  .hc-from { font-size: 9px; font-weight: 600; color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%); }
  .hc-corrupted { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-red-bright); }

  /* ── Skill groups ──────────────────────────────────────── */
  .skill-groups { display: flex; flex-direction: column; gap: 1px; background: color-mix(in srgb, var(--c-bg) 96%, var(--c-mid)); }
  .skill-group { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; padding: 7px 10px; border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 8%, transparent); }
  .skill-group:last-child { border-bottom: none; }

  /* Each gem is a colored node; the active gem (main) is larger. Hover a node
     for its name + type. The connector chains supports onto their parent. */
  .gem-node { appearance: none; flex-shrink: 0; width: 14px; height: 14px; padding: 0; border-radius: 50%; border: 2px solid currentColor; background: color-mix(in srgb, currentColor 26%, transparent); box-shadow: 0 0 0 1px rgba(0,0,0,0.45); cursor: pointer; transition: transform 0.1s ease, box-shadow 0.12s ease; }
  .gem-node.main { width: 18px; height: 18px; background: color-mix(in srgb, currentColor 45%, transparent); box-shadow: 0 0 7px color-mix(in srgb, currentColor 40%, transparent), 0 0 0 1px rgba(0,0,0,0.45); }
  .gem-node:hover { transform: scale(1.18); box-shadow: 0 0 10px color-mix(in srgb, currentColor 60%, transparent), 0 0 0 1px rgba(0,0,0,0.55); }
  .gem-node:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 70%, #fff 30%); outline-offset: 2px; }
  .gem-link { flex-shrink: 0; width: 10px; height: 2px; border-radius: 1px; background: color-mix(in srgb, var(--c-accent) 42%, transparent); }

  /* Gem-type legend in the section header */
  .gem-legend { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .legend-item { display: inline-flex; align-items: center; gap: 3px; font-size: 8px; font-weight: 600; letter-spacing: 0.02em; text-transform: none; }
  .legend-item::before { content: ''; width: 7px; height: 7px; border-radius: 50%; border: 1px solid; flex-shrink: 0; }
  .legend-skill   { color: color-mix(in srgb, #86efac 85%, #fff 15%); }
  .legend-skill::before   { background: color-mix(in srgb, #86efac 18%, transparent); border-color: color-mix(in srgb, #86efac 55%, transparent); }
  .legend-spirit  { color: color-mix(in srgb, #c4b5fd 85%, #fff 15%); }
  .legend-spirit::before  { background: color-mix(in srgb, #c4b5fd 18%, transparent); border-color: color-mix(in srgb, #c4b5fd 55%, transparent); }
  .legend-support { color: color-mix(in srgb, #93c5fd 85%, #fff 15%); }
  .legend-support::before { background: color-mix(in srgb, #93c5fd 18%, transparent); border-color: color-mix(in srgb, #93c5fd 55%, transparent); }
  /* Gem-type hue — drives node fill/border (currentColor) and the hovercard accent */
  .gem-skill   { color: #86efac; }
  .gem-support { color: #93c5fd; }
  .gem-spirit  { color: #c4b5fd; }

  /* Gem hovercard */
  .gem-hovercard { position: fixed; z-index: 9999; pointer-events: none; padding: 7px 10px; background: var(--c-mid); border: 1px solid color-mix(in srgb, currentColor 40%, transparent); border-left: 2px solid currentColor; border-radius: var(--radius); box-shadow: var(--shadow-pop); display: flex; flex-direction: column; gap: 2px; }
  .ghc-name { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%); }
  .ghc-type { font-size: 8px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: currentColor; }
  .ghc-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .ghc-stat { font-size: 9px; font-weight: 600; font-feature-settings: 'tnum'; color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%); }
  .ghc-from { font-size: 9px; font-weight: 600; color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%); }
  .ghc-sep { height: 1px; background: color-mix(in srgb, var(--c-accent) 15%, transparent); margin: 3px 0 2px; }
  .ghc-label { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: color-mix(in srgb, var(--c-accent) 60%, transparent); }
  .ghc-link-item { font-size: 10px; line-height: 1.4; color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%); padding-left: 8px; position: relative; }
  .ghc-link-item::before { content: ''; position: absolute; left: 0; top: 6px; width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: 0.6; }

  /* ── Notes ─────────────────────────────────────────────── */
  .notes-toggle { width: 100%; border: none; cursor: pointer; text-align: left; }
  .notes-toggle-label { display: flex; align-items: center; gap: 6px; }
  .notes-body { margin: 0; padding: 8px 10px; font-family: var(--font-ui); font-size: 11px; line-height: 1.55; color: color-mix(in srgb, var(--c-accent) 82%, #fff 18%); white-space: pre-wrap; overflow-wrap: break-word; background: color-mix(in srgb, var(--c-bg) 97%, var(--c-mid)); max-height: 240px; overflow-y: auto; }
</style>
