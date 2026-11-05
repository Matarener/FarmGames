// Сцена фермы: состояние игрока, взаимодействия, рост растений, отрисовка мира.

import { toWorld, toGrid, HW, HH } from '../engine/Iso.js';
import { dimSprite, hash2, makeCanvas } from '../engine/Sprite.js';
import { World, N, CHUNK, CHUNKS, T, START_CHUNK } from './World.js';
import { Player } from './Player.js';
import { makeGhostData, ROD_TIP } from './ghost.js';
import * as art from './art.js';
import { loadArt } from './artSprites.js';
import { Quests } from './quests.js';
import { Mover } from './Mover.js';
import { CROPS, GOODS, FISH, FISH_CATCH, OBJECTS, WELL_COST, houseNeedChunks, STORAGE, ENERGY, ENERGY_REGEN_SEC, HOUSE, START, xpToNext, expansionCost, GEM_SPEEDUP_SEC } from './data.js';

const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };
// вид объёмной грядки: 'plain' — без каймы, 'grass' — с травяной каймой
export let BED_STYLE = 'plain';
export function setBedStyle(v) { BED_STYLE = v; }
const BG = '#3d7a35';
let SID = 0; // номер спрайта для отпечатка сцены

export class Farm {
  constructor({ renderer, camera, ui, tg, save, perf, audio }) {
    this.audio = audio;
    this.r = renderer; this.cam = camera; this.ui = ui; this.tg = tg; this.save = save; this.perf = perf;
    this.drawList = [];
    this.particles = [];
    this.floaters = [];
    this.hover = null;
    this.focus = [];
    this.tapFx = null;
    this.time = 0;
    this.gDirty = []; this.oDirty = []; // изменившиеся прямоугольники мира: x0,y0,x1,y1,...
    this._st = new Map(); this._stamp = 0; // прошлое состояние объектов и грядок — для поиска изменений
    this.stats = { layers: 0, parts: 0, live: 0 }; // сколько раз перерисованы слои; живых прямоугольников в кадре
    this.dirty = true;
    this.quests = new Quests(this);
    this.mover = new Mover(this);
    this.groundV = 0; // растёт, когда меняются клетки земли
    this.buildSprites();
    this.artReady = loadArt((k) => this.onArtProgress && this.onArtProgress(k)).then((a) => {
      Object.assign(this.S, { grass: a.grass, path: a.path, soil: a.soil, bed: a.bed, waterTex: a.waterTex, objArt: a.obj, stumpOf: a.stumpOf });
      a.house.forEach((h, l) => { if (h) this.S.house[l] = h; });
      a.well.forEach((s, i) => { if (s) this.S.well[i] = s; });
      if (a.water.every(Boolean) || a.waterTex) { this.S.waterArt = a.waterTex ? null : a.water; this.S.water.clear(); }
      this.groundV++;
      for (const [k, v] of Object.entries(a.crops)) if (v.length === 4 && this.S.crops[k]) this.S.crops[k] = v;
      for (const [k, url] of Object.entries(a.icons)) {
        const im = new Image(); im.src = url;
        im.onload = () => { this.icons[k] = url; this.iconImg[k] = im; this.dirty = true; this.onIcons && this.onIcons(k); };
      }
      this.dirty = true;
    }).catch((e) => console.warn('art', e));
  }

  buildSprites() {
    const S = {};
    S.grass = [0, 1, 2, 3].map((v) => art.grassTile(v));
    S.path = [0, 1].map((v) => art.pathTile(v));
    S.soil = [art.soilTile(false), art.soilTile(true)];
    S.water = new Map();
    S.trees = { oak: art.treeSprite('oak'), oak2: art.treeSprite('oak2'), apple: art.treeSprite('apple'), pine: art.treeSprite('pine') };
    const stump = art.stumpSprite(), rock = art.rockSprite(false);
    S.stumps = [stump, stump];
    S.rocks = [rock, rock];
    S.bush = art.bushSprite(false); S.berry = art.bushSprite(true);
    S.boulder = art.rockSprite(true);
    S.house = [null, 1, 2, 3, 4, 5].map((l) => l && art.houseSprite(l));
    S.well = [art.wellSprite(false), art.wellSprite(true)];
    S.crops = {};
    for (const c of Object.values(CROPS)) S.crops[c.key] = [0, 1, 2, 3].map((s) => art.cropSprite(c, s));
    S.bubble = { water: art.bubbleSprite('water'), ready: art.bubbleSprite('ready'), lock: art.bubbleSprite('lock') };
    this.S = S;
    this.icons = art.makeIcons(CROPS, FISH);
    this.iconImg = {};
    for (const [k, url] of Object.entries(this.icons)) { const im = new Image(); im.src = url; this.iconImg[k] = im; }
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

  // Текстура воды по координатам карты: одна картинка на весь пруд, без повторов по клеткам
  waterFill(ctx, gx, gy) {
    const t = this.S.waterTex;
    if (!this._wpat) {
      const p = ctx.createPattern(t.canvas, 'repeat');
      if (!p || !p.setTransform) { this.S.waterTex = null; this.S.water.clear(); return; }
      p.setTransform(new DOMMatrix().scale(1 / 128));
      this._wpat = p;
    }
    ctx.save();
    ctx.transform(HW, HH, -HW, HH, 0, 0); // клетка сетки → ромб на карте
    ctx.fillStyle = this._wpat;
    ctx.fillRect(gx - 0.02, gy - 0.02, 1.04, 1.04);
    ctx.restore();
  }

  waterSprite(x, y) {
    const w = this.world;
    const land = (xx, yy) => (!w.inside(xx, yy) || w.tile(xx, yy) !== T.WATER ? 1 : 0);
    const mask = land(x, y - 1) | (land(x + 1, y) << 1) | (land(x, y + 1) << 2) | (land(x - 1, y) << 3);
    // суша только по диагонали (угол тайла): углы T, R, B, L
    const dg = (land(x - 1, y - 1) && !(mask & 9) ? 1 : 0) | (land(x + 1, y - 1) && !(mask & 3) ? 2 : 0) |
      (land(x + 1, y + 1) && !(mask & 6) ? 4 : 0) | (land(x - 1, y + 1) && !(mask & 12) ? 8 : 0);
    const h = hash2(x * 7, y * 13), WA = this.S.waterArt;
    // с водой художника: 0 — гладь, 1 — блики, 2 — кувшинка, 3 — камыш (камыш только у берега)
    const lily = WA ? (h < 0.55 ? 0 : h < 0.75 ? 1 : h < 0.88 ? 2 : mask ? 3 : 1) : h < 0.3 ? 1 : 0;
    const key = (dg * 16 + mask) * 4 + lily;
    let s = this.S.water.get(key);
    if (!s) { s = art.waterTile(mask, lily, this.S.waterTex ? 'none' : WA && WA[lily], this.grassColor(), dg); this.S.water.set(key, s); }
    return s;
  }

  // Клетка земли изменилась: перерисовать только её окрестность (а не всю землю)
  touchTile(x, y) {
    toWorld(x + 0.5, y + 0.5, tmp);
    this.gDirty.push(tmp.x - HW * 2 - 4, tmp.y - 80, tmp.x + HW * 2 + 4, tmp.y + HH * 2 + 4);
  }

  bedStyle(v) { setBedStyle(v); this.groundV++; this.dirty = true; }

  objSprite(o) {
    const S = this.S;
    if (o.type === 'stump' && o.was && S.stumpOf) {
      // пень того дерева, которое срубили
      const tree = S.objArt[o.was], st = tree && S.stumpOf(tree[o.id % tree.length], o.id);
      if (st) return st;
    }
    const v = S.objArt && S.objArt[o.type];
    if (v && v.length) return v[o.id % v.length];
    switch (o.type) {
      case 'oak': case 'oak2': case 'apple': case 'pine': return S.trees[o.type];
      case 'stump': return S.stumps[o.id & 1];
      case 'bush': return S.bush;
      case 'berry': return S.berry;
      case 'rock': return S.rocks[o.id & 1];
      case 'boulder': return S.boulder;
      case 'house': return S.house[this.st.house];
      case 'well': return S.well[this.st.well ? 1 : 0];
    }
    return S.rocks[0];
  }

  // ---------------- Состояние ----------------

  init(saved) {
    const seed = saved && saved.seed ? saved.seed : (Math.random() * 2 ** 31) | 0;
    this.world = new World(seed);
    const w = this.world;
    this.beds = new Map();
    this.st = {
      coins: START.coins, gems: START.gems, xp: 0, level: 1,
      energy: START.energy, energyAt: Date.now(), can: 0, house: 1, well: 0,
      inv: { wood: 0, stone: 0, ore: 0 }, seeds: { carrot: 4 }, crops: {},
      stats: { cleared: 0, harvested: 0 },
    };
    let px = w.playerStart[0], py = w.playerStart[1];
    // v2 — сохранения версии с декором художника: там другой набор объектов,
    // поэтому из них берём только прогресс, а деревья и камни генерируются заново
    if (saved && (saved.v === 1 || saved.v === 2 || saved.v === 3)) {
      Object.assign(this.st, saved.st);
      if (saved.objects && saved.v !== 2) w.importObjects(saved.objects);
      if (saved.chunks) for (const c of saved.chunks) w.unlocked[c] = 1;
      // грядки переносили: стартовые клетки — трава, все грядки берём из сохранения
      if (this.st.movedBeds) for (const i of w.startBeds) w.tiles[i] = T.GRASS;
      // тропинки переставляли: берём их из сохранения
      if (this.st.paths) {
        for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === T.PATH) w.tiles[i] = T.GRASS;
        for (const i of this.st.paths) if (w.tiles[i] === T.GRASS && w.occ[i] < 0) w.tiles[i] = T.PATH;
      }
      for (const [i, crop, p, wt] of saved.beds || []) {
        w.tiles[i] = T.SOIL;
        this.bedAt(i).crop = crop || null; this.bedAt(i).p = p; this.bedAt(i).w = wt;
      }
      if (saved.player && w.walkable(saved.player[0], saved.player[1])) [px, py] = saved.player;
      // рост и энергия за время отсутствия
      const away = Math.max(0, (Date.now() - (saved.t || Date.now())) / 1000);
      if (away > 0) this.grow(away);
      this.awaySec = away;
    } else {
      for (const i of w.startBeds) this.bedAt(i);
      // одна грядка уже посажена — сразу видно, как всё работает
      // и уже созрела: первое задание — собрать её
      const b = this.bedAt(w.startBeds[0]); b.crop = 'carrot'; b.p = CROPS.carrot.time; b.w = 2;
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
    // старые сохранения: первое задание ещё не выполнено — стартовая морковка созревает сразу
    if (saved && !this.st.stats.harvested && !(this.st.quest && this.st.quest.i > 0)) {
      const b = this.beds.get(w.startBeds[0]);
      if (b && b.crop === 'carrot') { b.p = CROPS.carrot.time; b.w = 2; }
    }
    this.player = new Player(w, makeGhostData(), px, py);
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
    this.ui.update(this);
  }

  serialize() {
    const beds = [];
    for (const b of this.beds.values()) if (this.world.tiles[b.i] === T.SOIL) beds.push([b.i, b.crop || '', Math.round(b.p), b.w]);
    const chunks = [];
    this.world.unlocked.forEach((u, i) => u && chunks.push(i));
    return {
      v: 3, seed: this.world.seed, st: this.st, objects: this.world.exportObjects(), chunks, beds,
      player: [this.player.tx, this.player.ty],
    };
  }

  changed() { this.quests.check(); this.ui.update(this); this.save.schedule(() => this.serialize()); }

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

  cropInfo(b) {
    const c = CROPS[b.crop], total = c.time;
    const ready = b.p >= total;
    const stage = ready ? 3 : Math.min(2, Math.floor((b.p / total) * 3));
    const needsWater = !ready && (b.w === 0 || (b.w === 1 && b.p >= total * 2 / 3));
    return { c, total, ready, stage, needsWater, left: Math.max(0, total - b.p) };
  }

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
  get storage() { return STORAGE; }

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

  addItem(group, key, n) {
    const bag = this.st[group];
    const have = bag[key] || 0;
    const add = group === 'seeds' ? n : Math.max(0, Math.min(n, this.storage - have));
    bag[key] = have + add;
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
    this.cam.screenToWorld(sx, sy, tmp);
    toGrid(tmp.x, tmp.y, tmp2);
    const gx = Math.floor(tmp2.x), gy = Math.floor(tmp2.y);
    this.tapFx = { x: gx, y: gy, t: 0.35 };
    if (this.mover.active) return this.mover.tap(gx, gy, tmp.x, tmp.y);
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

  pick(wx, wy) {
    const L = this._ol ? this._ol.list : this.drawList; // объекты из слоя, по глубине
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i];
      if (d.kind !== 'o') continue;
      const s = this.objSprite(d);
      const big = d.type === 'house' || d.type === 'boulder';
      const kx = big ? 0.9 : 0.62;
      if (wx >= d.wx - s.ax * kx && wx <= d.wx + (s.w - s.ax) * kx && wy >= d.wy - s.ay * 0.92 && wy <= d.wy + (big ? (s.h - s.ay) * 0.8 : 6)) return d;
    }
    return null;
  }

  tapObject(o, sx, sy) {
    const w = this.world;
    if (!w.isOpen(o.gx, o.gy)) return this.expandPopup(w.chunkOf(o.gx, o.gy), sx, sy);
    if (o.type === 'house') return this.ui.housePanel(this);
    if (o.type === 'well') return this.wellPopup(o, sx, sy);
    const def = OBJECTS[o.type];
    if (!def) return;
    if (def.action) this.queue({ kind: def.action, obj: o });
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
    this.dirty = true;
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
      const have = st.seeds[c.key] || 0;
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
      const have = k === 'coins' ? st.coins : k === 'gems' ? st.gems : st.inv[k] || 0;
      if (have < v) return false;
    }
    return true;
  }

  pay(cost) {
    if (!this.canPay(cost)) return false;
    for (const [k, v] of Object.entries(cost)) {
      if (k === 'coins') this.st.coins -= v; else if (k === 'gems') this.st.gems -= v; else this.st.inv[k] -= v;
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
    const have = this.st.crops[key] || 0;
    n = Math.min(n, have);
    if (!n) return;
    this.st.crops[key] = have - n;
    this.st.coins += n * GOODS[key].sell;
    this.quests.emit('sell', key, n);
    this.sfx('coin');
    this.changed();
  }

  eat(key) {
    const c = GOODS[key];
    if (!c.food || !(this.st.crops[key] > 0)) return;
    if (this.st.energy >= this.maxEnergy) return this.toast('Энергия уже полная');
    this.st.crops[key]--;
    this.st.energy = Math.min(this.maxEnergy, this.st.energy + c.food);
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
      if (def.action !== a.kind) return false;
    }
    const cost = ENERGY[a.kind] || 0;
    if (cost && st.energy < cost) { this.spend(cost); this.player.queue.length = 0; return false; }
    const t = a.obj ? -1 : w.tile(a.x, a.y);
    switch (a.kind) {
      case 'dig': return t === T.GRASS && w.occ[w.idx(a.x, a.y)] < 0;
      case 'plant': {
        const b = this.bedAt(w.idx(a.x, a.y));
        if (t !== T.SOIL || b.crop) return false;
        if (!(st.seeds[a.crop] > 0) && st.coins < CROPS[a.crop].seed) { this.toast('Не хватает монет на семена', 'warn'); return false; }
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
        const hy = o.type === 'stump' || o.type === 'rock' || o.type === 'bush' || o.type === 'berry' ? 8 : o.type === 'boulder' ? 20 : 26;
        this.burst(o.wx, o.wy - hy, a.kind === 'chop' ? '#b07a45' : '#b8bec3', 6);
        if (a.kind === 'chop' && o.type !== 'stump') this.burst(o.wx, o.wy - 60, '#5aa83a', 4, true);
        if (o.hp <= 0) { this.destroy(o); this.changed(); return false; }
        this.ui.update(this);
        return st.energy >= 1;
      }
      case 'dig': {
        if (w.tiles[w.idx(a.x, a.y)] !== T.GRASS || w.occ[w.idx(a.x, a.y)] >= 0) return false;
        if (!this.spend(ENERGY.dig)) return false;
        w.tiles[w.idx(a.x, a.y)] = T.SOIL; this.touchTile(a.x, a.y);
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
        if (st.seeds[a.crop] > 0) st.seeds[a.crop]--; else if (st.coins >= c.seed) st.coins -= c.seed; else return false;
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
        const got = this.addItem('crops', fish.key, 1);
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
        const got = this.addItem('crops', c.key, 1);
        if (!got) return false;
        this.float(b.wx, b.wy - 20, '+1', c.key);
        if (Math.random() < 0.25) { this.addItem('seeds', c.key, 1); this.float(b.wx + 12, b.wy - 34, '+1', 'seed'); }
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

  destroy(o) {
    const def = OBJECTS[o.type], st = this.st;
    let dy = -30;
    for (const [res, [a, b]] of Object.entries(def.drops || {})) {
      const n = a + Math.floor(Math.random() * (b - a + 1));
      const got = this.addItem('inv', res, n);
      if (got) { this.float(o.wx, o.wy + dy, `+${got}`, res); dy -= 14; }
    }
    if (def.oreChance && Math.random() < def.oreChance) {
      const [o0, o1] = def.ore || [1, 2], got = this.addItem('inv', 'ore', o0 + Math.floor(Math.random() * (o1 - o0 + 1)));
      if (got) { this.float(o.wx + 14, o.wy + dy, `+${got}`, 'ore'); dy -= 14; }
    }
    if (def.seedChance && Math.random() < def.seedChance) {
      const opts = Object.values(CROPS).filter((c) => c.level <= st.level);
      const c = opts[Math.floor(Math.random() * opts.length)];
      this.addItem('seeds', c.key, 1);
      this.float(o.wx - 14, o.wy + dy, '+1', 'seed');
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
  drawFishing(ctx) {
    const p = this.player, an = p.anim, a = p.current;
    if (p.state !== 'work' || !a || a.kind !== 'fish' || an.name !== 'fish' || an.time < 0.42 || an.time > 2.3) return;
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
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + bx) / 2, Math.max(y, by) + 6, bx, by); ctx.stroke();
    if (k >= 1 && !yank) { // круги на воде
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.ellipse(bx, by + 1.5, 4 + bite * 3, 1.8 + bite * 1.2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#3d2b1f'; ctx.beginPath(); ctx.arc(bx, by, 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by + 0.4, 1.5, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#e2392f'; ctx.beginPath(); ctx.arc(bx, by - 0.2, 1.5, Math.PI, 0); ctx.fill();
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
    const m = 120;
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
    if (this._eT > 1) { this._eT = 0; this.tickEnergy(); this.ui.tick(this); }
    this.player.update(dt);
    this.pourWater(dt);
    for (const o of this.world.objects) if (o && o.shake > 0) o.shake = Math.max(0, o.shake - dt);
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
    return !this.mover.active && this.player.idleTime > 2 && !this.particles.length && !this.floaters.length && !this.tapFx && !this.cam.animating && !this.hover && !this._zoomPending;
  }

  // ---------------- Отрисовка ----------------

  drawGround(ctx) {
    const r = this.r, w = this.world, v = r.view;
    // видимый диапазон клеток
    let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
    for (const [x, y] of [[v.minX, v.minY], [v.maxX, v.minY], [v.minX, v.maxY], [v.maxX, v.maxY]]) {
      toGrid(x, y, tmp);
      gx0 = Math.min(gx0, tmp.x); gx1 = Math.max(gx1, tmp.x); gy0 = Math.min(gy0, tmp.y); gy1 = Math.max(gy1, tmp.y);
    }
    gx0 = Math.max(0, Math.floor(gx0) - 1); gy0 = Math.max(0, Math.floor(gy0) - 1);
    gx1 = Math.min(N - 1, Math.ceil(gx1) + 1); gy1 = Math.min(N - 1, Math.ceil(gy1) + 1);

    // основа карты (закрывает швы между тайлами)
    ctx.fillStyle = '#7cc44f';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(N * HW, N * HH); ctx.lineTo(0, N * 2 * HH); ctx.lineTo(-N * HW, N * HH); ctx.closePath(); ctx.fill();

    // земля
    const S = this.S, raised = [];
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = (gx - gy) * HW, cy = (gx + gy + 1) * HH;
        if (cx + HW < v.minX || cx - HW > v.maxX || cy + HH < v.minY || cy - HH > v.maxY) continue;
        const i = gy * N + gx, t = w.tiles[i];
        let s;
        if (t === T.GRASS) s = S.grass[w.variant[i]];
        else if (t === T.PATH) s = S.path[(gx + gy) & 1];
        else if (t === T.WATER) { if (S.waterTex) this.waterFill(ctx, gx, gy); s = this.waterSprite(gx, gy); }
        else {
          const b = this.beds.get(i);
          const wet = b && b.crop && !this.cropInfo(b).needsWater && !this.cropInfo(b).ready;
          if (S.bed) {
            // объёмная грядка выше земли: сначала трава под ней, сама грядка — вторым проходом
            raised.push([cx, cy, wet ? 1 : 0]);
            s = S.grass[w.variant[i]];
          } else s = S.soil[wet ? 1 : 0];
        }
        ctx.drawImage(s.canvas, cx - s.ax, cy - s.ay, s.w, s.h);
      }
    }
    // ближние грядки ложатся поверх дальних
    if (raised.length) {
      const BS = S.bed[BED_STYLE];
      raised.sort((a, b) => a[1] - b[1]);
      for (const [x, y, wet] of raised) { const s = BS[wet]; ctx.drawImage(s.canvas, x - s.ax, y - s.ay, s.w, s.h); }
    }

    // туман над закрытыми участками
    for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      if (w.unlocked[c]) continue;
      const cb = w.chunkBounds(c);
      if (!r.visible(cb.minX, cb.minY, cb.maxX - cb.minX, cb.maxY - cb.minY)) continue;
      const x0 = (c % CHUNKS) * CHUNK, y0 = ((c / CHUNKS) | 0) * CHUNK;
      ctx.fillStyle = w.canUnlock(c) ? 'rgba(18,44,24,0.34)' : 'rgba(14,34,20,0.5)';
      ctx.beginPath();
      toWorld(x0, y0, tmp); ctx.moveTo(tmp.x, tmp.y);
      toWorld(x0 + CHUNK, y0, tmp); ctx.lineTo(tmp.x, tmp.y);
      toWorld(x0 + CHUNK, y0 + CHUNK, tmp); ctx.lineTo(tmp.x, tmp.y);
      toWorld(x0, y0 + CHUNK, tmp); ctx.lineTo(tmp.x, tmp.y);
      ctx.closePath(); ctx.fill();
    }
    // граница открытой территории
    this.drawBorder(ctx);
  }

  // Слой — закэшированная картинка части мира с запасом по краям. Пока камера двигается в пределах
  // запаса, слой только сдвигается; при щипке — растягивается, а перерисовывается, когда зум замер.
  layerStale(L, key, settled, r, CW, CH) {
    if (!L.c || L.key !== key) return true;
    if (L.va !== r.va && settled) return true;
    const k = r.va / L.va, x0 = r.ve - k * L.ox, y0 = r.vf - k * L.oy;
    return x0 > 0.5 || y0 > 0.5 || x0 + L.c.width * k < CW - 0.5 || y0 + L.c.height * k < CH - 0.5;
  }

  buildLayer(L, key, r, CW, CH, draw) {
    const MX = Math.ceil(CW * 0.25), MY = Math.ceil(CH * 0.25);
    if (!L.c || L.c.width !== CW + 2 * MX || L.c.height !== CH + 2 * MY) L.c = makeCanvas(CW + 2 * MX, CH + 2 * MY);
    const g = L.c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = r.ctx.imageSmoothingQuality;
    L.key = key; L.va = r.va; L.ox = r.ve + MX; L.oy = r.vf + MY; L.ver = (L.ver || 0) + 1;
    const v = r.view, save = { ...v }, ex = MX / r.va, ey = MY / r.va;
    v.minX -= ex; v.maxX += ex; v.minY -= ey; v.maxY += ey;
    g.setTransform(1, 0, 0, 1, 0, 0);
    draw(g);
    Object.assign(v, save);
    this.stats.layers++;
  }

  // нарисовать слой в контекст с преобразованием (va, ox, oy); контекст в пикселях
  blitLayer(ctx, L, va, ox, oy) {
    const k = va / L.va;
    if (k === 1) ctx.drawImage(L.c, Math.round(ox - L.ox), Math.round(oy - L.oy));
    else ctx.drawImage(L.c, ox - k * L.ox, oy - k * L.oy, L.c.width * k, L.c.height * k);
  }

  // Сравнить сцену с прошлым кадром: какие объекты и растения поменяли картинку или место,
  // какие грядки стали политыми/сухими. Их прямоугольники попадают в списки перерисовки.
  diffScene() {
    const M = this._st, stamp = ++this._stamp, O = this.oDirty, G = this.gDirty;
    const mark = (key, sig, x0, y0, x1, y1, ground) => {
      let e = M.get(key);
      if (!e) { e = { sig, x0, y0, x1, y1, stamp }; M.set(key, e); (ground ? G : O).push(x0, y0, x1, y1); return; }
      e.stamp = stamp;
      if (e.sig === sig && e.x0 === x0 && e.y0 === y0) return;
      (ground ? G : O).push(e.x0, e.y0, e.x1, e.y1, x0, y0, x1, y1);
      e.sig = sig; e.x0 = x0; e.y0 = y0; e.x1 = x1; e.y1 = y1;
    };
    for (const o of this.world.objects) {
      if (!o) continue;
      const s = this.objSprite(o);
      if (!s._sid) s._sid = ++SID;
      const x0 = o.wx - s.ax - 6, y0 = o.wy - s.ay - 2;
      mark(o, s._sid, x0, y0, x0 + s.w + 12, y0 + s.h + 4, false);
    }
    for (const b of this.beds.values()) {
      const info = b.crop ? this.cropInfo(b) : null;
      const wet = info && !info.needsWater && !info.ready ? 1 : 0;
      mark(b, wet, b.wx - HW * 2, b.wy - 70, b.wx + HW * 2, b.wy + HH * 2, true);
      if (b.crop) {
        const c = this.S.crops[b.crop][info.stage];
        if (!c._sid) c._sid = ++SID;
        mark(b.dr, c._sid, b.wx - c.ax - 4, b.wy - c.ay - 4, b.wx - c.ax + c.w + 4, b.wy - c.ay + c.h + 4, false);
      }
    }
    for (const [k, e] of M) if (e.stamp !== stamp) { (k.kind === 'c' || k.kind === 'o' || k.type ? O : G).push(e.x0, e.y0, e.x1, e.y1); M.delete(k); }
  }

  // Перерисовать в слое только прямоугольники R (в его собственном масштабе и сдвиге)
  patchLayer(L, R, r, draw) {
    const g = L.c.getContext('2d'), v = r.view, save = { ...v };
    v.minX = Infinity; v.minY = Infinity; v.maxX = -Infinity; v.maxY = -Infinity;
    g.save();
    // прямоугольники по целым пикселям слоя: без полупрозрачных краёв у клипа
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    for (let i = 0; i < R.length; i += 4) {
      const x0 = Math.floor(R[i] * L.va + L.ox), y0 = Math.floor(R[i + 1] * L.va + L.oy);
      g.rect(x0, y0, Math.ceil(R[i + 2] * L.va + L.ox) - x0, Math.ceil(R[i + 3] * L.va + L.oy) - y0);
      v.minX = Math.min(v.minX, R[i]); v.minY = Math.min(v.minY, R[i + 1]); v.maxX = Math.max(v.maxX, R[i + 2]); v.maxY = Math.max(v.maxY, R[i + 3]);
    }
    g.clip();
    g.setTransform(L.va, 0, 0, L.va, L.ox, L.oy);
    draw(g);
    g.restore();
    Object.assign(v, save);
    this.stats.parts++;
  }

  // статичные объекты и растения в пределах видимой области (с запасом), по глубине
  staticList(out) {
    const r = this.r, w = this.world;
    out.length = 0;
    for (const o of w.objects) {
      if (!o) continue;
      const s = this.objSprite(o);
      if (!r.visible(o.wx - s.ax - 4, o.wy - s.ay, s.w + 8, s.h)) continue;
      o.kind = 'o';
      out.push(o);
    }
    for (const b of this.beds.values()) {
      if (!b.crop || !r.visible(b.wx - 32, b.wy - 44, 64, 60)) continue;
      out.push(b.dr);
    }
    out.sort((a, b) => a.depth - b.depth || a.wy - b.wy);
    return out;
  }

  // пересекает ли картинка объекта/растения какой-нибудь прямоугольник из R
  hitsRects(d, R) {
    let x0, y0, x1, y1;
    if (d.kind === 'o') { const s = this.objSprite(d); x0 = d.wx - s.ax - 4; y0 = d.wy - s.ay; x1 = x0 + s.w + 8; y1 = y0 + s.h; }
    else { const b = d.bed, s = this.S.crops[b.crop][this.cropInfo(b).stage]; x0 = b.wx - s.ax - 4; y0 = b.wy - s.ay - 4; x1 = x0 + s.w + 8; y1 = y0 + s.h + 8; }
    for (let i = 0; i < R.length; i += 4) if (x0 < R[i + 2] && x1 > R[i] && y0 < R[i + 3] && y1 > R[i + 1]) return true;
    return false;
  }

  drawItem(ctx, d, live) {
    if (d.kind === 'o') {
      let s = this.objSprite(d);
      if (!this.world.isOpen(d.gx, d.gy)) s = dimSprite(s);
      const sh = live && d.shake > 0 ? Math.sin(this.time * 70) * 2.2 * (d.shake / 0.25) : 0;
      if (live && d.fade) ctx.globalAlpha = 1 - 0.62 * d.fade;
      ctx.drawImage(s.canvas, d.wx - s.ax + sh, d.wy - s.ay, s.w, s.h);
      ctx.globalAlpha = 1;
    } else if (d.kind === 'c') {
      const b = d.bed, info = this.cropInfo(b);
      const s = this.S.crops[b.crop][info.stage];
      ctx.drawImage(s.canvas, b.wx - s.ax, b.wy - s.ay, s.w, s.h);
    } else this.player.draw(this.r);
  }

  render() {
    const r = this.r, ctx = r.ctx, w = this.world, S = this.S;
    r.begin(this.cam, null);
    const CW = r.canvas.width, CH = r.canvas.height;

    // зум во время щипка: слои растягиваются, перерисовка — когда масштаб не меняется 0.2 с
    const now = performance.now();
    if (this.cam.zoom !== this._lastZoom) { this._lastZoom = this.cam.zoom; this._zoomAt = now; }
    const settled = now - (this._zoomAt || 0) > 200;

    // Слой 1: земля, вода, грядки, туман, граница. Меняется редко.
    this.diffScene();
    const G = this._gl || (this._gl = {});
    const gkey = `${CW}x${CH}|${this.groundV}|${w.unlockedCount()}`;
    let gPatched = false;
    if (this.layerStale(G, gkey, settled, r, CW, CH) || this.gDirty.length > 4 * 40) {
      this.buildLayer(G, gkey, r, CW, CH, (g) => {
        g.fillStyle = BG; g.fillRect(0, 0, G.c.width, G.c.height);
        g.setTransform(r.va, 0, 0, r.va, G.ox, G.oy);
        this.drawGround(g);
      });
    } else if (this.gDirty.length) {
      this.patchLayer(G, this.gDirty, r, (g) => {
        g.fillStyle = BG; g.fillRect(-1e5, -1e5, 2e5, 2e5);
        this.drawGround(g);
      });
      gPatched = true;
    }

    // Слой 2: земля + все неподвижные объекты и растения. Перерисовывается, только когда что-то
    // изменилось (срубили дерево, выросла морковка, переставили дом) или камера ушла за запас.
    const O = this._ol || (this._ol = { list: [] });
    const okey = `${G.ver}`;
    // на изменённой земле объекты тоже надо положить заново
    if (gPatched) for (const x of this.gDirty) this.oDirty.push(x);
    this.gDirty.length = 0;
    const OD = this.oDirty;
    if (OD.length && O.c && O.key === okey && OD.length <= 4 * 40 && !this.layerStale(O, okey, settled, r, CW, CH)) {
      this.patchLayer(O, OD, r, (g) => {
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); this.blitLayer(g, G, O.va, O.ox, O.oy); g.restore();
        // список объектов слоя: в границах слоя, а не экрана
        const v = r.view, k = O.va;
        v.minX = -O.ox / k; v.minY = -O.oy / k; v.maxX = (O.c.width - O.ox) / k; v.maxY = (O.c.height - O.oy) / k;
        for (const d of this.staticList(O.list)) if (this.hitsRects(d, OD)) this.drawItem(g, d, false);
        g.globalAlpha = 0.45; this.drawBorder(g); g.globalAlpha = 1;
      });
      OD.length = 0;
    }
    if (this.layerStale(O, okey, settled, r, CW, CH) || OD.length) {
      OD.length = 0;
      this.buildLayer(O, okey, r, CW, CH, (g) => {
        g.clearRect(0, 0, O.c.width, O.c.height);
        this.blitLayer(g, G, r.va, O.ox, O.oy);
        g.setTransform(r.va, 0, 0, r.va, O.ox, O.oy);
        for (const d of this.staticList(O.list)) this.drawItem(g, d, false);
        g.globalAlpha = 0.45; this.drawBorder(g); g.globalAlpha = 1;
      });
    }
    this._zoomPending = G.va !== r.va || O.va !== r.va; // слой растянут — после щипка перерисуем чётко
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.blitLayer(ctx, O, r.va, r.ve, r.vf);
    r.resetView();

    // Живая часть кадра: фермер, качающиеся и полупрозрачные объекты. Только в их прямоугольниках
    // заново рисуется земля и всё, что там стоит, по глубине — остальное берётся из слоя.
    const p = this.player;
    toWorld(p.x, p.y, tmp);
    const pd = this._pd || (this._pd = { kind: 'p' });
    pd.depth = p.x + p.y; pd.wy = tmp.y;
    const R = this._rects || (this._rects = []); R.length = 0;
    R.push(tmp.x - 30, tmp.y - 95, tmp.x + 30, tmp.y + 12);
    // Что нельзя закрывать: фермер, клетка под курсором, клетка последнего тапа.
    const F = this.focus; F.length = 0;
    F.push({ x0: tmp.x - 11, y0: tmp.y - 50, x1: tmp.x + 11, y1: tmp.y, depth: p.x + p.y, gx: -1, gy: -1 });
    for (const t of [this.hover, this.tapFx]) {
      if (!t || !w.inside(t.x, t.y)) continue;
      toWorld(t.x + 0.5, t.y + 0.5, tmp);
      F.push({ x0: tmp.x - HW + 6, y0: tmp.y - HH + 3, x1: tmp.x + HW - 6, y1: tmp.y + HH - 3, depth: t.x + t.y + 1, gx: t.x, gy: t.y });
    }
    let playerHidden = false;
    const list = O.list;
    for (const d of list) {
      if (d.kind !== 'o') continue;
      const s = this.objSprite(d);
      const fade = this.occludes(d, s, F);
      if (fade && F[0].hit) playerHidden = true;
      if (fade || d.fade) {
        d.fade = (d.fade || 0) + (fade - (d.fade || 0)) * 0.3;
        if (d.fade < 0.02) d.fade = 0;
      }
      if (d.fade || fade || d.shake > 0) R.push(d.wx - s.ax - 4, d.wy - s.ay - 1, d.wx - s.ax + s.w + 4, d.wy - s.ay + s.h + 1);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    for (let i = 0; i < R.length; i += 4) {
      const x0 = Math.floor(R[i] * r.va + r.ve), y0 = Math.floor(R[i + 1] * r.va + r.vf);
      ctx.rect(x0, y0, Math.ceil(R[i + 2] * r.va + r.ve) - x0, Math.ceil(R[i + 3] * r.va + r.vf) - y0);
    }
    ctx.clip();
    this.blitLayer(ctx, G, r.va, r.ve, r.vf);
    r.resetView();
    let pDone = false;
    for (const d of list) {
      if (!pDone && (d.depth > pd.depth || (d.depth === pd.depth && d.wy > pd.wy))) { this.drawItem(ctx, pd, true); pDone = true; }
      if (this.hitsRects(d, R)) this.drawItem(ctx, d, true);
    }
    if (!pDone) this.drawItem(ctx, pd, true);
    ctx.globalAlpha = 0.45; this.drawBorder(ctx); ctx.globalAlpha = 1;
    ctx.restore();
    this.stats.live = R.length / 4;

    // фермер за объектом: полупрозрачная копия поверх
    if (playerHidden) { ctx.globalAlpha = 0.4; p.draw(r); ctx.globalAlpha = 1; }

    // рамки поверх объектов: клетка под курсором, тап
    if (this.hover && w.inside(this.hover.x, this.hover.y)) this.tileOutline(ctx, this.hover.x, this.hover.y, 'rgba(255,255,255,0.75)', 1.8);
    if (this.tapFx) this.tileOutline(ctx, this.tapFx.x, this.tapFx.y, `rgba(255,250,200,${Math.min(1, this.tapFx.t * 2.4)})`, 2.5);

    // значки над грядками
    const bob = Math.sin(this.time * 4) * 1.5;
    for (const b of this.beds.values()) {
      if (!b.crop || !r.visible(b.wx - 12, b.wy - 70, 24, 40)) continue;
      const info = this.cropInfo(b);
      const s = info.ready ? S.bubble.ready : info.needsWater ? S.bubble.water : null;
      if (s) ctx.drawImage(s.canvas, b.wx - s.ax, b.wy - 26 - s.ay + bob, s.w, s.h);
    }

    this.drawQueue(ctx);
    this.drawSigns(ctx);
    this.mover.draw(ctx);

    this.drawFishing(ctx);

    // частицы
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, 1 - q.t / q.life);
      ctx.fillStyle = q.c;
      ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
    }
    ctx.globalAlpha = 1;

    // всплывающие числа
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const k = f.t / 1.3;
      ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) * 4;
      const y = f.y - k * 26;
      const tw = ctx.measureText(f.text).width;
      const iw = f.icon ? 12 : 0;
      const x = f.x - (tw + iw) / 2;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,25,15,0.8)';
      ctx.strokeText(f.text, x, y); ctx.fillStyle = '#fffbe8'; ctx.fillText(f.text, x, y);
      if (f.icon && this.iconImg[f.icon]) ctx.drawImage(this.iconImg[f.icon], x + tw + 1, y - 6, 12, 12);
    }
    ctx.globalAlpha = 1;
  }

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

  tileOutline(ctx, x, y, color, lw) {
    toWorld(x + 0.5, y + 0.5, tmp);
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(tmp.x, tmp.y - HH + 1); ctx.lineTo(tmp.x + HW - 2, tmp.y); ctx.lineTo(tmp.x, tmp.y + HH - 1); ctx.lineTo(tmp.x - HW + 2, tmp.y);
    ctx.closePath(); ctx.stroke();
  }

  drawBorder(ctx) {
    const w = this.world;
    ctx.strokeStyle = 'rgba(255,240,190,0.55)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      if (!w.unlocked[c]) continue;
      const cx = c % CHUNKS, cy = (c / CHUNKS) | 0, x0 = cx * CHUNK, y0 = cy * CHUNK;
      const open = (dx, dy) => { const x = cx + dx, y = cy + dy; return x >= 0 && y >= 0 && x < CHUNKS && y < CHUNKS && w.unlocked[y * CHUNKS + x]; };
      const seg = (ax, ay, bx, by) => { toWorld(ax, ay, tmp); ctx.moveTo(tmp.x, tmp.y); toWorld(bx, by, tmp); ctx.lineTo(tmp.x, tmp.y); };
      if (!open(0, -1)) seg(x0, y0, x0 + CHUNK, y0);
      if (!open(1, 0)) seg(x0 + CHUNK, y0, x0 + CHUNK, y0 + CHUNK);
      if (!open(0, 1)) seg(x0, y0 + CHUNK, x0 + CHUNK, y0 + CHUNK);
      if (!open(-1, 0)) seg(x0, y0, x0, y0 + CHUNK);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawQueue(ctx) {
    const p = this.player;
    const list = p.current && p.current.kind !== 'walk' ? [p.current, ...p.queue] : p.queue;
    ctx.font = '700 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    list.forEach((a, i) => {
      let x, y;
      if (a.obj) { const s = this.objSprite(a.obj); x = a.obj.wx; y = a.obj.wy - Math.min(s.ay * 0.7, 60) - 6; }
      else { toWorld(a.x + 0.5, a.y + 0.5, tmp); x = tmp.x; y = tmp.y - 8; }
      ctx.fillStyle = 'rgba(61,43,31,0.9)'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = i === 0 && a === p.current ? '#ffe066' : '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 4.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d2b1f'; ctx.fillText(String(i + 1), x, y + 0.3);
    });
    ctx.textAlign = 'left';
  }

  drawSigns(ctx) {
    const w = this.world, r = this.r;
    const n = w.unlockedCount();
    const blocked = n >= HOUSE[this.st.house].chunks;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      if (!w.canUnlock(c)) continue;
      const cx = c % CHUNKS, cy = (c / CHUNKS) | 0;
      toWorld(cx * CHUNK + CHUNK / 2, cy * CHUNK + CHUNK / 2, tmp);
      if (!r.visible(tmp.x - 50, tmp.y - 40, 100, 60)) continue;
      const x = tmp.x, y = tmp.y - 24;
      const label = blocked ? 'Нужен дом выше' : 'Открыть участок';
      ctx.font = '700 9px system-ui, sans-serif';
      const tw = ctx.measureText(label).width, bw = tw + 30;
      ctx.fillStyle = 'rgba(61,43,31,0.92)';
      ctx.beginPath(); ctx.roundRect(x - bw / 2 - 2, y - 13, bw + 4, 26, 8); ctx.fill();
      ctx.fillStyle = blocked ? '#c9b48a' : '#f6d37a';
      ctx.beginPath(); ctx.roundRect(x - bw / 2, y - 11, bw, 22, 7); ctx.fill();
      ctx.fillStyle = '#3d2b1f';
      ctx.fillText(label, x + 8, y + 0.5);
      if (this.iconImg.lock) ctx.drawImage(this.iconImg.lock, x - bw / 2 + 3, y - 7, 14, 14);
    }
    ctx.textAlign = 'left';
  }
}

export function fmtTime(sec) {
  sec = Math.ceil(sec);
  if (sec < 60) return `${sec} с`;
  if (sec < 3600) { const m = Math.floor(sec / 60), s = sec % 60; return s ? `${m} мин ${s} с` : `${m} мин`; }
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
