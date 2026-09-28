// Geometry helpers shared by the procedural model factories.

import * as THREE from 'three';

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], opts: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

export function box(w: number, h: number, d: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

export function cyl(rTop: number, rBottom: number, h: number, seg = 10, open = false): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);
}

/** Lathe from (radius, height) pairs, flat shaded for a faceted look. */
export function lathe(points: Array<[number, number]>, segments = 12, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
    phiStart,
    phiLength,
  );
  return g.toNonIndexed();
}

/** Place a child at a position (and optional rotation) inside a parent. */
export function at<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, parent?: THREE.Object3D, ry = 0, rx = 0, rz = 0): T {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  parent?.add(obj);
  return obj;
}

/** Evaluate the radius of a lathe profile at height y (linear interpolation). */
export function profileRadius(points: Array<[number, number]>, y: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const [r0, y0] = points[i];
    const [r1, y1] = points[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return points[points.length - 1][0];
}

/** Plane facing +Z with a pixel texture, for sprites and decals. */
export function quad(w: number, h: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

export function shadowsOff(o: THREE.Object3D): void {
  o.traverse((c) => {
    c.castShadow = false;
  });
}
