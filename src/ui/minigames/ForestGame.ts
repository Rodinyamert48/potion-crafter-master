// Whispering Forest: a side-scrolling walk along the forest path. Finds pop
// up among the scenery – click them before they vanish, but leave the
// dangerous look-alikes alone (poison toadstools, nettles, wolf eyes at
// night). Now and then a glowing spirit fox dashes across the path: catch
// it for a gift. The dog sniffs out rare finds, the cat sees in the dark.

import { characterSheet, type SpriteSheet } from '../../rendering/three/sprites/CharacterPainter';
import { mixHex, shadeHex } from '../../core/math';
import { MiniGame, SCENE_H, SCENE_W, type MiniGameOptions } from './MiniGame';
import { disc, tri } from './draw';
import { t } from '../../core/i18n';

const GROUND_Y = 132;
const WALKER_X = 70;

interface Pickup {
  x: number;
  y: number;
  kind: 'find' | 'hazard';
  id: string;
  rare: boolean;
  age: number;
  life: number;
  phase: number;
  gone: boolean;
}

interface Fox {
  x: number;
  y: number;
  dir: number;
  t: number;
}

const APPRENTICE_LOOK = { skin: '#e8b796', hair: '#b86f50', main: '#3b5dc9', second: '#262b44', accent: '#fee761', eyes: '#3e2731', extra: ['hood'] };

export class ForestGame extends MiniGame {
  private readonly layers: { far: HTMLCanvasElement; mid: HTMLCanvasElement; fore: HTMLCanvasElement };
  private readonly hazardArt = new Map<string, HTMLCanvasElement>();
  private readonly walker: SpriteSheet;
  private readonly stars: Array<[number, number, number]> = [];
  private readonly pickups: Pickup[] = [];
  private scroll = 0;
  private spawnT = 0.6;
  private fox: Fox | null = null;
  private foxT = 7;

  constructor(o: MiniGameOptions) {
    super(o);
    this.layers = { far: this.paintFar(), mid: this.paintMid(), fore: this.paintFore() };
    for (const h of this.hazards) this.hazardArt.set(h.id, paintHazard(h.id));
    this.walker = characterSheet('apprentice', 'witch', APPRENTICE_LOOK);
    for (let i = 0; i < 60; i++) this.stars.push([this.rng.range(0, SCENE_W), this.rng.range(0, 90), this.rng.range(0, 6.28)]);
    this.foxT = this.rng.range(6, 11);
  }

  get help(): string {
    return t('mg.help.forest');
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  protected step(dt: number): void {
    this.scroll += dt * 24;
    // Spawning: things appear ahead of the walker as the path unfolds.
    this.spawnT -= dt;
    if (this.spawnT <= 0 && !this.closing) {
      this.spawnT = this.rng.range(0.9, 1.5);
      this.spawn();
    }
    for (const p of this.pickups) {
      p.age += dt;
      if (p.age > p.life || p.x - this.scroll < -12) p.gone = true;
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) if (this.pickups[i].gone) this.pickups.splice(i, 1);
    // The spirit fox dashes across the path now and then.
    this.foxT -= dt;
    if (!this.fox && this.foxT <= 0 && !this.closing) {
      this.foxT = this.rng.range(9, 14);
      const dir = this.rng.chance(0.5) ? 1 : -1;
      this.fox = { x: dir > 0 ? -20 : SCENE_W + 20, y: GROUND_Y + this.rng.range(8, 24), dir, t: 0 };
      this.audio.play('magic', { volume: 0.35, pitch: 1.6 });
    }
    if (this.fox) {
      this.fox.t += dt;
      this.fox.x += this.fox.dir * dt * 95;
      if (this.fox.x < -30 || this.fox.x > SCENE_W + 30) this.fox = null;
    }
  }

  private spawn(): void {
    const hazardChance = this.hazards.length ? 0.3 : 0;
    const x = this.scroll + this.rng.range(SCENE_W * 0.45, SCENE_W * 0.98);
    if (this.rng.chance(hazardChance)) {
      const h = this.rng.weighted(this.hazards, (z) => z.weight);
      if (!h) return;
      const air = h.id === 'wisp' || h.id === 'swarm';
      const y = air ? this.rng.range(70, 110) : h.id === 'rock' ? this.rng.range(GROUND_Y - 4, GROUND_Y + 10) : this.rng.range(GROUND_Y + 2, GROUND_Y + 30);
      this.pickups.push({ x, y, kind: 'hazard', id: h.id, rare: false, age: 0, life: this.rng.range(6, 9), phase: this.rng.range(0, 6.28), gone: false });
    } else {
      const f = this.rng.weighted(this.finds, (z) => z.weight);
      if (!f) return;
      const high = f.ingredientId === 'frost_crystal' || f.ingredientId === 'bat_wing' || f.ingredientId === 'phoenix_feather';
      const y = high && this.rng.chance(0.6) ? this.rng.range(58, 104) : this.rng.range(GROUND_Y + 2, GROUND_Y + 30);
      const rare = !!f.rare;
      const rareLife = this.rng.range(3.2, 4.5) * (this.has('dog') ? 1.6 : 1);
      this.pickups.push({ x, y, kind: 'find', id: f.ingredientId, rare, age: 0, life: rare ? rareLife : this.rng.range(6, 9), phase: this.rng.range(0, 6.28), gone: false });
    }
  }

  protected click(x: number, y: number): void {
    const fox = this.fox;
    if (fox && Math.hypot(fox.x - x, fox.y - 6 - y) < 16) {
      // Caught the spirit fox: it leaves a gift of two finds.
      this.fox = null;
      this.word(fox.x, fox.y - 18, t('mg.fox'), '#c0cbff');
      this.audio.play('discovery', { volume: 0.5, pitch: 1.3 });
      for (let i = 0; i < 2; i++) {
        const f = this.pickFind();
        if (f) this.collect(f.ingredientId, fox.x + i * 8, fox.y - 6, false, true);
      }
      return;
    }
    let best: Pickup | null = null;
    let bestD = 14;
    for (const p of this.pickups) {
      if (p.gone || p.age < 0.25) continue;
      const sx = p.x - this.scroll;
      const d = Math.hypot(sx - x, p.y - 6 - y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;
    const sx = best.x - this.scroll;
    if (best.kind === 'find') {
      if (this.collect(best.id, sx, best.y - 6, best.rare)) best.gone = true;
    } else {
      best.gone = true;
      this.hurt(best.id, sx, best.y - 6);
    }
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  protected paint(g: CanvasRenderingContext2D): void {
    const sc = this.region.scenery;
    // Sky
    const [top, bottom] = this.night ? sc.skyNight : sc.skyDay;
    const bands = 8;
    for (let i = 0; i < bands; i++) {
      g.fillStyle = mixHex(top, bottom, i / (bands - 1));
      g.fillRect(-4, Math.floor((i * GROUND_Y) / bands), SCENE_W + 8, Math.ceil(GROUND_Y / bands) + 1);
    }
    if (this.night && this.region.id !== 'cave') {
      for (const [x, y, ph] of this.stars) {
        const tw = Math.sin(this.time * 2 + ph) > 0.2;
        g.fillStyle = tw ? '#ffffff' : '#8b9bb4';
        g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
      }
    }
    if (this.region.id !== 'cave') {
      // Sun or moon crossing the sky as the trip goes on.
      const p = this.time / this.duration;
      const cx = 40 + p * 240;
      const cy = 38 - Math.sin(p * Math.PI) * 16;
      g.fillStyle = this.night ? '#e8eef8' : '#fee761';
      disc(g, cx, cy, this.night ? 7 : 9);
      if (this.night) {
        g.fillStyle = top;
        disc(g, cx + 3, cy - 2, 6);
      }
    }
    // Parallax layers
    this.drawLayer(this.layers.far, 0.25, 0);
    this.drawLayer(this.layers.mid, 0.6, 0);
    // Ground
    g.fillStyle = sc.ground;
    g.fillRect(-4, GROUND_Y, SCENE_W + 8, SCENE_H - GROUND_Y + 4);
    g.fillStyle = sc.groundHi;
    const off = Math.floor(this.scroll) % 16;
    for (let x = -off; x < SCENE_W + 16; x += 16) {
      g.fillRect(x, GROUND_Y, 9, 1);
      g.fillRect(x + 4, GROUND_Y + 11, 2, 1);
      g.fillRect(x + 11, GROUND_Y + 24, 3, 1);
    }
    g.fillStyle = shadeHex(sc.ground, -0.2);
    for (let x = -off; x < SCENE_W + 16; x += 16) g.fillRect(x + 7, GROUND_Y + 34, 5, 1);
    if (this.region.id === 'swamp') {
      // Murky pools with ripples
      g.fillStyle = '#2a3a30';
      for (let i = 0; i < 3; i++) {
        const px = ((i * 137 - this.scroll) % (SCENE_W + 80)) + SCENE_W + 40;
        const x = (px % (SCENE_W + 80)) - 40;
        g.fillRect(Math.floor(x), GROUND_Y + 18 + i * 5, 46, 6);
        g.fillStyle = '#4a6a5a';
        g.fillRect(Math.floor(x) + 6 + Math.floor(Math.sin(this.time * 2 + i) * 3), GROUND_Y + 19 + i * 5, 8, 1);
        g.fillStyle = '#2a3a30';
      }
    }
    if (this.region.id === 'valley') {
      // Lava cracks glowing in the ground
      g.fillStyle = mixHex('#e43b44', '#feae34', 0.5 + 0.5 * Math.sin(this.time * 3));
      for (let x = -off * 2; x < SCENE_W + 32; x += 32) g.fillRect(x + 3, GROUND_Y + 15, 7, 1);
    }

    // Pickups
    for (const p of this.pickups) this.drawPickup(p);
    if (this.fox) this.drawFox(this.fox);

    // Walker
    this.drawWalker();

    // Foreground grass passing by quickly
    this.drawLayer(this.layers.fore, 1.35, SCENE_H - this.layers.fore.height);

    // Night: darkness with a lantern pool of light around the apprentice.
    if (this.night || this.region.id === 'cave') {
      // The cat's eyes cut through the dark.
      const dark = (this.region.id === 'cave' ? 0.35 : 0.42) * (this.has('cat') ? 0.5 : 1);
      g.fillStyle = `rgba(10, 8, 24, ${dark})`;
      g.fillRect(-4, -4, SCENE_W + 8, SCENE_H + 8);
      g.fillStyle = 'rgba(254, 231, 97, 0.10)';
      disc(g, WALKER_X + 6, GROUND_Y - 6, 34);
      g.fillStyle = 'rgba(254, 231, 97, 0.08)';
      disc(g, WALKER_X + 6, GROUND_Y - 6, 22);
      // Glowing things shine through the dark
      for (const p of this.pickups) {
        if (p.kind === 'find' && !p.rare && p.id !== 'glowing_mushroom') continue;
        if (p.kind === 'hazard' && p.id !== 'wisp' && p.id !== 'wolf' && p.id !== 'ember') continue;
        const sx = Math.floor(p.x - this.scroll);
        g.fillStyle = p.kind === 'hazard' ? 'rgba(254, 231, 97, 0.12)' : 'rgba(200, 240, 255, 0.14)';
        disc(g, sx, p.y - 6, 9);
      }
    }
    if (this.region.id === 'swamp') {
      // Drifting fog bands
      g.fillStyle = 'rgba(200, 214, 190, 0.16)';
      for (let i = 0; i < 3; i++) {
        const y = 96 + i * 16 + Math.sin(this.time * 0.6 + i) * 3;
        const x = ((this.time * (6 + i * 3)) % 120) - 120;
        for (let k = x; k < SCENE_W; k += 120) g.fillRect(Math.floor(k), Math.floor(y), 84, 3);
      }
    }
    if (this.has('dog')) {
      // The dog points at rare finds with a bobbing marker.
      g.fillStyle = '#fee761';
      for (const p of this.pickups) {
        if (p.kind !== 'find' || !p.rare) continue;
        const sx = Math.floor(p.x - this.scroll);
        const b = Math.round(Math.sin(this.time * 6) * 2);
        g.fillRect(sx - 1, p.y - 32 + b, 2, 5);
        g.fillRect(sx - 1, p.y - 25 + b, 2, 2);
      }
    }
  }

  private drawFox(f: Fox): void {
    const g = this.g;
    const x = Math.floor(f.x);
    const y = Math.floor(f.y + Math.abs(Math.sin(f.t * 14)) * -3);
    const d = f.dir;
    // Glow and a trail of sparkles
    g.fillStyle = 'rgba(192, 203, 255, 0.18)';
    disc(g, x, y - 5, 11);
    g.fillStyle = '#c0cbff';
    for (let i = 1; i < 5; i++) g.fillRect(x - d * i * 7, y - 4 + ((i * 3) % 5) - 2, 1, 1);
    g.fillStyle = '#e8eef8';
    g.fillRect(x - 6, y - 7, 12, 5);
    g.fillRect(x + d * 5 - 2, y - 10, 5, 5);
    g.fillRect(x + d * 6 - (d > 0 ? 0 : 2), y - 13, 2, 3);
    g.fillRect(x - d * 9 - 2, y - 8, 5, 3);
    g.fillStyle = '#c0cbff';
    g.fillRect(x - 5, y - 2, 2, 2);
    g.fillRect(x + 3, y - 2, 2, 2);
    g.fillStyle = '#262b44';
    g.fillRect(x + d * 6, y - 9, 1, 1);
  }

  private drawLayer(layer: HTMLCanvasElement, speed: number, y: number): void {
    const w = layer.width;
    const off = Math.floor(this.scroll * speed) % w;
    this.g.drawImage(layer, -off, y);
    this.g.drawImage(layer, w - off, y);
  }

  private drawPickup(p: Pickup): void {
    const g = this.g;
    const sx = Math.floor(p.x - this.scroll);
    if (sx < -16 || sx > SCENE_W + 16) return;
    const appear = Math.min(1, p.age / 0.25);
    const fade = p.life - p.age < 1 ? Math.floor((p.life - p.age) * 8) % 2 : 1; // blink before vanishing
    if (!fade) return;
    const bob = Math.round(Math.sin(this.time * 3 + p.phase) * (p.y < GROUND_Y ? 2 : 1));
    const y = Math.floor(p.y) + bob;
    // Shadow
    if (p.y >= GROUND_Y) {
      g.fillStyle = 'rgba(24, 20, 37, 0.35)';
      g.fillRect(sx - 5, y + 1, 10, 2);
    }
    if (p.kind === 'find') {
      if (p.rare || p.id === 'glowing_mushroom' || p.id === 'moon_flower') {
        // Sparkle
        const s = Math.floor(this.time * 8 + p.phase) % 4;
        g.fillStyle = p.rare ? '#fee761' : '#c8f8ff';
        const d = 9 + s;
        g.fillRect(sx - d, y - 8, 1, 1);
        g.fillRect(sx + d - 1, y - 4, 1, 1);
        g.fillRect(sx - 1, y - 8 - d + 4, 1, 1);
      }
      const img = this.icons.get(p.id);
      if (img?.complete) {
        const size = appear < 1 ? Math.max(4, Math.round(16 * appear)) : 16;
        g.drawImage(img, sx - size / 2, y - size + 2, size, size);
      }
    } else {
      const art = this.hazardArt.get(p.id);
      if (art) g.drawImage(art, sx - art.width / 2, y - art.height + 2);
      if (p.id === 'wolf' || p.id === 'wisp') {
        // Blinking eyes / flickering light
        const on = Math.sin(this.time * 5 + p.phase) > -0.6;
        if (on && p.id === 'wolf') {
          g.fillStyle = '#fee761';
          g.fillRect(sx - 3, y - 8, 2, 1);
          g.fillRect(sx + 2, y - 8, 2, 1);
        }
      }
    }
  }

  private drawWalker(): void {
    const sh = this.walker;
    const anim = sh.anims[this.stun > 0 ? 'surprised' : 'walk'] ?? sh.anims.walk ?? sh.anims.idle;
    const frame = anim.frames[Math.floor(this.time * anim.fps) % anim.frames.length];
    const col = frame % sh.cols;
    const row = Math.floor(frame / sh.cols);
    // Half-size sprite so it fits the little scene.
    const w = Math.round(sh.frameW * 0.5);
    const h = Math.round(sh.frameH * 0.5);
    this.g.drawImage(sh.canvas, col * sh.frameW, row * sh.frameH, sh.frameW, sh.frameH, WALKER_X - w / 2, GROUND_Y + 6 - h, w, h);
    // Basket on the arm
    this.g.fillStyle = '#8f563b';
    this.g.fillRect(WALKER_X + 5, GROUND_Y - 12, 7, 4);
    this.g.fillStyle = '#c28569';
    this.g.fillRect(WALKER_X + 5, GROUND_Y - 13, 7, 1);
  }

  // -------------------------------------------------------------------------
  // Procedural scenery (painted once per trip)
  // -------------------------------------------------------------------------

  private layerCanvas(h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas');
    c.width = SCENE_W * 2;
    c.height = h;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    return [c, g];
  }

  private paintFar(): HTMLCanvasElement {
    const sc = this.region.scenery;
    const [c, g] = this.layerCanvas(GROUND_Y);
    const W = c.width;
    const col = this.night ? shadeHex(sc.far, -0.35) : sc.far;
    g.fillStyle = col;
    const id = this.region.id;
    if (id === 'cave') {
      // Back wall, stalactites and glinting crystal veins
      g.fillStyle = shadeHex(sc.far, -0.2);
      g.fillRect(0, 0, W, GROUND_Y);
      g.fillStyle = sc.mid;
      for (let x = 0; x < W; x += 9) {
        const len = 8 + Math.floor(this.rng.range(0, 26));
        tri(g, x, 0, x + 9, 0, x + 4, len);
      }
      g.fillStyle = sc.accent;
      for (let i = 0; i < 26; i++) g.fillRect(Math.floor(this.rng.range(0, W)), Math.floor(this.rng.range(30, GROUND_Y - 10)), 1, 1);
      return c;
    }
    // Rolling hills / jagged peaks as a periodic silhouette
    const jag = id === 'valley' ? 1 : 0;
    for (let x = 0; x < W; x++) {
      const a = (x / W) * Math.PI * 2;
      let h = 30 + Math.sin(a * 2) * 10 + Math.sin(a * 5 + 1) * 6 + Math.sin(a * 11 + 2) * 3;
      if (jag) h += Math.abs(Math.sin(a * 9)) * 14;
      g.fillRect(x, GROUND_Y - Math.floor(h) - 8, 1, Math.floor(h) + 8);
    }
    if (id === 'valley') {
      // A smoking volcano on the horizon
      g.fillStyle = shadeHex(col, -0.15);
      tri(g, 120, GROUND_Y - 8, 220, GROUND_Y - 8, 170, GROUND_Y - 78);
      g.fillStyle = '#e43b44';
      g.fillRect(164, GROUND_Y - 78, 12, 3);
      g.fillStyle = '#feae34';
      g.fillRect(167, GROUND_Y - 79, 6, 2);
    }
    return c;
  }

  private paintMid(): HTMLCanvasElement {
    const sc = this.region.scenery;
    const [c, g] = this.layerCanvas(GROUND_Y + 2);
    const W = c.width;
    const col = this.night ? shadeHex(sc.mid, -0.3) : sc.mid;
    const id = this.region.id;
    for (let x = 6; x < W - 20; x += Math.floor(this.rng.range(28, 52))) {
      if (id === 'forest') {
        // Trunk + clustered canopy, every tree a little different
        const th = Math.floor(this.rng.range(30, 50));
        const cr = Math.floor(this.rng.range(10, 15));
        const tone = this.rng.chance(0.5) ? col : shadeHex(col, -0.12);
        g.fillStyle = shadeHex(col, -0.3);
        g.fillRect(x + 6, GROUND_Y - th, 5, th + 2);
        g.fillRect(x + 3, GROUND_Y - 2, 11, 2);
        g.fillStyle = tone;
        disc(g, x + 8, GROUND_Y - th - cr * 0.6, cr);
        disc(g, x + 1, GROUND_Y - th + 4, cr - 4);
        disc(g, x + 16, GROUND_Y - th + 2, cr - 3);
        g.fillStyle = shadeHex(tone, 0.18);
        for (let k = 0; k < 5; k++) g.fillRect(Math.floor(x + this.rng.range(-2, 16)), Math.floor(GROUND_Y - th - cr * 0.6 - this.rng.range(-4, cr * 0.8)), 2, 1);
        // Bush at the foot
        if (this.rng.chance(0.6)) {
          g.fillStyle = shadeHex(col, 0.08);
          disc(g, x + 26, GROUND_Y - 3, 6);
          disc(g, x + 32, GROUND_Y - 2, 5);
        }
      } else if (id === 'cave') {
        g.fillStyle = col;
        tri(g, x, GROUND_Y + 2, x + 16, GROUND_Y + 2, x + 8, GROUND_Y - 22 - Math.floor(this.rng.range(0, 14)));
        g.fillStyle = shadeHex(col, 0.2);
        g.fillRect(x + 7, GROUND_Y - 12, 1, 6);
      } else if (id === 'swamp') {
        // Dead tree and reeds
        g.fillStyle = shadeHex(col, -0.2);
        g.fillRect(x + 8, GROUND_Y - 44, 3, 46);
        g.fillRect(x + 2, GROUND_Y - 36, 7, 2);
        g.fillRect(x + 10, GROUND_Y - 30, 8, 2);
        g.fillStyle = col;
        for (let k = 0; k < 6; k++) g.fillRect(x + 18 + k * 2, GROUND_Y - 10 - (k % 3) * 3, 1, 12);
        g.fillStyle = '#733e39';
        g.fillRect(x + 22, GROUND_Y - 16, 2, 4);
      } else {
        // Scorched boulders of all sizes, some with a glowing seam
        const r = Math.floor(this.rng.range(5, 13));
        g.fillStyle = this.rng.chance(0.5) ? col : shadeHex(col, 0.1);
        disc(g, x + 10, GROUND_Y + 1 - r * 0.5, r);
        g.fillStyle = shadeHex(col, 0.22);
        g.fillRect(x + 10 - Math.floor(r * 0.5), GROUND_Y - Math.floor(r * 1.1), Math.max(2, Math.floor(r * 0.5)), 1);
        if (this.rng.chance(0.3)) {
          g.fillStyle = '#e43b44';
          g.fillRect(x + 9, GROUND_Y - Math.floor(r * 0.4), 1, Math.max(2, Math.floor(r * 0.5)));
        }
      }
    }
    return c;
  }

  private paintFore(): HTMLCanvasElement {
    const sc = this.region.scenery;
    const [c, g] = this.layerCanvas(18);
    const W = c.width;
    g.fillStyle = shadeHex(this.night ? shadeHex(sc.ground, -0.3) : sc.ground, -0.25);
    const rocky = this.region.id === 'cave' || this.region.id === 'valley';
    for (let x = 0; x < W; x += Math.floor(this.rng.range(20, 60))) {
      if (rocky) {
        // Pebbles and stubby stalagmites instead of grass
        g.fillRect(x, 13, 6, 5);
        g.fillRect(x + 1, 11, 4, 2);
        if (this.rng.chance(0.4)) tri(g, x + 8, 18, x + 14, 18, x + 11, 6);
      } else {
        for (let k = 0; k < 5; k++) g.fillRect(x + k * 2, 18 - 6 - (k % 2) * 4, 1, 12);
      }
    }
    return c;
  }
}

/** Small pixel sprites for the dangerous look-alikes. */
function paintHazard(id: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 18;
  c.height = 18;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const k = '#181425';
  switch (id) {
    case 'toadstool':
      px(7, 9, 4, 8, '#ead4aa');
      px(3, 5, 12, 5, '#e43b44');
      px(4, 4, 10, 1, '#e43b44');
      px(5, 6, 2, 1, '#ffffff');
      px(10, 5, 2, 1, '#ffffff');
      px(12, 8, 1, 1, '#ffffff');
      px(3, 10, 12, 1, k);
      break;
    case 'nettle':
      for (let i = 0; i < 4; i++) {
        px(8, 4 + i * 3, 2, 3, '#3e8948');
        px(4 + (i % 2) * 7, 5 + i * 3, 4, 2, '#63c74d');
        px(3 + (i % 2) * 11, 5 + i * 3, 1, 1, '#ead4aa');
      }
      break;
    case 'wolf':
      px(1, 8, 16, 10, '#1d2b24');
      px(3, 5, 12, 4, '#1d2b24');
      px(0, 11, 2, 7, '#1d2b24');
      px(16, 10, 2, 8, '#1d2b24');
      break;
    case 'rock':
      px(3, 7, 12, 10, '#5a6988');
      px(2, 10, 14, 6, '#5a6988');
      px(5, 6, 7, 2, '#8b9bb4');
      px(8, 10, 1, 5, '#3a4466');
      px(9, 12, 3, 1, '#3a4466');
      break;
    case 'swarm':
      px(2, 5, 14, 9, '#181425');
      px(4, 3, 10, 13, '#181425');
      for (const [x, y] of [[5, 7], [9, 6], [12, 9], [7, 11], [11, 12]]) px(x, y, 1, 1, '#e43b44');
      break;
    case 'leech':
      px(2, 12, 14, 4, '#3a3040');
      px(3, 11, 12, 1, '#5a4a4a');
      px(14, 10, 3, 3, '#3a3040');
      px(15, 11, 1, 1, '#e43b44');
      break;
    case 'wisp':
      px(6, 3, 6, 10, '#9af5e6');
      px(5, 5, 8, 6, '#9af5e6');
      px(7, 5, 4, 5, '#e8fff8');
      px(8, 13, 2, 3, '#63c7b2');
      break;
    case 'ember':
      px(4, 10, 10, 7, '#3e2731');
      px(5, 9, 8, 2, '#a22633');
      px(6, 11, 6, 3, '#f77622');
      px(8, 11, 2, 2, '#fee761');
      px(7, 6, 1, 1, '#feae34');
      px(11, 4, 1, 1, '#f77622');
      break;
    case 'claw':
      for (let i = 0; i < 3; i++) {
        px(3 + i * 5, 8, 3, 9, '#a22633');
        px(3 + i * 5, 5, 2, 3, '#ead4aa');
        px(3 + i * 5, 4, 1, 1, '#ead4aa');
      }
      px(1, 14, 16, 4, '#733e39');
      break;
    default:
      px(4, 4, 10, 10, '#e43b44');
  }
  return c;
}
