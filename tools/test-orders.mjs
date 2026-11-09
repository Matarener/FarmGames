// Проверка правил доски заказов (src/game/orderRules.js) без браузера: node tools/test-orders.mjs
import assert from 'node:assert/strict';
import * as O from '../src/game/orderRules.js';
import { ORDERS, CUSTOMERS } from '../src/game/orderData.js';
import { CROPS, FISH, ITEMS, FLORA_GOODS } from '../src/game/data.js';

let rs = 11;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const T0 = Date.parse('2026-11-09T09:00:00Z');
const at = (sec, extra = {}) => ({ now: T0 + sec * 1000, rng, fruit: [], ...extra });
const fresh = (level = 2) => ({ coins: 100, gems: 10, xp: 0, level, items: {}, stats: { cleared: 0, harvested: 0 } });
const fill = (st, o, k = 1) => { for (const [id, n] of Object.entries(o.items)) st.items[id] = (st.items[id] || 0) + n * k; };
let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };

test('table: customers, wait times, lines', () => {
  assert.ok(CUSTOMERS.length >= ORDERS.slots, 'every order on the board can have its own customer');
  assert.ok(ORDERS.wait.skip > ORDERS.wait.done);
  for (const id of ORDERS.goods.fish.items) assert.ok(FISH[id] && ITEMS[id].sell > 0, id);
  assert.deepEqual(O.linesRange(2), [1, 2]);
  assert.deepEqual(O.linesRange(4), [1, 2]);
  assert.deepEqual(O.linesRange(5), [2, 3]);
  assert.deepEqual(O.linesRange(14), [2, 3]);
});

test('closed below the level, no state is created', () => {
  const st = fresh(1);
  assert.deepEqual(O.refresh(st, at(0)), []);
  assert.equal(st.orders, undefined);
  const v = O.view(st, at(0));
  assert.equal(v.open, false); assert.equal(v.level, ORDERS.level);
  assert.equal(O.readyCount(st), 0); assert.equal(O.need(st, 'carrot'), 0);
  assert.equal(st.orders, undefined, 'view does not write');
});

test('board opens at level 2 with three orders and an "open" event', () => {
  const st = fresh(2), out = O.refresh(st, at(0));
  assert.equal(out[0].type, 'open');
  assert.equal(out.filter((e) => e.type === 'new').length, ORDERS.slots);
  assert.equal(st.orders.slots.length, ORDERS.slots);
  assert.deepEqual(O.refresh(st, at(1)), [], 'nothing new while orders wait');
  const who = st.orders.slots.map((s) => s.who);
  assert.equal(new Set(who).size, who.length, 'different customers');
  assert.deepEqual(st.orders.slots.map((s) => s.id), [1, 2, 3]);
});

test('goods: only crops of the level, fish after the fishing quest, fruit only from own plants', () => {
  const ids = (st, c) => O.goodsPool(st, c).map((g) => g.id).sort();
  const st = fresh(2);
  assert.deepEqual(ids(st, at(0)), ['carrot', 'wheat']);
  st.quests = { done: { 'story.fishing': 1 } };
  assert.deepEqual(ids(st, at(0)), ['carrot', 'fish_carp', 'fish_perch', 'wheat']);
  assert.deepEqual(ids(st, at(0, { fruit: ['apple', 'apple', 'nope'] })), ['apple', 'carrot', 'fish_carp', 'fish_perch', 'wheat']);
  st.level = 7;
  const pool = O.goodsPool(st, at(0));
  const recent = pool.filter((g) => CROPS[g.id] && g.w === ORDERS.goods.crop.recentW).map((g) => g.id).sort();
  assert.deepEqual(recent, ['beet', 'cabbage', 'corn', 'tomato'], 'last 4 opened crops are asked more often');
  for (let i = 0; i < 300; i++) {
    const o = O.makeOrder(st, at(0), { slots: [], n: 0 });
    for (const id of Object.keys(o.items)) assert.ok(!CROPS[id] || CROPS[id].level <= 7, id);
  }
});

test('order size, coins and xp follow the formula', () => {
  for (const level of [2, 3, 5, 8, 12, 14]) {
    const st = fresh(level);
    st.quests = { done: { 'story.fishing': 1 } };
    for (let i = 0; i < 400; i++) {
      const c = at(0, { fruit: ['apple', 'blueberry'] }), o = O.makeOrder(st, c, { slots: [], n: 0 });
      const lines = Object.keys(o.items).length, [a, b] = O.linesRange(level);
      assert.ok(lines >= a && lines <= b, `${level}: ${lines} lines`);
      let value = 0;
      for (const [id, n] of Object.entries(o.items)) {
        assert.ok(Number.isInteger(n) && n >= 1 && n <= ORDERS.maxQty, `${id} ×${n}`);
        value += n * ITEMS[id].sell;
      }
      assert.equal(o.value, value);
      assert.equal(o.coins, Math.max(5, Math.round(value * ORDERS.pay / 5) * 5));
      assert.ok(o.coins > value, 'pays more than the market');
      assert.equal(o.xp, Math.max(1, Math.round(value / ORDERS.xpPer)));
      assert.ok(CUSTOMERS[o.who]);
    }
  }
});

test('deliver: needs all goods, takes them, pays, waits 5 min for a new order', () => {
  const st = fresh(3);
  O.refresh(st, at(0));
  const o = st.orders.slots[0];
  assert.equal(O.view(st, at(0)).slots[0].ready, false);
  const first = Object.keys(o.items)[0];
  assert.deepEqual(O.deliver(st, 0, at(0)), { lack: first });
  fill(st, o);
  st.items.extra = 0;
  assert.equal(O.readyCount(st) >= 1, true);
  assert.equal(O.need(st, first) >= o.items[first], true);
  const coins = st.coins, r = O.deliver(st, 0, at(10));
  assert.equal(r.coins, o.coins); assert.equal(r.xp, o.xp); assert.deepEqual(r.items, o.items);
  assert.equal(st.coins, coins + o.coins);
  for (const id of Object.keys(o.items)) assert.equal(st.items[id] || 0, 0, `${id} taken`);
  assert.equal(st.orders.done, 1);
  assert.equal(st.orders.slots[0].wait, T0 + 10e3 + ORDERS.wait.done * 1000);
  assert.equal(O.deliver(st, 0, at(10)), null, 'slot is empty now');
  const v = O.view(st, at(70));
  assert.equal(v.slots[0].wait, (ORDERS.wait.done - 60) * 1000);
  assert.equal(v.slots[0].gems, 1);
  assert.deepEqual(O.refresh(st, at(10 + ORDERS.wait.done - 1)), []);
  const out = O.refresh(st, at(10 + ORDERS.wait.done));
  assert.equal(out.length, 1); assert.equal(out[0].idx, 0); assert.equal(out[0].type, 'new');
  assert.equal(st.orders.slots[0].id, 4);
});

test('extra goods stay, other orders are untouched', () => {
  const st = fresh(4);
  O.refresh(st, at(0));
  const [a, b] = st.orders.slots;
  fill(st, a, 2);
  O.deliver(st, 0, at(1));
  for (const [id, n] of Object.entries(a.items)) assert.equal(st.items[id], n);
  assert.equal(st.orders.slots[1], b);
});

test('skip: new customer in 15 min, rush costs gems by the speed-up rate', () => {
  const st = fresh(5);
  O.refresh(st, at(0));
  const o = st.orders.slots[1];
  assert.equal(O.skip(st, 1, at(0)).order, o);
  assert.equal(st.orders.slots[1].wait, T0 + ORDERS.wait.skip * 1000);
  assert.equal(O.skip(st, 1, at(0)), null, 'already skipped');
  assert.equal(O.view(st, at(0)).slots[1].gems, 2); // 15 мин: 2 кристалла
  assert.equal(O.view(st, at(301)).slots[1].gems, 1); // меньше 10 мин: 1
  st.gems = 1;
  assert.deepEqual(O.rush(st, 1, at(0)), { poor: true, gems: 2 });
  assert.equal(st.gems, 1);
  st.gems = 5;
  const r = O.rush(st, 1, at(0));
  assert.equal(r.gems, 2); assert.equal(st.gems, 3);
  assert.equal(st.orders.slots[1], r.order);
  assert.equal(O.rush(st, 1, at(0)), null, 'nothing to rush: order is here');
  assert.equal(O.rush(st, 0, at(0)), null);
});

test('clock moved back: wait is capped, board does not freeze', () => {
  const st = fresh(3);
  O.refresh(st, at(0));
  O.skip(st, 2, at(1e6));
  O.refresh(st, at(0));
  assert.equal(st.orders.slots[2].wait, T0 + ORDERS.wait.skip * 1000);
  assert.equal(O.refresh(st, at(ORDERS.wait.skip)).length, 1);
});

test('same goods are rarer across the board', () => {
  const repeats = () => {
    let same = 0, tries = 0;
    for (let i = 0; i < 500; i++) {
      const st = fresh(8);
      O.refresh(st, at(0));
      const ids = st.orders.slots.flatMap((s) => Object.keys(s.items));
      same += ids.length - new Set(ids).size; tries += ids.length;
    }
    return same / tries;
  };
  const withRule = repeats(), w = ORDERS.repeatW;
  ORDERS.repeatW = 1;
  const without = repeats();
  ORDERS.repeatW = w;
  assert.ok(withRule < without * 0.8, `repeats ${(withRule * 100).toFixed(1)}% vs ${(without * 100).toFixed(1)}% without the rule`);
});

test('deterministic with the same rng', () => {
  const mk = () => { let s = 5; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const st = fresh(6); O.refresh(st, { now: T0, rng: r, fruit: ['apple'] }); return st.orders; };
  assert.deepEqual(mk(), mk());
});

test('fruit goods exist in tables', () => {
  for (const g of Object.values(FLORA_GOODS)) if (g.food) assert.ok(ITEMS[g.key].sell > 0, g.key);
});

// Сколько платит доска на разных уровнях (для глаз, не проверка)
for (const level of [2, 4, 6, 8, 10, 14]) {
  const st = fresh(level), N = 2000;
  st.quests = { done: { 'story.fishing': 1 } };
  let coins = 0, value = 0, xp = 0, lines = 0;
  for (let i = 0; i < N; i++) { const o = O.makeOrder(st, at(0), { slots: [], n: 0 }); coins += o.coins; value += o.value; xp += o.xp; lines += Object.keys(o.items).length; }
  console.log(`  ур. ${String(level).padStart(2)}: в среднем ${(lines / N).toFixed(1)} товара, рынок ${Math.round(value / N)}, заказ ${Math.round(coins / N)} монет, ${Math.round(xp / N)} опыта`);
}
console.log(`${tests} tests passed`);
