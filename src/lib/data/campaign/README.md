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
