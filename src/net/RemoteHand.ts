// Another player's hand on the host: a virtual pointer and keyboard driven
// by the guest's messages, its own Interaction (hover, grabs, pouring,
// slicing…) and a camera copying the guest's view, so its rays go exactly
// where the guest points on their screen.

import * as THREE from 'three';
import type { GameContext, PanelName, UIHooks } from '../core/GameContext';
import { Input } from '../core/Input';
import { Interaction } from '../world/Interaction';
import type { CursorKind, HoverInfo } from '../world/Entity';
import type { GuestMsg, InputState } from './Protocol';

/** Panels a guest's hand may open – on the guest's own screen. */
export const GUEST_PANELS: ReadonlySet<string> = new Set<PanelName>(['book', 'catalog', 'inventory', 'achievements', 'merchant', 'king']);

/** What the hand's gameplay code sees as "the UI": cursor and hint are
 *  kept for the guest, speech and floating text go to the real UI (and from
 *  there to everyone), panels are asked for on the guest's screen. */
class HandUI implements UIHooks {
  cursor: CursorKind = 'default';
  hint: string | null = null;
  /** Panels asked for since the last frame. */
  readonly requests: PanelName[] = [];

  constructor(private readonly real: UIHooks) {}

  setCursor(kind: CursorKind): void {
    this.cursor = kind;
  }

  tooltip(_info: HoverInfo | null): void {}

  setHint(text: string | null): void {
    this.hint = text;
  }

  say(anchor: THREE.Object3D, text: string, opts?: { name?: string; duration?: number; mood?: string; offsetY?: number }): number {
    return this.real.say(anchor, text, opts);
  }

  removeBubble(id: number): void {
    this.real.removeBubble(id);
  }

  floatText(world: THREE.Vector3, text: string, color?: string): void {
    this.real.floatText(world, text, color);
  }

  openPanel(panel: PanelName | null): void {
    if (panel) this.requests.push(panel);
  }

  isPanelOpen(_panel: PanelName): boolean {
    return false;
  }

  get panelOpen(): boolean {
    return false;
  }
}

const tmpV = new THREE.Vector3();

export class RemoteHand {
  readonly input = new Input(null);
  readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  readonly ui: HandUI;
  readonly interaction: Interaction;
  /** The guest's viewport (CSS px). */
  w = 960;
  h = 540;
  /** Messages waiting for the next frame. */
  readonly queue: GuestMsg[] = [];
  /** Last hand info sent (to send only changes). */
  lastInfo = '';
  private clockOffset = Infinity;
  private seen = false;

  constructor(
    ctx: GameContext,
    readonly playerId: number,
  ) {
    this.ui = new HandUI(ctx.ui);
    this.interaction = new Interaction(ctx, { input: this.input, camera: () => this.camera, ui: this.ui, remote: true });
    // Nothing under the pointer until the guest has moved it once.
    this.input.pointer.inside = false;
  }

  /** Take on the guest's view and pointer. */
  apply(s: InputState): void {
    const c = s.c;
    if (c.length >= 9) {
      this.camera.position.set(c[0], c[1], c[2]);
      this.camera.quaternion.set(c[3], c[4], c[5], c[6]);
      if (this.camera.fov !== c[7] || this.camera.aspect !== c[8]) {
        this.camera.fov = c[7];
        this.camera.aspect = c[8];
        this.camera.updateProjectionMatrix();
      }
      this.camera.updateMatrixWorld(true);
    }
    this.w = Math.max(1, s.w);
    this.h = Math.max(1, s.h);
    // Map the guest's clock onto ours (the smallest delay seen, drifting up
    // slowly), so pointer speeds survive the trip over the network.
    const now = performance.now();
    const d = now - s.ts;
    this.clockOffset = !this.seen || d < this.clockOffset ? d : this.clockOffset + (d - this.clockOffset) * 0.002;
    this.seen = true;
    this.input.injectMove(s.x, s.y, this.w, this.h, s.ts + this.clockOffset);
    this.input.pointer.type = s.pt ? 'touch' : 'mouse';
    if (s.o) this.input.pointer.inside = false;
  }

  /** Screen position in the guest's viewport (for code that works in screen space). */
  project(world: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void {
    const v = tmpV.copy(world).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.w;
    out.y = (-v.y * 0.5 + 0.5) * this.h;
    out.visible = v.z < 1 && v.z > -1;
  }

  /** Where this hand is in the shop: the carried thing, or what it points at. */
  position(out: THREE.Vector3): THREE.Vector3 | null {
    return handPosition(this.interaction, out);
  }
}

/** Where a hand is: its carried item, or the point under its pointer. */
export function handPosition(ia: Interaction, out: THREE.Vector3): THREE.Vector3 | null {
  const g = ia.grab;
  if (g && g.entity.alive) return g.entity.object.getWorldPosition(out);
  if (!ia.input.pointer.valid || !ia.input.pointer.inside) return null;
  if (ia.hoverHit) return out.copy(ia.hoverHit.point);
  const s = ia.surfaceUnderPointer(null);
  return s ? out.copy(s.point) : null;
}
