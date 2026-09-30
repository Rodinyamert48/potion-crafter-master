// Main loop: fixed-step simulation (physics + gameplay sims) decoupled from
// variable-rate rendering. Rendering receives an interpolation alpha so
// physics-driven objects stay smooth on high refresh rate displays.

export interface LoopHandlers {
  /** Fixed timestep simulation (physics, cauldron chemistry…). */
  fixed(dt: number): void;
  /** Once per frame, before rendering. `dt` is clamped real time. */
  update(dt: number, time: number): void;
  /** Render with interpolation factor between the last two fixed steps. */
  render(alpha: number, dt: number): void;
}

export class Loop {
  readonly fixedDt: number;
  private readonly maxSubSteps: number;
  private accumulator = 0;
  private last = 0;
  private running = false;
  private raf = 0;
  private elapsed = 0;
  /** Smoothed frames per second, for the debug overlay and quality scaler. */
  fps = 60;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fpsLast = performance.now();
  /** Smoothed CPU milliseconds per frame spent in each phase. */
  readonly stats = { fixedMs: 0, updateMs: 0, renderMs: 0, steps: 0 };
  /** Keep simulating while the tab is hidden (online: others play in this
   *  game). Browsers stop animation frames in hidden tabs, so a worker's
   *  timer drives the frames then (without drawing). */
  keepAlive: (() => boolean) | null = null;
  private worker: Worker | null = null;

  constructor(private readonly handlers: LoopHandlers, fixedDt = 1 / 60, maxSubSteps = 5) {
    this.fixedDt = fixedDt;
    this.maxSubSteps = maxSubSteps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      if (!this.worker) this.frame(now);
    };
    this.raf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', () => this.visibility());
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stopBackground();
  }

  private visibility(): void {
    if (document.visibilityState === 'hidden' && this.running && this.keepAlive?.()) this.startBackground();
    else this.stopBackground();
  }

  private startBackground(): void {
    if (this.worker) return;
    try {
      const src = 'const t = setInterval(() => postMessage(0), 33); onmessage = () => clearInterval(t);';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.worker.onmessage = () => {
        if (document.visibilityState !== 'hidden' || !this.keepAlive?.()) this.stopBackground();
        else this.frame(performance.now(), false);
      };
    } catch {
      this.worker = null;
    }
  }

  private stopBackground(): void {
    if (!this.worker) return;
    this.worker.postMessage(0);
    this.worker.terminate();
    this.worker = null;
    this.last = performance.now();
  }

  private frame(now: number, draw = true): void {
    let dt = (now - this.last) / 1000;
    this.last = now;
    // A backgrounded tab or a breakpoint must not produce a giant step.
    if (dt > 0.25) dt = 0.25;
    if (dt <= 0) dt = 1 / 240;
    this.elapsed += dt;
    this.fpsFrames++;
    this.fpsTime += (now - this.fpsLast) / 1000;
    this.fpsLast = now;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    this.accumulator += dt;
    let steps = 0;
    const t0 = performance.now();
    while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
      this.handlers.fixed(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps >= this.maxSubSteps) this.accumulator = 0;
    const t1 = performance.now();
    this.handlers.update(dt, this.elapsed);
    const t2 = performance.now();
    if (draw) this.handlers.render(this.accumulator / this.fixedDt, dt);
    const t3 = performance.now();
    const st = this.stats;
    st.fixedMs += (t1 - t0 - st.fixedMs) * 0.05;
    st.updateMs += (t2 - t1 - st.updateMs) * 0.05;
    st.renderMs += (t3 - t2 - st.renderMs) * 0.05;
    st.steps = steps;
  }
}
