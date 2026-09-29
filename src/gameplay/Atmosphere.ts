// Mood of the shop. A "chaos" level spikes when experiments go wrong: lights
// stutter, the music turns tense, the cat hisses, the picture warms toward
// red. It decays back to cozy candlelight. Also runs ambience: day/night
// music, birdsong/crickets, dust motes in the window light, the shop cat.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { GameSystem } from '../core/Game';
import { Entity, type HoverInfo } from '../world/Entity';
import { catSheet } from '../rendering/three/sprites/CharacterPainter';
import { catEyes, catFur, type CatLook } from '../data/cat';
import { PixelSprite } from '../rendering/three/sprites/PixelSprite';
import { ambienceLoop } from '../audio/Sfx';
import { clamp, damp, smoothstep } from '../core/math';
import { rng } from '../core/Random';
import { t } from '../core/i18n';

export function catSheetFor(look: CatLook) {
  const fur = catFur(look.fur);
  const eyes = catEyes(look.eyes);
  return catSheet({ fur: fur.color, nose: fur.nose, eyeL: eyes.left, eyeR: eyes.right });
}

export class ShopCat extends Entity {
  readonly kind = 'cat';
  sprite: PixelSprite;
  private lookKey = '';
  private awakeUntil = 0;
  private hissUntil = 0;
  private pets = 0;

  constructor(pos: THREE.Vector3, look: CatLook) {
    super();
    this.object.position.copy(pos);
    this.sprite = this.makeSprite(look);
  }

  private makeSprite(look: CatLook): PixelSprite {
    this.lookKey = `${look.fur}:${look.eyes}`;
    const sprite = new PixelSprite(catSheetFor(look), 0.95);
    sprite.play('sleep');
    sprite.facing = -1;
    sprite.shadow.visible = false;
    this.object.add(sprite.root);
    return sprite;
  }

  override hover(ctx: GameContext): HoverInfo {
    const touch = ctx.input.pointer.type !== 'mouse';
    return { title: ctx.state.cat.name || t('obj.cat'), hint: t(touch ? 'hint.catTouch' : 'hint.cat') };
  }

  override cursor() {
    return 'point' as const;
  }

  /** Left click: pet the cat. */
  override press(ctx: GameContext) {
    this.pet(ctx);
    return null;
  }

  /** Right click (long press on touch): dress it up. */
  override altPress(ctx: GameContext): boolean {
    ctx.audio.play('meow', { x: this.object.position.x, pitch: 1.2 });
    this.awakeUntil = ctx.time + 4;
    ctx.ui.openPanel('cat');
    return true;
  }

  pet(ctx: GameContext): void {
    this.pets++;
    ctx.bus.emit('cat:petted', { count: this.pets });
    this.awakeUntil = ctx.time + 4;
    ctx.audio.play('meow', { x: this.object.position.x });
    ctx.vfx.heartBurst(this.object.position.clone().add(new THREE.Vector3(0, 0.3, 0)), '#f6757a');
  }

  startle(ctx: GameContext): void {
    this.hissUntil = ctx.time + 2.2;
    ctx.audio.play('hissCat', { x: this.object.position.x, delay: 0.2 });
  }

  /** Rebuild the sprite when the look changed (customization panel, load). */
  syncLook(ctx: GameContext): void {
    const look = ctx.state.cat;
    if (`${look.fur}:${look.eyes}` === this.lookKey) return;
    this.sprite.dispose();
    this.sprite = this.makeSprite(look);
  }

  override update(ctx: GameContext, dt: number): void {
    this.syncLook(ctx);
    // Stays awake while its panel is open.
    if (ctx.ui.isPanelOpen('cat')) this.awakeUntil = Math.max(this.awakeUntil, ctx.time + 1);
    const want = ctx.time < this.hissUntil ? 'hiss' : ctx.time < this.awakeUntil ? 'awake' : 'sleep';
    if (this.sprite.current !== want) this.sprite.play(want);
    this.sprite.hop = want === 'hiss' ? Math.abs(Math.sin(ctx.time * 12)) * 0.03 : 0;
    this.sprite.update(dt, ctx.renderer.rig.camera);
  }
}

export class Atmosphere implements GameSystem {
  readonly always = true;
  chaos = 0;
  readonly cat: ShopCat;
  private musicMood: 'day' | 'night' | null = null;

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('chaos', ({ amount }) => {
      this.chaos = clamp(this.chaos + amount, 0, 1.5);
      if (amount >= 0.5) this.cat.startle(ctx);
    });
    ctx.bus.on('cauldron:exploded', () => this.cat.startle(ctx));
    this.cat = ctx.world.add(new ShopCat(new THREE.Vector3(-1.05, 1.39, -3.62), ctx.state.cat), ctx);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    // The world is paused behind panels; keep the cat alive (and restyled
    // live) while its own panel is open.
    if (ctx.paused && ctx.ui.isPanelOpen('cat')) this.cat.update(ctx, dt);
    const lighting = ctx.renderer.lighting;
    const cauldron = ctx.shop.cauldron;
    // Sustained danger from the cauldron keeps the tension up.
    const danger = Math.max(
      smoothstep(125, 145, cauldron.chem.temperature) * 0.6,
      cauldron.chem.volatility * 0.9,
      cauldron.chem.foam > 0.9 ? 0.4 : 0,
    );
    this.chaos = Math.max(danger, this.chaos - dt * 0.12);
    lighting.chaos = damp(lighting.chaos, this.chaos, 4, dt);
    const g = ctx.renderer.pipeline.grade;
    const warm = clamp(this.chaos, 0, 1);
    g.tint.setRGB(1 + warm * 0.12, 1 - warm * 0.06, 1 - warm * 0.1);
    g.saturation = 1.12 + warm * 0.15;
    g.vignette = 0.55 + warm * 0.35;
    if (this.chaos > 0.6 && rng.chance(dt * 2)) ctx.bus.emit('shake', { amount: 0.05 * this.chaos });

    // Music
    const music = ctx.audio.music;
    if (music) {
      const mood = lighting.nightness > 0.6 ? 'night' : 'day';
      if (mood !== this.musicMood) {
        this.musicMood = mood;
        music.start(mood);
      }
      music.setDanger(clamp(this.chaos, 0, 1));
    }
    ctx.audio.loop('ambience', ambienceLoop)?.set(1, lighting.nightness);

    // Faint magic glimmers drifting up all over the shop
    if (ctx.state && !ctx.paused)
      ctx.vfx.rate('glimmer', 1.4, dt, () =>
        ctx.vfx.mote({ x: rng.range(-4.6, 4.6), y: rng.range(0.2, 2.2), z: rng.range(-3.5, 2.2) }, rng.chance(0.55) ? '#9fe8ff' : '#fee761', 0.05),
      );

    // Dust motes floating in the window light during the day
    const day = 1 - lighting.nightness;
    if (day > 0.2) {
      ctx.vfx.rate('dust', 6 * day, dt, () => {
        const p = new THREE.Vector3(rng.range(-2.2, -0.4), rng.range(0.3, 2.4), rng.range(-3.4, -1.6));
        ctx.vfx.particles.spawn({
          x: p.x,
          y: p.y,
          z: p.z,
          vx: rng.range(-0.02, 0.02),
          vy: rng.range(-0.01, 0.02),
          vz: rng.range(-0.02, 0.02),
          life: rng.range(3, 6),
          size0: 0.018,
          color0: lighting.sun.color,
          alpha0: 0.7 * day,
          alpha1: 0,
          wobble: 0.004,
          additive: true,
        });
      });
    }
    // Fireflies outside at night drift past the window
    if (lighting.nightness > 0.6) {
      ctx.vfx.rate('fireflies', 1.2, dt, () => ctx.vfx.mote(new THREE.Vector3(rng.range(-1.9, -0.7), rng.range(1.4, 2.4), -4.05), '#b6e39a', 0.05));
    }
  }
}
