// Moon Shrine: the runes of the moon. Five standing stones light up in a
// sequence, each with its own note; repeat it by tapping the stones. Every
// sequence you repeat makes the altar grant a gift and the next one grows
// longer. A wrong stone angers the shrine's guardians (shades at night,
// ravens by day). The cat slows the runes down; the dog sniffs out the next
// stone after a mistake.

import { MiniGame, SCENE_H, SCENE_W, type MiniGameOptions } from './MiniGame';
import { canvas, disc, ellipse, label, rect, tri } from './draw';
import { t } from '../../core/i18n';
import { mixHex } from '../../core/math';

const RUNES = ['#c0cbff', '#9af5e6', '#fee761', '#f6757a', '#b55088'];
const STONES: Array<[number, number]> = [
  [48, 116],
  [104, 92],
  [160, 84],
  [216, 92],
  [272, 116],
];

type Phase = 'intro' | 'show' | 'input' | 'reward' | 'fail';

export class ShrineGame extends MiniGame {
  private readonly back: HTMLCanvasElement;
  private seq: number[] = [];
  private phase: Phase = 'intro';
  private phaseT = 0;
  private shown = 0;
  private input = 0;
  private lit = -1;
  private litT = 0;
  private hintStone = -1;
  private rounds = 0;
  private guardian: { x: number; y: number; t: number } | null = null;

  constructor(o: MiniGameOptions) {
    super(o);
    this.duration = 45;
    this.back = this.paintBack();
    for (let i = 0; i < 3; i++) this.seq.push(this.rng.int(0, 4));
  }

  get help(): string {
    return t('mg.help.shrine');
  }

  private get beat(): number {
    return this.has('cat') ? 0.62 : 0.48;
  }

  private light(i: number, time = 0.32): void {
    this.lit = i;
    this.litT = time;
    this.audio.play('chime', { volume: 0.45, pitch: [0.8, 0.95, 1.1, 1.25, 1.45][i] });
  }

  protected step(dt: number): void {
    this.phaseT += dt;
    this.litT -= dt;
    if (this.litT <= 0) this.lit = -1;
    if (this.guardian) {
      this.guardian.t += dt;
      if (this.guardian.t > 1.2) this.guardian = null;
    }
    switch (this.phase) {
      case 'intro':
        if (this.phaseT > 1) this.startShow();
        break;
      case 'show':
        if (this.phaseT >= this.beat) {
          this.phaseT = 0;
          if (this.shown < this.seq.length) {
            this.light(this.seq[this.shown], this.beat * 0.7);
            this.shown++;
          } else {
            this.phase = 'input';
            this.input = 0;
          }
        }
        break;
      case 'reward':
        if (this.phaseT > 0.9 && !this.closing) this.startShow();
        break;
      case 'fail':
        if (this.phaseT > 1.1 && !this.closing) this.startShow();
        break;
      default:
        break;
    }
  }

  private startShow(): void {
    this.phase = 'show';
    this.phaseT = 0;
    this.shown = 0;
  }

  protected click(x: number, y: number): void {
    if (this.phase !== 'input') return;
    let hit = -1;
    STONES.forEach(([sx, sy], i) => {
      if (Math.abs(x - sx) < 16 && y > sy - 44 && y < sy + 6) hit = i;
    });
    if (hit < 0) return;
    this.light(hit, 0.25);
    this.hintStone = -1;
    if (hit === this.seq[this.input]) {
      this.input++;
      if (this.input >= this.seq.length) this.reward();
      return;
    }
    // Wrong rune: the guardians stir.
    const id = this.hazards.some((h) => h.id === 'shade') ? 'shade' : 'raven';
    this.guardian = { x: STONES[hit][0], y: STONES[hit][1] - 30, t: 0 };
    this.hurt(id, STONES[hit][0], STONES[hit][1] - 30, id === 'shade' ? 'whoosh' : 'angry');
    this.phase = 'fail';
    this.phaseT = 0;
    if (this.has('dog')) this.hintStone = this.seq[0];
  }

  private reward(): void {
    this.rounds++;
    this.phase = 'reward';
    this.phaseT = 0;
    // Longer sequences earn the rarer gifts.
    const long = this.seq.length >= 6;
    const f = long && this.rng.chance(0.4) ? (this.pickFind((x) => !!x.rare) ?? this.pickFind()) : this.pickFind((x) => !x.rare);
    if (f) this.collect(f.ingredientId, 160, 128, !!f.rare);
    if (this.seq.length >= 5 && !this.full) {
      const extra = this.pickFind((x) => !x.rare);
      if (extra) this.collect(extra.ingredientId, 168, 124, false, true);
    }
    this.word(160, 100, t('mg.runeOk'), '#c0cbff');
    this.seq.push(this.rng.int(0, 4));
  }

  protected paint(g: CanvasRenderingContext2D): void {
    g.drawImage(this.back, 0, 0);
    // Moon basin on the altar glows brighter with every round.
    const glow = 0.3 + Math.min(0.6, this.rounds * 0.1) + (this.phase === 'reward' ? 0.3 : 0);
    g.fillStyle = `rgba(192, 203, 255, ${0.16 * glow})`;
    disc(g, 160, 128, 22);
    rect(g, 146, 126, 28, 3, mixHex('#5a6988', '#e8eef8', glow));
    STONES.forEach(([x, y], i) => {
      const on = this.lit === i;
      const hint = this.hintStone === i && this.phase === 'input' && Math.floor(this.time * 4) % 2 === 0;
      g.fillStyle = '#3a4466';
      g.fillRect(x - 12, y - 40, 24, 44);
      tri(g, x - 12, y - 40, x + 12, y - 40, x, y - 50);
      g.fillStyle = '#4a5070';
      g.fillRect(x - 12, y - 40, 4, 44);
      g.fillStyle = '#262b44';
      g.fillRect(x - 12, y + 2, 24, 2);
      const col = RUNES[i];
      if (on || hint) {
        g.fillStyle = `${col}55`;
        disc(g, x, y - 22, 16);
      }
      this.rune(g, i, x, y - 22, on ? '#ffffff' : hint ? col : mixHex(col, '#262b44', 0.55));
    });
    if (this.guardian) {
      const k = this.guardian.t / 1.2;
      const gx = this.guardian.x;
      const gy = this.guardian.y - k * 10;
      g.globalAlpha = 1 - k;
      if (this.night) {
        g.fillStyle = '#181425';
        ellipse(g, gx, gy, 9, 14);
        tri(g, gx - 9, gy + 6, gx + 9, gy + 6, gx, gy + 22);
        rect(g, gx - 4, gy - 4, 2, 2, '#e43b44');
        rect(g, gx + 2, gy - 4, 2, 2, '#e43b44');
      } else {
        g.fillStyle = '#181425';
        ellipse(g, gx, gy, 7, 4);
        tri(g, gx - 16, gy - 4 + Math.sin(k * 30) * 4, gx - 2, gy, gx - 4, gy + 2);
        tri(g, gx + 16, gy - 4 + Math.sin(k * 30) * 4, gx + 2, gy, gx + 4, gy + 2);
        rect(g, gx + 6, gy - 2, 3, 1, '#feae34');
      }
      g.globalAlpha = 1;
    }
    const msg = this.phase === 'show' || this.phase === 'intro' ? t('mg.watchRunes') : this.phase === 'input' ? t('mg.yourTurn', { n: this.seq.length - this.input }) : '';
    if (msg) label(g, msg, SCENE_W / 2, 20, '#e8eef8', 12);
    label(g, t('mg.length', { n: this.seq.length }), 8, SCENE_H - 10, '#c0cbff', 10, 'left');
  }

  /** Five simple glyphs drawn from pixels. */
  private rune(g: CanvasRenderingContext2D, i: number, x: number, y: number, col: string): void {
    g.fillStyle = col;
    const p = (dx: number, dy: number, w = 1, h = 1) => g.fillRect(Math.floor(x + dx), Math.floor(y + dy), w, h);
    switch (i) {
      case 0: // crescent moon
        p(-3, -5, 4, 1);
        p(-5, -4, 2, 8);
        p(-3, 4, 4, 1);
        p(-4, -4, 1, 1);
        p(-4, 3, 1, 1);
        break;
      case 1: // star
        p(0, -6, 1, 13);
        p(-6, 0, 13, 1);
        p(-3, -3, 1, 1);
        p(3, -3, 1, 1);
        p(-3, 3, 1, 1);
        p(3, 3, 1, 1);
        break;
      case 2: // sun ring
        p(-3, -5, 7, 1);
        p(-3, 5, 7, 1);
        p(-5, -3, 1, 7);
        p(5, -3, 1, 7);
        p(0, 0, 1, 1);
        break;
      case 3: // eye
        p(-5, 0, 11, 1);
        p(-3, -2, 7, 1);
        p(-3, 2, 7, 1);
        p(-1, -1, 3, 3);
        break;
      default: // branch
        p(0, -6, 1, 13);
        p(-4, -4, 4, 1);
        p(1, -1, 4, 1);
        p(-4, 2, 4, 1);
        break;
    }
  }

  private paintBack(): HTMLCanvasElement {
    const [c, g] = canvas(SCENE_W, SCENE_H);
    const sc = this.region.scenery;
    const [top, bottom] = this.night ? sc.skyNight : sc.skyDay;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = mixHex(top, bottom, i / 7);
      g.fillRect(0, Math.floor((i * 130) / 8), SCENE_W, 18);
    }
    for (let i = 0; i < 60; i++) rect(g, this.rng.range(0, SCENE_W), this.rng.range(0, 80), 1, 1, this.night ? '#e8eef8' : '#c0cbff');
    // A huge moon behind the circle
    g.fillStyle = this.night ? '#e8eef8' : '#c8d0e8';
    disc(g, 160, 44, 26);
    g.fillStyle = this.night ? '#c0c8d8' : '#b0b8d0';
    disc(g, 150, 38, 5);
    disc(g, 170, 52, 4);
    disc(g, 166, 34, 3);
    // Distant ruins
    g.fillStyle = '#262b44';
    for (let x = 0; x < SCENE_W; x++) g.fillRect(x, 100 - Math.floor(Math.abs(Math.sin(x * 0.04)) * 12), 1, 40);
    for (const [x, h] of [
      [14, 40],
      [300, 34],
      [132, 22],
      [192, 26],
    ])
      g.fillRect(x, 100 - h, 8, h);
    // Ground and the circle's worn floor
    g.fillStyle = this.night ? '#2c3250' : '#4a5070';
    g.fillRect(0, 118, SCENE_W, SCENE_H - 118);
    g.fillStyle = this.night ? '#3a4466' : '#5a6988';
    ellipse(g, 160, 140, 130, 16);
    g.fillStyle = this.night ? '#2c3250' : '#4a5070';
    ellipse(g, 160, 140, 110, 11);
    // Altar
    g.fillStyle = '#5a6988';
    g.fillRect(142, 128, 36, 18);
    g.fillStyle = '#8b9bb4';
    g.fillRect(140, 126, 40, 3);
    g.fillStyle = '#3a4466';
    g.fillRect(150, 134, 20, 2);
    // Grass tufts and gravestones
    g.fillStyle = this.night ? '#1e3020' : '#3e6a2d';
    for (let x = 4; x < SCENE_W; x += this.rng.range(14, 30)) for (let k = 0; k < 3; k++) g.fillRect(x + k * 2, 168 - (k % 2) * 3, 1, 8);
    g.fillStyle = '#3a4466';
    for (const x of [20, 296]) {
      g.fillRect(x - 5, 150, 10, 14);
      disc(g, x, 150, 5);
      g.fillStyle = '#262b44';
      g.fillRect(x - 1, 150, 2, 7);
      g.fillRect(x - 3, 152, 6, 2);
      g.fillStyle = '#3a4466';
    }
    return c;
  }
}
