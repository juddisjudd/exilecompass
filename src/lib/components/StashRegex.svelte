<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';

  type FilterGroup = { id: number; pattern: string; exclude: boolean };
  type Snippet = { label: string; pattern: string };
  type Category = { label: string; snippets: Snippet[] };

  const CATEGORIES: Category[] = [
    {
      label: 'Waystones',
      snippets: [
        { label: 'Pack Size',       pattern: 'm.+e:' },
        { label: 'Rare Monsters',   pattern: 'r.+s:' },
        { label: 'Magic Monsters',  pattern: 'ma.+s:' },
        { label: 'Item Rarity',     pattern: 'i.+ty:' },
        { label: 'Drop Chance',     pattern: 'w.+e:' },
        { label: 'Delirium',        pattern: 'delir' },
        { label: 'Breach',          pattern: 'breach' },
        { label: '40%+ Pack',       pattern: '([4-9].)%.*ed.pa' },
        { label: '60%+ Rarity',     pattern: '([6-9].|1..)%.*rar..(?!ch)' },
        { label: '15%+ Quantity',   pattern: '(1[5-9]|2.)%.*quan' },
      ],
    },
    {
      label: 'Defences',
      snippets: [
        { label: 'Max Life',        pattern: 'max.*li' },
        { label: 'Energy Shield',   pattern: 'nrgy sh' },
        { label: 'Evasion',         pattern: 'vasion' },
        { label: 'Armour',          pattern: 'armour' },
        { label: 'Ward',            pattern: 'ward' },
        { label: 'Block',           pattern: 'block' },
        { label: 'Life Regen',      pattern: 'li.*reg' },
        { label: 'Leech',           pattern: 'leech' },
      ],
    },
    {
      label: 'Resistance',
      snippets: [
        { label: 'Fire Res',        pattern: 'fire res' },
        { label: 'Cold Res',        pattern: 'cold res' },
        { label: 'Lightning Res',   pattern: 'ight.*res' },
        { label: 'Chaos Res',       pattern: 'chaos res' },
        { label: 'All Ele Res',     pattern: 'all.*res' },
      ],
    },
    {
      label: 'Damage',
      snippets: [
        { label: 'Spell Dmg',       pattern: 'ell.*ge$' },
        { label: 'Phys Dmg',        pattern: 'to phys' },
        { label: 'Fire Dmg',        pattern: 'fi.*dam' },
        { label: 'Cold Dmg',        pattern: 'co.*dam' },
        { label: 'Lightning Dmg',   pattern: 'li.*dam' },
        { label: 'Chaos Dmg',       pattern: 'ch.*dam' },
        { label: 'Attack Speed',    pattern: 'ck sp' },
        { label: 'Cast Speed',      pattern: 'ast sp' },
        { label: 'Crit Chance',     pattern: 'crit ch' },
        { label: 'Crit Multi',      pattern: 'crit mu' },
        { label: 'Move Speed',      pattern: 'ent sp' },
      ],
    },
    {
      label: 'Attributes',
      snippets: [
        { label: 'Strength',        pattern: 'treng' },
        { label: 'Dexterity',       pattern: 'dext' },
        { label: 'Intelligence',    pattern: 'ntell' },
        { label: 'All Attributes',  pattern: 'all.*att' },
        { label: 'Spirit',          pattern: 'spirit' },
      ],
    },
    {
      label: 'Gear Slots',
      snippets: [
        { label: 'Helmet',          pattern: 'helmet' },
        { label: 'Gloves',          pattern: 'gloves' },
        { label: 'Boots',           pattern: 'boots' },
        { label: 'Body Armour',     pattern: 'body ar' },
        { label: 'Shield',          pattern: 'shield' },
        { label: 'Belt',            pattern: 'belt' },
        { label: 'Ring',            pattern: 'ring' },
        { label: 'Amulet',          pattern: 'amulet' },
        { label: 'Quiver',          pattern: 'quiver' },
        { label: 'Focus',           pattern: 'focus' },
      ],
    },
    {
      label: 'Weapons',
      snippets: [
        { label: 'Bow',             pattern: 'bow' },
        { label: 'Crossbow',        pattern: 'rossbow' },
        { label: 'Wand',            pattern: 'wand' },
        { label: 'Staff',           pattern: 'staff' },
        { label: 'Spear',           pattern: 'spear' },
        { label: 'Mace',            pattern: 'mace' },
        { label: 'Sword',           pattern: 'sword' },
        { label: 'Axe',             pattern: 'axe' },
        { label: 'Dagger',          pattern: 'dagger' },
        { label: 'Claw',            pattern: 'claw' },
      ],
    },
    {
      label: 'Gems',
      snippets: [
        { label: 'Uncut Skill',     pattern: 'uncut sk' },
        { label: 'Uncut Support',   pattern: 'uncut su' },
        { label: 'Uncut Spirit',    pattern: 'uncut sp' },
        { label: 'Quality',         pattern: 'quality' },
      ],
    },
    {
      label: 'Items',
      snippets: [
        { label: 'Rare',            pattern: 'rare' },
        { label: 'Unique',          pattern: 'unique' },
        { label: 'Magic',           pattern: 'magic' },
        { label: 'Corrupted',       pattern: 'orrupt' },
        { label: 'Waystone',        pattern: 'waystone' },
        { label: 'Jewel',           pattern: 'jewel' },
        { label: 'Flask',           pattern: 'flask' },
        { label: 'Rune',            pattern: 'rune' },
        { label: 'Charm',           pattern: 'charm' },
        { label: 'Exalted Orb',     pattern: 'exalted' },
        { label: 'Divine Orb',      pattern: 'divine' },
        { label: 'Essence',         pattern: 'essence' },
      ],
    },
  ];

  const PRESETS = [
    { label: 'Good Waystones',  value: '"i.+ty:|m.+e:|r.+s:"',                             desc: 'Any rarity / pack size / rare-monster mod' },
    { label: 'Deli Maps',       value: '"delir" "m.+e:"',                                   desc: 'Delirium + pack size (both required)' },
    { label: '40%+ Pack Size',  value: '"([4-9].)%.*ed.pa"',                                desc: '40%+ monster pack size' },
    { label: '60%+ Rarity',     value: '"([6-9].|1..)%.*rar..(?!ch)"',                      desc: '60%+ item rarity (excludes chance)' },
    { label: 'Rarity + Pack',   value: '"i.+ty:" "m.+e:"',                                  desc: 'Both rarity AND pack size' },
    { label: 'Any Ele Res',     value: '"fire res|cold res|ight.*res"',                      desc: 'Fire, cold, or lightning resistance' },
    { label: 'All Res Gear',    value: '"fire res" "cold res" "ight.*res"',                  desc: 'Must have all three elemental res' },
    { label: 'Defences',        value: '"max.*li|nrgy sh|armour|vasion"',                    desc: 'Life, ES, armour, or evasion' },
    { label: 'Life + Fire Res', value: '"max.*li" "fire res"',                               desc: 'Must have both max life AND fire res' },
    { label: 'Gems',            value: '"uncut sk|uncut su|uncut sp"',                       desc: 'Any uncut gem (skill / support / spirit)' },
    { label: 'Weapons',         value: '"bow|rossbow|wand|staff|spear|mace|sword|axe"',      desc: 'Any weapon type' },
    { label: 'Accessories',     value: '"ring|amulet|belt"',                                 desc: 'Rings, amulets, and belts' },
    { label: 'Currency',        value: '"exalted|divine|essence"',                           desc: 'Exalted, divine, or essence' },
    { label: 'Rares w/ Life',   value: '"rare" "max.*li"',                                   desc: 'Rare items with max life mod' },
    { label: 'Corrupted Uniq',  value: '"unique" "orrupt"',                                  desc: 'Corrupted unique items' },
  ];

  const PRESETS_TAB = CATEGORIES.length;

  let groups = $state<FilterGroup[]>([{ id: 0, pattern: '', exclude: false }]);
  let nextId = $state(1);
  let activeGroupId = $state(0);
  let activeCategory = $state(0);
  let testInput = $state('');
  let copied = $state(false);

  const assembled = $derived(
    groups
      .filter(g => g.pattern.trim())
      .map(g => `"${g.exclude ? '!' : ''}${g.pattern}"`)
      .join(' ')
  );

  const charCount = $derived(assembled.length);
  const charOver  = $derived(charCount >= 250);
  const charWarn  = $derived(charCount >= 200 && !charOver);

  const testResult = $derived.by(() => {
    if (!assembled || !testInput) return null;
    const active = groups.filter(g => g.pattern.trim());
    if (!active.length) return null;
    try {
      for (const g of active) {
        const re = new RegExp(g.pattern, 'i');
        const hit = re.test(testInput);
        if (g.exclude && hit)  return false;
        if (!g.exclude && !hit) return false;
      }
      return true;
    } catch {
      return null;
    }
  });

  function addGroup() {
    const id = nextId++;
    groups = [...groups, { id, pattern: '', exclude: false }];
    activeGroupId = id;
  }

  function removeGroup(id: number) {
    const rest = groups.filter(g => g.id !== id);
    if (rest.length === 0) {
      const nid = nextId++;
      groups = [{ id: nid, pattern: '', exclude: false }];
      activeGroupId = nid;
    } else {
      groups = rest;
      if (activeGroupId === id) activeGroupId = rest[rest.length - 1].id;
    }
  }

  function addSnippet(pattern: string) {
    const idx = groups.findIndex(g => g.id === activeGroupId);
    if (idx < 0) return;
    const cur = groups[idx].pattern;
    groups[idx].pattern = cur ? `${cur}|${pattern}` : pattern;
  }

  function applyPreset(value: string) {
    const matches = [...value.matchAll(/"([^"]+)"/g)];
    if (!matches.length) return;
    const newGroups: FilterGroup[] = matches.map(m => {
      const inner = m[1];
      const exclude = inner.startsWith('!');
      return { id: nextId++, pattern: exclude ? inner.slice(1) : inner, exclude };
    });
    groups = newGroups;
    activeGroupId = newGroups[newGroups.length - 1].id;
    activeCategory = 0;
  }

  function clearAll() {
    const id = nextId++;
    groups = [{ id, pattern: '', exclude: false }];
    activeGroupId = id;
  }

  async function copyToClipboard() {
    if (!assembled) return;
    await navigator.clipboard.writeText(assembled);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="regex-builder">
  <!-- Header -->
  <div class="builder-header">
    <h3>{m.regex_title()}</h3>
    <span class="header-hint">{m.regex_char_limit()}</span>
  </div>

  <!-- Assembled output -->
  <div class="output-section">
    <div class="output-bar">
      <code class="output-text" class:empty={!assembled}>
        {assembled || m.regex_placeholder_output()}
      </code>
      <button class="act-btn act-copy" class:copied onclick={copyToClipboard} disabled={!assembled} title={m.regex_copy()}>
        {#if copied}<span class="copied-check">✓</span>{:else}
          <img src="/ui/fouriconcopy.webp" width="16" height="16" alt="" aria-hidden="true" />
        {/if}
      </button>
      <button class="act-btn act-clear" onclick={clearAll} disabled={!assembled} title={m.regex_clear_all()}>
        <img src="/ui/fouriconclear.webp" width="16" height="16" alt="" aria-hidden="true" />
      </button>
    </div>
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

  <!-- Groups -->
  <div class="groups-section">
    <div class="groups-header">
      <span class="section-label">{m.regex_groups()} <span class="group-and-hint">— {m.regex_groups_hint()}</span></span>
      <button class="add-btn" onclick={addGroup}>{m.regex_add()}</button>
    </div>
    <div class="groups-list">
      {#each groups as group (group.id)}
      <div
        class="group-row"
        class:active={activeGroupId === group.id}
      >
        <span class="gq">"</span>
        {#if group.exclude}<span class="gbang">!</span>{/if}
        <input
          class="group-input"
          bind:value={group.pattern}
          placeholder={m.regex_placeholder_pattern()}
          spellcheck="false"
          onfocus={() => (activeGroupId = group.id)}
        />
        <span class="gq">"</span>
        <button
          class="gbtn gbtn-excl"
          class:active={group.exclude}
          onclick={(e) => { e.stopPropagation(); group.exclude = !group.exclude; }}
          title={group.exclude ? 'Remove NOT' : 'Negate (NOT)'}
        >!</button>
        <button
          class="gbtn gbtn-del"
          onclick={(e) => { e.stopPropagation(); removeGroup(group.id); }}
          title="Remove group"
        >✕</button>
      </div>
      {/each}
    </div>
  </div>

  <!-- Category tabs -->
  <div class="cat-tabs" role="tablist" aria-label="Regex snippet categories">
    {#each CATEGORIES as cat, i (cat.label)}
    <button
      class="cat-tab"
      class:active={activeCategory === i}
      onclick={() => (activeCategory = i)}
      type="button"
    >{cat.label}</button>
    {/each}
    <button
      class="cat-tab cat-tab-presets"
      class:active={activeCategory === PRESETS_TAB}
      onclick={() => (activeCategory = PRESETS_TAB)}
      type="button"
    >{m.regex_presets()}</button>
  </div>

  <!-- Snippets / Presets panel -->
  <div class="snippets-panel" class:presets-mode={activeCategory === PRESETS_TAB}>
    {#if activeCategory === PRESETS_TAB}
      {#each PRESETS as preset (preset.label)}
      <button class="preset-item" onclick={() => applyPreset(preset.value)} type="button">
        <span class="preset-name">{preset.label}</span>
        <code class="preset-val">{preset.value}</code>
        <span class="preset-desc">{preset.desc}</span>
      </button>
      {/each}
    {:else}
      {#each CATEGORIES[activeCategory].snippets as snippet (snippet.pattern)}
      <button class="snippet" onclick={() => addSnippet(snippet.pattern)} title={snippet.pattern} type="button">
        {snippet.label}
      </button>
      {/each}
      <span class="snippets-hint">{m.regex_snippet_hint()}</span>
    {/if}
  </div>

  <!-- Test area -->
  <div class="test-section">
    <div class="test-label">
      <span>{m.regex_test()}</span>
      {#if testResult !== null}
      <span class="test-result" class:match={testResult} class:no-match={!testResult}>
        {testResult ? m.regex_match() : m.regex_no_match()}
      </span>
      {/if}
    </div>
    <textarea
      class="test-input"
      bind:value={testInput}
      placeholder={m.regex_placeholder_test()}
      rows="3"
      spellcheck="false"
    ></textarea>
  </div>
</div>

<style>
  .regex-builder {
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* ── Header ─────────────────────────────────────────── */
  .builder-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--c-bg) 86%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 38%, transparent);
    border-radius: 3px;
  }
  .builder-header h3 {
    margin: 0;
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-primary);
    text-shadow: 0 0 12px color-mix(in srgb, var(--c-primary) 40%, transparent);
  }
  .header-hint {
    font-size: 9px;
    letter-spacing: 0.06em;
    color: color-mix(in srgb, var(--c-muted) 55%, transparent);
  }

  /* ── Output area ─────────────────────────────────────── */
  .output-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    background: color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent);
    border-radius: 3px;
  }
  .output-bar {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .output-text {
    flex: 1;
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: 11px;
    color: var(--c-primary);
    word-break: break-all;
    line-height: 1.4;
    min-height: 18px;
  }
  .output-text.empty {
    color: color-mix(in srgb, var(--c-muted) 55%, transparent);
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
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .act-btn:hover:not(:disabled) {
    color: var(--c-primary);
    border-color: color-mix(in srgb, var(--c-primary) 40%, transparent);
  }
  .act-btn:disabled { opacity: 0.3; cursor: default; }
  .act-copy.copied { border-color: color-mix(in srgb, #4ade80 40%, transparent); }
  .copied-check { color: #4ade80; font-size: 13px; font-weight: 700; }
  .act-clear:hover:not(:disabled) { border-color: color-mix(in srgb, #f38d78 40%, transparent); }
  .act-btn img { display: block; opacity: 0.7; transition: opacity 0.12s; }
  .act-btn:hover:not(:disabled) img { opacity: 1; }

  .char-bar {
    display: flex;
    align-items: center;
    gap: 6px;
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
    transition: width 0.15s, background 0.15s;
  }
  .char-fill.warn { background: #d97706; }
  .char-fill.over { background: #f38d78; }
  .char-label {
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--c-muted) 70%, transparent);
    white-space: nowrap;
  }
  .char-label.warn { color: #d97706; }
  .char-label.over { color: #f38d78; font-weight: 600; }

  /* ── Groups ──────────────────────────────────────────── */
  .groups-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }
  .groups-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .section-label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-muted) 70%, transparent);
  }
  .group-and-hint {
    font-size: 9px;
    letter-spacing: 0.01em;
    text-transform: none;
    font-weight: 400;
    color: color-mix(in srgb, var(--c-muted) 45%, transparent);
  }
  .add-btn {
    padding: 2px 7px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    font-size: 10px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
  }
  .add-btn:hover {
    color: var(--c-primary);
    border-color: color-mix(in srgb, var(--c-primary) 40%, transparent);
    background: color-mix(in srgb, var(--c-primary) 6%, transparent);
  }
  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 0;
  }
  .group-row {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 5px;
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 16%, transparent);
    border-radius: 2px;
    cursor: pointer;
    transition: border-color 0.1s;
  }
  .group-row.active {
    border-color: color-mix(in srgb, var(--c-primary) 42%, transparent);
    background: color-mix(in srgb, var(--c-primary) 5%, var(--c-bg));
  }
  .gq {
    font-family: 'JetBrains Mono', 'Consolas', monospace;
    font-size: 12px;
    color: color-mix(in srgb, var(--c-muted) 60%, transparent);
    user-select: none;
  }
  .gbang {
    font-family: 'JetBrains Mono', 'Consolas', monospace;
    font-size: 12px;
    color: #f38d78;
    user-select: none;
  }
  .group-input {
    flex: 1;
    padding: 0 4px;
    background: transparent;
    border: none;
    outline: none;
    color: var(--c-primary);
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: 11px;
    min-width: 0;
  }
  .group-input::placeholder { color: color-mix(in srgb, var(--c-muted) 40%, transparent); }
  .gbtn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 18px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.1s;
    flex-shrink: 0;
    color: color-mix(in srgb, var(--c-muted) 50%, transparent);
  }
  .gbtn-excl:hover, .gbtn-excl.active {
    color: #f38d78;
    border-color: color-mix(in srgb, #f38d78 35%, transparent);
    background: color-mix(in srgb, #f38d78 8%, transparent);
  }
  .gbtn-del:hover {
    color: color-mix(in srgb, #f38d78 80%, transparent);
    border-color: color-mix(in srgb, #f38d78 25%, transparent);
  }

  /* ── Category tabs ───────────────────────────────────── */
  .cat-tabs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
    gap: 3px;
    flex-shrink: 0;
  }
  .cat-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 28px;
    padding: 5px 8px;
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-accent) 65%, transparent);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: all 0.12s;
    text-align: center;
  }
  .cat-tab.active {
    background: color-mix(in srgb, var(--c-primary) 10%, transparent);
    border-color: color-mix(in srgb, var(--c-primary) 38%, transparent);
    color: var(--c-primary);
  }
  .cat-tab:hover:not(.active) {
    color: color-mix(in srgb, var(--c-accent) 90%, #fff 10%);
    border-color: color-mix(in srgb, var(--c-accent) 32%, transparent);
  }
  .cat-tab-presets {
    background: color-mix(in srgb, var(--c-bg) 82%, var(--c-mid));
  }

  /* ── Snippets / Presets panel ────────────────────────── */
  .snippets-panel {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 6px;
    padding: 8px;
    background: color-mix(in srgb, var(--c-bg) 96%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 14%, transparent);
    border-radius: 3px;
    flex: 1 1 auto;
    min-height: 128px;
    max-height: none;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    align-content: start;
    min-width: 0;
  }
  .snippets-panel.presets-mode {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
  .snippet {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 34px;
    padding: 6px 8px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.1s;
    text-align: center;
    line-height: 1.3;
  }
  .snippet:hover {
    background: color-mix(in srgb, var(--c-primary) 8%, transparent);
    border-color: color-mix(in srgb, var(--c-primary) 35%, transparent);
    color: var(--c-primary);
  }
  .snippets-hint {
    grid-column: 1 / -1;
    font-size: 9px;
    color: color-mix(in srgb, var(--c-muted) 40%, transparent);
    padding-top: 2px;
  }

  /* Preset items */
  .preset-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    min-height: 82px;
    padding: 8px 9px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-radius: 2px;
    text-align: left;
    cursor: pointer;
    transition: all 0.1s;
  }
  .preset-item:hover {
    background: color-mix(in srgb, var(--c-primary) 7%, var(--c-bg));
    border-color: color-mix(in srgb, var(--c-primary) 35%, transparent);
  }
  .preset-name {
    font-size: 10px;
    font-weight: 600;
    color: var(--c-primary);
    letter-spacing: 0.04em;
  }
  .preset-val {
    font-family: 'JetBrains Mono', 'Consolas', monospace;
    font-size: 10px;
    color: color-mix(in srgb, var(--c-accent) 75%, #fff 25%);
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.35;
  }
  .preset-desc {
    font-size: 9px;
    color: color-mix(in srgb, var(--c-muted) 60%, transparent);
  }

  /* ── Test area ───────────────────────────────────────── */
  .test-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }
  .test-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-muted) 70%, transparent);
  }
  .test-result { font-weight: 600; letter-spacing: 0.04em; }
  .test-result.match    { color: #4ade80; }
  .test-result.no-match { color: #f38d78; }
  .test-input {
    width: 100%;
    padding: 6px 8px;
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    border-radius: 3px;
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    line-height: 1.5;
    resize: none;
    outline: none;
    transition: border-color 0.15s;
    box-sizing: border-box;
  }
  .test-input:focus { border-color: color-mix(in srgb, var(--c-accent) 45%, transparent); }
  .test-input::placeholder { color: color-mix(in srgb, var(--c-muted) 55%, transparent); }
</style>
