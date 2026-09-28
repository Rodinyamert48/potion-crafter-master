// Mood of the shop. A "chaos" level spikes when experiments go wrong: lights
// stutter, the music turns tense, the cat hisses, the picture warms toward
// red. It decays back to cozy candlelight. Also runs ambience: day/night
// music, birdsong/crickets, dust motes in the window light, the shop cat.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { GameSystem } from '../core/Game';
import { Entity, type HoverInfo } from '../world/Entity';
import { catSheet } from '../rendering/three/sprites/CharacterPainter';
import { PixelSprite } from '../rendering/three/sprites/PixelSprite';
import { ambienceLoop } from '../audio/Sfx';
import { clamp, damp, smoothstep } from '../core/math';
import { rng } from '../core/Random';
import { t } from '../core/i18n';

class ShopCat extends Entity {
  readonly kind = 'cat';
  readonly sprite = new PixelSprite(catSheet(), 1.2);
  private awakeUntil = 0;
  private hissUntil = 0;

  constructor(pos: THREE.Vector3) {
    super();
    this.object.add(this.sprite.root);
    this.object.position.copy(pos);
    this.sprite.play('sleep');
    this.sprite.facing = -1;
    this.sprite.shadow.visible = false;
  }

  override hover(): HoverInfo {
    return { title: t('obj.cat'), hint: t('hint.cat') };
  }

  override cursor() {
    return 'point' as const;
  }

  override press(ctx: GameContext) {
    this.awakeUntil = ctx.time + 3;
    ctx.audio.play('meow', { x: this.object.position.x });
    ctx.vfx.heartBurst(this.object.position.clone().add(new THREE.Vector3(0, 0.3, 0)), '#f6757a');
    return null;
  }

  startle(ctx: GameContext): void {
    this.hissUntil = ctx.time + 2.2;
    ctx.audio.play('hissCat', { x: this.object.position.x, delay: 0.2 });
  }

  override update(ctx: GameContext, dt: number): void {
    const want = ctx.time < this.hissUntil ? 'hiss' : ctx.time < this.awakeUntil ? 'awake' : 'sleep';
    if (this.sprite.current !== want) this.sprite.play(want);
    this.sprite.hop = want === 'hiss' ? Math.abs(Math.sin(ctx.time * 12)) * 0.03 : 0;
    this.sprite.update(dt, ctx.renderer.rig.camera);
  }
}

export class Atmosphere implements GameSystem {
  readonly always = true;
  chaos = 0;
  private readonly cat: ShopCat;
  private musicMood: 'day' | 'night' | null = null;

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('chaos', ({ amount }) => {
      this.chaos = clamp(this.chaos + amount, 0, 1.5);
      if (amount >= 0.5) this.cat.startle(ctx);
    });
    ctx.bus.on('cauldron:exploded', () => this.cat.startle(ctx));
    this.cat = ctx.world.add(new ShopCat(new THREE.Vector3(-1.05, 1.39, -3.62)), ctx);
  }

  update(dt: number): void {
    const ctx = this.ctx;
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
