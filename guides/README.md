# Crafting guides

Each `*.yaml` file in this folder is one crafting guide shown in the app's
**Craft** tab. You don't need to touch any code to add or edit a guide — just
write YAML here. When the app is built, every guide is validated and any mistake
(an unknown item, a missing field, a bad slot) fails the build with a clear
message, so a broken guide can't ship.

## Quick start

Copy an existing file (e.g. `gloves-plus2-projectiles.yaml`), rename it, and edit
the fields. To preview your changes, run `bun run crafting` — it compiles the
guides and prints any problems.

## File format

```yaml
id: gloves-plus2-projectiles          # unique across all guides, kebab-case
slot: gloves                          # which equipment slot (see list below)
name: "+2 Projectiles (Ice Shot / Twisters)"   # craft name in the listing
goal: "What the finished item is for."         # one-line summary
base: Secured Wraps                            # starting item (see "Base item(s)")

steps:
  - id: roll-prefix                   # unique within this guide
    title: Roll a T1 flat damage prefix          # the action (required)
    detail: Longer explanation shown under the title.   # optional
    optional: true                    # optional — flags a skippable step
    note: { kind: warning, text: "This step can brick." }   # optional callout
    repeat: true                      # optional — flags a "spam until X" step
    items:                            # optional — items this step uses
      - Chaos Orb
      - Orb of Annulment
    targets:                          # optional — mod(s) this step aims for
      - { text: "Adds # to # Lightning Damage to Attacks", tag: prefix }  # first = ideal
      - { text: "Adds # to # Fire Damage to Attacks", tag: prefix }       # rest = alternatives
    branches:                         # optional — conditional outcomes
      - if: success                   # "success" / "fail" → green / red presets
        text: What to do when it works.
      - if: "hits a suffix"           # any other text → a neutral custom label
        text: What to do then.
        items:                        # branches can list recovery items too
          - Orb of Annulment
```

A step's `targets` are the mod(s) you're aiming for — same `string` or
`{ text, tag }` form as `result`. The **first** is shown as the *ideal*, the rest
as *alternatives* (a single target is just labelled "Target").

`optional: true` flags a skippable step. `note` is a highlighted callout —
`kind` is `tip`, `warning`, or `alt`. A branch's `if` may be `success`, `fail`,
or any other text (rendered as a neutral custom condition).

### Slots

`weapon`, `offhand`, `quiver`, `helmet`, `body`, `gloves`, `boots`, `belt`,
`amulet`, `ring`, `jewel`.

### Referencing items

Write items by their **in-game name** — the build resolves the icon 1:1 from the
shared item dataset (`src/lib/poe2-items.json`, generated from the game data).
The easiest way to get valid names is the [guide creator](https://exilecompass.com/guide-creator),
which lists every item with its icon.

```yaml
items:
  - Chaos Orb
  - Perfect Regal Orb
  - Fracturing Orb
```

If a name isn't recognized, the build fails with a clear message.

### Base item(s)

`base` is an item name too. List several if the craft works on any of them — the
first is the icon shown in the listing:

```yaml
base: Secured Wraps          # one base
# or
base:
  - Slipstrike Vest          # any of these
  - Falconer's Jacket
```

Add an optional `ilvl: 80` for a required base item level.

### Author (optional)

Credit the guide's author and link their channels (YouTube / Twitch URLs must be
full `http(s)` links):

```yaml
author:
  name: YourName
  youtube: "https://youtube.com/@you"
  twitch: "https://twitch.tv/you"
```

### Final result (optional)

List the target mods the finished item should have — shown at the end of the
guide. Each entry is a mod-text string, or `{ text, tag, alt }`:

- `tag` is one of `prefix`, `suffix`, `fractured`, `implicit` (colours the chip).
- `alt: true` marks a mod where **any one** of the alternatives is an acceptable
  result (e.g. one of several damage types). They're grouped under "any of these"
  in the app. At least one mod must be required (not `alt`).

```yaml
result:
  - { text: "+2 to Level of all Projectile Skills", tag: prefix }
  - { text: "Adds # to # Lightning Damage to Attacks", tag: fractured, alt: true }
  - { text: "Adds # to # Fire Damage to Attacks", tag: fractured, alt: true }
  - "+#% to Critical Damage Bonus"
```

## Notes

- Quote any value containing a colon (`:`), or that starts with a special
  character, e.g. `name: "+2 Projectiles"` and `goal: "Gloves: ..."`.
- Guides are English-only for now.
- The generated file (`src/lib/crafting.generated.ts`) is built from these YAML
  files — don't edit it directly.
