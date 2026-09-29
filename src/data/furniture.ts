// Furniture the player can buy at the market and place on a few free spots
// in the shop. Floor spots at the front of the room only take low pieces so
// nothing ever hides the work tables from the camera.

import type { LocalizedText } from '../core/i18n';

export type FurnitureKind = 'floor' | 'tall' | 'wall';

export interface FurnitureSlot {
  id: string;
  name: LocalizedText;
  /** 'floor' spots take low pieces, 'tall' spots anything standing, 'wall' spots wall pieces. */
  kind: FurnitureKind;
  pos: [number, number, number];
  /** Rotation around Y so the piece faces into the room. */
  yaw: number;
}

export interface FurnitureDef {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  kind: FurnitureKind;
  price: number;
  /** Collider footprint [w, h, d] (floor pieces only). */
  size?: [number, number, number];
}

export const FURNITURE_SLOTS: FurnitureSlot[] = [
  { id: 'front_left', name: { en: 'Front left corner', tr: 'Sol ön köşe' }, kind: 'floor', pos: [-4.3, 0, 1.9], yaw: 0.45 },
  { id: 'front_mid', name: { en: 'Front of the shop', tr: 'Dükkânın önü' }, kind: 'floor', pos: [0.55, 0, 2.12], yaw: 0 },
  { id: 'back_mid', name: { en: 'Back wall, by the hearth', tr: 'Arka duvar, ocak arkası' }, kind: 'tall', pos: [0.02, 0, -3.45], yaw: 0 },
  { id: 'right_wall', name: { en: 'Right wall, by the counter', tr: 'Sağ duvar, tezgâh yanı' }, kind: 'tall', pos: [4.88, 0, -0.45], yaw: -Math.PI / 2 },
  { id: 'wall_corner', name: { en: 'Left wall, by the shelves', tr: 'Sol duvar, raf yanı' }, kind: 'wall', pos: [-4.99, 2.05, -2.5], yaw: Math.PI / 2 },
  { id: 'wall_left', name: { en: 'Left wall, above the workbench', tr: 'Sol duvar, tezgâh üstü' }, kind: 'wall', pos: [-4.99, 2.0, 0.3], yaw: Math.PI / 2 },
];

export const FURNITURE: FurnitureDef[] = [
  // Low floor pieces (any floor spot)
  {
    id: 'armchair',
    name: { en: 'Velvet Armchair', tr: 'Kadife Koltuk' },
    description: { en: 'Deep red and very comfy. The cat has already claimed it in spirit.', tr: 'Koyu kırmızı ve çok rahat. Kedi ruhen çoktan sahiplendi.' },
    kind: 'floor',
    price: 70,
    size: [0.75, 0.9, 0.7],
  },
  {
    id: 'bigplant',
    name: { en: 'Giant Fern', tr: 'Dev Eğrelti' },
    description: { en: 'A big leafy friend in a clay pot. Hums when nobody listens.', tr: 'Toprak saksıda koca yapraklı bir dost. Kimse dinlemezken mırıldanır.' },
    kind: 'floor',
    price: 35,
    size: [0.5, 1.0, 0.5],
  },
  {
    id: 'globe',
    name: { en: 'Explorer’s Globe', tr: 'Kâşif Küresi' },
    description: { en: 'Every region you know, and a few you don’t. Click to spin.', tr: 'Bildiğin her diyar, bir de bilmediklerin. Çevirmek için tıkla.' },
    kind: 'floor',
    price: 60,
    size: [0.5, 1.05, 0.5],
  },
  {
    id: 'candelabra',
    name: { en: 'Iron Candelabra', tr: 'Demir Şamdan' },
    description: { en: 'Five candles on wrought iron. Lights up a dark corner.', tr: 'Dövme demir üstünde beş mum. Karanlık bir köşeyi aydınlatır.' },
    kind: 'floor',
    price: 55,
    size: [0.4, 1.2, 0.4],
  },
  {
    id: 'crystalball',
    name: { en: 'Fortune Crystal Ball', tr: 'Fal Kristal Küresi' },
    description: { en: 'Swirling mist on a carved pedestal. Click it for a fortune.', tr: 'Oymalı bir kaide üstünde dönen sis. Fal için tıkla.' },
    kind: 'floor',
    price: 95,
    size: [0.45, 1.1, 0.45],
  },
  {
    id: 'pumpkin',
    name: { en: 'Jack-o’-Lantern Pile', tr: 'Bal Kabağı Feneri' },
    description: { en: 'Three carved pumpkins with a candle grin.', tr: 'Mum ışığıyla sırıtan üç oyma bal kabağı.' },
    kind: 'floor',
    price: 25,
    size: [0.7, 0.45, 0.55],
  },
  // Tall pieces (back and side walls only)
  {
    id: 'bookcase',
    name: { en: 'Tall Bookcase', tr: 'Uzun Kitaplık' },
    description: { en: 'Tomes, scrolls and one suspicious cookbook. Click for a tip.', tr: 'Ciltler, parşömenler ve şüpheli bir yemek kitabı. İpucu için tıkla.' },
    kind: 'tall',
    price: 90,
    size: [1.0, 2.0, 0.36],
  },
  {
    id: 'armor',
    name: { en: 'Suit of Armour', tr: 'Zırh Takımı' },
    description: { en: 'Empty. Probably. It clanks when you poke it.', tr: 'Boş. Muhtemelen. Dürtünce tıngırdıyor.' },
    kind: 'tall',
    price: 140,
    size: [0.6, 1.9, 0.5],
  },
  {
    id: 'clock',
    name: { en: 'Grandfather Clock', tr: 'Dede Saati' },
    description: { en: 'Tick… tock… Shows the real shop time and chimes every hour.', tr: 'Tik… tak… Dükkânın gerçek saatini gösterir, her saat başı çalar.' },
    kind: 'tall',
    price: 120,
    size: [0.55, 2.1, 0.4],
  },
  // Wall pieces
  {
    id: 'painting_land',
    name: { en: 'Valley Painting', tr: 'Vadi Tablosu' },
    description: { en: 'The dragon valley at sunset, in a gilded frame.', tr: 'Gün batımında ejderha vadisi, yaldızlı bir çerçevede.' },
    kind: 'wall',
    price: 40,
  },
  {
    id: 'painting_master',
    name: { en: 'Portrait of the Master', tr: 'Usta’nın Portresi' },
    description: { en: 'Your mentor, forty years younger and just as grumpy.', tr: 'Ustan, kırk yaş daha genç ve aynı derecede huysuz.' },
    kind: 'wall',
    price: 60,
  },
  {
    id: 'shield',
    name: { en: 'Shield & Crossed Swords', tr: 'Kalkan ve Çapraz Kılıçlar' },
    description: { en: 'A knight left them as payment. Or as a warning.', tr: 'Bir şövalye ödeme olarak bıraktı. Ya da uyarı olarak.' },
    kind: 'wall',
    price: 110,
  },
  {
    id: 'mirror',
    name: { en: 'Magic Mirror', tr: 'Sihirli Ayna' },
    description: { en: 'Mirror, mirror on the wall… click and ask.', tr: 'Ayna ayna, söyle bana… tıkla ve sor.' },
    kind: 'wall',
    price: 80,
  },
  {
    id: 'banner',
    name: { en: 'Crimson Banner', tr: 'Kızıl Sancak' },
    description: { en: 'The brewers’ guild sigil in gold thread.', tr: 'Altın iplikle işlenmiş iksirciler loncası arması.' },
    kind: 'wall',
    price: 30,
  },
];

export const FURNITURE_MAP: Record<string, FurnitureDef> = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));
export const SLOT_MAP: Record<string, FurnitureSlot> = Object.fromEntries(FURNITURE_SLOTS.map((s) => [s.id, s]));

/** Can this piece stand on this spot? Low pieces fit every floor spot. */
export function fitsSlot(def: FurnitureDef, slot: FurnitureSlot): boolean {
  if (def.kind === 'wall') return slot.kind === 'wall';
  if (def.kind === 'tall') return slot.kind === 'tall';
  return slot.kind === 'floor' || slot.kind === 'tall';
}
