// Проверка правил зданий с крафтом (src/game/buildRules.js) без браузера: node tools/test-builds.mjs
import assert from 'node:assert/strict';
import * as B from '../src/game/buildRules.js';
import { BUILDINGS, RECIPES, CRAFT_GOODS, bpId, bldId } from '../src/game/buildData.js';
import { ITEMS, SHOP, OBJECTS, GEM_SPEEDUP_SEC } from '../src/game/data.js';
import * as P from '../src/game/placed.js';
import { World, N, START_CHUNK, CHUNK, CHUNKS } from '../src/game/World.js';

const T0 = Date.parse('2026-11-09T09:00:00Z'), M = 60e3;
const fresh = (o = {}) => ({ coins: 1000, gems: 50, xp: 0, level: 20, items: {}, stats: { cleared: 0, harvested: 0 }, ...o });
let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
// здание k готово к крафту (чертёж + материалы + стройка кончилась)
const built = (st, k, now = T0) => {
  st.items[bpId(k)] = 1;
  for (const [id, n] of Object.entries(BUILDINGS[k].cost)) st.items[id] = (st.items[id] || 0) + n;
  assert.ok(B.startBuild(st, k, now));
  B.speedBuild(st, k, now);
  B.buildTick(st, now);
};

test('tables: every id exists, shop has blueprints, objects 2x2', () => {
  for (const b of Object.values(BUILDINGS)) {
    for (const id of Object.keys(b.cost)) assert.ok(ITEMS[id], `${b.key} cost ${id}`);
    assert.ok(ITEMS[bpId(b.key)] && ITEMS[bldId(b.key)], b.key);
    assert.equal(ITEMS[bpId(b.key)].objOf, b.key);
    assert.equal(OBJECTS[b.key].item, bldId(b.key));
    assert.equal(OBJECTS[b.key].w * OBJECTS[b.key].h, 4);
    const offer = SHOP.find((o) => o.item === bpId(b.key));
    assert.ok(offer && offer.tab === 'build' && offer.price === b.blueprint && offer.level === b.level);
    assert.ok(Object.values(RECIPES).some((r) => r.at === b.key), `${b.key} has recipes`);
  }
  for (const r of Object.values(RECIPES)) {
    assert.ok(BUILDINGS[r.at], r.key);
    assert.ok(ITEMS[r.item], `${r.key} item ${r.item}`);
    for (const id of Object.keys(r.need)) assert.ok(ITEMS[id], `${r.key} needs ${id}`);
    assert.ok(r.level >= BUILDINGS[r.at].level, `${r.key} opens with its building`);
    assert.ok(r.time > 0 && r.n > 0);
  }
  for (const k of Object.keys(CRAFT_GOODS)) assert.ok(Object.values(RECIPES).some((r) => r.item === k), `${k} is crafted somewhere`);
  // блюдо даёт больше энергии, чем его продукты по отдельности
  for (const r of Object.values(RECIPES)) {
    const out = ITEMS[r.item];
    if (!out.food) continue;
    const raw = Object.entries(r.need).reduce((s, [id, n]) => s + (ITEMS[id].food || 0) * n, 0);
    assert.ok(out.food * r.n > raw, `${r.key}: ${out.food} vs ${raw}`);
  }
});

test('blueprint: level, one per farm', () => {
  const st = fresh({ level: 2 });
  assert.ok(B.blueprintBlock(st, 'kitchen').locked);
  st.level = 3;
  assert.equal(B.blueprintBlock(st, 'kitchen'), null);
  st.items.bp_kitchen = 1;
  assert.match(B.blueprintBlock(st, 'kitchen').why, /уже в рюкзаке/);
  built(st, 'kitchen');
  assert.equal(st.items.bp_kitchen, undefined);
  assert.match(B.blueprintBlock(st, 'kitchen').why, /уже есть/);
});

test('build: needs blueprint and materials, pays, takes time, xp once', () => {
  const st = fresh();
  assert.match(B.buildBlock(st, 'kitchen'), /Нет чертежа/);
  st.items.bp_kitchen = 1; st.items.wood = 5;
  assert.match(B.buildBlock(st, 'kitchen'), /Не хватает: дерево: 15, камень: 15/);
  assert.equal(B.startBuild(st, 'kitchen', T0), null);
  st.items.wood = 25; st.items.stone = 15;
  const r = B.startBuild(st, 'kitchen', T0);
  assert.equal(r.end, T0 + BUILDINGS.kitchen.time * 1000);
  assert.deepEqual(st.items, { wood: 5 });
  assert.ok(B.owned(st, 'kitchen'));
  assert.ok(!B.isBuilt(st, 'kitchen', T0 + 1000));
  assert.equal(B.buildLeft(st, 'kitchen', T0 + 60e3), BUILDINGS.kitchen.time - 60);
  assert.deepEqual(B.buildTick(st, T0 + 1000), []);
  assert.match(B.storeBlock(st, 'kitchen', T0 + 1000), /строится/);
  const end = T0 + BUILDINGS.kitchen.time * 1000;
  assert.deepEqual(B.buildTick(st, end), [{ k: 'kitchen', xp: BUILDINGS.kitchen.xp }]);
  assert.deepEqual(B.buildTick(st, end + 5000), []);
  assert.ok(B.isBuilt(st, 'kitchen', end));
  assert.equal(B.storeBlock(st, 'kitchen', end), null);
});

test('build speed-up costs gems by time left', () => {
  const st = fresh({ gems: 2 });
  st.items = { bp_forge: 1, planks: 10, stone: 25, ore: 4 };
  B.startBuild(st, 'forge', T0); // 20 мин
  assert.equal(B.gemsFor(20 * 60), Math.ceil(1200 / GEM_SPEEDUP_SEC));
  assert.deepEqual(B.speedBuild(st, 'forge', T0), { gems: 2 });
  assert.equal(st.gems, 0);
  assert.ok(B.isBuilt(st, 'forge', T0));
  assert.equal(B.speedBuild(st, 'forge', T0), null);
});

test('craft: chain, slots, collect, xp', () => {
  const st = fresh();
  built(st, 'kitchen');
  assert.match(B.craftBlock(st, 'kitchen', 'carrot_salad', T0), /Не хватает: морковь: 3/);
  assert.match(B.craftBlock(st, 'kitchen', 'planks', T0), /Здесь так не сделать/);
  st.items.carrot = 12; st.items.wheat = 2;
  const a = B.craft(st, 'kitchen', 'carrot_salad', T0);
  assert.deepEqual(a, { id: 'carrot_salad', start: T0, end: T0 + 2 * M });
  const b = B.craft(st, 'kitchen', 'bread', T0 + M);
  assert.deepEqual(b, { id: 'bread', start: T0 + 2 * M, end: T0 + 5 * M }); // после салата
  B.craft(st, 'kitchen', 'carrot_salad', T0 + M);
  assert.equal(st.items.carrot, 6);
  assert.match(B.craftBlock(st, 'kitchen', 'carrot_salad', T0 + M), /Очередь занята/);
  let v = B.queueView(st, 'kitchen', T0 + M);
  assert.equal(v.free, 0); assert.equal(v.ready, 0);
  assert.ok(v.jobs[0].running && Math.abs(v.jobs[0].k - 0.5) < 1e-9);
  assert.equal(B.collect(st, 'kitchen', T0 + M), null);
  v = B.queueView(st, 'kitchen', T0 + 3 * M);
  assert.equal(v.ready, 1); assert.ok(v.jobs[1].running);
  assert.equal(B.readyCount(st, 'kitchen', T0 + 3 * M), 1);
  const c = B.collect(st, 'kitchen', T0 + 3 * M);
  assert.deepEqual(c, { items: [{ id: 'carrot_salad', n: 1 }], xp: 2 });
  assert.equal(st.items.carrot_salad, 1);
  // место освободилось: новый товар встаёт после последнего
  const d = B.craft(st, 'kitchen', 'carrot_salad', T0 + 3 * M);
  assert.equal(d.start, T0 + 7 * M);
  // всё готово, забираем разом; одинаковые товары складываются
  const all = B.collect(st, 'kitchen', T0 + 60 * M);
  assert.deepEqual(all, { items: [{ id: 'bread', n: 1 }, { id: 'carrot_salad', n: 2 }], xp: 2 + 2 * 2 });
  assert.equal(B.queueView(st, 'kitchen', T0 + 60 * M).free, 3);
  // готовое не мешает: новый товар начинается сейчас
  st.items.wheat = 2;
  assert.equal(B.craft(st, 'kitchen', 'bread', T0 + 60 * M).start, T0 + 60 * M);
});

test('craft needs the building finished and the level', () => {
  const st = fresh({ level: 5 });
  st.items = { bp_kitchen: 1, wood: 20, stone: 15, pumpkin: 1, milk: 1, carrot: 3 };
  B.startBuild(st, 'kitchen', T0);
  assert.match(B.craftBlock(st, 'kitchen', 'carrot_salad', T0), /строится/);
  B.speedBuild(st, 'kitchen', T0);
  assert.equal(B.craftBlock(st, 'kitchen', 'carrot_salad', T0), null);
  assert.match(B.craftBlock(st, 'kitchen', 'pumpkin_porridge', T0), /с 10 уровня/);
  const list = B.recipesOf(st, 'kitchen', T0);
  assert.equal(list[0].r.key, 'carrot_salad');
  assert.ok(list.find((x) => x.r.key === 'pumpkin_porridge').open === false);
});

test('cancel: only waiting jobs, refund, later jobs move up', () => {
  const st = fresh();
  built(st, 'carpentry');
  st.items.wood = 9;
  B.craft(st, 'carpentry', 'planks', T0);            // 0–2
  B.craft(st, 'carpentry', 'planks', T0);            // 2–4
  B.craft(st, 'carpentry', 'planks', T0);            // 4–6
  assert.equal(st.items.wood, undefined);
  assert.equal(B.cancel(st, 'carpentry', 0, T0), null); // уже делается
  assert.deepEqual(B.cancel(st, 'carpentry', 1, T0 + M), { id: 'planks' });
  assert.equal(st.items.wood, 3);
  const q = B.rec(st, 'carpentry').q;
  assert.equal(q.length, 2);
  assert.deepEqual(q[1].slice(1), [T0 + 2 * M, T0 + 4 * M]);
});

test('speed-up of the running job moves the rest', () => {
  const st = fresh({ gems: 5 });
  built(st, 'forge');
  st.items.ore = 4; st.items.wood = 4;
  B.craft(st, 'forge', 'iron_ingot', T0);  // 0–5
  B.craft(st, 'forge', 'iron_ingot', T0);  // 5–10
  assert.deepEqual(B.speedCraft(st, 'forge', T0 + M), { gems: 1 });
  const q = B.rec(st, 'forge').q;
  assert.equal(q[0][2], T0 + M);
  assert.deepEqual(q[1].slice(1), [T0 + M, T0 + 6 * M]);
  const c = B.collect(st, 'forge', T0 + M);
  assert.deepEqual(c.items, [{ id: 'iron_ingot', n: 1 }]);
  // гвозди — 8 штук за раз
  B.collect(st, 'forge', T0 + 6 * M);
  B.craft(st, 'forge', 'nails', T0 + 6 * M);
  assert.deepEqual(B.collect(st, 'forge', T0 + 9 * M).items, [{ id: 'nails', n: 8 }]);
});

test('later buildings need crafted materials', () => {
  const st = fresh();
  st.items = { bp_stonecutter: 1, planks: 12, stone: 15 };
  assert.match(B.buildBlock(st, 'stonecutter'), /гвозди: 10/);
  st.items.nails = 10;
  assert.equal(B.buildBlock(st, 'stonecutter'), null);
});

test('map: blueprint is placed as a construction site, built one goes to the bag and back', () => {
  const w = new World(1, { v: 2, n: N, tiles: [], objects: [], well: [0, 0], player: [1, 1] });
  const x0 = (START_CHUNK % CHUNKS) * CHUNK + 1, y0 = Math.floor(START_CHUNK / CHUNKS) * CHUNK + 1;
  const st = fresh();
  // чертёж — только на рынке и один
  const offer = SHOP.find((o) => o.item === 'bp_kitchen');
  assert.deepEqual(B.buyBlueprint(st, 'kitchen', offer), { id: 'bp_kitchen', n: 1, cost: 50, cur: 'coins' });
  assert.match(B.buyBlueprint(st, 'kitchen', offer).why, /уже в рюкзаке/);
  assert.equal(st.coins, 950);
  // материалов не хватает — не поставить, чертёж остаётся
  assert.match(P.placeWhy(st, w, 'bp_kitchen', x0, y0, { now: T0 }), /Не хватает: дерево: 20, камень: 15/);
  st.items.wood = 20; st.items.stone = 15;
  const { o } = P.placeObj(st, w, 'bp_kitchen', x0, y0, { now: T0 });
  assert.ok(o && o.type === 'kitchen' && o.placed);
  assert.equal(w.objectAt(x0 + 1, y0 + 1), o);
  assert.deepEqual(st.items, {});
  assert.ok(!B.isBuilt(st, 'kitchen', T0 + 1000));
  assert.match(P.storeWhy(st, o, { now: T0 + 1000 }), /строится/);
  assert.match(B.blueprintBlock(st, 'kitchen').why, /уже есть/);
  // достроилась — в рюкзак и обратно, очередь и стройка не теряются
  const end = T0 + BUILDINGS.kitchen.time * 1000;
  B.buildTick(st, end);
  st.items.carrot = 3; B.craft(st, 'kitchen', 'carrot_salad', end);
  assert.deepEqual(P.storeObj(st, w, o, { now: end }), { id: 'bld_kitchen' });
  assert.equal(w.objectAt(x0 + 1, y0 + 1), null);
  assert.equal(P.placeWhy(st, w, 'bld_kitchen', x0 + 3, y0, { now: end }), null);
  const o2 = P.placeObj(st, w, 'bld_kitchen', x0 + 3, y0, { now: end }).o;
  assert.ok(o2 && B.isBuilt(st, 'kitchen', end));
  assert.equal(B.queueView(st, 'kitchen', end).jobs.length, 1);
  assert.deepEqual(st.placed, [['kitchen', x0 + 3, y0]]);
  // здание, выданное без записи (режим тестера), ставится сразу готовым
  const st2 = fresh({ items: { bld_forge: 1 } });
  P.placeObj(st2, w, 'bld_forge', x0, y0 + 3, { now: T0 });
  assert.ok(B.isBuilt(st2, 'forge', T0));
  assert.deepEqual(B.buildTick(st2, T0), []);
});

console.log(`\n${tests} tests passed`);
