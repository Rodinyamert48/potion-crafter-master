// Customization for the shop's other pets: the jar slime (name, colour) and
// the master's Lagotto Romagnolo (name, coat, collar). Works like the cat's
// panel: a live preview, a name field and colour swatches.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { t } from '../core/i18n';
import { DOG_COATS, DOG_COLLARS, PET_NAME_MAX, SLIME_COLORS, defaultPets, type Swatch } from '../data/pets';
import { dogSheetFor, slimeSheetFor } from '../gameplay/Pets';
import type { SpriteSheet } from '../rendering/three/sprites/CharacterPainter';

type Kind = 'slime' | 'dog';

const SCALE: Record<Kind, number> = { slime: 8, dog: 6 };
const FRAMES: Record<Kind, number[]> = { slime: [0, 1, 0, 5, 2, 3, 2, 1], dog: [7, 8, 7, 8, 0, 4, 2, 3] };

export class PetPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  kind: Kind = 'dog';
  private readonly inner: HTMLElement;
  private preview: HTMLCanvasElement | null = null;
  private heading: HTMLElement | null = null;
  private raf = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly anchor: (kind: Kind) => THREE.Object3D | null,
  ) {
    this.el = h('div', 'wb-overlay wb-cat-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-cat wb-panel wb-frame-wood');
    this.el.appendChild(this.inner);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) ctx.ui.openPanel(null);
    });
    ctx.bus.on('pet:open', ({ kind }) => {
      this.kind = kind;
      ctx.ui.openPanel('pet');
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    const obj = this.anchor(this.kind);
    if (obj) {
      const sx = obj.getWorldPosition(new THREE.Vector3()).project(this.ctx.renderer.rig.camera).x;
      this.el.classList.toggle('left', sx > 0);
    }
    this.render();
    let time = 0;
    let last = performance.now();
    const tick = (now: number) => {
      time += Math.min(0.1, (now - last) / 1000);
      last = now;
      this.drawPreview(time);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    const look = this.look();
    if (!look.name.trim()) look.name = defaultPets()[this.kind].name;
    this.el.hidden = true;
  }

  private look() {
    return this.ctx.state.pets[this.kind];
  }

  private sheet(): SpriteSheet {
    const pets = this.ctx.state.pets;
    return this.kind === 'dog' ? dogSheetFor(pets.dog) : slimeSheetFor(pets.slime);
  }

  private changed(): void {
    this.ctx.bus.emit('pet:customized', { kind: this.kind });
    this.ctx.audio.play('uiClick', {});
    this.render();
  }

  private swatches(label: string, list: Swatch[], current: string, name: (id: string) => string, pick: (id: string) => void): HTMLElement {
    const box = h('div');
    box.appendChild(h('label', 'wb-cat-label', label));
    const row = h('div', 'wb-swatches');
    for (const s of list) {
      const b = h('button', 'wb-swatch' + (current === s.id ? ' on' : ''));
      b.style.setProperty('--sw', s.color);
      if (s.color2) b.style.background = `linear-gradient(135deg, ${s.color} 55%, ${s.color2} 55%)`;
      b.title = name(s.id);
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', () => pick(s.id));
      row.appendChild(b);
    }
    box.appendChild(row);
    box.appendChild(h('div', 'wb-cat-choice', name(current)));
    return box;
  }

  private render(): void {
    const ctx = this.ctx;
    const kind = this.kind;
    const look = this.look();
    const el = this.inner;
    el.innerHTML = '';
    const close = h('button', 'wb-btn wb-close', '✕');
    close.addEventListener('click', () => ctx.ui.openPanel(null));
    el.appendChild(close);
    this.heading = h('h2', undefined, look.name);
    el.appendChild(this.heading);
    el.appendChild(h('p', 'wb-cat-sub', t(kind === 'dog' ? 'dog.breed' : 'slime.sub')));
    const body = h('div', 'wb-cat-body');
    el.appendChild(body);
    const stage = h('div', 'wb-cat-stage');
    this.preview = h('canvas', 'wb-cat-preview');
    stage.appendChild(this.preview);
    const pet = h('button', 'wb-btn', t('cat.pet'));
    pet.addEventListener('click', () => {
      ctx.audio.play(kind === 'dog' ? 'bark' : 'squeak', { pitch: kind === 'dog' ? 1.4 : 1.3, volume: 0.5 });
      ctx.bus.emit('pet:petted', { kind, count: 1 });
    });
    stage.appendChild(pet);
    body.appendChild(stage);
    const form = h('div', 'wb-cat-form');
    body.appendChild(form);
    form.appendChild(h('label', 'wb-cat-label', t('cat.name')));
    const input = h('input', 'wb-cat-name');
    input.type = 'text';
    input.maxLength = PET_NAME_MAX;
    input.value = look.name;
    input.defaultValue = look.name;
    input.spellcheck = false;
    input.addEventListener('input', () => {
      look.name = input.value.slice(0, PET_NAME_MAX);
      if (this.heading) this.heading.textContent = look.name.trim() || defaultPets()[kind].name;
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') ctx.ui.openPanel(null);
    });
    input.addEventListener('blur', () => {
      const before = input.defaultValue;
      look.name = look.name.trim() || defaultPets()[kind].name;
      input.value = look.name;
      if (look.name !== before) ctx.bus.emit('pet:customized', { kind });
    });
    form.appendChild(input);
    const pets = ctx.state.pets;
    if (kind === 'slime') {
      form.appendChild(
        this.swatches(t('slime.color'), SLIME_COLORS, pets.slime.color, (id) => t(`slime.color.${id}`), (id) => {
          pets.slime.color = id;
          this.changed();
        }),
      );
    } else {
      form.appendChild(
        this.swatches(t('dog.coat'), DOG_COATS, pets.dog.coat, (id) => t(`dog.coat.${id}`), (id) => {
          pets.dog.coat = id;
          this.changed();
        }),
      );
      form.appendChild(
        this.swatches(t('dog.collar'), DOG_COLLARS, pets.dog.collar, (id) => t(`dog.collar.${id}`), (id) => {
          pets.dog.collar = id;
          this.changed();
        }),
      );
    }
    this.drawPreview(0);
  }

  private drawPreview(time: number): void {
    const cv = this.preview;
    if (!cv) return;
    const sheet = this.sheet();
    const sc = SCALE[this.kind];
    const w = sheet.frameW * sc;
    const hgt = (sheet.frameH + 3) * sc;
    if (cv.width !== w || cv.height !== hgt) {
      cv.width = w;
      cv.height = hgt;
    }
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, hgt);
    const frames = FRAMES[this.kind];
    const frame = frames[Math.floor(time * 3) % frames.length];
    g.fillStyle = '#18142566';
    g.beginPath();
    g.ellipse(w / 2, sheet.frameH * sc, w * 0.4, sc * 1.4, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(sheet.canvas, frame * sheet.frameW, 0, sheet.frameW, sheet.frameH, 0, sc, w, sheet.frameH * sc);
  }
}
