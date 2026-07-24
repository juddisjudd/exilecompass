<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { campaignTimer } from '$lib/campaignTimer.svelte';
  import { poe1CampaignTimer } from '$lib/poe1CampaignTimer.svelte';
  import { gameMode } from '$lib/gameMode.svelte';

  // PoE1 and PoE2 auto-splits are tracked by separate timer instances (PoE1's
  // is driven by area-id act prefixes, PoE2's by [SCENE] names — see
  // poe1CampaignTimer.svelte.ts) so switching games mid-run doesn't clobber
  // either one's progress.
  const timer = $derived(gameMode.current === 'poe1' ? poe1CampaignTimer : campaignTimer);

  type TimerState = 'idle' | 'running' | 'paused';
  type Mode = 'manual' | 'campaign';

  interface Split {
    label: string;
    elapsed: number;
    delta: number;
  }

  // PoE1 has 10 acts, PoE2 4 (+ interludes) — sized to the longer campaign;
  // manual mode falls back to "Split N" once labels run out.
  const DEFAULT_LABELS = Array.from({ length: 10 }, (_, i) => `Act ${i + 1}`);

  let mode = $state<Mode>('manual');

  // ── Manual timer ──────────────────────────────────────────────
  let timerState = $state<TimerState>('idle');
  let elapsedMs = $state(0);
  let splits = $state<Split[]>([]);
  let startTimestamp = 0;
  let rafId: number | null = null;

  function formatTime(ms: number, compact = false): string {
    const totalCs = Math.floor(ms / 10);
    const cs = totalCs % 100;
    const totalSecs = Math.floor(totalCs / 100);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hours = Math.floor(totalMins / 60);
    if (compact) {
      if (hours > 0) return `${hours}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
      return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    }
    if (hours > 0) {
      return `${hours}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
    }
    return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  }

  function tick() {
    elapsedMs = performance.now() - startTimestamp;
    rafId = requestAnimationFrame(tick);
  }
  function startResume() {
    startTimestamp = performance.now() - elapsedMs;
    timerState = 'running';
    rafId = requestAnimationFrame(tick);
  }
  function pause() {
    timerState = 'paused';
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function handleStartPause() {
    if (timerState === 'running') pause();
    else startResume();
  }
  function split() {
    if (timerState !== 'running') return;
    const prev = splits.length > 0 ? splits[splits.length - 1].elapsed : 0;
    const label = DEFAULT_LABELS[splits.length] ?? `Split ${splits.length + 1}`;
    splits = [...splits, { label, elapsed: elapsedMs, delta: elapsedMs - prev }];
  }
  function reset() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    timerState = 'idle';
    elapsedMs = 0;
    splits = [];
  }

  $effect(() => () => { if (rafId !== null) cancelAnimationFrame(rafId); });

  // ── Campaign timer (auto, from log) ───────────────────────────
  let nowMs = $state(Date.now());
  $effect(() => {
    if (mode === 'campaign' && timer.running) {
      const id = setInterval(() => { nowMs = Date.now(); }, 250);
      return () => clearInterval(id);
    }
  });

  function fmtClock(ms: number): string {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return h > 0
      ? `${h}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
      : `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  }

  const campaignTotalMs = $derived.by(() => {
    if (timer.startMs === null) return 0;
    const end = timer.running ? nowMs : (timer.stopMs ?? timer.startMs);
    return end - timer.startMs;
  });

  function segMs(seg: { start: number | null; end: number | null }): number | null {
    if (seg.start === null) return null;
    const end = seg.end ?? (timer.running ? nowMs : seg.start);
    return end - seg.start;
  }
</script>

<div class="timer-root">
  <div class="panel-header timer-header">
    <h3>{m.timer_title()}</h3>
    <div class="mode-toggle">
      <button class="btn" class:btn-primary={mode === 'manual'} class:btn-ghost={mode !== 'manual'} onclick={() => (mode = 'manual')}>{m.timer_mode_manual()}</button>
      <button class="btn" class:btn-primary={mode === 'campaign'} class:btn-ghost={mode !== 'campaign'} onclick={() => (mode = 'campaign')}>{m.timer_mode_campaign()}</button>
    </div>
  </div>

  {#if mode === 'manual'}
    <!-- ── Manual ───────────────────────────────────────────── -->
    <div class="display" class:running={timerState === 'running'} class:paused={timerState === 'paused'}>
      <span class="time">{formatTime(elapsedMs)}</span>
    </div>

    <div class="controls">
      <button class="ctrl-btn ctrl-primary" class:is-pause={timerState === 'running'} onclick={handleStartPause}>
        {#if timerState === 'running'}
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>
          {m.timer_pause()}
        {:else if timerState === 'paused'}
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M4 2l10 6-10 6V2z"/></svg>
          {m.timer_resume()}
        {:else}
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M4 2l10 6-10 6V2z"/></svg>
          {m.timer_start()}
        {/if}
      </button>
      <button class="btn btn-ghost ctrl-btn ctrl-split" onclick={split} disabled={timerState !== 'running'}>{m.timer_split()}</button>
      <button class="btn btn-danger ctrl-btn" onclick={reset} disabled={timerState === 'idle' && splits.length === 0} title={m.timer_reset_title()}>{m.action_reset()}</button>
    </div>

    {#if splits.length > 0}
      <div class="splits">
        {#each splits as s, i (i)}
          <div class="split-row">
            <span class="split-label">{s.label}</span>
            <span class="split-delta">+{formatTime(s.delta, true)}</span>
            <span class="split-time">{formatTime(s.elapsed, true)}</span>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- ── Campaign (auto) ──────────────────────────────────── -->
    <div class="total-label">{m.timer_total()}</div>
    <div class="display" class:running={timer.running}>
      <span class="time">{fmtClock(campaignTotalMs)}</span>
    </div>

    <div class="controls">
      <button class="ctrl-btn ctrl-primary" class:is-pause={timer.running} onclick={() => timer.toggle()}>
        {timer.running ? m.timer_stop() : m.timer_start()}
      </button>
      {#if timer.startMs !== null}
        <button class="btn btn-danger ctrl-btn" onclick={() => timer.reset()} title={m.timer_reset_title()}>{m.action_reset()}</button>
      {/if}
    </div>

    {#if timer.startMs !== null}
      <div class="splits">
        {#each timer.segments as seg, i (seg.key)}
          {@const ms = segMs(seg)}
          <div class="split-row" class:active={timer.running && timer.currentIndex === i}>
            <span class="split-label">{seg.label}</span>
            <span class="split-time">{ms === null ? '—' : fmtClock(ms)}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="campaign-hint">{m.timer_campaign_idle()}</p>
    {/if}

    <p class="campaign-hint subtle">{m.timer_campaign_hint()}</p>
  {/if}
</div>

<style>
  .timer-root { display: flex; flex-direction: column; gap: 6px; }

  .timer-header h3 {
    margin: 0;
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--c-primary);
    text-shadow: 0 0 12px color-mix(in srgb, var(--c-primary) 40%, transparent);
  }

  /* Mode toggle */
  .mode-toggle { display: flex; gap: 4px; }
  .mode-toggle .btn { height: 22px; padding: 0 10px; font-size: 10px; }

  .total-label {
    font-size: 9px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
    color: color-mix(in srgb, var(--c-muted) 70%, transparent);
    padding: 0 2px;
  }

  .display {
    display: flex; align-items: center; justify-content: center;
    padding: 18px 12px;
    background: color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    border-radius: var(--radius); transition: border-color 0.2s;
  }
  .display.running { border-color: color-mix(in srgb, var(--c-success) 28%, transparent); }
  .display.paused { border-color: color-mix(in srgb, #f0c040 28%, transparent); }

  .time {
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 32px; font-weight: 600; font-feature-settings: 'tnum'; letter-spacing: 0.04em;
    color: var(--c-primary);
    text-shadow: 0 0 20px color-mix(in srgb, var(--c-primary) 30%, transparent);
    transition: color 0.2s;
  }
  .display.running .time { color: var(--c-success); text-shadow: 0 0 20px color-mix(in srgb, var(--c-success) 35%, transparent); }
  .display.paused .time { color: #f0c040; text-shadow: 0 0 20px color-mix(in srgb, #f0c040 30%, transparent); }

  .controls { display: flex; gap: 4px; }
  .ctrl-btn { flex: 1; }
  .ctrl-primary {
    display: flex; align-items: center; justify-content: center; gap: 5px;
    padding: 7px 12px; border-radius: var(--radius);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    cursor: pointer; transition: all 0.12s; border: 1px solid;
    background: color-mix(in srgb, var(--c-success) 12%, transparent); border-color: color-mix(in srgb, var(--c-success) 38%, transparent); color: var(--c-success);
  }
  .ctrl-primary:hover { background: color-mix(in srgb, var(--c-success) 18%, transparent); border-color: color-mix(in srgb, var(--c-success) 55%, transparent); }
  .ctrl-primary.is-pause { background: color-mix(in srgb, #f0c040 10%, transparent); border-color: color-mix(in srgb, #f0c040 34%, transparent); color: #f0c040; }
  .ctrl-primary.is-pause:hover { background: color-mix(in srgb, #f0c040 16%, transparent); border-color: color-mix(in srgb, #f0c040 50%, transparent); }

  .ctrl-split { padding: 0 14px; }

  .splits {
    display: flex; flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-radius: var(--radius); overflow: hidden;
  }
  .split-row {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 8%, transparent);
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
  }
  .split-row:last-child { border-bottom: none; }
  .split-row.active { background: color-mix(in srgb, var(--c-success) 10%, transparent); }
  .split-row.active .split-label { color: var(--c-success); }

  .split-label { flex: 1; font-size: 11px; color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%); }
  .split-delta {
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 10px; font-feature-settings: 'tnum';
    color: color-mix(in srgb, var(--c-muted) 90%, #fff 10%); min-width: 52px; text-align: right;
  }
  .split-time {
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 10px; font-weight: 600; font-feature-settings: 'tnum';
    color: var(--c-primary); min-width: 52px; text-align: right;
  }

  .campaign-hint {
    margin: 0; padding: 2px;
    font-size: 10px; line-height: 1.4;
    color: color-mix(in srgb, var(--c-muted) 85%, #fff 15%);
  }
  .campaign-hint.subtle { color: color-mix(in srgb, var(--c-muted) 60%, transparent); }
</style>
