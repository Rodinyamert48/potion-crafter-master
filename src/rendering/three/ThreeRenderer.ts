// Owns the Three.js renderer, scene graph, camera rig, lights and the pixel
// pipeline. This is the only place that talks to WebGL.

import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { PixelPipeline } from './PixelPipeline';

export type PixelPreset = 'fine' | 'normal' | 'chunky';
export type Quality = 'low' | 'medium' | 'high';

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
  lowWidth = 1;
  lowHeight = 1;
  pixelScale = 2;
  /** Callbacks that want the per-frame render dt (shaders, sprites…). */
  private readonly frameHooks: Array<(dt: number, time: number) => void> = [];
  private time = 0;

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
    const shadows = q !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.lighting.setShadows(q === 'high' ? 'all' : q === 'medium' ? 'sun' : 'off');
    this.pipeline.bloomEnabled = q !== 'low';
    this.pipeline.outline = 1;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
    });
    this.resize();
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const physW = w * dpr;
    const physH = h * dpr;
    let target = TARGET_HEIGHT[this.pixelPreset];
    if (this.quality === 'low') target *= 0.8;
    const scale = Math.max(1, Math.round(physH / target));
    this.pixelScale = scale / dpr;
    this.lowWidth = Math.max(1, Math.ceil(physW / scale));
    this.lowHeight = Math.max(1, Math.ceil(physH / scale));
    this.renderer.setSize(this.lowWidth, this.lowHeight, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.pipeline.setSize(this.lowWidth, this.lowHeight);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  /** Project a world position to CSS pixel coordinates of the viewport. */
  project(world: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void {
    const v = _proj.copy(world).project(this.rig.camera);
    out.x = (v.x * 0.5 + 0.5) * this.container.clientWidth;
    out.y = (-v.y * 0.5 + 0.5) * this.container.clientHeight;
    out.visible = v.z < 1 && v.z > -1;
  }

  render(dt: number): void {
    this.time += dt;
    for (const fn of this.frameHooks) fn(dt, this.time);
    this.rig.update(dt);
    this.lighting.update(dt);
    this.lighting.scheduleShadows();
    this.pipeline.render(this.scene, this.rig.camera);
  }
}

const _proj = new THREE.Vector3();
