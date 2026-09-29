// The garden behind the shop: soil beds and crystal geodes where the
// apprentice grows ingredients. Growth is measured in in-game hours: a bed
// grows while it is watered (geodes need no water), and some crops only
// ripen at night.

import type { LocalizedText } from '../core/i18n';

export type BedKind = 'soil' | 'geode';

export interface CropDef {
  id: string;
  /** What the harvest gives. */
  ingredientId: string;
  /** Name of the seed in the seed chest. */
  seed: LocalizedText;
  seedPrice: number;
  /** Watered in-game hours until ripe. */
  hours: number;
  /** Harvest yield range. */
  yield: [number, number];
  /** Only ripens (and can only be picked) at night. */
  night?: boolean;
  /** Needs no water. */
  dry?: boolean;
  bed: BedKind;
  /** Sold once the ingredient has been found out in the world. */
  needsIngredient?: string;
  /** Colour of sprouts / glow. */
  color: string;
}

export const CROPS: CropDef[] = [
  {
    id: 'mushroom',
    ingredientId: 'glowing_mushroom',
    seed: { en: 'Mushroom spores', tr: 'Mantar sporu' },
    seedPrice: 4,
    hours: 6,
    yield: [2, 4],
    bed: 'soil',
    color: '#2ce8f5',
  },
  {
    id: 'moonflower',
    ingredientId: 'moon_flower',
    seed: { en: 'Moon Flower seeds', tr: 'Ay Çiçeği tohumu' },
    seedPrice: 12,
    hours: 12,
    yield: [1, 3],
    night: true,
    bed: 'soil',
    needsIngredient: 'moon_flower',
    color: '#c0cbff',
  },
  {
    id: 'frost',
    ingredientId: 'frost_crystal',
    seed: { en: 'Seed crystal', tr: 'Tohum kristali' },
    seedPrice: 10,
    hours: 10,
    yield: [1, 3],
    dry: true,
    bed: 'geode',
    needsIngredient: 'frost_crystal',
    color: '#9af5e6',
  },
];

export const CROP_MAP: Record<string, CropDef> = Object.fromEntries(CROPS.map((c) => [c.id, c]));

/** Plots in the garden, in order: six soil beds, then two geodes. */
export const PLOTS: BedKind[] = ['soil', 'soil', 'soil', 'soil', 'soil', 'soil', 'geode', 'geode'];

/** A watering keeps a bed moist for this many in-game hours. */
export const WATER_HOURS = 8;

export interface PlotState {
  crop: string | null;
  /** Watered hours of growth so far. */
  growth: number;
  /** Hours of moisture left. */
  water: number;
}

export interface GardenState {
  plots: PlotState[];
  seeds: Record<string, number>;
  /** Absolute in-game hour of the last update (see absHour). */
  clock: number;
  /** Day the pond toad last handed over an eye. */
  toadDay: number;
  harvests: number;
}

export function defaultGarden(): GardenState {
  return { plots: PLOTS.map(() => ({ crop: null, growth: 0, water: 0 })), seeds: { mushroom: 3 }, clock: 7, toadDay: 0, harvests: 0 };
}

/** Hours since the start of day 1 (day 1, 07:00 → 7). */
export function absHour(day: number, hour: number): number {
  return (day - 1) * 24 + hour;
}

export function isNightHour(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h >= 20 || h < 6;
}

/** Let the garden catch up to `now` (absolute hours). */
export function advanceGarden(g: GardenState, now: number): void {
  const dt = Math.max(0, Math.min(48, now - g.clock));
  g.clock = Math.max(g.clock, now);
  if (dt <= 0) return;
  for (const p of g.plots) {
    const crop = p.crop ? CROP_MAP[p.crop] : null;
    if (!crop) continue;
    const grow = crop.dry ? dt : Math.min(dt, p.water);
    p.growth = Math.min(crop.hours, p.growth + grow);
    p.water = Math.max(0, p.water - dt);
  }
}

/** 0 (just planted) … 1 (ripe). */
export function plotProgress(p: PlotState): number {
  const crop = p.crop ? CROP_MAP[p.crop] : null;
  return crop ? Math.min(1, p.growth / crop.hours) : 0;
}

export function isRipe(p: PlotState): boolean {
  return !!p.crop && plotProgress(p) >= 1;
}

/** Ripe and allowed to be picked right now (night-only crops wait for dark). */
export function canHarvest(p: PlotState, hour: number): boolean {
  const crop = p.crop ? CROP_MAP[p.crop] : null;
  return !!crop && isRipe(p) && (!crop.night || isNightHour(hour));
}

export function needsWater(p: PlotState): boolean {
  const crop = p.crop ? CROP_MAP[p.crop] : null;
  return !!crop && !crop.dry && !isRipe(p) && p.water <= 0.01;
}

export function plant(g: GardenState, index: number, cropId: string): boolean {
  const p = g.plots[index];
  const crop = CROP_MAP[cropId];
  if (!p || !crop || p.crop || (g.seeds[cropId] ?? 0) <= 0 || PLOTS[index] !== crop.bed) return false;
  g.seeds[cropId]--;
  p.crop = cropId;
  p.growth = 0;
  // Freshly turned soil holds a little moisture.
  p.water = crop.dry ? 0 : Math.max(p.water, 1);
  return true;
}

export function water(g: GardenState, index: number): boolean {
  const p = g.plots[index];
  if (!p || PLOTS[index] !== 'soil') return false;
  p.water = WATER_HOURS;
  return true;
}

/** Pick a ripe plot; returns the yield (0 if nothing to pick). */
export function harvest(g: GardenState, index: number, hour: number, roll: number): { ingredientId: string; count: number } | null {
  const p = g.plots[index];
  if (!p || !canHarvest(p, hour)) return null;
  const crop = CROP_MAP[p.crop!];
  const [a, b] = crop.yield;
  const count = a + Math.min(b - a, Math.floor(roll * (b - a + 1)));
  p.crop = null;
  p.growth = 0;
  g.harvests++;
  return { ingredientId: crop.ingredientId, count };
}
