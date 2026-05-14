<script lang="ts">
  type TimerState = 'idle' | 'running' | 'paused';

  interface Split {
    label: string;
    elapsed: number;
    delta: number;
  }

  const DEFAULT_LABELS = ['Act 1', 'Act 2', 'Act 3', 'Act 4', 'Act 5', 'Act 6'];

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
</script>

<div class="timer-root">
  <div class="timer-header">
    <h3>Speedrun Timer</h3>
    {#if timerState !== 'idle' || splits.length > 0}
      <button class="btn-reset" onclick={reset} title="Reset timer">Reset</button>
    {/if}
  </div>

  <div class="display" class:running={timerState === 'running'} class:paused={timerState === 'paused'}>
    <span class="time">{formatTime(elapsedMs)}</span>
  </div>

  <div class="controls">
    <button
      class="ctrl-btn ctrl-primary"
      class:is-pause={timerState === 'running'}
      onclick={handleStartPause}
    >
      {#if timerState === 'running'}
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
          <rect x="3" y="2" width="3.5" height="12" rx="1"/>
          <rect x="9.5" y="2" width="3.5" height="12" rx="1"/>
        </svg>
        Pause
      {:else if timerState === 'paused'}
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
          <path d="M4 2l10 6-10 6V2z"/>
        </svg>
        Resume
      {:else}
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
          <path d="M4 2l10 6-10 6V2z"/>
        </svg>
        Start
      {/if}
    </button>

    <button
      class="ctrl-btn ctrl-split"
      onclick={split}
      disabled={timerState !== 'running'}
    >
      Split
    </button>
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
</div>

<style>
  .timer-root {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

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
  }

  .display {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px 12px;
    background: color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    border-radius: 3px;
    transition: border-color 0.2s;
  }

  .display.running {
    border-color: color-mix(in srgb, #4ade80 28%, transparent);
  }

  .display.paused {
    border-color: color-mix(in srgb, #f0c040 28%, transparent);
  }

  .time {
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: 32px;
    font-weight: 600;
    font-feature-settings: 'tnum';
    letter-spacing: 0.04em;
    color: var(--c-primary);
    text-shadow: 0 0 20px color-mix(in srgb, var(--c-primary) 30%, transparent);
    transition: color 0.2s;
  }

  .display.running .time {
    color: #4ade80;
    text-shadow: 0 0 20px color-mix(in srgb, #4ade80 35%, transparent);
  }

  .display.paused .time {
    color: #f0c040;
    text-shadow: 0 0 20px color-mix(in srgb, #f0c040 30%, transparent);
  }

  .controls {
    display: flex;
    gap: 4px;
  }

  .ctrl-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 7px 12px;
    border-radius: 3px;
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.12s;
    border: 1px solid;
  }

  .ctrl-primary {
    background: color-mix(in srgb, #4ade80 12%, transparent);
    border-color: color-mix(in srgb, #4ade80 38%, transparent);
    color: #4ade80;
  }
  .ctrl-primary:hover {
    background: color-mix(in srgb, #4ade80 18%, transparent);
    border-color: color-mix(in srgb, #4ade80 55%, transparent);
  }
  .ctrl-primary.is-pause {
    background: color-mix(in srgb, #f0c040 10%, transparent);
    border-color: color-mix(in srgb, #f0c040 34%, transparent);
    color: #f0c040;
  }
  .ctrl-primary.is-pause:hover {
    background: color-mix(in srgb, #f0c040 16%, transparent);
    border-color: color-mix(in srgb, #f0c040 50%, transparent);
  }

  .ctrl-split {
    background: color-mix(in srgb, var(--c-accent) 8%, transparent);
    border-color: color-mix(in srgb, var(--c-accent) 28%, transparent);
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
  }
  .ctrl-split:hover:not(:disabled) {
    background: color-mix(in srgb, var(--c-accent) 14%, transparent);
    border-color: color-mix(in srgb, var(--c-accent) 45%, transparent);
    color: var(--c-primary);
  }
  .ctrl-split:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .splits {
    display: flex;
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-radius: 3px;
    overflow: hidden;
  }

  .split-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 8%, transparent);
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
  }
  .split-row:last-child { border-bottom: none; }

  .split-label {
    flex: 1;
    font-size: 11px;
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%);
  }

  .split-delta {
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: 10px;
    font-feature-settings: 'tnum';
    color: color-mix(in srgb, var(--c-muted) 90%, #fff 10%);
    min-width: 52px;
    text-align: right;
  }

  .split-time {
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
    font-size: 10px;
    font-weight: 600;
    font-feature-settings: 'tnum';
    color: var(--c-primary);
    min-width: 52px;
    text-align: right;
  }
</style>
