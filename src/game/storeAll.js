// «Убрать всё своё в рюкзак» (кнопка «Убрать всё» в режиме «Переставить»): свои вещи с карты — разом в рюкзак.
// Чистые функции над состоянием st и миром (без звуков, DOM, Date.now и Math.random — время и случайность
// приходят в ctx), чтобы их же потом мог выполнять сервер. Эффекты (пыль, брызги, надписи) делает Farm.
//
// Группы — таблица STORE_ALL (data.js): дорожки, пустые грядки, пруды (с украшениями), починенный колодец, свои
// взрослые деревья и кусты (висящие плоды — тоже в рюкзак), свои постройки (placed.js: постройка сама может
// отказаться, например пока строится), растущие ростки (вернутся саженцами). Каждая вещь убирается тем же
// правилом, что и по одной в «Переставить»: Paths.storePaths, Beds.storeBed, Ponds.storePond, Well.storeWell,
// Placed.storeObj, Flora.storeOwn.
// Не трогаются: дом, грядки, где что-то растёт, сломанный колодец, дикая природа, вещи на закрытых участках и
// занятое — ctx.busy({ obj }) или ctx.busy({ x, y }) → true (например, там сейчас работает призрачок: это знает
// только игра).
//
// ctx: { now, rng, busy?, beds? } — beds: грядки фермы (Map клетка → грядка; на клиенте Farm.beds, не в st)

import { OBJECTS, STORE_ALL, BED_ITEM, WELL_ITEM } from './data.js';
import * as Beds from './beds.js';
import * as Flora from './flora.js';
import * as Paths from './paths.js';
import * as Placed from './placed.js';
import * as Ponds from './ponds.js';
import { plural } from './questRules.js';
import * as Well from './well.js';
import { N, T, objCells } from './World.js';

export const GROUPS = STORE_ALL.map((g) => g.key);

// В какую группу попадает объект мира (null — не свой или в рюкзак не убирается: дом, дикое)
export function groupOf(o) {
  if (!o) return null;
  if (o.type === 'well') return 'well';
  if (Ponds.isPond(o)) return 'ponds';
  if (Placed.isPlaced(o)) return Placed.itemOf(o.type) ? 'placed' : null;
  if (!o.own) return null;
  if (o.type === 'sapling') return 'sprouts';
  return Flora.floraOf(o) ? 'plants' : null;
}

// Объект целиком на открытой земле
const onOpen = (w, o) => objCells(OBJECTS[o.type]).every(([dx, dy]) => w.isOpen(o.gx + dx, o.gy + dy));

// Что уберётся. → { группа: { list, kept } }: list — клетки дорожек и грядок (номера) или объекты, kept — сколько
// своих останется на месте (занято, постройка не даёт: строится; колодец сломан). Грядки, где что-то растёт,
// не считаются вовсе.
export function collect(st, w, ctx = {}) {
  const busy = ctx.busy || (() => false), beds = ctx.beds || new Map(), out = {};
  for (const g of GROUPS) out[g] = { list: [], kept: 0 };
  for (let i = 0; i < w.tiles.length; i++) {
    const t = w.tiles[i];
    if (t !== T.PATH && t !== T.SOIL) continue;
    const x = i % N, y = (i / N) | 0;
    if (!w.isOpen(x, y)) continue;
    if (t === T.SOIL && beds.get(i) && beds.get(i).crop) continue;
    const g = t === T.PATH ? 'paths' : 'beds';
    if (busy({ x, y })) out[g].kept++; else out[g].list.push(i);
  }
  for (const o of w.objects) {
    const g = groupOf(o);
    if (!g || !onOpen(w, o)) continue;
    const no = (g === 'placed' && Placed.storeWhy(st, o, ctx)) || (g === 'well' && Well.storeWhy(st, w));
    if (busy({ obj: o }) || no) out[g].kept++;
    else out[g].list.push(o);
  }
  return out;
}

// Убрать в рюкзак группы groups (ключи STORE_ALL). → { items: [{ id, n }] — что легло в рюкзак,
// done: { группа: сколько вещей убрано }, total, spots } . spots — где что было, для эффектов: [{ g, o }] у объектов
// (o уже снят с карты, но gx, gy, wx, wy при нём), [{ g, x, y, id? }] у клеток дорожек (id — вид) и грядок.
export function storeAll(st, w, groups, ctx = {}) {
  const want = new Set(groups), list = collect(st, w, ctx), got = {}, done = {}, spots = [];
  let total = 0;
  const put = (items, g, spot) => {
    for (const { id, n } of items) got[id] = (got[id] || 0) + n;
    done[g] = (done[g] || 0) + 1; total++;
    spots.push({ g, ...spot });
  };
  for (const g of GROUPS) {
    if (!want.has(g)) continue;
    if (g === 'paths') {
      const cells = list.paths.list, kinds = cells.map((i) => Paths.kindAt(w, i));
      Paths.storePaths(st, w, cells);
      cells.forEach((i, k) => { if (w.tiles[i] !== T.PATH) put([{ id: kinds[k], n: 1 }], g, { x: i % N, y: (i / N) | 0, id: kinds[k] }); });
      continue;
    }
    if (g === 'beds') {
      const beds = ctx.beds || new Map();
      for (const i of list.beds.list) if (Beds.storeBed(st, w, beds, i)) put([{ id: BED_ITEM, n: 1 }], g, { x: i % N, y: (i / N) | 0 });
      continue;
    }
    for (const o of list[g].list) {
      let items = null;
      if (g === 'well') { if (Well.storeWell(st, w)) items = [{ id: WELL_ITEM, n: 1 }]; }
      else if (g === 'ponds') items = Ponds.storePond(st, w, o);
      else if (g === 'placed') { const r = Placed.storeObj(st, w, o, ctx); if (r.id) items = [{ id: r.id, n: 1 }]; }
      else { const r = Flora.storeOwn(st, o, ctx.now, ctx.rng); if (r) { w.remove(o); items = r.items; } }
      if (items) put(items, g, { o });
    }
  }
  return { items: Object.entries(got).map(([id, n]) => ({ id, n })), done, total, spots };
}

// «24 дорожки, 2 пруда, 3 растения» — что убрано (done из storeAll), по порядку STORE_ALL
export function summary(done) {
  return STORE_ALL.filter((g) => done[g.key]).map((g) => `${done[g.key]} ${plural(done[g.key], g.word)}`).join(', ');
}
