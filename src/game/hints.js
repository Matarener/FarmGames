// Подсказки к заданиям: что сделать по текущему заданию и где. Чистые функции над состоянием
// фермы (без DOM, картинок, звуков, Date.now и Math.random): задание + ферма → цель для стрелки.
// Стрелку над целью и кружок у края экрана рисует PixiScene, стрелки у кнопок — UI.
//
// Цель (подсказка):
//   { step, kind: 'obj', obj, x, y, icon }  — объект на карте: дерево, камень, пень, колодец, дом
//   { step, kind: 'tile', x, y, icon }      — клетка: грядка, вода, трава под новую грядку
//   { step, kind: 'chunk', c, x, y, icon }  — закрытый участок (x, y — его середина)
//   { step, kind: 'ui', ui }                — кнопка: 'quest' (забрать награду), 'market'
// step — шаг из HINT_STEPS, icon — иконка для кружка у края экрана, когда цель за экраном.

import { N, CHUNK, CHUNKS, T } from './World.js';
import { CROPS, OBJECTS, FLORA, HOUSE, WELL_COST, ITEMS, expansionCost, houseNeedChunks } from './data.js';
import * as Inv from './inventory.js';
import * as Flora from './flora.js';
import { cropFlags } from './beds.js';
import { GROUPS } from './questRules.js';

// Первые задания сюжета учат играть: в них стрелка видна сама. Дальше она включается только по просьбе
// игрока (переключатель в окне задания) и держится до смены задания.
// q — «вид» задания из questRules.js (views): kind, line, idx, goal — первая невыполненная цель.
export const HINT_AUTO = 5;
export const hintAuto = (q) => !!q && q.kind === 'line' && q.line === 'story' && q.idx < HINT_AUTO;
// Есть ли у задания подсказка на карте (у «Достигни 5 уровня» её нет)
export const hasHint = (q) => !!q && !!q.goal && !!stepsFor(q.goal);
const stepsFor = (g) => HINT_STEPS[g.ev === 'mine' && g.key === 'boulder' ? 'boulder' : g.ev === 'sell' && g.group === 'fish' ? 'sellFish' : g.ev || g.state];

// Цель задания (goal.ev или goal.state) → шаги по порядку. Подсказка — первый шаг, для которого
// нашлась цель: «собери урожай» — к созревшей грядке, нет такой — к грядке, которую надо полить, и т. д.
// wait — нужная культура уже растёт: подсказки нет, пока не созреет (дальше по списку не идём).
// free — созревшая грядка с другой культурой (собрать, чтобы освободить место).
export const HINT_STEPS = {
  harvest: ['ripe', 'thirsty', 'empty', 'wait', 'free', 'dig'],
  plant: ['empty', 'free', 'dig'],
  water: ['thirsty', 'empty', 'free', 'dig'],
  dig: ['dig'],
  fish: ['pond'],
  chop: ['tree'],
  stump: ['stump', 'tree'],
  mine: ['rock'],
  boulder: ['boulder'],
  pick: ['fruit'],
  mow: ['grass'],
  sow: ['sow', 'tree'],
  sell: ['market', 'ripe', 'thirsty', 'empty', 'wait'],
  earn: ['market', 'ripe', 'thirsty', 'empty', 'wait'],
  sellFish: ['market', 'pond'],
  buy: ['shop'],
  expand: ['chunk'],
  well: ['well'],
  house: ['house'],
};

// Не хватает на починку, участок или дом → где это добыть
const NEED_STEPS = {
  wood: ['tree', 'stump'],
  stone: ['rock'],
  ore: ['boulder', 'rock'],
  coins: ['market', 'ripe', 'thirsty', 'empty', 'wait'],
};

// Иконка в кружке у края экрана
const ICON = {
  thirsty: 'can', empty: 'seed', dig: 'dig', pond: 'fish', tree: 'axe', stump: 'axe', rock: 'pick',
  boulder: 'pick', grass: 'hay', well: 'build', house: 'house', chunk: 'lock', sow: 'seed',
};

// q — задание (вид из questRules.js), done — его уже можно сдать;
// s = { st, world, beds, px, py, now } — состояние фермы, клетка призрака и время (мс).
// prev — прошлая подсказка: пока её цель годится, стрелка не перескакивает к другой, даже если та ближе.
export function questHint(q, done, s, prev) {
  if (!q) return null;
  if (done) return { step: 'quest', kind: 'ui', ui: 'quest' };
  const g = q.goal, steps = g && stepsFor(g);
  if (!steps) return null;
  const c = { st: s.st, world: s.world, beds: s.beds, now: s.now, key: g.key || null, group: g.group || null, prev: prev || null, cache: { px: s.px, py: s.py } };
  return first(steps, c, 0);
}

// Та же ли цель у двух подсказок
export function sameHint(a, b) {
  if (!a || !b) return a === b;
  if (a.step !== b.step || a.kind !== b.kind) return false;
  if (a.kind === 'ui') return a.ui === b.ui;
  if (a.kind === 'obj') return a.obj === b.obj;
  if (a.kind === 'chunk') return a.c === b.c;
  return a.x === b.x && a.y === b.y;
}

const WAIT = {}; // шаг «подождать»: подсказки нет, следующие шаги не смотрим

function first(steps, c, depth) {
  for (const k of steps) { const h = STEP[k](c, depth); if (h) return h === WAIT ? null : h; }
  return null;
}

// ---------- куда может дойти призрак ----------

// Шагов от клетки (sx, sy) до каждой клетки, по которой можно пройти (-1 — не дойти).
// Как поиск пути (Pathfinding.js: 8 направлений без срезания углов): дойти можно туда же, что и по 4.
export function walkDist(world, sx, sy) {
  const n = N * N, d = new Int16Array(n).fill(-1);
  if (!world.inside(sx, sy)) return d;
  const q = new Int32Array(n);
  let head = 0, tail = 0;
  d[sy * N + sx] = 0; q[tail++] = sy * N + sx;
  while (head < tail) {
    const i = q[head++], x = i % N, y = (i / N) | 0, nd = d[i] + 1;
    if (x > 0 && d[i - 1] < 0 && world.walkable(x - 1, y)) { d[i - 1] = nd; q[tail++] = i - 1; }
    if (x < N - 1 && d[i + 1] < 0 && world.walkable(x + 1, y)) { d[i + 1] = nd; q[tail++] = i + 1; }
    if (y > 0 && d[i - N] < 0 && world.walkable(x, y - 1)) { d[i - N] = nd; q[tail++] = i - N; }
    if (y < N - 1 && d[i + N] < 0 && world.walkable(x, y + 1)) { d[i + N] = nd; q[tail++] = i + N; }
  }
  return d;
}

// Шагов до места рядом с прямоугольником клеток (где призрак встанет для действия), -1 — не подойти
function reach(c, x0, y0, w = 1, h = 1) {
  const C = c.cache, D = C.dist || (C.dist = walkDist(c.world, C.px, C.py));
  let best = -1;
  for (let y = y0 - 1; y <= y0 + h; y++) {
    if (y < 0 || y >= N) continue;
    for (let x = x0 - 1; x <= x0 + w; x++) {
      if (x < 0 || x >= N || (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h)) continue;
      const v = D[y * N + x];
      if (v >= 0 && (best < 0 || v < best)) best = v;
    }
  }
  return best;
}

// ---------- выбор ближайшей цели ----------

// Ближайшая из предложенных целей шага (d < 0 — недоступна). Прошлая цель этого же шага, пока
// годится и ненамного дальше новой, остаётся: стрелка не прыгает между соседними деревьями,
// пока призрак ходит по ферме, но и не держится за дальнюю цель, когда рядом есть другая.
const STICK_K = 1.25, STICK_ADD = 4;

function chooser(c, step, kind) {
  const P = c.prev && c.prev.step === step && c.prev.kind === kind ? c.prev : null;
  const best = { d: Infinity, x: 0, y: 0, o: null, ch: -1, icon: null }, old = { d: Infinity, x: 0, y: 0, o: null, ch: -1, icon: null };
  const keep = (t, d, x, y, o, ch, icon) => { t.d = d; t.x = x; t.y = y; t.o = o; t.ch = ch; t.icon = icon; };
  return {
    offer(d, x, y, o, icon, ch = -1) {
      if (d < 0) return;
      if (P && (o ? P.obj === o : ch >= 0 ? P.c === ch : P.x === x && P.y === y)) keep(old, d, x, y, o, ch, icon);
      if (d < best.d) keep(best, d, x, y, o, ch, icon);
    },
    get() {
      const t = old.d <= best.d * STICK_K + STICK_ADD ? old : best;
      if (t.d === Infinity) return null;
      if (t.o) return { step, kind, obj: t.o, x: t.o.gx, y: t.o.gy, icon: t.icon };
      if (t.ch >= 0) return { step, kind, c: t.ch, x: t.x, y: t.y, icon: t.icon };
      return { step, kind, x: t.x, y: t.y, icon: t.icon };
    },
  };
}

// Грядки: test(грядка, флаги cropFlags) → подходит ли; с ключом задания — только эта культура
function beds(c, step, test, byCrop) {
  const ch = chooser(c, step, 'tile'), w = c.world;
  for (const b of c.beds.values()) {
    if (w.tiles[b.i] !== T.SOIL) continue; // грядку перенесли: старая запись
    if (byCrop ? !b.crop || (c.key && b.crop !== c.key) : b.crop) continue;
    if (!test(b, b.crop ? cropFlags(b) : 0)) continue;
    ch.offer(reach(c, b.x, b.y), b.x, b.y, null, step === 'ripe' || step === 'free' ? b.crop : step === 'empty' && CROPS[c.key] ? c.key : ICON[step]);
  }
  return ch.get();
}

// Объекты на открытой земле: test(o) → подходит ли, extra(o) — надбавка к расстоянию (чем больше, тем реже выбирается)
function objects(c, step, test, extra, icon) {
  const ch = chooser(c, step, 'obj'), w = c.world;
  for (const o of w.objects) {
    if (!o || !test(o) || !w.isOpen(o.gx, o.gy)) continue;
    const d = reach(c, o.gx, o.gy, o.w, o.h);
    if (d >= 0) ch.offer(d + (extra ? extra(o) : 0), o.gx, o.gy, o, icon ? icon(o) : ICON[step]);
  }
  return ch.get();
}

const isTree = (o) => !!(OBJECTS[o.type] && OBJECTS[o.type].stump);

// Первое, чего не хватает на цену cost, → где это добыть (null — всего хватает или добыть негде)
function need(c, cost, depth) {
  if (depth > 2) return null;
  for (const [k, v] of Object.entries(cost)) {
    const have = k === 'coins' ? c.st.coins : k === 'gems' ? c.st.gems : Inv.count(c.st, k);
    if (have >= v) continue;
    // ресурсы ищем без ключа задания (монеты — с любой культуры)
    return NEED_STEPS[k] ? first(NEED_STEPS[k], { ...c, key: null, group: null }, depth + 1) : null;
  }
  return null;
}

const STEP = {
  ripe: (c) => beds(c, 'ripe', (b, fl) => fl & 4, true),
  thirsty: (c) => beds(c, 'thirsty', (b, fl) => fl & 8, true),
  empty: (c) => beds(c, 'empty', () => true, false),
  free: (c) => (c.key ? beds({ ...c, key: null }, 'free', (b, fl) => fl & 4, true) : null),
  // нужная культура растёт и полита — ждём
  wait: (c) => {
    for (const b of c.beds.values()) if (b.crop && (!c.key || b.crop === c.key) && c.world.tiles[b.i] === T.SOIL && !(cropFlags(b) & 12)) return WAIT;
    return null;
  },

  // трава под новую грядку: лучше рядом с другими грядками
  dig: (c) => {
    const ch = chooser(c, 'dig', 'tile'), w = c.world;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (w.tiles[i] !== T.GRASS || w.occ[i] >= 0 || !w.isOpen(x, y)) continue;
      const d = reach(c, x, y);
      if (d < 0) continue;
      const bed = (x > 0 && w.tiles[i - 1] === T.SOIL) || (x < N - 1 && w.tiles[i + 1] === T.SOIL) ||
        (y > 0 && w.tiles[i - N] === T.SOIL) || (y < N - 1 && w.tiles[i + N] === T.SOIL);
      ch.offer(d + (bed ? 0 : 8), x, y, null, ICON.dig);
    }
    return ch.get();
  },

  // посадить росток: есть саженец в рюкзаке — к свободной траве (лучше рядом с другими деревьями), нет — к дереву
  sow: (c) => {
    if (!Object.keys(c.st.items).some((id) => ITEMS[id] && ITEMS[id].floraOf && c.st.items[id] > 0)) return null;
    const ch = chooser(c, 'sow', 'tile'), w = c.world;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (w.tiles[i] !== T.GRASS || w.occ[i] >= 0 || !w.isOpen(x, y)) continue;
      const d = reach(c, x, y);
      if (d >= 0) ch.offer(d, x, y, null, ICON.sow);
    }
    return ch.get();
  },

  // вода, к которой можно подойти (рыбалка)
  pond: (c) => {
    const ch = chooser(c, 'pond', 'tile'), w = c.world;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (w.tiles[y * N + x] !== T.WATER || !w.isOpen(x, y)) continue;
      ch.offer(reach(c, x, y), x, y, null, ICON.pond);
    }
    return ch.get();
  },

  // дерево (своё — только если диких нет: его жалко рубить); с ключом задания — только этот вид
  tree: (c) => objects(c, 'tree', (o) => isTree(o) && (!c.key || !FLORA[c.key] || o.type === c.key), (o) => (o.own ? 40 : 0)),
  stump: (c) => objects(c, 'stump', (o) => o.type === 'stump'),
  // камень; валун (5 ударов) — если камня рядом нет
  rock: (c) => objects(c, 'rock', (o) => o.type === 'rock' || o.type === 'boulder', (o) => (o.type === 'boulder' ? 6 : 0)),
  boulder: (c) => objects(c, 'boulder', (o) => o.type === 'boulder'),
  grass: (c) => objects(c, 'grass', (o) => o.type === 'grass'),
  // плоды, которые висят (с ключом задания — только эти)
  fruit: (c) => objects(c, 'fruit', (o) => {
    const f = FLORA[o.type];
    return !!f && !!f.pick && (!c.key || f.fruit === c.key) && Flora.hasFruit(c.st, o, c.now);
  }, null, (o) => FLORA[o.type].fruit),

  // рынок: есть что продать (с группой задания — из этой группы: «продай 10 рыб»)
  market: (c) => {
    const G = c.group && GROUPS[c.group];
    for (const [id, n] of Object.entries(c.st.items)) if (n > 0 && ITEMS[id] && ITEMS[id].sell && (!G || G(id))) return { step: 'market', kind: 'ui', ui: 'market' };
    return null;
  },
  shop: () => ({ step: 'shop', kind: 'ui', ui: 'market' }),

  // бабушкин колодец: сначала то, чего не хватает на починку
  well: (c, depth) => {
    const o = c.world.well;
    if (!o || c.st.well || !c.world.isOpen(o.gx, o.gy)) return null;
    return need(c, WELL_COST, depth) || { step: 'well', kind: 'obj', obj: o, x: o.gx, y: o.gy, icon: ICON.well };
  },

  // улучшить дом: нужен новый участок, потом ресурсы, потом сам дом (нажать — откроется окно дома)
  house: (c, depth) => {
    const st = c.st, w = c.world;
    if (!HOUSE[st.house + 1] || depth > 2) return null;
    if (w.unlockedCount() < houseNeedChunks(st.house)) return STEP.chunk(c, depth + 1);
    const lack = need(c, HOUSE[st.house + 1].cost, depth);
    if (lack) return lack;
    const o = w.objects.find((x) => x && x.type === 'house');
    return o ? { step: 'house', kind: 'obj', obj: o, x: o.gx, y: o.gy, icon: ICON.house } : null;
  },

  // новый участок: ближайший из тех, что можно открыть; дом мал — сначала дом, не хватает — ресурсы
  chunk: (c, depth) => {
    const st = c.st, w = c.world, n = w.unlockedCount();
    if (depth > 2) return null;
    if (n >= HOUSE[st.house].chunks) return STEP.house(c, depth + 1);
    const lack = need(c, expansionCost(n), depth);
    if (lack) return lack;
    const ch = chooser(c, 'chunk', 'chunk'), px = c.cache.px, py = c.cache.py;
    for (let k = 0; k < CHUNKS * CHUNKS; k++) {
      if (!w.canUnlock(k)) continue;
      const x = (k % CHUNKS) * CHUNK + CHUNK / 2, y = ((k / CHUNKS) | 0) * CHUNK + CHUNK / 2;
      ch.offer(Math.hypot(x - px, y - py), x, y, null, ICON.chunk, k);
    }
    return ch.get();
  },
};
