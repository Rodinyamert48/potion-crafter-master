// Shop upgrades and decorations. Effects are merged by GameState and read by
// the systems that care (cauldron capacity, heat, bellows, grinding…).

import type { UpgradeDef } from './types';

export const UPGRADES: UpgradeDef[] = [
  // Level 1
  {
    id: 'brass_bellows',
    name: { en: 'Brass Bellows', tr: 'Pirinç Körük' },
    description: { en: 'Every pump blows 60% more air into the fire.', tr: 'Her pompalama ateşe %60 daha fazla hava üfler.' },
    category: 'equipment',
    level: 1,
    price: 60,
    effects: { bellowsMul: 1.6 },
    icon: 'bellows',
  },
  {
    id: 'cozy_rug',
    name: { en: 'Cozy Rug', tr: 'Rahat Halı' },
    description: { en: 'Customers feel welcome. +2 reputation per sale.', tr: 'Müşteriler kendini hoş karşılanmış hisseder. Satış başına +2 itibar.' },
    category: 'decoration',
    level: 1,
    price: 35,
    effects: { reputationBonus: 2 },
    icon: 'rug',
  },
  {
    id: 'crystal_lamp',
    name: { en: 'Crystal Lamp', tr: 'Kristal Lamba' },
    description: { en: 'A glowing crystal that lights the counter. +3 reputation per sale.', tr: 'Tezgâhı aydınlatan parlayan bir kristal. Satış başına +3 itibar.' },
    category: 'decoration',
    level: 1,
    price: 70,
    effects: { reputationBonus: 3 },
    icon: 'crystal',
  },
  // Level 2
  {
    id: 'advanced_cauldron',
    name: { en: 'Advanced Cauldron', tr: 'Gelişmiş Kazan' },
    description: { en: 'Copper-bottomed: holds 9 litres and heats 20% faster.', tr: 'Bakır tabanlı: 9 litre alır ve %20 daha hızlı ısınır.' },
    category: 'equipment',
    level: 2,
    price: 180,
    effects: { cauldronCapacity: 9, heatMul: 1.2 },
    icon: 'cauldron',
  },
  {
    id: 'alchemy_grinder',
    name: { en: 'Alchemy Grinder', tr: 'Simya Öğütücüsü' },
    description: { en: 'A rune-etched pestle that grinds twice as fast.', tr: 'İki kat hızlı öğüten, rün kazınmış bir havan tokmağı.' },
    category: 'equipment',
    level: 2,
    price: 120,
    effects: { grindMul: 2 },
    icon: 'mortar',
  },
  {
    id: 'ingredient_storage',
    name: { en: 'Ingredient Storage', tr: 'Malzeme Deposu' },
    description: { en: 'A cool cellar: suppliers give you a 10% discount.', tr: 'Serin bir kiler: tedarikçiler %10 indirim yapar.' },
    category: 'storage',
    level: 2,
    price: 100,
    effects: { stockCapMul: 1.5, discount: 0.1 },
    icon: 'crate',
  },
  {
    id: 'stuffed_owl',
    name: { en: 'Stuffed Owl', tr: 'Doldurulmuş Baykuş' },
    description: { en: 'It watches. Customers trust the owl. +3 reputation per sale.', tr: 'İzliyor. Müşteriler baykuşa güvenir. Satış başına +3 itibar.' },
    category: 'decoration',
    level: 2,
    price: 60,
    effects: { reputationBonus: 3 },
    icon: 'owl',
  },
  // Level 3
  {
    id: 'magic_cauldron',
    name: { en: 'Magic Cauldron', tr: 'Büyülü Kazan' },
    description: {
      en: 'Holds 12 litres, heats 35% faster and gently steadies unstable brews.',
      tr: '12 litre alır, %35 daha hızlı ısınır ve kararsız iksirleri nazikçe dengeler.',
    },
    category: 'equipment',
    level: 3,
    price: 420,
    requires: ['advanced_cauldron'],
    effects: { cauldronCapacity: 12, heatMul: 1.35, stabilityAssist: 0.35 },
    icon: 'cauldron',
  },
  {
    id: 'enchanted_oven',
    name: { en: 'Enchanted Hearth', tr: 'Büyülü Ocak' },
    description: {
      en: 'Fire burns logs half as fast and runes show the exact temperature.',
      tr: 'Ateş odunları yarı hızda yakar ve rünler tam sıcaklığı gösterir.',
    },
    category: 'equipment',
    level: 3,
    price: 300,
    effects: { fireDecayMul: 0.5, preciseThermometer: true, heatMul: 1.1 },
    icon: 'hearth',
  },
  {
    id: 'potion_automator',
    name: { en: 'Potion Automator', tr: 'İksir Otomatı' },
    description: {
      en: 'An enchanted ladle that stirs gently whenever you are not. It will not do the thinking for you.',
      tr: 'Sen karıştırmadığında nazikçe karıştıran büyülü bir kepçe. Senin yerine düşünmez.',
    },
    category: 'equipment',
    level: 3,
    price: 480,
    effects: { autoStir: 1.5 },
    icon: 'ladle',
  },
  {
    id: 'mandrake_pot',
    name: { en: 'Potted Mandrake', tr: 'Saksıda Adamotu' },
    description: { en: 'It only screams occasionally. +4 reputation per sale.', tr: 'Sadece ara sıra çığlık atar. Satış başına +4 itibar.' },
    category: 'decoration',
    level: 3,
    price: 90,
    effects: { reputationBonus: 4 },
    icon: 'plant',
  },
];

export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Supplies sold by the merchant (besides ingredients). */
export const SUPPLIES = {
  flasks: { amount: 4, price: 6 },
  logs: { amount: 4, price: 4 },
};
