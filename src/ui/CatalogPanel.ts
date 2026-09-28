// Merchant catalog: buy ingredient bundles, flasks, firewood, equipment
// upgrades and decorations.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import type { ShopSystem } from '../gameplay/shop/ShopSystem';
import { BUNDLE } from '../gameplay/shop/ShopSystem';
import { INGREDIENTS } from '../data/ingredients';
import { UPGRADES, UPGRADE_MAP, SUPPLIES } from '../data/upgrades';
import { iconURL, ingredientIconURL } from './pixelArt';
import { t, tr } from '../core/i18n';

type Tab = 'supplies' | 'upgrades' | 'decor';

export class CatalogPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private tab: Tab = 'supplies';
  private readonly body: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly title: HTMLElement;

  constructor(
    private readonly ctx: GameContext,
    private readonly shop: ShopSystem,
  ) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    const panel = h('div', 'wb-catalog wb-panel wb-frame-parchment');
    this.title = h('h2');
    this.tabs = h('div', 'wb-seg');
    this.tabs.style.marginBottom = '8px';
    this.body = h('div', 'wb-catalog-grid');
    const close = h('button', 'wb-btn wb-close', '✕');
    close.addEventListener('click', () => ctx.ui.openPanel(null));
    panel.append(close, this.title, this.tabs, this.body);
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
    this.title.textContent = `${t('catalog.title')} · ${s.money} ${t('hud.money')} · ${t('catalog.shopLevel', { n: s.shopLevel })}`;
    this.tabs.innerHTML = '';
    for (const [id, label] of [
      ['supplies', t('catalog.supplies')],
      ['upgrades', t('catalog.upgrades')],
      ['decor', t('catalog.decor')],
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
    if (this.tab === 'supplies') this.renderSupplies();
    else this.renderUpgrades(this.tab === 'decor');
  }

  private card(icon: string, title: string, desc: string, price: number, state: 'buy' | 'owned' | 'locked', onBuy: () => void, extra?: string): HTMLElement {
    const c = h('div', `wb-card${state === 'owned' ? ' owned' : state === 'locked' ? ' locked' : ''}`);
    const tt = h('div', 'title');
    const img = h('img') as HTMLImageElement;
    img.src = icon;
    tt.append(img, h('span', undefined, title));
    c.appendChild(tt);
    c.appendChild(h('div', 'desc', desc));
    const row = h('div', 'row');
    const p = h('span', 'price');
    p.appendChild(h('i'));
    p.appendChild(h('span', undefined, String(price)));
    row.appendChild(p);
    if (extra) row.appendChild(h('span', 'desc', extra));
    const btn = h('button', 'wb-btn primary', state === 'owned' ? t('catalog.owned') : t('catalog.buy')) as HTMLButtonElement;
    btn.disabled = state !== 'buy' || !this.ctx.state.canAfford(price);
    btn.addEventListener('click', () => {
      onBuy();
      this.render();
    });
    row.appendChild(btn);
    c.appendChild(row);
    return c;
  }

  private renderSupplies(): void {
    const s = this.ctx.state;
    for (const def of Object.values(INGREDIENTS)) {
      if (!s.isUnlocked(def.id) || def.sold === false) continue;
      const check = this.shop.canBuyIngredient(def.id);
      const price = this.shop.ingredientPrice(def.id);
      this.body.appendChild(
        this.card(
          ingredientIconURL(def.id),
          `${tr(def.name)} ×${BUNDLE}`,
          tr(def.description),
          price,
          check.reason ? 'locked' : 'buy',
          () => this.shop.buyIngredient(def.id),
          check.reason ?? t('catalog.stock', { n: s.stockOf(def.id) }),
        ),
      );
    }
    this.body.appendChild(
      this.card(iconURL('flask'), t('catalog.flasks'), t('hint.flask'), this.shop.supplyPrice('flasks'), 'buy', () => this.shop.buySupply('flasks'), t('catalog.stock', { n: s.flasks })),
    );
    this.body.appendChild(
      this.card(iconURL('hourglass'), t('catalog.logs'), t('hint.log'), this.shop.supplyPrice('logs'), 'buy', () => this.shop.buySupply('logs'), t('catalog.stock', { n: s.logs })),
    );
    void SUPPLIES;
  }

  private renderUpgrades(decor: boolean): void {
    for (const u of UPGRADES) {
      if ((u.category === 'decoration') !== decor) continue;
      const st = this.shop.upgradeState(u.id);
      const lockText =
        st === 'locked'
          ? (u.requires ?? []).filter((r) => !this.ctx.state.has(r)).map((r) => t('catalog.locked', { name: tr(UPGRADE_MAP[r].name) }))[0] ?? t('catalog.level', { n: u.level })
          : t('catalog.level', { n: u.level });
      this.body.appendChild(
        this.card(iconURL(u.icon === 'crystal' ? 'star' : u.icon === 'cauldron' ? 'flask' : u.icon === 'owl' ? 'heart' : 'gear'), tr(u.name), tr(u.description), u.price, st === 'owned' ? 'owned' : st === 'locked' ? 'locked' : 'buy', () => this.shop.buyUpgrade(u.id), lockText),
      );
    }
  }
}
