// Procedurally painted pixel-art UI assets (9-slice frames, icons, cursors)
// exported as data URLs for CSS. No image files are needed.

import { Painter } from '../rendering/three/textures/Painter';
import { INGREDIENT_ICONS } from '../rendering/three/textures/PixelTextures';
import { ASPECTS } from '../data/aspects';
import type { AspectId } from '../data/types';

const urlCache = new Map<string, string>();

function cached(key: string, make: () => string): string {
  let u = urlCache.get(key);
  if (!u) {
    u = make();
    urlCache.set(key, u);
  }
  return u;
}

function toURL(p: Painter): string {
  p.commit();
  return p.canvas.toDataURL('image/png');
}

/** Draw rows of characters mapped through a palette ('.' = transparent). */
export function paintRows(p: Painter, rows: string[], pal: Record<string, string>, ox = 0, oy = 0): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (c) p.px(ox + x, oy + y, c);
    }
  });
}

// ---------------------------------------------------------------------------
// Frames (24x24, 8px corners)
// ---------------------------------------------------------------------------

export type FrameStyle = 'wood' | 'parchment' | 'dark' | 'note' | 'gold';

export function frameURL(style: FrameStyle): string {
  return cached(`frame-${style}`, () => {
    const p = new Painter(24, 24, 7);
    const sets = {
      wood: { out: '#181425', rim: '#3e2731', edge: '#733e39', hi: '#b86f50', fill: '#3e2731', corner: '#feae34' },
      parchment: { out: '#3e2731', rim: '#733e39', edge: '#c28569', hi: '#f4e6c8', fill: '#ead4aa', corner: '#b86f50' },
      dark: { out: '#181425', rim: '#262b44', edge: '#3a4466', hi: '#5a6988', fill: '#1d1b33', corner: '#b55088' },
      note: { out: '#3e2731', rim: '#b8a06c', edge: '#d8bf8e', hi: '#fff4dc', fill: '#ead4aa', corner: '#a22633' },
      gold: { out: '#181425', rim: '#733e39', edge: '#feae34', hi: '#fee761', fill: '#3e2731', corner: '#fee761' },
    }[style];
    p.rect(1, 1, 22, 22, sets.fill);
    // outer outline
    p.rect(1, 0, 22, 1, sets.out);
    p.rect(1, 23, 22, 1, sets.out);
    p.rect(0, 1, 1, 22, sets.out);
    p.rect(23, 1, 1, 22, sets.out);
    // rim
    p.rect(1, 1, 22, 2, sets.rim);
    p.rect(1, 21, 22, 2, sets.rim);
    p.rect(1, 1, 2, 22, sets.rim);
    p.rect(21, 1, 2, 22, sets.rim);
    // edge + highlight
    p.rect(3, 3, 18, 1, sets.edge);
    p.rect(3, 20, 18, 1, sets.edge);
    p.rect(3, 3, 1, 18, sets.edge);
    p.rect(20, 3, 1, 18, sets.edge);
    p.rect(2, 1, 20, 1, sets.hi);
    p.rect(1, 2, 1, 6, sets.hi);
    if (style === 'parchment' || style === 'note') {
      p.noise(0.04);
    }
    // corner studs
    for (const [x, y] of [
      [2, 2],
      [20, 2],
      [2, 20],
      [20, 20],
    ]) {
      p.rect(x, y, 2, 2, sets.corner);
      p.px(x, y, '#ffffff', 0.6);
    }
    return toURL(p);
  });
}

// ---------------------------------------------------------------------------
// Icons (16x16)
// ---------------------------------------------------------------------------

const ICONS: Record<string, { rows: string[]; pal: Record<string, string> }> = {
  coin: {
    rows: [
      '................',
      '.....kkkkkk.....',
      '....kyyyyyyk....',
      '...kyyYYYYyyk...',
      '..kyyYyyyyYyyk..',
      '..kyYyyooyyYyk..',
      '..kyYyoyyoyYyk..',
      '..kyYyoyyyyYyk..',
      '..kyYyoyyoyYyk..',
      '..kyYyyooyyYyk..',
      '..kyyYyyyyYyyk..',
      '...kyyYYYYyyk...',
      '....kyyyyyyk....',
      '.....kkkkkk.....',
      '................',
      '................',
    ],
    pal: { k: '#733e39', y: '#feae34', Y: '#fee761', o: '#b86f50' },
  },
  star: {
    rows: [
      '................',
      '.......k........',
      '......kyk.......',
      '......kyk.......',
      '.....kyYyk......',
      'kkkkkkyYykkkkkk.',
      '.kyyyyyYyyyyyk..',
      '..kyyyYYYyyyk...',
      '...kyyyyyyyk....',
      '...kyyykyyyk....',
      '..kyyykkkyyyk...',
      '..kyykk.kkyyk...',
      '.kyk.......kyk..',
      '.kk.........kk..',
      '................',
      '................',
    ],
    pal: { k: '#733e39', y: '#feae34', Y: '#fee761' },
  },
  starEmpty: {
    rows: [
      '................',
      '.......k........',
      '......kyk.......',
      '......kyk.......',
      '.....kyyyk......',
      'kkkkkkyyykkkkkk.',
      '.kyyyyyyyyyyyk..',
      '..kyyyyyyyyyk...',
      '...kyyyyyyyk....',
      '...kyyykyyyk....',
      '..kyyykkkyyyk...',
      '..kyykk.kkyyk...',
      '.kyk.......kyk..',
      '.kk.........kk..',
      '................',
      '................',
    ],
    pal: { k: '#262b44', y: '#3a4466' },
  },
  sun: {
    rows: [
      '.......y........',
      '..y....y....y...',
      '...y.......y....',
      '......kkk.......',
      '....kkYYYkk.....',
      '....kYYyyYk.....',
      'yy.kYYyyyyYk.yy.',
      '...kYyyyyyYk....',
      '...kYyyyyyYk....',
      '....kYyyyYk.....',
      '....kkYYYkk.....',
      '...y..kkk..y....',
      '..y.........y...',
      '.......y........',
      '................',
      '................',
    ],
    pal: { k: '#be4a2f', y: '#feae34', Y: '#fee761' },
  },
  moon: {
    rows: [
      '................',
      '.....kkkk.......',
      '...kkWWWk.......',
      '..kWWWWk........',
      '..kWWWk.........',
      '.kWWWk..........',
      '.kWWWk......s...',
      '.kWWWk..........',
      '.kWWWWk.........',
      '..kWWWWk....s...',
      '..kWWWWWkkkk....',
      '...kkWWWWWWk....',
      '.....kkkkkk.....',
      '................',
      '................',
      '................',
    ],
    pal: { k: '#3a4466', W: '#c0cbdc', s: '#fee761' },
  },
  book: {
    rows: [
      '................',
      '..kkkkkkkkkkkk..',
      '..kppppppppppk..',
      '..kpPPPPPPPPpk..',
      '..kpPyyyyyyPpk..',
      '..kpPyPPPPyPpk..',
      '..kpPyyyyyyPpk..',
      '..kpPPPPPPPPpk..',
      '..kpPPwwwwPPpk..',
      '..kpPPPPPPPPpk..',
      '..kpPPwwwPPPpk..',
      '..kpPPPPPPPPpk..',
      '..kppppppppppk..',
      '..kwwwwwwwwwwk..',
      '..kkkkkkkkkkkk..',
      '................',
    ],
    pal: { k: '#181425', p: '#3e2731', P: '#68386c', y: '#feae34', w: '#ead4aa' },
  },
  bag: {
    rows: [
      '................',
      '......kkkk......',
      '.....kbbbbk.....',
      '......kbbk......',
      '....kkkkkkkk....',
      '...kbBBBBBBbk...',
      '..kbBBBBBBBBbk..',
      '..kbBBByyBBBbk..',
      '..kbBBByyBBBbk..',
      '..kbBBBBBBBBbk..',
      '..kbBBBBBBBBbk..',
      '..kbbBBBBBBbbk..',
      '...kbbbbbbbbk...',
      '....kkkkkkkk....',
      '................',
      '................',
    ],
    pal: { k: '#3e2731', b: '#733e39', B: '#b86f50', y: '#feae34' },
  },
  scroll: {
    rows: [
      '................',
      '..kkkkkkkkkkk...',
      '.kwwwwwwwwwwwk..',
      '.kwkkkkkkkkkwk..',
      '..kpppppppppk...',
      '..kpkkkkkkppk...',
      '..kppppppppk....',
      '..kpkkkkkppk....',
      '..kppppppppk....',
      '..kpkkkkkkpk....',
      '..kppppppppk....',
      '.kwkkkkkkkkwk...',
      '.kwwwwwwwwwwk...',
      '..kkkkkkkkkk....',
      '................',
      '................',
    ],
    pal: { k: '#733e39', w: '#c28569', p: '#ead4aa' },
  },
  map: {
    rows: [
      '................',
      '.kkkkk.kkkkk.kk.',
      'kpppppkgggggkppk',
      'kpprppkggbggkppk',
      'kppppgkgbbbgkrpk',
      'kpgggpkggbggkppk',
      'kpgpppkgggggkpgk',
      'kpgpppkggrggkpgk',
      'kppppgkgggggkggk',
      'kppprpkggggpkppk',
      'kpppppkgppppkppk',
      'kpppppkggpppkppk',
      '.kkkkk.kkkkk.kk.',
      '................',
      '................',
      '................',
    ],
    pal: { k: '#733e39', p: '#ead4aa', g: '#c8b890', b: '#3b5dc9', r: '#e43b44' },
  },
  gear: {
    rows: [
      '................',
      '......kkk.......',
      '...kk.kWk.kk....',
      '...kWkkWkkWk....',
      '....kWWWWWk.....',
      '.kkkWWkkkWWkkk..',
      '.kWWWk...kWWWk..',
      '.kkkWk...kWkkk..',
      '....kWk.kWk.....',
      '...kWWWWWWWk....',
      '...kkWkkkWkk....',
      '....kkk.kkk.....',
      '................',
      '................',
      '................',
      '................',
    ],
    pal: { k: '#262b44', W: '#8b9bb4' },
  },
  flask: {
    rows: [
      '................',
      '......kkkk......',
      '......kbbk......',
      '......kwwk......',
      '......kwwk......',
      '.....kwwwwk.....',
      '....kwwwwwwk....',
      '...kwggggggwk...',
      '...kgGGggGGgk...',
      '...kgGggggGgk...',
      '...kggggggggk...',
      '....kggggggk....',
      '.....kkkkkk.....',
      '................',
      '................',
      '................',
    ],
    pal: { k: '#181425', b: '#b86f50', w: '#c0cbdc', g: '#63c74d', G: '#2ce8f5' },
  },
  heart: {
    rows: [
      '................',
      '..kkk....kkk....',
      '.kRRRk..kRRRk...',
      'kRrrRRkkRRrrRk..',
      'kRrWrRRRRRrrRk..',
      'kRrrrrRRRrrrRk..',
      '.kRrrrrrrrrrk...',
      '..kRrrrrrrrk....',
      '...kRrrrrrk.....',
      '....kRrrrk......',
      '.....kRrk.......',
      '......kk........',
      '................',
      '................',
      '................',
      '................',
    ],
    pal: { k: '#3e2731', R: '#a22633', r: '#e43b44', W: '#f6757a' },
  },
  hourglass: {
    rows: [
      '................',
      '...kkkkkkkkk....',
      '...kbbbbbbbk....',
      '....kyyyyyk.....',
      '.....kyyyk......',
      '......kyk.......',
      '......kyk.......',
      '.....k.y.k......',
      '....k..y..k.....',
      '...k..yyy..k....',
      '...kbbbbbbbk....',
      '...kkkkkkkkk....',
      '................',
      '................',
      '................',
      '................',
    ],
    pal: { k: '#3e2731', b: '#733e39', y: '#feae34' },
  },
  bell: {
    rows: [
      '................',
      '.......kk.......',
      '......kyyk......',
      '.....kyYYyk.....',
      '....kyYyyyyk....',
      '....kyYyyyyk....',
      '...kyYyyyyyyk...',
      '...kyYyyyyyyk...',
      '..kyyyyyyyyyyk..',
      '..kkkkkkkkkkkk..',
      '.......kk.......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    pal: { k: '#733e39', y: '#feae34', Y: '#fee761' },
  },
};

export function iconURL(name: string, scale = 1): string {
  return cached(`icon-${name}-${scale}`, () => {
    const def = ICONS[name];
    const p = new Painter(16 * scale, 16 * scale, 1);
    if (def) {
      def.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const c = def.pal[row[x]];
          if (c) p.rect(x * scale, y * scale, scale, scale, c);
        }
      });
    }
    return toURL(p);
  });
}

export function ingredientIconURL(id: string): string {
  return cached(`ing-${id}`, () => {
    const p = new Painter(16, 16, 1);
    INGREDIENT_ICONS[id]?.(p, 0, 0);
    p.outline('#181425');
    return toURL(p);
  });
}

/** Small coloured gem for an aspect. */
export function aspectIconURL(a: AspectId): string {
  return cached(`aspect-${a}`, () => {
    const p = new Painter(10, 10, 1);
    const c = ASPECTS[a].color;
    p.poly(
      [
        [5, 0.5],
        [9.5, 5],
        [5, 9.5],
        [0.5, 5],
      ],
      c,
    );
    p.px(4, 3, '#ffffff', 0.8);
    p.px(3, 4, '#ffffff', 0.5);
    p.outline('#181425');
    return toURL(p);
  });
}

// ---------------------------------------------------------------------------
// Cursors (drawn at 2x for crispness)
// ---------------------------------------------------------------------------

const HAND_OPEN = [
  '....kk.kk.......',
  '...kSSkSSk.kk...',
  '...kSSkSSkkSSk..',
  '.kkkSSkSSkkSSk..',
  'kSSkSSkSSkkSSk..',
  'kSSkSSSSSSSSSk..',
  'kSSSSSSSSSSSSk..',
  '.kSSSSSSSSSSSk..',
  '.kSSSSSSSSSSk...',
  '..kSSSSSSSSSk...',
  '..kSSSSSSSSk....',
  '...kSSSSSSSk....',
  '...kkkkkkkkk....',
  '................',
  '................',
  '................',
];
const HAND_GRAB = [
  '................',
  '................',
  '................',
  '....kkkkkkk.....',
  '...kSSkSSkSk....',
  '..kkSSkSSkSSk...',
  '.kSSSSSSSSSSk...',
  '.kSSSSSSSSSSk...',
  '.kSSSSSSSSSSk...',
  '..kSSSSSSSSSk...',
  '..kSSSSSSSSk....',
  '...kSSSSSSSk....',
  '...kkkkkkkkk....',
  '................',
  '................',
  '................',
];
const HAND_POINT = [
  '....kk..........',
  '...kSSk.........',
  '...kSSk.........',
  '...kSSk.........',
  '...kSSkkkkk.....',
  '...kSSkSSkSkk...',
  '.kkkSSkSSkSSSk..',
  'kSSkSSSSSSSSSk..',
  'kSSSSSSSSSSSSk..',
  '.kSSSSSSSSSSSk..',
  '..kSSSSSSSSSk...',
  '..kSSSSSSSSk....',
  '...kSSSSSSSk....',
  '...kkkkkkkkk....',
  '................',
  '................',
];
const ARROW = [
  'k...............',
  'kk..............',
  'kWk.............',
  'kWWk............',
  'kWWWk...........',
  'kWWWWk..........',
  'kWWWWWk.........',
  'kWWWWWWk........',
  'kWWWWWWWk.......',
  'kWWWWkkkkk......',
  'kWWkWk..........',
  'kWk.kWk.........',
  'kk..kWk.........',
  '.....kWk........',
  '.....kk.........',
  '................',
];
const STIR = [
  '.....kkkkk......',
  '...kkyyyyykk....',
  '..kyykkkkkyyk...',
  '.kyk.....kkyk...',
  '.kyk......kyk...',
  'kyk........k....',
  'kyk.............',
  'kyk.....kkkkk...',
  'kyk......kyyk...',
  '.kyk....kyyyk...',
  '.kyk...kyykyk...',
  '..kyykkyyk.k....',
  '...kkyyyyk......',
  '.....kkkk.......',
  '................',
  '................',
];

export type CursorName = 'default' | 'grab' | 'grabbing' | 'point' | 'stir' | 'no';

export function cursorCSS(name: CursorName): string {
  return cached(`cursor-${name}`, () => {
    const rows = name === 'grab' ? HAND_OPEN : name === 'grabbing' ? HAND_GRAB : name === 'point' ? HAND_POINT : name === 'stir' ? STIR : ARROW;
    const pal = { k: '#181425', S: '#f4e6c8', W: '#ffffff', y: '#fee761' };
    const scale = 2;
    const p = new Painter(32, 32, 1);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = (pal as Record<string, string>)[row[x]];
        if (c) p.rect(x * scale, y * scale, scale, scale, c);
      }
    });
    const url = toURL(p);
    const hot = name === 'default' ? '0 0' : name === 'point' ? '8 0' : '14 14';
    const fallback = name === 'grab' ? 'grab' : name === 'grabbing' ? 'grabbing' : name === 'point' ? 'pointer' : name === 'stir' ? 'move' : 'default';
    return `url(${url}) ${hot}, ${fallback}`;
  });
}

// ---------------------------------------------------------------------------
// Potion bottle art for the book / catalog
// ---------------------------------------------------------------------------

export function potionArtURL(shape: string, color: string, color2: string, unknown = false): string {
  return cached(`potion-${shape}-${color}-${color2}-${unknown}`, () => {
    const p = new Painter(32, 40, 3);
    const glassC = '#c0cbdc';
    const liquid = unknown ? '#5a6988' : color;
    const hi = unknown ? '#8b9bb4' : color2;
    const body = (cx: number, cy: number, rx: number, ry: number) => {
      p.ellipse(cx, cy, rx, ry, glassC);
      p.ellipse(cx, cy + 1, rx - 1.5, ry - 1.5, liquid);
      p.ellipse(cx - 1, cy + ry * 0.35, rx - 3, ry * 0.4, hi, 0.5);
      p.rect(cx - rx + 2.5, cy - ry + 3, 2, 3, '#ffffff', 0.8);
    };
    if (shape === 'tall' || shape === 'vial') {
      const w = shape === 'vial' ? 7 : 11;
      p.rect(16 - w / 2, 12, w, 25, glassC);
      p.rect(16 - w / 2 + 1, 18, w - 2, 18, liquid);
      p.rect(16 - w / 2 + 1, 18, w - 2, 2, hi);
      p.rect(16 - w / 2 + 1, 13, 1, 12, '#ffffff', 0.8);
    } else if (shape === 'flask') {
      p.poly([[12, 12], [20, 12], [27, 36], [5, 36]], glassC);
      p.poly([[11, 22], [21, 22], [26, 35], [6, 35]], liquid);
      p.rect(8, 33, 16, 2, hi);
    } else {
      body(16, 26, 11, 10);
      if (shape === 'heart') p.px(16, 26, '#ffffff');
      if (shape === 'skull') {
        p.rect(12, 23, 3, 3, '#181425');
        p.rect(18, 23, 3, 3, '#181425');
      }
    }
    // neck & cork
    p.rect(13, 6, 6, 8, glassC);
    p.rect(14, 3, 4, 5, unknown ? '#5a6988' : '#b86f50');
    p.outline('#181425');
    if (unknown) {
      p.rect(14, 22, 4, 2, '#ead4aa');
      p.rect(16, 24, 2, 3, '#ead4aa');
      p.rect(16, 29, 2, 2, '#ead4aa');
    }
    return toURL(p);
  });
}
