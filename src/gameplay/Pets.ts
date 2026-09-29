// Master Mortimer's dog: a curly Lagotto Romagnolo sitting in his lap. Left
// click pets it, right click (long press) opens its customization panel. It
// naps when the master does and barks at visitors now and then – and always
// at thieves.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import { Entity, pickProxy, type HoverInfo } from '../world/Entity';
import { PixelSprite } from '../rendering/three/sprites/PixelSprite';
import { dogSheet, slimeSheet } from '../rendering/three/sprites/CharacterPainter';
import { dogCoat, dogCollar, slimeColor, type DogLook, type SlimeLook } from '../data/pets';
import { rng } from '../core/Random';
import { t } from '../core/i18n';

export function dogSheetFor(look: DogLook) {
  const coat = dogCoat(look.coat);
  return dogSheet({ coat: coat.color, patch: coat.color2, nose: coat.nose, collar: dogCollar(look.collar).color });
}

export function slimeSheetFor(look: SlimeLook) {
  return slimeSheet(slimeColor(look.color).color);
}

export class MentorDog extends Entity {
  readonly kind = 'dog';
  sprite: PixelSprite;
  private lookKey = '';
  private happyUntil = 0;
  private barkUntil = 0;
  private pantTimer = rng.range(8, 16);
  private pantUntil = 0;
  pets = 0;

  constructor(ctx: GameContext, lap: THREE.Vector3) {
    super();
    this.object.position.copy(lap);
    this.sprite = this.makeSprite(ctx.state.pets.dog);
    this.object.add(pickProxy(new THREE.SphereGeometry(0.2, 6, 4)).translateY(0.28));
    ctx.bus.on('customer:arrived', () => {
      if (rng.chance(0.3)) ctx.later(rng.range(0.4, 1.2), () => this.bark(ctx, 1));
    });
    ctx.bus.on('nobert:arrived', () => ctx.later(0.6, () => this.bark(ctx, 4)));
    ctx.bus.on('cauldron:exploded', () => ctx.later(0.3, () => this.bark(ctx, 2)));
  }

  private makeSprite(look: DogLook): PixelSprite {
    this.lookKey = `${look.coat}:${look.collar}`;
    const sprite = new PixelSprite(dogSheetFor(look), 0.62);
    sprite.play('idle');
    // Looks the same way as the master.
    sprite.facing = 1;
    sprite.shadow.visible = false;
    this.object.add(sprite.root);
    return sprite;
  }

  syncLook(ctx: GameContext): void {
    const look = ctx.state.pets.dog;
    if (`${look.coat}:${look.collar}` === this.lookKey) return;
    this.sprite.dispose();
    this.sprite = this.makeSprite(look);
  }

  override hover(ctx: GameContext): HoverInfo {
    const touch = ctx.input.pointer.type !== 'mouse';
    return { title: ctx.state.pets.dog.name || t('obj.dog'), subtitle: t('dog.breed'), hint: t(touch ? 'hint.petTouch' : 'hint.pet') };
  }

  override cursor() {
    return 'point' as const;
  }

  override press(ctx: GameContext) {
    this.pet(ctx);
    return null;
  }

  override altPress(ctx: GameContext): boolean {
    this.happyUntil = ctx.time + 2;
    ctx.bus.emit('pet:open', { kind: 'dog' });
    return true;
  }

  pet(ctx: GameContext): void {
    this.pets++;
    this.happyUntil = ctx.time + 2.5;
    ctx.audio.play('happy', { x: this.object.position.x, pitch: 1.6, volume: 0.5 });
    ctx.vfx.heartBurst(this.object.position.clone().add(new THREE.Vector3(0, 0.45, 0.05)), '#f6757a');
    ctx.bus.emit('pet:petted', { kind: 'dog', count: this.pets });
  }

  bark(ctx: GameContext, times: number): void {
    if (this.sleeping(ctx) && times < 3) return;
    this.barkUntil = ctx.time + 0.5 * times;
    for (let i = 0; i < times; i++) ctx.audio.play('bark', { x: this.object.position.x, pitch: 1.35, volume: 0.45, delay: i * 0.5 });
  }

  private sleeping(ctx: GameContext): boolean {
    return ctx.renderer.lighting.nightness > 0.7 && !ctx.state.shopOpen;
  }

  override update(ctx: GameContext, dt: number): void {
    this.syncLook(ctx);
    const open = ctx.ui.isPanelOpen('pet');
    let want = 'idle';
    if (ctx.time < this.happyUntil || open) want = 'wag';
    else if (ctx.time < this.barkUntil) want = 'pant';
    else if (this.sleeping(ctx)) want = 'sleep';
    else {
      this.pantTimer -= dt;
      if (this.pantTimer <= 0) {
        this.pantTimer = rng.range(10, 20);
        this.pantUntil = ctx.time + rng.range(2, 4);
      }
      if (ctx.time < this.pantUntil) want = 'pant';
    }
    if (this.sprite.current !== want) this.sprite.play(want);
    this.sprite.hop = ctx.time < this.barkUntil ? Math.abs(Math.sin(ctx.time * 14)) * 0.02 : 0;
    this.sprite.update(dt, ctx.renderer.rig.camera);
  }
}
