// Доска заказов в игре: связывает правила (orderRules.js) с фермой. Правила меняют состояние и возвращают
// результат, а здесь из него получаются звук, тост, опыт, радость призрака и счётчики заданий
// (сданный заказ — это продажа на рынке: «Продай…» и «Заработай на рынке…» засчитываются).
// Время и случайность — как у заданий (Quests.ctx): в настройках разработчика часы можно сдвинуть.

import * as R from './orderRules.js';
import { FLORA, ITEMS } from './data.js';

export class Orders {
  constructor(farm) { this.farm = farm; }

  // fruit считается, только когда правилам нужно придумать заказ
  ctx() {
    const c = this.farm.quests.ctx(), self = this;
    return { now: c.now, rng: c.rng, get fruit() { return self.ownFruit(); } };
  }

  // Плоды, которые игрок может собрать: свои взрослые плодовые деревья и ягодные кусты на карте
  ownFruit() {
    const out = new Set();
    for (const o of this.farm.world.objects) if (o && FLORA[o.type] && FLORA[o.type].pick) out.add(FLORA[o.type].fruit);
    return [...out];
  }

  view() { return R.view(this.farm.st, this.ctx()); }

  ready() { return R.readyCount(this.farm.st); }

  need(id) { return R.need(this.farm.st, id); }

  // Раз в секунду и при входе: новые покупатели
  tick() {
    const out = R.refresh(this.farm.st, this.ctx());
    if (!out.length) return;
    if (out[0].type === 'open') { this.farm.ui.toast('На рынке открылась доска заказов!', 'good'); this.farm.sfx('quest'); }
    this.farm.changed();
  }

  deliver(idx) {
    const f = this.farm, r = R.deliver(f.st, idx, this.ctx());
    if (!r) return null;
    if (r.lack) { f.toast(`Не хватает: ${ITEMS[r.lack].name.toLowerCase()}`, 'warn'); return null; }
    let n = 0;
    for (const [id, k] of Object.entries(r.items)) { f.quests.emit('sell', id, k); n += k; }
    f.quests.emit('earn', 'order', r.coins);
    f.quests.emit('order', null, 1);
    f.sfx('coin');
    f.ui.toast(`Заказ сдан: +${r.coins} ${f.ui.ic('coin')} +${r.xp} ${f.ui.ic('star')}`, 'good');
    f.addXp(r.xp);
    f.player.celebrate();
    f.changed();
    return { ...r, n };
  }

  skip(idx) {
    const f = this.farm, r = R.skip(f.st, idx, this.ctx());
    if (!r) return null;
    f.sfx('tap');
    f.changed();
    return r;
  }

  rush(idx) {
    const f = this.farm, r = R.rush(f.st, idx, this.ctx());
    if (!r) return null;
    if (r.poor) { f.toast('Не хватает кристаллов', 'warn'); return null; }
    f.sfx('coin');
    f.changed();
    return r;
  }

  // Проверка (настройки разработчика): доска как в первый раз, три новых заказа
  devReset() { delete this.farm.st.orders; this.tick(); this.farm.changed(); }
}
