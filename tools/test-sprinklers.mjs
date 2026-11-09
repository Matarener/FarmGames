// Проверка правил поливалок и своих построек (sprinklers.js, placed.js, beds.js growBed) без браузера:
// node tools/test-sprinklers.mjs
import assert from 'node:assert/strict';
import * as S from '../src/game/sprinklers.js';
import * as P from '../src/game/placed.js';
import { growBed, cropFlags } from '../src/game/beds.js';
import { World, N, T, START_CHUNK, CHUNK, CHUNKS, objCells } from '../src/game/World.js';
import { SPRINKLERS, CROPS, ITEMS, OBJECTS, SHOP, INV_TABS, SHOP_TABS } from '../src/game/data.js';

let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
const st0 = (o = {}) => ({ coins: 0, gems: 0, level: 1, items: {}, ...o });
const world = () => new World(1, { v: 2, n: N, tiles: [], objects: [], well: [0, 0], player: [1, 1] });
const x0 = (START_CHUNK % CHUNKS) * CHUNK, y0 = Math.floor(START_CHUNK / CHUNKS) * CHUNK;
const key = (cells) => cells.map(([x, y]) => x + ',' + y).sort().join(' ');

test('таблица: у каждой поливалки — объект, предмет в «Постройках» и товар на рынке', () => {
  assert.ok(INV_TABS.some((t) => t.key === 'build') && SHOP_TABS.some((t) => t.key === 'build'));
  for (const [k, s] of Object.entries(SPRINKLERS)) {
    assert.equal(OBJECTS[k].sprinkler, k);
    assert.equal(OBJECTS[k].item, k);
    assert.deepEqual(ITEMS[k].tabs, ['build']);
    assert.equal(ITEMS[k].place, 'obj');
    assert.equal(P.objOf(k), k);
    assert.equal(P.itemOf(k), k);
    assert.ok(!ITEMS[k].sell, 'постройки не продаются');
    const o = SHOP.find((x) => x.item === k);
    assert.ok(o && o.tab === 'build' && o.price === s.price && o.level === s.level);
  }
});

test('клетки полива: крест 4, квадрат 3×3 — 8, 5×5 — 24, без самой поливалки', () => {
  assert.equal(key(S.areaCells('sprinkler_drip', 5, 5)), key([[4, 5], [6, 5], [5, 4], [5, 6]]));
  assert.equal(S.areaSize('sprinkler_spin'), 8);
  assert.equal(S.areaSize('sprinkler_rain'), 24);
  for (const k of Object.keys(SPRINKLERS)) assert.ok(!S.areaCells(k, 5, 5).some(([x, y]) => x === 5 && y === 5));
  assert.deepEqual(S.areaCells('nope', 1, 1), []);
});

test('coverMap и sprinklersAt: по поливалкам мира, у края карты без выхода за него', () => {
  const w = world(), st = st0({ items: { sprinkler_drip: 1, sprinkler_spin: 1 } });
  const a = P.placeObj(st, w, 'sprinkler_drip', x0 + 2, y0 + 2).o;
  const b = P.placeObj(st, w, 'sprinkler_spin', x0 + 3, y0 + 3).o;
  const m = S.coverMap(w);
  assert.equal(m[(y0 + 2) * N + x0 + 3], 2, 'клетку поливают обе');
  assert.equal(m[(y0 + 2) * N + x0 + 1], 1);
  assert.equal(m[(y0 + 3) * N + x0 + 3], 0, 'под самой поливалкой — нет');
  assert.deepEqual(S.sprinklersAt(w, x0 + 3, y0 + 2).sort((p, q) => p.id - q.id), [a, b].sort((p, q) => p.id - q.id));
  assert.deepEqual(S.sprinklersAt(w, x0 + 1, y0 + 1), [], 'крест не поливает по диагонали');
  // у самого края карты — без ошибок
  const w2 = world();
  w2.unlocked.fill(1);
  const st2 = st0({ items: { sprinkler_rain: 1 } });
  assert.ok(P.placeObj(st2, w2, 'sprinkler_rain', N - 1, N - 1).o);
  const m2 = S.coverMap(w2, new Uint8Array(N * N));
  assert.equal(m2.reduce((s, v) => s + v, 0), 8, 'в углу карты из 24 клеток только 8 на карте');
});

test('growBed без поливалки: как раньше — ждёт полива на 0 и на 2/3', () => {
  const total = CROPS.carrot.time;
  const b = { crop: 'carrot', p: 0, w: 0 };
  assert.equal(growBed(b, 1000, false), 0);
  assert.equal(b.p, 0);
  b.w = 1;
  growBed(b, 1e6, false);
  assert.equal(b.p, total * 2 / 3);
  assert.ok(cropFlags(b) & 8, 'просит воды');
  b.w = 2;
  growBed(b, 1e6, false);
  assert.equal(b.p, total);
});

test('growBed с поливалкой: поливает сама и за один долгий промежуток дорастает до конца', () => {
  const total = CROPS.wheat.time;
  const b = { crop: 'wheat', p: 0, w: 0 };
  assert.equal(growBed(b, 7 * 86400, true), 2);
  assert.equal(b.p, total); assert.equal(b.w, 2);
  assert.ok(cropFlags(b) & 4, 'созрело');
  assert.equal(growBed(b, 100, true), 0, 'созревшую не поливает');
  // полита наполовину: второй полив — ровно когда понадобился, рост продолжается в том же шаге
  const c = { crop: 'wheat', p: total / 3, w: 1 };
  assert.equal(growBed(c, total, true), 1);
  assert.equal(c.p, total);
  // маленькие шаги (кадры): поливает, как только просит воды
  const d = { crop: 'carrot', p: 0, w: 0 };
  let n = 0;
  for (let i = 0; i < 200; i++) n += growBed(d, 1, true);
  assert.equal(n, 2); assert.equal(d.p, CROPS.carrot.time);
  // пустая грядка
  assert.equal(growBed({ crop: null, p: 0, w: 0 }, 100, true), 0);
});

test('placeObj / storeObj / moveObj: рюкзак, сохранение, причины отказа', () => {
  const w = world(), st = st0({ items: { sprinkler_spin: 2 } });
  assert.equal(P.placeWhy(st, w, 'carrot', x0 + 1, y0 + 1), 'Это нельзя поставить');
  assert.match(P.placeWhy(st, w, 'sprinkler_spin', x0 - 1, y0 + 1), /не открыт/);
  w.tiles[(y0 + 1) * N + x0 + 1] = T.SOIL;
  assert.match(P.placeObj(st, w, 'sprinkler_spin', x0 + 1, y0 + 1).why, /занято/, 'на грядку нельзя');
  const o = P.placeObj(st, w, 'sprinkler_spin', x0 + 2, y0 + 1).o;
  assert.ok(o && o.own && o.placed && o.type === 'sprinkler_spin');
  assert.equal(st.items.sprinkler_spin, 1);
  assert.deepEqual(st.placed, [['sprinkler_spin', x0 + 2, y0 + 1]]);
  assert.match(P.placeObj(st, w, 'sprinkler_spin', x0 + 2, y0 + 1).why, /занято/);
  P.moveObj(st, o, x0 + 5, y0 + 5); w.moveObject(o, x0 + 5, y0 + 5);
  assert.deepEqual(st.placed, [['sprinkler_spin', x0 + 5, y0 + 5]]);
  assert.deepEqual(P.storeObj(st, w, o), { id: 'sprinkler_spin' });
  assert.equal(st.items.sprinkler_spin, 2);
  assert.deepEqual(st.placed, []);
  assert.equal(w.objects[o.id], null);
  assert.ok(P.storeObj(st, w, { type: 'rock', placed: 0 }).why, 'чужое не убирается');
  const st1 = st0();
  assert.match(P.placeWhy(st1, w, 'sprinkler_spin', x0 + 2, y0 + 2), /больше нет/);
});

test('restorePlaced: на месте — объект, занято или закрыто — обратно в рюкзак', () => {
  const w = world();
  w.add('rock', x0 + 4, y0 + 4);
  const st = st0({ placed: [['sprinkler_drip', x0 + 1, y0 + 1], ['sprinkler_rain', x0 + 4, y0 + 4], ['sprinkler_spin', x0 - 3, y0], ['nope', 1, 1], 'junk'] });
  assert.equal(P.restorePlaced(st, w), 2);
  assert.deepEqual(st.placed, [['sprinkler_drip', x0 + 1, y0 + 1]]);
  assert.equal(st.items.sprinkler_rain, 1); assert.equal(st.items.sprinkler_spin, 1);
  const o = w.objectAt(x0 + 1, y0 + 1);
  assert.ok(o && o.placed && o.own && o.type === 'sprinkler_drip');
  const st2 = st0({ placed: 'bad' });
  assert.equal(P.restorePlaced(st2, w), 0);
  assert.equal(st2.placed, undefined);
});

test('HOOKS: правила постройки могут запретить поставить или убрать и что-то сделать', () => {
  OBJECTS.test_box = { name: 'Ящик', item: 'test_box', w: 2, h: 2 };
  ITEMS.test_box = { key: 'test_box', name: 'Ящик', tabs: ['build'], place: 'obj', objOf: 'test_box' };
  const log = [];
  P.registerPlaced('test_box', {
    canPlace: (st) => (st.coins < 5 ? 'Не хватает монет' : null),
    onPlace: (st, id, o, ctx) => { st.coins -= 5; log.push(['place', id, ctx.now]); },
    canStore: (st, o) => (o.busy ? 'Идёт стройка' : null),
    onStore: () => log.push(['store']),
  });
  const w = world(), st = st0({ coins: 4, items: { test_box: 1 } });
  assert.equal(P.placeObj(st, w, 'test_box', x0 + 1, y0 + 1, { now: 7 }).why, 'Не хватает монет');
  st.coins = 9;
  const o = P.placeObj(st, w, 'test_box', x0 + 1, y0 + 1, { now: 7 }).o;
  assert.equal(st.coins, 4);
  assert.deepEqual(log, [['place', 'test_box', 7]]);
  assert.equal(w.objectAt(x0 + 2, y0 + 2), o, 'объект 2×2 занимает все клетки');
  assert.equal(objCells(OBJECTS.test_box).length, 4);
  o.busy = true;
  assert.equal(P.storeObj(st, w, o).why, 'Идёт стройка');
  o.busy = false;
  assert.deepEqual(P.storeObj(st, w, o), { id: 'test_box' });
  assert.deepEqual(log[1], ['store']);
  delete OBJECTS.test_box; delete ITEMS.test_box; delete P.HOOKS.test_box;
});

console.log(`\nвсе проверки прошли: ${tests}`);
