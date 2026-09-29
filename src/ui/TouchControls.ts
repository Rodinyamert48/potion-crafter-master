// On-screen controls for phones, tablets and smart boards. They stand in for
// the keyboard: an action button (pour / tilt / strike – like SPACE), rotate
// buttons (Q/E: turn the held item or the camera), zoom and full screen.
// Shown whenever the last input came from a finger or a pen.

import type { GameContext } from '../core/GameContext';
import { h } from './UIRoot';
import { t } from '../core/i18n';

export function isTouchUI(): boolean {
  return document.documentElement.classList.contains('touch');
}

export class TouchControls {
  readonly el: HTMLElement;
  private readonly action: HTMLButtonElement;
  private readonly portrait: HTMLElement;
  private portraitDismissed = false;

  constructor(private readonly ctx: GameContext) {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.setTouch(coarse && !window.matchMedia?.('(pointer: fine)').matches);
    window.addEventListener('pointerdown', (e) => this.setTouch(e.pointerType !== 'mouse'), { capture: true });

    this.el = h('div', 'wb-touch wb-interactive');
    const hold = (label: string, title: string, code: string, cls = '') => {
      const b = h('button', `wb-touch-btn ${cls}`, label) as HTMLButtonElement;
      b.title = title;
      b.setAttribute('aria-label', title);
      const up = () => {
        ctx.input.setVirtualKey(code, false);
        b.classList.remove('down');
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.setPointerCapture?.(e.pointerId);
        ctx.input.setVirtualKey(code, true);
        b.classList.add('down');
      });
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };
    const row1 = h('div', 'wb-touch-row');
    row1.append(hold('⟲', t('touch.rotateLeft'), 'KeyQ'), hold('⟳', t('touch.rotateRight'), 'KeyE'));
    const row2 = h('div', 'wb-touch-row');
    row2.append(hold('－', t('touch.zoomOut'), 'Minus'), hold('＋', t('touch.zoomIn'), 'Equal'));
    const full = h('button', 'wb-touch-btn small', '⛶') as HTMLButtonElement;
    full.title = t('touch.fullscreen');
    full.addEventListener('click', () => this.toggleFullscreen());
    row2.append(full);
    this.action = hold('✋', t('touch.action'), 'Space', 'action');
    const col = h('div', 'wb-touch-col');
    col.append(row1, row2);
    this.el.append(col, this.action);

    this.portrait = h('div', 'wb-portrait-hint wb-interactive', t('touch.rotateDevice'));
    this.portrait.addEventListener('pointerdown', () => {
      this.portraitDismissed = true;
      this.portrait.hidden = true;
    });
    this.portrait.hidden = true;
  }

  private setTouch(on: boolean): void {
    document.documentElement.classList.toggle('touch', on);
  }

  private toggleFullscreen(): void {
    const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen?.bind(d) ?? d.webkitExitFullscreen?.bind(d))?.();
      else if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
      else el.webkitRequestFullscreen?.();
    } catch {
      /* not supported (e.g. iPhone Safari) */
    }
  }

  /** Per frame: the action button only matters while holding something. */
  update(playing: boolean): void {
    const touch = isTouchUI();
    this.el.hidden = !touch || !playing;
    const grab = this.ctx.interaction.grab;
    const e = grab?.entity;
    const useful = !!e && (e.tiltable || e.kind === 'knife' || e.kind === 'hammer');
    this.action.classList.toggle('idle', !useful);
    const portrait = touch && playing && window.innerHeight > window.innerWidth * 1.1;
    this.portrait.hidden = !portrait || this.portraitDismissed;
  }

  get portraitEl(): HTMLElement {
    return this.portrait;
  }
}
