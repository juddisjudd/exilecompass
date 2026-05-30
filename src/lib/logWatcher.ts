import { invoke } from '@tauri-apps/api/core';
import { persistGet, persistSet, persistRemove } from '$lib/persist';

// ── Storage (disk-backed for restart reliability) ───────────────────────────────

export const LOG_WATCHER_KEY = 'EXILECOMPASS_LOG_WATCHER_V1';

export interface LogWatcherState {
  offset: number;    // byte offset already processed
  setupTime: string; // ISO timestamp — only process log lines after this
}

export async function loadWatcherState(): Promise<LogWatcherState | null> {
  try {
    const raw = await persistGet(LOG_WATCHER_KEY);
    return raw ? (JSON.parse(raw) as LogWatcherState) : null;
  } catch { return null; }
}

async function saveWatcherState(state: LogWatcherState) {
  await persistSet(LOG_WATCHER_KEY, JSON.stringify(state));
}

export async function clearWatcherState() {
  await persistRemove(LOG_WATCHER_KEY);
}

/** Call when the user sets a new log file. Records the current file size so
 *  only lines written AFTER setup are processed. */
export async function initWatcherForFile(logPath: string): Promise<LogWatcherState> {
  // Read with a huge offset to get file_size without reading any lines
  const result = await invoke<{ lines: string[]; file_size: number }>(
    'read_log_tail', { path: logPath, fromByte: Number.MAX_SAFE_INTEGER }
  );
  const state: LogWatcherState = {
    offset: result.file_size,
    setupTime: new Date().toISOString(),
  };
  await saveWatcherState(state);
  return state;
}

// ── Area / zone tracking ───────────────────────────────────────────────────────

// Maps in-game area names (from [SCENE] Set Source) to which reward IDs can
// appear there. Used to disambiguate passive skill point rewards since multiple
// sources emit the same "gained N Passive Skill Points" line.
const AREA_PASSIVE_MAP: Record<string, string> = {
  'Hunting Grounds':      'sp_crowbell',
  'Ogham Farmlands':      'sp_una_lute',
  'Keth':                 'sp_kabala',
  'Jungle Ruins':         'sp_silverfist',
  'Aggorat':              'sp_heart',
  "Journey's End":        'sp_tujen',
  'Trial of the Ancestors': 'sp_hinekora',
  'Wolvenhold':           'sp_int1_oswin',
  'Khari Crossing':       'sp_int2_quest',
};

// Ordered list for sequential fallback when area is unknown
const PASSIVE_ORDER = [
  'sp_crowbell', 'sp_una_lute',
  'sp_kabala',   'sp_shambrin',
  'sp_silverfist','sp_heart',
  'sp_tujen', 'sp_hinekora',
  'sp_int1_oswin','sp_int2_quest',
  'sp_int3_yeti', 'sp_int3_hooded',
];

const SPIRIT_ORDER = ['spirit_mists', 'spirit_ignagduk', 'spirit_lythara'];

function parseLogDate(line: string): Date | null {
  const m = line.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
}

function extractScene(line: string): string | null {
  const m = line.match(/\[SCENE\] Set Source \[(.+?)\]/);
  return m ? m[1] : null;
}

/** Process a batch of new log lines and return reward IDs to mark as collected.
 *
 *  Real PoE2 reward log lines come in a few shapes (the leading character name
 *  varies, so we never key on it):
 *    "<char> has received +5% to [Resistances|Cold Resistance]."
 *    "<char> gained +30 to [Spirit|Spirit]."
 *    "<char> gained +20 to maximum Life."
 *    "<char> has received +1 [Charm] Slot."
 *    "<char> has received 25% increased [StunThreshold|Stun Threshold]."
 *    "You gained 2 Passive Skill Points."
 *    "You gained 2 Weapon Set Passive Skill Points."   (NOT a tracked reward)
 *
 *  @param lines       Raw log lines from the tail read
 *  @param setupTime   ISO timestamp — discard lines before this
 *  @param collected   IDs already collected (so we don't double-mark)
 *  @param areaRef     Current in-game area — mutated in-place as SCENE lines arrive
 */
export function extractNewRewardIds(
  lines: string[],
  setupTime: Date,
  collected: Set<string>,
  areaRef: { current: string },
): string[] {
  const toMark: string[] = [];

  const mark = (id: string) => {
    if (!collected.has(id) && !toMark.includes(id)) toMark.push(id);
  };
  // Mark the first not-yet-collected id from an ordered list (for rewards where
  // several identical grants exist and we can't tell which one this is).
  const markFirst = (ids: string[]) => {
    for (const id of ids) {
      if (!collected.has(id) && !toMark.includes(id)) { mark(id); return; }
    }
  };

  for (const line of lines) {
    // Track current area for passive-point context
    const scene = extractScene(line);
    if (scene) { areaRef.current = scene; continue; }

    // Time gate — skip lines from before the watcher was set up
    const lineTime = parseLogDate(line);
    if (!lineTime || lineTime < setupTime) continue;

    // A reward grant always contains "received" or "gained".
    if (!/\b(received|gained)\b/i.test(line)) continue;

    // ── Resistances ──────────────────────────────────────────────
    // +10% = campaign boss reward; +5% to a single element = a Trial choice.
    const res = line.match(/\+(\d+)%\s+to\s+\[Resistances\|(Cold|Fire|Lightning)\s+Resistance\]/i);
    if (res) {
      const amt = parseInt(res[1], 10);
      const el = res[2].toLowerCase();
      if (amt >= 10) {
        mark(el === 'cold' ? 'res_cold' : el === 'fire' ? 'res_fire' : 'res_lightning');
      } else {
        // Trial of the Sekhemas: each trial offers an attribute OR a resistance.
        mark(el === 'cold' ? 'choice_trial_tasalio'
           : el === 'fire' ? 'choice_trial_ngamahu'
           : 'choice_trial_tawhoa');
      }
      continue;
    }
    // Seven Pillars "Tabana" grants all elemental resistances at once.
    if (/to all\s+Elemental\s+Resistances/i.test(line)) { mark('choice_seven_pillars'); continue; }

    // ── Spirit ───────────────────────────────────────────────────
    const spirit = line.match(/\+(\d+)\s+to\s+\[Spirit\|Spirit\]/i);
    if (spirit) {
      const amt = parseInt(spirit[1], 10);
      if (amt >= 40) mark('spirit_lythara');
      else markFirst(SPIRIT_ORDER);
      continue;
    }

    // ── Max Life / Max Mana ──────────────────────────────────────
    if (/maximum Life/i.test(line)) {
      if (/\+20\s+to\s+maximum Life/i.test(line)) mark('life_candlemass');
      else if (/%.*maximum Life/i.test(line)) mark('life_molten');
      else markFirst(['life_candlemass', 'life_molten']);
      continue;
    }
    if (/%.*maximum Mana/i.test(line)) { mark('mana_silent'); continue; }

    // ── Charm slot / charges / duration (Valley of the Titans) ───
    if (/\[Charm\]/i.test(line)) { mark('choice_valley'); continue; }

    // ── Venom Vial (Stun / Ailment threshold or Mana Regen) ──────
    if (/Stun\s*Threshold|Ailment\s*Threshold|Mana Regeneration/i.test(line)) {
      mark('choice_venom_vial');
      continue;
    }

    // ── Abandoned Prison (Life/Mana recovery from flasks) ────────
    if (/[Rr]ecovery.*[Ff]lask|[Ff]lask.*[Rr]ecovery/i.test(line)) { mark('choice_abandoned'); continue; }

    // ── Trial attribute choices (+5 Str/Dex/Int) ─────────────────
    // Real tokens look like "+5 to [Strength|Strength]" (also handle plain text
    // and a possible "[Attributes|Strength]" form).
    if (/\+5\s+to\s+all\s+Attributes/i.test(line)) { mark('choice_seven_pillars'); continue; }
    if (/\+5\s+to\s+\[?(?:Attributes\|)?Strength\b/i.test(line))     { mark('choice_trial_ngamahu'); continue; }
    if (/\+5\s+to\s+\[?(?:Attributes\|)?Dexterity\b/i.test(line))    { mark('choice_trial_tawhoa');  continue; }
    if (/\+5\s+to\s+\[?(?:Attributes\|)?Intelligence\b/i.test(line)) { mark('choice_trial_tasalio'); continue; }

    // ── Seven Pillars (other distinctive options) ────────────────
    if (/Global Defences|Presence Area|Cooldown Recovery|increased Experience/i.test(line)) {
      mark('choice_seven_pillars');
      continue;
    }

    // ── Passive skill points (campaign quests) ───────────────────
    // Exclude Weapon Set / Atlas points — those are separate systems.
    if (/Passive Skill Points?/i.test(line) && !/Weapon Set/i.test(line) && !/Atlas/i.test(line)) {
      const areaId = AREA_PASSIVE_MAP[areaRef.current];
      if (areaId && !collected.has(areaId) && !toMark.includes(areaId)) mark(areaId);
      else markFirst(PASSIVE_ORDER);
      continue;
    }
  }

  return toMark;
}

// ── Polling ────────────────────────────────────────────────────────────────────

export interface SceneEvent {
  scene: string;
  timeMs: number; // epoch ms from the log timestamp
}

/** Pull every [SCENE] Set Source transition (with its log timestamp) from a
 *  batch of lines — used by the campaign timer for automatic act splits. */
function extractSceneEvents(lines: string[]): SceneEvent[] {
  const events: SceneEvent[] = [];
  for (const line of lines) {
    const scene = extractScene(line);
    if (!scene) continue;
    const d = parseLogDate(line);
    if (d) events.push({ scene, timeMs: d.getTime() });
  }
  return events;
}

/** One poll tick: read new log content, extract reward IDs + scene transitions,
 *  update the stored offset. */
export async function pollLog(
  logPath: string,
  state: LogWatcherState,
  collected: Set<string>,
  areaRef: { current: string },
): Promise<{ ids: string[]; scenes: SceneEvent[]; state: LogWatcherState }> {
  const result = await invoke<{ lines: string[]; file_size: number }>(
    'read_log_tail', { path: logPath, fromByte: state.offset }
  );

  // Detect truncation (file was reset / replaced)
  const wasTruncated = result.file_size < state.offset;
  const newOffset = result.file_size;

  const setupTime = new Date(state.setupTime);
  const ids = extractNewRewardIds(result.lines, setupTime, collected, areaRef);
  const scenes = extractSceneEvents(result.lines);

  const newState: LogWatcherState = { ...state, offset: newOffset };
  if (wasTruncated) {
    // File was reset — update setup time so stale entries aren't processed
    newState.setupTime = new Date().toISOString();
  }
  await saveWatcherState(newState);

  return { ids, scenes, state: newState };
}
