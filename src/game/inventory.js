// Правила инвентаря: чистые функции над состоянием st (без звуков, DOM и Date.now),
// чтобы их же потом мог выполнять сервер. Эффекты делает Farm по возвращённому результату.
// Хранилище: st.items = { id: количество } — id из таблицы ITEMS (data.js).

import { ITEMS, STORAGE, seedId } from './data.js';

export function count(st, id) { return st.items[id] || 0; }

// Положить n штук. Возвращает, сколько реально легло (склад может быть полон).
export function addItem(st, id, n) {
  const it = ITEMS[id];
  if (!it || it.tool || !(n > 0)) return 0;
  const have = count(st, id), add = Math.max(0, Math.min(n, STORAGE - have));
  if (add) st.items[id] = have + add;
  return add;
}

// Забрать n штук: всё или ничего.
export function takeItem(st, id, n) {
  const have = count(st, id);
  if (!(n > 0) || have < n) return false;
  if (have === n) delete st.items[id]; else st.items[id] = have - n;
  return true;
}

export function sellItem(st, id, n) {
  const it = ITEMS[id];
  if (!it || !it.sell) return null;
  n = Math.min(n, count(st, id));
  if (!n || !takeItem(st, id, n)) return null;
  const coins = n * it.sell;
  st.coins += coins;
  return { id, n, coins };
}

export function eatItem(st, id, maxEnergy) {
  const it = ITEMS[id];
  if (!it || !it.food || !count(st, id)) return null;
  if (st.energy >= maxEnergy) return { full: true };
  takeItem(st, id, 1);
  const before = st.energy;
  st.energy = Math.min(maxEnergy, st.energy + it.food);
  return { id, energy: st.energy - before };
}

// Старые сохранения: st.inv (ресурсы), st.seeds (семена), st.crops (урожай и рыба) → st.items
export function migrateInventory(st) {
  if (!st.inv && !st.seeds && !st.crops) { st.items = st.items || {}; return; }
  const items = {};
  const put = (id, n) => { if (ITEMS[id] && n > 0) items[id] = (items[id] || 0) + n; };
  for (const [k, n] of Object.entries(st.inv || {})) put(k, n);
  for (const [k, n] of Object.entries(st.seeds || {})) put(seedId(k), n);
  for (const [k, n] of Object.entries(st.crops || {})) put(k, n);
  st.items = items;
  delete st.inv; delete st.seeds; delete st.crops;
}

// Список клеток для раздела. sort: 'auto' | 'price' | 'name'.
// Инструменты всегда есть; остальное — только то, что лежит в рюкзаке.
export function listItems(st, tab, sort) {
  const out = [];
  for (const it of Object.values(ITEMS)) {
    if (tab !== 'all' && !it.tabs.includes(tab)) continue;
    if (!it.tool && !count(st, it.key)) continue;
    out.push(it);
  }
  if (sort === 'price') out.sort((a, b) => (b.sell || 0) - (a.sell || 0) || a.order - b.order);
  else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  else out.sort((a, b) => a.order - b.order);
  return out;
}

// Покупка на рынке: offer — строка из SHOP. Всё или ничего.
export function buyItem(st, offer, n) {
  if (!offer || !(n > 0) || !ITEMS[offer.item]) return null;
  if (offer.level && st.level < offer.level) return { locked: true };
  const coins = offer.price * n;
  if (st.coins < coins) return { poor: true };
  const got = addItem(st, offer.item, n);
  if (!got) return null;
  st.coins -= offer.price * got;
  return { id: offer.item, n: got, coins: offer.price * got };
}
