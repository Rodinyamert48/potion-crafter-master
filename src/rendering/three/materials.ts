// Shared materials. Everything lit uses toon shading with a 4-step gradient
// so light falls off in crisp bands – 3D lighting that reads like pixel-art
// shading.

import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const steps = [70, 130, 190, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  });
  gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export interface ToonOpts {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture | null;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  alphaTest?: number;
  depthWrite?: boolean;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

function keyOf(o: ToonOpts): string {
  return JSON.stringify({
    c: o.color !== undefined ? new THREE.Color(o.color).getHexString() : null,
    m: o.map?.uuid ?? null,
    e: o.emissive !== undefined ? new THREE.Color(o.emissive).getHexString() : null,
    ei: o.emissiveIntensity ?? null,
    em: o.emissiveMap?.uuid ?? null,
    t: o.transparent ?? false,
    op: o.opacity ?? 1,
    s: o.side ?? THREE.FrontSide,
    a: o.alphaTest ?? 0,
    dw: o.depthWrite ?? true,
  });
}

/** Cached toon material – safe to share between meshes. */
export function toon(o: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = keyOf(o);
  let m = cache.get(key);
  if (!m) {
    m = toonUnique(o);
    cache.set(key, m);
  }
  return m;
}

/** A fresh (unshared) toon material, e.g. for per-object tinting. */
export function toonUnique(o: ToonOpts = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color: o.color ?? 0xffffff,
    map: o.map ?? null,
    gradientMap: toonGradient(),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    emissiveMap: o.emissiveMap ?? null,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    alphaTest: o.alphaTest ?? 0,
    depthWrite: o.depthWrite ?? true,
  });
  return m;
}

/** Unlit material (for glowing things, sky, flames). */
export function unlit(color: THREE.ColorRepresentation, opts: { transparent?: boolean; opacity?: number; additive?: boolean; map?: THREE.Texture } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    map: opts.map ?? null,
    transparent: opts.transparent ?? opts.additive ?? false,
    opacity: opts.opacity ?? 1,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !(opts.transparent || opts.additive),
    toneMapped: false,
  });
}

/** Tinted glass used by bottles and jars. */
export function glass(tint: THREE.ColorRepresentation = 0xc9e8ff, opacity = 0.32): THREE.MeshToonMaterial {
  return toon({ color: tint, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, emissive: 0x223344, emissiveIntensity: 0.4 });
}
