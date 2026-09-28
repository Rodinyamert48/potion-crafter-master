// Animated pixel-art billboard living in the 3D world: yaw-only camera
// facing, lit by the scene lights (toon shading), with a dithered blob
// shadow on the floor.

import * as THREE from 'three';
import type { SpriteSheet } from './CharacterPainter';
import { PX_PER_M } from './CharacterPainter';
import { configurePixelTexture } from '../textures/Painter';
import { toonUnique } from '../materials';
import { blobShadow } from '../textures/PixelTextures';

const texCache = new WeakMap<HTMLCanvasElement, THREE.CanvasTexture>();

function sheetTexture(sheet: SpriteSheet): THREE.CanvasTexture {
  let t = texCache.get(sheet.canvas);
  if (!t) {
    t = configurePixelTexture(new THREE.CanvasTexture(sheet.canvas), { mipmaps: false });
    texCache.set(sheet.canvas, t);
  }
  return t;
}

export class PixelSprite {
  readonly root = new THREE.Group();
  readonly quad: THREE.Mesh;
  readonly material: THREE.MeshToonMaterial;
  readonly shadow: THREE.Mesh;
  readonly widthM: number;
  readonly heightM: number;
  private readonly texture: THREE.Texture;
  private anim = 'idle';
  private frameIdx = 0;
  private timer = 0;
  private done = false;
  facing = 1;
  /** Extra vertical offset for hops/jumps (metres). */
  hop = 0;
  squash = 0;
  opacity = 1;

  constructor(
    readonly sheet: SpriteSheet,
    scale = 1,
  ) {
    this.widthM = (sheet.frameW / PX_PER_M) * scale;
    this.heightM = (sheet.frameH / PX_PER_M) * scale;
    this.texture = sheetTexture(sheet).clone();
    this.texture.needsUpdate = true;
    this.texture.repeat.set(1 / sheet.cols, 1 / sheet.rows);
    this.material = toonUnique({
      map: this.texture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      emissive: '#ffffff',
      emissiveIntensity: 0.12,
    });
    this.material.emissiveMap = this.texture;
    const geo = new THREE.PlaneGeometry(this.widthM, this.heightM);
    geo.translate(0, this.heightM / 2, 0);
    this.quad = new THREE.Mesh(geo, this.material);
    this.quad.castShadow = true;
    this.quad.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.texture, alphaTest: 0.5 });
    this.quad.customDistanceMaterial = new THREE.MeshDistanceMaterial({ map: this.texture, alphaTest: 0.5 });
    this.root.add(this.quad);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(this.widthM * 0.9, this.widthM * 0.4),
      new THREE.MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 3;
    this.shadow.userData.noPick = true;
    this.shadow.raycast = () => {};
    this.root.add(this.shadow);
    this.setFrame(0);
  }

  play(name: string, restart = false): void {
    if (!this.sheet.anims[name]) name = 'idle';
    if (name === this.anim && !restart) return;
    this.anim = name;
    this.frameIdx = 0;
    this.timer = 0;
    this.done = false;
    this.setFrame(this.sheet.anims[name].frames[0]);
  }

  get current(): string {
    return this.anim;
  }

  get finished(): boolean {
    return this.done;
  }

  private setFrame(index: number): void {
    const col = index % this.sheet.cols;
    const row = Math.floor(index / this.sheet.cols);
    this.texture.offset.set(col / this.sheet.cols, 1 - (row + 1) / this.sheet.rows);
  }

  update(dt: number, camera: THREE.Camera): void {
    const a = this.sheet.anims[this.anim];
    this.timer += dt;
    const step = 1 / a.fps;
    while (this.timer >= step) {
      this.timer -= step;
      this.frameIdx++;
      if (this.frameIdx >= a.frames.length) {
        if (a.loop) this.frameIdx = 0;
        else {
          this.frameIdx = a.frames.length - 1;
          this.done = true;
        }
      }
    }
    this.setFrame(a.frames[this.frameIdx]);
    // Yaw-only billboard
    const camPos = camera.position;
    const wp = this.root.getWorldPosition(_v);
    this.quad.rotation.y = Math.atan2(camPos.x - wp.x, camPos.z - wp.z);
    this.quad.scale.set(this.facing * (1 + this.squash * 0.25), 1 - this.squash * 0.2, 1);
    this.quad.position.y = this.hop;
    this.shadow.scale.setScalar(1 - Math.min(0.6, this.hop * 0.8));
    const transparent = this.opacity < 0.99;
    if (this.material.transparent !== transparent) {
      this.material.transparent = transparent;
      this.material.needsUpdate = true;
    }
    this.material.opacity = this.opacity;
    this.material.alphaTest = transparent ? 0.05 : 0.5;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.root.removeFromParent();
  }
}

const _v = new THREE.Vector3();
