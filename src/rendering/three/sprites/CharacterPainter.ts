// Procedural pixel-art characters. A humanoid "paper doll" rig is painted at
// native resolution for every animation frame (idle, walk, talk, drink,
// happy, angry, surprised, sick) and packed into a sprite sheet. Archetypes
// (witch, knight, giant, elf, goblin, vampire, villager, guard, wizard) add
// their own parts: hats, helmets, ears, beards, capes, weapons.

import { Painter } from '../textures/Painter';
import type { Archetype, CharacterLook } from '../../../data/types';
import { mixHex, shadeHex } from '../../../core/math';
import { OUTLINE } from '../../../data/palette';

export type Eyes = 'open' | 'closed' | 'wide' | 'angry' | 'happy' | 'dizzy' | 'glow';
export type Mouth = 'closed' | 'open' | 'smile' | 'frown' | 'o' | 'grin';

export interface Pose {
  bob: number;
  leg: number;
  armL: number;
  armR: number;
  eyes: Eyes;
  mouth: Mouth;
  holding?: string | null;
  lean?: number;
  tint?: string;
  tintAmount?: number;
  headUp?: number;
}

export type AnimName = 'idle' | 'walk' | 'talk' | 'drink' | 'happy' | 'angry' | 'surprised' | 'sick' | 'sit' | 'sitTalk' | 'sleep' | 'cast';

export interface AnimDef {
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface SpriteSheet {
  canvas: HTMLCanvasElement;
  frameW: number;
  frameH: number;
  cols: number;
  rows: number;
  anims: Record<string, AnimDef>;
  /** Pixel of the feet (bottom centre) in frame coords. */
  pivotY: number;
}

interface Build {
  w: number;
  h: number;
  /** Scale of the body relative to a 72px human. */
  scale: number;
  headR: number;
  bodyW: number;
  legLen: number;
  skirt: boolean;
  bulky: boolean;
}

const BUILDS: Record<Archetype, Build> = {
  witch: { w: 40, h: 76, scale: 1, headR: 7.5, bodyW: 13, legLen: 13, skirt: true, bulky: false },
  knight: { w: 42, h: 76, scale: 1, headR: 7.5, bodyW: 16, legLen: 15, skirt: false, bulky: true },
  giant: { w: 64, h: 108, scale: 1.5, headR: 9, bodyW: 30, legLen: 22, skirt: false, bulky: true },
  elf: { w: 40, h: 76, scale: 1, headR: 7, bodyW: 12, legLen: 17, skirt: false, bulky: false },
  goblin: { w: 36, h: 48, scale: 0.62, headR: 9, bodyW: 12, legLen: 7, skirt: false, bulky: false },
  vampire: { w: 42, h: 78, scale: 1, headR: 7, bodyW: 13, legLen: 17, skirt: false, bulky: false },
  villager: { w: 40, h: 74, scale: 1, headR: 7.5, bodyW: 15, legLen: 14, skirt: false, bulky: false },
  guard: { w: 42, h: 76, scale: 1, headR: 7.5, bodyW: 16, legLen: 15, skirt: false, bulky: true },
  wizard: { w: 44, h: 80, scale: 1, headR: 7.5, bodyW: 16, legLen: 12, skirt: true, bulky: false },
};

const ANIMS: Record<string, { poses: Pose[]; fps: number; loop: boolean }> = {
  idle: {
    fps: 3,
    loop: true,
    poses: [
      { bob: 0, leg: 0, armL: 0.05, armR: 0.05, eyes: 'open', mouth: 'closed' },
      { bob: 0, leg: 0, armL: 0.05, armR: 0.05, eyes: 'open', mouth: 'closed' },
      { bob: 1, leg: 0, armL: 0.08, armR: 0.08, eyes: 'open', mouth: 'closed' },
      { bob: 1, leg: 0, armL: 0.08, armR: 0.08, eyes: 'closed', mouth: 'closed' },
    ],
  },
  walk: {
    fps: 8,
    loop: true,
    poses: [
      { bob: 0, leg: 1, armL: -0.45, armR: 0.45, eyes: 'open', mouth: 'closed' },
      { bob: -1, leg: 0, armL: 0, armR: 0, eyes: 'open', mouth: 'closed' },
      { bob: 0, leg: -1, armL: 0.45, armR: -0.45, eyes: 'open', mouth: 'closed' },
      { bob: -1, leg: 0, armL: 0, armR: 0, eyes: 'open', mouth: 'closed' },
    ],
  },
  talk: {
    fps: 7,
    loop: true,
    poses: [
      { bob: 0, leg: 0, armL: 0.05, armR: 0.6, eyes: 'open', mouth: 'open' },
      { bob: 0, leg: 0, armL: 0.05, armR: 0.5, eyes: 'open', mouth: 'closed' },
      { bob: 0, leg: 0, armL: 0.05, armR: 0.7, eyes: 'open', mouth: 'o' },
      { bob: 0, leg: 0, armL: 0.05, armR: 0.55, eyes: 'open', mouth: 'closed' },
    ],
  },
  drink: {
    fps: 4,
    loop: false,
    poses: [
      { bob: 0, leg: 0, armL: 0.05, armR: 0.9, eyes: 'open', mouth: 'closed', holding: 'potion' },
      { bob: 0, leg: 0, armL: 0.05, armR: 2.0, eyes: 'closed', mouth: 'o', holding: 'potion', headUp: 1 },
      { bob: -1, leg: 0, armL: 0.05, armR: 2.5, eyes: 'closed', mouth: 'o', holding: 'potion', headUp: 2 },
      { bob: -1, leg: 0, armL: 0.05, armR: 2.5, eyes: 'closed', mouth: 'o', holding: 'potion', headUp: 2 },
    ],
  },
  happy: {
    fps: 6,
    loop: true,
    poses: [
      { bob: -2, leg: 0, armL: 2.6, armR: 2.6, eyes: 'happy', mouth: 'grin' },
      { bob: 0, leg: 0, armL: 2.1, armR: 2.1, eyes: 'happy', mouth: 'smile' },
    ],
  },
  angry: {
    fps: 8,
    loop: true,
    poses: [
      { bob: 0, leg: 0, armL: 1.4, armR: 0.3, eyes: 'angry', mouth: 'frown', tint: '#e43b44', tintAmount: 0.18 },
      { bob: 0, leg: 0, armL: 0.3, armR: 1.4, eyes: 'angry', mouth: 'open', tint: '#e43b44', tintAmount: 0.18 },
    ],
  },
  surprised: {
    fps: 6,
    loop: true,
    poses: [
      { bob: -1, leg: 0, armL: 1.1, armR: 1.1, eyes: 'wide', mouth: 'o' },
      { bob: -2, leg: 0, armL: 1.3, armR: 1.3, eyes: 'wide', mouth: 'o' },
    ],
  },
  sick: {
    fps: 3,
    loop: true,
    poses: [
      { bob: 1, leg: 0, armL: 0.5, armR: 0.5, eyes: 'dizzy', mouth: 'frown', tint: '#63c74d', tintAmount: 0.35, lean: 1 },
      { bob: 2, leg: 0, armL: 0.6, armR: 0.6, eyes: 'dizzy', mouth: 'o', tint: '#63c74d', tintAmount: 0.4, lean: 1 },
    ],
  },
};

const WIZARD_ANIMS: Record<string, { poses: Pose[]; fps: number; loop: boolean }> = {
  sit: {
    fps: 2,
    loop: true,
    poses: [
      { bob: 0, leg: 0, armL: 0.6, armR: 0.6, eyes: 'open', mouth: 'closed' },
      { bob: 1, leg: 0, armL: 0.6, armR: 0.6, eyes: 'open', mouth: 'closed' },
      { bob: 1, leg: 0, armL: 0.6, armR: 0.6, eyes: 'closed', mouth: 'closed' },
    ],
  },
  sitTalk: {
    fps: 6,
    loop: true,
    poses: [
      { bob: 0, leg: 0, armL: 0.6, armR: 1.4, eyes: 'open', mouth: 'open' },
      { bob: 0, leg: 0, armL: 0.6, armR: 1.2, eyes: 'open', mouth: 'closed' },
    ],
  },
  sleep: {
    fps: 1,
    loop: true,
    poses: [
      { bob: 1, leg: 0, armL: 0.6, armR: 0.6, eyes: 'closed', mouth: 'o', lean: 1 },
      { bob: 2, leg: 0, armL: 0.6, armR: 0.6, eyes: 'closed', mouth: 'closed', lean: 1 },
    ],
  },
  cast: {
    fps: 6,
    loop: true,
    poses: [
      { bob: -1, leg: 0, armL: 0.4, armR: 2.7, eyes: 'glow', mouth: 'open' },
      { bob: -2, leg: 0, armL: 0.6, armR: 2.9, eyes: 'glow', mouth: 'grin' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

function limb(p: Painter, x0: number, y0: number, angle: number, len: number, thick: number, color: string, hand: string | null) {
  // angle 0 = down, positive = forward (toward viewer's left for the right arm is mirrored by caller)
  const x1 = x0 + Math.sin(angle) * len;
  const y1 = y0 + Math.cos(angle) * len;
  p.thickLine(x0, y0, x1, y1, thick, color);
  if (hand) p.disc(x1, y1, thick * 0.55, hand);
  return { x: x1, y: y1 };
}

export function paintCharacter(p: Painter, ox: number, oy: number, arch: Archetype, look: CharacterLook, pose: Pose, sitting = false): void {
  const b = BUILDS[arch];
  const extra = new Set(look.extra ?? []);
  const W = b.w;
  const cx = ox + W / 2;
  const footY = oy + b.h - 2;
  const tintCol = (c: string) => (pose.tint ? mixHex(c, pose.tint, pose.tintAmount ?? 0.2) : c);
  const skin = tintCol(look.skin);
  const skinD = shadeHex(skin, -0.2);
  const main = tintCol(look.main);
  const mainD = shadeHex(main, -0.28);
  const mainL = shadeHex(main, 0.18);
  const second = tintCol(look.second);
  const accent = look.accent;
  const hair = look.hair;
  const bob = pose.bob;
  const lean = pose.lean ?? 0;
  const k = arch === 'giant' ? 1.45 : arch === 'goblin' ? 0.75 : 1;

  // ---- Legs ------------------------------------------------------------
  const hipY = footY - b.legLen - (sitting ? -4 : 0) + bob * 0.3;
  const legW = Math.max(3, Math.round(4 * k));
  const legGap = Math.round(3 * k);
  const legColor = arch === 'knight' || arch === 'guard' ? '#5a6988' : arch === 'villager' ? main : arch === 'vampire' ? '#181425' : second;
  if (!sitting) {
    for (const side of [-1, 1]) {
      const swing = pose.leg * side;
      const fx = cx + side * legGap + swing * 3 * k - legW / 2;
      p.thickLine(cx + side * legGap, hipY, fx + legW / 2, footY - 2, legW, legColor);
      // boots
      const bootC = arch === 'knight' || arch === 'guard' ? '#8b9bb4' : '#3e2731';
      p.rect(fx - 1, footY - 3, legW + 2, 3, bootC);
      if (swing < 0) p.rect(fx - 1, footY - 3, legW + 2, 1, shadeHex(bootC, 0.2));
    }
  } else {
    // Sitting: legs forward (short stubs toward the viewer)
    for (const side of [-1, 1]) {
      p.rect(cx + side * legGap - legW / 2, hipY, legW, 8, legColor);
      p.rect(cx + side * legGap - legW / 2 - 1, hipY + 7, legW + 2, 3, '#3e2731');
    }
  }

  // ---- Torso --------------------------------------------------------------
  const bw = b.bodyW;
  const torsoTop = oy + (arch === 'goblin' ? 20 : arch === 'giant' ? 34 : 30) + bob + (sitting ? 6 : 0);
  const torsoBot = hipY + 2;
  const tx0 = cx - bw / 2 + lean;
  if (b.skirt) {
    // Robe / dress: trapezoid down to the ankles
    const skirtBot = sitting ? hipY + 10 : footY - 3;
    p.poly(
      [
        [tx0 + 1, torsoTop + 2],
        [tx0 + bw - 1, torsoTop + 2],
        [tx0 + bw + 4, skirtBot],
        [tx0 - 4, skirtBot],
      ],
      main,
    );
    p.poly(
      [
        [tx0 + bw * 0.6, torsoTop + 4],
        [tx0 + bw - 1, torsoTop + 2],
        [tx0 + bw + 4, skirtBot],
        [tx0 + bw * 0.75, skirtBot],
      ],
      mainD,
    );
    p.hline(tx0 - 4, tx0 + bw + 4, skirtBot - 1, second);
  } else {
    p.rect(tx0, torsoTop, bw, torsoBot - torsoTop, main);
    p.rect(tx0 + bw - 3, torsoTop + 1, 3, torsoBot - torsoTop - 1, mainD);
    p.rect(tx0 + 1, torsoTop, 2, torsoBot - torsoTop, mainL);
  }
  // Belt
  p.rect(tx0, hipY - 1, bw, 2, arch === 'vampire' ? '#3a4466' : '#3e2731');
  p.rect(cx - 1 + lean, hipY - 1, 3, 2, accent);

  // Archetype torso details
  if (arch === 'knight' || arch === 'guard') {
    // tabard
    p.rect(cx - 4 + lean, torsoTop + 3, 8, torsoBot - torsoTop - 1, second);
    p.rect(cx - 1 + lean, torsoTop + 6, 2, 5, accent);
    p.rect(cx - 2 + lean, torsoTop + 7, 4, 2, accent);
    // pauldrons
    p.ellipse(tx0 + 1, torsoTop + 2, 4, 3, '#c0cbdc');
    p.ellipse(tx0 + bw - 1, torsoTop + 2, 4, 3, '#8b9bb4');
  }
  if (arch === 'villager') {
    p.rect(cx - 5 + lean, torsoTop, 10, 6, second);
    p.rect(tx0 + 2, torsoTop, 2, 10, accent);
    p.rect(tx0 + bw - 4, torsoTop, 2, 10, accent);
  }
  if (arch === 'vampire') {
    p.rect(cx - 2 + lean, torsoTop, 4, 8, '#ffffff');
    p.rect(cx - 1 + lean, torsoTop + 1, 2, 2, '#a22633');
  }
  if (arch === 'wizard') {
    for (let i = 0; i < 3; i++) p.px(tx0 + 3 + i * 4, torsoTop + 10 + i * 5, '#fee761');
  }
  if (arch === 'elf') {
    p.rect(cx - 1 + lean, torsoTop, 2, torsoBot - torsoTop, second);
  }
  if (arch === 'giant') {
    // Leather strap across the chest, a couple of patches, ragged hem.
    p.thickLine(tx0 + 3, torsoTop + 1, tx0 + bw - 4, hipY - 3, 3, '#733e39');
    p.px(tx0 + bw * 0.5, torsoTop + (hipY - torsoTop) * 0.5, accent);
    p.rect(tx0 + 4, hipY - 12, 6, 5, shadeHex(main, 0.22));
    p.px(tx0 + 5, hipY - 11, mainD);
    p.px(tx0 + 8, hipY - 9, mainD);
    p.rect(tx0 + bw - 10, torsoTop + 6, 5, 4, shadeHex(second, 0.1));
    for (let x = tx0; x < tx0 + bw; x += 4) p.rect(x, torsoBot - 1, 2, 2, mainD);
  }

  // ---- Cape (behind arms, drawn before arms) --------------------------------
  if (extra.has('cape')) {
    p.poly(
      [
        [tx0 - 2, torsoTop],
        [tx0 + bw + 2, torsoTop],
        [tx0 + bw + 5, footY - 4],
        [tx0 - 5, footY - 4],
      ],
      '#181425',
    );
    p.rect(tx0 - 4, footY - 6, 4, 2, second);
    p.rect(tx0 + bw, footY - 6, 4, 2, second);
    // redraw torso front over cape
    p.rect(tx0 + 2, torsoTop, bw - 4, torsoBot - torsoTop, main);
    p.rect(cx - 2 + lean, torsoTop, 4, 8, '#ffffff');
    p.rect(cx - 1 + lean, torsoTop + 1, 2, 2, '#a22633');
  }

  // ---- Arms -------------------------------------------------------------------
  const shoulderY = torsoTop + 2;
  const armLen = Math.round((arch === 'goblin' ? 9 : arch === 'giant' ? 20 : 12) * (arch === 'giant' ? 1 : 1));
  const armT = arch === 'giant' ? 6 : b.bulky ? 4 : 3;
  const sleeve = arch === 'knight' || arch === 'guard' ? '#8b9bb4' : main;
  const leftShoulderX = tx0 - 1;
  const rightShoulderX = tx0 + bw + 1;
  // Left arm (screen left) swings "forward" as negative x? keep simple: angle opens outward.
  const lh = limb(p, leftShoulderX, shoulderY, -pose.armL * 0.9, armLen, armT, sleeve, skin);
  const rh = limb(p, rightShoulderX, shoulderY, pose.armR * 0.9, armLen, armT, sleeve, skin);
  void lh;
  if (pose.holding) {
    // Potion in the right hand
    p.rect(rh.x - 2, rh.y - 6, 4, 6, '#c0cbdc');
    p.rect(rh.x - 1, rh.y - 5, 2, 4, look.eyes ?? '#63c74d');
    p.rect(rh.x - 1, rh.y - 8, 2, 2, '#b86f50');
  }

  // Weapons / props
  if (extra.has('sword')) {
    p.line(tx0 + bw + 3, torsoTop - 6, tx0 + bw - 6, torsoBot + 2, '#c0cbdc');
    p.rect(tx0 + bw + 1, torsoTop - 8, 4, 2, accent);
  }
  if (extra.has('spear')) {
    p.thickLine(rh.x, oy + 8, rh.x, footY - 1, 2, '#733e39');
    p.poly(
      [
        [rh.x - 2, oy + 10],
        [rh.x + 2, oy + 10],
        [rh.x, oy + 3],
      ],
      '#c0cbdc',
    );
  }
  if (extra.has('bow')) {
    for (let a = -1.1; a <= 1.1; a += 0.1) p.px(tx0 - 3 + Math.cos(a) * 3, torsoTop + 10 + Math.sin(a) * 12, '#b86f50');
    p.vline(tx0 - 3, torsoTop - 1, torsoTop + 21, '#ead4aa');
  }
  if (extra.has('broom')) {
    p.thickLine(tx0 + bw + 6, torsoTop - 4, tx0 + bw - 2, footY - 2, 2, '#733e39');
    p.poly(
      [
        [tx0 + bw - 5, footY - 8],
        [tx0 + bw + 1, footY - 8],
        [tx0 + bw + 2, footY - 1],
        [tx0 + bw - 7, footY - 1],
      ],
      '#d4b04a',
    );
  }
  if (extra.has('club')) {
    p.thickLine(rh.x, rh.y, rh.x + 6, rh.y + 16, 5, '#733e39');
    p.disc(rh.x + 7, rh.y + 18, 5, '#8f5d3b');
  }

  // ---- Head ------------------------------------------------------------------------
  const hr = b.headR;
  const headCY = torsoTop - hr + 1 - (pose.headUp ?? 0) + (arch === 'giant' ? 2 : 0);
  const hx = cx + lean;
  // Neck
  p.rect(hx - 2, headCY + hr - 2, 4, 4, skinD);
  // Ears (elf / goblin) behind head
  if (extra.has('ears')) {
    const earLen = arch === 'goblin' ? 9 : 6;
    for (const s of [-1, 1]) {
      p.poly(
        [
          [hx + s * (hr - 2), headCY - 2],
          [hx + s * (hr - 2), headCY + 3],
          [hx + s * (hr + earLen), headCY - 4],
        ],
        skin,
      );
      p.px(hx + s * (hr + 1), headCY - 1, skinD);
    }
  }
  p.ellipse(hx, headCY, hr, hr * (arch === 'goblin' ? 0.85 : 1), skin);
  p.ellipse(hx + hr * 0.45, headCY + 1, hr * 0.55, hr * 0.8, skinD, 0.35);
  // Beard (giant / wizard)
  if (extra.has('beard') || arch === 'wizard') {
    const beardC = arch === 'wizard' ? '#f4f4f4' : hair;
    p.poly(
      [
        [hx - hr + 1, headCY + 1],
        [hx + hr - 1, headCY + 1],
        [hx + hr * 0.4, headCY + hr + (arch === 'wizard' ? 12 : 6)],
        [hx - hr * 0.4, headCY + hr + (arch === 'wizard' ? 12 : 6)],
      ],
      beardC,
    );
    p.px(hx - 2, headCY + hr + 3, shadeHex(beardC, -0.15));
    p.px(hx + 1, headCY + hr + 6, shadeHex(beardC, -0.15));
  }
  // Nose
  if (extra.has('bignose')) {
    p.ellipse(hx + 2, headCY + 2, 3, 2, skinD);
  } else p.px(hx + 1, headCY + 1, skinD);

  // Eyes
  const ey = headCY - 1;
  const ex0 = hx - Math.round(hr * 0.42);
  const ex1 = hx + Math.round(hr * 0.42);
  const eyeC = pose.eyes === 'glow' ? '#2ce8f5' : look.eyes ?? '#262b44';
  const drawEye = (x: number) => {
    switch (pose.eyes) {
      case 'closed':
        p.hline(x - 1, x + 1, ey + 1, OUTLINE);
        break;
      case 'happy':
        p.px(x - 1, ey + 1, OUTLINE);
        p.px(x, ey, OUTLINE);
        p.px(x + 1, ey + 1, OUTLINE);
        break;
      case 'wide':
        p.rect(x - 1, ey - 1, 3, 3, '#ffffff');
        p.px(x, ey, OUTLINE);
        break;
      case 'angry':
        p.rect(x - 1, ey, 2, 2, eyeC);
        p.line(x - 2, ey - 2, x + 1, ey - 1, OUTLINE);
        break;
      case 'dizzy':
        p.px(x - 1, ey - 1, OUTLINE);
        p.px(x + 1, ey + 1, OUTLINE);
        p.px(x + 1, ey - 1, OUTLINE);
        p.px(x - 1, ey + 1, OUTLINE);
        break;
      case 'glow':
        p.rect(x - 1, ey, 2, 2, eyeC);
        p.px(x - 1, ey - 1, '#ffffff');
        break;
      default:
        p.rect(x - 1, ey, 2, 2, '#ffffff');
        p.px(x, ey, eyeC);
        p.px(x, ey + 1, eyeC);
    }
  };
  drawEye(ex0);
  drawEye(ex1);
  if (arch === 'vampire') {
    p.px(ex0, ey, '#e43b44');
    p.px(ex1, ey, '#e43b44');
  }

  // Mouth
  const my = headCY + Math.round(hr * 0.5);
  switch (pose.mouth) {
    case 'open':
      p.rect(hx - 1, my, 3, 2, '#3e2731');
      break;
    case 'o':
      p.rect(hx - 1, my - 1, 2, 3, '#3e2731');
      break;
    case 'smile':
      p.px(hx - 2, my, '#3e2731');
      p.hline(hx - 1, hx + 1, my + 1, '#3e2731');
      p.px(hx + 2, my, '#3e2731');
      break;
    case 'grin':
      p.rect(hx - 2, my, 5, 2, '#3e2731');
      p.hline(hx - 1, hx + 1, my, '#ffffff');
      break;
    case 'frown':
      p.px(hx - 2, my + 1, '#3e2731');
      p.hline(hx - 1, hx + 1, my, '#3e2731');
      p.px(hx + 2, my + 1, '#3e2731');
      break;
    default:
      if (!(extra.has('beard') || arch === 'wizard')) p.hline(hx - 1, hx + 1, my, shadeHex(skin, -0.35));
  }
  if (arch === 'vampire' && (pose.mouth === 'open' || pose.mouth === 'grin' || pose.mouth === 'smile')) {
    p.px(hx - 1, my + 2, '#ffffff');
    p.px(hx + 1, my + 2, '#ffffff');
  }

  // Hair / headwear
  const top = headCY - hr;
  if (extra.has('helmet')) {
    p.ellipse(hx, headCY - 1, hr + 1, hr + 1, '#8b9bb4');
    p.rect(hx - hr - 1, headCY - 1, hr * 2 + 2, 3, '#5a6988');
    p.hline(hx - hr + 2, hx + hr - 2, ey, OUTLINE);
    p.rect(hx - 1, top - 4, 2, 4, look.second);
    p.ellipse(hx - 2, headCY - 4, 2, 2, '#c0cbdc');
  } else if (extra.has('helmet_open')) {
    p.ellipse(hx, headCY - 3, hr + 1, hr * 0.75, '#8b9bb4');
    p.rect(hx - hr - 1, headCY - 3, hr * 2 + 2, 2, '#5a6988');
    p.px(hx - 3, headCY - 6, '#c0cbdc');
  } else if (extra.has('hat') || arch === 'wizard') {
    const hatC = arch === 'wizard' ? '#124e89' : look.second;
    const brimY = top + 3;
    p.rect(hx - hr - 4, brimY, hr * 2 + 8, 2, hatC);
    p.poly(
      [
        [hx - hr + 1, brimY],
        [hx + hr - 1, brimY],
        [hx + 5, top - 16],
        [hx + 8, top - 20],
      ],
      hatC,
    );
    p.rect(hx - hr + 1, brimY - 2, hr * 2 - 2, 2, arch === 'wizard' ? '#fee761' : look.accent);
    if (arch === 'wizard') {
      p.px(hx + 1, top - 6, '#fee761');
      p.px(hx + 4, top - 11, '#fee761');
      p.px(hx - 2, top - 2, '#fee761');
    }
    // hair under brim
    p.rect(hx - hr, brimY + 2, 2, 7, hair);
    p.rect(hx + hr - 2, brimY + 2, 2, 7, hair);
  } else if (extra.has('hood')) {
    const hoodC = look.main;
    p.ellipse(hx, headCY - 1, hr + 2, hr + 2, shadeHex(hoodC, -0.1));
    p.ellipse(hx, headCY + 1, hr - 1, hr - 0.5, skin);
    // re-draw face features on top of hood interior
    drawEye(ex0);
    drawEye(ex1);
    p.poly(
      [
        [hx - hr - 2, headCY + 2],
        [hx - hr - 4, headCY + hr + 5],
        [hx - hr + 3, headCY + hr + 2],
      ],
      hoodC,
    );
  } else if (extra.has('strawhat')) {
    p.rect(hx - hr - 5, top + 2, hr * 2 + 10, 2, '#e4c46a');
    p.ellipse(hx, top + 1, hr - 1, 3, '#d4b04a');
    p.hline(hx - hr + 1, hx + hr - 1, top + 2, '#a22633');
    p.rect(hx - hr, top + 4, 2, 3, hair);
  } else {
    // Plain hair
    p.ellipse(hx, top + 3, hr + 0.5, 4, hair);
    p.rect(hx - hr, top + 3, 2, arch === 'elf' ? 14 : 6, hair);
    p.rect(hx + hr - 2, top + 3, 2, arch === 'elf' ? 14 : 6, hair);
    if (arch === 'vampire') {
      p.poly(
        [
          [hx - 2, top + 2],
          [hx + 2, top + 2],
          [hx, top + 7],
        ],
        hair,
      );
    }
  }
  if (extra.has('collar')) {
    p.poly(
      [
        [hx - hr - 2, headCY + hr - 2],
        [hx - hr + 1, headCY + hr + 2],
        [hx - 3, headCY + hr + 2],
        [hx - hr - 5, headCY - 2],
      ],
      '#a22633',
    );
    p.poly(
      [
        [hx + hr + 2, headCY + hr - 2],
        [hx + hr - 1, headCY + hr + 2],
        [hx + 3, headCY + hr + 2],
        [hx + hr + 5, headCY - 2],
      ],
      '#a22633',
    );
  }
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

const sheetCache = new Map<string, SpriteSheet>();

export function characterSheet(key: string, arch: Archetype, look: CharacterLook): SpriteSheet {
  const cached = sheetCache.get(key);
  if (cached) return cached;
  const b = BUILDS[arch];
  const table = arch === 'wizard' ? { ...ANIMS, ...WIZARD_ANIMS } : ANIMS;
  const names = Object.keys(table);
  const maxFrames = Math.max(...names.map((n) => table[n].poses.length));
  const cols = maxFrames;
  const rows = names.length;
  const p = new Painter(b.w * cols, b.h * rows, 7);
  const anims: Record<string, AnimDef> = {};
  names.forEach((name, r) => {
    const def = table[name];
    const frames: number[] = [];
    def.poses.forEach((pose, c) => {
      const sitting = name === 'sit' || name === 'sitTalk' || name === 'sleep' || name === 'cast';
      // 1px inset leaves room for the outline inside the frame.
      p.clip = [c * b.w + 1, r * b.h + 1, (c + 1) * b.w - 1, (r + 1) * b.h - 1];
      paintCharacter(p, c * b.w, r * b.h, arch, look, pose, sitting && name !== 'cast');
      p.clip = null;
      frames.push(r * cols + c);
    });
    anims[name] = { frames, fps: def.fps, loop: def.loop };
  });
  p.outline(OUTLINE);
  p.commit();
  const sheet: SpriteSheet = { canvas: p.canvas, frameW: b.w, frameH: b.h, cols, rows, anims, pivotY: b.h - 1 };
  sheetCache.set(key, sheet);
  return sheet;
}

// ---------------------------------------------------------------------------
// Small creatures: frog & cat
// ---------------------------------------------------------------------------

export function frogSheet(): SpriteSheet {
  const key = 'frog';
  const c = sheetCache.get(key);
  if (c) return c;
  const fw = 22;
  const fh = 18;
  const p = new Painter(fw * 4, fh, 3);
  const body = '#63c74d';
  const dark = '#3e8948';
  const drawFrog = (ox: number, jump: number, croak: boolean) => {
    const y0 = 17 - jump;
    // legs
    if (jump > 0) {
      p.rect(ox + 2, y0 - 3, 4, 2, dark);
      p.rect(ox + 16, y0 - 3, 4, 2, dark);
    } else {
      p.rect(ox + 1, y0 - 2, 6, 2, dark);
      p.rect(ox + 15, y0 - 2, 6, 2, dark);
    }
    p.ellipse(ox + 11, y0 - 6, 8, 5, body);
    p.ellipse(ox + 11, y0 - 4, 6, 3, '#b6e39a');
    // eyes
    for (const s of [-1, 1]) {
      p.disc(ox + 11 + s * 4, y0 - 11, 2.5, body);
      p.rect(ox + 10 + s * 4, y0 - 12, 2, 2, '#ffffff');
      p.px(ox + 11 + s * 4, y0 - 11, '#181425');
    }
    if (croak) p.ellipse(ox + 11, y0 - 3, 4, 3, '#f6757a');
    else p.hline(ox + 8, ox + 14, y0 - 6, '#265c42');
    // tiny crown remnant (it's a transformed customer!)
    p.px(ox + 11, y0 - 12, '#feae34');
  };
  drawFrog(0, 0, false);
  drawFrog(fw, 0, true);
  drawFrog(fw * 2, 3, false);
  drawFrog(fw * 3, 5, false);
  p.outline(OUTLINE);
  p.commit();
  const sheet: SpriteSheet = {
    canvas: p.canvas,
    frameW: fw,
    frameH: fh,
    cols: 4,
    rows: 1,
    anims: { idle: { frames: [0, 0, 0, 1], fps: 3, loop: true }, jump: { frames: [2, 3, 3, 2], fps: 10, loop: false } },
    pivotY: fh - 1,
  };
  sheetCache.set(key, sheet);
  return sheet;
}

export function catSheet(): SpriteSheet {
  const key = 'cat';
  const c = sheetCache.get(key);
  if (c) return c;
  const fw = 30;
  const fh = 20;
  const frames = 6;
  const p = new Painter(fw * frames, fh, 5);
  const fur = '#262b44';
  const furL = '#3a4466';
  const draw = (ox: number, tail: number, awake: boolean, hiss: boolean, breathe: number) => {
    // body loaf
    p.ellipse(ox + 14, 14 - breathe, 10, 5 + breathe * 0.5, fur);
    p.ellipse(ox + 12, 12 - breathe, 6, 2, furL);
    // tail
    const tx = ox + 24;
    p.thickLine(tx, 15, tx + 3, 15 - tail * 3, 2, fur);
    // head
    p.ellipse(ox + 5, 12, 5, 4.5, fur);
    p.poly(
      [
        [ox + 1, 10],
        [ox + 2, 5],
        [ox + 5, 9],
      ],
      fur,
    );
    p.poly(
      [
        [ox + 6, 9],
        [ox + 9, 5],
        [ox + 10, 10],
      ],
      fur,
    );
    if (awake) {
      p.px(ox + 3, 11, '#fee761');
      p.px(ox + 7, 11, '#fee761');
    } else {
      p.hline(ox + 2, ox + 4, 12, '#5a6988');
      p.hline(ox + 6, ox + 8, 12, '#5a6988');
    }
    if (hiss) p.rect(ox + 4, 14, 3, 2, '#f6757a');
  };
  draw(0, 0, false, false, 0);
  draw(fw, 1, false, false, 1);
  draw(fw * 2, 0, false, false, 0);
  draw(fw * 3, 1, true, false, 0);
  draw(fw * 4, 2, true, true, -1);
  draw(fw * 5, 2, true, true, -2);
  p.outline(OUTLINE);
  p.commit();
  const sheet: SpriteSheet = {
    canvas: p.canvas,
    frameW: fw,
    frameH: fh,
    cols: frames,
    rows: 1,
    anims: {
      sleep: { frames: [0, 1, 2, 1], fps: 1.5, loop: true },
      awake: { frames: [3, 3, 3, 2], fps: 2, loop: true },
      hiss: { frames: [4, 5], fps: 8, loop: true },
    },
    pivotY: fh - 1,
  };
  sheetCache.set(key, sheet);
  return sheet;
}

/** Pixel height in metres (40 px per metre, the world's character scale). */
export const PX_PER_M = 40;

// ---------------------------------------------------------------------------
// Shelf critters: a jar slime and a little spider
// ---------------------------------------------------------------------------

export function slimeSheet(): SpriteSheet {
  const key = 'slime';
  const c = sheetCache.get(key);
  if (c) return c;
  const fw = 18;
  const fh = 16;
  const frames = 6;
  const p = new Painter(fw * frames, fh, 11);
  const body = '#63c74d';
  const dark = '#3e8948';
  const hi = '#b6f59a';
  // (squash: wider/flatter, stretch: taller/narrower)
  const draw = (i: number, w: number, h: number, lift: number, eyes: 'open' | 'shut' | 'wide') => {
    const ox = i * fw;
    const base = fh - 1 - lift;
    p.ellipse(ox + 9, base - h / 2, w / 2, h / 2, body);
    p.rect(ox + 9 - w / 2 + 1, base - 2, w - 2, 2, body);
    p.ellipse(ox + 11, base - h / 2 + 2, w / 3, h / 3, dark, 0.35);
    p.px(ox + 6, base - h + 3, hi);
    p.px(ox + 7, base - h + 2, hi);
    const ey = base - h / 2 - 1;
    if (eyes === 'shut') {
      p.hline(ox + 6, ox + 7, ey, '#181425');
      p.hline(ox + 10, ox + 11, ey, '#181425');
    } else {
      const r = eyes === 'wide' ? 2 : 1;
      p.rect(ox + 6, ey - r + 1, 2, r + 1, '#181425');
      p.rect(ox + 10, ey - r + 1, 2, r + 1, '#181425');
      p.px(ox + 6, ey - r + 1, '#ffffff');
      p.px(ox + 10, ey - r + 1, '#ffffff');
    }
  };
  draw(0, 12, 9, 0, 'open');
  draw(1, 14, 7, 0, 'open');
  draw(2, 10, 11, 1, 'open');
  draw(3, 10, 12, 4, 'wide');
  draw(4, 16, 5, 0, 'shut');
  draw(5, 12, 9, 0, 'shut');
  p.outline(OUTLINE);
  p.commit();
  const sheet: SpriteSheet = {
    canvas: p.canvas,
    frameW: fw,
    frameH: fh,
    cols: frames,
    rows: 1,
    anims: {
      idle: { frames: [0, 1, 0, 5, 0, 1], fps: 3, loop: true },
      hop: { frames: [1, 2, 3, 3, 2, 1], fps: 12, loop: false },
      hide: { frames: [4], fps: 1, loop: true },
    },
    pivotY: fh - 1,
  };
  sheetCache.set(key, sheet);
  return sheet;
}

export function spiderSheet(): SpriteSheet {
  const key = 'spider';
  const c = sheetCache.get(key);
  if (c) return c;
  const fw = 14;
  const fh = 12;
  const frames = 3;
  const p = new Painter(fw * frames, fh, 13);
  const body = '#3e2731';
  const leg = '#262b44';
  const draw = (i: number, spread: number) => {
    const ox = i * fw;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const y = 4 + k * 2;
        p.line(ox + 7, y, ox + 7 + s * (4 + spread + (k === 1 ? 1 : 0)), y + (k - 1) * 2 + 1, leg);
      }
    }
    p.ellipse(ox + 7, 6, 3, 3, body);
    p.ellipse(ox + 7, 3, 2, 1.5, body);
    p.px(ox + 6, 3, '#e43b44');
    p.px(ox + 8, 3, '#e43b44');
    p.px(ox + 6, 6, '#733e39');
  };
  draw(0, 0);
  draw(1, 1);
  draw(2, -1);
  p.outline(OUTLINE);
  p.commit();
  const sheet: SpriteSheet = {
    canvas: p.canvas,
    frameW: fw,
    frameH: fh,
    cols: frames,
    rows: 1,
    anims: {
      idle: { frames: [0, 1, 0, 2], fps: 2, loop: true },
      climb: { frames: [1, 2], fps: 10, loop: true },
    },
    pivotY: fh - 1,
  };
  sheetCache.set(key, sheet);
  return sheet;
}
