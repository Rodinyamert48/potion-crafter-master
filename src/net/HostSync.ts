// Hosting a room. The host's game is the one true game: guests send their
// pointer, keys and shop orders, the host runs their hands like its own and
// sends back, 30 times a second, what everyone needs to see – where things
// are, how the stations look, who is talking and what just made a sound.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { App } from '../App';
import type { CursorKind, Entity, HoverInfo } from '../world/Entity';
import type { PixelSprite } from '../rendering/three/sprites/PixelSprite';
import type { SpriteSheet } from '../rendering/three/sprites/CharacterPainter';
import type { ThreeRenderer } from '../rendering/three/ThreeRenderer';
import { IngredientItem } from '../gameplay/ingredients/IngredientItem';
import { FlaskItem } from '../gameplay/potion/FlaskItem';
import { LogItem } from '../gameplay/stations/ShopFixtures';
import { INGREDIENTS } from '../data/ingredients';
import { UPGRADE_MAP } from '../data/upgrades';
import { clamp } from '../core/math';
import { t } from '../core/i18n';
import { PROTOCOL, type HostRoom, type Link } from './Transport';
import { PLAYER_COLORS, type NetDriver, type NetPlayer } from './NetSession';
import { GUEST_PANELS, RemoteHand, handPosition } from './RemoteHand';
import { q3, q4, type GuestMsg, type HandInfo, type HostMsg, type HudInfo, type NetEvent, type PuppetState, type SheetMsg, type SpawnRec, type SpriteState, type TickMsg, type WelcomeMsg } from './Protocol';

const TICK = 1 / 30;
export const MAX_GUESTS = 4;

/** Effects guests replay from the host (see VFX). */
export const FX_METHODS = [
  'splash',
  'bubble',
  'steam',
  'mist',
  'smoke',
  'poisonCloud',
  'magic',
  'stars',
  'runes',
  'puff',
  'dust',
  'chips',
  'powder',
  'drip',
  'mote',
  'swirl',
  'heartBurst',
  'explosion',
  'sparks',
  'flare',
] as const;

/** Keys a guest's hand uses (carrying, tilting, striking, the ladle). */
export const FORWARD_KEYS = ['Space', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyG'];
const FORWARD_SET = new Set(FORWARD_KEYS);

/** Sounds that answer one player's own clicks (the others don't hear them). */
const PERSONAL_SOUNDS = new Set(['uiClick', 'uiHover', 'denied', 'purchase', 'pageFlip', 'bookOpen']);

type Kind = 'static' | 'item' | 'puppet' | 'coin' | 'skip';

interface Tracked {
  e: Entity;
  kind: Kind;
  /** Statics that move about (tools, the bucket). */
  moves: boolean;
  announced: boolean;
  /** Last sent transform / state / puppet / hover card. */
  tf: string;
  st: string;
  pu: string;
  hv: string;
}

interface Guest {
  link: Link;
  /** 0 until the guest said hello. */
  id: number;
  name: string;
  color: string;
  hand: RemoteHand | null;
  welcomed: boolean;
  /** Events only for this guest (answers to their own clicks). */
  ev: NetEvent[];
  /** Last message (guests ping every 2 s). */
  heard: number;
}

/** Every pixel-art sprite of an entity. */
export function spritesOf(e: Entity): PixelSprite[] {
  const out: PixelSprite[] = [];
  e.object.traverse((o) => {
    const s = o.userData.pixelSprite as PixelSprite | undefined;
    if (s) out.push(s);
  });
  return out;
}

export function cleanName(s: unknown): string {
  return String(s ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16);
}

export function cleanChat(s: unknown): string {
  return String(s ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, 140);
}

/** Vectors in effect calls travel as plain {x, y, z}. */
function pack(a: unknown): unknown {
  if (a && typeof a === 'object') {
    const v = a as { x?: unknown; y?: unknown; z?: unknown };
    if (typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number') return { x: q3(v.x), y: q3(v.y), z: q3(v.z) };
    if (Array.isArray(a)) return a.map((n) => (typeof n === 'number' ? q3(n) : n));
  }
  return a;
}

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

export class HostSync implements NetDriver {
  private readonly guests = new Map<Link, Guest>();
  private nextId = 1;
  private readonly tracked = new Map<number, Tracked>();
  /** Events for every guest since the last tick. */
  private events: NetEvent[] = [];
  private tickT = 0;
  private tickN = 0;
  private readonly lastState = new Map<string, string>();
  private hudKey = '';
  private lastSummary = 0;
  private forceState = false;
  private readonly sheetIds = new WeakMap<HTMLCanvasElement, number>();
  private readonly sheets: SheetMsg[] = [];
  private readonly restore: Array<() => void> = [];
  private readonly cmds: Array<{ from: number; c: string; a: unknown[] }> = [];
  private handsRan = false;
  private closed = false;
  /** The player list changed (room badge). */
  onPlayers: ((list: NetPlayer[]) => void) | null = null;
  onChat: ((from: number, text: string) => void) | null = null;
  /** Everyone's hands (for the markers): [player id, x, y, z, holding]. */
  onMarkers: ((mk: number[][]) => void) | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly app: App,
    readonly room: HostRoom,
    hostName: string,
  ) {
    const net = ctx.net;
    net.role = 'host';
    net.code = room.code;
    net.selfId = 0;
    net.players = [{ id: 0, name: hostName, color: PLAYER_COLORS[0] }];
    room.onConnection = (link) => this.connect(link);
    this.installHooks();
    for (const e of ctx.world.entities.values()) if (e.alive) this.track(e);
  }

  get guestCount(): number {
    let n = 0;
    for (const g of this.guests.values()) if (g.id) n++;
    return n;
  }

  // -------------------------------------------------------------------------
  // Side effects → events
  // -------------------------------------------------------------------------

  private installHooks(): void {
    const ctx = this.ctx;
    const net = ctx.net;
    // What the shared game does – in the frame or from the host's menus (the
    // King's answer, a trade) – but not what guests' copies do by themselves.
    const live = () => net.quiet === 0 && !this.closed;
    // A DOM handler: the host's own clicks in menus.
    const menu = () => net.sim === 0;
    const patch = (obj: object, key: string, make: (orig: (...a: never[]) => unknown) => (...a: never[]) => unknown) => {
      const o = obj as Record<string, unknown>;
      const orig = (o[key] as (...a: never[]) => unknown).bind(obj);
      o[key] = make(orig);
      this.restore.push(() => delete o[key]);
    };

    patch(ctx.audio, 'play', (orig) => ((name: string, opts: { x?: number } = {}) => {
      if (!live()) return orig(...([name, opts] as never[]));
      // Clicks and "can't do that" buzzes belong to whoever clicked.
      if (PERSONAL_SOUNDS.has(name)) {
        if (net.replyTo !== null) this.send(['snd', name, opts], net.replyTo);
        else orig(...([name, opts] as never[]));
        return;
      }
      orig(...([name, opts] as never[]));
      this.event(['snd', name, opts]);
    }) as never);

    patch(ctx.voice, 'babble', (orig) => ((text: string, voice: unknown, x = 0, volume = 1) => {
      const r = orig(...([text, voice, x, volume] as never[]));
      if (live()) this.event(['vo', text, voice, q3(x), volume]);
      return r;
    }) as never);

    for (const name of FX_METHODS) {
      patch(ctx.vfx, name, (orig) => ((...args: unknown[]) => {
        orig(...(args as never[]));
        if (live()) this.event(['fx', name, ...args.map(pack)]);
      }) as never);
    }

    patch(ctx.debris, 'glass', (orig) => ((p: THREE.Vector3, count = 6) => {
      orig(...([p, count] as never[]));
      if (live()) this.event(['glass', q3(p.x), q3(p.y), q3(p.z), count]);
    }) as never);
    patch(ctx.debris, 'chunks', (orig) => ((p: THREE.Vector3, color: string, count = 6) => {
      orig(...([p, color, count] as never[]));
      if (live()) this.event(['chunks', q3(p.x), q3(p.y), q3(p.z), color, count]);
    }) as never);

    const ui = this.app.game.ui;
    patch(ui, 'say', (orig) => ((anchor: THREE.Object3D, text: string, opts?: Record<string, unknown>) => {
      const id = orig(...([anchor, text, opts] as never[])) as number;
      if (live()) {
        const e = ctx.world.entityFromObject(anchor);
        const p = anchor.getWorldPosition(tmpV);
        this.event(['say', id, e ? e.id : 0, text, opts ?? {}, q3(p.x), q3(p.y), q3(p.z)]);
      }
      return id;
    }) as never);
    patch(ui, 'removeBubble', (orig) => ((id: number) => {
      orig(...([id] as never[]));
      if (live()) this.event(['unsay', id]);
    }) as never);
    patch(ui, 'floatText', (orig) => ((world: THREE.Vector3, text: string, color?: string) => {
      orig(...([world, text, color] as never[]));
      if (live()) this.event(['ft', q3(world.x), q3(world.y), q3(world.z), text, color ?? '#fee761']);
    }) as never);

    patch(ctx.bus, 'emit', (orig) => ((type: string, payload: Record<string, unknown>) => {
      if (live()) {
        if (type === 'toast') {
          const kind = (payload.kind as string | undefined) ?? 'info';
          // Little notes about one player's own action go only to them.
          const personal = kind === 'warn' || kind === 'info';
          if (personal && net.replyTo !== null) {
            this.send(['toast', payload.text, kind], net.replyTo);
            return;
          }
          if (!personal || !menu()) this.event(['toast', payload.text, kind]);
        } else if (type === 'shake') this.event(['shake', payload.amount]);
        else if (type === 'flash') this.event(['flash', payload.amount, payload.color ?? null]);
        else if (type === 'chaos') this.event(['chaos', payload.amount]);
      }
      orig(...([type, payload] as never[]));
    }) as never);

    // What guests run themselves stays quiet here.
    ctx.world.wrapUpdate = (e, run) => {
      const tr = this.tracked.get(e.id) ?? this.track(e);
      if (tr.kind !== 'static' && tr.kind !== 'item' && tr.kind !== 'coin') {
        run();
        return;
      }
      net.quiet++;
      try {
        run();
      } finally {
        net.quiet--;
      }
    };
    this.restore.push(() => (ctx.world.wrapUpdate = null));
  }

  /** An event for everyone. */
  private event(ev: NetEvent): void {
    if (this.guests.size) this.events.push(ev);
  }

  /** An event for one guest. */
  private send(ev: NetEvent, to: number): void {
    for (const g of this.guests.values()) if (g.id === to && g.welcomed) g.ev.push(ev);
  }

  // -------------------------------------------------------------------------
  // Guests
  // -------------------------------------------------------------------------

  private connect(link: Link): void {
    if (this.closed) {
      link.close();
      return;
    }
    const g: Guest = { link, id: 0, name: '', color: '', hand: null, welcomed: false, ev: [], heard: performance.now() };
    this.guests.set(link, g);
    const timer = setTimeout(() => {
      if (!g.id) link.close();
    }, 10000);
    link.onMessage((m) => this.message(g, m as unknown as GuestMsg));
    link.onClose(() => {
      clearTimeout(timer);
      this.leave(g);
    });
  }

  private message(g: Guest, m: GuestMsg): void {
    if (this.closed || !m || typeof m !== 'object') return;
    g.heard = performance.now();
    if (!g.id) {
      if (m.t !== 'hello') return;
      if (m.v !== PROTOCOL) return this.reject(g, 'version');
      if (this.guestCount >= MAX_GUESTS) return this.reject(g, 'full');
      g.id = this.nextId++;
      g.name = cleanName(m.name) || `${t('net.guest')} ${g.id}`;
      g.color = PLAYER_COLORS[g.id % PLAYER_COLORS.length];
      g.hand = new RemoteHand(this.ctx, g.id);
      this.ctx.net.players.push({ id: g.id, name: g.name, color: g.color });
      this.playersChanged();
      this.ctx.bus.emit('toast', { text: t('net.joined', { name: g.name }), kind: 'info' });
      // The welcome goes out with the next tick.
      return;
    }
    switch (m.t) {
      case 'in': {
        const q = g.hand?.queue;
        if (!q) break;
        // Many moves while the host's tab sleeps: keep the latest ones.
        if (q.length > 40 && q[q.length - 1].t === 'in') q[q.length - 1] = m;
        else q.push(m);
        break;
      }
      case 'dn':
      case 'up':
      case 'kd':
      case 'ku':
      case 'wh':
        if (g.hand && g.hand.queue.length < 400) g.hand.queue.push(m);
        break;
      case 'cmd':
        if (this.cmds.length < 50) this.cmds.push({ from: g.id, c: String(m.c), a: Array.isArray(m.a) ? m.a : [] });
        break;
      case 'chat':
        this.chat(g.id, m.x);
        break;
      case 'ping':
        this.sendTo(g, { t: 'pong', ts: Number(m.ts) || 0 });
        break;
    }
  }

  private sendTo(g: Guest, msg: HostMsg): void {
    g.link.send(msg);
  }

  private reject(g: Guest, r: string): void {
    this.sendTo(g, { t: 'reject', r });
    setTimeout(() => g.link.close(), 600);
  }

  private leave(g: Guest): void {
    if (!this.guests.delete(g.link)) return;
    const hand = g.hand;
    if (hand) {
      this.withHand(hand, () => {
        hand.interaction.cancelGrab();
        hand.input.releaseAll();
      });
      g.hand = null;
    }
    if (g.id) {
      const net = this.ctx.net;
      net.players = net.players.filter((p) => p.id !== g.id);
      this.playersChanged();
      if (!this.closed) this.ctx.bus.emit('toast', { text: t('net.left', { name: g.name }), kind: 'info' });
    }
  }

  private playersChanged(): void {
    const list = this.ctx.net.players;
    for (const g of this.guests.values()) if (g.id) this.sendTo(g, { t: 'players', list });
    this.onPlayers?.(list);
  }

  /** A chat line (from a guest, or the host's own with id 0). */
  chat(from: number, text: unknown): void {
    const x = cleanChat(text);
    if (!x || this.closed) return;
    for (const g of this.guests.values()) if (g.id) this.sendTo(g, { t: 'chat', from, x });
    this.onChat?.(from, x);
  }

  // -------------------------------------------------------------------------
  // Remote hands
  // -------------------------------------------------------------------------

  /** Run code as if `hand` were the local player's hand. */
  private withHand<T>(hand: RemoteHand, fn: () => T): T {
    const ctx = this.ctx;
    const net = ctx.net;
    const saved = { input: ctx.input, interaction: ctx.interaction, ui: ctx.ui, reply: net.replyTo };
    const r = ctx.renderer as unknown as Record<string, unknown>;
    ctx.input = hand.input;
    ctx.interaction = hand.interaction;
    ctx.ui = hand.ui;
    net.replyTo = hand.playerId;
    r.project = ((world: THREE.Vector3, out: { x: number; y: number; visible: boolean }) => hand.project(world, out)) satisfies ThreeRenderer['project'];
    try {
      return fn();
    } finally {
      ctx.input = saved.input;
      ctx.interaction = saved.interaction;
      ctx.ui = saved.ui;
      net.replyTo = saved.reply;
      delete r.project;
    }
  }

  updateHands(dt: number): void {
    this.handsRan = true;
    for (const g of this.guests.values()) {
      const hand = g.hand;
      if (!hand) continue;
      this.withHand(hand, () => {
        for (const m of hand.queue.splice(0)) this.handMessage(hand, m);
        hand.interaction.enabled = true;
        hand.interaction.update(dt);
        this.flushPanels(g, hand);
        hand.input.endFrame(dt);
      });
    }
  }

  fixedHands(dt: number): void {
    for (const g of this.guests.values()) {
      const hand = g.hand;
      if (hand?.interaction.grab) this.withHand(hand, () => hand.interaction.fixedUpdate(dt));
    }
  }

  /** The shop is paused (day summary) or the host is away: only let go. */
  private drainIdleHands(): void {
    for (const g of this.guests.values()) {
      const hand = g.hand;
      if (!hand || !hand.queue.length) continue;
      this.withHand(hand, () => {
        for (const m of hand.queue.splice(0)) if (m.t === 'in' || m.t === 'up' || m.t === 'ku') this.handMessage(hand, m);
        hand.input.endFrame(0);
      });
    }
  }

  private handMessage(hand: RemoteHand, m: GuestMsg): void {
    const ctx = this.ctx;
    switch (m.t) {
      case 'in':
        hand.apply(m.s);
        break;
      case 'dn':
        hand.apply(m.s);
        hand.interaction.preferNext = typeof m.e === 'number' ? (ctx.world.entities.get(m.e) ?? null) : null;
        hand.input.injectButton(m.b === 2 ? 2 : 0, true);
        hand.interaction.preferNext = null;
        break;
      case 'up':
        hand.apply(m.s);
        hand.input.injectButton(m.b === 2 ? 2 : 0, false);
        break;
      case 'kd':
        if (!FORWARD_SET.has(m.c)) break;
        hand.input.injectKey(m.c, true);
        if (m.c === 'KeyG') {
          const ladle = ctx.shop.ladle;
          if (hand.interaction.grab?.entity === ladle || hand.interaction.hovered === ladle) ladle.cycleMode(ctx);
        }
        break;
      case 'ku':
        if (FORWARD_SET.has(m.c)) hand.input.injectKey(m.c, false);
        break;
      case 'wh':
        hand.input.injectWheel(clamp(Number(m.d) || 0, -2000, 2000));
        break;
    }
  }

  /** Menus a guest's hand opened (the cat's wardrobe stays the host's). */
  private flushPanels(g: Guest, hand: RemoteHand): void {
    for (const p of hand.ui.requests.splice(0)) {
      if (GUEST_PANELS.has(p)) this.sendTo(g, { t: 'panel', p });
      else this.send(['toast', t('net.hostOnly'), 'warn'], g.id);
    }
  }

  // -------------------------------------------------------------------------
  // Shop orders from guests' menus
  // -------------------------------------------------------------------------

  private runCommand(from: number, c: string, a: unknown[]): void {
    const app = this.app;
    const net = this.ctx.net;
    const s = (i: number) => String(a[i] ?? '');
    net.replyTo = from;
    try {
      switch (c) {
        case 'buyIngredient':
          if (INGREDIENTS[s(0)]) app.shopSystem.buyIngredient(s(0));
          break;
        case 'buySupply':
          if (s(0) === 'flasks' || s(0) === 'logs') app.shopSystem.buySupply(s(0) as 'flasks' | 'logs');
          break;
        case 'buyUpgrade':
          if (UPGRADE_MAP[s(0)]) app.shopSystem.buyUpgrade(s(0));
          break;
        case 'buyFurniture':
          app.furniture.buy(s(0), s(1));
          break;
        case 'removeFurniture':
          app.furniture.remove(s(0));
          break;
        case 'merchantBuy':
          if (app.merchant.present) app.merchant.buy(s(0));
          break;
        case 'merchantSell': {
          const f = this.ctx.world.entities.get(Number(a[0]));
          if (app.merchant.present && f instanceof FlaskItem && app.merchant.sellable().includes(f)) app.merchant.sell(f);
          break;
        }
        case 'merchantTeach':
          if (app.merchant.present) app.merchant.teach(s(0));
          break;
        case 'king':
          // Everyone hears how the King takes the answer.
          net.replyTo = null;
          app.king.answer(!!a[0]);
          break;
      }
    } catch (err) {
      console.warn('[net] order failed', c, err);
    } finally {
      net.replyTo = null;
    }
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  update(dt: number): void {
    if (this.closed) return;
    for (const { from, c, a } of this.cmds.splice(0)) this.runCommand(from, c, a);
    // A guest that went silent (lost connection): let their hand go.
    const now = performance.now();
    for (const g of this.guests.values()) if (g.id && now - g.heard > 20000) g.link.close();
    if (!this.handsRan) this.drainIdleHands();
    this.handsRan = false;
    this.tickT += dt;
    if (this.tickT >= TICK) {
      this.tickT = Math.min(this.tickT - TICK, TICK);
      this.tick();
    }
  }

  private track(e: Entity): Tracked {
    let kind: Kind = 'skip';
    if (e.kind === 'coin') kind = 'coin';
    else if (spritesOf(e).length > 0) kind = 'puppet';
    else if (e instanceof IngredientItem || e instanceof FlaskItem || e instanceof LogItem) kind = 'item';
    else if (e.netKey) kind = 'static';
    const moves = kind === 'static' && e.draggable && e.body?.motion === 'dynamic';
    const tr: Tracked = { e, kind, moves, announced: false, tf: '', st: '', pu: '', hv: '' };
    this.tracked.set(e.id, tr);
    return tr;
  }

  private transform(e: Entity): number[] {
    const o = e.object;
    o.getWorldPosition(tmpV);
    o.getWorldQuaternion(tmpQ);
    return [e.id, q3(tmpV.x), q3(tmpV.y), q3(tmpV.z), q4(tmpQ.x), q4(tmpQ.y), q4(tmpQ.z), q4(tmpQ.w)];
  }

  private sheetId(sheet: SpriteSheet): number {
    let id = this.sheetIds.get(sheet.canvas);
    if (id === undefined) {
      id = this.sheets.length + 1;
      this.sheetIds.set(sheet.canvas, id);
      const msg: SheetMsg = {
        id,
        url: sheet.canvas.toDataURL('image/png'),
        fw: sheet.frameW,
        fh: sheet.frameH,
        cols: sheet.cols,
        rows: sheet.rows,
        anims: sheet.anims,
        py: sheet.pivotY,
      };
      this.sheets.push(msg);
      for (const g of this.guests.values()) if (g.welcomed) this.sendTo(g, { t: 'sheet', ...msg });
    }
    return id;
  }

  private puppetState(e: Entity): PuppetState {
    const s: SpriteState[] = spritesOf(e).map((sp) => {
      const p = e.object.worldToLocal(sp.root.getWorldPosition(tmpV));
      const m = sp.material;
      return [
        this.sheetId(sp.sheet),
        sp.current,
        sp.serial,
        sp.facing,
        q3(sp.hop),
        q3(sp.squash),
        q3(sp.opacity),
        sp.root.visible && sp.quad.visible ? 1 : 0,
        q3(p.x),
        q3(p.y),
        q3(p.z),
        sp.shadow.visible ? 1 : 0,
        q4(sp.scale),
        q3(sp.root.scale.x),
        `#${m.emissive.getHexString()}`,
        q3(m.emissiveIntensity),
      ];
    });
    return { v: e.object.visible ? 1 : 0, sc: q3(e.object.scale.x), s };
  }

  private hoverOf(e: Entity): [HoverInfo | null, CursorKind, number] {
    let hv: HoverInfo | null = null;
    try {
      hv = e.hover(this.ctx);
    } catch {
      hv = null;
    }
    return [hv, e.cursor(), e.interactive ? 1 : 0];
  }

  /** Everything a guest needs to build its copy of an item or puppet. */
  private spawnRec(tr: Tracked, remember: boolean): SpawnRec {
    const e = tr.e;
    const tf = this.transform(e);
    if (tr.kind === 'puppet') {
      const pu = this.puppetState(e);
      const [hv, cu, it] = this.hoverOf(e);
      if (remember) {
        tr.tf = tf.join(',');
        tr.pu = JSON.stringify(pu);
        tr.hv = JSON.stringify([hv, cu, it]);
      }
      return { id: e.id, k: 'puppet', tf, pu, hv, cu, it };
    }
    const st = e.netState();
    if (remember) {
      tr.tf = tf.join(',');
      tr.st = st === undefined ? '' : JSON.stringify(st);
    }
    let d: unknown = null;
    if (e instanceof IngredientItem) d = { i: e.def.id, s: e.state, m: q4(e.initialMass) };
    else if (e instanceof FlaskItem) d = { p: e.potion };
    return { id: e.id, k: e.kind, d, tf, st };
  }

  private hudInfo(): HudInfo {
    const app = this.app;
    const c = app.customers.current;
    const g = this.ctx.shop.cauldron.guide;
    const next = app.customers.pendingVisits[0];
    return {
      c: c ? { n: c.name, r: c.request, ph: c.phase, pt: Math.round(Math.max(0, c.patience / c.patienceMax) * 100) / 100, inf: c.infinitePatience ? 1 : 0, u: c.uid } : null,
      nv: next ? q3(next.hour) : -1,
      g: g ? { id: g.recipe.id, k: g.known ? 1 : 0, rd: g.ready ? 1 : 0, tips: g.tips } : null,
      tu: app.hud.tutorialText,
      ms: app.merchant.stallUp ? 1 : 0,
      sm: this.ctx.ui.isPanelOpen('summary') ? 1 : 0,
    };
  }

  private handInfo(g: Guest): HandInfo | null {
    const hand = g.hand;
    if (!hand) return null;
    const grab = hand.interaction.grab;
    const info: HandInfo = { h: grab ? 1 : 0, cu: grab ? (grab.cursor ?? 'grabbing') : 'default', hint: grab ? hand.ui.hint : null };
    const k = JSON.stringify(info);
    if (k === hand.lastInfo) return null;
    hand.lastInfo = k;
    return info;
  }

  private tick(): void {
    const ctx = this.ctx;
    const n = ++this.tickN;
    const msg: TickMsg = { t: 'tick', hr: q4(ctx.state.hour) };
    const sp: SpawnRec[] = [];
    const rm: number[] = [];
    const sk: Array<[number, string]> = [];
    const tf: number[][] = [];
    const es: Array<[number, unknown]> = [];
    const pp: Array<[number, PuppetState]> = [];
    const ph: Array<[number, HoverInfo | null, CursorKind, number]> = [];
    const staticsNow = n % 3 === 0;
    const hoverNow = n % 15 === 0;

    for (const [id, tr] of this.tracked) {
      if (tr.e.alive && ctx.world.entities.get(id) === tr.e) continue;
      this.tracked.delete(id);
      if (tr.announced && (tr.kind === 'item' || tr.kind === 'puppet')) rm.push(id);
    }
    for (const e of ctx.world.entities.values()) {
      if (!e.alive) continue;
      const tr = this.tracked.get(e.id) ?? this.track(e);
      if (tr.kind === 'skip') continue;
      if (tr.kind === 'coin') {
        if (!tr.announced) {
          tr.announced = true;
          const p = e.object.position;
          this.event(['coin', q3(p.x), q3(p.y), q3(p.z)]);
        }
        continue;
      }
      if (!tr.announced) {
        tr.announced = true;
        if (tr.kind === 'static') sk.push([e.id, e.netKey!]);
        else {
          sp.push(this.spawnRec(tr, true));
          continue;
        }
      }
      if (tr.kind !== 'static' || tr.moves) {
        const t = this.transform(e);
        const k = t.join(',');
        if (k !== tr.tf) {
          tr.tf = k;
          tf.push(t);
        }
      }
      if (tr.kind === 'item' || tr.kind === 'static') {
        const st = e.netState();
        if (st !== undefined) {
          const k = JSON.stringify(st);
          // Small states every tick (smooth tools), big ones (the brew) 10 times a second.
          if (k !== tr.st && (k.length < 240 || staticsNow || tr.kind === 'item')) {
            tr.st = k;
            es.push([e.id, st]);
          }
        }
      }
      if (tr.kind === 'puppet') {
        const ps = this.puppetState(e);
        const k = JSON.stringify(ps);
        if (k !== tr.pu) {
          tr.pu = k;
          pp.push([e.id, ps]);
        }
        if (hoverNow) {
          const h = this.hoverOf(e);
          const hk = JSON.stringify(h);
          if (hk !== tr.hv) {
            tr.hv = hk;
            ph.push([e.id, h[0], h[1], h[2]]);
          }
        }
      }
    }

    if (n % 3 === 1) {
      const hud = this.hudInfo();
      const k = JSON.stringify(hud);
      if (k !== this.hudKey) {
        this.hudKey = k;
        msg.hud = hud;
        // The summary needs the day's final numbers with it.
        if (hud.sm !== this.lastSummary) this.forceState = true;
        this.lastSummary = hud.sm;
      }
    }
    if (n % 6 === 0 || this.forceState) {
      this.forceState = false;
      const js = ctx.state.toJSON();
      const gs: Record<string, unknown> = {};
      let any = false;
      for (const [k, v] of Object.entries(js)) {
        if (k === 'hour') continue;
        const s = JSON.stringify(v);
        if (this.lastState.get(k) !== s) {
          this.lastState.set(k, s);
          gs[k] = v;
          any = true;
        }
      }
      if (any) msg.gs = gs;
    }
    if (n % 2 === 0) {
      const mk: number[][] = [];
      const playing = this.app.game.playing && ctx.mode === 'shop';
      const own = playing ? handPosition(ctx.interaction, tmpV) : null;
      if (own) mk.push([0, q3(own.x), q3(own.y), q3(own.z), ctx.interaction.grab ? 1 : 0]);
      for (const g of this.guests.values()) {
        const p = g.hand?.position(tmpV);
        if (p) mk.push([g.id, q3(p.x), q3(p.y), q3(p.z), g.hand!.interaction.grab ? 1 : 0]);
      }
      msg.mk = mk;
      this.onMarkers?.(mk);
    }

    if (sp.length) msg.sp = sp;
    if (rm.length) msg.rm = rm;
    if (sk.length) msg.sk = sk;
    if (tf.length) msg.tf = tf;
    if (es.length) msg.es = es;
    if (pp.length) msg.pp = pp;
    if (ph.length) msg.ph = ph;
    const common = this.events;
    this.events = [];
    for (const g of this.guests.values()) {
      if (!g.welcomed) continue;
      const out: TickMsg = { ...msg };
      const ev = g.ev.length ? common.concat(g.ev) : common;
      g.ev = [];
      if (ev.length) out.ev = ev;
      const hand = this.handInfo(g);
      if (hand) out.hand = hand;
      this.sendTo(g, out);
    }
    // Newcomers get the whole shop as it is right now.
    for (const g of this.guests.values()) if (g.id && !g.welcomed) this.welcome(g);
  }

  private welcome(g: Guest): void {
    const ctx = this.ctx;
    const statics: Array<[number, string]> = [];
    const spawn: SpawnRec[] = [];
    const es: Array<[number, unknown]> = [];
    const tf: number[][] = [];
    for (const tr of this.tracked.values()) {
      const e = tr.e;
      if (!e.alive || !tr.announced) continue;
      if (tr.kind === 'static') {
        statics.push([e.id, e.netKey!]);
        const st = e.netState();
        if (st !== undefined) es.push([e.id, st]);
        if (tr.moves) tf.push(this.transform(e));
      } else if (tr.kind === 'item' || tr.kind === 'puppet') spawn.push(this.spawnRec(tr, false));
    }
    const msg: WelcomeMsg = {
      t: 'welcome',
      you: g.id,
      code: this.room.code,
      players: ctx.net.players,
      statics,
      state: ctx.state.toJSON(),
      hr: ctx.state.hour,
      sheets: this.sheets,
      spawn,
      es,
      tf,
      hud: this.hudInfo(),
    };
    this.sendTo(g, msg);
    g.welcomed = true;
    g.ev = [];
  }

  // -------------------------------------------------------------------------

  close(reason = 'closed'): void {
    if (this.closed) return;
    this.closed = true;
    for (const g of this.guests.values()) this.sendTo(g, { t: 'bye', r: reason });
    for (const g of [...this.guests.values()]) this.leave(g);
    for (const r of this.restore.splice(0).reverse()) r();
    const net = this.ctx.net;
    net.role = 'offline';
    net.code = '';
    net.players = [];
    net.replyTo = null;
    // Let the goodbyes go out before the connections drop.
    setTimeout(() => this.room.close(), 400);
  }
}
