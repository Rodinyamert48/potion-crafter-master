// Gathering regions outside the shop. A trip costs time (the shop is closed
// and the fire is banked while you are away); what you bring back depends on
// the region, the time of day and how well you gather.

import type { LocalizedText } from '../core/i18n';

export type RegionId = 'forest' | 'cave' | 'swamp' | 'valley';

export interface RegionFind {
  ingredientId: string;
  weight: number;
  /** Only shows up on night (or day) trips. */
  when?: 'night' | 'day';
  /** Rare finds glow brighter and vanish faster. */
  rare?: boolean;
}

export interface RegionHazard {
  id: string;
  name: LocalizedText;
  weight: number;
  when?: 'night' | 'day';
  /** Only while this quest is not completed yet. */
  untilQuest?: string;
}

export interface RegionDef {
  id: RegionId;
  name: LocalizedText;
  description: LocalizedText;
  /** Game hours the trip takes. */
  hours: number;
  /** Requirements to be allowed in. */
  minReputation?: number;
  minDay?: number;
  /** Colours for the procedural pixel scenery. */
  scenery: {
    skyDay: [string, string];
    skyNight: [string, string];
    far: string;
    mid: string;
    ground: string;
    groundHi: string;
    accent: string;
  };
  finds: RegionFind[];
  hazards: RegionHazard[];
  /** Position on the expedition map (0..1). */
  map: { x: number; y: number };
}

export const REGIONS: RegionDef[] = [
  {
    id: 'forest',
    name: { en: 'Whispering Forest', tr: 'Fısıldayan Orman' },
    description: {
      en: 'Old oaks and mossy logs where Glowing Mushrooms thrive. Moon Flowers open here after dark – if the wolves let you pass.',
      tr: 'Parlayan Mantarların bol olduğu yaşlı meşeler ve yosunlu kütükler. Ay Çiçekleri karanlıkta burada açar – kurtlar izin verirse.',
    },
    hours: 2.5,
    scenery: {
      skyDay: ['#9fd3e8', '#e8f0c8'],
      skyNight: ['#0e1030', '#262b44'],
      far: '#3e5a4a',
      mid: '#2d4a2d',
      ground: '#3e8948',
      groundHi: '#63c74d',
      accent: '#265c42',
    },
    finds: [
      { ingredientId: 'glowing_mushroom', weight: 6 },
      { ingredientId: 'moon_flower', weight: 3, when: 'night', rare: true },
      { ingredientId: 'bat_wing', weight: 1, when: 'night' },
    ],
    hazards: [
      { id: 'toadstool', name: { en: 'Poison toadstool', tr: 'Zehirli mantar' }, weight: 3 },
      { id: 'nettle', name: { en: 'Stinging nettle', tr: 'Isırgan otu' }, weight: 2, when: 'day' },
      { id: 'wolf', name: { en: 'Wolf eyes in the dark', tr: 'Karanlıkta kurt gözleri' }, weight: 4, when: 'night', untilQuest: 'wolves_north' },
    ],
    map: { x: 0.24, y: 0.3 },
  },
  {
    id: 'cave',
    name: { en: 'Echo Cave', tr: 'Yankı Mağarası' },
    description: {
      en: 'A dripping cavern full of roosting bats. Frost Crystals grow in its cold heart. Watch out for loose rocks.',
      tr: 'Tünemiş yarasalarla dolu, damlayan bir mağara. Soğuk kalbinde Buz Kristalleri büyür. Gevşek kayalara dikkat.',
    },
    hours: 3.5,
    minDay: 2,
    scenery: {
      skyDay: ['#262b44', '#3a4466'],
      skyNight: ['#181425', '#262b44'],
      far: '#3a4466',
      mid: '#262b44',
      ground: '#5a6988',
      groundHi: '#8b9bb4',
      accent: '#2ce8f5',
    },
    finds: [
      { ingredientId: 'bat_wing', weight: 5 },
      { ingredientId: 'frost_crystal', weight: 3, rare: true },
      { ingredientId: 'glowing_mushroom', weight: 2 },
    ],
    hazards: [
      { id: 'rock', name: { en: 'Loose rock', tr: 'Gevşek kaya' }, weight: 3 },
      { id: 'swarm', name: { en: 'Sleeping bat swarm', tr: 'Uyuyan yarasa sürüsü' }, weight: 2 },
    ],
    map: { x: 0.72, y: 0.22 },
  },
  {
    id: 'swamp',
    name: { en: 'Murky Swamp', tr: 'Bulanık Bataklık' },
    description: {
      en: 'Fog, reeds and croaking. The giant bog toads here have eyes that see in the dark. Leeches are not an ingredient.',
      tr: 'Sis, sazlar ve vıraklama. Buradaki dev bataklık kurbağalarının gözleri karanlıkta görür. Sülükler malzeme değildir.',
    },
    hours: 3,
    minDay: 2,
    scenery: {
      skyDay: ['#8b9b7a', '#c8d0a0'],
      skyNight: ['#101a18', '#2a3a30'],
      far: '#4a5a3a',
      mid: '#3a4a2a',
      ground: '#4a6a3a',
      groundHi: '#8a9a3a',
      accent: '#b4c83a',
    },
    finds: [
      { ingredientId: 'bog_toad_eye', weight: 5 },
      { ingredientId: 'glowing_mushroom', weight: 2 },
      { ingredientId: 'bat_wing', weight: 1 },
    ],
    hazards: [
      { id: 'leech', name: { en: 'Leech', tr: 'Sülük' }, weight: 3 },
      { id: 'wisp', name: { en: 'Will-o’-the-wisp', tr: 'Bataklık ışığı' }, weight: 2, when: 'night' },
    ],
    map: { x: 0.3, y: 0.72 },
  },
  {
    id: 'valley',
    name: { en: 'Dragon Valley', tr: 'Ejderha Vadisi' },
    description: {
      en: 'Scorched rocks where red dragons shed their scales – and, once in a lifetime, a phoenix its feather. Only known alchemists dare to go.',
      tr: 'Kızıl ejderhaların pullarını döktüğü kavrulmuş kayalar – ve ömürde bir kez bir anka kuşu tüyünü. Yalnızca tanınmış simyacılar gitmeye cesaret eder.',
    },
    hours: 5,
    minReputation: 30,
    scenery: {
      skyDay: ['#f77622', '#feae34'],
      skyNight: ['#3e2731', '#733e39'],
      far: '#733e39',
      mid: '#3e2731',
      ground: '#8f563b',
      groundHi: '#c28569',
      accent: '#e43b44',
    },
    finds: [
      { ingredientId: 'dragon_scale', weight: 5 },
      { ingredientId: 'phoenix_feather', weight: 0.5, rare: true },
    ],
    hazards: [
      { id: 'ember', name: { en: 'Glowing ember', tr: 'Kor' }, weight: 3 },
      { id: 'claw', name: { en: 'A sleeping dragon’s claw', tr: 'Uyuyan bir ejderhanın pençesi' }, weight: 2 },
    ],
    map: { x: 0.76, y: 0.68 },
  },
];

export const REGION_MAP: Record<RegionId, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionDef>;
