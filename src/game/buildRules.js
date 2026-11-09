// Правила зданий с крафтом: чистые функции над состоянием фермы st (без DOM, звуков, Date.now).
// Время приходит снаружи (now, мс), чтобы потом эти же функции выполнял сервер. Эффекты (леса,
// салют, всплывающие «+1», окна) делает buildings.js по возвращённому результату.
//
// Состояние st.builds = { <здание>: { end, done?, q: [[рецепт, start, end], ...] } }
//   end  — когда кончится стройка (мс); done — опыт за постройку уже начислен (здание готово)
//   q    — очередь крафта: товары делаются по одному, следующий начинается, когда кончился предыдущий;
//          готовые лежат в очереди (и занимают место), пока их не заберут
// Где стоит здание — не здесь, а в общем списке своих объектов на карте (placed.js). Здание
// в рюкзаке (bld_<здание>) хранит свою очередь здесь же: время идёт, товары ждут.

import { BUILDINGS, RECIPES, bpId, bldId } from './buildData.js';
import { ITEMS, GEM_SPEEDUP_SEC } from './data.js';
import * as Inv from './inventory.js';

const S = 1000;

export function builds(st) { return st.builds || (st.builds = {}); }
export function rec(st, k) { return builds(st)[k] || null; }

// Здание есть: строится, готово или убрано в рюкзак
export const owned = (st, k) => !!rec(st, k);
export const isBuilt = (st, k, now) => { const r = rec(st, k); return !!r && r.end <= now; };
export const buildLeft = (st, k, now) => { const r = rec(st, k); return r ? Math.max(0, (r.end - now) / S) : 0; };

// Чего не хватает из cost ({ id | coins | gems: сколько }): [{ id, need, have }]
export function missing(st, cost) {
  const out = [];
  for (const [id, need] of Object.entries(cost)) {
    const have = id === 'coins' || id === 'gems' ? st[id] : Inv.count(st, id);
    if (have < need) out.push({ id, need, have });
  }
  return out;
}

function pay(st, cost) {
  for (const [id, n] of Object.entries(cost)) {
    if (id === 'coins' || id === 'gems') st[id] -= n; else Inv.takeItem(st, id, n);
  }
}

// Список вида «5 досок, 2 руды» для причины (предметы — названиями)
const nameOf = (id) => (id === 'coins' ? 'монет' : id === 'gems' ? 'кристаллов' : (ITEMS[id] ? ITEMS[id].name.toLowerCase() : id));
export const missText = (miss) => miss.map((m) => `${nameOf(m.id)}: ${m.need - m.have}`).join(', ');

// ---------------- Чертёж ----------------

// Можно ли купить чертёж здания k: null или причина { why, locked? }
export function blueprintBlock(st, k) {
  const b = BUILDINGS[k];
  if (!b) return { why: 'Такого здания нет' };
  if (st.level < b.level) return { why: `Откроется с ${b.level} уровня`, locked: true };
  if (Inv.count(st, bpId(k))) return { why: 'Чертёж уже в рюкзаке: постройте здание' };
  if (owned(st, k)) return { why: `${b.name} уже есть на ферме` };
  return null;
}

// ---------------- Стройка ----------------

// Можно ли начать стройку здания k по чертежу из рюкзака: null или причина
export function buildBlock(st, k) {
  const b = BUILDINGS[k];
  if (!b) return 'Такого здания нет';
  if (owned(st, k)) return `${b.name} уже есть на ферме`;
  if (!Inv.count(st, bpId(k))) return 'Нет чертежа: купите его на рынке, раздел «Постройки»';
  const miss = missing(st, b.cost);
  if (miss.length) return `Не хватает: ${missText(miss)}`;
  return null;
}

// Начать стройку: чертёж и материалы уходят, здание строится b.time секунд. → { k, end } или null
export function startBuild(st, k, now) {
  if (buildBlock(st, k)) return null;
  const b = BUILDINGS[k];
  Inv.takeItem(st, bpId(k), 1);
  pay(st, b.cost);
  builds(st)[k] = { end: now + b.time * S, q: [] };
  return { k, end: now + b.time * S };
}

// Какие стройки кончились (раз в секунду и при входе): опыт начисляется один раз. → [{ k, xp }]
export function buildTick(st, now) {
  const out = [];
  for (const [k, r] of Object.entries(builds(st))) {
    if (r.done || r.end > now || !BUILDINGS[k]) continue;
    r.done = 1;
    out.push({ k, xp: BUILDINGS[k].xp || 0 });
  }
  return out;
}

// Ускорение за кристаллы: 1 кристалл за GEM_SPEEDUP_SEC секунд (не меньше 1), как у грядок
export const gemsFor = (sec) => Math.max(1, Math.ceil(sec / GEM_SPEEDUP_SEC));

// Достроить сейчас за кристаллы. → { gems } или null (не строится или не хватает кристаллов)
export function speedBuild(st, k, now) {
  const r = rec(st, k), left = buildLeft(st, k, now);
  if (!r || left <= 0) return null;
  const gems = gemsFor(left);
  if (st.gems < gems) return null;
  st.gems -= gems;
  r.end = now;
  return { gems };
}

// Убрать готовое здание в рюкзак можно, стройку — нельзя. null или причина
export function storeBlock(st, k, now) {
  if (!isBuilt(st, k, now)) return 'Здание ещё строится: дождитесь конца стройки';
  return null;
}

// ---------------- Крафт ----------------

// Очередь здания k: [{ r (рецепт), idx, start, end, done, running, k (готовность 0..1), left (сек) }],
// ready — сколько готовых, free — сколько свободных мест
export function queueView(st, k, now) {
  const R = rec(st, k), b = BUILDINGS[k];
  const jobs = (R ? R.q : []).map(([id, start, end], idx) => ({
    r: RECIPES[id], id, idx, start, end, done: end <= now, running: start <= now && end > now,
    k: end <= now ? 1 : start >= now ? 0 : (now - start) / (end - start), left: Math.max(0, (end - now) / S),
  }));
  return { jobs, ready: jobs.filter((j) => j.done).length, free: Math.max(0, (b ? b.slots : 0) - jobs.length) };
}

// Можно ли поставить рецепт id в очередь здания k: null или причина
export function craftBlock(st, k, id, now) {
  const r = RECIPES[id], b = BUILDINGS[k];
  if (!r || !b || r.at !== k) return 'Здесь так не сделать';
  if (!isBuilt(st, k, now)) return `${b.name} ещё строится`;
  if (st.level < r.level) return `Откроется с ${r.level} уровня`;
  if (!queueView(st, k, now).free) return 'Очередь занята: заберите готовое или подождите';
  const miss = missing(st, r.need);
  if (miss.length) return `Не хватает: ${missText(miss)}`;
  return null;
}

// Поставить в очередь: продукты уходят сразу, товар начнёт делаться, когда кончится предыдущий
// (или сейчас). → { id, start, end } или null
export function craft(st, k, id, now) {
  if (craftBlock(st, k, id, now)) return null;
  const r = RECIPES[id], q = rec(st, k).q, last = q[q.length - 1];
  pay(st, r.need);
  const start = Math.max(now, last ? last[2] : now), end = start + r.time * S;
  q.push([id, start, end]);
  return { id, start, end };
}

// Забрать всё готовое: товары — в рюкзак, места в очереди освобождаются. → { items: [{ id, n }], xp } или null
export function collect(st, k, now) {
  const R = rec(st, k);
  if (!R || !isBuilt(st, k, now)) return null;
  const items = [], keep = [];
  let xp = 0;
  for (const j of R.q) {
    const r = RECIPES[j[0]];
    if (j[2] > now || !r) { if (r) keep.push(j); continue; }
    const got = Inv.addItem(st, r.item, r.n);
    if (got < r.n) { keep.push(j); continue; } // склад полон — товар ждёт в здании
    const e = items.find((x) => x.id === r.item);
    if (e) e.n += got; else items.push({ id: r.item, n: got });
    xp += r.xp || 0;
  }
  if (!items.length) return null;
  R.q = keep;
  return { items, xp };
}

// Отменить товар, который ещё не начали делать: продукты возвращаются, следующие сдвигаются раньше.
// → { id } или null
export function cancel(st, k, idx, now) {
  const R = rec(st, k), j = R && R.q[idx];
  if (!j || j[1] <= now) return null;
  const r = RECIPES[j[0]], dur = j[2] - j[1];
  for (const [id, n] of Object.entries(r ? r.need : {})) Inv.addItem(st, id, n);
  R.q.splice(idx, 1);
  for (let i = idx; i < R.q.length; i++) { R.q[i][1] -= dur; R.q[i][2] -= dur; }
  return { id: j[0] };
}

// Доделать сейчас за кристаллы товар, который делается (следующие начнутся раньше). → { gems } или null
export function speedCraft(st, k, now) {
  const R = rec(st, k);
  const i = R ? R.q.findIndex((j) => j[1] <= now && j[2] > now) : -1;
  if (i < 0) return null;
  const left = (R.q[i][2] - now) / S, gems = gemsFor(left);
  if (st.gems < gems) return null;
  st.gems -= gems;
  const shift = R.q[i][2] - now;
  R.q[i][2] = now;
  for (let j = i + 1; j < R.q.length; j++) { R.q[j][1] -= shift; R.q[j][2] -= shift; }
  return { gems };
}

// Рецепты здания k по порядку таблицы: [{ r, open (по уровню), block (причина или null) }]
export function recipesOf(st, k, now) {
  return Object.values(RECIPES).filter((r) => r.at === k)
    .map((r) => ({ r, open: st.level >= r.level, block: craftBlock(st, k, r.key, now) }));
}

// Сколько всего готовых товаров во всех зданиях (значок над зданием, подсказки)
export function readyCount(st, k, now) {
  const R = rec(st, k);
  return R && R.end <= now ? R.q.filter((j) => j[2] <= now).length : 0;
}

export { bpId, bldId };
