// Правила деревьев и кустов: сбор плодов, добыча при рубке, посадка своих растений.
// Чистые функции над состоянием st: время (now, мс) и случайность (rng → [0,1)) приходят
// параметрами, звуков и картинок здесь нет — эффекты делает Farm по возвращённым событиям.
//
// st.fruit  = { "x,y": когда созреют плоды (мс) } — нет записи: плоды висят.
//            Только у видов с pick (плоды и ягоды); у остальных добыча — только при рубке.
// st.plants = [[x, y, вид, когда посажено (мс)], ...] — растения, посаженные игроком.

import { FLORA, OBJECTS, floraSeedId, floraOwnId } from './data.js';
import { addItem } from './inventory.js';
import * as Chop from './chop.js';

const cell = (o) => o.gx + ',' + o.gy;
const roll = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));

// Вид растения объекта (null — не дерево и не куст; у ростка — во что вырастет)
export function floraOf(o) {
  const d = OBJECTS[o.type];
  return d && d.flora ? FLORA[d.flora] : null;
}

// Сколько секунд до плодов (0 — уже висят или вид без сбора)
export function fruitLeft(st, o, now) {
  const t = st.fruit && st.fruit[cell(o)];
  return t && t > now ? Math.ceil((t - now) / 1000) : 0;
}

// Висят ли плоды, которые можно собрать касанием (только у видов с pick)
export function hasFruit(st, o, now) { const f = floraOf(o); return !!(f && f.pick) && !fruitLeft(st, o, now); }

function give(st, out, id, n) {
  const got = addItem(st, id, n);
  if (got) out.push({ id, n: got });
  return got;
}

// Собрать плоды касанием (саженцы так не добываются). → { items: [{id, n}], xp } или null
// (вид без сбора / плодов нет / склад полон)
export function pickFruit(st, o, now, rng) {
  const f = floraOf(o);
  if (!hasFruit(st, o, now)) return null;
  const items = [];
  if (!give(st, items, f.fruit, roll(rng, f.n))) return null;
  (st.fruit || (st.fruit = {}))[cell(o)] = now + f.regrow * 1000;
  return { items, xp: 1 };
}

// Добыча при рубке дерева или куста: дерево, добыча вида (у плодовых — если плоды висели)
// и, с шансом seedChop, саженец этого вида.
export function chopFlora(st, o, now, rng) {
  const f = floraOf(o), items = [];
  if (!f) return { items };
  give(st, items, 'wood', roll(rng, f.wood));
  if (!f.pick || !fruitLeft(st, o, now)) give(st, items, f.fruit, roll(rng, f.n));
  if (rng() < f.seedChop) give(st, items, floraSeedId(f.key), 1);
  forget(st, o);
  return { items };
}

// Срубить росток. Дикий даёт добычу OBJECTS.sapling.wildDrops (1 дерево), свой — саженец обратно.
// → { items: [{id, n}] }
export function chopSapling(st, o, rng) {
  const items = [];
  if (o.own) { if (FLORA[o.tree]) give(st, items, floraSeedId(o.tree), 1); }
  else for (const [id, r] of Object.entries(OBJECTS.sapling.wildDrops || {})) give(st, items, id, roll(rng, r));
  forget(st, o);
  return { items };
}

// Растение ушло с клетки (срубили, выкорчевали): забыть его таймер и запись о посадке
export function forget(st, o) {
  if (st.fruit) delete st.fruit[cell(o)];
  if (st.plants) st.plants = st.plants.filter((p) => p[0] !== o.gx || p[1] !== o.gy);
  if (st.wild) st.wild.list = st.wild.list.filter((e) => e[0] !== o.gx || e[1] !== o.gy); // дикая поросль
  Chop.forget(st, o); // начатая рубка
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
  // только что выросшее плодовое растение — без плодов: они появятся через regrow после взросления
  if (FLORA[species].pick) (st.fruit || (st.fruit = {}))[x + ',' + y] = now + (FLORA[species].grow + FLORA[species].regrow) * 1000;
  return { species };
}

// Убрать своё растение в рюкзак (режим перестановки). Взрослое ложится предметом own_<вид>,
// висящие плоды собираются; росток возвращается саженцем (рост начнётся заново).
// → { items } или null (не своё / склад полон)
export function storeOwn(st, o, now, rng) {
  if (!o.own) return null;
  const items = [];
  if (o.type === 'sapling') {
    if (!FLORA[o.tree] || !give(st, items, floraSeedId(o.tree), 1)) return null;
  } else {
    const f = floraOf(o);
    if (!f || !give(st, items, floraOwnId(f.key), 1)) return null;
    if (hasFruit(st, o, now)) give(st, items, f.fruit, roll(rng, f.n));
  }
  forget(st, o);
  return { items };
}

// Своё растение переставили на (x, y): переносим запись о посадке, таймер плодов и начатую рубку
export function moveOwn(st, o, x, y) {
  const p = st.plants && st.plants.find((q) => q[0] === o.gx && q[1] === o.gy);
  if (p) { p[0] = x; p[1] = y; }
  const k = cell(o);
  if (st.fruit && k in st.fruit) { st.fruit[x + ',' + y] = st.fruit[k]; delete st.fruit[k]; }
  Chop.move(st, o, x, y);
}

// Посадить выкопанное взрослое растение: сразу взрослое, плоды — через regrow
export function sowGrown(st, species, x, y, now) {
  const f = FLORA[species], id = floraOwnId(species), n = st.items[id] || 0;
  if (!f || !n) return null;
  if (n === 1) delete st.items[id]; else st.items[id] = n - 1;
  (st.plants || (st.plants = [])).push([x, y, species, now - f.grow * 1000]);
  if (f.pick) (st.fruit || (st.fruit = {}))[x + ',' + y] = now + f.regrow * 1000;
  return { species };
}

// Убрать из st.fruit созревшие записи (чтобы сохранение не росло)
export function tidyFruit(st, now) {
  if (!st.fruit) return;
  for (const [k, t] of Object.entries(st.fruit)) if (t <= now) delete st.fruit[k];
}
