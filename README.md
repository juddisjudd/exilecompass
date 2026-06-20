<div align="center">

# ExileCompass

**A sleek, always-on-top companion overlay for Path of Exile 2.**

Track your campaign, never miss a permanent reward, build stash search strings,
time your runs, and keep your build's gems and gear one glance away — all in a
compact window that floats over the game.

<img width="1679" height="733" alt="exilecompass" src="https://github.com/user-attachments/assets/b5f843ad-9c72-410c-9ee2-b6e01c211c7a" />


[Download the latest release »](https://github.com/juddisjudd/exilecompass/releases/latest)

[![GitHub Downloads (all assets, latest release)](https://img.shields.io/github/downloads/juddisjudd/exilecompass/latest/total)](https://github.com/juddisjudd/exilecompass/releases) [![GitHub Release](https://img.shields.io/github/v/release/juddisjudd/exilecompass)](https://github.com/juddisjudd/exilecompass/releases)

</div>

---

## What it does

ExileCompass sits on top of Path of Exile 2 as a small, semi-transparent overlay
and automatically appears when the game is running. Everything lives in one tidy
panel with tabs:

- **Campaign Guide** — A collapsible act → zone → objective checklist for the
  full campaign (including the current interludes), with per-act progress bars.
  Check things off as you go; your progress is saved.

- **Passive Boosts (Rewards)** — A complete checklist of every permanent reward
  in the campaign: passive skill points, resistances, spirit, life/mana, and the
  swappable/choice buffs — with their source, location, and act. Totals add up
  automatically as you collect them.

- **Regex (Stash Search)** — Build powerful in-game stash search strings without
  memorizing syntax. Pick from categorized snippets (defences, resistances,
  damage, gear, weapons, gems, currency…), combine them with AND/OR/NOT groups,
  apply ready-made presets, test against pasted item text, and copy — with a live
  250-character counter so you stay under the game's limit.

- **Craft (Crafting Guides)** — Step-by-step crafting walkthroughs, browsable by
  equipment slot. Each guide shows the currency/omens to use at every step, the
  mod(s) the step is aiming for, success/fail branches, and the finished item's
  target stats — with real item icons. Check steps off as you craft. Guides are
  community-contributed (see [Contributing](#contributing)).

- **Timer** — A speedrun timer with start/pause/resume, per-act splits, and
  reset.

- **Build** — Import a build from **Path of Building** (export code or `pobb.in`
  link) or an official **GGG `.build`** file. See your skill links and full
  equipment, hover any item for its stats, read the build notes, and switch
  between multiple skill/item sets.

### Automatic reward tracking

Point ExileCompass at your PoE2 `Client.txt` log file (Settings → Log File →
Auto Detect) and it will **watch for rewards as you earn them** and tick them off
the Passive Boosts list for you. It only reacts to new events going forward — it
won't re-check rewards from previous characters — and you can clear it anytime.

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
> run and all the standalone tools (campaign, rewards, regex, timer, build
> import) work, but automatic detection/attachment to the game window is
> currently Windows-only.

---

## Getting started

1. Launch Path of Exile 2.
2. Start ExileCompass — it detects the game and shows the overlay automatically.
3. Pick a tab and go. Your checklists, settings, and imported build are saved
   between sessions.

### Overlay controls

- **Click-through mode** — Let mouse clicks pass straight through the overlay to
  the game while it stays visible. Toggle it with the hotkey below; you can set
  how transparent the overlay becomes in this mode (Settings → Hotkeys →
  Click-Through Opacity).
- **Move / resize** — Drag the title bar to move; drag edges to resize.
- **Drag & drop a build** — Drop a `.build` file anywhere on the window to import
  it instantly.

### Default hotkeys

| Action | Shortcut |
|--------|----------|
| Toggle click-through mode | `Ctrl + Shift + C` |
| Hide / show overlay | `Ctrl + Shift + H` |
| Refresh game detection | `Ctrl + Shift + R` |
| Open / close settings | `Ctrl + Shift + ,` |
| Start / stop campaign timer | `Ctrl + Shift + T` |
| Complete next campaign objective | `Ctrl + Shift + X` |
| Undo last campaign objective | `Ctrl + Shift + Z` |

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
telemetry. Your only network activity is checking GitHub for updates and, if you
paste a `pobb.in` link, fetching that build.

---

## Troubleshooting

- **Overlay doesn't appear** — Make sure Path of Exile 2 is running, then press
  `Ctrl + Shift + R` to refresh detection.
- **Can't click the game** — You're likely in click-through mode; press
  `Ctrl + Shift + C` to toggle it back.
- **Rewards aren't auto-checking** — Confirm the log file is set in
  Settings → Log File (use Auto Detect, or Browse to your `Client.txt`).

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

</details>

---

## License

Released under the [AGPL-3.0 license](LICENSE). Not affiliated with or endorsed by
Grinding Gear Games. Path of Exile 2 is a trademark of Grinding Gear Games.
