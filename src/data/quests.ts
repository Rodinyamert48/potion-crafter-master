// Quests: villagers bring problems that teach new brewing techniques.

import type { QuestDef } from './types';

export const QUESTS: QuestDef[] = [
  {
    id: 'first_brew',
    title: { en: 'The First Brew', tr: 'İlk Demleme' },
    giver: 'mentor',
    intro: [
      { en: 'Your first customer is coming. Brew her a healing potion – I will guide you.', tr: 'İlk müşterin geliyor. Ona bir şifa iksiri demle – sana yol göstereceğim.' },
    ],
    description: {
      en: 'Brew a healing potion from Glowing Mushrooms and sell it to Hazel the witch.',
      tr: 'Parlayan Mantarlardan bir şifa iksiri demle ve cadı Hazel\'e sat.',
    },
    objective: { type: 'sell', count: 1 },
    startDay: 1,
    startPhase: 'morning',
    returnAfterDays: 0,
    returnPhase: 'morning',
    reward: { money: 20, reputation: 5 },
    thanks: { en: 'Your first sale! Many more to come, apprentice.', tr: 'İlk satışın! Daha çoğu gelecek, çırak.' },
    teaches: { en: 'Slice ingredients, warm the brew, stir gently, bottle.', tr: 'Malzemeleri dilimle, iksiri ısıt, nazikçe karıştır, şişele.' },
  },
  {
    id: 'wolves_north',
    title: { en: 'Wolves of the North', tr: 'Kuzeyin Kurtları' },
    giver: 'guard_bruno',
    intro: [
      {
        en: 'Wolves from the northern woods prowl the village every night. Nobody dares to go outside after dark.',
        tr: 'Kuzey ormanlarından gelen kurtlar her gece köyde dolaşıyor. Karanlık çökünce kimse dışarı çıkmaya cesaret edemiyor.',
      },
      {
        en: 'Brew me a Night Vision Potion so my watchmen can hunt them. I will return tomorrow evening.',
        tr: 'Bana bir Gece Görüşü İksiri demle ki muhafızlarım onları avlayabilsin. Yarın akşam döneceğim.',
      },
    ],
    description: {
      en: 'Brew a Night Vision Potion (Standard or better) for Captain Bruno.',
      tr: 'Yüzbaşı Bruno için bir Gece Görüşü İksiri (Standart veya daha iyi) demle.',
    },
    objective: { type: 'deliver', tags: ['vision'], minTier: 2 },
    startDay: 2,
    startPhase: 'morning',
    returnAfterDays: 1,
    returnPhase: 'evening',
    reward: { money: 95, reputation: 10, unlock: ['moon_flower'] },
    thanks: {
      en: 'The wolves will not trouble us again. Take this – and the merchant now sells Moon Flowers at night.',
      tr: 'Kurtlar bizi bir daha rahatsız etmeyecek. Al bunu – ve tüccar artık geceleri Ay Çiçeği satıyor.',
    },
    teaches: {
      en: 'Fresh bat wings are poisonous – dry them on the rack. Keep light and shadow warm, never hot.',
      tr: 'Taze yarasa kanatları zehirlidir – rafta kurut. Işık ve gölgeyi ılık tut, asla sıcak değil.',
    },
  },
  {
    id: 'knights_tournament',
    title: { en: "The Knight's Tournament", tr: 'Şövalye Turnuvası' },
    giver: 'knight_roland',
    intro: [
      { en: 'The royal tournament is in two days, and I face the Iron Duke himself!', tr: 'Kraliyet turnuvası iki gün sonra ve Demir Dük\'ün ta kendisiyle karşılaşacağım!' },
      {
        en: 'I need a STRONG Strength Potion – the strongest you can brew. I will come back for it.',
        tr: 'GÜÇLÜ bir Güç İksiri lazım – yapabileceğin en güçlüsü. Onu almak için geri geleceğim.',
      },
    ],
    description: {
      en: 'Brew a Strong (★★★) Strength Potion for Sir Roland.',
      tr: 'Şövalye Roland için Güçlü (★★★) bir Güç İksiri demle.',
    },
    objective: { type: 'deliver', tags: ['strength'], minTier: 3 },
    startDay: 2,
    startPhase: 'afternoon',
    returnAfterDays: 2,
    returnPhase: 'afternoon',
    reward: { money: 120, reputation: 12, unlock: ['frost_crystal'] },
    thanks: {
      en: 'Victory! The Iron Duke flew into the moat! Here is your reward – and I brought frost crystals from the north.',
      tr: 'Zafer! Demir Dük hendeğe uçtu! İşte ödülün – ve kuzeyden buz kristalleri getirdim.',
    },
    teaches: {
      en: 'Crack dragon scales with the hammer and grind the shards in the mortar for a potent brew.',
      tr: 'Güçlü bir iksir için ejderha pullarını çekiçle kır ve parçaları havanda öğüt.',
    },
  },
  {
    id: 'goblin_race',
    title: { en: 'The Great Goblin Race', tr: 'Büyük Goblin Yarışı' },
    giver: 'goblin_snik',
    intro: [
      { en: 'Big race tomorrow! All goblins run! Snik must WIN!', tr: 'Yarın büyük yarış! Bütün goblinler koşuyor! Snik KAZANMALI!' },
      { en: 'Make Snik a Speed Potion. Snik come back tomorrow morning!', tr: 'Snik\'e Hız İksiri yap. Snik yarın sabah geri gelir!' },
    ],
    description: { en: 'Brew a Potion of Swiftness for Snik.', tr: 'Snik için bir Hız İksiri demle.' },
    objective: { type: 'deliver', tags: ['speed'], minTier: 1 },
    startDay: 3,
    startPhase: 'morning',
    returnAfterDays: 1,
    returnPhase: 'morning',
    reward: { money: 75, reputation: 8 },
    thanks: { en: 'Snik WON! Snik so fast Snik ran into a tree! Worth it!', tr: 'Snik KAZANDI! Snik o kadar hızlıydı ki ağaca çarptı! Değdi!' },
    teaches: { en: 'Whip fire and shadow together at a rolling boil.', tr: 'Ateş ve gölgeyi fokur fokur kaynarken birlikte çırp.' },
  },
  {
    id: 'giants_boulder',
    title: { en: "The Giant's Boulder", tr: 'Devin Kayası' },
    giver: 'giant_grumbold',
    intro: [
      { en: 'Big rock fall on mountain road. Village cut off.', tr: 'Dağ yoluna büyük kaya düştü. Köy yolsuz kaldı.' },
      { en: 'Grumbold lift rock. But rock VERY big. Grumbold need Giant Strength Potion. Come back tomorrow.', tr: 'Grumbold kayayı kaldırır. Ama kaya ÇOK büyük. Grumbold\'a Dev Gücü İksiri lazım. Yarın gelir.' },
    ],
    description: { en: 'Brew a Giant Strength Potion for Grumbold.', tr: 'Grumbold için bir Dev Gücü İksiri demle.' },
    objective: { type: 'deliver', tags: ['giant'], minTier: 1 },
    startDay: 4,
    startPhase: 'afternoon',
    returnAfterDays: 1,
    returnPhase: 'afternoon',
    reward: { money: 160, reputation: 15, unlock: ['phoenix_feather'] },
    thanks: {
      en: 'ROCK GONE! Road open! Grumbold found shiny feather under rock. For you.',
      tr: 'KAYA GİTTİ! Yol açık! Grumbold kayanın altında parlak tüy buldu. Senin için.',
    },
    teaches: {
      en: 'Lots of powdered dragon scale, a mushroom for magic, a hard boil and a hard stir at the end.',
      tr: 'Bolca toz ejderha pulu, büyü için bir mantar, sert bir kaynama ve sonunda sert bir karıştırma.',
    },
  },
  {
    id: 'vampire_ball',
    title: { en: 'The Midnight Ball', tr: 'Gece Yarısı Balosu' },
    giver: 'vampire_vlador',
    intro: [
      { en: 'The Midnight Ball approaches. My guests expect… refreshments.', tr: 'Gece Yarısı Balosu yaklaşıyor. Misafirlerim… ikram bekliyor.' },
      { en: 'A Sanguine Tonic, alchemist. I shall return tomorrow night.', tr: 'Bir Kan Toniği, simyacı. Yarın gece döneceğim.' },
    ],
    description: { en: 'Brew a Sanguine Tonic for Count Vlador.', tr: 'Kont Vlador için bir Kan Toniği demle.' },
    objective: { type: 'deliver', tags: ['blood'], minTier: 1 },
    startDay: 5,
    startPhase: 'evening',
    returnAfterDays: 1,
    returnPhase: 'night',
    reward: { money: 220, reputation: 15 },
    thanks: { en: 'My guests were… delighted. You have a friend in the night.', tr: 'Misafirlerim… memnun kaldı. Gecede bir dostun var.' },
    teaches: {
      en: 'Healing, shadow and fire bound together above 108°C. Keep the light low or chaos takes it.',
      tr: '108°C üstünde birbirine bağlanan şifa, gölge ve ateş. Işığı az tut yoksa kaos ele geçirir.',
    },
  },
];

export const QUEST_MAP: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
