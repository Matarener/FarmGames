// Проверка «Убрать всё своё в рюкзак» (src/game/storeAll.js) без браузера: node tools/test-store-all.mjs
import assert from 'node:assert/strict';
import * as SA from '../src/game/storeAll.js';
import * as Paths from '../src/game/paths.js';
import * as Ponds from '../src/game/ponds.js';
import * as Placed from '../src/game/placed.js';
import * as Flora from '../src/game/flora.js';
import * as Beds from '../src/game/beds.js';
import * as Well from '../src/game/well.js';
import { World, N, T, START_CHUNK, CHUNK, CHUNKS } from '../src/game/World.js';
import { STORE_ALL, ITEMS, SHOP, BED_ITEM, WELL_ITEM, floraSeedId, floraOwnId, pondDecorId } from '../src/game/data.js';

let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
const x0 = (START_CHUNK % CHUNKS) * CHUNK, y0 = Math.floor(START_CHUNK / CHUNKS) * CHUNK;
const NOW = 1_000_000_000_000;
const ctx = (o = {}) => ({ now: NOW, rng: () => 0, ...o });
const bed = (crop) => ({ crop: crop || null, p: 0, w: 0 });
const ALL = STORE_ALL.map((g) => g.key);

// Ферма со всеми видами своих вещей на открытом стартовом участке и кое-чем чужим
function farm() {
  const w = new World(1, { v: 2, n: N, tiles: [], objects: [], well: [x0 + 9, y0 + 9], player: [1, 1] });
  const st = { coins: 0, gems: 0, level: 1, well: 1, items: {
    path_sand: 2, path_cobble: 1, pond_small: 1, [pondDecorId('reeds')]: 1, sprinkler_drip: 1,
  } };
  const i = (x, y) => (y0 + y) * N + x0 + x;
  Paths.placePath(st, w, 'path_sand', i(1, 1));
  Paths.placePath(st, w, 'path_sand', i(2, 1));
  Paths.placePath(st, w, 'path_cobble', i(3, 1));
  const pond = Ponds.placePond(st, w, 'pond_small', x0 + 1, y0 + 3);
  Ponds.placeDecor(st, w, pondDecorId('reeds'), x0 + 1, y0 + 3);
  const spr = Placed.placeObj(st, w, 'sprinkler_drip', x0 + 5, y0 + 1).o;
  // своя взрослая яблоня с плодами, свой взрослый куст малины без плодов, свой росток дуба
  const tree = own(st, w, 'apple', x0 + 6, y0 + 4, true);
  const bush = own(st, w, 'raspberry', x0 + 7, y0 + 4, true);
  (st.fruit || (st.fruit = {}))[bush.gx + ',' + bush.gy] = NOW + 3600e3;
  const sprout = own(st, w, 'oak', x0 + 8, y0 + 4, false);
  // чужое: дикое дерево, камень
  const wild = w.add('oak', x0 + 6, y0 + 7); wild.wild = 1;
  const rock = w.add('rock', x0 + 7, y0 + 7);
  // грядки: две пустые, одна с морковкой
  const beds = new Map();
  for (const [x, y, crop] of [[1, 8], [2, 8], [3, 8, 'carrot']]) { w.tiles[i(x, y)] = T.SOIL; beds.set(i(x, y), bed(crop)); }
  return { w, st, pond, spr, tree, bush, sprout, wild, rock, i, beds, ctx: (o = {}) => ctx({ beds, ...o }) };
}

function own(st, w, sp, x, y, grown) {
  const o = w.add(grown ? sp : 'sapling', x, y);
  o.own = 1; o.tree = sp; o.born = grown ? NOW - 10 * 24 * 3600e3 : NOW;
  (st.plants || (st.plants = [])).push([x, y, sp, o.born]);
  return o;
}

test('таблица STORE_ALL: группы по одной, у каждой три формы слова; ростки по умолчанию выключены', () => {
  assert.deepEqual(SA.GROUPS, ['paths', 'beds', 'ponds', 'decor', 'well', 'plants', 'placed', 'animals', 'sprouts']);
  for (const g of STORE_ALL) {
    assert.ok(g.name && g.icon && g.note, g.key);
    assert.equal(g.word.length, 3, g.key);
  }
  assert.equal(STORE_ALL.find((g) => g.key === 'sprouts').on, false);
  assert.ok(STORE_ALL.filter((g) => g.key !== 'sprouts').every((g) => g.on));
});

test('groupOf: своё — по группам (колодец тоже), дом и дикое — нет', () => {
  const f = farm();
  assert.equal(SA.groupOf(f.pond), 'ponds');
  assert.equal(SA.groupOf(f.spr), 'placed');
  assert.equal(SA.groupOf(f.tree), 'plants');
  assert.equal(SA.groupOf(f.bush), 'plants');
  assert.equal(SA.groupOf(f.sprout), 'sprouts');
  assert.equal(SA.groupOf(f.wild), null);
  assert.equal(SA.groupOf(f.rock), null);
  assert.equal(SA.groupOf(f.w.objects.find((o) => o && o.type === 'house')), null);
  assert.equal(SA.groupOf(f.w.well), 'well');
  assert.equal(SA.groupOf(null), null);
});

test('collect: считает своё, занятое — в kept', () => {
  const f = farm();
  const c = SA.collect(f.st, f.w, f.ctx());
  assert.equal(c.paths.list.length, 3);
  assert.deepEqual(c.beds.list, [f.i(1, 8), f.i(2, 8)], 'грядка с морковкой не считается');
  assert.deepEqual(c.well.list, [f.w.well]);
  assert.deepEqual(c.ponds.list, [f.pond]);
  assert.deepEqual(c.placed.list, [f.spr]);
  assert.deepEqual(c.plants.list.sort((a, b) => a.id - b.id), [f.tree, f.bush]);
  assert.deepEqual(c.sprouts.list, [f.sprout]);
  for (const g of SA.GROUPS) assert.equal(c[g].kept, 0);
  // призрачок работает с яблоней и стоит на клетке дорожки — они остаются
  const busy = (q) => q.obj === f.tree || (q.x === x0 + 2 && q.y === y0 + 1);
  const b = SA.collect(f.st, f.w, f.ctx({ busy }));
  assert.equal(b.plants.list.length, 1); assert.equal(b.plants.kept, 1);
  assert.equal(b.paths.list.length, 2); assert.equal(b.paths.kept, 1);
});

test('collect: постройка, которая не даёт себя убрать (хук canStore), остаётся', () => {
  const f = farm();
  Placed.registerPlaced('sprinkler_drip', { canStore: () => 'строится' });
  try {
    const c = SA.collect(f.st, f.w, ctx());
    assert.equal(c.placed.list.length, 0); assert.equal(c.placed.kept, 1);
    const r = SA.storeAll(f.st, f.w, ['placed'], ctx());
    assert.equal(r.total, 0);
    assert.equal(f.w.objects[f.spr.id], f.spr);
  } finally { Placed.registerPlaced('sprinkler_drip', { canStore: null }); }
});

test('collect: сломанный колодец остаётся', () => {
  const f = farm();
  f.st.well = 0;
  const c = SA.collect(f.st, f.w, f.ctx());
  assert.equal(c.well.list.length, 0); assert.equal(c.well.kept, 1);
  assert.equal(SA.storeAll(f.st, f.w, ['well'], f.ctx()).total, 0);
  assert.ok(f.w.well && f.w.objects[f.w.well.id] === f.w.well);
});

test('collect: на закрытом участке ничего не трогается', () => {
  const f = farm();
  // закрываем стартовый участок
  f.w.unlocked[START_CHUNK] = 0;
  const c = SA.collect(f.st, f.w, f.ctx());
  for (const g of SA.GROUPS) assert.equal(c[g].list.length, 0, g);
});

test('storeAll по умолчанию: всё своё в рюкзак; ростки, грядка с урожаем, дом и дикое — на месте', () => {
  const f = farm(), { w, st } = f;
  const groups = STORE_ALL.filter((g) => g.on).map((g) => g.key);
  const r = SA.storeAll(st, w, groups, f.ctx());
  assert.deepEqual(r.done, { paths: 3, beds: 2, ponds: 1, well: 1, plants: 2, placed: 1 });
  assert.equal(r.total, 10);
  // грядки и колодец
  assert.equal(st.items[BED_ITEM], 2);
  assert.equal(st.items[WELL_ITEM], 1);
  assert.equal(w.tiles[f.i(1, 8)], T.GRASS); assert.ok(!f.beds.has(f.i(1, 8)));
  assert.equal(w.tiles[f.i(3, 8)], T.SOIL, 'грядка с морковкой на месте'); assert.equal(f.beds.get(f.i(3, 8)).crop, 'carrot');
  assert.equal(st.movedBeds, true);
  assert.equal(w.well, null);
  assert.ok(Well.inBag(st));
  // рюкзак: дорожки по видам, пруд с камышом, поливалка, растения взрослыми, плоды висевшей яблони
  assert.equal(st.items.path_sand, 2);
  assert.equal(st.items.path_cobble, 1);
  assert.equal(st.items.pond_small, 1);
  assert.equal(st.items[pondDecorId('reeds')], 1);
  assert.equal(st.items.sprinkler_drip, 1);
  assert.equal(st.items[floraOwnId('apple')], 1);
  assert.equal(st.items[floraOwnId('raspberry')], 1);
  assert.equal(st.items.apple, 2, 'плоды яблони собраны (rng 0 → меньше всего)');
  assert.equal(st.items.raspberry, undefined, 'у малины плоды ещё не созрели');
  const sum = Object.fromEntries(r.items.map(({ id, n }) => [id, n]));
  assert.deepEqual(sum, { path_sand: 2, path_cobble: 1, [BED_ITEM]: 2, pond_small: 1, [pondDecorId('reeds')]: 1, [WELL_ITEM]: 1, sprinkler_drip: 1, [floraOwnId('apple')]: 1, apple: 2, [floraOwnId('raspberry')]: 1 });
  // мир и сохранение
  for (let k = 0; k < N * N; k++) assert.notEqual(w.tiles[k], T.PATH);
  assert.deepEqual(st.paths, {});
  assert.deepEqual(st.ponds, []);
  assert.deepEqual(st.placed, []);
  assert.equal(w.objects.filter(Ponds.isPond).length, 0);
  assert.equal(w.decor.length, 0);
  for (const o of [f.pond, f.spr, f.tree, f.bush]) assert.equal(w.objects[o.id], null);
  assert.equal(w.objects[f.sprout.id], f.sprout, 'росток остался');
  assert.deepEqual(st.plants.map((p) => p[2]), ['oak']);
  assert.ok(!(f.tree.gx + ',' + f.tree.gy in (st.fruit || {})) && !(f.bush.gx + ',' + f.bush.gy in (st.fruit || {})));
  for (const o of [f.wild, f.rock]) assert.equal(w.objects[o.id], o);
  const house = w.objects.find((o) => o && o.type === 'house');
  if (house) assert.equal(w.objects[house.id], house);
  // места для эффектов: у каждой убранной вещи
  assert.equal(r.spots.length, 10);
  assert.deepEqual(r.spots.filter((s) => s.g === 'paths').map((s) => s.id).sort(), ['path_cobble', 'path_sand', 'path_sand']);
  // повторно — убирать нечего
  const again = SA.storeAll(st, w, groups, f.ctx());
  assert.equal(again.total, 0);
  assert.deepEqual(again.items, []);
});

test('storeAll с ростками: росток — саженцем; только выбранные группы', () => {
  const f = farm(), { w, st } = f;
  const r = SA.storeAll(st, w, ['sprouts'], f.ctx());
  assert.deepEqual(r.done, { sprouts: 1 });
  assert.equal(st.items[floraSeedId('oak')], 1);
  assert.equal(w.objects[f.sprout.id], null);
  assert.equal(w.objects[f.tree.id], f.tree, 'взрослые растения не трогали');
  assert.equal(w.objects[f.pond.id], f.pond, 'пруд не трогали');
  assert.equal(w.tiles[f.i(1, 1)], T.PATH, 'дорожки не трогали');
  assert.deepEqual(st.plants.map((p) => p[2]).sort(), ['apple', 'raspberry']);
  // и всё остальное
  const all = SA.storeAll(st, w, ALL, f.ctx());
  assert.equal(all.total, 10);
  assert.equal((st.plants || []).length, 0);
});

test('storeAll: убранное ставится обратно теми же правилами', () => {
  const f = farm(), { w, st } = f;
  SA.storeAll(st, w, ALL, f.ctx());
  assert.ok(Paths.placePath(st, w, 'path_cobble', f.i(1, 1)));
  assert.ok(Beds.placeBed(st, w, f.i(5, 5)));
  assert.equal(w.tiles[f.i(5, 5)], T.SOIL);
  const o = Well.placeWell(st, w, x0 + 4, y0 + 6);
  assert.ok(o && w.well === o && o.type === 'well');
  assert.deepEqual(st.pos.well, [x0 + 4, y0 + 6]);
  assert.ok(!Well.inBag(st));
  assert.ok(Ponds.placePond(st, w, 'pond_small', x0 + 1, y0 + 3));
  assert.ok(Placed.placeObj(st, w, 'sprinkler_drip', x0 + 5, y0 + 1).o);
  assert.ok(Flora.sowGrown(st, 'apple', x0 + 6, y0 + 4, NOW));
});

test('грядка и колодец: предметы в «Постройках», не продаются; грядка — на рынке, колодца там нет', () => {
  for (const id of [BED_ITEM, WELL_ITEM]) {
    assert.deepEqual(ITEMS[id].tabs, ['build']);
    assert.ok(!ITEMS[id].sell, id);
    assert.ok(Number.isFinite(ITEMS[id].order), id);
  }
  assert.ok(!SHOP.some((o) => o.item === WELL_ITEM));
  assert.ok(SHOP.find((o) => o.item === BED_ITEM).bed, 'цена и предел грядки — beds.js');
  assert.equal(ITEMS[BED_ITEM].place, 'bed');
  assert.equal(ITEMS[WELL_ITEM].place, 'well');
});

test('storeBed / placeBed: только пустая грядка, только на свободную открытую траву', () => {
  const f = farm(), { w, st, beds } = f;
  assert.equal(Beds.storeBed(st, w, beds, f.i(3, 8)), false, 'с урожаем нельзя');
  assert.equal(Beds.storeBed(st, w, beds, f.i(0, 0)), false, 'не грядка');
  assert.equal(Beds.storeBed(st, w, beds, f.i(1, 8)), true);
  assert.equal(st.items[BED_ITEM], 1);
  assert.equal(Beds.placeBed(st, w, f.i(1, 1)), false, 'на дорожку нельзя');
  assert.equal(Beds.placeBed(st, w, f.i(5, 1)), false, 'под поливалку нельзя');
  assert.equal(Beds.placeBed(st, w, (y0 + 1) * N + x0 + CHUNK + 1), false, 'на закрытый участок нельзя');
  assert.equal(st.items[BED_ITEM], 1, 'не потратилась');
  assert.equal(Beds.placeBed(st, w, f.i(1, 8)), true);
  assert.equal(st.items[BED_ITEM], undefined);
  assert.equal(Beds.placeBed(st, w, f.i(2, 2)), false, 'в рюкзаке больше нет');
});

test('storeWell / placeWell: сломанный не убирается, поставить можно только один и на свободную траву', () => {
  const f = farm(), { w, st } = f;
  st.well = 0;
  assert.equal(Well.storeWell(st, w), null);
  assert.equal(Well.storeWhy(st, w), 'Колодец сломан: сначала почините его');
  st.well = 1;
  (st.pos = {}).well = [1, 1];
  const o = Well.storeWell(st, w);
  assert.ok(o && w.objects[o.id] === null && w.well === null && !('well' in st.pos));
  assert.equal(Well.storeWell(st, w), null, 'уже в рюкзаке');
  assert.equal(Well.placeWell(st, w, x0 + 1, y0 + 1), null, 'на дорожку нельзя');
  assert.equal(Well.placeWell(st, w, x0 + 5, y0 + 1), null, 'занято поливалкой');
  assert.ok(Well.placeWell(st, w, x0 + 4, y0 + 6));
  assert.equal(Well.placeWell(st, w, x0 + 4, y0 + 7), null, 'второго колодца нет');
});

test('summary: формы слов и порядок таблицы', () => {
  assert.equal(SA.summary({ ponds: 2, paths: 24, plants: 1 }), '24 дорожки, 2 пруда, 1 растение');
  assert.equal(SA.summary({ well: 1, beds: 5 }), '5 грядок, 1 колодец');
  assert.equal(SA.summary({ placed: 5, sprouts: 11 }), '5 построек, 11 ростков');
  assert.equal(SA.summary({}), '');
});

console.log(`\n${tests} проверок прошло`);
