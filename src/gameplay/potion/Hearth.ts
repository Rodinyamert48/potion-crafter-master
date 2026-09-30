// The hearth under the cauldron. Fire intensity comes from fuel (logs fed
// through the front opening), the air damper setting and bellows boosts.
// Babylon simulates the flame/ember particles; Three renders flames, coals
// and the flickering point light.

import * as THREE from 'three';
import { Entity, type HoverInfo } from '../../world/Entity';
import type { GameContext } from '../../core/GameContext';
import { hearthModel, type HearthParts } from '../../rendering/three/models/stationModels';
import { createFlame } from '../../rendering/three/shaders/FlameMaterial';
import type { FireHandle } from '../../rendering/babylon/BabylonParticleSim';
import { clamp, damp } from '../../core/math';
import { t, tr } from '../../core/i18n';
import { fireLoop } from '../../audio/Sfx';
import { CG } from '../../physics/PhysicsTypes';
import type { IngredientItem } from '../ingredients/IngredientItem';

export const HEAT_PER_INTENSITY = 14;

export class Hearth extends Entity {
  readonly kind = 'hearth';
  fuel = 0.45;
  readonly maxFuel = 4;
  damper = 0.75;
  boost = 0;
  intensity = 0;
  /** Lifted cauldron gets no heat (future hoist). */
  heatScale = 1;
  readonly center: THREE.Vector3;
  private readonly parts: HearthParts;
  private readonly flames: THREE.Mesh[] = [];
  private fire: FireHandle | null = null;
  private time = 0;

  constructor(ctx: GameContext, center: THREE.Vector3) {
    super();
    this.center = center.clone();
    this.parts = hearthModel();
    this.object.add(this.parts.group);
    this.object.position.copy(center);
    for (let i = 0; i < 5; i++) {
      const f = createFlame(0.28, 0.42, { grid: [7, 12] });
      const a = Math.PI / 2 + (i - 2) * 0.32;
      f.position.set(Math.cos(a) * 0.42, 0.02, Math.sin(a) * 0.42);
      this.object.add(f);
      this.flames.push(f);
    }
    // Physics: ring of boxes (leaving the front opening free).
    const children = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const phi = Math.atan2(Math.sin(a), Math.cos(a));
      // Opening centred on +z (a = π/2 in x=cos,z=sin terms)
      const d = Math.abs(Math.atan2(Math.sin(phi - Math.PI / 2), Math.cos(phi - Math.PI / 2)));
      if (d < 0.45) continue;
      const r = 0.81;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      children.push({
        type: 'box' as const,
        size: [0.3, 0.36, 0.44] as [number, number, number],
        offset: { x: Math.cos(a) * r, y: 0.18, z: Math.sin(a) * r },
        rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
      });
    }
    this.body = ctx.physics.createBody({
      shape: { type: 'compound', children },
      motion: 'static',
      position: center,
      group: CG.STATIC,
    });
    this.fire = ctx.vfx.babylon.createFire(center.x, center.y + 0.1, center.z, 0.55);
  }

  get heatOutput(): number {
    return this.intensity * HEAT_PER_INTENSITY * this.heatScale;
  }

  /** Air temperature at the drying rack. */
  get rackTemperature(): number {
    return 18 + Math.min(1.9, this.intensity) * 60;
  }

  /** Is a world point in the zone in front of / inside the hearth opening? */
  inFeedZone(p: THREE.Vector3): boolean {
    const dx = p.x - this.center.x;
    const dz = p.z - this.center.z;
    return Math.abs(dx) < 0.48 && dz > 0.3 && dz < 1.25 && p.y < this.center.y + 0.95;
  }

  /** Called when an item is released; logs and ingredients dropped at the opening burn. */
  checkFeed(ctx: GameContext, e: Entity): boolean {
    if (!this.inFeedZone(e.object.position)) return false;
    if (e.kind === 'log') {
      this.addFuel(ctx);
      ctx.world.remove(e);
      return true;
    }
    if (e.kind === 'ingredient') {
      this.burnIngredient(ctx, e as IngredientItem);
      return true;
    }
    return false;
  }

  addFuel(ctx: GameContext): void {
    this.fuel = Math.min(this.maxFuel, this.fuel + 1);
    const p = new THREE.Vector3(this.center.x, this.center.y + 0.2, this.center.z + 0.45);
    ctx.vfx.sparks(p, 30, [0, 1.2, 0.2], 0.9);
    ctx.vfx.flare(new THREE.Vector3(this.center.x, this.center.y + 0.1, this.center.z + 0.3), '#f77622', 0.7);
    ctx.audio.play('woodKnock', { x: p.x });
    ctx.audio.play('flare', { x: p.x, volume: 0.6 });
    ctx.bus.emit('fuel:added', { logs: this.fuel });
  }

  burnIngredient(ctx: GameContext, item: IngredientItem): void {
    const p = item.object.position.clone();
    const def = item.def;
    const fireAspect = def.effects.fire ?? 0;
    ctx.vfx.flare(p, def.glow ?? def.color, 0.6 + fireAspect * 0.25);
    if (def.model === 'wing') ctx.vfx.smoke(p, '#68386c', 6, 1.2);
    else ctx.vfx.magic(p, def.glow ?? def.color, 14);
    if (fireAspect > 0) this.boost = Math.min(1.2, this.boost + 0.25 * fireAspect);
    ctx.audio.play('flare', { x: p.x });
    ctx.world.remove(item);
    ctx.ui.floatText(p.clone().add(new THREE.Vector3(0, 0.4, 0)), `${tr(def.name)} 🔥`, '#f77622');
  }

  pump(amount: number, mul: number): void {
    this.boost = Math.min(1.1, this.boost + amount * 0.55 * mul * (this.fuel > 0.05 ? 1 : 0.15));
  }

  douse(ctx: GameContext, liters: number): void {
    this.fuel = Math.max(0, this.fuel - liters * 0.9);
    this.boost = 0;
    const p = new THREE.Vector3(this.center.x, this.center.y + 0.3, this.center.z + 0.35);
    for (let i = 0; i < 6; i++) ctx.vfx.steam(p, 0.4, 1.5);
    ctx.audio.play('sizzle', { x: p.x, minGap: 0.4 });
  }

  override fixedUpdate(ctx: GameContext, dt: number): void {
    const decay = ctx.state.effects.fireDecayMul;
    this.boost = Math.max(0, this.boost - dt * (0.18 + this.boost * 0.12));
    const base = clamp(this.fuel / 1.5, 0, 1) * (0.2 + 0.8 * this.damper);
    const target = this.fuel > 0.01 ? Math.min(1.9, base + this.boost) : 0;
    this.intensity = damp(this.intensity, target, 3, dt);
    if (this.fuel > 0) this.fuel = Math.max(0, this.fuel - dt * (0.006 + 0.012 * this.intensity) * decay);
    // Logs and ingredients rolling into the opening.
    for (const e of ctx.world.entities.values()) {
      if (!e.alive || e.held) continue;
      if ((e.kind === 'log' || e.kind === 'ingredient') && e.object.position.y < this.center.y + 0.5 && this.inFeedZone(e.object.position)) {
        const dz = e.object.position.z - this.center.z;
        if (dz < 0.8) this.checkFeed(ctx, e);
      }
    }
  }

  override update(ctx: GameContext, dt: number): void {
    this.time += dt;
    const I = this.intensity;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const mat = f.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = this.time + i * 1.7;
      mat.uniforms.uIntensity.value = 0.35 + Math.min(1.5, I) * 0.6;
      f.visible = I > 0.03;
      const s = 0.5 + Math.min(1.6, I) * 0.6;
      f.scale.set(s * (0.9 + (i % 2) * 0.2), s, s);
    }
    this.parts.coalMat.emissiveIntensity = 0.15 + Math.min(1.5, I) * 0.9 + Math.sin(this.time * 3) * 0.05;
    this.fire?.setIntensity(I);
    ctx.renderer.lighting.setHearth(Math.min(1.6, I));
    const loop = ctx.audio.loop('fire', fireLoop);
    loop?.set(Math.min(1.4, I));
  }

  override hover(ctx: GameContext): HoverInfo {
    return {
      title: t('obj.hearth'),
      hint: t('hint.log'),
      lines: [
        { text: t('cauldron.fire', { p: Math.round(this.intensity * 100) }), color: '#f77622', bar: Math.min(1, this.intensity / 1.5) },
        { text: `${t('obj.woodpile')}: ${this.fuel.toFixed(1)} / ${this.maxFuel}`, color: '#b86f50', bar: this.fuel / this.maxFuel },
        { text: t('obj.damper'), color: '#8b9bb4', bar: this.damper },
      ],
    };
    void ctx;
  }

  serializeState(): { fuel: number; damper: number } {
    return { fuel: this.fuel, damper: this.damper };
  }

  override netState(): unknown {
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return [r(this.fuel), r(this.damper), r(this.boost), r(this.intensity), r(this.heatScale)];
  }

  override applyNetState(_ctx: GameContext, s: unknown): void {
    [this.fuel, this.damper, this.boost, this.intensity, this.heatScale] = s as number[];
  }
}
