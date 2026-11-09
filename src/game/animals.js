// Животные в игре: связывает правила (animalRules.js) с фермой — нажатие на животное (покормить, забрать
// продукт, меню «ест ещё…»), прыжок и крошки корма, «+1» над животным, полоска «ест» и пузыри «хочу есть» /
// «готово», звуки, задания и сохранение. Где стоит животное — общий список своих объектов (placed.js).

import * as R from './animalRules.js';
import { ANIMALS, ANIMAL_GOODS } from './animalData.js';
import { BUILDINGS, RECIPES } from './buildData.js';
import { ITEMS } from './data.js';
import * as Inv from './inventory.js';
import { BAR_KIND, barTop } from './bars.js';
import { fmt } from './buildings.js';

// цвет крошек корма (кормят) и брызг продукта (забирают)
const FEED_COLOR = { feed_grain: '#e8c25a', feed_rabbit: '#f08a2c', feed_mash: '#b9733f', feed_hay: '#d9b44a' };

export class Animals {
  constructor(farm) { this.f = farm; }

  get st() { return this.f.st; }

  is(o) { return R.isAnimal(o); }

  // Картинка: своей стадии и стороны (rot 1 — зеркало)
  sprite(o) {
    const v = this.f.S.animal && this.f.S.animal[o.type];
    return v ? v[o.rot || 0] || v[0] : null;
  }

  // Раз в секунду и при входе: кто доел — подрос (брызги, надпись, опыт) или приготовил продукт (пузырь).
  // quiet — при входе: без эффектов, только опыт и тост, если кто-то подрос.
  tick(now, quiet) {
    const ev = R.tick(this.st, this.f.world, now);
    if (!ev.length) return;
    let grew = 0;
    for (const e of ev) {
      if (!e.grew) continue;
      grew++;
      const a = ANIMALS[e.sp], name = a.names[e.grew];
      if (!quiet) {
        this.f.burst(e.o.wx, e.o.wy - 16, '#ffe066', 16);
        this.f.float(e.o.wx, e.o.wy - 50, `Подрос: ${name.toLowerCase()}!`, null);
        e.o.hop = HOP;
      }
      if (e.xp) this.f.addXp(e.xp);
      this.f.quests.emit('grow', e.sp);
      if (e.grew === 2) this.f.quests.emit('adult', e.sp);
    }
    if (grew) this.f.sfx('unlock');
    if (quiet && grew) this.f.toast(grew === 1 ? 'Пока вас не было, одно животное подросло!' : `Пока вас не было, подросли животные: ${grew}`, 'good');
    this.f.syncBars(now);
    this.f.changed();
  }

  // Нажали на животное: готов продукт — забрать; голодное и есть корм — покормить; иначе — меню
  tap(o, sx, sy) {
    const f = this.f, now = Date.now();
    R.settle(this.st, f.world, o, now);
    const v = R.view(o, now);
    if (v.state === 'ready') return this.collect(o);
    if (v.state === 'hungry' && Inv.count(this.st, v.feed)) return this.feed(o);
    this.popup(o, sx, sy);
  }

  // Меню животного: ест (сколько осталось, ускорить) или нет корма (где взять); переставить, повернуть
  popup(o, sx, sy) {
    const f = this.f, ui = f.ui, now = Date.now(), v = R.view(o, now);
    const items = [];
    let text;
    if (v.state === 'eating') {
      const gems = R.gemsFor(v.left);
      text = this.eatText(o, now);
      items.push({ icon: 'gem', label: 'Доест сейчас', sub: `${gems} ${ui.ic('gem', 'ic ic-s')}`, disabled: this.st.gems < gems, onClick: () => this.speed(o) });
    } else {
      const fd = ITEMS[v.feed], b = BUILDINGS.feedmill, built = !!(this.st.builds && this.st.builds.feedmill);
      text = `Нет корма: ${fd.name.toLowerCase()}. ${built ? 'Сделайте его в Кормоцехе.' : 'Его делает Кормоцех: чертёж — на рынке, в разделе «Постройки».'}`;
      const mill = f.world.objects.find((x) => x && x.type === 'feedmill');
      if (mill) items.push({ icon: 'bld_feedmill', label: b.name, onClick: () => f.builds.tap(mill, sx, sy) });
      else items.push({ icon: 'market', label: 'На рынок', onClick: () => ui.marketPanel(f, 'buy', built ? null : 'bp_feedmill') });
    }
    items.push({ icon: 'move', label: 'Переставить', onClick: () => f.moveThis(o) });
    items.push({ icon: 'rotate', label: 'Повернуть', onClick: () => { f.moveThis(o); f.mover.rotate(); } });
    ui.popup(sx, sy, { title: v.name, text, items });
    if (v.state === 'eating') {
      // время в меню идёт; доело — меню закрывается (пузырь «готово» или «хочу есть» уже над животным)
      ui._popupTick = () => {
        const t = ui.popupEl.querySelector('.pp-text'), n = Date.now();
        if (R.stateOf(o, n) !== 'eating') return ui.closePopup();
        if (t) t.textContent = this.eatText(o, n);
      };
    }
  }

  // «Ест: ещё 3 мин. Покормлено 1 из 3 — потом станет молодкой» / «Яйцо будет через 12 мин»
  eatText(o, now) {
    const v = R.view(o, now), left = fmt(v.left);
    if (v.stage >= 2) {
      const p = ITEMS[v.product];
      return `${p.name}${v.a.n > 1 ? ` ×${v.a.n}` : ''} будет через ${left}`;
    }
    return `Ест ещё ${left}. Покормлено ${v.fed + 1} из ${v.need}, потом — ${v.a.names[v.stage + 1].toLowerCase()}`;
  }

  // Покормить: корм −1, прыжок и крошки, опыт, задание «Покорми»
  feed(o) {
    const f = this.f, now = Date.now(), r = R.feed(this.st, f.world, o, now);
    if (r.why) return f.toast(r.why, 'warn');
    o.hop = HOP;
    f.burst(o.wx, o.wy - 8, FEED_COLOR[r.feed] || '#e8c25a', 10);
    f.float(o.wx, o.wy - 40, '−1', r.feed);
    f.sfx('eat');
    if (r.xp) f.addXp(r.xp);
    f.quests.emit('feed', R.infoOf(o.type).sp);
    f.syncBars(now);
    f.changed();
  }

  // Забрать продукт: «+N» над животным, опыт, задание
  collect(o) {
    const f = this.f, now = Date.now(), r = R.collect(this.st, f.world, o, now);
    if (!r) return;
    if (r.why) return f.toast(r.why, 'warn');
    o.hop = HOP;
    f.dropFx(o, [{ id: r.id, n: r.n }]);
    f.burst(o.wx, o.wy - 24, (ANIMAL_GOODS[r.id] && ANIMAL_GOODS[r.id].color) || '#ffffff', 10);
    f.sfx('harvest');
    if (r.xp) f.addXp(r.xp);
    f.quests.emit('animal', r.id, r.n);
    f.syncBars(now);
    f.changed();
  }

  speed(o) {
    const f = this.f, now = Date.now(), r = R.speed(this.st, f.world, o, now);
    if (!r) return f.toast('Не хватает кристаллов', 'warn');
    f.sfx('coin');
    if (r.grew) { this.tickOne(r); } else o.hop = HOP;
    f.syncBars(now);
    f.changed();
  }

  // Подросло сразу (ускорение): те же эффекты, что в tick
  tickOne(e) {
    const a = ANIMALS[e.sp];
    this.f.burst(e.o.wx, e.o.wy - 16, '#ffe066', 16);
    this.f.float(e.o.wx, e.o.wy - 50, `Подрос: ${a.names[e.grew].toLowerCase()}!`, null);
    e.o.hop = HOP;
    this.f.sfx('unlock');
    if (e.xp) this.f.addXp(e.xp);
    this.f.quests.emit('grow', e.sp);
    if (e.grew === 2) this.f.quests.emit('adult', e.sp);
  }

  // Полоски и пузыри над животными (Farm.syncBars): ест — полоска; голодное — пузырь с его кормом;
  // продукт готов — пузырь с продуктом. U — пузыри по 3 значения: x, y, картинка
  bars(now, B, U) {
    const w = this.f.world, S = this.f.S;
    for (const o of w.objects) {
      if (!R.isAnimal(o) || !w.isOpen(o.gx, o.gy)) continue;
      const s = R.stateOf(o, now), top = barTop(this.sprite(o));
      if (s === 'eating') { B.push(o.wx, o.wy - top, R.eatPart(o, now), BAR_KIND.animal); continue; }
      const a = ANIMALS[R.infoOf(o.type).sp], bub = S.bubble && S.bubble[s === 'ready' ? a.product : a.feed];
      if (bub && s !== 'done') U.push(o.wx, o.wy - top + 6, bub);
    }
  }

  // Что с животными (подсказки к заданиям): [{ o, v }]
  list(now = Date.now()) {
    return this.f.world.objects.filter((o) => R.isAnimal(o)).map((o) => ({ o, v: R.view(o, now) }));
  }
}

// длительность прыжка (с), PixiScene рисует его по o.hop
export const HOP = 0.35;

export { R as rules, RECIPES };
