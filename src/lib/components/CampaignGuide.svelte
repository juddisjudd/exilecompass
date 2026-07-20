<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { CAMPAIGN_DATA } from '$lib/campaign';
  import { m } from '$lib/paraglide/messages.js';
  import { trAct, trZone, trObjective, trObjectiveReward, trNotes } from '$lib/dataI18n';
  import { campaignProgress } from '$lib/campaignProgress.svelte';
  import ConfirmReset from './ConfirmReset.svelte';

  // Completion lives in the shared module (so global hotkeys can mark objectives).
  // The component only owns the expand/collapse UI state.
  interface GuideState {
    expandedActs: Set<number>;
    expandedZones: Set<string>;
  }

  const STATE_KEY = 'CAMPAIGN_GUIDE_STATE_V1';

  let guideState = $state<GuideState>({
    expandedActs: new SvelteSet<number>(),
    expandedZones: new SvelteSet<string>(),
  });

  onMount(() => {
    campaignProgress.load();
    const saved = window.localStorage.getItem(STATE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        guideState.expandedActs = new SvelteSet<number>(parsed.expandedActs ?? []);
        guideState.expandedZones = new SvelteSet<string>(parsed.expandedZones ?? []);
      } catch {
        // ignore corrupted state
      }
    }
  });

  function saveState() {
    const toSave = {
      expandedActs: Array.from(guideState.expandedActs),
      expandedZones: Array.from(guideState.expandedZones),
    };
    window.localStorage.setItem(STATE_KEY, JSON.stringify(toSave));
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
</script>

<div class="campaign-guide">
  <div class="guide-header ec-panel">
    <h3>{m.campaign_guide_title()}</h3>
    <ConfirmReset
      label={m.action_reset()}
      prompt={m.confirm_reset_campaign_progress()}
      title={m.campaign_reset_progress_title()}
      onconfirm={resetProgress}
    />
  </div>

  {#each CAMPAIGN_DATA as act (act.number)}
    {@const objectives = act.zones.flatMap((z) => z.objectives)}
    {@const progress = summarize(objectives)}
    {@const isComplete = progress.status === 'complete'}
    {@const isRequired = progress.status === 'required'}
    {@const expanded = guideState.expandedActs.has(act.number)}
    <div
      class="act-group ec-panel"
      class:complete={isComplete}
      class:required={isRequired}
      class:complete-collapsed={isComplete && !expanded}
    >
      <div class="act-header-row">
        <button
          class="act-header"
          onclick={() => toggleAct(act.number)}
          type="button"
        >
          <span class="toggle-icon" class:expanded>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
          </span>
          <span class="act-title">{trAct(act.number, act.name)}</span>
          {#if act.temporary}
            <span class="badge-interlude">{m.campaign_interlude_badge()}</span>
          {/if}
          {#if isComplete}
            <span class="badge-complete">✓ {m.campaign_complete_badge()}</span>
          {/if}
          <span class="act-progress" class:complete={isComplete} class:required={isRequired}>
            {progress.completed}/{progress.total}
          </span>
        </button>
        <button
          class="act-complete-btn"
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
        <div class="zones-container">
          {#each act.zones as zone (zone.id)}
            {@const zoneStatus = summarize(zone.objectives).status}
            <div
              class="zone-group ec-panel"
              class:complete={zoneStatus === 'complete'}
              class:required={zoneStatus === 'required'}
            >
              <button
                class="zone-header"
                onclick={() => toggleZone(zone.id)}
                type="button"
              >
                <span class="toggle-icon" class:expanded={guideState.expandedZones.has(zone.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                </span>
                <span class="zone-title">{trZone(zone.id, zone.name)}</span>
                {#if zoneStatus === 'complete'}
                  <span class="zone-check" aria-hidden="true">✓</span>
                {/if}
              </button>

              {#if guideState.expandedZones.has(zone.id)}
                <div class="objectives-container">
                  {#each zone.objectives as obj (obj.id)}
                    {@const done = campaignProgress.has(obj.id)}
                    <div class="objective-row" class:done class:optional={obj.optional}>
                      <label class="objective-label">
                        <input
                          type="checkbox"
                          checked={done}
                          onchange={() => toggleObjective(obj.id)}
                          class="ec-checkbox objective-checkbox"
                        />
                        <span class="objective-text">{trObjective(obj.id, obj.text)}</span>
                        {#if obj.optional}
                          <span class="badge badge-optional">{m.campaign_optional_badge()}</span>
                        {/if}
                        {#if obj.reward}
                          <span class="badge badge-reward">{trObjectiveReward(obj.id, obj.reward)}</span>
                        {/if}
                      </label>

                      {#if obj.notes && obj.notes.length > 0}
                        <div class="objective-notes">
                          {#each trNotes(obj.id, obj.notes) as note}
                            <div class="note">› {note}</div>
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
      {/if}
    </div>
  {/each}
</div>

<style>
  .campaign-guide {
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

  /* Act group */
  .act-group {
    overflow: hidden;
    transition: border-color 0.25s;
  }

  .act-group.complete {
    border-color: color-mix(in srgb, var(--c-success) 28%, transparent);
  }

  /* All required objectives done, optional ones still pending → yellow. */
  .act-group.required {
    border-color: color-mix(in srgb, #fbbf24 26%, transparent);
  }

  /* Finished act, collapsed — recede it so the eye skips to unfinished work.
     Full opacity returns once expanded so its contents stay readable. */
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

  /* One-click "complete the whole act" toggle, sitting at the end of the header
     row. Shows a check to fill the act in, or an undo arrow to clear it. */
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
    background: color-mix(in srgb, #fbbf24 14%, transparent);
    color: #fbbf24;
  }

  .complete .act-header {
    color: color-mix(in srgb, var(--c-success) 80%, var(--c-primary) 20%);
    text-shadow: 0 0 10px color-mix(in srgb, var(--c-success) 30%, transparent);
  }

  .required .act-header {
    color: color-mix(in srgb, #fbbf24 80%, var(--c-primary) 20%);
    text-shadow: 0 0 10px color-mix(in srgb, #fbbf24 26%, transparent);
  }

  .toggle-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    /* rotate 90° for the collapsed (pointing-right) state */
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

  .badge-interlude {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: var(--radius);
    background: color-mix(in srgb, #a78bfa 10%, transparent);
    color: #c4b5fd;
    border: 1px solid color-mix(in srgb, #a78bfa 28%, transparent);
    flex-shrink: 0;
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

  .act-progress.required {
    color: #fbbf24;
  }

  /* Progress bar */
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

  .progress-bar-fill.required {
    background: linear-gradient(90deg, #f59e0b, #fbbf24);
  }

  /* Zones */
  .zones-container {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px;
    background: color-mix(in srgb, var(--c-bg) 97%, var(--c-mid));
  }

  .zone-group {
    overflow: hidden;
    transition: border-color 0.2s, background 0.2s;
  }

  /* Zone fully complete (incl. optional) → green; required-only done → yellow.
     A faint background tint keeps yellow distinct from the default gold accent. */
  .zone-group.complete {
    border-color: color-mix(in srgb, var(--c-success) 30%, transparent);
    background: color-mix(in srgb, var(--c-success) 6%, var(--c-bg));
  }
  .zone-group.complete .zone-header {
    color: color-mix(in srgb, var(--c-success) 82%, #fff 18%);
  }

  .zone-group.required {
    border-color: color-mix(in srgb, #fbbf24 32%, transparent);
    background: color-mix(in srgb, #fbbf24 6%, var(--c-bg));
  }
  .zone-group.required .zone-header {
    color: color-mix(in srgb, #fbbf24 85%, #fff 15%);
  }

  .zone-check {
    flex-shrink: 0;
    color: var(--c-success);
    font-size: 11px;
    line-height: 1;
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
    transition: background 0.1s, color 0.1s;
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

  /* Objectives */
  .objectives-container {
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--c-bg) 99%, transparent);
  }

  .objective-row {
    padding: 4px 10px 4px 8px;
    border-left: 2px solid transparent;
    transition: background 0.1s, border-color 0.1s, transform 0.1s;
  }

  .objective-row:hover {
    background: color-mix(in srgb, var(--c-accent) 5%, transparent);
    transform: translateX(1px);
  }

  .objective-row.optional {
    border-left-color: color-mix(in srgb, #a78bfa 40%, transparent);
  }

  .objective-row.done {
    opacity: 0.5;
  }

  .objective-label {
    display: flex;
    align-items: baseline;
    gap: 6px;
    cursor: pointer;
    flex-wrap: wrap;
  }

  .objective-checkbox {
    margin-top: 1px;
    align-self: flex-start;
  }

  .objective-text {
    font-size: 11px;
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%);
    line-height: 1.35;
    flex: 1;
  }

  .done .objective-text {
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--c-accent) 50%, transparent);
  }

  .badge {
    display: inline-block;
    padding: 1px 5px;
    border-radius: var(--radius);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1.6;
  }

  .badge-optional {
    background: color-mix(in srgb, #a78bfa 12%, transparent);
    color: #c4b5fd;
    border: 1px solid color-mix(in srgb, #a78bfa 30%, transparent);
  }

  .badge-reward {
    background: color-mix(in srgb, var(--c-primary) 10%, transparent);
    color: var(--c-primary);
    border: 1px solid color-mix(in srgb, var(--c-primary) 25%, transparent);
    text-shadow: 0 0 8px color-mix(in srgb, var(--c-primary) 30%, transparent);
  }

  .objective-notes {
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
    line-height: 1.3;
    font-style: italic;
  }
</style>
