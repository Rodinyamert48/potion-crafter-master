// Shop fixtures: supply sources (ingredient bins, flask crate, wood pile),
// firewood logs, the potion shelf, counter bell, lectern (potion book),
// merchant catalog board, shop sign and the door.

import * as THREE from 'three';
import { Entity, type CursorKind, type HoverInfo, type SavedEntity } from '../../world/Entity';
import type { Grab } from '../../world/Interaction';
import type { GameContext } from '../../core/GameContext';
import { IngredientItem } from '../ingredients/IngredientItem';
import { FlaskItem } from '../potion/FlaskItem';
import { INGREDIENTS } from '../../data/ingredients';
import { ASPECTS } from '../../data/aspects';
import { CG, type Vec3Like } from '../../physics/PhysicsTypes';
import { logModel } from '../../rendering/three/models/toolModels';
import { Painter } from '../../rendering/three/textures/Painter';
import { toon } from '../../rendering/three/materials';
import { t, tr } from '../../core/i18n';
import { damp } from '../../core/math';
import { rng } from '../../core/Random';

// ---------------------------------------------------------------------------
// Tiny 3x5 pixel font for world labels (digits and a few symbols)
// ---------------------------------------------------------------------------

const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  x: ['000', '101', '010', '101', '000'],
  '-': ['000', '000', '111', '000', '000'],
};

export function drawPixelText(p: Painter, text: string, x: number, y: number, color: string, shadow = '#181425'): void {
  let cx = x;
  for (const ch of text) {
    const g = DIGITS[ch];
    if (g) {
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 3; c++)
          if (g[r][c] === '1') {
            p.px(cx + c + 1, y + r + 1, shadow);
            p.px(cx + c, y + r, color);
          }
    }
    cx += 4;
  }
}

class CountLabel {
  readonly mesh: THREE.Mesh;
  private readonly painter = new Painter(20, 8, 1);
  private readonly tex: THREE.CanvasTexture;
  private last = -1;

  constructor() {
    this.tex = this.painter.texture({ mipmaps: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.08), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, alphaTest: 0.3, depthWrite: false }));
    this.mesh.userData.noPick = true;
    this.mesh.renderOrder = 50;
  }

  set(n: number): void {
    if (n === this.last) return;
    this.last = n;
    const p = this.painter;
    p.data.fill(0);
    p.rect(0, 0, 20, 8, '#262b44', 0.85);
    drawPixelText(p, `x${n}`, 2, 1, n > 0 ? '#fee761' : '#e43b44');
    p.commit();
    this.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Supply source (ingredients, flasks, logs)
// ---------------------------------------------------------------------------

export class SupplySource extends Entity {
  readonly kind = 'source';
  private readonly label = new CountLabel();
  private shakeT = 0;
  private readonly model: THREE.Object3D;

  constructor(
    ctx: GameContext,
    readonly supplyId: string,
    model: THREE.Object3D,
    position: THREE.Vector3,
    private readonly spawnOffset: THREE.Vector3,
    labelOffset: THREE.Vector3,
  ) {
    super();
    this.model = model;
    this.object.add(model);
    this.object.position.copy(position);
    this.label.mesh.position.copy(labelOffset);
    this.object.add(this.label.mesh);
    this.label.set(ctx.state.stockOf(supplyId));
    ctx.bus.on('stock', ({ id, count }) => {
      if (id === this.supplyId) this.label.set(count);
    });
  }

  override cursor(): CursorKind {
    return 'grab';
  }

  get title(): string {
    if (this.supplyId === 'flask') return t('obj.flaskCrate');
    if (this.supplyId === 'log') return t('obj.woodpile');
    return tr(INGREDIENTS[this.supplyId].name);
  }

  override hover(ctx: GameContext): HoverInfo {
    const n = ctx.state.stockOf(this.supplyId);
    const lines: HoverInfo['lines'] = [];
    const def = INGREDIENTS[this.supplyId];
    if (def) {
      if (ctx.state.knows(def.id)) {
        for (const [a, v] of Object.entries(def.effects)) {
          const asp = ASPECTS[a as keyof typeof ASPECTS];
          lines.push({ text: tr(asp.name), color: asp.color, bar: Math.min(1, (v ?? 0) / 4) });
        }
      } else lines.push({ text: t('book.unknownEssence'), color: '#8b9bb4' });
    }
    return { title: this.title, subtitle: def ? tr(def.description) : undefined, hint: n > 0 ? t('hint.take', { n }) : t('hint.empty'), lines };
  }

  override press(ctx: GameContext): Grab | null {
    const id = this.supplyId;
    if (!ctx.state.take(id)) {
      this.shakeT = 0.4;
      ctx.audio.play('denied', {});
      ctx.bus.emit('toast', { text: t('toast.noStock', { name: this.title }), kind: 'warn' });
      return null;
    }
    const p = this.object.localToWorld(this.spawnOffset.clone());
    let e: Entity;
    if (id === 'flask') {
      e = new FlaskItem(ctx, p);
      ctx.audio.play('glassClink', { x: p.x });
    } else if (id === 'log') {
      e = new LogItem(ctx, p);
      ctx.audio.play('woodKnock', { x: p.x, volume: 0.6 });
    } else {
      e = new IngredientItem(ctx, id, 'whole', 1, p);
      ctx.audio.play(INGREDIENTS[id].model === 'scale' ? 'dropHard' : 'dropSoft', { x: p.x, pitch: 1.3 });
      ctx.bus.emit('ingredient:taken', { id });
    }
    ctx.world.add(e, ctx);
    return ctx.interaction.startPhysicsGrab(e);
  }

  /** An untouched whole ingredient dropped back on its bin returns to stock. */
  tryReturn(ctx: GameContext, e: Entity): boolean {
    if (e.object.position.distanceTo(this.object.localToWorld(this.spawnOffset.clone())) > 0.35) return false;
    if (e instanceof IngredientItem) {
      if (e.def.id !== this.supplyId || e.state !== 'whole' || e.mass < 0.98 || e.burn > 0 || e.dryness > 0) return false;
    } else if (e instanceof FlaskItem) {
      if (this.supplyId !== 'flask' || e.potion) return false;
    } else if (e.kind === 'log') {
      if (this.supplyId !== 'log') return false;
    } else return false;
    ctx.state.addStock(this.supplyId, 1);
    ctx.world.remove(e);
    ctx.audio.play('dropSoft', { x: e.object.position.x, pitch: 1.5, volume: 0.6 });
    return true;
  }

  override update(ctx: GameContext, dt: number): void {
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.model.position.x = this.shakeT > 0 ? Math.sin(this.shakeT * 60) * 0.01 : 0;
    this.label.mesh.quaternion.copy(ctx.renderer.rig.camera.quaternion);
  }
}

// ---------------------------------------------------------------------------
// Firewood log
// ---------------------------------------------------------------------------

export class LogItem extends Entity {
  readonly kind = 'log';

  constructor(ctx: GameContext, pos: Vec3Like) {
    super();
    this.object.add(logModel());
    this.draggable = true;
    this.halfHeight = 0.06;
    this.radius = 0.17;
    this.body = ctx.physics.createBody({
      shape: { type: 'cylinder', radius: 0.058, height: 0.34, rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2) },
      motion: 'dynamic',
      mass: 0.8,
      position: pos,
      friction: 0.9,
      restitution: 0.1,
      collisionEvents: true,
      group: CG.ITEM,
    });
  }

  override hover(): HoverInfo {
    return { title: t('obj.log'), hint: t('hint.log') };
  }

  override onReleased(ctx: GameContext): void {
    if (!ctx.shop.hearth.checkFeed(ctx, this)) ctx.shop.sources.get('log')?.tryReturn(ctx, this);
  }

  override onImpact(ctx: GameContext, _o: Entity | null, impulse: number, point: Vec3Like): void {
    if (impulse > 1.2) ctx.audio.play('woodKnock', { x: point.x, volume: Math.min(1, impulse / 5), minGap: 0.1 });
  }

  override update(ctx: GameContext): void {
    if (this.object.position.y < -2) ctx.world.remove(this);
  }

  override serialize(): SavedEntity {
    const p = this.object.position;
    return { type: 'log', p: [p.x, p.y, p.z] };
  }
}

// ---------------------------------------------------------------------------
// Potion shelf (stores finished potions in slots)
// ---------------------------------------------------------------------------

export class PotionShelf extends Entity {
  readonly kind = 'shelf';
  readonly slots: THREE.Vector3[] = [];
  private readonly stored: Array<FlaskItem | null> = [];

  constructor(ctx: GameContext, position: THREE.Vector3, slots: THREE.Vector3[]) {
    super();
    this.object.position.copy(position);
    for (const s of slots) {
      this.slots.push(s.clone());
      this.stored.push(null);
    }
    this.interactive = false;
    void ctx;
  }

  tryStore(ctx: GameContext, flask: FlaskItem): boolean {
    const p = flask.object.position;
    let best = -1;
    let bestD = 0.4;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.stored[i] && this.stored[i] !== flask) continue;
      const d = p.distanceTo(this.slots[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0 || !flask.body) return false;
    this.release(flask);
    this.stored[best] = flask;
    flask.slot = best;
    const target = this.slots[best].clone();
    target.y += flask.halfHeight + 0.005;
    flask.body.teleport(target, new THREE.Quaternion());
    ctx.sync.snap(flask.body);
    ctx.audio.play('glassClink', { x: target.x, pitch: 1.2 });
    return true;
  }

  release(flask: FlaskItem): void {
    const i = this.stored.indexOf(flask);
    if (i >= 0) this.stored[i] = null;
    flask.slot = -1;
  }

  potions(): FlaskItem[] {
    return this.stored.filter((f): f is FlaskItem => !!f && f.alive && !!f.potion);
  }

  override update(): void {
    for (let i = 0; i < this.stored.length; i++) {
      const f = this.stored[i];
      if (f && (!f.alive || f.object.position.distanceTo(this.slots[i]) > 0.5)) {
        this.stored[i] = null;
        if (f.alive) f.slot = -1;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Clickable fixtures
// ---------------------------------------------------------------------------

export class ClickFixture extends Entity {
  readonly kind: string;
  private bounce = 0;

  constructor(
    kind: string,
    model: THREE.Object3D,
    position: THREE.Vector3,
    private readonly info: (ctx: GameContext) => HoverInfo,
    private readonly onClick: (ctx: GameContext) => void,
  ) {
    super();
    this.kind = kind;
    this.object.add(model);
    this.object.position.copy(position);
  }

  override cursor(): CursorKind {
    return 'point';
  }

  override hover(ctx: GameContext): HoverInfo {
    return this.info(ctx);
  }

  override press(ctx: GameContext): Grab | null {
    this.bounce = 1;
    this.onClick(ctx);
    return null;
  }

  override update(_ctx: GameContext, dt: number): void {
    this.bounce = Math.max(0, this.bounce - dt * 4);
    const s = 1 + Math.sin(this.bounce * Math.PI) * 0.08;
    this.object.scale.setScalar(s);
  }
}

// ---------------------------------------------------------------------------
// Door
// ---------------------------------------------------------------------------

export class Door extends Entity {
  readonly kind = 'door';
  private target = 0;
  private angle = 0;
  private closeTimer = 0;

  constructor(
    private readonly leaf: THREE.Object3D,
    group: THREE.Object3D,
  ) {
    super(group);
    this.interactive = false;
  }

  open(ctx: GameContext, holdSeconds = 2.2): void {
    if (this.target === 0) {
      ctx.audio.play('doorCreak', { x: this.object.position.x });
      ctx.audio.play('doorBell', { x: this.object.position.x, delay: 0.1 });
    }
    this.target = 1;
    this.closeTimer = holdSeconds;
  }

  override update(ctx: GameContext, dt: number): void {
    if (this.target > 0) {
      this.closeTimer -= dt;
      if (this.closeTimer <= 0) {
        this.target = 0;
        ctx.audio.play('woodKnock', { x: this.object.position.x, delay: 0.5, volume: 0.6 });
      }
    }
    this.angle = damp(this.angle, this.target * 1.35, 5, dt);
    this.leaf.rotation.y = this.angle;
  }
}

/** Little idle sparkle above something magical (lectern book, crystals). */
export function sparkleAbove(ctx: GameContext, p: THREE.Vector3, color: string, rate: number, dt: number, key: string): void {
  ctx.vfx.rate(key, rate, dt, () => ctx.vfx.magic(new THREE.Vector3(p.x + rng.range(-0.15, 0.15), p.y, p.z + rng.range(-0.1, 0.1)), color, 1, 0.05, 0.1));
}

export function glowMaterial(color: string, intensity = 0.8) {
  return toon({ color, emissive: color, emissiveIntensity: intensity });
}
