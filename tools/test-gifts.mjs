// Проверка правил подарков (src/game/giftRules.js) без браузера: node tools/test-gifts.mjs
import assert from 'node:assert/strict';
import * as G from '../src/game/giftRules.js';
import { DAILY_GIFT } from '../src/game/giftData.js';
import { ITEMS } from '../src/game/data.js';

const at = (iso) => ({ now: Date.parse(iso), tz: 3 });
const fresh = () => ({ coins: 50, gems: 5, xp: 0, level: 1, items: {}, stats: { cleared: 0, harvested: 0 } });
const day = (n) => at(new Date(Date.parse('2026-11-07T09:00:00Z') + n * 864e5).toISOString());
let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };

test('table: 30 days, every 7th gives gems, the last one is a big chest with gems', () => {
  const D = DAILY_GIFT.days;
  assert.equal(D.length, 30);
  for (const i of [6, 13, 20, 27]) assert.ok(D[i].gems > 0, `day ${i + 1}`);
  assert.ok(D[29].big && D[29].gems >= 10);
  assert.ok(D.every((r, i) => !r.big || i === 29));
  assert.ok(D[29].gems > Math.max(...D.slice(0, 29).map((r) => r.gems || 0)));
  for (const r of D) for (const id of Object.keys(r.items || {})) assert.ok(ITEMS[id], id);
});

test('first gift right away, once a day', () => {
  const st = fresh(), c = day(0);
  assert.equal(G.available(st, c), 1);
  const v = G.daily(st, c);
  assert.equal(v.idx, 0); assert.equal(v.days[0].state, 'today'); assert.equal(v.days[1].state, 'soon');
  const r = G.claimDaily(st, c);
  assert.equal(r.day, 1); assert.equal(r.total, 1);
  assert.equal(st.coins, 50 + DAILY_GIFT.days[0].coins);
  assert.equal(G.claimDaily(st, c), null, 'second time the same day');
  assert.equal(G.available(st, c), 0);
  assert.equal(G.daily(st, c).days[0].state, 'got');
});

test('new day starts at 00:00 Moscow time', () => {
  const st = fresh();
  G.claimDaily(st, at('2026-11-07T20:59:00Z')); // 23:59 МСК
  assert.equal(G.available(st, at('2026-11-07T20:59:59Z')), 0);
  assert.equal(G.available(st, at('2026-11-07T21:00:00Z')), 1); // 00:00 МСК
  assert.equal(G.daily(st, at('2026-11-07T20:00:00Z')).next, Date.parse('2026-11-07T21:00:00Z'));
});

test('30 days in a row: all rewards arrive, then the track starts over', () => {
  const st = fresh(), sum = { coins: 0, gems: 0, items: {} };
  for (const r of DAILY_GIFT.days) {
    sum.coins += r.coins || 0; sum.gems += r.gems || 0;
    for (const [id, n] of Object.entries(r.items || {})) sum.items[id] = (sum.items[id] || 0) + n;
  }
  for (let d = 0; d < 30; d++) assert.equal(G.claimDaily(st, day(d)).day, d + 1);
  assert.equal(st.coins, 50 + sum.coins);
  assert.equal(st.gems, 5 + sum.gems);
  assert.deepEqual(st.items, sum.items);
  const v = G.daily(st, day(30));
  assert.equal(v.idx, 0); assert.equal(v.total, 31); assert.ok(v.days.every((x, i) => x.state === (i ? 'soon' : 'today')));
  assert.equal(G.claimDaily(st, day(30)).day, 1);
});

test('missed days do not burn: the next login takes the next day of the track', () => {
  const st = fresh();
  G.claimDaily(st, day(0)); G.claimDaily(st, day(1)); G.claimDaily(st, day(2));
  const v = G.daily(st, day(9));
  assert.ok(v.can); assert.equal(v.missed, false); assert.equal(v.idx, 3);
  assert.equal(G.claimDaily(st, day(9)).day, 4);
});

test('with resetOnMiss a missed day starts the track over', () => {
  const st = fresh();
  DAILY_GIFT.resetOnMiss = true;
  try {
    G.claimDaily(st, day(0)); G.claimDaily(st, day(1));
    assert.equal(G.daily(st, day(2)).idx, 2, 'next day keeps going');
    const v = G.daily(st, day(3));
    assert.equal(v.idx, 0); assert.ok(v.missed);
    assert.equal(G.claimDaily(st, day(3)).day, 1);
  } finally { DAILY_GIFT.resetOnMiss = false; }
});

test('clock moved back: no second gift', () => {
  const st = fresh();
  G.claimDaily(st, day(3));
  const v = G.daily(st, day(1));
  assert.equal(v.can, false); assert.equal(v.days[0].state, 'got');
  assert.equal(G.claimDaily(st, day(1)), null);
  assert.equal(G.available(st, day(4)), 1);
});

test('level gate', () => {
  const st = fresh(), lvl = DAILY_GIFT.level;
  DAILY_GIFT.level = 2;
  try {
    assert.equal(G.available(st, day(0)), 0);
    assert.equal(G.claimDaily(st, day(0)), null);
    st.level = 2;
    assert.equal(G.available(st, day(0)), 1);
  } finally { DAILY_GIFT.level = lvl; }
});

test('old save without gifts gets a state', () => {
  const st = fresh();
  assert.deepEqual(G.giftState(st).daily, { d: null, n: 0 });
});

console.log(`${tests} tests passed`);
