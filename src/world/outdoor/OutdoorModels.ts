// Low-poly models for the open world. Vegetation and rocks are merged
// geometries with per-face vertex colours so thousands of them can be drawn
// as a handful of instanced meshes; landmarks (the shop's outside, the
// signpost, gates, altars, the dragon…) are ordinary groups.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, toonGradient, unlit } from '../../rendering/three/materials';
import { dragonScaleTex, hearthStone, plaster, stoneWall, woodPlank } from '../../rendering/three/textures/PixelTextures';
import { Painter } from '../../rendering/three/textures/Painter';
import { Random } from '../../core/Random';

const rnd = new Random(4242);

/** Vertex-coloured toon material shared by instanced scenery. */
let vcMat: THREE.MeshToonMaterial | null = null;
export function vertexColorMaterial(): THREE.MeshToonMaterial {
  vcMat ??= new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  return vcMat;
}

/** Non-indexed copy with a flat colour per face (slightly jittered). */
export function colored(geo: THREE.BufferGeometry, hex: string, jitter = 0.12): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  const base = new THREE.Color(hex);
  const c = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (rnd.next() - 0.5) * jitter * 2;
    c.copy(base).multiplyScalar(k);
    for (let v = 0; v < 3 && i + v < n; v++) {
      colors[(i + v) * 3] = c.r;
      colors[(i + v) * 3 + 1] = c.g;
      colors[(i + v) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('merge failed');
  g.computeBoundingSphere();
  return g;
}

function part(geo: THREE.BufferGeometry, hex: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, jitter = 0.12): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const g = geo.clone().applyMatrix4(m);
  return colored(g, hex, jitter);
}

// ---------------------------------------------------------------------------
// Vegetation & rocks (for instancing)
// ---------------------------------------------------------------------------

export type SceneryKind = 'oak' | 'dead' | 'pine' | 'willow' | 'charred' | 'rock' | 'caveRock' | 'redRock' | 'stalagmite' | 'basalt' | 'reeds' | 'bush' | 'log' | 'grave' | 'tuft';

export function sceneryGeometry(kind: SceneryKind): THREE.BufferGeometry {
  switch (kind) {
    case 'oak': {
      // A gnarled old oak with a dark, ragged crown.
      const parts = [part(new THREE.CylinderGeometry(0.2, 0.36, 3.4, 6), '#3a2c26', 0, 1.7, 0)];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        parts.push(part(new THREE.CylinderGeometry(0.06, 0.12, 1.6, 5), '#3a2c26', Math.cos(a) * 0.5, 2.9, Math.sin(a) * 0.5, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9));
        parts.push(part(new THREE.IcosahedronGeometry(1.15, 0), i % 2 ? '#2a3a24' : '#33452b', Math.cos(a) * 1.1, 3.9 + (i % 2) * 0.3, Math.sin(a) * 1.1, 0, 0, 0, 0.2));
      }
      parts.push(part(new THREE.IcosahedronGeometry(1.35, 0), '#2e4028', 0, 4.4, 0, 0, 0, 0, 0.2));
      return merge(parts);
    }
    case 'dead': {
      const parts = [part(new THREE.CylinderGeometry(0.12, 0.28, 3.6, 5), '#4a423c', 0, 1.8, 0, 0.05, 0, 0.04)];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const y = 1.8 + i * 0.35;
        parts.push(part(new THREE.CylinderGeometry(0.03, 0.08, 1.5, 4), '#4a423c', Math.cos(a) * 0.45, y + 0.5, Math.sin(a) * 0.45, Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1));
        parts.push(part(new THREE.CylinderGeometry(0.02, 0.04, 0.7, 4), '#4a423c', Math.cos(a) * 0.95, y + 1.1, Math.sin(a) * 0.95, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4));
      }
      return merge(parts);
    }
    case 'pine': {
      const parts = [part(new THREE.CylinderGeometry(0.14, 0.22, 1.6, 5), '#2e221e', 0, 0.8, 0)];
      const tones = ['#1c2a20', '#223226', '#1a261e'];
      for (let i = 0; i < 3; i++) parts.push(part(new THREE.ConeGeometry(1.5 - i * 0.38, 2.1, 7), tones[i], 0, 2.0 + i * 1.15, 0, 0, i * 0.4, 0, 0.18));
      return merge(parts);
    }
    case 'willow': {
      const parts = [part(new THREE.CylinderGeometry(0.22, 0.4, 2.8, 6), '#3a3228', 0, 1.4, 0, 0.1, 0, 0)];
      const crown = new THREE.IcosahedronGeometry(1.7, 0);
      crown.scale(1.2, 0.6, 1.2);
      parts.push(part(crown, '#3a4a2e', 0, 3.1, 0, 0, 0, 0, 0.2));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        parts.push(part(new THREE.BoxGeometry(0.08, 1.8, 0.08), i % 2 ? '#4a5a34' : '#56663a', Math.cos(a) * 1.6, 2.1, Math.sin(a) * 1.6));
      }
      return merge(parts);
    }
    case 'charred': {
      const parts = [part(new THREE.CylinderGeometry(0.1, 0.3, 3.0, 5), '#1e1a1c', 0, 1.5, 0, 0.12, 0, -0.08)];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 1;
        parts.push(part(new THREE.CylinderGeometry(0.03, 0.07, 1.3, 4), i === 1 ? '#5a2020' : '#1e1a1c', Math.cos(a) * 0.4, 2.2 + i * 0.2, Math.sin(a) * 0.4, Math.sin(a), 0, -Math.cos(a)));
      }
      return merge(parts);
    }
    case 'rock':
    case 'caveRock':
    case 'redRock': {
      const g = new THREE.DodecahedronGeometry(1, 0);
      g.scale(1.2, 0.8, 1);
      const col = kind === 'rock' ? '#5a5a66' : kind === 'caveRock' ? '#4a4c5e' : '#5a302a';
      return merge([part(g, col, 0, 0.35, 0, 0, 0, 0, 0.2)]);
    }
    case 'stalagmite':
      return merge([part(new THREE.ConeGeometry(0.55, 2.6, 6), '#5a5e70', 0, 1.3, 0), part(new THREE.ConeGeometry(0.3, 1.4, 5), '#4a4e60', 0.5, 0.7, 0.2)]);
    case 'basalt': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const h = 2.5 + i * 1.1;
        parts.push(part(new THREE.CylinderGeometry(0.42, 0.42, h, 6), i % 2 ? '#2a2226' : '#33282c', Math.cos(i * 1.7) * 0.7, h / 2, Math.sin(i * 1.7) * 0.7));
      }
      return merge(parts);
    }
    case 'reeds': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        const h = 1 + (i % 3) * 0.35;
        parts.push(part(new THREE.BoxGeometry(0.05, h, 0.05), '#4a5a2a', Math.cos(a) * 0.3, h / 2, Math.sin(a) * 0.3, Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15));
        if (i % 3 === 0) parts.push(part(new THREE.BoxGeometry(0.09, 0.28, 0.09), '#5a3a22', Math.cos(a) * 0.3, h, Math.sin(a) * 0.3));
      }
      return merge(parts);
    }
    case 'bush': {
      const g = new THREE.IcosahedronGeometry(0.8, 0);
      g.scale(1.3, 0.7, 1.1);
      return merge([part(g, '#2a3a26', 0, 0.45, 0, 0, 0, 0, 0.2), part(new THREE.IcosahedronGeometry(0.5, 0), '#33452b', 0.6, 0.5, 0.2)]);
    }
    case 'log': {
      return merge([part(new THREE.CylinderGeometry(0.35, 0.4, 3, 7), '#4a3a2a', 0, 0.35, 0, 0, 0, Math.PI / 2), part(new THREE.BoxGeometry(2.4, 0.08, 0.4), '#4a6a2a', 0, 0.72, 0)]);
    }
    case 'grave': {
      return merge([part(new THREE.BoxGeometry(0.7, 0.9, 0.18), '#5a5e6e', 0, 0.45, 0, 0, 0, 0.06), part(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 8, 1, false, 0, Math.PI), '#5a5e6e', 0, 0.9, 0, Math.PI / 2, 0, Math.PI / 2)]);
    }
    case 'tuft': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const a = i * 1.6;
        parts.push(part(new THREE.ConeGeometry(0.06, 0.45, 3), '#3e4a2c', Math.cos(a) * 0.12, 0.22, Math.sin(a) * 0.12, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3));
      }
      return merge(parts);
    }
  }
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

let groundTex: THREE.Texture | null = null;
/** Neutral pixel detail tiled over the terrain (tinted by vertex colours). */
export function groundDetail(): THREE.Texture {
  if (groundTex) return groundTex;
  const p = new Painter(32, 32, 99);
  p.wrap = true;
  p.fill('#b8b8b8');
  for (let i = 0; i < 260; i++) p.px(p.rng.int(0, 31), p.rng.int(0, 31), p.rng.chance(0.5) ? '#9a9a9a' : '#d0d0d0');
  for (let i = 0; i < 26; i++) {
    const x = p.rng.int(0, 31);
    const y = p.rng.int(0, 31);
    p.px(x, y, '#e8e8e8');
    p.px(x, y + 1, '#8a8a8a');
  }
  groundTex = p.texture({ repeat: [1, 1] });
  groundTex.wrapS = THREE.RepeatWrapping;
  groundTex.wrapT = THREE.RepeatWrapping;
  return groundTex;
}

let caveTex: THREE.Texture | null = null;
/** Rough cave rock: dark stone with cracks and mineral glints. */
export function caveRockTexture(): THREE.Texture {
  if (caveTex) return caveTex;
  const p = new Painter(64, 64, 31);
  p.wrap = true;
  p.fill('#4a4c5e');
  for (let i = 0; i < 700; i++) p.px(p.rng.int(0, 63), p.rng.int(0, 63), p.rng.chance(0.5) ? '#3e4052' : '#565a6e');
  for (let i = 0; i < 40; i++) {
    let x = p.rng.int(0, 63);
    let y = p.rng.int(0, 63);
    for (let k = 0; k < 8; k++) {
      p.px(x, y, '#2a2c3a');
      x += p.rng.int(-1, 1);
      y += 1;
    }
  }
  for (let i = 0; i < 14; i++) p.px(p.rng.int(0, 63), p.rng.int(0, 63), '#9af5e6');
  caveTex = p.texture({ repeat: [1, 1] });
  return caveTex;
}

/** A painted wooden board with a name on it (signpost arrows, gate signs). */
export function signTexture(text: string, color = '#ead4aa', w = 128, h = 24): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#5a3a28';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#6e4a32';
  for (let y = 2; y < h; y += 6) g.fillRect(0, y, w, 1);
  g.fillStyle = '#3e2718';
  g.fillRect(0, 0, w, 2);
  g.fillRect(0, h - 2, w, 2);
  g.font = `${Math.round(h * 0.72)}px VT323, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#1e140e';
  g.fillText(text, w / 2 + 1, h / 2 + 2);
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A board readable from both sides (two back-to-back planes, so the text
 *  is never mirrored). */
export function twoSidedSign(text: string, w: number, h: number, color = '#ead4aa'): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ map: signTexture(text, color), gradientMap: toonGradient() });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  front.position.z = 0.012;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  back.rotation.y = Math.PI;
  back.position.z = -0.012;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.02), toon({ map: woodPlank('dark') }));
  g.add(front, back, board);
  return g;
}

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** The outside of the shop: stone and plaster walls, a steep roof, a chimney,
 *  glowing windows, the sign and the door (facing −z). */
export function shopExterior(): { group: THREE.Group; chimneyTop: THREE.Vector3; door: THREE.Object3D } {
  const g = new THREE.Group();
  const stone = toon({ map: repeatTex(stoneWall(), 3, 1) });
  const wall = toon({ map: repeatTex(plaster(), 3, 2) });
  const wood = toon({ map: woodPlank('dark') });
  const W = 11;
  const D = 8;
  box(W, 1.2, D, stone, 0, 0.6, 0, g);
  box(W - 0.1, 2.8, D - 0.1, wall, 0, 2.6, 0, g);
  // Timber frame
  for (const x of [-W / 2, -W / 6, W / 6, W / 2]) box(0.22, 4, 0.22, wood, x, 2, -D / 2 - 0.02, g);
  box(W + 0.2, 0.22, 0.22, wood, 0, 4, -D / 2 - 0.02, g);
  box(W + 0.2, 0.22, 0.22, wood, 0, 1.2, -D / 2 - 0.02, g);
  // Roof: a triangular prism
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-W / 2 - 0.6, 0);
  roofShape.lineTo(0, 3.4);
  roofShape.lineTo(W / 2 + 0.6, 0);
  roofShape.lineTo(-W / 2 - 0.6, 0);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: D + 1, bevelEnabled: false });
  roofGeo.translate(0, 0, -(D + 1) / 2);
  roofGeo.rotateY(Math.PI / 2);
  roofGeo.scale(1, 1, 1);
  const roof = new THREE.Mesh(roofGeo, toon({ color: '#4a2230' }));
  roof.rotation.y = Math.PI / 2;
  roof.position.y = 4;
  roof.castShadow = true;
  g.add(roof);
  // Chimney with smoke
  box(0.9, 3, 0.9, stone, -3.2, 6.2, 1.5, g);
  const chimneyTop = new THREE.Vector3(-3.2, 7.8, 1.5);
  // Glowing windows
  const glow = toon({ color: '#ffcf7a', emissive: '#ffb35a', emissiveIntensity: 1.2 });
  for (const x of [-3.2, 3.4]) {
    box(1.3, 1.1, 0.08, glow, x, 2.6, -D / 2 - 0.06, g);
    box(1.5, 0.12, 0.2, wood, x, 2.0, -D / 2 - 0.1, g);
    box(0.08, 1.1, 0.1, wood, x, 2.6, -D / 2 - 0.1, g);
  }
  // Door (slightly open, warm light spilling out)
  const door = box(1.3, 2.3, 0.14, toon({ map: woodPlank('mid') }), 0, 1.15, -D / 2 - 0.05, g);
  box(1.5, 0.16, 0.2, wood, 0, 2.38, -D / 2 - 0.08, g);
  box(1.1, 2.1, 0.02, unlit('#ffb35a'), 0.08, 1.1, -D / 2 - 0.13, g).rotation.y = 0.15;
  // Hanging sign
  const sign = twoSidedSign("Witch's Brew", 1.8, 0.5, '#fee761');
  sign.position.set(1.8, 3.1, -D / 2 - 0.7);
  g.add(sign);
  box(0.08, 0.08, 0.8, wood, 1.8, 3.4, -D / 2 - 0.4, g);
  // Barrels and a crate by the door
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 8), toon({ map: woodPlank('light') }));
  barrel.position.set(-1.6, 0.45, -D / 2 - 0.6);
  barrel.castShadow = true;
  g.add(barrel);
  box(0.7, 0.7, 0.7, toon({ map: woodPlank('mid') }), -2.4, 0.35, -D / 2 - 0.5, g);
  return { group: g, chimneyTop, door };
}

function repeatTex(tex: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const t = tex.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

/** Wooden picket fence segment from a to b. */
export function fence(ax: number, az: number, bx: number, bz: number, parent: THREE.Object3D, groundY: (x: number, z: number) => number): void {
  const wood = toon({ map: woodPlank('light') });
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(len / 0.45));
  const ang = Math.atan2(bz - az, bx - ax);
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const z = az + ((bz - az) * i) / n;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.06), wood);
    p.position.set(x, groundY(x, z) + 0.45, z);
    p.rotation.y = -ang;
    p.castShadow = true;
    parent.add(p);
  }
  for (const y of [0.3, 0.75]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.05), wood);
    rail.position.set((ax + bx) / 2, groundY((ax + bx) / 2, (az + bz) / 2) + y, (az + bz) / 2);
    rail.rotation.y = -ang;
    parent.add(rail);
  }
}

/** The crossroads signpost: one arrow per road. */
export function signpost(arrows: Array<{ angle: number; text: string; locked: boolean }>): THREE.Group {
  const g = new THREE.Group();
  const wood = toon({ map: woodPlank('dark') });
  box(0.22, 3.6, 0.22, wood, 0, 1.8, 0, g);
  arrows.forEach((a, i) => {
    const board = twoSidedSign(a.text, 1.9, 0.36, a.locked ? '#8b9bb4' : '#ead4aa');
    const pivot = new THREE.Group();
    pivot.position.y = 3.2 - i * 0.42;
    // Arrow points along its road (angle: degrees from north, clockwise).
    pivot.rotation.y = -((a.angle - 90) * Math.PI) / 180;
    board.position.x = 1.05;
    pivot.add(board);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 3), wood);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 2.1;
    pivot.add(tip);
    g.add(pivot);
  });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), toon({ color: '#ffcf7a', emissive: '#ffb35a', emissiveIntensity: 1.3 }));
  lamp.position.y = 3.85;
  g.add(lamp);
  return g;
}

/** Stone pillars with a shimmering barrier between them (locked roads). */
export function gateModel(width: number): { group: THREE.Group; barrier: THREE.Mesh; mat: THREE.ShaderMaterial } {
  const g = new THREE.Group();
  const stone = toon({ map: repeatTex(hearthStone(), 2, 6) });
  for (const s of [-1, 1]) {
    box(0.8, 3.2, 0.8, stone, (s * width) / 2, 1.6, 0, g);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.7, 4), stone);
    cap.position.set((s * width) / 2, 3.55, 0);
    cap.rotation.y = Math.PI / 4;
    g.add(cap);
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), unlit('#c0cbff'));
    rune.position.set((s * width) / 2, 2.2, -0.41);
    rune.rotation.y = Math.PI;
    g.add(rune);
  }
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#8a7aff') } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        vec2 p = floor(vUv * vec2(48.0, 28.0)) / vec2(48.0, 28.0);
        float w = sin(p.x * 30.0 + uTime * 2.0) * 0.5 + sin(p.y * 22.0 - uTime * 3.0) * 0.5;
        float edge = smoothstep(0.0, 0.15, p.y) * smoothstep(1.0, 0.8, p.y);
        float a = (0.18 + 0.2 * w) * edge;
        if (a < 0.05) discard;
        gl_FragColor = vec4(uColor * a * 1.6, a);
      }`,
  });
  const barrier = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.8, 3), mat);
  barrier.position.y = 1.5;
  g.add(barrier);
  return { group: g, barrier, mat };
}

/** The gathering altar: a rune stone in a glowing circle. */
export function altarModel(color: string): { group: THREE.Group; ring: THREE.Mesh; rune: THREE.Mesh } {
  const g = new THREE.Group();
  const stone = toon({ map: repeatTex(hearthStone(), 2, 3) });
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.5), stone);
  s.position.y = 0.8;
  s.rotation.z = 0.04;
  s.castShadow = true;
  g.add(s);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 8, 1, false, 0, Math.PI), stone);
  top.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  top.position.y = 1.6;
  g.add(top);
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), unlit(color));
  rune.position.set(0, 1.1, 0.26);
  g.add(rune);
  const rune2 = rune.clone();
  rune2.position.z = -0.26;
  rune2.rotation.y = Math.PI;
  g.add(rune2);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 24), unlit(color, { additive: true, opacity: 0.6 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  return { group: g, ring, rune };
}

/** The wishing well at the Moon Shrine. */
export function wellModel(): THREE.Group {
  const g = new THREE.Group();
  const stone = toon({ map: repeatTex(stoneWall(), 3, 1) });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 12, 1, true), stone);
  ring.position.y = 0.45;
  ring.material = stone;
  (ring.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
  g.add(ring);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.12, 5, 14), toon({ color: '#5a6988' }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.9;
  g.add(rim);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.05, 14), toon({ color: '#1d2b44', emissive: '#3a4a88', emissiveIntensity: 0.6 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.55;
  g.add(water);
  const wood = toon({ map: woodPlank('dark') });
  for (const s of [-1, 1]) box(0.14, 1.8, 0.14, wood, s * 1.05, 1.5, 0, g);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 4), toon({ color: '#3a2a30' }));
  roof.position.y = 2.7;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  box(2.2, 0.1, 0.1, wood, 0, 2.2, 0, g);
  return g;
}

/** A standing stone for the Moon Shrine's circle. */
export function standingStone(h: number, lean: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.9, h, 0.55, 1, 3, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 - Math.max(0, y / h) * 0.35;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, toon({ map: repeatTex(stoneWall(), 1, 3), color: '#b8bccc' }));
  m.position.y = h / 2 - 0.1;
  m.rotation.z = lean;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A broken pillar of the old temple. */
export function pillar(h: number): THREE.Group {
  const g = new THREE.Group();
  const stone = toon({ map: repeatTex(hearthStone(), 2, 5) });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, h, 8), stone);
  shaft.position.y = h / 2;
  shaft.castShadow = true;
  g.add(shaft);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.3), stone);
  base.position.y = 0.15;
  g.add(base);
  return g;
}

/** The cavern at the end of the cave canyon: a rocky dome with an opening. */
export function cavernModel(r: number, openingYaw: number): THREE.Group {
  const g = new THREE.Group();
  const mat = toon({ map: repeatTex(caveRockTexture(), 10, 4), side: THREE.DoubleSide, color: '#b0b0c4' });
  // Dome with a gap for the entrance
  const gap = 0.9;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 9, openingYaw + gap / 2, Math.PI * 2 - gap, 0, Math.PI / 2), mat);
  dome.scale.y = 0.62;
  dome.receiveShadow = true;
  g.add(dome);
  // Arch rocks at the mouth
  const rock = toon({ color: '#4a4c5e' });
  for (const s of [-1, 1]) {
    // Sphere vertices sit at (−cos φ, sin φ)·r around the y axis.
    const phi = openingYaw + (s * gap) / 2;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), rock);
    m.position.set(-Math.cos(phi) * r, 1.2, Math.sin(phi) * r);
    m.scale.set(1, 1.8, 1);
    m.castShadow = true;
    g.add(m);
  }
  // Stalactites hanging from the ceiling
  for (let i = 0; i < 26; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const d = rnd.range(1, r - 2);
    const len = rnd.range(0.6, 2.2);
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.22, len, 5), rock);
    const y = Math.sqrt(Math.max(0, r * r - d * d)) * 0.62;
    m.position.set(Math.cos(a) * d, y - len / 2, Math.sin(a) * d);
    m.rotation.x = Math.PI;
    g.add(m);
  }
  return g;
}

/** The sleeping red dragon of the valley. */
export function dragonModel(): { group: THREE.Group; body: THREE.Mesh; head: THREE.Group; eyes: THREE.Mesh[]; wings: THREE.Mesh[] } {
  const g = new THREE.Group();
  const red = toon({ map: repeatTex(dragonScaleTex(), 5, 3), color: '#d05050' });
  const dark = toon({ color: '#4a1a1e' });
  const belly = toon({ color: '#b8603a' });
  const horn = toon({ color: '#d8c8a0' });
  const body = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 10), red);
  body.scale.set(1.5, 0.85, 1);
  body.position.y = 2.3;
  body.castShadow = true;
  g.add(body);
  const bellyM = new THREE.Mesh(new THREE.SphereGeometry(2.6, 9, 6), belly);
  bellyM.scale.set(1.4, 0.55, 0.9);
  bellyM.position.set(0, 1.3, 0.4);
  g.add(bellyM);
  // Neck curling forward to the head resting on the ground
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 4.5, 8), red);
  neck.position.set(-4.2, 1.8, 1.4);
  neck.rotation.set(0.3, 0, 1.1);
  neck.castShadow = true;
  g.add(neck);
  const head = new THREE.Group();
  head.position.set(-6.6, 1.0, 2.2);
  g.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.4), red);
  skull.castShadow = true;
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.0), red);
  snout.position.set(-1.5, -0.15, 0);
  head.add(snout);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.3, 5), horn);
    h.position.set(0.8, 0.8, s * 0.45);
    h.rotation.set(s * 0.3, 0, -1.1);
    head.add(h);
  }
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.06), unlit('#1a0a0a'));
    e.position.set(-0.2, 0.25, s * 0.71);
    head.add(e);
    eyes.push(e);
  }
  // Folded wings
  const wings: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(5, 1.2);
    shape.lineTo(3.8, 3.4);
    shape.lineTo(1.2, 2.2);
    shape.lineTo(0, 0);
    const w = new THREE.Mesh(new THREE.ShapeGeometry(shape), toon({ color: '#5a1a22', side: THREE.DoubleSide }));
    w.position.set(-1.6, 3.4, s * 0.9);
    w.rotation.set(s * 1.2, 0, 0.1);
    w.castShadow = true;
    g.add(w);
    wings.push(w);
  }
  // Spikes along the back, and the tail curling round
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 4), horn);
    sp.position.set(-2.6 + i * 0.95, 4.7 - Math.abs(i - 3) * 0.28, 0);
    g.add(sp);
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 0.45;
    const t = new THREE.Mesh(new THREE.SphereGeometry(1.1 - i * 0.15, 7, 5), i % 2 ? dark : red);
    t.position.set(4.2 + Math.cos(a) * 2.6 - 1, 0.8, Math.sin(a) * 2.6 + 0.6);
    t.castShadow = true;
    g.add(t);
  }
  for (const [x, z] of [
    [-2.2, 2],
    [2.2, 2],
    [-2.2, -1.8],
    [2.2, -1.8],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 1.3), dark);
    leg.position.set(x, 0.6, z);
    g.add(leg);
  }
  return { group: g, body, head, eyes, wings };
}

/** A shadowy wolf (night hazard in the forest). */
export function wolfModel(): { group: THREE.Group; legs: THREE.Mesh[] } {
  const g = new THREE.Group();
  const fur = toon({ color: '#26262e' });
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.2), fur);
  bodyM.position.y = 0.75;
  bodyM.castShadow = true;
  g.add(bodyM);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.5), fur);
  head.position.set(0, 0.95, -0.75);
  g.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.3), fur);
  snout.position.set(0, 0.86, -1.1);
  g.add(snout);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), fur);
    ear.position.set(s * 0.13, 1.22, -0.7);
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), unlit('#fee761'));
    eye.position.set(s * 0.1, 1.0, -1.01);
    g.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.6), fur);
  tail.position.set(0, 0.85, 0.85);
  tail.rotation.x = -0.5;
  g.add(tail);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-0.16, -0.4],
    [0.16, -0.4],
    [-0.16, 0.4],
    [0.16, 0.4],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), fur);
    leg.geometry.translate(0, -0.27, 0);
    leg.position.set(x, 0.55, z);
    g.add(leg);
    legs.push(leg);
  }
  return { group: g, legs };
}

/** A bog toad sitting on a pad (gives an eye when you ask nicely). */
export function toadModel(): { group: THREE.Group; eyes: THREE.Mesh[] } {
  const g = new THREE.Group();
  const skin = toon({ color: '#5a6a30' });
  const bodyM = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), skin);
  bodyM.scale.set(1.2, 0.7, 1);
  bodyM.position.y = 0.2;
  g.add(bodyM);
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), toon({ color: '#fee761', emissive: '#feae34', emissiveIntensity: 0.9 }));
    e.position.set(s * 0.15, 0.38, -0.12);
    g.add(e);
    eyes.push(e);
  }
  return { group: g, eyes };
}

/** A poisonous look-alike: red cap with white spots. */
export function toadstoolModel(): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.35, 6), toon({ color: '#ead4aa' }));
  stem.position.y = 0.17;
  g.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: '#c42430', emissive: '#5a0a10', emissiveIntensity: 0.4 }));
  cap.position.y = 0.32;
  g.add(cap);
  for (let i = 0; i < 5; i++) {
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), toon({ color: '#ffffff' }));
    const a = i * 1.3;
    dot.position.set(Math.cos(a) * 0.12, 0.45 - (i % 2) * 0.04, Math.sin(a) * 0.12);
    g.add(dot);
  }
  return g;
}

/** A raven perched on a stone; flaps off when you come close. */
export function ravenModel(): { group: THREE.Group; wings: THREE.Mesh[] } {
  const g = new THREE.Group();
  const black = toon({ color: '#16141e' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.38), black);
  body.position.y = 0.12;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), black);
  head.position.set(0, 0.26, -0.18);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), toon({ color: '#3a3440' }));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.25, -0.3);
  g.add(beak);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.02), unlit('#e43b44'));
  eye.position.set(0, 0.29, -0.22);
  g.add(eye);
  const wings: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.26), black);
    w.geometry.translate((s * 0.15) as number, 0, 0);
    w.position.set(s * 0.08, 0.18, 0);
    g.add(w);
    wings.push(w);
  }
  return { group: g, wings };
}

/** A lantern post along the roads. */
export function lanternPost(): { group: THREE.Group; lamp: THREE.Mesh } {
  const g = new THREE.Group();
  const wood = toon({ map: woodPlank('dark') });
  box(0.16, 2.4, 0.16, wood, 0, 1.2, 0, g);
  box(0.7, 0.1, 0.1, wood, 0.3, 2.35, 0, g);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), toon({ color: '#ffcf7a', emissive: '#ffb35a', emissiveIntensity: 1.3 }));
  lamp.position.set(0.58, 2.1, 0);
  g.add(lamp);
  return { group: g, lamp };
}

// ---------------------------------------------------------------------------
// Secret places (recipe scrolls) and the dragon's nests
// ---------------------------------------------------------------------------

/** A rolled-up recipe scroll with a red ribbon, a wax seal and a faint glow. */
export function scrollModel(): { group: THREE.Group; glow: THREE.Mesh } {
  const g = new THREE.Group();
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 8), toon({ color: '#ead4aa', emissive: '#6a5a3a', emissiveIntensity: 0.45 }));
  roll.rotation.z = Math.PI / 2;
  roll.position.y = 0.06;
  g.add(roll);
  const woodEnd = toon({ color: '#733e39' });
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 8), woodEnd);
    end.rotation.z = Math.PI / 2;
    end.position.set(s * 0.225, 0.06, 0);
    g.add(end);
  }
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), toon({ color: '#a22633' }));
  ribbon.rotation.z = Math.PI / 2;
  ribbon.position.y = 0.06;
  g.add(ribbon);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.016, 8), toon({ color: '#e43b44', emissive: '#5a0a10', emissiveIntensity: 0.6 }));
  seal.rotation.x = Math.PI / 2;
  seal.position.set(0, 0.06, -0.066);
  g.add(seal);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), unlit('#fee761', { additive: true, opacity: 0.1 }));
  glow.position.y = 0.07;
  g.add(glow);
  return { group: g, glow };
}

/** A huge hollow oak (the forest's secret); the hollow faces local −z. */
export function hollowTreeModel(): { group: THREE.Group; slot: THREE.Vector3; twist: number } {
  const g = new THREE.Group();
  const bark = toon({ color: '#3a2c26' });
  const barkDark = toon({ color: '#2a201c' });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.25, 4.6, 9), bark);
  trunk.position.y = 2.3;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.32, 1.7, 5), i % 2 ? barkDark : bark);
    root.position.set(Math.cos(a) * 1.3, 0.22, Math.sin(a) * 1.3);
    root.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
    g.add(root);
  }
  // A broken crown with a few dead branches
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.2, 2.3, 5), bark);
    b.position.set(Math.cos(a) * 0.65, 4.8, Math.sin(a) * 0.65);
    b.rotation.set(Math.sin(a) * 0.95, 0, -Math.cos(a) * 0.95);
    b.castShadow = true;
    g.add(b);
  }
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), toon({ color: '#2a3a24' }));
  crown.scale.set(1.4, 0.7, 1.2);
  crown.position.set(0.4, 5.6, 0.3);
  crown.castShadow = true;
  g.add(crown);
  // The hollow: a dark opening with a bark lip and a little ledge
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), unlit('#07050a'));
  hole.scale.set(0.9, 1.35, 1);
  hole.rotation.y = Math.PI;
  hole.position.set(0, 1.12, -1.18);
  g.add(hole);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 5, 12), barkDark);
  lip.scale.set(0.9, 1.35, 1);
  lip.position.set(0, 1.12, -1.17);
  g.add(lip);
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.36), barkDark);
  ledge.position.set(0, 0.52, -1.24);
  g.add(ledge);
  // Toadstools and moss at the foot
  const moss = toon({ color: '#3e5a2a' });
  for (let i = 0; i < 5; i++) {
    const a = i * 1.2 + 0.2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), moss);
    m.position.set(Math.cos(a) * 1.35, 0.02, Math.sin(a) * 1.35);
    g.add(m);
  }
  return { group: g, slot: new THREE.Vector3(0, 0.57, -1.28), twist: 0.3 };
}

/** An old adventurer's bones slumped against the cavern wall (the cave's secret); faces local −z. */
export function skeletonModel(): { group: THREE.Group; slot: THREE.Vector3; twist: number } {
  const g = new THREE.Group();
  const bone = toon({ color: '#d8d0b8' });
  const dark = unlit('#120e14');
  const rust = toon({ color: '#6a5048' });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // Skull hanging forward, jaw open
  add(new THREE.SphereGeometry(0.16, 8, 6), bone, 0, 0.98, 0.02, 0.4);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.05, 0.03), dark, s * 0.06, 0.97, -0.13);
  add(new THREE.BoxGeometry(0.03, 0.04, 0.03), dark, 0, 0.92, -0.14);
  add(new THREE.BoxGeometry(0.15, 0.05, 0.11), bone, 0, 0.84, -0.07, 0.35);
  // Spine, ribs and pelvis, leaning back against the rock
  add(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 5), bone, 0, 0.55, 0.12, -0.28);
  for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.14 - i * 0.012, 0.018, 4, 10, Math.PI * 1.3), bone, 0, 0.74 - i * 0.08, 0.06 + i * 0.02, Math.PI / 2 - 0.25, 0, Math.PI * 0.85);
  add(new THREE.BoxGeometry(0.26, 0.1, 0.16), bone, 0, 0.18, 0.12);
  // Legs stretched out
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 5), bone, s * 0.1, 0.12, -0.14, Math.PI / 2 - 0.15, 0, s * 0.08);
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.44, 5), bone, s * 0.13, 0.05, -0.56, Math.PI / 2, 0, s * 0.05);
    add(new THREE.BoxGeometry(0.08, 0.05, 0.14), bone, s * 0.14, 0.03, -0.82);
    // Arms hanging down to the ground
    add(new THREE.CylinderGeometry(0.024, 0.024, 0.34, 5), bone, s * 0.2, 0.62, 0.06, 0, 0, s * 0.25);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 5), bone, s * 0.27, 0.34, -0.02, 0.4, 0, s * 0.15);
  }
  // A rusty sword, a cracked lantern and a mouldy pack
  add(new THREE.BoxGeometry(0.06, 0.02, 0.85), rust, 0.5, 0.02, -0.35, 0, 0.3);
  add(new THREE.BoxGeometry(0.22, 0.03, 0.04), rust, 0.37, 0.03, 0.05, 0, 0.3);
  add(new THREE.BoxGeometry(0.16, 0.22, 0.16), toon({ color: '#3a3440' }), -0.48, 0.11, -0.2, 0, 0.4, 0.3);
  add(new THREE.BoxGeometry(0.36, 0.42, 0.22), toon({ color: '#4a3a2e' }), 0.05, 0.3, 0.34, -0.2);
  return { group: g, slot: new THREE.Vector3(0, 0.2, -0.3), twist: 0.4 };
}

/** An old stone coffin with its lid pushed aside (the shrine's secret). */
export function sarcophagusModel(): { group: THREE.Group; slot: THREE.Vector3; twist: number } {
  const g = new THREE.Group();
  const stone = toon({ map: repeatTex(stoneWall(), 2, 1), color: '#b8bccc' });
  const stoneDark = toon({ color: '#4a4e60' });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(0, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  box(2.8, 0.22, 1.5, stoneDark, 0, 0.11, 0);
  box(2.3, 0.1, 1.0, stone, 0, 0.27, 0);
  for (const s of [-1, 1]) {
    box(2.3, 0.8, 0.12, stone, 0, 0.62, s * 0.44);
    box(0.12, 0.8, 0.76, stone, s * 1.09, 0.62, 0);
  }
  box(2.06, 0.04, 0.76, unlit('#0a080e'), 0, 0.33, 0);
  // The lid, shoved aside and cracked
  box(1.35, 0.14, 1.1, stone, 0.62, 1.08, 0.18, 0.18, -0.1);
  box(1.0, 0.12, 1.05, stone, -1.35, 0.3, 0.72, 0.5, 0.35);
  // A moon carved on the front, faintly glowing
  const moon = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.12, 12, 1, 0.6, Math.PI * 1.25), unlit('#c0cbff', { transparent: true, opacity: 0.5 }));
  moon.rotation.y = Math.PI;
  moon.position.set(0, 0.62, -0.51);
  g.add(moon);
  // Candle stubs on the plinth
  const wax = toon({ color: '#ead4aa' });
  const flame = unlit('#fee761');
  for (const [x, z] of [
    [-1.25, -0.6],
    [1.25, -0.6],
  ]) {
    box(0.08, 0.16, 0.08, wax, x, 0.3, z);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), flame);
    f.position.set(x, 0.42, z);
    g.add(f);
  }
  // Left half-out over the rim of the open end.
  return { group: g, slot: new THREE.Vector3(-0.62, 1.04, -0.4), twist: 0.12 };
}

/** A rotten rowboat half sunk at the edge of a pool (the swamp's secret); the bow is local −z. */
export function boatModel(): { group: THREE.Group; slot: THREE.Vector3; twist: number } {
  const g = new THREE.Group();
  const hull = new THREE.Group();
  hull.rotation.set(0.07, 0, 0.13);
  g.add(hull);
  const wood = toon({ map: woodPlank('dark'), color: '#8a7a6a' });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
    m.position.set(x, y, z);
    m.rotation.set(0, ry, rz);
    m.castShadow = true;
    hull.add(m);
    return m;
  };
  box(0.9, 0.08, 2.3, 0, 0, 0.15);
  for (const s of [-1, 1]) {
    box(0.07, 0.42, 2.3, s * 0.48, 0.18, 0.15, 0, s * 0.22);
    box(0.07, 0.42, 0.85, s * 0.27, 0.18, -1.25, s * 0.55, s * 0.18);
  }
  box(0.95, 0.38, 0.07, 0, 0.18, 1.3);
  box(0.9, 0.06, 0.28, 0, 0.28, 0.45);
  box(0.9, 0.06, 0.24, 0, 0.28, -0.5);
  // An oar left across the gunwale
  const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2, 5), wood);
  oar.rotation.set(0, 0.35, Math.PI / 2 - 0.12);
  oar.position.set(0.35, 0.45, 0.85);
  hull.add(oar);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.14), wood);
  blade.position.set(1.28, 0.34, 0.5);
  blade.rotation.y = 0.35;
  hull.add(blade);
  // Weed hanging off the side
  const weed = toon({ color: '#3a5a2a' });
  for (let i = 0; i < 5; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.05), weed);
    w.position.set(-0.52, 0.12, -0.6 + i * 0.4);
    hull.add(w);
  }
  return { group: g, slot: new THREE.Vector3(0, 0.36, 0.45), twist: 0.15 };
}

/** The bones of some beast that came too close to the dragon (the valley's secret); the skull is local −z. */
export function bonePileModel(): { group: THREE.Group; slot: THREE.Vector3; twist: number } {
  const g = new THREE.Group();
  const bone = toon({ color: '#d8ccb0' });
  const dark = unlit('#120e14');
  // A rib cage arching over the ground
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(1.05 - Math.abs(i - 2) * 0.1, 0.07, 5, 10, Math.PI), bone);
    rib.position.set(0, 0, -0.9 + i * 0.45);
    rib.rotation.z = (i % 2 ? 1 : -1) * 0.12;
    rib.scale.y = 1.15;
    rib.castShadow = true;
    g.add(rib);
  }
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), bone);
  spine.rotation.x = Math.PI / 2;
  spine.position.set(0, 1.18, 0.1);
  g.add(spine);
  // A horned skull lying in front
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 1.1), bone);
  skull.position.set(0.2, 0.3, -1.95);
  skull.rotation.set(0.1, 0.35, 0.15);
  skull.castShadow = true;
  g.add(skull);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1, 5), toon({ color: '#a89878' }));
    horn.position.set(0.2 + s * 0.35, 0.75, -1.7);
    horn.rotation.set(-0.5, 0, s * -0.5);
    g.add(horn);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.04), dark);
    eye.position.set(0.2 + s * 0.2, 0.38, -2.5);
    eye.rotation.y = 0.35;
    g.add(eye);
  }
  // Loose bones scattered around
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + 0.5;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), bone);
    b.rotation.set(Math.PI / 2, 0, a);
    b.position.set(Math.cos(a) * 1.7, 0.05, Math.sin(a) * 1.7 + 0.3);
    g.add(b);
    for (const e of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), bone);
      knob.position.set(b.position.x - Math.sin(a) * 0.45 * e, 0.06, b.position.z + Math.cos(a) * 0.45 * e);
      g.add(knob);
    }
  }
  return { group: g, slot: new THREE.Vector3(0, 0.03, 0.05), twist: 0.5 };
}

/** A ring of charred sticks and stones: a dragon's nest. */
export function nestModel(): THREE.Group {
  const g = new THREE.Group();
  const stick = toon({ color: '#2a1e1c' });
  const ash = toon({ color: '#3a3032' });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.16, 12), ash);
  base.position.y = 0.06;
  g.add(base);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.05, 4), stick);
    const tangent = new THREE.Vector3(-Math.sin(a), (i % 3) * 0.12 - 0.1, Math.cos(a)).normalize();
    s.quaternion.setFromUnitVectors(up, tangent);
    s.position.set(Math.cos(a) * (0.82 + (i % 2) * 0.12), 0.2 + (i % 3) * 0.07, Math.sin(a) * (0.82 + (i % 2) * 0.12));
    s.castShadow = true;
    g.add(s);
  }
  const stone = toon({ color: '#4a3a3a' });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + (i % 3) * 0.05, 0), stone);
    r.position.set(Math.cos(a) * 1.18, 0.12, Math.sin(a) * 1.18);
    g.add(r);
  }
  return g;
}

/** A dragon egg: speckled, warm and faintly glowing. */
export function dragonEggModel(): { group: THREE.Group; halo: THREE.Mesh } {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), toon({ color: '#c42430', emissive: '#6a1010', emissiveIntensity: 0.7 }));
  shell.scale.set(1, 1.35, 1);
  shell.position.y = 0.42;
  shell.castShadow = true;
  g.add(shell);
  const speck = toon({ color: '#feae34', emissive: '#f77622', emissiveIntensity: 0.9 });
  for (let i = 0; i < 16; i++) {
    const y = -0.8 + ((i + 0.5) / 16) * 1.6;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.4;
    const n = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), speck);
    dot.position.set(n.x * 0.3, 0.42 + n.y * 0.3 * 1.35, n.z * 0.3);
    dot.lookAt(dot.position.clone().add(n));
    g.add(dot);
  }
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), unlit('#f77622', { additive: true, opacity: 0.16 }));
  halo.position.y = 0.42;
  g.add(halo);
  return { group: g, halo };
}
