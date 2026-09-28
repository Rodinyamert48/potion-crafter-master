// Recipe discovery and the experiment journal. Every bottling is recorded;
// the first time a recipe is bottled it is "discovered" and its page in the
// Potion Book fills in with the player's own notes.

import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import { RECIPE_MAP } from '../../data/potions';
import { t, tr } from '../../core/i18n';

export class Discovery {
  constructor(ctx: GameContext) {
    ctx.bus.on('potion:bottled', ({ result }) => {
      const s = ctx.state;
      const recipe = RECIPE_MAP[result.recipeId];
      s.stats.brewed++;
      const entry = s.discovered[result.recipeId];
      const isNew = !entry;
      if (entry) {
        entry.count++;
        entry.bestTier = Math.max(entry.bestTier, result.tier);
      } else {
        s.discovered[result.recipeId] = {
          day: s.day,
          count: 1,
          bestTier: result.tier,
          ingredients: result.ingredients,
          brewTemp: Math.round(result.brewTemp),
        };
        s.dayStats.discoveries++;
      }
      s.journal.push({
        day: s.day,
        hour: s.hour,
        recipeId: result.recipeId,
        tier: result.tier,
        success: recipe.kind === 'potion',
        ingredients: result.ingredients,
        brewTemp: Math.round(result.brewTemp),
      });
      if (s.journal.length > 80) s.journal.shift();
      const cauldron = ctx.shop.cauldron;
      const p = new THREE.Vector3(cauldron.center.x, cauldron.rimY + 0.4, cauldron.center.z);
      if (isNew) {
        ctx.bus.emit('toast', { text: `${t('toast.discovered')} ${tr(recipe.name)}`, kind: 'discovery' });
        ctx.audio.play('discovery', {});
        ctx.vfx.stars(p, result.color, 40);
        ctx.vfx.runes(p, result.color2, 8, 0.8);
        ctx.bus.emit('potion:discovered', { recipeId: result.recipeId });
      } else {
        ctx.bus.emit('toast', { text: t('toast.bottled', { name: tr(recipe.name) }), kind: recipe.kind === 'potion' ? 'good' : 'warn' });
      }
      ctx.bus.emit('save:request', {});
    });
  }
}
