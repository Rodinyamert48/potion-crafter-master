// Base class for everything the player can see and touch in the world.
// An entity owns a Three.js object and optionally a physics body; the World
// keeps them registered for picking, updates and collisions.

import * as THREE from 'three';
import type { BodyHandle, Vec3Like } from '../physics/PhysicsTypes';
import type { GameContext } from '../core/GameContext';
import type { Grab } from './Interaction';

export interface HoverInfo {
  title: string;
  subtitle?: string;
  hint?: string;
  lines?: Array<{ text: string; color?: string; bar?: number }>;
}

export type CursorKind = 'default' | 'grab' | 'grabbing' | 'point' | 'stir' | 'no';

export interface SavedEntity {
  type: string;
  p: [number, number, number];
  q?: [number, number, number, number];
  [key: string]: unknown;
}

let nextEntityId = 1;

export abstract class Entity {
  readonly id = nextEntityId++;
  abstract readonly kind: string;
  readonly object: THREE.Object3D;
  body: BodyHandle | null = null;
  alive = true;
  /** Currently held by the player. */
  held = false;
  /** Participates in hover / press. */
  interactive = true;
  /** Picked up with the physics grab by default. */
  draggable = false;
  /** Vertical half extent, used to hover held items above surfaces. */
  halfHeight = 0.05;
  /** Rough horizontal radius (tool hits, drop zones). */
  radius = 0.06;
  /** Keep upright when held (bottles, buckets). */
  upright = false;
  /** Is the entity tiltable when held (pouring). */
  tiltable = false;
  /** While carried, only collide with the room (not other items or people),
   *  so carrying things around never snags. */
  ghostWhenHeld = false;
  /** Time spent resting (used for cleanup & sleep checks). */
  lifetime = 0;
  /** Online play: stable name for things host and guests both build themselves. */
  netKey: string | null = null;

  constructor(object?: THREE.Object3D) {
    this.object = object ?? new THREE.Group();
    this.object.userData.entityId = this.id;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  cursor(): CursorKind {
    return this.draggable ? 'grab' : 'point';
  }

  hover(_ctx: GameContext): HoverInfo | null {
    return null;
  }

  /** Pointer pressed on this entity. Return a grab to start an interaction. */
  press(ctx: GameContext, _hit: THREE.Intersection): Grab | null {
    if (this.draggable && this.body) return ctx.interaction.startPhysicsGrab(this);
    return null;
  }

  /** Secondary press: right click, or a long press on touch screens.
   *  Return true when handled. */
  altPress(_ctx: GameContext): boolean {
    return false;
  }

  update(_ctx: GameContext, _dt: number): void {}
  fixedUpdate(_ctx: GameContext, _dt: number): void {}

  /** Called while held with the physics grab (after target computation). */
  onHeld(_ctx: GameContext, _dt: number): void {}
  onPicked(_ctx: GameContext): void {}
  onReleased(_ctx: GameContext): void {}

  /** Physics impact with another body (other entity may be null for static geometry). */
  onImpact(_ctx: GameContext, _other: Entity | null, _impulse: number, _point: Vec3Like): void {}

  serialize(): SavedEntity | null {
    return null;
  }

  /** Online play: the little state guests' copies need to look the same
   *  (undefined: nothing to send). Must be plain JSON. */
  netState(): unknown {
    return undefined;
  }

  /** Online play (guest): take on the host's state from `netState`. */
  applyNetState(_ctx: GameContext, _s: unknown): void {}

  /** Release GPU/physics resources. The World calls this via `remove`. */
  dispose(ctx: GameContext): void {
    if (this.body) {
      ctx.sync.unlink(this.body);
      ctx.physics.removeBody(this.body);
      this.body = null;
    }
    this.object.removeFromParent();
  }
}

/** Collect every mesh under an object (for hover highlighting). */
export function meshesOf(obj: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });

/** An invisible, generously sized mesh that makes thin or tiny things easy
 *  to point at. Raycasts hit it; it never renders or gets outlined. */
export function pickProxy(geometry: THREE.BufferGeometry): THREE.Mesh {
  const m = new THREE.Mesh(geometry, proxyMaterial);
  m.userData.noHighlight = true;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}
