// The Potion Book (grimoire): discovered potions with the player's own notes,
// "???" pages for undiscovered ones (with hints once someone asked for them),
// ingredients and their essences, the essence rules, the experiment journal
// and quests. Styled as an open pixel-art book.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { RECIPES, RECIPE_MAP, TIER_NAMES } from '../data/potions';
import { INGREDIENTS } from '../data/ingredients';
import { ASPECTS, ASPECT_IDS } from '../data/aspects';
import { QUESTS } from '../data/quests';
import type { AspectId, IngredientDef, RecipeDef } from '../data/types';
import { aspectIconURL, ingredientIconURL, potionArtURL } from './pixelArt';
import { t, tr } from '../core/i18n';
import { stars } from '../gameplay/potion/FlaskItem';

type Tab = 'potions' | 'ingredients' | 'aspects' | 'journal' | 'quests';

export class BookPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private tab: Tab = 'potions';
  private selected: string | null = null;
  private readonly left: HTMLElement;
  private readonly right: HTMLElement;
  private readonly tabs: HTMLElement;

  constructor(private readonly ctx: GameContext) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    const book = h('div', 'wb-book wb-panel');
    this.tabs = h('div', 'wb-book-tabs');
    book.appendChild(this.tabs);
    this.left = h('div', 'wb-page');
    this.right = h('div', 'wb-page');
    book.append(this.left, this.right);
    const close = h('button', 'wb-btn wb-close', '✕');
    close.title = t('book.close');
    close.addEventListener('click', () => ctx.ui.openPanel(null));
    book.appendChild(close);
    this.el.appendChild(book);
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
    this.ctx.audio.play('bookOpen', { volume: 0.5, pitch: 0.8 });
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.selected = null;
    this.ctx.audio.play('pageFlip', {});
    this.render();
  }

  private render(): void {
    this.tabs.innerHTML = '';
    const tabs: Array<[Tab, string]> = [
      ['potions', t('book.potions')],
      ['ingredients', t('book.ingredients')],
      ['aspects', t('book.aspects')],
      ['journal', t('book.journal')],
      ['quests', t('book.quests')],
    ];
    for (const [id, label] of tabs) {
      const b = h('button', `wb-tab${id === this.tab ? ' active' : ''}`, label);
      b.addEventListener('click', () => this.setTab(id));
      this.tabs.appendChild(b);
    }
    this.left.innerHTML = '';
    this.right.innerHTML = '';
    switch (this.tab) {
      case 'potions':
        this.renderPotions();
        break;
      case 'ingredients':
        this.renderIngredients();
        break;
      case 'aspects':
        this.renderAspects();
        break;
      case 'journal':
        this.renderJournal();
        break;
      case 'quests':
        this.renderQuests();
        break;
    }
  }

  // -------------------------------------------------------------------------

  private renderPotions(): void {
    const s = this.ctx.state;
    const potions = RECIPES.filter((r) => r.kind === 'potion');
    const failures = RECIPES.filter((r) => r.kind === 'failure');
    const found = RECIPES.filter((r) => s.discovered[r.id]).length;
    this.left.appendChild(h('h2', undefined, t('book.title')));
    this.left.appendChild(h('p', 'muted', t('book.discoveredCount', { n: found, total: RECIPES.length })));
    const list = (arr: RecipeDef[]) => {
      for (const r of arr) {
        const known = !!s.discovered[r.id];
        const row = h('div', `wb-entry${known ? '' : ' unknown'}${this.selected === r.id ? ' selected' : ''}`);
        const sw = h('span', 'swatch');
        sw.style.background = known ? r.color : '#b8a88a';
        row.appendChild(sw);
        row.appendChild(h('span', 'name', known ? tr(r.name) : t('book.unknown')));
        if (known) row.appendChild(h('span', 'meta', stars(s.discovered[r.id].bestTier)));
        else if (s.hinted.includes(r.id)) row.appendChild(h('span', 'meta', t('book.asked')));
        row.addEventListener('click', () => {
          this.selected = r.id;
          this.ctx.audio.play('uiClick', {});
          this.render();
        });
        this.left.appendChild(row);
      }
    };
    // Discovered first, then the ones customers have asked about.
    const rank = (r: RecipeDef) => (s.discovered[r.id] ? 0 : s.hinted.includes(r.id) ? 1 : 2);
    const byRank = (arr: RecipeDef[]) => arr.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
    list(byRank(potions));
    this.left.appendChild(h('h3', undefined, t('book.failed')));
    list(byRank(failures));
    const sel = RECIPE_MAP[this.selected ?? ''] ?? potions.find((r) => s.discovered[r.id]) ?? potions[0];
    this.renderPotionPage(sel);
  }

  private renderPotionPage(r: RecipeDef): void {
    const s = this.ctx.state;
    const d = s.discovered[r.id];
    const page = this.right;
    const img = h('img', 'wb-potion-art') as HTMLImageElement;
    img.src = potionArtURL(r.bottle, r.color, r.color2, !d);
    page.appendChild(img);
    if (!d) {
      page.appendChild(h('h2', undefined, t('book.unknown')));
      page.appendChild(h('p', 'muted', t('book.undiscovered')));
      if (s.hinted.includes(r.id) || r.kind === 'failure') {
        page.appendChild(h('h3', undefined, t('book.hint')));
        page.appendChild(h('p', undefined, tr(r.hint)));
      }
      return;
    }
    page.appendChild(h('h2', undefined, tr(r.name)));
    page.appendChild(h('p', undefined, tr(r.description)));
    const stamp = h('span', `wb-stamp${r.kind === 'potion' ? ' ok' : ''}`, r.kind === 'potion' ? t('book.success') : t('book.failed'));
    page.appendChild(stamp);
    page.appendChild(h('h3', undefined, t('book.bestTier')));
    page.appendChild(h('p', undefined, `${stars(d.bestTier)} ${tr(TIER_NAMES[d.bestTier])} · ${t('book.brewed', { n: d.count })}`));
    page.appendChild(h('p', undefined, `${t('book.price')}: ${r.price} ${t('hud.money')}`));
    page.appendChild(h('h3', undefined, t('book.yourRecipe')));
    const ul = h('div');
    d.ingredients.forEach((entry, i) => {
      const [id, states] = entry.split(':');
      const def = INGREDIENTS[id];
      if (!def) return;
      const row = h('div', 'wb-aspect-row');
      const ic = h('img') as HTMLImageElement;
      ic.src = ingredientIconURL(id);
      ic.style.width = '20px';
      ic.style.height = '20px';
      row.appendChild(h('span', undefined, `${i + 1}.`));
      row.appendChild(ic);
      const stateNames = (states ?? '')
        .split('/')
        .filter(Boolean)
        .map((st) => tr(def.states[st as keyof typeof def.states]?.name ?? { en: st, tr: st }))
        .join(', ');
      row.appendChild(h('span', undefined, `${tr(def.name)} (${stateNames})`));
      ul.appendChild(row);
    });
    page.appendChild(ul);
    page.appendChild(h('p', 'muted', t('book.temp', { t: d.brewTemp })));
    page.appendChild(h('h3', undefined, t('book.hint')));
    page.appendChild(h('p', 'muted', tr(r.hint)));
  }

  // -------------------------------------------------------------------------

  private renderIngredients(): void {
    const s = this.ctx.state;
    this.left.appendChild(h('h2', undefined, t('book.ingredients')));
    const defs = Object.values(INGREDIENTS).filter((d) => s.isUnlocked(d.id));
    for (const d of defs) {
      const row = h('div', `wb-entry${this.selected === d.id ? ' selected' : ''}`);
      const ic = h('img') as HTMLImageElement;
      ic.src = ingredientIconURL(d.id);
      ic.style.cssText = 'width:24px;height:24px';
      row.appendChild(ic);
      row.appendChild(h('span', 'name', tr(d.name)));
      row.appendChild(h('span', 'meta', `×${s.stockOf(d.id)}`));
      row.addEventListener('click', () => {
        this.selected = d.id;
        this.ctx.audio.play('uiClick', {});
        this.render();
      });
      this.left.appendChild(row);
    }
    const locked = Object.values(INGREDIENTS).filter((d) => !s.isUnlocked(d.id));
    if (locked.length) {
      this.left.appendChild(h('h3', undefined, t('catalog.notUnlocked')));
      for (const _ of locked) this.left.appendChild(h('div', 'wb-entry unknown', t('book.unknown')));
    }
    const sel = INGREDIENTS[this.selected ?? ''] ?? defs[0];
    if (sel) this.renderIngredientPage(sel);
  }

  private renderIngredientPage(d: IngredientDef): void {
    const s = this.ctx.state;
    const page = this.right;
    const ic = h('img', 'wb-potion-art') as HTMLImageElement;
    ic.src = ingredientIconURL(d.id);
    ic.style.width = '64px';
    ic.style.height = '64px';
    page.appendChild(ic);
    page.appendChild(h('h2', undefined, tr(d.name)));
    page.appendChild(h('p', undefined, tr(d.description)));
    page.appendChild(h('h3', undefined, t('book.effects')));
    if (s.knows(d.id)) {
      for (const [a, v] of Object.entries(d.effects) as Array<[AspectId, number]>) page.appendChild(this.aspectRow(a, v));
    } else page.appendChild(h('p', 'muted', t('book.unknownEssence')));
    page.appendChild(h('h3', undefined, t('book.prep')));
    for (const [st, def] of Object.entries(d.states)) {
      if (!def || st === 'charred') continue;
      const mods = Object.entries(def.effects ?? {})
        .map(([a, m]) => `${tr(ASPECTS[a as AspectId].name)} ×${m}`)
        .join(', ');
      page.appendChild(h('p', undefined, `• ${tr(def.name)}: ${mods || '—'}`));
    }
    const tools: string[] = [];
    for (const r of d.processes) {
      if (!r.to) continue;
      const tool = { slice: t('obj.knife'), smash: t('obj.hammer'), grind: t('obj.mortar'), dry: t('obj.rack'), burn: t('obj.hearth') }[r.action];
      if (r.action === 'burn') continue;
      const from = r.from.map((f) => tr(d.states[f]?.name ?? { en: f, tr: f })).join('/');
      tools.push(`${tool}: ${from} → ${tr(d.states[r.to]?.name ?? { en: r.to, tr: r.to })}`);
    }
    if (tools.length) {
      page.appendChild(h('h3', undefined, '⚒'));
      for (const line of tools) page.appendChild(h('p', undefined, line));
    }
    page.appendChild(h('p', 'muted', `${t('book.priceEach', { p: d.price })}`));
  }

  private aspectRow(a: AspectId, v: number): HTMLElement {
    const row = h('div', 'wb-aspect-row');
    const ic = h('img') as HTMLImageElement;
    ic.src = aspectIconURL(a);
    row.appendChild(ic);
    const name = h('span', undefined, tr(ASPECTS[a].name));
    name.style.minWidth = '90px';
    row.appendChild(name);
    const pips = h('span', 'wb-pips', '+'.repeat(Math.max(1, Math.round(v))));
    pips.style.color = ASPECTS[a].color;
    pips.style.textShadow = '1px 1px 0 #3e2731';
    row.appendChild(pips);
    return row;
  }

  // -------------------------------------------------------------------------

  private renderAspects(): void {
    this.left.appendChild(h('h2', undefined, t('book.aspects')));
    const base = ASPECT_IDS.filter((a) => !ASPECTS[a].derived);
    const derived = ASPECT_IDS.filter((a) => ASPECTS[a].derived);
    for (const a of base) {
      const row = this.aspectRow(a, 0);
      row.lastElementChild!.remove();
      this.left.appendChild(row);
      this.left.appendChild(h('p', 'muted', tr(ASPECTS[a].description)));
    }
    this.right.appendChild(h('h2', undefined, '✦'));
    for (const a of derived) {
      const row = this.aspectRow(a, 0);
      row.lastElementChild!.remove();
      this.right.appendChild(row);
      this.right.appendChild(h('p', 'muted', tr(ASPECTS[a].description)));
    }
    const rules = [
      { en: 'Temperature: 0–30 Cold · 30–70 Warm · 70–100 Hot · 100–130 Boiling · 130+ DANGER', tr: 'Sıcaklık: 0–30 Soğuk · 30–70 Ilık · 70–100 Sıcak · 100–130 Kaynıyor · 130+ TEHLİKE' },
      { en: 'Stirring: slow = stable, fast = strong reaction, frantic = chaos vortex.', tr: 'Karıştırma: yavaş = dengeli, hızlı = güçlü tepkime, çılgınca = kaos girdabı.' },
      { en: 'More water dilutes the brew; boiling slowly concentrates it.', tr: 'Fazla su iksiri seyreltir; kaynatmak yavaşça yoğunlaştırır.' },
      { en: 'The cauldron can only hold so much – overload it and it explodes.', tr: 'Kazanın bir sınırı var – fazla doldurursan patlar.' },
      { en: 'Order matters: what dissolves first shapes what comes after.', tr: 'Sıra önemlidir: önce çözünen, sonrakini şekillendirir.' },
    ];
    this.right.appendChild(h('h3', undefined, t('book.hint')));
    for (const r of rules) this.right.appendChild(h('p', undefined, `• ${tr(r)}`));
  }

  private renderJournal(): void {
    const s = this.ctx.state;
    this.left.appendChild(h('h2', undefined, t('book.journal')));
    const entries = [...s.journal].reverse();
    if (entries.length === 0) this.left.appendChild(h('p', 'muted', t('book.noEntries')));
    const half = Math.ceil(entries.length / 2);
    entries.forEach((e, i) => {
      const target = i < half ? this.left : this.right;
      const r = RECIPE_MAP[e.recipeId];
      const row = h('div', 'wb-entry');
      const sw = h('span', 'swatch');
      sw.style.background = r?.color ?? '#e43b44';
      row.appendChild(sw);
      const hh = Math.floor(e.hour);
      const name = e.event === 'explosion' ? t('book.explosion') : r ? `${tr(r.name)} ${stars(e.tier)}` : e.recipeId;
      const col = h('div');
      col.style.flex = '1';
      col.appendChild(h('div', 'name', name));
      const ingredients = e.ingredients.map((x) => tr(INGREDIENTS[x.split(':')[0]]?.name ?? { en: x, tr: x })).join(' → ');
      col.appendChild(h('div', 'meta', `${t('book.day', { d: e.day })} ${String(hh).padStart(2, '0')}:00 · ${ingredients || '—'} · ${e.brewTemp}°C`));
      row.appendChild(col);
      row.appendChild(h('span', `wb-stamp${e.success ? ' ok' : ''}`, e.success ? '✓' : '✗'));
      target.appendChild(row);
    });
  }

  private renderQuests(): void {
    const s = this.ctx.state;
    this.left.appendChild(h('h2', undefined, t('book.quests')));
    const started = QUESTS.filter((q) => s.quests[q.id]);
    if (started.length === 0) this.left.appendChild(h('p', 'muted', t('book.noQuests')));
    for (const q of started) {
      const st = s.quests[q.id];
      const target = st.status === 'active' ? this.left : this.right;
      target.appendChild(h('h3', undefined, `${tr(q.title)} — ${st.status === 'active' ? t('book.active') : st.status === 'completed' ? t('book.completed') : t('book.failedQuest')}`));
      target.appendChild(h('p', undefined, tr(q.description)));
      if (st.status === 'active' && q.giver !== 'mentor') target.appendChild(h('p', 'muted', t('book.returns', { d: st.returnDay, phase: t(`phase.${q.returnPhase}`) })));
      const reward = [q.reward.money ? `${q.reward.money} ${t('hud.money')}` : '', q.reward.reputation ? `+${q.reward.reputation} ★` : '', ...(q.reward.unlock ?? []).map((u) => tr(INGREDIENTS[u].name))].filter(Boolean).join(', ');
      target.appendChild(h('p', 'muted', `${t('book.reward')}: ${reward}`));
      if (q.teaches) target.appendChild(h('p', 'muted', `✎ ${tr(q.teaches)}`));
    }
  }
}
