// Колесо фортуны в игре: связывает правила (wheelRules.js) с фермой — сохранение и проверка.
// Звук вращения, анимацию и тост с призом делает окно (UI.wheelPanel), когда колесо остановится.
// Время и случайность — как у заданий (Quests.ctx): в настройках разработчика часы можно сдвинуть.

import * as W from './wheelRules.js';

export class Wheel {
  constructor(farm) { this.farm = farm; }

  ctx() { return this.farm.quests.ctx(); }

  view() { return W.wheelView(this.farm.st, this.ctx()); }

  freeLeft() { return W.freeSpins(this.farm.st, this.ctx()); }

  // Крутить ('free' | 'coins' | 'gems'): результат правил { idx, reward, cost, mode } или null
  spin(mode) {
    const r = W.spin(this.farm.st, mode, this.ctx());
    if (r) this.farm.changed();
    return r;
  }

  // Проверка (настройки разработчика): вращения как в новый день
  devReset() { delete this.farm.st.wheel; this.farm.changed(); }
}
