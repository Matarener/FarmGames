// Ферма: состояние игрока, правила взаимодействий (тапы, очередь действий, рост, урожай, рынок)
// и набор спрайтов из картинок художника. Рисует её PixiScene, интерфейс — UI.

import { toWorld, toGrid } from '../engine/Iso.js';
import { makeCanvas } from '../engine/Sprite.js';
import { World, N, CHUNK, CHUNKS, T, pondDecorPos } from './World.js';
import { Player } from './Player.js';
import { makeGhostData, ROD_TIP } from './ghost.js';
import { loadArt } from './artSprites.js';
import { Quests } from './quests.js';
import { Gifts } from './gifts.js';
import { Wheel } from './wheel.js';
import { Buildings } from './buildings.js';
import { Tools } from './tools.js';
import { Animals, HOP } from './animals.js';
import { Achievements } from './achievements.js';
import { Orders } from './orders.js';
import { Mover } from './Mover.js';
import * as Inv from './inventory.js';
import * as Wild from './wild.js';
import * as Flora from './flora.js';
import * as Beds from './beds.js';
import * as Plant from './planting.js';
import * as Paths from './paths.js';
import * as Placed from './placed.js';
import * as Spr from './sprinklers.js';
import * as Ponds from './ponds.js';
import * as Well from './well.js';
import * as Hints from './hints.js';
import * as Chop from './chop.js';
import * as Fish from './fishRules.js';
import * as TR from './toolRules.js';
import { plural } from './questRules.js';
import { BAR_KIND, barTop } from './bars.js';
import {
  CROPS, FISH, OBJECTS, ITEMS, FLORA, FLORA_GOODS, PONDS, PATHS, SPRINKLERS, WELL_ITEM, BED_ITEM, floraSeedId, floraOwnId, seedId, WELL_COST,
  ENERGY, ENERGY_REGEN_SEC, HOUSE, START, xpToNext, expansionCost, GEM_SPEEDUP_SEC,
} from './data.js';

const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };
// сколько секунд после нажатия держится прозрачность того, что закрывает выбранное место (Farm.look)
const LOOK_HOLD = 1.2;

export const BG = '#3d7a35';

export class Farm {
  constructor({ renderer, camera, ui, tg, save, perf, audio }) {
    this.audio = audio;
    this.r = renderer; this.cam = camera; this.ui = ui; this.tg = tg; this.save = save; this.perf = perf;
    this.particles = [];
    this.floaters = [];
    this.rings = new Map(); // кольца прочности над тем, что рубят (ringTouch)
    this.hover = null;
    this.focus = [];
    this.tapFx = null;
    this.look = null; // последнее нажатие по карте: { x, y } или { obj }, t — сколько ещё держать (onTap)
    this.time = 0;
    this.quests = new Quests(this);
    this.gifts = new Gifts(this);
    this.wheel = new Wheel(this);
    this.builds = new Buildings(this); // здания с крафтом: кухня, мастерские, кузница, кормоцех
    this.tools = new Tools(this); // улучшение топора, кирки и лейки в кузнице
    this.animals = new Animals(this); // животные: кормление, рост, продукты
    this.ach = new Achievements(this);
    this.orders = new Orders(this);
    // Режим тестера (окно «Настройки»): монеты, кристаллы, предметы, энергия и проверка заданий —
    // сдвиг часов заданий и событие. Включается ?debug в адресе или нажатиями по строке версии.
    this.urlDebug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
    let tester = false;
    try { tester = localStorage.getItem('farm.tester') === '1'; } catch { /* приватный режим */ }
    this.dev = {};
    this.setTester(tester, true);
    this.mover = new Mover(this);
    this.groundV = 0; // растёт, когда меняются клетки земли
    // Спрайты и иконки — из картинок художника. Пока они грузятся, игра не запущена (экран загрузки),
    // поэтому до applyArt здесь пусто.
    this.S = {};
    this.icons = {}; // имя → адрес картинки (для <img> в интерфейсе)
    this.iconImg = {}; // имя → загруженная картинка (для текстур сцены)
    this.artReady = loadArt((k) => this.onArtProgress && this.onArtProgress(k)).then((a) => this.applyArt(a));
    // ошибку загрузки обрабатывает main.js (экран загрузки с кнопкой «Повторить»)
    this.artReady.catch((e) => console.warn('art', e));
  }

  // Картинки художника загружены (artSprites.loadArt): раскладываем их в спрайты игры и иконки
  applyArt(a) {
    Object.assign(this.S, {
      grass: a.grass, paths: a.paths, pathParts: a.pathEdge, pathBlend: a.pathBlend, pathEdge: new Map(), bed: a.bed, ponds: a.ponds, decor: a.decor,
      objArt: a.obj, stumpOf: a.stumpOf, flora: a.flora, sprouts: a.sprouts, wildGrass: a.wildGrass,
      house: a.house, well: a.well, crops: a.crops, fog: a.fog.clouds.length ? a.fog : null, sprinkler: a.sprinkler,
      buildings: a.buildings, sites: a.sites, houseUp: a.houseUp,
      deco: a.deco, fence: a.fence, animal: a.animal,
    });
    this.groundV++;
    for (const [k, v] of Object.entries(a.icons)) { this.icons[k] = v.url; this.iconImg[k] = v.img; }
    // пузыри над грядками — те же иконки: квадрат 24×24 единицы, опора — низ хвостика
    this.S.bubble = {};
    for (const k of ['ready', 'water']) this.S.bubble[k] = { canvas: this.iconImg['bubble_' + k], w: 24, h: 24, ax: 12, ay: 24, name: 'bubble_' + k };
    // пузыри над животными: в пузыре — его корм (хочет есть) или продукт (готово), ключ — id предмета
    for (const id of Object.keys(ITEMS)) {
      const it = ITEMS[id];
      if (!(it.tabs.includes('animals') && !it.place)) continue; // корма и продукты (не сами животные)
      const c = bubbleWith(this.iconImg.bubble_water, this.iconImg[it.icon]);
      if (c) this.S.bubble[id] = { canvas: c, w: 24, h: 24, ax: 12, ay: 24, name: 'bubble_' + id };
    }
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

  // Край клетки дорожки (x, y): там, где рядом трава (вода, грядка, «камни в траве»), на дорожку чуть
  // заходит трава; где рядом дорожка другого вида выше по слою (PATHS.layer) — край этой дорожки.
  // Ни того ни другого — null.
  pathEdge(x, y) {
    const w = this.world;
    return this.pathEdgeOf(Paths.edgeKey(w, x, y), Paths.blendKeys(w, x, y));
  }

  // Картинка края: grass — вид окружения травой (paths.js edgeKey), blends — переходы [[вид, ключ], ...]
  // (paths.js blendKeys). Нужные куски (tools/path_tiles.py) склеиваются в одну картинку и запоминаются:
  // сначала переходы снизу вверх, сверху трава. Куски одного края не перекрываются — склейка без швов.
  pathEdgeOf(grass, blends = []) {
    blends = blends.filter(([, k]) => k);
    if (!grass && !blends.length) return null;
    const id = blends.map(([m, k]) => m + k + ',').join('') + grass;
    let s = this.S.pathEdge.get(id);
    if (!s) {
      const t = this.S.grass[0], k = t.canvas.width / t.w; // клетка 66×33 единицы, пикселей на единицу
      const c = makeCanvas(t.canvas.width, t.canvas.height), g = c.getContext('2d');
      const draw = (set, key) => {
        if (set) for (const n of Paths.edgeParts(key)) {
          const p = set[n];
          if (p) g.drawImage(p.canvas, Math.round((t.ax - p.ax) * k), Math.round((t.ay - p.ay) * k));
        }
      };
      for (const [m, key] of blends) draw(this.S.pathBlend[m], key);
      if (grass) draw(this.S.pathParts, grass);
      s = { canvas: c, w: t.w, h: t.h, ax: t.ax, ay: t.ay, name: 'path_edge_' + id };
      this.S.pathEdge.set(id, s);
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
    if (OBJECTS[o.type] && OBJECTS[o.type].building) return this.builds.sprite(o); // здание или его стройка
    if (S.animal && S.animal[o.type]) return this.animals.sprite(o); // животное своей стадии, повёрнутое
    if (S.ponds[o.type]) return S.ponds[o.type];
    // декор: картинка своего положения поворота; забор — секция по соседям-заборам
    const dv = S.deco && S.deco[o.type];
    if (dv) return dv[o.rot || 0] || dv[0];
    if (S.fence && S.fence[o.type]) return S.fence[o.type][this.fenceMask(o)];
    const v = S.objArt[o.type];
    if (v && v.length) return v[o.id % v.length];
    if (S.sprinkler && S.sprinkler[o.type]) return S.sprinkler[o.type];
    switch (o.type) {
      case 'grass': return S.wildGrass[o.id % S.wildGrass.length];
      case 'house': return this.builds.houseSprite();
      case 'well': return S.well[this.st.well ? 1 : 0];
    }
    return S.objArt.rock[0];
  }

  // С какими соседями-заборами соединяется секция забора o: 1 — gx + 1, 2 — gy + 1, 4 — gx − 1, 8 — gy − 1
  // (artSprites.fenceSprite). o может быть и заготовкой предпросмотра на месте, куда забор ставят.
  fenceMask(o) {
    const w = this.world;
    if (!w) return 0;
    const fe = (x, y) => { const n = w.objectAt(x, y); return n && n !== o && n !== o.self && OBJECTS[n.type].fence ? 1 : 0; };
    return fe(o.gx + 1, o.gy) | fe(o.gx, o.gy + 1) << 1 | fe(o.gx - 1, o.gy) << 2 | fe(o.gx, o.gy - 1) << 3;
  }

  // Картинка предмета из рюкзака на месте, куда его ставят (предпросмотр в «Переставить»): пруд, украшение
  // пруда или своя постройка (placed.js). У постройки — объект-заготовка с o.item и o.preview: свои правила
  // картинки могут их учесть. rot — положение поворота (декор), gx, gy — куда ставят (забор соединится с соседями).
  placeSprite(itemId, rot = 0, gx = -9, gy = -9) {
    if (itemId === WELL_ITEM) return this.S.well[1];
    if (Ponds.isPondItem(itemId)) return this.S.ponds[itemId];
    if (Ponds.isDecorItem(itemId)) return this.S.decor[ITEMS[itemId].decorOf];
    const type = Placed.objOf(itemId);
    return type ? this.objSprite({ type, id: 0, gx, gy, rot, item: itemId, preview: true }) : null;
  }

  // ---------------- Состояние ----------------

  // map — карта из редактора (assets/map.json) или null (случайная генерация из seed)
  init(saved, map) {
    const seed = saved && saved.seed ? saved.seed : (Math.random() * 2 ** 31) | 0;
    this.world = new World(seed, map || null);
    const w = this.world;
    this.beds = new Map();
    this.awaySec = 0;
    this._cov = null; // где поливают поливалки (coverage)
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
      // свои посадки (st.plants, st.fruit) остаются: место занято — растение вернётся в рюкзак
      // свои дорожки тоже остаются (их покупают): место занято — дорожка вернётся в рюкзак
      if (!sameMap) { delete this.st.pos; delete this.st.movedBeds; delete this.st.wild; }
      if (saved.objects && saved.v !== 2 && sameMap) w.importObjects(saved.objects);
      // пруды переставляли, убирали или ставили купленные: берём их из сохранения
      Ponds.restorePonds(this.st, w);
      if (saved.chunks) for (const c of saved.chunks) w.unlocked[c] = 1;
      // грядки переносили: стартовые клетки — трава, все грядки берём из сохранения
      if (this.st.movedBeds) for (const i of w.startBeds) w.tiles[i] = T.GRASS;
      // дорожки ставили, убирали или переносили: берём их из сохранения (старые — все «Тропинка»)
      Paths.restorePaths(this.st, w);
      for (const [i, crop, p, wt] of saved.beds || []) {
        if (!sameMap && w.tiles[i] !== T.SOIL && (w.tiles[i] !== T.GRASS || w.occ[i] >= 0)) continue; // на новой карте здесь вода/дерево
        w.tiles[i] = T.SOIL;
        this.bedAt(i).crop = crop || null; this.bedAt(i).p = p; this.bedAt(i).w = wt;
      }
      if (!sameMap) for (const i of w.startBeds) this.bedAt(i); // грядки новой карты
      if (saved.player && w.walkable(saved.player[0], saved.player[1])) [px, py] = saved.player;
      // рост за время отсутствия — ниже, когда на карте уже стоят поливалки (они поливают и без игрока)
      this.awaySec = Math.max(0, (Date.now() - (saved.t || Date.now())) / 1000);
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
    // колодец убран в рюкзак (well.js) — на карте его нет; иначе он на своей траве (старые сохранения: рядом с домом)
    if (Well.inBag(this.st)) { if (w.well) w.remove(w.well); w.well = null; } else w.fixWell();
    this.restorePlants();
    Placed.restorePlaced(this.st, w); // свои постройки (поливалки, декор, животные): место занято — в рюкзак
    this.restoreWild();
    Chop.tidy(this.st, (x, y) => w.objectAt(x, y)); // начатая рубка: объекта на клетке больше нет — забыть
    if (this.awaySec > 0) this.grow(this.awaySec, true);
    Flora.tidyFruit(this.st, Date.now());
    this.floraTick(Date.now());
    // старые сохранения: первое задание ещё не выполнено — стартовая морковка созревает сразу
    if (saved && !this.st.stats.harvested && !this.quests.st.done['story.wake']) {
      const b = this.beds.get(w.startBeds[0]);
      if (b && b.crop === 'carrot') { b.p = CROPS.carrot.time; b.w = 2; }
    }
    this.player = new Player(w, makeGhostData(), px, py);
    this.player.toolSkin = (n) => this.tools.skin(n); // топор, кирка, лейка из кузницы — своего цвета
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
    this.builds.tick(Date.now(), true); // стройки, которые кончились, пока игры не было
    this.tools.tick(Date.now(), true); // инструмент доковался, пока игры не было
    this.animals.tick(Date.now(), true); // животные, которые доели, пока игры не было
    this.syncHint();
    this.ui.update(this);
  }

  // Посаженные игроком растения → объекты на карте (место занято, например карту поменяли, —
  // растение возвращается в рюкзак: саженцем или выкопанным взрослым)
  restorePlants() {
    const w = this.world, now = Date.now(), keep = [];
    for (const p of this.st.plants || []) {
      const [x, y, sp, born] = p;
      if (!FLORA[sp]) continue;
      const grown = Flora.plantStage(sp, born, now) >= 2;
      const o = w.isOpen(x, y) && w.add(grown ? sp : 'sapling', x, y);
      if (!o) {
        Inv.addItem(this.st, grown ? floraOwnId(sp) : floraSeedId(sp), 1);
        if (this.st.fruit) delete this.st.fruit[x + ',' + y];
        continue;
      }
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

  // Куда призрак может подойти: клетка рядом со свободной клеткой открытой земли (долететь он может
  // до любой такой, Player.pass)
  reachFn() {
    const w = this.world;
    return (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && w.walkable(x + dx, y + dy)) return true;
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
        if (stage >= 2) { o.type = o.tree; o.stage = 2; changed = true; this.burst(o.wx, o.wy - 20, '#7ccf4f', 10, true); }
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
    // здания: полоска стройки или крафта, пузырь «готово» (this.bldBub — x, y по 2 числа)
    const U = this.bldBub || (this.bldBub = []);
    U.length = 0;
    this.builds.bars(now, B, U);
    this.tools.bars(now, B); // куётся инструмент
    // животные: полоска «ест», пузыри с кормом или продуктом (this.aniBub — x, y, картинка по 3 значения)
    const AU = this.aniBub || (this.aniBub = []);
    AU.length = 0;
    this.animals.bars(now, B, AU);
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

  changed() { this.syncBars(); this.quests.check(); this.ach.check(); this.syncHint(); this.ui.update(this); this.save.schedule(() => this.serialize()); }

  // Подсказка к заданию (hints.js): куда показать стрелку. Считается после каждого действия и раз
  // в секунду; this.hint — цель или null, hintV растёт, когда цель сменилась (сцена начинает новый прыжок).
  syncHint() {
    const p = this.player, q = this.hintQuest();
    const h = this.editor || !p || !q ? null : Hints.questHint(q, q.done,
      { st: this.st, world: this.world, beds: this.beds, px: p.tx, py: p.ty, now: Date.now(), mode: this.plantMode() }, this.hint);
    if (!Hints.sameHint(h, this.hint)) this.hintV = (this.hintV || 0) + 1;
    this.hint = h;
    this.hintQ = q;
    this.ui.hint(h && h.kind === 'ui' ? h.ui : null, q && q.id);
  }

  // К какому заданию стрелка: о котором игрок попросил в окне задания, иначе — к первым заданиям сюжета
  // (в них стрелка видна сама). Просьба помнится на устройстве (а не в сохранении фермы) по id задания:
  // задание сдали — стрелки снова нет.
  hintQuest(vs = this.quests.views()) {
    if (this.hintAsk === undefined) { try { this.hintAsk = localStorage.getItem('farm.hintQ'); } catch { this.hintAsk = null; } }
    return (this.hintAsk && vs.find((v) => v.id === this.hintAsk && !v.claimed)) || vs.find((v) => !v.claimed && Hints.hintAuto(v)) || null;
  }

  hintOn(q) { const h = this.hintQuest(); return !!q && !!h && h.id === q.id; }

  // Включить или выключить стрелку к заданию id. Задание со стрелкой закрепляется на экране, если есть место.
  askHint(on, id) {
    this.hintAsk = on && id ? id : null;
    try { if (this.hintAsk) localStorage.setItem('farm.hintQ', this.hintAsk); else localStorage.removeItem('farm.hintQ'); } catch { /* приватный режим */ }
    if (on && id && !this.quests.isPinned(id) && this.quests.cards().every((v) => v.id !== id)) this.quests.pin(id);
    this.syncHint();
  }

  // Режим тестера вкл/выкл (запоминается на устройстве). Выключили — сдвиг часов и событие сбрасываются.
  setTester(on, init) {
    this.tester = !!on;
    if (!init) { try { if (on) localStorage.setItem('farm.tester', '1'); else localStorage.removeItem('farm.tester'); } catch { /* приватный режим */ } }
    this.devOn = this.urlDebug || this.tester;
    if (this.devOn) { try { this.dev = JSON.parse(localStorage.getItem('farm.dev')) || {}; } catch { this.dev = {}; } }
    else if (Object.keys(this.dev).length) { this.dev = {}; try { localStorage.removeItem('farm.dev'); } catch { /* приватный режим */ } }
    if (!init) { this.quests.tick(); this.changed(); }
  }

  // Действие режима тестера: fn — правило из devRules.js над st; эффекты (звук, сохранение, HUD) — здесь
  devDo(fn) {
    if (!this.devOn) return null;
    const r = fn(this.st);
    if (r) { this.sfx('coin'); this.changed(); }
    return r;
  }

  // Настройки разработчика для заданий: { shift: мс к часам, event: id события }
  setDev(patch) {
    if (patch.event && patch.event !== this.dev.event) delete this.quests.st.ev[patch.event + ':dev']; // проверить с начала
    Object.assign(this.dev, patch);
    try { localStorage.setItem('farm.dev', JSON.stringify(this.dev)); } catch { /* приватный режим */ }
    this.quests.tick();
    this.changed();
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

  // Нужен ли грядке на клетке (x, y) полив (лейка из кузницы поливает и соседние грядки)
  needsWater(x, y) {
    const w = this.world;
    if (!w.inside(x, y) || w.tiles[w.idx(x, y)] !== T.SOIL) return false;
    const b = this.beds.get(w.idx(x, y));
    return !!b && !!b.crop && !!(this.cropFlags(b) & 8);
  }

  // то же, что cropInfo, без создания объекта (для каждого кадра): стадия | готово<<2 | нужен полив<<3
  cropFlags(b) { return Beds.cropFlags(b); }

  // Рост грядок за dt секунд (beds.js growBed). Грядки под поливалками поливаются сами, как только просят
  // воды; quiet — за время отсутствия: без брызг и без счёта в задания.
  grow(dt, quiet) {
    const cov = this.coverage();
    let wet = null;
    for (const b of this.beds.values()) {
      if (!b.crop) continue;
      const n = Beds.growBed(b, dt, cov[b.i] > 0);
      if (n) (wet || (wet = [])).push(b, n);
    }
    if (wet && !quiet) this.sprinkled(wet);
  }

  // Где поливают поливалки (sprinklers.js coverMap): считается заново, только когда меняются объекты мира
  coverage() {
    const w = this.world;
    if (!this._cov || this._covV !== w.version) { this._cov = Spr.coverMap(w, this._cov); this._covV = w.version; }
    return this._cov;
  }

  // Поливалки полили грядки (wet — подряд грядка, сколько раз): брызги летят от поливалок к грядкам,
  // полив засчитывается в задания «Полей грядки»
  sprinkled(wet) {
    const w = this.world, by = new Map();
    let n = 0;
    for (let k = 0; k < wet.length; k += 2) {
      const b = wet[k];
      n += wet[k + 1];
      // брызги — от ближней из поливалок, что поливают эту грядку
      let best = null, bd = Infinity;
      for (const o of Spr.sprinklersAt(w, b.x, b.y)) { const d = Math.abs(o.gx - b.x) + Math.abs(o.gy - b.y); if (d < bd) { bd = d; best = o; } }
      if (!best) continue;
      if (!by.has(best)) by.set(best, []);
      by.get(best).push(b);
    }
    for (const [o, beds] of by) this.sprayFx(o, beds);
    this.quests.emit('water', null, n);
    this.sfx('water');
    this.changed();
  }

  // Брызги поливалки o: фонтанчик над ней и капли дугой к каждой грядке
  sprayFx(o, beds) {
    const P = this.particles, max = this.perf.tier === 'low' ? 60 : 160;
    const s = this.objSprite(o), top = o.wy - Math.min(s.ay * 0.8, 30);
    this.burst(o.wx, top, '#bfe6ff', 6);
    const T = 0.42, per = beds.length > 8 ? 2 : 3;
    for (const b of beds) {
      for (let i = 0; i < per && P.length < max; i++) {
        const tx = b.wx + (Math.random() - 0.5) * 18, ty = b.wy - 4 + (Math.random() - 0.5) * 8, t = T * (0.85 + Math.random() * 0.3), g = 320;
        P.push({ x: o.wx, y: top, vx: (tx - o.wx) / t, vy: (ty - top) / t - g * t / 2, life: t, t: 0,
          c: Math.random() < 0.3 ? '#d8f0ff' : '#3f9be6', s: 1.8 + Math.random() * 1.2, g });
      }
    }
  }

  get maxEnergy() { return HOUSE[this.st.house].energy; }
  // лейка: сколько воды в неё входит (дом + улучшения лейки в кузнице)
  get canMax() { return TR.canMax(this.st); }

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
      // крона соседнего дерева над открытой клеткой: если дерево за забором — важнее сама клетка
      // (иначе вместо тропинки открывалось «Новый участок»). Пруд — объект, его нашёл objectAt.
      // Грядка за деревом или домом: нажатие достаётся ей, а не кроне/крыше перед ней — та станет
      // прозрачной (look ниже). Меню самого дерева — нажатием по его клетке (стволу).
      if (o && w.inside(gx, gy) && w.isOpen(gx, gy) && (!w.isOpen(o.gx, o.gy) || w.tile(gx, gy) === T.SOIL)) o = null;
    }
    // Куда смотрит игрок: то, что это закрывает, остаётся прозрачным, пока открыто меню, и ещё
    // немного после (на телефоне нет наведения мыши). У объекта — он сам, чтобы не гасла его же крона.
    this.look = o ? { obj: o, t: LOOK_HOLD } : { x: gx, y: gy, t: LOOK_HOLD };
    if (o) this.tapObject(o, sx, sy, gx, gy);
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
      if (!o || OBJECTS[o.type].flat) continue; // пруд плоский: нажатие по нему — по клеткам (objectAt)
      const s = this.objSprite(o);
      const big = o.type === 'house' || o.type === 'boulder' || (o.w || 1) > 1;
      const kx = big ? 0.9 : 0.62;
      const hit = wx >= o.wx - s.ax * kx && wx <= o.wx + (s.w - s.ax) * kx &&
        wy >= o.wy - s.ay * 0.92 && wy <= o.wy + (big ? (s.h - s.ay) * 0.8 : 6);
      if (hit && (!best || o.depth > best.depth || (o.depth === best.depth && o.wy > best.wy))) best = o;
    }
    return best;
  }

  tapObject(o, sx, sy, gx = o.gx, gy = o.gy) {
    const w = this.world;
    if (!w.isOpen(o.gx, o.gy)) return this.expandPopup(w.chunkOf(o.gx, o.gy), sx, sy);
    if (Ponds.isPond(o)) return this.pondPopup(o, gx, gy, sx, sy);
    if (o.type === 'house') return this.ui.housePanel(this);
    if (o.type === 'well') return this.wellPopup(o, sx, sy);
    const def = OBJECTS[o.type];
    if (!def) return;
    if (def.sprinkler) return this.sprinklerPopup(o, sx, sy);
    if (def.building) return this.builds.tap(o, sx, sy);
    if (def.animal) return this.animals.tap(o, sx, sy);
    if (def.deco || def.fence) return this.decoPopup(o, sx, sy);
    if (o.type === 'sapling' || def.flora) return this.floraPopup(o, sx, sy);
    if (def.action) this.queue({ kind: def.action, obj: o });
  }

  // Поливалка: что поливает (клетки подсвечиваются на несколько секунд), переставить или убрать в рюкзак
  sprinklerPopup(o, sx, sy) {
    const k = Spr.kindOf(o), n = Spr.areaSize(k);
    this.showArea(o);
    this.ui.popup(sx, sy, {
      title: SPRINKLERS[k].name, text: `Поливает ${n} ${n === 4 ? 'соседние клетки' : 'клеток вокруг'}: грядки там поливаются сами.`,
      items: [{ icon: 'move', label: 'Переставить', onClick: () => this.moveThis(o) }],
    });
  }

  // Декор или забор: переставить, повернуть (у кого есть повороты)
  decoPopup(o, sx, sy) {
    const def = OBJECTS[o.type], items = [{ icon: 'move', label: 'Переставить', onClick: () => this.moveThis(o) }];
    if (Placed.rotCount(o.type) > 1) items.push({ icon: 'rotate', label: 'Повернуть', onClick: () => { this.moveThis(o); this.mover.rotate(); } });
    this.ui.popup(sx, sy, { title: def.name, text: def.fence ? 'Секция забора: соседние секции соединяются сами.' : undefined, items });
  }

  // Подсветить на несколько секунд клетки, которые поливает поливалка o (рисует PixiScene)
  showArea(o, sec = 4) { this.areaShow = { o, until: this.time + sec }; }

  // Постройку поставили из рюкзака (Mover): у поливалки — подсветка клеток полива; задание «Поставь …»
  // Возвращает надпись для плашки перестановки (или ничего — «поставлено»).
  placedFx(o) {
    if (Spr.kindOf(o)) this.showArea(o, 2.5);
    this.quests.emit('place', o.type);
    if (this.builds.is(o)) return this.builds.placed(o);
    if (this.animals.is(o)) { o.hop = HOP; this.syncBars(); }
  }

  // Режим перестановки сразу с выбранным своим объектом o
  moveThis(o) {
    const m = this.mover;
    m.enter();
    const r = m.identify(o.gx, o.gy, o.wx, o.wy);
    if (r.sel) { m.sel = r.sel; m.to = null; m.hint(); } else if (r.why) m.fail(r.why);
  }

  // Какие клетки полива показать сейчас: поливалка выбрана в «Переставить» (на месте или там, куда её
  // ставят) или её только что нажали/поставили. → { kind, x, y, bad, k — яркость 0..1 } или null
  sprinklerArea() {
    const m = this.mover, w = this.world;
    if (m.active) {
      const s = m.sel, t = m.to;
      const type = s && (s.kind === 'obj' && s.placed ? s.o.type : s.kind === 'bag' ? Placed.objOf(s.id) : null);
      const kind = type && OBJECTS[type].sprinkler;
      if (!kind) return null;
      if (t) return { kind, x: t.gx, y: t.gy, bad: !t.ok, k: 1 };
      return s.kind === 'obj' ? { kind, x: s.gx, y: s.gy, bad: false, k: 1 } : null;
    }
    const a = this.areaShow;
    if (!a) return null;
    const left = a.until - this.time, o = a.o;
    if (left <= 0 || w.objects[o.id] !== o) { this.areaShow = null; return null; }
    return { kind: Spr.kindOf(o), x: o.gx, y: o.gy, bad: false, k: Math.min(1, left / 0.6) };
  }

  // Дерево или куст: собрать плоды / срубить. Дикое без плодов рубится сразу, как раньше.
  floraPopup(o, sx, sy) {
    const now = Date.now();
    if (o.type === 'sapling') {
      const f = FLORA[o.tree];
      return this.ui.popup(sx, sy, {
        title: `Росток: ${f.name.toLowerCase()}`, text: `Вырастет через ${fmtTime(Flora.growLeft(o.tree, o.born, now))}`,
        items: o.own ? [] : [{ icon: 'wood', label: 'Срубить', sub: `⚡ ${ENERGY.chop}`, onClick: () => this.queue({ kind: 'chop', obj: o }) }],
        ...(o.own ? { text: `Вырастет через ${fmtTime(Flora.growLeft(o.tree, o.born, now))}. Убрать в рюкзак: «Ещё» → «Переставить»` } : {}),
      });
    }
    // собирать касанием можно только плоды и ягоды (pick); кора, шишки, цветы — только рубкой
    const f = FLORA[o.type], left = f.pick ? Flora.fruitLeft(this.st, o, now) : 0, fruit = FLORA_GOODS[f.fruit];
    const ripe = f.pick && !left;
    // дикое без сбора рубится сразу; плодовое, пока плоды отрастают, — меню «Срубить» и время до урожая.
    // Рубку уже начали (есть удары или удар ждёт в очереди) — каждое нажатие сразу ещё один удар, без меню.
    if ((!f.pick && !o.own) || this.chopping(o)) return this.queue({ kind: 'chop', obj: o });
    const items = [], n = Chop.durability(o, this.st);
    if (ripe) items.push({ icon: f.fruit, label: `Собрать: ${fruit.name.toLowerCase()}`, sub: `⚡ ${ENERGY.pick}`, onClick: () => this.queue({ kind: 'pick', obj: o }) });
    items.push({ icon: 'wood', label: o.own ? 'Срубить своё' : 'Срубить', sub: `⚡ ${ENERGY.chop} за удар`, onClick: () => this.queue({ kind: 'chop', obj: o }) });
    const about = left ? `Следующий урожай (${fruit.name.toLowerCase()}) через ${fmtTime(left)}. ` : !f.pick ? `${fruit.name}: только при рубке. ` : '';
    this.ui.popup(sx, sy, {
      title: (o.own ? 'Моё: ' : '') + f.name, text: `${about}Прочность: ${n} ${plural(n, ['удар', 'удара', 'ударов'])}`, items,
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

  // Свободная трава: что можно посадить из рюкзака (саженцы деревьев и отростки кустов) — окно-сетка UI.sowPanel.
  // → [{ id — предмет в рюкзаке, species, grown — встанет сразу взрослым, n — сколько есть }]
  sowChoices() {
    const st = this.st, grown = [], saps = [];
    for (const f of Object.values(FLORA)) {
      const own = Inv.count(st, floraOwnId(f.key)), sap = Inv.count(st, floraSeedId(f.key));
      // свои выкопанные — первыми: встают сразу взрослыми
      if (own) grown.push({ id: floraOwnId(f.key), species: f.key, grown: true, n: own });
      if (sap) saps.push({ id: floraSeedId(f.key), species: f.key, grown: false, n: sap });
    }
    return grown.concat(saps);
  }

  tapTile(x, y, sx, sy) {
    const w = this.world;
    if (!w.inside(x, y)) return;
    if (!w.isOpen(x, y)) return this.expandPopup(w.chunkOf(x, y), sx, sy);
    const t = w.tile(x, y);
    if (t === T.SOIL) return this.tapBed(this.bedAt(w.idx(x, y)), sx, sy);
    if (w.occ[w.idx(x, y)] >= 0) return;
    // Свободная трава: в режиме посадки саженцев — росток, иначе призрак просто идёт сюда
    // (меню на каждое нажатие по земле было лишним). Грядки ставят из рюкзака (кнопка «Грядки», Mover).
    const P = this.planting;
    if (t === T.GRASS && P && P.species) return this.sowTap(x, y);
    this.queue({ kind: 'walk', x, y });
  }

  // Пруд: набрать воды или рыбачить. Нажали на середину большого пруда — призрак
  // идёт к ближнему берегу (клетка воды, у которой можно встать)
  pondPopup(o, gx, gy, sx, sy) {
    const c = Ponds.shoreCell(this.world, o, gx, gy);
    if (!c) return this.toast('К этому пруду не подойти');
    const { x, y } = c, b = this.bites();
    this.ui.popup(sx, sy, { title: OBJECTS[o.type].name, text: this.bitesText(b), items: [
      { icon: 'water', label: 'Набрать воды', sub: `${this.st.can}/${this.canMax}`, disabled: this.st.can >= this.canMax, onClick: () => this.queue({ kind: 'fill', x, y }) },
      { icon: 'fish', label: 'Рыбачить', sub: `⚡ ${ENERGY.fish}`, disabled: !b.n, onClick: () => this.queue({ kind: 'fish', x, y }) },
    ] });
  }

  // Клёв (fishRules.js): сколько поклёвок в запасе и когда следующая
  bites() { return Fish.bitesView(this.st, this.quests.ctx().now); }

  bitesText(b = this.bites()) {
    const wait = b.next ? fmtTime((b.next - this.quests.ctx().now) / 1000) : '';
    if (!b.n) return `Клёв кончился, следующая поклёвка через ${wait}`;
    return `Клёв: ${b.n} из ${b.max}` + (wait ? `, следующая поклёвка через ${wait}` : '');
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

  // Где на клетке (gx, gy) стоит украшение пруда (у берега — ближе к земле) → out = точка мира
  decorPoint(gx, gy, out) {
    const o = this.world.pondAt(gx, gy);
    if (o && this.world.isWater(gx, gy)) { const [x, y] = pondDecorPos(o.type, gx - o.gx, gy - o.gy); toWorld(o.gx + x, o.gy + y, out); }
    else toWorld(gx + 0.5, gy + 0.5, out);
    return out;
  }

  // Украшение пруда поставили, переставили или убрали: брызги
  decorFx(gx, gy) {
    this.decorPoint(gx, gy, tmp);
    this.burst(tmp.x, tmp.y, '#9fd8f5', 6);
    this.sfx('splash');
  }

  // Пруд переставили, убрали или поставили: брызги по воде
  pondFx(o) {
    for (const [dx, dy] of PONDS[o.type].water) {
      if ((dx + dy) % 2) continue;
      toWorld(o.gx + dx + 0.5, o.gy + dy + 0.5, tmp);
      this.burst(tmp.x, tmp.y, '#9fd8f5', 4);
    }
    this.sfx('splash');
  }

  // «Убрать всё» (Mover.storeAll): пыль и брызги там, где стояли вещи (частиц поровну, чтобы хватило всем),
  // «+N» с иконками над призраком — по одной строке на предмет, не больше шести (остальное — в надписи панели)
  storeAllFx(r) {
    const n = Math.max(2, Math.min(8, Math.floor(140 / Math.max(1, r.spots.length))));
    for (const s of r.spots) {
      if (s.g === 'paths' || s.g === 'beds') { toWorld(s.x + 0.5, s.y + 0.5, tmp); this.burst(tmp.x, tmp.y, s.id ? PATHS[s.id].dust : '#8a5a30', n); }
      else if (s.g === 'ponds') {
        const water = PONDS[s.o.type].water, step = Math.max(1, Math.round(water.length / 4));
        for (let k = 0; k < water.length; k += step) { toWorld(s.o.gx + water[k][0] + 0.5, s.o.gy + water[k][1] + 0.5, tmp); this.burst(tmp.x, tmp.y, '#9fd8f5', Math.max(2, n >> 1)); }
      } else this.burst(s.o.wx, s.o.wy - 4, s.g === 'placed' || s.g === 'decor' || s.g === 'well' ? '#e8d9a8' : '#8a5a30', n);
    }
    if (r.done.paths || r.done.beds) this.groundV++;
    toWorld(this.player.x, this.player.y, tmp);
    this.dropFx({ wx: tmp.x, wy: tmp.y }, [...r.items].sort((a, b) => b.n - a.n).slice(0, 6));
    this.sfx('dig');
    if (r.done.ponds) this.sfx('splash');
  }

  isWell(x, y) { const o = this.world.well; return !!o && this.st.well > 0 && o.gx === x && o.gy === y; }

  tapBed(b, sx, sy) {
    if (!b.crop) return this.planting && this.planting.crop ? this.plantTap(b) : this.ui.plantPanel(this, b);
    const info = this.cropInfo(b);
    if (info.ready) return this.queue({ kind: 'harvest', x: b.x, y: b.y });
    if (info.needsWater) return this.queue({ kind: 'water', x: b.x, y: b.y });
    const gems = Math.max(1, Math.ceil(info.left / GEM_SPEEDUP_SEC));
    this.ui.popup(sx, sy, {
      title: info.c.name, text: `Созреет через ${fmtTime(info.left)}` + (this.coverage()[b.i] ? '. Поливает поливалка' : ''),
      items: [{ icon: 'gem', label: 'Ускорить', sub: `${gems} ${this.ui.ic('gem', 'ic ic-s')}`, disabled: this.st.gems < gems, onClick: () => {
        this.st.gems -= gems; b.p = info.total; b.w = 2; this.burst(b.wx, b.wy - 8, '#ffe066', 10); this.changed();
      } }],
    });
  }

  // ---------------- Режим посадки ----------------
  // this.planting: { crop } — культура на пустые грядки, { species, grown } — саженец (или своё взрослое
  // растение) на свободную траву. Включается выбором в окне посадки или кнопкой «Посадить» в рюкзаке;
  // дальше каждое нажатие по пустой грядке (по траве) сажает то же самое, пока не нажмут ✕ на плашке
  // внизу или не кончатся семена и монеты (саженцы).
  // Культуру выбрали в окне (UI.plantPanel) или в рюкзаке: она сажается на грядку b, если окно открыли с неё
  // (null — из рюкзака или сменили культуру с плашки).
  pickCrop(key, b) {
    const c = CROPS[key];
    if (!c || c.level > this.st.level) return;
    if (!Plant.plantLeft(this.st, key, this.pendingPlants(key))) return this.toast('Не хватает монет на семена', 'warn');
    this.planting = { crop: key };
    if (b && !b.crop) this.plantTap(b);
    else this.ui.plantBar(this);
  }

  plantTap(b) {
    const key = this.planting.crop;
    if (!Plant.plantLeft(this.st, key, this.pendingPlants(key))) return this.stopPlanting(true);
    this.queue({ kind: 'plant', x: b.x, y: b.y, crop: key });
    // это была последняя грядка, на которую хватает семян и монет
    if (!Plant.plantLeft(this.st, key, this.pendingPlants(key))) this.stopPlanting(true);
    else this.ui.plantBar(this);
  }

  // ---------------- Грядки ----------------
  // Грядки не копают: их покупают на рынке и получают за задания (beds.js, BEDS в data.js).
  // Кнопка «Грядки»: есть грядки в рюкзаке — ставим их (каждое нажатие на траву — грядка, Mover.pave),
  // нет — рынок, сразу на грядке.
  pickBeds() {
    if (Inv.count(this.st, BED_ITEM) > 0) return this.mover.pave(BED_ITEM);
    this.ui.marketPanel(this, 'buy', BED_ITEM);
  }

  // Сколько грядок: на ферме и всего (на ферме и в рюкзаке) — для заданий, достижения и рынка
  bedCounts() {
    const beds = Beds.countBeds(this.world);
    return { beds, bedsAll: Beds.ownedBeds(this.st, beds) };
  }

  // Саженец вида species (grown — своё выкопанное растение) из рюкзака: дальше нажатия по траве сажают его
  pickSow(species, grown) {
    if (!Plant.sowLeft(this.st, species, grown, this.pendingSows(species, grown))) return this.toast('Таких саженцев больше нет', 'warn');
    this.planting = { species, grown: !!grown };
    this.ui.plantBar(this);
  }

  sowTap(x, y) {
    const { species, grown } = this.planting;
    if (!Plant.sowLeft(this.st, species, grown, this.pendingSows(species, grown))) return this.stopPlanting(true);
    this.queue({ kind: 'sow', x, y, species, grown });
    if (!Plant.sowLeft(this.st, species, grown, this.pendingSows(species, grown))) this.stopPlanting(true);
    else this.ui.plantBar(this);
  }

  pendingSows(species, grown) {
    const p = this.player, is = (a) => a && a.kind === 'sow' && a.species === species && !!a.grown === !!grown;
    let n = is(p.current) ? 1 : 0;
    for (const a of p.queue) if (is(a)) n++;
    return n;
  }

  // Какой режим посадки включён: 'bed' (ставим грядки из рюкзака) | 'sow' | 'crop' | null (для подсказок к заданиям)
  plantMode() {
    const P = this.planting;
    if (!P) return this.mover && this.mover.active && this.mover.brush === BED_ITEM ? 'bed' : null;
    return P.species ? 'sow' : 'crop';
  }

  // Сколько посадок культуры key уже ждут в очереди призрака
  pendingPlants(key) {
    const p = this.player;
    let n = p.current && p.current.kind === 'plant' && p.current.crop === key ? 1 : 0;
    for (const a of p.queue) if (a.kind === 'plant' && a.crop === key) n++;
    return n;
  }

  stopPlanting(out) {
    const P = this.planting;
    if (!P) return;
    this.planting = null;
    this.ui.plantBar(this);
    if (!out) return;
    if (P.crop) this.toast(`Семена «${CROPS[P.crop].name.toLowerCase()}» закончились, а на новые не хватает монет`, 'warn');
    else this.toast(`${P.grown ? 'Растения' : 'Саженцы'} «${FLORA[P.species].name.toLowerCase()}» в рюкзаке закончились`);
  }

  expandPopup(c, sx, sy) {
    const w = this.world;
    if (!w.canUnlock(c)) return this.toast('Сначала откройте соседний участок');
    const n = w.unlockedCount();
    const limit = HOUSE[this.st.house].chunks;
    if (n >= limit) {
      const need = HOUSE.findIndex((h, i) => h && i > this.st.house && h.chunks > n), up = this.st.houseUp;
      const text = up && up.to >= need ? `Дом улучшается до ${up.to} уровня: когда достроится, ферму можно будет расширить.` : `Улучшите дом до ${need} уровня, чтобы расширить ферму.`;
      return this.ui.popup(sx, sy, { title: 'Новый участок', text, items: [{ icon: 'house', label: 'К дому', onClick: () => this.ui.housePanel(this) }] });
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

  // Улучшение дома идёт по времени (houseRules.js): начинает и заканчивает его Buildings
  upgradeHouse() { return this.builds.upgradeHouse(); }

  sell(key, n) {
    const r = Inv.sellItem(this.st, key, n);
    if (!r) return;
    this.quests.emit('sell', key, r.n);
    this.quests.emit('earn', key, r.coins);
    this.sfx('coin');
    this.changed();
  }

  buy(offer, n) {
    // грядка — по одной: цена растёт с каждой, предел по уровню (beds.js); чертёж здания — один на ферму (buildRules.js)
    const bp = ITEMS[offer.item] && ITEMS[offer.item].blueprint;
    const r = offer.bed ? Beds.buyBed(this.st, this.bedCounts().bedsAll) : bp ? this.builds.buyBlueprint(bp, offer) : Inv.buyItem(this.st, offer, n);
    if (!r) return;
    if (r.limit != null) return this.toast(r.limit ? `Больше грядок — с ${r.limit} уровня` : 'Грядок уже столько, сколько можно', 'warn');
    if (r.why) return this.toast(r.why, 'warn');
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

  // Поставить дело призрачку. Удар по дереву, кусту, пню, камню (chop.js): если по этому объекту уже
  // заказаны удары — к ним добавляется ещё один (одно дело в очереди), но не больше, чем осталось до конца.
  queue(a) {
    if (this.mover.active) return;
    const p = this.player;
    if (Chop.isHit(a)) {
      const same = p.find(a);
      if (same) {
        const n = same.n || 1;
        if (!Chop.canOrder(this.st, a.obj, n)) return; // ударов уже хватит, чтобы срубить
        same.n = n + 1;
        this.ringTouch(a.obj);
        this.sfx('tap');
        return;
      }
      a.n = 1;
    }
    const r = p.enqueue(a);
    if (r === 'full') return this.toast('Очередь заполнена');
    if (r !== 'ok') return;
    if (a.n) this.ringTouch(a.obj);
    this.sfx('tap');
  }

  // Рубку объекта уже начали: есть удары или удар ждёт в очереди
  chopping(o) { return Chop.hitsDone(this.st, o) > 0 || !!this.player.find({ kind: 'chop', obj: o }); }

  // Кнопка «Отменить всё»: призрачок бросает текущее дело и всю очередь. Сделанные удары остаются.
  cancelAll() {
    const p = this.player;
    if (!p.current && !p.queue.length) return;
    p.clear();
    this.sfx('tap');
    this.ui.queueBtn(0);
  }

  // Кольцо прочности (рисует PixiScene.syncRings): над объектом, по которому заказаны удары, и ещё
  // RING_HOLD секунд после последнего удара. this.rings: объект → { type, total, done, last — срублен, t }.
  // Сколько ударов ещё заказано, сцена считает по очереди призрачка.
  ringTouch(o, r) {
    let e = this.rings.get(o);
    if (r) {
      // удар: последний — кольцо дорисовывается полным над тем, что срубили (объект уже пень или убран)
      if (!e || e.type !== o.type || e.last) { e = { type: o.type, total: r.total, done: r.done - 1, shown: r.done - 1 }; this.rings.set(o, e); }
      e.total = r.total; e.done = r.done; e.last = r.last;
    } else if (!e || e.type !== o.type || e.last) {
      const done = Chop.hitsDone(this.st, o);
      e = { type: o.type, total: Chop.durability(o, this.st), done, shown: done, last: false };
      this.rings.set(o, e);
    }
    e.t = this.time;
  }

  toast(msg, kind) { this.ui.toast(msg, kind); if (kind === 'warn') this.sfx('error'); }

  sfx(name) { if (this.audio) this.audio.play(name); }

  // ---------------- Выполнение действий ----------------

  nearestWater() {
    const w = this.world, p = this.player;
    let best = null, bd = Infinity;
    for (const { x, y } of Ponds.shoreCells(w)) {
      const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
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
      case 'sow': return t === T.GRASS && w.occ[w.idx(a.x, a.y)] < 0 && Inv.count(st, (a.grown ? floraOwnId : floraSeedId)(a.species)) > 0;
      case 'plant': {
        const b = this.bedAt(w.idx(a.x, a.y));
        if (t !== T.SOIL || b.crop) return false;
        if (!Plant.plantLeft(st, a.crop)) { this.toast('Не хватает монет на семена', 'warn'); return false; }
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
        return w.isWater(a.x, a.y) || this.isWell(a.x, a.y);
      case 'fish': {
        if (!w.isWater(a.x, a.y)) return false;
        const b = this.bites();
        if (b.n) return true;
        // клёв кончился: остальные забросы из очереди тоже не начнутся — убираем их, чтобы не повторять тост
        this.toast(this.bitesText(b), 'warn');
        const q = this.player.queue;
        for (let i = q.length - 1; i >= 0; i--) if (q[i].kind === 'fish') q.splice(i, 1);
        return false;
      }
    }
    return true;
  }

  perform(a) {
    const w = this.world, st = this.st;
    switch (a.kind) {
      case 'chop': case 'mine': {
        // один удар; a.n — сколько ударов по этому объекту ещё заказано (каждое нажатие — один)
        const o = a.obj, cost = ENERGY[a.kind];
        if (w.objects[o.id] !== o || !this.spend(cost)) return false;
        const r = Chop.hit(st, o);
        a.n = Math.max(0, (a.n || 1) - 1);
        o.shake = 0.25;
        if (!r.last) this.sfx(a.kind === 'chop' ? 'chop' : 'mine');
        const od = OBJECTS[o.type];
        const hy = o.type === 'stump' || o.type === 'rock' || o.type === 'sapling' || od.bush ? 8 : o.type === 'boulder' ? 20 : 26;
        this.burst(o.wx, o.wy - hy, a.kind === 'chop' ? '#b07a45' : '#b8bec3', 6);
        if (a.kind === 'chop' && o.type !== 'stump' && o.type !== 'sapling') this.burst(o.wx, o.wy - 60, '#5aa83a', 4, true);
        this.ringTouch(o, r);
        if (r.last) { this.destroy(o); this.changed(); return false; }
        this.ui.update(this);
        this.save.schedule(() => this.serialize());
        if (!a.n) return false;
        // заказаны ещё удары, а энергия кончилась — призрачок останавливается и говорит почему
        if (st.energy < cost) { this.spend(cost); return false; }
        return true;
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
        this.quests.emit('mow');
        this.changed();
        return false;
      }
      case 'sow': {
        const i = w.idx(a.x, a.y);
        if (w.tiles[i] !== T.GRASS || w.occ[i] >= 0) return false;
        const o = this.plantOwn(a.species, a.x, a.y, a.grown);
        if (!o) return false;
        this.burst(o.wx, o.wy, '#7ccf4f', 8);
        // своё взрослое растение из рюкзака пересадили — это не посадка ростка (задания и «Лесник» не считают)
        this.quests.emit(a.grown ? 'replant' : 'sow', a.species);
        this.sfx('plant');
        this.addXp(1);
        this.changed();
        return false;
      }
      case 'plant': {
        if (w.tiles[w.idx(a.x, a.y)] !== T.SOIL) return false;
        const b = this.bedAt(w.idx(a.x, a.y));
        if (!Plant.plantBed(st, b, a.crop)) return false;
        this.burst(b.wx, b.wy, '#7ccf4f', 6);
        this.quests.emit('plant', a.crop);
        this.sfx('plant');
        this.addXp(1);
        this.changed();
        return false;
      }
      case 'water': {
        // одно нажатие — 1 энергия; лейка из кузницы поливает и соседние грядки (вода — за каждую политую)
        if (w.tiles[w.idx(a.x, a.y)] !== T.SOIL) return false;
        const cells = TR.waterCells(st, a.x, a.y, (x, y) => this.needsWater(x, y));
        if (!cells.length || !this.spend(ENERGY.water)) return false;
        for (const [x, y] of cells) {
          const b = this.bedAt(w.idx(x, y));
          st.can--; b.w++;
          this.burst(b.wx, b.wy - 6, '#6fc2ff', 10);
        }
        this.quests.emit('water', undefined, cells.length);
        this.sfx('water');
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
        if (!this.bites().n) { this.toast(this.bitesText(), 'warn'); return false; }
        if (!this.spend(ENERGY.fish)) return false;
        const r = Fish.cast(st, this.quests.ctx());
        toWorld(a.x + 0.5, a.y + 0.5, tmp);
        this.burst(tmp.x, tmp.y - 2, '#bfe6ff', 10);
        if (!r.fish) { this.float(tmp.x, tmp.y - 20, 'Сорвалась!', null); this.sfx('splash'); this.changed(); return false; }
        const fish = FISH[r.fish];
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
      // дикий росток срубили — 1 дерево; свой — саженец вернулся в рюкзак
      const r = Flora.chopSapling(st, o, Math.random);
      this.dropFx(o, r.items);
      this.burst(o.wx, o.wy - 4, o.own ? '#8a5a30' : '#7a4b28', 8);
      this.sfx(o.own ? 'dig' : 'break');
      this.world.remove(o);
      return;
    }
    if (def.flora) {
      const r = Flora.chopFlora(st, o, Date.now(), Math.random);
      this.dropFx(o, r.items);
      this.addXp(def.xp || 1);
      st.stats.cleared++;
      this.quests.emit(def.stump ? 'chop' : 'clear', o.type);
      this.burst(o.wx, o.wy - 10, '#7a4b28', 12);
      this.sfx('break');
      // своё дерево уходит целиком, дикое оставляет пень; мастерский топор выкорчёвывает его сразу
      if (def.stump && !o.own && TR.noStump(st)) {
        const root = TR.rootOut(st, Math.random);
        this.dropFx({ wx: o.wx + 14, wy: o.wy - 14 * r.items.length }, root.items);
        if (root.xp) this.addXp(root.xp);
        st.stats.cleared++;
        this.quests.emit('stump', 'stump');
        this.world.remove(o);
      } else if (def.stump && !o.own) { o.was = o.type; o.type = 'stump'; o.bare = false; this.world.version++; }
      else this.world.remove(o);
      return;
    }
    let dy = -30;
    for (const [res, [a, b]] of Object.entries(def.drops || {})) {
      const n = a + Math.floor(Math.random() * (b - a + 1));
      const got = this.addItem(res, n);
      if (got) { this.float(o.wx, o.wy + dy, `+${got}`, res); dy -= 14; }
    }
    // руда: кирка из кузницы находит её в камне чаще, а из валуна достаёт больше
    if (def.oreChance && Math.random() < TR.oreChance(st, o.type)) {
      const [o0, o1] = TR.oreRange(st, o.type), got = this.addItem('ore', o0 + Math.floor(Math.random() * (o1 - o0 + 1)));
      if (got) { this.float(o.wx + 14, o.wy + dy, `+${got}`, 'ore'); dy -= 14; }
    }
    this.addXp(def.xp || 1);
    st.stats.cleared++;
    this.quests.emit(def.stump ? 'chop' : o.type === 'stump' ? 'stump' : def.action === 'mine' ? 'mine' : 'clear', o.type);
    this.burst(o.wx, o.wy - 10, o.type === 'rock' || o.type === 'boulder' ? '#9aa1a7' : '#7a4b28', 12);
    this.sfx('break');
    if (def.stump) { o.was = o.type; o.type = 'stump'; this.world.version++; }
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
    // pf.part отмечает долгие части логики: в описании фриза видно, какая именно была долгой
    const pf = this.perf;
    let t = performance.now();
    this.time += dt;
    // рост — по настоящим часам: в фоне (Telegram свёрнут) кадры не идут, а грядки растут
    const now = Date.now();
    this.grow(this._wall ? Math.min(Math.max(0, (now - this._wall) / 1000), 7 * 86400) : dt);
    this._wall = now;
    t = pf.part('рост', t);
    this._eT = (this._eT || 0) + dt;
    if (this._eT > 1) {
      this._eT = 0;
      this.tickEnergy(); t = pf.part('энергия', t);
      this.floraTick(now); t = pf.part('растения', t);
      this.wildTick(now); t = pf.part('поросль', t);
      this.builds.tick(now); t = pf.part('здания', t);
      this.tools.tick(now); t = pf.part('инструменты', t);
      this.animals.tick(now); t = pf.part('животные', t);
      this.quests.tick(); t = pf.part('задания', t);
      this.ach.tick(); t = pf.part('достижения', t);
      this.orders.tick(); t = pf.part('заказы', t);
      this.syncHint(); t = pf.part('подсказка', t);
      this.ui.tick(this); t = pf.part('интерфейс', t);
    }
    this.player.update(dt);
    // кнопка «Отменить всё»: видна, пока у призрачка есть дела, цифра — сколько их
    const tasks = this.player.tasks;
    if (tasks !== this._tasks) { this._tasks = tasks; this.ui.queueBtn(tasks); }
    t = pf.part('призрак', t);
    this.pourWater(dt);
    const OB = this.world.objects;
    for (let i = 0; i < OB.length; i++) {
      const o = OB[i];
      if (!o) continue;
      if (o.shake > 0) o.shake = Math.max(0, o.shake - dt);
      if (o.hop > 0) o.hop = Math.max(0, o.hop - dt); // прыжок животного (покормили, подросло)
    }
    const P = this.particles;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t >= p.life) { P[i] = P[P.length - 1]; P.pop(); }
    }
    const F = this.floaters;
    for (let i = F.length - 1; i >= 0; i--) { F[i].t += dt; if (F[i].t > 1.3) F.splice(i, 1); }
    if (this.tapFx) { this.tapFx.t -= dt; if (this.tapFx.t <= 0) this.tapFx = null; }
    // пока открыто меню у точки или окно (выбор семян для грядки) — время не идёт;
    // закрыли — прозрачность ещё чуть держится и гаснет
    if (this.look && !this.ui.popupShown && !this.ui.panelOpen && (this.look.t -= dt) <= 0) this.look = null;
  }

  isIdle() {
    // стрелка подсказки подпрыгивает изредка: только во время прыжка нужны частые кадры
    return !this.mover.active && this.player.idleTime > 2 && !this.particles.length && !this.floaters.length && !this.tapFx && !this.cam.animating && !this.hover &&
      !(this.scene && (this.scene.hintMoving || this.scene.ringsMoving));
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
// Пузырь с картинкой: пузырь с каплей (bubble_water), капля закрашена цветом пузыря, сверху — иконка предмета.
// → canvas 128×128 или null (картинок нет или пиксели нельзя прочитать)
function bubbleWith(base, icon) {
  if (!base || !icon) return null;
  try {
    const c = makeCanvas(128, 128), g = c.getContext('2d');
    g.drawImage(base, 0, 0, 128, 128);
    // середина пузыря — (64, 56), капля — в рамке 36…91 × 20…91 (ic_bubble_water)
    g.fillStyle = '#fce5c0';
    g.beginPath(); g.ellipse(64, 56, 31, 38, 0, 0, Math.PI * 2); g.fill();
    g.imageSmoothingQuality = 'high';
    g.drawImage(icon, 64 - 32, 56 - 32, 64, 64);
    return c;
  } catch (e) { return null; }
}

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
