// Glass flasks. Empty flasks are dipped into the cauldron to bottle the
// brew; filled flasks carry a PotionResult, slosh (liquid stays level while
// tilting), can be poured out, stored on the shelf, served — or broken.

import * as THREE from 'three';
import { Entity, type HoverInfo, type SavedEntity } from '../../world/Entity';
import type { GameContext } from '../../core/GameContext';
import type { PhysicsGrab } from '../../world/Interaction';
import type { PotionResult } from './PotionEvaluator';
import { flaskModel, type FlaskParts } from '../../rendering/three/models/toolModels';
import { CG, type Vec3Like } from '../../physics/PhysicsTypes';
import { RECIPE_MAP, TIER_NAMES } from '../../data/potions';
import { t, tr } from '../../core/i18n';
import { clamp } from '../../core/math';
import { rng } from '../../core/Random';
import { toon } from '../../rendering/three/materials';
import { isTouchUI } from '../../ui/TouchControls';

const tmpV = new THREE.Vector3();

export function stars(tier: number): string {
  return '★'.repeat(tier) + '☆'.repeat(Math.max(0, 4 - tier));
}

export class FlaskItem extends Entity {
  readonly kind = 'flask';
  potion: PotionResult | null;
  private parts!: FlaskParts;
  private dipTime = 0;
  private readonly vel = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private readonly slosh = new THREE.Vector2();
  private readonly sloshVel = new THREE.Vector2();
  private time = 0;
  private fill = 1;
  /** Shelf slot index when stored. */
  slot = -1;
  /** Reserved by a customer who is taking it. */
  claimed = false;

  constructor(ctx: GameContext, pos: Vec3Like, potion: PotionResult | null = null) {
    super();
    this.potion = potion;
    this.draggable = true;
    this.upright = true;
    this.tiltable = true;
    this.ghostWhenHeld = true;
    this.buildVisual();
    this.body = ctx.physics.createBody({
      shape: { type: 'cylinder', radius: 0.055, height: this.parts.height },
      motion: 'dynamic',
      mass: 0.25,
      position: pos,
      friction: 0.6,
      restitution: 0.2,
      angularDamping: 0.4,
      collisionEvents: true,
      group: CG.ITEM,
    });
    this.prevPos.set(pos.x, pos.y, pos.z);
  }

  get recipe() {
    return this.potion ? RECIPE_MAP[this.potion.recipeId] : null;
  }

  private buildVisual(): void {
    this.object.clear();
    const shape = this.recipe?.bottle ?? 'round';
    this.parts = flaskModel(shape, this.potion ? { color: this.potion.color, color2: this.potion.color2 } : undefined);
    this.object.add(this.parts.group);
    this.halfHeight = this.parts.height / 2;
    this.radius = this.parts.radius;
    if (this.potion && this.potion.tier >= 3) {
      // A little brass ring marks strong potions.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 3, 8), toon({ color: '#feae34', emissive: '#feae34', emissiveIntensity: 0.4 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = this.parts.height / 2 - 0.035;
      this.object.add(ring);
    }
  }

  setPotion(ctx: GameContext, potion: PotionResult | null): void {
    this.potion = potion;
    this.fill = 1;
    this.buildVisual();
    void ctx;
  }

  override hover(ctx: GameContext): HoverInfo {
    if (!this.potion) return { title: t('obj.flask'), hint: t('hint.flask') };
    const r = RECIPE_MAP[this.potion.recipeId];
    const known = !!ctx.state.discovered[r.id];
    return {
      title: `${tr(r.name)} ${stars(this.potion.tier)}`,
      subtitle: `${tr(TIER_NAMES[this.potion.tier])} · ${this.potion.price} ${t('hud.money')}`,
      hint: r.kind === 'failure' ? t(isTouchUI() ? 'hint.pourTouch' : 'hint.pour') : t('hint.potion'),
      lines: known ? [{ text: tr(r.description), color: '#ead4aa' }] : [],
    };
  }

  /** Automatic dip: bring an empty flask near the brew and it dips itself,
   *  fills and comes back up. */
  private autoDip: { phase: 'over' | 'down' | 'up'; t: number } | null = null;
  private dipCooldown = 0;

  private runAutoDip(ctx: GameContext, grab: PhysicsGrab, dt: number): boolean {
    const cauldron = ctx.shop.cauldron;
    const c = cauldron.center;
    const p = this.object.position;
    this.dipCooldown = Math.max(0, this.dipCooldown - dt);
    if (!this.autoDip) {
      const near = Math.hypot(grab.target.x - c.x, grab.target.z - c.z) < 0.85 || Math.hypot(p.x - c.x, p.z - c.z) < 0.75;
      if (this.potion || cauldron.chem.water <= 0.3 || !near || this.dipCooldown > 0) return false;
      this.autoDip = { phase: 'over', t: 0 };
      ctx.audio.play('whoosh', { x: p.x, pitch: 1.4, volume: 0.5 });
    }
    const dip = this.autoDip;
    dip.t += dt;
    grab.heightOffset = 0;
    grab.stiffness = 1.3;
    const over = new THREE.Vector3(c.x, cauldron.rimY + 0.32 + this.halfHeight, c.z);
    if (dip.phase === 'over') {
      grab.overrideTarget = over;
      if (p.distanceTo(over) < 0.1 || dip.t > 1.1) {
        dip.phase = 'down';
        dip.t = 0;
      }
    } else if (dip.phase === 'down') {
      const y = Math.min(cauldron.level + this.halfHeight * 0.25, cauldron.rimY - 0.03);
      grab.overrideTarget = new THREE.Vector3(c.x + 0.04, y, c.z + 0.04);
      if (cauldron.isInside(p, 0.05) && p.y - this.halfHeight < cauldron.level) {
        if (this.dipTime === 0) ctx.audio.play('plop', { x: p.x });
        this.dipTime += dt;
        if (rng.chance(dt * 18)) ctx.vfx.bubble(new THREE.Vector3(p.x, cauldron.level, p.z), 0.06, cauldron.color, true);
        if (this.dipTime > 0.55) this.fillFromCauldron(ctx);
      }
      if (this.potion || dip.t > 3 || cauldron.chem.water <= 0.3) {
        dip.phase = 'up';
        dip.t = 0;
      }
    } else {
      grab.overrideTarget = over.clone().setY(over.y + 0.12);
      if (p.distanceTo(grab.overrideTarget) < 0.12 || dip.t > 0.8) this.endAutoDip(grab);
    }
    return true;
  }

  private endAutoDip(grab: PhysicsGrab | null): void {
    if (grab) {
      grab.overrideTarget = null;
      grab.stiffness = 1;
    }
    this.autoDip = null;
    this.dipCooldown = 1.2;
    this.dipTime = 0;
  }

  override onHeld(ctx: GameContext, dt: number): void {
    const grab = ctx.interaction.grab as PhysicsGrab | null;
    if (!grab) return;
    const cauldron = ctx.shop.cauldron;
    if (this.runAutoDip(ctx, grab, dt)) return;
    if (!this.potion && grab.surfaceTag === 'cauldron' && cauldron.chem.water > 0.3) {
      // Lower the flask into the brew.
      // Hover height over the opening minus where the flask should sit: its
      // centre just above the surface, the lower half submerged.
      const dip = cauldron.rimY + grab.hoverHeight + 0.16 + this.halfHeight - (cauldron.level + this.halfHeight * 0.4);
      const p = this.object.position;
      // Only sink once it is over the opening, so it never snags the rim.
      const dx = p.x - cauldron.center.x;
      const dz = p.z - cauldron.center.z;
      const r = cauldron.innerRadiusAt(cauldron.rimY) - this.radius - 0.04;
      grab.heightOffset = dx * dx + dz * dz < r * r ? -dip : 0;
      if (cauldron.isInside(p, 0.05) && p.y - this.halfHeight < cauldron.level) {
        this.dipTime += dt;
        if (rng.chance(dt * 18)) ctx.vfx.bubble(new THREE.Vector3(p.x, cauldron.level, p.z), 0.06, cauldron.color, true);
        if (this.dipTime > 0.55) this.fillFromCauldron(ctx);
      } else this.dipTime = Math.max(0, this.dipTime - dt);
    } else {
      grab.heightOffset = 0;
      this.dipTime = 0;
    }
    // Pour out a filled flask by tilting it.
    if (this.potion && grab.tilt > 0.7) {
      this.fill -= dt * 0.8;
      const mouth = this.object.localToWorld(new THREE.Vector3(0, this.halfHeight, 0));
      ctx.vfx.rate(`flaskPour${this.id}`, 40, dt, () => ctx.vfx.drip(mouth, this.potion!.color, { x: 0, y: -0.2, z: 0 }));
      if (this.fill <= 0) {
        ctx.bus.emit('toast', { text: `${tr(RECIPE_MAP[this.potion.recipeId].name)} ✗`, kind: 'info' });
        this.setPotion(ctx, null);
        ctx.audio.play('splash', { x: mouth.x, amount: 0.5 });
      }
    }
  }

  private fillFromCauldron(ctx: GameContext): void {
    const cauldron = ctx.shop.cauldron;
    const result = cauldron.fill(ctx);
    this.dipTime = 0;
    if (!result) return;
    this.setPotion(ctx, result);
    const p = this.object.position.clone();
    ctx.audio.play('fill', { x: p.x });
    ctx.audio.play('corkPop', { x: p.x, delay: 0.55 });
    ctx.vfx.magic(p, result.color, 12);
    const discovered = !ctx.state.discovered[result.recipeId];
    ctx.bus.emit('potion:bottled', { result, discovered, entityId: this.id });
  }

  override onReleased(ctx: GameContext): void {
    if (this.autoDip) this.endAutoDip(null);
    if (this.potion && ctx.shop.shelf.tryStore(ctx, this)) return;
    if (!this.potion) ctx.shop.sources.get('flask')?.tryReturn(ctx, this);
  }

  override onPicked(ctx: GameContext): void {
    ctx.shop.shelf.release(this);
    this.claimed = false;
  }

  override onImpact(ctx: GameContext, _other: Entity | null, impulse: number, point: Vec3Like): void {
    if (this.held) return;
    const dv = impulse / 0.25;
    if (dv > 4.6) {
      this.shatter(ctx, point);
      return;
    }
    if (dv > 0.8) ctx.audio.play('glassClink', { x: point.x, volume: clamp(dv / 4, 0.2, 1), pitch: 0.9 + rng.next() * 0.3 });
  }

  shatter(ctx: GameContext, point: Vec3Like): void {
    if (!this.alive) return;
    const p = new THREE.Vector3(point.x, Math.max(0.05, point.y), point.z);
    ctx.audio.play('glassBreak', { x: p.x });
    ctx.vfx.chips(p, '#d8f0ff', 18, 0.9);
    ctx.debris.glass(p, 7);
    if (this.potion) {
      const r = RECIPE_MAP[this.potion.recipeId];
      ctx.vfx.splash(p, this.potion.color, 20, 1.1);
      switch (r.drink) {
        case 'poison':
          ctx.vfx.poisonCloud(p, 1.5);
          break;
        case 'firebreath':
        case 'fireheal':
          ctx.vfx.flare(p, '#f77622', 0.8);
          break;
        case 'frog':
          ctx.vfx.puff(p, '#63c74d', 20);
          ctx.audio.play('frogCroak', { x: p.x });
          break;
        case 'explode':
          ctx.vfx.explosion(p, 0.5, '#ff0044');
          ctx.physics.explode(p, 1.5, 0.6);
          ctx.audio.play('explosion', { x: p.x, volume: 0.5 });
          break;
        case 'shadow':
          ctx.vfx.smoke(p, '#262b44', 10, 1.2);
          break;
        default:
          ctx.vfx.magic(p, this.potion.color, 12);
      }
      ctx.bus.emit('potion:broken', { recipeId: r.id });
    }
    ctx.world.remove(this);
  }

  override dispose(ctx: GameContext): void {
    ctx.shop.shelf.release(this);
    super.dispose(ctx);
  }

  override update(ctx: GameContext, dt: number): void {
    this.time += dt;
    if (this.object.position.y < -2) ctx.world.remove(this);
    const mat = this.parts.liquidMat;
    if (!mat) return;
    // Slosh: a damped spring driven by horizontal acceleration.
    const p = this.object.position;
    tmpV.subVectors(p, this.prevPos).divideScalar(Math.max(1e-3, dt));
    const ax = (tmpV.x - this.vel.x) / Math.max(1e-3, dt);
    const az = (tmpV.z - this.vel.z) / Math.max(1e-3, dt);
    this.vel.copy(tmpV);
    this.prevPos.copy(p);
    this.sloshVel.x += (-this.slosh.x * 60 - this.sloshVel.x * 5 - ax * 0.004) * dt;
    this.sloshVel.y += (-this.slosh.y * 60 - this.sloshVel.y * 5 - az * 0.004) * dt;
    this.slosh.x = clamp(this.slosh.x + this.sloshVel.x * dt, -0.6, 0.6);
    this.slosh.y = clamp(this.slosh.y + this.sloshVel.y * dt, -0.6, 0.6);
    // Liquid level in world space: bottle centre + fill height, lowered as the bottle tilts.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.object.quaternion);
    const tiltCos = clamp(up.y, 0.05, 1);
    const level = p.y + this.parts.fullLevel * this.fill * tiltCos - (1 - tiltCos) * this.halfHeight * 0.4;
    mat.uniforms.uCenter.value.copy(p);
    mat.uniforms.uLevel.value = level;
    (mat.uniforms.uTilt.value as THREE.Vector2).set(this.slosh.x, this.slosh.y);
    mat.uniforms.uTime.value = this.time;
    mat.uniforms.uGlow.value = 0.35 + (this.potion?.tier ?? 1) * 0.12;
  }

  override serialize(): SavedEntity {
    const p = this.object.position;
    return { type: 'flask', p: [p.x, p.y, p.z], potion: this.potion, slot: this.slot };
  }

  override netState(): unknown {
    return { p: this.potion, s: this.slot, c: this.claimed ? 1 : 0, h: this.held ? 1 : 0, f: Math.round(this.fill * 100) / 100 };
  }

  override applyNetState(ctx: GameContext, s: unknown): void {
    const n = s as { p: PotionResult | null; s: number; c: number; h: number; f: number };
    const was = this.potion ? `${this.potion.recipeId}:${this.potion.tier}:${this.potion.color}` : '';
    const now = n.p ? `${n.p.recipeId}:${n.p.tier}:${n.p.color}` : '';
    if (was !== now) this.setPotion(ctx, n.p);
    this.fill = n.f;
    this.claimed = !!n.c;
    this.held = !!n.h;
    // Keep the guest's shelf in step (the merchant buys from it).
    if (n.s !== this.slot) {
      ctx.shop.shelf.release(this);
      if (n.s >= 0) ctx.shop.shelf.assign(this, n.s);
    }
  }
}
