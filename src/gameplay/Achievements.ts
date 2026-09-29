// Tracks achievement counters from game events and unlocks achievements
// (see data/achievements.ts) with a fanfare and a toast.

import type { GameContext } from '../core/GameContext';
import type { GameSystem } from '../core/Game';
import { ACHIEVEMENTS, type AchievementDef } from '../data/achievements';
import { t, tr } from '../core/i18n';

export class Achievements implements GameSystem {
  private timer = 0;
  /** Suppress toasts for achievements already earned in a loaded save. */
  private primed = false;

  constructor(private readonly ctx: GameContext) {
    const bus = ctx.bus;
    const s = () => ctx.state;
    bus.on('cat:petted', () => s().count('catPets'));
    bus.on('cat:customized', () => s().count('catStyled'));
    bus.on('frog:cured', () => s().count('cured'));
    bus.on('merchant:trade', () => s().count('trades'));
    bus.on('crystal:touched', () => s().count('crystal'));
    bus.on('trip:done', ({ region }) => s().count(`region_${region}`));
    bus.on('potion:bottled', ({ result }) => {
      if (result.tier >= 4) s().count('masterworks');
    });
    bus.on('day:end', () => {
      const d = s().dayStats;
      if (d.served >= 3 && d.happy === d.served) s().count('perfectDays');
    });
    // Check soon after anything interesting happens.
    for (const ev of ['potion:bottled', 'customer:served', 'celeb:served', 'quest:completed', 'purchase', 'money', 'day:start', 'cauldron:exploded', 'customer:frog'] as const)
      bus.on(ev, () => (this.timer = Math.min(this.timer, 0.3)));
  }

  get unlockedCount(): number {
    return Object.keys(this.ctx.state.achievements).length;
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.5;
    this.evaluate();
  }

  /** Unlock everything whose condition now holds. */
  evaluate(): AchievementDef[] {
    const ctx = this.ctx;
    const s = ctx.state;
    const fresh: AchievementDef[] = [];
    for (const a of ACHIEVEMENTS) {
      if (s.achievements[a.id] !== undefined) continue;
      let ok = false;
      try {
        ok = a.check(s);
      } catch {
        ok = false;
      }
      if (!ok) continue;
      s.achievements[a.id] = s.day;
      fresh.push(a);
    }
    if (fresh.length && this.primed) {
      fresh.forEach((a, i) =>
        ctx.later(i * 1.2, () => {
          ctx.audio.play('achievement', {});
          ctx.bus.emit('toast', { text: `🏆 ${t('ach.unlocked')}: ${tr(a.name)}`, kind: 'achievement' });
          ctx.bus.emit('achievement', { id: a.id });
        }),
      );
      ctx.bus.emit('save:request', {});
    }
    this.primed = true;
    return fresh;
  }
}
