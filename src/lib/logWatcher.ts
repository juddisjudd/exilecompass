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
// sources emit the same "You have received N Passive Skill Points" line.
const AREA_PASSIVE_MAP: Record<string, string> = {
  'Hunting Grounds':      'sp_crowbell',
  'Ogham Farmlands':      'sp_una_lute',
  'Keth':                 'sp_kabala',
  'Jungle Ruins':         'sp_silverfist',
  'Aggorat':              'sp_heart',
  'Isle of Kin':          'sp_blind_beast',
  "Journey's End":        'sp_tujen',
  'Trial of the Ancestors': 'sp_hinekora',
  'Holten':               'sp_int1_oswin',
  'The Stolen Barya':     'sp_int2_quest',
};

// Ordered list for sequential fallback when area is unknown
const PASSIVE_ORDER = [
  'sp_crowbell', 'sp_una_lute',
  'sp_kabala',   'sp_shambrin',
  'sp_silverfist','sp_heart',
  'sp_blind_beast','sp_tujen', 'sp_hinekora',
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

  for (const line of lines) {
    // Track current area for context
    const scene = extractScene(line);
    if (scene) { areaRef.current = scene; continue; }

    // Time gate — skip lines from before the watcher was set up
    const lineTime = parseLogDate(line);
    if (!lineTime || lineTime < setupTime) continue;

    if (!line.includes('You have received')) continue;

    // ── Resistances (unique — only one of each in the entire game) ──
    if (/Cold Resistance/i.test(line))      { mark('res_cold');      continue; }
    if (/Fire Resistance/i.test(line))      { mark('res_fire');      continue; }
    if (/Lightning Resistance/i.test(line)) { mark('res_lightning'); continue; }

    // ── Spirit (+30 or +40) ──
    if (/\[Spirit\|/i.test(line) || /to.*Spirit/i.test(line)) {
      if (/\+40/i.test(line)) {
        mark('spirit_lythara');
      } else {
        // +30: mark the first uncollected spirit reward in order
        for (const id of SPIRIT_ORDER) {
          if (!collected.has(id) && !toMark.includes(id)) { mark(id); break; }
        }
      }
      continue;
    }

    // ── Life ──
    if (/maximum Life/i.test(line)) {
      if (/\+20\b/.test(line))  { mark('life_candlemass'); }
      else if (/%.*Life/i.test(line)) { mark('life_molten'); }
      else {
        for (const id of ['life_candlemass', 'life_molten']) {
          if (!collected.has(id) && !toMark.includes(id)) { mark(id); break; }
        }
      }
      continue;
    }

    // ── Mana ──
    if (/maximum Mana/i.test(line)) { mark('mana_silent'); continue; }

    // ── Passive skill points ──
    if (/Passive Skill Points?/i.test(line)) {
      // Try area-based mapping first
      const areaId = AREA_PASSIVE_MAP[areaRef.current];
      if (areaId && !collected.has(areaId) && !toMark.includes(areaId)) {
        mark(areaId);
      } else {
        // Fall back to sequential — mark next uncollected
        for (const id of PASSIVE_ORDER) {
          if (!collected.has(id) && !toMark.includes(id)) { mark(id); break; }
        }
      }
      continue;
    }
  }

  return toMark;
}

// ── Polling ────────────────────────────────────────────────────────────────────

/** One poll tick: read new log content, extract reward IDs, update stored offset.
 *  Returns the IDs to mark (may be empty) and the updated watcher state. */
export async function pollLog(
  logPath: string,
  state: LogWatcherState,
  collected: Set<string>,
  areaRef: { current: string },
): Promise<{ ids: string[]; state: LogWatcherState }> {
  const result = await invoke<{ lines: string[]; file_size: number }>(
    'read_log_tail', { path: logPath, fromByte: state.offset }
  );

  // Detect truncation (file was reset / replaced)
  const wasTruncated = result.file_size < state.offset;
  const newOffset = result.file_size;

  const setupTime = new Date(state.setupTime);
  const ids = extractNewRewardIds(result.lines, setupTime, collected, areaRef);

  const newState: LogWatcherState = { ...state, offset: newOffset };
  if (wasTruncated) {
    // File was reset — update setup time so stale entries aren't processed
    newState.setupTime = new Date().toISOString();
  }
  await saveWatcherState(newState);

  return { ids, state: newState };
}
