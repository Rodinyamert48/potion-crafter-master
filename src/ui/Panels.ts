// Smaller panels: satchel (inventory), pause menu with settings & help,
// and the end-of-day summary.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { INGREDIENTS } from '../data/ingredients';
import { RECIPE_MAP } from '../data/potions';
import { iconURL, ingredientIconURL, potionArtURL } from './pixelArt';
import { getLang, setLang, t, tr, type Lang } from '../core/i18n';
import type { Settings } from '../core/Settings';
import { stars } from '../gameplay/potion/FlaskItem';
import type { FlaskItem } from '../gameplay/potion/FlaskItem';
import { DRAGON_EGG } from '../gameplay/WorldEvents';

abstract class BasePanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  protected readonly inner: HTMLElement;

  constructor(
    protected readonly ctx: GameContext,
    frame: 'wood' | 'parchment' | 'dark',
    cls: string,
    closable = true,
  ) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', `${cls} wb-panel wb-frame-${frame}`);
    this.el.appendChild(this.inner);
    if (closable)
      this.el.addEventListener('pointerdown', (e) => {
        if (e.target === this.el) ctx.ui.openPanel(null);
      });
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

  protected abstract render(): void;

  protected closeButton(): HTMLElement {
    const b = h('button', 'wb-btn wb-close', '✕');
    b.addEventListener('click', () => this.ctx.ui.openPanel(null));
    return b;
  }
}

// ---------------------------------------------------------------------------

export class InventoryPanel extends BasePanel {
  constructor(ctx: GameContext) {
    super(ctx, 'dark', 'wb-inv');
  }

  protected render(): void {
    const s = this.ctx.state;
    const el = this.inner;
    el.innerHTML = '';
    el.appendChild(this.closeButton());
    el.appendChild(h('h2', undefined, t('inv.title')));
    el.appendChild(h('h3', undefined, t('inv.ingredients')));
    for (const def of Object.values(INGREDIENTS)) {
      if (!s.isUnlocked(def.id)) continue;
      const row = h('div', 'item');
      const img = h('img') as HTMLImageElement;
      img.src = ingredientIconURL(def.id);
      row.append(img, h('span', undefined, tr(def.name)), h('span', 'n', `×${s.stockOf(def.id)}`));
      el.appendChild(row);
    }
    el.appendChild(h('h3', undefined, t('inv.supplies')));
    for (const [icon, name, n] of [
      ['flask', t('obj.flask'), s.flasks],
      ['hourglass', t('obj.log'), s.logs],
      ['coin', t('hud.money'), s.money],
    ] as Array<[string, string, number]>) {
      const row = h('div', 'item');
      const img = h('img') as HTMLImageElement;
      img.src = iconURL(icon);
      row.append(img, h('span', undefined, name), h('span', 'n', String(n)));
      el.appendChild(row);
    }
    // Key items (a dragon egg for the King…)
    const items = Object.entries(s.items).filter(([, n]) => n > 0);
    if (items.length) {
      el.appendChild(h('h3', undefined, t('inv.keyItems')));
      for (const [id, n] of items) {
        const row = h('div', 'item');
        const img = h('img') as HTMLImageElement;
        img.src = iconURL(id === DRAGON_EGG ? 'egg' : 'bag');
        row.append(img, h('span', undefined, t(`item.${id}`)), h('span', 'n', `×${n}`));
        el.appendChild(row);
      }
    }
    el.appendChild(h('h3', undefined, t('inv.potions')));
    const flasks = this.ctx.world.ofKind<FlaskItem>('flask').filter((f) => f.potion);
    if (flasks.length === 0) el.appendChild(h('div', 'item', t('inv.none')));
    for (const f of flasks) {
      const r = RECIPE_MAP[f.potion!.recipeId];
      const row = h('div', 'item');
      const img = h('img') as HTMLImageElement;
      img.src = potionArtURL(r.bottle, f.potion!.color, f.potion!.color2);
      row.append(img, h('span', undefined, tr(r.name)), h('span', 'n', stars(f.potion!.tier)));
      el.appendChild(row);
    }
  }
}

// ---------------------------------------------------------------------------

export interface MenuActions {
  save(): void;
  quit(): void;
  applySettings(s: Settings): void;
  eraseSave(): void;
  /** Rooms: host one or see who is in. */
  online(): void;
}

export class MenuPanel extends BasePanel {
  private view: 'main' | 'settings' | 'help' = 'main';
  /** When opened from the title screen there is no "resume". */
  fromTitle = false;

  constructor(
    ctx: GameContext,
    private readonly actions: MenuActions,
  ) {
    super(ctx, 'wood', 'wb-menu');
  }

  override open(): void {
    this.view = this.fromTitle ? 'settings' : 'main';
    super.open();
  }

  showView(v: 'main' | 'settings' | 'help'): void {
    this.view = v;
    this.render();
  }

  protected render(): void {
    const el = this.inner;
    el.innerHTML = '';
    const btn = (label: string, fn: () => void, primary = false) => {
      const b = h('button', `wb-btn${primary ? ' primary' : ''}`, label);
      b.addEventListener('click', () => {
        this.ctx.audio.play('uiClick', {});
        fn();
      });
      el.appendChild(b);
      return b;
    };
    if (this.view === 'main') {
      el.appendChild(h('h2', undefined, t('menu.title')));
      const guest = this.ctx.net.isGuest;
      btn(t('menu.resume'), () => this.ctx.ui.openPanel(null), true);
      btn(t('menu.settings'), () => this.showView('settings'));
      btn(t('menu.help'), () => this.showView('help'));
      btn(`🌐 ${t('net.menu')}`, () => this.actions.online());
      // A guest plays in the host's shop: nothing of theirs to save here.
      if (!guest)
        btn(t('menu.save'), () => {
          this.actions.save();
          this.ctx.bus.emit('toast', { text: t('toast.saved'), kind: 'good' });
        });
      btn(guest ? t('net.leave') : t('menu.quit'), () => this.actions.quit());
      return;
    }
    if (this.view === 'help') {
      el.appendChild(h('h2', undefined, t('help.title')));
      el.appendChild(h('div', 'wb-help', t('help.body')));
      btn(t('settings.back'), () => (this.fromTitle ? this.ctx.ui.openPanel(null) : this.showView('main')));
      return;
    }
    // Settings
    const s = { ...this.ctx.settings };
    el.appendChild(h('h2', undefined, t('settings.title')));
    const slider = (label: string, key: 'master' | 'music' | 'sfx') => {
      const row = h('label', 'wb-setting');
      row.appendChild(h('span', undefined, label));
      const input = h('input') as HTMLInputElement;
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(s[key]);
      input.addEventListener('input', () => {
        s[key] = Number(input.value);
        this.actions.applySettings({ ...this.ctx.settings, [key]: s[key] });
      });
      row.appendChild(input);
      el.appendChild(row);
    };
    const seg = <T extends string>(label: string, options: Array<[T, string]>, value: T, onPick: (v: T) => void) => {
      const row = h('div', 'wb-setting');
      row.appendChild(h('span', undefined, label));
      const g = h('div', 'wb-seg');
      for (const [v, text] of options) {
        const b = h('button', v === value ? 'on' : '', text);
        b.addEventListener('click', () => {
          this.ctx.audio.play('uiClick', {});
          onPick(v);
          this.render();
        });
        g.appendChild(b);
      }
      row.appendChild(g);
      el.appendChild(row);
    };
    slider(t('settings.master'), 'master');
    slider(t('settings.music'), 'music');
    slider(t('settings.sfx'), 'sfx');
    seg(t('settings.pixel'), [['fine', t('settings.pixel.fine')], ['normal', t('settings.pixel.normal')], ['chunky', t('settings.pixel.chunky')]], s.pixel, (v) => this.actions.applySettings({ ...this.ctx.settings, pixel: v }));
    seg<Settings['quality']>(
      t('settings.quality'),
      [
        ['auto', t('settings.quality.auto')],
        ['ps1', t('settings.quality.ps1')],
        ['low', t('settings.quality.low')],
        ['medium', t('settings.quality.medium')],
        ['high', t('settings.quality.high')],
      ],
      s.quality,
      (v) => this.actions.applySettings({ ...this.ctx.settings, quality: v }),
    );
    seg<Lang>(t('settings.language'), [['en', 'English'], ['tr', 'Türkçe']], getLang(), (v) => setLang(v));
    seg(t('settings.shake'), [['on', t('settings.on')], ['off', t('settings.off')]], s.shake ? 'on' : 'off', (v) => this.actions.applySettings({ ...this.ctx.settings, shake: v === 'on' }));
    seg(t('settings.retro'), [['on', t('settings.on')], ['off', t('settings.off')]], s.retro ? 'on' : 'off', (v) => this.actions.applySettings({ ...this.ctx.settings, retro: v === 'on' }));
    const erase = btn(t('settings.reset'), () => {
      if (confirm(t('settings.resetConfirm'))) this.actions.eraseSave();
    });
    erase.style.background = '#a22633';
    btn(t('settings.back'), () => (this.fromTitle ? this.ctx.ui.openPanel(null) : this.showView('main')), true);
  }
}

// ---------------------------------------------------------------------------

export class SummaryPanel extends BasePanel {
  onContinue: (() => void) | null = null;

  constructor(ctx: GameContext) {
    super(ctx, 'parchment', 'wb-summary', false);
  }

  protected render(): void {
    const s = this.ctx.state;
    const d = s.dayStats;
    const el = this.inner;
    el.innerHTML = '';
    el.appendChild(h('h2', undefined, t('summary.title', { n: s.day })));
    const line = (label: string, value: string) => {
      const r = h('div', 'line');
      r.append(h('span', undefined, label), h('b', undefined, value));
      el.appendChild(r);
    };
    line(t('summary.earned'), `+${d.earned}`);
    line(t('summary.spent'), `−${d.spent}`);
    line(t('summary.served'), String(d.served));
    line(t('summary.happy'), String(d.happy));
    line(t('summary.reputation'), `${d.repDelta >= 0 ? '+' : ''}${Math.round(d.repDelta)}`);
    line(t('summary.discoveries'), String(d.discoveries));
    if (d.explosions) line(t('summary.explosions'), String(d.explosions));
    if (d.frogs) line(t('summary.frogs'), String(d.frogs));
    el.appendChild(h('p', undefined, t('summary.saved')));
    const b = h('button', 'wb-btn primary', t('summary.continue'));
    b.addEventListener('click', () => {
      this.ctx.audio.play('chime', {});
      this.onContinue?.();
    });
    el.appendChild(b);
  }
}
