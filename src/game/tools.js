// Улучшение инструментов в игре: связывает правила (toolRules.js) с фермой — искры над зданием, тосты,
// звуки, задания, полоска над зданием и сохранение. Топор, кирку и лейку куют в кузнице, удочку улучшают
// в домике рыболова (TOOL_UP[].at). Окно — вкладка улучшения в окне здания (UI.craftPanel → UI.toolsTab),
// карточка инструмента — в рюкзаке (UI.itemInfo).

import * as TR from './toolRules.js';
import * as R from './buildRules.js';
import { TOOL_UP } from './toolData.js';
import { BUILDINGS } from './buildData.js';
import { BAR_KIND, barTop } from './bars.js';
import { fmt } from './buildings.js';

// «готов» / «готова»
const ready = (t) => (TOOL_UP[t].fem ? 'готова' : 'готов');
// картинка в руке призрачка → инструмент (axe → axe, pickaxe → pick, can → can, rod → rod)
const ANIM_OF = Object.fromEntries(Object.values(TOOL_UP).map((T) => [T.anim, T.key]));

export class Tools {
  constructor(farm) { this.f = farm; }

  get st() { return this.f.st; }

  // Здание, где улучшают инструмент t, на карте (null — ещё нет или убрано в рюкзак)
  bld(t) { return this.f.builds.find(TR.atOf(t)); }

  // Раз в секунду и при входе: доделан ли инструмент. quiet — при входе: без искр, только тост.
  tick(now, quiet) {
    const r = TR.upTick(this.st, now);
    if (!r) return null;
    const f = this.f, o = this.bld(r.t), name = TR.toolName(this.st, r.t, r.to);
    if (o && !quiet) {
      f.burst(o.wx, o.wy - 40, '#ffe066', 30);
      f.float(o.wx, o.wy - 110, `${name}: ${ready(r.t)}!`, TOOL_UP[r.t].item);
      f.player.celebrate();
    }
    // что стало лучше — одна-две строки
    const news = TR.upNews(this.st, r.t, r.to).slice(0, 2).map((x) => `${x.label.toLowerCase()} — ${x.val}`).join('; ');
    f.toast(`${name} ${ready(r.t)}! ${news.charAt(0).toUpperCase()}${news.slice(1)}`, 'good');
    f.sfx('unlock');
    f.quests.emit('tool', `${r.t}${r.to}`);
    f.syncBars(now);
    f.changed();
    if (TR.busyAt(this.st).length) this.tick(now, quiet); // кончилось сразу в двух зданиях
    return r;
  }

  // Картинка инструмента в руке призрачка (Player.toolSkin): на 3 уровне axe → axe3 (ghost.js)
  skin(name) {
    const t = ANIM_OF[name], lv = t ? TR.toolLevel(this.st, t) : 1;
    return lv > 1 ? name + lv : name;
  }

  // Отдать инструмент t на улучшение (кнопка в окне). → true, если начали
  start(t) {
    const f = this.f, now = Date.now(), why = TR.upBlock(this.st, t, now);
    if (why) { f.toast(why.why, 'warn'); return false; }
    const r = TR.startUp(this.st, t, now);
    if (!r) return false;
    const o = this.bld(t), at = TR.atOf(t);
    if (o) f.burst(o.wx, o.wy - 30, '#ffb347', 14);
    f.sfx('mine');
    const name = TR.toolName(this.st, t, r.to);
    f.toast(`${name} будет ${ready(t)} через ${fmt(TR.upLeft(this.st, now, at))}. Пока можно ${BUILDINGS[at].tools.old}`, 'good');
    if (TR.upLeft(this.st, now, at) <= 0) this.tick(now);
    f.syncBars(now);
    f.changed();
    return true;
  }

  // Доделать сейчас за кристаллы то, что улучшается в здании at
  speed(at) {
    const now = Date.now(), r = TR.speedUp(this.st, now, at);
    if (!r) return this.f.toast('Не хватает кристаллов', 'warn');
    this.f.sfx('coin');
    this.tick(now);
  }

  // Полоска над зданием, пока там улучшается инструмент (Farm.syncBars). Если над зданием уже есть полоска
  // товара или пузырь «готово» (buildings.bars) — полоска инструмента выше них.
  bars(now, B) {
    for (const at of TR.busyAt(this.st)) {
      const o = this.f.builds.find(at);
      if (!o || !this.f.world.isOpen(o.gx, o.gy) || !R.isBuilt(this.st, at, now)) continue;
      const v = R.queueView(this.st, at, now);
      const top = barTop(this.f.builds.sprite(o, now)) + (v.ready ? 36 : v.jobs.some((j) => j.running) ? 9 : 0);
      B.push(o.wx, o.wy - top, TR.upPart(this.st, now, at), BAR_KIND.tool);
    }
  }
}

export { TR as rules, fmt };
