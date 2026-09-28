# Voice commands

Every command starts with **"compass"**. Say the whole phrase as one piece, without a pause after "compass". Recognition runs offline against a bundled keyword model; nothing is recorded or sent anywhere.

Turn voice commands on with the mic toggle in the footer, or in Settings → Voice Commands, where you can also pick the microphone. Commands that answer out loud use the voice engine chosen in Settings → Voice Replies: your system voice, a downloadable offline neural voice (Piper or Kokoro), or your own ElevenLabs key.

69 commands, 85 spoken forms.

## Objectives

| Say | Does |
|-----|------|
| **compass next** | Complete the next objective |
| **compass back** or **compass undo** | Undo the last completed objective |
| **compass whats next** or **compass current step** | Hear the next step without completing it |

## Run Timer

| Say | Does |
|-----|------|
| **compass start timer** or **compass resume timer** | Start or resume the run timer |
| **compass stop timer** or **compass pause timer** | Stop or pause the run timer |
| **compass reset timer** | Reset the run timer |
| **compass run time** | Hear the current run time |
| **compass split** | Record a split (manual mode) |
| **compass manual timer** | Switch the timer to Manual |
| **compass auto timer** | Switch the timer to Campaign |

## Navigation

| Say | Does |
|-----|------|
| **compass rewards** | Switch to Rewards tab (PoE2) |
| **compass campaign** or **compass guide** | Switch to Campaign tab (PoE2) / Leveling tab (PoE1) |
| **compass show build** or **compass open build** | Switch to Build tab (PoE2) / Gems tab (PoE1) |
| **compass leveling** | Switch to Leveling tab (PoE1) / Campaign tab (PoE2) |
| **compass gems** | Switch to Gems tab (PoE1) |
| **compass tree** or **compass passive tree** | Switch to Tree tab (PoE1) |
| **compass stash** or **compass search** or **compass stash search** or **compass find** | Switch to Regex tab |
| **compass crafting** | Switch to Craft tab (PoE2) |
| **compass add ons** or **compass addons** | Switch to Add-ons tab |
| **compass timer** | Switch to Timer tab |
| **compass copy search** or **compass copy regex** | Copy the Regex tab's current search to the clipboard |

## Overlay

| Say | Does |
|-----|------|
| **compass click through on** or **compass lock overlay** | Let clicks pass through to the game |
| **compass click through off** or **compass unlock overlay** | Make the overlay clickable again |
| **compass hide overlay** | Hide the overlay |
| **compass show overlay** | Show the overlay again |
| **compass path of exile one** | Switch the overlay to Path of Exile 1 |
| **compass path of exile two** | Switch the overlay to Path of Exile 2 |
| **compass quiet** or **compass stop talking** | Stop the reply that is playing |

## Build Info

| Say | Does |
|-----|------|
| **compass first skill** | First skill gem |
| **compass second skill** | Second skill gem |
| **compass third skill** | Third skill gem |
| **compass fourth skill** | Fourth skill gem |
| **compass fifth skill** | Fifth skill gem |
| **compass skills** | List all skill gems |
| **compass first supports** | First skill's support gems |
| **compass second supports** | Second skill's support gems |
| **compass third supports** | Third skill's support gems |
| **compass fourth supports** | Fourth skill's support gems |
| **compass fifth supports** | Fifth skill's support gems |
| **compass spirit gem** or **compass spirit gems** | Spirit gems |
| **compass spirit supports** | Spirit gems' support gems |
| **compass about build** | Build name, class, level and author |
| **compass switch build** | Switch to the next saved build (PoE1) |
| **compass change tree** | Show the build's next passive tree (PoE1) |
| **compass previous tree** | Show the build's previous passive tree (PoE1) |

## Equipment

| Say | Does |
|-----|------|
| **compass weapon** | Weapon and off-hand |
| **compass helmet** | Helmet |
| **compass body armour** | Body armour |
| **compass gloves** | Gloves |
| **compass boots** | Boots |
| **compass amulet** | Amulet |
| **compass rings** | Both rings |
| **compass belt** | Belt |
| **compass uniques** | List unique items |
| **compass flasks** | Flasks |
| **compass charms** | Charms |
| **compass read weapon** | Weapon stats |
| **compass read helmet** | Helmet stats |
| **compass read body armour** | Body armour stats |
| **compass read gloves** | Gloves stats |
| **compass read boots** | Boots stats |
| **compass read amulet** | Amulet stats |
| **compass read rings** | Both rings' stats |
| **compass read belt** | Belt stats |

## Act-Decoder (PoE1)

| Say | Does |
|-----|------|
| **compass open decoder** | Open the Act-Decoder |
| **compass close decoder** | Close the Act-Decoder |
| **compass change layout** | Show the next layout for this zone |
| **compass rotate layout** | Rotate the layout a quarter turn |
| **compass flip layout** | Flip the layout left to right |

## Tips

- If a command is not picked up, say it again as one continuous phrase. A pause after "compass" is the most common cause of a miss.
- Settings → Voice Commands shows a live microphone level. If it stays flat while you talk, pick a different input device.
- Build commands read from the active game's imported build: the Build tab's build in PoE2, the active saved PoB build in PoE1. PoE1 builds carry gems but no gear, so equipment and spirit commands answer only in PoE2.
- Objective commands act on whichever guide is active (the PoE2 campaign guide or the PoE1 leveling guide) and say which step they completed or undid.
- A new reply cuts off the one still playing. Say **compass quiet** to stop a reply.
- Timer commands act on the timer mode currently showing (Manual or Campaign).
- Missing a phrase you would use? Suggest it in a [GitHub issue](https://github.com/juddisjudd/exilecompass/issues). This page is regenerated from the app automatically, so it always matches the installed version.

<!-- Generated by tools/build-voice-docs.mjs from keywords_raw.txt, voicePhrases.ts and messages/en.json. Do not edit by hand; run `bun run voice-docs`. -->
