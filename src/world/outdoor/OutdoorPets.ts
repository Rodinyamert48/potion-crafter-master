// Pets that came along: pixel-art billboards hopping after the apprentice.
// While walking they trail behind; stand still for a moment and they
// gather in front of you so you can see them. The dog barks when it smells
// something, the cat hisses at danger, the slime just bounces happily.

import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import { PixelSprite } from '../../rendering/three/sprites/PixelSprite';
import { catSheetFor } from '../../gameplay/Atmosphere';
import { dogSheetFor, slimeSheetFor } from '../../gameplay/Pets';
import type { PetId } from '../../ui/minigames';
import { WATER_Y } from './layout';

interface Follower {
  id: PetId;
  name: string;
  sprite: PixelSprite;
  pos: THREE.Vector3;
  behind: THREE.Vector2;
  front: THREE.Vector2;
  hopT: number;
  mood: number;
}

export class OutdoorPets {
  readonly list: Follower[] = [];
  private idle = 0;
  private readonly root = new THREE.Group();

  constructor(
    scene: THREE.Scene,
    private readonly ctx: GameContext,
    ids: PetId[],
    start: THREE.Vector3,
  ) {
    scene.add(this.root);
    const s = ctx.state;
    const specs: Record<PetId, { sheet: () => ReturnType<typeof catSheetFor>; scale: number; name: string; behind: [number, number]; front: [number, number] }> = {
      cat: { sheet: () => catSheetFor(s.cat), scale: 0.78, name: s.cat.name, behind: [1.3, 1.8], front: [1.5, -3.9] },
      dog: { sheet: () => dogSheetFor(s.pets.dog), scale: 0.66, name: s.pets.dog.name, behind: [-1.3, 1.6], front: [-1.5, -4.0] },
      slime: { sheet: () => slimeSheetFor(s.pets.slime), scale: 0.72, name: s.pets.slime.name, behind: [0, 2.4], front: [0, -4.6] },
    };
    for (const id of ids) {
      const sp = specs[id];
      const sprite = new PixelSprite(sp.sheet(), sp.scale);
      sprite.play(id === 'cat' ? 'awake' : id === 'dog' ? 'wag' : 'idle');
      this.root.add(sprite.root);
      const pos = start.clone().add(new THREE.Vector3(sp.behind[0], 0, -sp.behind[1] + 1));
      this.list.push({ id, name: sp.name, sprite, pos, behind: new THREE.Vector2(...sp.behind), front: new THREE.Vector2(...sp.front), hopT: Math.random() * 6, mood: 0 });
    }
  }

  has(id: PetId): boolean {
    return this.list.some((p) => p.id === id);
  }

  get(id: PetId): Follower | undefined {
    return this.list.find((p) => p.id === id);
  }

  /** A little reaction (bark, hiss, bounce) for a moment. */
  react(id: PetId, seconds = 1.6): void {
    const p = this.get(id);
    if (!p) return;
    p.mood = seconds;
    const x = 0;
    if (id === 'dog') for (let i = 0; i < 2; i++) this.ctx.audio.play('bark', { pitch: 1.35, volume: 0.45, delay: i * 0.35, x });
    else if (id === 'cat') this.ctx.audio.play('hissCat', { volume: 0.5, x });
    else this.ctx.audio.play('squish', { volume: 0.4, pitch: 1.4, x });
  }

  teleport(to: THREE.Vector3, yaw: number): void {
    for (const p of this.list) {
      const o = this.offset(p.behind, yaw);
      p.pos.set(to.x + o.x, to.y, to.z + o.y);
    }
  }

  private offset(v: THREE.Vector2, yaw: number): THREE.Vector2 {
    // Local (right, back) → world (x, z) for a player facing `yaw`.
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return new THREE.Vector2(v.x * c + v.y * s, -v.x * s + v.y * c);
  }

  update(dt: number, player: THREE.Vector3, yaw: number, moving: boolean, camera: THREE.Camera, ground: (x: number, z: number) => number): void {
    this.idle = moving ? 0 : this.idle + dt;
    const gather = this.idle > 1.4;
    for (const p of this.list) {
      const o = this.offset(gather ? p.front : p.behind, yaw);
      const tx = player.x + o.x;
      const tz = player.z + o.y;
      const dx = tx - p.pos.x;
      const dz = tz - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 30) {
        p.pos.set(tx, p.pos.y, tz);
      } else if (d > 0.15) {
        const sp = Math.min(d * 3.2, 10) * dt;
        p.pos.x += (dx / d) * Math.min(sp, d);
        p.pos.z += (dz / d) * Math.min(sp, d);
      }
      const walking = d > 0.4;
      p.pos.y = Math.max(ground(p.pos.x, p.pos.z), WATER_Y + 0.02);
      p.hopT += dt * (walking ? 11 : 3);
      p.mood = Math.max(0, p.mood - dt);
      const s = p.sprite;
      s.hop = walking ? Math.abs(Math.sin(p.hopT)) * (p.id === 'slime' ? 0.22 : 0.12) : p.id === 'slime' ? Math.abs(Math.sin(p.hopT)) * 0.03 : 0;
      let anim: string;
      if (p.id === 'cat') anim = p.mood > 0 ? 'hiss' : 'awake';
      else if (p.id === 'dog') anim = p.mood > 0 || walking ? 'pant' : 'wag';
      else anim = walking || p.mood > 0 ? 'hop' : 'idle';
      if (s.current !== anim || (anim === 'hop' && s.finished)) s.play(anim, anim === 'hop');
      if (Math.abs(dx) > 0.05) s.facing = dx > 0 ? 1 : -1;
      s.root.position.copy(p.pos);
      s.update(dt, camera);
    }
  }

  dispose(): void {
    for (const p of this.list) p.sprite.dispose();
    this.root.removeFromParent();
    this.list.length = 0;
  }
}
