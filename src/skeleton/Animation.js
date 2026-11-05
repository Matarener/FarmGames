// Анимации ключевыми кадрами и их проигрывание со смешиванием.
//
// Данные анимации:
// { duration, loop?, bones: { boneName: { rotate: [[t, deg, curve?]...],
//                                         translate: [[t, x, y, curve?]...],
//                                         scale: [[t, sx, sy, curve?]...] } },
//   slots: { slotName: [[t, attachmentName|null]...] },
//   events: [[t, 'name']...] }
// Значения rotate/translate — смещения от позы покоя, scale — множители.
// curve: 0 — линейно, 1 — ступенька, 2 — плавно, 3 — ускорение, 4 — замедление.

function ease(c, t) {
  switch (c) {
    case 1: return 0;
    case 2: return t * t * (3 - 2 * t);
    case 3: return t * t;
    case 4: return 1 - (1 - t) * (1 - t);
    default: return t;
  }
}

// Возвращает индекс ключа и долю до следующего (для массива [[t, ...], ...])
function seek(keys, time) {
  const n = keys.length;
  if (time <= keys[0][0]) return [0, 0];
  if (time >= keys[n - 1][0]) return [n - 1, 0];
  let i = 0;
  while (i < n - 1 && keys[i + 1][0] <= time) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const t = (time - k0[0]) / (k1[0] - k0[0]);
  const curve = k0[k0.length > 3 ? 3 : 2];
  return [i, ease(typeof curve === 'number' ? curve : 0, t)];
}

function sample1(keys, time) {
  const [i, t] = seek(keys, time);
  const a = keys[i][1];
  return i + 1 < keys.length ? a + (keys[i + 1][1] - a) * t : a;
}

export class Animation {
  constructor(name, data) {
    this.name = name;
    this.duration = data.duration;
    this.loop = data.loop !== false;
    this.bones = data.bones || {};
    this.slots = data.slots || {};
    this.events = data.events || [];
    // Нормализуем кривые: rotate [t, v, c], translate/scale [t, x, y, c]
    for (const tl of Object.values(this.bones)) {
      if (tl.rotate) tl.rotate = tl.rotate.map((k) => [k[0], k[1], k[2] || 0]);
      if (tl.translate) tl.translate = tl.translate.map((k) => [k[0], k[1], k[2], k[3] || 0]);
      if (tl.scale) tl.scale = tl.scale.map((k) => [k[0], k[1], k[2], k[3] || 0]);
    }
  }

  apply(sk, time, alpha) {
    for (const name in this.bones) {
      const bone = sk.boneMap[name];
      if (!bone) continue;
      const tl = this.bones[name], sd = bone.data;
      if (tl.rotate) {
        const v = (sd.rotation || 0) + sample1(tl.rotate, time);
        bone.rotation += (v - bone.rotation) * alpha;
      }
      if (tl.translate) {
        const k = tl.translate, [i, t] = seek(k, time);
        let x = k[i][1], y = k[i][2];
        if (i + 1 < k.length) { x += (k[i + 1][1] - x) * t; y += (k[i + 1][2] - y) * t; }
        bone.x += ((sd.x || 0) + x - bone.x) * alpha;
        bone.y += ((sd.y || 0) + y - bone.y) * alpha;
      }
      if (tl.scale) {
        const k = tl.scale, [i, t] = seek(k, time);
        let x = k[i][1], y = k[i][2];
        if (i + 1 < k.length) { x += (k[i + 1][1] - x) * t; y += (k[i + 1][2] - y) * t; }
        bone.scaleX += ((sd.scaleX ?? 1) * x - bone.scaleX) * alpha;
        bone.scaleY += ((sd.scaleY ?? 1) * y - bone.scaleY) * alpha;
      }
    }
    if (alpha >= 0.5) {
      for (const name in this.slots) {
        const slot = sk.slotMap[name];
        if (!slot) continue;
        const keys = this.slots[name];
        let v = keys[0][1];
        for (const k of keys) if (k[0] <= time) v = k[1];
        slot.attachment = v;
      }
    }
  }
}

// Проигрыватель: одна дорожка + плавный переход (crossfade) от предыдущей.
export class AnimationState {
  constructor(skeleton, animations) {
    this.sk = skeleton;
    this.anims = {};
    for (const [n, d] of Object.entries(animations)) this.anims[n] = new Animation(n, d);
    this.cur = null; this.time = 0; this.speed = 1; this.loop = true;
    this.prev = null; this.prevTime = 0; this.mix = 0; this.mixDur = 0;
    this.onEvent = null;     // (name, animName) => void
    this.onComplete = null;  // (animName) => void
  }

  get name() { return this.cur ? this.cur.name : null; }

  play(name, opts = {}) {
    const a = this.anims[name];
    if (!a) return;
    if (this.cur === a && !opts.restart) { this.speed = opts.speed ?? this.speed; return; }
    if (this.cur) { this.prev = this.cur; this.prevTime = this.time; this.mix = 0; this.mixDur = opts.mix ?? 0.15; }
    this.cur = a; this.time = 0;
    this.speed = opts.speed ?? 1;
    this.loop = opts.loop ?? a.loop;
  }

  update(dt) {
    if (!this.cur) return;
    const a = this.cur;
    const t0 = this.time;
    let t1 = t0 + dt * this.speed;
    // события на отрезке (t0, t1]
    const fire = (from, to) => {
      for (const ev of a.events) if (ev[0] > from && ev[0] <= to) this.onEvent && this.onEvent(ev[1], a.name);
    };
    if (t1 >= a.duration) {
      fire(t0, a.duration);
      if (this.loop) {
        t1 %= a.duration;
        fire(-1, t1);
        this.onComplete && this.onComplete(a.name, true);
      } else {
        t1 = a.duration;
        if (t0 < a.duration) this.onComplete && this.onComplete(a.name, false);
      }
    } else fire(t0, t1);
    // play() внутри обратного вызова могла сменить анимацию
    if (this.cur === a) this.time = t1;

    if (this.prev) {
      this.prevTime = Math.min(this.prev.duration, this.prevTime + dt);
      if (this.prev.loop) this.prevTime %= this.prev.duration;
      this.mix += dt;
      if (this.mix >= this.mixDur) this.prev = null;
    }
  }

  apply() {
    const sk = this.sk;
    sk.setToSetupPose();
    if (this.prev) {
      this.prev.apply(sk, this.prevTime, 1);
      this.cur.apply(sk, this.time, Math.min(1, this.mix / this.mixDur));
    } else if (this.cur) {
      this.cur.apply(sk, this.time, 1);
    }
    sk.updateWorld();
  }
}
