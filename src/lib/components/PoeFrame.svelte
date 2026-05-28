<!-- 9-slice game border frame.
     Wrap any full-size panel with this to get the PoE2 ornate border.
     All frame pieces are pointer-events:none so they never block clicks. -->
<div class="pf-root">
  <slot />
  <div class="pf pf-tl"></div>
  <div class="pf pf-tr"></div>
  <div class="pf pf-bl"></div>
  <div class="pf pf-br"></div>
  <div class="pf pf-top"></div>
  <div class="pf pf-bot"></div>
  <div class="pf pf-left"></div>
  <div class="pf pf-right"></div>
</div>

<style>
  .pf-root {
    position: relative;
    /* Fills the space below the title bar in the app-shell flex column */
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* All frame pieces sit on top, never capture events */
  .pf {
    position: absolute;
    pointer-events: none;
    z-index: 100;
    background-repeat: no-repeat;
    background-size: contain;
  }

  /* ── Corners (92px natural → 46px at 50%) ─────────────── */
  .pf-tl { top: 0; left: 0;   width: 46px; height: 46px; background-image: url('/ui/loadingscreenbordertopleft.webp'); }
  .pf-tr { top: 0; right: 0;  width: 46px; height: 46px; background-image: url('/ui/loadingscreenbordertopright.webp'); }
  .pf-bl { bottom: 0; left: 0;  width: 46px; height: 46px; background-image: url('/ui/loadingscreenborderbottomleft.webp'); }
  .pf-br { bottom: 0; right: 0; width: 46px; height: 46px; background-image: url('/ui/loadingscreenborderbottomright.webp'); }

  /* ── Horizontal edges — stretch (no repeat seams), 10px overlap under corners */
  .pf-top {
    top: 0; left: 36px; right: 36px; height: 16px;
    background-image: url('/ui/loadingscreenbordertop.webp');
    background-repeat: no-repeat;
    background-size: 100% 100%;
  }
  .pf-bot {
    bottom: 0; left: 36px; right: 36px; height: 16px;
    background-image: url('/ui/loadingscreenborderbottom.webp');
    background-repeat: no-repeat;
    background-size: 100% 100%;
  }

  /* ── Vertical edges — stretch, 10px overlap under corners ──── */
  .pf-left {
    left: 0; top: 36px; bottom: 36px; width: 16px;
    background-image: url('/ui/loadingscreenborderleft.webp');
    background-repeat: no-repeat;
    background-size: 100% 100%;
  }
  .pf-right {
    right: 0; top: 36px; bottom: 36px; width: 16px;
    background-image: url('/ui/loadingscreenborderright.webp');
    background-repeat: no-repeat;
    background-size: 100% 100%;
  }
</style>
