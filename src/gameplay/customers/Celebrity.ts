// Gags for the famous guests (see the celebrity customers in customers.ts):
// how they make an entrance, what they do while waiting and a dramatic
// camera punch-in used by the eyebrow raise.

import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import type { Customer } from './Customer';
import { rng } from '../../core/Random';
import { t } from '../../core/i18n';

/** Quickly zoom the camera onto a point and back (the "dramatic zoom"). */
export function cameraPunch(ctx: GameContext, target: THREE.Vector3, seconds = 1.1): void {
  const rig = ctx.renderer.rig;
  const focus = rig.targetFocus.clone();
  const distance = rig.targetDistance;
  rig.focusOn(target, Math.max(rig.minDistance, 3.2));
  ctx.later(seconds, () => {
    // Only go back if nobody moved the camera meanwhile.
    if (rig.targetFocus.distanceTo(target) < 0.01) {
      rig.targetFocus.copy(focus);
      rig.targetDistance = distance;
    }
  });
}

/** Called once the guest is through the door and has said hello. */
export function celebEntrance(ctx: GameContext, c: Customer): void {
  const p = c.object.position;
  const head = c.headPos;
  switch (c.def.celebrity) {
    case 'speed':
      c.sprite.play('happy');
      ctx.audio.play('bark', { x: p.x, delay: 0.5 });
      ctx.later(1.4, () => c.alive && c.say(ctx, 'SEWEEEY! 🐐', 'happy', 2));
      ctx.vfx.stars(head, '#c42430', 18);
      break;
    case 'saltbae':
      c.sprite.play('happy');
      ctx.audio.play('sprinkle', { x: p.x, delay: 0.3 });
      sprinkleSalt(ctx, c, 1.6);
      break;
    case 'beast':
      c.sprite.play('happy');
      ctx.audio.play('cheer', { x: p.x, delay: 0.2, volume: 0.7 });
      confetti(ctx, head);
      break;
    case 'rock':
      ctx.audio.play('boom', { x: p.x, delay: 0.25 });
      cameraPunch(ctx, head.clone().add(new THREE.Vector3(0, -0.2, 0)), 1.2);
      ctx.later(0.3, () => c.alive && c.say(ctx, '🤨', 'neutral', 2));
      break;
    case 'keanu':
      ctx.vfx.magic(head, '#9fe8ff', 8, 0.3, 0.2);
      break;
    case 'ronaldo':
      ctx.later(0.6, () => c.alive && siuuuJump(ctx, c));
      break;
    case 'gordon':
      ctx.audio.play('metalClang', { x: p.x, delay: 0.3, volume: 0.5 });
      ctx.later(1.2, () => c.alive && c.say(ctx, t('celeb.gordonLook'), 'angry', 2.4));
      break;
    case 'recep':
      c.sprite.play('angry');
      ctx.bus.emit('shake', { amount: 0.08 });
      ctx.audio.play('angry', { x: p.x, delay: 0.2 });
      break;
    case 'burak':
      c.sprite.play('happy');
      ctx.vfx.heartBurst(head, '#feae34');
      ctx.audio.play('happy', { x: p.x, pitch: 0.8 });
      break;
    case 'nasreddin':
      ctx.vfx.magic(head, '#f4f4f4', 6, 0.3, 0.3);
      break;
    case 'temel':
      ctx.vfx.splash(head.clone().add(new THREE.Vector3(0, -1.2, 0.2)), '#2ce8f5', 10, 0.6);
      ctx.audio.play('splash', { x: p.x, amount: 0.3 });
      break;
    case 'keloglan':
      // The sun glints off his head.
      ctx.vfx.stars(head.clone().add(new THREE.Vector3(0, 0.12, 0)), '#fee761', 8);
      ctx.audio.play('sparkle', { x: p.x });
      break;
  }
  ctx.bus.emit('toast', { text: t('celeb.arrived', { name: c.name }), kind: 'quest' });
}

/** Little idle gags while the guest waits at the counter. */
export function celebIdle(ctx: GameContext, c: Customer, dt: number): void {
  if (c.phase !== 'waiting' && c.phase !== 'queued') return;
  const p = c.object.position;
  switch (c.def.celebrity) {
    case 'speed':
      // Can't stand still: hops, barks and yells now and then.
      ctx.vfx.rate(`speedGag${c.uid}`, 0.07, dt, () => {
        c.sprite.play('happy');
        if (rng.chance(0.5)) ctx.audio.play('bark', { x: p.x, volume: 0.8 });
        else c.say(ctx, rng.chance(0.5) ? 'SEWEEEY!' : 'CHAT!!', 'happy', 1.6);
      });
      break;
    case 'saltbae':
      ctx.vfx.rate(`saltGag${c.uid}`, 0.05, dt, () => sprinkleSalt(ctx, c, 1.2));
      break;
    case 'ronaldo':
      ctx.vfx.rate(`siuGag${c.uid}`, 0.045, dt, () => siuuuJump(ctx, c));
      break;
    case 'gordon':
      ctx.vfx.rate(`gordonGag${c.uid}`, 0.05, dt, () => {
        c.sprite.play('angry');
        c.say(ctx, t(rng.chance(0.5) ? 'celeb.gordonGag1' : 'celeb.gordonGag2'), 'angry', 2);
      });
      break;
    case 'recep':
      ctx.vfx.rate(`recepGag${c.uid}`, 0.04, dt, () => c.say(ctx, t(rng.chance(0.5) ? 'celeb.recepGag1' : 'celeb.recepGag2'), 'angry', 2));
      break;
    case 'burak':
      ctx.vfx.rate(`burakGag${c.uid}`, 0.06, dt, () => {
        c.sprite.play('happy');
        c.say(ctx, '😁', 'happy', 1.4);
      });
      break;
    default:
      break;
  }
}

/** Ronaldo's celebration: a leap, a half turn in the air and a roar. */
export function siuuuJump(ctx: GameContext, c: Customer): void {
  const p = c.object.position;
  c.sprite.play('happy');
  let tt = 0;
  const step = 1 / 30;
  const tick = () => {
    if (!c.alive) return;
    tt += step;
    const k = Math.min(1, tt / 0.7);
    c.sprite.hop = Math.sin(k * Math.PI) * 0.55;
    if (tt > 0.3 && tt - step <= 0.3) c.sprite.facing = -c.sprite.facing;
    if (k < 1) ctx.later(step, tick);
    else {
      c.sprite.hop = 0;
      c.sprite.squash = 0.25;
      ctx.later(0.15, () => (c.sprite.squash = 0));
      ctx.audio.play('boom', { x: p.x, volume: 0.5 });
      ctx.bus.emit('shake', { amount: 0.1 });
      ctx.vfx.dust(p.clone(), '#b8a88a', 10);
    }
  };
  tick();
  c.say(ctx, 'SIUUUUU!', 'happy', 1.8);
  ctx.audio.play('cheer', { x: p.x, volume: 0.5, delay: 0.5 });
}

/** Little silver fish leaping in arcs (the anchovy potion). */
export function fishJump(ctx: GameContext, at: THREE.Vector3, count = 10): void {
  for (let i = 0; i < count; i++)
    ctx.later(i * 0.12, () =>
      ctx.vfx.particles.spawn({
        x: at.x + rng.range(-0.25, 0.25),
        y: at.y,
        z: at.z + rng.range(-0.15, 0.25),
        vx: rng.range(-0.8, 0.8),
        vy: rng.range(1.8, 2.6),
        vz: rng.range(-0.2, 0.4),
        gravity: 6,
        life: rng.range(0.7, 0.95),
        size0: 0.06,
        size1: 0.05,
        color0: new THREE.Color('#c0cbdc'),
        color1: new THREE.Color('#8b9bb4'),
        alpha0: 1,
        alpha1: 1,
      }),
    );
}

export function sprinkleSalt(ctx: GameContext, c: Customer, seconds: number): void {
  const hand = c.object.position.clone().add(new THREE.Vector3(c.sprite.facing * 0.25, c.def.height * 1.05, 0.05));
  let tt = 0;
  const step = 0.08;
  const tick = () => {
    if (!c.alive || tt > seconds) return;
    tt += step;
    for (let i = 0; i < 3; i++)
      ctx.vfx.particles.spawn({
        x: hand.x + rng.range(-0.05, 0.05),
        y: hand.y,
        z: hand.z + rng.range(-0.05, 0.05),
        vx: rng.range(-0.1, 0.1),
        vy: rng.range(-0.3, 0),
        vz: rng.range(-0.1, 0.1),
        gravity: 3,
        life: rng.range(0.6, 1),
        size0: 0.022,
        size1: 0.012,
        color0: new THREE.Color('#ffffff'),
        color1: new THREE.Color('#e8e0ff'),
        alpha0: 1,
        alpha1: 0.4,
      });
    ctx.later(step, tick);
  };
  tick();
}

export function confetti(ctx: GameContext, at: THREE.Vector3): void {
  for (const col of ['#fee761', '#63c74d', '#2a6fdb', '#f6757a', '#b55088']) ctx.vfx.stars(at, col, 10);
}

/** Gold coins raining down over the counter (the MrBeast potion). */
export function goldRain(ctx: GameContext, center: THREE.Vector3, seconds: number): void {
  let tt = 0;
  const step = 0.06;
  const tick = () => {
    if (tt > seconds) return;
    tt += step;
    for (let i = 0; i < 3; i++)
      ctx.vfx.particles.spawn({
        x: center.x + rng.range(-1.6, 1.6),
        y: center.y + rng.range(1.6, 2.4),
        z: center.z + rng.range(-1, 1),
        vx: 0,
        vy: -rng.range(0.5, 1.2),
        vz: 0,
        gravity: 3.5,
        life: rng.range(0.9, 1.3),
        size0: 0.04,
        size1: 0.03,
        color0: new THREE.Color('#fee761'),
        color1: new THREE.Color('#feae34'),
        alpha0: 1,
        alpha1: 1,
      });
    if (rng.chance(0.4)) ctx.audio.play('coin', { x: center.x + rng.range(-1, 1), volume: 0.4, minGap: 0.03 });
    ctx.later(step, tick);
  };
  tick();
}
