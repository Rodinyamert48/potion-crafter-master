// 2.5D angled camera: slightly tilted perspective that looks down into the
// shop like a diorama. Supports smooth zoom, panning, a small yaw range,
// mouse parallax, focus transitions between stations and trauma-based shake.

import * as THREE from 'three';
import { clamp, damp, dampAngle, noise1 } from '../../core/math';

export interface CameraPreset {
  focus: [number, number, number];
  distance: number;
  yaw?: number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly focus = new THREE.Vector3(0.4, 0.7, -0.6);
  readonly targetFocus = this.focus.clone();
  distance = 11.5;
  targetDistance = 11.5;
  yaw = 0.1;
  targetYaw = 0.1;
  /** Extra pitch offset (radians) for cinematic moves. */
  pitchOffset = 0;
  minDistance = 4.2;
  maxDistance = 14;
  readonly bounds = { minX: -4.2, maxX: 4.2, minZ: -3, maxZ: 2.2 };
  /** Normalized pointer position for parallax (-1..1). */
  readonly parallax = new THREE.Vector2();
  parallaxStrength = 0.22;
  shakeEnabled = true;
  private trauma = 0;
  private time = 0;
  /** Cinematic drift used behind the title screen. */
  drift = false;

  private readonly tmp = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.3, 60);
    this.update(0);
  }

  get pitch(): number {
    const t = (this.distance - this.minDistance) / (this.maxDistance - this.minDistance);
    return 0.5 + clamp(t, 0, 1) * 0.17 + this.pitchOffset;
  }

  setPreset(p: CameraPreset, instant = false): void {
    this.targetFocus.set(...p.focus);
    this.targetDistance = p.distance;
    if (p.yaw !== undefined) this.targetYaw = p.yaw;
    if (instant) {
      this.focus.copy(this.targetFocus);
      this.distance = this.targetDistance;
      this.yaw = this.targetYaw;
    }
  }

  focusOn(point: THREE.Vector3, distance?: number): void {
    this.targetFocus.copy(point);
    if (distance !== undefined) this.targetDistance = distance;
  }

  zoom(delta: number): void {
    this.targetDistance = clamp(this.targetDistance * Math.exp(delta), this.minDistance, this.maxDistance);
  }

  /** Pan in screen-aligned ground space. */
  pan(dx: number, dz: number): void {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    this.targetFocus.x += dx * c + dz * s;
    this.targetFocus.z += -dx * s + dz * c;
  }

  rotate(delta: number): void {
    this.targetYaw = clamp(this.targetYaw + delta, -0.6, 0.6);
  }

  shake(amount: number): void {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.drift) {
      this.targetYaw = Math.sin(this.time * 0.07) * 0.35;
      this.targetDistance = 10.5 + Math.sin(this.time * 0.05) * 1.5;
    }
    const b = this.bounds;
    this.targetFocus.x = clamp(this.targetFocus.x, b.minX, b.maxX);
    this.targetFocus.z = clamp(this.targetFocus.z, b.minZ, b.maxZ);
    this.focus.x = damp(this.focus.x, this.targetFocus.x, 6, dt);
    this.focus.y = damp(this.focus.y, this.targetFocus.y, 6, dt);
    this.focus.z = damp(this.focus.z, this.targetFocus.z, 6, dt);
    this.distance = damp(this.distance, this.targetDistance, 7, dt);
    this.yaw = dampAngle(this.yaw, this.targetYaw, 6, dt);

    const pitch = this.pitch;
    const cp = Math.cos(pitch);
    const cam = this.camera;
    cam.position.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.distance,
      this.focus.y + Math.sin(pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * cp * this.distance,
    );

    // Parallax: nudge the eye (not the look-at point) so near objects move more.
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.up.set(0, 1, 0);
    const k = this.parallaxStrength * (this.distance / 10);
    cam.position.addScaledVector(this.right, this.parallax.x * k);
    cam.position.addScaledVector(this.up, this.parallax.y * k * 0.6);

    // Shake
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma;
    if (s > 0) {
      const t = this.time * 22;
      cam.position.x += (noise1(t, 1) - 0.5) * 0.6 * s;
      cam.position.y += (noise1(t, 2) - 0.5) * 0.45 * s;
      cam.position.z += (noise1(t, 3) - 0.5) * 0.6 * s;
    }
    this.tmp.copy(this.focus);
    cam.lookAt(this.tmp);
    if (s > 0) cam.rotateZ((noise1(this.time * 18, 4) - 0.5) * 0.06 * s);
    cam.updateMatrixWorld();
  }
}
