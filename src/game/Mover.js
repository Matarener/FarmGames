// Режим перестановки: свои объекты (дом, починенный колодец, пустые грядки, тропинки,
// посаженные игроком деревья и кусты, потом декор) можно переносить по открытой земле.
// Деревья, камни, пруд и прочее «чужое» не двигается.
// Тропинки и свои растения можно убрать в рюкзак («В рюкзак»), а нажатием на пустую траву —
// поставить обратно из рюкзака.
//
// Как работает: нажали на объект — он выбран; нажали на клетку — там появляется
// предпросмотр (зелёный — можно, красный — нельзя и почему); «Поставить» или
// повторное нажатие на ту же клетку переносит объект.

import { OBJECTS, FLORA, ITEMS } from './data.js';
import * as Flora from './flora.js';
import * as Inv from './inventory.js';
import { N, T } from './World.js';
import { toWorld } from '../engine/Iso.js';

const tmp = { x: 0, y: 0 };

// Что можно двигать из объектов карты (остальное — природа)
const MOVABLE = { house: 'Дом', well: 'Колодец' };

export class Mover {
  constructor(farm) {
    this.f = farm;
    this.active = false;
    this.sel = null;   // { kind: 'obj'|'bed', o?, b?, name, w, h, gx, gy }
    this.to = null;    // { gx, gy, ok, why }
  }

  enter() {
    const f = this.f;
    if (this.active) return;
    this.active = true;
    this.sel = null; this.to = null;
    f.player.queue.length = 0; // очередь дел отменяется: объекты могут переехать
    f.ui.closePopup(); f.ui.closePanel();
    this.hint();
    f.dirty = true;
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.sel = null; this.to = null;
    this.f.ui.moveBar(null);
    this.f.dirty = true;
  }

  hint(msg, bad) {
    const s = this.sel, t = this.to;
    let text = msg;
    if (!text) {
      if (!s) text = 'Нажмите на то, что передвинуть или убрать в рюкзак. Пустая трава — поставить из рюкзака';
      else if (!t) text = s.store ? `${s.name}: нажмите на клетку, куда поставить, или «В рюкзак»` : `${s.name}: нажмите на клетку, куда поставить`;
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
    if (t === T.WATER) return { why: 'Пруд передвинуть нельзя' };
    if (t === T.PATH) {
      if (this.busy({ x: gx, y: gy })) return { why: 'Призрачок сейчас работает здесь, подождите' };
      return { sel: { kind: 'path', store: true, name: 'Тропинка', w: 1, h: 1, gx, gy } };
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
    return { empty: true, why: 'Здесь пусто. Нажмите на дом, колодец, грядку, тропинку или своё растение' };
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
    if (gx === s.gx && gy === s.gy) return { ok: false, why: 'Объект уже стоит здесь' };
    const own = (x, y) => x >= s.gx && x < s.gx + s.w && y >= s.gy && y < s.gy + s.h;
    const a = p.current && p.current.kind !== 'walk' ? p.current : null;
    const next = p.path && p.path[0];
    for (let y = gy; y < gy + s.h; y++) for (let x = gx; x < gx + s.w; x++) {
      if (!w.inside(x, y)) return { ok: false, why: 'Сюда нельзя: это край фермы' };
      if (!w.isOpen(x, y)) return { ok: false, why: 'Сюда нельзя: участок ещё не открыт' };
      const i = w.idx(x, y), t = w.tiles[i];
      if (s.kind === 'obj' && own(x, y)) continue;
      if (t === T.WATER) return { ok: false, why: 'Сюда нельзя: здесь вода' };
      if (t === T.PATH) return { ok: false, why: 'Сюда нельзя: здесь тропинка' };
      if (t === T.SOIL) return { ok: false, why: 'Сюда нельзя: здесь уже грядка' };
      const o = w.occ[i] >= 0 ? w.objects[w.occ[i]] : null;
      if (o && o !== s.o) return { ok: false, why: `Сюда нельзя: мешает ${((OBJECTS[o.type] || {}).name || 'объект').toLowerCase()}` };
      if (s.kind === 'obj' && ((x === p.tx && y === p.ty) || (next && x === next[0] && y === next[1]))) return { ok: false, why: 'Сюда нельзя: здесь стоит призрачок' };
      if (a && !a.obj && a.x === x && a.y === y) return { ok: false, why: 'Сюда нельзя: призрачок здесь работает' };
    }
    if (s.kind === 'obj' && this.cutsOff(gx, gy)) return { ok: false, why: 'Сюда нельзя: так закроется проход' };
    return { ok: true };
  }

  // Не отрежет ли постройка часть открытой земли от призрачка
  cutsOff(gx, gy) {
    const f = this.f, w = f.world, s = this.sel, p = f.player;
    const inNew = (x, y) => x >= gx && x < gx + s.w && y >= gy && y < gy + s.h;
    const inOld = (x, y) => x >= s.gx && x < s.gx + s.w && y >= s.gy && y < s.gy + s.h;
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
    return after < before - (s.gx < 0 ? s.w * s.h : 0);
  }

  // ---------- нажатия ----------
  tap(gx, gy, wx, wy, sx, sy) {
    const s = this.sel;
    if (!s) {
      const r = this.identify(gx, gy, wx, wy);
      if (r.empty && this.stock().length) return this.fromBag(gx, gy, sx, sy);
      if (r.why) return this.fail(r.why);
      this.sel = r.sel; this.to = null;
      this.f.sfx('pop');
      return this.hint();
    }
    // нажали на сам выбранный объект без цели — снять выбор
    const own = gx >= s.gx && gx < s.gx + s.w && gy >= s.gy && gy < s.gy + s.h;
    if (own && !this.to) { this.cancel(); return; }
    // большой объект: нажатая клетка — его середина
    const tx = gx - ((s.w - 1) >> 1), ty = gy - ((s.h - 1) >> 1);
    if (this.to && this.to.gx === tx && this.to.gy === ty && this.to.ok) return this.place();
    const c = this.check(tx, ty);
    this.to = { gx: tx, gy: ty, ok: c.ok, why: c.why };
    this.hint();
    if (!c.ok) { this.f.sfx('error'); this.f.ui.moveBarShake(); }
    this.f.dirty = true;
  }

  cancel() {
    this.sel = null; this.to = null;
    this.hint();
    this.f.dirty = true;
  }

  place() {
    const f = this.f, w = f.world, s = this.sel, t = this.to;
    if (!s || !t) return false;
    // состояние могло измениться (призрачок дошёл, урожай посадили) — проверяем заново
    const c = this.check(t.gx, t.gy);
    if (!c.ok) { t.ok = false; t.why = c.why; this.fail(c.why); return false; }
    if (s.kind === 'bed' && s.b.crop) { this.fail('На грядке уже растёт урожай'); this.cancel(); return false; }
    if (s.kind === 'obj') {
      if (s.plant) Flora.moveOwn(f.st, s.o, t.gx, t.gy);
      w.moveObject(s.o, t.gx, t.gy);
      if (!s.plant) { f.st.pos = f.st.pos || {}; f.st.pos[s.o.type] = [t.gx, t.gy]; }
      f.burst(s.o.wx, s.o.wy - 6, '#e8d9a8', 14);
    } else if (s.kind === 'path') {
      // клетка тропинки переезжает, на старом месте — обычная трава
      w.tiles[w.idx(s.gx, s.gy)] = T.GRASS;
      w.tiles[w.idx(t.gx, t.gy)] = T.PATH;
      this.savePaths();
      toWorld(t.gx + 0.5, t.gy + 0.5, tmp);
      f.burst(tmp.x, tmp.y, '#d9b98a', 8);
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
    f.dirty = true;
    f.changed();
    return true;
  }

  savePaths() {
    const f = this.f, w = f.world;
    f.st.paths = [];
    for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === T.PATH) f.st.paths.push(i);
    f.groundV++;
  }

  // ---------- рюкзак ----------
  // «В рюкзак»: выбранная тропинка или своё растение уходит предметом в рюкзак
  store() {
    const f = this.f, w = f.world, s = this.sel;
    if (!s || !s.store) return false;
    let items;
    if (s.kind === 'path') {
      if (w.tile(s.gx, s.gy) !== T.PATH) { this.cancel(); return false; }
      if (!Inv.addItem(f.st, 'path', 1)) { this.fail('Рюкзак полон'); return false; }
      w.tiles[w.idx(s.gx, s.gy)] = T.GRASS;
      this.savePaths();
      toWorld(s.gx + 0.5, s.gy + 0.5, tmp);
      items = [{ id: 'path', n: 1 }];
      f.dropFx({ wx: tmp.x, wy: tmp.y }, items);
      f.burst(tmp.x, tmp.y, '#d9b98a', 8);
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
    f.dirty = true;
    f.changed();
    return true;
  }

  // Что из рюкзака можно поставить в этом режиме: тропинки (и потом декор) и свои выкопанные растения
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
      items: list.map(({ it, n }) => ({ icon: it.icon, label: it.name, sub: `есть: ${n}`, onClick: () => this.putFromBag(it.key, gx, gy) })),
    });
    f.sfx('pop');
  }

  putFromBag(id, gx, gy) {
    const f = this.f, w = f.world, it = ITEMS[id];
    if (!it || !Inv.count(f.st, id)) return false;
    // проверка — как при переносе одной клетки из ниоткуда
    const save = this.sel;
    this.sel = { kind: it.place === 'path' ? 'path' : 'obj', w: 1, h: 1, gx: -9, gy: -9 };
    const c = this.check(gx, gy);
    this.sel = save;
    if (!c.ok) return this.fail(c.why);
    toWorld(gx + 0.5, gy + 0.5, tmp);
    if (it.place === 'path') {
      Inv.takeItem(f.st, id, 1);
      w.tiles[w.idx(gx, gy)] = T.PATH;
      this.savePaths();
      f.burst(tmp.x, tmp.y, '#d9b98a', 8);
    } else {
      const o = f.plantOwn(it.floraOf, gx, gy, true);
      if (!o) return false;
      f.burst(o.wx, o.wy, '#7ccf4f', 8);
    }
    f.sfx('dig');
    this.hint(`${it.name}: поставлено`);
    f.dirty = true;
    f.changed();
    return true;
  }
}
