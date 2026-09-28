// Quests: givers visit to explain a problem (intro), the quest becomes
// active, and they come back on a later day to collect the potion.
// Rewards give gold, reputation and unlock new ingredients.

import type { GameContext } from '../../core/GameContext';
import { QUESTS, QUEST_MAP } from '../../data/quests';
import type { DayPhase, QuestDef } from '../../data/types';
import { INGREDIENTS } from '../../data/ingredients';
import type { CustomerSystem, Visit } from '../customers/CustomerSystem';
import type { Customer } from '../customers/Customer';
import { t, tr } from '../../core/i18n';

const PHASE_HOUR: Record<DayPhase, number> = { morning: 8.2, afternoon: 12.8, evening: 18.2, night: 21.4 };

export class QuestSystem {
  constructor(
    private readonly ctx: GameContext,
    private readonly customers: CustomerSystem,
  ) {
    customers.onQuestVisit = (c) => this.intro(c);
    customers.onQuestDelivered = (c, ok) => this.delivered(c, ok);
    ctx.bus.on('customer:served', ({ outcome }) => {
      const q = ctx.state.quests.first_brew;
      if (q?.status === 'active' && (outcome === 'happy' || outcome === 'delighted' || outcome === 'weak')) this.complete(QUEST_MAP.first_brew);
    });
    ctx.bus.on('potion:discovered', ({ recipeId }) => {
      for (const q of QUESTS) {
        const st = ctx.state.quests[q.id];
        if (st?.status === 'active' && q.objective.type === 'discover' && q.objective.recipe === recipeId) this.complete(q);
      }
    });
  }

  get active(): QuestDef[] {
    return QUESTS.filter((q) => this.ctx.state.quests[q.id]?.status === 'active');
  }

  /** Visits to add to a day's schedule (quest intros and returns). */
  visitsFor(day: number): Visit[] {
    const s = this.ctx.state;
    const out: Visit[] = [];
    for (const q of QUESTS) {
      if (q.giver === 'mentor') continue;
      const st = s.quests[q.id];
      const reqsDone = (q.requires ?? []).every((r) => s.quests[r]?.status === 'completed');
      if (!st && q.startDay <= day && reqsDone) {
        out.push({ hour: PHASE_HOUR[q.startPhase], customerId: q.giver, quest: { id: q.id, mode: 'intro' } });
      } else if (st?.status === 'active' && st.returnDay <= day && q.objective.type === 'deliver') {
        const def = this.ctx.state;
        void def;
        out.push({ hour: PHASE_HOUR[q.returnPhase], customerId: q.giver, quest: { id: q.id, mode: 'deliver' } });
      }
    }
    return out;
  }

  /** Start the tutorial quest on a fresh game. */
  startTutorialQuest(): void {
    const s = this.ctx.state;
    if (!s.quests.first_brew) {
      s.quests.first_brew = { id: 'first_brew', status: 'active', startedDay: s.day, returnDay: s.day };
      this.ctx.bus.emit('quest:started', { id: 'first_brew' });
    }
  }

  private intro(c: Customer): void {
    const ctx = this.ctx;
    const q = QUEST_MAP[c.quest!.id];
    const lines = q.intro.map((l) => tr(l));
    let delay = 0.3;
    for (const line of lines) {
      ctx.later(delay, () => c.alive && c.say(ctx, line, 'worried', Math.max(4.5, line.length * 0.065)));
      delay += Math.max(4.5, line.length * 0.065) + 0.3;
    }
    ctx.later(delay, () => {
      const s = ctx.state;
      s.quests[q.id] = { id: q.id, status: 'active', startedDay: s.day, returnDay: s.day + q.returnAfterDays };
      ctx.bus.emit('quest:started', { id: q.id });
      ctx.bus.emit('toast', { text: t('toast.questStarted', { name: tr(q.title) }), kind: 'quest' });
      ctx.audio.play('quest', {});
      if (q.teaches) ctx.bus.emit('mentor:say', { text: tr(q.teaches), priority: 2, mood: 'neutral' });
      c.line(ctx, 'leave');
      this.customers.dismiss(c);
      ctx.bus.emit('save:request', {});
    });
  }

  private delivered(c: Customer, ok: boolean): void {
    const ctx = this.ctx;
    const q = QUEST_MAP[c.quest!.id];
    const st = ctx.state.quests[q.id];
    if (!st) return;
    if (ok) {
      ctx.later(0.8, () => c.alive && c.say(ctx, tr(q.thanks), 'happy', 5));
      this.complete(q);
    } else {
      // They'll give you one more chance tomorrow.
      if (st.returnDay - st.startedDay > q.returnAfterDays + 1) {
        st.status = 'failed';
        ctx.bus.emit('quest:failed', { id: q.id });
        ctx.bus.emit('toast', { text: t('toast.questFailed', { name: tr(q.title) }), kind: 'bad' });
      } else st.returnDay = ctx.state.day + 1;
    }
  }

  complete(q: QuestDef): void {
    const ctx = this.ctx;
    const st = ctx.state.quests[q.id];
    if (!st || st.status === 'completed') return;
    st.status = 'completed';
    if (q.reward.money) ctx.state.addMoney(q.reward.money);
    if (q.reward.reputation) ctx.state.addReputation(q.reward.reputation);
    for (const id of q.reward.unlock ?? []) {
      ctx.state.unlock(id);
      ctx.state.addStock(id, 2);
      const src = ctx.shop.sources.get(id);
      if (src) {
        src.object.visible = true;
        src.interactive = true;
        if (!ctx.world.pickables.includes(src.object)) ctx.world.pickables.push(src.object);
      }
      ctx.bus.emit('toast', { text: t('toast.newIngredient', { name: tr(INGREDIENTS[id].name) }), kind: 'discovery' });
    }
    ctx.bus.emit('quest:completed', { id: q.id });
    ctx.bus.emit('toast', { text: t('toast.questDone', { name: tr(q.title) }), kind: 'quest' });
    ctx.audio.play('quest', {});
    ctx.bus.emit('save:request', {});
  }
}
