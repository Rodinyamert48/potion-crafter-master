// The King: now and then His Majesty drops by with a fanfare, plants himself
// in the middle of the shop and asks one thing only – "What do you have for
// me?" Say "Something" and hand over a dragon egg (found, very rarely, in
// Dragon Valley) for a royal reward; say "Nothing" and he simply leaves.
// Claiming to have something when you do not is a bad idea.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { GameSystem } from '../core/Game';
import { Entity, type HoverInfo } from '../world/Entity';
import { PixelSprite } from '../rendering/three/sprites/PixelSprite';
import { characterSheet, type SpriteSheet } from '../rendering/three/sprites/CharacterPainter';
import { rng } from '../core/Random';
import { t } from '../core/i18n';
import type { CharacterLook } from '../data/types';
import { DRAGON_EGG } from './WorldEvents';

/** Regular visits on day 4, 8, 12… – and the day after a dragon egg turns up. */
export const KING_INTERVAL = 4;
export const KING_HOURS: [number, number] = [10.5, 15.5];
/** He does not come in after this hour. */
export const KING_LATEST = 20;
export const KING_REWARD = { gold: 300, reputation: 12 };
/** Reputation lost for claiming to have something when you have nothing. */
export const KING_LIE_PENALTY = 3;
/** Real seconds he waits for an answer before leaving in a huff. */
const PATIENCE = 75;
/** Where he stands: in the middle of the room, facing the counter. */
const SPOT = new THREE.Vector3(2.45, 0, -0.35);

export function isKingDay(day: number): boolean {
  return day >= KING_INTERVAL && day % KING_INTERVAL === 0;
}

const LOOK: CharacterLook = {
  skin: '#e8b796',
  hair: '#c0cbdc',
  main: '#3b5dc9',
  second: '#262b44',
  accent: '#feae34',
  eyes: '#3e2731',
  extra: ['crown', 'royalcape', 'beard', 'scepter'],
};

export function kingSheet(): SpriteSheet {
  return characterSheet('king', 'villager', LOOK);
}

export type KingAnswer = 'egg' | 'liar' | 'nothing';

class KingNPC extends Entity {
  readonly kind = 'king';
  readonly sprite: PixelSprite;
  private path: THREE.Vector3[] = [];
  private onArrive: (() => void) | null = null;
  private bubble = -1;
  /** Standing in the shop, waiting for an answer. */
  waiting = false;
  leaving = false;

  constructor(
    start: THREE.Vector3,
    private readonly system: KingSystem,
  ) {
    super();
    const sheet = kingSheet();
    this.sprite = new PixelSprite(sheet, 1.85 / (sheet.frameH / 40) / 0.97);
    this.object.add(this.sprite.root);
    this.object.position.copy(start);
    this.radius = 0.38;
  }

  override hover(): HoverInfo {
    return { title: t('king.name'), subtitle: t('king.title'), hint: this.waiting ? t('king.hint') : undefined };
  }

  override cursor() {
    return 'point' as const;
  }

  override press(ctx: GameContext) {
    void ctx;
    if (this.waiting) this.system.ask();
    return null;
  }

  walk(points: THREE.Vector3[], then?: () => void): void {
    this.path = points.map((p) => p.clone());
    this.onArrive = then ?? null;
  }

  say(ctx: GameContext, text: string, duration = 3.5): void {
    if (this.bubble >= 0) ctx.ui.removeBubble(this.bubble);
    this.bubble = ctx.ui.say(this.object, text, { name: t('king.name'), duration, offsetY: 2.2 });
    ctx.voice.babble(text, { pitch: 0.62, speed: 0.9, wave: 'sawtooth' }, this.object.position.x);
  }

  hush(ctx: GameContext): void {
    if (this.bubble >= 0) ctx.ui.removeBubble(this.bubble);
    this.bubble = -1;
  }

  override update(ctx: GameContext, dt: number): void {
    if (this.path.length > 0) {
      const target = this.path[0];
      const p = this.object.position;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = (this.leaving ? 1.3 : 0.95) * dt;
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
        ctx.vfx.rate(`kstep${this.id}`, 2.6, dt, () => ctx.audio.play('footstep', { x: p.x, volume: 0.55, pitch: 0.7, minGap: 0.05 }));
      }
    }
    this.sprite.update(dt, ctx.renderer.rig.camera);
  }

  override dispose(ctx: GameContext): void {
    this.hush(ctx);
    this.sprite.dispose();
    super.dispose(ctx);
  }
}

export class KingSystem implements GameSystem {
  npc: KingNPC | null = null;
  /** Hour of today's visit (-1: none planned). */
  private visitHour = -1;
  private visitDay = -1;
  private waited = 0;
  /** Open the question as soon as nothing else is in the way. */
  private askPending = false;

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('day:start', ({ day }) => this.planDay(day));
    ctx.bus.on('item:found', ({ id }) => {
      // Word travels fast: the King will come for it tomorrow.
      if (id === DRAGON_EGG) ctx.state.counters.kingDue = ctx.state.day + 1;
    });
  }

  /** Is a visit owed because an egg was found? */
  private owed(day: number): boolean {
    const c = this.ctx.state.counters;
    const due = c.kingDue ?? 0;
    return due > 0 && day >= due && (c.kingLast ?? -1) < due;
  }

  /** Decide whether he comes today (new day, or when a game is resumed). */
  planDay(day: number): void {
    this.visitDay = day;
    this.visitHour = -1;
    if ((this.ctx.state.counters.kingLast ?? -1) === day) return;
    if (isKingDay(day) || this.owed(day)) this.visitHour = rng.range(KING_HOURS[0], KING_HOURS[1]);
  }

  get present(): boolean {
    return !!this.npc;
  }

  /** Make him come right now (admin menu). */
  summon(): boolean {
    if (this.npc) return false;
    this.arrive();
    return true;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (ctx.paused || ctx.mode !== 'shop') return;
    const s = ctx.state;
    const npc = this.npc;
    if (!npc) {
      if (this.visitHour >= 0 && this.visitDay === s.day && s.hour >= this.visitHour && s.hour < KING_LATEST && s.shopOpen) {
        this.visitHour = -1;
        this.arrive();
      }
      return;
    }
    if (!npc.waiting) return;
    if (this.askPending && !ctx.interaction.grab) {
      this.ask();
      return;
    }
    // He does not wait for ever.
    this.waited += dt;
    if (this.waited > PATIENCE) {
      npc.waiting = false;
      npc.say(ctx, t('king.impatient'), 3);
      ctx.later(1.4, () => this.leave());
    }
  }

  private arrive(): void {
    const ctx = this.ctx;
    const a = ctx.shop.anchors;
    const npc = new KingNPC(a.doorOutside, this);
    this.npc = ctx.world.add(npc, ctx);
    ctx.state.counters.kingLast = ctx.state.day;
    ctx.state.count('kingVisits');
    this.waited = 0;
    this.askPending = false;
    ctx.shop.door.open(ctx, 3);
    ctx.audio.play('fanfare', { x: a.doorInside.x });
    ctx.bus.emit('king:arrived', {});
    ctx.bus.emit('toast', { text: t('king.arrives'), kind: 'quest' });
    ctx.bus.emit('mentor:say', { text: t('mentor.king'), priority: 3, mood: 'worried' });
    npc.walk([a.doorInside, SPOT], () => {
      npc.sprite.facing = -1;
      npc.waiting = true;
      npc.say(ctx, t('king.ask'), 600);
      this.askPending = true;
    });
  }

  /** Show the question (arriving, or clicking him). */
  ask(): void {
    const npc = this.npc;
    if (!npc || !npc.waiting) return;
    this.askPending = false;
    this.ctx.ui.openPanel('king');
  }

  /** The apprentice's answer: "Something" (gift) or "Nothing". */
  answer(gift: boolean): KingAnswer | null {
    const ctx = this.ctx;
    const s = ctx.state;
    const npc = this.npc;
    if (!npc || !npc.waiting) return null;
    npc.waiting = false;
    this.askPending = false;
    const hadEgg = s.hasItem(DRAGON_EGG);
    ctx.bus.emit('king:answered', { gift, hadEgg });
    if (gift && hadEgg) {
      s.addItem(DRAGON_EGG, -1);
      s.addMoney(KING_REWARD.gold);
      s.addReputation(KING_REWARD.reputation);
      s.count('royalGifts');
      ctx.audio.play('fanfare', { x: npc.object.position.x });
      ctx.audio.play('coins', { amount: 12, delay: 0.3 });
      ctx.vfx.stars(npc.object.position.clone().setY(1.9), '#fee761', 26);
      npc.sprite.play('happy');
      npc.say(ctx, t('king.thanks'), 5);
      ctx.bus.emit('toast', { text: t('king.rewarded', { g: KING_REWARD.gold, r: KING_REWARD.reputation }), kind: 'quest' });
      ctx.bus.emit('save:request', {});
      ctx.later(3.2, () => this.leave());
      return 'egg';
    }
    if (gift) {
      s.addReputation(-KING_LIE_PENALTY);
      ctx.audio.play('angry', { x: npc.object.position.x, pitch: 0.6 });
      npc.sprite.play('angry');
      npc.say(ctx, t('king.liar'), 4);
      ctx.bus.emit('toast', { text: t('king.liarToast', { r: KING_LIE_PENALTY }), kind: 'bad' });
      ctx.bus.emit('save:request', {});
      ctx.later(1.8, () => this.leave());
      return 'liar';
    }
    npc.say(ctx, t('king.bye'), 3);
    ctx.later(1.1, () => this.leave());
    return 'nothing';
  }

  private leave(): void {
    const ctx = this.ctx;
    const npc = this.npc;
    if (!npc || npc.leaving) return;
    npc.leaving = true;
    npc.waiting = false;
    if (ctx.ui.isPanelOpen('king')) ctx.ui.openPanel(null);
    const a = ctx.shop.anchors;
    npc.walk([a.doorInside, a.doorOutside], () => {
      ctx.world.remove(npc);
      if (this.npc === npc) this.npc = null;
    });
    ctx.later(1.2, () => ctx.shop.door.open(ctx, 2.2));
  }

  /** Remove him at once (new day, loading). */
  dismiss(): void {
    if (this.npc) this.ctx.world.remove(this.npc);
    this.npc = null;
    this.askPending = false;
    if (this.ctx.ui.isPanelOpen('king')) this.ctx.ui.openPanel(null);
  }
}
