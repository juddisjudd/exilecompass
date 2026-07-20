// Adapted from HeartofPhos/exile-leveling `common/src/data.ts`.
// Changed for the SvelteKit frontend: plain JSON imports (Vite-native)
// instead of `with { type: "json" }` import attributes, pointing at the
// vendored data under src/lib/leveling/data/.
import type { GameData } from "./types.js";

import AREAS_JSON from "../data/areas.json";
import AWAKENED_GEM_LOOKUP_JSON from "../data/awakened-gem-lookup.json";
import CHARACTERS_JSON from "../data/characters.json";
import GEM_COLOURS_JSON from "../data/gem-colours.json";
import GEMS_JSON from "../data/gems.json";
import KILL_WAYPOINTS_JSON from "../data/kill-waypoints.json";
import QUESTS_JSON from "../data/quests.json";
import VAAL_GEM_LOOKUP_JSON from "../data/vaal-gem-lookup.json";

const Areas = AREAS_JSON as GameData.Areas;
const AwakenedGemLookup = AWAKENED_GEM_LOOKUP_JSON as GameData.VariantGemLookup;
const Characters = CHARACTERS_JSON as GameData.Characters;
const GemColours = GEM_COLOURS_JSON as GameData.GemColours;
const Gems = GEMS_JSON as GameData.Gems;
const KillWaypoints = KILL_WAYPOINTS_JSON as GameData.KillWaypoints;
const Quests = QUESTS_JSON as unknown as GameData.Quests;
const VaalGemLookup = VAAL_GEM_LOOKUP_JSON as GameData.VariantGemLookup;

export const Data = {
  Areas,
  AwakenedGemLookup,
  Characters,
  GemColours,
  Gems,
  KillWaypoints,
  Quests,
  VaalGemLookup,
};
