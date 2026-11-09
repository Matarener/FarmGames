// Проверка рубки по ударам (src/game/chop.js) и очереди дел (Player) без браузера: node tools/test-chop.mjs
import assert from 'node:assert/strict';
import * as Chop from '../src/game/chop.js';
import * as Flora from '../src/game/flora.js';
import { Player } from '../src/game/Player.js';
import { World, N, START_CHUNK, CHUNK, CHUNKS } from '../src/game/World.js';
import { OBJECTS, FLORA, QUEUE_MAX, floraSeedId, floraOwnId } from '../src/game/data.js';

let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };
const x0 = (START_CHUNK % CHUNKS) * CHUNK, y0 = Math.floor(START_CHUNK / CHUNKS) * CHUNK;
// скелет без картинок (у node нет canvas): для очереди дел картинки не нужны
const GHOST = { bones: [{ name: 'root' }], slots: [], skins: { default: {} }, animations: { idle: { duration: 1 } } };
const world = () => new World(1, { v: 2, n: N, tiles: [], objects: [], well: [x0 + 9, y0 + 9], player: [1, 1] });

test('прочность по видам: крупные деревья крепче, кусты слабее', () => {
  const d = (type) => Chop.durability({ type });
  assert.equal(d('oak'), 5); assert.equal(d('pine'), 5);
  for (const t of ['linden', 'birch', 'maple']) assert.equal(d(t), 4, t);
  for (const t of ['sakura', 'apple', 'cherry', 'pear', 'plum', 'apricot', 'persimmon', 'bird_cherry']) assert.equal(d(t), 3, t);
  for (const f of Object.values(FLORA)) if (f.kind === 'bush') assert.equal(d(f.key), 2, f.key);
  assert.equal(d('stump'), 2); assert.equal(d('sapling'), 1); assert.equal(d('rock'), 2); assert.equal(d('boulder'), 5);
});

test('удары копятся и сохраняются, последний удар срубает и забывает отметку', () => {
  const w = world(), st = {}, o = w.add('oak', x0 + 3, y0 + 3);
  for (let i = 1; i < 5; i++) {
    const r = Chop.hit(st, o);
    assert.deepEqual(r, { total: 5, done: i, last: false });
    assert.equal(Chop.hitsDone(st, o), i);
    assert.equal(Chop.hitsLeft(st, o), 5 - i);
  }
  // сохранение — обычный JSON
  const st2 = JSON.parse(JSON.stringify(st));
  assert.equal(Chop.hitsDone(st2, o), 4);
  assert.deepEqual(Chop.hit(st2, o), { total: 5, done: 5, last: true });
  assert.equal(st2.hits, undefined);
});

test('отметка другого объекта на той же клетке не считается (дерево стало пнём)', () => {
  const w = world(), st = {}, o = w.add('birch', x0 + 3, y0 + 3);
  Chop.hit(st, o); Chop.hit(st, o);
  o.type = 'stump';
  assert.equal(Chop.hitsDone(st, o), 0);
  assert.equal(Chop.hitsLeft(st, o), 2);
  Chop.tidy(st, (x, y) => w.objectAt(x, y));
  assert.equal(st.hits, undefined);
});

test('сколько ударов можно заказать: не больше, чем осталось', () => {
  const w = world(), st = {}, o = w.add('maple', x0 + 3, y0 + 3);
  Chop.hit(st, o);
  assert.equal(Chop.canOrder(st, o, 2), true);
  assert.equal(Chop.canOrder(st, o, 3), false);
});

test('прочность уменьшили в данных — дерево не застревает: остаётся хотя бы один удар', () => {
  const w = world(), o = w.add('oak', x0 + 3, y0 + 3), st = { hits: { [o.gx + ',' + o.gy]: ['oak', 9] } };
  assert.equal(Chop.hitsLeft(st, o), 1);
  assert.equal(Chop.hit(st, o).last, true);
});

test('своё растение переставили — удары переехали; убрали в рюкзак — забылись', () => {
  const w = world(), st = { items: {}, plants: [] }, o = w.add('apple', x0 + 3, y0 + 3);
  o.own = 1; st.plants.push([o.gx, o.gy, 'apple', 0]);
  Chop.hit(st, o);
  Flora.moveOwn(st, o, x0 + 5, y0 + 5);
  w.lift(o); w.put(o, x0 + 5, y0 + 5);
  assert.equal(Chop.hitsDone(st, o), 1);
  Flora.storeOwn(st, o, 1e12, () => 0);
  assert.equal(st.hits, undefined);
});

test('чужая отметка после загрузки (объекта нет) убирается', () => {
  const w = world(), st = { hits: { [`${x0 + 1},${y0 + 1}`]: ['oak', 2] } };
  Chop.tidy(st, (x, y) => w.objectAt(x, y));
  assert.equal(st.hits, undefined);
});

test('очередь: до QUEUE_MAX дел, одинаковые не дублируются, отмена всего — и текущего', () => {
  const w = world(), p = new Player(w, GHOST, x0 + 1, y0 + 1);
  assert.equal(QUEUE_MAX, 20);
  const trees = [];
  for (let i = 0; i < QUEUE_MAX + 1; i++) trees.push(w.add('rock', x0 + 2 + (i % 8), y0 + 2 + Math.floor(i / 8) * 2));
  for (let i = 0; i < QUEUE_MAX; i++) assert.equal(p.enqueue({ kind: 'mine', obj: trees[i], n: 1 }), 'ok');
  assert.equal(p.enqueue({ kind: 'mine', obj: trees[QUEUE_MAX], n: 1 }), 'full');
  assert.equal(p.enqueue({ kind: 'mine', obj: trees[0], n: 1 }), 'dup');
  assert.equal(p.find({ kind: 'mine', obj: trees[3] }), p.queue[3]);
  assert.equal(p.tasks, QUEUE_MAX);
  p.current = p.queue.shift(); p.state = 'work';
  assert.equal(p.tasks, QUEUE_MAX);
  p.clear();
  assert.equal(p.tasks, 0);
  assert.equal(p.current, null);
  assert.equal(p.state, 'idle');
  assert.equal(p.queue.length, 0);
  // просто идёт — не дело
  p.enqueue({ kind: 'walk', x: x0 + 4, y: y0 + 4 });
  assert.equal(p.tasks, 0);
});

test('удары — только рубка и камни (трава срывается за раз)', () => {
  const o = { type: 'oak', gx: 0, gy: 0 };
  assert.equal(Chop.isHit({ kind: 'chop', obj: o }), true);
  assert.equal(Chop.isHit({ kind: 'mine', obj: o }), true);
  assert.equal(Chop.isHit({ kind: 'mow', obj: o }), false);
  assert.equal(Chop.isHit({ kind: 'walk', x: 1, y: 1 }), false);
  assert.equal(OBJECTS.grass.action, 'mow');
});

test('саженец плодового дерева: первые плоды — как только выросло; выкопанное взрослое — через regrow', () => {
  const T0 = 1_000_000_000_000, f = FLORA.persimmon, o = { gx: 5, gy: 6, type: 'persimmon' };
  const st = { items: { [floraSeedId('persimmon')]: 1, [floraOwnId('persimmon')]: 1 } };
  assert.ok(Flora.sow(st, 'persimmon', 5, 6, T0));
  assert.equal(Flora.fruitLeft(st, o, T0), f.grow);
  assert.equal(Flora.hasFruit(st, o, T0 + f.grow * 1000 - 1000), false);
  assert.equal(Flora.hasFruit(st, o, T0 + f.grow * 1000), true);
  assert.ok(Flora.sowGrown(st, 'persimmon', 7, 6, T0));
  assert.equal(Flora.fruitLeft(st, { gx: 7, gy: 6, type: 'persimmon' }, T0), f.regrow);
});

console.log(`\n${tests} проверок пройдено`);
