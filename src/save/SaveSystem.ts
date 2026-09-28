// Persistence in LocalStorage: the game model, the brew in the cauldron, the
// hearth, loose items lying around the shop, the day schedule and settings
// (stored separately). Versioned so older saves can be migrated.

import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { SavedEntity } from '../world/Entity';
import { IngredientItem } from '../gameplay/ingredients/IngredientItem';
import { FlaskItem } from '../gameplay/potion/FlaskItem';
import { LogItem } from '../gameplay/stations/ShopFixtures';
import type { BrewSave } from '../gameplay/potion/BrewChemistry';
import type { CustomerSystem, Visit } from '../gameplay/customers/CustomerSystem';
import type { PotionResult } from '../gameplay/potion/PotionEvaluator';

const KEY = 'witchs-brew:save';
const VERSION = 1;

interface SaveFile {
  version: number;
  savedAt: number;
  state: Record<string, unknown>;
  cauldron: BrewSave;
  hearth: { fuel: number; damper: number; lift?: number };
  bucket: number;
  entities: SavedEntity[];
  visits: Visit[];
}

export class SaveSystem {
  private dirty = false;
  private timer = 0;
  /** False once the save was erased (the page is about to reload). */
  enabled = true;
  /** Only a game in progress is saved – never the title-screen backdrop. */
  active = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly customers: CustomerSystem,
  ) {
    ctx.bus.on('save:request', () => (this.dirty = true));
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
    });
  }

  static hasSave(): boolean {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false;
    }
  }

  static erase(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  update(dt: number): void {
    if (!this.enabled || !this.active) return;
    this.timer += dt;
    if (this.dirty && this.timer > 2) this.save();
    else if (this.timer > 20) this.save();
  }

  save(): boolean {
    if (!this.enabled || !this.active) return false;
    const ctx = this.ctx;
    this.timer = 0;
    this.dirty = false;
    const entities: SavedEntity[] = [];
    for (const e of ctx.world.entities.values()) {
      if (!e.alive || e.held) continue;
      const s = e.serialize();
      if (s && s.type !== 'bucket') entities.push(s);
    }
    const file: SaveFile = {
      version: VERSION,
      savedAt: Date.now(),
      state: ctx.state.toJSON(),
      cauldron: ctx.shop.cauldron.chem.serialize(),
      hearth: { ...ctx.shop.hearth.serializeState(), lift: ctx.shop.cauldron.lift },
      bucket: ctx.shop.bucket.water,
      entities,
      visits: this.customers.serialize().visits,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(file));
      return true;
    } catch (err) {
      console.warn('Save failed', err);
      return false;
    }
  }

  load(): boolean {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      return false;
    }
    if (!raw) return false;
    let file: SaveFile;
    try {
      file = JSON.parse(raw) as SaveFile;
    } catch {
      return false;
    }
    if (!file || typeof file !== 'object') return false;
    file = migrate(file);
    const ctx = this.ctx;
    ctx.state.load(file.state);
    if (file.cauldron) ctx.shop.cauldron.chem.restore(file.cauldron);
    if (file.hearth) {
      ctx.shop.hearth.fuel = file.hearth.fuel;
      ctx.shop.hearth.damper = file.hearth.damper;
      if (typeof file.hearth.lift === 'number') ctx.shop.cauldron.setLift(file.hearth.lift);
    }
    if (typeof file.bucket === 'number') ctx.shop.bucket.water = file.bucket;
    for (const s of file.entities ?? []) {
      try {
        if (s.type === 'ingredient') {
          const item = IngredientItem.restore(ctx, s);
          if (item) ctx.world.add(item, ctx);
        } else if (s.type === 'flask') {
          const f = new FlaskItem(ctx, { x: s.p[0], y: s.p[1] + 0.05, z: s.p[2] }, (s.potion as PotionResult | null) ?? null);
          ctx.world.add(f, ctx);
          if ((s.slot as number) >= 0) ctx.shop.shelf.tryStore(ctx, f);
        } else if (s.type === 'log') {
          ctx.world.add(new LogItem(ctx, { x: s.p[0], y: s.p[1] + 0.05, z: s.p[2] }), ctx);
        }
      } catch (err) {
        console.warn('Could not restore entity', s, err);
      }
    }
    this.customers.restore({ visits: file.visits ?? [] });
    void THREE;
    return true;
  }
}

function migrate(file: SaveFile): SaveFile {
  // Version 1 is the first format; future versions transform older saves here.
  if (!file.version) file.version = 1;
  return file;
}
