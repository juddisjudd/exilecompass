<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { campaignTimer } from '$lib/campaignTimer.svelte';

  type TimerState = 'idle' | 'running' | 'paused';
  type Mode = 'manual' | 'campaign';

  interface Split {
    label: string;
    elapsed: number;
    delta: number;
  }

  const DEFAULT_LABELS = ['Act 1', 'Act 2', 'Act 3', 'Act 4', 'Act 5', 'Act 6'];

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
    if (mode === 'campaign' && campaignTimer.running) {
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
    if (campaignTimer.startMs === null) return 0;
    const end = campaignTimer.running ? nowMs : (campaignTimer.stopMs ?? campaignTimer.startMs);
    return end - campaignTimer.startMs;
  });

  function segMs(seg: { start: number | null; end: number | null }): number | null {
    if (seg.start === null) return null;
    const end = seg.end ?? (campaignTimer.running ? nowMs : seg.start);
    return end - seg.start;
  }
</script>

<div class="timer-root">
  <div class="timer-header">
    <h3>{m.timer_title()}</h3>
    <div class="mode-toggle">
      <button class="mode-btn" class:active={mode === 'manual'} onclick={() => (mode = 'manual')}>{m.timer_mode_manual()}</button>
      <button class="mode-btn" class:active={mode === 'campaign'} onclick={() => (mode = 'campaign')}>{m.timer_mode_campaign()}</button>
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
      <button class="ctrl-btn ctrl-split" onclick={split} disabled={timerState !== 'running'}>{m.timer_split()}</button>
      <button class="ctrl-btn ctrl-reset" onclick={reset} disabled={timerState === 'idle' && splits.length === 0} title={m.timer_reset_title()}>{m.action_reset()}</button>
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
    <div class="display" class:running={campaignTimer.running}>
      <span class="time">{fmtClock(campaignTotalMs)}</span>
    </div>

    <div class="controls">
      <button class="ctrl-btn ctrl-primary" class:is-pause={campaignTimer.running} onclick={() => campaignTimer.toggle()}>
        {campaignTimer.running ? m.timer_stop() : m.timer_start()}
      </button>
      {#if campaignTimer.startMs !== null}
        <button class="ctrl-btn ctrl-reset" onclick={() => campaignTimer.reset()} title={m.timer_reset_title()}>{m.action_reset()}</button>
      {/if}
    </div>

    {#if campaignTimer.startMs !== null}
      <div class="splits">
        {#each campaignTimer.segments as seg, i (seg.key)}
          {@const ms = segMs(seg)}
          <div class="split-row" class:active={campaignTimer.running && campaignTimer.currentIndex === i}>
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

  .timer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--c-bg) 86%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 38%, transparent);
    border-radius: 3px;
  }
  .timer-header h3 {
    margin: 0;
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--c-primary);
    text-shadow: 0 0 12px color-mix(in srgb, var(--c-primary) 40%, transparent);
  }

  /* Mode toggle */
  .mode-toggle { display: flex; gap: 2px; }
  .mode-btn {
    padding: 2px 9px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-muted) 80%, #fff 20%);
    font-size: 10px; font-weight: 500; letter-spacing: 0.05em;
    cursor: pointer; transition: all 0.12s;
  }
  .mode-btn.active {
    background: color-mix(in srgb, var(--c-primary) 12%, transparent);
    border-color: color-mix(in srgb, var(--c-primary) 45%, transparent);
    color: var(--c-primary);
  }

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
    border-radius: 3px; transition: border-color 0.2s;
  }
  .display.running { border-color: color-mix(in srgb, #4ade80 28%, transparent); }
  .display.paused { border-color: color-mix(in srgb, #f0c040 28%, transparent); }

  .time {
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: 32px; font-weight: 600; font-feature-settings: 'tnum'; letter-spacing: 0.04em;
    color: var(--c-primary);
    text-shadow: 0 0 20px color-mix(in srgb, var(--c-primary) 30%, transparent);
    transition: color 0.2s;
  }
  .display.running .time { color: #4ade80; text-shadow: 0 0 20px color-mix(in srgb, #4ade80 35%, transparent); }
  .display.paused .time { color: #f0c040; text-shadow: 0 0 20px color-mix(in srgb, #f0c040 30%, transparent); }

  .controls { display: flex; gap: 4px; }
  .ctrl-btn {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
    padding: 7px 12px; border-radius: 3px;
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    cursor: pointer; transition: all 0.12s; border: 1px solid;
  }
  .ctrl-primary { background: color-mix(in srgb, #4ade80 12%, transparent); border-color: color-mix(in srgb, #4ade80 38%, transparent); color: #4ade80; }
  .ctrl-primary:hover { background: color-mix(in srgb, #4ade80 18%, transparent); border-color: color-mix(in srgb, #4ade80 55%, transparent); }
  .ctrl-primary.is-pause { background: color-mix(in srgb, #f0c040 10%, transparent); border-color: color-mix(in srgb, #f0c040 34%, transparent); color: #f0c040; }
  .ctrl-primary.is-pause:hover { background: color-mix(in srgb, #f0c040 16%, transparent); border-color: color-mix(in srgb, #f0c040 50%, transparent); }

  .ctrl-split, .ctrl-reset {
    background: color-mix(in srgb, var(--c-accent) 8%, transparent);
    border-color: color-mix(in srgb, var(--c-accent) 28%, transparent);
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
    flex: 0 0 auto; padding: 7px 14px;
  }
  .ctrl-split { flex: 1; }
  .ctrl-split:hover:not(:disabled), .ctrl-reset:hover:not(:disabled) {
    background: color-mix(in srgb, var(--c-accent) 14%, transparent);
    border-color: color-mix(in srgb, var(--c-accent) 45%, transparent);
    color: var(--c-primary);
  }
  .ctrl-reset:hover:not(:disabled) { border-color: color-mix(in srgb, #f38d78 42%, transparent); color: #f38d78; }
  .ctrl-split:disabled, .ctrl-reset:disabled { opacity: 0.3; cursor: default; }

  .splits {
    display: flex; flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-radius: 3px; overflow: hidden;
  }
  .split-row {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 8%, transparent);
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
  }
  .split-row:last-child { border-bottom: none; }
  .split-row.active { background: color-mix(in srgb, #4ade80 10%, transparent); }
  .split-row.active .split-label { color: #4ade80; }

  .split-label { flex: 1; font-size: 11px; color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%); }
  .split-delta {
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: 10px; font-feature-settings: 'tnum';
    color: color-mix(in srgb, var(--c-muted) 90%, #fff 10%); min-width: 52px; text-align: right;
  }
  .split-time {
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
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
