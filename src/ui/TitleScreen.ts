// Title screen over the live shop (the camera drifts slowly behind it).
// The first click also unlocks Web Audio.

import type { GameContext } from '../core/GameContext';
import { h } from './UIRoot';
import { getLang, setLang, t, onLangChange } from '../core/i18n';

export interface TitleActions {
  newGame(): void;
  continueGame(): void;
  settings(): void;
  hasSave(): boolean;
}

export class TitleScreen {
  readonly el: HTMLElement;

  constructor(
    private readonly ctx: GameContext,
    private readonly actions: TitleActions,
  ) {
    this.el = h('div', 'wb-title-screen wb-interactive');
    this.render();
    onLangChange(() => this.render());
  }

  private render(): void {
    const el = this.el;
    el.innerHTML = '';
    const logo = h('div', 'wb-logo', "Witch's Brew");
    logo.appendChild(h('small', undefined, t('title.subtitle')));
    el.appendChild(logo);
    const buttons = h('div', 'wb-title-buttons');
    const mk = (label: string, fn: () => void, primary = false) => {
      const b = h('button', `wb-btn${primary ? ' primary' : ''}`, label);
      b.addEventListener('click', () => {
        this.ctx.audio.unlock();
        this.ctx.audio.play('uiClick', {});
        fn();
      });
      b.addEventListener('mouseenter', () => this.ctx.audio.play('uiHover', {}));
      buttons.appendChild(b);
    };
    const hasSave = this.actions.hasSave();
    if (hasSave) mk(t('title.continue'), () => this.actions.continueGame(), true);
    mk(t('title.new'), () => {
      if (!hasSave || confirm(t('title.confirmNew'))) this.actions.newGame();
    }, !hasSave);
    mk(t('title.settings'), () => this.actions.settings());
    el.appendChild(buttons);
    const lang = h('div', 'wb-lang wb-seg');
    for (const [code, label] of [
      ['en', 'EN'],
      ['tr', 'TR'],
    ] as const) {
      const b = h('button', getLang() === code ? 'on' : '', label);
      b.addEventListener('click', () => {
        this.ctx.audio.unlock();
        setLang(code);
      });
      lang.appendChild(b);
    }
    el.appendChild(lang);
    el.appendChild(h('div', 'wb-title-foot', t('title.credits')));
  }

  show(): void {
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
