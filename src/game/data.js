// Игровые таблицы. Все числа баланса — здесь (здания с крафтом — в buildData.js).

import { BUILDINGS, CRAFT_GOODS, bpId, bldId } from './buildData.js';

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
// hp — прочность: сколько ударов топором нужно, чтобы срубить (одно нажатие игрока — один удар, chop.js);
// чем крупнее растение, тем крепче: ель и дуб 5, липа, берёза, клён 4, сакура и плодовые 3, кусты 2.
// grow — сколько секунд растёт посаженное игроком семя до взрослого растения.
// sapSell — цена продажи саженца (ниже цены в магазине SAPLING_SHOP, чтобы не было перепродажи).
// ownSell — цена продажи выкопанного взрослого растения (тоже ниже цены саженца в магазине).
export const FLORA = {
  oak:       { name: 'Дуб',       kind: 'tree', fruit: 'acorn',        n: [1, 3], wood: [2, 4], hp: 5, xp: 2, seedChop: 0.25, sapSell: 6, ownSell: 18, grow: 3 * 3600 },
  birch:     { name: 'Берёза',    kind: 'tree', fruit: 'birch_bark',   n: [1, 2], wood: [2, 4], hp: 4, xp: 2, seedChop: 0.25, sapSell: 6, ownSell: 18, grow: 3 * 3600 },
  sakura:    { name: 'Сакура',    kind: 'tree', fruit: 'sakura_petal', n: [2, 4], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 10, ownSell: 30, grow: 4 * 3600 },
  cherry:    { name: 'Вишня',     kind: 'tree', fruit: 'cherry',       n: [2, 4], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 15, ownSell: 45, grow: 4 * 3600, pick: true, regrow: 3 * 3600 },
  maple:     { name: 'Клён',      kind: 'tree', fruit: 'maple_leaf',   n: [2, 3], wood: [2, 4], hp: 4, xp: 2, seedChop: 0.25, sapSell: 8, ownSell: 24, grow: 3 * 3600 },
  apple:     { name: 'Яблоня',    kind: 'tree', fruit: 'apple',        n: [2, 4], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 18, ownSell: 54, grow: 4 * 3600, pick: true, regrow: 3 * 3600 },
  pine:      { name: 'Ель',       kind: 'tree', fruit: 'pinecone',     n: [1, 3], wood: [3, 5], hp: 5, xp: 3, seedChop: 0.25, sapSell: 6, ownSell: 18, grow: 3 * 3600 },
  linden:    { name: 'Липа',      kind: 'tree', fruit: 'linden_blossom', n: [2, 3], wood: [2, 4], hp: 4, xp: 2, seedChop: 0.25, sapSell: 8, ownSell: 24, grow: 3 * 3600 },
  // плодовые деревья из магазина (2026-11-09): чем выше уровень, тем дороже плоды, дольше рост и реже урожай
  bird_cherry: { name: 'Черёмуха', kind: 'tree', fruit: 'bird_cherry', n: [3, 5], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 22, ownSell: 66, grow: 4 * 3600, pick: true, regrow: 2.5 * 3600 },
  plum:      { name: 'Слива',     kind: 'tree', fruit: 'plum',         n: [2, 4], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 27, ownSell: 81, grow: 5 * 3600, pick: true, regrow: 3 * 3600 },
  pear:      { name: 'Груша',     kind: 'tree', fruit: 'pear',         n: [2, 4], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 32, ownSell: 96, grow: 5 * 3600, pick: true, regrow: 3 * 3600 },
  apricot:   { name: 'Абрикос',   kind: 'tree', fruit: 'apricot',      n: [2, 4], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 42, ownSell: 126, grow: 6 * 3600, pick: true, regrow: 4 * 3600 },
  persimmon: { name: 'Хурма',     kind: 'tree', fruit: 'persimmon',    n: [2, 3], wood: [2, 3], hp: 3, xp: 2, seedChop: 0.25, sapSell: 55, ownSell: 165, grow: 6 * 3600, pick: true, regrow: 5 * 3600 },
  blueberry: { name: 'Голубика',  kind: 'bush', fruit: 'blueberry',    n: [2, 4], wood: [1, 1], hp: 2, xp: 1, seedChop: 0.35, sapSell: 9, ownSell: 27, grow: 3600,     pick: true, regrow: 1.5 * 3600 },
  raspberry: { name: 'Малина',    kind: 'bush', fruit: 'raspberry',    n: [2, 4], wood: [1, 1], hp: 2, xp: 1, seedChop: 0.35, sapSell: 8, ownSell: 24, grow: 3600,     pick: true, regrow: 1.5 * 3600 },
  rosehip:   { name: 'Шиповник',  kind: 'bush', fruit: 'rosehip',      n: [2, 3], wood: [1, 1], hp: 2, xp: 1, seedChop: 0.35, sapSell: 5, ownSell: 15, grow: 3600,     pick: true, regrow: 2 * 3600 },
  hydrangea: { name: 'Гортензия', kind: 'bush', fruit: 'hydrangea',    n: [1, 2], wood: [1, 1], hp: 2, xp: 1, seedChop: 0.35, sapSell: 6, ownSell: 18, grow: 3600 },
  lavender:  { name: 'Лаванда',   kind: 'bush', fruit: 'lavender',     n: [2, 3], wood: [1, 1], hp: 2, xp: 1, seedChop: 0.35, sapSell: 6, ownSell: 18, grow: 3600 },
  rose:      { name: 'Роза',      kind: 'bush', fruit: 'rose_petal',   n: [2, 3], wood: [1, 1], hp: 2, xp: 1, seedChop: 0.35, sapSell: 7, ownSell: 21, grow: 3600 },
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
  bird_cherry:  { name: 'Черёмуха',        sell: 4, food: 1, color: '#2e2333', desc: 'Терпкие ягоды черёмухи. Можно съесть или продать.' },
  plum:         { name: 'Слива',           sell: 7, food: 3, color: '#5b3f8f', desc: 'Спелая слива. Можно съесть или продать.' },
  pear:         { name: 'Груша',           sell: 8, food: 4, color: '#c9cf4a', desc: 'Сочная груша. Можно съесть или продать.' },
  apricot:      { name: 'Абрикос',         sell: 11, food: 5, color: '#f29a3a', desc: 'Сладкий абрикос. Можно съесть или продать.' },
  persimmon:    { name: 'Хурма',           sell: 18, food: 7, color: '#ec6a1c', desc: 'Медовая хурма. Можно съесть или продать.' },
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

// Препятствия: hp — прочность (сколько ударов, одно нажатие — один удар, chop.js), action — какой инструмент нужен.
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
// Здания с крафтом (buildData.js): свои постройки игрока, ставятся из рюкзака; item — предмет, которым
// здание убирается в рюкзак
for (const b of Object.values(BUILDINGS)) OBJECTS[b.key] = { name: b.name, static: true, w: b.w, h: b.h, building: b.key, item: bldId(b.key) };

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
export const ENERGY = { chop: 1, mine: 1, water: 1, plant: 0, harvest: 0, fill: 0, fish: 1, pick: 1, sow: 0, mow: 0 };
// Очередь дел призрачка: сколько дел можно поставить, кроме того, что он делает сейчас
// (удары по одному дереву или камню — одно дело)
export const QUEUE_MAX = 20;
export const ENERGY_REGEN_SEC = 120;

// Уровни дома: energy — запас энергии, can — поливов в лейке, chunks — сколько участков можно открыть,
// cost — цена улучшения до этого уровня, time — сколько секунд дом стоит в лесах (houseRules.js)
export const HOUSE = [
  null,
  { energy: 30, can: 3, chunks: 3 },
  { energy: 40, can: 4, chunks: 6,  cost: { wood: 20, stone: 10, coins: 50 }, time: 3 * 60 },
  { energy: 55, can: 5, chunks: 10, cost: { wood: 60, stone: 40, coins: 300 }, time: 20 * 60 },
  { energy: 75, can: 6, chunks: 16, cost: { wood: 150, stone: 80, ore: 20, coins: 1500 }, time: 60 * 60 },
  { energy: 100, can: 8, chunks: 25, cost: { wood: 300, stone: 120, ore: 25, coins: 6000 }, time: 3 * 60 * 60 },
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
for (const [k, r] of Object.entries(RESOURCES)) ITEMS[k] = { key: k, name: r.name, icon: k, tabs: ['res'], desc: 'Нужно для улучшения дома, построек и новых участков.' };
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
// Поливалки (раздел «Постройки»): свои постройки на одну клетку травы (placed.js). Покупаются на рынке,
// ставятся из рюкзака и поливают грядки вокруг себя сами, как только те просят воды (sprinklers.js).
// area — какие клетки вокруг: 'cross' — по r клеток в четыре стороны, 'square' — квадрат со стороной 2r+1
// (без самой поливалки). Ключ — тип объекта на карте, id предмета и имя картинки (assets/art).
export const SPRINKLERS = {
  sprinkler_drip: { name: 'Капельница',  area: 'cross',  r: 1, price: 60,  level: 3, desc: 'Простая поливалка: поливает 4 соседние клетки.' },
  sprinkler_spin: { name: 'Вертушка',    area: 'square', r: 1, price: 250, level: 6, desc: 'Крутится и поливает 8 клеток вокруг себя.' },
  sprinkler_rain: { name: 'Дождеватель', area: 'square', r: 2, price: 900, level: 9, desc: 'Большая поливалка: поливает 24 клетки, квадрат 5×5.' },
};
for (const [k, s] of Object.entries(SPRINKLERS)) {
  s.key = k;
  OBJECTS[k] = { name: s.name, static: true, item: k, sprinkler: k };
  ITEMS[k] = {
    key: k, name: s.name, icon: k, tabs: ['build'], place: 'obj', objOf: k,
    desc: `${s.desc} Грядки рядом поливаются сами, даже когда игра закрыта. Ставится на траву: «Поставить» (или «Ещё» → «Переставить»).`,
  };
}
// Декор (раздел «Декор»): фонари, лавочки, столики — свои вещи на траве (placed.js), как поливалки.
// Ключ — тип объекта, id предмета и имя картинки (assets/art). w × h — клетки в положении 0 (по умолчанию 1 × 1).
// rot — сколько положений у поворота («Повернуть» в «Переставить»): 1 — симметричная вещь, не поворачивается;
// 2 — спереди и сзади одинакова: положение 1 — зеркало картинки; 4 — ещё и вид сзади (картинка <ключ>_back),
// положение 2 — он, 3 — его зеркало. В нечётных положениях у вещи не 1 × 1 ширина и высота меняются местами
// (зеркало изометрии — это перестановка осей gx и gy). Картинка в положении 0: длинная сторона — вдоль gx
// (на экране от левого верхнего угла к правому нижнему), лицом к зрителю — к соседу gy + 1 (вниз-влево).
export const DECOR = {
  decor_lantern:    { name: 'Садовый фонарик',     price: 20,  level: 2, rot: 1, desc: 'Маленький фонарик на колышке, светит у дорожки.' },
  decor_bench:      { name: 'Лавочка',             price: 30,  level: 2, rot: 2, desc: 'Простая деревянная лавочка без спинки.' },
  decor_table:      { name: 'Круглый столик',      price: 40,  level: 3, rot: 1, desc: 'Круглый садовый столик на одной ножке.' },
  decor_lamp:       { name: 'Уличный фонарь',      price: 60,  level: 4, rot: 1, desc: 'Высокий чугунный фонарь, как на старой улице.' },
  decor_hook_lamp:  { name: 'Фонарь на крюке',     price: 90,  level: 5, rot: 2, desc: 'Деревянный столбик с фонарём на изогнутом крюке.' },
  decor_park_bench: { name: 'Скамейка со спинкой', price: 100, level: 5, rot: 4, w: 2, desc: 'Длинная скамейка со спинкой, на ней поместятся двое.' },
  decor_stone_lamp: { name: 'Каменный фонарь',     price: 120, level: 6, rot: 1, desc: 'Каменный садовый фонарь, хорош рядом с сакурой.' },
  decor_table_set:  { name: 'Столик со стульями',  price: 150, level: 7, rot: 2, w: 2, desc: 'Квадратный столик и два стула: можно пить чай в саду.' },
};
// Заборы (раздел «Декор»): секция на клетку травы, цена — за секцию. Ставятся нажатиями по клеткам, как дорожки
// (Mover.pave), соседние секции (и разных видов) соединяются сами: у клетки столбик и пролёты на полклетки к соседям-заборам
// (картинки <ключ>_post и <ключ>_span, Farm.fenceSprite). Не поворачиваются.
export const FENCES = {
  fence_wattle: { name: 'Плетень',         price: 3, level: 2, desc: 'Плетёный забор из ивовых прутьев.' },
  fence_picket: { name: 'Штакетник',       price: 5, level: 3, desc: 'Белый деревянный штакетник.' },
  fence_stone:  { name: 'Каменная ограда', price: 8, level: 5, desc: 'Низкая ограда из камней.' },
};
for (const [k, d] of Object.entries(DECOR)) {
  d.key = k;
  OBJECTS[k] = { name: d.name, static: true, item: k, deco: k, w: d.w || 1, h: d.h || 1, rot: d.rot || 1 };
  ITEMS[k] = {
    key: k, name: d.name, icon: k, tabs: ['decor'], place: 'obj', objOf: k,
    desc: `${d.desc} Ставится на траву: «Поставить» (или «Ещё» → «Переставить»)` + (d.rot > 1 ? ', там же — «Повернуть».' : '.'),
  };
}
for (const [k, d] of Object.entries(FENCES)) {
  d.key = k;
  OBJECTS[k] = { name: d.name, static: true, item: k, fence: k };
  ITEMS[k] = {
    key: k, name: d.name, icon: k, tabs: ['decor'], place: 'obj', objOf: k, brush: true,
    desc: `${d.desc} Одна секция: нажмите «Поставить» и выбирайте клетки на траве, соседние секции соединятся сами.`,
  };
}
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
// Товары зданий с крафтом, чертежи и убранные в рюкзак здания (buildData.js)
for (const [k, g] of Object.entries(CRAFT_GOODS)) ITEMS[k] = {
  key: k, name: g.name, icon: k, sell: g.sell, food: g.food, tabs: [g.tab], craft: true,
  desc: g.desc + (g.food ? ' Восстанавливает энергию.' : ''),
};
// иконки чертежа и здания делает artSprites из картинки здания (bp_ — со значком чертежа)
for (const b of Object.values(BUILDINGS)) {
  ITEMS[bpId(b.key)] = {
    key: bpId(b.key), name: 'Чертёж: ' + (b.short || b.name).toLowerCase(), icon: bldId(b.key), badge: 'blueprint', tabs: ['build'],
    place: 'obj', objOf: b.key, blueprint: b.key, placeName: `Стройка: ${(b.short || b.name).toLowerCase()}`,
    desc: `${b.desc} Нажмите «Построить» и выберите место: материалы спишутся, и начнётся стройка.`,
  };
  ITEMS[bldId(b.key)] = {
    key: bldId(b.key), name: b.name, icon: bldId(b.key), tabs: ['build'], place: 'obj', objOf: b.key, building: b.key,
    desc: `${b.desc} Здание убрано в рюкзак: поставьте его обратно, и оно снова заработает.`,
  };
}
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
  bird_cherry: { price: 90, level: 7 },
  plum:      { price: 110, level: 8 },
  pear:      { price: 130, level: 9 },
  apricot:   { price: 170, level: 11 },
  persimmon: { price: 220, level: 13 },
};
for (const [sp, o] of Object.entries(SAPLING_SHOP)) if (FLORA[sp] && FLORA[sp].pick) SHOP.push({ tab: 'trees', item: floraSeedId(sp), price: o.price, level: o.level });
// Декор: дорожки, от дешёвых к дорогим
for (const [k, p] of Object.entries(PATHS).sort((a, b) => a[1].price - b[1].price)) SHOP.push({ tab: 'decor', item: k, price: p.price, level: p.level });
// Постройки: поливалки
for (const [k, s] of Object.entries(SPRINKLERS)) SHOP.push({ tab: 'build', item: k, price: s.price, level: s.level });
// украшения для прудов и пруды, тоже от дешёвых к дорогим
for (const [t, d] of Object.entries(POND_DECOR).sort((a, b) => a[1].price - b[1].price)) SHOP.push({ tab: 'decor', item: pondDecorId(t), price: d.price, level: d.level });
for (const [k, p] of Object.entries(PONDS).sort((a, b) => a[1].price - b[1].price)) SHOP.push({ tab: 'decor', item: k, price: p.price, level: p.level });
// фонари, лавочки, столики и заборы (цена забора — за секцию)
for (const [k, d] of Object.entries({ ...FENCES, ...DECOR })) SHOP.push({ tab: 'decor', item: k, price: d.price, level: d.level });
SHOP.push({ tab: 'res', item: 'stone', price: 4 });
SHOP.push({ tab: 'res', item: 'wood', price: 1, cur: 'gems', qty: 10 });
SHOP.push({ tab: 'res', item: 'ore', price: 1, cur: 'gems', qty: 3 });
// Чертежи зданий с крафтом: каждое здание одно на ферму (купить второй чертёж нельзя — buildRules.js)
for (const b of Object.values(BUILDINGS)) SHOP.push({ tab: 'build', item: bpId(b.key), price: b.blueprint, level: b.level, once: true });

// ---------------- Грядки и колодец в рюкзаке ----------------
// Грядки не копают: их покупают на рынке (раздел «Постройки», цена растёт с каждой грядкой, предел — по уровню)
// и получают за задания. Грядка — предмет BED_ITEM: «Поставить» кладёт её на траву, как дорожку, без энергии.
// Пустую грядку и починенный колодец можно убрать в рюкзак (режим «Переставить», по одной или «Убрать всё»)
// и поставить обратно (beds.js, well.js). Продать нельзя; колодец один, в магазине его нет.
export const BED_ITEM = 'bed';
export const WELL_ITEM = 'well';
ITEMS[BED_ITEM] = {
  key: BED_ITEM, name: 'Грядка', icon: BED_ITEM, tabs: ['build'], place: 'bed', order: _ord++,
  desc: 'Готовая грядка: копать не нужно. Нажмите «Поставить» и выбирайте клетки на траве, каждое нажатие — новая грядка.',
};
ITEMS[WELL_ITEM] = {
  key: WELL_ITEM, name: 'Колодец', icon: WELL_ITEM, tabs: ['build'], place: 'well', order: _ord++,
  desc: 'Ваш колодец: в нём всегда есть вода для лейки. Нажмите «Поставить» и выберите место на траве.',
};

// Покупка грядок (beds.js: bedLimit, bedPrice, buyBed). Считаются все свои грядки: на ферме и в рюкзаке.
//   limit — сколько грядок можно купить на уровне: base + perLevel × уровень, но не больше max. Предел мешает
//           только покупке: грядки за задания даются и сверх него, а у старых сохранений остаются все вскопанные.
//   price — цена следующей грядки: [до какой по счёту грядки, цена]. 3-я и 4-я — по 10 монет, 5-я и 6-я — по 20…
//           Дальше последней строки — её цена.
export const BEDS = {
  limit: { base: 2, perLevel: 2, max: 40 },
  price: [[4, 10], [6, 20], [8, 35], [10, 50], [12, 75], [16, 100], [20, 150], [30, 250], [40, 400]],
};
// На рынке грядка первая в «Постройках»: цена и предел у неё свои (beds.js bedOffer), price здесь — для сортировки
SHOP.unshift({ tab: 'build', item: BED_ITEM, price: BEDS.price[0][1], level: 1, bed: true });

// ---------------- «Убрать всё своё в рюкзак» ----------------
// Кнопка «Убрать всё» в режиме «Переставить» (storeAll.js): что можно убрать в рюкзак разом. Порядок — строки
// окна подтверждения; on — переключатель включён, когда окно открылось; word — как назвать в итоговой надписи
// (1, 2, 5 штук). Дом не убирается, грядки с посадками и сломанный колодец — тоже, дикая природа — не своя.
export const STORE_ALL = [
  { key: 'paths',   name: 'Дорожки',              icon: 'path',           on: true,  word: ['дорожка', 'дорожки', 'дорожек'],    note: 'Все клетки, вид сохраняется' },
  { key: 'beds',    name: 'Пустые грядки',        icon: BED_ITEM,         on: true,  word: ['грядка', 'грядки', 'грядок'],        note: 'Грядки, где что-то растёт, остаются на месте' },
  { key: 'ponds',   name: 'Пруды',                icon: 'pond_round',     on: true,  word: ['пруд', 'пруда', 'прудов'],           note: 'Вместе с камышом, рогозом и камнями' },
  { key: 'decor',   name: 'Декор и заборы',       icon: 'decor',          on: true,  word: ['вещь декора', 'вещи декора', 'вещей декора'], note: 'Фонари, лавочки, столики, секции заборов' },
  { key: 'well',    name: 'Колодец',              icon: WELL_ITEM,        on: true,  word: ['колодец', 'колодца', 'колодцев'],    note: 'Если он уже починен' },
  { key: 'plants',  name: 'Свои деревья и кусты', icon: 'own_apple',      on: true,  word: ['растение', 'растения', 'растений'], note: 'Висящие плоды сразу соберутся в рюкзак' },
  { key: 'placed',  name: 'Постройки',            icon: 'sprinkler_drip', on: true,  word: ['постройка', 'постройки', 'построек'], note: 'Поливалки и другие свои постройки' },
  { key: 'sprouts', name: 'Растущие ростки',      icon: 'sap_oak',        on: false, word: ['росток', 'ростка', 'ростков'],      note: 'Вернутся саженцами и начнут расти заново' },
];
