// Правила рыбалки: чистые функции над состоянием фермы st (без DOM, звуков, Date.now и Math.random).
// Время и случайность приходят снаружи: ctx = { now (мс), rng } — как у заданий. Потом эти же функции выполнит сервер.
// Энергию на заброс, рыбу в рюкзак, опыт и счётчики заданий добавляет игра (Farm.perform, случай 'fish').
//
// Клёв (удочка по уровням — ROD в fishData.js): поклёвок в запасе не больше bites, новая приходит каждые
// regen секунд. Состояние st.fish = { n, t }: n — поклёвок на момент t (мс). Нет st.fish — запас полный.
// Пока запас полный, отсчёт стоит; первый заброс из полного запаса запускает его с этого момента.
//
// Наживка (BAITS в fishData.js): st.bait — какую выбрали в окне пруда (выбор запоминается, даже когда она
// кончилась: купили ещё — ловится на неё снова). Заброс тратит одну наживку и решает, кто клюнет. Крупной рыбе
// нужна удочка не хуже FISH[].rod: со слабой она клюёт, но срывается. Лавка домика рыболова — buyBait.

import { FISH, ITEMS } from './data.js';
import { ROD, BAITS, BAIT_SHOP, FISHER } from './fishData.js';
import { toolLevel } from './toolRules.js';
import { isBuilt } from './buildRules.js';
import * as Inv from './inventory.js';

const MS = 1000;

// ---------------- Удочка и клёв ----------------

export const rodLevel = (st) => toolLevel(st, 'rod');
// Что даёт удочка на уровне lv (по умолчанию — нынешнем): { bites, regen (сек), hold }
export function rod(st, lv = rodLevel(st)) {
  return { bites: ROD.bites[lv - 1], regen: ROD.regen[lv - 1], hold: ROD.hold[lv - 1] };
}

// Запас на момент now: { n, t } — поклёвок и с какого момента считается следующая
function calc(st, now) {
  const R = rod(st), max = R.bites, per = R.regen * MS, F = st.fish;
  if (!F || F.n >= max) return { n: max, t: now };
  const t = Math.min(F.t, now); // часы перевели назад — не даём лишних поклёвок, но и не отнимаем
  const k = Math.floor((now - t) / per);
  const n = Math.min(max, F.n + k);
  return n >= max ? { n: max, t: now } : { n, t: t + k * per };
}

// Для окна пруда: n из max поклёвок, next — когда придёт следующая (мс), null — запас полный
export function bitesView(st, now) {
  const c = calc(st, now), R = rod(st);
  return { n: c.n, max: R.bites, next: c.n < R.bites ? c.t + R.regen * MS : null };
}

// ---------------- Наживка ----------------

// Кто клюёт на наживку bait (null — без наживки): { рыба: вес }
export function poolOf(bait) {
  if (bait && BAITS[bait]) return BAITS[bait].pool;
  const out = {};
  for (const f of Object.values(FISH)) if (f.chance > 0) out[f.key] = f.chance;
  return out;
}

// Шанс, что рыба не сорвётся: удочка + наживка (червяки держат лучше)
export function holdChance(st, bait, lv = rodLevel(st)) {
  return Math.min(0.95, ROD.hold[lv - 1] + ((bait && BAITS[bait] && BAITS[bait].hold) || 0));
}

// Выбранная наживка, если она есть в рюкзаке (иначе ловим без наживки): id или null
export function baitOf(st) {
  const b = st.bait;
  return b && BAITS[b] && st.items && Inv.count(st, b) > 0 ? b : null;
}

// Выбрать наживку (null — без наживки). → true, если такая бывает
export function setBait(st, bait) {
  if (bait && !BAITS[bait]) return false;
  if (bait) st.bait = bait; else delete st.bait;
  return true;
}

// Что поймаешь на наживку bait удочкой уровня lv: [{ fish, p, big }] — p — шанс поймать её за заброс,
// big — рыба клюёт, но эта удочка её не удержит (p = 0). Для окна выбора наживки и лавки.
export function odds(st, bait, lv = rodLevel(st)) {
  const pool = poolOf(bait), total = Object.values(pool).reduce((s, w) => s + w, 0), hold = holdChance(st, bait, lv);
  return Object.entries(pool).map(([fish, w]) => {
    const big = FISH[fish].rod > lv;
    return { fish, p: big ? 0 : (hold * w) / total, big };
  });
}

// Какая рыба клюнула: по весам pool ({ рыба: вес }), rng() — от 0 до 1
export function pickFish(rng, pool = poolOf(null)) {
  const list = Object.entries(pool).filter(([, w]) => w > 0), total = list.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of list) { if ((r -= w) < 0) return k; }
  return list[list.length - 1][0];
}

// ---------------- Заброс ----------------

// Заброс: тратит поклёвку и наживку (выбранную и если она есть). Возвращает null — поклёвок нет (рыбачить
// нельзя); иначе { fish, bait, big? }: fish — пойманная рыба (в рюкзак её кладёт игра) или null — сорвалась;
// bait — на какую наживку ловили (null — без наживки); big — клюнула крупная рыба, но удочка слабая.
export function cast(st, ctx) {
  const c = calc(st, ctx.now);
  if (c.n <= 0) return null;
  st.fish = { n: c.n - 1, t: c.t };
  const bait = baitOf(st);
  if (bait) Inv.takeItem(st, bait, 1);
  if (ctx.rng() >= holdChance(st, bait)) return { fish: null, bait };
  const fish = pickFish(ctx.rng, poolOf(bait));
  if (FISH[fish].rod > rodLevel(st)) return { fish: null, bait, big: fish };
  return { fish, bait };
}

// ---------------- Лавка домика рыболова ----------------

export const shopOffer = (id) => BAIT_SHOP.find((o) => o.item === id) || null;

// Можно ли купить наживку id в лавке: null или причина
export function buyBlock(st, id, now) {
  const o = shopOffer(id);
  if (!o || !ITEMS[id]) return 'Такой наживки в лавке нет';
  if (!isBuilt(st, FISHER, now)) return 'Наживку продают в домике рыболова: сначала постройте его';
  if (st.level < o.level) return `Откроется с ${o.level} уровня`;
  if (st.coins < o.price) return 'Не хватает монет';
  return null;
}

// Купить пачку наживки id. → { id, n, cost, cur } или { why }
export function buyBait(st, id, now) {
  const why = buyBlock(st, id, now);
  if (why) return { why };
  return Inv.buyItem(st, shopOffer(id), 1) || { why: 'Не получилось купить' };
}
