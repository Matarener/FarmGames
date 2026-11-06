// Игровые таблицы. Все числа баланса — здесь.

export const CROPS = {
  carrot:     { name: 'Морковь',   level: 1,  seed: 2,   time: 120,   sell: 5,   xp: 1,  food: 3,  look: 'root',   leaf: '#4f9e36', fruit: '#f08a24' },
  wheat:      { name: 'Пшеница',   level: 2,  seed: 3,   time: 240,   sell: 8,   xp: 2,  food: 2,  look: 'grain',  leaf: '#7cbf3a', fruit: '#e8c14a' },
  beet:       { name: 'Свёкла',    level: 3,  seed: 5,   time: 480,   sell: 14,  xp: 3,  food: 4,  look: 'root',   leaf: '#3f8a2f', fruit: '#b5285f' },
  cabbage:    { name: 'Капуста',   level: 4,  seed: 8,   time: 900,   sell: 22,  xp: 4,  food: 5,  look: 'round',  leaf: '#5fb03a', fruit: '#8fd35c', fruit2: '#d6f5a8' },
  tomato:     { name: 'Помидор',   level: 5,  seed: 15,  time: 1800,  sell: 40,  xp: 7,  food: 6,  look: 'bush',   leaf: '#3f8a2f', fruit: '#e2392f' },
  corn:       { name: 'Кукуруза',  level: 7,  seed: 25,  time: 3600,  sell: 70,  xp: 12, food: 8,  look: 'tall',   leaf: '#5fb03a', fruit: '#f2c230' },
  sunflower:  { name: 'Подсолнух', level: 8,  seed: 30,  time: 5400,  sell: 90,  xp: 15, food: 0,  look: 'tall',   leaf: '#4f9e36', fruit: '#ffcf33' },
  pumpkin:    { name: 'Тыква',     level: 10, seed: 50,  time: 10800, sell: 160, xp: 25, food: 12, look: 'ground', leaf: '#4f9e36', fruit: '#f08a24' },
  strawberry: { name: 'Клубника',  level: 12, seed: 80,  time: 21600, sell: 280, xp: 40, food: 10, look: 'bush',   leaf: '#3f8a2f', fruit: '#e8334a' },
  cotton:     { name: 'Хлопок',    level: 14, seed: 100, time: 28800, sell: 360, xp: 50, food: 0,  look: 'puff',   leaf: '#4f9e36', fruit: '#ffffff' },
};
for (const [k, v] of Object.entries(CROPS)) v.key = k;

// Рыба из пруда: хранится вместе с урожаем, её можно съесть или продать
export const FISH = {
  fish_carp:   { name: 'Карась',        chance: 60, sell: 4,  food: 3, xp: 1, color: '#c9a24a', belly: '#f0d98a' },
  fish_perch:  { name: 'Окунь',         chance: 30, sell: 8,  food: 5, xp: 2, color: '#6f9a4a', belly: '#d9e8a0', stripes: true },
  fish_gold:   { name: 'Золотая рыбка', chance: 10, sell: 40, food: 8, xp: 5, color: '#f29a1d', belly: '#ffd75a' },
};
for (const [k, v] of Object.entries(FISH)) v.key = k;
export const FISH_CATCH = 0.75; // шанс, что рыба не сорвётся

// Всё, что лежит в рюкзаке как еда/товар
export const GOODS = { ...CROPS, ...FISH };

export const RESOURCES = {
  wood: { name: 'Дерево' },
  stone: { name: 'Камень' },
  ore: { name: 'Руда' },
};

// Препятствия: hp — число ударов, action — какой инструмент нужен.
export const OBJECTS = {
  oak:     { name: 'Дерево',  hp: 3, action: 'chop', drops: { wood: [2, 4] }, xp: 2, stump: true, seedChance: 0.1 },
  oak2:    { name: 'Дерево',  hp: 3, action: 'chop', drops: { wood: [2, 4] }, xp: 2, stump: true, seedChance: 0.1 },
  apple:   { name: 'Яблоня',  hp: 3, action: 'chop', drops: { wood: [2, 3] }, xp: 2, stump: true, seedChance: 0.25 },
  pine:    { name: 'Ель',     hp: 4, action: 'chop', drops: { wood: [3, 5] }, xp: 3, stump: true },
  stump:   { name: 'Пень',    hp: 2, action: 'chop', drops: { wood: [1, 1] }, xp: 1 },
  bush:    { name: 'Куст',    hp: 1, action: 'chop', drops: { wood: [1, 1] }, xp: 1, seedChance: 0.3 },
  berry:   { name: 'Куст',    hp: 1, action: 'chop', drops: { wood: [1, 1] }, xp: 1, seedChance: 0.5 },
  rock:    { name: 'Камень',  hp: 2, action: 'mine', drops: { stone: [2, 4] }, xp: 2, oreChance: 0.1, ore: [1, 1] },
  boulder: { name: 'Валун',   hp: 5, action: 'mine', drops: { stone: [6, 9] }, xp: 5, oreChance: 1, ore: [1, 3], w: 2, h: 2 },
  house:   { name: 'Дом',     static: true, w: 2, h: 2 },
  well:    { name: 'Колодец', static: true },
};

// Стоимость энергии за удар/действие
export const ENERGY = { chop: 1, mine: 1, dig: 2, water: 1, plant: 0, harvest: 0, fill: 0, fish: 1 };
export const ENERGY_REGEN_SEC = 120;

export const HOUSE = [
  null,
  { energy: 30, can: 3, chunks: 3 },
  { energy: 40, can: 4, chunks: 6,  cost: { wood: 20, stone: 10, coins: 50 } },
  { energy: 55, can: 5, chunks: 10, cost: { wood: 60, stone: 40, coins: 300 } },
  { energy: 75, can: 6, chunks: 16, cost: { wood: 150, stone: 80, ore: 20, coins: 1500 } },
  { energy: 100, can: 8, chunks: 25, cost: { wood: 300, stone: 120, ore: 25, coins: 6000 } },
];

// Склад не ограничен: ресурсы не пропадают
export const STORAGE = 999999;

export const START = { coins: 50, gems: 5, energy: 30 };
// Починка бабушкиного колодца: после него воду можно набирать у грядок
export const WELL_COST = { wood: 5, stone: 4, coins: 15 };

export function xpToNext(level) { return Math.round(20 * Math.pow(level, 1.5)); }

const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);
export function expansionCost(n) {
  // n — порядковый номер покупаемого участка (1, 2, ...).
  // Дерево и камень растут линейно: участок приносит их примерно поровну с ценой
  // следующего (проверено tools/balance-bot.mjs), монеты — плавно по экспоненте.
  return { wood: r5(15 + 3.5 * (n - 1)), stone: r5(6 + 1.5 * (n - 1)), coins: r5(40 * Math.pow(1.3, n - 1)) };
}

// Улучшить дом можно, только открыв хотя бы один новый участок на текущем уровне
export function houseNeedChunks(level) { return (HOUSE[level - 1] ? HOUSE[level - 1].chunks : 1) + 1; }

export const GEM_SPEEDUP_SEC = 600; // 1 кристалл ускоряет на 10 минут (минимум 1)

// ---------------- Инвентарь ----------------
// Разделы рюкзака. Предмет может лежать сразу в нескольких (морковь — еда и растение).
export const INV_TABS = [
  { key: 'all',    name: 'Все',         icon: 'bag' },
  { key: 'tools',  name: 'Инструменты', icon: 'axe' },
  { key: 'build',  name: 'Постройки',   icon: 'build' },
  { key: 'plants', name: 'Растения',    icon: 'seed' },
  { key: 'food',   name: 'Еда',         icon: 'food' },
  { key: 'res',    name: 'Ресурсы',     icon: 'wood' },
];

// Инструменты есть всегда, их не считают и не продают
export const TOOLS = {
  tool_axe:    { name: 'Топор',  icon: 'axe',  desc: 'Рубит деревья, кусты и пни. Удар стоит 1 энергию.' },
  tool_pick:   { name: 'Кирка',  icon: 'pick', desc: 'Разбивает камни и валуны, иногда попадается руда.' },
  tool_shovel: { name: 'Лопата', icon: 'dig',  desc: 'Вскапывает траву под новую грядку.' },
  tool_can:    { name: 'Лейка',  icon: 'can',  desc: 'Поливает грядки. Набрать воду можно в пруду или у колодца.', can: true },
  tool_rod:    { name: 'Удочка', icon: 'fish', desc: 'Ловит рыбу в пруду. Рыбу можно съесть или продать.' },
};

export const seedId = (crop) => 'seed_' + crop;
const fmtMin = (s) => s < 3600 ? `${Math.round(s / 60)} мин.` : `${+(s / 3600).toFixed(1)} ч.`;

// Единая таблица всех предметов: key, name, icon, tabs, desc, sell (цена продажи), food (энергия).
// Собирается из таблиц выше, чтобы цены и названия жили в одном месте.
export const ITEMS = {};
for (const [k, t] of Object.entries(TOOLS)) ITEMS[k] = { ...t, key: k, tabs: ['tools'], tool: true };
for (const c of Object.values(CROPS)) ITEMS[c.key] = {
  key: c.key, name: c.name, icon: c.key, sell: c.sell, food: c.food,
  tabs: c.food ? ['food', 'plants'] : ['plants'],
  desc: c.food ? 'Урожай с грядки. Можно съесть или продать.' : 'Урожай с грядки. Несъедобно, но хорошо продаётся.',
};
for (const f of Object.values(FISH)) ITEMS[f.key] = { key: f.key, name: f.name, icon: f.key, sell: f.sell, food: f.food, tabs: ['food'], desc: 'Рыба из пруда. Можно съесть или продать.' };
for (const c of Object.values(CROPS)) ITEMS[seedId(c.key)] = {
  key: seedId(c.key), name: 'Семена: ' + c.name.toLowerCase(), icon: c.key, badge: 'seed', tabs: ['plants'], seedOf: c.key,
  desc: `Посадите на пустую грядку. Растёт ${fmtMin(c.time)}, доступно с ${c.level} уровня.`,
};
for (const [k, r] of Object.entries(RESOURCES)) ITEMS[k] = { key: k, name: r.name, icon: k, tabs: ['res'], desc: 'Нужно для улучшения дома, колодца и новых участков.' };
// Еда из магазина: её не выращивают и не продают, зато она даёт больше энергии
export const SHOP_FOOD = {
  milk:  { name: 'Молоко',  food: 6,  price: 10, level: 1, desc: 'Свежее молоко из деревни.' },
  bread: { name: 'Хлеб',    food: 10, price: 18, level: 2, desc: 'Тёплый хлеб из пекарни.' },
  pie:   { name: 'Пирожок', food: 18, price: 35, level: 4, desc: 'Пирожок с яблоками, очень сытный.' },
};
for (const [k, f] of Object.entries(SHOP_FOOD)) ITEMS[k] = { key: k, name: f.name, icon: k, food: f.food, tabs: ['food'], desc: f.desc + ' Восстанавливает энергию.' };
// порядок «по умолчанию»: как в таблице (инструменты, урожай, рыба, семена, ресурсы)
let _ord = 0;
for (const it of Object.values(ITEMS)) it.order = _ord++;

// ---------------- Рынок: покупка ----------------
export const SHOP_TABS = [
  { key: 'food',  name: 'Еда',       icon: 'food' },
  { key: 'seeds', name: 'Семена',    icon: 'seed' },
  { key: 'res',   name: 'Ресурсы',   icon: 'wood' },
  { key: 'build', name: 'Постройки', icon: 'build' },
];
// Товары: item — id из ITEMS, price — цена одной покупки, level — с какого уровня можно купить
export const SHOP = [];
// cur — валюта ('coins' или 'gems'), qty — сколько штук в одной покупке
for (const [k, f] of Object.entries(SHOP_FOOD)) SHOP.push({ tab: 'food', item: k, price: f.price, level: f.level });
for (const c of Object.values(CROPS)) SHOP.push({ tab: 'seeds', item: seedId(c.key), price: c.seed, level: c.level });
SHOP.push({ tab: 'res', item: 'stone', price: 4 });
SHOP.push({ tab: 'res', item: 'wood', price: 1, cur: 'gems', qty: 10 });
SHOP.push({ tab: 'res', item: 'ore', price: 1, cur: 'gems', qty: 3 });
