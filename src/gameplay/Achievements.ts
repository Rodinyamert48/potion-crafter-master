// Tracks achievement counters from game events and unlocks achievements
// (see data/achievements.ts) with a fanfare and a toast.

import type { GameContext } from '../core/GameContext';
import type { GameSystem } from '../core/Game';
import { ACHIEVEMENTS, type AchievementDef } from '../data/achievements';
import { t, tr } from '../core/i18n';
import { rng } from '../core/Random';
import * as THREE from 'three';

/** Chance per in-game hour for the lucky clover (≈ once every two weeks). */
export const LUCK_CHANCE = 1 / 160;

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
    bus.on('pet:petted', ({ kind }) => s().count(`${kind}Pets`));
    bus.on('pet:customized', () => s().count('petStyled'));
    // Pure luck: now and then a four-leaf clover drifts through the shop.
    bus.on('hour', () => {
      if (ctx.state.shopOpen && rng.chance(LUCK_CHANCE)) this.luck();
    });
    bus.on('trip:done', ({ region }) => s().count(`region_${region}`));
    bus.on('potion:bottled', ({ result }) => {
      if (result.tier >= 4) s().count('masterworks');
    });
    bus.on('day:end', () => {
      const d = s().dayStats;
      if (d.served >= 3 && d.happy === d.served) s().count('perfectDays');
    });
    // Check soon after anything interesting happens.
    for (const ev of ['potion:bottled', 'customer:served', 'celeb:served', 'quest:completed', 'purchase', 'money', 'day:start', 'cauldron:exploded', 'customer:frog', 'recipe:learned', 'pet:petted'] as const)
      bus.on(ev, () => (this.timer = Math.min(this.timer, 0.3)));
  }

  /** The lucky clover: a little gold and a secret achievement. */
  luck(): void {
    const ctx = this.ctx;
    const x = rng.range(-3.5, 3.5);
    const at = new THREE.Vector3(x, 1.4, rng.range(-2.2, 0.8));
    ctx.vfx.stars(at, '#63c74d', 30);
    ctx.vfx.magic(at, '#b6f59a', 16);
    ctx.ui.floatText(at, '🍀', '#63c74d');
    ctx.audio.play('chime', { x, pitch: 1.3 });
    ctx.state.addMoney(7);
    ctx.state.count('lucky');
    ctx.bus.emit('toast', { text: t('luck.toast'), kind: 'discovery' });
    this.timer = Math.min(this.timer, 0.5);
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
