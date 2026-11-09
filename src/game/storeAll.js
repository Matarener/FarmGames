// «Убрать всё»: всё своё с карты — в рюкзак одной кнопкой («Ещё» → «Переставить» → «Убрать всё»).
// Дом, колодец, грядки и дикие растения остаются (это не предметы и не своё).
// Группы (data.js STORE_GROUPS) — галочки в окне: decor — декор и заборы, paths — дорожки, ponds — пруды
// (с украшениями), plants — свои деревья и кусты (с висящими плодами), build — свои постройки (поливалки и прочее
// из placed.js), sprouts — свои растущие ростки (вернутся саженцами, рост начнётся заново).
// Чистые функции над состоянием st и миром (время и случай — в ctx), эффекты делает Mover.

import { OBJECTS, STORE_GROUPS } from './data.js';
import * as Placed from './placed.js';
import * as Ponds from './ponds.js';
import * as Paths from './paths.js';
import * as Flora from './flora.js';
import { N, T } from './World.js';

export const GROUP_KEYS = STORE_GROUPS.map((g) => g.key);

// В какую группу попадает объект карты (null — не убирается: дом, колодец, дикие растения, камни)
export function groupOf(o) {
  const def = o && OBJECTS[o.type];
  if (!def) return null;
  if (Ponds.isPond(o)) return 'ponds';
  if (o.placed) return def.deco || def.fence ? 'decor' : 'build';
  if (o.own && def.flora) return 'plants';
  if (o.own && o.type === 'sapling') return 'sprouts';
  return null;
}

// Клетки дорожек на открытой земле: номера клеток
function pathCells(w) {
  const out = [];
  for (let i = 0; i < N * N; i++) if (w.tiles[i] === T.PATH && w.isOpen(i % N, (i / N) | 0)) out.push(i);
  return out;
}

// Сколько чего уберётся: { decor, paths, ponds, plants, build, sprouts }. skip({ obj } | { x, y }) — призрачок там
// сейчас работает: это не трогаем.
export function plan(w, skip = () => false) {
  const n = Object.fromEntries(GROUP_KEYS.map((k) => [k, 0]));
  for (const o of w.objects) {
    const g = groupOf(o);
    if (g && w.isOpen(o.gx, o.gy) && !skip({ obj: o })) n[g]++;
  }
  for (const i of pathCells(w)) if (!skip({ x: i % N, y: (i / N) | 0 })) n.paths++;
  return n;
}

// Убрать в рюкзак всё из групп groups. ctx: { now, rng, skip }.
// → { n — сколько вещей убрано, left — сколько осталось (занято, нельзя убрать), paths — убрано клеток дорожек,
//     by — { группа: сколько убрано }, items — [{ id, n }] что легло в рюкзак }
export function storeAll(st, w, groups, ctx = {}) {
  const want = new Set(groups), skip = ctx.skip || (() => false), got = new Map();
  const add = (id, k) => got.set(id, (got.get(id) || 0) + k);
  const by = Object.fromEntries(GROUP_KEYS.map((k) => [k, 0]));
  let n = 0, left = 0, paths = 0;
  for (const o of w.objects.slice()) {
    const g = groupOf(o);
    if (!g || !want.has(g) || w.objects[o.id] !== o || !w.isOpen(o.gx, o.gy)) continue;
    if (skip({ obj: o })) { left++; continue; }
    let items = null;
    if (g === 'ponds') items = Ponds.storePond(st, w, o);
    else if (g === 'plants' || g === 'sprouts') {
      const r = Flora.storeOwn(st, o, ctx.now, ctx.rng);
      if (r) { w.remove(o); items = r.items; }
    } else {
      const r = Placed.storeObj(st, w, o, ctx);
      if (!r.why) items = [{ id: r.id, n: 1 }];
    }
    if (!items) { left++; continue; }
    n++; by[g]++;
    for (const it of items) add(it.id, it.n);
  }
  if (want.has('paths')) {
    for (const i of pathCells(w)) {
      if (skip({ x: i % N, y: (i / N) | 0 })) { left++; continue; }
      const k = Paths.storePath(st, w, i);
      if (!k) { left++; continue; }
      n++; paths++; by.paths++; add(k, 1);
    }
  }
  return { n, left, paths, by, items: [...got].map(([id, k]) => ({ id, n: k })) };
}

// Останется ли игрок без воды для лейки: колодец не починен, а все пруды уходят в рюкзак
export function leavesNoWater(st, w, groups, skip = () => false) {
  if (st.well || !groups.includes('ponds')) return false;
  const ponds = w.objects.filter((o) => o && Ponds.isPond(o) && w.isOpen(o.gx, o.gy));
  return ponds.length > 0 && ponds.every((o) => !skip({ obj: o }));
}

// Итог словами: «15 дорожек, 1 пруд, 2 постройки» (by — из storeAll)
export function summary(by) {
  const word = (n, [one, few, many]) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  return STORE_GROUPS.filter((g) => by[g.key]).map((g) => `${by[g.key]} ${word(by[g.key], g.n)}`).join(', ');
}
