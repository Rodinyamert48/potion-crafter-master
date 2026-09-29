// Every cross-system event in the game and its payload.

import type { DayPhase, PrepState, ToolAction } from '../data/types';
import type { BrewEventType } from '../gameplay/potion/BrewChemistry';
import type { PotionResult } from '../gameplay/potion/PotionEvaluator';

export type ServeOutcome = 'delighted' | 'happy' | 'weak' | 'wrong' | 'harmful' | 'frog';
export type ToastKind = 'info' | 'good' | 'bad' | 'warn' | 'discovery' | 'quest';

export interface GameEvents {
  money: { money: number; delta: number };
  reputation: { value: number; delta: number };
  stock: { id: string; count: number };
  phase: { day: number; phase: DayPhase };
  hour: { day: number; hour: number };
  'day:start': { day: number };
  'day:end': { day: number };
  'shop:open': Record<string, never>;
  'shop:closed': Record<string, never>;
  /** The player touched the save crystal. */
  'crystal:touched': Record<string, never>;

  'ingredient:taken': { id: string };
  'ingredient:processed': { id: string; from: PrepState; to: PrepState; action: ToolAction };
  'ingredient:added': { id: string; state: PrepState };
  'ingredient:refused': { id: string; action: ToolAction; message: string };
  'water:added': { liters: number; total: number };
  'fire:level': { level: number };
  'fuel:added': { logs: number };
  'bellows': { boost: number };
  'cauldron:event': { type: BrewEventType; value?: number };
  'cauldron:exploded': Record<string, never>;
  'cauldron:drained': Record<string, never>;
  stir: { speed: number };
  'potion:bottled': { result: PotionResult; discovered: boolean; entityId: number };
  'potion:discovered': { recipeId: string };
  'potion:broken': { recipeId: string | null };

  'customer:arrived': { uid: number; customerId: string };
  'customer:ordered': { uid: number; customerId: string; requestId: string };
  'customer:served': { uid: number; customerId: string; outcome: ServeOutcome; paid: number; recipeId: string; tier: number };
  'customer:left': { uid: number; customerId: string; reason: 'done' | 'impatient' | 'angry' | 'fled' };
  'customer:frog': { uid: number };
  'frog:cured': { uid: number };
  'frog:escaped': { uid: number };

  'quest:started': { id: string };
  'quest:completed': { id: string };
  'quest:failed': { id: string };
  'tutorial:step': { step: string };

  toast: { text: string; kind?: ToastKind };
  /** `card`: the text is already shown on the HUD mentor card – speak without a bubble. */
  'mentor:say': { text: string; priority?: number; mood?: 'happy' | 'worried' | 'angry' | 'sleepy' | 'neutral'; card?: boolean };
  chaos: { amount: number };
  shake: { amount: number };
  flash: { amount: number; color?: string };
  purchase: { id: string; kind: 'supply' | 'upgrade' };
  'bell:rung': Record<string, never>;
  'sign:clicked': Record<string, never>;
  'ui:panel': { panel: string | null };
  'save:request': Record<string, never>;
  'settings:changed': Record<string, never>;
}
