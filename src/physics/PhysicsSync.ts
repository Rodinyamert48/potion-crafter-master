// Bridge between the Babylon/Havok simulation and the Three.js scene graph.
// After every fixed physics step the latest body transforms are captured;
// each render frame interpolates between the last two captures so objects
// move smoothly at any display refresh rate.

import * as THREE from 'three';
import type { BodyHandle } from './PhysicsTypes';

interface Link {
  body: BodyHandle;
  object: THREE.Object3D;
  prevP: THREE.Vector3;
  currP: THREE.Vector3;
  prevQ: THREE.Quaternion;
  currQ: THREE.Quaternion;
}

export class PhysicsSync {
  private readonly links = new Map<number, Link>();

  link(body: BodyHandle, object: THREE.Object3D): void {
    const p = body.getPosition(new THREE.Vector3());
    const q = body.getRotation(new THREE.Quaternion());
    this.links.set(body.id, { body, object, prevP: p.clone(), currP: p, prevQ: q.clone(), currQ: q });
    object.position.copy(p);
    object.quaternion.copy(q);
  }

  unlink(body: BodyHandle): void {
    this.links.delete(body.id);
  }

  /** Call after a teleport so the object does not interpolate across the room. */
  snap(body: BodyHandle): void {
    const l = this.links.get(body.id);
    if (!l) return;
    body.getPosition(l.currP);
    body.getRotation(l.currQ);
    l.prevP.copy(l.currP);
    l.prevQ.copy(l.currQ);
    l.object.position.copy(l.currP);
    l.object.quaternion.copy(l.currQ);
  }

  afterStep(): void {
    for (const l of this.links.values()) {
      if (!l.body.alive) continue;
      l.prevP.copy(l.currP);
      l.prevQ.copy(l.currQ);
      l.body.getPosition(l.currP);
      l.body.getRotation(l.currQ);
    }
  }

  interpolate(alpha: number): void {
    for (const l of this.links.values()) {
      l.object.position.lerpVectors(l.prevP, l.currP, alpha);
      l.object.quaternion.slerpQuaternions(l.prevQ, l.currQ, alpha);
    }
  }
}
