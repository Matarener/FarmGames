// Проверка правил прудов (src/game/ponds.js, пруды в World.js) без браузера: node tools/test-ponds.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../src/game/ponds.js';
import { World, mapId, N, T, START_CHUNK, CHUNK, CHUNKS } from '../src/game/World.js';
import { PONDS, OBJECTS, ITEMS, SHOP, POND_DECOR, pondDecorId } from '../src/game/data.js';
import { pondDecorPos } from '../src/game/World.js';

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
  // каждая клетка воды карты — вода какого-то пруда; новая вода — только залитые островки
  // (трава, со всех четырёх сторон вода)
  const wet = (x, y) => MAP.tiles[y] && MAP.tiles[y][x] === '2';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    assert.notEqual(w.tiles[y * N + x], T.WATER, 'в tiles воды больше нет');
    if (wet(x, y)) assert.ok(w.isWater(x, y), `вода ${x},${y}`);
    else if (w.isWater(x, y)) assert.ok(wet(x - 1, y) && wet(x + 1, y) && wet(x, y - 1) && wet(x, y + 1), `островок ${x},${y}`);
  }
  // у прудов стартовой карты — камыш, рогоз и камни, как в таблице вида
  for (const o of w.objects.filter(P.isPond)) assert.deepEqual(o.decor, PONDS[o.type].decor);
  assert.ok(w.decor.length > 0, 'камыши у прудов');
  // туда-обратно: карта из редактора с прудами и украшениями — та же карта
  const m = w.toMap();
  assert.deepEqual(m.ponds.map((p) => p.slice(0, 3)), list);
  assert.ok(m.ponds.every((p) => Array.isArray(p[3])), 'украшения записаны в карту');
  const w2 = new World(1, m);
  assert.deepEqual(ponds(w2), list);
  assert.deepEqual(w2.objects.filter(P.isPond).map((o) => o.decor), w.objects.filter(P.isPond).map((o) => o.decor));
  assert.equal(w2.genCount, w.genCount);
});

test('кусок воды с островком: островок заливается, пруд целый', () => {
  const tiles = Array.from({ length: N }, () => '0'.repeat(N));
  const put = (x, y) => { tiles[y] = tiles[y].slice(0, x) + '2' + tiles[y].slice(x + 1); };
  PONDS.pond_round.water.forEach(([dx, dy]) => { if (dx !== 1 || dy !== 2) put(c0 + 2 + dx, r0 + 2 + dy); });
  const w = new World(1, empty({ tiles }));
  assert.deepEqual(ponds(w), [['pond_round', c0 + 2, r0 + 2]]);
  assert.ok(w.isWater(c0 + 3, r0 + 4));
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
  assert.deepEqual(o.decor, [], 'купленный пруд — без украшений');
  const dv = w.decorV;
  assert.deepEqual(P.storePond(st, w, o), [{ id: 'pond_drop', n: 1 }]);
  assert.equal(st.items.pond_drop, 1);
  assert.deepEqual(st.ponds, []);
  assert.ok(w.decorV > dv && w.decor.length === 0);
  assert.equal(P.storePond(st, w, o), null, 'уже убран');
});

test('украшения: таблица, только на воду пруда, по одному на клетку, у берега — ближе к земле', () => {
  for (const [t, d] of Object.entries(POND_DECOR)) {
    const id = pondDecorId(t);
    assert.equal(ITEMS[id].place, 'pondDecor');
    assert.deepEqual(ITEMS[id].tabs, ['decor']);
    const o = SHOP.find((s) => s.item === id);
    assert.ok(o && o.tab === 'decor' && o.price === d.price && o.level === d.level, t);
  }
  for (const [k, p] of Object.entries(PONDS)) for (const [t, dx, dy] of p.decor) assert.ok(POND_DECOR[t] && p.cells[dy][dx] === 'w', `${k}: ${t} на воде`);
  // точка у берега сдвинута к земле, посреди воды — середина клетки
  assert.deepEqual(pondDecorPos('pond_big', 2, 2), [2.5, 2.5]);
  const [lx, ly] = pondDecorPos('pond_big', 0, 2);
  assert.ok(lx < 0.5 && ly === 2.5);
  const w = new World(1, empty()), st = st0({ items: { pond_reeds: 2, pond_rocks: 1 } });
  const o = w.add('pond_round', c0 + 2, r0 + 2);
  assert.equal(P.canDecor(w, c0 + 2, r0 + 2).why, 'water', 'угол — не вода');
  assert.equal(P.canDecor(w, c0 + 1, r0 + 1).why, 'water', 'трава');
  assert.equal(P.placeDecor(st, w, 'pond_reeds', c0 + 7, r0 + 7), null);
  assert.equal(P.placeDecor(st, w, 'pond_reeds', c0 + 2, r0 + 3), o);
  assert.deepEqual(o.decor, [['reeds', 0, 1]]);
  assert.equal(st.items.pond_reeds, 1);
  assert.deepEqual(st.ponds, [['pond_round', c0 + 2, r0 + 2, [['reeds', 0, 1]]]]);
  assert.equal(P.canDecor(w, c0 + 2, r0 + 3).why, 'busy');
  assert.equal(P.placeDecor(st, w, 'pond_reeds', c0 + 2, r0 + 3), null, 'на клетке уже есть');
  assert.equal(P.placeDecor(st, w, 'pond_small', c0 + 3, r0 + 3), null, 'пруд — не украшение');
  assert.equal(w.decor.length, 1);
  // перенести на другую клетку и на другой пруд
  assert.equal(P.moveDecor(st, w, o, 0, 1, c0 + 2, r0 + 3), false, 'то же место');
  assert.equal(P.moveDecor(st, w, o, 0, 1, c0 + 5, r0 + 4), true);
  assert.deepEqual(o.decor, [['reeds', 3, 2]]);
  const o2 = w.add('pond_small', c0 + 7, r0 + 7);
  assert.equal(P.moveDecor(st, w, o, 3, 2, c0 + 8, r0 + 8), true);
  assert.deepEqual(o.decor, []); assert.deepEqual(o2.decor, [['reeds', 1, 1]]);
  // пруд переставили — украшение с ним
  assert.equal(P.movePond(st, w, o2, c0 + 6, r0 + 7), true);
  assert.deepEqual(w.decor.map((d) => [d.type, d.gx, d.gy]), [['reeds', c0 + 7, r0 + 8]]);
  // в рюкзак: украшение отдельно, пруд — вместе со своими украшениями
  assert.equal(P.storeDecor(st, w, o2, 0, 0), null, 'там пусто');
  assert.equal(P.placeDecor(st, w, 'pond_rocks', c0 + 6, r0 + 7), o2);
  assert.equal(P.storeDecor(st, w, o2, 0, 0), 'pond_rocks');
  assert.equal(st.items.pond_rocks, 1);
  assert.deepEqual(P.storePond(st, w, o2), [{ id: 'pond_small', n: 1 }, { id: 'pond_reeds', n: 1 }]);
  assert.equal(st.items.pond_reeds, 2);
  assert.equal(w.decor.length, 0);
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
  // у первого — камыш на воде и «украшение» на углу (не вода: в рюкзак); у второго — рогоз (в рюкзак с ним)
  st.ponds = [[map[0][0], map[0][1], map[0][2], [['reeds', 1, 1], ['rocks', 0, 0], ['nope', 1, 2]]],
    ['pond_small', x, y, [['cattail', 0, 0]]], ['nope', 1, 1]];
  w.add('oak', x, y);
  assert.equal(P.restorePonds(st, w), 3);
  assert.equal(st.items.pond_small, 1);
  assert.equal(st.items.pond_rocks, 1);
  assert.equal(st.items.pond_cattail, 1);
  assert.deepEqual(ponds(w), [map[0]]);
  assert.deepEqual(st.ponds, [[...map[0], [['reeds', 1, 1]]]]);
});

test('берег: нажали на середину большого пруда — ближайшая вода, у которой можно встать', () => {
  const w = new World(1, empty());
  const o = w.add('pond_big', c0 + 2, r0 + 2);
  const mx = c0 + 4, my = r0 + 4; // середина: вокруг только вода
  assert.equal(w.pondAt(mx, my), o);
  const c = P.shoreCell(w, o, mx, my);
  assert.ok(c && w.isWater(c.x, c.y) && (c.x !== mx || c.y !== my));
  let near = false;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (w.walkable(c.x + i, c.y + j)) near = true;
  assert.ok(near);
  const all = P.shoreCells(w);
  assert.ok(all.length > 0 && all.every((s) => s.o === o && w.isWater(s.x, s.y)));
  assert.ok(!all.some((s) => s.x === mx && s.y === my));
});

console.log(`\nвсе проверки прошли: ${tests}`);
