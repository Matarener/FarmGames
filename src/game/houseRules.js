// Улучшение дома: чистые функции над состоянием фермы st (без DOM, звуков, Date.now), как buildRules.js.
// Время приходит снаружи (now, мс), чтобы потом эти же функции выполнял сервер. Эффекты (дом в лесах,
// салют, тосты) делает buildings.js по возвращённому результату.
//
// Улучшение идёт HOUSE[n].time секунд: ресурсы списываются сразу, дом стоит в лесах, а энергия, лейка
// и участки остаются прежними, пока стройка не кончится. Состояние st.houseUp = { to, end }:
//   to — до какого уровня улучшаем, end — когда кончится (мс). Нет записи — дом не строится.
// unlocked — сколько участков открыто (World.unlockedCount): от него зависит, можно ли улучшать.

import { HOUSE, houseNeedChunks } from './data.js';
import { missing, missText, gemsFor } from './buildRules.js';
import * as Inv from './inventory.js';

const S = 1000;

export const houseUp = (st) => st.houseUp || null;
// Идёт ли улучшение (даже если время уже вышло, а houseTick ещё не прошёл)
export const upgrading = (st) => !!st.houseUp;
export const houseUpLeft = (st, now) => (st.houseUp ? Math.max(0, (st.houseUp.end - now) / S) : 0);
// Доля готовности 0..1 (полоска над домом)
export function houseUpPart(st, now) {
  const u = st.houseUp, t = u && HOUSE[u.to] ? HOUSE[u.to].time || 0 : 0;
  return !u ? 0 : t > 0 ? Math.max(0, Math.min(1, 1 - houseUpLeft(st, now) / t)) : 1;
}

// Можно ли начать улучшение: null или причина { why, chunks? } (chunks — сколько участков нужно)
export function houseUpBlock(st, unlocked) {
  const next = HOUSE[st.house + 1];
  if (st.houseUp) return { why: `Дом уже улучшается до ${st.houseUp.to} уровня` };
  if (!next) return { why: 'Дом улучшен до максимума' };
  const need = houseNeedChunks(st.house);
  if (unlocked < need) return { why: `Сначала откройте новый участок земли (участков: ${unlocked} из ${need})`, chunks: need };
  const miss = missing(st, next.cost);
  if (miss.length) return { why: `Не хватает: ${missText(miss)}` };
  return null;
}

// Начать улучшение: ресурсы уходят, дом в лесах HOUSE[to].time секунд. → { to, end } или null
export function startHouseUp(st, unlocked, now) {
  if (houseUpBlock(st, unlocked)) return null;
  const to = st.house + 1, next = HOUSE[to];
  for (const [id, n] of Object.entries(next.cost)) {
    if (id === 'coins' || id === 'gems') st[id] -= n; else Inv.takeItem(st, id, n);
  }
  st.houseUp = { to, end: now + (next.time || 0) * S };
  return { ...st.houseUp };
}

// Кончилось ли улучшение (раз в секунду и при входе): дом получает новый уровень, энергия
// прибавляется на столько, на сколько вырос запас. → { to, energy } или null
export function houseTick(st, now) {
  const u = st.houseUp;
  if (!u || u.end > now) return null;
  const from = HOUSE[st.house], to = HOUSE[u.to];
  delete st.houseUp;
  if (!to || u.to <= st.house) return null;
  const energy = Math.max(0, to.energy - (from ? from.energy : 0));
  st.house = u.to;
  st.energy += energy;
  return { to: u.to, energy };
}

// Достроить сейчас за кристаллы (как здания). → { gems } или null
export function speedHouseUp(st, now) {
  const left = houseUpLeft(st, now);
  if (!st.houseUp || left <= 0) return null;
  const gems = gemsFor(left);
  if (st.gems < gems) return null;
  st.gems -= gems;
  st.houseUp.end = now;
  return { gems };
}
