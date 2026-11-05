// Звук без файлов: милые звуки действий и lofi-музыка синтезируются Web Audio.
// Ничего не скачивается, музыка генерируется по нотам (каждый круг немного другой).

const SETTINGS_KEY = 'farm.audio.v1';
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Музыкальные темы: аккорды (MIDI), темп, барабаны
const THEMES = {
  farm: {
    bpm: 74, drums: true,
    chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], // Fmaj7 Em7 Dm7 Cmaj7
    scale: [60, 62, 64, 67, 69, 72, 74, 76],
  },
  menu: {
    bpm: 62, drums: false,
    chords: [[45, 52, 55, 59, 60], [41, 48, 52, 55, 57], [48, 52, 55, 59, 62], [43, 50, 54, 57, 59]], // Am9 Fmaj9 Cmaj9 G6
    scale: [64, 67, 69, 71, 72, 76, 79],
  },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.s = { music: 0.55, sfx: 0.7, muted: false, vibro: true };
    try { Object.assign(this.s, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch (e) { /* */ }
    this.theme = 'menu';
    this.step = 0; this.nextT = 0; this.bar = 0;
    this.seed = 1;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (!this.s.muted) this.ctx.resume();
    });
  }

  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.s)); } catch (e) { /* */ } }

  // Браузеры разрешают звук только после нажатия пользователя
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden && !this.s.muted) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 2.2; // телефонные динамики тихие
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(c.destination);
    // музыка через тёплый фильтр (lofi), звуки — напрямую
    this.musicBus = c.createGain();
    const warm = c.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 2600; warm.Q.value = 0.4;
    this.musicBus.connect(warm); warm.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.noise = this.makeNoise();
    this.applyVolume();
    this.startVinyl();
    this.nextT = c.currentTime + 0.1;
    this._timer = setInterval(() => this.schedule(), 90);
  }

  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, m = this.s.muted ? 0 : 1;
    this.musicBus.gain.setTargetAtTime(this.s.music * 0.5 * m, t, 0.3);
    this.sfxBus.gain.setTargetAtTime(this.s.sfx * 0.8 * m, t, 0.05);
    if (this.s.muted) this.ctx.suspend(); else if (!document.hidden) this.ctx.resume();
  }

  set(key, v) { this.s[key] = v; this.saveSettings(); this.applyVolume(); }

  // Тема меняется на начале такта, чтобы музыка не обрывалась посреди аккорда
  setTheme(name) { if (THEMES[name]) this.want = name; }

  makeNoise() {
    const c = this.ctx, len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  // ---------- примитивы ----------
  tone(bus, t, f, dur, { type = 'sine', vol = 0.3, a = 0.005, slide = 0, detune = 0, lp = 0 } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    let out = g;
    if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; g.connect(fl); out = fl; }
    o.connect(g); out.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  hiss(bus, t, dur, { vol = 0.2, type = 'bandpass', f = 2000, q = 1, a = 0.003 } = {}) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  // ---------- звуки игры ----------
  play(name) {
    if (!this.ctx || this.s.muted || this.s.sfx <= 0 || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01, B = this.sfxBus, T = (...a) => this.tone(B, ...a), H = (...a) => this.hiss(B, ...a);
    const v = 0.9 + Math.random() * 0.2; // лёгкий разброс высоты, чтобы не надоедало
    switch (name) {
      case 'tap': T(t, 880 * v, 0.07, { vol: 0.12, type: 'triangle' }); break;
      case 'pop': T(t, 620 * v, 0.09, { vol: 0.16, slide: 1.6 }); break;
      case 'open': T(t, 520, 0.12, { vol: 0.14, type: 'triangle', slide: 1.5 }); T(t + 0.06, 780, 0.12, { vol: 0.1, type: 'triangle' }); break;
      case 'close': T(t, 700, 0.1, { vol: 0.1, type: 'triangle', slide: 0.6 }); break;
      case 'chop': T(t, 190 * v, 0.12, { vol: 0.35, type: 'triangle', slide: 0.5 }); H(t, 0.08, { vol: 0.25, f: 1400, q: 2 }); break;
      case 'mine': T(t, 1250 * v, 0.16, { vol: 0.12, type: 'square', lp: 2400 }); T(t, 1870 * v, 0.1, { vol: 0.08, type: 'triangle' }); H(t, 0.06, { vol: 0.2, f: 3500, q: 3 }); break;
      case 'break': T(t, 300 * v, 0.25, { vol: 0.25, type: 'triangle', slide: 0.4 }); H(t, 0.2, { vol: 0.25, type: 'lowpass', f: 900 }); break;
      case 'dig': H(t, 0.14, { vol: 0.3, type: 'lowpass', f: 600 }); T(t, 130 * v, 0.12, { vol: 0.2, slide: 0.6 }); break;
      case 'plant': T(t, 660 * v, 0.1, { vol: 0.16 }); T(t + 0.07, 990 * v, 0.14, { vol: 0.14 }); break;
      case 'water': for (let i = 0; i < 4; i++) T(t + i * 0.07, (900 + Math.random() * 500), 0.09, { vol: 0.1, slide: 1.8 }); H(t, 0.35, { vol: 0.08, f: 3000, q: 0.7, a: 0.05 }); break;
      case 'fill': H(t, 0.4, { vol: 0.12, f: 1200, q: 0.8, a: 0.05 }); T(t + 0.05, 500, 0.3, { vol: 0.1, slide: 2 }); break;
      case 'harvest': T(t, 784, 0.12, { vol: 0.16, type: 'triangle' }); T(t + 0.08, 1047, 0.18, { vol: 0.16, type: 'triangle' }); break;
      case 'coin': T(t, 1319, 0.08, { vol: 0.14, type: 'square', lp: 4000 }); T(t + 0.07, 1760, 0.22, { vol: 0.14, type: 'square', lp: 4000 }); break;
      case 'eat': for (let i = 0; i < 3; i++) H(t + i * 0.09, 0.06, { vol: 0.2, f: 900 + i * 200, q: 3 }); break;
      case 'cast': H(t, 0.22, { vol: 0.08, type: 'highpass', f: 2500, a: 0.15 }); T(t + 0.2, 300, 0.15, { vol: 0.12, slide: 2.2 }); break;
      case 'splash': H(t, 0.3, { vol: 0.2, f: 1100, q: 0.6 }); T(t, 400, 0.15, { vol: 0.1, slide: 2.5 }); break;
      case 'catch': this.play('splash'); [784, 988, 1175].forEach((f, i) => T(t + 0.1 + i * 0.07, f, 0.16, { vol: 0.13, type: 'triangle' })); break;
      case 'level': [523, 659, 784, 1047].forEach((f, i) => T(t + i * 0.1, f, 0.3, { vol: 0.15, type: 'triangle' })); T(t + 0.4, 1568, 0.5, { vol: 0.07 }); break;
      case 'quest': [659, 784, 1047].forEach((f, i) => T(t + i * 0.09, f, 0.25, { vol: 0.14, type: 'triangle' })); break;
      case 'error': T(t, 220, 0.14, { vol: 0.14, type: 'triangle' }); T(t + 0.12, 180, 0.18, { vol: 0.14, type: 'triangle' }); break;
      case 'unlock': [392, 523, 659, 784].forEach((f, i) => T(t + i * 0.08, f, 0.35, { vol: 0.13, type: 'triangle' })); H(t, 0.6, { vol: 0.05, type: 'highpass', f: 6000, a: 0.2 }); break;
    }
  }

  // ---------- музыка ----------
  startVinyl() {
    // тихое потрескивание пластинки
    const c = this.ctx, len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.06 + (Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.9 : 0);
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; s.loop = true; fl.type = 'bandpass'; fl.frequency.value = 2200; fl.Q.value = 0.5; g.gain.value = 0.12;
    s.connect(fl); fl.connect(g); g.connect(this.musicBus); s.start();
  }

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') { if (c) this.nextT = c.currentTime + 0.1; return; }
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.05;
    const th = THEMES[this.theme], sixteenth = 60 / th.bpm / 4;
    while (this.nextT < c.currentTime + 0.35) {
      if (this.want && this.want !== this.theme && this.step % 8 === 0) { this.theme = this.want; this.step = 0; this.bar = 0; return this.schedule(); }
      const st = this.step % 16;
      // свинг: нечётные шестнадцатые чуть позже
      const t = this.nextT + (st % 2 ? sixteenth * 0.18 : 0);
      if (this.s.music > 0) this.note(th, st, t, sixteenth);
      this.nextT += sixteenth;
      this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  }

  note(th, st, t, sx) {
    const B = this.musicBus, chord = th.chords[this.bar % th.chords.length];
    // электропиано: аккорд на 1 и «и» второй доли, мягкая атака, лёгкая расстройка
    if (st === 0 || st === 6) {
      const dur = st === 0 ? sx * 10 : sx * 9;
      chord.forEach((n, i) => {
        const tt = t + i * 0.012;
        this.tone(B, tt, midi(n), dur, { type: 'triangle', vol: 0.07, a: 0.03, detune: -6, lp: 1600 });
        this.tone(B, tt, midi(n), dur, { type: 'sine', vol: 0.06, a: 0.03, detune: 7 });
      });
    }
    // бас
    if (st === 0 || st === 10) this.tone(B, t, midi(chord[0] - 12), sx * 6, { vol: 0.22, a: 0.02, lp: 400 });
    // редкая мелодия из нот гаммы
    if ((st === 4 || st === 8 || st === 12 || st === 14) && this.rnd() < (th.drums ? 0.42 : 0.3)) {
      const n = th.scale[(this.rnd() * th.scale.length) | 0];
      this.tone(B, t, midi(n + 12), sx * 5, { vol: 0.05, a: 0.01, type: 'sine' });
      this.tone(B, t, midi(n + 24), sx * 2, { vol: 0.012, a: 0.005, type: 'sine' }); // «колокольчик»
    }
    if (!th.drums) return;
    // мягкие барабаны: бочка, римшот, шейкер
    if (st === 0 || st === 7 || (st === 10 && this.bar % 2)) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(B); o.start(t); o.stop(t + 0.35);
    }
    if (st === 4 || st === 12) this.hiss(B, t, 0.09, { vol: 0.09, f: 1800, q: 1.2 });
    if (st % 2 === 0) this.hiss(B, t, 0.035, { vol: st % 4 === 2 ? 0.035 : 0.02, type: 'highpass', f: 7500 });
  }
}
