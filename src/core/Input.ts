// Unified pointer / keyboard / wheel / touch input.
// Pointer coordinates are tracked relative to the game viewport and exposed
// both in CSS pixels and normalized device coordinates for raycasting.

export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

export interface PointerState {
  x: number;
  y: number;
  ndcX: number;
  ndcY: number;
  /** Movement since last frame (CSS px). */
  dx: number;
  dy: number;
  /** Smoothed velocity in CSS px / second. */
  vx: number;
  vy: number;
  down: [boolean, boolean, boolean];
  inside: boolean;
  type: string;
  /** True once the pointer has moved at least once (avoids hover at 0,0). */
  valid: boolean;
}

type ButtonFn = (button: number, e: PointerEvent) => void;

export class Input {
  readonly pointer: PointerState = {
    x: 0,
    y: 0,
    ndcX: 0,
    ndcY: 0,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    down: [false, false, false],
    inside: false,
    type: 'mouse',
    valid: false,
  };

  /** Recent pointer positions (≈ last 400 ms) for gesture recognition. */
  readonly history: PointerSample[] = [];

  private keys = new Set<string>();
  private pressed = new Set<string>();
  private wheelAccum = 0;
  private downFns: ButtonFn[] = [];
  private upFns: ButtonFn[] = [];
  private wheelFns: Array<(dy: number) => void> = [];
  private keyFns: Array<(code: string, e: KeyboardEvent) => void> = [];
  private pinchFns: Array<(scale: number, panX: number, panY: number, rotate: number) => void> = [];
  private touches = new Map<number, { x: number; y: number }>();
  private primaryTouchId: number | null = null;
  private lastPinchDist = 0;
  private lastPinchMid = { x: 0, y: 0 };
  private lastPinchAngle = 0;
  private lastMoveTime = performance.now();
  private frameDx = 0;
  private frameDy = 0;
  /** When false, gameplay input is ignored (menus open). Keyboard still reported. */
  enabled = true;

  constructor(private readonly el: HTMLElement) {
    el.addEventListener('pointerdown', this.handleDown);
    window.addEventListener('pointermove', this.handleMove, { passive: true });
    window.addEventListener('pointerup', this.handleUp);
    window.addEventListener('pointercancel', this.handleUp);
    el.addEventListener('pointerleave', () => (this.pointer.inside = false));
    el.addEventListener('pointerenter', () => (this.pointer.inside = true));
    el.addEventListener('wheel', this.handleWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', () => this.resetAll());
  }

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  onPointerDown(fn: ButtonFn): void {
    this.downFns.push(fn);
  }

  onPointerUp(fn: ButtonFn): void {
    this.upFns.push(fn);
  }

  onWheel(fn: (dy: number) => void): void {
    this.wheelFns.push(fn);
  }

  onKeyDown(fn: (code: string, e: KeyboardEvent) => void): void {
    this.keyFns.push(fn);
  }

  onPinch(fn: (scale: number, panX: number, panY: number, rotate: number) => void): void {
    this.pinchFns.push(fn);
  }

  /** On-screen buttons (touch controls) press keys like the keyboard does. */
  setVirtualKey(code: string, down: boolean): void {
    if (down) {
      if (!this.keys.has(code)) {
        this.pressed.add(code);
        const e = new KeyboardEvent('keydown', { code });
        for (const fn of this.keyFns) fn(code, e);
      }
      this.keys.add(code);
    } else this.keys.delete(code);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Accumulated wheel delta for this frame. */
  get wheel(): number {
    return this.wheelAccum;
  }

  /** Secondary "use" action: Space, F or right mouse button. */
  get actionHeld(): boolean {
    return this.keys.has('Space') || this.keys.has('KeyF') || this.pointer.down[2];
  }

  /** Pointer velocity averaged over the recent history window (px/s). */
  recentVelocity(windowMs = 90): { vx: number; vy: number } {
    const h = this.history;
    if (h.length < 2) return { vx: 0, vy: 0 };
    const last = h[h.length - 1];
    let first = last;
    for (let i = h.length - 2; i >= 0; i--) {
      first = h[i];
      if (last.t - h[i].t > windowMs) break;
    }
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0.001) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }

  endFrame(dt: number): void {
    this.pressed.clear();
    this.wheelAccum = 0;
    this.pointer.dx = this.frameDx;
    this.pointer.dy = this.frameDy;
    this.frameDx = 0;
    this.frameDy = 0;
    // Velocity decays when the pointer stops producing events.
    const idle = performance.now() - this.lastMoveTime;
    if (idle > 60) {
      const k = Math.exp(-12 * dt);
      this.pointer.vx *= k;
      this.pointer.vy *= k;
    }
    const cutoff = performance.now() - 400;
    while (this.history.length > 2 && this.history[0].t < cutoff) this.history.shift();
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  private updatePosition(clientX: number, clientY: number): void {
    const r = this.el.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const now = performance.now();
    const dtMs = Math.max(1, now - this.lastMoveTime);
    const mx = x - this.pointer.x;
    const my = y - this.pointer.y;
    if (this.pointer.valid) {
      this.frameDx += mx;
      this.frameDy += my;
      const ivx = (mx / dtMs) * 1000;
      const ivy = (my / dtMs) * 1000;
      const k = Math.min(1, dtMs / 40);
      this.pointer.vx += (ivx - this.pointer.vx) * k;
      this.pointer.vy += (ivy - this.pointer.vy) * k;
    }
    this.lastMoveTime = now;
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.ndcX = (x / Math.max(1, r.width)) * 2 - 1;
    this.pointer.ndcY = -(y / Math.max(1, r.height)) * 2 + 1;
    this.pointer.valid = true;
    this.pointer.inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
    this.history.push({ x, y, t: now });
    if (this.history.length > 64) this.history.shift();
  }

  private handleDown = (e: PointerEvent): void => {
    this.pointer.type = e.pointerType;
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        // Second finger: cancel the primary drag and start a pinch gesture.
        if (this.primaryTouchId !== null) {
          this.pointer.down[0] = false;
          for (const fn of this.upFns) fn(0, e);
        }
        this.primaryTouchId = null;
        this.startPinch();
        return;
      }
      if (this.touches.size > 2) return;
      this.primaryTouchId = e.pointerId;
    }
    this.updatePosition(e.clientX, e.clientY);
    const b = e.button === 1 ? 1 : e.button === 2 ? 2 : 0;
    this.pointer.down[b] = true;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!this.enabled) return;
    for (const fn of this.downFns) fn(b, e);
  };

  private handleMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      const t = this.touches.get(e.pointerId);
      if (t) {
        t.x = e.clientX;
        t.y = e.clientY;
      }
      if (this.touches.size === 2) {
        this.updatePinch();
        return;
      }
      if (this.primaryTouchId !== null && e.pointerId !== this.primaryTouchId) return;
    }
    this.pointer.type = e.pointerType;
    this.updatePosition(e.clientX, e.clientY);
  };

  private handleUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (e.pointerId !== this.primaryTouchId) return;
      this.primaryTouchId = null;
    }
    const b = e.button === 1 ? 1 : e.button === 2 ? 2 : 0;
    if (!this.pointer.down[b] && e.type !== 'pointercancel') return;
    this.pointer.down[b] = false;
    if (e.type === 'pointercancel') this.pointer.down = [false, false, false];
    for (const fn of this.upFns) fn(b, e);
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 32;
    else if (e.deltaMode === 2) dy *= 400;
    this.wheelAccum += dy;
    if (!this.enabled) return;
    for (const fn of this.wheelFns) fn(dy);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      this.pressed.add(e.code);
      for (const fn of this.keyFns) fn(e.code, e);
    }
    this.keys.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private startPinch(): void {
    const pts = [...this.touches.values()];
    this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    this.lastPinchMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    this.lastPinchAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  }

  private updatePinch(): void {
    const pts = [...this.touches.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const scale = this.lastPinchDist > 0 ? dist / this.lastPinchDist : 1;
    const px = mid.x - this.lastPinchMid.x;
    const py = mid.y - this.lastPinchMid.y;
    let rot = angle - this.lastPinchAngle;
    if (rot > Math.PI) rot -= Math.PI * 2;
    if (rot < -Math.PI) rot += Math.PI * 2;
    this.lastPinchDist = dist;
    this.lastPinchMid = mid;
    this.lastPinchAngle = angle;
    for (const fn of this.pinchFns) fn(scale, px, py, rot);
  }

  private resetAll(): void {
    this.keys.clear();
    const wasDown = this.pointer.down[0];
    this.pointer.down = [false, false, false];
    if (wasDown) for (const fn of this.upFns) fn(0, new PointerEvent('pointerup'));
  }
}
