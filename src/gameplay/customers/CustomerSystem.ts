// Customer flow: daily visit schedule, spawning, the counter queue, serving
// potions (placed on the counter or dropped onto the customer), payment with
// physical coins, reputation, the frog chase and quest visits.

import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import type { GameSystem } from '../../core/Game';
import { CUSTOMERS } from '../../data/customers';
import type { CustomerDef, CustomerRequest, DayPhase } from '../../data/types';
import { QUEST_MAP } from '../../data/quests';
import { RECIPE_MAP } from '../../data/potions';
import { Customer } from './Customer';
import { createDrinkEffect } from './DrinkEffects';
import { judge } from './Economy';
import { Frog } from './Frog';
import type { Mentor } from './Mentor';
import { FlaskItem } from '../potion/FlaskItem';
import { Random } from '../../core/Random';
import { t, tr } from '../../core/i18n';
import { phaseOf } from '../GameState';
import { CG } from '../../physics/PhysicsTypes';
import { toon } from '../../rendering/three/materials';
import { Entity } from '../../world/Entity';

export interface Visit {
  hour: number;
  customerId: string;
  requestId?: string;
  quest?: { id: string; mode: 'intro' | 'deliver' };
  spawned?: boolean;
  tutorial?: boolean;
}

/** A coin that drops on the counter and then flies to the cash box. */
class Coin extends Entity {
  readonly kind = 'coin';
  private age = 0;
  private flying = false;
  constructor(ctx: GameContext, pos: THREE.Vector3) {
    super(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8), toon({ color: '#feae34', emissive: '#feae34', emissiveIntensity: 0.4 })));
    this.interactive = false;
    this.body = ctx.physics.createBody({
      shape: { type: 'cylinder', radius: 0.035, height: 0.012 },
      motion: 'dynamic',
      mass: 0.02,
      position: pos,
      restitution: 0.45,
      collisionEvents: true,
      group: CG.DEBRIS,
      mask: CG.STATIC,
    });
    this.body.setLinearVelocity({ x: (Math.random() - 0.5) * 1.2, y: 1.5 + Math.random(), z: (Math.random() - 0.5) * 0.6 });
    this.body.setAngularVelocity({ x: Math.random() * 20, y: Math.random() * 10, z: Math.random() * 20 });
  }
  override onImpact(ctx: GameContext, _o: Entity | null, impulse: number): void {
    if (impulse > 0.005) ctx.audio.play('coin', { x: this.object.position.x, volume: 0.35, minGap: 0.04 });
  }
  override update(ctx: GameContext, dt: number): void {
    this.age += dt;
    if (!this.flying && this.age > 1.3) {
      this.flying = true;
      if (this.body) {
        ctx.sync.unlink(this.body);
        ctx.physics.removeBody(this.body);
        this.body = null;
      }
    }
    if (this.flying) {
      const target = ctx.shop.anchors.cashBox;
      this.object.position.lerp(target, Math.min(1, dt * 7));
      this.object.rotation.y += dt * 12;
      if (this.object.position.distanceTo(target) < 0.06) {
        ctx.vfx.magic(target, '#fee761', 3, 0.05, 0.3);
        ctx.world.remove(this);
      }
    }
  }
}

export class CustomerSystem implements GameSystem {
  private visits: Visit[] = [];
  private readonly rng = new Random(1234);
  readonly customers: Customer[] = [];
  private readonly frogs = new Map<number, Frog>();
  private serveTimers = new Map<number, number>();
  mentor: Mentor | null = null;
  /** Quest hooks installed by the QuestSystem. */
  onQuestVisit: ((c: Customer) => void) | null = null;
  onQuestDelivered: ((c: Customer, success: boolean) => void) | null = null;

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('bell:rung', () => this.ringBell());
    ctx.bus.on('frog:cured', ({ uid }) => this.cureFrog(uid));
    ctx.bus.on('frog:escaped', ({ uid }) => this.frogEscaped(uid));
  }

  get queue(): Customer[] {
    return this.customers.filter((c) => c.phase !== 'gone' && c.phase !== 'leaving' && c.phase !== 'transformed');
  }

  /** The customer currently at the counter (ordering/waiting). */
  get current(): Customer | null {
    return this.customers.find((c) => c.atCounter && (c.phase === 'waiting' || c.phase === 'ordering')) ?? null;
  }

  get pendingVisits(): Visit[] {
    return this.visits.filter((v) => !v.spawned);
  }

  // -------------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------------

  planDay(day: number, extra: Visit[] = []): void {
    const state = this.ctx.state;
    this.rng.next();
    const visits: Visit[] = [];
    if (day === 1 && !state.tutorialDone) {
      visits.push({ hour: 7.3, customerId: 'witch_hazel', requestId: 'hazel_heal', tutorial: true });
      visits.push({ hour: 12.5, customerId: 'knight_roland', requestId: 'roland_strength' });
      visits.push({ hour: 17.5, customerId: 'elf_elowen', requestId: 'elowen_vision' });
    } else {
      const count = Math.min(7, 3 + Math.floor(state.reputation / 25) + (day > 3 ? 1 : 0));
      const eligible = Object.values(CUSTOMERS).filter((c) => !c.questOnly && c.minDay <= day && (c.minReputation ?? 0) <= state.reputation);
      const slots: number[] = [];
      for (let i = 0; i < count; i++) slots.push(7.8 + ((21.3 - 7.8) * (i + this.rng.range(0.1, 0.9))) / count);
      let lastId = '';
      const used = new Set<string>();
      for (const hour of slots) {
        const phase = phaseOf(hour);
        const inPhase = eligible.filter((c) => c.phases.includes(phase) && c.id !== lastId);
        // Prefer someone who has not been in today.
        const fresh = inPhase.filter((c) => !used.has(c.id));
        const pool = fresh.length > 0 ? fresh : inPhase;
        const c = this.rng.weighted(pool, (d) => (d.id === 'giant_grumbold' || d.id === 'vampire_vlador' ? 0.6 : 1));
        if (!c) continue;
        lastId = c.id;
        used.add(c.id);
        const req = this.pickRequest(c, day, phase);
        if (req) visits.push({ hour, customerId: c.id, requestId: req.id });
      }
    }
    for (const e of extra) visits.push(e);
    visits.sort((a, b) => a.hour - b.hour);
    this.visits = visits;
  }

  addVisit(v: Visit): void {
    this.visits.push(v);
    this.visits.sort((a, b) => a.hour - b.hour);
  }

  private pickRequest(c: CustomerDef, day: number, phase: DayPhase): CustomerRequest | undefined {
    const reqs = c.requests.filter((r) => (r.minDay ?? 0) <= day && (!r.phases || r.phases.includes(phase)));
    return this.rng.weighted(reqs, (r) => r.weight);
  }

  private ringBell(): void {
    const next = this.pendingVisits[0];
    const hour = this.ctx.state.hour;
    if (next && next.hour - hour < 3 && this.ctx.state.shopOpen) next.hour = Math.min(next.hour, hour + 0.1);
  }

  // -------------------------------------------------------------------------
  // Spawning & queue
  // -------------------------------------------------------------------------

  private spawn(v: Visit): void {
    const ctx = this.ctx;
    const def = CUSTOMERS[v.customerId];
    if (!def) return;
    let req = def.requests.find((r) => r.id === v.requestId) ?? def.requests[0];
    if (v.quest?.mode === 'deliver') {
      const q = QUEST_MAP[v.quest.id];
      if (q.objective.type === 'deliver') req = { id: `quest_${q.id}`, tags: q.objective.tags, anyOf: q.objective.anyOf, minTier: q.objective.minTier, weight: 1, line: q.description };
    }
    const c = new Customer(ctx, def, req, ctx.shop.anchors.doorOutside);
    c.quest = v.quest ?? null;
    c.infinitePatience = !!v.tutorial || !!v.quest;
    ctx.world.add(c, ctx);
    this.customers.push(c);
    ctx.shop.door.open(ctx, 2.5);
    c.walk([ctx.shop.anchors.doorInside], () => this.afterEnter(c));
    ctx.bus.emit('customer:arrived', { uid: c.uid, customerId: def.id });
  }

  private afterEnter(c: Customer): void {
    const ctx = this.ctx;
    c.line(ctx, 'greet');
    c.phase = 'toSpot';
    this.assignSpots();
  }

  /** First in line gets the counter, the rest queue behind. */
  private assignSpots(): void {
    const a = this.ctx.shop.anchors;
    const line = this.customers.filter((c) => c.phase === 'toSpot' || c.phase === 'queued' || c.phase === 'ordering' || c.phase === 'waiting');
    let counterTaken = line.some((c) => c.atCounter);
    let q = 0;
    for (const c of line) {
      if (c.atCounter) continue;
      if (!counterTaken) {
        counterTaken = true;
        c.atCounter = true;
        c.spot = a.counterSpot;
        c.walk([a.counterSpot], () => this.startOrder(c));
      } else {
        const spot = a.queue[Math.min(q, a.queue.length - 1)];
        q++;
        if (c.spot !== spot) {
          c.spot = spot;
          c.phase = 'queued';
          c.walk([spot], () => {
            c.sprite.facing = -1;
          });
        }
      }
    }
  }

  private startOrder(c: Customer): void {
    const ctx = this.ctx;
    c.phase = 'ordering';
    c.sprite.facing = 1;
    if (c.quest?.mode === 'intro') {
      this.onQuestVisit?.(c);
      return;
    }
    const line = c.quest?.mode === 'deliver' ? `${tr(QUEST_MAP[c.quest.id].title)}… ${tr(c.request.line)}` : tr(c.request.line);
    ctx.later(1.4, () => {
      if (!c.alive) return;
      c.say(ctx, line, 'neutral', Math.max(5, line.length * 0.07));
      c.phase = 'waiting';
      // Hearing what customers want reveals hints in the Potion Book.
      for (const r of Object.values(RECIPE_MAP)) {
        if (r.kind === 'potion' && c.request.tags.every((tag) => r.tags.includes(tag)) && !ctx.state.hinted.includes(r.id)) ctx.state.hinted.push(r.id);
      }
      ctx.bus.emit('customer:ordered', { uid: c.uid, customerId: c.def.id, requestId: c.request.id });
    });
  }

  /** Send away a quest-intro customer (the QuestSystem calls this when done talking). */
  dismiss(c: Customer, reason: 'done' | 'impatient' | 'angry' | 'fled' = 'done'): void {
    this.leave(c, reason);
  }

  private leave(c: Customer, reason: 'done' | 'impatient' | 'angry' | 'fled'): void {
    const ctx = this.ctx;
    if (c.phase === 'leaving' || c.phase === 'gone') return;
    c.phase = 'leaving';
    c.atCounter = false;
    c.speed = reason === 'fled' ? 2.8 : 1.3;
    const a = ctx.shop.anchors;
    c.walk([a.doorInside, a.doorOutside], () => {
      c.phase = 'gone';
      ctx.world.remove(c);
    });
    ctx.later(reason === 'fled' ? 0.6 : 2.2, () => ctx.shop.door.open(ctx, 2));
    ctx.bus.emit('customer:left', { uid: c.uid, customerId: c.def.id, reason });
    this.assignSpots();
  }

  // -------------------------------------------------------------------------
  // Serving
  // -------------------------------------------------------------------------

  /** A potion flask resting in the serve zone (or touching the customer). */
  private findServed(c: Customer): FlaskItem | null {
    const z = this.ctx.shop.anchors.serveZone;
    for (const f of this.ctx.world.ofKind<FlaskItem>('flask')) {
      if (!f.potion || f.held || f.claimed || f.slot >= 0) continue;
      const p = f.object.position;
      const inZone = p.x > z.minX && p.x < z.maxX && p.z > z.minZ && p.z < z.maxZ && p.y > z.y - 0.05 && p.y < z.y + 0.5;
      const nearCustomer = Math.hypot(p.x - c.object.position.x, p.z - c.object.position.z) < 0.45 && p.y < c.def.height + 0.3;
      if (inZone || nearCustomer) return f;
    }
    return null;
  }

  private serve(c: Customer, flask: FlaskItem): void {
    const ctx = this.ctx;
    const potion = flask.potion!;
    flask.claimed = true;
    c.potion = potion;
    c.clearBubble(ctx);
    ctx.world.remove(flask);
    ctx.audio.play('glassClink', { x: c.object.position.x });
    c.phase = 'drinking';
    c.sprite.play('drink', true);
    ctx.audio.play('gulp', { x: c.object.position.x, delay: 0.4 });
    const waitedFraction = c.infinitePatience ? 0 : Math.min(1, c.waited / c.patienceMax);
    const j = judge(c.def, c.request, potion, waitedFraction, ctx.state.effects.reputationBonus);
    c.judgement = j;
    const recipe = RECIPE_MAP[potion.recipeId];
    ctx.later(1.5, () => {
      if (!c.alive) return;
      c.phase = 'reacting';
      c.effect = createDrinkEffect(ctx, c, recipe.drink, j);
    });
  }

  private settle(c: Customer): void {
    const ctx = this.ctx;
    const j = c.judgement!;
    const potion = c.potion!;
    const total = j.pay + j.tip;
    ctx.state.dayStats.served++;
    ctx.state.stats.sold++;
    if (j.outcome === 'happy' || j.outcome === 'delighted') {
      ctx.state.dayStats.happy++;
      ctx.state.stats.happy++;
    }
    if (total > 0) {
      ctx.state.addMoney(total);
      const drop = ctx.shop.anchors.coinDrop;
      const n = Math.min(10, Math.max(2, Math.round(total / 6)));
      for (let i = 0; i < n; i++) ctx.world.add(new Coin(ctx, drop.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, i * 0.02, (Math.random() - 0.5) * 0.15))), ctx);
      ctx.audio.play('coins', { x: drop.x, amount: n });
      ctx.ui.floatText(drop.clone().add(new THREE.Vector3(0, 0.3, 0)), `+${total}`, '#fee761');
      if (j.tip > 0) ctx.later(0.4, () => ctx.ui.floatText(drop.clone().add(new THREE.Vector3(0.3, 0.5, 0)), t('order.tip', { n: j.tip }), '#63c74d'));
    }
    if (j.reputation !== 0) {
      ctx.state.addReputation(j.reputation);
      ctx.bus.emit('toast', { text: j.reputation > 0 ? t('toast.reputationUp', { n: j.reputation }) : t('toast.reputationDown', { n: -j.reputation }), kind: j.reputation > 0 ? 'good' : 'bad' });
    }
    ctx.bus.emit('customer:served', { uid: c.uid, customerId: c.def.id, outcome: j.outcome, paid: total, recipeId: potion.recipeId, tier: potion.tier });
    if (j.outcome === 'happy' || j.outcome === 'delighted') ctx.bus.emit('mentor:say', { text: t('mentor.goodSale'), priority: 0, mood: 'happy' });
    else if (j.outcome !== 'weak') ctx.bus.emit('mentor:say', { text: t('mentor.badSale'), priority: 1, mood: 'worried' });
    if (c.quest?.mode === 'deliver') this.onQuestDelivered?.(c, j.outcome === 'happy' || j.outcome === 'delighted');
    const reason = j.outcome === 'harmful' ? 'angry' : 'done';
    ctx.later(1.2, () => {
      if (c.alive) {
        const good = j.outcome === 'happy' || j.outcome === 'delighted';
        c.line(ctx, good || j.outcome === 'weak' ? 'leave' : 'angry', good ? 'happy' : 'angry');
        this.leave(c, reason);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Frogs
  // -------------------------------------------------------------------------

  private turnIntoFrog(c: Customer): void {
    const ctx = this.ctx;
    c.phase = 'transformed';
    c.atCounter = false;
    c.object.visible = false;
    c.clearBubble(ctx);
    const frog = new Frog(ctx, c, c.object.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
    ctx.world.add(frog, ctx);
    this.frogs.set(c.uid, frog);
    ctx.state.stats.frogs++;
    ctx.state.dayStats.frogs++;
    ctx.bus.emit('customer:frog', { uid: c.uid });
    ctx.bus.emit('mentor:say', { text: t('mentor.frog'), priority: 5, mood: 'worried' });
    ctx.bus.emit('chaos', { amount: 0.8 });
    // Everyone else in the shop panics.
    for (const other of this.customers) {
      if (other === c || other.phase === 'gone' || other.phase === 'leaving') continue;
      other.sprite.play('surprised');
      other.say(ctx, '!!!', 'worried', 1.5);
    }
    this.assignSpots();
  }

  private cureFrog(uid: number): void {
    const ctx = this.ctx;
    const frog = this.frogs.get(uid);
    if (!frog) return;
    const c = frog.customer;
    const p = frog.object.position.clone();
    this.mentor?.cast(ctx, p);
    ctx.vfx.puff(p, '#e8e0f8', 30, 1.2);
    ctx.audio.play('poof', { x: p.x });
    ctx.world.remove(frog);
    this.frogs.delete(uid);
    c.object.position.set(p.x, 0, p.z);
    c.object.visible = true;
    c.phase = 'reacting';
    c.sprite.play('angry');
    ctx.bus.emit('toast', { text: t('toast.frogCured'), kind: 'good' });
    ctx.later(0.9, () => {
      if (!c.alive) return;
      c.line(ctx, 'frogReturn', 'angry');
      ctx.state.addReputation(1);
      ctx.later(2.6, () => this.leave(c, 'angry'));
    });
  }

  private frogEscaped(uid: number): void {
    const ctx = this.ctx;
    const frog = this.frogs.get(uid);
    if (!frog) return;
    const c = frog.customer;
    ctx.world.remove(frog);
    this.frogs.delete(uid);
    c.phase = 'gone';
    ctx.world.remove(c);
    ctx.state.addReputation(-8);
    ctx.bus.emit('toast', { text: t('toast.frogEscaped'), kind: 'bad' });
    ctx.bus.emit('customer:left', { uid: c.uid, customerId: c.def.id, reason: 'fled' });
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    if (ctx.paused) return;
    // Spawn scheduled visits (max 3 customers inside at once).
    const inside = this.customers.filter((c) => c.phase !== 'gone').length;
    const next = this.pendingVisits[0];
    if (next && ctx.state.hour >= next.hour && inside < 3 && (ctx.state.shopOpen || next.quest)) {
      next.spawned = true;
      this.spawn(next);
    }

    for (const c of this.customers) {
      if (!c.alive) continue;
      if (c.phase === 'waiting') {
        const f = this.findServed(c);
        if (f) {
          const held = (this.serveTimers.get(f.id) ?? 0) + dt;
          this.serveTimers.set(f.id, held);
          if (held > 0.35) {
            this.serveTimers.delete(f.id);
            this.serve(c, f);
          }
        }
        if (!c.infinitePatience && c.patience <= 0) {
          c.line(ctx, 'angry', 'angry');
          c.sprite.play('angry');
          ctx.state.addReputation(-3);
          ctx.bus.emit('toast', { text: t('toast.reputationDown', { n: 3 }), kind: 'bad' });
          ctx.later(1.5, () => this.leave(c, 'impatient'));
          c.phase = 'reacting';
        }
      }
      if (c.phase === 'reacting' && c.effect?.done) {
        const fx = c.effect;
        c.effect = null;
        if (fx.transformed) this.turnIntoFrog(c);
        else if (c.judgement) this.settle(c);
      } else if (c.phase === 'reacting' && c.effect?.transformed && !this.frogs.has(c.uid)) {
        // transform happens at the end of the effect
      }
    }
    for (let i = this.customers.length - 1; i >= 0; i--) if (!this.customers[i].alive) this.customers.splice(i, 1);
  }

  /** Remove everyone (new day / load). */
  clearAll(): void {
    for (const c of this.customers) this.ctx.world.remove(c);
    for (const f of this.frogs.values()) this.ctx.world.remove(f);
    this.customers.length = 0;
    this.frogs.clear();
  }

  serialize(): { visits: Visit[] } {
    return { visits: this.visits.map((v) => ({ ...v })) };
  }

  restore(data: { visits: Visit[] } | undefined): void {
    if (!data) return;
    // Customers who were inside when saving come back later.
    // Visitors who were inside the shop when the game was saved come back.
    this.visits = data.visits.map((v) => ({ ...v }));
    for (const v of this.visits) if (v.spawned && v.hour >= this.ctx.state.hour - 1.5) v.spawned = false;
  }
}
