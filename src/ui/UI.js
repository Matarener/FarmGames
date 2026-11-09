// Интерфейс поверх канваса (DOM): верхняя панель, ресурсы, кнопки,
// всплывающие меню у объектов, окна, уведомления. DOM обновляется только
// при изменениях, а не каждый кадр.

import { HOUSE, ITEMS, INV_TABS, SELL_TABS, SHOP, SHOP_TABS, CROPS, FLORA, BED_ITEM, BEDS, seedId, floraSeedId, floraOwnId, xpToNext, houseNeedChunks, DEV_LIMITS, STORE_ALL } from '../game/data.js';
import * as Inv from '../game/inventory.js';
import * as Beds from '../game/beds.js';
import * as Plant from '../game/planting.js';
import * as R from '../game/questRules.js';
import { PERIODS, EVENTS, PERIODIC_LEVEL, QUEST_TZ, MAX_PINS } from '../game/questData.js';
import { GIFT_TABS, DAILY_GIFT } from '../game/giftData.js';
import { WHEEL } from '../game/wheelData.js';
import { ACH_GROUPS, ACH_MEDALS } from '../game/achData.js';
import { hasHint, hintAuto } from '../game/hints.js';
import { MUSIC } from '../engine/Audio.js';
import * as Dev from '../game/devRules.js';
import { BUILDINGS, RECIPES, bldId } from '../game/buildData.js';
import * as BR from '../game/buildRules.js';
import * as HR from '../game/houseRules.js';
import { Mover } from '../game/Mover.js';

// версия сборки (tools/build.mjs); при локальном запуске — «локально»
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'локально';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const RES_NAMES = { wood: 'Дерево', stone: 'Камень', ore: 'Руда', coins: 'Монеты', gems: 'Кристаллы' };
// кнопки, к которым может показать стрелка-подсказка (UI.hint)
const HINT_EL = { quest: '#btn-quests', market: '#btn-market', beds: '#btn-beds', bag: '#btn-bag' };
// вкладки окна «Задания»: периодические появляются с PERIODIC_LEVEL, «Событие» — пока оно идёт
const QTABS = [
  { key: 'main', name: 'Основные', icon: 'star' },
  ...Object.entries(PERIODS).map(([key, p]) => ({ key, name: p.name, icon: p.icon })),
  { key: 'event', name: 'Событие', icon: 'decor' },
];
const tabOf = (v) => (v.kind === 'line' ? 'main' : v.kind);
const EVENT_NAME = (id) => { const e = EVENTS.find((x) => x.id === id); return e ? e.name : 'Событие'; };

export class UI {
  constructor(root) {
    this.root = root;
    this.icons = {};
    this.last = {};
    this.popupEl = $('#popup', root);
    this.panelEl = $('#panel', root);
    this.toastEl = $('#toast', root);
    this.panelEl.addEventListener('click', (e) => { if (e.target === this.panelEl) this.closePanel(); });
    // Нажатия по интерфейсу не должны долетать до карты
    for (const el of root.querySelectorAll('.ui-layer')) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    // нажатие мимо меню «Ещё» закрывает его
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#more-menu, #btn-more')) this.toggleMore(false); }, true);
    // Нажатие «насквозь». Меню и окна у карты открываются, когда палец отпускают (Input.onTap), и телефон
    // сразу присылает click в ту же точку: он попадал по кнопке только что открытого меню (сама сажалась
    // морковка) или по фону окна (окно тут же закрывалось). По меню и окну засчитываем только нажатия,
    // начатые после их открытия (_openT). Нажатия с клавиатуры (detail 0) — всегда.
    this._downT = 0; this._openT = -1;
    document.addEventListener('pointerdown', () => { this._downT = performance.now(); }, true);
    root.addEventListener('click', (e) => {
      if (e.detail && this._downT <= this._openT && e.target.closest('#popup, #panel')) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    window.addEventListener('resize', () => { this._safe = null; });
  }

  bind(farm, icons) {
    this.farm = farm;
    this.icons = icons;
    this.refreshIcons();
    farm.onIcons = () => { clearTimeout(this._icT); this._icT = setTimeout(() => this.refreshIcons(), 30); };
    $('#btn-bag').onclick = () => this.bagPanel(farm);
    // есть заказ, который можно сдать (цифра на кнопке), — рынок открывается на «Заказах»
    $('#btn-market').onclick = () => this.marketPanel(farm, farm.orders.ready() ? 'orders' : null);
    $('#btn-quests').onclick = () => this.questPanel(farm);
    $('#btn-gift').onclick = () => this.giftPanel(farm, 'daily');
    $('#btn-wheel').onclick = () => this.wheelPanel(farm);
    $('#btn-center').onclick = () => { farm.player.worldPos(this._p = this._p || {}); farm.cam.centerOn(this._p.x, this._p.y - 20); };
    $('#energy-pill').onclick = () => this.bagPanel(farm);
    $('#btn-more').onclick = () => this.toggleMore();
    $('#mb-done').onclick = () => farm.mover.exit();
    $('#mb-cancel').onclick = () => farm.mover.cancel();
    $('#mb-place').onclick = () => farm.mover.place();
    $('#mb-store').onclick = () => farm.mover.store();
    $('#mb-rot').onclick = () => farm.mover.rotate();
    $('#mb-all').onclick = () => this.storeAllPanel(farm);
    $('#pb-pick').onclick = () => {
      const P = farm.planting;
      if (!P) return;
      if (P.species) this.sowPanel(farm, null, null); else this.plantPanel(farm, null);
    };
    $('#btn-beds').onclick = () => farm.pickBeds();
    $('#pb-x').onclick = () => farm.stopPlanting();
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && farm.mover.active) farm.mover.exit(); });
  }

  refreshIcons() {
    // иконки грузятся вместе с картинками художника; до этого у <img> нет адреса
    for (const img of this.root.querySelectorAll('img[data-icon]')) { const u = this.icons[img.dataset.icon]; if (u) img.src = u; }
    const av = this.root.querySelector('.avatar');
    if (av && this.icons.avatar && !av.querySelector('img')) av.innerHTML = `<img src="${this.icons.avatar}" alt="">`;
    // стрелка-подсказка у кнопок (style.css: .hint::after)
    if (this.icons.hint_arrow) this.root.style.setProperty('--hint-arrow', `url("${this.icons.hint_arrow}")`);
  }

  // Стрелка-подсказка у кнопки интерфейса: 'quest' — забрать награду (у карточки задания id, а если его
  // нет на экране — у кнопки «Задания»), 'market' — рынок (есть что продать), null — убрать. Цель выбирает hints.js.
  hint(name, id) {
    const e = name === 'quest' ? $(`.quest-card[data-id="${id}"]`, this.root) || $(HINT_EL.quest, this.root) : name && $(HINT_EL[name], this.root);
    if (this._hintEl === e) return;
    // снимаем со всех, а не только с запомненной: стрелка не должна остаться висеть у кнопки
    for (const o of this.root.querySelectorAll('.hint')) if (o !== e) o.classList.remove('hint');
    this._hintEl = e || null;
    if (e) e.classList.add('hint');
  }

  // Свободная от интерфейса часть экрана (пиксели холста): в ней видна стрелка над целью задания,
  // а у её края встаёт кружок подсказки. Пересчитывается после поворота экрана и смены карточки задания.
  safeArea() {
    if (this._safe) return this._safe;
    const R = this.root.getBoundingClientRect();
    const box = (sel) => { const e = $(sel, this.root); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
    const hud = box('.hud-top'), qc = box('#quest-cards'), nav = box('#btn-bag'), fab = box('#btn-center'), side = box('.hud-side');
    const t = Math.max(hud ? hud.bottom : 0, qc ? qc.bottom : 0, side ? side.bottom : 0) - R.top + 4;
    const b = Math.min(nav ? nav.top : R.bottom, fab ? fab.top : R.bottom) - R.top - 4;
    this._safe = { l: 6, t, r: R.width - 6, b: Math.max(t + 40, b) };
    return this._safe;
  }

  ic(name, cls = 'ic') { return `<img class="${cls}" src="${this.icons[name] || ''}" alt="">`; }

  set(id, val) { if (this.last[id] !== val) { this.last[id] = val; const e = document.getElementById(id); if (e) e.textContent = val; } }

  update(f) {
    const st = f.st;
    this.set('hud-level', st.level);
    // пока крутится колесо, приз ещё не показан: в кошельке — без него (только цена вращения списана)
    const hold = this._wspin && this._wspin.hold;
    this.set('hud-coins', fmtNum(hold ? hold.coins : st.coins));
    this.set('hud-gems', fmtNum(hold ? hold.gems : st.gems));
    this.set('hud-energy', `${st.energy}/${f.maxEnergy}`);
    this.set('hud-can', `${st.can}/${f.canMax}`);
    const pct = Math.min(100, (st.xp / xpToNext(st.level)) * 100).toFixed(1) + '%';
    if (this.last.xp !== pct) { this.last.xp = pct; $('#hud-xp').style.width = pct; }
    this.questCards(f);
    this.moreBadge(f);
    this.marketBadge(f);
    this.bedsBadge(f);
    this.giftTick(f, false);
    this.wheelTick(f, false);
    this.tick(f);
    const kind = this.panelEl.dataset.kind;
    // окно колеса не пересобирается, пока оно крутится (иначе вращение оборвётся)
    if (kind && kind !== 'settings' && kind !== 'devitems' && this.panelOpen && !(kind === 'wheel' && this._wspin)) this.refreshPanel();
    this.plantBar(f);
  }

  tick(f) {
    const full = f.st.energy >= f.maxEnergy;
    this.set('hud-energy-t', full ? '' : fmtClock(f.energyLeftSec()));
    if (this.panelOpen && this.panelEl.dataset.kind === 'bag') this.set('bag-en', this.bagEnergy(f));
    if (this.panelOpen && this.panelEl.dataset.kind === 'market' && this.mk && this.mk.mode === 'orders') this.ordersTick(f);
    this.giftTick(f, true);
    this.wheelTick(f, true);
    if (this.popupEl.classList.contains('show') && this._popupTick) this._popupTick();
    if (this.panelOpen && this.panelEl.dataset.kind === 'craft') this.craftTick(f);
    if (this.panelOpen && this.panelEl.dataset.kind === 'house') this.houseTick(f);
  }

  toast(msg, kind) {
    const t = h('div', 'toast-item' + (kind ? ' ' + kind : ''), msg);
    this.toastEl.appendChild(t);
    // лишние старые уходят плавно (а не исчезают рывком, сдвигая остальные)
    const live = [...this.toastEl.children].filter((e) => !e.classList.contains('hide'));
    for (let i = 0; i < live.length - 3; i++) this.toastOut(live[i]);
    setTimeout(() => this.toastOut(t), 2200);
  }

  // уведомление тает и плавно схлопывается по высоте — соседние съезжают мягко
  toastOut(t) {
    if (t.classList.contains('hide')) return;
    t.style.height = t.offsetHeight + 'px';
    void t.offsetHeight; // зафиксировать высоту, чтобы переход сработал
    t.classList.add('hide');
    t.style.height = '0px';
    setTimeout(() => t.remove(), 450);
  }

  levelUp(level, opened, coins) {
    const t = h('div', 'levelup', `<div class="lv-star">${this.ic('star', 'ic big')}<b>${level}</b></div><div class="lv-text"><b>Новый уровень!</b><span>+1 ${this.ic('gem')} +${coins} ${this.ic('coin')}${opened.length ? '<br>Открыто: ' + opened.join(', ') : ''}</span></div>`);
    this.root.appendChild(t);
    setTimeout(() => t.classList.add('hide'), 2800);
    setTimeout(() => t.remove(), 3300);
  }

  costHtml(cost, f) {
    return Object.entries(cost).map(([k, v]) => {
      const have = k === 'coins' ? f.st.coins : k === 'gems' ? f.st.gems : Inv.count(f.st, k);
      const icon = k === 'coins' ? 'coin' : k === 'gems' ? 'gem' : k;
      return `<span class="cost ${have < v ? 'lack' : ''}" title="${RES_NAMES[k] || k}">${this.ic(icon)}${have < v ? `${fmtNum(have)}/` : ''}${fmtNum(v)}</span>`;
    }).join('');
  }

  // ---------- Задания ----------
  // Карточки заданий под ресурсами (Quests.cards): закреплённые игроком и сюжет, до трёх.
  // Красный кружок на кнопке «Задания» — сколько наград можно забрать во всех ветках.
  questCards(f) {
    const Q = f.quests, vs = Q.views(), list = Q.cards(vs), n = R.claimable(vs);
    const key = list.map((q) => `${q.id}:${q.goals.map((g) => g.p).join(',')}:${q.done}`).join('|') + '#' + n;
    if (this.last.quest === key) return;
    this.last.quest = key;
    const badge = $('#quests-badge');
    badge.hidden = !n; badge.textContent = n;
    const box = $('#quest-cards');
    box.innerHTML = '';
    this._safe = null; // высота карточек могла поменяться
    // карточки пересозданы: если стрелка была на старой карточке, она ушла вместе с ней
    if (this._hintEl && !this._hintEl.isConnected) this._hintEl = null;
    for (const q of list) {
      const done = q.done, g = q.goal, pct = (done ? 1 : g.p / g.n) * 100;
      // число не отрывается от соседнего слова при переносе: «Полей грядки / 2 раза», а не «Полей грядки 2 / раза»
      const task = (done ? 'Забрать награду!' : g.task || q.task).replace(/(\d+) /g, '$1\u00a0');
      const el = h('button', 'quest-card' + (done ? ' done' : ''), `${this.ic(q.icon, 'ic')}<div class="qc-t"><b>${task}</b>` +
        `<div class="qc-row"><div class="qc-bar"><i style="width:${pct}%"></i></div><span class="qc-n">${done ? '✓' : `${fmtNum(g.p)}/${fmtNum(g.n)}`}</span></div></div>`);
      el.dataset.id = q.id;
      el.onclick = () => this.questPanel(f, { id: q.id });
      box.appendChild(el);
    }
    if (this.farm) this.hint(this.farm.hint && this.farm.hint.kind === 'ui' ? this.farm.hint.ui : null, this.farm.hintQ && this.farm.hintQ.id);
  }

  questDone(v) {
    const msg = v.kind === 'line' ? `Задание выполнено: ${v.title}` :
      v.kind === 'event' ? (v.bonus ? `Главный приз события «${v.title}» ждёт тебя!` : `Задание события выполнено: ${v.title}`) :
        v.bonus ? `Все ${v.title.toLowerCase()} выполнены!` : `Выполнено: ${v.task}`;
    this.toast(msg, 'good');
    this.last.quest = null;
  }

  rewardHtml(r) {
    return [r.coins && `${fmtNum(r.coins)} ${this.ic('coin')}`, r.gems && `${r.gems} ${this.ic('gem')}`,
      ...Object.entries(r.items || {}).map(([id, n]) => `${n} ${this.ic(ITEMS[id] ? ITEMS[id].icon : id)}`)].filter(Boolean).join(' ');
  }

  // Окно «Задания»: вкладки Основные / День / Неделя / Месяц / Событие, в каждой — список,
  // нажатие на задание открывает его целиком (текст, цели, награда, стрелка, «на экран»).
  // id — сразу это задание (нажали на карточку). Вкладку помним.
  questPanel(f, { id } = {}) {
    const S = this.qp || (this.qp = { tab: 'main', sel: null });
    S.sel = id || null;
    this.openPanel('quest', 'Задания', (body) => this.questBody(f, body, S));
  }

  questBody(f, body, S) {
    const Q = f.quests, vs = Q.views();
    if (S.sel) {
      const v = vs.find((x) => x.id === S.sel);
      if (v) { S.tab = tabOf(v); return this.questDetail(f, body, S, v); }
      S.sel = null;
    }
    const ctx = Q.ctx(), events = R.eventRows(f.st, ctx), per = f.st.quests.per;
    const tabs = QTABS.filter((t) => t.key === 'main' || (t.key === 'event' ? events.length : per[t.key] && f.st.level >= PERIODIC_LEVEL));
    if (!tabs.some((t) => t.key === S.tab)) S.tab = 'main';
    if (tabs.length > 1) {
      const row = h('div', 'qt-tabs');
      for (const t of tabs) {
        const dot = vs.some((v) => v.done && !v.claimed && tabOf(v) === t.key);
        const b = h('button', 'qt-tab' + (S.tab === t.key ? ' on' : ''), `${this.ic(t.icon)}<span>${t.name}</span>${dot ? '<i class="qt-dot"></i>' : ''}`);
        b.onclick = () => { if (S.tab !== t.key) { S.tab = t.key; this.sfx('tap'); this.refreshPanel(); } };
        row.appendChild(b);
      }
      body.appendChild(row);
    }
    if (S.tab === 'main') this.questLines(f, body, S);
    else if (S.tab === 'event') this.questEvents(f, body, S, events);
    else this.questPeriod(f, body, S, S.tab, ctx);
  }

  // Строка задания в списке: иконка, подпись, цель с полоской, справа «Забрать» или ›
  questRow(f, S, v, cap) {
    const g = v.goal, pct = (v.done ? 1 : g.p / g.n) * 100, pin = f.quests.isPinned(v.id);
    const row = h('div', 'ql-row' + (v.claimed ? ' got' : v.done ? ' done' : '') + (pin ? ' pin' : ''),
      `${this.ic(v.icon, 'ic')}<div class="ql-t"><i>${cap}${pin ? ' · на экране' : ''}</i><b>${(v.done ? v.task : g.task || v.task).replace(/(\d+) /g, '$1 ')}</b>` +
      `<div class="qc-row"><div class="qc-bar"><i style="width:${pct}%"></i></div><span class="qc-n">${v.done ? '✓' : `${fmtNum(g.p)}/${fmtNum(g.n)}`}</span></div></div>`);
    if (v.done && !v.claimed) {
      const b = h('button', 'btn-s gold ql-get', 'Забрать');
      b.onclick = (e) => { e.stopPropagation(); this.questClaim(f, S, v, false); };
      row.appendChild(b);
    } else row.appendChild(h('span', 'ql-go', v.claimed ? '' : '›'));
    if (!v.claimed) row.onclick = () => { S.sel = v.id; this.sfx('tap'); this.refreshPanel(); };
    return row;
  }

  // Забрать награду. Из окна задания (detail) — показываем следующее задание этой ветки, чтобы история
  // читалась дальше; из списка — только после задания сюжета (там новый текст бабушки или призрачка).
  questClaim(f, S, v, detail) {
    const r = f.quests.claim(v.id);
    if (!r) return;
    this.toast(`+${this.rewardHtml(r.reward)}`, 'good');
    S.sel = r.next && (detail || v.line === 'story') ? r.next : null;
    this.refreshPanel();
  }

  questLines(f, body, S) {
    for (const r of R.lineRows(f.st, f.quests.ctx())) {
      const L = r.line;
      if (r.view) { body.appendChild(this.questRow(f, S, r.view, L.key === 'story' ? `${L.name} · ${r.view.title}` : L.name)); continue; }
      const sub = r.status === 'lock' ? `Откроется после задания «${r.after.title}»` :
        r.status === 'level' ? `${L.key === 'story' ? 'Продолжение истории' : 'Следующее задание'} — с ${r.q.level} уровня` : 'Все задания выполнены!';
      body.appendChild(h('div', 'ql-row off', `${this.ic(r.status === 'lock' ? 'lock' : L.icon, 'ic')}<div class="ql-t"><i>${L.name}</i><b>${sub}</b></div>`));
    }
  }

  questPeriod(f, body, S, kind, ctx) {
    const T = PERIODS[kind], vs = R.periodViews(f.st, kind);
    body.appendChild(h('div', 'qt-head', `<b>${T.title}</b><span>Обновятся через ${fmtLeft(R.nextReset(kind, ctx.now, ctx.tz) - ctx.now)}</span>`));
    for (const v of vs) body.appendChild(this.questRow(f, S, v, v.bonus ? 'Бонус' : `Награда: ${this.rewardHtml(v.reward)}`));
    if (T.swaps && R.swapsLeft(f.st, kind) > 0) body.appendChild(h('div', 'pn-text', 'Не нравится задание? Открой его и замени на другое (один раз в день).'));
    body.appendChild(h('div', 'pn-text', 'Не забранные награды за выполненные задания начислятся сами, когда задания обновятся.'));
  }

  questEvents(f, body, S, events) {
    for (const e of events) {
      body.appendChild(h('div', 'qt-head', `<b>${e.ev.name}</b><span>${e.end ? 'до ' + fmtDay(e.end - 1) : 'проверка события'}</span>`));
      body.appendChild(h('div', 'pn-text', e.ev.text));
      for (const c of e.chain) {
        if (c.state === 'cur') { body.appendChild(this.questRow(f, S, c.view, c.q.title)); continue; }
        body.appendChild(h('div', 'ql-row off' + (c.state === 'done' ? ' got' : ''),
          `${this.ic(c.state === 'done' ? e.ev.icon : 'lock', 'ic')}<div class="ql-t"><i>${c.q.title}</i><b>${c.state === 'done' ? '✓ ' + c.q.task : 'Откроется после предыдущего'}</b></div>`));
      }
      body.appendChild(this.questRow(f, S, e.prize, 'Главный приз'));
    }
  }

  // Задание целиком
  questDetail(f, body, S, v) {
    const Q = f.quests;
    const back = h('button', 'qp-back', '‹ Все задания');
    back.onclick = () => { S.sel = null; this.sfx('tap'); this.refreshPanel(); };
    body.appendChild(back);
    if (v.text) {
      if (v.line === 'story') Q.st.seen = v.id;
      const note = v.who === 'note';
      const who = note ? 'Записка бабушки Марфы' : v.who === 'ghost' ? 'Призрачок' : v.title;
      const face = note ? this.ic('note', 'ic big') : v.who === 'ghost' ? `<img class="qp-face" src="${this.icons.avatar || this.icons.star}" alt="">` : this.ic(v.icon, 'ic big');
      body.appendChild(h('div', 'qp-story' + (note ? ' note' : ''), `${face}<div class="qp-say"><b>${who}</b><p>${v.text}</p></div>`));
    }
    const cap = v.kind === 'line' ? (v.line === 'story' ? 'Сюжет' : R.LINE[v.line].name) : v.kind === 'event' ? EVENT_NAME(v.ev) : PERIODS[v.kind].title;
    body.appendChild(h('div', 'pn-sub', v.kind === 'line' || (v.kind === 'event' && !v.bonus) ? `${cap} · ${v.title}` : cap));
    for (const g of v.goals) {
      body.appendChild(h('div', 'qp-task', `<span>${g.task || v.task}</span><b>${fmtNum(g.p)}/${fmtNum(g.n)}</b><div class="qc-bar"><i style="width:${(g.p / g.n) * 100}%"></i></div>`));
    }
    body.appendChild(h('div', 'qp-reward', `Награда: ${this.rewardHtml(v.reward)}`));
    if (!v.done && !v.bonus) {
      // В первых заданиях сюжета стрелка видна сама, дальше — по переключателю: включили — окно закрывается
      // и камера едет к цели; стрелка держится, пока задание не сменится. Задание со стрелкой — на карточке.
      if (hasHint(v) && !hintAuto(v)) {
        const on = f.hintOn(v);
        body.appendChild(this.qpSwitch('hint_arrow', 'Показать стрелку', on, () => {
          f.askHint(!on, v.id);
          if (on) return this.refreshPanel();
          this.closePanel();
          if (f.hint) f.toHint(); else this.toast('Стрелка появится, когда будет что делать');
        }));
      }
      // сюжет и так на экране, если есть место; закрепить можно до MAX_PINS заданий
      const pin = Q.isPinned(v.id);
      if (v.line !== 'story' || pin) {
        body.appendChild(this.qpSwitch('star', 'Показывать на экране', pin, () => {
          if (!Q.pin(v.id, !pin)) this.toast(`На экране уже ${MAX_PINS} задания. Сними одно, чтобы закрепить это.`, 'warn');
          this.refreshPanel();
        }));
      }
      if (v.kind === 'day' && R.swapsLeft(f.st, 'day') > 0) {
        const sw = h('button', 'btn-link qp-swap', 'Заменить на другое задание');
        sw.onclick = () => { if (Q.swap(v.id)) { this.toast('Задание заменено'); this.refreshPanel(); } else this.toast('Заменить не на что'); };
        body.appendChild(sw);
      }
    }
    const b = h('button', 'btn-main', v.claimed ? 'Награда получена' : v.done ? 'Забрать награду' : 'Понятно');
    b.disabled = v.claimed;
    b.onclick = () => { if (v.done) this.questClaim(f, S, v, true); else this.closePanel(); };
    body.appendChild(b);
  }

  qpSwitch(icon, label, on, toggle) {
    const row = h('div', 'set-row tog qp-hint', `${this.ic(icon, 'ic')}<span>${label}</span>`);
    const sw = h('button', 'switch' + (on ? ' on' : ''), '<i></i>');
    sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', on);
    row.appendChild(sw);
    row.onclick = toggle;
    return row;
  }

  // ---------- Всплывающее меню у точки на карте ----------
  popup(sx, sy, { title, text, items = [], cost, wide }) {
    const p = this.popupEl;
    p.innerHTML = '';
    p.className = 'popup ui-layer' + (wide ? ' wide' : '');
    if (title) p.appendChild(h('div', 'pp-title', title));
    if (text) { const t = h('div', 'pp-text', text); p.appendChild(t); }
    if (cost) p.appendChild(h('div', 'pp-cost', this.costHtml(cost, this.farm)));
    const list = h('div', 'pp-list');
    for (const it of items) {
      const b = h('button', 'pp-btn', `${this.ic(it.icon)}<span class="pp-l">${it.label}</span>${it.sub ? `<span class="pp-s">${it.sub}</span>` : ''}`);
      b.disabled = !!it.disabled;
      b.onclick = () => { this.closePopup(); it.onClick(); };
      list.appendChild(b);
    }
    p.appendChild(list);
    p.classList.add('show');
    this._openT = performance.now();
    this.sfx('pop');
    // позиция: над точкой касания, в пределах экрана
    const R = this.root.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const m = 10;
    let x = Math.min(R.width - pw - m, Math.max(m, sx - pw / 2));
    let y = sy - ph - 18;
    if (y < 70) y = Math.min(R.height - ph - 90, sy + 22);
    p.style.transform = `translate(${x}px, ${Math.max(m, y)}px)`;
    this._popupTick = null;
  }

  closePopup() { this.popupEl.classList.remove('show'); this._popupTick = null; this.toggleMore(false); }

  // ---------- Окна ----------
  // music: false — музыка фермы не сменяется на музыку меню (короткие окна выбора у грядки)
  openPanel(kind, title, build, { music = true } = {}) {
    if (this.farm && this.farm.mover && this.farm.mover.active) this.farm.mover.exit();
    this._onClose = null; // окно сменилось другим — прежнее «после закрытия» не нужно
    const p = this.panelEl;
    p.dataset.kind = kind;
    this._build = build;
    this._title = title;
    this.refreshPanel();
    if (!this.panelOpen) { this.sfx('open'); this._openT = performance.now(); }
    p.classList.add('show');
    this.closePopup();
    if (music && this.farm && this.farm.audio) this.farm.audio.setTheme('menu');
  }

  get panelOpen() { return this.panelEl.classList.contains('show'); }

  sfx(name) { if (this.farm && !this._quiet) this.farm.sfx(name); }

  // Прогрев за экраном загрузки: каждое окно, меню «Ещё» и всплывающее меню один раз собираются,
  // показываются на кадр (под экраном загрузки их не видно) и закрываются. Движок JS компилирует их код,
  // браузер считает стили и вёрстку, распаковывает и рисует иконки — первое открытие окна в игре
  // уже не дольше следующих (без прогрева оно примерно вдвое дольше). Состояние окон и игры не меняется.
  async warmup(f, onProgress) {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const Q = f.quests.st, seen = Q.seen;
    const firstQuest = f.quests.views().find((v) => !v.claimed);
    const steps = [
      () => this.bagPanel(f),
      () => this.marketPanel(f),
      () => { this.mk.mode = 'buy'; this.refreshPanel(); },
      () => { this.mk.mode = 'orders'; this.refreshPanel(); },
      () => this.questPanel(f),
      () => firstQuest && this.questPanel(f, { id: firstQuest.id }),
      () => this.plantPanel(f, null),
      () => this.housePanel(f),
      () => this.craftPanel(f, 'kitchen'),
      () => this.giftPanel(f),
      () => this.wheelPanel(f),
      () => this.achPanel(f),
      () => this.settingsPanel(f),
      () => { this.storeAllPanel(f); this._onClose = null; },
      () => { this.closePanel(); this.toggleMore(true); },
      () => { this.toggleMore(false); this.popup(this.root.clientWidth / 2, this.root.clientHeight / 2, { title: 'Дуб', text: 'Срубить', cost: { wood: 1 }, items: [{ icon: 'axe', label: 'Срубить', sub: '1', onClick() {} }] }); },
    ];
    this._quiet = true;
    this.root.classList.add('warming'); // без анимаций появления: окно сразу целиком на кадр
    try {
      for (let i = 0; i < steps.length; i++) {
        try { steps[i](); void this.root.offsetHeight; } catch (e) { console.warn('прогрев окна', e); }
        await frame();
        onProgress && onProgress((i + 1) / steps.length);
      }
    } finally {
      this.closePanel(); this.closePopup(); this.toggleMore(false);
      Q.seen = seen; // окно задания сюжета помечает его прочитанным — возвращаем как было
      this.qp = this.mk = this.inv = this.pl = this.gp = this.sa = this.cr = null; // вкладки и выбор в окнах — по умолчанию
      this._openT = -1;
      void this.root.offsetHeight; // окна закрылись ещё без анимации
      this.root.classList.remove('warming');
      this._quiet = false;
    }
  }

  refreshPanel() {
    const p = this.panelEl;
    const scroll = p.querySelector('.pn-body') ? p.querySelector('.pn-body').scrollTop : 0;
    // Окна с разделами слева (рюкзак, рынок) прокручивают не всё окно, а свои списки: их прокрутку
    // помним по data-scroll. У другого раздела ключ другой, и его список открывается сверху.
    const keep = {};
    for (const e of p.querySelectorAll('[data-scroll]')) keep[e.dataset.scroll] = e.scrollTop;
    p.innerHTML = '';
    const card = h('div', 'pn-card ui-layer');
    const head = h('div', 'pn-head', `<b>${this._title}</b>`);
    const x = h('button', 'pn-x', '✕'); x.onclick = () => this.closePanel();
    head.appendChild(x);
    const body = h('div', 'pn-body');
    card.append(head, body);
    p.appendChild(card);
    this._build(body, card);
    body.scrollTop = scroll;
    for (const e of card.querySelectorAll('[data-scroll]')) if (keep[e.dataset.scroll]) e.scrollTop = keep[e.dataset.scroll];
    // только что выбранную клетку не прячет появившаяся снизу карточка предмета
    const sel = this._reveal && card.querySelector('.sh-list .sel');
    this._reveal = false;
    if (sel) {
      const l = sel.closest('.sh-list'), r = sel.getBoundingClientRect(), lr = l.getBoundingClientRect();
      if (r.bottom > lr.bottom) l.scrollTop += r.bottom - lr.bottom + 6;
      else if (r.top < lr.top) l.scrollTop -= lr.top - r.top + 6;
    }
  }

  closePanel() {
    if (this.panelOpen) this.sfx('close');
    this.panelEl.classList.remove('show'); this.panelEl.dataset.kind = '';
    if (this.farm && this.farm.audio) this.farm.audio.setTheme('farm');
    // окно, открытое из режима перестановки («Убрать всё»), возвращает в него
    const back = this._onClose;
    this._onClose = null;
    if (back) back();
  }

  // ---------- Меню «Ещё» ----------
  // Сюда добавляются новые разделы: { label, icon, open } — готовый, { soon: true } — заготовка.
  moreItems(f) {
    return [
      { label: 'Переставить', icon: 'move', open: () => f.mover.enter() },
      { label: 'Дом', icon: 'house', open: () => this.housePanel(f) },
      { label: 'Подарки', icon: 'gift', open: () => this.giftPanel(f, 'daily'), dot: f.gifts.available() > 0 },
      { label: 'Колесо', icon: 'wheel', open: () => this.wheelPanel(f), dot: f.wheel.freeLeft() > 0 },
      { label: 'Достижения', icon: 'trophy', open: () => this.achPanel(f), dot: f.ach.available() > 0 },
      { label: 'Настройки', icon: 'gear', open: () => this.settingsPanel(f) },
      { label: 'Животные', icon: 'paw', soon: true },
    ];
  }

  toggleMore(show) {
    const m = $('#more-menu');
    show = show == null ? m.hidden : show;
    if (!show) { if (!m.hidden) { m.hidden = true; $('#btn-more').classList.remove('on'); } return; }
    this.closePopup();
    m.innerHTML = '';
    for (const it of this.moreItems(this.farm)) {
      const b = h('button', 'more-it' + (it.soon ? ' soon' : ''), `${this.ic(it.icon, 'ic mid')}<span>${it.label}</span>${it.soon ? '<i>скоро</i>' : ''}${it.dot ? '<b class="more-dot"></b>' : ''}`);
      b.onclick = () => {
        if (it.soon) { this.toast(`«${it.label}» появится в следующих обновлениях`); return; }
        this.toggleMore(false); it.open();
      };
      m.appendChild(b);
    }
    m.hidden = false;
    $('#btn-more').classList.add('on');
    this.sfx('open');
  }

  // ---------- Перестановка ----------
  moveBar(st) {
    const bar = $('#move-bar');
    document.body.classList.toggle('moving', !!st);
    this._safe = null; // нижняя панель прячется и появляется
    bar.hidden = !st;
    if (!st) return;
    const t = $('#mb-text');
    t.textContent = st.text;
    t.classList.toggle('bad', st.bad);
    $('#mb-place').disabled = !st.canPlace;
    $('#mb-cancel').hidden = !st.selected;
    $('#mb-place').hidden = !st.selected || !!st.brush; // «Кладём дорожку»: клетка кладётся сразу по нажатию
    $('#mb-store').hidden = !st.canStore;
    $('#mb-rot').hidden = !st.canRotate;
    $('#mb-all').hidden = !st.canStoreAll;
  }

  moveBarShake() {
    const bar = $('#move-bar');
    bar.classList.remove('shake'); void bar.offsetWidth; bar.classList.add('shake');
  }

  // «Убрать всё» из режима перестановки: окно подтверждения — группы своих вещей (STORE_ALL) с переключателями
  // и числом вещей; «Убрать в рюкзак» убирает отмеченное (Mover.storeAll). Закрыли окно или убрали —
  // снова режим перестановки. Переключатели помнятся до перезапуска игры.
  storeAllPanel(f) {
    const S = this.sa || (this.sa = { on: Object.fromEntries(STORE_ALL.map((g) => [g.key, g.on])) });
    this.openPanel('storeall', 'Убрать в рюкзак', (body) => {
      const list = f.mover.storeAllList();
      body.appendChild(h('div', 'pn-text', 'Отмеченное уйдёт в рюкзак. Поставить обратно можно здесь же, в «Переставить»: нажмите на пустую траву.'));
      let n = 0;
      for (const g of STORE_ALL) {
        const c = list[g.key], cnt = c.list.length, on = !!S.on[g.key] && cnt > 0;
        if (on) n += cnt;
        // что-то из группы занято (там работает призрачок, постройка ещё строится) — остаётся
        const note = g.note + (c.kept ? `. Ещё ${c.kept} останется на месте` : '');
        const row = h('div', 'set-row tog sa-row' + (cnt ? '' : ' off'),
          `${this.ic(g.icon, 'ic')}<span class="sa-l"><span>${g.name}</span><i>${note}</i></span><b>${cnt}</b>`);
        const sw = h('button', 'switch' + (on ? ' on' : ''), '<i></i>');
        sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', on);
        sw.disabled = !cnt;
        row.appendChild(sw);
        if (cnt) row.onclick = () => { S.on[g.key] = !S.on[g.key]; this.sfx('tap'); this.refreshPanel(); };
        body.appendChild(row);
      }
      // после уборки не останется ни пруда, ни колодца — воду для лейки набрать будет негде
      const gone = (g) => S.on[g] && list[g].list.length > 0;
      const pondsLeft = (gone('ponds') ? 0 : list.ponds.list.length) + list.ponds.kept;
      const wellLeft = !!f.world.well && f.st.well > 0 && !gone('well');
      if ((gone('ponds') || gone('well')) && !pondsLeft && !wellLeft) {
        body.appendChild(h('div', 'pn-text sa-warn', 'Воду для лейки будет негде набрать, пока не поставите обратно пруд или колодец.'));
      }
      const stay = f.world.well && !f.st.well ? 'дом, сломанный колодец (сначала почините его), грядки с посадками и дикие растения' : 'дом, грядки с посадками и дикие растения';
      body.appendChild(h('div', 'pn-text sa-stay', `Останутся на месте: ${stay}.`));
      const b = h('button', 'btn-main', n ? `Убрать в рюкзак (${n})` : 'Убирать нечего');
      b.disabled = !n;
      b.onclick = () => {
        this._onClose = null;
        this.closePanel();
        f.mover.storeAll(STORE_ALL.filter((g) => S.on[g.key]).map((g) => g.key));
      };
      body.appendChild(b);
    }, { music: false });
    this._onClose = () => f.mover.enter();
  }

  // ---------- Настройки ----------
  settingsPanel(f) {
    const A = f.audio;
    this.openPanel('settings', 'Настройки', (body) => {
      body.appendChild(h('div', 'pn-sub', 'Звук'));
      const slider = (key, label) => {
        const row = h('label', 'set-row' + (A.s.muted ? ' off' : ''), `<span>${label}</span><b>${Math.round(A.s[key] * 100)}%</b>`);
        const inp = h('input', 'set-range');
        inp.type = 'range'; inp.min = 0; inp.max = 100; inp.step = 5; inp.value = Math.round(A.s[key] * 100);
        inp.disabled = A.s.muted;
        const paint = () => inp.style.setProperty('--v', inp.value + '%');
        paint();
        inp.oninput = () => { A.set(key, inp.value / 100); row.querySelector('b').textContent = inp.value + '%'; paint(); };
        if (key === 'sfx') inp.onchange = () => A.play('harvest');
        row.appendChild(inp);
        body.appendChild(row);
      };
      if (MUSIC) slider('music', 'Музыка');
      slider('sfx', 'Звуки');
      const toggle = (label, on, set) => {
        const row = h('div', 'set-row tog', `<span>${label}</span>`);
        const b = h('button', 'switch' + (on ? ' on' : ''), '<i></i>');
        b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', on);
        b.onclick = () => { set(!on); this.refreshPanel(); };
        row.appendChild(b);
        body.appendChild(row);
      };
      toggle('Выключить весь звук', A.s.muted, (v) => { A.unlock(); A.set('muted', v); if (!v) A.play('tap'); });
      body.appendChild(h('div', 'pn-sub', 'Экран'));
      toggle('Показывать FPS и время кадра', f.perf.showFps, (v) => { f.perf.showFps = v; });
      {
        const row = h('div', 'gfx-row');
        row.appendChild(h('span', 'gfx-cap', 'Графика'));
        for (const [v, name] of [['high', 'Высокая'], ['mid', 'Средняя'], ['low', 'Низкая']]) {
          const b = h('button', 'btn-s gfx-btn' + ((f.perf.gfx === v || (f.perf.gfx === 'auto' && v === ({ low: 'low', mid: 'mid' }[f.perf.tier] || 'high'))) ? ' on' : ''), name);
          b.onclick = () => { f.perf.setGfx(v); row.querySelectorAll('.gfx-btn').forEach((x) => x.classList.toggle('on', x === b)); };
          row.appendChild(b);
        }
        body.appendChild(row);
      }
      if (f.scene) {
        const bt = h('button', 'btn-link bench-btn', 'Тест видеокарты (≈15 с)');
        const out = h('pre', 'bench-out', '');
        bt.onclick = async () => {
          bt.disabled = true; out.textContent = 'Идёт тест, не трогай экран…';
          try { out.textContent = await f.scene.bench((t) => { out.textContent = t; }); } catch (e) { out.textContent = 'Ошибка: ' + e.message; }
          bt.disabled = false;
        };
        body.appendChild(bt); body.appendChild(out);
      }
      if (f.devOn) { this.devWallet(f, body); this.devQuests(f, body); }
      // новая игра — отдельная заметная кнопка; подтверждение прямо на месте
      body.appendChild(h('div', 'pn-sub', 'Игра'));
      const ng = h('div', 'newgame');
      const ask = () => {
        ng.innerHTML = '';
        ng.appendChild(h('div', 'ng-q', 'Начать новую игру? Вся ферма, вещи и прогресс будут удалены безвозвратно.'));
        const row = h('div', 'ng-row');
        const no = h('button', 'btn-s', 'Отмена'), yes = h('button', 'btn-s ng-yes', 'Да, начать заново');
        no.onclick = idle; yes.onclick = () => { f.save.reset(); location.reload(); };
        row.appendChild(no); row.appendChild(yes); ng.appendChild(row);
      };
      const idle = () => { ng.innerHTML = ''; const b = h('button', 'btn-main ng-btn', 'Новая игра'); b.onclick = ask; ng.appendChild(b); };
      idle();
      body.appendChild(ng);
      // строка версии; DEV_LIMITS.unlockTaps нажатий подряд включают режим тестера
      const ver = h('div', 'set-ver', `Версия ${VERSION}${f.tester ? ' · режим тестера' : ''}`);
      ver.onclick = () => this.versionTap(f);
      body.appendChild(ver);
    });
  }

  versionTap(f) {
    if (f.tester) return;
    const now = performance.now(), T = this._verTap = (this._verTap && now - this._verTap.t < 1500) ? this._verTap : { n: 0 };
    T.n++; T.t = now;
    const left = DEV_LIMITS.unlockTaps - T.n;
    if (left > 0) { if (left <= 3) this.toast(`Ещё ${left} — и включится режим тестера`); return; }
    this._verTap = null;
    f.setTester(true);
    this.toast('Режим тестера включён', 'good');
    this.refreshPanel();
  }

  // Режим тестера: поставить монеты и кристаллы, полная энергия, выдать предметы
  devWallet(f, body) {
    body.appendChild(h('div', 'pn-sub', 'Режим тестера'));
    for (const [cur, icon, name] of [['coins', 'coin', 'Монеты'], ['gems', 'gem', 'Кристаллы']]) {
      const row = h('div', 'dev-row', `${this.ic(icon)}<span>${name}</span>`);
      const inp = h('input', 'dev-num');
      inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = 0; inp.max = DEV_LIMITS.wallet; inp.value = f.st[cur];
      const b = h('button', 'btn-s gold', 'Поставить');
      const go = () => { const r = f.devDo((st) => Dev.setWallet(st, cur, inp.value)); inp.value = f.st[cur]; inp.blur(); if (r) this.toast(`${name}: ${fmtNum(r.to)}`, 'good'); };
      b.onclick = go;
      inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
      row.append(inp, b);
      body.appendChild(row);
    }
    const row = h('div', 'gfx-row');
    const en = h('button', 'btn-s', `${this.ic('energy')} Полная энергия`);
    en.onclick = () => { if (!f.devDo((st) => Dev.fillEnergy(st, f.maxEnergy))) this.toast('Энергия и так полная'); };
    const items = h('button', 'btn-s gold', `${this.ic('bag')} Выдать предметы`);
    items.onclick = () => this.devItemsPanel(f);
    row.append(en, items);
    if (f.tester) {
      const off = h('button', 'btn-s', 'Выключить режим');
      off.onclick = () => { f.setTester(false); this.toast('Режим тестера выключен'); this.refreshPanel(); };
      row.appendChild(off);
    }
    body.appendChild(row);
  }

  // Окно «Выдать предметы» (режим тестера): все предметы игры по разделам рюкзака, у выбранного —
  // сколько добавить (+1…+1000 или своё число) и «Убрать все»; «Каждого по 10» — всему разделу сразу
  devItemsPanel(f) {
    const S = this.dv || (this.dv = { tab: 'all', sel: null, n: 10 });
    this.openPanel('devitems', 'Выдать предметы', (body) => {
      const st = f.st, all = Dev.grantable();
      const list = all.filter((it) => S.tab === 'all' || it.tabs.includes(S.tab)).sort((a, b) => a.order - b.order);
      const bulk = h('div', 'inv-sort sh-bulk', '<span>Всем:</span>');
      for (const n of [10, 100]) {
        const b = h('button', 'inv-chip', `+${n} каждого`);
        b.onclick = () => { const r = f.devDo((s) => Dev.grantMany(s, list.map((it) => it.key), n)); if (r) this.toast(`Выдано: ${r.kinds} видов по ${n}`, 'good'); this.refreshPanel(); };
        bulk.appendChild(b);
      }
      const L = this.shelf(body, 'dev', {
        tabs: INV_TABS.filter((t) => t.key === 'all' || all.some((it) => it.tabs.includes(t.key))),
        tab: S.tab,
        onTab: (k) => { S.tab = k; S.sel = null; },
        top: bulk,
      });
      const g = h('div', 'inv-grid');
      for (const it of list) {
        const n = Inv.count(st, it.key);
        const c = h('button', 'inv-cell' + (S.sel === it.key ? ' sel' : '') + (n ? '' : ' dev-none'),
          `${this.ic(it.icon, 'ic')}${it.badge ? this.ic(it.badge, 'inv-badge') : ''}${n ? `<b>${fmtNum(n)}</b>` : ''}`);
        c.title = it.name;
        c.onclick = () => this.pick(S, it.key);
        g.appendChild(c);
      }
      L.list.appendChild(g);
      const it = S.sel && ITEMS[S.sel];
      if (!it) return;
      const have = Inv.count(st, it.key);
      // карточка без описания: на телефоне под ней должны поместиться кнопки
      const box = this.mkCard({ ...it, desc: `в рюкзаке: ${fmtNum(have)}` }, '', S);
      const grant = (n) => { const r = f.devDo((s) => Dev.grantItem(s, it.key, n)); if (!r) this.toast('Не получилось добавить', 'warn'); this.refreshPanel(); };
      const quick = h('div', 'ii-step');
      for (const n of DEV_LIMITS.quick) { const b = h('button', 'btn-s', '+' + n); b.onclick = () => grant(n); quick.appendChild(b); }
      const acts = h('div', 'ii-a dev-acts');
      const inp = h('input', 'dev-num');
      inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = 1; inp.max = DEV_LIMITS.item; inp.value = S.n;
      inp.oninput = () => { S.n = Math.max(1, Math.min(DEV_LIMITS.item, Math.floor(+inp.value) || 1)); };
      const add = h('button', 'btn-s gold', 'Добавить');
      add.onclick = () => grant(S.n);
      inp.onkeydown = (e) => { if (e.key === 'Enter') grant(S.n); };
      const clr = h('button', 'btn-s', 'Убрать все');
      clr.disabled = !have;
      clr.onclick = () => { f.devDo((s) => Dev.clearItem(s, it.key)); this.refreshPanel(); };
      acts.append(inp, add, clr);
      const wrap = h('div', 'ii-sell');
      wrap.append(quick, acts);
      box.appendChild(wrap);
      L.info(box);
    });
  }

  // Проверка заданий без ожидания настоящих дат (режим тестера или ?debug в адресе)
  devQuests(f, body) {
    const d = f.dev, now = f.quests.ctx().now;
    body.appendChild(h('div', 'pn-sub', 'Проверка заданий, подарков, колеса, заказов и достижений'));
    body.appendChild(h('div', 'pn-text', `Время заданий: ${new Date(now + QUEST_TZ * 3600e3).toISOString().slice(0, 16).replace('T', ' ')} МСК` +
      `${d.shift ? ` (сдвиг ${Math.round(d.shift / 3600e3)} ч)` : ''} · событие: ${d.event ? EVENT_NAME(d.event) : 'по датам'}`));
    const row = h('div', 'gfx-row');
    const btn = (label, fn) => { const b = h('button', 'btn-s', label); b.onclick = () => { fn(); this.refreshPanel(); }; row.appendChild(b); };
    btn('+1 день', () => f.setDev({ shift: (d.shift || 0) + 86400e3 }));
    btn('+7 дней', () => f.setDev({ shift: (d.shift || 0) + 7 * 86400e3 }));
    btn('Сейчас', () => f.setDev({ shift: 0 }));
    btn('Событие', () => { const i = EVENTS.findIndex((e) => e.id === d.event); f.setDev({ event: i + 1 < EVENTS.length ? EVENTS[i + 1].id : null }); });
    btn('Подарки заново', () => f.gifts.devReset());
    btn('Колесо заново', () => f.wheel.devReset());
    btn('Достижения заново', () => f.ach.devReset());
    btn('Заказы заново', () => f.orders.devReset());
    body.appendChild(row);
  }

  // ---------- Подарки ----------
  // Кнопка подарка (под монетами): видна и светится, пока есть подарок, который можно забрать; цифра —
  // если подарков несколько. Раз в секунду (fromTick) — ещё и наступление нового дня: окно подарков
  // открыто — оно обновляется, а время до следующего подарка в нём идёт.
  giftTick(f, fromTick) {
    const n = f.gifts.available(), open = this.panelOpen && this.panelEl.dataset.kind === 'gifts';
    if (this.last.gift !== n) {
      const was = this.last.gift;
      this.last.gift = n;
      $('#btn-gift').hidden = !n;
      const badge = $('#gift-badge');
      badge.hidden = n < 2; badge.textContent = n;
      this.sideSync();
      if (fromTick && open && was != null) this.refreshPanel();
    }
    if (fromTick && open) { const e = $('#gf-next', this.panelEl); if (e) e.textContent = fmtLeft(f.gifts.daily().next - f.gifts.ctx().now); }
  }

  // Окно «Подарки»: вкладки-разделы, пока работает только «Ежедневные», остальные — заготовки
  giftPanel(f, tab) {
    const S = this.gp || (this.gp = { tab: 'daily' });
    if (tab) S.tab = tab;
    this.openPanel('gifts', 'Подарки', (body) => this.giftBody(f, body, S));
    // сегодняшний день дорожки — на виду (на невысоком экране окно прокручивается к нему)
    const body = $('.pn-body', this.panelEl), c = $('.gf-day.cur', this.panelEl);
    if (body && c) {
      const b = body.getBoundingClientRect(), r = c.getBoundingClientRect();
      if (r.top < b.top || r.bottom > b.bottom - 80) body.scrollTop += r.top - b.top - b.height / 3;
    }
  }

  giftBody(f, body, S) {
    const v = f.gifts.daily(), row = h('div', 'qt-tabs gf-tabs');
    for (const t of GIFT_TABS) {
      const dot = t.key === 'daily' && v.can;
      const b = h('button', 'qt-tab' + (S.tab === t.key ? ' on' : '') + (t.soon ? ' soon' : ''),
        `${this.ic(t.icon)}<span>${t.name}</span>${dot ? '<i class="qt-dot"></i>' : ''}${t.soon ? '<i class="qt-soon">скоро</i>' : ''}`);
      b.onclick = () => {
        if (t.soon) { this.toast(t.soon); return; }
        if (S.tab !== t.key) { S.tab = t.key; this.sfx('tap'); this.refreshPanel(); }
      };
      row.appendChild(b);
    }
    body.appendChild(row);
    this.giftDaily(f, body, v);
  }

  // Награда ячейки дня: [{ icon, n }] — монеты, кристаллы, предметы
  giftParts(r) {
    return [r.coins && { icon: 'coin', n: r.coins }, r.gems && { icon: 'gem', n: r.gems },
      ...Object.entries(r.items || {}).map(([id, n]) => ({ icon: ITEMS[id] ? ITEMS[id].icon : id, n }))].filter(Boolean);
  }

  // Ежедневные: дорожка из 30 дней входа по неделям (7 в ряд: каждый 7-й день — кристаллы, 30-й — сундук),
  // «Забрать подарок» или время до следующего
  giftDaily(f, body, v) {
    const len = v.days.length, got = v.can ? v.idx : v.idx + 1;
    body.appendChild(h('div', 'qt-head', `<b>Подарки за вход</b><span>${v.open ? `Получено ${got} из ${len}` : ''}</span>`));
    if (!v.open) {
      body.appendChild(h('div', 'pn-text', `Ежедневные подарки откроются с ${DAILY_GIFT.level} уровня.`));
      return;
    }
    const grid = h('div', 'gf-days');
    for (const d of v.days) {
      const r = d.reward, parts = this.giftParts(r), cur = d.i === v.idx;
      const cls = `gf-day ${d.state}${r.big ? ' big' : ''}${r.gems && !r.big ? ' gem' : ''}${cur ? ' cur' : ''}${cur && v.can ? ' ready' : ''}${cur && this._gfPop ? ' pop' : ''}`;
      const items = r.big ? `${this.ic('chest', 'gf-chest')}<div class="gf-list">${parts.map((p) => `<span>${this.ic(p.icon)}${fmtNum(p.n)}</span>`).join('')}</div>` :
        `<div class="gf-parts n${parts.length}">${parts.map((p) => `<span>${this.ic(p.icon)}<b>${fmtNum(p.n)}</b></span>`).join('')}</div>`;
      grid.appendChild(h('div', cls, `<i class="gf-n">${r.big ? `${d.i + 1}-й день` : d.i + 1}</i>${items}${d.state === 'got' ? '<i class="gf-ok">✓</i>' : ''}`));
    }
    this._gfPop = false;
    body.appendChild(grid);
    // кнопка (или время до следующего) прилипает к низу окна: на невысоком экране её видно без прокрутки
    const act = h('div', 'gf-act');
    if (v.can) {
      if (v.missed) body.appendChild(h('div', 'pn-text gf-miss', 'Был пропущен день, поэтому дорожка началась сначала.'));
      const b = h('button', 'btn-main gf-get', 'Забрать подарок');
      b.onclick = () => {
        const r = f.gifts.claimDaily();
        if (!r) return;
        this._gfPop = true;
        this.toast(`Подарок ${r.day}-го дня: +${this.rewardHtml(r.reward)}`, 'good');
        this.refreshPanel();
      };
      act.appendChild(b);
    } else act.appendChild(h('div', 'gf-wait', `Следующий подарок через <b id="gf-next">${fmtLeft(v.next - f.gifts.ctx().now)}</b>`));
    body.appendChild(h('div', 'pn-text gf-note', `Заходи каждый день и забирай подарок: каждый 7-й день — кристаллы, а на ${len}-й — сундук с кристаллами. ` +
      (DAILY_GIFT.resetOnMiss ? 'Пропустишь день — дорожка начнётся с первого дня.' : 'Пропущенные дни не сгорают: следующий подарок ждёт тебя.')));
    body.appendChild(act);
  }

  // Сколько кнопок в колонке справа (подарок, колесо): счётчик FPS встаёт под ними, стрелка-подсказка — ниже
  sideSync() {
    document.body.dataset.side = ['#btn-gift', '#btn-wheel'].filter((s) => !$(s, this.root).hidden).length;
    this._safe = null;
  }

  // ---------- Колесо фортуны ----------
  // Кнопка колеса (под подарком) видна и светится, пока есть бесплатное вращение на сегодня.
  // Раз в секунду (fromTick) — ещё и новый день: окно колеса обновляется, время до бесплатного идёт.
  wheelTick(f, fromTick) {
    const n = f.wheel.freeLeft(), open = this.panelOpen && this.panelEl.dataset.kind === 'wheel';
    if (this.last.wheel !== n && !this._wspin) { // кнопка гаснет, когда колесо остановится
      const was = this.last.wheel;
      this.last.wheel = n;
      $('#btn-wheel').hidden = !n;
      this.sideSync();
      if (fromTick && open && was != null && !this._wspin) this.refreshPanel();
    }
    if (fromTick && open) { const e = $('#wh-next', this.panelEl); if (e) e.textContent = fmtLeft(f.wheel.view().next - f.wheel.ctx().now); }
  }

  wheelPanel(f) { this.openPanel('wheel', 'Колесо фортуны', (body) => this.wheelBody(f, body)); }

  // Колесо: сектора из WHEEL.sectors по часовой стрелке от верхнего, стрелка сверху неподвижна.
  // Угол колеса помнится (_whA): окно пересобирается — колесо стоит там же, где остановилось.
  wheelBody(f, body) {
    const v = f.wheel.view(), S = WHEEL.sectors, seg = 360 / S.length;
    const wrap = h('div', 'wh-wrap' + (this._wspin ? ' spinning' : ''));
    const box = h('div', 'wh-box');
    box.innerHTML = `<div class="wh-wheel" style="transform:rotate(${this._whA || 0}deg)">${this.wheelSvg(S, seg)}` +
      S.map((s, i) => this.wheelPrize(s, i, seg)).join('') + '</div>' +
      '<svg class="wh-ptr" viewBox="0 0 40 56" aria-hidden="true"><path d="M20 53 L6.36 23.25 A15 15 0 1 1 33.64 23.25 Z" fill="#e2483b" stroke="#3d2b1f" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="20" cy="17" r="6" fill="#ffd45a" stroke="#3d2b1f" stroke-width="2"/><circle cx="18" cy="15" r="1.8" fill="#fff8d0"/></svg>';
    this._whWin = null;
    wrap.appendChild(box);
    const ctl = h('div', 'wh-ctl');
    wrap.appendChild(ctl);
    body.appendChild(wrap);
    if (!v.open) { ctl.appendChild(h('div', 'pn-text wh-note', `Колесо фортуны откроется с ${WHEEL.level} уровня.`)); return; }
    const act = h('div', 'wh-act');
    if (v.freeLeft) {
      const b = h('button', 'btn-main gf-get', 'Крутить бесплатно');
      b.onclick = () => this.wheelSpin(f, 'free');
      act.appendChild(b);
    } else {
      const total = WHEEL.coins.length;
      const cb = h('button', 'btn-main wh-btn' + (v.coinLeft && !v.can.coins ? ' lack' : ''), v.coinLeft ?
        `<span>Крутить за ${fmtNum(v.coinCost)} ${this.ic('coin')}</span><small>ещё ${v.coinLeft} из ${total} сегодня</small>` :
        `<span>За ${this.ic('coin')} — завтра</span><small>сегодня уже ${total} из ${total}</small>`);
      cb.disabled = !v.coinLeft;
      cb.onclick = () => this.wheelSpin(f, 'coins');
      const gb = h('button', 'btn-main wh-btn gem' + (v.can.gems ? '' : ' lack'), `<span>Крутить за ${v.gemCost} ${this.ic('gem')}</span><small>сколько хочешь</small>`);
      gb.onclick = () => this.wheelSpin(f, 'gems');
      act.append(cb, gb);
    }
    if (this._wspin) for (const b of act.querySelectorAll('button')) b.disabled = true;
    ctl.appendChild(act);
    const now = f.wheel.ctx().now;
    ctl.appendChild(h('div', 'pn-text wh-note', (v.freeLeft ? 'Бесплатно — раз в день.' : `Бесплатное вращение через <b id="wh-next">${fmtLeft(v.next - now)}</b>.`) +
      ` За монеты — ${WHEEL.coins.length} раз в день, за кристаллы — сколько хочешь. Главный приз — ${this.rewardHtml(S.find((s) => s.big) || S[0])}!`));
  }

  wheelSvg(S, seg) {
    const COLORS = ['#e2483b', '#f6c431', '#6dba3b', '#3f8fdc'], R = 84, rad = Math.PI / 180;
    const pt = (a, r) => `${(r * Math.sin(a * rad)).toFixed(2)} ${(-r * Math.cos(a * rad)).toFixed(2)}`;
    const arc = (i, r) => `M0 0 L${pt(i * seg - seg / 2, r)} A${r} ${r} 0 0 1 ${pt(i * seg + seg / 2, r)} Z`;
    let c = 0, out = '<svg viewBox="-100 -100 200 200" aria-hidden="true"><defs>' +
      '<radialGradient id="whRim" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#d9951c"/></radialGradient>' +
      '<radialGradient id="whShine" cx="50%" cy="50%" r="50%"><stop offset=".25" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="whHub" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff1a8"/><stop offset="1" stop-color="#e0a020"/></radialGradient></defs>' +
      '<circle r="98" fill="url(#whRim)" stroke="#3d2b1f" stroke-width="3"/>';
    S.forEach((s, i) => { out += `<path d="${arc(i, R)}" fill="${s.big ? '#9a5fd8' : COLORS[c++ % COLORS.length]}" stroke="#3d2b1f" stroke-width="1.8" stroke-linejoin="round"/>`; });
    if (this._whWin != null) out += `<path class="wh-win" d="${arc(this._whWin, R)}" fill="#fff"/>`;
    out += `<circle r="${R}" fill="url(#whShine)"/><circle r="${R}" fill="none" stroke="#3d2b1f" stroke-width="2.6"/>`;
    for (let i = 0; i < 16; i++) out += `<circle cx="${(91 * Math.sin(i * 22.5 * rad)).toFixed(2)}" cy="${(-91 * Math.cos(i * 22.5 * rad)).toFixed(2)}" r="3.6" fill="#fff6c4" stroke="#b9791a" stroke-width="1.2"/>`;
    return out + '<circle r="13" fill="url(#whHub)" stroke="#3d2b1f" stroke-width="2.6"/><circle cx="-4" cy="-4.5" r="3.2" fill="#fffbe0" opacity=".85"/></svg>';
  }

  wheelPrize(s, i, seg) {
    const p = this.giftParts(s)[0];
    const inner = s.big ? `${this.ic('chest', 'wh-ic')}<b>${fmtNum(p.n)}${this.ic(p.icon, 'wh-mini')}</b>` : `${this.ic(p.icon, 'wh-ic')}<b>${fmtNum(p.n)}</b>`;
    return `<div class="wh-prize" style="transform:rotate(${i * seg}deg)">${inner}</div>`;
  }

  // Крутить: правила сразу решают сектор, списывают цену и начисляют приз (так будет и на сервере),
  // а окно ~4.5 с крутит колесо до этого сектора и только потом показывает приз. Щёлкает на каждом секторе.
  wheelSpin(f, mode) {
    if (this._wspin) return;
    const st = f.st, hold = { coins: st.coins, gems: st.gems };
    this._wspin = { hold };
    const r = f.wheel.spin(mode);
    if (!r) {
      this._wspin = null;
      const v = f.wheel.view();
      this.toast(mode === 'coins' && v.coinLeft ? 'Не хватает монет' : mode === 'gems' ? 'Не хватает кристаллов' : 'Сейчас так крутить нельзя', 'warn');
      this.sfx('error');
      return;
    }
    hold.coins -= r.cost.coins || 0; hold.gems -= r.cost.gems || 0;
    this.update(f);
    const S = WHEEL.sectors, seg = 360 / S.length, from = this._whA || 0, DUR = 4600, EASE = [0.12, 0.72, 0.14, 1];
    const aim = -(r.idx * seg) + (Math.random() - 0.5) * seg * 0.7; // куда-то внутрь сектора (не на границу)
    const to = from + 5 * 360 + ((((aim - from) % 360) + 360) % 360);
    this._whA = to;
    const el = $('.wh-wheel', this.panelEl), wrap = $('.wh-wrap', this.panelEl);
    if (el) {
      void el.offsetWidth;
      el.style.transition = `transform ${DUR}ms cubic-bezier(${EASE.join(',')})`;
      el.style.transform = `rotate(${to}deg)`;
    }
    if (wrap) { wrap.classList.add('spinning'); for (const b of wrap.querySelectorAll('.wh-act button')) b.disabled = true; }
    if (f.audio && !this._quiet) for (const d of wheelTicks(from, to, seg, DUR, EASE)) f.audio.play('tick', d);
    this._wspin.t = setTimeout(() => this.wheelDone(f, r), DUR + 120);
  }

  wheelDone(f, r) {
    this._wspin = null;
    this._whWin = r.idx;
    this.toast(`${r.reward.big ? 'Главный приз! ' : 'Колесо фортуны: '}+${this.rewardHtml(r.reward)}`, 'good');
    this.sfx(r.reward.big ? 'level' : 'coin');
    f.player.celebrate();
    this.update(f);
  }

  // ---------- Достижения ----------
  // Кружок на кнопке «Ещё»: сколько достижений ждут, чтобы забрали награду (других кнопок у них нет)
  moreBadge(f) {
    const n = f.ach.available();
    if (this.last.moreN === n) return;
    this.last.moreN = n;
    const b = $('#more-badge');
    if (b) { b.hidden = !n; b.textContent = n; }
  }

  achTier(v, medal) {
    this.toast(`Достижение «${v.name}»: ${ACH_MEDALS[medal - 1]} медаль!`, 'good');
  }

  // Окно «Достижения»: сверху — сколько медалей получено (и «Забрать всё», если наград несколько),
  // ниже — достижения по разделам. В строке: медаль (цвет — забранная ступень), звёзды ступеней,
  // цель ступени с полоской (взятой, пока её награду не забрали, иначе следующей), справа — награда и «Забрать».
  achPanel(f) { this.openPanel('ach', 'Достижения', (body) => this.achBody(f, body)); }

  achBody(f, body) {
    const vs = f.ach.views(), S = f.ach.summary(vs);
    const top = h('div', 'ach-sum', `${this.ic('trophy', 'ic')}<div class="ach-sum-t"><b>Медали: ${S.got} из ${S.total}</b>` +
      `<div class="qc-bar"><i style="width:${(S.got / S.total) * 100}%"></i></div></div>`);
    if (S.can > 1) {
      const b = h('button', 'btn-s gold', `Забрать всё (${S.can})`);
      b.onclick = () => this.achClaim(f, null);
      top.appendChild(b);
    }
    body.appendChild(top);
    for (const g of ACH_GROUPS) {
      const list = vs.filter((v) => v.group === g.key);
      if (!list.length) continue;
      body.appendChild(h('div', 'pn-sub', g.name));
      for (const v of list) body.appendChild(this.achRow(f, v));
    }
  }

  achRow(f, v) {
    const stars = Array.from({ length: v.tiers }, (_, i) => `<s class="${i < v.got ? 'on' : i < v.reached ? 'can' : ''}">★</s>`).join('');
    const bar = v.complete ? '<div class="ach-max">Все медали получены!</div>' :
      `<div class="qc-row"><div class="qc-bar"><i style="width:${v.frac * 100}%"></i></div><span class="qc-n">${v.can ? '✓' : `${fmtNum(v.p)}/${fmtNum(v.n)}`}</span></div>`;
    const row = h('div', 'ql-row ach-row' + (v.can ? ' done' : '') + (v.complete ? ' max' : ''),
      `<div class="ach-ic t${v.medal}">${this.ic(v.icon, 'ic')}</div>` +
      `<div class="ql-t"><i>${v.name}<span class="ach-st">${stars}</span></i>` +
      `${v.complete ? '' : `<b>${v.task.replace(/(\d+) /g, '$1 ')}</b>`}${bar}</div>`);
    if (v.reward) {
      const side = h('div', 'ach-side', `<div class="ach-rw">${this.rewardHtml(v.reward).replace(/ (?=<img)/g, ' ')}</div>`);
      if (v.can) {
        const b = h('button', 'btn-s gold ql-get', 'Забрать');
        b.onclick = () => this.achClaim(f, v.id);
        side.appendChild(b);
      }
      row.appendChild(side);
    }
    return row;
  }

  achClaim(f, id) {
    const r = f.ach.claim(id);
    if (!r) return;
    this.toast(`${id ? `«${r.view.name}»: ` : ''}+${this.rewardHtml(r.reward)}`, 'good');
    this.refreshPanel();
  }

  // Окно дома: что даёт уровень и улучшение. Улучшение идёт по времени (houseRules.js): пока дом в лесах,
  // здесь полоска, сколько осталось, и «Достроить сейчас» за кристаллы (время идёт — houseTick).
  housePanel(f) {
    this.openPanel('house', 'Дом фермера', (body) => {
      const st = f.st, now = Date.now(), up = HR.houseUp(st), lvl = st.house, cur = HOUSE[lvl], next = HOUSE[up ? up.to : lvl + 1];
      this._houseUp = up ? up.to : 0;
      body.appendChild(h('div', 'pn-hero', `${this.ic('house', 'ic big')}<div><b>${lvl} уровень</b><span>Главное здание: от него зависят энергия, лейка и размер фермы.</span></div>`));
      const row = (label, a, b) => `<div class="stat"><span>${label}</span><b>${a}${b != null ? ` <i>→ ${b}</i>` : ''}</b></div>`;
      body.appendChild(h('div', 'stats',
        row('Энергия', cur.energy, next && next.energy) +
        row('Лейка, поливов', cur.can, next && next.can) +
        row('Участков земли', cur.chunks, next && next.chunks)));
      if (up) {
        const left = HR.houseUpLeft(st, now), gems = BR.gemsFor(left);
        body.appendChild(h('div', 'pn-sub', `Идёт улучшение до ${up.to} уровня`));
        body.appendChild(h('div', 'hu-prog', `<div class="cr-bar"><u style="width:${(HR.houseUpPart(st, now) * 100).toFixed(1)}%"></u></div><span>Осталось <b class="hu-left">${leftText(left)}</b></span>`));
        const b = h('button', 'btn-main hu-speed', `Достроить сейчас · <span>${gems} ${this.ic('gem', 'ic-s')}</span>`);
        b.dataset.g = gems;
        b.disabled = st.gems < gems;
        b.onclick = () => f.builds.speedHouse();
        body.appendChild(b);
      } else if (next) {
        body.appendChild(h('div', 'pn-sub', 'Улучшение'));
        body.appendChild(h('div', 'pp-cost', this.costHtml(next.cost, f)));
        const need = houseNeedChunks(lvl), have = f.world.unlockedCount();
        if (have < need) body.appendChild(h('div', 'pn-text', `Сначала откройте новый участок земли (участков: ${have} из ${need}).`));
        else if (next.time) body.appendChild(h('div', 'pn-text', `Стройка займёт ${fmtShort(next.time)}: всё это время дом будет в лесах.`));
        const b = h('button', 'btn-main', `Улучшить до ${lvl + 1} уровня`);
        b.disabled = !f.canPay(next.cost) || have < need;
        b.onclick = () => { if (f.upgradeHouse()) this.refreshPanel(); };
        body.appendChild(b);
      } else body.appendChild(h('div', 'pn-text', 'Дом улучшен до максимума!'));
    });
  }

  // Раз в секунду, пока открыто окно дома: время улучшения идёт; кончилось — окно пересобирается
  houseTick(f) {
    const up = HR.houseUp(f.st);
    if ((up ? up.to : 0) !== this._houseUp) return this.refreshPanel();
    if (!up) return;
    const now = Date.now(), el = this.panelEl, left = HR.houseUpLeft(f.st, now);
    const bar = el.querySelector('.hu-prog u'), t = el.querySelector('.hu-left'), sp = el.querySelector('.hu-speed');
    if (bar) bar.style.width = (HR.houseUpPart(f.st, now) * 100).toFixed(1) + '%';
    if (t) t.textContent = leftText(left);
    if (sp) {
      const gems = BR.gemsFor(left);
      if (sp.dataset.g !== String(gems)) { sp.dataset.g = gems; sp.querySelector('span').innerHTML = `${gems} ${this.ic('gem', 'ic-s')}`; }
      sp.disabled = f.st.gems < gems;
    }
  }

  // ---------- Здание с крафтом: очередь и рецепты ----------
  // Сверху — очередь (готовое, что делается, что ждёт, свободные места), под ней — рецепты сеткой.
  // Выбранный рецепт — карточка снизу: что уйдёт и кнопка. Время в очереди идёт каждую секунду
  // (craftTick); товар доделался — окно пересобирается.
  craftPanel(f, k) {
    const b = BUILDINGS[k];
    if (!this.cr || this.cr.k !== k) this.cr = { k, sel: null };
    const S = this.cr;
    this.openPanel('craft', b.name, (body, card) => {
      const st = f.st, now = Date.now(), v = BR.queueView(st, k, now);
      S.key = this.craftKey(f, k, now);
      body.appendChild(h('div', 'pn-hero', `${this.ic(bldId(k), 'ic big')}<div><span>${b.desc}</span></div>`));
      body.appendChild(h('div', 'pn-sub', `Очередь · ${v.jobs.length} из ${b.slots}`));
      const q = h('div', 'cr-queue');
      for (let i = 0; i < b.slots; i++) q.appendChild(this.craftSlot(f, k, v.jobs[i]));
      body.appendChild(q);
      if (v.ready) {
        const c = h('button', 'btn-main', `Забрать готовое: ${v.ready}`);
        c.onclick = () => f.builds.collect(k);
        body.appendChild(c);
      }
      body.appendChild(h('div', 'pn-sub', 'Рецепты'));
      const g = h('div', 'mk-grid');
      for (const { r, open, block } of BR.recipesOf(st, k, now)) {
        const it = ITEMS[r.item];
        const c = h('button', 'mk-cell' + (open ? '' : ' locked') + (open && block ? ' poor' : '') + (S.sel === r.key ? ' sel' : ''),
          `<i>${this.ic(it.icon, 'ic')}${open ? '' : this.ic('lock', 'mk-lock')}${r.n > 1 ? `<b>×${r.n}</b>` : ''}</i>` +
          `<span>${open ? fmtShort(r.time) : `с ${r.level} ур.`}</span>`);
        c.title = it.name;
        c.onclick = () => { S.sel = S.sel === r.key ? null : r.key; this.sfx('tap'); this.refreshPanel(); };
        g.appendChild(c);
      }
      body.appendChild(g);
      const r = S.sel && RECIPES[S.sel];
      if (r && r.at === k) card.appendChild(this.recipeCard(f, k, r, now));
      else S.sel = null;
    });
  }

  // Место в очереди: j — товар (BR.queueView) или пусто
  craftSlot(f, k, j) {
    if (!j) return h('div', 'cr-slot empty', '<i></i><span>свободно</span>');
    const it = ITEMS[j.r.item];
    const s = h('div', 'cr-slot' + (j.done ? ' done' : j.running ? ' run' : ' wait'),
      `<i>${this.ic(it.icon, 'ic')}${j.r.n > 1 ? `<b>×${j.r.n}</b>` : ''}${j.done ? '<em>✓</em>' : ''}</i>`);
    s.title = it.name;
    if (j.done) s.appendChild(h('span', '', 'готово'));
    else if (j.running) {
      s.appendChild(h('div', 'cr-bar', `<u style="width:${(j.k * 100).toFixed(1)}%"></u>`));
      s.appendChild(h('span', 'cr-left', leftText(j.left)));
      const gems = BR.gemsFor(j.left), sp = h('button', 'btn-s cr-speed', `${gems} ${this.ic('gem', 'ic-s')}`);
      sp.title = 'Доделать сейчас';
      sp.disabled = f.st.gems < gems; sp.onclick = () => f.builds.speedCraft(k);
      s.appendChild(sp);
    } else {
      s.appendChild(h('span', 'cr-left', `ждёт · ${fmtShort(j.r.time)}`));
      const x = h('button', 'cr-x', '✕');
      x.title = 'Отменить: продукты вернутся в рюкзак';
      x.onclick = () => f.builds.cancel(k, j.idx);
      s.appendChild(x);
    }
    return s;
  }

  // Карточка рецепта: что получится, что уйдёт, кнопка «Приготовить · 2 мин»
  recipeCard(f, k, r, now) {
    const b = BUILDINGS[k], it = ITEMS[r.item], st = f.st, block = BR.craftBlock(st, k, r.key, now);
    const facts = [
      `${fmtShort(r.time)}`,
      it.food && `+${it.food} ${this.ic('energy')}`,
      it.sell && `${it.sell} ${this.ic('coin')} за шт.`,
      Inv.count(st, it.key) && `в рюкзаке ${fmtNum(Inv.count(st, it.key))}`,
    ].filter(Boolean).join(' · ');
    const box = h('div', 'inv-info ui-layer',
      `<div class="ii-ic">${this.ic(it.icon, 'ic big')}</div>` +
      `<div class="ii-t"><b>${it.name}${r.n > 1 ? ` ×${r.n}` : ''}</b><span>${it.desc}</span><span class="ii-f">${facts}</span></div>`);
    const x = h('button', 'ii-x', '✕'); x.onclick = () => { this.cr.sel = null; this.refreshPanel(); };
    box.appendChild(x);
    box.appendChild(h('div', 'pp-cost cr-need', this.costHtml(r.need, f)));
    if (st.level < r.level) { box.appendChild(h('div', 'ii-note', `Откроется с ${r.level} уровня.`)); return box; }
    if (block && !/^Не хватает/.test(block)) box.appendChild(h('div', 'ii-note', block));
    const acts = h('div', 'ii-a');
    const go = h('button', 'btn-s gold', `${b.verb} · ${fmtShort(r.time)}`);
    go.disabled = !!block; go.onclick = () => f.builds.craft(k, r.key);
    acts.appendChild(go);
    box.appendChild(acts);
    return box;
  }

  // Что в очереди здания (вид каждого места): сменилось — окно пересобирается
  craftKey(f, k, now) {
    return BR.queueView(f.st, k, now).jobs.map((j) => (j.done ? 'd' : j.running ? 'r' : 'w') + j.id).join(',') + '|' + (BR.isBuilt(f.st, k, now) ? 1 : 0);
  }

  // Раз в секунду, пока открыто окно здания: время и полоска у того, что делается сейчас
  craftTick(f) {
    const S = this.cr;
    if (!S) return;
    const now = Date.now();
    if (this.craftKey(f, S.k, now) !== S.key) return this.refreshPanel();
    const j = BR.queueView(f.st, S.k, now).jobs.find((x) => x.running), el = this.panelEl.querySelector('.cr-slot.run');
    if (!j || !el) return;
    el.querySelector('.cr-bar u').style.width = (j.k * 100).toFixed(1) + '%';
    el.querySelector('.cr-left').textContent = leftText(j.left);
    const gems = BR.gemsFor(j.left), sp = el.querySelector('.cr-speed');
    if (sp.dataset.g !== String(gems)) { sp.dataset.g = gems; sp.innerHTML = `${gems} ${this.ic('gem', 'ic-s')}`; }
    sp.disabled = f.st.gems < gems;
  }

  // ---------- Окно «разделы слева, предметы справа» (рюкзак, рынок, выдача тестера) ----------
  // tabs — [{ key, name, icon, empty }] (пустой раздел бледнее, но открывается), tab — выбранный, onTab(key) меняет
  // состояние окна (окно пересоберётся само). sort — { val, set(v), cheap } — порядок над списком (cheap: «По цене»
  // сначала дешёвые), top — свой элемент над списком. Возвращает { list, info(box) }: list — куда класть клетки,
  // info(box) — карточка выбранного предмета (на телефоне — внизу во всю ширину, в горизонтали — колонкой справа).
  shelf(body, id, { tabs, tab, onTab, sort, top }) {
    body.classList.add('sh-body');
    const sh = h('div', 'sh'), rail = h('div', 'sh-rail'), main = h('div', 'sh-main'), list = h('div', 'sh-list');
    rail.dataset.scroll = `rail:${id}`;
    list.dataset.scroll = `list:${id}:${tab}`;
    for (const t of tabs) {
      const b = h('button', 'sh-tab' + (t.key === tab ? ' on' : '') + (t.empty ? ' empty' : ''), `${this.ic(t.icon)}<span>${t.name}</span>`);
      b.onclick = () => { if (t.key !== tab) { onTab(t.key); this.sfx('tap'); this.refreshPanel(); } };
      rail.appendChild(b);
    }
    if (sort) main.appendChild(this.sortBar(sort));
    if (top) main.appendChild(top);
    main.appendChild(list);
    // в горизонтали колонка карточки есть всегда (иначе клетки перестраиваются при выборе): пока пусто — подсказка
    const none = h('div', 'sh-info sh-none', `${this.ic(id === 'buy' || id === 'sell' ? 'market' : 'bag', 'ic big')}<span>Нажмите на предмет, чтобы узнать о нём больше</span>`);
    sh.append(rail, main, none);
    body.appendChild(sh);
    return { list, info: (box) => { box.classList.add('sh-info'); none.replaceWith(box); } };
  }

  // Порядок: «Обычный», «По цене» (повторное нажатие меняет направление: ↓ — сначала дорогие, ↑ — дешёвые), «А–Я»
  sortBar({ val, set, cheap }) {
    const bar = h('div', 'sh-sort'), byPrice = val === 'price' || val === 'cheap';
    for (const k of ['auto', 'price', 'name']) {
      const on = k === 'price' ? byPrice : val === k;
      const name = k === 'auto' ? 'Обычный' : k === 'name' ? 'А–Я' : byPrice ? `По цене ${val === 'cheap' ? '↑' : '↓'}` : 'По цене';
      const b = h('button', on ? 'on' : '', name);
      b.onclick = () => {
        const v = k !== 'price' ? k : byPrice ? (val === 'cheap' ? 'price' : 'cheap') : cheap ? 'cheap' : 'price';
        if (v !== val) { set(v); this.sfx('tap'); this.refreshPanel(); }
      };
      bar.appendChild(b);
    }
    return bar;
  }

  // нажатие по клетке: выбрать предмет (его карточка — снизу) или снять выбор
  pick(S, key) { S.sel = S.sel === key ? null : key; this._reveal = !!S.sel; this.sfx('tap'); this.refreshPanel(); }

  // своё в шапке окна между названием и ✕: у рынка — «Купить / Продать», у рюкзака — энергия
  headExtra(card, el) { const head = card.querySelector('.pn-head'); head.insertBefore(el, head.lastChild); }

  // ---------- Рынок: «Заказы», «Купить» и «Продать» ----------
  // mode — сразу этот раздел (иначе тот, что был открыт в прошлый раз)
  // mode — сразу этот режим ('orders' | 'buy' | 'sell'); item — сразу этот товар на «Купить» (кнопка «Грядки»)
  marketPanel(f, mode, item) {
    const M = this.mk || (this.mk = { mode: 'sell', tab: 'seeds', sel: null });
    if (mode && mode !== M.mode) { M.mode = mode; M.sel = null; }
    const o = item && SHOP.find((x) => x.item === item);
    if (o) { M.mode = 'buy'; M.tab = o.tab; M.sel = item; M.skip = null; }
    this.openPanel('market', 'Рынок', (body, card) => {
      const seg = h('div', 'mk-seg n3'), ready = f.orders.ready();
      for (const [k, name] of [['orders', 'Заказы'], ['buy', 'Купить'], ['sell', 'Продать']]) {
        const b = h('button', M.mode === k ? 'on' : '', name + (k === 'orders' && ready ? '<i class="qt-dot"></i>' : ''));
        b.onclick = () => { if (M.mode !== k) { M.mode = k; M.sel = null; M.skip = null; this.sfx('tap'); this.refreshPanel(); } };
        seg.appendChild(b);
      }
      this.headExtra(card, seg);
      if (M.mode === 'orders') this.ordersBody(f, body, M);
      else if (M.mode === 'sell') this.marketSell(f, body, M);
      else this.marketBuy(f, body, M);
    });
  }

  // Цифра на кнопке «Грядки»: сколько грядок ждёт в рюкзаке (нет — кнопка ведёт на рынок)
  bedsBadge(f) {
    const n = Inv.count(f.st, BED_ITEM);
    if (this.last.bedsBag === n) return;
    this.last.bedsBag = n;
    const b = $('#beds-badge');
    b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
  }

  // Цифра на кнопке «Рынок»: сколько заказов можно сдать прямо сейчас
  marketBadge(f) {
    const n = f.orders.ready();
    if (this.last.orders === n) return;
    this.last.orders = n;
    const b = $('#market-badge');
    b.hidden = !n; b.textContent = n;
  }

  // ---------- Доска заказов ----------
  // Три места: заказ (кто, что просит — есть/нужно, награда, «Отдать» и «Отказаться») или покупатель в пути
  // (время до нового заказа и «Позвать сейчас» за кристаллы). Отказ — со второго нажатия (M.skip — id заказа).
  ordersBody(f, body, M) {
    body.classList.add('od-body');
    const v = f.orders.view();
    if (!v.open) {
      body.appendChild(h('div', 'od-lock', `${this.ic('note', 'ic big')}<b>Доска заказов</b>` +
        `<span>Соседи будут заказывать урожай и рыбу и платить за них больше, чем рынок. Откроется с ${v.level} уровня.</span>`));
      return;
    }
    body.appendChild(h('div', 'od-head', `<span>Соседи платят больше, чем рынок</span><span>Сдано: ${fmtNum(v.done)}</span>`));
    const list = h('div', 'od-list');
    for (const s of v.slots) list.appendChild(s.order ? this.orderCard(f, s, M) : this.orderWait(f, s));
    body.appendChild(list);
  }

  orderCard(f, s, M) {
    const o = s.order, c = h('div', 'od-card' + (s.ready ? ' ready' : ''));
    c.dataset.id = o.id;
    const top = h('div', 'od-who', `${this.ic('friends', 'ic')}<div><b>${s.who.name}</b><span class="od-say">${s.who.text}</span></div>`);
    const sure = M.skip === o.id;
    const x = h('button', 'od-skip' + (sure ? ' sure' : ''), sure ? 'Точно отказаться?' : 'Отказаться');
    x.onclick = () => {
      if (sure) { M.skip = null; f.orders.skip(s.idx); return; }
      M.skip = o.id; this.sfx('tap'); this.refreshPanel();
    };
    top.appendChild(x);
    c.appendChild(top);
    const goods = h('div', 'od-goods');
    for (const l of s.lines) {
      const it = ITEMS[l.id], ok = l.have >= l.n;
      const g = h('div', 'od-good' + (ok ? ' ok' : ''), `<i>${this.ic(it.icon, 'ic')}${ok ? '<em>✓</em>' : ''}</i><span>${it.name}</span><b>${fmtNum(Math.min(l.have, l.n))}/${l.n}</b>`);
      g.title = it.name;
      goods.appendChild(g);
    }
    c.appendChild(goods);
    const foot = h('div', 'od-foot', `<div class="od-pay"><b>${fmtNum(o.coins)} ${this.ic('coin')}</b><b>+${o.xp} ${this.ic('star')}</b>` +
      `<small>на рынке ${fmtNum(o.value)} ${this.ic('coin')}</small></div>`);
    const give = h('button', 'btn-s gold od-give', 'Отдать');
    give.disabled = !s.ready;
    give.onclick = () => { M.skip = null; f.orders.deliver(s.idx); };
    foot.appendChild(give);
    c.appendChild(foot);
    return c;
  }

  orderWait(f, s) {
    const c = h('div', 'od-card od-wait');
    c.appendChild(h('div', 'od-who', `${this.ic('friends', 'ic')}<div><b>Покупатель в пути</b><span>Новый заказ через <b class="od-t" data-i="${s.idx}">${fmtWait(s.wait)}</b></span></div>`));
    const b = h('button', 'btn-s od-rush', `Позвать сейчас · ${s.gems} ${this.ic('gem')}`);
    b.dataset.g = s.gems;
    b.disabled = f.st.gems < s.gems;
    b.onclick = () => f.orders.rush(s.idx);
    c.appendChild(b);
    return c;
  }

  // Раз в секунду, пока открыты «Заказы»: идёт время до покупателя (цена «Позвать сейчас» поменялась — окно заново)
  ordersTick(f) {
    const v = f.orders.view();
    for (const s of v.slots) {
      if (s.order) continue;
      const t = this.panelEl.querySelector(`.od-t[data-i="${s.idx}"]`), b = t && t.closest('.od-card').querySelector('.od-rush');
      if (!t) continue;
      if (b && +b.dataset.g !== s.gems) { this.refreshPanel(); return; }
      t.textContent = fmtWait(s.wait);
    }
  }

  // Продажа — как в рюкзаке: разделы и порядок, но только то, что можно продать
  marketSell(f, body, M) {
    const st = f.st;
    M.stab = M.stab || 'all'; M.sort = M.sort || 'auto';
    const sellable = (tab, sort) => Inv.listItems(st, tab, sort).filter((it) => it.sell);
    const L = this.shelf(body, 'sell', {
      tabs: INV_TABS.filter((t) => SELL_TABS.includes(t.key)).map((t) => ({ ...t, empty: !sellable(t.key, 'auto').length })),
      tab: M.stab,
      onTab: (k) => { M.stab = k; if (M.sel && k !== 'all' && !ITEMS[M.sel].tabs.includes(k)) M.sel = null; },
      sort: { val: M.sort, set: (v) => { M.sort = v; } },
    });
    const list = sellable(M.stab, M.sort);
    if (!list.length) {
      L.list.appendChild(h('div', 'pn-empty', M.stab === 'all' ? 'Пока нечего продать. Соберите урожай с грядок или поймайте рыбу.' : 'В этом разделе пока нечего продать.'));
      M.sel = null; return;
    }
    const g = h('div', 'mk-grid');
    for (const it of list) {
      // нужен для заказа на доске — пометка в углу клетки, чтобы не продать его случайно
      const c = h('button', 'mk-cell' + (M.sel === it.key ? ' sel' : ''),
        `<i>${this.ic(it.icon, 'ic')}${it.badge ? this.ic(it.badge, 'inv-badge') : ''}${f.orders.need(it.key) ? this.ic('note', 'mk-need') : ''}<b>${fmtNum(Inv.count(st, it.key))}</b></i><span>${it.sell} ${this.ic('coin', 'ic-s')}</span>`);
      c.title = it.name;
      c.onclick = () => this.pick(M, it.key);
      g.appendChild(c);
    }
    L.list.appendChild(g);
    const it = M.sel && ITEMS[M.sel], n = it ? Inv.count(st, it.key) : 0;
    if (!it || !n || !it.sell) { M.sel = null; return; }
    const need = f.orders.need(it.key);
    const box = this.mkCard(it, `${n} шт. · ${it.sell} ${this.ic('coin')} за шт.${need ? ` · нужно для заказа: ${need}` : ''}`, M);
    box.appendChild(this.sellRow(f, it, n));
    L.info(box);
  }

  marketBuy(f, body, M) {
    const st = f.st;
    M.bsort = M.bsort || 'auto';
    const L = this.shelf(body, 'buy', {
      tabs: SHOP_TABS.map((t) => ({ ...t, empty: !SHOP.some((o) => o.tab === t.key) })),
      tab: M.tab,
      onTab: (k) => { M.tab = k; M.sel = null; },
      sort: { val: M.bsort, set: (v) => { M.bsort = v; }, cheap: true },
    });
    // грядка: цена растёт с каждой, предел — по уровню (beds.js); закрыта предел, как товар «с N ур.»
    const bed = SHOP.some((o) => o.bed && o.tab === M.tab) ? Beds.bedOffer(st, f.bedCounts().bedsAll) : null;
    const live = (o) => (o.bed ? { ...o, price: bed.price, level: bed.can ? 1 : bed.level || Infinity } : o);
    const offers = sortOffers(SHOP.filter((o) => o.tab === M.tab).map(live), M.bsort, st.level);
    if (!offers.length) { L.list.appendChild(h('div', 'pn-empty', 'Скоро здесь появятся товары.')); return; }
    const g = h('div', 'mk-grid');
    for (const o of offers) {
      const it = ITEMS[o.item], locked = o.level > st.level, cur = o.cur === 'gems' ? 'gem' : 'coin';
      const own = it.blueprint && BR.owned(st, it.blueprint); // здание уже есть — чертёж больше не нужен
      const c = h('button', 'mk-cell' + (locked ? ' locked' : '') + (M.sel === o.item ? ' sel' : ''),
        `<i>${this.ic(it.icon, 'ic')}${it.badge ? this.ic(it.badge, 'inv-badge') : ''}${locked ? this.ic('lock', 'mk-lock') : ''}${o.qty > 1 ? `<b>×${o.qty}</b>` : ''}</i>` +
        `<span>${locked ? (o.level === Infinity ? 'всё' : `с ${o.level} ур.`) : own ? 'построено' : `${o.price} ${this.ic(cur, 'ic-s')}`}</span>`);
      c.title = it.name;
      c.onclick = () => this.pick(M, o.item);
      g.appendChild(c);
    }
    L.list.appendChild(g);
    const o = M.sel && offers.find((x) => x.item === M.sel);
    if (!o) { M.sel = null; return; }
    const it = ITEMS[o.item], have = Inv.count(st, it.key), pack = o.qty || 1;
    const curKey = o.cur || 'coins', cur = curKey === 'gems' ? 'gem' : 'coin';
    const per = it.blueprint ? `${o.price} ${this.ic(cur)} · стройка ${fmtShort(BUILDINGS[it.blueprint].time)}`
      : pack > 1 ? `${o.price} ${this.ic(cur)} за ${pack} шт.` : `${o.price} ${this.ic(cur)} за шт.`;
    const box = this.mkCard(it, `${per}${it.food ? ` · +${it.food} ${this.ic('energy')}` : ''}${it.floraOf && FLORA[it.floraOf].pick ? ` · плоды: ${ITEMS[FLORA[it.floraOf].fruit].name.toLowerCase()} по ${ITEMS[FLORA[it.floraOf].fruit].sell} ${this.ic('coin')}` : ''}${o.bed ? ` · грядок ${bed.owned} из ${Math.max(bed.owned, bed.limit)}` : ''}${have ? ` · в рюкзаке ${have}` : ''}`, M);
    if (o.bed) box.appendChild(h('div', 'ii-note', this.bedNote(bed, st.level)));
    const locked = o.level > st.level;
    if (locked && !o.bed) box.appendChild(h('div', 'ii-note', `Откроется с ${o.level} уровня.`));
    else if (!locked && it.blueprint) this.blueprintBuy(f, box, o, it);
    // грядки упёрлись в предел: купить нельзя, а поставить те, что в рюкзаке, — можно
    if (!it.blueprint && (!locked || (o.bed && have))) {
      const row = h('div', 'ii-sell'), acts = h('div', 'ii-a');
      if (!locked) {
        // грядку — по одной: следующая уже дороже
        const max = o.bed ? Math.min(1, Math.floor(st[curKey] / o.price)) : Math.min(99, Math.floor(st[curKey] / o.price));
        const Q = this.buyQty || (this.buyQty = {});
        const q = Q[o.item] = Math.max(1, Math.min(Math.max(1, max), Q[o.item] || 1));
        if (max > 1) row.appendChild(this.stepper(q, max, (v) => { Q[o.item] = v; this.refreshPanel(); }));
        const b = h('button', 'btn-s gold', `Купить ${q * pack} шт. · ${q * o.price} ${this.ic(cur)}`);
        b.disabled = st[curKey] < q * o.price; b.onclick = () => f.buy(o, q);
        acts.appendChild(b);
      }
      // купленную дорожку (и грядку) — сразу класть: окно закрывается, включается «Кладём дорожку»;
      // пруд, украшение пруда, постройку (поливалку) — ставить: выбраны в «Переставить», нажатие на клетку — предпросмотр
      if (Mover.placeable(it) && have) {
        const p = h('button', locked ? 'btn-s gold' : 'btn-s', 'Поставить');
        p.onclick = () => { this.closePanel(); f.mover.useItem(it.key); };
        acts.appendChild(p);
      }
      row.appendChild(acts);
      box.appendChild(row);
    }
    L.info(box);
  }
  // Строка про предел грядок в карточке грядки на рынке
  bedNote(b, level) {
    if (!b.can) return b.level ? `Грядок уже ${b.owned}: столько можно на ${level} уровне. Следующую можно купить с ${b.level} уровня.`
      : `Грядок уже ${b.owned}: больше не бывает.`;
    const max = BEDS.limit.max, more = b.limit - b.owned;
    return `Ещё можно купить ${more} ${R.plural(more, ['грядку', 'грядки', 'грядок'])}${b.limit < max ? `, с уровнем предел растёт до ${max}` : ''}. Каждая следующая дороже.`;
  }

  // Чертёж здания на рынке: материалы на стройку; купить можно один, пока здания нет на ферме.
  // Чертёж в рюкзаке — «Построить» (выбрать место, Mover.takeFromBag)
  blueprintBuy(f, box, o, it) {
    const k = it.blueprint, st = f.st, block = BR.blueprintBlock(st, k);
    box.appendChild(h('div', 'ii-note', 'Материалы на стройку:'));
    box.appendChild(h('div', 'pp-cost cr-need', this.costHtml(BUILDINGS[k].cost, f)));
    if (block && !Inv.count(st, it.key)) box.appendChild(h('div', 'ii-note', block.why + '.'));
    const acts = h('div', 'ii-a');
    if (!block) {
      const b = h('button', 'btn-s gold', `Купить чертёж · ${o.price} ${this.ic(o.cur === 'gems' ? 'gem' : 'coin')}`);
      b.disabled = st[o.cur || 'coins'] < o.price; b.onclick = () => f.buy(o, 1);
      acts.appendChild(b);
    }
    if (Inv.count(st, it.key)) acts.appendChild(this.buildBtn(f, it));
    if (acts.children.length) box.appendChild(acts);
  }

  // «Построить» у чертежа: хватает материалов — окно закрывается, выбираем место для стройки
  buildBtn(f, it) {
    const b = h('button', 'btn-s gold', `${this.ic('build')} Построить`), why = BR.buildBlock(f.st, it.blueprint);
    b.disabled = !!why;
    b.onclick = () => { this.closePanel(); f.mover.takeFromBag(it.key); };
    return b;
  }

  // карточка выбранного товара на рынке (снизу окна)
  mkCard(it, facts, M) {
    const box = h('div', 'inv-info ui-layer',
      `<div class="ii-ic">${this.ic(it.icon, 'ic big')}${it.badge ? this.ic(it.badge, 'inv-badge') : ''}</div>` +
      `<div class="ii-t"><b>${it.name}</b><span>${it.desc}</span><span class="ii-f">${facts}</span></div>`);
    const x = h('button', 'ii-x', '✕'); x.onclick = () => { M.sel = null; this.refreshPanel(); };
    box.appendChild(x);
    return box;
  }

  // −10 −1 [N] +1 +10, значение от 1 до max
  stepper(q, max, set) {
    const step = h('div', 'ii-step');
    for (const d of [-10, -1, 0, 1, 10]) {
      if (!d) { step.appendChild(h('b', 'ii-q', String(q))); continue; }
      const b = h('button', 'btn-s', d > 0 ? '+' + d : '−' + -d);
      b.disabled = d < 0 ? q <= 1 : q >= max;
      b.onclick = () => set(Math.max(1, Math.min(max, q + d)));
      step.appendChild(b);
    }
    return step;
  }

  // ---------- Рюкзак: разделы слева, клетки с порядком справа ----------
  // Выбранный раздел, порядок и предмет помним между открытиями. Энергия — в шапке окна.
  bagPanel(f) {
    const S = this.inv || (this.inv = { tab: 'all', sort: 'auto', sel: null });
    this.openPanel('bag', 'Рюкзак', (body, card) => {
      const st = f.st;
      this.headExtra(card, h('div', 'pn-en', `${this.ic('energy')}<b>${st.energy}/${f.maxEnergy}</b><small id="bag-en">${this.bagEnergy(f)}</small>`));
      const L = this.shelf(body, 'bag', {
        tabs: INV_TABS.map((t) => ({ ...t, empty: !Inv.listItems(st, t.key, 'auto').length })),
        tab: S.tab,
        // карточка предмета из другого раздела закрывается
        onTab: (k) => { S.tab = k; if (S.sel && k !== 'all' && !ITEMS[S.sel].tabs.includes(k)) S.sel = null; },
        sort: { val: S.sort, set: (v) => { S.sort = v; } },
      });
      const list = Inv.listItems(st, S.tab, S.sort);
      if (!list.length) {
        const empty = { build: 'Поливалки и другие постройки продаются на рынке, раздел «Постройки».', decor: 'Дорожки, пруды и другой декор продаются на рынке, раздел «Декор».' };
        L.list.appendChild(h('div', 'pn-empty', empty[S.tab] || 'Здесь пока пусто.'));
      } else {
        const g = h('div', 'inv-grid');
        for (const it of list) {
          const n = it.tool ? (it.can ? `${st.can}/${f.canMax}` : '') : fmtNum(Inv.count(st, it.key));
          const c = h('button', 'inv-cell' + (S.sel === it.key ? ' sel' : ''),
            `${this.ic(it.icon, 'ic')}${it.badge ? this.ic(it.badge, 'inv-badge') : ''}${n ? `<b>${n}</b>` : ''}`);
          c.title = it.name;
          c.onclick = () => this.pick(S, it.key);
          g.appendChild(c);
        }
        L.list.appendChild(g);
      }
      const it = S.sel && ITEMS[S.sel];
      if (!it || (!it.tool && !Inv.count(st, it.key))) { S.sel = null; return; }
      L.info(this.itemInfo(f, it));
    });
  }

  // энергия в шапке рюкзака: сколько до следующей единицы (обновляется каждую секунду, UI.tick)
  bagEnergy(f) { return f.st.energy >= f.maxEnergy ? 'полная' : `+1 через ${fmtClock(f.energyLeftSec())}`; }
  // Продажа с выбором количества: −10 −1 [N] +1 +10, «Продать N» и «Все»
  sellRow(f, it, n) {
    const Q = this.sellQty || (this.sellQty = {}); // выбранное количество — своё у каждого предмета
    const q = Q[it.key] = Math.max(1, Math.min(n, Q[it.key] || 1));
    const row = h('div', 'ii-sell');
    if (n > 1) row.appendChild(this.stepper(q, n, (v) => { Q[it.key] = v; this.refreshPanel(); }));
    const acts = h('div', 'ii-a');
    const b1 = h('button', 'btn-s', `Продать ${q} · ${q * it.sell} ${this.ic('coin')}`); b1.onclick = () => f.sell(it.key, q);
    acts.appendChild(b1);
    if (n > 1) { const b2 = h('button', 'btn-s gold', `Все ${n}: ${n * it.sell} ${this.ic('coin')}`); b2.onclick = () => f.sell(it.key, n); acts.appendChild(b2); }
    row.appendChild(acts);
    return row;
  }

  // ---------- Посадка: окно-сетка и плашка режима посадки ----------
  // Нажали на пустую грядку b (или на плашку посадки — тогда b = null, меняем культуру): сетка культур,
  // 5 в ряд, порядок и фильтры — Plant.cropChoices. Выбрали — окно закрывается, культура сажается на b,
  // и включается режим посадки (Farm.pickCrop). Фильтр помним между открытиями.
  plantPanel(f, b) {
    const S = this.pl || (this.pl = { filter: 'all' });
    this.openPanel('plant', 'Что посадить?', (body) => {
      const chips = h('div', 'pl-chips');
      for (const [k, name] of [['all', 'Все'], ['seeds', 'Есть семена'], ['fast', 'Быстрые']]) {
        const c = h('button', 'inv-chip' + (S.filter === k ? ' on' : ''), name);
        c.onclick = () => { if (S.filter !== k) { S.filter = k; this.sfx('tap'); this.refreshPanel(); } };
        chips.appendChild(c);
      }
      body.appendChild(chips);
      const list = Plant.cropChoices(f.st, S.filter);
      if (!list.length) {
        body.appendChild(h('div', 'pn-empty', S.filter === 'seeds'
          ? 'Своих семян пока нет: без них посадка стоит монет. Семена бывают в высокой траве и в урожае с грядок.'
          : 'Быстрых культур пока нет.'));
        return;
      }
      const g = h('div', 'pl-grid');
      for (const r of list) {
        const c = r.c;
        // в клетке: сверху справа — время роста (у закрытой — уровень), снизу справа — сколько своих семян,
        // цена семян или замок; под клеткой — название
        const corner = !r.open ? this.ic('lock', 'pl-lock') : r.seeds ? `${this.ic('seed', 'inv-badge')}<b class="pl-n">${fmtNum(r.seeds)}</b>`
          : `<b class="pl-p">${c.seed}${this.ic('coin', 'ic-s')}</b>`;
        const cell = h('button', 'pl-cell' + (r.last ? ' last' : '') + (!r.open ? ' locked' : !r.can ? ' poor' : ''),
          `<i>${this.ic(c.key)}<s class="pl-t">${r.open ? fmtShort(c.time) : `${c.level} ур.`}</s>${corner}</i><span class="pl-name">${c.name}</span>`);
        cell.onclick = () => {
          if (!r.open) return this.toast(`${c.name}: откроется с ${c.level} уровня`);
          if (!r.can) return f.toast('Не хватает монет на семена', 'warn');
          this.closePanel();
          f.pickCrop(c.key, b);
        };
        g.appendChild(cell);
      }
      body.appendChild(g);
    }, { music: false });
  }

  // Сетка саженцев и своих выкопанных растений (Farm.sowChoices). x = null — открыли с плашки посадки:
  // выбранный саженец становится саженцем режима посадки; x, y — посадить на эту клетку.
  sowPanel(f, x, y) {
    this.openPanel('sow', 'Что посадить?', (body) => {
      const list = f.sowChoices();
      if (!list.length) { body.appendChild(h('div', 'pn-empty', 'Саженцев больше нет.')); return; }
      const g = h('div', 'pl-grid');
      for (const r of list) {
        const fl = FLORA[r.species];
        const cell = h('button', 'pl-cell' + (r.grown ? ' last' : ''),
          `<i>${this.ic(ITEMS[r.id].icon)}<s class="pl-t">${r.grown ? 'сразу' : fmtShort(fl.grow)}</s>${r.grown ? '' : this.ic('seed', 'inv-badge')}<b class="pl-n">${fmtNum(r.n)}</b></i>` +
          `<span class="pl-name">${fl.name}</span>`);
        cell.onclick = () => { this.closePanel(); if (x == null) f.pickSow(r.species, r.grown); else f.queue({ kind: 'sow', x, y, species: r.species, grown: r.grown }); };
        g.appendChild(cell);
      }
      body.appendChild(g);
      body.appendChild(h('div', 'pn-text', 'Свои выкопанные растения (в жёлтой рамке) встают сразу взрослыми, саженцы растут указанное время.'));
    }, { music: false });
  }

  // Плашка режима посадки внизу (вместо нижних кнопок): «Сажаем: морковь» — нажатие меняет культуру, ✕ — выход
  plantBar(f) {
    const P = f.planting, on = !!P, body = document.body;
    if (body.classList.contains('planting') !== on) { body.classList.toggle('planting', on); $('#plant-bar').hidden = !on; this._safe = null; }
    if (!on) { this.last.pb = null; return; }
    if (P.species) {
      // саженец или своё растение на свободную траву
      const fl = FLORA[P.species], id = (P.grown ? floraOwnId : floraSeedId)(P.species), it = ITEMS[id], n = Inv.count(f.st, id);
      const key = `sow:${id}:${n}:${this.icons[it.icon] ? 1 : 0}`;
      if (this.last.pb === key) return;
      this.last.pb = key;
      $('#pb-ic').src = this.icons[it.icon] || '';
      $('#pb-name').textContent = `Сажаем: ${fl.name.toLowerCase()}${P.grown ? ' (взрослое)' : ''}`;
      $('#pb-sub').textContent = `есть: ${fmtNum(n)} · нажимай на траву`;
      return;
    }
    const c = CROPS[P.crop], seeds = Inv.count(f.st, seedId(c.key));
    const key = `crop:${c.key}:${seeds}:${c.seed}:${this.icons[c.key] ? 1 : 0}`;
    if (this.last.pb === key) return;
    this.last.pb = key;
    $('#pb-ic').src = this.icons[c.key] || '';
    $('#pb-name').textContent = `Сажаем: ${c.name.toLowerCase()}`;
    $('#pb-sub').innerHTML = `${seeds ? `семян: ${fmtNum(seeds)}` : `по ${c.seed} ${this.ic('coin', 'ic-s')}`} · нажимай на грядки`;
  }

  itemInfo(f, it) {
    const st = f.st, n = Inv.count(st, it.key);
    const tags = it.tabs.map((k) => INV_TABS.find((t) => t.key === k).name).join(' · ');
    const facts = [
      !it.tool && `${n} шт.`,
      it.can && `воды: ${st.can}/${f.canMax}`,
      it.food && `+${it.food} ${this.ic('energy')}`,
      it.sell && `${it.sell} ${this.ic('coin')} за шт.`,
    ].filter(Boolean).join(' · ');
    const box = h('div', 'inv-info ui-layer',
      `<div class="ii-ic">${this.ic(it.icon, 'ic big')}${it.badge ? this.ic(it.badge, 'inv-badge') : ''}</div>` +
      `<div class="ii-t"><b>${it.name}</b><i>${tags}</i><span>${it.desc}</span>${facts ? `<span class="ii-f">${facts}</span>` : ''}</div>`);
    const x = h('button', 'ii-x', '✕'); x.onclick = () => { this.inv.sel = null; this.refreshPanel(); };
    box.appendChild(x);
    const acts = h('div', 'ii-a');
    if (it.food) {
      const b = h('button', 'btn-s', `Съесть +${it.food} ${this.ic('energy')}`);
      b.disabled = st.energy >= f.maxEnergy; b.onclick = () => f.eat(it.key);
      acts.appendChild(b);
    }
    // семена и саженцы: «Посадить» закрывает рюкзак и включает режим посадки (нажимай на грядки или траву)
    if ((it.seedOf || it.floraOf) && n > 0) {
      const lock = it.seedOf && CROPS[it.seedOf].level > st.level;
      const b = h('button', 'btn-s gold', lock ? `Посадить с ${CROPS[it.seedOf].level} ур.` : `${this.ic('seed')} Посадить`);
      b.disabled = lock;
      b.onclick = () => {
        this.closePanel();
        if (it.seedOf) f.pickCrop(it.seedOf, null); else f.pickSow(it.floraOf, !!it.grown);
      };
      acts.appendChild(b);
    }
    // чертёж здания: что нужно на стройку и «Построить»;
    // дорожки: «Поставить» закрывает рюкзак и включает «Кладём дорожку» (нажимай на траву);
    // пруды, украшения прудов и постройки — выбирают клетку с предпросмотром (Mover.takeFromBag)
    if (it.blueprint && n > 0) {
      box.appendChild(h('div', 'pp-cost cr-need', this.costHtml(BUILDINGS[it.blueprint].cost, f)));
      acts.appendChild(this.buildBtn(f, it));
    } else if (Mover.placeable(it) && n > 0) {
      const b = h('button', 'btn-s gold', `${this.ic('move')} Поставить`);
      b.onclick = () => { this.closePanel(); f.mover.useItem(it.key); };
      acts.appendChild(b);
    }
    if (acts.children.length) box.appendChild(acts);
    if (it.sell && n > 0) box.appendChild(this.sellRow(f, it, n));
    return box;
  }
}

// время роста коротко, для клеток: «2 мин», «1,5 ч», «2 д»
function fmtShort(s) {
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} мин`;
  if (s < 86400) return `${String(+(s / 3600).toFixed(1)).replace('.', ',')} ч`;
  return `${String(+(s / 86400).toFixed(1)).replace('.', ',')} д`;
}
// Когда стрелка проходит границу сектора: колесо крутится от from до to градусов за dur мс по кривой
// cubic-bezier(ease). Возвращает задержки щелчков в секундах (не чаще, чем раз в 45 мс).
function wheelTicks(from, to, seg, dur, [x1, y1, x2, y2]) {
  const bz = (a, b, s) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  const out = [];
  let last = -1;
  // границы секторов проходят под стрелкой, когда угол колеса = seg/2 + k·seg
  for (let a = Math.ceil((from - seg / 2) / seg) * seg + seg / 2; a < to; a += seg) {
    if (a <= from) continue;
    const p = (a - from) / (to - from);
    let lo = 0, hi = 1;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (bz(y1, y2, m) < p) lo = m; else hi = m; }
    const t = bz(x1, x2, (lo + hi) / 2) * dur / 1000;
    if (t - last >= 0.045) { out.push(t); last = t; }
  }
  return out;
}
// Порядок товаров на рынке. Закрытые по уровню — всегда в конце. «По цене» — сначала за монеты, потом за кристаллы;
// sort 'price' — сначала дорогие, 'cheap' — дешёвые. 'auto' — как в таблице SHOP (по уровню).
function sortOffers(offers, sort, level) {
  const name = (o) => ITEMS[o.item].name, gem = (o) => (o.cur === 'gems' ? 1 : 0), d = sort === 'cheap' ? 1 : -1;
  const by = sort === 'name' ? (a, b) => name(a).localeCompare(name(b), 'ru')
    : sort === 'price' || sort === 'cheap' ? (a, b) => gem(a) - gem(b) || d * (a.price - b.price)
    : () => 0;
  return offers.map((o, i) => ({ o, i, lock: o.level > level ? 1 : 0 }))
    .sort((a, b) => a.lock - b.lock || by(a.o, b.o) || a.i - b.i).map((x) => x.o);
}
function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n);
}
// сколько осталось: «5 ч 12 мин», «2 д 3 ч», «7 мин»
function fmtLeft(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000)), d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d} д ${hh} ч` : hh ? `${hh} ч ${mm} мин` : `${mm} мин`;
}
// день по московскому времени (как сброс заданий): «7 ноября»
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function fmtDay(t) { const d = new Date(t + QUEST_TZ * 3600e3); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
// до нового покупателя: «4:32», дольше часа — «1 ч 5 мин»
function fmtWait(ms) { return ms >= 3600e3 ? fmtLeft(ms) : fmtClock(Math.ceil(ms / 1000)); }
function fmtClock(s) { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }
// сколько осталось сделать (секунды): до часа — «4:05», дольше — «1 ч 10 мин»
function leftText(sec) { return sec < 3600 ? fmtClock(Math.ceil(sec)) : fmtLeft(sec * 1000); }
