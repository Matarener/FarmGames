// Таблица достижений: только данные. Правила (прогресс, ступени, награды) — в achRules.js.
//
// Достижение: { id, group, name, icon, task, goal, tiers, rewards? }
//   id      — постоянный ключ (в сохранении st.ach); name, task и порядок можно менять
//   task    — цель ступени: {n} — число ступени, {a|b|c} — форма слова для этого числа
//   goal    — откуда прогресс (всё за всё время игры):
//             { ev, key? }     — счётчик событий игры, тот же, что у заданий (Farm → quests.emit):
//                                harvest, fish, chop, mine, mow, pick, sow, sell, earn, quest (сданные задания),
//                                feed (покормили животное), animal (забрали продукт у животного);
//                                key — точный ключ (культура, рыба)
//             { kinds, group } — сколько разных ключей группы было в событии kinds (разные культуры урожая;
//                                группы — GROUPS в questRules.js)
//             { stat }         — значение игры: level, house, chunks (открыто участков), days (дней с подарком),
//                                beds (своих грядок: на ферме и в рюкзаке)
//   tiers   — числа ступеней по возрастанию (не больше пяти)
//   rewards — свои награды за ступени (по умолчанию ACH_REWARDS)

export const ACH_GROUPS = [
  { key: 'garden', name: 'Огород' },
  { key: 'fishing', name: 'Рыбалка' },
  { key: 'forest', name: 'Лес и сад' },
  { key: 'build', name: 'Стройка' },
  { key: 'animals', name: 'Животные' },
  { key: 'trade', name: 'Торговля' },
  { key: 'farmer', name: 'Фермер' },
];

// Медали ступеней (цвета — в style.css, .ach-ic.t1…t5). У достижения меньше пяти ступеней — его
// медали последние, как и награды: за последнюю ступень всегда алмазная.
export const ACH_MEDALS = ['бронзовая', 'серебряная', 'золотая', 'изумрудная', 'алмазная'];

// Награда за ступень по её номеру. У достижения меньше пяти ступеней — его ступени берут последние
// награды: последняя ступень всегда самая щедрая.
export const ACH_REWARDS = [
  { coins: 20 },
  { coins: 50 },
  { coins: 150, gems: 1 },
  { coins: 400, gems: 3 },
  { coins: 1000, gems: 8 },
];

export const ACH = [
  // ---- Огород ----
  { id: 'harvest', group: 'garden', name: 'Урожайный', icon: 'carrot',
    task: 'Собери {n} {урожай|урожая|урожаев}', goal: { ev: 'harvest' }, tiers: [10, 100, 500, 2500, 10000] },
  { id: 'crops', group: 'garden', name: 'Все культуры', icon: 'seed',
    task: 'Вырасти {n} {разную культуру|разные культуры|разных культур}', goal: { kinds: 'harvest', group: 'crop' }, tiers: [3, 5, 7, 9, 10] },
  // id 'dig' — от «Землекопа» (грядки раньше копали): полученные медали остаются. Считаются все свои грядки
  // (на ферме и в рюкзаке), их покупают на рынке и получают за задания
  { id: 'dig', group: 'garden', name: 'Огородник', icon: 'bed',
    task: 'Заведи {n} {грядку|грядки|грядок}', goal: { stat: 'beds' }, tiers: [4, 8, 12, 20, 30] },

  // ---- Рыбалка ----
  { id: 'fish', group: 'fishing', name: 'Рыболов', icon: 'fish',
    task: 'Поймай {n} {рыбу|рыбы|рыб}', goal: { ev: 'fish' }, tiers: [10, 50, 200, 750, 2000] },
  { id: 'gold', group: 'fishing', name: 'Золотая рыбка', icon: 'fish_gold',
    task: 'Поймай {n} {золотую рыбку|золотые рыбки|золотых рыбок}', goal: { ev: 'fish', key: 'fish_gold' }, tiers: [1, 5, 20, 75, 200] },

  // ---- Животные ----
  { id: 'feed', group: 'animals', name: 'Заботливый хозяин', icon: 'feed_grain',
    task: 'Покорми животных {n} {раз|раза|раз}', goal: { ev: 'feed' }, tiers: [10, 50, 200, 750, 2000] },
  { id: 'animal', group: 'animals', name: 'Животновод', icon: 'paw',
    task: 'Собери {n} {продукт|продукта|продуктов} от животных', goal: { ev: 'animal' }, tiers: [5, 30, 150, 600, 2000] },

  // ---- Лес и сад ----
  { id: 'chop', group: 'forest', name: 'Лесоруб', icon: 'axe',
    task: 'Сруби {n} {дерево|дерева|деревьев}', goal: { ev: 'chop' }, tiers: [5, 25, 100, 300, 1000] },
  // камней и валунов на карте около 300, новые не появляются
  { id: 'mine', group: 'forest', name: 'Каменотёс', icon: 'pick',
    task: 'Разбей {n} {камень|камня|камней}', goal: { ev: 'mine' }, tiers: [5, 25, 75, 150, 250] },
  { id: 'mow', group: 'forest', name: 'Косарь', icon: 'hay',
    task: 'Скоси высокую траву {n} {раз|раза|раз}', goal: { ev: 'mow' }, tiers: [10, 50, 200, 750, 2000] },
  { id: 'pick', group: 'forest', name: 'Садовод', icon: 'apple',
    task: 'Собери плоды {n} {раз|раза|раз}', goal: { ev: 'pick' }, tiers: [10, 50, 250, 1000, 5000] },
  // пересадка своего взрослого растения из рюкзака — не посадка (событие replant)
  { id: 'sow', group: 'forest', name: 'Лесник', icon: 'sap_oak',
    task: 'Посади {n} {саженец|саженца|саженцев}', goal: { ev: 'sow' }, tiers: [1, 5, 20, 50, 150] },

  // ---- Стройка ----
  { id: 'chunks', group: 'build', name: 'Землевладелец', icon: 'center',
    task: 'Расширь ферму до {n} {участка|участков|участков}', goal: { stat: 'chunks' }, tiers: [3, 6, 10, 16, 25] },
  { id: 'house', group: 'build', name: 'Свой дом', icon: 'house',
    task: 'Улучши дом до {n} уровня', goal: { stat: 'house' }, tiers: [2, 3, 4, 5] },

  // ---- Торговля ----
  { id: 'sell', group: 'trade', name: 'Торговец', icon: 'market',
    task: 'Продай {n} {товар|товара|товаров}', goal: { ev: 'sell' }, tiers: [10, 100, 500, 2500, 10000] },
  { id: 'earn', group: 'trade', name: 'Копилка', icon: 'coin',
    task: 'Заработай на рынке {n} {монету|монеты|монет}', goal: { ev: 'earn' }, tiers: [250, 2500, 15000, 75000, 250000] },

  // ---- Фермер ----
  { id: 'level', group: 'farmer', name: 'Опытный фермер', icon: 'star',
    task: 'Достигни {n} уровня', goal: { stat: 'level' }, tiers: [5, 10, 15, 20, 25] },
  { id: 'quest', group: 'farmer', name: 'Исполнительный', icon: 'note',
    task: 'Выполни {n} {задание|задания|заданий}', goal: { ev: 'quest' }, tiers: [10, 50, 150, 400, 1000] },
  { id: 'days', group: 'farmer', name: 'Верный друг', icon: 'calendar',
    task: 'Забирай ежедневный подарок {n} {день|дня|дней}', goal: { stat: 'days' }, tiers: [7, 30, 60, 100, 365] },
];
