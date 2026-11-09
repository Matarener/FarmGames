// Правила грядок: чистые функции над грядкой { crop, p — секунд роста, w — сколько раз полита },
// покупка грядок и грядка в рюкзаке. Без звуков, картинок и Date.now — их же потом сможет выполнять сервер.

import { CROPS, BED_ITEM, BEDS } from './data.js';
import * as Inv from './inventory.js';
import { N, T } from './World.js';

// Культуру поливают дважды: после первого полива она растёт до 2/3, после второго — до конца.
const limitOf = (b, total) => (b.w >= 2 ? total : b.w >= 1 ? total * 2 / 3 : 0);

// Состояние посадки: стадия 0–3 | готово << 2 | нужен полив << 3 (без создания объекта — для каждого кадра)
export function cropFlags(b) {
  const total = CROPS[b.crop].time, ready = b.p >= total;
  const stage = ready ? 3 : Math.min(2, Math.floor((b.p / total) * 3));
  const needsWater = !ready && (b.w === 0 || (b.w === 1 && b.p >= total * 2 / 3));
  return stage | (ready ? 4 : 0) | (needsWater ? 8 : 0);
}

export function cropInfo(b) {
  const c = CROPS[b.crop], total = c.time, fl = cropFlags(b);
  return { c, total, ready: !!(fl & 4), stage: fl & 3, needsWater: !!(fl & 8), left: Math.max(0, total - b.p) };
}

// Рост грядки за dt секунд: без полива культура доходит только до своей границы и ждёт.
// auto — грядку поливает поливалка (sprinklers.js): как только грядка просит воды, она поливается
// сама и растёт дальше в тот же промежуток (так и за время отсутствия урожай дорастает до конца).
// → сколько раз грядку полила поливалка
export function growBed(b, dt, auto) {
  if (!b.crop || !CROPS[b.crop]) return 0;
  const total = CROPS[b.crop].time;
  let n = 0;
  for (let k = 0; k < 4; k++) {
    if (auto && (cropFlags(b) & 8)) { b.w++; n++; }
    const limit = limitOf(b, total);
    if (b.p >= limit || !(dt > 0)) break;
    const step = Math.min(dt, limit - b.p);
    b.p += step; dt -= step;
  }
  return n;
}

// ---------- Грядка в рюкзаке ----------
// Пустую грядку можно убрать в рюкзак (предмет BED_ITEM) и поставить обратно на траву — уже вскопанной.
// beds — грядки фермы (Map: клетка → грядка { crop, p, w }), на клиенте это Farm.beds. Убранная или
// поставленная грядка ставит st.movedBeds: стартовые грядки карты больше не возвращаются сами.

// Пустую грядку на клетке i — в рюкзак, клетка снова трава. → true или false (не грядка, на ней растёт урожай)
export function storeBed(st, w, beds, i) {
  const b = beds.get(i);
  if (w.tiles[i] !== T.SOIL || (b && b.crop) || !Inv.addItem(st, BED_ITEM, 1)) return false;
  w.tiles[i] = T.GRASS;
  beds.delete(i);
  st.movedBeds = true;
  return true;
}

// Грядку из рюкзака — на клетку i: открытая свободная трава. Саму грядку (объект в beds) создаёт игра
// (Farm.bedAt). → true или false
export function placeBed(st, w, i) {
  const x = i % N, y = (i / N) | 0;
  if (!w.isOpen(x, y) || w.tiles[i] !== T.GRASS || w.occ[i] >= 0 || !Inv.takeItem(st, BED_ITEM, 1)) return false;
  w.tiles[i] = T.SOIL;
  st.movedBeds = true;
  return true;
}

// ---------- Покупка грядок ----------
// Грядки не копают, а покупают на рынке (и получают за задания). Цена и предел — таблица BEDS (data.js).
// owned — сколько своих грядок уже есть: на ферме (countBeds) и в рюкзаке (ownedBeds).

// Грядок на ферме: клетки-грядки карты
export function countBeds(w) {
  let n = 0;
  for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === T.SOIL) n++;
  return n;
}

// Все свои грядки: на ферме и в рюкзаке
export const ownedBeds = (st, onFarm) => onFarm + Inv.count(st, BED_ITEM);

// Сколько грядок можно иметь, чтобы купить ещё (предел по уровню)
export function bedLimit(level) {
  const L = BEDS.limit;
  return Math.min(L.max, L.base + L.perLevel * Math.max(1, level || 1));
}

// Цена следующей грядки, когда грядок уже owned
export function bedPrice(owned) {
  const n = owned + 1, P = BEDS.price;
  for (const [upTo, price] of P) if (n <= upTo) return price;
  return P[P.length - 1][1];
}

// С какого уровня можно купить следующую грядку (0 — больше не купить: предел BEDS.limit.max)
export function bedLevel(owned) {
  const L = BEDS.limit;
  if (owned >= L.max) return 0;
  return Math.max(1, Math.floor((owned - L.base) / L.perLevel) + 1);
}

// Грядка на рынке сейчас: { price, owned, limit, level — с какого уровня следующая (0 — предел), can — можно купить
// (уровень позволяет; монеты проверяет buyBed) }
export function bedOffer(st, owned) {
  const limit = bedLimit(st.level);
  return { price: bedPrice(owned), owned, limit, level: owned < limit ? st.level : bedLevel(owned), can: owned < limit };
}

// Купить одну грядку в рюкзак. → { id, n: 1, cost, cur: 'coins' } (как Inv.buyItem) или { limit: уровень (0 — предел) }
// или { poor: 'coins' }
export function buyBed(st, owned) {
  const o = bedOffer(st, owned);
  if (!o.can) return { limit: o.level };
  if (st.coins < o.price) return { poor: 'coins' };
  if (!Inv.addItem(st, BED_ITEM, 1)) return null;
  st.coins -= o.price;
  return { id: BED_ITEM, n: 1, cost: o.price, cur: 'coins' };
}
