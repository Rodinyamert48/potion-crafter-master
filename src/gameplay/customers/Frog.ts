// A customer turned into a frog. It's a real Havok body that hops around the
// shop (knocking things over), tries to dodge the player's hand, wiggles when
// held and eventually heads for the door. Bring it to the old master to have
// the spell reversed.

import * as THREE from 'three';
import { Entity, type HoverInfo } from '../../world/Entity';
import type { GameContext } from '../../core/GameContext';
import { frogSheet } from '../../rendering/three/sprites/CharacterPainter';
import { PixelSprite } from '../../rendering/three/sprites/PixelSprite';
import { CG } from '../../physics/PhysicsTypes';
import type { Customer } from './Customer';
import { t } from '../../core/i18n';
import { rng } from '../../core/Random';

const tmp = new THREE.Vector3();

export class Frog extends Entity {
  readonly kind = 'frog';
  readonly sprite: PixelSprite;
  age = 0;
  private hopTimer = 1;
  private croakTimer = 1.5;
  escaping = false;
  cured = false;
  readonly escapeAfter = 45;

  constructor(
    ctx: GameContext,
    readonly customer: Customer,
    pos: THREE.Vector3,
  ) {
    super();
    this.sprite = new PixelSprite(frogSheet(), 1.5);
    this.object.add(this.sprite.root);
    this.draggable = true;
    this.halfHeight = 0.09;
    this.radius = 0.12;
    this.body = ctx.physics.createBody({
      shape: { type: 'sphere', radius: 0.09 },
      motion: 'dynamic',
      mass: 0.35,
      position: { x: pos.x, y: Math.max(0.2, pos.y), z: pos.z },
      friction: 0.9,
      restitution: 0.25,
      angularDamping: 20,
      linearDamping: 0.2,
      collisionEvents: true,
      group: CG.ITEM,
    });
  }

  override hover(): HoverInfo {
    return { title: t('obj.frog', { name: this.customer.name }), hint: t('hint.frog') };
  }

  override onHeld(ctx: GameContext, dt: number): void {
    // Wiggle and complain.
    if (rng.chance(dt * 4)) ctx.audio.play('frogCroak', { x: this.object.position.x, pitch: 1.2 + rng.next() * 0.3, minGap: 0.4 });
    this.sprite.squash = Math.sin(this.age * 25) * 0.25;
    if (this.nearMentor(ctx)) ctx.vfx.rate('frogCure', 6, dt, () => ctx.vfx.magic(this.object.position, '#b55088', 2));
  }

  override onReleased(ctx: GameContext): void {
    this.sprite.squash = 0;
    if (this.nearMentor(ctx)) this.cure(ctx);
  }

  private nearMentor(ctx: GameContext): boolean {
    return this.object.position.distanceTo(ctx.shop.anchors.frogCure) < 1.1;
  }

  cure(ctx: GameContext): void {
    if (this.cured) return;
    this.cured = true;
    ctx.bus.emit('frog:cured', { uid: this.customer.uid });
  }

  override update(ctx: GameContext, dt: number): void {
    this.age += dt;
    this.sprite.update(dt, ctx.renderer.rig.camera);
    // Keep the frog sprite upright regardless of body spin.
    this.sprite.root.quaternion.copy(this.object.quaternion).invert();
    if (this.held || !this.body) return;
    const p = this.object.position;
    if (p.y < -1) {
      this.body.teleport({ x: 0, y: 0.5, z: 0.5 });
      ctx.sync.snap(this.body);
    }
    this.croakTimer -= dt;
    if (this.croakTimer <= 0) {
      this.croakTimer = rng.range(1.5, 3.5);
      ctx.audio.play('frogCroak', { x: p.x, pitch: 0.9 + rng.next() * 0.3 });
      this.sprite.play('idle', true);
    }
    if (this.age > this.escapeAfter) this.escaping = true;
    this.hopTimer -= dt;
    const v = this.body.getLinearVelocity(tmp);
    const resting = Math.abs(v.y) < 0.15 && p.y < 1.4;
    if (this.hopTimer <= 0 && resting) {
      this.hopTimer = rng.range(0.6, 1.5);
      let dir = new THREE.Vector3(rng.range(-1, 1), 0, rng.range(-1, 1));
      if (this.escaping) {
        dir = ctx.shop.anchors.doorInside.clone().sub(p).setY(0);
      } else {
        // Dodge the hand: hop away from the pointer if it is close.
        const ray = ctx.interaction.ray;
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -p.y);
        const hit = new THREE.Vector3();
        if (ray.intersectPlane(plane, hit) && hit.distanceTo(p) < 1.2) dir = p.clone().sub(hit).setY(0);
      }
      dir.normalize();
      const m = this.body.mass;
      const power = this.escaping ? 1.6 : rng.range(0.9, 1.5);
      this.body.applyImpulse({ x: dir.x * power * m * 1.4, y: m * rng.range(2.2, 3.2), z: dir.z * power * m * 1.4 });
      this.sprite.play('jump', true);
      if (Math.abs(dir.x) > 0.1) this.sprite.facing = dir.x > 0 ? 1 : -1;
      ctx.audio.play('squish', { x: p.x, volume: 0.25 });
    }
    if (this.sprite.finished) this.sprite.play('idle');
    if (this.escaping && p.distanceTo(ctx.shop.anchors.doorInside) < 0.9) {
      ctx.shop.door.open(ctx, 1.5);
      ctx.bus.emit('frog:escaped', { uid: this.customer.uid });
    }
  }

  override dispose(ctx: GameContext): void {
    this.sprite.dispose();
    super.dispose(ctx);
  }
}
