// Правила прудов: чистые функции над миром и состоянием st (без звуков, DOM и Date.now),
// чтобы их же потом мог выполнять сервер. Эффекты (брызги, звук, надписи) делают Mover и Farm.
//
// Пруд — объект мира вида из PONDS (data.js): одна картинка на весь пруд, клетки — его форма
// (World.objCells, вода — World.isWater). Пруды стартовой карты — объекты карты.
// Украшения пруда (камыш, рогоз, камни — POND_DECOR) — o.decor = [[что, dx, dy], ...]: на клетках воды,
// по одному на клетку, переезжают с прудом. Ставятся из рюкзака (предмет pond_<что>) только на воду.
// В сохранении: st.ponds = [[вид, gx, gy, украшения?], ...] — все пруды фермы, если игрок хоть раз трогал
// пруды или украшения (переставил, убрал в рюкзак, поставил купленное); пока не трогал — как на карте.

import { PONDS, OBJECTS, POND_DECOR, ITEMS, STORAGE, pondDecorId } from './data.js';
import * as Inv from './inventory.js';
import { objCells, cleanPondDecor, N, T } from './World.js';

export const isPond = (o) => !!o && !!PONDS[o.type];
export const isPondItem = (id) => !!PONDS[id];
export const isDecorItem = (id) => !!ITEMS[id] && ITEMS[id].place === 'pondDecor';

// Все пруды мира → st.ponds
export function savePonds(st, w) {
  st.ponds = w.objects.filter(isPond).map((o) => o.decor && o.decor.length ? [o.type, o.gx, o.gy, o.decor.map((d) => d.slice())] : [o.type, o.gx, o.gy]);
}

// Украшения пруда — предметами в рюкзак: все или ничего (склад предмета полон — null). → [{ id, n }]
function decorToBag(st, o) {
  const need = {};
  for (const [t] of o.decor || []) need[pondDecorId(t)] = (need[pondDecorId(t)] || 0) + 1;
  for (const [id, n] of Object.entries(need)) if (Inv.count(st, id) + n > STORAGE) return null;
  for (const [id, n] of Object.entries(need)) Inv.addItem(st, id, n);
  return Object.entries(need).map(([id, n]) => ({ id, n }));
}

// st.ponds → мир (при загрузке): пруды карты убираются, ставятся пруды игрока (и пруды карты на ещё
// закрытых участках — они тоже в списке). Место занято (карту поменяли: там дом, дерево, грядка) —
// пруд возвращается в рюкзак. → сколько вернулось
export function restorePonds(st, w) {
  if (!Array.isArray(st.ponds)) return 0;
  for (const o of w.objects) if (isPond(o)) w.remove(o);
  let back = 0;
  for (const p of st.ponds) {
    const [k, x, y, decor] = Array.isArray(p) ? p : [];
    if (!PONDS[k]) continue;
    const [ok, bad] = cleanPondDecor(k, decor);
    const o = canPlace(w, k, x, y, null, true).ok && w.add(k, x, y);
    if (o) o.decor = ok;
    else { back += Inv.addItem(st, k, 1); bad.push(...ok); }
    for (const [t] of bad) back += Inv.addItem(st, pondDecorId(t), 1);
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

// Пруд — в рюкзак, его украшения — тоже. → [{ id, n }] — что легло в рюкзак, или null (рюкзак полон)
export function storePond(st, w, o) {
  if (!isPond(o) || w.objects[o.id] !== o || Inv.count(st, o.type) >= STORAGE) return null;
  const items = decorToBag(st, o);
  if (!items) return null;
  Inv.addItem(st, o.type, 1);
  o.decor = [];
  w.remove(o);
  savePonds(st, w);
  w.genDecor();
  return [{ id: o.type, n: 1 }, ...items];
}

// Переставить пруд (левый верхний угол → (gx, gy)). → true / false
export function movePond(st, w, o, gx, gy) {
  if (!isPond(o) || w.objects[o.id] !== o || !canPlace(w, o.type, gx, gy, o).ok) return false;
  w.moveObject(o, gx, gy);
  savePonds(st, w);
  w.genDecor();
  return true;
}

// ---------- украшения ----------
// Номер украшения пруда o на его клетке (dx, dy) в o.decor или -1
export function decorIndex(o, dx, dy) {
  return o && o.decor ? o.decor.findIndex((d) => d[1] === dx && d[2] === dy) : -1;
}

// Можно ли поставить украшение на клетку (x, y): вода пруда на открытом участке, на ней ещё нет украшения
// (кроме переносимого: from = { o, dx, dy }). → { ok, o, dx, dy } или { ok: false, why: 'water' | 'locked' | 'busy' | 'same' }
export function canDecor(w, x, y, from) {
  const o = w.pondAt(x, y);
  if (!o || !w.isWater(x, y)) return { ok: false, why: 'water' };
  if (!w.isOpen(x, y)) return { ok: false, why: 'locked' };
  const dx = x - o.gx, dy = y - o.gy;
  if (from && from.o === o && from.dx === dx && from.dy === dy) return { ok: false, why: 'same' };
  if (decorIndex(o, dx, dy) >= 0) return { ok: false, why: 'busy' };
  return { ok: true, o, dx, dy };
}

// Поставить украшение из рюкзака (id — предмет pond_<что>) на клетку воды (x, y). → пруд или null
export function placeDecor(st, w, id, x, y) {
  const it = ITEMS[id], c = canDecor(w, x, y);
  if (!isDecorItem(id) || !POND_DECOR[it.decorOf] || !c.ok || !Inv.takeItem(st, id, 1)) return null;
  c.o.decor.push([it.decorOf, c.dx, c.dy]);
  savePonds(st, w);
  w.genDecor();
  return c.o;
}

// Украшение пруда o с клетки (dx, dy) — в рюкзак. → id предмета или null (нет такого, рюкзак полон)
export function storeDecor(st, w, o, dx, dy) {
  const i = decorIndex(o, dx, dy);
  if (!isPond(o) || w.objects[o.id] !== o || i < 0) return null;
  const id = pondDecorId(o.decor[i][0]);
  if (!Inv.addItem(st, id, 1)) return null;
  o.decor.splice(i, 1);
  savePonds(st, w);
  w.genDecor();
  return id;
}

// Перенести украшение пруда o с клетки (dx, dy) на клетку воды (x, y) — этого или другого пруда. → true / false
export function moveDecor(st, w, o, dx, dy, x, y) {
  const i = decorIndex(o, dx, dy), c = canDecor(w, x, y, { o, dx, dy });
  if (!isPond(o) || w.objects[o.id] !== o || i < 0 || !c.ok) return false;
  const [t] = o.decor.splice(i, 1)[0];
  c.o.decor.push([t, c.dx, c.dy]);
  savePonds(st, w);
  w.genDecor();
  return true;
}

// Клетка воды пруда o, у которой можно встать (рядом есть проходимая клетка), ближе всего к (tx, ty):
// нажали на середину большого пруда — призрак идёт к ближнему берегу. null — подойти некуда.
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
