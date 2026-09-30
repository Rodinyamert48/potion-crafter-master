// The shop door: step outside (the open world on PC, the region list on
// phones and tablets) or out into the garden behind the shop. Going
// outside, the apprentice may take the pets along.

import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { t } from '../core/i18n';
import type { SpriteSheet } from '../rendering/three/sprites/CharacterPainter';
import { catSheetFor } from '../gameplay/Atmosphere';
import { dogSheetFor, slimeSheetFor } from '../gameplay/Pets';
import type { PetId } from './minigames';
import { isWolfDay } from '../gameplay/WorldEvents';

export interface DoorActions {
  /** Why the apprentice cannot leave right now (null: free to go). */
  leaveBlocker(): string | null;
  /** Why the garden cannot be visited right now. */
  gardenBlocker(): string | null;
  /** True when "outside" means the open world (PC). */
  openWorld(): boolean;
  goOutside(pets: PetId[]): void;
  goGarden(): void;
}

type View = 'menu' | 'askPets' | 'pickPets';

/** First frame of a sprite sheet as an image URL (portraits in menus). */
export function sheetPortrait(sheet: SpriteSheet, frame = 0): string {
  const c = document.createElement('canvas');
  c.width = sheet.frameW;
  c.height = sheet.frameH;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const col = frame % sheet.cols;
  const row = Math.floor(frame / sheet.cols);
  g.drawImage(sheet.canvas, col * sheet.frameW, row * sheet.frameH, sheet.frameW, sheet.frameH, 0, 0, sheet.frameW, sheet.frameH);
  return c.toDataURL();
}

export class DoorPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;
  private view: View = 'menu';
  private readonly chosen = new Set<PetId>(['cat', 'dog', 'slime']);

  constructor(
    private readonly ctx: GameContext,
    private readonly actions: DoorActions,
  ) {
    this.el = h('div', 'wb-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-door wb-panel wb-frame-parchment');
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
    this.view = 'menu';
    this.ctx.audio.play('doorCreak', { volume: 0.45, pitch: 1.2 });
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  private render(): void {
    const el = this.inner;
    el.innerHTML = '';
    const close = h('button', 'wb-btn wb-close', '✕');
    close.addEventListener('click', () => this.ctx.ui.openPanel(null));
    el.appendChild(close);
    if (this.view === 'menu') this.renderMenu();
    else if (this.view === 'askPets') this.renderAsk();
    else this.renderPick();
  }

  private choice(icon: string, title: string, sub: string, blocked: string | null, onClick: () => void): HTMLElement {
    const b = h('button', 'wb-door-choice') as HTMLButtonElement;
    b.appendChild(h('span', 'icon', icon));
    const col = h('span', 'text');
    col.appendChild(h('strong', undefined, title));
    col.appendChild(h('small', undefined, blocked ?? sub));
    b.appendChild(col);
    if (blocked) {
      b.classList.add('blocked');
      b.addEventListener('click', () => this.ctx.audio.play('denied', { volume: 0.5 }));
    } else {
      b.addEventListener('click', () => {
        this.ctx.audio.play('uiClick', {});
        onClick();
      });
    }
    b.addEventListener('mouseenter', () => this.ctx.audio.play('uiHover', {}));
    return b;
  }

  private renderMenu(): void {
    const el = this.inner;
    el.appendChild(h('h2', undefined, t('door.title')));
    el.appendChild(h('p', 'wb-door-lead', t('door.lead')));
    if (isWolfDay(this.ctx.state.day)) el.appendChild(h('p', 'wb-door-warn', `🐺 ${t('door.wolfDay')}`));
    const open = this.actions.openWorld();
    el.appendChild(
      this.choice('🌲', t('door.outside'), t(open ? 'door.outsideSubPc' : 'door.outsideSubTouch'), this.actions.leaveBlocker(), () => {
        this.view = 'askPets';
        this.render();
      }),
    );
    el.appendChild(this.choice('🌱', t('door.garden'), t('door.gardenSub'), this.actions.gardenBlocker(), () => this.actions.goGarden()));
    const cancel = h('button', 'wb-btn', t('door.stay'));
    cancel.addEventListener('click', () => this.ctx.ui.openPanel(null));
    el.appendChild(cancel);
  }

  private renderAsk(): void {
    const el = this.inner;
    el.appendChild(h('h2', undefined, t('door.petsTitle')));
    el.appendChild(h('p', 'wb-door-lead', t('door.petsAsk')));
    const row = h('div', 'wb-door-row');
    const yes = h('button', 'wb-btn wb-btn-go', t('misc.yes'));
    yes.addEventListener('click', () => {
      this.ctx.audio.play('uiClick', {});
      this.view = 'pickPets';
      this.render();
    });
    const no = h('button', 'wb-btn', t('door.alone'));
    no.addEventListener('click', () => {
      this.ctx.audio.play('uiClick', {});
      this.actions.goOutside([]);
    });
    row.append(yes, no);
    el.appendChild(row);
  }

  private renderPick(): void {
    const el = this.inner;
    const pets = this.ctx.state.pets;
    el.appendChild(h('h2', undefined, t('door.petsPick')));
    const list = h('div', 'wb-door-pets');
    const entries: Array<[PetId, string, SpriteSheet, number]> = [
      ['cat', this.ctx.state.cat.name || t('obj.cat'), catSheetFor(this.ctx.state.cat), 3],
      ['dog', pets.dog.name, dogSheetFor(pets.dog), 7],
      ['slime', pets.slime.name, slimeSheetFor(pets.slime), 0],
    ];
    for (const [id, name, sheet, frame] of entries) {
      const card = h('button', `wb-door-pet${this.chosen.has(id) ? ' on' : ''}`);
      const img = h('img') as HTMLImageElement;
      img.src = sheetPortrait(sheet, frame);
      const text = h('span', 'text');
      text.appendChild(h('strong', undefined, name));
      text.appendChild(h('small', undefined, t(`door.perk.${id}`)));
      const tick = h('span', 'tick', this.chosen.has(id) ? '✔' : '');
      card.append(img, text, tick);
      card.addEventListener('click', () => {
        if (this.chosen.has(id)) this.chosen.delete(id);
        else this.chosen.add(id);
        this.ctx.audio.play(id === 'dog' ? 'bark' : id === 'cat' ? 'meow' : 'squish', { volume: 0.35, pitch: id === 'dog' ? 1.4 : 1.2 });
        this.render();
      });
      list.appendChild(card);
    }
    el.appendChild(list);
    const go = h('button', 'wb-btn wb-btn-go', t('door.setOff'));
    go.addEventListener('click', () => {
      this.ctx.audio.play('uiClick', {});
      this.actions.goOutside([...this.chosen]);
    });
    el.appendChild(go);
  }
}
