// Shared type definitions for every data-driven content file.
// Adding content (ingredients, potions, customers, quests, upgrades) should
// only require editing the data files – systems read these definitions.

import type { LocalizedText, Text } from '../core/i18n';

// ---------------------------------------------------------------------------
// Aspects (the "chemistry" dimensions of the potion system)
// ---------------------------------------------------------------------------

export type AspectId =
  | 'fire'
  | 'heat'
  | 'power'
  | 'strength'
  | 'shadow'
  | 'darkness'
  | 'night'
  | 'poison'
  | 'light'
  | 'magic'
  | 'healing'
  | 'glow'
  | 'speed'
  | 'chaos'
  | 'frost'
  | 'vision'
  | 'blood';

export type AspectMap = Partial<Record<AspectId, number>>;

export interface AspectDef {
  id: AspectId;
  name: LocalizedText;
  color: string;
  /** Tiny glyph used in books and tooltips. */
  glyph: string;
  description: LocalizedText;
  /** Derived aspects are produced by reactions, never by raw ingredients. */
  derived?: boolean;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export type DayPhase = 'morning' | 'afternoon' | 'evening' | 'night';

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

export type PrepState =
  | 'whole'
  | 'sliced'
  | 'strips'
  | 'cracked'
  | 'shards'
  | 'mashed'
  | 'crumbled'
  | 'dried'
  | 'ground'
  | 'charred';

export type ToolAction = 'slice' | 'smash' | 'grind' | 'dry' | 'burn';

export type IngredientModel = 'mushroom' | 'scale' | 'wing' | 'flower' | 'crystal' | 'feather' | 'root' | 'eye' | 'dust';

export interface PrepStateDef {
  name: LocalizedText;
  /** Multiplier on dissolution speed in the cauldron. */
  dissolve: number;
  /** Multipliers on released essence per aspect. */
  effects?: AspectMap;
  /** Overall potency multiplier of essence released in this state. */
  potency?: number;
  /** Ruin (burnt residue) released per unit of mass. */
  ruin?: number;
  /** Model variant used by the ingredient model factory. */
  model: string;
  /** Color the base color is mixed toward (0..1 by `tintAmount`). */
  tint?: string;
  tintAmount?: number;
}

export interface ProcessRule {
  action: ToolAction;
  from: PrepState[];
  to?: PrepState;
  /** Number of pieces the item splits into (mass is shared). */
  pieces?: number;
  /** Hammer hits / knife cuts needed before the transition happens. */
  hits?: number;
  /** Shown when the action is attempted but not possible (e.g. too hard to cut). */
  refuse?: LocalizedText;
}

export interface IngredientDef {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  effects: AspectMap;
  /** Above this brew temperature heat-sensitive aspects degrade. */
  temperatureResistance: number;
  heatSensitive?: AspectId[];
  /** Below this temperature the ingredient barely releases essence. */
  activationTemp: number;
  grindability: number;
  burnability: number;
  liquidAffinity: number;
  magicalPower: number;
  /** Relative to the brew: < 1 floats, > 1 sinks. */
  density: number;
  /** Mass in kg of a whole piece (physics). */
  weight: number;
  color: string;
  colorAlt: string;
  glow?: string;
  texture: string;
  model: IngredientModel;
  price: number;
  states: Partial<Record<PrepState, PrepStateDef>>;
  processes: ProcessRule[];
  /** Ideal drying temperature window on the drying rack (°C). */
  dryRange: [number, number];
  availability?: { phases?: DayPhase[] };
  startUnlocked: boolean;
  /** False for ingredients that can only be gathered, never bought. */
  sold?: boolean;
}

// ---------------------------------------------------------------------------
// Potions / recipes
// ---------------------------------------------------------------------------

export interface ShareCondition {
  min?: number;
  max?: number;
}

export type DrinkEffectId =
  | 'heal'
  | 'fireheal'
  | 'regen'
  | 'strength'
  | 'giant'
  | 'nightvision'
  | 'speed'
  | 'shadow'
  | 'poison'
  | 'firebreath'
  | 'frog'
  | 'sludge'
  | 'explode'
  | 'water'
  | 'glow'
  | 'blood'
  | 'scorched'
  | 'peace'
  | 'salt'
  | 'goldrain'
  | 'eyebrow'
  | 'breathtaking'
  | 'siuuu'
  | 'chefkiss'
  | 'ayran'
  | 'bigsmile'
  | 'yatutarsa'
  | 'hamsi'
  | 'hair';

export type BottleShape = 'round' | 'tall' | 'flask' | 'vial' | 'heart' | 'skull';

export interface RecipeDef {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  kind: 'potion' | 'failure';
  tags: string[];
  /** Higher priority recipes are tested first. */
  priority: number;
  color: string;
  color2: string;
  price: number;
  bottle: BottleShape;
  /** Aspects whose concentration determines potency. */
  primary: AspectId[];
  /** Share (fraction of total essence) constraints per aspect. */
  shares?: Partial<Record<AspectId, ShareCondition>>;
  /** Combined share constraints, e.g. strength + power ≥ 0.45. */
  combined?: Array<{ aspects: AspectId[] } & ShareCondition>;
  /** [first, second]: `first` must begin dissolving before `second`. */
  order?: Array<[string, string]>;
  requires?: string[];
  /** Ingredient must have gone in prepared one of these ways. */
  states?: Record<string, PrepState[]>;
  /** Weighted average temperature while essence was released. */
  brewTemp?: ShareCondition;
  /** Average temperature while a specific ingredient dissolved. */
  ingredientTemp?: Record<string, ShareCondition>;
  /** Recipe specific potency multiplier (synergies). */
  potencyMul?: number;
  stability?: ShareCondition;
  /** Average stirring intensity (0 calm … 1 frantic). */
  agitation?: ShareCondition;
  /** Minimum primary essence per litre. */
  minConcentration?: number;
  flags?: { require?: string[]; forbid?: string[] };
  ruin?: ShareCondition;
  maxTier?: 1 | 2 | 3 | 4;
  hint: LocalizedText;
  drink: DrinkEffectId;
  /** Not known at the start: learned by trading potions with the merchant. */
  secret?: boolean;
  /** Potions the wandering merchant wants in exchange for this recipe. */
  learnCost?: Array<{ recipe: string; count: number }>;
  /** A famous guest's special: learned when they order it. */
  special?: boolean;
  /** Required amount of liquid in litres. */
  water?: ShareCondition;
  /** Ingredients shown on the book page ("id" or "id:state/state"). */
  book?: string[];
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export type Archetype = 'witch' | 'knight' | 'giant' | 'elf' | 'goblin' | 'vampire' | 'villager' | 'guard' | 'wizard' | 'celeb' | 'strongman' | 'dwarf';

export interface CharacterLook {
  skin: string;
  hair: string;
  main: string;
  second: string;
  accent: string;
  eyes?: string;
  /** Optional flags interpreted by the archetype painter. */
  extra?: string[];
}

export interface CustomerRequest {
  id: string;
  /** Potion must carry all these tags… */
  tags: string[];
  /** …or be one of these recipes. */
  anyOf?: string[];
  minTier: 1 | 2 | 3 | 4;
  weight: number;
  line: LocalizedText;
  phases?: DayPhase[];
  minDay?: number;
}

export interface CustomerLines {
  greet: Text[];
  wait: Text[];
  impatient: Text[];
  happy: Text[];
  delighted: Text[];
  weak: Text[];
  wrong: Text[];
  angry: Text[];
  leave: Text[];
  frogReturn: Text[];
  hit: Text[];
}

export interface CustomerDef {
  id: string;
  name: LocalizedText;
  title: LocalizedText;
  archetype: Archetype;
  look: CharacterLook;
  personality: 'grumpy' | 'cheerful' | 'shy' | 'proud' | 'mischievous' | 'mysterious' | 'gentle';
  patience: number;
  budget: number;
  generosity: number;
  voice: { pitch: number; speed: number; wave: OscillatorType };
  requests: CustomerRequest[];
  lines: CustomerLines;
  phases: DayPhase[];
  minDay: number;
  minReputation?: number;
  /** Height in metres (sprite scale). */
  height: number;
  /** Only visits as part of a quest. */
  questOnly?: boolean;
  /** A famous guest (affectionate parody cameo) with its own gags. */
  celebrity?: CelebId;
  /** Walking speed multiplier. */
  walkSpeed?: number;
  /** Walks backwards (faces away from where he is going). */
  backwards?: boolean;
}

export type CelebId = 'speed' | 'saltbae' | 'beast' | 'rock' | 'keanu' | 'ronaldo' | 'gordon' | 'recep' | 'burak' | 'nasreddin' | 'temel' | 'keloglan';

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export type QuestObjective =
  | { type: 'deliver'; tags: string[]; minTier: 1 | 2 | 3 | 4; anyOf?: string[] }
  | { type: 'discover'; recipe: string }
  | { type: 'sell'; count: number };

export interface QuestDef {
  id: string;
  title: LocalizedText;
  giver: string;
  intro: LocalizedText[];
  description: LocalizedText;
  objective: QuestObjective;
  startDay: number;
  startPhase: DayPhase;
  requires?: string[];
  /** Days after acceptance until the giver returns to collect. */
  returnAfterDays: number;
  returnPhase: DayPhase;
  reward: { money?: number; reputation?: number; unlock?: string[] };
  thanks: LocalizedText;
  teaches?: LocalizedText;
}

// ---------------------------------------------------------------------------
// Shop upgrades
// ---------------------------------------------------------------------------

export interface UpgradeEffects {
  cauldronCapacity?: number;
  heatMul?: number;
  bellowsMul?: number;
  grindMul?: number;
  stockCapMul?: number;
  discount?: number;
  reputationBonus?: number;
  autoStir?: number;
  fireDecayMul?: number;
  stabilityAssist?: number;
  preciseThermometer?: boolean;
}

export interface UpgradeDef {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  category: 'equipment' | 'storage' | 'decoration';
  level: 1 | 2 | 3;
  price: number;
  requires?: string[];
  effects: UpgradeEffects;
  icon: string;
}
