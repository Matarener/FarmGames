// Правила доски заказов: чистые функции над состоянием фермы st (без DOM, звуков, Date.now и Math.random).
// Время и случайность приходят снаружи: ctx = { now (мс), rng, fruit } — fruit: id плодов, которые игрок может
// собрать сейчас (свои плодовые деревья и кусты на карте; их находит игра, потом — сервер по своей карте).
// Потом эти же функции выполнит сервер. Звуки, тосты и опыт (от него бывает новый уровень) делает игра (orders.js).
//
// Состояние st.orders = { slots, n, done }:
//   slots — места на доске: заказ { id, who, items: { id: сколько }, value, coins, xp } или { wait: мс } — новый
//           покупатель придёт в это время. who — номер заказчика в CUSTOMERS, value — цена товаров на рынке.
//   n — сколько заказов создано (id следующего), done — сколько сдано.

import { ORDERS, CUSTOMERS } from './orderData.js';
import { CROPS, FISH, ITEMS, GEM_SPEEDUP_SEC } from './data.js';
import { toolLevel } from './toolRules.js';
import { count, takeItem } from './inventory.js';

const EMPTY = { slots: [], n: 0, done: 0 };
const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);

export function orderState(st) {
  return st.orders || (st.orders = { slots: [], n: 0, done: 0 });
}

export const isOpen = (st) => st.level >= ORDERS.level;

// Что сейчас можно заказать: [{ id, w (вес), k (доля строки) }]
export function goodsPool(st, ctx) {
  const G = ORDERS.goods, out = [];
  const crops = Object.values(CROPS).filter((c) => c.level <= st.level).sort((a, b) => a.level - b.level);
  crops.forEach((c, i) => out.push({ id: c.key, w: i >= crops.length - G.crop.recent ? G.crop.recentW : G.crop.w, k: 1 }));
  const Q = st.quests;
  if (!G.fish.need || (Q && Q.done && Q.done[G.fish.need])) for (const id of G.fish.items) out.push({ id, w: G.fish.w, k: G.fish.k });
  if (G.bigFish) for (const id of G.bigFish.items) if (FISH[id] && FISH[id].rod <= toolLevel(st, 'rod')) out.push({ id, w: G.bigFish.w, k: G.bigFish.k });
  for (const id of new Set(ctx.fruit || [])) out.push({ id, w: G.fruit.w, k: G.fruit.k });
  return out.filter((g) => ITEMS[g.id] && ITEMS[g.id].sell > 0);
}

// Номер по весам w, rng() — от 0 до 1
function pick(list, rng) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) { r -= list[i].w; if (r < 0) return i; }
  return list.length - 1;
}

// Сколько товаров в заказе на этом уровне: [от, до]
export function linesRange(level) {
  let row = ORDERS.lines[0];
  for (const l of ORDERS.lines) if (level >= l.level) row = l;
  return row.n;
}

// Новый заказ (в st ничего не кладёт, только считает номер). null — заказать нечего.
// Товары и заказчики, которые уже есть на доске, выпадают реже (товары) или не выпадают (заказчики).
export function makeOrder(st, ctx, O = orderState(st)) {
  const rng = ctx.rng, pool = goodsPool(st, ctx);
  if (!pool.length) return null;
  const used = new Set(), who = new Set();
  for (const s of O.slots) if (s && s.items) { for (const id of Object.keys(s.items)) used.add(id); who.add(s.who); }
  const left = pool.map((g) => ({ ...g, w: g.w * (used.has(g.id) ? ORDERS.repeatW : 1) }));
  const [a, b] = linesRange(st.level), lines = Math.min(left.length, a + Math.floor(rng() * (b - a + 1)));
  const V = ORDERS.value, items = {};
  let value = 0;
  for (let i = 0; i < lines; i++) {
    const g = left.splice(pick(left, rng), 1)[0], sell = ITEMS[g.id].sell;
    const target = (V.base + V.perLevel * st.level) * (V.spread[0] + rng() * (V.spread[1] - V.spread[0])) * g.k;
    const n = Math.max(1, Math.min(ORDERS.maxQty, Math.round(target / sell)));
    items[g.id] = n;
    value += n * sell;
  }
  const free = CUSTOMERS.map((_, i) => i).filter((i) => !who.has(i));
  const from = free.length ? free : CUSTOMERS.map((_, i) => i);
  O.n = (O.n || 0) + 1;
  return {
    id: O.n, who: from[Math.floor(rng() * from.length)], items, value,
    coins: r5(value * ORDERS.pay), xp: Math.max(1, Math.round(value / ORDERS.xpPer)),
  };
}

// Раз в секунду и при входе: пустые места и места, куда пора прийти покупателю, получают новый заказ.
// Возвращает события: { type: 'open' } — доска только что открылась, { type: 'new', idx, order }.
export function refresh(st, ctx) {
  if (!isOpen(st)) return [];
  const O = orderState(st), out = [], first = !O.n;
  const maxWait = Math.max(ORDERS.wait.done, ORDERS.wait.skip) * 1000;
  if (O.slots.length > ORDERS.slots) O.slots.length = ORDERS.slots;
  for (let i = 0; i < ORDERS.slots; i++) {
    const s = O.slots[i];
    if (s && s.wait == null) continue; // заказ ждёт игрока
    if (s && s.wait - ctx.now > maxWait) s.wait = ctx.now + maxWait; // часы на телефоне перевели назад
    if (s && ctx.now < s.wait) continue; // покупатель ещё в пути
    const o = makeOrder(st, ctx, O);
    if (!o) continue;
    O.slots[i] = o;
    out.push({ type: 'new', idx: i, order: o });
  }
  if (first && out.length) out.unshift({ type: 'open' });
  return out;
}

// Сколько кристаллов стоит позвать покупателя сразу (по курсу ускорения грядок)
export const rushCost = (left) => Math.max(1, Math.ceil(left / 1000 / GEM_SPEEDUP_SEC));

// Что показывает окно: open — доска открыта по уровню, done — сколько заказов сдано,
// slots — [{ idx, order, who, lines: [{ id, n, have }], ready }] или [{ idx, wait (мс до покупателя), gems }]
export function view(st, ctx) {
  const O = st.orders || EMPTY, slots = [];
  for (let i = 0; i < ORDERS.slots; i++) {
    const s = O.slots[i];
    if (!s || s.wait != null) {
      const left = s ? Math.max(0, s.wait - ctx.now) : 0;
      slots.push({ idx: i, wait: left, gems: rushCost(left) });
      continue;
    }
    const lines = Object.entries(s.items).map(([id, n]) => ({ id, n, have: count(st, id) }));
    slots.push({ idx: i, order: s, who: CUSTOMERS[s.who] || CUSTOMERS[0], lines, ready: lines.every((l) => l.have >= l.n) });
  }
  return { open: isOpen(st), level: ORDERS.level, slots, done: O.done || 0 };
}

// Сколько заказов можно сдать прямо сейчас (цифра на кнопке «Рынок»)
export function readyCount(st) {
  if (!isOpen(st) || !st.orders) return 0;
  return st.orders.slots.filter((s) => s && s.items && Object.entries(s.items).every(([id, n]) => count(st, id) >= n)).length;
}

// Сколько штук товара id просят все заказы на доске (пометка «нужно для заказа» на рынке)
export function need(st, id) {
  if (!isOpen(st) || !st.orders) return 0;
  let n = 0;
  for (const s of st.orders.slots) if (s && s.items && s.items[id]) n += s.items[id];
  return n;
}

// Сдать заказ idx: товары уходят, монеты приходят, место ждёт нового покупателя wait.done секунд.
// Опыт (xp) начисляет игра. null — заказа нет; { lack: id } — не хватает этого товара.
export function deliver(st, idx, ctx) {
  const O = orderState(st), o = O.slots[idx];
  if (!isOpen(st) || !o || !o.items) return null;
  for (const [id, n] of Object.entries(o.items)) if (count(st, id) < n) return { lack: id };
  for (const [id, n] of Object.entries(o.items)) takeItem(st, id, n);
  st.coins += o.coins;
  O.done = (O.done || 0) + 1;
  O.slots[idx] = { wait: ctx.now + ORDERS.wait.done * 1000 };
  return { order: o, items: o.items, coins: o.coins, xp: o.xp };
}

// Отказаться от заказа idx: новый покупатель придёт через wait.skip секунд
export function skip(st, idx, ctx) {
  const O = orderState(st), o = O.slots[idx];
  if (!isOpen(st) || !o || !o.items) return null;
  O.slots[idx] = { wait: ctx.now + ORDERS.wait.skip * 1000 };
  return { order: o };
}

// Позвать покупателя сразу за кристаллы. null — место не ждёт; { poor, gems } — не хватает кристаллов.
export function rush(st, idx, ctx) {
  const O = orderState(st), s = O.slots[idx];
  if (!isOpen(st) || !s || s.wait == null || ctx.now >= s.wait) return null;
  const gems = rushCost(s.wait - ctx.now);
  if (st.gems < gems) return { poor: true, gems };
  const o = makeOrder(st, ctx, O);
  if (!o) return null;
  st.gems -= gems;
  O.slots[idx] = o;
  return { gems, order: o };
}
