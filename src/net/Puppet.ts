// An online guest's stand-in for something the host animates with pixel
// sprites (customers, the master, the pets, the merchant, the King…): it
// shows exactly what the host's sprites show, and presses on it go to the
// host like presses on anything else.

import type { GameContext } from '../core/GameContext';
import { Entity, type CursorKind, type HoverInfo } from '../world/Entity';
import { PixelSprite } from '../rendering/three/sprites/PixelSprite';
import type { SpriteSheet } from '../rendering/three/sprites/CharacterPainter';
import type { PuppetState, SheetMsg } from './Protocol';

/** Sprite sheets sent by the host (PNG data URLs drawn back into canvases). */
export class SheetRegistry {
  private readonly sheets = new Map<number, { sheet: SpriteSheet; ready: boolean }>();

  add(m: SheetMsg): void {
    if (this.sheets.has(m.id) || typeof m.url !== 'string' || !m.url.startsWith('data:image/png')) return;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, m.fw * m.cols);
    canvas.height = Math.max(1, m.fh * m.rows);
    const entry = {
      sheet: { canvas, frameW: m.fw, frameH: m.fh, cols: m.cols, rows: m.rows, anims: m.anims, pivotY: m.py },
      ready: false,
    };
    this.sheets.set(m.id, entry);
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const g = canvas.getContext('2d');
      if (g) {
        g.imageSmoothingEnabled = false;
        g.drawImage(img, 0, 0);
      }
      entry.ready = true;
    };
    img.src = m.url;
  }

  /** The sheet, once its picture has loaded. */
  get(id: number): SpriteSheet | null {
    const e = this.sheets.get(id);
    return e && e.ready ? e.sheet : null;
  }
}

interface Slot {
  sheet: number;
  scale: number;
  sprite: PixelSprite | null;
  serial: number;
}

export class Puppet extends Entity {
  readonly kind = 'puppet';
  info: HoverInfo | null = null;
  cursorKind: CursorKind = 'point';
  private slots: Slot[] = [];
  private last: PuppetState | null = null;
  private waiting = false;

  constructor(private readonly sheets: SheetRegistry) {
    super();
  }

  override hover(): HoverInfo | null {
    return this.info;
  }

  override cursor(): CursorKind {
    return this.cursorKind;
  }

  apply(ps: PuppetState): void {
    this.last = ps;
    this.waiting = false;
    this.object.visible = !!ps.v;
    this.object.scale.setScalar(ps.sc || 1);
    for (let i = 0; i < ps.s.length; i++) {
      const s = ps.s[i];
      let slot = this.slots[i];
      if (!slot || slot.sheet !== s[0] || slot.scale !== s[12] || !slot.sprite) {
        slot?.sprite?.dispose();
        const sheet = this.sheets.get(s[0]);
        const sprite = sheet ? new PixelSprite(sheet, s[12]) : null;
        if (sprite) this.object.add(sprite.root);
        else this.waiting = true;
        slot = this.slots[i] = { sheet: s[0], scale: s[12], sprite, serial: -1 };
      }
      const sp = slot.sprite;
      if (!sp) continue;
      if (slot.serial !== s[2] || sp.current !== s[1]) {
        sp.play(s[1], true);
        slot.serial = s[2];
      }
      sp.facing = s[3];
      sp.hop = s[4];
      sp.squash = s[5];
      sp.opacity = s[6];
      sp.root.visible = !!s[7];
      sp.root.position.set(s[8], s[9], s[10]);
      sp.shadow.visible = !!s[11];
      sp.root.scale.setScalar(s[13] || 1);
      sp.material.emissive.set(s[14]);
      sp.material.emissiveIntensity = s[15];
    }
    while (this.slots.length > ps.s.length) this.slots.pop()?.sprite?.dispose();
  }

  override update(ctx: GameContext, dt: number): void {
    // A sheet still loading: try again once it is there.
    if (this.waiting && this.last) this.apply(this.last);
    for (const s of this.slots) s.sprite?.update(dt, ctx.renderer.rig.camera);
  }

  override dispose(ctx: GameContext): void {
    for (const s of this.slots) s.sprite?.dispose();
    this.slots = [];
    super.dispose(ctx);
  }
}
