// High level effect library. Gameplay calls these by name; the simulation
// backend is either the Three-side particle pool or Babylon's CPU particle
// systems (fire, explosions, sparks).

import * as THREE from 'three';
import { ParticleRenderer, Shape } from './ParticleRenderer';
import type { BabylonParticleSim } from '../rendering/babylon/BabylonParticleSim';
import { rng } from '../core/Random';

const colorCache = new Map<string, THREE.Color>();
export function col(hex: string): THREE.Color {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

type V3 = { x: number; y: number; z: number };

export class VFX {
  private emitAccum = new Map<string, number>();

  constructor(
    readonly particles: ParticleRenderer,
    readonly babylon: BabylonParticleSim,
  ) {}

  private get d(): number {
    return this.particles.density;
  }

  /** Emit `rate` particles per second from a continuous effect. */
  rate(key: string, rate: number, dt: number, fn: () => void): void {
    let acc = (this.emitAccum.get(key) ?? 0) + rate * dt * this.d;
    while (acc >= 1) {
      fn();
      acc -= 1;
    }
    this.emitAccum.set(key, acc);
  }

  splash(p: V3, color: string, count = 14, power = 1): void {
    const c = col(color);
    const light = col('#ffffff');
    const n = Math.round(count * this.d);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(0.6, 1.6) * power;
      this.particles.spawn({
        x: p.x + Math.cos(a) * 0.05,
        y: p.y,
        z: p.z + Math.sin(a) * 0.05,
        vx: Math.cos(a) * s * 0.6,
        vy: rng.range(1.4, 2.6) * power,
        vz: Math.sin(a) * s * 0.6,
        life: rng.range(0.4, 0.7),
        size0: rng.range(0.025, 0.045),
        size1: 0.015,
        color0: rng.chance(0.25) ? light : c,
        color1: c,
        alpha0: 1,
        alpha1: 0.8,
        gravity: -9,
        shape: Shape.SQUARE,
      });
    }
  }

  bubble(p: V3, radius: number, color: string, big = false): void {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * radius;
    this.particles.spawn({
      x: p.x + Math.cos(a) * r,
      y: p.y + 0.01,
      z: p.z + Math.sin(a) * r,
      vy: rng.range(0.05, 0.2),
      life: rng.range(0.35, 0.9),
      size0: big ? rng.range(0.07, 0.11) : rng.range(0.03, 0.06),
      size1: big ? 0.13 : 0.07,
      color0: col(color),
      color1: col('#ffffff'),
      alpha0: 0.95,
      alpha1: 0.2,
      shape: Shape.RING,
    });
  }

  steam(p: V3, radius: number, amount = 1, color = '#e8eef8'): void {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * radius;
    this.particles.spawn({
      x: p.x + Math.cos(a) * r,
      y: p.y,
      z: p.z + Math.sin(a) * r,
      vx: rng.range(-0.05, 0.05),
      vy: rng.range(0.35, 0.7) * (0.7 + amount * 0.3),
      vz: rng.range(-0.05, 0.05),
      life: rng.range(1.2, 2.2),
      size0: rng.range(0.08, 0.13),
      size1: rng.range(0.3, 0.45),
      color0: col(color),
      color1: col('#b8c2d8'),
      alpha0: 0.55 * Math.min(1, amount),
      alpha1: 0,
      drag: 0.4,
      wobble: 0.02,
      shape: Shape.SOFT,
    });
  }

  /** Low, slow ground mist (Dark Fantasy). */
  mist(p: V3, color = '#8a8aa0'): void {
    this.particles.spawn({
      x: p.x,
      y: p.y,
      z: p.z,
      vx: rng.range(-0.12, 0.12),
      vy: rng.range(0, 0.03),
      vz: rng.range(-0.08, 0.08),
      life: rng.range(5, 8),
      size0: rng.range(0.5, 0.8),
      size1: rng.range(1.2, 1.8),
      color0: col(color),
      color1: col('#3a3a4a'),
      alpha0: 0.14,
      alpha1: 0,
      shape: Shape.SOFT,
    });
  }

  smoke(p: V3, color = '#3a3040', amount = 1, size = 1): void {
    const n = Math.max(1, Math.round(amount * this.d));
    for (let i = 0; i < n; i++) {
      this.particles.spawn({
        x: p.x + rng.range(-0.08, 0.08) * size,
        y: p.y,
        z: p.z + rng.range(-0.08, 0.08) * size,
        vx: rng.range(-0.15, 0.15),
        vy: rng.range(0.3, 0.8),
        vz: rng.range(-0.15, 0.15),
        life: rng.range(1.4, 2.8),
        size0: 0.12 * size,
        size1: 0.42 * size,
        color0: col(color),
        color1: col('#262b44'),
        alpha0: 0.75,
        alpha1: 0,
        drag: 0.5,
        wobble: 0.03,
        shape: Shape.SOFT,
      });
    }
  }

  poisonCloud(p: V3, amount = 1): void {
    const n = Math.max(1, Math.round(6 * amount * this.d));
    for (let i = 0; i < n; i++) {
      this.particles.spawn({
        x: p.x + rng.range(-0.25, 0.25),
        y: p.y + rng.range(0, 0.1),
        z: p.z + rng.range(-0.25, 0.25),
        vx: rng.range(-0.2, 0.2),
        vy: rng.range(0.1, 0.35),
        vz: rng.range(-0.2, 0.2),
        life: rng.range(2, 3.5),
        size0: 0.18,
        size1: 0.55,
        color0: col('#63c74d'),
        color1: col('#265c42'),
        alpha0: 0.6,
        alpha1: 0,
        drag: 0.6,
        wobble: 0.04,
        shape: Shape.SOFT,
      });
    }
  }

  magic(p: V3, color: string, count = 10, spread = 0.3, up = 0.6): void {
    const c = col(color);
    const n = Math.round(count * this.d);
    for (let i = 0; i < n; i++) {
      this.particles.spawn({
        x: p.x + rng.range(-spread, spread),
        y: p.y + rng.range(0, 0.1),
        z: p.z + rng.range(-spread, spread),
        vx: rng.range(-0.2, 0.2),
        vy: rng.range(0.2, 0.6) + up,
        vz: rng.range(-0.2, 0.2),
        life: rng.range(0.7, 1.5),
        size0: rng.range(0.03, 0.05),
        size1: 0.01,
        color0: col('#ffffff'),
        color1: c,
        alpha0: 1,
        alpha1: 0,
        drag: 0.8,
        wobble: 0.03,
        additive: true,
        shape: rng.chance(0.4) ? Shape.SPARKLE : Shape.SQUARE,
      });
    }
  }

  stars(p: V3, color = '#fee761', count = 26): void {
    const n = Math.round(count * this.d);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const e = rng.range(-0.3, 1);
      const s = rng.range(1.2, 2.6);
      this.particles.spawn({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: Math.cos(a) * s,
        vy: e * s + 0.8,
        vz: Math.sin(a) * s,
        life: rng.range(0.8, 1.4),
        size0: rng.range(0.06, 0.1),
        size1: 0.02,
        color0: col('#ffffff'),
        color1: col(color),
        alpha0: 1,
        alpha1: 0,
        drag: 2.2,
        gravity: -1,
        additive: true,
        shape: Shape.SPARKLE,
      });
    }
  }

  runes(p: V3, color: string, count = 4, radius = 0.7): void {
    const n = Math.max(1, Math.round(count * this.d));
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      this.particles.spawn({
        x: p.x + Math.cos(a) * radius,
        y: p.y + rng.range(0, 0.2),
        z: p.z + Math.sin(a) * radius,
        vx: -Math.sin(a) * 0.15,
        vy: rng.range(0.25, 0.5),
        vz: Math.cos(a) * 0.15,
        life: rng.range(1.4, 2.4),
        size0: 0.1,
        size1: 0.12,
        color0: col(color),
        color1: col('#ffffff'),
        alpha0: 0.95,
        alpha1: 0,
        additive: true,
        shape: Shape.RUNE + rng.int(0, 7),
      });
    }
  }

  puff(p: V3, color = '#e8e0f8', count = 24, size = 1): void {
    const n = Math.round(count * this.d);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const e = rng.range(-0.2, 1);
      const s = rng.range(0.6, 1.4) * size;
      this.particles.spawn({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: Math.cos(a) * s,
        vy: e * s * 0.8,
        vz: Math.sin(a) * s,
        life: rng.range(0.6, 1.1),
        size0: 0.16 * size,
        size1: 0.3 * size,
        color0: col(color),
        color1: col('#8b9bb4'),
        alpha0: 0.95,
        alpha1: 0,
        drag: 3,
        shape: Shape.SOFT,
      });
    }
  }

  dust(p: V3, color = '#b8a88a', count = 6): void {
    const n = Math.round(count * this.d);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      this.particles.spawn({
        x: p.x,
        y: p.y + 0.02,
        z: p.z,
        vx: Math.cos(a) * rng.range(0.3, 0.8),
        vy: rng.range(0.1, 0.4),
        vz: Math.sin(a) * rng.range(0.3, 0.8),
        life: rng.range(0.4, 0.8),
        size0: 0.05,
        size1: 0.12,
        color0: col(color),
        alpha0: 0.6,
        alpha1: 0,
        drag: 4,
        shape: Shape.SOFT,
      });
    }
  }

  chips(p: V3, color: string, count = 10, power = 1): void {
    const n = Math.round(count * this.d);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(0.8, 2) * power;
      this.particles.spawn({
        x: p.x,
        y: p.y + 0.02,
        z: p.z,
        vx: Math.cos(a) * s,
        vy: rng.range(1, 2.5) * power,
        vz: Math.sin(a) * s,
        life: rng.range(0.35, 0.7),
        size0: rng.range(0.02, 0.035),
        color0: col(color),
        alpha0: 1,
        alpha1: 1,
        gravity: -9.8,
        shape: Shape.SQUARE,
      });
    }
  }

  powder(p: V3, color: string, count = 12): void {
    const n = Math.round(count * this.d);
    for (let i = 0; i < n; i++) {
      this.particles.spawn({
        x: p.x + rng.range(-0.05, 0.05),
        y: p.y,
        z: p.z + rng.range(-0.05, 0.05),
        vx: rng.range(-0.2, 0.2),
        vy: rng.range(-0.2, 0.3),
        vz: rng.range(-0.2, 0.2),
        life: rng.range(0.5, 1.1),
        size0: 0.02,
        size1: 0.05,
        color0: col(color),
        alpha0: 0.9,
        alpha1: 0,
        gravity: -1.5,
        drag: 1.5,
        shape: Shape.SOFT,
      });
    }
  }

  drip(p: V3, color: string, v: V3 = { x: 0, y: 0, z: 0 }): void {
    this.particles.spawn({
      x: p.x + rng.range(-0.02, 0.02),
      y: p.y,
      z: p.z + rng.range(-0.02, 0.02),
      vx: v.x + rng.range(-0.1, 0.1),
      vy: v.y,
      vz: v.z + rng.range(-0.1, 0.1),
      life: 0.6,
      size0: rng.range(0.035, 0.05),
      size1: 0.03,
      color0: col(color),
      color1: col('#ffffff'),
      alpha0: 1,
      alpha1: 0.9,
      gravity: -9,
      shape: Shape.SQUARE,
    });
  }

  mote(p: V3, color: string, radius: number): void {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * radius;
    this.particles.spawn({
      x: p.x + Math.cos(a) * r,
      y: p.y,
      z: p.z + Math.sin(a) * r,
      vx: rng.range(-0.05, 0.05),
      vy: rng.range(0.25, 0.55),
      vz: rng.range(-0.05, 0.05),
      life: rng.range(1, 1.8),
      size0: rng.range(0.025, 0.04),
      size1: 0.01,
      color0: col(color),
      color1: col('#ffffff'),
      alpha0: 1,
      alpha1: 0,
      wobble: 0.015,
      additive: true,
      shape: Shape.SQUARE,
    });
  }

  swirl(center: V3, radius: number, t: number, color: string): void {
    const a = t * 6 + rng.range(0, Math.PI * 2);
    const r = radius * rng.range(0.3, 1);
    this.particles.spawn({
      x: center.x + Math.cos(a) * r,
      y: center.y + rng.range(0, 0.4),
      z: center.z + Math.sin(a) * r,
      vx: -Math.sin(a) * 2.2,
      vy: rng.range(0.6, 1.6),
      vz: Math.cos(a) * 2.2,
      life: rng.range(0.5, 1),
      size0: 0.05,
      size1: 0.02,
      color0: col('#ffffff'),
      color1: col(color),
      alpha0: 1,
      alpha1: 0,
      drag: 1.2,
      additive: true,
      shape: rng.chance(0.3) ? Shape.RUNE + rng.int(0, 7) : Shape.SPARKLE,
    });
  }

  heartBurst(p: V3, color = '#f6757a'): void {
    this.stars(p, color, 14);
  }

  // Babylon-simulated effects ------------------------------------------------

  explosion(p: V3, power = 1, tint = '#feae34'): void {
    this.babylon.explosion(p.x, p.y, p.z, power, tint);
    this.stars(p, tint, 12);
  }

  sparks(p: V3, count = 24, dir: [number, number, number] = [0, 1, 0], spread = 0.8, color = '#fee761'): void {
    this.babylon.sparks(p.x, p.y, p.z, count, dir, spread, color);
  }

  flare(p: V3, color = '#f77622', power = 1): void {
    this.babylon.flare(p.x, p.y, p.z, color, power);
  }
}
