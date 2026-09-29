// The seed chest in the garden: buy seeds, and (when opened from an empty
// bed) pick what to plant there.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { t, tr } from '../core/i18n';
import { CROPS, PLOTS, plant, type CropDef } from '../data/garden';
import { INGREDIENTS } from '../data/ingredients';
import { ingredientIconURL } from './pixelArt';

export class SeedPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;
  /** Plot waiting for a seed (null: just shopping). */
  plot: number | null = null;
  /** Called after something was planted. */
  onPlanted: ((plot: number, cropId: string) => void) | null = null;

  constructor(private readonly ctx: GameContext) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-seeds wb-panel wb-frame-parchment');
    this.el.appendChild(this.inner);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) ctx.ui.openPanel(null);
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.ctx.audio.play('woodKnock', { volume: 0.5, pitch: 0.9 });
    this.render();
  }

  close(): void {
    this.el.hidden = true;
    this.plot = null;
  }

  private available(c: CropDef): boolean {
    return !c.needsIngredient || this.ctx.state.isUnlocked(c.needsIngredient);
  }

  private render(): void {
    const ctx = this.ctx;
    const s = ctx.state;
    const g = s.garden;
    const el = this.inner;
    el.innerHTML = '';
    const close = h('button', 'wb-btn wb-close', '✕');
    close.addEventListener('click', () => ctx.ui.openPanel(null));
    el.appendChild(close);
    const bed = this.plot !== null ? PLOTS[this.plot] : null;
    el.appendChild(h('h2', undefined, bed ? t(bed === 'geode' ? 'garden.plantGeode' : 'garden.plantBed') : t('garden.chest')));
    el.appendChild(h('p', 'wb-door-lead', t('garden.money', { n: s.money })));
    const list = h('div', 'wb-seed-list');
    for (const c of CROPS) {
      const row = h('div', `wb-seed-row${bed && c.bed !== bed ? ' other' : ''}`);
      const img = h('img') as HTMLImageElement;
      img.src = ingredientIconURL(c.ingredientId);
      const text = h('div', 'text');
      text.appendChild(h('strong', undefined, tr(c.seed)));
      const facts = [t('garden.hours', { h: c.hours }), c.bed === 'geode' ? t('garden.inGeode') : t('garden.inSoil')];
      if (c.night) facts.push(t('garden.nightOnly'));
      if (c.dry) facts.push(t('garden.noWater'));
      facts.push(t('garden.yield', { a: c.yield[0], b: c.yield[1], i: tr(INGREDIENTS[c.ingredientId].name) }));
      text.appendChild(h('small', undefined, facts.join(' · ')));
      const owned = g.seeds[c.id] ?? 0;
      const count = h('span', 'owned', `×${owned}`);
      const btns = h('div', 'btns');
      if (!this.available(c)) {
        btns.appendChild(h('small', 'locked', t('garden.findFirst', { i: tr(INGREDIENTS[c.needsIngredient!].name) })));
      } else {
        for (const n of [1, 5]) {
          const cost = c.seedPrice * n;
          const b = h('button', 'wb-btn small', `${t('garden.buy')} ×${n} (${cost}${t('garden.gold')})`) as HTMLButtonElement;
          b.disabled = !s.canAfford(cost);
          b.addEventListener('click', () => {
            if (!s.canAfford(cost)) return;
            s.addMoney(-cost);
            g.seeds[c.id] = (g.seeds[c.id] ?? 0) + n;
            ctx.audio.play('purchase', {});
            ctx.bus.emit('purchase', { id: `seed_${c.id}`, kind: 'supply' });
            this.render();
          });
          btns.appendChild(b);
        }
        if (bed === c.bed && this.plot !== null) {
          const p = h('button', 'wb-btn wb-btn-go small', t('garden.plant')) as HTMLButtonElement;
          p.disabled = owned <= 0;
          p.addEventListener('click', () => {
            const plot = this.plot!;
            if (plant(g, plot, c.id)) {
              ctx.audio.play('dropSoft', { volume: 0.6 });
              this.onPlanted?.(plot, c.id);
              ctx.ui.openPanel(null);
            }
          });
          btns.appendChild(p);
        }
      }
      row.append(img, text, count, btns);
      list.appendChild(row);
    }
    el.appendChild(list);
    el.appendChild(h('p', 'wb-door-lead', t('garden.tip')));
  }
}
