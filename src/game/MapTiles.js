// «Запечённая» карта: земля и все неподвижные объекты, нарезанные на квадраты 256×256
// на нескольких уровнях масштаба (каждый следующий в √2 раз крупнее), как в онлайн-картах.
// Квадрат рисуется один раз и дальше только переносится на экран: прокрутка и зум ничего
// не перерисовывают. Квадрат обновляется, только если на нём что-то изменилось.
// Уровень берётся ближайший не мельче экрана — картинка только уменьшается, без размытия.
import { makeCanvas } from '../engine/Sprite.js';

export const TILE = 256;
const levelOf = (va) => Math.ceil(2 * Math.log2(va) - 1e-6);
const scaleOf = (L) => Math.pow(2, L / 2);

export class MapTiles {
  constructor(farm, maxTiles) {
    this.f = farm;
    this.max = maxTiles;
    this.map = new Map(); // "L|i|j" → квадрат
    this.pool = [];
    this.frame = 0;
    this.key = '';
    this.pending = false; // на экране есть недостроенные квадраты
    this.built = 0;
  }

  // мировой прямоугольник квадрата (с пикселем запаса по краям — без швов между квадратами)
  rect(t) {
    const s = t.s;
    return [(t.i * TILE - 1) / s, (t.j * TILE - 1) / s, ((t.i + 1) * TILE + 1) / s, ((t.j + 1) * TILE + 1) / s];
  }

  build(t) {
    const g = t.c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = this.f.r.ctx.imageSmoothingQuality;
    const [x0, y0, x1, y1] = this.rect(t);
    g.setTransform(t.s, 0, 0, t.s, -t.i * TILE + 1, -t.j * TILE + 1);
    this.f.drawScene(g, x0, y0, x1, y1, null);
    t.dirty = false; t.patch = null;
    this.built++;
    this.f.stats.layers++;
  }

  get(L, i, j, make) {
    const k = L + '|' + i + '|' + j;
    let t = this.map.get(k);
    if (!t && make) {
      const c = this.pool.pop() || makeCanvas(TILE + 2, TILE + 2);
      t = { k, L, i, j, s: scaleOf(L), c, dirty: true, used: 0 };
      this.map.set(k, t);
    }
    return t;
  }

  drop(t) { this.map.delete(t.k); this.pool.push(t.c); }

  // всё перерисовать (новые картинки, открыт участок): видимое — сразу, остальное — выкинуть
  invalidateAll() { for (const t of this.map.values()) t.dirty = true; }

  // изменившиеся прямоугольники мира: квадраты под ними перерисуют только эти места
  invalidate(R) {
    if (!R.length) return;
    for (const t of this.map.values()) {
      if (t.dirty) continue;
      const [x0, y0, x1, y1] = this.rect(t);
      for (let i = 0; i < R.length; i += 4) {
        if (R[i] < x1 && R[i + 2] > x0 && R[i + 1] < y1 && R[i + 3] > y0) (t.patch || (t.patch = [])).push(R[i], R[i + 1], R[i + 2], R[i + 3]);
      }
      if (t.patch && t.patch.length > 4 * 12) { t.dirty = true; t.patch = null; }
    }
  }

  patch(t) {
    const g = t.c.getContext('2d'), P = t.patch, s = t.s, ox = -t.i * TILE + 1, oy = -t.j * TILE + 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    for (let n = 0; n < P.length; n += 4) {
      // по целым пикселям квадрата: без полупрозрачной кромки
      const a = Math.floor(P[n] * s + ox), b = Math.floor(P[n + 1] * s + oy);
      g.rect(a, b, Math.ceil(P[n + 2] * s + ox) - a, Math.ceil(P[n + 3] * s + oy) - b);
      x0 = Math.min(x0, (a - ox) / s); y0 = Math.min(y0, (b - oy) / s);
      x1 = Math.max(x1, (Math.ceil(P[n + 2] * s + ox) - ox) / s); y1 = Math.max(y1, (Math.ceil(P[n + 3] * s + oy) - oy) / s);
    }
    g.clip();
    g.setTransform(s, 0, 0, s, ox, oy);
    this.f.drawScene(g, x0, y0, x1, y1, null);
    g.restore();
    t.patch = null;
    this.f.stats.parts++;
  }

  range(v, s) {
    return [Math.floor(v.minX * s / TILE), Math.floor(v.minY * s / TILE), Math.floor(v.maxX * s / TILE), Math.floor(v.maxY * s / TILE)];
  }

  // Нарисовать карту на экран. budget — сколько мс можно потратить на новые квадраты.
  draw(ctx, budget, warm) {
    const r = this.f.r, v = r.view, L = levelOf(r.va), s = scaleOf(L), k = r.va / s;
    const fr = ++this.frame, t0 = performance.now();
    const [i0, j0, i1, j1] = this.range(v, s);
    const miss = [];
    // 1) готовые и изменившиеся квадраты; изменившиеся на экране перерисовываются сразу —
    //    иначе срубленное дерево ещё кадр стояло бы на месте
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const t = this.get(L, i, j, false);
      if (t && t.dirty) this.build(t);
      else if (t && t.patch) this.patch(t);
      if (t) t.used = fr; else miss.push(i, j);
    }
    // 2) новые квадраты — пока есть время (хотя бы один за кадр)
    let left = 0;
    for (let n = 0; n < miss.length; n += 2) {
      if (!warm && n > 0 && performance.now() - t0 > budget) { left = miss.length - n; break; }
      const t = this.get(L, miss[n], miss[n + 1], true);
      this.build(t); t.used = fr;
    }
    this.pending = left > 0;
    if (left) {
      // недостроенное — временно из более мелкого уровня (чуть мягче, через кадр-другой станет чётким)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.f.bg; ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);
      for (let n = miss.length - left; n < miss.length; n += 2) this.fallback(ctx, L, miss[n], miss[n + 1], fr);
    }
    // 3) на экран: квадрат уровня L в масштабе k
    ctx.setTransform(k, 0, 0, k, r.ve, r.vf);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const t = this.get(L, i, j, false);
      if (t && !t.dirty) ctx.drawImage(t.c, i * TILE - 1, j * TILE - 1);
    }
    // 4) запас на время простоя: соседние квадраты (для прокрутки) и уровень мельче (для зума)
    if (!left) this.prefetch(L, i0, j0, i1, j1, t0, budget, fr, warm);
    this.evict(fr);
    r.resetView();
    return { L, s, k };
  }

  fallback(ctx, L, i, j, fr) {
    const r = this.f.r, s = scaleOf(L);
    for (let L2 = L - 1; L2 >= L - 4; L2--) {
      const s2 = scaleOf(L2), q = s2 / s;
      const a0 = Math.floor(i * TILE * q / TILE), b0 = Math.floor(j * TILE * q / TILE);
      const a1 = Math.floor(((i + 1) * TILE * q - 1) / TILE), b1 = Math.floor(((j + 1) * TILE * q - 1) / TILE);
      let ok = true;
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const t = this.get(L2, a, b, false); if (!t || t.dirty || t.patch) ok = false; }
      if (!ok) continue;
      const k2 = r.va / s2;
      ctx.setTransform(k2, 0, 0, k2, r.ve, r.vf);
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const t = this.get(L2, a, b, false); t.used = fr; ctx.drawImage(t.c, a * TILE - 1, b * TILE - 1); }
      return;
    }
  }

  prefetch(L, i0, j0, i1, j1, t0, budget, fr, warm) {
    const jobs = [];
    // кольцо вокруг экрана на текущем уровне
    for (let j = j0 - 1; j <= j1 + 1; j++) for (let i = i0 - 1; i <= i1 + 1; i++) {
      if (i >= i0 && i <= i1 && j >= j0 && j <= j1) continue;
      jobs.push(L, i, j);
    }
    // экран на уровне мельче (отдаление во время щипка)
    const v = this.f.r.view;
    for (const L2 of [L - 1, L - 2]) {
      const [a0, b0, a1, b1] = this.range(v, scaleOf(L2));
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) jobs.push(L2, a, b);
    }
    for (let n = 0; n < jobs.length; n += 3) {
      const t = this.get(jobs[n], jobs[n + 1], jobs[n + 2], false);
      if (t && !t.dirty && !t.patch) { t.used = fr; continue; }
      if (!warm && performance.now() - t0 > budget * 0.5) return;
      if (this.map.size >= this.max && !t) return;
      const nt = t || this.get(jobs[n], jobs[n + 1], jobs[n + 2], true);
      this.build(nt); nt.used = fr;
    }
  }

  evict(fr) {
    // выкидываем изменившиеся квадраты вне экрана и самые давно не нужные сверх лимита
    for (const t of this.map.values()) if ((t.dirty || t.patch) && t.used !== fr) this.drop(t);
    if (this.map.size <= this.max) return;
    const old = [...this.map.values()].filter((t) => t.used !== fr).sort((a, b) => a.used - b.used);
    for (let n = 0; n < old.length && this.map.size > this.max; n++) this.drop(old[n]);
  }
}
