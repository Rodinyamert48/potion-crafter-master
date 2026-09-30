// Online play: host a room (this computer is the server) or join a friend's
// room with its code.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { t } from '../core/i18n';
import { CODE_LENGTH, NetError, cleanCode } from '../net/Transport';

export interface OnlineActions {
  /** A game is running (not the title screen). */
  playing(): boolean;
  host(): Promise<void>;
  closeRoom(): void;
  join(code: string): Promise<void>;
  leave(): void;
  getName(): string;
  setName(name: string): void;
}

export class OnlinePanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;
  private busy = false;
  private status = '';
  private statusBad = false;
  private code = '';

  constructor(
    private readonly ctx: GameContext,
    private readonly actions: OnlineActions,
  ) {
    this.el = h('div', 'wb-overlay wb-overlay-top wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-online wb-panel wb-frame-wood');
    this.el.appendChild(this.inner);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el && !this.busy) ctx.ui.openPanel(null);
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    if (!this.busy) this.setStatus('');
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  private setStatus(text: string, bad = false): void {
    this.status = text;
    this.statusBad = bad;
  }

  private click(fn: () => void): () => void {
    return () => {
      this.ctx.audio.play('uiClick', {});
      fn();
    };
  }

  render(): void {
    if (!this.isOpen) return;
    const net = this.ctx.net;
    const el = this.inner;
    el.innerHTML = '';
    const close = h('button', 'wb-btn wb-close', '✕');
    close.disabled = this.busy;
    close.addEventListener('click', this.click(() => this.ctx.ui.openPanel(null)));
    el.appendChild(close);
    el.appendChild(h('h2', undefined, `🌐 ${t('net.title')}`));

    // Name
    const nameRow = h('label', 'wb-online-row');
    nameRow.appendChild(h('span', undefined, t('net.name')));
    const name = h('input', 'wb-admin-input wb-online-name') as HTMLInputElement;
    name.maxLength = 16;
    name.placeholder = t('net.namePlaceholder');
    name.value = this.actions.getName();
    name.disabled = net.online || this.busy;
    name.addEventListener('input', () => this.actions.setName(name.value));
    nameRow.appendChild(name);
    el.appendChild(nameRow);

    // Host
    if (!net.isGuest) {
      const sec = h('div', 'wb-online-sec');
      sec.appendChild(h('h3', undefined, t('net.hostTitle')));
      if (net.isHost) {
        sec.appendChild(h('div', 'wb-online-label', t('net.code')));
        const row = h('div', 'wb-online-coderow');
        row.appendChild(h('div', 'wb-online-code', net.code));
        const copy = h('button', 'wb-btn', t('net.copy'));
        copy.addEventListener('click', this.click(() => copyText(net.code, () => this.ctx.bus.emit('toast', { text: t('net.copied'), kind: 'good' }))));
        row.appendChild(copy);
        sec.appendChild(row);
        const list = h('div', 'wb-online-players');
        for (const p of net.players) {
          const chip = h('span', 'wb-online-player', p.id === 0 ? `${p.name} (${t('net.hostTag')})` : p.name);
          chip.style.setProperty('--pc', p.color);
          list.appendChild(chip);
        }
        sec.appendChild(list);
        const stop = h('button', 'wb-btn', t('net.close'));
        stop.addEventListener(
          'click',
          this.click(() => {
            this.actions.closeRoom();
            this.setStatus(t('net.closed'));
            this.render();
          }),
        );
        sec.appendChild(stop);
      } else {
        sec.appendChild(h('p', 'wb-online-lead', t('net.hostLead')));
        const go = h('button', 'wb-btn primary', t('net.host'));
        go.disabled = this.busy;
        go.addEventListener('click', this.click(() => void this.doHost()));
        sec.appendChild(go);
      }
      el.appendChild(sec);
    }

    // Join
    if (!net.isHost) {
      const sec = h('div', 'wb-online-sec');
      sec.appendChild(h('h3', undefined, t('net.joinTitle')));
      if (net.isGuest) {
        sec.appendChild(h('div', 'wb-online-label', t('net.code')));
        sec.appendChild(h('div', 'wb-online-code', net.code));
        const leave = h('button', 'wb-btn', t('net.leave'));
        leave.addEventListener('click', this.click(() => this.actions.leave()));
        sec.appendChild(leave);
      } else if (this.actions.playing()) {
        sec.appendChild(h('p', 'wb-online-lead', t('net.joinFromTitle')));
      } else {
        sec.appendChild(h('p', 'wb-online-lead', t('net.joinLead')));
        const row = h('div', 'wb-online-coderow');
        const input = h('input', 'wb-admin-input wb-online-codein') as HTMLInputElement;
        input.maxLength = CODE_LENGTH + 2;
        input.placeholder = 'ABC123';
        input.value = this.code;
        input.disabled = this.busy;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.addEventListener('input', () => {
          const c = cleanCode(input.value);
          if (c !== input.value) input.value = c;
          this.code = c;
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') void this.doJoin();
        });
        row.appendChild(input);
        const go = h('button', 'wb-btn primary', t('net.join'));
        go.disabled = this.busy;
        go.addEventListener('click', this.click(() => void this.doJoin()));
        row.appendChild(go);
        sec.appendChild(row);
        if (!this.busy) setTimeout(() => this.isOpen && !name.value && name.focus(), 0);
      }
      el.appendChild(sec);
    }

    if (this.status) el.appendChild(h('p', `wb-online-status${this.statusBad ? ' bad' : ''}`, this.status));
    el.appendChild(h('p', 'wb-online-note', `${t('net.note')} ${t('net.guestNote')}`));
  }

  private async doHost(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.setStatus(t('net.opening'));
    this.render();
    try {
      await this.actions.host();
      this.setStatus(t('net.open', { code: this.ctx.net.code }));
    } catch (err) {
      this.setStatus(errorText(err), true);
    }
    this.busy = false;
    this.render();
  }

  private async doJoin(): Promise<void> {
    if (this.busy) return;
    const code = cleanCode(this.code);
    if (code.length !== CODE_LENGTH) {
      this.setStatus(t('net.badCode'), true);
      this.render();
      return;
    }
    this.busy = true;
    this.setStatus(t('net.joining'));
    this.render();
    try {
      await this.actions.join(code);
      this.setStatus('');
      this.busy = false;
      this.ctx.ui.openPanel(null);
      return;
    } catch (err) {
      this.setStatus(errorText(err), true);
    }
    this.busy = false;
    this.render();
  }
}

export function errorText(err: unknown): string {
  const code = err instanceof NetError ? err.code : 'network';
  return t(`net.err.${code}`);
}

export function copyText(text: string, done: () => void): void {
  try {
    void navigator.clipboard
      .writeText(text)
      .then(done)
      .catch(() => fallbackCopy(text, done));
  } catch {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text: string, done: () => void): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    done();
  } catch {
    /* ignore */
  }
  ta.remove();
}
