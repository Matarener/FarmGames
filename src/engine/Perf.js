// Определение мощности устройства и адаптивное качество рендера.
// Цель: стабильный кадр на слабых телефонах без ручных настроек.

export class Perf {
  constructor() {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const dpr = window.devicePixelRatio || 1;

    let tier = 'high';
    if (cores <= 4 || mem <= 3) tier = 'mid';
    if (cores <= 2 || mem <= 1.5) tier = 'low';
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'low' || q === 'mid' || q === 'high') tier = q;

    this.tier = tier;
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
    this.spikes = []; this._tags = {}; this._tagged = false; this._t0 = performance.now(); this._prevMs = 0;
    // fps «в движении» — только по кадрам вне покоя (в покое игра нарочно рисует idleFps)
    this.fpsActive = 0; this.fpsActiveAt = 0; this._accA = 0; this._nA = 0; this._wasActive = false;
    // частота экрана (Гц): медиана промежутков между вызовами requestAnimationFrame
    this.hz = 0; this._vt = 0; this._vn = 0; this._vs = new Float32Array(61);
    this.gpu = ''; // название видеокарты (createPixiApp)
    this._lf = []; this.watchLong();
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
  restart() { this._slow = 0; this._warmup = 2; this._acc = 0; this._n = 0; this._tags = {}; this._tagged = false; }

  // отметка внутри кадра: что и сколько мс заняло (попадает в описание фриза)
  mark(name, ms = 0) { const t = this._tags[name]; this._tags[name] = t ? { n: t.n + 1, ms: t.ms + ms } : { n: 1, ms }; this._tagged = true; }

  // Часть кадра, начатая в t0 (performance.now()): если заняла не меньше min мс — отметка name.
  // → текущее время (начало следующей части). Так в описании фриза видно, какая часть логики была долгой.
  part(name, t0, min = 2) { const t = performance.now(); if (t - t0 >= min) this.mark(name, t - t0); return t; }

  // Каждый вызов requestAnimationFrame (и пропущенный ограничителем): по промежуткам — частота экрана
  vsync(t) {
    const d = t - this._vt; this._vt = t;
    if (d < 4 || d > 50) return; // первый кадр, вкладка была скрыта
    const V = this._vs; V[this._vn++] = d;
    if (this._vn < V.length) return;
    this._vn = 0;
    this.hz = Math.round(1000 / V.slice().sort()[V.length >> 1]);
  }

  // итог кадра: ms — работа JS, gap — сколько прошло с прошлого кадра, interval — сколько должно было пройти,
  // part — разбивка, t — время кадра (requestAnimationFrame)
  frame(ms, gap, interval, part, t = performance.now()) {
    const long = ms > 34 || gap > Math.max(120, interval * 2.5);
    // пауза — насколько дольше обычного ждали кадра, не считая работы прошлого кадра:
    // в это время работали браузер, сборка мусора, обработчики нажатий и таймеров, вёрстка окон
    const pause = gap - interval - this._prevMs;
    this._prevMs = ms;
    if (long) {
      const tags = Object.entries(this._tags).map(([k, v]) => `${k}${v.n > 1 ? '×' + v.n : ''}${v.ms >= 1 ? ' ' + v.ms.toFixed(0) : ''}`);
      for (const [k, v] of Object.entries(part)) if (v >= 3) tags.push(`${k} ${v.toFixed(0)}`);
      if (pause > 40) tags.push(`пауза ${pause.toFixed(0)}`);
      const sp = { at: (performance.now() - this._t0) / 1000, ms: Math.max(ms, gap), tags: tags.join(', ') || '?', t0: t - gap, t1: t + ms, lfs: [], why: '' };
      for (const e of this._lf) this._attach(sp, e); // долгие кадры браузера, о которых уже сообщили
      this.spikes.unshift(sp);
      if (this.spikes.length > 5) this.spikes.length = 5;
    }
    if (this._tagged) { this._tags = {}; this._tagged = false; }
  }

  // Долгие кадры браузера (Long Animation Frames API, Chrome 123+; иначе — просто долгие задачи):
  // что занимало поток во время фриза — наш кадр, обработчик нажатия или таймер (какая функция),
  // вёрстка окна или сам браузер. Браузер сообщает о них чуть позже — подписываем уже записанный фриз.
  watchLong() {
    try {
      const types = (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes) || [];
      const type = types.includes('long-animation-frame') ? 'long-animation-frame' : types.includes('longtask') ? 'longtask' : '';
      if (!type) return;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          this._lf.push(e); if (this._lf.length > 8) this._lf.shift();
          for (const s of this.spikes) this._attach(s, e);
        }
      }).observe({ type });
    } catch { /* нет API */ }
  }

  _attach(s, e) {
    if (e.startTime >= s.t1 || e.startTime + e.duration <= s.t0 || s.lfs.includes(e)) return;
    s.lfs.push(e);
    s.why = s.lfs.map(describeLong).join('; ');
  }

  work(ms) { this._work += ms; if (ms > this._workMax) this._workMax = ms; }

  // dt — реальная длительность кадра, сек. Если кадры долго не укладываются в бюджет,
  // ограничиваем FPS до 30 и время от времени пробуем 60 снова. Разрешение сами не снижаем:
  // в WebGL это даёт «мыло», а его игрок выбирает сам (Настройки → Графика).
  sample(dt, budgetFps) {
    // fps «в движении»: кадры вне покоя, кроме первого после покоя (его промежуток — ещё от покоя)
    const active = budgetFps >= this.targetFps;
    if (active && this._wasActive) {
      this._accA += dt; this._nA++;
      if (this._accA >= 1) { this.fpsActive = this._nA / this._accA; this.fpsActiveAt = performance.now(); this._accA = 0; this._nA = 0; }
    }
    this._wasActive = active;
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

// Описание долгого кадра браузера для ловушки фризов: «браузер 180: нажатие BUTTON#btn-bag 120 (вёрстка 30), DOM 40, без скриптов 20».
// Наши функции — с местом в коде (@позиция в файле сборки): по нему видно, какая именно.
function describeLong(e) {
  const d = Math.round(e.duration);
  if (!e.scripts) return `долгая задача ${d}`; // старый браузер: подробностей нет
  const out = [];
  let js = 0;
  for (const s of e.scripts) {
    js += s.duration;
    if (s.duration < 4) continue;
    const inv = s.invoker || '';
    let n = inv === 'FrameRequestCallback' ? 'кадр игры'
      : inv.includes('setTimeout') ? 'таймер' : inv.includes('setInterval') ? 'интервал'
        : s.invokerType === 'event-listener' ? 'событие ' + inv.replace(/^HTML|Element/g, '')
          : s.invokerType === 'resolve-promise' || s.invokerType === 'reject-promise' ? 'промис' : inv.slice(0, 40);
    if (s.sourceFunctionName) n += ' ' + s.sourceFunctionName;
    if (s.sourceCharPosition > 0) n += '@' + s.sourceCharPosition;
    const lay = s.forcedStyleAndLayoutDuration;
    out.push(`${n} ${Math.round(s.duration)}${lay >= 4 ? ` (вёрстка ${Math.round(lay)})` : ''}`);
  }
  // после скриптов кадра браузер считает стили и вёрстку страницы (DOM поверх игры)
  const dom = e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0;
  if (dom >= 4) out.push(`DOM ${Math.round(dom)}`);
  const rest = d - js - dom;
  if (rest >= 8) out.push(`без скриптов ${Math.round(rest)}`); // сам браузер: система, видеокарта, Telegram
  return `браузер ${d}: ${out.join(', ') || '?'}`;
}
