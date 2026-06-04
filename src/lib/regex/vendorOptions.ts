// Atomic vendor (stash) conditions. Each entry is one checkbox whose `regex`
// is the single-select fragment poe2.re's vendor generator would emit for it.
// In the grouped builder these are OR'd within a group / AND'd across groups,
// so we use atomic fragments rather than poe2.re's merged forms
// (`(fi|co).+res`, `y: (r|m)`, …). `id` is the index into this catalog.

import type { SelectOption } from './types';

export interface VendorOption {
  id: number;
  section: string;
  label: string;
  regex: string;
}

const RAW: Omit<VendorOption, 'id'>[] = [
  // Item rarity
  { section: 'Item rarity', label: 'Rare', regex: 'y: r' },
  { section: 'Item rarity', label: 'Magic', regex: 'y: m' },
  { section: 'Item rarity', label: 'Normal', regex: 'y: n' },
  // Properties
  { section: 'Properties', label: 'Quality', regex: 'y: \\+' },
  { section: 'Properties', label: 'Sockets', regex: 'ts: S' },
  // Resistances
  { section: 'Resistances', label: 'Fire resistance', regex: 'fi.+res' },
  { section: 'Resistances', label: 'Cold resistance', regex: 'co.+res' },
  { section: 'Resistances', label: 'Lightning resistance', regex: 'li.+res' },
  { section: 'Resistances', label: 'Chaos resistance', regex: 'ch.+res' },
  // Movement speed
  { section: 'Movement speed', label: 'Movement 30%', regex: '30% i.+mov' },
  { section: 'Movement speed', label: 'Movement 25%', regex: '25% i.+mov' },
  { section: 'Movement speed', label: 'Movement 20%', regex: '20% i.+mov' },
  { section: 'Movement speed', label: 'Movement 15%', regex: '15% i.+mov' },
  { section: 'Movement speed', label: 'Movement 10%', regex: '10% i.+mov' },
  // Damage
  { section: 'Damage', label: 'Physical damage', regex: 'ph.*da' },
  { section: 'Damage', label: 'Spell damage', regex: 'ell.*ge$' },
  { section: 'Damage', label: 'Elemental damage', regex: '\\d cfl.+da' },
  { section: 'Damage', label: 'Fire damage', regex: '\\d f.+da' },
  { section: 'Damage', label: 'Cold damage', regex: '\\d co.+da' },
  { section: 'Damage', label: 'Lightning damage', regex: '\\d l.+da' },
  { section: 'Damage', label: 'Chaos damage', regex: '\\d ch.+da' },
  // Mods
  { section: 'Mods', label: '+# Spirit', regex: 'spiri' },
  { section: 'Mods', label: 'Increased Rarity', regex: 'd rari' },
  { section: 'Mods', label: 'Attack speed', regex: 'ck spe' },
  { section: 'Mods', label: 'Cast speed', regex: 'st spe' },
  { section: 'Mods', label: 'Maximum Life', regex: '\\d.+life' },
  { section: 'Mods', label: 'Maximum Mana', regex: '\\d.+mana' },
  // Skill levels
  { section: 'Skill levels', label: '+# to skills (any)', regex: '^\\+.*ills$' },
  { section: 'Skill levels', label: '+# minion skills', regex: '^\\+.*ion skills$' },
  { section: 'Skill levels', label: '+# melee skills', regex: '^\\+.*ee skills$' },
  { section: 'Skill levels', label: '+# all spell skills', regex: '^\\+.*all sp.*ls$' },
  { section: 'Skill levels', label: '+# fire spell skills', regex: '^\\+.*re sp.*ls$' },
  { section: 'Skill levels', label: '+# cold spell skills', regex: '^\\+.*ld sp.*ls$' },
  { section: 'Skill levels', label: '+# lightning spell skills', regex: '^\\+.*ng sp.*ls$' },
  { section: 'Skill levels', label: '+# physical spell skills', regex: '^\\+.*al sp.*ls$' },
  { section: 'Skill levels', label: '+# projectile skills', regex: '^\\+.*ile skills$' },
  // Attributes
  { section: 'Attributes', label: 'Strength', regex: 'o (all a|str)' },
  { section: 'Attributes', label: 'Dexterity', regex: 'o (all a|d)' },
  { section: 'Attributes', label: 'Intelligence', regex: 'o (all a|int)' },
  // Item class
  { section: 'Item class', label: 'Amulets', regex: 's: am' },
  { section: 'Item class', label: 'Rings', regex: 's: ri' },
  { section: 'Item class', label: 'Belts', regex: 's: be' },
  { section: 'Item class', label: 'Wands', regex: 's: wa' },
  { section: 'Item class', label: 'One Hand Maces', regex: 's: on' },
  { section: 'Item class', label: 'Sceptres', regex: 's: sc' },
  { section: 'Item class', label: 'Bows', regex: 's: bow' },
  { section: 'Item class', label: 'Staves', regex: 's: st' },
  { section: 'Item class', label: 'Two Hand Maces', regex: 's: tw' },
  { section: 'Item class', label: 'Quarterstaves', regex: 's: qua' },
  { section: 'Item class', label: 'Spears', regex: 's: spe' },
  { section: 'Item class', label: 'Crossbows', regex: 's: cr' },
  { section: 'Item class', label: 'Talisman', regex: 's: tali' },
  { section: 'Item class', label: 'Gloves', regex: 's: gl' },
  { section: 'Item class', label: 'Boots', regex: 's: boo' },
  { section: 'Item class', label: 'Body Armours', regex: 's: bod' },
  { section: 'Item class', label: 'Helmets', regex: 's: he' },
  { section: 'Item class', label: 'Quivers', regex: 's: qui' },
  { section: 'Item class', label: 'Foci', regex: 's: fo' },
  { section: 'Item class', label: 'Shields', regex: 's: sh' },
];

export const VENDOR_OPTIONS: VendorOption[] = RAW.map((o, id) => ({ id, ...o }));

// Distinct section order for rendering.
export const VENDOR_SECTIONS: string[] = [...new Set(VENDOR_OPTIONS.map((o) => o.section))];

export function vendorOptionToCondition(o: VendorOption): SelectOption {
  return { id: o.id, name: o.label, regex: o.regex, ranges: [], value: null, isSelected: true };
}
