// Интерфейс поверх канваса (DOM): верхняя панель, ресурсы, кнопки,
// всплывающие меню у объектов, окна, уведомления. DOM обновляется только
// при изменениях, а не каждый кадр.

import { CROPS, GOODS, HOUSE, xpToNext, houseNeedChunks } from '../game/data.js';
import { fmtTime } from '../game/Farm.js';
import { QUEST_END } from '../game/quests.js';
import { MUSIC } from '../engine/Audio.js';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const RES_NAMES = { wood: 'Дерево', stone: 'Камень', ore: 'Руда', coins: 'Монеты', gems: 'Кристаллы' };

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
  }

  bind(farm, icons) {
    this.farm = farm;
    this.icons = icons;
    this.refreshIcons();
    farm.onIcons = () => { clearTimeout(this._icT); this._icT = setTimeout(() => this.refreshIcons(), 30); };
    $('#btn-bag').onclick = () => this.bagPanel(farm);
    $('#btn-market').onclick = () => this.marketPanel(farm);
    $('#btn-house').onclick = () => this.housePanel(farm);
    $('#btn-center').onclick = () => { farm.player.worldPos(this._p = this._p || {}); farm.cam.centerOn(this._p.x, this._p.y - 20); };
    $('#energy-pill').onclick = () => this.bagPanel(farm);
    $('#quest-card').onclick = () => this.questPanel(farm);
    $('#btn-settings').onclick = () => this.settingsPanel(farm);
    $('#btn-more').onclick = () => this.toggleMore();
    $('#mb-done').onclick = () => farm.mover.exit();
    $('#mb-cancel').onclick = () => farm.mover.cancel();
    $('#mb-place').onclick = () => farm.mover.place();
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && farm.mover.active) farm.mover.exit(); });
  }

  refreshIcons() {
    for (const img of this.root.querySelectorAll('img[data-icon]')) img.src = this.icons[img.dataset.icon];
    const av = this.root.querySelector('.avatar');
    if (av && this.icons.avatar && !av.querySelector('img')) av.innerHTML = `<img src="${this.icons.avatar}" alt="">`;
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
    this.questCard(f);
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
    while (this.toastEl.children.length > 3) this.toastEl.firstChild.remove();
    setTimeout(() => t.classList.add('hide'), 2200);
    setTimeout(() => t.remove(), 2600);
  }

  levelUp(level, opened, coins) {
    const t = h('div', 'levelup', `<div class="lv-star">${this.ic('star', 'ic big')}<b>${level}</b></div><div class="lv-text"><b>Новый уровень!</b><span>+1 ${this.ic('gem')} +${coins} ${this.ic('coin')}${opened.length ? '<br>Открыто: ' + opened.join(', ') : ''}</span></div>`);
    this.root.appendChild(t);
    setTimeout(() => t.classList.add('hide'), 2800);
    setTimeout(() => t.remove(), 3300);
  }

  costHtml(cost, f) {
    return Object.entries(cost).map(([k, v]) => {
      const have = k === 'coins' ? f.st.coins : k === 'gems' ? f.st.gems : f.st.inv[k] || 0;
      const icon = k === 'coins' ? 'coin' : k === 'gems' ? 'gem' : k;
      return `<span class="cost ${have < v ? 'lack' : ''}" title="${RES_NAMES[k] || k}">${this.ic(icon)}${have < v ? `${fmtNum(have)}/` : ''}${fmtNum(v)}</span>`;
    }).join('');
  }

  // ---------- Задания ----------
  questCard(f) {
    const Q = f.quests, q = Q.current, el = $('#quest-card');
    const key = q ? `${Q.st.i}:${Q.progress()}` : 'end';
    if (this.last.quest === key) return;
    this.last.quest = key;
    el.hidden = !q;
    if (!q) return;
    const done = Q.done, pct = (Q.progress() / q.goal.n) * 100;
    el.classList.toggle('done', done);
    el.innerHTML = `${this.ic(q.who === 'note' ? 'note' : 'star', 'ic')}<div class="qc-t"><b>${done ? 'Забрать награду!' : q.task}</b>` +
      `<div class="qc-bar"><i style="width:${pct}%"></i></div></div><span class="qc-n">${Q.progress()}/${q.goal.n}</span>`;
  }

  questDone(q) {
    this.toast(`Задание выполнено: ${q.title}`, 'good');
    this.last.quest = null;
  }

  rewardHtml(r) {
    return [r.coins && `${r.coins} ${this.ic('coin')}`, r.gems && `${r.gems} ${this.ic('gem')}`].filter(Boolean).join(' ');
  }

  questPanel(f) {
    this.openPanel('quest', 'Задания', (body) => {
      const Q = f.quests, q = Q.current || QUEST_END;
      if (Q.current) Q.st.seen = true;
      const who = q.who === 'note' ? 'Записка бабушки Марфы' : 'Призрачок';
      const face = q.who === 'note' ? this.ic('note', 'ic big') : `<img class="qp-face" src="${this.icons.avatar || this.icons.star}" alt="">`;
      body.appendChild(h('div', 'qp-story' + (q.who === 'note' ? ' note' : ''), `${face}<div class="qp-say"><b>${who}</b><p>${q.text}</p></div>`));
      if (!Q.current) return;
      const n = Q.progress(), done = Q.done;
      body.appendChild(h('div', 'pn-sub', q.title));
      body.appendChild(h('div', 'qp-task', `<span>${q.task}</span><b>${n}/${q.goal.n}</b><div class="qc-bar"><i style="width:${(n / q.goal.n) * 100}%"></i></div>`));
      body.appendChild(h('div', 'qp-reward', `Награда: ${this.rewardHtml(q.reward)}`));
      const b = h('button', 'btn-main', done ? 'Забрать награду' : 'Понятно');
      b.onclick = () => {
        if (!done) return this.closePanel();
        const r = q.reward;
        if (Q.claim()) { this.toast(`+${this.rewardHtml(r)}`, 'good'); this.refreshPanel(); }
      };
      body.appendChild(b);
    });
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
    this._build(body);
    card.append(head, body);
    p.appendChild(card);
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
      { label: 'Задания', icon: 'note', open: () => this.questPanel(f) },
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
    bar.hidden = !st;
    if (!st) return;
    const t = $('#mb-text');
    t.textContent = st.text;
    t.classList.toggle('bad', st.bad);
    $('#mb-place').disabled = !st.canPlace;
    $('#mb-cancel').hidden = !st.selected;
    $('#mb-place').hidden = !st.selected;
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

  marketPanel(f) {
    this.openPanel('market', 'Рынок', (body) => {
      const list = Object.values(GOODS).filter((c) => (f.st.crops[c.key] || 0) > 0);
      if (!list.length) { body.appendChild(h('div', 'pn-empty', 'Пока нечего продать. Соберите урожай с грядок.')); return; }
      for (const c of list) {
        const n = f.st.crops[c.key];
        const r = h('div', 'item', `${this.ic(c.key, 'ic mid')}<div class="it-t"><b>${c.name}</b><span>${n} шт. · ${c.sell} ${this.ic('coin')} за шт.</span></div>`);
        const b1 = h('button', 'btn-s', 'Продать 1'); b1.onclick = () => f.sell(c.key, 1);
        const b2 = h('button', 'btn-s gold', `Все: ${n * c.sell} ${this.ic('coin')}`); b2.onclick = () => f.sell(c.key, n);
        const acts = h('div', 'it-a'); acts.append(b1, b2); r.appendChild(acts);
        body.appendChild(r);
      }
    });
  }

  bagPanel(f) {
    this.openPanel('bag', 'Рюкзак', (body) => {
      const st = f.st;
      body.appendChild(h('div', 'pn-sub', 'Ресурсы'));
      const res = h('div', 'grid');
      for (const k of ['wood', 'stone', 'ore']) res.appendChild(h('div', 'cell', `${this.ic(k, 'ic mid')}<b>${st.inv[k] || 0}</b><span>${RES_NAMES[k]}</span>`));
      res.appendChild(h('div', 'cell', `${this.ic('water', 'ic mid')}<b>${st.can}/${f.canMax}</b><span>Лейка</span>`));
      body.appendChild(res);

      const full = st.energy >= f.maxEnergy;
      body.appendChild(h('div', 'pn-sub', `Еда · энергия ${st.energy}/${f.maxEnergy}${full ? '' : ', +1 через ' + fmtClock(f.energyLeftSec())}`));
      const food = Object.values(GOODS).filter((c) => c.food && (st.crops[c.key] || 0) > 0);
      if (!food.length) body.appendChild(h('div', 'pn-empty', 'Урожай можно съесть, чтобы восстановить энергию.'));
      for (const c of food) {
        const r = h('div', 'item', `${this.ic(c.key, 'ic mid')}<div class="it-t"><b>${c.name} × ${st.crops[c.key]}</b><span>+${c.food} ${this.ic('energy')}</span></div>`);
        const b = h('button', 'btn-s', 'Съесть'); b.disabled = full; b.onclick = () => f.eat(c.key);
        const a = h('div', 'it-a'); a.appendChild(b); r.appendChild(a);
        body.appendChild(r);
      }
      const seeds = Object.entries(st.seeds).filter(([, n]) => n > 0);
      if (seeds.length) {
        body.appendChild(h('div', 'pn-sub', 'Семена'));
        const g = h('div', 'grid');
        for (const [k, n] of seeds) g.appendChild(h('div', 'cell', `${this.ic(k, 'ic mid')}<b>${n}</b><span>${CROPS[k].name}</span>`));
        body.appendChild(g);
      }
    });
  }
}

function fmtNum(n) { return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n); }
function fmtClock(s) { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }
export { fmtTime };
