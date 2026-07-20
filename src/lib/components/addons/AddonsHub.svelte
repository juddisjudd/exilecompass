<script lang="ts">
  import { onMount } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import AddonsInstalled from '$lib/components/addons/AddonsInstalled.svelte';
  import AddonsDiscover from '$lib/components/addons/AddonsDiscover.svelte';
  import AddonsPanel from '$lib/components/addons/AddonsPanel.svelte';
  import {
    addonsHost,
    closeAddonPanel,
    initAddonsHost,
    installAddonFromManifest,
    installAddonFromRegistry,
    openAddonPanel,
    setAddonsSection,
    toggleAddonEnabled,
    toggleAddonPinned,
    uninstallAddon,
    type AddonsSection,
  } from '$lib/plugins/host.svelte';

  const sections: Array<{ id: AddonsSection; label: string }> = [
    { id: 'installed', label: 'Installed' },
    { id: 'discover', label: 'Discover' },
  ];

  const activePanelAddon = $derived(
    addonsHost.activePanelAddonId
      ? addonsHost.installed.find((addon) => addon.id === addonsHost.activePanelAddonId) ?? null
      : null,
  );

  onMount(() => {
    void initAddonsHost();
  });

  async function installFromFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Addon Manifest', extensions: ['json'] }],
    });
    if (!selected || Array.isArray(selected)) return;
    await installAddonFromManifest(selected, 'manual');
  }
</script>

<div class="addons-root">
  <header class="addons-header">
    <h2>Add-ons Hub</h2>
    <button class="btn btn-primary" type="button" onclick={installFromFile}>Install from file</button>
  </header>

  {#if addonsHost.error}
    <p class="addons-error">{addonsHost.error}</p>
  {/if}

  <nav class="section-tabs" aria-label="Add-ons sections">
    {#each sections as section (section.id)}
      <button
        class="section-tab"
        class:active={addonsHost.section === section.id}
        onclick={() => setAddonsSection(section.id)}
        type="button"
      >
        {section.label}
      </button>
    {/each}
  </nav>

  <div class="addons-content">
    {#if addonsHost.section === 'panel'}
      <AddonsPanel addon={activePanelAddon} onClose={closeAddonPanel} />
    {:else if addonsHost.section === 'discover'}
      <AddonsDiscover
        addons={addonsHost.discover}
        installedIds={addonsHost.installed.map((addon) => addon.id)}
        onInstall={installAddonFromRegistry}
      />
    {:else}
      <AddonsInstalled
        addons={addonsHost.installed}
        onToggle={toggleAddonEnabled}
        onTogglePin={toggleAddonPinned}
        onUninstall={uninstallAddon}
        onOpenPanel={openAddonPanel}
      />
    {/if}
  </div>
</div>

<style>
  .addons-root {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    padding: 8px 10px 10px;
  }

  .addons-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--c-primary);
  }

  .addons-error {
    font-size: 11px;
    color: var(--c-red-bright);
    padding: 6px 8px;
    border: 1px solid color-mix(in srgb, var(--c-red) 40%, transparent);
    background: color-mix(in srgb, var(--c-red) 12%, transparent);
  }

  .section-tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .section-tab {
    border: 1px solid color-mix(in srgb, var(--c-accent) 30%, transparent);
    background: color-mix(in srgb, var(--c-mid) 88%, transparent);
    color: var(--c-accent);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 4px 7px;
    cursor: pointer;
  }

  .section-tab:hover {
    border-color: color-mix(in srgb, var(--c-red) 45%, transparent);
    color: var(--c-primary);
  }

  .section-tab.active {
    border-color: var(--c-red);
    color: var(--c-red-bright);
    background: color-mix(in srgb, var(--c-red) 14%, transparent);
  }

  .addons-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
