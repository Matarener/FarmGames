// Рубка и добыча по ударам. У дерева, куста, пня, ростка, камня есть прочность — сколько ударов нужно
// (OBJECTS[type].hp, числа — в data.js). Одно нажатие игрока — один удар призрачка; нажали ещё раз,
// пока он идёт или рубит, — ещё удар по тому же объекту (в очереди это одно дело с a.n ударами).
// Чистые функции над состоянием st: звуков, частиц и кольца здесь нет — их делает Farm.
//
// st.hits = { "x,y": [тип объекта, сколько ударов уже сделано] } — начатая рубка сохраняется.
// Тип записан, чтобы отметка не досталась другому объекту на той же клетке (дерево стало пнём,
// растение переставили, на месте срубленного выросло новое).

import { OBJECTS } from './data.js';

const cell = (o) => o.gx + ',' + o.gy;

// Действие с ударами: рубка (топор) и добыча камня (кирка). Трава срывается за раз — не сюда.
export const isHit = (a) => !!a && !!a.obj && (a.kind === 'chop' || a.kind === 'mine');

// Прочность объекта: сколько ударов всего
export function durability(o) {
  const d = OBJECTS[o.type];
  return Math.max(1, (d && d.hp) || 1);
}

// Сколько ударов по объекту уже сделано (меньше прочности: последний удар объект убирает)
export function hitsDone(st, o) {
  const e = st.hits && st.hits[cell(o)];
  return e && e[0] === o.type ? Math.max(0, Math.min(e[1], durability(o) - 1)) : 0;
}

// Сколько ударов осталось до конца
export function hitsLeft(st, o) { return durability(o) - hitsDone(st, o); }

// Один удар. → { total — прочность, done — сколько ударов сделано с этим, last — объект срублен
// (добычу и пень делает Farm.destroy) }
export function hit(st, o) {
  const total = durability(o), done = hitsDone(st, o) + 1, k = cell(o);
  if (done >= total) { forget(st, o); return { total, done: total, last: true }; }
  (st.hits || (st.hits = {}))[k] = [o.type, done];
  return { total, done, last: false };
}

// Объект ушёл с клетки (срубили, убрали в рюкзак): забыть его удары
export function forget(st, o) {
  if (!st.hits) return;
  delete st.hits[cell(o)];
  if (!Object.keys(st.hits).length) delete st.hits;
}

// Своё растение переставили на (x, y): удары переезжают с ним
export function move(st, o, x, y) {
  const e = st.hits && st.hits[cell(o)];
  if (!e) return;
  delete st.hits[cell(o)];
  st.hits[x + ',' + y] = e;
}

// Можно ли заказать ещё удар, если по объекту уже заказано ordered ударов (больше, чем осталось, не нужно)
export function canOrder(st, o, ordered) { return ordered < hitsLeft(st, o); }

// Убрать отметки, у которых на клетке больше нет того объекта. objectAt(x, y) → объект или null.
export function tidy(st, objectAt) {
  if (!st.hits) return;
  for (const [k, e] of Object.entries(st.hits)) {
    const [x, y] = k.split(',').map(Number), o = objectAt(x, y);
    if (!o || o.gx !== x || o.gy !== y || o.type !== e[0]) delete st.hits[k];
  }
  if (!Object.keys(st.hits).length) delete st.hits;
}
