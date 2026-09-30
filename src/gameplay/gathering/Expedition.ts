// Gathering trips: the rules around leaving the shop. While the apprentice is
// away the shop is paused (the master watches the cauldron), visitors who
// would have arrived are missed and the haul goes into the shop's bins.
// Two kinds of trips share these rules: the quick region trips (touch
// devices: pick a region, play its mini game, the clock jumps ahead) and
// outings into the open world on PC, where the clock simply keeps running.

import type { GameContext } from '../../core/GameContext';
import type { RegionDef, RegionFind, RegionHazard } from '../../data/regions';
import { REGION_MAP, type RegionId } from '../../data/regions';
import { INGREDIENTS } from '../../data/ingredients';
import type { CustomerSystem } from '../customers/CustomerSystem';
import { t, tr } from '../../core/i18n';
import { ROAMING_WOLVES, isWolfDay } from '../WorldEvents';

export class Expedition {
  /** Game hour the current trip started (null when at home). */
  private departedAt: number | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly customers: CustomerSystem,
  ) {}

  get away(): boolean {
    return this.departedAt !== null;
  }

  isNight(hour = this.ctx.state.hour): boolean {
    return hour >= 20 || hour < 6;
  }

  /** Why the apprentice cannot leave the shop right now, or null. */
  leaveBlocker(): string | null {
    const s = this.ctx.state;
    if (!s.tutorialDone) return t('trip.tutorial');
    if (this.ctx.interaction.grab) return t('trip.holding');
    if (this.customers.queue.length > 0) return t('trip.customers');
    if (s.hour > 23.3) return t('out.tooLate');
    return null;
  }

  /** Why a region cannot be entered (day / reputation), or null. */
  regionLock(region: RegionDef): string | null {
    const s = this.ctx.state;
    if (region.minDay && s.day < region.minDay) return t('trip.lockedDay', { d: region.minDay });
    if (region.minReputation && s.reputation < region.minReputation) return t('trip.lockedRep', { n: region.minReputation });
    return null;
  }

  /** Why the quick trip cannot start right now, or null if it can. */
  blocker(region: RegionDef): string | null {
    const s = this.ctx.state;
    if (!s.tutorialDone) return t('trip.tutorial');
    const lock = this.regionLock(region);
    if (lock) return lock;
    if (this.ctx.interaction.grab) return t('trip.holding');
    if (this.customers.queue.length > 0) return t('trip.customers');
    if (s.hour + region.hours > 23.9) return t('trip.tooLate');
    return null;
  }

  /** Finds and hazards available on this trip (time of day, quests and wolf days). */
  pools(region: RegionDef, hour = this.ctx.state.hour): { finds: RegionFind[]; hazards: RegionHazard[] } {
    const night = this.isNight(hour);
    const okWhen = (w?: 'night' | 'day') => !w || (w === 'night') === night;
    const quests = this.ctx.state.quests;
    const wolves = isWolfDay(this.ctx.state.day);
    const hazards = region.hazards.filter((h) => (wolves && h.id === 'wolf') || (okWhen(h.when) && (!h.untilQuest || quests[h.untilQuest]?.status !== 'completed')));
    // Every third day the pack roams every region, day and night.
    if (wolves && !hazards.some((h) => h.id === 'wolf')) hazards.push(ROAMING_WOLVES);
    return {
      finds: region.finds.filter((f) => okWhen(f.when) && INGREDIENTS[f.ingredientId]),
      hazards,
    };
  }

  /** Wolves roam every region today. */
  get wolfDay(): boolean {
    return isWolfDay(this.ctx.state.day);
  }

  depart(region: RegionDef): void {
    this.departedAt = this.ctx.state.hour;
    this.ctx.audio.play('doorCreak', { volume: 0.6 });
    void region;
  }

  /** Back home from a quick trip: advance the clock, then settle up. */
  returnHome(region: RegionDef, haul: Record<string, number>): void {
    const s = this.ctx.state;
    const from = this.departedAt ?? s.hour;
    const to = Math.min(23.95, from + region.hours);
    s.hour = to;
    this.settle(from, to, haul, [region.id], tr(region.name));
  }

  /** The open world: the apprentice walks out of the door. */
  leave(): void {
    this.departedAt = this.ctx.state.hour;
    this.ctx.audio.play('doorCreak', { volume: 0.6 });
  }

  /** Back from the open world (the clock already ran while outside). */
  comeBack(haul: Record<string, number>, regions: RegionId[]): void {
    const s = this.ctx.state;
    const from = this.departedAt ?? s.hour;
    const names = regions.map((r) => tr(REGION_MAP[r]?.name)).filter(Boolean);
    this.settle(from, s.hour, haul, regions, names.length ? names.join(', ') : t('out.outside'));
  }

  /** Missed visitors, the haul into the bins, toasts and the save. */
  private settle(from: number, to: number, haul: Record<string, number>, regions: string[], label: string): void {
    const ctx = this.ctx;
    const s = ctx.state;
    this.departedAt = null;

    let missed = 0;
    for (const v of this.customers.pendingVisits) {
      if (v.hour >= from && v.hour < to && !v.tutorial && !v.spawned) {
        v.spawned = true;
        // Quest visitors simply come back another day (the quest schedule
        // re-offers them); ordinary customers are lost.
        if (!v.quest) missed++;
      }
    }

    const parts: string[] = [];
    for (const [id, n] of Object.entries(haul)) {
      if (n <= 0) continue;
      const def = INGREDIENTS[id];
      if (!def) continue;
      this.unlockIngredient(id);
      s.addStock(id, n);
      parts.push(`${n}× ${tr(def.name)}`);
    }
    s.stats.trips = (s.stats.trips ?? 0) + 1;
    for (const r of regions) ctx.bus.emit('trip:done', { region: r });
    ctx.audio.play('doorBell', {});
    ctx.bus.emit('toast', { text: parts.length ? t('trip.back', { r: label, items: parts.join(', ') }) : t('trip.empty'), kind: parts.length ? 'good' : 'info' });
    if (missed > 0) ctx.bus.emit('toast', { text: t('trip.missed', { n: missed }), kind: 'warn' });
    ctx.bus.emit('mentor:say', { text: t('mentor.welcomeBack'), priority: 2, mood: 'happy' });
    ctx.bus.emit('save:request', {});
  }

  /** First find of an ingredient: its bin appears in the shop. */
  unlockIngredient(id: string): void {
    const ctx = this.ctx;
    const s = ctx.state;
    const def = INGREDIENTS[id];
    if (!def || s.isUnlocked(id)) return;
    s.unlock(id);
    const src = ctx.shop.sources.get(id);
    if (src) {
      src.object.visible = true;
      src.interactive = true;
      if (!ctx.world.pickables.includes(src.object)) ctx.world.pickables.push(src.object);
    }
    ctx.bus.emit('toast', { text: t('toast.newIngredient', { name: tr(def.name) }), kind: 'discovery' });
  }
}
