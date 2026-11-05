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
  rock:    { name: 'Камень',  hp: 2, action: 'mine', drops: { stone: [1, 2] }, xp: 2 },
  boulder: { name: 'Валун',   hp: 5, action: 'mine', drops: { stone: [4, 6] }, xp: 5, oreChance: 0.6, w: 2, h: 2 },
  house:   { name: 'Дом',     static: true, w: 2, h: 2 },
};

// Стоимость энергии за удар/действие
export const ENERGY = { chop: 1, mine: 1, dig: 2, water: 1, plant: 0, harvest: 0, fill: 0, fish: 1 };
export const ENERGY_REGEN_SEC = 120;

export const HOUSE = [
  null,
  { energy: 30, storage: 50,  can: 3, chunks: 3 },
  { energy: 40, storage: 100, can: 4, chunks: 6,  cost: { wood: 20, stone: 10, coins: 50 } },
  { energy: 55, storage: 200, can: 5, chunks: 10, cost: { wood: 60, stone: 40, coins: 300 } },
  { energy: 75, storage: 350, can: 6, chunks: 16, cost: { wood: 150, stone: 120, ore: 20, coins: 1500 } },
  { energy: 100, storage: 500, can: 8, chunks: 25, cost: { wood: 300, stone: 300, ore: 80, coins: 6000 } },
];

export const START = { coins: 50, gems: 5, energy: 30 };

export function xpToNext(level) { return Math.round(20 * Math.pow(level, 1.5)); }

const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);
export function expansionCost(n) {
  // n — порядковый номер покупаемого участка (1, 2, ...)
  return { wood: r5(15 * Math.pow(1.5, n - 1)), stone: r5(8 * Math.pow(1.5, n - 1)), coins: r5(40 * Math.pow(1.6, n - 1)) };
}

export const GEM_SPEEDUP_SEC = 600; // 1 кристалл ускоряет на 10 минут (минимум 1)
