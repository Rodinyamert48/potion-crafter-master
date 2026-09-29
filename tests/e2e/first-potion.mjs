// End-to-end playtest of the guided first brew, played with real input:
// take a mushroom, slice it on the board, pour water with the bucket, feed
// the hearth and pump the bellows, drop the slices in, stir with the ladle,
// dip a flask, put the potion on the counter and get paid. Then save,
// reload and continue.
//
//   npm run dev            # in another terminal
//   npm run e2e

import { launch, check } from './lib.mjs';

const G = await launch();
const { page, log, wait } = G;
let failed = false;
try {
  await G.boot();
  await page.getByRole('button', { name: /new game/i }).click();
  await G.waitFor(`wb.app.tutorial.index >= 1`, 120000, 'the first customer to order');
  await wait(2500);
  log('Hazel ordered');

  // Mushroom → cutting board
  await G.pressOn(`shop.sources.get('glowing_mushroom').object.position`, `shop.sources.get('glowing_mushroom')`);
  await G.trackTo(`shop.board.object.position`, 3500);
  await page.mouse.up();
  await wait(1500);
  check((await G.ev(`return shop.board.itemsOn(ctx).length`)) > 0, 'mushroom lies on the cutting board');

  // Knife: chop
  await G.waitFor(`wb.app.tutorial.index >= 2`, 8000, 'slice step');
  await wait(1500);
  await G.pressOn(`shop.knife.object.position`, `shop.knife`);
  await G.trackTo(`${G.ing('glowing_mushroom')}[0]?.object.position`, 1500);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Space');
    await G.trackTo(`${G.ing('glowing_mushroom')}[0]?.object.position`, 500);
  }
  await G.trackTo(`shop.knife.home`, 1200);
  await page.mouse.up();
  check((await G.ev(`return ${G.ing('glowing_mushroom')}.filter(e => e.state === 'sliced').length`)) >= 2, 'mushroom sliced');

  // Bucket: pour into the cauldron
  await G.waitFor(`wb.app.tutorial.index >= 3`, 10000, 'water step');
  await wait(2000);
  await G.pressOn(`shop.bucket.object.position`, `shop.bucket`);
  await G.trackTo(G.RIM, 2500);
  await page.keyboard.down('Space');
  await G.trackTo(G.RIM, 2600);
  await page.keyboard.up('Space');
  await G.trackTo(`shop.barrel.object.position`, 1500);
  await page.mouse.up();
  check((await G.ev(`return shop.cauldron.chem.water`)) >= 1.6, 'cauldron filled with water');

  // Fire: a log into the hearth, then the bellows
  await G.waitFor(`wb.app.tutorial.index >= 4`, 10000, 'fire step');
  await wait(2200);
  await G.pressOn(`shop.sources.get('log').object.position`, `shop.sources.get('log')`);
  await G.trackTo(`shop.hearth.center.clone().add(new V(0, 0.25, 0.75))`, 2500);
  await page.mouse.up();
  await wait(1200);
  const bel = await G.pressOn(`shop.bellows.object.position`, `shop.bellows`);
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(bel.x, bel.y + 90, { steps: 4 });
    await wait(160);
    await page.mouse.move(bel.x, bel.y, { steps: 4 });
    await wait(160);
  }
  await page.mouse.up();
  check((await G.ev(`return shop.hearth.intensity`)) > 0.5, 'fire is burning');

  // Slices into the cauldron
  await G.waitFor(`wb.app.tutorial.index >= 5`, 20000, 'add step');
  await wait(2200);
  const outside = `${G.ing('glowing_mushroom')}.filter(e => !shop.cauldron.inside.has(e.id))[0]`;
  for (let i = 0; i < 3 && (await G.ev(`return !!(${outside})`)); i++) {
    await G.pressOn(`${outside}.object.position`, outside);
    await G.trackTo(G.RIM, 2000);
    await page.mouse.up();
    await wait(600);
  }
  await G.waitFor(`shop.cauldron.chem.temperature >= 45 && shop.cauldron.chem.essences.healing > 0.8`, 60000, 'the brew to warm up');
  log('brew is warm');

  // Stir gently with the ladle
  await G.waitFor(`wb.app.tutorial.index >= 7`, 10000, 'stir step');
  await wait(2200);
  await G.pressOn(`shop.ladle.object.localToWorld(new V(0, 0.75, 0))`, `shop.ladle`);
  const c = await G.screenOf(G.RIM);
  for (let k = 0; k < 90; k++) {
    const a = k * 0.35;
    await page.mouse.move(c.x + Math.cos(a) * 55, c.y + Math.sin(a) * 30, { steps: 2 });
    await wait(60);
  }
  await page.mouse.up();

  // Bottle and serve
  await G.waitFor(`wb.app.tutorial.index >= 8`, 20000, 'bottle step');
  await wait(2200);
  await G.pressOn(`shop.sources.get('flask').object.position`, `shop.sources.get('flask')`);
  await G.trackTo(G.RIM, 4000);
  const potion = await G.ev(`const g = ctx.interaction.grab; return g?.entity.potion?.recipeId ?? null;`);
  check(potion === 'healing_potion', `bottled a healing potion (${potion})`);
  await G.trackTo(`(() => { const z = shop.anchors.serveZone; return new V((z.minX + z.maxX) / 2, z.y + 0.1, (z.minZ + z.maxZ) / 2); })()`, 3500);
  await page.mouse.up();
  await G.waitFor(`wb.app.tutorial.index >= 10`, 40000, 'Hazel to drink it');
  await wait(3000);
  const money = await G.ev(`return ctx.state.money`);
  check(money > 40, `got paid (${money} gold)`);

  // Save, reload, continue
  await G.ev(`wb.app.save.save(); return 1;`);
  await page.reload();
  await page.waitForFunction(() => !!window.__wb, null, { timeout: 90000 });
  await wait(1500);
  await page.getByRole('button', { name: /continue/i }).click();
  await wait(1500);
  const after = await G.ev(`return { money: ctx.state.money, found: !!ctx.state.discovered.healing_potion };`);
  check(after.money === money && after.found, 'progress survives a reload');
} catch (err) {
  failed = true;
  console.error('FAILED:', err.message);
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {});
}
if (G.errors.length) {
  console.error('Page errors:\n' + G.errors.slice(0, 10).join('\n'));
  failed = true;
}
await G.close();
process.exit(failed ? 1 : 0);
