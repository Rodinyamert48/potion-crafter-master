// Game-time delayed callbacks (they respect pausing, unlike setTimeout).

export class Scheduler {
  private tasks: Array<{ at: number; fn: () => void }> = [];
  private now = 0;

  later(seconds: number, fn: () => void): void {
    this.tasks.push({ at: this.now + seconds, fn });
  }

  update(dt: number): void {
    this.now += dt;
    if (this.tasks.length === 0) return;
    const due = this.tasks.filter((t) => t.at <= this.now);
    if (due.length === 0) return;
    this.tasks = this.tasks.filter((t) => t.at > this.now);
    for (const t of due) {
      try {
        t.fn();
      } catch (err) {
        console.error('[Scheduler] task failed', err);
      }
    }
  }

  clear(): void {
    this.tasks = [];
  }
}
