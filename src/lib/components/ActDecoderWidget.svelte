<script lang="ts">
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { persistGet, persistSet } from '$lib/persist';
  import manifest from '$lib/data/actDecoderManifest.poe1.json';

  interface ZoneState {
    variantIndex: number;
    rotation: 0 | 90 | 180 | 270;
    flipH: boolean;
  }

  const STATE_KEY = 'EXILECOMPASS_ACT_DECODER_ZONE_STATE_V1';
  // Written by +page.svelte's log-poll loop on every zone change — read once
  // on mount so a widget opened after the last change still knows the
  // current zone (Tauri events aren't replayed for late subscribers).
  const CURRENT_ZONE_KEY = 'EXILECOMPASS_ACT_DECODER_ZONE_V1';
  const DEFAULT_ZONE_STATE: ZoneState = { variantIndex: 0, rotation: 0, flipH: false };
  const ZONE_IMAGES: Record<string, string[]> = manifest;

  // Broadcast by the main window's log-poll loop (`ec-act-decoder-zone` in
  // +page.svelte) — this widget is a separate window/process and can't share
  // in-memory state with it directly.
  let areaId = $state<string | null>(null);
  let zoneStates = $state<Record<string, ZoneState>>({});

  const variants = $derived(areaId ? (ZONE_IMAGES[areaId] ?? []) : []);
  const currentState = $derived((areaId && zoneStates[areaId]) || DEFAULT_ZONE_STATE);
  const currentFile = $derived(variants[currentState.variantIndex] ?? null);

  onMount(() => {
    (async () => {
      const raw = await persistGet(STATE_KEY);
      if (!raw) return;
      try {
        zoneStates = JSON.parse(raw);
      } catch {
        /* corrupt state — start fresh */
      }
    })();

    (async () => {
      const current = await persistGet(CURRENT_ZONE_KEY);
      if (current) areaId = current;
    })();

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const handle = await listen<{ areaId: string }>('ec-act-decoder-zone', (event) => {
        areaId = event.payload.areaId;
      });
      if (cancelled) handle();
      else unlisten = handle;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  });

  function updateZoneState(patch: Partial<ZoneState>) {
    if (!areaId) return;
    zoneStates = { ...zoneStates, [areaId]: { ...currentState, ...patch } };
    void persistSet(STATE_KEY, JSON.stringify(zoneStates));
  }

  function cycleVariant(delta: number) {
    if (variants.length === 0) return;
    const next = (currentState.variantIndex + delta + variants.length) % variants.length;
    updateZoneState({ variantIndex: next });
  }

  function rotate() {
    updateZoneState({ rotation: ((currentState.rotation + 90) % 360) as ZoneState['rotation'] });
  }

  function flip() {
    updateZoneState({ flipH: !currentState.flipH });
  }
</script>

<div class="act-decoder">
  {#if !areaId}
    <p class="hint">Waiting for zone…</p>
  {:else if variants.length === 0}
    <p class="hint">No layout for this zone.</p>
  {:else}
    <div class="toolbar">
      <button onclick={() => cycleVariant(-1)} title="Previous layout">‹</button>
      <span class="variant-label">{currentState.variantIndex + 1} / {variants.length}</span>
      <button onclick={() => cycleVariant(1)} title="Next layout">›</button>
      <button onclick={rotate} title="Rotate 90°">⟳</button>
      <button onclick={flip} title="Flip horizontally">⇋</button>
    </div>
    <div class="image-wrap">
      {#if currentFile}
        <img
          src={`/act-decoder/poe1/${currentFile}`}
          alt="Zone layout"
          style={`transform: rotate(${currentState.rotation}deg) scaleX(${currentState.flipH ? -1 : 1});`}
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .act-decoder {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .hint {
    padding: 12px;
    color: var(--c-accent);
    font-size: 12px;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent);
  }

  .toolbar button {
    background: none;
    border: 1px solid color-mix(in srgb, var(--c-accent) 35%, transparent);
    color: var(--c-primary);
    cursor: pointer;
    border-radius: 3px;
    padding: 1px 7px;
    font-size: 13px;
    line-height: 1.4;
  }

  .toolbar button:hover {
    border-color: var(--c-red);
    color: var(--c-red-bright);
  }

  .variant-label {
    font-size: 11px;
    color: var(--c-accent);
    min-width: 36px;
    text-align: center;
  }

  .image-wrap {
    flex: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
  }

  .image-wrap img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
</style>
