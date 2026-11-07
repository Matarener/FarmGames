// Интерфейс поверх канваса (DOM): верхняя панель, ресурсы, кнопки,
// всплывающие меню у объектов, окна, уведомления. DOM обновляется только
// при изменениях, а не каждый кадр.

import { HOUSE, ITEMS, INV_TABS, SHOP, SHOP_TABS, xpToNext, houseNeedChunks } from '../game/data.js';
import * as Inv from '../game/inventory.js';
import * as R from '../game/questRules.js';
import { PERIODS, EVENTS, PERIODIC_LEVEL, QUEST_TZ, MAX_PINS } from '../game/questData.js';
import { hasHint, hintAuto } from '../game/hints.js';
import { MUSIC } from '../engine/Audio.js';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const RES_NAMES = { wood: 'Дерево', stone: 'Камень', ore: 'Руда', coins: 'Монеты', gems: 'Кристаллы' };
// кнопки, к которым может показать стрелка-подсказка (UI.hint)
const HINT_EL = { quest: '#btn-quests', market: '#btn-market' };
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
    window.addEventListener('resize', () => { this._safe = null; });
  }

  bind(farm, icons) {
    this.farm = farm;
    this.icons = icons;
    this.refreshIcons();
    farm.onIcons = () => { clearTimeout(this._icT); this._icT = setTimeout(() => this.refreshIcons(), 30); };
    $('#btn-bag').onclick = () => this.bagPanel(farm);
    $('#btn-market').onclick = () => this.marketPanel(farm);
    $('#btn-quests').onclick = () => this.questPanel(farm);
    $('#btn-center').onclick = () => { farm.player.worldPos(this._p = this._p || {}); farm.cam.centerOn(this._p.x, this._p.y - 20); };
    $('#energy-pill').onclick = () => this.bagPanel(farm);
    $('#btn-more').onclick = () => this.toggleMore();
    $('#mb-done').onclick = () => farm.mover.exit();
    $('#mb-cancel').onclick = () => farm.mover.cancel();
    $('#mb-place').onclick = () => farm.mover.place();
    $('#mb-store').onclick = () => farm.mover.store();
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
    if (this._hintEl) this._hintEl.classList.remove('hint');
    this._hintEl = e || null;
    if (e) e.classList.add('hint');
  }

  // Свободная от интерфейса часть экрана (пиксели холста): в ней видна стрелка над целью задания,
  // а у её края встаёт кружок подсказки. Пересчитывается после поворота экрана и смены карточки задания.
  safeArea() {
    if (this._safe) return this._safe;
    const R = this.root.getBoundingClientRect();
    const box = (sel) => { const e = $(sel, this.root); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
    const hud = box('.hud-top'), qc = box('#quest-cards'), nav = box('#btn-bag'), fab = box('#btn-center');
    const t = Math.max(hud ? hud.bottom : 0, qc ? qc.bottom : 0) - R.top + 4;
    const b = Math.min(nav ? nav.top : R.bottom, fab ? fab.top : R.bottom) - R.top - 4;
    this._safe = { l: 6, t, r: R.width - 6, b: Math.max(t + 40, b) };
    return this._safe;
  }

  ic(name, cls = 'ic') { return `<img class="${cls}" src="${this.icons[name] || ''}" alt="">`; }

  set(id, val) { if (this.last[id] !== val) { this.last[id] = val; const e = document.getElementById(id); if (e) e.textContent = val; } }

  update(f) {
    const st = f.st;
    this.set('hud-level', st.level);
    this.set('hud-coins', fmtNum(st.coins));
    this.set('hud-gems', fmtNum(st.gems));
    this.set('hud-energy', `${st.energy}/${f.maxEnergy}`);
    this.set('hud-can', `${st.can}/${f.canMax}`);
    const pct = Math.min(100, (st.xp / xpToNext(st.level)) * 100).toFixed(1) + '%';
    if (this.last.xp !== pct) { this.last.xp = pct; $('#hud-xp').style.width = pct; }
    this.questCards(f);
    this.tick(f);
    const kind = this.panelEl.dataset.kind;
    if (kind && kind !== 'settings' && this.panelOpen) this.refreshPanel();
  }

  tick(f) {
    const full = f.st.energy >= f.maxEnergy;
    this.set('hud-energy-t', full ? '' : fmtClock(f.energyLeftSec()));
    if (this.popupEl.classList.contains('show') && this._popupTick) this._popupTick();
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
    this._hintEl = null;
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
    for (const r of R.lineRows(f.st)) {
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
  openPanel(kind, title, build) {
    if (this.farm && this.farm.mover && this.farm.mover.active) this.farm.mover.exit();
    const p = this.panelEl;
    p.dataset.kind = kind;
    this._build = build;
    this._title = title;
    this.refreshPanel();
    if (!this.panelOpen) this.sfx('open');
    p.classList.add('show');
    this.closePopup();
    if (this.farm && this.farm.audio) this.farm.audio.setTheme('menu');
  }

  get panelOpen() { return this.panelEl.classList.contains('show'); }

  sfx(name) { if (this.farm) this.farm.sfx(name); }

  refreshPanel() {
    const p = this.panelEl;
    const scroll = p.querySelector('.pn-body') ? p.querySelector('.pn-body').scrollTop : 0;
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
  }

  closePanel() {
    if (this.panelOpen) this.sfx('close');
    this.panelEl.classList.remove('show'); this.panelEl.dataset.kind = '';
    if (this.farm && this.farm.audio) this.farm.audio.setTheme('farm');
  }

  // ---------- Меню «Ещё» ----------
  // Сюда добавляются новые разделы: { label, icon, open } — готовый, { soon: true } — заготовка.
  moreItems(f) {
    return [
      { label: 'Переставить', icon: 'move', open: () => f.mover.enter() },
      { label: 'Дом', icon: 'house', open: () => this.housePanel(f) },
      { label: 'Настройки', icon: 'gear', open: () => this.settingsPanel(f) },
      { label: 'Животные', icon: 'paw', soon: true },
      { label: 'Мастерская', icon: 'build', soon: true },
      { label: 'Декор', icon: 'decor', soon: true },
      { label: 'Достижения', icon: 'trophy', soon: true },
    ];
  }

  toggleMore(show) {
    const m = $('#more-menu');
    show = show == null ? m.hidden : show;
    if (!show) { if (!m.hidden) { m.hidden = true; $('#btn-more').classList.remove('on'); } return; }
    this.closePopup();
    m.innerHTML = '';
    for (const it of this.moreItems(this.farm)) {
      const b = h('button', 'more-it' + (it.soon ? ' soon' : ''), `${this.ic(it.icon, 'ic mid')}<span>${it.label}</span>${it.soon ? '<i>скоро</i>' : ''}`);
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
    $('#mb-place').hidden = !st.selected;
    $('#mb-store').hidden = !st.canStore;
  }

  moveBarShake() {
    const bar = $('#move-bar');
    bar.classList.remove('shake'); void bar.offsetWidth; bar.classList.add('shake');
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
      if (f.devOn) this.devQuests(f, body);
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
    });
  }

  // Проверка заданий без ожидания настоящих дат (только с ?debug в адресе)
  devQuests(f, body) {
    const d = f.dev, now = f.quests.ctx().now;
    body.appendChild(h('div', 'pn-sub', 'Проверка заданий'));
    body.appendChild(h('div', 'pn-text', `Время заданий: ${new Date(now + QUEST_TZ * 3600e3).toISOString().slice(0, 16).replace('T', ' ')} МСК` +
      `${d.shift ? ` (сдвиг ${Math.round(d.shift / 3600e3)} ч)` : ''} · событие: ${d.event ? EVENT_NAME(d.event) : 'по датам'}`));
    const row = h('div', 'gfx-row');
    const btn = (label, fn) => { const b = h('button', 'btn-s', label); b.onclick = () => { fn(); this.refreshPanel(); }; row.appendChild(b); };
    btn('+1 день', () => f.setDev({ shift: (d.shift || 0) + 86400e3 }));
    btn('+7 дней', () => f.setDev({ shift: (d.shift || 0) + 7 * 86400e3 }));
    btn('Сейчас', () => f.setDev({ shift: 0 }));
    btn('Событие', () => { const i = EVENTS.findIndex((e) => e.id === d.event); f.setDev({ event: i + 1 < EVENTS.length ? EVENTS[i + 1].id : null }); });
    body.appendChild(row);
  }

  housePanel(f) {
    this.openPanel('house', 'Дом фермера', (body) => {
      const lvl = f.st.house, cur = HOUSE[lvl], next = HOUSE[lvl + 1];
      body.appendChild(h('div', 'pn-hero', `${this.ic('house', 'ic big')}<div><b>${lvl} уровень</b><span>Главное здание: от него зависят энергия, лейка и размер фермы.</span></div>`));
      const row = (label, a, b) => `<div class="stat"><span>${label}</span><b>${a}${b != null ? ` <i>→ ${b}</i>` : ''}</b></div>`;
      body.appendChild(h('div', 'stats',
        row('Энергия', cur.energy, next && next.energy) +
        row('Лейка, поливов', cur.can, next && next.can) +
        row('Участков земли', cur.chunks, next && next.chunks)));
      if (next) {
        body.appendChild(h('div', 'pn-sub', 'Улучшение'));
        body.appendChild(h('div', 'pp-cost', this.costHtml(next.cost, f)));
        const need = houseNeedChunks(lvl), have = f.world.unlockedCount();
        if (have < need) body.appendChild(h('div', 'pn-text', `Сначала откройте новый участок земли (участков: ${have} из ${need}).`));
        const b = h('button', 'btn-main', `Улучшить до ${lvl + 1} уровня`);
        b.disabled = !f.canPay(next.cost) || have < need;
        b.onclick = () => { if (f.upgradeHouse()) this.refreshPanel(); };
        body.appendChild(b);
      } else body.appendChild(h('div', 'pn-text', 'Дом улучшен до максимума!'));
    });
  }

  // ---------- Рынок: «Купить» и «Продать» ----------
  marketPanel(f) {
    const M = this.mk || (this.mk = { mode: 'sell', tab: 'seeds', sel: null });
    this.openPanel('market', 'Рынок', (body, card) => {
      const seg = h('div', 'mk-seg');
      for (const [k, name] of [['buy', 'Купить'], ['sell', 'Продать']]) {
        const b = h('button', M.mode === k ? 'on' : '', name);
        b.onclick = () => { if (M.mode !== k) { M.mode = k; M.sel = null; this.sfx('tap'); this.refreshPanel(); } };
        seg.appendChild(b);
      }
      body.appendChild(seg);
      if (M.mode === 'sell') this.marketSell(f, body, card, M);
      else this.marketBuy(f, body, card, M);
    });
  }

  marketSell(f, body, card, M) {
    const st = f.st;
    const list = Inv.listItems(st, 'all', 'auto').filter((it) => it.sell);
    if (!list.length) { body.appendChild(h('div', 'pn-empty', 'Пока нечего продать. Соберите урожай с грядок или поймайте рыбу.')); return; }
    const g = h('div', 'mk-grid');
    for (const it of list) {
      const c = h('button', 'mk-cell' + (M.sel === it.key ? ' sel' : ''),
        `<i>${this.ic(it.icon, 'ic')}${it.badge ? this.ic(it.badge, 'inv-badge') : ''}<b>${fmtNum(Inv.count(st, it.key))}</b></i><span>${it.sell} ${this.ic('coin', 'ic-s')}</span>`);
      c.onclick = () => { M.sel = M.sel === it.key ? null : it.key; this.sfx('tap'); this.refreshPanel(); };
      g.appendChild(c);
    }
    body.appendChild(g);
    const it = M.sel && ITEMS[M.sel], n = it ? Inv.count(st, it.key) : 0;
    if (!it || !n || !it.sell) { M.sel = null; return; }
    const box = this.mkCard(it, `${n} шт. · ${it.sell} ${this.ic('coin')} за шт.`, M);
    box.appendChild(this.sellRow(f, it, n));
    card.appendChild(box);
  }

  marketBuy(f, body, card, M) {
    const st = f.st;
    const tabs = h('div', 'inv-tabs c2');
    for (const t of SHOP_TABS) {
      const b = h('button', 'inv-tab' + (M.tab === t.key ? ' on' : ''), `${this.ic(t.icon)}<span>${t.name}</span>`);
      b.onclick = () => { if (M.tab !== t.key) { M.tab = t.key; M.sel = null; this.sfx('tap'); this.refreshPanel(); } };
      tabs.appendChild(b);
    }
    body.appendChild(tabs);
    const offers = SHOP.filter((o) => o.tab === M.tab);
    if (!offers.length) { body.appendChild(h('div', 'pn-empty', 'Скоро здесь появятся товары.')); return; }
    const g = h('div', 'mk-grid');
    for (const o of offers) {
      const it = ITEMS[o.item], locked = o.level > st.level, cur = o.cur === 'gems' ? 'gem' : 'coin';
      const c = h('button', 'mk-cell' + (locked ? ' locked' : '') + (M.sel === o.item ? ' sel' : ''),
        `<i>${this.ic(it.icon, 'ic')}${it.badge ? this.ic(it.badge, 'inv-badge') : ''}${locked ? this.ic('lock', 'mk-lock') : ''}${o.qty > 1 ? `<b>×${o.qty}</b>` : ''}</i>` +
        `<span>${locked ? `с ${o.level} ур.` : `${o.price} ${this.ic(cur, 'ic-s')}`}</span>`);
      c.onclick = () => { M.sel = M.sel === o.item ? null : o.item; this.sfx('tap'); this.refreshPanel(); };
      g.appendChild(c);
    }
    body.appendChild(g);
    const o = M.sel && offers.find((x) => x.item === M.sel);
    if (!o) { M.sel = null; return; }
    const it = ITEMS[o.item], have = Inv.count(st, it.key), pack = o.qty || 1;
    const curKey = o.cur || 'coins', cur = curKey === 'gems' ? 'gem' : 'coin';
    const per = pack > 1 ? `${o.price} ${this.ic(cur)} за ${pack} шт.` : `${o.price} ${this.ic(cur)} за шт.`;
    const box = this.mkCard(it, `${per}${it.food ? ` · +${it.food} ${this.ic('energy')}` : ''}${have ? ` · в рюкзаке ${have}` : ''}`, M);
    if (o.level > st.level) box.appendChild(h('div', 'ii-note', `Откроется с ${o.level} уровня.`));
    else {
      const max = Math.min(99, Math.floor(st[curKey] / o.price));
      const Q = this.buyQty || (this.buyQty = {});
      const q = Q[o.item] = Math.max(1, Math.min(Math.max(1, max), Q[o.item] || 1));
      const row = h('div', 'ii-sell');
      if (max > 1) row.appendChild(this.stepper(q, max, (v) => { Q[o.item] = v; this.refreshPanel(); }));
      const acts = h('div', 'ii-a');
      const b = h('button', 'btn-s gold', `Купить ${q * pack} шт. · ${q * o.price} ${this.ic(cur)}`);
      b.disabled = st[curKey] < q * o.price; b.onclick = () => f.buy(o, q);
      acts.appendChild(b); row.appendChild(acts);
      box.appendChild(row);
    }
    card.appendChild(box);
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

  // ---------- Рюкзак: клетки с разделами ----------
  // Выбранный раздел, порядок и предмет помним между открытиями.
  bagPanel(f) {
    const S = this.inv || (this.inv = { tab: 'all', sort: 'auto', sel: null });
    this.openPanel('bag', 'Рюкзак', (body, card) => {
      const st = f.st;
      const full = st.energy >= f.maxEnergy;
      body.appendChild(h('div', 'inv-en', `${this.ic('energy')}<b>${st.energy}/${f.maxEnergy}</b><span>${full ? 'энергия полная' : '+1 через ' + fmtClock(f.energyLeftSec())}</span>`));

      const tabs = h('div', 'inv-tabs');
      for (const t of INV_TABS) {
        const b = h('button', 'inv-tab' + (S.tab === t.key ? ' on' : ''), `${this.ic(t.icon)}<span>${t.name}</span>`);
        b.onclick = () => {
          if (S.tab === t.key) return;
          S.tab = t.key;
          if (S.sel && t.key !== 'all' && !ITEMS[S.sel].tabs.includes(t.key)) S.sel = null; // карточка чужого раздела
          this.sfx('tap'); this.refreshPanel();
        };
        tabs.appendChild(b);
      }
      body.appendChild(tabs);

      const sorts = h('div', 'inv-sort', '<span>Порядок:</span>');
      for (const [k, name] of [['auto', 'Обычный'], ['price', 'По цене'], ['name', 'А–Я']]) {
        const b = h('button', 'inv-chip' + (S.sort === k ? ' on' : ''), name);
        b.onclick = () => { if (S.sort !== k) { S.sort = k; this.refreshPanel(); } };
        sorts.appendChild(b);
      }
      body.appendChild(sorts);

      const list = Inv.listItems(st, S.tab, S.sort);
      if (!list.length) {
        body.appendChild(h('div', 'pn-empty', S.tab === 'build' ? 'Постройки появятся в магазине.' : 'Здесь пока пусто.'));
      } else {
        const g = h('div', 'inv-grid');
        for (const it of list) {
          const n = it.tool ? (it.can ? `${st.can}/${f.canMax}` : '') : fmtNum(Inv.count(st, it.key));
          const c = h('button', 'inv-cell' + (S.sel === it.key ? ' sel' : ''),
            `${this.ic(it.icon, 'ic')}${it.badge ? this.ic(it.badge, 'inv-badge') : ''}${n ? `<b>${n}</b>` : ''}`);
          c.title = it.name;
          c.onclick = () => { S.sel = S.sel === it.key ? null : it.key; this.sfx('tap'); this.refreshPanel(); };
          g.appendChild(c);
        }
        body.appendChild(g);
      }

      // карточка выбранного предмета — внизу окна, не прокручивается
      const it = S.sel && ITEMS[S.sel];
      if (!it || (!it.tool && !Inv.count(st, it.key))) { S.sel = null; return; }
      card.appendChild(this.itemInfo(f, it));
    });
  }

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
    if (acts.children.length) box.appendChild(acts);
    if (it.sell && n > 0) box.appendChild(this.sellRow(f, it, n));
    return box;
  }
}

function fmtNum(n) { return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n); }
// сколько осталось: «5 ч 12 мин», «2 д 3 ч», «7 мин»
function fmtLeft(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000)), d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d} д ${hh} ч` : hh ? `${hh} ч ${mm} мин` : `${mm} мин`;
}
// день по московскому времени (как сброс заданий): «7 ноября»
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function fmtDay(t) { const d = new Date(t + QUEST_TZ * 3600e3); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
function fmtClock(s) { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }
