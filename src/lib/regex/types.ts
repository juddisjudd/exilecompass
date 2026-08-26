// Shared types for the regex builder. Ported from poe.re
// (poe2/src/types/generated/RegexResult.ts + poe2/src/components/SelectList.tsx).

export interface Token<T = Record<string, never>> {
  id: number;
  regex: string;
  rawText: string;
  generalizedText: string;
  options: T;
}

export interface RegexResult<T = Record<string, never>> {
  tokens: Token<T>[];
}

export interface ParsedAffix {
  id: number;
  name: string;
  regex: string;
  values: number[];
  ranges: number[][];
}

// A single selectable modifier option. `value` is the user-entered minimum
// threshold (null when unset). `isSelected` toggles inclusion in the output.
export interface SelectOption {
  id?: number;
  name: string;
  value: number | null;
  isSelected: boolean;
  ranges: number[][];
  regex: string;
}
// Rare-item mod data (poe.re poe2/src/types/generated/ItemTypedef.ts), served
// from static/generated/Generated.Item.min.json + Generated.Basetypes.Item.min.json.
export interface ItemStat {
  id: string;
  min: number;
  max: number;
  numberIndex: number;
  hasRange: boolean;
}

// Which `#` slots of `description` sit before / inside / after the regex
// fragment (index into `stats`); `disabled` slots can't take a value.
export interface ItemRegexPosition {
  start: number;
  end: number;
  disabled: number[];
  before: number[];
  on: number[];
  after: number[];
}

export interface ItemModifier {
  description: string;
  regex: string;
  stats: ItemStat[];
  regexPosition: ItemRegexPosition;
  affixes: { description: string; name: string }[];
  affixType: 'PREFIX' | 'SUFFIX';
}

export interface ItemRegexCategory {
  modCategory: string;
  baseitems: string[];
  modifiers: ItemModifier[];
  warnings?: string[];
}

export interface ItemRegex {
  basetype: string;
  itemRegexForCategory: ItemRegexCategory[];
}

export interface ItemBasetype {
  base: string;
  item: string[];
}
