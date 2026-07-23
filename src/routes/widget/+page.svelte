<script lang="ts">
  import WidgetShell from '$lib/components/WidgetShell.svelte';
  import ActDecoderWidget from '$lib/components/ActDecoderWidget.svelte';

  // Not using SvelteKit's $app/state page store (unused elsewhere in this
  // app, which treats SvelteKit purely as a static-SPA build tool) — read the
  // query string directly, same style as the rest of the codebase.
  let widget = $state('');
  if (typeof window !== 'undefined') {
    widget = new URLSearchParams(window.location.search).get('widget') ?? '';
  }
</script>

<WidgetShell>
  <!-- Widget content is picked by `widget` id here as each one is built:
       Act-Decoder, PoB tree HUD, macro wheel, Labyrinth tracker, ... -->
  {#if widget === 'act-decoder'}
    <ActDecoderWidget />
  {/if}
</WidgetShell>
