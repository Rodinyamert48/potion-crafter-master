// Furniture placed on the shop's free spots (see data/furniture.ts): builds
// each piece as a small procedural model with a static collider, gives it a
// little life (a spinning globe, a ticking clock, a fortune-telling crystal
// ball…) and buys / removes pieces for the market.

import * as THREE from 'three';
import type { GameContext } from '../../core/GameContext';
import { Entity, type HoverInfo } from '../../world/Entity';
import { FURNITURE_MAP, FURNITURE_SLOTS, SLOT_MAP, fitsSlot, type FurnitureDef, type FurnitureSlot } from '../../data/furniture';
import { toon, toonUnique, glass } from '../../rendering/three/materials';
import { bookSpines, brass, cloth, iron, parchmentMap, woodPlank } from '../../rendering/three/textures/PixelTextures';
import { Painter } from '../../rendering/three/textures/Painter';
import { at, box, cyl, lathe, mesh } from '../../rendering/three/models/common';
import { candleModel, leafSpriteModel } from '../../rendering/three/models/decorModels';
import { CG, type BodyHandle } from '../../physics/PhysicsTypes';
import { t, tr } from '../../core/i18n';
import { rng } from '../../core/Random';

type Animate = (piece: FurniturePiece, time: number, dt: number, ctx: GameContext) => void;

interface Built {
  group: THREE.Group;
  animate?: Animate;
  /** Candle flames that get a flickering light. */
  lights?: Array<{ at: THREE.Vector3; intensity: number; color?: string; flame?: THREE.Object3D }>;
  parts?: Record<string, THREE.Object3D>;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

function paintingTexture(kind: 'land' | 'master'): THREE.CanvasTexture {
  const p = new Painter(24, 18, kind === 'land' ? 41 : 43);
  if (kind === 'land') {
    // Dragon valley at sunset
    for (let y = 0; y < 18; y++) p.rect(0, y, 24, 1, y < 4 ? '#b55088' : y < 7 ? '#f77622' : y < 9 ? '#feae34' : '#3e2731');
    p.disc(16, 8, 3, '#fee761');
    p.poly([[0, 12], [6, 6], [11, 12]], '#68386c');
    p.poly([[8, 12], [15, 5], [22, 12]], '#3e2731');
    p.poly([[14, 12], [20, 8], [24, 11], [24, 12]], '#68386c');
    p.rect(0, 12, 24, 6, '#265c42');
    p.rect(0, 15, 24, 3, '#193c3e');
    // a tiny dragon
    p.hline(5, 8, 3, '#181425');
    p.px(4, 2, '#181425');
    p.px(9, 2, '#181425');
  } else {
    // The master, young and grumpy
    p.fill('#3a4466');
    for (let y = 0; y < 18; y++) p.px(0, y, '#262b44');
    p.rect(8, 4, 8, 7, '#e8b796');
    p.rect(7, 2, 10, 3, '#3a4466');
    p.rect(9, 0, 6, 2, '#3a4466');
    p.px(12, -1 + 1, '#fee761');
    p.rect(9, 7, 2, 1, '#181425');
    p.rect(13, 7, 2, 1, '#181425');
    p.rect(8, 6, 3, 1, '#5a6988');
    p.rect(13, 6, 3, 1, '#5a6988');
    p.rect(9, 10, 6, 5, '#c0cbdc');
    p.rect(5, 13, 14, 5, '#68386c');
    p.rect(11, 13, 2, 5, '#feae34');
  }
  p.noise(0.05);
  return p.texture({ mipmaps: false });
}

function bannerTexture(): THREE.CanvasTexture {
  const w = 14;
  const h = 28;
  const p = new Painter(w, h, 47);
  p.rect(0, 0, w, h - 4, '#761a20');
  for (let x = 0; x < w; x++) p.rect(x, h - 4, 1, Math.round(Math.abs(x - (w - 1) / 2) * 0.6), '#761a20');
  p.rect(0, 0, w, 2, '#e0b050');
  p.rect(1, 2, 1, h - 6, '#b8862e');
  p.rect(w - 2, 2, 1, h - 6, '#b8862e');
  // sigil: a golden flask
  p.rect(6, 7, 2, 3, '#e0b050');
  p.disc(7, 13, 3, '#e0b050');
  p.px(7, 13, '#fff4dc');
  p.noise(0.05);
  return p.texture({ mipmaps: false });
}

function frame(w: number, h: number, depth = 0.05): THREE.Group {
  const g = new THREE.Group();
  const m = toon({ map: brass() });
  const bar = 0.06;
  at(mesh(box(w, bar, depth), m), 0, h / 2 - bar / 2, 0, g);
  at(mesh(box(w, bar, depth), m), 0, -h / 2 + bar / 2, 0, g);
  at(mesh(box(bar, h, depth), m), -w / 2 + bar / 2, 0, 0, g);
  at(mesh(box(bar, h, depth), m), w / 2 - bar / 2, 0, 0, g);
  return g;
}

function build(id: string): Built {
  const g = new THREE.Group();
  const dark = toon({ map: woodPlank('dark') });
  const mid = toon({ map: woodPlank('mid') });
  switch (id) {
    case 'armchair': {
      const velvet = toon({ map: cloth('#a22633') });
      at(mesh(box(0.7, 0.14, 0.62), velvet), 0, 0.4, 0, g);
      at(mesh(box(0.7, 0.62, 0.14), velvet), 0, 0.72, -0.26, g, 0, -0.12);
      for (const s of [-1, 1]) {
        at(mesh(box(0.12, 0.22, 0.6), velvet), s * 0.33, 0.55, 0.0, g);
        at(mesh(cyl(0.07, 0.07, 0.6, 8), velvet), s * 0.33, 0.66, 0.0, g, 0, Math.PI / 2);
      }
      for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) at(mesh(cyl(0.03, 0.02, 0.34, 6), dark), x, 0.17, z, g);
      at(mesh(box(0.3, 0.1, 0.3), toon({ map: cloth('#feae34') })), 0.05, 0.52, 0.02, g, 0.3);
      return { group: g };
    }
    case 'bigplant': {
      const pot = mesh(lathe([[0.0, 0], [0.16, 0], [0.2, 0.3], [0.22, 0.34], [0.0, 0.34]], 10), toon({ color: '#b86f50' }));
      g.add(pot);
      at(mesh(cyl(0.19, 0.19, 0.03, 10), toon({ color: '#3e2731' })), 0, 0.33, 0, g);
      const leaves = new THREE.Group();
      leaves.position.y = 0.34;
      g.add(leaves);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const leaf = leafSpriteModel(i % 2 ? '#3e8948' : '#63c74d', 0.34 + (i % 3) * 0.07);
        leaf.rotation.set(-0.6 - (i % 3) * 0.2, a, 0);
        leaves.add(leaf);
      }
      return {
        group: g,
        parts: { leaves },
        animate: (piece, time) => {
          const k = piece.wiggle;
          leaves.rotation.z = Math.sin(time * 1.3) * 0.03 + Math.sin(time * 18) * 0.12 * k;
        },
      };
    }
    case 'globe': {
      at(mesh(cyl(0.2, 0.24, 0.05, 10), dark), 0, 0.025, 0, g);
      at(mesh(cyl(0.035, 0.05, 0.62, 8), dark), 0, 0.34, 0, g);
      const ringM = toon({ map: brass() });
      const ring = mesh(new THREE.TorusGeometry(0.24, 0.018, 5, 18), ringM);
      at(ring, 0, 0.84, 0, g, 0, 0, 0.35);
      const tex = parchmentMap();
      const sphere = mesh(new THREE.SphereGeometry(0.21, 14, 10), toon({ map: tex }));
      const spin = new THREE.Group();
      spin.position.y = 0.84;
      spin.rotation.z = 0.35;
      spin.add(sphere);
      g.add(spin);
      return {
        group: g,
        animate: (piece, _time, dt) => {
          piece.spin = Math.max(0.25, piece.spin - dt * 2.2);
          sphere.rotation.y += piece.spin * dt;
        },
      };
    }
    case 'candelabra': {
      const ir = toon({ map: iron() });
      at(mesh(cyl(0.16, 0.2, 0.05, 8), ir), 0, 0.025, 0, g);
      at(mesh(cyl(0.025, 0.03, 1.0, 6), ir), 0, 0.52, 0, g);
      at(mesh(box(0.62, 0.03, 0.03), ir), 0, 0.98, 0, g);
      const lights: Built['lights'] = [];
      for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) {
        const c = candleModel(0.1 + (x === 0 ? 0.05 : 0));
        c.group.position.set(x, 0.995, 0);
        g.add(c.group);
        if (x === 0) lights.push({ at: new THREE.Vector3(0, 1.25, 0), intensity: 3.2, flame: c.flame });
      }
      return { group: g, lights };
    }
    case 'crystalball': {
      const ped = mesh(lathe([[0, 0], [0.2, 0], [0.18, 0.06], [0.08, 0.14], [0.06, 0.62], [0.12, 0.72], [0.14, 0.78], [0, 0.78]], 10), toon({ map: woodPlank('dark') }));
      g.add(ped);
      const glow = toonUnique({ color: '#b55088', emissive: '#b55088', emissiveIntensity: 0.9 });
      const core = mesh(new THREE.SphereGeometry(0.12, 12, 9), glow, { cast: false });
      at(core, 0, 0.92, 0, g);
      const shell = mesh(new THREE.SphereGeometry(0.17, 14, 10), glass('#e0c8ff', 0.35), { cast: false });
      at(shell, 0, 0.93, 0, g);
      return {
        group: g,
        lights: [{ at: new THREE.Vector3(0, 0.95, 0.1), intensity: 1.4, color: '#b55088' }],
        animate: (piece, time) => {
          const k = 0.7 + 0.3 * Math.sin(time * 1.7) + piece.wiggle * 1.5;
          glow.emissiveIntensity = k;
          core.scale.setScalar(0.9 + 0.1 * Math.sin(time * 2.3));
          glow.emissive.setHSL((0.85 + Math.sin(time * 0.4) * 0.08 + 1) % 1, 0.6, 0.45);
        },
      };
    }
    case 'pumpkin': {
      const lights: Built['lights'] = [];
      const face = toonUnique({ color: '#feae34', emissive: '#f77622', emissiveIntensity: 1.2 });
      const skin = toon({ color: '#f77622' });
      const spots: Array<[number, number, number, number]> = [
        [-0.2, 0.14, 0.05, 0.16],
        [0.18, 0.12, -0.05, 0.14],
        [0.0, 0.34, -0.02, 0.11],
      ];
      spots.forEach(([x, y, z, r], i) => {
        const p = mesh(new THREE.SphereGeometry(r, 10, 7), skin);
        p.scale.set(1.15, 0.85, 1.05);
        at(p, x, y, z, g);
        at(mesh(cyl(0.015, 0.02, 0.06, 5), toon({ color: '#3e8948' })), x, y + r * 0.85, z, g);
        // grin and eyes, glowing
        at(mesh(box(r * 0.9, r * 0.18, 0.02), face), x, y - r * 0.2, z + r * 1.02, g);
        for (const s of [-1, 1]) at(mesh(box(r * 0.22, r * 0.22, 0.02), face), x + s * r * 0.32, y + r * 0.22, z + r * 1.0, g, 0, 0, 0.78);
        if (i === 0) lights.push({ at: new THREE.Vector3(x, y, z + r + 0.15), intensity: 1.4, color: '#f77622' });
      });
      return {
        group: g,
        lights,
        animate: (piece, time) => {
          face.emissiveIntensity = 1.0 + 0.25 * Math.sin(time * 11) * Math.sin(time * 3.7) + piece.wiggle * 2;
        },
      };
    }
    case 'bookcase': {
      const w = 1.0;
      const hgt = 2.0;
      const d = 0.34;
      at(mesh(box(w, hgt, 0.04), dark), 0, hgt / 2, -d / 2 + 0.02, g);
      for (const s of [-1, 1]) at(mesh(box(0.05, hgt, d), dark), s * (w / 2 - 0.025), hgt / 2, 0, g);
      at(mesh(box(w + 0.06, 0.06, d + 0.04), dark), 0, hgt, 0, g);
      const spines = toon({ map: bookSpines() });
      for (let i = 0; i < 5; i++) {
        const y = 0.06 + i * 0.44;
        at(mesh(box(w - 0.08, 0.03, d - 0.02), mid), 0, y, 0.0, g);
        if (i < 4) {
          const books = mesh(box(w - 0.14, 0.3 + (i % 2) * 0.04, d - 0.1), spines);
          at(books, (i % 2 ? 0.04 : -0.04), y + 0.17, 0.02, g);
        }
      }
      at(mesh(new THREE.SphereGeometry(0.06, 8, 6), toon({ color: '#c0cbdc' })), 0.3, 1.86, 0.02, g);
      return { group: g };
    }
    case 'armor': {
      const steel = toon({ map: iron() });
      at(mesh(cyl(0.24, 0.26, 0.06, 8), dark), 0, 0.03, 0, g);
      for (const s of [-1, 1]) {
        at(mesh(cyl(0.06, 0.07, 0.72, 7), steel), s * 0.1, 0.44, 0, g);
        at(mesh(box(0.12, 0.08, 0.18), steel), s * 0.1, 0.1, 0.03, g);
        at(mesh(cyl(0.05, 0.055, 0.5, 7), steel), s * 0.25, 1.15, 0.02, g, 0, 0, s * 0.12);
        at(mesh(new THREE.SphereGeometry(0.09, 8, 6), steel), s * 0.22, 1.4, 0, g);
      }
      at(mesh(cyl(0.2, 0.15, 0.6, 8), steel), 0, 1.12, 0, g);
      at(mesh(box(0.34, 0.1, 0.22), toon({ color: '#761a20' })), 0, 0.84, 0, g);
      const helm = new THREE.Group();
      helm.position.y = 1.58;
      g.add(helm);
      at(mesh(cyl(0.12, 0.13, 0.24, 8), steel), 0, 0, 0, helm);
      at(mesh(new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel), 0, 0.12, 0, helm);
      at(mesh(box(0.16, 0.02, 0.02), toon({ color: '#181425' })), 0, 0.02, 0.125, helm);
      at(mesh(box(0.03, 0.16, 0.1), toon({ color: '#a8282a' })), 0, 0.28, -0.02, helm);
      // halberd
      at(mesh(cyl(0.015, 0.015, 1.9, 5), dark), 0.36, 0.95, 0.06, g);
      at(mesh(box(0.02, 0.2, 0.14), steel), 0.36, 1.86, 0.12, g);
      return {
        group: g,
        animate: (piece, time) => {
          helm.rotation.z = Math.sin(time * 24) * 0.08 * piece.wiggle;
          helm.rotation.y = Math.sin(time * 0.3) * 0.05;
        },
      };
    }
    case 'clock': {
      const body = mesh(box(0.5, 1.9, 0.32), dark);
      at(body, 0, 0.95, 0, g);
      at(mesh(box(0.56, 0.12, 0.36), mid), 0, 1.96, 0, g);
      at(mesh(box(0.56, 0.08, 0.36), mid), 0, 0.04, 0, g);
      const face = mesh(new THREE.CircleGeometry(0.17, 16), toon({ color: '#ead4aa' }));
      at(face, 0, 1.62, 0.165, g);
      at(mesh(new THREE.TorusGeometry(0.18, 0.02, 4, 16), toon({ map: brass() })), 0, 1.62, 0.165, g);
      const hour = mesh(box(0.02, 0.09, 0.01), toon({ color: '#181425' }));
      hour.geometry.translate(0, 0.045, 0);
      at(hour, 0, 1.62, 0.172, g);
      const minute = mesh(box(0.014, 0.14, 0.01), toon({ color: '#181425' }));
      minute.geometry.translate(0, 0.07, 0);
      at(minute, 0, 1.62, 0.176, g);
      // window with a swinging pendulum
      at(mesh(box(0.3, 0.9, 0.01), glass('#b8c8e8', 0.25)), 0, 0.95, 0.165, g);
      const pend = new THREE.Group();
      pend.position.set(0, 1.35, 0.13);
      g.add(pend);
      at(mesh(box(0.015, 0.62, 0.01), toon({ map: brass() })), 0, -0.31, 0, pend);
      at(mesh(cyl(0.07, 0.07, 0.02, 12), toon({ map: brass() })), 0, -0.64, 0, pend, 0, Math.PI / 2);
      return {
        group: g,
        animate: (piece, time, _dt, ctx) => {
          pend.rotation.z = Math.sin(time * Math.PI) * 0.22;
          const h = ctx.state.hour;
          hour.rotation.z = -((h % 12) / 12) * Math.PI * 2;
          minute.rotation.z = -(h % 1) * Math.PI * 2;
          const whole = Math.floor(h);
          if (piece.lastHour >= 0 && whole !== piece.lastHour && ctx.state.shopOpen) {
            ctx.audio.play('chime', { x: piece.object.position.x, volume: 0.35, pitch: 0.7 });
          }
          piece.lastHour = whole;
        },
      };
    }
    case 'painting_land':
    case 'painting_master': {
      const w = id === 'painting_land' ? 0.72 : 0.5;
      const hgt = id === 'painting_land' ? 0.54 : 0.66;
      const canvas = mesh(new THREE.PlaneGeometry(w - 0.08, hgt - 0.08), toon({ map: paintingTexture(id === 'painting_land' ? 'land' : 'master') }));
      at(canvas, 0, 0, 0.012, g);
      at(mesh(box(w - 0.04, hgt - 0.04, 0.02), dark), 0, 0, 0, g);
      g.add(frame(w, hgt));
      return { group: g, animate: (piece, time) => (g.rotation.z = Math.sin(time * 20) * 0.05 * piece.wiggle) };
    }
    case 'shield': {
      const steel = toon({ map: iron() });
      for (const s of [-1, 1]) {
        const sw = new THREE.Group();
        at(mesh(box(0.05, 0.9, 0.015), steel), 0, 0.1, 0, sw);
        at(mesh(box(0.22, 0.04, 0.03), toon({ map: brass() })), 0, -0.36, 0, sw);
        at(mesh(box(0.04, 0.16, 0.03), dark), 0, -0.46, 0, sw);
        sw.rotation.z = s * 0.7;
        sw.position.z = 0.01;
        g.add(sw);
      }
      const shield = mesh(lathe([[0, -0.3], [0.2, -0.2], [0.26, 0.05], [0.26, 0.28], [0, 0.3]], 3, -Math.PI / 2, Math.PI), toon({ color: '#761a20' }));
      shield.scale.set(1, 1, 0.12);
      at(shield, 0, 0, 0.04, g);
      at(mesh(box(0.06, 0.4, 0.02), toon({ map: brass() })), 0, 0.02, 0.07, g);
      at(mesh(box(0.34, 0.06, 0.02), toon({ map: brass() })), 0, 0.08, 0.07, g);
      return { group: g, animate: (piece, time) => (g.rotation.z = Math.sin(time * 22) * 0.04 * piece.wiggle) };
    }
    case 'mirror': {
      const shine = toonUnique({ color: '#9fb8d8', emissive: '#6f8fd8', emissiveIntensity: 0.35 });
      const glassM = mesh(new THREE.CircleGeometry(0.26, 18), shine, { cast: false });
      glassM.scale.set(0.8, 1.1, 1);
      at(glassM, 0, 0, 0.02, g);
      const rim = mesh(new THREE.TorusGeometry(0.26, 0.035, 5, 20), toon({ map: brass() }));
      rim.scale.set(0.8, 1.1, 1);
      at(rim, 0, 0, 0.02, g);
      at(mesh(new THREE.SphereGeometry(0.05, 6, 5), toon({ color: '#b55088', emissive: '#b55088', emissiveIntensity: 0.6 })), 0, 0.34, 0.03, g);
      return {
        group: g,
        animate: (piece, time) => {
          shine.emissiveIntensity = 0.3 + 0.1 * Math.sin(time * 1.1) + piece.wiggle * 1.2;
        },
      };
    }
    case 'banner': {
      const q = mesh(new THREE.PlaneGeometry(0.52, 1.04), toon({ map: bannerTexture(), alphaTest: 0.5, side: THREE.DoubleSide }));
      at(q, 0, -0.1, 0.02, g);
      at(mesh(cyl(0.02, 0.02, 0.64, 5), toon({ map: brass() })), 0, 0.43, 0.03, g, 0, 0, Math.PI / 2);
      return { group: g, animate: (piece, time) => (q.rotation.y = Math.sin(time * 1.2) * 0.06 + Math.sin(time * 14) * 0.2 * piece.wiggle) };
    }
  }
  return { group: g };
}

// ---------------------------------------------------------------------------
// A placed piece
// ---------------------------------------------------------------------------

export class FurniturePiece extends Entity {
  readonly kind = 'furniture';
  private readonly animate?: Animate;
  private time = rng.range(0, 10);
  wiggle = 0;
  spin = 0.25;
  lastHour = -1;
  readonly lights: THREE.PointLight[] = [];

  constructor(
    ctx: GameContext,
    readonly def: FurnitureDef,
    readonly slot: FurnitureSlot,
    private readonly collider: BodyHandle | null,
  ) {
    const built = build(def.id);
    super(built.group);
    this.animate = built.animate;
    const o = this.object;
    o.position.set(...slot.pos);
    o.rotation.y = slot.yaw;
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = slot.kind !== 'wall';
        c.receiveShadow = true;
      }
    });
    o.updateMatrixWorld(true);
    for (const l of built.lights ?? []) {
      const p = o.localToWorld(l.at.clone());
      this.lights.push(ctx.renderer.lighting.addCandle(p, l.intensity, l.flame, l.color ?? '#ffb35a', 4));
    }
  }

  override hover(): HoverInfo {
    const key = `furn.hint.${this.def.id}`;
    const hint = t(key);
    return { title: tr(this.def.name), subtitle: t('furn.subtitle'), hint: hint === key ? t('furn.hint') : hint };
  }

  override cursor() {
    return 'point' as const;
  }

  override press(ctx: GameContext) {
    this.wiggle = 1;
    const x = this.object.position.x;
    const say = (key: string, n: number) => ctx.bus.emit('toast', { text: t(`${key}${rng.int(1, n)}`), kind: 'info' });
    switch (this.def.id) {
      case 'globe':
        this.spin = 9;
        ctx.audio.play('whoosh', { x, volume: 0.5 });
        break;
      case 'crystalball':
        ctx.audio.play('magic', { x, volume: 0.6 });
        ctx.vfx.magic(this.object.position.clone().setY(1.1), '#b55088', 10);
        say('furn.fortune', 8);
        break;
      case 'bookcase':
        ctx.audio.play('pageFlip', { x });
        say('furn.tip', 6);
        break;
      case 'armor':
        ctx.audio.play('metalClang', { x, volume: 0.6 });
        break;
      case 'clock':
        ctx.audio.play('chime', { x, volume: 0.5, pitch: 0.7 });
        ctx.bus.emit('toast', { text: t('furn.time', { h: String(Math.floor(ctx.state.hour)).padStart(2, '0'), m: String(Math.floor((ctx.state.hour % 1) * 60)).padStart(2, '0') }), kind: 'info' });
        break;
      case 'mirror':
        ctx.audio.play('sparkle', { x });
        say('furn.mirror', 5);
        break;
      case 'pumpkin':
        ctx.audio.play('poof', { x, volume: 0.4 });
        break;
      case 'armchair':
        ctx.audio.play('dropSoft', { x });
        say('furn.chair', 3);
        break;
      case 'shield':
        ctx.audio.play('metalClang', { x, volume: 0.4, pitch: 1.3 });
        break;
      default:
        ctx.audio.play('woodKnock', { x, volume: 0.5 });
    }
    ctx.state.count('furniturePokes');
    return null;
  }

  override update(ctx: GameContext, dt: number): void {
    this.time += dt;
    this.wiggle = Math.max(0, this.wiggle - dt * 1.8);
    this.animate?.(this, this.time, dt, ctx);
  }

  override netState(): unknown {
    return this.wiggle > 0.5 ? 1 : 0;
  }

  override applyNetState(_ctx: GameContext, s: unknown): void {
    if (s && this.wiggle <= 0.5) {
      this.wiggle = 1;
      if (this.def.id === 'globe') this.spin = 9;
    }
  }

  override dispose(ctx: GameContext): void {
    for (const l of this.lights) ctx.renderer.lighting.removeCandle(l);
    if (this.collider) ctx.physics.removeBody(this.collider);
    super.dispose(ctx);
  }
}

// ---------------------------------------------------------------------------
// The system: placement from the saved state, buying and removing
// ---------------------------------------------------------------------------

export class FurnitureSystem {
  private readonly pieces = new Map<string, FurniturePiece>();

  constructor(private readonly ctx: GameContext) {}

  /** Build whatever the saved state says stands in the shop. */
  sync(): void {
    const want = this.ctx.state.furniture;
    for (const [slot, piece] of this.pieces) {
      if (want[slot] !== piece.def.id) {
        this.ctx.world.remove(piece);
        this.pieces.delete(slot);
      }
    }
    for (const [slot, id] of Object.entries(want)) {
      if (this.pieces.has(slot)) continue;
      const def = FURNITURE_MAP[id];
      const s = SLOT_MAP[slot];
      if (!def || !s || !fitsSlot(def, s)) continue;
      this.place(def, s);
    }
  }

  private place(def: FurnitureDef, slot: FurnitureSlot): FurniturePiece {
    const ctx = this.ctx;
    let body: BodyHandle | null = null;
    if (def.size) {
      const [w, h, d] = def.size;
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), slot.yaw);
      body = ctx.physics.createBody({
        shape: { type: 'box', size: [w, h, d] },
        motion: 'static',
        position: { x: slot.pos[0], y: slot.pos[1] + h / 2, z: slot.pos[2] },
        rotation: rot,
        group: CG.STATIC,
      });
    }
    const piece = ctx.world.add(new FurniturePiece(ctx, def, slot, body), ctx);
    piece.netKey = `furn:${slot.id}`;
    this.pieces.set(slot.id, piece);
    return piece;
  }

  pieceAt(slot: string): FurniturePiece | undefined {
    return this.pieces.get(slot);
  }

  slotsFor(def: FurnitureDef): FurnitureSlot[] {
    return FURNITURE_SLOTS.filter((s) => fitsSlot(def, s));
  }

  /** Buy a piece and put it on a spot (whatever stood there is sold back). */
  buy(id: string, slotId: string): boolean {
    const ctx = this.ctx;
    const def = FURNITURE_MAP[id];
    const slot = SLOT_MAP[slotId];
    if (!def || !slot || !fitsSlot(def, slot)) return false;
    if (!ctx.state.canAfford(def.price)) {
      ctx.audio.play('denied', {});
      ctx.bus.emit('toast', { text: t('toast.notEnoughGold'), kind: 'warn' });
      return false;
    }
    const old = ctx.state.furniture[slotId];
    if (old) this.refund(old);
    ctx.state.addMoney(-def.price);
    ctx.state.furniture[slotId] = id;
    this.sync();
    const piece = this.pieces.get(slotId);
    if (piece) {
      ctx.vfx.magic(piece.object.position.clone().setY(slot.pos[1] + 0.6), '#feae34', 16);
      piece.wiggle = 1;
    }
    ctx.audio.play('purchase', {});
    ctx.bus.emit('purchase', { id: `furniture_${id}`, kind: 'furniture' });
    ctx.bus.emit('toast', { text: t('furn.placed', { name: tr(def.name), slot: tr(slot.name) }), kind: 'good' });
    ctx.bus.emit('save:request', {});
    return true;
  }

  /** Take a piece away again; the market pays half its price back. */
  remove(slotId: string): void {
    const ctx = this.ctx;
    const id = ctx.state.furniture[slotId];
    if (!id) return;
    const piece = this.pieces.get(slotId);
    if (piece) ctx.vfx.puff(piece.object.position.clone().setY(0.5), '#c0cbdc', 18);
    this.refund(id);
    delete ctx.state.furniture[slotId];
    this.sync();
    ctx.audio.play('coins', { amount: 4 });
    ctx.bus.emit('save:request', {});
  }

  private refund(id: string): void {
    const def = FURNITURE_MAP[id];
    if (!def) return;
    const back = Math.floor(def.price / 2);
    this.ctx.state.addMoney(back);
    this.ctx.bus.emit('toast', { text: t('furn.refund', { name: tr(def.name), n: back }), kind: 'info' });
  }
}
