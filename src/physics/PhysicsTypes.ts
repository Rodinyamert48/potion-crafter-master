// Engine-agnostic physics contract. Gameplay code only sees these types; the
// Babylon.js/Havok implementation lives behind them so the rendering engine
// (Three.js) and the physics engine (Babylon.js) never touch each other.

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type ShapeDesc =
  | { type: 'box'; size: [number, number, number]; offset?: Vec3Like; rotation?: QuatLike }
  | { type: 'sphere'; radius: number; offset?: Vec3Like }
  | { type: 'cylinder'; radius: number; height: number; offset?: Vec3Like; rotation?: QuatLike }
  | { type: 'capsule'; radius: number; height: number; offset?: Vec3Like }
  | { type: 'compound'; children: ShapeDesc[] };

export type MotionKind = 'static' | 'dynamic' | 'kinematic';

/** Collision group bits. */
export const CG = {
  STATIC: 1,
  ITEM: 2,
  DEBRIS: 4,
  CHARACTER: 8,
  TOOL: 16,
  ALL: 0xffff,
} as const;

export interface BodyDesc {
  shape: ShapeDesc;
  motion: MotionKind;
  /** kg – ignored for static bodies. */
  mass?: number;
  position: Vec3Like;
  rotation?: QuatLike;
  friction?: number;
  restitution?: number;
  linearDamping?: number;
  angularDamping?: number;
  /** Receive collision callbacks (impacts, breakage…). */
  collisionEvents?: boolean;
  group?: number;
  mask?: number;
  startAsleep?: boolean;
  userData?: unknown;
}

export interface BodyHandle {
  readonly id: number;
  userData: unknown;
  readonly motion: MotionKind;
  readonly mass: number;
  readonly alive: boolean;
  getPosition<T extends Vec3Like>(out: T): T;
  getRotation<T extends QuatLike>(out: T): T;
  getLinearVelocity<T extends Vec3Like>(out: T): T;
  getAngularVelocity<T extends Vec3Like>(out: T): T;
  setLinearVelocity(v: Vec3Like): void;
  setAngularVelocity(v: Vec3Like): void;
  applyImpulse(impulse: Vec3Like, point?: Vec3Like): void;
  applyForce(force: Vec3Like, point?: Vec3Like): void;
  setGravityFactor(f: number): void;
  setDamping(linear: number, angular: number): void;
  setMotion(kind: MotionKind): void;
  /** Instantly move the body (resets nothing else). */
  teleport(position: Vec3Like, rotation?: QuatLike): void;
  /** Kinematic bodies: move toward this transform over the next step (pushes others). */
  setKinematicTarget(position: Vec3Like, rotation: QuatLike): void;
  setCollisionFilter(group: number, mask: number): void;
}

export interface CollisionInfo {
  a: BodyHandle;
  b: BodyHandle;
  point: Vec3Like;
  normal: Vec3Like;
  /** Impulse magnitude applied by the solver (N·s). */
  impulse: number;
  started: boolean;
}

export interface RaycastHit {
  body: BodyHandle | null;
  point: Vec3Like;
  normal: Vec3Like;
  distance: number;
}

export interface PhysicsWorld {
  createBody(desc: BodyDesc): BodyHandle;
  removeBody(body: BodyHandle): void;
  step(dt: number): void;
  raycast(from: Vec3Like, to: Vec3Like, mask?: number): RaycastHit | null;
  /** Radial impulse on every dynamic body in range. */
  explode(origin: Vec3Like, radius: number, strength: number): void;
  onCollision(fn: (c: CollisionInfo) => void): void;
  forEachDynamic(fn: (b: BodyHandle) => void): void;
  /** Ball joint that keeps `child` hanging from a static point. */
  hang(child: BodyHandle, anchor: Vec3Like, pivotOnChild: Vec3Like): { remove(): void };
  readonly bodyCount: number;
}
