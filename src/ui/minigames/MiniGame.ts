// Base of the gathering mini games: a low-resolution pixel canvas with its
// own loop, a basket (haul + capacity), combos, getting hurt, pet perks and
// the little flying icons / floating words every game shares. Each region
// has its own game on top (see ./index.ts).

import type { RegionDef, RegionFind, RegionHazard } from '../../data/regions';
import type { AudioSystem } from '../../audio/AudioSystem';
import { ingredientIconURL } from '../pixelArt';
import { Random } from '../../core/Random';
import { label, rect } from './draw';
import { t } from '../../core/i18n';

export const SCENE_W = 320;
export const SCENE_H = 180;

export interface GatherEvents {
  onCollect(id: string, total: number, full: boolean): void;
  onHurt(hazardId: string, lost: string | null): void;
  onEnd(haul: Record<string, number>): void;
  onTick(progress: number): void;
}

export type PetId = 'cat' | 'dog' | 'slime';

export interface MiniGameOptions {
  region: RegionDef;
  night: boolean;
  finds: RegionFind[];
  hazards: RegionHazard[];
  audio: AudioSystem;
  events: GatherEvents;
  /** How many things fit in the basket. */
  capacity: number;
  /** Pets along for the trip: the dog sniffs out rare finds, the cat sees in
   *  the dark and the slime catches things that fall out of the basket. */
  pets?: PetId[];
}

interface Flyer {
  x: number;
  y: number;
  id: string;
  t: number;
}

interface Word {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

export abstract class MiniGame {
  readonly canvas: HTMLCanvasElement;
  protected readonly g: CanvasRenderingContext2D;
  protected readonly rng = new Random((Date.now() & 0xffff) + 7);
  protected readonly icons = new Map<string, HTMLImageElement>();
  readonly haul: Record<string, number> = {};
  protected time = 0;
  protected stun = 0;
  protected shake = 0;
  protected combo = 0;
  /** Pointer position in scene pixels (for hover mechanics). */
  protected mx = SCENE_W / 2;
  protected my = SCENE_H / 2;
  protected pointerIn = false;
  private readonly flyers: Flyer[] = [];
  private readonly words: Word[] = [];
  private raf = 0;
  private last = 0;
  private running = false;
  private ended = false;
  private endIn = -1;
  duration = 30;
  readonly capacity: number;
  protected readonly region: RegionDef;
  protected readonly night: boolean;
  protected readonly finds: RegionFind[];
  protected readonly hazards: RegionHazard[];
  protected readonly audio: AudioSystem;
  private readonly events: GatherEvents;
  protected readonly pets: PetId[];

  constructor(o: MiniGameOptions) {
    this.region = o.region;
    this.night = o.night;
    this.finds = o.finds;
    this.hazards = o.hazards;
    this.audio = o.audio;
    this.events = o.events;
    this.capacity = o.capacity;
    this.pets = o.pets ?? [];
    this.canvas = document.createElement('canvas');
    this.canvas.width = SCENE_W;
    this.canvas.height = SCENE_H;
    this.canvas.className = 'wb-gather-canvas';
    this.g = this.canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    for (const f of o.finds) this.icon(f.ingredientId);
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.ended || !this.running) return;
      e.preventDefault();
      const [x, y] = this.toScene(e);
      this.mx = x;
      this.my = y;
      if (this.stun > 0) {
        this.audio.play('denied', { volume: 0.4 });
        return;
      }
      this.click(x, y);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      [this.mx, this.my] = this.toScene(e);
      this.pointerIn = true;
    });
    this.canvas.addEventListener('pointerleave', () => (this.pointerIn = false));
  }

  /** One line of instructions for the header. */
  abstract get help(): string;

  /** Simulation step (after the shared timers). */
  protected abstract step(dt: number): void;

  /** Draw the scene (the shared overlay is drawn after it). */
  protected abstract paint(g: CanvasRenderingContext2D): void;

  /** A click / tap at scene coordinates. */
  protected abstract click(x: number, y: number): void;

  protected has(pet: PetId): boolean {
    return this.pets.includes(pet);
  }

  protected icon(id: string): HTMLImageElement {
    let img = this.icons.get(id);
    if (!img) {
      img = new Image();
      img.src = ingredientIconURL(id);
      this.icons.set(id, img);
    }
    return img;
  }

  protected drawIcon(id: string, x: number, y: number, size = 16): void {
    const img = this.icon(id);
    if (img.complete) this.g.drawImage(img, Math.floor(x - size / 2), Math.floor(y - size / 2), size, size);
  }

  private toScene(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / Math.max(1, r.width)) * SCENE_W, ((e.clientY - r.top) / Math.max(1, r.height)) * SCENE_H];
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** End early (e.g. the panel was closed); reports the haul once. */
  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.stop();
    this.events.onEnd({ ...this.haul });
  }

  get count(): number {
    return Object.values(this.haul).reduce((a, b) => a + Math.max(0, b), 0);
  }

  get full(): boolean {
    return this.count >= this.capacity;
  }

  /** Seconds left before the trip ends on its own. */
  get timeLeft(): number {
    return Math.max(0, this.duration - this.time);
  }

  /** The game winds down (no new things should appear). */
  protected get closing(): boolean {
    return this.endIn >= 0 || this.time > this.duration - 2;
  }

  private update(dt: number): void {
    if (this.ended) return;
    this.time += dt;
    this.stun = Math.max(0, this.stun - dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.events.onTick(Math.min(1, this.time / this.duration));
    this.step(dt);
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt * 1.8;
      if (f.t >= 1) this.flyers.splice(i, 1);
    }
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i];
      w.t += dt;
      w.y -= dt * 14;
      if (w.t > 1.3) this.words.splice(i, 1);
    }
    if (this.endIn >= 0) {
      this.endIn -= dt;
      if (this.endIn < 0) this.finish();
    }
    if (this.time >= this.duration) this.finish();
  }

  /** Put a find in the basket (false when it is full). */
  protected collect(id: string, x: number, y: number, rare = false, quiet = false): boolean {
    if (this.full) {
      this.audio.play('denied', { volume: 0.4 });
      this.word(x, y - 10, t('mg.full'), '#feae34');
      return false;
    }
    this.haul[id] = (this.haul[id] ?? 0) + 1;
    this.flyers.push({ x, y, id, t: 0 });
    this.combo++;
    if (!quiet) this.audio.play(rare ? 'discovery' : 'sparkle', { volume: rare ? 0.5 : 0.7, pitch: 0.9 + Math.min(0.5, this.combo * 0.04) });
    if (rare) this.word(x, y - 12, t('mg.rare'), '#fee761');
    this.events.onCollect(id, this.haul[id], this.full);
    // Every fifth clean pick in a row: a bonus of the same kind.
    if (this.combo > 0 && this.combo % 5 === 0 && !this.full) {
      this.haul[id]++;
      this.flyers.push({ x: x + 6, y: y - 4, id, t: -0.15 });
      this.word(x, y - 22, t('mg.combo', { n: this.combo }), '#63c74d');
      this.audio.play('chime', { volume: 0.5, pitch: 1.2 });
      this.events.onCollect(id, this.haul[id], this.full);
    }
    if (this.full) this.endIn = 1.2;
    return true;
  }

  /** Touched something dangerous: stunned for a moment, something may fall out. */
  protected hurt(hazardId: string, x: number, y: number, sound?: 'sizzle' | 'squish' | 'angry' | 'dropHard' | 'hissCat' | 'whoosh'): void {
    this.stun = 1.1;
    this.shake = 1;
    this.combo = 0;
    const owned = Object.keys(this.haul).filter((k) => this.haul[k] > 0);
    let lost: string | null = null;
    if (owned.length) {
      const pick = owned[this.rng.int(0, owned.length - 1)];
      if (this.has('slime') && this.rng.chance(0.5)) {
        this.word(x, y - 22, t('mg.slimeSave'), '#63c74d');
      } else {
        lost = pick;
        this.haul[pick]--;
      }
    }
    this.word(x, y - 10, '!', '#e43b44');
    const snd =
      sound ??
      (hazardId === 'ember' ? 'sizzle' : hazardId === 'leech' || hazardId === 'toadstool' ? 'squish' : hazardId === 'wolf' || hazardId === 'claw' || hazardId === 'raven' ? 'angry' : 'dropHard');
    this.audio.play(snd, { volume: 0.8 });
    this.events.onHurt(hazardId, lost);
  }

  protected word(x: number, y: number, text: string, color: string): void {
    this.words.push({ x, y, text, color, t: 0 });
  }

  /** A random find from the region's pool (optionally only rare / not rare). */
  protected pickFind(filter?: (f: RegionFind) => boolean): RegionFind | null {
    const list = filter ? this.finds.filter(filter) : this.finds;
    return this.rng.weighted(list, (f) => f.weight) ?? null;
  }

  protected pickHazard(): RegionHazard | null {
    return this.rng.weighted(this.hazards, (h) => h.weight) ?? null;
  }

  private draw(): void {
    const g = this.g;
    const shx = this.shake > 0 ? Math.round((this.rng.next() - 0.5) * 4 * this.shake) : 0;
    const shy = this.shake > 0 ? Math.round((this.rng.next() - 0.5) * 3 * this.shake) : 0;
    g.save();
    g.translate(shx, shy);
    this.paint(g);
    // Collected icons fly to the basket (top-left).
    for (const f of this.flyers) {
      if (f.t < 0) continue;
      const k = f.t * f.t;
      const x = f.x + (10 - f.x) * k;
      const y = f.y + (8 - f.y) * k - Math.sin(f.t * Math.PI) * 18;
      this.drawIcon(f.id, x, y);
    }
    for (const w of this.words) {
      const a = w.t > 1 ? Math.max(0, 1 - (w.t - 1) / 0.3) : 1;
      g.globalAlpha = a;
      label(g, w.text, w.x, w.y, w.color, w.text.length > 2 ? 10 : 14);
      g.globalAlpha = 1;
    }
    if (this.combo >= 2) label(g, `×${this.combo}`, SCENE_W - 6, 10, this.combo >= 5 ? '#63c74d' : '#fee761', 10, 'right');
    // Pets along for the trip, bottom-right.
    let px = SCENE_W - 10;
    for (const p of this.pets) {
      this.drawPet(p, px, SCENE_H - 9);
      px -= 14;
    }
    if (this.stun > 0) {
      g.fillStyle = `rgba(228, 59, 68, ${0.18 * this.stun})`;
      g.fillRect(-4, -4, SCENE_W + 8, SCENE_H + 8);
    }
    g.restore();
  }

  /** Little pet heads in the corner. */
  private drawPet(p: PetId, x: number, y: number): void {
    const g = this.g;
    const bob = Math.round(Math.sin(this.time * 4 + x) * 1);
    y += bob;
    if (p === 'dog') {
      rect(g, x - 5, y - 4, 10, 8, '#eeeae0');
      rect(g, x - 6, y - 3, 2, 6, '#d8d0c0');
      rect(g, x + 4, y - 3, 2, 6, '#d8d0c0');
      rect(g, x - 3, y - 1, 1, 1, '#181425');
      rect(g, x + 2, y - 1, 1, 1, '#181425');
      rect(g, x - 1, y + 1, 2, 1, '#7a4a3a');
      rect(g, x - 4, y + 4, 8, 1, '#e43b44');
    } else if (p === 'cat') {
      rect(g, x - 5, y - 3, 10, 7, '#8c95a8');
      rect(g, x - 5, y - 6, 3, 3, '#8c95a8');
      rect(g, x + 2, y - 6, 3, 3, '#8c95a8');
      rect(g, x - 3, y - 1, 2, 2, '#ec8a2a');
      rect(g, x + 1, y - 1, 2, 2, '#ec8a2a');
      rect(g, x - 1, y + 2, 2, 1, '#5d6478');
    } else {
      rect(g, x - 5, y - 2, 10, 7, '#63c74d');
      rect(g, x - 3, y - 4, 6, 2, '#63c74d');
      rect(g, x - 3, y, 2, 2, '#181425');
      rect(g, x + 1, y, 2, 2, '#181425');
      rect(g, x - 2, y - 3, 2, 1, '#a8f080');
    }
  }
}
