// Проверка правил заданий (src/game/questRules.js) без браузера: node tools/test-quests.mjs
import assert from 'node:assert/strict';
import * as R from '../src/game/questRules.js';
import { QUESTS, LINES, OLD_ORDER, OLD_TITLES, PERIODS, EVENTS } from '../src/game/questData.js';

let rs = 1;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const at = (iso) => ({ now: Date.parse(iso), tz: 3, rng });
const fresh = () => ({ coins: 50, gems: 5, xp: 0, level: 1, house: 1, well: 0, items: {}, stats: { cleared: 0, harvested: 0 } });
const ids = (vs) => vs.map((v) => v.id);
let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };

// уникальные id
test('ids unique', () => {
  const all = [...LINES.flatMap((l) => QUESTS[l.key].map((q) => q.id)), ...EVENTS.flatMap((e) => e.quests.map((q) => q.id))];
  assert.equal(new Set(all).size, all.length);
  assert.equal(OLD_ORDER.length, OLD_TITLES.length);
  OLD_ORDER.forEach((id, i) => assert.equal(R.QUEST_BY_ID[id].q.title, OLD_TITLES[i]));
  for (const l of LINES) if (l.after) assert.ok(R.QUEST_BY_ID[l.after], l.after);
});

test('new game: story first, branches locked', () => {
  const st = fresh(), c = at('2026-11-07T12:00:00Z');
  const vs = R.views(st, c);
  assert.deepEqual(ids(vs), ['story.wake']);
  assert.equal(R.lineState(st, 'garden').status, 'lock');
  const ev = R.onEvent(st, 'harvest', 'carrot', 1, c);
  assert.equal(ev.length, 1); assert.equal(ev[0].view.id, 'story.wake');
  assert.equal(R.check(st, c).length, 0, 'told only once');
  const r = R.claim(st, 'story.wake', c);
  assert.equal(st.coins, 60); assert.equal(r.next, 'story.note'); assert.equal(r.reward.xp, 5);
  assert.equal(R.claim(st, 'story.wake', c), null);
});

test('story counts life, branches count from opening', () => {
  const st = fresh(), c = at('2026-11-07T12:00:00Z');
  // до задания посадили 2 морковки и полили 5 раз
  R.onEvent(st, 'harvest', 'carrot', 1, c); R.claim(st, 'story.wake', c);
  R.onEvent(st, 'water', null, 5, c);
  R.onEvent(st, 'plant', 'carrot', 2, c); R.claim(st, 'story.note', c);
  // «Водичка» засчитана сразу: поливы были раньше
  assert.ok(R.views(st, c).find((v) => v.id === 'story.water').done);
  R.check(st, c); R.claim(st, 'story.water', c);
  // открылся Огород; копали раньше — не считается
  assert.equal(R.lineState(st, 'garden').status, 'open');
  const g = R.views(st, c).find((v) => v.id === 'garden.beds');
  assert.equal(g.goals[0].p, 0);
  R.onEvent(st, 'dig', null, 1, c);
  assert.equal(R.views(st, c).find((v) => v.id === 'garden.beds').goals[0].p, 1);
});

test('state goals and multi goals', () => {
  const st = fresh(), c = at('2026-11-07T12:00:00Z');
  for (const id of ['story.wake', 'story.note', 'story.water', 'story.fishing', 'story.wood', 'story.stumps', 'story.stone']) st.quests = R.questState(st), st.quests.done[id] = 1;
  assert.equal(R.views(st, c).find((v) => v.line === 'story').id, 'story.well');
  st.well = 1;
  assert.equal(R.check(st, c)[0].view.id, 'story.well');
  R.claim(st, 'story.well', c);
  assert.equal(R.lineState(st, 'build').status, 'open');
  st.level = 5; R.claim(st, 'story.alive', c); // нельзя без check? можно: claim сам проверяет done
  assert.ok(st.quests.done['story.alive']);
  assert.equal(R.lineState(st, 'story').status, 'level');
  st.level = 7;
  const v = R.views(st, c).find((x) => x.id === 'story.chest');
  assert.equal(v.goals.length, 2); assert.equal(v.goal.state, 'house');
  st.house = 3;
  assert.equal(R.views(st, c).find((x) => x.id === 'story.chest').goal.ev, 'fish');
  R.onEvent(st, 'fish', 'fish_carp', 10, c);
  assert.ok(R.views(st, c).find((x) => x.id === 'story.chest').done);
});

test('groups and keys', () => {
  const st = fresh(), c = at('2026-11-07T12:00:00Z'), Q = R.questState(st);
  Q.done['story.fishing'] = 1; Q.done['fish.catch'] = 1; Q.done['fish.perch'] = 1; Q.done['fish.gold'] = 1;
  R.onEvent(st, 'sell', 'carrot', 5, c);
  assert.equal(R.views(st, c).find((v) => v.id === 'fish.sell').goals[0].p, 0);
  R.onEvent(st, 'sell', 'fish_carp', 4, c);
  assert.equal(R.views(st, c).find((v) => v.id === 'fish.sell').goals[0].p, 4);
});

test('migration from every old step', () => {
  for (let i = 0; i <= 16; i++) {
    for (const told of [0, 1]) {
      const st = fresh();
      st.quest = { i, n: told ? 0 : 1, seen: true, t: OLD_TITLES[i], told };
      st.level = 6; st.house = 2; st.well = i > 7 ? 1 : 0;
      const Q = R.questState(st);
      assert.equal(st.quest, undefined);
      for (let k = 0; k < i; k++) assert.ok(Q.done[OLD_ORDER[k]], `old ${k} done at ${i}`);
      const c = at('2026-11-07T12:00:00Z');
      const vs = R.views(st, c);
      if (i < 16) {
        const id = OLD_ORDER[i];
        assert.ok(vs.find((v) => v.id === id), `current ${id} visible at ${i}: ${ids(vs)}`);
        if (told) assert.ok(Q.told[id]);
        else if (!R.QUEST_BY_ID[id].q.goal.state) assert.equal(vs.find((v) => v.id === id).goals[0].p, Math.min(1, R.QUEST_BY_ID[id].q.goal.n));
      }
      R.check(st, c); R.refresh(st, c);
    }
  }
  // старое сохранение без названия (самое первое) — по номеру
  const st = fresh(); st.quest = { i: 3, n: 0 };
  R.questState(st);
  assert.ok(st.quests.done['story.water'] && !st.quests.done['story.fishing']);
});

test('period keys and resets (MSK)', () => {
  const t = Date.parse('2026-11-07T20:59:00Z'); // 23:59 МСК, суббота
  assert.equal(R.periodKey('day', t, 3), '2026-11-07');
  assert.equal(R.periodKey('day', t + 120e3, 3), '2026-11-08');
  assert.equal(R.periodKey('week', t, 3), '2026-11-02');
  assert.equal(R.periodKey('week', Date.parse('2026-11-08T20:59:00Z'), 3), '2026-11-02'); // вс 23:59
  assert.equal(R.periodKey('week', Date.parse('2026-11-08T21:00:00Z'), 3), '2026-11-09'); // пн 00:00
  assert.equal(R.periodKey('month', Date.parse('2026-11-30T21:00:00Z'), 3), '2026-12');
  assert.equal(R.nextReset('day', t, 3), Date.parse('2026-11-07T21:00:00Z'));
  assert.equal(R.nextReset('week', t, 3), Date.parse('2026-11-08T21:00:00Z'));
  assert.equal(R.nextReset('month', t, 3), Date.parse('2026-11-30T21:00:00Z'));
});

test('daily: appear at level 3, credit, clock back, swap', () => {
  const st = fresh(), Q = R.questState(st);
  for (const id of ['story.wake', 'story.note', 'story.water', 'story.fishing', 'story.wood']) Q.done[id] = 1;
  let c = at('2026-11-07T12:00:00Z');
  assert.equal(R.refresh(st, c).length, 0, 'nothing before level 3');
  st.level = 3;
  const ev = R.refresh(st, c);
  assert.deepEqual(ev.filter((e) => e.type === 'new').map((e) => e.kind), ['day', 'week', 'month']);
  assert.equal(Q.per.day.list.length, 3); assert.equal(Q.per.week.list.length, 4); assert.equal(Q.per.month.list.length, 3);
  for (const it of Q.per.day.list) assert.ok(it.n > 0 && it.r.xp === 5);
  assert.equal(R.refresh(st, c).length, 0, 'same day: nothing');
  // выполним первое задание дня
  const it = Q.per.day.list[0], t = PERIODS.day.pool.find((x) => x.id === it.t);
  R.onEvent(st, t.goal.ev, it.key || null, it.n, c);
  assert.equal(Q.per.day.list[0].p, it.n);
  const coins = st.coins;
  // замена: выполненное заменить нельзя, другое — один раз
  assert.equal(R.swap(st, 'day:0', c), false);
  const before = Q.per.day.list[1].t;
  assert.equal(R.swap(st, 'day:1', c), true);
  assert.notEqual(Q.per.day.list[1].t, before);
  assert.equal(R.swap(st, 'day:2', c), false, 'one swap a day');
  // часы назад — ничего
  assert.equal(R.refresh(st, at('2026-11-06T12:00:00Z')).length, 0);
  // следующий день: награда за выполненное начислена сама
  c = at('2026-11-07T21:30:00Z');
  const ev2 = R.refresh(st, c);
  const cr = ev2.find((e) => e.type === 'credit');
  assert.ok(cr, 'credit'); assert.equal(st.coins, coins + (it.r.coins || 0));
  assert.equal(Q.per.day.k, '2026-11-08'); assert.equal(Q.per.day.swap, 0);
  assert.equal(Q.per.week.k, '2026-11-02', 'week stays');
});

test('daily bonus', () => {
  const st = fresh(); st.level = 5; const Q = R.questState(st), c = at('2026-11-07T12:00:00Z');
  R.refresh(st, c);
  for (const it of Q.per.day.list) it.p = it.n;
  const vs = R.views(st, c), b = vs.find((v) => v.id === 'day:bonus');
  assert.ok(b.done);
  const gems = st.gems;
  R.check(st, c);
  assert.ok(R.claim(st, 'day:bonus', c)); assert.equal(st.gems, gems + 1);
  for (let i = 0; i < 3; i++) assert.ok(R.claim(st, 'day:' + i, c));
  assert.equal(R.claimable(R.views(st, c).filter((v) => v.kind === 'day')), 0);
});

test('events by dates', () => {
  const key = (iso) => R.activeEvents(at(iso)).map((a) => a.key);
  assert.deepEqual(key('2026-11-07T12:00:00Z'), ['ghost:2026']);
  assert.deepEqual(key('2026-11-07T21:00:00Z'), []); // 8 ноября 00:00 МСК
  assert.deepEqual(key('2026-10-24T21:00:00Z'), ['ghost:2026']);
  assert.deepEqual(key('2026-12-19T20:59:00Z'), []);
  assert.deepEqual(key('2026-12-19T21:00:00Z'), ['newyear:2026']);
  assert.deepEqual(key('2027-01-05T12:00:00Z'), ['newyear:2026']);
  assert.deepEqual(key('2027-01-10T20:00:00Z'), ['newyear:2026']);
  assert.deepEqual(key('2027-01-10T21:00:00Z'), []);
  assert.deepEqual(R.activeEvents({ ...at('2027-03-01T12:00:00Z'), force: 'spring' }).map((a) => a.key), ['spring:dev']);
});

test('event chain, prize, end credit', () => {
  const st = fresh(); st.level = 4; const Q = R.questState(st);
  let c = at('2026-11-07T12:00:00Z');
  const ev = R.refresh(st, c);
  assert.ok(ev.find((e) => e.type === 'eventStart' && e.ev.id === 'ghost'));
  let vs = R.views(st, c);
  assert.ok(vs.find((v) => v.id === 'gh.fish'));
  R.onEvent(st, 'fish', 'fish_carp', 8, c); R.claim(st, 'gh.fish', c);
  R.onEvent(st, 'harvest', 'carrot', 25, c); R.claim(st, 'gh.harvest', c);
  R.onEvent(st, 'fish', 'fish_gold', 1, c);
  const gems = st.gems;
  // событие кончилось, последнее не забрали: и оно, и главный приз начисляются сами
  c = at('2026-11-07T21:00:00Z');
  const ev2 = R.refresh(st, c);
  assert.ok(ev2.find((e) => e.type === 'credit' && e.what === 'Призрачная неделя'));
  assert.equal(st.gems, gems + 3 + 15);
  assert.deepEqual(Q.ev['ghost:2026'], { end: 1 });
  assert.equal(R.refresh(st, c).filter((e) => e.type !== 'new').length, 0);
});

test('cards on screen: pins (up to 3) and story', () => {
  const st = fresh(); st.level = 5; const Q = R.questState(st), c = at('2026-11-07T12:00:00Z');
  Q.done['story.water'] = Q.done['story.wake'] = Q.done['story.note'] = 1;
  R.refresh(st, c);
  const cards = () => ids(R.cards(st, R.views(st, c), null));
  assert.deepEqual(cards(), ['story.fishing']);
  assert.ok(R.setPin(st, 'garden.beds', true, c));
  assert.ok(R.setPin(st, 'day:0', true, c));
  assert.deepEqual(cards(), ['garden.beds', 'day:0', 'story.fishing']);
  assert.ok(R.setPin(st, 'week:0', true, c));
  assert.deepEqual(cards(), ['garden.beds', 'day:0', 'week:0'], 'story hidden when 3 pinned');
  assert.equal(R.setPin(st, 'month:0', true, c), false, 'no 4th pin');
  // сдали закреплённое — на его месте следующее задание ветки
  R.onEvent(st, 'dig', null, 2, c);
  R.claim(st, 'garden.beds', c);
  assert.deepEqual(Q.pins, ['garden.first', 'day:0', 'week:0']);
  assert.ok(R.setPin(st, 'day:0', false, c));
  assert.deepEqual(cards(), ['garden.first', 'week:0', 'story.fishing']);
  // день сменился: устаревшее закрепление не мешает закрепить новое
  Q.per.week.list[0].got = 1;
  assert.ok(R.setPin(st, 'month:1', true, c));
  assert.deepEqual(Q.pins, ['garden.first', 'month:1']);
  // старое сохранение с одним pin
  const st2 = fresh(); st2.quests = { done: {}, prog: {}, told: {}, pin: 'x', per: {}, ev: {} };
  assert.deepEqual(R.questState(st2).pins, ['x']);
});

test('task texts: number and word agree', () => {
  const f = (n) => R.plural(n, ['рыбу', 'рыбы', 'рыб']);
  assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(f),
    ['рыбу', 'рыбы', 'рыбы', 'рыб', 'рыб', 'рыб', 'рыб', 'рыбу', 'рыбы', 'рыб', 'рыбу', 'рыб']);
  // в готовых текстах не остаётся скобок
  for (const kind of Object.keys(PERIODS)) for (const t of PERIODS[kind].pool) {
    assert.ok(!/[{}]/.test(t.task.replace('{n}', '').replace('{name}', '').replace(/\{[^{}]*\|[^{}]*\}/g, '')), t.task);
  }
  const st = fresh(); st.level = 5; Object.assign(R.questState(st).done, { 'story.fishing': 1, 'story.wood': 1 });
  const c = at('2026-11-07T12:00:00Z');
  R.refresh(st, c);
  for (const v of R.views(st, c).filter((v) => v.kind !== 'line')) assert.ok(!/[{}|]/.test(v.task + v.title), v.task);
});

test('full playthrough of branches', () => {
  const st = fresh(), Q = R.questState(st);
  let c = at('2026-11-07T12:00:00Z');
  const evs = ['harvest', 'plant', 'water', 'fish', 'chop', 'stump', 'mine', 'dig', 'mow', 'pick', 'sow', 'sell', 'earn', 'buy', 'expand', 'place', 'build', 'craft'];
  const keys = { harvest: ['carrot', 'wheat', 'beet', 'cabbage', 'tomato', 'corn', 'pumpkin'], plant: ['carrot'], fish: ['fish_carp', 'fish_perch', 'fish_gold'], mine: ['rock', 'boulder'], pick: ['apple', 'cherry'], sell: ['carrot', 'fish_carp'], buy: ['seed_carrot', 'sap_apple', 'sprinkler_drip', 'bp_kitchen'], sow: ['apple'], chop: ['oak', 'pine'], place: ['sprinkler_drip'],
    build: ['kitchen', 'carpentry', 'forge', 'stonecutter'], craft: ['carrot_salad', 'planks', 'nails', 'borscht', 'stone_block'] };
  for (let round = 0; round < 60; round++) {
    st.level = Math.min(15, 1 + round); st.house = Math.min(5, 1 + (round >> 2)); st.well = round > 3 ? 1 : 0;
    for (const e of evs) for (const k of keys[e] || [null]) R.onEvent(st, e, k, e === 'earn' ? 100 : 3, c);
    R.refresh(st, c);
    for (const v of R.views(st, c)) if (v.done && !v.claimed) assert.ok(R.claim(st, v.id, c), v.id);
    c = { ...c, now: c.now + 86400e3 };
  }
  for (const l of LINES) assert.equal(R.lineState(st, l.key).status, 'end', l.key);
  assert.ok(JSON.stringify(st.quests).length < 3000, 'save stays small: ' + JSON.stringify(st.quests).length);
});

console.log(`\n${tests} tests passed`);
