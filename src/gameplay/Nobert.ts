// Nobert the dwarf: a very rare, very cheeky thief. Every now and then he
// sneaks in with an empty sack, heads for one kind of goods – every flask,
// every log, a whole ingredient's stock or all the potions on the shelf –
// stuffs it all in and runs for the door. Click him before he gets away and
// he drops the loot. The dog always barks when he comes in.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { GameSystem } from '../core/Game';
import { Entity, type HoverInfo } from '../world/Entity';
import { PixelSprite } from '../rendering/three/sprites/PixelSprite';
import { characterSheet } from '../rendering/three/sprites/CharacterPainter';
import { INGREDIENTS } from '../data/ingredients';
import { rng } from '../core/Random';
import { t, tr } from '../core/i18n';
import { FlaskItem } from './potion/FlaskItem';
import type { PotionResult } from './potion/PotionEvaluator';
import type { CharacterLook } from '../data/types';

/** Earliest day, chance per day and minimum days between two visits. */
export const NOBERT_MIN_DAY = 4;
export const NOBERT_CHANCE = 0.06;
export const NOBERT_COOLDOWN = 5;

const LOOK: CharacterLook = {
  skin: '#e0a080',
  hair: '#be4a2f',
  main: '#5a6988',
  second: '#3e2731',
  accent: '#feae34',
  eyes: '#3e2731',
  extra: ['dwarfhood', 'sack', 'bignose'],
};

export type LootKind = 'flasks' | 'logs' | 'potions' | `ingredient:${string}`;

interface Loot {
  kind: LootKind;
  count: number;
  potions: PotionResult[];
}

class NobertNPC extends Entity {
  readonly kind = 'nobert';
  readonly sprite: PixelSprite;
  private path: THREE.Vector3[] = [];
  private onArrive: (() => void) | null = null;
  speed = 1.35;
  caught = false;
  loot: Loot | null = null;
  private bubble = -1;

  constructor(
    start: THREE.Vector3,
    private readonly system: NobertSystem,
  ) {
    super();
    const sheet = characterSheet('nobert', 'dwarf', LOOK);
    this.sprite = new PixelSprite(sheet, 1.15 / (sheet.frameH / 40) / 0.97);
    this.object.add(this.sprite.root);
    this.object.position.copy(start);
    this.radius = 0.3;
  }

  override hover(): HoverInfo {
    return { title: t('nobert.name'), subtitle: t('nobert.title'), hint: this.caught ? undefined : t('nobert.hint') };
  }

  override cursor() {
    return 'point' as const;
  }

  override press(ctx: GameContext) {
    if (!this.caught) this.system.catchHim(ctx);
    return null;
  }

  walk(points: THREE.Vector3[], then?: () => void): void {
    this.path = points.map((p) => p.clone());
    this.onArrive = then ?? null;
  }

  say(ctx: GameContext, text: string, duration = 2.6): void {
    if (this.bubble >= 0) ctx.ui.removeBubble(this.bubble);
    this.bubble = ctx.ui.say(this.object, text, { name: t('nobert.name'), mood: 'angry', duration, offsetY: 1.35 });
    ctx.voice.babble(text, { pitch: 1.35, speed: 1.6, wave: 'square' }, this.object.position.x);
  }

  override update(ctx: GameContext, dt: number): void {
    if (this.path.length > 0) {
      const target = this.path[0];
      const p = this.object.position;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        p.x = target.x;
        p.z = target.z;
        this.path.shift();
        if (this.path.length === 0) {
          this.sprite.play('idle');
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        this.sprite.play('walk');
        if (Math.abs(dx) > 0.05) this.sprite.facing = dx > 0 ? 1 : -1;
        ctx.vfx.rate(`nstep${this.id}`, 5, dt, () => ctx.audio.play('footstep', { x: p.x, volume: 0.3, pitch: 1.5, minGap: 0.05 }));
      }
    }
    this.sprite.update(dt, ctx.renderer.rig.camera);
  }

  override dispose(ctx: GameContext): void {
    if (this.bubble >= 0) ctx.ui.removeBubble(this.bubble);
    this.sprite.dispose();
    super.dispose(ctx);
  }
}

export class NobertSystem implements GameSystem {
  npc: NobertNPC | null = null;
  /** Hour of today's visit (-1: none planned). */
  private visitHour = -1;
  private visitDay = -1;

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('day:start', ({ day }) => this.planDay(day));
  }

  /** Roll the dice for a visit today (called when a day starts). */
  planDay(day: number): void {
    const s = this.ctx.state;
    this.visitHour = -1;
    this.visitDay = day;
    const last = s.counters.nobertDay ?? -99;
    if (day < NOBERT_MIN_DAY || day - last < NOBERT_COOLDOWN) return;
    if (!rng.chance(NOBERT_CHANCE)) return;
    this.visitHour = rng.range(10, 19);
  }

  /** Make him come right now (admin menu). */
  summon(): boolean {
    if (this.npc) return false;
    return this.arrive();
  }

  get present(): boolean {
    return !!this.npc;
  }

  update(dt: number): void {
    void dt;
    const ctx = this.ctx;
    if (ctx.paused || this.npc) return;
    const s = ctx.state;
    if (this.visitHour >= 0 && this.visitDay === s.day && s.hour >= this.visitHour && s.shopOpen) {
      this.visitHour = -1;
      this.arrive();
    }
  }

  /** Everything he could steal right now, with where to go for it. */
  private targets(): Array<{ kind: LootKind; spot: THREE.Vector3 }> {
    const s = this.ctx.state;
    const shop = this.ctx.shop;
    const out: Array<{ kind: LootKind; spot: THREE.Vector3 }> = [];
    if (s.flasks > 0) out.push({ kind: 'flasks', spot: new THREE.Vector3(1.35, 0, -0.4) });
    if (s.logs > 0) out.push({ kind: 'logs', spot: new THREE.Vector3(-1.2, 0, -1.55) });
    if (shop.shelf.potions().length > 0) out.push({ kind: 'potions', spot: new THREE.Vector3(4.3, 0, 0.18) });
    for (const def of Object.values(INGREDIENTS)) {
      if (s.stockOf(def.id) <= 0) continue;
      const src = this.ctx.world.ofKind('source').find((e) => (e as unknown as { supplyId?: string }).supplyId === def.id);
      const x = src ? src.object.position.x : -3.5;
      out.push({ kind: `ingredient:${def.id}`, spot: new THREE.Vector3(x, 0, -2.5) });
    }
    return out;
  }

  private arrive(): boolean {
    const ctx = this.ctx;
    const options = this.targets();
    if (options.length === 0) return false;
    const goal = rng.pick(options);
    const a = ctx.shop.anchors;
    const npc = new NobertNPC(a.doorOutside, this);
    this.npc = ctx.world.add(npc, ctx);
    ctx.state.counters.nobertDay = ctx.state.day;
    ctx.shop.door.open(ctx, 2.2);
    ctx.audio.play('squeak', { x: a.doorInside.x, pitch: 0.7, volume: 0.5 });
    ctx.bus.emit('nobert:arrived', {});
    ctx.later(1.2, () => ctx.bus.emit('toast', { text: t('nobert.sneaks'), kind: 'warn' }));
    npc.walk([a.doorInside, goal.spot], () => this.steal(goal.kind));
    return true;
  }

  private lootName(kind: LootKind): string {
    if (kind === 'flasks') return t('nobert.flasks');
    if (kind === 'logs') return t('nobert.logs');
    if (kind === 'potions') return t('nobert.potions');
    return t('nobert.ingredient', { name: tr(INGREDIENTS[kind.slice('ingredient:'.length)]?.name ?? { en: kind, tr: kind }) });
  }

  private steal(kind: LootKind): void {
    const ctx = this.ctx;
    const npc = this.npc;
    if (!npc || npc.caught) return;
    const s = ctx.state;
    const loot: Loot = { kind, count: 0, potions: [] };
    if (kind === 'flasks') {
      loot.count = s.flasks;
      s.addStock('flask', -loot.count);
    } else if (kind === 'logs') {
      loot.count = s.logs;
      s.addStock('log', -loot.count);
    } else if (kind === 'potions') {
      for (const f of ctx.shop.shelf.potions()) {
        loot.potions.push(f.potion!);
        ctx.world.remove(f);
      }
      loot.count = loot.potions.length;
    } else {
      const id = kind.slice('ingredient:'.length);
      loot.count = s.stockOf(id);
      s.addStock(id, -loot.count);
    }
    npc.loot = loot;
    npc.sprite.play('happy');
    ctx.audio.play('whoosh', { x: npc.object.position.x });
    ctx.vfx.puff(npc.object.position.clone().setY(0.6), '#c0cbdc', 14);
    npc.say(ctx, t(`nobert.gloat${rng.int(1, 3)}`));
    ctx.bus.emit('toast', { text: t('nobert.stealing', { what: this.lootName(kind), n: loot.count }), kind: 'bad' });
    // …and off he runs.
    ctx.later(0.8, () => {
      if (!npc.alive || npc.caught) return;
      npc.speed = 2.9;
      const a = ctx.shop.anchors;
      npc.walk([a.doorInside, a.doorOutside], () => this.escape());
      ctx.later(0.6, () => ctx.shop.door.open(ctx, 2));
    });
  }

  private escape(): void {
    const ctx = this.ctx;
    const npc = this.npc;
    if (!npc) return;
    if (npc.loot && npc.loot.count > 0) {
      ctx.state.count('nobertRobbed');
      ctx.bus.emit('toast', { text: t('nobert.escaped', { what: this.lootName(npc.loot.kind) }), kind: 'bad' });
      ctx.bus.emit('mentor:say', { text: t('mentor.nobert'), priority: 3, mood: 'angry' });
      ctx.bus.emit('save:request', {});
    }
    ctx.world.remove(npc);
    this.npc = null;
  }

  /** Clicked in time: he drops everything and scampers off. */
  catchHim(ctx: GameContext): void {
    const npc = this.npc;
    if (!npc || npc.caught) return;
    npc.caught = true;
    npc.sprite.play('surprised');
    ctx.audio.play('squeak', { x: npc.object.position.x, pitch: 1.8 });
    ctx.vfx.stars(npc.object.position.clone().setY(1.1), '#fee761', 16);
    const loot = npc.loot;
    npc.loot = null;
    if (loot && loot.count > 0) {
      this.giveBack(loot);
      ctx.bus.emit('toast', { text: t('nobert.caught', { what: this.lootName(loot.kind) }), kind: 'good' });
    } else ctx.bus.emit('toast', { text: t('nobert.caughtEarly'), kind: 'good' });
    ctx.state.count('nobertCaught');
    npc.say(ctx, t('nobert.caughtLine'));
    npc.speed = 3.2;
    const a = ctx.shop.anchors;
    ctx.later(0.7, () => {
      if (!npc.alive) return;
      npc.walk([a.doorInside, a.doorOutside], () => {
        ctx.world.remove(npc);
        if (this.npc === npc) this.npc = null;
      });
      ctx.later(0.5, () => ctx.shop.door.open(ctx, 2));
    });
    ctx.bus.emit('save:request', {});
  }

  private giveBack(loot: Loot): void {
    const ctx = this.ctx;
    const s = ctx.state;
    if (loot.kind === 'flasks') s.addStock('flask', loot.count);
    else if (loot.kind === 'logs') s.addStock('log', loot.count);
    else if (loot.kind === 'potions') {
      const shelf = ctx.shop.shelf;
      loot.potions.forEach((potion, i) => {
        const slot = shelf.slots[i % shelf.slots.length];
        const f = ctx.world.add(new FlaskItem(ctx, slot.clone().add(new THREE.Vector3(0, 0.1, 0)), potion), ctx);
        if (!shelf.tryStore(ctx, f)) f.object.position.y += 0.05;
      });
    } else s.addStock(loot.kind.slice('ingredient:'.length), loot.count);
  }

  /** Remove him at once (new day, loading). */
  dismiss(): void {
    if (this.npc) this.ctx.world.remove(this.npc);
    this.npc = null;
  }
}
