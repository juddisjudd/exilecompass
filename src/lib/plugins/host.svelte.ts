import { invoke } from '@tauri-apps/api/core';

export type AddonsSection = 'installed' | 'discover' | 'updates' | 'permissions' | 'diagnostics' | 'panel';
export type PluginTrust = 'verified' | 'unverified';

export interface InstalledAddon {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  trust: PluginTrust;
  source: 'registry' | 'manual';
  permissions: string[];
  hasUpdate: boolean;
  updateVersion?: string;
  lastError?: string;
  hasPanel: boolean;
  pinned: boolean;
  panelTitle?: string;
}

export interface DiscoverAddon {
  id: string;
  name: string;
  author: string;
  repoUrl: string;
  description: string;
  latestVersion: string;
  trust: PluginTrust;
  compatible: boolean;
}

let _section = $state<AddonsSection>('installed');
let _installed = $state<InstalledAddon[]>([]);
let _discover = $state<DiscoverAddon[]>([]);
let _loading = $state(false);
let _error = $state('');
let _activePanelAddonId = $state<string | null>(null);

export const addonsHost = {
  get section() {
    return _section;
  },
  get installed() {
    return _installed;
  },
  get discover() {
    return _discover;
  },
  get loading() {
    return _loading;
  },
  get error() {
    return _error;
  },
  get hasAnyInstalled() {
    return _installed.length > 0;
  },
  get activePanelAddonId() {
    return _activePanelAddonId;
  },
};

export function setAddonsSection(section: AddonsSection): void {
  _section = section;
}

export function openAddonPanel(id: string): void {
  _activePanelAddonId = id;
  _section = 'panel';
}

export function closeAddonPanel(): void {
  _activePanelAddonId = null;
  _section = 'installed';
}

export async function refreshInstalledAddons(): Promise<void> {
  try {
    _installed = await invoke<InstalledAddon[]>('addons_list');
  } catch {
    _error = 'Failed to load installed add-ons.';
  }
}

export async function refreshRegistryAddons(path?: string): Promise<void> {
  try {
    const resolvedPath = path ?? null;
    _discover = await invoke<DiscoverAddon[]>('addons_load_registry', {
      path: resolvedPath,
    });
  } catch {
    _discover = [];
  }
}

export async function initAddonsHost(): Promise<void> {
  _loading = true;
  _error = '';
  await Promise.all([refreshInstalledAddons(), refreshRegistryAddons()]);
  _loading = false;
}

export async function toggleAddonEnabled(id: string): Promise<void> {
  const existing = _installed.find((addon) => addon.id === id);
  if (!existing) return;
  try {
    await invoke('addons_set_enabled', { id, enabled: !existing.enabled });
    await refreshInstalledAddons();
  } catch {
    _error = 'Failed to toggle add-on state.';
  }
}

export async function toggleAddonPinned(id: string): Promise<void> {
  const existing = _installed.find((addon) => addon.id === id);
  if (!existing) return;
  try {
    await invoke('addons_set_pinned', { id, pinned: !existing.pinned });
    await refreshInstalledAddons();
  } catch {
    _error = 'Failed to pin add-on.';
  }
}

/** Enabled, pinned add-ons that contribute a panel — surfaced as top-level tabs. */
export function pinnedPanelAddons(): InstalledAddon[] {
  return _installed.filter((a) => a.pinned && a.enabled && a.hasPanel);
}

export async function uninstallAddon(id: string): Promise<void> {
  try {
    await invoke('addons_uninstall', { id });
    await refreshInstalledAddons();
  } catch {
    _error = 'Failed to uninstall add-on.';
  }
}

export async function installAddonFromManifest(path: string, source: 'manual' | 'registry'): Promise<void> {
  try {
    await invoke('addons_install_from_manifest', { path, source });
    await refreshInstalledAddons();
  } catch {
    _error = 'Failed to install add-on manifest.';
  }
}

export async function installAddonFromRegistry(id: string): Promise<void> {
  const addon = _discover.find((item) => item.id === id);
  if (!addon) return;

  _error = '';
  try {
    // Backend downloads the addon's GitHub release zip (derived from repoUrl +
    // latestVersion), extracts + validates it, then records the install.
    await invoke('addons_install_from_registry', { id });
    await refreshInstalledAddons();
  } catch (e) {
    _error = typeof e === 'string' ? e : `Failed to install ${id}.`;
  }
}
