// Admin menu (the key under Esc – ` or " depending on the keyboard layout),
// locked with a PIN. Lets you tweak nearly everything: money, reputation,
// the clock, stock, recipes, visitors, the cauldron, achievements and more.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { t, tr } from '../core/i18n';
import { INGREDIENTS } from '../data/ingredients';
import { RECIPES, RECIPE_MAP, BASIC_RECIPES } from '../data/potions';
import { CUSTOMERS } from '../data/customers';
import { ACHIEVEMENTS } from '../data/achievements';
import { FURNITURE, FURNITURE_SLOTS, fitsSlot } from '../data/furniture';
import type { DayCycle } from '../gameplay/day/DayCycle';
import type { PrepState } from '../data/types';

export const ADMIN_PIN = '4884';

export interface AdminActions {
  day: DayCycle;
  visit(customerId: string): void;
  summonMerchant(): void;
  summonNobert(): boolean;
  luck(): void;
  save(): boolean;
  spawnPotion(recipeId: string, tier: 1 | 2 | 3 | 4): void;
  spawnIngredient(id: string, state: PrepState): void;
  syncFurniture(): void;
  endDay(): void;
}

export class AdminPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;
  private unlocked = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly actions: AdminActions,
  ) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-admin wb-panel wb-frame-dark');
    this.el.appendChild(this.inner);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) ctx.ui.openPanel(null);
    });
    // Typing into the admin fields must not trigger game shortcuts.
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') ctx.ui.openPanel(null);
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

  private toast(text: string): void {
    this.ctx.bus.emit('toast', { text: `🛠 ${text}`, kind: 'info' });
    this.ctx.audio.play('uiClick', {});
  }

  private render(): void {
    const el = this.inner;
    el.innerHTML = '';
    const close = h('button', 'wb-btn wb-close', '✕');
    close.addEventListener('click', () => this.ctx.ui.openPanel(null));
    el.appendChild(close);
    el.appendChild(h('h2', undefined, `🛠 ${t('admin.title')}`));
    if (!this.unlocked) this.renderLock();
    else this.renderTools();
  }

  private renderLock(): void {
    const box = h('div', 'wb-admin-lock');
    box.appendChild(h('p', undefined, t('admin.pin')));
    const input = h('input', 'wb-admin-input wb-admin-pin') as HTMLInputElement;
    input.type = 'password';
    input.inputMode = 'numeric';
    input.maxLength = 8;
    input.autocomplete = 'off';
    const msg = h('p', 'wb-admin-msg');
    const go = h('button', 'wb-btn primary', t('admin.enter'));
    const tryIt = () => {
      if (input.value === ADMIN_PIN) {
        this.unlocked = true;
        this.ctx.audio.play('chime', {});
        this.render();
      } else {
        msg.textContent = t('admin.wrong');
        input.value = '';
        box.classList.remove('shake');
        void box.offsetWidth;
        box.classList.add('shake');
        this.ctx.audio.play('denied', {});
      }
    };
    go.addEventListener('click', tryIt);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryIt();
    });
    box.append(input, go, msg);
    this.inner.appendChild(box);
    setTimeout(() => input.focus(), 30);
  }

  // -------------------------------------------------------------------------

  private renderTools(): void {
    const ctx = this.ctx;
    const s = ctx.state;
    const a = this.actions;
    const grid = h('div', 'wb-admin-grid');
    this.inner.appendChild(grid);

    const section = (title: string) => {
      const sec = h('div', 'wb-admin-sec');
      sec.appendChild(h('h3', undefined, title));
      grid.appendChild(sec);
      return sec;
    };
    const row = (parent: HTMLElement, label: string, ...controls: HTMLElement[]) => {
      const r = h('div', 'wb-admin-row');
      r.appendChild(h('span', 'wb-admin-label', label));
      r.append(...controls);
      parent.appendChild(r);
      return r;
    };
    const btn = (label: string, fn: () => void) => {
      const b = h('button', 'wb-btn', label);
      b.addEventListener('click', () => {
        fn();
        this.render();
      });
      return b;
    };
    const num = (value: number, step = 1) => {
      const i = h('input', 'wb-admin-input') as HTMLInputElement;
      i.type = 'number';
      i.step = String(step);
      i.value = String(Math.round(value * 100) / 100);
      return i;
    };
    const select = (options: Array<[string, string]>) => {
      const sel = h('select', 'wb-admin-input') as HTMLSelectElement;
      for (const [v, label] of options) {
        const o = h('option', undefined, label) as HTMLOptionElement;
        o.value = v;
        sel.appendChild(o);
      }
      return sel;
    };

    // Economy
    const eco = section(t('admin.economy'));
    const money = num(s.money);
    row(eco, t('hud.money'), money, btn(t('admin.set'), () => s.addMoney(Math.round(Number(money.value) || 0) - s.money)), btn('+100', () => s.addMoney(100)), btn('+1000', () => s.addMoney(1000)));
    const rep = num(s.reputation);
    row(eco, t('admin.reputation'), rep, btn(t('admin.set'), () => s.addReputation((Number(rep.value) || 0) - s.reputation)), btn('+10', () => s.addReputation(10)));

    // Time
    const time = section(t('admin.time'));
    const day = num(s.day);
    row(time, t('admin.day'), day, btn(t('admin.set'), () => {
      s.day = Math.max(1, Math.round(Number(day.value) || 1));
      ctx.bus.emit('day:start', { day: s.day });
      this.toast(t('admin.done'));
    }));
    const hour = num(s.hour, 0.5);
    row(time, t('admin.hour'), hour, btn(t('admin.set'), () => a.day.setHour(Number(hour.value) || 8)));
    const speeds = [1, 2, 5, 10].map((k) => {
      const b = btn(`×${k}`, () => (a.day.timeScale = k));
      if (a.day.timeScale === k) b.classList.add('on');
      return b;
    });
    row(time, t('admin.speed'), ...speeds);
    row(time, t('admin.clock'), btn(a.day.frozen ? t('admin.resume') : t('admin.freeze'), () => (a.day.frozen = !a.day.frozen)), btn(t('admin.endDay'), () => {
      ctx.ui.openPanel(null);
      a.endDay();
    }));

    // Stock
    const stock = section(t('admin.stock'));
    for (const def of Object.values(INGREDIENTS)) {
      const n = num(s.stockOf(def.id));
      row(stock, tr(def.name) + (s.isUnlocked(def.id) ? '' : ' 🔒'), n, btn(t('admin.set'), () => {
        s.unlock(def.id);
        s.addStock(def.id, Math.max(0, Math.round(Number(n.value) || 0)) - s.stockOf(def.id));
      }), btn('+10', () => {
        s.unlock(def.id);
        s.addStock(def.id, 10);
      }));
    }
    const flasks = num(s.flasks);
    row(stock, t('admin.flasks'), flasks, btn(t('admin.set'), () => s.addStock('flask', Math.max(0, Math.round(Number(flasks.value) || 0)) - s.flasks)));
    const logs = num(s.logs);
    row(stock, t('admin.logs'), logs, btn(t('admin.set'), () => s.addStock('log', Math.max(0, Math.round(Number(logs.value) || 0)) - s.logs)));
    row(stock, '', btn(t('admin.unlockAll'), () => {
      for (const def of Object.values(INGREDIENTS)) {
        s.unlock(def.id);
        if (s.stockOf(def.id) < 10) s.addStock(def.id, 10 - s.stockOf(def.id));
      }
      this.toast(t('admin.done'));
    }));

    // Recipes
    const rec = section(t('admin.recipes'));
    row(rec, '', btn(t('admin.learnAll'), () => {
      for (const r of RECIPES) if (r.kind === 'potion') s.learnRecipe(r.id);
      ctx.bus.emit('recipe:learned', { id: 'all', source: 'admin' });
      this.toast(t('admin.done'));
    }), btn(t('admin.discoverAll'), () => {
      for (const r of RECIPES) {
        if (!s.discovered[r.id]) s.discovered[r.id] = { day: s.day, count: 1, bestTier: r.maxTier ?? 3, ingredients: [], brewTemp: 60 };
        if (r.kind === 'potion') s.learnRecipe(r.id);
      }
      this.toast(t('admin.done'));
    }));
    row(rec, '', btn(t('admin.resetRecipes'), () => {
      s.learned = [...BASIC_RECIPES];
      this.toast(t('admin.done'));
    }));

    // Visitors
    const vis = section(t('admin.visitors'));
    const who = select(Object.values(CUSTOMERS).map((c) => [c.id, `${c.celebrity ? '★ ' : ''}${tr(c.name)}`]));
    row(vis, t('admin.customer'), who, btn(t('admin.call'), () => {
      a.visit(who.value);
      this.toast(t('admin.coming', { name: tr(CUSTOMERS[who.value].name) }));
    }));
    row(vis, '', btn(t('admin.merchant'), () => a.summonMerchant()), btn(t('admin.nobert'), () => {
      if (!a.summonNobert()) this.toast(t('admin.nobertNo'));
    }), btn(t('admin.luck'), () => a.luck()));

    // Cauldron & fire
    const caul = section(t('admin.cauldron'));
    const cauldron = ctx.shop.cauldron;
    const water = num(cauldron.chem.water, 0.1);
    row(caul, t('admin.water'), water, btn(t('admin.set'), () => {
      const want = Math.max(0, Math.min(6, Number(water.value) || 0));
      const d = want - cauldron.chem.water;
      if (d > 0) cauldron.addWater(ctx, d);
      else if (d < 0) cauldron.drain(ctx, -d);
    }));
    const temp = num(cauldron.chem.temperature);
    row(caul, t('admin.temp'), temp, btn(t('admin.set'), () => (cauldron.chem.temperature = Math.max(0, Math.min(160, Number(temp.value) || 20)))));
    const fuel = num(ctx.shop.hearth.fuel, 0.1);
    row(caul, t('admin.fire'), fuel, btn(t('admin.set'), () => (ctx.shop.hearth.fuel = Math.max(0, Math.min(1.5, Number(fuel.value) || 0)))));
    row(caul, '', btn(t('admin.empty'), () => cauldron.drain(ctx, cauldron.chem.water + 1)));

    // Spawn
    const spawn = section(t('admin.spawn'));
    const potion = select(RECIPES.filter((r) => r.kind === 'potion').map((r) => [r.id, tr(r.name)]));
    const tier = select([
      ['1', '★'],
      ['2', '★★'],
      ['3', '★★★'],
      ['4', '★★★★'],
    ]);
    tier.value = '3';
    row(spawn, t('admin.potion'), potion, tier, btn(t('admin.give'), () => {
      a.spawnPotion(potion.value, Number(tier.value) as 1 | 2 | 3 | 4);
      this.toast(t('admin.given', { name: tr(RECIPE_MAP[potion.value].name) }));
    }));
    const ing = select(Object.values(INGREDIENTS).map((d) => [d.id, tr(d.name)]));
    const st = select((['whole', 'sliced', 'mashed', 'dried', 'ground', 'shards', 'strips', 'cracked', 'crumbled'] as PrepState[]).map((x) => [x, x]));
    row(spawn, t('admin.ingredient'), ing, st, btn(t('admin.give'), () => {
      const def = INGREDIENTS[ing.value];
      const state = (def.states[st.value as PrepState] ? st.value : 'whole') as PrepState;
      a.spawnIngredient(ing.value, state);
    }));

    // Achievements & furniture
    const misc = section(t('admin.misc'));
    row(misc, t('ach.title'), btn(t('admin.unlockAllAch'), () => {
      for (const ach of ACHIEVEMENTS) if (s.achievements[ach.id] === undefined) s.achievements[ach.id] = s.day;
      this.toast(t('admin.done'));
    }), btn(t('admin.resetAch'), () => {
      s.achievements = {};
      this.toast(t('admin.done'));
    }));
    row(misc, t('catalog.furniture'), btn(t('admin.furnish'), () => {
      for (const slot of FURNITURE_SLOTS) {
        if (s.furniture[slot.id]) continue;
        const free = FURNITURE.filter((f) => fitsSlot(f, slot) && !Object.values(s.furniture).includes(f.id));
        const pick = free.find((f) => f.kind === slot.kind) ?? free[0];
        if (pick) s.furniture[slot.id] = pick.id;
      }
      a.syncFurniture();
    }), btn(t('admin.unfurnish'), () => {
      s.furniture = {};
      a.syncFurniture();
    }));
    row(misc, t('admin.saveGame'), btn(t('admin.saveNow'), () => this.toast(a.save() ? t('toast.saved') : t('admin.saveFail'))));
  }
}
