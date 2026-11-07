// Правила режима тестера: чистые функции над состоянием фермы st (без DOM, звуков и Date.now).
// Тестер ставит себе любые монеты и кристаллы, выдаёт и убирает предметы, восполняет энергию.
// Когда появится сервер, эти же функции он выполнит только для аккаунтов из списка тестеров
// (на клиенте режим включается скрытым жестом в «Настройках» и ничего не защищает).

import { ITEMS, DEV_LIMITS } from './data.js';
import { addItem, count, takeItem } from './inventory.js';

const WALLET = ['coins', 'gems'];
const clampInt = (n, max) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));

// Поставить ровно n монет или кристаллов. Возвращает { cur, from, to } или null.
export function setWallet(st, cur, n) {
  if (!WALLET.includes(cur)) return null;
  const from = st[cur] || 0, to = clampInt(n, DEV_LIMITS.wallet);
  st[cur] = to;
  return { cur, from, to };
}

// Предметы, которые можно выдать (инструменты есть всегда — их не выдают)
export function grantable() { return Object.values(ITEMS).filter((it) => !it.tool); }

// Выдать n штук предмета id. Возвращает { id, n } — сколько реально легло, или null.
export function grantItem(st, id, n) {
  const it = ITEMS[id];
  if (!it || it.tool) return null;
  const got = addItem(st, id, clampInt(n, DEV_LIMITS.item));
  return got ? { id, n: got } : null;
}

// Выдать по n штук каждого предмета из списка ids. Возвращает { kinds, n } — сколько видов получили.
export function grantMany(st, ids, n) {
  let kinds = 0, total = 0;
  for (const id of ids) { const r = grantItem(st, id, n); if (r) { kinds++; total += r.n; } }
  return kinds ? { kinds, n: total } : null;
}

// Убрать все штуки предмета id. Возвращает { id, n } или null.
export function clearItem(st, id) {
  const n = count(st, id);
  return n && takeItem(st, id, n) ? { id, n } : null;
}

// Полная энергия
export function fillEnergy(st, max) {
  const from = st.energy;
  st.energy = Math.max(st.energy, max);
  return st.energy > from ? { energy: st.energy - from } : null;
}
