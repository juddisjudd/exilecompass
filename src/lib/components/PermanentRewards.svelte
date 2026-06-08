<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import REWARDS_DATA from '$lib/data/rewards.json';
  import { m } from '$lib/paraglide/messages.js';
  import { trReward, trRewardGroup } from '$lib/dataI18n';
  import ConfirmReset from './ConfirmReset.svelte';

  const STATE_KEY = 'PERMANENT_REWARDS_STATE_V2';

  type RewardGroup = typeof REWARDS_DATA.groups[number];
  type Reward = RewardGroup['rewards'][number];

  let collected = $state(new SvelteSet<string>());
  // IDs auto-detected from the log file (shown with a small indicator)
  let autoDetected = $state(new SvelteSet<string>());

  onMount(() => {
    const saved = window.localStorage.getItem(STATE_KEY);
    if (saved) {
      try {
        collected = new SvelteSet<string>(JSON.parse(saved));
      } catch { /* ignore */ }
    }
    const savedAuto = window.localStorage.getItem(STATE_KEY + '_AUTO');
    if (savedAuto) {
      try {
        autoDetected = new SvelteSet<string>(JSON.parse(savedAuto));
      } catch { /* ignore */ }
    }
  });

  function save() {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(Array.from(collected)));
    window.localStorage.setItem(STATE_KEY + '_AUTO', JSON.stringify(Array.from(autoDetected)));
  }

  function toggle(id: string) {
    collected.has(id) ? collected.delete(id) : collected.add(id);
    save();
  }

  function resetAll() {
    collected = new SvelteSet<string>();
    autoDetected = new SvelteSet<string>();
    save();
  }

  /** Called by the log watcher when a reward is detected in the log file. */
  export function autoMarkReward(id: string) {
    if (!collected.has(id)) {
      collected.add(id);
      autoDetected.add(id);
      save();
    }
  }

  /** Returns current collected IDs for the log watcher to avoid re-processing. */
  export function getCollected(): Set<string> {
    return new Set(collected);
  }

  function groupCollected(group: RewardGroup): number {
    return group.rewards.reduce((s, r) => s + (collected.has(r.id) ? r.value : 0), 0);
  }
  function groupMax(group: RewardGroup): number {
    return group.rewards.reduce((s, r) => s + r.value, 0);
  }

  const ELEMENT_COLOR: Record<string, string> = {
    cold:      '#93c5fd',
    fire:      '#fca5a5',
    lightning: '#fde68a',
  };

  function valueLabel(r: Reward): string {
    if ('label' in r && r.label) return trReward(r.id, 'label', r.label as string);
    const group = REWARDS_DATA.groups.find(g => g.rewards.some(x => x.id === r.id))!;
    if (group.id === 'resistances' && 'element' in r)
      return `+${r.value}% ${(r.element as string)[0].toUpperCase() + (r.element as string).slice(1)}`;
    if (r.value) return `+${r.value}`;
    return '✓';
  }

  function valueColor(r: Reward): string {
    if ('element' in r && r.element) return ELEMENT_COLOR[r.element as string] ?? '#e8e4de';
    const group = REWARDS_DATA.groups.find(g => g.rewards.some(x => x.id === r.id))!;
    return group.color;
  }
</script>

<div class="rewards">
  <div class="rewards-header">
    <h3>{m.rewards_passive_boosts()}</h3>
    <ConfirmReset
      label={m.action_reset()}
      prompt={m.confirm_reset_rewards()}
      onconfirm={resetAll}
    />
  </div>

  {#each REWARDS_DATA.groups as group (group.id)}
    {@const total = groupCollected(group)}
    {@const max = groupMax(group)}
    {@const hasNumeric = max > 0}
    <div class="group" style="--g-color: {group.color}">
      <div class="group-header">
        <span class="group-label">{trRewardGroup(group.id, group.label)}</span>
        {#if hasNumeric}
          <span class="group-total" class:complete={total === max && max > 0}>
            {total} / {max}
          </span>
        {/if}
      </div>

      {#each group.rewards as reward (reward.id)}
        {@const done = collected.has(reward.id)}
        <label class="reward-row" class:done>
          <input
            type="checkbox"
            class="reward-check"
            checked={done}
            onchange={() => toggle(reward.id)}
          />
          <span class="reward-info">
            <span class="reward-source">{trReward(reward.id, 'source', reward.source)}</span>
            <span class="reward-location">{trReward(reward.id, 'location', reward.location)} · {reward.act}</span>
          </span>
          {#if autoDetected.has(reward.id)}
            <span class="auto-badge" title={m.rewards_auto_badge_title()}>{m.rewards_auto_badge()}</span>
          {/if}
          <span class="reward-value" style="color: {valueColor(reward)}; border-color: color-mix(in srgb, {valueColor(reward)} 28%, transparent); background: color-mix(in srgb, {valueColor(reward)} 8%, transparent)">
            {valueLabel(reward)}
          </span>
        </label>
      {/each}
    </div>
  {/each}
</div>

<style>
  .rewards {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rewards-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--c-bg) 86%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 38%, transparent);
    border-radius: 3px;
    margin-bottom: 2px;
  }

  .rewards-header h3 {
    margin: 0;
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-primary);
    text-shadow: 0 0 12px color-mix(in srgb, var(--c-primary) 40%, transparent);
  }

  .group {
    border: 1px solid color-mix(in srgb, var(--g-color, var(--c-accent)) 20%, transparent);
    border-radius: 3px;
    overflow: hidden;
  }

  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 12px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border-bottom: 1px solid color-mix(in srgb, var(--g-color, var(--c-accent)) 20%, transparent);
  }

  .group-label {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--g-color, var(--c-accent)) 90%, #fff 10%);
    text-shadow: 0 0 8px color-mix(in srgb, var(--g-color, var(--c-accent)) 25%, transparent);
  }

  .group-total {
    font-size: 10px;
    font-weight: 600;
    font-feature-settings: 'tnum';
    color: color-mix(in srgb, var(--c-muted) 80%, #fff 20%);
    letter-spacing: 0.04em;
  }
  .group-total.complete { color: #4ade80; }

  .reward-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px 5px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 8%, transparent);
    cursor: pointer;
    transition: background 0.1s;
  }
  .reward-row:last-child { border-bottom: none; }
  .reward-row:hover { background: color-mix(in srgb, var(--c-accent) 5%, transparent); }
  .reward-row.done { opacity: 0.45; }

  .reward-check {
    flex-shrink: 0;
    appearance: none;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 0;
    background: url('/ui/checkboxunchecked.webp') center/contain no-repeat;
    cursor: pointer;
    align-self: center;
    transition: opacity 0.12s;
  }
  .reward-check:hover { opacity: 0.85; }
  .reward-check:checked {
    background-image: url('/ui/checkboxchecked.webp');
  }
  .reward-check:checked::after { display: none; }

  .reward-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }

  .reward-source {
    font-size: 11px;
    color: color-mix(in srgb, var(--c-accent) 88%, #fff 12%);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .reward-location {
    font-size: 9px;
    color: color-mix(in srgb, var(--c-muted) 75%, transparent);
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .auto-badge {
    flex-shrink: 0;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 1px 4px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, #4ade80 30%, transparent);
    background: color-mix(in srgb, #4ade80 8%, transparent);
    color: color-mix(in srgb, #4ade80 80%, transparent);
    white-space: nowrap;
  }

  .reward-value {
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 2px;
    border: 1px solid;
    white-space: nowrap;
  }
</style>
