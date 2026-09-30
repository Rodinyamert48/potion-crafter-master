// Ingredient preparation: cutting board, knife (swipe to slice, flick to
// chop), hammer (flick down to smash), mortar & pestle (circle to grind) and
// the drying rack (hang ingredients near the fire).

import * as THREE from 'three';
import { Entity, type CursorKind, type HoverInfo, type SavedEntity } from '../../world/Entity';
import type { Grab, PhysicsGrab } from '../../world/Interaction';
import type { GameContext } from '../../core/GameContext';
import { IngredientItem } from '../ingredients/IngredientItem';
import { boardModel, dryingRackModel } from '../../rendering/three/models/stationModels';
import { hammerModel, knifeModel, mortarModel, pestleModel, MORTAR_PROFILE } from '../../rendering/three/models/toolModels';
import { CG, type ShapeDesc } from '../../physics/PhysicsTypes';
import { clamp, damp } from '../../core/math';
import { t, tr } from '../../core/i18n';
import { rng } from '../../core/Random';
import { grindLoop } from '../../audio/Sfx';
import type { Hearth } from '../potion/Hearth';

// ---------------------------------------------------------------------------
// Cutting board
// ---------------------------------------------------------------------------

export class CuttingBoard extends Entity {
  readonly kind = 'board';
  readonly half = new THREE.Vector2(0.35, 0.22);
  readonly topY: number;
  private readonly boardMesh: THREE.Mesh;

  constructor(ctx: GameContext, position: THREE.Vector3) {
    super();
    this.boardMesh = boardModel();
    this.object.add(this.boardMesh);
    this.object.position.copy(position);
    this.topY = position.y + 0.02;
    this.interactive = false;
    this.body = ctx.physics.createBody({ shape: { type: 'box', size: [0.7, 0.04, 0.44] }, motion: 'static', position, friction: 0.9, group: CG.STATIC });
    ctx.world.addSurface(this.boardMesh, { tag: 'board' });
  }

  contains(p: THREE.Vector3, margin = 0.02): boolean {
    const d = p.clone().sub(this.object.position);
    return Math.abs(d.x) < this.half.x + margin && Math.abs(d.z) < this.half.y + margin && d.y > -0.05 && d.y < 0.3;
  }

  itemsOn(ctx: GameContext): IngredientItem[] {
    return ctx.world.ofKind<IngredientItem>('ingredient').filter((i) => !i.held && this.contains(i.object.position));
  }
}

// ---------------------------------------------------------------------------
// Knife & hammer
// ---------------------------------------------------------------------------

abstract class Tool extends Entity {
  protected strikeT = -1;
  protected cooldown = 0;
  protected abstract readonly action: 'slice' | 'smash';
  protected abstract readonly headLocal: THREE.Vector3;
  protected readonly model = new THREE.Group();
  readonly home: THREE.Vector3;
  readonly homeYaw: number;
  private homeTimer = 0;
  /** Flying back to its place on the table. */
  private returning = false;
  private returnT = 0;

  constructor(
    ctx: GameContext,
    position: THREE.Vector3,
    yaw: number,
    shape: ShapeDesc,
    mass: number,
    protected readonly board: CuttingBoard,
  ) {
    super();
    this.home = position.clone();
    this.homeYaw = yaw;
    this.object.add(this.model);
    this.draggable = true;
    this.upright = true;
    this.body = ctx.physics.createBody({
      shape,
      motion: 'dynamic',
      mass,
      position,
      rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      friction: 0.8,
      restitution: 0.1,
      collisionEvents: true,
      group: CG.TOOL,
      mask: CG.STATIC | CG.ITEM,
    });
  }

  headWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.object.localToWorld(out.copy(this.headLocal));
  }

  override onPicked(): void {
    // While held, pass through ingredients (so the blade can go through them).
    this.returning = false;
    this.homeTimer = 0;
    this.body?.setCollisionFilter(CG.TOOL, CG.STATIC);
  }

  override onReleased(): void {
    this.body?.setCollisionFilter(CG.TOOL, CG.STATIC | CG.ITEM);
    this.strikeT = -1;
    this.model.position.set(0, 0, 0);
    this.model.rotation.set(0, 0, 0);
  }

  protected startStrike(ctx: GameContext): void {
    if (this.strikeT >= 0 || this.cooldown > 0) return;
    this.strikeT = 0;
    void ctx;
  }

  protected abstract onStrikeImpact(ctx: GameContext): void;

  override onHeld(ctx: GameContext, dt: number): void {
    const grab = ctx.interaction.grab as PhysicsGrab | null;
    if (!grab) return;
    grab.stiffness = 1.8;
    const overBoard = grab.surfaceTag === 'board';
    let offset = overBoard ? -0.16 : -0.05;
    this.cooldown -= dt;
    // Gesture: a quick downward flick on screen, or the action key.
    const v = ctx.input.recentVelocity(70);
    if (v.vy > 950 && Math.abs(v.vx) < v.vy) this.startStrike(ctx);
    if (ctx.input.wasPressed('Space') || (ctx.input.pointer.down[2] && this.strikeT < 0 && this.cooldown <= 0)) this.startStrike(ctx);
    if (this.strikeT >= 0) {
      const prev = this.strikeT;
      this.strikeT += dt / 0.2;
      const s = Math.sin(Math.min(1, this.strikeT) * Math.PI);
      offset -= s * 0.2;
      this.swingVisual(s);
      if (prev < 0.5 && this.strikeT >= 0.5) this.onStrikeImpact(ctx);
      if (this.strikeT >= 1) {
        this.strikeT = -1;
        this.cooldown = 0.12;
        this.swingVisual(0);
      }
    }
    grab.heightOffset = offset;
  }

  protected swingVisual(_s: number): void {}

  override netState(): unknown {
    const r = (v: number) => Math.round(v * 100) / 100;
    return [this.held ? 1 : 0, this.returning ? 1 : 0, r(this.model.rotation.x), r(this.model.rotation.z)];
  }

  override applyNetState(_ctx: GameContext, s: unknown): void {
    const [held, returning, rx, rz] = s as number[];
    this.held = !!held;
    this.returning = !!returning;
    this.model.rotation.x = rx;
    this.model.rotation.z = rz;
  }

  override update(ctx: GameContext, dt: number): void {
    // Online guest: the host flies dropped tools home.
    if (ctx.net.isGuest) return;
    const p = this.object.position;
    const body = this.body;
    if (this.returning && body && !this.held) {
      this.flyHome(ctx, dt);
      return;
    }
    // Tools that fall on the floor (or under the table) fly back to their
    // place on the table after a moment.
    const away = p.distanceTo(this.home) > 0.9;
    if (!this.held && (p.y < 0.45 || p.y < -1 || (away && p.y < 0.75))) {
      this.homeTimer += dt;
      if (p.y < -1) {
        this.homeTimer = 0;
        body?.teleport(this.home, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.homeYaw));
        if (body) ctx.sync.snap(body);
      } else if (this.homeTimer > 1.6 && body) {
        this.homeTimer = 0;
        this.returning = true;
        this.returnT = 0;
        body.setCollisionFilter(CG.TOOL, 0);
        body.setGravityFactor(0);
        ctx.audio.play('sparkle', { x: p.x, volume: 0.6 });
      }
    } else this.homeTimer = 0;
  }

  /** Float up out of wherever it fell, then glide onto its spot. */
  private flyHome(ctx: GameContext, dt: number): void {
    const body = this.body!;
    const p = this.object.position;
    this.returnT += dt;
    const lift = this.home.y + 0.45;
    const horiz = Math.hypot(this.home.x - p.x, this.home.z - p.z);
    const goal = new THREE.Vector3(this.home.x, horiz > 0.15 ? Math.max(lift, p.y) : this.home.y + 0.02, this.home.z);
    if (horiz > 0.15 && p.y < lift - 0.1) goal.set(p.x, lift, p.z);
    const v = goal.sub(p).multiplyScalar(5);
    if (v.length() > 4.5) v.setLength(4.5);
    body.setLinearVelocity(v);
    body.setAngularVelocity({ x: 0, y: 0, z: 0 });
    ctx.vfx.rate(`toolTrail${this.id}`, 14, dt, () => ctx.vfx.magic(p.clone(), '#b55088', 1));
    if ((horiz < 0.04 && Math.abs(p.y - this.home.y) < 0.06) || this.returnT > 4) {
      this.returning = false;
      body.teleport(this.home, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.homeYaw));
      ctx.sync.snap(body);
      body.setLinearVelocity({ x: 0, y: 0, z: 0 });
      body.setGravityFactor(1);
      body.setCollisionFilter(CG.TOOL, CG.STATIC | CG.ITEM);
      ctx.vfx.magic(this.home, '#b55088', 8);
    }
  }
}

export class Knife extends Tool {
  readonly kind = 'knife';
  protected readonly action = 'slice' as const;
  protected readonly headLocal: THREE.Vector3;
  private readonly lastTip = new THREE.Vector3();
  private tipInit = false;

  constructor(ctx: GameContext, position: THREE.Vector3, yaw: number, board: CuttingBoard) {
    super(ctx, position, yaw, { type: 'box', size: [0.3, 0.03, 0.045], offset: { x: 0.03, y: 0, z: 0 } }, 0.25, board);
    const m = knifeModel();
    this.model.add(m.group);
    this.headLocal = m.tip;
    this.halfHeight = 0.02;
  }

  override hover(): HoverInfo {
    return { title: t('obj.knife'), hint: t('hint.knife') };
  }

  protected override swingVisual(s: number): void {
    this.model.rotation.z = -s * 0.5;
  }

  protected onStrikeImpact(ctx: GameContext): void {
    const tip = this.headWorld();
    ctx.audio.play('chop', { x: tip.x });
    let best: IngredientItem | null = null;
    let bestD = 0.14;
    for (const item of this.board.itemsOn(ctx)) {
      const d = Math.hypot(item.object.position.x - tip.x, item.object.position.z - tip.z) - item.radius * 0.5;
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    if (best) this.cut(ctx, best);
  }

  private cut(ctx: GameContext, item: IngredientItem): void {
    const res = item.tryProcess(ctx, 'slice');
    const p = item.object.position.clone();
    if (res === 'done' || res === 'progress') {
      ctx.vfx.chips(p, item.def.colorAlt, 8, 0.6);
      ctx.audio.play('chop', { x: p.x, pitch: 1.1 });
    } else if (res === 'refused') {
      ctx.audio.play('metalClang', { x: p.x, volume: 0.5, pitch: 1.8 });
      ctx.vfx.sparks(p, 6, [0, 1, 0], 0.6);
    }
  }

  override onHeld(ctx: GameContext, dt: number): void {
    super.onHeld(ctx, dt);
    // Swipe slicing: the blade moving fast through an ingredient on the board.
    const tip = this.headWorld();
    if (!this.tipInit) {
      this.lastTip.copy(tip);
      this.tipInit = true;
      return;
    }
    const speed = tip.distanceTo(this.lastTip) / Math.max(1e-3, dt);
    if (speed > 1.4 && tip.y < this.board.topY + 0.16) {
      for (const item of this.board.itemsOn(ctx)) {
        const c = item.object.position;
        if (segmentDistXZ(this.lastTip, tip, c) < item.radius + 0.02 && tip.y < c.y + item.halfHeight + 0.1) this.cut(ctx, item);
      }
    }
    this.lastTip.copy(tip);
  }

  override onReleased(): void {
    super.onReleased();
    this.tipInit = false;
  }
}

export class Hammer extends Tool {
  readonly kind = 'hammer';
  protected readonly action = 'smash' as const;
  protected readonly headLocal: THREE.Vector3;

  constructor(ctx: GameContext, position: THREE.Vector3, yaw: number, board: CuttingBoard) {
    super(ctx, position, yaw, {
      type: 'compound',
      children: [
        { type: 'box', size: [0.3, 0.03, 0.03], offset: { x: -0.05, y: 0, z: 0 } },
        { type: 'box', size: [0.06, 0.07, 0.12], offset: { x: 0.11, y: 0, z: 0 } },
      ],
    }, 0.6, board);
    const m = hammerModel();
    this.model.add(m.group);
    this.headLocal = m.head;
    this.halfHeight = 0.035;
  }

  override hover(): HoverInfo {
    return { title: t('obj.hammer'), hint: t('hint.hammer') };
  }

  protected override swingVisual(s: number): void {
    this.model.rotation.x = s * 0.9;
  }

  protected onStrikeImpact(ctx: GameContext): void {
    const head = this.headWorld();
    ctx.bus.emit('shake', { amount: 0.12 });
    let hitSomething = false;
    for (const item of this.board.itemsOn(ctx)) {
      const d = Math.hypot(item.object.position.x - head.x, item.object.position.z - head.z);
      if (d > item.radius + 0.1) continue;
      hitSomething = true;
      const res = item.tryProcess(ctx, 'smash');
      const p = item.object.position.clone();
      if (res === 'done' || res === 'progress') {
        ctx.audio.play(item.def.model === 'scale' || item.def.model === 'crystal' ? 'smash' : 'squish', { x: p.x });
        ctx.vfx.chips(p, item.def.color, 14, 1);
        if (item.def.model === 'scale') ctx.vfx.sparks(p, 10, [0, 1, 0], 0.9, '#feae34');
      } else if (res === 'refused') {
        ctx.audio.play('squish', { x: p.x, volume: 0.6 });
      } else {
        item.body?.applyImpulse({ x: 0, y: 0.08 * (item.body?.mass ?? 0.1) * 10, z: 0 });
      }
    }
    ctx.audio.play('woodKnock', { x: head.x, volume: hitSomething ? 0.6 : 1 });
    ctx.vfx.dust(new THREE.Vector3(head.x, this.board.topY + 0.01, head.z), '#b8a88a', 5);
  }
}

function segmentDistXZ(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  let tt = len2 > 0 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2 : 0;
  tt = clamp(tt, 0, 1);
  return Math.hypot(a.x + abx * tt - p.x, a.z + abz * tt - p.z);
}

// ---------------------------------------------------------------------------
// Mortar & pestle
// ---------------------------------------------------------------------------

export class Mortar extends Entity {
  readonly kind = 'mortar';
  private readonly pestle: THREE.Group;
  private readonly pestleOffset = new THREE.Vector2(0.03, 0);
  private grinding = false;
  private speed = 0;
  private lastRefuse = -10;
  readonly top: number;

  constructor(ctx: GameContext, position: THREE.Vector3) {
    super();
    this.object.add(mortarModel());
    this.pestle = pestleModel();
    this.object.add(this.pestle);
    this.object.position.copy(position);
    this.top = position.y + 0.115;
    const children: ShapeDesc[] = [{ type: 'cylinder', radius: 0.12, height: 0.04, offset: { x: 0, y: 0.02, z: 0 } }];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      children.push({ type: 'box', size: [0.035, 0.12, 0.09], offset: { x: Math.cos(a) * 0.125, y: 0.06, z: Math.sin(a) * 0.125 }, rotation: { x: q.x, y: q.y, z: q.z, w: q.w } });
    }
    this.body = ctx.physics.createBody({ shape: { type: 'compound', children }, motion: 'static', position, friction: 0.9, group: CG.STATIC });
    void MORTAR_PROFILE;
  }

  contents(ctx: GameContext): IngredientItem[] {
    const c = this.object.position;
    return ctx.world.ofKind<IngredientItem>('ingredient').filter((i) => {
      const p = i.object.position;
      return !i.held && Math.hypot(p.x - c.x, p.z - c.z) < 0.13 && p.y < this.top + 0.08 && p.y > c.y - 0.02;
    });
  }

  override cursor(): CursorKind {
    return 'grab';
  }

  override hover(ctx: GameContext): HoverInfo {
    const items = this.contents(ctx);
    return {
      title: t('obj.mortar'),
      hint: t('hint.grind'),
      lines: items.map((i) => ({ text: i.name, color: i.def.colorAlt, bar: Math.min(1, i.grind) })),
    };
  }

  override press(ctx: GameContext): Grab {
    this.grinding = true;
    const self = this;
    let last = this.pestleOffset.clone();
    return {
      entity: this,
      cursor: 'stir',
      hint: () => t('hint.grind'),
      update(c: GameContext, dt: number) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(self.top + 0.02));
        const hit = new THREE.Vector3();
        if (!c.interaction.ray.intersectPlane(plane, hit)) return;
        const local = new THREE.Vector2(hit.x - self.object.position.x, hit.z - self.object.position.z);
        if (local.length() > 0.075) local.setLength(0.075);
        self.pestleOffset.lerp(local, Math.min(1, dt * 20));
        const moved = self.pestleOffset.distanceTo(last);
        last = self.pestleOffset.clone();
        self.speed = damp(self.speed, moved / Math.max(1e-3, dt), 10, dt);
        if (moved > 0.0004) self.grind(c, moved);
      },
      release() {
        self.grinding = false;
      },
    };
  }

  private grind(ctx: GameContext, moved: number): void {
    const mul = ctx.state.effects.grindMul;
    for (const item of this.contents(ctx)) {
      const res = item.grindStep(ctx, moved * 7 * mul);
      const p = item.object.position.clone();
      if (res === 'progress' && rng.chance(0.25)) ctx.vfx.powder(p, item.def.color, 2);
      if (res === 'done') {
        ctx.audio.play('crunch', { x: p.x });
        ctx.vfx.powder(p, item.def.color, 14);
      }
      if (res === 'refused' && ctx.time - this.lastRefuse > 3) this.lastRefuse = ctx.time;
      if (res === 'progress' && rng.chance(0.08)) ctx.audio.play('crunch', { x: p.x, volume: 0.35 });
    }
  }

  override netState(): unknown {
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return [r(this.pestleOffset.x), r(this.pestleOffset.y), this.grinding ? 1 : 0, r(this.speed)];
  }

  override applyNetState(_ctx: GameContext, s: unknown): void {
    const [x, y, grinding, speed] = s as number[];
    this.pestleOffset.set(x, y);
    this.grinding = !!grinding;
    this.speed = speed;
  }

  override update(ctx: GameContext, dt: number): void {
    if (!this.grinding) {
      this.speed = damp(this.speed, 0, 8, dt);
      this.pestleOffset.lerp(new THREE.Vector2(0.03, 0), Math.min(1, dt * 3));
    }
    this.pestle.position.set(this.pestleOffset.x, 0.04, this.pestleOffset.y);
    this.pestle.rotation.set(this.pestleOffset.y * 3.2, 0, -this.pestleOffset.x * 3.2 - 0.25);
    const hasContents = this.grinding && this.contents(ctx).length > 0;
    ctx.audio.loop('grind', grindLoop)?.set(hasContents ? Math.min(1, this.speed * 2.5) : 0);
  }
}

// ---------------------------------------------------------------------------
// Drying rack
// ---------------------------------------------------------------------------

export class DryingRack extends Entity {
  readonly kind = 'rack';
  private readonly hooks: THREE.Vector3[] = [];
  private readonly occupied: Array<IngredientItem | null> = [];
  private readonly barProxy: THREE.Mesh;

  constructor(
    ctx: GameContext,
    position: THREE.Vector3,
    private readonly hearth: Hearth,
  ) {
    super();
    const m = dryingRackModel(1.0, 1.55);
    this.object.add(m.group);
    this.object.position.copy(position);
    for (const h of m.hooks) {
      this.hooks.push(h.clone().add(position));
      this.occupied.push(null);
    }
    // Invisible generous surface near the bar so held items hover there.
    this.barProxy = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    this.barProxy.position.set(0, 1.25, 0);
    this.barProxy.userData.noPick = true;
    this.object.add(this.barProxy);
    ctx.world.addSurface(this.barProxy, { tag: 'rack', hover: 0 });
    for (const s of [-1, 1]) {
      ctx.physics.createBody({ shape: { type: 'box', size: [0.06, 1.55, 0.3] }, motion: 'static', position: { x: position.x + s * 0.5, y: position.y + 0.78, z: position.z }, group: CG.STATIC });
    }
  }

  get temperature(): number {
    return this.hearth.rackTemperature;
  }

  override hover(): HoverInfo {
    const temp = Math.round(this.temperature);
    return {
      title: t('obj.rack'),
      hint: t('hint.rack'),
      lines: [
        { text: `${temp}°C`, color: temp > 80 ? '#e43b44' : temp > 38 ? '#63c74d' : '#0099db' },
        ...this.occupied.filter((o): o is IngredientItem => !!o).map((o) => ({ text: o.name, color: o.def.colorAlt, bar: o.dryness })),
      ],
    };
  }

  /** Hang an item released close to a free hook. */
  tryHang(ctx: GameContext, item: IngredientItem): boolean {
    if (!item.canProcess('dry') && item.state !== 'dried') return false;
    const p = item.object.position;
    let best = -1;
    let bestD = 0.45;
    for (let i = 0; i < this.hooks.length; i++) {
      if (this.occupied[i]) continue;
      const h = this.hooks[i];
      const d = Math.hypot(p.x - h.x, (p.y - h.y) * 0.6, p.z - h.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0 || !item.body) return false;
    const hook = this.hooks[best];
    const hangPos = new THREE.Vector3(hook.x, hook.y - item.halfHeight - 0.08, hook.z);
    item.body.teleport(hangPos, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
    ctx.sync.snap(item.body);
    const joint = ctx.physics.hang(item.body, hook, { x: 0, y: 0, z: -(item.halfHeight + 0.06) });
    item.hang = { remove: joint.remove, hook: best };
    this.occupied[best] = item;
    ctx.audio.play('dropSoft', { x: hook.x, pitch: 1.4, volume: 0.5 });
    return true;
  }

  release(item: IngredientItem): void {
    const i = this.occupied.indexOf(item);
    if (i >= 0) this.occupied[i] = null;
  }

  override fixedUpdate(ctx: GameContext, dt: number): void {
    const temp = this.temperature;
    for (let i = 0; i < this.occupied.length; i++) {
      const item = this.occupied[i];
      if (!item) continue;
      if (!item.alive) {
        this.occupied[i] = null;
        continue;
      }
      // Items stay on their hook until taken down – left too long next to a
      // roaring fire, a dried wing still chars.
      const res = item.dryStep(ctx, temp, dt);
      if (res === 'dried') {
        ctx.bus.emit('toast', { text: t('toast.dried', { name: tr(item.def.name) }), kind: 'good' });
        ctx.audio.play('sparkle', { x: item.object.position.x });
      } else if (res === 'charred') {
        ctx.bus.emit('toast', { text: t('toast.charred', { name: tr(item.def.name) }), kind: 'bad' });
        ctx.vfx.smoke(item.object.position, '#262b44', 6, 0.8);
      }
    }
  }

  override netState(): unknown {
    return this.occupied.map((o) => (o && o.alive ? o.id : 0));
  }

  override applyNetState(ctx: GameContext, s: unknown): void {
    const ids = s as number[];
    for (let i = 0; i < this.occupied.length; i++) {
      const e = ids[i] ? ctx.net.resolve(ids[i]) : null;
      this.occupied[i] = e instanceof IngredientItem ? e : null;
    }
  }

  override update(ctx: GameContext, dt: number): void {
    const temp = this.temperature;
    for (const item of this.occupied) {
      if (!item || !item.alive) continue;
      const p = item.object.position;
      if (temp > 35) ctx.vfx.rate(`dry-${item.id}`, Math.min(4, (temp - 30) / 15), dt, () => ctx.vfx.steam(p, 0.05, 0.4, '#d8d0c0'));
      if (item.burn > 0.2) ctx.vfx.rate(`burn-${item.id}`, 4, dt, () => ctx.vfx.smoke(p, '#3a3040', 1, 0.4));
    }
  }

  serializeHung(): SavedEntity[] {
    return [];
  }
}
