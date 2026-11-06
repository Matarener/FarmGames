// Игровой цикл: requestAnimationFrame, ограничение FPS, пауза в фоне,
// пониженная частота кадров в простое (экономия батареи).

export class Game {
  constructor(perf) {
    this.perf = perf;
    this.running = false;
    this.last = 0;
    this.update = () => {};
    this.render = () => {};
    this.isIdle = () => false; // сцена сообщает, что ничего не анимируется
    this.onPause = null;
    this.onResume = null;
    this._frame = this._frame.bind(this);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop(); else this.start();
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.onResume && this.onResume();
    this._raf = requestAnimationFrame(this._frame);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.onPause && this.onPause();
  }

  _frame(t) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._frame);
    const idle = this.perf.idle = this.isIdle();
    const fps = idle ? Math.min(this.perf.idleFps, this.perf.targetFps) : this.perf.targetFps;
    const elapsed = t - this.last;
    if (elapsed < 1000 / fps - 2) return;
    this.last = t;
    const dt = Math.min(elapsed / 1000, 0.1);
    const t0 = performance.now();
    this.update(dt);
    const t1 = performance.now();
    this.render();
    const t2 = performance.now();
    this.perf.work(t2 - t0);
    this.perf.frame(t2 - t0, elapsed, 1000 / fps, { логика: t1 - t0, кадр: t2 - t1 });
    this.perf.sample(elapsed / 1000, fps);
  }
}
