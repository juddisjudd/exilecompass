<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    extra?: Snippet;
    controlsLeft?: Snippet;
  }

  let { title = 'ExileCompass', extra, controlsLeft }: Props = $props();

  // Wordmark: render the "Exile" half bone-white, keep "Compass" red. Falls back
  // to the plain red title for any name that doesn't end in "Compass".
  const wordmark = $derived.by(() => {
    const m = title.match(/^(.*?)(compass)$/i);
    return m ? { lead: m[1], rest: m[2] } : { lead: '', rest: title };
  });

  const win = getCurrentWindow();

  async function close() { await win.close(); }
</script>

<header class="titlebar" data-tauri-drag-region>
  <div class="titlebar-left">
    <span class="brand-mark" aria-hidden="true"></span>
    <span class="app-title">{#if wordmark.lead}<span class="title-lead">{wordmark.lead}</span>{/if}{wordmark.rest}</span>
  </div>

  {#if extra}
    <div class="titlebar-center">
      {@render extra()}
    </div>
  {/if}

  <div class="titlebar-controls">
    {#if controlsLeft}
      {@render controlsLeft()}
    {/if}

    <button class="ctrl-btn ctrl-close" onclick={close} title="Close" aria-label="Close">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <line x1="5" y1="5" x2="19" y2="19" />
        <line x1="19" y1="5" x2="5" y2="19" />
      </svg>
    </button>
  </div>
</header>

<style>
  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    /* 18px left aligns the wordmark with the content area's padding (the nav
       tabs sit at 18px); 11px right puts the close icon's optical edge at
       ~18px too (28px button, 14px icon → 7px inset inside the button). */
    padding: 0 11px 0 18px;

    /* Must sit above the PoeFrame overlay */
    position: relative;
    z-index: 200;

    background: var(--c-mid);
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent);

    user-select: none;
    -webkit-user-select: none;
    flex-shrink: 0;
  }

  .titlebar-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Brand compass — the shared white-on-transparent mark used as a CSS mask
     so it follows the active theme's accent (same asset as the site/app icon). */
  .brand-mark {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    background: var(--c-red-bright);
    -webkit-mask: url('/compass-mark.png') center / contain no-repeat;
    mask: url('/compass-mark.png') center / contain no-repeat;
  }

  .app-title {
    /* Satoshi Black — the heaviest cut of the UI face gives the wordmark its
       display weight without a separate font family. */
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: var(--c-red-bright);
    text-transform: uppercase;
  }

  /* "Exile" half of the wordmark in bone; "Compass" keeps the red above */
  .title-lead {
    color: var(--c-primary);
  }

  .titlebar-center {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .titlebar-controls {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--c-accent);
    cursor: pointer;
    transition: color 0.15s, opacity 0.15s;
    border-radius: var(--radius);
    opacity: 0.7;
  }

  .ctrl-btn:hover { opacity: 1; }

  .ctrl-close:hover {
    color: var(--c-red-bright);
  }
</style>
