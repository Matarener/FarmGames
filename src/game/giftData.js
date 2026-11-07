// Подарки: таблицы. Правила — giftRules.js, окно — UI.giftPanel, кнопка подарка — #btn-gift.
// Время подарков — то же, что у заданий: новый день начинается в 00:00 по QUEST_TZ (Москва).

// Разделы окна «Подарки». soon — заготовка: вкладка видна, но пока не открывается (text — что будет).
export const GIFT_TABS = [
  { key: 'daily',   name: 'Ежедневные',  icon: 'calendar' },
  { key: 'friends', name: 'От друзей',   icon: 'friends', soon: 'Подарки от друзей появятся, когда на ферму можно будет приглашать друзей' },
  { key: 'invite',  name: 'Приглашения', icon: 'invite',  soon: 'Подарки за приглашённых друзей появятся вместе с друзьями' },
  { key: 'event',   name: 'События',     icon: 'event',   soon: 'Подарки за праздники и события появятся в следующих обновлениях' },
];

// Ежедневный подарок — дорожка из 30 дней входа (как боевой пропуск): каждый день, когда игрок зашёл,
// он забирает подарок следующего дня дорожки. Каждый 7-й день — кристаллы, 30-й — сундук с кристаллами.
// После 30-го дорожка начинается заново. Новый день — в 00:00 по QUEST_TZ (Москва), раз в день.
// level — с какого уровня; resetOnMiss — пропустил день: дорожка с 1-го дня (false — пропуск не сгорает).
// Награда дня: coins, gems, items { id из ITEMS: сколько }; big — большой подарок (сундук, широкая ячейка).
export const DAILY_GIFT = {
  level: 1,
  resetOnMiss: false,
  days: [
    // 1-я неделя
    { coins: 20 }, { items: { milk: 2 } }, { items: { stone: 10 } }, { coins: 30 }, { items: { bread: 1 } }, { items: { wood: 15 } },
    { gems: 2 },
    // 2-я
    { coins: 40 }, { items: { pie: 1 } }, { items: { ore: 3 } }, { coins: 50 }, { items: { sap_raspberry: 1 } }, { items: { bread: 2 } },
    { gems: 3 },
    // 3-я
    { coins: 60 }, { items: { stone: 20 } }, { items: { pie: 2 } }, { items: { wood: 25 } }, { coins: 80 }, { items: { sap_apple: 1 } },
    { gems: 4 },
    // 4-я
    { coins: 100 }, { items: { ore: 5 } }, { items: { bread: 3 } }, { coins: 120 }, { items: { sap_cherry: 1 } }, { items: { pie: 3 } },
    { gems: 5 },
    // и финал
    { coins: 150 },
    { gems: 15, coins: 200, big: true },
  ],
};
