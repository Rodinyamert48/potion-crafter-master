// Short-lived physical debris (glass shards, chips). Each piece is a real
// Havok rigid body that bounces off the world, rendered as a tiny Three mesh.

import * as THREE from 'three';
import type { PhysicsWorld, BodyHandle } from '../physics/PhysicsTypes';
import { CG } from '../physics/PhysicsTypes';
import type { PhysicsSync } from '../physics/PhysicsSync';
import { toon } from '../rendering/three/materials';
import { rng } from '../core/Random';

interface Piece {
  mesh: THREE.Mesh;
  body: BodyHandle;
  life: number;
  max: number;
}

export class Debris {
  private readonly pieces: Piece[] = [];
  private readonly geo = new THREE.TetrahedronGeometry(0.025, 0);
  private readonly glassMat = toon({ color: '#d8f0ff', emissive: '#8fb8de', emissiveIntensity: 0.5, transparent: true, opacity: 0.8 });
  private readonly maxPieces = 60;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly sync: PhysicsSync,
  ) {}

  private spawn(p: THREE.Vector3, mat: THREE.Material, size: number, life: number): void {
    if (this.pieces.length >= this.maxPieces) this.kill(0);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.scale.setScalar(size);
    mesh.castShadow = false;
    this.scene.add(mesh);
    const body = this.physics.createBody({
      shape: { type: 'box', size: [0.03 * size, 0.012 * size, 0.03 * size] },
      motion: 'dynamic',
      mass: 0.01,
      position: { x: p.x + rng.range(-0.03, 0.03), y: p.y + 0.03, z: p.z + rng.range(-0.03, 0.03) },
      restitution: 0.35,
      friction: 0.5,
      group: CG.DEBRIS,
      mask: CG.STATIC,
    });
    const a = rng.range(0, Math.PI * 2);
    const s = rng.range(0.6, 2.0);
    body.setLinearVelocity({ x: Math.cos(a) * s, y: rng.range(1, 3), z: Math.sin(a) * s });
    body.setAngularVelocity({ x: rng.range(-15, 15), y: rng.range(-15, 15), z: rng.range(-15, 15) });
    this.sync.link(body, mesh);
    this.pieces.push({ mesh, body, life, max: life });
  }

  glass(p: THREE.Vector3, count = 6): void {
    for (let i = 0; i < count; i++) this.spawn(p, this.glassMat, rng.range(0.8, 1.6), rng.range(2.5, 4));
  }

  chunks(p: THREE.Vector3, color: string, count = 6): void {
    const mat = toon({ color });
    for (let i = 0; i < count; i++) this.spawn(p, mat, rng.range(1, 2), rng.range(1.5, 3));
  }

  private kill(i: number): void {
    const piece = this.pieces[i];
    this.sync.unlink(piece.body);
    this.physics.removeBody(piece.body);
    piece.mesh.removeFromParent();
    this.pieces.splice(i, 1);
  }

  update(dt: number): void {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life -= dt;
      if (p.life < 0.6) p.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 3));
      if (p.life <= 0) this.kill(i);
    }
  }
}
