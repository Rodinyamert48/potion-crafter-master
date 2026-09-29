// Brew guide: looks at the order of the customer at the counter and at what
// is in the cauldron, and says in plain words what is still missing
// ("add a Dragon Scale", "heat it above 70°C", "stirring: Strong"…).

import type { CustomerRequest, RecipeDef, ShareCondition } from '../../data/types';
import { RECIPES } from '../../data/potions';
import { INGREDIENTS } from '../../data/ingredients';
import { ASPECTS } from '../../data/aspects';
import type { AspectId } from '../../data/types';
import type { GameState } from '../GameState';
import type { BrewSnapshot } from './BrewChemistry';
import { recipeMismatch, computePotency, tierFor, computeShares } from './PotionEvaluator';
import { t, tr } from '../../core/i18n';

export interface BrewGuide {
  recipe: RecipeDef;
  known: boolean;
  /** Plain-language tips, most important first (empty when on track). */
  tips: string[];
  /** The brew already is the ordered potion at the wanted quality. */
  ready: boolean;
}

/** Potions that would satisfy the request, best candidates first. */
export function recipesFor(req: CustomerRequest): RecipeDef[] {
  return RECIPES.filter((r) => r.kind === 'potion' && (req.anyOf?.includes(r.id) || (req.tags.length > 0 && req.tags.every((tag) => r.tags.includes(tag)))));
}

/** The recipe to aim for: a known one if possible (the simplest known first). */
export function targetRecipe(state: GameState, req: CustomerRequest): { recipe: RecipeDef; known: boolean } | null {
  const all = recipesFor(req);
  if (all.length === 0) return null;
  const known = all.filter((r) => state.knowsRecipe(r.id));
  // Simplest first: fewer conditions and lower priority tend to be the basics.
  const cost = (r: RecipeDef) => (r.requires?.length ?? 0) + (r.order?.length ?? 0) * 2 + (r.agitation ? 1 : 0) + (r.secret ? 3 : 0);
  const pick = (list: RecipeDef[]) => [...list].sort((a, b) => cost(a) - cost(b) || a.priority - b.priority)[0];
  return known.length ? { recipe: pick(known), known: true } : { recipe: pick(all), known: false };
}

const ing = (id: string) => tr(INGREDIENTS[id]?.name ?? { en: id, tr: id });

function range(c: ShareCondition | undefined): string {
  if (!c) return '';
  if (c.min !== undefined && c.max !== undefined) return `${c.min}–${c.max}°C`;
  if (c.min !== undefined) return t('book.m.above', { t: c.min });
  return t('book.m.below', { t: c.max ?? 0 });
}

/** Turn an evaluator mismatch code into a tip for the player. */
function tipFor(r: RecipeDef, code: string, snap: BrewSnapshot): string {
  // Codes look like "requires:dragon_scale", "brewTemp=45.2", "share:fire=0.1"…
  const i = code.search(/[:=]/);
  const kind = i < 0 ? code : code.slice(0, i);
  const rest = i < 0 ? '' : code.slice(i + 1);
  switch (kind) {
    case 'requires':
      return t('guide.add', { i: ing(rest) });
    case 'state': {
      const id = rest.split('=')[0];
      const states = (r.states?.[id] ?? []).map((st) => tr(INGREDIENTS[id]?.states[st]?.name ?? { en: st, tr: st })).join(t('book.or'));
      return t('guide.prep', { i: ing(id), s: states });
    }
    case 'order':
    case 'order-missing': {
      const [a, b] = rest.split('>');
      return t('guide.order', { a: ing(a), b: ing(b) });
    }
    case 'brewTemp':
      return t('guide.temp', { r: range(r.brewTemp), now: Math.round(snap.temperature) });
    case 'ingredientTemp': {
      const id = rest.split('=')[0];
      return t('guide.addAt', { i: ing(id), r: range(r.ingredientTemp?.[id]) });
    }
    case 'water':
      return r.water?.min !== undefined && snap.water < r.water.min ? t('guide.moreWater', { l: r.water.min }) : t('guide.lessWater', { l: r.water?.max ?? 0 });
    case 'stability':
      return t('guide.calm');
    case 'agitation':
      return r.agitation?.min !== undefined && snap.agitation < r.agitation.min ? t('guide.strong') : t('guide.slower');
    case 'concentration':
    case 'no-primary':
    case 'empty':
      return t('guide.more');
    case 'forbid':
      return rest === 'scorched' ? t('guide.scorched') : t('guide.restart');
    case 'ruin':
    case 'ruined':
      return t('guide.restart');
    case 'share':
    case 'combined': {
      const aspect = rest.split('=')[0].split('+')[0] as AspectId;
      const cond = kind === 'share' ? r.shares?.[aspect] : r.combined?.[0];
      const { shares } = computeShares(snap.essences);
      const tooMuch = cond?.max !== undefined && (shares[aspect] ?? 0) > cond.max;
      if (!tooMuch && r.stir === 'strong') return t('guide.strong');
      const name = tr(ASPECTS[aspect]?.name ?? { en: aspect, tr: aspect });
      return tooMuch ? t('guide.tooMuch', { a: name }) : t('guide.tooLittle', { a: name });
    }
    default:
      return t('guide.restart');
  }
}

/** What the player should do next for this order (null without an order). */
export function brewGuide(state: GameState, req: CustomerRequest, snap: BrewSnapshot | null, hasBrew: boolean, dissolving = false): BrewGuide | null {
  const target = targetRecipe(state, req);
  if (!target) return null;
  const r = target.recipe;
  if (!hasBrew || !snap) {
    const first = [...(r.order?.[0] ? [r.order[0][0]] : []), ...(r.requires ?? [])][0];
    return { recipe: r, known: target.known, tips: [first ? t('guide.add', { i: ing(first) }) : t('guide.start')], ready: false };
  }
  const miss = recipeMismatch(r, snap);
  if (!miss) {
    const tier = tierFor(computePotency(r, snap), r.maxTier);
    if (tier >= req.minTier) return { recipe: r, known: target.known, tips: [], ready: true };
    return { recipe: r, known: target.known, tips: [t(dissolving ? 'guide.wait' : 'guide.stronger')], ready: false };
  }
  // Pieces still melting into the brew: most "not enough yet" problems fix themselves.
  if (dissolving && /^(concentration|no-primary|empty|share|combined)/.test(miss)) return { recipe: r, known: target.known, tips: [t('guide.wait')], ready: false };
  return { recipe: r, known: target.known, tips: [tipFor(r, miss, snap)], ready: false };
}
