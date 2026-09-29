// The shop cat's corner: rename the cat and pick its coat and eye colour.
// Opens when the cat on the window sill is clicked; changes show up on the
// sill right away and are saved with the game.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { Panel } from './UIRoot';
import { h } from './UIRoot';
import { t } from '../core/i18n';
import { CAT_EYES, CAT_FURS, CAT_NAME_MAX, defaultCat } from '../data/cat';
import { catSheetFor, type ShopCat } from '../gameplay/Atmosphere';

const PREVIEW_SCALE = 6;
const PREVIEW_FRAMES = [3, 7, 3, 3, 4];

export class CatPanel implements Panel {
  readonly el: HTMLElement;
  readonly modal = true;
  private readonly inner: HTMLElement;
  private preview: HTMLCanvasElement | null = null;
  private heading: HTMLElement | null = null;
  private raf = 0;
  private hop = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly cat: ShopCat,
  ) {
    this.el = h('div', 'wb-overlay wb-cat-overlay wb-interactive');
    this.el.hidden = true;
    this.inner = h('div', 'wb-cat wb-panel wb-frame-wood');
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
    // Keep the cat on the sill in view: the panel goes to the other side.
    const cam = this.ctx.renderer.rig.camera;
    const sx = this.cat.object.getWorldPosition(new THREE.Vector3()).project(cam).x;
    this.el.classList.toggle('left', sx > 0);
    this.render();
    let last = performance.now();
    let time = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      time += dt;
      this.hop = Math.max(0, this.hop - dt);
      this.drawPreview(time);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    const look = this.ctx.state.cat;
    if (!look.name.trim()) look.name = defaultCat().name;
    this.el.hidden = true;
  }

  private render(): void {
    const ctx = this.ctx;
    const look = ctx.state.cat;
    const el = this.inner;
    el.innerHTML = '';
    const close = h('button', 'wb-btn wb-close', '✕');
    close.addEventListener('click', () => ctx.ui.openPanel(null));
    el.appendChild(close);
    this.heading = h('h2', undefined, look.name);
    el.appendChild(this.heading);
    el.appendChild(h('p', 'wb-cat-sub', t('cat.breed')));

    const body = h('div', 'wb-cat-body');
    el.appendChild(body);
    const stage = h('div', 'wb-cat-stage');
    this.preview = h('canvas', 'wb-cat-preview');
    stage.appendChild(this.preview);
    const pet = h('button', 'wb-btn', t('cat.pet'));
    pet.addEventListener('click', () => {
      this.cat.pet(ctx);
      this.hop = 0.35;
    });
    stage.appendChild(pet);
    body.appendChild(stage);

    const form = h('div', 'wb-cat-form');
    body.appendChild(form);
    form.appendChild(h('label', 'wb-cat-label', t('cat.name')));
    const input = h('input', 'wb-cat-name');
    input.type = 'text';
    input.maxLength = CAT_NAME_MAX;
    input.value = look.name;
    input.spellcheck = false;
    input.addEventListener('input', () => {
      look.name = input.value.slice(0, CAT_NAME_MAX);
      if (this.heading) this.heading.textContent = look.name.trim() || defaultCat().name;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') ctx.ui.openPanel(null);
    });
    input.addEventListener('blur', () => {
      look.name = look.name.trim() || defaultCat().name;
      input.value = look.name;
    });
    form.appendChild(input);

    form.appendChild(h('label', 'wb-cat-label', t('cat.fur')));
    const furs = h('div', 'wb-swatches');
    for (const f of CAT_FURS) {
      const b = h('button', 'wb-swatch' + (look.fur === f.id ? ' on' : ''));
      b.style.setProperty('--sw', f.color);
      b.title = t(`cat.fur.${f.id}`);
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', () => {
        look.fur = f.id;
        ctx.audio.play('uiClick', {});
        this.render();
      });
      furs.appendChild(b);
    }
    form.appendChild(furs);
    form.appendChild(h('div', 'wb-cat-choice', t(`cat.fur.${look.fur}`)));

    form.appendChild(h('label', 'wb-cat-label', t('cat.eyes')));
    const eyes = h('div', 'wb-swatches');
    for (const e of CAT_EYES) {
      const b = h('button', 'wb-swatch wb-swatch-eye' + (look.eyes === e.id ? ' on' : ''));
      b.style.setProperty('--sw', e.left);
      b.style.setProperty('--sw2', e.right);
      b.title = t(`cat.eyes.${e.id}`);
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', () => {
        look.eyes = e.id;
        ctx.audio.play('uiClick', {});
        this.render();
      });
      eyes.appendChild(b);
    }
    form.appendChild(eyes);
    form.appendChild(h('div', 'wb-cat-choice', t(`cat.eyes.${look.eyes}`)));
    this.drawPreview(0);
  }

  private drawPreview(time: number): void {
    const cv = this.preview;
    if (!cv) return;
    const sheet = catSheetFor(this.ctx.state.cat);
    const w = sheet.frameW * PREVIEW_SCALE;
    const hgt = (sheet.frameH + 3) * PREVIEW_SCALE;
    if (cv.width !== w || cv.height !== hgt) {
      cv.width = w;
      cv.height = hgt;
    }
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, hgt);
    const frame = PREVIEW_FRAMES[Math.floor(time * 2.5) % PREVIEW_FRAMES.length];
    const lift = Math.round(Math.sin(Math.min(1, this.hop / 0.35) * Math.PI) * 2) * PREVIEW_SCALE;
    // Soft shadow to sit on
    g.fillStyle = '#18142566';
    g.beginPath();
    g.ellipse(w / 2 + PREVIEW_SCALE * 2, sheet.frameH * PREVIEW_SCALE, w * 0.42, PREVIEW_SCALE * 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(sheet.canvas, frame * sheet.frameW, 0, sheet.frameW, sheet.frameH, 0, PREVIEW_SCALE - lift, w, sheet.frameH * PREVIEW_SCALE);
  }
}
