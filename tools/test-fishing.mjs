// Проверка правил рыбалки (src/game/fishRules.js) без браузера: node tools/test-fishing.mjs
import assert from 'node:assert/strict';
import * as F from '../src/game/fishRules.js';
import * as TR from '../src/game/toolRules.js';
import * as Inv from '../src/game/inventory.js';
import { FISH, ENERGY, ITEMS } from '../src/game/data.js';
import { ROD, BAITS, BAIT_SHOP, FISHER } from '../src/game/fishData.js';
import { BUILDINGS, RECIPES } from '../src/game/buildData.js';
import { questHint } from '../src/game/hints.js';

let rs = 11;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const MIN = 60e3, T0 = Date.parse('2026-11-09T09:00:00Z');
const BITES = ROD.bites[0], REGEN = ROD.regen[0] * 1000;
const at = (ms) => ({ now: T0 + ms, rng });
const LEVELS = ROD.bites.length;
// ферма с удочкой уровня lv (как после улучшения в домике рыболова)
const withRod = (lv, st = {}) => { if (lv > 1) TR.setLevel(st, 'rod', lv); return st; };
// ферма с готовым домиком рыболова
const withHut = (st) => { st.builds = { [FISHER]: { end: 0 } }; return st; };
let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };

// ---------------- Клёв ----------------

test('new farm: full stock, no timer', () => {
  assert.deepEqual(F.bitesView({}, T0), { n: BITES, max: BITES, next: null });
});

test('each cast spends one bite, empty stock refuses', () => {
  const st = {};
  for (let i = 0; i < BITES; i++) assert.ok(F.cast(st, at(0)), `cast ${i}`);
  assert.equal(F.bitesView(st, T0).n, 0);
  assert.equal(F.cast(st, at(0)), null);
  assert.equal(F.bitesView(st, T0).next, T0 + REGEN);
});

test('stock refills one bite per regen, up to max, and keeps partial progress', () => {
  const st = {};
  F.cast(st, at(0)); F.cast(st, at(0)); F.cast(st, at(0));
  assert.equal(F.bitesView(st, T0 + REGEN - 1).n, BITES - 3);
  assert.equal(F.bitesView(st, T0 + REGEN).n, BITES - 2);
  // заброс посреди отсчёта не сбрасывает его: следующая поклёвка всё равно в 2·regen
  F.cast(st, at(REGEN + MIN));
  assert.equal(F.bitesView(st, T0 + REGEN + MIN).next, T0 + 2 * REGEN);
  assert.equal(F.bitesView(st, T0 + 2 * REGEN).n, BITES - 2);
  assert.deepEqual(F.bitesView(st, T0 + 100 * REGEN), { n: BITES, max: BITES, next: null });
});

test('full stock does not bank time: timer starts with the first cast', () => {
  const st = {};
  F.cast(st, at(0));
  F.cast(st, at(50 * REGEN)); // за это время запас давно полный
  assert.equal(F.bitesView(st, T0 + 50 * REGEN).n, BITES - 1);
  assert.equal(F.bitesView(st, T0 + 50 * REGEN).next, T0 + 51 * REGEN);
});

test('clock moved back gives no extra bites', () => {
  const st = {};
  for (let i = 0; i < BITES; i++) F.cast(st, at(10 * MIN));
  assert.equal(F.bitesView(st, T0).n, 0);
  assert.equal(F.cast(st, at(0)), null);
});

test('better rod: bigger stock and faster bites', () => {
  for (let lv = 1; lv <= LEVELS; lv++) {
    const st = withRod(lv);
    assert.equal(F.rodLevel(st), lv);
    assert.deepEqual(F.bitesView(st, T0), { n: ROD.bites[lv - 1], max: ROD.bites[lv - 1], next: null });
    F.cast(st, at(0));
    assert.equal(F.bitesView(st, T0).next, T0 + ROD.regen[lv - 1] * 1000);
    if (lv > 1) {
      assert.ok(ROD.bites[lv - 1] > ROD.bites[lv - 2], `bites ${lv}`);
      assert.ok(ROD.regen[lv - 1] <= ROD.regen[lv - 2], `regen ${lv}`);
      assert.ok(ROD.hold[lv - 1] > ROD.hold[lv - 2], `hold ${lv}`);
    }
  }
});

test('rod upgraded mid-wait: stock grows to the new max without losing bites', () => {
  const st = {};
  for (let i = 0; i < BITES; i++) F.cast(st, at(0));
  TR.setLevel(st, 'rod', 2);
  assert.equal(F.bitesView(st, T0).n, 0);
  assert.equal(F.bitesView(st, T0 + 100 * REGEN).n, ROD.bites[1]);
});

// ---------------- Без наживки ----------------

test('no bait: catch rate and fish weights (only small fish)', () => {
  let got = 0; const n = {};
  for (let i = 0; i < 20000; i++) {
    const r = F.cast({}, at(0));
    assert.equal(r.bait, null);
    if (r.fish) { got++; n[r.fish] = (n[r.fish] || 0) + 1; }
  }
  assert.ok(Math.abs(got / 20000 - ROD.hold[0]) < 0.015, `catch ${got / 20000}`);
  const small = Object.values(FISH).filter((f) => f.chance > 0), total = small.reduce((s, f) => s + f.chance, 0);
  for (const f of small) assert.ok(Math.abs(n[f.key] / got - f.chance / total) < 0.02, f.key);
  for (const f of Object.values(FISH)) if (!f.chance) assert.equal(n[f.key], undefined, `${f.key} only on bait`);
  assert.equal(F.pickFish(() => 0), 'fish_carp');
  assert.equal(F.pickFish(() => 0.9999), 'fish_gold');
});

test('no perpetual motion: without bait a cast returns less energy as food than it costs, at every rod', () => {
  for (let lv = 1; lv <= LEVELS; lv++) {
    const food = F.odds({}, null, lv).reduce((s, o) => s + o.p * FISH[o.fish].food, 0);
    assert.ok(food < ENERGY.fish, `rod ${lv}: food per cast ${food}`);
  }
});

// ---------------- Наживка ----------------

test('every bait is an item, in the tools tab, with a known pool', () => {
  for (const [id, b] of Object.entries(BAITS)) {
    assert.ok(ITEMS[id], id);
    assert.ok(ITEMS[id].bait);
    assert.equal(b.key, id);
    const total = Object.values(b.pool).reduce((s, w) => s + w, 0);
    assert.ok(total > 0, id);
    for (const f of Object.keys(b.pool)) assert.ok(FISH[f], `${id}: ${f}`);
    // наживку или покупают в лавке, или делают в домике
    assert.ok(BAIT_SHOP.some((o) => o.item === id) || (RECIPES[id] && RECIPES[id].at === FISHER), `${id}: where from`);
  }
  // каждую крупную рыбу можно поймать хоть на какую-то наживку
  for (const f of Object.values(FISH)) if (!f.chance) assert.ok(Object.values(BAITS).some((b) => b.pool[f.key]), f.key);
});

test('setBait / baitOf: choice is remembered, bait used only while in the bag', () => {
  const st = { items: {} };
  assert.equal(F.setBait(st, 'nope'), false);
  assert.equal(F.setBait(st, 'bait_worm'), true);
  assert.equal(st.bait, 'bait_worm');
  assert.equal(F.baitOf(st), null); // выбрали, но в рюкзаке нет
  Inv.addItem(st, 'bait_worm', 2);
  assert.equal(F.baitOf(st), 'bait_worm');
  assert.equal(F.cast(st, at(0)).bait, 'bait_worm');
  assert.equal(F.cast(st, at(0)).bait, 'bait_worm');
  assert.equal(Inv.count(st, 'bait_worm'), 0);
  const r = F.cast(st, at(0));
  assert.equal(r.bait, null);
  assert.equal(st.bait, 'bait_worm'); // выбор остался: купили ещё — ловится на неё снова
  Inv.addItem(st, 'bait_worm', 1);
  assert.equal(F.cast(st, at(0)).bait, 'bait_worm');
  F.setBait(st, null);
  assert.equal(st.bait, undefined);
});

test('no bite left: bait is not spent', () => {
  const st = { items: {} };
  Inv.addItem(st, 'bait_worm', 50);
  F.setBait(st, 'bait_worm');
  for (let i = 0; i < BITES; i++) F.cast(st, at(0));
  assert.equal(Inv.count(st, 'bait_worm'), 50 - BITES);
  assert.equal(F.cast(st, at(0)), null);
  assert.equal(Inv.count(st, 'bait_worm'), 50 - BITES);
});

test('worms hold better and bring more perch', () => {
  assert.ok(F.holdChance({}, 'bait_worm') > F.holdChance({}, null));
  for (let lv = 1; lv <= LEVELS; lv++) assert.ok(F.holdChance({}, 'bait_worm', lv) <= 0.95);
  const perch = (bait) => F.odds({}, bait).find((o) => o.fish === 'fish_perch').p;
  assert.ok(perch('bait_worm') > perch(null) * 1.5);
});

test('golden jig: gold fish 3.5 times more often than without bait', () => {
  const gold = (bait) => F.odds({}, bait).find((o) => o.fish === 'fish_gold');
  const k = gold('bait_jig').p / gold(null).p;
  assert.ok(Math.abs(k - 3.5) < 0.01, `jig x${k}`);
});

test('big fish: bites on its bait, but escapes from a weak rod', () => {
  for (const f of Object.values(FISH)) {
    if (f.chance) continue;
    const bait = Object.keys(BAITS).find((b) => BAITS[b].pool[f.key]);
    for (let lv = 1; lv <= LEVELS; lv++) {
      const o = F.odds({}, bait, lv).find((x) => x.fish === f.key);
      if (lv < f.rod) assert.ok(o.big && o.p === 0, `${f.key} on rod ${lv}`);
      else assert.ok(!o.big && o.p > 0, `${f.key} on rod ${lv}`);
    }
  }
  // живец, удочка I: щука клюёт и срывается с подсказкой, а не ловится
  const st = { items: {} }; Inv.addItem(st, 'bait_live', 400); F.setBait(st, 'bait_live');
  let big = 0, pike = 0;
  for (let i = 0; i < 400; i++) {
    st.fish = null;
    const r = F.cast(st, at(0));
    if (r.big === 'fish_pike') big++;
    if (r.fish === 'fish_pike') pike++;
  }
  assert.equal(pike, 0);
  assert.ok(big > 100, `pike escaped ${big}`);
  // та же наживка на удочке III — щука ловится
  const st3 = withRod(3, { items: {} }); Inv.addItem(st3, 'bait_live', 400); F.setBait(st3, 'bait_live');
  for (let i = 0; i < 400; i++) { st3.fish = null; const r = F.cast(st3, at(0)); if (r.fish === 'fish_pike') pike++; assert.ok(!r.big); }
  assert.ok(pike > 100, `pike caught ${pike}`);
});

test('odds sum to the hold chance (what is not big)', () => {
  for (const bait of [null, ...Object.keys(BAITS)]) {
    for (let lv = 1; lv <= LEVELS; lv++) {
      const os = F.odds({}, bait, lv), sum = os.reduce((s, o) => s + o.p, 0);
      const pool = F.poolOf(bait), total = Object.values(pool).reduce((s, w) => s + w, 0);
      const bigW = os.filter((o) => o.big).reduce((s, o) => s + pool[o.fish], 0);
      assert.ok(Math.abs(sum - F.holdChance({}, bait, lv) * (1 - bigW / total)) < 1e-9, `${bait} ${lv}`);
    }
  }
});

// ---------------- Лавка домика рыболова ----------------

test('bait shop: needs the hut, the level and coins', () => {
  const st = { level: 7, coins: 100, items: {} };
  assert.match(F.buyBlock(st, 'bait_worm', T0), /домике рыболова/);
  withHut(st);
  assert.equal(F.buyBlock(st, 'bait_worm', T0), null);
  assert.match(F.buyBlock(st, 'bait_crawler', T0), /17 уровня/);
  assert.match(F.buyBlock(st, 'bait_dough', T0), /нет/); // тесто делают, а не покупают
  assert.match(F.buyBlock(st, 'nope', T0), /нет/);
  const o = BAIT_SHOP.find((x) => x.item === 'bait_worm');
  const r = F.buyBait(st, 'bait_worm', T0);
  assert.equal(r.why, undefined);
  assert.equal(st.coins, 100 - o.price);
  assert.equal(Inv.count(st, 'bait_worm'), o.qty);
  st.coins = o.price - 1;
  assert.match(F.buyBait(st, 'bait_worm', T0).why, /монет/);
  assert.equal(Inv.count(st, 'bait_worm'), o.qty);
});

test('the hut is a craft building with bait recipes, a shop and the rod slot', () => {
  const B = BUILDINGS[FISHER];
  assert.ok(B);
  assert.deepEqual(B.tabs.map((t) => t[0]), ['craft', 'shop', 'tools']);
  assert.deepEqual(TR.toolsAt(FISHER), ['rod']);
  for (const [id, r] of Object.entries(RECIPES)) if (r.at === FISHER) assert.ok(BAITS[id], id);
});

// ---------------- Подсказки к заданиям ----------------

test('quest hints: hut → rod → bait → pond', () => {
  const hut = { type: FISHER, gx: 10, gy: 10, w: 2, h: 2 };
  const st = { level: 8, coins: 5000, gems: 0, xp: 0, house: 1, items: {}, stats: {} };
  const world = { objects: [hut], inside: () => true, isOpen: () => true, walkable: () => true, isWater: (x, y) => x === 20 && y === 20 };
  const hint = (goal) => questHint({ kind: 'line', line: 'fishing', idx: 0, goal: { n: 1, ...goal } }, false,
    { st, world, beds: new Map(), px: 5, py: 5, now: T0 });
  // нет домика: червяки и лещ ведут к чертежу на рынке
  assert.deepEqual(hint({ ev: 'buy', key: 'bait_worm' }), { step: 'building', kind: 'ui', ui: 'market' });
  assert.deepEqual(hint({ ev: 'fish', key: 'fish_bream' }), { step: 'building', kind: 'ui', ui: 'market' });
  withHut(st);
  // купить червяков — в лавку домика, даже если они уже есть
  const shop = hint({ ev: 'buy', key: 'bait_worm' });
  assert.equal(shop.step, 'baitShop'); assert.equal(shop.obj, hut); assert.equal(shop.icon, 'bait_worm');
  Inv.addItem(st, 'bait_worm', 3);
  assert.equal(hint({ ev: 'buy', key: 'bait_worm' }).step, 'baitShop');
  // порыбачить на червя: черви есть — к пруду
  assert.notEqual(hint({ ev: 'bait', key: 'bait_worm' }).step, 'baitShop');
  // лещ: удочка I его не удержит — сначала бамбуковая (вкладка «Удочка» в домике)
  // (нет досок: столярки тоже нет — к её чертежу на рынке)
  assert.deepEqual(hint({ ev: 'fish', key: 'fish_bream' }), { step: 'building', kind: 'ui', ui: 'market' });
  Inv.addItem(st, 'planks', 4); Inv.addItem(st, 'nails', 4);
  const rod = hint({ ev: 'fish', key: 'fish_bream' });
  assert.equal(rod.step, 'tool'); assert.equal(rod.obj, hut);
  TR.setLevel(st, 'rod', 2);
  // удочка есть, теста нет — к домику, где его делают
  const dough = hint({ ev: 'fish', key: 'fish_bream' });
  assert.equal(dough.step, 'workshop'); assert.equal(dough.obj, hut);
  Inv.addItem(st, 'bait_dough', 5);
  assert.notEqual(hint({ ev: 'fish', key: 'fish_bream' }).step, 'workshop');
  // мелкая рыба — сразу к пруду, без наживки
  assert.notEqual(hint({ ev: 'fish', key: 'fish_gold' }).step, 'workshop');
});

console.log(`${tests} tests passed`);
