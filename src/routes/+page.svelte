<script lang="ts">
  import { onMount } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import {
    isRegistered as isGlobalShortcutRegistered,
    register as registerGlobalShortcut,
    unregister as unregisterGlobalShortcut,
  } from '@tauri-apps/plugin-global-shortcut';
  import TitleBar from '$lib/components/TitleBar.svelte';
  import CampaignGuide from '$lib/components/CampaignGuide.svelte';
  import PermanentRewards from '$lib/components/PermanentRewards.svelte';
  import StashRegex from '$lib/components/StashRegex.svelte';
  import SpeedrunTimer from '$lib/components/SpeedrunTimer.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale, locales, setLocale } from '$lib/paraglide/runtime.js';
  import {
    overlayState,
    refreshStatus,
    attachToGame,
    detachFromGame,
    toggleClickThrough,
  } from '$lib/overlay.svelte';
  import {
    HOTKEY_ACTIONS,
    getDefaultHotkeyBindings,
    hotkeyMatchesEvent,
    loadHotkeyBindings,
    normalizeHotkeyCombo,
    saveHotkeyBindings,
    type HotkeyActionId,
    type HotkeyBindings,
  } from '$lib/hotkeys';
  import { invoke } from '@tauri-apps/api/core';

  type AppLocale = (typeof locales)[number];
  type SettingsTabId = 'hotkeys' | 'language' | 'logFile' | 'importBuilds';
  type MainViewId = 'campaign' | 'rewards' | 'stash' | 'timer';

  const LOG_FILE_STORAGE_KEY = 'EXILECOMPASS_LOG_FILE_PATH_V1';
  const SETTINGS_GROUPS = ['GENERAL', 'IMPORT'] as const;
  const SETTINGS_TABS: Array<{ group: 'GENERAL' | 'IMPORT'; id: SettingsTabId }> = [
    { group: 'GENERAL', id: 'hotkeys' },
    { group: 'GENERAL', id: 'language' },
    { group: 'GENERAL', id: 'logFile' },
    { group: 'IMPORT', id: 'importBuilds' },
  ];

  let error = $state('');
  let showSettings = $state(false);
  let mainView = $state<MainViewId>('campaign');
  let hotkeyError = $state('');
  let registeredClickThroughShortcut = '';
  let autoAttachInFlight = false;
  let lastAttached = false;
  let activeSettingsTab = $state<SettingsTabId>('hotkeys');
  let selectedLocale = $state<AppLocale>('en');
  let logFilePath = $state('');
  let logFileError = $state('');
  let autoDetecting = $state(false);
  let hotkeyBindings = $state<HotkeyBindings>(getDefaultHotkeyBindings());
  let hotkeyDrafts = $state<HotkeyBindings>(getDefaultHotkeyBindings());

  function getSettingsGroupLabel(group: 'GENERAL' | 'IMPORT') {
    return group === 'GENERAL' ? m.settings_group_general() : m.settings_group_import();
  }

  function getSettingsTabLabel(tabId: SettingsTabId) {
    if (tabId === 'hotkeys') return m.settings_tab_hotkeys();
    if (tabId === 'language') return m.label_language();
    if (tabId === 'logFile') return m.settings_tab_log_file();
    return m.settings_tab_import_builds();
  }

  function getHotkeyDescription(actionId: HotkeyActionId) {
    if (actionId === 'toggleClickThrough') return m.hotkey_toggle_clickthrough();
    if (actionId === 'refreshStatus') return m.hotkey_refresh_status();
    return m.hotkey_toggle_settings();
  }

  onMount(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    hotkeyBindings = loadHotkeyBindings();
    hotkeyDrafts = { ...hotkeyBindings };
    selectedLocale = getLocale() as AppLocale;
    logFilePath = window.localStorage.getItem(LOG_FILE_STORAGE_KEY) ?? '';

    syncGlobalClickThroughHotkey(hotkeyBindings.toggleClickThrough).catch((e) => {
      hotkeyError = `${m.error_failed_register_clickthrough_hotkey()} ${String(e)}`;
    });

    const syncOverlayAttachment = async () => {
      if (cancelled || autoAttachInFlight) return;
      autoAttachInFlight = true;
      try {
        const status = await refreshStatus();

        // Clear any stale error each time we successfully read status.
        error = '';

        if (status.gameRunning && !status.attached) {
          try {
            await attachToGame();
            lastAttached = true;
          } catch {
            // Attach can fail transiently while the game window is still
            // initializing. Swallow it — the next poll will retry.
          }
          return;
        }

        if (!status.gameRunning && lastAttached) {
          await detachFromGame();
          lastAttached = false;
        } else {
          lastAttached = status.attached;
        }
      } catch (e) {
        // Only surface errors from refreshStatus / detach — those are genuine.
        if (!cancelled) error = String(e);
      } finally {
        autoAttachInFlight = false;
      }
    };

    syncOverlayAttachment();
    pollTimer = setInterval(syncOverlayAttachment, 1000);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (registeredClickThroughShortcut) {
        unregisterGlobalShortcut(registeredClickThroughShortcut).catch(() => {});
      }
    };
  });

  function toGlobalShortcutAccelerator(combo: string): string | null {
    const normalized = normalizeHotkeyCombo(combo);
    if (!normalized) return null;
    const parts = normalized.split('+');
    const key = parts.pop();
    if (!key) return null;
    const mappedParts = parts.map((p) => {
      if (p === 'Ctrl') return 'CommandOrControl';
      if (p === 'Meta') return 'Super';
      return p;
    });
    mappedParts.push(key);
    return mappedParts.join('+');
  }

  async function syncGlobalClickThroughHotkey(combo: string) {
    const accelerator = toGlobalShortcutAccelerator(combo);
    if (!accelerator) throw new Error(`${m.error_invalid_clickthrough_combo()} ${combo}`);
    if (registeredClickThroughShortcut && registeredClickThroughShortcut !== accelerator) {
      await unregisterGlobalShortcut(registeredClickThroughShortcut);
      registeredClickThroughShortcut = '';
    }
    if (await isGlobalShortcutRegistered(accelerator)) {
      await unregisterGlobalShortcut(accelerator);
    }
    await registerGlobalShortcut(accelerator, async (event) => {
      if (event.state !== 'Pressed') return;
      await toggleClickThrough();
      await refreshStatus();
    });
    registeredClickThroughShortcut = accelerator;
  }

  async function handleAttach() {
    error = '';
    try { await attachToGame(); } catch (e) { error = String(e); }
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  async function handleHotkey(event: KeyboardEvent) {
    if (isTypingTarget(event.target)) return;
    if (hotkeyMatchesEvent(event, hotkeyBindings.refreshStatus)) {
      event.preventDefault();
      await refreshStatus();
      return;
    }
    if (hotkeyMatchesEvent(event, hotkeyBindings.toggleSettings)) {
      event.preventDefault();
      showSettings = !showSettings;
    }
  }

  function updateHotkeyDraft(actionId: HotkeyActionId, value: string) {
    hotkeyDrafts = { ...hotkeyDrafts, [actionId]: value };
  }

  async function saveHotkeys() {
    const next: HotkeyBindings = { ...hotkeyBindings };
    const seen: Record<string, HotkeyActionId | undefined> = {};
    for (const action of HOTKEY_ACTIONS) {
      const normalized = normalizeHotkeyCombo(hotkeyDrafts[action.id]);
      if (!normalized) {
        hotkeyError = `${m.error_invalid_hotkey_for()} ${getHotkeyDescription(action.id)}`;
        return;
      }
      const existing = seen[normalized];
      if (existing) {
        hotkeyError = `${m.error_duplicate_hotkey()} ${normalized} (${getHotkeyDescription(existing)} / ${getHotkeyDescription(action.id)})`;
        return;
      }
      seen[normalized] = action.id;
      next[action.id] = normalized;
    }
    hotkeyError = '';
    hotkeyBindings = next;
    hotkeyDrafts = { ...next };
    saveHotkeyBindings(next);
    await syncGlobalClickThroughHotkey(next.toggleClickThrough);
  }

  async function resetHotkeys() {
    const defaults = getDefaultHotkeyBindings();
    hotkeyError = '';
    hotkeyBindings = defaults;
    hotkeyDrafts = { ...defaults };
    saveHotkeyBindings(defaults);
    await syncGlobalClickThroughHotkey(defaults.toggleClickThrough);
  }

  async function handleLocaleChange() {
    await setLocale(selectedLocale, { reload: false });
    showSettings = true;
    activeSettingsTab = 'language';
  }

  function getLocaleLabel(locale: AppLocale): string {
    try {
      return new Intl.DisplayNames([selectedLocale], { type: 'language' }).of(locale) ?? locale;
    } catch { return locale; }
  }

  async function autoDetectLogFile() {
    logFileError = '';
    autoDetecting = true;
    try {
      const detected = await invoke<string | null>('detect_log_file');
      if (detected) {
        logFilePath = detected;
        window.localStorage.setItem(LOG_FILE_STORAGE_KEY, detected);
      } else {
        logFileError = m.error_log_not_found();
      }
    } catch (e) {
      logFileError = String(e);
    } finally {
      autoDetecting = false;
    }
  }

  async function chooseLogFile() {
    logFileError = '';
    try {
      const selection = await open({
        directory: false,
        multiple: false,
        filters: [
          { name: m.dialog_log_files(), extensions: ['log', 'txt'] },
          { name: m.dialog_all_files(), extensions: ['*'] },
        ],
      });
      if (!selection || Array.isArray(selection)) return;
      logFilePath = selection;
      window.localStorage.setItem(LOG_FILE_STORAGE_KEY, selection);
    } catch (e) {
      logFileError = `${m.error_failed_open_file_picker()} ${String(e)}`;
    }
  }

  function clearLogFile() {
    logFileError = '';
    logFilePath = '';
    window.localStorage.removeItem(LOG_FILE_STORAGE_KEY);
  }
</script>

<svelte:window onkeydown={handleHotkey} />

<div class="app-shell">
  <TitleBar title={m.app_title()}>
    {#snippet controlsLeft()}
      <div
        class="status-wifi"
        class:attached={overlayState.attached}
        class:game-running={overlayState.gameRunning && !overlayState.attached}
        aria-label={overlayState.attached ? 'Attached' : overlayState.gameRunning ? 'Game found' : 'Waiting for game'}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M1.5 8.5a14.5 14.5 0 0 1 21 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M5.5 12.5a9.5 9.5 0 0 1 13 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M9.5 16.5a5.5 5.5 0 0 1 5 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="20.5" r="1.5" fill="currentColor"/>
        </svg>
      </div>
      <button
        class="titlebar-icon-btn"
        class:active={showSettings}
        onclick={() => (showSettings = !showSettings)}
        title={m.tooltip_settings_hotkeys()}
        aria-label={m.tooltip_settings_hotkeys()}
      >
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="13" height="13">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M6.50001 0H9.50001L10.0939 2.37548C10.7276 2.6115 11.3107 2.95155 11.8223 3.37488L14.1782 2.70096L15.6782 5.29904L13.9173 7.00166C13.9717 7.32634 14 7.65987 14 8C14 8.34013 13.9717 8.67366 13.9173 8.99834L15.6782 10.701L14.1782 13.299L11.8223 12.6251C11.3107 13.0484 10.7276 13.3885 10.0939 13.6245L9.50001 16H6.50001L5.90614 13.6245C5.27242 13.3885 4.68934 13.0484 4.17768 12.6251L1.82181 13.299L0.321808 10.701L2.08269 8.99834C2.02831 8.67366 2.00001 8.34013 2.00001 8C2.00001 7.65987 2.02831 7.32634 2.08269 7.00166L0.321808 5.29904L1.82181 2.70096L4.17768 3.37488C4.68934 2.95155 5.27241 2.6115 5.90614 2.37548L6.50001 0ZM8.00001 10C9.10458 10 10 9.10457 10 8C10 6.89543 9.10458 6 8.00001 6C6.89544 6 6.00001 6.89543 6.00001 8C6.00001 9.10457 6.89544 10 8.00001 10Z" fill="currentColor"/>
        </svg>
      </button>
    {/snippet}
  </TitleBar>

  <main class="content">
    {#if showSettings}
      <!-- Settings panel as overlay -->
      <div class="settings-overlay">
        <div class="settings-header-row">
          <span class="settings-title">Settings</span>
          <button class="close-settings" onclick={() => (showSettings = false)} aria-label="Close settings">✕</button>
        </div>
        <div class="settings-body">
          <nav class="settings-nav">
            {#each SETTINGS_GROUPS as group (group)}
              <div class="settings-nav-group">
                <div class="settings-group-label">{getSettingsGroupLabel(group)}</div>
                {#each SETTINGS_TABS.filter((t) => t.group === group) as tab (tab.id)}
                  <button
                    class="settings-nav-btn"
                    class:active={activeSettingsTab === tab.id}
                    onclick={() => (activeSettingsTab = tab.id)}
                    type="button"
                  >{getSettingsTabLabel(tab.id)}</button>
                {/each}
              </div>
            {/each}
          </nav>

          <div class="settings-content">
            {#if activeSettingsTab === 'hotkeys'}
              <div class="settings-section-title">{m.settings_tab_hotkeys()}</div>
              <ul class="hotkey-list">
                {#each HOTKEY_ACTIONS as hotkey (hotkey.id)}
                  <li class="hotkey-row">
                    <input
                      class="hotkey-input"
                      value={hotkeyDrafts[hotkey.id]}
                      oninput={(e) => updateHotkeyDraft(hotkey.id, (e.currentTarget as HTMLInputElement).value)}
                      aria-label={`${m.aria_hotkey_for()} ${getHotkeyDescription(hotkey.id)}`}
                    />
                    <span class="hotkey-desc">{getHotkeyDescription(hotkey.id)}</span>
                  </li>
                {/each}
              </ul>
              <div class="settings-actions">
                <button class="btn btn-primary" onclick={saveHotkeys}>{m.action_save_hotkeys()}</button>
                <button class="btn btn-ghost" onclick={resetHotkeys}>{m.action_reset_defaults()}</button>
              </div>
              {#if hotkeyError}
                <p class="inline-error">{hotkeyError}</p>
              {/if}

            {:else if activeSettingsTab === 'language'}
              <div class="settings-section-title">{m.label_language()}</div>
              <label class="field-label" for="language-select">{m.label_language()}</label>
              <select id="language-select" class="field-select" bind:value={selectedLocale} onchange={handleLocaleChange}>
                {#each locales as locale (locale)}
                  <option value={locale}>{getLocaleLabel(locale as AppLocale)}</option>
                {/each}
              </select>
              <p class="field-help">{m.settings_language_help()}</p>

            {:else if activeSettingsTab === 'logFile'}
              <div class="settings-section-title">{m.settings_log_file_title()}</div>
              <label class="field-label" for="log-file-path">{m.settings_log_file_label()}</label>
              <input id="log-file-path" class="field-input" value={logFilePath} readonly placeholder={m.settings_log_file_placeholder()} />
              <div class="settings-actions">
                <button class="btn btn-primary" type="button" onclick={autoDetectLogFile} disabled={autoDetecting}>
                  {autoDetecting ? '...' : m.action_auto_detect()}
                </button>
                <button class="btn btn-ghost" type="button" onclick={chooseLogFile}>{m.action_browse()}</button>
                {#if logFilePath}
                  <button class="btn btn-ghost" type="button" onclick={clearLogFile}>{m.action_clear()}</button>
                {/if}
              </div>
              <p class="field-help">{m.settings_log_file_help()}</p>
              {#if logFileError}
                <p class="inline-error">{logFileError}</p>
              {/if}

            {:else if activeSettingsTab === 'importBuilds'}
              <div class="settings-section-title">{m.settings_import_builds_title()}</div>
              <div class="placeholder-text">{m.settings_import_builds_placeholder()}</div>
            {/if}
          </div>
        </div>
      </div>
    {:else if !overlayState.gameRunning}
      <!-- Waiting for PoE2 -->
      <div class="waiting-screen">
        <div class="waiting-spinner" aria-hidden="true"></div>
        <p class="waiting-title">Waiting for Path of Exile 2</p>
        <p class="waiting-sub">Launch the game and the overlay will attach automatically.</p>
        {#if error}
          <p class="error-bar" style="margin-top:12px">{error}</p>
        {/if}
      </div>
    {:else}
      <!-- Main content (game is running) -->
      <div class="view-wrapper">
        <!-- Tab nav -->
        <div class="view-tabs">
          <button
            class="view-tab"
            class:active={mainView === 'campaign'}
            onclick={() => (mainView = 'campaign')}
            type="button"
          >{m.nav_campaign()}</button>
          <button
            class="view-tab"
            class:active={mainView === 'rewards'}
            onclick={() => (mainView = 'rewards')}
            type="button"
          >{m.nav_rewards()}</button>
          <button
            class="view-tab"
            class:active={mainView === 'stash'}
            onclick={() => (mainView = 'stash')}
            type="button"
          >{m.nav_stash()}</button>
          <button
            class="view-tab"
            class:active={mainView === 'timer'}
            onclick={() => (mainView = 'timer')}
            type="button"
          >{m.nav_timer()}</button>
        </div>

        <!-- Tab content -->
        <div class="view-content">
          {#if mainView === 'campaign'}
            <CampaignGuide />
          {:else if mainView === 'rewards'}
            <PermanentRewards />
          {:else if mainView === 'stash'}
            <StashRegex />
          {:else}
            <SpeedrunTimer />
          {/if}
        </div>

        {#if error}
          <p class="error-bar">{error}</p>
        {/if}
      </div>
    {/if}
  </main>
</div>

<style>
  /* ── Reset & globals ─────────────────────────────────────────── */
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(html, body) {
    width: 100%;
    height: 100%;
    background: transparent;
    overflow: hidden;
  }

  :global(body) {
    font-family: 'Inter Tight', 'Inter', 'Segoe UI', sans-serif;
    font-size: 13px;
    color: #e8e4de;
  }

  :global(::-webkit-scrollbar) { width: 5px; height: 5px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background: color-mix(in srgb, #b8b4ae 38%, transparent);
    border-radius: 3px;
  }
  :global(::-webkit-scrollbar-thumb:hover) {
    background: color-mix(in srgb, #b8b4ae 60%, transparent);
  }
  :global(*) {
    scrollbar-color: color-mix(in srgb, #b8b4ae 38%, transparent) transparent;
    scrollbar-width: thin;
  }

  /* ── App shell ───────────────────────────────────────────────── */
  .app-shell {
    --c-primary: #e8e4de;
    --c-accent: #b8b4ae;
    --c-mid: #1c1c1e;
    --c-muted: #48484c;
    --c-bg: #080808;

    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background: color-mix(in srgb, var(--c-bg) 98%, #000);
  }

  /* ── Status wifi icon (in titlebar) ─────────────────────────── */
  .status-wifi {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin-right: 2px;
    color: color-mix(in srgb, var(--c-muted) 55%, transparent);
    opacity: 0.5;
    animation: wifi-pulse 2.4s ease-in-out infinite;
    transition: color 0.3s, opacity 0.3s, filter 0.3s;
  }

  .status-wifi.game-running {
    color: #f0c040;
    opacity: 0.8;
    animation: none;
    filter: drop-shadow(0 0 4px color-mix(in srgb, #f0c040 50%, transparent));
  }

  .status-wifi.attached {
    color: #4ade80;
    opacity: 1;
    animation: none;
    filter: drop-shadow(0 0 5px color-mix(in srgb, #4ade80 55%, transparent));
  }

  @keyframes wifi-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.6; }
  }

  .titlebar-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: color-mix(in srgb, var(--c-muted) 80%, transparent);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }

  .titlebar-icon-btn:hover,
  .titlebar-icon-btn.active {
    color: var(--c-primary);
    background: color-mix(in srgb, var(--c-primary) 8%, transparent);
  }

  /* ── Main content area ───────────────────────────────────────── */
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 8px;
  }

  /* ── Settings overlay ────────────────────────────────────────── */
  .settings-overlay {
    display: flex;
    flex-direction: column;
    height: 100%;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
    overflow: hidden;
  }

  .settings-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 14px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    flex-shrink: 0;
  }

  .settings-title {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-primary);
    text-shadow: 0 0 10px color-mix(in srgb, var(--c-primary) 35%, transparent);
  }

  .close-settings {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--c-muted) 80%, transparent);
    font-size: 12px;
    cursor: pointer;
    border-radius: 2px;
    transition: color 0.15s;
  }

  .close-settings:hover { color: #f38d78; }

  .settings-body {
    display: grid;
    grid-template-columns: 150px 1fr;
    flex: 1;
    overflow: hidden;
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px 0 12px 10px;
    border-right: 1px solid color-mix(in srgb, var(--c-accent) 14%, transparent);
    overflow-y: auto;
  }

  .settings-nav-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .settings-group-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-accent) 60%, transparent);
    padding: 0 8px;
    margin-bottom: 3px;
  }

  .settings-nav-btn {
    padding: 6px 8px;
    border: none;
    border-radius: 2px;
    background: transparent;
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
    font: inherit;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .settings-nav-btn:hover { background: rgba(255,255,255,0.03); color: var(--c-primary); }
  .settings-nav-btn.active {
    background: color-mix(in srgb, var(--c-primary) 8%, transparent);
    color: var(--c-primary);
  }

  .settings-content {
    padding: 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .settings-section-title {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--c-primary);
    padding-bottom: 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    margin-bottom: 2px;
  }

  .hotkey-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .hotkey-row {
    display: grid;
    grid-template-columns: 130px 1fr;
    gap: 8px;
    align-items: center;
  }

  .hotkey-input {
    padding: 4px 7px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 45%, transparent);
    background: color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
    color: var(--c-primary);
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 11px;
    transition: border-color 0.15s;
  }

  .hotkey-input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--c-primary) 60%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--c-accent) 28%, transparent);
  }

  .hotkey-desc {
    font-size: 11px;
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
  }

  .field-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
  }

  .field-input,
  .field-select {
    width: 100%;
    padding: 6px 8px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent);
    background: color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
    color: var(--c-primary);
    font: inherit;
    font-size: 12px;
    transition: border-color 0.15s;
  }

  .field-input::placeholder { color: color-mix(in srgb, var(--c-muted) 80%, transparent); }
  .field-input:focus, .field-select:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--c-primary) 50%, transparent);
  }

  .field-help {
    font-size: 11px;
    color: color-mix(in srgb, var(--c-muted) 86%, #fff 14%);
    line-height: 1.45;
  }

  .placeholder-text {
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 16%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--c-bg) 96%, var(--c-mid));
    color: color-mix(in srgb, var(--c-muted) 82%, #fff 18%);
    font-size: 11px;
    line-height: 1.5;
  }

  .settings-actions {
    display: flex;
    gap: 6px;
  }

  /* ── Main view ───────────────────────────────────────────────── */
  .view-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 6px;
  }

  /* Tabs */
  .view-tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    flex-shrink: 0;
  }

  .view-tab {
    flex: 1;
    padding: 5px 8px;
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
    border: none;
    border-radius: 2px 2px 0 0;
    color: color-mix(in srgb, var(--c-accent) 65%, transparent);
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s;
  }

  .view-tab:hover {
    background: color-mix(in srgb, var(--c-bg) 84%, var(--c-mid));
    color: var(--c-accent);
  }

  .view-tab.active {
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
    border-bottom: 2px solid var(--c-primary);
    color: var(--c-primary);
    text-shadow: 0 0 8px color-mix(in srgb, var(--c-primary) 30%, transparent);
  }

  /* Content pane */
  .view-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Error */
  .error-bar {
    flex-shrink: 0;
    padding: 5px 10px;
    background: rgba(72, 22, 18, 0.72);
    border: 1px solid rgba(194, 79, 66, 0.42);
    border-radius: 2px;
    color: #f8ccc2;
    font-size: 11px;
  }

  .inline-error {
    color: #f8ccc2;
    font-size: 11px;
    padding: 4px 8px;
    background: rgba(72, 22, 18, 0.72);
    border-radius: 2px;
    border: 1px solid rgba(194, 79, 66, 0.42);
  }

  /* ── Waiting screen ─────────────────────────────────────────── */
  .waiting-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px 16px;
    text-align: center;
  }

  .waiting-spinner {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-top-color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    animation: spin 1.1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .waiting-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%);
  }

  .waiting-sub {
    font-size: 11px;
    color: color-mix(in srgb, var(--c-muted) 80%, transparent);
    max-width: 240px;
    line-height: 1.5;
  }

  /* ── Shared button styles ────────────────────────────────────── */
  .btn {
    padding: 5px 13px;
    border-radius: 2px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, transform 0.1s;
    border: 1px solid transparent;
  }

  .btn:hover { transform: translateY(-1px); }
  .btn:active { transform: translateY(0); }

  .btn-primary {
    background: color-mix(in srgb, var(--c-primary) 15%, transparent);
    border-color: color-mix(in srgb, var(--c-primary) 45%, transparent);
    color: var(--c-primary);
    box-shadow: 0 0 8px color-mix(in srgb, var(--c-primary) 12%, transparent);
  }

  .btn-primary:hover {
    background: color-mix(in srgb, var(--c-primary) 22%, transparent);
    border-color: color-mix(in srgb, var(--c-primary) 60%, transparent);
  }

  .btn-ghost {
    background: transparent;
    border-color: color-mix(in srgb, var(--c-accent) 30%, transparent);
    color: color-mix(in srgb, var(--c-accent) 85%, #fff 15%);
  }

  .btn-ghost:hover {
    background: color-mix(in srgb, var(--c-accent) 8%, transparent);
    color: var(--c-primary);
  }


</style>
