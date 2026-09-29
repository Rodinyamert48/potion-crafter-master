// Echo Cave: crystal mining by lantern light. The cave is pitch dark except
// around the lantern (it follows the pointer). Frost Crystals grow in veins
// on the wall and need three taps to break loose; shed bat wings and glowing
// mushrooms lie on the floor. Leave the roosting bat swarms alone – and when
// dust trickles from the ceiling, get the lantern out from under it before
// the rock comes down.

import { MiniGame, SCENE_H, SCENE_W, type MiniGameOptions } from './MiniGame';
import { canvas, disc, ellipse, rect, tri } from './draw';
import { t } from '../../core/i18n';
import { mixHex } from '../../core/math';

const FLOOR_Y = 138;

interface Vein {
  x: number;
  y: number;
  id: string;
  hp: number;
  age: number;
  life: number;
  phase: number;
}

interface FloorItem {
  x: number;
  y: number;
  id: string;
  age: number;
  life: number;
}

interface Roost {
  x: number;
  y: number;
  away: number;
}

interface Rockfall {
  x: number;
  y: number;
  t: number;
  warn: number;
  landed: boolean;
}

interface Bat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

interface Drip {
  x: number;
  y: number;
  vy: number;
}

export class CaveGame extends MiniGame {
  private readonly back: HTMLCanvasElement;
  private readonly dark: [HTMLCanvasElement, CanvasRenderingContext2D];
  private readonly veins: Vein[] = [];
  private readonly items: FloorItem[] = [];
  private readonly roosts: Roost[] = [];
  private readonly rocks: Rockfall[] = [];
  private readonly bats: Bat[] = [];
  private readonly drips: Drip[] = [];
  private readonly slots: Array<[number, number]> = [];
  private veinT = 0.4;
  private itemT = 1;
  private rockT = 4;
  private dripT = 0.5;
  private chips: Array<{ x: number; y: number; vx: number; vy: number; t: number }> = [];

  constructor(o: MiniGameOptions) {
    super(o);
    for (let i = 0; i < 14; i++) this.slots.push([this.rng.range(24, SCENE_W - 24), this.rng.range(46, FLOOR_Y - 16)]);
    for (let i = 0; i < 3; i++) this.roosts.push({ x: 50 + i * 105 + this.rng.range(-20, 20), y: this.rng.range(14, 26), away: 0 });
    this.back = this.paintBack();
    this.dark = canvas(SCENE_W, SCENE_H);
    this.lanternX = SCENE_W / 2;
    this.lanternY = 100;
  }

  private lanternX: number;
  private lanternY: number;

  get help(): string {
    return t('mg.help.cave');
  }

  private crystalId(): string {
    return this.finds.find((f) => f.ingredientId === 'frost_crystal')?.ingredientId ?? this.pickFind()?.ingredientId ?? 'frost_crystal';
  }

  protected step(dt: number): void {
    // The lantern trails the pointer a little.
    const k = 1 - Math.exp(-dt * 14);
    this.lanternX += (this.mx - this.lanternX) * k;
    this.lanternY += (this.my - this.lanternY) * k;

    if (!this.closing) {
      this.veinT -= dt;
      if (this.veinT <= 0 && this.veins.length < 3) {
        this.veinT = this.rng.range(2.2, 3.4);
        const free = this.slots.filter(([x, y]) => !this.veins.some((v) => Math.hypot(v.x - x, v.y - y) < 20));
        if (free.length) {
          const [x, y] = this.rng.pick(free);
          this.veins.push({ x, y, id: this.crystalId(), hp: 3, age: 0, life: this.rng.range(9, 13), phase: this.rng.range(0, 6.28) });
        }
      }
      this.itemT -= dt;
      if (this.itemT <= 0 && this.items.length < 4) {
        this.itemT = this.rng.range(1.2, 2.2);
        const f = this.pickFind((x) => x.ingredientId !== 'frost_crystal');
        if (f) this.items.push({ x: this.rng.range(20, SCENE_W - 20), y: this.rng.range(FLOOR_Y + 8, SCENE_H - 12), id: f.ingredientId, age: 0, life: this.rng.range(6, 9) });
      }
      this.rockT -= dt;
      if (this.rockT <= 0) {
        this.rockT = this.rng.range(3.2, 5);
        // Rocks fall where the lantern is (or near it): keep moving!
        const x = Math.max(20, Math.min(SCENE_W - 20, this.lanternX + this.rng.range(-40, 40)));
        const y = Math.max(FLOOR_Y + 6, Math.min(SCENE_H - 10, this.lanternY + this.rng.range(-10, 10)));
        this.rocks.push({ x, y, t: 0, warn: 1.25, landed: false });
        this.audio.play('rumble', { volume: 0.35 });
      }
    }
    for (const v of this.veins) v.age += dt;
    for (let i = this.veins.length - 1; i >= 0; i--) if (this.veins[i].age > this.veins[i].life) this.veins.splice(i, 1);
    for (const it of this.items) it.age += dt;
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].age > this.items[i].life) this.items.splice(i, 1);
    for (const r of this.roosts) r.away = Math.max(0, r.away - dt);

    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.t += dt;
      if (!r.landed && r.t >= r.warn) {
        r.landed = true;
        this.shake = Math.max(this.shake, 0.5);
        this.audio.play('dropHard', { volume: 0.7, pitch: 0.6 });
        if (this.pointerIn && Math.hypot(this.lanternX - r.x, this.lanternY - r.y) < 18) this.hurt('rock', r.x, r.y - 8);
        // Crushes what lies under it.
        for (let k = this.items.length - 1; k >= 0; k--) if (Math.hypot(this.items[k].x - r.x, this.items[k].y - r.y) < 14) this.items.splice(k, 1);
        for (let k = 0; k < 8; k++) this.chips.push({ x: r.x, y: r.y - 4, vx: this.rng.range(-50, 50), vy: this.rng.range(-70, -20), t: 0 });
      }
      if (r.t > r.warn + 2) this.rocks.splice(i, 1);
    }
    for (let i = this.bats.length - 1; i >= 0; i--) {
      const b = this.bats[i];
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt + Math.sin(b.t * 18) * 0.6;
      if (b.t > 3) this.bats.splice(i, 1);
    }
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const c = this.chips[i];
      c.t += dt;
      c.vy += 220 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.t > 1) this.chips.splice(i, 1);
    }
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = this.rng.range(0.3, 0.9);
      this.drips.push({ x: this.rng.range(8, SCENE_W - 8), y: 26, vy: 0 });
    }
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      d.vy += 180 * dt;
      d.y += d.vy * dt;
      if (d.y > FLOOR_Y + 20) this.drips.splice(i, 1);
    }
  }

  protected click(x: number, y: number): void {
    // Roosting bats first: they hang right where crystals like to grow.
    for (const r of this.roosts) {
      if (r.away > 0) continue;
      if (Math.hypot(r.x - x, r.y + 6 - y) < 15) {
        r.away = 7;
        for (let i = 0; i < 9; i++) this.bats.push({ x: r.x, y: r.y + 6, vx: this.rng.range(-90, 90), vy: this.rng.range(-10, 60), t: 0 });
        this.audio.play('whoosh', { volume: 0.7, pitch: 1.4 });
        this.hurt('swarm', r.x, r.y + 12);
        return;
      }
    }
    let best: Vein | null = null;
    let bd = 13;
    for (const v of this.veins) {
      const d = Math.hypot(v.x - x, v.y - y);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    if (best) {
      best.hp--;
      best.age = Math.min(best.age, best.life - 2);
      for (let i = 0; i < 4; i++) this.chips.push({ x: best.x, y: best.y, vx: this.rng.range(-40, 40), vy: this.rng.range(-60, -10), t: 0 });
      if (best.hp > 0) {
        this.audio.play('metalClang', { volume: 0.35, pitch: 1.6 + (3 - best.hp) * 0.2 });
        return;
      }
      if (this.collect(best.id, best.x, best.y, true)) this.veins.splice(this.veins.indexOf(best), 1);
      else best.hp = 1;
      return;
    }
    let item: FloorItem | null = null;
    let id = 12;
    for (const it of this.items) {
      const d = Math.hypot(it.x - x, it.y - 4 - y);
      if (d < id) {
        id = d;
        item = it;
      }
    }
    if (item && this.collect(item.id, item.x, item.y - 4)) this.items.splice(this.items.indexOf(item), 1);
  }

  protected paint(g: CanvasRenderingContext2D): void {
    g.drawImage(this.back, 0, 0);
    // Roosting swarms: a clump of sleeping bats with red eyes that blink.
    for (const r of this.roosts) {
      if (r.away > 0) continue;
      g.fillStyle = '#0e0c16';
      ellipse(g, r.x, r.y + 5, 13, 7);
      for (let k = -2; k <= 2; k++) tri(g, r.x + k * 5 - 3, r.y + 8, r.x + k * 5 + 3, r.y + 8, r.x + k * 5, r.y + 15);
      if (Math.sin(this.time * 1.7 + r.x) > 0.3) {
        rect(g, r.x - 6, r.y + 6, 1, 1, '#e43b44');
        rect(g, r.x + 4, r.y + 7, 1, 1, '#e43b44');
        rect(g, r.x - 1, r.y + 9, 1, 1, '#e43b44');
      }
    }
    // Crystal veins
    for (const v of this.veins) {
      const fade = v.life - v.age < 1.2 ? Math.floor((v.life - v.age) * 8) % 2 : 1;
      if (!fade) continue;
      const shine = 0.5 + 0.5 * Math.sin(this.time * 3 + v.phase);
      g.fillStyle = '#3a4466';
      ellipse(g, v.x, v.y + 3, 10, 5);
      const c1 = mixHex('#2ce8f5', '#e8fff8', shine * 0.5);
      g.fillStyle = c1;
      tri(g, v.x - 7, v.y + 4, v.x - 3, v.y + 4, v.x - 6, v.y - 7);
      tri(g, v.x - 3, v.y + 4, v.x + 3, v.y + 4, v.x, v.y - 12);
      tri(g, v.x + 2, v.y + 4, v.x + 7, v.y + 4, v.x + 6, v.y - 6);
      rect(g, v.x - 1, v.y - 8, 1, 6, '#e8fff8');
      // Cracks show the damage done.
      if (v.hp < 3) {
        rect(g, v.x - 5, v.y - 2, 4, 1, '#181425');
        rect(g, v.x - 2, v.y - 1, 1, 3, '#181425');
      }
      if (v.hp < 2) {
        rect(g, v.x + 1, v.y - 6, 1, 4, '#181425');
        rect(g, v.x + 2, v.y - 3, 3, 1, '#181425');
      }
    }
    for (const it of this.items) {
      const fade = it.life - it.age < 1 ? Math.floor((it.life - it.age) * 8) % 2 : 1;
      if (!fade) continue;
      g.fillStyle = 'rgba(14, 12, 22, 0.5)';
      g.fillRect(Math.floor(it.x) - 6, Math.floor(it.y) + 3, 12, 2);
      this.drawIcon(it.id, it.x, it.y - 4);
    }
    // Falling rocks: dust, a growing shadow, then the rock itself.
    for (const r of this.rocks) {
      if (!r.landed) {
        const k = r.t / r.warn;
        g.fillStyle = `rgba(14, 12, 22, ${0.25 + k * 0.45})`;
        ellipse(g, r.x, r.y, 6 + k * 12, 2 + k * 4);
        g.fillStyle = '#8b9bb4';
        for (let i = 0; i < 4; i++) g.fillRect(Math.floor(r.x + Math.sin(i * 7 + this.time * 9) * 6), Math.floor(24 + ((this.time * 60 + i * 23) % (r.y - 24))), 1, 2);
        if (k > 0.75) {
          const ry = 20 + (r.y - 20) * ((k - 0.75) / 0.25) ** 2;
          g.fillStyle = '#5a6988';
          disc(g, r.x, ry - 6, 7);
        }
      } else {
        g.fillStyle = '#5a6988';
        ellipse(g, r.x, r.y - 4, 10, 6);
        g.fillStyle = '#8b9bb4';
        g.fillRect(Math.floor(r.x) - 5, Math.floor(r.y) - 9, 6, 2);
      }
    }
    for (const c of this.chips) rect(g, c.x, c.y, 1, 1, '#8b9bb4');
    for (const d of this.drips) rect(g, d.x, d.y, 1, 2, '#6fa8d6');
    for (const b of this.bats) {
      g.fillStyle = '#181425';
      const w = Math.sin(b.t * 30) > 0 ? 4 : 2;
      g.fillRect(Math.floor(b.x) - w, Math.floor(b.y), w * 2 + 1, 1);
      g.fillRect(Math.floor(b.x) - 1, Math.floor(b.y) - 1, 3, 2);
    }

    // Darkness with a hole for the lantern and little halos for glowing things.
    const [dc, dg] = this.dark;
    dg.globalCompositeOperation = 'source-over';
    dg.clearRect(0, 0, SCENE_W, SCENE_H);
    dg.fillStyle = 'rgba(6, 5, 14, 0.93)';
    dg.fillRect(0, 0, SCENE_W, SCENE_H);
    dg.globalCompositeOperation = 'destination-out';
    const R = this.has('cat') ? 58 : 42;
    dg.fillStyle = 'rgba(0,0,0,0.45)';
    disc(dg, this.lanternX, this.lanternY, R);
    dg.fillStyle = 'rgba(0,0,0,0.7)';
    disc(dg, this.lanternX, this.lanternY, R * 0.78);
    dg.fillStyle = 'rgba(0,0,0,1)';
    disc(dg, this.lanternX, this.lanternY, R * 0.55);
    dg.fillStyle = 'rgba(0,0,0,0.55)';
    for (const v of this.veins) disc(dg, v.x, v.y - 2, 9 + Math.sin(this.time * 3 + v.phase) * 2);
    for (const it of this.items) if (it.id === 'glowing_mushroom') disc(dg, it.x, it.y - 4, 8);
    for (const r of this.rocks) if (!r.landed) disc(dg, r.x, r.y, 10);
    dg.globalCompositeOperation = 'source-over';
    g.drawImage(dc, 0, 0);
    // Warm lantern glow and the lantern itself.
    g.fillStyle = 'rgba(254, 231, 97, 0.07)';
    disc(g, this.lanternX, this.lanternY, R * 0.6);
    const lx = Math.floor(this.lanternX);
    const ly = Math.floor(this.lanternY);
    rect(g, lx - 1, ly - 9, 3, 1, '#3e2731');
    rect(g, lx - 3, ly - 8, 7, 1, '#733e39');
    rect(g, lx - 2, ly - 7, 5, 6, '#feae34');
    rect(g, lx - 1, ly - 6, 3, 4, '#fff4b0');
    rect(g, lx - 3, ly - 1, 7, 1, '#733e39');
  }

  private paintBack(): HTMLCanvasElement {
    const [c, g] = canvas(SCENE_W, SCENE_H);
    g.fillStyle = '#262b44';
    g.fillRect(0, 0, SCENE_W, SCENE_H);
    // Rock strata
    for (let y = 30; y < FLOOR_Y; y += 7) {
      g.fillStyle = y % 14 === 2 ? '#2c3250' : '#232840';
      for (let x = 0; x < SCENE_W; x += 3) g.fillRect(x, y + Math.round(Math.sin(x * 0.07 + y) * 2), 3, 3);
    }
    for (let i = 0; i < 120; i++) rect(g, this.rng.range(0, SCENE_W), this.rng.range(30, FLOOR_Y), 1, 1, this.rng.chance(0.5) ? '#3a4466' : '#181425');
    // Ceiling and stalactites
    g.fillStyle = '#181425';
    g.fillRect(0, 0, SCENE_W, 22);
    for (let x = 0; x < SCENE_W; x += 8) tri(g, x, 20, x + 8, 20, x + 4, 24 + this.rng.range(0, 22));
    // Pillars
    g.fillStyle = '#1d2138';
    for (const px of [18, 150, 292]) {
      g.fillRect(px - 6, 22, 12, FLOOR_Y - 22);
      g.fillStyle = '#2c3250';
      g.fillRect(px - 6, 22, 2, FLOOR_Y - 22);
      g.fillStyle = '#1d2138';
    }
    // Floor
    g.fillStyle = '#3a4466';
    g.fillRect(0, FLOOR_Y, SCENE_W, SCENE_H - FLOOR_Y);
    g.fillStyle = '#5a6988';
    for (let x = 0; x < SCENE_W; x += 11) g.fillRect(x + this.rng.range(0, 6), FLOOR_Y + this.rng.range(2, 38), this.rng.range(2, 6), 1);
    for (let x = 6; x < SCENE_W; x += this.rng.range(30, 60)) {
      g.fillStyle = '#2c3250';
      tri(g, x, FLOOR_Y + 2, x + 10, FLOOR_Y + 2, x + 5, FLOOR_Y - 12 - this.rng.range(0, 10));
    }
    // A pool of still water
    g.fillStyle = '#1d2b44';
    ellipse(g, 236, 164, 40, 6);
    g.fillStyle = '#3a6688';
    g.fillRect(214, 162, 12, 1);
    return c;
  }
}
