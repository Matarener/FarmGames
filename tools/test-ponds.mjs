// Проверка правил прудов (src/game/ponds.js, пруды в World.js) без браузера: node tools/test-ponds.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../src/game/ponds.js';
import { World, mapId, N, T, START_CHUNK, CHUNK, CHUNKS } from '../src/game/World.js';
import { PONDS, OBJECTS, ITEMS, SHOP } from '../src/game/data.js';

let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
const st0 = (o = {}) => ({ coins: 0, gems: 0, level: 1, items: {}, ...o });
const empty = (o = {}) => ({ v: 2, n: N, tiles: [], objects: [], well: [0, 0], player: [1, 1], ...o });
const c0 = (START_CHUNK % CHUNKS) * CHUNK, r0 = Math.floor(START_CHUNK / CHUNKS) * CHUNK;
const MAP = JSON.parse(readFileSync(new URL('../assets/map.json', import.meta.url), 'utf8'));
const ponds = (w) => w.objects.filter(P.isPond).map((o) => [o.type, o.gx, o.gy]);

test('таблица: формы, вода, предмет в «Декоре» и товар в магазине', () => {
  for (const [k, p] of Object.entries(PONDS)) {
    assert.equal(p.key, k);
    assert.ok(p.cells.every((r) => r.length === p.w) && p.cells.length === p.h, k);
    assert.ok(p.water.length >= 4 && p.occ.length >= p.water.length, k);
    assert.deepEqual(OBJECTS[k].cells, p.occ);
    assert.ok(OBJECTS[k].flat && OBJECTS[k].static);
    assert.equal(ITEMS[k].place, 'pond');
    assert.deepEqual(ITEMS[k].tabs, ['decor']);
    const o = SHOP.find((s) => s.item === k);
    assert.ok(o && o.tab === 'decor' && o.price === p.price && o.level === p.level, k);
    for (const [, x, y] of p.decor || []) assert.ok(x >= 0 && y >= 0 && x <= p.w && y <= p.h, `${k}: камыш внутри рамки`);
  }
});

test('стартовая карта: вода → пруды по формам, отпечаток карты прежний', () => {
  const w = new World(1, MAP);
  assert.equal(w.mapId, mapId(MAP));
  const list = ponds(w);
  assert.ok(list.length >= 1);
  let water = 0;
  for (const r of MAP.tiles) for (const c of r) if (c === '2') water++;
  // каждая клетка воды карты — вода какого-то пруда, и никакой другой воды нет
  let got = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const was = MAP.tiles[y][x] === '2';
    assert.equal(w.isWater(x, y), was, `${x},${y}`);
    if (was) got++;
    assert.notEqual(w.tiles[y * N + x], T.WATER, 'в tiles воды больше нет');
  }
  assert.equal(got, water);
  // туда-обратно: карта из редактора с прудами — та же карта
  const m = w.toMap();
  assert.equal(mapId(m), mapId(MAP));
  assert.deepEqual(m.ponds, list);
  const w2 = new World(1, m);
  assert.deepEqual(ponds(w2), list);
  assert.equal(w2.genCount, w.genCount);
  assert.ok(w.decor.length > 0, 'камыши у прудов');
});

test('кусок воды неизвестной формы: большие формы внутрь, остаток — трава', () => {
  const tiles = Array.from({ length: N }, () => '0'.repeat(N));
  const put = (x, y) => { tiles[y] = tiles[y].slice(0, x) + '2' + tiles[y].slice(x + 1); };
  for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) put(c0 + 1 + x, r0 + 1 + y); // 6×3
  const w = new World(1, empty({ tiles }));
  assert.ok(ponds(w).length >= 1);
  for (let i = 0; i < N * N; i++) assert.notEqual(w.tiles[i], T.WATER);
});

test('canPlace: край, закрытый участок, грядка, занято; переставляемый пруд не мешает сам себе', () => {
  const w = new World(1, empty()), k = 'pond_round';
  assert.equal(P.canPlace(w, k, c0 + 2, r0 + 2).ok, true);
  assert.equal(P.canPlace(w, k, -3, 5).why, 'edge');
  assert.equal(P.canPlace(w, k, c0 + CHUNK - 2, r0 + 2).why, 'locked');
  w.tiles[(r0 + 3) * N + c0 + 3] = T.SOIL;
  assert.equal(P.canPlace(w, k, c0 + 2, r0 + 2).why, 'tile');
  w.tiles[(r0 + 3) * N + c0 + 3] = T.GRASS;
  // угол круглого пруда — не его клетка: дерево в углу не мешает
  w.add('oak', c0 + 2, r0 + 2);
  assert.equal(P.canPlace(w, k, c0 + 2, r0 + 2).ok, true);
  w.add('rock', c0 + 3, r0 + 3);
  assert.equal(P.canPlace(w, k, c0 + 2, r0 + 2).why, 'busy');
  const o = w.add('pond_small', c0 + 6, r0 + 6);
  assert.equal(P.canPlace(w, 'pond_small', c0 + 6, r0 + 5).why, 'busy');
  assert.equal(P.canPlace(w, 'pond_small', c0 + 6, r0 + 5, o).ok, true);
});

test('купленный пруд: поставить, переставить, убрать в рюкзак — st.ponds помнит все пруды', () => {
  const w = new World(1, empty()), st = st0({ items: { pond_drop: 1 } });
  assert.equal(P.placePond(st, w, 'pond_drop', -3, 0), null, 'за краем — нельзя');
  const o = P.placePond(st, w, 'pond_drop', c0 + 2, r0 + 2);
  assert.ok(o && o.type === 'pond_drop');
  assert.equal(st.items.pond_drop, undefined);
  assert.deepEqual(st.ponds, [['pond_drop', c0 + 2, r0 + 2]]);
  assert.equal(w.isWater(c0 + 2, r0 + 2), true);
  assert.equal(w.isWater(c0 + 4, r0 + 2), false, 'угол капельки — трава');
  assert.equal(w.walkable(c0 + 2, r0 + 2), false);
  assert.equal(P.placePond(st, w, 'pond_drop', c0 + 5, r0 + 5), null, 'в рюкзаке больше нет');
  assert.equal(P.movePond(st, w, o, c0 + 5, r0 + 4), true);
  assert.deepEqual(st.ponds, [['pond_drop', c0 + 5, r0 + 4]]);
  assert.equal(w.isWater(c0 + 2, r0 + 2), false);
  assert.equal(w.walkable(c0 + 2, r0 + 2), true, 'старое место освободилось');
  const dv = w.decorV;
  assert.equal(P.storePond(st, w, o), 'pond_drop');
  assert.equal(st.items.pond_drop, 1);
  assert.deepEqual(st.ponds, []);
  assert.ok(w.decorV > dv && w.decor.length === 0, 'камыши ушли вместе с прудом');
  assert.equal(P.storePond(st, w, o), null, 'уже убран');
});

test('загрузка: пруды игрока вместо прудов карты, место занято — пруд в рюкзак', () => {
  const w0 = new World(1, MAP);
  const map = ponds(w0);
  const st = st0();
  assert.equal(P.restorePonds(st, w0), 0, 'не трогал пруды — как на карте');
  assert.deepEqual(ponds(w0), map);
  // игрок переставил первый пруд и купил ещё один; второй — туда, где теперь (по новой карте) дерево
  const w = new World(1, MAP);
  const x = c0 + 1, y = r0 + 1;
  st.ponds = [[map[0][0], map[0][1], map[0][2]], ['pond_small', x, y], ['nope', 1, 1]];
  w.add('oak', x, y);
  assert.equal(P.restorePonds(st, w), 1);
  assert.equal(st.items.pond_small, 1);
  assert.deepEqual(ponds(w), [map[0]]);
  assert.deepEqual(st.ponds, [map[0]]);
});

test('берег: нажали на середину или островок — ближайшая вода, у которой можно встать', () => {
  const w = new World(1, empty());
  const o = w.add('pond_island', c0 + 2, r0 + 2);
  const p = PONDS.pond_island;
  // островок
  const [ix, iy] = p.occ.find(([dx, dy]) => p.cells[dy][dx] === 'i');
  assert.equal(w.isWater(c0 + 2 + ix, r0 + 2 + iy), false);
  assert.equal(w.pondAt(c0 + 2 + ix, r0 + 2 + iy), o);
  const c = P.shoreCell(w, o, c0 + 2 + ix, r0 + 2 + iy);
  assert.ok(c && w.isWater(c.x, c.y));
  let near = false;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (w.walkable(c.x + i, c.y + j)) near = true;
  assert.ok(near);
  const all = P.shoreCells(w);
  assert.ok(all.length > 0 && all.every((s) => s.o === o && w.isWater(s.x, s.y)));
});

console.log(`\nвсе проверки прошли: ${tests}`);
