// Decorations that make the shop feel lived in: candles, bottles, jars,
// crystals, skulls, plants, hanging herbs, broom, cobwebs, maps, rugs.

import * as THREE from 'three';
import { glass, toon, unlit } from '../materials';
import {
  candleWax,
  cobweb,
  leafSprite,
  parchmentMap,
  rug,
  straw,
  woodBeam,
  batWingTex,
  dragonScaleTex,
  jarLabel,
  brass,
} from '../textures/PixelTextures';
import { createFlame } from '../shaders/FlameMaterial';
import { BOTTLE_PROFILES } from './toolModels';
import { at, box, cyl, lathe, mesh, quad } from './common';
import type { BottleShape } from '../../../data/types';

export function candleModel(h = 0.12): { group: THREE.Group; flame: THREE.Mesh; tip: THREE.Vector3 } {
  const g = new THREE.Group();
  const holder = mesh(cyl(0.05, 0.06, 0.02, 8), toon({ map: brass() }));
  holder.position.y = 0.01;
  g.add(holder);
  const wax = mesh(cyl(0.022, 0.024, h, 7), toon({ map: candleWax(), emissive: '#feae34', emissiveIntensity: 0.12 }));
  wax.position.y = 0.02 + h / 2;
  g.add(wax);
  const flame = createFlame(0.05, 0.09, { grid: [5, 8] });
  flame.position.y = 0.02 + h + 0.005;
  g.add(flame);
  return { group: g, flame, tip: new THREE.Vector3(0, 0.02 + h + 0.04, 0) };
}

export function decorBottle(shape: BottleShape, color: string, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const prof = BOTTLE_PROFILES[shape];
  const liquid = mesh(
    lathe(prof.filter((p) => p[1] < prof[prof.length - 1][1] * 0.62).map(([r, y]) => [r * 0.85, y] as [number, number]).concat([[0, prof[prof.length - 1][1] * 0.6]]), 8),
    toon({ color, emissive: color, emissiveIntensity: 0.45 }),
    { cast: false },
  );
  g.add(liquid);
  const gl = mesh(lathe(prof, 8), glass('#d8f0ff', 0.3), { cast: false });
  g.add(gl);
  const cork = mesh(cyl(0.02, 0.017, 0.03, 6), toon({ color: '#b86f50' }));
  cork.position.y = prof[prof.length - 1][1] + 0.005;
  g.add(cork);
  g.scale.setScalar(scale);
  return g;
}

export function jarModel(ingredientId: string | null, contentColor: string, r = 0.1, h = 0.2): THREE.Group {
  const g = new THREE.Group();
  const contents = mesh(cyl(r * 0.85, r * 0.85, h * 0.7, 8), toon({ color: contentColor, emissive: contentColor, emissiveIntensity: 0.2 }), { cast: false });
  contents.position.y = h * 0.36;
  g.add(contents);
  const gl = mesh(lathe([
    [0, 0],
    [r, 0],
    [r, h * 0.9],
    [r * 0.8, h],
    [r * 0.8, h * 1.08],
  ], 10), glass('#e8f8ff', 0.25), { cast: false });
  g.add(gl);
  const lid = mesh(cyl(r * 0.85, r * 0.85, 0.03, 10), toon({ color: '#733e39' }));
  lid.position.y = h * 1.1;
  g.add(lid);
  if (ingredientId) {
    const label = quad(r * 1.1, r * 1.1, toon({ map: jarLabel(ingredientId) }));
    label.position.set(0, h * 0.45, r + 0.003);
    g.add(label);
  }
  return g;
}

export function crystalCluster(color: string, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const m = toon({ color, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0.92 });
  const base = mesh(new THREE.DodecahedronGeometry(0.08, 0), toon({ color: '#5a6988' }));
  base.scale.set(1.2, 0.4, 1);
  g.add(base);
  for (let i = 0; i < 5; i++) {
    const c = mesh(new THREE.OctahedronGeometry(0.05, 0), m);
    const a = (i / 5) * Math.PI * 2;
    c.scale.set(0.6, 1.6 + Math.random() * 1.2, 0.6);
    c.position.set(Math.cos(a) * 0.04, 0.08, Math.sin(a) * 0.04);
    c.rotation.set(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4);
    g.add(c);
  }
  g.scale.setScalar(scale);
  return g;
}

export function skullModel(): THREE.Group {
  const g = new THREE.Group();
  const bone = toon({ color: '#ead4aa' });
  const head = mesh(new THREE.DodecahedronGeometry(0.08, 0), bone);
  head.scale.set(1, 0.95, 1.1);
  head.position.y = 0.08;
  g.add(head);
  const jaw = mesh(box(0.1, 0.04, 0.08), bone);
  jaw.position.set(0, 0.02, 0.03);
  g.add(jaw);
  for (const s of [-1, 1]) {
    const eye = mesh(box(0.03, 0.03, 0.02), toon({ color: '#181425', emissive: '#63c74d', emissiveIntensity: 0.4 }));
    eye.position.set(s * 0.03, 0.09, 0.085);
    g.add(eye);
  }
  const candle = candleModel(0.08);
  candle.group.position.y = 0.15;
  candle.group.scale.setScalar(0.8);
  g.add(candle.group);
  g.userData.flame = candle.flame;
  return g;
}

export function pottedPlant(color = '#3e8948', potColor = '#b86f50'): THREE.Group {
  const g = new THREE.Group();
  const pot = mesh(lathe([
    [0.08, 0],
    [0.11, 0.15],
    [0.12, 0.16],
    [0.12, 0.18],
    [0, 0.18],
  ], 8), toon({ color: potColor }));
  g.add(pot);
  const leaves = leafSprite(color);
  for (let i = 0; i < 2; i++) {
    const q = quad(0.4, 0.4, toon({ map: leaves, alphaTest: 0.5, side: THREE.DoubleSide }));
    q.position.y = 0.36;
    q.rotation.y = i * (Math.PI / 2);
    g.add(q);
  }
  return g;
}

export function herbBundle(color: string): THREE.Group {
  const g = new THREE.Group();
  const stringM = toon({ map: straw() });
  const twine = mesh(box(0.01, 0.25, 0.01), stringM);
  twine.position.y = -0.12;
  g.add(twine);
  const leaves = leafSprite(color);
  for (let i = 0; i < 2; i++) {
    const q = quad(0.26, 0.3, toon({ map: leaves, alphaTest: 0.5, side: THREE.DoubleSide }));
    q.position.y = -0.36;
    q.rotation.set(Math.PI, i * (Math.PI / 2), 0);
    g.add(q);
  }
  return g;
}

export function hangingWing(): THREE.Group {
  const g = new THREE.Group();
  const twine = mesh(box(0.008, 0.2, 0.008), toon({ map: straw() }));
  twine.position.y = -0.1;
  g.add(twine);
  const w = quad(0.3, 0.16, toon({ map: batWingTex(), side: THREE.DoubleSide }));
  w.position.y = -0.26;
  g.add(w);
  return g;
}

export function hangingScales(): THREE.Group {
  const g = new THREE.Group();
  const twine = mesh(box(0.008, 0.5, 0.008), toon({ map: straw() }));
  twine.position.y = -0.25;
  g.add(twine);
  for (let i = 0; i < 3; i++) {
    const s = quad(0.1, 0.12, toon({ map: dragonScaleTex(), side: THREE.DoubleSide, emissive: '#f77622', emissiveIntensity: 0.2 }));
    s.position.y = -0.14 - i * 0.14;
    s.rotation.y = i * 0.7;
    g.add(s);
  }
  return g;
}

export function lanternModel(): { group: THREE.Group; flame: THREE.Mesh } {
  const g = new THREE.Group();
  const frame = toon({ color: '#3a4466' });
  at(mesh(box(0.14, 0.02, 0.14), frame), 0, 0, 0, g);
  at(mesh(box(0.14, 0.02, 0.14), frame), 0, 0.2, 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) at(mesh(box(0.015, 0.2, 0.015), frame), sx * 0.065, 0.1, sz * 0.065, g);
  const gl = mesh(box(0.12, 0.18, 0.12), glass('#fee761', 0.25), { cast: false });
  gl.position.y = 0.1;
  g.add(gl);
  const flame = createFlame(0.06, 0.1, { grid: [5, 8] });
  flame.position.y = 0.04;
  g.add(flame);
  const ring = mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 8), frame);
  ring.position.y = 0.24;
  g.add(ring);
  return { group: g, flame };
}

export function broomModel(): THREE.Group {
  const g = new THREE.Group();
  const stick = mesh(cyl(0.018, 0.022, 1.3, 6), toon({ map: woodBeam() }));
  stick.position.y = 0.85;
  g.add(stick);
  const bristles = mesh(new THREE.ConeGeometry(0.14, 0.4, 8, 1, true), toon({ map: straw(), side: THREE.DoubleSide }));
  bristles.position.y = 0.2;
  bristles.rotation.x = Math.PI;
  g.add(bristles);
  const tie = mesh(cyl(0.035, 0.035, 0.05, 6), toon({ color: '#a22633' }));
  tie.position.y = 0.4;
  g.add(tie);
  return g;
}

export function cobwebQuad(size = 0.6): THREE.Mesh {
  const m = quad(size, size, new THREE.MeshBasicMaterial({ map: cobweb(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  m.userData.noPick = true;
  return m;
}

export function wallMap(): THREE.Group {
  const g = new THREE.Group();
  const m = quad(0.9, 0.68, toon({ map: parchmentMap() }));
  g.add(m);
  for (const [x, y] of [
    [-0.42, 0.31],
    [0.42, 0.31],
  ]) {
    const pin = mesh(cyl(0.015, 0.015, 0.02, 6), toon({ color: '#a22633' }));
    pin.rotation.x = Math.PI / 2;
    pin.position.set(x, y, 0.01);
    g.add(pin);
  }
  return g;
}

export function rugModel(w: number, d: number): THREE.Mesh {
  const m = mesh(new THREE.PlaneGeometry(w, d), toon({ map: rug() }), { cast: false });
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function booksStack(n = 3): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#a22633', '#124e89', '#3e8948', '#68386c', '#733e39'];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = 0.04 + Math.random() * 0.03;
    const b = mesh(box(0.22 - i * 0.02, h, 0.16), toon({ color: colors[(i * 3) % colors.length] }));
    b.position.set((Math.random() - 0.5) * 0.03, y + h / 2, 0);
    b.rotation.y = (Math.random() - 0.5) * 0.4;
    g.add(b);
    y += h;
  }
  return g;
}

export function lightShaft(w: number, h: number, color = '#fff4dc'): THREE.Mesh {
  const mat = unlit(color, { additive: true, opacity: 0.1 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.userData.noPick = true;
  m.renderOrder = 40;
  return m;
}

export function chainModel(len: number): THREE.Group {
  const g = new THREE.Group();
  const m = toon({ color: '#3a4466' });
  const n = Math.round(len / 0.06);
  for (let i = 0; i < n; i++) {
    const link = mesh(new THREE.TorusGeometry(0.025, 0.007, 3, 6), m);
    link.position.y = -i * 0.055;
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
    g.add(link);
  }
  return g;
}
