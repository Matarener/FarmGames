// Правила дорожек: чистые функции над миром и состоянием st (без звуков, DOM и Date.now),
// чтобы их же потом мог выполнять сервер. Эффекты (пыль, звук, надписи) делают Mover и Farm.
//
// Клетка дорожки в мире: w.tiles[i] === T.PATH, её вид — w.pathKind[i] (номер в PATH_KEYS).
// В сохранении: st.paths = { вид: [клетка, ...] } — все дорожки, если игрок их хоть раз трогал
// (иначе дорожки — как на стартовой карте). Вид — id предмета из PATHS (data.js). По видам, а не
// парами: сохранение короче (в облаке Telegram оно ограничено).

import { PATHS, PATH_KEYS, DEFAULT_PATH } from './data.js';
import * as Inv from './inventory.js';
import { T, N } from './World.js';

const KIND = Object.fromEntries(PATH_KEYS.map((k, n) => [k, n]));

export const isPathItem = (id) => !!PATHS[id];
export function kindAt(w, i) { return w.tiles[i] === T.PATH ? PATH_KEYS[w.pathKind[i]] || DEFAULT_PATH : null; }

function set(w, i, key) { w.tiles[i] = T.PATH; w.pathKind[i] = KIND[key] || 0; }
function clear(w, i) { w.tiles[i] = T.GRASS; w.pathKind[i] = 0; }

// Все дорожки мира → st.paths
export function savePaths(st, w) {
  const out = {};
  for (let i = 0; i < w.tiles.length; i++) {
    if (w.tiles[i] !== T.PATH) continue;
    const k = PATH_KEYS[w.pathKind[i]] || DEFAULT_PATH;
    (out[k] || (out[k] = [])).push(i);
  }
  st.paths = out;
}

// st.paths → мир (при загрузке). Старые сохранения: список номеров клеток — все они «Тропинка».
// Клетка теперь не годится (карту поменяли: там вода, дом, дерево, грядка) — дорожка уходит в рюкзак.
// → сколько дорожек вернулось в рюкзак
export function restorePaths(st, w) {
  if (!st.paths) return 0;
  for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === T.PATH) clear(w, i);
  let back = 0;
  const seen = new Set();
  const list = Array.isArray(st.paths) ? st.paths.map((p) => (Array.isArray(p) ? p : [p, DEFAULT_PATH]))
    : Object.entries(st.paths).flatMap(([k, cells]) => (Array.isArray(cells) ? cells : []).map((i) => [i, k]));
  for (const [i, k] of list) {
    const key = PATHS[k] ? k : DEFAULT_PATH;
    if (!(i >= 0 && i < w.tiles.length) || seen.has(i)) continue;
    seen.add(i);
    if (w.tiles[i] === T.GRASS && w.occ[i] < 0 && w.isOpen(i % N, (i / N) | 0)) set(w, i, key);
    else back += Inv.addItem(st, key, 1);
  }
  savePaths(st, w);
  return back;
}

// Поставить дорожку из рюкзака на клетку i (проверка места — у вызывающего, Mover.check).
// Если там уже дорожка другого вида — она меняется на новую, а старая уходит в рюкзак.
// → { put, back } (back — id вернувшейся в рюкзак дорожки) или null
export function placePath(st, w, id, i) {
  if (!PATHS[id] || !Inv.count(st, id)) return null;
  const was = kindAt(w, i);
  if (was === id) return null;
  if (!was && (w.tiles[i] !== T.GRASS || w.occ[i] >= 0)) return null;
  Inv.takeItem(st, id, 1);
  if (was) Inv.addItem(st, was, 1);
  set(w, i, id);
  savePaths(st, w);
  return { put: id, back: was };
}

// Клетку дорожки i — в рюкзак. → id дорожки или null
export function storePath(st, w, i) {
  const k = kindAt(w, i);
  if (!k || !Inv.addItem(st, k, 1)) return null;
  clear(w, i);
  savePaths(st, w);
  return k;
}

// Перенести дорожку с клетки from на клетку to (вид сохраняется). → id или null
export function movePath(st, w, from, to) {
  const k = kindAt(w, from);
  if (!k || w.tiles[to] !== T.GRASS || w.occ[to] >= 0) return null;
  clear(w, from);
  set(w, to, k);
  savePaths(st, w);
  return k;
}

// ---------- травяной край (картинки — tools/path_tiles.py, склейка — Farm.pathEdge) ----------
// Стороны ромба клетки и соседи за ними; вершины ромба: две стороны и сосед по диагонали
const SIDES = [['nw', -1, 0], ['ne', 0, -1], ['se', 1, 0], ['sw', 0, 1]];
const VERTS = [['n', 'nw', 'ne', -1, -1], ['e', 'ne', 'se', 1, -1], ['s', 'se', 'sw', 1, 1], ['w', 'sw', 'nw', -1, 1]];
const SIDE_N = { nw: 0, ne: 1, se: 2, sw: 3 };

// Клетка — «твёрдая» дорожка (не трава и не «камни в траве»)
export function solidPath(w, x, y) {
  if (!w.inside(x, y)) return false;
  const i = y * N + x;
  if (w.tiles[i] !== T.PATH) return false;
  const p = PATHS[PATH_KEYS[w.pathKind[i]]];
  return !(p && p.grassy);
}

// Вид окружения клетки дорожки (x, y) для травяного края: биты 0–3 — трава за сторонами nw, ne, se, sw,
// биты 4–7 — трава только по диагонали у вершин n, e, s, w (обе стороны у вершины — дорожки).
// 0 — травы рядом нет (или клетка — не «твёрдая» дорожка).
export function edgeKey(w, x, y) {
  if (!solidPath(w, x, y)) return 0;
  let key = 0;
  SIDES.forEach(([, dx, dy], n) => { if (!solidPath(w, x + dx, y + dy)) key |= 1 << n; });
  VERTS.forEach(([, a, b, dx, dy], n) => {
    const ga = key & (1 << SIDE_N[a]), gb = key & (1 << SIDE_N[b]);
    if (!ga && !gb && !solidPath(w, x + dx, y + dy)) key |= 16 << n;
  });
  return key;
}

// Куски края для вида окружения key: со стороны травы — полоса вдоль стороны; в каждом углу — трава
// с одной стороны, с другой, с обеих (скруглённый угол) или только по диагонали (внутренний угол)
export function edgeParts(key) {
  const parts = [];
  const g = (s) => key & (1 << SIDE_N[s]);
  for (const [s] of SIDES) if (g(s)) parts.push('edge_' + s);
  VERTS.forEach(([v, a, b], n) => {
    const t = g(a) && g(b) ? 'out' : g(a) ? a : g(b) ? b : key & (16 << n) ? 'in' : null;
    if (t) parts.push(`corner_${v}_${t}`);
  });
  return parts;
}
