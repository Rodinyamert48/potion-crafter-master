// A mop of curly pixel hair that sprouts on a bald head (the Thick Hair
// Tonic): a small camera-facing card painted at runtime.

import * as THREE from 'three';
import { Painter } from '../textures/Painter';
import { shadeHex } from '../../../core/math';

const cache = new Map<string, THREE.Texture>();

function tuftTexture(color: string): THREE.Texture {
  let tex = cache.get(color);
  if (tex) return tex;
  const p = new Painter(18, 11, 29);
  const light = shadeHex(color, 0.45);
  // A dome of curls: overlapping round locks, each with a small highlight.
  p.ellipse(9, 8, 8, 4, color);
  const curls: Array<[number, number]> = [
    [3, 6],
    [6, 4],
    [9, 3],
    [12, 4],
    [15, 6],
    [2, 9],
    [16, 9],
  ];
  for (const [x, y] of curls) {
    p.disc(x, y, 2.2, color);
    p.px(x - 1, y - 1, light);
  }
  p.outline('#181425');
  tex = p.texture({ mipmaps: false });
  cache.set(color, tex);
  return tex;
}

/** `headTop`: height of the top of the head in the parent's space (metres). */
export function hairTuft(color: string, headTop: number): THREE.Object3D {
  const pivot = new THREE.Group();
  pivot.position.y = headTop - 0.06;
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.21),
    new THREE.MeshBasicMaterial({ map: tuftTexture(color), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  );
  card.position.set(0, 0.08, 0.03);
  card.raycast = () => {};
  pivot.add(card);
  // Always face the camera (yaw only), like the character sprites.
  card.onBeforeRender = (_r, _s, camera) => {
    const wp = card.getWorldPosition(new THREE.Vector3());
    const yaw = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z);
    const parentYaw = new THREE.Euler().setFromQuaternion(pivot.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    card.rotation.y = yaw - parentYaw;
  };
  return pivot;
}
