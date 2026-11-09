// Таблицы заданий: сюжет и ветки, задания на день, неделю и месяц, события по датам.
// Только данные. Правила (счёт, награды, смена дня) — в questRules.js.
//
// Задание: { id, title, who, text, task, goal | goals, reward, level?, life? }
//   id     — постоянный ключ (в сохранении); title и порядок можно менять, сохранения не сломаются
//   who    — 'ghost' говорит призрачок, 'note' — записка бабушки Марфы
//   goal   — { ev, key?, group?, n } — счётчик событий игры (Farm → quests.emit):
//            harvest, plant, water, fish, chop, stump, mine, dig, mow, pick, sow, sell, earn (монеты с рынка),
//            buy, expand, order (сдан заказ с доски на рынке), place (свою постройку из рюкзака: key — её тип),
//            build (стройка здания кончилась: key — здание), craft (забрали товар из здания: key — товар),
//            feed (покормили животное: key — вид), grow (животное подросло: key — вид), adult (выросло во взрослое),
//            animal (забрали, что дало животное: key — продукт: egg, milk…),
//            tool (инструмент доковался в кузнице: key — инструмент и новый уровень: axe2, pick3, can4).
//            key — точный ключ (культура, рыба, вид дерева), group — группа ключей (GROUPS в questRules.js)
//            { state, n } — значение из состояния: house (уровень дома), well (колодец), level (уровень игрока),
//            beds (грядок на ферме), bedsAll (всех своих грядок: на ферме и в рюкзаке) — их даёт мир (ctx.stats)
//   goals  — несколько целей сразу: [{ ...goal, task }]
//   reward — { coins, gems, xp, items: { id: n } }; xp по умолчанию QUEST_XP. Грядки (items.bed) даются и сверх
//            предела по уровню (BEDS в data.js)
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
  { key: 'craft', name: 'Мастерские', icon: 'build', after: 'story.well' },
  { key: 'animals', name: 'Животные', icon: 'paw', after: 'story.well' },
  { key: 'smith', name: 'Кузнец', icon: 'pick', after: 'craft.forge' },
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
      text: 'Двух грядок маловато. На рынке продают готовые грядки: куплю ещё парочку, пусть ферма будет большой!',
      goals: [
        { state: 'bedsAll', n: 4, task: 'Купи 2 грядки на рынке (раздел «Постройки»)' },
        { state: 'beds', n: 4, task: 'Поставь их: пусть на ферме будет 4 грядки' },
      ],
      reward: { coins: 20 },
    },
    {
      id: 'garden.first', title: 'Первый урожай', who: 'ghost',
      text: 'Грядки зазеленели! Если поливать их вовремя, урожай будет быстрее.',
      task: 'Собери 5 урожаев', goal: { ev: 'harvest', n: 5 }, reward: { gems: 1, coins: 10, items: { bed: 1 } },
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
      id: 'garden.sprinkler', title: 'Сам себе дождик', who: 'note', level: 3,
      text: '«Бегать с лейкой к каждой грядке — так и спину сорвать недолго. На рынке продают поливалки: поставь её рядом с грядками, и они будут поливаться сами, даже пока тебя нет. Бабушка Марфа»',
      goals: [
        { ev: 'buy', group: 'sprinkler', n: 1, task: 'Купи на рынке поливалку (раздел «Постройки»)' },
        { ev: 'place', group: 'sprinkler', n: 1, task: 'Поставь её рядом с грядками' },
      ],
      reward: { coins: 30 },
    },
    {
      id: 'garden.cabbage', title: 'Капустные кочаны', who: 'ghost', level: 4,
      text: 'Капуста растёт долго, зато кочаны какие тугие! Посажу целую грядку.',
      task: 'Собери 5 капусты', goal: { ev: 'harvest', key: 'cabbage', n: 5 }, reward: { coins: 60 },
    },
    {
      id: 'garden.bigbeds', title: 'Большой огород', who: 'note', level: 4,
      text: '«Чем больше грядок, тем больше урожай. Грядки продают на рынке. Только не забывай их поливать! Бабушка Марфа»',
      task: 'Пусть на ферме будет 10 грядок', goal: { state: 'beds', n: 10 }, reward: { coins: 30, items: { bed: 2 } },
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
    {
      id: 'garden.field', title: 'Целое поле', who: 'note', level: 9,
      text: '«Когда-то за домом грядки тянулись до самого леса. Вот бы снова увидеть такое поле! Бабушка Марфа»',
      task: 'Пусть на ферме будет 20 грядок', goal: { state: 'beds', n: 20 }, reward: { gems: 2, items: { bed: 3 } },
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
      id: 'build.cozy', title: 'Уютный уголок', who: 'ghost', level: 2,
      text: 'Хочу местечко, где можно посидеть вечером: лавочку у дорожки и фонарик рядом. На рынке есть целый раздел «Декор»!',
      goals: [
        { ev: 'buy', group: 'decor', n: 2, task: 'Купи 2 вещи в разделе «Декор» (лавочку, фонарь, столик или забор)' },
        { ev: 'place', group: 'decor', n: 2, task: 'Поставь их на ферме' },
      ],
      reward: { coins: 40 },
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

  // здания с крафтом (buildData.js): чертёж с рынка → стройка → первые товары
  craft: [
    {
      id: 'craft.kitchen', title: 'Бабушкина кухня', who: 'note', level: 3,
      text: '«Без печки ферма — не ферма. Купи на рынке чертёж кухни, запаси дерева и камня и поставь её во дворе: из урожая там выходят блюда, от которых сил куда больше, чем от сырой морковки. Бабушка Марфа»',
      goals: [
        { ev: 'buy', key: 'bp_kitchen', n: 1, task: 'Купи чертёж кухни (рынок, раздел «Постройки»)' },
        { ev: 'build', key: 'kitchen', n: 1, task: 'Построй кухню' },
      ],
      reward: { coins: 40 },
    },
    {
      id: 'craft.salad', title: 'Морковный салат', who: 'ghost', level: 3,
      text: 'Кухня готова! Первым делом — морковный салат: тёртая морковка с зеленью, и сил сразу прибавится.',
      task: 'Приготовь 2 морковных салата', goal: { ev: 'craft', key: 'carrot_salad', n: 2 }, reward: { coins: 30 },
    },
    {
      id: 'craft.carpentry', title: 'Столярка', who: 'note', level: 4,
      text: '«Доски сами себя не напилят. Поставь столярную мастерскую: доски пригодятся для кузницы и новых построек. Бабушка Марфа»',
      goals: [
        { ev: 'build', key: 'carpentry', n: 1, task: 'Построй столярную мастерскую' },
        { ev: 'craft', key: 'planks', n: 4, task: 'Напили 4 доски' },
      ],
      reward: { gems: 2 },
    },
    {
      id: 'craft.forge', title: 'Кузнечное дело', who: 'ghost', level: 5,
      text: 'Руды накопилась целая куча! В кузнице из неё выйдут слитки, а из слитков — гвозди.',
      goals: [
        { ev: 'build', key: 'forge', n: 1, task: 'Построй кузницу' },
        { ev: 'craft', key: 'nails', n: 8, task: 'Выкуй 8 гвоздей' },
      ],
      reward: { gems: 3 },
    },
    {
      id: 'craft.borscht', title: 'Бабушкин борщ', who: 'note', level: 5,
      text: '«Помнишь, я писала про свёклу? Вот мой рецепт: две свёклы, кочан капусты и помидор. Вари на кухне, пока не запахнет на всю ферму. Бабушка Марфа»',
      task: 'Свари борщ', goal: { ev: 'craft', key: 'borscht', n: 1 }, reward: { coins: 60 },
    },
    {
      id: 'craft.stonecutter', title: 'Каменных дел мастер', who: 'ghost', level: 6,
      text: 'Камней на ферме — хоть отбавляй. В камнерезной из них выйдут ровные блоки и мостовая для дорожек!',
      goals: [
        { ev: 'build', key: 'stonecutter', n: 1, task: 'Построй камнерезную мастерскую' },
        { ev: 'craft', key: 'stone_block', n: 2, task: 'Вытеши 2 каменных блока' },
      ],
      reward: { gems: 3 },
    },
  ],

  // улучшение инструментов в кузнице (toolData.js): железные → стальные → мастерские. life — инструмент могли
  // улучшить раньше, чем открылось задание
  smith: [
    {
      id: 'smith.pick', title: 'Железная кирка', who: 'note', level: 5, life: true,
      text: '«Старой киркой много не наработаешь. Отнеси её в кузницу: с железной камни колются легче, а руда попадается чаще. Бабушка Марфа»',
      task: 'Улучши кирку в кузнице (вкладка «Инструменты»)', goal: { ev: 'tool', key: 'pick2', n: 1 }, reward: { coins: 60 },
    },
    {
      id: 'smith.axe', title: 'Железный топор', who: 'ghost', level: 5, life: true,
      text: 'Пять ударов на каждый дуб — так и энергии не напасёшься! С железным топором дело пойдёт быстрее.',
      task: 'Улучши топор в кузнице', goal: { ev: 'tool', key: 'axe2', n: 1 }, reward: { coins: 60 },
    },
    {
      id: 'smith.can', title: 'Большая лейка', who: 'note', level: 6, life: true,
      text: '«Бегать к пруду ради каждой грядки — ноги собьёшь. В кузнице лейку сделают побольше: воды в ней хватит надолго. Бабушка Марфа»',
      task: 'Улучши лейку в кузнице', goal: { ev: 'tool', key: 'can2', n: 1 }, reward: { gems: 2 },
    },
    {
      id: 'smith.steel', title: 'Крепкая сталь', who: 'ghost', level: 11, life: true,
      text: 'Железо — хорошо, а сталь — ещё лучше! Стальные топор и кирка бьют вдвое сильнее старых.',
      goals: [
        { ev: 'tool', key: 'axe3', n: 1, task: 'Сделай стальной топор' },
        { ev: 'tool', key: 'pick3', n: 1, task: 'Сделай стальную кирку' },
      ],
      reward: { coins: 150, gems: 3 },
    },
    {
      id: 'smith.sprayer', title: 'Лейка-распылитель', who: 'note', level: 12, life: true,
      text: '«Говорят, кузнец умеет делать лейку с распылителем: одно движение — и политы пять грядок крестом. Бабушка Марфа»',
      task: 'Сделай лейку-распылитель', goal: { ev: 'tool', key: 'can3', n: 1 }, reward: { gems: 3 },
    },
    {
      id: 'smith.master', title: 'Мастерская работа', who: 'ghost', level: 16, life: true,
      text: 'У кузнеца остался последний секрет: мастерские инструменты. Такой топор валит дерево вместе с корнем, а кирка достаёт из валуна лишнюю руду!',
      goals: [
        { ev: 'tool', key: 'axe4', n: 1, task: 'Сделай мастерский топор' },
        { ev: 'tool', key: 'pick4', n: 1, task: 'Сделай мастерскую кирку' },
      ],
      reward: { gems: 5 },
    },
    {
      id: 'smith.mastercan', title: 'Мастерская лейка', who: 'note', level: 17, life: true,
      text: '«Мастерская лейка поливает сразу целый квадрат — девять грядок за раз. С ней огород в порядке за минуту. Бабушка Марфа»',
      task: 'Сделай мастерскую лейку', goal: { ev: 'tool', key: 'can4', n: 1 }, reward: { gems: 5 },
    },
  ],

  // животные (animalData.js): кормоцех → цыплёнок → яйца, потом остальные виды по уровням
  animals: [
    {
      id: 'animals.feedmill', title: 'Кормоцех', who: 'note', level: 4,
      text: '«Какая ферма без живности? Только сперва поставь кормоцех: из пшеницы там выходит зерносмесь, а куры её обожают. Бабушка Марфа»',
      goals: [
        { ev: 'buy', key: 'bp_feedmill', n: 1, task: 'Купи чертёж кормоцеха (рынок, раздел «Постройки»)' },
        { ev: 'build', key: 'feedmill', n: 1, task: 'Построй кормоцех' },
      ],
      reward: { coins: 40 },
    },
    {
      id: 'animals.chick', title: 'Цып-цып-цып', who: 'ghost', level: 4,
      text: 'На рынке продают пушистых цыплят! Куплю одного, поставлю во дворе и угощу зерносмесью.',
      goals: [
        { ev: 'buy', key: 'animal_chicken_baby', n: 1, task: 'Купи цыплёнка (рынок, раздел «Животные»)' },
        { ev: 'place', key: 'animal_chicken_baby', n: 1, task: 'Поставь его на траву' },
        { ev: 'feed', key: 'chicken', n: 3, task: 'Покорми его 3 раза' },
      ],
      reward: { coins: 30, items: { feed_grain: 6 } },
    },
    {
      id: 'animals.egg', title: 'Первое яичко', who: 'note', level: 4,
      text: '«Цыплёнок подрастёт в молодку, молодка — в курочку, а курочка снесёт яичко. Корми её почаще, и яиц будет много! Бабушка Марфа»',
      task: 'Собери 3 яйца', goal: { ev: 'animal', key: 'egg', n: 3 }, reward: { gems: 2 },
    },
    {
      id: 'animals.rabbit', title: 'Ушастый пух', who: 'ghost', level: 4,
      text: 'Кролики такие мягкие! Из их пуха бабушка вязала самые тёплые варежки. Заведу крольчонка.',
      task: 'Собери ангорский пух', goal: { ev: 'animal', key: 'angora', n: 1 }, reward: { coins: 50 },
    },
    {
      id: 'animals.goose', title: 'Гуси-лебеди', who: 'note', level: 5,
      text: '«Гуси — птицы важные, зато перья у них — на загляденье: подушки из них мягкие, как облако. Бабушка Марфа»',
      task: 'Собери 2 гусиных пера', goal: { ev: 'animal', key: 'goose_feather', n: 2 }, reward: { coins: 70 },
    },
    {
      id: 'animals.pig', title: 'Хрюшкины находки', who: 'ghost', level: 6,
      text: 'Говорят, свинки умеют находить под землёй трюфели! Проверю, правда ли это.',
      task: 'Найди трюфель со свинкой', goal: { ev: 'animal', key: 'truffle', n: 1 }, reward: { coins: 90 },
    },
    {
      id: 'animals.sheep', title: 'Тёплая шерсть', who: 'note', level: 7,
      text: '«Овечка даст шерсть, а из шерсти выйдут нитки. Сенной брикет делай в кормоцехе: сено с дикой травы пригодится. Бабушка Марфа»',
      task: 'Собери 2 шерсти', goal: { ev: 'animal', key: 'wool', n: 2 }, reward: { gems: 3 },
    },
    {
      id: 'animals.milk', title: 'Парное молоко', who: 'note', level: 8,
      text: '«Своя корова — своё молоко! Из него выйдет и тыквенная каша, и клубничный торт. Бабушка Марфа»',
      task: 'Надои 12 бутылок молока', goal: { ev: 'animal', key: 'milk', n: 12 }, reward: { gems: 3 },
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
