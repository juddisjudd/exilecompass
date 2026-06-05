<script lang="ts">
  import {
    stripPobColors, clearBuild,
    SLOT_ORDER, RARITY_COLOR,
    type PobBuild, type PobItem, type BuildFileEntry,
  } from '$lib/pob';
  import { recommendVendorOptionsForItem } from '$lib/regex/buildRecommend';
  import { loadVendorRecommendation } from '$lib/regex/builderState.svelte';
  import { m } from '$lib/paraglide/messages.js';

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
  let hoveredGem = $state<{ name: string; type: string } | null>(null);
  const GEM_CARD_W = 168;

  function updateGemPos(e: MouseEvent) {
    const winW = window.innerWidth, winH = window.innerHeight;
    const h = 46;
    let x = e.clientX + 14, y = e.clientY + 16;
    if (x + GEM_CARD_W > winW - 4) x = e.clientX - GEM_CARD_W - 14;
    if (y + h > winH - 4) y = e.clientY - h - 14;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    cardX = x; cardY = y;
  }
  function onGemEnter(e: MouseEvent, gem: { name: string; type: string }) {
    hoveredGem = gem;
    updateGemPos(e);
  }
  function onGemMove(e: MouseEvent) { if (hoveredGem) updateGemPos(e); }
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
      <button class="btn-import" onclick={onOpenImport}>{m.action_import_build()}</button>
    </div>
  {:else}
    <!-- Build header -->
    <div class="build-header">
      <div class="build-identity">
        <span class="build-class">{build.buildName || build.ascendClassName || build.className}</span>
        {#if build.buildName && (build.ascendClassName || build.className)}
          <span class="build-base-class">{build.ascendClassName || build.className}</span>
        {:else if build.ascendClassName}
          <span class="build-base-class">{build.className}</span>
        {/if}
      </div>
      <div class="build-meta">
        {#if build.level > 0}
          <span class="build-level">{m.build_level_prefix()} {build.level}</span>
        {/if}
        <button class="btn-clear" onclick={handleClear}>{m.action_clear()}</button>
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
        <div class="section-label">
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
        <div class="section-label">
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
                onmouseenter={(e) => onGemEnter(e, { name: group.mainSkill, type: group.mainType })}
                onmousemove={onGemMove} onmouseleave={onGemLeave}
                aria-label="{group.mainSkill} ({gemTypeLabel(group.mainType)})"
                type="button"
              ></button>
              {#each group.supports as sup, si (si)}
                <span class="gem-link" aria-hidden="true"></span>
                <button
                  class="gem-node {gemTypeClass(sup.type)}"
                  onmouseenter={(e) => onGemEnter(e, { name: sup.name, type: sup.type })}
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
        <button class="notes-toggle" onclick={() => (notesExpanded = !notesExpanded)} type="button">
          <span class="toggle-icon" class:expanded={notesExpanded}>▶</span>
          <span class="section-label">{m.build_section_notes()}</span>
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

    {#if item.requirements || item.itemLevel || item.corrupted}
      <div class="hc-sep"></div>
      <div class="hc-footer">
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
    <span class="ghc-type">{gemTypeLabel(hoveredGem.type)}</span>
  </div>
{/if}

<!-- Transient confirmation for the "find upgrades" action -->
{#if searchToast}
  <div class="search-toast" role="status">{searchToast}</div>
{/if}

<style>
  .build-overview { display: flex; flex-direction: column; gap: 6px; }

  /* ── Empty state ──────────────────────────────────────── */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 32px 16px; text-align: center; border: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent); border-radius: 3px; background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid)); }
  .empty-icon { color: color-mix(in srgb, var(--c-muted) 50%, transparent); }
  .empty-title { font-size: 12px; font-weight: 600; letter-spacing: 0.05em; color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%); }
  .empty-sub { font-size: 11px; color: color-mix(in srgb, var(--c-muted) 80%, transparent); max-width: 240px; line-height: 1.5; }
  .btn-import { margin-top: 4px; padding: 5px 16px; border-radius: 2px; cursor: pointer; background: color-mix(in srgb, var(--c-primary) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c-primary) 40%, transparent); color: var(--c-primary); font-family:'Inter Tight','Inter',sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; transition: all 0.15s; }
  .btn-import:hover { background: color-mix(in srgb, var(--c-primary) 20%, transparent); border-color: color-mix(in srgb, var(--c-primary) 60%, transparent); }

  /* ── Build header ──────────────────────────────────────── */
  .build-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: color-mix(in srgb, var(--c-bg) 86%, var(--c-mid)); border: 1px solid color-mix(in srgb, var(--c-accent) 38%, transparent); border-radius: 3px; }
  .build-identity { display: flex; align-items: baseline; gap: 6px; }
  .build-class { font-family:'Inter Tight','Inter',sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.06em; color: var(--c-primary); text-shadow: 0 0 12px color-mix(in srgb, var(--c-primary) 40%, transparent); }
  .build-base-class { font-size: 10px; color: color-mix(in srgb, var(--c-muted) 80%, transparent); letter-spacing: 0.04em; }
  .build-meta { display: flex; align-items: center; gap: 8px; }
  .build-level { font-family:'Inter Tight',sans-serif; font-size: 11px; font-weight: 600; font-feature-settings:'tnum'; color: color-mix(in srgb, var(--c-accent) 75%, #fff 25%); letter-spacing: 0.04em; }
  .btn-clear { padding: 2px 8px; background: transparent; border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent); border-radius: 2px; color: color-mix(in srgb, var(--c-muted) 90%, #fff 10%); font-size: 10px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; transition: all 0.15s; }
  .btn-clear:hover { border-color: color-mix(in srgb, #f38d78 40%, transparent); color: #f38d78; }

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
    color: color-mix(in srgb, #c8a040 70%, transparent);
    flex-shrink: 0;
  }

  .set-select select {
    flex: 1;
    min-width: 0;
    padding: 4px 6px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border: 1px solid color-mix(in srgb, #c8a040 32%, transparent);
    border-radius: 2px;
    color: #e2c98a;
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s;
  }
  .set-select select:hover,
  .set-select select:focus {
    border-color: color-mix(in srgb, #c8a040 55%, transparent);
  }
  .set-select option {
    background: #14130f;
    color: #e2c98a;
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
    padding: 4px 6px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border: 1px solid color-mix(in srgb, #c8a040 32%, transparent);
    border-radius: 2px;
    color: #e2c98a;
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s;
  }
  .build-library select:hover,
  .build-library select:focus {
    border-color: color-mix(in srgb, #c8a040 55%, transparent);
  }
  .build-library option {
    background: #14130f;
    color: #e2c98a;
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
    border: 1px solid color-mix(in srgb, #c8a040 32%, transparent);
    border-radius: 2px;
    color: #e2c98a;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s;
  }
  .library-refresh:hover {
    border-color: color-mix(in srgb, #c8a040 55%, transparent);
    color: var(--c-primary);
  }

  /* ── Section ───────────────────────────────────────────── */
  .section { display: flex; flex-direction: column; border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent); border-radius: 3px; overflow: hidden; }
  .section-label { font-family:'Inter Tight','Inter',sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: color-mix(in srgb, var(--c-accent) 70%, transparent); padding: 5px 10px; background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid)); border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 12%, transparent); display: flex; align-items: center; gap: 6px; }
  .section-hint { font-size: 9px; font-weight: 400; letter-spacing: 0.04em; text-transform: none; color: color-mix(in srgb, #c8a040 60%, transparent); }

  /* ── Equipment grid ────────────────────────────────────── */
  .equip-grid { display: grid; grid-template-columns: 1fr 1fr; background: color-mix(in srgb, var(--c-bg) 96%, var(--c-mid)); }
  .slot-cell { position: relative; display: flex; flex-direction: column; gap: 1px; padding: 5px 10px; border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 8%, transparent); border-right: 1px solid color-mix(in srgb, var(--c-accent) 8%, transparent); min-width: 0; user-select: none; transition: background 0.1s; }
  .slot-cell:nth-child(even) { border-right: none; }
  .slot-cell.has-item { cursor: pointer; }
  .slot-cell.has-item:hover { background: color-mix(in srgb, var(--c-accent) 5%, transparent); }

  /* Per-item "find upgrades" action — reveals on cell hover/focus so it doesn't
     clutter the grid. Builds a stash search from the item's mods. */
  .slot-search { position: absolute; top: 4px; right: 6px; width: 18px; height: 18px; padding: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--c-bg) 80%, var(--c-mid)); border: 1px solid color-mix(in srgb, var(--c-primary) 30%, transparent); border-radius: 3px; color: color-mix(in srgb, var(--c-primary) 75%, var(--c-accent)); cursor: pointer; opacity: 0; transition: opacity 0.12s, border-color 0.12s, color 0.12s, background 0.12s; }
  .slot-search svg { width: 12px; height: 12px; }
  .slot-cell:hover .slot-search,
  .slot-search:focus-visible { opacity: 1; }
  .slot-search:hover { color: var(--c-primary); border-color: color-mix(in srgb, var(--c-primary) 60%, transparent); background: color-mix(in srgb, var(--c-primary) 12%, transparent); }

  /* Confirmation toast for the find-upgrades action */
  .search-toast { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 9999; padding: 7px 14px; background: #0a0a0c; border: 1px solid color-mix(in srgb, var(--c-primary) 40%, transparent); border-radius: 4px; color: color-mix(in srgb, var(--c-primary) 90%, #fff 10%); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; box-shadow: 0 8px 24px rgba(0,0,0,0.7); pointer-events: none; }
  .slot-tag  { font-size: 8px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: color-mix(in srgb, var(--c-muted) 55%, transparent); }
  .slot-name { font-size: 10px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
  .slot-base { font-size: 9px; color: color-mix(in srgb, var(--c-muted) 65%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── Hovercard ─────────────────────────────────────────── */
  .hovercard { position: fixed; z-index: 9999; pointer-events: none; padding: 10px 12px; background: #0a0a0c; border: 1px solid color-mix(in srgb, var(--rc, #888) 45%, transparent); border-top: 2px solid color-mix(in srgb, var(--rc, #888) 70%, transparent); border-radius: 3px; box-shadow: 0 8px 24px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 6px; max-height: 60vh; overflow: hidden; }
  .hc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .hc-name { font-size: 12px; font-weight: 700; letter-spacing: 0.02em; line-height: 1.3; }
  .hc-base { font-size: 10px; color: color-mix(in srgb, var(--c-accent) 65%, transparent); margin-top: 2px; }
  .hc-badges { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
  .hc-rarity { font-size: 8px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 1px 5px; border-radius: 2px; border: 1px solid; white-space: nowrap; }
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
  .hc-corrupted { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #f38d78; }

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
  .gem-hovercard { position: fixed; z-index: 9999; pointer-events: none; padding: 7px 10px; background: #0a0a0c; border: 1px solid color-mix(in srgb, currentColor 40%, transparent); border-left: 2px solid currentColor; border-radius: 3px; box-shadow: 0 8px 24px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 2px; }
  .ghc-name { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%); }
  .ghc-type { font-size: 8px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: currentColor; }

  /* ── Notes ─────────────────────────────────────────────── */
  .notes-toggle { display: flex; align-items: center; gap: 6px; width: 100%; background: transparent; border: none; cursor: pointer; text-align: left; padding: 0; }
  .notes-toggle .section-label { flex: 1; border-bottom: none; }
  .notes-toggle .toggle-icon { font-size: 8px; color: color-mix(in srgb, var(--c-accent) 70%, transparent); transition: transform 0.2s ease; margin-left: 6px; flex-shrink: 0; }
  .notes-toggle .toggle-icon.expanded { transform: rotate(90deg); }
  .notes-body { margin: 0; padding: 8px 10px; font-family:'Inter Tight','Inter',sans-serif; font-size: 11px; line-height: 1.55; color: color-mix(in srgb, var(--c-accent) 82%, #fff 18%); white-space: pre-wrap; overflow-wrap: break-word; background: color-mix(in srgb, var(--c-bg) 97%, var(--c-mid)); max-height: 240px; overflow-y: auto; }
</style>
