// Tiny pixel painter on top of an ImageData buffer. All textures and sprites
// in Witch's Brew are painted procedurally with it at native pixel
// resolution and sampled with nearest filtering.

import * as THREE from 'three';
import { hexToRgb, type RGB } from '../../../core/math';
import { Random } from '../../../core/Random';

const colorCache = new Map<string, RGB>();
function rgbOf(hex: string): RGB {
  let c = colorCache.get(hex);
  if (!c) {
    c = hexToRgb(hex);
    colorCache.set(hex, c);
  }
  return c;
}

export class Painter {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly data: Uint8ClampedArray;
  private readonly img: ImageData;
  wrap = false;
  /** Optional clip rectangle [x0, y0, x1, y1) – keeps sprite frames from
   *  bleeding into their neighbours in a sheet. */
  clip: [number, number, number, number] | null = null;
  readonly rng: Random;

  constructor(
    readonly w: number,
    readonly h: number,
    seed = 1,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.img = this.ctx.createImageData(w, h);
    this.data = this.img.data;
    this.rng = new Random(seed);
  }

  private idx(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.wrap) {
      x = ((x % this.w) + this.w) % this.w;
      y = ((y % this.h) + this.h) % this.h;
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    const c = this.clip;
    if (c && (x < c[0] || y < c[1] || x >= c[2] || y >= c[3])) return -1;
    return (y * this.w + x) * 4;
  }

  setRGBA(x: number, y: number, r: number, g: number, b: number, a = 255): void {
    const i = this.idx(x, y);
    if (i < 0) return;
    const d = this.data;
    if (a >= 255) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    } else {
      const k = a / 255;
      const ea = d[i + 3] / 255;
      const outA = k + ea * (1 - k);
      if (outA <= 0) return;
      d[i] = (r * k + d[i] * ea * (1 - k)) / outA;
      d[i + 1] = (g * k + d[i + 1] * ea * (1 - k)) / outA;
      d[i + 2] = (b * k + d[i + 2] * ea * (1 - k)) / outA;
      d[i + 3] = outA * 255;
    }
  }

  px(x: number, y: number, hex: string, alpha = 1): void {
    const c = rgbOf(hex);
    this.setRGBA(x, y, c.r, c.g, c.b, alpha * 255);
  }

  get(x: number, y: number): [number, number, number, number] {
    const i = this.idx(x, y);
    if (i < 0) return [0, 0, 0, 0];
    const d = this.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  alphaAt(x: number, y: number): number {
    const i = this.idx(x, y);
    return i < 0 ? 0 : this.data[i + 3];
  }

  clearPx(x: number, y: number): void {
    const i = this.idx(x, y);
    if (i >= 0) this.data[i + 3] = 0;
  }

  fill(hex: string): void {
    this.rect(0, 0, this.w, this.h, hex);
  }

  rect(x: number, y: number, w: number, h: number, hex: string, alpha = 1): void {
    for (let yy = Math.floor(y); yy < Math.floor(y + h); yy++)
      for (let xx = Math.floor(x); xx < Math.floor(x + w); xx++) this.px(xx, yy, hex, alpha);
  }

  hline(x0: number, x1: number, y: number, hex: string, alpha = 1): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, hex, alpha);
  }

  vline(x: number, y0: number, y1: number, hex: string, alpha = 1): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.px(x, y, hex, alpha);
  }

  line(x0: number, y0: number, x1: number, y1: number, hex: string, alpha = 1): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 4096; n++) {
      this.px(x0, y0, hex, alpha);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  thickLine(x0: number, y0: number, x1: number, y1: number, width: number, hex: string): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, hex);
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, hex: string, alpha = 1): void {
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / Math.max(0.01, rx);
        const ny = (y + 0.5 - cy) / Math.max(0.01, ry);
        if (nx * nx + ny * ny <= 1) this.px(x, y, hex, alpha);
      }
  }

  disc(cx: number, cy: number, r: number, hex: string, alpha = 1): void {
    this.ellipse(cx, cy, r, r, hex, alpha);
  }

  ring(cx: number, cy: number, r: number, hex: string, alpha = 1): void {
    const steps = Math.max(8, Math.ceil(r * 8));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      this.px(Math.round(cx + Math.cos(a) * r - 0.5), Math.round(cy + Math.sin(a) * r - 0.5), hex, alpha);
    }
  }

  /** Scanline polygon fill. */
  poly(points: Array<[number, number]>, hex: string, alpha = 1): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      const yc = y + 0.5;
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.px(x, y, hex, alpha);
    }
  }

  /** Random per-pixel brightness jitter on opaque pixels. */
  noise(amount: number, chance = 1): void {
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0 || this.rng.next() > chance) continue;
      const k = 1 + (this.rng.next() * 2 - 1) * amount;
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
    }
  }

  speckle(hex: string, density: number, alpha = 1, onlyOpaque = true): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (onlyOpaque && this.alphaAt(x, y) === 0) continue;
        if (this.rng.next() < density) this.px(x, y, hex, alpha);
      }
  }

  /** Multiply every opaque pixel by a factor (darken < 1 < brighten). */
  tint(hex: string, amount: number): void {
    const c = rgbOf(hex);
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] += (c.r - d[i]) * amount;
      d[i + 1] += (c.g - d[i + 1]) * amount;
      d[i + 2] += (c.b - d[i + 2]) * amount;
    }
  }

  /** 1px outline around opaque regions (4-neighbourhood). */
  outline(hex: string, alphaThreshold = 32): void {
    const toSet: Array<[number, number]> = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alphaAt(x, y) > alphaThreshold) continue;
        if (
          this.alphaAt(x - 1, y) > alphaThreshold ||
          this.alphaAt(x + 1, y) > alphaThreshold ||
          this.alphaAt(x, y - 1) > alphaThreshold ||
          this.alphaAt(x, y + 1) > alphaThreshold
        )
          toSet.push([x, y]);
      }
    for (const [x, y] of toSet) this.px(x, y, hex);
  }

  commit(): this {
    this.ctx.putImageData(this.img, 0, 0);
    return this;
  }

  texture(opts: { repeat?: [number, number]; srgb?: boolean; mipmaps?: boolean } = {}): THREE.CanvasTexture {
    this.commit();
    return configurePixelTexture(new THREE.CanvasTexture(this.canvas), opts);
  }
}

export function configurePixelTexture<T extends THREE.Texture>(
  tex: T,
  opts: { repeat?: [number, number]; srgb?: boolean; mipmaps?: boolean } = {},
): T {
  tex.magFilter = THREE.NearestFilter;
  const mip = opts.mipmaps ?? true;
  tex.minFilter = mip ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
  tex.generateMipmaps = mip;
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}
