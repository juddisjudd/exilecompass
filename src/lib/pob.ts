import { invoke } from '@tauri-apps/api/core';

export interface PobGem {
  name: string;
  type: 'skill' | 'support' | 'spirit';
}

export interface PobSkillGroup {
  mainSkill: string;
  supports: PobGem[];
}

export interface PobBuild {
  className: string;
  ascendClassName: string;
  level: number;
  skillGroups: PobSkillGroup[];
  notes: string;
  importedAt: number;
}

export const POB_STORAGE_KEY = 'EXILECOMPASS_POB_BUILD_V1';

const POBB_IN = /^https?:\/\/pobb\.in\/([A-Za-z0-9_-]+)/i;

const SPIRIT_KEYWORDS = ['aura', 'herald', 'banner', 'aspect', 'offering', 'manifestation', 'warcry'];

async function zlibInflate(code: string): Promise<string> {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));

  const ds = new DecompressionStream('deflate');
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
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return new TextDecoder().decode(out);
}

async function resolveCode(input: string): Promise<string> {
  const match = input.match(POBB_IN);
  if (!match) return input;
  // Fetch via Rust backend to bypass browser CORS restrictions
  return invoke<string>('fetch_pobb_code', { buildId: match[1] });
}

function gemType(name: string): PobGem['type'] {
  const lower = name.toLowerCase();
  if (SPIRIT_KEYWORDS.some(k => lower.includes(k))) return 'spirit';
  if (lower.includes('support')) return 'support';
  return 'skill';
}

export async function importPob(raw: string): Promise<PobBuild> {
  const code = await resolveCode(raw.trim());
  const xml = await zlibInflate(code);

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid PoB XML — check that you copied the complete export code');
  }

  const buildEl = doc.querySelector('Build');
  const className = buildEl?.getAttribute('className') ?? 'Unknown';
  const ascendClassName = buildEl?.getAttribute('ascendClassName') ?? '';
  const level = parseInt(buildEl?.getAttribute('level') ?? '1', 10);

  const notes = doc.querySelector('Notes')?.textContent?.trim() ?? '';

  // Find the active SkillSet (fall back to first, then document root)
  const activeId = buildEl?.getAttribute('activeSkillSet') ?? '1';
  const skillRoot =
    doc.querySelector(`SkillSet[id="${activeId}"]`) ??
    doc.querySelector('SkillSet') ??
    doc.documentElement;

  const skillGroups: PobSkillGroup[] = [];
  for (const skillEl of skillRoot.querySelectorAll('Skill')) {
    const gems = Array.from(skillEl.querySelectorAll('Gem'))
      .map(g => g.getAttribute('nameSpec') ?? '')
      .filter(Boolean);
    if (!gems.length) continue;

    const mainSkill = gems[0];
    // Skip duplicate main skills (same gem in multiple slots)
    if (skillGroups.some(g => g.mainSkill === mainSkill)) continue;

    const supports: PobGem[] = gems.slice(1).map(name => ({ name, type: gemType(name) }));
    skillGroups.push({ mainSkill, supports });
  }

  return { className, ascendClassName, level, skillGroups, notes, importedAt: Date.now() };
}

export function stripPobColors(text: string): string {
  return text.replace(/\^x[0-9a-fA-F]{6}/g, '').replace(/\^[0-9]/g, '');
}

export function loadStoredBuild(): PobBuild | null {
  try {
    const raw = window.localStorage.getItem(POB_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PobBuild) : null;
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
