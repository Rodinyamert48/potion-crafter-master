// First-person walking in the open world. The body is a Havok character
// controller (Babylon.js PhysicsCharacterController: a capsule that slides
// along the terrain mesh, steps over pebbles, refuses steep hills and is
// stopped by trees, rocks and walls); the Three.js camera sits at eye height
// on top of it and turns with the mouse.

import * as THREE from 'three';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { CharacterSupportedState, PhysicsCharacterController } from '@babylonjs/core/Physics/v2/characterController.js';
import { clamp } from '../../core/math';

export interface MoveInput {
  forward: number;
  right: number;
  sprint: boolean;
  jump: boolean;
}

const HEIGHT = 1.8;
const RADIUS = 0.34;
const EYE = 1.62;
const WALK = 4.4;
const RUN = 7.2;
const JUMP = 5.4;
const GRAVITY = new Vector3(0, -17, 0);
const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

export class FpsController {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0;
  private readonly cc: PhysicsCharacterController;
  /** Feet position, interpolated between physics steps. */
  readonly feet = new THREE.Vector3();
  private readonly prev = new THREE.Vector3();
  private readonly curr = new THREE.Vector3();
  onGround = true;
  /** Horizontal speed (m/s). */
  speed = 0;
  sprinting = false;
  /** Slowdowns from water, nettles… (1 = normal). */
  speedMul = 1;
  private bobT = 0;
  private shakeT = 0;
  private landed = 0;
  private wasOnGround = true;
  /** Seconds since take-off during which ground contact is ignored. */
  private jumpT = 0;
  /** Called with the fall speed when landing after a jump or a drop. */
  onLand: ((impact: number) => void) | null = null;

  constructor(scene: Scene, x: number, y: number, z: number) {
    this.camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.08, 190);
    this.camera.rotation.order = 'YXZ';
    this.cc = new PhysicsCharacterController(new Vector3(x, y + HEIGHT / 2, z), { capsuleHeight: HEIGHT, capsuleRadius: RADIUS }, scene);
    this.cc.maxSlopeCosine = Math.cos((46 * Math.PI) / 180);
    this.cc.maxStepHeight = 0.45;
    this.cc.keepDistance = 0.04;
    this.curr.set(x, y, z);
    this.prev.copy(this.curr);
    this.feet.copy(this.curr);
  }

  teleport(x: number, y: number, z: number): void {
    this.cc.setPosition(new Vector3(x, y + HEIGHT / 2 + 0.05, z));
    this.cc.setVelocity(new Vector3(0, 0, 0));
    this.curr.set(x, y, z);
    this.prev.copy(this.curr);
    this.feet.copy(this.curr);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -1.45, 1.45);
  }

  /** Face a point on the ground. */
  faceTowards(x: number, z: number): void {
    this.yaw = Math.atan2(-(x - this.curr.x), -(z - this.curr.z));
  }

  shake(amount: number): void {
    this.shakeT = Math.max(this.shakeT, amount);
  }

  /** Feet position after the last physics step (not interpolated). */
  get physicsFeet(): THREE.Vector3 {
    return this.curr;
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  fixed(dt: number, input: MoveInput): void {
    this.prev.copy(this.curr);
    const cc = this.cc;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    let mx = fx * input.forward + rx * input.right;
    let mz = fz * input.forward + rz * input.right;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    this.sprinting = input.sprint && input.forward > 0.2;
    const speed = (this.sprinting ? RUN : WALK) * this.speedMul;
    const desired = new Vector3(mx * speed, 0, mz * speed);
    const forwardWorld = new Vector3(fx, 0, fz);

    const support = cc.checkSupport(dt, DOWN);
    const cur = cc.getVelocity();
    let out: Vector3;
    // Right after take-off the capsule still touches the ground; treat it as
    // airborne for a moment so the jump is not flattened.
    this.jumpT = Math.max(0, this.jumpT - dt);
    const grounded = support.supportedState === CharacterSupportedState.SUPPORTED && this.jumpT <= 0;
    if (grounded && input.jump) {
      out = cur.clone();
      out.y = JUMP;
      this.jumpT = 0.18;
    } else if (grounded) {
      out = cc.calculateMovement(dt, forwardWorld, support.averageSurfaceNormal, cur, support.averageSurfaceVelocity, desired, UP);
      // Keep the speed horizontal on slopes (from Babylon's character controller sample).
      out.subtractInPlace(support.averageSurfaceVelocity);
      if (out.dot(UP) > 1e-3) {
        const velLen = out.length();
        out.normalizeFromLength(velLen);
        const horizLen = velLen / Math.max(0.2, support.averageSurfaceNormal.dot(UP));
        const c = support.averageSurfaceNormal.cross(out);
        out = c.cross(UP);
        out.scaleInPlace(horizLen);
      }
      out.addInPlace(support.averageSurfaceVelocity);
    } else {
      out = cc.calculateMovement(dt, forwardWorld, UP, cur, Vector3.ZeroReadOnly, desired.scale(0.85), UP);
      out.addInPlace(UP.scale(-out.dot(UP)));
      out.addInPlace(UP.scale(cur.dot(UP)));
      out.addInPlace(GRAVITY.scale(dt));
    }
    cc.setVelocity(out);
    cc.integrate(dt, support, GRAVITY);
    const p = cc.getPosition();
    this.curr.set(p.x, p.y - HEIGHT / 2, p.z);
    this.onGround = grounded;
    this.speed = Math.hypot(out.x, out.z);
    if (grounded && !this.wasOnGround && cur.y < -2) {
      this.landed = Math.min(1, -cur.y / 12);
      this.onLand?.(-cur.y);
    }
    this.wasOnGround = grounded;
  }

  /** Per render frame: interpolate and place the camera. */
  update(dt: number, alpha: number, time: number): void {
    this.feet.lerpVectors(this.prev, this.curr, clamp(alpha, 0, 1));
    const moving = this.onGround && this.speed > 0.5;
    if (moving) this.bobT += dt * (this.sprinting ? 12 : 8.5);
    const bob = moving ? Math.sin(this.bobT) * (this.sprinting ? 0.055 : 0.035) : 0;
    this.landed = Math.max(0, this.landed - dt * 3);
    this.shakeT = Math.max(0, this.shakeT - dt * 1.6);
    const sh = this.shakeT * this.shakeT;
    const cam = this.camera;
    cam.position.set(this.feet.x, this.feet.y + EYE + bob - this.landed * 0.18, this.feet.z);
    cam.rotation.set(this.pitch + (sh ? Math.sin(time * 41) * 0.03 * sh : 0), this.yaw + (sh ? Math.sin(time * 37) * 0.03 * sh : 0), moving ? Math.sin(this.bobT * 0.5) * 0.004 : 0);
    // A slightly wider view while sprinting.
    const fov = this.sprinting && moving ? 78 : 72;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 6);
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  /** True when the step just played a footfall (for footstep sounds). */
  footstep(): boolean {
    const phase = Math.floor(this.bobT / Math.PI);
    if (phase !== this.lastStep) {
      this.lastStep = phase;
      return this.onGround && this.speed > 0.5;
    }
    return false;
  }
  private lastStep = 0;

  dispose(): void {
    this.cc.dispose();
  }
}
