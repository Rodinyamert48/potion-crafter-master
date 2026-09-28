// Fire and explosion simulations run on Babylon.js CPU particle systems inside
// the headless Babylon scene. Babylon handles emission, colour/size gradients
// and integration; the resulting particles are handed to the Three.js
// ParticleRenderer through the ParticleSource interface.

import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3, type Matrix } from '@babylonjs/core/Maths/math.vector.js';
import type { Particle } from '@babylonjs/core/Particles/particle.js';
import '@babylonjs/core/Particles/particleSystemComponent.js';
import * as THREE from 'three';
import type { BabylonCore } from './BabylonCore';
import { Shape, type ParticleSource } from '../../vfx/ParticleRenderer';

interface SimEntry {
  ps: ParticleSystem;
  shape: number;
  additive: boolean;
  sizeScale: number;
  /** One-shot systems are disposed when finished. */
  oneShot: boolean;
}

function linear(hex: string, a = 1): Color4 {
  const c = new THREE.Color(hex);
  return new Color4(c.r, c.g, c.b, a);
}

export interface FireHandle {
  setIntensity(v: number): void;
  setCenter(x: number, y: number, z: number): void;
}

export class BabylonParticleSim implements ParticleSource {
  private readonly entries: SimEntry[] = [];
  density = 1;

  constructor(private readonly core: BabylonCore) {}

  private make(name: string, capacity: number, shape: number, additive: boolean, oneShot: boolean, sizeScale = 1): ParticleSystem {
    const ps = new ParticleSystem(name, capacity, this.core.scene);
    ps.preWarmStepOffset = 1;
    ps.updateSpeed = 1 / 60;
    ps.emitter = new Vector3(0, 0, 0);
    ps.isLocal = false;
    this.entries.push({ ps, shape, additive, sizeScale, oneShot });
    return ps;
  }

  /** Continuous hearth fire: flame cells + drifting embers around a ring. */
  createFire(cx: number, cy: number, cz: number, ringRadius: number): FireHandle {
    const center = new Vector3(cx, cy, cz);
    const ringFn = (inner: number, outer: number) =>
      (_m: Matrix, pos: Vector3, _p: Particle, _local: boolean) => {
        const a = Math.random() * Math.PI * 2;
        // Bias toward the front (+z, toward the camera) where the hearth opening is.
        const front = Math.random() < 0.55 ? Math.PI / 2 + (Math.random() - 0.5) * 1.6 : a;
        const r = inner + Math.random() * (outer - inner);
        pos.set(center.x + Math.cos(front) * r, center.y + Math.random() * 0.08, center.z + Math.sin(front) * r);
      };

    const flames = this.make('hearthFlames', 420, Shape.SQUARE, true, false);
    flames.startPositionFunction = ringFn(ringRadius * 0.35, ringRadius);
    flames.direction1 = new Vector3(-0.15, 0.7, -0.15);
    flames.direction2 = new Vector3(0.15, 1.3, 0.15);
    flames.minEmitPower = 0.5;
    flames.maxEmitPower = 0.9;
    flames.minLifeTime = 0.22;
    flames.maxLifeTime = 0.6;
    flames.gravity = new Vector3(0, 1.1, 0);
    flames.addColorGradient(0, linear('#fff4b0', 1));
    flames.addColorGradient(0.25, linear('#feae34', 1));
    flames.addColorGradient(0.6, linear('#e43b44', 0.85));
    flames.addColorGradient(1, linear('#3e2731', 0));
    flames.addSizeGradient(0, 0.085);
    flames.addSizeGradient(0.5, 0.06);
    flames.addSizeGradient(1, 0.02);
    flames.emitRate = 0;
    flames.start();

    const embers = this.make('hearthEmbers', 160, Shape.SQUARE, true, false);
    embers.startPositionFunction = ringFn(ringRadius * 0.5, ringRadius * 1.05);
    embers.direction1 = new Vector3(-0.5, 1.0, -0.5);
    embers.direction2 = new Vector3(0.5, 2.0, 0.5);
    embers.minEmitPower = 0.4;
    embers.maxEmitPower = 1.0;
    embers.minLifeTime = 0.8;
    embers.maxLifeTime = 2.2;
    embers.gravity = new Vector3(0, 0.25, 0);
    embers.addColorGradient(0, linear('#fee761', 1));
    embers.addColorGradient(0.5, linear('#f77622', 0.9));
    embers.addColorGradient(1, linear('#a22633', 0));
    embers.addSizeGradient(0, 0.032);
    embers.addSizeGradient(1, 0.015);
    embers.addDragGradient(0, 0.2);
    embers.emitRate = 0;
    embers.start();

    const smoke = this.make('hearthSmoke', 80, Shape.SOFT, false, false);
    smoke.startPositionFunction = ringFn(ringRadius * 0.8, ringRadius * 1.1);
    smoke.direction1 = new Vector3(-0.1, 0.4, -0.1);
    smoke.direction2 = new Vector3(0.1, 0.7, 0.1);
    smoke.minEmitPower = 0.3;
    smoke.maxEmitPower = 0.6;
    smoke.minLifeTime = 1.2;
    smoke.maxLifeTime = 2.4;
    smoke.gravity = new Vector3(0, 0.2, 0);
    smoke.addColorGradient(0, linear('#3a3040', 0.0));
    smoke.addColorGradient(0.2, linear('#3a3040', 0.45));
    smoke.addColorGradient(1, linear('#5a5068', 0));
    smoke.addSizeGradient(0, 0.12);
    smoke.addSizeGradient(1, 0.34);
    smoke.emitRate = 0;
    smoke.start();

    return {
      setIntensity: (v: number) => {
        const k = Math.max(0, v) * this.density;
        flames.emitRate = k > 0.02 ? 30 + 230 * Math.min(1.6, k) : 0;
        embers.emitRate = k > 0.05 ? 3 + 14 * Math.min(1.6, k) : 0;
        smoke.emitRate = k > 0.02 ? 2 + 6 * Math.min(1.6, k) : 0;
        const power = 0.7 + 0.5 * Math.min(1.8, v);
        flames.minEmitPower = 0.45 * power;
        flames.maxEmitPower = 0.9 * power;
      },
      setCenter: (x, y, z) => center.set(x, y, z),
    };
  }

  /** A fireball + smoke burst. `power` ~1 for a cauldron explosion. */
  explosion(x: number, y: number, z: number, power = 1, tint = '#feae34'): void {
    const origin = new Vector3(x, y, z);
    const count = Math.round(170 * power * this.density);
    const fire = this.make('explosionFire', count + 10, Shape.SQUARE, true, true);
    fire.emitter = origin;
    fire.createSphereEmitter(0.25 * power, 1);
    fire.minEmitPower = 1.5 * power;
    fire.maxEmitPower = 5.5 * power;
    fire.minLifeTime = 0.3;
    fire.maxLifeTime = 1.0;
    fire.gravity = new Vector3(0, 1.5, 0);
    fire.addColorGradient(0, linear('#ffffff', 1));
    fire.addColorGradient(0.15, linear('#fee761', 1));
    fire.addColorGradient(0.45, linear(tint, 1));
    fire.addColorGradient(0.75, linear('#a22633', 0.8));
    fire.addColorGradient(1, linear('#262b44', 0));
    fire.addSizeGradient(0, 0.2 * power);
    fire.addSizeGradient(0.4, 0.32 * power);
    fire.addSizeGradient(1, 0.08 * power);
    fire.addDragGradient(0, 0.85);
    fire.manualEmitCount = count;
    fire.targetStopDuration = 0.1;
    fire.start();

    const smoke = this.make('explosionSmoke', 90, Shape.SOFT, false, true);
    smoke.emitter = origin;
    smoke.createSphereEmitter(0.4 * power, 1);
    smoke.minEmitPower = 0.6;
    smoke.maxEmitPower = 2.2 * power;
    smoke.minLifeTime = 1.6;
    smoke.maxLifeTime = 3.4;
    smoke.gravity = new Vector3(0, 0.45, 0);
    smoke.addColorGradient(0, linear('#5a5068', 0.9));
    smoke.addColorGradient(0.6, linear('#3a3040', 0.6));
    smoke.addColorGradient(1, linear('#262b44', 0));
    smoke.addSizeGradient(0, 0.28 * power);
    smoke.addSizeGradient(1, 0.75 * power);
    smoke.addDragGradient(0, 0.7);
    smoke.manualEmitCount = Math.round(60 * power * this.density);
    smoke.targetStopDuration = 0.1;
    smoke.start();
  }

  /** Falling sparks, e.g. hammer strikes, bellows gusts, fire flare-ups. */
  sparks(x: number, y: number, z: number, count = 24, dir: [number, number, number] = [0, 1, 0], spread = 0.8, color = '#fee761'): void {
    const ps = this.make('sparks', count + 4, Shape.SQUARE, true, true);
    ps.emitter = new Vector3(x, y, z);
    ps.direction1 = new Vector3(dir[0] - spread, dir[1] - spread * 0.3, dir[2] - spread);
    ps.direction2 = new Vector3(dir[0] + spread, dir[1] + spread * 0.3, dir[2] + spread);
    ps.minEmitPower = 1.2;
    ps.maxEmitPower = 3.2;
    ps.minLifeTime = 0.25;
    ps.maxLifeTime = 0.8;
    ps.gravity = new Vector3(0, -9, 0);
    ps.addColorGradient(0, linear('#ffffff', 1));
    ps.addColorGradient(0.3, linear(color, 1));
    ps.addColorGradient(1, linear('#e43b44', 0));
    ps.addSizeGradient(0, 0.03);
    ps.addSizeGradient(1, 0.012);
    ps.manualEmitCount = Math.round(count * this.density);
    ps.targetStopDuration = 0.05;
    ps.start();
  }

  /** Flame burst (e.g. a dragon scale thrown into the hearth). */
  flare(x: number, y: number, z: number, color = '#f77622', power = 1): void {
    const ps = this.make('flare', 90, Shape.SQUARE, true, true);
    ps.emitter = new Vector3(x, y, z);
    ps.createCylinderEmitter(0.25, 0.1, 1, 0.2);
    ps.minEmitPower = 1.5 * power;
    ps.maxEmitPower = 3 * power;
    ps.minLifeTime = 0.3;
    ps.maxLifeTime = 0.8;
    ps.gravity = new Vector3(0, 2, 0);
    ps.addColorGradient(0, linear('#fff4b0', 1));
    ps.addColorGradient(0.35, linear(color, 1));
    ps.addColorGradient(1, linear('#3e2731', 0));
    ps.addSizeGradient(0, 0.1 * power);
    ps.addSizeGradient(1, 0.03);
    ps.manualEmitCount = Math.round(80 * power * this.density);
    ps.targetStopDuration = 0.05;
    ps.start();
  }

  update(dt: number): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      e.ps.updateSpeed = dt;
      e.ps.animate(true);
      if (e.oneShot && !e.ps.isAlive() && e.ps.particles.length === 0) {
        e.ps.dispose();
        this.entries.splice(i, 1);
      }
    }
  }

  forEach(
    cb: (x: number, y: number, z: number, r: number, g: number, b: number, a: number, size: number, shape: number, additive: boolean) => void,
  ): void {
    for (const e of this.entries) {
      const parts = e.ps.particles;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const c = p.color;
        if (c.a <= 0.01) continue;
        cb(p.position.x, p.position.y, p.position.z, c.r, c.g, c.b, c.a, p.size * e.sizeScale, e.shape, e.additive);
      }
    }
  }
}
