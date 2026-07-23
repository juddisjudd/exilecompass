// Session-only "which spec / skill-set is selected" state for the PoE1 Tree
// and Gems tabs. Lives outside PassiveTreeViewer.svelte and GemLinksViewer.svelte
// so switching mainView tabs — which unmounts those components — doesn't reset
// the user's pick back to the build's stored default every time.
//
// Not persisted to localStorage: scoped to the current build import only, and
// reset via syncTreeSelectionToBuild/syncGemsSelectionToBuild whenever a
// different build (by importedAt) has been loaded since the last check.

let _treeSpecIndex = $state(0);
let _treeForBuild: number | null = null;
let _gemsActiveSet = $state(0);
let _gemsForBuild: number | null = null;

export const poe1ViewState = {
  get treeSpecIndex() {
    return _treeSpecIndex;
  },
  set treeSpecIndex(i: number) {
    _treeSpecIndex = i;
  },
  get gemsActiveSet() {
    return _gemsActiveSet;
  },
  set gemsActiveSet(i: number) {
    _gemsActiveSet = i;
  },
};

/** Reset the tree spec selection to `defaultIndex` only if `importedAt` names
 *  a different build than the last call (a fresh import) — otherwise leaves
 *  whatever the user last picked alone. */
export function syncTreeSelectionToBuild(importedAt: number, defaultIndex: number) {
  if (_treeForBuild === importedAt) return;
  _treeForBuild = importedAt;
  _treeSpecIndex = defaultIndex;
}

/** Same as syncTreeSelectionToBuild, for the Gems tab's active skill set. */
export function syncGemsSelectionToBuild(importedAt: number, defaultIndex: number) {
  if (_gemsForBuild === importedAt) return;
  _gemsForBuild = importedAt;
  _gemsActiveSet = defaultIndex;
}
