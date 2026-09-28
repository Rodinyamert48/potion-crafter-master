// The cauldron entity. Physically it is a static Havok container; items that
// fall in get buoyancy, drag and swirl forces, dissolve into the brew and are
// removed when gone. Chemically it wraps BrewChemistry and turns its events
// into visuals, sound, physics (vortex, explosion) and game events.

import * as THREE from 'three';
import { Entity, type HoverInfo } from '../../world/Entity';
import type { GameContext } from '../../core/GameContext';
import { BrewChemistry, tempZone, type BrewEvent, type DissolvingPiece } from './BrewChemistry';
import { brewColor, evaluate, type PotionResult } from './PotionEvaluator';
import { cauldronInnerRadius, cauldronModel, type CauldronParts } from '../../rendering/three/models/stationModels';
import { createLiquidMaterial } from '../../rendering/three/shaders/LiquidMaterial';
import { CG, type BodyHandle } from '../../physics/PhysicsTypes';
import type { Hearth } from './Hearth';
import { IngredientItem } from '../ingredients/IngredientItem';
import { ASPECTS, ASPECT_IDS } from '../../data/aspects';
import { RECIPE_MAP } from '../../data/potions';
import { INGREDIENTS } from '../../data/ingredients';
import type { AspectId } from '../../data/types';
import { clamp, damp, mixHex, noise1, shadeHex, smoothstep } from '../../core/math';
import { t, tr } from '../../core/i18n';
import { rng } from '../../core/Random';
import { boilLoop, rumbleLoop } from '../../audio/Sfx';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const IDENTITY = new THREE.Quaternion();

const ZONE_COLORS = { cold: '#0099db', warm: '#63c74d', hot: '#feae34', boiling: '#f77622', danger: '#e43b44' } as const;

export class Cauldron extends Entity {
  readonly kind = 'cauldron';
  readonly chem = new BrewChemistry();
  /** Current centre of the cauldron's base (moves when the hoist lifts it). */
  readonly center: THREE.Vector3;
  /** Resting position on the hearth. */
  private readonly restCenter: THREE.Vector3;
  /** Height the hoist has raised the cauldron off the fire (m). */
  lift = 0;
  static readonly MAX_LIFT = 0.48;
  capacity = 6;
  /** Angular speed of the ladle (rad/s), written by the Ladle each frame. */
  stirSpeed = 0;
  private swirl = 0;
  private parts: CauldronParts;
  private readonly shell = new THREE.Group();
  private readonly liquid: THREE.Mesh;
  private readonly liquidMat: THREE.ShaderMaterial;
  private readonly thermo: THREE.Mesh;
  private readonly thermoMat: THREE.MeshToonMaterial;
  readonly opening: THREE.Mesh;
  private readonly inside = new Set<number>();
  private vortex = 0;
  private soot = 0;
  private shake = 0;
  color = '#3b6f9e';
  private glow = 0;
  private time = 0;
  private toastCooldown = new Map<string, number>();
  private previewTimer = 0;
  preview: PotionResult | null = null;
  private variant: 'iron' | 'copper' | 'magic' = 'iron';

  constructor(
    ctx: GameContext,
    center: THREE.Vector3,
    private readonly hearth: Hearth,
  ) {
    super();
    this.center = center.clone();
    this.restCenter = center.clone();
    this.object.position.copy(center);
    this.object.add(this.shell);
    this.parts = cauldronModel('iron');
    this.shell.add(this.parts.group);

    this.liquidMat = createLiquidMaterial();
    this.liquid = new THREE.Mesh(new THREE.CircleGeometry(1, 28), this.liquidMat);
    this.liquid.rotation.x = -Math.PI / 2;
    this.liquid.renderOrder = 2;
    this.shell.add(this.liquid);

    // Diegetic thermometer hanging on the rim.
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6), new THREE.MeshToonMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.35 }));
    this.thermoMat = new THREE.MeshToonMaterial({ color: '#0099db', emissive: '#0099db', emissiveIntensity: 0.9 });
    this.thermo = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.34, 6), this.thermoMat);
    this.thermo.geometry.translate(0, 0.17, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), this.thermoMat);
    const thermoGroup = new THREE.Group();
    tube.position.y = 0.18;
    thermoGroup.add(tube, this.thermo, bulb);
    thermoGroup.position.set(0.5, 0.52, 0.34);
    thermoGroup.rotation.z = -0.25;
    this.shell.add(thermoGroup);

    // Opening proxy: a placement surface above the rim.
    this.opening = new THREE.Mesh(new THREE.CircleGeometry(0.53, 16), new THREE.MeshBasicMaterial({ visible: false }));
    this.opening.rotation.x = -Math.PI / 2;
    this.opening.position.y = 0.8;
    this.opening.userData.noPick = true;
    this.object.add(this.opening);

    // Physics: bottom + ring of wall boxes.
    const children: Array<import('../../physics/PhysicsTypes').ShapeDesc> = [{ type: 'cylinder', radius: 0.52, height: 0.06, offset: { x: 0, y: 0.045, z: 0 } }];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      children.push({
        type: 'box',
        size: [0.08, 0.76, 0.26],
        offset: { x: Math.cos(a) * 0.585, y: 0.42, z: Math.sin(a) * 0.585 },
        rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
      });
    }
    // Kinematic so the hoist can raise it; floating pieces ride along.
    this.body = ctx.physics.createBody({ shape: { type: 'compound', children }, motion: 'kinematic', position: center, friction: 0.4, group: CG.STATIC });
    ctx.world.addSurface(this.opening, { tag: 'cauldron', hover: 0.16 });
  }

  // -------------------------------------------------------------------------
  // Geometry queries
  // -------------------------------------------------------------------------

  get baseY(): number {
    return this.center.y;
  }

  get bottomY(): number {
    return this.center.y + 0.075;
  }

  get topLevelY(): number {
    return this.center.y + 0.7;
  }

  get rimY(): number {
    return this.center.y + 0.79;
  }

  /** Share of the fire's heat reaching the pot: 1 on the fire … 0.12 fully raised. */
  get heatFactor(): number {
    return 1 - 0.88 * smoothstep(0, Cauldron.MAX_LIFT, this.lift);
  }

  setLift(v: number): void {
    this.lift = clamp(v, 0, Cauldron.MAX_LIFT);
  }

  get liftRatio(): number {
    return this.lift / Cauldron.MAX_LIFT;
  }

  get level(): number {
    const f = clamp(this.chem.water / this.capacity, 0, 1.08);
    return this.bottomY + f * (this.topLevelY - this.bottomY);
  }

  innerRadiusAt(worldY: number): number {
    return cauldronInnerRadius(clamp(worldY - this.baseY, 0.06, 0.79));
  }

  isInside(p: THREE.Vector3, margin = 0): boolean {
    if (p.y > this.rimY + 0.02 || p.y < this.baseY) return false;
    const dx = p.x - this.center.x;
    const dz = p.z - this.center.z;
    return dx * dx + dz * dz < (this.innerRadiusAt(p.y) - margin) ** 2;
  }

  /** Is the point above the opening (for pouring / dropping)? */
  isAboveOpening(p: THREE.Vector3): boolean {
    const dx = p.x - this.center.x;
    const dz = p.z - this.center.z;
    return p.y > this.rimY - 0.1 && dx * dx + dz * dz < 0.54 * 0.54;
  }

  setVariant(v: 'iron' | 'copper' | 'magic', capacity: number): void {
    this.capacity = capacity;
    if (v === this.variant) return;
    this.variant = v;
    this.parts.group.removeFromParent();
    this.parts = cauldronModel(v);
    this.shell.add(this.parts.group);
  }

  // -------------------------------------------------------------------------
  // Liquid operations
  // -------------------------------------------------------------------------

  addWater(ctx: GameContext, liters: number): number {
    const room = this.capacity * 1.05 - this.chem.water;
    const add = Math.max(0, Math.min(room, liters));
    if (add <= 0) {
      // Overflowing!
      if (liters > 0) this.spill(ctx, 0.5);
      return 0;
    }
    this.chem.addWater(add);
    ctx.bus.emit('water:added', { liters: add, total: this.chem.water });
    return add;
  }

  /** Bottle one dose (1 L). Returns the potion or null if not enough liquid. */
  fill(ctx: GameContext): PotionResult | null {
    if (this.chem.water < 0.45) return null;
    const result = evaluate(this.chem.snapshot());
    this.chem.removeLiquid(Math.min(1, this.chem.water));
    ctx.vfx.bubble(this.surfacePoint(), 0.1, this.color, true);
    this.preview = null;
    return result;
  }

  drain(ctx: GameContext, liters: number): number {
    const taken = this.chem.removeLiquid(liters);
    if (this.chem.water <= 0.04) ctx.bus.emit('cauldron:drained', {});
    return taken;
  }

  surfacePoint(): THREE.Vector3 {
    return new THREE.Vector3(this.center.x, this.level, this.center.z);
  }

  private spill(ctx: GameContext, amount: number): void {
    for (let i = 0; i < 8 * amount; i++) {
      const a = rng.range(0, Math.PI * 2);
      const p = new THREE.Vector3(this.center.x + Math.cos(a) * 0.58, this.rimY, this.center.z + Math.sin(a) * 0.58);
      ctx.vfx.drip(p, this.color, { x: Math.cos(a) * 0.6, y: 0.4, z: Math.sin(a) * 0.6 });
    }
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  override fixedUpdate(ctx: GameContext, dt: number): void {
    // Hoist: move the pot (and its collider) to the winch height.
    this.center.set(this.restCenter.x, this.restCenter.y + this.lift, this.restCenter.z);
    this.object.position.y = this.center.y;
    this.body?.setKinematicTarget(this.center, IDENTITY);
    this.hearth.heatScale = this.heatFactor;
    const effects = ctx.state.effects;
    let stir = Math.abs(this.stirSpeed);
    if (effects.autoStir > 0 && stir < effects.autoStir && this.chem.water > 0.2) stir = effects.autoStir;
    const level = this.level;
    const hasWater = this.chem.water > 0.2;
    const T = this.chem.temperature;
    let undissolved = 0;
    const pieces: Array<{ item: IngredientItem; piece: DissolvingPiece }> = [];

    for (const e of ctx.world.entities.values()) {
      if (!e.alive || !e.body || e.body.motion !== 'dynamic') continue;
      const p = e.object.position;
      const inside = this.isInside(p, 0.02);
      const wasInside = this.inside.has(e.id);
      if (inside && !wasInside) this.onEnter(ctx, e);
      else if (!inside && wasInside) {
        this.inside.delete(e.id);
        if (e instanceof IngredientItem) e.inCauldron = false;
      }
      if (!inside) continue;
      if (e.held) continue;
      // Liquid forces
      const body = e.body;
      if (hasWater) this.applyLiquidForces(ctx, e, body, level, stir, T, dt);
      if (e instanceof IngredientItem) {
        undissolved += e.mass;
        const bottom = p.y - e.halfHeight;
        e.submerged = hasWater ? clamp((level - bottom) / Math.max(0.02, e.halfHeight * 2), 0, 1) : 0;
        pieces.push({ item: e, piece: { ingredientId: e.def.id, state: e.state, mass: e.mass, submerged: e.submerged } });
        if (!hasWater && T > 60) {
          if (e.scorch(ctx, dt * ((T - 60) / 60) * 0.6)) this.toast(ctx, 'dryburn', t('toast.dryburn'), 'warn');
          if (rng.chance(dt * 3)) ctx.vfx.smoke(p, '#3a3040', 1, 0.6);
        }
      }
    }

    const env = {
      heatInput: this.hearth.heatOutput,
      stirSpeed: stir,
      capacity: this.capacity,
      undissolvedMass: undissolved,
      stabilityAssist: effects.stabilityAssist,
      heatMul: effects.heatMul,
    };

    for (const { item, piece } of pieces) {
      if (!item.alive) continue;
      const dm = this.chem.dissolve(piece, dt, env);
      if (dm > 0) {
        item.mass -= dm;
        if (item.mass < 0.02) {
          ctx.vfx.bubble(item.object.position, 0.05, this.color, true);
          ctx.world.remove(item);
          this.inside.delete(item.id);
        }
      }
    }

    this.chem.step(dt, env);
    for (const ev of this.chem.drainEvents()) this.handleEvent(ctx, ev);

    // Vortex: pull nearby loose objects in a spiral (physics force field).
    if (this.vortex > 0) {
      this.vortex = Math.max(0, this.vortex - dt);
      const strength = Math.min(1, this.vortex / 1.5);
      ctx.physics.forEachDynamic((b) => {
        const e = ctx.world.entityFromBody(b);
        if (!e || e.held) return;
        b.getPosition(tmp);
        const dx = this.center.x - tmp.x;
        const dz = this.center.z - tmp.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.6 || d < 0.05) return;
        const m = b.mass || 0.1;
        const k = strength * (1 - d / 2.6) * m * 9;
        tmp2.set((dx / d) * k * 0.6 - (dz / d) * k, k * 0.55, (dz / d) * k * 0.6 + (dx / d) * k);
        b.applyForce(tmp2);
      });
    }
  }

  private applyLiquidForces(ctx: GameContext, e: Entity, body: BodyHandle, level: number, stir: number, T: number, dt: number): void {
    const p = e.object.position;
    const h = Math.max(0.01, e.halfHeight);
    const sub = clamp((level - (p.y - h)) / (2 * h), 0, 1);
    if (sub <= 0) return;
    const m = body.mass || 0.05;
    const density = e instanceof IngredientItem ? e.def.density : e.kind === 'log' ? 0.6 : 1.5;
    body.getLinearVelocity(tmp);
    // Buoyancy (Archimedes, scaled so density 1 is neutral)
    const fy = (sub * m * 9.81) / density;
    // Drag
    const drag = 5 * sub * m;
    // Swirl from stirring: push toward tangential velocity
    const dx = p.x - this.center.x;
    const dz = p.z - this.center.z;
    const r = Math.max(0.05, Math.hypot(dx, dz));
    const dir = Math.sign(this.stirSpeed) || 1;
    const tangential = stir * r * 0.55 * dir;
    const tvx = (-dz / r) * tangential;
    const tvz = (dx / r) * tangential;
    const fx = (tvx - tmp.x) * drag - (dx / r) * m * 0.4 * sub;
    const fz = (tvz - tmp.z) * drag - (dz / r) * m * 0.4 * sub;
    let fyTotal = fy - tmp.y * drag;
    // Boiling bubbles bump things around.
    if (T > 98 && rng.chance(dt * 6)) fyTotal += m * rng.range(2, 6) * smoothstep(98, 130, T);
    tmp2.set(fx, fyTotal, fz);
    body.applyForce(tmp2);
    void ctx;
  }

  private onEnter(ctx: GameContext, e: Entity): void {
    this.inside.add(e.id);
    const p = e.object.position.clone();
    if (this.chem.water > 0.2) {
      const surf = new THREE.Vector3(p.x, this.level + 0.02, p.z);
      ctx.vfx.splash(surf, this.color, 12, 0.8);
      ctx.audio.play('plop', { x: p.x, pitch: 0.8 + rng.next() * 0.4 });
      if (e.body) ctx.audio.play('splash', { x: p.x, volume: 0.5, amount: 0.6 });
    } else {
      ctx.audio.play('metalClang', { x: p.x, volume: 0.35, pitch: 1.4 });
    }
    if (e instanceof IngredientItem) {
      e.inCauldron = true;
      ctx.bus.emit('ingredient:added', { id: e.def.id, state: e.state });
    }
  }

  // -------------------------------------------------------------------------
  // Events → feedback
  // -------------------------------------------------------------------------

  private toast(ctx: GameContext, key: string, text: string, kind: 'warn' | 'bad' | 'info' | 'good', cooldown = 8): void {
    const until = this.toastCooldown.get(key) ?? -1;
    if (ctx.time < until) return;
    this.toastCooldown.set(key, ctx.time + cooldown);
    ctx.bus.emit('toast', { text, kind });
  }

  private handleEvent(ctx: GameContext, ev: BrewEvent): void {
    const s = this.surfacePoint();
    ctx.bus.emit('cauldron:event', { type: ev.type, value: ev.value });
    switch (ev.type) {
      case 'essence': {
        const def = ev.ingredientId ? INGREDIENTS[ev.ingredientId] : null;
        if (def && ctx.state.learn(def.id)) {
          ctx.bus.emit('toast', { text: t('toast.aspectLearned', { name: tr(def.name) }), kind: 'discovery' });
          ctx.audio.play('sparkle', { x: s.x });
        }
        if (def) ctx.vfx.magic(s, def.glow ?? def.color, 10, 0.35, 0.3);
        break;
      }
      case 'zone': {
        const z = this.chem.zone;
        if (z === 'boiling') ctx.audio.play('hiss', { x: s.x, volume: 0.6 });
        if (z === 'danger') {
          ctx.audio.play('warning', { x: s.x });
          ctx.bus.emit('mentor:say', { text: t('mentor.boilover'), priority: 2, mood: 'worried' });
          ctx.bus.emit('chaos', { amount: 0.3 });
        }
        break;
      }
      case 'vital':
        ctx.vfx.magic(s, '#fee761', 6, 0.35, 0.4);
        break;
      case 'clash':
        ctx.vfx.magic(s, '#b55088', 6, 0.35, 0.5);
        this.toast(ctx, 'foam', t('toast.boilover').replace('!', '…'), 'info', 20);
        break;
      case 'chaos':
        ctx.vfx.swirl(s, 0.4, this.time, '#ff0044');
        ctx.vfx.runes(s, '#ff0044', 2, 0.5);
        ctx.audio.play('magic', { x: s.x, pitch: 0.7 + rng.next() * 0.6, minGap: 0.8 });
        ctx.bus.emit('chaos', { amount: 0.15 });
        break;
      case 'blacken':
        ctx.vfx.smoke(s, '#181425', 14, 1.4);
        ctx.audio.play('flare', { x: s.x, volume: 0.6 });
        this.toast(ctx, 'blacken', t('toast.blackened'), 'bad');
        ctx.bus.emit('mentor:say', { text: t('mentor.black'), priority: 2, mood: 'angry' });
        ctx.bus.emit('chaos', { amount: 0.4 });
        break;
      case 'scorch':
        ctx.vfx.smoke(s, '#5a5068', 8, 1);
        this.toast(ctx, 'scorch', t('toast.scorched'), 'warn');
        ctx.bus.emit('mentor:say', { text: t('mentor.scorch'), priority: 2, mood: 'worried' });
        break;
      case 'swift':
        ctx.vfx.sparks(s, 12, [0, 1.5, 0], 1.2, '#c0cbdc');
        ctx.audio.play('whoosh', { x: s.x, pitch: 1.6, minGap: 0.6 });
        break;
      case 'sanguine':
        ctx.vfx.smoke(s, '#a22633', 3, 0.8);
        break;
      case 'fumes':
        ctx.vfx.poisonCloud(new THREE.Vector3(s.x, s.y + 0.2, s.z), 0.6);
        if (rng.chance(0.2)) ctx.bus.emit('mentor:say', { text: t('mentor.fumes'), priority: 1, mood: 'worried' });
        break;
      case 'boilover':
        this.spill(ctx, 1);
        ctx.audio.play('sizzle', { x: s.x, minGap: 0.8 });
        this.toast(ctx, 'boilover', t('toast.boilover'), 'warn');
        this.hearth.fuel = Math.max(0, this.hearth.fuel - 0.05);
        ctx.bus.emit('chaos', { amount: 0.2 });
        break;
      case 'overload':
        this.shake = Math.max(this.shake, 0.6);
        ctx.audio.play('rumble', { x: s.x, minGap: 1.5 });
        this.toast(ctx, 'overload', t('toast.overload'), 'warn');
        ctx.bus.emit('mentor:say', { text: t('mentor.overload'), priority: 2, mood: 'worried' });
        ctx.bus.emit('chaos', { amount: 0.25 });
        break;
      case 'unstable':
        this.shake = Math.max(this.shake, 0.4 + (ev.value ?? 0) * 0.6);
        this.toast(ctx, 'unstable', t('toast.unstable'), 'warn');
        if ((ev.value ?? 0) > 0.8) ctx.bus.emit('mentor:say', { text: t('mentor.explodeWarn'), priority: 3, mood: 'worried' });
        ctx.bus.emit('chaos', { amount: 0.2 });
        break;
      case 'vortex':
        this.vortex = 4.5;
        ctx.audio.play('vortex', { x: s.x });
        this.toast(ctx, 'vortex', t('toast.vortex'), 'warn');
        ctx.bus.emit('mentor:say', { text: t('mentor.vortex'), priority: 2, mood: 'worried' });
        ctx.bus.emit('chaos', { amount: 0.6 });
        break;
      case 'explode':
        this.explode(ctx);
        break;
      case 'dryburn':
        ctx.vfx.smoke(s, '#3a3040', 3, 0.8);
        this.toast(ctx, 'dryburn', t('toast.dryburn'), 'warn');
        break;
      case 'foam':
        break;
    }
  }

  explode(ctx: GameContext): void {
    const p = new THREE.Vector3(this.center.x, this.rimY + 0.1, this.center.z);
    ctx.vfx.explosion(p, 1.2, this.color);
    ctx.vfx.smoke(p, '#262b44', 16, 2);
    ctx.physics.explode({ x: p.x, y: p.y - 0.4, z: p.z }, 4, 2.4);
    ctx.audio.play('explosion', { x: p.x });
    ctx.bus.emit('shake', { amount: 1 });
    ctx.bus.emit('flash', { amount: 0.85, color: '#fee761' });
    ctx.bus.emit('chaos', { amount: 1 });
    ctx.bus.emit('toast', { text: t('toast.explosion'), kind: 'bad' });
    ctx.bus.emit('mentor:say', { text: t('mentor.boom'), priority: 5, mood: 'angry' });
    // Contents are lost; undissolved pieces are flung out by the impulse.
    for (const id of this.inside) {
      const e = ctx.world.entities.get(id);
      if (e instanceof IngredientItem) e.inCauldron = false;
    }
    this.inside.clear();
    this.chem.reset();
    this.soot = 1;
    this.hearth.fuel *= 0.5;
    this.hearth.boost = 0;
    this.shake = 1;
    ctx.state.stats.explosions++;
    ctx.state.dayStats.explosions++;
    ctx.state.journal.push({ day: ctx.state.day, hour: ctx.state.hour, recipeId: 'explosion', tier: 0, success: false, ingredients: [], brewTemp: 0, event: 'explosion' });
    ctx.bus.emit('cauldron:exploded', {});
  }

  // -------------------------------------------------------------------------
  // Visuals
  // -------------------------------------------------------------------------

  override update(ctx: GameContext, dt: number): void {
    this.time += dt;
    const chem = this.chem;
    const T = chem.temperature;
    const water = chem.water;
    const level = this.level;

    // Liquid surface
    this.liquid.visible = water > 0.02;
    const r = this.innerRadiusAt(level) - 0.012;
    this.liquid.scale.set(r, r, 1);
    this.liquid.position.y = level - this.baseY;
    const target = chem.hasBrew() ? brewColor(chem.essences, chem.ruin, water) : '#3b6f9e';
    this.color = mixHex(this.color, target, Math.min(1, dt * 1.5));
    const u = this.liquidMat.uniforms;
    (u.uColorA.value as THREE.Color).set(shadeHex(this.color, -0.25));
    (u.uColorB.value as THREE.Color).set(mixHex(this.color, '#ffffff', 0.25));
    this.swirl += this.stirSpeed * dt * 0.8 + dt * 0.08;
    u.uTime.value = this.time;
    u.uSwirl.value = this.swirl;
    u.uSwirlSpeed.value = this.stirSpeed;
    u.uBubbles.value = smoothstep(55, 110, T) * 0.9 + (chem.foam > 0.2 ? 0.2 : 0);
    u.uFoam.value = chem.foam;
    u.uVortex.value = Math.min(1, this.vortex / 2);
    const liters = Math.max(0.5, water);
    const glowAspects = (chem.essences.glow + chem.essences.light + chem.essences.magic * 0.5 + chem.essences.fire * 0.3) / liters;
    this.glow = damp(this.glow, clamp(0.08 + glowAspects * 0.25, 0, 1), 2, dt);
    u.uGlow.value = this.glow;
    const darkShare = chem.hasBrew() ? (chem.essences.darkness * 0.5 + chem.ruin) / Math.max(0.5, chem.totalEssence + chem.ruin) : 0;
    u.uDark.value = clamp(darkShare * 0.8, 0, 0.7);
    ctx.renderer.lighting.setGlow(this.color, water > 0.02 ? this.glow : 0);
    ctx.renderer.lighting.gloom = damp(ctx.renderer.lighting.gloom, clamp(chem.essences.darkness / 6, 0, 1), 1, dt);

    // Thermometer
    const tf = clamp(T / 150, 0.02, 1);
    this.thermo.scale.y = tf;
    this.thermoMat.color.set(ZONE_COLORS[tempZone(T)]);
    this.thermoMat.emissive.set(ZONE_COLORS[tempZone(T)]);

    // Soot fades
    this.soot = Math.max(0, this.soot - dt * 0.02);
    this.parts.material.color.set(mixHex('#ffffff', '#3a3a3a', this.soot));

    // Shaking when volatile / overloaded
    const vol = chem.volatility;
    this.shake = Math.max(this.shake - dt * 1.2, vol > 0.3 ? vol * 0.8 : 0);
    const sh = this.shake * 0.02;
    this.shell.position.set((noise1(this.time * 30, 1) - 0.5) * sh, (noise1(this.time * 34, 2) - 0.5) * sh * 0.5, (noise1(this.time * 31, 3) - 0.5) * sh);
    if (vol > 0.3) {
      const loop = ctx.audio.loop('rumble', rumbleLoop);
      loop?.set(vol);
    } else ctx.audio.loop('rumble', rumbleLoop)?.set(0);

    // Steam, bubbles, motes
    if (water > 0.05) {
      const surf = new THREE.Vector3(this.center.x, level + 0.02, this.center.z);
      ctx.vfx.rate('steam', smoothstep(50, 100, T) * 10 + chem.foam * 6, dt, () => ctx.vfx.steam(surf, r * 0.8, 0.6 + smoothstep(90, 130, T)));
      ctx.vfx.rate('bubbles', smoothstep(65, 105, T) * 16 + chem.foam * 14, dt, () => ctx.vfx.bubble(surf, r * 0.85, mixHex(this.color, '#ffffff', 0.3), T > 110));
      if (chem.foam > 0.5) ctx.vfx.rate('foam', chem.foam * 10, dt, () => ctx.vfx.bubble(new THREE.Vector3(surf.x, this.rimY - 0.02, surf.z), 0.55, '#e8eef8', true));
      // Essence motes: coloured sparks of the strongest aspects.
      const top = this.topAspects(2);
      for (const [a, amt] of top) {
        ctx.vfx.rate(`mote-${a}`, Math.min(8, (amt / liters) * 2.5), dt, () => ctx.vfx.mote(surf, ASPECTS[a].color, r * 0.7));
      }
      if (this.vortex > 0) ctx.vfx.rate('vortex', 40, dt, () => ctx.vfx.swirl(surf, 0.9, this.time, '#b55088'));
      const boil = ctx.audio.loop('boil', boilLoop);
      boil?.set(smoothstep(55, 115, T) + chem.foam * 0.3);
    } else {
      ctx.audio.loop('boil', boilLoop)?.set(0);
      if (T > 70) ctx.vfx.rate('heatHaze', 3, dt, () => ctx.vfx.smoke(new THREE.Vector3(this.center.x, this.bottomY + 0.1, this.center.z), '#3a3040', 1, 0.5));
    }

    // Periodic preview of what is forming (for the hover readout).
    this.previewTimer -= dt;
    if (this.previewTimer <= 0) {
      this.previewTimer = 0.5;
      this.preview = chem.hasBrew() && water > 0.3 ? evaluate(chem.snapshot()) : null;
    }
  }

  topAspects(n: number): Array<[AspectId, number]> {
    return ASPECT_IDS.map((a) => [a, this.chem.essences[a]] as [AspectId, number])
      .filter(([, v]) => v > 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }

  override hover(ctx: GameContext): HoverInfo {
    const chem = this.chem;
    const lines: NonNullable<HoverInfo['lines']> = [];
    if (chem.water < 0.05) {
      lines.push({ text: t('cauldron.empty'), color: '#8b9bb4' });
    } else {
      lines.push({ text: t('cauldron.water', { l: chem.water.toFixed(1) }), color: '#0099db', bar: chem.water / this.capacity });
    }
    const precise = ctx.state.effects.preciseThermometer;
    const temp = precise ? chem.temperature.toFixed(1) : String(Math.round(chem.temperature / 2) * 2);
    const zone = tempZone(chem.temperature);
    lines.push({ text: t('cauldron.temp', { t: temp, zone: t(`zone.${zone}`) }), color: ZONE_COLORS[zone] });
    lines.push({ text: t('cauldron.fire', { p: Math.round(this.hearth.intensity * 100) }), color: '#f77622', bar: Math.min(1, this.hearth.intensity / 1.5) });
    if (chem.hasBrew()) {
      lines.push({ text: t('cauldron.smells'), color: '#ead4aa' });
      const liters = Math.max(0.5, chem.water);
      for (const [a, v] of this.topAspects(4)) lines.push({ text: `  ${tr(ASPECTS[a].name)}`, color: ASPECTS[a].color, bar: Math.min(1, v / liters / 4) });
      lines.push({ text: t('cauldron.stability'), color: chem.stability > 0.5 ? '#63c74d' : chem.stability > 0.25 ? '#feae34' : '#e43b44', bar: chem.stability });
      if (this.preview) {
        const r = RECIPE_MAP[this.preview.recipeId];
        const known = !!ctx.state.discovered[r.id];
        lines.push({ text: known ? t('cauldron.forming', { name: tr(r.name) }) : t('cauldron.unknownForming'), color: known ? '#fee761' : '#b55088' });
      }
    } else if (chem.water > 0.05) {
      lines.push({ text: t('cauldron.nothing'), color: '#8b9bb4' });
    }
    const pieces = [...this.inside].filter((id) => ctx.world.entities.get(id)?.kind === 'ingredient').length;
    if (pieces > 0) lines.push({ text: t('cauldron.pieces', { n: pieces }), color: '#c0cbdc' });
    const hint = chem.water < 0.3 ? t('hint.cauldronEmpty') : chem.hasBrew() ? t('hint.cauldronBrew') : t('hint.cauldronWater');
    return { title: t('obj.cauldron'), hint, lines };
  }

  serializeState(): unknown {
    return this.chem.serialize();
  }
}
