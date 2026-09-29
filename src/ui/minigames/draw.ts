// Tiny pixel drawing helpers shared by the gathering mini games.

export function disc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  r = Math.max(0, Math.floor(r));
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    g.fillRect(Math.floor(cx - w), Math.floor(cy + y), w * 2 + 1, 1);
  }
}

export function ellipse(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  ry = Math.max(1, Math.floor(ry));
  for (let y = -ry; y <= ry; y++) {
    const w = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
    g.fillRect(Math.floor(cx - w), Math.floor(cy + y), w * 2 + 1, 1);
  }
}

export function tri(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.lineTo(x2, y2);
  g.closePath();
  g.fill();
}

export function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(Math.floor(x), Math.floor(y), Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
}

/** Pixel text with a dark outline (VT323 is the game's retro font). */
export function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 10, align: CanvasTextAlign = 'center'): void {
  g.font = `${size}px VT323, monospace`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = '#181425';
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ])
    g.fillText(text, Math.round(x) + dx, Math.round(y) + dy);
  g.fillStyle = color;
  g.fillText(text, Math.round(x), Math.round(y));
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

/** Vertical banded sky gradient (pixel look). */
export function bands(g: CanvasRenderingContext2D, top: string, bottom: string, y0: number, y1: number, w: number, mix: (a: string, b: string, t: number) => string, n = 8): void {
  const h = y1 - y0;
  for (let i = 0; i < n; i++) {
    g.fillStyle = mix(top, bottom, i / (n - 1));
    g.fillRect(-4, Math.floor(y0 + (i * h) / n), w + 8, Math.ceil(h / n) + 1);
  }
}
