// Babylon.js (Havok) implementation of the PhysicsWorld contract.
// Each body is a Babylon TransformNode + PhysicsBody living in the headless
// Babylon scene. Transforms are read back by the PhysicsSync bridge.

import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {
  PhysicsShapeMesh,
  PhysicsShape,
  PhysicsShapeBox,
  PhysicsShapeCapsule,
  PhysicsShapeContainer,
  PhysicsShapeCylinder,
  PhysicsShapeSphere,
} from '@babylonjs/core/Physics/v2/physicsShape.js';
import { PhysicsMotionType, PhysicsPrestepType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { BallAndSocketConstraint } from '@babylonjs/core/Physics/v2/physicsConstraint.js';
import { PhysicsHelper } from '@babylonjs/core/Physics/physicsHelper.js';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import type { PhysicsEngine as PhysicsEngineV2 } from '@babylonjs/core/Physics/v2/physicsEngine.js';
import type { BabylonCore } from '../rendering/babylon/BabylonCore';
import {
  CG,
  type BodyDesc,
  type BodyHandle,
  type CollisionInfo,
  type MotionKind,
  type PhysicsWorld,
  type QuatLike,
  type RaycastHit,
  type ShapeDesc,
  type Vec3Like,
} from './PhysicsTypes';

const tmpV = new Vector3();
const tmpV2 = new Vector3();
const tmpQ = new Quaternion();

function motionToBabylon(m: MotionKind): PhysicsMotionType {
  return m === 'static' ? PhysicsMotionType.STATIC : m === 'kinematic' ? PhysicsMotionType.ANIMATED : PhysicsMotionType.DYNAMIC;
}

function shapeVolume(s: ShapeDesc): number {
  switch (s.type) {
    case 'box':
      return s.size[0] * s.size[1] * s.size[2];
    case 'sphere':
      return (4 / 3) * Math.PI * s.radius ** 3;
    case 'cylinder':
      return Math.PI * s.radius ** 2 * s.height;
    case 'capsule':
      return Math.PI * s.radius ** 2 * s.height + (4 / 3) * Math.PI * s.radius ** 3;
    case 'compound':
      return s.children.reduce((acc, c) => acc + shapeVolume(c), 0);
  }
}

class BabylonBody implements BodyHandle {
  userData: unknown;
  alive = true;
  motion: MotionKind;
  mass: number;

  constructor(
    readonly id: number,
    readonly node: TransformNode,
    readonly body: PhysicsBody,
    readonly shape: PhysicsShape,
    readonly plugin: HavokPlugin,
    desc: BodyDesc,
  ) {
    this.userData = desc.userData;
    this.motion = desc.motion;
    this.mass = desc.mass ?? 0;
  }

  getPosition<T extends Vec3Like>(out: T): T {
    const p = this.node.position;
    out.x = p.x;
    out.y = p.y;
    out.z = p.z;
    return out;
  }

  getRotation<T extends QuatLike>(out: T): T {
    const q = this.node.rotationQuaternion!;
    out.x = q.x;
    out.y = q.y;
    out.z = q.z;
    out.w = q.w;
    return out;
  }

  getLinearVelocity<T extends Vec3Like>(out: T): T {
    this.body.getLinearVelocityToRef(tmpV);
    out.x = tmpV.x;
    out.y = tmpV.y;
    out.z = tmpV.z;
    return out;
  }

  getAngularVelocity<T extends Vec3Like>(out: T): T {
    this.body.getAngularVelocityToRef(tmpV);
    out.x = tmpV.x;
    out.y = tmpV.y;
    out.z = tmpV.z;
    return out;
  }

  setLinearVelocity(v: Vec3Like): void {
    tmpV.set(v.x, v.y, v.z);
    this.body.setLinearVelocity(tmpV);
  }

  setAngularVelocity(v: Vec3Like): void {
    tmpV.set(v.x, v.y, v.z);
    this.body.setAngularVelocity(tmpV);
  }

  applyImpulse(impulse: Vec3Like, point?: Vec3Like): void {
    tmpV.set(impulse.x, impulse.y, impulse.z);
    if (point) tmpV2.set(point.x, point.y, point.z);
    else tmpV2.copyFrom(this.node.position);
    this.body.applyImpulse(tmpV, tmpV2);
  }

  applyForce(force: Vec3Like, point?: Vec3Like): void {
    tmpV.set(force.x, force.y, force.z);
    if (point) tmpV2.set(point.x, point.y, point.z);
    else tmpV2.copyFrom(this.node.position);
    this.body.applyForce(tmpV, tmpV2);
  }

  setGravityFactor(f: number): void {
    this.body.setGravityFactor(f);
  }

  setDamping(linear: number, angular: number): void {
    this.body.setLinearDamping(linear);
    this.body.setAngularDamping(angular);
  }

  setMotion(kind: MotionKind): void {
    if (kind === this.motion) return;
    this.motion = kind;
    this.body.setMotionType(motionToBabylon(kind));
    if (kind === 'dynamic') {
      // Re-apply density based mass after being kinematic.
      this.body.setMassProperties({ mass: this.mass });
    }
  }

  teleport(position: Vec3Like, rotation?: QuatLike): void {
    this.node.position.set(position.x, position.y, position.z);
    if (rotation) this.node.rotationQuaternion!.set(rotation.x, rotation.y, rotation.z, rotation.w);
    // Havok only accepts a direct transform while the prestep is TELEPORT;
    // switch it on for this one write so steps never copy node transforms.
    this.body.setPrestepType(PhysicsPrestepType.TELEPORT);
    this.plugin.setPhysicsBodyTransformation(this.body, this.node);
    this.body.setPrestepType(PhysicsPrestepType.DISABLED);
    tmpV.set(0, 0, 0);
    if (this.motion === 'dynamic') {
      this.body.setLinearVelocity(tmpV);
      this.body.setAngularVelocity(tmpV);
    }
  }

  setKinematicTarget(position: Vec3Like, rotation: QuatLike): void {
    tmpV.set(position.x, position.y, position.z);
    tmpQ.set(rotation.x, rotation.y, rotation.z, rotation.w);
    this.body.setTargetTransform(tmpV, tmpQ);
  }

  setCollisionFilter(group: number, mask: number): void {
    this.shape.filterMembershipMask = group;
    this.shape.filterCollideMask = mask;
  }

  get group(): number {
    return this.shape.filterMembershipMask;
  }

  get mask(): number {
    return this.shape.filterCollideMask;
  }
}

export class BabylonPhysicsWorld implements PhysicsWorld {
  private readonly scene: Scene;
  private readonly plugin: HavokPlugin;
  private readonly helper: PhysicsHelper;
  private nextId = 1;
  private readonly bodies = new Map<PhysicsBody, BabylonBody>();
  private readonly collisionFns: Array<(c: CollisionInfo) => void> = [];
  private readonly raycastResult = new PhysicsRaycastResult();

  constructor(core: Pick<BabylonCore, 'scene' | 'havok'>) {
    this.scene = core.scene;
    this.plugin = core.havok;
    this.helper = new PhysicsHelper(this.scene);
    this.plugin.setVelocityLimits(28, 40);
    this.plugin.onCollisionObservable.add((ev) => {
      if (this.collisionFns.length === 0) return;
      const a = this.bodies.get(ev.collider);
      const b = this.bodies.get(ev.collidedAgainst);
      if (!a || !b) return;
      const info: CollisionInfo = {
        a,
        b,
        point: ev.point ? { x: ev.point.x, y: ev.point.y, z: ev.point.z } : a.getPosition({ x: 0, y: 0, z: 0 }),
        normal: ev.normal ? { x: ev.normal.x, y: ev.normal.y, z: ev.normal.z } : { x: 0, y: 1, z: 0 },
        impulse: ev.impulse ?? 0,
        started: ev.type === 'COLLISION_STARTED',
      };
      for (const fn of this.collisionFns) fn(info);
    });
  }

  get bodyCount(): number {
    return this.bodies.size;
  }

  private buildShape(desc: ShapeDesc): PhysicsShape {
    const scene = this.scene;
    const off = (o?: Vec3Like) => new Vector3(o?.x ?? 0, o?.y ?? 0, o?.z ?? 0);
    const rot = (q?: QuatLike) => (q ? new Quaternion(q.x, q.y, q.z, q.w) : Quaternion.Identity());
    switch (desc.type) {
      case 'box':
        return new PhysicsShapeBox(off(desc.offset), rot(desc.rotation), new Vector3(...desc.size), scene);
      case 'sphere':
        return new PhysicsShapeSphere(off(desc.offset), desc.radius, scene);
      case 'cylinder': {
        const c = off(desc.offset);
        const half = new Vector3(0, desc.height / 2, 0);
        if (desc.rotation) half.rotateByQuaternionToRef(rot(desc.rotation), half);
        return new PhysicsShapeCylinder(c.subtract(half), c.add(half), desc.radius, scene);
      }
      case 'capsule': {
        const c = off(desc.offset);
        const half = new Vector3(0, desc.height / 2, 0);
        return new PhysicsShapeCapsule(c.subtract(half), c.add(half), desc.radius, scene);
      }
      case 'compound': {
        const container = new PhysicsShapeContainer(scene);
        for (const child of desc.children) container.addChild(this.buildShape(child));
        return container;
      }
    }
  }

  createBody(desc: BodyDesc): BodyHandle {
    const id = this.nextId++;
    const node = new TransformNode(`body${id}`, this.scene);
    node.position.set(desc.position.x, desc.position.y, desc.position.z);
    const r = desc.rotation;
    node.rotationQuaternion = r ? new Quaternion(r.x, r.y, r.z, r.w) : Quaternion.Identity();

    const shape = this.buildShape(desc.shape);
    shape.material = { friction: desc.friction ?? 0.6, restitution: desc.restitution ?? 0.15 };
    shape.filterMembershipMask = desc.group ?? (desc.motion === 'static' ? CG.STATIC : CG.ITEM);
    shape.filterCollideMask = desc.mask ?? CG.ALL;
    if (desc.motion === 'dynamic' && desc.mass) {
      shape.density = desc.mass / Math.max(1e-6, shapeVolume(desc.shape));
    }

    const body = new PhysicsBody(node, motionToBabylon(desc.motion), !!desc.startAsleep, this.scene);
    body.shape = shape;
    if (desc.motion === 'dynamic' && desc.mass) body.setMassProperties({ mass: desc.mass });
    body.setLinearDamping(desc.linearDamping ?? 0.05);
    body.setAngularDamping(desc.angularDamping ?? 0.1);
    if (desc.collisionEvents) body.setCollisionCallbackEnabled(true);
    // Static bodies never move; skip syncing them every step.
    if (desc.motion === 'static') body.disableSync = true;

    const handle = new BabylonBody(id, node, body, shape, this.plugin, desc);
    this.bodies.set(body, handle);
    return handle;
  }

  /** A static triangle mesh (terrain). Positions xyz, indices of triangles. */
  createStaticMesh(positions: Float32Array, indices: Uint32Array, group: number = CG.STATIC): BodyHandle {
    const id = this.nextId++;
    const mesh = new Mesh(`mesh${id}`, this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.applyToMesh(mesh);
    mesh.rotationQuaternion = Quaternion.Identity();
    const shape = new PhysicsShapeMesh(mesh, this.scene);
    shape.material = { friction: 0.8, restitution: 0.05 };
    shape.filterMembershipMask = group;
    shape.filterCollideMask = CG.ALL;
    const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, this.scene);
    body.shape = shape;
    body.disableSync = true;
    const handle = new BabylonBody(id, mesh, body, shape, this.plugin, { shape: { type: 'box', size: [1, 1, 1] }, motion: 'static', position: { x: 0, y: 0, z: 0 }, group });
    this.bodies.set(body, handle);
    return handle;
  }

  removeBody(handle: BodyHandle): void {
    const b = handle as BabylonBody;
    if (!b.alive) return;
    b.alive = false;
    this.bodies.delete(b.body);
    b.body.dispose();
    b.shape.dispose();
    b.node.dispose();
  }

  step(dt: number): void {
    const engine = this.scene.getPhysicsEngine() as unknown as PhysicsEngineV2 | null;
    if (!engine) return;
    this.plugin.executeStep(dt, engine.getBodies());
  }

  raycast(from: Vec3Like, to: Vec3Like, mask = CG.STATIC | CG.ITEM): RaycastHit | null {
    const res = this.raycastResult;
    this.plugin.raycast(new Vector3(from.x, from.y, from.z), new Vector3(to.x, to.y, to.z), res, {
      collideWith: mask,
    });
    if (!res.hasHit) return null;
    const hitBody = res.body ? (this.bodies.get(res.body) ?? null) : null;
    return {
      body: hitBody,
      point: { x: res.hitPoint.x, y: res.hitPoint.y, z: res.hitPoint.z },
      normal: { x: res.hitNormal.x, y: res.hitNormal.y, z: res.hitNormal.z },
      distance: res.hitDistance,
    };
  }

  explode(origin: Vec3Like, radius: number, strength: number): void {
    // Babylon's PhysicsHelper applies radially falling-off impulses to every
    // dynamic body – the physical half of an explosion.
    this.helper.applyRadialExplosionImpulse(new Vector3(origin.x, origin.y, origin.z), radius, strength, 1);
  }

  onCollision(fn: (c: CollisionInfo) => void): void {
    this.collisionFns.push(fn);
  }

  forEachDynamic(fn: (b: BodyHandle) => void): void {
    for (const b of this.bodies.values()) if (b.motion === 'dynamic') fn(b);
  }

  hang(child: BodyHandle, anchor: Vec3Like, pivotOnChild: Vec3Like): { remove(): void } {
    const anchorBody = this.createBody({
      shape: { type: 'sphere', radius: 0.01 },
      motion: 'static',
      position: anchor,
      group: 0,
      mask: 0,
    }) as BabylonBody;
    const c = child as BabylonBody;
    const constraint = new BallAndSocketConstraint(
      new Vector3(0, 0, 0),
      new Vector3(pivotOnChild.x, pivotOnChild.y, pivotOnChild.z),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 0),
      this.scene,
    );
    anchorBody.body.addConstraint(c.body, constraint);
    return {
      remove: () => {
        constraint.dispose();
        this.removeBody(anchorBody);
      },
    };
  }
}
