// Достижения в игре: связывает правила (achRules.js) с фермой — тосты, звук, радость призрака, сохранение.
// Таблица достижений — achData.js. Прогресс считают задания (quests.emit), здесь только проверка.

import * as A from './achRules.js';

export class Achievements {
  constructor(farm) {
    this.farm = farm;
    this.ready = false; // до первой секунды игры (экран загрузки) тосты ждут
    this.wait = [];
  }

  // То, что знает только мир: сколько участков открыто
  ctx() { const f = this.farm, w = f.world; return { chunks: w ? w.unlockedCount() : 0, bedsAll: w ? f.bedCounts().bedsAll : 0 }; }

  views() { return A.views(this.farm.st, this.ctx()); }

  summary(vs = this.views()) { return A.summary(vs); }

  // Сколько достижений ждут, чтобы забрали награду (кружок на кнопке «Ещё»)
  available() { return this.summary().can; }

  // После каждого действия (Farm.changed) и раз в секунду
  check() {
    const out = A.check(this.farm.st, this.ctx());
    if (!out.length) return;
    if (this.ready) this.handle(out); else this.wait.push(...out);
  }

  tick() {
    if (!this.ready) { this.ready = true; if (this.wait.length) this.handle(this.wait.splice(0)); }
    this.check();
  }

  handle(out) {
    const ui = this.farm.ui;
    let sound = false;
    for (const e of out) {
      if (e.type === 'tier') { ui.achTier(e.view, e.medal); sound = true; }
      else if (e.type === 'intro') ui.toast(`Появились достижения! Можно забрать наград: ${e.n}. Загляни в «Ещё» → «Достижения».`, 'good');
    }
    if (sound) this.farm.sfx('quest');
    this.farm.save.schedule(() => this.farm.serialize());
  }

  // Забрать награду одного достижения (id) или всех сразу (id = null): результат правил или null
  claim(id) {
    const f = this.farm, ctx = this.ctx();
    const r = id ? A.claim(f.st, id, ctx) : A.claimAll(f.st, ctx);
    if (!r) return null;
    f.sfx('coin');
    f.player.celebrate();
    f.changed();
    return r;
  }

  // Проверка (настройки разработчика): достижения как при первом входе
  devReset() { delete this.farm.st.ach; this.farm.changed(); }
}
