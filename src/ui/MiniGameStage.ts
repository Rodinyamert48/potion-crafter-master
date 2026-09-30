// The frame around a running gathering mini game: region name, the game's
// one-line instructions, a time bar, the pixel canvas with a flash line for
// "Ouch!" messages, and the basket. Used by the region list (touch devices)
// and by the gathering altars in the open world.

import type { GameContext } from '../core/GameContext';
import { h } from './UIRoot';
import type { RegionDef, RegionFind, RegionHazard } from '../data/regions';
import { INGREDIENTS } from '../data/ingredients';
import { ingredientIconURL } from './pixelArt';
import { t, tr } from '../core/i18n';
import { createMiniGame, type MiniGame, type PetId } from './minigames';

export interface StageOptions {
  region: RegionDef;
  night: boolean;
  finds: RegionFind[];
  hazards: RegionHazard[];
  capacity: number;
  pets?: PetId[];
  onEnd(haul: Record<string, number>): void;
}

export class MiniGameStage {
  readonly el: HTMLElement;
  readonly game: MiniGame;
  private readonly basket: HTMLElement;
  private readonly flashEl: HTMLElement;
  private readonly bar: HTMLElement;

  constructor(
    private readonly ctx: GameContext,
    o: StageOptions,
  ) {
    const r = o.region;
    this.el = h('div', 'wb-stage');
    const head = h('div', 'wb-trip-head');
    head.appendChild(h('h2', undefined, tr(r.name)));
    this.el.appendChild(head);
    const time = h('div', 'wb-trip-time');
    this.bar = h('span');
    time.appendChild(this.bar);
    this.el.appendChild(time);
    this.game = createMiniGame(r.id, {
      region: r,
      night: o.night,
      finds: o.finds,
      hazards: o.hazards,
      audio: ctx.audio,
      capacity: o.capacity,
      pets: o.pets,
      events: {
        onCollect: (_id, _n, full) => {
          this.updateBasket();
          if (full) this.flash(t('trip.full'));
        },
        onHurt: (hazardId, lost) => {
          const hz = o.hazards.find((z) => z.id === hazardId) ?? r.hazards.find((z) => z.id === hazardId);
          this.flash(`${t('trip.ouch')} ${hz ? tr(hz.name) : ''}${lost ? ` – ${tr(INGREDIENTS[lost].name)} ${t('trip.dropped')}` : ''}`);
          this.updateBasket();
        },
        onTick: (p) => {
          this.bar.style.width = `${Math.round((1 - p) * 100)}%`;
        },
        onEnd: (haul) => o.onEnd(haul),
      },
    });
    head.appendChild(h('div', 'wb-trip-help', this.game.help));
    const frame = h('div', 'wb-trip-frame');
    frame.appendChild(this.game.canvas);
    this.flashEl = h('div', 'wb-trip-flash');
    frame.appendChild(this.flashEl);
    this.el.appendChild(frame);
    this.basket = h('div', 'wb-trip-basket');
    this.el.appendChild(this.basket);
    this.updateBasket();
  }

  start(): void {
    this.game.start();
  }

  /** End now (reports the haul through onEnd once). */
  finish(): void {
    this.game.finish();
  }

  stop(): void {
    this.game.stop();
  }

  private updateBasket(): void {
    const basket = this.basket;
    basket.innerHTML = '';
    const haul = this.game.haul;
    basket.appendChild(h('span', 'label', `${t('trip.basket')} ${this.game.count}/${this.game.capacity}:`));
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
    const f = this.flashEl;
    f.textContent = text;
    f.classList.remove('show');
    void f.offsetWidth;
    f.classList.add('show');
    void this.ctx;
  }
}

/** A haul as a list of icon rows (result screens). */
export function haulList(haul: Record<string, number>): HTMLElement {
  const list = h('div', 'wb-trip-result');
  let any = false;
  for (const [id, n] of Object.entries(haul)) {
    if (n <= 0) continue;
    any = true;
    const row = h('div', 'row');
    const img = h('img') as HTMLImageElement;
    img.src = ingredientIconURL(id);
    row.append(img, h('span', 'name', tr(INGREDIENTS[id].name)), h('span', 'n', `×${n}`));
    list.appendChild(row);
  }
  if (!any) list.appendChild(h('p', 'muted', t('trip.empty')));
  return list;
}
