<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    CRAFTING_GUIDES,
    EQUIPMENT_SLOTS,
    type CraftingGuideData,
    type CraftingResultMod,
    type EquipmentSlot,
  } from '$lib/crafting';
  import { m } from '$lib/paraglide/messages.js';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import ConfirmReset from './ConfirmReset.svelte';

  const STATE_KEY = 'CRAFTING_GUIDE_STATE_V1';

  // Open a creator's channel link externally (Tauri opener, with a web fallback).
  async function openExternal(url: string) {
    try {
      await openUrl(url);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }

  type CraftView = 'slots' | 'list' | 'guide';

  // Completed step ids, namespaced as `${guideId}/${stepId}` so one set covers
  // every guide.
  const completed = new SvelteSet<string>();

  // Browse state: slot picker → craft listing → step guide. Persisted so the
  // overlay reopens on the craft you were mid-way through.
  let view = $state<CraftView>('slots');
  let selectedSlot = $state<EquipmentSlot | null>(null);
  let activeGuideId = $state('');

  let guide = $derived(CRAFTING_GUIDES.find((g) => g.id === activeGuideId));
  let slotGuides = $derived(CRAFTING_GUIDES.filter((g) => g.slot === selectedSlot));
  let slotLabel = $derived(EQUIPMENT_SLOTS.find((s) => s.id === selectedSlot)?.label ?? '');

  onMount(() => {
    const saved = window.localStorage.getItem(STATE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        for (const key of parsed.completed ?? []) completed.add(key);
        if (EQUIPMENT_SLOTS.some((s) => s.id === parsed.selectedSlot)) {
          selectedSlot = parsed.selectedSlot;
        }
        if (CRAFTING_GUIDES.some((g) => g.id === parsed.activeGuideId)) {
          activeGuideId = parsed.activeGuideId;
        }
        // Only restore views whose backing selection survived validation.
        if (parsed.view === 'guide' && activeGuideId) view = 'guide';
        else if (parsed.view === 'list' && selectedSlot) view = 'list';
      } catch {
        // ignore corrupted state
      }
    }
  });

  function saveState() {
    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ completed: Array.from(completed), view, selectedSlot, activeGuideId }),
    );
  }

  function openSlot(slot: EquipmentSlot) {
    selectedSlot = slot;
    view = 'list';
    saveState();
  }

  function openGuide(g: CraftingGuideData) {
    activeGuideId = g.id;
    selectedSlot = g.slot;
    view = 'guide';
    saveState();
  }

  function goBack() {
    view = view === 'guide' ? 'list' : 'slots';
    saveState();
  }

  function stepKey(g: CraftingGuideData, stepId: string) {
    return `${g.id}/${stepId}`;
  }

  function toggleStep(g: CraftingGuideData, stepId: string) {
    const key = stepKey(g, stepId);
    if (completed.has(key)) {
      completed.delete(key);
    } else {
      completed.add(key);
    }
    saveState();
  }

  function resetProgress(g: CraftingGuideData) {
    for (const step of g.steps) completed.delete(stepKey(g, step.id));
    saveState();
  }

  function guideProgress(g: CraftingGuideData) {
    const done = g.steps.filter((s) => completed.has(stepKey(g, s.id))).length;
    return { done, total: g.steps.length };
  }

  function slotGuideCount(slot: EquipmentSlot) {
    return CRAFTING_GUIDES.filter((g) => g.slot === slot).length;
  }
</script>

<div class="crafting-guide">
  <div class="guide-header">
    {#if view !== 'slots'}
      <button class="back-btn" onclick={goBack} type="button">
        <span class="back-arrow" aria-hidden="true">←</span>{m.action_back()}
      </button>
    {/if}
    <h3>{view === 'slots' ? m.crafting_guide_title() : slotLabel}</h3>
    {#if view === 'guide' && guide}
      <ConfirmReset
        label={m.action_reset()}
        prompt={m.confirm_reset_crafting_progress()}
        title={m.crafting_reset_progress_title()}
        onconfirm={() => guide && resetProgress(guide)}
      />
    {/if}
  </div>

  <div class="wip-notice">
    <span class="wip-badge">WIP</span>
    <span>{m.crafting_wip_notice()}</span>
  </div>

  {#if view === 'slots'}
    <!-- Level 1: equipment slot picker -->
    <p class="browse-hint">{m.crafting_choose_slot()}</p>
    <div class="slot-grid">
      {#each EQUIPMENT_SLOTS as slot (slot.id)}
        {@const count = slotGuideCount(slot.id)}
        <button
          class="slot-card"
          class:empty={count === 0}
          disabled={count === 0}
          onclick={() => openSlot(slot.id)}
          type="button"
        >
          <span class="slot-name">{slot.label}</span>
          <span class="slot-count">{count > 0 ? count : m.crafting_no_guides()}</span>
        </button>
      {/each}
    </div>

  {:else if view === 'list'}
    <!-- Level 2: crafts available for the chosen slot -->
    <div class="craft-list">
      {#each slotGuides as g (g.id)}
        {@const progress = guideProgress(g)}
        <button class="craft-row" onclick={() => openGuide(g)} type="button">
          <img class="craft-row-icon" src={encodeURI(g.base.icon)} alt={g.base.name} />
          <span class="craft-row-text">
            <span class="craft-row-name">{g.name}</span>
            <span class="craft-row-goal">{g.goal}</span>
          </span>
          <span
            class="craft-row-progress"
            class:complete={progress.done === progress.total}
            class:started={progress.done > 0 && progress.done < progress.total}
          >{progress.done}/{progress.total}</span>
          <span class="craft-row-chevron" aria-hidden="true">›</span>
        </button>
      {:else}
        <p class="browse-hint">{m.crafting_no_guides()}</p>
      {/each}
    </div>

  {:else if guide}
    <!-- Level 3: the step-by-step guide -->
    {@const progress = guideProgress(guide)}
    {@const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}
    {@const currentStepId = guide.steps.find((s) => !completed.has(stepKey(guide!, s.id)))?.id}
    <div class="craft-card">
      <div class="craft-card-header">
        <img class="base-icon" src={encodeURI(guide.base.icon)} alt={guide.base.name} />
        <div class="craft-card-text">
          <span class="craft-name">{guide.name}</span>
          <span class="craft-base">
            {m.crafting_base_label()}: {guide.base.name}{#if guide.ilvl}<span class="ilvl-chip">ilvl {guide.ilvl}</span>{/if}
          </span>
          <span class="craft-goal">{guide.goal}</span>
          {#if guide.author}
            <span class="craft-author">
              <span class="by">{m.crafting_by()} {guide.author.name}</span>
              {#if guide.author.youtube}
                <button
                  class="author-link yt"
                  onclick={() => openExternal(guide!.author!.youtube!)}
                  title="YouTube"
                  aria-label="YouTube"
                  type="button"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.5 15.5v-7l6.5 3.5-6.5 3.5z"/></svg>
                </button>
              {/if}
              {#if guide.author.twitch}
                <button
                  class="author-link tw"
                  onclick={() => openExternal(guide!.author!.twitch!)}
                  title="Twitch"
                  aria-label="Twitch"
                  type="button"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 2 3 6v14h5v3h3l3-3h4l5-5V2H4zm17 11-3 3h-5l-3 3v-3H6V4h15v9zM16 7h-2v5h2V7zm-5 0H9v5h2V7z"/></svg>
                </button>
              {/if}
            </span>
          {/if}
        </div>
        <span class="craft-progress" class:complete={progress.done === progress.total}>
          {progress.done}/{progress.total}
        </span>
      </div>
      <div class="progress-bar-track">
        <div
          class="progress-bar-fill"
          class:complete={progress.done === progress.total}
          style="width: {pct}%"
        ></div>
      </div>

      <div class="steps">
        {#each guide.steps as step, i (step.id)}
          {@const done = completed.has(stepKey(guide!, step.id))}
          <div class="step" class:done class:current={step.id === currentStepId}>
            <label class="step-main">
              <input
                type="checkbox"
                class="step-checkbox"
                checked={done}
                onchange={() => guide && toggleStep(guide, step.id)}
              />
              <span class="step-num">{i + 1}</span>
              <span class="step-body">
                <span class="step-title-row">
                  <span class="step-title">{step.title}</span>
                  {#if step.repeat}
                    <span class="badge-repeat">{m.crafting_badge_repeat()}</span>
                  {/if}
                </span>
                {#if step.detail}
                  <span class="step-detail">{step.detail}</span>
                {/if}
                {#if step.targets && step.targets.length > 0}
                  {@const multi = step.targets.length > 1}
                  <span class="step-targets">
                    {#each step.targets as t, ti (t.text)}
                      <span class="target-line" class:ideal={multi && ti === 0}>
                        <span class="target-pos">
                          {#if !multi}{m.crafting_target_label()}
                          {:else if ti === 0}{m.crafting_target_ideal()}
                          {:else}{m.crafting_target_alt()} {ti}{/if}
                        </span>
                        {#if t.tag}<span class="mod-tag tag-{t.tag}">{t.tag}</span>{/if}
                        <span class="target-text">{t.text}</span>
                      </span>
                    {/each}
                  </span>
                {/if}
                {#if step.items && step.items.length > 0}
                  <span class="step-items">
                    {#each step.items as it (it.name)}
                      <span class="item-chip" title={it.name}>
                        <img class="item-icon" src={encodeURI(it.icon)} alt={it.name} />
                        <span class="item-name">{it.name}</span>
                      </span>
                    {/each}
                  </span>
                {/if}
              </span>
            </label>

            {#if step.branches && step.branches.length > 0}
              <div class="branches">
                {#each step.branches as branch (branch.kind + branch.text)}
                  <div class="branch" class:success={branch.kind === 'success'} class:fail={branch.kind === 'fail'}>
                    <span class="branch-label">
                      {branch.kind === 'success' ? m.crafting_if_success() : m.crafting_if_fail()}
                    </span>
                    <span class="branch-text">{branch.text}</span>
                    {#if branch.items && branch.items.length > 0}
                      <span class="step-items">
                        {#each branch.items as it (it.name)}
                          <span class="item-chip" title={it.name}>
                            <img class="item-icon" src={encodeURI(it.icon)} alt={it.name} />
                            <span class="item-name">{it.name}</span>
                          </span>
                        {/each}
                      </span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      {#if guide.result && guide.result.length > 0}
        {@const required = guide.result.filter((mod) => !mod.alt)}
        {@const alts = guide.result.filter((mod) => mod.alt)}
        <div class="result-panel">
          <div class="result-title">{m.crafting_final_result()}</div>
          <div class="result-mods">
            {#each required as mod (mod.text)}
              {@render resultMod(mod)}
            {/each}
          </div>
          {#if alts.length > 0}
            <div class="result-anyof">
              <div class="anyof-label">{m.crafting_result_anyof()}</div>
              <div class="result-mods">
                {#each alts as mod (mod.text)}
                  {@render resultMod(mod)}
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#snippet resultMod(mod: CraftingResultMod)}
  <div class="result-mod" class:fractured={mod.tag === 'fractured'}>
    {#if mod.tag}
      <span class="mod-tag tag-{mod.tag}">{mod.tag}</span>
    {/if}
    <span class="mod-text">{mod.text}</span>
  </div>
{/snippet}

<style>
  .crafting-guide {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .guide-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--c-bg) 86%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 38%, transparent);
    border-radius: 3px;
    margin-bottom: 2px;
  }

  .guide-header h3 {
    flex: 1;
    margin: 0;
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-primary);
    text-shadow: 0 0 12px color-mix(in srgb, var(--c-primary) 40%, transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px 3px 7px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 32%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c-bg) 80%, var(--c-mid));
    color: color-mix(in srgb, var(--c-accent) 92%, #fff 8%);
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.12s;
    flex-shrink: 0;
  }
  .back-btn:hover {
    border-color: color-mix(in srgb, var(--c-primary) 45%, transparent);
    color: var(--c-primary);
    background: color-mix(in srgb, var(--c-bg) 70%, var(--c-mid));
  }
  .back-arrow {
    font-size: 12px;
    line-height: 1;
  }

  .wip-notice {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    border: 1px solid color-mix(in srgb, #fbbf24 26%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, #fbbf24 6%, transparent);
    font-size: 10px;
    line-height: 1.4;
    color: color-mix(in srgb, #fbbf24 70%, #fff 30%);
    margin-bottom: 2px;
  }

  .wip-badge {
    flex-shrink: 0;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 1px 5px;
    border-radius: 2px;
    background: color-mix(in srgb, #fbbf24 14%, transparent);
    border: 1px solid color-mix(in srgb, #fbbf24 38%, transparent);
    color: #fbbf24;
  }

  .browse-hint {
    font-size: 10px;
    color: color-mix(in srgb, var(--c-muted) 80%, #fff 20%);
    padding: 2px 2px 4px;
  }

  /* ── Level 1: slot picker ────────────────────────────────────── */
  .slot-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
  }

  .slot-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 9px 11px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 24%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
    text-align: left;
  }
  .slot-card:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--c-primary) 45%, transparent);
    background: color-mix(in srgb, var(--c-bg) 84%, var(--c-mid));
  }
  .slot-card.empty {
    opacity: 0.4;
    cursor: default;
  }

  .slot-name {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%);
  }
  .slot-card:hover:not(:disabled) .slot-name { color: var(--c-primary); }

  .slot-count {
    font-family: 'Inter Tight', sans-serif;
    font-size: 9px;
    font-weight: 600;
    color: color-mix(in srgb, var(--c-accent) 60%, transparent);
    font-feature-settings: 'tnum';
    white-space: nowrap;
  }

  /* ── Level 2: craft listing ──────────────────────────────────── */
  .craft-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .craft-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 24%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
    text-align: left;
  }
  .craft-row:hover {
    border-color: color-mix(in srgb, var(--c-primary) 45%, transparent);
    background: color-mix(in srgb, var(--c-bg) 84%, var(--c-mid));
  }

  .craft-row-icon {
    width: 32px;
    height: 32px;
    object-fit: contain;
    flex-shrink: 0;
    filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.6));
  }

  .craft-row-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .craft-row-name {
    font-size: 11px;
    font-weight: 600;
    color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%);
  }
  .craft-row:hover .craft-row-name { color: var(--c-primary); }

  .craft-row-goal {
    font-size: 9px;
    line-height: 1.4;
    color: color-mix(in srgb, var(--c-muted) 70%, #fff 30%);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .craft-row-progress {
    font-family: 'Inter Tight', sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: color-mix(in srgb, var(--c-accent) 60%, transparent);
    font-feature-settings: 'tnum';
    flex-shrink: 0;
  }
  .craft-row-progress.started { color: #fbbf24; }
  .craft-row-progress.complete { color: #4ade80; }

  .craft-row-chevron {
    font-size: 14px;
    line-height: 1;
    color: color-mix(in srgb, var(--c-accent) 50%, transparent);
    flex-shrink: 0;
  }

  /* ── Level 3: guide card ─────────────────────────────────────── */
  .craft-card {
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
    overflow: hidden;
  }

  .craft-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--c-bg) 84%, var(--c-mid));
  }

  .base-icon {
    width: 40px;
    height: 40px;
    object-fit: contain;
    flex-shrink: 0;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
  }

  .craft-card-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .craft-name {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c-primary);
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  }

  .craft-base {
    font-size: 10px;
    color: color-mix(in srgb, var(--c-accent) 92%, #fff 8%);
  }

  .craft-goal {
    font-size: 10px;
    line-height: 1.4;
    color: color-mix(in srgb, var(--c-muted) 70%, #fff 30%);
  }

  /* Author credit + channel links */
  .craft-author {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .craft-author .by {
    font-size: 10px;
    font-style: italic;
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
  }
  .author-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    cursor: pointer;
    transition: color 0.12s;
  }
  .author-link svg {
    width: 14px;
    height: 14px;
  }
  .author-link.yt:hover {
    color: #ff4444;
  }
  .author-link.tw:hover {
    color: #a970ff;
  }

  .craft-progress {
    font-family: 'Inter Tight', sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    letter-spacing: 0.04em;
    font-feature-settings: 'tnum';
    flex-shrink: 0;
    align-self: flex-start;
  }
  .craft-progress.complete { color: #4ade80; }

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

  /* ── Steps ───────────────────────────────────────────────────── */
  .steps {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px;
    background: color-mix(in srgb, var(--c-bg) 97%, var(--c-mid));
  }

  .step {
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--c-bg) 96%, transparent);
    padding: 6px 10px 6px 8px;
    transition: border-color 0.2s, background 0.2s, opacity 0.2s;
  }

  .step.done {
    opacity: 0.5;
    border-color: color-mix(in srgb, #4ade80 24%, transparent);
  }

  /* The next step to do — picked out so the eye lands on it instantly. */
  .step.current {
    border-color: color-mix(in srgb, var(--c-primary) 40%, transparent);
    background: color-mix(in srgb, var(--c-primary) 4%, var(--c-bg));
  }

  .step-main {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
  }

  .step-checkbox {
    flex-shrink: 0;
    appearance: none;
    width: 16px;
    height: 16px;
    margin-top: 1px;
    border: none;
    border-radius: 0;
    background: url('/ui/checkboxsquareunchecked.webp') center/contain no-repeat;
    cursor: pointer;
    transition: opacity 0.12s;
  }
  .step-checkbox:hover { opacity: 0.8; }
  .step-checkbox:checked {
    background-image: url('/ui/checkboxsquarechecked.webp');
  }

  .step-num {
    flex-shrink: 0;
    min-width: 16px;
    margin-top: 2px;
    font-family: 'Inter Tight', sans-serif;
    font-size: 9px;
    font-weight: 700;
    text-align: center;
    color: color-mix(in srgb, var(--c-accent) 60%, transparent);
    font-feature-settings: 'tnum';
  }
  .step.current .step-num { color: var(--c-primary); }

  .step-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .step-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .step-title {
    font-size: 11px;
    font-weight: 500;
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%);
  }
  .step.current .step-title { color: var(--c-primary); }
  .step.done .step-title { text-decoration: line-through; }

  .badge-repeat {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 2px;
    background: color-mix(in srgb, #60a5fa 10%, transparent);
    color: #93c5fd;
    border: 1px solid color-mix(in srgb, #60a5fa 28%, transparent);
    flex-shrink: 0;
  }

  .step-detail {
    font-size: 10px;
    line-height: 1.45;
    color: color-mix(in srgb, var(--c-muted) 70%, #fff 30%);
  }

  /* Per-step target mod(s): ideal + alternatives. */
  .step-targets {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 1px;
    padding: 4px 7px;
    border-left: 2px solid color-mix(in srgb, #8aa8e6 45%, transparent);
    background: color-mix(in srgb, #1a1f3a 28%, transparent);
    border-radius: 2px;
  }
  .target-line {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .target-pos {
    flex-shrink: 0;
    min-width: 30px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-muted) 75%, #fff 25%);
  }
  .target-line.ideal .target-pos {
    color: var(--c-primary);
  }
  .target-text {
    font-size: 10px;
    line-height: 1.35;
    color: color-mix(in srgb, #8aa8e6 55%, var(--c-muted) 45%);
  }
  .target-line.ideal .target-text {
    color: #8aa8e6;
  }

  /* ── Item chips ──────────────────────────────────────────────── */
  .step-items {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .item-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px 2px 3px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
  }

  .item-icon {
    width: 18px;
    height: 18px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .item-name {
    font-size: 9px;
    color: color-mix(in srgb, var(--c-accent) 90%, #fff 10%);
    white-space: nowrap;
  }

  /* ── Branches (success/fail callouts) ────────────────────────── */
  .branches {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 5px 0 1px 40px;
  }

  .branch {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px 8px;
    border-radius: 2px;
    border-left: 2px solid transparent;
  }

  .branch.success {
    background: color-mix(in srgb, #4ade80 6%, transparent);
    border-left-color: color-mix(in srgb, #4ade80 50%, transparent);
  }
  .branch.fail {
    background: color-mix(in srgb, #f38d78 6%, transparent);
    border-left-color: color-mix(in srgb, #f38d78 50%, transparent);
  }

  .branch-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .branch.success .branch-label { color: #86efac; }
  .branch.fail .branch-label { color: #f38d78; }

  .branch-text {
    font-size: 10px;
    line-height: 1.45;
    color: color-mix(in srgb, var(--c-muted) 70%, #fff 30%);
  }

  /* ── Final Result (target mods on the finished item) ─────────── */
  .result-panel {
    margin: 4px;
    padding: 8px 10px 10px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, #1a1f3a 30%, var(--c-bg));
  }

  .result-title {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-accent);
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
  }

  .result-mods {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .result-mod {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  /* PoE affix blue for the mod text. */
  .mod-text {
    font-size: 11px;
    line-height: 1.35;
    color: #8aa8e6;
  }
  .result-mod.fractured .mod-text {
    color: #c9aa71;
  }

  .mod-tag {
    flex-shrink: 0;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 2px;
    line-height: 1.4;
  }
  .tag-prefix {
    color: #93c5fd;
    background: color-mix(in srgb, #60a5fa 12%, transparent);
    border: 1px solid color-mix(in srgb, #60a5fa 30%, transparent);
  }
  .tag-suffix {
    color: #c4b5fd;
    background: color-mix(in srgb, #a78bfa 12%, transparent);
    border: 1px solid color-mix(in srgb, #a78bfa 30%, transparent);
  }
  .tag-fractured {
    color: #d8b888;
    background: color-mix(in srgb, #c9aa71 14%, transparent);
    border: 1px solid color-mix(in srgb, #c9aa71 36%, transparent);
  }
  .tag-implicit {
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%);
    background: color-mix(in srgb, var(--c-accent) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
  }
  /* "Any of these" group — alternatives where any single mod is acceptable. */
  .result-anyof {
    margin-top: 6px;
    padding: 5px 0 1px 8px;
    border-left: 2px solid color-mix(in srgb, var(--c-accent) 35%, transparent);
  }
  .anyof-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-accent) 75%, #fff 25%);
    margin-bottom: 4px;
  }
  .result-anyof .mod-text {
    color: color-mix(in srgb, #8aa8e6 80%, var(--c-muted) 20%);
  }

  /* Item level chip next to the base name. */
  .ilvl-chip {
    display: inline-block;
    margin-left: 6px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 0 5px;
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-accent) 90%, #fff 10%);
    background: color-mix(in srgb, var(--c-accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--c-accent) 32%, transparent);
    vertical-align: middle;
  }
</style>
