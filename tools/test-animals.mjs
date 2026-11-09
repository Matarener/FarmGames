// Проверка правил животных (animalRules.js, placed.js с данными построек, Кормоцех) без браузера:
// node tools/test-animals.mjs
import assert from 'node:assert/strict';
import * as A from '../src/game/animalRules.js';
import * as P from '../src/game/placed.js';
import * as BR from '../src/game/buildRules.js';
import * as SA from '../src/game/storeAll.js';
import { ANIMALS, ANIMAL_GOODS, animalType, FEED_XP } from '../src/game/animalData.js';
import { BUILDINGS, RECIPES } from '../src/game/buildData.js';
import { World, N, START_CHUNK, CHUNK, CHUNKS } from '../src/game/World.js';
import { ITEMS, OBJECTS, SHOP, INV_TABS, SHOP_TABS, SELL_TABS, STORE_ALL } from '../src/game/data.js';

let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
const st0 = (o = {}) => ({ coins: 0, gems: 0, level: 10, items: {}, ...o });
const world = () => new World(1, { v: 2, n: N, tiles: [], objects: [], well: [0, 0], player: [1, 1] });
const x0 = (START_CHUNK % CHUNKS) * CHUNK, y0 = Math.floor(START_CHUNK / CHUNKS) * CHUNK;
const MIN = 60e3;

test('таблица: у каждой стадии — объект, предмет в «Животных» и картинка; детёныши на рынке', () => {
  assert.ok(INV_TABS.some((t) => t.key === 'animals') && SHOP_TABS.some((t) => t.key === 'animals') && SELL_TABS.includes('animals'));
  for (const a of Object.values(ANIMALS)) {
    assert.equal(a.names.length, 3);
    assert.equal(a.feeds.length, 2);
    assert.equal(a.time.length, 3);
    assert.ok(ITEMS[a.feed] && RECIPES[a.feed] && RECIPES[a.feed].at === 'feedmill', `корм ${a.feed} делает Кормоцех`);
    assert.ok(ITEMS[a.product] && ITEMS[a.product].sell > 0, `продукт ${a.product} продаётся`);
    for (let i = 0; i < 3; i++) {
      const t = animalType(a.key, i);
      assert.equal(OBJECTS[t].animal, a.key);
      assert.equal(OBJECTS[t].item, t);
      assert.equal(OBJECTS[t].rot, 2, 'разворачивается зеркалом');
      assert.equal(ITEMS[t].place, 'obj');
      assert.ok(ITEMS[t].tabs.includes('animals'));
      assert.ok(!ITEMS[t].sell, 'животных не продают');
      assert.equal(P.objOf(t), t);
    }
    const o = SHOP.find((x) => x.item === animalType(a.key, 0));
    assert.ok(o && o.tab === 'animals' && o.price === a.price && o.level === a.level);
    assert.ok(!SHOP.some((x) => x.item === animalType(a.key, 1) || x.item === animalType(a.key, 2)), 'на рынке только детёныши');
  }
  for (const g of Object.keys(ANIMAL_GOODS)) assert.ok(ITEMS[g].tabs.includes('animals'));
  assert.ok(BUILDINGS.feedmill && SHOP.some((x) => x.item === 'bp_feedmill'));
  assert.ok(STORE_ALL.some((g) => g.key === 'animals'));
});

test('цыплёнок: 3 кормления → молодка, ещё 3 → курица, она несёт яйцо', () => {
  const w = world(), st = st0({ items: { animal_chicken_baby: 1, feed_grain: 10 } });
  const o = P.placeObj(st, w, 'animal_chicken_baby', x0 + 2, y0 + 2, { now: 0 }).o;
  assert.ok(o && o.data, 'у животного есть состояние');
  assert.deepEqual(st.placed[0].slice(0, 4), ['animal_chicken_baby', x0 + 2, y0 + 2, 0]);
  assert.equal(st.placed[0][4], o.data, 'в сохранении — тот же объект состояния');
  let now = 0;
  assert.equal(A.stateOf(o, now), 'hungry');
  const r = A.feed(st, w, o, now);
  assert.equal(r.feed, 'feed_grain'); assert.equal(r.xp, FEED_XP);
  assert.equal(st.items.feed_grain, 9);
  assert.equal(A.stateOf(o, now + MIN), 'eating');
  assert.ok(A.feed(st, w, o, now + MIN).why, 'пока ест — не кормится');
  assert.ok(A.eatPart(o, now + 2.5 * MIN) > 0.49 && A.eatPart(o, now + 2.5 * MIN) < 0.51);
  // доело — отмечается при следующем кормлении (или tick)
  for (let k = 0; k < 2; k++) { now += 5 * MIN; A.feed(st, w, o, now); }
  now += 5 * MIN;
  const ev = A.tick(st, w, now);
  assert.equal(ev.length, 1); assert.equal(ev[0].grew, 1);
  assert.equal(o.type, 'animal_chicken_young');
  assert.equal(st.placed[0][0], 'animal_chicken_young', 'в сохранении — новая стадия');
  assert.equal(o.data.f, 0);
  for (let k = 0; k < 3; k++) { A.feed(st, w, o, now); now += 10 * MIN; }
  assert.equal(A.tick(st, w, now)[0].grew, 2);
  assert.equal(o.type, 'animal_chicken');
  assert.equal(A.collect(st, w, o, now), null, 'взрослое ещё не кормили — нечего забрать');
  A.feed(st, w, o, now);
  assert.equal(A.collect(st, w, o, now + MIN), null, 'ещё ест');
  now += 20 * MIN;
  assert.equal(A.stateOf(o, now), 'done');
  assert.ok(A.tick(st, w, now)[0].ready);
  assert.equal(A.stateOf(o, now), 'ready');
  assert.ok(A.feed(st, w, o, now).why, 'с готовым яйцом не кормится');
  const c = A.collect(st, w, o, now);
  assert.deepEqual([c.id, c.n], ['egg', 1]);
  assert.equal(st.items.egg, 1);
  assert.equal(A.stateOf(o, now), 'hungry');
  assert.equal(st.items.feed_grain, 10 - 7);
});

test('нет корма — причина noFeed, корм не уходит', () => {
  const w = world(), st = st0({ items: { animal_cow_baby: 1 } });
  const o = P.placeObj(st, w, 'animal_cow_baby', x0 + 2, y0 + 2, { now: 0 }).o;
  const r = A.feed(st, w, o, 0);
  assert.ok(r.why && r.noFeed);
  assert.equal(A.stateOf(o, 0), 'hungry');
});

test('ускорение за кристаллы: доедает сейчас, у молодого может подрасти', () => {
  const w = world(), st = st0({ gems: 5, items: { animal_pig_young: 1, feed_mash: 5 } });
  const o = P.placeObj(st, w, 'animal_pig_young', x0 + 2, y0 + 2, { now: 0 }).o;
  o.data.f = 3; // ещё одно кормление — и свинья
  const t0 = 1e9;
  A.feed(st, w, o, t0);
  assert.equal(A.gemsFor(A.eatLeft(o, t0)), 3);
  const r = A.speed(st, w, o, t0);
  assert.equal(r.gems, 3); assert.equal(st.gems, 2);
  assert.equal(r.grew, 2);
  assert.equal(o.type, 'animal_pig');
  assert.equal(A.speed(st, w, o, t0), null, 'не ест — ускорять нечего');
});

test('в рюкзак и обратно: животное помнит кормления и продолжает есть', () => {
  const w = world(), st = st0({ items: { animal_sheep_baby: 1, feed_hay: 5 } });
  const o = P.placeObj(st, w, 'animal_sheep_baby', x0 + 2, y0 + 2, { now: 0 }).o;
  A.feed(st, w, o, 0);
  A.feed(st, w, o, 20 * MIN); // первое доело, второе началось
  assert.equal(o.data.f, 1);
  const s = P.storeObj(st, w, o, { now: 21 * MIN });
  assert.equal(s.id, 'animal_sheep_baby');
  assert.equal(st.animalBag.animal_sheep_baby.length, 1);
  assert.equal(st.placed.length, 0);
  const o2 = P.placeObj(st, w, 'animal_sheep_baby', x0 + 5, y0 + 5, { now: 30 * MIN }).o;
  assert.equal(o2.data.f, 1);
  assert.ok(!st.animalBag, 'очередь опустела');
  assert.equal(A.stateOf(o2, 30 * MIN), 'eating', 'ест дальше');
  A.tick(st, w, 41 * MIN);
  assert.equal(o2.data.f, 2);
  // новый детёныш с рынка — с нуля
  st.items.animal_sheep_baby = 1;
  const o3 = P.placeObj(st, w, 'animal_sheep_baby', x0 + 6, y0 + 6, { now: 0 }).o;
  assert.equal(o3.data.f, 0);
});

test('загрузка: состояние из st.placed возвращается в объект; занятое место — в рюкзак с состоянием', () => {
  const w = world(), st = st0({ items: { animal_goose: 1, feed_grain: 1 } });
  const o = P.placeObj(st, w, 'animal_goose', x0 + 2, y0 + 2, { now: 0 }, 1).o;
  A.feed(st, w, o, 0);
  const saved = JSON.parse(JSON.stringify(st));
  assert.deepEqual(saved.placed[0].slice(0, 4), ['animal_goose', x0 + 2, y0 + 2, 1]);
  const w2 = world();
  P.restorePlaced(saved, w2);
  const g = w2.objects.find((x) => x && x.type === 'animal_goose');
  assert.equal(g.rot, 1);
  assert.equal(g.data.t, 40 * MIN);
  assert.equal(saved.placed[0][4], g.data);
  // место занято (на карте камень) — гусь в рюкзак, его состояние — в очередь
  const saved2 = JSON.parse(JSON.stringify(st)), w3 = world();
  w3.add('rock', x0 + 2, y0 + 2);
  P.restorePlaced(saved2, w3);
  assert.equal(saved2.items.animal_goose, 1);
  assert.equal(saved2.animalBag.animal_goose[0].t, 40 * MIN);
});

test('перестановка и поворот сохраняют состояние', () => {
  const w = world(), st = st0({ items: { animal_rabbit: 1, feed_rabbit: 1 } });
  const o = P.placeObj(st, w, 'animal_rabbit', x0 + 2, y0 + 2, { now: 0 }).o;
  A.feed(st, w, o, 0);
  P.moveObj(st, o, x0 + 4, y0 + 4, 1);
  w.moveObject(o, x0 + 4, y0 + 4, 1);
  assert.deepEqual(st.placed[0].slice(0, 4), ['animal_rabbit', x0 + 4, y0 + 4, 1]);
  assert.equal(st.placed[0][4], o.data);
});

test('Кормоцех: чертёж, стройка, рецепты кормов', () => {
  const st = st0({ level: 4, items: { bp_feedmill: 1, wood: 25, stone: 10, wheat: 4, carrot: 2, cabbage: 1 } });
  assert.equal(BR.buildBlock(st, 'feedmill'), null);
  BR.startBuild(st, 'feedmill', 0);
  const end = BUILDINGS.feedmill.time * 1000;
  assert.equal(BR.craftBlock(st, 'feedmill', 'feed_grain', 0), 'Кормоцех ещё строится');
  assert.equal(BR.craftBlock(st, 'feedmill', 'feed_grain', end), null);
  assert.ok(/уровня/.test(BR.craftBlock(st, 'feedmill', 'feed_hay', end)), 'сенной брикет — с 7 уровня');
  BR.craft(st, 'feedmill', 'feed_grain', end);
  BR.craft(st, 'feedmill', 'feed_rabbit', end);
  const got = BR.collect(st, 'feedmill', end + 10 * MIN);
  assert.deepEqual(got.items, [{ id: 'feed_grain', n: 3 }, { id: 'feed_rabbit', n: 2 }]);
});

test('«Убрать всё»: животные — своей строкой', () => {
  const w = world(), st = st0({ items: { animal_chicken: 1, sprinkler_drip: 1 } });
  P.placeObj(st, w, 'animal_chicken', x0 + 2, y0 + 2, { now: 0 });
  P.placeObj(st, w, 'sprinkler_drip', x0 + 4, y0 + 4, { now: 0 });
  const list = SA.collect(st, w, { now: 0 });
  assert.equal(list.animals.list.length, 1);
  assert.equal(list.placed.list.length, 1);
  const r = SA.storeAll(st, w, ['animals'], { now: 0 });
  assert.equal(r.done.animals, 1);
  assert.equal(st.items.animal_chicken, 1);
  assert.ok(st.animalBag.animal_chicken.length === 1);
  assert.equal(A.count(w).all, 0);
});

console.log(`\nвсе проверки прошли: ${tests}`);
