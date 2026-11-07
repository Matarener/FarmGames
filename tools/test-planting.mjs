// Проверка правил посадки (src/game/planting.js) без браузера: node tools/test-planting.mjs
import assert from 'node:assert/strict';
import * as P from '../src/game/planting.js';
import { CROPS, PLANT_PICK, seedId } from '../src/game/data.js';

let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
const st0 = (o = {}) => ({ coins: 0, gems: 0, level: 1, items: {}, ...o });
const bed = () => ({ crop: null, p: 0, w: 0 });

test('plantLeft: свои семена плюс семена на монеты, минус очередь', () => {
  const st = st0({ coins: 7, items: { [seedId('carrot')]: 3 } }); // морковь: семена по 2 монеты
  assert.equal(P.plantLeft(st, 'carrot'), 3 + 3);
  assert.equal(P.plantLeft(st, 'carrot', 4), 2);
  assert.equal(P.plantLeft(st, 'carrot', 9), 0);
  assert.equal(P.plantLeft(st, 'wheat'), 0, 'закрыто по уровню');
  assert.equal(P.plantLeft(st, 'nope'), 0);
});

test('plantBed: сначала свои семена, потом монеты; запоминает культуру', () => {
  const st = st0({ coins: 2, items: { [seedId('carrot')]: 1 } }), a = bed(), b = bed(), c = bed();
  assert.equal(P.plantBed(st, a, 'carrot'), 'seed');
  assert.equal(st.items[seedId('carrot')], undefined);
  assert.equal(a.crop, 'carrot'); assert.equal(st.lastCrop, 'carrot');
  assert.equal(P.plantBed(st, b, 'carrot'), 'coins');
  assert.equal(st.coins, 0);
  assert.equal(P.plantBed(st, c, 'carrot'), null, 'нечем платить');
  assert.equal(c.crop, null);
  assert.equal(P.plantBed(st, a, 'carrot'), null, 'грядка занята');
  st.coins = 100;
  assert.equal(P.plantBed(st, c, 'tomato'), null, 'закрыто по уровню');
});

test('cropChoices: последняя первой, потом свои семена, за монеты, не хватает, закрытые', () => {
  const st = st0({ level: 3, coins: 4, lastCrop: 'wheat', items: { [seedId('beet')]: 2 } });
  const list = P.cropChoices(st, 'all');
  assert.deepEqual(list.map((r) => r.key), ['wheat', 'beet', 'carrot', 'cabbage', 'tomato', 'corn', 'sunflower']);
  assert.deepEqual(list.map((r) => r.open), [true, true, true, false, false, false, false]);
  assert.equal(list.filter((r) => !r.open).length, PLANT_PICK.locked);
  assert.ok(list[0].last && list[0].can);
  assert.deepEqual(P.cropChoices(st, 'seeds').map((r) => r.key), ['beet']);
  st.coins = 1;
  const poor = P.cropChoices(st, 'all');
  assert.deepEqual(poor.slice(0, 4).map((r) => [r.key, r.can]), [['wheat', false], ['beet', true], ['carrot', false], ['cabbage', false]]);
});

test('30 культур: быстрые по времени роста, закрытые не забивают сетку', () => {
  const real = Object.values(CROPS);
  const added = [];
  for (let i = 0; i < 20; i++) {
    const src = real[i % real.length], key = 'test' + i;
    CROPS[key] = { ...src, key, name: 'Тест ' + i, level: 1 + (i % 20) };
    added.push(key);
  }
  try {
    const st = st0({ level: 30, coins: 1e6 });
    const all = P.cropChoices(st, 'all');
    assert.equal(all.length, 30);
    assert.ok(all.every((r) => r.open && r.can));
    const fast = P.cropChoices(st, 'fast');
    assert.ok(fast.length > 0 && fast.every((r) => r.c.time <= PLANT_PICK.fast));
    for (let i = 1; i < fast.length; i++) assert.ok(fast[i - 1].c.time <= fast[i].c.time);
    const low = P.cropChoices(st0({ level: 1, coins: 10 }), 'all');
    assert.equal(low.filter((r) => !r.open).length, PLANT_PICK.locked);
    assert.equal(low.filter((r) => r.open).length, 2); // морковь и тестовая первого уровня
  } finally { for (const k of added) delete CROPS[k]; }
});

console.log(`\n${tests} проверок прошло`);
