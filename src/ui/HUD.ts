// Heads-up display. Kept light so the shop stays visible: a money plank with
// reputation stars, a clock, a pinned order note, quest notes, the mentor's
// tutorial card and a few icon buttons.

import type { GameContext } from '../core/GameContext';
import type { CustomerSystem } from '../gameplay/customers/CustomerSystem';
import type { DayCycle } from '../gameplay/day/DayCycle';
import type { QuestSystem } from '../gameplay/quests/QuestSystem';
import type { Tutorial } from '../gameplay/tutorial/Tutorial';
import type { UIRoot } from './UIRoot';
import { h } from './UIRoot';
import { iconURL } from './pixelArt';
import { t, tr, onLangChange } from '../core/i18n';
import { QUEST_MAP } from '../data/quests';
import { TIER_NAMES } from '../data/potions';
import type { CustomerRequest } from '../data/types';

export function describeRequest(req: CustomerRequest): string {
  const tagNames = req.tags.map((tag) => t(`tag.${tag}`)).join(' + ');
  const stars = '★'.repeat(req.minTier);
  return `${tagNames} ${stars}${req.minTier < 4 ? '+' : ''} (${tr(TIER_NAMES[req.minTier])})`;
}

export class HUD {
  readonly el: HTMLElement;
  private readonly money: HTMLElement;
  private readonly stars: HTMLElement;
  private readonly clockTime: HTMLElement;
  private readonly clockPhase: HTMLElement;
  private readonly clockIcon: HTMLElement;
  private readonly orderNote: HTMLElement;
  private readonly questBox: HTMLElement;
  private readonly tutorialCard: HTMLElement;
  private lastMoney = -1;
  private lastRep = -1;
  private orderKey = '';
  private questKey = '';
  private readonly buttons: HTMLElement;

  constructor(
    private readonly ctx: GameContext,
    ui: UIRoot,
    private readonly customers: CustomerSystem,
    private readonly day: DayCycle,
    private readonly quests: QuestSystem,
    private readonly tutorial: Tutorial,
  ) {
    this.el = h('div', 'wb-hud');
    const left = h('div', 'wb-hud-left');
    const plank = h('div', 'wb-plank wb-frame-wood');
    const coin = h('span', 'wb-icon');
    coin.style.backgroundImage = `url(${iconURL('coin', 2)})`;
    this.money = h('span', 'wb-money', '0');
    this.stars = h('span', 'wb-stars');
    plank.append(coin, this.money, this.stars);
    plank.title = `${t('hud.money')} / ${t('hud.reputation')}`;
    left.appendChild(plank);
    this.el.appendChild(left);

    const center = h('div', 'wb-hud-center');
    const clock = h('div', 'wb-clock wb-frame-wood');
    this.clockIcon = h('span', 'wb-icon');
    this.clockIcon.style.cssText = 'width:24px;height:24px;background-size:contain;background-repeat:no-repeat;';
    const col = h('div');
    this.clockTime = h('div', 'wb-clock-time');
    this.clockPhase = h('div', 'wb-clock-phase');
    col.append(this.clockTime, this.clockPhase);
    clock.append(this.clockIcon, col);
    center.appendChild(clock);
    this.el.appendChild(center);

    const right = h('div', 'wb-hud-right');
    this.orderNote = h('div', 'wb-note wb-frame-note');
    this.questBox = h('div');
    this.questBox.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:flex-end';
    right.append(this.orderNote, this.questBox);
    this.el.appendChild(right);

    this.tutorialCard = h('div', 'wb-mentor-card wb-frame-dark wb-interactive');
    this.tutorialCard.style.display = 'none';
    this.el.appendChild(this.tutorialCard);

    this.buttons = h('div', 'wb-hud-bottom wb-interactive');
    const mk = (icon: string, title: string, key: string, onClick: () => void) => {
      const b = h('button', 'wb-btn-icon wb-frame-wood');
      const s = h('span');
      s.style.backgroundImage = `url(${iconURL(icon, 2)})`;
      b.appendChild(s);
      b.appendChild(h('kbd', undefined, key));
      b.title = title;
      b.addEventListener('click', () => {
        ctx.audio.play('uiClick', {});
        onClick();
      });
      b.addEventListener('mouseenter', () => ctx.audio.play('uiHover', {}));
      this.buttons.appendChild(b);
    };
    mk('book', t('hud.book'), 'B', () => ui.togglePanel('book'));
    mk('bag', t('hud.inventory'), 'I', () => ui.togglePanel('inventory'));
    mk('scroll', t('hud.catalog'), 'C', () => ui.togglePanel('catalog'));
    mk('door', t('hud.door'), 'O', () => ui.togglePanel('door'));
    mk('trophy', t('hud.achievements'), 'K', () => ui.togglePanel('achievements'));
    mk('gear', t('hud.menu'), 'Esc', () => ui.togglePanel('menu'));
    this.el.appendChild(this.buttons);

    const stations = h('div', 'wb-hud-stations wb-interactive');
    const presets: Array<[string, 'overview' | 'cauldron' | 'table' | 'shelves' | 'counter']> = [
      ['1', 'overview'],
      ['2', 'cauldron'],
      ['3', 'table'],
      ['4', 'shelves'],
      ['5', 'counter'],
    ];
    const labels: Record<string, { en: string; tr: string }> = {
      overview: { en: 'Shop', tr: 'Dükkân' },
      cauldron: { en: 'Cauldron', tr: 'Kazan' },
      table: { en: 'Table', tr: 'Masa' },
      shelves: { en: 'Shelves', tr: 'Raflar' },
      counter: { en: 'Counter', tr: 'Tezgâh' },
    };
    const stationBtns: HTMLButtonElement[] = [];
    for (const [key, preset] of presets) {
      const b = h('button', 'wb-station-btn', `${key} ${tr(labels[preset])}`);
      b.addEventListener('click', () => {
        ctx.renderer.rig.setPreset(ctx.shop.presets[preset]);
        ctx.audio.play('uiClick', {});
      });
      stations.appendChild(b);
      stationBtns.push(b);
    }
    onLangChange(() => presets.forEach(([key, preset], i) => (stationBtns[i].textContent = `${key} ${tr(labels[preset])}`)));
    this.el.appendChild(stations);
    ui.root.appendChild(this.el);

    tutorial.onChange = (text) => this.setTutorial(text);
  }

  private setTutorial(text: string | null): void {
    if (!text) {
      this.tutorialCard.style.display = 'none';
      return;
    }
    this.tutorialCard.style.display = 'block';
    this.tutorialCard.innerHTML = '';
    this.tutorialCard.appendChild(h('div', 'who', t('mentor.name')));
    this.tutorialCard.appendChild(h('div', 'step', text));
    const skip = h('div', 'skip', t('misc.skip'));
    skip.addEventListener('click', () => this.tutorial.skip());
    this.tutorialCard.appendChild(skip);
  }

  set visible(v: boolean) {
    this.el.style.display = v ? 'block' : 'none';
  }

  /** In the garden the shop's station buttons and tool bar step aside. */
  setMode(mode: 'shop' | 'garden'): void {
    this.el.classList.toggle('mode-garden', mode === 'garden');
  }

  update(): void {
    const s = this.ctx.state;
    if (s.money !== this.lastMoney) {
      this.lastMoney = s.money;
      this.money.textContent = String(s.money);
    }
    const rep = Math.round(s.reputation);
    if (rep !== this.lastRep) {
      this.lastRep = rep;
      this.stars.innerHTML = '';
      const full = Math.floor(s.stars);
      const half = s.stars - full >= 0.5;
      for (let i = 0; i < 5; i++) {
        const st = h('span', 'wb-star');
        st.style.backgroundImage = `url(${iconURL(i < full || (i === full && half) ? 'star' : 'starEmpty', 2)})`;
        if (i === full && half) st.style.opacity = '0.6';
        this.stars.appendChild(st);
      }
      this.stars.title = `${t('hud.reputation')}: ${rep}/100`;
    }
    const night = this.ctx.renderer.lighting.nightness > 0.5;
    this.clockIcon.style.backgroundImage = `url(${iconURL(night ? 'moon' : 'sun', 2)})`;
    this.clockTime.textContent = `${t('hud.day', { n: s.day })} · ${this.day.timeString}`;
    this.clockPhase.textContent = `${t(`phase.${s.phase}`)} · ${s.shopOpen ? t('hud.open') : t('hud.closed')}`;

    // Order note
    const c = this.customers.current;
    const g = this.ctx.shop.cauldron.guide;
    const guideText = g ? (g.ready ? t('guide.ready') : g.tips[0] ?? '') : '';
    const key = c ? `${c.uid}:${c.phase}:${Math.round((c.patience / c.patienceMax) * 20)}:${guideText}` : 'none';
    if (key !== this.orderKey) {
      this.orderKey = key;
      this.orderNote.innerHTML = '';
      this.orderNote.appendChild(h('div', 'wb-note-title', t('hud.order')));
      if (c && (c.phase === 'waiting' || c.phase === 'ordering')) {
        this.orderNote.appendChild(h('div', 'wb-note-body', `${c.name}: ${describeRequest(c.request)}`));
        if (g && c.phase === 'waiting') {
          const name = g.known ? tr(g.recipe.name) : t('book.unknown');
          this.orderNote.appendChild(h('div', `wb-note-guide${g.ready ? ' ready' : ''}`, `🧪 ${name}: ${guideText}`));
        }
        if (!c.infinitePatience) {
          const bar = h('div', 'wb-patience');
          const fill = h('span');
          fill.style.width = `${Math.max(0, (c.patience / c.patienceMax) * 100)}%`;
          if (c.patience / c.patienceMax < 0.3) fill.style.background = '#e43b44';
          bar.appendChild(fill);
          this.orderNote.appendChild(bar);
        }
      } else {
        const next = this.customers.pendingVisits[0];
        this.orderNote.appendChild(h('div', 'wb-note-body', t('hud.noOrder')));
        if (next && s.shopOpen) {
          const hh = Math.floor(next.hour);
          const mm = Math.floor((next.hour - hh) * 6) * 10;
          this.orderNote.appendChild(h('div', 'wb-note-sub', `⏳ ~${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`));
        }
      }
    }
    // Quest notes
    const qk = this.quests.active.map((q) => q.id + s.quests[q.id]?.returnDay).join(',') + s.day;
    if (qk !== this.questKey) {
      this.questKey = qk;
      this.questBox.innerHTML = '';
      for (const q of this.quests.active) {
        if (q.id === 'first_brew') continue;
        const st = s.quests[q.id];
        const note = h('div', 'wb-note wb-frame-note');
        note.appendChild(h('div', 'wb-note-title', t('hud.quest')));
        note.appendChild(h('div', 'wb-note-body', tr(q.title)));
        note.appendChild(h('div', 'wb-note-sub', tr(q.description)));
        if (st) note.appendChild(h('div', 'wb-note-sub', t('book.returns', { d: st.returnDay, phase: t(`phase.${QUEST_MAP[q.id].returnPhase}`) })));
        this.questBox.appendChild(note);
      }
    }
  }
}
