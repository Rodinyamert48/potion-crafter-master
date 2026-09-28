// The view through the shop window: a pixelated sky gradient with drifting
// clouds, a sun or moon, and twinkling stars at night.

import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform float uNight;
  uniform vec2 uSun;
  uniform vec3 uSunColor;
  uniform vec2 uGrid;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    vec2 uv = (floor(vUv * uGrid) + 0.5) / uGrid;
    float t = floor(uv.y * 6.0) / 6.0;
    vec3 col = mix(uBottom, uTop, t);
    // hills silhouette
    float hill = 0.18 + noise(vec2(uv.x * 3.0, 1.0)) * 0.12 + noise(vec2(uv.x * 9.0, 4.0)) * 0.04;
    // clouds
    float c = noise(vec2(uv.x * 3.0 + uTime * 0.01, uv.y * 5.0)) * noise(vec2(uv.x * 7.0 - uTime * 0.015, uv.y * 9.0));
    if (c > 0.32 && uv.y > 0.45) col = mix(col, mix(vec3(1.0), uTop, uNight * 0.7), 0.55);
    // sun / moon
    float d = length((uv - uSun) * vec2(1.6, 1.0));
    if (d < 0.09) col = uSunColor * (1.6 - uNight * 0.3);
    else if (d < 0.14) col = mix(col, uSunColor, 0.35);
    // stars
    vec2 sc = floor(uv * vec2(40.0, 30.0));
    float s = hash(sc);
    if (s > 0.975 && uv.y > hill + 0.05) {
      float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 50.0);
      col = mix(col, vec3(1.0, 1.0, 0.9) * 1.4, uNight * tw);
    }
    if (uv.y < hill) col = mix(vec3(0.1, 0.16, 0.14), vec3(0.2, 0.34, 0.22), 1.0 - uNight) * (0.7 + 0.3 * step(hill - 0.03, uv.y));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uTop: { value: new THREE.Color('#5fa8e8') },
      uBottom: { value: new THREE.Color('#cfe8ff') },
      uNight: { value: 0 },
      uSun: { value: new THREE.Vector2(0.3, 0.7) },
      uSunColor: { value: new THREE.Color('#fff4b0') },
      uGrid: { value: new THREE.Vector2(48, 40) },
    },
  });
}

const SKY_KEYS: Array<{ h: number; top: string; bottom: string; sun: string }> = [
  { h: 0, top: '#0b0f2a', bottom: '#1f2550', sun: '#dfe8ff' },
  { h: 5.5, top: '#0b0f2a', bottom: '#1f2550', sun: '#dfe8ff' },
  { h: 7, top: '#6a78c0', bottom: '#ffb38a', sun: '#ffd08a' },
  { h: 9, top: '#5fa8e8', bottom: '#cfe8ff', sun: '#fff4b0' },
  { h: 16, top: '#4f98dc', bottom: '#d8ecff', sun: '#fff4b0' },
  { h: 19, top: '#6a5aa8', bottom: '#ff8a5a', sun: '#ffb35a' },
  { h: 20.5, top: '#2a2a5a', bottom: '#8a4a7a', sun: '#ff8a5a' },
  { h: 22, top: '#0b0f2a', bottom: '#1f2550', sun: '#dfe8ff' },
  { h: 24, top: '#0b0f2a', bottom: '#1f2550', sun: '#dfe8ff' },
];

const ta = new THREE.Color();
const tb = new THREE.Color();

export function updateSky(mat: THREE.ShaderMaterial, hour: number, night: number, time: number): void {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < SKY_KEYS.length - 1 && SKY_KEYS[i + 1].h <= h) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[Math.min(SKY_KEYS.length - 1, i + 1)];
  const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
  const u = mat.uniforms;
  (u.uTop.value as THREE.Color).copy(ta.set(a.top)).lerp(tb.set(b.top), t);
  (u.uBottom.value as THREE.Color).copy(ta.set(a.bottom)).lerp(tb.set(b.bottom), t);
  (u.uSunColor.value as THREE.Color).copy(ta.set(a.sun)).lerp(tb.set(b.sun), t);
  u.uNight.value = night;
  const dayT = Math.min(1, Math.max(0, (h - 6) / 15));
  if (night < 0.5) (u.uSun.value as THREE.Vector2).set(0.1 + dayT * 0.8, 0.3 + Math.sin(dayT * Math.PI) * 0.55);
  else (u.uSun.value as THREE.Vector2).set(0.7, 0.75);
  u.uTime.value = time;
}
