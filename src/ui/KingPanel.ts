// The King's question: "What do you have for me?" – two answers only.
// "Something" hands over a dragon egg (if you really have one); "Nothing"
// sends him on his way.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { t } from '../core/i18n';
import { iconURL } from './pixelArt';
import { KING_REWARD, kingSheet, type KingSystem } from '../gameplay/King';

/** Head and shoulders of a sprite's first frame, as an image URL. */
function bust(): string {
  const sheet = kingSheet();
  const c = document.createElement('canvas');
  const hgt = Math.round(sheet.frameH * 0.62);
  c.width = sheet.frameW;
  c.height = hgt;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(sheet.canvas, 0, 0, sheet.frameW, hgt, 0, 0, sheet.frameW, hgt);
  return c.toDataURL();
}

export class KingPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;
  private portrait = '';

  constructor(
    private readonly ctx: GameContext,
    private readonly king: KingSystem,
  ) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-king wb-panel wb-frame-parchment');
    this.el.appendChild(this.inner);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.renderQuestion();
  }

  close(): void {
    this.el.hidden = true;
  }

  private head(): HTMLElement {
    this.portrait ||= bust();
    const head = h('div', 'wb-king-head');
    const img = h('img') as HTMLImageElement;
    img.src = this.portrait;
    img.alt = '';
    const col = h('div', 'wb-king-who');
    col.appendChild(h('strong', undefined, t('king.name')));
    col.appendChild(h('small', undefined, t('king.title')));
    head.append(img, col);
    return head;
  }

  private renderQuestion(): void {
    const el = this.inner;
    el.innerHTML = '';
    const close = h('button', 'wb-btn wb-close', '✕');
    close.addEventListener('click', () => this.ctx.ui.openPanel(null));
    el.appendChild(close);
    el.appendChild(this.head());
    el.appendChild(h('p', 'wb-king-line', `“${t('king.ask')}”`));
    const row = h('div', 'wb-king-answers');
    const some = h('button', 'wb-btn wb-btn-go', t('king.something'));
    some.addEventListener('click', () => this.reply(true));
    const none = h('button', 'wb-btn', t('king.nothing'));
    none.addEventListener('click', () => this.reply(false));
    row.append(some, none);
    el.appendChild(row);
  }

  private reply(gift: boolean): void {
    this.ctx.audio.play('uiClick', {});
    const res = this.king.answer(gift);
    if (res !== 'egg') {
      this.ctx.ui.openPanel(null);
      return;
    }
    // The egg changes hands: show the royal reward.
    const el = this.inner;
    el.innerHTML = '';
    el.appendChild(this.head());
    el.appendChild(h('p', 'wb-king-line', `“${t('king.thanks')}”`));
    const trade = h('div', 'wb-king-gift');
    const egg = h('img') as HTMLImageElement;
    egg.src = iconURL('egg', 3);
    const crown = h('img') as HTMLImageElement;
    crown.src = iconURL('crown', 3);
    trade.append(egg, h('span', 'arrow', '➜'), crown);
    el.appendChild(trade);
    el.appendChild(h('p', 'wb-king-reward', t('king.reward', { g: KING_REWARD.gold, r: KING_REWARD.reputation })));
    const ok = h('button', 'wb-btn wb-btn-go', t('king.ok'));
    ok.addEventListener('click', () => {
      this.ctx.audio.play('uiClick', {});
      this.ctx.ui.openPanel(null);
    });
    el.appendChild(ok);
  }
}
