<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { CAMPAIGN_DATA } from '$lib/campaign';
  import { m } from '$lib/paraglide/messages.js';
  import { trAct, trZone, trObjective, trObjectiveReward, trNotes, trActTip } from '$lib/dataI18n';
  import { campaignProgress } from '$lib/campaignProgress.svelte';
  import { campaignAutoProgress, jumpToEdge, setEnabled as setAutoProgressEnabled } from '$lib/campaignAutoProgress.svelte';
  import ConfirmReset from './ConfirmReset.svelte';

  // Completion lives in the shared module (so global hotkeys can mark objectives).
  // The component only owns the expand/collapse UI state.
  interface GuideState {
    expandedActs: Set<number>;
    expandedZones: Set<string>;
    expandedTips: Set<number>;
  }

  const STATE_KEY = 'CAMPAIGN_GUIDE_STATE_V1';
  const SHOW_LEAGUE_KEY = 'EXILECOMPASS_CAMPAIGN_SHOW_LEAGUE_V1';

  let guideState = $state<GuideState>({
    expandedActs: new SvelteSet<number>(),
    expandedZones: new SvelteSet<string>(),
    expandedTips: new SvelteSet<number>(),
  });

  // Hides steps/tips tied to the current league mechanic once it goes stale.
  // Defaults to shown so nothing disappears silently on upgrade.
  let showLeagueMechanics = $state(true);

  onMount(() => {
    campaignProgress.load();
    const saved = window.localStorage.getItem(STATE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        guideState.expandedActs = new SvelteSet<number>(parsed.expandedActs ?? []);
        guideState.expandedZones = new SvelteSet<string>(parsed.expandedZones ?? []);
        guideState.expandedTips = new SvelteSet<number>(parsed.expandedTips ?? []);
      } catch {
        // ignore corrupted state
      }
    }
    const savedShowLeague = window.localStorage.getItem(SHOW_LEAGUE_KEY);
    if (savedShowLeague !== null) showLeagueMechanics = savedShowLeague === 'true';
  });

  function saveState() {
    const toSave = {
      expandedActs: Array.from(guideState.expandedActs),
      expandedZones: Array.from(guideState.expandedZones),
      expandedTips: Array.from(guideState.expandedTips),
    };
    window.localStorage.setItem(STATE_KEY, JSON.stringify(toSave));
  }

  function toggleShowLeagueMechanics(value: boolean) {
    showLeagueMechanics = value;
    window.localStorage.setItem(SHOW_LEAGUE_KEY, String(value));
  }

  function toggleAct(actNumber: number) {
    if (guideState.expandedActs.has(actNumber)) {
      guideState.expandedActs.delete(actNumber);
    } else {
      guideState.expandedActs.add(actNumber);
    }
    saveState();
  }

  function toggleZone(zoneId: string) {
    if (guideState.expandedZones.has(zoneId)) {
      guideState.expandedZones.delete(zoneId);
    } else {
      guideState.expandedZones.add(zoneId);
    }
    saveState();
  }

  function toggleTips(actNumber: number) {
    if (guideState.expandedTips.has(actNumber)) {
      guideState.expandedTips.delete(actNumber);
    } else {
      guideState.expandedTips.add(actNumber);
    }
    saveState();
  }

  function toggleObjective(objId: string) {
    campaignProgress.toggle(objId);
  }

  // Completion state for a section (zone or whole act):
  //   'complete' — every objective, including optional, is checked → green
  //   'required' — all required done but optional items remain → yellow
  //                (the state the "complete next required" hotkey leaves you in)
  //   'none'     — required work still outstanding (or no objectives)
  type SectionStatus = 'none' | 'required' | 'complete';

  function summarize(
    objectives: { id: string; optional?: boolean }[],
  ): { completed: number; total: number; pct: number; status: SectionStatus } {
    let completed = 0;
    let total = 0;
    let reqTotal = 0;
    let reqDone = 0;
    for (const obj of objectives) {
      total++;
      const done = campaignProgress.has(obj.id);
      if (done) completed++;
      if (!obj.optional) {
        reqTotal++;
        if (done) reqDone++;
      }
    }
    let status: SectionStatus = 'none';
    if (total > 0 && reqDone === reqTotal) {
      status = completed === total ? 'complete' : 'required';
    }
    return { completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0, status };
  }

  function resetProgress() {
    campaignProgress.resetAll();
  }

  // ── Auto-progress: "you are here" marker + auto-scroll/expand ─────────────
  // Position tracking only — never touches completion state above. Mirrors
  // PoE1LevelingGuide.svelte's identical pattern.
  const zoneRefs: Record<string, HTMLElement> = {};

  function trackZoneRef(node: HTMLElement, zoneId: string) {
    zoneRefs[zoneId] = node;
    return {
      destroy() {
        if (zoneRefs[zoneId] === node) delete zoneRefs[zoneId];
      },
    };
  }

  $effect(() => {
    const activeZoneId = campaignAutoProgress.activeZoneId;
    if (!activeZoneId || !campaignAutoProgress.enabled) return;

    const owningAct = CAMPAIGN_DATA.find((a) => a.zones.some((z) => z.id === activeZoneId));
    if (owningAct && !guideState.expandedActs.has(owningAct.number)) {
      guideState.expandedActs.add(owningAct.number);
      saveState();
    }
    if (!guideState.expandedZones.has(activeZoneId)) {
      guideState.expandedZones.add(activeZoneId);
      saveState();
    }

    requestAnimationFrame(() => {
      zoneRefs[activeZoneId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
</script>

{#snippet iconPosition(active: boolean)}
  <svg class="pos-ico" class:active viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="7" /></svg>
{/snippet}

<div class="campaign-guide">
  <div class="guide-header ec-panel">
    <div class="guide-title">
      <h3>{m.campaign_guide_title()}</h3>
      <span class="game-tag game-tag-poe2">{m.game_switch_poe2()}</span>
    </div>
    <div class="guide-header-actions">
      <label class="cfg-check" title={m.campaign_show_league_toggle_title()}>
        <input
          type="checkbox"
          class="ec-checkbox cfg-checkbox"
          checked={showLeagueMechanics}
          onchange={(e) => toggleShowLeagueMechanics((e.currentTarget as HTMLInputElement).checked)}
        />
        <span>{m.campaign_show_league_toggle()}</span>
      </label>
      <label class="cfg-check" title={m.campaign_auto_progress_toggle_title()}>
        <input
          type="checkbox"
          class="ec-checkbox cfg-checkbox"
          checked={campaignAutoProgress.enabled}
          onchange={(e) => setAutoProgressEnabled((e.currentTarget as HTMLInputElement).checked)}
        />
        <span>{m.campaign_cfg_auto_progress()}</span>
      </label>
      <ConfirmReset
        label={m.action_reset()}
        prompt={m.confirm_reset_campaign_progress()}
        title={m.campaign_reset_progress_title()}
        onconfirm={resetProgress}
      />
    </div>
  </div>

  {#each CAMPAIGN_DATA as act (act.number)}
    {@const objectives = act.zones
      .flatMap((z) => z.objectives)
      .filter((o) => showLeagueMechanics || !o.league)}
    {@const progress = summarize(objectives)}
    {@const visibleTips = (act.tips ?? []).filter((t) => showLeagueMechanics || !t.league)}
    {@const isComplete = progress.status === 'complete'}
    {@const isRequired = progress.status === 'required'}
    {@const expanded = guideState.expandedActs.has(act.number)}
    <div
      class="guide-group ec-panel"
      class:complete={isComplete}
      class:required={isRequired}
      class:complete-collapsed={isComplete && !expanded}
    >
      <div class="guide-group-row">
        <button
          class="guide-group-header"
          onclick={() => toggleAct(act.number)}
          type="button"
        >
          <span class="guide-toggle-icon" class:expanded>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
          </span>
          <span class="guide-group-title">{trAct(act.number, act.name)}</span>
          {#if act.temporary}
            <span class="tag tag-interlude">{m.campaign_interlude_badge()}</span>
          {/if}
          {#if isComplete}
            <span class="tag tag-complete">✓ {m.campaign_complete_badge()}</span>
          {/if}
          <span class="guide-progress" class:complete={isComplete} class:required={isRequired}>
            {progress.completed}/{progress.total}
          </span>
        </button>
        <button
          class="guide-group-action"
          class:done={isComplete}
          onclick={() => campaignProgress.setMany(objectives.map((o) => o.id), !isComplete)}
          title={isComplete ? m.campaign_clear_act() : m.campaign_mark_act_complete()}
          aria-label={isComplete ? m.campaign_clear_act() : m.campaign_mark_act_complete()}
          type="button"
        >
          {isComplete ? '↺' : '✓'}
        </button>
      </div>

      <div class="progress-bar-track">
        <div
          class="progress-bar-fill"
          class:complete={isComplete}
          class:required={isRequired}
          style="width: {progress.pct}%"
        ></div>
      </div>

      {#if expanded}
        {#if visibleTips.length > 0}
          {@const tipsExpanded = guideState.expandedTips.has(act.number)}
          <div class="tips-box" class:expanded={tipsExpanded}>
            <button class="tips-header" onclick={() => toggleTips(act.number)} type="button">
              <span class="guide-toggle-icon" class:expanded={tipsExpanded}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
              </span>
              <svg class="tips-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
              </svg>
              <span class="tips-title">{m.campaign_tips_title()}</span>
              <span class="tips-count">{visibleTips.length}</span>
            </button>
            {#if tipsExpanded}
              <ul class="tips-list">
                {#each act.tips ?? [] as tip, i}
                  {#if showLeagueMechanics || !tip.league}
                    <li class="tip-item">
                      <span class="tip-text">{trActTip(act.number, i, tip.text)}</span>
                      {#if tip.league}
                        <span class="tag tag-league" title={m.campaign_league_badge_title()}>{m.campaign_league_badge()}</span>
                      {/if}
                    </li>
                  {/if}
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
        <div class="zones-container">
          {#each act.zones as zone (zone.id)}
            {@const zoneObjectives = zone.objectives.filter((o) => showLeagueMechanics || !o.league)}
            {#if zoneObjectives.length > 0}
            {@const zoneStatus = summarize(zoneObjectives).status}
            {@const zoneEdgeIndex = campaignAutoProgress.edgeIndexForZone(zone.id)}
            {@const isActiveZone = zone.id === campaignAutoProgress.activeZoneId}
            <div
              class="zone-group ec-panel"
              class:complete={zoneStatus === 'complete'}
              class:required={zoneStatus === 'required'}
              class:active-zone={campaignAutoProgress.enabled && isActiveZone}
              use:trackZoneRef={zone.id}
            >
              <div class="zone-header-row">
                {#if campaignAutoProgress.enabled && zoneEdgeIndex !== null}
                  <button
                    type="button"
                    class="pos-marker"
                    onclick={() => jumpToEdge(zoneEdgeIndex)}
                    title={m.campaign_auto_progress_jump()}
                    aria-label={m.campaign_auto_progress_jump()}
                  >
                    {@render iconPosition(isActiveZone)}
                  </button>
                {/if}
                <button
                  class="zone-header"
                  onclick={() => toggleZone(zone.id)}
                  type="button"
                >
                  <span class="guide-toggle-icon" class:expanded={guideState.expandedZones.has(zone.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                  </span>
                  <span class="zone-title">{trZone(zone.id, zone.name)}</span>
                  {#if zoneStatus === 'complete'}
                    <span class="zone-check" aria-hidden="true">✓</span>
                  {/if}
                </button>
              </div>

              {#if guideState.expandedZones.has(zone.id)}
                <div class="objectives-container">
                  {#each zoneObjectives as obj (obj.id)}
                    {@const done = campaignProgress.has(obj.id)}
                    <div class="guide-row" class:done class:optional={obj.optional} class:league={obj.league}>
                      <label class="guide-row-label">
                        <input
                          type="checkbox"
                          checked={done}
                          onchange={() => toggleObjective(obj.id)}
                          class="ec-checkbox guide-row-checkbox"
                        />
                        <span class="guide-row-text">{trObjective(obj.id, obj.text)}</span>
                        {#if obj.league}
                          <span class="tag tag-league" title={m.campaign_league_badge_title()}>{m.campaign_league_badge()}</span>
                        {:else if obj.optional}
                          <span class="tag tag-optional">{m.campaign_optional_badge()}</span>
                        {/if}
                        {#if obj.reward}
                          <span class="tag tag-reward">{trObjectiveReward(obj.id, obj.reward)}</span>
                        {/if}
                      </label>

                      {#if obj.notes && obj.notes.length > 0}
                        <div class="guide-row-notes">
                          {#each trNotes(obj.id, obj.notes) as note}
                            <div class="guide-note">› {note}</div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .campaign-guide {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  /* Required-but-not-optional: all mandatory objectives done, optional ones
     pending. Campaign-only — leveling steps have no optional flag. */
  .guide-group.required {
    border-color: color-mix(in srgb, var(--c-warning) 26%, transparent);
  }
  .required .guide-group-header {
    color: color-mix(in srgb, var(--c-warning) 80%, var(--c-primary) 20%);
  }
  .guide-progress.required {
    color: var(--c-warning);
  }
  .progress-bar-fill.required {
    background: linear-gradient(90deg, var(--c-warning-deep), var(--c-warning));
  }
  .guide-group-action.done:hover {
    background: color-mix(in srgb, var(--c-warning) 14%, transparent);
    color: var(--c-warning);
  }

  /* Advisory callout: leading accent rail + lightbulb, deliberately neutral
     since green/amber/blue/purple already carry status meaning here. */
  .tips-box {
    margin: var(--sp-1) var(--sp-1) 0;
    border: 1px solid color-mix(in srgb, var(--c-primary) 16%, transparent);
    border-left: 2px solid color-mix(in srgb, var(--c-primary) 42%, transparent);
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--c-primary) 7%, var(--c-bg)),
      color-mix(in srgb, var(--c-primary) 3%, var(--c-bg))
    );
    transition: border-color 0.15s ease;
  }
  .tips-box:hover {
    border-left-color: color-mix(in srgb, var(--c-primary) 65%, transparent);
  }

  .tips-header {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--c-primary) 88%, transparent);
    font-family: var(--font-ui);
    font-weight: 700;
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    text-align: left;
    gap: 6px;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .tips-header:hover {
    background: color-mix(in srgb, var(--c-primary) 7%, transparent);
    color: var(--c-primary);
  }

  .tips-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    opacity: 0.85;
  }

  .tips-title {
    flex: 1;
  }

  .tips-count {
    flex-shrink: 0;
    min-width: 15px;
    padding: 0 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c-primary) 14%, transparent);
    color: color-mix(in srgb, var(--c-primary) 75%, transparent);
    font-size: 9px;
    font-weight: 700;
    line-height: 15px;
    text-align: center;
    font-feature-settings: 'tnum';
  }

  .tips-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0 10px var(--sp-1) 10px;
    list-style: none;
  }

  /* Custom marker instead of a disc bullet — hairline rules between tips keep
     multi-line entries scannable without adding vertical bulk. */
  .tip-item {
    position: relative;
    font-size: 10.5px;
    line-height: 1.5;
    color: color-mix(in srgb, var(--c-accent) 92%, #fff 8%);
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
    padding: 5px 0 5px 14px;
    border-top: 1px solid color-mix(in srgb, var(--c-primary) 9%, transparent);
  }
  .tip-item:first-child {
    border-top: none;
  }
  .tip-item::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 11px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c-primary) 45%, transparent);
  }

  .tip-text {
    flex: 1;
    min-width: 0;
  }

  .zones-container {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--sp-1);
    background: color-mix(in srgb, var(--c-bg) 97%, var(--c-mid));
  }

  .zone-group {
    overflow: hidden;
    transition: border-color 0.2s ease, background 0.2s ease;
  }
  .zone-group.complete {
    border-color: color-mix(in srgb, var(--c-success) 30%, transparent);
    background: color-mix(in srgb, var(--c-success) 6%, var(--c-bg));
  }
  .zone-group.complete .zone-header {
    color: color-mix(in srgb, var(--c-success) 82%, #fff 18%);
  }
  .zone-group.required {
    border-color: color-mix(in srgb, var(--c-warning) 32%, transparent);
    background: color-mix(in srgb, var(--c-warning) 6%, var(--c-bg));
  }
  .zone-group.required .zone-header {
    color: color-mix(in srgb, var(--c-warning) 85%, #fff 15%);
  }
  .zone-group.active-zone {
    border-color: color-mix(in srgb, var(--c-red) 40%, transparent);
    background: color-mix(in srgb, var(--c-red) 6%, var(--c-bg));
  }

  .zone-check {
    flex-shrink: 0;
    color: var(--c-success);
    font-size: 11px;
    line-height: 1;
  }

  .zone-header-row {
    display: flex;
    align-items: stretch;
  }

  .zone-header-row :global(.pos-marker) {
    width: 22px;
  }

  .zone-header {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 5px 10px;
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--c-accent) 92%, #fff 8%);
    font-weight: 500;
    font-size: 11px;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
    text-align: left;
    gap: 6px;
  }
  .zone-header:hover {
    background: color-mix(in srgb, var(--c-accent) 7%, transparent);
    color: var(--c-primary);
  }

  .zone-title {
    flex: 1;
  }

  .objectives-container {
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--c-bg) 99%, transparent);
  }

  .guide-row.optional {
    border-left-color: color-mix(in srgb, var(--c-optional) 40%, transparent);
  }
  .guide-row.league {
    border-left-color: color-mix(in srgb, var(--c-info) 40%, transparent);
  }
</style>
