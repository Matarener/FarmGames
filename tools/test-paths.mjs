// Проверка правил дорожек (src/game/paths.js) без браузера: node tools/test-paths.mjs
import assert from 'node:assert/strict';
import * as P from '../src/game/paths.js';
import { World, N, T, START_CHUNK, CHUNK, CHUNKS } from '../src/game/World.js';
import { PATHS, PATH_KEYS, DEFAULT_PATH, ITEMS, SHOP, INV_TABS, SHOP_TABS } from '../src/game/data.js';

let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
const st0 = (o = {}) => ({ coins: 0, gems: 0, level: 1, items: {}, ...o });
// пустой мир: только трава, открыт стартовый участок
function world() {
  const w = new World(1, { v: 2, n: N, tiles: [], objects: [], well: [0, 0], player: [1, 1] });
  return w;
}
const c0 = (START_CHUNK % CHUNKS) * CHUNK, r0 = Math.floor(START_CHUNK / CHUNKS) * CHUNK;
const at = (x, y) => (r0 + y) * N + c0 + x; // клетка внутри стартового участка

test('таблица: у каждого вида — предмет в «Декоре» и товар в магазине', () => {
  assert.equal(DEFAULT_PATH, 'path');
  assert.ok(INV_TABS.some((t) => t.key === 'decor') && SHOP_TABS.some((t) => t.key === 'decor'));
  for (const k of PATH_KEYS) {
    assert.deepEqual(ITEMS[k].tabs, ['decor']);
    assert.equal(ITEMS[k].place, 'path');
    const o = SHOP.find((s) => s.item === k);
    assert.ok(o && o.tab === 'decor' && o.price === PATHS[k].price && o.level === PATHS[k].level);
  }
  assert.ok(PATH_KEYS.length + 3 <= 9, 'вид дорожки в карте — одна цифра');
});

test('placePath / storePath / movePath: вид клетки сохраняется', () => {
  const w = world(), st = st0({ items: { path_sand: 2, path_cobble: 1 } });
  assert.equal(P.placePath(st, w, 'path_sand', at(3, 3)).put, 'path_sand');
  assert.equal(w.tiles[at(3, 3)], T.PATH);
  assert.equal(P.kindAt(w, at(3, 3)), 'path_sand');
  assert.equal(st.items.path_sand, 1);
  assert.deepEqual(st.paths, { path_sand: [at(3, 3)] });
  assert.equal(P.placePath(st, w, 'path_sand', at(3, 3)), null, 'тот же вид — ничего');
  // другой вид поверх: старая клетка — в рюкзак
  assert.deepEqual(P.placePath(st, w, 'path_cobble', at(3, 3)), { put: 'path_cobble', back: 'path_sand' });
  assert.equal(st.items.path_sand, 2); assert.equal(st.items.path_cobble, undefined);
  assert.equal(P.placePath(st, w, 'path_cobble', at(4, 3)), null, 'нечего класть');
  assert.equal(P.movePath(st, w, at(3, 3), at(5, 5)), 'path_cobble');
  assert.equal(w.tiles[at(3, 3)], T.GRASS); assert.equal(P.kindAt(w, at(5, 5)), 'path_cobble');
  assert.equal(P.storePath(st, w, at(5, 5)), 'path_cobble');
  assert.equal(st.items.path_cobble, 1); assert.deepEqual(st.paths, {});
  assert.equal(P.storePath(st, w, at(5, 5)), null);
});

test('restorePaths: старые сохранения — номера клеток, все «Тропинка»; занятая клетка — в рюкзак', () => {
  const w = world();
  const st = st0({ paths: [at(1, 1), at(1, 2), at(1, 1), -5] });
  w.tiles[at(1, 2)] = T.WATER; // на новой карте здесь вода
  assert.equal(P.restorePaths(st, w), 1);
  assert.equal(P.kindAt(w, at(1, 1)), 'path');
  assert.equal(w.tiles[at(1, 2)], T.WATER);
  assert.equal(st.items.path, 1);
  assert.deepEqual(st.paths, { path: [at(1, 1)] }, 'сохранение — в новом виде');
  // новый вид сохранения: по видам; неизвестный вид — по умолчанию
  const w3 = world(), st3 = st0({ paths: { path_planks: [at(2, 2)], nope: [at(3, 3)], path_cobble: 'x' } });
  assert.equal(P.restorePaths(st3, w3), 0);
  assert.equal(P.kindAt(w3, at(2, 2)), 'path_planks');
  assert.equal(P.kindAt(w3, at(3, 3)), 'path');
  assert.deepEqual(st3.paths, { path: [at(3, 3)], path_planks: [at(2, 2)] });
  // без st.paths — дорожки как на карте
  const w2 = world(); w2.tiles[at(4, 4)] = T.PATH;
  assert.equal(P.restorePaths(st0(), w2), 0); assert.equal(w2.tiles[at(4, 4)], T.PATH);
});

test('карта: вид дорожки — цифра 3 + номер вида, туда и обратно', () => {
  const w = world(), st = st0({ items: { path_stones: 1 } });
  w.tiles[at(1, 1)] = T.PATH;
  P.placePath(st, w, 'path_stones', at(2, 1));
  const m = w.toMap();
  const row = m.tiles[r0 + 1];
  assert.equal(row[c0 + 1], '3'); assert.equal(row[c0 + 2], String(3 + PATH_KEYS.indexOf('path_stones')));
  const w2 = new World(1, m);
  assert.equal(P.kindAt(w2, at(1, 1)), 'path'); assert.equal(P.kindAt(w2, at(2, 1)), 'path_stones');
});

test('травяной край: стороны, скруглённые и внутренние углы, «камни в траве» — как трава', () => {
  const w = world(), st = st0({ items: { path: 20, path_stones: 2 } });
  const put = (x, y, k = 'path') => P.placePath(st, w, k, at(x, y));
  // одиночная клетка: трава со всех сторон
  put(5, 5);
  const x = c0 + 5, y = r0 + 5;
  assert.equal(P.edgeKey(w, x, y), 15);
  assert.deepEqual(P.edgeParts(15).sort(), ['corner_e_out', 'corner_n_out', 'corner_s_out', 'corner_w_out', 'edge_ne', 'edge_nw', 'edge_se', 'edge_sw']);
  // площадь 3×3: у средней клетки травы нет
  for (let yy = 4; yy <= 6; yy++) for (let xx = 4; xx <= 6; xx++) if (xx !== 5 || yy !== 5) put(xx, yy);
  assert.equal(P.edgeKey(w, x, y), 0);
  assert.equal(P.edgeParts(0).length, 0);
  // убрали угловую клетку (4, 4): у средней — внутренний угол сверху (n)
  P.storePath(st, w, at(4, 4));
  assert.equal(P.edgeKey(w, x, y), 16);
  assert.deepEqual(P.edgeParts(16), ['corner_n_in']);
  // у клетки (4, 5): трава за nw и за ne (там клетка (4, 4)) — угол n скруглён, в углах e и w трава с одной стороны
  assert.deepEqual(P.edgeParts(P.edgeKey(w, c0 + 4, r0 + 5)).sort(), ['corner_e_ne', 'corner_n_out', 'corner_w_nw', 'edge_ne', 'edge_nw']);
  // «камни в траве» на месте (4, 4) — для края это трава, у самих камней края нет
  put(4, 4, 'path_stones');
  assert.equal(P.edgeKey(w, x, y), 16);
  assert.equal(P.edgeKey(w, c0 + 4, r0 + 4), 0);
  assert.equal(P.solidPath(w, c0 + 4, r0 + 4), false);
});

test('переход между видами: вид выше по слою заходит на нижний, нижний на верхний — нет', () => {
  const w = world(), st = st0({ items: { path: 20, path_sand: 20, path_cobble: 20, path_planks: 5, path_stones: 2 } });
  const put = (x, y, k) => P.placePath(st, w, k, at(x, y));
  // песок 3×3, посередине — песок; справа от него (x + 1) — тропинка, снизу по диагонали (x + 1, y + 1) — булыжник
  for (let yy = 4; yy <= 6; yy++) for (let xx = 4; xx <= 6; xx++) put(xx, yy, 'path_sand');
  put(6, 5, 'path'); put(6, 6, 'path_cobble');
  const x = c0 + 5, y = r0 + 5;
  // тропинка за стороной se (бит 2), булыжник — только по диагонали у вершины s (бит 16 << 2)
  assert.deepEqual(P.blendKeys(w, x, y), [['path', 4], ['path_cobble', 64]]);
  assert.deepEqual(P.edgeParts(64), ['corner_s_in']);
  // у тропинки песок ниже по слою — перехода нет; булыжник заходит на неё снизу (сторона sw)
  assert.deepEqual(P.blendKeys(w, c0 + 6, r0 + 5), [['path_cobble', 8]]);
  // у булыжника рядом только нижние — ничего; травяной край — как раньше (трава только снаружи)
  assert.deepEqual(P.blendKeys(w, c0 + 6, r0 + 6), []);
  assert.equal(P.edgeKey(w, x, y), 0);
  // настил — самый верхний: заходит на всех, на него — никто
  put(5, 4, 'path_planks');
  assert.deepEqual(P.blendKeys(w, x, y).map(([k]) => k), ['path', 'path_cobble', 'path_planks']);
  assert.deepEqual(P.blendKeys(w, c0 + 5, r0 + 4), []);
  // «камни в траве» — не дорожка для переходов (у соседей к ним травяной край)
  put(4, 5, 'path_stones');
  assert.deepEqual(P.blendKeys(w, c0 + 4, r0 + 5), []);
  assert.equal(P.edgeKey(w, x, y) & 1, 1);
  // у каждого вида, кроме «камней в траве», есть слой, и они разные
  const layers = Object.values(PATHS).filter((p) => !p.grassy).map((p) => p.layer);
  assert.equal(new Set(layers).size, layers.length);
  assert.ok(layers.every((l) => l > 0));
});

console.log(`\nвсе проверки прошли: ${tests}`);
