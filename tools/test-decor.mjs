// Проверка декора, заборов, поворота и «Убрать всё» (data.js DECOR/FENCES, placed.js, World.js, storeAll.js)
// без браузера: node tools/test-decor.mjs
import assert from 'node:assert/strict';
import * as P from '../src/game/placed.js';
import * as A from '../src/game/storeAll.js';
import * as Ponds from '../src/game/ponds.js';
import * as Paths from '../src/game/paths.js';
import { World, N, T, START_CHUNK, CHUNK, CHUNKS, objCells, normRot } from '../src/game/World.js';
import { DECOR, FENCES, ITEMS, OBJECTS, SHOP, STORE_GROUPS } from '../src/game/data.js';

let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
const st0 = (o = {}) => ({ coins: 0, gems: 0, level: 1, items: {}, ...o });
const world = () => new World(1, { v: 2, n: N, tiles: [], objects: [], well: [0, 0], player: [1, 1] });
const x0 = (START_CHUNK % CHUNKS) * CHUNK, y0 = Math.floor(START_CHUNK / CHUNKS) * CHUNK;
const key = (cells) => cells.map(([x, y]) => x + ',' + y).sort().join(' ');
const occ = (w, o) => { const out = []; for (let i = 0; i < N * N; i++) if (w.occ[i] === o.id) out.push([i % N - o.gx, ((i / N) | 0) - o.gy]); return key(out); };

test('таблица: у декора и заборов — объект, предмет в «Декоре» и товар на рынке', () => {
  for (const [k, d] of Object.entries({ ...DECOR, ...FENCES })) {
    assert.equal(OBJECTS[k].item, k);
    assert.deepEqual(ITEMS[k].tabs, ['decor']);
    assert.equal(P.objOf(k), k);
    assert.ok(!ITEMS[k].sell, 'декор не продаётся');
    const o = SHOP.find((x) => x.item === k);
    assert.ok(o && o.tab === 'decor' && o.price === d.price && o.level === d.level, k);
  }
  for (const k of Object.keys(FENCES)) { assert.ok(OBJECTS[k].fence && ITEMS[k].brush); assert.equal(P.rotCount(k), 1, 'забор не поворачивается'); }
  for (const [k, d] of Object.entries(DECOR)) assert.equal(P.rotCount(k), d.rot || 1);
  assert.deepEqual(A.GROUP_KEYS, ['decor', 'paths', 'ponds', 'plants', 'build', 'sprouts']);
  assert.ok(STORE_GROUPS.find((g) => g.key === 'sprouts').off, 'ростки по умолчанию не убираются');
});

test('поворот: положения по числу у вещи, в нечётных фигура отражена (gx ↔ gy)', () => {
  const d = OBJECTS.decor_park_bench;
  assert.equal(normRot(d, 5), 1); assert.equal(normRot(d, -1), 3); assert.equal(normRot(OBJECTS.decor_table_set, 3), 1);
  assert.equal(normRot(OBJECTS.decor_lamp, 3), 0, 'симметричная вещь не поворачивается');
  assert.equal(key(objCells(d, 0)), key([[0, 0], [1, 0]]));
  assert.equal(key(objCells(d, 1)), key([[0, 0], [0, 1]]));
  assert.equal(key(objCells(d, 2)), key(objCells(d, 0)));
  assert.equal(objCells(d, 3), objCells(d, 1), 'отражённая фигура запоминается');
});

test('поставить повёрнутым: клетки, размеры, запись в сохранении; перенос с поворотом', () => {
  const w = world(), st = st0({ items: { decor_park_bench: 2 } });
  const o = P.placeObj(st, w, 'decor_park_bench', x0 + 2, y0 + 2, {}, 1).o;
  assert.ok(o);
  assert.equal(o.rot, 1); assert.equal(o.w, 1); assert.equal(o.h, 2);
  assert.equal(occ(w, o), key([[0, 0], [0, 1]]));
  assert.deepEqual(st.placed, [['decor_park_bench', x0 + 2, y0 + 2, 1]]);
  // на занятое (вторая скамейка вдоль gx задела бы первую) — нельзя
  assert.match(P.placeWhy(st, w, 'decor_park_bench', x0 + 1, y0 + 3, {}, 0), /занято/);
  assert.equal(P.placeWhy(st, w, 'decor_park_bench', x0 + 1, y0 + 3, {}, 1), null);
  // поворот на месте: запись и мир
  P.moveObj(st, o, o.gx, o.gy, 2);
  w.moveObject(o, o.gx, o.gy, 2);
  assert.equal(o.rot, 2); assert.equal(o.w, 2); assert.equal(o.h, 1);
  assert.equal(occ(w, o), key([[0, 0], [1, 0]]));
  assert.deepEqual(st.placed, [['decor_park_bench', x0 + 2, y0 + 2, 2]]);
  // обратно в положение 0 — без числа в записи, o.rot убран
  P.moveObj(st, o, x0 + 4, y0 + 4, 0);
  w.moveObject(o, x0 + 4, y0 + 4, 0);
  assert.ok(!('rot' in o));
  assert.deepEqual(st.placed, [['decor_park_bench', x0 + 4, y0 + 4]]);
  assert.equal(w.occ[(y0 + 2) * N + x0 + 2], -1, 'старые клетки свободны');
});

test('загрузка: повёрнутая вещь встаёт так же; место занято — в рюкзак; лишний поворот отбрасывается', () => {
  const w = world();
  const st = st0({ placed: [['decor_park_bench', x0 + 2, y0 + 2, 3], ['decor_lamp', x0 + 5, y0 + 5, 2], ['decor_table_set', x0 + 2, y0 + 3, 0]] });
  const back = P.restorePlaced(st, w);
  assert.equal(back, 1, 'столик лёг бы на клетку скамейки (x0+2, y0+3) — в рюкзак');
  assert.equal(st.items.decor_table_set, 1);
  const bench = w.objectAt(x0 + 2, y0 + 3);
  assert.ok(bench && bench.type === 'decor_park_bench' && bench.rot === 3 && bench.h === 2);
  assert.ok(!w.objectAt(x0 + 5, y0 + 5).rot, 'у фонаря поворота нет');
  assert.deepEqual(st.placed, [['decor_park_bench', x0 + 2, y0 + 2, 3], ['decor_lamp', x0 + 5, y0 + 5]]);
});

test('забор: секции ставятся по одной, убираются в рюкзак', () => {
  const w = world(), st = st0({ items: { fence_picket: 3 } });
  for (let i = 0; i < 3; i++) assert.ok(P.placeObj(st, w, 'fence_picket', x0 + 2 + i, y0 + 2).o);
  assert.equal(st.items.fence_picket || 0, 0);
  assert.match(P.placeWhy(st, w, 'fence_picket', x0 + 6, y0 + 2), /больше нет/);
  const r = P.storeObj(st, w, w.objectAt(x0 + 3, y0 + 2));
  assert.equal(r.id, 'fence_picket');
  assert.equal(st.items.fence_picket, 1);
  assert.equal(st.placed.length, 2);
});

test('«Убрать всё»: по группам, дом, колодец и грядки остаются, занятое не трогается', () => {
  const w = world(), st = st0({ items: { decor_bench: 1, fence_wattle: 2, sprinkler_drip: 1, path_sand: 2, pond_small: 1 } });
  P.placeObj(st, w, 'decor_bench', x0 + 1, y0 + 1, {}, 1);
  P.placeObj(st, w, 'fence_wattle', x0 + 2, y0 + 1);
  const busy = P.placeObj(st, w, 'fence_wattle', x0 + 3, y0 + 1).o;
  P.placeObj(st, w, 'sprinkler_drip', x0 + 5, y0 + 1);
  Paths.placePath(st, w, 'path_sand', w.idx(x0 + 1, y0 + 5));
  Paths.placePath(st, w, 'path_sand', w.idx(x0 + 2, y0 + 5));
  Ponds.placePond(st, w, 'pond_small', x0 + 6, y0 + 6);
  w.tiles[w.idx(x0 + 8, y0 + 2)] = T.SOIL; // грядка
  const plant = w.add('apple', x0 + 1, y0 + 8); plant.own = 1; // своё взрослое растение
  const sprout = w.add('sapling', x0 + 3, y0 + 8); sprout.own = 1; sprout.tree = 'oak'; sprout.born = 0; // росток
  const house = w.add('house', x0 + 4, y0 + 3);
  const skip = (q) => q.obj === busy;
  assert.deepEqual(A.plan(w, skip), { decor: 2, paths: 2, ponds: 1, plants: 1, build: 1, sprouts: 1 });
  assert.ok(A.leavesNoWater(st, w, ['ponds'], skip), 'колодец не починен, единственный пруд уходит');
  assert.ok(!A.leavesNoWater(st, w, ['decor'], skip));
  assert.ok(!A.leavesNoWater({ ...st, well: 1 }, w, ['ponds'], skip), 'колодец починен — вода есть');
  // только декор и дорожки
  const r1 = A.storeAll(st, w, ['decor', 'paths'], { now: 0, rng: () => 0.5, skip });
  assert.equal(r1.n, 4); assert.equal(r1.left, 1); assert.equal(r1.paths, 2);
  assert.equal(A.summary(r1.by), '2 вещи декора, 2 дорожки');
  assert.equal(st.items.decor_bench, 1); assert.equal(st.items.fence_wattle, 1); assert.equal(st.items.path_sand, 2);
  assert.ok(w.objects[busy.id] === busy, 'забор, у которого работает призрачок, на месте');
  assert.ok(w.objectAt(x0 + 5, y0 + 1), 'поливалка не выбрана — на месте');
  // остальное
  const r2 = A.storeAll(st, w, A.GROUP_KEYS.filter((k) => k !== 'sprouts'), { now: 0, rng: () => 0.5 });
  assert.equal(r2.n, 4, 'забор, поливалка, пруд, яблоня');
  assert.equal(A.summary(r2.by), '1 вещь декора, 1 пруд, 1 растение, 1 постройка');
  assert.equal(st.items.sprinkler_drip, 1); assert.equal(st.items.pond_small, 1); assert.equal(st.items.own_apple, 1);
  assert.ok(w.objects[house.id] === house && w.objects[sprout.id] === sprout, 'дом и росток остались');
  // ростки — только если отмечены: возвращаются саженцами
  const r3 = A.storeAll(st, w, ['sprouts'], { now: 0, rng: () => 0.5 });
  assert.equal(r3.n, 1); assert.equal(st.items.sap_oak, 1); assert.ok(w.objects[sprout.id] !== sprout);
  assert.equal(w.tiles[w.idx(x0 + 8, y0 + 2)], T.SOIL, 'грядка осталась');
  assert.deepEqual(st.placed, []);
  assert.deepEqual(A.plan(w), { decor: 0, paths: 0, ponds: 0, plants: 0, build: 0, sprouts: 0 });
});

console.log(`\nвсе проверки прошли: ${tests}`);
