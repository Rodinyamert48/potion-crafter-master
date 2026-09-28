// Judging a served potion against an order and pricing the outcome.
// Pure logic so it can be tested.

import type { CustomerDef, CustomerRequest } from '../../data/types';
import type { ServeOutcome } from '../../core/events';
import type { PotionResult } from '../potion/PotionEvaluator';
import { RECIPE_MAP } from '../../data/potions';

export interface Judgement {
  outcome: ServeOutcome;
  pay: number;
  tip: number;
  reputation: number;
}

const HARMFUL = new Set(['poison', 'sludge', 'explode', 'frog']);

export function matchesRequest(req: CustomerRequest, potion: PotionResult): boolean {
  if (req.anyOf?.includes(potion.recipeId)) return true;
  return req.tags.every((t) => potion.tags.includes(t));
}

export function judge(customer: CustomerDef, req: CustomerRequest, potion: PotionResult, waitedFraction: number, repBonus = 0): Judgement {
  const recipe = RECIPE_MAP[potion.recipeId];
  const drink = recipe?.drink ?? 'sludge';
  const base = potion.price;
  if (matchesRequest(req, potion)) {
    if (potion.tier >= req.minTier) {
      const extraTiers = potion.tier - req.minTier;
      const pay = Math.min(customer.budget, Math.round(base * (1 + extraTiers * 0.15)));
      const speed = Math.max(0, 1 - waitedFraction);
      const tip = Math.round(pay * customer.generosity * (0.4 * speed + 0.35 * extraTiers));
      return {
        outcome: extraTiers > 0 ? 'delighted' : 'happy',
        pay,
        tip,
        reputation: 3 + extraTiers * 2 + repBonus,
      };
    }
    return { outcome: 'weak', pay: Math.min(customer.budget, Math.round(base * 0.55)), tip: 0, reputation: 0 };
  }
  if (drink === 'frog') return { outcome: 'frog', pay: 0, tip: 0, reputation: -3 };
  if (HARMFUL.has(drink)) return { outcome: 'harmful', pay: 0, tip: 0, reputation: -6 };
  return { outcome: 'wrong', pay: Math.round(Math.min(customer.budget, base) * 0.15), tip: 0, reputation: -2 };
}
