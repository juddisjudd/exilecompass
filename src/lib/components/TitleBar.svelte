<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    extra?: Snippet;
    controlsLeft?: Snippet;
  }

  let { title = 'ExileCompass', extra, controlsLeft }: Props = $props();

  const win = getCurrentWindow();

  async function close() { await win.close(); }
</script>

<header class="titlebar" data-tauri-drag-region>
  <div class="titlebar-left">
    <span class="app-title">{title}</span>
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

    <!-- PoE2 close button image -->
    <button class="ctrl-btn ctrl-close" onclick={close} title="Close" aria-label="Close"></button>
  </div>
</header>

<style>
  .titlebar {
    --c-primary: #e8e4de;
    --c-mid:     #1c1c1e;
    --c-accent:  #b8b4ae;
    --c-muted:   #48484c;
    --c-bg:      #080808;

    display: flex;
    align-items: center;
    justify-content: space-between;
    /* Height at ~55% of natural 88px — gives the ornaments enough room */
    height: 48px;
    padding: 0 4px 0 10px;

    /* Must sit above the PoeFrame overlay (z-index: 100) */
    position: relative;
    z-index: 200;

    /* 3-piece horizontal bar — caps scale to height, middle STRETCHES to fill */
    background-image:
      url('/ui/windowtitlebarleft.webp'),
      url('/ui/windowtitlebarright.webp'),
      url('/ui/windowtitlebarmiddle.webp');
    background-position: left center, right center, 0 0;
    background-repeat:   no-repeat,  no-repeat,   no-repeat;
    background-size:     auto 100%,  auto 100%,   100% 100%;

    user-select: none;
    -webkit-user-select: none;
    flex-shrink: 0;
    position: relative;
  }

  .titlebar-left {
    display: flex;
    align-items: center;
    /* clear the left gear ornament, shifted ~20px further left */
    padding-left: 62px;
  }

  .app-title {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    /* Warm parchment — matches PoE2 panel title colour */
    color: #e2c98a;
    text-transform: uppercase;
    text-shadow:
      0 0 14px rgba(210,185,110,0.55),
      0 1px 4px rgba(0,0,0,0.95);
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
    /* close button pushed toward the right corner */
    padding-right: 14px;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: #c8b060;
    cursor: pointer;
    transition: all 0.15s;
    border-radius: 2px;
    opacity: 0.7;
  }

  .ctrl-btn:hover { opacity: 1; }



  /* Close button uses the PoE2 bronze X image */
  .ctrl-close {
    width: 28px;
    height: 28px;
    background-image: url('/ui/buttonclosenormal.webp');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    color: transparent;
    font-size: 0;
    opacity: 0.8;
  }
  .ctrl-close:hover {
    background-image: url('/ui/buttonclosehover.webp');
    opacity: 1;
  }
</style>
