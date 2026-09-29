// Camera-aware cutaway walls, like a dollhouse: a wall the camera looks at
// from inside the room stands at full height, a wall between the camera and
// the room drops to a low stub so it never hides the shop. Turning the
// camera (Q/E) swaps which side walls are up.

import type * as THREE from 'three';
import type { Entity } from './Entity';
import { damp } from '../core/math';

interface Part {
  obj: THREE.Object3D;
  /** Scale kept when cut (0 hides the part). Parts scale from the floor. */
  min: number;
}

export class CutWall {
  readonly parts: Part[] = [];
  readonly attached: THREE.Object3D[] = [];
  readonly entities: Entity[] = [];
  /** 1 = standing, 0 = cut down. */
  level = 1;
  private target = 1;

  constructor(
    /** A point on the wall's inner face and the normal pointing into the room. */
    readonly px: number,
    readonly pz: number,
    readonly nx: number,
    readonly nz: number,
  ) {}

  /** A wall mesh; `min` is the scale left standing as the stub. */
  part(obj: THREE.Object3D, min = 0): this {
    this.parts.push({ obj, min });
    return this;
  }

  /** Things hung on the wall: hidden (and not clickable) while it is cut. */
  attach(obj: THREE.Object3D, entity?: Entity): this {
    this.attached.push(obj);
    if (entity) this.entities.push(entity);
    return this;
  }

  get standing(): boolean {
    return this.target === 1;
  }

  update(cam: THREE.Vector3, dt: number, instant = false): void {
    // Signed distance of the camera from the wall plane (+ = inside).
    const d = (cam.x - this.px) * this.nx + (cam.z - this.pz) * this.nz;
    if (d > 0.35) this.target = 1;
    else if (d < -0.35) this.target = 0;
    this.level = instant ? this.target : damp(this.level, this.target, 9, dt);
    if (Math.abs(this.level - this.target) < 0.002) this.level = this.target;
    const k = this.level;
    for (const p of this.parts) {
      const s = p.min + (1 - p.min) * k;
      p.obj.scale.y = Math.max(0.001, s);
      p.obj.visible = s > 0.03;
    }
    const show = k > 0.65;
    for (const o of this.attached) o.visible = show;
    for (const e of this.entities) e.interactive = show;
  }
}

export class Cutaway {
  readonly walls: CutWall[] = [];
  private primed = false;

  wall(px: number, pz: number, nx: number, nz: number): CutWall {
    const w = new CutWall(px, pz, nx, nz);
    this.walls.push(w);
    return w;
  }

  update(cam: THREE.Vector3, dt: number): void {
    for (const w of this.walls) w.update(cam, dt, !this.primed);
    this.primed = true;
  }
}
