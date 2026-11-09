// Правила поливалок: чистые функции над миром (без звуков, DOM и Date.now), чтобы их же потом мог
// выполнять сервер. Поливалка — своя постройка (placed.js), её вид и клетки полива — в SPRINKLERS (data.js).
// Сам полив — в правилах грядок (beds.js growBed): грядка, которую поливает хоть одна поливалка,
// поливается сама, как только попросит воды, и за время отсутствия тоже.

import { SPRINKLERS, OBJECTS } from './data.js';
import { N } from './World.js';

// Вид поливалки у объекта (null — не поливалка)
export function kindOf(o) { const d = o && OBJECTS[o.type]; return (d && d.sprinkler) || null; }

// Клетки вокруг (x, y), которые поливает поливалка вида kind: [[x, y], ...]. Клетки за краем карты
// тоже в списке — их отбрасывает вызывающий (w.inside).
export function areaCells(kind, x, y) {
  const s = SPRINKLERS[kind], out = [];
  if (!s) return out;
  for (let dy = -s.r; dy <= s.r; dy++) for (let dx = -s.r; dx <= s.r; dx++) {
    if (!dx && !dy) continue;
    if (s.area === 'cross' && dx && dy) continue;
    out.push([x + dx, y + dy]);
  }
  return out;
}

// Сколько клеток поливает вид (для описаний)
export function areaSize(kind) { return areaCells(kind, 0, 0).length; }

// Где поливают поливалки мира: массив N×N, у клетки — сколько поливалок её поливают (0 — ни одна).
// out — массив для повторного использования (считается заново, когда меняются объекты мира).
export function coverMap(w, out) {
  const m = out && out.length === N * N ? out : new Uint8Array(N * N);
  m.fill(0);
  for (const o of w.objects) {
    const k = kindOf(o);
    if (!k) continue;
    for (const [x, y] of areaCells(k, o.gx, o.gy)) if (w.inside(x, y) && m[y * N + x] < 255) m[y * N + x]++;
  }
  return m;
}

// Поливалки, которые поливают клетку (x, y) (откуда лететь брызгам)
export function sprinklersAt(w, x, y) {
  const out = [];
  for (const o of w.objects) {
    const k = kindOf(o);
    if (!k) continue;
    const s = SPRINKLERS[k], dx = Math.abs(x - o.gx), dy = Math.abs(y - o.gy);
    if ((dx || dy) && dx <= s.r && dy <= s.r && (s.area !== 'cross' || !dx || !dy)) out.push(o);
  }
  return out;
}
