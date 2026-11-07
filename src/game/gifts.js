// Подарки в игре: связывает правила (giftRules.js) с фермой — звук, радость призрака, сохранение.
// Время — как у заданий (Quests.ctx): в настройках разработчика его можно сдвинуть.

import * as G from './giftRules.js';

export class Gifts {
  constructor(farm) { this.farm = farm; }

  ctx() { return this.farm.quests.ctx(); }

  daily() { return G.daily(this.farm.st, this.ctx()); }

  // Сколько подарков ждёт во всех разделах
  available() { return G.available(this.farm.st, this.ctx()); }

  // Забрать ежедневный подарок: результат правил ({ reward, day, total }) или null
  claimDaily() {
    const f = this.farm, r = G.claimDaily(f.st, this.ctx());
    if (!r) return null;
    f.sfx('coin');
    f.player.celebrate();
    f.changed();
    return r;
  }

  // Проверка (настройки разработчика): подарки как в новой игре
  devReset() { delete this.farm.st.gifts; this.farm.changed(); }
}
