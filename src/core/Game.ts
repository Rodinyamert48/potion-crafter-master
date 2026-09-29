// Game orchestrator: constructs every system, owns the loop and wires input
// to the camera. Gameplay systems register themselves as "systems" with
// update/fixed hooks so this file stays a thin composition root.

import * as THREE from 'three';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { Input } from './Input';
import { Loop } from './Loop';
import { isMobileDevice, loadSettings, saveSettings, type Settings } from './Settings';
import type { GameContext } from './GameContext';
import { ThreeRenderer } from '../rendering/three/ThreeRenderer';
import { BabylonCore } from '../rendering/babylon/BabylonCore';
import { BabylonParticleSim } from '../rendering/babylon/BabylonParticleSim';
import { BabylonPhysicsWorld } from '../physics/BabylonPhysicsWorld';
import { PhysicsSync } from '../physics/PhysicsSync';
import { ParticleRenderer } from '../vfx/ParticleRenderer';
import { VFX } from '../vfx/VFX';
import { Debris } from '../vfx/Debris';
import { AudioSystem } from '../audio/AudioSystem';
import { Voice } from '../audio/Voice';
import { World } from '../world/World';
import { Interaction, PhysicsGrab } from '../world/Interaction';
import { GameState } from '../gameplay/GameState';
import { UIRoot } from '../ui/UIRoot';
import { buildShop, ROOM } from '../world/ShopBuilder';
import { updateSky } from '../rendering/three/shaders/SkyMaterial';
import { clamp } from './math';
import { Scheduler } from './Scheduler';
import { t } from './i18n';
import type { Quality } from '../rendering/three/ThreeRenderer';
import { setRetroTheme } from '../ui/theme';

/** The open world / garden: runs instead of (outside) or next to (garden) the shop. */
export interface ModeHandler {
  fixed?(dt: number): void;
  update(dt: number): void;
}

export interface GameSystem {
  fixed?(dt: number): void;
  update?(dt: number): void;
  /** Also updated behind the title screen (ambient life, UI). */
  always?: boolean;
}

export class Game {
  readonly ctx: GameContext;
  readonly loop: Loop;
  readonly ui: UIRoot;
  private readonly systems: GameSystem[] = [];
  private modeHandler: ModeHandler | null = null;
  private readonly particles: ParticleRenderer;
  private readonly babylonSim: BabylonParticleSim;
  readonly scheduler = new Scheduler();
  /** False while the title screen is up. */
  playing = false;
  /** Level chosen by the automatic quality governor ('auto' setting). */
  private autoQuality: Quality = isMobileDevice() ? 'medium' : 'high';
  private readonly fpsSamples: number[] = [];
  private fpsSampleT = 0;
  private qualityCooldown = 12;

  private constructor(
    readonly core: BabylonCore,
    readonly renderer: ThreeRenderer,
    viewport: HTMLElement,
    uiRoot: HTMLElement,
  ) {
    const bus = new EventBus<GameEvents>();
    const input = new Input(viewport);
    const settings = loadSettings();
    const physics = new BabylonPhysicsWorld(core);
    const sync = new PhysicsSync();
    this.particles = new ParticleRenderer(renderer.scene, 5000);
    this.babylonSim = new BabylonParticleSim(core);
    this.particles.addSource(this.babylonSim);
    const vfx = new VFX(this.particles, this.babylonSim);
    const debris = new Debris(renderer.scene, physics, sync);
    const audio = new AudioSystem();
    const voice = new Voice(audio);
    const world = new World(renderer.scene);
    const state = new GameState(bus);
    this.ui = new UIRoot(uiRoot, viewport);

    const ctx = {
      bus,
      input,
      renderer,
      scene: renderer.scene,
      physics,
      sync,
      vfx,
      debris,
      audio,
      voice,
      world,
      state,
      settings,
      ui: this.ui,
      shopBounds: { minX: ROOM.minX + 0.2, maxX: ROOM.maxX - 0.2, minZ: ROOM.minZ + 0.2, maxZ: ROOM.maxZ - 0.1 },
      time: 0,
      gameTime: 0,
      paused: false,
      mode: 'shop',
      renderAlpha: 0,
      later: (seconds: number, fn: () => void) => this.scheduler.later(seconds, fn),
    } as unknown as GameContext;
    this.ctx = ctx;
    ctx.interaction = new Interaction(ctx);
    this.ui.bind(ctx);
    ctx.shop = buildShop(ctx);

    physics.onCollision((c) => {
      if (!c.started) return;
      const a = world.entityFromBody(c.a);
      const b = world.entityFromBody(c.b);
      a?.onImpact(ctx, b, c.impulse, c.point);
      b?.onImpact(ctx, a, c.impulse, c.point);
    });

    bus.on('shake', ({ amount }) => renderer.rig.shake(amount * (settings.shake ? 1 : 0)));
    bus.on('flash', ({ amount, color }) => {
      renderer.pipeline.grade.flash = Math.max(renderer.pipeline.grade.flash, amount);
      if (color) renderer.pipeline.grade.flashColor.set(color);
    });

    this.applySettings(settings);
    renderer.rig.setPreset(ctx.shop.presets.overview, true);
    this.bindCameraInput();

    this.loop = new Loop({
      fixed: (dt) => this.fixed(dt),
      update: (dt, time) => this.update(dt, time),
      render: (alpha, dt) => {
        ctx.renderAlpha = alpha;
        sync.interpolate(alpha);
        renderer.render(dt);
      },
    });
  }

  static async create(viewport: HTMLElement, uiRoot: HTMLElement, onStatus: (s: string) => void): Promise<Game> {
    onStatus('boot.physics');
    const core = await BabylonCore.create();
    onStatus('boot.art');
    const renderer = new ThreeRenderer(viewport);
    onStatus('boot.world');
    return new Game(core, renderer, viewport, uiRoot);
  }

  addSystem(s: GameSystem): void {
    this.systems.push(s);
  }

  /** Switch between the shop, the open world and the garden. */
  setMode(mode: GameContext['mode'], handler: ModeHandler | null): void {
    const ctx = this.ctx;
    ctx.mode = mode;
    this.modeHandler = handler;
    ctx.ui.tooltip(null);
    ctx.ui.setHint(null);
    ctx.ui.setCursor('default');
  }

  applySettings(s: Settings): void {
    const ctx = this.ctx;
    ctx.settings = s;
    const q = s.quality === 'auto' ? this.autoQuality : s.quality;
    this.renderer.setPixelPreset(s.pixel);
    this.renderer.setQuality(q);
    this.renderer.setDarkFantasy(s.retro);
    setRetroTheme(s.retro);
    this.particles.density = q === 'low' ? 0.5 : q === 'medium' ? 0.8 : 1;
    this.babylonSim.density = this.particles.density;
    this.renderer.rig.shakeEnabled = s.shake;
    ctx.audio.setVolumes(s.master, s.music, s.sfx);
    saveSettings(s);
  }

  /** 'auto' quality: step down (high → medium → low) when the frame rate
   *  stays low while playing in a visible tab. */
  private governQuality(dt: number): void {
    const ctx = this.ctx;
    if (ctx.settings.quality !== 'auto' || !this.playing || document.visibilityState !== 'visible') {
      this.fpsSamples.length = 0;
      return;
    }
    this.qualityCooldown -= dt;
    this.fpsSampleT += dt;
    if (this.fpsSampleT < 1) return;
    this.fpsSampleT = 0;
    this.fpsSamples.push(this.loop.fps);
    if (this.fpsSamples.length > 6) this.fpsSamples.shift();
    if (this.qualityCooldown > 0 || this.fpsSamples.length < 6 || this.autoQuality === 'low') return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    if (avg < 42) {
      this.autoQuality = this.autoQuality === 'high' ? 'medium' : 'low';
      this.fpsSamples.length = 0;
      this.qualityCooldown = 10;
      this.applySettings(ctx.settings);
      ctx.bus.emit('toast', { text: `${t('toast.quality')} ${t(`settings.quality.${this.autoQuality}`)}`, kind: 'info' });
    }
  }

  private bindCameraInput(): void {
    const ctx = this.ctx;
    const rig = this.renderer.rig;
    ctx.input.onWheel((dy) => {
      if (!this.playing || ctx.ui.panelOpen || ctx.mode !== 'shop') return;
      if (ctx.interaction.grab instanceof PhysicsGrab) return;
      rig.zoom(dy * 0.0012);
    });
    ctx.input.onPinch((scale, px, py, rot) => {
      if (!this.playing || ctx.ui.panelOpen || ctx.mode !== 'shop') return;
      rig.zoom(-(scale - 1) * 1.5);
      const k = rig.distance * 0.0016;
      rig.pan(-px * k, -py * k);
      // Twisting two fingers turns the view.
      if (Math.abs(rot) > 0.002) rig.rotate(rot * 0.8);
    });
    ctx.input.onKeyDown((code) => {
      if (!this.playing || ctx.ui.panelOpen || ctx.mode !== 'shop') return;
      const p = ctx.shop.presets;
      if (code === 'Digit1') rig.setPreset(p.overview);
      if (code === 'Digit2') rig.setPreset(p.cauldron);
      if (code === 'Digit3') rig.setPreset(p.table);
      if (code === 'Digit4') rig.setPreset(p.shelves);
      if (code === 'Digit5') rig.setPreset(p.counter);
    });
  }

  private cameraControls(dt: number): void {
    const ctx = this.ctx;
    const input = ctx.input;
    const rig = this.renderer.rig;
    if (ctx.ui.panelOpen) return;
    const holding = !!ctx.interaction.grab;
    const speed = rig.distance * 0.55 * dt;
    let dx = 0;
    let dz = 0;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) dx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) dx += 1;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) dz -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) dz += 1;
    if (dx || dz) rig.pan(dx * speed, dz * speed);
    // Zoom with +/- (keyboard or the touch buttons).
    if (input.isDown('Equal') || input.isDown('NumpadAdd')) rig.zoom(-dt * 1.2);
    if (input.isDown('Minus') || input.isDown('NumpadSubtract')) rig.zoom(dt * 1.2);
    if (!holding) {
      if (input.isDown('KeyQ')) rig.rotate(dt * 0.9);
      if (input.isDown('KeyE')) rig.rotate(-dt * 0.9);
      // Right/middle drag – or dragging from empty floor – pans the view.
      const emptyDrag = input.pointer.down[0] && ctx.interaction.emptyPress;
      if ((input.pointer.down[2] || input.pointer.down[1] || emptyDrag) && input.pointer.valid && !ctx.interaction.altConsumed) {
        const k = rig.distance * 0.0016;
        rig.pan(-input.pointer.dx * k, -input.pointer.dy * k);
      }
    }
    rig.parallax.set(clamp(input.pointer.ndcX, -1, 1), clamp(input.pointer.ndcY, -1, 1));
  }

  private fixed(dt: number): void {
    const ctx = this.ctx;
    if (this.playing && ctx.mode === 'outside') {
      // The shop waits (the master keeps an eye on it); only the open world runs.
      if (!ctx.ui.panelOpen) this.modeHandler?.fixed?.(dt);
      return;
    }
    if (ctx.paused || !this.playing) {
      // Keep the world alive behind the title screen, but no gameplay.
      if (!this.playing) {
        ctx.physics.step(dt);
        ctx.sync.afterStep();
      }
      return;
    }
    ctx.gameTime += dt;
    ctx.interaction.fixedUpdate(dt);
    ctx.world.fixedUpdate(ctx, dt);
    for (const s of this.systems) s.fixed?.(dt);
    ctx.physics.step(dt);
    ctx.sync.afterStep();
    if (ctx.mode === 'garden') this.modeHandler?.fixed?.(dt);
  }

  private update(dt: number, time: number): void {
    const ctx = this.ctx;
    ctx.time = time;
    const outside = this.playing && ctx.mode === 'outside';
    const inShop = ctx.mode === 'shop';
    ctx.paused = this.playing ? ctx.ui.panelOpen || outside : false;
    ctx.interaction.enabled = this.playing && !ctx.ui.panelOpen && inShop;
    ctx.input.enabled = true;
    if (this.playing && inShop) this.cameraControls(dt);
    ctx.audio.listenerX = inShop ? this.renderer.rig.focus.x : 0;
    if (this.playing && !ctx.paused) {
      this.scheduler.update(dt);
      if (inShop) ctx.interaction.update(dt);
      ctx.world.update(ctx, dt);
    } else if (!this.playing) {
      ctx.world.update(ctx, dt);
    } else if (inShop) {
      ctx.ui.tooltip(null);
    }
    for (const s of this.systems) if ((this.playing && !outside) || s.always) s.update?.(dt);
    if (this.playing && this.modeHandler) this.modeHandler.update(dt);

    // Environment visuals
    ctx.shop.cutaway.update(this.renderer.rig.camera.position, dt);
    const lighting = this.renderer.lighting;
    lighting.hour = ctx.state.hour;
    updateSky(ctx.shop.sky, ctx.state.hour, lighting.nightness, time);
    const day = 1 - lighting.nightness;
    for (const s of ctx.shop.lightShafts) {
      const m = s.material as THREE.MeshBasicMaterial;
      m.opacity = 0.08 * day * (0.85 + 0.15 * Math.sin(time * 0.7 + s.position.x));
      m.color.copy(lighting.sun.color);
      s.visible = day > 0.05;
    }
    for (let i = 0; i < ctx.shop.flames.length; i++) {
      const f = ctx.shop.flames[i];
      const m = f.material as THREE.ShaderMaterial;
      m.uniforms.uTime.value = time + i * 3.1;
    }
    const g = this.renderer.pipeline.grade;
    g.flash = Math.max(0, g.flash - dt * 2.2);

    this.governQuality(dt);
    if (!outside) {
      this.babylonSim.update(dt);
      this.particles.setViewport(this.renderer.lowHeight, this.renderer.rig.camera.fov);
      this.particles.update(dt);
      ctx.debris.update(dt);
    }
    this.ui.update(dt);
    ctx.world.flush(ctx);
    ctx.input.endFrame(dt);
  }

  start(): void {
    this.loop.start();
  }
}
