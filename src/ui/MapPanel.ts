// Quick gathering trips (phones and tablets – on PC the apprentice walks out
// into the open world instead): pick a region on the parchment, set out,
// play the region's mini game and bring the basket home. Opened from the
// shop door.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { REGIONS, REGION_MAP, type RegionDef } from '../data/regions';
import { INGREDIENTS } from '../data/ingredients';
import { ingredientIconURL } from './pixelArt';
import { t, tr } from '../core/i18n';
import type { Expedition } from '../gameplay/gathering/Expedition';
import { MiniGameStage, haulList } from './MiniGameStage';
import type { PetId } from './minigames';
import { Painter } from '../rendering/three/textures/Painter';

type View = 'map' | 'trip' | 'result';

export class MapPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;
  private view: View = 'map';
  private selected: RegionDef = REGIONS[0];
  private stage: MiniGameStage | null = null;
  private region: RegionDef | null = null;
  private haul: Record<string, number> = {};
  private mapArt: string | null = null;
  /** Pets coming along (chosen at the door). */
  pets: PetId[] = [];

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
    if (this.view === 'trip' && this.stage) this.stage.finish();
    if (this.view === 'result' && this.region) this.goHome();
    this.stage?.stop();
    this.stage = null;
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
    for (const [dx, dy] of [[-10, 0], [0, -6], [10, 2], [-4, 8], [6, 10]]) tree(REGION_MAP.forest.map.x * W + dx, REGION_MAP.forest.map.y * H + dy);
    const cave = REGION_MAP.cave.map;
    p.poly(
      [
        [cave.x * W - 16, cave.y * H + 10],
        [cave.x * W, cave.y * H - 12],
        [cave.x * W + 16, cave.y * H + 10],
      ],
      '#8b9bb4',
    );
    p.ellipse(cave.x * W, cave.y * H + 6, 5, 5, '#181425');
    const sw = REGION_MAP.swamp.map;
    p.ellipse(sw.x * W, sw.y * H + 4, 18, 7, '#4a6a3a');
    for (let i = 0; i < 7; i++) p.rect(sw.x * W - 12 + i * 4, sw.y * H - 4 - (i % 2) * 2, 1, 7, '#3e8948');
    const vl = REGION_MAP.valley.map;
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
    // The Moon Shrine: a ring of standing stones
    const sh = REGION_MAP.shrine.map;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      p.rect(sh.x * W + Math.cos(a) * 9 - 1, sh.y * H + Math.sin(a) * 4 - 3, 2, 4, '#5a6988');
    }
    p.disc(sh.x * W, sh.y * H - 9, 3, '#c0cbff');
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
    const capacity = Math.round(8 * this.ctx.state.effects.stockCapMul) + (this.pets.includes('slime') ? 2 : 0);
    this.stage = new MiniGameStage(this.ctx, {
      region: r,
      night: this.expedition.isNight(),
      finds: pools.finds,
      hazards: pools.hazards,
      capacity,
      pets: this.pets,
      onEnd: (haul) => {
        this.haul = haul;
        this.stage = null;
        this.view = 'result';
        if (!this.el.hidden) this.render();
        else this.goHome();
      },
    });
    this.render();
    this.stage.start();
  }

  private renderTrip(): void {
    if (this.stage) this.inner.appendChild(this.stage.el);
  }

  // -------------------------------------------------------------------------
  // Result view
  // -------------------------------------------------------------------------

  private renderResult(): void {
    const el = this.inner;
    const r = this.region!;
    el.appendChild(h('h2', undefined, t('trip.done')));
    el.appendChild(haulList(this.haul));
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
