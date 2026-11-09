// Улучшение инструментов: чистые функции над состоянием фермы st (без DOM, звуков, Date.now и Math.random),
// как houseRules.js. Время (now, мс) и случайность (rng) приходят снаружи, чтобы потом эти же функции
// выполнял сервер. Эффекты (искры над кузницей, тосты, окно) — tools.js и UI.
//
// Состояние: st.tools = { axe: 2, pick: 3, can: 1 } — уровни инструментов (нет записи — 1);
// st.toolUp = { t, to, end } — что сейчас куётся: инструмент, до какого уровня, когда будет готово (мс).
// Нет st.toolUp — наковальня свободна. Монеты и материалы списываются сразу, отмены нет (как у дома).
// Таблицы (цены, время, бонусы) — toolData.js.

import { TOOL_UP, TOOL_MAX, TOOL_PERKS, CAN_AREA, TOOL_AT } from './toolData.js';
import { OBJECTS, HOUSE } from './data.js';
import * as Inv from './inventory.js';
import { missing, missText, gemsFor, isBuilt } from './buildRules.js';
import { plural } from './questRules.js';

const S = 1000;

// ---------------- Уровни ----------------

// Уровень инструмента t (axe | pick | can): 1–4
export const toolLevel = (st, t) => Math.min(TOOL_MAX, Math.max(1, (st && st.tools && st.tools[t]) || 1));
// Название инструмента на уровне lv (по умолчанию — на нынешнем): «Стальной топор»
export const toolName = (st, t, lv = toolLevel(st, t)) => TOOL_UP[t].names[lv - 1];
// Какой инструмент — предмет рюкзака id (tool_axe → axe); удочка не улучшается — null
export const toolOfItem = (id) => Object.keys(TOOL_UP).find((k) => TOOL_UP[k].item === id) || null;
// Следующее улучшение инструмента t: { level, time, cost } или null (уровень уже последний)
export const nextUp = (st, t) => (TOOL_UP[t] && TOOL_UP[t].up[toolLevel(st, t)]) || null;
// Сколько улучшений сделано всего (достижение, задания)
export const upgradesDone = (st) => Object.keys(TOOL_UP).reduce((s, t) => s + toolLevel(st, t) - 1, 0);

// ---------------- Улучшение по времени ----------------

export const toolUp = (st) => st.toolUp || null;
export const upLeft = (st, now) => (st.toolUp ? Math.max(0, (st.toolUp.end - now) / S) : 0);
// Доля готовности 0..1 (полоска над кузницей и в окне)
export function upPart(st, now) {
  const u = st.toolUp, d = u && TOOL_UP[u.t] && TOOL_UP[u.t].up[u.to - 1], t = d ? d.time : 0;
  return !u ? 0 : t > 0 ? Math.max(0, Math.min(1, 1 - upLeft(st, now) / t)) : 1;
}

// Можно ли начать улучшение инструмента t: null или причина { why, max?, forge?, busy?, locked?, lack? }
export function upBlock(st, t, now) {
  const T = TOOL_UP[t];
  if (!T) return { why: 'Этот инструмент не улучшается' };
  const lv = toolLevel(st, t), next = T.up[lv];
  if (!next) return { why: `${T.names[lv - 1]}: лучше уже не сделать`, max: true };
  if (!isBuilt(st, TOOL_AT, now)) return { why: 'Инструменты улучшают в кузнице: сначала постройте её', forge: true };
  const u = st.toolUp;
  if (u) return { why: u.t === t ? 'Уже куётся' : `Наковальня занята: куётся ${toolName(st, u.t, u.to).toLowerCase()}`, busy: true };
  if (st.level < next.level) return { why: `Откроется с ${next.level} уровня`, locked: true };
  const miss = missing(st, next.cost);
  if (miss.length) return { why: `Не хватает: ${missText(miss)}`, lack: miss };
  return null;
}

// Начать улучшение: монеты и материалы уходят сразу. → { t, to, end } или null
export function startUp(st, t, now) {
  if (upBlock(st, t, now)) return null;
  const to = toolLevel(st, t) + 1, next = TOOL_UP[t].up[to - 1];
  for (const [id, n] of Object.entries(next.cost)) {
    if (id === 'coins' || id === 'gems') st[id] -= n; else Inv.takeItem(st, id, n);
  }
  st.toolUp = { t, to, end: now + next.time * S };
  return { ...st.toolUp };
}

// Кончилось ли улучшение (раз в секунду и при входе): инструмент получает новый уровень. → { t, to } или null
export function upTick(st, now) {
  const u = st.toolUp;
  if (!u || u.end > now) return null;
  delete st.toolUp;
  if (!TOOL_UP[u.t] || u.to <= toolLevel(st, u.t)) return null;
  (st.tools || (st.tools = {}))[u.t] = Math.min(TOOL_MAX, u.to);
  if (u.t === 'can') st.can = canMax(st); // новая лейка приходит полной
  return { t: u.t, to: st.tools[u.t] };
}

// Доковать сейчас за кристаллы (1 кристалл за 10 минут, как здания). → { gems } или null
export function speedUp(st, now) {
  const left = upLeft(st, now);
  if (!st.toolUp || left <= 0) return null;
  const gems = gemsFor(left);
  if (st.gems < gems) return null;
  st.gems -= gems;
  st.toolUp.end = now;
  return { gems };
}

// Режим тестера: поставить уровень сразу (без цены и времени)
export function setLevel(st, t, lv) {
  if (!TOOL_UP[t]) return false;
  lv = Math.max(1, Math.min(TOOL_MAX, lv | 0));
  if (lv === 1) { if (st.tools) delete st.tools[t]; } else (st.tools || (st.tools = {}))[t] = lv;
  if (st.toolUp && st.toolUp.t === t) delete st.toolUp;
  if (t === 'can' && st.can > canMax(st)) st.can = canMax(st); // лейку сделали меньше
  return true;
}

// ---------------- Что даёт уровень ----------------

// Каким инструментом бьют объект: камни и валуны — киркой, остальное — топором
export const toolFor = (type) => (OBJECTS[type] && OBJECTS[type].action === 'mine' ? 'pick' : 'axe');
// Сколько ударов нужно объекту прочности hp на уровне lv инструмента (по умолчанию — нынешнем)
export function hitsFor(st, type, hp, lv = toolLevel(st, toolFor(type))) {
  return Math.max(1, Math.ceil(hp / TOOL_PERKS.power[lv - 1] - 1e-9));
}

// Мастерский топор: дерево падает с корнем, пня не остаётся
export const noStump = (st, lv = toolLevel(st, 'axe')) => lv >= TOOL_PERKS.axe.noStump;

// Шанс руды с объекта type (камень: прибавка от кирки; валун и так всегда даёт руду)
export function oreChance(st, type, lv = toolLevel(st, 'pick')) {
  const d = OBJECTS[type];
  if (!d || !d.oreChance) return 0;
  return d.oreChance >= 1 ? 1 : Math.min(1, d.oreChance + TOOL_PERKS.pick.oreBonus[lv - 1]);
}
// Сколько руды: [от, до] (валуну мастерская кирка добавляет сверху)
export function oreRange(st, type, lv = toolLevel(st, 'pick')) {
  const d = OBJECTS[type], r = (d && d.ore) || [1, 1];
  const add = d && d.oreChance >= 1 ? TOOL_PERKS.pick.boulderOre[lv - 1] : 0;
  return [r[0] + add, r[1] + add];
}

// Лейка: сколько поливов сверх лейки дома и сколько всего; какие клетки поливает одно нажатие ([dx, dy])
export const canBonus = (st, lv = toolLevel(st, 'can')) => TOOL_PERKS.can.cap[lv - 1];
export const canMax = (st) => (HOUSE[st.house] ? HOUSE[st.house].can : 0) + canBonus(st);
export const canArea = (st, lv = toolLevel(st, 'can')) => CAN_AREA[TOOL_PERKS.can.area[lv - 1]];
// Какие грядки польёт нажатие по грядке (x, y): клетки области лейки, где needs(x, y) — грядке нужен полив.
// Вода — по одной на грядку, пока есть в лейке (st.can); сама грядка — первой. → [[x, y], ...]
export function waterCells(st, x, y, needs) {
  const out = [];
  for (const [dx, dy] of canArea(st)) {
    if (out.length >= (st.can || 0)) break;
    if (needs(x + dx, y + dy)) out.push([x + dx, y + dy]);
  }
  return out;
}

// Дерево упало с корнем (мастерский топор): то, что дал бы пень, — сразу. → { items: [{ id, n }], xp }
export function rootOut(st, rng) {
  const d = OBJECTS.stump, items = [];
  for (const [id, [a, b]] of Object.entries(d.drops || {})) {
    const got = Inv.addItem(st, id, a + Math.floor(rng() * (b - a + 1)));
    if (got) items.push({ id, n: got });
  }
  return { items, xp: d.xp || 0 };
}

// Строки для окна: что инструмент t даёт на уровне lv — [{ key, label, val }]. Окно сравнивает нынешний
// уровень со следующим и подсвечивает то, что меняется. house — уровень дома (лейка дома).
const HIT_ROWS = {
  axe: [['oak', 'Дуб, ель'], ['linden', 'Липа, берёза, клён'], ['apple', 'Плодовые, сакура'], ['stump', 'Кусты, пни']],
  pick: [['boulder', 'Валун'], ['rock', 'Камень']],
};
const AREA_TEXT = { one: '1 грядку', cross: '5 грядок крестом', square: '9 грядок (3×3)' };
const hitsText = (n) => `${n} ${plural(n, ['удар', 'удара', 'ударов'])}`;
export function perkRows(st, t, lv) {
  const out = [];
  for (const [type, label] of HIT_ROWS[t] || []) out.push({ key: type, label, val: hitsText(hitsFor(st, type, OBJECTS[type].hp, lv)) });
  if (t === 'axe') out.push({ key: 'stump', label: 'Пень после дерева', val: noStump(st, lv) ? 'не остаётся' : 'остаётся' });
  if (t === 'pick') {
    out.push({ key: 'ore', label: 'Руда из камня', val: `${Math.round(oreChance(st, 'rock', lv) * 100)}%` });
    const [a, b] = oreRange(st, 'boulder', lv);
    out.push({ key: 'boulderOre', label: 'Руда из валуна', val: `${a}–${b}` });
  }
  if (t === 'can') {
    out.push({ key: 'cap', label: 'Поливов в лейке', val: String((HOUSE[st.house] ? HOUSE[st.house].can : 0) + canBonus(st, lv)) });
    out.push({ key: 'area', label: 'Одно нажатие поливает', val: AREA_TEXT[TOOL_PERKS.can.area[lv - 1]] });
  }
  return out;
}

// Что стало лучше на уровне lv по сравнению с прошлым: строки perkRows, где значение поменялось
export function upNews(st, t, lv) {
  const was = perkRows(st, t, Math.max(1, lv - 1));
  return perkRows(st, t, lv).filter((r, i) => !was[i] || was[i].val !== r.val);
}
