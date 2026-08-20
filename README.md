<div align="center">

# ExileCompass

**An always-on-top companion overlay for Path of Exile 2 and Path of Exile.**

Track your campaign, collect every permanent reward, build stash search strings,
time your runs, and keep your build's gems and gear one glance away. You can
drive all of it with your voice. It runs in a compact window that floats over
the game.

<img width="1368" height="576" alt="exile-compass-new" src="https://github.com/user-attachments/assets/819103a2-7d46-4a3c-b230-a9c4d15b37cd" />

[Download the latest release »](https://github.com/juddisjudd/exilecompass/releases/latest)

[![GitHub Downloads (all assets, latest release)](https://img.shields.io/github/downloads/juddisjudd/exilecompass/latest/total)](https://github.com/juddisjudd/exilecompass/releases) [![GitHub Release](https://img.shields.io/github/v/release/juddisjudd/exilecompass)](https://github.com/juddisjudd/exilecompass/releases)

</div>

---

## What it does

ExileCompass sits on top of the game as a small, semi-transparent overlay. It
appears automatically when the game is running. A switch in the footer picks
which game you are playing. **PoE2** gets the full tool set and **PoE1** gets a
leveling-focused one. Every tab, panel and build is tagged with its game so you
always know which one you are looking at.

### Path of Exile 2

- **Campaign Guide.** A collapsible act → zone → objective checklist for the
  full campaign, including the current interludes. Each act has a progress bar,
  speedrun tips, and an optional filter for current-league mechanics.
  **Auto-progress** reads your `Client.txt` log and keeps a "you are here"
  marker on the zone you are in. It expands and scrolls to that zone as you
  play.

- **Passive Boosts (Rewards).** A checklist of every permanent reward in the
  campaign: passive skill points, resistances, spirit, life/mana, and the
  swappable buffs. Each entry shows its source, location, and act. Totals add up
  automatically. With the log file set, rewards **tick themselves off as you
  earn them**.

- **Regex (Stash Search).** Build in-game stash search strings without
  memorizing syntax. Pick from categorized snippets, combine them with
  AND/OR/NOT groups, apply presets, save favourites, and copy. A live
  250-character counter keeps you under the game's limit.

- **Craft (Crafting Guides).** Step-by-step crafting walkthroughs, browsable by
  equipment slot. Each step shows the currency or omens to use, the success and
  fail branches, and real item icons. Check steps off as you craft. Guides are
  community-contributed (see [Contributing](#contributing)). They refresh in the
  background, and a bundled copy works offline.

- **Build.** Import a build from **Path of Building** (export code or `pobb.in`
  link) or an official **GGG `.build`** file. Or point Settings at your
  `BuildPlanner` folder and switch between every saved build from a dropdown.
  See your skill links and full equipment. Hover any item or gem for its stats,
  including the level the guide intends it from and which supports are linked
  where. Open the guide the build came from, or turn any item's mods into a
  stash search with one click.

### Path of Exile

- **Leveling Guide.** The full act-by-act leveling route, built on
  [exile-leveling](https://github.com/HeartofPhos/exile-leveling). It has
  league-start and library variants, per-step checkboxes, and the same
  log-driven **auto-progress** marker as the PoE2 campaign guide. Import a PoB
  build and the route gains **gem-reward steps** that show which gems to take
  or buy after each quest.

- **Gems.** Your imported build's skill links, set by set.

- **Passive Tree.** A full passive tree viewer for the imported build. It
  highlights the nodes each spec adds or removes, and it supports several tree
  versions side by side.

- **Regex.** The PoE1 vendor and stash regex builder.

- **Act-Decoder.** A separate floating window that shows the zone layout for
  the area you are in. It switches automatically as you change zones
  (`Ctrl + Shift + D`). Position and opacity are remembered.

### Both games

- **Timer.** A **Manual** stopwatch with start, pause, resume and named splits.
  A **Campaign** mode starts a run and splits it per act automatically from the
  game log. Each game keeps its own campaign run.

- **Voice Commands.** Say a phrase like *"compass next"* and the overlay acts
  on it. It works fully offline: a bundled speech model listens for a fixed
  phrase list. Nothing is recorded or sent anywhere. See
  [Voice commands](#voice-commands).

- **Add-ons.** Install community add-ons from the ExileCompass registry or from
  a manifest URL. Pin their panels as top-level tabs. Manage permissions and
  updates from the Add-ons hub.

- **Themes and appearance.** Seven colour themes (Default, Abyss, Breach,
  Ritual, Vaal, Aldur, Mono), an overlay-wide font-size slider, click-through
  opacity, and a live CPU and memory readout in the footer.

### Automatic tracking from the game log

Point ExileCompass at your `Client.txt` (Settings → Log File → Auto Detect).
Auto Detect checks the running game, your Steam library and the Windows install
registry before it asks you to browse. ExileCompass then watches for rewards,
zone changes and campaign splits as they happen. Each game remembers its own
log path. Tracking only reacts to new events. It will not re-check rewards from
previous characters, and you can clear it at any time.

---

## Voice commands

Enable them with the **mic toggle in the footer** or in Settings → Voice
Commands. Pick your microphone and talk. Every command starts with *"compass"*
so ordinary speech does not trigger anything. Say it as one phrase, without a
pause after "compass".

| Say | Does |
|-----|------|
| **compass next** / **compass back** | Complete or undo the next objective (campaign or leveling step) |
| **compass campaign · rewards · build · timer** | Switch tabs |
| **compass start timer · stop timer · reset timer · split** | Drive whichever timer mode is showing |
| **compass run time** | Hear the elapsed run time |
| **compass manual timer · campaign timer** | Switch timer mode |
| **compass click through on / off** (or **lock / unlock overlay**) | Toggle click-through. Useful when the mouse already passes through the overlay |
| **compass first … fifth skill**, **compass skills** | Hear one skill gem, or list them all |
| **compass first skill supports**, **compass spirit gems**, … | Hear what is linked |
| **compass helmet · weapon · rings · boots …** | Hear what is in a slot |
| **compass helmet stats · weapon stats …** | Hear the slot's mods or stat priorities |
| **compass uniques · flasks · charms · build info** | Lists and build identity |

The full grouped list is in Settings → Voice Commands. Phrases are fixed. This
is keyword spotting, not dictation, which is what keeps it fast, offline and
private.

### Voice replies

Build-info and timer commands answer out loud. By default they use your
system's built-in voice, which is free and needs no setup. For a higher-quality
voice, add your own **ElevenLabs** key in Settings → Voice Replies. The key is
stored in your OS keychain. You use your own account and credits. The voice
picker shows which voices are free on every plan and which need a paid plan.
With either voice you can choose the **output device**, so replies go to your
headset while game audio stays on the speakers.

---

## Install

Download the latest build from the [**Releases**](https://github.com/juddisjudd/exilecompass/releases/latest) page:

| Platform | Download |
|----------|----------|
| **Windows** | `ExileCompass_<version>_x64-setup.exe`. Run the installer. |
| **Linux (AppImage)** | `ExileCompass_<version>_amd64.AppImage`. `chmod +x` it and run it. |
| **Linux (Debian/Ubuntu)** | `ExileCompass_<version>_amd64.deb`. Install with `sudo apt install ./ExileCompass_<version>_amd64.deb`. |
| **Arch / CachyOS (AUR)** | `paru -S exilecompass-bin` (or `yay -S exilecompass-bin`) |

The app checks for updates on launch and can install them in one click. The AUR
package updates through your AUR helper instead.

> **Note:** Windows is the primary, fully supported platform. The Linux builds
> run and all the standalone tools work, but automatic detection of the game
> window is currently Windows-only.

---

## Getting started

1. Launch Path of Exile 2, or Path of Exile with the footer switch set to PoE1.
2. Start ExileCompass. A short first-run setup connects your log file and shows
   you the hotkeys. After that it detects the game and shows the overlay
   automatically.
3. Pick a tab. Checklists, settings, themes, imported builds and voice
   preferences are saved between sessions.

### Overlay controls

- **Click-through mode.** Mouse clicks pass straight through the overlay to the
  game while the overlay stays visible. Toggle it with the hotkey or by voice.
  Set how transparent the overlay becomes in this mode under Settings →
  Hotkeys → Click-Through Opacity.
- **Move and resize.** Drag the title bar to move. Drag the edges to resize.
  Position and size are remembered.
- **Drag and drop a build.** Drop a `.build` file anywhere on the window to
  import it.

### Default hotkeys

| Action | Shortcut |
|--------|----------|
| Toggle click-through mode | `Ctrl + Shift + C` |
| Hide or show overlay | `Ctrl + Shift + H` |
| Refresh game detection | `Ctrl + Shift + R` |
| Open or close settings | `Ctrl + Shift + ,` |
| Start or stop the timer | `Ctrl + Shift + T` |
| Complete next objective | `Ctrl + Shift + X` |
| Undo last objective | `Ctrl + Shift + Z` |
| Toggle Act-Decoder window (PoE1) | `Ctrl + Shift + D` |

You can rebind every hotkey in **Settings → Hotkeys**. Click-through is a
global shortcut, so it works even when the overlay is not focused.

---

## Languages

The interface is available in **9 languages**: English, Deutsch, Español,
Français, 日本語, 한국어, Português (Brasil), Русский, and 简体中文. Change it under
**Settings → Language**.

---

## Privacy

ExileCompass keeps everything on your machine. There is no account and no
telemetry. Voice recognition runs offline, and audio never leaves your PC.
Network activity is limited to:

- checking GitHub for updates;
- fetching crafting guides, guide ratings and the add-ons registry from
  `exilecompass.com`;
- fetching a build if you paste a `pobb.in` link;
- sending reply text to ElevenLabs to be spoken, **only if you add your own
  key**. Without a key, the built-in system voice is used and nothing is sent.

---

## Troubleshooting

- **Overlay doesn't appear.** Make sure the game is running and the footer
  switch is set to the game you launched. Then press `Ctrl + Shift + R` to
  refresh detection.
- **Can't click the game.** You are probably in click-through mode. Press
  `Ctrl + Shift + C` to toggle it off, or say *"compass click through off"*.
- **Rewards or auto-progress aren't updating.** Confirm the log file is set for
  the active game in Settings → Log File. Use Auto Detect, or browse to your
  `Client.txt`.
- **Voice commands don't hear me.** Open Settings → Voice Commands and watch
  the mic level meter while you talk. If it stays flat, pick a different input
  device. If it moves but nothing triggers, say the phrase as one continuous
  *"compass …"* without pausing after "compass".
- **Voice commands switched themselves off.** If the app did not start cleanly
  while they were enabled, they are disabled on the next launch as a
  precaution. Turn them back on from the footer.
- **ElevenLabs voice fails with a payment error.** That voice needs a paid
  ElevenLabs plan. Pick one from the "Free on every plan" group.
- **Windows Defender or SmartScreen flags the installer or exe.** The Windows
  build is not code-signed yet. ExileCompass is an unsigned app that updates
  itself and reads the game window's title to find and attach to it. That
  profile matches a lot of real malware, so Defender flags it. This is a false
  positive, and it shows up more for newer releases with fewer downloads. Two
  options:
  - Report it to Microsoft as a false positive. This fixes it for everyone with
    no local changes: https://www.microsoft.com/en-us/wdsi/filesubmission.
    Submit the flagged installer file under the category "Software developer".
    It usually clears within a day or two once reviewed.
  - Or add a local exclusion yourself. Run
    [`scripts/add-defender-exclusion.ps1`](scripts/add-defender-exclusion.ps1)
    from this repo (right-click → *Run with PowerShell as Administrator*) after
    installing. It only excludes ExileCompass's own install folder and exe.
    Review the script before running it, as with any admin-elevated script
    from the internet.

### Linux

The overlay runs on top of WebKitGTK. Recent WebKitGTK versions default to a
DMA-BUF / GPU rendering path that fails to initialize on many driver, Wayland,
and virtual-machine setups, which leaves a blank white window. ExileCompass
works around this out of the box. It starts **non-transparent on Linux**,
**disables the DMA-BUF renderer and GPU compositing**, and shows the window
immediately with no blank first frame. Hardware rendering is used by default
and works on most real machines.

If you still get a **blank or white window**, which is most common in virtual
machines or with headless or broken GPU drivers, force software rendering:

```bash
EXILECOMPASS_SOFTWARE_RENDER=1 ./ExileCompass_<version>_amd64.AppImage
```

Environment variables you can set:

| Variable | Effect |
|----------|--------|
| `EXILECOMPASS_SOFTWARE_RENDER=1` | Force Mesa software rendering (`llvmpipe`). Fixes blank windows in VMs and on broken GPU/EGL stacks. Disables transparency. |
| `EXILECOMPASS_TRANSPARENT=1` | Render the overlay transparent (the Windows look). Only works if your compositor supports it and software rendering is off. Otherwise the window may render black or blank. |
| `WEBKIT_DISABLE_DMABUF_RENDERER` / `WEBKIT_DISABLE_COMPOSITING_MODE` | Both default to `1`. Set either to `0` to re-enable the GPU path. |
| `GDK_BACKEND` | Not set by ExileCompass; GTK auto-selects. Set to `x11` or `wayland` to force a backend. Try `x11` on Wayland/NVIDIA if rendering misbehaves. |

- **Blank window with `EGL_BAD_PARAMETER`, `ZINK: vkCreateInstance failed`, or
  `failed to create dri2 screen`.** The GPU/Vulkan stack is not usable, which is
  typical inside a VM. Force software rendering:
  ```bash
  EXILECOMPASS_SOFTWARE_RENDER=1 ./ExileCompass_<version>_amd64.AppImage
  ```
  If those Mesa errors persist, also pin the software driver:
  ```bash
  GALLIUM_DRIVER=llvmpipe EXILECOMPASS_SOFTWARE_RENDER=1 ./ExileCompass_<version>_amd64.AppImage
  ```
- **Wayland or NVIDIA issues.** Try forcing X11: `GDK_BACKEND=x11 ./ExileCompass_<version>_amd64.AppImage`

- **Voice commands and replies.** Microphone capture and audio playback use
  ALSA (`libasound2`), which every desktop distro ships. The built-in voice
  needs a system speech engine. `espeak-ng`, usually installed alongside
  `speech-dispatcher`, is enough; `pico2wave` sounds better if you have it.
  Without one you get an install hint instead of speech, or you can add an
  ElevenLabs key. The ElevenLabs key uses your desktop keyring (GNOME Keyring
  or KWallet) when one is running and falls back to the local settings file
  otherwise. Settings tells you which one is in use.

- **App won't open or the window is blank.** Launch it from a terminal so you
  can see the error, and check the crash log at
  `~/.local/share/exilecompass/logs/crash.txt` (or
  `$XDG_DATA_HOME/exilecompass/logs/crash.txt`). Include that file when you
  report the issue. On Windows the same log is written to
  `%APPDATA%\ExileCompass\logs\crash.txt`.

Found a bug or have an idea? [Open an issue](https://github.com/juddisjudd/exilecompass/issues).

---

## Contributing

The campaign guide and reward data are plain JSON files under `src/lib/data/`.
Translations are in `messages/` and `src/lib/data/i18n/`. You do not need to
code to fix a typo, add an objective, or translate game text. See
`src/lib/data/campaign/README.md` for the format.

**Crafting guides** are plain YAML files in [`guides/`](guides/), one file per
craft. They reference items by name and icons resolve automatically. See
[`guides/README.md`](guides/README.md) for the format, or build one visually
with the [Guide Creator](https://exilecompass.com/guide-creator) and submit the
exported `.yaml`, either as a pull request to `guides/` or in the
`#crafting-guides` channel on [Discord](https://discord.exilecompass.com/).

**Voice phrases** are a plain text list in
[`src-tauri/resources/kws/keywords_raw.txt`](src-tauri/resources/kws/keywords_raw.txt).
The README next to it explains how to regenerate the model's keyword file.

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

On Linux you also need the ALSA development headers (`libasound2-dev` on
Debian/Ubuntu) for microphone capture and audio playback.

</details>

---

## Credits

ExileCompass builds on data and code from other community projects:

- **[exile-leveling](https://github.com/HeartofPhos/exile-leveling)**
  (HeartofPhos): the PoE1 leveling route data and DSL parser the leveling
  guide is built on.
- **[Exile-UI](https://github.com/Lailloken/Exile-UI)** (Lailloken): the
  Act-Decoder zone layout images.
- **[poe-vendor-string](https://github.com/veiset/poe-vendor-string)** and
  **[poe2.re](https://github.com/veiset/poe2.re)** (veiset): the PoE1 regex
  data and the PoE2 stash-search regex builder are ported from these.
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** (k2-fsa / Next-gen
  Kaldi): the offline keyword-spotting engine and model behind voice commands.
- **[Path of Building (PoE1)](https://github.com/PathOfBuildingCommunity/PathOfBuilding)**:
  PoE1 build import relies on PoB's export format and gem data, and the
  passive tree viewer's ascendancy positions come from PoB's own layout fix.
- **[Path of Building (PoE2)](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2)**:
  PoE2 build import relies on this fork's export format.
- **[skilltree-export](https://github.com/grindinggear/skilltree-export)**
  (Grinding Gear Games): the official passive skill tree data.

Thanks to all of the above for making this possible.

---

## License

Released under the [AGPL-3.0 license](LICENSE). Not affiliated with or endorsed by
Grinding Gear Games. Path of Exile and Path of Exile 2 are trademarks of
Grinding Gear Games.
