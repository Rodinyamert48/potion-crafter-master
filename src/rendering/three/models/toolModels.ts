// Hand tools and containers: knife, hammer, mortar & pestle, ladle, bucket,
// bellows, damper lever, firewood and potion flasks.

import * as THREE from 'three';
import type { BottleShape } from '../../../data/types';
import { glass, toon } from '../materials';
import { brass, copper, iron, logBark, logEnd, woodPlank, hearthStone } from '../textures/PixelTextures';
import { createBottleLiquidMaterial } from '../shaders/BottleLiquidMaterial';
import { lathe, mesh } from './common';

const steel = () => toon({ color: '#c0cbdc', emissive: '#262b44', emissiveIntensity: 0.3 });
const wood = () => toon({ map: woodPlank('mid') });
const darkWood = () => toon({ map: woodPlank('dark') });

export function knifeModel(): { group: THREE.Group; tip: THREE.Vector3 } {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, -0.018);
  s.lineTo(0.17, -0.012);
  s.quadraticCurveTo(0.2, 0.0, 0.19, 0.012);
  s.lineTo(0, 0.02);
  s.lineTo(0, -0.018);
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false });
  blade.translate(0.02, 0, -0.003);
  const bm = mesh(blade, steel());
  bm.rotation.x = -Math.PI / 2;
  g.add(bm);
  const edge = mesh(new THREE.BoxGeometry(0.17, 0.004, 0.003), toon({ color: '#ffffff', emissive: '#8b9bb4', emissiveIntensity: 0.4 }));
  edge.position.set(0.11, 0.0, 0.016);
  g.add(edge);
  const handle = mesh(new THREE.BoxGeometry(0.11, 0.026, 0.03), darkWood());
  handle.position.set(-0.045, 0, 0);
  g.add(handle);
  for (const x of [-0.08, -0.02]) {
    const rivet = mesh(new THREE.BoxGeometry(0.008, 0.03, 0.008), toon({ map: brass() }));
    rivet.position.set(x, 0, 0);
    g.add(rivet);
  }
  return { group: g, tip: new THREE.Vector3(0.12, 0, 0) };
}

export function hammerModel(): { group: THREE.Group; head: THREE.Vector3 } {
  const g = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.3, 6), wood());
  handle.rotation.z = Math.PI / 2;
  handle.position.x = -0.05;
  g.add(handle);
  const head = mesh(new THREE.BoxGeometry(0.06, 0.07, 0.12), toon({ map: iron() }));
  head.position.set(0.11, 0, 0);
  g.add(head);
  const face = mesh(new THREE.BoxGeometry(0.064, 0.074, 0.02), steel());
  face.position.set(0.11, 0, 0.065);
  g.add(face);
  return { group: g, head: new THREE.Vector3(0.11, 0, 0) };
}

export const MORTAR_PROFILE: Array<[number, number]> = [
  [0, 0],
  [0.11, 0],
  [0.135, 0.03],
  [0.145, 0.08],
  [0.14, 0.115],
  [0.12, 0.118],
  [0.11, 0.085],
  [0.08, 0.04],
  [0, 0.035],
];

export function mortarModel(): THREE.Group {
  const g = new THREE.Group();
  const bowl = mesh(lathe(MORTAR_PROFILE, 12), toon({ map: hearthStone(), color: '#c0cbdc' }));
  g.add(bowl);
  return g;
}

export function pestleModel(golden = false): THREE.Group {
  const g = new THREE.Group();
  const m = golden ? toon({ map: brass(), emissive: '#feae34', emissiveIntensity: 0.2 }) : toon({ map: hearthStone(), color: '#e0e4ee' });
  const body = mesh(lathe([
    [0, 0],
    [0.028, 0.01],
    [0.032, 0.04],
    [0.02, 0.12],
    [0.022, 0.2],
    [0.012, 0.215],
    [0, 0.217],
  ], 8), m);
  g.add(body);
  return g;
}

export function ladleModel(): { group: THREE.Group; bowl: THREE.Object3D } {
  const g = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.0, 6), wood());
  handle.position.y = 0.5;
  g.add(handle);
  const bowl = mesh(new THREE.SphereGeometry(0.07, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon({ map: copper() }));
  bowl.material = toon({ map: copper(), side: THREE.DoubleSide });
  bowl.position.y = 0.0;
  g.add(bowl);
  const cap = mesh(new THREE.SphereGeometry(0.024, 6, 4), toon({ map: brass() }));
  cap.position.y = 1.0;
  g.add(cap);
  return { group: g, bowl };
}

export function bucketModel(): { group: THREE.Group; water: THREE.Mesh } {
  const g = new THREE.Group();
  const body = mesh(lathe([
    [0.1, 0],
    [0.13, 0.24],
    [0.12, 0.24],
    [0.09, 0.02],
    [0, 0.02],
  ], 10), toon({ map: woodPlank('light'), side: THREE.DoubleSide }));
  g.add(body);
  for (const y of [0.04, 0.2]) {
    const band = mesh(new THREE.TorusGeometry(0.105 + y * 0.12, 0.008, 4, 12), toon({ map: iron() }));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  const handle = mesh(new THREE.TorusGeometry(0.12, 0.007, 4, 10, Math.PI), toon({ map: iron() }));
  handle.position.y = 0.24;
  g.add(handle);
  const water = mesh(new THREE.CircleGeometry(0.12, 12), toon({ color: '#3b8fd6', emissive: '#124e89', emissiveIntensity: 0.5 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.2;
  water.castShadow = false;
  g.add(water);
  return { group: g, water };
}

export interface BellowsParts {
  group: THREE.Group;
  top: THREE.Group;
  bag: THREE.Mesh;
  handle: THREE.Object3D;
}

export function bellowsModel(): BellowsParts {
  const g = new THREE.Group();
  const paddle = new THREE.Shape();
  paddle.moveTo(0, -0.12);
  paddle.quadraticCurveTo(0.34, -0.2, 0.36, 0);
  paddle.quadraticCurveTo(0.34, 0.2, 0, 0.12);
  paddle.lineTo(0, -0.12);
  const pg = new THREE.ExtrudeGeometry(paddle, { depth: 0.025, bevelEnabled: false });
  pg.rotateX(-Math.PI / 2);
  const bottom = mesh(pg, wood());
  g.add(bottom);
  const top = new THREE.Group();
  const topBoard = mesh(pg.clone(), wood());
  top.add(topBoard);
  const handle = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), darkWood());
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0.4, 0.02, 0);
  top.add(handle);
  top.position.y = 0.1;
  g.add(top);
  const bag = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10), toon({ color: '#733e39' }));
  bag.scale.set(1.1, 1, 0.8);
  bag.position.set(0.18, 0.05, 0);
  g.add(bag);
  const nozzle = mesh(new THREE.ConeGeometry(0.035, 0.18, 6), toon({ map: brass() }));
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(-0.08, 0.05, 0);
  g.add(nozzle);
  return { group: g, top, bag, handle };
}

export function leverModel(): { group: THREE.Group; arm: THREE.Group } {
  const g = new THREE.Group();
  const plate = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.03), toon({ map: iron() }));
  g.add(plate);
  const arm = new THREE.Group();
  const bar = mesh(new THREE.BoxGeometry(0.03, 0.24, 0.03), toon({ map: iron() }));
  bar.position.y = 0.12;
  arm.add(bar);
  const knob = mesh(new THREE.SphereGeometry(0.035, 6, 4), toon({ color: '#a22633' }));
  knob.position.y = 0.25;
  arm.add(knob);
  arm.position.z = 0.03;
  g.add(arm);
  return { group: g, arm };
}

export function logModel(): THREE.Mesh {
  const side = toon({ map: logBark() });
  const end = toon({ map: logEnd() });
  const m = mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.34, 7), [side, end, end]);
  m.rotation.z = Math.PI / 2;
  return m;
}

// ---------------------------------------------------------------------------
// Flasks
// ---------------------------------------------------------------------------

export const BOTTLE_PROFILES: Record<BottleShape, Array<[number, number]>> = {
  round: [
    [0, 0],
    [0.03, 0],
    [0.056, 0.02],
    [0.066, 0.055],
    [0.06, 0.085],
    [0.04, 0.108],
    [0.019, 0.122],
    [0.018, 0.16],
    [0.023, 0.166],
  ],
  heart: [
    [0, 0],
    [0.02, 0],
    [0.06, 0.04],
    [0.07, 0.07],
    [0.055, 0.1],
    [0.02, 0.118],
    [0.018, 0.16],
    [0.023, 0.166],
  ],
  skull: [
    [0, 0],
    [0.045, 0],
    [0.05, 0.02],
    [0.06, 0.07],
    [0.05, 0.1],
    [0.02, 0.115],
    [0.018, 0.155],
    [0.023, 0.16],
  ],
  tall: [
    [0, 0],
    [0.036, 0],
    [0.041, 0.012],
    [0.041, 0.13],
    [0.03, 0.152],
    [0.016, 0.162],
    [0.016, 0.205],
    [0.021, 0.21],
  ],
  flask: [
    [0, 0],
    [0.062, 0],
    [0.064, 0.012],
    [0.026, 0.112],
    [0.018, 0.122],
    [0.018, 0.165],
    [0.022, 0.17],
  ],
  vial: [
    [0, 0],
    [0.022, 0],
    [0.025, 0.012],
    [0.025, 0.155],
    [0.028, 0.16],
  ],
};

export interface FlaskParts {
  group: THREE.Group;
  liquid: THREE.Mesh | null;
  liquidMat: THREE.ShaderMaterial | null;
  cork: THREE.Mesh;
  height: number;
  radius: number;
  /** Height of the liquid top when full (local). */
  fullLevel: number;
}

export function flaskModel(shape: BottleShape, liquid?: { color: string; color2: string }): FlaskParts {
  const g = new THREE.Group();
  const prof = BOTTLE_PROFILES[shape];
  const height = prof[prof.length - 1][1];
  const radius = Math.max(...prof.map((p) => p[0]));
  const glassMesh = mesh(lathe(prof, 10), glass('#d8f0ff', 0.28), { cast: false });
  glassMesh.renderOrder = 5;
  let liq: THREE.Mesh | null = null;
  let liqMat: THREE.ShaderMaterial | null = null;
  const neckY = prof[prof.length - 3]?.[1] ?? height * 0.7;
  const fullLevel = Math.min(neckY, height * 0.72);
  if (liquid) {
    liqMat = createBottleLiquidMaterial(liquid.color, liquid.color2);
    const inner = prof
      .filter((p) => p[1] <= neckY + 0.001)
      .map(([r, y]) => [Math.max(0, r * 0.86 - 0.002), Math.max(0.004, y)] as [number, number]);
    inner.unshift([0, 0.004]);
    liq = mesh(lathe(inner, 10), liqMat, { cast: false, receive: false });
    liq.renderOrder = 4;
    g.add(liq);
  }
  g.add(glassMesh);
  const cork = mesh(new THREE.CylinderGeometry(0.02, 0.017, 0.03, 6), toon({ color: '#b86f50' }));
  cork.position.y = height + 0.005;
  g.add(cork);
  cork.visible = !!liquid;
  // Center vertically so the physics body (cylinder) matches.
  for (const c of g.children) c.position.y -= height / 2;
  return { group: g, liquid: liq, liquidMat: liqMat, cork, height, radius, fullLevel: fullLevel - height / 2 };
}
