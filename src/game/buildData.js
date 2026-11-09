// Здания с крафтом: таблицы. Правила (стройка, очередь крафта) — buildRules.js, в игре — buildings.js,
// окна — UI.craftPanel. Предметы (чертежи, товары) и строки магазина из этих таблиц собирает data.js.
//
// Каждое здание одно на ферму и занимает w×h клеток, как дом. Чертёж (bp_<здание>) покупается на рынке
// в «Постройках» за blueprint монет с уровня level. С чертежом в рюкзаке здание ставится на свободную
// траву: материалы cost списываются, и time секунд на месте стоят леса (спрайт стройки). Потом в здании
// можно делать товары по рецептам RECIPES, по одному за раз, в очереди до slots мест.
// sprite — картинка готового здания, site — его же стройка в лесах (assets/art), xp — опыт за постройку.
export const BUILDINGS = {
  kitchen: {
    name: 'Кухня', level: 3, blueprint: 50, cost: { wood: 20, stone: 15 }, time: 5 * 60, xp: 10, slots: 3, w: 2, h: 2,
    sprite: 'building_kitchen', site: 'site_kitchen', verb: 'Приготовить',
    desc: 'Готовит блюда из урожая, рыбы и ягод: они дают больше энергии, чем продукты по отдельности.',
  },
  carpentry: {
    name: 'Столярная мастерская', short: 'Столярная', level: 4, blueprint: 80, cost: { wood: 30, stone: 10 }, time: 10 * 60, xp: 15, slots: 3, w: 2, h: 2,
    sprite: 'building_carpentry', site: 'site_carpentry', verb: 'Сделать',
    desc: 'Пилит доски для новых построек, кладёт деревянный настил и мастерит поделки из шишек, желудей и берёсты.',
  },
  forge: {
    name: 'Кузница', level: 5, blueprint: 150, cost: { planks: 10, stone: 25, ore: 4 }, time: 20 * 60, xp: 20, slots: 3, w: 2, h: 2,
    sprite: 'building_forge', site: 'site_forge', verb: 'Выковать',
    desc: 'Плавит руду в слитки и куёт из них гвозди и подковы.',
  },
  stonecutter: {
    name: 'Камнерезная мастерская', short: 'Камнерезная', level: 6, blueprint: 200, cost: { planks: 12, nails: 10, stone: 15 }, time: 30 * 60, xp: 25, slots: 3, w: 2, h: 2,
    sprite: 'building_stonecutter', site: 'site_stonecutter', verb: 'Вытесать',
    desc: 'Тешет из камня блоки, мостовую и камни для дорожек.',
  },
};
for (const [k, b] of Object.entries(BUILDINGS)) b.key = k;

// Новые товары зданий (их иконки — ic_<ключ>). food — энергия (можно съесть), sell — цена продажи
// (без sell не продаётся, как дерево), tab — раздел рюкзака. Хлеб, пирожок и дорожки — уже есть в data.js.
export const CRAFT_GOODS = {
  carrot_salad:     { name: 'Морковный салат',     tab: 'food', food: 14, sell: 18,  desc: 'Тёртая морковка с зеленью.' },
  linden_tea:       { name: 'Липовый чай',         tab: 'food', food: 8,  sell: 10,  desc: 'Душистый чай из липового цвета.' },
  fish_soup:        { name: 'Уха',                 tab: 'food', food: 16, sell: 18,  desc: 'Наваристая уха из карасей.' },
  raspberry_jam:    { name: 'Малиновое варенье',   tab: 'food', food: 12, sell: 16,  desc: 'Баночка густого малинового варенья.' },
  borscht:          { name: 'Борщ',                tab: 'food', food: 26, sell: 110, desc: 'Бабушкин борщ со сметаной.' },
  pumpkin_porridge: { name: 'Тыквенная каша',      tab: 'food', food: 32, sell: 190, desc: 'Сладкая каша прямо в тыкве.' },
  strawberry_cake:  { name: 'Клубничный торт',     tab: 'food', food: 55, sell: 950, desc: 'Праздничный торт со сливками и клубникой.' },
  planks:           { name: 'Доски',               tab: 'res',               desc: 'Ровные доски из столярной. Нужны для новых построек.' },
  iron_ingot:       { name: 'Железный слиток',     tab: 'res',               desc: 'Слиток из кузницы. Из него куют гвозди и подковы.' },
  nails:            { name: 'Гвозди',              tab: 'res',               desc: 'Крепкие гвозди из кузницы. Нужны для построек и ящиков.' },
  stone_block:      { name: 'Каменный блок',       tab: 'res',               desc: 'Ровный тёсаный блок из камнерезной.' },
  birch_box:        { name: 'Берестяной туесок',   tab: 'res', sell: 14,     desc: 'Лёгкая коробочка из берёсты. Хорошо продаётся.' },
  acorn_toy:        { name: 'Желудёвый человечек', tab: 'res', sell: 16,     desc: 'Забавная игрушка из желудей и веточек.' },
  pine_wreath:      { name: 'Шишечный венок',      tab: 'res', sell: 22,     desc: 'Венок из шишек и кленовых листьев.' },
  crate:            { name: 'Деревянный ящик',     tab: 'res', sell: 40,     desc: 'Крепкий ящик на гвоздях.' },
  horseshoe:        { name: 'Подкова на счастье',  tab: 'res', sell: 35,     desc: 'Блестящая подкова. Говорят, приносит удачу.' },
  millstone:        { name: 'Жернов',              tab: 'res', sell: 60,     desc: 'Тяжёлый каменный жернов. Пригодится для мельницы.' },
};

// Рецепты. Ключ — id рецепта; at — здание, level — с какого уровня игрока, need — что уходит
// (id из ITEMS: сколько), item × n — что получится, time — секунд, xp — опыт, когда товар забрали.
// Порядок в окне здания — как здесь.
export const RECIPES = {
  // кухня
  carrot_salad:     { at: 'kitchen', level: 3,  need: { carrot: 3 }, item: 'carrot_salad', n: 1, time: 120, xp: 2 },
  bread:            { at: 'kitchen', level: 3,  need: { wheat: 2 }, item: 'bread', n: 1, time: 180, xp: 2 },
  linden_tea:       { at: 'kitchen', level: 3,  need: { linden_blossom: 2 }, item: 'linden_tea', n: 1, time: 120, xp: 1 },
  fish_soup:        { at: 'kitchen', level: 3,  need: { fish_carp: 2, carrot: 1 }, item: 'fish_soup', n: 1, time: 300, xp: 3 },
  raspberry_jam:    { at: 'kitchen', level: 4,  need: { raspberry: 4 }, item: 'raspberry_jam', n: 1, time: 600, xp: 3 },
  borscht:          { at: 'kitchen', level: 5,  need: { beet: 2, cabbage: 1, tomato: 1 }, item: 'borscht', n: 1, time: 900, xp: 5 },
  pie:              { at: 'kitchen', level: 6,  need: { apple: 2, wheat: 2 }, item: 'pie', n: 1, time: 900, xp: 4 },
  pumpkin_porridge: { at: 'kitchen', level: 10, need: { pumpkin: 1, milk: 1 }, item: 'pumpkin_porridge', n: 1, time: 1800, xp: 8 },
  strawberry_cake:  { at: 'kitchen', level: 12, need: { strawberry: 3, wheat: 2, milk: 1 }, item: 'strawberry_cake', n: 1, time: 3600, xp: 12 },
  // столярная
  planks:           { at: 'carpentry', level: 4, need: { wood: 3 }, item: 'planks', n: 2, time: 120, xp: 1 },
  path_planks:      { at: 'carpentry', level: 4, need: { planks: 1 }, item: 'path_planks', n: 2, time: 60, xp: 1 },
  birch_box:        { at: 'carpentry', level: 4, need: { birch_bark: 3 }, item: 'birch_box', n: 1, time: 300, xp: 2 },
  acorn_toy:        { at: 'carpentry', level: 4, need: { acorn: 5 }, item: 'acorn_toy', n: 1, time: 300, xp: 2 },
  pine_wreath:      { at: 'carpentry', level: 4, need: { pinecone: 4, maple_leaf: 2 }, item: 'pine_wreath', n: 1, time: 600, xp: 3 },
  crate:            { at: 'carpentry', level: 5, need: { planks: 4, nails: 4 }, item: 'crate', n: 1, time: 900, xp: 4 },
  // кузница
  iron_ingot:       { at: 'forge', level: 5, need: { ore: 2, wood: 2 }, item: 'iron_ingot', n: 1, time: 300, xp: 3 },
  nails:            { at: 'forge', level: 5, need: { iron_ingot: 1 }, item: 'nails', n: 8, time: 180, xp: 1 },
  horseshoe:        { at: 'forge', level: 5, need: { iron_ingot: 1 }, item: 'horseshoe', n: 1, time: 600, xp: 3 },
  // камнерезная
  stone_block:      { at: 'stonecutter', level: 6, need: { stone: 4 }, item: 'stone_block', n: 1, time: 180, xp: 1 },
  path_cobble:      { at: 'stonecutter', level: 6, need: { stone: 3 }, item: 'path_cobble', n: 2, time: 120, xp: 1 },
  path_stones:      { at: 'stonecutter', level: 6, need: { stone: 1 }, item: 'path_stones', n: 1, time: 60, xp: 1 },
  millstone:        { at: 'stonecutter', level: 6, need: { stone_block: 3 }, item: 'millstone', n: 1, time: 1200, xp: 5 },
};
for (const [k, r] of Object.entries(RECIPES)) r.key = k;

export const bpId = (k) => 'bp_' + k;   // чертёж здания k в рюкзаке
export const bldId = (k) => 'bld_' + k; // готовое здание, убранное в рюкзак
