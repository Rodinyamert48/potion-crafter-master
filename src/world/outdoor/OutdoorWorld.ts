// The open world outside the shop (PC): first-person roaming with a Havok
// character controller, rendered by Three.js through the same pixel
// pipeline as the shop. The clock keeps running while you are out, the shop
// waits (the master watches the cauldron), gathering spots are emptied for
// the day, every region has a gathering altar with its own mini game, and
// the regions have their own dangers: wolves at night in the forest, falling
// rocks in the cavern, shades at the shrine, leeches and will-o'-wisps in
// the swamp, lava and a sleeping dragon in the valley. Every third day a
// pack of wolves roams all the regions (and howls). Each region hides an
// old recipe scroll in a secret place, and once in a long while a dragon
// egg lies in one of the valley's nests.

import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import type { ModeHandler } from '../../core/Game';
import type { BabylonCore } from '../../rendering/babylon/BabylonCore';
import { BabylonPhysicsWorld } from '../../physics/BabylonPhysicsWorld';
import type { BodyHandle } from '../../physics/PhysicsTypes';
import { BabylonParticleSim, type AmbientHandle } from '../../rendering/babylon/BabylonParticleSim';
import { ParticleRenderer, Shape } from '../../vfx/ParticleRenderer';
import { FpsController } from './FpsController';
import { OutdoorHUD, OutdoorPausePanel, type CompassMarker } from './OutdoorHUD';
import { OutdoorPets } from './OutdoorPets';
import { buildOutdoor, type SecretRef, type WorldRefs } from './OutdoorBuilder';
import { dragonEggModel, toadModel, toadstoolModel, wolfModel } from './OutdoorModels';
import { CAVERN, DOOR, DRAGON, GARDEN_GATE, PLAZA, SPAWN, WATER_Y, ZONES, ZONE_MAP, groundHeight, lavaMask, poolMask, walkMask, zoneAt, type V2 } from './layout';
import { REGION_MAP, type RegionId } from '../../data/regions';
import { INGREDIENTS } from '../../data/ingredients';
import { RECIPE_MAP, SCROLLS } from '../../data/potions';
import { DRAGON_EGG, eggNestToday, giveDragonEgg, isWolfDay } from '../../gameplay/WorldEvents';
import { buildIngredientVisual } from '../../rendering/three/models/ingredientModels';
import type { Expedition } from '../../gameplay/gathering/Expedition';
import type { MiniGamePanel } from '../../ui/MiniGamePanel';
import type { PetId } from '../../ui/minigames';
import { SECONDS_PER_HOUR } from '../../gameplay/day/DayCycle';
import { t, tr } from '../../core/i18n';
import { Random } from '../../core/Random';
import { clamp, lerp } from '../../core/math';
import { unlit } from '../../rendering/three/materials';

const SENS = 0.0022;
const MAX_HEARTS = 5;

interface GatherNode {
  id: string;
  zone: RegionId | 'road';
  ingredientId: string;
  poison: boolean;
  rare: boolean;
  pos: THREE.Vector3;
  group: THREE.Group;
  beam: THREE.Mesh;
  taken: boolean;
  phase: number;
  sniffed: number;
}

interface Wolf {
  group: THREE.Group;
  legs: THREE.Mesh[];
  /** The region it hunts in (it only chases you there). */
  zone: RegionId;
  pos: THREE.Vector3;
  home: THREE.Vector3;
  heading: number;
  state: 'prowl' | 'chase' | 'flee';
  t: number;
  cd: number;
}

interface Spirit {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  home: THREE.Vector3;
  phase: number;
  cd: number;
  kind: 'shade' | 'wisp';
}

interface Rock {
  mesh: THREE.Mesh;
  body: BodyHandle | null;
  target: THREE.Vector3;
  warn: number;
  age: number;
  hit: boolean;
}

interface Target {
  label: string;
  pos: THREE.Vector3;
  range: number;
  act?: () => void;
}

export interface OutdoorDeps {
  core: BabylonCore;
  expedition: Expedition;
  minigame: MiniGamePanel;
  setMode(mode: GameContext['mode'], handler: ModeHandler | null): void;
  /** Called after leaving (toGarden: straight into the garden). */
  onExit(toGarden: boolean): void;
  onEnter(): void;
  openMenu(): void;
}

export class OutdoorWorld implements ModeHandler {
  readonly scene = new THREE.Scene();
  readonly hud: OutdoorHUD;
  readonly pause: OutdoorPausePanel;
  private built = false;
  private refs!: WorldRefs;
  private physics!: BabylonPhysicsWorld;
  private player!: FpsController;
  private sim!: BabylonParticleSim;
  private particles!: ParticleRenderer;
  private amb!: Record<'fireflies' | 'mist' | 'embers' | 'ash' | 'motes' | 'dust' | 'smoke' | 'dfAsh', AmbientHandle>;
  private nodes: GatherNode[] = [];
  private wolves: Wolf[] = [];
  private spirits: Spirit[] = [];
  private rocks: Rock[] = [];
  private pets: OutdoorPets | null = null;
  private petIds: PetId[] = [];
  /** Things gathered on this outing. */
  basket: Record<string, number> = {};
  hearts = MAX_HEARTS;
  private invuln = 0;
  private regenT = 0;
  private visited = new Set<RegionId>();
  private zone: RegionId | null = null;
  active = false;
  private locked = false;
  private releasing = false;
  private freeLook = false;
  private pauseOpenedAt = 0;
  private jumpQueued = false;
  private lastSafe = new THREE.Vector3();
  private time = 0;
  private sniffT = 10;
  private hissCd = 0;
  private leechT = 3;
  private nettleCd = 0;
  private lavaCd = 0;
  private rockT = 4;
  private lightningT = 25;
  private midnightWarned = false;
  private wasNight = false;
  private faint = 0;
  private dragon = { meter: 0, awake: 0, breath: 0, burned: false, headY: 0 };
  private egg: { group: THREE.Group; halo: THREE.Mesh; pos: THREE.Vector3; taken: boolean } | null = null;
  /** Debug: put an egg in the first nest on the next outing. */
  private forceEgg = false;
  /** A golden column over whatever special thing the dog sniffed out. */
  private sniffBeam!: THREE.Mesh;
  private sniffBeamT = 0;
  private sparkleT = 0;
  private howlT = 0;
  private answerT = 0;
  private target: Target | null = null;
  private readonly rng = new Random(Date.now() & 0xffff);

  constructor(
    private readonly ctx: GameContext,
    private readonly deps: OutdoorDeps,
  ) {
    this.hud = new OutdoorHUD(document.getElementById('ui-root') ?? document.body);
    this.pause = new OutdoorPausePanel(ctx, {
      resume: () => {
        ctx.ui.openPanel(null);
        this.requestLock();
      },
      goHome: () => {
        ctx.ui.openPanel(null);
        // Walking back takes as long as it takes.
        const d = this.player ? Math.hypot(this.player.feet.x - DOOR.x, this.player.feet.z - DOOR.z) : 0;
        ctx.state.hour = Math.min(23.95, ctx.state.hour + d / 4.4 / SECONDS_PER_HOUR);
        this.exit(false);
      },
      settings: () => deps.openMenu(),
      homeCost: () => {
        const d = this.player ? Math.hypot(this.player.feet.x - DOOR.x, this.player.feet.z - DOOR.z) : 0;
        const min = Math.round((d / 4.4 / SECONDS_PER_HOUR) * 60);
        return t('out.minutes', { n: min });
      },
    });
    this.hud.clickVeil.addEventListener('click', () => this.requestLock());
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    // Remember jump presses even if a slow frame misses the key being down.
    ctx.input.onKeyDown((code) => {
      if (code === 'Space' && this.active) this.jumpQueued = true;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.active || ctx.ui.panelOpen || this.faint > 0) return;
      if (this.locked) this.player.look(e.movementX * SENS, e.movementY * SENS);
      else if (this.freeLook && e.buttons & 1) this.player.look(e.movementX * SENS * 1.3, e.movementY * SENS * 1.3);
    });
    ctx.renderer.canvas.addEventListener('pointerdown', () => {
      if (this.active && !this.locked && !ctx.ui.panelOpen) this.requestLock();
    });
    ctx.renderer.moodHooks.push(() => {
      if (this.built) this.applyQuality();
    });
  }

  get capacity(): number {
    return Math.round(12 * this.ctx.state.effects.stockCapMul) + (this.petIds.includes('slime') ? 4 : 0);
  }

  get count(): number {
    return Object.values(this.basket).reduce((a, b) => a + b, 0);
  }

  /** The player's feet (debug / tests). */
  get position(): THREE.Vector3 {
    return this.player.feet;
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

  private build(): void {
    if (this.built) return;
    this.built = true;
    const ctx = this.ctx;
    const { scene: bScene, havok } = this.deps.core.createPhysicsScene();
    this.physics = new BabylonPhysicsWorld({ scene: bScene, havok });
    this.refs = buildOutdoor(this.scene, this.physics, (id) => tr(REGION_MAP[id].name));
    this.scene.fog = new THREE.Fog('#5a6278', 20, 110);
    this.scene.background = new THREE.Color('#5a6278');
    this.player = new FpsController(bScene, SPAWN.x, groundHeight(SPAWN.x, SPAWN.z), SPAWN.z);
    this.player.onLand = (v) => {
      if (v > 11) this.hurt(1, t('out.fall'));
      ctx.audio.play('dropSoft', { volume: 0.5, pitch: 0.7 });
    };
    this.sim = new BabylonParticleSim({ scene: bScene });
    this.particles = new ParticleRenderer(this.scene, 4000);
    this.particles.addSource(this.sim);
    const soft = Shape.SOFT;
    this.amb = {
      fireflies: this.sim.ambient({ capacity: 260, rate: 0, box: [16, 2, 16], life: [2.5, 5], size: [[0, 0.06], [0.5, 0.08], [1, 0.03]], colors: [[0, '#c8ff6a', 0], [0.2, '#c8ff6a', 1], [0.8, '#fee761', 0.9], [1, '#fee761', 0]], dir1: [-0.3, -0.1, -0.3], dir2: [0.3, 0.3, 0.3], power: [0.2, 0.6], shape: Shape.CIRCLE }),
      mist: this.sim.ambient({ capacity: 260, rate: 0, box: [28, 0.4, 28], life: [6, 10], size: [[0, 0.9], [1, 1.8]], colors: [[0, '#a8b8a0', 0], [0.3, '#a8b8a0', 0.12], [1, '#a8b8a0', 0]], dir1: [-0.2, 0, -0.2], dir2: [0.2, 0.05, 0.2], power: [0.2, 0.5], shape: soft, additive: false }),
      embers: this.sim.ambient({ capacity: 300, rate: 0, box: [18, 0.5, 18], life: [2, 4], size: [[0, 0.07], [1, 0.02]], colors: [[0, '#fee761', 1], [0.5, '#f77622', 0.9], [1, '#a22633', 0]], dir1: [-0.3, 1, -0.3], dir2: [0.3, 2, 0.3], power: [0.6, 1.4], gravity: [0.3, 0.4, 0] }),
      ash: this.sim.ambient({ capacity: 300, rate: 0, box: [20, 6, 20], life: [3, 6], size: [[0, 0.05], [1, 0.04]], colors: [[0, '#5a5068', 0], [0.2, '#8a8090', 0.8], [1, '#5a5068', 0]], dir1: [-0.2, -0.5, -0.2], dir2: [0.2, -0.2, 0.2], power: [0.4, 0.8], additive: false }),
      motes: this.sim.ambient({ capacity: 200, rate: 0, box: [12, 1, 12], life: [2, 4], size: [[0, 0.05], [1, 0.02]], colors: [[0, '#c0cbff', 0], [0.3, '#c0cbff', 1], [1, '#8a7aff', 0]], dir1: [-0.1, 0.4, -0.1], dir2: [0.1, 0.9, 0.1], power: [0.3, 0.7], shape: Shape.SPARKLE }),
      dust: this.sim.ambient({ capacity: 160, rate: 0, box: [12, 3, 12], life: [3, 6], size: [[0, 0.03], [1, 0.03]], colors: [[0, '#c8c0b0', 0], [0.3, '#c8c0b0', 0.7], [1, '#c8c0b0', 0]], dir1: [-0.1, -0.1, -0.1], dir2: [0.1, 0.1, 0.1], power: [0.05, 0.2], additive: false }),
      smoke: this.sim.ambient({ capacity: 80, rate: 5, box: [0.2, 0.1, 0.2], life: [3, 5], size: [[0, 0.4], [1, 1.6]], colors: [[0, '#5a5068', 0.5], [1, '#3a3040', 0]], dir1: [-0.1, 0.8, -0.1], dir2: [0.2, 1.2, 0.1], power: [0.4, 0.8], shape: soft, additive: false }),
      dfAsh: this.sim.ambient({ capacity: 300, rate: 0, box: [22, 8, 22], life: [4, 7], size: [[0, 0.04], [1, 0.03]], colors: [[0, '#b8b0c0', 0], [0.2, '#b8b0c0', 0.7], [1, '#8a8090', 0]], dir1: [-0.3, -0.6, -0.2], dir2: [0.3, -0.3, 0.2], power: [0.3, 0.7], additive: false }),
    };
    const ch = this.refs.chimney;
    this.amb.smoke.setCenter(ch.x, ch.y, ch.z);
    this.sniffBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 9, 6, 1, true), unlit('#fee761', { additive: true, opacity: 0.5 }));
    this.sniffBeam.visible = false;
    this.scene.add(this.sniffBeam);
    ctx.renderer.extraScenes.add(this.scene);
    this.applyQuality();
  }

  private applyQuality(): void {
    const r = this.ctx.renderer;
    const q = r.quality;
    const sun = this.refs.sun;
    sun.castShadow = q === 'high' || q === 'medium';
    const size = q === 'high' ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.sim.density = q === 'low' || q === 'ps1' ? 0.5 : q === 'medium' ? 0.8 : 1;
  }

  // -------------------------------------------------------------------------
  // Entering and leaving
  // -------------------------------------------------------------------------

  enter(pets: PetId[]): void {
    const ctx = this.ctx;
    if (!this.built) {
      ctx.bus.emit('toast', { text: t('out.building'), kind: 'info' });
      this.build();
    }
    this.active = true;
    this.basket = {};
    this.hearts = MAX_HEARTS;
    this.invuln = 0;
    this.visited.clear();
    this.zone = null;
    this.faint = 0;
    this.midnightWarned = ctx.state.hour >= 23;
    this.dragon = { meter: 0, awake: 0, breath: 0, burned: false, headY: 0 };
    this.petIds = pets;
    this.player.teleport(SPAWN.x, groundHeight(SPAWN.x, SPAWN.z), SPAWN.z);
    this.player.yaw = 0;
    this.player.pitch = -0.05;
    this.lastSafe.set(SPAWN.x, 0, SPAWN.z);
    this.pets?.dispose();
    this.pets = pets.length ? new OutdoorPets(this.scene, ctx, pets, this.player.feet) : null;
    this.hud.setPets(this.pets ? this.pets.list.map((p) => p.name) : []);
    this.spawnNodes();
    this.spawnHazards();
    this.syncSecrets();
    this.spawnEgg();
    this.sniffBeamT = 0;
    this.sniffBeam.visible = false;
    this.wasNight = this.deps.expedition.isNight();
    // Wolf days: the howling starts as soon as you step out.
    const wolfDay = isWolfDay(ctx.state.day);
    this.howlT = wolfDay ? 1.4 : this.rng.range(25, 45);
    this.answerT = wolfDay ? 3.6 : 0;
    this.syncGates();
    this.deps.expedition.leave();
    this.deps.setMode('outside', this);
    ctx.renderer.setView({
      scene: this.scene,
      camera: this.player.camera,
      update: (dt) => this.renderUpdate(dt),
      setAspect: (a) => this.player.setAspect(a),
    });
    this.hud.visible = true;
    this.hud.showTitle(t('out.welcome'), wolfDay ? t('out.wolfDaySub') : t('out.welcomeSub'));
    if (wolfDay) {
      ctx.bus.emit('toast', { text: t('out.wolfDay'), kind: 'warn' });
      ctx.state.count('wolfOutings');
    }
    this.deps.onEnter();
    this.requestLock();
  }

  /** Back into the shop (or the garden) with the basket. */
  exit(toGarden: boolean): void {
    if (!this.active) return;
    const ctx = this.ctx;
    this.active = false;
    this.releaseLock();
    ctx.ui.openPanel(null);
    this.hud.visible = false;
    this.hud.setFade(0);
    const haul = { ...this.basket };
    this.basket = {};
    const s = ctx.state;
    s.count('outings');
    this.deps.expedition.comeBack(haul, [...this.visited]);
    this.pets?.dispose();
    this.pets = null;
    for (const r of this.rocks) this.removeRock(r);
    this.rocks = [];
    ctx.renderer.setView(null);
    this.deps.setMode('shop', null);
    this.deps.onExit(toGarden);
  }

  // -------------------------------------------------------------------------
  // Pointer lock
  // -------------------------------------------------------------------------

  requestLock(): void {
    if (!this.active) return;
    const c = this.ctx.renderer.canvas as HTMLCanvasElement & { requestPointerLock(): Promise<void> | void };
    try {
      const r = c.requestPointerLock();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => (this.freeLook = true));
    } catch {
      this.freeLook = true;
    }
    // Browsers without pointer lock (or when it is refused): drag to look.
    setTimeout(() => {
      if (!this.locked) this.freeLook = true;
    }, 400);
    this.hud.clickVeil.hidden = true;
  }

  private releaseLock(): void {
    if (document.pointerLockElement) {
      this.releasing = true;
      document.exitPointerLock();
    }
  }

  private onLockChange(): void {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.ctx.renderer.canvas;
    if (this.locked) this.freeLook = false;
    if (was && !this.locked && this.active && !this.releasing && !this.ctx.ui.panelOpen) this.openPause();
    if (!this.locked) this.releasing = false;
  }

  openPause(): void {
    if (!this.active) return;
    this.pauseOpenedAt = performance.now();
    this.releaseLock();
    this.ctx.ui.openPanel('outpause');
  }

  /** Esc right after the pointer lock was dropped would reopen/close the pause twice. */
  get pauseJustOpened(): boolean {
    return performance.now() - this.pauseOpenedAt < 350;
  }

  // -------------------------------------------------------------------------
  // Spawning per outing
  // -------------------------------------------------------------------------

  private clearNodes(): void {
    for (const n of this.nodes) n.group.removeFromParent();
    this.nodes = [];
  }

  private spawnNodes(): void {
    this.clearNodes();
    const s = this.ctx.state;
    const today = s.outdoorToday;
    const exp = this.deps.expedition;
    const rng = new Random(s.day * 977 + 13);
    const make = (id: string, zone: RegionId | 'road', p: V2, ingredientId: string, poison: boolean, rare: boolean) => {
      const group = new THREE.Group();
      let visual: THREE.Object3D;
      if (poison) visual = toadstoolModel();
      else if (ingredientId === 'bog_toad_eye') visual = toadModel().group;
      else {
        const v = buildIngredientVisual(INGREDIENTS[ingredientId], 'whole', 1).group;
        v.scale.setScalar(2.6);
        v.position.y = 0.18;
        visual = v;
      }
      group.add(visual);
      const color = rare ? '#fee761' : poison ? '#e43b44' : INGREDIENTS[ingredientId]?.glow ?? '#c0cbff';
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 14), unlit(poison ? '#8a2a2a' : color, { additive: true, opacity: 0.55 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      group.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 3, 5, 1, true), unlit(poison ? '#8a2a2a' : color, { additive: true, opacity: rare ? 0.4 : 0.22 }));
      beam.position.y = 1.5;
      group.add(beam);
      const y = Math.max(groundHeight(p.x, p.z), WATER_Y);
      group.position.set(p.x, y, p.z);
      this.scene.add(group);
      this.nodes.push({ id, zone, ingredientId, poison, rare, pos: group.position, group, beam, taken: false, phase: rng.range(0, 6.28), sniffed: 0 });
    };
    for (const zn of ZONES) {
      const region = REGION_MAP[zn.id];
      const pools = exp.pools(region);
      const spots = this.refs.spots[zn.id];
      spots.forEach((p, i) => {
        const id = `${zn.id}-${i}`;
        if (today.picked.includes(id)) return;
        const poison = zn.id === 'forest' && pools.hazards.some((h) => h.id === 'toadstool') && i % 4 === 3;
        const f = rng.weighted(pools.finds, (x) => x.weight);
        if (!f && !poison) return;
        make(id, zn.id, p, f?.ingredientId ?? 'glowing_mushroom', poison, !!f?.rare);
      });
    }
    const night = exp.isNight();
    this.refs.spots.road.forEach((p, i) => {
      const id = `road-${i}`;
      if (today.picked.includes(id)) return;
      make(id, 'road', p, night && i % 3 === 0 ? 'bat_wing' : 'glowing_mushroom', false, false);
    });
  }

  private spawnHazards(): void {
    for (const w of this.wolves) w.group.removeFromParent();
    for (const s of this.spirits) s.mesh.removeFromParent();
    this.wolves = [];
    this.spirits = [];
    const exp = this.deps.expedition;
    const hz = (id: RegionId) => exp.pools(REGION_MAP[id]).hazards.map((h) => h.id);
    const addWolf = (zone: RegionId, home: THREE.Vector3, i: number) => {
      const w = wolfModel();
      home.y = groundHeight(home.x, home.z);
      w.group.position.copy(home);
      this.scene.add(w.group);
      this.wolves.push({ group: w.group, legs: w.legs, zone, pos: w.group.position, home, heading: i, state: 'prowl', t: 0, cd: 0 });
    };
    if (isWolfDay(this.ctx.state.day)) {
      // The pack is out: a few wolves prowl along every region's path.
      const packs: Array<[RegionId, number]> = [
        ['forest', 3],
        ['cave', 2],
        ['shrine', 2],
        ['swamp', 2],
        ['valley', 3],
      ];
      for (const [zone, n] of packs) {
        const zn = ZONE_MAP[zone];
        for (let i = 0; i < n; i++) {
          // Near the end of the road into the region, off to one side, on firm ground.
          const a = zn.road[Math.min(zn.road.length - 1, 5 + i)];
          let home = new THREE.Vector3(a.x, 0, a.z);
          for (let k = 0; k < 16; k++) {
            const ang = i * 2.3 + k * 0.9;
            const r = 5 + (k % 4) * 2;
            const x = a.x + Math.cos(ang) * r;
            const z = a.z + Math.sin(ang) * r;
            if (walkMask(x, z) > 0.6 && lavaMask(x, z) < 0.05 && poolMask(x, z) < 0.3) {
              home = new THREE.Vector3(x, 0, z);
              break;
            }
          }
          addWolf(zone, home, i);
        }
      }
    } else if (hz('forest').includes('wolf')) {
      const f = ZONE_MAP.forest;
      for (let i = 0; i < 3; i++) addWolf('forest', new THREE.Vector3(f.center.x + Math.cos(i * 2.1) * 12, 0, f.center.z + Math.sin(i * 2.1) * 12), i);
    }
    const spirit = (kind: 'shade' | 'wisp', c: V2, n: number) => {
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group();
        if (kind === 'shade') {
          const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.8, 7), new THREE.MeshBasicMaterial({ color: '#07060c', transparent: true, opacity: 0.85 }));
          body.rotation.x = Math.PI;
          body.position.y = 1.2;
          g.add(body);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 5), new THREE.MeshBasicMaterial({ color: '#07060c', transparent: true, opacity: 0.9 }));
          head.position.y = 2.2;
          g.add(head);
          for (const sx of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), unlit('#e43b44'));
            eye.position.set(sx * 0.11, 2.25, -0.3);
            g.add(eye);
          }
        } else {
          g.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5), unlit('#9af5e6')));
          g.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 7, 5), unlit('#9af5e6', { additive: true, opacity: 0.3 })));
          const l = new THREE.PointLight('#9af5e6', 2, 6, 2);
          g.add(l);
        }
        const home = new THREE.Vector3(c.x + this.rng.range(-8, 8), 0, c.z + this.rng.range(-8, 8));
        home.y = groundHeight(home.x, home.z);
        g.position.copy(home);
        this.scene.add(g);
        this.spirits.push({ mesh: g, pos: g.position, home, phase: this.rng.range(0, 6), cd: 0, kind });
      }
    };
    if (hz('shrine').includes('shade')) spirit('shade', ZONE_MAP.shrine.center, 2);
    if (hz('swamp').includes('wisp')) spirit('wisp', ZONE_MAP.swamp.center, 3);
  }

  private syncGates(): void {
    for (const g of this.refs.gates) {
      const lock = this.deps.expedition.regionLock(REGION_MAP[g.zone]);
      g.barrier.visible = !!lock;
      g.group.userData.lock = lock;
      if (lock && !g.body) {
        const width = 15.2;
        g.body = this.physics.createBody({
          shape: { type: 'box', size: [width, 4, 0.6] },
          motion: 'static',
          position: { x: g.pos.x, y: groundHeight(g.pos.x, g.pos.z) + 2, z: g.pos.z },
          rotation: { x: 0, y: Math.sin(g.yaw / 2), z: 0, w: Math.cos(g.yaw / 2) },
        });
      } else if (!lock && g.body) {
        this.physics.removeBody(g.body);
        g.body = null;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  fixed(dt: number): void {
    if (!this.active || this.faint > 0) return;
    const input = this.ctx.input;
    const f = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const r = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    const p = this.player.physicsFeet;
    // Deep swamp water and nettles slow you down.
    const depth = WATER_Y - groundHeight(p.x, p.z);
    let mul = depth > 0.25 ? 0.55 : 1;
    if (this.inNettles()) mul = Math.min(mul, 0.6);
    this.player.speedMul = mul;
    this.physics.step(dt);
    this.player.fixed(dt, { forward: f, right: r, sprint: input.isDown('ShiftLeft') || input.isDown('ShiftRight'), jump });
    // Keep to the paths: the hills are steep and the woods impassable.
    const c = this.player.physicsFeet;
    const w = walkMask(c.x, c.z);
    if (w < 0.12 || c.y < groundHeight(c.x, c.z) - 1.5) this.player.teleport(this.lastSafe.x, groundHeight(this.lastSafe.x, this.lastSafe.z), this.lastSafe.z);
    else if (w > 0.35 && lavaMask(c.x, c.z) < 0.2 && this.player.onGround) this.lastSafe.copy(c);
  }

  update(dt: number): void {
    if (!this.active) return;
    const ctx = this.ctx;
    const paused = ctx.ui.panelOpen;
    this.hud.clickVeil.hidden = this.locked || this.freeLook || paused || this.faint > 0;
    if (paused) {
      if (this.locked) this.releaseLock();
      this.hud.setPrompt(null);
      return;
    }
    this.time += dt;
    const s = ctx.state;
    // The clock runs as in the shop.
    s.hour += dt / SECONDS_PER_HOUR;
    if (!this.midnightWarned && s.hour >= 23) {
      this.midnightWarned = true;
      ctx.bus.emit('toast', { text: t('out.lateWarn'), kind: 'warn' });
    }
    if (s.hour >= 23.85) {
      ctx.bus.emit('toast', { text: t('out.midnight'), kind: 'warn' });
      this.exit(false);
      return;
    }
    if (this.faint > 0) {
      this.updateFaint(dt);
      return;
    }
    // Night falls (or day breaks): the night creatures come out (or go home).
    const night = this.deps.expedition.isNight();
    if (night !== this.wasNight) {
      this.wasNight = night;
      this.spawnHazards();
      ctx.bus.emit('toast', { text: t(night ? 'out.nightFalls' : 'out.dayBreaks'), kind: 'info' });
    }
    const feet = this.player.feet;
    this.updateZone(feet);
    this.updateHazards(dt, feet);
    this.updateHowls(dt);
    this.updateNodes(dt);
    this.updateSecrets(dt, feet);
    this.updateRavens(dt, feet);
    this.updatePets(dt, feet);
    this.updateTarget(feet);
    if (this.target?.act && ctx.input.wasPressed('KeyE')) this.target.act();
    this.hud.setPrompt(this.target ? this.target.label : this.dragon.meter > 0.5 && this.zone === 'valley' ? t('out.dragonStirs') : null);
    // Hearts come back slowly while out of danger.
    this.invuln = Math.max(0, this.invuln - dt);
    this.regenT += dt;
    if (this.regenT > 30 && this.hearts < MAX_HEARTS) {
      this.regenT = 0;
      this.hearts++;
    }
    if (this.player.footstep()) {
      const wet = WATER_Y - groundHeight(feet.x, feet.z) > 0.05;
      ctx.audio.play(wet ? 'splash' : 'footstep', { volume: wet ? 0.2 : 0.35, pitch: 0.8 + this.rng.next() * 0.4 });
    }
    this.updateHud(dt);
  }

  /** Just before drawing: camera, sky, lights, particles. */
  private renderUpdate(dt: number): void {
    if (!this.built) return;
    const ctx = this.ctx;
    this.player.update(dt, ctx.input.enabled ? ctx.renderAlpha : 1, this.time);
    this.updateEnvironment(dt);
    this.sim.update(ctx.ui.panelOpen ? 0 : dt);
    this.particles.setViewport(ctx.renderer.lowHeight, this.player.camera.fov);
    this.particles.update(ctx.ui.panelOpen ? 0 : dt);
    this.refs.sky.mesh.position.copy(this.player.camera.position);
  }

  // -------------------------------------------------------------------------
  // Regions, gathering, altars
  // -------------------------------------------------------------------------

  private updateZone(p: THREE.Vector3): void {
    const zn = zoneAt(p.x, p.z);
    const id = zn?.id ?? null;
    if (id === this.zone) return;
    this.zone = id;
    if (!id) return;
    const r = REGION_MAP[id];
    const first = !this.visited.has(id);
    this.visited.add(id);
    const used = this.ctx.state.outdoorToday.altars.includes(id);
    this.hud.showTitle(tr(r.name), used ? t('out.altarUsed') : t('out.altarHint'));
    if (first) this.ctx.audio.play('chime', { volume: 0.4, pitch: 0.8 });
  }

  private addToBasket(id: string, n = 1): number {
    const room = this.capacity - this.count;
    const k = Math.min(room, n);
    if (k > 0) this.basket[id] = (this.basket[id] ?? 0) + k;
    return k;
  }

  private pick(node: GatherNode): void {
    const ctx = this.ctx;
    if (node.poison) {
      node.taken = true;
      node.group.visible = false;
      this.ctx.state.outdoorToday.picked.push(node.id);
      this.sim.burst(node.pos.x, node.pos.y + 0.3, node.pos.z, { count: 30, radius: 0.3, life: [0.6, 1.2], size: [[0, 0.12], [1, 0.3]], colors: [[0, '#8a2a8a', 0.8], [1, '#3a1a3a', 0]], dir1: [-0.4, 0.5, -0.4], dir2: [0.4, 1.2, 0.4], power: [0.5, 1.2], shape: Shape.SOFT, additive: false });
      this.hurt(1, t('out.poison'));
      return;
    }
    if (this.count >= this.capacity) {
      ctx.audio.play('denied', { volume: 0.5 });
      ctx.bus.emit('toast', { text: t('trip.full'), kind: 'warn' });
      return;
    }
    const got = this.addToBasket(node.ingredientId, node.rare ? 1 : 1 + (this.rng.chance(0.25) ? 1 : 0));
    node.taken = true;
    node.group.visible = false;
    ctx.state.outdoorToday.picked.push(node.id);
    ctx.state.count('outdoor_picks');
    ctx.audio.play(node.rare ? 'discovery' : 'sparkle', { volume: 0.6, pitch: 0.9 + this.rng.next() * 0.3 });
    const col = node.rare ? '#fee761' : INGREDIENTS[node.ingredientId]?.glow ?? '#c0cbff';
    this.sim.burst(node.pos.x, node.pos.y + 0.3, node.pos.z, { count: 26, radius: 0.2, life: [0.4, 0.9], size: [[0, 0.06], [1, 0.02]], colors: [[0, '#ffffff', 1], [0.3, col, 1], [1, col, 0]], dir1: [-1, 1, -1], dir2: [1, 2.5, 1], power: [1, 2.2], gravity: [0, -3, 0], shape: Shape.SPARKLE });
    ctx.ui.floatText(node.pos.clone().setY(node.pos.y + 1), `+${got} ${tr(INGREDIENTS[node.ingredientId].name)}`, node.rare ? '#fee761' : '#ead4aa');
    // Near the dragon, every rustle counts.
    if (Math.hypot(node.pos.x - DRAGON.x, node.pos.z - DRAGON.z) < 16) this.dragon.meter += 0.25;
  }

  private useAltar(zone: RegionId): void {
    const ctx = this.ctx;
    const today = ctx.state.outdoorToday;
    if (today.altars.includes(zone)) {
      ctx.bus.emit('toast', { text: t('out.altarUsed'), kind: 'info' });
      return;
    }
    const room = this.capacity - this.count;
    if (room <= 0) {
      ctx.bus.emit('toast', { text: t('trip.full'), kind: 'warn' });
      return;
    }
    const region = REGION_MAP[zone];
    const pools = this.deps.expedition.pools(region);
    this.releaseLock();
    this.deps.minigame.play(
      { region, night: this.deps.expedition.isNight(), finds: pools.finds, hazards: pools.hazards, capacity: Math.min(8 + (this.petIds.includes('slime') ? 2 : 0), room), pets: this.petIds },
      (haul) => {
        today.altars.push(zone);
        let n = 0;
        for (const [id, c] of Object.entries(haul)) n += this.addToBasket(id, c);
        ctx.state.hour = Math.min(23.8, ctx.state.hour + 0.5);
        ctx.state.count('altars');
        ctx.bus.emit('toast', { text: n ? t('out.altarDone', { n }) : t('trip.empty'), kind: n ? 'good' : 'info' });
        // Closing the result card is a click: take the mouse straight back.
        this.requestLock();
      },
    );
  }

  private useWell(): void {
    const ctx = this.ctx;
    const s = ctx.state;
    const today = s.outdoorToday;
    if (today.well) {
      ctx.bus.emit('toast', { text: t('out.wellUsed'), kind: 'info' });
      return;
    }
    if (!s.canAfford(5)) {
      ctx.audio.play('denied', { volume: 0.5 });
      ctx.bus.emit('toast', { text: t('out.wellPoor'), kind: 'warn' });
      return;
    }
    s.addMoney(-5);
    today.well = true;
    s.count('wishes');
    ctx.audio.play('coin', {});
    const w = this.refs.well;
    this.sim.burst(w.x, w.y + 0.8, w.z, { count: 40, radius: 0.6, life: [0.8, 1.6], size: [[0, 0.08], [1, 0.02]], colors: [[0, '#ffffff', 1], [0.4, '#c0cbff', 1], [1, '#8a7aff', 0]], dir1: [-0.4, 1, -0.4], dir2: [0.4, 2.5, 0.4], power: [1, 2], shape: Shape.SPARKLE });
    const roll = this.rng.next();
    if (roll < 0.35) {
      const pool = this.deps.expedition.pools(REGION_MAP.shrine).finds;
      const f = this.rng.weighted(pool, (x) => (x.rare ? x.weight * 4 : x.weight)) ?? pool[0];
      const got = f ? this.addToBasket(f.ingredientId, 1) : 0;
      ctx.bus.emit('toast', { text: got && f ? t('out.wishItem', { i: tr(INGREDIENTS[f.ingredientId].name) }) : t('trip.full'), kind: 'good' });
      ctx.audio.play('discovery', { volume: 0.5 });
    } else if (roll < 0.6) {
      s.addReputation(3);
      ctx.bus.emit('toast', { text: t('out.wishRep'), kind: 'good' });
      ctx.audio.play('chime', { volume: 0.6 });
    } else if (roll < 0.8) {
      s.addMoney(15);
      ctx.bus.emit('toast', { text: t('out.wishGold'), kind: 'good' });
      ctx.audio.play('coins', {});
    } else {
      ctx.bus.emit('toast', { text: t('out.wishNothing'), kind: 'info' });
      ctx.audio.play('plop', { volume: 0.6 });
    }
  }

  // -------------------------------------------------------------------------
  // Secret scrolls and the dragon egg
  // -------------------------------------------------------------------------

  /** Scrolls whose recipe is already known are gone. */
  private syncSecrets(): void {
    for (const sc of this.refs.secrets) sc.scroll.visible = !this.ctx.state.knowsRecipe(SCROLLS[sc.zone]);
  }

  private readScroll(sc: SecretRef): void {
    const ctx = this.ctx;
    const s = ctx.state;
    const id = SCROLLS[sc.zone];
    const r = RECIPE_MAP[id];
    sc.scroll.visible = false;
    if (this.sniffBeamT > 0 && this.sniffBeam.position.distanceTo(sc.pos) < 5) this.sniffBeamT = 0;
    ctx.audio.play('discovery', { volume: 0.8 });
    ctx.audio.play('pageFlip', { volume: 0.8, delay: 0.15 });
    this.sim.burst(sc.pos.x, sc.pos.y + 0.2, sc.pos.z, { count: 40, radius: 0.3, life: [0.6, 1.3], size: [[0, 0.08], [1, 0.02]], colors: [[0, '#ffffff', 1], [0.3, '#fee761', 1], [1, '#feae34', 0]], dir1: [-0.8, 1, -0.8], dir2: [0.8, 2.6, 0.8], power: [1, 2], gravity: [0, -2, 0], shape: Shape.SPARKLE });
    if (!r || s.knowsRecipe(id)) return;
    s.learnRecipe(id);
    s.count('scrolls');
    ctx.bus.emit('recipe:learned', { id, source: 'scroll' });
    this.hud.showTitle(t('out.scrollFound'), tr(r.name));
    ctx.bus.emit('toast', { text: t('out.scrollLearned', { name: tr(r.name) }), kind: 'quest' });
    ctx.bus.emit('save:request', {});
  }

  /** Once in a long while an egg lies in one of the valley's nests. */
  private spawnEgg(): void {
    if (this.egg) this.egg.group.removeFromParent();
    this.egg = null;
    const s = this.ctx.state;
    const light = this.refs.eggLight;
    light.intensity = 0;
    const nests = this.refs.nests;
    const idx = this.forceEgg ? 0 : eggNestToday(s.day, nests.length);
    this.forceEgg = false;
    if (idx === null || s.hasItem(DRAGON_EGG) || s.outdoorToday.picked.includes('egg')) return;
    const m = dragonEggModel();
    m.group.position.copy(nests[idx]);
    this.scene.add(m.group);
    light.position.copy(nests[idx]).add(new THREE.Vector3(0, 0.9, 0));
    this.egg = { group: m.group, halo: m.halo, pos: m.group.position, taken: false };
  }

  private takeEgg(): void {
    const ctx = this.ctx;
    const egg = this.egg;
    if (!egg || egg.taken) return;
    egg.taken = true;
    egg.group.visible = false;
    this.refs.eggLight.intensity = 0;
    if (this.sniffBeamT > 0 && this.sniffBeam.position.distanceTo(egg.pos) < 5) this.sniffBeamT = 0;
    ctx.state.outdoorToday.picked.push('egg');
    giveDragonEgg(ctx);
    ctx.audio.play('discovery', {});
    ctx.audio.play('rumble', { volume: 0.5, delay: 0.5 });
    this.sim.burst(egg.pos.x, egg.pos.y + 0.4, egg.pos.z, { count: 44, radius: 0.35, life: [0.6, 1.3], size: [[0, 0.1], [1, 0.02]], colors: [[0, '#fff4b0', 1], [0.4, '#f77622', 1], [1, '#a22633', 0]], dir1: [-1, 1, -1], dir2: [1, 2.8, 1], power: [1, 2.2], gravity: [0, -3, 0], shape: Shape.SPARKLE });
    this.hud.showTitle(t('out.eggFound'), t('out.eggSub'));
    ctx.bus.emit('toast', { text: t('out.eggToast'), kind: 'quest' });
    // Somewhere close by, a mother dragon stirs…
    if (Math.hypot(egg.pos.x - DRAGON.x, egg.pos.z - DRAGON.z) < 30) {
      this.dragon.meter += 0.6;
      ctx.bus.emit('toast', { text: t('out.eggDragon'), kind: 'warn' });
    }
  }

  private updateSecrets(dt: number, p: THREE.Vector3): void {
    this.sparkleT -= dt;
    const sparkle = this.sparkleT <= 0;
    if (sparkle) this.sparkleT = 1.1;
    for (const sc of this.refs.secrets) {
      if (!sc.scroll.visible) continue;
      const m = sc.glow.material as THREE.MeshBasicMaterial;
      m.opacity = 0.08 + 0.05 * Math.sin(this.time * 2.2 + sc.pos.x);
      // A few golden motes give it away to a sharp eye.
      if (sparkle && Math.hypot(sc.pos.x - p.x, sc.pos.z - p.z) < 32) {
        this.sim.burst(sc.pos.x, sc.pos.y + 0.15, sc.pos.z, { count: 5, radius: 0.2, life: [0.8, 1.4], size: [[0, 0.05], [1, 0.02]], colors: [[0, '#fff4b0', 1], [1, '#feae34', 0]], dir1: [-0.2, 0.4, -0.2], dir2: [0.2, 1, 0.2], power: [0.3, 0.7], shape: Shape.SPARKLE });
      }
    }
    const egg = this.egg;
    if (egg && !egg.taken) {
      const k = 0.5 + 0.5 * Math.sin(this.time * 1.7);
      (egg.halo.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.12 * k;
      this.refs.eggLight.intensity = 1.6 + 1.4 * k;
      egg.group.rotation.z = Math.sin(this.time * 7) * 0.04 * (Math.sin(this.time * 0.8) > 0.7 ? 1 : 0);
    }
    this.sniffBeamT = Math.max(0, this.sniffBeamT - dt);
    const b = this.sniffBeam;
    b.visible = this.sniffBeamT > 0;
    if (b.visible) (b.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.sniffBeamT) * (0.35 + 0.15 * Math.sin(this.time * 5));
  }

  // -------------------------------------------------------------------------
  // Howling
  // -------------------------------------------------------------------------

  private updateHowls(dt: number): void {
    const wolfDay = isWolfDay(this.ctx.state.day);
    if (!wolfDay && !this.wolves.length) return;
    this.howlT -= dt;
    if (this.howlT <= 0) {
      this.howl();
      this.howlT = wolfDay ? this.rng.range(16, 32) : this.rng.range(35, 60);
      // …and another one answers from elsewhere.
      if (this.rng.chance(wolfDay ? 0.55 : 0.3)) this.answerT = this.rng.range(1.4, 2.6);
    }
    if (this.answerT > 0) {
      this.answerT -= dt;
      if (this.answerT <= 0) this.howl();
    }
  }

  /** A wolf howls somewhere around: from a wolf of the pack, or far off in the hills. */
  private howl(): void {
    const p = this.player.feet;
    let x: number;
    let z: number;
    const w = this.wolves.length ? this.wolves[this.rng.int(0, this.wolves.length - 1)] : null;
    if (w && this.rng.chance(0.7)) {
      x = w.pos.x;
      z = w.pos.z;
    } else {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(35, 70);
      x = p.x + Math.cos(a) * r;
      z = p.z + Math.sin(a) * r;
    }
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    // Left/right from where the apprentice is looking.
    const yaw = this.player.yaw;
    const side = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d;
    const volume = clamp(1.05 - d / 90, 0.3, 0.95);
    this.ctx.audio.play('howl', { x: side * 5, volume, pitch: this.rng.range(0.85, 1.15), minGap: 0 });
  }

  private updateNodes(dt: number): void {
    const p = this.player.feet;
    for (const n of this.nodes) {
      if (n.taken) continue;
      n.phase += dt;
      const v = n.group.children[0];
      v.rotation.y += dt * 0.6;
      v.position.y = (n.ingredientId === 'bog_toad_eye' || n.poison ? 0 : 0.18) + Math.sin(n.phase * 2) * 0.04;
      n.sniffed = Math.max(0, n.sniffed - dt);
      const m = n.beam.material as THREE.MeshBasicMaterial;
      // The light column guides from afar and fades out up close.
      const near = clamp((Math.hypot(n.pos.x - p.x, n.pos.z - p.z) - 1.5) / 5, 0, 1);
      m.opacity = ((n.rare ? 0.4 : 0.22) * (0.8 + 0.2 * Math.sin(n.phase * 3)) + (n.sniffed > 0 ? 0.45 : 0)) * near;
      n.beam.scale.y = n.sniffed > 0 ? 3 : 1;
      n.beam.position.y = n.sniffed > 0 ? 4.5 : 1.5;
    }
  }

  private updateTarget(p: THREE.Vector3): void {
    const fwd = this.player.forward;
    let best: Target | null = null;
    let bestScore = 0;
    const consider = (pos: THREE.Vector3, range: number, label: string, act?: () => void) => {
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > range) return;
      const dot = d < 0.6 ? 1 : (dx * fwd.x + dz * fwd.z) / d;
      if (dot < 0.35) return;
      const score = dot / (0.5 + d);
      if (score > bestScore) {
        bestScore = score;
        best = { label, pos, range, act };
      }
    };
    for (const n of this.nodes) {
      if (n.taken) continue;
      const name = n.poison ? t('out.toadstool') : n.ingredientId === 'bog_toad_eye' ? t('out.toad') : tr(INGREDIENTS[n.ingredientId].name);
      consider(n.pos, 2.4, t('out.pick', { i: name }), () => this.pick(n));
    }
    for (const a of this.refs.altars) {
      const used = this.ctx.state.outdoorToday.altars.includes(a.zone);
      consider(a.pos, 3.2, used ? t('out.altarUsedShort') : t('out.altar'), () => this.useAltar(a.zone));
    }
    consider(this.refs.well, 3, t('out.well'), () => this.useWell());
    for (const sc of this.refs.secrets) if (sc.scroll.visible) consider(sc.pos, 2.4, t('out.scroll'), () => this.readScroll(sc));
    const egg = this.egg;
    if (egg && !egg.taken) consider(egg.pos, 2.4, t('out.egg'), () => this.takeEgg());
    consider(new THREE.Vector3(DOOR.x, 0, DOOR.z), 3.2, t('out.enterShop'), () => this.exit(false));
    consider(new THREE.Vector3(GARDEN_GATE.x, 0, GARDEN_GATE.z), 3, t('out.enterGarden'), () => this.exit(true));
    for (const g of this.refs.gates) {
      const lock = g.group.userData.lock as string | null;
      if (lock) consider(new THREE.Vector3(g.pos.x, 0, g.pos.z), 9, `🔒 ${tr(REGION_MAP[g.zone].name)}: ${lock}`);
    }
    consider(this.refs.signpost, 3, t('out.signpost'));
    this.target = best;
  }

  // -------------------------------------------------------------------------
  // Dangers
  // -------------------------------------------------------------------------

  private inNettles(): boolean {
    if (!this.deps.expedition.pools(REGION_MAP.forest).hazards.some((h) => h.id === 'nettle')) return false;
    const p = this.player.physicsFeet;
    return this.refs.nettles.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 1.8);
  }

  /** Something hurt the apprentice. */
  hurt(n: number, why: string): void {
    if (this.invuln > 0 || this.faint > 0) return;
    const ctx = this.ctx;
    this.hearts = Math.max(0, this.hearts - n);
    this.invuln = 1.3;
    this.regenT = 0;
    this.hud.hurt();
    this.player.shake(0.9);
    ctx.audio.play('dropHard', { volume: 0.6, pitch: 0.7 });
    ctx.bus.emit('toast', { text: `${t('trip.ouch')} ${why}`, kind: 'bad' });
    // Something may fall out of the basket (the slime catches half of them).
    const owned = Object.keys(this.basket).filter((k) => this.basket[k] > 0);
    if (owned.length && this.rng.chance(0.35)) {
      if (this.petIds.includes('slime') && this.rng.chance(0.5)) {
        this.pets?.react('slime');
        ctx.bus.emit('toast', { text: t('out.slimeCatch', { n: this.ctx.state.pets.slime.name }), kind: 'good' });
      } else {
        const id = owned[this.rng.int(0, owned.length - 1)];
        this.basket[id]--;
        if (this.basket[id] <= 0) delete this.basket[id];
        ctx.bus.emit('toast', { text: `${tr(INGREDIENTS[id].name)} ${t('trip.dropped')}`, kind: 'warn' });
      }
    }
    if (this.hearts <= 0) {
      this.faint = 2.6;
      ctx.audio.play('sad', { volume: 0.7 });
    }
  }

  private updateFaint(dt: number): void {
    const ctx = this.ctx;
    this.faint -= dt;
    this.hud.setFade(clamp((2.6 - this.faint) / 1.2, 0, 1));
    if (this.faint > 0) return;
    // Master Mortimer finds you by the door; half the basket is lost.
    for (const k of Object.keys(this.basket)) {
      this.basket[k] = Math.floor(this.basket[k] / 2);
      if (this.basket[k] <= 0) delete this.basket[k];
    }
    ctx.state.hour = Math.min(23.8, ctx.state.hour + 1);
    this.hearts = 3;
    this.player.teleport(SPAWN.x, groundHeight(SPAWN.x, SPAWN.z), SPAWN.z);
    this.player.yaw = 0;
    this.pets?.teleport(this.player.feet, 0);
    this.hud.setFade(0);
    ctx.bus.emit('toast', { text: t('out.fainted'), kind: 'bad' });
  }

  private updateHazards(dt: number, p: THREE.Vector3): void {
    const ctx = this.ctx;
    const hasDog = !!this.pets?.has('dog');
    let danger = false;
    // Wolves
    for (const w of this.wolves) {
      const dx = p.x - w.pos.x;
      const dz = p.z - w.pos.z;
      const d = Math.hypot(dx, dz);
      const inTheirZone = this.zone === w.zone;
      w.cd = Math.max(0, w.cd - dt);
      if (w.state !== 'flee' && hasDog && d < 9) {
        w.state = 'flee';
        w.t = 4;
        this.pets?.react('dog');
      }
      if (w.state === 'flee') {
        w.t -= dt;
        if (w.t <= 0) w.state = 'prowl';
      } else w.state = inTheirZone && d < 16 ? 'chase' : 'prowl';
      let tx: number;
      let tz: number;
      let speed: number;
      if (w.state === 'chase') {
        tx = p.x;
        tz = p.z;
        speed = 5.4;
        danger = true;
      } else if (w.state === 'flee') {
        tx = w.pos.x - dx * 2;
        tz = w.pos.z - dz * 2;
        speed = 7;
      } else {
        w.heading += dt * 0.4;
        tx = w.home.x + Math.cos(w.heading) * 6;
        tz = w.home.z + Math.sin(w.heading) * 6;
        speed = 1.6;
      }
      const ddx = tx - w.pos.x;
      const ddz = tz - w.pos.z;
      const dd = Math.hypot(ddx, ddz);
      if (dd > 1.2) {
        w.pos.x += (ddx / dd) * speed * dt;
        w.pos.z += (ddz / dd) * speed * dt;
        w.group.rotation.y = Math.atan2(-ddx, -ddz);
      }
      // Stay out of the hills (and the lava)
      if (walkMask(w.pos.x, w.pos.z) < 0.3 || lavaMask(w.pos.x, w.pos.z) > 0.2) {
        w.pos.x += (w.home.x - w.pos.x) * dt;
        w.pos.z += (w.home.z - w.pos.z) * dt;
      }
      w.pos.y = groundHeight(w.pos.x, w.pos.z);
      const run = dd > 1.2 ? (this.time * speed * 2.2) : 0;
      w.legs.forEach((l, i) => (l.rotation.x = Math.sin(run + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.8 : 0)) * 0.6));
      if (w.state === 'chase' && d < 1.5 && w.cd <= 0) {
        w.cd = 1.8;
        ctx.audio.play('angry', { volume: 0.7, pitch: 0.6 });
        this.hurt(1, t('out.wolfBite'));
      }
      if (w.state === 'chase' && Math.random() < dt * 0.3) ctx.audio.play('angry', { volume: 0.35, pitch: 0.45 });
    }
    // Shades and wisps drift towards you
    for (const s of this.spirits) {
      s.phase += dt;
      s.cd = Math.max(0, s.cd - dt);
      const dx = p.x - s.pos.x;
      const dz = p.z - s.pos.z;
      const d = Math.hypot(dx, dz);
      const near = d < 14 && s.cd <= 0;
      const tx = near ? p.x : s.home.x + Math.cos(s.phase * 0.3) * 5;
      const tz = near ? p.z : s.home.z + Math.sin(s.phase * 0.3) * 5;
      const sp = near ? (s.kind === 'shade' ? 2.4 : 1.8) : 0.8;
      const ex = tx - s.pos.x;
      const ez = tz - s.pos.z;
      const e = Math.hypot(ex, ez) || 1;
      s.pos.x += (ex / e) * sp * dt;
      s.pos.z += (ez / e) * sp * dt;
      s.pos.y = Math.max(groundHeight(s.pos.x, s.pos.z), WATER_Y) + (s.kind === 'wisp' ? 1.2 : 0) + Math.sin(s.phase * 2) * 0.2;
      s.mesh.rotation.y = Math.atan2(-dx, -dz);
      if (near) danger = true;
      if (d < 1.1 && s.cd <= 0) {
        s.cd = 6;
        this.hurt(1, s.kind === 'shade' ? t('out.shadeTouch') : t('out.wispTouch'));
        s.pos.set(s.home.x, s.pos.y, s.home.z);
      }
    }
    // Swamp leeches in deep water
    const depth = WATER_Y - groundHeight(p.x, p.z);
    if (depth > 0.25 && this.zone === 'swamp') {
      this.leechT -= dt;
      if (this.leechT <= 0) {
        this.leechT = 4;
        this.hurt(1, t('out.leech'));
      }
    } else this.leechT = Math.max(this.leechT, 2);
    // Nettles
    this.nettleCd = Math.max(0, this.nettleCd - dt);
    if (this.nettleCd <= 0 && this.inNettles()) {
      this.nettleCd = 3;
      this.hurt(1, t('out.nettle'));
    }
    // Lava
    this.lavaCd = Math.max(0, this.lavaCd - dt);
    if (lavaMask(p.x, p.z) > 0.5 && groundHeight(p.x, p.z) < -0.1 && this.lavaCd <= 0) {
      this.lavaCd = 1;
      this.invuln = 0;
      this.hurt(1, t('out.lava'));
      ctx.audio.play('sizzle', { volume: 0.7 });
      this.sim.burst(p.x, p.y + 0.2, p.z, { count: 24, radius: 0.3, life: [0.3, 0.7], size: [[0, 0.08], [1, 0.02]], colors: [[0, '#fee761', 1], [1, '#e43b44', 0]], dir1: [-1, 1, -1], dir2: [1, 3, 1], power: [1, 3], gravity: [0, -6, 0] });
      this.player.teleport(this.lastSafe.x, groundHeight(this.lastSafe.x, this.lastSafe.z), this.lastSafe.z);
    }
    this.updateCaveRocks(dt, p);
    if (this.updateDragon(dt, p)) danger = true;
    // The cat hisses at danger.
    this.hissCd = Math.max(0, this.hissCd - dt);
    if (danger && this.pets?.has('cat') && this.hissCd <= 0) {
      this.hissCd = 9;
      this.pets.react('cat');
      ctx.bus.emit('toast', { text: t('out.catHiss', { n: ctx.state.cat.name }), kind: 'warn' });
    }
  }

  private updateCaveRocks(dt: number, p: THREE.Vector3): void {
    const inside = Math.hypot(p.x - CAVERN.x, p.z - CAVERN.z) < CAVERN.r - 0.5;
    if (inside) {
      this.rockT -= dt;
      if (this.rockT <= 0) {
        this.rockT = this.rng.range(3.5, 6);
        const target = new THREE.Vector3(p.x + this.rng.range(-1.5, 1.5), 0, p.z + this.rng.range(-1.5, 1.5));
        target.y = groundHeight(target.x, target.z);
        const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), new THREE.MeshToonMaterial({ color: '#5a5e70' }));
        mesh.visible = false;
        this.scene.add(mesh);
        this.rocks.push({ mesh, body: null, target, warn: 1.3, age: 0, hit: false });
        this.ctx.audio.play('rumble', { volume: 0.5 });
      }
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.age += dt;
      if (r.warn > 0) {
        r.warn -= dt;
        // Dust trickles down where it will fall.
        if (Math.random() < dt * 20) this.sim.burst(r.target.x, 6.5, r.target.z, { count: 4, radius: 0.3, life: [0.6, 1], size: [[0, 0.05], [1, 0.03]], colors: [[0, '#b8b0a0', 0.9], [1, '#8a8070', 0]], dir1: [0, -1, 0], dir2: [0, -1, 0], power: [2, 4], gravity: [0, -6, 0], additive: false });
        if (r.warn <= 0) {
          r.body = this.physics.createBody({ shape: { type: 'sphere', radius: 0.38 }, motion: 'dynamic', mass: 40, position: { x: r.target.x, y: 7, z: r.target.z } });
          r.mesh.visible = true;
        }
        continue;
      }
      if (r.body) {
        const pos = r.body.getPosition({ x: 0, y: 0, z: 0 });
        const q = r.body.getRotation({ x: 0, y: 0, z: 0, w: 1 });
        r.mesh.position.set(pos.x, pos.y, pos.z);
        r.mesh.quaternion.set(q.x, q.y, q.z, q.w);
        if (!r.hit && pos.y < p.y + 1.9 && pos.y > p.y - 0.2 && Math.hypot(pos.x - p.x, pos.z - p.z) < 0.9) {
          r.hit = true;
          this.hurt(1, t('out.rock'));
        }
        if (!r.hit && pos.y < r.target.y + 0.6) {
          r.hit = true;
          this.ctx.audio.play('dropHard', { volume: 0.7, pitch: 0.5 });
          this.player.shake(0.3);
        }
      }
      if (r.age > 7) {
        this.removeRock(r);
        this.rocks.splice(i, 1);
      }
    }
  }

  private removeRock(r: Rock): void {
    if (r.body) this.physics.removeBody(r.body);
    r.body = null;
    r.mesh.removeFromParent();
  }

  /** The sleeping dragon: sprinting, gathering or lingering close wakes it. */
  private updateDragon(dt: number, p: THREE.Vector3): boolean {
    const dr = this.dragon;
    const m = this.refs.dragon;
    const d = Math.hypot(p.x - DRAGON.x, p.z - DRAGON.z);
    const breathe = Math.sin(this.time * 1.2);
    m.body.scale.set(1.5, 0.85 + breathe * 0.03, 1);
    if (dr.awake > 0) {
      dr.awake -= dt;
      dr.headY = Math.min(1, dr.headY + dt * 2);
      // Fire!
      if (dr.awake < 3 && dr.awake > 1.2) {
        const head = m.head.getWorldPosition(new THREE.Vector3());
        const dir = new THREE.Vector3(p.x - head.x, p.y + 1 - head.y, p.z - head.z).normalize();
        if (!dr.breath) this.ctx.audio.play('flare', { volume: 0.9, pitch: 0.6 });
        dr.breath += dt;
        this.sim.burst(head.x + dir.x * 2, head.y, head.z + dir.z * 2, {
          count: 14,
          radius: 0.3,
          life: [0.5, 0.9],
          size: [[0, 0.3], [0.5, 0.7], [1, 0.2]],
          colors: [[0, '#fff4b0', 1], [0.3, '#feae34', 1], [0.7, '#e43b44', 0.8], [1, '#3e2731', 0]],
          dir1: [dir.x * 12 - 1.5, dir.y * 12 - 0.8, dir.z * 12 - 1.5],
          dir2: [dir.x * 12 + 1.5, dir.y * 12 + 1.2, dir.z * 12 + 1.5],
          power: [0.9, 1.3],
          shape: Shape.CIRCLE,
        });
        if (!dr.burned && d < 19) {
          dr.burned = true;
          this.hurt(2, t('out.dragonFire'));
        }
      }
      if (dr.awake <= 0) {
        dr.meter = 0.35;
        dr.breath = 0;
        dr.burned = false;
      }
    } else {
      dr.headY = Math.max(0, dr.headY - dt);
      if (d < 24) dr.meter += dt * (this.player.sprinting && this.player.speed > 1 ? 0.45 : this.player.speed > 0.5 ? 0.06 : 0.02) * (this.pets?.has('cat') ? 0.7 : 1);
      dr.meter = Math.max(0, dr.meter - dt * 0.04);
      if (dr.meter >= 1) {
        dr.awake = 4;
        this.ctx.audio.play('angry', { volume: 1, pitch: 0.35 });
        this.ctx.audio.play('rumble', { volume: 0.9 });
        this.player.shake(0.7);
        this.ctx.state.count('dragon_woke');
      }
    }
    m.head.position.y = 1.0 + dr.headY * 1.8;
    m.head.rotation.z = -dr.headY * 0.3;
    for (const e of m.eyes) {
      const mat = e.material as THREE.MeshBasicMaterial;
      mat.color.set(dr.awake > 0 ? '#fee761' : '#1a0a0a');
      e.scale.y = dr.awake > 0 ? 2.5 : 1;
    }
    return dr.awake > 0 || (dr.meter > 0.6 && d < 24);
  }

  private updateRavens(dt: number, p: THREE.Vector3): void {
    for (const r of this.refs.ravens) {
      const d = Math.hypot(p.x - r.perch.x, p.z - r.perch.z);
      if (r.flyT <= 0 && d < 5) {
        r.flyT = 6;
        this.ctx.audio.play('whoosh', { volume: 0.4, pitch: 1.6 });
      }
      if (r.flyT > 0) {
        r.flyT -= dt;
        const k = 6 - r.flyT;
        r.group.position.set(r.perch.x + Math.sin(k * 0.8) * k * 3, r.perch.y + k * 2.2, r.perch.z + Math.cos(k * 0.8) * k * 3);
        for (const w of r.wings) w.rotation.z = Math.sin(this.time * 22) * 0.8 * (w.position.x > 0 ? 1 : -1);
        if (r.flyT <= 0) r.group.position.copy(r.perch);
      } else {
        for (const w of r.wings) w.rotation.z = 0;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Pets
  // -------------------------------------------------------------------------

  private updatePets(dt: number, p: THREE.Vector3): void {
    const pets = this.pets;
    if (!pets) return;
    pets.update(dt, p, this.player.yaw, this.player.speed > 0.4, this.player.camera, groundHeight);
    // The dog sniffs out the nearest untouched find now and then.
    if (pets.has('dog')) {
      this.sniffT -= dt;
      if (this.sniffT <= 0) {
        this.sniffT = 14;
        let best: GatherNode | null = null;
        let bd = 45;
        for (const n of this.nodes) {
          if (n.taken || n.poison) continue;
          const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z) - (n.rare ? 12 : 0);
          if (d < bd) {
            bd = d;
            best = n;
          }
        }
        // Old scrolls and eggs smell far more interesting than mushrooms.
        let special: THREE.Vector3 | null = null;
        const smell = (pos: THREE.Vector3, bonus: number) => {
          const d = Math.hypot(pos.x - p.x, pos.z - p.z);
          if (d < 40 && d - bonus < bd) {
            bd = d - bonus;
            special = pos;
          }
        };
        for (const sc of this.refs.secrets) if (sc.scroll.visible) smell(sc.pos, 20);
        if (this.egg && !this.egg.taken) smell(this.egg.pos, 26);
        if (special) {
          const sp = special as THREE.Vector3;
          this.sniffBeam.position.set(sp.x, sp.y + 4.5, sp.z);
          this.sniffBeamT = 12;
          pets.react('dog');
          this.ctx.bus.emit('toast', { text: t('out.dogSniffSecret', { n: this.ctx.state.pets.dog.name }), kind: 'info' });
        } else if (best) {
          best.sniffed = 10;
          pets.react('dog');
          this.ctx.bus.emit('toast', { text: t('out.dogSniff', { n: this.ctx.state.pets.dog.name }), kind: 'info' });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Look and feel
  // -------------------------------------------------------------------------

  private updateEnvironment(dt: number): void {
    const ctx = this.ctx;
    const r = this.refs;
    const h = ctx.state.hour;
    const night = h < 5.5 || h >= 22 ? 1 : h < 7.5 ? 1 - (h - 5.5) / 2 : h > 19 ? clamp((h - 19) / 3, 0, 1) : 0;
    const dusk = Math.max(0, 1 - Math.abs(h - 19.5) / 1.6) + Math.max(0, 1 - Math.abs(h - 6.5) / 1.2) * 0.6;
    const df = ctx.renderer.darkFantasy;
    const psx = ctx.renderer.quality === 'ps1';
    const catEyes = this.pets?.has('cat') ? night * 0.35 : 0;
    const p = this.player.feet;
    // Sun and moon
    const dayT = clamp((h - 6) / 14, 0, 1);
    const sunDir = new THREE.Vector3(Math.cos(dayT * Math.PI) * 0.8, Math.max(0.45, Math.sin(dayT * Math.PI)), 0.35).normalize();
    r.sun.position.copy(p).addScaledVector(sunDir, 70);
    r.sun.target.position.copy(p);
    r.sun.intensity = (1 - night) * (df ? 1.9 : 2.4) * (1 - dusk * 0.3);
    r.sun.color.set('#ffe6c0').lerp(new THREE.Color('#ff8a5a'), clamp(dusk, 0, 1));
    const moonDir = new THREE.Vector3(-0.4, 0.75, -0.55).normalize();
    r.moon.position.copy(p).addScaledVector(moonDir, 70);
    r.moon.target.position.copy(p);
    r.moon.intensity = night * (df ? 0.8 : 1.25);
    r.moon.color.set(df ? '#b04858' : '#8fa3e8');
    const skyDay = new THREE.Color(df ? '#8a8a9c' : '#b4c0dc');
    const skyNight = new THREE.Color(df ? '#2a2236' : '#34427a');
    r.hemi.color.copy(skyDay).lerp(skyNight, night);
    r.hemi.groundColor.set('#2a2228').lerp(new THREE.Color('#0c0a10'), night);
    r.hemi.intensity = lerp(df ? 1.25 : 1.4, df ? 0.72 : 1.05, night) + catEyes;
    r.ambient.intensity = lerp(df ? 0.32 : 0.38, df ? 0.2 : 0.24, night) + catEyes * 0.3;
    // Fog and sky
    const fogDay = new THREE.Color(df ? '#56566a' : '#8a94ac');
    const fogDusk = new THREE.Color(df ? '#3a2630' : '#6a4a58');
    const fogNight = new THREE.Color(df ? '#0c0a12' : '#121628');
    const fogCol = fogDay.clone().lerp(fogDusk, clamp(dusk, 0, 1) * (1 - night)).lerp(fogNight, night);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(fogCol);
    (this.scene.background as THREE.Color).copy(fogCol);
    const inCave = Math.hypot(p.x - CAVERN.x, p.z - CAVERN.z) < CAVERN.r;
    fog.near = psx ? 8 : df ? 10 : night ? 14 : 22;
    fog.far = (psx ? 55 : df ? 70 : night ? 80 : 115) * (this.zone === 'swamp' ? 0.7 : 1) * (inCave ? 0.6 : 1);
    // Nothing is visible beyond the fog: let the camera cull it.
    const cam = this.player.camera;
    const far = Math.round(fog.far + 12);
    if (cam.far !== far) {
      cam.far = far;
      cam.updateProjectionMatrix();
    }
    const u = r.sky.mat.uniforms;
    (u.uTop.value as THREE.Color).set(df ? '#1e2230' : '#4e6ea4').lerp(new THREE.Color(df ? '#2a1a28' : '#3a2a50'), clamp(dusk, 0, 1)).lerp(new THREE.Color(df ? '#030306' : '#05060e'), night);
    (u.uHorizon.value as THREE.Color).copy(fogCol);
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    (u.uMoonDir.value as THREE.Vector3).copy(moonDir);
    (u.uMoonColor.value as THREE.Color).set(df ? '#d83848' : '#e8eef8');
    u.uNight.value = night;
    u.uTime.value = this.time;
    // Lanterns glow brighter as it gets dark.
    for (const l of r.lamps) l.intensity = (l.userData.base as number) * (0.2 + 0.8 * Math.max(night, dusk * 0.6, inCave ? 1 : 0));
    for (const m of r.lampMats) m.emissiveIntensity = 0.4 + 1.1 * night;
    for (const a of r.altars) {
      const used = ctx.state.outdoorToday.altars.includes(a.zone);
      (a.ring.material as THREE.MeshBasicMaterial).opacity = used ? 0.12 : 0.45 + 0.25 * Math.sin(this.time * 2.4);
      a.rune.rotation.z = Math.sin(this.time) * 0.1;
    }
    for (const g of r.gates) g.mat.uniforms.uTime.value = this.time;
    r.waterTex.offset.set(this.time * 0.01, this.time * 0.006);
    r.lavaTex.offset.set(this.time * 0.012, -this.time * 0.008);
    // Ambient particles around the player, by region.
    const zw = (id: RegionId) => {
      const z = ZONE_MAP[id];
      return clamp(1 - (Math.hypot(p.x - z.center.x, p.z - z.center.z) - z.radius) / 20, 0, 1);
    };
    const c = (a: AmbientHandle, rate: number, dy = 1) => {
      a.setCenter(p.x, p.y + dy, p.z);
      a.setRate(rate);
    };
    c(this.amb.fireflies, zw('forest') * (6 + 34 * night), 1.2);
    const sw = ZONE_MAP.swamp;
    this.amb.mist.setCenter(sw.center.x, WATER_Y + 0.4, sw.center.z);
    this.amb.mist.setRate(zw('swamp') > 0 ? 34 : 0);
    c(this.amb.embers, zw('valley') * 34, 0);
    c(this.amb.ash, zw('valley') * 26, 4);
    c(this.amb.motes, zw('shrine') * (8 + 22 * night), 0.5);
    c(this.amb.dust, inCave ? 18 : zw('cave') * 6, 1.5);
    c(this.amb.dfAsh, df ? 22 : 0, 5);
    // Dark Fantasy nights: distant lightning.
    if (df && night > 0.5) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = this.rng.range(18, 40);
        ctx.bus.emit('flash', { amount: 0.35, color: '#c0cbff' });
        ctx.audio.play('rumble', { volume: 0.7, delay: 0.8 });
      }
    }
    const g = ctx.renderer.pipeline.grade;
    g.flash = Math.max(0, g.flash - dt * 2.2);
  }

  private updateHud(dt: number): void {
    const ctx = this.ctx;
    const s = ctx.state;
    const hud = this.hud;
    hud.setHearts(this.hearts, MAX_HEARTS);
    const hh = Math.floor(s.hour) % 24;
    const mm = Math.floor((s.hour % 1) * 6) * 10;
    hud.setClock(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, this.deps.expedition.isNight());
    const place = this.zone ? tr(REGION_MAP[this.zone].name) : Math.hypot(this.player.feet.x - PLAZA.x, this.player.feet.z - PLAZA.z) < 14 ? t('out.crossroads') : Math.hypot(this.player.feet.x, this.player.feet.z) < 16 ? t('out.home') : t('out.road');
    hud.setPlace(place);
    hud.setBasket(this.basket, this.capacity);
    const p = this.player.feet;
    const ang = (x: number, z: number) => Math.atan2(x - p.x, -(z - p.z));
    const markers: CompassMarker[] = [{ angle: ang(DOOR.x, DOOR.z), label: '⌂', color: '#fee761' }];
    const colors: Record<RegionId, string> = { forest: '#63c74d', cave: '#2ce8f5', shrine: '#c0cbff', swamp: '#b4c83a', valley: '#f77622' };
    for (const zn of ZONES) markers.push({ angle: ang(zn.center.x, zn.center.z), label: t(`out.short.${zn.id}`), color: colors[zn.id] });
    // Heading: yaw 0 looks north (−z); turning right (east) lowers yaw.
    hud.setCompass(-this.player.yaw, markers);
    hud.update(dt);
  }

  // -------------------------------------------------------------------------
  // Debug hooks (tests)
  // -------------------------------------------------------------------------

  readonly debug = {
    teleport: (x: number, z: number, yaw = this.player?.yaw ?? 0) => {
      this.player.teleport(x, groundHeight(x, z), z);
      this.lastSafe.set(x, groundHeight(x, z), z);
      this.player.yaw = yaw;
      this.pets?.teleport(this.player.feet, yaw);
    },
    nodes: () => this.nodes.filter((n) => !n.taken).map((n) => ({ id: n.id, zone: n.zone, ingredient: n.ingredientId, poison: n.poison, x: n.pos.x, z: n.pos.z })),
    target: () => this.target?.label ?? null,
    zones: () => ZONES.map((z) => ({ id: z.id, x: z.center.x, z: z.center.z, gateX: z.gate.x, gateZ: z.gate.z })),
    altars: () => this.refs.altars.map((a) => ({ zone: a.zone, x: a.pos.x, z: a.pos.z })),
    well: () => ({ x: this.refs.well.x, z: this.refs.well.z }),
    dragon: () => ({ ...this.dragon, x: DRAGON.x, z: DRAGON.z }),
    look: (dx: number, dy: number) => this.player.look(dx, dy),
    faceTo: (x: number, z: number) => this.player.faceTowards(x, z),
    pools: () => poolMask(this.player.feet.x, this.player.feet.z),
    secrets: () => this.refs.secrets.map((sc) => ({ zone: sc.zone, x: sc.pos.x, y: sc.pos.y, z: sc.pos.z, visible: sc.scroll.visible })),
    nests: () => this.refs.nests.map((n) => ({ x: n.x, z: n.z })),
    egg: () => (this.egg ? { x: this.egg.pos.x, z: this.egg.pos.z, taken: this.egg.taken } : null),
    /** Put an egg in the first nest right now. */
    spawnEgg: () => {
      this.forceEgg = true;
      this.spawnEgg();
    },
    wolves: () => this.wolves.map((w) => ({ zone: w.zone, x: w.pos.x, z: w.pos.z, state: w.state })),
    howl: () => this.howl(),
  };
}
