// Murky Swamp: toad catching on the lily pads. Bog toads hop from pad to
// pad; their eyes glow now and then – tap a toad while its eyes shine (or,
// for a bonus, in mid-leap) and it spares you an eye. Tap it while its eyes
// are dark and it dives away. Leeches lurk under the ripples and the
// will-o'-wisps drift towards your hand at night.

import { MiniGame, SCENE_H, SCENE_W, type MiniGameOptions } from './MiniGame';
import { canvas, disc, ellipse, rect } from './draw';
import { t } from '../../core/i18n';
import { mixHex, shadeHex } from '../../core/math';

const WATER_Y = 96;

interface Pad {
  x: number;
  y: number;
  r: number;
}

interface Toad {
  pad: number;
  from: number;
  state: 'sit' | 'jump' | 'dive';
  t: number;
  dur: number;
  phase: number;
  x: number;
  y: number;
}

interface Leech {
  x: number;
  y: number;
  vx: number;
  ripple: number;
}

interface Wisp {
  x: number;
  y: number;
  phase: number;
}

interface LogItem {
  x: number;
  y: number;
  id: string;
  age: number;
  life: number;
}

export class SwampGame extends MiniGame {
  private readonly back: HTMLCanvasElement;
  private readonly pads: Pad[] = [];
  private readonly toads: Toad[] = [];
  private readonly leeches: Leech[] = [];
  private readonly wisps: Wisp[] = [];
  private readonly logItems: LogItem[] = [];
  private readonly rings: Array<{ x: number; y: number; t: number; color: string }> = [];
  private itemT = 2;

  constructor(o: MiniGameOptions) {
    super(o);
    const spots: Array<[number, number, number]> = [
      [40, 128, 13],
      [92, 112, 11],
      [150, 136, 14],
      [206, 114, 11],
      [262, 132, 13],
      [118, 160, 12],
      [226, 160, 12],
      [298, 108, 10],
    ];
    for (const [x, y, r] of spots) this.pads.push({ x, y, r });
    for (let i = 0; i < 3; i++) {
      const pad = i * 3;
      this.toads.push({ pad, from: pad, state: 'sit', t: 0, dur: this.rng.range(1, 2.6), phase: this.rng.range(0, 6.28), x: this.pads[pad].x, y: this.pads[pad].y });
    }
    for (let i = 0; i < 3; i++) this.leeches.push({ x: this.rng.range(20, SCENE_W - 20), y: this.rng.range(WATER_Y + 16, SCENE_H - 8), vx: this.rng.range(-14, 14), ripple: this.rng.range(0, 1) });
    if (this.hazards.some((h) => h.id === 'wisp')) for (let i = 0; i < 2; i++) this.wisps.push({ x: this.rng.range(40, SCENE_W - 40), y: this.rng.range(50, 90), phase: this.rng.range(0, 6) });
    this.back = this.paintBack();
  }

  get help(): string {
    return t('mg.help.swamp');
  }

  /** The eyes glow during part of each cycle. */
  private eyesOpen(toad: Toad): boolean {
    return toad.state === 'sit' && Math.sin(this.time * 2.3 + toad.phase) > 0.35;
  }

  private toadFind(): string {
    return this.finds.find((f) => f.ingredientId === 'bog_toad_eye')?.ingredientId ?? this.pickFind()?.ingredientId ?? 'bog_toad_eye';
  }

  private hop(toad: Toad, fast = false): void {
    const taken = new Set(this.toads.map((x) => x.pad));
    const free = this.pads.map((_, i) => i).filter((i) => !taken.has(i));
    if (!free.length) return;
    toad.from = toad.pad;
    toad.pad = this.rng.pick(free);
    toad.state = 'jump';
    toad.t = 0;
    toad.dur = fast ? 0.45 : 0.7;
    this.rings.push({ x: this.pads[toad.from].x, y: this.pads[toad.from].y, t: 0, color: '#8a9a7a' });
  }

  protected step(dt: number): void {
    for (const toad of this.toads) {
      toad.t += dt;
      if (toad.state === 'sit') {
        toad.x = this.pads[toad.pad].x;
        toad.y = this.pads[toad.pad].y;
        if (toad.t > toad.dur && !this.closing) this.hop(toad);
      } else if (toad.state === 'jump') {
        const k = Math.min(1, toad.t / toad.dur);
        const a = this.pads[toad.from];
        const b = this.pads[toad.pad];
        toad.x = a.x + (b.x - a.x) * k;
        toad.y = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * 26;
        if (k >= 1) {
          toad.state = 'sit';
          toad.t = 0;
          toad.dur = this.rng.range(1.4, 3);
          this.rings.push({ x: b.x, y: b.y, t: 0, color: '#8a9a7a' });
          this.audio.play('plop', { volume: 0.25, pitch: 0.8 + this.rng.next() * 0.3 });
        }
      } else if (toad.t > toad.dur) {
        // Surfaces on a free pad after diving.
        const taken = new Set(this.toads.filter((x) => x !== toad).map((x) => x.pad));
        const free = this.pads.map((_, i) => i).filter((i) => !taken.has(i));
        toad.pad = free.length ? this.rng.pick(free) : toad.pad;
        toad.state = 'sit';
        toad.t = 0;
        toad.dur = this.rng.range(1.2, 2.4);
        this.rings.push({ x: this.pads[toad.pad].x, y: this.pads[toad.pad].y, t: 0, color: '#8a9a7a' });
      }
    }
    for (const l of this.leeches) {
      l.x += l.vx * dt;
      if (l.x < 12 || l.x > SCENE_W - 12) l.vx *= -1;
      l.ripple += dt;
      if (l.ripple > 0.8) {
        l.ripple = 0;
        this.rings.push({ x: l.x, y: l.y, t: 0, color: '#5a6a5a' });
      }
    }
    for (const w of this.wisps) {
      // Drawn to the hand.
      const tx = this.pointerIn ? this.mx : SCENE_W / 2 + Math.sin(this.time * 0.4 + w.phase) * 100;
      const ty = this.pointerIn ? this.my : 70 + Math.cos(this.time * 0.5 + w.phase) * 20;
      const d = Math.hypot(tx - w.x, ty - w.y) || 1;
      const sp = 13;
      w.x += ((tx - w.x) / d) * sp * dt + Math.sin(this.time * 2 + w.phase) * 0.3;
      w.y += ((ty - w.y) / d) * sp * dt + Math.cos(this.time * 1.6 + w.phase) * 0.3;
      if (this.pointerIn && d < 6 && this.stun <= 0) {
        this.hurt('wisp', w.x, w.y, 'hissCat');
        w.x = this.rng.chance(0.5) ? 10 : SCENE_W - 10;
        w.y = this.rng.range(30, 80);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].t += dt;
      if (this.rings[i].t > 1) this.rings.splice(i, 1);
    }
    this.itemT -= dt;
    if (this.itemT <= 0 && !this.closing && this.logItems.length < 2) {
      this.itemT = this.rng.range(2.5, 4);
      const f = this.pickFind((x) => x.ingredientId !== 'bog_toad_eye');
      if (f) this.logItems.push({ x: this.rng.range(24, 120), y: 88, id: f.ingredientId, age: 0, life: this.rng.range(6, 8) });
    }
    for (const it of this.logItems) it.age += dt;
    for (let i = this.logItems.length - 1; i >= 0; i--) if (this.logItems[i].age > this.logItems[i].life) this.logItems.splice(i, 1);
  }

  protected click(x: number, y: number): void {
    for (const w of this.wisps) {
      if (Math.hypot(w.x - x, w.y - y) < 9) {
        this.hurt('wisp', w.x, w.y, 'hissCat');
        return;
      }
    }
    // Toads
    let best: Toad | null = null;
    let bd = 14;
    for (const toad of this.toads) {
      if (toad.state === 'dive') continue;
      const d = Math.hypot(toad.x - x, toad.y - 5 - y);
      if (d < bd) {
        bd = d;
        best = toad;
      }
    }
    if (best) {
      const id = this.toadFind();
      if (best.state === 'jump') {
        // Caught in mid-leap: it drops two!
        if (this.collect(id, best.x, best.y - 6)) {
          this.word(best.x, best.y - 26, t('mg.midair'), '#63c74d');
          this.collect(id, best.x + 6, best.y - 6, false, true);
        }
        return;
      }
      if (this.eyesOpen(best)) {
        if (this.collect(id, best.x, best.y - 6)) {
          this.audio.play('frogCroak', { volume: 0.5, pitch: 1.2 });
          this.hop(best, true);
        }
        return;
      }
      // Eyes dark: it croaks indignantly and dives under.
      this.combo = 0;
      this.word(best.x, best.y - 18, t('mg.croak'), '#b4c83a');
      this.audio.play('frogCroak', { volume: 0.6, pitch: 0.8 });
      this.audio.play('splash', { volume: 0.4 });
      best.state = 'dive';
      best.t = 0;
      best.dur = 2;
      this.rings.push({ x: best.x, y: best.y, t: 0, color: '#c8d0a0' });
      return;
    }
    for (let i = 0; i < this.logItems.length; i++) {
      const it = this.logItems[i];
      if (Math.hypot(it.x - x, it.y - 6 - y) < 12) {
        if (this.collect(it.id, it.x, it.y - 6)) this.logItems.splice(i, 1);
        return;
      }
    }
    if (y > WATER_Y) {
      for (const l of this.leeches) {
        if (Math.hypot(l.x - x, l.y - y) < 13) {
          this.hurt('leech', l.x, l.y);
          l.x = this.rng.range(20, SCENE_W - 20);
          return;
        }
      }
      this.rings.push({ x, y, t: 0, color: '#8a9a7a' });
      this.audio.play('plop', { volume: 0.2, pitch: 1.3 });
    }
  }

  protected paint(g: CanvasRenderingContext2D): void {
    g.drawImage(this.back, 0, 0);
    // Water shimmer
    g.fillStyle = mixHex('#3a5040', '#4a6a5a', 0.5 + 0.5 * Math.sin(this.time));
    for (let i = 0; i < 14; i++) {
      const x = (i * 53 + this.time * 6) % SCENE_W;
      g.fillRect(Math.floor(x), WATER_Y + 6 + ((i * 17) % 76), 6, 1);
    }
    for (const r of this.rings) {
      g.strokeStyle = r.color;
      g.globalAlpha = 1 - r.t;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(Math.floor(r.x) + 0.5, Math.floor(r.y) + 0.5, 4 + r.t * 14, 1.5 + r.t * 4, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    for (const p of this.pads) {
      g.fillStyle = '#2d5a2d';
      ellipse(g, p.x, p.y + 1, p.r, p.r * 0.38);
      g.fillStyle = '#3e8948';
      ellipse(g, p.x, p.y, p.r, p.r * 0.36);
      g.fillStyle = '#2d5a2d';
      g.fillRect(Math.floor(p.x), Math.floor(p.y - 1), Math.floor(p.r), 1);
    }
    for (const it of this.logItems) {
      const fade = it.life - it.age < 1 ? Math.floor((it.life - it.age) * 8) % 2 : 1;
      if (fade) this.drawIcon(it.id, it.x, it.y - 6);
    }
    for (const toad of this.toads) if (toad.state !== 'dive') this.drawToad(toad);
    for (const w of this.wisps) {
      const f = 0.6 + 0.4 * Math.sin(this.time * 7 + w.phase);
      g.fillStyle = `rgba(154, 245, 230, ${0.15 * f})`;
      disc(g, w.x, w.y, 9);
      g.fillStyle = '#9af5e6';
      disc(g, w.x, w.y, 3);
      rect(g, w.x - 1, w.y - 1, 2, 2, '#e8fff8');
    }
    // Fog drifting over everything
    g.fillStyle = this.night ? 'rgba(160, 180, 170, 0.12)' : 'rgba(200, 214, 190, 0.18)';
    for (let i = 0; i < 4; i++) {
      const y = 70 + i * 26 + Math.sin(this.time * 0.6 + i) * 4;
      const x = ((this.time * (7 + i * 3)) % 150) - 150;
      for (let k = x; k < SCENE_W; k += 150) g.fillRect(Math.floor(k), Math.floor(y), 96, 4);
    }
    if (this.night) {
      g.fillStyle = `rgba(10, 16, 20, ${this.has('cat') ? 0.2 : 0.38})`;
      g.fillRect(0, 0, SCENE_W, SCENE_H);
      for (const toad of this.toads) {
        if (this.eyesOpen(toad)) {
          g.fillStyle = 'rgba(254, 231, 97, 0.18)';
          disc(g, toad.x, toad.y - 6, 7);
        }
      }
    }
  }

  private drawToad(toad: Toad): void {
    const g = this.g;
    const x = Math.floor(toad.x);
    const y = Math.floor(toad.y);
    const air = toad.state === 'jump';
    const body = '#6a7a3a';
    g.fillStyle = shadeHex(body, -0.25);
    ellipse(g, x, y - 2, 8, air ? 3 : 4);
    g.fillStyle = body;
    ellipse(g, x, y - 4, 7, 4);
    if (air) {
      rect(g, x - 9, y - 1, 3, 4, shadeHex(body, -0.15));
      rect(g, x + 6, y - 1, 3, 4, shadeHex(body, -0.15));
    }
    const open = this.eyesOpen(toad);
    for (const s of [-1, 1]) {
      rect(g, x + s * 4 - 2, y - 9, 4, 3, body);
      rect(g, x + s * 4 - 1, y - 8, 2, 2, open ? '#fee761' : '#3e2731');
      if (open) rect(g, x + s * 4, y - 8, 1, 1, '#ffffff');
    }
    rect(g, x - 3, y - 3, 6, 1, '#3e2731');
    // The dog notices when a toad is about to open its eyes.
    if (this.has('dog') && !open && toad.state === 'sit' && Math.sin(this.time * 2.3 + toad.phase + 0.5) > 0.35) rect(g, x - 1, y - 16, 2, 3, '#fee761');
  }

  private paintBack(): HTMLCanvasElement {
    const [c, g] = canvas(SCENE_W, SCENE_H);
    const sc = this.region.scenery;
    const [top, bottom] = this.night ? sc.skyNight : sc.skyDay;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = mixHex(top, bottom, i / 7);
      g.fillRect(0, Math.floor((i * WATER_Y) / 8), SCENE_W, Math.ceil(WATER_Y / 8) + 1);
    }
    if (this.night) {
      for (let i = 0; i < 40; i++) rect(g, this.rng.range(0, SCENE_W), this.rng.range(0, 60), 1, 1, '#8b9bb4');
      g.fillStyle = '#e8eef8';
      disc(g, 260, 26, 7);
    }
    // Dead trees and reeds on the far bank
    const far = this.night ? '#1a2620' : '#4a5a3a';
    g.fillStyle = far;
    for (let x = 0; x < SCENE_W; x++) g.fillRect(x, WATER_Y - 14 - Math.floor(Math.sin(x * 0.05) * 4 + Math.sin(x * 0.13) * 2), 1, 20);
    for (let x = 14; x < SCENE_W; x += this.rng.range(40, 70)) {
      g.fillRect(x, WATER_Y - 58, 3, 50);
      g.fillRect(x - 8, WATER_Y - 46, 9, 2);
      g.fillRect(x + 2, WATER_Y - 38, 10, 2);
      g.fillRect(x - 10, WATER_Y - 46, 2, 10);
      // Hanging moss
      g.fillStyle = this.night ? '#2a3a30' : '#6a7a4a';
      for (let k = 0; k < 4; k++) g.fillRect(x - 6 + k * 5, WATER_Y - 44, 1, 6 + ((k * 3) % 5));
      g.fillStyle = far;
    }
    // A mossy log on the near bank (things wash up here)
    g.fillStyle = '#4a3a2a';
    g.fillRect(10, 88, 120, 7);
    g.fillStyle = '#6a8a3a';
    for (let x = 12; x < 128; x += 5) g.fillRect(x, 87, 3, 1);
    // Water
    g.fillStyle = this.night ? '#1a2a24' : '#34503e';
    g.fillRect(0, WATER_Y, SCENE_W, SCENE_H - WATER_Y);
    g.fillStyle = this.night ? '#22342c' : '#3e5a48';
    for (let y = WATER_Y + 4; y < SCENE_H; y += 9) g.fillRect(0, y, SCENE_W, 1);
    // Reeds in front
    g.fillStyle = this.night ? '#1e3020' : '#3e6a2d';
    for (let x = 0; x < SCENE_W; x += this.rng.range(18, 40)) for (let k = 0; k < 5; k++) g.fillRect(x + k * 2, SCENE_H - 16 - (k % 3) * 5, 1, 20);
    return c;
  }
}
