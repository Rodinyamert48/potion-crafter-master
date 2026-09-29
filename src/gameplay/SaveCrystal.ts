// A floating save crystal in the back corner of the shop, the classic
// fantasy RPG touch: it hovers and turns above a glowing rune circle, sheds
// sparkles, and touching it saves the game.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import { Entity, type HoverInfo } from '../world/Entity';
import { Painter } from '../rendering/three/textures/Painter';
import { toon, toonUnique } from '../rendering/three/materials';
import { mesh } from '../rendering/three/models/common';
import { t } from '../core/i18n';

function runeCircleTexture(): THREE.CanvasTexture {
  const n = 64;
  const p = new Painter(n, n, 17);
  const c = n / 2 - 0.5;
  const col = '#9fe8ff';
  p.ring(c, c, 30, col);
  p.ring(c, c, 27, col, 0.7);
  p.ring(c, c, 15, col, 0.8);
  // Two interlaced triangles
  for (const off of [0, Math.PI]) {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 3; i++) {
      const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2;
      pts.push([c + Math.cos(a) * 26, c + Math.sin(a) * 26]);
    }
    for (let i = 0; i < 3; i++) p.line(pts[i][0], pts[i][1], pts[(i + 1) % 3][0], pts[(i + 1) % 3][1], col, 0.8);
  }
  // Rune ticks between the outer rings
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = c + Math.cos(a) * 28.5;
    const y = c + Math.sin(a) * 28.5;
    p.px(x, y, '#ffffff');
    if (i % 2 === 0) p.px(x + Math.cos(a + 1.57), y + Math.sin(a + 1.57), col);
  }
  return p.texture({ mipmaps: false });
}

export class SaveCrystal extends Entity {
  readonly kind = 'crystal';
  private readonly crystal = new THREE.Group();
  private readonly circle: THREE.Mesh;
  private readonly circleMat: THREE.MeshBasicMaterial;
  private readonly crystalMat: THREE.MeshToonMaterial;
  private t = 0;
  private pulse = 0;

  constructor(pos: THREE.Vector3) {
    super();
    this.object.position.copy(pos);
    // Stone plinth
    const stone = toon({ color: '#5a6988' });
    const plinth = mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.22, 8), stone);
    plinth.position.y = 0.11;
    this.object.add(plinth);
    const cap = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.04, 8), toon({ color: '#8b9bb4' }));
    cap.position.y = 0.24;
    this.object.add(cap);
    // The crystal: an elongated octahedron with a bright core
    this.crystalMat = toonUnique({ color: '#5ab0ff', emissive: '#2f7cff', emissiveIntensity: 0.9, transparent: true, opacity: 0.9 });
    const outer = mesh(new THREE.OctahedronGeometry(0.2, 0), this.crystalMat);
    outer.scale.set(0.75, 1.7, 0.75);
    this.crystal.add(outer);
    const core = mesh(new THREE.OctahedronGeometry(0.07, 0), toon({ color: '#ffffff', emissive: '#bfe8ff', emissiveIntensity: 1.4 }), { cast: false });
    core.scale.set(1, 1.8, 1);
    this.crystal.add(core);
    this.crystal.position.y = 0.78;
    this.object.add(this.crystal);
    // Glowing rune circle on the floor
    this.circleMat = new THREE.MeshBasicMaterial({
      map: runeCircleTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: '#6fd0ff',
    });
    this.circle = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), this.circleMat);
    this.circle.rotation.x = -Math.PI / 2;
    this.circle.position.y = 0.012;
    this.circle.renderOrder = 2;
    this.circle.userData.noPick = true;
    this.circle.raycast = () => {};
    this.object.add(this.circle);
  }

  override hover(): HoverInfo {
    return { title: t('obj.crystal'), hint: t('hint.crystal') };
  }

  override cursor() {
    return 'point' as const;
  }

  override press(ctx: GameContext) {
    this.pulse = 1;
    ctx.audio.play('chime', { x: this.object.position.x });
    ctx.audio.play('sparkle', { x: this.object.position.x, delay: 0.15 });
    const c = this.crystal.getWorldPosition(new THREE.Vector3());
    ctx.vfx.stars(c, '#9fe8ff', 30);
    ctx.vfx.runes(this.object.position.clone().setY(0.1), '#6fd0ff', 6, 0.55);
    ctx.bus.emit('crystal:touched', {});
    return null;
  }

  override update(ctx: GameContext, dt: number): void {
    this.t += dt;
    this.pulse = Math.max(0, this.pulse - dt * 1.2);
    this.crystal.position.y = 0.8 + Math.sin(this.t * 1.6) * 0.05;
    this.crystal.rotation.y += dt * (0.8 + this.pulse * 6);
    const glow = 0.75 + 0.25 * Math.sin(this.t * 2.3) + this.pulse * 1.5;
    this.crystalMat.emissiveIntensity = glow;
    this.circle.rotation.z -= dt * 0.25;
    this.circleMat.opacity = 0.55 + 0.25 * Math.sin(this.t * 1.3) + this.pulse * 0.4;
    // Sparkles drifting up from the crystal
    const c = this.crystal.getWorldPosition(_v);
    ctx.vfx.rate('crystal-motes', 2.2, dt, () => ctx.vfx.mote({ x: c.x, y: c.y - 0.3, z: c.z }, '#9fe8ff', 0.35));
  }
}

const _v = new THREE.Vector3();
