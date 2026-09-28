// Procedural pixel-art texture library. Every surface in the shop is painted
// here at low resolution with the shared palette, then sampled with nearest
// filtering so the 3D world keeps a hand-made pixel look.

import * as THREE from 'three';
import { Painter } from './Painter';
import { PAL } from '../../../data/palette';
import { mixHex, noise1, shadeHex } from '../../../core/math';

const cache = new Map<string, THREE.Texture>();

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    t.name = key;
    cache.set(key, t);
  }
  return t;
}

/** Returns a clone sharing the image but with its own repeat. */
export function repeated(tex: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const t = tex.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Wood
// ---------------------------------------------------------------------------

function paintPlanks(p: Painter, colors: string[], plankH: number, horizontal: boolean, seed: number) {
  const n = Math.ceil((horizontal ? p.h : p.w) / plankH);
  for (let k = 0; k < n; k++) {
    const base = colors[k % colors.length];
    const seam = Math.floor(noise1(k * 3.1, seed) * (horizontal ? p.w : p.h));
    for (let a = 0; a < plankH; a++)
      for (let b = 0; b < (horizontal ? p.w : p.h); b++) {
        const x = horizontal ? b : k * plankH + a;
        const y = horizontal ? k * plankH + a : b;
        const g = noise1(b * 0.18 + a * 2.7 + k * 13, seed + k);
        let c = base;
        if (g > 0.72) c = shadeHex(base, -0.18);
        else if (g < 0.2) c = shadeHex(base, 0.08);
        if (a === 0) c = PAL.plum;
        else if (a === 1) c = shadeHex(base, 0.14);
        else if (a === plankH - 1) c = shadeHex(base, -0.25);
        if (b === seam || b === seam + 1) c = b === seam ? PAL.plum : shadeHex(base, 0.1);
        p.px(x, y, c);
      }
    // nails near the seam
    const nx = seam + 3;
    const ny = k * plankH + Math.floor(plankH / 2);
    if (horizontal) {
      p.px(nx, ny - 2, PAL.navy);
      p.px(nx, ny + 2, PAL.navy);
    }
    // knots
    if (p.rng.chance(0.5)) {
      const kx = p.rng.int(4, (horizontal ? p.w : p.h) - 5);
      const ky = k * plankH + p.rng.int(3, plankH - 4);
      const cx = horizontal ? kx : ky;
      const cy = horizontal ? ky : kx;
      p.ellipse(cx, cy, horizontal ? 2.5 : 1.5, horizontal ? 1.5 : 2.5, shadeHex(base, -0.3));
      p.px(cx, cy, PAL.plum);
    }
  }
}

export function woodFloor(): THREE.Texture {
  return cached('woodFloor', () => {
    const p = new Painter(64, 64, 11);
    paintPlanks(p, ['#8a5a3b', '#7d5236', '#93613f', '#835738'], 16, true, 3);
    p.noise(0.05);
    return p.texture({ repeat: [1, 1] });
  });
}

export function woodPlank(tone: 'light' | 'mid' | 'dark' = 'mid'): THREE.Texture {
  return cached(`woodPlank-${tone}`, () => {
    const p = new Painter(32, 32, tone === 'light' ? 5 : tone === 'mid' ? 7 : 9);
    const sets = {
      light: ['#b98a5a', '#ad7f52', '#c29462'],
      mid: ['#8f5d3b', '#855535', '#99653f'],
      dark: ['#5c3a2a', '#533427', '#65402e'],
    };
    paintPlanks(p, sets[tone], 8, false, 5);
    p.noise(0.05);
    return p.texture();
  });
}

export function woodBeam(): THREE.Texture {
  return cached('woodBeam', () => {
    const p = new Painter(16, 64, 21);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 16; x++) {
        const g = noise1(y * 0.2 + x * 3.1, 4);
        let c = g > 0.65 ? '#4a2e22' : g < 0.25 ? '#6a4432' : '#5a3a2a';
        if (x === 0) c = '#3e2731';
        if (x === 15) c = '#3a2420';
        if (x === 1) c = '#6f4a36';
        p.px(x, y, c);
      }
    p.noise(0.06);
    return p.texture();
  });
}

export function cuttingBoard(): THREE.Texture {
  return cached('cuttingBoard', () => {
    const p = new Painter(32, 32, 31);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const g = noise1(x * 0.25 + y * 1.7, 9);
        p.px(x, y, g > 0.7 ? '#c79a64' : g < 0.2 ? '#e0b47c' : '#d5a870');
      }
    for (let i = 0; i < 14; i++) {
      const x = p.rng.int(3, 28);
      const y = p.rng.int(3, 28);
      const l = p.rng.int(2, 6);
      p.line(x, y, x + l, y + p.rng.int(-2, 2), '#a8784a', 0.8);
    }
    p.rect(0, 0, 32, 1, '#9a6b3f');
    p.rect(0, 31, 32, 1, '#7d5236');
    p.noise(0.04);
    return p.texture();
  });
}

export function logBark(): THREE.Texture {
  return cached('logBark', () => {
    const p = new Painter(32, 16, 41);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 32; x++) {
        const g = noise1(x * 0.9 + y * 0.12, 2);
        p.px(x, y, g > 0.6 ? '#4a2e22' : g < 0.3 ? '#7a5238' : '#5e3b2a');
      }
    for (let i = 0; i < 8; i++) {
      const x = p.rng.int(0, 31);
      p.vline(x, 0, 15, '#3e2731', 0.7);
    }
    p.speckle('#3e8948', 0.02);
    return p.texture();
  });
}

export function logEnd(): THREE.Texture {
  return cached('logEnd', () => {
    const p = new Painter(16, 16, 42);
    p.disc(8, 8, 8, '#5e3b2a');
    p.disc(8, 8, 6.8, '#d5a870');
    for (let r = 1.5; r < 6.5; r += 1.6) p.ring(8, 8, r, '#b88452');
    p.px(8, 8, '#8a5a3b');
    return p.texture({ mipmaps: false });
  });
}

// ---------------------------------------------------------------------------
// Stone & plaster
// ---------------------------------------------------------------------------

export function stoneWall(): THREE.Texture {
  return cached('stoneWall', () => {
    const p = new Painter(64, 64, 51);
    p.wrap = true;
    p.fill('#2b2d45');
    const bw = 16;
    const bh = 8;
    const tones = ['#5a6988', '#525f7d', '#626f8f', '#4d5873', '#58668a'];
    for (let row = 0; row < 64 / bh; row++) {
      const off = row % 2 === 0 ? 0 : bw / 2;
      for (let col = -1; col < 64 / bw + 1; col++) {
        const x0 = col * bw + off;
        const y0 = row * bh;
        const tone = tones[p.rng.int(0, tones.length - 1)];
        const w = bw - 1;
        const h = bh - 1;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            let c = tone;
            if (y === 0 || x === 0) c = shadeHex(tone, 0.14);
            if (y === h - 1 || x === w - 1) c = shadeHex(tone, -0.22);
            p.px(x0 + x, y0 + y, c);
          }
        if (p.rng.chance(0.35)) p.px(x0 + p.rng.int(2, w - 3), y0 + p.rng.int(2, h - 3), shadeHex(tone, -0.3));
        if (p.rng.chance(0.2)) p.px(x0 + p.rng.int(2, w - 3), y0 + p.rng.int(1, h - 2), '#3e8948');
      }
    }
    p.noise(0.05);
    return p.texture();
  });
}

export function plaster(): THREE.Texture {
  return cached('plaster', () => {
    const p = new Painter(64, 64, 61);
    p.wrap = true;
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const g = noise1(x * 0.11 + y * 0.37, 6) * 0.6 + noise1(y * 0.09 - x * 0.05, 8) * 0.4;
        p.px(x, y, g > 0.62 ? '#c9b48e' : g < 0.3 ? '#dccaa6' : '#d3bf99');
      }
    for (let i = 0; i < 3; i++) {
      let x = p.rng.int(0, 63);
      let y = p.rng.int(0, 63);
      for (let s = 0; s < 10; s++) {
        const nx = x + p.rng.int(-1, 1);
        const ny = y + 1;
        p.px(nx, ny, '#a8926e');
        x = nx;
        y = ny;
      }
    }
    p.noise(0.03);
    return p.texture();
  });
}

export function hearthStone(): THREE.Texture {
  return cached('hearthStone', () => {
    const p = new Painter(32, 32, 71);
    p.wrap = true;
    p.fill('#2a2230');
    const tones = ['#6d5a5a', '#7a6660', '#5f4d50', '#806c63'];
    for (let i = 0; i < 16; i++) {
      const cx = p.rng.range(0, 32);
      const cy = p.rng.range(0, 32);
      const rx = p.rng.range(3.5, 6);
      const ry = p.rng.range(3, 4.5);
      const tone = tones[p.rng.int(0, tones.length - 1)];
      p.ellipse(cx, cy, rx, ry, tone);
      p.ellipse(cx - 1, cy - 1, rx * 0.5, ry * 0.4, shadeHex(tone, 0.12));
    }
    p.noise(0.07);
    return p.texture();
  });
}

export function soot(): THREE.Texture {
  return cached('soot', () => {
    const p = new Painter(32, 32, 72);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const d = Math.hypot(x - 16, y - 16) / 16;
        const a = Math.max(0, 1 - d) * (0.6 + 0.4 * noise1(x * 0.7 + y * 1.3, 3));
        if (p.rng.next() < a) p.px(x, y, '#1a1414', 0.85);
      }
    return p.texture({ mipmaps: false });
  });
}

// ---------------------------------------------------------------------------
// Metals
// ---------------------------------------------------------------------------

export function iron(): THREE.Texture {
  return cached('iron', () => {
    const p = new Painter(32, 32, 81);
    p.wrap = true;
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const g = noise1(x * 0.3 + y * 0.9, 1) * 0.5 + noise1(y * 0.2, 7) * 0.5;
        p.px(x, y, g > 0.66 ? '#3d4262' : g < 0.33 ? '#2a2d45' : '#33374f');
      }
    for (let i = 0; i < 6; i++) p.px(p.rng.int(0, 31), p.rng.int(0, 31), '#5a6988');
    // rivet band
    p.hline(0, 31, 4, '#262b44');
    for (let x = 2; x < 32; x += 8) {
      p.px(x, 6, '#8b9bb4');
      p.px(x, 7, '#262b44');
    }
    p.noise(0.05);
    return p.texture();
  });
}

export function copper(): THREE.Texture {
  return cached('copper', () => {
    const p = new Painter(32, 32, 82);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const g = noise1(x * 0.35 + y * 0.8, 3);
        p.px(x, y, g > 0.7 ? '#e4a672' : g < 0.25 ? '#8f4f3a' : '#b86f50');
      }
    p.speckle('#3e8948', 0.02);
    p.speckle('#fee761', 0.01);
    return p.texture();
  });
}

export function brass(): THREE.Texture {
  return cached('brass', () => {
    const p = new Painter(16, 16, 83);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const g = noise1(x * 0.5 + y * 0.6, 5);
        p.px(x, y, g > 0.66 ? '#fee761' : g < 0.3 ? '#b8862f' : '#feae34');
      }
    return p.texture();
  });
}

// ---------------------------------------------------------------------------
// Fabric, paper, decor
// ---------------------------------------------------------------------------

export function rug(): THREE.Texture {
  return cached('rug', () => {
    const p = new Painter(64, 40, 91);
    p.fill('#a22633');
    p.rect(2, 2, 60, 36, '#7a1c2c');
    p.rect(4, 4, 56, 32, '#a22633');
    for (let x = 4; x < 60; x += 4) {
      p.px(x, 3, '#feae34');
      p.px(x + 2, 36, '#feae34');
    }
    // diamond motif
    const cx = 32;
    const cy = 20;
    for (let r = 12; r > 0; r -= 3) {
      const c = r % 6 === 0 ? '#feae34' : r % 6 === 3 ? '#262b44' : '#e43b44';
      p.poly(
        [
          [cx, cy - r],
          [cx + r * 1.6, cy],
          [cx, cy + r],
          [cx - r * 1.6, cy],
        ],
        c,
      );
    }
    for (const dx of [-22, 22]) {
      p.poly(
        [
          [cx + dx, cy - 6],
          [cx + dx + 5, cy],
          [cx + dx, cy + 6],
          [cx + dx - 5, cy],
        ],
        '#feae34',
      );
      p.px(cx + dx, cy, '#262b44');
    }
    p.noise(0.06);
    return p.texture({ mipmaps: false });
  });
}

export function bookSpines(): THREE.Texture {
  return cached('bookSpines', () => {
    const p = new Painter(64, 32, 101);
    const colors = ['#a22633', '#124e89', '#3e8948', '#68386c', '#733e39', '#b86f50', '#265c42', '#3a4466', '#be4a2f', '#5a6988'];
    let x = 0;
    while (x < 64) {
      const w = p.rng.int(3, 6);
      const h = p.rng.int(22, 32);
      const c = colors[p.rng.int(0, colors.length - 1)];
      p.rect(x, 32 - h, w, h, c);
      p.vline(x, 32 - h, 31, shadeHex(c, 0.15));
      p.vline(x + w - 1, 32 - h, 31, shadeHex(c, -0.3));
      const band = p.rng.chance(0.6) ? '#feae34' : '#c0cbdc';
      p.hline(x, x + w - 1, 32 - h + 3, band);
      p.hline(x, x + w - 1, 29, band);
      if (w >= 4 && p.rng.chance(0.5)) p.rect(x + 1, 32 - h + 8, w - 2, 3, '#ead4aa');
      x += w;
    }
    return p.texture({ mipmaps: false });
  });
}

export function parchmentMap(): THREE.Texture {
  return cached('parchmentMap', () => {
    const p = new Painter(64, 48, 111);
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 64; x++) {
        const g = noise1(x * 0.2 + y * 0.31, 2);
        p.px(x, y, g > 0.7 ? '#d8bf8e' : '#ead4aa');
      }
    // coast
    let cy = 30;
    for (let x = 0; x < 64; x++) {
      cy += p.rng.int(-1, 1);
      cy = Math.max(22, Math.min(40, cy));
      p.px(x, cy, '#733e39');
      for (let y = cy + 1; y < 48; y++) if ((x + y) % 3 === 0) p.px(x, y, '#8fb8de');
    }
    // mountains
    for (let i = 0; i < 5; i++) {
      const mx = 6 + i * 7 + p.rng.int(0, 3);
      const my = 12 + p.rng.int(0, 5);
      p.line(mx - 3, my + 3, mx, my - 2, '#733e39');
      p.line(mx, my - 2, mx + 3, my + 3, '#733e39');
    }
    // forest dots
    for (let i = 0; i < 10; i++) p.disc(40 + p.rng.int(0, 18), 8 + p.rng.int(0, 10), 1.2, '#3e8948');
    // dashed path & X
    for (let t = 0; t < 1; t += 0.05) {
      if (Math.floor(t * 20) % 2) continue;
      p.px(10 + t * 40, 20 + Math.sin(t * 6) * 4, '#a22633');
    }
    p.line(49, 17, 53, 21, '#a22633');
    p.line(53, 17, 49, 21, '#a22633');
    p.rect(0, 0, 64, 1, '#b8a06c');
    p.rect(0, 47, 64, 1, '#b8a06c');
    return p.texture({ mipmaps: false });
  });
}

export function cobweb(): THREE.Texture {
  return cached('cobweb', () => {
    const p = new Painter(32, 32, 121);
    const c = '#e8e8f0';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      p.line(0, 0, Math.cos(a) * 31, Math.sin(a) * 31, c, 0.55);
    }
    for (let r = 6; r < 32; r += 6) {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * (Math.PI / 2);
        p.px(Math.cos(a) * r, Math.sin(a) * r, c, 0.5);
      }
    }
    return p.texture({ mipmaps: false });
  });
}

export function candleWax(): THREE.Texture {
  return cached('candleWax', () => {
    const p = new Painter(8, 16, 131);
    p.fill('#ead4aa');
    p.vline(0, 0, 15, '#f4e6c8');
    p.vline(7, 0, 15, '#c8b08a');
    for (let i = 0; i < 3; i++) {
      const x = p.rng.int(1, 6);
      p.vline(x, 0, p.rng.int(2, 6), '#fff4dc');
    }
    return p.texture({ mipmaps: false });
  });
}

export function glassHighlight(): THREE.Texture {
  return cached('glassHighlight', () => {
    const p = new Painter(16, 32, 141);
    p.fill('#ffffff');
    p.tint('#c0cbdc', 1);
    p.rect(3, 4, 2, 20, '#ffffff');
    p.rect(6, 6, 1, 6, '#ffffff');
    p.rect(11, 8, 1, 16, '#e0e8f4');
    return p.texture({ mipmaps: false });
  });
}

export function straw(): THREE.Texture {
  return cached('straw', () => {
    const p = new Painter(16, 16, 151);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const g = noise1(x * 1.3 + y * 0.2, 4);
        p.px(x, y, g > 0.6 ? '#e4c46a' : g < 0.3 ? '#b8952f' : '#d4b04a');
      }
    return p.texture();
  });
}

export function cloth(color: string): THREE.Texture {
  return cached(`cloth-${color}`, () => {
    const p = new Painter(16, 16, 161);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) p.px(x, y, (x + y) % 2 === 0 ? color : shadeHex(color, -0.1));
    p.noise(0.05);
    return p.texture();
  });
}

// ---------------------------------------------------------------------------
// Ingredient surfaces
// ---------------------------------------------------------------------------

export function mushroomCap(): THREE.Texture {
  return cached('mushroomCap', () => {
    const p = new Painter(32, 32, 171);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const g = noise1(x * 0.4 + y * 0.7, 5);
        p.px(x, y, g > 0.6 ? '#2aa6bf' : '#39c6d6');
      }
    for (let i = 0; i < 9; i++) {
      const cx = p.rng.int(2, 29);
      const cy = p.rng.int(2, 29);
      p.disc(cx, cy, p.rng.range(1.2, 2.4), '#e7f6d5');
      p.px(cx, cy, '#ffffff');
    }
    return p.texture();
  });
}

export function mushroomGlowMap(): THREE.Texture {
  return cached('mushroomGlow', () => {
    // Same seed/layout as the cap so spots line up.
    const p = new Painter(32, 32, 171);
    p.fill('#0d3f48');
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.rng.next();
    for (let i = 0; i < 9; i++) {
      const cx = p.rng.int(2, 29);
      const cy = p.rng.int(2, 29);
      p.disc(cx, cy, p.rng.range(1.2, 2.4), '#c8fff4');
    }
    return p.texture();
  });
}

export function mushroomStem(): THREE.Texture {
  return cached('mushroomStem', () => {
    const p = new Painter(16, 16, 172);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) p.px(x, y, noise1(x * 1.1 + y * 0.1, 2) > 0.6 ? '#cfe3c4' : '#e7f6d5');
    return p.texture();
  });
}

export function dragonScaleTex(): THREE.Texture {
  return cached('dragonScale', () => {
    const p = new Painter(32, 32, 181);
    p.wrap = true;
    p.fill('#a22633');
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 5; col++) {
        const cx = col * 8 + (row % 2 ? 4 : 0);
        const cy = row * 6;
        p.ellipse(cx, cy, 4.5, 4, '#d8433a');
        p.ellipse(cx, cy - 1, 3, 2.5, '#e8683a');
        p.px(cx - 1, cy - 2, '#feae34');
        for (let a = 0; a < Math.PI; a += 0.3) p.px(cx + Math.cos(a) * 4.5, cy + Math.sin(a) * 4, '#6b1a26');
      }
    return p.texture();
  });
}

export function batWingTex(): THREE.Texture {
  return cached('batWing', () => {
    const p = new Painter(32, 32, 191);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const g = noise1(x * 0.3 + y * 0.5, 7);
        p.px(x, y, g > 0.62 ? '#4b3c5e' : '#5a4a6e');
      }
    for (let i = 0; i < 5; i++) {
      const a = 0.3 + i * 0.28;
      p.line(0, 31, Math.cos(a) * 34, 31 - Math.sin(a) * 34, '#9b7fa3');
    }
    p.speckle('#3e2731', 0.05);
    return p.texture();
  });
}

export function powderTex(color: string): THREE.Texture {
  return cached(`powder-${color}`, () => {
    const p = new Painter(16, 16, 201);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const r = p.rng.next();
        p.px(x, y, r > 0.85 ? shadeHex(color, 0.35) : r < 0.2 ? shadeHex(color, -0.25) : color);
      }
    return p.texture();
  });
}

export function genericIngredientTex(color: string, alt: string): THREE.Texture {
  return cached(`ingredient-${color}-${alt}`, () => {
    const p = new Painter(16, 16, 211);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) p.px(x, y, noise1(x * 0.8 + y * 0.6, 3) > 0.6 ? alt : color);
    p.noise(0.08);
    return p.texture();
  });
}

// ---------------------------------------------------------------------------
// Jar labels (tiny icons) & pixel icons shared with the UI
// ---------------------------------------------------------------------------

export type IconDrawer = (p: Painter, ox: number, oy: number) => void;

export const INGREDIENT_ICONS: Record<string, IconDrawer> = {
  glowing_mushroom: (p, ox, oy) => {
    p.ellipse(ox + 8, oy + 7, 6, 4, '#39c6d6');
    p.rect(ox + 2, oy + 7, 12, 1, '#2aa6bf');
    p.px(ox + 6, oy + 5, '#e7f6d5');
    p.px(ox + 10, oy + 6, '#e7f6d5');
    p.rect(ox + 7, oy + 8, 3, 6, '#e7f6d5');
  },
  dragon_scale: (p, ox, oy) => {
    p.poly(
      [
        [ox + 8, oy + 2],
        [ox + 14, oy + 7],
        [ox + 8, oy + 14],
        [ox + 2, oy + 7],
      ],
      '#d8433a',
    );
    p.line(ox + 8, oy + 3, ox + 8, oy + 13, '#feae34');
    p.px(ox + 6, oy + 6, '#f7a13b');
  },
  bat_wing: (p, ox, oy) => {
    p.poly(
      [
        [ox + 1, oy + 5],
        [ox + 8, oy + 3],
        [ox + 15, oy + 5],
        [ox + 13, oy + 10],
        [ox + 10, oy + 8],
        [ox + 8, oy + 11],
        [ox + 6, oy + 8],
        [ox + 3, oy + 10],
      ],
      '#5a4a6e',
    );
    p.line(ox + 8, oy + 3, ox + 8, oy + 10, '#9b7fa3');
  },
  moon_flower: (p, ox, oy) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      p.disc(ox + 8 + Math.cos(a) * 3.5, oy + 8 + Math.sin(a) * 3.5, 2.2, '#c9d6ff');
    }
    p.disc(ox + 8, oy + 8, 1.8, '#fee761');
  },
  frost_crystal: (p, ox, oy) => {
    p.poly(
      [
        [ox + 8, oy + 1],
        [ox + 12, oy + 8],
        [ox + 8, oy + 15],
        [ox + 4, oy + 8],
      ],
      '#8fd8ff',
    );
    p.line(ox + 8, oy + 2, ox + 8, oy + 14, '#e8fbff');
  },
  bog_toad_eye: (p, ox, oy) => {
    p.disc(ox + 8, oy + 8, 6, '#e8f0c8');
    p.disc(ox + 9, oy + 8, 3.6, '#b4c83a');
    p.rect(ox + 9, oy + 5, 1, 7, '#181425');
    p.px(ox + 7, oy + 6, '#ffffff');
    p.line(ox + 3, oy + 10, ox + 5, oy + 9, '#e43b44');
    p.line(ox + 4, oy + 5, ox + 6, oy + 6, '#e43b44');
  },
  phoenix_feather: (p, ox, oy) => {
    p.line(ox + 3, oy + 14, ox + 12, oy + 2, '#733e39');
    for (let i = 0; i < 6; i++) {
      p.line(ox + 4 + i * 1.5, oy + 12 - i * 2, ox + 8 + i * 1.5, oy + 12 - i * 2, i % 2 ? '#fee761' : '#ff8a3d');
    }
  },
};

export function jarLabel(ingredientId: string): THREE.Texture {
  return cached(`label-${ingredientId}`, () => {
    const p = new Painter(16, 16, 221);
    p.fill('#ead4aa');
    p.rect(0, 0, 16, 1, '#b8a06c');
    p.rect(0, 15, 16, 1, '#b8a06c');
    INGREDIENT_ICONS[ingredientId]?.(p, 0, 0);
    return p.texture({ mipmaps: false });
  });
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function blobShadow(): THREE.Texture {
  return cached('blobShadow', () => {
    const p = new Painter(32, 16, 231);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 32; x++) {
        const d = Math.hypot((x + 0.5 - 16) / 16, (y + 0.5 - 8) / 8);
        if (d < 1) {
          const bayer = ((x & 1) ^ (y & 1)) * 0.25 + ((x >> 1) & 1) * 0.12;
          if (1 - d > 0.15 + bayer * 0.6) p.px(x, y, '#181425', 0.55);
        }
      }
    return p.texture({ mipmaps: false });
  });
}

export function runeGlyphAtlas(): THREE.Texture {
  return cached('runeAtlas', () => {
    // 8 glyphs of 8x8 in a 64x8 strip, white on transparent.
    const p = new Painter(64, 8, 241);
    const glyphs = [
      ['..X..X..', '..XXXX..', '...XX...', '...XX...', '..XXXX..', '.X....X.', '........', '........'],
      ['.XXXXX..', '...X....', '..XXX...', '.X.X.X..', '...X....', '..X.X...', '........', '........'],
      ['.X...X..', '..X.X...', '...X....', '..X.X...', '.X...X..', '.XXXXX..', '........', '........'],
      ['...X....', '..XXX...', '.X.X.X..', 'XXXXXXX.', '.X.X.X..', '..XXX...', '...X....', '........'],
      ['.XX.XX..', 'X..X..X.', 'X.....X.', '.X...X..', '..X.X...', '...X....', '........', '........'],
      ['XXXXXX..', 'X....X..', 'X.XX.X..', 'X.XX.X..', 'X....X..', 'XXXXXX..', '........', '........'],
      ['...X....', '...X....', 'XXXXXXX.', '...X....', '..X.X...', '.X...X..', '........', '........'],
      ['..XXX...', '.X...X..', '.X.X.X..', '.X...X..', '..XXX...', '...X....', '..XXX...', '........'],
    ];
    glyphs.forEach((rows, gi) => {
      rows.forEach((row, y) => {
        for (let x = 0; x < 8; x++) if (row[x] === 'X') p.px(gi * 8 + x, y, '#ffffff');
      });
    });
    return p.texture({ mipmaps: false, srgb: false });
  });
}

export function leafSprite(color = '#3e8948'): THREE.Texture {
  return cached(`leaf-${color}`, () => {
    const p = new Painter(32, 32, 251);
    const dark = shadeHex(color, -0.3);
    const light = mixHex(color, '#fee761', 0.25);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.38;
      const len = 12 + p.rng.int(0, 4);
      const ex = 16 + Math.cos(a) * len;
      const ey = 30 + Math.sin(a) * len;
      p.thickLine(16, 30, ex, ey, 3, color);
      p.line(16, 30, ex, ey, dark);
      p.px(ex, ey, light);
    }
    p.outline('#181425');
    return p.texture({ mipmaps: false });
  });
}

/** Iron chain links for hoist chains (tiles vertically, transparent gaps). */
export function chainLinks(): THREE.Texture {
  return cached('chainLinks', () => {
    const p = new Painter(8, 16, 131);
    const hi = '#c0cbdc';
    const mid = '#8b9bb4';
    const lo = '#3a4466';
    // Link seen face-on (an oval ring)
    for (let y = 1; y < 8; y++) {
      p.px(2, y, y < 4 ? hi : mid);
      p.px(5, y, lo);
    }
    p.px(3, 0, hi);
    p.px(4, 0, mid);
    p.px(3, 8, mid);
    p.px(4, 8, lo);
    // Next link seen edge-on (a bar)
    for (let y = 7; y < 16; y++) {
      p.px(3, y, y < 11 ? hi : mid);
      p.px(4, y, lo);
    }
    const t = p.texture({ mipmaps: false });
    t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}
