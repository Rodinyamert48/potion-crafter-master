// Procedural low-poly ingredient models for every preparation state, plus
// matching physics shapes.

import * as THREE from 'three';
import type { IngredientDef, PrepState } from '../../../data/types';
import type { ShapeDesc } from '../../../physics/PhysicsTypes';
import { toonUnique } from '../materials';
import {
  batWingTex,
  dragonScaleTex,
  genericIngredientTex,
  mushroomCap,
  mushroomGlowMap,
  mushroomStem,
  powderTex,
} from '../textures/PixelTextures';
import { Painter } from '../textures/Painter';
import { mixHex } from '../../../core/math';
import { mesh } from './common';

export interface IngredientVisual {
  group: THREE.Group;
  halfHeight: number;
  radius: number;
  shape: ShapeDesc;
  /** Unique materials of this piece (for tinting while drying / burning). */
  materials: THREE.MeshToonMaterial[];
}

let crackedTex: THREE.Texture | null = null;
function dragonScaleCracked(): THREE.Texture {
  if (crackedTex) return crackedTex;
  const base = dragonScaleTex();
  const p = new Painter(32, 32, 99);
  p.ctx.drawImage(base.image as HTMLCanvasElement, 0, 0);
  p.data.set(p.ctx.getImageData(0, 0, 32, 32).data);
  p.line(4, 3, 16, 17, '#2a0d12');
  p.line(16, 17, 12, 29, '#2a0d12');
  p.line(16, 17, 28, 22, '#2a0d12');
  p.line(17, 16, 22, 5, '#2a0d12');
  crackedTex = p.texture();
  return crackedTex;
}

function mat(def: IngredientDef, map: THREE.Texture | null, state: PrepState, opts: { emissiveMap?: THREE.Texture; glow?: number } = {}) {
  const st = def.states[state];
  let color = '#ffffff';
  if (st?.tint) color = mixHex('#ffffff', st.tint, st.tintAmount ?? 0.5);
  const m = toonUnique({
    color,
    map,
    emissive: opts.emissiveMap || opts.glow ? (def.glow ?? '#000000') : '#000000',
    emissiveIntensity: opts.glow ?? (opts.emissiveMap ? 0.9 : 0),
    emissiveMap: opts.emissiveMap ?? null,
  });
  return m;
}

function scaleShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.1);
  s.quadraticCurveTo(0.1, 0.07, 0.085, -0.02);
  s.quadraticCurveTo(0.05, -0.08, 0, -0.1);
  s.quadraticCurveTo(-0.05, -0.08, -0.085, -0.02);
  s.quadraticCurveTo(-0.1, 0.07, 0, 0.1);
  return s;
}

function wingShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.15, 0.04);
  s.lineTo(0, 0.07);
  s.lineTo(0.15, 0.04);
  s.quadraticCurveTo(0.13, -0.03, 0.14, -0.06);
  s.quadraticCurveTo(0.1, -0.02, 0.07, -0.05);
  s.quadraticCurveTo(0.04, -0.01, 0, -0.06);
  s.quadraticCurveTo(-0.04, -0.01, -0.07, -0.05);
  s.quadraticCurveTo(-0.1, -0.02, -0.14, -0.06);
  s.quadraticCurveTo(-0.13, -0.03, -0.15, 0.04);
  return s;
}

function flatExtrude(shape: THREE.Shape, depth: number, bevel = 0.006): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -depth / 2, 0);
  // Planar UVs from the XZ footprint.
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
    uv[i * 2 + 1] = (pos.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function heap(color: string, radius: number, height: number, glow?: string): { mesh: THREE.Mesh; m: THREE.MeshToonMaterial } {
  const m = toonUnique({ color: '#ffffff', map: powderTex(color), emissive: glow ?? '#000000', emissiveIntensity: glow ? 0.35 : 0 });
  const g = new THREE.ConeGeometry(radius, height, 9, 1);
  g.translate(0, height / 2 - height * 0.5, 0);
  const me = mesh(g, m);
  me.scale.set(1, 1, 0.85);
  return { mesh: me, m };
}

/** Build the visual + physics shape for an ingredient piece. `mass` scales it. */
export function buildIngredientVisual(def: IngredientDef, state: PrepState, mass: number): IngredientVisual {
  const group = new THREE.Group();
  const materials: THREE.MeshToonMaterial[] = [];
  const k = Math.cbrt(Math.max(0.05, mass));
  const model = def.states[state]?.model ?? 'whole';
  let halfHeight = 0.05;
  let radius = 0.08;
  let shape: ShapeDesc = { type: 'box', size: [0.12, 0.06, 0.12] };

  if (model === 'powder') {
    const h = heap(def.color, 0.075, 0.055, def.id === 'glowing_mushroom' || def.id === 'moon_flower' ? def.glow : undefined);
    group.add(h.mesh);
    materials.push(h.m);
    halfHeight = 0.028;
    radius = 0.07;
    shape = { type: 'cylinder', radius: 0.065, height: 0.05 };
  } else if (model === 'charred') {
    const m = toonUnique({ color: '#2a2224', map: genericIngredientTex('#2a2224', '#4a3a3a'), emissive: '#e43b44', emissiveIntensity: 0.15 });
    materials.push(m);
    const g = new THREE.DodecahedronGeometry(0.06, 0);
    const me = mesh(g, m);
    me.scale.set(1.2, 0.6, 1);
    group.add(me);
    halfHeight = 0.036;
    radius = 0.07;
    shape = { type: 'box', size: [0.13, 0.07, 0.11] };
  } else if (def.model === 'mushroom') {
    const capMat = mat(def, mushroomCap(), state, { emissiveMap: mushroomGlowMap() });
    const stemMat = mat(def, mushroomStem(), state);
    materials.push(capMat, stemMat);
    if (model === 'whole') {
      const cap = mesh(new THREE.SphereGeometry(0.085, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      cap.scale.set(1, 0.72, 1);
      cap.position.y = 0.02;
      const stem = mesh(new THREE.CylinderGeometry(0.026, 0.034, 0.1, 7), stemMat);
      stem.position.y = -0.028;
      const under = mesh(new THREE.CircleGeometry(0.084, 9), stemMat);
      under.rotation.x = Math.PI / 2;
      under.position.y = 0.019;
      group.add(cap, stem, under);
      halfHeight = 0.078;
      radius = 0.085;
      shape = { type: 'cylinder', radius: 0.075, height: 0.15 };
    } else if (model === 'slice') {
      const g = new THREE.CylinderGeometry(0.075, 0.075, 0.022, 9, 1, false, 0, Math.PI);
      g.rotateZ(Math.PI / 2);
      g.rotateY(Math.PI / 2);
      const slice = mesh(g, capMat);
      slice.rotation.x = -Math.PI / 2;
      const stem = mesh(new THREE.BoxGeometry(0.03, 0.02, 0.06), stemMat);
      stem.position.set(0, 0, 0.045);
      group.add(slice, stem);
      halfHeight = 0.012;
      radius = 0.075;
      shape = { type: 'box', size: [0.15, 0.024, 0.1], offset: { x: 0, y: 0, z: 0.012 } };
    } else {
      // mash
      const blob = mesh(new THREE.DodecahedronGeometry(0.065, 0), capMat);
      blob.scale.set(1.35, 0.42, 1.15);
      group.add(blob);
      halfHeight = 0.028;
      radius = 0.085;
      shape = { type: 'cylinder', radius: 0.08, height: 0.05 };
    }
  } else if (def.model === 'scale') {
    const tex = model === 'cracked' ? dragonScaleCracked() : dragonScaleTex();
    const m = mat(def, tex, state, { glow: 0.12 });
    materials.push(m);
    if (model === 'shard') {
      const s = new THREE.Shape();
      s.moveTo(0, 0.06);
      s.lineTo(0.05, -0.04);
      s.lineTo(-0.045, -0.035);
      s.lineTo(0, 0.06);
      group.add(mesh(flatExtrude(s, 0.02, 0.004), m));
      halfHeight = 0.014;
      radius = 0.055;
      shape = { type: 'box', size: [0.1, 0.028, 0.09] };
    } else {
      const me = mesh(flatExtrude(scaleShape(), 0.022), m);
      group.add(me);
      halfHeight = 0.017;
      radius = 0.1;
      shape = { type: 'box', size: [0.19, 0.034, 0.2] };
    }
  } else if (def.model === 'wing') {
    const m = mat(def, batWingTex(), state);
    m.side = THREE.DoubleSide;
    materials.push(m);
    if (model === 'strip') {
      group.add(mesh(new THREE.BoxGeometry(0.26, 0.012, 0.04), m));
      halfHeight = 0.008;
      radius = 0.12;
      shape = { type: 'box', size: [0.26, 0.018, 0.045] };
    } else if (model === 'crumb') {
      for (let i = 0; i < 6; i++) {
        const f = mesh(new THREE.BoxGeometry(0.04, 0.012, 0.03), m);
        f.position.set((Math.random() - 0.5) * 0.08, 0.004 * i, (Math.random() - 0.5) * 0.07);
        f.rotation.y = Math.random() * 3;
        group.add(f);
      }
      halfHeight = 0.02;
      radius = 0.07;
      shape = { type: 'cylinder', radius: 0.065, height: 0.04 };
    } else {
      const g = flatExtrude(wingShape(), 0.01, 0.003);
      if (model === 'dried') {
        // curl the membrane
        const pos = g.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          pos.setY(i, pos.getY(i) + x * x * 1.6);
        }
        g.computeVertexNormals();
      }
      const me = mesh(g, m);
      group.add(me);
      halfHeight = model === 'dried' ? 0.03 : 0.01;
      radius = 0.14;
      shape = { type: 'box', size: [0.28, model === 'dried' ? 0.05 : 0.02, 0.12] };
    }
  } else if (def.model === 'flower') {
    const petal = mat(def, genericIngredientTex(def.color, def.colorAlt), state, { glow: 0.5 });
    materials.push(petal);
    if (model === 'slice') {
      for (let i = 0; i < 3; i++) {
        const p = mesh(new THREE.SphereGeometry(0.03, 6, 4), petal);
        p.scale.set(1.4, 0.3, 0.8);
        p.position.set((i - 1) * 0.04, 0, 0);
        group.add(p);
      }
      halfHeight = 0.012;
      radius = 0.07;
      shape = { type: 'box', size: [0.14, 0.02, 0.06] };
    } else {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const p = mesh(new THREE.SphereGeometry(0.035, 6, 4), petal);
        p.scale.set(1.3, 0.35, 0.8);
        p.position.set(Math.cos(a) * 0.04, 0.01, Math.sin(a) * 0.04);
        p.rotation.y = -a;
        group.add(p);
      }
      const center = mesh(new THREE.SphereGeometry(0.02, 6, 4), toonUnique({ color: '#fee761', emissive: '#fee761', emissiveIntensity: 0.6 }));
      center.position.y = 0.02;
      group.add(center);
      halfHeight = 0.025;
      radius = 0.08;
      shape = { type: 'cylinder', radius: 0.075, height: 0.05 };
    }
  } else if (def.model === 'crystal') {
    const m = toonUnique({ color: def.color, emissive: def.glow ?? def.color, emissiveIntensity: 0.55, transparent: true, opacity: 0.9 });
    materials.push(m);
    const count = model === 'shard' ? 1 : 3;
    for (let i = 0; i < count; i++) {
      const g = new THREE.OctahedronGeometry(model === 'shard' ? 0.035 : 0.05, 0);
      const c = mesh(g, m);
      c.scale.set(0.7, 1.8, 0.7);
      c.position.set((i - 1) * 0.03, 0.02, (i % 2) * 0.02);
      c.rotation.z = (i - 1) * 0.4;
      group.add(c);
    }
    halfHeight = model === 'shard' ? 0.05 : 0.08;
    radius = 0.07;
    shape = { type: 'box', size: [0.12, halfHeight * 2, 0.08] };
  } else if (def.model === 'feather') {
    const m = mat(def, genericIngredientTex(def.color, def.colorAlt), state, { glow: 0.5 });
    m.side = THREE.DoubleSide;
    materials.push(m);
    const g = new THREE.PlaneGeometry(0.06, model === 'strip' ? 0.12 : 0.26, 1, 4);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      pos.setX(i, pos.getX(i) * (1 - Math.abs(z) * 3));
      pos.setY(i, z * z * 0.8);
    }
    g.computeVertexNormals();
    group.add(mesh(g, m));
    halfHeight = 0.015;
    radius = 0.13;
    shape = { type: 'box', size: [0.08, 0.03, model === 'strip' ? 0.12 : 0.26] };
  } else {
    const m = mat(def, genericIngredientTex(def.color, def.colorAlt), state);
    materials.push(m);
    group.add(mesh(new THREE.IcosahedronGeometry(0.06, 0), m));
    halfHeight = 0.06;
    radius = 0.06;
    shape = { type: 'sphere', radius: 0.06 };
  }

  // Scale by mass (pieces are smaller than the whole).
  group.scale.setScalar(k);
  halfHeight *= k;
  radius *= k;
  shape = scaleShapeDesc(shape, k);
  return { group, halfHeight, radius, shape, materials };
}

function scaleShapeDesc(s: ShapeDesc, k: number): ShapeDesc {
  const off = (o?: { x: number; y: number; z: number }) => (o ? { x: o.x * k, y: o.y * k, z: o.z * k } : undefined);
  switch (s.type) {
    case 'box':
      return { ...s, size: [s.size[0] * k, s.size[1] * k, s.size[2] * k], offset: off(s.offset) };
    case 'sphere':
      return { ...s, radius: s.radius * k, offset: off(s.offset) };
    case 'cylinder':
      return { ...s, radius: s.radius * k, height: s.height * k, offset: off(s.offset) };
    case 'capsule':
      return { ...s, radius: s.radius * k, height: s.height * k, offset: off(s.offset) };
    case 'compound':
      return { type: 'compound', children: s.children.map((c) => scaleShapeDesc(c, k)) };
  }
}
