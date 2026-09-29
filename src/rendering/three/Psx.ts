// PS1 / PSX style for the "PS1 Horror" graphics setting: vertices snap to a
// coarse screen grid (the famous wobble) and textures are mapped affinely
// (without perspective correction, so they swim and warp like on the
// original hardware). Implemented as a global shader patch on every
// built-in material; toggling it recompiles the materials in the scene.

import * as THREE from 'three';

let enabled = false;

/** Screen grid the vertices snap to (roughly a 320×240 frame). */
const SNAP = /* glsl */ `
  {
    vec2 psxGrid = vec2(160.0, 120.0);
    gl_Position.xy = floor(gl_Position.xy / gl_Position.w * psxGrid + 0.5) / psxGrid * gl_Position.w;
  }
`;

// Affine texturing trick: interpolate uv·w and w, divide per pixel.
const VERT_AFFINE_DECL = /* glsl */ `
#ifdef USE_MAP
  varying vec3 vPsxUv;
#endif
`;
const VERT_AFFINE = /* glsl */ `
#ifdef USE_MAP
  vPsxUv = vec3(vMapUv * gl_Position.w, gl_Position.w);
#endif
`;
const FRAG_AFFINE_DECL = /* glsl */ `
#ifdef USE_MAP
  varying vec3 vPsxUv;
#endif
`;

type Hookable = THREE.Material & {
  onBeforeCompile: (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;
  customProgramCacheKey: () => string;
};

let installed = false;

export function installPsx(): void {
  if (installed) return;
  installed = true;
  const proto = THREE.Material.prototype as Hookable;
  const prevBefore = proto.onBeforeCompile;
  const prevKey = proto.customProgramCacheKey;
  proto.onBeforeCompile = function (this: THREE.Material, shader, renderer) {
    prevBefore.call(this, shader, renderer);
    if (!enabled || (this as THREE.ShaderMaterial).isShaderMaterial) return;
    let v = shader.vertexShader;
    if (!v.includes('#include <project_vertex>')) return;
    // Affine textures only where the standard map UV pipeline is used.
    const affine = v.includes('#include <uv_vertex>') && shader.fragmentShader.includes('#include <map_fragment>');
    if (affine) v = v.replace('void main() {', `${VERT_AFFINE_DECL}\nvoid main() {`);
    v = v.replace('#include <project_vertex>', `#include <project_vertex>\n${SNAP}\n${affine ? VERT_AFFINE : ''}`);
    shader.vertexShader = v;
    if (affine) {
      const chunk = THREE.ShaderChunk.map_fragment.replace(/vMapUv/g, '(vPsxUv.xy / vPsxUv.z)');
      let f = shader.fragmentShader;
      f = f.replace('void main() {', `${FRAG_AFFINE_DECL}\nvoid main() {`);
      f = f.replace('#include <map_fragment>', chunk);
      shader.fragmentShader = f;
    }
  };
  proto.customProgramCacheKey = function (this: THREE.Material) {
    return `${prevKey.call(this)}${enabled ? '|psx' : ''}`;
  };
}

export function psxEnabled(): boolean {
  return enabled;
}

/** Switch the look and recompile every material in the scene. */
export function setPsx(scene: THREE.Scene, on: boolean): void {
  installPsx();
  if (enabled === on) return;
  enabled = on;
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
  });
}
