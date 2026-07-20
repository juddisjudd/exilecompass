// Barrel for the vendored exile-leveling route parser + gem-reward logic,
// adapted from HeartofPhos/exile-leveling `common/src/index.ts` for direct
// frontend use (see data.ts for the one meaningful change). Loaded lazily via
// dynamic import from levelingRoute.svelte.ts so PoE2-only sessions never pay
// for the route/gem/quest data.
export { Data } from "./data.js";
export type { Fragments, GameData, RouteData } from "./types.js";
export {
  type RouteState,
  buildRouteSource,
  getRouteFiles,
  initializeRouteState,
  parseRoute,
} from "./route-processing/index.js";
export { buildGemSteps, findCharacterGems } from "./route-processing/gems.js";
export {
  type Language,
  FragmentDescriptionLookup,
} from "./route-processing/fragment/language.js";
