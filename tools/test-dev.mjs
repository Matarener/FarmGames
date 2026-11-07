// Проверка правил режима тестера (src/game/devRules.js) без браузера: node tools/test-dev.mjs
import assert from 'node:assert/strict';
import * as D from '../src/game/devRules.js';
import { ITEMS, DEV_LIMITS } from '../src/game/data.js';

const fresh = () => ({ coins: 50, gems: 5, energy: 3, items: {} });
let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };

test('setWallet: exact value, clamped, integers only', () => {
  const st = fresh();
  assert.deepEqual(D.setWallet(st, 'coins', 12345), { cur: 'coins', from: 50, to: 12345 });
  assert.equal(D.setWallet(st, 'gems', '77').to, 77);
  assert.equal(D.setWallet(st, 'gems', -5).to, 0);
  assert.equal(D.setWallet(st, 'coins', 1e15).to, DEV_LIMITS.wallet);
  assert.equal(D.setWallet(st, 'coins', 'abc').to, 0);
  assert.equal(D.setWallet(st, 'coins', 9.9).to, 9);
  assert.equal(D.setWallet(st, 'xp', 5), null);
  assert.equal(st.xp, undefined);
});

test('grantItem: any non-tool item, tools refused', () => {
  const st = fresh(), list = D.grantable();
  assert.ok(list.length > 30 && list.every((it) => !it.tool));
  for (const it of list) assert.deepEqual(D.grantItem(st, it.key, 3), { id: it.key, n: 3 });
  for (const it of list) assert.equal(st.items[it.key], 3);
  assert.equal(D.grantItem(st, 'tool_axe', 1), null);
  assert.equal(D.grantItem(st, 'nope', 1), null);
  assert.equal(D.grantItem(st, 'wood', 0), null);
  assert.equal(D.grantItem(st, 'wood', 1e9).n, DEV_LIMITS.item);
});

test('grantMany + clearItem', () => {
  const st = fresh();
  const ids = ['wood', 'stone', 'tool_axe'];
  assert.deepEqual(D.grantMany(st, ids, 10), { kinds: 2, n: 20 });
  assert.deepEqual(D.clearItem(st, 'wood'), { id: 'wood', n: 10 });
  assert.equal(st.items.wood, undefined);
  assert.equal(D.clearItem(st, 'wood'), null);
  assert.ok(ITEMS.stone);
});

test('fillEnergy', () => {
  const st = fresh();
  assert.deepEqual(D.fillEnergy(st, 30), { energy: 27 });
  assert.equal(st.energy, 30);
  assert.equal(D.fillEnergy(st, 30), null);
});

console.log(`${tests} tests passed`);
