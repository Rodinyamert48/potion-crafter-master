// While in a room: the room badge (code, players, ping), a small chat and a
// marker for every other player's hand in the shop.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import { h } from './UIRoot';
import { t } from '../core/i18n';
import { copyText } from './OnlinePanel';

interface Marker {
  el: HTMLElement;
  label: HTMLElement;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  seen: number;
  fresh: boolean;
}

const MAX_LINES = 6;

export class NetHud {
  readonly el: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly layer: HTMLElement;
  private readonly markers = new Map<number, Marker>();
  private readonly proj = { x: 0, y: 0, visible: false };
  private badgeKey = '';
  private active = false;
  /** Round trip to the host (guests), ms. */
  ping = 0;
  onSend: ((text: string) => void) | null = null;

  constructor(
    private readonly ctx: GameContext,
    root: HTMLElement,
  ) {
    this.layer = h('div', 'wb-hand-markers');
    root.appendChild(this.layer);
    this.el = h('div', 'wb-net');
    this.el.hidden = true;
    this.badge = h('div', 'wb-net-badge wb-frame-dark wb-interactive');
    this.log = h('div', 'wb-net-log');
    this.input = h('input', 'wb-admin-input wb-net-input wb-interactive') as HTMLInputElement;
    this.input.maxLength = 140;
    this.input.placeholder = t('net.chatPlaceholder');
    this.input.hidden = true;
    // (Stacked bottom-up: badge, chat input, recent lines.)
    this.el.append(this.badge, this.input, this.log);
    root.appendChild(this.el);

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        if (text) this.onSend?.(text);
        this.closeChat();
      } else if (e.key === 'Escape') this.closeChat();
    });
    this.input.addEventListener('blur', () => this.closeChat());
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.key !== 'Enter' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (ctx.ui.panelOpen) return;
      e.preventDefault();
      this.openChat();
    });
  }

  show(): void {
    this.active = true;
    this.el.hidden = false;
    this.badgeKey = '';
  }

  hide(): void {
    this.active = false;
    this.el.hidden = true;
    this.closeChat();
    this.log.innerHTML = '';
    this.setMarkers([]);
  }

  openChat(): void {
    this.input.hidden = false;
    this.input.value = '';
    this.input.focus();
  }

  closeChat(): void {
    if (this.input.hidden) return;
    this.input.hidden = true;
    this.input.blur();
  }

  addChat(from: number, text: string): void {
    const net = this.ctx.net;
    const p = net.players.find((x) => x.id === from);
    const line = h('div', 'wb-net-line');
    const who = h('b', undefined, `${p?.name ?? '?'}: `);
    who.style.color = p?.color ?? '#fee761';
    line.append(who, document.createTextNode(text));
    this.log.appendChild(line);
    while (this.log.children.length > MAX_LINES) this.log.firstElementChild?.remove();
    setTimeout(() => line.classList.add('old'), 9000);
    this.ctx.audio.play('uiHover', { volume: 0.6 });
  }

  private renderBadge(): void {
    const net = this.ctx.net;
    const key = `${net.code}|${net.selfId}|${net.players.map((p) => `${p.id}:${p.name}`).join(',')}|${Math.round(this.ping / 10)}`;
    if (key === this.badgeKey) return;
    this.badgeKey = key;
    const b = this.badge;
    b.innerHTML = '';
    const top = h('div', 'wb-net-top');
    const code = h('button', 'wb-net-code', `🌐 ${net.code}`);
    code.title = t('net.copy');
    code.addEventListener('click', () => copyText(net.code, () => this.ctx.bus.emit('toast', { text: t('net.copied'), kind: 'good' })));
    top.appendChild(code);
    if (net.isGuest && this.ping > 0) top.appendChild(h('span', 'wb-net-ping', `${Math.round(this.ping)} ms`));
    const chat = h('button', 'wb-net-chatbtn', '💬');
    chat.title = t('net.chatHint');
    chat.addEventListener('click', () => this.openChat());
    top.appendChild(chat);
    b.appendChild(top);
    for (const p of net.players) {
      const row = h('div', 'wb-net-player');
      const dot = h('span', 'dot');
      dot.style.background = p.color;
      const tags = [p.id === 0 ? t('net.hostTag') : '', p.id === net.selfId ? t('net.you') : ''].filter(Boolean).join(', ');
      row.append(dot, document.createTextNode(tags ? `${p.name} (${tags})` : p.name));
      b.appendChild(row);
    }
  }

  /** Other players' hands: [player id, x, y, z, holding]. */
  setMarkers(mk: number[][]): void {
    const net = this.ctx.net;
    const now = performance.now();
    for (const m of mk) {
      const id = m[0];
      if (id === net.selfId) continue;
      let mark = this.markers.get(id);
      if (!mark) {
        const el = h('div', 'wb-hand-marker');
        el.appendChild(h('span', 'ring'));
        const label = h('span', 'name');
        el.appendChild(label);
        this.layer.appendChild(el);
        mark = { el, label, pos: new THREE.Vector3(m[1], m[2], m[3]), target: new THREE.Vector3(), seen: now, fresh: true };
        this.markers.set(id, mark);
      }
      mark.target.set(m[1], m[2], m[3]);
      mark.seen = now;
      mark.el.classList.toggle('holding', !!m[4]);
      const p = net.players.find((x) => x.id === id);
      if (mark.label.textContent !== (p?.name ?? '')) mark.label.textContent = p?.name ?? '';
      mark.el.style.setProperty('--pc', p?.color ?? '#fee761');
    }
    for (const [id, mark] of this.markers) {
      if (mk.some((m) => m[0] === id)) continue;
      mark.el.remove();
      this.markers.delete(id);
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    this.renderBadge();
    const now = performance.now();
    const k = 1 - Math.exp(-dt * 14);
    const inShop = this.ctx.mode === 'shop';
    for (const mark of this.markers.values()) {
      if (mark.fresh) {
        mark.pos.copy(mark.target);
        mark.fresh = false;
      } else mark.pos.lerp(mark.target, k);
      this.ctx.renderer.project(mark.pos, this.proj);
      const show = inShop && this.proj.visible && now - mark.seen < 1500;
      mark.el.style.display = show ? 'block' : 'none';
      if (show) mark.el.style.transform = `translate(${Math.round(this.proj.x)}px, ${Math.round(this.proj.y)}px)`;
    }
  }
}
