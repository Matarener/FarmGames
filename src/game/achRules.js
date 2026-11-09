// Правила достижений: чистые функции над состоянием фермы st (без DOM, звуков, Date.now и Math.random).
// Прогресс не копится отдельно: он берётся из счётчиков событий за всё время, которые ведут задания
// (questRules.life), и из состояния игры (уровень, дом, дни подарков). То, что знает только мир
// (сколько участков открыто), приходит снаружи: ctx = { chunks }. Потом эти же функции выполнит сервер.
// Тосты, звук и окно делает игра (achievements.js, UI) по возвращённым событиям:
//   { type: 'tier', view, tier, medal } — взята новая ступень (tier — сколько ступеней взято теперь, medal — её медаль)
//   { type: 'intro', n }         — достижения появились в игре впервые, n — сколько уже можно забрать
//
// Состояние st.ach:
//   got  { id: n } — сколько ступеней забрано (награда получена)
//   told { id: n } — о скольких ступенях уже сказали (тост был)
//
// «Вид» достижения (view): { id, group, name, icon, tiers, got, reached, can, complete, p, n, task, frac, reward }
//   reached — сколько ступеней взято по прогрессу, can — сколько из них можно забрать (reached − got),
//   medal — медаль последней забранной ступени (0 — ещё нет), n и task — цель последней взятой ступени,
//   если есть что забрать, иначе следующей (или последней, если взяты все), reward — что дадут: за все
//   ступени, которые можно забрать, или за следующую.

import { ACH, ACH_REWARDS } from './achData.js';
import { life, plural, applyReward, questState, GROUPS } from './questRules.js';

export const ACH_BY_ID = Object.fromEntries(ACH.map((a) => [a.id, a]));

// Значения игры для целей { stat }
const STATS = {
  level: (st) => st.level || 1,
  house: (st) => st.house || 1,
  chunks: (st, ctx) => (ctx && ctx.chunks) || 0,
  days: (st) => (st.gifts && st.gifts.daily && st.gifts.daily.n) || 0,
};

// told появляется при первой проверке (check): до неё достижений в сохранении как бы нет.
// Окна и кнопки состояние не создают, только читают.
export function achState(st) {
  const S = st.ach || (st.ach = {});
  if (!S.got) S.got = {};
  return S;
}

const gotOf = (st, id) => (st.ach && st.ach.got && st.ach.got[id]) || 0;

// Прогресс достижения a сейчас
export function value(st, a, ctx) {
  const g = a.goal;
  if (g.stat) return STATS[g.stat](st, ctx);
  const L = life(st);
  if (g.kinds) {
    const pre = g.kinds + ':', test = GROUPS[g.group];
    let n = 0;
    for (const k in L) if (L[k] > 0 && k.startsWith(pre) && test(k.slice(pre.length))) n++;
    return n;
  }
  return L[g.key ? g.ev + ':' + g.key : g.ev] || 0;
}

export const rewardsOf = (a) => a.rewards || ACH_REWARDS.slice(ACH_REWARDS.length - a.tiers.length);

// Медаль ступени tier (1…): как и награды, у достижения с меньшим числом ступеней они последние —
// за последнюю ступень всегда алмазная (5). Названия и цвета — ACH_MEDALS и style.css (.ach-ic.t1…t5).
export const medalOf = (a, tier) => tier + ACH_REWARDS.length - a.tiers.length;

// Число в тексте цели: 10 000, 250 000 (неразрывный пробел между тысячами)
const fmt = (n) => (n >= 10000 ? String(n).replace(/\B(?=(\d{3})+$)/g, ' ') : String(n));

export function taskText(a, n) {
  return a.task.replace('{n}', fmt(n)).replace(/\{([^{}]*\|[^{}]*)\}/g, (_, f) => plural(n, f.split('|')));
}

function sumRewards(list) {
  const out = {};
  for (const r of list) for (const k of ['coins', 'gems']) if (r[k]) out[k] = (out[k] || 0) + r[k];
  return out;
}

export function view(st, a, ctx) {
  const T = a.tiers, R = rewardsOf(a), p = value(st, a, ctx);
  let reached = 0;
  while (reached < T.length && p >= T[reached]) reached++;
  const got = Math.min(gotOf(st, a.id), T.length);
  // следующая ступень (got больше reached — только если ступени в таблице подняли после того, как их забрали)
  const can = Math.max(0, reached - got), complete = got >= T.length, next = Math.max(got, reached);
  // есть что забрать — цель последней взятой ступени (выполнена), иначе — следующей
  const n = T[can ? reached - 1 : Math.min(next, T.length - 1)];
  return {
    id: a.id, group: a.group, name: a.name, icon: a.icon, tiers: T.length, got, reached, can, complete,
    medal: got ? medalOf(a, got) : 0, p, n, task: taskText(a, n), frac: Math.min(1, p / n),
    reward: can ? sumRewards(R.slice(got, reached)) : next < T.length ? R[next] : null,
  };
}

export const views = (st, ctx) => ACH.map((a) => view(st, a, ctx));

// Сводка для окна и кнопки «Ещё»: got — медалей получено, total — всего, can — сколько достижений ждут награды
export function summary(vs) {
  let got = 0, total = 0, can = 0;
  for (const v of vs) { got += v.got; total += v.tiers; if (v.can) can++; }
  return { got, total, can };
}

// После любого изменения: какие ступени взяты (о каждой — одно событие 'tier').
// Первый раз (достижений в сохранении ещё не было) — без тостов по каждой: одно событие 'intro'.
export function check(st, ctx) {
  const out = [], first = !(st.ach && st.ach.told), S = achState(st);
  if (first) {
    S.told = {};
    // старое сохранение: сданные задания веток засчитываются (счётчик quest появился вместе с достижениями)
    const L = life(st), done = Object.keys(questState(st).done).length;
    if ((L.quest || 0) < done) L.quest = done;
  }
  let n = 0;
  for (const a of ACH) {
    const v = view(st, a, ctx);
    if (v.can) n++;
    if (v.reached <= (S.told[a.id] || 0)) continue;
    S.told[a.id] = v.reached;
    if (!first) out.push({ type: 'tier', view: v, tier: v.reached, medal: medalOf(a, v.reached) });
  }
  if (first && n) out.push({ type: 'intro', n });
  return out;
}

// Забрать награду достижения: за все взятые, но не забранные ступени сразу.
// null — забирать нечего. Опыта достижения не дают.
export function claim(st, id, ctx) {
  const a = ACH_BY_ID[id];
  if (!a) return null;
  const v = view(st, a, ctx);
  if (!v.can) return null;
  applyReward(st, v.reward);
  achState(st).got[id] = v.reached;
  return { view: v, reward: v.reward, from: v.got, to: v.reached };
}

// Забрать всё, что можно, во всех достижениях: { reward, n } или null
export function claimAll(st, ctx) {
  let n = 0;
  const list = [];
  for (const a of ACH) { const r = claim(st, a.id, ctx); if (r) { n++; list.push(r.reward); } }
  return n ? { reward: sumRewards(list), n } : null;
}
