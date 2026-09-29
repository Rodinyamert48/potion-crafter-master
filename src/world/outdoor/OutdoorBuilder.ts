// Builds the static open world once: terrain (Three.js mesh + Havok triangle
// collider from the same heights), sky dome, water and lava, thousands of
// instanced trees and rocks (chunked so the camera can cull them), the
// outside of the shop, the crossroads signpost, region gates, gathering
// altars, the cavern, the Moon Shrine and the sleeping dragon.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BabylonPhysicsWorld } from '../../physics/BabylonPhysicsWorld';
import type { BodyHandle } from '../../physics/PhysicsTypes';
import { CG } from '../../physics/PhysicsTypes';
import { toonGradient, toon, unlit } from '../../rendering/three/materials';
import { Painter } from '../../rendering/three/textures/Painter';
import { Random } from '../../core/Random';
import type { RegionId } from '../../data/regions';
import {
  BOUNDS,
  CAVERN,
  DOOR,
  DRAGON,
  GARDEN_GATE,
  HOME_R,
  PLAZA,
  PLAZA_R,
  ROADS,
  ROAD_HALF,
  SHOP,
  WATER_Y,
  ZONES,
  ZONE_MAP,
  fbm,
  groundHeight,
  lavaMask,
  poolMask,
  roadDist,
  scatter,
  slopeAt,
  smooth,
  walkMask,
  zoneWeight,
  type V2,
} from './layout';
import {
  altarModel,
  cavernModel,
  dragonModel,
  fence,
  gateModel,
  groundDetail,
  lanternPost,
  pillar,
  ravenModel,
  sceneryGeometry,
  shopExterior,
  signpost,
  twoSidedSign,
  standingStone,
  vertexColorMaterial,
  wellModel,
  type SceneryKind,
} from './OutdoorModels';

export interface GateRef {
  zone: RegionId;
  group: THREE.Group;
  barrier: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  sign: THREE.Object3D;
  pos: V2;
  yaw: number;
  body: BodyHandle | null;
}

export interface AltarRef {
  zone: RegionId;
  pos: THREE.Vector3;
  ring: THREE.Mesh;
  rune: THREE.Mesh;
  light: THREE.PointLight;
}

export interface SkyRef {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
}

export interface WorldRefs {
  terrain: THREE.Mesh;
  sky: SkyRef;
  sun: THREE.DirectionalLight;
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  waterTex: THREE.Texture;
  lavaTex: THREE.Texture;
  lamps: THREE.PointLight[];
  lampMats: THREE.MeshToonMaterial[];
  gates: GateRef[];
  altars: AltarRef[];
  well: THREE.Vector3;
  chimney: THREE.Vector3;
  signpost: THREE.Vector3;
  dragon: ReturnType<typeof dragonModel> & { pos: THREE.Vector3; yaw: number };
  ravens: Array<ReturnType<typeof ravenModel> & { perch: THREE.Vector3; flyT: number }>;
  crystalsLight: THREE.PointLight;
  /** Gather spots per region (plus a few along the roads). */
  spots: Record<RegionId | 'road', V2[]>;
  /** Stinging nettle patches in the forest (day hazard). */
  nettles: V2[];
}

const rng = new Random(20260929);

/** Merges static decoration into one mesh per material (far fewer draw calls). */
class StaticBatch {
  private readonly parts = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();

  /** Take every mesh under `root` into the batch and drop `root` from the scene. */
  absorb(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || !m.visible) return;
      const mat = m.material as THREE.Material;
      const key = `${mat.uuid}:${m.castShadow}`;
      let entry = this.parts.get(key);
      if (!entry) this.parts.set(key, (entry = { mat, cast: m.castShadow, geos: [] }));
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      entry.geos.push(g);
    });
    root.removeFromParent();
  }

  build(scene: THREE.Scene): void {
    for (const { mat, cast, geos } of this.parts.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    this.parts.clear();
  }
}

function V(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

function quatY(yaw: number) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

const C = (hex: string) => new THREE.Color(hex);
const GRASS = C('#3a4a32');
const HILL = C('#26301f');
const ROCK = C('#4a4a52');
const DIRT = C('#5a4a3a');
const DIRT_EDGE = C('#46392e');
const COBBLE = C('#5a5660');
const COBBLE2 = C('#4a4652');
const MUD = C('#2a3024');
const BASALT = C('#2a1a1a');
const RING = C('#6a7088');
const ZONE_COLORS = ZONES.map((z) => C(z.color));

function groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
  const walk = walkMask(x, z);
  out.copy(GRASS);
  ZONES.forEach((zn, i) => {
    const w = zoneWeight(zn, x, z);
    if (w > 0) out.lerp(ZONE_COLORS[i], w);
  });
  out.lerp(HILL, (1 - walk) * 0.85);
  const slope = slopeAt(x, z);
  out.lerp(ROCK, smooth(0.45, 0.8, slope) * 0.8);
  const rd = roadDist(x, z);
  const road = 1 - smooth(ROAD_HALF - 0.6, ROAD_HALF + 0.4, rd);
  if (road > 0) out.lerp(rd > ROAD_HALF - 1 ? DIRT_EDGE : DIRT, road);
  const pd = Math.hypot(x - PLAZA.x, z - PLAZA.z);
  if (pd < PLAZA_R + 1) {
    const cob = (Math.floor(x / 1.3) + Math.floor(z / 1.3)) % 2 === 0 ? COBBLE : COBBLE2;
    out.lerp(cob, 1 - smooth(PLAZA_R - 1, PLAZA_R + 1, pd));
  }
  const yard = Math.hypot(x - SHOP.x, z - SHOP.z);
  if (yard < HOME_R) out.lerp(DIRT, (1 - smooth(4, HOME_R, yard)) * 0.35);
  const pool = poolMask(x, z);
  if (pool > 0) out.lerp(MUD, Math.min(1, pool * 1.4));
  const lava = lavaMask(x, z);
  if (lava > 0) out.lerp(BASALT, Math.min(1, lava * 1.5));
  const sh = ZONE_MAP.shrine;
  const ds = Math.hypot(x - sh.center.x, z - sh.center.z);
  if (ds < 10) out.lerp(RING, (1 - smooth(8.5, 10, ds)) * smooth(5.5, 7, ds) * 0.8);
  const n = 0.9 + fbm(x * 0.3, z * 0.3, 21) * 0.2;
  return out.multiplyScalar(n);
}

function buildTerrain(scene: THREE.Scene, physics: BabylonPhysicsWorld): THREE.Mesh {
  const step = 2;
  const nx = Math.round((BOUNDS.maxX - BOUNDS.minX) / step) + 1;
  const nz = Math.round((BOUNDS.maxZ - BOUNDS.minZ) / step) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = BOUNDS.minX + i * step;
      const z = BOUNDS.minZ + j * step;
      const y = groundHeight(x, z);
      const k = j * nx + i;
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      groundColor(x, z, c);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
      uv[k * 2] = x / 3;
      uv[k * 2 + 1] = z / 3;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let n = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const cc = a + nx;
      const d = cc + 1;
      idx[n++] = a;
      idx[n++] = cc;
      idx[n++] = b;
      idx[n++] = b;
      idx[n++] = cc;
      idx[n++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ map: groundDetail(), vertexColors: true, gradientMap: toonGradient() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  physics.createStaticMesh(pos, idx);
  return mesh;
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

function buildSky(scene: THREE.Scene): SkyRef {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color('#2a3050') },
      uHorizon: { value: new THREE.Color('#6a6a80') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uMoonColor: { value: new THREE.Color('#e8eef8') },
      uSunColor: { value: new THREE.Color('#ffd89a') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uMoonDir;
      uniform float uNight; uniform float uTime; uniform vec3 uMoonColor; uniform vec3 uSunColor;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uTop, smoothstep(-0.05, 0.55, h));
        // Stars (quantised so they stay crisp pixels)
        vec3 q = floor(d * 180.0);
        float s = step(0.9965, hash(q)) * uNight * smoothstep(0.02, 0.2, d.y);
        s *= 0.6 + 0.4 * sin(uTime * 2.0 + hash(q + 1.0) * 40.0);
        col += vec3(s);
        // Moon disc with a soft halo
        float m = dot(d, normalize(uMoonDir));
        col += uMoonColor * (smoothstep(0.9985, 0.9991, m) * 1.2 + pow(max(m, 0.0), 60.0) * 0.18) * uNight;
        // Sun glow through the haze
        float sd = dot(d, normalize(uSunDir));
        col += uSunColor * (smoothstep(0.9975, 0.999, sd) * 1.4 + pow(max(sd, 0.0), 12.0) * 0.25) * (1.0 - uNight);
        // Mist band on the horizon
        col = mix(col, uHorizon, (1.0 - smoothstep(-0.02, 0.12, d.y)) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(170, 24, 12), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, mat };
}

// ---------------------------------------------------------------------------
// Water and lava
// ---------------------------------------------------------------------------

function waterTexture(): THREE.Texture {
  const p = new Painter(32, 32, 7);
  p.wrap = true;
  p.fill('#2e4438');
  for (let i = 0; i < 40; i++) p.rect(p.rng.int(0, 31), p.rng.int(0, 31), p.rng.int(2, 6), 1, p.rng.chance(0.5) ? '#3e5a48' : '#26382e');
  for (let i = 0; i < 8; i++) p.rect(p.rng.int(0, 31), p.rng.int(0, 31), 3, 1, '#6a8a74');
  return p.texture({ repeat: [1, 1] });
}

function lavaTexture(): THREE.Texture {
  const p = new Painter(32, 32, 9);
  p.wrap = true;
  p.fill('#c42430');
  for (let i = 0; i < 70; i++) p.rect(p.rng.int(0, 31), p.rng.int(0, 31), p.rng.int(2, 7), p.rng.int(1, 2), p.rng.chance(0.5) ? '#f77622' : '#feae34');
  for (let i = 0; i < 20; i++) p.rect(p.rng.int(0, 31), p.rng.int(0, 31), p.rng.int(2, 5), 1, '#3e1418');
  for (let i = 0; i < 10; i++) p.px(p.rng.int(0, 31), p.rng.int(0, 31), '#fff4b0');
  return p.texture({ repeat: [1, 1] });
}

function buildLiquids(scene: THREE.Scene): { waterTex: THREE.Texture; lavaTex: THREE.Texture } {
  const waterTex = waterTexture();
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(24, 24);
  const sw = ZONE_MAP.swamp;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(sw.radius * 2 + 20, sw.radius * 2 + 20),
    new THREE.MeshToonMaterial({ map: waterTex, gradientMap: toonGradient(), transparent: true, opacity: 0.86, emissive: '#10201a', emissiveIntensity: 0.5 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(sw.center.x, WATER_Y, sw.center.z);
  water.receiveShadow = true;
  scene.add(water);
  const lavaTex = lavaTexture();
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  lavaTex.repeat.set(20, 20);
  const v = ZONE_MAP.valley;
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(v.radius * 2 + 10, v.radius * 2 + 10), new THREE.MeshBasicMaterial({ map: lavaTex, color: '#ffffff' }));
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(v.center.x, -0.18, v.center.z);
  scene.add(lava);
  return { waterTex, lavaTex };
}

// ---------------------------------------------------------------------------
// Scenery (instanced, chunked)
// ---------------------------------------------------------------------------

interface Placed {
  kind: SceneryKind;
  x: number;
  z: number;
  s: number;
  ry: number;
}

const COLLIDE: Partial<Record<SceneryKind, { r: number; h: number; sphere?: boolean }>> = {
  oak: { r: 0.4, h: 4 },
  dead: { r: 0.3, h: 4 },
  pine: { r: 0.35, h: 4 },
  willow: { r: 0.45, h: 3 },
  charred: { r: 0.32, h: 3 },
  rock: { r: 1.0, h: 1, sphere: true },
  caveRock: { r: 1.0, h: 1, sphere: true },
  redRock: { r: 1.0, h: 1, sphere: true },
  stalagmite: { r: 0.5, h: 2.6 },
  basalt: { r: 1.1, h: 5 },
  log: { r: 0.5, h: 0.8, sphere: true },
  grave: { r: 0.35, h: 1 },
};

function pickKind(x: number, z: number, walk: number, r: () => number): SceneryKind | null {
  const pool = poolMask(x, z);
  const lava = lavaMask(x, z);
  if (lava > 0.1) return null;
  let best: RegionId | null = null;
  let bw = 0;
  for (const zn of ZONES) {
    const w = zoneWeight(zn, x, z);
    if (w > bw) {
      bw = w;
      best = zn.id;
    }
  }
  const p = r();
  if (walk < 0.3) {
    // The wooded hills that wall the paths in.
    if (p > 0.62) return null;
    if (best === 'valley' && bw > 0.3) return p < 0.25 ? 'charred' : p < 0.45 ? 'basalt' : 'redRock';
    if (best === 'cave' && bw > 0.3) return p < 0.4 ? 'caveRock' : p < 0.55 ? 'stalagmite' : 'pine';
    if (best === 'swamp' && bw > 0.3) return p < 0.3 ? 'willow' : p < 0.5 ? 'dead' : 'pine';
    if (best === 'shrine' && bw > 0.3) return p < 0.35 ? 'dead' : p < 0.45 ? 'rock' : 'pine';
    return p < 0.34 ? 'pine' : p < 0.46 ? 'dead' : p < 0.56 ? 'oak' : 'rock';
  }
  // Walkable: sparse, region flavoured.
  if (pool > 0.3) return pool < 0.6 && p < 0.25 ? 'reeds' : null;
  if (best && bw > 0.45) {
    switch (best) {
      case 'forest':
        return p < 0.1 ? 'oak' : p < 0.14 ? 'pine' : p < 0.2 ? 'bush' : p < 0.22 ? 'log' : p < 0.3 ? 'tuft' : null;
      case 'cave':
        return p < 0.07 ? 'caveRock' : p < 0.15 ? 'stalagmite' : null;
      case 'shrine':
        return p < 0.03 ? 'dead' : p < 0.07 ? 'grave' : p < 0.2 ? 'tuft' : null;
      case 'swamp':
        return p < 0.05 ? 'willow' : p < 0.08 ? 'dead' : p < 0.22 ? 'reeds' : null;
      case 'valley':
        return p < 0.04 ? 'basalt' : p < 0.1 ? 'redRock' : p < 0.14 ? 'charred' : null;
    }
  }
  return p < 0.12 ? 'tuft' : p < 0.15 ? 'bush' : p < 0.17 ? 'rock' : p < 0.19 ? 'dead' : null;
}

function buildScenery(scene: THREE.Scene, physics: BabylonPhysicsWorld, keepClear: V2[]): void {
  const placed: Placed[] = [];
  const r = () => rng.next();
  const step = 3.3;
  for (let z = BOUNDS.minZ + 2; z < BOUNDS.maxZ - 2; z += step) {
    for (let x = BOUNDS.minX + 2; x < BOUNDS.maxX - 2; x += step) {
      const px = x + (r() - 0.5) * step * 0.9;
      const pz = z + (r() - 0.5) * step * 0.9;
      if (roadDist(px, pz) < ROAD_HALF + 1.4) continue;
      if (Math.hypot(px - PLAZA.x, pz - PLAZA.z) < PLAZA_R + 1.5) continue;
      if (Math.hypot(px - SHOP.x, pz - SHOP.z) < HOME_R + 1) continue;
      if (Math.hypot(px - CAVERN.x, pz - CAVERN.z) < CAVERN.r + 1.5) continue;
      if (Math.hypot(px - DRAGON.x, pz - DRAGON.z) < 11) continue;
      if (keepClear.some((k) => Math.hypot(px - k.x, pz - k.z) < 3.2)) continue;
      const walk = walkMask(px, pz);
      const kind = pickKind(px, pz, walk, r);
      if (!kind) continue;
      const big = kind === 'rock' || kind === 'caveRock' || kind === 'redRock';
      const s = (walk < 0.3 ? 0.9 + r() * 0.7 : 0.75 + r() * 0.5) * (big && walk < 0.3 ? 1.6 : 1);
      placed.push({ kind, x: px, z: pz, s, ry: r() * Math.PI * 2 });
    }
  }
  // Group by kind and 50 m chunk so the camera can cull whole chunks.
  const groups = new Map<string, Placed[]>();
  for (const p of placed) {
    const key = `${p.kind}:${Math.floor(p.x / 50)}:${Math.floor(p.z / 50)}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(p);
  }
  const geos = new Map<SceneryKind, THREE.BufferGeometry>();
  const mat = vertexColorMaterial();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const [key, list] of groups) {
    const kind = key.split(':')[0] as SceneryKind;
    let geo = geos.get(kind);
    if (!geo) geos.set(kind, (geo = sceneryGeometry(kind)));
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      const y = groundHeight(p.x, p.z) - 0.05;
      e.set(0, p.ry, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = kind !== 'tuft' && kind !== 'reeds';
    im.receiveShadow = true;
    scene.add(im);
  }
  // Havok colliders for everything the apprentice can bump into.
  for (const p of placed) {
    const c = COLLIDE[p.kind];
    if (!c || walkMask(p.x, p.z) < 0.08) continue;
    const y = groundHeight(p.x, p.z);
    if (c.sphere) physics.createBody({ shape: { type: 'sphere', radius: c.r * p.s * 0.85 }, motion: 'static', position: { x: p.x, y: y + 0.3 * p.s, z: p.z }, group: CG.STATIC });
    else physics.createBody({ shape: { type: 'cylinder', radius: c.r * p.s, height: c.h * p.s }, motion: 'static', position: { x: p.x, y: y + (c.h * p.s) / 2, z: p.z }, group: CG.STATIC });
  }
}

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------

function put(scene: THREE.Scene, o: THREE.Object3D, x: number, z: number, ry = 0, dy = 0): THREE.Object3D {
  o.position.set(x, groundHeight(x, z) + dy, z);
  o.rotation.y = ry;
  scene.add(o);
  return o;
}

/** Yaw that turns a model's local −z (forward) to face along (dx, dz). */
function yawFacing(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function buildOutdoor(scene: THREE.Scene, physics: BabylonPhysicsWorld, regionName: (id: RegionId) => string): WorldRefs {
  const batch = new StaticBatch();
  const terrain = buildTerrain(scene, physics);
  const sky = buildSky(scene);
  const { waterTex, lavaTex } = buildLiquids(scene);

  // Lights (the world updates them with the hour)
  const hemi = new THREE.HemisphereLight('#8a92b0', '#2a2228', 0.9);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight('#6a6480', 0.25);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#ffe0b0', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -34;
  sc.right = 34;
  sc.top = 34;
  sc.bottom = -34;
  sc.near = 1;
  sc.far = 140;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const moon = new THREE.DirectionalLight('#7f93d8', 0);
  scene.add(moon, moon.target);

  const lamps: THREE.PointLight[] = [];
  const lampMats: THREE.MeshToonMaterial[] = [];
  const lamp = (x: number, y: number, z: number, color = '#ffb35a', intensity = 6, dist = 16) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z);
    l.userData.base = intensity;
    scene.add(l);
    lamps.push(l);
    return l;
  };

  // The shop from outside
  const shop = shopExterior();
  shop.group.position.set(SHOP.x, groundHeight(SHOP.x, SHOP.z), SHOP.z);
  scene.add(shop.group);
  const chimneyTop = shop.chimneyTop.clone().add(shop.group.position);
  batch.absorb(shop.group);
  physics.createBody({ shape: { type: 'box', size: [SHOP.w + 0.4, 8, SHOP.d] }, motion: 'static', position: { x: SHOP.x, y: 3.5, z: SHOP.z }, group: CG.STATIC });
  lamp(DOOR.x + 0.8, 2.6, DOOR.z - 0.8, '#ffb35a', 7, 12);
  // Garden fence east of the shop, with a gate
  const g = GARDEN_GATE;
  const gy = (x: number, z: number) => groundHeight(x, z);
  const fences = new THREE.Group();
  scene.add(fences);
  fence(SHOP.w / 2 + 0.2, g.z, g.x - 1, g.z, fences, gy);
  fence(g.x + 1, g.z, 13, g.z, fences, gy);
  fence(13, g.z, 13, 4.5, fences, gy);
  fence(SHOP.w / 2 + 0.2, 4.5, 13, 4.5, fences, gy);
  for (const [a, b] of [
    [
      [SHOP.w / 2 + 0.2, g.x - 1],
      [g.z, g.z],
    ],
    [
      [g.x + 1, 13],
      [g.z, g.z],
    ],
  ] as Array<[[number, number], [number, number]]>) {
    const cx = (a[0] + a[1]) / 2;
    physics.createBody({ shape: { type: 'box', size: [a[1] - a[0], 1.2, 0.3] }, motion: 'static', position: { x: cx, y: gy(cx, b[0]) + 0.6, z: b[0] }, group: CG.STATIC });
  }
  physics.createBody({ shape: { type: 'box', size: [0.3, 1.2, 4.5 - g.z] }, motion: 'static', position: { x: 13, y: gy(13, 1) + 0.6, z: (g.z + 4.5) / 2 }, group: CG.STATIC });
  const gateSign = twoSidedSign('Bahçe · Garden', 1.6, 0.3);
  gateSign.position.set(g.x, gy(g.x, g.z) + 1.35, g.z - 0.05);
  scene.add(gateSign);
  // Crop rows inside the fence (decoration)
  for (let i = 0; i < 4; i++) {
    const row = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 0.8), toon({ color: '#3a2a22' }));
    row.position.set(9.3, gy(9.3, 0) + 0.1, -0.6 + i * 1.3);
    fences.add(row);
    for (let k = 0; k < 6; k++) {
      const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 4), toon({ color: i % 2 ? '#2ce8f5' : '#63c74d', emissive: i % 2 ? '#1a8a90' : '#000000', emissiveIntensity: 0.5 }));
      sprout.position.set(7.3 + k * 0.8, gy(9.3, 0) + 0.38, -0.6 + i * 1.3);
      fences.add(sprout);
    }
  }
  batch.absorb(fences);

  // Lantern posts along the roads
  for (const road of ROADS) {
    let acc = 0;
    let side = 1;
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i];
      const b = road[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = (b.x - a.x) / len;
      const dz = (b.z - a.z) / len;
      for (let d = 0; d < len; d += 1) {
        acc += 1;
        if (acc < 15) continue;
        acc = 0;
        side = -side;
        const x = a.x + dx * d + -dz * side * (ROAD_HALF + 0.7);
        const z = a.z + dz * d + dx * side * (ROAD_HALF + 0.7);
        if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA_R + 2) continue;
        const lp = lanternPost();
        put(scene, lp.group, x, z, Math.atan2(dz * side, -dx * side));
        lampMats.push(lp.lamp.material as THREE.MeshToonMaterial);
        batch.absorb(lp.group);
      }
    }
  }

  // The crossroads: signpost with a lantern, benches
  const sp = signpost(ZONES.map((z) => ({ angle: z.angle, text: regionName(z.id), locked: false })));
  put(scene, sp, PLAZA.x, PLAZA.z);
  batch.absorb(sp);
  physics.createBody({ shape: { type: 'cylinder', radius: 0.3, height: 4 }, motion: 'static', position: { x: PLAZA.x, y: groundHeight(PLAZA.x, PLAZA.z) + 2, z: PLAZA.z }, group: CG.STATIC });
  lamp(PLAZA.x, groundHeight(PLAZA.x, PLAZA.z) + 4.2, PLAZA.z, '#ffb35a', 9, 20);

  // Gates, altars and region landmarks
  const gates: GateRef[] = [];
  const altars: AltarRef[] = [];
  const altarColor: Record<RegionId, string> = { forest: '#63c74d', cave: '#2ce8f5', shrine: '#c0cbff', swamp: '#b4c83a', valley: '#f77622' };
  const keepClear: V2[] = [];
  for (const zn of ZONES) {
    const dx = zn.gate.x - PLAZA.x;
    const dz = zn.gate.z - PLAZA.z;
    const len = Math.hypot(dx, dz);
    const perp = { x: -dz / len, z: dx / len };
    const yaw = Math.atan2(-perp.z, perp.x);
    const width = (ROAD_HALF + 5) * 2;
    const gm = gateModel(width);
    put(scene, gm.group, zn.gate.x, zn.gate.z, yaw);
    const sign = twoSidedSign(regionName(zn.id), 2.4, 0.42);
    sign.position.set(0, 3.3, 0);
    gm.group.add(sign);
    gates.push({ zone: zn.id, group: gm.group, barrier: gm.barrier, mat: gm.mat, sign, pos: zn.gate, yaw, body: null });
    for (const s of [-1, 1]) {
      const px = zn.gate.x + perp.x * s * (width / 2);
      const pz = zn.gate.z + perp.z * s * (width / 2);
      physics.createBody({ shape: { type: 'box', size: [0.9, 4, 0.9] }, motion: 'static', position: { x: px, y: groundHeight(px, pz) + 2, z: pz }, group: CG.STATIC });
      keepClear.push({ x: px, z: pz });
    }
    // The gathering altar: near the region's heart, off the road.
    let ap: V2 = { x: zn.center.x + perp.x * 6, z: zn.center.z + perp.z * 6 };
    if (zn.id === 'shrine') ap = { x: zn.center.x, z: zn.center.z };
    if (zn.id === 'cave') ap = { x: CAVERN.x, z: CAVERN.z };
    if (zn.id === 'swamp') {
      for (let k = 0; k < 40; k++) {
        const a = k * 0.7;
        const c = { x: zn.center.x + Math.cos(a) * (4 + k * 0.4), z: zn.center.z + Math.sin(a) * (4 + k * 0.4) };
        if (poolMask(c.x, c.z) < 0.05 && roadDist(c.x, c.z) > ROAD_HALF + 2) {
          ap = c;
          break;
        }
      }
    }
    if (zn.id === 'valley') ap = { x: zn.center.x - perp.x * 6, z: zn.center.z - perp.z * 6 };
    const alt = altarModel(altarColor[zn.id]);
    put(scene, alt.group, ap.x, ap.z, yawFacing(PLAZA.x - ap.x, PLAZA.z - ap.z));
    physics.createBody({ shape: { type: 'box', size: [1, 1.8, 0.6] }, motion: 'static', position: { x: ap.x, y: groundHeight(ap.x, ap.z) + 0.9, z: ap.z }, group: CG.STATIC });
    const light = lamp(ap.x, groundHeight(ap.x, ap.z) + 2.2, ap.z, altarColor[zn.id], 5, 14);
    altars.push({ zone: zn.id, pos: V(ap.x, groundHeight(ap.x, ap.z), ap.z), ring: alt.ring, rune: alt.rune, light });
    keepClear.push(ap);
  }

  // Echo Cave: the cavern at the end of the canyon
  const cdir = { x: PLAZA.x - CAVERN.x, z: PLAZA.z - CAVERN.z };
  const clen = Math.hypot(cdir.x, cdir.z);
  const openPhi = Math.atan2(cdir.z / clen, -cdir.x / clen);
  const cav = cavernModel(CAVERN.r, openPhi);
  put(scene, cav, CAVERN.x, CAVERN.z, 0, -0.2);
  batch.absorb(cav);
  for (let i = 0; i < 28; i++) {
    const phi = (i / 28) * Math.PI * 2;
    let d = phi - openPhi;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 0.55) continue;
    const x = CAVERN.x - Math.cos(phi) * CAVERN.r;
    const z = CAVERN.z + Math.sin(phi) * CAVERN.r;
    physics.createBody({ shape: { type: 'box', size: [3.2, 6, 1] }, motion: 'static', position: { x, y: 3, z }, rotation: quatY(phi - Math.PI / 2), group: CG.STATIC });
  }
  const crystalMat = toon({ color: '#9af5e6', emissive: '#2ce8f5', emissiveIntensity: 0.9 });
  const crystals = new THREE.Group();
  scene.add(crystals);
  for (let i = 0; i < 16; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(CAVERN.r * 0.55, CAVERN.r - 1);
    const cl = new THREE.Mesh(new THREE.ConeGeometry(0.25, rng.range(0.8, 1.8), 5), crystalMat);
    const x = CAVERN.x + Math.cos(a) * d;
    const z = CAVERN.z + Math.sin(a) * d;
    cl.position.set(x, groundHeight(x, z) + 0.4, z);
    cl.rotation.set(rng.range(-0.4, 0.4), 0, rng.range(-0.4, 0.4));
    crystals.add(cl);
  }
  batch.absorb(crystals);
  const crystalsLight = lamp(CAVERN.x, 3.5, CAVERN.z, '#2ce8f5', 7, 18);

  // Moon Shrine: stone circle, pillars, a wishing well, graves, ravens
  const sh = ZONE_MAP.shrine;
  const ravens: WorldRefs['ravens'] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    const x = sh.center.x + Math.cos(a) * 7.5;
    const z = sh.center.z + Math.sin(a) * 7.5;
    const hgt = 2.6 + (i % 3) * 0.6;
    const st = standingStone(hgt, (i % 2 ? 1 : -1) * 0.06);
    const holder = new THREE.Group();
    holder.add(st);
    put(scene, holder, x, z, -a);
    batch.absorb(holder);
    physics.createBody({ shape: { type: 'box', size: [0.9, hgt, 0.6] }, motion: 'static', position: { x, y: groundHeight(x, z) + hgt / 2, z }, rotation: quatY(-a), group: CG.STATIC });
    if (i % 3 === 0) {
      const rv = ravenModel();
      const perch = V(x, groundHeight(x, z) + hgt - 0.1, z);
      rv.group.position.copy(perch);
      rv.group.rotation.y = rng.range(0, 6.28);
      scene.add(rv.group);
      ravens.push({ ...rv, perch, flyT: 0 });
    }
  }
  const wellPos = { x: sh.center.x - 10, z: sh.center.z - 3 };
  batch.absorb(put(scene, wellModel(), wellPos.x, wellPos.z));
  physics.createBody({ shape: { type: 'cylinder', radius: 1.25, height: 1.2 }, motion: 'static', position: { x: wellPos.x, y: groundHeight(wellPos.x, wellPos.z) + 0.6, z: wellPos.z }, group: CG.STATIC });
  keepClear.push(wellPos);
  for (const [dx, dz, hgt] of [
    [9, -8, 4],
    [12, 2, 2.2],
    [-6, -12, 3.2],
    [7, 9, 1.4],
  ]) {
    const x = sh.center.x + dx;
    const z = sh.center.z + dz;
    batch.absorb(put(scene, pillar(hgt), x, z));
    physics.createBody({ shape: { type: 'cylinder', radius: 0.55, height: hgt }, motion: 'static', position: { x, y: groundHeight(x, z) + hgt / 2, z }, group: CG.STATIC });
    keepClear.push({ x, z });
  }
  lamp(sh.center.x, groundHeight(sh.center.x, sh.center.z) + 5, sh.center.z, '#c0cbff', 4, 22);

  // Dragon Valley: the sleeping dragon, facing the road
  const dm = dragonModel();
  const toPlaza = { x: PLAZA.x - DRAGON.x, z: PLAZA.z - DRAGON.z };
  const dyaw = Math.atan2(toPlaza.z, -toPlaza.x);
  put(scene, dm.group, DRAGON.x, DRAGON.z, dyaw);
  physics.createBody({ shape: { type: 'box', size: [9, 5, 6] }, motion: 'static', position: { x: DRAGON.x, y: groundHeight(DRAGON.x, DRAGON.z) + 2.5, z: DRAGON.z }, rotation: quatY(dyaw), group: CG.STATIC });

  // Gather spots
  const spots = {} as Record<RegionId | 'road', V2[]>;
  ZONES.forEach((zn, i) => {
    const center = zn.id === 'cave' ? { x: (zn.center.x + CAVERN.x) / 2, z: (zn.center.z + CAVERN.z) / 2 } : zn.center;
    spots[zn.id] = scatter(center, zn.radius - 3, 12, 11 + i * 7, ROAD_HALF + 0.8, 3.2).filter(
      (p) =>
        poolMask(p.x, p.z) < 0.35 &&
        lavaMask(p.x, p.z) < 0.15 &&
        walkMask(p.x, p.z) > 0.6 &&
        Math.hypot(p.x - DRAGON.x, p.z - DRAGON.z) > 9 &&
        !keepClear.some((k) => Math.hypot(k.x - p.x, k.z - p.z) < 2.6),
    );
  });
  spots.road = [];
  for (const road of ROADS.slice(0, 3)) {
    for (let i = 2; i < road.length - 1; i += 3) {
      const a = road[i];
      const side = i % 2 ? 1 : -1;
      spots.road.push({ x: a.x + side * (ROAD_HALF + 2.2), z: a.z + 1 });
    }
  }
  const forest = ZONE_MAP.forest;
  const nettles = scatter(forest.center, forest.radius - 6, 3, 99, ROAD_HALF + 2, 8).filter((p) => !spots.forest.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 2.5));
  const nettleGroup = new THREE.Group();
  scene.add(nettleGroup);
  for (const n of nettles) {
    for (let i = 0; i < 9; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 4), toon({ color: '#5a7a2a' }));
      const x = n.x + rng.range(-1.4, 1.4);
      const z = n.z + rng.range(-1.4, 1.4);
      tuft.position.set(x, groundHeight(x, z) + 0.3, z);
      nettleGroup.add(tuft);
    }
  }
  batch.absorb(nettleGroup);
  for (const s of [...spots.forest, ...spots.cave, ...spots.shrine, ...spots.swamp, ...spots.valley, ...spots.road, ...nettles]) keepClear.push(s);

  buildScenery(scene, physics, keepClear);

  // Lily pads on the swamp pools
  const padGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.04, 7);
  const padMat = toon({ color: '#2d5a2d' });
  const sw = ZONE_MAP.swamp;
  const pads = scatter(sw.center, sw.radius + 2, 90, 5, 0, 1.4).filter((p) => poolMask(p.x, p.z) > 0.7);
  const padMesh = new THREE.InstancedMesh(padGeo, padMat, Math.max(1, pads.length));
  pads.forEach((p, i) => {
    padMesh.setMatrixAt(i, new THREE.Matrix4().compose(V(p.x, WATER_Y + 0.03, p.z), new THREE.Quaternion(), V(1 + (i % 3) * 0.25, 1, 1 + (i % 3) * 0.25)));
  });
  padMesh.count = pads.length;
  padMesh.computeBoundingSphere();
  scene.add(padMesh);

  // Glowing mushroom clusters in the forest (decoration)
  const mushMat = toon({ color: '#2ce8f5', emissive: '#1a9aa8', emissiveIntensity: 0.9 });
  const mushrooms = new THREE.Group();
  scene.add(mushrooms);
  for (const p of scatter(forest.center, forest.radius + 6, 26, 71, ROAD_HALF + 1, 2)) {
    for (let k = 0; k < 3; k++) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12 + k * 0.03, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), mushMat);
      const x = p.x + k * 0.25;
      const z = p.z + (k % 2) * 0.2;
      cap.position.set(x, groundHeight(x, z) + 0.12 + k * 0.05, z);
      mushrooms.add(cap);
    }
  }
  batch.absorb(mushrooms);
  batch.build(scene);

  void unlit;
  return {
    terrain,
    sky,
    sun,
    moon,
    hemi,
    ambient,
    waterTex,
    lavaTex,
    lamps,
    lampMats,
    gates,
    altars,
    well: V(wellPos.x, groundHeight(wellPos.x, wellPos.z), wellPos.z),
    chimney: chimneyTop,
    signpost: V(PLAZA.x, groundHeight(PLAZA.x, PLAZA.z), PLAZA.z),
    dragon: { ...dm, pos: V(DRAGON.x, groundHeight(DRAGON.x, DRAGON.z), DRAGON.z), yaw: dyaw },
    ravens,
    crystalsLight,
    spots,
    nettles,
  };
}
