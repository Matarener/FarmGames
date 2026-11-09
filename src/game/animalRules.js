// Правила животных: чистые функции над состоянием фермы st и миром w (без DOM, звуков и Date.now — время now
// приходит снаружи), чтобы потом их же выполнял сервер. Эффекты (прыжок, брызги, «+1», окна) делает animals.js.
//
// Таблицы — animalData.js. Животное — своя постройка на карте (placed.js): тип объекта — стадия
// (animal_<вид>_baby, animal_<вид>_young, animal_<вид>), а своё состояние — в o.data (в сохранении — в записи
// st.placed): { f — сколько раз покормили на этой стадии, t — когда доест (мс; 0 — не ест), r — 1: продукт готов }.
// Убрали в рюкзак — состояние уходит в st.animalBag[тип] (очередь), поставили такое же из рюкзака — оно возвращается:
// животное помнит, сколько его кормили, и даже ест дальше.
//
// Что с животным сейчас (stateOf): 'hungry' — ждёт корма; 'eating' — ест (до t); 'ready' — взрослое, продукт
// готов. Доел (t прошло) — это отмечает settle: детёныш и молодое считают кормление и, может, подрастают
// (тип объекта меняется на следующую стадию), взрослое — готовит продукт.

import { ANIMALS, FEED_XP, GROW_XP, animalType } from './animalData.js';
import { GEM_SPEEDUP_SEC } from './data.js';
import * as Inv from './inventory.js';
import { registerPlaced, retype, touch } from './placed.js';

const S = 1000;

// Тип объекта → { sp (вид), stage (0 — детёныш, 1 — молодое, 2 — взрослое) }
export const STAGE_OF = {};
for (const a of Object.values(ANIMALS)) for (let i = 0; i < 3; i++) STAGE_OF[animalType(a.key, i)] = { sp: a.key, stage: i };

export const isAnimal = (o) => !!(o && STAGE_OF[o.type]);
export const infoOf = (type) => STAGE_OF[type] || null;
const fresh = () => ({ f: 0, t: 0 });
const dataOf = (o) => o.data || (o.data = fresh());

// Что с животным сейчас (без settle: доевшее, но ещё не отмеченное, — уже не 'eating')
export function stateOf(o, now) {
  const d = dataOf(o);
  if (d.r) return 'ready';
  if (d.t && d.t > now) return 'eating';
  return d.t ? 'done' : 'hungry';
}

// Сколько секунд ещё есть (0 — не ест)
export const eatLeft = (o, now) => Math.max(0, ((dataOf(o).t || 0) - now) / S);

// Доля съеденного 0..1 (полоска над животным)
export function eatPart(o, now) {
  const i = infoOf(o.type), d = dataOf(o);
  if (!i || !d.t || d.t <= now) return 1;
  const dur = ANIMALS[i.sp].time[i.stage] * S;
  return Math.max(0, Math.min(1, 1 - (d.t - now) / dur));
}

// Доело? Отметить: кормление засчитывается, детёныш и молодое могут подрасти, взрослое — готовит продукт.
// → null (ничего не случилось) или { o, sp, fed?, grew? (новая стадия), ready? }
export function settle(st, w, o, now) {
  const i = infoOf(o.type), d = dataOf(o);
  if (!i || !d.t || d.t > now) return null;
  const a = ANIMALS[i.sp];
  d.t = 0;
  if (i.stage >= 2) { d.r = 1; return { o, sp: i.sp, ready: true }; }
  d.f = (d.f || 0) + 1;
  if (d.f < a.feeds[i.stage]) return { o, sp: i.sp, fed: true };
  d.f = 0;
  retype(st, w, o, animalType(i.sp, i.stage + 1));
  return { o, sp: i.sp, grew: i.stage + 1, xp: GROW_XP[i.stage + 1] || 0 };
}

// Раз в секунду и при входе: кто доел. → [{ o, sp, fed?, grew?, ready? }]
export function tick(st, w, now) {
  const out = [];
  for (const o of w.objects) {
    if (!isAnimal(o)) continue;
    const e = settle(st, w, o, now);
    if (e) out.push(e);
  }
  return out;
}

// Можно ли покормить: null или причина { why, noFeed? }
export function feedBlock(st, o, now) {
  const i = infoOf(o && o.type);
  if (!i) return { why: 'Это не животное' };
  const a = ANIMALS[i.sp], s = stateOf(o, now);
  if (s === 'eating') return { why: `${a.names[i.stage]} ещё ест` };
  if (s === 'ready') return { why: 'Сначала заберите, что оно дало' };
  if (!Inv.count(st, a.feed)) return { why: 'Нет корма', noFeed: true };
  return null;
}

// Покормить: один корм уходит из рюкзака, животное ест time[стадия] секунд. → { feed, end, xp } или { why, noFeed? }
export function feed(st, w, o, now) {
  settle(st, w, o, now);
  const why = feedBlock(st, o, now);
  if (why) return why;
  const i = infoOf(o.type), a = ANIMALS[i.sp];
  Inv.takeItem(st, a.feed, 1);
  const d = dataOf(o);
  d.t = now + a.time[i.stage] * S;
  touch(st, o); // у записи могло не быть данных (например, старое сохранение) — теперь они там
  return { feed: a.feed, end: d.t, xp: FEED_XP };
}

// Забрать продукт у взрослого: в рюкзак product × n, животное снова голодное. → { id, n, xp } или null (нечего) /
// { why } (рюкзак полон)
export function collect(st, w, o, now) {
  settle(st, w, o, now);
  const i = infoOf(o && o.type), d = o && dataOf(o);
  if (!i || !d.r) return null;
  const a = ANIMALS[i.sp], got = Inv.addItem(st, a.product, a.n);
  if (!got) return { why: 'Рюкзак полон' };
  d.r = 0;
  return { id: a.product, n: got, xp: a.xp || 0 };
}

// Ускорить за кристаллы: доест сейчас (1 кристалл за GEM_SPEEDUP_SEC, не меньше 1, как у грядок и зданий)
export const gemsFor = (sec) => Math.max(1, Math.ceil(sec / GEM_SPEEDUP_SEC));

// → результат settle (подросло, продукт готов…) и { gems } или null (не ест, не хватает кристаллов)
export function speed(st, w, o, now) {
  const left = eatLeft(o, now);
  if (!isAnimal(o) || left <= 0) return null;
  const gems = gemsFor(left);
  if (st.gems < gems) return null;
  st.gems -= gems;
  dataOf(o).t = now;
  return { ...(settle(st, w, o, now) || {}), gems };
}

// Для окна и подсказок: что с животным. → { sp, a, stage, name, state, left (сек), fed, need (кормлений до
// следующей стадии; у взрослого 0), feed, product }
export function view(o, now) {
  const i = infoOf(o && o.type);
  if (!i) return null;
  const a = ANIMALS[i.sp], d = dataOf(o);
  return {
    sp: i.sp, a, stage: i.stage, name: a.names[i.stage], state: stateOf(o, now), left: eatLeft(o, now),
    fed: d.f || 0, need: i.stage < 2 ? a.feeds[i.stage] : 0, feed: a.feed, product: a.product,
  };
}

// ---------------- На карте и в рюкзаке (placed.js) ----------------
// Поставили из рюкзака — состояние берётся из очереди этого типа (если животное раньше убирали), иначе новое.
// Убрали — состояние в очередь. Лишнее в очереди (предметов этого типа меньше) отбрасывается.
for (const type of Object.keys(STAGE_OF)) {
  registerPlaced(type, {
    onPlace: (st, id, o) => {
      const B = st.animalBag && st.animalBag[type];
      o.data = (B && B.shift()) || fresh();
      if (B && B.length > Inv.count(st, id)) B.length = Inv.count(st, id);
      if (B && !B.length) { delete st.animalBag[type]; if (!Object.keys(st.animalBag).length) delete st.animalBag; }
    },
    onStore: (st, o) => {
      if (!o.data) return;
      const B = (st.animalBag || (st.animalBag = {}));
      (B[type] || (B[type] = [])).push(o.data);
    },
  });
}

// Сколько животных на ферме (на карте): { всего, по видам { вид: n }, взрослых }
export function count(w) {
  const out = { all: 0, adult: 0, by: {} };
  for (const o of w.objects) {
    const i = isAnimal(o) && infoOf(o.type);
    if (!i) continue;
    out.all++; out.by[i.sp] = (out.by[i.sp] || 0) + 1;
    if (i.stage >= 2) out.adult++;
  }
  return out;
}
