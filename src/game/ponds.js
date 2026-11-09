// Правила прудов: чистые функции над миром и состоянием st (без звуков, DOM и Date.now),
// чтобы их же потом мог выполнять сервер. Эффекты (брызги, звук, надписи) делают Mover и Farm.
//
// Пруд — объект мира вида из PONDS (data.js): одна картинка на весь пруд, клетки — его форма
// (World.objCells, вода — World.isWater). Пруды стартовой карты — объекты карты.
// В сохранении: st.ponds = [[вид, gx, gy], ...] — все пруды фермы, если игрок их хоть раз трогал
// (переставил, убрал в рюкзак, поставил купленный); пока не трогал — пруды как на карте.

import { PONDS, OBJECTS } from './data.js';
import * as Inv from './inventory.js';
import { objCells, N, T } from './World.js';

export const isPond = (o) => !!o && !!PONDS[o.type];
export const isPondItem = (id) => !!PONDS[id];

// Все пруды мира → st.ponds
export function savePonds(st, w) {
  st.ponds = w.objects.filter(isPond).map((o) => [o.type, o.gx, o.gy]);
}

// st.ponds → мир (при загрузке): пруды карты убираются, ставятся пруды игрока (и пруды карты на ещё
// закрытых участках — они тоже в списке). Место занято (карту поменяли: там дом, дерево, грядка) —
// пруд возвращается в рюкзак. → сколько вернулось
export function restorePonds(st, w) {
  if (!Array.isArray(st.ponds)) return 0;
  for (const o of w.objects) if (isPond(o)) w.remove(o);
  let back = 0;
  for (const p of st.ponds) {
    const [k, x, y] = Array.isArray(p) ? p : [];
    if (!PONDS[k]) continue;
    if (!(canPlace(w, k, x, y, null, true).ok && w.add(k, x, y))) back += Inv.addItem(st, k, 1);
  }
  savePonds(st, w);
  w.genDecor();
  return back;
}

// Можно ли поставить пруд вида k так, чтобы его левый верхний угол был в (gx, gy): все клетки формы —
// свободная трава открытой земли. ignore — сам пруд, который переставляем (его клетки считаются свободными);
// closed — можно и на закрытом участке (загрузка: пруды карты там, где игрок ещё не открыл).
// → { ok } или { ok: false, why, x, y } (why: 'edge' | 'locked' | 'tile' | 'busy', клетка, которая мешает)
export function canPlace(w, k, gx, gy, ignore, closed) {
  for (const [dx, dy] of objCells(OBJECTS[k])) {
    const x = gx + dx, y = gy + dy;
    if (!w.inside(x, y)) return { ok: false, why: 'edge', x, y };
    if (!closed && !w.isOpen(x, y)) return { ok: false, why: 'locked', x, y };
    const i = y * N + x, o = w.occ[i] >= 0 ? w.objects[w.occ[i]] : null;
    if (o && o === ignore) continue;
    if (w.tiles[i] !== T.GRASS) return { ok: false, why: 'tile', x, y };
    if (o) return { ok: false, why: 'busy', x, y, o };
  }
  return { ok: true };
}

// Поставить пруд из рюкзака (проверка места — canPlace). → объект пруда или null
export function placePond(st, w, k, gx, gy) {
  if (!PONDS[k] || !Inv.count(st, k) || !canPlace(w, k, gx, gy).ok) return null;
  const o = w.add(k, gx, gy);
  if (!o) return null;
  Inv.takeItem(st, k, 1);
  savePonds(st, w);
  w.genDecor();
  return o;
}

// Пруд — в рюкзак. → вид пруда или null (рюкзак полон)
export function storePond(st, w, o) {
  if (!isPond(o) || w.objects[o.id] !== o || !Inv.addItem(st, o.type, 1)) return null;
  w.remove(o);
  savePonds(st, w);
  w.genDecor();
  return o.type;
}

// Переставить пруд (левый верхний угол → (gx, gy)). → true / false
export function movePond(st, w, o, gx, gy) {
  if (!isPond(o) || w.objects[o.id] !== o || !canPlace(w, o.type, gx, gy, o).ok) return false;
  w.moveObject(o, gx, gy);
  savePonds(st, w);
  w.genDecor();
  return true;
}

// Клетка воды пруда o, у которой можно встать (рядом есть проходимая клетка), ближе всего к (tx, ty):
// нажали на середину большого пруда или на островок — призрак идёт к ближнему берегу. null — подойти некуда.
export function shoreCell(w, o, tx, ty) {
  let best = null, bd = Infinity;
  for (const [dx, dy] of PONDS[o.type].water) {
    const x = o.gx + dx, y = o.gy + dy;
    let near = false;
    for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) if ((i || j) && w.walkable(x + i, y + j)) { near = true; break; }
    if (!near) continue;
    const d = (x - tx) ** 2 + (y - ty) ** 2;
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

// Все клетки воды открытых прудов, у которых можно встать: [{ x, y, o }]
export function shoreCells(w) {
  const out = [];
  for (const o of w.objects) {
    if (!isPond(o)) continue;
    for (const [dx, dy] of PONDS[o.type].water) {
      const x = o.gx + dx, y = o.gy + dy;
      if (!w.isOpen(x, y)) continue;
      let near = false;
      for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) if ((i || j) && w.walkable(x + i, y + j)) { near = true; break; }
      if (near) out.push({ x, y, o });
    }
  }
  return out;
}
