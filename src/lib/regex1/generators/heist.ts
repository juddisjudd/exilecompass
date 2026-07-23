// Ported verbatim from poe-vendor-string's src/pages/heist/Heist.tsx generator
// functions. Heist emits real regex metacharacters unquoted (`.*`, `[3-5]`) —
// a different quoting philosophy than Vendor/Expedition's literal-substring
// approach, so don't reuse those categories' quoting helpers here.
import type { HeistData } from '../types';
import type { HeistSettings } from '../settings';

function addExpression(str: string, textToAdd: string | undefined): string {
  if (textToAdd === undefined || textToAdd.length === 0) return str;
  return str.length === 0 ? textToAdd : `${str}|${textToAdd}`;
}

function levelRegex(start: number, end: number): string {
  if (end === 0) end = 5;
  if (start === 0) start = 1;
  if (start <= 1 && end >= 5) return '';
  const prefix = '.*';
  if (start === end) return `${prefix}${start}`;
  if (end - start === 1) return `${prefix}[${start}${end}]`;
  return `${prefix}[${start}-${end}]`;
}

function generateContractResultStr(data: HeistData, contractLevels: HeistSettings['contractLevels']): string {
  const selected = Object.entries(contractLevels).filter(([, v]) => v.start > 0 || v.end > 0);
  return selected
    .map(([name, v]) => {
      const type = data.heistContractTypes[name];
      if (!type) return '';
      return type.matchSafe + levelRegex(v.start, v.end);
    })
    .filter((s) => s !== '')
    .join('|');
}

function targetValueRegex(data: HeistData, value: number): string {
  if (value === 0) return '';
  const matches = Object.values(data.heistTargetValues)
    .filter((v) => v.coinValue > value)
    .map((v) => v.matchSafe)
    .join('|');
  return `t:.*(${matches})`;
}

export function generateHeistRegex(data: HeistData, settings: HeistSettings): string {
  const contractStr = generateContractResultStr(data, settings.contractLevels);
  const valueStr = targetValueRegex(data, settings.targetValue);
  if (settings.requireCoinValue) {
    return `${contractStr} ${valueStr}`.trim();
  }
  return addExpression(contractStr, valueStr);
}

// The two "Gianna" presets from Heist.tsx — farming-route shortcuts for that
// contact's specific job-level requirements, not general presets.
export const GIANNA_PRESET: Record<string, { start: number; end: number }> = {
  Deception: { start: 1, end: 5 },
  Perception: { start: 1, end: 2 },
  'Counter-Thaumaturgy': { start: 1, end: 3 },
};
export const GIANNA_PLUS_ONE_PRESET: Record<string, { start: number; end: number }> = {
  Deception: { start: 1, end: 6 },
  Perception: { start: 1, end: 3 },
  'Counter-Thaumaturgy': { start: 1, end: 4 },
};
