// Buying supplies and shop upgrades. Upgrades change real mechanics
// (cauldron capacity, heating, bellows power, grinding speed…) and some
// add visible decorations to the shop.

import type { GameContext } from '../../core/GameContext';
import { UPGRADE_MAP, SUPPLIES } from '../../data/upgrades';
import { INGREDIENTS } from '../../data/ingredients';
import { t, tr } from '../../core/i18n';
import { toon } from '../../rendering/three/materials';
import { brass } from '../../rendering/three/textures/PixelTextures';
import * as THREE from 'three';

export const BUNDLE = 3;

export class ShopSystem {
  constructor(private readonly ctx: GameContext) {}

  ingredientPrice(id: string): number {
    const def = INGREDIENTS[id];
    return Math.max(1, Math.round(def.price * BUNDLE * (1 - this.ctx.state.effects.discount)));
  }

  supplyPrice(kind: 'flasks' | 'logs'): number {
    return Math.max(1, Math.round(SUPPLIES[kind].price * (1 - this.ctx.state.effects.discount)));
  }

  canBuyIngredient(id: string): { ok: boolean; reason?: string } {
    const s = this.ctx.state;
    const def = INGREDIENTS[id];
    if (!s.isUnlocked(id)) return { ok: false, reason: t('catalog.notUnlocked') };
    if (def.availability?.phases && !def.availability.phases.includes(s.phase)) return { ok: false, reason: t('catalog.onlyNight') };
    return { ok: s.canAfford(this.ingredientPrice(id)) };
  }

  buyIngredient(id: string): boolean {
    const ctx = this.ctx;
    const check = this.canBuyIngredient(id);
    if (!check.ok) return this.deny(check.reason);
    ctx.state.addMoney(-this.ingredientPrice(id));
    ctx.state.addStock(id, BUNDLE);
    ctx.audio.play('purchase', {});
    ctx.bus.emit('purchase', { id, kind: 'supply' });
    ctx.bus.emit('toast', { text: t('toast.purchased', { name: `${tr(INGREDIENTS[id].name)} ×${BUNDLE}` }), kind: 'good' });
    return true;
  }

  buySupply(kind: 'flasks' | 'logs'): boolean {
    const ctx = this.ctx;
    const price = this.supplyPrice(kind);
    if (!ctx.state.canAfford(price)) return this.deny();
    ctx.state.addMoney(-price);
    ctx.state.addStock(kind === 'flasks' ? 'flask' : 'log', SUPPLIES[kind].amount);
    ctx.audio.play('purchase', {});
    ctx.bus.emit('purchase', { id: kind, kind: 'supply' });
    ctx.bus.emit('toast', { text: t('toast.purchased', { name: t(kind === 'flasks' ? 'catalog.flasks' : 'catalog.logs') }), kind: 'good' });
    return true;
  }

  upgradeState(id: string): 'owned' | 'locked' | 'available' {
    const s = this.ctx.state;
    const u = UPGRADE_MAP[id];
    if (s.has(id)) return 'owned';
    if ((u.requires ?? []).some((r) => !s.has(r))) return 'locked';
    if (u.level > s.shopLevel) return 'locked';
    return 'available';
  }

  buyUpgrade(id: string): boolean {
    const ctx = this.ctx;
    const u = UPGRADE_MAP[id];
    if (!u || this.upgradeState(id) !== 'available') return this.deny();
    if (!ctx.state.canAfford(u.price)) return this.deny();
    ctx.state.addMoney(-u.price);
    ctx.state.upgrades.push(id);
    this.apply();
    ctx.audio.play('purchase', {});
    ctx.audio.play('chime', { delay: 0.3 });
    ctx.bus.emit('purchase', { id, kind: 'upgrade' });
    ctx.bus.emit('toast', { text: t('toast.purchased', { name: tr(u.name) }), kind: 'good' });
    ctx.bus.emit('save:request', {});
    return true;
  }

  private deny(reason?: string): false {
    this.ctx.audio.play('denied', {});
    this.ctx.bus.emit('toast', { text: reason ?? t('toast.notEnoughGold'), kind: 'warn' });
    return false;
  }

  /** Apply owned upgrades to the world (visuals + capacity). */
  apply(): void {
    const ctx = this.ctx;
    const s = ctx.state;
    const cap = s.effects.cauldronCapacity;
    ctx.shop.cauldron.setVariant(s.has('magic_cauldron') ? 'magic' : s.has('advanced_cauldron') ? 'copper' : 'iron', cap);
    for (const [id, obj] of ctx.shop.upgradeProps) obj.visible = s.has(id);
    // Golden pestle for the grinder, brass bellows tint.
    if (s.has('alchemy_grinder')) {
      ctx.shop.mortar.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.position.y > 0.03) m.material = toon({ map: brass(), emissive: '#feae34', emissiveIntensity: 0.2 });
      });
    }
  }
}
