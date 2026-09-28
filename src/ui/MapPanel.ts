// The expedition map pinned to the shop wall: pick a region, set out, gather
// in the little pixel scene and bring the basket home.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { REGIONS, type RegionDef } from '../data/regions';
import { INGREDIENTS } from '../data/ingredients';
import { ingredientIconURL } from './pixelArt';
import { t, tr } from '../core/i18n';
import type { Expedition } from '../gameplay/gathering/Expedition';
import { GatherScene } from './GatherScene';
import { Painter } from '../rendering/three/textures/Painter';

type View = 'map' | 'trip' | 'result';

export class MapPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;
  private view: View = 'map';
  private selected: RegionDef = REGIONS[0];
  private scene: GatherScene | null = null;
  private region: RegionDef | null = null;
  private haul: Record<string, number> = {};
  private mapArt: string | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly expedition: Expedition,
  ) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-map wb-panel wb-frame-parchment');
    this.el.appendChild(this.inner);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el && this.view === 'map') ctx.ui.openPanel(null);
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.view = 'map';
    this.ctx.audio.play('pageFlip', {});
    this.render();
  }

  close(): void {
    // Closing mid-trip heads home with whatever is in the basket.
    if (this.view === 'trip' && this.scene) this.scene.finish();
    if (this.view === 'result' && this.region) this.goHome();
    this.scene?.stop();
    this.scene = null;
    this.el.hidden = true;
  }

  private render(): void {
    const el = this.inner;
    el.innerHTML = '';
    el.classList.toggle('trip', this.view !== 'map');
    if (this.view === 'map') this.renderMap();
    else if (this.view === 'trip') this.renderTrip();
    else this.renderResult();
  }

  // -------------------------------------------------------------------------
  // Map view
  // -------------------------------------------------------------------------

  private renderMap(): void {
    const el = this.inner;
    const close = h('button', 'wb-btn wb-close', '✕');
    close.addEventListener('click', () => this.ctx.ui.openPanel(null));
    el.appendChild(close);
    el.appendChild(h('h2', undefined, t('trip.title')));
    const body = h('div', 'wb-map-body');
    el.appendChild(body);

    const map = h('div', 'wb-map-art');
    map.style.backgroundImage = `url(${this.paintMap()})`;
    for (const r of REGIONS) {
      const blocked = this.expedition.blocker(r);
      const locked = !!((r.minDay && this.ctx.state.day < r.minDay) || (r.minReputation && this.ctx.state.reputation < r.minReputation));
      const pin = h('button', `wb-map-pin${r === this.selected ? ' selected' : ''}${locked ? ' locked' : ''}`);
      pin.style.left = `${r.map.x * 100}%`;
      pin.style.top = `${r.map.y * 100}%`;
      pin.appendChild(h('span', 'label', tr(r.name)));
      pin.title = blocked ?? tr(r.name);
      pin.addEventListener('click', () => {
        this.selected = r;
        this.ctx.audio.play('uiClick', {});
        this.render();
      });
      map.appendChild(pin);
    }
    body.appendChild(map);

    const r = this.selected;
    const info = h('div', 'wb-map-info');
    info.appendChild(h('h3', undefined, tr(r.name)));
    info.appendChild(h('p', 'desc', tr(r.description)));
    const night = this.expedition.isNight();
    info.appendChild(h('p', 'meta', `⌛ ${t('trip.hours', { h: r.hours })} · ${night ? t('trip.night') : t('trip.day')}`));
    const pools = this.expedition.pools(r);
    info.appendChild(h('div', 'sub', t('trip.finds')));
    const finds = h('div', 'wb-map-finds');
    for (const f of pools.finds) {
      const def = INGREDIENTS[f.ingredientId];
      const known = this.ctx.state.isUnlocked(def.id);
      const chip = h('span', `chip${f.rare ? ' rare' : ''}`);
      const img = h('img') as HTMLImageElement;
      img.src = ingredientIconURL(def.id);
      if (!known) img.style.filter = 'brightness(0) opacity(0.55)';
      chip.append(img, h('span', undefined, known ? tr(def.name) : '???'));
      finds.appendChild(chip);
    }
    info.appendChild(finds);
    if (pools.hazards.length) {
      info.appendChild(h('div', 'sub', t('trip.hazards')));
      info.appendChild(h('p', 'hazards', pools.hazards.map((z) => tr(z.name)).join(' · ')));
    }
    info.appendChild(h('p', 'note', t('trip.watch')));
    const blocked = this.expedition.blocker(r);
    if (blocked) info.appendChild(h('p', 'blocked', blocked));
    const go = h('button', 'wb-btn wb-btn-go', t('trip.go')) as HTMLButtonElement;
    go.disabled = !!blocked;
    go.addEventListener('click', () => this.setOut(r));
    info.appendChild(go);
    body.appendChild(info);
  }

  /** Parchment map with little landmarks, painted once. */
  private paintMap(): string {
    if (this.mapArt) return this.mapArt;
    const W = 200;
    const H = 130;
    const p = new Painter(W, H, 77);
    p.fill('#ead4aa');
    for (let i = 0; i < 400; i++) p.px(p.rng.range(0, W), p.rng.range(0, H), p.rng.chance(0.5) ? '#e0c898' : '#f4e6c8');
    // Burnt edges
    for (let x = 0; x < W; x++) {
      for (let k = 0; k < 2 + (x % 5 === 0 ? 1 : 0); k++) {
        p.px(x, k, '#c28569');
        p.px(x, H - 1 - k, '#c28569');
      }
    }
    for (let y = 0; y < H; y++) {
      p.px(0, y, '#c28569');
      p.px(1, y, '#c28569');
      p.px(W - 1, y, '#c28569');
      p.px(W - 2, y, '#c28569');
    }
    // River
    for (let x = 0; x < W; x++) {
      const y = 60 + Math.sin(x / 17) * 9 + Math.sin(x / 7) * 2;
      p.rect(x, y, 1, 3, '#6fa8d6');
    }
    const cx = W / 2;
    const cy = H / 2 - 6;
    // Paths from the shop to each region (dotted)
    for (const r of REGIONS) {
      const tx = r.map.x * W;
      const ty = r.map.y * H;
      const n = Math.hypot(tx - cx, ty - cy) / 4;
      for (let i = 1; i < n; i++) {
        if (i % 2) continue;
        const k = i / n;
        p.px(cx + (tx - cx) * k, cy + (ty - cy) * k + Math.sin(k * 6) * 3, '#733e39');
      }
    }
    // Landmarks
    const tree = (x: number, y: number) => {
      p.disc(x, y - 4, 4, '#3e8948');
      p.rect(x - 1, y - 1, 2, 4, '#733e39');
    };
    for (const [dx, dy] of [[-10, 0], [0, -6], [10, 2], [-4, 8], [6, 10]]) tree(REGIONS[0].map.x * W + dx, REGIONS[0].map.y * H + dy);
    const cave = REGIONS[1].map;
    p.poly(
      [
        [cave.x * W - 16, cave.y * H + 10],
        [cave.x * W, cave.y * H - 12],
        [cave.x * W + 16, cave.y * H + 10],
      ],
      '#8b9bb4',
    );
    p.ellipse(cave.x * W, cave.y * H + 6, 5, 5, '#181425');
    const sw = REGIONS[2].map;
    p.ellipse(sw.x * W, sw.y * H + 4, 18, 7, '#4a6a3a');
    for (let i = 0; i < 7; i++) p.rect(sw.x * W - 12 + i * 4, sw.y * H - 4 - (i % 2) * 2, 1, 7, '#3e8948');
    const vl = REGIONS[3].map;
    p.poly(
      [
        [vl.x * W - 18, vl.y * H + 10],
        [vl.x * W - 4, vl.y * H - 14],
        [vl.x * W + 4, vl.y * H - 14],
        [vl.x * W + 18, vl.y * H + 10],
      ],
      '#733e39',
    );
    p.rect(vl.x * W - 3, vl.y * H - 16, 6, 3, '#e43b44');
    // The shop
    p.rect(cx - 6, cy - 2, 12, 9, '#8f563b');
    p.poly(
      [
        [cx - 8, cy - 2],
        [cx, cy - 10],
        [cx + 8, cy - 2],
      ],
      '#a22633',
    );
    p.rect(cx - 1, cy + 3, 3, 4, '#3e2731');
    p.rect(cx + 3, cy - 8, 2, 4, '#5a6988');
    // Compass rose
    p.rect(W - 18, 12, 1, 11, '#733e39');
    p.rect(W - 23, 17, 11, 1, '#733e39');
    p.px(W - 18, 10, '#a22633');
    p.commit();
    this.mapArt = p.canvas.toDataURL();
    return this.mapArt;
  }

  // -------------------------------------------------------------------------
  // Trip view
  // -------------------------------------------------------------------------

  private setOut(r: RegionDef): void {
    if (this.expedition.blocker(r)) return;
    this.region = r;
    this.haul = {};
    this.expedition.depart(r);
    const pools = this.expedition.pools(r);
    this.view = 'trip';
    const capacity = Math.round(8 * this.ctx.state.effects.stockCapMul);
    this.scene = new GatherScene(r, this.expedition.isNight(), pools.finds, pools.hazards, this.ctx.audio, {
      onCollect: (_id, _n, full) => {
        this.updateBasket();
        if (full) this.flash(t('trip.full'));
      },
      onHurt: (hazardId, lost) => {
        const hz = r.hazards.find((z) => z.id === hazardId);
        this.flash(`${t('trip.ouch')} ${hz ? tr(hz.name) : ''}${lost ? ` – ${tr(INGREDIENTS[lost].name)} ${t('trip.dropped')}` : ''}`);
        this.updateBasket();
      },
      onTick: (p) => {
        const bar = this.inner.querySelector<HTMLElement>('.wb-trip-time > span');
        if (bar) bar.style.width = `${Math.round((1 - p) * 100)}%`;
      },
      onEnd: (haul) => {
        this.haul = haul;
        this.scene = null;
        this.view = 'result';
        if (!this.el.hidden) this.render();
        else this.goHome();
      },
    }, capacity);
    this.render();
    this.scene.start();
  }

  private renderTrip(): void {
    const el = this.inner;
    const r = this.region!;
    const head = h('div', 'wb-trip-head');
    head.appendChild(h('h2', undefined, tr(r.name)));
    head.appendChild(h('div', 'wb-trip-help', t('trip.help')));
    el.appendChild(head);
    const time = h('div', 'wb-trip-time');
    time.appendChild(h('span'));
    el.appendChild(time);
    const frame = h('div', 'wb-trip-frame');
    if (this.scene) frame.appendChild(this.scene.canvas);
    frame.appendChild(h('div', 'wb-trip-flash'));
    el.appendChild(frame);
    const basket = h('div', 'wb-trip-basket');
    el.appendChild(basket);
    this.updateBasket();
  }

  private updateBasket(): void {
    const basket = this.inner.querySelector<HTMLElement>('.wb-trip-basket');
    if (!basket) return;
    basket.innerHTML = '';
    const haul = this.scene?.haul ?? this.haul;
    const n = Object.values(haul).reduce((a, b) => a + Math.max(0, b), 0);
    basket.appendChild(h('span', 'label', `${t('trip.basket')} ${n}/${this.scene?.capacity ?? n}:`));
    for (const [id, n] of Object.entries(haul)) {
      if (n <= 0) continue;
      const chip = h('span', 'chip');
      const img = h('img') as HTMLImageElement;
      img.src = ingredientIconURL(id);
      chip.append(img, h('span', undefined, `×${n}`));
      basket.appendChild(chip);
    }
  }

  private flash(text: string): void {
    const f = this.inner.querySelector<HTMLElement>('.wb-trip-flash');
    if (!f) return;
    f.textContent = text;
    f.classList.remove('show');
    void f.offsetWidth;
    f.classList.add('show');
  }

  // -------------------------------------------------------------------------
  // Result view
  // -------------------------------------------------------------------------

  private renderResult(): void {
    const el = this.inner;
    const r = this.region!;
    el.appendChild(h('h2', undefined, t('trip.done')));
    const list = h('div', 'wb-trip-result');
    let any = false;
    for (const [id, n] of Object.entries(this.haul)) {
      if (n <= 0) continue;
      any = true;
      const row = h('div', 'row');
      const img = h('img') as HTMLImageElement;
      img.src = ingredientIconURL(id);
      row.append(img, h('span', 'name', tr(INGREDIENTS[id].name)), h('span', 'n', `×${n}`));
      list.appendChild(row);
    }
    if (!any) list.appendChild(h('p', 'muted', t('trip.empty')));
    el.appendChild(list);
    el.appendChild(h('p', 'meta', `⌛ ${t('trip.hours', { h: r.hours })}`));
    const home = h('button', 'wb-btn wb-btn-go', t('trip.home'));
    home.addEventListener('click', () => {
      this.goHome();
      this.ctx.ui.openPanel(null);
    });
    el.appendChild(home);
  }

  private goHome(): void {
    const r = this.region;
    if (!r) return;
    this.region = null;
    this.view = 'map';
    this.expedition.returnHome(r, this.haul);
    this.haul = {};
  }
}
