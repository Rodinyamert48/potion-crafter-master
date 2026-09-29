// Layout of the open world outside the shop (pure functions, no rendering):
// the shop stands at the origin with its door facing north (−z). A road runs
// north to a crossroads plaza, where it splits into five: the Whispering
// Forest (west), Echo Cave (north-west), the Moon Shrine (north), the Murky
// Swamp (north-east) and Dragon Valley (east). Everything that is not road,
// plaza or region rises into steep, wooded hills that nobody can climb.

import type { RegionId } from '../../data/regions';

export interface V2 {
  x: number;
  z: number;
}

export interface ZoneDef {
  id: RegionId;
  /** Degrees from north, clockwise (east = +90). */
  angle: number;
  center: V2;
  radius: number;
  /** Where the road leaves the plaza (the barrier stands here while locked). */
  gate: V2;
  /** Road polyline from the plaza to the zone centre. */
  road: V2[];
  /** Base ground colour. */
  color: string;
}

export const SHOP = { x: 0, z: 0, w: 11, d: 8 };
export const DOOR: V2 = { x: 0, z: -4.4 };
export const SPAWN: V2 = { x: 0, z: -7 };
export const GARDEN_GATE: V2 = { x: 8.2, z: -2.2 };
export const PLAZA: V2 = { x: 0, z: -46 };
export const PLAZA_R = 11;
export const ROAD_HALF = 2.6;
export const HOME_R = 13;
export const WATER_Y = -0.3;

const ZONE_SPECS: Array<{ id: RegionId; angle: number; dist: number; radius: number; color: string; bend: number }> = [
  { id: 'forest', angle: -78, dist: 80, radius: 27, color: '#34462c', bend: 6 },
  { id: 'cave', angle: -38, dist: 84, radius: 24, color: '#4a4c5a', bend: -5 },
  { id: 'shrine', angle: 0, dist: 82, radius: 23, color: '#3c4458', bend: 4 },
  { id: 'swamp', angle: 38, dist: 84, radius: 27, color: '#3a4630', bend: -6 },
  { id: 'valley', angle: 78, dist: 82, radius: 27, color: '#5a3a2e', bend: 5 },
];

function dirOf(angleDeg: number): V2 {
  const a = (angleDeg * Math.PI) / 180;
  return { x: Math.sin(a), z: -Math.cos(a) };
}

export const ZONES: ZoneDef[] = ZONE_SPECS.map((s) => {
  const d = dirOf(s.angle);
  const perp = { x: -d.z, z: d.x };
  const center = { x: PLAZA.x + d.x * s.dist, z: PLAZA.z + d.z * s.dist };
  const road: V2[] = [];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    const along = PLAZA_R - 2 + (s.dist - PLAZA_R + 2) * k;
    const bend = Math.sin(k * Math.PI) * s.bend;
    road.push({ x: PLAZA.x + d.x * along + perp.x * bend, z: PLAZA.z + d.z * along + perp.z * bend });
  }
  const gate = { x: PLAZA.x + d.x * (PLAZA_R + 9), z: PLAZA.z + d.z * (PLAZA_R + 9) };
  return { id: s.id, angle: s.angle, center, radius: s.radius, gate, road, color: s.color };
});

export const ZONE_MAP = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<RegionId, ZoneDef>;

/** The main road from the shop door to the plaza (a gentle S-curve). */
export const MAIN_ROAD: V2[] = (() => {
  const pts: V2[] = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    pts.push({ x: Math.sin(k * Math.PI) * 3.2, z: DOOR.z - 1 + (PLAZA.z + 2 - (DOOR.z - 1)) * k });
  }
  return pts;
})();

export const ROADS: V2[][] = [MAIN_ROAD, ...ZONES.map((z) => z.road)];

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in 0..1. */
export function noise2(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, z: number, seed = 0, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * f, z * f, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// Geometry queries
// ---------------------------------------------------------------------------

function segDist(px: number, pz: number, a: V2, b: V2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

export function polyDist(px: number, pz: number, pts: V2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, segDist(px, pz, pts[i], pts[i + 1]));
  return best;
}

/** Distance to the nearest road centre line. */
export function roadDist(x: number, z: number): number {
  let best = Infinity;
  for (const r of ROADS) best = Math.min(best, polyDist(x, z, r));
  return best;
}

export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 1 where the apprentice can walk (road, plaza, regions, the yard), 0 in the hills. */
export function walkMask(x: number, z: number): number {
  let m = 1 - smooth(ROAD_HALF + 1.5, ROAD_HALF + 7, roadDist(x, z));
  m = Math.max(m, 1 - smooth(PLAZA_R, PLAZA_R + 6, Math.hypot(x - PLAZA.x, z - PLAZA.z)));
  m = Math.max(m, 1 - smooth(HOME_R, HOME_R + 7, Math.hypot(x - SHOP.x, z - SHOP.z - 1)));
  for (const zn of ZONES) {
    const wobble = (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 8;
    m = Math.max(m, 1 - smooth(zn.radius + wobble, zn.radius + wobble + 8, Math.hypot(x - zn.center.x, z - zn.center.z)));
  }
  return m;
}

/** How strongly each region's look applies here (0..1). */
export function zoneWeight(zn: ZoneDef, x: number, z: number): number {
  return 1 - smooth(zn.radius * 0.7, zn.radius + 18, Math.hypot(x - zn.center.x, z - zn.center.z));
}

/** The region the point lies in (inside its radius), or null. */
export function zoneAt(x: number, z: number): ZoneDef | null {
  for (const zn of ZONES) if (Math.hypot(x - zn.center.x, z - zn.center.z) < zn.radius + 4) return zn;
  return null;
}

/** Swamp pools: 1 where there is open water. */
export function poolMask(x: number, z: number): number {
  const sw = ZONE_MAP.swamp;
  const d = Math.hypot(x - sw.center.x, z - sw.center.z);
  if (d > sw.radius + 6) return 0;
  const n = fbm(x * 0.09, z * 0.09, 41);
  const onRoad = 1 - smooth(ROAD_HALF, ROAD_HALF + 2.5, polyDist(x, z, sw.road));
  return smooth(0.48, 0.56, n) * (1 - smooth(sw.radius - 4, sw.radius + 4, d)) * (1 - onRoad);
}

/** Lava pools in Dragon Valley: 1 inside molten rock. */
export function lavaMask(x: number, z: number): number {
  const v = ZONE_MAP.valley;
  const d = Math.hypot(x - v.center.x, z - v.center.z);
  if (d > v.radius + 2) return 0;
  const n = fbm(x * 0.07 + 10, z * 0.07, 77);
  const onRoad = 1 - smooth(ROAD_HALF + 0.5, ROAD_HALF + 4, polyDist(x, z, v.road));
  const nearDragon = 1 - smooth(7, 10, Math.hypot(x - DRAGON.x, z - DRAGON.z));
  return smooth(0.6, 0.66, n) * (1 - smooth(v.radius - 6, v.radius, d)) * (1 - onRoad) * (1 - nearDragon);
}

/** Where the dragon sleeps: at the far end of the valley. */
export const DRAGON: V2 = (() => {
  const v = ZONE_SPECS.find((s) => s.id === 'valley')!;
  const d = dirOf(v.angle);
  return { x: PLAZA.x + d.x * (v.dist + 12), z: PLAZA.z + d.z * (v.dist + 12) };
})();

/** The cave mouth and cavern: at the far end of the cave canyon. */
export const CAVERN: V2 & { r: number } = (() => {
  const c = ZONE_SPECS.find((s) => s.id === 'cave')!;
  const d = dirOf(c.angle);
  return { x: PLAZA.x + d.x * (c.dist + 6), z: PLAZA.z + d.z * (c.dist + 6), r: 13 };
})();

/** Ground height (metres) – the same function feeds the mesh and the collider. */
export function groundHeight(x: number, z: number): number {
  const walk = walkMask(x, z);
  const small = (fbm(x * 0.06, z * 0.06, 5) - 0.5) * 1.2;
  const hills = 5 + fbm(x * 0.025, z * 0.025, 9) * 16 + fbm(x * 0.12, z * 0.12, 13) * 3;
  let h = small * (0.5 + 0.5 * walk) + hills * (1 - walk) ** 1.4;
  // Flatten the road bed and the plaza.
  const road = 1 - smooth(ROAD_HALF, ROAD_HALF + 2, roadDist(x, z));
  const plaza = 1 - smooth(PLAZA_R - 1, PLAZA_R + 1, Math.hypot(x - PLAZA.x, z - PLAZA.z));
  const yard = 1 - smooth(HOME_R - 3, HOME_R, Math.hypot(x - SHOP.x, z - SHOP.z));
  h *= 1 - Math.max(road * 0.7, plaza, yard);
  // Region shaping
  const pool = poolMask(x, z);
  if (pool > 0) h = h * (1 - pool) + (WATER_Y - 0.9) * pool;
  const lava = lavaMask(x, z);
  if (lava > 0) h = h * (1 - lava) + -0.35 * lava;
  const sh = ZONE_MAP.shrine;
  const ds = Math.hypot(x - sh.center.x, z - sh.center.z);
  h += (1 - smooth(9, 12, ds)) * 0.45;
  const dc = Math.hypot(x - CAVERN.x, z - CAVERN.z);
  if (dc < CAVERN.r + 3) h *= smooth(CAVERN.r - 2, CAVERN.r + 3, dc);
  return h;
}

/** Terrain slope steepness (0 flat … 1 cliff) for colouring. */
export function slopeAt(x: number, z: number): number {
  const e = 1;
  const dx = groundHeight(x + e, z) - groundHeight(x - e, z);
  const dz = groundHeight(x, z + e) - groundHeight(x, z - e);
  return Math.min(1, Math.hypot(dx, dz) / 2 / 1.2);
}

/** Terrain extent. */
export const BOUNDS = { minX: -150, maxX: 150, minZ: -185, maxZ: 40 };

/** Seeded scatter points inside a disc, avoiding roads (for gather spots and props). */
export function scatter(center: V2, radius: number, count: number, seed: number, minRoad = ROAD_HALF + 1.2, minGap = 2.5): V2[] {
  const out: V2[] = [];
  let tries = 0;
  let s = seed * 9973 + 17;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) | 0;
    return ((s >>> 8) & 0xffff) / 0xffff;
  };
  while (out.length < count && tries < count * 40) {
    tries++;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * radius;
    const p = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
    if (roadDist(p.x, p.z) < minRoad) continue;
    if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < minGap)) continue;
    out.push(p);
  }
  return out;
}
