// Things that happen out in the world on certain days: every third day a
// pack of wolves roams every region (you hear them howl as soon as you step
// outside), and once in a long while a dragon egg lies in one of the nests
// of Dragon Valley – a gift fit for the King.

import type { GameContext } from '../core/GameContext';
import type { RegionHazard } from '../data/regions';

/** Wolves roam outside on day 3, 6, 9… */
export const WOLF_INTERVAL = 3;

export function isWolfDay(day: number): boolean {
  return day >= WOLF_INTERVAL && day % WOLF_INTERVAL === 0;
}

/** The pack that roams every region on wolf days (for the region games). */
export const ROAMING_WOLVES: RegionHazard = { id: 'wolf', name: { en: 'Roaming wolves', tr: 'Dolaşan kurtlar' }, weight: 3 };

/** Key item: a dragon egg (the King wants it). */
export const DRAGON_EGG = 'dragon_egg';
/** Chance per day that an egg lies in one of the valley's nests (open world). */
export const EGG_CHANCE = 0.08;
/** Chance to come across one on a Dragon Valley trip (region list). */
export const EGG_TRIP_CHANCE = 0.05;

function hash(n: number): number {
  let h = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Which of the valley's nests holds an egg today (null: none); the same all day. */
export function eggNestToday(day: number, nests: number): number | null {
  if (nests <= 0 || hash(day * 7331 + 5) >= EGG_CHANCE) return null;
  return Math.floor(hash(day * 131 + 77) * nests) % nests;
}

/** The apprentice picked up a dragon egg. */
export function giveDragonEgg(ctx: GameContext): void {
  const s = ctx.state;
  s.addItem(DRAGON_EGG);
  s.count('eggs');
  ctx.bus.emit('item:found', { id: DRAGON_EGG });
  ctx.bus.emit('save:request', {});
}
