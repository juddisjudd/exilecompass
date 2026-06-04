// Best-effort reverse matching: turn a pasted query back into the grouped
// builder state for the active category. Each space-separated quoted AND-term
// becomes one group; `|` inside it becomes OR'd conditions. Recognised pieces
// map to catalog options/affixes; unrecognised pieces are kept verbatim as raw
// conditions (visible/removable in the group) so nothing is silently dropped.
// Bare `!word` tokens route to the exclude-keywords field.

import { defaultSettings, type ModGroup, type Settings } from './settings';
import type { SelectOption } from './types';
import type { WaystoneAffix, TabletAffix } from './loaders';
import { relicRegex } from './relicData';
import { VENDOR_OPTIONS, vendorOptionToCondition } from './vendorOptions';

type Affix = { id: number; name: string; regex: string; ranges: number[][] };

function tokenize(raw: string): { inner: string; negated: boolean }[] {
  const out: { inner: string; negated: boolean }[] = [];
  for (const match of raw.matchAll(/"([^"]+)"/g)) {
    let inner = match[1];
    const negated = inner.startsWith('!');
    if (negated) inner = inner.slice(1);
    out.push({ inner, negated });
  }
  return out;
}

// Bare (unquoted) `!word` exclusion tokens, e.g. the trailing `!block`.
function bareExcludes(raw: string): string {
  const outside = raw.replace(/"[^"]*"/g, ' ');
  const kws: string[] = [];
  for (const m of outside.matchAll(/(?:^|\s)!(\S+)/g)) kws.push(m[1]);
  return kws.join(' ');
}

// Split on top-level `|` only — `|` inside parentheses stays within its piece.
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ')') {
      depth--;
      cur += ch;
    } else if (ch === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

function affixToCondition(a: Affix): SelectOption {
  return { id: a.id, name: a.name, regex: a.regex, ranges: a.ranges, value: null, isSelected: true };
}

// Unique negative ids so raw conditions never collide with catalog/affix ids.
let rawId = -1;
function rawCondition(piece: string): SelectOption {
  return { id: rawId--, name: piece, regex: piece, ranges: [], value: null, isSelected: true };
}

// Build one group from a quoted term's inner text: each `|` piece becomes an
// affix condition (when it contains a known affix regex) or a raw condition.
function buildGroup(inner: string, affixes: Affix[], id: number): { group: ModGroup; matched: number } {
  const conditions: SelectOption[] = [];
  let matched = 0;
  for (const piece of splitTop(inner)) {
    const hit = [...affixes]
      .sort((a, b) => b.regex.length - a.regex.length)
      .find((a) => a.regex && piece.includes(a.regex));
    if (hit && !conditions.some((c) => c.id === hit.id)) {
      conditions.push(affixToCondition(hit));
      matched++;
    } else {
      conditions.push(rawCondition(piece));
    }
  }
  return { group: { id, conditions }, matched };
}

const vendorByRegex = (r: string) => VENDOR_OPTIONS.find((o) => o.regex === r);

// Decompose a vendor fragment into the atomic option regexes it represents
// (handles poe2.re's merged forms like `(fi|co).+res`, `y: (r|m)`, `\d+% i.+mov`).
// Returns null when the shape isn't recognised as a vendor fragment.
function decodeVendorFrag(frag: string): string[] | null {
  if (vendorByRegex(frag)) return [frag];
  let m: RegExpMatchArray | null;
  if (frag === 'resi') return ['fi.+res', 'co.+res', 'li.+res', 'ch.+res'];
  if ((m = frag.match(/^y: \(([rmn](?:\|[rmn])*)\)$/))) return m[1].split('|').map((c) => `y: ${c}`);
  if ((m = frag.match(/^\(((?:fi|co|li|ch)(?:\|(?:fi|co|li|ch))*)\)\.\+res$/)))
    return m[1].split('|').map((c) => `${c}.+res`);
  if (/% i\.\+mov$/.test(frag)) {
    const inner = frag.match(/^\(?(.+?)\)?% i\.\+mov$/)?.[1] ?? '';
    if (inner === '\\d+') return ['30% i.+mov', '25% i.+mov', '20% i.+mov', '15% i.+mov', '10% i.+mov'];
    const speeds: string[] = [];
    for (const part of splitTop(inner)) {
      let mm: RegExpMatchArray | null;
      if ((mm = part.match(/^\[(\d+)\]0$/))) for (const d of mm[1]) speeds.push(`${d}0% i.+mov`);
      else if ((mm = part.match(/^\[(\d+)\]5$/))) for (const d of mm[1]) speeds.push(`${d}5% i.+mov`);
      else if (/^\d0$/.test(part) || /^\d5$/.test(part)) speeds.push(`${part}% i.+mov`);
      else return null;
    }
    return speeds;
  }
  if ((m = frag.match(/^s: \(([a-z]{2,4}(?:\|[a-z]{2,4})*)\)$/))) return m[1].split('|').map((c) => `s: ${c}`);
  if ((m = frag.match(/^\\d (.+)\.\+da$/))) {
    const inner = m[1];
    if (inner === 'cfl') return ['\\d cfl.+da'];
    return inner.replace(/[()]/g, '').split('|').map((c) => `\\d ${c}.+da`);
  }
  if ((m = frag.match(/^o \(all a(?:\|([a-z|]+))?\)$/))) {
    return (m[1] ? m[1].split('|') : []).map((c) => `o (all a|${c})`);
  }
  return null;
}

export interface ImportData {
  waystone: WaystoneAffix[];
  tablet: TabletAffix[];
}

export function importRegex(
  category: keyof Settings,
  raw: string,
  settings: Settings,
  data: ImportData,
): { recognised: number; leftover: string } {
  rawId = -1;
  const fresh = defaultSettings();
  const tokens = tokenize(raw);
  const excludes = bareExcludes(raw);
  const leftover: string[] = [];
  let recognised = 0;
  let gid = 0;

  if (category === 'vendor') {
    const v = fresh.vendor;
    const groups: ModGroup[] = [];
    for (const { inner, negated } of tokens) {
      if (negated) {
        leftover.push(`"!${inner}"`);
        continue;
      }
      const conditions: SelectOption[] = [];
      for (const piece of splitTop(inner)) {
        const atoms = decodeVendorFrag(piece);
        if (atoms) {
          for (const a of atoms) {
            const opt = vendorByRegex(a);
            if (opt) {
              conditions.push(vendorOptionToCondition(opt));
              recognised++;
            } else {
              conditions.push(rawCondition(a));
            }
          }
        } else {
          conditions.push(rawCondition(piece));
        }
      }
      if (conditions.length) groups.push({ id: gid++, conditions });
    }
    if (groups.length) v.groups = groups;
    v.resultSettings.customText = leftover.join(' ');
    v.resultSettings.excludeKeywords = excludes;
    settings.vendor = v;
    return { recognised, leftover: leftover.join(' ') };
  }

  if (category === 'waystone') {
    const w = fresh.waystone;
    const groups: ModGroup[] = [];
    const outside = raw.replace(/"[^"]*"/g, ' ');
    if (/\bdelir/.test(outside)) {
      w.state.delirious = true;
      recognised++;
    }
    if (/(?:^|\s)!corr/.test(outside)) {
      w.state.uncorrupted = true;
      recognised++;
    } else if (/(?:^|\s)corr/.test(outside)) {
      w.state.corrupted = true;
      recognised++;
    }
    for (const { inner, negated } of tokens) {
      if (negated) {
        const built = buildGroup(inner, data.waystone, 0);
        const real = built.group.conditions.filter((c) => (c.id ?? -1) >= 0);
        if (real.length) {
          w.modifier.unwantedMods.push(...real);
          recognised += real.length;
        } else {
          leftover.push(`"!${inner}"`);
        }
        continue;
      }
      const built = buildGroup(inner, data.waystone, gid);
      if (built.matched > 0) {
        groups.push(built.group);
        recognised += built.matched;
        gid++;
      } else {
        leftover.push(`"${inner}"`); // tier / quantifiers — preserved verbatim
      }
    }
    if (groups.length) w.groups = groups;
    w.resultSettings.customText = leftover.join(' ');
    w.resultSettings.excludeKeywords = excludes;
    settings.waystone = w;
    return { recognised, leftover: leftover.join(' ') };
  }

  if (category === 'tablet') {
    const t = fresh.tablet;
    const groups: ModGroup[] = [];
    const typeFrag: Record<string, keyof Settings['tablet']['type']> = {
      eac: 'breach',
      liri: 'delirium',
      rra: 'irradiated',
      xped: 'expedition',
      tual: 'ritual',
      eer: 'overseer',
    };
    for (const { inner } of tokens) {
      let m: RegExpMatchArray | null;
      if ((m = inner.match(/^y: \(?([nm](?:\|[nm])*)\)?$/))) {
        for (const c of m[1].split('|')) {
          if (c === 'n') t.rarity.normal = true;
          if (c === 'm') t.rarity.magic = true;
        }
        recognised++;
        continue;
      }
      if (/ us$/.test(inner)) {
        t.modifier.usesRemaining = true;
        recognised++;
        continue;
      }
      const pieces = splitTop(inner.replace(/^\(|\)$/g, ''));
      if (pieces.length && pieces.every((p) => typeFrag[p])) {
        for (const p of pieces) t.type[typeFrag[p]] = true;
        recognised++;
        continue;
      }
      const built = buildGroup(inner, data.tablet, gid);
      if (built.matched > 0) {
        groups.push(built.group);
        recognised += built.matched;
        gid++;
      } else {
        leftover.push(`"${inner}"`);
      }
    }
    if (groups.length) t.groups = groups;
    t.resultSettings.customText = leftover.join(' ');
    t.resultSettings.excludeKeywords = excludes;
    settings.tablet = t;
    return { recognised, leftover: leftover.join(' ') };
  }

  // relic
  const r = fresh.relic;
  const relicOpts: Affix[] = relicRegex.map((e, i) => ({
    id: i,
    name: e.name,
    regex: e.regex,
    ranges: e.ranges,
  }));
  const groups: ModGroup[] = [];
  for (const { inner } of tokens) {
    const built = buildGroup(inner, relicOpts, gid);
    if (built.matched > 0) {
      groups.push(built.group);
      recognised += built.matched;
      gid++;
    } else {
      leftover.push(`"${inner}"`);
    }
  }
  if (groups.length) r.groups = groups;
  r.resultSettings.customText = leftover.join(' ');
  r.resultSettings.excludeKeywords = excludes;
  settings.relic = r;
  return { recognised, leftover: leftover.join(' ') };
}
