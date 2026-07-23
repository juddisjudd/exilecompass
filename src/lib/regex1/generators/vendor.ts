// Ported near-verbatim from poe-vendor-string's src/utils/OutputString.ts.
// This is a flat-OR model (unlike PoE2's AND-across-groups builder) — every
// selected toggle across every sub-category folds into one alternation, then
// gets wrapped in a single pair of quotes if it ends up containing a space or
// a literal `"`. The `s:`/`ts:` prefixes are reverse-engineered PoE search
// field markers matched against internal item search text; don't try to
// "clean up" or regenerate them.
import type { GemToken } from '../types';
import type { VendorSettings } from '../settings';

export function addExpression(str: string, textToAdd: string | undefined): string {
  if (textToAdd === undefined || textToAdd.length === 0) return str;
  return str.length === 0 ? textToAdd : `${str}|${textToAdd}`;
}

function twoAndAny(c: string): string {
  return `${c}-${c}-|-${c}-${c}|${c}-[rgb]-${c}`;
}

function twoAndOne(b: string, s2: string): string {
  return `${b}-${b}-${s2}|${b}-${s2}-${b}|${s2}-${b}-${b}`;
}

function oneAndAnyAny(c: string): string {
  return `.-.-${c}|.-${c}-.|${c}-.-.`;
}

function generate6Socket(s: VendorSettings): string {
  return s.anySixSocket ? '(\\w\\W){5}' : '';
}

function generate3LinkStr(s: VendorSettings): string {
  const { rrr, ggg, bbb, rrg, rrb, ggr, ggb, bbr, bbg, rgb, rrA, ggA, bbA, raa, baa, gaa } = s.colors;
  let result = '';
  if (s.anyThreeLink) return addExpression(result, '-\\w-');
  if (rrr) result = addExpression(result, 'r-r-r');
  if (ggg) result = addExpression(result, 'g-g-g');
  if (bbb) result = addExpression(result, 'b-b-b');
  if (rrA) result = addExpression(result, twoAndAny('r'));
  if (ggA) result = addExpression(result, twoAndAny('g'));
  if (bbA) result = addExpression(result, twoAndAny('b'));
  if (rrg) result = addExpression(result, twoAndOne('r', 'g'));
  if (rrb) result = addExpression(result, twoAndOne('r', 'b'));
  if (ggb) result = addExpression(result, twoAndOne('g', 'b'));
  if (ggr) result = addExpression(result, twoAndOne('g', 'r'));
  if (bbg) result = addExpression(result, twoAndOne('b', 'g'));
  if (bbr) result = addExpression(result, twoAndOne('b', 'r'));
  if (rgb) result = addExpression(result, ':.*(?=\\S*r)(?=\\S*g)(?=\\S*b)');
  if (raa) result = addExpression(result, oneAndAnyAny('r'));
  if (gaa) result = addExpression(result, oneAndAnyAny('g'));
  if (baa) result = addExpression(result, oneAndAnyAny('b'));
  return result;
}

function generate4LinkStr(s: VendorSettings): string {
  return s.anyFourLink ? '-\\w-.-' : '';
}
function generate5LinkStr(s: VendorSettings): string {
  return s.anyFiveLink ? '(-\\w){4}' : '';
}
function generate6LinkStr(s: VendorSettings): string {
  return s.anySixLink ? '(-\\w){5}' : '';
}

function generateAnyColoredLinkStr(s: VendorSettings): string {
  if (s.anyTwoColorLink) return '[rgb]-[rgb]';
  if (s.anyThreeColorLink) return '([rgb]-){2}[rgb]';
  if (s.anyFourColorLink) return '([rgb]-){3}[rgb]';
  if (s.anyFiveColorLink) return '([rgb]-){4}[rgb]';
  if (s.anySixColorLink) return '([rgb]-){5}[rgb]';
  return '';
}

function generateSpecLinkStr(s: VendorSettings): string {
  if (!s.colors.specLink) return '';
  const { r, g, b } = s.colors.specLinkColors;
  if ((r === 0 || r === undefined) && (g === 0 || g === undefined) && (b === 0 || b === undefined)) return '';
  const lastColor = b === 0 && g === 0 ? 'r' : b === 0 ? 'g' : 'b';
  let result = 'ts:.+';
  if (r && r > 0) result += lastColor === 'r' ? `(\\S*r){${r}}` : `(?=(\\S*r){${r}})`;
  if (g && g > 0) result += lastColor === 'g' ? `(\\S*g){${g}}` : `(?=(\\S*g){${g}})`;
  if (b && b > 0) result += `(\\S*b){${b}}`;
  return result;
}

function generate2Link(s: VendorSettings): string {
  const { rr, gg, bb, rb, gr, bg } = s.colors;
  let result = '';
  if (s.anyTwoLink) result = addExpression(result, '"ts:.*\\w-"');
  if (rr) result = addExpression(result, 'r-r');
  if (gg) result = addExpression(result, 'g-g');
  if (bb) result = addExpression(result, 'b-b');
  if (rb) result = addExpression(result, 'r-b|b-r');
  if (gr) result = addExpression(result, 'g-r|r-g');
  if (bg) result = addExpression(result, 'b-g|g-b');
  return result;
}

function simplifyRBG(result: string): string {
  return result.replace(/([rgb])-(\[rgb])-([rgb])/g, '$1-.-$3');
}

// r-r-r|g-g-g|r-r-g|r-g-r|g-r-r|g-g-r|g-r-g|r-g-g -> [rg]-[rg]-[rg]
function simplifyABABAB(result: string, c: string, c2: string): string {
  let r = result;
  const search1 = `${c}-${c}-${c}|${c2}-${c2}-${c2}|${c}-${c}-${c2}|${c}-${c2}-${c}|${c2}-${c}-${c}|${c2}-${c2}-${c}|${c2}-${c}-${c2}|${c}-${c2}-${c2}`;
  const searchTerms = search1.split('|');
  if (searchTerms.every((v) => result.includes(v))) {
    const shortened = `[${c}${c2}]-[${c}${c2}]-[${c}${c2}]`;
    r = r.split('|').filter((v) => !searchTerms.some((t) => v === t)).join('|');
    r = addExpression(r, shortened);
  }
  return r;
}

// r-r-g|r-g-r|g-r-r|r-r-b|r-b-r|b-r-r -> r-r-[gb]|r-[gb]-r|[gb]-r-r
function simplifyCCACCB(result: string, c: string, c2: string, c3: string): string {
  let r = result;
  const search1 = `${c}-${c}-${c2}|${c}-${c2}-${c}|${c2}-${c}-${c}`;
  const search2 = `${c}-${c}-${c3}|${c}-${c3}-${c}|${c3}-${c}-${c}`;
  if (result.includes(search1) && result.includes(search2)) {
    r = r.split('|').filter((v) => !v.match(`${search1}|${search2}`)).join('|');
    r = addExpression(r, `${c}-${c}-[${c2}${c3}]|${c}-[${c2}${c3}]-${c}|[${c2}${c3}]-${c}-${c}`);
  }
  return r;
}

// g-g-g|g-g-r|g-r-g|r-g-g -> g-g-r|g-[rg]-g|r-g-g
function simplifyCCCWhenCCB(result: string, c: string, c2: string): string {
  let r = result;
  const search1 = `${c}-${c}-${c}`;
  const search2 = `${c}-${c}-${c2}|${c}-${c2}-${c}|${c2}-${c}-${c}`;
  if (result.includes(search1) && result.includes(search2)) {
    r = r.split('|').filter((v) => !v.match(`${search1}|${search2}`)).join('|');
    r = addExpression(r, `${c}-${c}-${c2}|${c}-[${c}${c2}]-${c}|${c2}-${c}-${c}`);
  }
  return r;
}

// r-r-g|r-g-r|g-r-r|g-g-r|g-r-g|g-g-r -> g-[gr]-r|r-[gr]-g|g-r-g|r-g-r
function simplifyTwoAndTwo(result: string, c: string, c2: string): string {
  let r = result;
  const search1 = `${c}-${c}-${c2}|${c}-${c2}-${c}|${c2}-${c}-${c}`;
  const search2 = `${c2}-${c2}-${c}|${c2}-${c}-${c2}|${c}-${c2}-${c2}`;
  if (result.includes(search1) && result.includes(search2)) {
    r = r.split('|').filter((v) => !v.match(`${search1}|${search2}`)).join('|');
    r = addExpression(r, `${c}-[${c}${c2}]-${c2}|${c2}-[${c}${c2}]-${c}|${c}-${c2}-${c}|${c2}-${c}-${c2}`);
  }
  return r;
}

// r-r-r|r-r-|-r-r|r-[rgb]-r -> r-r-|-r-r|r-[rgb]-r
function removeCCCWhenCCA(result: string, c: string, c2: string, c3: string): string {
  let r = result;
  if (result.includes(`${c}-${c}-|-${c}-${c}|${c}-[rgb]-${c}`)) {
    const replaceStr = `${c}-${c}-${c}|${c}-${c}-[${c2}${c3}]|[${c2}${c3}]-${c}-${c}|${c}-[${c2}${c3}]-${c}`;
    r = r.split('|').filter((v) => !v.match(new RegExp(replaceStr))).join('|');
  }
  return r;
}

// r-r-r|r-r-g|r-b-r|g-r-r|r-r-b|r-b-r|... -> r-r-|-r-r|r-[rgb]-r
function simplifyThreeAndTwoAndAny(result: string, c: string, c2: string, c3: string): string {
  let r = result;
  if (result.includes(`${c}-${c}-${c}`) && result.includes(`${c}-${c}-${c2}`) && result.includes(`${c}-${c}-${c3}`)) {
    const replaceStr = `${c}-${c}-${c}|${c}-${c}-${c2}|${c}-${c2}-${c}|${c2}-${c}-${c}|${c}-${c}-${c3}|${c}-${c3}-${c}|${c3}-${c}-${c}|${c}-${c}-|-${c}-${c}|${c}-[rgb]-${c}`;
    r = r.split('|').filter((v) => !v.match(new RegExp(replaceStr))).join('|');
    r = addExpression(r, twoAndAny(c));
  }
  return r;
}

function simplify(search: string): string {
  let result = search;
  if (result.includes('|-[rgb]-|') || result.startsWith('-[rgb]-|')) return '-[rgb]-';

  result = simplifyABABAB(result, 'g', 'r');
  result = simplifyABABAB(result, 'g', 'b');
  result = simplifyABABAB(result, 'r', 'g');
  result = simplifyABABAB(result, 'r', 'b');
  result = simplifyABABAB(result, 'b', 'r');
  result = simplifyABABAB(result, 'b', 'g');

  result = removeCCCWhenCCA(result, 'r', 'g', 'b');
  result = removeCCCWhenCCA(result, 'g', 'b', 'r');
  result = removeCCCWhenCCA(result, 'b', 'r', 'g');

  result = simplifyCCACCB(result, 'r', 'g', 'b');
  result = simplifyCCACCB(result, 'g', 'r', 'b');
  result = simplifyCCACCB(result, 'b', 'r', 'g');

  result = simplifyTwoAndTwo(result, 'g', 'r');
  result = simplifyTwoAndTwo(result, 'r', 'b');
  result = simplifyTwoAndTwo(result, 'b', 'g');

  result = simplifyThreeAndTwoAndAny(result, 'r', 'g', 'b');
  result = simplifyThreeAndTwoAndAny(result, 'g', 'r', 'b');
  result = simplifyThreeAndTwoAndAny(result, 'b', 'g', 'r');

  result = simplifyCCCWhenCCB(result, 'g', 'r');
  result = simplifyCCCWhenCCB(result, 'g', 'b');
  result = simplifyCCCWhenCCB(result, 'b', 'r');
  result = simplifyCCCWhenCCB(result, 'b', 'g');
  result = simplifyCCCWhenCCB(result, 'r', 'g');
  result = simplifyCCCWhenCCB(result, 'r', 'b');

  const unique = Array.from(new Set(result.split('|')));
  return unique.join('|');
}

function movementStr(s: VendorSettings): string {
  const { ten, fifteen } = s.movement;
  let result = '';
  if (ten) result = addExpression(result, 'Runn');
  if (fifteen) result = addExpression(result, 'rint');
  return result;
}

function plusGemsStr(s: VendorSettings): string {
  const { lightning, chaos, cold, fire, phys, any } = s.plusGems;
  if (any || (lightning && chaos && cold && fire && phys)) return '"ll g"';
  let result = '';
  if (fire) result = addExpression(result, 'me Sh');
  if (cold) result = addExpression(result, 'singe');
  if (lightning) result = addExpression(result, 'derha');
  if (chaos) result = addExpression(result, 'Lord');
  if (phys) result = addExpression(result, 'Litho');
  return result;
}

function generateWeaponDamage(s: VendorSettings): string {
  const { phys, firemult, coldmult, chaosmult } = s.damage;
  let result = '';
  if (phys) result = addExpression(result, 'Glint|Heav');
  if (firemult) result = addExpression(result, 'Earn');
  if (coldmult) result = addExpression(result, 'Incl');
  if (chaosmult) result = addExpression(result, 'Wani');
  return result;
}

function generateWeaponType(s: VendorSettings): string {
  const { sceptre, mace, axe, sword, bow, claw, dagger, staff, wand, shield } = s.weapon;
  let result = '';
  if (sceptre) result = addExpression(result, 'sc');
  if (mace) result = addExpression(result, 'mac');
  if (axe) result = addExpression(result, 'ax');
  if (sword) result = addExpression(result, 'sw');
  if (bow) result = addExpression(result, 'bow');
  if (claw) result = addExpression(result, 'cl');
  if (dagger) result = addExpression(result, 'da');
  if (staff) result = addExpression(result, 'stave');
  if (wand) result = addExpression(result, 'wa');
  if (shield) result = addExpression(result, 'sh');
  if (result.includes('|')) return `s:.+(${result})`;
  if (result) return `s:.+${result}`;
  return '';
}

function generateGems(s: VendorSettings, gemTokens: GemToken[]): string {
  if (!s.gems.length) return '';
  const tokensById = new Map(gemTokens.map((t) => [t.id, t.regex]));
  const gems = s.gems.map((id) => tokensById.get(id)).filter((e): e is string => e !== undefined);
  if (gems.length === 0) return '';
  return gems.reduce((expr, gemKey) => addExpression(expr, gemKey));
}

export function generateVendorRegex(s: VendorSettings, gemTokens: GemToken[]): string {
  let result = '';
  result = addExpression(result, generate6Socket(s));
  result = addExpression(result, generateAnyColoredLinkStr(s));
  result = addExpression(result, generate4LinkStr(s));
  result = addExpression(result, generate5LinkStr(s));
  result = addExpression(result, generate6LinkStr(s));
  result = addExpression(result, generateSpecLinkStr(s));
  result = addExpression(result, simplify(generate3LinkStr(s)));
  result = addExpression(result, generate2Link(s));
  result = addExpression(result, movementStr(s));
  result = addExpression(result, plusGemsStr(s));
  result = addExpression(result, generateWeaponDamage(s));
  result = addExpression(result, generateWeaponType(s));
  result = addExpression(result, generateGems(s, gemTokens));
  result = simplifyRBG(result);
  if (result.match('"| ')) {
    result = result.replaceAll('"', '');
    result = `"${result}"`;
  }
  return result;
}

export function generateVendorWarnings(s: VendorSettings, gemTokens: GemToken[]): string[] {
  const warnings: string[] = [];
  if (plusGemsStr(s) && s.weapon.wand) {
    warnings.push('All wands will be displayed [conflict: +1 wand & weapon base=wand].');
  }
  const usesVendorGems = !!generateGems(s, gemTokens);
  if (usesVendorGems && generateWeaponType(s)) {
    warnings.push('Undesired gems will be displayed [conflict: weapon types & vendor gems]');
  }
  if (usesVendorGems && s.damage.phys) {
    warnings.push('Heavy Strike will be displayed [conflict: phys damage & vendor gems]');
  }
  return warnings;
}
