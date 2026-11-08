// Таблицы заданий: сюжет и ветки, задания на день, неделю и месяц, события по датам.
// Только данные. Правила (счёт, награды, смена дня) — в questRules.js.
//
// Задание: { id, title, who, text, task, goal | goals, reward, level?, life? }
//   id     — постоянный ключ (в сохранении); title и порядок можно менять, сохранения не сломаются
//   who    — 'ghost' говорит призрачок, 'note' — записка бабушки Марфы
//   goal   — { ev, key?, group?, n } — счётчик событий игры (Farm → quests.emit):
//            harvest, plant, water, fish, chop, stump, mine, dig, mow, pick, sow, sell, earn (монеты с рынка),
//            buy, expand. key — точный ключ (культура, рыба, вид дерева), group — группа ключей (GROUPS в questRules.js)
//            { state, n } — значение из состояния: house (уровень дома), well (колодец), level (уровень игрока)
//   goals  — несколько целей сразу: [{ ...goal, task }]
//   reward — { coins, gems, xp, items: { id: n } }; xp по умолчанию QUEST_XP
//   level  — задание откроется с этого уровня игрока
//   life   — засчитывать и то, что игрок сделал до задания (первые задания сюжета: деревья могли кончиться раньше)

export const QUEST_XP = 5;
// Сброс заданий дня, недели и месяца: по московскому времени (часов от UTC)
export const QUEST_TZ = 3;
// С какого уровня появляются задания дня, недели, месяца и события (не мешают обучению)
export const PERIODIC_LEVEL = 3;
// Сколько заданий игрок может закрепить на экране (карточки под ресурсами)
export const MAX_PINS = 3;
// Первые задания сюжета показывают стрелку сами (hints.js: HINT_AUTO)

// Ветки. after — задание, после которого ветка открывается (id); у сюжета нет условия.
export const LINES = [
  { key: 'story', name: 'Сюжет', icon: 'note' },
  { key: 'garden', name: 'Огород', icon: 'seed', after: 'story.water' },
  { key: 'fishing', name: 'Рыбалка', icon: 'fish', after: 'story.fishing' },
  { key: 'forest', name: 'Лес и сад', icon: 'axe', after: 'story.wood' },
  { key: 'build', name: 'Стройка', icon: 'house', after: 'story.well' },
  { key: 'trade', name: 'Торговля', icon: 'market', after: 'garden.first' },
];

export const QUESTS = {
  story: [
    {
      id: 'story.wake', title: 'Пробуждение', who: 'ghost', life: true,
      text: 'Ой… Где это я? Старый домик, заросший сад… Кажется, я здесь уже бывал! А на грядке выросла морковка. Надо её собрать!',
      task: 'Собери урожай с грядки', goal: { ev: 'harvest', n: 1 }, reward: { coins: 10 },
    },
    {
      id: 'story.note', title: 'Записка у порога', who: 'note', life: true,
      text: '«Мой милый призрачок! Раз ты читаешь это, значит, проснулся. Без меня ферма совсем заросла. Посади семена: земля помнит заботу. Твоя бабушка Марфа»',
      task: 'Посади 2 морковки', goal: { ev: 'plant', key: 'carrot', n: 2 }, reward: { coins: 10 },
    },
    {
      id: 'story.water', title: 'Водичка', who: 'ghost', life: true,
      text: 'Без воды ничего не вырастет. Наберу лейку в пруду и полью грядки!',
      task: 'Полей грядки 2 раза', goal: { ev: 'water', n: 2 }, reward: { coins: 10 },
    },
    {
      id: 'story.fishing', title: 'Рыбалка', who: 'note', life: true,
      text: '«В пруду водятся караси и окуни. Удочка стоит за дверью — вечером на зорьке клюёт лучше всего! Бабушка Марфа»',
      task: 'Поймай 2 рыбы', goal: { ev: 'fish', n: 2 }, reward: { coins: 10 },
    },
    {
      id: 'story.wood', title: 'Дровишки', who: 'ghost', life: true,
      text: 'Деревья подступили к самому дому. Бабушка всегда говорила: «Дрова зимой — лучшие друзья». Срублю одно.',
      task: 'Сруби дерево', goal: { ev: 'chop', n: 1 }, reward: { coins: 15 },
    },
    {
      id: 'story.stumps', title: 'Корчуем пни', who: 'ghost', life: true,
      text: 'От дерева остался пень. Выкорчую его, чтобы освободить место.',
      task: 'Выкорчуй пень', goal: { ev: 'stump', n: 1 }, reward: { coins: 10 },
    },
    {
      id: 'story.stone', title: 'Крепкий фундамент', who: 'note', life: true,
      text: '«Камни с поля не выбрасывай: из них выйдет крепкий фундамент для дома. Бабушка Марфа»',
      task: 'Разбей 3 камня', goal: { ev: 'mine', n: 3 }, reward: { coins: 15 },
    },
    {
      id: 'story.well', title: 'Бабушкин колодец', who: 'note',
      text: '«У грядок стоит мой старый колодец. Почини его, и не придётся бегать с лейкой к пруду. Бабушка Марфа»',
      task: 'Почини колодец', goal: { state: 'well', n: 1 }, reward: { coins: 15 },
    },
    {
      id: 'story.alive', title: 'Ферма оживает', who: 'ghost',
      text: 'Птицы вернулись, в саду пахнет яблоками! Интересно, что ещё бабушка спрятала на ферме?',
      task: 'Достигни 5 уровня', goal: { state: 'level', n: 5 }, reward: { gems: 3 },
    },
    {
      id: 'story.chest', title: 'Сундук на чердаке', who: 'ghost', level: 7,
      text: 'На чердаке что-то скрипнуло… Там старый бабушкин сундук! Но лестница совсем прогнила. Надо подлатать дом, а в сундук, говорят, бабушка прятала удочку деда.',
      goals: [
        { state: 'house', n: 3, task: 'Улучши дом до 3 уровня' },
        { ev: 'fish', n: 10, task: 'Поймай 10 рыб' },
      ],
      reward: { coins: 50, gems: 3 },
    },
    {
      id: 'story.letter', title: 'Письмо из города', who: 'note', level: 10,
      text: '«Призрачок, в сундуке лежит моё письмо. Я уехала к сестре в город, но очень скучаю по ферме. Пришли мне тыкв: я испеку твой любимый пирог! Бабушка Марфа»',
      task: 'Собери 5 тыкв', goal: { ev: 'harvest', key: 'pumpkin', n: 5 }, reward: { coins: 150, gems: 5 },
    },
  ],

  garden: [
    {
      id: 'garden.beds', title: 'Новые грядки', who: 'ghost',
      text: 'Двух грядок маловато. Вскопаю ещё, пусть ферма будет большой!',
      task: 'Вскопай 2 грядки', goal: { ev: 'dig', n: 2 }, reward: { coins: 15 },
    },
    {
      id: 'garden.first', title: 'Первый урожай', who: 'ghost',
      text: 'Грядки зазеленели! Если поливать их вовремя, урожай будет быстрее.',
      task: 'Собери 5 урожаев', goal: { ev: 'harvest', n: 5 }, reward: { gems: 1, coins: 10 },
    },
    {
      id: 'garden.bread', title: 'Бабушкин хлеб', who: 'ghost', level: 2,
      text: 'Бабушка пекла самый вкусный хлеб из своей пшеницы. Выращу пшеницу и я!',
      task: 'Собери 5 пшеницы', goal: { ev: 'harvest', key: 'wheat', n: 5 }, reward: { coins: 40, gems: 1 },
    },
    {
      id: 'garden.beet', title: 'Свекольник', who: 'note', level: 3,
      text: '«Свёклу сажай поглубже и поливай почаще: тогда она сладкая, как мёд. Из неё выйдет отличный борщ! Бабушка Марфа»',
      task: 'Собери 5 свёклы', goal: { ev: 'harvest', key: 'beet', n: 5 }, reward: { coins: 40 },
    },
    {
      id: 'garden.cabbage', title: 'Капустные кочаны', who: 'ghost', level: 4,
      text: 'Капуста растёт долго, зато кочаны какие тугие! Посажу целую грядку.',
      task: 'Собери 5 капусты', goal: { ev: 'harvest', key: 'cabbage', n: 5 }, reward: { coins: 60 },
    },
    {
      id: 'garden.bigbeds', title: 'Большой огород', who: 'note', level: 4,
      text: '«Чем больше грядок, тем больше урожай. Только не забывай их поливать! Бабушка Марфа»',
      task: 'Вскопай ещё 4 грядки', goal: { ev: 'dig', n: 4 }, reward: { coins: 50 },
    },
    {
      id: 'garden.tomato', title: 'Томатный сок', who: 'ghost', level: 5,
      text: 'Красные, блестящие помидоры! Бабушка делала из них сок на всю зиму.',
      task: 'Собери 10 помидоров', goal: { ev: 'harvest', key: 'tomato', n: 10 }, reward: { coins: 100, gems: 1 },
    },
    {
      id: 'garden.corn', title: 'Кукурузное поле', who: 'note', level: 7,
      text: '«Кукуруза вырастает выше забора. Когда-то в ней прятался весь соседский выводок цыплят! Бабушка Марфа»',
      task: 'Собери 10 кукурузы', goal: { ev: 'harvest', key: 'corn', n: 10 }, reward: { coins: 150, gems: 2 },
    },
  ],

  fishing: [
    {
      id: 'fish.catch', title: 'Удачный улов', who: 'ghost',
      text: 'Поплавок дёргается… Клюёт! Порыбачу ещё, вдруг попадётся что-то интересное.',
      task: 'Поймай 5 рыб', goal: { ev: 'fish', n: 5 }, reward: { coins: 20 },
    },
    {
      id: 'fish.perch', title: 'Окуньки', who: 'note',
      text: '«Окуни полосатые и хитрые: клюют реже карасей, зато вкуснее. Бабушка Марфа»',
      task: 'Поймай 3 окуня', goal: { ev: 'fish', key: 'fish_perch', n: 3 }, reward: { coins: 30 },
    },
    {
      id: 'fish.gold', title: 'Золотая рыбка', who: 'note',
      text: '«Говорят, в нашем пруду живёт золотая рыбка. Мне она так и не попалась… Может, повезёт тебе? Бабушка Марфа»',
      task: 'Поймай золотую рыбку', goal: { ev: 'fish', key: 'fish_gold', n: 1 }, reward: { gems: 2 },
    },
    {
      id: 'fish.sell', title: 'Рыбный ряд', who: 'ghost',
      text: 'Рыбы в рюкзаке столько, что самому не съесть. Отнесу на рынок!',
      task: 'Продай 10 рыб', goal: { ev: 'sell', group: 'fish', n: 10 }, reward: { coins: 40 },
    },
    {
      id: 'fish.master', title: 'Старый рыбак', who: 'note',
      text: '«Твой дед мог просидеть с удочкой весь день. Говорил, что пруд сам подскажет, где клюёт. Бабушка Марфа»',
      task: 'Поймай 30 рыб', goal: { ev: 'fish', n: 30 }, reward: { coins: 100, gems: 2 },
    },
  ],

  forest: [
    {
      id: 'forest.chop', title: 'Лесоруб', who: 'ghost',
      text: 'Дров много не бывает! Да и место под новые грядки пригодится.',
      task: 'Сруби 5 деревьев', goal: { ev: 'chop', n: 5 }, reward: { coins: 20 },
    },
    {
      id: 'forest.hay', title: 'Сенокос', who: 'ghost',
      text: 'Дикая трава лезет отовсюду. Скошу её, а сено пригодится потом.',
      task: 'Скоси 5 травы', goal: { ev: 'mow', n: 5 }, reward: { coins: 15 },
    },
    {
      id: 'forest.sapling', title: 'Своё деревце', who: 'note',
      text: '«Если рубишь дерево, посади новое. Ростки иногда остаются после рубки. Бабушка Марфа»',
      task: 'Посади росток дерева или куста', goal: { ev: 'sow', n: 1 }, reward: { coins: 25 },
    },
    {
      id: 'forest.boulder', title: 'Каменный великан', who: 'ghost',
      text: 'Этот валун тут лежит, наверное, сто лет. Внутри может быть руда!',
      task: 'Разбей валун', goal: { ev: 'mine', key: 'boulder', n: 1 }, reward: { gems: 1 },
    },
    {
      id: 'forest.berries', title: 'Ягодная поляна', who: 'note', level: 2,
      text: '«Ягодные кусты и плодовые деревья сами в лесу не растут — саженцы продают на рынке. Посадишь — и собирай урожай хоть каждый день! Бабушка Марфа»',
      goals: [
        { ev: 'buy', group: 'orchard', n: 1, task: 'Купи на рынке саженец ягодного куста или плодового дерева' },
        { ev: 'sow', group: 'orchard', n: 1, task: 'Посади его' },
      ],
      reward: { coins: 30 },
    },
    {
      id: 'forest.apples', title: 'Яблоневый спас', who: 'note', level: 6,
      text: '«Яблоки бывают раз в году — а со своей яблони хоть каждый день! Саженцы яблонь на рынке. Бабушка Марфа»',
      task: 'Собери 10 яблок', goal: { ev: 'pick', key: 'apple', n: 10 }, reward: { coins: 50 },
    },
  ],

  build: [
    {
      id: 'build.expand', title: 'За забором', who: 'note',
      text: '«За забором — тоже наша земля. Когда-то там цвели целые поля… А дом подлатаешь, когда ферма подрастёт. Бабушка Марфа»',
      task: 'Открой новый участок', goal: { ev: 'expand', n: 1 }, reward: { coins: 40 },
    },
    {
      id: 'build.house2', title: 'Уютный дом', who: 'ghost',
      text: 'Домик совсем старенький: крыша скрипит, окна дрожат. Пора его подлатать! Нужны дерево, камень и монетки.',
      task: 'Улучши дом до 2 уровня', goal: { state: 'house', n: 2 }, reward: { gems: 2, coins: 30 },
    },
    {
      id: 'build.space', title: 'Простор', who: 'ghost',
      text: 'Ферма растёт! За туманом ещё столько земли.',
      task: 'Открой ещё 2 участка', goal: { ev: 'expand', n: 2 }, reward: { coins: 60 },
    },
    {
      id: 'build.house3', title: 'Крепкая крыша', who: 'note',
      text: '«Крыша протекает уже лет десять. Залатай её, и в доме станет сухо и тепло. Бабушка Марфа»',
      task: 'Улучши дом до 3 уровня', goal: { state: 'house', n: 3 }, reward: { gems: 3 },
    },
    {
      id: 'build.house4', title: 'Дом с верандой', who: 'ghost',
      text: 'Хочу веранду, как у бабушки в молодости: пить там чай и смотреть на огород!',
      task: 'Улучши дом до 4 уровня', goal: { state: 'house', n: 4 }, reward: { gems: 4 },
    },
    {
      id: 'build.house5', title: 'Бабушкина усадьба', who: 'note',
      text: '«Я и не мечтала, что наш домик снова станет таким красивым. Ты молодец, призрачок! Бабушка Марфа»',
      task: 'Улучши дом до 5 уровня', goal: { state: 'house', n: 5 }, reward: { gems: 5 },
    },
  ],

  trade: [
    {
      id: 'trade.market', title: 'На рынок!', who: 'note',
      text: '«На рынке всегда рады свежим овощам. А на вырученные монетки можно подлатать дом. Бабушка Марфа»',
      task: 'Продай 5 урожаев на рынке', goal: { ev: 'sell', n: 5 }, reward: { coins: 20 },
    },
    {
      id: 'trade.seeds', title: 'Запас семян', who: 'ghost',
      text: 'Семена кончаются быстрее, чем я думал. Куплю про запас на рынке.',
      task: 'Купи 5 пакетов семян', goal: { ev: 'buy', group: 'seed', n: 5 }, reward: { coins: 15 },
    },
    {
      id: 'trade.earn', title: 'Лавочник', who: 'ghost',
      text: 'Монетка к монетке! Торговать мне нравится.',
      task: 'Заработай на рынке 500 монет', goal: { ev: 'earn', n: 500 }, reward: { gems: 1 },
    },
    {
      id: 'trade.merchant', title: 'Купец', who: 'note',
      text: '«На рынке тебя уже узнают! Говорят, лучших овощей во всей округе не найти. Бабушка Марфа»',
      task: 'Продай 50 товаров', goal: { ev: 'sell', n: 50 }, reward: { coins: 100, gems: 2 },
    },
  ],
};

// Порядок заданий до переделки (одна цепочка): по нему старые сохранения узнают, что уже сдано
export const OLD_ORDER = [
  'story.wake', 'story.note', 'story.water', 'story.fishing', 'story.wood', 'story.stumps', 'story.stone', 'story.well',
  'garden.beds', 'garden.first', 'trade.market', 'build.expand', 'build.house2', 'garden.bread', 'fish.gold', 'story.alive',
];
// Старые сохранения помнят название текущего задания
export const OLD_TITLES = [
  'Пробуждение', 'Записка у порога', 'Водичка', 'Рыбалка', 'Дровишки', 'Корчуем пни', 'Крепкий фундамент', 'Бабушкин колодец',
  'Новые грядки', 'Первый урожай', 'На рынок!', 'За забором', 'Уютный дом', 'Бабушкин хлеб', 'Золотая рыбка', 'Ферма оживает',
];

// ---------------- Задания на день, неделю и месяц ----------------
// Каждый период из пула берётся count разных заданий (rng), только те, что игроку уже доступны.
// Шаблон: { id, task, goal: { ev, key?, group? }, n: [база, прибавка за уровень], coins?, gems?, xp?, need?, level? }
//   task   — {n} заменится на число, {name} — на название культуры,
//            {рыбу|рыбы|рыб} — на слово в нужной форме для этого числа (1 рыбу, 2 рыбы, 5 рыб)
//   goal.key: 'crop' — случайная открытая культура, которая растёт не дольше часа
//   coins  — монет за каждую единицу цели (округляется до 5), gems — кристаллов за задание
//   need   — задание откроется после этого задания сюжета или ветки
export const PERIODS = {
  day: {
    name: 'День', title: 'Задания дня', icon: 'energy', count: 3, swaps: 1, xp: 5,
    bonus: { gems: 1 }, bonusTask: 'Выполни все задания дня',
    pool: [
      { id: 'harvest', task: 'Собери {n} {урожай|урожая|урожаев}', goal: { ev: 'harvest' }, n: [8, 1], coins: 4 },
      { id: 'crop', task: 'Собери {n}: {name}', goal: { ev: 'harvest', key: 'crop' }, n: [4, 0.3], coins: 8 },
      { id: 'plant', task: 'Посади {n} {семя|семени|семян}', goal: { ev: 'plant' }, n: [8, 1], coins: 3 },
      { id: 'water', task: 'Полей грядки {n} {раз|раза|раз}', goal: { ev: 'water' }, n: [8, 1], coins: 3 },
      { id: 'fish', task: 'Поймай {n} {рыбу|рыбы|рыб}', goal: { ev: 'fish' }, n: [3, 0.3], coins: 10, need: 'story.fishing' },
      { id: 'chop', task: 'Сруби {n} {дерево|дерева|деревьев}', goal: { ev: 'chop' }, n: [2, 0.1], coins: 12, need: 'story.wood' },
      { id: 'pick', task: 'Собери плоды с деревьев и кустов {n} {раз|раза|раз}', goal: { ev: 'pick' }, n: [3, 0.2], coins: 8, need: 'forest.berries' },
      { id: 'mow', task: 'Скоси траву {n} {раз|раза|раз}', goal: { ev: 'mow' }, n: [3, 0.2], coins: 6 },
      { id: 'sell', task: 'Продай {n} {товар|товара|товаров}', goal: { ev: 'sell' }, n: [10, 1], coins: 2 },
    ],
  },
  week: {
    name: 'Неделя', title: 'Задания недели', icon: 'trophy', count: 4, xp: 15,
    bonus: { gems: 3 }, bonusTask: 'Выполни все задания недели',
    pool: [
      { id: 'harvest', task: 'Собери {n} {урожай|урожая|урожаев}', goal: { ev: 'harvest' }, n: [50, 5], coins: 1, gems: 1 },
      { id: 'crop', task: 'Собери {n}: {name}', goal: { ev: 'harvest', key: 'crop' }, n: [15, 1], gems: 1 },
      { id: 'water', task: 'Полей грядки {n} {раз|раза|раз}', goal: { ev: 'water' }, n: [50, 5], gems: 1 },
      { id: 'fish', task: 'Поймай {n} {рыбу|рыбы|рыб}', goal: { ev: 'fish' }, n: [15, 1], gems: 1, need: 'story.fishing' },
      { id: 'pick', task: 'Собери плоды с деревьев и кустов {n} {раз|раза|раз}', goal: { ev: 'pick' }, n: [12, 1], gems: 1, need: 'forest.berries' },
      { id: 'chop', task: 'Сруби {n} {дерево|дерева|деревьев}', goal: { ev: 'chop' }, n: [8, 0.5], gems: 1, need: 'story.wood' },
      { id: 'earn', task: 'Заработай на рынке {n} {монету|монеты|монет}', goal: { ev: 'earn' }, n: [300, 60], gems: 2 },
    ],
  },
  month: {
    name: 'Месяц', title: 'Задания месяца', icon: 'gem', count: 3, xp: 40,
    bonus: { gems: 10 }, bonusTask: 'Выполни все задания месяца',
    pool: [
      { id: 'harvest', task: 'Собери {n} {урожай|урожая|урожаев}', goal: { ev: 'harvest' }, n: [250, 20], gems: 3 },
      { id: 'fish', task: 'Поймай {n} {рыбу|рыбы|рыб}', goal: { ev: 'fish' }, n: [60, 4], gems: 3, need: 'story.fishing' },
      { id: 'gold', task: 'Поймай {n} {золотую рыбку|золотые рыбки|золотых рыбок}', goal: { ev: 'fish', key: 'fish_gold' }, n: [3, 0.1], gems: 4, need: 'story.fishing' },
      { id: 'pick', task: 'Собери плоды с деревьев и кустов {n} {раз|раза|раз}', goal: { ev: 'pick' }, n: [50, 3], gems: 3, need: 'forest.berries' },
      { id: 'earn', task: 'Заработай на рынке {n} {монету|монеты|монет}', goal: { ev: 'earn' }, n: [2000, 400], gems: 3 },
    ],
  },
};

// ---------------- События ----------------
// Каждый год в эти дни (по QUEST_TZ, включительно). Задания идут по порядку, за все — главный приз.
// Потом сюда же: своя валюта, свой магазин, декор в награду.
export const EVENTS = [
  {
    id: 'newyear', name: 'Новогодняя ярмарка', icon: 'decor', from: '12-20', to: '01-10',
    text: 'В деревне праздничная ярмарка! Соседи ждут угощений к новогоднему столу.',
    quests: [
      { id: 'ny.pine', title: 'Ёлочка', task: 'Сруби 2 ели', goal: { ev: 'chop', key: 'pine', n: 2 }, reward: { coins: 50 } },
      { id: 'ny.harvest', title: 'Праздничный стол', task: 'Собери 30 урожаев', goal: { ev: 'harvest', n: 30 }, reward: { coins: 80 } },
      { id: 'ny.fish', title: 'Рыба к столу', task: 'Поймай 10 рыб', goal: { ev: 'fish', n: 10 }, reward: { gems: 2 } },
      { id: 'ny.sell', title: 'Ярмарка', task: 'Продай 40 товаров', goal: { ev: 'sell', n: 40 }, reward: { gems: 3 } },
    ],
    prize: { gems: 15 },
  },
  {
    id: 'spring', name: 'Весенний сад', icon: 'decor', from: '04-01', to: '04-21',
    text: 'Всё цветёт! Самое время сажать деревья и собирать первые ягоды.',
    quests: [
      { id: 'sp.sow', title: 'Новые ростки', task: 'Посади 3 ростка', goal: { ev: 'sow', n: 3 }, reward: { coins: 50 } },
      { id: 'sp.pick', title: 'Первые ягоды', task: 'Собери 10 раз плоды', goal: { ev: 'pick', n: 10 }, reward: { coins: 80 } },
      { id: 'sp.plant', title: 'Весенний посев', task: 'Посади 40 семян', goal: { ev: 'plant', n: 40 }, reward: { gems: 3 } },
    ],
    prize: { gems: 10 },
  },
  {
    id: 'harvest', name: 'Праздник урожая', icon: 'decor', from: '09-01', to: '09-21',
    text: 'Осень — время собирать урожай! Вся деревня хвастается овощами.',
    quests: [
      { id: 'hv.harvest', title: 'Полные корзины', task: 'Собери 50 урожаев', goal: { ev: 'harvest', n: 50 }, reward: { coins: 80 } },
      { id: 'hv.pick', title: 'Яблочный сезон', task: 'Собери 10 раз плоды', goal: { ev: 'pick', n: 10 }, reward: { coins: 80 } },
      { id: 'hv.earn', title: 'Осенняя ярмарка', task: 'Заработай на рынке 1000 монет', goal: { ev: 'earn', n: 1000 }, reward: { gems: 3 } },
    ],
    prize: { gems: 10 },
  },
  {
    id: 'ghost', name: 'Призрачная неделя', icon: 'decor', from: '10-25', to: '11-07',
    text: 'Самые таинственные дни года! Призрачок светится ярче, а в пруду клюёт даже ночью.',
    quests: [
      { id: 'gh.fish', title: 'Ночная рыбалка', task: 'Поймай 8 рыб', goal: { ev: 'fish', n: 8 }, reward: { coins: 50 } },
      { id: 'gh.harvest', title: 'Призрачный урожай', task: 'Собери 25 урожаев', goal: { ev: 'harvest', n: 25 }, reward: { coins: 80 } },
      { id: 'gh.gold', title: 'Светящаяся рыбка', task: 'Поймай золотую рыбку', goal: { ev: 'fish', key: 'fish_gold', n: 1 }, reward: { gems: 3 } },
    ],
    prize: { gems: 15 },
  },
];
