// The garden behind the shop: a small diorama (its own Three.js scene with
// the same pixel pipeline) with six soil beds, two crystal geodes, a seed
// chest, a pump, a pond where a bog toad sometimes sits and the shop's back
// door. Click a bed to plant, water or harvest. The shop keeps running while
// you are out here – a bell tells you when someone comes in.

import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import type { ModeHandler } from '../../core/Game';
import { CameraRig } from '../../rendering/three/CameraRig';
import { toon, toonGradient, toonUnique, unlit } from '../../rendering/three/materials';
import { hearthStone, plaster, stoneWall, woodPlank } from '../../rendering/three/textures/PixelTextures';
import { Painter } from '../../rendering/three/textures/Painter';
import { ParticleRenderer, Shape } from '../../vfx/ParticleRenderer';
import { h } from '../../ui/UIRoot';
import type { HoverInfo } from '../../world/Entity';
import { CROP_MAP, PLOTS, WATER_HOURS, canHarvest, harvest, isNightHour, isRipe, needsWater, plotProgress, water, type BedKind } from '../../data/garden';
import { INGREDIENTS } from '../../data/ingredients';
import { groundDetail, sceneryGeometry, vertexColorMaterial, fence } from '../outdoor/OutdoorModels';
import type { Expedition } from '../../gameplay/gathering/Expedition';
import type { SeedPanel } from '../../ui/SeedPanel';
import { t, tr } from '../../core/i18n';
import { clamp, lerp } from '../../core/math';
import { rng } from '../../core/Random';

type PickKind = 'plot' | 'chest' | 'pond' | 'door' | 'pump';

interface Pick {
  kind: PickKind;
  index?: number;
}

interface PlotView {
  index: number;
  bed: BedKind;
  center: THREE.Vector3;
  soilMat: THREE.MeshToonMaterial;
  plants: THREE.Group;
  key: string;
  drop: THREE.Sprite;
  sparkle: number;
}

export interface GardenDeps {
  expedition: Expedition;
  seeds: SeedPanel;
  setMode(mode: GameContext['mode'], handler: ModeHandler | null): void;
  onEnter(): void;
  onExit(): void;
}

const BED_POS: Array<[number, number]> = [
  [-1.6, -0.9],
  [1.0, -0.9],
  [3.6, -0.9],
  [-1.6, 1.4],
  [1.0, 1.4],
  [3.6, 1.4],
  [-4.4, -0.9],
  [-4.4, 1.4],
];

export class GardenScene implements ModeHandler {
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  active = false;
  private built = false;
  private plots: PlotView[] = [];
  private readonly pickables: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private hovered: Pick | null = null;
  private readonly bar: HTMLElement;
  private particles!: ParticleRenderer;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private ambient!: THREE.AmbientLight;
  private lanterns: THREE.PointLight[] = [];
  private lanternMats: THREE.MeshToonMaterial[] = [];
  private toad!: THREE.Group;
  private can!: THREE.Group;
  private canAnim: { plot: number; t: number } | null = null;
  private time = 0;
  private fireflyT = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly deps: GardenDeps,
  ) {
    this.rig = new CameraRig(16 / 9);
    this.rig.minDistance = 6.5;
    this.rig.maxDistance = 14;
    Object.assign(this.rig.bounds, { minX: -4, maxX: 4, minZ: -2, maxZ: 3 });
    this.rig.setPreset({ focus: [0.1, 0.3, 0.4], distance: 11, yaw: 0.08 }, true);
    this.bar = h('div', 'wb-garden-bar wb-interactive');
    this.bar.hidden = true;
    const back = h('button', 'wb-btn', `🏠 ${t('garden.back')}`);
    back.addEventListener('click', () => this.exit());
    const chest = h('button', 'wb-btn', `🌱 ${t('garden.chest')}`);
    chest.addEventListener('click', () => this.openSeeds(null));
    this.bar.append(back, chest, h('span', 'tip', t('garden.help')));
    (document.getElementById('ui-root') ?? document.body).appendChild(this.bar);
    ctx.input.onPointerDown((b) => {
      if (this.active && b === 0 && !ctx.ui.panelOpen) this.click();
    });
    ctx.bus.on('customer:arrived', () => {
      if (this.active) {
        ctx.bus.emit('toast', { text: t('garden.customer'), kind: 'warn' });
        ctx.audio.play('doorBell', { volume: 0.5 });
      }
    });
    deps.seeds.onPlanted = (plot) => this.refreshPlot(plot, true);
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

  private build(): void {
    if (this.built) return;
    this.built = true;
    const scene = this.scene;
    scene.fog = new THREE.Fog('#8a9ab8', 16, 34);
    scene.background = new THREE.Color('#8a9ab8');
    this.hemi = new THREE.HemisphereLight('#aab4d0', '#3a2a28', 1);
    this.ambient = new THREE.AmbientLight('#6a6480', 0.25);
    this.sun = new THREE.DirectionalLight('#ffe6c0', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -10;
    sc.right = 10;
    sc.top = 10;
    sc.bottom = -10;
    sc.near = 1;
    sc.far = 40;
    this.sun.shadow.bias = -0.001;
    scene.add(this.hemi, this.ambient, this.sun, this.sun.target);

    // Ground: grass with a stone path
    const grassTex = groundDetail().clone();
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(12, 10);
    grassTex.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(36, 30), toon({ map: grassTex, color: '#4a6a3a' }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const stone = toon({ map: hearthStone() });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.06, 7), stone);
      s.position.set(-0.3 + (i % 2) * 0.25, 0.03, -2.9 + i * 0.95);
      s.receiveShadow = true;
      scene.add(s);
    }

    // The shop's back wall with its door and a window
    const wall = new THREE.Group();
    const stoneM = toon({ map: repeat(stoneWall(), 4, 1) });
    const plasterM = toon({ map: repeat(plaster(), 4, 2) });
    const wood = toon({ map: woodPlank('dark') });
    const box = (w: number, hh: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m);
      b.position.set(x, y, z);
      b.castShadow = true;
      b.receiveShadow = true;
      wall.add(b);
      return b;
    };
    box(13, 1.1, 0.4, stoneM, 0, 0.55, -3.8);
    box(13, 2.6, 0.36, plasterM, 0, 2.4, -3.8);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.3, 2.2), toon({ color: '#4a2230' }));
    roof.position.set(0, 3.9, -3.3);
    roof.rotation.x = 0.45;
    wall.add(roof);
    const door = box(1.2, 2.1, 0.12, toon({ map: woodPlank('mid') }), -0.3, 1.05, -3.56);
    door.userData.pick = { kind: 'door' } satisfies Pick;
    this.pickables.push(door);
    box(1.4, 0.14, 0.2, wood, -0.3, 2.15, -3.54);
    const glow = toon({ color: '#ffcf7a', emissive: '#ffb35a', emissiveIntensity: 1.1 });
    box(1.2, 0.9, 0.06, glow, 2.8, 2.3, -3.6);
    box(1.4, 0.1, 0.2, wood, 2.8, 1.82, -3.56);
    scene.add(wall);

    // Fence around the garden
    const gy = () => 0;
    fence(-6.6, -3.6, -6.6, 3.8, scene, gy);
    fence(6.6, -3.6, 6.6, 3.8, scene, gy);
    fence(-6.6, 3.8, 6.6, 3.8, scene, gy);

    // Trees and hills beyond the fence
    const mat = vertexColorMaterial();
    const place = (kind: Parameters<typeof sceneryGeometry>[0], list: Array<[number, number, number]>) => {
      const im = new THREE.InstancedMesh(sceneryGeometry(kind), mat, list.length);
      list.forEach(([x, z, s], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, x * 1.7, 0)), new THREE.Vector3(s, s, s))));
      im.castShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
    };
    const trees: Array<[number, number, number]> = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI - Math.PI * 0.05;
      trees.push([Math.cos(a) * rng.range(9, 13), Math.sin(a) * rng.range(6, 9) + 2, rng.range(0.9, 1.4)]);
    }
    place('pine', trees.filter((_, i) => i % 2 === 0));
    place('oak', trees.filter((_, i) => i % 2 === 1));
    place('bush', [
      [-7.4, -1, 1],
      [7.5, 0.5, 1.1],
      [-7.2, 2.5, 0.9],
    ]);

    // Beds and geodes
    const soilTex = soilTexture();
    PLOTS.forEach((bed, i) => {
      const [x, z] = BED_POS[i];
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const soilMat = toonUnique({ map: soilTex, color: '#8a6a4a' });
      if (bed === 'soil') {
        const frame = toon({ map: woodPlank('light') });
        for (const [w, d, fx, fz] of [
          [2.3, 0.12, 0, -0.7],
          [2.3, 0.12, 0, 0.7],
          [0.12, 1.5, -1.1, 0],
          [0.12, 1.5, 1.1, 0],
        ]) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), frame);
          b.position.set(fx, 0.15, fz);
          b.castShadow = true;
          g.add(b);
        }
        const soil = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.24, 1.3), soilMat);
        soil.position.y = 0.12;
        soil.receiveShadow = true;
        soil.userData.pick = { kind: 'plot', index: i } satisfies Pick;
        g.add(soil);
        this.pickables.push(soil);
      } else {
        const rock = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1, 0.45, 9), toon({ color: '#4a4c5e' }));
        rock.position.y = 0.22;
        rock.castShadow = true;
        rock.userData.pick = { kind: 'plot', index: i } satisfies Pick;
        g.add(rock);
        this.pickables.push(rock);
        const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 9), toonUnique({ color: '#3a2a5a', emissive: '#5a3a8a', emissiveIntensity: 0.4 }));
        inner.position.y = 0.46;
        g.add(inner);
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 4), toon({ color: '#b55088', emissive: '#68386c', emissiveIntensity: 0.6 }));
          c.position.set(Math.cos(a) * 0.82, 0.5, Math.sin(a) * 0.82);
          c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
          g.add(c);
        }
      }
      const plants = new THREE.Group();
      plants.position.y = bed === 'soil' ? 0.24 : 0.47;
      g.add(plants);
      const drop = new THREE.Sprite(new THREE.SpriteMaterial({ map: dropTexture(), depthTest: false }));
      drop.scale.set(0.42, 0.42, 1);
      drop.position.set(0, 1.25, 0);
      drop.renderOrder = 10;
      drop.visible = false;
      g.add(drop);
      scene.add(g);
      this.plots.push({ index: i, bed, center: g.position.clone(), soilMat, plants, key: '', drop, sparkle: 0 });
    });

    // Seed chest
    const chest = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), toon({ map: woodPlank('mid') }));
    cb.position.y = 0.3;
    cb.castShadow = true;
    chest.add(cb);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 0.75), toon({ map: woodPlank('dark') }));
    lid.position.set(0, 0.66, -0.05);
    lid.rotation.x = -0.35;
    chest.add(lid);
    for (let k = 0; k < 5; k++) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), toon({ color: ['#c28569', '#ead4aa', '#b86f50', '#8f563b', '#e8c793'][k] }));
      bag.position.set(-0.36 + k * 0.18, 0.62, 0.05);
      chest.add(bag);
    }
    chest.position.set(5.2, 0, -2.6);
    chest.rotation.y = -0.3;
    scene.add(chest);
    cb.userData.pick = { kind: 'chest' } satisfies Pick;
    lid.userData.pick = { kind: 'chest' } satisfies Pick;
    this.pickables.push(cb, lid);

    // Pump and watering can
    const pump = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 0.3), toon({ color: '#5a6988' }));
    post.position.y = 0.65;
    pump.add(post);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 6), toon({ color: '#5a6988' }));
    spout.rotation.x = Math.PI / 2;
    spout.position.set(0, 1.05, 0.3);
    pump.add(spout);
    const trough = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.55), toon({ map: woodPlank('light') }));
    trough.position.set(0, 0.18, 0.55);
    pump.add(trough);
    const waterTop = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.45), toon({ color: '#3a6688', emissive: '#1d2b44', emissiveIntensity: 0.5 }));
    waterTop.rotation.x = -Math.PI / 2;
    waterTop.position.set(0, 0.33, 0.55);
    pump.add(waterTop);
    pump.position.set(-5.3, 0, -2.9);
    for (const o of [post, trough]) {
      o.userData.pick = { kind: 'pump' } satisfies Pick;
      this.pickables.push(o);
    }
    scene.add(pump);
    this.can = wateringCan();
    this.can.position.set(-4.5, 0, -2.4);
    scene.add(this.can);

    // Pond with a toad
    const pond = new THREE.Mesh(new THREE.CircleGeometry(1.15, 14), toon({ color: '#2e4438', emissive: '#10201a', emissiveIntensity: 0.6 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(5.2, 0.02, 2.6);
    pond.userData.pick = { kind: 'pond' } satisfies Pick;
    this.pickables.push(pond);
    scene.add(pond);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.14, 5, 14), stone);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(5.2, 0.05, 2.6);
    scene.add(rim);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 7), toon({ color: '#3e8948' }));
    pad.position.set(5.0, 0.05, 2.5);
    scene.add(pad);
    this.toad = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), toon({ color: '#5a6a30' }));
    tb.scale.set(1.2, 0.7, 1);
    tb.position.y = 0.12;
    this.toad.add(tb);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), toon({ color: '#fee761', emissive: '#feae34', emissiveIntensity: 0.9 }));
      e.position.set(s * 0.1, 0.24, -0.08);
      this.toad.add(e);
    }
    this.toad.position.set(5.0, 0.06, 2.5);
    tb.userData.pick = { kind: 'pond' } satisfies Pick;
    this.pickables.push(tb);
    scene.add(this.toad);

    // Scarecrow and lanterns
    const scare = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), wood);
    pole.position.y = 0.9;
    scare.add(pole);
    const arms = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), wood);
    arms.position.y = 1.4;
    scare.add(arms);
    const coat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.25), toon({ color: '#5a3a5a' }));
    coat.position.y = 1.25;
    scare.add(coat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), toon({ color: '#d99a52', emissive: '#f77622', emissiveIntensity: 0.25 }));
    head.position.y = 1.8;
    scare.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 6), toon({ color: '#262b44' }));
    hat.position.y = 2.1;
    scare.add(hat);
    scare.position.set(-3.0, 0, 3.1);
    scare.traverse((o) => (o.castShadow = true));
    scene.add(scare);
    for (const [x, z] of [
      [-6.3, -3.2],
      [6.3, -3.2],
      [-6.3, 3.5],
      [6.3, 3.5],
    ]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), wood);
      p.position.set(x, 0.9, z);
      scene.add(p);
      const lm = toonUnique({ color: '#ffcf7a', emissive: '#ffb35a', emissiveIntensity: 1 });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), lm);
      lamp.position.set(x, 1.9, z);
      scene.add(lamp);
      this.lanternMats.push(lm);
      const l = new THREE.PointLight('#ffb35a', 0, 9, 1.6);
      l.position.set(x, 2.1, z);
      scene.add(l);
      this.lanterns.push(l);
    }
    this.particles = new ParticleRenderer(scene, 1200);
    this.ctx.renderer.extraScenes.add(scene);
    for (let i = 0; i < this.plots.length; i++) this.refreshPlot(i, true);
  }

  // -------------------------------------------------------------------------
  // Enter / exit
  // -------------------------------------------------------------------------

  enter(): void {
    this.build();
    this.active = true;
    this.deps.setMode('garden', this);
    this.ctx.renderer.setView({
      scene: this.scene,
      camera: this.rig.camera,
      update: (dt) => this.renderUpdate(dt),
      setAspect: (a) => this.rig.setAspect(a),
    });
    this.rig.setPreset({ focus: [0.1, 0.3, 0.4], distance: 11, yaw: 0.08 }, true);
    this.bar.hidden = false;
    this.ctx.audio.play('doorCreak', { volume: 0.5 });
    this.deps.onEnter();
    this.ctx.state.count('garden_visits');
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.bar.hidden = true;
    this.ctx.ui.tooltip(null);
    this.ctx.ui.setCursor('default');
    this.ctx.renderer.setView(null);
    this.deps.setMode('shop', null);
    this.ctx.audio.play('doorBell', { volume: 0.5 });
    this.deps.onExit();
  }

  private openSeeds(plot: number | null): void {
    this.deps.seeds.plot = plot;
    this.ctx.ui.openPanel('seeds');
    if (plot !== null) this.deps.seeds.plot = plot;
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.active) return;
    const ctx = this.ctx;
    this.time += dt;
    const input = ctx.input;
    if (!ctx.ui.panelOpen) {
      const sp = this.rig.distance * 0.5 * dt;
      let dx = 0;
      let dz = 0;
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) dx -= 1;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) dx += 1;
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) dz -= 1;
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) dz += 1;
      if (dx || dz) this.rig.pan(dx * sp, dz * sp);
      if (input.isDown('KeyQ')) this.rig.rotate(dt * 0.8);
      if (input.isDown('KeyE')) this.rig.rotate(-dt * 0.8);
      if (input.wheel) this.rig.zoom(input.wheel * 0.0012);
      this.rig.parallax.set(clamp(input.pointer.ndcX, -1, 1), clamp(input.pointer.ndcY, -1, 1));
      this.updateHover();
    } else {
      ctx.ui.tooltip(null);
    }
    for (let i = 0; i < this.plots.length; i++) this.refreshPlot(i);
    const hasToad = this.toadHere();
    this.toad.visible = hasToad;
    if (hasToad) this.toad.position.y = 0.06 + Math.abs(Math.sin(this.time * 1.3)) * 0.02;
    if (this.canAnim) {
      const a = this.canAnim;
      a.t += dt;
      const p = this.plots[a.plot].center;
      const k = Math.min(1, a.t / 0.35);
      this.can.position.set(lerp(-4.5, p.x - 0.5, k), lerp(0, 1.1, k), lerp(-2.4, p.z, k));
      this.can.rotation.z = a.t > 0.35 ? -0.7 : 0;
      if (a.t > 0.35 && a.t < 1.2 && Math.random() < 0.8)
        this.particles.spawn({ x: p.x - 0.2 + Math.random() * 0.5, y: 1.0, z: p.z + (Math.random() - 0.5) * 0.4, vy: -2.5, vx: 0.3, life: 0.45, size0: 0.05, color0: new THREE.Color('#6fa8d6'), alpha0: 0.9, alpha1: 0.4, gravity: -6 });
      if (a.t > 1.4) {
        this.canAnim = null;
        this.can.position.set(-4.5, 0, -2.4);
        this.can.rotation.z = 0;
      }
    }
  }

  private toadHere(): boolean {
    const s = this.ctx.state;
    return s.isUnlocked('bog_toad_eye') && s.garden.toadDay !== s.day;
  }

  private renderUpdate(dt: number): void {
    const ctx = this.ctx;
    const h = ctx.state.hour;
    const night = h < 5.5 || h >= 22 ? 1 : h < 7.5 ? 1 - (h - 5.5) / 2 : h > 19 ? clamp((h - 19) / 3, 0, 1) : 0;
    const df = ctx.renderer.darkFantasy;
    const day = new THREE.Color(df ? '#4a4a58' : '#8a9ab8');
    const dusk = new THREE.Color(df ? '#3a2630' : '#7a5a70');
    const nightC = new THREE.Color(df ? '#060509' : '#0e1020');
    const duskK = Math.max(0, 1 - Math.abs(h - 19.5) / 1.6);
    const bg = day.lerp(dusk, duskK * (1 - night)).lerp(nightC, night);
    (this.scene.background as THREE.Color).copy(bg);
    (this.scene.fog as THREE.Fog).color.copy(bg);
    const dayT = clamp((h - 6) / 14, 0, 1);
    this.sun.position.set(Math.cos(dayT * Math.PI) * 12, 6 + Math.sin(dayT * Math.PI) * 8, 6);
    this.sun.intensity = (1 - night) * (df ? 1.3 : 2.1);
    this.sun.color.set('#ffe6c0').lerp(new THREE.Color('#ff8a5a'), duskK);
    this.sun.castShadow = ctx.renderer.quality === 'high' || ctx.renderer.quality === 'medium';
    this.hemi.intensity = lerp(1.05, 0.4, night) * (df ? 0.8 : 1);
    this.hemi.color.set(df ? '#8a8a9c' : '#aab4d0').lerp(new THREE.Color('#1e2648'), night);
    this.ambient.intensity = lerp(0.28, 0.14, night);
    for (const l of this.lanterns) l.intensity = 5 * night;
    for (const m of this.lanternMats) m.emissiveIntensity = 0.4 + 1.2 * night;
    // Fireflies at night, glints over ripe beds.
    this.fireflyT -= dt;
    if (night > 0.5 && this.fireflyT <= 0) {
      this.fireflyT = 0.25;
      this.particles.spawn({ x: rng.range(-6, 6), y: rng.range(0.4, 2), z: rng.range(-3, 3.5), vx: rng.range(-0.2, 0.2), vy: rng.range(-0.1, 0.2), life: 3, size0: 0.06, color0: new THREE.Color('#c8ff6a'), alpha0: 0, alpha1: 0, wobble: 0.2, additive: true, shape: Shape.CIRCLE });
    }
    for (const p of this.plots) {
      const st = this.ctx.state.garden.plots[p.index];
      if (!canHarvest(st, h)) continue;
      p.sparkle -= dt;
      if (p.sparkle <= 0) {
        p.sparkle = 0.3;
        const c = CROP_MAP[st.crop!].color;
        this.particles.spawn({ x: p.center.x + rng.range(-0.8, 0.8), y: 0.6, z: p.center.z + rng.range(-0.4, 0.4), vy: 0.5, life: 1, size0: 0.05, size1: 0.02, color0: new THREE.Color('#ffffff'), color1: new THREE.Color(c), alpha0: 1, alpha1: 0, additive: true, shape: Shape.SPARKLE });
      }
    }
    this.rig.update(dt);
    this.particles.setViewport(ctx.renderer.lowHeight, this.rig.camera.fov);
    this.particles.update(dt);
  }

  // -------------------------------------------------------------------------
  // Plots
  // -------------------------------------------------------------------------

  private refreshPlot(i: number, force = false): void {
    const view = this.plots[i];
    if (!view) return;
    const s = this.ctx.state;
    const st = s.garden.plots[i];
    const crop = st.crop ? CROP_MAP[st.crop] : null;
    const prog = plotProgress(st);
    const stage = crop ? (isRipe(st) ? 3 : Math.min(2, Math.floor(prog * 3))) : -1;
    const open = crop?.night ? isNightHour(s.hour) : true;
    const wet = st.water > 0.01;
    const key = `${st.crop}:${stage}:${open}`;
    view.drop.visible = needsWater(st);
    view.drop.position.y = 1.25 + Math.sin(this.time * 3 + i) * 0.06;
    if (view.bed === 'soil') view.soilMat.color.set(wet ? '#5a4030' : '#8a6a4a');
    if (key === view.key && !force) return;
    view.key = key;
    view.plants.clear();
    if (!crop) return;
    const spots: Array<[number, number]> =
      view.bed === 'soil'
        ? [
            [-0.65, -0.3],
            [0, -0.3],
            [0.65, -0.3],
            [-0.65, 0.3],
            [0, 0.3],
            [0.65, 0.3],
          ]
        : [
            [0, 0],
            [0.35, 0.2],
            [-0.35, 0.2],
            [0.2, -0.35],
            [-0.25, -0.3],
          ];
    for (const [x, z] of spots) view.plants.add(plantModel(crop.id, stage, open, x, z));
  }

  private plotInfo(i: number): HoverInfo {
    const s = this.ctx.state;
    const st = s.garden.plots[i];
    const bed = PLOTS[i];
    const touch = this.ctx.input.pointer.type !== 'mouse';
    if (!st.crop) return { title: t(bed === 'geode' ? 'garden.geode' : 'garden.bed'), subtitle: t('garden.empty'), hint: t(touch ? 'garden.tapPlant' : 'garden.clickPlant') };
    const crop = CROP_MAP[st.crop];
    const lines: HoverInfo['lines'] = [{ text: t('garden.growth'), bar: plotProgress(st), color: crop.color }];
    if (!crop.dry) lines.push({ text: t('garden.water'), bar: st.water / WATER_HOURS, color: '#6fa8d6' });
    let sub: string;
    let hint: string;
    if (canHarvest(st, s.hour)) {
      sub = t('garden.ripe');
      hint = t('garden.harvestHint');
    } else if (isRipe(st)) {
      sub = t('garden.waitNight');
      hint = t('garden.waitNightHint');
    } else if (needsWater(st)) {
      sub = t('garden.thirsty');
      hint = t('garden.waterHint');
    } else {
      sub = t('garden.growing', { n: Math.round(plotProgress(st) * 100) });
      hint = crop.dry ? t('garden.dryHint') : t('garden.waterHint');
    }
    return { title: tr(INGREDIENTS[crop.ingredientId].name), subtitle: sub, lines, hint };
  }

  private infoFor(p: Pick): HoverInfo {
    switch (p.kind) {
      case 'plot':
        return this.plotInfo(p.index!);
      case 'chest':
        return { title: t('garden.chest'), hint: t('garden.chestHint') };
      case 'pump':
        return { title: t('garden.pump'), hint: t('garden.pumpHint') };
      case 'door':
        return { title: t('garden.door'), hint: t('garden.doorHint') };
      default:
        return this.toadHere() ? { title: t('garden.pond'), subtitle: t('garden.toadHere'), hint: t('garden.toadHint') } : { title: t('garden.pond'), hint: this.ctx.state.isUnlocked('bog_toad_eye') ? t('garden.toadGone') : t('garden.toadNone') };
    }
  }

  private pickAtPointer(): Pick | null {
    const p = this.ctx.input.pointer;
    if (!p.valid || !p.inside) return null;
    this.ndc.set(p.ndcX, p.ndcY);
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    for (const hit of hits) {
      const pick = hit.object.userData.pick as Pick | undefined;
      if (pick && hit.object.visible && (pick.kind !== 'pond' || hit.object.parent?.visible !== false)) return pick;
    }
    return null;
  }

  private updateHover(): void {
    const pick = this.pickAtPointer();
    this.hovered = pick;
    const ui = this.ctx.ui;
    if (!pick) {
      ui.tooltip(null);
      ui.setCursor('default');
      return;
    }
    ui.setCursor('point');
    ui.tooltip(this.infoFor(pick), this.ctx.input.pointer.x, this.ctx.input.pointer.y);
  }

  private click(): void {
    const pick = this.pickAtPointer() ?? this.hovered;
    if (!pick) return;
    const ctx = this.ctx;
    const s = ctx.state;
    switch (pick.kind) {
      case 'door':
        this.exit();
        return;
      case 'chest':
        this.openSeeds(null);
        return;
      case 'pump':
        ctx.audio.play('fill', { volume: 0.5 });
        ctx.bus.emit('toast', { text: t('garden.pumpHint'), kind: 'info' });
        return;
      case 'pond': {
        if (!this.toadHere()) {
          ctx.audio.play('plop', { volume: 0.5 });
          return;
        }
        s.garden.toadDay = s.day;
        s.addStock('bog_toad_eye', 1);
        ctx.audio.play('frogCroak', { volume: 0.6 });
        ctx.ui.floatText(this.toad.position.clone().setY(0.8), `+1 ${tr(INGREDIENTS.bog_toad_eye.name)}`, '#b4c83a');
        ctx.bus.emit('toast', { text: t('garden.toadGave'), kind: 'good' });
        return;
      }
      default:
        break;
    }
    const i = pick.index!;
    const st = s.garden.plots[i];
    const view = this.plots[i];
    if (!st.crop) {
      this.openSeeds(i);
      return;
    }
    const crop = CROP_MAP[st.crop];
    if (canHarvest(st, s.hour)) {
      const res = harvest(s.garden, i, s.hour, Math.random());
      if (!res) return;
      this.deps.expedition.unlockIngredient(res.ingredientId);
      s.addStock(res.ingredientId, res.count);
      s.count('harvests');
      ctx.audio.play('discovery', { volume: 0.45 });
      ctx.ui.floatText(view.center.clone().setY(1.2), `+${res.count} ${tr(INGREDIENTS[res.ingredientId].name)}`, '#fee761');
      for (let k = 0; k < 24; k++)
        this.particles.spawn({ x: view.center.x + rng.range(-0.9, 0.9), y: 0.5, z: view.center.z + rng.range(-0.5, 0.5), vx: rng.range(-0.6, 0.6), vy: rng.range(1.2, 2.6), vz: rng.range(-0.6, 0.6), life: 0.9, size0: 0.06, size1: 0.02, color0: new THREE.Color('#ffffff'), color1: new THREE.Color(crop.color), alpha0: 1, alpha1: 0, gravity: -4, additive: true, shape: Shape.SPARKLE });
      ctx.bus.emit('toast', { text: t('garden.harvested', { n: res.count, i: tr(INGREDIENTS[res.ingredientId].name) }), kind: 'good' });
      ctx.bus.emit('save:request', {});
      this.refreshPlot(i, true);
      return;
    }
    if (isRipe(st)) {
      ctx.bus.emit('toast', { text: t('garden.waitNight'), kind: 'info' });
      return;
    }
    if (!crop.dry && st.water < WATER_HOURS - 1) {
      water(s.garden, i);
      this.canAnim = { plot: i, t: 0 };
      ctx.audio.play('splash', { volume: 0.4, pitch: 1.3 });
      ctx.audio.play('fill', { volume: 0.35, delay: 0.3 });
      return;
    }
    ctx.bus.emit('toast', { text: t('garden.growing', { n: Math.round(plotProgress(st) * 100) }), kind: 'info' });
  }

  /** Debug hooks (tests). */
  readonly debug = {
    click: (kind: PickKind, index?: number) => {
      this.hovered = { kind, index };
      const saved = this.pickAtPointer.bind(this);
      this.pickAtPointer = () => null;
      this.click();
      this.pickAtPointer = saved;
    },
  };
}

// ---------------------------------------------------------------------------
// Models and textures
// ---------------------------------------------------------------------------

function repeat(tex: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const t2 = tex.clone();
  t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
  t2.repeat.set(rx, ry);
  t2.needsUpdate = true;
  return t2;
}

let soilTex: THREE.Texture | null = null;
function soilTexture(): THREE.Texture {
  if (soilTex) return soilTex;
  const p = new Painter(32, 32, 5);
  p.wrap = true;
  p.fill('#c8b8a0');
  for (let i = 0; i < 200; i++) p.px(p.rng.int(0, 31), p.rng.int(0, 31), p.rng.chance(0.5) ? '#a89880' : '#e0d0b8');
  for (let y = 4; y < 32; y += 8) p.rect(0, y, 32, 1, '#8a7a64');
  soilTex = p.texture({ repeat: [2, 1] });
  return soilTex;
}

let dropTex: THREE.Texture | null = null;
function dropTexture(): THREE.Texture {
  if (dropTex) return dropTex;
  const p = new Painter(16, 16, 3);
  p.disc(8, 10, 4.5, '#41a6f6');
  p.poly(
    [
      [8, 1],
      [4, 9],
      [12, 9],
    ],
    '#41a6f6',
  );
  p.rect(6, 8, 2, 3, '#a8e0ff');
  p.outline('#181425');
  dropTex = p.texture();
  return dropTex;
}

function wateringCan(): THREE.Group {
  const g = new THREE.Group();
  const m = toon({ color: '#5a8a9a' });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.32, 8), m);
  body.position.y = 0.16;
  g.add(body);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.4, 5), m);
  spout.position.set(0.25, 0.25, 0);
  spout.rotation.z = -1;
  g.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 4, 8, Math.PI), m);
  handle.position.set(-0.02, 0.34, 0);
  g.add(handle);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** One plant in a bed at a growth stage (0 seeds … 3 ripe). */
function plantModel(crop: string, stage: number, open: boolean, x: number, z: number): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = x * 3 + z * 5;
  if (stage === 0) {
    const seed = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 3), toon({ color: '#3a2a1a' }));
    seed.position.y = 0.02;
    g.add(seed);
    const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 3), toon({ color: '#63c74d' }));
    sprout.position.y = 0.05;
    g.add(sprout);
    return g;
  }
  const k = 0.45 + stage * 0.2;
  if (crop === 'mushroom') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * k, 0.05 * k, 0.22 * k, 6), toon({ color: '#ead4aa' }));
    stem.position.y = 0.11 * k;
    g.add(stem);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 * k, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      toon({ color: '#2ce8f5', emissive: '#1a9aa8', emissiveIntensity: stage === 3 ? 1.1 : 0.4 }),
    );
    cap.position.y = 0.2 * k;
    g.add(cap);
  } else if (crop === 'moonflower') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.35 * k, 4), toon({ color: '#3e8948' }));
    stem.position.y = 0.17 * k;
    g.add(stem);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 3), toon({ color: '#3e8948' }));
    leaf.position.set(0.05, 0.1 * k, 0);
    leaf.rotation.z = -1;
    g.add(leaf);
    if (stage === 3 && open) {
      for (let i = 0; i < 5; i++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 3), toon({ color: '#e8eef8', emissive: '#8a9aff', emissiveIntensity: 0.9 }));
        const a = (i / 5) * Math.PI * 2;
        petal.scale.set(1, 0.35, 0.6);
        petal.position.set(Math.cos(a) * 0.07, 0.36 * k, Math.sin(a) * 0.07);
        petal.rotation.y = -a;
        g.add(petal);
      }
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 3), toon({ color: '#fee761', emissive: '#feae34', emissiveIntensity: 0.8 }));
      heart.position.y = 0.37 * k;
      g.add(heart);
    } else {
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.05 * k + 0.02, 6, 4), toon({ color: stage === 3 ? '#c0cbff' : '#6a8a5a' }));
      bud.scale.y = 1.4;
      bud.position.y = 0.36 * k;
      g.add(bud);
    }
  } else {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.06 * k, 0.35 * k, 5), toon({ color: '#9af5e6', emissive: '#2ce8f5', emissiveIntensity: stage === 3 ? 1 : 0.45 }));
    c.position.y = 0.17 * k;
    c.rotation.z = x * 0.6;
    g.add(c);
  }
  void unlit;
  void toonGradient;
  return g;
}
