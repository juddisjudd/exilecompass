// Current character from ": <name> (<class>) is now level <n>" log lines.
// Party members' level-ups look identical, so the pick is whoever levelled
// most this session. Display-only.

import type { GameMode } from './gameMode.svelte';

export interface ActiveCharacter {
  name: string;
  cls: string;
  level: number;
}

let _current = $state<ActiveCharacter | null>(null);
let _game: GameMode | null = null;
const _seen = new Map<string, number>();

function storageKey(game: GameMode): string {
  return `EXILECOMPASS_${game.toUpperCase()}_ACTIVE_CHARACTER_V1`;
}

export function load(game: GameMode) {
  if (_game === game) return;
  _game = game;
  _seen.clear();
  try {
    const raw = window.localStorage.getItem(storageKey(game));
    _current = raw ? (JSON.parse(raw) as ActiveCharacter) : null;
  } catch {
    _current = null;
  }
  if (_current) _seen.set(_current.name, 1);
}

export function handleLevelUp(name: string, cls: string, level: number) {
  if (!_game) return;
  const n = (_seen.get(name) ?? 0) + 1;
  _seen.set(name, n);
  if (_current && _current.name !== name && n <= (_seen.get(_current.name) ?? 0)) return;
  _current = { name, cls, level };
  try {
    window.localStorage.setItem(storageKey(_game), JSON.stringify(_current));
  } catch {
    /* ignore */
  }
}

export const activeCharacter = {
  get current(): ActiveCharacter | null {
    return _current;
  },
};
