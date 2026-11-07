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
    // выбор графики игроком: high — до x2, mid — x1.5, low — x1 (меньше пикселей — легче видеокарте)
    try { this.gfx = localStorage.getItem('farm.gfx') || 'auto'; } catch { this.gfx = 'auto'; }
    const cap = { high: 2, mid: 1.5, low: 1 }[this.gfx];
    if (cap) this.maxScale = cap;
    this.renderScale = Math.min(dpr, this.maxScale);
    // Разрешение, в котором заранее рисуются спрайты (мир → пиксели).
    this.spriteScale = tier === 'low' ? 1.5 : tier === 'mid' ? 3 : 4;
    this.targetFps = tier === 'low' ? 30 : 60;
    this.baseFps = this.targetFps;
    this.idleFps = 20; // когда на экране ничего не происходит
    this.fps = 60;
    this.onScaleChange = null;
    this.idle = false;

    this._acc = 0; this._n = 0; this._slow = 0; this._warmup = 2;
    // время работы кадра (логика + отрисовка), мс: среднее и худшее за секунду
    this.frameMs = 0; this.frameMax = 0; this._work = 0; this._workMax = 0;
    try { this._showFps = localStorage.getItem('farm.fps') === '1'; } catch { this._showFps = false; }
    this.onShowFps = null;
    // ловушка фризов: что происходило в самых долгих кадрах
    this.spikes = []; this._tags = {}; this._t0 = performance.now();
  }

  setGfx(v) {
    this.gfx = v;
    try { localStorage.setItem('farm.gfx', v); } catch { /* приватный режим */ }
    const dpr = window.devicePixelRatio || 1;
    const cap = { high: 2, mid: 1.5, low: 1 }[v] || (this.tier === 'low' ? 1 : this.tier === 'mid' ? 1.5 : 2);
    this.maxScale = cap; this.renderScale = Math.min(dpr, cap);
    this.onScaleChange && this.onScaleChange();
  }

  get showFps() { return this._showFps; }
  set showFps(v) {
    this._showFps = !!v;
    try { localStorage.setItem('farm.fps', v ? '1' : '0'); } catch { /* приватный режим */ }
    this.onShowFps && this.onShowFps(this._showFps);
  }

  // после экрана загрузки меряем заново: загрузка картинок не должна снижать качество
  restart() { this._slow = 0; this._warmup = 2; this._acc = 0; this._n = 0; }

  // отметка внутри кадра: что и сколько мс заняло (попадает в описание фриза)
  mark(name, ms = 0) { const t = this._tags[name]; this._tags[name] = t ? { n: t.n + 1, ms: t.ms + ms } : { n: 1, ms }; }

  // итог кадра: ms — работа JS, gap — сколько прошло с прошлого кадра, part — разбивка
  frame(ms, gap, interval, part) {
    const long = ms > 34 || gap > Math.max(120, interval * 2.5);
    if (long) {
      const tags = Object.entries(this._tags).map(([k, v]) => `${k}${v.n > 1 ? '×' + v.n : ''}${v.ms >= 1 ? ' ' + v.ms.toFixed(0) : ''}`);
      for (const [k, v] of Object.entries(part)) if (v >= 3) tags.push(`${k} ${v.toFixed(0)}`);
      if (gap - ms > 80) tags.push(`пауза ${(gap - ms).toFixed(0)}`); // браузер/видеокарта/сборка мусора
      this.spikes.unshift({ at: (performance.now() - this._t0) / 1000, ms: Math.max(ms, gap), tags: tags.join(', ') || '?' });
      if (this.spikes.length > 5) this.spikes.length = 5;
    }
    this._tags = {};
  }

  work(ms) { this._work += ms; if (ms > this._workMax) this._workMax = ms; }

  // dt — реальная длительность кадра, сек. Если кадры долго не укладываются в бюджет,
  // ограничиваем FPS до 30 и время от времени пробуем 60 снова. Разрешение сами не снижаем:
  // в WebGL это даёт «мыло», а его игрок выбирает сам (Настройки → Графика).
  sample(dt, budgetFps) {
    this._acc += dt; this._n++;
    if (dt > 1.4 / this.targetFps) this._over = (this._over || 0) + 1; // кадр не уложился
    if (this._acc < 1) return;
    const avg = this._acc / this._n, over = (this._over || 0) / this._n;
    this.fps = 1 / avg;
    this.frameMs = this._work / this._n; this.frameMax = this._workMax; this._work = 0; this._workMax = 0;
    this._acc = 0; this._n = 0; this._over = 0;
    if (this._warmup > 0) { this._warmup--; return; }
    if (budgetFps < this.targetFps) return; // в режиме простоя не меряем
    // «медленная» секунда — когда не укладывается больше трети кадров (один фриз не считается)
    const slow = over > 0.35;
    if (this._probe > 0) { // пробуем снова 60 FPS
      this._probeSlow = (this._probeSlow || 0) + (slow ? 1 : 0);
      if (this._probeSlow >= 2) { this.targetFps = 30; this._probe = 0; this._lockSec = 0; this._probeIn = Math.min(120, this._probeIn * 2); }
      else if (--this._probe === 0) { this._probeIn = 15; this._slow = 0; } // справились — остаёмся на 60
      return;
    }
    if (this.targetFps === 30 && this.baseFps > 30) { // заперты на 30: время от времени пробуем 60
      if (++this._lockSec >= this._probeIn) { this.targetFps = 60; this._probe = 3; this._probeSlow = 0; this._warmup = 1; }
      return;
    }
    if (slow) this._slow++; else this._slow = Math.max(0, this._slow - 1);
    if (this._slow >= 3) {
      this._slow = 0;
      if (this.targetFps > 30) { this.targetFps = 30; this._lockSec = 0; this._probeIn = this._probeIn || 15; }
    }
  }
}
