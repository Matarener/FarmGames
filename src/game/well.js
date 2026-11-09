// Колодец в рюкзаке: починенный колодец можно убрать в рюкзак (предмет WELL_ITEM) и поставить в другое место.
// Чистые функции над состоянием st и миром (без звуков и DOM), чтобы их же потом мог выполнять сервер.
// Колодец на карте — w.well (один на ферму), его место в сохранении — st.pos.well; пока он в рюкзаке,
// на карте его нет (Farm.init не возвращает его сам, см. inBag). Сломанный колодец не убирается:
// его сначала чинят (задание и подсказка ведут к нему).

import { WELL_ITEM } from './data.js';
import * as Inv from './inventory.js';

export const inBag = (st) => Inv.count(st, WELL_ITEM) > 0;

// Можно ли убрать колодец. → null или причина
export function storeWhy(st, w) {
  const o = w.well;
  if (!o || w.objects[o.id] !== o) return 'Колодца нет';
  if (!st.well) return 'Колодец сломан: сначала почините его';
  return null;
}

// Колодец — в рюкзак. → снятый с карты объект (gx, gy, wx, wy при нём) или null
export function storeWell(st, w) {
  if (storeWhy(st, w) || !Inv.addItem(st, WELL_ITEM, 1)) return null;
  const o = w.well;
  w.remove(o);
  w.well = null;
  if (st.pos) delete st.pos.well;
  return o;
}

// Колодец из рюкзака — на (x, y): открытая свободная трава (проход и призрачка проверяет Mover). → объект или null
export function placeWell(st, w, x, y) {
  if (w.well || !inBag(st) || !w.isOpen(x, y)) return null;
  const o = w.add('well', x, y);
  if (!o) return null;
  Inv.takeItem(st, WELL_ITEM, 1);
  w.well = o;
  w.version++; // объекты мира изменились (порядок отрисовки)
  (st.pos || (st.pos = {})).well = [x, y];
  return o;
}
