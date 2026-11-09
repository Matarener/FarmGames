// Правила рыбалки: чистые функции над состоянием фермы st (без DOM, звуков, Date.now и Math.random).
// Время и случайность приходят снаружи: ctx = { now (мс), rng } — как у заданий. Потом эти же функции выполнит сервер.
// Энергию на заброс, рыбу в рюкзак, опыт и счётчики заданий добавляет игра (Farm.perform, случай 'fish').
//
// Клёв (FISHING в data.js): поклёвок в запасе не больше bites, новая приходит каждые regen секунд.
// Состояние st.fish = { n, t }: n — поклёвок на момент t (мс). Нет st.fish — запас полный.
// Пока запас полный, отсчёт стоит; первый заброс из полного запаса запускает его с этого момента.

import { FISH, FISH_CATCH, FISHING } from './data.js';

const MS = 1000;

// Запас на момент now: { n, t } — поклёвок и с какого момента считается следующая
function calc(st, now) {
  const max = FISHING.bites, per = FISHING.regen * MS, F = st.fish;
  if (!F || F.n >= max) return { n: max, t: now };
  const t = Math.min(F.t, now); // часы перевели назад — не даём лишних поклёвок, но и не отнимаем
  const k = Math.floor((now - t) / per);
  const n = Math.min(max, F.n + k);
  return n >= max ? { n: max, t: now } : { n, t: t + k * per };
}

// Для окна пруда: n из max поклёвок, next — когда придёт следующая (мс), null — запас полный
export function bitesView(st, now) {
  const c = calc(st, now), max = FISHING.bites;
  return { n: c.n, max, next: c.n < max ? c.t + FISHING.regen * MS : null };
}

// Какая рыба клюнула: по весам chance, rng() — от 0 до 1
export function pickFish(rng) {
  const list = Object.values(FISH), total = list.reduce((s, f) => s + f.chance, 0);
  let r = rng() * total;
  for (const f of list) { if ((r -= f.chance) < 0) return f.key; }
  return list[list.length - 1].key;
}

// Заброс: тратит поклёвку. Возвращает null — поклёвок нет (рыбачить нельзя),
// { fish: null } — сорвалась, { fish: 'fish_carp' … } — поймали (в рюкзак её кладёт игра)
export function cast(st, ctx) {
  const c = calc(st, ctx.now);
  if (c.n <= 0) return null;
  st.fish = { n: c.n - 1, t: c.t };
  if (ctx.rng() >= FISH_CATCH) return { fish: null };
  return { fish: pickFish(ctx.rng) };
}
