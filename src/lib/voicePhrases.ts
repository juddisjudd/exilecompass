// Static metadata for the voice-command phrase ids: which Settings group each
// belongs to, the spoken example shown in Settings, and the i18n keys for its
// label. Kept free of Svelte runes so tools/build-voice-docs.mjs can import it
// directly and generate VOICE-COMMANDS.md from the same data the app uses.
//
// The ids themselves come from src-tauri/src/voice.rs (PHRASES) and the
// spoken forms the model listens for from src-tauri/resources/kws/
// keywords_raw.txt. Any id missing here falls into the 'other' group.

export type VoicePhrase = string;

export type VoicePhraseGroup =
  | 'objectives'
  | 'timer'
  | 'navigation'
  | 'overlay'
  | 'buildInfo'
  | 'equipment'
  | 'other';

export const VOICE_GROUP_ORDER: readonly VoicePhraseGroup[] = [
  'objectives', 'timer', 'navigation', 'overlay', 'buildInfo', 'equipment', 'other',
];

export const VOICE_GROUP_LABEL_KEYS: Record<Exclude<VoicePhraseGroup, 'other'>, string> = {
  objectives: 'voice_group_objectives',
  timer: 'voice_group_timer',
  navigation: 'voice_group_navigation',
  overlay: 'voice_group_overlay',
  buildInfo: 'voice_group_build_info',
  equipment: 'voice_group_equipment',
};

export const VOICE_PHRASE_GROUPS: Record<string, VoicePhraseGroup> = {
  next: 'objectives',
  back: 'objectives',
  nextstep: 'objectives',
  rewards: 'navigation',
  campaign: 'navigation',
  build: 'navigation',
  timer: 'navigation',
  leveling: 'navigation',
  gems: 'navigation',
  tree: 'navigation',
  stash: 'navigation',
  crafting: 'navigation',
  addons: 'navigation',
  skill1: 'buildInfo',
  skill2: 'buildInfo',
  skill3: 'buildInfo',
  skill4: 'buildInfo',
  skill5: 'buildInfo',
  skills: 'buildInfo',
  spirit: 'buildInfo',
  skill1supports: 'buildInfo',
  skill2supports: 'buildInfo',
  skill3supports: 'buildInfo',
  skill4supports: 'buildInfo',
  skill5supports: 'buildInfo',
  spiritsupports: 'buildInfo',
  buildinfo: 'buildInfo',
  weapon: 'equipment',
  helmet: 'equipment',
  bodyarmour: 'equipment',
  gloves: 'equipment',
  boots: 'equipment',
  amulet: 'equipment',
  rings: 'equipment',
  belt: 'equipment',
  uniques: 'equipment',
  flasks: 'equipment',
  charms: 'equipment',
  weaponstats: 'equipment',
  helmetstats: 'equipment',
  bodyarmourstats: 'equipment',
  glovesstats: 'equipment',
  bootsstats: 'equipment',
  amuletstats: 'equipment',
  ringsstats: 'equipment',
  beltstats: 'equipment',
  timerstart: 'timer',
  timerstop: 'timer',
  timerreset: 'timer',
  timerstatus: 'timer',
  timersplit: 'timer',
  timermodemanual: 'timer',
  timermodecampaign: 'timer',
  clickthroughon: 'overlay',
  clickthroughoff: 'overlay',
};

export function voicePhraseGroup(phrase: VoicePhrase): VoicePhraseGroup {
  return VOICE_PHRASE_GROUPS[phrase] ?? 'other';
}

/** The primary spoken form per id (always English; it is what the bundled
 *  keyword model listens for, regardless of UI locale). keywords_raw.txt may
 *  list extra alternates for the same id. */
export const VOICE_PHRASE_EXAMPLES: Record<string, string> = {
  next: 'compass next',
  back: 'compass back',
  nextstep: 'compass whats next',
  rewards: 'compass rewards',
  campaign: 'compass campaign',
  build: 'compass build',
  timer: 'compass timer',
  leveling: 'compass leveling',
  gems: 'compass gems',
  tree: 'compass tree',
  stash: 'compass stash',
  crafting: 'compass crafting',
  addons: 'compass add ons',
  skill1: 'compass first skill',
  skill2: 'compass second skill',
  skill3: 'compass third skill',
  skill4: 'compass fourth skill',
  skill5: 'compass fifth skill',
  skills: 'compass skills',
  spirit: 'compass spirit gems',
  skill1supports: 'compass first supports',
  skill2supports: 'compass second supports',
  skill3supports: 'compass third supports',
  skill4supports: 'compass fourth supports',
  skill5supports: 'compass fifth supports',
  spiritsupports: 'compass spirit supports',
  buildinfo: 'compass about build',
  weapon: 'compass weapon',
  helmet: 'compass helmet',
  bodyarmour: 'compass body armour',
  gloves: 'compass gloves',
  boots: 'compass boots',
  amulet: 'compass amulet',
  rings: 'compass rings',
  belt: 'compass belt',
  uniques: 'compass uniques',
  flasks: 'compass flasks',
  charms: 'compass charms',
  weaponstats: 'compass read weapon',
  helmetstats: 'compass read helmet',
  bodyarmourstats: 'compass read body armour',
  glovesstats: 'compass read gloves',
  bootsstats: 'compass read boots',
  amuletstats: 'compass read amulet',
  ringsstats: 'compass read rings',
  beltstats: 'compass read belt',
  timerstart: 'compass start timer',
  timerstop: 'compass stop timer',
  timerreset: 'compass reset timer',
  timerstatus: 'compass run time',
  timersplit: 'compass split',
  timermodemanual: 'compass manual timer',
  timermodecampaign: 'compass auto timer',
  clickthroughon: 'compass click through on',
  clickthroughoff: 'compass click through off',
};

/** i18n key (messages/*.json) holding each phrase's description. */
export const VOICE_PHRASE_LABEL_KEYS: Record<string, string> = {
  next: 'voice_phrase_next',
  back: 'voice_phrase_back',
  nextstep: 'voice_phrase_nextstep',
  rewards: 'voice_phrase_rewards',
  campaign: 'voice_phrase_campaign',
  build: 'voice_phrase_build',
  timer: 'voice_phrase_timer',
  leveling: 'voice_phrase_leveling',
  gems: 'voice_phrase_gems',
  tree: 'voice_phrase_tree',
  stash: 'voice_phrase_stash',
  crafting: 'voice_phrase_crafting',
  addons: 'voice_phrase_addons',
  skill1: 'voice_phrase_skill1',
  skill2: 'voice_phrase_skill2',
  skill3: 'voice_phrase_skill3',
  skill4: 'voice_phrase_skill4',
  skill5: 'voice_phrase_skill5',
  skills: 'voice_phrase_skills',
  spirit: 'voice_phrase_spirit',
  skill1supports: 'voice_phrase_skill1_supports',
  skill2supports: 'voice_phrase_skill2_supports',
  skill3supports: 'voice_phrase_skill3_supports',
  skill4supports: 'voice_phrase_skill4_supports',
  skill5supports: 'voice_phrase_skill5_supports',
  spiritsupports: 'voice_phrase_spirit_supports',
  buildinfo: 'voice_phrase_build_info',
  weapon: 'voice_phrase_weapon',
  helmet: 'voice_phrase_helmet',
  bodyarmour: 'voice_phrase_bodyarmour',
  gloves: 'voice_phrase_gloves',
  boots: 'voice_phrase_boots',
  amulet: 'voice_phrase_amulet',
  rings: 'voice_phrase_rings',
  belt: 'voice_phrase_belt',
  uniques: 'voice_phrase_uniques',
  flasks: 'voice_phrase_flasks',
  charms: 'voice_phrase_charms',
  weaponstats: 'voice_phrase_weapon_stats',
  helmetstats: 'voice_phrase_helmet_stats',
  bodyarmourstats: 'voice_phrase_bodyarmour_stats',
  glovesstats: 'voice_phrase_gloves_stats',
  bootsstats: 'voice_phrase_boots_stats',
  amuletstats: 'voice_phrase_amulet_stats',
  ringsstats: 'voice_phrase_rings_stats',
  beltstats: 'voice_phrase_belt_stats',
  timerstart: 'voice_phrase_timer_start',
  timerstop: 'voice_phrase_timer_stop',
  timerreset: 'voice_phrase_timer_reset',
  timerstatus: 'voice_phrase_timer_status',
  timersplit: 'voice_phrase_timer_split',
  timermodemanual: 'voice_phrase_timer_mode_manual',
  timermodecampaign: 'voice_phrase_timer_mode_campaign',
  clickthroughon: 'voice_phrase_click_through_on',
  clickthroughoff: 'voice_phrase_click_through_off',
};
