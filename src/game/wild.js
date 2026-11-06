// Дикий лес у края тумана: на свободной траве у края карты сами появляются ростки
// и за несколько часов вырастают в деревья (и пока игра закрыта).
//
// Правила отдельно от отрисовки: время (now, мс) и случайность (rng) приходят параметрами,
// числа — в таблице WILD (data.js). Функции меняют мир и состояние и возвращают события,
// а эффекты (звук, частицы) делает Farm.

import { WILD, OBJECTS } from './data.js';
import { N, T } from './World.js';

const MAX_STEPS = 200; // сколько ростков максимум «догоняем» за одно отсутствие

// Стадия роста саженца: 0 — росток, 1 — саженец, 2 — взрослое дерево
export function treeStage(o, now) {
  const age = (now - o.born) / 1000, S = WILD.stages;
  let t = 0;
  for (let k = 0; k < S.length; k++) { t += S[k]; if (age < t) return k; }
  return S.length;
}

// Сколько секунд осталось до следующей стадии
export function treeLeftSec(o, now) {
  const age = (now - o.born) / 1000, S = WILD.stages;
  let t = 0;
  for (let k = 0; k < S.length; k++) { t += S[k]; if (age < t) return Math.ceil(t - age); }
  return 0;
}

// Клетки, где может появиться росток: свободная трава открытой земли у края карты
export function wildCells(world, blocked) {
  const out = [], b = WILD.band;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (x >= b && y >= b && x < N - b && y < N - b) { x = N - b - 1; continue; } // середина карты — мимо
    const i = y * N + x;
    if (world.tiles[i] !== T.GRASS || world.occ[i] >= 0 || !world.isOpen(x, y)) continue;
    if (blocked && blocked(x, y)) continue;
    out.push(x, y);
  }
  return out;
}

function pickTree(rng) {
  const list = Object.entries(WILD.trees);
  let sum = 0; for (const [, w] of list) sum += w;
  let r = rng() * sum;
  for (const [type, w] of list) { r -= w; if (r < 0) return type; }
  return list[0][0];
}

// Посадить дикий саженец (или сразу дерево/пень — при загрузке сохранения)
export function placeWild(world, x, y, tree, v, born, stump, now) {
  if (!OBJECTS[tree]) return null;
  const o = world.add('sapling', x, y);
  if (!o) return null;
  o.wild = 1; o.tree = tree; o.v = v; o.born = born;
  o.stage = treeStage(o, now);
  if (o.stage >= WILD.stages.length) grownUp(o);
  if (stump) { o.was = o.type; o.type = 'stump'; o.hp = OBJECTS.stump.hp; }
  return o;
}

function grownUp(o) { o.type = o.tree; o.hp = OBJECTS[o.tree].hp; }

// Шаг правил. st.wild = { at } — время последнего «появления» ростка.
// ctx: { now, rng, blocked(x, y) } → события [{ type: 'sprout' | 'stage' | 'grown', o }]
export function wildTick(st, world, ctx) {
  const { now, rng } = ctx, ev = [], step = WILD.every * 1000;
  const W = st.wild || (st.wild = { at: now });
  if (!(W.at <= now)) W.at = now;
  // долгое отсутствие: старые «ходы» дальше лимита просто пропускаем
  if (now - W.at > step * MAX_STEPS) W.at = now - step * MAX_STEPS;
  while (now - W.at >= step) {
    W.at += step;
    let growing = 0;
    for (const o of world.objects) if (o && o.wild && o.type === 'sapling' && treeStage(o, W.at) < WILD.stages.length) growing++;
    if (growing >= WILD.cap) continue;
    const cells = wildCells(world, ctx.blocked);
    if (!cells.length) continue;
    const j = ((rng() * (cells.length / 2)) | 0) * 2;
    const o = placeWild(world, cells[j], cells[j + 1], pickTree(rng), (rng() * 1e6) | 0, W.at, 0, now);
    if (o) ev.push({ type: 'sprout', o });
  }
  // рост
  for (const o of world.objects) {
    if (!o || !o.wild || o.type !== 'sapling') continue;
    const s = treeStage(o, now);
    if (s === o.stage) continue;
    o.stage = s;
    if (s >= WILD.stages.length) { grownUp(o); world.version++; ev.push({ type: 'grown', o }); } else ev.push({ type: 'stage', o });
  }
  return ev;
}

// Для сохранения: [x, y, дерево, вариант, когда проросло (мс), пень ? 1 : 0]
export function exportWild(world) {
  const out = [];
  for (const o of world.objects) if (o && o.wild) out.push([o.gx, o.gy, o.tree, o.v, o.born, o.type === 'stump' ? 1 : 0]);
  return out;
}

export function importWild(world, list, now) {
  for (const [x, y, tree, v, born, stump] of list || []) placeWild(world, x, y, tree, v, born, stump, now);
}
