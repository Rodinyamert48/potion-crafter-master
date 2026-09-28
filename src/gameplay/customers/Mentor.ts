// Master Mortimer, the old wizard who owns the shop. He sits in his armchair,
// comments on your experiments (priority-throttled), dozes off at night,
// reacts to explosions and reverses frog transformations.

import * as THREE from 'three';
import { Entity, type HoverInfo } from '../../world/Entity';
import type { GameContext } from '../../core/GameContext';
import { characterSheet } from '../../rendering/three/sprites/CharacterPainter';
import { PixelSprite } from '../../rendering/three/sprites/PixelSprite';
import { t } from '../../core/i18n';
import { rng } from '../../core/Random';

const MENTOR_LOOK = { skin: '#e8b796', hair: '#f4f4f4', main: '#3a4466', second: '#124e89', accent: '#fee761', eyes: '#124e89' };

export class Mentor extends Entity {
  readonly kind = 'mentor';
  readonly sprite: PixelSprite;
  private bubble = -1;
  private busyUntil = 0;
  private lastPriority = 0;
  private idleTimer = 40;
  private surprisedUntil = 0;
  private castUntil = 0;
  private zzz = 0;
  private readonly voice = { pitch: 0.95, speed: 0.85, wave: 'triangle' as OscillatorType };

  constructor(ctx: GameContext, seat: THREE.Vector3) {
    super();
    this.sprite = new PixelSprite(characterSheet('mentor', 'wizard', MENTOR_LOOK), 1);
    this.object.add(this.sprite.root);
    this.object.position.copy(seat);
    this.sprite.play('sit');
    this.sprite.facing = -1;
    ctx.bus.on('mentor:say', ({ text, priority, mood, card }) => this.say(ctx, text, priority ?? 1, mood, false, !card));
    ctx.bus.on('cauldron:exploded', () => {
      this.surprisedUntil = ctx.time + 2.5;
      this.sprite.play('surprised');
    });
    ctx.bus.on('potion:discovered', () => this.say(ctx, t('mentor.discover'), 2, 'happy'));
  }

  override hover(): HoverInfo {
    return { title: t('mentor.name'), subtitle: 'Wizard, 312 years young' };
  }

  override cursor() {
    return 'point' as const;
  }

  override press(ctx: GameContext) {
    const lines = ['mentor.idle1', 'mentor.idle2', 'mentor.idle3', 'mentor.idle4', 'mentor.idle5'];
    this.say(ctx, t(lines[rng.int(0, lines.length - 1)]), 1, 'neutral', true);
    return null;
  }

  /** Speak unless someone more important is talking. */
  say(ctx: GameContext, text: string, priority = 1, mood: string = 'mentor', force = false, bubble = true): boolean {
    if (!force && ctx.time < this.busyUntil && priority <= this.lastPriority) return false;
    if (this.bubble >= 0) ctx.ui.removeBubble(this.bubble);
    this.bubble = -1;
    const duration = Math.max(3.5, 1.5 + text.length * 0.06);
    if (bubble) this.bubble = ctx.ui.say(this.object, text, { name: t('mentor.name'), mood: mood === 'neutral' ? 'mentor' : mood, duration, offsetY: 1.95 });
    this.busyUntil = ctx.time + duration;
    this.lastPriority = priority;
    ctx.voice.babble(text, this.voice, this.object.position.x, 0.8);
    if (ctx.time > this.surprisedUntil && ctx.time > this.castUntil) this.sprite.play('sitTalk');
    this.idleTimer = rng.range(50, 90);
    return true;
  }

  get talking(): boolean {
    return this.bubble >= 0;
  }

  cast(ctx: GameContext, at: THREE.Vector3): void {
    this.castUntil = ctx.time + 1.8;
    this.sprite.play('cast');
    ctx.vfx.runes(at, '#b55088', 8, 0.4);
    ctx.vfx.stars(at, '#b55088', 24);
    ctx.audio.play('magic', { x: at.x, pitch: 1.2 });
    this.say(ctx, t('mentor.cure'), 4, 'happy', true);
  }

  override update(ctx: GameContext, dt: number): void {
    const night = ctx.renderer.lighting.nightness > 0.7 && !ctx.state.shopOpen;
    if (ctx.time < this.surprisedUntil) {
      if (this.sprite.current !== 'surprised') this.sprite.play('surprised');
    } else if (ctx.time < this.castUntil) {
      if (this.sprite.current !== 'cast') this.sprite.play('cast');
    } else if (ctx.time < this.busyUntil) {
      if (this.sprite.current !== 'sitTalk') this.sprite.play('sitTalk');
    } else {
      this.bubble = -1;
      const want = night ? 'sleep' : 'sit';
      if (this.sprite.current !== want) this.sprite.play(want);
      this.idleTimer -= dt;
      if (this.idleTimer <= 0 && !night) {
        const lines = ['mentor.idle1', 'mentor.idle2', 'mentor.idle3', 'mentor.idle4', 'mentor.idle5'];
        this.say(ctx, t(lines[rng.int(0, lines.length - 1)]), 0);
      }
    }
    if (night) {
      this.zzz -= dt;
      if (this.zzz <= 0) {
        this.zzz = 1.6;
        const p = this.object.position.clone().add(new THREE.Vector3(0.1, 1.6, 0));
        ctx.ui.floatText(p, 'z', '#c0cbdc');
      }
    }
    // Pipe smoke while sitting
    ctx.vfx.rate('mentorPipe', night ? 0 : 1.2, dt, () => ctx.vfx.smoke(this.object.position.clone().add(new THREE.Vector3(0.28, 1.38, 0.1)), '#8b9bb4', 1, 0.35));
    this.sprite.update(dt, ctx.renderer.rig.camera);
  }
}
