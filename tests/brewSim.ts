// Headless brewing harness shared by the balance tests. It drives the same
// BrewChemistry the game uses, with the hearth reduced to a heat intensity.

import { BrewChemistry, type BrewEnvironment, type DissolvingPiece } from '../src/gameplay/potion/BrewChemistry';
import { evaluate, recipeMismatch, type PotionResult } from '../src/gameplay/potion/PotionEvaluator';
import { RECIPE_MAP } from '../src/data/potions';
import type { PrepState } from '../src/data/types';

export const HEAT_PER_INTENSITY = 14;

export class BrewSim {
  chem = new BrewChemistry();
  pieces: DissolvingPiece[] = [];
  heat = 0;
  stir = 0;
  capacity = 6;
  exploded = false;
  vortexes = 0;
  log: string[] = [];

  water(liters: number): this {
    this.chem.addWater(liters);
    return this;
  }

  fire(intensity: number): this {
    this.heat = intensity;
    return this;
  }

  stirAt(radPerSec: number): this {
    this.stir = radPerSec;
    return this;
  }

  add(id: string, state: PrepState = 'whole', count = 1, massEach = 1): this {
    for (let i = 0; i < count; i++) this.pieces.push({ ingredientId: id, state, mass: massEach, submerged: 1 });
    return this;
  }

  /** Split `count` whole items into `pieces` pieces each (e.g. slices). */
  addPieces(id: string, state: PrepState, count: number, pieces: number): this {
    return this.add(id, state, count * pieces, 1 / pieces);
  }

  env(): BrewEnvironment {
    return {
      heatInput: this.heat * HEAT_PER_INTENSITY,
      stirSpeed: this.stir,
      capacity: this.capacity,
      undissolvedMass: this.pieces.reduce((s, p) => s + p.mass, 0),
      stabilityAssist: 0,
      heatMul: 1,
    };
  }

  run(seconds: number, dt = 1 / 30): this {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      const env = this.env();
      for (const p of this.pieces) p.mass -= this.chem.dissolve(p, dt, env);
      this.pieces = this.pieces.filter((p) => p.mass > 0.002);
      this.chem.step(dt, env);
      for (const ev of this.chem.drainEvents()) {
        if (ev.type === 'explode') {
          this.exploded = true;
          this.chem.reset();
          this.pieces = [];
        }
        if (ev.type === 'vortex') this.vortexes++;
        if (ev.type !== 'zone' && ev.type !== 'essence') this.log.push(ev.type);
      }
    }
    return this;
  }

  /** Run until the temperature reaches `target` (or timeout). */
  heatTo(target: number, timeout = 120, dt = 1 / 30): this {
    let t = 0;
    while (this.chem.temperature < target && t < timeout) {
      this.run(dt, dt);
      t += dt;
    }
    return this;
  }

  result(): PotionResult {
    return evaluate(this.chem.snapshot());
  }

  why(recipeId: string): string | null {
    return recipeMismatch(RECIPE_MAP[recipeId], this.chem.snapshot());
  }

  describe(): string {
    const s = this.chem.snapshot();
    const r = evaluate(s);
    const ess = Object.entries(s.essences)
      .filter(([, v]) => v > 0.01)
      .map(([k, v]) => `${k}:${v.toFixed(2)}`)
      .join(' ');
    return `${r.recipeId} T${r.tier} p=${r.potency.toFixed(2)} | temp=${s.temperature.toFixed(0)} brewT=${s.brewTemp.toFixed(0)} water=${s.water.toFixed(2)} stab=${s.stability.toFixed(2)} agit=${s.agitation.toFixed(2)} ruin=${s.ruin.toFixed(2)} flags=[${s.flags}] | ${ess}`;
  }
}
