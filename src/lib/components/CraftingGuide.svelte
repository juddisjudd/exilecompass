<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    EQUIPMENT_SLOTS,
    type CraftingGuideData,
    type CraftingResultMod,
    type CraftingItemRef,
    type CraftingStep,
    type EquipmentSlot,
  } from '$lib/crafting';
  import { initialGuides, fetchGuides, cachedFetchedAt } from '$lib/crafting-data';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
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

  // A "desecration" currency (the bones) adds an *unrevealed* modifier you gamble
  // on at the Well of Souls — not the listed mod directly. Detect it from the
  // item's effect text (canonical game wording starts with "Desecrat").
  const isDesecrationItem = (it: CraftingItemRef) => /^desecrat/i.test(it.description ?? '');
  function stepDesecrates(step: CraftingStep): boolean {
    if (step.items?.some(isDesecrationItem)) return true;
    if (step.branches?.some((b) => b.items?.some(isDesecrationItem))) return true;
    // Authors often just word the action "Desecrate …" without listing the bone.
    return /desecrat/i.test(`${step.title} ${step.detail ?? ''}`);
  }

  // Completed step ids, namespaced as `${guideId}/${stepId}` so one set covers
  // every guide.
  const completed = new SvelteSet<string>();

  // Browse state: slot picker → craft listing → step guide. Persisted so the
  // overlay reopens on the craft you were mid-way through.
  let view = $state<CraftView>('slots');
  let selectedSlot = $state<EquipmentSlot | null>(null);
  let activeGuideId = $state('');

  // Bundled/cached guides immediately; the CDN refresh (onMount) updates this.
  let allGuides = $state<CraftingGuideData[]>(initialGuides());

  // Community ratings (read-only here) — fetched from the website when online;
  // silently absent offline, keeping the bundled-fallback path intact.
  let ratings = $state<Record<string, { avg: number; count: number }>>({});
  async function loadRatings() {
    try {
      const res = await fetch('https://exilecompass.com/api/ratings');
      if (res.ok) ratings = ((await res.json()).aggregates ?? {}) as typeof ratings;
    } catch {
      // offline — no ratings shown
    }
  }

  // Freshness of the guide data: when it was last pulled from the CDN, plus a
  // ticking `now` so the "updated X ago" label stays current while open.
  let lastRefreshed = $state<number | null>(cachedFetchedAt());
  let refreshing = $state(false);
  let now = $state(Date.now());

  let guide = $derived(allGuides.find((g) => g.id === activeGuideId));
  let slotGuides = $derived(allGuides.filter((g) => g.slot === selectedSlot));
  let slotLabel = $derived(EQUIPMENT_SLOTS.find((s) => s.id === selectedSlot)?.label ?? '');
  let updatedLabel = $derived(lastRefreshed ? relativeTime(lastRefreshed, now) : '');

  /** Localized "5 minutes ago" / "now" for a past timestamp. */
  function relativeTime(ts: number, nowMs: number): string {
    const secs = Math.round((ts - nowMs) / 1000);
    let rtf: Intl.RelativeTimeFormat;
    try {
      rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
    } catch {
      rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    }
    if (Math.abs(secs) < 45) return rtf.format(0, 'second');
    const mins = Math.round(secs / 60);
    if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
    return rtf.format(Math.round(hours / 24), 'day');
  }

  // Pull the latest guides from the CDN. Used on open and by the manual button.
  async function checkForUpdates() {
    if (refreshing) return;
    refreshing = true;
    const fresh = await fetchGuides();
    if (fresh) {
      allGuides = fresh;
      lastRefreshed = cachedFetchedAt() ?? Date.now();
    }
    refreshing = false;
  }

  onMount(() => {
    const saved = window.localStorage.getItem(STATE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        for (const key of parsed.completed ?? []) completed.add(key);
        if (EQUIPMENT_SLOTS.some((s) => s.id === parsed.selectedSlot)) {
          selectedSlot = parsed.selectedSlot;
        }
        if (allGuides.some((g) => g.id === parsed.activeGuideId)) {
          activeGuideId = parsed.activeGuideId;
        }
        // Only restore views whose backing selection survived validation.
        if (parsed.view === 'guide' && activeGuideId) view = 'guide';
        else if (parsed.view === 'list' && selectedSlot) view = 'list';
      } catch {
        // ignore corrupted state
      }
    }

    // Refresh from the CDN in the background — picks up new/updated guides
    // without an app release. Failure silently keeps the cached/bundled set.
    checkForUpdates();
    loadRatings();

    // Keep the "updated X ago" label live without re-fetching.
    const tick = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(tick);
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
    return allGuides.filter((g) => g.slot === slot).length;
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
    {#if view === 'slots'}
      <div class="guides-status">
        {#if lastRefreshed}
          <span class="updated">{m.crafting_updated({ time: updatedLabel })}</span>
        {/if}
        <button
          class="refresh-btn"
          class:busy={refreshing}
          onclick={checkForUpdates}
          disabled={refreshing}
          title={refreshing ? m.crafting_checking() : m.crafting_check_updates()}
          type="button"
        >
          <span class="refresh-icon" aria-hidden="true">↻</span>
          {refreshing ? m.crafting_checking() : m.crafting_check_updates()}
        </button>
      </div>
    {/if}
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
          <img class="craft-row-icon" src={encodeURI(g.bases[0].icon)} alt={g.bases[0].name} />
          <span class="craft-row-text">
            <span class="craft-row-name">{g.name}</span>
            <span class="craft-row-goal">{g.goal}</span>
            {@render ratingStars(g.uid)}
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
        <img class="base-icon" src={encodeURI(guide.bases[0].icon)} alt={guide.bases[0].name} />
        <div class="craft-card-text">
          <span class="craft-name">{guide.name}</span>
          <span class="craft-base">
            {m.crafting_base_label()}: {guide.bases.map((b) => b.name).join(' / ')}{#if guide.ilvl}<span class="ilvl-chip">ilvl {guide.ilvl}</span>{/if}
          </span>
          <span class="craft-goal">{guide.goal}</span>
          {@render ratingStars(guide.uid)}
          {#if guide.updatedAt}
            <span class="craft-updated">Updated {new Date(guide.updatedAt).toLocaleDateString()}</span>
          {/if}
          {#if guide.videoUrl}
            <button
              class="video-link"
              type="button"
              onclick={() => openExternal(guide!.videoUrl!)}
            >
              ▶ Watch video guide
            </button>
          {/if}
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
                  {#if step.optional}
                    <span class="badge-optional">{m.crafting_optional()}</span>
                  {/if}
                </span>
                {#if step.detail}
                  <span class="step-detail">{step.detail}</span>
                {/if}
                {#if step.note}
                  <span class="step-note note-{step.note.kind}">
                    <span class="note-kind">{step.note.kind}</span>
                    <span class="note-text">{step.note.text}</span>
                  </span>
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
                    {#each step.items as it (it.name)}{@render itemChip(it)}{/each}
                  </span>
                {/if}
              </span>
            </label>

            {#if stepDesecrates(step)}
              <div class="desec-note">
                <span class="desec-kind">Desecration</span>
                <span class="desec-text">
                  Adds an <strong>unrevealed</strong> Desecrated modifier — not the mod above
                  directly. Reveal it at the <strong>Well of Souls</strong> from random options (you
                  may not get the one you want). If mods are full, a random one is removed first, and
                  an item with Desecrated modifiers can't be Desecrated again.
                  <span class="desec-omens">
                    <strong>Omen of Abyssal Echoes</strong> rerolls the reveal options once;
                    <strong>Omen of Light</strong> makes the next Orb of Annulment remove only Desecrated
                    modifiers.
                  </span>
                </span>
              </div>
            {/if}

            {#if step.branches && step.branches.length > 0}
              <div class="branches">
                {#each step.branches as branch (branch.kind + branch.text)}
                  <div
                    class="branch"
                    class:success={branch.kind === 'success'}
                    class:fail={branch.kind === 'fail'}
                    class:custom={branch.kind === 'custom'}
                  >
                    <span class="branch-label">
                      {#if branch.kind === 'success'}{m.crafting_if_success()}
                      {:else if branch.kind === 'fail'}{m.crafting_if_fail()}
                      {:else}{branch.label}{/if}
                    </span>
                    <span class="branch-text">{branch.text}</span>
                    {#if branch.items && branch.items.length > 0}
                      <span class="step-items">
                        {#each branch.items as it (it.name)}{@render itemChip(it)}{/each}
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

{#snippet ratingStars(uid: string | undefined)}
  {#if uid && ratings[uid]?.count}
    {@const a = ratings[uid]}
    <span class="rating" title={`${a.avg.toFixed(1)} from ${a.count} rating${a.count > 1 ? 's' : ''}`}>
      {#each [1, 2, 3, 4, 5] as s (s)}
        <span class="star" class:on={s <= Math.round(a.avg)}>★</span>
      {/each}
      <span class="rating-num">{a.avg.toFixed(1)} ({a.count})</span>
    </span>
  {/if}
{/snippet}

{#snippet resultMod(mod: CraftingResultMod)}
  <div class="result-mod" class:fractured={mod.tag === 'fractured'}>
    {#if mod.tag}
      <span class="mod-tag tag-{mod.tag}">{mod.tag}</span>
    {/if}
    <span class="mod-text">{mod.text}</span>
  </div>
{/snippet}

{#snippet itemChip(it: CraftingItemRef)}
  {@const hasCard = !!(it.description || (it.effects && it.effects.length))}
  <span class="item-chip" class:has-card={hasCard} title={hasCard ? undefined : it.name}>
    <img class="item-icon" src={encodeURI(it.icon)} alt={it.name} />
    <span class="item-name">{it.name}</span>
    {#if hasCard}
      <span class="hovercard" role="tooltip">
        <span class="hc-name">{it.name}</span>
        {#if it.description}<span class="hc-desc">{it.description}</span>{/if}
        {#if it.effects && it.effects.length}
          {@const socketed = it.effects.filter((e) => e.socketed.length)}
          {@const bonded = it.effects.filter((e) => e.bonded.length)}
          {#if socketed.length}
            <span class="hc-group">
              <span class="hc-label">Socket-bound</span>
              {#each socketed as e (e.slot)}
                <span class="hc-line">{e.slot}: {e.socketed.join(' / ')}</span>
              {/each}
            </span>
          {/if}
          {#if bonded.length}
            <span class="hc-group">
              <span class="hc-label">Bonded</span>
              {#each bonded as e (e.slot)}
                <span class="hc-line">{e.slot}: {e.bonded.join(' / ')}</span>
              {/each}
            </span>
          {/if}
        {/if}
      </span>
    {/if}
  </span>
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

  /* Guide-data freshness + manual refresh — sits at the right of the header on
     the slot-picker view only. */
  .guides-status {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-shrink: 0;
  }
  .guides-status .updated {
    font-size: 9px;
    color: color-mix(in srgb, var(--c-muted) 65%, transparent);
    font-feature-settings: 'tnum';
    white-space: nowrap;
  }
  .refresh-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c-bg) 80%, var(--c-mid));
    color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%);
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.12s;
  }
  .refresh-btn:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--c-primary) 45%, transparent);
    color: var(--c-primary);
  }
  .refresh-btn:disabled {
    cursor: default;
    opacity: 0.7;
  }
  .refresh-icon {
    font-size: 11px;
    line-height: 1;
  }
  .refresh-btn.busy .refresh-icon {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
  .badge-optional {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--c-muted) 12%, transparent);
    color: color-mix(in srgb, var(--c-muted) 80%, #fff 20%);
    border: 1px solid color-mix(in srgb, var(--c-muted) 35%, transparent);
    flex-shrink: 0;
  }

  /* Step callout: tip / warning / alternative. */
  .step-note {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 1px;
    padding: 4px 8px;
    border-radius: 2px;
    border-left: 2px solid var(--c-accent);
    background: color-mix(in srgb, var(--c-accent) 6%, transparent);
  }
  .note-kind {
    flex-shrink: 0;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .note-text {
    font-size: 10px;
    line-height: 1.45;
    color: color-mix(in srgb, var(--c-muted) 75%, #fff 25%);
  }
  .step-note.note-warning {
    border-left-color: #fbbf24;
    background: color-mix(in srgb, #fbbf24 7%, transparent);
  }
  .note-warning .note-kind {
    color: #fbbf24;
  }
  .step-note.note-tip {
    border-left-color: #60a5fa;
    background: color-mix(in srgb, #60a5fa 7%, transparent);
  }
  .note-tip .note-kind {
    color: #93c5fd;
  }
  .step-note.note-alt {
    border-left-color: var(--c-accent);
  }
  .note-alt .note-kind {
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%);
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

  .craft-updated {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--c-muted);
    margin-top: 2px;
  }
  .video-link {
    align-self: flex-start;
    margin-top: 4px;
    padding: 3px 9px;
    font-size: 10px;
    font-weight: 600;
    color: var(--c-primary);
    background: none;
    border: 1px solid color-mix(in srgb, var(--c-accent) 30%, transparent);
    border-radius: 3px;
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }
  .video-link:hover {
    color: var(--c-primary, #fff);
    border-color: var(--c-accent);
  }

  /* ── Community rating (read-only) ────────────────────────────── */
  .rating {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    margin-top: 2px;
    line-height: 1;
  }
  .rating .star {
    font-size: 11px;
    color: color-mix(in srgb, var(--c-accent) 25%, transparent);
  }
  .rating .star.on {
    color: var(--c-primary);
  }
  .rating-num {
    margin-left: 5px;
    font-size: 9px;
    font-weight: 600;
    color: var(--c-muted);
  }

  /* ── Item chips ──────────────────────────────────────────────── */
  .step-items {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .item-chip {
    position: relative;
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

  .item-chip.has-card {
    cursor: help;
    border-bottom-style: dotted;
  }

  /* Item hovercard */
  .hovercard {
    position: absolute;
    bottom: calc(100% + 5px);
    left: 0;
    z-index: 60;
    width: max-content;
    max-width: 230px;
    display: none;
    flex-direction: column;
    gap: 5px;
    padding: 7px 9px;
    text-align: left;
    background: color-mix(in srgb, var(--c-bg) 92%, #000);
    border: 1px solid color-mix(in srgb, var(--c-accent) 35%, transparent);
    border-radius: 3px;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }
  .item-chip.has-card:hover .hovercard {
    display: flex;
  }
  .hc-name {
    font-size: 10px;
    font-weight: 600;
    color: var(--c-primary);
    white-space: normal;
  }
  .hc-desc {
    font-size: 10px;
    line-height: 1.4;
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%);
    white-space: pre-line;
  }
  .hc-group {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-top: 4px;
    border-top: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
  }
  .hc-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c-muted);
  }
  .hc-line {
    font-size: 10px;
    line-height: 1.35;
    color: color-mix(in srgb, var(--c-accent) 90%, #fff 10%);
    white-space: normal;
  }

  /* Desecration explainer callout */
  /* Olive/Abyss palette (#6E8C2B / #405919 / #1A2609). Sits outside the clickable
     step label, indented to align under the step body. */
  .desec-note {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 5px 0 1px 40px;
    padding: 5px 8px;
    border-radius: 2px;
    border-left: 2px solid #6e8c2b;
    background: color-mix(in srgb, #405919 20%, transparent);
  }
  .desec-kind {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: color-mix(in srgb, #6e8c2b 72%, #fff);
  }
  .desec-text {
    font-size: 10px;
    line-height: 1.4;
    color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%);
  }
  .desec-text strong {
    color: var(--c-primary);
    font-weight: 600;
  }
  .desec-omens {
    display: block;
    margin-top: 4px;
    color: var(--c-muted);
  }
  .desec-omens strong {
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%);
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
  .branch.custom {
    background: color-mix(in srgb, var(--c-accent) 6%, transparent);
    border-left-color: color-mix(in srgb, var(--c-accent) 45%, transparent);
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
