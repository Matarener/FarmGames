// Проверка декора, заборов и поворота (data.js DECOR/FENCES, placed.js, World.js; группа «Декор» в storeAll.js)
// без браузера: node tools/test-decor.mjs
import assert from 'node:assert/strict';
import * as P from '../src/game/placed.js';
import * as SA from '../src/game/storeAll.js';
import { World, N, T, START_CHUNK, CHUNK, CHUNKS, objCells, normRot } from '../src/game/World.js';
import { DECOR, FENCES, ITEMS, OBJECTS, SHOP } from '../src/game/data.js';

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

test('«Убрать всё»: декор и заборы — своя группа, повёрнутая вещь убирается вся, занятое остаётся', () => {
  const w = world(), st = st0({ items: { decor_park_bench: 1, fence_wattle: 2, sprinkler_drip: 1 } });
  const bench = P.placeObj(st, w, 'decor_park_bench', x0 + 1, y0 + 1, {}, 1).o;
  P.placeObj(st, w, 'fence_wattle', x0 + 3, y0 + 1);
  const busy = P.placeObj(st, w, 'fence_wattle', x0 + 4, y0 + 1).o;
  const spr = P.placeObj(st, w, 'sprinkler_drip', x0 + 6, y0 + 4).o;
  assert.equal(SA.groupOf(bench), 'decor'); assert.equal(SA.groupOf(busy), 'decor'); assert.equal(SA.groupOf(spr), 'placed');
  const ctx = { now: 0, rng: () => 0.5, busy: (q) => q.obj === busy };
  const list = SA.collect(st, w, ctx);
  assert.equal(list.decor.list.length, 2); assert.equal(list.decor.kept, 1); assert.equal(list.placed.list.length, 1);
  const r = SA.storeAll(st, w, ['decor'], ctx);
  assert.equal(r.total, 2); assert.equal(SA.summary(r.done), '2 вещи декора');
  assert.equal(st.items.decor_park_bench, 1); assert.equal(st.items.fence_wattle, 1);
  assert.equal(w.occ[(y0 + 2) * N + x0 + 1], -1, 'вторая клетка повёрнутой скамейки свободна');
  assert.ok(w.objects[busy.id] === busy && w.objects[spr.id] === spr, 'занятый забор и поливалка на месте');
  assert.deepEqual(st.placed, [['fence_wattle', x0 + 4, y0 + 1], ['sprinkler_drip', x0 + 6, y0 + 4]]);
});

console.log(`\nвсе проверки прошли: ${tests}`);
