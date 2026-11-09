// Свои постройки на карте: купленные предметы, которые ставятся из рюкзака на открытую траву,
// переставляются и убираются обратно (поливалки, потом декор и здания с крафтом).
// Чистые функции над состоянием st и миром (без звуков, DOM и Date.now — время приходит в ctx),
// чтобы их же потом мог выполнять сервер. Эффекты (пыль, звук, надписи) делают Mover и Farm.
//
// Таблицы (data.js): у типа объекта OBJECTS[тип].item — какой предмет ложится в рюкзак, когда постройку
// убирают; у предмета ITEMS[id].place === 'obj' и objOf — какой объект он ставит. Один тип могут ставить
// несколько предметов (чертёж и готовое здание), убирается он всегда своим item.
// В сохранении: st.placed = [[тип, x, y, поворот?, данные?], ...] — x, y — левый верхний угол (как o.gx, o.gy),
// поворот (декор, data.js DECOR) — 1…3, у положения 0 его нет (0 пишется, только если дальше есть данные).
// Данные — своё состояние постройки (у животного — сколько раз покормили, когда доест: animalRules.js): на карте
// это тот же объект o.data, поэтому правила меняют его прямо в объекте. На карте у такого объекта o.own = 1 и o.placed = 1.
//
// Правила отдельных построек подключаются через HOOKS[тип] (registerPlaced):
//   canPlace(st, id, ctx) → причина отказа (строка) или null — перед тем как поставить из рюкзака;
//   onPlace(st, id, o, ctx) — постройка поставлена (например, оплатить и начать стройку; может завести o.data);
//   canStore(st, o, ctx) → причина или null — перед тем как убрать в рюкзак;
//   onStore(st, o, ctx) — постройка ушла в рюкзак.

import { OBJECTS, ITEMS } from './data.js';
import * as Inv from './inventory.js';
import { T, objCells, normRot } from './World.js';

export const HOOKS = {};
export function registerPlaced(type, hooks) { HOOKS[type] = { ...(HOOKS[type] || {}), ...hooks }; }

// Какой объект ставит предмет id (null — предмет не ставится объектом)
export function objOf(id) { const it = ITEMS[id]; return it && it.place === 'obj' && OBJECTS[it.objOf] ? it.objOf : null; }
// Какой предмет ложится в рюкзак, когда объект этого типа убирают
export function itemOf(type) { return (OBJECTS[type] && OBJECTS[type].item) || null; }
export function isPlaced(o) { return !!(o && o.placed); }
// Сколько положений поворота у объекта этого типа (1 — не поворачивается)
export function rotCount(type) { return (OBJECTS[type] && OBJECTS[type].rot) || 1; }

function mark(o) { o.own = 1; o.placed = 1; return o; }
const recIdx = (st, o) => (st.placed || []).findIndex((r) => r[0] === o.type && r[1] === o.gx && r[2] === o.gy);
// Запись в сохранении: [тип, x, y], с поворотом — [тип, x, y, поворот], с данными — [тип, x, y, поворот или 0, данные]
const recOf = (type, x, y, rot, data) => (data ? [type, x, y, rot || 0, data] : rot ? [type, x, y, rot] : [type, x, y]);

// Можно ли поставить предмет id на клетки с левым верхним углом (x, y) в положении поворота rot: вся площадь —
// открытая свободная трава. → null (можно) или причина. Призрачок, проход и прочее, что знает только игра, проверяет Mover.
export function placeWhy(st, w, id, x, y, ctx = {}, rot = 0) {
  const type = objOf(id);
  if (!type) return 'Это нельзя поставить';
  if (!Inv.count(st, id)) return 'В рюкзаке больше нет';
  for (const [dx, dy] of objCells(OBJECTS[type], normRot(OBJECTS[type], rot))) {
    const xx = x + dx, yy = y + dy;
    if (!w.isOpen(xx, yy)) return 'Сюда нельзя: участок ещё не открыт';
    const i = w.idx(xx, yy);
    if (w.tiles[i] !== T.GRASS || w.occ[i] >= 0) return 'Сюда нельзя: место занято';
  }
  const h = HOOKS[type];
  return (h && h.canPlace && h.canPlace(st, id, ctx)) || null;
}

// Поставить из рюкзака предмет id на (x, y) в положении поворота rot. → { o } или { why }
export function placeObj(st, w, id, x, y, ctx = {}, rot = 0) {
  const why = placeWhy(st, w, id, x, y, ctx, rot);
  if (why) return { why };
  const type = objOf(id), o = w.add(type, x, y, rot);
  if (!o) return { why: 'Сюда нельзя: место занято' };
  Inv.takeItem(st, id, 1);
  mark(o);
  w.version++; // объекты мира изменились (порядок отрисовки, клетки полива)
  const h = HOOKS[type];
  if (h && h.onPlace) h.onPlace(st, id, o, ctx);
  (st.placed || (st.placed = [])).push(recOf(type, x, y, o.rot, o.data));
  return { o };
}

// Можно ли убрать постройку в рюкзак. → null или причина
export function storeWhy(st, o, ctx = {}) {
  if (!isPlaced(o) || !itemOf(o.type)) return 'Это нельзя убрать в рюкзак';
  const h = HOOKS[o.type];
  return (h && h.canStore && h.canStore(st, o, ctx)) || null;
}

// Убрать постройку в рюкзак (с карты её снимает w.remove). → { id } или { why }
export function storeObj(st, w, o, ctx = {}) {
  const why = storeWhy(st, o, ctx);
  if (why) return { why };
  const id = itemOf(o.type);
  if (!Inv.addItem(st, id, 1)) return { why: 'Рюкзак полон' };
  const k = recIdx(st, o);
  if (k >= 0) st.placed.splice(k, 1);
  w.remove(o);
  const h = HOOKS[o.type];
  if (h && h.onStore) h.onStore(st, o, ctx);
  return { id };
}

// Постройку переставили на (x, y) (и повернули в положение rot): запись в сохранении — следом
// (сам перенос делает w.moveObject; recIdx ищет по старому месту, поэтому сначала — это)
export function moveObj(st, o, x, y, rot = o.rot) {
  const k = recIdx(st, o);
  if (k < 0) return;
  const r = normRot(OBJECTS[o.type], rot);
  st.placed[k] = recOf(o.type, x, y, r, o.data);
}

// Данные постройки (o.data) появились или сменились целиком — записать их в сохранение
export function touch(st, o) {
  const k = recIdx(st, o);
  if (k >= 0) st.placed[k] = recOf(o.type, o.gx, o.gy, o.rot, o.data);
}

// Постройка сменила тип на месте (животное подросло: цыплёнок → молодка, animalRules.js). Клетки у типов одни
// и те же (1 × 1), поворот и данные остаются. → true, если сменился
export function retype(st, w, o, type) {
  if (!OBJECTS[type] || !itemOf(type)) return false;
  const k = recIdx(st, o);
  o.type = type;
  if (k >= 0) st.placed[k] = recOf(type, o.gx, o.gy, o.rot, o.data);
  w.version++;
  return true;
}

// st.placed → объекты на карте (при загрузке). Место занято или закрыто (карту поменяли, тип убрали из
// таблиц) — постройка возвращается в рюкзак своим предметом. → сколько вернулось в рюкзак
export function restorePlaced(st, w) {
  if (!Array.isArray(st.placed)) { delete st.placed; return 0; }
  let back = 0;
  const keep = [];
  for (const r of st.placed) {
    if (!Array.isArray(r)) continue;
    const [type, x, y] = r;
    if (!OBJECTS[type] || !itemOf(type)) continue;
    const rot = normRot(OBJECTS[type], r[3]);
    const free = objCells(OBJECTS[type], rot).every(([dx, dy]) => {
      const xx = x + dx, yy = y + dy;
      return w.isOpen(xx, yy) && w.tiles[w.idx(xx, yy)] === T.GRASS && w.occ[w.idx(xx, yy)] < 0;
    });
    const o = free && w.add(type, x, y, rot);
    const data = r[4] && typeof r[4] === 'object' ? r[4] : null;
    if (o) {
      mark(o);
      if (data) o.data = data;
      keep.push(recOf(type, x, y, rot, data));
    } else {
      back += Inv.addItem(st, itemOf(type), 1);
      const h = HOOKS[type]; // постройка ушла в рюкзак — её данные тоже (животное помнит, сколько его кормили)
      if (data && h && h.onStore) h.onStore(st, { type, gx: x, gy: y, data }, {});
    }
  }
  st.placed = keep;
  if (keep.length) w.version++;
  return back;
}
