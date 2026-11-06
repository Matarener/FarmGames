-- Игровые таблицы. Все числа баланса — здесь (перенесено из src/game/data.js один в один).
local M = {}

-- Порядок важен (меню посадки, рынок): список ключей
M.CROP_KEYS = { 'carrot', 'wheat', 'beet', 'cabbage', 'tomato', 'corn', 'sunflower', 'pumpkin', 'strawberry', 'cotton' }
M.CROPS = {
	carrot     = { name = 'Морковь',   level = 1,  seed = 2,   time = 120,   sell = 5,   xp = 1,  food = 3 },
	wheat      = { name = 'Пшеница',   level = 2,  seed = 3,   time = 240,   sell = 8,   xp = 2,  food = 2 },
	beet       = { name = 'Свёкла',    level = 3,  seed = 5,   time = 480,   sell = 14,  xp = 3,  food = 4 },
	cabbage    = { name = 'Капуста',   level = 4,  seed = 8,   time = 900,   sell = 22,  xp = 4,  food = 5 },
	tomato     = { name = 'Помидор',   level = 5,  seed = 15,  time = 1800,  sell = 40,  xp = 7,  food = 6 },
	corn       = { name = 'Кукуруза',  level = 7,  seed = 25,  time = 3600,  sell = 70,  xp = 12, food = 8 },
	sunflower  = { name = 'Подсолнух', level = 8,  seed = 30,  time = 5400,  sell = 90,  xp = 15, food = 0 },
	pumpkin    = { name = 'Тыква',     level = 10, seed = 50,  time = 10800, sell = 160, xp = 25, food = 12 },
	strawberry = { name = 'Клубника',  level = 12, seed = 80,  time = 21600, sell = 280, xp = 40, food = 10 },
	cotton     = { name = 'Хлопок',    level = 14, seed = 100, time = 28800, sell = 360, xp = 50, food = 0 },
}
M.CROP_LIST = {}
for i, k in ipairs(M.CROP_KEYS) do M.CROPS[k].key = k; M.CROP_LIST[i] = M.CROPS[k] end

-- Рыба из пруда: хранится вместе с урожаем, её можно съесть или продать
M.FISH_KEYS = { 'fish_carp', 'fish_perch', 'fish_gold' }
M.FISH = {
	fish_carp  = { name = 'Карась',        chance = 60, sell = 4,  food = 3, xp = 1 },
	fish_perch = { name = 'Окунь',         chance = 30, sell = 8,  food = 5, xp = 2 },
	fish_gold  = { name = 'Золотая рыбка', chance = 10, sell = 40, food = 8, xp = 5 },
}
M.FISH_LIST = {}
for i, k in ipairs(M.FISH_KEYS) do M.FISH[k].key = k; M.FISH_LIST[i] = M.FISH[k] end
M.FISH_CATCH = 0.75 -- шанс, что рыба не сорвётся

-- Всё, что лежит в рюкзаке как еда/товар
M.GOODS = {}
M.GOODS_KEYS = {}
for _, k in ipairs(M.CROP_KEYS) do M.GOODS[k] = M.CROPS[k]; M.GOODS_KEYS[#M.GOODS_KEYS + 1] = k end
for _, k in ipairs(M.FISH_KEYS) do M.GOODS[k] = M.FISH[k]; M.GOODS_KEYS[#M.GOODS_KEYS + 1] = k end

M.RES_KEYS = { 'wood', 'stone', 'ore' }
M.RESOURCES = { wood = { name = 'Дерево' }, stone = { name = 'Камень' }, ore = { name = 'Руда' } }
M.RES_NAMES = { wood = 'Дерево', stone = 'Камень', ore = 'Руда', coins = 'Монеты', gems = 'Кристаллы' }
M.COST_ORDER = { 'wood', 'stone', 'ore', 'coins', 'gems' }

-- Препятствия: hp — число ударов, action — какой инструмент нужен.
M.OBJECTS = {
	oak     = { name = 'Дерево',  hp = 3, action = 'chop', drops = { wood = { 2, 4 } }, xp = 2, stump = true, seedChance = 0.1 },
	oak2    = { name = 'Дерево',  hp = 3, action = 'chop', drops = { wood = { 2, 4 } }, xp = 2, stump = true, seedChance = 0.1 },
	apple   = { name = 'Яблоня',  hp = 3, action = 'chop', drops = { wood = { 2, 3 } }, xp = 2, stump = true, seedChance = 0.25 },
	pine    = { name = 'Ель',     hp = 4, action = 'chop', drops = { wood = { 3, 5 } }, xp = 3, stump = true },
	stump   = { name = 'Пень',    hp = 2, action = 'chop', drops = { wood = { 1, 1 } }, xp = 1 },
	bush    = { name = 'Куст',    hp = 1, action = 'chop', drops = { wood = { 1, 1 } }, xp = 1, seedChance = 0.3 },
	berry   = { name = 'Куст',    hp = 1, action = 'chop', drops = { wood = { 1, 1 } }, xp = 1, seedChance = 0.5 },
	rock    = { name = 'Камень',  hp = 2, action = 'mine', drops = { stone = { 2, 4 } }, xp = 2, oreChance = 0.1, ore = { 1, 1 } },
	boulder = { name = 'Валун',   hp = 5, action = 'mine', drops = { stone = { 6, 9 } }, xp = 5, oreChance = 1, ore = { 1, 3 }, w = 2, h = 2 },
	house   = { name = 'Дом',     static = true, w = 2, h = 2 },
	well    = { name = 'Колодец', static = true },
}

-- Стоимость энергии за удар/действие
M.ENERGY = { chop = 1, mine = 1, dig = 2, water = 1, plant = 0, harvest = 0, fill = 0, fish = 1 }
M.ENERGY_REGEN_SEC = 120

-- HOUSE[1..5] (в JS индекс 1..5, нулевой пустой)
M.HOUSE = {
	{ energy = 30, can = 3, chunks = 3 },
	{ energy = 40, can = 4, chunks = 6,  cost = { wood = 20, stone = 10, coins = 50 } },
	{ energy = 55, can = 5, chunks = 10, cost = { wood = 60, stone = 40, coins = 300 } },
	{ energy = 75, can = 6, chunks = 16, cost = { wood = 150, stone = 80, ore = 20, coins = 1500 } },
	{ energy = 100, can = 8, chunks = 25, cost = { wood = 300, stone = 120, ore = 25, coins = 6000 } },
}

M.STORAGE = 999999
M.START = { coins = 50, gems = 5, energy = 30 }
-- Починка бабушкиного колодца: после него воду можно набирать у грядок
M.WELL_COST = { wood = 5, stone = 4, coins = 15 }

function M.xp_to_next(level) return math.floor(20 * level ^ 1.5 + 0.5) end

local function r5(v) return math.max(5, math.floor(v / 5 + 0.5) * 5) end
function M.expansion_cost(n)
	return { wood = r5(15 + 3.5 * (n - 1)), stone = r5(6 + 1.5 * (n - 1)), coins = r5(40 * 1.3 ^ (n - 1)) }
end

-- Улучшить дом можно, только открыв хотя бы один новый участок на текущем уровне
function M.house_need_chunks(level) return (M.HOUSE[level - 1] and M.HOUSE[level - 1].chunks or 1) + 1 end

M.GEM_SPEEDUP_SEC = 600 -- 1 кристалл ускоряет на 10 минут (минимум 1)

return M
