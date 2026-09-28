// Physical fire controls: the bellows (pump by dragging the handle down and
// up) and the iron air damper lever (drag sideways, snaps to notches).

import * as THREE from 'three';
import { Entity, type CursorKind, type HoverInfo } from '../../world/Entity';
import type { Grab } from '../../world/Interaction';
import type { GameContext } from '../../core/GameContext';
import { bellowsModel, leverModel, type BellowsParts } from '../../rendering/three/models/toolModels';
import { clamp, damp } from '../../core/math';
import { t } from '../../core/i18n';
import type { Hearth } from '../potion/Hearth';
import { CG } from '../../physics/PhysicsTypes';

export class Bellows extends Entity {
  readonly kind = 'bellows';
  private readonly parts: BellowsParts;
  compression = 0;
  private targetCompression = 0;
  private pumping = false;

  constructor(
    ctx: GameContext,
    position: THREE.Vector3,
    yaw: number,
    private readonly hearth: Hearth,
  ) {
    super();
    this.parts = bellowsModel();
    this.object.add(this.parts.group);
    this.object.position.copy(position);
    this.object.rotation.y = yaw;
    this.body = ctx.physics.createBody({
      shape: { type: 'box', size: [0.5, 0.22, 0.36], offset: { x: 0.16, y: 0.08, z: 0 } },
      motion: 'static',
      position,
      rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      group: CG.STATIC,
    });
  }

  override cursor(): CursorKind {
    return 'grab';
  }

  override hover(): HoverInfo {
    return { title: t('obj.bellows'), hint: t('hint.bellows') };
  }

  override press(ctx: GameContext): Grab {
    this.pumping = true;
    const startY = ctx.input.pointer.y;
    const self = this;
    let last = 0;
    return {
      entity: this,
      cursor: 'grabbing',
      hint: () => t('hint.bellows'),
      update(c: GameContext, dt: number) {
        const dy = c.input.pointer.y - startY;
        self.targetCompression = clamp(dy / 70, 0, 1);
        const delta = self.targetCompression - last;
        if (delta > 0) {
          const mul = c.state.effects.bellowsMul;
          self.hearth.pump(delta, mul);
          c.bus.emit('bellows', { boost: self.hearth.boost });
          if (delta > 0.04) {
            const nozzle = self.nozzleWorld();
            c.vfx.dust(nozzle, '#c0cbdc', 2);
            if (self.hearth.fuel > 0.05) c.vfx.sparks(new THREE.Vector3(self.hearth.center.x, 0.35, self.hearth.center.z + 0.3), 6, [0.3, 1.2, 0.3], 0.7);
            c.audio.play('whoosh', { x: nozzle.x, volume: Math.min(1, delta * 6), minGap: 0.18 });
          }
        }
        last = self.targetCompression;
        void dt;
      },
      release() {
        self.pumping = false;
        self.targetCompression = 0;
        ctx.audio.play('squeak', { x: self.object.position.x, pitch: 0.8 });
      },
    };
  }

  private nozzleWorld(): THREE.Vector3 {
    return this.object.localToWorld(new THREE.Vector3(-0.17, 0.05, 0));
  }

  override update(_ctx: GameContext, dt: number): void {
    if (!this.pumping) this.targetCompression = 0;
    this.compression = damp(this.compression, this.targetCompression, this.pumping ? 18 : 6, dt);
    this.parts.top.rotation.z = -this.compression * 0.35;
    this.parts.top.position.y = 0.1 - this.compression * 0.03;
    this.parts.bag.scale.y = 1 - this.compression * 0.65;
    this.parts.bag.position.y = 0.05 - this.compression * 0.02;
  }
}

export class Damper extends Entity {
  readonly kind = 'damper';
  private readonly arm: THREE.Group;
  private angle = 0;
  private notch = -1;

  constructor(
    ctx: GameContext,
    position: THREE.Vector3,
    private readonly hearth: Hearth,
  ) {
    super();
    const m = leverModel();
    this.arm = m.arm;
    this.object.add(m.group);
    this.object.position.copy(position);
    this.object.scale.setScalar(0.9);
    void ctx;
  }

  override cursor(): CursorKind {
    return 'grab';
  }

  override hover(): HoverInfo {
    return {
      title: t('obj.damper'),
      hint: t('hint.damper'),
      lines: [{ text: `${Math.round(this.hearth.damper * 100)}%`, color: '#8b9bb4', bar: this.hearth.damper }],
    };
  }

  override press(ctx: GameContext): Grab {
    const startX = ctx.input.pointer.x;
    const start = this.hearth.damper;
    const self = this;
    return {
      entity: this,
      cursor: 'grabbing',
      hint: () => `${t('obj.damper')}: ${Math.round(self.hearth.damper * 100)}%`,
      update(c: GameContext) {
        const v = clamp(start + (c.input.pointer.x - startX) / 160, 0, 1);
        // Snap softly to four notches.
        const n = Math.round(v * 3);
        const snapped = Math.abs(v - n / 3) < 0.06 ? n / 3 : v;
        self.hearth.damper = snapped;
        if (n !== self.notch) {
          self.notch = n;
          c.audio.play('lever', { x: self.object.position.x, pitch: 0.8 + n * 0.1 });
        }
      },
      release() {},
    };
  }

  override update(_ctx: GameContext, dt: number): void {
    const target = (this.hearth.damper - 0.5) * 1.8;
    this.angle = damp(this.angle, target, 14, dt);
    this.arm.rotation.z = -this.angle;
  }
}
