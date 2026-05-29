<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { CAMPAIGN_DATA } from '$lib/campaign';
  import type { CampaignAct } from '$lib/campaign';
  import { m } from '$lib/paraglide/messages.js';
  import { trAct, trZone, trObjective, trObjectiveReward, trNotes } from '$lib/dataI18n';

  interface GuideState {
    expandedActs: Set<number>;
    expandedZones: Set<string>;
    completedObjectives: Set<string>;
  }

  const STATE_KEY = 'CAMPAIGN_GUIDE_STATE_V1';

  let guideState = $state<GuideState>({
    expandedActs: new SvelteSet<number>(),
    expandedZones: new SvelteSet<string>(),
    completedObjectives: new SvelteSet<string>()
  });

  onMount(() => {
    const saved = window.localStorage.getItem(STATE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        guideState.expandedActs = new SvelteSet<number>(parsed.expandedActs ?? []);
        guideState.expandedZones = new SvelteSet<string>(parsed.expandedZones ?? []);
        guideState.completedObjectives = new SvelteSet<string>(parsed.completedObjectives ?? []);
      } catch {
        // ignore corrupted state
      }
    }
  });

  function saveState() {
    const toSave = {
      expandedActs: Array.from(guideState.expandedActs),
      expandedZones: Array.from(guideState.expandedZones),
      completedObjectives: Array.from(guideState.completedObjectives)
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
    if (guideState.completedObjectives.has(objId)) {
      guideState.completedObjectives.delete(objId);
    } else {
      guideState.completedObjectives.add(objId);
    }
    saveState();
  }

  function getActProgress(act: CampaignAct): { completed: number; total: number; pct: number } {
    let completed = 0;
    let total = 0;
    for (const zone of act.zones) {
      for (const obj of zone.objectives) {
        total++;
        if (guideState.completedObjectives.has(obj.id)) completed++;
      }
    }
    return { completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }

  function resetProgress() {
    if (confirm(m.confirm_reset_campaign_progress())) {
      guideState.completedObjectives = new SvelteSet<string>();
      saveState();
    }
  }
</script>

<div class="campaign-guide">
  <div class="guide-header">
    <h3>{m.campaign_guide_title()}</h3>
    <button class="btn-reset" onclick={resetProgress} title={m.campaign_reset_progress_title()}>
      {m.action_reset()}
    </button>
  </div>

  {#each CAMPAIGN_DATA as act (act.number)}
    {@const progress = getActProgress(act)}
    {@const isComplete = progress.completed === progress.total && progress.total > 0}
    <div class="act-group" class:complete={isComplete}>
      <button
        class="act-header"
        onclick={() => toggleAct(act.number)}
        type="button"
      >
        <span class="toggle-icon" class:expanded={guideState.expandedActs.has(act.number)}>▶</span>
        <span class="act-title">{trAct(act.number, act.name)}</span>
        {#if act.temporary}
          <span class="badge-interlude">{m.campaign_interlude_badge()}</span>
        {/if}
        <span class="act-progress" class:complete={isComplete}>
          {progress.completed}/{progress.total}
        </span>
      </button>

      <div class="progress-bar-track">
        <div
          class="progress-bar-fill"
          class:complete={isComplete}
          style="width: {progress.pct}%"
        ></div>
      </div>

      {#if guideState.expandedActs.has(act.number)}
        <div class="zones-container">
          {#each act.zones as zone (zone.id)}
            <div class="zone-group">
              <button
                class="zone-header"
                onclick={() => toggleZone(zone.id)}
                type="button"
              >
                <span class="toggle-icon" class:expanded={guideState.expandedZones.has(zone.id)}>▶</span>
                <span class="zone-title">{trZone(zone.id, zone.name)}</span>
              </button>

              {#if guideState.expandedZones.has(zone.id)}
                <div class="objectives-container">
                  {#each zone.objectives as obj (obj.id)}
                    {@const done = guideState.completedObjectives.has(obj.id)}
                    <div class="objective-row" class:done class:optional={obj.optional}>
                      <label class="objective-label">
                        <input
                          type="checkbox"
                          checked={done}
                          onchange={() => toggleObjective(obj.id)}
                          class="objective-checkbox"
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
    background: color-mix(in srgb, var(--c-bg) 86%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 38%, transparent);
    border-radius: 3px;
    margin-bottom: 2px;
  }

  .guide-header h3 {
    margin: 0;
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-primary);
    text-shadow: 0 0 12px color-mix(in srgb, var(--c-primary) 40%, transparent);
  }

  .btn-reset {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-muted) 90%, #fff 10%);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-reset:hover {
    border-color: color-mix(in srgb, #f38d78 42%, transparent);
    color: #f38d78;
    background: color-mix(in srgb, #f38d78 6%, transparent);
  }

  /* Act group */
  .act-group {
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
    overflow: hidden;
    transition: border-color 0.25s;
  }

  .act-group.complete {
    border-color: color-mix(in srgb, #4ade80 28%, transparent);
  }

  .act-header {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--c-bg) 84%, var(--c-mid));
    border: none;
    color: var(--c-primary);
    font-family: 'Inter Tight', 'Inter', sans-serif;
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

  .complete .act-header {
    color: color-mix(in srgb, #4ade80 80%, var(--c-primary) 20%);
    text-shadow: 0 0 10px color-mix(in srgb, #4ade80 30%, transparent);
  }

  .toggle-icon {
    display: inline-block;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    background: url('/ui/buttoncollapsenormal.webp') center/contain no-repeat;
    /* The collapse image points UP; rotate 90° to point right (collapsed state) */
    transform: rotate(90deg);
    transition: transform 0.2s ease, opacity 0.15s;
    opacity: 0.6;
    font-size: 0;
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
    border-radius: 2px;
    background: color-mix(in srgb, #a78bfa 10%, transparent);
    color: #c4b5fd;
    border: 1px solid color-mix(in srgb, #a78bfa 28%, transparent);
    flex-shrink: 0;
  }

  .act-progress {
    font-family: 'Inter Tight', sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    letter-spacing: 0.04em;
    min-width: 36px;
    text-align: right;
    font-feature-settings: 'tnum';
  }

  .act-progress.complete {
    color: #4ade80;
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
    background: linear-gradient(90deg, #4ade80, #86efac);
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
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--c-bg) 96%, transparent);
    overflow: hidden;
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
    flex-shrink: 0;
    appearance: none;
    width: 16px;
    height: 16px;
    margin-top: 1px;
    border: none;
    border-radius: 0;
    background: url('/ui/checkboxsquareunchecked.webp') center/contain no-repeat;
    cursor: pointer;
    align-self: flex-start;
    transition: opacity 0.12s;
  }
  .objective-checkbox:hover { opacity: 0.8; }
  .objective-checkbox:checked {
    background-image: url('/ui/checkboxsquarechecked.webp');
  }
  .objective-checkbox:checked::after { display: none; }

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
    border-radius: 2px;
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
