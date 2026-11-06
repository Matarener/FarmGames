// Мир фермы: сетка тайлов, объекты, участки (чанки) территории.
// Мир генерируется детерминированно из seed, в сохранение пишется только разница.

import { mulberry32, hash2 } from '../engine/Sprite.js';
import { OBJECTS } from './data.js';
import { toWorld } from '../engine/Iso.js';

export const CHUNK = 10;
export const CHUNKS = 5;
export const N = CHUNK * CHUNKS;
export const START_CHUNK = 2 * CHUNKS + 2; // центральный участок
export const T = { GRASS: 0, SOIL: 1, WATER: 2, PATH: 3 };

const tmp = { x: 0, y: 0 };

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.tiles = new Uint8Array(N * N);
    this.variant = new Uint8Array(N * N);
    this.occ = new Int32Array(N * N).fill(-1);
    this.objects = [];   // индекс = id, удалённые → null
    this.unlocked = new Uint8Array(CHUNKS * CHUNKS);
    this.unlocked[START_CHUNK] = 1;
    this.version = 0;    // растёт при изменении объектов (для пересортировки)
    this.generate();
  }

  idx(x, y) { return y * N + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }
  chunkOf(x, y) { return ((y / CHUNK) | 0) * CHUNKS + ((x / CHUNK) | 0); }
  isOpen(x, y) { return this.inside(x, y) && this.unlocked[this.chunkOf(x, y)] === 1; }
  tile(x, y) { return this.tiles[y * N + x]; }
  objectAt(x, y) { if (!this.inside(x, y)) return null; const i = this.occ[y * N + x]; return i >= 0 ? this.objects[i] : null; }

  walkable(x, y) {
    if (!this.isOpen(x, y)) return false;
    const i = y * N + x;
    return (this.tiles[i] !== T.WATER || (this.pier && this.pier.has(i))) && this.occ[i] < 0; // по мостику можно ходить
  }

  add(type, gx, gy) {
    const def = OBJECTS[type];
    const w = def.w || 1, h = def.h || 1;
    for (let y = gy; y < gy + h; y++) for (let x = gx; x < gx + w; x++) {
      if (!this.inside(x, y) || this.occ[y * N + x] >= 0 || this.tiles[y * N + x] !== T.GRASS) return null;
    }
    const o = { id: this.objects.length, type, gx, gy, w, h, hp: def.hp || 0, state: 0, shake: 0 };
    toWorld(gx + w / 2, gy + h / 2, tmp);
    o.wx = tmp.x; o.wy = tmp.y;
    o.depth = gx + w / 2 + gy + h / 2;
    this.objects.push(o);
    for (let y = gy; y < gy + h; y++) for (let x = gx; x < gx + w; x++) this.occ[y * N + x] = o.id;
    return o;
  }

  remove(o) {
    for (let y = o.gy; y < o.gy + o.h; y++) for (let x = o.gx; x < o.gx + o.w; x++) {
      if (this.occ[y * N + x] === o.id) this.occ[y * N + x] = -1;
    }
    this.objects[o.id] = null;
    o.state = 2;
    this.version++;
  }

  generate() {
    const rnd = mulberry32(this.seed);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const h = hash2(x + this.seed % 1000, y);
      this.variant[y * N + x] = h < 0.55 ? 0 : h < 0.8 ? 1 : h < 0.9 ? 3 : 2;
    }
    const ox = 2 * CHUNK, oy = 2 * CHUNK;
    const L = (lx, ly) => [ox + lx, oy + ly];
    const setT = (x, y, t) => { this.tiles[y * N + x] = t; };

    // --- Стартовый участок (дизайн вручную) ---
    const reserved = new Set();
    const res = (x, y) => reserved.add(y * N + x);
    // дом 2×2
    const house = L(2, 2);
    // тропинка от двери
    for (const [lx, ly] of [[3, 4], [3, 5], [4, 5], [5, 5], [5, 6]]) { const [x, y] = L(lx, ly); setT(x, y, T.PATH); res(x, y); }
    // пруд
    for (const [lx, ly] of [[6, 6], [7, 6], [6, 7], [7, 7], [8, 7], [7, 8], [6, 8]]) { const [x, y] = L(lx, ly); setT(x, y, T.WATER); res(x, y); }
    // две грядки
    this.startBeds = [];
    for (const [lx, ly] of [[2, 6], [3, 6]]) { const [x, y] = L(lx, ly); setT(x, y, T.SOIL); res(x, y); this.startBeds.push(y * N + x); }
    this.add('house', house[0], house[1]);
    for (let y = house[1] - 1; y <= house[1] + 2; y++) for (let x = house[0] - 1; x <= house[0] + 2; x++) res(x, y);
    this.playerStart = L(4, 6);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) res(this.playerStart[0] + dx, this.playerStart[1] + dy);
    for (const [lx, ly] of [[1, 6], [4, 6], [2, 7], [3, 7], [1, 7], [5, 7], [5, 8], [8, 6], [6, 9], [8, 8]]) { const [x, y] = L(lx, ly); res(x, y); }

    // гарантированные ресурсы внутри стартового участка
    const fixed = [['oak', 6, 2], ['oak2', 7, 3], ['pine', 8, 1], ['apple', 5, 1], ['rock', 6, 4], ['rock', 1, 4], ['bush', 4, 8], ['berry', 1, 8], ['oak', 2, 8], ['rock', 8, 4]];
    for (const [t, lx, ly] of fixed) { const [x, y] = L(lx, ly); if (!reserved.has(y * N + x)) { this.add(t, x, y); res(x, y); } }

    // лес и камни по краю стартового участка
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const [x, y] = L(lx, ly);
      if (reserved.has(y * N + x)) continue;
      const edge = lx === 0 || ly === 0 || lx === CHUNK - 1 || ly === CHUNK - 1;
      const r = rnd();
      const front = lx === CHUNK - 1 || ly === CHUNK - 1; // передние края: деревья закрывали бы ферму
      if (edge && front) {
        if (r < 0.14) this.add('pine', x, y);
        else if (r < 0.4) this.add('rock', x, y);
        else if (r < 0.6) this.add(r < 0.5 ? 'bush' : 'berry', x, y);
      } else if (edge) {
        if (r < 0.5) this.add(rnd() < 0.7 ? (rnd() < 0.5 ? 'oak' : 'oak2') : 'pine', x, y);
        else if (r < 0.68) this.add('rock', x, y);
        else if (r < 0.76) this.add('bush', x, y);
      } else if (r < 0.06) this.add('bush', x, y);
    }

    // --- Остальные участки ---
    const pondChunks = new Set();
    while (pondChunks.size < 3) { const c = (rnd() * CHUNKS * CHUNKS) | 0; if (c !== START_CHUNK) pondChunks.add(c); }
    for (let cy = 0; cy < CHUNKS; cy++) for (let cx = 0; cx < CHUNKS; cx++) {
      const c = cy * CHUNKS + cx;
      if (c === START_CHUNK) continue;
      const x0 = cx * CHUNK, y0 = cy * CHUNK;
      if (pondChunks.has(c)) {
        const px = x0 + 2 + ((rnd() * 4) | 0), py = y0 + 2 + ((rnd() * 4) | 0);
        for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
          if ((Math.abs(dx - 0.5) + Math.abs(dy - 0.5) < 2.6) && rnd() < 0.9) setT(px + dx, py + dy, T.WATER);
        }
      }
      // валуны 2×2
      const nb = 1 + ((rnd() * 2) | 0);
      for (let i = 0; i < nb; i++) this.add('boulder', x0 + 1 + ((rnd() * (CHUNK - 3)) | 0), y0 + 1 + ((rnd() * (CHUNK - 3)) | 0));
      const forest = 0.14 + rnd() * 0.18; // у каждого участка своя густота
      for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) {
        const r = rnd(), k = rnd();
        if (r < forest) this.add(k < 0.4 ? 'oak' : k < 0.7 ? 'oak2' : k < 0.92 ? 'pine' : 'apple', x, y);
        else if (r < forest + 0.08) this.add('rock', x, y);
        else if (r < forest + 0.13) this.add(k < 0.7 ? 'bush' : 'berry', x, y);
      }
    }
    // Добавочные камни (баланс: камня не хватало на расширения). Отдельный поток случайных
    // чисел и в конце списка — номера старых объектов не сдвигаются, сохранения совместимы.
    const rnd2 = mulberry32(this.seed ^ 0x5bd1e995);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = rnd2();
      if (this.chunkOf(x, y) !== START_CHUNK && r < 0.055) this.add('rock', x, y);
    }
    this.genCount = this.objects.length;
    // Колодец бабушки — после счётчика: он не сохраняется в разнице и всегда на месте
    this.wellPos = L(5, 4); // у тропинки к дому, на виду
    this.well = this.add('well', this.wellPos[0], this.wellPos[1]);
    this.genDecor();
  }

  // Украшения пруда: не объекты (их нельзя рубить и двигать), всегда одинаковые для мира.
  // Камыш, рогоз и камни — у берега, кувшинки и листья — на воде, мостик — по одному на пруд.
  genDecor() {
    const rnd = mulberry32(this.seed ^ 0x7f4a7c15), W = T.WATER;
    this.decor = []; this.pier = new Set();
    const water = (x, y) => this.inside(x, y) && this.tiles[y * N + x] === W;
    const seen = new Uint8Array(N * N);
    const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < N * N; i++) {
      if (this.tiles[i] !== W || seen[i]) continue;
      // один пруд — связная вода
      const pond = [], st = [i]; seen[i] = 1;
      while (st.length) {
        const j = st.pop(); pond.push(j);
        const x = j % N, y = (j / N) | 0;
        for (const [dx, dy] of D4) { const k = (y + dy) * N + x + dx; if (water(x + dx, y + dy) && !seen[k]) { seen[k] = 1; st.push(k); } }
      }
      const land = (j) => { const x = j % N, y = (j / N) | 0; return D4.filter(([dx, dy]) => this.inside(x + dx, y + dy) && !water(x + dx, y + dy)); };
      const shore = pond.filter((j) => land(j).length);
      const used = new Set();
      const take = (list) => { const free = list.filter((j) => !used.has(j)); if (!free.length) return -1; const j = free[(rnd() * free.length) | 0]; used.add(j); return j; };
      const put = (type, j, toLand) => {
        if (j < 0) return;
        const x = j % N, y = (j / N) | 0;
        let ox = (rnd() - 0.5) * 0.2, oy = (rnd() - 0.5) * 0.2;
        if (toLand) { const L = land(j); if (L.length) { const [dx, dy] = L[(rnd() * L.length) | 0]; ox += dx * 0.28; oy += dy * 0.28; } }
        this.decor.push({ type, gx: x, gy: y, x: x + 0.5 + ox, y: y + 0.5 + oy });
      };
      put('cattail', take(shore), true);
      if (pond.length > 8) put('cattail', take(shore), true);
      put('reeds', take(shore), true);
      if (rnd() < 0.7) put('rocks', take(shore), true);
      put('lily', take(pond), false);
      if (pond.length > 8) put('lily', take(pond), false);
      if (rnd() < 0.6) put('leaves', take(pond), false);
    }
  }

  // Снять объект с карты (клетки свободны) и поставить обратно — для загрузки сохранения
  lift(o) {
    for (let y = o.gy; y < o.gy + o.h; y++) for (let x = o.gx; x < o.gx + o.w; x++) {
      if (this.occ[y * N + x] === o.id) this.occ[y * N + x] = -1;
    }
  }

  put(o, gx, gy) { this.moveObject(o, gx, gy); }

  // Перенос своей постройки (дом, колодец) на другие клетки; проверки — в Mover
  moveObject(o, gx, gy) {
    for (let y = o.gy; y < o.gy + o.h; y++) for (let x = o.gx; x < o.gx + o.w; x++) {
      if (this.occ[y * N + x] === o.id) this.occ[y * N + x] = -1;
    }
    o.gx = gx; o.gy = gy;
    toWorld(gx + o.w / 2, gy + o.h / 2, tmp);
    o.wx = tmp.x; o.wy = tmp.y;
    o.depth = gx + o.w / 2 + gy + o.h / 2;
    for (let y = gy; y < gy + o.h; y++) for (let x = gx; x < gx + o.w; x++) this.occ[y * N + x] = o.id;
    this.version++;
  }

  // Можно ли поставить объект сюда при загрузке (вся площадь — свободная трава открытой земли)
  freeFor(o, gx, gy) {
    for (let y = gy; y < gy + o.h; y++) for (let x = gx; x < gx + o.w; x++) {
      if (!this.isOpen(x, y) || this.tiles[y * N + x] !== T.GRASS) return false;
      const i = this.occ[y * N + x];
      if (i >= 0 && i !== o.id) return false;
    }
    return true;
  }

  // Старые сохранения: на месте колодца игрок мог вскопать грядку — ставим его на свободную траву рядом с домом
  fixWell() {
    const o = this.well;
    if (o && this.tiles[o.gy * N + o.gx] === T.GRASS && this.occ[o.gy * N + o.gx] === o.id) return;
    if (o) this.remove(o);
    const [hx, hy] = this.wellPos;
    let best = null, bd = Infinity;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (this.chunkOf(x, y) !== START_CHUNK || this.tiles[y * N + x] !== T.GRASS || this.occ[y * N + x] >= 0) continue;
      const d = Math.hypot(x - hx, y - hy);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    this.well = best ? this.add('well', best[0], best[1]) : null;
  }

  // --- Сохранение разницы с генерацией ---
  // Состояние каждого сгенерированного объекта: 0 — на месте, 1 — пень, 2 — убран (2 бита).
  exportObjects() {
    const n = this.genCount, bytes = new Uint8Array(Math.ceil(n / 4));
    for (let i = 0; i < n; i++) {
      const o = this.objects[i];
      const s = !o ? 2 : (o.type === 'stump' ? 1 : 0);
      bytes[i >> 2] |= s << ((i & 3) * 2);
    }
    let str = ''; for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str);
  }

  importObjects(b64) {
    const str = atob(b64);
    for (let i = 0; i < this.genCount; i++) {
      const s = (str.charCodeAt(i >> 2) >> ((i & 3) * 2)) & 3;
      const o = this.objects[i];
      if (!o) continue;
      if (s === 2) this.remove(o);
      else if (s === 1) { o.was = o.type; o.type = 'stump'; o.hp = OBJECTS.stump.hp; }
    }
    this.version++;
  }

  // Границы участка в мировых координатах
  chunkBounds(c) {
    const cx = c % CHUNKS, cy = (c / CHUNKS) | 0;
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = x0 + CHUNK, y1 = y0 + CHUNK;
    return { minX: (x0 - y1) * 32, maxX: (x1 - y0) * 32, minY: (x0 + y0) * 16, maxY: (x1 + y1) * 16 };
  }

  unlockedCount() { let n = 0; for (const u of this.unlocked) n += u; return n; }

  canUnlock(c) {
    if (this.unlocked[c]) return false;
    const cx = c % CHUNKS, cy = (c / CHUNKS) | 0;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    return nb.some(([dx, dy]) => {
      const x = cx + dx, y = cy + dy;
      return x >= 0 && y >= 0 && x < CHUNKS && y < CHUNKS && this.unlocked[y * CHUNKS + x];
    });
  }
}
