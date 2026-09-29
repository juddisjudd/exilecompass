// Ported from poe.re's poe/src/pages/gems/GemsOutput.ts.
import { generateNumberRangeRegex } from '$lib/regex/numberRegex';
import type { GemToken } from '../types';
import { appendResultExtras, type GemsSettings } from '../settings';

function boundedValue(value: string, low: number, high: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return low;
  return Math.max(low, Math.min(high, parsed));
}

function rangeRegex(min: string, max: string, low: number, high: number, prefix: string, suffix = ''): string {
  const start = boundedValue(min, low, high);
  const end = boundedValue(max, low, high);
  if (end < start) return '';
  return `${prefix}${generateNumberRangeRegex(String(start), String(end), false)}${suffix}`;
}

export function generateGemsRegex(gemTokens: GemToken[], s: GemsSettings): string {
  const names = gemTokens.filter((g) => s.selected.includes(g.id)).map((g) => g.regex);
  const nameRegex = names.length === 0 ? '' : names.length === 1 ? names[0] : `"${names.join('|')}"`;
  const levelValueRegex = rangeRegex(s.levelMin, s.levelMax, 1, 21, 'level: ');
  const qualityValueRegex = rangeRegex(s.qualityMin, s.qualityMax, 0, 23, 'quality: \\+', '%');
  const levelRegex = s.levelEnabled && levelValueRegex ? `"${levelValueRegex}"` : '';
  const qualityRegex = s.qualityEnabled && qualityValueRegex ? `"${qualityValueRegex}"` : '';
  return appendResultExtras([nameRegex, levelRegex, qualityRegex].filter(Boolean).join(' '), s.resultSettings);
}
