// Бот баланса: играет за игрока по настоящим таблицам и правилам игры (data.js, buildData.js, animalData.js,
// questRules, orderRules, houseRules, buildRules, beds, inventory…) на стартовой карте assets/map.json и отвечает
// на три вопроса:
//   1) абузы — где энергия, монеты или опыт берутся из ничего (петли без ожидания или с выгодой больше 1);
//   2) тупики — где дом или новый участок стоят, потому что ресурс взять негде (кроме кристаллов);
//   3) плавность — сколько игровых часов и дней уходит на каждый шаг (участок, дом, уровень).
//
//   node tools/balance-sim.mjs                      — отчёт по всем профилям игроков на числах игры
//   PACE='{"xp":[30,2],"exp":[80,2]}' node tools/balance-sim.mjs — примерить другие числа темпа (см. PACE ниже)
//   node tools/balance-sim.mjs --seeds 10 --days 150 --profile normal --log
//   node tools/balance-sim.mjs --json out.json      — сырые данные для графиков
//   TOOLS=off node tools/balance-sim.mjs            — без улучшения инструментов в кузнице (сравнить)
//
// Бот не жульничает: не рыбачит ради денег (кроме профиля «Абузер»), кристаллы тратит только на выход из тупика
// (руда, дерево за кристаллы на рынке) — такие траты считаются отдельно, это и есть мягкий тупик.

import fs from 'fs';
import { World, CHUNKS, START_CHUNK } from '../src/game/World.js';
import * as D from '../src/game/data.js';
import { BUILDINGS, RECIPES, CRAFT_GOODS, bpId } from '../src/game/buildData.js';
import { ANIMALS, ANIMAL_GOODS, FEED_XP, GROW_XP, animalType } from '../src/game/animalData.js';
import * as Inv from '../src/game/inventory.js';
import * as Beds from '../src/game/beds.js';
import * as Plant from '../src/game/planting.js';
import * as House from '../src/game/houseRules.js';
import * as Build from '../src/game/buildRules.js';
import * as Q from '../src/game/questRules.js';
import * as Gift from '../src/game/giftRules.js';
import * as Wheel from '../src/game/wheelRules.js';
import * as Ord from '../src/game/orderRules.js';
import * as Ach from '../src/game/achRules.js';
import * as Fish from '../src/game/fishRules.js';
import * as Tool from '../src/game/toolRules.js';
import { TOOL_UP, TOOL_PERKS, TOOL_AT } from '../src/game/toolData.js';
import { QUEST_TZ } from '../src/game/questData.js';
import { ORDERS } from '../src/game/orderData.js';
import { WHEEL } from '../src/game/wheelData.js';

const { CROPS, FISH, FLORA, FLORA_GOODS, OBJECTS, HOUSE, ITEMS, SHOP, SHOP_FOOD, SPRINKLERS, ENERGY } = D;

// ---------------- Аргументы ----------------
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true; };
const OPT = {
  seeds: +arg('seeds', 8), days: +arg('days', 150), profile: arg('profile', 'all'),
  log: !!arg('log', false), trace: !!arg('trace', false), json: arg('json', null), compare: !!arg('compare', false),
};

// ---------------- Примерка других чисел темпа ----------------
// Бот играет на числах игры (data.js, buildData.js). Чтобы примерить другие, не меняя игру, задайте их в PACE (JSON):
//   xp: [a, b] — опыт до следующего уровня a·L^b;  exp: [k, p] — монеты за n-й участок k·n^p;
//   house: [монеты за дом 2, 3, 4, 5];  crops: { corn: [семена, продажа, опыт] … };
//   goods: { strawberry_cake: цена продажи … } (товары мастерских);  beds: { …BEDS.limit }
// Например: PACE='{"xp":[20,2],"exp":[40,2],"house":[50,1200,6000,25000]}' — вариант «~3 недели» из отчёта 9 ноября.
const SIM_FN = { expansionCost: D.expansionCost, xpToNext: D.xpToNext };
const PACE = process.env.PACE ? JSON.parse(process.env.PACE) : null;
if (PACE) {
  if (PACE.xp) { const [a, b] = PACE.xp; SIM_FN.xpToNext = (L) => Math.round(a * Math.pow(L, b)); }
  // ITEMS и SHOP собраны из таблиц при загрузке data.js — цены в них меняем тоже, иначе рынок продаёт по старым
  for (const [k, [seed, sell, xp]] of Object.entries(PACE.crops || {})) {
    Object.assign(CROPS[k], { seed, sell, xp });
    ITEMS[k].sell = sell;
    const shop = D.SHOP.find((o) => o.item === D.seedId(k));
    if (shop) shop.price = seed;
  }
  for (const [k, sell] of Object.entries(PACE.goods || {})) { CRAFT_GOODS[k].sell = sell; ITEMS[k].sell = sell; }
  (PACE.house || []).forEach((c, i) => { if (c && HOUSE[i + 2]) HOUSE[i + 2].cost.coins = c; });
  if (PACE.exp) { const [k, pw] = PACE.exp; SIM_FN.expansionCost = (n) => ({ ...D.expansionCost(n), coins: r5(k * Math.pow(n, pw)) }); }
  if (PACE.beds) Object.assign(D.BEDS.limit, PACE.beds);
}
const FISHING = D.FISHING;

// ---------------- Улучшение инструментов в кузнице (toolRules.js, toolData.js) ----------------
// Бот улучшает кирку, топор и лейку по порядку TOOL_ORDER, как только открыто по уровню и монет хватает
// (не больше TOOL_SHARE от свободных). Лейка поливает область: грядки бота — список без клеток, поэтому
// за одно нажатие считаем столько грядок, сколько в среднем попадает в область (CAN_PER_TAP).
const TOOLS_ON = process.env.TOOLS !== 'off';
const TOOL_ORDER = ['pick', 'axe', 'can'], TOOL_SHARE = 0.5;
const CAN_PER_TAP = { one: 1, cross: 3, square: 5 };

const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);
const avg = ([a, b]) => (a + b) / 2;
const roll = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const SEC = 1000, MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
// Понедельник 9 ноября 2026, 00:00 по Москве
const T0 = Date.UTC(2026, 10, 8, 21, 0);

// ---------------- Профили игроков ----------------
// sessions — [час, минута, длина в минутах] по Москве, каждый день; skip — доля пропущенных заходов,
// jitter — на сколько минут заход сдвигается (бот планирует посадки по обычному расписанию и не знает о сдвигах).
// fish — рыбачит всё свободное время.
const PROFILES = {
  casual: { name: 'Казуальный (2 захода по 8 мин в день)', sessions: [[9, 0, 8], [21, 0, 8]], skip: 0.2, jitter: 60 },
  normal: { name: 'Обычный (4 захода, ~40 мин в день)', sessions: [[8, 30, 10], [13, 0, 10], [18, 30, 12], [22, 0, 10]], skip: 0.15, jitter: 45 },
  active: { name: 'Активный (7 заходов, ~1.7 ч в день)', sessions: [[8, 0, 15], [10, 30, 12], [13, 0, 15], [15, 30, 12], [18, 0, 20], [20, 30, 15], [22, 30, 15]], skip: 0.1, jitter: 30 },
  abuser: { name: 'Абузер рыбалки (как «Обычный», но всё время рыбачит)', sessions: [[8, 30, 10], [13, 0, 10], [18, 30, 12], [22, 0, 10]], skip: 0.15, jitter: 45, fish: true },
};

// Сколько секунд призрачок тратит на действие (полёт + анимация)
const ACT = { harvest: 1.2, plant: 1.0, water: 1.4, fill: 2.5, hit: 1.1, fish: 2.6, pick: 1.2, mow: 0.8, sow: 1.2 };
// Цена энергии в монетах для выбора культуры (столько стоит морковь/молоко за 1 энергию)
const EPRICE = 1.5;

// ---------------- Карта ----------------
const MAP = JSON.parse(fs.readFileSync(new URL('../assets/map.json', import.meta.url), 'utf8'));
function mapObjects() {
  const w = new World(1, MAP), per = Array.from({ length: CHUNKS * CHUNKS }, () => []);
  for (const o of w.objects) {
    if (!o) continue;
    const d = OBJECTS[o.type];
    if (!d || !d.hp) continue;
    per[w.chunkOf(o.gx, o.gy)].push({ type: o.type });
  }
  return per;
}
const ring = (c) => Math.max(Math.abs((c % CHUNKS) - 2), Math.abs(((c / CHUNKS) | 0) - 2));
const neighbors = (c) => {
  const x = c % CHUNKS, y = (c / CHUNKS) | 0, out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < CHUNKS && ny < CHUNKS) out.push(ny * CHUNKS + nx); }
  return out;
};

// =====================================================================================
// 1) ПЕТЛИ: что даёт каждое повторяемое действие и можно ли крутить его без конца
// =====================================================================================
export function scanLoops() {
  const out = [];
  const add = (sev, what, detail) => out.push({ sev, what, detail });
  // самая дешёвая энергия: еда из магазина (монет за 1 энергию) и еда на продажу (сколько монет теряешь, съев её)
  const shopE = Object.entries(SHOP_FOOD).map(([k, f]) => ({ k, c: f.price / f.food }));
  const cheapShop = shopE.reduce((a, b) => (b.c < a.c ? b : a));
  const sellE = Object.values(ITEMS).filter((it) => it.food && it.sell).map((it) => ({ k: it.key, c: it.sell / it.food }));
  const cheapSell = sellE.reduce((a, b) => (b.c < a.c ? b : a));

  // --- рыбалка ---
  const list = Object.values(FISH), tot = list.reduce((s, f) => s + f.chance, 0);
  const per = (k) => list.reduce((s, f) => s + (f.chance / tot) * (f[k] || 0), 0) * D.FISH_CATCH;
  const fE = per('food') / ENERGY.fish, fC = per('sell') / ENERGY.fish, fX = per('xp') / ENERGY.fish;
  const gate = FISHING ? `клёв: ${FISHING.bites} поклёвок, +1 раз в ${FISHING.regen / 60} мин` : 'нет: рыбачить можно без остановки';
  add(fE >= 1 || (!FISHING && fC > cheapShop.c) ? 'КРИТИЧНО' : 'ok', 'Рыбалка',
    `заброс = ${ENERGY.fish} эн. → в среднем ${fE.toFixed(2)} энергии едой, ${fC.toFixed(1)} монет, ${fX.toFixed(2)} опыта. Ограничение: ${gate}. ` +
    (fE >= 1 ? 'Съел рыбу — энергии больше, чем потратил: вечный двигатель (монеты, опыт → уровни → кристаллы). ' : '') +
    (!FISHING && fC > cheapShop.c ? `Даже без еды: 1 энергия на рынке стоит ${cheapShop.c.toFixed(2)} мон. (${ITEMS[cheapShop.k].name}), а рыба приносит ${fC.toFixed(1)} мон. на 1 энергию.` : ''));

  // --- урожай на еду ---
  for (const c of Object.values(CROPS)) {
    if (!c.food) continue;
    const e = 2 * ENERGY.water; // два полива
    if (c.food > e) add('инфо', `Еда с грядки: ${c.name}`, `2 полива = ${e} эн., съесть = ${c.food} эн. (+${c.food - e} за ${Math.round(c.time / 60)} мин роста; с поливалкой +${c.food}). Ограничено временем роста и числом грядок.`);
  }
  // --- кухня: энергия в блюде против энергии в продуктах ---
  const embodied = (id) => { // сколько энергии стоит добыть 1 штуку (грубо): урожай — 2 полива, рыба — забросы, плоды — 1 сбор на 3 шт
    if (CROPS[id]) return 2 * ENERGY.water;
    if (FISH[id]) { const p = (FISH[id].chance / tot) * D.FISH_CATCH; return ENERGY.fish / p; }
    if (FLORA_GOODS[id]) return ENERGY.pick / 3;
    return 0;
  };
  for (const r of Object.values(RECIPES)) {
    const g = CRAFT_GOODS[r.item] || ITEMS[r.item];
    if (!g || !g.food || r.at !== 'kitchen') continue;
    const inE = Object.entries(r.need).reduce((s, [id, n]) => s + n * embodied(id), 0);
    const inC = Object.entries(r.need).reduce((s, [id, n]) => s + n * (ITEMS[id] && ITEMS[id].sell || 0), 0);
    const gain = g.food * r.n - inE;
    add(gain > 0 && FISH[Object.keys(r.need)[0]] && !FISHING ? 'ВАЖНО' : gain > 4 ? 'инфо' : 'ok', `Кухня: ${g.name}`,
      `сырьё ≈ ${inE.toFixed(1)} эн. и ${inC} мон. → ${g.food * r.n} эн. (${gain >= 0 ? '+' : ''}${gain.toFixed(1)} эн. за ${r.time / 60} мин кухни)`);
  }
  // --- рынок: купить и продать ---
  for (const o of SHOP) {
    const it = ITEMS[o.item];
    if (!it || o.cur === 'gems' || !it.sell) continue;
    if (it.sell >= o.price / (o.qty || 1)) add('КРИТИЧНО', `Рынок: ${it.name}`, `купить за ${o.price}, продать за ${it.sell}`);
  }
  // --- купить → сделать → продать ---
  const shopPrice = (id) => { const o = SHOP.find((x) => x.item === id && !x.cur); return o ? o.price / (o.qty || 1) : null; };
  const costOf = (id, depth = 0) => {
    const p = shopPrice(id);
    if (p != null) return p;
    if (depth > 3) return null;
    const r = Object.values(RECIPES).find((x) => x.item === id);
    if (!r) return null;
    let s = 0;
    for (const [k, n] of Object.entries(r.need)) { const c = costOf(k, depth + 1); if (c == null) return null; s += c * n; }
    return s / r.n;
  };
  for (const r of Object.values(RECIPES)) {
    const it = ITEMS[r.item];
    if (!it || !it.sell) continue;
    const c = costOf(r.item);
    if (c == null || r.item in SHOP_FOOD && shopPrice(r.item) === c) continue;
    let cost = 0, time = 0;
    const walk = (id, n) => { const rr = Object.values(RECIPES).find((x) => x.item === id); if (shopPrice(id) != null || !rr) { cost += n * shopPrice(id); return; } time += rr.time * n / rr.n; for (const [k, m] of Object.entries(rr.need)) walk(k, m * n / rr.n); };
    walk(r.item, 1);
    const profit = it.sell - cost;
    if (profit > 0) add('ВАЖНО', `Купить → сделать → продать: ${it.name}`, `сырьё с рынка ${cost.toFixed(0)} мон. → продажа ${it.sell} (+${profit.toFixed(0)} мон. и опыт за ${Math.round(time / 60)} мин зданий; без конца)`);
  }
  // --- колесо ---
  const W = WHEEL.sectors, wt = W.reduce((s, x) => s + x.w, 0);
  const ev = (k) => W.reduce((s, x) => s + (x.w / wt) * (k === 'coins' || k === 'gems' ? x[k] || 0 : (x.items && x.items[k]) || 0), 0);
  const gemCoins = 15; // во что игрок оценивает кристалл (10 дерева или 3 руды за кристалл ~ 15 монет)
  const evC = ev('coins') + ev('gems') * gemCoins + ev('pie') * (ITEMS.pie.sell) + ev('wood') * 1.5 + ev('ore') * 5;
  add('ok', 'Колесо фортуны', `в среднем ${ev('coins').toFixed(1)} мон. + ${ev('gems').toFixed(2)} крист. + ${ev('wood').toFixed(1)} дерева + ${ev('ore').toFixed(2)} руды ≈ ${evC.toFixed(0)} мон. за вращение; ` +
    `за монеты ${WHEEL.coins.join('/')} (в день ${WHEEL.coins.length}), за кристаллы ${WHEEL.gems} — без ограничения, но в минус по кристаллам (${ev('gems').toFixed(2)} назад)`);
  // --- заказы ---
  add('ok', 'Доска заказов', `платит ${ORDERS.pay}× цены рынка + опыт; товары (урожай, рыба, плоды) на рынке не купить — перепродажи нет. ` +
    (!FISHING ? 'Но рыба в заказах — ещё один выход для бесконечной рыбалки.' : ''));
  // --- животные ---
  for (const a of Object.values(ANIMALS)) {
    const prod = ITEMS[a.product].sell * a.n, feedR = Object.values(RECIPES).find((r) => r.item === a.feed);
    const feedC = feedR ? Object.entries(feedR.need).reduce((s, [id, n]) => s + n * (shopPrice(id) ?? ITEMS[id].sell ?? 0), 0) / feedR.n : 0;
    const perH = (prod - feedC) / (a.time[2] / 3600), grow = a.feeds[0] * a.time[0] + a.feeds[1] * a.time[1];
    add('инфо', `Животное: ${a.names[2]}`, `${a.price} мон., растёт ${(grow / 3600).toFixed(1)} ч кормлений; продукт ${prod} мон. за ${a.time[2] / 60} мин, корм ≈ ${feedC.toFixed(1)} мон. → +${perH.toFixed(0)} мон./ч, окупится за ${(a.price / perH).toFixed(1)} ч еды. Сколько животных можно держать — не ограничено.`);
  }
  // --- опыт → кристаллы ---
  add('инфо', 'Уровень', `каждый уровень даёт 1 кристалл и 10×уровень монет: любой бесконечный опыт = бесконечные кристаллы`);
  return { out, cheapShop, cheapSell };
}

// =====================================================================================
// 2–3) СИМУЛЯЦИЯ ИГРОКА
// =====================================================================================
class Sim {
  constructor(profile, seed) {
    this.P = profile; this.rng = mulberry32(seed * 7919 + 17); this.seed = seed;
    this.now = T0;
    this.st = { coins: D.START.coins, gems: D.START.gems, xp: 0, level: 1, energy: D.START.energy, energyAt: T0, can: 2, house: 1, well: 0, items: {}, stats: { cleared: 0, harvested: 0 } };
    this.beds = [{ crop: 'carrot', p: CROPS.carrot.time, w: 2 }, { crop: null, p: 0, w: 0 }];
    this.spr = { sprinkler_drip: 0, sprinkler_spin: 0, sprinkler_rain: 0 };
    this.open = new Set([START_CHUNK]);
    this.objs = mapObjects();
    this.stumps = Array(CHUNKS * CHUNKS).fill(0); // пни (после дерева) по участкам
    this.wild = { grass: 0, bushes: [], trees: [], stumps: 0, at: T0, treeAt: T0 };
    this.own = [];      // свои деревья (не плодовые): { sp, born }
    this.orchard = [];  // плодовые: { sp, born, fruitAt }
    this.animals = [];  // { sp, stage, f, t, r }
    this.decor = 0;
    this.played = 0;    // мс в игре
    this.mile = {};     // веха → { day, h }
    this.block = {};    // «чего не хватало» → минут в игре
    this.blockCal = {}; // то же, календарные часы (между заходами)
    this.gemRescue = { ore: 0, wood: 0, gems: 0 };
    this.spent = { energy: 0, eaten: 0 };
    this.toolSpent = { coins: 0 }; this.oreGot = 0;
    this.lvIncome = [0, 0];
    this.oreAt = {};
    this.gemsIn = { levels: 0, quests: 0, ach: 0, gifts: 0 };
    this.income = { crops: 0, orders: 0, animals: 0, fish: 0, craft: 0, quests: 0, levels: 0, ach: 0, gifts: 0, other: 0 };
    this.log = [];
    this.trace = [];
    this.sessions = this.makeSessions();
    this.si = 0;
    this.mark('start');
  }

  // ---------- время ----------
  makeSessions() {
    const out = [], plan = [], r = mulberry32(this.seed * 31 + 5);
    for (let d = 0; d < OPT.days + 2; d++) for (const [h, m, len] of this.P.sessions) {
      const s = T0 + d * DAY + (h * 60 + m) * MIN;
      plan.push([s, s + len * MIN]);
      if (d > 0 && r() < (this.P.skip || 0)) continue;
      const j = Math.round((r() * 2 - 1) * (this.P.jitter || 0)) * MIN;
      out.push([s + j, s + j + len * MIN]);
    }
    this.plan = plan.sort((a, b) => a[0] - b[0]);
    out.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < out.length; i++) if (out[i][0] < out[i - 1][1]) { const len = out[i][1] - out[i][0]; out[i][0] = out[i - 1][1]; out[i][1] = out[i][0] + len; }
    return out;
  }
  // по обычному расписанию (так игрок и планирует): в игре ли в момент t, когда следующий заход
  sessionAt(t) {
    for (let i = 0; i < this.plan.length; i++) { const [s, e] = this.plan[i]; if (t < s) return -1; if (t < e) return i; }
    return -1;
  }
  nextStart(t) { for (let i = 0; i < this.plan.length; i++) if (this.plan[i][0] >= t) return this.plan[i][0]; return t + DAY; }
  day() { return (this.now - T0) / DAY; }
  mark(k) { if (!this.mile[k]) this.mile[k] = { day: +this.day().toFixed(2), h: +(this.played / HOUR).toFixed(2), level: this.st.level }; }
  note(s) { if (OPT.log) this.log.push(`д${this.day().toFixed(1)} ур${this.st.level} ${s}`); }

  earned() { const I = this.income; return I.crops + I.orders + I.animals + I.craft + I.fish + I.other; }
  ctx() { return { now: this.now, tz: QUEST_TZ, rng: this.rng, stats: { beds: this.beds.length, bedsAll: this.beds.length + Inv.count(this.st, D.BED_ITEM) }, fruit: [...new Set(this.orchard.map((o) => FLORA[o.sp].fruit))] }; }
  get maxE() { return HOUSE[this.st.house].energy; }
  get canMax() { return Tool.canMax(this.st); }

  // ---------- опыт, события, награды ----------
  addXp(n) {
    const st = this.st;
    st.xp += n;
    while (st.xp >= SIM_FN.xpToNext(st.level)) {
      st.xp -= SIM_FN.xpToNext(st.level); st.level++; st.gems += 1; this.gemsIn.levels++; st.coins += st.level * 10; this.income.levels += st.level * 10;
      this.mark('level' + st.level); this.note(`уровень ${st.level}`);
      this.lvIncome.push(this.earned());
    }
  }
  ev(name, key, n = 1) {
    Q.onEvent(this.st, name, key, n, this.ctx());
  }
  claimAll() {
    const ctx = this.ctx();
    for (let k = 0; k < 10; k++) {
      const v = Q.views(this.st, ctx).find((x) => x.done && !x.claimed);
      if (!v) break;
      const r = Q.claim(this.st, v.id, ctx);
      if (!r) break;
      this.gemsIn.quests += r.reward.gems || 0;
      this.income.quests += r.reward.coins || 0;
      if (r.reward.xp) this.addXp(r.reward.xp);
      if (r.reward.items && r.reward.items[D.BED_ITEM]) this.placeBeds();
      this.note(`задание «${v.title || v.task}»`);
    }
    const g0 = this.st.gems;
    const a = Ach.claimAll(this.st, { chunks: this.open.size, bedsAll: ctx.stats.bedsAll });
    if (a) { this.income.ach += a.reward.coins || 0; this.gemsIn.ach += this.st.gems - g0; }
  }
  placeBeds() {
    while (Inv.takeItem(this.st, D.BED_ITEM, 1)) this.beds.push({ crop: null, p: 0, w: 0 });
  }
  // все открытые цели заданий: [{ g, v }]
  goals() {
    const out = [];
    for (const v of Q.views(this.st, this.ctx())) if (!v.claimed && !v.done) for (const g of v.goals) if (g.p < g.n) out.push({ g, v });
    return out;
  }

  // ---------- энергия ----------
  tickEnergy() {
    const st = this.st, period = D.ENERGY_REGEN_SEC * SEC;
    if (st.energy >= this.maxE) { st.energyAt = this.now; return; }
    const gain = Math.floor((this.now - st.energyAt) / period);
    if (gain > 0) { st.energy = Math.min(this.maxE, st.energy + gain); st.energyAt += gain * period; if (st.energy >= this.maxE) st.energyAt = this.now; }
  }
  spend(n) {
    const st = this.st;
    if (st.energy < n) return false;
    if (st.energy >= this.maxE) st.energyAt = this.now;
    st.energy -= n; this.spent.energy += n;
    return true;
  }
  // съесть что-нибудь, чтобы было need энергии (сначала то, что дешевле по монетам за энергию)
  eatFor(need, keep = {}) {
    const st = this.st;
    let guard = 50;
    while (st.energy < need && st.energy < this.maxE && guard--) {
      let best = null, bc = Infinity;
      for (const [id, n] of Object.entries(st.items)) {
        const it = ITEMS[id];
        if (!it || !it.food || n <= (keep[id] || 0)) continue;
        const c = (it.sell || 0) / it.food;
        if (c < bc) { bc = c; best = id; }
      }
      if (!best || bc > 3) return false;
      Inv.eatItem(st, best, this.maxE); this.spent.eaten++;
    }
    return st.energy >= need;
  }

  // ---------- грядки ----------
  coveredCount() {
    let cells = 0;
    for (const [k, n] of Object.entries(this.spr)) cells += n * Math.floor(({ cross: 4, square: 8 }[SPRINKLERS[k].area] === 8 ? (2 * SPRINKLERS[k].r + 1) ** 2 - 1 : 4 * SPRINKLERS[k].r) * 0.85);
    return Math.min(this.beds.length, cells);
  }
  growAll(dtSec, quiet) {
    const cov = this.coveredCount();
    let n = 0;
    this.beds.forEach((b, i) => { n += Beds.growBed(b, dtSec, i < cov); });
    if (n && !quiet) this.ev('water', null, n);
  }
  // когда созреет культура c, посаженная сейчас (с учётом заходов: второй полив и сбор — только в игре)
  harvestAt(c, t, covered) {
    const tot = c.time * SEC;
    let ready;
    if (covered) ready = t + tot;
    else {
      const t23 = t + tot * 2 / 3;
      const tw = this.sessionAt(t23) >= 0 ? t23 : this.nextStart(t23);
      ready = tw + tot / 3;
    }
    return this.sessionAt(ready) >= 0 ? ready : this.nextStart(ready);
  }
  // сколько каждой культуры нужно для заданий, заказов, кормов и кухни сверх того, что есть и растёт
  cropDemand() {
    const need = {};
    const add = (k, n) => { if (CROPS[k]) need[k] = (need[k] || 0) + n; };
    for (const { g } of this.goals()) {
      if ((g.ev === 'harvest' || g.ev === 'plant') && g.key && CROPS[g.key]) add(g.key, g.n - g.p);
    }
    const O = this.st.orders;
    if (O) for (const s of O.slots) if (s && s.items) for (const [id, n] of Object.entries(s.items)) add(id, n);
    // корма и кухня
    for (const [id, n] of Object.entries(this.feedTargets())) {
      const r = RECIPES[id];
      const lack = Math.max(0, n - Inv.count(this.st, id));
      if (lack) for (const [k, m] of Object.entries(r.need)) add(k, Math.ceil(lack / r.n) * m);
    }
    for (const [k, m] of Object.entries(this.kitchenNeed())) add(k, m);
    for (const k of Object.keys(need)) {
      let have = Inv.count(this.st, k);
      for (const b of this.beds) if (b.crop === k) have++;
      need[k] = Math.max(0, need[k] - have);
      if (!need[k]) delete need[k];
    }
    return need;
  }
  chooseCrop(t, covered) {
    const st = this.st, dem = this.cropDemand();
    // нужное для заданий/заказов — в первую очередь (самое долгое из нужного — раньше)
    let best = null, bs = -Infinity;
    for (const [k] of Object.entries(dem).sort((a, b) => CROPS[b[0]].time - CROPS[a[0]].time)) {
      const c = CROPS[k];
      if (c.level <= st.level && (Inv.count(st, D.seedId(k)) || st.coins >= c.seed)) return k;
    }
    for (const c of Object.values(CROPS)) {
      if (c.level > st.level) continue;
      const seeds = Inv.count(st, D.seedId(c.key));
      if (!seeds && st.coins < c.seed) continue;
      const h = this.harvestAt(c, t, covered);
      const v = c.sell - (seeds ? 0 : c.seed) * 0.75 - (covered ? 0 : 2 * EPRICE); // 25% семян вернутся
      const s = v / Math.max(1, (h - t) / HOUR);
      if (s > bs) { bs = s; best = c.key; }
    }
    return best;
  }

  // ---------- продажа ----------
  reserve() {
    const keep = {};
    const add = (id, n) => { keep[id] = (keep[id] || 0) + n; };
    const O = this.st.orders;
    if (O) for (const s of O.slots) if (s && s.items) for (const [id, n] of Object.entries(s.items)) add(id, n);
    for (const [id, n] of Object.entries(this.feedTargets())) { const r = RECIPES[id]; for (const [k, m] of Object.entries(r.need)) add(k, Math.ceil(n / r.n) * m); }
    for (const [k, m] of Object.entries(this.kitchenNeed())) add(k, m);
    for (const { g } of this.goals()) {
      if (g.ev === 'craft' && RECIPES[g.key]) for (const [k, m] of Object.entries(RECIPES[g.key].need)) add(k, m * (g.n - g.p));
      if (g.ev === 'sell' && g.group === 'fish') for (const f of Object.keys(FISH)) add(f, 0);
    }
    // немного еды про запас (самой дешёвой по монетам за энергию)
    add('fish_carp', 6); add('carrot', 4);
    return keep;
  }
  sellSurplus() {
    const st = this.st, keep = this.reserve();
    const fishQuest = this.goals().some(({ g }) => g.ev === 'sell' && g.group === 'fish');
    for (const [id, n] of Object.entries({ ...st.items })) {
      const it = ITEMS[id];
      if (!it || !it.sell || it.floraOf || it.seedOf) continue;
      if (CRAFT_GOODS[id] && !CRAFT_GOODS[id].sell) continue;
      let k = n - (keep[id] || 0);
      if (fishQuest && FISH[id]) k = n;
      if (k <= 0) continue;
      const r = Inv.sellItem(st, id, k);
      if (!r) continue;
      const src = CROPS[id] ? 'crops' : FISH[id] ? 'fish' : ANIMAL_GOODS[id] || id === 'milk' ? 'animals' : CRAFT_GOODS[id] ? 'craft' : 'other';
      this.income[src] += r.coins;
      this.ev('sell', id, r.n); this.ev('earn', id, r.coins);
    }
  }
  deliverOrders() {
    const st = this.st, ctx = this.ctx();
    Ord.refresh(st, ctx);
    if (!Ord.isOpen(st)) return;
    for (let i = 0; i < ORDERS.slots; i++) {
      const s = st.orders.slots[i];
      if (!s || !s.items) continue;
      if (!Object.entries(s.items).every(([id, n]) => Inv.count(st, id) >= n)) {
        // нечем сдать то, что не растёт на грядке (рыба/плоды без деревьев) — откажемся
        if (Object.keys(s.items).some((id) => !CROPS[id] && !this.canGet(id))) Ord.skip(st, i, ctx);
        continue;
      }
      const r = Ord.deliver(st, i, ctx);
      if (!r || r.lack) continue;
      for (const [id, k] of Object.entries(r.items)) this.ev('sell', id, k);
      this.ev('earn', 'order', r.coins); this.ev('order', null, 1);
      this.income.orders += r.coins;
      this.addXp(r.xp);
    }
  }
  canGet(id) {
    if (FISH[id]) return this.P.fish || this.goals().some(({ g }) => g.ev === 'fish');
    if (FLORA_GOODS[id]) return this.orchard.some((o) => FLORA[o.sp].fruit === id);
    return false;
  }

  // ---------- покупки ----------
  buy(item, n = 1) {
    const o = SHOP.find((x) => x.item === item);
    if (!o) return false;
    const r = Inv.buyItem(this.st, o, n);
    if (!r || r.poor || r.locked) return false;
    this.ev('buy', item, r.n);
    return true;
  }
  bedsAll() { return this.beds.length + Inv.count(this.st, D.BED_ITEM); }
  buyBed() {
    const r = Beds.buyBed(this.st, this.bedsAll());
    if (!r || r.limit != null || r.poor || r.why) return false;
    this.ev('buy', D.BED_ITEM, 1); this.placeBeds();
    return true;
  }
  sprinklerOffer() {
    const st = this.st;
    let best = null;
    for (const [k, s] of Object.entries(SPRINKLERS)) {
      if (s.level > st.level) continue;
      const cells = s.area === 'square' ? (2 * s.r + 1) ** 2 - 1 : 4 * s.r;
      const per = s.price / cells;
      if (!best || per < best.per) best = { k, per, price: s.price };
    }
    return best;
  }

  // Следующая большая цель: улучшить дом или открыть участок. → { kind, cost, why }
  nextGoal() {
    const st = this.st, H = HOUSE[st.house];
    if (st.houseUp) return { kind: 'wait-house', cost: {}, why: 'дом строится' };
    const canExp = this.open.size < H.chunks && this.frontier().length;
    const needH = D.houseNeedChunks(st.house);
    if (HOUSE[st.house + 1] && this.open.size >= needH && (!canExp || this.open.size >= H.chunks)) return { kind: 'house', cost: HOUSE[st.house + 1].cost };
    if (canExp) return { kind: 'expand', cost: SIM_FN.expansionCost(this.open.size) };
    if (HOUSE[st.house + 1]) return { kind: 'house', cost: HOUSE[st.house + 1].cost };
    return { kind: 'done', cost: {} };
  }
  lack(cost) {
    const st = this.st, out = {};
    for (const [k, v] of Object.entries(cost)) {
      const have = k === 'coins' || k === 'gems' ? st[k] : Inv.count(st, k);
      if (have < v) out[k] = v - have;
    }
    return out;
  }
  frontier() { return [...new Set([...this.open].flatMap(neighbors))].filter((c) => !this.open.has(c)); }
  pickChunk() {
    const need = this.lack(HOUSE[this.st.house + 1] ? HOUSE[this.st.house + 1].cost : {});
    const score = (c) => {
      let s = -ring(c) * 1000;
      for (const o of this.objs[c]) { const d = OBJECTS[o.type]; s += (need.ore ? (d.oreChance || 0) * avg(d.ore || [0, 0]) * 30 : 0) + (d.drops.stone ? avg(d.drops.stone) : 0) + (d.drops.wood ? avg(d.drops.wood) : 0); }
      return s;
    };
    return this.frontier().sort((a, b) => score(b) - score(a))[0];
  }

  // траты в начале каждой минуты: цели, задания, вложения
  spendStep() {
    const st = this.st;
    // колодец
    if (!st.well && this.lackNone(D.WELL_COST)) { this.pay(D.WELL_COST); st.well = 1; this.addXp(5); this.note('колодец'); }
    // дом
    const g = this.nextGoal();
    if (g.kind === 'house' && !this.oreAt[st.house + 1] && this.lackNone(Object.fromEntries(Object.entries(g.cost).filter(([k]) => k !== 'ore')))) {
      // первый раз, когда на дом хватает всего, кроме, может быть, руды: сколько руды есть сверх цены
      this.oreAt[st.house + 1] = { have: Inv.count(st, 'ore'), need: g.cost.ore || 0, mapLeft: Math.round(this.mapLeft().ore) };
    }
    if (g.kind === 'house' && !House.houseUpBlock(st, this.open.size)) {
      House.startHouseUp(st, this.open.size, this.now); this.note(`дом → ${st.houseUp.to}`); this.mark('houseStart' + st.houseUp.to);
    }
    // участок
    if (this.open.size < HOUSE[st.house].chunks) {
      const cost = SIM_FN.expansionCost(this.open.size), c = this.frontier().length ? this.pickChunk() : null;
      if (c != null && this.lackNone(cost) && (g.kind !== 'house' || this.open.size < HOUSE[st.house].chunks)) {
        this.pay(cost); this.open.add(c); this.ev('expand'); this.addXp(10);
        this.mark('chunk' + this.open.size); this.note(`участок ${this.open.size} (${JSON.stringify(cost)})`);
      }
    }
    this.questBuys();
    // стройка зданий по чертежам
    for (const k of Object.keys(BUILDINGS)) if (Inv.count(st, bpId(k)) && !Build.buildBlock(st, k)) { Build.startBuild(st, k, this.now); this.ev('place', k); this.note(`стройка ${k}`); }
    // грядки и поливалки — пока это не съедает деньги на цель
    const free = () => st.coins - (g.kind === 'expand' || g.kind === 'house' ? (g.cost.coins || 0) * 0.5 : 0);
    for (let k = 0; k < 5; k++) {
      const o = Beds.bedOffer(st, this.bedsAll());
      if (!o.can || o.price > free() * 0.6) break;
      if (!this.buyBed()) break;
      this.mark('beds' + this.beds.length);
    }
    for (let k = 0; k < 3; k++) {
      const s = this.sprinklerOffer();
      if (!s || this.coveredCount() >= this.beds.length || s.price > free() * 0.5) break;
      if (!this.buy(s.k)) break;
      this.spr[s.k]++; this.ev('place', s.k);
    }
    this.toolBuy(free);
    // выход из тупика за кристаллы: дом/участок стоит только из-за руды или дерева, а на открытой земле их нет
    const L = this.lack(g.cost);
    const onlyMat = Object.keys(L).length && Object.keys(L).every((k) => k === 'ore' || k === 'wood');
    if ((g.kind === 'house' || g.kind === 'expand') && onlyMat) {
      const left = this.mapLeft();
      for (const [k, n] of Object.entries(L)) {
        if (left[k] >= n * 0.5 || (k === 'wood' && this.wild.trees.length > 2)) continue;
        const o = SHOP.find((x) => x.item === k && x.cur === 'gems');
        const packs = Math.ceil(n / o.qty);
        if (st.gems >= packs * o.price && this.waited(k) > 12 * HOUR) {
          st.gems -= packs * o.price; Inv.addItem(st, k, packs * o.qty);
          this.gemRescue[k] += packs * o.qty; this.gemRescue.gems += packs * o.price; this.note(`кристаллы → ${k} ${packs * o.qty}`);
        }
      }
    }
  }
  waited(k) { return (this.blockCal[k] || 0); }
  // инструмент доковался
  toolTick() {
    const r = Tool.upTick(this.st, this.now);
    if (r) { this.ev('tool', r.t + r.to); this.mark('tool_' + r.t + r.to); this.note(`инструмент ${r.t} → ${r.to}`); }
  }
  // следующее улучшение, открытое по уровню (порядок — TOOL_ORDER, сначала самые низкие уровни). → { t, next } или null
  nextTool() {
    const st = this.st;
    if (!TOOLS_ON || st.toolUp || !Build.isBuilt(st, TOOL_AT, this.now)) return null;
    let best = null;
    for (const t of TOOL_ORDER) {
      const next = Tool.nextUp(st, t);
      if (!next || next.level > st.level) continue;
      if (!best || Tool.toolLevel(st, t) < Tool.toolLevel(st, best.t)) best = { t, next };
    }
    return best;
  }
  // отдать инструмент в кузницу: всё есть и монет не больше TOOL_SHARE от свободных
  toolBuy(free) {
    const n = this.nextTool();
    if (!n || Tool.upBlock(this.st, n.t, this.now) || (n.next.cost.coins || 0) > free() * TOOL_SHARE) return;
    const r = Tool.startUp(this.st, n.t, this.now);
    if (!r) return;
    this.toolSpent.coins += n.next.cost.coins || 0;
    this.note(`кузница: ${n.t} → ${r.to}`);
  }
  lackNone(cost) { return !Object.keys(this.lack(cost)).length; }
  pay(cost) { for (const [k, v] of Object.entries(cost)) { if (k === 'coins' || k === 'gems') this.st[k] -= v; else Inv.takeItem(this.st, k, v); } }
  mapLeft() {
    const r = { wood: 0, stone: 0, ore: 0 };
    for (const c of this.open) {
      for (const o of this.objs[c]) { const d = OBJECTS[o.type]; for (const [k, v] of Object.entries(d.drops || {})) r[k] += avg(v); if (d.oreChance) r.ore += d.oreChance * avg(d.ore); }
      r.wood += this.stumps[c];
    }
    return r;
  }

  // покупки для заданий: чертежи, поливалка, декор, саженцы, животные, семена
  questBuys() {
    const st = this.st;
    for (const { g } of this.goals()) {
      if (g.ev === 'buy' && g.key && g.key.startsWith('bp_')) { const k = g.key.slice(3); if (!Build.blueprintBlock(st, k) && this.buildAffordable(k)) { const o = SHOP.find((x) => x.item === g.key); Build.buyBlueprint(st, k, o) && this.ev('buy', g.key, 1); } }
      if (g.ev === 'build' && g.key && !Build.owned(st, g.key) && !Inv.count(st, bpId(g.key)) && !Build.blueprintBlock(st, g.key) && this.buildAffordable(g.key)) {
        const o = SHOP.find((x) => x.item === bpId(g.key)); Build.buyBlueprint(st, g.key, o) && this.ev('buy', bpId(g.key), 1);
      }
      if (g.ev === 'buy' && g.group === 'sprinkler' || g.ev === 'place' && g.group === 'sprinkler') {
        const s = this.sprinklerOffer(); if (s && st.coins >= s.price && this.buy(s.k)) { this.spr[s.k]++; this.ev('place', s.k); }
      }
      if ((g.ev === 'buy' || g.ev === 'place') && g.group === 'decor') {
        const o = SHOP.filter((x) => (D.DECOR[x.item] || D.FENCES[x.item]) && (!x.level || x.level <= st.level)).sort((a, b) => a.price - b.price)[0];
        if (o && st.coins >= o.price * 2) { for (let i = 0; i < g.n - g.p; i++) if (this.buy(o.item)) { this.ev('place', o.item); this.decor++; } }
      }
      if (g.ev === 'buy' && g.group === 'seed') { const n = g.n - g.p; if (st.coins >= n * 2 + 20) this.buy(D.seedId('carrot'), n); }
      if ((g.ev === 'buy' || g.ev === 'sow') && g.group === 'orchard') {
        const o = SHOP.filter((x) => x.tab === 'trees' && (!x.level || x.level <= st.level)).sort((a, b) => a.price - b.price)[0];
        if (o && !Inv.count(st, o.item) && st.coins >= o.price * 2 && this.buy(o.item)) this.sowOrchard(o.item.slice(4));
      }
      if (g.ev === 'sow' && !g.group) { const sp = Object.keys(st.items).find((id) => id.startsWith('sap_')); if (sp) this.sowOwn(sp.slice(4)); }
      if (g.ev === 'pick' && g.key) {
        const sp = Object.keys(FLORA).find((k) => FLORA[k].fruit === g.key && FLORA[k].pick);
        const o = SHOP.find((x) => x.item === D.floraSeedId(sp));
        if (sp && o && this.orchard.filter((t) => t.sp === sp).length < 2 && (!o.level || o.level <= st.level) && st.coins >= o.price * 2 && this.buy(o.item)) this.sowOrchard(sp);
      }
      // животные: детёныш нужного вида
      if ((g.ev === 'buy' || g.ev === 'place') && g.key && g.key.startsWith('animal_') && !this.animals.some((a) => a.sp === g.key.split('_')[1] && a.stage === 0)) this.buyAnimal(g.key.split('_')[1]);
      if ((g.ev === 'animal' || g.ev === 'feed') && g.key) {
        const sp = g.ev === 'feed' ? g.key : Object.keys(ANIMALS).find((k) => ANIMALS[k].product === g.key);
        if (sp && !this.animals.some((a) => a.sp === sp)) this.buyAnimal(sp);
      }
    }
  }
  buildAffordable(k) {
    const b = BUILDINGS[k], st = this.st;
    return st.coins >= b.blueprint && st.level >= b.level;
  }
  buyAnimal(sp) {
    const a = ANIMALS[sp];
    if (!a || a.level > this.st.level || this.st.coins < a.price * 1.5) return false;
    if (!this.buy(animalType(sp, 0))) return false;
    Inv.takeItem(this.st, animalType(sp, 0), 1);
    this.ev('place', animalType(sp, 0));
    this.animals.push({ sp, stage: 0, f: 0, t: 0, r: 0 });
    this.note(`животное ${sp}`);
    return true;
  }
  sowOrchard(sp) {
    if (!Inv.takeItem(this.st, D.floraSeedId(sp), 1)) return;
    this.orchard.push({ sp, born: this.now, fruitAt: this.now + FLORA[sp].grow * SEC });
    this.ev('sow', sp); this.addXp(1);
  }
  sowOwn(sp) {
    if (!Inv.takeItem(this.st, D.floraSeedId(sp), 1)) return;
    this.own.push({ sp, born: this.now });
    this.ev('sow', sp); this.addXp(1);
  }

  // ---------- здания и крафт ----------
  feedTargets() {
    const out = {};
    for (const a of this.animals) { const r = Object.values(RECIPES).find((x) => x.item === ANIMALS[a.sp].feed); if (r) out[r.key] = (out[r.key] || 0) + 3; }
    return out;
  }
  kitchenNeed() {
    const out = {};
    for (const { g } of this.goals()) if (g.ev === 'craft' && RECIPES[g.key] && RECIPES[g.key].at === 'kitchen') for (const [k, m] of Object.entries(RECIPES[g.key].need)) out[k] = (out[k] || 0) + m;
    return out;
  }
  // что нужно сделать в зданиях: задания, материалы для чертежей в рюкзаке/ближайших зданий
  craftStep() {
    const st = this.st, now = this.now;
    for (const t of Build.buildTick(st, now)) { this.ev('build', t.k); this.addXp(t.xp); this.mark('built_' + t.k); }
    for (const k of Object.keys(BUILDINGS)) {
      const r = Build.collect(st, k, now);
      if (r) { for (const { id, n } of r.items) this.ev('craft', id, n); this.addXp(r.xp); }
    }
    const want = {}; // id рецепта → сколько штук товара нужно
    const add = (id, n) => { if (n > 0) want[id] = (want[id] || 0) + n; };
    for (const { g } of this.goals()) if (g.ev === 'craft' && RECIPES[g.key]) add(g.key, g.n - g.p);
    for (const [id, n] of Object.entries(this.feedTargets())) add(id, n - Inv.count(st, id));
    // материалы для зданий, которые скоро понадобятся (по заданиям «Мастерские»)
    for (const { g } of this.goals()) if (g.ev === 'build' && BUILDINGS[g.key]) for (const [id, n] of Object.entries(BUILDINGS[g.key].cost)) if (RECIPES[id]) add(id, n - Inv.count(st, id));
    // материалы на следующее улучшение инструмента
    const nt = this.nextTool();
    if (nt) for (const [id, n] of Object.entries(nt.next.cost)) if (RECIPES[id]) add(id, n - Inv.count(st, id));
    // гвозди → слитки, доски для ящиков не делаем
    if (want.nails) add('iron_ingot', Math.ceil(want.nails / RECIPES.nails.n) - Inv.count(st, 'iron_ingot'));
    for (const [id, n] of Object.entries(want)) {
      const r = RECIPES[id];
      if (!r || !Build.isBuilt(st, r.at, now)) continue;
      for (let i = 0; i < Math.ceil(n / r.n); i++) if (!Build.craftBlock(st, r.at, id, now)) Build.craft(st, r.at, id, now); else break;
    }
    // кухня без дела — самое выгодное блюдо из того, что лежит
    if (Build.isBuilt(st, 'kitchen', now) && Build.queueView(st, 'kitchen', now).free > 1) {
      let best = null, bm = 0;
      const keep = this.reserve();
      for (const r of Object.values(RECIPES)) {
        if (r.at !== 'kitchen' || r.level > st.level) continue;
        const g = ITEMS[r.item]; if (!g || !g.sell) continue;
        if (!Object.entries(r.need).every(([k, m]) => Inv.count(st, k) - (keep[k] || 0) >= m)) continue;
        const m = g.sell * r.n - Object.entries(r.need).reduce((s, [k, n]) => s + n * (ITEMS[k].sell || 0), 0);
        if (m > bm) { bm = m; best = r.key; }
      }
      if (best) Build.craft(st, 'kitchen', best, now);
    }
  }

  // ---------- животные ----------
  animalStep() {
    const st = this.st, now = this.now;
    for (const a of this.animals) {
      const A = ANIMALS[a.sp];
      if (a.t && a.t <= now) {
        a.t = 0;
        if (a.stage >= 2) a.r = 1;
        else if (++a.f >= A.feeds[a.stage]) { a.f = 0; a.stage++; this.ev('grow', a.sp); if (a.stage === 2) this.ev('adult', a.sp); this.addXp(GROW_XP[a.stage] || 0); }
      }
      if (a.r) { const got = Inv.addItem(st, A.product, A.n); if (got) { a.r = 0; this.ev('animal', A.product, got); this.addXp(A.xp); } }
      if (!a.t && !a.r && Inv.takeItem(st, A.feed, 1)) { a.t = now + A.time[a.stage] * SEC; this.ev('feed', a.sp); this.addXp(FEED_XP); }
    }
  }

  // ---------- рыбалка ----------
  fishOnce() {
    const st = this.st;
    if (!Fish.bitesView(st, this.now).n) return false; // клёв кончился
    if (!this.spend(ENERGY.fish)) return false;
    const r = Fish.cast(st, { now: this.now, rng: this.rng });
    if (r.fish) { Inv.addItem(st, r.fish, 1); this.ev('fish', r.fish); this.addXp(FISH[r.fish].xp); }
    return true;
  }

  // ---------- расчистка ----------
  // ударить по одному объекту целиком (если хватает энергии). → секунд потрачено или 0
  clearOne(need) {
    const st = this.st;
    // цели заданий: срубить дерево, выкорчевать пень, разбить камень/валун
    const qg = this.goals().map(({ g }) => g);
    const wantChop = qg.some((g) => g.ev === 'chop'), wantStump = qg.some((g) => g.ev === 'stump'), wantMine = qg.some((g) => g.ev === 'mine' && !g.key), wantBoulder = qg.some((g) => g.ev === 'mine' && g.key === 'boulder');
    let best = null, bs = -Infinity;
    const consider = (src, c, o, hp, gain) => {
      hp = Tool.hitsFor(st, o.type, hp); // топор и кирка из кузницы: меньше ударов
      if (hp > st.energy) return;
      let s = gain / hp;
      if (wantChop && OBJECTS[o.type] && OBJECTS[o.type].stump) s += 5;
      if (wantStump && o.type === 'stump') s += 5;
      if (wantMine && (o.type === 'rock' || o.type === 'boulder')) s += 5;
      if (wantBoulder && o.type === 'boulder') s += 8;
      if (s > bs) { bs = s; best = { src, c, o, hp }; }
    };
    const w = (k, v) => v * (1 + (need[k] ? 2 : 0));
    for (const c of this.open) {
      if (this.stumps[c]) consider('stump', c, { type: 'stump' }, OBJECTS.stump.hp, w('wood', 1) + 1);
      for (const o of this.objs[c]) {
        const d = OBJECTS[o.type];
        let g = (d.xp || 1) * 0.5;
        for (const [k, v] of Object.entries(d.drops || {})) g += w(k, avg(v));
        if (d.oreChance) g += w('ore', d.oreChance * avg(d.ore)) * 4;
        consider('obj', c, o, d.hp, g);
      }
    }
    for (const t of this.wild.trees) if (this.now - t.born >= FLORA[t.sp].grow * SEC) consider('wildtree', -1, { type: t.sp, ref: t }, FLORA[t.sp].hp, w('wood', avg(FLORA[t.sp].wood)) + 1);
    if (this.wild.stumps) consider('wildstump', -1, { type: 'stump' }, OBJECTS.stump.hp, w('wood', 1) + 1);
    for (const b of this.wild.bushes) if (this.now - b >= 3600 * SEC) { consider('wildbush', -1, { type: 'rose', ref: b }, 2, w('wood', 1)); break; }
    for (const t of this.own) if (this.now - t.born >= FLORA[t.sp].grow * SEC && need.wood) consider('own', -1, { type: t.sp, ref: t }, FLORA[t.sp].hp, w('wood', avg(FLORA[t.sp].wood)));
    if (!best) return 0;
    const { src, c, o, hp } = best;
    this.spend(hp);
    this.destroy(src, c, o);
    return hp * ACT.hit + 0.5;
  }
  destroy(src, c, o) {
    const st = this.st, rng = this.rng, d = OBJECTS[o.type];
    const give = (id, n) => Inv.addItem(st, id, n);
    if (src === 'stump' || src === 'wildstump') {
      if (src === 'stump') this.stumps[c]--; else this.wild.stumps--;
      give('wood', 1); this.addXp(OBJECTS.stump.xp); this.ev('stump', 'stump'); return;
    }
    if (d.flora) {
      const f = FLORA[d.flora];
      give('wood', roll(rng, f.wood));
      if (!f.pick) give(f.fruit, roll(rng, f.n));
      if (rng() < f.seedChop) give(D.floraSeedId(f.key), 1);
      this.addXp(d.xp || 1);
      this.ev(d.stump ? 'chop' : 'clear', o.type);
      // мастерский топор: пня не остаётся, то, что дал бы пень, — сразу
      const root = d.stump && (src === 'obj' || src === 'wildtree') && Tool.noStump(st);
      if (root) { const r = Tool.rootOut(st, rng); this.addXp(r.xp); this.ev('stump', 'stump'); }
      if (src === 'obj') { this.objs[c].splice(this.objs[c].indexOf(o), 1); if (d.stump && !root) this.stumps[c]++; }
      if (src === 'wildtree') { this.wild.trees.splice(this.wild.trees.indexOf(o.ref), 1); if (!root) this.wild.stumps++; }
      if (src === 'wildbush') this.wild.bushes.splice(this.wild.bushes.indexOf(o.ref), 1);
      if (src === 'own') this.own.splice(this.own.indexOf(o.ref), 1);
      return;
    }
    for (const [k, r] of Object.entries(d.drops || {})) give(k, roll(rng, r));
    if (d.oreChance && rng() < Tool.oreChance(st, o.type)) { const n = give('ore', roll(rng, Tool.oreRange(st, o.type))); this.oreGot += n || 0; }
    this.addXp(d.xp || 1);
    this.ev(d.action === 'mine' ? 'mine' : 'clear', o.type);
    this.objs[c].splice(this.objs[c].indexOf(o), 1);
  }

  // ---------- дикая поросль ----------
  wildStep() {
    const W = this.wild, rng = this.rng;
    const chunks = this.open.size;
    while (W.at + D.WILD.every * SEC <= this.now) {
      W.at += D.WILD.every * SEC;
      if (rng() >= D.WILD.chance) continue;
      const capG = Math.min(D.WILD.grass.max, Math.ceil(D.WILD.grass.perChunk * chunks)), capB = Math.min(D.WILD.bush.max, Math.ceil(D.WILD.bush.perChunk * chunks));
      const gs = [W.grass < capG && 'grass', W.bushes.length < capB && 'bush'].filter(Boolean);
      if (!gs.length) continue;
      const wsum = gs.reduce((s, g) => s + D.WILD[g].w, 0);
      let r = rng() * wsum, g = gs[0];
      for (const x of gs) { r -= D.WILD[x].w; if (r < 0) { g = x; break; } }
      if (g === 'grass') W.grass++; else W.bushes.push(W.at);
    }
    const edge = [...this.open].some((c) => ring(c) === 2);
    while (W.treeAt + D.WILD_TREES.every * SEC <= this.now) {
      W.treeAt += D.WILD_TREES.every * SEC;
      if (!edge || rng() >= D.WILD_TREES.chance || W.trees.length >= D.WILD_TREES.max) continue;
      const ws = D.WILD_TREES.w, keys = Object.keys(ws), sum = keys.reduce((s, k) => s + ws[k], 0);
      let r = rng() * sum, sp = keys[0];
      for (const k of keys) { r -= ws[k]; if (r < 0) { sp = k; break; } }
      W.trees.push({ sp, born: W.treeAt });
    }
  }

  // ---------- шаг: минута в игре ----------
  minute(t, len) {
    const st = this.st;
    this.now = t;
    this.tickEnergy();
    this.growAll(len / SEC, false);
    const hu = House.houseTick(st, this.now);
    if (hu) { this.mark('house' + hu.to); this.note(`дом ${hu.to} готов`); }
    this.toolTick();
    this.craftStep();
    this.animalStep();
    this.wildStep();
    this.deliverOrders();
    this.claimAll();
    this.sellSurplus();
    this.spendStep();
    let budget = len / SEC;
    const cov = this.coveredCount();
    // сбор
    for (const b of this.beds) {
      if (budget <= 0) break;
      if (!b.crop || !Beds.cropInfo(b).ready) continue;
      const c = CROPS[b.crop];
      Inv.addItem(st, c.key, 1);
      if (this.rng() < 0.25) Inv.addItem(st, D.seedId(c.key), 1);
      b.crop = null; b.p = 0; b.w = 0;
      st.stats.harvested++; this.ev('harvest', c.key); this.addXp(c.xp);
      budget -= ACT.harvest;
    }
    this.deliverOrders();
    // посадка
    this.beds.forEach((b, i) => {
      if (budget <= 0 || b.crop) return;
      const k = this.chooseCrop(this.now, i < cov);
      if (!k) return;
      if (Plant.plantBed(st, b, k)) { this.ev('plant', k); this.addXp(1); budget -= ACT.plant; }
    });
    // полив (энергия — сначала на полив)
    let need = 0;
    this.beds.forEach((b, i) => { if (b.crop && i >= cov && Beds.cropInfo(b).needsWater) need++; });
    if (need) this.eatFor(Math.min(need, this.maxE), this.reserve());
    // лейка из кузницы поливает область: одно нажатие (1 энергия) — до per грядок, вода — за каждую
    const per = CAN_PER_TAP[TOOL_PERKS.can.area[Tool.toolLevel(st, 'can') - 1]];
    let inTap = 0;
    for (let i = cov; i < this.beds.length && budget > 0; i++) {
      const b = this.beds[i];
      if (!b.crop || !Beds.cropInfo(b).needsWater) continue;
      if (st.can <= 0) { st.can = this.canMax; budget -= ACT.fill; inTap = 0; }
      if (!inTap) { if (!this.spend(ENERGY.water)) break; budget -= ACT.water; }
      inTap = (inTap + 1) % per;
      st.can--; b.w++; this.ev('water');
    }
    // плоды и трава
    for (const o of this.orchard) {
      if (budget <= 0 || o.fruitAt > this.now || st.energy < ENERGY.pick) continue;
      const f = FLORA[o.sp];
      this.spend(ENERGY.pick); Inv.addItem(st, f.fruit, roll(this.rng, f.n)); o.fruitAt = this.now + f.regrow * SEC;
      this.ev('pick', f.fruit); this.addXp(1); budget -= ACT.pick;
    }
    while (this.wild.grass > 0 && budget > 0) {
      this.wild.grass--;
      Inv.addItem(st, 'hay', roll(this.rng, D.WILD.mow.hay));
      if (this.rng() < D.WILD.mow.seed) { const cs = Object.values(CROPS).filter((c) => c.level <= st.level); Inv.addItem(st, D.seedId(cs[Math.floor(this.rng() * cs.length)].key), 1); }
      this.ev('mow'); budget -= ACT.mow;
    }
    // саженцы деревьев — сажаем (свои деревья — запас дерева)
    for (const id of Object.keys(st.items)) if (id.startsWith('sap_') && FLORA[id.slice(4)] && !FLORA[id.slice(4)].pick && budget > 0) { this.sowOwn(id.slice(4)); budget -= ACT.sow; }
    // расчистка остатком энергии: оставляем на полив грядок без поливалки
    const goal = this.nextGoal(), lack = this.lack(goal.cost);
    const keepE = Math.max(0, this.beds.length - cov);
    // не хватает дерева/камня/руды на цель — едим, что есть, а если монет много — покупаем еду (как игрок)
    if ((lack.wood || lack.stone || lack.ore) && st.energy < keepE + 6 && this.mapLeft()[Object.keys(lack).find((k) => k !== 'coins') || 'wood'] > 0) {
      this.eatFor(Math.min(this.maxE, keepE + 30), {});
      if (st.energy < keepE + 6 && st.coins > 3000) {
        const f = Object.entries(SHOP_FOOD).filter(([, x]) => x.level <= st.level).sort((a, b) => a[1].price / a[1].food - b[1].price / b[1].food)[0];
        const n = Math.max(1, Math.floor((this.maxE - st.energy) / f[1].food));
        if (this.buy(f[0], n)) { this.foodBought = (this.foodBought || 0) + n * f[1].price; this.eatFor(this.maxE - f[1].food, {}); }
      }
    }
    while (budget > 0 && st.energy > keepE) {
      const s = this.clearOne(lack);
      if (!s) break;
      budget -= s;
    }
    // рыбалка: для заданий, а у абузера — всё оставшееся время (ест рыбу и рыбачит дальше)
    const fishGoal = this.goals().some(({ g }) => g.ev === 'fish');
    if (this.P.fish || fishGoal) {
      while (budget > ACT.fish) {
        if (st.energy < ENERGY.fish) { if (!this.eatFor(ENERGY.fish + 1)) break; }
        if (!this.fishOnce()) break;
        budget -= ACT.fish;
        if (!this.P.fish && !this.goals().some(({ g }) => g.ev === 'fish')) break;
      }
    }
    // учёт: чего ждём
    const why = Object.keys(lack).length ? Object.keys(lack) : goal.kind === 'wait-house' ? ['стройка дома'] : goal.kind === 'done' ? ['всё пройдено'] : [];
    for (const k of why) this.block[k] = (this.block[k] || 0) + len / MIN;
    this.played += len;
  }

  // ---------- вне игры ----------
  away(to) {
    const st = this.st, dt = to - this.now;
    if (dt <= 0) return;
    const goal = this.nextGoal(), lack = this.lack(goal.cost);
    for (const k of Object.keys(lack)) this.blockCal[k] = (this.blockCal[k] || 0) + dt;
    // рост грядок с поливалками и без (без игрока — до 2/3, если не полито)
    this.growAll(dt / SEC, true);
    this.now = to;
    this.tickEnergy();
    this.wildStep();
  }

  sessionStart() {
    const ctx = this.ctx();
    Q.refresh(this.st, ctx);
    const g = Gift.claimDaily(this.st, ctx);
    if (g) { this.income.gifts += g.reward.coins || 0; this.gemsIn.gifts += g.reward.gems || 0; if (g.reward.items && g.reward.items.bed) this.placeBeds(); }
    if (Wheel.wheelView(this.st, ctx).can.free) { const r = Wheel.spin(this.st, 'free', ctx); if (r) { this.income.gifts += r.reward.coins || 0; this.gemsIn.gifts += r.reward.gems || 0; } }
  }

  run() {
    const end = T0 + OPT.days * DAY;
    for (this.si = 0; this.si < this.sessions.length; this.si++) {
      const [s, e] = this.sessions[this.si];
      if (s >= end) break;
      this.away(s);
      this.sessionStart();
      for (let t = s; t < e; t += MIN) this.minute(t, Math.min(MIN, e - t));
      this.now = e;
      if (OPT.trace && this.si % this.P.sessions.length === this.P.sessions.length - 1) {
        const st = this.st;
        this.trace.push(`д${this.day().toFixed(0)} ур${st.level} дом${st.house} уч${this.open.size} гряд${this.beds.length} пол${this.coveredCount()} мон${st.coins} крист${st.gems} дер${Inv.count(st, 'wood')} кам${Inv.count(st, 'stone')} руда${Inv.count(st, 'ore')} эн.съел${this.spent.eaten} эн.потр${this.spent.energy} жив${this.animals.length} урожай${Math.round(this.income.crops)} заказы${Math.round(this.income.orders)}`);
      }
      if (this.st.house >= 5 && this.open.size >= HOUSE[5].chunks) { this.mark('final'); break; }
    }
    return this;
  }
}

// =====================================================================================
// Отчёт
// =====================================================================================
const fmtH = (h) => (h < 1 ? `${Math.round(h * 60)} мин` : `${h.toFixed(1)} ч`);
function median(a) { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; }

function runProfile(key) {
  const P = PROFILES[key], sims = [];
  for (let s = 1; s <= OPT.seeds; s++) sims.push(new Sim(P, s).run());
  return { key, P, sims };
}

function stepsTable(sims, keys) {
  // для каждой вехи: медиана игровых часов и календарных дней, и сколько часов ушло на этот шаг
  const rows = [];
  let prevH = 0;
  for (const k of keys) {
    const hs = sims.map((s) => s.mile[k] && s.mile[k].h), ds = sims.map((s) => s.mile[k] && s.mile[k].day);
    const reached = hs.filter((x) => x != null).length;
    const h = median(hs), d = median(ds);
    rows.push({ k, h, d, step: h != null ? h - prevH : null, reached });
    if (h != null) prevH = h;
  }
  return rows;
}

function report() {
  const L = [];
  const p = (s = '') => L.push(s);
  p(`# Баланс: ${PACE ? 'числа игры + PACE ' + JSON.stringify(PACE) : 'числа игры'}  (карт-прогонов на профиль: ${OPT.seeds}, до ${OPT.days} дней)`);
  p();
  p('## 1. Петли и абузы (по таблицам)');
  const { out } = scanLoops();
  for (const r of out.sort((a, b) => ['КРИТИЧНО', 'ВАЖНО', 'инфо', 'ok'].indexOf(a.sev) - ['КРИТИЧНО', 'ВАЖНО', 'инфо', 'ok'].indexOf(b.sev))) p(`- [${r.sev}] ${r.what}: ${r.detail}`);
  p();
  const profs = OPT.profile === 'all' ? Object.keys(PROFILES) : [OPT.profile];
  const all = {};
  for (const key of profs) {
    const R = runProfile(key);
    all[key] = R;
    const S = R.sims;
    p(`## ${R.P.name}`);
    const fin = S.filter((s) => s.mile.final).length;
    p(`Дошли до конца (дом 5 и 25 участков) за ${OPT.days} дн.: ${fin} из ${S.length}`);
    const ks = ['house2', 'house3', 'house4', 'house5', ...Array.from({ length: 24 }, (_, i) => 'chunk' + (i + 2))];
    const order = (k) => { const t = median(S.map((s) => s.mile[k] && s.mile[k].h)); return t == null ? 1e9 : t; };
    const steps = stepsTable(S, ks.sort((a, b) => order(a) - order(b)));
    p('| веха | день | часов в игре | шаг, дней | шаг ×к прошлому | дошли |');
    p('|---|---|---|---|---|---|');
    let prev = null, prevD = 0;
    for (const r of steps) {
      const sd = r.d != null ? r.d - prevD : null;
      const ratio = prev && sd ? (sd / prev).toFixed(2) : '';
      const name = r.k.startsWith('house') ? `**дом ${r.k.slice(5)}**` : `участок ${r.k.slice(5)}`;
      p(`| ${name} | ${r.d != null ? r.d.toFixed(1) : '—'} | ${r.h != null ? r.h.toFixed(1) : '—'} | ${sd != null ? sd.toFixed(1) : '—'} | ${ratio} | ${r.reached}/${S.length} |`);
      if (sd != null && sd > 0.05) prev = sd;
      if (r.d != null) prevD = r.d;
    }
    const lv = [];
    for (let l = 2; l <= 30; l++) {
      const d = median(S.map((s) => s.mile['level' + l] && s.mile['level' + l].day)), d0 = median(S.map((s) => s.mile['level' + (l - 1)] ? s.mile['level' + (l - 1)].day : l === 2 ? 0 : null));
      const inc = median(S.map((s) => s.mile['level' + l] && s.lvIncome[l] != null && s.lvIncome[l - 1] != null ? (s.lvIncome[l] - s.lvIncome[l - 1]) / Math.max(0.05, s.mile['level' + l].day - (s.mile['level' + (l - 1)] ? s.mile['level' + (l - 1)].day : 0)) : null));
      if (d != null) lv.push(`${l}: д${d.toFixed(1)}${inc != null && l > 3 ? ` (${Math.round(inc)}/д)` : ''}`);
    }
    p(`Уровни: день, когда взят (доход монет в день на прошлом уровне): ${lv.join(', ')}`);
    // чего не хватало
    const bl = {};
    for (const s of S) for (const [k, v] of Object.entries(s.blockCal)) bl[k] = (bl[k] || 0) + v / HOUR / 24 / S.length;
    p(`Цель стояла (в среднем, календарных дней) из-за: ${Object.entries(bl).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
    for (const h of [4, 5]) {
      const xs = S.map((s) => s.oreAt[h]).filter(Boolean);
      if (!xs.length || !xs[0].need) continue;
      const short = xs.filter((x) => x.have < x.need);
      p(`Руда на дом ${h} (нужно ${xs[0].need}): когда всего остального хватило, руды было ${xs.map((x) => x.have).sort((a, b) => a - b).join(', ')}; не хватало у ${short.length} из ${xs.length}` + (short.length ? `, на открытой земле ещё ≈${short.map((x) => x.mapLeft).join(', ')}` : ''));
    }
    const gr = { ore: 0, wood: 0, gems: 0, n: 0 };
    for (const s of S) { gr.ore += s.gemRescue.ore; gr.wood += s.gemRescue.wood; gr.gems += s.gemRescue.gems; if (s.gemRescue.gems) gr.n++; }
    p(`Выход из тупика за кристаллы: у ${gr.n} из ${S.length}; руды ${(gr.ore / S.length).toFixed(1)}, дерева ${(gr.wood / S.length).toFixed(1)} в среднем (${(gr.gems / S.length).toFixed(1)} крист.)`);
    const gi = {};
    for (const s of S) for (const [k, v] of Object.entries(s.gemsIn)) gi[k] = (gi[k] || 0) + v / S.length;
    p(`Кристаллы получены (в среднем за прогон): ${Object.entries(gi).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`);
    const inc = {};
    for (const s of S) for (const [k, v] of Object.entries(s.income)) inc[k] = (inc[k] || 0) + v / S.length;
    p(`Доход за игру (монет, в среднем): ${Object.entries(inc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`);
    if (TOOLS_ON) {
      const tl = [];
      for (const t of TOOL_ORDER) for (let to = 2; to <= TOOL_UP[t].names.length; to++) {
        const d = median(S.map((s) => s.mile['tool_' + t + to] && s.mile['tool_' + t + to].day)), n = S.filter((s) => s.mile['tool_' + t + to]).length;
        if (d != null) tl.push(`${t}${to}: д${d.toFixed(1)} (${n}/${S.length})`);
      }
      p(`Инструменты (медиана дня, когда доковался): ${tl.join(', ')}`);
    }
    p(`На инструменты потрачено монет ${Math.round(S.reduce((a, s) => a + s.toolSpent.coins, 0) / S.length)}; руды добыто ${Math.round(S.reduce((a, s) => a + s.oreGot, 0) / S.length)}; энергии потрачено ${Math.round(S.reduce((a, s) => a + s.spent.energy, 0) / S.length)}, еды съедено ${Math.round(S.reduce((a, s) => a + s.spent.eaten, 0) / S.length)}`);
    const last = S[0];
    p(`Конец прогона 1: день ${last.day().toFixed(1)}, ур. ${last.st.level}, дом ${last.st.house}, участков ${last.open.size}, грядок ${last.beds.length}, монет ${last.st.coins}, кристаллов ${last.st.gems}, руды ${Inv.count(last.st, 'ore')}, дерева ${Inv.count(last.st, 'wood')}, камня ${Inv.count(last.st, 'stone')}`);
    if (OPT.trace) p('По дням (прогон 1):\n  ' + last.trace.join('\n  '));
    if (OPT.log) p('Лог прогона 1:\n  ' + last.log.join('\n  '));
    p();
  }
  if (OPT.json) fs.writeFileSync(OPT.json, JSON.stringify(Object.fromEntries(Object.entries(all).map(([k, R]) => [k, R.sims.map((s) => ({ mile: s.mile, block: s.blockCal, rescue: s.gemRescue, income: s.income }))])), null, 1));
  return L.join('\n');
}

console.log(report());
