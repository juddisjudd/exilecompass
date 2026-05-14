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

  async function minimize() { await win.minimize(); }
  async function close() { await win.close(); }
</script>

<header class="titlebar" data-tauri-drag-region>
  <div class="titlebar-left">
    <img class="app-icon" src="/compass.svg" alt="" aria-hidden="true" />
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

    <button class="ctrl-btn ctrl-minimize" onclick={minimize} title="Minimize" aria-label="Minimize">
      <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor" aria-hidden="true">
        <rect width="10" height="1"/>
      </svg>
    </button>
    <button class="ctrl-btn ctrl-close" onclick={close} title="Close" aria-label="Close">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
</header>

<style>
  .titlebar {
    --c-primary: #e8e4de;
    --c-mid: #1c1c1e;
    --c-accent: #b8b4ae;
    --c-muted: #48484c;
    --c-bg: #080808;

    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 34px;
    padding: 0 4px 0 10px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--c-bg) 88%, var(--c-mid)) 0%,
      color-mix(in srgb, var(--c-bg) 96%, var(--c-mid)) 100%
    );
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 42%, transparent);
    user-select: none;
    -webkit-user-select: none;
    flex-shrink: 0;
    position: relative;
  }

  .titlebar::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--c-primary) 24%, transparent),
      transparent
    );
    pointer-events: none;
  }

  .titlebar-left {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .app-icon {
    width: 15px;
    height: 15px;
    opacity: 0.78;
    flex-shrink: 0;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--c-primary) 50%, transparent));
  }

  .app-title {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--c-primary);
    text-transform: uppercase;
    text-shadow:
      0 0 12px color-mix(in srgb, var(--c-primary) 45%, transparent),
      0 1px 3px rgba(0, 0, 0, 0.8);
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
    gap: 1px;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 2px;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--c-muted) 70%, transparent);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }

  .ctrl-btn:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .ctrl-minimize:hover { color: var(--c-primary); }
  .ctrl-close:hover { color: #f38d78; }
</style>
