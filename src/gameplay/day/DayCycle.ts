// Time of day: morning → afternoon → evening → night. The shop opens at 7:00
// and closes at 22:00; after that the apprentice can keep brewing until
// sleeping (via the shop sign) or midnight ends the day automatically.

import type { GameContext } from '../../core/GameContext';
import type { GameSystem } from '../../core/Game';
import { phaseOf } from '../GameState';
import type { DayPhase } from '../../data/types';
import { t } from '../../core/i18n';

/** Real seconds per in-game hour. */
export const SECONDS_PER_HOUR = 38;
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 22;
export const MIDNIGHT = 24.5;

export class DayCycle implements GameSystem {
  private lastPhase: DayPhase;
  private lastHour: number;
  private signClicks = 0;
  private signTimer = 0;
  /** Called when the day ends (the summary panel shows, then `startNextDay`). */
  onDayEnd: (() => void) | null = null;
  ending = false;
  /** Admin menu: speed up / stop the clock. */
  timeScale = 1;
  frozen = false;

  constructor(private readonly ctx: GameContext) {
    this.lastPhase = phaseOf(ctx.state.hour);
    this.lastHour = Math.floor(ctx.state.hour);
    ctx.bus.on('sign:clicked', () => this.clickSign());
  }

  get timeString(): string {
    const h = this.ctx.state.hour;
    const hh = Math.floor(h) % 24;
    const mm = Math.floor((h - Math.floor(h)) * 60);
    return `${String(hh).padStart(2, '0')}:${String(Math.floor(mm / 10) * 10).padStart(2, '0')}`;
  }

  /** Jump the clock (admin menu); phases and hours catch up on the next frame. */
  setHour(h: number): void {
    const s = this.ctx.state;
    s.hour = Math.max(6, Math.min(24.4, h));
    if (s.hour < 22 && !s.shopOpen) {
      s.shopOpen = true;
      this.ctx.bus.emit('shop:open', {});
    }
    this.lastHour = Math.floor(s.hour);
  }

  closeShop(): void {
    const s = this.ctx.state;
    if (!s.shopOpen) return;
    s.shopOpen = false;
    this.ctx.bus.emit('shop:closed', {});
    this.ctx.bus.emit('toast', { text: t('toast.shopClosed'), kind: 'info' });
    this.ctx.bus.emit('mentor:say', { text: t('mentor.night'), priority: 1, mood: 'sleepy' });
  }

  private clickSign(): void {
    const ctx = this.ctx;
    ctx.audio.play('woodKnock', { x: 2.85, pitch: 1.3 });
    if (ctx.state.shopOpen) {
      if (ctx.state.hour < 18) {
        ctx.bus.emit('toast', { text: t('hint.sign'), kind: 'info' });
        this.signClicks++;
        this.signTimer = 2.5;
        if (this.signClicks >= 2) this.closeShop();
        return;
      }
      this.closeShop();
      return;
    }
    this.endDay();
  }

  endDay(): void {
    if (this.ending) return;
    this.ending = true;
    this.onDayEnd?.();
  }

  startNextDay(): void {
    const ctx = this.ctx;
    this.ending = false;
    ctx.state.startNewDay();
    this.lastPhase = 'morning';
    this.lastHour = Math.floor(ctx.state.hour);
    ctx.bus.emit('day:start', { day: ctx.state.day });
    ctx.bus.emit('phase', { day: ctx.state.day, phase: 'morning' });
    ctx.bus.emit('shop:open', {});
    ctx.bus.emit('mentor:say', { text: t('mentor.morning'), priority: 1, mood: 'happy' });
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (ctx.paused || this.ending) return;
    const s = ctx.state;
    this.signTimer -= dt;
    if (this.signTimer <= 0) this.signClicks = 0;
    // The tutorial runs at a gentle pace so nobody is rushed on day one.
    const scale = !s.tutorialDone && s.day === 1 ? 0.45 : 1;
    if (!this.frozen) s.hour += (dt / SECONDS_PER_HOUR) * scale * this.timeScale;
    const phase = phaseOf(s.hour);
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      ctx.bus.emit('phase', { day: s.day, phase });
    }
    const hr = Math.floor(s.hour);
    if (hr !== this.lastHour) {
      this.lastHour = hr;
      ctx.bus.emit('hour', { day: s.day, hour: hr });
    }
    if (s.shopOpen && s.hour >= CLOSE_HOUR) this.closeShop();
    if (s.hour >= MIDNIGHT) this.endDay();
  }
}
