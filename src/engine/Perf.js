// Определение мощности устройства и адаптивное качество рендера.
// Цель: стабильный кадр на слабых телефонах без ручных настроек.

export class Perf {
  constructor() {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const dpr = window.devicePixelRatio || 1;
    const coarse = matchMedia('(pointer: coarse)').matches;

    let tier = 'high';
    if (cores <= 4 || mem <= 3) tier = 'mid';
    if (cores <= 2 || mem <= 1.5) tier = 'low';
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'low' || q === 'mid' || q === 'high') tier = q;

    this.tier = tier;
    this.mobile = coarse;
    this.maxScale = tier === 'low' ? 1 : tier === 'mid' ? 1.5 : 2;
    this.renderScale = Math.min(dpr, this.maxScale);
    // Разрешение, в котором заранее рисуются спрайты (мир → пиксели).
    this.spriteScale = tier === 'low' ? 1.5 : tier === 'mid' ? 3 : 4;
    this.targetFps = tier === 'low' ? 30 : 60;
    this.idleFps = 20; // когда на экране ничего не происходит
    this.fps = 60;
    this.onScaleChange = null;

    this._acc = 0; this._n = 0; this._slow = 0; this._warmup = 2;
    // время работы кадра (логика + отрисовка), мс: среднее и худшее за секунду
    this.frameMs = 0; this.frameMax = 0; this._work = 0; this._workMax = 0;
    try { this._showFps = localStorage.getItem('farm.fps') === '1'; } catch { this._showFps = false; }
    this.onShowFps = null;
  }

  get showFps() { return this._showFps; }
  set showFps(v) {
    this._showFps = !!v;
    try { localStorage.setItem('farm.fps', v ? '1' : '0'); } catch { /* приватный режим */ }
    this.onShowFps && this.onShowFps(this._showFps);
  }

  work(ms) { this._work += ms; if (ms > this._workMax) this._workMax = ms; }

  // dt — реальная длительность кадра, сек. Если кадры долго не укладываются
  // в бюджет, сначала уменьшаем разрешение, затем ограничиваем FPS до 30.
  sample(dt, budgetFps) {
    this._acc += dt; this._n++;
    if (this._acc < 1) return;
    const avg = this._acc / this._n;
    this.fps = 1 / avg;
    this.frameMs = this._work / this._n; this.frameMax = this._workMax; this._work = 0; this._workMax = 0;
    this._acc = 0; this._n = 0;
    if (this._warmup > 0) { this._warmup--; return; }
    if (budgetFps < this.targetFps) return; // в режиме простоя не меряем
    const budget = 1 / this.targetFps;
    if (avg > budget * 1.3) this._slow++; else this._slow = Math.max(0, this._slow - 1);
    if (this._slow >= 3) {
      this._slow = 0;
      if (this.renderScale > 1) {
        this.renderScale = Math.max(1, this.renderScale - 0.25);
        this.onScaleChange && this.onScaleChange();
      } else if (this.targetFps > 30) {
        this.targetFps = 30;
      }
    }
  }
}
