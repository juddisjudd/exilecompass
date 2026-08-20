<div align="center">

# ExileCompass

**A sleek, always-on-top companion overlay for Path of Exile 2 and Path of Exile.**

Track your campaign, never miss a permanent reward, build stash search strings,
time your runs, keep your build's gems and gear one glance away, and drive it
all hands-free with your voice — in a compact window that floats over the game.

<img width="1368" height="576" alt="exile-compass-new" src="https://github.com/user-attachments/assets/819103a2-7d46-4a3c-b230-a9c4d15b37cd" />

[Download the latest release »](https://github.com/juddisjudd/exilecompass/releases/latest)

[![GitHub Downloads (all assets, latest release)](https://img.shields.io/github/downloads/juddisjudd/exilecompass/latest/total)](https://github.com/juddisjudd/exilecompass/releases) [![GitHub Release](https://img.shields.io/github/v/release/juddisjudd/exilecompass)](https://github.com/juddisjudd/exilecompass/releases)

</div>

---

## What it does

ExileCompass sits on top of the game as a small, semi-transparent overlay and
automatically appears when the game is running. A switch in the footer picks
which game you're playing — **PoE2** gets the full tool set, **PoE1** gets a
leveling-focused one — and every tab, panel and build is tagged so you always
know which game you're looking at.

### Path of Exile 2

- **Campaign Guide** — A collapsible act → zone → objective checklist for the
  full campaign (including the current interludes), with per-act progress bars,
  speedrun tips per act, and an optional filter for current-league mechanics.
  **Auto-progress** follows your `Client.txt` log and keeps a "you are here"
  marker on the zone you're in, expanding and scrolling to it as you play.

- **Passive Boosts (Rewards)** — A complete checklist of every permanent reward
  in the campaign: passive skill points, resistances, spirit, life/mana, and the
  swappable/choice buffs — with their source, location, and act. Totals add up
  automatically, and with the log file set, rewards **tick themselves off as you
  earn them**.

- **Regex (Stash Search)** — Build in-game stash search strings without
  memorizing syntax. Pick from categorized snippets, combine them with
  AND/OR/NOT groups, apply presets, save favourites, and copy — with a live
  250-character counter so you stay under the game's limit.

- **Craft (Crafting Guides)** — Step-by-step crafting walkthroughs, browsable by
  equipment slot, with the currency/omens for every step, success/fail branches,
  and real item icons. Check steps off as you craft. Guides are
  community-contributed (see [Contributing](#contributing)) and refresh in the
  background, with a bundled copy so they work offline.

- **Build** — Import a build from **Path of Building** (export code or `pobb.in`
  link) or an official **GGG `.build`** file — or point Settings at your
  `BuildPlanner` folder and switch between every saved build from a dropdown.
  See your skill links and full equipment, hover any item or gem for its stats
  (including the level the guide intends it from, and which supports are linked
  where), jump to the guide it came from, and turn any item's mods into a
  ready-made stash search with one click.

### Path of Exile

- **Leveling Guide** — The full act-by-act leveling route (built on
  [exile-leveling](https://github.com/HeartofPhos/exile-leveling)), with
  league-start and library variants, per-step checkboxes, and the same
  log-driven **auto-progress** marker as the PoE2 campaign guide. Import a PoB
  build and the route gains **gem-reward steps** showing exactly which gems to
  take or buy after each quest.

- **Gems** — Your imported build's skill links, set by set.

- **Passive Tree** — A full passive tree viewer for the imported build, with
  per-spec highlighting of added/removed nodes and support for multiple tree
  versions side by side.

- **Regex** — The PoE1 vendor/stash regex builder.

- **Act-Decoder** — A separate floating window showing the zone layout for the
  area you're in, switching automatically as you change zones
  (`Ctrl + Shift + D`). Position and opacity are remembered.

### Both games

- **Timer** — A **Manual** stopwatch with start/pause/resume and named splits,
  and a **Campaign** mode that starts a run and splits it per act automatically
  from the game log. Each game keeps its own campaign run.

- **Voice Commands** — Say a phrase like *"compass next"* and the overlay acts
  on it. Fully offline: a bundled speech model listens for a fixed phrase list,
  nothing is recorded or sent anywhere. See [Voice commands](#voice-commands).

- **Add-ons** — Install community add-ons from the ExileCompass registry (or a
  manifest URL), pin their panels as top-level tabs, and manage permissions and
  updates from the Add-ons hub.

- **Themes & appearance** — Seven colour themes (Default, Abyss, Breach,
  Ritual, Vaal, Aldur, Mono), an overlay-wide font-size slider, click-through
  opacity, and a live CPU / memory readout in the footer.

### Automatic tracking from the game log

Point ExileCompass at your `Client.txt` (Settings → Log File → Auto Detect — it
checks the running game, your Steam library and the Windows install registry
before asking you to browse) and it will watch for rewards, zone changes and
campaign splits as they happen. Each game remembers its own log path. It only
reacts to new events going forward — it won't re-check rewards from previous
characters — and you can clear it anytime.

---

## Voice commands

Enable them with the **mic toggle in the footer** (or Settings → Voice
Commands), pick your microphone, and talk. Every command starts with
*"compass"* so ordinary speech doesn't trigger anything — say it as one phrase,
without a pause.

| Say | Does |
|-----|------|
| **compass next** / **compass back** | Complete / undo the next objective (campaign or leveling step) |
| **compass campaign · rewards · build · timer** | Switch tabs |
| **compass start timer · stop timer · reset timer · split** | Drive whichever timer mode is showing |
| **compass run time** | Hear the elapsed run time |
| **compass manual timer · campaign timer** | Switch timer mode |
| **compass click through on / off** (or **lock / unlock overlay**) | Toggle click-through — handy when the mouse already passes through |
| **compass first … fifth skill**, **compass skills** | Hear a skill gem, or list them all |
| **compass first skill supports**, **compass spirit gems**, … | Hear what's linked |
| **compass helmet · weapon · rings · boots …** | Hear what's in a slot |
| **compass helmet stats · weapon stats …** | Hear the slot's mods / stat priorities |
| **compass uniques · flasks · charms · build info** | Lists and build identity |

The full list, grouped, lives in Settings → Voice Commands. Phrases are fixed
(this is keyword spotting, not dictation), which is what keeps it fast, offline
and private.

### Voice replies

Build-info and timer commands answer out loud. By default that's your system's
built-in voice — free, nothing to set up. For a far better voice, add your own
**ElevenLabs** key (Settings → Voice Replies): it's stored in your OS keychain,
you use your own account and credits, and the voice picker shows which voices
are free on every plan versus paid-only. Either way you can choose the
**output device**, so replies go to your headset while game audio stays on the
speakers.

---

## Install

Grab the latest build from the [**Releases**](https://github.com/juddisjudd/exilecompass/releases/latest) page:

| Platform | Download |
|----------|----------|
| **Windows** | `ExileCompass_<version>_x64-setup.exe` — run the installer |
| **Linux (AppImage)** | `ExileCompass_<version>_amd64.AppImage` — `chmod +x` it and run |
| **Linux (Debian/Ubuntu)** | `ExileCompass_<version>_amd64.deb` — `sudo apt install ./ExileCompass_<version>_amd64.deb` |
| **Arch / CachyOS (AUR)** | `paru -S exilecompass-bin` (or `yay -S exilecompass-bin`) |

The app checks for updates on launch and can install them in one click. (The AUR
package updates through your AUR helper instead.)

> **Note:** Windows is the primary, fully-supported platform. The Linux builds
> run and all the standalone tools work, but automatic detection/attachment to
> the game window is currently Windows-only.

---

## Getting started

1. Launch Path of Exile 2 (or Path of Exile, and flip the footer switch).
2. Start ExileCompass — a short first-run setup connects your log file and
   shows you the hotkeys; after that it detects the game and shows the overlay
   automatically.
3. Pick a tab and go. Checklists, settings, themes, imported builds and voice
   preferences are all saved between sessions.

### Overlay controls

- **Click-through mode** — Let mouse clicks pass straight through the overlay to
  the game while it stays visible. Toggle it with the hotkey, or by voice; you
  can set how transparent the overlay becomes in this mode (Settings →
  Hotkeys → Click-Through Opacity).
- **Move / resize** — Drag the title bar to move; drag edges to resize. Position
  and size are remembered.
- **Drag & drop a build** — Drop a `.build` file anywhere on the window to import
  it instantly.

### Default hotkeys

| Action | Shortcut |
|--------|----------|
| Toggle click-through mode | `Ctrl + Shift + C` |
| Hide / show overlay | `Ctrl + Shift + H` |
| Refresh game detection | `Ctrl + Shift + R` |
| Open / close settings | `Ctrl + Shift + ,` |
| Start / stop the timer | `Ctrl + Shift + T` |
| Complete next objective | `Ctrl + Shift + X` |
| Undo last objective | `Ctrl + Shift + Z` |
| Toggle Act-Decoder window (PoE1) | `Ctrl + Shift + D` |

All hotkeys can be rebound in **Settings → Hotkeys**. (Click-through works as a
global shortcut, even when the overlay isn't focused.)

---

## Languages

The interface is available in **9 languages**: English, Deutsch, Español,
Français, 日本語, 한국어, Português (Brasil), Русский, and 简体中文. Change it under
**Settings → Language**.

---

## Privacy

ExileCompass keeps everything on your machine — there's no account and no
telemetry. Voice recognition runs entirely offline; audio never leaves your PC.
Network activity is limited to:

- checking GitHub for updates;
- fetching crafting guides, guide ratings and the add-ons registry from
  `exilecompass.com`;
- fetching a build if you paste a `pobb.in` link;
- and, **only if you add your own key**, sending reply text to ElevenLabs to be
  spoken. Without a key, the built-in system voice is used and nothing is sent.

---

## Troubleshooting

- **Overlay doesn't appear** — Make sure the game is running and the footer
  switch is set to the game you launched, then press `Ctrl + Shift + R` to
  refresh detection.
- **Can't click the game** — You're likely in click-through mode; press
  `Ctrl + Shift + C` to toggle it back, or say *"compass click through off"*.
- **Rewards / auto-progress aren't updating** — Confirm the log file is set for
  the active game in Settings → Log File (use Auto Detect, or Browse to your
  `Client.txt`).
- **Voice commands don't hear me** — Open Settings → Voice Commands and watch
  the mic level meter while you talk. If it stays flat, pick a different input
  device; if it moves but nothing triggers, say the phrase as one continuous
  *"compass …"* without pausing after "compass".
- **Voice commands switched themselves off** — If the app didn't start cleanly
  while they were enabled, they're disabled on the next launch to be safe.
  Turn them back on from the footer.
- **ElevenLabs voice fails with a payment error** — That voice needs a paid
  ElevenLabs plan; pick one from the "Free on every plan" group.
- **Windows Defender / SmartScreen flags the installer or exe** — The Windows
  build isn't code-signed yet, and an unsigned auto-updating app that reads the
  game window's title (to find and attach to it) matches the heuristic profile
  Defender uses for a lot of real malware, so it's a false positive that shows
  up more for newer/less-downloaded releases. Two options:
  - Report it to Microsoft as a false positive (fixes it for everyone, no local
    changes needed): https://www.microsoft.com/en-us/wdsi/filesubmission —
    submit the flagged installer file, category "Software developer", and it
    usually clears within a day or two once reviewed.
  - Or add a local exclusion yourself: run
    [`scripts/add-defender-exclusion.ps1`](scripts/add-defender-exclusion.ps1)
    from this repo (right-click → *Run with PowerShell as Administrator*) after
    installing. It only excludes ExileCompass's own install folder/exe — review
    the script before running it, as with any admin-elevated script from the
    internet.

### Linux

The overlay runs on top of WebKitGTK. Recent WebKitGTK versions default to a
DMA-BUF / GPU rendering path that fails to initialize on many driver, Wayland,
and virtual-machine setups, leaving a blank white window. ExileCompass works
around this out of the box by starting **non-transparent on Linux**, **disabling
the DMA-BUF renderer and GPU compositing**, and showing the window immediately
(no blank first frame). Hardware rendering is used by default — it works on most
real machines.

If you still get a **blank/white window** — most common in virtual machines or
with headless / broken GPU drivers — force software rendering:

```bash
EXILECOMPASS_SOFTWARE_RENDER=1 ./ExileCompass_<version>_amd64.AppImage
```

Environment variables you can set:

| Variable | Effect |
|----------|--------|
| `EXILECOMPASS_SOFTWARE_RENDER=1` | Force Mesa software rendering (`llvmpipe`). Fixes blank windows in VMs and on broken GPU/EGL stacks. Disables transparency. |
| `EXILECOMPASS_TRANSPARENT=1` | Render the overlay transparent (the Windows look). Only works if your compositor supports it and software rendering is off — otherwise the window may render black or blank. |
| `WEBKIT_DISABLE_DMABUF_RENDERER` / `WEBKIT_DISABLE_COMPOSITING_MODE` | Both default to `1`. Set either to `0` to re-enable the GPU path. |
| `GDK_BACKEND` | Not set by ExileCompass — GTK auto-selects. Set to `x11` or `wayland` to force a backend (try `x11` on Wayland/NVIDIA if rendering misbehaves). |

- **Blank window with `EGL_BAD_PARAMETER`, `ZINK: vkCreateInstance failed`, or
  `failed to create dri2 screen`** — the GPU/Vulkan stack isn't usable (typical
  inside a VM). Force software rendering:
  ```bash
  EXILECOMPASS_SOFTWARE_RENDER=1 ./ExileCompass_<version>_amd64.AppImage
  ```
  If those Mesa errors persist, also pin the software driver:
  ```bash
  GALLIUM_DRIVER=llvmpipe EXILECOMPASS_SOFTWARE_RENDER=1 ./ExileCompass_<version>_amd64.AppImage
  ```
- **Wayland / NVIDIA issues** — try forcing X11: `GDK_BACKEND=x11 ./ExileCompass_<version>_amd64.AppImage`

- **Voice commands and replies** — Microphone capture and audio playback use
  ALSA (`libasound2`), which every desktop distro ships. The built-in voice
  needs a system speech engine: `espeak-ng` (usually installed alongside
  `speech-dispatcher`) is enough; `pico2wave` sounds nicer if you have it.
  Without one, you'll get an install hint instead of speech — or add an
  ElevenLabs key. The ElevenLabs key uses your desktop keyring (GNOME Keyring /
  KWallet) when one is running, and falls back to the local settings file
  otherwise — Settings tells you which.

- **App won't open / blank window** — Launch it from a terminal so you can see
  the error, and check the crash log at
  `~/.local/share/exilecompass/logs/crash.txt` (or
  `$XDG_DATA_HOME/exilecompass/logs/crash.txt`). Include that file when
  reporting the issue. On Windows the same log is written to
  `%APPDATA%\ExileCompass\logs\crash.txt`.

Found a bug or have an idea? [Open an issue](https://github.com/juddisjudd/exilecompass/issues).

---

## Contributing

The campaign guide and reward data live in plain JSON files under
`src/lib/data/`, and translations live in `messages/` and `src/lib/data/i18n/` —
no coding required to fix a typo, add an objective, or translate game text. See
`src/lib/data/campaign/README.md` for the format.

**Crafting guides** are plain YAML files in [`guides/`](guides/) — one file per
craft, referencing items by name (icons resolve automatically). See
[`guides/README.md`](guides/README.md) for the format, or build one visually with
the [Guide Creator](https://exilecompass.com/guide-creator) and submit the
exported `.yaml` — either as a pull request to `guides/`, or in the
`#crafting-guides` channel on [Discord](https://discord.exilecompass.com/).

**Voice phrases** are a plain text list in
[`src-tauri/resources/kws/keywords_raw.txt`](src-tauri/resources/kws/keywords_raw.txt);
the README next to it explains how to regenerate the model's keyword file.

<details>
<summary>Building from source</summary>

ExileCompass is built with [Tauri 2](https://tauri.app/) (Rust) and
[SvelteKit 5](https://svelte.dev/). With [Bun](https://bun.sh/) and the
[Rust toolchain](https://rustup.rs/) installed:

```bash
bun install
bun tauri dev      # run in development
bun run release    # build installers
```

On Linux you'll also need the ALSA development headers (`libasound2-dev` on
Debian/Ubuntu) for microphone capture and audio playback.

</details>

---

## Credits

ExileCompass builds on data and code from other community projects:

- **[exile-leveling](https://github.com/HeartofPhos/exile-leveling)**
  (HeartofPhos) — the PoE1 leveling route data and DSL parser the leveling
  guide is built on.
- **[Exile-UI](https://github.com/Lailloken/Exile-UI)** (Lailloken) — the
  Act-Decoder zone layout images.
- **[poe-vendor-string](https://github.com/veiset/poe-vendor-string)** and
  **[poe2.re](https://github.com/veiset/poe2.re)** (veiset) — the PoE1 regex
  data and the PoE2 stash-search regex builder are ported from these.
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** (k2-fsa / Next-gen
  Kaldi) — the offline keyword-spotting engine and model behind voice commands.
- **[Path of Building (PoE1)](https://github.com/PathOfBuildingCommunity/PathOfBuilding)**
  — PoE1 build import relies on PoB's export format and gem data, and the
  passive tree viewer's ascendancy positions are sourced from PoB's own
  layout fix.
- **[Path of Building (PoE2)](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2)**
  — PoE2 build import relies on this fork's export format.
- **[skilltree-export](https://github.com/grindinggear/skilltree-export)**
  (Grinding Gear Games) — the official passive skill tree data.

Thanks to all of the above for making this possible.

---

## License

Released under the [AGPL-3.0 license](LICENSE). Not affiliated with or endorsed by
Grinding Gear Games. Path of Exile and Path of Exile 2 are trademarks of
Grinding Gear Games.
