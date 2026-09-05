// Rare-item mod query. Ported from poe.re's poe2/src/pages/item/ItemResult.ts.
// Selected mods are keyed `${baseType}::${category}::${desc}` and
// scoped to the chosen base type; each numeric slot the user fills becomes a
// bounded "(min-max)"-anchored value regex, so "Adds 20 to # Physical Damage"
// only matches rolls of at least 20.
import { formatExcludes, type Settings } from '../settings';
import { generateBoundedValueRegex } from '../numberRegex';
import type { ItemModifier, ItemRegex } from '../types';

export function itemModKey(baseType: string, category: string, mod: ItemModifier): string {
  return `${baseType}::${category}::${mod.desc}`;
}

function modsForBase(data: ItemRegex[], baseType: string): Map<string, ItemModifier> {
  const map = new Map<string, ItemModifier>();
  const entry = data.find((e) => e.basetype === baseType);
  for (const cat of entry?.categoryRegex ?? []) {
    for (const mod of cat.modifiers) map.set(itemModKey(baseType, cat.category, mod), mod);
  }
  return map;
}

function modRegex(mod: ItemModifier, values: Record<number, string>): string {
  const has = (i: number) => values[i] !== undefined && values[i] !== '';
  const bounded = (i: number) =>
    generateBoundedValueRegex(values[i], mod.stats[i]?.max !== undefined ? String(mod.stats[i].max) : '', false);

  const onIndex = mod.on[0];
  const regex =
    onIndex !== undefined && has(onIndex) ? mod.regex.replace('\\d+', `${bounded(onIndex)}.*`) : mod.regex;
  const before = mod.before.filter(has).map(bounded).join('.*');
  const after = mod.after.filter(has).map(bounded).join('.*');
  return [before, regex, after].filter((s) => s !== '').join('.*');
}

export function generateItemRegex(settings: Settings, data: ItemRegex[] | null): string {
  const s = settings.item;
  let body = '';
  if (s.base && data) {
    const mods = modsForBase(data, s.base.baseType);
    const parts = Object.entries(s.selected)
      .filter(([, on]) => on)
      .map(([key]) => ({ key, mod: mods.get(key) }))
      .filter((e): e is { key: string; mod: ItemModifier } => e.mod !== undefined)
      .map((e) => modRegex(e.mod, s.values[e.key] ?? {}));
    if (parts.length > 0) {
      body = s.matchAnyMod ? `"${parts.join('|')}"` : parts.map((p) => `"${p}"`).join(' ');
    }
  }
  return [body, s.resultSettings.customText || null, formatExcludes(s.resultSettings.excludeKeywords) || null]
    .filter((e): e is string => e !== null && e !== '')
    .join(' ')
    .trim();
}
