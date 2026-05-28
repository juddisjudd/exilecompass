<script lang="ts">
  import { stripPobColors, clearBuild, type PobBuild } from '$lib/pob';

  interface Props {
    build: PobBuild | null;
    onClear: () => void;
    onOpenImport: () => void;
  }

  let { build, onClear, onOpenImport }: Props = $props();

  let notesExpanded = $state(false);

  function handleClear() {
    clearBuild();
    onClear();
  }

  const cleanNotes = $derived(build ? stripPobColors(build.notes) : '');
  const hasNotes = $derived(cleanNotes.trim().length > 0);

  function gemTypeClass(type: string): string {
    if (type === 'spirit') return 'gem-spirit';
    if (type === 'support') return 'gem-support';
    return 'gem-skill';
  }
</script>

<div class="build-overview">
  {#if !build}
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <p class="empty-title">No build imported</p>
      <p class="empty-sub">Import a Path of Building code to see your skill links here.</p>
      <button class="btn-import" onclick={onOpenImport}>Import Build</button>
    </div>
  {:else}
    <!-- Build header -->
    <div class="build-header">
      <div class="build-identity">
        <span class="build-class">{build.ascendClassName || build.className}</span>
        {#if build.ascendClassName}
          <span class="build-base-class">{build.className}</span>
        {/if}
      </div>
      <div class="build-meta">
        <span class="build-level">Lv {build.level}</span>
        <button class="btn-clear" onclick={handleClear} title="Clear imported build">Clear</button>
      </div>
    </div>

    <!-- Skill links -->
    {#if build.skillGroups.length > 0}
      <div class="section">
        <div class="section-label">Skill Links</div>
        <div class="skill-groups">
          {#each build.skillGroups as group (group.mainSkill)}
            <div class="skill-group">
              <span class="gem gem-skill gem-main">{group.mainSkill}</span>
              {#each group.supports as sup (sup.name)}
                <span class="gem {gemTypeClass(sup.type)}">{sup.name}</span>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Notes -->
    {#if hasNotes}
      <div class="section">
        <button
          class="notes-toggle"
          onclick={() => (notesExpanded = !notesExpanded)}
          type="button"
        >
          <span class="toggle-icon" class:expanded={notesExpanded}>▶</span>
          <span class="section-label">Build Notes</span>
        </button>

        {#if notesExpanded}
          <pre class="notes-body">{cleanNotes}</pre>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .build-overview {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ── Empty state ──────────────────────────────────────── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 16px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c-bg) 94%, var(--c-mid));
    text-align: center;
  }

  .empty-icon {
    color: color-mix(in srgb, var(--c-muted) 50%, transparent);
  }

  .empty-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: color-mix(in srgb, var(--c-accent) 80%, #fff 20%);
  }

  .empty-sub {
    font-size: 11px;
    color: color-mix(in srgb, var(--c-muted) 80%, transparent);
    max-width: 240px;
    line-height: 1.5;
  }

  .btn-import {
    margin-top: 4px;
    padding: 5px 16px;
    background: color-mix(in srgb, var(--c-primary) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--c-primary) 40%, transparent);
    border-radius: 2px;
    color: var(--c-primary);
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-import:hover {
    background: color-mix(in srgb, var(--c-primary) 20%, transparent);
    border-color: color-mix(in srgb, var(--c-primary) 60%, transparent);
  }

  /* ── Build header ─────────────────────────────────────── */
  .build-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--c-bg) 86%, var(--c-mid));
    border: 1px solid color-mix(in srgb, var(--c-accent) 38%, transparent);
    border-radius: 3px;
  }

  .build-identity {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .build-class {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--c-primary);
    text-shadow: 0 0 12px color-mix(in srgb, var(--c-primary) 40%, transparent);
  }

  .build-base-class {
    font-size: 10px;
    color: color-mix(in srgb, var(--c-muted) 80%, transparent);
    letter-spacing: 0.04em;
  }

  .build-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .build-level {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    font-feature-settings: 'tnum';
    color: color-mix(in srgb, var(--c-accent) 75%, #fff 25%);
    letter-spacing: 0.04em;
  }

  .btn-clear {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--c-muted) 90%, #fff 10%);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-clear:hover {
    border-color: color-mix(in srgb, #f38d78 40%, transparent);
    color: #f38d78;
  }

  /* ── Section ──────────────────────────────────────────── */
  .section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
    border-radius: 3px;
    overflow: hidden;
  }

  .section-label {
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    padding: 5px 10px;
    background: color-mix(in srgb, var(--c-bg) 88%, var(--c-mid));
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 12%, transparent);
  }

  /* ── Skill groups ─────────────────────────────────────── */
  .skill-groups {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: color-mix(in srgb, var(--c-bg) 96%, var(--c-mid));
  }

  .skill-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--c-accent) 8%, transparent);
  }
  .skill-group:last-child { border-bottom: none; }

  /* ── Gems ─────────────────────────────────────────────── */
  .gem {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 2px;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    border: 1px solid;
  }

  .gem-main {
    font-weight: 700;
    font-size: 11px;
  }

  .gem-skill {
    color: #86efac;
    border-color: color-mix(in srgb, #86efac 30%, transparent);
    background: color-mix(in srgb, #86efac 8%, transparent);
  }

  .gem-support {
    color: color-mix(in srgb, #93c5fd 90%, #fff 10%);
    border-color: color-mix(in srgb, #93c5fd 28%, transparent);
    background: color-mix(in srgb, #93c5fd 7%, transparent);
  }

  .gem-spirit {
    color: color-mix(in srgb, #c4b5fd 90%, #fff 10%);
    border-color: color-mix(in srgb, #c4b5fd 28%, transparent);
    background: color-mix(in srgb, #c4b5fd 7%, transparent);
  }

  /* ── Notes ────────────────────────────────────────────── */
  .notes-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }
  .notes-toggle .section-label {
    flex: 1;
    border-bottom: none;
  }
  .notes-toggle .toggle-icon {
    font-size: 8px;
    color: color-mix(in srgb, var(--c-accent) 70%, transparent);
    transition: transform 0.2s ease;
    margin-left: 6px;
    flex-shrink: 0;
  }
  .notes-toggle .toggle-icon.expanded { transform: rotate(90deg); }

  .notes-body {
    margin: 0;
    padding: 8px 10px;
    font-family: 'Inter Tight', 'Inter', sans-serif;
    font-size: 11px;
    line-height: 1.55;
    color: color-mix(in srgb, var(--c-accent) 82%, #fff 18%);
    white-space: pre-wrap;
    overflow-wrap: break-word;
    background: color-mix(in srgb, var(--c-bg) 97%, var(--c-mid));
    max-height: 240px;
    overflow-y: auto;
  }
</style>
