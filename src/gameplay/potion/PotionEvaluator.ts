// Turns a brew snapshot into a named potion with a quality tier.
// Pure logic: recipes are data, the evaluator only interprets conditions.

import { ASPECT_IDS, ASPECTS } from '../../data/aspects';
import { RECIPES, RECIPE_MAP, TIER_PRICE } from '../../data/potions';
import type { AspectId, RecipeDef, ShareCondition } from '../../data/types';
import { clamp, mixHex, shadeHex, weightedHex } from '../../core/math';
import type { BrewSnapshot } from './BrewChemistry';

export type Tier = 1 | 2 | 3 | 4;

export interface PotionResult {
  recipeId: string;
  tier: Tier;
  potency: number;
  color: string;
  color2: string;
  tags: string[];
  price: number;
  stability: number;
  /** Compact description of how it was made (for the journal). */
  ingredients: string[];
  brewTemp: number;
}

/** Potency thresholds between tiers (Weak | Standard | Strong | Masterwork). */
export const TIER_THRESHOLDS = [1.0, 2.2, 3.6] as const;

const SORTED = [...RECIPES].sort((a, b) => b.priority - a.priority);

function inRange(v: number, c: ShareCondition | undefined): boolean {
  if (!c) return true;
  if (c.min !== undefined && v < c.min) return false;
  if (c.max !== undefined && v > c.max) return false;
  return true;
}

export function computeShares(essences: Record<AspectId, number>): { shares: Record<AspectId, number>; total: number } {
  let total = 0;
  for (const a of ASPECT_IDS) total += Math.max(0, essences[a] ?? 0);
  const shares = {} as Record<AspectId, number>;
  for (const a of ASPECT_IDS) shares[a] = total > 0 ? Math.max(0, essences[a] ?? 0) / total : 0;
  return { shares, total };
}

/** Explain which condition failed – used by tests and the debug overlay. */
export function recipeMismatch(recipe: RecipeDef, snap: BrewSnapshot): string | null {
  const { shares, total } = computeShares(snap.essences);
  const flags = new Set(snap.flags);
  const ruinShare = snap.ruin / Math.max(1e-6, total + snap.ruin);
  const liters = Math.max(0.5, snap.water);

  if (recipe.flags?.require) for (const f of recipe.flags.require) if (!flags.has(f)) return `flag:${f}`;
  if (recipe.flags?.forbid) for (const f of recipe.flags.forbid) if (flags.has(f)) return `forbid:${f}`;
  if (recipe.kind === 'potion' && flags.has('nearly_empty')) return 'empty';
  if (recipe.ruin && !inRange(ruinShare, recipe.ruin)) return 'ruin';
  if (recipe.kind === 'potion' && ruinShare > 0.16) return 'ruined';
  if (recipe.shares) {
    for (const [a, cond] of Object.entries(recipe.shares) as Array<[AspectId, ShareCondition]>) {
      if (!inRange(shares[a], cond)) return `share:${a}=${shares[a].toFixed(3)}`;
    }
  }
  if (recipe.combined) {
    for (const c of recipe.combined) {
      const s = c.aspects.reduce((acc, a) => acc + shares[a], 0);
      if (!inRange(s, c)) return `combined:${c.aspects.join('+')}=${s.toFixed(3)}`;
    }
  }
  if (recipe.requires) {
    for (const id of recipe.requires) if ((snap.ingredientMass[id] ?? 0) < 0.05) return `requires:${id}`;
  }
  if (recipe.order) {
    for (const [first, second] of recipe.order) {
      const a = snap.ingredientFirst[first];
      const b = snap.ingredientFirst[second];
      if (a === undefined || b === undefined) return `order-missing:${first}>${second}`;
      if (!(a < b)) return `order:${first}>${second}`;
    }
  }
  if (!inRange(snap.brewTemp, recipe.brewTemp)) return `brewTemp=${snap.brewTemp.toFixed(1)}`;
  if (recipe.ingredientTemp) {
    for (const [id, cond] of Object.entries(recipe.ingredientTemp)) {
      const t = snap.ingredientTemps[id];
      if (t === undefined || !inRange(t, cond)) return `ingredientTemp:${id}=${t?.toFixed(1)}`;
    }
  }
  if (!inRange(snap.stability, recipe.stability)) return `stability=${snap.stability.toFixed(2)}`;
  if (!inRange(snap.agitation, recipe.agitation)) return `agitation=${snap.agitation.toFixed(2)}`;
  if (recipe.minConcentration !== undefined) {
    const conc = recipe.primary.reduce((s, a) => s + snap.essences[a], 0) / liters;
    if (conc < recipe.minConcentration) return `concentration=${conc.toFixed(2)}`;
  }
  if (recipe.kind === 'potion' && recipe.primary.length > 0) {
    const prim = recipe.primary.reduce((s, a) => s + snap.essences[a], 0);
    if (prim <= 0.05) return 'no-primary';
  }
  return null;
}

export function computePotency(recipe: RecipeDef, snap: BrewSnapshot): number {
  if (recipe.primary.length === 0) return 0.5;
  const liters = Math.max(0.5, snap.water);
  const prim = recipe.primary.reduce((s, a) => s + snap.essences[a], 0);
  const conc = prim / liters;
  const power = snap.essences.power / liters;
  const powerBoost = recipe.primary.includes('power') ? 1 : 1 + Math.min(0.6, 0.22 * power);
  const magicBoost = 1 + Math.min(0.3, (0.05 * snap.essences.magic) / liters);
  const stability = 0.7 + 0.4 * snap.stability;
  const prep = clamp(snap.potencyMul, 0.5, 2);
  return conc * powerBoost * magicBoost * stability * prep * (recipe.potencyMul ?? 1);
}

export function tierFor(potency: number, maxTier?: Tier): Tier {
  let tier: Tier = 1;
  if (potency >= TIER_THRESHOLDS[0]) tier = 2;
  if (potency >= TIER_THRESHOLDS[1]) tier = 3;
  if (potency >= TIER_THRESHOLDS[2]) tier = 4;
  if (maxTier && tier > maxTier) tier = maxTier;
  return tier;
}

export function priceFor(recipe: RecipeDef, tier: Tier): number {
  return Math.max(1, Math.round(recipe.price * TIER_PRICE[tier]));
}

/** Colour of a brew from its essence mix, darkened by ruin. */
export function brewColor(essences: Record<AspectId, number>, ruin: number, water: number): string {
  const entries: Array<{ color: string; weight: number }> = [];
  for (const a of ASPECT_IDS) {
    const v = essences[a];
    if (v > 0.01) entries.push({ color: ASPECTS[a].color, weight: v * (a === 'darkness' ? 1.4 : 1) });
  }
  let c = weightedHex(entries, '#3b6f9e');
  const total = entries.reduce((s, e) => s + e.weight, 0);
  // Weak brews look watery.
  const strength = clamp(total / Math.max(0.5, water) / 2.5, 0, 1);
  c = mixHex('#3b6f9e', c, 0.35 + 0.65 * strength);
  const r = ruin / Math.max(0.2, total + ruin);
  if (r > 0) c = mixHex(c, '#1a1414', clamp(r * 2.2, 0, 0.9));
  return c;
}

export function evaluate(snap: BrewSnapshot): PotionResult {
  let recipe: RecipeDef = RECIPE_MAP.murky_sludge;
  for (const r of SORTED) {
    if (recipeMismatch(r, snap) === null) {
      recipe = r;
      break;
    }
  }
  const potency = computePotency(recipe, snap);
  const tier = recipe.kind === 'failure' && recipe.primary.length === 0 ? 1 : tierFor(potency, recipe.maxTier as Tier | undefined);
  // Blend the recipe colour with the actual brew for a little variety.
  const actual = brewColor(snap.essences, snap.ruin, snap.water);
  const color = mixHex(recipe.color, actual, 0.2);
  const color2 = tier >= 3 ? shadeHex(recipe.color2, 0.15) : recipe.color2;
  const ingredients = snap.ingredientOrder.map((id) => {
    const states = snap.ingredientStates[id] ?? [];
    return `${id}:${states.join('/')}`;
  });
  return {
    recipeId: recipe.id,
    tier,
    potency,
    color,
    color2,
    tags: recipe.tags,
    price: priceFor(recipe, tier),
    stability: snap.stability,
    ingredients,
    brewTemp: snap.brewTemp,
  };
}
