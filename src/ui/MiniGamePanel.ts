// Mini game overlay for the gathering altars in the open world: runs the
// region's game, shows what was gathered and hands the haul back.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { t } from '../core/i18n';
import { MiniGameStage, haulList, type StageOptions } from './MiniGameStage';

export class MiniGamePanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;
  private stage: MiniGameStage | null = null;
  private haul: Record<string, number> | null = null;
  private done: ((haul: Record<string, number>) => void) | null = null;
  private closing = false;

  constructor(private readonly ctx: GameContext) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-map wb-panel wb-frame-parchment trip');
    this.el.appendChild(this.inner);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** Start a game; `onDone` gets the haul when the player closes the result. */
  play(o: Omit<StageOptions, 'onEnd'>, onDone: (haul: Record<string, number>) => void): void {
    this.done = onDone;
    this.haul = null;
    this.inner.innerHTML = '';
    this.stage = new MiniGameStage(this.ctx, {
      ...o,
      onEnd: (haul) => {
        this.haul = haul;
        this.stage = null;
        if (!this.closing) this.showResult();
      },
    });
    this.inner.appendChild(this.stage.el);
    this.ctx.ui.openPanel('minigame');
    this.stage.start();
  }

  open(): void {
    this.el.hidden = false;
  }

  close(): void {
    // Closing mid-game keeps whatever is in the basket.
    this.closing = true;
    this.stage?.finish();
    this.stage?.stop();
    this.stage = null;
    this.closing = false;
    this.el.hidden = true;
    const done = this.done;
    this.done = null;
    if (done) done(this.haul ?? {});
  }

  private showResult(): void {
    const el = this.inner;
    el.innerHTML = '';
    el.appendChild(h('h2', undefined, t('mg.result')));
    el.appendChild(haulList(this.haul ?? {}));
    const ok = h('button', 'wb-btn wb-btn-go', t('mg.continue'));
    ok.addEventListener('click', () => this.ctx.ui.openPanel(null));
    el.appendChild(ok);
    this.ctx.audio.play('chime', { volume: 0.4 });
  }
}
