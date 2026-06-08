<!--
  A self-contained "Reset" button with an inline confirmation step.

  Replaces the browser `window.confirm()`, which on Linux (WebKitGTK) is proxied
  to the `tauri-plugin-dialog` `confirm` command — a command that no longer
  exists in plugin v2.7+, so the call is rejected with "not allowed by ACL". A
  native modal also sits poorly with an always-on-top overlay (it gets trapped
  behind the window). Confirming in-app avoids both problems and is identical on
  every platform.

  Click once to arm (button is replaced by a prompt + ✓/✕); click ✓ to confirm,
  ✕ or anywhere else dismisses.
-->
<script lang="ts">
  interface Props {
    /** Short prompt shown while armed, e.g. "Reset all campaign progress?" */
    prompt: string;
    /** Label for the trigger button. */
    label: string;
    /** Run when the user confirms. */
    onconfirm: () => void;
    /** Optional tooltip on the trigger button. */
    title?: string;
  }

  let { prompt, label, onconfirm, title }: Props = $props();
  let armed = $state(false);

  function accept() {
    onconfirm();
    armed = false;
  }
</script>

{#if armed}
  <span class="confirm-inline">
    <span class="confirm-prompt">{prompt}</span>
    <button class="confirm-yes" onclick={accept} title={prompt}>✓</button>
    <button class="confirm-no" onclick={() => (armed = false)} title="Cancel">✕</button>
  </span>
{:else}
  <button class="btn-reset" onclick={() => (armed = true)} {title}>{label}</button>
{/if}

<style>
  .btn-reset {
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
  .btn-reset:hover {
    border-color: color-mix(in srgb, #f38d78 42%, transparent);
    color: #f38d78;
    background: color-mix(in srgb, #f38d78 6%, transparent);
  }

  .confirm-inline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .confirm-prompt {
    font-size: 10px;
    color: color-mix(in srgb, var(--c-muted) 90%, #fff 10%);
  }
  .confirm-yes,
  .confirm-no {
    padding: 2px 6px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--c-accent) 28%, transparent);
    border-radius: 2px;
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s;
  }
  .confirm-yes {
    color: #f38d78;
    border-color: color-mix(in srgb, #f38d78 42%, transparent);
  }
  .confirm-yes:hover {
    background: color-mix(in srgb, #f38d78 14%, transparent);
  }
  .confirm-no {
    color: color-mix(in srgb, var(--c-muted) 90%, #fff 10%);
  }
  .confirm-no:hover {
    color: var(--c-primary);
    border-color: color-mix(in srgb, var(--c-primary) 40%, transparent);
  }
</style>
