<script lang="ts">
  import { onMount } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import {
    isRegistered as isGlobalShortcutRegistered,
    register as registerGlobalShortcut,
    unregister as unregisterGlobalShortcut,
  } from '@tauri-apps/plugin-global-shortcut';
  import TitleBar from '$lib/components/TitleBar.svelte';
  import PoeFrame from '$lib/components/PoeFrame.svelte';
  import CampaignGuide from '$lib/components/CampaignGuide.svelte';
  import PermanentRewards from '$lib/components/PermanentRewards.svelte';
  import StashRegex from '$lib/components/StashRegex.svelte';
  import PoE1Regex from '$lib/components/PoE1Regex.svelte';
  import CraftingGuide from '$lib/components/CraftingGuide.svelte';
  import PoE1LevelingGuide from '$lib/components/PoE1LevelingGuide.svelte';
  import PassiveTreeViewer from '$lib/components/PassiveTreeViewer.svelte';
  import GemLinksViewer from '$lib/components/GemLinksViewer.svelte';
  import SpeedrunTimer from '$lib/components/SpeedrunTimer.svelte';
  import BuildOverview from '$lib/components/BuildOverview.svelte';
  import AddonsHub from '$lib/components/addons/AddonsHub.svelte';
  import AddonsPanel from '$lib/components/addons/AddonsPanel.svelte';
  import { addonsHost, initAddonsHost } from '$lib/plugins/host.svelte';
  import {
    importBuild,
    loadStoredBuild,
    saveBuild,
    clearBuild as clearStoredBuild,
    listBuildFiles,
    detectBuildFolder,
    BUILD_FOLDER_KEY,
    BUILD_ACTIVE_PATH_KEY,
    type PobBuild,
    type BuildFileEntry,
  } from '$lib/pob';
  import {
    initWatcherForFile,
    loadWatcherState,
    clearWatcherState,
    pollLog,
    type LogWatcherState,
  } from '$lib/logWatcher';
  import { persistGet, persistSet, persistRemove } from '$lib/persist';
  import { campaignTimer } from '$lib/campaignTimer.svelte';
  import { poe1CampaignTimer } from '$lib/poe1CampaignTimer.svelte';
  import { campaignProgress } from '$lib/campaignProgress.svelte';
  import { levelingCompleteNext, levelingUndoLast, levelingRoute, advanceLevelingEdge } from '$lib/levelingRoute.svelte';
  import {
    importPoe1Build,
    clearPoe1Build,
    listPoe1Builds,
    activePoe1BuildId,
    setActivePoe1Build,
    removePoe1Build,
    type StoredPoe1Build,
  } from '$lib/poe1Pob';
  import ConfirmReset from '$lib/components/ConfirmReset.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale, locales, setLocale } from '$lib/paraglide/runtime.js';
  import {
    overlayState,
    refreshStatus,
    attachToGame,
    detachFromGame,
    toggleClickThrough,
    toggleHidden,
    setHidden,
  } from '$lib/overlay.svelte';
  import { gameMode, loadGameMode, setGameMode, type GameMode } from '$lib/gameMode.svelte';
  import { toggleWidget, getWidgetOpacity, setWidgetOpacity } from '$lib/widgets';
  import { theme, THEMES, loadTheme, setTheme } from '$lib/theme.svelte';
  import { uiScale, loadUiScale, setUiScale, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_STEP } from '$lib/uiScale.svelte';
  import {
    configToChords,
    getDefaultTriggerConfig,
    loadTriggerConfig,
    saveTriggerConfig,
    comboToChord,
    type TriggerConfig,
    type TriggerMode,
  } from '$lib/triggers';
  import { listen, emit } from '@tauri-apps/api/event';
  import {
    HOTKEY_ACTIONS,
    comboFromKeyboardEvent,
    getDefaultHotkeyBindings,
    hotkeyMatchesEvent,
    loadHotkeyBindings,
    normalizeHotkeyCombo,
    saveHotkeyBindings,
    type HotkeyActionId,
    type HotkeyBindings,
  } from '$lib/hotkeys';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getVersion } from '@tauri-apps/api/app';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { checkForUpdate, installUpdate, isUpdateSupported, RELEASES_URL } from '$lib/updater';
  import type { Update } from '@tauri-apps/plugin-updater';

  type AppLocale = (typeof locales)[number];
  type SettingsTabId = 'hotkeys' | 'language' | 'appearance' | 'logFile' | 'importBuilds' | 'about';

  const KOFI_URL = 'https://ko-fi.com/ohitsjudd';
  const ADDONS_LABEL = 'Add-ons';
  type MainViewId =
    | 'campaign'
    | 'rewards'
    | 'stash'
    | 'crafting'
    | 'timer'
    | 'build'
    | 'leveling'
    | 'tree'
    | 'gems'
    | 'addons';
  // Pinned add-ons get their own top-level view, keyed `addon:<id>`.
  type ViewId = MainViewId | `addon:${string}`;

  // PoE2 keeps every existing tab; PoE1 mode swaps to just its own leveling
  // guide (+ addons, which are game-agnostic) plus its own auto-split timer
  // (poe1CampaignTimer, driven by area-id act prefixes rather than PoE2's
  // scene-name table — see SpeedrunTimer.svelte for the gameMode branch).
  const POE2_TABS: MainViewId[] = ['campaign', 'rewards', 'stash', 'crafting', 'timer', 'build', 'addons'];
  const POE1_TABS: MainViewId[] = ['leveling', 'gems', 'tree', 'stash', 'timer', 'addons'];
  const visibleTabs = $derived<MainViewId[]>(gameMode.current === 'poe1' ? POE1_TABS : POE2_TABS);

  // Per-game so switching the footer game switch doesn't clobber the other
  // game's saved log path. EXILECOMPASS_LOG_FILE_PATH_V1 (no game) is the old
  // flat key from before PoE1 support — read once as a fallback for poe2.
  const LOG_FILE_STORAGE_KEY_LEGACY = 'EXILECOMPASS_LOG_FILE_PATH_V1';
  function logFileKey(game: GameMode): string {
    return `EXILECOMPASS_${game.toUpperCase()}_LOG_FILE_PATH_V1`;
  }
  const ACT_DECODER_ZONE_KEY   = 'EXILECOMPASS_ACT_DECODER_ZONE_V1';
  const CT_OPACITY_KEY         = 'EXILECOMPASS_CT_OPACITY_V1';
  const WINDOW_BOUNDS_KEY      = 'EXILECOMPASS_WINDOW_BOUNDS_V1';
  const SETTINGS_GROUPS = ['GENERAL', 'IMPORT', 'ABOUT'] as const;
  const SETTINGS_TABS: Array<{ group: 'GENERAL' | 'IMPORT' | 'ABOUT'; id: SettingsTabId }> = [
    { group: 'GENERAL', id: 'hotkeys' },
    { group: 'GENERAL', id: 'language' },
    { group: 'GENERAL', id: 'appearance' },
    { group: 'GENERAL', id: 'logFile' },
    { group: 'IMPORT', id: 'importBuilds' },
    { group: 'ABOUT', id: 'about' },
  ];

  let error = $state('');
  let showSettings = $state(false);
  let mainView = $state<ViewId>('campaign');

  // Enabled, pinned add-ons that contribute a panel — shown as top-level tabs.
  const pinnedAddons = $derived(
    addonsHost.installed.filter((a) => a.pinned && a.enabled && a.hasPanel),
  );
  const activeAddon = $derived(
    mainView.startsWith('addon:')
      ? addonsHost.installed.find((a) => a.id === mainView.slice('addon:'.length)) ?? null
      : null,
  );

  // If the active add-on tab is unpinned/disabled/removed, fall back to the hub.
  $effect(() => {
    if (mainView.startsWith('addon:')) {
      const id = mainView.slice('addon:'.length);
      if (!pinnedAddons.some((a) => a.id === id)) mainView = 'addons';
    }
  });

  // If the game mode changes and the current tab no longer applies (e.g. a
  // PoE2 tab while in PoE1 mode), snap to that mode's first tab.
  $effect(() => {
    if (mainView.startsWith('addon:')) return;
    if (!visibleTabs.includes(mainView as MainViewId)) {
      mainView = visibleTabs[0];
    }
  });

  // Log file path + watcher state are per-game (footer game switch) — reload
  // whenever the active game changes. This also covers the very first load:
  // `void gameMode.current` below only registers the reactive dependency —
  // the actual game used is re-read after awaiting loadGameMode() (idempotent
  // and now safe for concurrent callers, see gameMode.svelte.ts), so this
  // never acts on the module's stale default before the persisted value
  // settles. campaignTimer.load()/poe1CampaignTimer.load() are idempotent too,
  // so calling them here preserves "timer restored before watcher state
  // enables polling" without duplicating work.
  $effect(() => {
    void gameMode.current; // reactive dependency only — see note above
    (async () => {
      await loadGameMode();
      const game = gameMode.current;
      await campaignTimer.load();
      await poe1CampaignTimer.load();
      let path = await persistGet(logFileKey(game));
      if (!path && !legacyLogPathMigrated) {
        // One-time migration from the pre-PoE1 flat key (shared by both
        // games before this per-game split existed). Whichever game the
        // legacy value actually belonged to isn't recorded anywhere, so the
        // best signal available is "whichever game is active once gameMode
        // has settled" — claimed synchronously (before any further await)
        // so a second near-simultaneous effect run can't also adopt it.
        legacyLogPathMigrated = true;
        const legacy = await persistGet(LOG_FILE_STORAGE_KEY_LEGACY);
        if (legacy) {
          path = legacy;
          await persistSet(logFileKey(game), legacy);
          await persistRemove(LOG_FILE_STORAGE_KEY_LEGACY);
        }
      }
      logFilePath = path ?? '';
      logWatcherState = await loadWatcherState(game);
      logWatcherArea.current = '';
      lastAreaId = null;
    })();
  });
  let hotkeyError = $state('');
  let autoAttachInFlight = false;
  let lastAttached = false;
  let activeSettingsTab = $state<SettingsTabId>('hotkeys');
  let selectedLocale = $state<AppLocale>('en');
  let logFilePath = $state('');
  let logFileError = $state('');
  let autoDetecting = $state(false);
  let hotkeyBindings = $state<HotkeyBindings>(getDefaultHotkeyBindings());
  let hotkeyDrafts = $state<HotkeyBindings>(getDefaultHotkeyBindings());

  // "Press your hotkey" capture — which action (if any) is currently
  // listening for a keypress, and which modifiers are held so far (live
  // preview while recording, before a non-modifier key finalizes the combo).
  let recordingActionId = $state<HotkeyActionId | null>(null);
  let recordingModifiers = $state({ ctrl: false, shift: false, alt: false, meta: false });

  // Auto-hide triggers (game keybinds that hide the overlay while playing)
  let triggerConfig = $state<TriggerConfig>(getDefaultTriggerConfig());
  let triggerDraft = $state('');
  let triggerError = $state('');

  // Click-through opacity (0.1 – 0.9, default 40%)
  let ctOpacity = $state(0.4);

  // Act-Decoder widget opacity (Settings, not the widget's own chrome — see
  // widgets.ts's getWidgetOpacity/setWidgetOpacity).
  let actDecoderOpacity = $state(1);

  async function handleActDecoderOpacityChange() {
    await setWidgetOpacity('act-decoder', actDecoderOpacity);
  }

  // Apply/remove transparency whenever click-through state or opacity changes
  $effect(() => {
    document.body.style.opacity = overlayState.clickThrough ? String(ctOpacity) : '1';
  });

  // On opaque windows (Linux default) the area outside the rounded shell would
  // show the webview's white surface. Flag the document so CSS can fill that
  // backdrop dark and square the corners, giving a clean rectangular window.
  $effect(() => {
    document.documentElement.classList.toggle('ec-opaque', !overlayState.transparent);
  });

  // PoB build state
  let pobBuild = $state<PobBuild | null>(null);

  // Log watcher state
  let logWatcherState = $state<LogWatcherState | null>(null);
  let logWatcherArea = { current: '' };
  // Last PoE internal area id seen — used to only emit act-decoder-zone to
  // widget windows when the zone actually changes, not on every 2s poll.
  let lastAreaId: string | null = null;
  // Guards the one-time legacy log-file-path migration below against being
  // claimed twice by near-simultaneous effect runs.
  let legacyLogPathMigrated = false;
  let rewardsComponent = $state<{ autoMarkReward: (id: string) => void; getCollected: () => Set<string> } | null>(null);
  let pobInput = $state('');
  let pobImporting = $state(false);
  let pobError = $state('');
  let pobSuccess = $state(false);
  let buildDragOver = $state(false);

  // PoE1 PoB import (leveling guide gem rewards + passive tree). Builds can
  // be stored plural — see poe1Pob.ts's build store — so this section also
  // tracks the saved-builds list rather than just the single active one.
  let poe1Input = $state('');
  let poe1Importing = $state(false);
  let poe1Error = $state('');
  let poe1Success = $state(false);
  let poe1Builds = $state<StoredPoe1Build[]>([]);
  let poe1ActiveId = $state<string | null>(null);

  function refreshPoe1Builds() {
    poe1Builds = listPoe1Builds();
    poe1ActiveId = activePoe1BuildId();
  }

  async function handlePoe1Import() {
    if (!poe1Input.trim() || poe1Importing) return;
    poe1Importing = true;
    poe1Error = '';
    poe1Success = false;
    try {
      await importPoe1Build(poe1Input);
      poe1Success = true;
      poe1Input = '';
      refreshPoe1Builds();
      setTimeout(() => (poe1Success = false), 3000);
    } catch (e) {
      poe1Error = String(e).replace(/^Error:\s*/, '');
    } finally {
      poe1Importing = false;
    }
  }

  async function handlePoe1Clear() {
    poe1Error = '';
    await clearPoe1Build();
    refreshPoe1Builds();
  }

  async function handlePoe1SetActive(id: string) {
    poe1Error = '';
    await setActivePoe1Build(id);
    refreshPoe1Builds();
  }

  function handlePoe1Remove(id: string) {
    removePoe1Build(id);
    refreshPoe1Builds();
  }

  function poe1BuildLabel(build: StoredPoe1Build['build']): string {
    const date = new Date(build.importedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const bandit = build.bandit !== 'None' ? ` · ${build.bandit}` : '';
    return `${build.characterClass}${bandit} (${date})`;
  }

  // Build folder library — a folder of GGG `.build` files the user can pick from
  let buildFolder = $state('');
  let buildFiles = $state<BuildFileEntry[]>([]);
  let buildFilesError = $state('');
  let activeBuildPath = $state('');

  // Auto-updater
  let updateHandle = $state<Update | null>(null);
  let updateInstalling = $state(false);
  let updateProgress = $state(0);
  let updateDismissed = $state(false);
  let updateChecking = $state(false);
  let updateCheckMsg = $state('');
  // False for Linux .deb / AUR installs, where Tauri can't self-update — those
  // users get a "Get update" link to the releases page instead of an Install button.
  let updateSupported = $state(true);

  // About
  let appVersion = $state('');

  // First-run (and one-time, for anyone updating from before this existed)
  // setup wizard: forces a log file + a hotkey review before the rest of the
  // UI is reachable. Gated on a single disk-backed flag rather than
  // localStorage — same reliability tier as the game mode / log file path,
  // since a lost flag would mean re-showing this every launch.
  let showOnboarding = $state(false);
  let onboardingStep = $state<'logFile' | 'hotkeys'>('logFile');
  const ONBOARDING_COMPLETE_KEY = 'EXILECOMPASS_ONBOARDING_COMPLETE_V1';

  async function finishOnboarding() {
    await saveHotkeys();
    if (hotkeyError) return;
    showOnboarding = false;
    await persistSet(ONBOARDING_COMPLETE_KEY, '1');
  }

  function getSettingsGroupLabel(group: 'GENERAL' | 'IMPORT' | 'ABOUT') {
    if (group === 'GENERAL') return m.settings_group_general();
    if (group === 'IMPORT') return m.settings_group_import();
    return m.settings_tab_about();
  }

  function getSettingsTabLabel(tabId: SettingsTabId) {
    if (tabId === 'hotkeys') return m.settings_tab_hotkeys();
    if (tabId === 'language') return m.label_language();
    if (tabId === 'appearance') return m.settings_tab_appearance();
    if (tabId === 'logFile') return m.settings_tab_log_file();
    if (tabId === 'importBuilds') return m.settings_tab_import_builds();
    return m.settings_tab_about();
  }

  function getHotkeyDescription(actionId: HotkeyActionId) {
    if (actionId === 'toggleClickThrough') return m.hotkey_toggle_clickthrough();
    if (actionId === 'toggleHidden') return m.hotkey_toggle_hidden();
    if (actionId === 'refreshStatus') return m.hotkey_refresh_status();
    if (actionId === 'toggleCampaignTimer') return m.hotkey_toggle_campaign_timer();
    if (actionId === 'campaignCompleteNext') return m.hotkey_campaign_complete_next();
    if (actionId === 'campaignUndoLast') return m.hotkey_campaign_undo_last();
    if (actionId === 'toggleActDecoder') return m.hotkey_toggle_act_decoder();
    return m.hotkey_toggle_settings();
  }

  onMount(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    // Linux WebKitGTK can paint a blank first frame if the window is shown too
    // early. Ask Rust to reveal the window after first paint, with a timeout
    // fallback for hidden-window rAF throttling.
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      let shown = false;
      const showWindow = () => {
        if (shown) return;
        shown = true;
        invoke('window_show_main').catch(() => {});
      };
      requestAnimationFrame(() => requestAnimationFrame(showWindow));
      setTimeout(showWindow, 350);
    }

    // Load installed add-ons up front so pinned panels can appear as top-level
    // tabs without first visiting the Add-ons hub.
    void initAddonsHost();

    // Restore which game the overlay targets and sync it to Rust — before the
    // first auto-attach poll fires below where possible (Rust already defaults
    // to "poe2", matching this module's default, so a saved "poe1" choice just
    // takes effect on the next poll tick if it doesn't win the race).
    void loadGameMode();

    // Apply the saved theme before anything else paints (onMount runs before
    // the browser's first paint of this tree, so no default-theme flash).
    loadTheme();
    loadUiScale();

    hotkeyBindings = loadHotkeyBindings();
    hotkeyDrafts = { ...hotkeyBindings };
    triggerConfig = loadTriggerConfig();
    void pushTriggers();
    selectedLocale = getLocale() as AppLocale;
    pobBuild = loadStoredBuild();
    refreshPoe1Builds();
    const savedOpacity = window.localStorage.getItem(CT_OPACITY_KEY);
    if (savedOpacity) ctOpacity = parseFloat(savedOpacity);
    void getWidgetOpacity('act-decoder').then((v) => (actDecoderOpacity = v));

    getVersion().then((v) => (appVersion = v)).catch(() => {});

    // First-run setup wizard — shows once, ever, for both new installs and
    // anyone updating from before this flag existed.
    (async () => {
      const done = await persistGet(ONBOARDING_COMPLETE_KEY);
      if (!done) showOnboarding = true;
    })();

    // Log file path + watcher state: see the gameMode-reactive $effect above
    // (they're per-game, and that effect covers the initial load too).

    // Build folder library — restore the saved folder + last-loaded file, then
    // scan to populate the picker. The active build itself is restored above via
    // loadStoredBuild(); nothing here re-activates a build on startup.
    (async () => {
      buildFolder = (await persistGet(BUILD_FOLDER_KEY)) ?? '';
      activeBuildPath = (await persistGet(BUILD_ACTIVE_PATH_KEY)) ?? '';
      if (buildFolder) await refreshBuildFiles();
    })();

    void syncAllGlobalShortcuts(hotkeyBindings);

    const syncOverlayAttachment = async () => {
      if (cancelled || autoAttachInFlight) return;
      autoAttachInFlight = true;
      try {
        const status = await refreshStatus();

        // Clear any stale error each time we successfully read status.
        error = '';

        // Standalone platforms (non-Windows) can't attach to the game window;
        // the UI shows its tools directly, so there's nothing to attach/detach.
        if (status.standalone) return;

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

    // Log file polling — runs every 2 s, independent of game detection
    const syncLog = async () => {
      if (cancelled || !logFilePath || !logWatcherState) return;
      try {
        const collected = rewardsComponent?.getCollected() ?? new Set<string>();
        const { ids, scenes, areaId, areaIdEvents, state } = await pollLog(logFilePath, logWatcherState, collected, logWatcherArea, gameMode.current);
        logWatcherState = state;
        // Feed transitions to whichever game's campaign timer is active (works
        // even if the rewards/timer tab isn't mounted): PoE2 splits off
        // [SCENE] names, PoE1 off area-id act prefixes (no scene-name table).
        if (gameMode.current === 'poe1') {
          for (const e of areaIdEvents) poe1CampaignTimer.handleAreaId(e.areaId, e.timeMs);
        } else {
          for (const s of scenes) campaignTimer.handleScene(s.scene, s.timeMs);
        }
        if (rewardsComponent) for (const id of ids) rewardsComponent.autoMarkReward(id);
        // Act-Decoder widget window(s) can't share in-memory state with the
        // main window — broadcast zone changes as a Tauri event, and persist
        // the current zone too, since a widget opened *after* this fires
        // would otherwise never learn the zone until the next change (events
        // aren't replayed for late subscribers).
        if (areaId && areaId !== lastAreaId) {
          lastAreaId = areaId;
          void persistSet(ACT_DECODER_ZONE_KEY, areaId);
          void emit('ec-act-decoder-zone', { areaId });
        }
        // Leveling guide "you are here" position tracking — same-window
        // state (unlike Act-Decoder), so this can call straight into
        // levelingRoute.svelte.ts with no event/persist bridging needed.
        if (areaId && gameMode.current === 'poe1') advanceLevelingEdge(areaId);
      } catch { /* file may not exist yet */ }
    };
    const logTimer = setInterval(syncLog, 2000);

    // Check for app updates (non-blocking, silent on failure / when offline)
    isUpdateSupported().then((ok) => { if (!cancelled) updateSupported = ok; });
    checkForUpdate()
      .then((u) => { if (u && !cancelled) updateHandle = u; })
      .catch(() => {});

    // Persist window position/size (debounced) so it reopens where it was left.
    // Restore happens in Rust before the window paints; here we only save.
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    let boundsSaveTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const win = getCurrentWindow();
      const saveBounds = () => {
        if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
        boundsSaveTimer = setTimeout(async () => {
          try {
            const pos = await win.outerPosition();
            const size = await win.outerSize();
            await persistSet(
              WINDOW_BOUNDS_KEY,
              JSON.stringify({ x: pos.x, y: pos.y, width: size.width, height: size.height }),
            );
          } catch { /* best effort */ }
        }, 400);
      };
      unlistenMoved = await win.onMoved(saveBounds);
      unlistenResized = await win.onResized(saveBounds);
    })();

    // Auto-hide triggers — backend keyboard hook emits `overlay-trigger` when a
    // configured game keybind is pressed while PoE2 is focused.
    let unlistenTrigger: (() => void) | undefined;
    (async () => {
      unlistenTrigger = await listen('overlay-trigger', () => {
        if (triggerConfig.mode === 'toggle') {
          void toggleHidden();
        } else {
          void setHidden(true);
        }
      });
    })();

    // Native file drag-and-drop — drop a .build/.json file anywhere to import it
    let unlistenDrop: (() => void) | undefined;
    (async () => {
      const isBuildFile = (x: string) => /\.(build|json)$/i.test(x);
      unlistenDrop = await getCurrentWebview().onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === 'enter') {
          buildDragOver = p.paths.some(isBuildFile);
        } else if (p.type === 'leave') {
          buildDragOver = false;
        } else if (p.type === 'drop') {
          buildDragOver = false;
          const file = p.paths.find(isBuildFile);
          if (file) importDroppedFile(file);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      clearInterval(logTimer);
      unlistenDrop?.();
      unlistenTrigger?.();
      unlistenMoved?.();
      unlistenResized?.();
      if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
      for (const accel of registeredGlobals.values()) {
        unregisterGlobalShortcut(accel).catch(() => {});
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

  // ── Global shortcuts ─────────────────────────────────────────────────────────
  // These work even when the game (not the overlay) is focused.
  const GLOBAL_ACTIONS: Partial<Record<HotkeyActionId, () => void | Promise<void>>> = {
    toggleClickThrough: async () => { await toggleClickThrough(); await refreshStatus(); },
    toggleHidden: () => toggleHidden(),
    toggleCampaignTimer: () => (gameMode.current === 'poe1' ? poe1CampaignTimer : campaignTimer).toggle(),
    // Same hotkeys drive whichever guide is active: PoE2's campaign progress,
    // or PoE1's leveling progress.
    campaignCompleteNext: () => {
      if (gameMode.current === 'poe1') levelingCompleteNext();
      else campaignProgress.completeNext();
    },
    campaignUndoLast: () => {
      if (gameMode.current === 'poe1') levelingUndoLast();
      else campaignProgress.undoLast();
    },
    // Act-Decoder's bundled layout images are PoE1-only for now.
    toggleActDecoder: () => {
      if (gameMode.current === 'poe1') void toggleWidget('act-decoder');
    },
  };

  // action id → currently registered accelerator
  const registeredGlobals = new Map<HotkeyActionId, string>();

  async function syncGlobalShortcut(action: HotkeyActionId, combo: string) {
    const handler = GLOBAL_ACTIONS[action];
    if (!handler) return;

    const accelerator = toGlobalShortcutAccelerator(combo);
    const prev = registeredGlobals.get(action);

    if (prev && prev !== accelerator) {
      try { await unregisterGlobalShortcut(prev); } catch { /* ignore */ }
      registeredGlobals.delete(action);
    }
    if (!accelerator) {
      if (action === 'toggleClickThrough') {
        throw new Error(`${m.error_invalid_clickthrough_combo()} ${combo}`);
      }
      return;
    }
    if (prev === accelerator) return; // already bound as-is

    if (await isGlobalShortcutRegistered(accelerator)) {
      try { await unregisterGlobalShortcut(accelerator); } catch { /* ignore */ }
    }
    try {
      await registerGlobalShortcut(accelerator, (event) => {
        if (event.state !== 'Pressed') return;
        void handler();
      });
    } catch {
      // The accelerator can still be registered in the backend even when the
      // JS-side `isGlobalShortcutRegistered` check above returns false — e.g.
      // after a dev HMR reload that resets frontend state but not the Rust
      // plugin. That makes a fresh register throw "HotKey already registered".
      // Force-clear it and retry once.
      try { await unregisterGlobalShortcut(accelerator); } catch { /* ignore */ }
      await registerGlobalShortcut(accelerator, (event) => {
        if (event.state !== 'Pressed') return;
        void handler();
      });
    }
    registeredGlobals.set(action, accelerator);
  }

  async function syncAllGlobalShortcuts(bindings: HotkeyBindings) {
    for (const action of Object.keys(GLOBAL_ACTIONS) as HotkeyActionId[]) {
      try {
        await syncGlobalShortcut(action, bindings[action]);
      } catch (e) {
        if (action === 'toggleClickThrough') {
          hotkeyError = `${m.error_failed_register_clickthrough_hotkey()} ${String(e)}`;
        }
      }
    }
  }

  async function handleAttach() {
    error = '';
    try { await attachToGame(); } catch (e) { error = String(e); }
  }

  /**
   * Run a native dialog (file picker) with the overlay temporarily not
   * always-on-top, then restore input focus to the webview.
   *
   * The overlay window is `alwaysOnTop`, which on Windows leaves a native file
   * dialog trapped *behind* it and — once it closes — leaves the WebView without
   * input focus. Mouse clicks (e.g. the settings ✕) then silently do nothing and
   * the app looks frozen, forcing a restart. Dropping always-on-top for the
   * dialog's lifetime and refocusing afterwards keeps the window responsive.
   */
  async function withNativeDialog<T>(run: () => Promise<T>): Promise<T> {
    const win = getCurrentWindow();
    try { await win.setAlwaysOnTop(false); } catch { /* best effort */ }
    try {
      return await run();
    } finally {
      try {
        await win.setAlwaysOnTop(true);
        await win.setFocus();
      } catch { /* best effort */ }
    }
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  async function handleHotkey(event: KeyboardEvent) {
    if (recordingActionId) return; // hotkey capture below owns keydown while recording
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

  function startRecordingHotkey(actionId: HotkeyActionId) {
    hotkeyError = '';
    recordingActionId = actionId;
    recordingModifiers = { ctrl: false, shift: false, alt: false, meta: false };
  }

  function cancelRecordingHotkey() {
    recordingActionId = null;
  }

  // Bound only while recording (see the conditional <svelte:window> below) —
  // captures the pressed combo instead of the user typing it out by hand.
  function handleHotkeyCaptureKeydown(event: KeyboardEvent) {
    if (!recordingActionId) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      cancelRecordingHotkey();
      return;
    }

    recordingModifiers = {
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    };

    const combo = comboFromKeyboardEvent(event);
    if (combo) {
      updateHotkeyDraft(recordingActionId, combo);
      recordingActionId = null;
    }
  }

  // Keeps the live "Ctrl+Shift+…" preview in sync as modifiers are released
  // without a final key press yet (e.g. tapped Ctrl, let go, still deciding).
  function handleHotkeyCaptureKeyup(event: KeyboardEvent) {
    if (!recordingActionId) return;
    recordingModifiers = {
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    };
  }

  function recordingPreviewText(): string {
    const parts: string[] = [];
    if (recordingModifiers.ctrl) parts.push('Ctrl');
    if (recordingModifiers.shift) parts.push('Shift');
    if (recordingModifiers.alt) parts.push('Alt');
    if (recordingModifiers.meta) parts.push('Meta');
    return parts.length > 0 ? `${parts.join('+')}+…` : m.hotkey_press_keys();
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
    await syncAllGlobalShortcuts(next);
  }

  async function resetHotkeys() {
    const defaults = getDefaultHotkeyBindings();
    hotkeyError = '';
    hotkeyBindings = defaults;
    hotkeyDrafts = { ...defaults };
    saveHotkeyBindings(defaults);
    await syncAllGlobalShortcuts(defaults);
  }

  async function pushTriggers() {
    try {
      await invoke('set_overlay_triggers', { chords: configToChords(triggerConfig) });
    } catch { /* best effort — triggers just won't fire */ }
  }

  function addTrigger() {
    const normalized = normalizeHotkeyCombo(triggerDraft);
    if (!normalized || !comboToChord(normalized)) {
      triggerError = m.error_invalid_trigger();
      return;
    }
    if (triggerConfig.keys.includes(normalized)) {
      triggerError = `${m.error_duplicate_trigger()} ${normalized}`;
      return;
    }
    triggerError = '';
    triggerConfig = { ...triggerConfig, keys: [...triggerConfig.keys, normalized] };
    triggerDraft = '';
    saveTriggerConfig(triggerConfig);
    void pushTriggers();
  }

  function removeTrigger(combo: string) {
    triggerConfig = { ...triggerConfig, keys: triggerConfig.keys.filter((k) => k !== combo) };
    triggerError = '';
    saveTriggerConfig(triggerConfig);
    void pushTriggers();
  }

  function setTriggerMode(mode: TriggerMode) {
    triggerConfig = { ...triggerConfig, mode };
    saveTriggerConfig(triggerConfig);
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

  async function setLogFile(path: string) {
    logFilePath = path;
    await persistSet(logFileKey(gameMode.current), path);
    try {
      logWatcherState = await initWatcherForFile(path, gameMode.current);
      logWatcherArea.current = '';
      lastAreaId = null;
    } catch { /* file access error — state stays null */ }
  }

  async function autoDetectLogFile() {
    logFileError = '';
    autoDetecting = true;
    try {
      const detected = await invoke<string | null>('detect_log_file', { game: gameMode.current });
      if (detected) {
        await setLogFile(detected);
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
      const selection = await withNativeDialog(() => open({
        directory: false,
        multiple: false,
        filters: [
          { name: m.dialog_log_files(), extensions: ['log', 'txt'] },
          { name: m.dialog_all_files(), extensions: ['*'] },
        ],
      }));
      if (!selection || Array.isArray(selection)) return;
      await setLogFile(selection as string);
    } catch (e) {
      logFileError = `${m.error_failed_open_file_picker()} ${String(e)}`;
    }
  }

  function handleCtOpacityChange() {
    window.localStorage.setItem(CT_OPACITY_KEY, String(ctOpacity));
  }

  function clearLogFile() {
    logFileError = '';
    logFilePath = '';
    logWatcherState = null;
    void persistRemove(logFileKey(gameMode.current));
    void clearWatcherState(gameMode.current);
  }

  async function runBuildImport(text: string) {
    if (!text.trim()) return;
    pobImporting = true;
    pobError = '';
    pobSuccess = false;
    try {
      const build = await importBuild(text);
      saveBuild(build);
      pobBuild = build;
      pobSuccess = true;
      pobInput = '';
      setTimeout(() => (pobSuccess = false), 3000);
    } catch (e) {
      pobError = String(e).replace(/^Error:\s*/, '');
    } finally {
      pobImporting = false;
    }
  }

  function handlePobImport() {
    runBuildImport(pobInput);
  }

  async function chooseBuildFile() {
    pobError = '';
    try {
      const selection = await withNativeDialog(() => open({
        directory: false,
        multiple: false,
        filters: [
          { name: 'Build Files', extensions: ['build', 'json'] },
          { name: m.dialog_all_files(), extensions: ['*'] },
        ],
      }));
      if (!selection || Array.isArray(selection)) return;
      const text = await invoke<string>('read_text_file', { path: selection });
      await runBuildImport(text);
    } catch (e) {
      pobError = String(e).replace(/^Error:\s*/, '');
    }
  }

  /** Read a dropped build file and import it. */
  async function importDroppedFile(path: string) {
    try {
      const text = await invoke<string>('read_text_file', { path });
      await runBuildImport(text);
      if (pobBuild) mainView = 'build';
    } catch (e) {
      pobError = String(e).replace(/^Error:\s*/, '');
    } finally {
      // A native OS drag-drop can leave the WebView without input focus; restore
      // it so clicks keep registering after the import.
      try { await getCurrentWindow().setFocus(); } catch { /* best effort */ }
    }
  }

  function handlePobClear() {
    clearStoredBuild();
    pobBuild = null;
    pobError = '';
  }

  // ── Build folder library ──────────────────────────────────────────────────
  async function refreshBuildFiles() {
    if (!buildFolder) { buildFiles = []; return; }
    buildFilesError = '';
    try {
      buildFiles = await listBuildFiles(buildFolder);
    } catch (e) {
      buildFiles = [];
      buildFilesError = `${m.error_build_folder_read()} ${String(e)}`;
    }
  }

  async function chooseBuildFolder() {
    buildFilesError = '';
    try {
      const selection = await withNativeDialog(() => open({ directory: true, multiple: false }));
      if (!selection || Array.isArray(selection)) return;
      buildFolder = selection as string;
      await persistSet(BUILD_FOLDER_KEY, buildFolder);
      await refreshBuildFiles();
    } catch (e) {
      buildFilesError = `${m.error_failed_open_file_picker()} ${String(e)}`;
    }
  }

  async function autoDetectBuildFolder() {
    buildFilesError = '';
    try {
      const detected = await detectBuildFolder();
      if (detected) {
        buildFolder = detected;
        await persistSet(BUILD_FOLDER_KEY, buildFolder);
        await refreshBuildFiles();
      } else {
        buildFilesError = m.error_build_folder_not_found();
      }
    } catch (e) {
      buildFilesError = String(e);
    }
  }

  function clearBuildFolder() {
    buildFolder = '';
    buildFiles = [];
    buildFilesError = '';
    void persistRemove(BUILD_FOLDER_KEY);
  }

  /** Load a `.build` file chosen from the folder picker as the active build. */
  async function loadBuildFromFolder(path: string) {
    try {
      const text = await invoke<string>('read_text_file', { path });
      await runBuildImport(text);
      if (pobBuild) {
        activeBuildPath = path;
        await persistSet(BUILD_ACTIVE_PATH_KEY, path);
        mainView = 'build';
      }
    } catch (e) {
      pobError = String(e).replace(/^Error:\s*/, '');
    }
  }

  async function checkUpdatesManually() {
    if (updateChecking) return;
    updateChecking = true;
    updateCheckMsg = '';
    try {
      const u = await checkForUpdate();
      if (u) {
        updateHandle = u;
        updateDismissed = false;
        updateCheckMsg = m.update_available({ version: u.version });
      } else {
        updateCheckMsg = m.update_up_to_date();
      }
    } catch (e) {
      updateCheckMsg = String(e).replace(/^Error:\s*/, '');
    } finally {
      updateChecking = false;
    }
  }

  async function openKofi() {
    try { await openUrl(KOFI_URL); } catch { /* ignore */ }
  }

  async function openReleases() {
    try { await openUrl(RELEASES_URL); } catch { /* ignore */ }
  }

  async function handleInstallUpdate() {
    if (!updateHandle || updateInstalling) return;
    updateInstalling = true;
    updateProgress = 0;
    try {
      await installUpdate(updateHandle, (pct) => (updateProgress = pct));
      // App relaunches on success; nothing else to do
    } catch (e) {
      error = `${m.error_update_failed()} ${String(e)}`;
      updateInstalling = false;
    }
  }
</script>

<svelte:window
  onkeydown={(e) => (recordingActionId ? handleHotkeyCaptureKeydown(e) : handleHotkey(e))}
  onkeyup={handleHotkeyCaptureKeyup}
/>

<div class="app-shell">
  <div class="ec-grain"></div>

  <!-- Title bar sits above the frame -->
  <TitleBar title={m.app_title()} />

  {#if updateHandle && !updateDismissed}
    <div class="update-banner">
      {#if updateInstalling}
        <span class="update-text">{m.update_installing()} {updateProgress}%</span>
        <div class="update-progress"><div class="update-progress-fill" style="width:{updateProgress}%"></div></div>
      {:else}
        <span class="update-text">{m.update_available({ version: updateHandle.version })}</span>
        {#if updateSupported}
          <button class="update-btn" onclick={handleInstallUpdate}>{m.update_install()}</button>
        {:else}
          <button class="update-btn" onclick={openReleases}>{m.update_get()}</button>
        {/if}
        <button class="update-dismiss" onclick={() => (updateDismissed = true)} aria-label={m.update_later()}>✕</button>
      {/if}
    </div>
  {/if}

  <!-- Frame wraps only the content area below the title bar -->
  <PoeFrame>
  <main class="content">
    {#if showOnboarding}
      <!-- First-run setup wizard: log file, then a hotkey review. No close/back
           button out of this branch — completing (or being unable to complete)
           the wizard is the only way out, by design. -->
      <div class="settings-overlay onboarding-overlay">
        <div class="settings-header-row">
          <span class="settings-title">{m.onboarding_title()}</span>
          <span class="onboarding-step-label">
            {m.onboarding_step_label({ step: onboardingStep === 'logFile' ? '1' : '2' })}
          </span>
        </div>
        <div class="settings-content onboarding-content">
          {#if onboardingStep === 'logFile'}
            <div class="settings-section-title">{m.onboarding_logfile_title()}</div>
            <p class="field-help">{m.onboarding_logfile_help()}</p>
            <label class="field-label" for="onboarding-log-file-path">
              {m.settings_log_file_label({ gameName: gameMode.current === 'poe1' ? 'Path of Exile' : 'Path of Exile 2' })}
            </label>
            <input id="onboarding-log-file-path" class="field-input" value={logFilePath} readonly placeholder={m.settings_log_file_placeholder()} />
            <div class="settings-actions">
              <button class="btn btn-primary" type="button" onclick={autoDetectLogFile} disabled={autoDetecting}>
                {autoDetecting ? '...' : m.action_auto_detect()}
              </button>
              <button class="btn btn-ghost" type="button" onclick={chooseLogFile}>{m.action_browse()}</button>
              {#if logFilePath}
                <button class="btn btn-ghost" type="button" onclick={clearLogFile}>{m.action_clear()}</button>
              {/if}
            </div>
            {#if logFileError}
              <p class="inline-error">{logFileError}</p>
            {/if}
            <div class="settings-actions onboarding-nav">
              <button
                class="btn btn-primary"
                type="button"
                disabled={!logFilePath}
                onclick={() => (onboardingStep = 'hotkeys')}
              >{m.action_next()}</button>
            </div>
          {:else}
            <div class="settings-section-title">{m.onboarding_hotkeys_title()}</div>
            <p class="field-help">{m.onboarding_hotkeys_help()}</p>
            <ul class="hotkey-list">
              {#each HOTKEY_ACTIONS as hotkey (hotkey.id)}
                {@const recording = recordingActionId === hotkey.id}
                <li class="hotkey-row">
                  <button
                    type="button"
                    class="hotkey-input hotkey-capture-btn"
                    class:recording
                    onclick={() => startRecordingHotkey(hotkey.id)}
                    onblur={() => { if (recording) cancelRecordingHotkey(); }}
                    aria-label={`${m.aria_hotkey_for()} ${getHotkeyDescription(hotkey.id)}`}
                  >{recording ? recordingPreviewText() : hotkeyDrafts[hotkey.id]}</button>
                  <span class="hotkey-desc">{getHotkeyDescription(hotkey.id)}</span>
                </li>
              {/each}
            </ul>
            {#if hotkeyError}
              <p class="inline-error">{hotkeyError}</p>
            {/if}
            <div class="settings-actions onboarding-nav">
              <button class="btn btn-ghost" type="button" onclick={() => (onboardingStep = 'logFile')}>{m.action_back()}</button>
              <button class="btn btn-primary" type="button" onclick={finishOnboarding}>{m.onboarding_finish()}</button>
            </div>
          {/if}
        </div>
      </div>
    {:else if showSettings}
      <!-- Settings panel as overlay -->
      <div class="settings-overlay">
        <div class="settings-header-row">
          <button class="back-settings" onclick={() => (showSettings = false)} aria-label={m.settings_close()}>
            <span class="back-arrow" aria-hidden="true">←</span>{m.action_back()}
          </button>
          <span class="settings-title">{m.settings_title()}</span>
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
              <p class="field-help">{m.hotkey_capture_hint()}</p>
              <ul class="hotkey-list">
                {#each HOTKEY_ACTIONS as hotkey (hotkey.id)}
                  {@const recording = recordingActionId === hotkey.id}
                  <li class="hotkey-row">
                    <button
                      type="button"
                      class="hotkey-input hotkey-capture-btn"
                      class:recording
                      onclick={() => startRecordingHotkey(hotkey.id)}
                      onblur={() => { if (recording) cancelRecordingHotkey(); }}
                      aria-label={`${m.aria_hotkey_for()} ${getHotkeyDescription(hotkey.id)}`}
                    >{recording ? recordingPreviewText() : hotkeyDrafts[hotkey.id]}</button>
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

              <!-- Click-through opacity -->
              <div class="ct-opacity-section">
                <div class="settings-section-title" style="margin-top:4px">{m.settings_clickthrough_opacity_title()}</div>
                <div class="ct-slider-row">
                  <input
                    type="range"
                    class="ct-slider"
                    min="0.05"
                    max="0.90"
                    step="0.05"
                    bind:value={ctOpacity}
                    oninput={handleCtOpacityChange}
                    style="--pct:{Math.round((ctOpacity - 0.05) / 0.85 * 100)}"
                    aria-label="Click-through opacity"
                  />
                  <span class="ct-slider-val">{Math.round(ctOpacity * 100)}%</span>
                </div>
                <p class="field-help">{m.settings_clickthrough_opacity_help()}</p>
              </div>

              <!-- Auto-hide triggers -->
              <div class="trigger-section">
                <div class="settings-section-title" style="margin-top:4px">{m.settings_triggers_title()}</div>

                {#if triggerConfig.keys.length === 0}
                  <p class="field-help">{m.settings_triggers_empty()}</p>
                {:else}
                  <ul class="trigger-list">
                    {#each triggerConfig.keys as key (key)}
                      <li class="trigger-chip">
                        <span class="trigger-chip-key">{key}</span>
                        <button
                          class="trigger-chip-remove"
                          type="button"
                          onclick={() => removeTrigger(key)}
                          aria-label={`${m.trigger_remove_label()} ${key}`}
                        >✕</button>
                      </li>
                    {/each}
                  </ul>
                {/if}

                <div class="trigger-add-row">
                  <input
                    class="hotkey-input trigger-add-input"
                    bind:value={triggerDraft}
                    placeholder={m.trigger_add_placeholder()}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTrigger(); } }}
                    aria-label={m.action_add_trigger()}
                  />
                  <button class="btn btn-primary" type="button" onclick={addTrigger}>{m.action_add_trigger()}</button>
                </div>
                {#if triggerError}
                  <p class="inline-error">{triggerError}</p>
                {/if}

                <label class="field-label" for="trigger-mode-select" style="margin-top:4px">{m.trigger_mode_label()}</label>
                <select
                  id="trigger-mode-select"
                  class="field-select"
                  value={triggerConfig.mode}
                  onchange={(e) => setTriggerMode((e.currentTarget as HTMLSelectElement).value as TriggerMode)}
                >
                  <option value="hideOnly">{m.trigger_mode_hide_only()}</option>
                  <option value="toggle">{m.trigger_mode_toggle()}</option>
                </select>

                <p class="field-help">{m.settings_triggers_help()}</p>
              </div>

            {:else if activeSettingsTab === 'language'}
              <div class="settings-section-title">{m.label_language()}</div>
              <label class="field-label" for="language-select">{m.label_language()}</label>
              <select id="language-select" class="field-select" bind:value={selectedLocale} onchange={handleLocaleChange}>
                {#each locales as locale (locale)}
                  <option value={locale}>{getLocaleLabel(locale as AppLocale)}</option>
                {/each}
              </select>
              <p class="field-help">{m.settings_language_help()}</p>

            {:else if activeSettingsTab === 'appearance'}
              <div class="settings-section-title">{m.settings_tab_appearance()}</div>
              <div class="theme-list">
                {#each THEMES as t (t.id)}
                  <button
                    class="theme-option"
                    class:active={theme.current === t.id}
                    onclick={() => setTheme(t.id)}
                    type="button"
                  >
                    <span class="theme-swatches">
                      {#each t.swatches as c (c)}
                        <span class="swatch" style="background:{c}"></span>
                      {/each}
                    </span>
                    <span class="theme-name">{t.label}</span>
                  </button>
                {/each}
              </div>
              <p class="field-help">{m.settings_theme_help()}</p>

              <div class="ct-opacity-section">
                <div class="settings-section-title" style="margin-top:4px">{m.settings_font_size_title()}</div>
                <div class="ct-slider-row">
                  <input
                    type="range"
                    class="ct-slider"
                    min={UI_SCALE_MIN}
                    max={UI_SCALE_MAX}
                    step={UI_SCALE_STEP}
                    value={uiScale.current}
                    oninput={(e) => setUiScale(parseFloat((e.currentTarget as HTMLInputElement).value))}
                    style="--pct:{Math.round((uiScale.current - UI_SCALE_MIN) / (UI_SCALE_MAX - UI_SCALE_MIN) * 100)}"
                    aria-label={m.settings_font_size_title()}
                  />
                  <span class="ct-slider-val">{Math.round(uiScale.current * 100)}%</span>
                </div>
                <p class="field-help">{m.settings_font_size_help()}</p>
              </div>

              {#if gameMode.current === 'poe1'}
                <div class="ct-opacity-section">
                  <div class="settings-section-title" style="margin-top:4px">{m.settings_act_decoder_opacity_title()}</div>
                  <div class="ct-slider-row">
                    <input
                      type="range"
                      class="ct-slider"
                      min="0.3"
                      max="1"
                      step="0.05"
                      bind:value={actDecoderOpacity}
                      oninput={handleActDecoderOpacityChange}
                      style="--pct:{Math.round((actDecoderOpacity - 0.3) / 0.7 * 100)}"
                      aria-label={m.settings_act_decoder_opacity_title()}
                    />
                    <span class="ct-slider-val">{Math.round(actDecoderOpacity * 100)}%</span>
                  </div>
                  <p class="field-help">{m.settings_act_decoder_opacity_help()}</p>
                </div>
              {/if}

            {:else if activeSettingsTab === 'logFile'}
              <div class="settings-section-title">{m.settings_log_file_title()}</div>
              <label class="field-label" for="log-file-path">
                {m.settings_log_file_label({ gameName: gameMode.current === 'poe1' ? 'Path of Exile' : 'Path of Exile 2' })}
              </label>
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
              {#if logWatcherState}
                <div class="log-watcher-status">
                  <span class="lws-dot"></span>
                  <span>{m.log_watching()}</span>
                </div>
              {/if}
              <p class="field-help">{m.settings_log_file_help()}</p>
              {#if logFileError}
                <p class="inline-error">{logFileError}</p>
              {/if}

            {:else if activeSettingsTab === 'importBuilds' && gameMode.current === 'poe1'}
              <!-- PoE1: PoB import feeds the leveling guide (gem rewards) and
                   the passive tree. No GGG .build folder (PoE1 has none). -->
              <div class="settings-section-title">{m.settings_import_builds_title()}</div>
              <label class="field-label" for="poe1-pob-input">{m.settings_import_label()}</label>
              <textarea
                id="poe1-pob-input"
                class="field-input pob-textarea"
                bind:value={poe1Input}
                placeholder={m.settings_import_placeholder()}
                rows="4"
                spellcheck="false"
              ></textarea>
              <div class="settings-actions">
                <button
                  class="btn btn-primary"
                  onclick={handlePoe1Import}
                  disabled={!poe1Input.trim() || poe1Importing}
                >
                  {poe1Importing ? m.action_importing() : poe1Success ? `✓ ${m.action_imported()}` : m.action_import_build()}
                </button>
                {#if levelingRoute.build}
                  <button class="btn btn-ghost" onclick={handlePoe1Clear}>{m.action_clear()}</button>
                {/if}
              </div>
              {#if poe1Error}
                <p class="inline-error">{poe1Error}</p>
              {/if}
              <p class="field-help">{m.settings_import_poe1_help()}</p>

              <div class="settings-section-title" style="margin-top:10px">{m.settings_saved_builds_title()}</div>
              {#if poe1Builds.length === 0}
                <p class="field-help">{m.settings_saved_builds_empty()}</p>
              {:else}
                <div class="saved-builds-list">
                  {#each poe1Builds as sb (sb.id)}
                    <div class="pob-current saved-build-row" class:active={sb.id === poe1ActiveId}>
                      <span class="pob-current-name">
                        {poe1BuildLabel(sb.build)} · {sb.build.requiredGems.length} gems
                      </span>
                      {#if sb.id === poe1ActiveId}
                        <span class="badge badge-ok">{m.label_active()}</span>
                      {:else}
                        <button class="btn btn-ghost" onclick={() => handlePoe1SetActive(sb.id)}>{m.action_set_active()}</button>
                      {/if}
                      <ConfirmReset
                        label={m.action_remove()}
                        prompt={m.confirm_remove_build()}
                        onconfirm={() => handlePoe1Remove(sb.id)}
                      />
                    </div>
                  {/each}
                </div>
              {/if}

            {:else if activeSettingsTab === 'importBuilds'}
              <div class="settings-section-title">{m.settings_build_folder_title()}</div>
              <p class="field-help">
                {m.label_build_folder()}
                <span class="folder-path">{buildFolder || m.label_build_folder_none()}</span>
              </p>
              <div class="settings-actions">
                <button class="btn btn-primary" onclick={autoDetectBuildFolder}>{m.action_autodetect_folder()}</button>
                <button class="btn btn-ghost" onclick={chooseBuildFolder}>{m.action_choose_folder()}</button>
                {#if buildFolder}
                  <button class="btn btn-ghost" onclick={clearBuildFolder}>{m.action_clear()}</button>
                {/if}
              </div>
              {#if buildFolder}
                <p class="field-help">{m.label_builds_found({ count: buildFiles.length })}</p>
              {/if}
              {#if buildFilesError}
                <p class="inline-error">{buildFilesError}</p>
              {/if}
              <p class="field-help">{m.settings_build_folder_help()}</p>

              <div class="settings-section-title" style="margin-top:8px">{m.settings_import_builds_title()}</div>
              <label class="field-label" for="pob-input">{m.settings_import_label()}</label>
              <textarea
                id="pob-input"
                class="field-input pob-textarea"
                bind:value={pobInput}
                placeholder={m.settings_import_placeholder()}
                rows="4"
                spellcheck="false"
              ></textarea>
              <div class="settings-actions">
                <button
                  class="btn btn-primary"
                  onclick={handlePobImport}
                  disabled={!pobInput.trim() || pobImporting}
                >
                  {pobImporting ? m.action_importing() : pobSuccess ? `✓ ${m.action_imported()}` : m.action_import_build()}
                </button>
                <button class="btn btn-ghost" onclick={chooseBuildFile} disabled={pobImporting}>
                  {m.action_browse_build()}
                </button>
                {#if pobBuild}
                  <button class="btn btn-ghost" onclick={handlePobClear}>{m.action_clear()}</button>
                {/if}
              </div>
              {#if pobError}
                <p class="inline-error">{pobError}</p>
              {/if}
              {#if pobBuild}
                <div class="pob-current">
                  <span class="pob-current-label">{m.label_imported()}</span>
                  <span class="pob-current-name">
                    {pobBuild.buildName || pobBuild.ascendClassName || pobBuild.className}{pobBuild.level > 0 ? ` · ${m.build_level_prefix()} ${pobBuild.level}` : ''}
                  </span>
                  <span class="pob-current-links">{pobBuild.source === 'ggg' ? 'GGG' : 'PoB'}</span>
                </div>
              {/if}
              <p class="field-help">{m.settings_import_help()}</p>

            {:else if activeSettingsTab === 'about'}
              <div class="settings-section-title">{m.settings_tab_about()}</div>
              <div class="about-layout">
                <section class="about-hero">
                  <div class="about-eyebrow">Overlay Companion</div>
                  <div class="about-title-row">
                    <span class="about-name">ExileCompass</span>
                    <span class="badge badge-neutral">{m.about_version()} {appVersion || '—'}</span>
                  </div>
                </section>

                <section class="about-panel">
                  <div class="about-panel-title">Updates</div>
                  <div class="settings-actions about-actions">
                    <button class="btn btn-primary" onclick={checkUpdatesManually} disabled={updateChecking}>
                      {updateChecking ? m.update_checking() : m.action_check_updates()}
                    </button>
                    {#if updateHandle && updateSupported}
                      <button class="btn btn-ghost" onclick={handleInstallUpdate} disabled={updateInstalling}>
                        {updateInstalling ? `${m.update_installing()} ${updateProgress}%` : m.update_install()}
                      </button>
                    {:else if updateHandle}
                      <button class="btn btn-ghost" onclick={openReleases}>{m.update_get()}</button>
                    {/if}
                  </div>
                  {#if updateCheckMsg}
                    <p class="about-status">{updateCheckMsg}</p>
                  {/if}
                  {#if !updateSupported}
                    <p class="about-status">{m.update_manual()}</p>
                  {/if}
                </section>

                <section class="about-panel">
                  <div class="about-panel-title">{m.about_support_title()}</div>
                  <p class="field-help">{m.about_support_text()}</p>
                  <div class="settings-actions about-actions">
                    <button class="btn btn-kofi" onclick={openKofi}>{m.about_kofi()}</button>
                  </div>
                </section>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {:else if !overlayState.gameRunning && !overlayState.standalone}
      <!-- Waiting for the active game (Windows only — standalone platforms skip this) -->
      <div class="waiting-screen">
        <div class="waiting-spinner" aria-hidden="true"></div>
        <p class="waiting-title">
          {m.waiting_title({ game: gameMode.current === 'poe1' ? 'Path of Exile' : 'Path of Exile 2' })}
        </p>
        <p class="waiting-sub">{m.waiting_sub()}</p>
        <button class="btn btn-ghost" onclick={() => (showSettings = true)}>{m.action_settings()}</button>
        {#if error}
          <p class="error-bar" style="margin-top:12px">{error}</p>
        {/if}
      </div>
    {:else}
      <!-- Main content (game is running) -->
      <div class="view-wrapper">
        <!-- Tab nav -->
        <div class="view-tabs">
          {#if visibleTabs.includes('campaign')}
            <button
              class="view-tab"
              class:active={mainView === 'campaign'}
              onclick={() => (mainView = 'campaign')}
              type="button"
            >{m.nav_campaign()}</button>
          {/if}
          {#if visibleTabs.includes('leveling')}
            <button
              class="view-tab"
              class:active={mainView === 'leveling'}
              onclick={() => (mainView = 'leveling')}
              type="button"
            >{m.nav_leveling()}</button>
          {/if}
          {#if visibleTabs.includes('gems')}
            <button
              class="view-tab"
              class:active={mainView === 'gems'}
              onclick={() => (mainView = 'gems')}
              type="button"
            >{m.nav_gems()}</button>
          {/if}
          {#if visibleTabs.includes('tree')}
            <button
              class="view-tab"
              class:active={mainView === 'tree'}
              onclick={() => (mainView = 'tree')}
              type="button"
            >{m.nav_tree()}</button>
          {/if}
          {#if visibleTabs.includes('rewards')}
            <button
              class="view-tab"
              class:active={mainView === 'rewards'}
              onclick={() => (mainView = 'rewards')}
              type="button"
            >{m.nav_rewards()}</button>
          {/if}
          {#if visibleTabs.includes('stash')}
            <button
              class="view-tab"
              class:active={mainView === 'stash'}
              onclick={() => (mainView = 'stash')}
              type="button"
            >{m.nav_stash()}</button>
          {/if}
          {#if visibleTabs.includes('crafting')}
            <button
              class="view-tab"
              class:active={mainView === 'crafting'}
              onclick={() => (mainView = 'crafting')}
              type="button"
            >{m.nav_crafting()}</button>
          {/if}
          {#if visibleTabs.includes('build')}
          <button
            class="view-tab view-tab-icon"
            class:active={mainView === 'build'}
            onclick={() => (mainView = 'build')}
            title={m.nav_build()}
            aria-label={m.nav_build()}
            type="button"
          >
            <svg viewBox="0 0 64 64" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M61.287 53.542c-2.649-2.041-9.702-7.678-16.271-14.452c-4.366-4.505-6.223-9.015-9.533-12.429c-2.998-3.092-5.725-4.894-5.725-4.894l-.768.792l-5.188-5.35l2.004-2.067a.912.912 0 0 0 0-1.262l-.414-.427c.002-.002 5.898-7.936 13.353-5.742c.866.257 1.638.694 1.857.471c.298-.306-.837-1.482-1.502-2.162c-9.431-9.65-19.834 1.104-19.839 1.109l-.367-.379a.846.846 0 0 0-1.222 0l-9.239 9.528a.912.912 0 0 0 0 1.262s1.131 1.979-1.835 2.335c-1.194.145-1.942.414-2.366.769a431.18 431.18 0 0 0-1.979 2.009a.912.912 0 0 0 0 1.262l6.914 7.132a.847.847 0 0 0 1.223 0s1.906-1.99 1.947-2.042c.343-.438.605-1.208.743-2.44c.348-3.06 2.264-1.892 2.264-1.892a.846.846 0 0 0 1.224 0l2.004-2.067l5.186 5.349l-.768.793s1.748 2.813 4.746 5.905c3.309 3.413 7.683 5.328 12.05 9.833c6.567 6.774 12.032 14.047 14.014 16.78c.748 1.029.867.934 1.78-.009l2.849-2.938l2.847-2.937c.915-.946 1.009-1.068.011-1.84" />
              <path d="M34.008 22.689a53.27 53.27 0 0 1 2.497 2.408c1.592 1.642 2.924 3.479 4.259 5.44l8.942-8.943A9.938 9.938 0 0 0 61.72 9.584L53.604 17.7l-5.76-1.543l-1.544-5.763l8.114-8.111a9.92 9.92 0 0 0-9.381 2.63a9.932 9.932 0 0 0-2.631 9.38l-8.394 8.396" />
              <path d="M26.489 35.429a53.723 53.723 0 0 1-2.479-2.743l-9.717 9.718a9.926 9.926 0 0 0-9.381 2.629c-3.883 3.88-3.882 10.174 0 14.055a9.934 9.934 0 0 0 14.054 0a9.939 9.939 0 0 0 2.631-9.384l10.004-10.003c-1.84-1.338-3.567-2.679-5.112-4.272M13.483 57.821l-5.761-1.544l-1.543-5.762l4.218-4.215l5.76 1.541l1.543 5.763l-4.217 4.217" />
            </svg>
          </button>
          {/if}
          {#if visibleTabs.includes('timer')}
          <button
            class="view-tab view-tab-icon"
            class:active={mainView === 'timer'}
            onclick={() => (mainView = 'timer')}
            title={m.nav_timer()}
            aria-label={m.nav_timer()}
            type="button"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15.5 14" />
            </svg>
          </button>
          {/if}
          <button
            class="view-tab view-tab-icon"
            class:active={mainView === 'addons'}
            onclick={() => (mainView = 'addons')}
            title={ADDONS_LABEL}
            aria-label={ADDONS_LABEL}
            type="button"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 22v-5" />
              <path d="M9 8V2" />
              <path d="M15 8V2" />
              <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
            </svg>
          </button>
          <button
            class="tab-options-btn"
            class:active={showSettings}
            onclick={() => (showSettings = !showSettings)}
            title={m.tooltip_settings_hotkeys()}
            aria-label={m.tooltip_settings_hotkeys()}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        <!-- Pinned add-on sub-nav (kept separate so it never squeezes core tabs) -->
        {#if pinnedAddons.length > 0}
          <div class="addon-subnav">
            <span class="addon-subnav-label" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" />
                <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
              </svg>
            </span>
            {#each pinnedAddons as addon (addon.id)}
              <button
                class="addon-subtab"
                class:active={mainView === `addon:${addon.id}`}
                onclick={() => (mainView = `addon:${addon.id}`)}
                title={addon.panelTitle ?? addon.name}
                type="button"
              >{addon.panelTitle ?? addon.name}</button>
            {/each}
          </div>
        {/if}

        <!-- Tab content -->
        <div
          class="view-content"
          class:hide-scrollbar={mainView === 'campaign' || mainView === 'rewards' || mainView === 'crafting' || mainView === 'leveling'}
        >
          {#if mainView === 'campaign'}
            <CampaignGuide />
          {:else if mainView === 'leveling'}
            <PoE1LevelingGuide />
          {:else if mainView === 'tree'}
            <PassiveTreeViewer />
          {:else if mainView === 'gems'}
            <GemLinksViewer />
          {:else if mainView === 'rewards'}
            <PermanentRewards bind:this={rewardsComponent} />
          {:else if mainView === 'stash'}
            {#if gameMode.current === 'poe1'}
              <PoE1Regex />
            {:else}
              <StashRegex />
            {/if}
          {:else if mainView === 'crafting'}
            <CraftingGuide />
          {:else if mainView === 'timer'}
            <SpeedrunTimer />
          {:else if mainView === 'addons'}
            <AddonsHub />
          {:else if mainView.startsWith('addon:')}
            <AddonsPanel addon={activeAddon} showHeader={false} />
          {:else}
            <!-- An error boundary keeps a malformed imported build from throwing
                 during render and locking the whole overlay (no clicks register).
                 On failure we drop the bad build and offer a clean reset. -->
            <svelte:boundary>
              <BuildOverview
                build={pobBuild}
                buildFiles={buildFiles}
                activeBuildPath={activeBuildPath}
                onLoadBuild={loadBuildFromFolder}
                onRefreshBuilds={refreshBuildFiles}
                onClear={handlePobClear}
                onOpenImport={() => { showSettings = true; activeSettingsTab = 'importBuilds'; }}
                onOpenStash={() => { mainView = 'stash'; }}
                onSkillSetChange={(idx) => {
                  if (!pobBuild) return;
                  pobBuild = { ...pobBuild, activeSkillSet: idx };
                  saveBuild(pobBuild);
                }}
                onItemSetChange={(idx) => {
                  if (!pobBuild) return;
                  pobBuild = { ...pobBuild, activeItemSet: idx };
                  saveBuild(pobBuild);
                }}
              />
              {#snippet failed(_error, reset)}
                <div class="build-error">
                  <p class="build-error-msg">{m.build_render_error()}</p>
                  <button class="btn btn-ghost" onclick={() => { handlePobClear(); reset(); }}>
                    {m.action_clear()}
                  </button>
                </div>
              {/snippet}
            </svelte:boundary>
          {/if}
        </div>

        {#if error}
          <p class="error-bar">{error}</p>
        {/if}
      </div>
    {/if}
  </main>
  </PoeFrame>

  <!-- Slim footer: app version + which game the overlay targets -->
  <footer class="app-footer">
    <span class="app-version">{appVersion ? `v${appVersion}` : ''}</span>
    <div class="game-switch" role="group" aria-label={m.game_switch_label()}>
      <button
        type="button"
        class="game-switch-btn"
        class:active={gameMode.current === 'poe2'}
        onclick={() => setGameMode('poe2')}
      >{m.game_switch_poe2()}</button>
      <button
        type="button"
        class="game-switch-btn"
        class:active={gameMode.current === 'poe1'}
        onclick={() => setGameMode('poe1')}
      >{m.game_switch_poe1()}</button>
    </div>
  </footer>

  {#if buildDragOver}
    <div class="build-drop-overlay">
      <div class="build-drop-box">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
        <span>{m.build_drop()}</span>
      </div>
    </div>
  {/if}
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

  /* Opaque window (Linux default): the window isn't see-through, so fill the
     backdrop with the shell colour instead of leaving the white webview surface
     showing in the corners. */
  :global(html.ec-opaque),
  :global(html.ec-opaque body) {
    background: var(--c-bg);
  }

  :global(body) {
    /* Inter for running/body text (best legibility at these small sizes);
       Satoshi carries headings, labels, tabs, and buttons. */
    font-family: 'Inter', 'Segoe UI', sans-serif;
    font-size: 13px;
    color: var(--c-primary);
  }

  :global(::-webkit-scrollbar) { width: 5px; height: 5px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background: color-mix(in srgb, var(--c-accent) 38%, transparent);
    border-radius: var(--radius);
  }
  :global(::-webkit-scrollbar-thumb:hover) {
    background: color-mix(in srgb, var(--c-accent) 60%, transparent);
  }
  :global(*) {
    scrollbar-color: color-mix(in srgb, var(--c-accent) 38%, transparent) transparent;
    scrollbar-width: thin;
  }

  /* ── App shell ───────────────────────────────────────────────── */
  .app-shell {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;

    background: var(--c-bg);

    border-radius: 0;
    overflow: hidden;

    padding: 0;
  }

  /* Settings/gear button — sits at the right end of the tab row */
  .tab-options-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 26px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--c-accent);
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.12s, color 0.12s, border-color 0.12s;
    flex-shrink: 0;
    margin-left: 2px;
  }
  .tab-options-btn:hover {
    color: var(--c-red-bright);
    opacity: 1;
  }
  .tab-options-btn.active {
    color: var(--c-red-bright);
    border-color: color-mix(in srgb, var(--c-red) 45%, transparent);
    opacity: 1;
  }

  /* Slim footer bar — version on the left, game switch on the right. Sits
     below the frame, always visible (so the switch stays reachable from the
     "waiting for game" screen too). */
  .app-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 26px;
    padding: 0 10px 0 18px; /* left edge aligns with the content/tab padding */
    background: var(--c-mid);
    border-top: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent);
    flex-shrink: 0;
  }

  .app-version {
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 0.05em;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    user-select: none;
  }

  .game-switch {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 1px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    background: color-mix(in srgb, var(--c-bg) 60%, transparent);
  }

  .game-switch-btn {
    padding: 2px 8px;
    border: none;
    background: transparent;
    color: var(--c-accent);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .game-switch-btn:hover {
    color: var(--c-primary);
  }

  .game-switch-btn.active {
    background: var(--c-red);
    color: var(--c-on-accent);
  }

  /* Theme picker (Settings → Appearance) */
  .theme-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 280px;
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    background: color-mix(in srgb, var(--c-mid) 80%, transparent);
    border: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    color: var(--c-accent);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s, background 0.12s;
  }

  .theme-option:hover {
    border-color: var(--c-red);
    color: var(--c-primary);
  }

  .theme-option.active {
    border-color: var(--c-red);
    color: var(--c-primary);
    background: color-mix(in srgb, var(--c-red) 10%, transparent);
  }

  .theme-swatches {
    display: inline-flex;
    gap: 3px;
    flex-shrink: 0;
  }

  .swatch {
    width: 12px;
    height: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .theme-name {
    flex: 1;
    text-align: left;
  }

  /* ── Main content area ───────────────────────────────────────── */
  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* clears the 16px frame edges on all four sides (frame now wraps content) */
    padding: 18px 18px 20px 18px;
  }

  /* ── Settings overlay ────────────────────────────────────────── */
  .settings-overlay {
    display: flex;
    flex-direction: column;
    height: 100%;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
    overflow: hidden;
  }

  .settings-header-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 14px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    flex-shrink: 0;
  }

  .settings-title {
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c-primary);
    text-shadow: 0 0 10px color-mix(in srgb, var(--c-primary) 35%, transparent);
  }

  .back-settings {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 1px;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.12s;
    flex-shrink: 0;
  }
  .back-settings:hover {
    color: var(--c-primary);
  }
  .back-arrow {
    font-size: 13px;
    line-height: 1;
  }

  .settings-body {
    display: grid;
    grid-template-columns: 138px 1fr;
    flex: 1;
    overflow: hidden;
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 0 12px 8px;
    border-right: 1px solid color-mix(in srgb, var(--c-accent) 14%, transparent);
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .settings-nav::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .settings-nav-group {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .settings-group-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-accent) 48%, transparent);
    padding: 0 6px;
    margin-bottom: 4px;
  }

  .settings-nav-btn {
    padding: 5px 7px;
    border: none;
    border-left: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: color-mix(in srgb, var(--c-accent) 74%, #fff 26%);
    font: inherit;
    font-size: 10px;
    line-height: 1.25;
    letter-spacing: 0.02em;
    text-align: left;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }

  .settings-nav-btn:hover { color: var(--c-primary); }
  .settings-nav-btn.active {
    border-left-color: color-mix(in srgb, var(--c-primary) 62%, transparent);
    color: var(--c-primary);
  }

  .settings-content {
    padding: 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .settings-content::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .settings-section-title {
    font-family: 'Satoshi', 'Inter', sans-serif;
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
    border-radius: var(--radius);
    border: 1px solid color-mix(in srgb, var(--c-accent) 45%, transparent);
    background: color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
    color: var(--c-primary);
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 11px;
    transition: border-color 0.15s;
  }

  .hotkey-input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--c-primary) 60%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--c-accent) 28%, transparent);
  }

  .hotkey-capture-btn {
    width: 100%;
    text-align: left;
    cursor: pointer;
  }

  .hotkey-capture-btn.recording {
    color: var(--c-red-bright);
    border-color: var(--c-red);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--c-red) 35%, transparent);
    animation: hotkey-recording-pulse 1.2s ease-in-out infinite;
  }

  @keyframes hotkey-recording-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
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
    padding: 6px 24px 6px 8px;
    border-radius: var(--radius);
    border: 1px solid color-mix(in srgb, var(--c-accent) 34%, transparent);
    background-color: color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
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

.settings-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  /* ── Onboarding wizard ───────────────────────────────────────── */
  .onboarding-step-label {
    margin-left: auto;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    flex-shrink: 0;
  }

  .onboarding-content {
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
  }

  .onboarding-nav {
    margin-top: 4px;
    justify-content: flex-end;
  }

  .onboarding-nav .btn-ghost {
    margin-right: auto;
  }

  /* ── About tab ───────────────────────────────────────────────── */
  .about-layout {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .about-hero {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 26%, transparent);
    border-radius: var(--radius);
    background:
      linear-gradient(125deg, color-mix(in srgb, var(--c-primary) 9%, transparent), transparent 45%),
      color-mix(in srgb, var(--c-bg) 92%, var(--c-mid));
  }

  .about-eyebrow {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-accent) 72%, #fff 28%);
  }

  .about-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .about-name {
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 15px;
    font-weight: 650;
    letter-spacing: 0.05em;
    color: var(--c-primary);
    text-shadow: 0 0 12px color-mix(in srgb, var(--c-primary) 30%, transparent);
  }

  .about-title-row .badge {
    flex-shrink: 0;
  }

  .about-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
  }

  .about-panel-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-accent) 86%, #fff 14%);
  }

  .about-actions {
    gap: 8px;
  }

  .about-status {
    font-size: 11px;
    color: color-mix(in srgb, var(--c-muted) 86%, #fff 14%);
    line-height: 1.45;
    padding: 5px 7px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 14%, transparent);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--c-bg) 95%, var(--c-mid));
  }

  .btn-kofi {
    background: color-mix(in srgb, #29abe0 18%, transparent);
    border-color: color-mix(in srgb, #29abe0 50%, transparent);
    color: #7fd1f0;
  }
  .btn-kofi:hover {
    background: color-mix(in srgb, #29abe0 28%, transparent);
    border-color: color-mix(in srgb, #29abe0 70%, transparent);
    color: #aee4f8;
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
    height: 30px;
    padding: 0 6px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--c-mid) 70%, transparent);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    color: var(--c-accent);
  }

  /* Icon-only tab (timer): narrow + centred instead of taking a full flex share,
     so it frees horizontal space for the labelled tabs. */
  .view-tab-icon {
    flex: 0 0 auto;
    width: 34px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Pinned add-on sub-nav — a secondary tier below the core tabs so add-ons
     get their own row instead of squeezing Campaign/Stash/etc. */
  .addon-subnav {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 2px 0;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .addon-subnav-label {
    display: inline-flex;
    align-items: center;
    color: color-mix(in srgb, var(--c-accent) 55%, transparent);
    padding-right: 2px;
  }

  .addon-subtab {
    flex: 0 1 auto;
    max-width: 140px;
    height: 20px;
    padding: 0 9px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 24%, transparent);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--c-mid) 80%, transparent);
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }

  .addon-subtab:hover {
    color: var(--c-red-bright);
    border-color: color-mix(in srgb, var(--c-red) 45%, transparent);
  }

  .addon-subtab.active {
    color: var(--c-on-accent);
    background: var(--c-red);
    border-color: var(--c-red);
  }

  .view-tab:hover {
    border-color: var(--c-red);
    color: var(--c-red-bright);
  }

  .view-tab.active {
    background: var(--c-red);
    border-color: var(--c-red);
    color: var(--c-on-accent);
  }

  /* Content pane */
  .view-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Campaign/Rewards use a dense checklist layout where the scrollbar chrome
     is visual noise. Keep scrolling enabled, just hide the track/thumb. */
  .view-content.hide-scrollbar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .view-content.hide-scrollbar::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  /* Error */
  .error-bar {
    flex-shrink: 0;
    padding: 5px 10px;
    background: color-mix(in srgb, var(--c-red-deep) 55%, var(--c-bg));
    border: 1px solid color-mix(in srgb, var(--c-red) 42%, transparent);
    border-radius: var(--radius);
    color: var(--c-red-bright);
    font-size: 11px;
  }

  .inline-error {
    color: var(--c-red-bright);
    font-size: 11px;
    padding: 4px 8px;
    background: color-mix(in srgb, var(--c-red-deep) 55%, var(--c-bg));
    border-radius: var(--radius);
    border: 1px solid color-mix(in srgb, var(--c-red) 42%, transparent);
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

  /* .btn / .btn-primary / .btn-ghost come from the shared app.css button
     system now — no local sliced-image overrides needed here or in
     .settings-content. */

  .pob-textarea {
    resize: vertical;
    min-height: 70px;
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 10px;
  }

  .folder-path {
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
    word-break: break-all;
  }

  .pob-current {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: color-mix(in srgb, var(--c-primary) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--c-primary) 22%, transparent);
    border-radius: var(--radius);
  }

  .pob-current-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-muted) 80%, transparent);
  }

  .pob-current-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--c-primary);
    flex: 1;
  }

  .pob-current-links {
    font-size: 10px;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
  }

  .saved-builds-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .saved-build-row.active {
    border-color: color-mix(in srgb, var(--c-success) 40%, transparent);
    background: color-mix(in srgb, var(--c-success) 6%, transparent);
  }

  .log-watcher-status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    background: color-mix(in srgb, var(--c-success) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--c-success) 22%, transparent);
    border-radius: var(--radius);
    font-size: 10px;
    color: color-mix(in srgb, var(--c-success) 75%, transparent);
  }

  .lws-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c-success);
    flex-shrink: 0;
    animation: lws-pulse 2s ease-in-out infinite;
  }

  @keyframes lws-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  /* ── Click-through opacity slider ───────────────────────────── */
  .ct-opacity-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ct-slider-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ct-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: var(--radius);
    background: linear-gradient(
      to right,
      var(--c-red) calc(var(--pct, 44) * 1%),
      color-mix(in srgb, var(--c-mid) 80%, transparent) calc(var(--pct, 44) * 1%)
    );
    outline: none;
    cursor: pointer;
  }

  .ct-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--c-red);
    border: 2px solid var(--c-red-deep);
    cursor: pointer;
    box-shadow: 0 0 6px color-mix(in srgb, var(--c-red) 45%, transparent);
    transition: box-shadow 0.15s;
  }
  .ct-slider::-webkit-slider-thumb:hover {
    box-shadow: 0 0 10px color-mix(in srgb, var(--c-red) 70%, transparent);
  }
  .ct-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--c-red);
    border: 2px solid var(--c-red-deep);
    cursor: pointer;
  }

  .ct-slider-val {
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    font-feature-settings: 'tnum';
    min-width: 34px;
    text-align: right;
    color: var(--c-red-bright);
    letter-spacing: 0.04em;
  }

  /* ── Auto-hide triggers ─────────────────────────────────────── */
  .trigger-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .trigger-list {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .trigger-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 4px 2px 8px;
    border-radius: var(--radius);
    border: 1px solid color-mix(in srgb, var(--c-accent) 40%, transparent);
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
  }

  .trigger-chip-key {
    font-family: 'Fira Mono', ui-monospace, monospace;
    font-size: 11px;
    color: var(--c-primary);
    letter-spacing: 0.02em;
  }

  .trigger-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    border-radius: var(--radius);
    background: transparent;
    color: color-mix(in srgb, var(--c-muted) 90%, #fff 10%);
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
  }
  .trigger-chip-remove:hover {
    color: var(--c-red-bright);
    background: color-mix(in srgb, var(--c-red) 10%, transparent);
  }

  .trigger-add-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .trigger-add-input {
    flex: 1;
  }

  /* ── Update banner ──────────────────────────────────────────── */
  .update-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--c-red) 14%, var(--c-bg));
    border-bottom: 1px solid color-mix(in srgb, var(--c-red) 40%, transparent);
  }

  .update-text {
    flex: 1;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--c-red-bright);
  }

  .update-btn {
    padding: 3px 12px;
    background: color-mix(in srgb, var(--c-red) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--c-red) 55%, transparent);
    border-radius: var(--radius);
    color: var(--c-red-bright);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.12s;
  }
  .update-btn:hover {
    background: color-mix(in srgb, var(--c-red) 30%, transparent);
    border-color: var(--c-red);
  }

  .update-dismiss {
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--c-red-bright) 60%, transparent);
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .update-dismiss:hover { color: var(--c-red-bright); }

  .update-progress {
    flex: 1;
    height: 4px;
    background: color-mix(in srgb, var(--c-mid) 70%, transparent);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .update-progress-fill {
    height: 100%;
    background: var(--c-red);
    transition: width 0.2s;
  }

  /* ── Build render-error fallback ────────────────────────────── */
  .build-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 28px 16px;
    text-align: center;
  }
  .build-error-msg {
    font-size: 12px;
    line-height: 1.5;
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
    max-width: 260px;
  }

  /* ── Build file drop overlay ────────────────────────────────── */
  .build-drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--c-bg) 78%, transparent);
    backdrop-filter: blur(1px);
    pointer-events: none;
  }

  .build-drop-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 28px 40px;
    border: 2px dashed color-mix(in srgb, var(--c-red) 60%, transparent);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--c-bg) 90%, var(--c-mid));
    color: var(--c-red-bright);
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }


</style>
