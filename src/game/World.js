// Мир фермы: сетка тайлов, объекты, участки (чанки) территории.
// Мир берётся со стартовой карты (assets/map.json) или генерируется детерминированно из seed;
// в сохранение пишется только разница.

import { mulberry32, hash2 } from '../engine/Sprite.js';
import { OBJECTS, FLORA, FLORA_GROUPS, floraByGroup, FOG, PATH_KEYS, PONDS } from './data.js';
import { toWorld } from '../engine/Iso.js';

export const CHUNK = 10;
export const CHUNKS = 5;
export const N = CHUNK * CHUNKS;
export const START_CHUNK = 2 * CHUNKS + 2; // центральный участок
export const T = { GRASS: 0, SOIL: 1, WATER: 2, PATH: 3 };
// Полоса тумана вокруг карты: её никогда не открыть, под туманом — лес (только картинка, не объекты)
export const FOG_W = FOG.width;
export const FOG_TREES = Object.keys(FLORA); // любые деревья и кусты (виды)
const FOG_OLD = { oak2: 'sakura', bush: 'rosehip', berry: 'blueberry' }; // старые имена групп

const tmp = { x: 0, y: 0 };

// Клетки, которые занимает объект с описанием def (OBJECTS): [[dx, dy], ...] от левого верхнего угла.
// Без def.cells — весь прямоугольник w × h; def.cells — фигура (например, пруд без углов).
const RECTS = new Map();
export function objCells(def) {
  if (def && def.cells) return def.cells;
  const w = (def && def.w) || 1, h = (def && def.h) || 1, k = w * 64 + h;
  let r = RECTS.get(k);
  if (!r) { r = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) r.push([x, y]); RECTS.set(k, r); }
  return r;
}

// Короткий отпечаток карты: сохранение помнит, на какой карте оно сделано
export function mapId(m) {
  const s = JSON.stringify([m.tiles, m.objects, m.well, m.seed || 0]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Текст файла карты: по строке на ряд клеток и на объект — удобно смотреть изменения в git
export function mapText(m) {
  return '{\n  "v": 2,\n  "n": ' + m.n + ',\n  "seed": ' + (m.seed >>> 0) + ',\n  "tiles": [\n' + m.tiles.map((r) => '    "' + r + '"').join(',\n') + '\n  ],\n' +
    '  "objects": [\n' + m.objects.map((o) => '    ' + JSON.stringify(o)).join(',\n') + '\n  ],\n' +
    (m.ponds ? '  "ponds": [\n' + m.ponds.map((o) => '    ' + JSON.stringify(o)).join(',\n') + '\n  ],\n' : '') +
    '  "well": ' + JSON.stringify(m.well) + ',\n  "player": ' + JSON.stringify(m.player) +
    (m.fog ? ',\n  "fog": [\n' + m.fog.map((o) => '    ' + JSON.stringify(o)).join(',\n') + '\n  ]' : '') + '\n}\n';
}

export class World {
  // map — карта из редактора (assets/map.json); без неё мир генерируется из seed
  constructor(seed, map) {
    this.seed = seed >>> 0;
    this.tiles = new Uint8Array(N * N);
    this.pathKind = new Uint8Array(N * N); // вид дорожки на клетке T.PATH: номер в PATH_KEYS (paths.js)
    this.variant = new Uint8Array(N * N);
    this.occ = new Int32Array(N * N).fill(-1);
    this.objects = [];   // индекс = id, удалённые → null
    this.unlocked = new Uint8Array(CHUNKS * CHUNKS);
    this.unlocked[START_CHUNK] = 1;
    this.version = 0;    // растёт при изменении объектов (для пересортировки)
    this.fogTrees = [];  // лес под туманом: { type, gx, gy, d, id }
    this.fogV = 0;       // растёт при правке леса в тумане (редактор)
    if (map) this.loadMap(map); else this.generate();
  }

  // ---------- Карта из редактора ----------
  // Формат: { v: 1, n: 50, tiles: [50 строк по 50 цифр T], objects: [[тип, x, y], ...], ponds: [[вид, x, y], ...],
  //          well: [x, y], player: [x, y] }
  // Дорожки: цифра 3 — дорожка по умолчанию (PATH_KEYS[0]), 4, 5, … — следующие виды из PATHS (data.js).
  // Грядки — клетки T.SOIL (стартовые), колодец — отдельно (он всегда после genCount, как в генерации).
  // Пруды — объекты (PONDS); их вода в tiles тоже записана цифрой 2 (так у карты прежний отпечаток mapId).
  // В старых картах прудов нет, только цифры 2 — из них пруды собираются по формам (pondsFromWater).
  loadMap(m) {
    this.mapId = mapId(m);
    if (m.seed) this.seed = m.seed >>> 0; // у карты свой seed: трава и декор прудов у всех одинаковые
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const h = hash2(x + this.seed % 1000, y);
      this.variant[y * N + x] = h < 0.55 ? 0 : h < 0.8 ? 1 : h < 0.9 ? 3 : 2;
    }
    const rows = m.tiles || [];
    this.startBeds = [];
    for (let y = 0; y < N; y++) {
      const r = rows[y] || '';
      for (let x = 0; x < N; x++) {
        const t = +r[x] || 0, i = y * N + x;
        if (t >= T.PATH && t < T.PATH + PATH_KEYS.length) { this.tiles[i] = T.PATH; this.pathKind[i] = t - T.PATH; }
        else this.tiles[i] = t < T.PATH ? t : 0;
        if (t === T.SOIL) this.startBeds.push(i);
      }
    }
    const v1 = !(m.v >= 2);
    // карта v1 знает только группы деревьев и кустов: вид — по номеру объекта, как раньше картинка
    for (const [type, x, y] of m.objects || []) if ((OBJECTS[type] || FLORA_GROUPS[type]) && type !== 'well' && !PONDS[type]) this.add(v1 ? this.species(type) : type, x, y);
    if (Array.isArray(m.ponds)) {
      for (let i = 0; i < N * N; i++) if (this.tiles[i] === T.WATER) this.tiles[i] = T.GRASS;
      for (const [type, x, y] of m.ponds) if (PONDS[type]) this.add(type, x, y);
    } else this.pondsFromWater();
    this.genCount = this.objects.length;
    this.wellPos = m.well || [2 * CHUNK + 5, 2 * CHUNK + 4];
    this.well = this.add('well', this.wellPos[0], this.wellPos[1]);
    this.playerStart = m.player || [2 * CHUNK + 4, 2 * CHUNK + 6];
    this.genDecor();
    if (Array.isArray(m.fog)) { this.fogTrees = []; for (const [type, x, y] of m.fog) this.addFogTree(type, x, y); } else this.genFog();
  }

  // Текущий мир → карта для редактора (пни сохраняются как то дерево, из которого выросли)
  toMap() {
    const tiles = [];
    for (let y = 0; y < N; y++) {
      let r = '';
      for (let x = 0; x < N; x++) { const i = y * N + x, t = this.tiles[i]; r += this.isWater(x, y) ? T.WATER : t === T.PATH ? T.PATH + this.pathKind[i] : t; }
      tiles.push(r);
    }
    const objects = [], ponds = [];
    let well = null;
    for (const o of this.objects) {
      if (!o) continue;
      if (o === this.well || o.type === 'well') { well = [o.gx, o.gy]; continue; }
      if (PONDS[o.type]) { ponds.push([o.type, o.gx, o.gy]); continue; }
      if (o.own || o.wild || o.type === 'sapling' || o.type === 'grass') continue; // посаженное игроком — не часть карты
      objects.push([o.type === 'stump' ? (o.was || 'oak') : o.type, o.gx, o.gy]);
    }
    const fog = this.fogTrees.map((t) => [t.type, t.gx, t.gy]);
    return { v: 2, n: N, seed: this.seed, tiles, objects, ponds, well, player: this.playerStart.slice(), fog };
  }

  // группа деревьев/кустов (oak, oak2, bush, berry) → вид для следующего объекта
  species(type) { return floraByGroup(type, this.objects.length); }

  idx(x, y) { return y * N + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }
  chunkOf(x, y) { return ((y / CHUNK) | 0) * CHUNKS + ((x / CHUNK) | 0); }
  isOpen(x, y) { return this.inside(x, y) && this.unlocked[this.chunkOf(x, y)] === 1; }
  tile(x, y) { return this.tiles[y * N + x]; }
  objectAt(x, y) { if (!this.inside(x, y)) return null; const i = this.occ[y * N + x]; return i >= 0 ? this.objects[i] : null; }
  // пруд на клетке (вода или островок) или null
  pondAt(x, y) { const o = this.objectAt(x, y); return o && PONDS[o.type] ? o : null; }
  // вода пруда на клетке: здесь рыбачат и набирают воду (островок — не вода)
  isWater(x, y) { const o = this.pondAt(x, y); return !!o && PONDS[o.type].cells[y - o.gy][x - o.gx] === 'w'; }

  walkable(x, y) {
    if (!this.isOpen(x, y)) return false;
    const i = y * N + x;
    return this.tiles[i] !== T.WATER && this.occ[i] < 0;
  }

  add(type, gx, gy) {
    const def = OBJECTS[type];
    const w = def.w || 1, h = def.h || 1, cells = objCells(def);
    for (const [dx, dy] of cells) {
      const x = gx + dx, y = gy + dy;
      if (!this.inside(x, y) || this.occ[y * N + x] >= 0 || this.tiles[y * N + x] !== T.GRASS) return null;
    }
    const o = { id: this.objects.length, type, gx, gy, w, h, hp: def.hp || 0, state: 0, shake: 0 };
    toWorld(gx + w / 2, gy + h / 2, tmp);
    o.wx = tmp.x; o.wy = tmp.y;
    o.depth = gx + w / 2 + gy + h / 2;
    this.objects.push(o);
    for (const [dx, dy] of cells) this.occ[(gy + dy) * N + gx + dx] = o.id;
    return o;
  }

  remove(o) {
    this.lift(o);
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
    for (const [t, lx, ly] of fixed) { const [x, y] = L(lx, ly); if (!reserved.has(y * N + x)) { this.add(this.species(t), x, y); res(x, y); } }

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
        else if (r < 0.6) this.add(this.species(r < 0.5 ? 'bush' : 'berry'), x, y);
      } else if (edge) {
        if (r < 0.5) this.add(this.species(rnd() < 0.7 ? (rnd() < 0.5 ? 'oak' : 'oak2') : 'pine'), x, y);
        else if (r < 0.68) this.add('rock', x, y);
        else if (r < 0.76) this.add(this.species('bush'), x, y);
      } else if (r < 0.06) this.add(this.species('bush'), x, y);
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
        if (r < forest) this.add(this.species(k < 0.4 ? 'oak' : k < 0.7 ? 'oak2' : k < 0.92 ? 'pine' : 'apple'), x, y);
        else if (r < forest + 0.08) this.add('rock', x, y);
        else if (r < forest + 0.13) this.add(this.species(k < 0.7 ? 'bush' : 'berry'), x, y);
      }
    }
    // Добавочные камни (баланс: камня не хватало на расширения). Отдельный поток случайных
    // чисел и в конце списка — номера старых объектов не сдвигаются, сохранения совместимы.
    const rnd2 = mulberry32(this.seed ^ 0x5bd1e995);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = rnd2();
      if (this.chunkOf(x, y) !== START_CHUNK && r < 0.055) this.add('rock', x, y);
    }
    this.pondsFromWater();
    this.genCount = this.objects.length;
    // Колодец бабушки — после счётчика: он не сохраняется в разнице и всегда на месте
    this.wellPos = L(5, 4); // у тропинки к дому, на виду
    this.well = this.add('well', this.wellPos[0], this.wellPos[1]);
    this.genDecor();
    this.genFog();
  }

  // ---------- Туман ----------
  // Сколько клеток клетка за краем карты (0 — на карте)
  fogDepth(x, y) { return Math.max(-x, -y, x - N + 1, y - N + 1, 0); }
  // Лес под туманом — только с дальних сторон (сверху-слева и сверху-справа на экране):
  // с ближних сторон кроны деревьев закрывали бы край карты.
  fogBack(x, y) { return x < 0 || y < 0; }

  addFogTree(type, x, y) {
    type = FOG_OLD[type] || type;
    const d = this.fogDepth(x, y);
    if (!FOG_TREES.includes(type) || d < 1 || d > FOG_W || !this.fogBack(x, y)) return null;
    if (this.fogTrees.some((t) => t.gx === x && t.gy === y)) return null;
    const t = { type, gx: x, gy: y, d, id: (hash2(x * 31 + 7, y * 17 + 3) * 1e6) | 0 };
    this.fogTrees.push(t);
    this.fogV = (this.fogV || 0) + 1;
    return t;
  }

  removeFogTree(x, y) {
    const i = this.fogTrees.findIndex((t) => t.gx === x && t.gy === y);
    if (i < 0) return false;
    this.fogTrees.splice(i, 1); this.fogV = (this.fogV || 0) + 1;
    return true;
  }

  // Лес под туманом по seed карты: у края гуще, дальше реже
  genFog() {
    const rnd = mulberry32(this.seed ^ 0x2c1b3c6d), F = FOG_W;
    this.fogTrees = [];
    for (let y = -F; y < N + F; y++) for (let x = -F; x < N + F; x++) {
      const d = this.fogDepth(x, y);
      if (d < 1 || !this.fogBack(x, y)) continue;
      const r = rnd(), k = rnd();
      if (r < (FOG.forest[d - 1] || 0)) this.addFogTree(k < 0.2 ? 'oak' : k < 0.3 ? 'birch' : k < 0.4 ? 'sakura' : k < 0.48 ? 'linden' : k < 0.56 ? 'maple' : k < 0.86 ? 'pine' : k < 0.92 ? 'linden' : 'lavender', x, y);
    }
  }

  // ---------- Пруды ----------
  // Старые карты и генерация: клетки воды (T.WATER) → пруды PONDS. Связный кусок воды становится
  // прудом той формы, чья вода совпадает с ним клетка в клетку (пруды стартовой карты — ровно такие).
  // Иначе в кусок по очереди ставятся самые большие формы, которые в нём помещаются; вода, на которую
  // формы не хватило, становится травой.
  pondsFromWater() {
    const W = T.WATER, D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const comps = [], seen = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      if (this.tiles[i] !== W || seen[i]) continue;
      const comp = [], st = [i]; seen[i] = 1;
      while (st.length) {
        const j = st.pop(); comp.push(j);
        const x = j % N, y = (j / N) | 0;
        for (const [dx, dy] of D4) {
          const nx = x + dx, ny = y + dy, k = ny * N + nx;
          if (this.inside(nx, ny) && this.tiles[k] === W && !seen[k]) { seen[k] = 1; st.push(k); }
        }
      }
      comps.push(comp);
    }
    for (const comp of comps) for (const j of comp) this.tiles[j] = T.GRASS;
    // форма p встанет в (gx, gy): вся её вода — в left, островок — на свободной траве вне куска
    const fits = (p, gx, gy, left, comp) => p.occ.every(([dx, dy]) => {
      const x = gx + dx, y = gy + dy, i = y * N + x;
      if (!this.inside(x, y)) return false;
      return p.cells[dy][dx] === 'w' ? left.has(i) : !comp.has(i) && this.tiles[i] === T.GRASS && this.occ[i] < 0;
    });
    const kinds = Object.values(PONDS).sort((a, b) => b.water.length - a.water.length);
    for (const list of comps) {
      const comp = new Set(list), left = new Set(list);
      for (;;) {
        let best = null;
        for (const p of kinds) {
          if (p.water.length > left.size || (best && best.p.water.length > p.water.length)) continue;
          for (const i of left) {
            const [dx, dy] = p.water[0], gx = i % N - dx, gy = ((i / N) | 0) - dy;
            if (fits(p, gx, gy, left, comp)) { best = { p, gx, gy }; break; }
          }
          if (best && best.p.water.length === left.size) break; // точное совпадение
        }
        if (!best) break;
        const o = this.add(best.p.key, best.gx, best.gy);
        if (!o) break;
        for (const [dx, dy] of best.p.water) left.delete((best.gy + dy) * N + best.gx + dx);
      }
    }
  }

  // Камыш, рогоз и камни у берега прудов: не объекты (их нельзя рубить и двигать), стоят по таблице
  // своего пруда (PONDS.decor) и переезжают вместе с ним. decorV растёт, когда список поменялся.
  genDecor() {
    this.decor = [];
    for (const o of this.objects) {
      const p = o && PONDS[o.type];
      if (!p) continue;
      for (const [type, x, y] of p.decor || []) {
        const cx = Math.min(N - 1, o.gx + Math.floor(x)), cy = Math.min(N - 1, o.gy + Math.floor(y));
        this.decor.push({ type, gx: cx, gy: cy, x: o.gx + x, y: o.gy + y });
      }
    }
    this.decorV = (this.decorV || 0) + 1;
  }

  // Снять объект с карты (клетки свободны) и поставить обратно — для загрузки сохранения
  lift(o) {
    for (const [dx, dy] of objCells(OBJECTS[o.type])) {
      const i = (o.gy + dy) * N + o.gx + dx;
      if (this.occ[i] === o.id) this.occ[i] = -1;
    }
  }

  put(o, gx, gy) { this.moveObject(o, gx, gy); }

  // Перенос своей постройки (дом, колодец) на другие клетки; проверки — в Mover
  moveObject(o, gx, gy) {
    this.lift(o);
    o.gx = gx; o.gy = gy;
    toWorld(gx + o.w / 2, gy + o.h / 2, tmp);
    o.wx = tmp.x; o.wy = tmp.y;
    o.depth = gx + o.w / 2 + gy + o.h / 2;
    for (const [dx, dy] of objCells(OBJECTS[o.type])) this.occ[(gy + dy) * N + gx + dx] = o.id;
    this.version++;
  }

  // Можно ли поставить объект сюда при загрузке (вся площадь — свободная трава открытой земли)
  freeFor(o, gx, gy) {
    for (const [dx, dy] of objCells(OBJECTS[o.type])) {
      const x = gx + dx, y = gy + dy;
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
