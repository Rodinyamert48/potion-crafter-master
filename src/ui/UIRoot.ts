// DOM overlay: cursor, tooltips, context hints, world-anchored speech
// bubbles, floating texts and toasts. Panels (book, catalog, menus) register
// themselves here. Implements the UIHooks contract used by gameplay.

import * as THREE from 'three';
import type { GameContext, UIHooks } from '../core/GameContext';
import type { CursorKind, HoverInfo } from '../world/Entity';
import { cursorCSS } from './pixelArt';

type PanelName = 'book' | 'catalog' | 'inventory' | 'menu' | 'summary';

export interface Panel {
  readonly el: HTMLElement;
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  /** Modal panels pause the game. */
  readonly modal: boolean;
}

interface Bubble {
  id: number;
  el: HTMLElement;
  textEl: HTMLElement;
  anchor: THREE.Object3D;
  offsetY: number;
  full: string;
  shown: number;
  life: number;
  maxLife: number;
}

interface Floater {
  el: HTMLElement;
  world: THREE.Vector3;
  life: number;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class UIRoot implements UIHooks {
  readonly root: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly bubbles = new Map<number, Bubble>();
  private readonly floaters: Floater[] = [];
  private nextBubble = 1;
  private cursor: CursorKind | null = null;
  private tipKey = '';
  private readonly panels = new Map<PanelName, Panel>();
  private ctx: GameContext | null = null;
  private readonly proj = { x: 0, y: 0, visible: false };
  private readonly tmp = new THREE.Vector3();

  constructor(root: HTMLElement, viewport: HTMLElement) {
    this.root = root;
    this.viewport = viewport;
    this.tip = h('div', 'wb-tooltip wb-frame-dark');
    this.tip.style.display = 'none';
    root.appendChild(this.tip);
    this.hintEl = h('div', 'wb-hint');
    this.hintEl.style.display = 'none';
    root.appendChild(this.hintEl);
    this.toastBox = h('div', 'wb-toasts');
    root.appendChild(this.toastBox);
  }

  bind(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.bus.on('toast', ({ text, kind }) => this.toast(text, kind ?? 'info'));
  }

  registerPanel(name: PanelName, panel: Panel): void {
    this.panels.set(name, panel);
    this.root.appendChild(panel.el);
  }

  getPanel<T extends Panel>(name: PanelName): T | undefined {
    return this.panels.get(name) as T | undefined;
  }

  get panelOpen(): boolean {
    for (const p of this.panels.values()) if (p.isOpen && p.modal) return true;
    return false;
  }

  openPanel(panel: PanelName | null): void {
    for (const [name, p] of this.panels) {
      if (name === panel) {
        if (!p.isOpen) p.open();
      } else if (p.isOpen && p.modal) p.close();
    }
    this.ctx?.bus.emit('ui:panel', { panel });
  }

  togglePanel(panel: PanelName): void {
    const p = this.panels.get(panel);
    if (p?.isOpen) {
      p.close();
      this.ctx?.bus.emit('ui:panel', { panel: null });
    } else this.openPanel(panel);
  }

  closeAll(): boolean {
    let closed = false;
    for (const p of this.panels.values()) {
      if (p.isOpen && p.modal) {
        p.close();
        closed = true;
      }
    }
    if (closed) this.ctx?.bus.emit('ui:panel', { panel: null });
    return closed;
  }

  // -------------------------------------------------------------------------
  // UIHooks
  // -------------------------------------------------------------------------

  setCursor(kind: CursorKind): void {
    if (kind === this.cursor) return;
    this.cursor = kind;
    this.viewport.style.cursor = cursorCSS(kind === 'no' ? 'default' : kind);
  }

  tooltip(info: HoverInfo | null, x = 0, y = 0): void {
    if (!info) {
      if (this.tip.style.display !== 'none') this.tip.style.display = 'none';
      this.tipKey = '';
      return;
    }
    const key = JSON.stringify(info);
    if (key !== this.tipKey) {
      this.tipKey = key;
      this.tip.innerHTML = '';
      this.tip.appendChild(h('div', 'wb-tip-title', info.title));
      if (info.subtitle) this.tip.appendChild(h('div', 'wb-tip-sub', info.subtitle));
      if (info.lines?.length) {
        const list = h('div', 'wb-tip-lines');
        for (const l of info.lines) {
          const row = h('div', 'wb-tip-line');
          const label = h('span', 'wb-tip-label', l.text);
          if (l.color) label.style.color = l.color;
          row.appendChild(label);
          if (l.bar !== undefined) {
            const bar = h('span', 'wb-bar');
            const fill = h('span', 'wb-bar-fill');
            fill.style.width = `${Math.round(Math.max(0, Math.min(1, l.bar)) * 100)}%`;
            if (l.color) fill.style.background = l.color;
            bar.appendChild(fill);
            row.appendChild(bar);
          }
          list.appendChild(row);
        }
        this.tip.appendChild(list);
      }
      if (info.hint) this.tip.appendChild(h('div', 'wb-tip-hint', info.hint));
    }
    this.tip.style.display = 'block';
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    const r = this.tip.getBoundingClientRect();
    let px = x + 20;
    let py = y + 18;
    if (px + r.width > vw - 8) px = x - r.width - 14;
    if (py + r.height > vh - 8) py = vh - r.height - 8;
    this.tip.style.transform = `translate(${Math.max(4, px)}px, ${Math.max(4, py)}px)`;
  }

  setHint(text: string | null): void {
    if (!text) {
      if (this.hintEl.style.display !== 'none') this.hintEl.style.display = 'none';
      return;
    }
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
    this.hintEl.style.display = 'block';
  }

  say(anchor: THREE.Object3D, text: string, opts: { name?: string; duration?: number; mood?: string; offsetY?: number } = {}): number {
    const id = this.nextBubble++;
    const el = h('div', `wb-bubble wb-mood-${opts.mood ?? 'neutral'}`);
    if (opts.name) el.appendChild(h('div', 'wb-bubble-name', opts.name));
    const textEl = h('div', 'wb-bubble-text');
    el.appendChild(textEl);
    el.appendChild(h('div', 'wb-bubble-tail'));
    this.root.appendChild(el);
    const duration = opts.duration ?? Math.max(3.5, 1.8 + text.length * 0.055);
    this.bubbles.set(id, { id, el, textEl, anchor, offsetY: opts.offsetY ?? 2.0, full: text, shown: 0, life: duration, maxLife: duration });
    return id;
  }

  removeBubble(id: number): void {
    const b = this.bubbles.get(id);
    if (!b) return;
    b.el.remove();
    this.bubbles.delete(id);
  }

  floatText(world: THREE.Vector3, text: string, color = '#fee761'): void {
    const el = h('div', 'wb-float', text);
    el.style.color = color;
    this.root.appendChild(el);
    this.floaters.push({ el, world: world.clone(), life: 1.6 });
  }

  toast(text: string, kind: string): void {
    const el = h('div', `wb-toast wb-toast-${kind}`, text);
    this.toastBox.appendChild(el);
    while (this.toastBox.children.length > 4) this.toastBox.firstElementChild?.remove();
    setTimeout(() => el.classList.add('wb-toast-out'), kind === 'discovery' ? 4200 : 3000);
    setTimeout(() => el.remove(), kind === 'discovery' ? 4800 : 3600);
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const b of [...this.bubbles.values()]) {
      b.life -= dt;
      if (b.life <= 0 || !b.anchor.parent) {
        this.removeBubble(b.id);
        continue;
      }
      // Typewriter
      if (b.shown < b.full.length) {
        b.shown = Math.min(b.full.length, b.shown + dt * 42);
        b.textEl.textContent = b.full.slice(0, Math.floor(b.shown));
      }
      b.anchor.getWorldPosition(this.tmp);
      this.tmp.y += b.offsetY;
      ctx.renderer.project(this.tmp, this.proj);
      b.el.style.display = this.proj.visible ? 'block' : 'none';
      b.el.style.transform = `translate(${Math.round(this.proj.x)}px, ${Math.round(this.proj.y)}px) translate(-50%, -100%)`;
      b.el.style.opacity = b.life < 0.4 ? String(b.life / 0.4) : '1';
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.world.y += dt * 0.45;
      ctx.renderer.project(f.world, this.proj);
      f.el.style.transform = `translate(${Math.round(this.proj.x)}px, ${Math.round(this.proj.y)}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(Math.min(1, f.life / 0.5));
      if (f.life <= 0) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
  }
}
