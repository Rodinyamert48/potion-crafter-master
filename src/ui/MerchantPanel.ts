// The wandering merchant's wares: rare ingredients, a deal of the day,
// mystery pouches – and he buys potions straight off your shelf.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import type { TravelingMerchant, Ware } from '../gameplay/shop/TravelingMerchant';
import { INGREDIENTS } from '../data/ingredients';
import { RECIPE_MAP } from '../data/potions';
import { iconURL, ingredientIconURL, potionArtURL } from './pixelArt';
import { t, tr } from '../core/i18n';
import { stars } from '../gameplay/potion/FlaskItem';

type Tab = 'buy' | 'sell' | 'recipes';

export class MerchantPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private tab: Tab = 'buy';
  private readonly body: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;

  constructor(
    private readonly ctx: GameContext,
    private readonly merchant: TravelingMerchant,
  ) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    const panel = h('div', 'wb-catalog wb-merchant wb-panel wb-frame-parchment');
    this.title = h('h2');
    this.sub = h('p', 'wb-merchant-sub');
    this.tabs = h('div', 'wb-seg');
    this.tabs.style.marginBottom = '8px';
    this.body = h('div', 'wb-catalog-grid');
    const close = h('button', 'wb-btn wb-close', '✕');
    close.addEventListener('click', () => ctx.ui.openPanel(null));
    panel.append(close, this.title, this.sub, this.tabs, this.body);
    this.el.appendChild(panel);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) ctx.ui.openPanel(null);
    });
    ctx.bus.on('money', () => this.isOpen && this.render());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  private render(): void {
    const s = this.ctx.state;
    this.title.textContent = `${t('merchant.name')} · ${s.money} ${t('hud.money')}`;
    this.sub.textContent = t('merchant.panelSub');
    this.tabs.innerHTML = '';
    for (const [id, label] of [
      ['buy', t('merchant.tabBuy')],
      ['sell', t('merchant.tabSell')],
      ['recipes', t('merchant.tabRecipes')],
    ] as Array<[Tab, string]>) {
      const b = h('button', id === this.tab ? 'on' : '', label);
      b.addEventListener('click', () => {
        this.tab = id;
        this.ctx.audio.play('pageFlip', {});
        this.render();
      });
      this.tabs.appendChild(b);
    }
    this.body.innerHTML = '';
    if (this.tab === 'buy') for (const w of this.merchant.stock()) this.body.appendChild(this.wareCard(w));
    else if (this.tab === 'sell') this.renderSell();
    else this.renderRecipes();
  }

  private renderRecipes(): void {
    const offers = this.merchant.recipeOffers();
    if (offers.length === 0) {
      this.body.appendChild(h('p', 'wb-merchant-empty', t('merchant.allRecipes')));
      return;
    }
    this.body.appendChild(h('p', 'wb-merchant-empty', t('merchant.recipesSub')));
    for (const r of offers) {
      const have = this.merchant.haveFor(r);
      const c = h('div', 'wb-card wb-recipe-card');
      const tt = h('div', 'title');
      const img = h('img') as HTMLImageElement;
      img.src = potionArtURL(r.bottle, r.color, r.color2, true);
      tt.append(img, h('span', undefined, `🔒 ${tr(r.name)}`));
      c.appendChild(tt);
      c.appendChild(h('div', 'desc', tr(r.hint)));
      const cost = h('div', 'wb-recipe-cost');
      for (const need of r.learnCost ?? []) {
        const nr = RECIPE_MAP[need.recipe];
        const n = have[need.recipe] ?? 0;
        const chip = h('span', `wb-recipe-chip${n >= need.count ? ' ok' : ''}`);
        const pi = h('img') as HTMLImageElement;
        pi.src = potionArtURL(nr.bottle, nr.color, nr.color2);
        chip.append(pi, h('span', undefined, `${Math.min(n, need.count)}/${need.count} ${tr(nr.name)}`));
        cost.appendChild(chip);
      }
      c.appendChild(cost);
      const row = h('div', 'row');
      row.appendChild(h('span', 'desc', `${t('book.price')}: ${r.price}`));
      const ok = this.merchant.canTeach(r);
      const btn = h('button', 'wb-btn primary', t('merchant.trade')) as HTMLButtonElement;
      btn.disabled = !ok;
      btn.title = ok ? '' : t('merchant.needPotions');
      btn.addEventListener('click', () => {
        this.merchant.teach(r.id);
        this.render();
      });
      row.appendChild(btn);
      c.appendChild(row);
      this.body.appendChild(c);
    }
  }

  private wareCard(w: Ware): HTMLElement {
    const def = w.ingredient ? INGREDIENTS[w.ingredient] : null;
    const title =
      w.kind === 'mystery' ? t('merchant.mystery') : `${tr(def!.name)} ×${w.amount}${w.kind === 'deal' ? ` · ${t('merchant.deal')}` : ''}`;
    const desc = w.kind === 'mystery' ? t('merchant.mysteryDesc') : tr(def!.description);
    const c = h('div', `wb-card${w.stock <= 0 ? ' owned' : ''}${w.kind === 'deal' ? ' deal' : ''}`);
    const tt = h('div', 'title');
    const img = h('img') as HTMLImageElement;
    img.src = w.kind === 'mystery' ? iconURL('bag') : ingredientIconURL(w.ingredient!);
    tt.append(img, h('span', undefined, title));
    c.appendChild(tt);
    c.appendChild(h('div', 'desc', desc));
    const row = h('div', 'row');
    const p = h('span', 'price');
    p.appendChild(h('i'));
    p.appendChild(h('span', undefined, String(w.price)));
    row.appendChild(p);
    row.appendChild(h('span', 'desc', t('merchant.left', { n: w.stock })));
    const btn = h('button', 'wb-btn primary', w.stock > 0 ? t('catalog.buy') : t('merchant.soldOut')) as HTMLButtonElement;
    btn.disabled = w.stock <= 0 || !this.ctx.state.canAfford(w.price);
    btn.addEventListener('click', () => {
      this.merchant.buy(w.id);
      this.render();
    });
    row.appendChild(btn);
    c.appendChild(row);
    return c;
  }

  private renderSell(): void {
    const potions = this.merchant.sellable();
    if (potions.length === 0) {
      this.body.appendChild(h('p', 'wb-merchant-empty', t('merchant.nothingToSell')));
      return;
    }
    for (const f of potions) {
      const r = RECIPE_MAP[f.potion!.recipeId];
      const c = h('div', 'wb-card');
      const tt = h('div', 'title');
      const img = h('img') as HTMLImageElement;
      img.src = potionArtURL(r.bottle, f.potion!.color, f.potion!.color2);
      tt.append(img, h('span', undefined, `${tr(r.name)} ${stars(f.potion!.tier)}`));
      c.appendChild(tt);
      c.appendChild(h('div', 'desc', t('merchant.offer', { n: f.potion!.price })));
      const row = h('div', 'row');
      const p = h('span', 'price');
      p.appendChild(h('i'));
      p.appendChild(h('span', undefined, String(this.merchant.offerFor(f))));
      row.appendChild(p);
      const btn = h('button', 'wb-btn primary', t('merchant.sell')) as HTMLButtonElement;
      btn.addEventListener('click', () => {
        this.merchant.sell(f);
        this.render();
      });
      row.appendChild(btn);
      c.appendChild(row);
      this.body.appendChild(c);
    }
  }
}
