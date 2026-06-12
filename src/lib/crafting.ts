// Data-driven crafting guides. Each guide is an ordered list of steps the
// player checks off as they craft; steps can show the currency/omens/essences
// they consume, flag "spam until X" loops, and carry success/fail branches for
// gamble steps (fracturing, whittling).
//
// MVP: guide content is English-only (no dataI18n layer yet).

export interface CraftingItemRef {
  /** Display name shown in the chip/tooltip, e.g. "Perfect Regal Orb". */
  name: string;
  /** Image path under /static, e.g. "/currency/Regal Orb.webp". */
  icon: string;
}

export interface CraftingBranch {
  kind: 'success' | 'fail';
  /** What to do when this branch hits. */
  text: string;
  /** Items used to recover/continue in this branch. */
  items?: CraftingItemRef[];
}

export interface CraftingStep {
  id: string;
  /** One-line action, e.g. "Fracture the T1 prefix". */
  title: string;
  /** Longer explanation shown under the title. */
  detail?: string;
  /** Currency/omens/essences consumed by this step. */
  items?: CraftingItemRef[];
  /** Marks "repeat until you hit X" steps. */
  repeat?: boolean;
  branches?: CraftingBranch[];
}

export type EquipmentSlot =
  | 'weapon'
  | 'offhand'
  | 'quiver'
  | 'helmet'
  | 'body'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring';

/** Display order + labels for the slot picker (English-only, like guide content). */
export const EQUIPMENT_SLOTS: Array<{ id: EquipmentSlot; label: string }> = [
  { id: 'weapon', label: 'Weapon' },
  { id: 'offhand', label: 'Off-Hand' },
  { id: 'quiver', label: 'Quiver' },
  { id: 'helmet', label: 'Helmet' },
  { id: 'body', label: 'Body Armour' },
  { id: 'gloves', label: 'Gloves' },
  { id: 'boots', label: 'Boots' },
  { id: 'belt', label: 'Belt' },
  { id: 'amulet', label: 'Amulet' },
  { id: 'ring', label: 'Ring' },
];

export interface CraftingGuideData {
  id: string;
  /** Equipment piece this craft is for — drives the slot picker. */
  slot: EquipmentSlot;
  /** Craft name shown in the slot listing, e.g. "+2 Projectiles (Ice Shot / Twisters)". */
  name: string;
  /** What the finished item is for. */
  goal: string;
  /** The base item the craft starts from. */
  base: CraftingItemRef;
  steps: CraftingStep[];
}

const currency = (name: string, file = name): CraftingItemRef => ({
  name,
  icon: `/currency/${file}.webp`,
});
const omen = (name: string): CraftingItemRef => ({ name, icon: `/omen/${name}.webp` });
const essence = (name: string): CraftingItemRef => ({ name, icon: `/essence/${name}.webp` });
const augment = (name: string): CraftingItemRef => ({ name, icon: `/augment/${name}.webp` });

export const CRAFTING_GUIDES: CraftingGuideData[] = [
  {
    id: 'gloves-plus2-projectiles',
    slot: 'gloves',
    name: '+2 Projectiles (Ice Shot / Twisters)',
    goal: 'Attack gloves: fractured T1 flat damage, +2 Projectiles, crit damage and additional-projectile chance.',
    base: { name: 'Exceptional Secured Wraps', icon: '/items/Secured Wraps.webp' },
    steps: [
      {
        id: 'base',
        title: 'Start with the base gloves',
        detail: 'Get an "Exceptional Secured Wraps" base to craft on.',
        items: [{ name: 'Exceptional Secured Wraps', icon: '/items/Secured Wraps.webp' }],
      },
      {
        id: 'kolrs-hunt',
        title: "Insert Kolr's Hunt",
        detail: "Socket Kolr's Hunt into the gloves.",
        items: [augment("Kolr's Hunt")],
      },
      {
        id: 'perfect-aug',
        title: 'Use a Perfect Orb of Augmentation',
        items: [currency('Perfect Orb of Augmentation', 'Orb of Augmentation')],
      },
      {
        id: 'perfect-regal',
        title: 'Use a Perfect Regal Orb',
        items: [currency('Perfect Regal Orb', 'Regal Orb')],
      },
      {
        id: 'roll-t1-prefix',
        title: 'Roll a T1 flat damage prefix',
        detail:
          'Use Chaos Orbs and Orbs of Annulment until you roll a Tier 1 prefix such as T1 Lightning, Fire or Physical Damage to Attacks.',
        repeat: true,
        items: [currency('Chaos Orb'), currency('Orb of Annulment')],
      },
      {
        id: 'fracture',
        title: 'Fracture the T1 prefix',
        detail: 'Use a Fracturing Orb with a Preserved Rib to fracture the T1 prefix.',
        items: [currency('Fracturing Orb'), currency('Preserved Rib')],
        branches: [
          { kind: 'success', text: 'The T1 prefix is fractured — continue to the next step.' },
          { kind: 'fail', text: 'It fractured the wrong mod — start over from the beginning.' },
        ],
      },
      {
        id: 'chaos-spam-projectiles',
        title: 'Chaos spam for +2 Projectiles',
        detail: 'Chaos spam the fractured gloves until you hit the +2 Projectiles modifier.',
        repeat: true,
        items: [currency('Chaos Orb')],
      },
      {
        id: 'crit-suffix',
        title: 'Guarantee the Critical Damage suffix',
        detail:
          'Use Omen of Sinistral Exaltation + Exalted Orb, then Omen of Sinistral Crystallisation + Essence of Hysteria to guarantee Critical Damage on a suffix.',
        items: [
          omen('Omen of Sinistral Exaltation'),
          currency('Exalted Orb'),
          omen('Omen of Sinistral Crystallisation'),
          essence('Essence of Hysteria'),
        ],
      },
      {
        id: 'unveil-projectile-suffix',
        title: 'Unveil the additional-projectile suffix',
        detail:
          'Use an Ancient Rib with Omen of Dextral Necromancy, Omen of Light and Omen of Abyssal Echoes to unveil a suffix — you want "+#% Surpassing chance to Fire an Additional Projectile". Annul and repeat until you hit it.',
        repeat: true,
        items: [
          currency('Ancient Rib'),
          omen('Omen of Dextral Necromancy'),
          omen('Omen of Light'),
          omen('Omen of Abyssal Echoes'),
          currency('Orb of Annulment'),
        ],
      },
      {
        id: 'exalt-prefix',
        title: 'Exalt the open prefix',
        detail: 'Use a Greater or Perfect Exalted Orb to fill a prefix.',
        items: [currency('Greater / Perfect Exalted Orb', 'Exalted Orb')],
      },
      {
        id: 'whittle-final-prefix',
        title: 'Whittle to the final prefix',
        detail:
          'Use Omen of Whittling + Chaos Orb to reroll the lowest-level mod until you land a desirable final prefix.',
        repeat: true,
        items: [omen('Omen of Whittling'), currency('Chaos Orb')],
        branches: [
          {
            kind: 'fail',
            text: "If the whittle hits a bad mod (like Runic Ward): insert Astrid's Creativity, then use Sovereign Alloy + Omen of Sinistral Crystallisation to safely remove the prefix, and keep whittling.",
            items: [
              augment("Astrid's Creativity"),
              currency('Sovereign Alloy'),
              omen('Omen of Sinistral Crystallisation'),
            ],
          },
        ],
      },
    ],
  },
];
