// Редактор карты — инструмент разработчика (не для игроков).
// Открывается только при локальном запуске: tools/editor.cmd → http://localhost:8080/editor.
// В сборку dist (GitHub Pages, Telegram) этот файл не входит.
//
// Мышь: левая кнопка — рисовать текущим инструментом, правая/средняя — двигать карту, колесо — масштаб.
// Телефон: кнопка «Кисть/Рука» переключает, что делает палец. Ctrl+Z — отменить, Ctrl+S — сохранить.
//
// Сохранение пишет assets/map.json прямо в папку проекта (через tools/serve.mjs). Игра берёт карту
// из этого файла вместо случайной генерации. Несохранённая работа держится в черновике браузера.

import { World, mapText, N, CHUNK, CHUNKS, T, START_CHUNK, FOG_TREES, FOG_W } from '../game/World.js';
import { OBJECTS, PATHS, PATH_KEYS } from '../game/data.js';
import { toGrid, toWorld } from '../engine/Iso.js';

const DRAFT = 'farm.editor.draft';
const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };

const TOOLS = [
  { group: 'Земля' },
  { id: 'grass', name: 'Трава', tile: T.GRASS, brush: true },
  // дорожки — все виды из PATHS (data.js): «Тропинка», песчаная, настил, …
  ...PATH_KEYS.map((k, n) => ({ id: k, name: PATHS[k].name, tile: T.PATH, path: n, brush: true })),
  { id: 'water', name: 'Вода', tile: T.WATER, brush: true },
  { id: 'soil', name: 'Грядка', tile: T.SOIL, brush: true },
  { group: 'Природа' },
  { id: 'oak', name: 'Дуб', obj: 'oak', brush: true },
  { id: 'birch', name: 'Берёза', obj: 'birch', brush: true },
  { id: 'sakura', name: 'Сакура', obj: 'sakura', brush: true },
  { id: 'cherry', name: 'Вишня', obj: 'cherry', brush: true },
  { id: 'maple', name: 'Клён', obj: 'maple', brush: true },
  { id: 'apple', name: 'Яблоня', obj: 'apple', brush: true },
  { id: 'pine', name: 'Ель', obj: 'pine', brush: true },
  { id: 'linden', name: 'Липа', obj: 'linden', brush: true },
  { id: 'blueberry', name: 'Голубика', obj: 'blueberry', brush: true },
  { id: 'raspberry', name: 'Малина', obj: 'raspberry', brush: true },
  { id: 'rosehip', name: 'Шиповник', obj: 'rosehip', brush: true },
  { id: 'hydrangea', name: 'Гортензия', obj: 'hydrangea', brush: true },
  { id: 'lavender', name: 'Лаванда', obj: 'lavender', brush: true },
  { id: 'rose', name: 'Роза', obj: 'rose', brush: true },
  { id: 'rock', name: 'Камень', obj: 'rock', brush: true },
  { id: 'boulder', name: 'Валун 2×2', obj: 'boulder' },
  { id: 'forest', name: 'Лес (случайно)', obj: 'forest', brush: true },
  { id: 'fogforest', name: 'Лес в тумане', obj: 'fogforest', brush: true },
  { group: 'Постройки' },
  { id: 'house', name: 'Дом', obj: 'house', one: true },
  { id: 'well', name: 'Колодец', obj: 'well', one: true },
  { id: 'player', name: 'Старт призрачка', player: true },
  { group: 'Правка' },
  { id: 'erase', name: 'Ластик', erase: true, brush: true },
  { id: 'move', name: 'Перенести', move: true },
];
const FOREST = ['oak', 'birch', 'sakura', 'linden', 'maple', 'pine', 'pine', 'linden', 'lavender', 'rock'];
const FOG_FOREST = ['oak', 'birch', 'sakura', 'linden', 'maple', 'pine', 'pine', 'pine', 'linden', 'lavender'];

// Какую карту открыть: черновик (несохранённая работа) или файл
export function startMap(fileMap) {
  try { const d = JSON.parse(localStorage.getItem(DRAFT)); if (d && d.tiles) { d._draft = true; return d; } } catch { /* */ }
  return fileMap;
}

export class MapEditor {
  constructor(farm, { input, map }) {
    this.f = farm;
    this.input = input;
    this.tool = TOOLS.find((t) => t.id === 'grass');
    this.size = 1;
    this.handMode = false; // на телефоне: палец двигает карту, а не рисует
    this.undo = []; this.redo = [];
    this.painting = null;
    this.sel = null; // выбранный объект для переноса
    this.dirtyDecor = false;
    this.saved = !(map && map._draft);
    this.fromFile = !!map;
  }

  start() {
    const f = this.f;
    f.editor = this;
    document.body.classList.add('editor-mode');
    this.openAll();
    f.onTap = (sx, sy) => this.tapScreen(sx, sy); // тап в режиме «Рука»
    this.buildUI();
    this.bindPointer();
    this.bindKeys();
    window.addEventListener('beforeunload', (e) => { if (!this.saved) { e.preventDefault(); e.returnValue = ''; } });
    this.status(this.fromFile ? (this.saved ? 'Открыта карта из assets/map.json' : 'Открыт несохранённый черновик') : 'Файла карты ещё нет: открыта случайная генерация. Сохраните, чтобы игра взяла эту карту.');
  }

  // в редакторе видна и редактируется вся карта
  openAll() {
    const f = this.f, w = f.world;
    w.unlocked.fill(1); w.version++;
    f.updateBounds();
    f.groundV++;
  }

  // ---------------- ввод ----------------
  bindPointer() {
    const app = document.getElementById('app'), canvas = document.getElementById('game');
    // слушаем раньше движка (захват на родителе): рисование не должно двигать карту
    app.addEventListener('pointerdown', (e) => {
      if (e.target !== canvas) return;
      const mouse = e.pointerType === 'mouse';
      if (mouse ? e.button !== 0 : this.handMode) return; // правая/средняя кнопка и «Рука» — карту двигает движок
      e.stopPropagation();
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      this.painting = { id: e.pointerId, last: null };
      this.begin();
      this.paintAt(e);
    }, true);
    app.addEventListener('pointermove', (e) => {
      if (this.painting && e.pointerId === this.painting.id) { e.stopPropagation(); this.paintAt(e); }
    }, true);
    const up = (e) => {
      if (!this.painting || e.pointerId !== this.painting.id) return;
      e.stopPropagation();
      this.painting = null;
      this.end();
    };
    app.addEventListener('pointerup', up, true);
    app.addEventListener('pointercancel', up, true);
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'я')) { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); }
      else if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'н')) { e.preventDefault(); this.doRedo(); }
      else if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'ы')) { e.preventDefault(); this.saveFile(); }
      else if (e.key === 'Escape') { this.sel = null; this.status('Выбор снят'); }
      else if (e.key === '[' || e.key === ']') this.setSize(Math.max(1, Math.min(5, this.size + (e.key === ']' ? 1 : -1))));
    });
  }

  cellAt(sx, sy) {
    this.f.cam.screenToWorld(sx, sy, tmp);
    toGrid(tmp.x, tmp.y, tmp2);
    return [Math.floor(tmp2.x), Math.floor(tmp2.y)];
  }

  paintAt(e) {
    const r = this.input.rect, [gx, gy] = this.cellAt(e.clientX - r.left, e.clientY - r.top);
    const p = this.painting;
    this.f.hover = { x: gx, y: gy };
    if (p.last && p.last[0] === gx && p.last[1] === gy) return;
    // быстрый мазок: заполняем клетки между двумя событиями мыши
    if (p.last && this.tool.brush) {
      const [x0, y0] = p.last, n = Math.max(Math.abs(gx - x0), Math.abs(gy - y0));
      for (let k = 1; k < n; k++) this.apply(Math.round(x0 + (gx - x0) * k / n), Math.round(y0 + (gy - y0) * k / n), true);
    }
    const first = !p.last;
    p.last = [gx, gy];
    if (!first && !this.tool.brush) return; // одиночные инструменты — только по нажатию
    this.apply(gx, gy, !first);
  }

  tapScreen(sx, sy) {
    const [gx, gy] = this.cellAt(sx, sy);
    this.begin();
    this.apply(gx, gy, false);
    this.end();
  }

  // ---------------- правки ----------------
  // снимок до мазка — для отмены
  begin() { this._before = JSON.stringify(this.f.world.toMap()); this._changed = false; }
  end() {
    if (this._changed) {
      this.undo.push(this._before); if (this.undo.length > 80) this.undo.shift();
      this.redo.length = 0;
      this.touch();
    }
    if (this.dirtyDecor) { this.dirtyDecor = false; this.f.world.genDecor(); this.f.scene && this.f.scene.resetDecor(); }
    this._before = null;
  }

  touch() {
    this.saved = false;
    try { localStorage.setItem(DRAFT, JSON.stringify(this.f.world.toMap())); } catch { /* */ }
    this.updateTitle();
  }

  cells(gx, gy) {
    const out = [], s = this.size, o = (s - 1) >> 1;
    for (let y = gy - o; y < gy - o + s; y++) for (let x = gx - o; x < gx - o + s; x++) if (this.f.world.inside(x, y)) out.push([x, y]);
    return out;
  }

  // Полоса тумана за краем карты: там только лес-картинка (деревья, кусты), с дальних сторон
  applyFog(gx, gy, drag) {
    const t = this.tool, w = this.f.world;
    const list = [];
    const s = this.size, o = (s - 1) >> 1;
    for (let y = gy - o; y < gy - o + s; y++) for (let x = gx - o; x < gx - o + s; x++) if (w.fogDepth(x, y) >= 1) list.push([x, y]);
    let did = false;
    for (const [x, y] of list) {
      if (t.erase) { did = w.removeFogTree(x, y) || did; continue; }
      let type = t.obj;
      if (type === 'forest' || type === 'fogforest') {
        if (this.size > 1 && Math.random() < 0.45) continue;
        type = FOG_FOREST[(Math.random() * FOG_FOREST.length) | 0];
      }
      if (!FOG_TREES.includes(type)) { if (!drag) this.status('В тумане можно рисовать только деревья, кусты и ластик', true); return; }
      if (!w.fogBack(x, y)) { if (!drag) this.status('Лес в тумане — только с дальних сторон карты (на ближних он закрывал бы край)', true); continue; }
      did = !!w.addFogTree(type, x, y) || did;
    }
    if (did) { this._changed = true; this.status('Лес в тумане изменён'); }
  }

  apply(gx, gy, drag) {
    const t = this.tool, f = this.f, w = f.world;
    if (!w.inside(gx, gy)) {
      if (w.fogDepth(gx, gy) <= FOG_W) return this.applyFog(gx, gy, drag);
      if (!drag) this.status('Это за краем карты', true);
      return;
    }
    if (t.obj === 'fogforest') { if (!drag) this.status('«Лес в тумане» рисуется за краем карты, в полосе тумана', true); return; }
    if (t.tile !== undefined) { for (const [x, y] of this.cells(gx, gy)) this.setTile(x, y, t.tile, t.path || 0); return; }
    if (t.erase) { for (const [x, y] of this.cells(gx, gy)) this.erase(x, y); return; }
    if (t.player) return this.setPlayer(gx, gy);
    if (t.move) return this.moveTap(gx, gy);
    if (t.obj === 'forest') {
      for (const [x, y] of this.cells(gx, gy)) {
        if (this.size > 1 && Math.random() < 0.45) continue; // большая кисть — лес с полянками
        this.place(FOREST[(Math.random() * FOREST.length) | 0], x, y, true);
      }
      return;
    }
    if (t.obj) {
      if (t.brush) { for (const [x, y] of this.cells(gx, gy)) this.place(t.obj, x, y, drag || this.size > 1); return; }
      // большой объект: нажатая клетка — его середина
      const def = OBJECTS[t.obj], ow = def.w || 1, oh = def.h || 1;
      this.place(t.obj, gx - ((ow - 1) >> 1), gy - ((oh - 1) >> 1), drag);
    }
  }

  setTile(x, y, t, kind = 0) {
    const f = this.f, w = f.world, i = w.idx(x, y), was = w.tiles[i];
    if (was === t && (t !== T.PATH || w.pathKind[i] === kind)) return;
    if (w.occ[i] >= 0) return; // под объектом земля не меняется — сначала ластик
    const [px, py] = w.playerStart;
    if (t === T.WATER && x === px && y === py) { this.status('Здесь стоит призрачок: в воду его не поставить', true); return; }
    w.tiles[i] = t;
    w.pathKind[i] = t === T.PATH ? kind : 0;
    if (was === T.SOIL) f.beds.delete(i);
    if (t === T.SOIL) f.bedAt(i);
    if (was === T.WATER || t === T.WATER) this.dirtyDecor = true;
    f.groundV++;
    this._changed = true;
  }

  why(type, gx, gy) {
    const w = this.f.world, def = OBJECTS[type], ow = def.w || 1, oh = def.h || 1;
    for (let y = gy; y < gy + oh; y++) for (let x = gx; x < gx + ow; x++) {
      if (!w.inside(x, y)) return 'за краем карты';
      const i = w.idx(x, y);
      if (w.occ[i] >= 0) return `мешает ${(OBJECTS[w.objects[w.occ[i]].type].name || 'объект').toLowerCase()}`;
      if (w.tiles[i] !== T.GRASS) return 'объекты ставятся только на траву';
    }
    return null;
  }

  place(type, gx, gy, quiet) {
    const f = this.f, w = f.world, def = OBJECTS[type];
    const bad = this.why(type, gx, gy);
    if (bad) { if (!quiet) this.status(`${def.name}: нельзя — ${bad}`, true); return null; }
    // дом и колодец — по одному: старый переезжает
    if (type === 'house' || type === 'well') {
      const old = type === 'well' ? w.well : w.objects.find((o) => o && o.type === 'house');
      if (old) { w.moveObject(old, gx, gy); this._changed = true; this.status(`${def.name} перенесён`); return old; }
    }
    const o = w.add(type, gx, gy);
    if (o && type === 'well') { w.well = o; w.wellPos = [gx, gy]; }
    if (o) this._changed = true;
    return o;
  }

  erase(x, y) {
    const f = this.f, w = f.world, o = w.objectAt(x, y);
    if (o) {
      if (o === w.well) w.well = null;
      w.remove(o);
      if (this.sel === o) this.sel = null;
      this._changed = true;
      return;
    }
    this.setTile(x, y, T.GRASS);
  }

  setPlayer(gx, gy) {
    const f = this.f, w = f.world, i = w.idx(gx, gy);
    if (w.tiles[i] === T.WATER || w.occ[i] >= 0) return this.status('Призрачок встаёт только на свободную землю', true);
    if (w.chunkOf(gx, gy) !== START_CHUNK) this.status('Внимание: старт вне стартового участка (жёлтая рамка) — там закрыто', true);
    w.playerStart = [gx, gy];
    const p = f.player; p.x = gx + 0.5; p.y = gy + 0.5; p.path = [];
    this._changed = true;
  }

  moveTap(gx, gy) {
    const w = this.f.world;
    if (!this.sel) {
      const o = w.objectAt(gx, gy);
      if (!o) return this.status('Нажмите на объект, который нужно перенести', true);
      this.sel = o;
      return this.status(`${OBJECTS[o.type].name}: нажмите, куда поставить (Esc — отмена)`);
    }
    const o = this.sel, tx = gx - ((o.w - 1) >> 1), ty = gy - ((o.h - 1) >> 1);
    if (o.gx === tx && o.gy === ty) { this.sel = null; return this.status('Выбор снят'); }
    // проверяем место, не считая сам объект
    w.lift(o);
    const bad = this.why(o.type, tx, ty);
    w.put(o, bad ? o.gx : tx, bad ? o.gy : ty);
    if (bad) return this.status(`Сюда нельзя: ${bad}`, true);
    if (o === w.well) w.wellPos = [tx, ty];
    this._changed = true;
    this.sel = null;
    this.status('Перенесено');
  }

  // целиком заменить карту (отмена, открытие файла, новая карта)
  load(m, why) {
    const f = this.f, old = f.world;
    const w = new World(old.seed, m);
    f.world = w;
    f.beds = new Map();
    for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === T.SOIL) f.bedAt(i);
    f.player.world = w;
    f.player.x = w.playerStart[0] + 0.5; f.player.y = w.playerStart[1] + 0.5; f.player.path = [];
    this.sel = null;
    this.openAll();
    if (f.scene) { f.scene._obTick = 1e9; f.scene.resetDecor(); }
    if (why) this.status(why);
  }

  doUndo() {
    if (!this.undo.length) return this.status('Отменять нечего');
    this.redo.push(JSON.stringify(this.f.world.toMap()));
    this.load(JSON.parse(this.undo.pop()), 'Отменено');
    this.touch();
  }

  doRedo() {
    if (!this.redo.length) return this.status('Повторять нечего');
    this.undo.push(JSON.stringify(this.f.world.toMap()));
    this.load(JSON.parse(this.redo.pop()), 'Повторено');
    this.touch();
  }

  replace(m, why) {
    this.undo.push(JSON.stringify(this.f.world.toMap()));
    this.redo.length = 0;
    this.load(m, why);
    this.touch();
  }

  // ---------------- проверка и файл ----------------
  problems() {
    const w = this.f.world, out = [];
    const house = w.objects.find((o) => o && o.type === 'house');
    if (!house) out.push('нет дома');
    else if (w.chunkOf(house.gx, house.gy) !== START_CHUNK) out.push('дом вне стартового участка');
    if (!w.well) out.push('нет колодца');
    else if (w.chunkOf(w.well.gx, w.well.gy) !== START_CHUNK) out.push('колодец вне стартового участка');
    const [px, py] = w.playerStart, pi = w.idx(px, py);
    if (w.tiles[pi] === T.WATER || w.occ[pi] >= 0) out.push('призрачок стоит в воде или в объекте');
    if (w.chunkOf(px, py) !== START_CHUNK) out.push('старт призрачка вне стартового участка');
    let soil = 0;
    for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === T.SOIL && w.chunkOf(i % N, (i / N) | 0) === START_CHUNK) soil++;
    if (!soil) out.push('на стартовом участке нет ни одной грядки (первое задание — собрать морковку)');
    return out;
  }

  text() { return mapText(this.f.world.toMap()); }

  async saveFile() {
    const bad = this.problems();
    if (bad.length && !confirm('На карте есть проблемы:\n• ' + bad.join('\n• ') + '\n\nВсё равно сохранить?')) return;
    try {
      const r = await fetch('/__editor/map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: this.text() });
      if (!r.ok) throw new Error(await r.text() || r.status);
      this.saved = true;
      try { localStorage.removeItem(DRAFT); } catch { /* */ }
      this.updateTitle();
      this.status('Сохранено в assets/map.json. Чтобы карта попала в игру на сайте — закоммитьте и запушьте (push.cmd).');
    } catch (e) {
      this.status('Не удалось сохранить через сервер (' + e.message + '). Скачиваю файл — положите его в assets/map.json.', true);
      this.download();
    }
  }

  download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([this.text()], { type: 'application/json' }));
    a.download = 'map.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  openFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      try { const m = JSON.parse(await inp.files[0].text()); if (!m.tiles) throw new Error('нет tiles'); this.replace(m, 'Карта открыта из файла'); }
      catch (e) { this.status('Не тот файл: ' + e.message, true); }
    };
    inp.click();
  }

  async reloadFile() {
    if (!this.saved && !confirm('Выбросить несохранённые правки и открыть assets/map.json?')) return;
    try {
      const r = await fetch('assets/map.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('файла нет');
      this.replace(await r.json(), 'Открыта карта из assets/map.json');
      this.saved = true;
      try { localStorage.removeItem(DRAFT); } catch { /* */ }
      this.updateTitle();
    } catch (e) { this.status('Не открылся assets/map.json: ' + e.message, true); }
  }

  newMap(kind) {
    if (!confirm(kind === 'gen' ? 'Заменить карту случайной генерацией? (Ctrl+Z вернёт)' : 'Начать с пустой карты? (Ctrl+Z вернёт)')) return;
    let m;
    if (kind === 'gen') m = new World((Math.random() * 2 ** 31) | 0).toMap();
    else {
      const ox = 2 * CHUNK, oy = 2 * CHUNK;
      const tiles = Array.from({ length: N }, () => '0'.repeat(N));
      const row = (y, x, t) => { tiles[y] = tiles[y].slice(0, x) + t + tiles[y].slice(x + 1); };
      row(oy + 6, ox + 2, T.SOIL); row(oy + 6, ox + 3, T.SOIL);
      m = { v: 1, n: N, tiles, objects: [['house', ox + 2, oy + 2]], well: [ox + 5, oy + 4], player: [ox + 4, oy + 6] };
    }
    this.replace(m, kind === 'gen' ? 'Новая случайная карта' : 'Пустая карта');
  }

  // ---------------- отрисовка поверх карты ----------------
  overlay(g, outline) {
    const f = this.f, w = f.world;
    // сетка участков; стартовый — жёлтым
    const line = (ax, ay, bx, by, color, alpha, width) => {
      toWorld(ax, ay, tmp); const x0 = tmp.x, y0 = tmp.y; toWorld(bx, by, tmp);
      g.moveTo(x0, y0).lineTo(tmp.x, tmp.y).stroke({ width, color, alpha });
    };
    for (let k = 0; k <= CHUNKS; k++) { line(k * CHUNK, 0, k * CHUNK, N, 0xffffff, 0.35, 1.5); line(0, k * CHUNK, N, k * CHUNK, 0xffffff, 0.35, 1.5); }
    const sx = (START_CHUNK % CHUNKS) * CHUNK, sy = ((START_CHUNK / CHUNKS) | 0) * CHUNK;
    line(sx, sy, sx + CHUNK, sy, 0xffd84a, 0.95, 3); line(sx + CHUNK, sy, sx + CHUNK, sy + CHUNK, 0xffd84a, 0.95, 3);
    line(sx + CHUNK, sy + CHUNK, sx, sy + CHUNK, 0xffd84a, 0.95, 3); line(sx, sy + CHUNK, sx, sy, 0xffd84a, 0.95, 3);
    // старт призрачка
    const [px, py] = w.playerStart;
    outline(px, py, 0x7fd8ff, 0.95, 2.5);
    // выбранный для переноса объект
    if (this.sel) for (let y = this.sel.gy; y < this.sel.gy + this.sel.h; y++) for (let x = this.sel.gx; x < this.sel.gx + this.sel.w; x++) outline(x, y, 0xffe066, 0.6 + 0.4 * Math.sin(f.time * 6), 2.5);
    // кисть под курсором
    const h = f.hover;
    if (h && w.fogDepth(h.x, h.y) >= 1 && w.fogDepth(h.x, h.y) <= FOG_W) {
      const s = this.size, o = (s - 1) >> 1, t = this.tool;
      for (let y = h.y - o; y < h.y - o + s; y++) for (let x = h.x - o; x < h.x - o + s; x++) if (w.fogDepth(x, y) >= 1) outline(x, y, t.erase ? 0xff6a50 : w.fogBack(x, y) ? 0xbfe6ff : 0x888888, 0.9, 2);
    }
    if (h && w.inside(h.x, h.y)) {
      const t = this.tool;
      let list;
      if (t.brush) list = this.cells(h.x, h.y);
      else if (t.obj) { const d = OBJECTS[t.obj], ow = d.w || 1, oh = d.h || 1, x0 = h.x - ((ow - 1) >> 1), y0 = h.y - ((oh - 1) >> 1); list = []; for (let y = y0; y < y0 + oh; y++) for (let x = x0; x < x0 + ow; x++) list.push([x, y]); }
      else list = [[h.x, h.y]];
      const color = t.erase ? 0xff6a50 : 0x8ff06a;
      for (const [x, y] of list) outline(x, y, color, 0.9, 2);
    }
  }

  // ---------------- интерфейс ----------------
  status(text, bad) {
    if (!this.$status) return;
    this.$status.textContent = text;
    this.$status.classList.toggle('bad', !!bad);
  }

  updateTitle() {
    if (this.$save) this.$save.textContent = this.saved ? 'Сохранено' : 'Сохранить *';
    if (this.$save) this.$save.classList.toggle('gold', !this.saved);
    document.title = (this.saved ? '' : '* ') + 'Редактор карты';
  }

  setSize(n) {
    this.size = n;
    for (const b of this.$sizes) b.classList.toggle('on', +b.dataset.n === n);
  }

  thumb(tool) {
    const f = this.f, S = f.S;
    let s = null;
    try {
      if (tool.tile === T.GRASS) s = S.grass[0];
      else if (tool.tile === T.PATH) s = S.paths[tool.path || 0].tiles[0];
      else if (tool.tile === T.SOIL) s = S.bed[0];
      else if (tool.obj && tool.obj !== 'forest' && tool.obj !== 'fogforest') s = f.objSprite({ type: tool.obj, id: 0 });
      else if (tool.obj === 'forest' || tool.obj === 'fogforest') s = f.objSprite({ type: 'pine', id: 1 });
    } catch { s = null; }
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    if (tool.tile === T.WATER) { g.fillStyle = '#4fa8d8'; g.beginPath(); g.moveTo(32, 16); g.lineTo(62, 32); g.lineTo(32, 48); g.lineTo(2, 32); g.fill(); }
    else if (s && s.canvas) {
      try {
        const k = Math.min(60 / s.w, 60 / s.h);
        g.drawImage(s.canvas, 32 - s.w * k / 2, 62 - s.h * k, s.w * k, s.h * k);
      } catch { /* */ }
    } else {
      g.font = '34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(tool.erase ? '✖' : tool.move ? '✥' : tool.player ? '👻' : '?', 32, 34);
    }
    return c.toDataURL();
  }

  buildUI() {
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const root = el('div', 'ed-root');
    const head = el('div', 'ed-head');
    head.appendChild(el('b', null, 'Редактор карты'));
    const hand = el('button', 'ed-btn ed-hand', 'Кисть');
    hand.title = 'На телефоне: что делает палец — рисует или двигает карту';
    hand.onclick = () => { this.handMode = !this.handMode; hand.textContent = this.handMode ? 'Рука' : 'Кисть'; };
    head.appendChild(hand);
    this.hideFog = false;
    const fogB = el('button', 'ed-btn', 'Туман: виден');
    fogB.title = 'Спрятать туман, чтобы лучше видеть лес под ним';
    fogB.onclick = () => { this.hideFog = !this.hideFog; fogB.textContent = this.hideFog ? 'Туман: скрыт' : 'Туман: виден'; };
    head.appendChild(fogB);
    root.appendChild(head);

    const tools = el('div', 'ed-tools');
    this.$tools = [];
    for (const t of TOOLS) {
      if (t.group) { tools.appendChild(el('div', 'ed-group', t.group)); continue; }
      const b = el('button', 'ed-tool');
      const im = el('img'); im.src = this.thumb(t); im.alt = '';
      b.appendChild(im); b.appendChild(el('span', null, t.name));
      b.onclick = () => {
        this.tool = t; this.sel = null;
        for (const x of this.$tools) x.classList.toggle('on', x === b);
        this.status(t.move ? 'Нажмите на объект, потом на новое место' : t.one ? `${t.name}: нажмите, куда поставить (старый переедет)` : t.player ? 'Нажмите, где призрачок появится в новой игре' : t.name);
      };
      if (t === this.tool) b.classList.add('on');
      this.$tools.push(b);
      tools.appendChild(b);
    }
    root.appendChild(tools);

    const sizes = el('div', 'ed-row');
    sizes.appendChild(el('span', 'ed-cap', 'Кисть'));
    this.$sizes = [1, 2, 3, 5].map((n) => {
      const b = el('button', 'ed-btn ed-size', `${n}×${n}`); b.dataset.n = n;
      b.onclick = () => this.setSize(n);
      sizes.appendChild(b); return b;
    });
    root.appendChild(sizes);
    this.setSize(1);

    const acts = el('div', 'ed-row ed-acts');
    const act = (name, fn, cls) => { const b = el('button', 'ed-btn' + (cls ? ' ' + cls : ''), name); b.onclick = fn; acts.appendChild(b); return b; };
    act('↶', () => this.doUndo()).title = 'Отменить (Ctrl+Z)';
    act('↷', () => this.doRedo()).title = 'Повторить (Ctrl+Y)';
    this.$save = act('Сохранить', () => this.saveFile(), 'gold');
    this.$save.title = 'Записать assets/map.json (Ctrl+S)';
    root.appendChild(acts);

    const more = el('details', 'ed-more');
    more.appendChild(el('summary', null, 'Файл'));
    const mrow = el('div', 'ed-col');
    const m = (name, fn) => { const b = el('button', 'ed-btn', name); b.onclick = fn; mrow.appendChild(b); };
    m('Открыть assets/map.json', () => this.reloadFile());
    m('Открыть файл…', () => this.openFile());
    m('Скачать map.json', () => this.download());
    m('Новая: случайная генерация', () => this.newMap('gen'));
    m('Новая: пустая', () => this.newMap('empty'));
    m('Открыть игру', () => window.open('/?debug', '_blank'));
    more.appendChild(mrow);
    root.appendChild(more);

    this.$status = el('div', 'ed-status');
    root.appendChild(this.$status);
    root.appendChild(el('div', 'ed-help', 'ЛКМ — рисовать · ПКМ/колесо — двигать и масштаб · [ ] — размер кисти · Ctrl+Z / Ctrl+S'));
    // клики по панели не доходят до карты
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.getElementById('app').appendChild(root);
    this.updateTitle();
  }
}
