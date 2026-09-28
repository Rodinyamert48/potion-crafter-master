// Cauldron brew surface. Pixel-quantized polar noise that swirls with the
// ladle, bubbles with heat, foams on reactions, spirals into a vortex and
// glows with the potion's colour.

import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uSwirl;
  uniform float uSwirlSpeed;
  uniform float uBubbles;
  uniform float uFoam;
  uniform float uGlow;
  uniform float uVortex;
  uniform float uDark;
  uniform float uGrid;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) { v += noise(p) * a; p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = (floor(vUv * uGrid) + 0.5) / uGrid * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float sa = a + uSwirl + (1.0 - r) * uVortex * 7.0;
    vec2 q = vec2(cos(sa), sin(sa)) * r;
    float n = fbm(q * 2.6 + vec2(uTime * 0.07, -uTime * 0.09));
    float band = floor((n * 0.75 + (1.0 - r) * 0.35) * 4.0) / 4.0;
    vec3 col = mix(uColorA * 0.55, uColorB, band);

    // Stirring streaks
    float streak = step(0.93, sin(sa * 3.0 + r * 9.0 - uTime * 1.5)) * clamp(abs(uSwirlSpeed) * 0.25 + uVortex, 0.0, 1.0);
    col = mix(col, uColorB * 1.35 + 0.1, streak * 0.8);

    // Bubbles: popping rings in a jittered cell grid
    vec2 g = (p + 1.0) * 4.0;
    vec2 cell = floor(g);
    vec2 fc = fract(g) - 0.5;
    float h = hash(cell);
    float life = fract(uTime * (0.3 + h * 0.6) + h * 7.0);
    float rad = life * 0.42;
    float ring = abs(length(fc - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.3) - rad);
    float bubble = step(ring, 0.07) * step(h, uBubbles) * step(life, 0.85);
    col = mix(col, mix(uColorB, vec3(1.0), 0.45), bubble);

    // Foam creeping from the rim
    float foam = smoothstep(1.0 - uFoam * 0.9, 1.0 - uFoam * 0.9 + 0.12, r + (n - 0.5) * 0.35);
    col = mix(col, vec3(0.93, 0.95, 0.9), foam * clamp(uFoam * 1.4, 0.0, 1.0));

    col = mix(col, vec3(0.06, 0.05, 0.07), uDark);
    // Rim darkening for depth
    col *= 1.0 - smoothstep(0.8, 1.0, r) * 0.35;
    gl_FragColor = vec4(col * (1.0 + uGlow * 1.6), 1.0);
  }
`;

export function createLiquidMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color('#3b6f9e') },
      uColorB: { value: new THREE.Color('#6fa8d6') },
      uSwirl: { value: 0 },
      uSwirlSpeed: { value: 0 },
      uBubbles: { value: 0 },
      uFoam: { value: 0 },
      uGlow: { value: 0.1 },
      uVortex: { value: 0 },
      uDark: { value: 0 },
      uGrid: { value: 40 },
    },
  });
}
