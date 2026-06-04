// Shared types for the regex builder. Ported from poe2.re
// (src/types/generated/RegexResult.ts + src/components/selectList/SelectList.tsx).

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
