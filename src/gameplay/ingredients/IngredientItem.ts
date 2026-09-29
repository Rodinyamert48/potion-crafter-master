// A physical piece of an ingredient. Its preparation state, remaining mass,
// dryness, burn and grind progress are all real simulation values; tools and
// stations call `tryProcess` which follows the data-driven process rules.

import * as THREE from 'three';
import { Entity, pickProxy, type HoverInfo, type SavedEntity } from '../../world/Entity';
import type { GameContext } from '../../core/GameContext';
import type { IngredientDef, PrepState, ToolAction } from '../../data/types';
import { INGREDIENTS } from '../../data/ingredients';
import { ASPECTS } from '../../data/aspects';
import { buildIngredientVisual, type IngredientVisual } from '../../rendering/three/models/ingredientModels';
import { CG, type Vec3Like } from '../../physics/PhysicsTypes';
import { t, tr } from '../../core/i18n';
import { rng } from '../../core/Random';
import { mixHex } from '../../core/math';

const proxySphere = new THREE.SphereGeometry(0.075, 6, 4);

export class IngredientItem extends Entity {
  readonly kind = 'ingredient';
  readonly def: IngredientDef;
  state: PrepState;
  /** Mass relative to a whole ingredient (1). Shrinks while dissolving. */
  mass: number;
  /** Mass when this piece was created (for dissolve scaling). */
  initialMass: number;
  dryness = 0;
  burn = 0;
  grind = 0;
  hits = 0;
  /** Set by the cauldron each step. */
  submerged = 0;
  inCauldron = false;
  /** Drying rack joint, if hanging. */
  hang: { remove(): void; hook: number } | null = null;
  private visual!: IngredientVisual;
  private lastProcess = -10;
  private lastImpactSound = 0;
  private refuseShown = new Set<string>();

  constructor(ctx: GameContext, id: string, state: PrepState, mass: number, pos: Vec3Like, rot?: THREE.Quaternion) {
    super();
    this.def = INGREDIENTS[id];
    this.state = state;
    this.mass = mass;
    this.initialMass = mass;
    this.draggable = true;
    this.ghostWhenHeld = true;
    this.build(ctx, pos, rot);
  }

  get name(): string {
    const st = this.def.states[this.state];
    const base = tr(this.def.name);
    if (!st || this.state === 'whole') return base;
    return `${tr(st.name)} ${base}`;
  }

  private build(ctx: GameContext, pos: Vec3Like, rot?: THREE.Quaternion): void {
    this.visual = buildIngredientVisual(this.def, this.state, this.initialMass);
    this.object.clear();
    this.object.add(this.visual.group);
    this.halfHeight = this.visual.halfHeight;
    this.radius = this.visual.radius;
    // Slices, shards and powder piles are tiny on screen – pad the hit area.
    if (this.radius < 0.07) this.object.add(pickProxy(proxySphere));
    const body = ctx.physics.createBody({
      shape: this.visual.shape,
      motion: 'dynamic',
      mass: Math.max(0.01, this.def.weight * this.initialMass),
      position: pos,
      rotation: rot ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, Math.PI * 2), 0)),
      friction: 0.75,
      restitution: this.def.model === 'scale' || this.def.model === 'crystal' ? 0.3 : 0.12,
      linearDamping: 0.1,
      angularDamping: 0.3,
      collisionEvents: true,
      group: CG.ITEM,
      mask: CG.STATIC | CG.ITEM | CG.CHARACTER | CG.DEBRIS,
    });
    ctx.world.bindBody(this, body, ctx);
    this.applyTint();
  }

  /** Swap the model/body after a state change, keeping position. */
  private rebuild(ctx: GameContext): void {
    const p = this.body ? this.body.getPosition(new THREE.Vector3()) : this.object.position.clone();
    const q = this.body ? this.body.getRotation(new THREE.Quaternion()) : this.object.quaternion.clone();
    if (this.body) {
      ctx.sync.unlink(this.body);
      ctx.physics.removeBody(this.body);
      this.body = null;
    }
    this.build(ctx, { x: p.x, y: p.y + 0.02, z: p.z }, q);
  }

  // -------------------------------------------------------------------------
  // Processing
  // -------------------------------------------------------------------------

  canProcess(action: ToolAction): boolean {
    return this.def.processes.some((r) => r.action === action && r.from.includes(this.state) && r.to);
  }

  /** Attempt a tool action. Returns 'done' | 'progress' | 'refused' | 'none'. */
  tryProcess(ctx: GameContext, action: ToolAction): 'done' | 'progress' | 'refused' | 'none' {
    if (!this.alive) return 'none';
    const rule = this.def.processes.find((r) => r.action === action && r.from.includes(this.state));
    if (!rule) return 'none';
    const pos = this.object.position;
    if (!rule.to) {
      if (rule.refuse) {
        const key = `${action}:${this.state}`;
        if (!this.refuseShown.has(key) || ctx.time - this.lastProcess > 3) {
          this.refuseShown.add(key);
          ctx.ui.floatText(pos.clone().add(new THREE.Vector3(0, 0.15, 0)), tr(rule.refuse), '#feae34');
          ctx.bus.emit('ingredient:refused', { id: this.def.id, action, message: tr(rule.refuse) });
        }
        this.lastProcess = ctx.time;
      }
      return 'refused';
    }
    if (action === 'slice' || action === 'smash') {
      if (ctx.time - this.lastProcess < 0.22) return 'none';
      this.lastProcess = ctx.time;
      this.hits++;
      if ((rule.hits ?? 1) > this.hits) return 'progress';
    }
    this.hits = 0;
    const from = this.state;
    const to = rule.to;
    const pieces = rule.pieces ?? 1;
    if (pieces > 1 && this.mass / pieces > 0.08) {
      this.splitInto(ctx, to, pieces);
    } else {
      this.state = to;
      this.initialMass = this.mass;
      this.dryness = 0;
      this.grind = 0;
      this.rebuild(ctx);
    }
    ctx.bus.emit('ingredient:processed', { id: this.def.id, from, to, action });
    return 'done';
  }

  private splitInto(ctx: GameContext, state: PrepState, n: number): void {
    const p = this.body ? this.body.getPosition(new THREE.Vector3()) : this.object.position.clone();
    const each = this.mass / n;
    const spawned: IngredientItem[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(0, 0.5);
      const off = 0.05 + this.radius * 0.35;
      const item = new IngredientItem(ctx, this.def.id, state, each, { x: p.x + Math.cos(a) * off, y: p.y + 0.03 + i * 0.012, z: p.z + Math.sin(a) * off });
      ctx.world.add(item, ctx);
      item.body?.applyImpulse({ x: Math.cos(a) * 0.012, y: 0.03, z: Math.sin(a) * 0.012 });
      spawned.push(item);
    }
    ctx.world.remove(this);
  }

  // -------------------------------------------------------------------------
  // Continuous processes (rack, fire, mortar)
  // -------------------------------------------------------------------------

  /** Drying on the rack at `temp` °C. Returns true when something changed state. */
  dryStep(ctx: GameContext, temp: number, dt: number): 'dried' | 'charred' | null {
    const canDry = this.canProcess('dry');
    const [lo, hi] = this.def.dryRange;
    if (canDry) {
      let rate = 0;
      if (temp < lo) rate = Math.max(0, (temp - 18) / Math.max(1, lo - 18)) / 70;
      else if (temp <= hi) rate = (1 + ((temp - lo) / Math.max(1, hi - lo)) * 0.6) / 24;
      else rate = 1 / 14;
      this.dryness = Math.min(1, this.dryness + rate * dt);
    }
    // Too hot scorches – slowly enough to notice the smoke and take it down.
    if (temp > hi + 5) this.burn += ((temp - hi) / 40) * this.def.burnability * dt * 0.18;
    this.applyTint();
    if (this.burn >= 1 && this.canProcess('burn')) {
      this.tryProcess(ctx, 'burn');
      return 'charred';
    }
    if (canDry && this.dryness >= 1) {
      this.tryProcess(ctx, 'dry');
      return 'dried';
    }
    return null;
  }

  /** Scorch in a dry, hot cauldron or fire. */
  scorch(ctx: GameContext, amount: number): boolean {
    if (this.def.burnability <= 0 || !this.canProcess('burn')) return false;
    this.burn += amount * this.def.burnability;
    this.applyTint();
    if (this.burn >= 1) {
      this.tryProcess(ctx, 'burn');
      return true;
    }
    return false;
  }

  /** Grinding progress from the mortar (distance moved × effort). */
  grindStep(ctx: GameContext, amount: number): 'done' | 'progress' | 'refused' | 'none' {
    const rule = this.def.processes.find((r) => r.action === 'grind' && r.from.includes(this.state));
    if (!rule) return 'none';
    if (!rule.to) return this.tryProcess(ctx, 'grind');
    this.grind += amount * this.def.grindability;
    if (this.grind >= 1) return this.tryProcess(ctx, 'grind');
    return 'progress';
  }

  private applyTint(): void {
    const st = this.def.states[this.state];
    for (const m of this.visual.materials) {
      let c = st?.tint ? mixHex('#ffffff', st.tint, st.tintAmount ?? 0.5) : '#ffffff';
      if (this.dryness > 0 && this.canProcess('dry')) {
        const dried = this.def.states.dried;
        if (dried?.tint) c = mixHex(c, mixHex('#ffffff', dried.tint, dried.tintAmount ?? 0.5), this.dryness);
      }
      if (this.burn > 0) c = mixHex(c, '#2a2020', Math.min(0.85, this.burn));
      m.color.set(c);
    }
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  override update(ctx: GameContext, dt: number): void {
    this.lifetime += dt;
    // Visual shrink while dissolving.
    const f = Math.max(0.15, Math.cbrt(this.mass / Math.max(0.001, this.initialMass)));
    this.visual.group.scale.setScalar(Math.cbrt(this.initialMass) * f);
    // Fell out of the world?
    if (this.object.position.y < -2) ctx.world.remove(this);
    void dt;
  }

  override dispose(ctx: GameContext): void {
    if (this.hang) {
      this.hang.remove();
      this.hang = null;
      ctx.shop.rack.release(this);
    }
    super.dispose(ctx);
  }

  override onPicked(ctx: GameContext): void {
    if (this.hang) {
      this.hang.remove();
      ctx.shop.rack.release(this);
      this.hang = null;
    }
  }

  override onReleased(ctx: GameContext): void {
    if (ctx.shop.rack.tryHang(ctx, this)) return;
    if (ctx.shop.hearth.checkFeed(ctx, this)) return;
    ctx.shop.sources.get(this.def.id)?.tryReturn(ctx, this);
  }

  override onImpact(ctx: GameContext, _other: Entity | null, impulse: number, point: Vec3Like): void {
    const strength = impulse / Math.max(0.01, this.def.weight * this.mass);
    if (strength < 1.2 || ctx.time - this.lastImpactSound < 0.12) return;
    this.lastImpactSound = ctx.time;
    const vol = Math.min(1, strength / 6);
    if (this.inCauldron) return;
    if (this.def.model === 'scale' || this.def.model === 'crystal') ctx.audio.play('dropHard', { x: point.x, volume: vol, pitch: 0.9 + rng.next() * 0.3 });
    else ctx.audio.play('dropSoft', { x: point.x, volume: vol, pitch: 0.8 + rng.next() * 0.5 });
  }

  override hover(ctx: GameContext): HoverInfo {
    const lines: HoverInfo['lines'] = [];
    if (ctx.state.knows(this.def.id)) {
      for (const [a, v] of Object.entries(this.def.effects)) {
        const asp = ASPECTS[a as keyof typeof ASPECTS];
        const mul = this.def.states[this.state]?.effects?.[a as keyof typeof ASPECTS] ?? 1;
        lines.push({ text: tr(asp.name), color: asp.color, bar: Math.min(1, ((v ?? 0) * mul) / 4) });
      }
    } else {
      lines.push({ text: t('book.unknownEssence'), color: '#8b9bb4' });
    }
    if (this.dryness > 0 && this.canProcess('dry')) lines.push({ text: t('obj.rack'), color: '#e4a672', bar: this.dryness });
    if (this.grind > 0) lines.push({ text: t('obj.mortar'), color: '#c0cbdc', bar: Math.min(1, this.grind) });
    if (this.burn > 0.05) lines.push({ text: '🔥', color: '#e43b44', bar: Math.min(1, this.burn) });
    return { title: this.name, subtitle: tr(this.def.description).split('.')[0] + '.', hint: t('hint.drag'), lines };
  }

  override serialize(): SavedEntity {
    const p = this.object.position;
    const q = this.object.quaternion;
    return {
      type: 'ingredient',
      id: this.def.id,
      state: this.state,
      mass: +this.mass.toFixed(4),
      initialMass: +this.initialMass.toFixed(4),
      dryness: +this.dryness.toFixed(3),
      burn: +this.burn.toFixed(3),
      grind: +this.grind.toFixed(3),
      p: [p.x, p.y, p.z],
      q: [q.x, q.y, q.z, q.w],
    };
  }

  static restore(ctx: GameContext, s: SavedEntity): IngredientItem | null {
    const id = s.id as string;
    if (!INGREDIENTS[id]) return null;
    const item = new IngredientItem(ctx, id, s.state as PrepState, (s.initialMass as number) ?? (s.mass as number), { x: s.p[0], y: s.p[1] + 0.05, z: s.p[2] });
    item.mass = (s.mass as number) ?? item.mass;
    item.dryness = (s.dryness as number) ?? 0;
    item.burn = (s.burn as number) ?? 0;
    item.grind = (s.grind as number) ?? 0;
    return item;
  }
}
