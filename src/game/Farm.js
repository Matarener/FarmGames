// Ферма: состояние игрока, правила взаимодействий (тапы, очередь действий, рост, урожай, рынок)
// и набор спрайтов из картинок художника. Рисует её PixiScene, интерфейс — UI.

import { toWorld, toGrid } from '../engine/Iso.js';
import { makeCanvas } from '../engine/Sprite.js';
import { World, N, CHUNK, CHUNKS, T } from './World.js';
import { Player } from './Player.js';
import { makeGhostData, ROD_TIP } from './ghost.js';
import { shoreTile } from './shore.js';
import { loadArt } from './artSprites.js';
import { Quests } from './quests.js';
import { Mover } from './Mover.js';
import * as Inv from './inventory.js';
import * as Wild from './wild.js';
import * as Flora from './flora.js';
import * as Beds from './beds.js';
import * as Hints from './hints.js';
import { BAR_KIND, barTop } from './bars.js';
import {
  CROPS, FISH, FISH_CATCH, OBJECTS, FLORA, FLORA_GOODS, floraSeedId, floraOwnId, seedId, WELL_COST, houseNeedChunks,
  ENERGY, ENERGY_REGEN_SEC, HOUSE, START, xpToNext, expansionCost, GEM_SPEEDUP_SEC,
} from './data.js';

const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };

export const BG = '#3d7a35';

export class Farm {
  constructor({ renderer, camera, ui, tg, save, perf, audio }) {
    this.audio = audio;
    this.r = renderer; this.cam = camera; this.ui = ui; this.tg = tg; this.save = save; this.perf = perf;
    this.particles = [];
    this.floaters = [];
    this.hover = null;
    this.focus = [];
    this.tapFx = null;
    this.time = 0;
    this.quests = new Quests(this);
    this.mover = new Mover(this);
    this.groundV = 0; // растёт, когда меняются клетки земли
    // Спрайты и иконки — из картинок художника. Пока они грузятся, игра не запущена (экран загрузки),
    // поэтому до applyArt здесь пусто. water — берега прудов, рисуются кодом по мере надобности.
    this.S = { water: new Map() };
    this.icons = {}; // имя → адрес картинки (для <img> в интерфейсе)
    this.iconImg = {}; // имя → загруженная картинка (для текстур сцены)
    this.artReady = loadArt((k) => this.onArtProgress && this.onArtProgress(k)).then((a) => this.applyArt(a));
    // ошибку загрузки обрабатывает main.js (экран загрузки с кнопкой «Повторить»)
    this.artReady.catch((e) => console.warn('art', e));
  }

  // Картинки художника загружены (artSprites.loadArt): раскладываем их в спрайты игры и иконки
  applyArt(a) {
    Object.assign(this.S, {
      grass: a.grass, path: a.path, bed: a.bed, waterTex: a.waterTex, decor: a.decor,
      objArt: a.obj, stumpOf: a.stumpOf, flora: a.flora, sprouts: a.sprouts, wildGrass: a.wildGrass,
      house: a.house, well: a.well, crops: a.crops, fog: a.fog.clouds.length ? a.fog : null,
    });
    this.groundV++;
    for (const [k, v] of Object.entries(a.icons)) { this.icons[k] = v.url; this.iconImg[k] = v.img; }
    // пузыри над грядками — те же иконки: квадрат 24×24 единицы, опора — низ хвостика
    this.S.bubble = {};
    for (const k of ['ready', 'water']) this.S.bubble[k] = { canvas: this.iconImg['bubble_' + k], w: 24, h: 24, ax: 12, ay: 24, name: 'bubble_' + k };
    // подсказка к заданию: стрелка над целью (опора — кончик), кольцо на земле под целью,
    // кружок у края экрана (он рисуется в пикселях экрана, остальное — в единицах мира)
    const hs = (name, w, ax, ay) => {
      const im = this.iconImg['hint_' + name], h = w * (im.naturalHeight || im.height) / (im.naturalWidth || im.width);
      return { canvas: im, w, h, ax: w * ax, ay: h * ay, name: 'hint_' + name };
    };
    const ring = hs('ring', 48, 0.5, 0.5);
    this.S.hint = { arrow: hs('arrow', 22, 0.5, 1), ringBack: halfOf(ring, 0), ringFront: halfOf(ring, 1), badge: hs('badge', 46, 0.5, 0.5) };
    // иконки, сделанные из спрайтов (свои растения в рюкзаке, тропинка), — data: URL, грузятся мгновенно
    const fl = Object.entries(a.floraIcons).map(([k, url]) => new Promise((res) => {
      const im = new Image();
      im.onload = () => { this.icons[k] = url; this.iconImg[k] = im; res(); };
      im.onerror = () => res();
      im.src = url;
    }));
    return Promise.all(fl).then(() => { this.onIcons && this.onIcons(); });
  }

  // средний цвет травы (у арта свой оттенок) — им рисуется травяной край берега
  grassColor() {
    const g0 = this.S.grass && this.S.grass[0];
    if (!g0 || !g0.canvas) return null;
    if (this._gcOf === g0) return this._gc;
    const c = makeCanvas(1, 1), x = c.getContext('2d');
    x.drawImage(g0.canvas, g0.canvas.width * 0.3, g0.canvas.height * 0.3, g0.canvas.width * 0.4, g0.canvas.height * 0.4, 0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    this._gcOf = g0; this._gc = `rgb(${d[0]},${d[1]},${d[2]})`;
    return this._gc;
  }

  // Спрайт берега для клетки воды (сама вода — общая текстура, её кладёт PixiScene).
  // Посреди пруда берега нет: у такого спрайта empty = true.
  waterSprite(x, y) {
    const w = this.world;
    const land = (xx, yy) => (!w.inside(xx, yy) || w.tile(xx, yy) !== T.WATER ? 1 : 0);
    const mask = land(x, y - 1) | (land(x + 1, y) << 1) | (land(x, y + 1) << 2) | (land(x - 1, y) << 3);
    // суша только по диагонали (угол тайла): углы T, R, B, L
    const dg = (land(x - 1, y - 1) && !(mask & 9) ? 1 : 0) | (land(x + 1, y - 1) && !(mask & 3) ? 2 : 0) |
      (land(x + 1, y + 1) && !(mask & 6) ? 4 : 0) | (land(x - 1, y + 1) && !(mask & 12) ? 8 : 0);
    const key = dg * 16 + mask;
    let s = this.S.water.get(key);
    if (!s) {
      s = shoreTile(mask, dg, this.grassColor());
      s.empty = !mask && !dg;
      this.S.water.set(key, s);
    }
    return s;
  }

  // Картинка объекта на карте (у камней, пней и деревьев вариант выбирается по id)
  objSprite(o) {
    const S = this.S;
    if (o.type === 'stump' && o.was) {
      // пень того дерева, которое срубили
      const tree = S.objArt[o.was], st = tree && S.stumpOf(tree[o.id % tree.length], o.id);
      if (st) return st;
    }
    if (o.type === 'sapling') {
      // свой росток: o.stage считает floraTick (0 — росток, 1 — молодое растение)
      const fl = S.flora[o.tree], fd = FLORA[o.tree];
      return o.stage >= 1 && fl ? fl.young : S.sprouts[fd ? fd.kind : 'tree'];
    }
    if (o.bare && S.flora[o.type]) return S.flora[o.type].bare; // плоды собраны
    const v = S.objArt[o.type];
    if (v && v.length) return v[o.id % v.length];
    switch (o.type) {
      case 'grass': return S.wildGrass[o.id % S.wildGrass.length];
      case 'house': return S.house[this.st.house];
      case 'well': return S.well[this.st.well ? 1 : 0];
    }
    return S.objArt.rock[0];
  }

  // ---------------- Состояние ----------------

  // map — карта из редактора (assets/map.json) или null (случайная генерация из seed)
  init(saved, map) {
    const seed = saved && saved.seed ? saved.seed : (Math.random() * 2 ** 31) | 0;
    this.world = new World(seed, map || null);
    const w = this.world;
    this.beds = new Map();
    this.st = {
      coins: START.coins, gems: START.gems, xp: 0, level: 1,
      energy: START.energy, energyAt: Date.now(), can: 0, house: 1, well: 0,
      items: { [seedId('carrot')]: 4 },
      stats: { cleared: 0, harvested: 0 },
    };
    let px = w.playerStart[0], py = w.playerStart[1];
    // v2 — сохранения версии с декором художника: там другой набор объектов,
    // поэтому из них берём только прогресс, а деревья и камни генерируются заново
    if (saved && (saved.v === 1 || saved.v === 2 || saved.v === 3)) {
      Object.assign(this.st, saved.st);
      Inv.migrateInventory(this.st);
      // карту поменяли в редакторе: прогресс (монеты, уровень, участки, рюкзак) остаётся,
      // а деревья, камни, тропинки и постройки — как на новой карте
      const sameMap = (saved.map || null) === (w.mapId || null);
      if (!sameMap) { delete this.st.paths; delete this.st.pos; delete this.st.movedBeds; delete this.st.fruit; delete this.st.plants; delete this.st.wild; }
      if (saved.objects && saved.v !== 2 && sameMap) w.importObjects(saved.objects);
      if (saved.chunks) for (const c of saved.chunks) w.unlocked[c] = 1;
      // грядки переносили: стартовые клетки — трава, все грядки берём из сохранения
      if (this.st.movedBeds) for (const i of w.startBeds) w.tiles[i] = T.GRASS;
      // тропинки переставляли: берём их из сохранения
      if (this.st.paths) {
        for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === T.PATH) w.tiles[i] = T.GRASS;
        for (const i of this.st.paths) if (w.tiles[i] === T.GRASS && w.occ[i] < 0) w.tiles[i] = T.PATH;
      }
      for (const [i, crop, p, wt] of saved.beds || []) {
        if (!sameMap && w.tiles[i] !== T.SOIL && (w.tiles[i] !== T.GRASS || w.occ[i] >= 0)) continue; // на новой карте здесь вода/дерево
        w.tiles[i] = T.SOIL;
        this.bedAt(i).crop = crop || null; this.bedAt(i).p = p; this.bedAt(i).w = wt;
      }
      if (!sameMap) for (const i of w.startBeds) this.bedAt(i); // грядки новой карты
      if (saved.player && w.walkable(saved.player[0], saved.player[1])) [px, py] = saved.player;
      // рост и энергия за время отсутствия
      const away = Math.max(0, (Date.now() - (saved.t || Date.now())) / 1000);
      if (away > 0) this.grow(away);
      this.awaySec = away;
    } else {
      for (const i of w.startBeds) this.bedAt(i);
      // одна грядка уже посажена — сразу видно, как всё работает
      // и уже созрела: первое задание — собрать её
      if (w.startBeds.length) { const b = this.bedAt(w.startBeds[0]); b.crop = 'carrot'; b.p = CROPS.carrot.time; b.w = 2; }
      this.st.can = 2;
    }
    // стартовые грядки: если игрок их не переносил — на месте всегда (как раньше)
    if (!this.st.movedBeds) for (const i of w.startBeds) if (w.tiles[i] !== T.SOIL) w.tiles[i] = T.SOIL;
    // переставленные постройки
    const pos = this.st.pos || {};
    // сначала снимаем все свои постройки (новое место дома может быть старым местом колодца), потом ставим
    const own = [w.objects.find((o) => o && o.type === 'house'), w.well].filter(Boolean);
    const home = own.map((o) => [o.gx, o.gy]);
    for (const o of own) w.lift(o);
    own.forEach((o, k) => {
      const at = pos[o.type];
      if (at && w.freeFor(o, at[0], at[1])) w.put(o, at[0], at[1]);
      else if (w.freeFor(o, home[k][0], home[k][1])) w.put(o, home[k][0], home[k][1]);
      // иначе объект остался снятым: колодец найдёт место сам (fixWell)
    });
    w.fixWell();
    this.restorePlants();
    this.restoreWild();
    Flora.tidyFruit(this.st, Date.now());
    this.floraTick(Date.now());
    // старые сохранения: первое задание ещё не выполнено — стартовая морковка созревает сразу
    if (saved && !this.st.stats.harvested && !(this.st.quest && this.st.quest.i > 0)) {
      const b = this.beds.get(w.startBeds[0]);
      if (b && b.crop === 'carrot') { b.p = CROPS.carrot.time; b.w = 2; }
    }
    this.player = new Player(w, makeGhostData(), px, py);
    this.wildTick(Date.now(), true); // поросль за время отсутствия
    this.player.handlers = {
      canStart: (a) => this.canStart(a),
      perform: (a) => this.perform(a),
      started: (a) => { if (a.kind === 'fish') this.sfx('cast'); },
      fail: (a, why) => this.toast(why === 'path' ? 'Туда не пройти' : 'Не получается'),
    };
    this.updateBounds();
    this.player.worldPos(tmp);
    this.cam.centerOn(tmp.x, tmp.y - 20);
    this.tickEnergy();
    this.syncHint();
    this.ui.update(this);
  }

  // Посаженные игроком растения → объекты на карте (место занято — растение пропадает)
  restorePlants() {
    const w = this.world, now = Date.now(), keep = [];
    for (const p of this.st.plants || []) {
      const [x, y, sp, born] = p;
      if (!FLORA[sp]) continue;
      const grown = Flora.plantStage(sp, born, now) >= 2;
      const o = w.isOpen(x, y) && w.add(grown ? sp : 'sapling', x, y);
      if (!o) continue;
      o.own = 1; o.tree = sp; o.born = born;
      keep.push(p);
    }
    if (this.st.plants) this.st.plants = keep;
  }

  // Дикая поросль из сохранения → объекты на карте (место занято — пропадает)
  restoreWild() {
    const W = this.st.wild;
    if (!W) return;
    W.list = W.list.filter((e) => !!this.placeWild({ x: e[0], y: e[1], kind: e[2], born: e[3] }));
  }

  // Поставить дикую траву, куст или дерево (растение — ростком, если ещё не выросло).
  placeWild(ev) {
    const w = this.world, sp = ev.kind;
    if (sp !== 'grass' && !FLORA[sp]) return null;
    if (!w.isOpen(ev.x, ev.y)) return null;
    const grown = sp !== 'grass' && Flora.plantStage(sp, ev.born, Date.now()) >= 2;
    const o = w.add(sp === 'grass' ? 'grass' : grown ? sp : 'sapling', ev.x, ev.y);
    if (!o) return null;
    o.wild = 1;
    if (sp !== 'grass') { o.tree = sp; o.born = ev.born; o.stage = grown ? 2 : 0; }
    w.version++;
    return o;
  }

  // Раз в секунду (и при входе): не пора ли вырасти новой траве, ростку куста или саженцу у тумана
  wildTick(now, quiet) {
    const p = this.player;
    const blocked = p ? (x, y) => Math.abs(x - p.tx) <= 1 && Math.abs(y - p.ty) <= 1 : null;
    const ctx = { now, rng: Math.random, blocked, reach: p && this.reachFn(), place: (ev) => !!this.placeWild(ev) };
    const out = Wild.wildTick(this.st, this.world, ctx).concat(Wild.treeTick(this.st, this.world, ctx));
    if (!out.length) return;
    if (!quiet) for (const ev of out) { toWorld(ev.x + 0.5, ev.y + 0.5, tmp); this.burst(tmp.x, tmp.y - 6, '#7ccf4f', 6, true); }
    this.syncBars(now);
    this.save.schedule(() => this.serialize());
  }

  // Куда призрак может подойти: клетка рядом с проходимой, до которой есть путь от него.
  // Считается лениво (только когда пора что-то вырастить) и заново после каждого появления.
  reachFn() {
    const w = this.world, p = this.player;
    let seen = null, ver = -1;
    const fill = () => {
      seen = new Uint8Array(N * N); ver = w.version;
      const q = [p.ty * N + p.tx]; seen[q[0]] = 1;
      while (q.length) {
        const i = q.pop(), x = i % N, y = (i / N) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, j = ny * N + nx;
          if (w.inside(nx, ny) && !seen[j] && w.walkable(nx, ny)) { seen[j] = 1; q.push(j); }
        }
      }
    };
    return (x, y) => {
      if (!seen || ver !== w.version) fill();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && w.inside(nx, ny) && seen[ny * N + nx]) return true; }
      return false;
    };
  }

  // Раз в секунду: какие растения без плодов (другая картинка) и какие ростки подросли
  floraTick(now) {
    const w = this.world, st = this.st;
    let changed = false;
    for (const o of w.objects) {
      if (!o) continue;
      if (o.type === 'sapling') {
        const stage = Flora.plantStage(o.tree, o.born, now);
        if (stage >= 2) { o.type = o.tree; o.hp = OBJECTS[o.type].hp; o.stage = 2; changed = true; this.burst(o.wx, o.wy - 20, '#7ccf4f', 10, true); }
        else if (o.stage !== stage) { o.stage = stage; changed = true; }
      }
      if (FLORA[o.type]) {
        const bare = !!FLORA[o.type].pick && Flora.fruitLeft(st, o, now) > 0;
        if (o.bare !== bare) { o.bare = bare; changed = true; }
      }
    }
    if (changed) w.version++;
    this.syncBars(now);
  }

  // Полоски времени роста: над поливаемыми грядками, ростками и растениями, у которых отрастают плоды.
  // Считаются раз в секунду (и сразу после действия), рисуют их сцены. this.bars — подряд по 4 числа:
  // x, y (мир), доля готовности 0..1, вид (BAR_KIND). Пустые/готовые — без полоски.
  syncBars(now = Date.now()) {
    const B = this.bars || (this.bars = []), st = this.st;
    B.length = 0;
    for (const b of this.beds.values()) {
      if (!b.crop) continue;
      const fl = this.cropFlags(b);
      if (fl & 12) continue; // созрело или ждёт полива — там уже значок
      B.push(b.wx, b.wy - 26, b.p / CROPS[b.crop].time, BAR_KIND.crop);
    }
    for (const o of this.world.objects) {
      if (!o || !this.world.isOpen(o.gx, o.gy)) continue;
      let k = 0, kind = -1;
      if (o.type === 'sapling' && FLORA[o.tree] && o.born) {
        k = 1 - Flora.growLeft(o.tree, o.born, now) / FLORA[o.tree].grow; kind = BAR_KIND.grow;
      } else if (o.bare && FLORA[o.type]) {
        k = 1 - Flora.fruitLeft(st, o, now) / FLORA[o.type].regrow; kind = BAR_KIND.fruit;
      }
      if (kind < 0) continue;
      const s = this.objSprite(o);
      B.push(o.wx, o.wy - barTop(s), Math.max(0, Math.min(1, k)), kind);
    }
    this.barsV = (this.barsV || 0) + 1;
  }

  serialize() {
    const beds = [];
    for (const b of this.beds.values()) if (this.world.tiles[b.i] === T.SOIL) beds.push([b.i, b.crop || '', Math.round(b.p), b.w]);
    const chunks = [];
    this.world.unlocked.forEach((u, i) => u && chunks.push(i));
    return {
      v: 3, seed: this.world.seed, map: this.world.mapId || undefined, st: this.st, objects: this.world.exportObjects(), chunks, beds,
      player: [this.player.tx, this.player.ty],
    };
  }

  changed() { this.syncBars(); this.quests.check(); this.syncHint(); this.ui.update(this); this.save.schedule(() => this.serialize()); }

  // Подсказка к заданию (hints.js): куда показать стрелку. Считается после каждого действия и раз
  // в секунду; this.hint — цель или null, hintV растёт, когда цель сменилась (сцена начинает новый прыжок).
  syncHint() {
    const Q = this.quests, p = this.player;
    const h = this.editor || !p ? null : Hints.questHint(Q.current, Q.done,
      { st: this.st, world: this.world, beds: this.beds, px: p.tx, py: p.ty, now: Date.now() }, this.hint);
    if (!Hints.sameHint(h, this.hint)) this.hintV = (this.hintV || 0) + 1;
    this.hint = h;
    this.ui.hint(h && h.kind === 'ui' ? h.ui : null);
  }

  // Точка цели подсказки в мире (основание объекта, середина клетки или участка)
  hintPoint(h, out) {
    if (h.kind === 'obj') { out.x = h.obj.wx; out.y = h.obj.wy; return out; }
    return h.kind === 'chunk' ? toWorld(h.x, h.y, out) : toWorld(h.x + 0.5, h.y + 0.5, out);
  }

  // Нажали на кружок подсказки у края экрана: камера плавно едет к цели
  toHint() {
    const h = this.hint;
    if (!h || h.kind === 'ui') return;
    this.hintPoint(h, tmp);
    this.cam.glideTo(tmp.x, tmp.y - 24);
    this.sfx('tap');
  }

  bedAt(i) {
    let b = this.beds.get(i);
    if (!b) {
      const x = i % N, y = (i / N) | 0;
      toWorld(x + 0.5, y + 0.5, tmp);
      b = { i, x, y, crop: null, p: 0, w: 0, wx: tmp.x, wy: tmp.y, dr: null };
      b.dr = { kind: 'c', depth: x + y + 1, wy: tmp.y, bed: b };
      this.beds.set(i, b);
    }
    return b;
  }

  // правила грядок — в beds.js
  cropInfo(b) { return Beds.cropInfo(b); }

  // то же, что cropInfo, без создания объекта (для каждого кадра): стадия | готово<<2 | нужен полив<<3
  cropFlags(b) { return Beds.cropFlags(b); }

  grow(dt) {
    for (const b of this.beds.values()) {
      if (!b.crop) continue;
      const total = CROPS[b.crop].time;
      const limit = b.w >= 2 ? total : b.w >= 1 ? total * 2 / 3 : 0;
      if (b.p < limit) b.p = Math.min(limit, b.p + dt);
    }
  }

  get maxEnergy() { return HOUSE[this.st.house].energy; }
  get canMax() { return HOUSE[this.st.house].can; }

  tickEnergy() {
    const st = this.st, now = Date.now(), period = ENERGY_REGEN_SEC * 1000;
    if (st.energy >= this.maxEnergy) { st.energyAt = now; return; }
    const gain = Math.floor((now - st.energyAt) / period);
    if (gain > 0) {
      st.energy = Math.min(this.maxEnergy, st.energy + gain);
      st.energyAt += gain * period;
      if (st.energy >= this.maxEnergy) st.energyAt = now;
      this.ui.update(this);
    }
  }

  energyLeftSec() { return Math.ceil((ENERGY_REGEN_SEC * 1000 - (Date.now() - this.st.energyAt)) / 1000); }

  spend(cost) {
    if (this.st.energy < cost) { this.toast('Не хватает энергии. Съешьте что-нибудь из рюкзака или подождите.', 'warn'); return false; }
    if (this.st.energy >= this.maxEnergy) this.st.energyAt = Date.now();
    this.st.energy -= cost;
    return true;
  }

  addItem(id, n) {
    const add = Inv.addItem(this.st, id, n);
    if (add < n) this.toast('Склад полон. Улучшите дом, чтобы хранить больше.', 'warn');
    return add;
  }

  addXp(n) {
    const st = this.st;
    st.xp += n;
    while (st.xp >= xpToNext(st.level)) {
      st.xp -= xpToNext(st.level);
      st.level++;
      st.gems += 1;
      st.coins += st.level * 10;
      const opened = Object.values(CROPS).filter((c) => c.level === st.level).map((c) => c.name);
      this.ui.levelUp(st.level, opened, st.level * 10);
      this.sfx('level');
      this.player.celebrate();
    }
  }

  // ---------------- Ввод ----------------

  onTap(sx, sy) {
    this.ui.closePopup();
    if (this.scene && this.scene.hintHit(sx, sy)) return this.toHint(); // кружок подсказки у края экрана
    this.cam.screenToWorld(sx, sy, tmp);
    toGrid(tmp.x, tmp.y, tmp2);
    const gx = Math.floor(tmp2.x), gy = Math.floor(tmp2.y);
    this.tapFx = { x: gx, y: gy, t: 0.35 };
    if (this.mover.active) return this.mover.tap(gx, gy, tmp.x, tmp.y, sx, sy);
    // объект в выделенной клетке важнее спрайта, который её перекрывает сверху
    const w = this.world;
    let o = w.objectAt(gx, gy);
    if (!o) {
      o = this.pick(tmp.x, tmp.y);
      // крона соседнего дерева над открытой клеткой: если дерево за забором или под пальцем вода —
      // важнее сама клетка (иначе вместо пруда открывалось «Новый участок»)
      if (o && w.inside(gx, gy) && w.isOpen(gx, gy) && (!w.isOpen(o.gx, o.gy) || w.tile(gx, gy) === T.WATER)) o = null;
    }
    if (o) this.tapObject(o, sx, sy);
    else this.tapTile(gx, gy, sx, sy);
  }

  onHover(sx, sy) {
    if (sx < 0) { this.hover = null; return; }
    this.cam.screenToWorld(sx, sy, tmp);
    toGrid(tmp.x, tmp.y, tmp2);
    this.hover = { x: Math.floor(tmp2.x), y: Math.floor(tmp2.y) };
  }

  // Объект, чья картинка под точкой мира (wx, wy): крона дерева, крыша дома. Из нескольких —
  // ближний к зрителю (рисуется поверх). Рамка уже картинки: прозрачные края кроны не должны
  // перехватывать нажатия по соседним клеткам.
  pick(wx, wy) {
    let best = null;
    for (const o of this.world.objects) {
      if (!o) continue;
      const s = this.objSprite(o);
      const big = o.type === 'house' || o.type === 'boulder';
      const kx = big ? 0.9 : 0.62;
      const hit = wx >= o.wx - s.ax * kx && wx <= o.wx + (s.w - s.ax) * kx &&
        wy >= o.wy - s.ay * 0.92 && wy <= o.wy + (big ? (s.h - s.ay) * 0.8 : 6);
      if (hit && (!best || o.depth > best.depth || (o.depth === best.depth && o.wy > best.wy))) best = o;
    }
    return best;
  }

  tapObject(o, sx, sy) {
    const w = this.world;
    if (!w.isOpen(o.gx, o.gy)) return this.expandPopup(w.chunkOf(o.gx, o.gy), sx, sy);
    if (o.type === 'house') return this.ui.housePanel(this);
    if (o.type === 'well') return this.wellPopup(o, sx, sy);
    const def = OBJECTS[o.type];
    if (!def) return;
    if (o.type === 'sapling' || def.flora) return this.floraPopup(o, sx, sy);
    if (def.action) this.queue({ kind: def.action, obj: o });
  }

  // Дерево или куст: собрать плоды / срубить. Дикое без плодов рубится сразу, как раньше.
  floraPopup(o, sx, sy) {
    const now = Date.now();
    if (o.type === 'sapling') {
      const f = FLORA[o.tree];
      return this.ui.popup(sx, sy, {
        title: `Росток: ${f.name.toLowerCase()}`, text: `Вырастет через ${fmtTime(Flora.growLeft(o.tree, o.born, now))}`,
        items: o.own ? [] : [{ icon: 'dig', label: 'Выкопать', sub: `⚡ ${ENERGY.chop}`, onClick: () => this.queue({ kind: 'chop', obj: o }) }],
        ...(o.own ? { text: `Вырастет через ${fmtTime(Flora.growLeft(o.tree, o.born, now))}. Убрать в рюкзак: «Ещё» → «Переставить»` } : {}),
      });
    }
    // собирать касанием можно только плоды и ягоды (pick); кора, шишки, цветы — только рубкой
    const f = FLORA[o.type], left = f.pick ? Flora.fruitLeft(this.st, o, now) : 0, fruit = FLORA_GOODS[f.fruit];
    const ripe = f.pick && !left;
    // дикое без сбора рубится сразу; плодовое, пока плоды отрастают, — меню «Срубить» и время до урожая
    if (!f.pick && !o.own) return this.queue({ kind: 'chop', obj: o });
    const items = [];
    if (ripe) items.push({ icon: f.fruit, label: `Собрать: ${fruit.name.toLowerCase()}`, sub: `⚡ ${ENERGY.pick}`, onClick: () => this.queue({ kind: 'pick', obj: o }) });
    items.push({ icon: 'wood', label: o.own ? 'Срубить своё' : 'Срубить', sub: `⚡ ${ENERGY.chop} за удар`, onClick: () => this.queue({ kind: 'chop', obj: o }) });
    this.ui.popup(sx, sy, {
      title: (o.own ? 'Моё: ' : '') + f.name, text: left ? `Следующий урожай (${fruit.name.toLowerCase()}) через ${fmtTime(left)}` : !f.pick ? `${fruit.name}: только при рубке` : undefined, items,
    });
  }

  // Посадить своё растение из рюкзака на свободную траву: саженец — ростком, выкопанное — сразу взрослым.
  // → объект на карте или null (нет предмета)
  plantOwn(species, x, y, grown) {
    const st = this.st, w = this.world, now = Date.now();
    if (!(grown ? Flora.sowGrown : Flora.sow)(st, species, x, y, now)) return null;
    const o = w.add(grown ? species : 'sapling', x, y);
    o.own = 1; o.tree = species; o.born = st.plants[st.plants.length - 1][3]; o.stage = grown ? 2 : 0;
    if (grown && FLORA[species].pick) { o.bare = true; w.version++; }
    return o;
  }

  // Свободная трава: что можно посадить из рюкзака (саженцы деревьев и отростки кустов)
  sowPopup(x, y, sx, sy) {
    const st = this.st;
    const grown = [], items = [];
    for (const f of Object.values(FLORA)) {
      const own = Inv.count(st, floraOwnId(f.key)), sap = Inv.count(st, floraSeedId(f.key));
      // свои выкопанные — первыми: встают сразу взрослыми
      if (own) grown.push({ icon: floraOwnId(f.key), label: `${f.name}, взрослое`, sub: `есть: ${own} · сразу`, onClick: () => this.queue({ kind: 'sow', x, y, species: f.key, grown: true }) });
      if (sap) items.push({ icon: floraSeedId(f.key), label: f.name, sub: `есть: ${sap} · ${fmtTime(f.grow)}`, onClick: () => this.queue({ kind: 'sow', x, y, species: f.key }) });
    }
    this.ui.popup(sx, sy, { title: 'Что посадить?', items: [...grown, ...items], wide: true });
  }

  tapTile(x, y, sx, sy) {
    const w = this.world;
    if (!w.inside(x, y)) return;
    if (!w.isOpen(x, y)) return this.expandPopup(w.chunkOf(x, y), sx, sy);
    const t = w.tile(x, y);
    if (t === T.WATER) {
      return this.ui.popup(sx, sy, { items: [
        { icon: 'water', label: 'Набрать воды', sub: `${this.st.can}/${this.canMax}`, disabled: this.st.can >= this.canMax, onClick: () => this.queue({ kind: 'fill', x, y }) },
        { icon: 'fish', label: 'Рыбачить', sub: `⚡ ${ENERGY.fish}`, onClick: () => this.queue({ kind: 'fish', x, y }) },
      ] });
    }
    if (t === T.SOIL) return this.tapBed(this.bedAt(w.idx(x, y)), sx, sy);
    if (w.occ[w.idx(x, y)] >= 0) return;
    const items = [{ icon: 'walk', label: 'Идти сюда', onClick: () => this.queue({ kind: 'walk', x, y }) }];
    if (t === T.GRASS) items.push({ icon: 'dig', label: 'Вскопать грядку', sub: `⚡ ${ENERGY.dig}`, onClick: () => this.queue({ kind: 'dig', x, y }) });
    if (t === T.GRASS && Object.keys(FLORA).some((k) => Inv.count(this.st, floraSeedId(k)) || Inv.count(this.st, floraOwnId(k)))) {
      items.push({ icon: 'seed', label: 'Посадить дерево или куст', onClick: () => setTimeout(() => this.sowPopup(x, y, sx, sy), 0) });
    }
    // одно действие (например, дорожка: только «идти») — выполняем сразу, без меню
    if (items.length === 1) { this.ui.closePopup(); return items[0].onClick(); }
    this.ui.popup(sx, sy, { items });
  }

  wellPopup(o, sx, sy) {
    if (this.st.well) {
      return this.ui.popup(sx, sy, { title: 'Колодец', items: [
        { icon: 'water', label: 'Набрать воды', sub: `${this.st.can}/${this.canMax}`, disabled: this.st.can >= this.canMax, onClick: () => this.queue({ kind: 'fill', x: o.gx, y: o.gy }) },
      ] });
    }
    this.ui.popup(sx, sy, {
      title: 'Старый колодец', text: 'Бабушкин колодец развалился. Если починить, воду можно будет набирать прямо у грядок.',
      cost: WELL_COST, items: [{ icon: 'water', label: 'Починить', disabled: !this.canPay(WELL_COST), onClick: () => this.repairWell() }],
    });
  }

  repairWell() {
    const o = this.world.well;
    if (!o || this.st.well || !this.pay(WELL_COST)) return false;
    this.st.well = 1;
    this.burst(o.wx, o.wy - 20, '#9fd8f5', 20);
    this.float(o.wx, o.wy - 60, 'Колодец починен!', null);
    this.sfx('unlock');
    this.addXp(5);
    this.player.celebrate();
    this.changed();
    return true;
  }

  isWell(x, y) { const o = this.world.well; return !!o && this.st.well > 0 && o.gx === x && o.gy === y; }

  tapBed(b, sx, sy) {
    if (!b.crop) return this.seedPopup(b, sx, sy);
    const info = this.cropInfo(b);
    if (info.ready) return this.queue({ kind: 'harvest', x: b.x, y: b.y });
    if (info.needsWater) return this.queue({ kind: 'water', x: b.x, y: b.y });
    const gems = Math.max(1, Math.ceil(info.left / GEM_SPEEDUP_SEC));
    this.ui.popup(sx, sy, {
      title: info.c.name, text: `Созреет через ${fmtTime(info.left)}`,
      items: [{ icon: 'gem', label: 'Ускорить', sub: `${gems} ${this.ui.ic('gem', 'ic ic-s')}`, disabled: this.st.gems < gems, onClick: () => {
        this.st.gems -= gems; b.p = info.total; b.w = 2; this.burst(b.wx, b.wy - 8, '#ffe066', 10); this.changed();
      } }],
    });
  }

  seedPopup(b, sx, sy) {
    const st = this.st;
    const items = Object.values(CROPS).filter((c) => c.level <= st.level + 1).map((c) => {
      const locked = c.level > st.level;
      const have = Inv.count(st, seedId(c.key));
      return {
        icon: c.key, label: c.name,
        sub: locked ? `с ${c.level} ур.` : have ? `семян: ${have} · ${fmtTime(c.time)}` : `${c.seed} ${this.ui.ic('coin', 'ic ic-s')} · ${fmtTime(c.time)}`,
        disabled: locked || (!have && st.coins < c.seed),
        onClick: () => this.queue({ kind: 'plant', x: b.x, y: b.y, crop: c.key }),
      };
    });
    this.ui.popup(sx, sy, { title: 'Что посадить?', items, wide: true });
  }

  expandPopup(c, sx, sy) {
    const w = this.world;
    if (!w.canUnlock(c)) return this.toast('Сначала откройте соседний участок');
    const n = w.unlockedCount();
    const limit = HOUSE[this.st.house].chunks;
    if (n >= limit) {
      const need = HOUSE.findIndex((h, i) => h && i > this.st.house && h.chunks > n);
      return this.ui.popup(sx, sy, { title: 'Новый участок', text: `Улучшите дом до ${need} уровня, чтобы расширить ферму.`, items: [{ icon: 'house', label: 'К дому', onClick: () => this.ui.housePanel(this) }] });
    }
    const cost = expansionCost(n);
    this.ui.popup(sx, sy, {
      title: 'Новый участок', text: 'Расчистите его, чтобы получить ресурсы и место для грядок.',
      cost, items: [{ icon: 'lock', label: 'Открыть участок', disabled: !this.canPay(cost), onClick: () => this.unlockChunk(c, cost) }],
    });
  }

  canPay(cost) {
    const st = this.st;
    for (const [k, v] of Object.entries(cost)) {
      const have = k === 'coins' ? st.coins : k === 'gems' ? st.gems : Inv.count(st, k);
      if (have < v) return false;
    }
    return true;
  }

  pay(cost) {
    if (!this.canPay(cost)) return false;
    for (const [k, v] of Object.entries(cost)) {
      if (k === 'coins') this.st.coins -= v; else if (k === 'gems') this.st.gems -= v; else Inv.takeItem(this.st, k, v);
    }
    return true;
  }

  unlockChunk(c, cost) {
    if (!this.pay(cost)) return;
    const w = this.world;
    w.unlocked[c] = 1; w.version++;
    this.updateBounds();
    const cx = c % CHUNKS, cy = (c / CHUNKS) | 0;
    toWorld(cx * CHUNK + CHUNK / 2, cy * CHUNK + CHUNK / 2, tmp);
    this.burst(tmp.x, tmp.y - 10, '#ffe066', 24);
    this.float(tmp.x, tmp.y - 30, 'Новый участок!', null);
    this.quests.emit('expand');
    this.sfx('unlock');
    this.addXp(10);
    this.changed();
  }

  upgradeHouse() {
    const next = HOUSE[this.st.house + 1];
    if (!next || this.world.unlockedCount() < houseNeedChunks(this.st.house)) return false;
    if (!this.pay(next.cost)) return false;
    const oldMax = this.maxEnergy;
    this.st.house++;
    this.st.energy += this.maxEnergy - oldMax;
    const h = this.world.objects.find((o) => o && o.type === 'house');
    if (h) { this.burst(h.wx, h.wy - 40, '#ffe066', 30); this.float(h.wx, h.wy - 110, `Дом ${this.st.house} ур.`, null); }
    this.addXp(20);
    this.sfx('unlock');
    this.player.celebrate();
    this.changed();
    return true;
  }

  sell(key, n) {
    const r = Inv.sellItem(this.st, key, n);
    if (!r) return;
    this.quests.emit('sell', key, r.n);
    this.sfx('coin');
    this.changed();
  }

  buy(offer, n) {
    const r = Inv.buyItem(this.st, offer, n);
    if (!r) return;
    if (r.locked) return this.toast(`Откроется с ${offer.level} уровня`, 'warn');
    if (r.poor) return this.toast(r.poor === 'gems' ? 'Не хватает кристаллов' : 'Не хватает монет', 'warn');
    this.quests.emit('buy', r.id, r.n);
    this.sfx('coin');
    this.changed();
  }

  eat(key) {
    const r = Inv.eatItem(this.st, key, this.maxEnergy);
    if (!r) return;
    if (r.full) return this.toast('Энергия уже полная');
    this.sfx('eat');
    this.changed();
  }

  queue(a) {
    if (this.mover.active) return;
    if (!this.player.enqueue(a)) { this.toast('Очередь заполнена'); return; }
    this.sfx('tap');
  }

  toast(msg, kind) { this.ui.toast(msg, kind); if (kind === 'warn') this.sfx('error'); }

  sfx(name) { if (this.audio) this.audio.play(name); }

  // ---------------- Выполнение действий ----------------

  nearestWater() {
    const w = this.world, p = this.player;
    let best = null, bd = Infinity;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (w.tiles[y * N + x] !== T.WATER || !w.isOpen(x, y)) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    const o = w.well;
    if (o && this.st.well > 0 && w.isOpen(o.gx, o.gy) && Math.hypot(o.gx - p.x, o.gy - p.y) < bd) best = { x: o.gx, y: o.gy };
    return best;
  }

  canStart(a) {
    const w = this.world, st = this.st;
    if (a.obj) {
      if (w.objects[a.obj.id] !== a.obj) return false;
      const def = OBJECTS[a.obj.type];
      if (a.kind === 'pick') { if (!Flora.hasFruit(st, a.obj, Date.now())) return false; }
      else if (def.action !== a.kind) return false;
    }
    const cost = ENERGY[a.kind] || 0;
    if (cost && st.energy < cost) { this.spend(cost); this.player.queue.length = 0; return false; }
    const t = a.obj ? -1 : w.tile(a.x, a.y);
    switch (a.kind) {
      case 'dig': return t === T.GRASS && w.occ[w.idx(a.x, a.y)] < 0;
      case 'sow': return t === T.GRASS && w.occ[w.idx(a.x, a.y)] < 0 && Inv.count(st, (a.grown ? floraOwnId : floraSeedId)(a.species)) > 0;
      case 'plant': {
        const b = this.bedAt(w.idx(a.x, a.y));
        if (t !== T.SOIL || b.crop) return false;
        if (!Inv.count(st, seedId(a.crop)) && st.coins < CROPS[a.crop].seed) { this.toast('Не хватает монет на семена', 'warn'); return false; }
        return true;
      }
      case 'water': {
        const b = this.bedAt(w.idx(a.x, a.y));
        if (!b.crop || !this.cropInfo(b).needsWater) return false;
        if (st.can <= 0) {
          const wt = this.nearestWater();
          if (!wt) { this.toast('Рядом нет воды', 'warn'); return false; }
          this.player.pushFront(a);
          this.player.pushFront({ kind: 'fill', x: wt.x, y: wt.y });
          return false;
        }
        return true;
      }
      case 'harvest': { const b = this.bedAt(w.idx(a.x, a.y)); return !!b.crop && this.cropInfo(b).ready; }
      case 'fill':
        if (st.can >= this.canMax) { this.toast('Лейка уже полная'); return false; }
        return t === T.WATER || this.isWell(a.x, a.y);
      case 'fish': return t === T.WATER;
    }
    return true;
  }

  perform(a) {
    const w = this.world, st = this.st;
    switch (a.kind) {
      case 'chop': case 'mine': {
        const o = a.obj;
        if (w.objects[o.id] !== o || !this.spend(1)) return false;
        o.hp--; o.shake = 0.25;
        if (o.hp > 0) this.sfx(a.kind === 'chop' ? 'chop' : 'mine');
        const s = this.objSprite(o);
        const od = OBJECTS[o.type];
        const hy = o.type === 'stump' || o.type === 'rock' || o.type === 'sapling' || od.bush ? 8 : o.type === 'boulder' ? 20 : 26;
        this.burst(o.wx, o.wy - hy, a.kind === 'chop' ? '#b07a45' : '#b8bec3', 6);
        if (a.kind === 'chop' && o.type !== 'stump' && o.type !== 'sapling') this.burst(o.wx, o.wy - 60, '#5aa83a', 4, true);
        if (o.hp <= 0) { this.destroy(o); this.changed(); return false; }
        this.ui.update(this);
        return st.energy >= 1;
      }
      case 'pick': {
        const o = a.obj, now = Date.now();
        if (w.objects[o.id] !== o) return false;
        const r = Flora.pickFruit(st, o, now, Math.random);
        if (!r) { this.toast('Склад полон', 'warn'); return false; }
        this.spend(ENERGY.pick);
        this.dropFx(o, r.items);
        o.bare = true; w.version++;
        this.burst(o.wx, o.wy - 30, FLORA_GOODS[FLORA[o.type].fruit].color, 8, true);
        this.quests.emit('pick', FLORA[o.type].fruit);
        this.sfx('harvest');
        this.addXp(r.xp);
        this.changed();
        return false;
      }
      case 'mow': {
        const o = a.obj;
        if (w.objects[o.id] !== o) return false;
        const r = Wild.mowGrass(st, o.gx, o.gy, Math.random);
        this.dropFx(o, r.items);
        this.burst(o.wx, o.wy - 10, '#8fd35c', 10, true);
        this.sfx('harvest');
        if (r.xp) this.addXp(r.xp);
        w.remove(o);
        this.changed();
        return false;
      }
      case 'sow': {
        const i = w.idx(a.x, a.y);
        if (w.tiles[i] !== T.GRASS || w.occ[i] >= 0) return false;
        const o = this.plantOwn(a.species, a.x, a.y, a.grown);
        if (!o) return false;
        this.burst(o.wx, o.wy, '#7ccf4f', 8);
        this.quests.emit('sow', a.species);
        this.sfx('plant');
        this.addXp(1);
        this.changed();
        return false;
      }
      case 'dig': {
        if (w.tiles[w.idx(a.x, a.y)] !== T.GRASS || w.occ[w.idx(a.x, a.y)] >= 0) return false;
        if (!this.spend(ENERGY.dig)) return false;
        w.tiles[w.idx(a.x, a.y)] = T.SOIL; this.groundV++;
        const b = this.bedAt(w.idx(a.x, a.y)); b.crop = null; b.p = 0; b.w = 0;
        this.burst(b.wx, b.wy, '#8a5a30', 8);
        this.quests.emit('dig');
        this.sfx('dig');
        this.addXp(1);
        this.changed();
        return false;
      }
      case 'plant': {
        if (w.tiles[w.idx(a.x, a.y)] !== T.SOIL) return false;
        const b = this.bedAt(w.idx(a.x, a.y)), c = CROPS[a.crop];
        if (Inv.takeItem(st, seedId(a.crop), 1)) { /* свои семена */ } else if (st.coins >= c.seed) st.coins -= c.seed; else return false;
        b.crop = a.crop; b.p = 0; b.w = 0;
        this.burst(b.wx, b.wy, '#7ccf4f', 6);
        this.quests.emit('plant', a.crop);
        this.sfx('plant');
        this.addXp(1);
        this.changed();
        return false;
      }
      case 'water': {
        if (w.tiles[w.idx(a.x, a.y)] !== T.SOIL) return false;
        const b = this.bedAt(w.idx(a.x, a.y));
        if (st.can <= 0 || !this.spend(ENERGY.water)) return false;
        st.can--; b.w++;
        this.quests.emit('water');
        this.sfx('water');
        this.burst(b.wx, b.wy - 6, '#6fc2ff', 10);
        this.changed();
        return false;
      }
      case 'fill': {
        st.can = this.canMax;
        toWorld(a.x + 0.5, a.y + 0.5, tmp);
        this.burst(tmp.x, tmp.y, '#9fd8f5', 8);
        this.float(tmp.x, tmp.y - 20, `${st.can}`, 'water');
        this.sfx('fill');
        this.changed();
        return false;
      }
      case 'fish': {
        if (!this.spend(ENERGY.fish)) return false;
        toWorld(a.x + 0.5, a.y + 0.5, tmp);
        this.burst(tmp.x, tmp.y - 2, '#bfe6ff', 10);
        if (Math.random() > FISH_CATCH) { this.float(tmp.x, tmp.y - 20, 'Сорвалась!', null); this.sfx('splash'); this.changed(); return false; }
        const list = Object.values(FISH), total = list.reduce((s, f) => s + f.chance, 0);
        let r = Math.random() * total, fish = list[0];
        for (const f of list) { if ((r -= f.chance) < 0) { fish = f; break; } }
        const got = this.addItem(fish.key, 1);
        if (!got) return false;
        this.float(tmp.x, tmp.y - 22, `+1 ${fish.name}`, fish.key);
        this.quests.emit('fish', fish.key);
        this.sfx('catch');
        this.addXp(fish.xp);
        this.changed();
        return false;
      }
      case 'harvest': {
        if (w.tiles[w.idx(a.x, a.y)] !== T.SOIL) return false;
        const b = this.bedAt(w.idx(a.x, a.y)), c = CROPS[b.crop];
        const got = this.addItem(c.key, 1);
        if (!got) return false;
        this.float(b.wx, b.wy - 20, '+1', c.key);
        if (Math.random() < 0.25) { this.addItem(seedId(c.key), 1); this.float(b.wx + 12, b.wy - 34, '+1', 'seed'); }
        this.burst(b.wx, b.wy - 6, '#ffe066', 8);
        b.crop = null; b.p = 0; b.w = 0;
        st.stats.harvested++;
        this.quests.emit('harvest', c.key);
        this.sfx('harvest');
        this.addXp(c.xp);
        this.changed();
        return false;
      }
    }
    return false;
  }

  // Всплывающие «+N» с иконками над объектом
  dropFx(o, items) {
    let dy = -30, dx = 0;
    for (const { id, n } of items) { this.float(o.wx + dx, o.wy + dy, `+${n}`, id); dy -= 14; dx = dx ? 0 : 14; }
  }

  destroy(o) {
    const def = OBJECTS[o.type], st = this.st;
    if (o.type === 'sapling') {
      // свой росток: выкопали — саженец вернулся в рюкзак
      Flora.forget(st, o);
      this.addItem(floraSeedId(o.tree), 1);
      this.dropFx(o, [{ id: floraSeedId(o.tree), n: 1 }]);
      this.burst(o.wx, o.wy - 4, '#8a5a30', 8);
      this.sfx('dig');
      this.world.remove(o);
      return;
    }
    if (def.flora) {
      const r = Flora.chopFlora(st, o, Date.now(), Math.random);
      this.dropFx(o, r.items);
      this.addXp(def.xp || 1);
      st.stats.cleared++;
      this.quests.emit(def.stump ? 'chop' : 'clear');
      this.burst(o.wx, o.wy - 10, '#7a4b28', 12);
      this.sfx('break');
      // своё дерево уходит целиком, дикое оставляет пень
      if (def.stump && !o.own) { o.was = o.type; o.type = 'stump'; o.hp = OBJECTS.stump.hp; o.bare = false; this.world.version++; }
      else this.world.remove(o);
      return;
    }
    let dy = -30;
    for (const [res, [a, b]] of Object.entries(def.drops || {})) {
      const n = a + Math.floor(Math.random() * (b - a + 1));
      const got = this.addItem(res, n);
      if (got) { this.float(o.wx, o.wy + dy, `+${got}`, res); dy -= 14; }
    }
    if (def.oreChance && Math.random() < def.oreChance) {
      const [o0, o1] = def.ore || [1, 2], got = this.addItem('ore', o0 + Math.floor(Math.random() * (o1 - o0 + 1)));
      if (got) { this.float(o.wx + 14, o.wy + dy, `+${got}`, 'ore'); dy -= 14; }
    }
    this.addXp(def.xp || 1);
    st.stats.cleared++;
    this.quests.emit(def.stump ? 'chop' : o.type === 'stump' ? 'stump' : def.action === 'mine' ? 'mine' : 'clear');
    this.burst(o.wx, o.wy - 10, o.type === 'rock' || o.type === 'boulder' ? '#9aa1a7' : '#7a4b28', 12);
    this.sfx('break');
    if (def.stump) { o.was = o.type; o.type = 'stump'; o.hp = OBJECTS.stump.hp; this.world.version++; }
    else this.world.remove(o);
  }

  // ---------------- Эффекты ----------------

  // Рыбалка: леска от кончика удочки к поплавку на клетке воды
  // Поплавок и леска: точки для отрисовки (null — не рыбачим)
  fishingState() {
    const p = this.player, an = p.anim, a = p.current;
    if (p.state !== 'work' || !a || a.kind !== 'fish' || an.name !== 'fish' || an.time < 0.42 || an.time > 2.3) return null;
    const bn = p.sk.boneMap.foreF, ly = 3.4 + ROD_TIP;
    let x = bn.c * ly + bn.tx, y = bn.d * ly + bn.ty; if (p.flip) x = -x;
    p.worldPos(tmp); x += tmp.x; y += tmp.y;
    toWorld(a.x + 0.5, a.y + 0.5, tmp2);
    const t = an.time;
    // поплавок: летит после заброса, качается, перед подсечкой ныряет (клюёт)
    const k = Math.min(1, (t - 0.42) / 0.22);
    const bite = t > 1.72 ? Math.min(1, (t - 1.72) / 0.12) : 0;
    const yank = t > 2.12 ? (t - 2.12) / 0.18 : 0; // подсечка: поплавок выдёргивается к удочке
    let bx = x + (tmp2.x - x) * k, by = y + (tmp2.y - y) * k - Math.sin(k * Math.PI) * 14 + (k >= 1 ? Math.sin(t * 7) * 0.7 + bite * 2.4 : 0);
    if (yank) { bx += (x - bx) * yank * 0.6; by += (y - 10 - by) * yank * 0.6; }
    return { x, y, bx, by, k, bite, yank };
  }

  // Полив: пока лейка наклонена, из носика падают капли
  pourWater(dt) {
    const p = this.player, an = p.anim;
    if (p.state !== 'work' || !p.current || p.current.kind !== 'water' || an.name !== 'water') return;
    if (an.time < 0.4 || an.time > 0.84) return;
    this._pour = (this._pour || 0) + dt;
    const P = this.particles, max = this.perf.tier === 'low' ? 60 : 160;
    // носик лейки: точка на кости кисти (крепление лейки + носик в спрайте)
    const bn = p.sk.boneMap.foreF, lx = -2.6, ly = 3.6 + 14;
    let x = bn.a * lx + bn.c * ly + bn.tx, y = bn.b * lx + bn.d * ly + bn.ty;
    if (p.flip) x = -x;
    p.worldPos(tmp);
    x += tmp.x; y += tmp.y;
    while (this._pour > 0.022 && P.length < max) {
      this._pour -= 0.022;
      P.push({ x: x + (Math.random() - 0.5) * 2, y, vx: (p.flip ? -1 : 1) * (8 + Math.random() * 10), vy: 10 + Math.random() * 15,
        life: 0.3 + Math.random() * 0.12, t: 0, c: Math.random() < 0.3 ? '#d8f0ff' : '#3f9be6', s: 2 + Math.random() * 1.2, g: 320 });
    }
  }

  burst(x, y, color, n, leaves) {
    const P = this.particles;
    const max = this.perf.tier === 'low' ? 60 : 160;
    for (let i = 0; i < n && P.length < max; i++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 60;
      P.push({ x, y, vx: Math.cos(a) * sp, vy: -40 - Math.random() * 60, life: 0.5 + Math.random() * 0.4, t: 0, c: color, s: leaves ? 2.6 : 1.6 + Math.random() * 1.4, g: leaves ? 60 : 260 });
    }
  }

  float(x, y, text, icon) { this.floaters.push({ x, y, text, icon, t: 0 }); }

  updateBounds() {
    const w = this.world;
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    w.unlocked.forEach((u, c) => {
      if (!u) return;
      const cb = w.chunkBounds(c);
      b.minX = Math.min(b.minX, cb.minX); b.maxX = Math.max(b.maxX, cb.maxX);
      b.minY = Math.min(b.minY, cb.minY); b.maxY = Math.max(b.maxY, cb.maxY);
    });
    const m = this.editor ? 320 : 120; // в редакторе видно и полосу тумана
    this.cam.bounds = { minX: b.minX - m, maxX: b.maxX + m, minY: b.minY - m, maxY: b.maxY + m };
    this.cam.clamp();
  }

  // ---------------- Обновление ----------------

  update(dt) {
    this.time += dt;
    // рост — по настоящим часам: в фоне (Telegram свёрнут) кадры не идут, а грядки растут
    const now = Date.now();
    this.grow(this._wall ? Math.min(Math.max(0, (now - this._wall) / 1000), 7 * 86400) : dt);
    this._wall = now;
    this._eT = (this._eT || 0) + dt;
    if (this._eT > 1) { this._eT = 0; this.tickEnergy(); this.floraTick(now); this.wildTick(now); this.syncHint(); this.ui.tick(this); }
    this.player.update(dt);
    this.pourWater(dt);
    const OB = this.world.objects;
    for (let i = 0; i < OB.length; i++) { const o = OB[i]; if (o && o.shake > 0) o.shake = Math.max(0, o.shake - dt); }
    const P = this.particles;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t >= p.life) { P[i] = P[P.length - 1]; P.pop(); }
    }
    const F = this.floaters;
    for (let i = F.length - 1; i >= 0; i--) { F[i].t += dt; if (F[i].t > 1.3) F.splice(i, 1); }
    if (this.tapFx) { this.tapFx.t -= dt; if (this.tapFx.t <= 0) this.tapFx = null; }
  }

  isIdle() {
    // стрелка подсказки подпрыгивает изредка: только во время прыжка нужны частые кадры
    return !this.mover.active && this.player.idleTime > 2 && !this.particles.length && !this.floaters.length && !this.tapFx && !this.cam.animating && !this.hover &&
      !(this.scene && this.scene.hintMoving);
  }

  // ---------------- Отрисовка ----------------

  render() { this.scene.render(); }

  // Закрывает ли объект что-то из списка F (фермер, выделенная клетка): объект
  // должен стоять ближе к камере и пересекаться по картинке. Низкие объекты не трогаем.
  occludes(o, s, F) {
    if (s.h < 30) return 0;
    const x0 = o.wx - s.ax, y0 = o.wy - s.ay, x1 = x0 + s.w, y1 = o.wy - s.h * 0.08;
    let r = 0;
    for (const f of F) {
      f.hit = false;
      if (o.depth <= f.depth + 0.05) continue;
      if (f.gx >= o.gx && f.gx < o.gx + o.w && f.gy >= o.gy && f.gy < o.gy + o.h) continue; // сам выделенный объект
      if (x1 < f.x0 || x0 > f.x1 || y1 < f.y0 || y0 > f.y1) continue;
      f.hit = true; r = 1;
    }
    return r;
  }
}

// Половина картинки (0 — верхняя, 1 — нижняя) того же размера: кольцо вокруг цели рисуется
// задней половиной под объектом, передней — над ним
function halfOf(s, k) {
  const im = s.canvas, w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
  const c = makeCanvas(w, h), g = c.getContext('2d'), y0 = Math.round(h / 2);
  g.drawImage(im, 0, k ? y0 : 0, w, k ? h - y0 : y0, 0, k ? y0 : 0, w, k ? h - y0 : y0);
  return { ...s, canvas: c, name: s.name + (k ? '_front' : '_back') };
}

export function fmtTime(sec) {
  sec = Math.ceil(sec);
  if (sec < 60) return `${sec} с`;
  if (sec < 3600) { const m = Math.floor(sec / 60), s = sec % 60; return s ? `${m} мин ${s} с` : `${m} мин`; }
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
