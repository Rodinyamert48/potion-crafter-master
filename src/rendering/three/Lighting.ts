// Scene lighting: window sun/moon on a day curve, the hearth fire, the
// cauldron's potion glow and flickering candles. A "chaos" level makes the
// lights stutter when an experiment goes wrong.

import * as THREE from 'three';
import { clamp, lerp, noise1 } from '../../core/math';

interface SkyKey {
  h: number;
  sun: string;
  sunI: number;
  sky: string;
  ground: string;
  hemiI: number;
  ambient: number;
}

const DAY: SkyKey[] = [
  { h: 0, sun: '#6f8fd8', sunI: 0.55, sky: '#3a4478', ground: '#1a1420', hemiI: 0.7, ambient: 0.16 },
  { h: 5.5, sun: '#6f8fd8', sunI: 0.5, sky: '#3a4478', ground: '#1a1420', hemiI: 0.7, ambient: 0.16 },
  { h: 7, sun: '#ffb38a', sunI: 1.3, sky: '#a8a8e0', ground: '#4a3040', hemiI: 1.1, ambient: 0.24 },
  { h: 9, sun: '#ffe3b0', sunI: 2.8, sky: '#c4c8f0', ground: '#5a3a4a', hemiI: 1.35, ambient: 0.3 },
  { h: 13, sun: '#fff4dc', sunI: 3.2, sky: '#cad8f8', ground: '#5f3e4a', hemiI: 1.45, ambient: 0.32 },
  { h: 17, sun: '#ffd08a', sunI: 2.6, sky: '#cdbfe6', ground: '#5a3a4a', hemiI: 1.3, ambient: 0.28 },
  { h: 19, sun: '#ff8a5a', sunI: 1.7, sky: '#b87aa8', ground: '#4a3040', hemiI: 1.05, ambient: 0.22 },
  { h: 20.5, sun: '#9a6ab8', sunI: 0.8, sky: '#5a4a8a', ground: '#2a1c2a', hemiI: 0.8, ambient: 0.18 },
  { h: 22, sun: '#6f8fd8', sunI: 0.55, sky: '#3a4478', ground: '#1a1420', hemiI: 0.7, ambient: 0.16 },
  { h: 24, sun: '#6f8fd8', sunI: 0.55, sky: '#3a4478', ground: '#1a1420', hemiI: 0.7, ambient: 0.16 },
];

interface Flicker {
  light: THREE.PointLight;
  base: number;
  seed: number;
  speed: number;
  /** Optional mesh (flame) scaled with the flicker. */
  flame?: THREE.Object3D;
}

export class Lighting {
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  readonly sun: THREE.DirectionalLight;
  readonly hearth: THREE.PointLight;
  readonly glow: THREE.PointLight;
  private readonly candles: Flicker[] = [];
  private readonly glowColor = new THREE.Color('#2ce8f5');
  private glowStrength = 0;
  private hearthLevel = 0;
  chaos = 0;
  /** Darkness essence in the brew dims the room a little. */
  gloom = 0;
  hour = 9;
  private time = 0;
  private readonly tmpA = new THREE.Color();
  private readonly tmpB = new THREE.Color();

  constructor(private readonly scene: THREE.Scene, shadows: boolean) {
    this.hemi = new THREE.HemisphereLight('#bcd0ee', '#4a3232', 0.8);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#8a7fa8', 0.2);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight('#fff4dc', 2.5);
    this.sun.position.set(-4, 7, -9);
    this.sun.target.position.set(0.5, 0, 0.5);
    scene.add(this.sun, this.sun.target);
    this.sun.castShadow = shadows;
    const sc = this.sun.shadow.camera;
    sc.left = -8;
    sc.right = 8;
    sc.top = 8;
    sc.bottom = -8;
    sc.near = 1;
    sc.far = 30;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;

    this.hearth = new THREE.PointLight('#ff8a3d', 0, 10, 1.6);
    this.hearth.position.set(0, 0.42, -0.1);
    this.hearth.castShadow = shadows;
    this.hearth.shadow.mapSize.set(512, 512);
    this.hearth.shadow.bias = -0.004;
    this.hearth.shadow.camera.near = 0.1;
    this.hearth.shadow.camera.far = 10;
    scene.add(this.hearth);

    this.glow = new THREE.PointLight('#2ce8f5', 0, 6, 1.7);
    this.glow.position.set(0, 1.75, -0.6);
    scene.add(this.glow);
  }

  addCandle(position: THREE.Vector3, intensity = 4, flame?: THREE.Object3D, color = '#ffb35a', distance = 5): THREE.PointLight {
    const light = new THREE.PointLight(color, intensity, distance, 1.8);
    light.position.copy(position);
    this.scene.add(light);
    this.candles.push({ light, base: intensity, seed: Math.random() * 100, speed: 6 + Math.random() * 4, flame });
    return light;
  }

  /** 'off' · 'sun' (directional only) · 'all' (sun + hearth cube shadow). */
  setShadows(mode: 'off' | 'sun' | 'all'): void {
    this.sun.castShadow = mode !== 'off';
    this.hearth.castShadow = mode === 'all';
    // Shadow maps are refreshed on a staggered schedule by the renderer.
    this.sun.shadow.autoUpdate = false;
    this.hearth.shadow.autoUpdate = false;
    this.sun.shadow.needsUpdate = true;
    this.hearth.shadow.needsUpdate = true;
  }

  private shadowFrame = 0;

  /** Refresh shadow maps at a reduced rate: most of the shop is static and a
   *  one-frame lag on moving items is invisible at this resolution. */
  scheduleShadows(): void {
    const f = this.shadowFrame++;
    if (f % 2 === 0) this.sun.shadow.needsUpdate = true;
    if (f % 3 === 1 && this.hearth.intensity > 0.02) this.hearth.shadow.needsUpdate = true;
  }

  setGlow(color: THREE.ColorRepresentation, strength: number): void {
    this.glowColor.set(color);
    this.glowStrength = strength;
  }

  setHearth(level: number): void {
    this.hearthLevel = level;
  }

  get isNight(): boolean {
    return this.hour >= 20.5 || this.hour < 6;
  }

  /** 0 (full day) … 1 (full night). */
  get nightness(): number {
    const h = this.hour;
    if (h < 5.5 || h >= 22) return 1;
    if (h < 7.5) return 1 - (h - 5.5) / 2;
    if (h > 19) return clamp((h - 19) / 3, 0, 1);
    return 0;
  }

  update(dt: number): void {
    this.time += dt;
    // Day curve
    const h = ((this.hour % 24) + 24) % 24;
    let i = 0;
    while (i < DAY.length - 1 && DAY[i + 1].h <= h) i++;
    const a = DAY[i];
    const b = DAY[Math.min(DAY.length - 1, i + 1)];
    const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
    const chaosDim = this.chaos > 0 ? 1 - this.chaos * 0.35 * noise1(this.time * 9, 5) : 1;
    const gloom = 1 - this.gloom * 0.35;
    this.sun.color.copy(this.tmpA.set(a.sun)).lerp(this.tmpB.set(b.sun), t);
    this.sun.intensity = lerp(a.sunI, b.sunI, t) * gloom;
    this.hemi.color.copy(this.tmpA.set(a.sky)).lerp(this.tmpB.set(b.sky), t);
    this.hemi.groundColor.copy(this.tmpA.set(a.ground)).lerp(this.tmpB.set(b.ground), t);
    this.hemi.intensity = lerp(a.hemiI, b.hemiI, t) * gloom * chaosDim;
    this.ambient.intensity = lerp(a.ambient, b.ambient, t) * gloom;

    // Sun travels across the window during the day; the moon sits high at night.
    const dayT = clamp((h - 6) / 15, 0, 1);
    const night = this.nightness;
    this.sun.position.set(lerp(-7, 3, dayT) * (1 - night) + -2 * night, lerp(6, 9, Math.sin(dayT * Math.PI)) * (1 - night) + 9 * night, -9);

    // Hearth fire flicker
    const f = noise1(this.time * 7, 1) * 0.6 + noise1(this.time * 17, 2) * 0.4;
    // Soft knee: a roaring, over-stoked fire gets brighter but never floods the room.
    const lvl = this.hearthLevel;
    const fire = Math.min(lvl, 0.9) + Math.max(0, lvl - 0.9) * 0.35;
    this.hearth.intensity = fire * (6.5 + 4.5 * f) * (this.chaos > 0.2 ? 0.7 + 0.6 * noise1(this.time * 25, 3) : 1);
    this.hearth.color.setRGB(1, 0.5 + 0.12 * f, 0.22);

    // Potion glow breathes softly.
    this.glow.color.copy(this.glowColor);
    this.glow.intensity = this.glowStrength * (0.85 + 0.15 * Math.sin(this.time * 2.3)) * 5;

    for (const c of this.candles) {
      const n = noise1(this.time * c.speed, c.seed) * 0.7 + noise1(this.time * c.speed * 2.7, c.seed + 9) * 0.3;
      let k = 0.78 + 0.34 * n;
      if (this.chaos > 0.1) k *= 1 - this.chaos * 0.8 * (noise1(this.time * 30, c.seed + 3) > 0.55 ? 1 : 0);
      c.light.intensity = c.base * k * (0.45 + 0.55 * Math.max(night, 0.2));
      if (c.flame) c.flame.scale.setScalar(0.85 + 0.3 * n);
    }
  }
}
