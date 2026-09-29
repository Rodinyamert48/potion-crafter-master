import { describe, expect, it } from 'vitest';
import { ZONES, PLAZA, SPAWN, DOOR, groundHeight, walkMask, roadDist, zoneAt, poolMask, lavaMask, DRAGON, CAVERN, scatter, WATER_Y } from '../src/world/outdoor/layout';
import { advanceGarden, canHarvest, defaultGarden, harvest, isRipe, needsWater, plant, water, WATER_HOURS, CROP_MAP } from '../src/data/garden';

describe('open world layout', () => {
  it('has five regions around the crossroads, far enough apart', () => {
    expect(ZONES.map((z) => z.id)).toEqual(['forest', 'cave', 'shrine', 'swamp', 'valley']);
    for (let i = 0; i < ZONES.length; i++)
      for (let j = i + 1; j < ZONES.length; j++) {
        const a = ZONES[i];
        const b = ZONES[j];
        expect(Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z)).toBeGreaterThan(a.radius + b.radius - 4);
      }
  });

  it('the road from the door reaches the plaza and every region', () => {
    for (const p of [SPAWN, DOOR, PLAZA]) expect(walkMask(p.x, p.z)).toBeGreaterThan(0.9);
    for (let z = DOOR.z - 1.5; z > PLAZA.z; z -= 2) {
      // Somewhere across the road at this z the ground is walkable and gentle.
      let ok = false;
      for (let x = -8; x <= 8; x += 0.5) if ((roadDist(x, z) < 1 || Math.hypot(x - PLAZA.x, z - PLAZA.z) < 8) && walkMask(x, z) > 0.9) ok = true;
      expect(ok).toBe(true);
    }
    for (const zn of ZONES) {
      for (const p of zn.road) expect(walkMask(p.x, p.z)).toBeGreaterThan(0.9);
      expect(zoneAt(zn.center.x, zn.center.z)?.id).toBe(zn.id);
    }
  });

  it('roads are nearly flat, hills are high', () => {
    for (const zn of ZONES)
      for (let i = 0; i < zn.road.length - 1; i++) {
        const a = zn.road[i];
        const b = zn.road[i + 1];
        const slope = Math.abs(groundHeight(a.x, a.z) - groundHeight(b.x, b.z)) / Math.hypot(a.x - b.x, a.z - b.z);
        expect(slope).toBeLessThan(0.35);
      }
    // Between two regions, far from roads: hills
    expect(groundHeight(-40, -20)).toBeGreaterThan(4);
  });

  it('water, lava, dragon and cavern sit in their regions', () => {
    const sw = ZONES.find((z) => z.id === 'swamp')!;
    let water = 0;
    for (let i = 0; i < 400; i++) {
      const x = sw.center.x + ((i % 20) - 10) * 2;
      const z = sw.center.z + (Math.floor(i / 20) - 10) * 2;
      if (poolMask(x, z) > 0.5 && groundHeight(x, z) < WATER_Y) water++;
    }
    expect(water).toBeGreaterThan(20);
    const v = ZONES.find((z) => z.id === 'valley')!;
    let lava = 0;
    for (let i = 0; i < 400; i++) if (lavaMask(v.center.x + ((i % 20) - 10) * 2, v.center.z + (Math.floor(i / 20) - 10) * 2) > 0.5) lava++;
    expect(lava).toBeGreaterThan(5);
    expect(zoneAt(DRAGON.x, DRAGON.z)?.id).toBe('valley');
    expect(zoneAt(CAVERN.x, CAVERN.z)?.id).toBe('cave');
    expect(scatter(sw.center, sw.radius, 10, 3).length).toBe(10);
  });
});

describe('garden', () => {
  it('grows only while watered and ripens on time', () => {
    const g = defaultGarden();
    g.clock = 7;
    expect(plant(g, 0, 'mushroom')).toBe(true);
    expect(g.seeds.mushroom).toBe(2);
    advanceGarden(g, 9);
    // Fresh soil holds an hour of moisture only.
    expect(g.plots[0].growth).toBeCloseTo(1);
    expect(needsWater(g.plots[0])).toBe(true);
    water(g, 0);
    expect(g.plots[0].water).toBe(WATER_HOURS);
    advanceGarden(g, 9 + CROP_MAP.mushroom.hours);
    expect(isRipe(g.plots[0])).toBe(true);
    const r = harvest(g, 0, 15, 0.99);
    expect(r?.ingredientId).toBe('glowing_mushroom');
    expect(r?.count).toBe(CROP_MAP.mushroom.yield[1]);
    expect(g.plots[0].crop).toBe(null);
    expect(g.harvests).toBe(1);
  });

  it('night crops wait for the dark, crystals need no water, beds take the right seeds', () => {
    const g = defaultGarden();
    g.clock = 0;
    g.seeds.moonflower = 1;
    g.seeds.frost = 2;
    expect(plant(g, 6, 'mushroom')).toBe(false);
    expect(plant(g, 0, 'frost')).toBe(false);
    expect(plant(g, 6, 'frost')).toBe(true);
    expect(plant(g, 1, 'moonflower')).toBe(true);
    water(g, 1);
    advanceGarden(g, 30);
    expect(isRipe(g.plots[6])).toBe(true);
    expect(g.plots[1].growth).toBeCloseTo(WATER_HOURS);
    g.plots[1].growth = CROP_MAP.moonflower.hours;
    expect(canHarvest(g.plots[1], 13)).toBe(false);
    expect(canHarvest(g.plots[1], 22)).toBe(true);
  });
});
