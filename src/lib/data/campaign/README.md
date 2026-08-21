# Campaign Data

Each act lives in its own JSON file (`act1.json` through `act6.json`). To fix a mistake, add a zone, or add an objective you only need to edit the relevant file — no TypeScript required.

---

## File structure

```
act1.json         Acts 1–4 are fully populated
act2.json
act3.json
act4.json
interlude1.json   5.1 Ogham, The Refuge      ┐ Temporary — replaced by
interlude2.json   5.2 Khari Bazaar           ┤ Acts 5 & 6 at 1.0 release.
interlude3.json   5.3 Mount Kriar, The Glade ┘ Set enabled: false to hide.
act5.json         Placeholder — fill in when content releases
act6.json         Placeholder — fill in when content releases
```

To disable an act or interlude without deleting it, set `"enabled": false`. Acts 5 and 6 are already disabled this way since they're unreleased. When 1.0 ships, set the three interludes to `"enabled": false` and flip Acts 5 & 6 to `"enabled": true`.

---

## `scenes.json` — "you are here" auto-progress

`scenes.json` is a separate, optional companion file: `{ "<zoneId>": "<exact [SCENE] log string>" }`. It drives the Campaign Guide's live position marker (`campaignAutoProgress.svelte.ts`), which watches the game log's `[SCENE] Set Source [...]` lines and follows along. It's kept out of the act files on purpose — this is log-matching plumbing, not guide content, the same reasoning `campaignTimer.ts`/`logWatcher.ts` already use for their own zone-name lookup tables.

A zone with no entry here just never gets a marker — nothing breaks, and the guide content is unaffected. If you notice a missing or wrong scene string (best-effort, not verified against every zone in a live session), add or fix its line the same way you'd fix anything else in this folder — no TypeScript required, just make sure the string matches the log exactly (case and wording). Town/hub scenes are listed in `HUB_SCENES` (`src/lib/campaignEdges.ts`) and behave differently — see below.

---

## `dialogue.json` — objective-level "you are here"

`dialogue.json` narrows the marker from a zone down to an objective: `{ "<objectiveId>": ["Speaker: text", ...] }`, each line copied from Client.txt as it appears after the `[INFO Client N]` prefix (NPC and boss lines have no chat sigil; player chat does). When such a line shows up in the log, the marker jumps to that objective. Lines are matched on speaker plus a *prefix* of the text, case- and punctuation-insensitive, so a long line can be shortened to its first few words.

Guidelines when adding anchors:

- Prefer lines that fire *at* the objective — a boss's opening lines, the NPC's quest-accept line, the post-fight line that tells you to head back to town.
- Several lines per objective are fine and make it more robust (whichever fires first wins). Keep every line unique across the whole file.
- Avoid generic vendor/arrival barks ("Anything catch your eye?", "We've arrived.") — they repeat in many zones.
- Matching is forward-only, so a line that replays later (on re-entering a zone, say) never drags the marker backward.
- Only league objectives should be left out: they change every league anyway.

Not every quest line reaches the log — many are voice-only — so some objectives simply can't be anchored. That's expected.

Both tables were authored against one full campaign log. To re-check them after a game patch, replay a fresh Client.txt through `buildEdges`/`matchScene`/`matchDialogue` from `src/lib/campaignEdges.ts` with bun and look at where the marker moves.

---

## Schema

```jsonc
{
  "number": 1,          // Act number (integer)
  "name": "ACT 1",      // Display name shown in the UI
  "zones": [ ... ]      // Ordered list of zones for this act
}
```

### Act / Interlude top-level fields

```jsonc
{
  "number": 1,          // Display order number (integer)
  "name": "ACT 1",      // Display name shown in the UI
  "enabled": true,      // false = hidden from guide without deleting data
  "temporary": false,   // true = interlude placeholder (shown with a badge); omit for normal acts
  "tips": [              // Optional. Act-level strategy notes, shown in a collapsible box
    { "text": "Push to the Red Vale weapon racks — guaranteed 2nd-tier weapon base." },
    { "text": "Runes of Aldur: Farrow's rune quest chain unlocks Runeforging.", "league": true }
  ],
  "zones": [ ... ]
}
```

### Zone

```jsonc
{
  "id": "act1_clearfell",   // Unique snake_case ID — never reuse across acts
  "name": "Clearfell",      // Display name shown in the UI
  "objectives": [ ... ]     // Ordered list of objectives for this zone
}
```

### Objective

```jsonc
{
  "id": "clf_1",                        // Unique ID within the file (used to track checkbox state)
  "text": "Kill Beira of the Rotten Pack",  // Main objective text (required)
  "optional": true,                     // Omit or false for required objectives
  "league": true,                       // Tied to the current league mechanic — see below
  "reward": "Permanent 10% Cold Resistance", // Short reward label shown as a badge (omit if none)
  "notes": [                            // Extra tips shown below the objective (omit if none)
    "Always north/northeast of waypoint",
    "Mud burrow and worm boss can be skipped"
  ]
}
```

All fields except `id` and `text` are optional — leave them out rather than setting them to `null` or `""`.

### League-mechanic content

`"league": true` marks an objective as tied to the *current* league mechanic (e.g. this patch's Farrow
rune quest chain) rather than the permanent campaign — content that's genuinely useful now but likely
to change or vanish next league. It always implies `optional: true`: don't set `optional: false` on a
league-tagged objective, since the guide's "required to finish the act" math assumes league content is
never mandatory. The in-app filter lets players hide league content once it goes stale; tag generously
rather than leaving stale content indistinguishable from the permanent route next time the league mechanic changes.

---

## ID naming conventions

| Scope | Convention | Example |
|-------|-----------|---------|
| Zone  | `act{N}_{shortname}` | `act2_halani` |
| Objective | `{zone_abbrev}_{n}` | `hlg_1`, `hlg_2` |

IDs are stored in `localStorage` to track which checkboxes are checked. **Never change an existing ID** — doing so will silently lose users' progress for that objective. Only add new IDs or leave existing ones alone.

---

## How to contribute

1. Find the act file you want to edit (e.g. `act2.json` for Act 2 changes).
2. Make your edit — add/fix zones or objectives following the schema above.
3. Make sure your JSON is valid (paste it into [jsonlint.com](https://jsonlint.com) if unsure).
4. Open a PR with a short description of what you changed and why.

No build step needed — the app imports these files directly.
