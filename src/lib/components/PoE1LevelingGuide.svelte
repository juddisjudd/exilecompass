<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    levelingRoute,
    ensureRouteLoaded,
    loadRouteConfig,
    setRouteConfig,
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
    poe1LevelingProgress.load();
    poe1GemProgress.load();
    loadRouteConfig();
    // Restore a stored PoB build first (its rebuild parses the route); then
    // ensure the route exists even with no stored build.
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
    <h3>{m.leveling_guide_title()}</h3>
    <div class="header-right">
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
      {#if levelingRoute.build}
        <span class="build-chip" title={m.leveling_build_imported()}>
          {levelingRoute.build.characterClass} · {levelingRoute.build.bandit}
        </span>
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
      class="act-group ec-panel"
      class:complete={isComplete}
      class:complete-collapsed={isComplete && !expanded}
    >
      <div class="act-header-row">
        <button class="act-header" onclick={() => toggleSection(section.id)} type="button">
          <span class="toggle-icon" class:expanded>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </span>
          <span class="act-title">{section.name}</span>
          {#if isComplete}
            <span class="badge-complete">✓ {m.campaign_complete_badge()}</span>
          {/if}
          <span class="act-progress" class:complete={isComplete}>
            {progress.completed}/{progress.total}
          </span>
        </button>
        <button
          class="act-complete-btn"
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
            <div class="step-row" class:done class:gem-row={step.kind === 'gem'}>
              <label class="step-label">
                <input
                  type="checkbox"
                  checked={done}
                  onchange={() => toggleStep(step)}
                  class="ec-checkbox step-checkbox"
                />
                {#if step.kind === 'gem'}
                  <span class="step-text">
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
                  <span class="step-text">
                    {#each step.parts as part}{@render renderPart(part)}{/each}
                  </span>
                {/if}
              </label>

              {#if step.kind === 'fragment' && step.subSteps.length > 0}
                <div class="step-notes">
                  {#each step.subSteps as sub (sub.id)}
                    <div class="note">
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
    gap: 4px;
  }

  .guide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    margin-bottom: 2px;
  }

  .guide-header h3 {
    margin: 0;
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-primary);
    text-shadow: 0 0 12px color-mix(in srgb, var(--c-primary) 40%, transparent);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .cfg-check {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: var(--c-accent);
    cursor: pointer;
    white-space: nowrap;
  }

  .cfg-checkbox {
    width: 13px;
    height: 13px;
  }

  .build-chip {
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 0.04em;
    color: var(--c-red-bright);
    border: 1px solid color-mix(in srgb, var(--c-red) 40%, transparent);
    padding: 2px 7px;
    white-space: nowrap;
  }

  .route-status {
    font-size: 11px;
    color: var(--c-accent);
    padding: 6px 2px;
  }
  .route-status.error {
    color: var(--c-red-bright);
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

  /* Act (section) group — same visual language as CampaignGuide's act-group,
     minus the yellow "required-but-not-optional" tri-state (leveling steps
     have no optional flag, just done/not-done). */
  .act-group {
    overflow: hidden;
    transition: border-color 0.25s;
  }

  .act-group.complete {
    border-color: color-mix(in srgb, var(--c-success) 28%, transparent);
  }

  .act-group.complete-collapsed {
    opacity: 0.55;
    transition: opacity 0.2s;
  }
  .act-group.complete-collapsed:hover {
    opacity: 0.85;
  }

  .act-header-row {
    display: flex;
    align-items: stretch;
  }

  .act-header {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--c-bg) 84%, var(--c-mid));
    border: none;
    color: var(--c-primary);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    cursor: pointer;
    transition: background 0.15s;
    text-align: left;
    gap: 8px;
  }

  .act-header:hover {
    background: color-mix(in srgb, var(--c-bg) 78%, var(--c-mid));
  }

  .act-complete-btn {
    flex-shrink: 0;
    width: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--c-bg) 84%, var(--c-mid));
    border: none;
    border-left: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    color: color-mix(in srgb, var(--c-success) 70%, var(--c-accent));
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .act-complete-btn:hover {
    background: color-mix(in srgb, var(--c-success) 16%, transparent);
    color: color-mix(in srgb, var(--c-success) 80%, white 20%);
  }
  .act-complete-btn.done {
    color: color-mix(in srgb, var(--c-muted) 80%, #fff 12%);
    font-size: 12px;
  }
  .act-complete-btn.done:hover {
    background: color-mix(in srgb, var(--c-red) 14%, transparent);
    color: var(--c-red-bright);
  }

  .complete .act-header {
    color: color-mix(in srgb, var(--c-success) 80%, var(--c-primary) 20%);
    text-shadow: 0 0 10px color-mix(in srgb, var(--c-success) 30%, transparent);
  }

  .toggle-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    transform: rotate(90deg);
    transition: transform 0.2s ease, opacity 0.15s;
    opacity: 0.6;
  }
  .toggle-icon svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .toggle-icon.expanded {
    transform: rotate(180deg);
    opacity: 0.9;
  }

  .act-title {
    flex: 1;
  }

  .badge-complete {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--c-success) 12%, transparent);
    color: color-mix(in srgb, var(--c-success) 80%, white 20%);
    border: 1px solid color-mix(in srgb, var(--c-success) 34%, transparent);
    flex-shrink: 0;
  }

  .act-progress {
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    letter-spacing: 0.04em;
    min-width: 36px;
    text-align: right;
    font-feature-settings: 'tnum';
  }

  .act-progress.complete {
    color: var(--c-success);
  }

  .progress-bar-track {
    height: 2px;
    background: color-mix(in srgb, var(--c-mid) 60%, transparent);
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--c-accent), var(--c-primary));
    transition: width 0.4s ease;
  }

  .progress-bar-fill.complete {
    background: linear-gradient(90deg, var(--c-success-deep), var(--c-success));
  }

  /* Steps */
  .steps-container {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px;
    background: color-mix(in srgb, var(--c-bg) 97%, var(--c-mid));
  }

  .step-row {
    padding: 4px 10px 4px 8px;
    border-left: 2px solid transparent;
    transition: background 0.1s, transform 0.1s;
  }

  .step-row:hover {
    background: color-mix(in srgb, var(--c-accent) 5%, transparent);
    transform: translateX(1px);
  }

  .step-row.done {
    opacity: 0.5;
  }

  .step-label {
    display: flex;
    align-items: baseline;
    gap: 6px;
    cursor: pointer;
  }

  .step-checkbox {
    margin-top: 1px;
    align-self: flex-start;
    flex-shrink: 0;
  }

  .step-text {
    font-size: 11px;
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%);
    line-height: 1.5;
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 4px;
  }

  .done .step-text {
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--c-accent) 50%, transparent);
  }

  .step-notes {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 3px 0 2px 19px;
    padding: 3px 6px;
    border-left: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent);
  }

  .note {
    font-size: 10px;
    color: color-mix(in srgb, var(--c-muted) 88%, #fff 12%);
    line-height: 1.4;
    font-style: italic;
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
    text-shadow: 0 0 8px color-mix(in srgb, var(--c-primary) 30%, transparent);
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
    transition: color 0.15s;
  }
  .frag-copy:hover {
    color: var(--c-red-bright);
  }
</style>
