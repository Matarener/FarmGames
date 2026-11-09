// Проверка покупки грядок (src/game/beds.js, BEDS в data.js) и всего, что от неё зависит, без браузера:
// node tools/test-beds.mjs
import assert from 'node:assert/strict';
import * as Beds from '../src/game/beds.js';
import * as R from '../src/game/questRules.js';
import * as A from '../src/game/achRules.js';
import { questHint } from '../src/game/hints.js';
import { World, N, T, START_CHUNK, CHUNK, CHUNKS } from '../src/game/World.js';
import { BEDS, BED_ITEM, ITEMS, SHOP, TOOLS, ENERGY } from '../src/game/data.js';
import { QUESTS } from '../src/game/questData.js';

let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
const x0 = (START_CHUNK % CHUNKS) * CHUNK, y0 = Math.floor(START_CHUNK / CHUNKS) * CHUNK;
const st0 = (o = {}) => ({ coins: 0, gems: 0, level: 1, items: {}, ...o });

test('предел по уровню: 2 + 2 за уровень, не больше 40', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9, 10, 19, 20, 30].map(Beds.bedLimit), [4, 6, 8, 10, 12, 20, 22, 40, 40, 40]);
  assert.equal(Beds.bedLimit(0), 4, 'уровень не меньше 1');
});

test('цена растёт с каждой грядкой: до 12 грядок — 380 монет', () => {
  const price = (n) => Beds.bedPrice(n - 1); // n-я по счёту грядка
  assert.deepEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 20, 21, 30, 31, 40].map(price),
    [10, 10, 20, 20, 35, 35, 50, 50, 75, 75, 100, 100, 150, 150, 250, 250, 400, 400]);
  assert.equal(price(1), 10); assert.equal(price(55), 400, 'дальше таблицы — последняя цена');
  let sum = 0;
  for (let owned = 2; owned < 12; owned++) sum += Beds.bedPrice(owned);
  assert.equal(sum, 380);
  for (let k = 1; k < BEDS.price.length; k++) assert.ok(BEDS.price[k][0] > BEDS.price[k - 1][0] && BEDS.price[k][1] > BEDS.price[k - 1][1], 'таблица по возрастанию');
});

test('с какого уровня следующая грядка', () => {
  for (let owned = 0; owned < 45; owned++) {
    const L = Beds.bedLevel(owned);
    if (owned >= BEDS.limit.max) { assert.equal(L, 0); continue; }
    assert.ok(Beds.bedLimit(L) > owned, `на ${L} ур. можно купить ${owned + 1}-ю`);
    assert.ok(L === 1 || Beds.bedLimit(L - 1) <= owned, `а на ${L - 1} ур. ещё нельзя`);
  }
});

test('покупка: монеты, рюкзак, предел', () => {
  const st = st0({ coins: 25 });
  assert.deepEqual(Beds.buyBed(st, 2), { id: BED_ITEM, n: 1, cost: 10, cur: 'coins' });
  assert.equal(st.coins, 15); assert.equal(st.items[BED_ITEM], 1);
  assert.ok(Beds.buyBed(st, 3).id);
  assert.equal(st.coins, 5); assert.equal(st.items[BED_ITEM], 2);
  // 4 грядки на 1 уровне — предел, следующая со 2-го
  st.coins = 1000;
  assert.deepEqual(Beds.buyBed(st, 4), { limit: 2 });
  assert.equal(st.coins, 1000); assert.equal(st.items[BED_ITEM], 2);
  st.level = 2;
  assert.equal(Beds.buyBed(st, 4).cost, 20);
  // не хватает монет
  const poor = st0({ coins: 9 });
  assert.deepEqual(Beds.buyBed(poor, 2), { poor: 'coins' });
  assert.deepEqual(poor.items, {});
  // старое сохранение: вскопано больше предела — купить нельзя, пока уровень не догонит
  assert.deepEqual(Beds.buyBed(st0({ coins: 1e6, level: 3 }), 15), { limit: 7 });
  assert.deepEqual(Beds.buyBed(st0({ coins: 1e6, level: 50 }), 40), { limit: 0 });
  const o = Beds.bedOffer(st0({ level: 3 }), 6);
  assert.deepEqual(o, { price: 35, owned: 6, limit: 8, level: 3, can: true });
});

test('рынок, рюкзак, лопаты больше нет', () => {
  const o = SHOP.find((x) => x.item === BED_ITEM);
  assert.ok(o && o.bed && o.tab === 'build');
  assert.equal(SHOP.filter((x) => x.tab === 'build')[0], o, 'грядка — первая в «Постройках»');
  assert.ok(!ITEMS[BED_ITEM].sell, 'грядку не продать');
  assert.ok(!TOOLS.tool_shovel && !ITEMS.tool_shovel);
  assert.equal(ENERGY.dig, undefined);
});

test('грядки на ферме и все свои', () => {
  const w = new World(1, { v: 2, n: N, tiles: [], objects: [], well: [x0 + 9, y0 + 9], player: [1, 1] });
  assert.equal(Beds.countBeds(w), 0);
  const st = st0({ items: { [BED_ITEM]: 3 } });
  const i = (x, y) => (y0 + y) * N + x0 + x;
  assert.ok(Beds.placeBed(st, w, i(1, 1)));
  assert.ok(Beds.placeBed(st, w, i(2, 1)));
  assert.equal(Beds.countBeds(w), 2);
  assert.equal(Beds.ownedBeds(st, Beds.countBeds(w)), 3);
  assert.ok(Beds.storeBed(st, w, new Map(), i(1, 1)));
  assert.equal(Beds.countBeds(w), 1);
  assert.equal(Beds.ownedBeds(st, Beds.countBeds(w)), 3, 'убрали в рюкзак — всё равно своя');
});

test('задания: грядки за награду, цели — сколько грядок есть', () => {
  const g = Object.fromEntries(QUESTS.garden.map((q) => [q.id, q]));
  assert.deepEqual(g['garden.beds'].goals.map((x) => [x.state, x.n]), [['bedsAll', 4], ['beds', 4]]);
  assert.equal(g['garden.first'].reward.items[BED_ITEM], 1);
  assert.deepEqual([g['garden.bigbeds'].goal.state, g['garden.bigbeds'].goal.n, g['garden.bigbeds'].reward.items[BED_ITEM]], ['beds', 10, 2]);
  assert.deepEqual([g['garden.field'].goal.n, g['garden.field'].level, g['garden.field'].reward.items[BED_ITEM]], [20, 9, 3]);
  // ни одно задание не просит копать
  for (const list of Object.values(QUESTS)) for (const q of list) for (const x of q.goals || [q.goal]) assert.notEqual(x.ev, 'dig', q.id);
  // награда-грядка ложится в рюкзак даже сверх предела
  const st = st0({ level: 1 });
  R.applyReward(st, { items: { [BED_ITEM]: 3 } });
  assert.equal(st.items[BED_ITEM], 3);
});

test('достижение «Огородник» — по всем своим грядкам', () => {
  const a = A.ACH_BY_ID.dig;
  assert.equal(a.name, 'Огородник'); assert.deepEqual(a.goal, { stat: 'beds' }); assert.deepEqual(a.tiers, [4, 8, 12, 20, 30]);
  assert.equal(A.value(st0(), a, { bedsAll: 13 }), 13);
});

test('стрелка: есть грядка в рюкзаке — кнопка «Грядки», потом трава у грядок; нет — тоже «Грядки» (там рынок)', () => {
  const w = new World(1, { v: 2, n: N, tiles: [], objects: [], well: [x0 + 9, y0 + 9], player: [1, 1] });
  const i = (x, y) => (y0 + y) * N + x0 + x;
  w.tiles[i(3, 3)] = T.SOIL;
  const beds = new Map([[i(3, 3), { i: i(3, 3), x: x0 + 3, y: y0 + 3, crop: 'carrot', p: 0, w: 2 }]]);
  const q = { goal: { state: 'beds', n: 4 } };
  const s = (items, mode) => ({ st: st0({ items }), world: w, beds, px: x0 + 3, py: y0 + 5, now: 0, mode });
  assert.deepEqual(questHint(q, false, s({}, null)), { step: 'bed', kind: 'ui', ui: 'beds' });
  assert.deepEqual(questHint(q, false, s({ [BED_ITEM]: 1 }, null)), { step: 'bed', kind: 'ui', ui: 'beds' });
  const h = questHint(q, false, s({ [BED_ITEM]: 1 }, 'bed'));
  assert.equal(h.kind, 'tile'); assert.equal(w.tiles[h.y * N + h.x], T.GRASS);
  assert.equal(Math.abs(h.x - (x0 + 3)) + Math.abs(h.y - (y0 + 3)), 1, 'рядом с грядкой');
  // купить грядку: рюкзак пуст — «Грядки», есть — рынок
  const buy = { goal: { state: 'bedsAll', n: 4 } };
  assert.equal(questHint(buy, false, s({}, null)).ui, 'beds');
  assert.equal(questHint(buy, false, s({ [BED_ITEM]: 1 }, null)).ui, 'market');
  // посадить, а пустых грядок нет — новая грядка
  assert.equal(questHint({ goal: { ev: 'plant', n: 1 } }, false, s({}, null)).ui, 'beds');
});

console.log(`\n${tests} проверок прошло`);
