// Manual stopwatch behind the Timer tab's "Manual" mode, plus which of the
// two timer modes is active. Both live here rather than inside
// SpeedrunTimer.svelte because voice commands (+page.svelte) need to drive
// them, and a component-local $state can't be reached from outside.
//
// Unlike campaignTimer, elapsed time is derived on read from a wall-clock
// anchor instead of a rAF loop, so the value stays correct while the Timer
// tab is unmounted.

import { persistGet, persistSet } from './persist';

export type ManualTimerState = 'idle' | 'running' | 'paused';
export type TimerMode = 'manual' | 'campaign';

const MODE_KEY = 'EXILECOMPASS_TIMER_MODE_V1';

export interface ManualSplit {
  label: string;
  elapsed: number;
  delta: number;
}

// PoE1 has 10 acts, PoE2 4 (+ interludes) — sized to the longer campaign;
// falls back to "Split N" once labels run out.
const DEFAULT_LABELS = Array.from({ length: 10 }, (_, i) => `Act ${i + 1}`);

class ManualTimer {
  state = $state<ManualTimerState>('idle');
  splits = $state<ManualSplit[]>([]);

  /** Accumulated time from previous run/pause cycles. */
  #accumulated = $state(0);
  /** Date.now() when the current running stretch began; null while stopped. */
  #since = $state<number | null>(null);

  elapsedAt(now: number): number {
    return this.#since === null ? this.#accumulated : this.#accumulated + (now - this.#since);
  }

  get elapsed(): number {
    return this.elapsedAt(Date.now());
  }

  get running(): boolean {
    return this.state === 'running';
  }

  start() {
    if (this.state === 'running') return;
    this.#since = Date.now();
    this.state = 'running';
  }

  pause() {
    if (this.state !== 'running') return;
    this.#accumulated = this.elapsed;
    this.#since = null;
    this.state = 'paused';
  }

  toggle() {
    if (this.state === 'running') this.pause();
    else this.start();
  }

  /** Record a split at the current elapsed time. No-op unless running. */
  split(): ManualSplit | null {
    if (this.state !== 'running') return null;
    const elapsed = this.elapsed;
    const prev = this.splits.length > 0 ? this.splits[this.splits.length - 1].elapsed : 0;
    const label = DEFAULT_LABELS[this.splits.length] ?? `Split ${this.splits.length + 1}`;
    const entry = { label, elapsed, delta: elapsed - prev };
    this.splits = [...this.splits, entry];
    return entry;
  }

  reset() {
    this.state = 'idle';
    this.#accumulated = 0;
    this.#since = null;
    this.splits = [];
  }
}

export const manualTimer = new ManualTimer();

class TimerModeStore {
  current = $state<TimerMode>('manual');

  async load() {
    const saved = await persistGet(MODE_KEY);
    if (saved === 'manual' || saved === 'campaign') this.current = saved;
  }

  set(mode: TimerMode) {
    this.current = mode;
    void persistSet(MODE_KEY, mode);
  }
}

export const timerMode = new TimerModeStore();
