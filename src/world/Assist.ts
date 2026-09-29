// Handling assists for carried items: magnetic drop targets (cauldron,
// hearth, cutting board, mortar, counter, potion shelf) that pull a held
// item over the right spot, show a glowing ring and make the drop land
// where it should, plus a marker on the surface below whatever is carried.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { Entity } from './Entity';
import { t } from '../core/i18n';

export interface AssistTarget {
  id: string;
  /** Does this target want the held entity right now? */
  accepts(ctx: GameContext, e: Entity): boolean;
  /** Where the item should go (item centre is placed `hover` above it). */
  point(ctx: GameContext, e: Entity): THREE.Vector3 | null;
  /** Horizontal distance at which the pull starts. */
  radius: number;
  /** Height above the point to hold the item while snapped. */
  hover: number;
  /** Hint shown while snapped. */
  hint: string;
  /** Release while snapped: nudge the item so it lands on target. */
  drop?(ctx: GameContext, e: Entity): void;
}

const dropStraight = (ctx: GameContext, e: Entity) => {
  void ctx;
  e.body?.setLinearVelocity({ x: 0, y: -1.2, z: 0 });
  e.body?.setAngularVelocity({ x: 0, y: 0, z: 0 });
};

export function defaultAssistTargets(): AssistTarget[] {
  return [
    {
      id: 'cauldron',
      accepts: (_ctx, e) => e.kind === 'ingredient',
      point: (ctx) => ctx.shop.cauldron.center.clone().setY(ctx.shop.cauldron.rimY),
      radius: 0.8,
      hover: 0.32,
      hint: 'assist.cauldron',
      drop: dropStraight,
    },
    {
      id: 'pour',
      accepts: (ctx, e) => e.kind === 'bucket' && (e as unknown as { water: number }).water > 0.05 && ctx.shop.cauldron.chem.water < 2.2,
      point: (ctx) => ctx.shop.cauldron.center.clone().setY(ctx.shop.cauldron.rimY),
      radius: 0.8,
      hover: 0.42,
      hint: 'assist.pour',
    },
    {
      id: 'hearth',
      accepts: (_ctx, e) => e.kind === 'log',
      point: (ctx) => ctx.shop.hearth.center.clone().add(new THREE.Vector3(0, 0.12, 0.7)),
      radius: 0.75,
      hover: 0.25,
      hint: 'assist.hearth',
      drop: dropStraight,
    },
    {
      id: 'board',
      accepts: (ctx, e) => e.kind === 'ingredient' && ctx.shop.board.itemsOn(ctx).length < 3,
      point: (ctx) => ctx.shop.board.object.position.clone().setY(ctx.shop.board.topY),
      radius: 0.5,
      hover: 0.14,
      hint: 'assist.board',
      drop: dropStraight,
    },
    {
      id: 'mortar',
      accepts: (_ctx, e) => e.kind === 'ingredient',
      point: (ctx) => ctx.shop.mortar.object.position.clone().setY(ctx.shop.mortar.top),
      radius: 0.3,
      hover: 0.18,
      hint: 'assist.mortar',
      drop: dropStraight,
    },
    {
      id: 'serve',
      accepts: (_ctx, e) => e.kind === 'flask' && !!(e as unknown as { potion: unknown }).potion,
      point: (ctx) => {
        const z = ctx.shop.anchors.serveZone;
        return new THREE.Vector3((z.minX + z.maxX) / 2, z.y, (z.minZ + z.maxZ) / 2);
      },
      radius: 0.7,
      hover: 0.12,
      hint: 'assist.serve',
      drop: dropStraight,
    },
    {
      id: 'shelf',
      accepts: (_ctx, e) => e.kind === 'flask' && !!(e as unknown as { potion: unknown }).potion,
      point: (ctx, e) => {
        // The nearest free slot.
        const shelf = ctx.shop.shelf;
        const taken = new Set(shelf.potions().map((f) => f.slot));
        let best: THREE.Vector3 | null = null;
        let bestD = Infinity;
        shelf.slots.forEach((s, i) => {
          if (taken.has(i)) return;
          const d = s.distanceToSquared(e.object.position);
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        });
        return best ? (best as THREE.Vector3).clone() : null;
      },
      radius: 0.3,
      hover: 0.08,
      hint: 'assist.shelf',
    },
  ];
}

/** Floor marker under the carried item and the pulsing ring on a target. */
export class AssistVisuals {
  readonly marker: THREE.Mesh;
  readonly ring: THREE.Mesh;
  private t = 0;

  constructor(scene: THREE.Scene) {
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.085, 16),
      new THREE.MeshBasicMaterial({ color: '#181425', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 4;
    this.marker.visible = false;
    this.marker.userData.noPick = true;
    this.marker.raycast = () => {};
    scene.add(this.marker);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.2, 24),
      new THREE.MeshBasicMaterial({ color: '#fee761', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 5;
    this.ring.visible = false;
    this.ring.userData.noPick = true;
    this.ring.raycast = () => {};
    scene.add(this.ring);
  }

  update(dt: number, surface: THREE.Vector3 | null, target: THREE.Vector3 | null, strength: number): void {
    this.t += dt;
    this.marker.visible = !!surface;
    if (surface) this.marker.position.set(surface.x, surface.y + 0.008, surface.z);
    this.ring.visible = !!target && strength > 0.05;
    if (target) {
      this.ring.position.set(target.x, target.y + 0.012, target.z);
      const s = 1 + 0.12 * Math.sin(this.t * 8);
      this.ring.scale.setScalar(s * (0.7 + 0.5 * strength));
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.55 * strength;
    }
  }
}

export function assistHint(target: AssistTarget | null): string | null {
  if (!target) return null;
  const touchKey = `${target.hint}Touch`;
  return t(document.documentElement.classList.contains('touch') && t(touchKey) !== touchKey ? touchKey : target.hint);
}
