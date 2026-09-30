// Registry of live entities: picking lookup, body → entity mapping,
// per-frame and fixed updates, and placement surfaces for held items.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { BodyHandle } from '../physics/PhysicsTypes';
import type { Entity } from './Entity';

export interface SurfaceInfo {
  /** Height offset added when hovering items above this surface. */
  hover?: number;
  /** Tag for special handling (cauldron, board, rack, counter…). */
  tag?: string;
}

export class World {
  readonly entities = new Map<number, Entity>();
  private readonly bodyMap = new Map<number, Entity>();
  /** Objects tested when the pointer looks for something to interact with. */
  readonly pickables: THREE.Object3D[] = [];
  /** Meshes held items can hover above. */
  readonly surfaces: THREE.Object3D[] = [];
  private pending: Entity[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  add<T extends Entity>(e: T, ctx: GameContext, parent: THREE.Object3D = this.scene): T {
    this.entities.set(e.id, e);
    if (!e.object.parent) parent.add(e.object);
    if (e.interactive) this.pickables.push(e.object);
    if (e.body) {
      this.bodyMap.set(e.body.id, e);
      // Dynamic bodies drive their object; kinematic ones are driven by it.
      if (e.body.motion === 'dynamic') ctx.sync.link(e.body, e.object);
    }
    return e;
  }

  /** Re-register a body after it was (re)created. */
  bindBody(e: Entity, body: BodyHandle, ctx: GameContext): void {
    if (e.body) this.bodyMap.delete(e.body.id);
    e.body = body;
    this.bodyMap.set(body.id, e);
    if (body.motion === 'dynamic') ctx.sync.link(body, e.object);
  }

  /** Remove at the end of the current update (safe during iteration). */
  remove(e: Entity): void {
    if (!e.alive) return;
    e.alive = false;
    this.pending.push(e);
  }

  flush(ctx: GameContext): void {
    if (this.pending.length === 0) return;
    for (const e of this.pending) {
      this.entities.delete(e.id);
      if (e.body) this.bodyMap.delete(e.body.id);
      const i = this.pickables.indexOf(e.object);
      if (i >= 0) this.pickables.splice(i, 1);
      e.dispose(ctx);
    }
    this.pending = [];
  }

  addSurface(obj: THREE.Object3D, info: SurfaceInfo = {}): void {
    obj.userData.surface = info;
    this.surfaces.push(obj);
  }

  removeSurface(obj: THREE.Object3D): void {
    const i = this.surfaces.indexOf(obj);
    if (i >= 0) this.surfaces.splice(i, 1);
  }

  entityFromObject(obj: THREE.Object3D | null): Entity | null {
    let o: THREE.Object3D | null = obj;
    while (o) {
      const id = o.userData.entityId as number | undefined;
      if (id !== undefined) {
        const e = this.entities.get(id);
        if (e) return e;
      }
      o = o.parent;
    }
    return null;
  }

  entityFromBody(body: BodyHandle): Entity | null {
    return this.bodyMap.get(body.id) ?? null;
  }

  ofKind<T extends Entity>(kind: string): T[] {
    const out: T[] = [];
    for (const e of this.entities.values()) if (e.kind === kind && e.alive) out.push(e as T);
    return out;
  }

  /** Online play wraps each entity's update (to route its side effects). */
  wrapUpdate: ((e: Entity, run: () => void) => void) | null = null;

  update(ctx: GameContext, dt: number): void {
    const wrap = this.wrapUpdate;
    for (const e of this.entities.values()) {
      if (!e.alive) continue;
      if (wrap) wrap(e, () => e.update(ctx, dt));
      else e.update(ctx, dt);
    }
    this.flush(ctx);
  }

  fixedUpdate(ctx: GameContext, dt: number): void {
    for (const e of this.entities.values()) if (e.alive) e.fixedUpdate(ctx, dt);
  }
}
