// Tools attached to the cauldron: the ladle (stir by circling the cauldron
// with the pointer) and the drain tap (drag to open, releases the brew).

import * as THREE from 'three';
import { Entity, pickProxy, type CursorKind, type HoverInfo } from '../../world/Entity';
import type { Grab } from '../../world/Interaction';
import type { GameContext } from '../../core/GameContext';
import type { Cauldron } from '../potion/Cauldron';
import { ladleModel } from '../../rendering/three/models/toolModels';
import { hoistModel } from '../../rendering/three/models/stationModels';
import { chainLinks } from '../../rendering/three/textures/PixelTextures';
import { toon } from '../../rendering/three/materials';
import { brass, iron } from '../../rendering/three/textures/PixelTextures';
import { CG, type BodyHandle } from '../../physics/PhysicsTypes';
import { angleDelta, clamp, damp } from '../../core/math';
import { t } from '../../core/i18n';
import { stirLoop, pourLoop } from '../../audio/Sfx';

const UP = new THREE.Vector3(0, 1, 0);

export function stirZone(speed: number): 'none' | 'gentle' | 'vigorous' | 'frantic' {
  const s = Math.abs(speed);
  if (s < 0.4) return 'none';
  if (s < 3.2) return 'gentle';
  if (s < 6.4) return 'vigorous';
  return 'frantic';
}

const ZONE_COLOR = { none: '#8b9bb4', gentle: '#63c74d', vigorous: '#feae34', frantic: '#e43b44' } as const;

export class Ladle extends Entity {
  readonly kind = 'ladle';
  angle = -0.9;
  angularSpeed = 0;
  private grabbing = false;
  private readonly orbit = 0.3;
  private readonly model: ReturnType<typeof ladleModel>;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly bowlBody: BodyHandle;
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();
  private lastPointerAngle = 0;
  private ringAlpha = 0;

  constructor(
    ctx: GameContext,
    private readonly cauldron: Cauldron,
  ) {
    super();
    this.model = ladleModel();
    this.object.add(this.model.group);
    // The handle is thin: a fat invisible sleeve over its upper part.
    const sleeve = pickProxy(new THREE.CylinderGeometry(0.075, 0.075, 0.6, 6));
    sleeve.position.y = 0.68;
    this.object.add(sleeve);
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#63c74d', transparent: true, opacity: 0, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.66, 32), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(cauldron.center.x, cauldron.rimY + 0.02, cauldron.center.z);
    this.ring.userData.noPick = true;
    this.ring.renderOrder = 25;
    ctx.scene.add(this.ring);
    // Kinematic bowl collider physically pushes floating ingredients around.
    this.bowlBody = ctx.physics.createBody({
      shape: { type: 'sphere', radius: 0.07 },
      motion: 'kinematic',
      position: this.bowlPos(this.tmpP),
      group: CG.TOOL,
      mask: CG.ITEM,
    });
  }

  private bowlPos(out: THREE.Vector3): THREE.Vector3 {
    const c = this.cauldron;
    const y = Math.max(c.bottomY + 0.08, Math.min(c.level - 0.02, c.rimY - 0.15));
    return out.set(c.center.x + Math.cos(this.angle) * this.orbit, y, c.center.z + Math.sin(this.angle) * this.orbit);
  }

  override cursor(): CursorKind {
    return 'grab';
  }

  override hover(): HoverInfo {
    return { title: t('obj.ladle'), hint: t('hint.stir') };
  }

  private pointerAngle(ctx: GameContext): number | null {
    const plane = new THREE.Plane(UP, -this.cauldron.rimY);
    const hit = new THREE.Vector3();
    if (!ctx.interaction.ray.intersectPlane(plane, hit)) return null;
    return Math.atan2(hit.z - this.cauldron.center.z, hit.x - this.cauldron.center.x);
  }

  override press(ctx: GameContext): Grab {
    this.grabbing = true;
    const a0 = this.pointerAngle(ctx);
    this.lastPointerAngle = a0 ?? this.angle;
    const self = this;
    return {
      entity: this,
      cursor: 'stir',
      hint: () => {
        const z = stirZone(self.angularSpeed);
        return z === 'none' ? t('hint.stir') : t(`stir.${z}`);
      },
      update(c: GameContext, dt: number) {
        const a = self.pointerAngle(c);
        if (a === null) return;
        const d = angleDelta(self.lastPointerAngle, a);
        self.lastPointerAngle = a;
        // Limit how far the ladle can jump in one frame (liquid resistance).
        const step = clamp(d, -0.9, 0.9);
        self.angle += step;
        const inst = step / Math.max(1 / 240, dt);
        self.angularSpeed = damp(self.angularSpeed, inst, 6, dt);
      },
      release() {
        self.grabbing = false;
      },
    };
  }

  override update(ctx: GameContext, dt: number): void {
    if (!this.grabbing) {
      this.angularSpeed *= Math.exp(-2.2 * dt);
      if (Math.abs(this.angularSpeed) < 0.02) this.angularSpeed = 0;
      this.angle += this.angularSpeed * dt;
    }
    // Stirring without liquid does nothing to the brew.
    this.cauldron.stirSpeed = this.cauldron.chem.water > 0.15 ? this.angularSpeed : 0;
    ctx.bus.emit('stir', { speed: this.cauldron.stirSpeed });
    const bowl = this.bowlPos(this.tmpP);
    this.object.position.copy(bowl);
    // Lean the handle outward and back against the rim.
    const outward = new THREE.Vector3(Math.cos(this.angle), 0, Math.sin(this.angle));
    const tangent = new THREE.Vector3().crossVectors(UP, outward);
    this.tmpQ.setFromAxisAngle(tangent, -0.42);
    this.object.quaternion.copy(this.tmpQ);
    this.bowlBody.setKinematicTarget(bowl, this.tmpQ);

    this.ring.position.set(this.cauldron.center.x, this.cauldron.rimY + 0.02, this.cauldron.center.z);
    const z = stirZone(this.cauldron.stirSpeed);
    const active = this.grabbing || Math.abs(this.angularSpeed) > 0.5;
    this.ringAlpha = damp(this.ringAlpha, active && z !== 'none' ? 0.55 : 0, 6, dt);
    this.ringMat.opacity = this.ringAlpha;
    this.ringMat.color.set(ZONE_COLOR[z]);
    this.ring.visible = this.ringAlpha > 0.02;
    const loop = ctx.audio.loop('stir', stirLoop);
    loop?.set(this.cauldron.chem.water > 0.15 ? Math.min(1, Math.abs(this.angularSpeed) / 7) : 0);
  }
}

export class DrainTap extends Entity {
  readonly kind = 'tap';
  private readonly handle: THREE.Mesh;
  private open = 0;
  private opening = false;

  constructor(
    ctx: GameContext,
    private readonly cauldron: Cauldron,
    private readonly spout: THREE.Vector3,
  ) {
    super();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), toon({ map: iron() }));
    pipe.rotation.z = Math.PI / 2;
    this.object.add(pipe);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.06, 6), toon({ map: brass() }));
    nozzle.position.set(0.08, -0.03, 0);
    this.object.add(nozzle);
    this.handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), toon({ color: '#a22633' }));
    this.handle.position.set(0.02, 0.06, 0);
    this.object.add(this.handle);
    this.object.position.copy(spout);
    void ctx;
  }

  override cursor(): CursorKind {
    return 'grab';
  }

  override hover(): HoverInfo {
    return { title: t('obj.tap'), hint: t('hint.tap') };
  }

  override press(ctx: GameContext): Grab {
    this.opening = true;
    const startY = ctx.input.pointer.y;
    const self = this;
    ctx.audio.play('lever', { x: this.spout.x });
    return {
      entity: this,
      cursor: 'grabbing',
      hint: () => t('obj.tap'),
      update(c: GameContext) {
        self.open = clamp((c.input.pointer.y - startY) / 50, 0.35, 1);
      },
      release(c: GameContext) {
        self.opening = false;
        c.audio.play('lever', { x: self.spout.x, pitch: 0.8 });
      },
    };
  }

  override update(ctx: GameContext, dt: number): void {
    this.object.position.set(this.spout.x, this.spout.y + this.cauldron.lift, this.spout.z);
    if (!this.opening) this.open = Math.max(0, this.open - dt * 4);
    this.handle.rotation.z = -this.open * 1.2;
    const flowing = this.open > 0.05 && this.cauldron.chem.water > 0.02;
    if (flowing) {
      const amount = this.cauldron.drain(ctx, 0.9 * this.open * dt);
      if (amount > 0) {
        const sp = this.object.position;
        const p = new THREE.Vector3(sp.x + 0.1, sp.y - 0.05, sp.z);
        ctx.vfx.rate('drain', 40 * this.open, dt, () => ctx.vfx.drip(p, this.cauldron.color, { x: 0.2, y: 0, z: 0 }));
      }
    }
    ctx.audio.loop('drain', pourLoop)?.set(flowing ? this.open * 0.7 : 0);
  }
}

// ---------------------------------------------------------------------------
// Hoist: a jib crane with a crank wheel that lifts the cauldron off the fire
// ---------------------------------------------------------------------------

/** Wheel radians per metre of lift (about 0.36 m per turn). */
const RAD_PER_M = 17;

export class CauldronHoist extends Entity {
  readonly kind = 'hoist';
  private readonly parts: ReturnType<typeof hoistModel>;
  private readonly chainMat: THREE.MeshToonMaterial;
  private readonly mainChain: THREE.Mesh;
  private readonly bridle = new THREE.Group();
  private readonly pulleyWorld = new THREE.Vector3();
  private readonly wheelWorld = new THREE.Vector3();
  private lastAngle = 0;
  private clickAcc = 0;
  private readonly proj = { x: 0, y: 0, visible: false };

  constructor(
    ctx: GameContext,
    private readonly cauldron: Cauldron,
    base: THREE.Vector3,
  ) {
    super();
    const toTip = new THREE.Vector3(cauldron.center.x - base.x, 0, cauldron.center.z - base.z);
    this.parts = hoistModel(toTip);
    this.object.add(this.parts.group);
    this.object.position.copy(base);
    this.pulleyWorld.copy(this.parts.pulley).add(base);
    this.wheelWorld.copy(this.parts.wheelCenter).add(base);

    this.chainMat = new THREE.MeshToonMaterial({ map: chainLinks().clone(), alphaTest: 0.5, side: THREE.DoubleSide });
    this.chainMat.map!.wrapT = THREE.RepeatWrapping;
    this.chainMat.map!.needsUpdate = true;
    // Vertical chain from the pulley down to the bridle ring (length varies).
    this.mainChain = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1), this.chainMat);
    this.mainChain.geometry.translate(0, -0.5, 0);
    this.mainChain.userData.noPick = true;
    this.mainChain.raycast = () => {};
    ctx.scene.add(this.mainChain);
    // Bridle: two chains from the cauldron lugs to a ring, riding with the pot.
    const ringY = 1.36;
    for (const sx of [-1, 1]) {
      const from = new THREE.Vector3(sx * 0.66, 0.6, 0);
      const to = new THREE.Vector3(0, ringY, 0);
      const len = from.distanceTo(to);
      const mat = this.chainMat.clone();
      mat.map = chainLinks().clone();
      mat.map.wrapT = THREE.RepeatWrapping;
      mat.map.repeat.set(1, len / 0.1);
      mat.map.needsUpdate = true;
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.05, len), mat);
      c.position.copy(from).add(to).multiplyScalar(0.5);
      c.rotation.z = Math.atan2(to.x - from.x, from.y - to.y) * -1;
      c.raycast = () => {};
      this.bridle.add(c);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 4, 10), toon({ map: iron() }));
    ring.position.y = ringY;
    ring.raycast = () => {};
    this.bridle.add(ring);
    cauldron.object.add(this.bridle);

    ctx.physics.createBody({ shape: { type: 'box', size: [0.16, 2.4, 0.16] }, motion: 'static', position: { x: base.x, y: base.y + 1.2, z: base.z }, group: CG.STATIC });
  }

  override cursor(): CursorKind {
    return 'grab';
  }

  override hover(): HoverInfo {
    const c = this.cauldron;
    return {
      title: t('obj.hoist'),
      hint: t('hint.hoist'),
      lines: [
        { text: t('hoist.height', { cm: Math.round(c.lift * 100) }), color: '#c0cbdc', bar: c.liftRatio },
        { text: t('hoist.heat', { p: Math.round(c.heatFactor * 100) }), color: '#f77622', bar: c.heatFactor },
      ],
    };
  }

  private pointerAngle(ctx: GameContext): number {
    ctx.renderer.project(this.wheelWorld, this.proj);
    const p = ctx.input.pointer;
    return Math.atan2(p.y - this.proj.y, p.x - this.proj.x);
  }

  override press(ctx: GameContext): Grab {
    this.lastAngle = this.pointerAngle(ctx);
    const self = this;
    ctx.audio.play('ratchet', { x: this.wheelWorld.x });
    return {
      entity: this,
      cursor: 'stir',
      hint: () => `${t('hoist.height', { cm: Math.round(self.cauldron.lift * 100) })} · ${t('hoist.heat', { p: Math.round(self.cauldron.heatFactor * 100) })}`,
      update(c: GameContext) {
        const a = self.pointerAngle(c);
        // Clockwise on screen raises the pot (atan2 grows clockwise with y down).
        const d = clamp(angleDelta(self.lastAngle, a), -0.6, 0.6);
        self.lastAngle = a;
        const before = self.cauldron.lift;
        self.cauldron.setLift(before + d / RAD_PER_M);
        const moved = self.cauldron.lift - before;
        if (Math.abs(moved) > 0) {
          self.clickAcc += Math.abs(moved) * RAD_PER_M;
          if (self.clickAcc > 0.45) {
            self.clickAcc = 0;
            c.audio.play('ratchet', { x: self.wheelWorld.x, pitch: moved > 0 ? 1.1 : 0.9 });
            if (Math.random() < 0.5) c.audio.play('chain', { x: self.cauldron.center.x, volume: 0.6 });
          }
        } else if (Math.abs(d) > 0.05 && self.clickAcc > -1) {
          // At an end stop.
          self.clickAcc = -1;
          c.audio.play('woodKnock', { x: self.wheelWorld.x, volume: 0.5, pitch: 0.8 });
        }
      },
      release() {
        self.clickAcc = 0;
      },
    };
  }

  override update(): void {
    const c = this.cauldron;
    this.parts.wheel.rotation.z = -c.lift * RAD_PER_M;
    // Main chain spans pulley → bridle ring.
    const ringY = c.center.y + 1.36;
    const len = Math.max(0.05, this.pulleyWorld.y - ringY);
    this.mainChain.position.set(c.center.x, this.pulleyWorld.y, c.center.z);
    this.mainChain.scale.set(1, len, 1);
    this.chainMat.map!.repeat.set(1, len / 0.1);
    this.chainMat.map!.offset.y = (c.lift * 10) % 1;
  }
}
