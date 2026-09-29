// Water: the barrel is the source, the bucket carries it. Dip the bucket in
// the barrel to fill it, tilt it (hold SPACE / right click) to pour. Water
// poured into the cauldron cools and dilutes the brew; poured on the fire it
// douses the flames.

import * as THREE from 'three';
import { Entity, type HoverInfo, type SavedEntity } from '../../world/Entity';
import type { GameContext } from '../../core/GameContext';
import type { PhysicsGrab } from '../../world/Interaction';
import { bucketModel } from '../../rendering/three/models/toolModels';
import { barrelModel } from '../../rendering/three/models/stationModels';
import { CG, type ShapeDesc } from '../../physics/PhysicsTypes';
import { t } from '../../core/i18n';
import { pourLoop } from '../../audio/Sfx';
import { rng } from '../../core/Random';

export const BUCKET_CAPACITY = 2;

export class WaterBarrel extends Entity {
  readonly kind = 'barrel';
  readonly top: THREE.Vector3;
  readonly surface: THREE.Mesh;

  constructor(ctx: GameContext, position: THREE.Vector3) {
    super();
    const r = 0.38;
    const h = 0.9;
    const m = barrelModel(r, h);
    this.object.add(m.group);
    this.object.position.copy(position);
    this.top = position.clone().add(new THREE.Vector3(0, h, 0));
    // Hollow at the top: a solid core below the waterline and a ring of
    // staves above it, so the bucket can really be dunked in.
    const core = h - 0.32;
    const children: ShapeDesc[] = [{ type: 'cylinder', radius: r, height: core, offset: { x: 0, y: core / 2, z: 0 } }];
    const staves = 12;
    for (let i = 0; i < staves; i++) {
      const a = (i / staves) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      children.push({
        type: 'box',
        size: [0.05, h - core, 0.22],
        offset: { x: Math.cos(a) * (r - 0.02), y: core + (h - core) / 2, z: Math.sin(a) * (r - 0.02) },
        rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
      });
    }
    this.body = ctx.physics.createBody({ shape: { type: 'compound', children }, motion: 'static', position, group: CG.STATIC });
    this.surface = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 12), new THREE.MeshBasicMaterial({ visible: false }));
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.y = h + 0.01;
    this.surface.userData.noPick = true;
    this.object.add(this.surface);
    ctx.world.addSurface(this.surface, { tag: 'barrel', hover: 0.05 });
  }

  override hover(): HoverInfo {
    return { title: t('obj.barrel'), hint: t('hint.barrel') };
  }

  isAbove(p: THREE.Vector3, radius = 0.34): boolean {
    const dx = p.x - this.top.x;
    const dz = p.z - this.top.z;
    return dx * dx + dz * dz < radius * radius && p.y < this.top.y + 0.5;
  }
}

export class Bucket extends Entity {
  readonly kind = 'bucket';
  water = BUCKET_CAPACITY;
  private readonly parts: ReturnType<typeof bucketModel>;
  private pouring = 0;
  private filling = false;
  private stillT = 0;
  private rimLocal: THREE.Vector3[] = [];

  constructor(
    ctx: GameContext,
    position: THREE.Vector3,
    private readonly barrel: WaterBarrel,
  ) {
    super();
    this.parts = bucketModel();
    for (const c of this.parts.group.children) c.position.y -= 0.12;
    this.object.add(this.parts.group);
    this.draggable = true;
    this.upright = true;
    this.tiltable = true;
    this.ghostWhenHeld = true;
    this.halfHeight = 0.12;
    this.radius = 0.13;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.rimLocal.push(new THREE.Vector3(Math.cos(a) * 0.13, 0.12, Math.sin(a) * 0.13));
    }
    this.body = ctx.physics.createBody({
      shape: { type: 'cylinder', radius: 0.125, height: 0.24 },
      motion: 'dynamic',
      mass: 1.2,
      position,
      friction: 0.8,
      restitution: 0.1,
      collisionEvents: true,
      group: CG.ITEM,
    });
  }

  override hover(): HoverInfo {
    return {
      title: t('obj.bucket'),
      hint: t('hint.pour'),
      lines: [{ text: t('misc.liters', { n: this.water.toFixed(1) }), color: '#0099db', bar: this.water / BUCKET_CAPACITY }],
    };
  }

  override onHeld(ctx: GameContext, dt: number): void {
    const grab = ctx.interaction.grab as PhysicsGrab | null;
    if (!grab) return;
    // Dip into the barrel.
    if (grab.surfaceTag === 'barrel') {
      // Lower it below the waterline once it is over the opening.
      grab.heightOffset = this.barrel.isAbove(this.object.position, 0.2) ? -0.5 : 0;
      if (this.barrel.isAbove(this.object.position) && this.object.position.y < this.barrel.top.y + 0.02 && this.water < BUCKET_CAPACITY) {
        if (!this.filling) ctx.audio.play('splash', { x: this.object.position.x, amount: 0.8 });
        this.filling = true;
        this.water = Math.min(BUCKET_CAPACITY, this.water + dt * 2.5);
        if (rng.chance(dt * 12)) ctx.vfx.bubble(this.barrel.top, 0.25, '#6fa8d6');
      }
    } else {
      grab.heightOffset = 0;
      this.filling = false;
    }
    // Held still over the cauldron, it tips over by itself (up to a normal
    // brewing level – hold SPACE to pour more).
    const cauldron0 = ctx.shop.cauldron;
    const overPot = Math.hypot(this.object.position.x - cauldron0.center.x, this.object.position.z - cauldron0.center.z) < 0.5 && this.object.position.y > cauldron0.rimY;
    const v = ctx.input.pointer;
    const still = Math.hypot(v.vx, v.vy) < 90;
    this.stillT = overPot && still && this.water > 0.05 && cauldron0.chem.water < 2.2 ? this.stillT + dt : 0;
    grab.autoTilt = this.stillT > 0.3 ? 1 : 0;
    // Pouring when tilted.
    this.pouring = grab.tilt > 0.5 && this.water > 0 ? grab.tilt : 0;
    if (this.pouring > 0) {
      const amount = Math.min(this.water, 1.4 * dt * this.pouring);
      this.water -= amount;
      const lip = this.lowestRim();
      ctx.vfx.rate('bucketPour', 60, dt, () => ctx.vfx.drip(lip, '#6fa8d6', { x: 0, y: -0.3, z: 0 }));
      const cauldron = ctx.shop.cauldron;
      const hearth = ctx.shop.hearth;
      const below = new THREE.Vector3(lip.x, cauldron.rimY, lip.z);
      if (cauldron.isAboveOpening(below) && lip.y > cauldron.rimY - 0.2) {
        cauldron.addWater(ctx, amount);
        ctx.vfx.rate('bucketSplash', 8, dt, () => ctx.vfx.splash(new THREE.Vector3(lip.x, cauldron.level, lip.z), '#6fa8d6', 3, 0.6));
      } else if (hearth.inFeedZone(new THREE.Vector3(lip.x, 0.3, lip.z)) || Math.hypot(lip.x - hearth.center.x, lip.z - hearth.center.z) < 0.95) {
        hearth.douse(ctx, amount);
      } else if (rng.chance(dt * 6)) {
        ctx.vfx.splash(new THREE.Vector3(lip.x, 0.02, lip.z), '#6fa8d6', 4, 0.5);
      }
    }
    ctx.audio.loop('bucketPour', pourLoop)?.set(this.pouring);
  }

  override onReleased(ctx: GameContext): void {
    this.pouring = 0;
    this.filling = false;
    this.stillT = 0;
    ctx.audio.loop('bucketPour', pourLoop)?.set(0);
  }

  private lowestRim(): THREE.Vector3 {
    let best: THREE.Vector3 | null = null;
    for (const l of this.rimLocal) {
      const w = this.object.localToWorld(l.clone());
      if (!best || w.y < best.y) best = w;
    }
    return best!;
  }

  override onImpact(ctx: GameContext, _o: Entity | null, impulse: number, point: { x: number }): void {
    if (impulse > 1.5) ctx.audio.play('woodKnock', { x: point.x, volume: Math.min(1, impulse / 6), pitch: 1.2 });
  }

  override update(): void {
    const f = this.water / BUCKET_CAPACITY;
    this.parts.water.visible = f > 0.02;
    this.parts.water.position.y = -0.1 + f * 0.19;
    this.parts.water.scale.setScalar(0.8 + f * 0.2);
  }

  override serialize(): SavedEntity {
    const p = this.object.position;
    return { type: 'bucket', p: [p.x, p.y, p.z], water: this.water };
  }
}
