// Liquid inside a flask: the fragment shader clips everything above a world
// space plane, so the surface stays level (and sloshes) while the bottle tilts.
// Back faces are drawn as the flat top surface of the liquid.

import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform vec3 uCenter;
  uniform float uLevel;
  uniform vec2 uTilt;
  uniform float uGlow;
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec2 d = vWorld.xz - uCenter.xz;
    float surface = uLevel + dot(d, uTilt) + sin(uTime * 3.0 + vWorld.x * 30.0) * 0.002;
    if (vWorld.y > surface) discard;
    vec3 c;
    if (gl_FrontFacing) {
      float shade = 0.65 + 0.35 * clamp(dot(vNormal, normalize(vec3(-0.4, 0.8, 0.5))), 0.0, 1.0);
      float depth = clamp((surface - vWorld.y) * 12.0, 0.0, 1.0);
      c = mix(uColor2, uColor, depth) * shade;
    } else {
      c = mix(uColor, uColor2, 0.5) * 1.15;
    }
    gl_FragColor = vec4(c * (1.0 + uGlow), 1.0);
  }
`;

export function createBottleLiquidMaterial(color: string, color2: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uColor2: { value: new THREE.Color(color2) },
      uCenter: { value: new THREE.Vector3() },
      uLevel: { value: 0 },
      uTilt: { value: new THREE.Vector2() },
      uGlow: { value: 0.4 },
      uTime: { value: 0 },
    },
    side: THREE.DoubleSide,
  });
}
