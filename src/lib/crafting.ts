// Type definitions for the data-driven crafting guides shown in the Craft tab.
// Each guide is an ordered list of steps the player checks off; steps can show
// the currency/omens/essences they consume, flag "spam until X" loops, and carry
// success/fail branches for gamble steps (fracturing, whittling).
//
// Guide CONTENT lives in `guides/*.yaml` (contributor-friendly) and is compiled
// into `crafting.generated.ts` by `tools/build-crafting.mjs` (run via
// `bun run crafting`). Edit the YAML, not the generated file.
//
// Guide content is English-only for now (no dataI18n layer yet).

export interface CraftingItemRef {
  /** Display name shown in the chip/tooltip, e.g. "Perfect Regal Orb". */
  name: string;
  /** Resolved icon URL in the shared icon tree, e.g. "/poe2/currency/foo.webp". */
  icon: string;
}

export interface CraftingBranch {
  /** success/fail get preset green/red labels; custom uses `label`, neutral. */
  kind: 'success' | 'fail' | 'custom';
  /** The condition label, set when kind is "custom" (e.g. "If it hits a prefix"). */
  label?: string;
  /** What to do when this branch hits. */
  text: string;
  /** Items used to recover/continue in this branch. */
  items?: CraftingItemRef[];
}

/** A highlighted step callout — colour driven by kind. */
export type CraftingNoteKind = 'tip' | 'warning' | 'alt';
export interface CraftingNote {
  kind: CraftingNoteKind;
  text: string;
}

export interface CraftingStep {
  id: string;
  /** One-line action, e.g. "Fracture the T1 prefix". */
  title: string;
  /** Longer explanation shown under the title. */
  detail?: string;
  /** A skippable / alternative step (shows an "Optional" badge). */
  optional?: boolean;
  /** A highlighted tip / warning / alternative callout. */
  note?: CraftingNote;
  /** Currency/omens/essences consumed by this step. */
  items?: CraftingItemRef[];
  /** Mod(s) this step aims for — first is the ideal, the rest are alternatives. */
  targets?: CraftingStepTarget[];
  /** Marks "repeat until you hit X" steps. */
  repeat?: boolean;
  branches?: CraftingBranch[];
}

/** How a target mod sits on the finished item — drives its colour chip. */
export type ResultTag = 'prefix' | 'suffix' | 'fractured' | 'implicit';

export interface CraftingStepTarget {
  /** The mod line, e.g. "Adds # to # Lightning Damage to Attacks". */
  text: string;
  tag?: ResultTag;
}

export interface CraftingResultMod {
  /** The mod line, e.g. "+2 to Level of all Projectile Skills". */
  text: string;
  tag?: ResultTag;
  /** One of several acceptable results — grouped under "any of these". */
  alt?: boolean;
}

export interface CraftingAuthor {
  name: string;
  /** Channel URLs (http/https only). */
  youtube?: string;
  twitch?: string;
}

export type EquipmentSlot =
  | 'weapon'
  | 'offhand'
  | 'quiver'
  | 'helmet'
  | 'body'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring'
  | 'jewel';

/** Display order + labels for the slot picker (English-only, like guide content). */
export const EQUIPMENT_SLOTS: Array<{ id: EquipmentSlot; label: string }> = [
  { id: 'weapon', label: 'Weapon' },
  { id: 'offhand', label: 'Off-Hand' },
  { id: 'quiver', label: 'Quiver' },
  { id: 'helmet', label: 'Helmet' },
  { id: 'body', label: 'Body Armour' },
  { id: 'gloves', label: 'Gloves' },
  { id: 'boots', label: 'Boots' },
  { id: 'belt', label: 'Belt' },
  { id: 'amulet', label: 'Amulet' },
  { id: 'ring', label: 'Ring' },
  { id: 'jewel', label: 'Jewel' },
];

export interface CraftingGuideData {
  id: string;
  /** Equipment piece this craft is for — drives the slot picker. */
  slot: EquipmentSlot;
  /** Craft name shown in the slot listing, e.g. "+2 Projectiles (Ice Shot / Twisters)". */
  name: string;
  /** What the finished item is for. */
  goal: string;
  /** Who wrote the guide (optional credit + channel links). */
  author?: CraftingAuthor;
  /** The base item(s) the craft can start from (any one). */
  bases: CraftingItemRef[];
  /** Required item level of the base, e.g. 80. */
  ilvl?: number;
  steps: CraftingStep[];
  /** The target mods the finished item should have. */
  result?: CraftingResultMod[];
}

// Compiled from guides/*.yaml at build time (see header). The generated module
// imports the types above, so this re-export stays type-safe.
export { CRAFTING_GUIDES } from './crafting.generated';
