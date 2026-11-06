// Дикая поросль: высокая трава и кусты сами появляются на свободной земле.
// Чистые правила над состоянием st: время (now, мс) и случайность (rng → [0,1)) приходят
// параметрами, картинок и звуков здесь нет — эффекты делает Farm по возвращённым событиям.
//
// st.wild = { at: до какого момента досчитаны попытки (мс), list: [[x, y, вид, когда появилось (мс)], ...] }
//   вид — 'grass' (трава) или вид куста из FLORA (дикий куст; растёт из ростка).
// Мир (world) нужен только для вопросов «свободна ли клетка» и «открыта ли земля».

import { WILD, FLORA, CROPS, seedId } from './data.js';
import { addItem } from './inventory.js';
import { N, CHUNK, CHUNKS, T } from './World.js';

const BUSHES = Object.values(FLORA).filter((f) => f.kind === 'bush').map((f) => f.key);

export const groupOf = (kind) => kind === 'grass' ? 'grass' : 'bush';

// Сколько клеток до края открытой земли: до закрытого участка или до тумана (края карты).
// 1 — клетка у самого края.
export function edgeDist(world, x, y) {
  let d = Math.min(x, y, N - 1 - x, N - 1 - y) + 1;
  const cx = (x / CHUNK) | 0, cy = (y / CHUNK) | 0, lx = x - cx * CHUNK, ly = y - cy * CHUNK;
  const closed = (ax, ay) => ax >= 0 && ay >= 0 && ax < CHUNKS && ay < CHUNKS && !world.unlocked[ay * CHUNKS + ax];
  if (closed(cx - 1, cy)) d = Math.min(d, lx + 1);
  if (closed(cx + 1, cy)) d = Math.min(d, CHUNK - lx);
  if (closed(cx, cy - 1)) d = Math.min(d, ly + 1);
  if (closed(cx, cy + 1)) d = Math.min(d, CHUNK - ly);
  return d;
}

// Свободная трава открытой земли: не тропинка, не грядка, не вода, не объект, не рядом с призраком
export function freeCell(world, x, y, blocked) {
  if (!world.isOpen(x, y)) return false;
  const i = y * N + x;
  if (world.tiles[i] !== T.GRASS || world.occ[i] >= 0) return false;
  return !(blocked && blocked(x, y));
}

function caps(world) {
  const open = world.unlockedCount();
  const cap = (g) => Math.min(WILD[g].max, Math.ceil(WILD[g].perChunk * open));
  return { grass: cap('grass'), bush: cap('bush') };
}

// reach(x, y) — можно ли подойти к клетке: появляется там, куда призрак дойдёт.
// Кусты — только у края открытой земли (WILD.bush.band); если там подойти некуда — у края где угодно.
function pickCell(world, group, rng, blocked, reach) {
  let cells = [], far = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!freeCell(world, x, y, blocked)) continue;
    if (group === 'bush' && edgeDist(world, x, y) > WILD.bush.band) continue;
    if (reach && !reach(x, y)) { if (group === 'bush') far.push(x, y); continue; }
    cells.push(x, y);
  }
  if (!cells.length) cells = far;
  if (!cells.length) return null;
  const k = Math.floor(rng() * (cells.length / 2)) * 2;
  return [cells[k], cells[k + 1]];
}

// Одна попытка появления в момент t. → событие { x, y, kind } или null
function trySpawn(st, world, t, rng, blocked, reach) {
  if (rng() >= WILD.chance) return null;
  const cap = caps(world), have = { grass: 0, bush: 0 };
  for (const e of st.wild.list) have[groupOf(e[2])]++;
  const groups = ['grass', 'bush'].filter((g) => have[g] < cap[g]);
  if (!groups.length) return null;
  let r = rng() * groups.reduce((s, g) => s + WILD[g].w, 0), group = groups[0];
  for (const g of groups) { r -= WILD[g].w; if (r < 0) { group = g; break; } }
  const at = pickCell(world, group, rng, blocked, reach);
  if (!at) return null;
  const kind = group === 'grass' ? 'grass' : BUSHES[Math.floor(rng() * BUSHES.length)];
  const e = [at[0], at[1], kind, t];
  st.wild.list.push(e);
  return { x: at[0], y: at[1], kind, born: t };
}

// Досчитать попытки до now. place(событие) ставит объект на карту сразу (чтобы следующая
// попытка видела клетку занятой) и возвращает false, если не вышло. → список появившегося.
export function wildTick(st, world, { now, rng, blocked, reach, place }) {
  const W = st.wild || (st.wild = { at: now, list: [] });
  const every = WILD.every * 1000;
  let n = Math.floor((now - W.at) / every);
  if (n <= 0) return [];
  const first = W.at + Math.max(0, n - WILD.catchUp) * every; // слишком давно — только последние catchUp попыток
  W.at += n * every;
  n = Math.min(n, WILD.catchUp);
  const out = [];
  for (let k = 1; k <= n; k++) {
    const ev = trySpawn(st, world, first + k * every, rng, blocked, reach);
    if (!ev) continue;
    if (place && place(ev) === false) { st.wild.list.pop(); continue; }
    out.push(ev);
  }
  return out;
}

// Дикое растение или трава ушли с клетки (срубили, выкопали, сорвали)
export function forgetWild(st, x, y) {
  if (st.wild) st.wild.list = st.wild.list.filter((e) => e[0] !== x || e[1] !== y);
}

const roll = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));

// Сорвать траву: сено и иногда семена культуры, доступной по уровню. → { items: [{id, n}], xp }
export function mowGrass(st, x, y, rng) {
  forgetWild(st, x, y);
  const items = [];
  const give = (id, n) => { const got = addItem(st, id, n); if (got) items.push({ id, n: got }); };
  give('hay', roll(rng, WILD.mow.hay));
  if (rng() < WILD.mow.seed) {
    const crops = Object.values(CROPS).filter((c) => c.level <= (st.level || 1));
    if (crops.length) give(seedId(crops[Math.floor(rng() * crops.length)].key), 1);
  }
  return { items, xp: WILD.mow.xp };
}
