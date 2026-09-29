// What happens when a customer drinks a potion. Visuals depend on the
// potion (its drink effect); the dialogue depends on how well it matched the
// order. Effects are timed controllers updated by the customer.

import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import type { DrinkEffectId } from '../../data/types';
import type { Customer } from './Customer';
import type { Judgement } from './Economy';
import { rng } from '../../core/Random';
import { cameraPunch, fishJump, goldRain, siuuuJump, sprinkleSalt } from './Celebrity';
import { hairTuft } from '../../rendering/three/models/hairTuft';

export interface DrinkEffect {
  update(ctx: GameContext, c: Customer, dt: number): void;
  readonly done: boolean;
  /** Set when the effect turned the customer into a frog. */
  readonly transformed: boolean;
}

class TimedEffect implements DrinkEffect {
  t = 0;
  done = false;
  transformed = false;
  private spoke = false;
  constructor(
    private readonly duration: number,
    private readonly step: (ctx: GameContext, c: Customer, t: number, dt: number, fx: TimedEffect) => void,
    private readonly speak: ((ctx: GameContext, c: Customer) => void) | null,
    private readonly finish: ((ctx: GameContext, c: Customer) => void) | null = null,
  ) {}
  update(ctx: GameContext, c: Customer, dt: number): void {
    // Small sub-steps so the short timing windows of the effects (t < 0.05,
    // 0.8 < t < 0.85…) are never skipped on a slow frame.
    let left = dt;
    while (left > 1e-6 && !this.done) {
      const d = Math.min(0.03, left);
      left -= d;
      this.t += d;
      this.step(ctx, c, this.t, d, this);
      if (!this.spoke && this.t > 0.6 && this.speak) {
        this.spoke = true;
        this.speak(ctx, c);
      }
      if (this.t >= this.duration) {
        this.done = true;
        this.finish?.(ctx, c);
      }
    }
  }
}

function speakFor(j: Judgement): (ctx: GameContext, c: Customer) => void {
  return (ctx, c) => {
    switch (j.outcome) {
      case 'delighted':
        c.line(ctx, 'delighted', 'happy');
        c.sprite.play('happy');
        ctx.audio.play('happy', { x: c.object.position.x });
        break;
      case 'happy':
        c.line(ctx, 'happy', 'happy');
        c.sprite.play('happy');
        ctx.audio.play('happy', { x: c.object.position.x, volume: 0.7 });
        break;
      case 'weak':
        c.line(ctx, 'weak');
        break;
      case 'wrong':
        c.line(ctx, 'wrong', 'angry');
        c.sprite.play('angry');
        ctx.audio.play('sad', { x: c.object.position.x });
        break;
      case 'harmful':
        c.line(ctx, 'angry', 'angry');
        c.sprite.play('angry');
        ctx.audio.play('angry', { x: c.object.position.x });
        break;
      case 'frog':
        break;
    }
  };
}

export function createDrinkEffect(ctx: GameContext, c: Customer, drink: DrinkEffectId, j: Judgement): DrinkEffect {
  const speak = speakFor(j);
  const head = () => c.headPos;
  const mat = c.sprite.material;
  const baseEmissive = mat.emissive.clone();
  const restore = () => {
    mat.emissive.copy(baseEmissive);
    mat.emissiveIntensity = 0.12;
    c.sprite.opacity = 1;
    c.scaleMul = 1;
  };
  switch (drink) {
    case 'heal':
    case 'regen':
    case 'fireheal':
      return new TimedEffect(
        3,
        (cx, cu, t, dt) => {
          const col = drink === 'fireheal' ? (rng.chance(0.5) ? '#f77622' : '#63c74d') : '#63c74d';
          if (t < 1.8) cx.vfx.rate(`heal${cu.uid}`, 18, dt, () => cx.vfx.magic(cu.object.position.clone().add(new THREE.Vector3(0, rng.range(0.2, cu.def.height), 0)), col, 1, 0.3, 0.3));
          if (t < 0.05) cx.vfx.heartBurst(head(), drink === 'fireheal' ? '#feae34' : '#63c74d');
        },
        speak,
      );
    case 'strength':
      return new TimedEffect(
        3,
        (cx, cu, t) => {
          cu.sprite.squash = t < 1.2 ? Math.sin(t * 18) * 0.4 : 0;
          if (t < 0.05) {
            cx.vfx.stars(head(), '#e43b44', 16);
            cx.audio.play('rumble', { x: cu.object.position.x, volume: 0.6 });
            cx.bus.emit('shake', { amount: 0.2 });
          }
          mat.emissive.set(t < 1.2 ? '#e43b44' : '#ffffff');
          mat.emissiveIntensity = t < 1.2 ? 0.35 : 0.12;
        },
        speak,
        restore,
      );
    case 'giant':
      return new TimedEffect(
        3.8,
        (cx, cu, t) => {
          const grow = t < 0.6 ? t / 0.6 : t < 2.4 ? 1 : Math.max(0, 1 - (t - 2.4) / 0.6);
          cu.scaleMul = 1 + grow * 0.75;
          if (t < 0.05) {
            cx.audio.play('magic', { x: cu.object.position.x, pitch: 0.5 });
            cx.bus.emit('shake', { amount: 0.35 });
          }
          if (t > 0.5 && t < 0.55) cx.vfx.stars(head(), '#fee761', 20);
        },
        speak,
        restore,
      );
    case 'nightvision':
      return new TimedEffect(
        3,
        (cx, cu, t, dt) => {
          mat.emissive.set('#2ce8f5');
          mat.emissiveIntensity = t < 2 ? 0.25 + 0.15 * Math.sin(t * 8) : 0.12;
          if (t < 2) cx.vfx.rate(`nv${cu.uid}`, 10, dt, () => cx.vfx.magic(head().add(new THREE.Vector3(0, -0.15, 0.1)), '#2ce8f5', 1, 0.12, 0.1));
        },
        speak,
        restore,
      );
    case 'speed': {
      const center = c.object.position.clone();
      return new TimedEffect(
        3.4,
        (cx, cu, t, dt) => {
          if (t < 2.2) {
            const a = t * 7;
            cu.object.position.set(center.x + Math.cos(a) * 0.9, 0, center.z - 0.9 + Math.sin(a) * 0.6);
            cu.sprite.play('walk');
            cu.sprite.facing = Math.sin(a) > 0 ? -1 : 1;
            cx.vfx.rate(`speed${cu.uid}`, 30, dt, () => cx.vfx.dust(cu.object.position, '#c0cbdc', 1));
            cx.vfx.rate(`speedS${cu.uid}`, 3, dt, () => cx.audio.play('whoosh', { x: cu.object.position.x, pitch: 1.8, volume: 0.5 }));
          } else if (t < 2.25) {
            cu.object.position.copy(center);
            cu.sprite.play('sick');
          }
        },
        speak,
      );
    }
    case 'shadow':
      return new TimedEffect(
        4,
        (cx, cu, t, dt) => {
          cu.sprite.opacity = t < 0.8 ? 1 - t : t < 3 ? 0.2 : Math.min(1, 0.2 + (t - 3));
          if (t < 1) cx.vfx.rate(`sh${cu.uid}`, 20, dt, () => cx.vfx.smoke(cu.object.position.clone().add(new THREE.Vector3(0, 0.6, 0)), '#262b44', 1, 0.8));
        },
        speak,
        restore,
      );
    case 'poison':
      return new TimedEffect(
        3.4,
        (cx, cu, t, dt) => {
          if (t < 2.6) {
            cu.sprite.play('sick');
            cx.vfx.rate(`poi${cu.uid}`, 3, dt, () => cx.vfx.poisonCloud(head(), 0.4));
          }
        },
        speak,
      );
    case 'firebreath':
      return new TimedEffect(
        3.2,
        (cx, cu, t, dt) => {
          if (t < 0.1) {
            cu.sprite.play('surprised');
            cx.audio.play('flare', { x: cu.object.position.x });
          }
          if (t < 1.6)
            cx.vfx.rate(`fb${cu.uid}`, 16, dt, () => {
              const p = head().add(new THREE.Vector3(0, -0.2, 0.25));
              cx.vfx.sparks(p, 6, [cu.sprite.facing * 0.6, 0.3, 1.5], 0.4, '#f77622');
            });
        },
        speak,
      );
    case 'frog':
      return new TimedEffect(
        2.4,
        (cx, cu, t, _dt, fx) => {
          cu.sprite.play('surprised');
          cu.sprite.squash = Math.sin(t * 30) * 0.3 * Math.min(1, t);
          if (t >= 2.2 && !fx.transformed) {
            fx.transformed = true;
            const p = cu.object.position.clone().add(new THREE.Vector3(0, 0.6, 0));
            cx.vfx.puff(p, '#b6e39a', 36, 1.4);
            cx.vfx.stars(p, '#63c74d', 16);
            cx.audio.play('poof', { x: p.x });
            cx.audio.play('frogCroak', { x: p.x, delay: 0.3 });
            cx.bus.emit('shake', { amount: 0.25 });
          }
        },
        null,
      );
    case 'explode':
      return new TimedEffect(
        3,
        (cx, cu, t) => {
          if (t < 0.05) {
            const p = cu.object.position.clone().add(new THREE.Vector3(0.2, cu.def.height * 0.6, 0.1));
            cx.vfx.explosion(p, 0.45, '#ff0044');
            cx.physics.explode(p, 1.8, 0.5);
            cx.audio.play('explosion', { x: p.x, volume: 0.6 });
            cx.bus.emit('shake', { amount: 0.4 });
            cx.bus.emit('chaos', { amount: 0.5 });
            cu.sprite.play('surprised');
          }
          mat.color.set(t < 3 ? '#6a6060' : '#ffffff');
        },
        speak,
        (cx, cu) => {
          restore();
          void cx;
          void cu;
        },
      );
    case 'glow':
      return new TimedEffect(
        3,
        (cx, cu, t, dt) => {
          mat.emissive.set('#fee761');
          mat.emissiveIntensity = t < 2.2 ? 0.6 : 0.12;
          if (t < 2) cx.vfx.rate(`gl${cu.uid}`, 12, dt, () => cx.vfx.magic(cu.object.position.clone().add(new THREE.Vector3(0, rng.range(0.2, cu.def.height), 0)), '#fee761', 1, 0.25, 0.2));
        },
        speak,
        restore,
      );
    case 'blood':
      return new TimedEffect(
        3,
        (cx, cu, t, dt) => {
          if (cu.def.archetype === 'vampire') {
            if (t < 1.5) cx.vfx.rate(`bl${cu.uid}`, 10, dt, () => cx.vfx.magic(head(), '#a22633', 1, 0.2, 0.2));
          } else if (t < 2) cu.sprite.play('sick');
        },
        speak,
      );
    case 'peace':
      // Everything goes quiet and lavender… (a streamer only lasts so long).
      return new TimedEffect(
        4.2,
        (cx, cu, t, dt) => {
          mat.emissive.set('#e8e0ff');
          mat.emissiveIntensity = t < 3 ? 0.35 : 0.12;
          if (t < 0.05) {
            cx.vfx.runes(cu.object.position.clone().setY(0.05), '#b8a0ff', 5, 0.6);
            cx.audio.play('chime', { x: cu.object.position.x, pitch: 0.8, volume: 0.6 });
          }
          if (t > 0.3 && t < 0.35) cu.say(cx, '✌️ …', 'happy', 2.2);
          if (t < 3) cx.vfx.rate(`peace${cu.uid}`, 6, dt, () => cx.vfx.mote(cu.object.position.clone().add(new THREE.Vector3(0, 0.2, 0)), '#e8e0ff', 0.5));
          if (cu.def.celebrity === 'speed' && t > 3 && t < 3.05) {
            cu.sprite.play('happy');
            cx.audio.play('bark', { x: cu.object.position.x });
            cx.vfx.stars(head(), '#c42430', 20);
            cx.bus.emit('shake', { amount: 0.15 });
          }
        },
        speak,
        restore,
      );
    case 'salt':
      return new TimedEffect(
        3.2,
        (cx, cu, t) => {
          if (t < 0.05) {
            cu.sprite.play('happy');
            sprinkleSalt(cx, cu, 1.8);
            cx.audio.play('sprinkle', { x: cu.object.position.x });
            cx.audio.play('sizzle', { x: cu.object.position.x, delay: 0.3, volume: 0.4 });
          }
        },
        speak,
      );
    case 'goldrain':
      return new TimedEffect(
        3.6,
        (cx, cu, t) => {
          if (t < 0.05) {
            goldRain(cx, cu.object.position.clone(), 2.4);
            cx.audio.play('chime', { x: cu.object.position.x });
            mat.emissive.set('#fee761');
          }
          mat.emissiveIntensity = t < 2.6 ? 0.45 : 0.12;
        },
        speak,
        restore,
      );
    case 'eyebrow':
      return new TimedEffect(
        3,
        (cx, cu, t) => {
          if (t < 0.05) {
            cx.audio.play('boom', { x: cu.object.position.x });
            cameraPunch(cx, head().add(new THREE.Vector3(0, -0.2, 0)), 1.3);
            cu.sprite.play('surprised');
            cx.bus.emit('shake', { amount: 0.12 });
          }
          if (t > 0.2 && t < 0.25) cu.say(cx, '🤨', 'neutral', 1.6);
          cu.sprite.squash = t < 0.4 ? -0.3 * Math.sin((t / 0.4) * Math.PI) : 0;
        },
        speak,
      );
    case 'breathtaking':
      return new TimedEffect(
        3.4,
        (cx, cu, t, dt) => {
          if (t < 0.05) cx.audio.play('magic', { x: cu.object.position.x, pitch: 1.2 });
          // Frosty breath and floating hearts
          if (t < 2.2)
            cx.vfx.rate(`breath${cu.uid}`, 10, dt, () =>
              cx.vfx.puff(head().add(new THREE.Vector3(cu.sprite.facing * 0.15, -0.15, 0.1)), '#d8f0ff', 2, 0.35),
            );
          if (t > 1.2 && t < 1.25) cx.vfx.heartBurst(head(), '#9fe8ff');
        },
        speak,
      );
    case 'siuuu':
      return new TimedEffect(
        3.2,
        (cx, cu, t) => {
          if (t < 0.05) {
            mat.emissive.set('#e43b44');
            siuuuJump(cx, cu);
            cx.vfx.stars(head(), '#fee761', 24);
          }
          mat.emissiveIntensity = t < 1.6 ? 0.35 : 0.12;
        },
        speak,
        restore,
      );
    case 'chefkiss':
      return new TimedEffect(
        3,
        (cx, cu, t) => {
          if (t < 0.05) cu.sprite.play('surprised');
          if (t > 0.8 && t < 0.85) {
            cu.sprite.play('happy');
            cx.vfx.stars(head(), '#fee761', 18);
            cx.audio.play('sparkle', { x: cu.object.position.x });
            cu.say(cx, '👨‍🍳💋', 'happy', 1.5);
          }
        },
        speak,
      );
    case 'ayran':
      return new TimedEffect(
        3,
        (cx, cu, t) => {
          // A white foam moustache…
          if (t < 0.05) cx.vfx.puff(head().add(new THREE.Vector3(cu.sprite.facing * 0.1, -0.12, 0.1)), '#ffffff', 10, 0.4);
          // …and a mighty burp.
          if (t > 1.1 && t < 1.15) {
            cx.audio.play('frogCroak', { x: cu.object.position.x, pitch: 0.45, volume: 0.7 });
            cu.say(cx, 'OHH BE!', 'happy', 1.6);
            cx.bus.emit('shake', { amount: 0.06 });
          }
        },
        speak,
      );
    case 'bigsmile':
      return new TimedEffect(
        3.2,
        (cx, cu, t, dt) => {
          if (t < 0.05) {
            cu.sprite.play('happy');
            cx.audio.play('cheer', { x: cu.object.position.x, volume: 0.6 });
          }
          if (t < 2.4) cx.vfx.rate(`smile${cu.uid}`, 3, dt, () => cx.vfx.heartBurst(head(), '#feae34'));
        },
        speak,
      );
    case 'yatutarsa':
      return new TimedEffect(
        3.4,
        (cx, cu, t) => {
          if (t < 0.05) {
            cx.vfx.runes(cu.object.position.clone().setY(0.05), '#8fb8de', 6, 0.9);
            cx.audio.play('splash', { x: cu.object.position.x, amount: 0.5 });
          }
          // He turns around… and around again. Did it work?
          if ((t > 0.9 && t < 0.95) || (t > 1.8 && t < 1.85)) cu.sprite.facing = -cu.sprite.facing;
          if (t > 1.2 && t < 1.25) cu.say(cx, '…?', 'neutral', 1.2);
        },
        speak,
      );
    case 'hamsi':
      return new TimedEffect(
        3,
        (cx, cu, t) => {
          if (t < 0.05) {
            fishJump(cx, head().add(new THREE.Vector3(0, -0.2, 0.15)), 12);
            cx.audio.play('splash', { x: cu.object.position.x, amount: 0.6 });
          }
          if (t > 0.9 && t < 0.95) cu.say(cx, 'HAMSİİİ! 🐟', 'happy', 1.6);
        },
        speak,
      );
    case 'hair': {
      let tuft: THREE.Object3D | null = null;
      return new TimedEffect(
        3.2,
        (cx, cu, t) => {
          if (!tuft) {
            // Top of the head: the sprite frames leave ~20% headroom above it.
            tuft = hairTuft('#3e2731', cu.sprite.heightM * 0.8);
            tuft.scale.setScalar(0.01);
            cu.object.add(tuft);
            cx.audio.play('magic', { x: cu.object.position.x, pitch: 1.3 });
            cx.vfx.magic(head(), '#c9d6ff', 12);
          }
          if (tuft) tuft.scale.setScalar(Math.max(0.01, Math.min(1, t / 1.2)) * (1 + 0.08 * Math.sin(t * 9)));
        },
        speak,
      );
    }
    case 'sludge':
    case 'scorched':
    case 'water':
    default:
      return new TimedEffect(
        2.8,
        (cx, cu, t) => {
          if (t > 0.3 && t < 0.35 && drink !== 'water') {
            const p = head().add(new THREE.Vector3(0, -0.2, 0.2));
            cx.vfx.splash(p, drink === 'scorched' ? '#7a6a3a' : '#5a6b3a', 14, 0.8);
            cx.audio.play('splash', { x: p.x, amount: 0.4 });
            cu.sprite.play('sick');
          }
        },
        speak,
      );
  }
}
