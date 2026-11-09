// Проверка правил улучшения инструментов (src/game/toolRules.js, toolData.js) и ударов по объектам с учётом
// уровня (chop.js) без браузера: node tools/test-tools.mjs
import assert from 'node:assert/strict';
import * as TR from '../src/game/toolRules.js';
import * as B from '../src/game/buildRules.js';
import * as Chop from '../src/game/chop.js';
import { TOOL_UP, TOOL_MAX, TOOL_PERKS, TOOL_AT, TOOL_TINT, TOOL_ROMAN } from '../src/game/toolData.js';
import { BUILDINGS, bpId } from '../src/game/buildData.js';
import { FISHER } from '../src/game/fishData.js';
import { ITEMS, OBJECTS, FLORA, HOUSE, TOOLS, GEM_SPEEDUP_SEC } from '../src/game/data.js';
import { questHint } from '../src/game/hints.js';

const T0 = Date.parse('2026-11-09T09:00:00Z'), S = 1000;
const fresh = (o = {}) => ({ coins: 50000, gems: 50, xp: 0, level: 20, house: 1, can: 0, items: {}, stats: { cleared: 0, harvested: 0 }, ...o });
let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
// здание at построено (по умолчанию кузница)
const built = (st, at, now = T0) => {
  st.items[bpId(at)] = 1;
  for (const [id, n] of Object.entries(BUILDINGS[at].cost)) st.items[id] = (st.items[id] || 0) + n;
  assert.ok(B.startBuild(st, at, now));
  B.speedBuild(st, at, now);
  B.buildTick(st, now);
};
const forge = (st, now = T0) => built(st, TOOL_AT, now);
// материалы на улучшение t до следующего уровня
const stock = (st, t) => { for (const [id, n] of Object.entries(TR.nextUp(st, t).cost)) if (id !== 'coins' && id !== 'gems') st.items[id] = (st.items[id] || 0) + n; };

test('tables: tools, items, levels, names', () => {
  assert.deepEqual(Object.keys(TOOL_UP), ['axe', 'pick', 'can', 'rod']);
  assert.equal(TR.toolOfItem('tool_rod'), 'rod');
  assert.equal(TR.toolOfItem('wood'), null);
  // топор, кирку и лейку куют в кузнице, удочку улучшают в домике рыболова
  assert.deepEqual(TR.toolsAt(TOOL_AT), ['axe', 'pick', 'can']);
  assert.deepEqual(TR.toolsAt(FISHER), ['rod']);
  for (const [k, T] of Object.entries(TOOL_UP)) {
    assert.ok(BUILDINGS[T.at] && BUILDINGS[T.at].tools, `${k}: ${T.at}`);
    assert.ok(TOOLS[T.item] && ITEMS[T.item], `${k}: ${T.item}`);
    assert.equal(TR.toolOfItem(T.item), k);
    assert.equal(T.names.length, TOOL_MAX);
    assert.equal(T.up.length, TOOL_MAX);
    assert.equal(T.up[0], null);
    let lv = 0;
    for (const u of T.up.slice(1)) {
      assert.ok(u.level > lv, `${k}: levels grow`); lv = u.level;
      assert.ok(u.time > 0 && u.cost.coins > 0);
      for (const id of Object.keys(u.cost)) assert.ok(id === 'coins' || ITEMS[id], `${k}: ${id}`);
    }
  }
  assert.equal(TOOL_TINT.length, TOOL_MAX);
  assert.equal(TOOL_ROMAN.length, TOOL_MAX);
  for (const a of [TOOL_PERKS.power, TOOL_PERKS.pick.oreBonus, TOOL_PERKS.pick.boulderOre, TOOL_PERKS.can.cap, TOOL_PERKS.can.area]) assert.equal(a.length, TOOL_MAX);
});

test('level: default 1, names, next upgrade', () => {
  const st = fresh();
  assert.equal(TR.toolLevel(st, 'axe'), 1);
  assert.equal(TR.toolName(st, 'axe'), 'Топор');
  assert.equal(TR.nextUp(st, 'axe').level, 5);
  st.tools = { axe: 4, pick: 9 };
  assert.equal(TR.toolLevel(st, 'axe'), 4);
  assert.equal(TR.toolLevel(st, 'pick'), 4); // больше последнего не бывает
  assert.equal(TR.nextUp(st, 'axe'), null);
  assert.equal(TR.toolName(st, 'axe'), 'Мастерский топор');
  assert.equal(TR.upgradesDone(st), 6);
});

test('block: forge, level, materials, max', () => {
  const st = fresh({ level: 4 });
  assert.equal(TR.upBlock(st, 'axe', T0).bld, TOOL_AT);
  forge(st);
  assert.ok(TR.upBlock(st, 'axe', T0).locked);
  st.level = 5;
  const lack = TR.upBlock(st, 'axe', T0);
  assert.ok(lack.lack && lack.lack.some((m) => m.id === 'iron_ingot'));
  assert.match(lack.why, /Не хватает/);
  stock(st, 'axe');
  assert.equal(TR.upBlock(st, 'axe', T0), null);
  st.tools = { axe: 4 };
  assert.ok(TR.upBlock(st, 'axe', T0).max);
  assert.equal(TR.upBlock(st, 'rod', T0).bld, FISHER); // удочку — в домике рыболова
});

test('upgrade: pay up front, one at a time, finishes by time', () => {
  const st = fresh({ level: 6 });
  forge(st);
  stock(st, 'axe'); stock(st, 'can');
  const coins = st.coins, cost = TR.nextUp(st, 'axe').cost;
  const r = TR.startUp(st, 'axe', T0);
  assert.deepEqual(r, { t: 'axe', to: 2, end: T0 + 5 * 60 * S });
  assert.equal(st.coins, coins - cost.coins);
  assert.equal(st.items.iron_ingot, undefined); // материалы ушли
  assert.equal(TR.toolLevel(st, 'axe'), 1); // пока куётся — работает старый
  assert.ok(TR.upBlock(st, 'can', T0).busy); // наковальня одна
  assert.ok(TR.upBlock(st, 'axe', T0).busy);
  assert.equal(TR.startUp(st, 'can', T0), null);
  assert.equal(TR.upTick(st, T0 + 60 * S), null);
  assert.ok(Math.abs(TR.upPart(st, T0 + 150 * S) - 0.5) < 1e-9);
  assert.equal(TR.upLeft(st, T0 + 240 * S), 60);
  assert.deepEqual(TR.upTick(st, T0 + 300 * S), { t: 'axe', to: 2 });
  assert.equal(TR.toolLevel(st, 'axe'), 2);
  assert.equal(TR.toolName(st, 'axe'), 'Железный топор');
  assert.equal(st.toolUp, undefined);
  assert.equal(TR.upTick(st, T0 + 400 * S), null);
  // теперь можно лейку; новая лейка приходит полной
  assert.equal(TR.upBlock(st, 'can', T0 + 400 * S), null);
  TR.startUp(st, 'can', T0 + 400 * S);
  TR.upTick(st, T0 + 400 * S + 300 * S);
  assert.equal(TR.toolLevel(st, 'can'), 2);
  assert.equal(st.can, HOUSE[1].can + 2);
});

test('speed up with gems: 1 per 10 minutes', () => {
  const st = fresh({ level: 11 });
  forge(st);
  st.gems = 3;
  st.tools = { pick: 2 };
  stock(st, 'pick');
  TR.startUp(st, 'pick', T0); // 1 час
  assert.equal(B.gemsFor(TR.upLeft(st, T0)), Math.ceil(3600 / GEM_SPEEDUP_SEC));
  assert.equal(TR.speedUp(st, T0), null); // 6 кристаллов, есть 3
  assert.ok(TR.speedUp(st, T0 + 40 * 60 * S)); // осталось 20 минут — 2 кристалла
  assert.equal(st.gems, 1);
  assert.deepEqual(TR.upTick(st, T0 + 40 * 60 * S), { t: 'pick', to: 3 });
});

test('tester: set level, drops the running upgrade of that tool', () => {
  const st = fresh();
  st.toolUp = { t: 'axe', to: 2, end: T0 + 1e6 };
  assert.ok(TR.setLevel(st, 'axe', 3));
  assert.equal(TR.toolLevel(st, 'axe'), 3);
  assert.equal(st.toolUp, undefined);
  TR.setLevel(st, 'axe', 1);
  assert.equal(st.tools.axe, undefined);
  assert.equal(TR.setLevel(st, 'net', 2), false);
  assert.ok(TR.setLevel(st, 'rod', 2));
  assert.equal(TR.toolLevel(st, 'rod'), 2);
});

test('rod: own slot in the fisher hut, works in parallel with the anvil', () => {
  const st = fresh({ level: 8 });
  forge(st);
  assert.match(TR.upBlock(st, 'rod', T0).why, /домике рыболова/);
  built(st, FISHER);
  stock(st, 'rod'); stock(st, 'axe');
  assert.equal(TR.upBlock(st, 'rod', T0), null);
  const r = TR.startUp(st, 'rod', T0);
  assert.equal(r.t, 'rod'); assert.equal(r.to, 2);
  assert.equal(st.toolUp, undefined); // наковальня свободна: старое место только у кузницы
  assert.equal(st.toolUps[FISHER].t, 'rod');
  assert.ok(TR.upBlock(st, 'rod', T0).busy);
  assert.match(TR.upBlock(st, 'rod', T0).why, /в работе/);
  assert.equal(TR.upBlock(st, 'axe', T0), null); // а топор куётся в это же время
  TR.startUp(st, 'axe', T0 + 60 * S);
  assert.deepEqual(TR.busyAt(st).sort(), [FISHER, TOOL_AT].sort());
  assert.equal(TR.upLeft(st, T0 + 60 * S, FISHER), TOOL_UP.rod.up[1].time - 60);
  assert.equal(TR.upLeft(st, T0 + 60 * S), TOOL_UP.axe.up[1].time);
  // кончилось в обоих зданиях: upTick отдаёт по одному
  const end = T0 + 3600 * S, got = [TR.upTick(st, end), TR.upTick(st, end), TR.upTick(st, end)];
  assert.deepEqual(got.filter(Boolean).map((x) => x.t).sort(), ['axe', 'rod']);
  assert.equal(got[2], null);
  assert.equal(TR.toolLevel(st, 'rod'), 2);
  assert.equal(TR.toolName(st, 'rod'), 'Бамбуковая удочка');
  assert.deepEqual(TR.busyAt(st), []);
  // ускорить за кристаллы — только то, что в этом здании
  st.level = 12; stock(st, 'rod');
  TR.startUp(st, 'rod', end);
  assert.equal(TR.speedUp(st, end), null);
  assert.ok(TR.speedUp(st, end, FISHER));
  assert.deepEqual(TR.upTick(st, end), { t: 'rod', to: 3 });
});

test('rod rows: bites, regen, escapes, big fish', () => {
  const st = fresh();
  const rows = (lv) => Object.fromEntries(TR.perkRows(st, 'rod', lv).map((r) => [r.key, r.val]));
  assert.equal(rows(1).bites, '10');
  assert.equal(rows(4).bites, '20');
  assert.equal(rows(1).regen, 'раз в 6 мин');
  assert.equal(rows(3).regen, 'раз в 5 мин');
  assert.equal(rows(1).hold, '25%');
  assert.equal(rows(2).big, 'лещ');
  assert.equal(rows(4).big, 'лещ, щука, сом');
  assert.deepEqual(TR.upNews(st, 'rod', 2).map((r) => r.key).sort(), ['big', 'bites', 'hold'].sort());
});

test('hits: oak 5→4→3→2, rocks 2→2→1→1, boulder 5→4→3→2', () => {
  const st = fresh(), want = { oak: [5, 4, 3, 2], linden: [4, 3, 2, 2], apple: [3, 2, 2, 1], stump: [2, 2, 1, 1], rock: [2, 2, 1, 1], boulder: [5, 4, 3, 2], sapling: [1, 1, 1, 1] };
  for (const [type, hits] of Object.entries(want)) {
    hits.forEach((n, i) => assert.equal(TR.hitsFor(st, type, OBJECTS[type].hp, i + 1), n, `${type} lv${i + 1}`));
  }
  assert.equal(TR.toolFor('rock'), 'pick');
  assert.equal(TR.toolFor('oak'), 'axe');
  // кусты рубятся топором
  const bush = Object.values(FLORA).find((f) => f.kind === 'bush');
  assert.equal(TR.toolFor(bush.key), 'axe');
});

test('chop: durability follows tool level, started chop stays consistent', () => {
  const st = fresh(), oak = { gx: 3, gy: 4, type: 'oak' }, rock = { gx: 5, gy: 5, type: 'rock' };
  assert.equal(Chop.durability(oak), 5); // без st — простым топором
  assert.equal(Chop.durability(oak, st), 5);
  Chop.hit(st, oak); Chop.hit(st, oak); Chop.hit(st, oak);
  assert.equal(Chop.hitsLeft(st, oak), 2);
  st.tools = { axe: 4 }; // доковался посреди рубки: ударов всего 2, сделано 3 — остаётся последний
  assert.equal(Chop.durability(oak, st), 2);
  assert.equal(Chop.hitsLeft(st, oak), 1);
  assert.ok(Chop.hit(st, oak).last);
  st.tools.pick = 3;
  assert.equal(Chop.hitsLeft(st, rock), 1);
  assert.ok(Chop.hit(st, rock).last);
  assert.equal(st.hits, undefined);
});

test('pick: ore chance and boulder ore', () => {
  const st = fresh();
  const rock = OBJECTS.rock.oreChance;
  assert.equal(TR.oreChance(st, 'rock'), rock);
  [0, 0.05, 0.1, 0.15].forEach((b, i) => assert.ok(Math.abs(TR.oreChance(st, 'rock', i + 1) - (rock + b)) < 1e-9));
  assert.equal(TR.oreChance(st, 'boulder', 4), 1);
  assert.equal(TR.oreChance(st, 'oak', 4), 0);
  assert.deepEqual(TR.oreRange(st, 'boulder', 3), OBJECTS.boulder.ore);
  assert.deepEqual(TR.oreRange(st, 'boulder', 4), OBJECTS.boulder.ore.map((n) => n + 1));
  assert.deepEqual(TR.oreRange(st, 'rock', 4), OBJECTS.rock.ore);
});

test('axe: master axe roots trees out', () => {
  const st = fresh();
  assert.equal(TR.noStump(st), false);
  st.tools = { axe: 4 };
  assert.equal(TR.noStump(st), true);
  const r = TR.rootOut(st, () => 0);
  assert.deepEqual(r.items, [{ id: 'wood', n: OBJECTS.stump.drops.wood[0] }]);
  assert.equal(r.xp, OBJECTS.stump.xp);
  assert.equal(st.items.wood, OBJECTS.stump.drops.wood[0]);
});

test('can: capacity and area', () => {
  const st = fresh({ house: 2 });
  assert.equal(TR.canMax(st), HOUSE[2].can);
  st.tools = { can: 4 };
  assert.equal(TR.canMax(st), HOUSE[2].can + 6);
  assert.equal(TR.canArea(st, 1).length, 1);
  assert.equal(TR.canArea(st, 3).length, 5);
  assert.equal(TR.canArea(st, 4).length, 9);
  // поливает только грядки, которым нужно; первой — ту, по которой нажали; воды — сколько в лейке
  const dry = new Set(['5,5', '6,5', '5,6', '6,6', '4,4']);
  const needs = (x, y) => dry.has(x + ',' + y);
  st.can = 10;
  st.tools.can = 3;
  assert.deepEqual(TR.waterCells(st, 5, 5, needs), [[5, 5], [6, 5], [5, 6]]);
  st.tools.can = 4;
  assert.deepEqual(TR.waterCells(st, 5, 5, needs), [[5, 5], [6, 5], [5, 6], [6, 6], [4, 4]]);
  st.can = 2;
  assert.deepEqual(TR.waterCells(st, 5, 5, needs), [[5, 5], [6, 5]]);
  st.tools.can = 1; st.can = 5;
  assert.deepEqual(TR.waterCells(st, 5, 5, needs), [[5, 5]]);
});

test('window rows: what changes with the next level', () => {
  const st = fresh({ house: 1 });
  const rows = (t, lv) => Object.fromEntries(TR.perkRows(st, t, lv).map((r) => [r.key, r.val]));
  assert.equal(rows('axe', 1).oak, '5 ударов');
  assert.equal(rows('axe', 2).oak, '4 удара');
  assert.equal(rows('axe', 4).stump, 'не остаётся');
  assert.equal(rows('pick', 2).ore, '15%');
  assert.equal(rows('pick', 4).boulderOre, '3–4');
  assert.equal(rows('can', 4).cap, String(HOUSE[1].can + 6));
  assert.equal(rows('can', 3).area, '5 грядок крестом');
  const news = TR.upNews(st, 'axe', 4).map((r) => r.key);
  assert.ok(news.includes('stump') && news.includes('oak'));
  assert.deepEqual(TR.upNews(st, 'can', 2).map((r) => r.key), ['cap']);
});

test('quest hint: forge → materials → forge object; waits while the anvil is busy', () => {
  const st = fresh({ level: 6, coins: 1000 }), o = { type: TOOL_AT, gx: 10, gy: 10, w: 2, h: 2 };
  const world = { objects: [o], inside: () => true, isOpen: () => true, walkable: () => true };
  const q = { kind: 'line', line: 'smith', idx: 0, goal: { ev: 'tool', key: 'pick2', n: 1 } };
  const hint = () => questHint(q, false, { st, world, beds: new Map(), px: 5, py: 5, now: T0 });
  assert.deepEqual(hint(), { step: 'building', kind: 'ui', ui: 'market' }); // нет кузницы — чертёж на рынке
  forge(st);
  st.items.planks = 2; st.items.iron_ingot = 1;
  const h = hint();
  assert.equal(h.step, 'tool'); assert.equal(h.obj, o); assert.equal(h.icon, 'pick');
  TR.startUp(st, 'pick', T0);
  assert.equal(hint(), null); // куётся — ждём
  TR.upTick(st, T0 + 3600 * S);
  assert.equal(hint(), null); // уже железная
});

console.log(`\n${tests} проверок пройдено`);
