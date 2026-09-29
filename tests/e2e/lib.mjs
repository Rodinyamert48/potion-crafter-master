// Helpers for driving the game with real mouse/keyboard input in headless
// Chromium (Playwright). The game exposes `window.__wb` for inspection.
//
// Environment:
//   GAME_URL       page to open (default http://localhost:5173/, i.e. `npm run dev`)
//   CHROMIUM_PATH  browser executable (default: Playwright's own Chromium)

import { chromium } from 'playwright';

export async function launch({ w = 1280, h = 720, locale = 'en-US' } = {}) {
  const url = process.env.GAME_URL || 'http://localhost:5173/';
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    // Software WebGL so it also runs on machines without a GPU.
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: w, height: h }, locale });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const t0 = Date.now();
  const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
  const wait = (ms) => page.waitForTimeout(ms);

  const G = {
    browser,
    page,
    errors,
    log,
    wait,
    async boot() {
      await page.goto(url);
      await page.waitForFunction(() => !!window.__wb, null, { timeout: 90000 });
      await wait(1200);
    },
    /** Evaluate `body` with ctx, shop, wb (the app) and V (THREE.Vector3) in scope. */
    async ev(body, arg) {
      return page.evaluate(
        ([body, arg]) => {
          const wb = window.__wb;
          const ctx = wb.game.ctx;
          const shop = ctx.shop;
          const V = shop.cauldron.center.constructor;
          return new Function('ctx', 'shop', 'wb', 'V', 'arg', body)(ctx, shop, wb, V, arg);
        },
        [body, arg],
      );
    },
    /** Screen position (CSS px) of a world point / Object3D expression. */
    async screenOf(expr) {
      return G.ev(`let v = (${expr});
        if (!v) return null;
        if (v.isObject3D) v = v.getWorldPosition(new V()); else v = v.clone();
        v.project(ctx.renderer.rig.camera);
        const r = document.getElementById('viewport').getBoundingClientRect();
        return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };`);
    },
    async waitFor(cond, timeoutMs, label) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (await G.ev(`return !!(${cond});`)) return true;
        await wait(250);
      }
      throw new Error(`timed out waiting for ${label ?? cond}`);
    },
    /** Keep the pointer on a (moving) world point for `ms`. */
    async trackTo(expr, ms) {
      const start = Date.now();
      while (Date.now() - start < ms) {
        const p = await G.screenOf(expr);
        if (p) await page.mouse.move(p.x, p.y, { steps: 3 });
        await wait(90);
      }
    },
    /** Hover an entity (searching around its projection) and press the mouse. */
    async pressOn(expr, entityExpr) {
      const offsets = [[0, 0]];
      for (let r = 8; r <= 56; r += 8) for (let a = 0; a < 8; a++) offsets.push([Math.cos((a / 8) * Math.PI * 2) * r, Math.sin((a / 8) * Math.PI * 2) * r]);
      for (const [ox, oy] of offsets) {
        const p = await G.screenOf(expr);
        if (!p) break;
        await page.mouse.move(p.x + ox, p.y + oy, { steps: 2 });
        await wait(130);
        if (await G.ev(`const e = (${entityExpr}); return !!e && ctx.interaction.hovered === e;`)) {
          await page.mouse.down();
          await wait(200);
          return { x: p.x + ox, y: p.y + oy };
        }
      }
      throw new Error(`could not point at ${entityExpr}`);
    },
    ing(id) {
      return `[...ctx.world.entities.values()].filter(e => e.alive && e.kind === 'ingredient' && e.def.id === '${id}')`;
    },
    RIM: `shop.cauldron.center.clone().setY(shop.cauldron.rimY)`,
    async close() {
      await browser.close();
    },
  };
  return G;
}

export function check(cond, message) {
  if (!cond) throw new Error(`check failed: ${message}`);
  console.log(`  ✓ ${message}`);
}
