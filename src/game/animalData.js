// Животные: таблицы. Правила (кормление, рост, продукт) — animalRules.js, в игре — animals.js, корм делает
// Кормоцех (buildData.js: здание feedmill и его рецепты). Предметы, объекты и строки рынка из этих таблиц
// собирает data.js.
//
// Животное покупается на рынке (раздел «Животные») детёнышем и ставится из рюкзака на траву (placed.js), как
// декор: его можно переставить, повернуть в другую сторону и убрать в рюкзак. Стоит на месте; изредка делает
// короткое движение (moves), их можно выключить в настройках.
// У вида три стадии: детёныш, молодое, взрослое. Каждая стадия — свой тип объекта, предмет и картинка
// (animalType: animal_<вид>_baby, animal_<вид>_young, animal_<вид>; assets/art).
//
// Голодное животное кормят кормом feed: нажали — съело один корм и time[стадия] секунд ест. Детёныш и молодое
// после feeds[стадия] кормлений переходят на следующую стадию. Взрослое, доев, даёт продукт product × n (над
// ним пузырь), его забирают нажатием — и животное снова голодное. Голодное ждёт сколько угодно: ничего не теряет.
//   names — названия стадий, level — с какого уровня продаётся, price — цена детёныша (монеты),
//   xp — опыт за продукт; desc — для рынка и рюкзака.
//   moves — короткие движения по кругу (animals.js, только картинка, на правила не влияют): peck — клюёт,
//   graze — щиплет траву, sniff — принюхивается, breathe — вдох, shake — встряхивается, hop — подпрыгивает,
//   turn — оборачивается в другую сторону и через несколько секунд обратно.
export const ANIMALS = {
  chicken: {
    names: ['Цыплёнок', 'Молодка', 'Курица'], level: 4, price: 30, feed: 'feed_grain', feeds: [3, 3],
    time: [5 * 60, 10 * 60, 20 * 60], product: 'egg', n: 1, xp: 2,
    desc: 'Несёт яйца. Ест зерносмесь.', moves: ['peck', 'peck', 'shake', 'peck', 'hop', 'turn'],
  },
  rabbit: {
    names: ['Крольчонок', 'Молодой кролик', 'Кролик'], level: 4, price: 40, feed: 'feed_rabbit', feeds: [3, 3],
    time: [5 * 60, 10 * 60, 30 * 60], product: 'angora', n: 1, xp: 3,
    desc: 'Даёт мягкий ангорский пух. Ест кроличий корм.', moves: ['sniff', 'hop', 'sniff', 'breathe', 'turn'],
  },
  goose: {
    names: ['Гусёнок', 'Молодой гусь', 'Гусь'], level: 5, price: 60, feed: 'feed_grain', feeds: [3, 3],
    time: [10 * 60, 20 * 60, 40 * 60], product: 'goose_feather', n: 1, xp: 3,
    desc: 'Роняет белые перья для подушек. Ест зерносмесь.', moves: ['peck', 'shake', 'peck', 'breathe', 'turn'],
  },
  pig: {
    names: ['Поросёнок', 'Подсвинок', 'Свинья'], level: 6, price: 120, feed: 'feed_mash', feeds: [3, 4],
    time: [15 * 60, 30 * 60, 60 * 60], product: 'truffle', n: 1, xp: 5,
    desc: 'Находит под землёй трюфели. Ест мешанку.', moves: ['sniff', 'graze', 'breathe', 'sniff', 'turn'],
  },
  sheep: {
    names: ['Ягнёнок', 'Ярочка', 'Овца'], level: 7, price: 180, feed: 'feed_hay', feeds: [3, 4],
    time: [20 * 60, 40 * 60, 90 * 60], product: 'wool', n: 1, xp: 6,
    desc: 'Даёт пушистую шерсть. Ест сенной брикет.', moves: ['graze', 'breathe', 'shake', 'graze', 'turn'],
  },
  cow: {
    names: ['Телёнок', 'Тёлочка', 'Корова'], level: 8, price: 300, feed: 'feed_hay', feeds: [4, 4],
    time: [30 * 60, 60 * 60, 90 * 60], product: 'milk', n: 6, xp: 7,
    desc: 'Даёт парное молоко. Ест сенной брикет.', moves: ['graze', 'breathe', 'graze', 'shake', 'turn'],
  },
};
for (const [k, a] of Object.entries(ANIMALS)) a.key = k;

// Опыт за одно кормление и за то, что животное подросло (новая стадия)
export const FEED_XP = 1;
export const GROW_XP = [0, 3, 6];

// Тип объекта (он же предмет и картинка) стадии i вида sp: 0 — детёныш, 1 — молодое, 2 — взрослое
export const STAGE_SUFFIX = ['_baby', '_young', ''];
export const animalType = (sp, i) => 'animal_' + sp + STAGE_SUFFIX[i];

// Что дают взрослые животные (молоко — уже есть в data.js: еда из магазина). sell — цена продажи; color — цвет
// брызг, когда продукт забирают. Иконки — ic_<ключ>.
export const ANIMAL_GOODS = {
  egg:           { name: 'Яйцо',          sell: 15, color: '#f4e4c8', desc: 'Свежее куриное яйцо.' },
  angora:        { name: 'Ангорский пух', sell: 32, color: '#d9d4cf', desc: 'Нежный кроличий пух для тёплых варежек.' },
  goose_feather: { name: 'Гусиное перо',  sell: 30, color: '#ffffff', desc: 'Мягкое белое перо: из таких набивают подушки.' },
  truffle:       { name: 'Трюфель',       sell: 60, color: '#6b4a32', desc: 'Ароматный гриб, который свинья нашла под землёй. Очень дорогой!' },
  wool:          { name: 'Шерсть',        sell: 80, color: '#f6efe0', desc: 'Пушистая овечья шерсть: из неё прядут нитки.' },
};
for (const [k, g] of Object.entries(ANIMAL_GOODS)) g.key = k;
