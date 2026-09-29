// Low resolution render pipeline:
//   scene → low-res HDR target (+depth) → bloom (bright pass + blur)
//   → composite (depth outlines, bloom, grading, ordered dither) → canvas.
// The canvas is upscaled by CSS with `image-rendering: pixelated`, giving
// crisp, consistent pixels without over-pixelating the 3D world.

import * as THREE from 'three';
import { RETRO_PALETTE } from '../../data/palette';

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform vec2 uTexel;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tColor, vUv + uTexel * vec2(-0.5, -0.5)).rgb;
    c += texture2D(tColor, vUv + uTexel * vec2(0.5, -0.5)).rgb;
    c += texture2D(tColor, vUv + uTexel * vec2(-0.5, 0.5)).rgb;
    c += texture2D(tColor, vUv + uTexel * vec2(0.5, 0.5)).rgb;
    c *= 0.25;
    float l = max(c.r, max(c.g, c.b));
    float k = smoothstep(uThreshold, uThreshold + 0.45, l);
    gl_FragColor = vec4(c * k, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tInput, vUv).rgb * 0.227027;
    s += texture2D(tInput, vUv + uDir * 1.3846).rgb * 0.316216;
    s += texture2D(tInput, vUv - uDir * 1.3846).rgb * 0.316216;
    s += texture2D(tInput, vUv + uDir * 3.2307).rgb * 0.070270;
    s += texture2D(tInput, vUv - uDir * 3.2307).rgb * 0.070270;
    gl_FragColor = vec4(s, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tBloom;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uOutline;
  uniform vec3 uOutlineColor;
  uniform float uBloom;
  uniform vec3 uTint;
  uniform float uFlash;
  uniform vec3 uFlashColor;
  uniform float uVignette;
  uniform float uSaturation;
  uniform float uContrast;
  uniform float uBrightness;
  uniform float uLevels;
  uniform float uRetro;
  uniform float uPsx;
  uniform float uTime;
  uniform vec3 uPalette[32];
  varying vec2 vUv;

  float linDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

  vec3 toSRGB(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
  }

  vec3 softClip(vec3 c) {
    vec3 over = max(c - 0.8, 0.0);
    return min(c, vec3(0.8)) + (1.0 - exp(-over * 4.0)) * 0.2;
  }

  void main() {
    vec3 col = texture2D(tColor, vUv).rgb;

    // Depth silhouette outlines drawn on the nearer object.
    float dC = linDepth(texture2D(tDepth, vUv).x);
    float dL = linDepth(texture2D(tDepth, vUv - vec2(uTexel.x, 0.0)).x);
    float dR = linDepth(texture2D(tDepth, vUv + vec2(uTexel.x, 0.0)).x);
    float dU = linDepth(texture2D(tDepth, vUv + vec2(0.0, uTexel.y)).x);
    float dD = linDepth(texture2D(tDepth, vUv - vec2(0.0, uTexel.y)).x);
    float diff = max(max(dL - dC, dR - dC), max(dU - dC, dD - dC));
    float edge = step(0.045 * dC + 0.03, diff) * step(dC, uFar * 0.9);
    col = mix(col, col * 0.32 + uOutlineColor * 0.22, edge * uOutline);

    col += texture2D(tBloom, vUv).rgb * uBloom;
    col = softClip(col);

    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, uSaturation);
    col = max((col - 0.18) * uContrast + 0.18 + uBrightness, 0.0);
    col *= uTint;
    vec2 q = vUv - 0.5;
    col *= 1.0 - dot(q, q) * uVignette;
    col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
    col = clamp(col, 0.0, 1.0);

    if (uRetro > 0.5) {
      // Dark Fantasy grade: cold steel shadows, candle-gold highlights,
      // muted midtones that let reds and witch-fire glow stand out, and a
      // heavy vignette like a torch-lit crypt.
      float lr = dot(col, vec3(0.299, 0.587, 0.114));
      float warm = smoothstep(0.35, 0.95, lr);
      vec3 muted = mix(vec3(lr), col, 0.72);
      // Keep the strong hues (blood, fire, magic) saturated.
      float chroma = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
      col = mix(muted, col, smoothstep(0.25, 0.6, chroma));
      col = mix(col * vec3(0.72, 0.8, 1.02), col, smoothstep(0.02, 0.4, lr));
      col = mix(col, col * vec3(1.12, 0.98, 0.78), warm);
      col = pow(max(col, 0.0), vec3(1.12));
      vec2 qr = vUv - 0.5;
      col *= 1.0 - dot(qr, qr) * 0.55;
      col = clamp(col, 0.0, 1.0);
    }

    vec3 s = toSRGB(col);
    float b = bayer4(gl_FragCoord.xy) - 0.5;
    // PS1: 15-bit colour with a strong ordered dither.
    float levels = uPsx > 0.5 ? 31.0 : uLevels;
    s = clamp(floor(s * levels + 0.5 + b * (uPsx > 0.5 ? 1.15 : 0.9)) / levels, 0.0, 1.0);

    if (uRetro > 0.5) {
      // Snap to the Dark Fantasy palette with an ordered dither between
      // the nearest colours.
      vec3 g = clamp(s + b * 0.07, 0.0, 1.0);
      float best = 1e9;
      vec3 pick = g;
      for (int i = 0; i < 32; i++) {
        vec3 d = g - uPalette[i];
        float dd = dot(d, d * vec3(1.0, 1.25, 0.75));
        if (dd < best) { best = dd; pick = uPalette[i]; }
      }
      s = mix(s, pick, uRetro);
    }
    gl_FragColor = vec4(s, 1.0);
  }
`;

export interface GradeState {
  tint: THREE.Color;
  flash: number;
  flashColor: THREE.Color;
  saturation: number;
  contrast: number;
  brightness: number;
  vignette: number;
}

export class PixelPipeline {
  private rtScene: THREE.WebGLRenderTarget;
  private rtBloomA: THREE.WebGLRenderTarget;
  private rtBloomB: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly brightMat: THREE.ShaderMaterial;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly compositeMat: THREE.ShaderMaterial;
  bloomEnabled = true;
  /** Blur iterations of the bloom (wider glow on high quality). */
  bloomPasses = 2;
  bloomStrength = 0.8;
  readonly grade: GradeState = {
    tint: new THREE.Color(1, 1, 1),
    flash: 0,
    flashColor: new THREE.Color(1, 0.95, 0.85),
    saturation: 1.12,
    contrast: 1.06,
    brightness: 0.0,
    vignette: 0.55,
  };

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.rtScene = this.makeSceneTarget(2, 2);
    this.rtBloomA = this.makeTarget(1, 1);
    this.rtBloomB = this.makeTarget(1, 1);

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BRIGHT_FRAG,
      uniforms: { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.78 } },
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    const palette = RETRO_PALETTE.map((h) => new THREE.Color(h));
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tBloom: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uOutline: { value: 1 },
        uOutlineColor: { value: new THREE.Color('#181425') },
        uBloom: { value: 0.75 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
        uVignette: { value: 0.55 },
        uSaturation: { value: 1.1 },
        uContrast: { value: 1.05 },
        uBrightness: { value: 0 },
        uLevels: { value: 40 },
        uRetro: { value: 0 },
        uPsx: { value: 0 },
        uTime: { value: 0 },
        uPalette: { value: palette.map((c) => new THREE.Vector3(c.r, c.g, c.b)) },
      },
      depthTest: false,
      depthWrite: false,
    });
    // Palette colours are defined in sRGB; the shader compares in sRGB space.
    const pal = this.compositeMat.uniforms.uPalette.value as THREE.Vector3[];
    RETRO_PALETTE.forEach((h, i) => {
      const c = new THREE.Color();
      c.setStyle(h, THREE.NoColorSpace);
      pal[i].set(c.r, c.g, c.b);
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private makeSceneTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    rt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    rt.depthTexture.minFilter = THREE.NearestFilter;
    rt.depthTexture.magFilter = THREE.NearestFilter;
    return rt;
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
  }

  setSize(w: number, h: number): void {
    this.rtScene.dispose();
    this.rtScene = this.makeSceneTarget(w, h);
    const bw = Math.max(1, Math.floor(w / 2));
    const bh = Math.max(1, Math.floor(h / 2));
    this.rtBloomA.setSize(bw, bh);
    this.rtBloomB.setSize(bw, bh);
    (this.compositeMat.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
    (this.brightMat.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  set retro(v: number) {
    this.compositeMat.uniforms.uRetro.value = v;
  }

  set psx(v: number) {
    this.compositeMat.uniforms.uPsx.value = v;
  }

  set outline(v: number) {
    this.compositeMat.uniforms.uOutline.value = v;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    const u = this.compositeMat.uniforms;
    if (this.bloomEnabled) {
      this.brightMat.uniforms.tColor.value = this.rtScene.texture;
      this.pass(this.brightMat, this.rtBloomA);
      const bw = this.rtBloomA.width;
      const bh = this.rtBloomA.height;
      const dir = this.blurMat.uniforms.uDir.value as THREE.Vector2;
      for (let i = 0; i < this.bloomPasses; i++) {
        const spread = i === 0 ? 1 : i === 1 ? 2 : 3.5;
        this.blurMat.uniforms.tInput.value = this.rtBloomA.texture;
        dir.set(spread / bw, 0);
        this.pass(this.blurMat, this.rtBloomB);
        this.blurMat.uniforms.tInput.value = this.rtBloomB.texture;
        dir.set(0, spread / bh);
        this.pass(this.blurMat, this.rtBloomA);
      }
      u.tBloom.value = this.rtBloomA.texture;
      u.uBloom.value = this.bloomStrength;
    } else {
      u.tBloom.value = this.rtBloomA.texture;
      u.uBloom.value = 0;
    }

    u.tColor.value = this.rtScene.texture;
    u.tDepth.value = this.rtScene.depthTexture;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    const g = this.grade;
    (u.uTint.value as THREE.Color).copy(g.tint);
    u.uFlash.value = g.flash;
    (u.uFlashColor.value as THREE.Color).copy(g.flashColor);
    u.uSaturation.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uBrightness.value = g.brightness;
    u.uVignette.value = g.vignette;
    u.uTime.value = performance.now() / 1000;
    this.pass(this.compositeMat, null);
  }
}
