// Trophy room: every achievement with its progress. Secret ones stay "???"
// until earned.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { ACHIEVEMENTS } from '../data/achievements';
import { iconURL } from './pixelArt';
import { t, tr } from '../core/i18n';

export class AchievementsPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;

  constructor(private readonly ctx: GameContext) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-ach wb-panel wb-frame-wood');
    this.el.appendChild(this.inner);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) ctx.ui.openPanel(null);
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.ctx.audio.play('pageFlip', {});
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  private render(): void {
    const s = this.ctx.state;
    const el = this.inner;
    el.innerHTML = '';
    const close = h('button', 'wb-btn wb-close', '✕');
    close.addEventListener('click', () => this.ctx.ui.openPanel(null));
    el.appendChild(close);
    const got = ACHIEVEMENTS.filter((a) => s.achievements[a.id] !== undefined).length;
    el.appendChild(h('h2', undefined, `${t('ach.title')} · ${got}/${ACHIEVEMENTS.length}`));
    const grid = h('div', 'wb-ach-grid');
    el.appendChild(grid);
    for (const a of ACHIEVEMENTS) {
      const day = s.achievements[a.id];
      const done = day !== undefined;
      const hidden = !done && a.secret;
      const card = h('div', `wb-ach-card${done ? ' done' : ''}`);
      const icon = h('span', 'wb-ach-icon');
      icon.style.backgroundImage = `url(${iconURL(hidden ? 'starEmpty' : a.icon, 2)})`;
      card.appendChild(icon);
      const text = h('div', 'wb-ach-text');
      text.appendChild(h('div', 'wb-ach-name', hidden ? '???' : tr(a.name)));
      text.appendChild(h('div', 'wb-ach-desc', hidden ? t('ach.secret') : tr(a.description)));
      if (done) text.appendChild(h('div', 'wb-ach-day', t('ach.day', { n: day })));
      else if (a.progress && !hidden) {
        const [cur, goal] = a.progress(s);
        const bar = h('div', 'wb-ach-bar');
        const fill = h('span');
        fill.style.width = `${Math.round(Math.min(1, cur / goal) * 100)}%`;
        bar.appendChild(fill);
        text.appendChild(bar);
        text.appendChild(h('div', 'wb-ach-day', `${Math.min(cur, goal)} / ${goal}`));
      }
      card.appendChild(text);
      grid.appendChild(card);
    }
  }
}
