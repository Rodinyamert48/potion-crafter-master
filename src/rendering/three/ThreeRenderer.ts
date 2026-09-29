// Owns the Three.js renderer, scene graph, camera rig, lights and the pixel
// pipeline. This is the only place that talks to WebGL.

import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { PixelPipeline } from './PixelPipeline';
import { setPsx } from './Psx';

export type PixelPreset = 'fine' | 'normal' | 'chunky';
/** 'ps1' is the PlayStation look: wobbling vertices, warped textures,
 *  15-bit colour and no outlines (also the lightest mode). */
export type Quality = 'low' | 'medium' | 'high' | 'ps1';

/** Another scene drawn instead of the shop (the open world, the garden). */
export interface RenderView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Per-frame work before drawing (lights, sky, sprites…). */
  update?(dt: number): void;
  setAspect?(aspect: number): void;
}

const TARGET_HEIGHT: Record<PixelPreset, number> = { fine: 620, normal: 460, chunky: 340 };

export class ThreeRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly lighting: Lighting;
  readonly pipeline: PixelPipeline;
  readonly canvas: HTMLCanvasElement;
  pixelPreset: PixelPreset = 'normal';
  quality: Quality = 'high';
  /** Dark Fantasy mood (Settings → Dark Fantasy). */
  darkFantasy = false;
  lowWidth = 1;
  lowHeight = 1;
  pixelScale = 2;
  /** Callbacks that want the per-frame render dt (shaders, sprites…). */
  private readonly frameHooks: Array<(dt: number, time: number) => void> = [];
  private time = 0;
  /** When set, this view is drawn instead of the shop. */
  view: RenderView | null = null;
  /** Other scenes whose materials follow quality switches (PS1 shader patch). */
  readonly extraScenes = new Set<THREE.Scene>();
  /** Called when the mood (Dark Fantasy / PS1) changes. */
  readonly moodHooks: Array<() => void> = [];
  private aspect = 16 / 9;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor('#181425', 1);
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);

    this.scene.background = new THREE.Color('#181425');
    this.scene.fog = new THREE.Fog('#181425', 18, 40);

    this.rig = new CameraRig(1);
    this.lighting = new Lighting(this.scene, true);
    this.pipeline = new PixelPipeline(this.renderer);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  onFrame(fn: (dt: number, time: number) => void): void {
    this.frameHooks.push(fn);
  }

  setPixelPreset(p: PixelPreset): void {
    this.pixelPreset = p;
    this.resize();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const psx = q === 'ps1';
    const shadows = q !== 'low' && !psx;
    this.renderer.shadowMap.enabled = shadows;
    this.lighting.setShadows(q === 'high' ? 'all' : q === 'medium' ? 'sun' : 'off');
    this.lighting.setShadowDetail(q === 'high' ? 2048 : 1024);
    this.pipeline.bloomEnabled = q !== 'low' && !psx;
    this.pipeline.bloomPasses = q === 'high' ? 3 : 2;
    this.pipeline.bloomStrength = q === 'high' ? 0.85 : 0.75;
    // The PS1 had no outlines; it had fog and a short draw distance.
    this.pipeline.outline = psx ? 0 : 1;
    this.pipeline.psx = psx ? 1 : 0;
    this.applyMood();
    document.documentElement.classList.toggle('psx', psx);
    setPsx(this.scene, psx);
    for (const sc of [this.scene, ...this.extraScenes])
      sc.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
      });
    this.resize();
  }

  setDarkFantasy(on: boolean): void {
    this.darkFantasy = on;
    this.pipeline.retro = on ? 1 : 0;
    this.lighting.darkFantasy = on;
    this.applyMood();
  }

  /** Fog and background for the current quality and mood. */
  private applyMood(): void {
    const psx = this.quality === 'ps1';
    const dark = this.darkFantasy;
    const bg = dark ? '#07060a' : psx ? '#100e16' : '#181425';
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(dark ? '#0b0910' : bg);
    fog.near = psx ? 11 : dark ? 13 : 18;
    fog.far = psx ? 26 : dark ? 32 : 40;
    (this.scene.background as THREE.Color).set(bg);
    this.renderer.setClearColor(bg, 1);
    for (const fn of this.moodHooks) fn();
  }

  /** Draw another scene instead of the shop (null: back to the shop). */
  setView(view: RenderView | null): void {
    this.view = view;
    view?.setAspect?.(this.aspect);
  }

  /** The camera currently on screen. */
  get activeCamera(): THREE.PerspectiveCamera {
    return this.view?.camera ?? this.rig.camera;
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const physW = w * dpr;
    const physH = h * dpr;
    let target = TARGET_HEIGHT[this.pixelPreset];
    if (this.quality === 'low') target *= 0.8;
    // Roughly the PS1's 240 lines.
    if (this.quality === 'ps1') target = 250;
    const scale = Math.max(1, Math.round(physH / target));
    this.pixelScale = scale / dpr;
    this.lowWidth = Math.max(1, Math.ceil(physW / scale));
    this.lowHeight = Math.max(1, Math.ceil(physH / scale));
    this.renderer.setSize(this.lowWidth, this.lowHeight, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.pipeline.setSize(this.lowWidth, this.lowHeight);
    this.aspect = w / h;
    this.rig.setAspect(this.aspect);
    this.view?.setAspect?.(this.aspect);
  }

  /** Project a world position to CSS pixel coordinates of the viewport. */
  project(world: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void {
    const v = _proj.copy(world).project(this.activeCamera);
    out.x = (v.x * 0.5 + 0.5) * this.container.clientWidth;
    out.y = (-v.y * 0.5 + 0.5) * this.container.clientHeight;
    out.visible = v.z < 1 && v.z > -1;
  }

  render(dt: number): void {
    this.time += dt;
    for (const fn of this.frameHooks) fn(dt, this.time);
    if (this.view) {
      this.view.update?.(dt);
      this.pipeline.render(this.view.scene, this.view.camera);
      return;
    }
    this.rig.update(dt);
    this.lighting.update(dt);
    this.lighting.scheduleShadows();
    this.pipeline.render(this.scene, this.rig.camera);
  }
}

const _proj = new THREE.Vector3();
