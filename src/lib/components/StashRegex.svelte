<script lang="ts">
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
        { label: '40%+ Pack',       pattern: '([4-9].)%.*ed.pa' },
        { label: '60%+ Rarity',     pattern: '([6-9].|1..)%.*rar..(?!ch)' },
        { label: '15%+ Quantity',   pattern: '(1[5-9]|2.)%.*quan' },
      ],
    },
    {
      label: 'Gear',
      snippets: [
        { label: 'Fire Res',        pattern: 'fire res' },
        { label: 'Cold Res',        pattern: 'cold res' },
        { label: 'Lightning Res',   pattern: 'ight.*res' },
        { label: 'Chaos Res',       pattern: 'chaos res' },
        { label: 'All Res',         pattern: 'all.*res' },
        { label: 'Max Life',        pattern: 'max.*life' },
        { label: 'Energy Shield',   pattern: 'nrgy sh' },
        { label: 'Armour',          pattern: 'armour' },
        { label: 'Evasion',         pattern: 'evasion' },
        { label: 'Move Speed',      pattern: 'ent sp' },
        { label: 'Attack Speed',    pattern: 'ck sp' },
        { label: 'Crit Chance',     pattern: 'crit' },
        { label: 'Spell Damage',    pattern: 'spell' },
        { label: 'Flat Phys',       pattern: 'to phys' },
      ],
    },
    {
      label: 'Gems',
      snippets: [
        { label: 'Uncut Skill',     pattern: 'uncut sk' },
        { label: 'Uncut Support',   pattern: 'uncut su' },
        { label: 'Spirit Gem',      pattern: 'spirit gem' },
        { label: 'Quality',         pattern: 'quality' },
      ],
    },
    {
      label: 'Items',
      snippets: [
        { label: 'Exalted Orb',     pattern: 'exalted' },
        { label: 'Divine Orb',      pattern: 'divine' },
        { label: 'Chaos Orb',       pattern: 'chaos orb' },
        { label: 'Waystone',        pattern: 'waystone' },
        { label: 'Rune',            pattern: 'rune' },
        { label: 'Jewel',           pattern: 'jewel' },
        { label: 'Flask',           pattern: 'flask' },
        { label: 'Charm',           pattern: 'charm' },
        { label: 'Unique',          pattern: 'unique' },
        { label: 'Corrupted',       pattern: 'corr' },
      ],
    },
  ];

  const PRESETS = [
    { label: 'Good Waystones',  value: '"i.+ty:|m.+e:|r.+s:"',                    desc: 'Any rarity / pack size / rare-monster mod' },
    { label: 'Deli Maps',       value: '"delir" "m.+e:"',                          desc: 'Delirium + pack size (both required)' },
    { label: '40%+ Pack Size',  value: '"([4-9].)%.*ed.pa"',                       desc: '40 %+ monster pack size' },
    { label: '60%+ Rarity',     value: '"([6-9].|1..)%.*rar..(?!ch)"',             desc: '60 %+ item rarity (excludes chance)' },
    { label: 'Rarity + Pack',   value: '"i.+ty:" "m.+e:"',                         desc: 'Must have both rarity AND pack size' },
    { label: 'All Res Gear',    value: '"fire res|cold res|ight.*res|chaos res"',  desc: 'Any elemental resistance mod' },
    { label: 'Defenses',        value: '"max.*life|nrgy sh|armour|evasion"',       desc: 'Life, ES, armour, or evasion' },
    { label: 'Gems',            value: '"uncut sk|uncut su|spirit gem"',            desc: 'Uncut skill / support + spirit gems' },
    { label: 'Currency',        value: '"exalted|divine|chaos orb"',               desc: 'Key endgame currencies' },
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
  const charOver  = $derived(charCount > 50);
  const charWarn  = $derived(charCount > 40 && !charOver);

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
    <h3>Stash Search Builder</h3>
    <span class="header-hint">regex · 50-char limit</span>
  </div>

  <!-- Assembled output -->
  <div class="output-section">
    <div class="output-bar">
      <code class="output-text" class:empty={!assembled}>
        {assembled || 'add patterns below…'}
      </code>
      <button class="act-btn" class:copied onclick={copyToClipboard} disabled={!assembled} title="Copy to clipboard">
        {#if copied}✓{:else}
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
          <rect x="2" y="5" width="9" height="10" rx="1"/>
          <path d="M5 5V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-1"/>
        </svg>
        {/if}
      </button>
      <button class="act-btn act-clear" onclick={clearAll} disabled={!assembled} title="Clear all">✕</button>
    </div>
    <div class="char-bar">
      <div class="char-track">
        <div
          class="char-fill"
          class:warn={charWarn}
          class:over={charOver}
          style="width: {Math.min((charCount / 50) * 100, 100)}%"
        ></div>
      </div>
      <span class="char-label" class:warn={charWarn} class:over={charOver}>
        {charCount}/50{charOver ? ` (+${charCount - 50})` : ''}
      </span>
    </div>
  </div>

  <!-- Groups -->
  <div class="groups-section">
    <div class="groups-header">
      <span class="section-label">Groups <span class="group-and-hint">— each quoted block, all must match</span></span>
      <button class="add-btn" onclick={addGroup}>+ Add</button>
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
          placeholder="pattern…"
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
  <div class="cat-tabs">
    {#each CATEGORIES as cat, i (cat.label)}
    <button
      class="cat-tab"
      class:active={activeCategory === i}
      onclick={() => (activeCategory = i)}
    >{cat.label}</button>
    {/each}
    <button
      class="cat-tab presets-tab"
      class:active={activeCategory === PRESETS_TAB}
      onclick={() => (activeCategory = PRESETS_TAB)}
    >Presets</button>
  </div>

  <!-- Snippets / Presets panel -->
  <div class="snippets-panel">
    {#if activeCategory === PRESETS_TAB}
      {#each PRESETS as preset (preset.label)}
      <button class="preset-item" onclick={() => applyPreset(preset.value)}>
        <span class="preset-name">{preset.label}</span>
        <code class="preset-val">{preset.value}</code>
        <span class="preset-desc">{preset.desc}</span>
      </button>
      {/each}
    {:else}
      {#each CATEGORIES[activeCategory].snippets as snippet (snippet.pattern)}
      <button class="snippet" onclick={() => addSnippet(snippet.pattern)} title={snippet.pattern}>
        {snippet.label}
      </button>
      {/each}
      <span class="snippets-hint">→ active group  ·  use | to OR within a group</span>
    {/if}
  </div>

  <!-- Test area -->
  <div class="test-section">
    <div class="test-label">
      <span>Test</span>
      {#if testResult !== null}
      <span class="test-result" class:match={testResult} class:no-match={!testResult}>
        {testResult ? '✓ Match' : '✗ No match'}
      </span>
      {/if}
    </div>
    <textarea
      class="test-input"
      bind:value={testInput}
      placeholder="Paste item tooltip text here to test…"
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
  .act-btn.copied { color: #4ade80; border-color: color-mix(in srgb, #4ade80 40%, transparent); }
  .act-clear:hover:not(:disabled) { color: #f38d78; border-color: color-mix(in srgb, #f38d78 40%, transparent); }

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
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
  }
  .cat-tab {
    padding: 3px 8px;
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-accent) 65%, transparent);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: all 0.12s;
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
  .presets-tab { margin-left: auto; }

  /* ── Snippets / Presets panel ────────────────────────── */
  .snippets-panel {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px;
    background: color-mix(in srgb, var(--c-bg) 96%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 14%, transparent);
    border-radius: 3px;
    min-height: 52px;
    align-content: flex-start;
  }
  .snippet {
    padding: 3px 8px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.1s;
    white-space: nowrap;
  }
  .snippet:hover {
    background: color-mix(in srgb, var(--c-primary) 8%, transparent);
    border-color: color-mix(in srgb, var(--c-primary) 35%, transparent);
    color: var(--c-primary);
  }
  .snippets-hint {
    width: 100%;
    font-size: 9px;
    color: color-mix(in srgb, var(--c-muted) 40%, transparent);
    margin-top: 2px;
    align-self: flex-end;
  }

  /* Preset items */
  .preset-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 6px 8px;
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
    margin-top: auto;
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
