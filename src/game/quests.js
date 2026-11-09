// Задания в игре: связывает правила (questRules.js) с фермой. Правила меняют состояние и возвращают
// события, а здесь из них получаются тосты, звуки, опыт и салют. Таблицы заданий — questData.js.

import * as R from './questRules.js';
import { QUEST_TZ, PERIODS } from './questData.js';

export class Quests {
  constructor(farm) {
    this.farm = farm;
    this.lastCard = null; // что было на карточке, когда ничего не закреплено: без причины она не перескакивает
  }

  get st() { return R.questState(this.farm.st); }

  // Время заданий. В настройках разработчика можно сдвинуть часы и включить событие (farm.dev).
  // stats — сколько грядок (цели «Пусть на ферме будет N грядок»): это знает только мир
  ctx() {
    const f = this.farm, d = f.dev || {};
    return { now: Date.now() + (d.shift || 0), tz: QUEST_TZ, rng: Math.random, force: d.event || null, stats: f.world ? f.bedCounts() : null };
  }

  views() { return R.views(this.farm.st, this.ctx()); }

  view(id) { return this.views().find((v) => v.id === id) || null; }

  // Карточки заданий под ресурсами (до MAX_PINS)
  cards(vs = this.views()) {
    const c = R.cards(this.farm.st, vs, this.lastCard);
    this.lastCard = c.length === 1 ? c[0].id : null;
    return c;
  }

  isPinned(id) { return R.isPinned(this.farm.st, id); }

  emit(ev, key, n = 1) { this.handle(R.onEvent(this.farm.st, ev, key, n, this.ctx())); }

  check() { this.handle(R.check(this.farm.st, this.ctx())); }

  // Раз в секунду и при входе: новый день, неделя, месяц, начало и конец событий
  tick() {
    const out = R.refresh(this.farm.st, this.ctx());
    if (!out.length) return;
    this.handle(out);
    this.farm.changed();
  }

  handle(out) {
    const f = this.farm, ui = f.ui;
    let sound = false;
    for (const e of out) {
      if (e.type === 'done') { ui.questDone(e.view); sound = true; }
      else if (e.type === 'credit') {
        if (e.reward.xp) f.addXp(e.reward.xp);
        ui.toast(`${e.what}: награды начислены ${ui.rewardHtml(e.reward)}`, 'good');
      } else if (e.type === 'new') {
        if (e.first && e.kind === 'day') ui.toast('Открылись задания на день, неделю и месяц!', 'good');
        else if (e.kind === 'day') ui.toast('Новые задания дня!');
        else if (e.kind !== 'day' && !e.first) ui.toast(`Новые ${PERIODS[e.kind].title.toLowerCase()}!`);
      } else if (e.type === 'eventStart') { ui.toast(`Началось событие «${e.ev.name}»!`, 'good'); sound = true; }
    }
    if (sound) f.sfx('quest');
  }

  // Забрать награду: возвращает результат правил (next — следующее задание той же ветки) или null
  claim(id) {
    const f = this.farm, r = R.claim(f.st, id, this.ctx());
    if (!r) return null;
    f.sfx('coin');
    if (r.reward.xp) f.addXp(r.reward.xp);
    f.player.celebrate();
    this.handle(r.events);
    f.changed();
    return r;
  }

  swap(id) {
    if (!R.swap(this.farm.st, id, this.ctx())) return false;
    this.farm.sfx('tap');
    this.farm.changed();
    return true;
  }

  // Закрепить задание на экране или снять. false — на экране уже MAX_PINS заданий.
  pin(id, on = true) {
    const ok = R.setPin(this.farm.st, id, on, this.ctx());
    this.farm.changed();
    return ok;
  }
}
