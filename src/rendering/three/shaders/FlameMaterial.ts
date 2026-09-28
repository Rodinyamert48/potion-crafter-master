// Pixel flame: a camera-facing quad whose fragment shader builds a flame from
// scrolling noise, quantized to a coarse grid and a 4-colour fire ramp.

import * as THREE from 'three';

const VERT = /* glsl */ `
  uniform float uScale;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
    vec3 up = vec3(0.0, 1.0, 0.0);
    float sx = length(modelMatrix[0].xyz);
    float sy = length(modelMatrix[1].xyz);
    vec3 world = center + right * position.x * sx * uScale + up * (position.y + 0.5) * sy * uScale;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSeed;
  uniform vec2 uGrid;
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 uv = (floor(vUv * uGrid) + 0.5) / uGrid;
    float t = uTime * 2.6 + uSeed;
    float n = noise(vec2(uv.x * 4.0 + uSeed, uv.y * 3.0 - t)) * 0.65 + noise(vec2(uv.x * 9.0, uv.y * 7.0 - t * 1.7)) * 0.35;
    float width = mix(0.5, 0.08, pow(uv.y, 0.8));
    float d = abs(uv.x - 0.5 + (n - 0.5) * 0.25 * uv.y);
    float body = 1.0 - smoothstep(width * 0.55, width, d);
    float h = uv.y / max(0.05, uIntensity);
    float f = body * (1.15 - h) + (n - 0.5) * 0.35;
    if (f < 0.18) discard;
    vec3 c = f > 0.8 ? uC0 : f > 0.55 ? uC1 : f > 0.35 ? uC2 : uC3;
    gl_FragColor = vec4(c * 2.2, 1.0);
  }
`;

export interface FlameOptions {
  grid?: [number, number];
  colors?: [string, string, string, string];
  scale?: number;
}

export function createFlameMaterial(o: FlameOptions = {}): THREE.ShaderMaterial {
  const cols = (o.colors ?? ['#fff4b0', '#feae34', '#f77622', '#e43b44']).map((h) => new THREE.Color(h));
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uSeed: { value: Math.random() * 10 },
      uGrid: { value: new THREE.Vector2(...(o.grid ?? [8, 14])) },
      uScale: { value: o.scale ?? 1 },
      uC0: { value: cols[0] },
      uC1: { value: cols[1] },
      uC2: { value: cols[2] },
      uC3: { value: cols[3] },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** A flame mesh (quad anchored at its base). */
export function createFlame(width: number, height: number, o: FlameOptions = {}): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, height);
  const m = new THREE.Mesh(geo, createFlameMaterial(o));
  m.frustumCulled = false;
  m.renderOrder = 30;
  m.userData.noHighlight = true;
  m.userData.noPick = true;
  m.raycast = () => {};
  return m;
}
