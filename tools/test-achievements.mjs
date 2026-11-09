// Проверка правил достижений (src/game/achRules.js) без браузера: node tools/test-achievements.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../src/game/achRules.js';
import * as Q from '../src/game/questRules.js';
import { ACH, ACH_REWARDS, ACH_GROUPS, ACH_MEDALS } from '../src/game/achData.js';

let rs = 1;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const qc = { now: Date.parse('2026-11-09T12:00:00Z'), tz: 3, rng };
const ctx = { chunks: 1 };
const fresh = () => ({ coins: 50, gems: 5, xp: 0, level: 1, house: 1, well: 0, items: {}, stats: { cleared: 0, harvested: 0 } });
const ev = (st, e, key, n = 1) => Q.onEvent(st, e, key, n, qc);
const v = (st, id, c = ctx) => A.views(st, c).find((x) => x.id === id);
let tests = 0;
const test = (name, fn) => { fn(); tests++; console.log('ok', name); };

test('table: ids, groups, tiers, rewards, icons', () => {
  assert.equal(new Set(ACH.map((a) => a.id)).size, ACH.length);
  const groups = new Set(ACH_GROUPS.map((g) => g.key));
  // иконки — из листов интерфейса (tools/slice_art.py, ICON_SHEETS)
  const py = fs.readFileSync(new URL('./slice_art.py', import.meta.url), 'utf8');
  const sheets = py.slice(py.indexOf('ICON_SHEETS = {'), py.indexOf('ICON_PX'));
  const icons = new Set([...sheets.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]));
  icons.add('bed'); // иконка грядки — из самой картинки грядки (artSprites.js)
  for (const a of ACH) {
    assert.ok(groups.has(a.group), a.id);
    assert.ok(icons.has(a.icon), `${a.id}: нет иконки ${a.icon}`);
    assert.ok(a.tiers.length >= 1 && a.tiers.length <= ACH_MEDALS.length && ACH_MEDALS.length === ACH_REWARDS.length, a.id);
    assert.equal(A.medalOf(a, a.tiers.length), ACH_MEDALS.length, `${a.id}: за последнюю ступень — алмазная`);
    a.tiers.forEach((n, i) => assert.ok(i === 0 || n > a.tiers[i - 1], `${a.id}: ступени по возрастанию`));
    assert.equal(A.rewardsOf(a).length, a.tiers.length, a.id);
    assert.deepEqual(A.rewardsOf(a).at(-1), ACH_REWARDS.at(-1), `${a.id}: последняя ступень — самая щедрая`);
    assert.ok(!/[{}|]/.test(A.taskText(a, a.tiers[0])), a.id);
  }
});

test('texts: plural forms and big numbers', () => {
  const t = (id, n) => A.taskText(A.ACH_BY_ID[id], n);
  assert.equal(t('chop', 5), 'Сруби 5 деревьев');
  assert.equal(t('chop', 1000), 'Сруби 1000 деревьев');
  assert.equal(t('gold', 1), 'Поймай 1 золотую рыбку');
  assert.equal(t('gold', 20), 'Поймай 20 золотых рыбок');
  assert.equal(t('crops', 3), 'Вырасти 3 разные культуры');
  assert.equal(t('crops', 10), 'Вырасти 10 разных культур');
  assert.equal(t('chunks', 3), 'Расширь ферму до 3 участков');
  assert.equal(t('chunks', 21), 'Расширь ферму до 21 участка');
  assert.equal(t('earn', 250000), 'Заработай на рынке 250 000 монет');
  assert.equal(t('house', 2), 'Улучши дом до 2 уровня');
});

test('new game: no intro, views do not create state', () => {
  const st = fresh();
  const vs = A.views(st, ctx);
  assert.equal(st.ach, undefined, 'окно и кнопки состояние не создают');
  assert.equal(A.summary(vs).got, 0);
  assert.equal(A.summary(vs).total, ACH.reduce((s, a) => s + a.tiers.length, 0));
  assert.deepEqual(A.check(st, ctx), []);
  assert.ok(st.ach && st.ach.told);
  assert.equal(v(st, 'harvest').task, 'Собери 10 урожаев');
  assert.deepEqual(v(st, 'harvest').reward, { coins: 20 });
});

test('tier reached: one event, claim once', () => {
  const st = fresh();
  A.check(st, ctx);
  ev(st, 'harvest', 'carrot', 9);
  assert.deepEqual(A.check(st, ctx), []);
  ev(st, 'harvest', 'carrot', 1);
  const out = A.check(st, ctx);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'tier'); assert.equal(out[0].view.id, 'harvest'); assert.equal(out[0].tier, 1); assert.equal(out[0].medal, 1);
  assert.deepEqual(A.check(st, ctx), [], 'сказали один раз');
  const h = v(st, 'harvest');
  assert.ok(h.can === 1 && h.reached === 1 && h.got === 0 && h.medal === 0);
  ev(st, 'harvest', 'carrot', 5);
  assert.equal(v(st, 'harvest').task, 'Собери 10 урожаев', 'пока награда не забрана — цель взятой ступени');
  assert.equal(A.summary(A.views(st, ctx)).can, 1);
  const r = A.claim(st, 'harvest', ctx);
  assert.equal(st.coins, 70); assert.equal(r.from, 0); assert.equal(r.to, 1);
  assert.equal(A.claim(st, 'harvest', ctx), null);
  const h2 = v(st, 'harvest');
  assert.equal(h2.got, 1); assert.equal(h2.medal, 1); assert.equal(h2.n, 100); assert.equal(h2.p, 15); assert.equal(h2.task, 'Собери 100 урожаев'); assert.deepEqual(h2.reward, { coins: 50 });
});

test('several tiers at once: one event, rewards summed', () => {
  const st = fresh();
  A.check(st, ctx);
  ev(st, 'earn', 'carrot', 3000);
  const out = A.check(st, ctx);
  assert.equal(out.length, 1); assert.equal(out[0].tier, 2);
  assert.deepEqual(v(st, 'earn').reward, { coins: 70 });
  assert.equal(v(st, 'earn').n, 2500, 'цель последней взятой ступени');
  A.claim(st, 'earn', ctx);
  assert.equal(st.coins, 120); assert.equal(st.ach.got.earn, 2);
});

test('old save: one intro instead of many toasts, quests backfilled', () => {
  const st = fresh();
  Q.questState(st).done = { 'story.wake': 1, 'story.note': 1, 'story.water': 1, 'garden.beds': 1, 'garden.first': 1, 'story.fishing': 1, 'story.wood': 1, 'story.stumps': 1, 'story.stone': 1, 'story.well': 1, 'forest.axe': 1 };
  st.stats.ev = { harvest: 150, 'harvest:carrot': 100, 'harvest:wheat': 40, 'harvest:beet': 10, fish: 12, chop: 30 };
  st.level = 6; st.house = 2;
  const out = A.check(st, { chunks: 4 });
  assert.equal(out.length, 1); assert.equal(out[0].type, 'intro');
  // harvest II, crops I, fish I, chop II, level I, house I, chunks I, quest I (11 сданных заданий ветки)
  assert.equal(out[0].n, 8);
  assert.equal(st.stats.ev.quest, 11);
  assert.deepEqual(A.check(st, { chunks: 4 }), []);
  ev(st, 'fish', 'fish_carp', 38);
  const t = A.check(st, { chunks: 4 });
  assert.equal(t.length, 1); assert.equal(t[0].view.id, 'fish'); assert.equal(t[0].tier, 2);
});

test('claim all', () => {
  const st = fresh();
  A.check(st, ctx);
  ev(st, 'harvest', 'carrot', 10); ev(st, 'chop', 'oak', 25); ev(st, 'fish', 'fish_gold', 1);
  const r = A.claimAll(st, ctx);
  // harvest I 20 + chop I+II 70 + fish… рыба 1 из 10 — нет; gold I 20
  assert.equal(r.n, 3); assert.deepEqual(r.reward, { coins: 110 });
  assert.equal(st.coins, 160);
  assert.equal(A.claimAll(st, ctx), null);
});

test('distinct crops', () => {
  const st = fresh();
  for (const c of ['carrot', 'wheat']) ev(st, 'harvest', c);
  ev(st, 'harvest', 'fish_carp'); // не культура
  assert.equal(v(st, 'crops').p, 2);
  ev(st, 'harvest', 'beet', 5);
  assert.equal(v(st, 'crops').p, 3); assert.equal(v(st, 'crops').reached, 1);
});

test('stats: level, house (4 tiers → top rewards), chunks, gift days', () => {
  const st = fresh();
  st.house = 2;
  assert.deepEqual(v(st, 'house').reward, { coins: 50 }, 'у дома первая ступень — награда II');
  assert.equal(A.medalOf(A.ACH_BY_ID.house, 1), 2, 'и серебряная медаль');
  st.house = 5;
  assert.equal(v(st, 'house').reached, 4);
  assert.deepEqual(v(st, 'house').reward, { coins: 1600, gems: 12 });
  assert.equal(v(st, 'chunks', { chunks: 10 }).reached, 3);
  st.gifts = { daily: { d: 1, n: 31 } };
  assert.equal(v(st, 'days').reached, 2);
  st.level = 25;
  assert.equal(v(st, 'level').reached, 5);
  A.check(st, { chunks: 25 });
  A.claimAll(st, { chunks: 25 });
  const h = v(st, 'house');
  assert.ok(h.complete); assert.equal(h.reward, null); assert.equal(h.can, 0); assert.equal(h.medal, 5);
  assert.ok(v(st, 'level').complete);
});

test('quest counter: claims count, bonuses do not', () => {
  const st = fresh();
  ev(st, 'harvest', 'carrot', 1);
  Q.claim(st, 'story.wake', qc);
  assert.equal(st.stats.ev.quest, 1);
  // задания дня: бонус «все задания дня» — не задание
  st.level = 3;
  Q.refresh(st, qc);
  const P = st.quests.per.day;
  for (const it of P.list) it.p = it.n;
  for (let i = 0; i < P.list.length; i++) assert.ok(Q.claim(st, 'day:' + i, qc));
  assert.equal(st.stats.ev.quest, 1 + P.list.length);
  assert.ok(Q.claim(st, 'day:bonus', qc));
  assert.equal(st.stats.ev.quest, 1 + P.list.length);
});

test('tiers raised after claim: no double reward', () => {
  const st = fresh();
  A.check(st, ctx);
  ev(st, 'mow', null, 10);
  A.claim(st, 'mow', ctx);
  st.ach.got.mow = 3; // как будто ступени в таблице подняли
  const d = v(st, 'mow');
  assert.equal(d.can, 0); assert.equal(d.n, 750); assert.deepEqual(d.reward, ACH_REWARDS[3]);
  assert.equal(A.claim(st, 'mow', ctx), null);
});

test('Огородник: считаются все свои грядки, медали «Землекопа» остаются', () => {
  const st = fresh(), c = { chunks: 1, bedsAll: 4 };
  A.check(st, c);
  assert.equal(v(st, 'dig', c).reached, 1);
  assert.ok(A.claim(st, 'dig', c));
  // старое сохранение: «Землекоп» забран до 3 ступени (копали 30 раз), а грядок 10 — медали те же, награды не повторяются
  st.ach.got.dig = 3;
  const d = v(st, 'dig', { chunks: 1, bedsAll: 10 });
  assert.equal(d.got, 3); assert.equal(d.can, 0); assert.equal(d.n, 20); assert.deepEqual(d.reward, ACH_REWARDS[3]);
  assert.equal(A.claim(st, 'dig', { chunks: 1, bedsAll: 10 }), null);
  assert.equal(v(st, 'dig', { chunks: 1, bedsAll: 20 }).can, 1);
  assert.equal(v(st, 'dig', { chunks: 1 }).p, 0, 'без мира — ноль');
});

console.log(`\n${tests} tests passed`);
