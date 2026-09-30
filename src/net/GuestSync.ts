// Playing in someone else's room. The guest's shop is a copy of the host's:
// the stations are built here too and take on the host's state, items and
// characters appear as the host sends them, and everything this player does
// with the pointer goes to the host, whose game does it for real.

import * as THREE from 'three';
import type Peer from 'peerjs';
import type { GameContext, PanelName } from '../core/GameContext';
import type { App } from '../App';
import type { Entity } from '../world/Entity';
import { IngredientItem } from '../gameplay/ingredients/IngredientItem';
import { FlaskItem } from '../gameplay/potion/FlaskItem';
import { LogItem } from '../gameplay/stations/ShopFixtures';
import { Coin } from '../gameplay/customers/CustomerSystem';
import { INGREDIENTS } from '../data/ingredients';
import type { PrepState } from '../data/types';
import type { PotionResult } from '../gameplay/potion/PotionEvaluator';
import { clamp } from '../core/math';
import { t } from '../core/i18n';
import { PROTOCOL, type Link, type NetErrorCode } from './Transport';
import type { NetDriver, NetPlayer } from './NetSession';
import { FORWARD_KEYS, FX_METHODS, spritesOf } from './HostSync';
import { GUEST_PANELS } from './RemoteHand';
import { Puppet, SheetRegistry } from './Puppet';
import { q3, q4, type GuestMsg, type HostMsg, type HudInfo, type InputState, type NetEvent, type SpawnRec, type TickMsg, type WelcomeMsg } from './Protocol';

/** Menus that belong to the host (the cat's wardrobe, trips, the admin menu…). */
const HOST_ONLY = new Set<string>(['door', 'admin', 'cat', 'pet', 'map', 'seeds', 'outpause', 'minigame']);

interface Target {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  snap: boolean;
}

export class GuestSync implements NetDriver {
  private readonly mirrors = new Map<number, Entity>();
  /** Local entity id → host id. */
  private readonly hostIds = new Map<number, number>();
  /** Host id → key of things both sides build (stations, furniture). */
  private readonly keyOf = new Map<number, string>();
  private readonly hostOfKey = new Map<string, number>();
  private readonly keyed = new Map<string, Entity>();
  private readonly targets = new Map<Entity, Target>();
  private readonly sheets = new SheetRegistry();
  /** Host bubble id → ours. */
  private readonly bubbles = new Map<number, number>();
  private readonly inbox: HostMsg[] = [];
  private readonly restore: Array<() => void> = [];
  private welcomed = false;
  private ended = false;
  private lastInKey = '';
  private lastInT = 0;
  private readonly keysDown = new Set<string>();
  private pingT = 0;
  private lastHeard = performance.now();
  /** Round trip to the host (ms). */
  rtt = 0;
  onWelcome: (() => void) | null = null;
  onEnd: ((why: NetErrorCode) => void) | null = null;
  onPlayers: ((list: NetPlayer[], before: NetPlayer[]) => void) | null = null;
  onChat: ((from: number, text: string) => void) | null = null;
  onMarkers: ((mk: number[][]) => void) | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly app: App,
    readonly peer: Peer,
    readonly link: Link,
    name: string,
  ) {
    link.onMessage((m) => {
      this.lastHeard = performance.now();
      this.inbox.push(m as unknown as HostMsg);
    });
    link.onClose(() => this.end('closed'));
    this.send({ t: 'hello', v: PROTOCOL, name });
  }

  send(m: GuestMsg): void {
    if (!this.ended) this.link.send(m);
  }

  // -------------------------------------------------------------------------
  // Becoming a copy of the host's shop
  // -------------------------------------------------------------------------

  private becomeGuest(): void {
    const ctx = this.ctx;
    const app = this.app;
    const net = ctx.net;
    net.role = 'guest';
    // This player's own save stays untouched.
    app.save.enabled = false;
    app.save.active = false;
    // Items and characters come from the host.
    for (const e of [...ctx.world.entities.values()]) {
      if (spritesOf(e).length || e instanceof IngredientItem || e instanceof FlaskItem || e instanceof LogItem || e.kind === 'coin') ctx.world.remove(e);
    }
    ctx.world.flush(ctx);
    ctx.interaction.cancelGrab();
    for (const e of ctx.world.entities.values()) {
      if (e.netKey) this.keyed.set(e.netKey, e);
      // Tools and the bucket follow the host's hands.
      if (e.netKey && e.draggable && e.body?.motion === 'dynamic') this.guestize(e);
    }
    net.resolve = (id) => this.resolve(id);
    this.installHooks();
    this.patchOrders();
    ctx.interaction.forward = (button, entity) => {
      const s = this.inputState();
      if (button >= 0) this.send({ t: 'dn', b: button, e: entity ? this.hostIdOf(entity) : null, s });
      else this.send({ t: 'up', b: -1 - button, s });
    };
    this.restore.push(() => (ctx.interaction.forward = null));
    ctx.input.onWheel((dy) => {
      if (!this.ended && net.remoteHolding && app.game.playing && !ctx.ui.panelOpen) this.send({ t: 'wh', d: Math.round(dy) });
    });
  }

  /** Copies never fall or collide on their own: the host moves them. */
  private guestize(e: Entity): void {
    const b = e.body;
    if (!b) return;
    this.ctx.sync.unlink(b);
    if (b.motion !== 'static') b.setMotion('kinematic');
    b.setCollisionFilter(b.group, 0);
  }

  private installHooks(): void {
    const ctx = this.ctx;
    const net = ctx.net;
    // In the game loop only what the host sent, the copies' own looks and
    // this player's menus make sounds and sparks.
    const blocked = () => net.sim > 0 && net.allow === 0;
    const patch = (obj: object, key: string, make: (orig: (...a: never[]) => unknown) => (...a: never[]) => unknown) => {
      const o = obj as Record<string, unknown>;
      const orig = (o[key] as (...a: never[]) => unknown).bind(obj);
      o[key] = make(orig);
      this.restore.push(() => delete o[key]);
    };
    patch(ctx.audio, 'play', (orig) => ((...a: never[]) => (blocked() ? undefined : orig(...a))) as never);
    patch(ctx.voice, 'babble', (orig) => ((...a: never[]) => (blocked() ? 0 : orig(...a))) as never);
    for (const name of FX_METHODS) patch(ctx.vfx, name, (orig) => ((...a: never[]) => (blocked() ? undefined : orig(...a))) as never);
    patch(ctx.debris, 'glass', (orig) => ((...a: never[]) => (blocked() ? undefined : orig(...a))) as never);
    patch(ctx.debris, 'chunks', (orig) => ((...a: never[]) => (blocked() ? undefined : orig(...a))) as never);
    const ui = this.app.game.ui;
    patch(ui, 'say', (orig) => ((...a: never[]) => (blocked() ? -1 : orig(...a))) as never);
    patch(ui, 'floatText', (orig) => ((...a: never[]) => (blocked() ? undefined : orig(...a))) as never);
    patch(ui, 'openPanel', (orig) => ((panel: PanelName | null) => {
      if (panel && HOST_ONLY.has(panel)) {
        ui.toast(t('net.hostOnly'), 'warn');
        return;
      }
      orig(...([panel] as never[]));
    }) as never);
    patch(ctx.bus, 'emit', (orig) => ((type: string, payload: unknown) => {
      if (blocked() && (type === 'toast' || type === 'shake' || type === 'flash' || type === 'chaos')) return;
      orig(...([type, payload] as never[]));
    }) as never);
    ctx.world.wrapUpdate = (_e, run) => {
      net.allow++;
      try {
        run();
      } finally {
        net.allow--;
      }
    };
    this.restore.push(() => (ctx.world.wrapUpdate = null));
  }

  /** Shop menus place their orders with the host. */
  private patchOrders(): void {
    const app = this.app;
    const order = (c: string, ...a: unknown[]) => this.send({ t: 'cmd', c, a });
    const over = (obj: object, key: string, fn: (...a: never[]) => unknown) => {
      const o = obj as Record<string, unknown>;
      o[key] = fn;
      this.restore.push(() => delete o[key]);
    };
    over(app.shopSystem, 'buyIngredient', ((id: string) => (order('buyIngredient', id), true)) as never);
    over(app.shopSystem, 'buySupply', ((kind: string) => (order('buySupply', kind), true)) as never);
    over(app.shopSystem, 'buyUpgrade', ((id: string) => (order('buyUpgrade', id), true)) as never);
    over(app.furniture, 'buy', ((id: string, slot: string) => (order('buyFurniture', id, slot), true)) as never);
    over(app.furniture, 'remove', ((slot: string) => order('removeFurniture', slot)) as never);
    over(app.merchant, 'buy', ((id: string) => (order('merchantBuy', id), true)) as never);
    over(app.merchant, 'sell', ((f: Entity) => {
      const id = this.hostIds.get(f.id);
      if (id) order('merchantSell', id);
      return true;
    }) as never);
    over(app.merchant, 'teach', ((id: string) => (order('merchantTeach', id), true)) as never);
    over(app.king, 'answer', ((gift: boolean) => (order('king', gift ? 1 : 0), null)) as never);
  }

  // -------------------------------------------------------------------------
  // Ids
  // -------------------------------------------------------------------------

  resolve(hostId: number): Entity | null {
    const m = this.mirrors.get(hostId);
    if (m) return m.alive ? m : null;
    const key = this.keyOf.get(hostId);
    if (!key) return null;
    let e = this.keyed.get(key);
    if (!e || !e.alive) {
      // Built later (furniture bought after joining).
      e = undefined;
      for (const x of this.ctx.world.entities.values()) {
        if (x.alive && x.netKey === key) {
          e = x;
          break;
        }
      }
      if (e) this.keyed.set(key, e);
    }
    return e ?? null;
  }

  private hostIdOf(e: Entity): number | null {
    const id = this.hostIds.get(e.id);
    if (id !== undefined) return id;
    return e.netKey ? (this.hostOfKey.get(e.netKey) ?? null) : null;
  }

  private addKey(id: number, key: string): void {
    const old = this.hostOfKey.get(key);
    if (old !== undefined && old !== id) this.keyOf.delete(old);
    this.keyOf.set(id, key);
    this.hostOfKey.set(key, id);
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  update(dt: number): void {
    if (this.ended) return;
    const net = this.ctx.net;
    net.allow++;
    try {
      for (const m of this.inbox.splice(0)) {
        try {
          this.handle(m);
        } catch (err) {
          console.error('[net] could not apply', m.t, err);
        }
        if (this.ended) return;
      }
    } finally {
      net.allow--;
    }
    if (!this.welcomed) return;
    this.smooth(dt);
    if (this.app.game.playing) {
      this.sendInput();
      this.sendKeys();
    }
    this.pingT -= dt;
    if (this.pingT <= 0) {
      this.pingT = 2;
      this.send({ t: 'ping', ts: performance.now() });
    }
    // Nothing from the host for a long while: it is gone.
    if (performance.now() - this.lastHeard > 20000) this.end('timeout');
  }

  private handle(m: HostMsg): void {
    switch (m.t) {
      case 'welcome':
        if (!this.welcomed) this.welcome(m);
        break;
      case 'tick':
        if (this.welcomed) this.tick(m);
        break;
      case 'sheet':
        this.sheets.add(m);
        break;
      case 'players':
        this.setPlayers(m.list);
        break;
      case 'chat':
        this.onChat?.(m.from, m.x);
        break;
      case 'panel':
        if (GUEST_PANELS.has(m.p)) this.app.game.ui.openPanel(m.p as PanelName);
        break;
      case 'pong':
        this.rtt = Math.round(performance.now() - m.ts);
        break;
      case 'reject':
        this.end(m.r === 'full' ? 'full' : m.r === 'version' ? 'version' : 'closed');
        break;
      case 'bye':
        this.end('closed');
        break;
    }
  }

  private setPlayers(list: NetPlayer[]): void {
    const net = this.ctx.net;
    const before = net.players;
    net.players = list;
    this.onPlayers?.(list, before);
  }

  private welcome(m: WelcomeMsg): void {
    const ctx = this.ctx;
    this.becomeGuest();
    const net = ctx.net;
    net.selfId = m.you;
    net.code = m.code;
    this.setPlayers(m.players);
    for (const s of m.sheets) this.sheets.add(s);
    this.applyGameState(m.state);
    ctx.state.hour = m.hr;
    for (const [id, key] of m.statics) this.addKey(id, key);
    for (const r of m.spawn) this.spawn(r);
    for (const tf of m.tf) this.setTarget(tf, true);
    for (const [id, st] of m.es) this.applyEntityState(id, st);
    this.applyHud(m.hud);
    this.welcomed = true;
    this.onWelcome?.();
  }

  private tick(m: TickMsg): void {
    const ctx = this.ctx;
    ctx.state.hour = m.hr;
    if (m.gs) this.applyGameState(m.gs);
    if (m.sk) for (const [id, key] of m.sk) this.addKey(id, key);
    if (m.sp) for (const r of m.sp) this.spawn(r);
    if (m.rm) for (const id of m.rm) this.despawn(id);
    if (m.tf) for (const tf of m.tf) this.setTarget(tf, false);
    if (m.es) for (const [id, st] of m.es) this.applyEntityState(id, st);
    if (m.pp) {
      for (const [id, ps] of m.pp) {
        const e = this.mirrors.get(id);
        if (e instanceof Puppet) e.apply(ps);
      }
    }
    if (m.ph) {
      for (const [id, hv, cu, it] of m.ph) {
        const e = this.mirrors.get(id);
        if (e instanceof Puppet) {
          e.info = hv;
          e.cursorKind = cu;
          e.interactive = !!it;
        }
      }
    }
    if (m.hud) this.applyHud(m.hud);
    if (m.ev) for (const ev of m.ev) this.replay(ev);
    if (m.hand) {
      const h = m.hand;
      ctx.net.remoteHolding = !!h.h;
      ctx.interaction.remoteGrab = h.h ? { cursor: h.cu, hint: h.hint } : null;
    }
    if (m.mk) this.onMarkers?.(m.mk);
  }

  private applyGameState(gs: Record<string, unknown>): void {
    const ctx = this.ctx;
    const st = ctx.state;
    const money = st.money;
    const stock = { ...st.stock };
    const furniture = JSON.stringify(st.furniture);
    const upgrades = st.upgrades.join();
    st.load({ ...st.toJSON(), ...gs });
    if (st.money !== money) ctx.bus.emit('money', { money: st.money, delta: st.money - money });
    for (const [id, n] of Object.entries(st.stock)) if (stock[id] !== n) ctx.bus.emit('stock', { id, count: n });
    if (JSON.stringify(st.furniture) !== furniture) {
      this.app.furniture.sync();
      this.keyed.clear();
    }
    if (st.upgrades.join() !== upgrades) this.app.shopSystem.apply();
  }

  private applyHud(h: HudInfo): void {
    const app = this.app;
    app.hud.remote = h;
    app.hud.showTutorial(h.tu);
    app.merchant.showStall(!!h.ms);
    // The day's summary shows here too; the host decides when the next day starts.
    const ui = app.game.ui;
    const summary = ui.getPanel('summary');
    if (h.sm && !summary?.isOpen) ui.openPanel('summary');
    else if (!h.sm && summary?.isOpen) {
      summary.close();
      this.ctx.bus.emit('ui:panel', { panel: null });
    }
  }

  // -------------------------------------------------------------------------
  // Copies of the host's things
  // -------------------------------------------------------------------------

  private spawn(r: SpawnRec): void {
    if (this.mirrors.has(r.id)) return;
    const ctx = this.ctx;
    // (tf: host id, x, y, z, qx, qy, qz, qw – like the ticks' transforms)
    const pos = { x: r.tf[1], y: r.tf[2], z: r.tf[3] };
    const rot = new THREE.Quaternion(r.tf[4], r.tf[5], r.tf[6], r.tf[7]);
    let e: Entity | null = null;
    if (r.k === 'ingredient') {
      const d = r.d as { i: string; s: PrepState; m: number };
      if (d && INGREDIENTS[d.i]) e = new IngredientItem(ctx, d.i, d.s, d.m, pos, rot);
    } else if (r.k === 'flask') e = new FlaskItem(ctx, pos, (r.d as { p: PotionResult | null } | null)?.p ?? null);
    else if (r.k === 'log') e = new LogItem(ctx, pos);
    else if (r.k === 'puppet') {
      const p = new Puppet(this.sheets);
      p.info = r.hv ?? null;
      p.cursorKind = r.cu ?? 'point';
      e = p;
    }
    if (!e) return;
    e.object.position.set(pos.x, pos.y, pos.z);
    e.object.quaternion.copy(rot);
    ctx.world.add(e, ctx);
    // (Added as pointable; whether it listens right now comes from the host.)
    if (e instanceof Puppet) e.interactive = r.it !== 0;
    this.guestize(e);
    this.mirrors.set(r.id, e);
    this.hostIds.set(e.id, r.id);
    this.targets.set(e, { p: new THREE.Vector3(pos.x, pos.y, pos.z), q: rot.clone(), snap: true });
    if (e instanceof Puppet && r.pu) e.apply(r.pu);
    else if (r.st !== undefined && r.st !== null) this.applyEntityState(r.id, r.st);
  }

  private despawn(id: number): void {
    const e = this.mirrors.get(id);
    if (!e) return;
    this.mirrors.delete(id);
    this.hostIds.delete(e.id);
    this.targets.delete(e);
    this.ctx.world.remove(e);
  }

  private setTarget(tf: number[], snap: boolean): void {
    const e = this.resolve(tf[0]);
    if (!e) return;
    let tg = this.targets.get(e);
    if (!tg) {
      tg = { p: new THREE.Vector3(), q: new THREE.Quaternion(), snap: true };
      this.targets.set(e, tg);
    }
    tg.p.set(tf[1], tf[2], tf[3]);
    tg.q.set(tf[4], tf[5], tf[6], tf[7]);
    if (snap) tg.snap = true;
  }

  private applyEntityState(id: number, st: unknown): void {
    const e = this.resolve(id);
    if (!e) return;
    e.applyNetState(this.ctx, st);
    // An ingredient changing shape builds a new body.
    if (e.body && e.body.motion === 'dynamic' && (this.hostIds.has(e.id) || e.draggable)) this.guestize(e);
  }

  /** Glide copies toward where the host last saw them. */
  private smooth(dt: number): void {
    const k = 1 - Math.exp(-dt * 22);
    for (const [e, tg] of this.targets) {
      if (!e.alive) {
        this.targets.delete(e);
        continue;
      }
      const o = e.object;
      if (tg.snap || o.position.distanceToSquared(tg.p) > 2.5 * 2.5) {
        o.position.copy(tg.p);
        o.quaternion.copy(tg.q);
        tg.snap = false;
      } else {
        o.position.lerp(tg.p, k);
        o.quaternion.slerp(tg.q, k);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Side effects from the host
  // -------------------------------------------------------------------------

  private replay(ev: NetEvent): void {
    const ctx = this.ctx;
    const n = (i: number) => Number(ev[i]) || 0;
    const v = (i: number) => new THREE.Vector3(n(i), n(i + 1), n(i + 2));
    switch (ev[0]) {
      case 'snd':
        ctx.audio.play(ev[1] as never, (ev[2] ?? {}) as never);
        break;
      case 'vo':
        ctx.voice.babble(String(ev[1]), ev[2] as never, n(3), Number(ev[4] ?? 1));
        break;
      case 'fx': {
        const fn = (ctx.vfx as unknown as Record<string, unknown>)[String(ev[1])];
        if ((FX_METHODS as readonly string[]).includes(String(ev[1])) && typeof fn === 'function') (fn as (...a: unknown[]) => void).apply(ctx.vfx, ev.slice(2));
        break;
      }
      case 'say': {
        const anchor = this.anchorFor(n(2), v(5), (ev[4] as { duration?: number })?.duration);
        const id = ctx.ui.say(anchor, String(ev[3]), (ev[4] ?? {}) as never);
        this.bubbles.set(n(1), id);
        if (this.bubbles.size > 200) this.bubbles.delete(this.bubbles.keys().next().value as number);
        break;
      }
      case 'unsay': {
        const id = this.bubbles.get(n(1));
        if (id !== undefined) {
          ctx.ui.removeBubble(id);
          this.bubbles.delete(n(1));
        }
        break;
      }
      case 'ft':
        ctx.ui.floatText(v(1), String(ev[4]), String(ev[5] ?? '#fee761'));
        break;
      case 'toast':
        ctx.bus.emit('toast', { text: String(ev[1]), kind: (ev[2] ?? 'info') as never });
        break;
      case 'shake':
        ctx.bus.emit('shake', { amount: n(1) });
        break;
      case 'flash':
        ctx.bus.emit('flash', { amount: n(1), color: (ev[2] as string | null) ?? undefined });
        break;
      case 'chaos': {
        const a = this.app.atmosphere;
        a.chaos = clamp(a.chaos + n(1), 0, 1.5);
        break;
      }
      case 'glass':
        ctx.debris.glass(v(1), n(4) || 6);
        break;
      case 'chunks':
        ctx.debris.chunks(v(1), String(ev[4]), n(5) || 6);
        break;
      case 'coin':
        ctx.world.add(new Coin(ctx, v(1)), ctx);
        break;
    }
  }

  /** What a speech bubble hangs on: our copy of the speaker, or a spot. */
  private anchorFor(hostId: number, p: THREE.Vector3, duration?: number): THREE.Object3D {
    const e = hostId ? this.resolve(hostId) : null;
    if (e) return e.object;
    const o = new THREE.Object3D();
    o.position.copy(p);
    this.ctx.scene.add(o);
    setTimeout(() => o.removeFromParent(), ((duration ?? 6) + 1) * 1000);
    return o;
  }

  // -------------------------------------------------------------------------
  // This player's hand → host
  // -------------------------------------------------------------------------

  private inputState(): InputState {
    const ctx = this.ctx;
    const p = ctx.input.pointer;
    const cam = ctx.renderer.rig.camera;
    const el = this.app.game.viewport;
    const s: InputState = {
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      w: el.clientWidth || window.innerWidth,
      h: el.clientHeight || window.innerHeight,
      c: [q3(cam.position.x), q3(cam.position.y), q3(cam.position.z), q4(cam.quaternion.x), q4(cam.quaternion.y), q4(cam.quaternion.z), q4(cam.quaternion.w), q3(cam.fov), q4(cam.aspect)],
      ts: Math.round(performance.now()),
    };
    if (p.type !== 'mouse') s.pt = 1;
    if (!p.valid || !p.inside || !ctx.interaction.enabled) s.o = 1;
    return s;
  }

  private sendInput(): void {
    const s = this.inputState();
    const key = `${s.x},${s.y},${s.w},${s.h},${s.c.join(',')},${s.o ?? 0}`;
    const now = performance.now();
    if (key === this.lastInKey || now - this.lastInT < 15) return;
    this.lastInKey = key;
    this.lastInT = now;
    this.send({ t: 'in', s });
  }

  private sendKeys(): void {
    const input = this.ctx.input;
    for (const c of FORWARD_KEYS) {
      const down = input.isDown(c);
      const was = this.keysDown.has(c);
      if (down && !was) {
        this.keysDown.add(c);
        this.send({ t: 'kd', c });
      } else if (!down && was) {
        this.keysDown.delete(c);
        this.send({ t: 'ku', c });
      } else if (!down && input.wasPressed(c)) {
        // Tapped between two frames: still a press.
        this.send({ t: 'kd', c });
        this.send({ t: 'ku', c });
      }
    }
  }

  chat(text: string): void {
    this.send({ t: 'chat', x: text });
  }

  // -------------------------------------------------------------------------

  private end(why: NetErrorCode): void {
    if (this.ended) return;
    this.ended = true;
    try {
      this.link.close();
      this.peer.destroy();
    } catch {
      /* ignore */
    }
    this.onEnd?.(why);
  }

  /** Leave the room (the page reloads afterwards). */
  leave(): void {
    if (this.ended) return;
    this.ended = true;
    try {
      this.link.close();
      this.peer.destroy();
    } catch {
      /* ignore */
    }
  }
}
