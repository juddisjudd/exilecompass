import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PobGem {
  name: string;
  type: 'skill' | 'support' | 'spirit';
}

export interface PobSkillGroup {
  mainSkill: string;
  /** Type of the active (first) gem — skill gems and spirit gems (heralds,
   *  auras, …) can both head a link, and need to be told apart visually. */
  mainType: PobGem['type'];
  supports: PobGem[];
}

export interface PobItem {
  slot: string;
  name: string;
  base: string;
  rarity: 'Normal' | 'Magic' | 'Rare' | 'Unique';
  mods: string[];
  corrupted: boolean;
  quality?: number;
  itemLevel?: number;
  requirements?: { level?: number; str?: number; dex?: number; int?: number };
}

/** A named skill set (one tab of skill gem links in PoB). */
export interface PobSkillSet {
  id: string;
  name: string;
  skillGroups: PobSkillGroup[];
}

/** A named item set (one equipment loadout in PoB). */
export interface PobItemSet {
  id: string;
  name: string;
  items: PobItem[];
}

export interface PobBuild {
  className: string;
  ascendClassName: string;
  level: number;
  buildName?: string;       // present for GGG .build imports (has a build name)
  source?: 'pob' | 'ggg';
  // Skill sets and item sets are independent dimensions in PoB — a build can
  // have a different number of each, switched separately.
  skillSets: PobSkillSet[];
  itemSets: PobItemSet[];
  activeSkillSet: number; // index into skillSets
  activeItemSet: number;  // index into itemSets
  notes: string;
  importedAt: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const POB_STORAGE_KEY = 'EXILECOMPASS_POB_BUILD_V1';

const POBB_IN = /^https?:\/\/pobb\.in\/([A-Za-z0-9_-]+)/i;
const SPIRIT_KEYWORDS = ['aura', 'herald', 'banner', 'aspect', 'offering', 'manifestation', 'warcry'];

// Canonical slot keys + display order for the equipment grid. Both the PoB and
// GGG parsers normalise their own slot names to these keys.
export const SLOT_ORDER = [
  'weapon1', 'offhand', 'weapon2',
  'helm', 'body',
  'gloves', 'boots',
  'amulet', 'ring1', 'ring2', 'belt',
  'flask1', 'flask2', 'flask3',
  'charm1', 'charm2', 'charm3',
  'trinket',
] as const;

export const SLOT_LABEL: Record<string, string> = {
  weapon1: 'Main Hand', offhand: 'Off Hand', weapon2: 'Swap',
  helm: 'Head', body: 'Body', gloves: 'Gloves', boots: 'Boots',
  amulet: 'Amulet', ring1: 'Ring L', ring2: 'Ring R', belt: 'Belt',
  flask1: 'Flask 1', flask2: 'Flask 2', flask3: 'Flask 3',
  charm1: 'Charm 1', charm2: 'Charm 2', charm3: 'Charm 3',
  trinket: 'Trinket',
};

// PoB <Slot name="..."> → canonical key
const POB_SLOT_MAP: Record<string, string> = {
  'Weapon 1': 'weapon1', 'Weapon 2': 'offhand',
  'Helm': 'helm', 'Body Armour': 'body', 'Gloves': 'gloves', 'Boots': 'boots',
  'Amulet': 'amulet', 'Ring 1': 'ring1', 'Ring 2': 'ring2', 'Belt': 'belt',
  'Flask 1': 'flask1', 'Flask 2': 'flask2', 'Flask 3': 'flask3',
  'Trinket': 'trinket',
};

// GGG inventory_id → canonical key
const GGG_SLOT_MAP: Record<string, string> = {
  Weapon1: 'weapon1', Offhand1: 'offhand', Weapon2: 'weapon2',
  Helm: 'helm', BodyArmour: 'body', Gloves: 'gloves', Boots: 'boots',
  Amulet: 'amulet', Ring: 'ring1', Ring2: 'ring2', Belt: 'belt',
  Flask1: 'flask1', Flask2: 'flask2', Flask3: 'flask3',
  Charm1: 'charm1', Charm2: 'charm2', Charm3: 'charm3',
};

export const RARITY_COLOR: Record<string, string> = {
  'Normal': '#b8b4ae',
  'Magic':  '#8ba4e8',
  'Rare':   '#e8d56e',
  'Unique': '#c28e4a',
};

// ── Decompression ──────────────────────────────────────────────────────────────

async function zlibInflate(code: string): Promise<string> {
  const b64    = code.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bytes  = Uint8Array.from(atob(padded), c => c.charCodeAt(0));

  const ds     = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(bytes);
  writer.close();

  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value!);
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out   = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return new TextDecoder().decode(out);
}

async function resolveCode(input: string): Promise<string> {
  const match = input.match(POBB_IN);
  if (!match) return input;
  return invoke<string>('fetch_pobb_code', { buildId: match[1] });
}

// ── Gem / skill parsing ───────────────────────────────────────────────────────

// Name-based fallback. Only used when no metadata id is available — note the
// 'support' substring check misfires on skill names like "Supporting Fire", so
// prefer gemTypeFromId() whenever a gem metadata id is present.
function gemType(name: string): PobGem['type'] {
  const lower = name.toLowerCase();
  if (SPIRIT_KEYWORDS.some(k => lower.includes(k))) return 'spirit';
  if (lower.includes('support')) return 'support';
  return 'skill';
}

// Classify from a gem metadata id, e.g. "Metadata/Items/Gems/SupportGemBrutality"
// or "Metadata/Items/Gem/SkillGemHeraldOfIce". The SkillGem/SupportGem prefix is
// authoritative for support vs active; spirit gems (heralds/auras/…) share the
// SkillGem prefix, so they're separated out by keyword on the readable name.
function gemTypeFromId(id: string): PobGem['type'] {
  const seg = id.split('/').pop() ?? id;
  if (/^SupportGem/i.test(seg)) return 'support';
  if (/^SkillGem/i.test(seg)) {
    const name = humanizeGemId(id).toLowerCase();
    return SPIRIT_KEYWORDS.some(k => name.includes(k)) ? 'spirit' : 'skill';
  }
  return gemType(humanizeGemId(id));
}

function extractSkillGroups(root: Element): PobSkillGroup[] {
  const groups: PobSkillGroup[] = [];
  for (const skillEl of root.querySelectorAll('Skill')) {
    const gems = Array.from(skillEl.querySelectorAll('Gem'))
      .map(g => ({ name: g.getAttribute('nameSpec') ?? '', id: g.getAttribute('gemId') ?? '' }))
      .filter(g => g.name);
    if (!gems.length) continue;
    const main = gems[0];
    if (groups.some(g => g.mainSkill === main.name)) continue;
    const classify = (g: { name: string; id: string }): PobGem['type'] =>
      g.id ? gemTypeFromId(g.id) : gemType(g.name);
    const supports: PobGem[] = gems.slice(1).map(g => ({ name: g.name, type: classify(g) }));
    groups.push({ mainSkill: main.name, mainType: classify(main), supports });
  }
  return groups;
}

// ── Item parsing ──────────────────────────────────────────────────────────────

function stripTags(line: string): string {
  return line.replace(/\{[^}]*\}/g, '').trim();
}

function parseItemText(raw: string, slot: string): PobItem | null {
  const lines = raw.split('\n')
    .map(l => stripTags(l))
    .filter(l => l.length > 0 && !l.startsWith('Socketed Gems'));

  if (lines.length < 2) return null;

  let rarity: PobItem['rarity'] = 'Normal';
  let name = '', base = '';
  const mods: string[] = [];
  let corrupted = false;
  let quality: number | undefined;
  let itemLevel: number | undefined;
  const req: NonNullable<PobItem['requirements']> = {};

  let i = 0;

  if (lines[i]?.toLowerCase().startsWith('rarity:')) {
    const r = lines[i].split(':')[1]?.trim().toUpperCase() ?? '';
    if (r === 'UNIQUE') rarity = 'Unique';
    else if (r === 'RARE') rarity = 'Rare';
    else if (r === 'MAGIC') rarity = 'Magic';
    i++;
  }

  if (rarity === 'Rare' || rarity === 'Unique') {
    name = lines[i++] ?? '';
    base = lines[i++] ?? '';
  } else {
    name = lines[i++] ?? '';
    base = name;
  }

  let inReqs = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === '--------') { inReqs = false; continue; }
    if (line.toLowerCase() === 'corrupted') { corrupted = true; continue; }
    if (line.startsWith('Requirements:')) { inReqs = true; continue; }
    if (line.startsWith('Quality:')) {
      quality = parseInt(line.match(/(\d+)/)?.[1] ?? '0');
      continue;
    }
    if (line.startsWith('Item Level:')) {
      itemLevel = parseInt(line.split(':')[1]?.trim() ?? '0');
      continue;
    }
    // Skip PoB metadata lines
    if (line.startsWith('Sockets:')         ||
        line.startsWith('LevelReq:')        ||
        line.startsWith('Unique ID:')       ||
        line.startsWith('Selected Variant') ||
        line.startsWith('Implicits:')       ||
        line.startsWith('League:')          ||
        line.startsWith('Crafted Modifiers:')) continue;
    if (inReqs) {
      const m = line.match(/^(\w+):\s*(\d+)/);
      if (m) {
        const k = m[1].toLowerCase(), v = parseInt(m[2]);
        if (k === 'level') req.level = v;
        else if (k === 'str') req.str = v;
        else if (k === 'dex') req.dex = v;
        else if (k === 'int') req.int = v;
      }
      continue;
    }
    if (line) mods.push(line);
  }

  if (!name) return null;

  return {
    slot, name, base, rarity, mods, corrupted,
    ...(quality !== undefined && { quality }),
    ...(itemLevel !== undefined && { itemLevel }),
    ...(Object.keys(req).length > 0 && { requirements: req }),
  };
}

function parseItemsFromSet(setEl: Element, textById: Map<string, string>): PobItem[] {
  const items: PobItem[] = [];
  for (const slotEl of setEl.querySelectorAll('Slot')) {
    const slotName = slotEl.getAttribute('name') ?? '';
    const slotKey = POB_SLOT_MAP[slotName];
    if (!slotKey) continue;
    const itemId = slotEl.getAttribute('itemId') ?? '';
    if (!itemId || itemId === '0') continue;
    const raw = textById.get(itemId);
    if (!raw) continue;
    const parsed = parseItemText(raw, slotKey);
    if (parsed) items.push(parsed);
  }
  return items;
}

// ── Loadout parsing ───────────────────────────────────────────────────────────

function parseSkillSets(doc: Document): {
  sets: Array<{ id: string; title: string; skillGroups: PobSkillGroup[] }>;
  activeId: string;
} {
  const skillsEl  = doc.querySelector('Skills');
  const activeId  = skillsEl?.getAttribute('activeSkillSet') ?? '1';
  const setEls    = Array.from(doc.querySelectorAll('SkillSet'));

  if (setEls.length === 0) {
    // No explicit SkillSets — parse everything at document root level
    return {
      sets: [{ id: '1', title: '', skillGroups: extractSkillGroups(doc.documentElement) }],
      activeId,
    };
  }

  return {
    sets: setEls.map(el => ({
      id:          el.getAttribute('id') ?? '1',
      title:       el.getAttribute('title') ?? '',
      skillGroups: extractSkillGroups(el),
    })),
    activeId,
  };
}

function parseItemSets(doc: Document): {
  sets: Array<{ id: string; title: string; items: PobItem[] }>;
  activeId: string;
} {
  const itemsEl  = doc.querySelector('Items');
  const activeId = itemsEl?.getAttribute('activeItemSet') ?? '1';

  // Build id→raw-text map (items are direct children of <Items>)
  const textById = new Map<string, string>();
  for (const el of itemsEl?.querySelectorAll(':scope > Item') ?? []) {
    const id = el.getAttribute('id');
    if (id) textById.set(id, el.textContent?.trim() ?? '');
  }

  const setEls = Array.from(itemsEl?.querySelectorAll('ItemSet') ?? []);

  if (setEls.length === 0) {
    return { sets: [{ id: '1', title: '', items: [] }], activeId };
  }

  return {
    sets: setEls.map(el => ({
      id:    el.getAttribute('id') ?? '1',
      title: el.getAttribute('title') ?? '',
      items: parseItemsFromSet(el, textById),
    })),
    activeId,
  };
}

// ── GGG official .build format (JSON) ──────────────────────────────────────────
//
// https://www.pathofexile.com/developer/docs/game — a build-planner guide format
// (not a full character export): gems by metadata id, item slots are hints with
// optional unique name + stat-priority text, passives are tree node ids.

interface GggSupport { id: string; additional_text?: string }
interface GggSkill   { id: string; additional_text?: string; support_skills?: Array<string | GggSupport> }
interface GggSlot    { inventory_id: string; unique_name?: string; additional_text?: string }
interface GggBuild   {
  name?: string; author?: string; description?: string; ascendancy?: string;
  skills?: GggSkill[]; items?: GggSlot[]; inventory_slots?: GggSlot[]; passives?: unknown[];
}

// GGG markup is <tag>{content}, including <rgb(r,g,b)> and nesting. Strip both
// the tags and the markup braces.
function stripGggMarkup(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/[{}]/g, '');
}

// Metadata/Items/Gems/SkillGemEarthquake → "Earthquake"
// Metadata/Items/Gems/SupportGemFastForward → "Fast Forward"
function humanizeGemId(id: string): string {
  const seg = id.split('/').pop() ?? id;
  const noPrefix = seg.replace(/^(SkillGem|SupportGem)/, '');
  return noPrefix
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim() || seg;
}

function gggSlotToItem(slot: GggSlot): PobItem | null {
  const slotKey = GGG_SLOT_MAP[slot.inventory_id];
  if (!slotKey) return null;

  const lines = stripGggMarkup(slot.additional_text ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !/^-+$/.test(l));

  if (slot.unique_name) {
    return {
      slot: slotKey, name: slot.unique_name, base: slot.unique_name,
      rarity: 'Unique', mods: lines, corrupted: false,
    };
  }

  // First line is the item base type; remaining lines are the rolled mods /
  // stat priorities. Rolled gear → Rare; plain items (flasks, charms) → Normal.
  const name = lines[0] ?? SLOT_LABEL[slotKey] ?? slotKey;
  const mods = lines.slice(1);
  return {
    slot: slotKey, name, base: name,
    rarity: mods.length > 0 ? 'Rare' : 'Normal', mods, corrupted: false,
  };
}

function parseGggBuild(json: GggBuild): PobBuild {
  const skillGroups: PobSkillGroup[] = (json.skills ?? []).map(s => {
    const supports: PobGem[] = (s.support_skills ?? []).map(sup => {
      const supId = typeof sup === 'string' ? sup : sup.id;
      // Classify by metadata id — a slot is usually a support gem, but a spirit
      // gem (herald/aura) socketed into a skill should surface as such.
      return { name: humanizeGemId(supId), type: gemTypeFromId(supId) };
    });
    return { mainSkill: humanizeGemId(s.id), mainType: gemTypeFromId(s.id), supports };
  });

  // The real GGG export uses an `items` array; the docs example used
  // `inventory_slots`. Accept either.
  const rawSlots = json.items ?? json.inventory_slots ?? [];
  const items: PobItem[] = rawSlots
    .map(gggSlotToItem)
    .filter((x): x is PobItem => x !== null);

  const ascendancy = json.ascendancy ?? '';
  const className  = ascendancy ? ascendancy.replace(/\d+$/, '') : 'Unknown';

  return {
    className,
    ascendClassName: '',
    level: 0,
    buildName: json.name || '',
    source: 'ggg',
    skillSets: [{ id: '1', name: 'Default', skillGroups }],
    itemSets:  [{ id: '1', name: 'Default', items }],
    activeSkillSet: 0,
    activeItemSet: 0,
    notes: stripGggMarkup(json.description ?? ''),
    importedAt: Date.now(),
  };
}

// ── PoB XML parsing ─────────────────────────────────────────────────────────────

function parsePobXml(xml: string): PobBuild {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid PoB XML — check that you copied the complete export code');
  }

  const buildEl        = doc.querySelector('Build');
  const className      = buildEl?.getAttribute('className')      ?? 'Unknown';
  const ascendClassName= buildEl?.getAttribute('ascendClassName') ?? '';
  const level          = parseInt(buildEl?.getAttribute('level') ?? '1', 10);
  const notes          = doc.querySelector('Notes')?.textContent?.trim() ?? '';

  const { sets: rawSkillSets, activeId: activeSkillId } = parseSkillSets(doc);
  const { sets: rawItemSets,  activeId: activeItemId  } = parseItemSets(doc);

  const skillSets: PobSkillSet[] = rawSkillSets.map((s, i) => ({
    id: s.id,
    name: s.title || (rawSkillSets.length === 1 ? 'Default' : `Skill Set ${i + 1}`),
    skillGroups: s.skillGroups,
  }));

  const itemSets: PobItemSet[] = rawItemSets.map((s, i) => ({
    id: s.id,
    name: s.title || (rawItemSets.length === 1 ? 'Default' : `Item Set ${i + 1}`),
    items: s.items,
  }));

  const activeSkillSet = Math.max(0, skillSets.findIndex(s => s.id === activeSkillId));
  const activeItemSet  = Math.max(0, itemSets.findIndex(s => s.id === activeItemId));

  return {
    className, ascendClassName, level,
    source: 'pob',
    skillSets, itemSets, activeSkillSet, activeItemSet,
    notes, importedAt: Date.now(),
  };
}

// ── Unified import ──────────────────────────────────────────────────────────────

/** Import a build from either a PoB code/pobb.in link, raw PoB XML, or the
 *  contents of an official GGG `.build` JSON file. Format is auto-detected. */
export async function importBuild(raw: string): Promise<PobBuild> {
  const trimmed = raw.trim();

  // GGG .build files are plain JSON objects
  if (trimmed.startsWith('{')) {
    let json: GggBuild;
    try {
      json = JSON.parse(trimmed) as GggBuild;
    } catch {
      throw new Error('Invalid build JSON — paste the full contents of the .build file');
    }
    return parseGggBuild(json);
  }

  // Raw PoB XML pasted directly
  if (trimmed.startsWith('<')) {
    return parsePobXml(trimmed);
  }

  // PoB export code or pobb.in link → resolve then inflate
  const code = await resolveCode(trimmed);
  const xml  = await zlibInflate(code);
  return parsePobXml(xml);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function stripPobColors(text: string): string {
  return text.replace(/\^x[0-9a-fA-F]{6}/g, '').replace(/\^[0-9]/g, '');
}

// Older stored builds predate PobSkillGroup.mainType — infer it from the name
// so the UI never reads an undefined type.
function backfillSkillTypes(data: Record<string, unknown>): PobBuild {
  const build = data as unknown as PobBuild;
  for (const set of build.skillSets ?? []) {
    for (const group of set.skillGroups ?? []) {
      if (!group.mainType) group.mainType = gemType(group.mainSkill);
    }
  }
  return build;
}

export function loadStoredBuild(): PobBuild | null {
  try {
    const raw = window.localStorage.getItem(POB_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;

    // Already the current (skillSets/itemSets) format
    if (Array.isArray(data.skillSets) && Array.isArray(data.itemSets)) {
      if (typeof data.activeSkillSet !== 'number') data.activeSkillSet = 0;
      if (typeof data.activeItemSet  !== 'number') data.activeItemSet  = 0;
      return backfillSkillTypes(data);
    }

    // Migrate older "loadouts" format (paired skill+item) → split dimensions
    if (Array.isArray(data.loadouts)) {
      const loadouts = data.loadouts as Array<{ id: string; name: string; skillGroups: PobSkillGroup[]; items: PobItem[] }>;
      data.skillSets = loadouts.map(l => ({ id: l.id, name: l.name, skillGroups: l.skillGroups }));
      data.itemSets  = loadouts.map(l => ({ id: l.id, name: l.name, items: l.items }));
      const idx = typeof data.activeLoadoutIndex === 'number' ? data.activeLoadoutIndex : 0;
      data.activeSkillSet = idx;
      data.activeItemSet  = idx;
      delete data.loadouts;
      delete data.activeLoadoutIndex;
      return backfillSkillTypes(data);
    }

    // Migrate oldest v1 format (flat skillGroups/items) → single sets
    const skillGroups = (data.skillGroups as PobSkillGroup[] | undefined) ?? [];
    const items       = (data.items       as PobItem[]       | undefined) ?? [];
    data.skillSets = [{ id: '1', name: 'Default', skillGroups }];
    data.itemSets  = [{ id: '1', name: 'Default', items }];
    data.activeSkillSet = 0;
    data.activeItemSet  = 0;
    delete data.skillGroups;
    delete data.items;
    return backfillSkillTypes(data);
  } catch {
    return null;
  }
}

export function saveBuild(build: PobBuild): void {
  window.localStorage.setItem(POB_STORAGE_KEY, JSON.stringify(build));
}

export function clearBuild(): void {
  window.localStorage.removeItem(POB_STORAGE_KEY);
}
