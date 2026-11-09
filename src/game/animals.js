// Животные в игре: связывает правила (animalRules.js) с фермой — нажатие на животное (покормить, забрать
// продукт, меню «ест ещё…»), прыжок и крошки корма, «+1» над животным, полоска «ест» и пузыри «хочу есть» /
// «готово», звуки, задания и сохранение. Где стоит животное — общий список своих объектов (placed.js).
// Короткие движения (клюёт, щиплет траву, оборачивается…) — только картинка: на правила и сохранение не влияют.

import * as R from './animalRules.js';
import { ANIMALS, ANIMAL_GOODS } from './animalData.js';
import { BUILDINGS, RECIPES } from './buildData.js';
import { ITEMS } from './data.js';
import * as Inv from './inventory.js';
import { BAR_KIND, barTop } from './bars.js';
import { fmt } from './buildings.js';

// цвет крошек корма (кормят) и брызг продукта (забирают)
const FEED_COLOR = { feed_grain: '#e8c25a', feed_rabbit: '#f08a2c', feed_mash: '#b9733f', feed_hay: '#d9b44a' };

// Движения: длительность (с). У каждого животного свой круг движений (animalData.js moves) и свои паузы
// между ними MOVE_GAP, поэтому все двигаются вразнобой. turn — обернулось на TURN секунд и обратно.
const MOVE_T = { peck: 0.55, graze: 1.6, sniff: 0.7, breathe: 1.1, shake: 0.55 };
const MOVE_GAP = [3, 8];
const TURN = [3, 6];
const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);
const ease = (x) => x * x * (3 - 2 * x);

export class Animals {
  constructor(farm) {
    this.f = farm;
    this.live = new Set(); // кто сейчас двигается или стоит обернувшись
    try { this._moves = localStorage.getItem('farm.animalMoves') !== '0'; } catch { this._moves = true; }
  }

  // Двигаются ли животные (настройки → «Экран»); хранится в браузере, как счётчик FPS
  get moves() { return this._moves; }
  set moves(v) {
    this._moves = !!v;
    try { localStorage.setItem('farm.animalMoves', this._moves ? '1' : '0'); } catch { /* без хранилища — до перезапуска */ }
    if (!this._moves) this.still();
  }

  get st() { return this.f.st; }

  is(o) { return R.isAnimal(o); }

  // Картинка: своей стадии и стороны (rot 1 — зеркало; обернулось на время — другая сторона)
  sprite(o) {
    const v = this.f.S.animal && this.f.S.animal[o.type];
    return v ? v[(o.rot || 0) ^ (o.turn > 0 ? 1 : 0)] || v[0] : null;
  }

  // ---------------- Движения (только картинка) ----------------
  // Каждый кадр (Farm.update): идут движения, животные на экране по очереди начинают следующее из своего круга.
  // Пока что-то переставляют — все стоят и смотрят, как поставлены.
  update(dt) {
    const f = this.f, L = this.live;
    for (const o of L) {
      if (o.anim && (o.anim.t += dt) >= o.anim.d) o.anim = null;
      if (o.turn > 0 && (o.turn -= dt) <= 0) { o.turn = 0; o.hop = HOP; }
      if (!o.anim && !o.turn && !(o.hop > 0)) L.delete(o);
    }
    if (!this._moves || !f.scene) return;
    if (f.mover.active) { if (L.size) this.still(); return; }
    const w = f.world, OB = w.objects, E = f.scene.objs;
    for (let i = 0; i < OB.length; i++) {
      const o = OB[i];
      if (!o || !R.isAnimal(o) || o.anim) continue;
      const e = E.get(o);
      if (!e || !e.visible || !w.isOpen(o.gx, o.gy)) continue;
      if (o.moveIn === undefined) o.moveIn = Math.random() * MOVE_GAP[1]; // первое — в случайный момент
      if ((o.moveIn -= dt) > 0) continue;
      o.moveIn = rnd(MOVE_GAP);
      this.move(o);
    }
  }

  // Следующее движение из круга вида
  move(o) {
    const M = ANIMALS[R.infoOf(o.type).sp].moves;
    o.moveN = ((o.moveN === undefined ? Math.floor(Math.random() * M.length) : o.moveN) + 1) % M.length;
    const k = M[o.moveN];
    if (k === 'turn') { if (o.turn > 0) return; o.turn = rnd(TURN); o.hop = HOP; }
    else if (k === 'hop') o.hop = HOP;
    else o.anim = { k, t: 0, d: MOVE_T[k] };
    this.live.add(o);
  }

  // Все стоят как поставлены (выключили движения, начали переставлять)
  still() {
    for (const o of this.live) { o.anim = null; o.turn = 0; }
    this.live.clear();
  }

  // Нужны частые кадры (Farm.isIdle): кто-то в движении или в прыжке. Обернувшееся стоит — кадры не нужны.
  get moving() {
    for (const o of this.live) if (o.anim || o.hop > 0) return true;
    return false;
  }

  // Картинка в движении: { rot (радианы), sx, sy } вокруг точки опоры (между ног) или null (PixiScene).
  // Нарисованы мордой влево: наклон «головой вниз» — против часовой, у повёрнутого — по часовой.
  pose(o) {
    const A = o.anim;
    if (!A) return null;
    const u = Math.min(1, A.t / A.d), dir = (o.rot || 0) ^ (o.turn > 0 ? 1 : 0) ? 1 : -1, P = Math.PI;
    switch (A.k) {
      case 'peck': return { rot: dir * 0.17 * Math.sin(P * ((u * 2) % 1)), sx: 1, sy: 1 }; // два быстрых клевка
      case 'graze': { // наклонилось, жуёт, поднялось
        const env = u < 0.3 ? ease(u / 0.3) : u > 0.75 ? ease((1 - u) / 0.25) : 1;
        return { rot: dir * env * (0.08 + 0.012 * Math.sin(A.t * 18)), sx: 1, sy: 1 };
      }
      case 'sniff': return { rot: dir * 0.035 * Math.sin(u * 6 * P) * Math.sin(P * u), sx: 1, sy: 1 };
      case 'breathe': { const b = Math.sin(P * u); return { rot: 0, sx: 1 - 0.025 * b, sy: 1 + 0.05 * b }; }
      case 'shake': { const b = Math.sin(u * 8 * P) * (1 - u); return { rot: 0.07 * b, sx: 1 + 0.02 * Math.abs(b), sy: 1 }; }
    }
    return null;
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
