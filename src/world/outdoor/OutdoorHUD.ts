// Heads-up display for the open world: hearts, the clock and where you are,
// a compass strip, the basket, a crosshair with the current action ("[E]
// Pick: Glowing Mushroom"), big region titles, damage flashes and the
// "click to play" veil shown while the mouse is not captured.

import { h } from '../../ui/UIRoot';
import type { Panel } from '../../ui/UIRoot';
import type { GameContext } from '../../core/GameContext';
import { iconURL, ingredientIconURL } from '../../ui/pixelArt';
import { t } from '../../core/i18n';

export interface CompassMarker {
  /** World direction angle (radians, atan2(dx, -dz): 0 = north, +east). */
  angle: number;
  label: string;
  color: string;
}

export class OutdoorHUD {
  readonly el: HTMLElement;
  private readonly hearts: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly place: HTMLElement;
  private readonly compass: HTMLElement;
  private readonly compassStrip: HTMLElement;
  private readonly basket: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly title: HTMLElement;
  private readonly hurtEl: HTMLElement;
  private readonly fadeEl: HTMLElement;
  readonly clickVeil: HTMLElement;
  private readonly petsEl: HTMLElement;
  private lastHearts = '';
  private lastBasket = '';
  private titleT = 0;

  constructor(parent: HTMLElement) {
    this.el = h('div', 'wb-out');
    this.el.hidden = true;
    const top = h('div', 'wb-out-top');
    this.hearts = h('div', 'wb-out-hearts');
    const mid = h('div', 'wb-out-mid');
    this.clock = h('div', 'wb-out-clock wb-frame-dark');
    this.place = h('div', 'wb-out-place');
    this.compass = h('div', 'wb-out-compass');
    this.compassStrip = h('div', 'strip');
    this.compass.append(this.compassStrip, h('div', 'needle'));
    mid.append(this.clock, this.compass, this.place);
    this.basket = h('div', 'wb-out-basket wb-frame-dark');
    top.append(this.hearts, mid, this.basket);
    this.el.appendChild(top);
    this.el.appendChild(h('div', 'wb-out-cross'));
    this.prompt = h('div', 'wb-out-prompt');
    this.prompt.hidden = true;
    this.el.appendChild(this.prompt);
    this.title = h('div', 'wb-out-title');
    this.el.appendChild(this.title);
    this.petsEl = h('div', 'wb-out-pets');
    this.el.appendChild(this.petsEl);
    this.el.appendChild(h('div', 'wb-out-help', t('out.help')));
    this.hurtEl = h('div', 'wb-out-hurt');
    this.el.appendChild(this.hurtEl);
    this.fadeEl = h('div', 'wb-out-fade');
    this.el.appendChild(this.fadeEl);
    this.clickVeil = h('div', 'wb-out-veil wb-interactive');
    this.clickVeil.appendChild(h('div', 'box', t('out.clickToPlay')));
    this.clickVeil.hidden = true;
    this.el.appendChild(this.clickVeil);
    parent.appendChild(this.el);
  }

  set visible(v: boolean) {
    this.el.hidden = !v;
  }

  setHearts(hp: number, max: number): void {
    const key = `${hp}/${max}`;
    if (key === this.lastHearts) return;
    this.lastHearts = key;
    this.hearts.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const s = h('span', `heart${i < hp ? '' : ' empty'}`);
      s.style.backgroundImage = `url(${iconURL('heart', 2)})`;
      this.hearts.appendChild(s);
    }
  }

  setClock(text: string, night: boolean): void {
    const v = `${night ? '☾' : '☀'} ${text}`;
    if (this.clock.textContent !== v) this.clock.textContent = v;
  }

  setPlace(text: string): void {
    if (this.place.textContent !== text) this.place.textContent = text;
  }

  setBasket(haul: Record<string, number>, capacity: number): void {
    const n = Object.values(haul).reduce((a, b) => a + b, 0);
    const key = JSON.stringify(haul) + capacity;
    if (key === this.lastBasket) return;
    this.lastBasket = key;
    this.basket.innerHTML = '';
    this.basket.appendChild(h('span', 'label', `${t('trip.basket')} ${n}/${capacity}`));
    for (const [id, c] of Object.entries(haul)) {
      if (c <= 0) continue;
      const chip = h('span', 'chip');
      const img = h('img') as HTMLImageElement;
      img.src = ingredientIconURL(id);
      chip.append(img, h('span', undefined, `×${c}`));
      this.basket.appendChild(chip);
    }
    this.basket.classList.remove('bump');
    void this.basket.offsetWidth;
    this.basket.classList.add('bump');
  }

  setPets(names: string[]): void {
    this.petsEl.textContent = names.length ? `🐾 ${names.join(' · ')}` : '';
  }

  setPrompt(text: string | null): void {
    if (!text) {
      this.prompt.hidden = true;
      return;
    }
    this.prompt.hidden = false;
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
  }

  /** Big title in the middle of the screen (entering a region). */
  showTitle(text: string, sub = ''): void {
    this.title.innerHTML = '';
    this.title.appendChild(h('div', 'main', text));
    if (sub) this.title.appendChild(h('div', 'sub', sub));
    this.title.classList.remove('show');
    void this.title.offsetWidth;
    this.title.classList.add('show');
    this.titleT = 3;
  }

  /** Compass: heading (radians, same convention as markers) and markers. */
  setCompass(heading: number, markers: CompassMarker[]): void {
    const strip = this.compassStrip;
    const W = 220;
    const pxPerRad = W / (Math.PI * 0.9);
    let html = '';
    const rel = (angle: number) => {
      let d = angle - heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    const put = (d: number, label: string, color: string, cls: string) => {
      if (Math.abs(d) > Math.PI * 0.45) return;
      html += `<span class="${cls}" style="left:${Math.round(W / 2 + d * pxPerRad)}px;color:${color}">${label}</span>`;
    };
    const dirs: Array<[number, string]> = [
      [0, t('out.north')],
      [Math.PI / 2, t('out.east')],
      [Math.PI, t('out.south')],
      [-Math.PI / 2, t('out.west')],
    ];
    for (const [a, l] of dirs) put(rel(a), l, '#ead4aa', 'dir');
    // Markers are small diamonds; only the one straight ahead gets its name.
    let ahead: CompassMarker | null = null;
    let best = 0.3;
    for (const m of markers) {
      const d = Math.abs(rel(m.angle));
      if (d < best) {
        best = d;
        ahead = m;
      }
    }
    for (const m of markers) put(rel(m.angle), m === ahead ? `◆ ${m.label}` : m.label === '⌂' ? '⌂' : '◆', m.color, 'mark');
    strip.innerHTML = html;
  }

  hurt(): void {
    this.hurtEl.classList.remove('show');
    void this.hurtEl.offsetWidth;
    this.hurtEl.classList.add('show');
  }

  /** Fade to black (faint / returning), 0..1. */
  setFade(v: number): void {
    this.fadeEl.style.opacity = String(v);
  }

  update(dt: number): void {
    if (this.titleT > 0) {
      this.titleT -= dt;
      if (this.titleT <= 0) this.title.classList.remove('show');
    }
  }
}

export interface PauseActions {
  resume(): void;
  goHome(): void;
  settings(): void;
  homeCost(): string;
}

/** Pause card for the open world (Esc). */
export class OutdoorPausePanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;

  constructor(
    private readonly ctx: GameContext,
    private readonly actions: PauseActions,
  ) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-door wb-panel wb-frame-parchment');
    this.el.appendChild(this.inner);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    const el = this.inner;
    el.innerHTML = '';
    el.appendChild(h('h2', undefined, t('out.paused')));
    const btn = (label: string, cls: string, fn: () => void) => {
      const b = h('button', `wb-btn ${cls}`, label);
      b.addEventListener('click', () => {
        this.ctx.audio.play('uiClick', {});
        fn();
      });
      el.appendChild(b);
    };
    btn(t('out.resume'), 'wb-btn-go', () => this.actions.resume());
    btn(`${t('out.goHome')} (${this.actions.homeCost()})`, '', () => this.actions.goHome());
    btn(t('hud.menu'), '', () => this.actions.settings());
    el.appendChild(h('p', 'wb-door-lead', t('out.help')));
  }

  close(): void {
    this.el.hidden = true;
  }
}
