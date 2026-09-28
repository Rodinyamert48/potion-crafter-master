// Furniture and work stations: cauldron, hearth, tables, shelves, counter,
// barrel, crates, lectern, armchair, bookshelf, door, window, drying rack.

import * as THREE from 'three';
import { toon } from '../materials';
import {
  bookSpines,
  brass,
  copper,
  cuttingBoard,
  hearthStone,
  iron,
  logBark,
  logEnd,
  repeated,
  straw,
  woodBeam,
  woodPlank,
  cloth,
} from '../textures/PixelTextures';
import { at, box, cyl, lathe, mesh } from './common';

export const CAULDRON_OUTER: Array<[number, number]> = [
  [0, 0],
  [0.34, 0],
  [0.52, 0.08],
  [0.63, 0.22],
  [0.66, 0.36],
  [0.63, 0.52],
  [0.56, 0.65],
  [0.53, 0.72],
  [0.58, 0.75],
  [0.6, 0.79],
];

export const CAULDRON_INNER: Array<[number, number]> = [
  [0.53, 0.79],
  [0.5, 0.73],
  [0.53, 0.64],
  [0.59, 0.51],
  [0.61, 0.36],
  [0.58, 0.23],
  [0.48, 0.11],
  [0.31, 0.06],
  [0, 0.06],
];

export interface CauldronParts {
  group: THREE.Group;
  body: THREE.Mesh;
  material: THREE.MeshToonMaterial;
}

export function cauldronModel(variant: 'iron' | 'copper' | 'magic' = 'iron'): CauldronParts {
  const g = new THREE.Group();
  const map = variant === 'copper' ? copper() : iron();
  const material = toon({ map, color: variant === 'iron' ? '#b8c0dc' : '#ffffff', emissive: variant === 'magic' ? '#68386c' : '#262b44', emissiveIntensity: variant === 'magic' ? 0.35 : 0.45 }).clone();
  const profile = [...CAULDRON_OUTER, ...CAULDRON_INNER];
  const body = mesh(lathe(profile, 14), material);
  g.add(body);
  // Rim ring
  const rim = mesh(new THREE.TorusGeometry(0.575, 0.03, 4, 14), toon({ map: variant === 'iron' ? iron() : brass() }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.785;
  g.add(rim);
  // Handles
  for (const s of [-1, 1]) {
    const h = mesh(new THREE.TorusGeometry(0.1, 0.018, 4, 8, Math.PI), toon({ map: iron() }));
    h.position.set(s * 0.64, 0.58, 0);
    h.rotation.set(0, Math.PI / 2, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.add(h);
  }
  // Legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const leg = mesh(box(0.07, 0.16, 0.07), toon({ map: iron() }));
    leg.position.set(Math.cos(a) * 0.45, 0.02, Math.sin(a) * 0.45);
    leg.rotation.y = -a;
    g.add(leg);
  }
  if (variant === 'magic') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rune = mesh(box(0.05, 0.08, 0.01), toon({ color: '#2ce8f5', emissive: '#2ce8f5', emissiveIntensity: 1.2 }));
      rune.position.set(Math.cos(a) * 0.655, 0.4, Math.sin(a) * 0.655);
      rune.rotation.y = -a + Math.PI / 2;
      g.add(rune);
    }
  }
  return { group: g, body, material };
}

export function cauldronInnerRadius(yLocal: number): number {
  // Interpolate along the inner profile (which runs top → bottom).
  const pts = CAULDRON_INNER;
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i];
    const [r1, y1] = pts[i + 1];
    if (yLocal <= y0 && yLocal >= y1) {
      const t = (yLocal - y1) / (y0 - y1);
      return r1 + (r0 - r1) * t;
    }
  }
  return 0.5;
}

export interface HearthParts {
  group: THREE.Group;
  coals: THREE.Mesh;
  coalMat: THREE.MeshToonMaterial;
}

/** Round stone hearth with an opening facing +Z. */
export function hearthModel(outer = 0.95, inner = 0.66, height = 0.36): HearthParts {
  const g = new THREE.Group();
  const gap = 0.9; // radians opening at the front
  const start = Math.PI / 2 + gap / 2; // three.js lathe phi measured from +z? (x = sin(phi), z = cos(phi))
  const ring = mesh(
    lathe([
      [inner, 0],
      [outer, 0],
      [outer, height * 0.9],
      [outer - 0.04, height],
      [inner + 0.03, height],
      [inner, height * 0.92],
      [inner, 0],
    ], 16, gap / 2, Math.PI * 2 - gap),
    toon({ map: repeated(hearthStone(), 3, 1), color: '#e0d0d8', emissive: '#3e2731', emissiveIntensity: 0.3 }),
  );
  void start;
  g.add(ring);
  // End caps of the opening
  for (const s of [-1, 1]) {
    const a = s * (gap / 2);
    const cap = mesh(box(outer - inner, height, 0.06), toon({ map: hearthStone() }));
    const r = (outer + inner) / 2;
    cap.position.set(Math.sin(a) * r, height / 2, Math.cos(a) * r);
    cap.rotation.y = a + Math.PI / 2;
    g.add(cap);
  }
  // Fire pit
  const coalMat = toon({ color: '#3e2731', emissive: '#e43b44', emissiveIntensity: 0.6 }).clone();
  const coals = mesh(new THREE.CircleGeometry(inner, 14), coalMat, { cast: false });
  coals.rotation.x = -Math.PI / 2;
  coals.position.y = 0.02;
  g.add(coals);
  // Burning logs in the pit
  for (let i = 0; i < 3; i++) {
    const log = mesh(cyl(0.05, 0.05, 0.55, 6), [toon({ map: logBark(), color: '#6a5050' }), toon({ map: logEnd() }), toon({ map: logEnd() })]);
    log.rotation.set(Math.PI / 2, (i / 3) * Math.PI, 0);
    log.position.set(0, 0.06 + i * 0.03, 0);
    g.add(log);
  }
  return { group: g, coals, coalMat };
}

export function tableModel(w: number, d: number, h: number, tone: 'light' | 'mid' | 'dark' = 'mid'): { group: THREE.Group; top: THREE.Mesh } {
  const g = new THREE.Group();
  const top = mesh(box(w, 0.07, d), toon({ map: repeated(woodPlank(tone), Math.max(1, Math.round(w * 2)), 1) }));
  top.position.y = h - 0.035;
  g.add(top);
  const legMat = toon({ map: woodBeam() });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = mesh(box(0.08, h - 0.07, 0.08), legMat);
      leg.position.set(sx * (w / 2 - 0.08), (h - 0.07) / 2, sz * (d / 2 - 0.08));
      g.add(leg);
    }
  const stretcher = mesh(box(w - 0.2, 0.05, 0.05), legMat);
  stretcher.position.set(0, 0.18, 0);
  g.add(stretcher);
  return { group: g, top };
}

export function cabinetModel(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(box(w, h, d), toon({ map: repeated(woodPlank('dark'), Math.round(w * 2), 1) }));
  body.position.y = h / 2;
  g.add(body);
  const top = mesh(box(w + 0.06, 0.05, d + 0.06), toon({ map: repeated(woodPlank('mid'), Math.round(w * 2), 1) }));
  top.position.y = h + 0.025;
  g.add(top);
  // drawer fronts
  const n = Math.max(2, Math.round(w / 0.6));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    const drawer = mesh(box(w / n - 0.06, h * 0.28, 0.02), toon({ map: woodPlank('mid') }));
    drawer.position.set(x, h * 0.72, d / 2 + 0.01);
    g.add(drawer);
    const knob = mesh(box(0.04, 0.03, 0.03), toon({ map: brass() }));
    knob.position.set(x, h * 0.72, d / 2 + 0.03);
    g.add(knob);
  }
  return g;
}

export function shelfModel(w: number, d: number, levels: number[], sideH: number): { group: THREE.Group; boards: THREE.Mesh[] } {
  const g = new THREE.Group();
  const boards: THREE.Mesh[] = [];
  const mat = toon({ map: repeated(woodPlank('mid'), Math.round(w * 2), 1) });
  for (const y of levels) {
    const b = mesh(box(w, 0.04, d), mat);
    b.position.y = y;
    g.add(b);
    boards.push(b);
    // brackets
    for (const s of [-1, 1]) {
      const br = mesh(box(0.04, 0.12, d * 0.8), toon({ map: woodBeam() }));
      br.position.set(s * (w / 2 - 0.08), y - 0.08, -d * 0.05);
      g.add(br);
    }
  }
  void sideH;
  return { group: g, boards };
}

export function counterModel(w: number, h: number, d: number): { group: THREE.Group; top: THREE.Mesh } {
  const g = new THREE.Group();
  const front = mesh(box(w, h - 0.06, d), toon({ map: repeated(woodPlank('dark'), Math.round(w * 3), 1) }));
  front.position.y = (h - 0.06) / 2;
  g.add(front);
  const top = mesh(box(w + 0.1, 0.06, d + 0.12), toon({ map: repeated(woodPlank('light'), Math.round(w * 2), 1) }));
  top.position.y = h - 0.03;
  g.add(top);
  // Panels on the player-facing side
  for (let i = 0; i < 4; i++) {
    const p = mesh(box(w / 4 - 0.1, h * 0.55, 0.02), toon({ map: woodPlank('mid') }));
    p.position.set(-w / 2 + (i + 0.5) * (w / 4), h * 0.45, d / 2 + 0.01);
    g.add(p);
  }
  return { group: g, top };
}

export function barrelModel(r: number, h: number): { group: THREE.Group; water: THREE.Mesh } {
  const g = new THREE.Group();
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    profile.push([r * (0.86 + 0.14 * Math.sin(t * Math.PI)), t * h]);
  }
  const body = mesh(lathe(profile, 12), toon({ map: repeated(woodPlank('mid'), 3, 1), side: THREE.DoubleSide }));
  g.add(body);
  for (const t of [0.12, 0.5, 0.88]) {
    const band = mesh(new THREE.TorusGeometry(r * (0.86 + 0.14 * Math.sin(t * Math.PI)) + 0.005, 0.012, 4, 14), toon({ map: iron() }));
    band.rotation.x = Math.PI / 2;
    band.position.y = t * h;
    g.add(band);
  }
  const water = mesh(new THREE.CircleGeometry(r * 0.84, 14), toon({ color: '#2f7fc6', emissive: '#124e89', emissiveIntensity: 0.55 }), { cast: false });
  water.rotation.x = -Math.PI / 2;
  water.position.y = h * 0.9;
  g.add(water);
  return { group: g, water };
}

export function crateModel(w: number, h: number, d: number, open = true): THREE.Group {
  const g = new THREE.Group();
  const mat = toon({ map: woodPlank('light') });
  const edge = toon({ map: woodBeam() });
  const t = 0.025;
  const parts: Array<[number, number, number, number, number, number]> = [
    [0, t / 2, 0, w, t, d],
    [0, h / 2, d / 2 - t / 2, w, h, t],
    [0, h / 2, -d / 2 + t / 2, w, h, t],
    [w / 2 - t / 2, h / 2, 0, t, h, d],
    [-w / 2 + t / 2, h / 2, 0, t, h, d],
  ];
  if (!open) parts.push([0, h - t / 2, 0, w, t, d]);
  for (const [x, y, z, bw, bh, bd] of parts) at(mesh(box(bw, bh, bd), mat), x, y, z, g);
  for (const s of [-1, 1]) at(mesh(box(0.04, h, 0.04), edge), s * (w / 2), h / 2, d / 2, g);
  for (const s of [-1, 1]) at(mesh(box(0.04, h, 0.04), edge), s * (w / 2), h / 2, -d / 2, g);
  return g;
}

export function boardModel(): THREE.Mesh {
  return mesh(box(0.7, 0.04, 0.44), toon({ map: cuttingBoard() }));
}

export function lecternModel(): { group: THREE.Group; top: THREE.Object3D } {
  const g = new THREE.Group();
  const post = mesh(box(0.12, 1.0, 0.12), toon({ map: woodBeam() }));
  post.position.y = 0.5;
  g.add(post);
  const base = mesh(box(0.5, 0.06, 0.4), toon({ map: woodPlank('dark') }));
  base.position.y = 0.03;
  g.add(base);
  const top = mesh(box(0.6, 0.05, 0.45), toon({ map: woodPlank('dark') }));
  top.position.y = 1.05;
  top.rotation.x = 0.35;
  g.add(top);
  return { group: g, top };
}

export function bookModel(open = true, color = '#68386c'): THREE.Group {
  const g = new THREE.Group();
  if (open) {
    const cover = mesh(box(0.5, 0.02, 0.34), toon({ color }));
    g.add(cover);
    for (const s of [-1, 1]) {
      const page = mesh(box(0.23, 0.03, 0.31), toon({ color: '#ead4aa', emissive: '#ead4aa', emissiveIntensity: 0.15 }));
      page.position.set(s * 0.12, 0.022, 0);
      page.rotation.z = -s * 0.06;
      g.add(page);
    }
  } else {
    const b = mesh(box(0.18, 0.05, 0.24), toon({ color }));
    g.add(b);
  }
  return g;
}

export function armchairModel(): THREE.Group {
  const g = new THREE.Group();
  const fabric = toon({ map: cloth('#a22633') });
  const woodM = toon({ map: woodPlank('dark') });
  at(mesh(box(0.8, 0.12, 0.7), fabric), 0, 0.42, 0, g);
  at(mesh(box(0.8, 0.8, 0.14), fabric), 0, 0.82, -0.3, g);
  for (const s of [-1, 1]) at(mesh(box(0.14, 0.34, 0.7), fabric), s * 0.4, 0.6, 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) at(mesh(box(0.07, 0.36, 0.07), woodM), sx * 0.36, 0.18, sz * 0.3, g);
  return g;
}

export function bookshelfModel(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const wood = toon({ map: woodPlank('dark') });
  at(mesh(box(w, h, 0.04), wood), 0, h / 2, -d / 2 + 0.02, g);
  for (const s of [-1, 1]) at(mesh(box(0.05, h, d), wood), s * (w / 2 - 0.025), h / 2, 0, g);
  const rows = 4;
  const books = toon({ map: bookSpines() });
  for (let i = 0; i <= rows; i++) {
    const y = 0.06 + (i * (h - 0.1)) / rows;
    at(mesh(box(w, 0.04, d), wood), 0, y, 0, g);
    if (i < rows) {
      const bh = (h - 0.1) / rows - 0.06;
      const bk = mesh(box(w - 0.12, bh, d * 0.75), books);
      bk.position.set(0, y + 0.02 + bh / 2, 0.02);
      // Randomise which part of the spine atlas shows per row.
      const mat = books.clone();
      const tex = bookSpines().clone();
      tex.offset.set(i * 0.23, 0);
      tex.repeat.set(1.4, 1);
      tex.wrapS = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      mat.map = tex;
      bk.material = mat;
      g.add(bk);
    }
  }
  return g;
}

export function doorModel(w: number, h: number): { group: THREE.Group; leaf: THREE.Group } {
  const g = new THREE.Group();
  const frameMat = toon({ map: woodBeam() });
  at(mesh(box(0.1, h + 0.1, 0.18), frameMat), -w / 2 - 0.05, (h + 0.1) / 2, 0, g);
  at(mesh(box(0.1, h + 0.1, 0.18), frameMat), w / 2 + 0.05, (h + 0.1) / 2, 0, g);
  at(mesh(box(w + 0.2, 0.12, 0.18), frameMat), 0, h + 0.06, 0, g);
  const leaf = new THREE.Group();
  const panel = mesh(box(w, h, 0.06), toon({ map: repeated(woodPlank('mid'), 2, 1) }));
  panel.position.set(w / 2, h / 2, 0);
  leaf.add(panel);
  for (const y of [0.3, h - 0.35]) {
    const hinge = mesh(box(w * 0.5, 0.05, 0.075), toon({ map: iron() }));
    hinge.position.set(w * 0.25, y, 0.01);
    leaf.add(hinge);
  }
  const handle = mesh(new THREE.TorusGeometry(0.04, 0.01, 4, 8), toon({ map: brass() }));
  handle.position.set(w - 0.12, h * 0.48, 0.05);
  leaf.add(handle);
  const window = mesh(box(0.26, 0.26, 0.07), toon({ color: '#fee761', emissive: '#feae34', emissiveIntensity: 0.25 }));
  window.position.set(w / 2, h * 0.75, 0);
  leaf.add(window);
  leaf.position.set(-w / 2, 0, 0);
  g.add(leaf);
  return { group: g, leaf };
}

export function windowModel(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const frame = toon({ map: woodBeam() });
  at(mesh(box(w + 0.16, 0.1, 0.22), frame), 0, -h / 2 - 0.05, 0.02, g);
  at(mesh(box(w + 0.16, 0.1, 0.16), frame), 0, h / 2 + 0.05, 0, g);
  at(mesh(box(0.08, h, 0.16), frame), -w / 2 - 0.04, 0, 0, g);
  at(mesh(box(0.08, h, 0.16), frame), w / 2 + 0.04, 0, 0, g);
  at(mesh(box(0.04, h, 0.06), frame), 0, 0, 0, g);
  at(mesh(box(w, 0.04, 0.06), frame), 0, 0, 0, g);
  return g;
}

export function dryingRackModel(width: number, height: number): { group: THREE.Group; hooks: THREE.Vector3[]; bar: THREE.Mesh } {
  const g = new THREE.Group();
  const woodM = toon({ map: woodBeam() });
  for (const s of [-1, 1]) {
    const legA = mesh(box(0.05, height * 1.05, 0.05), woodM);
    legA.position.set(s * (width / 2), height / 2, 0.14);
    legA.rotation.x = -0.26;
    g.add(legA);
    const legB = mesh(box(0.05, height * 1.05, 0.05), woodM);
    legB.position.set(s * (width / 2), height / 2, -0.14);
    legB.rotation.x = 0.26;
    g.add(legB);
  }
  const bar = mesh(new THREE.CylinderGeometry(0.025, 0.025, width + 0.1, 6), woodM);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = height;
  g.add(bar);
  const hooks: THREE.Vector3[] = [];
  const n = 3;
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + ((i + 0.5) * width) / n;
    const hook = mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 8, Math.PI * 1.3), toon({ map: iron() }));
    hook.position.set(x, height - 0.05, 0);
    g.add(hook);
    const twine = mesh(box(0.008, 0.06, 0.008), toon({ map: straw() }));
    twine.position.set(x, height - 0.02, 0);
    g.add(twine);
    hooks.push(new THREE.Vector3(x, height - 0.09, 0));
  }
  return { group: g, hooks, bar };
}

export function stoolModel(h = 0.5): THREE.Group {
  const g = new THREE.Group();
  at(mesh(cyl(0.22, 0.22, 0.06, 10), toon({ map: woodPlank('mid') })), 0, h, 0, g);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(box(0.05, h, 0.05), toon({ map: woodBeam() }));
    leg.position.set(Math.cos(a) * 0.15, h / 2, Math.sin(a) * 0.15);
    g.add(leg);
  }
  return g;
}

export function cashBoxModel(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(box(0.34, 0.14, 0.24), toon({ map: woodPlank('dark') })), 0, 0.07, 0, g);
  at(mesh(box(0.36, 0.03, 0.26), toon({ map: brass() })), 0, 0.15, 0, g);
  for (let i = 0; i < 5; i++) {
    const c = mesh(cyl(0.025, 0.025, 0.008, 8), toon({ color: '#feae34', emissive: '#feae34', emissiveIntensity: 0.25 }));
    c.position.set(-0.08 + i * 0.04, 0.17 + (i % 2) * 0.008, 0.02 * (i % 3));
    g.add(c);
  }
  return g;
}

export function bellModel(): THREE.Group {
  const g = new THREE.Group();
  at(mesh(cyl(0.06, 0.07, 0.015, 10), toon({ map: woodPlank('dark') })), 0, 0.008, 0, g);
  const dome = mesh(new THREE.SphereGeometry(0.055, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), toon({ map: brass() }));
  dome.position.y = 0.015;
  g.add(dome);
  at(mesh(cyl(0.008, 0.008, 0.03, 6), toon({ map: brass() })), 0, 0.08, 0, g);
  return g;
}

export function woodPileModel(count: number): THREE.Group {
  const g = new THREE.Group();
  const side = toon({ map: logBark() });
  const end = toon({ map: logEnd() });
  let placed = 0;
  for (let row = 0; placed < count && row < 4; row++) {
    const inRow = Math.max(1, 4 - row);
    for (let i = 0; i < inRow && placed < count; i++) {
      const m = mesh(cyl(0.06, 0.065, 0.55, 7), [side, end, end]);
      m.rotation.x = Math.PI / 2;
      m.position.set((i - (inRow - 1) / 2) * 0.13, 0.065 + row * 0.11, 0);
      m.rotation.y = (Math.random() - 0.5) * 0.15;
      g.add(m);
      placed++;
    }
  }
  return g;
}

export function signModel(): { group: THREE.Group; board: THREE.Mesh } {
  const g = new THREE.Group();
  const board = mesh(box(0.5, 0.26, 0.04), toon({ map: woodPlank('light') }));
  g.add(board);
  for (const s of [-1, 1]) {
    const chain = mesh(box(0.01, 0.16, 0.01), toon({ map: iron() }));
    chain.position.set(s * 0.18, 0.2, 0);
    g.add(chain);
  }
  return { group: g, board };
}
