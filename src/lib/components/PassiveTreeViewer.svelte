<script lang="ts">
  import { onMount } from 'svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { levelingRoute } from '$lib/levelingRoute.svelte';
  import { restorePoe1Build, loadPoe1Build } from '$lib/poe1Pob';
  import { poe1ViewState, syncTreeSelectionToBuild } from '$lib/poe1ViewState.svelte';
  import {
    decodeUrlTree,
    buildUrlTreeDelta,
    buildDeltaStyles,
    calculateBounds,
    EMPTY_URL_TREE,
    type LoadedTree,
    type UrlTreeData,
  } from '$lib/leveling/tree';
  import { loadSkillTree } from '$lib/leveling/treeData';

  const STYLE_ID = 'passive-tree-svg';

  let container = $state<HTMLDivElement>();
  let loaded = $state<LoadedTree | null>(null);
  let urlTrees = $state<UrlTreeData[]>([]);
  let status = $state<'loading' | 'ready' | 'no-build' | 'unsupported' | 'error'>('loading');
  let unsupportedVersion = $state('');
  let errorMsg = $state('');

  // Pan/zoom via the svg viewBox (world coordinates) — vectors re-render
  // crisp at every zoom level, unlike CSS-transforming the huge svg element
  // (which rasterizes it once at capped resolution and scales the bitmap).
  let view = $state({ x: 0, y: 0, w: 10000, h: 10000 });
  let svgEl: SVGSVGElement | null = null;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  // Zoom limits in world units (full tree is ~25k wide).
  const MIN_VIEW_W = 1500;
  const MAX_VIEW_W = 40000;

  $effect(() => {
    // Re-apply the viewBox whenever the view changes; the svg element is
    // (re)created by {@html} when a tree loads.
    const vb = `${view.x} ${view.y} ${view.w} ${view.h}`;
    if (!svgEl && container) svgEl = container.querySelector('svg');
    svgEl?.setAttribute('viewBox', vb);
  });

  // Hover tooltip
  let tip = $state<{ x: number; y: number; title: string; stats: string[] } | null>(null);

  const currentDelta = $derived.by(() => {
    if (!loaded || urlTrees.length === 0) return null;
    const specIndex = poe1ViewState.treeSpecIndex;
    const current = urlTrees[specIndex];
    const previous = specIndex > 0 ? urlTrees[specIndex - 1] : EMPTY_URL_TREE;
    return buildUrlTreeDelta(current, previous, loaded.skillTree);
  });

  const deltaCss = $derived(
    currentDelta && loaded
      ? buildDeltaStyles(STYLE_ID, currentDelta, urlTrees[poe1ViewState.treeSpecIndex]?.ascendancy?.id)
      : '',
  );

  onMount(() => {
    void init();
  });

  async function init() {
    status = 'loading';
    // The tree tab can be opened before the leveling guide has mounted —
    // make sure a stored build is restored either way.
    if (!levelingRoute.build) await restorePoe1Build();
    const build = loadPoe1Build();
    const trees = build?.buildTrees ?? [];
    if (trees.length === 0) {
      status = 'no-build';
      return;
    }

    // Upstream behavior: use the first tree's version, drop mismatches.
    const version = trees[0].version;
    const data = await loadSkillTree(version);
    if (!data) {
      unsupportedVersion = version;
      status = 'unsupported';
      return;
    }

    try {
      const activeTree = trees[build?.activeTreeIndex ?? 0];
      const matchingTrees = trees.filter((t) => t.version === version);
      const decoded: UrlTreeData[] = [];
      let activeDecodedIndex = 0;
      for (const t of matchingTrees) {
        const urlTree = decodeUrlTree(t, data);
        if (urlTree.nodes.length > 0) {
          if (t === activeTree) activeDecodedIndex = decoded.length;
          decoded.push(urlTree);
        }
      }
      if (decoded.length === 0) {
        status = 'no-build';
        return;
      }
      loaded = data;
      urlTrees = decoded;
      if (build) syncTreeSelectionToBuild(build.importedAt, activeDecodedIndex);
      poe1ViewState.treeSpecIndex = Math.min(poe1ViewState.treeSpecIndex, decoded.length - 1);
      status = 'ready';
      requestAnimationFrame(focusDelta);
    } catch (e) {
      errorMsg = String(e);
      status = 'error';
    }
  }

  /** Fit the current delta's bounding box into the viewport (aspect-corrected). */
  function focusDelta() {
    if (!loaded || !currentDelta || !container) return;
    const bounds = calculateBounds(currentDelta, loaded);
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0 || !isFinite(bounds.width)) return;
    svgEl = container.querySelector('svg');

    // Expand the bounds to the container's aspect ratio so "meet" fills it.
    const aspect = cw / ch;
    let { x, y, width, height } = bounds;
    if (width / height > aspect) {
      const newH = width / aspect;
      y -= (newH - height) / 2;
      height = newH;
    } else {
      const newW = height * aspect;
      x -= (newW - width) / 2;
      width = newW;
    }
    view = { x, y, w: width, h: height };
  }

  function step(dir: -1 | 1) {
    jump(poe1ViewState.treeSpecIndex + dir);
  }

  function jump(next: number) {
    if (next < 0 || next >= urlTrees.length) return;
    poe1ViewState.treeSpecIndex = next;
    tip = null;
    requestAnimationFrame(focusDelta);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!container) return;
    const factor = Math.pow(1.1, -e.deltaY / 100); // >1 zooms in
    const nextW = Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, view.w / factor));
    const applied = view.w / nextW; // actual factor after clamping
    const rect = container.getBoundingClientRect();
    // Cursor position in world coords stays fixed while zooming.
    const px = view.x + ((e.clientX - rect.left) / rect.width) * view.w;
    const py = view.y + ((e.clientY - rect.top) / rect.height) * view.h;
    const nextH = view.h / applied;
    view = {
      x: px - (px - view.x) / applied,
      y: py - (py - view.y) / applied,
      w: nextW,
      h: nextH,
    };
  }

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) {
      updateTip(e);
      return;
    }
    if (!container) return;
    const rect = container.getBoundingClientRect();
    view = {
      ...view,
      x: view.x - ((e.clientX - lastX) / rect.width) * view.w,
      y: view.y - ((e.clientY - lastY) / rect.height) * view.h,
    };
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onPointerUp() {
    dragging = false;
  }

  /** Event-delegated node tooltip: circles carry id="n<nodeId>". */
  function updateTip(e: PointerEvent) {
    const target = e.target as Element | null;
    const idAttr = target?.id ?? '';
    if (!loaded || !idAttr.startsWith('n') || target?.tagName !== 'circle') {
      tip = null;
      return;
    }
    const nodeId = idAttr.slice(1);
    const node = loaded.nodeLookup[nodeId];
    if (!node) {
      tip = null;
      return;
    }
    const rect = container!.getBoundingClientRect();
    let stats = node.stats ?? [];
    // Mastery nodes show the selected effect's stats when known.
    const effectId = currentDelta?.masteries[nodeId];
    if (effectId) {
      const effect = loaded.skillTree.masteryEffects[effectId];
      if (effect) stats = effect.stats;
    }
    tip = {
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top + 12,
      title: node.text,
      stats,
    };
  }
</script>

<div class="tree-view">
  <div class="tree-header ec-panel">
    <h3>{m.nav_tree()}</h3>
    {#if status === 'ready'}
      <div class="spec-nav">
        <button
          class="spec-btn"
          type="button"
          disabled={poe1ViewState.treeSpecIndex === 0}
          onclick={() => step(-1)}
          title={m.tree_prev()}
          aria-label={m.tree_prev()}
        >‹</button>
        {#if urlTrees.length > 1}
          <select
            class="spec-select"
            value={poe1ViewState.treeSpecIndex}
            aria-label={m.tree_set_label()}
            onchange={(e) => jump(+(e.currentTarget as HTMLSelectElement).value)}
          >
            {#each urlTrees as t, i (i)}
              <option value={i}>{t.name}</option>
            {/each}
          </select>
        {:else}
          <span class="spec-name">{urlTrees[poe1ViewState.treeSpecIndex]?.name}</span>
        {/if}
        <span class="spec-count">{poe1ViewState.treeSpecIndex + 1}/{urlTrees.length}</span>
        <button
          class="spec-btn"
          type="button"
          disabled={poe1ViewState.treeSpecIndex >= urlTrees.length - 1}
          onclick={() => step(1)}
          title={m.tree_next()}
          aria-label={m.tree_next()}
        >›</button>
      </div>
    {/if}
  </div>

  {#if status === 'loading'}
    <p class="tree-status">{m.leveling_loading()}</p>
  {:else if status === 'no-build'}
    <p class="tree-status">{m.tree_no_build()}</p>
  {:else if status === 'unsupported'}
    <p class="tree-status">{m.tree_version_unsupported({ version: unsupportedVersion })}</p>
  {:else if status === 'error'}
    <p class="tree-status error">{errorMsg}</p>
  {:else if loaded}
    <!-- eslint-disable-next-line svelte/no-at-html-tags — trusted, generated from vendored tree data -->
    {@html `<${'style'}>${deltaCss}</${'style'}>`}
    <div
      bind:this={container}
      class="viewport ec-panel"
      role="application"
      aria-label={m.nav_tree()}
      onwheel={onWheel}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointerleave={() => { onPointerUp(); tip = null; }}
    >
      <div id={STYLE_ID} class="tree-svg">
        <!-- eslint-disable-next-line svelte/no-at-html-tags — trusted, generated from vendored tree data -->
        {@html loaded.svg}
      </div>
      {#if tip}
        <div class="tip" style="left: {tip.x}px; top: {tip.y}px">
          <div class="tip-title">{tip.title}</div>
          {#each tip.stats as stat}
            <div class="tip-stat">{stat}</div>
          {/each}
        </div>
      {/if}
    </div>
    <div class="legend">
      <span class="key"><i class="dot added"></i> {m.tree_legend_added()}</span>
      <span class="key"><i class="dot active"></i> {m.tree_legend_active()}</span>
      <span class="key"><i class="dot removed"></i> {m.tree_legend_removed()}</span>
    </div>
  {/if}
</div>

<style>
  .tree-view {
    display: flex;
    flex-direction: column;
    gap: 4px;
    height: 100%;
    min-height: 0;
  }

  .tree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    flex-shrink: 0;
  }

  .tree-header h3 {
    margin: 0;
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-primary);
  }

  .spec-nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .spec-btn {
    width: 24px;
    height: 22px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 30%, transparent);
    background: color-mix(in srgb, var(--c-mid) 80%, transparent);
    color: var(--c-primary);
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s;
  }
  .spec-btn:hover:not(:disabled) {
    border-color: var(--c-red);
    color: var(--c-red-bright);
  }
  .spec-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .spec-name {
    font-size: 11px;
    color: var(--c-primary);
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spec-select {
    max-width: 190px;
    padding: 3px 18px 3px 6px;
    background-color: color-mix(in srgb, var(--c-mid) 80%, transparent);
    border: 1px solid color-mix(in srgb, var(--c-accent) 30%, transparent);
    border-radius: var(--radius);
    color: var(--c-primary);
    font-size: 11px;
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s;
  }
  .spec-select:hover,
  .spec-select:focus {
    border-color: var(--c-red);
  }
  .spec-select option {
    background: var(--c-bg);
    color: var(--c-primary);
  }

  .spec-count {
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 9px;
    color: var(--c-accent);
    margin-left: 4px;
  }

  .tree-status {
    font-size: 11px;
    color: var(--c-accent);
    padding: 8px 2px;
  }
  .tree-status.error {
    color: var(--c-red-bright);
  }

  .viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .viewport:active {
    cursor: grabbing;
  }

  .tree-svg {
    position: absolute;
    inset: 0;
  }
  .tree-svg :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .tip {
    position: absolute;
    z-index: 10;
    max-width: 280px;
    padding: 6px 9px;
    background: var(--c-bg);
    border: 1px solid color-mix(in srgb, var(--c-accent) 35%, transparent);
    pointer-events: none;
  }

  .tip-title {
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: var(--c-primary);
    margin-bottom: 2px;
  }

  .tip-stat {
    font-size: 10px;
    line-height: 1.35;
    color: var(--c-accent);
  }

  .legend {
    display: flex;
    gap: 14px;
    padding: 2px 4px;
    flex-shrink: 0;
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 9px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--c-accent);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
  }
  .dot.added {
    background: var(--c-success);
  }
  .dot.active {
    background: var(--c-primary);
  }
  .dot.removed {
    background: var(--c-red-bright);
  }
</style>
