// Правила деревьев и кустов: сбор плодов, добыча при рубке, посадка своих растений.
// Чистые функции над состоянием st: время (now, мс) и случайность (rng → [0,1)) приходят
// параметрами, звуков и картинок здесь нет — эффекты делает Farm по возвращённым событиям.
//
// st.fruit  = { "x,y": когда созреют плоды (мс) } — нет записи: плоды висят.
// st.plants = [[x, y, вид, когда посажено (мс)], ...] — растения, посаженные игроком.

import { FLORA, OBJECTS, floraSeedId } from './data.js';
import { addItem } from './inventory.js';

const cell = (o) => o.gx + ',' + o.gy;
const roll = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));

// Вид растения объекта (null — не дерево и не куст; у ростка — во что вырастет)
export function floraOf(o) {
  const d = OBJECTS[o.type];
  return d && d.flora ? FLORA[d.flora] : null;
}

// Сколько секунд до плодов (0 — уже висят)
export function fruitLeft(st, o, now) {
  const t = st.fruit && st.fruit[cell(o)];
  return t && t > now ? Math.ceil((t - now) / 1000) : 0;
}

export function hasFruit(st, o, now) { return !!floraOf(o) && !fruitLeft(st, o, now); }

function give(st, out, id, n) {
  const got = addItem(st, id, n);
  if (got) out.push({ id, n: got });
  return got;
}

// Собрать плоды касанием. → { items: [{id, n}], xp } или null (плодов нет / склад полон)
export function pickFruit(st, o, now, rng) {
  const f = floraOf(o);
  if (!f || fruitLeft(st, o, now)) return null;
  const items = [];
  if (!give(st, items, f.fruit, roll(rng, f.n))) return null;
  if (rng() < f.seedPick) give(st, items, floraSeedId(f.key), 1);
  (st.fruit || (st.fruit = {}))[cell(o)] = now + f.regrow * 1000;
  return { items, xp: 1 };
}

// Добыча при рубке дерева или куста: дерево, плоды (если висели) и, с шансом, семя этого вида.
export function chopFlora(st, o, now, rng) {
  const f = floraOf(o), items = [];
  if (!f) return { items };
  give(st, items, 'wood', roll(rng, f.wood));
  if (!fruitLeft(st, o, now)) give(st, items, f.fruit, roll(rng, f.n));
  if (rng() < f.seedChop) give(st, items, floraSeedId(f.key), 1);
  forget(st, o);
  return { items };
}

// Растение ушло с клетки (срубили, выкорчевали): забыть его таймер и запись о посадке
export function forget(st, o) {
  if (st.fruit) delete st.fruit[cell(o)];
  if (st.plants) st.plants = st.plants.filter((p) => p[0] !== o.gx || p[1] !== o.gy);
}

// ---------- Свои растения ----------

// Стадия своего растения: 0 — росток, 1 — молодое, 2 — взрослое (даёт плоды)
export function plantStage(species, born, now) {
  const f = FLORA[species], k = (now - born) / 1000 / f.grow;
  return k >= 1 ? 2 : k >= 0.4 ? 1 : 0;
}

export function growLeft(species, born, now) {
  return Math.max(0, Math.ceil(FLORA[species].grow - (now - born) / 1000));
}

// Посадить семя вида на клетку (проверка клетки — на стороне мира). → { species } или null
export function sow(st, species, x, y, now) {
  const id = floraSeedId(species), n = st.items[id] || 0;
  if (!FLORA[species] || !n) return null;
  if (n === 1) delete st.items[id]; else st.items[id] = n - 1;
  (st.plants || (st.plants = [])).push([x, y, species, now]);
  // только что выросшее растение — без плодов: они появятся через regrow после взросления
  (st.fruit || (st.fruit = {}))[x + ',' + y] = now + (FLORA[species].grow + FLORA[species].regrow) * 1000;
  return { species };
}

// Убрать из st.fruit созревшие записи (чтобы сохранение не росло)
export function tidyFruit(st, now) {
  if (!st.fruit) return;
  for (const [k, t] of Object.entries(st.fruit)) if (t <= now) delete st.fruit[k];
}
