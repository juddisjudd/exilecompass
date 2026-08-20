<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    levelingRoute,
    ensureRouteLoaded,
    loadRouteConfig,
    setRouteConfig,
    jumpToEdge,
    poe1GemProgress,
    type LevelingPart,
    type LevelingStep,
  } from '$lib/levelingRoute.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { poe1LevelingProgress } from '$lib/poe1LevelingProgress.svelte';
  import { restorePoe1Build } from '$lib/poe1Pob';
  import ConfirmReset from './ConfirmReset.svelte';

  // Mirrors CampaignGuide.svelte's pattern: completion lives in the shared
  // progress modules (fragment steps by step id, gem steps by gem id), this
  // component only owns expand/collapse UI state. The route itself is parsed
  // at runtime by levelingRoute.svelte.ts and reacts to build config + an
  // imported PoB build (gem-reward steps).
  interface GuideState {
    expandedSections: Set<string>;
  }

  const STATE_KEY = 'POE1_LEVELING_GUIDE_STATE_V1';

  let guideState = $state<GuideState>({
    expandedSections: new SvelteSet<string>(),
  });

  let lastCopied = $state<string | null>(null);

  onMount(() => {
    loadRouteConfig();
    // Restore the active stored build first — this also scopes
    // poe1LevelingProgress/poe1GemProgress/the auto-progress edge tracker to
    // that build (or the default bucket if none is active), see poe1Pob.ts.
    // Its rebuild parses the route; then ensure the route exists even with no
    // stored build.
    void (async () => {
      await restorePoe1Build();
      await ensureRouteLoaded();
    })();
    const saved = window.localStorage.getItem(STATE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        guideState.expandedSections = new SvelteSet<string>(parsed.expandedSections ?? []);
      } catch {
        // ignore corrupted state
      }
    }
  });

  function saveState() {
    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ expandedSections: Array.from(guideState.expandedSections) }),
    );
  }

  function toggleSection(id: string) {
    if (guideState.expandedSections.has(id)) {
      guideState.expandedSections.delete(id);
    } else {
      guideState.expandedSections.add(id);
    }
    saveState();
  }

  function stepDone(step: LevelingStep): boolean {
    return step.kind === 'gem' ? poe1GemProgress.has(step.gemId) : poe1LevelingProgress.has(step.id);
  }

  // ── Auto-progress: "you are here" marker + auto-scroll/expand ─────────────
  // Position tracking only — never touches completion state above.
  const stepRefs: Record<string, HTMLElement> = {};

  function trackStepRef(node: HTMLElement, id: string) {
    stepRefs[id] = node;
    return {
      destroy() {
        if (stepRefs[id] === node) delete stepRefs[id];
      },
    };
  }

  $effect(() => {
    const activeId = levelingRoute.activeStepId;
    if (!activeId || !levelingRoute.config.autoProgress) return;

    const owningSection = levelingRoute.sections.find((s) => s.steps.some((step) => step.id === activeId));
    if (owningSection && !guideState.expandedSections.has(owningSection.id)) {
      guideState.expandedSections.add(owningSection.id);
      saveState();
    }

    requestAnimationFrame(() => {
      stepRefs[activeId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  function toggleStep(step: LevelingStep) {
    if (step.kind === 'gem') poe1GemProgress.toggle(step.gemId);
    else poe1LevelingProgress.toggle(step.id);
  }

  function setSectionDone(steps: LevelingStep[], done: boolean) {
    poe1LevelingProgress.setMany(
      steps.filter((s) => s.kind === 'fragment').map((s) => s.id),
      done,
    );
    poe1GemProgress.setMany(
      steps.filter((s) => s.kind === 'gem').map((s) => (s as { gemId: string }).gemId),
      done,
    );
  }

  type SectionStatus = 'none' | 'complete';

  function summarize(
    steps: LevelingStep[],
  ): { completed: number; total: number; pct: number; status: SectionStatus } {
    let completed = 0;
    const total = steps.length;
    for (const step of steps) {
      if (stepDone(step)) completed++;
    }
    const status: SectionStatus = total > 0 && completed === total ? 'complete' : 'none';
    return { completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0, status };
  }

  function resetProgress() {
    poe1LevelingProgress.resetAll();
    poe1GemProgress.resetAll();
    // Collapse every act and snap the "you are here" marker back to the
    // Act 1 start — a progress reset should look and feel like a fresh route,
    // not leave stale expand state / position from the run being cleared.
    guideState.expandedSections = new SvelteSet<string>();
    saveState();
    jumpToEdge(0);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      lastCopied = text;
      setTimeout(() => {
        if (lastCopied === text) lastCopied = null;
      }, 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }
</script>

{#snippet iconWaypoint()}
  <svg class="frag-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 9-7 9-7-9z" /></svg>
{/snippet}

{#snippet iconPortal()}
  <svg class="frag-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><ellipse cx="12" cy="12" rx="6" ry="9" /></svg>
{/snippet}

{#snippet iconQuest()}
  <svg class="frag-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><line x1="12" y1="7.5" x2="12" y2="13" /><circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none" /></svg>
{/snippet}

{#snippet iconDot()}
  <svg class="frag-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor" /></svg>
{/snippet}

{#snippet iconPosition(active: boolean)}
  <svg class="pos-ico" class:active viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="7" /></svg>
{/snippet}

{#snippet iconArrow(dirIndex: number)}
  <svg class="frag-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate({dirIndex * 45}deg)" aria-hidden="true"><path d="M12 19V5M12 5l-6 6M12 5l6 6" /></svg>
{/snippet}

{#snippet iconCopy()}
  <svg class="frag-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="9" y="9" width="11" height="11" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>
{/snippet}

{#snippet iconCheck()}
  <svg class="frag-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-11" /></svg>
{/snippet}

{#snippet renderPart(part: LevelingPart)}
  {#if part.type === 'text'}
    <span class="frag-text">{part.value}</span>
  {:else if part.type === 'kill'}
    <span class="frag-kill">{part.value}</span>
  {:else if part.type === 'arena'}
    <span class="frag-area">{part.value}</span>
  {:else if part.type === 'area' || part.type === 'enter' || part.type === 'logout' || part.type === 'portal_use'}
    <span class="frag-area" class:town={part.isTown}>{part.name}</span>
    {#if part.level != null && !part.isTown}<span class="frag-level">Lv {part.level}+</span>{/if}
  {:else if part.type === 'waypoint' || part.type === 'waypoint_get'}
    {@render iconWaypoint()}<span class="frag-label">{m.leveling_waypoint()}</span>
  {:else if part.type === 'waypoint_use'}
    {@render iconWaypoint()}<span class="frag-label">{m.leveling_waypoint()}</span>
    <span class="frag-arrow">➞</span>
    <span class="frag-area">{part.name}</span>
    {#if part.crossesAct}<span class="frag-level">Act {part.crossesAct}</span>{/if}
  {:else if part.type === 'portal_set'}
    {@render iconPortal()}<span class="frag-label">{m.leveling_portal()}</span>
  {:else if part.type === 'quest'}
    {@render iconQuest()}<span class="frag-quest">{part.name}</span>
    {#if part.npcs.length > 0}<span class="frag-npc">— {part.npcs.join(', ')}</span>{/if}
  {:else if part.type === 'quest_text'}
    <span class="frag-quest-text">{part.value}</span>
  {:else if part.type === 'generic'}
    <span class="frag-text">{part.value}</span>
  {:else if part.type === 'reward_quest'}
    <span class="frag-reward">{part.item}</span>
  {:else if part.type === 'reward_vendor'}
    <span class="frag-reward">{part.item}</span>{#if part.cost}<span class="frag-cost">({part.cost})</span>{/if}
  {:else if part.type === 'trial'}
    {@render iconDot()}<span class="frag-label">{m.leveling_trial()}</span>
  {:else if part.type === 'ascend'}
    {@render iconDot()}<span class="frag-label">{m.leveling_ascend()} ({part.version})</span>
  {:else if part.type === 'crafting'}
    {@render iconDot()}<span class="frag-label">{m.leveling_crafting()}: {part.recipes.join(', ')}</span>
  {:else if part.type === 'dir'}
    {@render iconArrow(part.dirIndex)}
  {:else if part.type === 'copy'}
    <button
      class="frag-copy"
      type="button"
      onclick={() => copyText(part.text)}
      title={m.leveling_copy()}
      aria-label={m.leveling_copy()}
    >
      {#if lastCopied === part.text}{@render iconCheck()}{:else}{@render iconCopy()}{/if}
    </button>
  {/if}
{/snippet}

<div class="leveling-guide">
  <div class="guide-header ec-panel">
    <div class="guide-title">
      <h3>{m.leveling_guide_title()}</h3>
      <span class="game-tag game-tag-poe1">{m.game_switch_poe1()}</span>
    </div>
    <div class="guide-header-actions">
      <label class="cfg-check" title={m.leveling_cfg_league_start()}>
        <input
          type="checkbox"
          class="ec-checkbox cfg-checkbox"
          checked={levelingRoute.config.leagueStart}
          onchange={(e) => setRouteConfig({ leagueStart: (e.currentTarget as HTMLInputElement).checked })}
        />
        <span>{m.leveling_cfg_league_start()}</span>
      </label>
      <label class="cfg-check" title={m.leveling_cfg_library()}>
        <input
          type="checkbox"
          class="ec-checkbox cfg-checkbox"
          checked={levelingRoute.config.library}
          onchange={(e) => setRouteConfig({ library: (e.currentTarget as HTMLInputElement).checked })}
        />
        <span>{m.leveling_cfg_library()}</span>
      </label>
      <label class="cfg-check" title={m.leveling_cfg_auto_progress()}>
        <input
          type="checkbox"
          class="ec-checkbox cfg-checkbox"
          checked={levelingRoute.config.autoProgress}
          onchange={(e) => setRouteConfig({ autoProgress: (e.currentTarget as HTMLInputElement).checked })}
        />
        <span>{m.leveling_cfg_auto_progress()}</span>
      </label>
      {#if levelingRoute.build}
        <label class="cfg-check" title={m.leveling_cfg_show_gems()}>
          <input
            type="checkbox"
            class="ec-checkbox cfg-checkbox"
            checked={levelingRoute.config.showGems}
            onchange={(e) => setRouteConfig({ showGems: (e.currentTarget as HTMLInputElement).checked })}
          />
          <span>{m.leveling_cfg_show_gems()}</span>
        </label>
      {/if}
      <ConfirmReset
        label={m.action_reset()}
        prompt={m.confirm_reset_leveling_progress()}
        title={m.leveling_reset_progress_title()}
        onconfirm={resetProgress}
      />
    </div>
  </div>

  {#if levelingRoute.loading}
    <p class="route-status">{m.leveling_loading()}</p>
  {:else if levelingRoute.error}
    <p class="route-status error">{levelingRoute.error}</p>
  {/if}

  {#each levelingRoute.sections as section (section.id)}
    {@const progress = summarize(section.steps)}
    {@const isComplete = progress.status === 'complete'}
    {@const expanded = guideState.expandedSections.has(section.id)}
    <div
      class="guide-group ec-panel"
      class:complete={isComplete}
      class:complete-collapsed={isComplete && !expanded}
    >
      <div class="guide-group-row">
        <button class="guide-group-header" onclick={() => toggleSection(section.id)} type="button">
          <span class="guide-toggle-icon" class:expanded>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </span>
          <span class="guide-group-title">{section.name}</span>
          {#if isComplete}
            <span class="tag tag-complete">✓ {m.campaign_complete_badge()}</span>
          {/if}
          <span class="guide-progress" class:complete={isComplete}>
            {progress.completed}/{progress.total}
          </span>
        </button>
        <button
          class="guide-group-action"
          class:done={isComplete}
          onclick={() => setSectionDone(section.steps, !isComplete)}
          title={isComplete ? m.leveling_clear_section() : m.leveling_mark_section_complete()}
          aria-label={isComplete ? m.leveling_clear_section() : m.leveling_mark_section_complete()}
          type="button"
        >
          {isComplete ? '↺' : '✓'}
        </button>
      </div>

      <div class="progress-bar-track">
        <div class="progress-bar-fill" class:complete={isComplete} style="width: {progress.pct}%"></div>
      </div>

      {#if expanded}
        <div class="steps-container">
          {#each section.steps as step (step.id)}
            {@const done = stepDone(step)}
            {@const edgeIndex = step.kind === 'fragment' ? levelingRoute.edgeIndexForStep(step.id) : null}
            {@const isActiveStep = step.id === levelingRoute.activeStepId}
            <div
              class="guide-row"
              class:done
              class:gem-row={step.kind === 'gem'}
              class:active-row={levelingRoute.config.autoProgress && isActiveStep}
              use:trackStepRef={step.id}
            >
              <label class="guide-row-label">
                {#if levelingRoute.config.autoProgress && edgeIndex !== null}
                  <button
                    type="button"
                    class="pos-marker"
                    onclick={(e) => { e.preventDefault(); jumpToEdge(edgeIndex); }}
                    title={m.leveling_auto_progress_jump()}
                    aria-label={m.leveling_auto_progress_jump()}
                  >
                    {@render iconPosition(isActiveStep)}
                  </button>
                {/if}
                <input
                  type="checkbox"
                  checked={done}
                  onchange={() => toggleStep(step)}
                  class="ec-checkbox guide-row-checkbox"
                />
                {#if step.kind === 'gem'}
                  <span class="guide-row-text">
                    <span class="gem-dot" style="background: {step.colour}" aria-hidden="true"></span>
                    <span class="frag-text">{step.rewardType === 'quest' ? m.leveling_gem_take() : m.leveling_gem_buy()}</span>
                    <span class="gem-name">{step.name}</span>
                    {#if step.count > 1}<span class="frag-level">x{step.count}</span>{/if}
                    {#if step.cost}<span class="frag-cost">({step.cost})</span>{/if}
                    {#if step.note}<span class="frag-npc">— {step.note}</span>{/if}
                    <button
                      class="frag-copy"
                      type="button"
                      onclick={(e) => { e.preventDefault(); copyText(step.name); }}
                      title={m.leveling_copy()}
                      aria-label={m.leveling_copy()}
                    >
                      {#if lastCopied === step.name}{@render iconCheck()}{:else}{@render iconCopy()}{/if}
                    </button>
                  </span>
                {:else}
                  <span class="guide-row-text">
                    {#each step.parts as part}{@render renderPart(part)}{/each}
                  </span>
                {/if}
              </label>

              {#if step.kind === 'fragment' && step.subSteps.length > 0}
                <div class="guide-row-notes">
                  {#each step.subSteps as sub (sub.id)}
                    <div class="guide-note">
                      › {#each sub.parts as part}{@render renderPart(part)}{/each}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .leveling-guide {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .route-status {
    font-size: 11px;
    color: var(--c-accent);
    padding: 6px 2px;
  }
  .route-status.error {
    color: var(--c-red-bright);
  }

  .guide-group-action.done:hover {
    background: color-mix(in srgb, var(--c-red) 14%, transparent);
    color: var(--c-red-bright);
  }

  .steps-container {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--sp-1);
    background: color-mix(in srgb, var(--c-bg) 97%, var(--c-mid));
  }

  /* Gem-reward steps (from an imported PoB build) */
  .gem-row {
    border-left: 2px solid color-mix(in srgb, var(--c-red) 35%, transparent);
  }

  .gem-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 1px solid rgba(0, 0, 0, 0.4);
  }

  .gem-name {
    color: var(--c-primary);
    font-weight: 600;
  }

  .guide-row :global(.pos-marker) {
    width: 14px;
    height: 14px;
    margin-top: 1px;
  }

  .guide-row-text {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 4px;
  }

  .guide-note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 4px;
  }

  /* Fragment parts */
  .frag-ico {
    width: 11px;
    height: 11px;
    flex-shrink: 0;
    vertical-align: -1px;
  }

  .frag-text,
  .frag-quest-text,
  .frag-kill {
    color: inherit;
  }

  .frag-kill {
    color: color-mix(in srgb, var(--c-red) 75%, var(--c-primary) 25%);
    font-weight: 600;
  }

  .frag-area {
    color: var(--c-primary);
    font-weight: 500;
  }

  .frag-area.town {
    color: color-mix(in srgb, var(--c-success) 75%, var(--c-primary) 25%);
  }

  .frag-level {
    font-size: 9px;
    color: var(--c-muted);
    font-feature-settings: 'tnum';
  }

  .frag-label {
    color: color-mix(in srgb, var(--c-accent) 90%, #fff 10%);
    font-weight: 500;
  }

  .frag-arrow {
    color: var(--c-muted);
  }

  .frag-quest {
    color: color-mix(in srgb, var(--c-accent) 92%, #fff 8%);
    font-weight: 600;
  }

  .frag-npc {
    color: var(--c-muted);
    font-style: italic;
  }

  .frag-reward {
    color: var(--c-primary);
  }

  .frag-cost {
    color: var(--c-muted);
    font-size: 9px;
  }

  .frag-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--c-accent);
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .frag-copy:hover {
    color: var(--c-red-bright);
  }
</style>
