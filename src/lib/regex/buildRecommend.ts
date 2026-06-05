// Recommend a stash/vendor search for a build's equipped item.
//
// Maps an item's free-text mods (from a PoB or GGG import) onto the finite
// vendor catalog (see vendorOptions.ts), plus an item-class filter inferred from
// the slot, so the player can shop for upgrades that carry the same desirable
// affixes. Intentionally conservative: only mods with a clear catalog match are
// surfaced — unique-specific or unsearchable lines are skipped rather than
// guessed at.

import type { PobItem } from '$lib/pob';
import { VENDOR_OPTIONS, type VendorOption } from './vendorOptions';

const byLabel = new Map(VENDOR_OPTIONS.map((o) => [o.label, o]));
const opt = (label: string): VendorOption | undefined => byLabel.get(label);

interface Rule {
  test: RegExp;
  labels: string[];
}

// Order matters: resistances are matched before damage so "Fire Resistance"
// never trips the "fire damage" rule, and specific skill lines before general.
const RULES: Rule[] = [
  { test: /all elemental resistances/i, labels: ['Fire resistance', 'Cold resistance', 'Lightning resistance'] },
  { test: /fire resistance/i, labels: ['Fire resistance'] },
  { test: /cold resistance/i, labels: ['Cold resistance'] },
  { test: /lightning resistance/i, labels: ['Lightning resistance'] },
  { test: /chaos resistance/i, labels: ['Chaos resistance'] },
  { test: /maximum life/i, labels: ['Maximum Life'] },
  { test: /maximum mana/i, labels: ['Maximum Mana'] },
  { test: /\bspirit\b/i, labels: ['+# Spirit'] },
  { test: /rarity of items/i, labels: ['Increased Rarity'] },
  { test: /attack speed/i, labels: ['Attack speed'] },
  { test: /cast speed/i, labels: ['Cast speed'] },
  // Skill levels — specific groupings before the catch-all "all skills".
  { test: /minion skills/i, labels: ['+# minion skills'] },
  { test: /melee skills/i, labels: ['+# melee skills'] },
  { test: /projectile skills/i, labels: ['+# projectile skills'] },
  { test: /fire spell skills/i, labels: ['+# fire spell skills'] },
  { test: /cold spell skills/i, labels: ['+# cold spell skills'] },
  { test: /lightning spell skills/i, labels: ['+# lightning spell skills'] },
  { test: /(physical|chaos) spell skills/i, labels: ['+# physical spell skills'] },
  { test: /all spell skills/i, labels: ['+# all spell skills'] },
  { test: /level of all skills/i, labels: ['+# to skills (any)'] },
  // Attributes.
  { test: /to all attributes/i, labels: ['Strength', 'Dexterity', 'Intelligence'] },
  { test: /to strength/i, labels: ['Strength'] },
  { test: /to dexterity/i, labels: ['Dexterity'] },
  { test: /to intelligence/i, labels: ['Intelligence'] },
  // Damage (resistances already handled above).
  { test: /spell damage/i, labels: ['Spell damage'] },
  { test: /physical damage/i, labels: ['Physical damage'] },
  { test: /elemental damage/i, labels: ['Elemental damage'] },
  { test: /fire damage/i, labels: ['Fire damage'] },
  { test: /cold damage/i, labels: ['Cold damage'] },
  { test: /lightning damage/i, labels: ['Lightning damage'] },
  { test: /chaos damage/i, labels: ['Chaos damage'] },
];

// Armour/jewellery slots map straight to an item-class filter.
const SLOT_CLASS: Record<string, string> = {
  helm: 'Helmets',
  body: 'Body Armours',
  gloves: 'Gloves',
  boots: 'Boots',
  amulet: 'Amulets',
  ring1: 'Rings',
  ring2: 'Rings',
  belt: 'Belts',
};

// Weapon/offhand slots can hold many classes — infer from the base type.
const WEAPON_CLASS: [RegExp, string][] = [
  [/crossbow/i, 'Crossbows'],
  [/quarterstaff/i, 'Quarterstaves'],
  [/staff|stave/i, 'Staves'],
  [/\bbow\b/i, 'Bows'],
  [/wand/i, 'Wands'],
  [/sceptre/i, 'Sceptres'],
  [/spear/i, 'Spears'],
  [/two[\s-]?hand|greatmace/i, 'Two Hand Maces'],
  [/mace/i, 'One Hand Maces'],
  [/shield/i, 'Shields'],
  [/quiver/i, 'Quivers'],
  [/foci|focus/i, 'Foci'],
];

function itemClassOption(item: PobItem): VendorOption | undefined {
  const label = SLOT_CLASS[item.slot];
  if (label) return opt(label);
  if (item.slot.startsWith('weapon') || item.slot === 'offhand') {
    for (const [re, lbl] of WEAPON_CLASS) {
      if (re.test(item.base) || re.test(item.name)) return opt(lbl);
    }
  }
  return undefined;
}

// Movement speed is tiered in the catalog (10/15/20/25/30). Snap the item's
// rolled value down to the nearest tier so the search still matches it. Skip
// when no percentage is present (e.g. a GGG stat-priority line with no number),
// since a guessed tier would only match items at exactly that value.
function movementLabel(line: string): string | null {
  if (!/movement speed/i.test(line)) return null;
  const m = line.match(/(\d+)\s*%/);
  if (!m) return null;
  const v = Number(m[1]);
  const tier = v >= 30 ? 30 : v >= 25 ? 25 : v >= 20 ? 20 : v >= 15 ? 15 : 10;
  return `Movement ${tier}%`;
}

/**
 * Build the recommended vendor-search options for an item: the desirable affixes
 * found on it plus its item-class filter, de-duplicated. Returns an empty array
 * when nothing maps to a searchable catalog option.
 */
export function recommendVendorOptionsForItem(item: PobItem): VendorOption[] {
  const picked = new Map<number, VendorOption>();
  const add = (label: string) => {
    const o = opt(label);
    if (o) picked.set(o.id, o);
  };

  const cls = itemClassOption(item);
  if (cls) picked.set(cls.id, cls);

  for (const mod of item.mods) {
    const mv = movementLabel(mod);
    if (mv) add(mv);
    for (const rule of RULES) {
      if (rule.test.test(mod)) rule.labels.forEach(add);
    }
  }

  return [...picked.values()];
}
