// The wandering merchant: every third day he walks in with his pack, sets up
// a little stall by the window side of the shop and sells rare ingredients,
// a deal of the day and mystery pouches – and buys potions off your shelf.
// He packs up in the late afternoon (or when the shop closes).

import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import type { GameSystem } from '../../core/Game';
import { Entity, type HoverInfo } from '../../world/Entity';
import { characterSheet } from '../../rendering/three/sprites/CharacterPainter';
import { PixelSprite } from '../../rendering/three/sprites/PixelSprite';
import { INGREDIENTS } from '../../data/ingredients';
import { Random, rng } from '../../core/Random';
import { t, tr } from '../../core/i18n';
import { toon } from '../../rendering/three/materials';
import { woodPlank } from '../../rendering/three/textures/PixelTextures';
import { box, cyl, mesh } from '../../rendering/three/models/common';
import { lanternModel, rugModel } from '../../rendering/three/models/decorModels';
import { CG, type BodyHandle } from '../../physics/PhysicsTypes';
import type { CharacterLook } from '../../data/types';
import type { FlaskItem } from '../potion/FlaskItem';
import { RECIPES, RECIPE_MAP } from '../../data/potions';
import type { RecipeDef } from '../../data/types';
import { BUNDLE, type ShopSystem } from './ShopSystem';

/** He comes on day 3, 6, 9… */
export const MERCHANT_INTERVAL = 3;
export const MERCHANT_HOURS: [number, number] = [8.6, 17.5];

export function isMerchantDay(day: number): boolean {
  return day >= MERCHANT_INTERVAL && day % MERCHANT_INTERVAL === 0;
}

export function daysUntilMerchant(day: number): number {
  for (let d = day; d < day + MERCHANT_INTERVAL + 1; d++) if (isMerchantDay(d)) return d - day;
  return MERCHANT_INTERVAL;
}

export interface Ware {
  id: string;
  kind: 'rare' | 'deal' | 'mystery';
  ingredient?: string;
  amount: number;
  price: number;
  stock: number;
}

const LOOK: CharacterLook = {
  skin: '#d8a070',
  hair: '#c0cbdc',
  main: '#733e39',
  second: '#b86f50',
  accent: '#feae34',
  eyes: '#3e2731',
  extra: ['backpack', 'strawhat', 'beard'],
};

const RARE = ['moon_flower', 'frost_crystal', 'bog_toad_eye', 'phoenix_feather', 'dragon_scale'];

// ---------------------------------------------------------------------------
// The merchant in the shop
// ---------------------------------------------------------------------------

class MerchantNPC extends Entity {
  readonly kind = 'merchant';
  readonly sprite: PixelSprite;
  private path: THREE.Vector3[] = [];
  private onArrive: (() => void) | null = null;
  private chatter = rng.range(10, 18);
  bubble = -1;
  leaving = false;

  constructor(start: THREE.Vector3) {
    super();
    const sheet = characterSheet('merchant_baha', 'villager', LOOK);
    this.sprite = new PixelSprite(sheet, 1.72 / (sheet.frameH / 40) / 0.97);
    this.object.add(this.sprite.root);
    this.object.position.copy(start);
    this.radius = 0.35;
  }

  override hover(ctx: GameContext): HoverInfo {
    void ctx;
    return { title: t('merchant.name'), subtitle: t('merchant.title'), hint: t('hint.merchant') };
  }

  override cursor() {
    return 'point' as const;
  }

  override press(ctx: GameContext) {
    if (this.leaving) return null;
    ctx.audio.play('caravanBells', { x: this.object.position.x, volume: 0.6 });
    this.say(ctx, t('merchant.hello'));
    ctx.ui.openPanel('merchant');
    return null;
  }

  walk(points: THREE.Vector3[], then?: () => void): void {
    this.path = points.map((p) => p.clone());
    this.onArrive = then ?? null;
  }

  say(ctx: GameContext, text: string, duration = 3.5): void {
    if (this.bubble >= 0) ctx.ui.removeBubble(this.bubble);
    this.bubble = ctx.ui.say(this.object, text, { name: t('merchant.name'), duration, offsetY: 2.05 });
    ctx.voice.babble(text, { pitch: 0.8, speed: 1.1, wave: 'triangle' }, this.object.position.x);
    this.sprite.play('talk');
  }

  override update(ctx: GameContext, dt: number): void {
    if (this.path.length > 0) {
      const target = this.path[0];
      const p = this.object.position;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = 1.15 * dt;
      if (d <= step) {
        p.x = target.x;
        p.z = target.z;
        this.path.shift();
        if (this.path.length === 0) {
          this.sprite.play('idle');
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        this.sprite.play('walk');
        if (Math.abs(dx) > 0.05) this.sprite.facing = dx > 0 ? 1 : -1;
        ctx.vfx.rate(`mstep${this.id}`, 3.2, dt, () => ctx.audio.play('footstep', { x: p.x, volume: 0.5, pitch: 0.8, minGap: 0.05 }));
      }
    } else if (!this.leaving) {
      this.chatter -= dt;
      if (this.chatter <= 0) {
        this.chatter = rng.range(18, 30);
        if (!ctx.ui.isPanelOpen('merchant')) this.say(ctx, t(`merchant.chat${rng.int(1, 4)}`));
      }
      if (this.sprite.current === 'talk' && this.chatter < 14) this.sprite.play('idle');
    }
    this.sprite.update(dt, ctx.renderer.rig.camera);
  }

  override dispose(ctx: GameContext): void {
    if (this.bubble >= 0) ctx.ui.removeBubble(this.bubble);
    this.sprite.dispose();
    super.dispose(ctx);
  }
}

// ---------------------------------------------------------------------------
// The system: schedule, stall, wares
// ---------------------------------------------------------------------------

export class TravelingMerchant implements GameSystem {
  npc: MerchantNPC | null = null;
  /** Admin menu: make today a merchant day. */
  forceDay = -1;
  wares: Ware[] = [];
  private waresDay = -1;
  private stall: THREE.Group | null = null;
  private stallBodies: BodyHandle[] = [];
  readonly spot = new THREE.Vector3(-1.15, 0, 2.02);

  constructor(
    private readonly ctx: GameContext,
    private readonly shop: ShopSystem,
  ) {
    ctx.bus.on('day:start', () => this.dismiss(true));
  }

  get present(): boolean {
    return !!this.npc && !this.npc.leaving;
  }

  /** Today's goods (deterministic per day; purchases are remembered). */
  stock(): Ware[] {
    const s = this.ctx.state;
    if (this.waresDay !== s.day) {
      this.waresDay = s.day;
      const r = new Random(s.day * 7919 + 17);
      const rare = [...RARE].sort(() => r.next() - 0.5).slice(0, 3);
      const wares: Ware[] = rare.map((id) => {
        const def = INGREDIENTS[id];
        const amount = id === 'phoenix_feather' ? 1 : 2;
        return { id: `rare_${id}`, kind: 'rare', ingredient: id, amount, price: Math.round(def.price * amount * 1.35), stock: id === 'phoenix_feather' ? 1 : 2 };
      });
      const basics = Object.values(INGREDIENTS).filter((d) => d.sold !== false && s.isUnlocked(d.id));
      const deal = r.pick(basics.length ? basics : Object.values(INGREDIENTS));
      wares.push({ id: `deal_${deal.id}`, kind: 'deal', ingredient: deal.id, amount: BUNDLE, price: Math.max(1, Math.round(this.shop.ingredientPrice(deal.id) * 0.6)), stock: 2 });
      wares.push({ id: 'mystery', kind: 'mystery', amount: 3, price: 25, stock: 3 });
      this.wares = wares;
    }
    const bought = s.merchant.day === s.day ? s.merchant.bought : {};
    return this.wares.map((w) => ({ ...w, stock: Math.max(0, w.stock - (bought[w.id] ?? 0)) }));
  }

  buy(id: string): boolean {
    const ctx = this.ctx;
    const s = ctx.state;
    const w = this.stock().find((x) => x.id === id);
    if (!w || w.stock <= 0) return false;
    if (!s.canAfford(w.price)) {
      ctx.audio.play('denied', {});
      ctx.bus.emit('toast', { text: t('toast.notEnoughGold'), kind: 'warn' });
      return false;
    }
    s.addMoney(-w.price);
    if (s.merchant.day !== s.day) s.merchant = { day: s.day, bought: {} };
    s.merchant.bought[id] = (s.merchant.bought[id] ?? 0) + 1;
    const got: string[] = [];
    if (w.kind === 'mystery') {
      const pool = ['glowing_mushroom', 'glowing_mushroom', 'bat_wing', 'dragon_scale', 'moon_flower', 'frost_crystal', 'bog_toad_eye', 'phoenix_feather'];
      for (let i = 0; i < w.amount; i++) {
        const ing = rng.weighted(pool, (x) => (x === 'phoenix_feather' ? 0.25 : 1))!;
        s.addStock(ing, 1);
        s.unlock(ing);
        got.push(tr(INGREDIENTS[ing].name));
      }
    } else if (w.ingredient) {
      s.addStock(w.ingredient, w.amount);
      s.unlock(w.ingredient);
      got.push(`${tr(INGREDIENTS[w.ingredient].name)} ×${w.amount}`);
    }
    ctx.audio.play('purchase', {});
    ctx.bus.emit('purchase', { id, kind: 'supply' });
    ctx.bus.emit('merchant:trade', { kind: 'buy', amount: w.price });
    ctx.bus.emit('toast', { text: t('toast.purchased', { name: got.join(', ') }), kind: 'good' });
    ctx.bus.emit('save:request', {});
    return true;
  }

  /** Potions he would buy: everything on the shelf. */
  sellable(): FlaskItem[] {
    return this.ctx.shop.shelf.potions();
  }

  offerFor(f: FlaskItem): number {
    return Math.max(1, Math.round((f.potion?.price ?? 0) * 1.25));
  }

  sell(f: FlaskItem): boolean {
    const ctx = this.ctx;
    if (!f.alive || !f.potion) return false;
    const price = this.offerFor(f);
    ctx.state.addMoney(price);
    ctx.world.remove(f);
    ctx.audio.play('coins', { amount: 6 });
    ctx.bus.emit('merchant:trade', { kind: 'sell', amount: price });
    ctx.bus.emit('toast', { text: t('merchant.sold', { n: price }), kind: 'good' });
    ctx.bus.emit('save:request', {});
    return true;
  }

  // -------------------------------------------------------------------------
  // Secret recipes: he teaches them in exchange for potions
  // -------------------------------------------------------------------------

  /** Secret recipes the apprentice does not know yet. */
  recipeOffers(): RecipeDef[] {
    return RECIPES.filter((r) => r.secret && r.learnCost && !this.ctx.state.knowsRecipe(r.id));
  }

  /** Finished potions in the shop that could pay for a recipe (not in hand, not promised). */
  private tradablePotions(): FlaskItem[] {
    const held = this.ctx.interaction.grab?.entity;
    return this.ctx.world.ofKind<FlaskItem>('flask').filter((f) => f.alive && !!f.potion && !f.claimed && f !== held);
  }

  /** How many of each required potion are available ({recipe → have}). */
  haveFor(r: RecipeDef): Record<string, number> {
    const have: Record<string, number> = {};
    const pots = this.tradablePotions();
    for (const c of r.learnCost ?? []) have[c.recipe] = pots.filter((f) => f.potion!.recipeId === c.recipe).length;
    return have;
  }

  canTeach(r: RecipeDef): boolean {
    const have = this.haveFor(r);
    return (r.learnCost ?? []).every((c) => (have[c.recipe] ?? 0) >= c.count);
  }

  /** Hand over the potions and learn the recipe. */
  teach(id: string): boolean {
    const ctx = this.ctx;
    const r = RECIPE_MAP[id];
    if (!r || !r.learnCost || ctx.state.knowsRecipe(id)) return false;
    if (!this.canTeach(r)) {
      ctx.audio.play('denied', {});
      ctx.bus.emit('toast', { text: t('merchant.needPotions'), kind: 'warn' });
      return false;
    }
    const pots = this.tradablePotions();
    for (const c of r.learnCost) {
      // The weakest ones go first – he is a fair trader, not a generous one.
      const pay = pots
        .filter((f) => f.potion!.recipeId === c.recipe)
        .sort((a, b) => a.potion!.tier - b.potion!.tier)
        .slice(0, c.count);
      for (const f of pay) ctx.world.remove(f);
    }
    ctx.state.learnRecipe(id);
    ctx.state.count('recipesLearned');
    ctx.audio.play('discovery', {});
    ctx.bus.emit('recipe:learned', { id, source: 'merchant' });
    ctx.bus.emit('toast', { text: t('merchant.learned', { name: tr(r.name) }), kind: 'quest' });
    this.npc?.say(ctx, t('merchant.teachLine'), 4);
    ctx.bus.emit('save:request', {});
    return true;
  }

  // -------------------------------------------------------------------------

  update(dt: number): void {
    void dt;
    const ctx = this.ctx;
    if (ctx.paused) return;
    const s = ctx.state;
    const today = isMerchantDay(s.day) || this.forceDay === s.day;
    const due = today && (s.hour >= MERCHANT_HOURS[0] || this.forceDay === s.day) && s.hour < MERCHANT_HOURS[1] + (this.forceDay === s.day ? 4 : 0) && s.shopOpen;
    if (due && !this.npc) this.arrive();
    else if (!due && this.present) this.leave();
  }

  private arrive(): void {
    const ctx = this.ctx;
    const a = ctx.shop.anchors;
    const npc = new MerchantNPC(a.doorOutside);
    this.npc = ctx.world.add(npc, ctx);
    ctx.shop.door.open(ctx, 2.5);
    ctx.audio.play('caravanBells', { x: a.doorInside.x });
    ctx.bus.emit('toast', { text: t('merchant.arrived'), kind: 'quest' });
    ctx.bus.emit('merchant:arrived', {});
    this.buildStall();
    npc.walk([a.doorInside, new THREE.Vector3(2.4, 0, -0.3), new THREE.Vector3(1.05, 0, 1.4), this.spot.clone().add(new THREE.Vector3(0.45, 0, -0.05))], () => {
      npc.sprite.facing = -1;
      npc.say(ctx, t('merchant.greet'), 5);
    });
  }

  private leave(): void {
    const ctx = this.ctx;
    const npc = this.npc;
    if (!npc) return;
    npc.leaving = true;
    if (ctx.ui.isPanelOpen('merchant')) ctx.ui.openPanel(null);
    npc.say(ctx, t('merchant.bye'), 3);
    const a = ctx.shop.anchors;
    ctx.later(1.5, () => {
      this.removeStall();
      npc.walk([new THREE.Vector3(1.05, 0, 1.4), new THREE.Vector3(2.4, 0, -0.3), a.doorInside, a.doorOutside], () => {
        ctx.world.remove(npc);
        if (this.npc === npc) this.npc = null;
      });
      ctx.later(6, () => ctx.shop.door.open(ctx, 2));
    });
  }

  /** Remove him at once (new day, loading). */
  dismiss(silent = false): void {
    void silent;
    if (this.npc) this.ctx.world.remove(this.npc);
    this.npc = null;
    this.removeStall();
  }

  /** The stall stands in the shop (online guests copy it). */
  get stallUp(): boolean {
    return !!this.stall;
  }

  /** Online guests show the stall while the host's merchant is in. */
  showStall(on: boolean): void {
    if (on && !this.stall) this.buildStall();
    else if (!on && this.stall) this.removeStall();
  }

  private buildStall(): void {
    const ctx = this.ctx;
    this.removeStall();
    const g = new THREE.Group();
    const rugM = rugModel(1.5, 0.9);
    rugM.position.set(0, 0.008, 0.05);
    g.add(rugM);
    const plank = toon({ map: woodPlank('light') });
    const crates: Array<[number, number, number, number]> = [
      [-0.45, 0.17, -0.15, 0.34],
      [-0.1, 0.13, -0.2, 0.26],
      [-0.42, 0.44, -0.12, 0.2],
    ];
    for (const [x, y, z, sz] of crates) {
      const c = mesh(box(sz, sz, sz), plank);
      c.position.set(x, y, z);
      c.rotation.y = x * 0.6;
      g.add(c);
    }
    // Wares on the crates: little bottles and a sack
    const bottleCols = ['#b55088', '#2ce8f5', '#63c74d', '#feae34'];
    bottleCols.forEach((col, i) => {
      const b = mesh(cyl(0.025, 0.035, 0.1, 6), toon({ color: col, emissive: col, emissiveIntensity: 0.35 }));
      b.position.set(-0.55 + i * 0.08, 0.39, -0.1);
      g.add(b);
    });
    const sack = mesh(new THREE.SphereGeometry(0.14, 7, 5), toon({ color: '#c28569' }));
    sack.scale.set(1, 0.8, 1);
    sack.position.set(0.15, 0.11, -0.2);
    g.add(sack);
    const lamp = lanternModel();
    const pole = mesh(cyl(0.015, 0.015, 1.1, 5), toon({ color: '#733e39' }));
    pole.position.set(-0.75, 0.55, -0.25);
    g.add(pole);
    lamp.group.position.set(-0.75, 1.0, -0.18);
    lamp.group.scale.setScalar(0.8);
    g.add(lamp.group);
    g.position.copy(this.spot);
    ctx.scene.add(g);
    this.stall = g;
    for (const [x, y, z, sz] of crates) {
      this.stallBodies.push(
        ctx.physics.createBody({
          shape: { type: 'box', size: [sz, sz, sz] },
          motion: 'static',
          position: { x: this.spot.x + x, y, z: this.spot.z + z },
          group: CG.STATIC,
        }),
      );
    }
  }

  private removeStall(): void {
    if (this.stall) this.stall.removeFromParent();
    this.stall = null;
    for (const b of this.stallBodies) this.ctx.physics.removeBody(b);
    this.stallBodies = [];
  }
}
