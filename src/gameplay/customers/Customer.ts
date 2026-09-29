// A customer walking around the shop. Driven by a small state machine:
// enter → queue → order at the counter → wait → take potion → drink →
// react (via drink effects) → pay → leave. Customers have kinematic
// capsules so thrown objects bounce off them (and annoy them).

import * as THREE from 'three';
import { Entity, type HoverInfo } from '../../world/Entity';
import type { GameContext } from '../../core/GameContext';
import type { CustomerDef, CustomerRequest } from '../../data/types';
import { characterSheet } from '../../rendering/three/sprites/CharacterPainter';
import { PixelSprite } from '../../rendering/three/sprites/PixelSprite';
import { CG, type BodyHandle } from '../../physics/PhysicsTypes';
import { pickLine, t, tr } from '../../core/i18n';
import { rng } from '../../core/Random';
import type { PotionResult } from '../potion/PotionEvaluator';
import type { Judgement } from './Economy';
import type { DrinkEffect } from './DrinkEffects';

export type CustomerPhase =
  | 'entering'
  | 'browsing'
  | 'toSpot'
  | 'queued'
  | 'ordering'
  | 'waiting'
  | 'drinking'
  | 'reacting'
  | 'paying'
  | 'leaving'
  | 'gone'
  | 'transformed';

let nextUid = 1;

export class Customer extends Entity {
  readonly kind = 'customer';
  readonly uid = nextUid++;
  readonly def: CustomerDef;
  readonly sprite: PixelSprite;
  request: CustomerRequest;
  /** Quest this visit is about (intro or delivery). */
  quest: { id: string; mode: 'intro' | 'deliver' } | null = null;
  phase: CustomerPhase = 'entering';
  private path: THREE.Vector3[] = [];
  private onArrive: (() => void) | null = null;
  speed = 1.25;
  patience: number;
  readonly patienceMax: number;
  waited = 0;
  /** Assigned standing spot (counter or queue). */
  spot: THREE.Vector3 | null = null;
  atCounter = false;
  potion: PotionResult | null = null;
  judgement: Judgement | null = null;
  effect: DrinkEffect | null = null;
  private bubble = -1;
  private chatter = rng.range(12, 22);
  private stateTimer = 0;
  private lastHit = -10;
  private readonly kin: BodyHandle;
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();
  impatientSaid = false;
  /** Tutorial customers wait forever. */
  infinitePatience = false;
  /** Temporary sprite scale (giant effect). */
  scaleMul = 1;
  private lookT = 0;
  private lookFlip = 0;

  constructor(ctx: GameContext, def: CustomerDef, request: CustomerRequest, start: THREE.Vector3) {
    super();
    this.def = def;
    this.request = request;
    this.patience = def.patience;
    this.patienceMax = def.patience;
    const sheet = characterSheet(def.id, def.archetype, def.look);
    const heightPx = sheet.frameH;
    const scale = def.height / (heightPx / 40) / 0.97;
    this.sprite = new PixelSprite(sheet, scale);
    this.object.add(this.sprite.root);
    this.object.position.copy(start);
    this.radius = 0.3;
    this.kin = ctx.physics.createBody({
      shape: { type: 'capsule', radius: 0.22 * Math.max(0.6, def.height / 1.75), height: def.height * 0.6, offset: { x: 0, y: def.height * 0.5, z: 0 } },
      motion: 'kinematic',
      position: start,
      group: CG.CHARACTER,
      mask: CG.ITEM,
      collisionEvents: true,
    });
    ctx.world.bindBody(this, this.kin, ctx);
    ctx.sync.unlink(this.kin);
  }

  get name(): string {
    return tr(this.def.name);
  }

  get headPos(): THREE.Vector3 {
    return this.object.position.clone().add(new THREE.Vector3(0, this.def.height * this.scaleMul, 0));
  }

  override hover(ctx: GameContext): HoverInfo {
    const lines: HoverInfo['lines'] = [];
    if (this.phase === 'waiting' || this.phase === 'ordering') {
      lines.push({ text: tr(this.request.line), color: '#ead4aa' });
      if (!this.infinitePatience) lines.push({ text: t('hud.waiting', { name: this.name }), color: '#8b9bb4', bar: this.patience / this.patienceMax });
    }
    void ctx;
    return { title: `${this.name}`, subtitle: tr(this.def.title), lines, hint: this.phase === 'waiting' ? t('hint.potion') : undefined };
  }

  override cursor() {
    return 'point' as const;
  }

  // -------------------------------------------------------------------------
  // Movement & speech
  // -------------------------------------------------------------------------

  walk(points: THREE.Vector3[], then?: () => void): void {
    this.path = points.map((p) => p.clone());
    this.onArrive = then ?? null;
  }

  get walking(): boolean {
    return this.path.length > 0;
  }

  /** Stand and look around the shop for a while (turning now and then). */
  lookAround(seconds: number): void {
    this.lookT = seconds;
    this.lookFlip = 0.6;
  }

  get lookingAround(): boolean {
    return this.lookT > 0;
  }

  say(ctx: GameContext, text: string, mood: 'neutral' | 'happy' | 'angry' | 'worried' = 'neutral', duration?: number): void {
    if (!text) return;
    if (this.bubble >= 0) ctx.ui.removeBubble(this.bubble);
    this.bubble = ctx.ui.say(this.object, text, { name: this.name, mood, duration, offsetY: this.def.height * this.scaleMul + 0.25 });
    ctx.voice.babble(text, this.def.voice, this.object.position.x);
    if (mood === 'neutral' && this.phase !== 'walking' as CustomerPhase) this.sprite.play('talk');
    this.stateTimer = Math.min(this.stateTimer, 0);
  }

  line(ctx: GameContext, key: keyof CustomerDef['lines'], mood: 'neutral' | 'happy' | 'angry' | 'worried' = 'neutral'): void {
    this.say(ctx, pickLine(this.def.lines[key]), mood);
  }

  clearBubble(ctx: GameContext): void {
    if (this.bubble >= 0) ctx.ui.removeBubble(this.bubble);
    this.bubble = -1;
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  override update(ctx: GameContext, dt: number): void {
    this.stateTimer += dt;
    // Walking
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
        // footsteps
        ctx.vfx.rate(`steps${this.uid}`, 3.5, dt, () => ctx.audio.play('footstep', { x: p.x, volume: 0.5, pitch: 0.8 + this.def.height * 0.1, minGap: 0.05 }));
      }
    }

    if (this.lookT > 0) {
      this.lookT -= dt;
      this.lookFlip -= dt;
      if (this.lookFlip <= 0) {
        this.lookFlip = rng.range(0.7, 1.4);
        this.sprite.facing = -this.sprite.facing as 1 | -1;
      }
    }

    if (this.phase === 'waiting' && !this.infinitePatience) {
      this.waited += dt;
      this.patience -= dt;
      this.chatter -= dt;
      if (this.chatter <= 0) {
        this.chatter = rng.range(16, 28);
        if (rng.chance(0.5)) this.line(ctx, 'wait');
      }
      if (!this.impatientSaid && this.patience < this.patienceMax * 0.3) {
        this.impatientSaid = true;
        this.line(ctx, 'impatient', 'worried');
      }
    }

    if (this.sprite.current === 'talk' && this.stateTimer > 2.2 && !this.walking && this.phase !== 'drinking' && this.phase !== 'reacting') this.sprite.play('idle');

    this.effect?.update(ctx, this, dt);

    this.sprite.root.scale.setScalar(this.scaleMul);
    this.sprite.update(dt, ctx.renderer.rig.camera);
  }

  override fixedUpdate(): void {
    // Kinematic targets are consumed by the very next physics step, so they
    // must be set every step (not every frame) or the capsule overshoots
    // and keeps sliding. Big jumps teleport instead of sweeping the room.
    this.tmpQ.identity();
    const b = this.kin.getPosition(this.tmpP);
    if (b.distanceToSquared(this.object.position) > 0.5 * 0.5) this.kin.teleport(this.object.position, this.tmpQ);
    else this.kin.setKinematicTarget(this.object.position, this.tmpQ);
  }

  override onImpact(ctx: GameContext, other: Entity | null, impulse: number): void {
    if (!other || impulse < 0.25 || ctx.time - this.lastHit < 2.5) return;
    if (this.phase === 'gone' || this.phase === 'transformed') return;
    this.lastHit = ctx.time;
    this.line(ctx, 'hit', 'angry');
    ctx.audio.play('angry', { x: this.object.position.x, volume: 0.6 });
    this.patience -= 10;
    if (this.sprite.current !== 'walk') {
      this.sprite.play('surprised');
      this.stateTimer = 0;
    }
  }

  override dispose(ctx: GameContext): void {
    this.clearBubble(ctx);
    this.sprite.dispose();
    super.dispose(ctx);
  }
}
