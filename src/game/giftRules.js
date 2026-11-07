// Правила подарков: чистые функции над состоянием фермы st (без DOM, звуков, Date.now и Math.random).
// Время и часовой пояс приходят снаружи: ctx = { now (мс), tz (часов от UTC) } — тот же, что у заданий.
// Потом эти же функции выполнит сервер. Звуки, тосты и кнопку подарка делает игра (gifts.js, UI).
//
// Состояние st.gifts:
//   daily { d, n } — d: номер дня (dayNo), когда забран последний ежедневный подарок (null — ни разу),
//                    n: сколько подарков забрано (дней входа); сегодняшний — ячейка n % длина дорожки.
//                    С DAILY_GIFT.resetOnMiss пропуск дня обнуляет n (дорожка с 1-го дня).

import { DAILY_GIFT } from './giftData.js';
import { applyReward } from './questRules.js';

const H = 3600e3, DAY = 24 * H;

// Номер дня по местному времени tz: новый день начинается в 00:00 (как у заданий дня)
export const dayNo = (now, tz) => Math.floor((now + tz * H) / DAY);
// Когда начнётся день номер d (мс)
const dayStart = (d, tz) => d * DAY - tz * H;

export function giftState(st) {
  const G = st.gifts || (st.gifts = {});
  if (!G.daily) G.daily = { d: null, n: 0 };
  return G;
}

// Ежедневный подарок сейчас:
//   open   — доступен по уровню; can — можно забрать (сегодня ещё не забран)
//   idx    — ячейка сегодняшнего дня (0…длина-1); total — сколько подарков будет забрано вместе с сегодняшним
//   missed — дорожка началась заново из-за пропуска (только с resetOnMiss), next — когда будет следующий (мс)
//   days   — [{ i, reward, state: 'got' | 'today' | 'soon' }] — что показывает окно
export function daily(st, ctx) {
  const T = DAILY_GIFT, len = T.days.length, G = giftState(st).daily;
  const today = dayNo(ctx.now, ctx.tz), open = st.level >= T.level;
  // уже забран сегодня (или часы на телефоне перевели назад — ждём, пока наступит тот день)
  const got = G.d != null && today <= G.d;
  let n = Math.max(0, G.n | 0);
  const missed = !got && G.d != null && today - G.d > 1;
  if (missed && T.resetOnMiss) n = 0;
  if (got && !n) n = 1;
  const idx = got ? (n - 1) % len : n % len;
  const days = T.days.map((reward, i) => ({ i, reward, state: i < idx || (i === idx && got) ? 'got' : i === idx ? 'today' : 'soon' }));
  return {
    open, can: open && !got, idx, total: got ? n : n + 1, missed: missed && n === 0 && G.n > 0,
    next: dayStart(Math.max(today, G.d == null ? today : G.d) + 1, ctx.tz), days, reward: T.days[idx],
  };
}

// Забрать ежедневный подарок: награда начисляется в st. null — сегодня уже забран или закрыт по уровню.
export function claimDaily(st, ctx) {
  const v = daily(st, ctx);
  if (!v.can) return null;
  applyReward(st, v.reward);
  const G = giftState(st).daily;
  G.d = dayNo(ctx.now, ctx.tz);
  G.n = v.total;
  return { reward: v.reward, day: v.idx + 1, total: v.total };
}

// Сколько подарков можно забрать во всех разделах (кнопка подарка видна, пока их больше нуля)
export function available(st, ctx) {
  return daily(st, ctx).can ? 1 : 0;
}
