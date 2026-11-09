// Здания с крафтом и улучшение дома в игре: связывает правила (buildRules.js, houseRules.js) с фермой —
// картинка здания или лесов, нажатие на здание, салют в конце стройки, всплывающие «+1» за готовые
// товары, звуки и сохранение. Окна — UI.craftPanel и UI.housePanel. Где стоит здание — общий список
// своих объектов (placed.js).

import * as R from './buildRules.js';
import * as H from './houseRules.js';
import { BUILDINGS, RECIPES } from './buildData.js';
import { OBJECTS, ITEMS, HOUSE } from './data.js';
import { BAR_KIND, barTop } from './bars.js';

export class Buildings {
  constructor(farm) { this.f = farm; }

  get st() { return this.f.st; }

  // Здание ли это (объект карты)
  is(o) { return !!(o && OBJECTS[o.type] && OBJECTS[o.type].building); }

  // Объект здания k на карте (null — ещё нет или убрано в рюкзак)
  find(k) { return this.f.world.objects.find((o) => o && o.type === k) || null; }

  // Картинка: пока идёт стройка — это же здание в лесах, потом само здание. o.preview — призрак в режиме
  // «Поставить»: чертёж ставится лесами, здание из рюкзака — готовым.
  sprite(o, now = Date.now()) {
    const S = this.f.S, k = o.type;
    if (o.preview) return ITEMS[o.item] && ITEMS[o.item].blueprint ? S.sites[k] : S.buildings[k];
    return R.isBuilt(this.st, k, now) ? S.buildings[k] : S.sites[k];
  }

  // Дом: пока идёт улучшение — дом следующего уровня в лесах
  houseSprite() {
    const S = this.f.S, u = H.houseUp(this.st);
    return (u && S.houseUp[u.to]) || S.house[this.st.house];
  }
  house() { return this.f.world.objects.find((o) => o && o.type === 'house') || null; }

  // Раз в секунду и при входе: кончилась ли стройка (опыт начисляется один раз). quiet — при входе:
  // без салюта, только тост.
  tick(now, quiet) {
    const done = R.buildTick(this.st, now);
    for (const { k, xp } of done) {
      const b = BUILDINGS[k], o = this.find(k);
      if (o && !quiet) {
        this.f.burst(o.wx, o.wy - 40, '#ffe066', 30);
        this.f.float(o.wx, o.wy - 110, `${b.short || b.name}: готово!`, null);
        this.f.player.celebrate();
      }
      // кухня, мастерская, кузница — «она», кормоцех — «он» (b.he)
      this.f.toast(`${b.name} ${b.he ? 'построен' : 'построена'}! Нажмите на ${b.he ? 'него' : 'неё'}, чтобы ${b.verb.toLowerCase()} что-нибудь`, 'good');
      this.f.sfx('unlock');
      this.f.addXp(xp);
      this.f.quests.emit('build', k);
    }
    const up = H.houseTick(this.st, now);
    if (up) this.houseDone(up, quiet);
    if (done.length || up) { this.f.world.version++; this.f.changed(); }
    // готовые товары появились — пузырь над зданием
    const ready = this.readyKey(now);
    if (ready !== this._ready) { this._ready = ready; this.f.syncBars(now); }
  }

  readyKey(now) { return Object.keys(R.builds(this.st)).map((k) => R.readyCount(this.st, k, now)).join(','); }

  // Нажали на здание: стройка — меню со временем и ускорением; есть готовое — забрать; иначе окно здания
  tap(o, sx, sy) {
    const k = o.type, b = BUILDINGS[k], now = Date.now();
    if (!R.isBuilt(this.st, k, now)) {
      const left = R.buildLeft(this.st, k, now), gems = R.gemsFor(left);
      this.f.ui.popup(sx, sy, {
        title: `Стройка: ${(b.short || b.name).toLowerCase()}`, text: `Будет готово через ${fmt(left)}`,
        items: [{ icon: 'gem', label: 'Достроить сейчас', sub: `${gems} ${this.f.ui.ic('gem', 'ic ic-s')}`, disabled: this.st.gems < gems, onClick: () => this.speedBuild(k) }],
      });
      // время в меню идёт
      this.f.ui._popupTick = () => {
        const t = this.f.ui.popupEl.querySelector('.pp-text');
        if (t) t.textContent = R.isBuilt(this.st, k, Date.now()) ? 'Готово!' : `Будет готово через ${fmt(R.buildLeft(this.st, k, Date.now()))}`;
      };
      return;
    }
    if (R.readyCount(this.st, k, now)) return this.collect(k);
    this.f.ui.craftPanel(this.f, k);
  }

  // Чертёж поставили на карту (Mover → Farm.placedFx): стройка началась. → надпись для плашки перестановки
  placed(o) {
    const k = o.type, b = BUILDINGS[k], now = Date.now();
    this.f.syncBars(now);
    if (R.isBuilt(this.st, k, now)) return null;
    this.f.burst(o.wx, o.wy - 20, '#e8d9a8', 18);
    return `Стройка началась: ${(b.short || b.name).toLowerCase()} будет ${b.he ? 'готов' : 'готова'} через ${fmt(R.buildLeft(this.st, k, now))}`;
  }

  // ---------- Дом ----------

  // Начать улучшение дома (кнопка в окне дома). → true, если началось
  upgradeHouse() {
    const f = this.f, now = Date.now(), why = H.houseUpBlock(this.st, f.world.unlockedCount());
    if (why) { f.toast(why.why, 'warn'); return false; }
    const r = H.startHouseUp(this.st, f.world.unlockedCount(), now);
    const o = this.house();
    if (o) f.burst(o.wx, o.wy - 20, '#e8d9a8', 18);
    f.sfx('dig');
    f.toast(`Дом улучшается до ${r.to} уровня: будет готово через ${fmt(H.houseUpLeft(this.st, now))}`, 'good');
    f.world.version++;
    if ((HOUSE[r.to].time || 0) <= 0) this.tick(now); // без времени — сразу готово
    f.changed();
    return true;
  }

  speedHouse() {
    const r = H.speedHouseUp(this.st, Date.now());
    if (!r) return this.f.toast('Не хватает кристаллов', 'warn');
    this.f.sfx('coin');
    this.tick(Date.now());
    this.f.changed();
  }

  // Улучшение кончилось (tick): новый уровень, энергия выросла. quiet — при входе: без салюта.
  houseDone(up, quiet) {
    const f = this.f, o = this.house();
    if (o && !quiet) {
      f.burst(o.wx, o.wy - 40, '#ffe066', 30);
      f.float(o.wx, o.wy - 110, `Дом ${up.to} ур.`, null);
      f.player.celebrate();
    }
    f.toast(`Дом улучшен до ${up.to} уровня! Энергия: ${HOUSE[up.to].energy}`, 'good');
    f.sfx('unlock');
    f.addXp(20);
  }

  // Купить чертёж здания k (Farm.buy): один на ферму
  buyBlueprint(k, offer) { return R.buyBlueprint(this.st, k, offer); }

  speedBuild(k) {
    const r = R.speedBuild(this.st, k, Date.now());
    if (!r) return this.f.toast('Не хватает кристаллов', 'warn');
    this.f.sfx('coin');
    this.tick(Date.now());
    this.f.changed();
  }

  // Поставить рецепт id в очередь здания k
  craft(k, id) {
    const now = Date.now(), why = R.craftBlock(this.st, k, id, now);
    if (why) return this.f.toast(why, 'warn');
    R.craft(this.st, k, id, now);
    const o = this.find(k);
    if (o) this.f.burst(o.wx, o.wy - 30, '#e8d9a8', 8);
    this.f.sfx('plant');
    this.f.syncBars(now);
    this.f.changed();
  }

  // Забрать готовое из здания k: «+N» над зданием, опыт, задания
  collect(k) {
    const now = Date.now(), r = R.collect(this.st, k, now);
    if (!r) return;
    const o = this.find(k);
    if (o) { this.f.dropFx({ wx: o.wx, wy: o.wy - 50 }, r.items); this.f.burst(o.wx, o.wy - 50, '#ffe066', 12); }
    for (const { id, n } of r.items) this.f.quests.emit('craft', id, n);
    this.f.sfx('harvest');
    if (r.xp) this.f.addXp(r.xp);
    this.f.syncBars(now);
    this.f.changed();
  }

  cancel(k, idx) {
    const r = R.cancel(this.st, k, idx, Date.now());
    if (!r) return;
    this.f.sfx('dig');
    this.f.syncBars();
    this.f.changed();
  }

  speedCraft(k) {
    const r = R.speedCraft(this.st, k, Date.now());
    if (!r) return this.f.toast('Не хватает кристаллов', 'warn');
    this.f.sfx('coin');
    this.f.syncBars();
    this.f.changed();
  }

  // Полоски и пузыри над зданиями (Farm.syncBars): стройка — полоска стройки; делается товар —
  // полоска крафта; есть готовое — пузырь с галочкой (B — полоски по 4 числа, U — пузыри по 2)
  bars(now, B, U) {
    const h = H.upgrading(this.st) && this.house();
    if (h && this.f.world.isOpen(h.gx, h.gy)) B.push(h.wx, h.wy - barTop(this.houseSprite()), H.houseUpPart(this.st, now), BAR_KIND.build);
    for (const o of this.f.world.objects) {
      if (!this.is(o) || !this.f.world.isOpen(o.gx, o.gy)) continue;
      const k = o.type, s = this.sprite(o, now), top = barTop(s);
      if (!R.isBuilt(this.st, k, now)) {
        const b = BUILDINGS[k], left = R.buildLeft(this.st, k, now);
        B.push(o.wx, o.wy - top, Math.max(0, Math.min(1, 1 - left / b.time)), BAR_KIND.build);
        continue;
      }
      const v = R.queueView(this.st, k, now);
      if (v.ready) { U.push(o.wx, o.wy - top + 6); continue; }
      const j = v.jobs.find((x) => x.running);
      if (j) B.push(o.wx, o.wy - top, j.k, BAR_KIND.craft);
    }
  }

  // Что делается во всех зданиях (окно, подсказки): { k: queueView }
  views(now = Date.now()) {
    const out = {};
    for (const k of Object.keys(BUILDINGS)) out[k] = R.queueView(this.st, k, now);
    return out;
  }
}

// «2 мин 5 с», «1 ч 10 мин»
export function fmt(sec) {
  sec = Math.ceil(sec);
  if (sec < 60) return `${sec} с`;
  if (sec < 3600) { const m = Math.floor(sec / 60), s = sec % 60; return s ? `${m} мин ${s} с` : `${m} мин`; }
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export { R as rules, H as houseRules, RECIPES };
