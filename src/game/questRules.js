// Правила заданий: чистые функции над состоянием фермы st (без DOM, звуков, Date.now и Math.random).
// Время, часовой пояс и случайность приходят снаружи: ctx = { now (мс), tz (часов от UTC), rng, force? }.
// Потом эти же функции выполнит сервер. Тосты, звуки и опыт делает Farm по возвращённым событиям:
//   { type: 'done', view }               — задание выполнено (можно забрать награду)
//   { type: 'credit', what, reward }     — период или событие кончились: несобранные награды начислены
//   { type: 'new', kind, first }         — новые задания дня, недели, месяца
//   { type: 'eventStart', ev }           — началось событие
//
// Состояние st.quests:
//   done  { id: 1 }        — сданные задания веток
//   prog  { id: [n, …] }   — счётчики целей открытых заданий веток (по одной на цель)
//   told  { id: 1 }        — о выполнении уже сказали (тост был)
//   pins  [id, …]          — задания, которые игрок закрепил на экране (до MAX_PINS, по порядку)
//   seen                   — последнее задание сюжета, текст которого игрок видел
//   per   { day|week|month: { k, list: [{ t, key?, n, p, r, got?, told? }], bonus, btold, swap } }
//   ev    { 'ghost:2026': { done, prog, told, prize, ptold } | { end: 1 } }
//
// «Вид» задания (view) — то, что показывает окно и карточка: { id, kind, title, who, text, task, goals, goal,
// reward, done, claimed, frac, … }. goals — цели с прогрессом p, goal — первая невыполненная (для стрелки).

import { LINES, QUESTS, QUEST_XP, PERIODIC_LEVEL, OLD_ORDER, OLD_TITLES, PERIODS, EVENTS, MAX_PINS } from './questData.js';
import { CROPS, FISH, FLORA, FLORA_GOODS, ITEMS } from './data.js';
import { addItem } from './inventory.js';

const H = 3600e3;

export const LINE = Object.fromEntries(LINES.map((l) => [l.key, l]));
// id задания ветки → { q, line, idx }
export const QUEST_BY_ID = {};
for (const L of LINES) QUESTS[L.key].forEach((q, idx) => { QUEST_BY_ID[q.id] = { q, line: L.key, idx }; });

export const goalsOf = (q) => q.goals || [q.goal];

// Группы ключей для целей { group }: «продай 10 рыб», «купи 5 пакетов семян»
export const GROUPS = {
  fish: (k) => !!FISH[k],
  crop: (k) => !!CROPS[k],
  seed: (k) => !!(ITEMS[k] && ITEMS[k].seedOf),
  fruit: (k) => !!FLORA_GOODS[k],
  // плодовые и ягодные: саженец из магазина (sap_<вид>) или посаженный вид
  orchard: (k) => { const f = FLORA[k.startsWith('sap_') ? k.slice(4) : k]; return !!(f && f.pick); },
};

export function matches(g, ev, key) {
  if (!g.ev || g.ev !== ev) return false;
  if (g.key && g.key !== key) return false;
  if (g.group && !(key && GROUPS[g.group] && GROUPS[g.group](key))) return false;
  return true;
}

// ---------------- Состояние и перенос старых сохранений ----------------

export function questState(st) {
  if (!st.quests) {
    st.quests = { done: {}, prog: {}, told: {}, pins: [], seen: null, per: {}, ev: {} };
    if (st.quest) migrateOld(st);
  }
  const Q = st.quests;
  if (!Q.pins) { Q.pins = Q.pin ? [Q.pin] : []; delete Q.pin; } // одно закреплённое задание (первая версия)
  return Q;
}

// Старое сохранение: одна цепочка st.quest = { i, n, t, told, seen } (t — название текущего задания).
// Всё, что было до текущего, — сдано. Текущее остаётся текущим в своей ветке со своим счётчиком:
// новые задания, вставленные в ветку перед ним, засчитываются сданными, чтобы не отодвигать его.
export function migrateOld(st) {
  const o = st.quest, Q = st.quests;
  let i = Math.max(0, o.i | 0);
  if (o.t) { const j = OLD_TITLES.indexOf(o.t); if (j >= 0) i = j; }
  i = Math.min(i, OLD_ORDER.length);
  for (let k = 0; k < i; k++) Q.done[OLD_ORDER[k]] = 1;
  if (i < OLD_ORDER.length) {
    const id = OLD_ORDER[i], ref = QUEST_BY_ID[id];
    for (const q of QUESTS[ref.line].slice(0, ref.idx)) Q.done[q.id] = 1;
    if (o.n > 0) Q.prog[id] = [o.n];
    if (o.told) Q.told[id] = 1;
    if (o.seen) Q.seen = id;
  }
  delete st.quest;
}

function life(st) {
  const s = st.stats || (st.stats = { cleared: 0, harvested: 0 });
  return s.ev || (s.ev = { harvest: s.harvested || 0 });
}

// ---------------- Ветки ----------------

// Где сейчас ветка: 'open' — есть задание (q, idx), 'lock' — ветка закрыта до задания after,
// 'level' — следующее задание ждёт уровня q.level, 'end' — всё сдано
export function lineState(st, key) {
  const Q = questState(st), L = LINE[key];
  if (L.after && !Q.done[L.after]) return { line: L, status: 'lock', after: QUEST_BY_ID[L.after].q };
  const list = QUESTS[key];
  for (let idx = 0; idx < list.length; idx++) {
    const q = list[idx];
    if (Q.done[q.id]) continue;
    return { line: L, status: q.level && st.level < q.level ? 'level' : 'open', q, idx };
  }
  return { line: L, status: 'end' };
}

function goalView(st, g, n0, all) {
  let p;
  if (g.state) p = st[g.state] || 0;
  else {
    p = n0 || 0;
    if (all) { const L = life(st); p = Math.max(p, L[g.key ? g.ev + ':' + g.key : g.ev] || 0); }
  }
  return { ...g, p: Math.min(g.n, p) };
}

function makeView(base, goals, claimed) {
  const done = goals.every((g) => g.p >= g.n);
  const frac = goals.reduce((s, g) => s + g.p / g.n, 0) / goals.length;
  return { ...base, goals, goal: goals.find((g) => g.p < g.n) || goals[0], done, frac, claimed: !!claimed };
}

const withXp = (r, xp) => (r.xp != null ? r : { ...r, xp });

function questView(st, q, prog, base) {
  const goals = goalsOf(q).map((g, i) => ({ ...goalView(st, g, prog && prog[i], q.life), task: g.task || q.task }));
  return makeView({ id: q.id, title: q.title, who: q.who || null, text: q.text || null, task: q.task || goals.map((g) => g.task).join(', '), reward: withXp(q.reward, QUEST_XP), ...base }, goals);
}

function lineView(st, ls) {
  const { q, idx, line } = ls;
  return questView(st, q, questState(st).prog[q.id], { kind: 'line', line: line.key, idx, icon: line.key === 'story' ? (q.who === 'note' ? 'note' : 'star') : line.icon });
}

// Все ветки для окна: состояние и задание (view), если открыто
export function lineRows(st) {
  return LINES.map((L) => {
    const ls = lineState(st, L.key);
    return { ...ls, view: ls.status === 'open' ? lineView(st, ls) : null };
  });
}

// ---------------- День, неделя, месяц ----------------

const pad = (n) => String(n).padStart(2, '0');
const ymd = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

// Ключ периода по местному времени tz: день '2026-11-07', неделя — её понедельник, месяц '2026-11'.
// Ключи одного вида сравниваются как строки: больший — более поздний период.
export function periodKey(kind, now, tz) {
  const d = new Date(now + tz * H), Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate();
  if (kind === 'month') return `${Y}-${pad(M + 1)}`;
  if (kind === 'week') return ymd(Date.UTC(Y, M, D - (d.getUTCDay() + 6) % 7));
  return ymd(Date.UTC(Y, M, D));
}

// Когда начнётся следующий период (мс)
export function nextReset(kind, now, tz) {
  const d = new Date(now + tz * H), Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate();
  if (kind === 'month') return Date.UTC(Y, M + 1, 1) - tz * H;
  if (kind === 'week') return Date.UTC(Y, M, D - (d.getUTCDay() + 6) % 7 + 7) - tz * H;
  return Date.UTC(Y, M, D + 1) - tz * H;
}

// Круглые числа целей: 7, 15, 60, 340, 2400
function niceN(v) {
  const s = v < 20 ? 1 : v < 100 ? 5 : v < 1000 ? 10 : 50;
  return Math.max(1, Math.round(v / s) * s);
}
const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);

function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function poolFor(st, kind) {
  const Q = questState(st);
  return PERIODS[kind].pool.filter((t) => (!t.need || Q.done[t.need]) && (!t.level || st.level >= t.level));
}

function makeItem(st, kind, t, rng) {
  const T = PERIODS[kind], it = { t: t.id, n: niceN(t.n[0] + t.n[1] * (st.level - 1)), p: 0 };
  if (t.goal.key === 'crop') {
    // культура, которая уже открыта и растёт не дольше часа
    const crops = Object.values(CROPS).filter((c) => c.level <= st.level && c.time <= 3600);
    it.key = crops[Math.floor(rng() * crops.length)].key;
  }
  it.r = { xp: T.xp };
  if (t.coins) it.r.coins = round5(it.n * t.coins);
  if (t.gems) it.r.gems = t.gems;
  return it;
}

function genPeriod(st, kind, k, rng) {
  const T = PERIODS[kind];
  return { k, list: shuffled(poolFor(st, kind), rng).slice(0, T.count).map((t) => makeItem(st, kind, t, rng)), bonus: 0, swap: 0 };
}

function itemGoal(t, it) {
  const g = { ev: t.goal.ev, n: it.n };
  if (it.key) g.key = it.key; else if (t.goal.key) g.key = t.goal.key;
  if (t.goal.group) g.group = t.goal.group;
  return g;
}

// Форма слова для числа: plural(1|2|5, ['рыбу', 'рыбы', 'рыб'])
export function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
}

function itemTask(t, it) {
  return t.task.replace('{n}', it.n)
    .replace('{name}', it.key && CROPS[it.key] ? CROPS[it.key].name.toLowerCase() : '')
    .replace(/\{([^{}]*\|[^{}]*)\}/g, (_, f) => plural(it.n, f.split('|')));
}

export function periodViews(st, kind) {
  const P = questState(st).per[kind];
  if (!P) return [];
  const T = PERIODS[kind], out = [];
  P.list.forEach((it, i) => {
    const t = T.pool.find((x) => x.id === it.t);
    if (!t) return; // шаблон убрали из таблицы
    const g = itemGoal(t, it), task = itemTask(t, it);
    out.push(makeView({ id: kind + ':' + i, kind, idx: i, title: T.title, task, reward: it.r, icon: T.icon }, [{ ...g, p: Math.min(it.n, it.p), task }], it.got));
  });
  const n = out.filter((v) => v.done).length;
  out.push(makeView({ id: kind + ':bonus', kind, bonus: true, title: T.title, task: T.bonusTask, reward: T.bonus, icon: 'gem' }, [{ n: out.length, p: n, task: T.bonusTask }], P.bonus));
  return out;
}

// Заменить задание дня на другое (не больше T.swaps раз за период)
export function swap(st, id, ctx) {
  const [kind, i] = id.split(':'), T = PERIODS[kind], P = T && questState(st).per[kind];
  if (!P || !T.swaps || P.swap >= T.swaps) return false;
  const it = P.list[i];
  if (!it || it.got || it.p >= it.n) return false;
  const used = new Set(P.list.map((x) => x.t)), ok = poolFor(st, kind).filter((t) => !used.has(t.id));
  if (!ok.length) return false;
  P.list[i] = makeItem(st, kind, ok[Math.floor(ctx.rng() * ok.length)], ctx.rng);
  P.swap++;
  return true;
}

export const swapsLeft = (st, kind) => { const P = questState(st).per[kind]; return P && PERIODS[kind].swaps ? PERIODS[kind].swaps - P.swap : 0; };

// ---------------- События ----------------

// Окно события в году y: с from 00:00 до конца дня to (по tz); to раньше from — кончается в следующем году
function eventWindow(ev, now, tz) {
  const Y = new Date(now + tz * H).getUTCFullYear();
  const [fm, fd] = ev.from.split('-').map(Number), [tm, td] = ev.to.split('-').map(Number);
  for (const y of [Y - 1, Y]) {
    const start = Date.UTC(y, fm - 1, fd) - tz * H;
    const end = Date.UTC(tm < fm || (tm === fm && td < fd) ? y + 1 : y, tm - 1, td + 1) - tz * H;
    if (now >= start && now < end) return { year: y, start, end };
  }
  return null;
}

// События, которые идут сейчас: [{ ev, key, end }]. ctx.force — id события для проверки (настройки разработчика)
export function activeEvents(ctx) {
  const out = [];
  for (const ev of EVENTS) {
    if (ctx.force === ev.id) { out.push({ ev, key: ev.id + ':dev', end: null }); continue; }
    const w = eventWindow(ev, ctx.now, ctx.tz);
    if (w) out.push({ ev, key: ev.id + ':' + w.year, end: w.end });
  }
  return out;
}

// Задания события: chain — все по порядку ({ q, state: 'done' | 'cur' | 'next' }), cur — текущее, prize — главный приз
function eventInfo(st, ev, key) {
  const E = questState(st).ev[key];
  if (!E || E.end) return null;
  let cur = null, n = 0;
  const chain = ev.quests.map((q, idx) => {
    if (E.done[q.id]) { n++; return { q, state: 'done' }; }
    if (cur) return { q, state: 'next' };
    cur = questView(st, q, E.prog[q.id], { kind: 'event', ev: ev.id, key, idx, icon: ev.icon, text: q.text || ev.text });
    return { q, state: 'cur', view: cur };
  });
  const prize = makeView({ id: 'ev:' + key + ':prize', kind: 'event', ev: ev.id, key, bonus: true, title: ev.name, task: 'Выполни все задания события', reward: ev.prize, icon: ev.icon },
    [{ n: ev.quests.length, p: n, task: 'Выполни все задания события' }], E.prize);
  return { ev, key, cur, chain, prize };
}

export function eventRows(st, ctx) {
  if (st.level < PERIODIC_LEVEL) return [];
  return activeEvents(ctx).map((a) => { const e = eventInfo(st, a.ev, a.key); return e && { ...e, end: a.end }; }).filter(Boolean);
}

// ---------------- Все задания ----------------

export function views(st, ctx) {
  const out = [];
  for (const r of lineRows(st)) if (r.view) out.push(r.view);
  if (st.level >= PERIODIC_LEVEL) {
    for (const kind of Object.keys(PERIODS)) out.push(...periodViews(st, kind));
    for (const e of eventRows(st, ctx)) { if (e.cur) out.push(e.cur); out.push(e.prize); }
  }
  return out;
}

// Карточки на экране: закреплённые игроком (по порядку), потом сюжет, если осталось место (всего до MAX_PINS).
// Ничего не закреплено и сюжета нет — одна карточка: готовое к сдаче → то, что было (prev) → ближе всех к концу.
export function cards(st, vs, prev) {
  const Q = questState(st), open = vs.filter((v) => !v.claimed && !v.bonus);
  const out = Q.pins.map((id) => open.find((v) => v.id === id)).filter(Boolean).slice(0, MAX_PINS);
  const story = open.find((v) => v.line === 'story');
  if (story && out.length < MAX_PINS && !out.includes(story)) out.push(story);
  if (out.length) return out;
  const one = open.find((v) => v.done) || open.find((v) => v.id === prev) ||
    open.reduce((b, v) => (!b || v.frac > b.frac ? v : b), null) || vs.find((v) => v.done && !v.claimed); // остался только бонус
  return one ? [one] : [];
}

export const isPinned = (st, id) => questState(st).pins.includes(id);

// Закрепить задание на экране (on) или снять. Закреплённые, которых больше нет (кончился день, событие), не мешают:
// они вычищаются. Возвращает false, если на экране уже MAX_PINS заданий.
export function setPin(st, id, on, ctx) {
  const Q = questState(st), live = new Set(views(st, ctx).filter((v) => !v.claimed).map((v) => v.id));
  Q.pins = Q.pins.filter((x) => live.has(x) && x !== id);
  if (!on) return true;
  if (Q.pins.length >= MAX_PINS) return false;
  Q.pins.push(id);
  return true;
}

export const claimable = (vs) => vs.filter((v) => v.done && !v.claimed).length;

// Где помнится «о выполнении сказали»
function toldRef(st, v) {
  const Q = questState(st);
  if (v.kind === 'line') return [Q.told, v.id];
  if (v.kind === 'event') { const E = Q.ev[v.key]; return v.bonus ? [E, 'ptold'] : [E.told, v.id]; }
  const P = Q.per[v.kind];
  return v.bonus ? [P, 'btold'] : [P.list[v.idx], 'told'];
}

// После любого изменения: какие задания стали выполненными (о каждом — одно событие 'done')
export function check(st, ctx) {
  const out = [];
  for (const v of views(st, ctx)) {
    if (!v.done || v.claimed) continue;
    const [o, k] = toldRef(st, v);
    if (o[k]) continue;
    o[k] = 1;
    out.push({ type: 'done', view: v });
  }
  return out;
}

// Событие игры: ev — тип, key — уточнение (культура, рыба, вид дерева, товар), n — сколько
export function onEvent(st, ev, key, n, ctx) {
  const L = life(st), Q = questState(st);
  L[ev] = (L[ev] || 0) + n;
  if (key) L[ev + ':' + key] = (L[ev + ':' + key] || 0) + n;
  const count = (q, prog) => goalsOf(q).forEach((g, i) => {
    if (!matches(g, ev, key)) return;
    const p = prog[q.id] || (prog[q.id] = []);
    p[i] = Math.min(g.n, (p[i] || 0) + n);
  });
  for (const r of lineRows(st)) if (r.status === 'open') count(r.q, Q.prog);
  if (st.level >= PERIODIC_LEVEL) {
    for (const kind of Object.keys(PERIODS)) {
      const P = Q.per[kind];
      if (!P) continue;
      for (const it of P.list) {
        const t = PERIODS[kind].pool.find((x) => x.id === it.t);
        if (t && !it.got && it.p < it.n && matches(itemGoal(t, it), ev, key)) it.p = Math.min(it.n, it.p + n);
      }
    }
    for (const e of eventRows(st, ctx)) if (e.cur) count(e.ev.quests[e.cur.idx], Q.ev[e.key].prog);
  }
  return check(st, ctx);
}

export function applyReward(st, r) {
  st.coins += r.coins || 0;
  st.gems += r.gems || 0;
  for (const [id, n] of Object.entries(r.items || {})) addItem(st, id, n);
}

function addReward(sum, r) {
  for (const k of ['coins', 'gems', 'xp']) if (r[k]) sum[k] = (sum[k] || 0) + r[k];
  for (const [id, n] of Object.entries(r.items || {})) (sum.items || (sum.items = {}))[id] = (sum.items[id] || 0) + n;
  return sum;
}

// Забрать награду. Опыт (reward.xp) начисляет Farm: от него бывает новый уровень с окном и звуком.
// next — следующее задание этой же ветки или события (окно покажет его), events — что выполнилось заодно.
export function claim(st, id, ctx) {
  const Q = questState(st), v = views(st, ctx).find((x) => x.id === id);
  if (!v || !v.done || v.claimed) return null;
  applyReward(st, v.reward);
  let next = null;
  if (v.kind === 'line') {
    Q.done[id] = 1; delete Q.prog[id]; delete Q.told[id];
    const ls = lineState(st, v.line);
    next = ls.status === 'open' ? ls.q.id : null;
  } else if (v.kind === 'event') {
    const E = Q.ev[v.key];
    if (v.bonus) E.prize = 1;
    else { E.done[id] = 1; delete E.prog[id]; delete E.told[id]; const e = eventInfo(st, EVENTS.find((x) => x.id === v.ev), v.key); next = e.cur ? e.cur.id : null; }
  } else if (v.bonus) Q.per[v.kind].bonus = 1;
  else Q.per[v.kind].list[v.idx].got = 1;
  // закреплённое задание сменяется следующим в той же ветке (или снимается)
  const pi = Q.pins.indexOf(id);
  if (pi >= 0) { if (next && !Q.pins.includes(next)) Q.pins[pi] = next; else Q.pins.splice(pi, 1); }
  return { view: v, reward: v.reward, next, events: check(st, ctx) };
}

// Период или событие кончились: выполненное, но не забранное, начисляется само
function credit(st, vs) {
  let sum = null;
  for (const v of vs) if (v && v.done && !v.claimed) { applyReward(st, v.reward); sum = addReward(sum || {}, v.reward); }
  return sum;
}

// Раз в секунду и при входе: не начался ли новый день, неделя, месяц, не началось ли и не кончилось ли событие
export function refresh(st, ctx) {
  const Q = questState(st), out = [];
  if (st.level < PERIODIC_LEVEL) return out;
  for (const kind of Object.keys(PERIODS)) {
    const k = periodKey(kind, ctx.now, ctx.tz), P = Q.per[kind];
    if (P && P.k >= k) continue; // тот же период (или часы на телефоне перевели назад)
    if (P) { const r = credit(st, periodViews(st, kind)); if (r) out.push({ type: 'credit', what: PERIODS[kind].title, reward: r }); }
    Q.per[kind] = genPeriod(st, kind, k, ctx.rng);
    out.push({ type: 'new', kind, first: !P });
  }
  const act = activeEvents(ctx);
  for (const a of act) {
    if (Q.ev[a.key]) continue;
    Q.ev[a.key] = { done: {}, prog: {}, told: {}, prize: 0 };
    out.push({ type: 'eventStart', ev: a.ev });
  }
  for (const key of Object.keys(Q.ev)) {
    if (Q.ev[key].end || act.some((a) => a.key === key)) continue;
    const ev = EVENTS.find((x) => x.id === key.split(':')[0]);
    let e = ev && eventInfo(st, ev, key), r = null;
    if (e && e.cur && e.cur.done) {
      // последнее задание выполнено, но не забрано: засчитываем — тогда может быть готов и главный приз
      r = credit(st, [e.cur]);
      Q.ev[key].done[e.cur.id] = 1;
      e = eventInfo(st, ev, key);
    }
    if (e) { const p = credit(st, [e.prize]); if (p) r = addReward(r || {}, p); }
    if (r) out.push({ type: 'credit', what: ev.name, reward: r });
    Q.ev[key] = { end: 1 };
  }
  out.push(...check(st, ctx));
  return out;
}
