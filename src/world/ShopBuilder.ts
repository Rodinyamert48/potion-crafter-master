// Builds the potion shop: architecture, static colliders, furniture, work
// stations, supply sources, decorations with physical hanging props, and the
// anchors customers and the camera use.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { Shop, ShopAnchors } from './Shop';
import { Entity } from './Entity';
import { toon, unlit } from '../rendering/three/materials';
import {
  hearthStone,
  plaster,
  repeated,
  stoneWall,
  woodBeam,
  woodFloor,
  woodPlank,
  brass,
} from '../rendering/three/textures/PixelTextures';
import {
  armchairModel,
  bellModel,
  bookModel,
  bookshelfModel,
  cabinetModel,
  cashBoxModel,
  counterModel,
  crateModel,
  doorModel,
  lecternModel,
  shelfModel,
  signModel,
  stoolModel,
  tableModel,
  windowModel,
  woodPileModel,
} from '../rendering/three/models/stationModels';
import {
  booksStack,
  broomModel,
  candleModel,
  cobwebQuad,
  crystalCluster,
  decorBottle,
  hangingScales,
  hangingWing,
  herbBundle,
  jarModel,
  lanternModel,
  lightShaft,
  pottedPlant,
  rugModel,
  skullModel,
  wallMap,
} from '../rendering/three/models/decorModels';
import { flaskModel } from '../rendering/three/models/toolModels';
import { createSkyMaterial } from '../rendering/three/shaders/SkyMaterial';
import { CG } from '../physics/PhysicsTypes';
import { Hearth } from '../gameplay/potion/Hearth';
import { Cauldron } from '../gameplay/potion/Cauldron';
import { DrainTap, Ladle } from '../gameplay/stations/CauldronTools';
import { Bellows, Damper } from '../gameplay/stations/FireControls';
import { CuttingBoard, DryingRack, Hammer, Knife, Mortar } from '../gameplay/stations/PrepStations';
import { Bucket, WaterBarrel } from '../gameplay/stations/Water';
import { ClickFixture, Door, PotionShelf, SupplySource, sparkleAbove } from '../gameplay/stations/ShopFixtures';
import { INGREDIENTS } from '../data/ingredients';
import { t } from '../core/i18n';
import { rng } from '../core/Random';
import { mesh } from '../rendering/three/models/common';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const ROOM = { minX: -5, maxX: 5, minZ: -3.8, maxZ: 2.6, height: 3.3 };

/** Box geometry with world-space planar UVs (tile size in metres) for seamless walls. */
function worldBox(w: number, h: number, d: number, cx: number, cy: number, cz: number, tile: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(cx, cy, cz);
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  return g;
}

/** Decorative, physically swinging hanging prop (Babylon ball-joint pendulum). */
class Swinger extends Entity {
  readonly kind = 'decor';
  private t = rng.range(0, 10);

  constructor(ctx: GameContext, visual: THREE.Object3D, anchor: THREE.Vector3, length: number) {
    super();
    this.interactive = false;
    this.object.add(visual);
    visual.position.y = length / 2;
    const body = ctx.physics.createBody({
      shape: { type: 'box', size: [0.12, length, 0.12] },
      motion: 'dynamic',
      mass: 0.15,
      position: { x: anchor.x, y: anchor.y - length / 2, z: anchor.z },
      linearDamping: 0.4,
      angularDamping: 0.6,
      group: CG.DEBRIS,
      mask: CG.ITEM | CG.TOOL,
    });
    this.body = body;
    ctx.physics.hang(body, anchor, { x: 0, y: length / 2, z: 0 });
    body.applyImpulse({ x: rng.range(-0.02, 0.02), y: 0, z: rng.range(-0.02, 0.02) });
  }

  override fixedUpdate(_ctx: GameContext, dt: number): void {
    this.t += dt;
    // A gentle draft keeps things moving.
    if (rng.chance(dt * 0.4)) this.body?.applyImpulse({ x: rng.range(-0.012, 0.012), y: 0, z: rng.range(-0.008, 0.008) });
  }
}

/** Idle-animated object without physics (bobbing, spinning, glowing). */
class Ambient extends Entity {
  readonly kind = 'ambient';
  constructor(obj: THREE.Object3D, private readonly fn: (o: THREE.Object3D, t: number, ctx: GameContext, dt: number) => void) {
    super(obj);
    this.interactive = false;
  }
  private t = rng.range(0, 10);
  override update(ctx: GameContext, dt: number): void {
    this.t += dt;
    this.fn(this.object, this.t, ctx, dt);
  }
}

export function buildShop(ctx: GameContext): Shop {
  const scene = ctx.scene;
  const world = ctx.world;
  const physics = ctx.physics;
  const staticBox = (c: THREE.Vector3, s: [number, number, number], friction = 0.6) =>
    physics.createBody({ shape: { type: 'box', size: s }, motion: 'static', position: c, friction, group: CG.STATIC });
  const add = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T => {
    o.position.set(x, y, z);
    o.rotation.y = ry;
    scene.add(o);
    return o;
  };

  // ---------------------------------------------------------------------
  // Architecture
  // ---------------------------------------------------------------------
  const floorMat = toon({ map: repeated(woodFloor(), 1, 1) });
  const floor = new THREE.Mesh(worldBox(10.4, 0.3, 6.8, 0, -0.15, -0.6, 1.3), floorMat);
  floor.receiveShadow = true;
  scene.add(floor);
  staticBox(V(0, -0.15, -0.6), [10.4, 0.3, 6.8], 0.8);
  world.addSurface(floor, { tag: 'floor' });
  // Foundation edge
  const foundation = new THREE.Mesh(worldBox(10.6, 0.5, 0.3, 0, -0.35, 2.85, 0.8), toon({ map: repeated(hearthStone(), 1, 1) }));
  scene.add(foundation);
  const foundationR = new THREE.Mesh(worldBox(0.3, 0.5, 6.9, 5.25, -0.35, -0.6, 0.8), toon({ map: repeated(hearthStone(), 1, 1) }));
  scene.add(foundationR);

  const stoneMat = toon({ map: repeated(stoneWall(), 1, 1) });
  const plasterMat = toon({ map: repeated(plaster(), 1, 1) });
  const beamMat = toon({ map: woodBeam() });
  const wallZ = -3.95;
  const wallT = 0.3;
  const H = ROOM.height;
  const door = { x0: 3.25, x1: 4.35, h: 2.2 };
  const win = { x0: -2.0, x1: -0.6, y0: 1.35, y1: 2.55 };
  const backSegs: Array<[number, number, number, number, THREE.Material]> = [
    // x0, x1, y0, y1, material
    [-5.3, door.x0, 0, 1.0, stoneMat],
    [door.x1, 5.3, 0, 1.0, stoneMat],
    [-5.3, win.x0, 1.0, H, plasterMat],
    [win.x0, win.x1, 1.0, win.y0, plasterMat],
    [win.x0, win.x1, win.y1, H, plasterMat],
    [win.x1, door.x0, 1.0, H, plasterMat],
    [door.x0, door.x1, door.h, H, plasterMat],
    [door.x1, 5.3, 1.0, H, plasterMat],
  ];
  for (const [x0, x1, y0, y1, m] of backSegs) {
    const w = x1 - x0;
    const h = y1 - y0;
    const g = worldBox(w, h, wallT, (x0 + x1) / 2, (y0 + y1) / 2, wallZ, m === stoneMat ? 1.4 : 1.6);
    const wall = new THREE.Mesh(g, m);
    wall.receiveShadow = true;
    wall.castShadow = true;
    scene.add(wall);
  }
  // Back wall collider (door is closed for items)
  staticBox(V(0, H / 2, wallZ), [10.6, H, wallT]);
  // Left wall
  const leftX = -5.15;
  const lw1 = new THREE.Mesh(worldBox(wallT, 1.0, 6.6, leftX, 0.5, -0.6, 1.4), stoneMat);
  const lw2 = new THREE.Mesh(worldBox(wallT, H - 1.0, 6.6, leftX, 1.0 + (H - 1.0) / 2, -0.6, 1.6), plasterMat);
  for (const w of [lw1, lw2]) {
    w.receiveShadow = true;
    w.castShadow = true;
    scene.add(w);
  }
  staticBox(V(leftX, H / 2, -0.6), [wallT, H, 6.8]);
  // Invisible bounds (front/right) so items stay in the diorama
  staticBox(V(5.2, 1.5, -0.6), [0.2, 3, 7]);
  staticBox(V(0, 1.5, 2.85), [10.6, 3, 0.2]);
  // Timber: wainscot rail, posts and top beam
  const rail = mesh(worldBox(10.4, 0.1, 0.12, 0, 1.0, wallZ + 0.19, 1), beamMat);
  scene.add(rail);
  const railL = mesh(worldBox(0.12, 0.1, 6.4, leftX + 0.19, 1.0, -0.6, 1), beamMat);
  scene.add(railL);
  for (const x of [-4.8, -2.3, 0.3, 2.9, 4.8]) scene.add(mesh(worldBox(0.18, H, 0.14, x, H / 2, wallZ + 0.2, 1), beamMat));
  for (const z of [-3.6, -1.2, 1.2]) scene.add(mesh(worldBox(0.14, H, 0.18, leftX + 0.2, H / 2, z, 1), beamMat));
  scene.add(mesh(worldBox(10.4, 0.2, 0.2, 0, H - 0.1, wallZ + 0.2, 1), beamMat));
  scene.add(mesh(worldBox(0.2, 0.2, 6.6, leftX + 0.2, H - 0.1, -0.6, 1), beamMat));
  // Ceiling beams reaching into the room (short, so they never block the camera)
  for (const x of [-3.8, -1.2, 1.5, 4.0]) {
    const b = mesh(worldBox(0.18, 0.18, 1.7, x, H - 0.12, -3.0, 1), beamMat);
    b.castShadow = false;
    scene.add(b);
  }
  const crossBeam = mesh(worldBox(10.2, 0.16, 0.16, 0, H - 0.2, -2.25, 1), beamMat);
  crossBeam.castShadow = false;
  scene.add(crossBeam);

  // Window + sky
  const winGroup = windowModel(win.x1 - win.x0, win.y1 - win.y0);
  add(winGroup, (win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, wallZ + 0.05);
  const sky = createSkyMaterial();
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(win.x1 - win.x0 + 0.4, win.y1 - win.y0 + 0.4), sky);
  skyPlane.position.set((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, wallZ - 0.2);
  scene.add(skyPlane);
  const sill = mesh(worldBox(win.x1 - win.x0 + 0.3, 0.06, 0.34, (win.x0 + win.x1) / 2, win.y0 - 0.02, wallZ + 0.2, 1), toon({ map: woodPlank('light') }));
  scene.add(sill);
  world.addSurface(sill, { tag: 'shelf' });
  staticBox(V((win.x0 + win.x1) / 2, win.y0 - 0.02, wallZ + 0.2), [win.x1 - win.x0 + 0.3, 0.06, 0.34]);
  // God rays from the window
  const lightShafts: THREE.Mesh[] = [];
  void lightShaft;

  // Door
  const doorM = doorModel(door.x1 - door.x0, door.h);
  add(doorM.group, (door.x0 + door.x1) / 2, 0, wallZ + 0.08);
  const doorEntity = world.add(new Door(doorM.leaf, doorM.group), ctx);
  const doorOutside = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), unlit('#2a3050'));
  doorOutside.position.set((door.x0 + door.x1) / 2, 1.1, wallZ - 0.1);
  scene.add(doorOutside);

  // ---------------------------------------------------------------------
  // Hearth, cauldron and fire controls
  // ---------------------------------------------------------------------
  const hearthCenter = V(0, 0, -0.9);
  const hearth = world.add(new Hearth(ctx, hearthCenter), ctx);
  const cauldron = world.add(new Cauldron(ctx, V(0, 0.28, -0.9), hearth), ctx);
  const ladle = world.add(new Ladle(ctx, cauldron), ctx);
  const tap = world.add(new DrainTap(ctx, cauldron, V(0.66, 0.5, -0.9)), ctx);
  const bellows = world.add(new Bellows(ctx, V(-1.12, 0.14, -0.72), Math.PI, hearth), ctx);
  staticBox(V(-1.3, 0.07, -0.72), [0.5, 0.14, 0.3]);
  add(mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), toon({ map: woodPlank('dark') })), -1.3, 0.07, -0.72);
  const damper = world.add(new Damper(ctx, V(0.62, 0.2, -0.12), hearth), ctx);
  const rug = rugModel(2.8, 1.6);
  add(rug, 0.1, 0.004, 0.65);

  // ---------------------------------------------------------------------
  // Supplies: ingredient cabinet & wall shelves, wood pile, flasks
  // ---------------------------------------------------------------------
  const cab = cabinetModel(2.3, 0.85, 0.8);
  add(cab, -3.55, 0, -3.35);
  staticBox(V(-3.55, 0.45, -3.35), [2.36, 0.9, 0.86]);
  const cabTop = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.02, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  cabTop.position.set(-3.55, 0.9, -3.35);
  cabTop.userData.noPick = true;
  scene.add(cabTop);
  world.addSurface(cabTop, { tag: 'shelf' });

  const sources = new Map<string, SupplySource>();
  const mkSource = (id: string, model: THREE.Object3D, pos: THREE.Vector3, spawn: THREE.Vector3, label: THREE.Vector3) => {
    const s = world.add(new SupplySource(ctx, id, model, pos, spawn, label), ctx);
    sources.set(id, s);
    return s;
  };
  // Mushroom basket
  const basket = new THREE.Group();
  basket.add(crateModel(0.46, 0.18, 0.36));
  for (let i = 0; i < 5; i++) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: '#39c6d6', emissive: '#2ce8f5', emissiveIntensity: 0.5 }));
    cap.scale.set(1, 0.7, 1);
    cap.position.set(-0.14 + (i % 3) * 0.14, 0.14 + Math.floor(i / 3) * 0.04, -0.06 + Math.floor(i / 3) * 0.12);
    basket.add(cap);
  }
  mkSource('glowing_mushroom', basket, V(-4.25, 0.9, -3.3), V(0, 0.35, 0.25), V(0, 0.34, 0.2));
  staticBox(V(-4.25, 0.99, -3.3), [0.46, 0.18, 0.36]);
  // Bat wing crate
  const wingCrate = new THREE.Group();
  wingCrate.add(crateModel(0.46, 0.2, 0.36));
  const wingTex = hangingWing();
  wingTex.position.set(0, 0.46, 0);
  wingTex.scale.setScalar(0.9);
  wingCrate.add(wingTex);
  mkSource('bat_wing', wingCrate, V(-3.55, 0.9, -3.3), V(0, 0.38, 0.25), V(0, 0.36, 0.2));
  staticBox(V(-3.55, 1.0, -3.3), [0.46, 0.2, 0.36]);
  // Dragon scale chest
  const chest = new THREE.Group();
  chest.add(crateModel(0.44, 0.2, 0.34, false));
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.02), toon({ map: brass() }));
  lock.position.set(0, 0.12, 0.18);
  chest.add(lock);
  const scaleDeco = hangingScales();
  scaleDeco.position.set(0.12, 0.62, -0.05);
  scaleDeco.scale.setScalar(0.7);
  chest.add(scaleDeco);
  mkSource('dragon_scale', chest, V(-2.85, 0.9, -3.3), V(0, 0.38, 0.25), V(0, 0.34, 0.2));
  staticBox(V(-2.85, 1.0, -3.3), [0.44, 0.2, 0.34]);

  // Wall shelves with decor + unlockable ingredient jars
  const shelves = shelfModel(2.3, 0.36, [1.55, 2.2], 0.9);
  add(shelves.group, -3.55, 0, -3.62);
  shelves.group.updateMatrixWorld(true);
  for (const b of shelves.boards) {
    const wp = new THREE.Vector3();
    b.getWorldPosition(wp);
    staticBox(wp, [2.3, 0.04, 0.36]);
    world.addSurface(b, { tag: 'shelf' });
  }
  const lockedJars: Array<[string, number]> = [
    ['moon_flower', -4.3],
    ['frost_crystal', -3.55],
    ['phoenix_feather', -2.8],
  ];
  for (const [id, x] of lockedJars) {
    const def = INGREDIENTS[id];
    const jar = jarModel(id, def.color, 0.1, 0.22);
    const src = mkSource(id, jar, V(x, 1.57, -3.58), V(0, 0.3, 0.3), V(0, 0.36, 0.14));
    src.object.visible = ctx.state.isUnlocked(id);
    src.interactive = ctx.state.isUnlocked(id);
  }
  // Decor on the upper shelf
  const shelfDecor: Array<[THREE.Object3D, number, number]> = [
    [decorBottle('round', '#63c74d', 1.1), -4.55, 2.22],
    [decorBottle('tall', '#b55088', 1.1), -4.35, 2.22],
    [booksStack(3), -3.95, 2.22],
    [crystalCluster('#2ce8f5', 1.3), -3.4, 2.22],
    [decorBottle('flask', '#f77622', 1.1), -2.95, 2.22],
    [decorBottle('vial', '#fee761', 1.2), -2.78, 2.22],
  ];
  for (const [o, x, y] of shelfDecor) add(o, x, y, -3.6);
  const skull = skullModel();
  add(skull, -3.0, 1.57, -3.62, 0.3);
  // Slime in a jar (little creature on the shelf)
  const slimeJar = new THREE.Group();
  slimeJar.add(jarModel(null, '#1a2a1a', 0.08, 0.16));
  const slime = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 5), toon({ color: '#63c74d', emissive: '#63c74d', emissiveIntensity: 0.4 }));
  slime.position.y = 0.06;
  slimeJar.add(slime);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.01), toon({ color: '#181425' }));
    eye.position.set(s * 0.018, 0.075, 0.045);
    slime.add(eye);
  }
  add(slimeJar, -2.55, 2.22, -3.6);
  world.add(
    new Ambient(slime, (o, time) => {
      const hop = Math.max(0, Math.sin(time * 2.2));
      o.position.y = 0.05 + hop * 0.035;
      o.scale.set(1 + (1 - hop) * 0.15, 1 - (1 - hop) * 0.18 + hop * 0.1, 1 + (1 - hop) * 0.15);
    }),
    ctx,
    slimeJar,
  );

  // Wood pile & flasks
  const pile = woodPileModel(9);
  mkSource('log', pile, V(-1.85, 0, -1.95), V(0, 0.55, 0.35), V(0, 0.55, 0.25));
  staticBox(V(-1.85, 0.2, -1.95), [0.62, 0.4, 0.6]);
  const stool = stoolModel(0.5);
  add(stool, 1.35, 0, 0.1);
  staticBox(V(1.35, 0.25, 0.1), [0.44, 0.5, 0.44]);
  const flaskCrate = new THREE.Group();
  flaskCrate.add(crateModel(0.4, 0.14, 0.3));
  for (let i = 0; i < 6; i++) {
    const f = flaskModel('round').group;
    f.scale.setScalar(0.85);
    f.position.set(-0.12 + (i % 3) * 0.12, 0.1, -0.06 + Math.floor(i / 3) * 0.12);
    flaskCrate.add(f);
  }
  mkSource('flask', flaskCrate, V(1.35, 0.53, 0.1), V(0, 0.35, 0.2), V(0, 0.3, 0.2));
  staticBox(V(1.35, 0.6, 0.1), [0.4, 0.14, 0.3]);

  // ---------------------------------------------------------------------
  // Work table: board, knife, hammer, mortar, drying rack, water
  // ---------------------------------------------------------------------
  const table = tableModel(2.4, 1.0, 0.92, 'mid');
  add(table.group, -3.15, 0, 0.75);
  staticBox(V(-3.15, 0.885, 0.75), [2.4, 0.07, 1.0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) staticBox(V(-3.15 + sx * 1.1, 0.42, 0.75 + sz * 0.42), [0.08, 0.84, 0.08]);
  world.addSurface(table.top, { tag: 'table' });
  const board = world.add(new CuttingBoard(ctx, V(-3.65, 0.94, 0.7)), ctx);
  const knife = world.add(new Knife(ctx, V(-3.35, 0.95, 1.12), 0.15, board), ctx);
  const hammer = world.add(new Hammer(ctx, V(-2.9, 0.96, 1.12), -0.25, board), ctx);
  const mortar = world.add(new Mortar(ctx, V(-2.4, 0.92, 0.6)), ctx);
  const rack = world.add(new DryingRack(ctx, V(-1.4, 0, -2.4), hearth), ctx);
  const barrel = world.add(new WaterBarrel(ctx, V(-4.45, 0, -1.25)), ctx);
  const bucket = world.add(new Bucket(ctx, V(-3.85, 0.2, -0.95), barrel), ctx);
  // Table decor
  const tableCandle = candleModel(0.14);
  add(tableCandle.group, -4.15, 0.92, 0.42);
  ctx.renderer.lighting.addCandle(V(-4.15, 1.2, 0.42), 3.5, tableCandle.flame);
  add(jarModel(null, '#b55088', 0.06, 0.12), -4.12, 0.92, 1.05);
  add(jarModel(null, '#feae34', 0.05, 0.1), -1.98, 0.92, 1.05);
  add(booksStack(2), -2.05, 0.92, 0.4, 0.4);

  // ---------------------------------------------------------------------
  // Counter, potion shelf, bell, cash box
  // ---------------------------------------------------------------------
  const counter = counterModel(2.8, 1.05, 0.65);
  add(counter.group, 3.3, 0, 0.875);
  staticBox(V(3.3, 0.525, 0.875), [2.9, 1.05, 0.77]);
  world.addSurface(counter.top, { tag: 'counter' });
  const cashBox = cashBoxModel();
  add(cashBox, 2.55, 1.05, 1.0, 0.1);
  staticBox(V(2.55, 1.13, 1.0), [0.36, 0.16, 0.26]);
  const bell = world.add(
    new ClickFixture(
      'bell',
      bellModel(),
      V(2.12, 1.05, 0.95),
      () => ({ title: t('obj.bell'), hint: t('hint.bell') }),
      (c) => {
        c.audio.play('counterBell', { x: 2.1 });
        c.bus.emit('bell:rung', {});
      },
    ),
    ctx,
  );
  void bell;
  // Potion shelf: two tiers at the right end of the counter
  const shelfGroup = new THREE.Group();
  const tierMat = toon({ map: woodPlank('light') });
  const slots: THREE.Vector3[] = [];
  for (let tier = 0; tier < 2; tier++) {
    const y = 1.08 + tier * 0.26;
    const z = 0.95 - tier * 0.16;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.16), tierMat);
    b.position.set(4.35, y, z);
    b.castShadow = true;
    b.receiveShadow = true;
    shelfGroup.add(b);
    staticBox(V(4.35, y, z), [0.62, 0.03, 0.16]);
    world.addSurface(b, { tag: 'shelf' });
    for (let i = 0; i < 3; i++) slots.push(V(4.15 + i * 0.2, y + 0.016, z));
    if (tier === 1) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.03), tierMat);
      back.position.set(4.35, y - 0.12, z - 0.09);
      shelfGroup.add(back);
    }
  }
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.34), tierMat);
    side.position.set(4.35 + s * 0.31, 1.22, 0.87);
    shelfGroup.add(side);
  }
  scene.add(shelfGroup);
  const shelf = world.add(new PotionShelf(ctx, V(4.35, 1.08, 0.9), slots), ctx);
  // Crystal lamp (upgrade) & counter candle
  const upgradeProps = new Map<string, THREE.Object3D>();
  const lamp = crystalCluster('#b55088', 1.4);
  add(lamp, 3.75, 1.05, 1.02);
  upgradeProps.set('crystal_lamp', lamp);
  const counterCandle = candleModel(0.1);
  add(counterCandle.group, 3.0, 1.05, 1.07);
  ctx.renderer.lighting.addCandle(V(3.0, 1.3, 1.07), 3, counterCandle.flame);

  // ---------------------------------------------------------------------
  // Back of the shop: bookshelf, lectern, mentor's chair, catalog, sign
  // ---------------------------------------------------------------------
  const bookshelf = bookshelfModel(1.5, 2.4, 0.4);
  add(bookshelf, 1.65, 0, -3.58);
  staticBox(V(1.65, 1.2, -3.58), [1.5, 2.4, 0.4]);
  const lectern = lecternModel();
  add(lectern.group, 1.0, 0, -2.6, 0.15);
  staticBox(V(1.0, 0.5, -2.6), [0.5, 1.0, 0.4]);
  const book = world.add(
    new ClickFixture(
      'lectern',
      bookModel(true, '#68386c'),
      V(1.0, 1.1, -2.55),
      () => ({ title: t('obj.book'), hint: t('hint.book') }),
      (c) => {
        c.audio.play('bookOpen', { x: 1 });
        c.ui.openPanel('book');
      },
    ),
    ctx,
  );
  book.object.rotation.set(0.35, 0.15, 0);
  world.add(new Ambient(new THREE.Group(), (_o, _t, c, dt) => sparkleAbove(c, V(1.0, 1.25, -2.5), '#b55088', 2.5, dt, 'lecternSparkle')), ctx);
  const lecternCandle = candleModel(0.1);
  add(lecternCandle.group, 1.32, 1.02, -2.72);
  ctx.renderer.lighting.addCandle(V(1.32, 1.28, -2.72), 3, lecternCandle.flame);

  const chair = armchairModel();
  add(chair, 2.35, 0, -2.75, -0.45);
  staticBox(V(2.35, 0.45, -2.75), [0.8, 0.9, 0.7]);

  const catalogBoard = new THREE.Group();
  const cork = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.04), toon({ color: '#b86f50' }));
  catalogBoard.add(cork);
  for (let i = 0; i < 4; i++) {
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.26), toon({ color: '#ead4aa' }));
    paper.position.set(-0.14 + (i % 2) * 0.28, 0.17 - Math.floor(i / 2) * 0.34, 0.025);
    paper.rotation.z = (rng.next() - 0.5) * 0.2;
    catalogBoard.add(paper);
  }
  world.add(
    new ClickFixture(
      'catalog',
      catalogBoard,
      V(4.72, 1.6, -3.76),
      () => ({ title: t('obj.catalog'), hint: t('hint.catalog') }),
      (c) => {
        c.audio.play('pageFlip', { x: 4.7 });
        c.ui.openPanel('catalog');
      },
    ),
    ctx,
  );

  const sign = signModel();
  world.add(
    new ClickFixture(
      'sign',
      sign.group,
      V(2.85, 1.65, -3.72),
      (c) => ({ title: t('obj.sign'), subtitle: c.state.shopOpen ? t('hud.open') : t('hud.closed'), hint: t('hint.sign') }),
      (c) => c.bus.emit('sign:clicked', {}),
    ),
    ctx,
  );
  const lantern = lanternModel();
  add(lantern.group, 3.05, 2.35, -3.62);
  ctx.renderer.lighting.addCandle(V(3.05, 2.45, -3.45), 4, lantern.flame, '#ffb35a', 6);

  // ---------------------------------------------------------------------
  // Decorations
  // ---------------------------------------------------------------------
  const broom = broomModel();
  add(broom, -4.85, 0, 0.1);
  broom.rotation.z = -0.22;
  const map = wallMap();
  map.position.set(leftX + 0.17, 1.9, -1.3);
  map.rotation.y = Math.PI / 2;
  scene.add(map);
  const plant1 = pottedPlant('#3e8948');
  add(plant1, -1.95, win.y0, wallZ + 0.22);
  const plant2 = pottedPlant('#63c74d', '#733e39');
  add(plant2, 4.75, 0, -1.2);
  const mandrake = pottedPlant('#8a9a3a', '#a22633');
  add(mandrake, 4.7, 0, 0.05);
  upgradeProps.set('mandrake_pot', mandrake);
  const owl = new THREE.Group();
  const owlBody = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), toon({ color: '#b86f50' }));
  owlBody.scale.set(0.9, 1.2, 0.85);
  owl.add(owlBody);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), toon({ color: '#fee761', emissive: '#feae34', emissiveIntensity: 0.4 }));
    eye.position.set(s * 0.045, 0.06, 0.09);
    owl.add(eye);
  }
  add(owl, 2.2, 2.52, -3.5);
  upgradeProps.set('stuffed_owl', owl);
  const cozyRug = rugModel(1.6, 1.1);
  add(cozyRug, 3.3, 0.006, 1.75);
  cozyRug.rotation.set(-Math.PI / 2, 0, 0);
  upgradeProps.set('cozy_rug', cozyRug);
  for (const [x, y, z, ry] of [
    [-4.85, 3.0, -3.65, Math.PI / 4],
    [4.85, 3.0, -3.65, -Math.PI / 4],
  ]) {
    const web = cobwebQuad(0.8);
    web.position.set(x, y, z);
    web.rotation.set(0, ry, x < 0 ? 0 : Math.PI / 2);
    scene.add(web);
  }
  // Physically hanging props (Babylon pendulums)
  const hangers: Array<[() => THREE.Object3D, number, number, number]> = [
    [() => herbBundle('#3e8948'), -4.1, H - 0.2, -2.7],
    [() => herbBundle('#8a9a3a'), -3.5, H - 0.2, -2.25],
    [() => hangingWing(), -2.6, H - 0.2, -2.25],
    [() => hangingScales(), -0.9, H - 0.2, -2.25],
    [() => herbBundle('#b55088'), 0.6, H - 0.2, -2.25],
    [() => hangingWing(), 2.3, H - 0.2, -2.25],
    [() => herbBundle('#63c74d'), 4.1, H - 0.2, -2.5],
  ];
  for (const [make, x, y, z] of hangers) {
    const visual = make();
    world.add(new Swinger(ctx, visual, V(x, y, z), 0.55), ctx);
  }
  // Crystal glow on the shelf gently pulses.
  world.add(
    new Ambient(new THREE.Group(), (_o, time) => {
      const k = 0.7 + 0.3 * Math.sin(time * 1.7);
      lamp.traverse((m) => {
        const mm = (m as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
        if (mm && 'emissiveIntensity' in mm && mm.transparent) mm.emissiveIntensity = k;
      });
    }),
    ctx,
  );

  // ---------------------------------------------------------------------
  // Anchors & camera presets
  // ---------------------------------------------------------------------
  const anchors: ShopAnchors = {
    doorOutside: V(3.8, 0, -4.7),
    doorInside: V(3.8, 0, -3.2),
    counterSpot: V(3.4, 0, 0.08),
    queue: [V(3.95, 0, -0.95), V(3.3, 0, -1.75), V(4.3, 0, -2.3)],
    browse: [V(2.2, 0, -1.9), V(4.4, 0, -1.6), V(3.0, 0, -2.6)],
    mentorSeat: V(2.35, 0.42, -2.72),
    serveZone: { minX: 2.8, maxX: 4.0, minZ: 0.5, maxZ: 1.25, y: 1.05 },
    coinDrop: V(3.35, 1.3, 0.85),
    cashBox: V(2.55, 1.2, 1.0),
    frogCure: V(2.35, 0.5, -2.2),
  };

  for (const [id, obj] of upgradeProps) obj.visible = ctx.state.has(id);

  return {
    cauldron,
    hearth,
    ladle,
    tap,
    bellows,
    damper,
    board,
    knife,
    hammer,
    mortar,
    rack,
    barrel,
    bucket,
    shelf,
    door: doorEntity,
    sources,
    anchors,
    presets: {
      overview: { focus: [0.1, 1.05, -0.7], distance: 12.2, yaw: 0.05 },
      cauldron: { focus: [-0.45, 0.85, -0.75], distance: 6.6, yaw: 0.05 },
      table: { focus: [-3.1, 0.9, 0.55], distance: 4.8, yaw: 0.12 },
      counter: { focus: [3.3, 1.0, 0.2], distance: 5.4, yaw: -0.1 },
      shelves: { focus: [-3.2, 1.1, -2.7], distance: 5.4, yaw: 0.1 },
    },
    upgradeProps,
    sky,
    lightShafts,
    flames: [tableCandle.flame, counterCandle.flame, lecternCandle.flame, lantern.flame, (skull.userData.flame as THREE.Mesh)],
  };
}
