// Режим перестановки: свои объекты (дом, починенный колодец, пустые грядки, тропинки, пруды,
// посаженные игроком деревья и кусты, свои постройки — поливалки, потом декор) можно переносить по открытой земле.
// Деревья, камни и прочее «чужое» не двигается.
// Дорожки, пруды, свои растения и постройки можно убрать в рюкзак («В рюкзак»), а нажатием на пустую траву —
// поставить обратно из рюкзака.
// Пруд или постройка из рюкзака (кнопка «Поставить» в рюкзаке и на рынке, takeFromBag) выбраны, как будто их
// переносят: нажатие на клетку показывает, как встанет (у поливалки — что она польёт), второе нажатие или
// «Поставить» — ставит.
// Украшения прудов (камыш, рогоз, камни) — так же, но только на воду пруда; нажатие на украшение в пруду
// выбирает его (перенести на другую клетку воды или убрать в рюкзак), на воду без украшения — сам пруд.
// «Кладём дорожку» (pave, кнопка «Поставить» у дорожки в рюкзаке и на рынке): каждое нажатие на траву
// кладёт клетку выбранной дорожки, нажатие на дорожку другого вида меняет её (старая — в рюкзак).
//
// Как работает: нажали на объект — он выбран; нажали на клетку — там появляется
// предпросмотр (зелёный — можно, красный — нельзя и почему); «Поставить» или
// повторное нажатие на ту же клетку переносит объект.

import { OBJECTS, FLORA, ITEMS, PATHS, pondDecorId } from './data.js';
import * as Flora from './flora.js';
import * as Inv from './inventory.js';
import * as Paths from './paths.js';
import * as Placed from './placed.js';
import * as Ponds from './ponds.js';
import { N, T, objCells } from './World.js';
import { toWorld } from '../engine/Iso.js';

const tmp = { x: 0, y: 0 };

// Что можно двигать из объектов карты (остальное — природа)
const MOVABLE = { house: 'Дом', well: 'Колодец' };

export class Mover {
  constructor(farm) {
    this.f = farm;
    this.active = false;
    this.sel = null;   // { kind: 'obj'|'bed'|'path'|'bag', o?, b?, id? (предмет из рюкзака), name, w, h, gx, gy, cells? }
    this.to = null;    // { gx, gy, ok, why }
    this.brush = null; // id дорожки в режиме «Кладём дорожку»
  }

  enter() {
    const f = this.f;
    if (this.active) return;
    this.active = true;
    this.sel = null; this.to = null; this.brush = null;
    f.player.queue.length = 0; // очередь дел отменяется: объекты могут переехать
    f.ui.closePopup(); f.ui.closePanel();
    f.stopPlanting(); // плашка посадки и плашка перестановки занимают одно место
    this.hint();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.sel = null; this.to = null; this.brush = null;
    this.f.ui.moveBar(null);
  }

  hint(msg, bad) {
    const s = this.sel, t = this.to;
    let text = msg;
    if (this.brush) {
      const it = ITEMS[this.brush], n = Inv.count(this.f.st, this.brush);
      if (!text) text = `Кладём: ${it.name.toLowerCase()} (есть ${n}). Нажимайте на траву или на другую дорожку`;
      this.f.ui.moveBar({ text, bad: !!bad, canPlace: false, selected: true, canStore: false, brush: true });
      return;
    }
    if (!text) {
      if (!s) text = 'Нажмите на то, что передвинуть или убрать в рюкзак. Пустая трава — поставить из рюкзака';
      else if (!t) text = `${s.name}: нажмите на ${s.decor ? 'воду пруда' : 'клетку'}, куда поставить${s.store ? ', или «В рюкзак»' : ''}`;
      else if (t.ok) text = `${s.name}: сюда можно. Нажмите «Поставить»`;
      else { text = t.why; bad = true; }
    }
    this.f.ui.moveBar({ text, bad: !!bad, canPlace: !!(t && t.ok), selected: !!s, canStore: !!(s && s.store) });
  }

  // причина показывается в панели внизу (красным, панель вздрагивает)
  fail(why) {
    this.f.sfx('error');
    this.hint(why, true);
    this.f.ui.moveBarShake();
  }

  // ---------- что под пальцем ----------
  identify(gx, gy, wx, wy) {
    const f = this.f, w = f.world;
    if (w.inside(gx, gy) && !w.isOpen(gx, gy)) return { why: 'Этот участок ещё не открыт' };
    let o = w.objectAt(gx, gy);
    if (!o) {
      o = f.pick(wx, wy);
      if (o && w.inside(gx, gy) && w.isOpen(gx, gy) && (!w.isOpen(o.gx, o.gy) || w.tile(gx, gy) !== T.GRASS)) o = null;
    }
    if (o) {
      if (!w.isOpen(o.gx, o.gy)) return { why: 'Этот участок ещё не открыт' };
      if (o.placed) {
        if (this.busy({ obj: o })) return { why: 'Призрачок сейчас работает здесь, подождите' };
        const def = OBJECTS[o.type];
        return { sel: { kind: 'obj', o, placed: true, store: true, name: def.name, w: o.w, h: o.h, gx: o.gx, gy: o.gy, cells: objCells(def) } };
      }
      if (Ponds.isPond(o)) {
        // на клетке украшение (камыш, рогоз, камни) — выбирается оно: перенести на воду или в рюкзак
        const di = Ponds.decorIndex(o, gx - o.gx, gy - o.gy);
        if (di >= 0) {
          const id = pondDecorId(o.decor[di][0]);
          return { sel: { kind: 'decor', decor: true, o, dx: gx - o.gx, dy: gy - o.gy, id, store: true, name: ITEMS[id].name, w: 1, h: 1, gx, gy } };
        }
        if (this.busyPond(o)) return { why: 'Призрачок сейчас рыбачит или набирает воду, подождите' };
        const def = OBJECTS[o.type];
        return { sel: { kind: 'obj', o, pond: true, store: true, name: def.name, w: o.w, h: o.h, gx: o.gx, gy: o.gy, cells: objCells(def) } };
      }
      if (o.own) {
        if (this.busy({ obj: o })) return { why: 'Призрачок сейчас работает здесь, подождите' };
        const name = o.type === 'sapling' ? `Росток (${FLORA[o.tree].name.toLowerCase()})` : FLORA[o.type].name;
        return { sel: { kind: 'obj', o, plant: true, store: true, name, w: o.w, h: o.h, gx: o.gx, gy: o.gy } };
      }
      if (!MOVABLE[o.type]) {
        const def = OBJECTS[o.type] || {};
        const how = def.action === 'mine' ? 'его можно только разбить киркой' : def.action === 'mow' ? 'её можно только сорвать' : o.wild ? 'это дикое растение, его можно только срубить' : 'его можно только срубить';
        return { why: `${def.name || 'Этот объект'}: это не ваша постройка, ${how}` };
      }
      if (o.type === 'well' && !f.st.well) return { why: 'Колодец сломан: сначала почините его' };
      if (this.busy({ obj: o })) return { why: 'Призрачок сейчас работает здесь, подождите' };
      return { sel: { kind: 'obj', o, name: MOVABLE[o.type], w: o.w, h: o.h, gx: o.gx, gy: o.gy } };
    }
    if (!w.inside(gx, gy)) return { why: 'Это за краем фермы' };
    if (!w.isOpen(gx, gy)) return { why: 'Этот участок ещё не открыт' };
    const t = w.tile(gx, gy);
    if (t === T.PATH) {
      if (this.busy({ x: gx, y: gy })) return { why: 'Призрачок сейчас работает здесь, подождите' };
      const path = Paths.kindAt(w, w.idx(gx, gy));
      return { sel: { kind: 'path', path, store: true, name: PATHS[path].name, w: 1, h: 1, gx, gy } };
    }
    if (t === T.SOIL) {
      const b = f.bedAt(w.idx(gx, gy));
      if (b.crop) {
        const ready = f.cropInfo(b).ready;
        return { why: ready ? 'На грядке созрел урожай: сначала соберите его' : 'На грядке растёт урожай: двигать можно только пустую грядку' };
      }
      if (this.busy({ x: gx, y: gy })) return { why: 'Призрачок сейчас работает с этой грядкой, подождите' };
      return { sel: { kind: 'bed', b, name: 'Грядка', w: 1, h: 1, gx, gy } };
    }
    return { empty: true, why: 'Здесь пусто. Нажмите на дом, колодец, грядку, дорожку, пруд, поливалку или своё растение' };
  }

  // Призрачок рыбачит или набирает воду в этом пруду (или идёт туда)?
  busyPond(o) {
    const p = this.f.player, list = p.current ? [p.current, ...p.queue] : p.queue;
    const w = this.f.world;
    return list.some((a) => (a.kind === 'fish' || a.kind === 'fill') && w.pondAt(a.x, a.y) === o);
  }

  // Текущее действие призрачка касается этого места?
  busy(q) {
    const a = this.f.player.current;
    if (!a || a.kind === 'walk') return false;
    if (q.obj) return a.obj === q.obj;
    return !a.obj && a.x === q.x && a.y === q.y;
  }

  // ---------- можно ли поставить ----------
  check(gx, gy) {
    const f = this.f, w = f.world, s = this.sel, p = f.player;
    if (s.decor) return this.checkDecor(gx, gy);
    if (gx === s.gx && gy === s.gy) return { ok: false, why: 'Объект уже стоит здесь' };
    const solid = s.kind === 'obj' || s.kind === 'bag'; // объект на клетках (не дорожка и не грядка)
    const own = this.cellSet(s.gx, s.gy);
    const a = p.current && p.current.kind !== 'walk' ? p.current : null;
    const next = p.path && p.path[0];
    for (const [dx, dy] of objCells(s)) {
      const x = gx + dx, y = gy + dy;
      if (!w.inside(x, y)) return { ok: false, why: 'Сюда нельзя: это край фермы' };
      if (!w.isOpen(x, y)) return { ok: false, why: 'Сюда нельзя: участок ещё не открыт' };
      const i = w.idx(x, y), t = w.tiles[i];
      if (s.kind === 'obj' && own.has(i)) continue;
      if (t === T.WATER) return { ok: false, why: 'Сюда нельзя: здесь вода' };
      if (t === T.PATH) return { ok: false, why: 'Сюда нельзя: здесь дорожка' };
      if (t === T.SOIL) return { ok: false, why: 'Сюда нельзя: здесь уже грядка' };
      const o = w.occ[i] >= 0 ? w.objects[w.occ[i]] : null;
      if (o && o !== s.o) return { ok: false, why: `Сюда нельзя: мешает ${((OBJECTS[o.type] || {}).name || 'объект').toLowerCase()}` };
      if (solid && ((x === p.tx && y === p.ty) || (next && x === next[0] && y === next[1]))) return { ok: false, why: 'Сюда нельзя: здесь стоит призрачок' };
      if (a && !a.obj && a.x === x && a.y === y) return { ok: false, why: 'Сюда нельзя: призрачок здесь работает' };
    }
    if (solid && this.cutsOff(gx, gy)) return { ok: false, why: 'Сюда нельзя: так закроется проход' };
    // правила самой постройки (например, не хватает материалов) — placed.js
    if (s.kind === 'bag' && Placed.objOf(s.id)) { const why = Placed.placeWhy(f.st, w, s.id, gx, gy, { now: Date.now() }); if (why) return { ok: false, why }; }
    return { ok: true };
  }

  // Украшение пруда (из рюкзака или переносим) — только на воду пруда
  checkDecor(gx, gy) {
    const s = this.sel, c = Ponds.canDecor(this.f.world, gx, gy, s.kind === 'decor' ? s : null);
    if (c.ok) return { ok: true };
    const why = { water: 'Сюда нельзя: украшение ставится только на воду пруда', locked: 'Сюда нельзя: участок ещё не открыт',
      busy: 'Сюда нельзя: здесь уже есть украшение', same: 'Украшение уже стоит здесь' };
    return { ok: false, why: why[c.why] };
  }

  // Клетки выбранного объекта, если его левый верхний угол — (gx, gy): номера клеток (за краем карты — без них)
  cellSet(gx, gy) {
    const w = this.f.world, out = new Set();
    for (const [dx, dy] of objCells(this.sel)) if (w.inside(gx + dx, gy + dy)) out.add(w.idx(gx + dx, gy + dy));
    return out;
  }

  // Не отрежет ли постройка часть открытой земли от призрачка
  cutsOff(gx, gy) {
    const f = this.f, w = f.world, s = this.sel, p = f.player;
    const nw = this.cellSet(gx, gy), old = this.cellSet(s.gx, s.gy);
    const inNew = (x, y) => nw.has(w.idx(x, y));
    const inOld = (x, y) => old.has(w.idx(x, y));
    const count = (walk) => {
      const seen = new Uint8Array(N * N), st = [[p.tx, p.ty]];
      seen[w.idx(p.tx, p.ty)] = 1;
      let n = 0;
      while (st.length) {
        const [x, y] = st.pop(); n++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!w.inside(nx, ny) || seen[w.idx(nx, ny)] || !walk(nx, ny)) continue;
          seen[w.idx(nx, ny)] = 1; st.push([nx, ny]);
        }
      }
      return n;
    };
    const before = count((x, y) => w.walkable(x, y));
    const after = count((x, y) => {
      if (inNew(x, y)) return false;
      if (inOld(x, y)) return w.isOpen(x, y) && w.tile(x, y) !== T.WATER;
      return w.walkable(x, y);
    });
    // старое место освобождается (+площадь), новое занимается (−площадь);
    // ставим из рюкзака (старого места нет) — земли честно становится меньше на площадь
    return after < before - (s.gx < 0 ? nw.size : 0);
  }

  // ---------- нажатия ----------
  tap(gx, gy, wx, wy, sx, sy) {
    if (this.brush) return this.putFromBag(this.brush, gx, gy);
    const s = this.sel;
    if (!s) {
      const r = this.identify(gx, gy, wx, wy);
      if (r.empty && this.stock().length) return this.fromBag(gx, gy, sx, sy);
      if (r.why) return this.fail(r.why);
      this.sel = r.sel; this.to = null;
      this.f.sfx('pop');
      return this.hint();
    }
    // большой объект: нажатая клетка — его середина
    const tx = gx - ((s.w - 1) >> 1), ty = gy - ((s.h - 1) >> 1);
    // нажали на сам выбранный объект без цели — снять выбор (большой пруд по краю — сдвиг на клетку)
    const own = s.kind !== 'bag' && this.f.world.inside(gx, gy) && this.cellSet(s.gx, s.gy).has(this.f.world.idx(gx, gy));
    if (own && !this.to && (!s.pond || (tx === s.gx && ty === s.gy))) { this.cancel(); return; }
    if (this.to && this.to.gx === tx && this.to.gy === ty && this.to.ok) return this.place();
    const c = this.check(tx, ty);
    this.to = { gx: tx, gy: ty, ok: c.ok, why: c.why };
    this.hint();
    if (!c.ok) { this.f.sfx('error'); this.f.ui.moveBarShake(); }
  }

  cancel() {
    this.sel = null; this.to = null; this.brush = null;
    this.hint();
  }

  // «Кладём дорожку»: включить режим перестановки и класть клетки дорожки id нажатиями на траву
  pave(id) {
    if (!Paths.isPathItem(id) || !Inv.count(this.f.st, id)) return false;
    this.enter();
    this.sel = null; this.to = null; this.brush = id;
    this.hint();
    return true;
  }

  place() {
    const f = this.f, w = f.world, s = this.sel, t = this.to;
    if (!s || !t) return false;
    // состояние могло измениться (призрачок дошёл, урожай посадили) — проверяем заново
    const c = this.check(t.gx, t.gy);
    if (!c.ok) { t.ok = false; t.why = c.why; this.fail(c.why); return false; }
    if (s.kind === 'bed' && s.b.crop) { this.fail('На грядке уже растёт урожай'); this.cancel(); return false; }
    if (s.kind === 'bag') return this.placeFromBag(t.gx, t.gy);
    if (s.kind === 'decor') {
      if (!Ponds.moveDecor(f.st, w, s.o, s.dx, s.dy, t.gx, t.gy)) { this.cancel(); return false; }
      f.decorFx(t.gx, t.gy);
    } else if (s.kind === 'obj' && s.pond) {
      if (this.busyPond(s.o)) { this.fail('Призрачок сейчас рыбачит или набирает воду, подождите'); return false; }
      if (!Ponds.movePond(f.st, w, s.o, t.gx, t.gy)) { this.cancel(); return false; }
      f.pondFx(s.o);
    } else if (s.kind === 'obj') {
      if (s.plant) Flora.moveOwn(f.st, s.o, t.gx, t.gy);
      if (s.placed) Placed.moveObj(f.st, s.o, t.gx, t.gy);
      w.moveObject(s.o, t.gx, t.gy);
      if (!s.plant && !s.placed) { f.st.pos = f.st.pos || {}; f.st.pos[s.o.type] = [t.gx, t.gy]; }
      f.burst(s.o.wx, s.o.wy - 6, '#e8d9a8', 14);
    } else if (s.kind === 'path') {
      // клетка дорожки переезжает (вид тот же), на старом месте — обычная трава
      const k = Paths.movePath(f.st, w, w.idx(s.gx, s.gy), w.idx(t.gx, t.gy));
      if (!k) { this.cancel(); return false; }
      f.groundV++;
      toWorld(t.gx + 0.5, t.gy + 0.5, tmp);
      f.burst(tmp.x, tmp.y, PATHS[k].dust, 8);
    } else {
      const from = s.b, ni = w.idx(t.gx, t.gy);
      w.tiles[from.i] = T.GRASS;
      f.beds.delete(from.i);
      w.tiles[ni] = T.SOIL;
      const b = f.bedAt(ni);
      b.crop = null; b.p = 0; b.w = 0;
      f.st.movedBeds = true;
      f.groundV++;
      f.burst(b.wx, b.wy, '#8a5a30', 8);
    }
    f.sfx('dig');
    this.sel = null; this.to = null;
    this.hint('Готово! Выберите, что ещё передвинуть');
    f.changed();
    return true;
  }

  // ---------- рюкзак ----------
  // «В рюкзак»: выбранная тропинка или своё растение уходит предметом в рюкзак
  store() {
    const f = this.f, w = f.world, s = this.sel;
    if (!s || !s.store) return false;
    let items;
    if (s.kind === 'path') {
      if (w.tile(s.gx, s.gy) !== T.PATH) { this.cancel(); return false; }
      const k = Paths.storePath(f.st, w, w.idx(s.gx, s.gy));
      if (!k) { this.fail('Рюкзак полон'); return false; }
      f.groundV++;
      toWorld(s.gx + 0.5, s.gy + 0.5, tmp);
      items = [{ id: k, n: 1 }];
      f.dropFx({ wx: tmp.x, wy: tmp.y }, items);
      f.burst(tmp.x, tmp.y, PATHS[k].dust, 8);
    } else if (s.kind === 'decor') {
      const id = Ponds.storeDecor(f.st, w, s.o, s.dx, s.dy);
      if (!id) { this.cancel(); return false; }
      toWorld(s.gx + 0.5, s.gy + 0.5, tmp);
      f.dropFx({ wx: tmp.x, wy: tmp.y }, [{ id, n: 1 }]);
      f.decorFx(s.gx, s.gy);
    } else if (s.pond) {
      const o = s.o;
      if (w.objects[o.id] !== o) { this.cancel(); return false; }
      if (this.busyPond(o)) { this.fail('Призрачок сейчас рыбачит или набирает воду, подождите'); return false; }
      const items = Ponds.storePond(f.st, w, o);
      if (!items) { this.fail('Рюкзак полон'); return false; }
      f.pondFx(o);
      f.dropFx(o, items);
    } else if (s.placed) {
      const o = s.o;
      if (w.objects[o.id] !== o) { this.cancel(); return false; }
      if (this.busy({ obj: o })) { this.fail('Призрачок сейчас работает здесь, подождите'); return false; }
      const r = Placed.storeObj(f.st, w, o, { now: Date.now() });
      if (r.why) { this.fail(r.why); return false; }
      f.dropFx(o, [{ id: r.id, n: 1 }]);
      f.burst(o.wx, o.wy - 4, '#e8d9a8', 10);
    } else {
      const o = s.o;
      if (w.objects[o.id] !== o) { this.cancel(); return false; }
      if (this.busy({ obj: o })) { this.fail('Призрачок сейчас работает здесь, подождите'); return false; }
      const r = Flora.storeOwn(f.st, o, Date.now(), Math.random);
      if (!r) { this.fail('Рюкзак полон'); return false; }
      f.dropFx(o, r.items);
      f.burst(o.wx, o.wy - 4, '#8a5a30', 10);
      w.remove(o);
    }
    f.sfx('dig');
    this.sel = null; this.to = null;
    this.hint(`${s.name}: в рюкзаке. Поставить обратно — нажмите на пустую траву`);
    f.changed();
    return true;
  }

  // Что из рюкзака можно поставить в этом режиме: дорожки (и потом другой декор) и свои выкопанные растения
  stock() {
    const st = this.f.st, out = [];
    for (const it of Object.values(ITEMS)) {
      const n = Inv.count(st, it.key);
      if (n && (it.place || it.grown)) out.push({ it, n });
    }
    return out;
  }

  // Нажали на пустую траву: список того, что можно сюда поставить из рюкзака
  fromBag(gx, gy, sx, sy) {
    const f = this.f, list = this.stock();
    this.f.ui.popup(sx, sy, {
      title: 'Поставить из рюкзака', wide: true,
      // дорожку кладём и дальше: следующие нажатия на траву — тоже она
      items: list.map(({ it, n }) => ({ icon: it.icon, label: it.name, sub: `есть: ${n}`, onClick: () => { if (this.putFromBag(it.key, gx, gy) && it.place === 'path' && Inv.count(f.st, it.key)) { this.brush = it.key; this.hint(); } } })),
    });
    f.sfx('pop');
  }

  putFromBag(id, gx, gy) {
    const f = this.f, w = f.world, it = ITEMS[id];
    if (!it || !Inv.count(f.st, id)) { this.brush = null; this.hint(); return false; }
    // пруд, украшение пруда, постройка: сначала предпросмотр на этой клетке (видно, как встанет), потом «Поставить»
    if (it.place === 'pond' || it.place === 'pondDecor' || it.place === 'obj') return this.takeFromBag(id, gx, gy);
    toWorld(gx + 0.5, gy + 0.5, tmp);
    // дорожка на дорожку другого вида: меняем (старая — в рюкзак)
    const was = it.place === 'path' && w.inside(gx, gy) && w.isOpen(gx, gy) ? Paths.kindAt(w, w.idx(gx, gy)) : null;
    if (was === id) return this.fail(`Здесь уже ${it.name.toLowerCase()}`);
    if (!was) {
      // проверка — как при переносе одной клетки из ниоткуда
      const save = this.sel;
      this.sel = { kind: it.place === 'path' ? 'path' : 'obj', w: 1, h: 1, gx: -9, gy: -9 };
      const c = this.check(gx, gy);
      this.sel = save;
      if (!c.ok) return this.fail(c.why);
    }
    if (it.place === 'path') {
      if (!Paths.placePath(f.st, w, id, w.idx(gx, gy))) return this.fail('Не получается');
      f.groundV++;
      if (was) f.dropFx({ wx: tmp.x, wy: tmp.y }, [{ id: was, n: 1 }]);
      f.burst(tmp.x, tmp.y, PATHS[id].dust, 8);
      f.sfx('dig');
      const n = Inv.count(f.st, id);
      if (this.brush && !n) this.brush = null;
      this.hint(this.brush ? null : n ? `${it.name}: поставлено` : `${it.name}: больше нет. Купите ещё на рынке, раздел «Декор»`);
      f.changed();
      return true;
    } else {
      const o = f.plantOwn(it.floraOf, gx, gy, true);
      if (!o) return false;
      f.burst(o.wx, o.wy, '#7ccf4f', 8);
    }
    f.sfx('dig');
    this.hint(`${it.name}: поставлено`);
    f.changed();
    return true;
  }

  // Пруд, украшение пруда или постройка из рюкзака: выбраны, как будто их переносят (kind 'bag'). Нажатие на клетку —
  // предпросмотр (у поливалки видно, что она польёт), второе нажатие или «Поставить» — ставит. gx, gy — сразу показать
  // предпросмотр здесь.
  takeFromBag(id, gx, gy) {
    const f = this.f, it = ITEMS[id], decor = Ponds.isDecorItem(id), type = Placed.objOf(id);
    if (!(Ponds.isPondItem(id) || decor || type) || !Inv.count(f.st, id)) return false;
    if (!this.active) this.enter();
    const def = decor ? {} : OBJECTS[type || id];
    this.brush = null; this.to = null;
    this.sel = { kind: 'bag', id, decor, name: it.name, w: def.w || 1, h: def.h || 1, gx: -9, gy: -9, cells: objCells(def) };
    if (gx != null) {
      const tx = gx - ((this.sel.w - 1) >> 1), ty = gy - ((this.sel.h - 1) >> 1), c = this.check(tx, ty);
      this.to = { gx: tx, gy: ty, ok: c.ok, why: c.why };
    }
    f.sfx('pop');
    this.hint();
    return true;
  }

  // Поставить выбранный из рюкзака пруд, украшение или постройку на (gx, gy) (проверено check).
  // Есть ещё такие — выбор остаётся.
  placeFromBag(gx, gy) {
    const f = this.f, w = f.world, s = this.sel;
    if (Placed.objOf(s.id)) {
      const r = Placed.placeObj(f.st, w, s.id, gx, gy, { now: Date.now() });
      if (r.why) { this.to.ok = false; this.to.why = r.why; this.fail(r.why); return false; }
      const o = r.o;
      f.burst(o.wx, o.wy - 6, '#e8d9a8', 14);
      f.placedFx(o);
    } else {
      const o = s.decor ? Ponds.placeDecor(f.st, w, s.id, gx, gy) : Ponds.placePond(f.st, w, s.id, gx, gy);
      if (!o) { this.to.ok = false; this.to.why = 'Сюда нельзя'; this.fail(this.to.why); return false; }
      if (s.decor) f.decorFx(gx, gy); else f.pondFx(o);
    }
    f.sfx('dig');
    const n = Inv.count(f.st, s.id);
    this.to = null;
    if (n) this.hint(`${s.name}: поставлено. Есть ещё ${n} — нажмите на клетку, куда поставить`);
    else { this.sel = null; this.hint(`${s.name}: поставлено`); }
    f.changed();
    return true;
  }
}
