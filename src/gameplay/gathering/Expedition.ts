// Gathering trips: the rules around leaving the shop. While the apprentice is
// away the world is paused (the master watches the cauldron), the clock jumps
// ahead by the trip length, visitors who would have arrived are missed and
// the haul goes into the shop's bins.

import type { GameContext } from '../../core/GameContext';
import type { RegionDef, RegionFind, RegionHazard } from '../../data/regions';
import { INGREDIENTS } from '../../data/ingredients';
import type { CustomerSystem } from '../customers/CustomerSystem';
import { t, tr } from '../../core/i18n';

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

  /** Why the trip cannot start right now, or null if it can. */
  blocker(region: RegionDef): string | null {
    const s = this.ctx.state;
    if (!s.tutorialDone) return t('trip.tutorial');
    if (region.minDay && s.day < region.minDay) return t('trip.lockedDay', { d: region.minDay });
    if (region.minReputation && s.reputation < region.minReputation) return t('trip.lockedRep', { n: region.minReputation });
    if (this.ctx.interaction.grab) return t('trip.holding');
    if (this.customers.queue.length > 0) return t('trip.customers');
    if (s.hour + region.hours > 23.9) return t('trip.tooLate');
    return null;
  }

  /** Finds and hazards available on this trip (time of day and quests). */
  pools(region: RegionDef): { finds: RegionFind[]; hazards: RegionHazard[] } {
    const night = this.isNight();
    const okWhen = (w?: 'night' | 'day') => !w || (w === 'night') === night;
    const quests = this.ctx.state.quests;
    return {
      finds: region.finds.filter((f) => okWhen(f.when) && INGREDIENTS[f.ingredientId]),
      hazards: region.hazards.filter((h) => okWhen(h.when) && (!h.untilQuest || quests[h.untilQuest]?.status !== 'completed')),
    };
  }

  depart(region: RegionDef): void {
    this.departedAt = this.ctx.state.hour;
    this.ctx.audio.play('doorCreak', { volume: 0.6 });
    void region;
  }

  /** Back home: advance the clock, account for missed visitors, stock the haul. */
  returnHome(region: RegionDef, haul: Record<string, number>): void {
    const ctx = this.ctx;
    const s = ctx.state;
    const from = this.departedAt ?? s.hour;
    const to = Math.min(23.95, from + region.hours);
    this.departedAt = null;

    let missed = 0;
    for (const v of this.customers.pendingVisits) {
      if (v.hour >= from && v.hour < to && !v.tutorial) {
        v.spawned = true;
        // Quest visitors simply come back another day (the quest schedule
        // re-offers them); ordinary customers are lost.
        if (!v.quest) missed++;
      }
    }
    s.hour = to;

    const parts: string[] = [];
    for (const [id, n] of Object.entries(haul)) {
      if (n <= 0) continue;
      const def = INGREDIENTS[id];
      if (!def) continue;
      if (!s.isUnlocked(id)) {
        s.unlock(id);
        const src = ctx.shop.sources.get(id);
        if (src) {
          src.object.visible = true;
          src.interactive = true;
          if (!ctx.world.pickables.includes(src.object)) ctx.world.pickables.push(src.object);
        }
        ctx.bus.emit('toast', { text: t('toast.newIngredient', { name: tr(def.name) }), kind: 'discovery' });
      }
      s.addStock(id, n);
      parts.push(`${n}× ${tr(def.name)}`);
    }
    s.stats.trips = (s.stats.trips ?? 0) + 1;
    ctx.bus.emit('trip:done', { region: region.id });
    ctx.audio.play('doorBell', {});
    ctx.bus.emit('toast', { text: parts.length ? t('trip.back', { r: tr(region.name), items: parts.join(', ') }) : t('trip.empty'), kind: parts.length ? 'good' : 'info' });
    if (missed > 0) ctx.bus.emit('toast', { text: t('trip.missed', { n: missed }), kind: 'warn' });
    ctx.bus.emit('mentor:say', { text: t('mentor.welcomeBack'), priority: 2, mood: 'happy' });
    ctx.bus.emit('save:request', {});
  }
}
