// Игровые таблицы. Все числа баланса — здесь.

export const CROPS = {
  carrot:     { name: 'Морковь',   level: 1,  seed: 2,   time: 120,   sell: 5,   xp: 1,  food: 3 },
  wheat:      { name: 'Пшеница',   level: 2,  seed: 3,   time: 240,   sell: 8,   xp: 2,  food: 2 },
  beet:       { name: 'Свёкла',    level: 3,  seed: 5,   time: 480,   sell: 14,  xp: 3,  food: 4 },
  cabbage:    { name: 'Капуста',   level: 4,  seed: 8,   time: 900,   sell: 22,  xp: 4,  food: 5 },
  tomato:     { name: 'Помидор',   level: 5,  seed: 15,  time: 1800,  sell: 40,  xp: 7,  food: 6 },
  corn:       { name: 'Кукуруза',  level: 7,  seed: 25,  time: 3600,  sell: 70,  xp: 12, food: 8 },
  sunflower:  { name: 'Подсолнух', level: 8,  seed: 30,  time: 5400,  sell: 90,  xp: 15, food: 0 },
  pumpkin:    { name: 'Тыква',     level: 10, seed: 50,  time: 10800, sell: 160, xp: 25, food: 12 },
  strawberry: { name: 'Клубника',  level: 12, seed: 80,  time: 21600, sell: 280, xp: 40, food: 10 },
  cotton:     { name: 'Хлопок',    level: 14, seed: 100, time: 28800, sell: 360, xp: 50, food: 0 },
};
for (const [k, v] of Object.entries(CROPS)) v.key = k;

// Окно посадки (нажали на пустую грядку): «Быстрые» — культуры, которые растут не дольше fast секунд;
// закрытых по уровню культур в конце сетки — не больше locked, ближайших по уровню.
export const PLANT_PICK = { fast: 1800, locked: 4 };

// Рыба из пруда: хранится вместе с урожаем, её можно съесть или продать
export const FISH = {
  fish_carp:   { name: 'Карась',        chance: 60, sell: 4,  food: 3, xp: 1 },
  fish_perch:  { name: 'Окунь',         chance: 30, sell: 8,  food: 5, xp: 2 },
  fish_gold:   { name: 'Золотая рыбка', chance: 10, sell: 40, food: 8, xp: 5 },
};
for (const [k, v] of Object.entries(FISH)) v.key = k;
export const FISH_CATCH = 0.75; // шанс, что рыба не сорвётся

export const RESOURCES = {
  wood: { name: 'Дерево' },
  stone: { name: 'Камень' },
  ore: { name: 'Руда' },
};

// ---------------- Деревья и кусты ----------------
// Каждый вид — свой тип объекта на карте. fruit — добыча вида (n — сколько).
// pick: true — это плоды или ягоды: собираются касанием без рубки, regrow — через сколько секунд
// отрастут снова. Без pick (кора, шишки, лепестки, листья, цветы) добыча — только при рубке.
// Рубка даёт дерево (wood), добычу (у pick — если плоды висят) и с шансом seedChop — саженец
// этого вида. Сбором саженцы не добываются.
// grow — сколько секунд растёт посаженное игроком семя до взрослого растения.
// sapSell — цена продажи саженца (ниже цены в магазине SAPLING_SHOP, чтобы не было перепродажи).
// ownSell — цена продажи выкопанного взрослого растения (тоже ниже цены саженца в магазине).
export const FLORA = {
  oak:       { name: 'Дуб',       kind: 'tree', fruit: 'acorn',        n: [1, 3], wood: [2, 4], hp: 3, xp: 2, seedChop: 0.25, sapSell: 6, ownSell: 18, grow: 3 * 3600 },
  birch:     { name: 'Берёза',    kind: 'tree', fruit: 'birch_bark',   n: [1, 2], wood: [2, 4], hp: 3, xp: 2, seedChop: 0.25, sapSell: 6, ownSell: 18, grow: 3 * 3600 },
  sakura:    { name: 'Сакура',    kind: 'tree', fruit: 'sakura_petal', n: [2, 4], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 10, ownSell: 30, grow: 4 * 3600 },
  cherry:    { name: 'Вишня',     kind: 'tree', fruit: 'cherry',       n: [2, 4], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 15, ownSell: 45, grow: 4 * 3600, pick: true, regrow: 3 * 3600 },
  maple:     { name: 'Клён',      kind: 'tree', fruit: 'maple_leaf',   n: [2, 3], wood: [2, 4], hp: 3, xp: 2, seedChop: 0.25, sapSell: 8, ownSell: 24, grow: 3 * 3600 },
  apple:     { name: 'Яблоня',    kind: 'tree', fruit: 'apple',        n: [2, 4], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 18, ownSell: 54, grow: 4 * 3600, pick: true, regrow: 3 * 3600 },
  pine:      { name: 'Ель',       kind: 'tree', fruit: 'pinecone',     n: [1, 3], wood: [3, 5], hp: 4, xp: 3, seedChop: 0.25, sapSell: 6, ownSell: 18, grow: 3 * 3600 },
  linden:    { name: 'Липа',      kind: 'tree', fruit: 'linden_blossom', n: [2, 3], wood: [2, 4], hp: 3, xp: 2, seedChop: 0.25, sapSell: 8, ownSell: 24, grow: 3 * 3600 },
  blueberry: { name: 'Голубика',  kind: 'bush', fruit: 'blueberry',    n: [2, 4], wood: [1, 1], hp: 1, xp: 1, seedChop: 0.35, sapSell: 9, ownSell: 27, grow: 3600,     pick: true, regrow: 1.5 * 3600 },
  raspberry: { name: 'Малина',    kind: 'bush', fruit: 'raspberry',    n: [2, 4], wood: [1, 1], hp: 1, xp: 1, seedChop: 0.35, sapSell: 8, ownSell: 24, grow: 3600,     pick: true, regrow: 1.5 * 3600 },
  rosehip:   { name: 'Шиповник',  kind: 'bush', fruit: 'rosehip',      n: [2, 3], wood: [1, 1], hp: 1, xp: 1, seedChop: 0.35, sapSell: 5, ownSell: 15, grow: 3600,     pick: true, regrow: 2 * 3600 },
  hydrangea: { name: 'Гортензия', kind: 'bush', fruit: 'hydrangea',    n: [1, 2], wood: [1, 1], hp: 1, xp: 1, seedChop: 0.35, sapSell: 6, ownSell: 18, grow: 3600 },
  lavender:  { name: 'Лаванда',   kind: 'bush', fruit: 'lavender',     n: [2, 3], wood: [1, 1], hp: 1, xp: 1, seedChop: 0.35, sapSell: 6, ownSell: 18, grow: 3600 },
  rose:      { name: 'Роза',      kind: 'bush', fruit: 'rose_petal',   n: [2, 3], wood: [1, 1], hp: 1, xp: 1, seedChop: 0.35, sapSell: 7, ownSell: 21, grow: 3600 },
};
for (const [k, v] of Object.entries(FLORA)) v.key = k;

// Карта v1 и генерация знают только группы: вид берётся по номеру объекта (как раньше выбиралась картинка)
export const FLORA_GROUPS = {
  oak: ['oak', 'birch'],
  oak2: ['sakura', 'cherry', 'maple'],
  bush: ['rosehip', 'hydrangea', 'lavender', 'rose'],
  berry: ['blueberry', 'raspberry'],
};
export function floraByGroup(type, id) {
  const g = FLORA_GROUPS[type];
  return g ? g[id % g.length] : type;
}

// Плоды и прочее, что даёт растение. food — энергия (можно съесть), sell — цена продажи.
// color — цвет брызг, когда плоды собирают.
export const FLORA_GOODS = {
  acorn:        { name: 'Жёлудь',          sell: 2,          color: '#b9803f', desc: 'Жёлуди с дуба. Пригодятся для поделок.' },
  birch_bark:   { name: 'Берёста',         sell: 3,          color: '#f2eee2', desc: 'Кора берёзы. Пригодится для поделок.' },
  sakura_petal: { name: 'Лепестки сакуры', sell: 6,          color: '#f7a8c8', desc: 'Нежные лепестки сакуры.' },
  cherry:       { name: 'Вишня',           sell: 4, food: 2, color: '#c8213a', desc: 'Спелая вишня. Можно съесть или продать.' },
  maple_leaf:   { name: 'Кленовый лист',   sell: 3,          color: '#ef7d22', desc: 'Яркий осенний лист клёна.' },
  apple:        { name: 'Яблоко',          sell: 5, food: 4, color: '#e2392f', desc: 'Сочное яблоко. Можно съесть или продать.' },
  pinecone:     { name: 'Шишка',           sell: 2,          color: '#9a6538', desc: 'Еловая шишка. Пригодится для поделок.' },
  linden_blossom: { name: 'Липовый цвет',  sell: 4,          color: '#efe08a', desc: 'Душистые соцветия липы. Пригодятся для чая.' },
  blueberry:    { name: 'Голубика',        sell: 3, food: 2, color: '#3f5fc8', desc: 'Горсть голубики. Можно съесть или продать.' },
  raspberry:    { name: 'Малина',          sell: 3, food: 2, color: '#e0335a', desc: 'Сладкая малина. Можно съесть или продать.' },
  rosehip:      { name: 'Шиповник',        sell: 3, food: 1, color: '#e2552f', desc: 'Плоды шиповника. Полезные, но кислые.' },
  hydrangea:    { name: 'Гортензия',       sell: 4,          color: '#6f8fe8', desc: 'Пышные цветы гортензии.' },
  lavender:     { name: 'Лаванда',         sell: 4,          color: '#9b6fd6', desc: 'Душистые веточки лаванды.' },
  rose_petal:   { name: 'Лепестки розы',   sell: 5,          color: '#e8406a', desc: 'Ароматные лепестки розы.' },
  hay:          { name: 'Сено',            sell: 1,          color: '#d9b44a', desc: 'Скошенная дикая трава. Пригодится для животных.' },
};
for (const [k, v] of Object.entries(FLORA_GOODS)) v.key = k;
export const floraSeedId = (sp) => 'sap_' + sp;
// своё взрослое растение, выкопанное в рюкзак: сажается обратно сразу взрослым
export const floraOwnId = (sp) => 'own_' + sp;

// Препятствия: hp — число ударов, action — какой инструмент нужен.
// Деревья и кусты собираются из FLORA (ниже), здесь — остальное.
export const OBJECTS = {
  stump:   { name: 'Пень',    hp: 2, action: 'chop', drops: { wood: [1, 1] }, xp: 1 },
  rock:    { name: 'Камень',  hp: 2, action: 'mine', drops: { stone: [2, 4] }, xp: 2, oreChance: 0.1, ore: [1, 1] },
  boulder: { name: 'Валун',   hp: 5, action: 'mine', drops: { stone: [6, 9] }, xp: 5, oreChance: 1, ore: [1, 3], w: 2, h: 2 },
  house:   { name: 'Дом',     static: true, w: 2, h: 2 },
  well:    { name: 'Колодец', static: true },
  // росток, посаженный игроком: o.tree — во что вырастет, o.born — когда посажен (мс)
  sapling: { name: 'Росток',  hp: 1, action: 'chop', drops: {}, wildDrops: { wood: [1, 1] }, xp: 0 }, // дикий росток рубится в дерево
  // дикая высокая трава (WILD.grass): срывается руками за один раз
  grass:   { name: 'Высокая трава', hp: 1, action: 'mow', drops: {}, xp: 0 },
};
for (const f of Object.values(FLORA)) {
  OBJECTS[f.key] = { name: f.name, hp: f.hp, action: 'chop', drops: { wood: f.wood }, xp: f.xp, stump: f.kind === 'tree', flora: f.key, bush: f.kind === 'bush' };
}

// ---------------- Пруды ----------------
// Пруд — один объект на карте и одна картинка на весь пруд (assets/art/pond_<вид>.webp, tools/pond_art.py),
// а не клетки воды. Форма — cells: строки по gy, символы по gx: 'w' — вода (рыбалка, набрать воды),
// '.' — не пруд (обычная земля у берега: там может стоять дерево). Пруды продаются на рынке в разделе «Декор» (price — монеты, level — с какого уровня),
// их можно переставлять и убирать в рюкзак (ponds.js).
// Старые карты (клетки воды, цифра 2) превращаются в пруды этих форм (World.pondsFromWater): капелька
// и круглый — ровно пруды стартовой карты, поэтому карта и сохранения не меняются.
// Кувшинки и листья нарисованы в картинке пруда. Камыш, рогоз и камни — украшения POND_DECOR: игрок
// ставит их сам, только на воду пруда. decor — какие украшения стоят у пруда стартовой карты (и у пруда,
// поставленного в редакторе): [что, dx, dy] — клетка воды от левого верхнего угла пруда. Купленный пруд — без них.
export const PONDS = {
  pond_small:  { name: 'Маленький пруд',   cells: ['ww', 'ww'], price: 150, level: 3,
    decor: [['cattail', 0, 1]], desc: 'Маленький пруд на четыре клетки.' },
  pond_drop:   { name: 'Пруд-капелька',    cells: ['ww.', 'www', 'ww.'], price: 250, level: 4,
    decor: [['cattail', 0, 0], ['reeds', 0, 2], ['rocks', 2, 1]], desc: 'Пруд в форме капли, как у бабушкиного дома.' },
  pond_long:   { name: 'Длинный пруд',     cells: ['.www.', 'wwwww', '.www.'], price: 350, level: 6,
    decor: [['cattail', 0, 1], ['reeds', 4, 1], ['rocks', 2, 2]], desc: 'Вытянутый пруд вдоль тропинки.' },
  pond_round:  { name: 'Круглый пруд',     cells: ['.ww.', 'wwww', 'wwww', '.ww.'], price: 450, level: 7,
    decor: [['cattail', 0, 1], ['reeds', 1, 3], ['rocks', 3, 2]], desc: 'Большой круглый пруд: рыбы в нём много.' },
  pond_big:    { name: 'Большой пруд',     cells: ['.www.', 'wwwww', 'wwwww', 'wwwww', '.www.'], price: 600, level: 9,
    decor: [['cattail', 0, 1], ['cattail', 3, 0], ['reeds', 1, 4], ['rocks', 4, 3]], desc: 'Самый большой пруд: рыбы в нём больше всего.' },
};
// Украшения прудов: ставятся только на клетку воды пруда (на клетку — одно), у берега стоят ближе к земле.
// Переезжают вместе с прудом; пруд убрали в рюкзак — его украшения тоже в рюкзак. Предмет — pond_<что>
// (картинка pond_<что>.webp), в магазине — раздел «Декор».
export const POND_DECOR = {
  rocks:   { name: 'Камни у воды', price: 15, level: 3, desc: 'Несколько гладких камней у самой воды.' },
  reeds:   { name: 'Камыш',        price: 20, level: 3, desc: 'Пучок камыша с пушистыми метёлками.' },
  cattail: { name: 'Рогоз',        price: 25, level: 3, desc: 'Высокий рогоз с бархатными початками.' },
};
export const pondDecorId = (type) => 'pond_' + type;
for (const [k, p] of Object.entries(PONDS)) {
  p.key = k;
  p.h = p.cells.length; p.w = Math.max(...p.cells.map((r) => r.length));
  // клетки воды — их пруд и занимает: [[dx, dy], ...]
  p.water = [];
  p.cells.forEach((r, dy) => [...r].forEach((c, dx) => { if (c === 'w') p.water.push([dx, dy]); }));
  p.occ = p.water;
  OBJECTS[k] = { name: p.name, static: true, pond: k, flat: true, w: p.w, h: p.h, cells: p.occ };
}

// ---------------- Дикая поросль ----------------
// Сама появляется на свободной траве открытых участков (не на тропинках, грядках, воде, постройках,
// не рядом с призраком). Раз в every секунд — одна попытка с шансом chance; за время отсутствия
// попытки досчитываются при входе (не больше catchUp). Предел у каждого вида — perChunk на
// открытый участок, но не больше max: за день без игрока ферма не зарастает целиком.
// w — вес вида при выборе. Кусты появляются ростками и растут, как свои (FLORA.grow), и только
// у края открытой земли: не дальше band клеток от закрытого участка или тумана.
// Деревья здесь не появляются: у них своя генерация возле тумана (WILD_TREES).
// Плодовые и ягодные виды (pick) сами не растут нигде: их саженцы только в магазине (SAPLING_SHOP).
export const WILD = {
  every: 900, chance: 0.7, catchUp: 96,
  grass: { w: 6, perChunk: 2, max: 20 },
  bush:  { w: 3, perChunk: 1, max: 10, band: 2 },
  // что даёт трава: сено и иногда семена культуры, доступной по уровню
  mow: { hay: [1, 2], seed: 0.12, xp: 0 },
};

// ---------------- Деревья у тумана ----------------
// Саженцы деревьев сами появляются вдоль границы тумана: в полосе band клеток от края карты,
// только на открытых участках (пока у тумана ничего не открыто — не растут).
// Раз в every секунд — одна попытка с шансом chance, за время отсутствия досчитывается не больше
// catchUp попыток. Всего диких деревьев у тумана (саженцы + выросшие) не больше max: срубили —
// освободилось место для нового. space — сколько клеток вокруг без других диких деревьев.
// Растут, как свои (FLORA.grow), в один из видов деревьев FLORA (w — вес вида, по умолчанию 1).
export const WILD_TREES = {
  every: 1800, chance: 0.6, catchUp: 24, max: 12, band: 2, space: 1,
  w: { oak: 3, birch: 3, pine: 3, linden: 3, maple: 2, sakura: 1 },
};

// Туман вокруг карты: ширина полосы (клеток), густота леса под туманом
export const FOG = { width: 4, forest: [0.6, 0.55, 0.45, 0], color: 0xe4ecee };

// Стоимость энергии за удар/действие
export const ENERGY = { chop: 1, mine: 1, dig: 2, water: 1, plant: 0, harvest: 0, fill: 0, fish: 1, pick: 1, sow: 0, mow: 0 };
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

// Режим тестера (devRules.js): сколько монет/кристаллов можно поставить и предметов выдать за раз,
// и сколько нажатий по строке версии в «Настройках» его включают
export const DEV_LIMITS = { wallet: 999999999, item: 99999, quick: [1, 10, 100, 1000], unlockTaps: 7 };
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
  { key: 'decor',  name: 'Декор',       icon: 'decor' },
  { key: 'plants', name: 'Растения',    icon: 'seed' },
  { key: 'food',   name: 'Еда',         icon: 'food' },
  { key: 'res',    name: 'Ресурсы',     icon: 'wood' },
];

// Разделы на вкладке «Продать» рынка (инструменты, постройки и декор не продаются)
export const SELL_TABS = ['all', 'plants', 'food', 'res'];

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
for (const g of Object.values(FLORA_GOODS)) ITEMS[g.key] = {
  key: g.key, name: g.name, icon: g.key, sell: g.sell, food: g.food,
  tabs: g.food ? ['food', 'plants'] : ['res'], desc: g.desc,
};
for (const f of Object.values(FLORA)) ITEMS[floraSeedId(f.key)] = {
  key: floraSeedId(f.key), name: (f.kind === 'tree' ? 'Саженец: ' : 'Отросток: ') + f.name.toLowerCase(), icon: floraSeedId(f.key), badge: 'seed', tabs: ['plants'], floraOf: f.key, sell: f.sapSell,
  desc: `Посадите на свободную траву. Вырастет ${f.name.toLowerCase()} за ${fmtMin(f.grow)}` + (f.pick ? ' и будет давать плоды.' : '.'),
};
for (const f of Object.values(FLORA)) ITEMS[floraOwnId(f.key)] = {
  key: floraOwnId(f.key), name: f.name + (f.kind === 'tree' ? ' (взрослое)' : ' (взрослый куст)'), icon: floraOwnId(f.key), tabs: ['plants'], floraOf: f.key, grown: true, sell: f.ownSell,
  desc: `Ваше выкопанное растение. Посадите на свободную траву — встанет сразу взрослым` + (f.pick ? `, первые плоды через ${fmtMin(f.regrow)}` : '') + '. Можно и в режиме «Переставить».',
};
// Еда из магазина: её не выращивают и не продают, зато она даёт больше энергии
export const SHOP_FOOD = {
  milk:  { name: 'Молоко',  food: 6,  price: 10, level: 1, desc: 'Свежее молоко из деревни.' },
  bread: { name: 'Хлеб',    food: 10, price: 18, level: 2, desc: 'Тёплый хлеб из пекарни.' },
  pie:   { name: 'Пирожок', food: 18, price: 35, level: 4, desc: 'Пирожок с яблоками, очень сытный.' },
};
// Дорожки (раздел «Декор»): покупаются на рынке (цена за одну клетку), ставятся в режиме «Переставить»
// и убираются обратно в рюкзак своим видом. Ключ — id предмета и вид клетки в сохранении.
// tile — плитка (assets/art, tools/path_tiles.py), dust — цвет пыли, когда клетку кладут, grassy — дорожка из травы с камнями: у соседних
// дорожек к ней травяной край, как к обычной траве. layer — кто сверху на стыке двух видов: вид выше
// заходит на соседний неровным краем с тенью (куски blend_<вид>_*, tools/path_tiles.py BLEND), так что
// между видами нет прямого шва. Песок — самый нижний, настил — сверху. Первая — вид по умолчанию: тропинки стартовой
// карты и старых сохранений. Порядок не менять: номер вида — индекс в PATH_KEYS (World.pathKind).
export const PATHS = {
  path:        { name: 'Тропинка',          tile: 'tile_path',        price: 4,  level: 2, layer: 2, dust: '#d9b98a', desc: 'Тропинка из светлых плоских камней.' },
  path_sand:   { name: 'Песчаная дорожка',  tile: 'tile_path_sand',   price: 2,  level: 1, layer: 1, dust: '#e6d2a2', desc: 'Утоптанный песок с мелкими камешками.' },
  path_planks: { name: 'Деревянный настил', tile: 'tile_path_planks', price: 6,  level: 3, layer: 4, dust: '#b98a58', desc: 'Дощатый настил, тёплый и уютный.' },
  path_stones: { name: 'Камни в траве',     tile: 'tile_path_stones', price: 8,  level: 4, grassy: true, dust: '#a9a594', desc: 'Плоские камни-ступеньки прямо в траве.' },
  path_cobble: { name: 'Булыжная мостовая', tile: 'tile_path_cobble', price: 12, level: 5, layer: 3, dust: '#9a9a96', desc: 'Мостовая из серого булыжника, как в старой деревне.' },
};
export const PATH_KEYS = Object.keys(PATHS);
export const DEFAULT_PATH = PATH_KEYS[0];
// Декор и постройки, убранные в рюкзак в режиме перестановки (place — как ставится обратно)
for (const [k, p] of Object.entries(PATHS)) ITEMS[k] = {
  key: k, name: p.name, icon: k, tabs: ['decor'], place: 'path', pathOf: k,
  desc: `${p.desc} Одна клетка дорожки: нажмите «Поставить» и выбирайте клетки на траве (или «Ещё» → «Переставить»).`,
};
// пруды: ставятся в режиме «Переставить» (нажмите на траву, где ему быть, — появится, как он встанет)
for (const [k, p] of Object.entries(PONDS)) ITEMS[k] = {
  key: k, name: p.name, icon: k, tabs: ['decor'], place: 'pond', pondOf: k,
  desc: `${p.desc} Ловите рыбу и набирайте воду для лейки. Нажмите «Поставить» и выберите место на траве.`,
};
for (const [t, d] of Object.entries(POND_DECOR)) ITEMS[pondDecorId(t)] = {
  key: pondDecorId(t), name: d.name, icon: pondDecorId(t), tabs: ['decor'], place: 'pondDecor', decorOf: t,
  desc: `${d.desc} Ставится только на воду пруда: нажмите «Поставить» и выберите клетку пруда.`,
};
for (const [k, f] of Object.entries(SHOP_FOOD)) ITEMS[k] = { key: k, name: f.name, icon: k, food: f.food, tabs: ['food'], desc: f.desc + ' Восстанавливает энергию.' };
// порядок «по умолчанию»: как в таблице (инструменты, урожай, рыба, семена, ресурсы)
let _ord = 0;
for (const it of Object.values(ITEMS)) it.order = _ord++;

// ---------------- Рынок: покупка ----------------
export const SHOP_TABS = [
  { key: 'food',  name: 'Еда',       icon: 'food' },
  { key: 'seeds', name: 'Семена',    icon: 'seed' },
  { key: 'trees', name: 'Саженцы',   icon: 'sap_apple' },
  { key: 'res',   name: 'Ресурсы',   icon: 'wood' },
  { key: 'build', name: 'Постройки', icon: 'build' },
  { key: 'decor', name: 'Декор',     icon: 'decor' },
];
// Товары: item — id из ITEMS, price — цена одной покупки, level — с какого уровня можно купить
export const SHOP = [];
// cur — валюта ('coins' или 'gems'), qty — сколько штук в одной покупке
for (const [k, f] of Object.entries(SHOP_FOOD)) SHOP.push({ tab: 'food', item: k, price: f.price, level: f.level });
for (const c of Object.values(CROPS)) SHOP.push({ tab: 'seeds', item: seedId(c.key), price: c.seed, level: c.level });
// Саженцы плодовых деревьев и кустов (FLORA с pick) — только здесь: на карте и в дикой поросли их нет.
// level — с какого уровня игрока продаётся (до него в магазине серым «с N ур.»). Окупаются за несколько сборов,
// зато плодоносят без конца; кусты дешевле и растут быстрее, деревья дают больше.
export const SAPLING_SHOP = {
  rosehip:   { price: 20, level: 2 },
  raspberry: { price: 30, level: 3 },
  blueberry: { price: 35, level: 4 },
  cherry:    { price: 60, level: 5 },
  apple:     { price: 75, level: 6 },
};
for (const [sp, o] of Object.entries(SAPLING_SHOP)) if (FLORA[sp] && FLORA[sp].pick) SHOP.push({ tab: 'trees', item: floraSeedId(sp), price: o.price, level: o.level });
// Декор: дорожки, от дешёвых к дорогим
for (const [k, p] of Object.entries(PATHS).sort((a, b) => a[1].price - b[1].price)) SHOP.push({ tab: 'decor', item: k, price: p.price, level: p.level });
// украшения для прудов и пруды, тоже от дешёвых к дорогим
for (const [t, d] of Object.entries(POND_DECOR).sort((a, b) => a[1].price - b[1].price)) SHOP.push({ tab: 'decor', item: pondDecorId(t), price: d.price, level: d.level });
for (const [k, p] of Object.entries(PONDS).sort((a, b) => a[1].price - b[1].price)) SHOP.push({ tab: 'decor', item: k, price: p.price, level: p.level });
SHOP.push({ tab: 'res', item: 'stone', price: 4 });
SHOP.push({ tab: 'res', item: 'wood', price: 1, cur: 'gems', qty: 10 });
SHOP.push({ tab: 'res', item: 'ore', price: 1, cur: 'gems', qty: 3 });
