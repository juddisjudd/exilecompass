// Per-category settings shape + defaults. Originally ported from poe2.re, now
// reorganised around an N-group model: each category's mod/affix selection is a
// list of groups, OR'd within a group and AND'd across groups. Structural terms
// (tier, rarity, type, levels, …) stay as automatic AND terms. `customText` and
// `excludeKeywords` append free-form regex / `!kw` exclusions.

import type { SelectOption } from './types';

export type Category = 'vendor' | 'waystone' | 'tablet' | 'relic';

// OR within a group; groups are AND'd together.
export interface ModGroup {
  id: number;
  conditions: SelectOption[];
}

export interface ResultSettings {
  customText: string;
  // Space/comma-separated keywords emitted as trailing `!term` exclusions,
  // e.g. "block ward" -> `... !block !ward`. Hides any item containing them.
  excludeKeywords: string;
}

export interface Settings {
  vendor: {
    resultSettings: ResultSettings;
    groups: ModGroup[];
    itemLevel: { min: number; max: number };
    characterLevel: { min: number; max: number };
  };
  waystone: {
    resultSettings: ResultSettings;
    groups: ModGroup[];
    tier: { min: number; max: number };
    state: { corrupted: boolean; uncorrupted: boolean; delirious: boolean };
    modifier: {
      round10: boolean;
      unwantedMods: SelectOption[];
    };
    itemRarity: string;
    itemQuantity: string;
    waystoneDropChance: string;
    magicMonsters: string;
    rareMonsters: string;
  };
  tablet: {
    resultSettings: ResultSettings;
    groups: ModGroup[];
    rarity: { normal: boolean; magic: boolean };
    type: {
      breach: boolean;
      delirium: boolean;
      irradiated: boolean;
      expedition: boolean;
      ritual: boolean;
      overseer: boolean;
    };
    modifier: {
      usesRemaining: boolean;
      numUsesRemaining: number;
      round10: boolean;
    };
  };
  relic: {
    resultSettings: ResultSettings;
    groups: ModGroup[];
  };
}

const defaultResultSettings = (): ResultSettings => ({ customText: '', excludeKeywords: '' });

const initialGroups = (): ModGroup[] => [{ id: 0, conditions: [] }];

// Turn the user's free-form exclude list (space/comma separated) into trailing
// negation tokens, e.g. "block ward" -> `!block !ward`.
export function formatExcludes(raw: string): string {
  return raw
    .split(/[\s,]+/)
    .map((w) => w.replace(/^!+/, '').trim())
    .filter((w) => w.length > 0)
    .map((w) => `!${w}`)
    .join(' ');
}

export function defaultSettings(): Settings {
  return {
    vendor: {
      resultSettings: defaultResultSettings(),
      groups: initialGroups(),
      itemLevel: { min: 0, max: 0 },
      characterLevel: { min: 0, max: 0 },
    },
    waystone: {
      resultSettings: defaultResultSettings(),
      groups: initialGroups(),
      tier: { min: 1, max: 16 },
      state: { corrupted: false, uncorrupted: false, delirious: false },
      modifier: { round10: true, unwantedMods: [] },
      itemQuantity: '',
      itemRarity: '',
      magicMonsters: '',
      rareMonsters: '',
      waystoneDropChance: '',
    },
    tablet: {
      resultSettings: defaultResultSettings(),
      groups: initialGroups(),
      rarity: { normal: false, magic: false },
      type: {
        breach: false,
        delirium: false,
        irradiated: false,
        expedition: false,
        ritual: false,
        overseer: false,
      },
      modifier: { usesRemaining: false, numUsesRemaining: 10, round10: true },
    },
    relic: {
      resultSettings: defaultResultSettings(),
      groups: initialGroups(),
    },
  };
}

// Shared helper: render the grouped mods as AND-joined quoted OR-groups.
// `optionRegex` lets callers apply value/round10 handling (relic passes round10=false).
export function groupsToTerms(
  groups: ModGroup[],
  optionRegex: (o: SelectOption) => string,
): string[] {
  return groups
    .map((g) => g.conditions.map(optionRegex).filter((s) => s !== '').join('|'))
    .filter((s) => s !== '')
    .map((s) => `"${s}"`);
}
