// Affix parsing + option-to-regex helpers. Ported from poe2.re
// (src/lib/parseAffixToken.ts + src/lib/SelectedOptionRegex.ts).

import { generateNumberRegex } from './numberRegex';
import type { ParsedAffix, SelectOption, Token } from './types';

export function parseAffixToken<T>(token: Token<T>): ParsedAffix {
  const ranges: number[][] = [];
  const values: number[] = [];

  const lines = token.rawText.split("\n");
  const processed = lines.map((line) => {
    let out = line;
    out = out.replace(/\(([+-]?\d+)-([+-]?\d+)\)/g, (_match, a, b) => {
      ranges.push([Number(a), Number(b)]);
      return "##";
    });
    out = out.replace(/(?<![A-Za-z0-9])\+?(\d+)(?![A-Za-z0-9])/g, (_match, n) => {
      values.push(Number(n));
      return "#";
    });
    out = out.replace(/\[([^\]]+)\]/g, "$1");
    return out;
  });

  return {
    id: token.id,
    name: processed.join("|"),
    regex: token.regex,
    values,
    ranges,
  };
}

// Builds the regex fragment for a selected option. When the user entered a
// minimum value, prefix the affix regex with a generated number-range regex.
export function selectedOptionRegex(option: SelectOption, round10: boolean): string {
  if (option.value) {
    return `${generateNumberRegex(option.value.toString(), round10)}.*${option.regex}`;
  } else {
    return option.regex;
  }
}
