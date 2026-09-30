// Little creatures living on the shelves: a jar slime that jiggles and hops
// along the upper board, and a spider dangling on its thread that scurries
// up when the pointer comes close. Both hide when the cauldron misbehaves.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import { Entity, pickProxy, type HoverInfo } from '../world/Entity';
import { PixelSprite } from '../rendering/three/sprites/PixelSprite';
import { spiderSheet } from '../rendering/three/sprites/CharacterPainter';
import { slimeSheetFor } from './Pets';
import { clamp, damp } from '../core/math';
import { rng } from '../core/Random';
import { t } from '../core/i18n';

export class JarSlime extends Entity {
  readonly kind = 'slime';
  private sprite: PixelSprite;
  private lookKey = '';
  private pets = 0;
  private readonly home: THREE.Vector3;
  private targetX: number;
  private hopT = -1;
  private fromX = 0;
  private idleTimer = rng.range(4, 9);
  private hideUntil = 0;

  constructor(
    ctx: GameContext,
    position: THREE.Vector3,
    private readonly range: [number, number],
  ) {
    super();
    this.home = position.clone();
    this.targetX = position.x;
    this.sprite = this.makeSprite(ctx);
    this.object.add(pickProxy(new THREE.SphereGeometry(0.12, 6, 4)).translateY(0.1));
    this.object.position.copy(position);
    ctx.bus.on('cauldron:exploded', () => (this.hideUntil = ctx.time + 6));
    ctx.bus.on('chaos', ({ amount }) => {
      if (amount >= 0.5) this.hideUntil = Math.max(this.hideUntil, ctx.time + 3);
    });
  }

  private makeSprite(ctx: GameContext): PixelSprite {
    const look = ctx.state.pets.slime;
    this.lookKey = look.color;
    const sprite = new PixelSprite(slimeSheetFor(look), 0.9);
    sprite.shadow.visible = false;
    this.object.add(sprite.root);
    return sprite;
  }

  override hover(ctx: GameContext): HoverInfo {
    const touch = ctx.input.pointer.type !== 'mouse';
    return { title: ctx.state.pets.slime.name || t('obj.slime'), subtitle: t('obj.slime'), hint: t(touch ? 'hint.petTouch' : 'hint.pet') };
  }

  override cursor() {
    return 'point' as const;
  }

  override press(ctx: GameContext) {
    if (ctx.time < this.hideUntil) return null;
    this.startHop(ctx, clamp(this.object.position.x + rng.range(-0.25, 0.25), this.range[0], this.range[1]));
    ctx.audio.play('squeak', { x: this.object.position.x, pitch: 1.3 });
    ctx.vfx.heartBurst(this.object.position.clone().add(new THREE.Vector3(0, 0.3, 0)), '#63c74d');
    this.pets++;
    ctx.bus.emit('pet:petted', { kind: 'slime', count: this.pets });
    return null;
  }

  /** Right click (long press on touch): rename and recolour. */
  override altPress(ctx: GameContext): boolean {
    ctx.audio.play('squeak', { x: this.object.position.x, pitch: 1.6 });
    ctx.bus.emit('pet:open', { kind: 'slime' });
    return true;
  }

  private startHop(ctx: GameContext, x: number): void {
    this.fromX = this.object.position.x;
    this.targetX = x;
    this.hopT = 0;
    this.sprite.play('hop', true);
    this.sprite.facing = x > this.fromX ? 1 : -1;
    ctx.audio.play('squish', { x, volume: 0.25, pitch: 1.6 });
  }

  override update(ctx: GameContext, dt: number): void {
    if (ctx.state.pets.slime.color !== this.lookKey) {
      this.sprite.dispose();
      this.sprite = this.makeSprite(ctx);
    }
    const hiding = ctx.time < this.hideUntil;
    if (hiding) {
      if (this.sprite.current !== 'hide') this.sprite.play('hide');
      this.hopT = -1;
    } else if (this.hopT >= 0) {
      this.hopT += dt / 0.5;
      const k = Math.min(1, this.hopT);
      this.object.position.x = this.fromX + (this.targetX - this.fromX) * k;
      this.sprite.hop = Math.sin(k * Math.PI) * 0.12;
      if (this.hopT >= 1) {
        this.hopT = -1;
        this.sprite.hop = 0;
        this.sprite.play('idle');
      }
    } else {
      if (this.sprite.current !== 'idle') this.sprite.play('idle');
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) {
        this.idleTimer = rng.range(5, 12);
        this.startHop(ctx, rng.range(this.range[0], this.range[1]));
      }
    }
    this.object.position.y = this.home.y;
    this.sprite.update(dt, ctx.renderer.rig.camera);
  }
}

export class ShelfSpider extends Entity {
  readonly kind = 'spider';
  private readonly sprite = new PixelSprite(spiderSheet(), 0.8);
  private readonly thread: THREE.Mesh;
  private drop = 0.22;
  private targetDrop = 0.22;
  private timer = rng.range(3, 6);
  private scaredUntil = 0;

  constructor(
    ctx: GameContext,
    private readonly anchor: THREE.Vector3,
  ) {
    super();
    this.object.add(this.sprite.root);
    this.object.add(pickProxy(new THREE.SphereGeometry(0.1, 6, 4)).translateY(0.08));
    this.sprite.shadow.visible = false;
    this.thread = new THREE.Mesh(new THREE.BoxGeometry(0.006, 1, 0.006), new THREE.MeshBasicMaterial({ color: '#e8e8f0', transparent: true, opacity: 0.7 }));
    this.thread.geometry.translate(0, -0.5, 0);
    this.thread.raycast = () => {};
    this.thread.userData.noPick = true;
    this.thread.position.copy(anchor);
    ctx.scene.add(this.thread);
    ctx.bus.on('cauldron:exploded', () => (this.scaredUntil = ctx.time + 8));
  }

  override hover(): HoverInfo {
    return { title: t('obj.spider'), hint: t('hint.spider') };
  }

  override dispose(ctx: GameContext): void {
    this.thread.removeFromParent();
    super.dispose(ctx);
  }

  override cursor() {
    return 'point' as const;
  }

  override press(ctx: GameContext) {
    this.scaredUntil = ctx.time + 5;
    ctx.audio.play('squeak', { x: this.anchor.x, pitch: 2.2, volume: 0.5 });
    return null;
  }

  override update(ctx: GameContext, dt: number): void {
    const night = ctx.renderer.lighting.nightness > 0.6;
    // Scurry up when the pointer is close or something scary happened.
    const hovered = ctx.interaction.hovered === this;
    const scared = ctx.time < this.scaredUntil || hovered;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = rng.range(3, 7);
      this.targetDrop = night ? rng.range(0.35, 0.6) : rng.range(0.12, 0.35);
    }
    const want = scared ? 0.04 : this.targetDrop;
    const speed = scared ? 9 : 1.2;
    const before = this.drop;
    this.drop = damp(this.drop, want, speed, dt);
    const moving = Math.abs(this.drop - before) > dt * 0.02;
    this.sprite.play(moving ? 'climb' : 'idle');
    const sway = Math.sin(ctx.time * 1.3) * 0.015;
    this.object.position.set(this.anchor.x + sway, this.anchor.y - this.drop - 0.1, this.anchor.z);
    this.thread.scale.y = this.drop + 0.02;
    this.thread.position.set(this.anchor.x + sway * 0.5, this.anchor.y, this.anchor.z);
    this.thread.rotation.z = -sway * 1.5;
    this.sprite.update(dt, ctx.renderer.rig.camera);
  }
}
