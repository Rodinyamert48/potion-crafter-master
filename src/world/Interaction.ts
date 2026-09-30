// Pointer interaction: hover picking with highlight + tooltip, press/drag
// handlers ("grabs"), and the physics grab that carries items around by
// steering their Havok bodies with velocities (so held items still collide,
// push things and can be thrown).

import * as THREE from 'three';
import type { GameContext, UIHooks } from '../core/GameContext';
import type { Input } from '../core/Input';
import type { CursorKind, Entity } from './Entity';
import type { SurfaceInfo } from './World';
import { clamp, damp, smoothstep } from '../core/math';
import { t } from '../core/i18n';
import { CG } from '../physics/PhysicsTypes';
import { AssistVisuals, assistHint, defaultAssistTargets, type AssistTarget } from './Assist';

export interface Grab {
  readonly entity: Entity;
  update(ctx: GameContext, dt: number): void;
  fixedUpdate?(ctx: GameContext, dt: number): void;
  release(ctx: GameContext): void;
  cursor?: CursorKind;
  hint?(ctx: GameContext): string | null;
}

// ---------------------------------------------------------------------------
// Hover highlight: screen-space extruded back-face hull
// ---------------------------------------------------------------------------

const HULL_VERT = /* glsl */ `
  uniform float uWidth;
  uniform vec2 uResolution;
  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vec2 dir = length(n.xy) > 0.0001 ? normalize(n.xy) : vec2(0.0);
    clip.xy += dir * uWidth * 2.0 * clip.w / uResolution;
    gl_Position = clip;
  }
`;
const HULL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  void main() { gl_FragColor = vec4(uColor, 1.0); }
`;

export class Highlighter {
  private readonly material: THREE.ShaderMaterial;
  private hulls: THREE.Mesh[] = [];
  private current: Entity | null = null;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: HULL_VERT,
      fragmentShader: HULL_FRAG,
      uniforms: {
        uWidth: { value: 1.0 },
        uResolution: { value: new THREE.Vector2(960, 540) },
        uColor: { value: new THREE.Color('#fee761') },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
  }

  setResolution(w: number, h: number): void {
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(w, h);
  }

  set(e: Entity | null, color = '#fee761'): void {
    (this.material.uniforms.uColor.value as THREE.Color).set(color);
    if (e === this.current) return;
    for (const h of this.hulls) h.removeFromParent();
    this.hulls = [];
    this.current = e;
    if (!e) return;
    e.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible || m.userData.noHighlight || (m as unknown as THREE.Points).isPoints) return;
      const hull = new THREE.Mesh(m.geometry, this.material);
      hull.renderOrder = -1;
      hull.userData.noHighlight = true;
      hull.raycast = () => {};
      m.add(hull);
      this.hulls.push(hull);
    });
  }

  get target(): Entity | null {
    return this.current;
  }
}

// ---------------------------------------------------------------------------
// Physics grab
// ---------------------------------------------------------------------------

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class PhysicsGrab implements Grab {
  readonly target = new THREE.Vector3();
  readonly surfacePoint = new THREE.Vector3();
  surfaceTag: string | null = null;
  surfaceObject: THREE.Object3D | null = null;
  /** 0 upright … 1 fully tilted (pouring). */
  tilt = 0;
  yaw = 0;
  /** Entities may lower/raise their hold (dipping, tools). */
  heightOffset = 0;
  hoverHeight = 0.24;
  /** Override: when set, the item flies to this point instead. */
  overrideTarget: THREE.Vector3 | null = null;
  /** Stiffness multiplier for tools that must track the cursor tightly. */
  stiffness = 1;
  /** Entities may tilt themselves (e.g. the bucket pouring on its own). */
  autoTilt = 0;
  cursor: CursorKind = 'grabbing';
  /** Drop target the item is currently pulled toward (see Assist). */
  assist: AssistTarget | null = null;
  assistStrength = 0;
  readonly assistPoint = new THREE.Vector3();
  hasSurface = false;
  private readonly vel = new THREE.Vector3();
  private readonly ang = new THREE.Vector3();
  private readonly lastTarget = new THREE.Vector3();
  private smoothY: number | null = null;
  private released = false;
  private readonly filter: { group: number; mask: number } | null = null;
  /** Seconds the item has been blocked on its way to the cursor. */
  private stuckT = 0;
  /** Collision mask to restore after squeezing past an obstacle. */
  private unstickMask: number | null = null;
  /** Extra height the player gave the item with R (up) / F (down). */
  lift = 0;

  constructor(
    readonly entity: Entity,
    ctx: GameContext,
  ) {
    const b = entity.body!;
    b.getPosition(this.target);
    this.lastTarget.copy(this.target);
    b.setGravityFactor(0);
    b.setDamping(3, 5);
    const q = b.getRotation(new THREE.Quaternion());
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    this.yaw = e.y;
    if (entity.ghostWhenHeld) {
      this.filter = { group: b.group, mask: b.mask };
      b.setCollisionFilter(b.group, CG.STATIC);
    }
    entity.held = true;
    entity.onPicked(ctx);
  }

  hint(ctx: GameContext): string | null {
    return (
      (this.assist ? assistHint(this.assist) : null) ??
      ctx.interaction.heldHint(this.entity) ??
      t(ctx.input.pointer.type !== 'mouse' ? 'hint.liftTouch' : 'hint.lift')
    );
  }

  private popT = 0;

  update(ctx: GameContext, dt: number): void {
    const ia = ctx.interaction;
    // A little "pop" when an item is picked up.
    if (this.entity.ghostWhenHeld && this.popT < 0.28) {
      this.popT += dt;
      this.entity.object.scale.setScalar(1 + 0.16 * Math.sin(Math.min(1, this.popT / 0.28) * Math.PI));
    }
    // Rotation with Q/E or wheel while holding.
    if (ctx.input.isDown('KeyQ')) this.yaw += dt * 2.5;
    if (ctx.input.isDown('KeyE')) this.yaw -= dt * 2.5;
    if (ctx.input.wheel !== 0) this.yaw -= ctx.input.wheel * 0.004;

    const hit = ia.surfaceUnderPointer(this.entity);
    this.hasSurface = !!hit;
    if (hit) {
      const info = hit.object.userData.surface as SurfaceInfo;
      this.surfaceTag = info.tag ?? null;
      this.surfaceObject = hit.object;
      this.surfacePoint.copy(hit.point);
      const h = this.hoverHeight + (info.hover ?? 0) + this.entity.halfHeight + this.heightOffset;
      // Smooth the carry height: rise quickly over obstacles, settle gently,
      // so sweeping across table edges doesn't make the item jump.
      const want = hit.point.y + h;
      this.smoothY = this.smoothY === null ? want : damp(this.smoothY, want, want > this.smoothY ? 22 : 11, dt);
      this.target.set(hit.point.x, this.smoothY, hit.point.z);
      this.lastTarget.copy(this.target);
    } else {
      this.surfaceTag = null;
      this.surfaceObject = null;
      // Keep the current height and follow the pointer on that plane.
      const plane = new THREE.Plane(UP, -this.lastTarget.y);
      if (ia.ray.intersectPlane(plane, tmpV)) this.target.copy(tmpV);
    }
    this.applyAssist(ctx, dt);
    // R raises the carried item, F lowers it (on touch: the ▲ ▼ buttons).
    const lift = (ctx.input.isDown('KeyR') ? 1 : 0) - (ctx.input.isDown('KeyF') ? 1 : 0);
    if (lift !== 0) this.lift = clamp(this.lift + lift * 1.2 * dt, -0.8, 1.8);
    this.target.y += this.lift;
    const b = ctx.shopBounds;
    this.target.x = clamp(this.target.x, b.minX, b.maxX);
    this.target.z = clamp(this.target.z, b.minZ, b.maxZ);
    this.target.y = clamp(this.target.y, 0.1, 3.0);

    const tiltTarget = this.entity.tiltable ? Math.max(ctx.input.actionHeld ? 1 : 0, this.autoTilt) : 0;
    this.tilt += (tiltTarget - this.tilt) * Math.min(1, dt * 6);

    this.entity.onHeld(ctx, dt);
  }

  /** Pull toward the nearest drop target that wants this item. */
  private applyAssist(ctx: GameContext, dt: number): void {
    this.assist = null;
    if (this.overrideTarget) {
      this.assistStrength = damp(this.assistStrength, 0, 10, dt);
      return;
    }
    let best: AssistTarget | null = null;
    let bestPoint: THREE.Vector3 | null = null;
    let bestK = 1;
    for (const a of ctx.interaction.assists) {
      if (!a.accepts(ctx, this.entity)) continue;
      const p = a.point(ctx, this.entity);
      if (!p) continue;
      const d = Math.hypot(this.target.x - p.x, this.target.z - p.z) / a.radius;
      if (d < bestK) {
        bestK = d;
        best = a;
        bestPoint = p;
      }
    }
    const pull = best ? smoothstep(1, 0.6, bestK) : 0;
    this.assistStrength = damp(this.assistStrength, pull, 12, dt);
    if (!best || !bestPoint) return;
    this.assistPoint.copy(bestPoint);
    const k = this.assistStrength;
    this.target.x += (bestPoint.x - this.target.x) * k;
    this.target.z += (bestPoint.z - this.target.z) * k;
    const snapY = bestPoint.y + best.hover + this.entity.halfHeight;
    this.target.y += (Math.max(snapY, Math.min(this.target.y, snapY + 0.3)) - this.target.y) * k;
    if (this.assistStrength > 0.45) this.assist = best;
  }

  fixedUpdate(ctx: GameContext, _dt: number): void {
    const body = this.entity.body;
    if (!body || !body.alive || this.released) return;
    const goal = this.overrideTarget ?? this.target;
    const pos = body.getPosition(tmpV);
    const k = 17 * this.stiffness;
    this.vel.subVectors(goal, pos).multiplyScalar(k);
    // Rise before travelling and travel before descending, so carried things
    // clear cauldron rims, barrel staves and table edges instead of snagging.
    const dy = goal.y - pos.y;
    const horiz = Math.hypot(goal.x - pos.x, goal.z - pos.z);
    if (dy > 0.1) {
      const s = clamp(1 - (dy - 0.1) / 0.4, 0.4, 1);
      this.vel.x *= s;
      this.vel.z *= s;
    } else if (dy < -0.1 && horiz > 0.12) {
      this.vel.y *= clamp(1 - (horiz - 0.12) / 0.3, 0.15, 1);
    }
    const max = 9 * Math.max(1, this.stiffness * 0.8);
    if (this.vel.length() > max) this.vel.setLength(max);
    this.unstick(body, goal, pos, _dt);
    body.getLinearVelocity(tmpV2);
    tmpV2.lerp(this.vel, 0.8);
    body.setLinearVelocity(tmpV2);

    if (this.entity.upright) {
      // Target orientation: yaw, then tilt around the camera's viewing axis so
      // pouring reads clearly on screen.
      tmpQ.setFromAxisAngle(UP, this.yaw);
      if (this.tilt > 0.001) {
        const fwd = ctx.interaction.viewAxis;
        tmpQ2.setFromAxisAngle(fwd, -this.tilt * 1.95);
        tmpQ.premultiply(tmpQ2);
      }
      const cur = body.getRotation(tmpQ2);
      const err = tmpQ.clone().multiply(cur.clone().invert());
      if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w);
      const angle = 2 * Math.acos(clamp(err.w, -1, 1));
      const s = Math.sqrt(1 - err.w * err.w);
      if (s > 1e-4) this.ang.set(err.x / s, err.y / s, err.z / s).multiplyScalar(angle * 12);
      else this.ang.set(0, 0, 0);
      if (this.ang.length() > 16) this.ang.setLength(16);
      body.setAngularVelocity(this.ang);
    }
  }

  /** Something (a table edge, the underside of a shelf) keeps the item from
   *  reaching the cursor: let it slip through the furniture until it is back
   *  where it should be, then make it solid again. */
  private unstick(body: NonNullable<Entity['body']>, goal: THREE.Vector3, pos: THREE.Vector3, dt: number): void {
    const dist = goal.distanceTo(pos);
    if (this.unstickMask !== null) {
      if (dist < 0.1 || this.stuckT > 2.5) {
        body.setCollisionFilter(body.group, this.unstickMask);
        this.unstickMask = null;
        this.stuckT = 0;
      } else this.stuckT += dt;
      return;
    }
    body.getLinearVelocity(tmpV2);
    // Only when it is held back on its way up or across – pressing an item
    // down onto something (a knife on the board) must stay solid.
    const blocked = dist > 0.22 && tmpV2.length() < 0.35 && goal.y > pos.y - 0.05;
    this.stuckT = blocked ? this.stuckT + dt : Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.3) {
      this.unstickMask = body.mask;
      this.stuckT = 0;
      body.setCollisionFilter(body.group, 0);
    }
  }

  release(ctx: GameContext): void {
    if (this.released) return;
    this.released = true;
    const body = this.entity.body;
    this.entity.held = false;
    if (body && body.alive && this.unstickMask !== null) {
      body.setCollisionFilter(body.group, this.unstickMask);
      this.unstickMask = null;
    }
    if (this.entity.ghostWhenHeld) this.entity.object.scale.setScalar(1);
    if (body && body.alive) {
      if (this.filter) body.setCollisionFilter(this.filter.group, this.filter.mask);
      body.setGravityFactor(1);
      body.setDamping(0.05, 0.1);
      body.getLinearVelocity(tmpV);
      if (tmpV.length() > 5.5) {
        tmpV.setLength(5.5);
        body.setLinearVelocity(tmpV);
      }
      // Dropped on a target: land on it instead of bouncing off.
      if (this.assist?.drop && !this.overrideTarget) this.assist.drop(ctx, this.entity);
    }
    this.entity.onReleased(ctx);
  }
}

// ---------------------------------------------------------------------------
// Interaction manager
// ---------------------------------------------------------------------------

/** Things somebody (any player's hand) is holding or working right now. */
export const busyEntities = new Set<Entity>();

/** Hints for carried things, shared by every hand (see registerHeldHint). */
const heldHints = new Map<string, (e: Entity, ctx: GameContext) => string | null>();

export interface InteractionOptions {
  /** Pointer/keyboard of this hand (default: the local player's input). */
  input?: Input;
  /** Camera the pointer looks through (default: the shop camera). */
  camera?: () => THREE.Camera;
  /** Where cursor/tooltip/hint go (default: the local UI). */
  ui?: Pick<UIHooks, 'setCursor' | 'tooltip' | 'setHint'>;
  /** Another player's hand: no highlight outline, no drop-target glow. */
  remote?: boolean;
}

/** An online guest does not act locally: presses go to the host instead
 *  (button 0/2 pressed, or -1/-3 for released). */
export type PressForward = (button: number, entity: Entity | null) => void;

export class Interaction {
  readonly raycaster = new THREE.Raycaster();
  readonly ray = new THREE.Ray();
  hovered: Entity | null = null;
  hoverHit: THREE.Intersection | null = null;
  grab: Grab | null = null;
  readonly highlighter = new Highlighter();
  /** Horizontal viewing axis (into the screen) for tilting held containers. */
  readonly viewAxis = new THREE.Vector3(0, 0, -1);
  /** Disable while menus are open. */
  enabled = true;
  /** Magnetic drop targets for carried items. */
  readonly assists: AssistTarget[] = defaultAssistTargets();
  private visuals: AssistVisuals | null = null;
  readonly input: Input;
  private readonly camera: () => THREE.Camera;
  private readonly ui: Pick<UIHooks, 'setCursor' | 'tooltip' | 'setHint'>;
  readonly remote: boolean;
  /** Online guest: presses are sent to the host (nothing is grabbed here). */
  forward: PressForward | null = null;
  /** Online guest: what the host says this player's hand is holding. */
  remoteGrab: { cursor: CursorKind; hint: string | null } | null = null;

  constructor(
    private readonly ctx: GameContext,
    opts: InteractionOptions = {},
  ) {
    this.input = opts.input ?? ctx.input;
    this.camera = opts.camera ?? (() => ctx.renderer.rig.camera);
    this.ui = opts.ui ?? ctx.ui;
    this.remote = !!opts.remote;
    this.input.onPointerDown((button) => this.pointerDown(button));
    this.input.onPointerUp((button) => this.pointerUp(button));
  }

  registerHeldHint(kind: string, fn: (e: Entity, ctx: GameContext) => string | null): void {
    heldHints.set(kind, fn);
  }

  heldHint(e: Entity): string | null {
    return heldHints.get(e.kind)?.(e, this.ctx) ?? null;
  }

  startPhysicsGrab(e: Entity): PhysicsGrab {
    return new PhysicsGrab(e, this.ctx);
  }

  /** Begin holding a freshly spawned entity (e.g. taken from a jar). */
  beginHold(grab: Grab): void {
    if (this.grab) this.endGrab(this.grab);
    this.setGrab(grab);
    this.highlighter.set(null);
  }

  private setGrab(grab: Grab): void {
    this.grab = grab;
    busyEntities.add(grab.entity);
  }

  private endGrab(g: Grab): void {
    busyEntities.delete(g.entity);
    g.release(this.ctx);
  }

  updateRay(): void {
    const p = this.input.pointer;
    const cam = this.camera();
    this.raycaster.setFromCamera(new THREE.Vector2(p.ndcX, p.ndcY), cam);
    this.ray.copy(this.raycaster.ray);
    cam.getWorldDirection(this.viewAxis);
    this.viewAxis.y = 0;
    if (this.viewAxis.lengthSq() < 1e-6) this.viewAxis.set(0, 0, -1);
    this.viewAxis.normalize();
  }

  pick(prefer?: Entity | null): { entity: Entity; hit: THREE.Intersection } | null {
    // A remote player's press names what they pointed at: try that first.
    if (prefer && prefer.alive && prefer.interactive && !busyEntities.has(prefer)) {
      const own = this.raycaster.intersectObject(prefer.object, true).find((h) => !h.object.userData.noPick);
      if (own) return { entity: prefer, hit: own };
    }
    const hits = this.raycaster.intersectObjects(this.ctx.world.pickables, true);
    for (const h of hits) {
      if (h.object.userData.noPick) continue;
      const e = this.ctx.world.entityFromObject(h.object);
      if (!e || !e.interactive || !e.alive) continue;
      if (this.grab && e === this.grab.entity) continue;
      // Someone else is holding it (online guests learn that from the host).
      if (busyEntities.has(e) || (this.forward && e.held)) continue;
      return { entity: e, hit: h };
    }
    return null;
  }

  surfaceUnderPointer(exclude: Entity | null): THREE.Intersection | null {
    const hits = this.raycaster.intersectObjects(this.ctx.world.surfaces, false);
    for (const h of hits) {
      if (exclude && this.ctx.world.entityFromObject(h.object) === exclude) continue;
      if (h.face && h.face.normal.y < -0.2 && h.object.userData.surface?.tag !== 'cauldron') continue;
      return h;
    }
    return null;
  }

  /** Entity a remote player pointed at when pressing (see pick). */
  preferNext: Entity | null = null;

  private pointerDown(button: number): void {
    if (!this.enabled) return;
    this.updateRay();
    const prefer = this.preferNext;
    this.preferNext = null;
    if (this.grab) return;
    if (this.forward) {
      // Online guest: the host does the pressing (a right press while
      // carrying something tilts it, so that goes too).
      if (button !== 0 && button !== 2) return;
      const holding = !!this.remoteGrab;
      const picked = holding ? null : this.pick();
      if (button === 2) this.altConsumed = !!picked || holding;
      if (button === 0) {
        this.emptyPress = !picked && !holding;
        this.longPress =
          !holding && picked && this.input.pointer.type !== 'mouse' ? { entity: picked.entity, t: 0, x: this.input.pointer.x, y: this.input.pointer.y } : null;
      }
      this.forward(button, picked?.entity ?? null);
      return;
    }
    if (button === 2) {
      // Right click: secondary action (e.g. the cat's customization).
      const picked = this.pick(prefer);
      if (picked?.entity.altPress(this.ctx)) this.altConsumed = true;
      return;
    }
    if (button !== 0) return;
    const picked = this.pick(prefer);
    // Pressing on empty floor lets a drag pan the camera (touch & mouse).
    this.emptyPress = !picked;
    if (!picked) return;
    const input = this.input;
    // On touch screens a long press stands in for the right click (another
    // player's long press arrives as a right press).
    this.longPress =
      !this.remote && input.pointer.type !== 'mouse' ? { entity: picked.entity, t: 0, x: input.pointer.x, y: input.pointer.y } : null;
    const grab = picked.entity.press(this.ctx, picked.hit);
    if (grab) {
      this.setGrab(grab);
      this.highlighter.set(null);
      this.longPress = null;
    }
  }

  /** True while a right press was used by an entity (so it doesn't pan). */
  altConsumed = false;
  /** The current left press started on nothing in particular. */
  emptyPress = false;
  private longPress: { entity: Entity; t: number; x: number; y: number } | null = null;

  private pointerUp(button: number): void {
    if (button === 2) this.altConsumed = false;
    if (button === 0) {
      this.longPress = null;
      this.emptyPress = false;
    }
    if (this.forward && (button === 0 || button === 2)) this.forward(-1 - button, null);
    if (button !== 0 || !this.grab) return;
    const g = this.grab;
    this.grab = null;
    this.endGrab(g);
  }

  cancelGrab(): void {
    if (!this.grab) return;
    const g = this.grab;
    this.grab = null;
    this.endGrab(g);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const ui = this.ui;
    this.updateRay();
    this.highlighter.setResolution(ctx.renderer.lowWidth, ctx.renderer.lowHeight);
    const lp = this.longPress;
    if (lp) {
      const p = this.input.pointer;
      lp.t += dt;
      if (!p.down[0] || this.grab || this.remoteGrab || Math.hypot(p.x - lp.x, p.y - lp.y) > 14) this.longPress = null;
      else if (lp.t > 0.5) {
        this.longPress = null;
        if (lp.entity.alive) {
          if (this.forward) {
            this.forward(2, lp.entity);
            this.forward(-3, null);
          } else lp.entity.altPress(ctx);
        }
      }
    }
    if (!this.remote) {
      this.visuals ??= new AssistVisuals(ctx.scene);
      const pg = this.grab instanceof PhysicsGrab && this.grab.entity.alive ? this.grab : null;
      this.visuals.update(
        dt,
        pg && pg.hasSurface && pg.assistStrength < 0.3 && !pg.overrideTarget ? pg.surfacePoint : null,
        pg && pg.assistStrength > 0.05 ? pg.assistPoint : null,
        pg?.assistStrength ?? 0,
      );
    }
    if (this.grab) {
      if (!this.grab.entity.alive) {
        this.cancelGrab();
      } else {
        this.grab.update(ctx, dt);
        ui.setCursor(this.grab.cursor ?? 'grabbing');
        ui.tooltip(null);
        ui.setHint(this.grab.hint?.(ctx) ?? null);
        return;
      }
    }
    // Online guest holding something on the host.
    if (this.remoteGrab) {
      this.setHover(null, null);
      ui.setCursor(this.remoteGrab.cursor);
      ui.tooltip(null);
      ui.setHint(this.remoteGrab.hint);
      return;
    }
    ui.setHint(null);
    if (!this.enabled || !this.input.pointer.valid || !this.input.pointer.inside) {
      this.setHover(null, null);
      ui.tooltip(null);
      ui.setCursor('default');
      return;
    }
    const picked = this.pick();
    this.setHover(picked?.entity ?? null, picked?.hit ?? null);
    if (this.hovered) {
      ui.setCursor(this.hovered.cursor());
      ui.tooltip(this.hovered.hover(ctx), this.input.pointer.x, this.input.pointer.y);
    } else {
      ui.setCursor('default');
      ui.tooltip(null);
    }
  }

  fixedUpdate(dt: number): void {
    if (this.grab?.fixedUpdate && this.grab.entity.alive) this.grab.fixedUpdate(this.ctx, dt);
  }

  private setHover(e: Entity | null, hit: THREE.Intersection | null): void {
    this.hovered = e;
    this.hoverHit = hit;
    if (!this.remote) this.highlighter.set(e);
  }
}
