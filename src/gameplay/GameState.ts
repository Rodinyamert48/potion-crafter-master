// Persistent game model: everything that must survive a page reload.
// Mutations go through methods that emit events so the UI and other systems
// stay in sync without polling.

import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { DayPhase, UpgradeEffects } from '../data/types';
import { UPGRADE_MAP } from '../data/upgrades';
import { INGREDIENTS } from '../data/ingredients';
import { clamp } from '../core/math';
import { defaultCat, type CatLook } from '../data/cat';

export interface DiscoveryEntry {
  day: number;
  count: number;
  bestTier: number;
  ingredients: string[];
  brewTemp: number;
}

export interface JournalEntry {
  day: number;
  hour: number;
  recipeId: string;
  tier: number;
  success: boolean;
  ingredients: string[];
  brewTemp: number;
  event?: 'explosion' | 'vortex';
}

export type QuestStatus = 'active' | 'completed' | 'failed';

export interface QuestState {
  id: string;
  status: QuestStatus;
  startedDay: number;
  returnDay: number;
}

export interface DayStats {
  earned: number;
  spent: number;
  served: number;
  happy: number;
  repDelta: number;
  discoveries: number;
  explosions: number;
  frogs: number;
}

const newDayStats = (): DayStats => ({ earned: 0, spent: 0, served: 0, happy: 0, repDelta: 0, discoveries: 0, explosions: 0, frogs: 0 });

export class GameState {
  money = 40;
  reputation = 20;
  day = 1;
  hour = 7;
  stock: Record<string, number> = { glowing_mushroom: 6, bat_wing: 4, dragon_scale: 3 };
  flasks = 8;
  logs = 8;
  unlocked: string[] = Object.values(INGREDIENTS)
    .filter((i) => i.startUnlocked)
    .map((i) => i.id);
  discovered: Record<string, DiscoveryEntry> = {};
  /** Ingredients whose essences the player has learned. */
  knownIngredients: string[] = [];
  /** Recipes whose hint the player has seen (customers asked for them). */
  hinted: string[] = [];
  journal: JournalEntry[] = [];
  quests: Record<string, QuestState> = {};
  upgrades: string[] = [];
  tutorialStep = 0;
  tutorialDone = false;
  shopOpen = true;
  stats = { sold: 0, happy: 0, frogs: 0, explosions: 0, brewed: 0, earned: 0, trips: 0 };
  dayStats: DayStats = newDayStats();
  /** Customers already scheduled/served today (ids). */
  servedToday: string[] = [];
  /** The shop cat's name and look. */
  cat: CatLook = defaultCat();

  constructor(private readonly bus: EventBus<GameEvents>) {}

  // -------------------------------------------------------------------------
  // Economy
  // -------------------------------------------------------------------------

  canAfford(n: number): boolean {
    return this.money >= n;
  }

  addMoney(delta: number): void {
    if (delta === 0) return;
    this.money = Math.max(0, Math.round(this.money + delta));
    if (delta > 0) {
      this.dayStats.earned += delta;
      this.stats.earned += delta;
    } else this.dayStats.spent += -delta;
    this.bus.emit('money', { money: this.money, delta });
  }

  addReputation(delta: number): void {
    const before = this.reputation;
    this.reputation = clamp(this.reputation + delta, 0, 100);
    const d = this.reputation - before;
    if (d === 0) return;
    this.dayStats.repDelta += d;
    this.bus.emit('reputation', { value: this.reputation, delta: d });
  }

  /** 0..5 stars. */
  get stars(): number {
    return this.reputation / 20;
  }

  // -------------------------------------------------------------------------
  // Stock
  // -------------------------------------------------------------------------

  stockOf(id: string): number {
    if (id === 'flask') return this.flasks;
    if (id === 'log') return this.logs;
    return this.stock[id] ?? 0;
  }

  addStock(id: string, n: number): void {
    if (id === 'flask') this.flasks = Math.max(0, this.flasks + n);
    else if (id === 'log') this.logs = Math.max(0, this.logs + n);
    else this.stock[id] = Math.max(0, (this.stock[id] ?? 0) + n);
    this.bus.emit('stock', { id, count: this.stockOf(id) });
  }

  take(id: string): boolean {
    if (this.stockOf(id) <= 0) return false;
    this.addStock(id, -1);
    return true;
  }

  isUnlocked(ingredientId: string): boolean {
    return this.unlocked.includes(ingredientId);
  }

  unlock(ingredientId: string): void {
    if (!this.unlocked.includes(ingredientId)) this.unlocked.push(ingredientId);
  }

  knows(ingredientId: string): boolean {
    return this.knownIngredients.includes(ingredientId);
  }

  learn(ingredientId: string): boolean {
    if (this.knows(ingredientId)) return false;
    this.knownIngredients.push(ingredientId);
    return true;
  }

  // -------------------------------------------------------------------------
  // Upgrades
  // -------------------------------------------------------------------------

  has(upgradeId: string): boolean {
    return this.upgrades.includes(upgradeId);
  }

  get effects(): Required<Pick<UpgradeEffects, 'heatMul' | 'bellowsMul' | 'grindMul' | 'stockCapMul' | 'discount' | 'reputationBonus' | 'autoStir' | 'fireDecayMul' | 'stabilityAssist'>> & {
    cauldronCapacity: number;
    preciseThermometer: boolean;
  } {
    const e = {
      cauldronCapacity: 6,
      heatMul: 1,
      bellowsMul: 1,
      grindMul: 1,
      stockCapMul: 1,
      discount: 0,
      reputationBonus: 0,
      autoStir: 0,
      fireDecayMul: 1,
      stabilityAssist: 0,
      preciseThermometer: false,
    };
    for (const id of this.upgrades) {
      const u = UPGRADE_MAP[id];
      if (!u) continue;
      const x = u.effects;
      if (x.cauldronCapacity) e.cauldronCapacity = Math.max(e.cauldronCapacity, x.cauldronCapacity);
      if (x.heatMul) e.heatMul = Math.max(e.heatMul, x.heatMul);
      if (x.bellowsMul) e.bellowsMul *= x.bellowsMul;
      if (x.grindMul) e.grindMul *= x.grindMul;
      if (x.stockCapMul) e.stockCapMul *= x.stockCapMul;
      if (x.discount) e.discount += x.discount;
      if (x.reputationBonus) e.reputationBonus += x.reputationBonus;
      if (x.autoStir) e.autoStir = Math.max(e.autoStir, x.autoStir);
      if (x.fireDecayMul) e.fireDecayMul *= x.fireDecayMul;
      if (x.stabilityAssist) e.stabilityAssist = Math.max(e.stabilityAssist, x.stabilityAssist);
      if (x.preciseThermometer) e.preciseThermometer = true;
    }
    return e;
  }

  get shopLevel(): number {
    const equipment = this.upgrades.filter((id) => UPGRADE_MAP[id]?.category !== 'decoration').length;
    return equipment >= 3 ? 3 : equipment >= 1 ? 2 : 1;
  }

  // -------------------------------------------------------------------------
  // Time
  // -------------------------------------------------------------------------

  get phase(): DayPhase {
    return phaseOf(this.hour);
  }

  startNewDay(): void {
    this.day += 1;
    this.hour = 7;
    this.shopOpen = true;
    this.dayStats = newDayStats();
    this.servedToday = [];
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  toJSON(): Record<string, unknown> {
    return {
      money: this.money,
      reputation: this.reputation,
      day: this.day,
      hour: this.hour,
      stock: this.stock,
      flasks: this.flasks,
      logs: this.logs,
      unlocked: this.unlocked,
      discovered: this.discovered,
      knownIngredients: this.knownIngredients,
      hinted: this.hinted,
      journal: this.journal.slice(-60),
      quests: this.quests,
      upgrades: this.upgrades,
      tutorialStep: this.tutorialStep,
      tutorialDone: this.tutorialDone,
      shopOpen: this.shopOpen,
      stats: this.stats,
      dayStats: this.dayStats,
      servedToday: this.servedToday,
      cat: this.cat,
    };
  }

  load(d: Record<string, unknown>): void {
    const g = d as Partial<GameState>;
    this.money = g.money ?? this.money;
    this.reputation = g.reputation ?? this.reputation;
    this.day = g.day ?? this.day;
    this.hour = g.hour ?? this.hour;
    this.stock = { ...this.stock, ...(g.stock ?? {}) };
    this.flasks = g.flasks ?? this.flasks;
    this.logs = g.logs ?? this.logs;
    this.unlocked = g.unlocked ?? this.unlocked;
    this.discovered = g.discovered ?? {};
    this.knownIngredients = g.knownIngredients ?? [];
    this.hinted = g.hinted ?? [];
    this.journal = g.journal ?? [];
    this.quests = g.quests ?? {};
    this.upgrades = g.upgrades ?? [];
    this.tutorialStep = g.tutorialStep ?? 0;
    this.tutorialDone = g.tutorialDone ?? false;
    this.shopOpen = g.shopOpen ?? true;
    this.stats = { ...this.stats, ...(g.stats ?? {}) };
    this.dayStats = { ...newDayStats(), ...(g.dayStats ?? {}) };
    this.servedToday = g.servedToday ?? [];
    this.cat = { ...defaultCat(), ...(g.cat ?? {}) };
  }
}

export function phaseOf(hour: number): DayPhase {
  if (hour < 11) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}
