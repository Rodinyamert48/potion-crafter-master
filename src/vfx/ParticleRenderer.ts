// Pooled, CPU simulated pixel particles rendered with two THREE.Points draw
// calls (alpha + additive). External simulations (Babylon particle systems)
// can push their particles into the same buffers through ParticleSource.

import * as THREE from 'three';
import { runeGlyphAtlas } from '../rendering/three/textures/PixelTextures';

export const Shape = {
  SQUARE: 0,
  CIRCLE: 1,
  SOFT: 2,
  RING: 3,
  SPARKLE: 4,
  RUNE: 8,
} as const;

export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size0: number;
  size1?: number;
  color0: THREE.Color;
  color1?: THREE.Color;
  alpha0?: number;
  alpha1?: number;
  gravity?: number;
  drag?: number;
  shape?: number;
  additive?: boolean;
  wobble?: number;
  /** Seconds of delay before the particle becomes visible. */
  delay?: number;
}

/** Anything that can contribute already-simulated particles each frame. */
export interface ParticleSource {
  forEach(
    cb: (x: number, y: number, z: number, r: number, g: number, b: number, a: number, size: number, shape: number, additive: boolean) => void,
  ): void;
}

const VERT = /* glsl */ `
  attribute vec4 aColor;
  attribute float aSize;
  attribute float aShape;
  uniform float uScale;
  varying vec4 vColor;
  varying float vShape;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, floor(aSize * uScale / -mv.z + 0.5));
    vColor = aColor;
    vShape = aShape;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uRunes;
  uniform float uAdditive;
  varying vec4 vColor;
  varying float vShape;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    float alpha = vColor.a;
    int shape = int(vShape + 0.5);
    if (shape == 1) {
      if (d > 1.0) discard;
    } else if (shape == 2) {
      if (d > 1.0) discard;
      // Soft puff in three crisp rings rather than a smooth gradient.
      alpha *= floor((1.0 - d) * 3.0 + 0.999) / 3.0;
    } else if (shape == 3) {
      if (d > 1.0 || d < 0.38) discard;
    } else if (shape == 4) {
      bool cross = abs(p.x) < 0.26 || abs(p.y) < 0.26;
      if (!cross || d > 1.0) discard;
      if (abs(p.x) >= 0.26 || abs(p.y) >= 0.26) alpha *= 0.75;
    } else if (shape >= 8) {
      float gi = float(shape - 8);
      vec2 uv = vec2((gi + gl_PointCoord.x) / 8.0, 1.0 - gl_PointCoord.y);
      float m = texture2D(uRunes, uv).a;
      if (m < 0.5) discard;
    }
    if (uAdditive < 0.5) {
      // Few alpha steps keep the pixel-art read; overlapping puffs build up.
      float a = floor(alpha * 5.0 + 0.4) / 5.0;
      if (a < 0.05) discard;
      gl_FragColor = vec4(vColor.rgb, a);
    } else {
      gl_FragColor = vec4(vColor.rgb * alpha, 1.0);
    }
  }
`;

class Layer {
  readonly geometry = new THREE.BufferGeometry();
  readonly points: THREE.Points;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly size: Float32Array;
  readonly shape: Float32Array;
  count = 0;

  constructor(
    readonly capacity: number,
    additive: boolean,
    uniforms: Record<string, THREE.IUniform>,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.shape = new Float32Array(capacity);
    const g = this.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { ...uniforms, uAdditive: { value: additive ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
  }

  push(x: number, y: number, z: number, r: number, g: number, b: number, a: number, s: number, sh: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 4] = r;
    this.col[i * 4 + 1] = g;
    this.col[i * 4 + 2] = b;
    this.col[i * 4 + 3] = a;
    this.size[i] = s;
    this.shape[i] = sh;
  }

  flush(): void {
    const g = this.geometry;
    for (const name of ['position', 'aColor', 'aSize', 'aShape']) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.count * attr.itemSize);
      attr.needsUpdate = true;
    }
    g.setDrawRange(0, this.count);
  }
}

export class ParticleRenderer {
  readonly capacity: number;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly alphaLayer: Layer;
  private readonly addLayer: Layer;
  private readonly sources: ParticleSource[] = [];

  // Structure-of-arrays pool
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly c0: Float32Array;
  private readonly c1: Float32Array;
  private readonly a0: Float32Array;
  private readonly a1: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly life: Float32Array;
  private readonly age: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly shp: Uint8Array;
  private readonly add: Uint8Array;
  private readonly wob: Float32Array;
  private readonly seed: Float32Array;
  private readonly alive: Uint8Array;
  private readonly free: number[] = [];
  /** Global multiplier for emission counts (quality settings). */
  density = 1;
  activeCount = 0;

  constructor(scene: THREE.Scene, capacity = 5000) {
    this.capacity = capacity;
    this.uniforms = { uScale: { value: 300 }, uRunes: { value: runeGlyphAtlas() } };
    this.alphaLayer = new Layer(capacity + 1500, false, this.uniforms);
    this.addLayer = new Layer(capacity + 1500, true, this.uniforms);
    scene.add(this.alphaLayer.points, this.addLayer.points);
    const f = () => new Float32Array(capacity);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.c0 = new Float32Array(capacity * 3);
    this.c1 = new Float32Array(capacity * 3);
    this.a0 = f();
    this.a1 = f();
    this.s0 = f();
    this.s1 = f();
    this.life = f();
    this.age = f();
    this.grav = f();
    this.drag = f();
    this.wob = f();
    this.seed = f();
    this.shp = new Uint8Array(capacity);
    this.add = new Uint8Array(capacity);
    this.alive = new Uint8Array(capacity);
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
  }

  addSource(src: ParticleSource): void {
    this.sources.push(src);
  }

  /** Point size scale: pixels per world unit at distance 1. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  spawn(s: ParticleSpawn): void {
    const i = this.free.pop();
    if (i === undefined) return;
    this.alive[i] = 1;
    this.px[i] = s.x;
    this.py[i] = s.y;
    this.pz[i] = s.z;
    this.vx[i] = s.vx ?? 0;
    this.vy[i] = s.vy ?? 0;
    this.vz[i] = s.vz ?? 0;
    const c0 = s.color0;
    const c1 = s.color1 ?? s.color0;
    this.c0[i * 3] = c0.r;
    this.c0[i * 3 + 1] = c0.g;
    this.c0[i * 3 + 2] = c0.b;
    this.c1[i * 3] = c1.r;
    this.c1[i * 3 + 1] = c1.g;
    this.c1[i * 3 + 2] = c1.b;
    this.a0[i] = s.alpha0 ?? 1;
    this.a1[i] = s.alpha1 ?? 0;
    this.s0[i] = s.size0;
    this.s1[i] = s.size1 ?? s.size0;
    this.life[i] = Math.max(0.01, s.life);
    this.age[i] = -(s.delay ?? 0);
    this.grav[i] = s.gravity ?? 0;
    this.drag[i] = s.drag ?? 0;
    this.shp[i] = s.shape ?? Shape.SQUARE;
    this.add[i] = s.additive ? 1 : 0;
    this.wob[i] = s.wobble ?? 0;
    this.seed[i] = Math.random() * 100;
  }

  update(dt: number): void {
    const A = this.alphaLayer;
    const B = this.addLayer;
    A.count = 0;
    B.count = 0;
    let active = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      this.age[i] += dt;
      const age = this.age[i];
      if (age < 0) continue;
      const life = this.life[i];
      if (age >= life) {
        this.alive[i] = 0;
        this.free.push(i);
        continue;
      }
      active++;
      const drag = this.drag[i];
      if (drag > 0) {
        const k = Math.max(0, 1 - drag * dt);
        this.vx[i] *= k;
        this.vy[i] *= k;
        this.vz[i] *= k;
      }
      this.vy[i] += this.grav[i] * dt;
      let x = (this.px[i] += this.vx[i] * dt);
      const y = (this.py[i] += this.vy[i] * dt);
      let z = (this.pz[i] += this.vz[i] * dt);
      const w = this.wob[i];
      if (w > 0) {
        x += Math.sin(age * 3.1 + this.seed[i]) * w;
        z += Math.cos(age * 2.7 + this.seed[i]) * w;
      }
      const t = age / life;
      const r = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * t;
      const g = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * t;
      const b = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * t;
      const a = this.a0[i] + (this.a1[i] - this.a0[i]) * t;
      const s = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      (this.add[i] ? B : A).push(x, y, z, r, g, b, a, s, this.shp[i]);
    }
    this.activeCount = active;
    for (const src of this.sources) {
      src.forEach((x, y, z, r, g, b, a, s, sh, additive) => (additive ? B : A).push(x, y, z, r, g, b, a, s, sh));
    }
    A.flush();
    B.flush();
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.alive[i]) {
        this.alive[i] = 0;
        this.free.push(i);
      }
    }
  }
}
