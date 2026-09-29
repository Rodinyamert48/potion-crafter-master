// Dragon Valley: snatching scales from a sleeping dragon. Every tap makes a
// little noise; too much noise – or bad luck – and the dragon opens an eye.
// Grabbing anything while it watches gets you scorched. Embers rain from the
// volcano (they burn scales on the ground and your fingers), and once in a
// while a phoenix feather drifts down: catch it before it reaches the lava.

import { MiniGame, SCENE_H, SCENE_W, type MiniGameOptions } from './MiniGame';
import { canvas, disc, ellipse, label, rect, tri } from './draw';
import { t } from '../../core/i18n';
import { mixHex } from '../../core/math';

const GROUND_Y = 128;
const LAVA_Y = 166;

interface Scale {
  x: number;
  y: number;
  age: number;
  life: number;
  phase: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Feather {
  x: number;
  y: number;
  t: number;
  x0: number;
}

interface Puff {
  x: number;
  y: number;
  t: number;
}

export class ValleyGame extends MiniGame {
  private readonly back: HTMLCanvasElement;
  private readonly scales: Scale[] = [];
  private readonly embers: Ember[] = [];
  private readonly puffs: Puff[] = [];
  private feather: Feather | null = null;
  /** 0..1: the dragon's sleep gets lighter with every sound. */
  private noise = 0;
  /** >0 while the eye is open (seconds left). */
  private watch = 0;
  /** Countdown to the next peek, and the warning before it. */
  private peekT = 6;
  private warn = 0;
  private scaleT = 0.3;
  private emberT = 1.5;
  private featherT = 8;
  private breathT = 0;

  constructor(o: MiniGameOptions) {
    super(o);
    this.back = this.paintBack();
    this.peekT = this.rng.range(5, 7);
  }

  get help(): string {
    return t('mg.help.valley');
  }

  private scaleId(): string {
    return this.finds.find((f) => f.ingredientId === 'dragon_scale')?.ingredientId ?? this.pickFind((f) => !f.rare)?.ingredientId ?? 'dragon_scale';
  }

  private get warnLead(): number {
    // The dog hears the dragon stir earlier.
    return this.has('dog') ? 1.4 : 0.8;
  }

  private openEye(seconds: number): void {
    this.watch = seconds;
    this.warn = 0;
    this.audio.play('rumble', { volume: 0.6 });
  }

  protected step(dt: number): void {
    this.noise = Math.max(0, this.noise - dt * 0.1);
    this.breathT += dt;
    if (this.watch > 0) {
      this.watch -= dt;
      if (this.watch <= 0) this.peekT = this.rng.range(4.5, 7.5);
    } else {
      this.peekT -= dt;
      if (this.peekT <= this.warnLead && this.warn <= 0) {
        this.warn = this.warnLead;
        this.audio.play('rumble', { volume: 0.25, pitch: 1.4 });
      }
      if (this.warn > 0) {
        this.warn -= dt;
        if (Math.floor(this.time * 10) % 3 === 0) this.puffs.push({ x: 198, y: 116, t: 0 });
      }
      if (this.peekT <= 0) this.openEye(1.3);
    }
    if (this.noise >= 1 && this.watch <= 0) {
      this.noise = 0.55;
      this.openEye(2);
      this.audio.play('angry', { volume: 0.7, pitch: 0.5 });
    }
    // Snoring smoke rings while asleep
    if (this.watch <= 0 && Math.sin(this.breathT * 1.6) > 0.97) this.puffs.push({ x: 198, y: 116, t: 0 });
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      this.puffs[i].t += dt;
      if (this.puffs[i].t > 1.4) this.puffs.splice(i, 1);
    }

    if (!this.closing) {
      this.scaleT -= dt;
      if (this.scaleT <= 0 && this.scales.length < 4) {
        this.scaleT = this.rng.range(1.2, 2.2);
        // The closer to the dragon, the more scales.
        const x = 200 - Math.abs(this.rng.range(-1, 1) * this.rng.range(0, 1)) * 170;
        this.scales.push({ x, y: this.rng.range(GROUND_Y + 8, LAVA_Y - 8), age: 0, life: this.rng.range(7, 10), phase: this.rng.range(0, 6.28) });
      }
      this.emberT -= dt;
      if (this.emberT <= 0 && this.hazards.some((h) => h.id === 'ember')) {
        this.emberT = this.rng.range(0.9, 1.7);
        this.embers.push({ x: this.rng.range(10, 250), y: -4, vx: this.rng.range(-8, 8), vy: this.rng.range(24, 40) });
      }
      this.featherT -= dt;
      const phoenix = this.finds.find((f) => f.ingredientId === 'phoenix_feather');
      if (this.featherT <= 0 && !this.feather && phoenix) {
        this.featherT = this.rng.range(9, 13);
        if (this.rng.chance(0.55)) {
          const x0 = this.rng.range(40, 220);
          this.feather = { x: x0, y: -6, t: 0, x0 };
          this.audio.play('chime', { volume: 0.4, pitch: 1.5 });
        }
      }
    }
    for (const s of this.scales) s.age += dt;
    for (let i = this.scales.length - 1; i >= 0; i--) if (this.scales[i].age > this.scales[i].life) this.scales.splice(i, 1);
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.y > GROUND_Y + 6) {
        // Burns a scale it lands on.
        for (let k = this.scales.length - 1; k >= 0; k--) {
          const s = this.scales[k];
          if (Math.abs(s.x - e.x) < 9 && e.y > s.y - 6) {
            this.scales.splice(k, 1);
            this.word(s.x, s.y - 10, t('mg.burnt'), '#f77622');
            this.audio.play('sizzle', { volume: 0.35 });
          }
        }
      }
      if (e.y > LAVA_Y) this.embers.splice(i, 1);
    }
    if (this.feather) {
      const f = this.feather;
      f.t += dt;
      f.y += dt * 30;
      f.x = f.x0 + Math.sin(f.t * 2.2) * 22;
      if (f.y > LAVA_Y) {
        this.word(f.x, LAVA_Y - 10, t('mg.lost'), '#f77622');
        this.audio.play('flare', { volume: 0.4 });
        this.feather = null;
      }
    }
  }

  protected click(x: number, y: number): void {
    // A tap is a sound; the cat is lighter on its paws.
    this.noise = Math.min(1.05, this.noise + (this.has('cat') ? 0.07 : 0.11));
    for (let i = 0; i < this.embers.length; i++) {
      const e = this.embers[i];
      if (Math.hypot(e.x - x, e.y - y) < 8) {
        this.embers.splice(i, 1);
        this.hurt('ember', e.x, e.y);
        return;
      }
    }
    const f = this.feather;
    if (f && Math.hypot(f.x - x, f.y - y) < 14) {
      if (this.watch > 0) {
        this.hurt('claw', f.x, f.y);
        return;
      }
      if (this.collect('phoenix_feather', f.x, f.y, true)) this.feather = null;
      return;
    }
    let best: Scale | null = null;
    let bd = 12;
    for (const s of this.scales) {
      const d = Math.hypot(s.x - x, s.y - 3 - y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best) return;
    if (this.watch > 0) {
      // Caught red-handed: a lick of flame.
      this.puffs.push({ x: best.x, y: best.y, t: 0 });
      this.hurt('claw', best.x, best.y - 4, 'sizzle');
      return;
    }
    if (this.collect(this.scaleId(), best.x, best.y - 3)) this.scales.splice(this.scales.indexOf(best), 1);
  }

  protected paint(g: CanvasRenderingContext2D): void {
    g.drawImage(this.back, 0, 0);
    // Lava river
    for (let x = 0; x < SCENE_W; x += 4) {
      const k = 0.5 + 0.5 * Math.sin(this.time * 2 + x * 0.09);
      g.fillStyle = mixHex('#e43b44', '#feae34', k);
      g.fillRect(x, LAVA_Y + Math.round(Math.sin(this.time * 3 + x * 0.2)), 4, SCENE_H - LAVA_Y);
    }
    this.drawDragon(g);
    for (const s of this.scales) {
      const fade = s.life - s.age < 1 ? Math.floor((s.life - s.age) * 8) % 2 : 1;
      if (!fade) continue;
      g.fillStyle = 'rgba(24, 20, 37, 0.35)';
      g.fillRect(Math.floor(s.x) - 6, Math.floor(s.y) + 2, 12, 2);
      this.drawIcon(this.scaleId(), s.x, s.y - 4, 14);
      if (Math.sin(this.time * 4 + s.phase) > 0.8) rect(g, s.x + 3, s.y - 9, 1, 1, '#ffffff');
    }
    for (const e of this.embers) {
      g.fillStyle = 'rgba(247, 118, 34, 0.25)';
      disc(g, e.x, e.y, 4);
      rect(g, e.x - 1, e.y - 1, 3, 3, '#feae34');
      rect(g, e.x, e.y - 4, 1, 3, '#e43b44');
    }
    if (this.feather) {
      const f = this.feather;
      g.fillStyle = 'rgba(254, 231, 97, 0.2)';
      disc(g, f.x, f.y, 9);
      this.drawIcon('phoenix_feather', f.x, f.y, 16);
    }
    for (const p of this.puffs) {
      const a = 1 - p.t / 1.4;
      g.fillStyle = `rgba(90, 80, 104, ${0.5 * a})`;
      disc(g, p.x - p.t * 14, p.y - p.t * 16, 2 + p.t * 5);
    }
    // Sleep meter
    const w = 70;
    rect(g, 6, 22, w + 2, 6, '#181425');
    rect(g, 7, 23, w * Math.min(1, this.noise), 4, this.noise > 0.75 ? '#e43b44' : this.noise > 0.45 ? '#feae34' : '#63c74d');
    label(g, t('mg.noise'), 7, 16, '#e8eef8', 10, 'left');
    if (this.watch > 0) label(g, t('mg.watching'), SCENE_W / 2, 30, '#e43b44', 14);
    else if (this.warn > 0) label(g, t('mg.stirring'), 205, 86, '#feae34', 10);
  }

  private drawDragon(g: CanvasRenderingContext2D): void {
    const breath = Math.sin(this.breathT * 1.6) * 2;
    const body = '#a22633';
    const dark = '#733e39';
    // Tail curling in front
    g.fillStyle = dark;
    ellipse(g, 262, 138, 52, 7);
    // Body (rises and falls)
    g.fillStyle = body;
    ellipse(g, 268, 112 - breath * 0.5, 48, 26 + breath);
    g.fillStyle = '#c84a52';
    ellipse(g, 268, 124, 40, 8);
    // Folded wing
    g.fillStyle = dark;
    tri(g, 240, 100 - breath, 312, 86 - breath, 300, 118);
    tri(g, 250, 104 - breath, 290, 74 - breath, 286, 110);
    // Spikes along the back
    g.fillStyle = '#feae34';
    for (let i = 0; i < 6; i++) tri(g, 232 + i * 13, 90 - breath, 240 + i * 13, 90 - breath, 236 + i * 13, 80 - breath);
    // Neck and head resting on the ground
    g.fillStyle = body;
    ellipse(g, 226, 118, 16, 9);
    ellipse(g, 206, 122, 16, 8);
    g.fillStyle = dark;
    tri(g, 212, 114, 222, 114, 222, 104);
    rect(g, 190, 124, 20, 3, dark);
    rect(g, 193, 119, 2, 2, '#181425');
    // The eye: a closed line, or a burning slit
    if (this.watch > 0) {
      rect(g, 207, 116, 7, 4, '#fee761');
      rect(g, 210, 116, 1, 4, '#181425');
      g.fillStyle = 'rgba(254, 231, 97, 0.25)';
      disc(g, 210, 118, 7);
    } else {
      rect(g, 207, 118, 7, 1, '#181425');
    }
  }

  private paintBack(): HTMLCanvasElement {
    const [c, g] = canvas(SCENE_W, SCENE_H);
    const sc = this.region.scenery;
    const [top, bottom] = this.night ? sc.skyNight : sc.skyDay;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = mixHex(top, bottom, i / 7);
      g.fillRect(0, Math.floor((i * GROUND_Y) / 8), SCENE_W, Math.ceil(GROUND_Y / 8) + 1);
    }
    // Volcano and jagged ridges
    g.fillStyle = this.night ? '#2a1a20' : '#733e39';
    for (let x = 0; x < SCENE_W; x++) {
      const h = 26 + Math.abs(Math.sin(x * 0.05)) * 18 + Math.sin(x * 0.17) * 4;
      g.fillRect(x, GROUND_Y - Math.floor(h), 1, Math.floor(h));
    }
    g.fillStyle = this.night ? '#3e2731' : '#8f563b';
    tri(g, 60, GROUND_Y - 20, 170, GROUND_Y - 20, 115, 24);
    rect(g, 108, 24, 14, 3, '#e43b44');
    rect(g, 111, 22, 8, 2, '#feae34');
    // Ground
    g.fillStyle = this.night ? '#4a2e2a' : '#8f563b';
    g.fillRect(0, GROUND_Y, SCENE_W, LAVA_Y - GROUND_Y);
    g.fillStyle = this.night ? '#5a3a32' : '#c28569';
    for (let i = 0; i < 70; i++) g.fillRect(this.rng.range(0, SCENE_W), this.rng.range(GROUND_Y + 2, LAVA_Y - 2), this.rng.range(2, 6), 1);
    // Bones of an unlucky knight
    rect(g, 30, 150, 10, 2, '#ead4aa');
    rect(g, 28, 148, 3, 3, '#ead4aa');
    disc(g, 48, 147, 3);
    return c;
  }
}
