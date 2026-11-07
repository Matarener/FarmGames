// Правила колеса фортуны: чистые функции над состоянием фермы st (без DOM, звуков, Date.now и Math.random).
// Время, часовой пояс и случайность приходят снаружи: ctx = { now (мс), tz (часов от UTC), rng } — как у заданий.
// Потом эти же функции выполнит сервер: он и решает, какой сектор выпал. Вращение рисует окно (UI).
//
// Состояние st.wheel = { d, free, coins, n }: d — номер дня (dayNo) последнего вращения, free и coins —
// сколько в тот день крутили бесплатно и за монеты, n — сколько всего вращений.

import { WHEEL } from './wheelData.js';
import { dayNo } from './giftRules.js';
import { applyReward } from './questRules.js';

const H = 3600e3, DAY = 24 * H;

export function wheelState(st) {
  return st.wheel || (st.wheel = { d: null, free: 0, coins: 0, n: 0 });
}

// Сколько вращений уже было сегодня (часы перевели назад — считаем по последнему дню вращений)
function usedToday(st, ctx) {
  const W = wheelState(st), today = dayNo(ctx.now, ctx.tz), same = W.d != null && today <= W.d;
  return { W, today, free: same ? W.free : 0, coins: same ? W.coins : 0 };
}

// Что можно сейчас: open — по уровню; freeLeft, coinLeft — сколько осталось сегодня; coinCost — цена
// следующего вращения за монеты (null — на сегодня всё); can.{free,coins,gems} — хватает ли;
// next — когда новый день (бесплатное вращение и вращения за монеты снова есть), мс
export function wheelView(st, ctx) {
  const T = WHEEL, u = usedToday(st, ctx), open = st.level >= T.level;
  const freeLeft = open ? Math.max(0, T.free - u.free) : 0;
  const coinLeft = open ? Math.max(0, T.coins.length - u.coins) : 0;
  const coinCost = coinLeft ? T.coins[u.coins] : null;
  return {
    open, freeLeft, coinLeft, coinCost, gemCost: T.gems,
    can: { free: freeLeft > 0, coins: coinLeft > 0 && st.coins >= coinCost, gems: open && st.gems >= T.gems },
    next: (Math.max(u.today, u.W.d == null ? u.today : u.W.d) + 1) * DAY - ctx.tz * H,
  };
}

// Какой сектор выпал: по весам w, rng() — от 0 до 1
export function pickSector(sectors, rng) {
  const total = sectors.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (let i = 0; i < sectors.length; i++) { r -= sectors[i].w; if (r < 0) return i; }
  return sectors.length - 1;
}

// Крутить: mode — 'free' | 'coins' | 'gems'. Цена списывается, награда сектора начисляется сразу.
// Возвращает { idx (сектор), reward, cost, mode } или null — так крутить сейчас нельзя.
export function spin(st, mode, ctx) {
  const v = wheelView(st, ctx);
  if (!v.can[mode]) return null;
  const cost = mode === 'coins' ? { coins: v.coinCost } : mode === 'gems' ? { gems: v.gemCost } : {};
  st.coins -= cost.coins || 0;
  st.gems -= cost.gems || 0;
  const u = usedToday(st, ctx), W = u.W;
  W.d = W.d == null ? u.today : Math.max(W.d, u.today);
  W.free = u.free + (mode === 'free' ? 1 : 0);
  W.coins = u.coins + (mode === 'coins' ? 1 : 0);
  W.n = (W.n || 0) + 1;
  const idx = pickSector(WHEEL.sectors, ctx.rng), reward = WHEEL.sectors[idx];
  applyReward(st, reward);
  return { idx, reward, cost, mode };
}

// Сколько бесплатных вращений ждёт (кнопка колеса видна, пока их больше нуля)
export function freeSpins(st, ctx) { return wheelView(st, ctx).freeLeft; }
