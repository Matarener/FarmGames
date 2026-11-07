// Проверка правил колеса фортуны (src/game/wheelRules.js) без браузера: node tools/test-wheel.mjs
import assert from 'node:assert/strict';
import * as W from '../src/game/wheelRules.js';
import { WHEEL } from '../src/game/wheelData.js';
import { ITEMS } from '../src/game/data.js';

let rs = 7;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const at = (iso) => ({ now: Date.parse(iso), tz: 3, rng });
const day = (n) => at(new Date(Date.parse('2026-11-07T09:00:00Z') + n * 864e5).toISOString());
const fresh = () => ({ coins: 1000, gems: 50, xp: 0, level: 1, items: {}, stats: { cleared: 0, harvested: 0 } });
let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };

test('table: weights, one big prize, items exist', () => {
  assert.equal(WHEEL.sectors.reduce((s, x) => s + x.w, 0), 100);
  assert.equal(WHEEL.sectors.filter((x) => x.big).length, 1);
  for (const s of WHEEL.sectors) for (const id of Object.keys(s.items || {})) assert.ok(ITEMS[id], id);
  assert.equal(WHEEL.free, 1); assert.equal(WHEEL.coins.length, 5);
});

test('pickSector follows weights', () => {
  const S = [{ w: 1 }, { w: 3 }];
  assert.equal(W.pickSector(S, () => 0), 0);
  assert.equal(W.pickSector(S, () => 0.24), 0);
  assert.equal(W.pickSector(S, () => 0.26), 1);
  assert.equal(W.pickSector(S, () => 0.9999), 1);
  const n = Array(WHEEL.sectors.length).fill(0);
  for (let i = 0; i < 20000; i++) n[W.pickSector(WHEEL.sectors, rng)]++;
  WHEEL.sectors.forEach((s, i) => assert.ok(Math.abs(n[i] / 200 - s.w) < 1.5, `sector ${i}: ${n[i] / 200}% vs ${s.w}%`));
});

test('one free spin a day', () => {
  const st = fresh(), c = day(0);
  assert.equal(W.freeSpins(st, c), 1);
  const r = W.spin(st, 'free', c);
  assert.ok(r && r.mode === 'free'); assert.deepEqual(r.cost, {});
  assert.equal(W.freeSpins(st, c), 0);
  assert.equal(W.spin(st, 'free', c), null);
  assert.equal(W.freeSpins(st, at('2026-11-07T20:59:59Z')), 0); // 23:59:59 МСК
  assert.equal(W.freeSpins(st, at('2026-11-07T21:00:00Z')), 1); // 00:00 МСК
  assert.equal(W.wheelView(st, c).next, Date.parse('2026-11-07T21:00:00Z'));
});

test('five coin spins a day at rising prices, then only gems', () => {
  const st = fresh(), c = day(0);
  let spent = 0;
  for (const price of WHEEL.coins) {
    const v = W.wheelView(st, c);
    assert.equal(v.coinCost, price);
    const coins = st.coins, r = W.spin(st, 'coins', c);
    assert.equal(r.cost.coins, price);
    spent += price;
    assert.equal(st.coins, coins - price + (r.reward.coins || 0));
  }
  const v = W.wheelView(st, c);
  assert.equal(v.coinLeft, 0); assert.equal(v.coinCost, null); assert.equal(v.can.coins, false);
  assert.equal(W.spin(st, 'coins', c), null);
  assert.equal(v.freeLeft, 1, 'free spin is separate');
  assert.equal(W.wheelView(st, day(1)).coinLeft, 5, 'new day');
});

test('gems: no limit while there are gems', () => {
  const st = fresh(), c = day(0);
  st.gems = 2 * 30;
  let n = 0;
  while (W.spin(st, 'gems', c)) n++;
  assert.ok(n >= 30, `spins: ${n}`);
  assert.ok(st.gems < WHEEL.gems);
});

test('not enough money: nothing changes', () => {
  const st = fresh(), c = day(0);
  st.coins = 10; st.gems = 1;
  assert.equal(W.spin(st, 'coins', c), null);
  assert.equal(W.spin(st, 'gems', c), null);
  assert.equal(W.spin(st, 'nope', c), null);
  assert.equal(st.coins, 10); assert.equal(st.gems, 1);
  assert.equal(W.wheelState(st).n, 0);
});

test('the prize of the picked sector arrives', () => {
  const st = fresh(), c = { ...day(0), rng: () => 0 }; // первый сектор — главный приз
  const r = W.spin(st, 'free', c);
  assert.equal(r.idx, 0); assert.ok(r.reward.big);
  assert.equal(st.gems, 50 + WHEEL.sectors[0].gems);
  const i = WHEEL.sectors.findIndex((s) => s.items), id = Object.keys(WHEEL.sectors[i].items)[0];
  const before = WHEEL.sectors.slice(0, i).reduce((s, x) => s + x.w, 0) / 100;
  const r2 = W.spin(st, 'gems', { ...day(0), rng: () => before + 0.001 });
  assert.equal(r2.idx, i); assert.equal(st.items[id], WHEEL.sectors[i].items[id]);
});

test('clock moved back: no extra free spin', () => {
  const st = fresh();
  W.spin(st, 'free', day(3));
  assert.equal(W.freeSpins(st, day(1)), 0);
  assert.equal(W.spin(st, 'free', day(1)), null);
  assert.equal(W.freeSpins(st, day(4)), 1);
});

test('level gate', () => {
  const st = fresh(), lvl = WHEEL.level;
  WHEEL.level = 3;
  try {
    assert.equal(W.freeSpins(st, day(0)), 0);
    assert.equal(W.spin(st, 'gems', day(0)), null);
    st.level = 3;
    assert.equal(W.freeSpins(st, day(0)), 1);
  } finally { WHEEL.level = lvl; }
});

console.log(`${tests} tests passed`);
