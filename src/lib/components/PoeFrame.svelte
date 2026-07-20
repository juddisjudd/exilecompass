<!-- Content frame wrapper.
     Wrap any full-size panel with this to get the flat outline treatment.
     Kept as its own component so +page.svelte's slot usage doesn't change. -->
<div class="pf-root">
  <slot />
</div>

<style>
  .pf-root {
    position: relative;
    /* Fills the space below the title bar in the app-shell flex column */
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--c-accent) 18%, transparent);
  }
</style>
