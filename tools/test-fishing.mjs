// Проверка правил рыбалки (src/game/fishRules.js) без браузера: node tools/test-fishing.mjs
import assert from 'node:assert/strict';
import * as F from '../src/game/fishRules.js';
import { FISH, FISH_CATCH, FISHING, ENERGY } from '../src/game/data.js';

let rs = 11;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const MIN = 60e3, T0 = Date.parse('2026-11-09T09:00:00Z'), REGEN = FISHING.regen * 1000;
const at = (ms) => ({ now: T0 + ms, rng });
let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };

test('new farm: full stock, no timer', () => {
  assert.deepEqual(F.bitesView({}, T0), { n: FISHING.bites, max: FISHING.bites, next: null });
});

test('each cast spends one bite, empty stock refuses', () => {
  const st = {};
  for (let i = 0; i < FISHING.bites; i++) assert.ok(F.cast(st, at(0)), `cast ${i}`);
  assert.equal(F.bitesView(st, T0).n, 0);
  assert.equal(F.cast(st, at(0)), null);
  assert.equal(F.bitesView(st, T0).next, T0 + REGEN);
});

test('stock refills one bite per regen, up to max, and keeps partial progress', () => {
  const st = {};
  F.cast(st, at(0)); F.cast(st, at(0)); F.cast(st, at(0));
  assert.equal(F.bitesView(st, T0 + REGEN - 1).n, FISHING.bites - 3);
  assert.equal(F.bitesView(st, T0 + REGEN).n, FISHING.bites - 2);
  // заброс посреди отсчёта не сбрасывает его: следующая поклёвка всё равно в 2·regen
  F.cast(st, at(REGEN + MIN));
  assert.equal(F.bitesView(st, T0 + REGEN + MIN).next, T0 + 2 * REGEN);
  assert.equal(F.bitesView(st, T0 + 2 * REGEN).n, FISHING.bites - 2);
  assert.deepEqual(F.bitesView(st, T0 + 100 * REGEN), { n: FISHING.bites, max: FISHING.bites, next: null });
});

test('full stock does not bank time: timer starts with the first cast', () => {
  const st = {};
  F.cast(st, at(0));
  F.cast(st, at(50 * REGEN)); // за это время запас давно полный
  assert.equal(F.bitesView(st, T0 + 50 * REGEN).n, FISHING.bites - 1);
  assert.equal(F.bitesView(st, T0 + 50 * REGEN).next, T0 + 51 * REGEN);
});

test('clock moved back gives no extra bites', () => {
  const st = {};
  for (let i = 0; i < FISHING.bites; i++) F.cast(st, at(10 * MIN));
  assert.equal(F.bitesView(st, T0).n, 0);
  assert.equal(F.cast(st, at(0)), null);
});

test('catch rate and fish weights', () => {
  let got = 0; const n = {};
  for (let i = 0; i < 20000; i++) {
    const r = F.cast({}, at(0));
    if (r.fish) { got++; n[r.fish] = (n[r.fish] || 0) + 1; }
  }
  assert.ok(Math.abs(got / 20000 - FISH_CATCH) < 0.015, `catch ${got / 20000}`);
  const total = Object.values(FISH).reduce((s, f) => s + f.chance, 0);
  for (const f of Object.values(FISH)) assert.ok(Math.abs(n[f.key] / got - f.chance / total) < 0.02, f.key);
  assert.equal(F.pickFish(() => 0), 'fish_carp');
  assert.equal(F.pickFish(() => 0.9999), 'fish_gold');
});

test('no perpetual motion: a cast returns less energy as food than it costs', () => {
  const total = Object.values(FISH).reduce((s, f) => s + f.chance, 0);
  const food = FISH_CATCH * Object.values(FISH).reduce((s, f) => s + f.food * f.chance / total, 0);
  assert.ok(food < ENERGY.fish, `food per cast ${food}`);
});

console.log(`${tests} tests passed`);
