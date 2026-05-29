<div align="center">

# ExileCompass

**A sleek, always-on-top companion overlay for Path of Exile 2.**

Track your campaign, never miss a permanent reward, build stash search strings,
time your runs, and keep your build's gems and gear one glance away — all in a
compact window that floats over the game.

[Download the latest release »](https://github.com/juddisjudd/exilecompass/releases/latest)

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
| **Linux** | `ExileCompass_<version>_amd64.AppImage` — mark executable and run |

The app checks for updates on launch and can install them in one click.

> **Note:** Windows is the primary, fully-supported platform. The Linux AppImage
> runs and all the standalone tools (campaign, rewards, regex, timer, build
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
| Refresh game detection | `Ctrl + Shift + R` |
| Open/close settings | `Ctrl + Shift + ,` |

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

Found a bug or have an idea? [Open an issue](https://github.com/juddisjudd/exilecompass/issues).

---

## Contributing

The campaign guide and reward data live in plain JSON files under
`src/lib/data/`, and translations live in `messages/` and `src/lib/data/i18n/` —
no coding required to fix a typo, add an objective, or translate game text. See
`src/lib/data/campaign/README.md` for the format.

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

Released under the [MIT License](LICENSE). Not affiliated with or endorsed by
Grinding Gear Games. Path of Exile 2 is a trademark of Grinding Gear Games.
