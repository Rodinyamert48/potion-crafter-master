// Pure simulation of what happens inside the cauldron: temperature, liquid,
// dissolving ingredients, essence accumulation, reactions, stability and
// volatility. It has no rendering or physics dependencies so it can be unit
// tested and reasoned about in isolation. The Cauldron entity feeds it
// environment data (heat, stirring, submerged pieces) and turns the events it
// emits into VFX, sounds and physical consequences.

import { ASPECT_IDS } from '../../data/aspects';
import { INGREDIENTS } from '../../data/ingredients';
import type { AspectId, IngredientDef, PrepState } from '../../data/types';
import { clamp, clamp01, smoothstep } from '../../core/math';

export const ROOM_TEMP = 18;
export const WATER_TEMP = 12;

export type TempZone = 'cold' | 'warm' | 'hot' | 'boiling' | 'danger';

export function tempZone(t: number): TempZone {
  if (t < 30) return 'cold';
  if (t < 70) return 'warm';
  if (t < 100) return 'hot';
  if (t < 130) return 'boiling';
  return 'danger';
}

export interface DissolvingPiece {
  ingredientId: string;
  state: PrepState;
  /** Remaining mass; a whole ingredient is 1.0. */
  mass: number;
  /** Fraction of the piece below the liquid surface. */
  submerged: number;
}

export interface BrewEnvironment {
  /** Heat delivered by the hearth this step (arbitrary units / s). */
  heatInput: number;
  /** Absolute angular speed of the ladle (rad/s). */
  stirSpeed: number;
  /** Cauldron volume in litres. */
  capacity: number;
  /** Mass of undissolved ingredient pieces currently in the liquid. */
  undissolvedMass: number;
  stabilityAssist: number;
  heatMul: number;
}

export type BrewEventType =
  | 'vital'
  | 'clash'
  | 'chaos'
  | 'swift'
  | 'sanguine'
  | 'boilover'
  | 'foam'
  | 'blacken'
  | 'scorch'
  | 'vortex'
  | 'explode'
  | 'dryburn'
  | 'fumes'
  | 'overload'
  | 'unstable'
  | 'zone'
  | 'essence';

export interface BrewEvent {
  type: BrewEventType;
  value?: number;
  aspect?: AspectId;
  ingredientId?: string;
}

export interface BrewSnapshot {
  essences: Record<AspectId, number>;
  water: number;
  ruin: number;
  stability: number;
  agitation: number;
  volatility: number;
  brewTemp: number;
  temperature: number;
  ingredientOrder: string[];
  ingredientFirst: Record<string, number>;
  ingredientTemps: Record<string, number>;
  ingredientMass: Record<string, number>;
  ingredientStates: Record<string, PrepState[]>;
  flags: string[];
  potencyMul: number;
  totalEssence: number;
}

export interface BrewSave {
  water: number;
  temperature: number;
  essences: Partial<Record<AspectId, number>>;
  fragile: Partial<Record<AspectId, number>>;
  fragileRes: number;
  ruin: number;
  stability: number;
  volatility: number;
  foam: number;
  agitation: number;
  time: number;
  flags: string[];
  tempAccum: number;
  essenceAccum: number;
  potencyAccum: number;
  massAccum: number;
  ingredientFirst: Record<string, number>;
  ingredientMass: Record<string, number>;
  ingredientTempAccum: Record<string, number>;
  ingredientEssence: Record<string, number>;
  ingredientStates: Record<string, PrepState[]>;
  healingReleased: number;
  healingDegraded: number;
  firstLight: number;
  firstShadow: number;
}

function zeroAspects(): Record<AspectId, number> {
  const o = {} as Record<AspectId, number>;
  for (const a of ASPECT_IDS) o[a] = 0;
  return o;
}

export class BrewChemistry {
  water = 0;
  temperature = ROOM_TEMP;
  essences = zeroAspects();
  /** Heat-sensitive essence that has not been tempered by fire. */
  fragile = zeroAspects();
  fragileRes = 95;
  ruin = 0;
  stability = 0.6;
  volatility = 0;
  foam = 0;
  agitation = 0;
  /** Seconds since the first essence entered the brew. */
  time = 0;
  flags = new Set<string>();

  vortexCharge = 0;
  vortexTime = 0;
  overheatTime = 0;

  private tempAccum = 0;
  private essenceAccum = 0;
  private potencyAccum = 0;
  private massAccum = 0;
  private ingredientFirst: Record<string, number> = {};
  private ingredientMass: Record<string, number> = {};
  private ingredientTempAccum: Record<string, number> = {};
  private ingredientEssence: Record<string, number> = {};
  private ingredientStates: Record<string, PrepState[]> = {};
  private healingReleased = 0;
  private healingDegraded = 0;
  private firstLight = -1;
  private firstShadow = -1;
  private lastZone: TempZone = 'cold';
  private eventCooldown = new Map<BrewEventType, number>();

  /** Events produced since the last `drainEvents()` call. */
  private events: BrewEvent[] = [];

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  get totalEssence(): number {
    let s = 0;
    for (const a of ASPECT_IDS) s += Math.max(0, this.essences[a]);
    return s;
  }

  get zone(): TempZone {
    return tempZone(this.temperature);
  }

  heatCapacity(): number {
    return 1.2 + this.water;
  }

  /** How much load (ingredients + dissolved essence) the brew can take. */
  loadCapacity(capacity: number): number {
    return Math.min(capacity * 0.9, 1.5 + this.water * 1.2);
  }

  load(undissolvedMass: number): number {
    return undissolvedMass + this.totalEssence / 12;
  }

  hasBrew(): boolean {
    return this.totalEssence > 0.05 || this.ruin > 0.05;
  }

  drainEvents(): BrewEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // -------------------------------------------------------------------------
  // Liquid handling
  // -------------------------------------------------------------------------

  addWater(liters: number, temp = WATER_TEMP): void {
    if (liters <= 0) return;
    const total = this.water + liters;
    // Mix temperatures weighted by heat capacity.
    const cOld = this.heatCapacity();
    const cNew = liters;
    this.temperature = (this.temperature * cOld + temp * cNew) / (cOld + cNew);
    this.water = total;
  }

  /** Remove liquid (bottling, spilling, draining). Essence leaves proportionally. */
  removeLiquid(liters: number): number {
    const taken = Math.min(liters, this.water);
    if (taken <= 0) return 0;
    const keep = this.water > 0 ? (this.water - taken) / this.water : 0;
    for (const a of ASPECT_IDS) {
      this.essences[a] *= keep;
      this.fragile[a] *= keep;
    }
    this.ruin *= keep;
    this.water -= taken;
    if (this.water < 0.04) this.reset(true);
    return taken;
  }

  reset(keepTemperature = false): void {
    const t = this.temperature;
    this.water = 0;
    this.temperature = keepTemperature ? t : ROOM_TEMP;
    this.essences = zeroAspects();
    this.fragile = zeroAspects();
    this.fragileRes = 95;
    this.ruin = 0;
    this.stability = 0.6;
    this.volatility = 0;
    this.foam = 0;
    this.agitation = 0;
    this.time = 0;
    this.flags.clear();
    this.vortexCharge = 0;
    this.vortexTime = 0;
    this.overheatTime = 0;
    this.tempAccum = 0;
    this.essenceAccum = 0;
    this.potencyAccum = 0;
    this.massAccum = 0;
    this.ingredientFirst = {};
    this.ingredientMass = {};
    this.ingredientTempAccum = {};
    this.ingredientEssence = {};
    this.ingredientStates = {};
    this.healingReleased = 0;
    this.healingDegraded = 0;
    this.firstLight = -1;
    this.firstShadow = -1;
  }

  // -------------------------------------------------------------------------
  // Dissolution
  // -------------------------------------------------------------------------

  /** Dissolve part of a submerged piece. Returns the mass that dissolved. */
  dissolve(piece: DissolvingPiece, dt: number, env: BrewEnvironment): number {
    if (this.water < 0.2 || piece.mass <= 0) return 0;
    const def = INGREDIENTS[piece.ingredientId];
    if (!def) return 0;
    const st = def.states[piece.state] ?? def.states.whole;
    if (!st) return 0;
    const T = this.temperature;
    const act = def.activationTemp;
    const tempFactor = 0.08 + 0.92 * smoothstep(act - 22, act + 28, T);
    const stirFactor = 1 + Math.min(1.2, env.stirSpeed * 0.18);
    const magicFactor = 1 + Math.min(0.5, (this.essences.magic / Math.max(1, this.water)) * 0.12);
    const surface = Math.pow(Math.max(0.05, piece.mass), 2 / 3);
    const rate = def.liquidAffinity * st.dissolve * tempFactor * stirFactor * magicFactor * (0.35 + 0.65 * piece.submerged);
    const dm = Math.min(piece.mass, rate * surface * dt);
    if (dm <= 0) return 0;
    this.release(def, piece.state, dm);
    return dm;
  }

  /** Instantly add essence (used by tests and powder that dissolves on contact). */
  releaseDirect(ingredientId: string, state: PrepState, mass: number): void {
    const def = INGREDIENTS[ingredientId];
    if (def) this.release(def, state, mass);
  }

  private fireProtection(): number {
    return clamp01(this.essences.fire / (0.6 * Math.max(0.5, this.essences.healing)));
  }

  private release(def: IngredientDef, state: PrepState, dm: number): void {
    const st = def.states[state] ?? def.states.whole!;
    const T = this.temperature;
    if (this.totalEssence < 0.01 && this.time === 0) this.stability = 0.6;
    const protection = this.fireProtection();
    let total = 0;
    for (const [aspect, base] of Object.entries(def.effects) as Array<[AspectId, number]>) {
      const mul = st.effects?.[aspect] ?? 1;
      const amt = base * mul * dm;
      if (amt <= 0) continue;
      this.essences[aspect] += amt;
      total += amt;
      if (def.heatSensitive?.includes(aspect)) {
        const fragilePart = amt * (1 - protection);
        const prev = this.fragile[aspect];
        this.fragile[aspect] += fragilePart;
        // Track the (weighted) resistance of the fragile pool.
        const w = prev + fragilePart;
        if (w > 0) this.fragileRes = (this.fragileRes * prev + def.temperatureResistance * fragilePart) / w;
      }
      if (aspect === 'healing') this.healingReleased += amt;
    }
    if (st.ruin) this.ruin += st.ruin * dm;

    // Exo/endothermic aspects physically change the temperature.
    const heat = (def.effects.heat ?? 0) * (st.effects?.heat ?? 1) * dm;
    const frost = (def.effects.frost ?? 0) * (st.effects?.frost ?? 1) * dm;
    if (heat > 0) this.temperature += (heat * 9) / this.heatCapacity();
    if (frost > 0) this.temperature -= (frost * 14) / this.heatCapacity();

    // Bookkeeping for the recipe evaluator.
    this.tempAccum += total * T;
    this.essenceAccum += total;
    this.potencyAccum += dm * (st.potency ?? 1) * def.magicalPower;
    this.massAccum += dm;
    const id = def.id;
    if (this.ingredientFirst[id] === undefined) {
      this.ingredientFirst[id] = this.time;
      this.pushEvent({ type: 'essence', ingredientId: id }, 0);
    }
    this.ingredientMass[id] = (this.ingredientMass[id] ?? 0) + dm;
    this.ingredientTempAccum[id] = (this.ingredientTempAccum[id] ?? 0) + total * T;
    this.ingredientEssence[id] = (this.ingredientEssence[id] ?? 0) + total;
    const states = (this.ingredientStates[id] ??= []);
    if (!states.includes(state)) states.push(state);

    if (this.firstLight < 0 && this.essences.light >= 0.3) this.firstLight = this.time;
    if (this.firstShadow < 0 && this.essences.shadow >= 0.3) this.firstShadow = this.time;
  }

  // -------------------------------------------------------------------------
  // Simulation step
  // -------------------------------------------------------------------------

  step(dt: number, env: BrewEnvironment): void {
    const e = this.essences;
    const hasEssence = this.totalEssence > 0.05;
    if (hasEssence) this.time += dt;
    for (const [k, v] of this.eventCooldown) this.eventCooldown.set(k, v - dt);

    // ---- Temperature ------------------------------------------------------
    let heat = env.heatInput * env.heatMul;
    if (this.temperature > 100 && this.water > 0.2) heat *= 0.8;
    const loss = (this.temperature - ROOM_TEMP) * (0.1 + 0.008 * this.water);
    this.temperature += ((heat - loss) / this.heatCapacity()) * dt;
    this.temperature = clamp(this.temperature, -20, 320);

    const zone = tempZone(this.temperature);
    if (zone !== this.lastZone) {
      this.lastZone = zone;
      this.events.push({ type: 'zone' });
    }

    // Evaporation at a boil concentrates the brew.
    if (this.temperature > 99 && this.water > 0.05) {
      const evap = 0.001 * (this.temperature - 98) * dt;
      this.water = Math.max(0, this.water - evap);
    }

    // ---- Stirring & stability ----------------------------------------------
    const si = clamp01(env.stirSpeed / 8);
    this.agitation += (si - this.agitation) * (1 - Math.exp(-dt / 12));
    if (hasEssence) {
      if (si > 0.05 && si < 0.4) this.stability += 0.075 * dt * (1 - this.stability) * (1 + env.stabilityAssist);
      else if (si >= 0.4 && si < 0.8) this.stability -= 0.01 * dt;
      else if (si >= 0.8) this.stability -= 0.06 * dt;
      if (this.temperature > 105 && si < 0.05) this.stability -= 0.012 * dt;
      if (env.stabilityAssist > 0) this.stability += env.stabilityAssist * 0.02 * dt * (1 - this.stability);
    }

    // Vortex: frantic stirring sustained for a moment.
    if (env.stirSpeed >= 7 && this.water > 0.3) this.vortexCharge += dt;
    else this.vortexCharge = Math.max(0, this.vortexCharge - dt * 2);
    if (this.vortexCharge > 1.4 && this.vortexTime <= 0) {
      this.vortexTime = 4.5;
      this.flags.add('vortex');
      this.events.push({ type: 'vortex' });
    }
    if (this.vortexTime > 0) {
      this.vortexTime -= dt;
      if (hasEssence) {
        e.chaos += 0.22 * dt * Math.min(1.5, this.totalEssence / 6 + 0.3);
        this.stability -= 0.18 * dt;
      }
    }

    let volatile = false;

    // ---- Heat damage to fragile essence --------------------------------------
    if (this.temperature > this.fragileRes) {
      const protection = this.fireProtection();
      const k = 0.035 * ((this.temperature - this.fragileRes) / 10) * (1 - protection);
      if (k > 0) {
        for (const a of ASPECT_IDS) {
          const f = this.fragile[a];
          if (f <= 0) continue;
          const d = Math.min(f, f * k * dt);
          this.fragile[a] -= d;
          e[a] = Math.max(0, e[a] - d);
          this.ruin += d * 0.22;
          if (a === 'healing') this.healingDegraded += d;
        }
        if (!this.flags.has('scorched') && this.healingReleased > 0.3 && this.healingDegraded > this.healingReleased * 0.2) {
          this.flags.add('scorched');
          this.events.push({ type: 'scorch' });
        }
      }
    }

    // ---- Reactions -------------------------------------------------------------
    const T = this.temperature;
    const liters = Math.max(0.5, this.water);

    // Vital reaction: dragon fire meets mushroom healing in a hot brew.
    if (e.fire >= 0.6 && e.healing >= 0.6 && T >= 70) {
      const intensity = Math.min(e.fire, e.healing) / liters;
      this.foam += 0.05 * dt * Math.min(2, intensity);
      this.stability -= 0.012 * dt;
      this.pushEvent({ type: 'vital', value: intensity }, 1.2);
    }

    // Light vs shadow.
    const m = Math.min(e.light, e.shadow);
    if (m >= 0.4) {
      const balance = m / Math.max(e.light, e.shadow);
      const violence = balance * balance;
      if (T < 80) {
        this.foam += 0.12 * dt * Math.min(2, m / liters) * (0.4 + violence);
        this.stability -= 0.02 * dt * Math.min(1, m / 2) * violence;
        const n = 0.006 * m * dt;
        e.light -= n;
        e.shadow -= n;
        this.pushEvent({ type: 'clash', value: violence }, 1.5);
      } else {
        const lightFirst = this.firstLight >= 0 && (this.firstShadow < 0 || this.firstLight < this.firstShadow);
        const r = 0.05 * m * dt * violence * (1 + Math.min(1, e.magic / 4));
        e.light -= r * 0.8;
        e.shadow -= r * 0.8;
        this.stability -= 0.03 * dt * violence;
        if (lightFirst) {
          // Shadow poured into a hot, bright brew: it turns black.
          this.ruin += r * 1.1;
          e.darkness += r * 0.6;
          if (!this.flags.has('blackened') && this.ruin > 0.6) {
            this.flags.add('blackened');
            this.events.push({ type: 'blacken' });
          }
          this.pushEvent({ type: 'clash', value: violence }, 1.0);
        } else {
          e.chaos += r * 2.0;
          this.pushEvent({ type: 'chaos', value: violence }, 1.0);
        }
      }
    }

    // Swiftness: fire + shadow whipped at a boil.
    if (e.fire >= 0.5 && e.shadow >= 0.5 && T >= 100 && env.stirSpeed >= 3.2) {
      const r = 0.05 * Math.min(e.fire, e.shadow) * dt * Math.min(2, env.stirSpeed / 4);
      e.fire -= r;
      e.shadow -= r;
      e.speed += 1.3 * r;
      this.pushEvent({ type: 'swift' }, 1.0);
    }

    // Sanguine: healing and shadow bound by fire above 108°C.
    if (e.healing >= 0.5 && e.shadow >= 0.5 && e.fire >= 0.3 && T >= 108) {
      const r = 0.04 * Math.min(e.healing, e.shadow) * dt;
      e.healing -= r;
      e.shadow -= r;
      this.fragile.healing = Math.max(0, this.fragile.healing - r);
      e.blood += 1.5 * r;
      this.pushEvent({ type: 'sanguine' }, 1.2);
    }

    // Poison fumes.
    if (e.poison >= 0.6 && T >= 90) {
      e.poison -= 0.004 * e.poison * dt;
      this.pushEvent({ type: 'fumes', value: e.poison }, 0.7);
    }

    // ---- Overheating -------------------------------------------------------------
    if (T > 130 && this.water > 0.1) {
      this.overheatTime += dt;
      this.volatility += 0.035 * ((T - 130) / 10 + 0.5) * dt;
      this.foam += 0.3 * dt;
      this.stability -= 0.04 * dt;
      volatile = true;
    } else {
      this.overheatTime = Math.max(0, this.overheatTime - dt);
    }

    // Dry cauldron on a fire.
    if (this.water < 0.25 && T > 60 && (hasEssence || env.undissolvedMass > 0)) {
      this.ruin += 0.03 * dt;
      this.pushEvent({ type: 'dryburn' }, 1.0);
    }

    // ---- Foam ------------------------------------------------------------------------
    this.foam -= (0.07 + env.stirSpeed * 0.035) * dt;
    if (this.foam >= 1) {
      this.foam = 1.05;
      const spill = 0.07 * dt;
      this.removeLiquid(spill);
      this.stability -= 0.02 * dt;
      this.pushEvent({ type: 'boilover' }, 0.6);
    } else if (this.foam > 0.45) {
      this.pushEvent({ type: 'foam', value: this.foam }, 2.5);
    }
    this.foam = clamp(this.foam, 0, 1.1);

    // ---- Overload --------------------------------------------------------------------
    const load = this.load(env.undissolvedMass);
    const cap = this.loadCapacity(env.capacity);
    if (load > cap && (this.water > 0.1 || env.undissolvedMass > 0)) {
      // A few seconds of shaking and warnings before it goes off – time to
      // fish pieces out or add water.
      this.volatility += 0.16 * (load / cap - 1 + 0.25) * dt;
      volatile = true;
      this.pushEvent({ type: 'overload', value: load / cap }, 2.0);
    }

    // Raw chaos makes things jittery.
    if (e.chaos > 3) {
      this.volatility += 0.015 * dt;
      volatile = true;
    }

    if (!volatile) this.volatility = Math.max(0, this.volatility - 0.03 * dt);
    if (this.volatility > 0.55) this.pushEvent({ type: 'unstable', value: this.volatility }, 1.5);
    if (this.volatility >= 1) {
      this.events.push({ type: 'explode' });
      this.volatility = 0;
    }

    for (const a of ASPECT_IDS) if (e[a] < 0) e[a] = 0;
    this.stability = clamp01(this.stability);
    if (!hasEssence && this.ruin < 0.05) this.stability = 0.6;
  }

  private pushEvent(ev: BrewEvent, cooldown: number): void {
    const cd = this.eventCooldown.get(ev.type) ?? 0;
    if (cd > 0) return;
    this.eventCooldown.set(ev.type, cooldown);
    this.events.push(ev);
  }

  // -------------------------------------------------------------------------
  // Snapshot & persistence
  // -------------------------------------------------------------------------

  snapshot(): BrewSnapshot {
    const order = Object.keys(this.ingredientFirst).sort((a, b) => this.ingredientFirst[a] - this.ingredientFirst[b]);
    const temps: Record<string, number> = {};
    for (const id of order) {
      const ess = this.ingredientEssence[id] ?? 0;
      temps[id] = ess > 0 ? this.ingredientTempAccum[id] / ess : this.temperature;
    }
    const flags = [...this.flags];
    const total = this.totalEssence;
    if (total / Math.max(0.5, this.water) < 0.25 && this.ruin < 0.3) flags.push('nearly_empty');
    return {
      essences: { ...this.essences },
      water: this.water,
      ruin: this.ruin,
      stability: this.stability,
      agitation: this.agitation,
      volatility: this.volatility,
      brewTemp: this.essenceAccum > 0 ? this.tempAccum / this.essenceAccum : this.temperature,
      temperature: this.temperature,
      ingredientOrder: order,
      ingredientFirst: { ...this.ingredientFirst },
      ingredientTemps: temps,
      ingredientMass: { ...this.ingredientMass },
      ingredientStates: JSON.parse(JSON.stringify(this.ingredientStates)),
      flags,
      potencyMul: this.massAccum > 0 ? this.potencyAccum / this.massAccum : 1,
      totalEssence: total,
    };
  }

  serialize(): BrewSave {
    const compact = (m: Record<AspectId, number>) => {
      const o: Partial<Record<AspectId, number>> = {};
      for (const a of ASPECT_IDS) if (m[a] > 1e-4) o[a] = +m[a].toFixed(4);
      return o;
    };
    return {
      water: this.water,
      temperature: this.temperature,
      essences: compact(this.essences),
      fragile: compact(this.fragile),
      fragileRes: this.fragileRes,
      ruin: this.ruin,
      stability: this.stability,
      volatility: this.volatility,
      foam: this.foam,
      agitation: this.agitation,
      time: this.time,
      flags: [...this.flags],
      tempAccum: this.tempAccum,
      essenceAccum: this.essenceAccum,
      potencyAccum: this.potencyAccum,
      massAccum: this.massAccum,
      ingredientFirst: { ...this.ingredientFirst },
      ingredientMass: { ...this.ingredientMass },
      ingredientTempAccum: { ...this.ingredientTempAccum },
      ingredientEssence: { ...this.ingredientEssence },
      ingredientStates: JSON.parse(JSON.stringify(this.ingredientStates)),
      healingReleased: this.healingReleased,
      healingDegraded: this.healingDegraded,
      firstLight: this.firstLight,
      firstShadow: this.firstShadow,
    };
  }

  restore(s: BrewSave): void {
    this.reset();
    this.water = s.water ?? 0;
    this.temperature = s.temperature ?? ROOM_TEMP;
    for (const a of ASPECT_IDS) {
      this.essences[a] = s.essences?.[a] ?? 0;
      this.fragile[a] = s.fragile?.[a] ?? 0;
    }
    this.fragileRes = s.fragileRes ?? 95;
    this.ruin = s.ruin ?? 0;
    this.stability = s.stability ?? 0.6;
    this.volatility = s.volatility ?? 0;
    this.foam = s.foam ?? 0;
    this.agitation = s.agitation ?? 0;
    this.time = s.time ?? 0;
    this.flags = new Set(s.flags ?? []);
    this.tempAccum = s.tempAccum ?? 0;
    this.essenceAccum = s.essenceAccum ?? 0;
    this.potencyAccum = s.potencyAccum ?? 0;
    this.massAccum = s.massAccum ?? 0;
    this.ingredientFirst = { ...(s.ingredientFirst ?? {}) };
    this.ingredientMass = { ...(s.ingredientMass ?? {}) };
    this.ingredientTempAccum = { ...(s.ingredientTempAccum ?? {}) };
    this.ingredientEssence = { ...(s.ingredientEssence ?? {}) };
    this.ingredientStates = JSON.parse(JSON.stringify(s.ingredientStates ?? {}));
    this.healingReleased = s.healingReleased ?? 0;
    this.healingDegraded = s.healingDegraded ?? 0;
    this.firstLight = s.firstLight ?? -1;
    this.firstShadow = s.firstShadow ?? -1;
    this.lastZone = tempZone(this.temperature);
  }
}
