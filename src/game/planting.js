// Правила посадки культур на грядки: чистые функции над состоянием st (без звуков, DOM и Date.now),
// чтобы их же потом мог выполнять сервер. Эффекты делает Farm, окно выбора рисует UI.

import { CROPS, FLORA, PLANT_PICK, seedId, floraSeedId, floraOwnId } from './data.js';
import * as Inv from './inventory.js';

// Сколько ещё грядок можно засадить культурой key: свои семена плюс семена на все монеты,
// минус pending — посадки этой культуры, которые уже ждут в очереди призрака.
export function plantLeft(st, key, pending = 0) {
  const c = CROPS[key];
  if (!c || c.level > st.level) return 0;
  const coins = c.seed > 0 ? Math.floor(st.coins / c.seed) : Infinity;
  return Math.max(0, Inv.count(st, seedId(key)) + coins - pending);
}

// Сколько ещё можно посадить саженцев вида species (grown — своих выкопанных взрослых) из рюкзака,
// минус pending — посадки, которые уже ждут в очереди призрака
export function sowLeft(st, species, grown, pending = 0) {
  if (!FLORA[species]) return 0;
  return Math.max(0, Inv.count(st, (grown ? floraOwnId : floraSeedId)(species)) - pending);
}

// Посадить key на пустую грядку b: своё семя, а если его нет — семена за монеты.
// Запоминает культуру: в окне выбора она встанет первой. → 'seed' | 'coins' | null (нечем платить)
export function plantBed(st, b, key) {
  const c = CROPS[key];
  if (!c || b.crop || c.level > st.level) return null;
  let paid = 'seed';
  if (!Inv.takeItem(st, seedId(key), 1)) {
    if (st.coins < c.seed) return null;
    st.coins -= c.seed; paid = 'coins';
  }
  b.crop = key; b.p = 0; b.w = 0;
  st.lastCrop = key;
  return paid;
}

// Культуры для окна выбора. filter: 'all' | 'seeds' (есть свои семена) | 'fast' (растут не дольше PLANT_PICK.fast).
// Порядок: последняя посаженная, со своими семенами, на которые хватает монет, на которые не хватает,
// закрытые по уровню (только в «Все» и не больше PLANT_PICK.locked ближайших). Внутри группы — по уровню,
// в «Быстрых» — по времени роста.
// → [{ key, c, seeds, open, can — можно посадить сейчас, last }]
export function cropChoices(st, filter = 'all') {
  const out = [];
  let locked = 0;
  const list = Object.values(CROPS).sort((a, b) => a.level - b.level);
  for (const c of list) {
    const seeds = Inv.count(st, seedId(c.key)), open = c.level <= st.level;
    if (!open) {
      if (filter !== 'all' || locked >= PLANT_PICK.locked) continue;
      locked++;
    }
    if (filter === 'seeds' && !seeds) continue;
    if (filter === 'fast' && c.time > PLANT_PICK.fast) continue;
    out.push({ key: c.key, c, seeds, open, can: open && (seeds > 0 || st.coins >= c.seed), last: open && st.lastCrop === c.key });
  }
  const rank = (r) => (r.last ? 0 : !r.open ? 4 : r.seeds ? 1 : r.can ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b) || (filter === 'fast' ? a.c.time - b.c.time : 0) || a.c.level - b.c.level);
}
