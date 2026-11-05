// Сцена фермы: состояние игрока, взаимодействия, рост растений, отрисовка мира.

import { toWorld, toGrid, HW, HH } from '../engine/Iso.js';
import { dimSprite, hash2 } from '../engine/Sprite.js';
import { World, N, CHUNK, CHUNKS, T, START_CHUNK } from './World.js';
import { Player } from './Player.js';
import { makeFarmerData } from './farmer.js';
import * as art from './art.js';
import { CROPS, OBJECTS, ENERGY, ENERGY_REGEN_SEC, HOUSE, START, xpToNext, expansionCost, GEM_SPEEDUP_SEC } from './data.js';

const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };
const BG = '#3d7a35';

export class Farm {
  constructor({ renderer, camera, ui, tg, save, perf }) {
    this.r = renderer; this.cam = camera; this.ui = ui; this.tg = tg; this.save = save; this.perf = perf;
    this.drawList = [];
    this.particles = [];
    this.floaters = [];
    this.hover = null;
    this.focus = [];
    this.tapFx = null;
    this.time = 0;
    this.dirty = true;
    this.buildSprites();
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
    S.crops = {};
    for (const c of Object.values(CROPS)) S.crops[c.key] = [0, 1, 2, 3].map((s) => art.cropSprite(c, s));
    S.bubble = { water: art.bubbleSprite('water'), ready: art.bubbleSprite('ready'), lock: art.bubbleSprite('lock') };
    this.S = S;
    this.icons = art.makeIcons(CROPS);
    this.iconImg = {};
    for (const [k, url] of Object.entries(this.icons)) { const im = new Image(); im.src = url; this.iconImg[k] = im; }
  }

  waterSprite(x, y) {
    const w = this.world;
    const land = (xx, yy) => (!w.inside(xx, yy) || w.tile(xx, yy) !== T.WATER ? 1 : 0);
    const mask = land(x, y - 1) | (land(x + 1, y) << 1) | (land(x, y + 1) << 2) | (land(x - 1, y) << 3);
    const lily = hash2(x * 7, y * 13) < 0.3 ? 1 : 0;
    const key = mask * 2 + lily;
    let s = this.S.water.get(key);
    if (!s) { s = art.waterTile(mask, lily); this.S.water.set(key, s); }
    return s;
  }

  objSprite(o) {
    const S = this.S;
    switch (o.type) {
      case 'oak': case 'oak2': case 'apple': case 'pine': return S.trees[o.type];
      case 'stump': return S.stumps[o.id & 1];
      case 'bush': return S.bush;
      case 'berry': return S.berry;
      case 'rock': return S.rocks[o.id & 1];
      case 'boulder': return S.boulder;
      case 'house': return S.house[this.st.house];
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
      energy: START.energy, energyAt: Date.now(), can: 0, house: 1,
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
      const b = this.bedAt(w.startBeds[0]); b.crop = 'carrot'; b.p = 0; b.w = 1;
      this.st.can = 2;
    }
    for (const i of w.startBeds) if (w.tiles[i] !== T.SOIL) w.tiles[i] = T.SOIL;
    this.player = new Player(w, makeFarmerData(), px, py);
    this.player.handlers = {
      canStart: (a) => this.canStart(a),
      perform: (a) => this.perform(a),
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

  changed() { this.ui.update(this); this.save.schedule(() => this.serialize()); }

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
  get storage() { return HOUSE[this.st.house].storage; }

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
      this.player.celebrate();
      this.tg.haptic('success');
    }
  }

  // ---------------- Ввод ----------------

  onTap(sx, sy) {
    this.ui.closePopup();
    this.cam.screenToWorld(sx, sy, tmp);
    toGrid(tmp.x, tmp.y, tmp2);
    const gx = Math.floor(tmp2.x), gy = Math.floor(tmp2.y);
    this.tapFx = { x: gx, y: gy, t: 0.35 };
    // объект в выделенной клетке важнее спрайта, который её перекрывает сверху
    const o = this.world.objectAt(gx, gy) || this.pick(tmp.x, tmp.y);
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
    const L = this.drawList;
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
    const def = OBJECTS[o.type];
    if (!def) return;
    if (def.action) this.queue({ kind: def.action, obj: o });
  }

  tapTile(x, y, sx, sy) {
    const w = this.world;
    if (!w.inside(x, y)) return;
    if (!w.isOpen(x, y)) return this.expandPopup(w.chunkOf(x, y), sx, sy);
    const t = w.tile(x, y);
    if (t === T.WATER) return this.queue({ kind: 'fill', x, y });
    if (t === T.SOIL) return this.tapBed(this.bedAt(w.idx(x, y)), sx, sy);
    if (w.occ[w.idx(x, y)] >= 0) return;
    const items = [{ icon: 'walk', label: 'Идти сюда', onClick: () => this.queue({ kind: 'walk', x, y }) }];
    if (t === T.GRASS) items.push({ icon: 'dig', label: 'Вскопать грядку', sub: `⚡ ${ENERGY.dig}`, onClick: () => this.queue({ kind: 'dig', x, y }) });
    this.ui.popup(sx, sy, { items });
  }

  tapBed(b, sx, sy) {
    if (!b.crop) return this.seedPopup(b, sx, sy);
    const info = this.cropInfo(b);
    if (info.ready) return this.queue({ kind: 'harvest', x: b.x, y: b.y });
    if (info.needsWater) return this.queue({ kind: 'water', x: b.x, y: b.y });
    const gems = Math.max(1, Math.ceil(info.left / GEM_SPEEDUP_SEC));
    this.ui.popup(sx, sy, {
      title: info.c.name, text: `Созреет через ${fmtTime(info.left)}`,
      items: [{ icon: 'gem', label: 'Ускорить', sub: `${gems} 💎`, disabled: this.st.gems < gems, onClick: () => {
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
        sub: locked ? `с ${c.level} ур.` : have ? `семян: ${have} · ${fmtTime(c.time)}` : `${c.seed} 🪙 · ${fmtTime(c.time)}`,
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
    this.addXp(10);
    this.tg.haptic('success');
    this.changed();
  }

  upgradeHouse() {
    const next = HOUSE[this.st.house + 1];
    if (!next || !this.pay(next.cost)) return false;
    const oldMax = this.maxEnergy;
    this.st.house++;
    this.st.energy += this.maxEnergy - oldMax;
    const h = this.world.objects.find((o) => o && o.type === 'house');
    if (h) { this.burst(h.wx, h.wy - 40, '#ffe066', 30); this.float(h.wx, h.wy - 110, `Дом ${this.st.house} ур.`, null); }
    this.addXp(20);
    this.player.celebrate();
    this.tg.haptic('success');
    this.changed();
    return true;
  }

  sell(key, n) {
    const have = this.st.crops[key] || 0;
    n = Math.min(n, have);
    if (!n) return;
    this.st.crops[key] = have - n;
    this.st.coins += n * CROPS[key].sell;
    this.tg.haptic('light');
    this.changed();
  }

  eat(key) {
    const c = CROPS[key];
    if (!c.food || !(this.st.crops[key] > 0)) return;
    if (this.st.energy >= this.maxEnergy) return this.toast('Энергия уже полная');
    this.st.crops[key]--;
    this.st.energy = Math.min(this.maxEnergy, this.st.energy + c.food);
    this.tg.haptic('light');
    this.changed();
  }

  queue(a) {
    if (!this.player.enqueue(a)) { this.toast('Очередь заполнена'); return; }
    this.tg.haptic('select');
  }

  toast(msg, kind) { this.ui.toast(msg, kind); if (kind === 'warn') this.tg.haptic('warning'); }

  // ---------------- Выполнение действий ----------------

  nearestWater() {
    const w = this.world, p = this.player;
    let best = null, bd = Infinity;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (w.tiles[y * N + x] !== T.WATER || !w.isOpen(x, y)) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
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
        return t === T.WATER;
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
        const s = this.objSprite(o);
        const hy = o.type === 'stump' || o.type === 'rock' || o.type === 'bush' || o.type === 'berry' ? 8 : o.type === 'boulder' ? 20 : 26;
        this.burst(o.wx, o.wy - hy, a.kind === 'chop' ? '#b07a45' : '#b8bec3', 6);
        if (a.kind === 'chop' && o.type !== 'stump') this.burst(o.wx, o.wy - 60, '#5aa83a', 4, true);
        this.tg.haptic('light');
        if (o.hp <= 0) { this.destroy(o); this.changed(); return false; }
        this.ui.update(this);
        return st.energy >= 1;
      }
      case 'dig': {
        if (!this.spend(ENERGY.dig)) return false;
        w.tiles[w.idx(a.x, a.y)] = T.SOIL;
        const b = this.bedAt(w.idx(a.x, a.y)); b.crop = null; b.p = 0; b.w = 0;
        this.burst(b.wx, b.wy, '#8a5a30', 8);
        this.addXp(1);
        this.changed();
        return false;
      }
      case 'plant': {
        const b = this.bedAt(w.idx(a.x, a.y)), c = CROPS[a.crop];
        if (st.seeds[a.crop] > 0) st.seeds[a.crop]--; else if (st.coins >= c.seed) st.coins -= c.seed; else return false;
        b.crop = a.crop; b.p = 0; b.w = 0;
        this.burst(b.wx, b.wy, '#7ccf4f', 6);
        this.addXp(1);
        this.changed();
        return false;
      }
      case 'water': {
        const b = this.bedAt(w.idx(a.x, a.y));
        if (st.can <= 0 || !this.spend(ENERGY.water)) return false;
        st.can--; b.w++;
        this.burst(b.wx, b.wy - 6, '#6fc2ff', 10);
        this.changed();
        return false;
      }
      case 'fill': {
        st.can = this.canMax;
        toWorld(a.x + 0.5, a.y + 0.5, tmp);
        this.burst(tmp.x, tmp.y, '#9fd8f5', 8);
        this.float(tmp.x, tmp.y - 20, `${st.can}`, 'water');
        this.changed();
        return false;
      }
      case 'harvest': {
        const b = this.bedAt(w.idx(a.x, a.y)), c = CROPS[b.crop];
        const got = this.addItem('crops', c.key, 1);
        if (!got) return false;
        this.float(b.wx, b.wy - 20, '+1', c.key);
        if (Math.random() < 0.25) { this.addItem('seeds', c.key, 1); this.float(b.wx + 12, b.wy - 34, '+1', 'seed'); }
        this.burst(b.wx, b.wy - 6, '#ffe066', 8);
        b.crop = null; b.p = 0; b.w = 0;
        st.stats.harvested++;
        this.addXp(c.xp);
        this.tg.haptic('medium');
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
      const got = this.addItem('inv', 'ore', 1 + Math.floor(Math.random() * 2));
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
    this.burst(o.wx, o.wy - 10, o.type === 'rock' || o.type === 'boulder' ? '#9aa1a7' : '#7a4b28', 12);
    if (def.stump) { o.type = 'stump'; o.hp = OBJECTS.stump.hp; this.world.version++; }
    else this.world.remove(o);
    this.tg.haptic('medium');
  }

  // ---------------- Эффекты ----------------

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
    this.grow(dt);
    this._eT = (this._eT || 0) + dt;
    if (this._eT > 1) { this._eT = 0; this.tickEnergy(); this.ui.tick(this); }
    this.player.update(dt);
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
    return this.player.idleTime > 2 && !this.particles.length && !this.floaters.length && !this.tapFx && !this.cam.animating && !this.hover;
  }

  // ---------------- Отрисовка ----------------

  render() {
    const r = this.r, ctx = r.ctx, w = this.world, v = r.view;
    r.begin(this.cam, BG);

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
    const S = this.S;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = (gx - gy) * HW, cy = (gx + gy + 1) * HH;
        if (cx + HW < v.minX || cx - HW > v.maxX || cy + HH < v.minY || cy - HH > v.maxY) continue;
        const i = gy * N + gx, t = w.tiles[i];
        let s;
        if (t === T.GRASS) s = S.grass[w.variant[i]];
        else if (t === T.PATH) s = S.path[(gx + gy) & 1];
        else if (t === T.WATER) s = this.waterSprite(gx, gy);
        else {
          const b = this.beds.get(i);
          const wet = b && b.crop && !this.cropInfo(b).needsWater && !this.cropInfo(b).ready;
          s = S.soil[wet ? 1 : 0];
        }
        ctx.drawImage(s.canvas, cx - s.ax, cy - s.ay, s.w, s.h);
      }
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


    // объекты + растения + персонаж, по глубине
    const L = this.drawList; L.length = 0;
    for (const o of w.objects) {
      if (!o) continue;
      const s = this.objSprite(o);
      if (!r.visible(o.wx - s.ax - 4, o.wy - s.ay, s.w + 8, s.h)) continue;
      o.kind = 'o';
      L.push(o);
    }
    for (const b of this.beds.values()) {
      if (!b.crop || !r.visible(b.wx - 32, b.wy - 44, 64, 60)) continue;
      L.push(b.dr);
    }
    const p = this.player;
    toWorld(p.x, p.y, tmp);
    this._pd = this._pd || { kind: 'p' };
    this._pd.depth = p.x + p.y; this._pd.wy = tmp.y;
    L.push(this._pd);
    L.sort((a, b) => a.depth - b.depth || a.wy - b.wy);

    // Что нельзя закрывать: фермер, клетка под курсором, клетка последнего тапа.
    // Высокие объекты перед ними становятся полупрозрачными.
    const F = this.focus; F.length = 0;
    F.push({ x0: tmp.x - 11, y0: tmp.y - 50, x1: tmp.x + 11, y1: tmp.y, depth: p.x + p.y, gx: -1, gy: -1 });
    for (const t of [this.hover, this.tapFx]) {
      if (!t || !w.inside(t.x, t.y)) continue;
      toWorld(t.x + 0.5, t.y + 0.5, tmp);
      F.push({ x0: tmp.x - HW + 6, y0: tmp.y - HH + 3, x1: tmp.x + HW - 6, y1: tmp.y + HH - 3, depth: t.x + t.y + 1, gx: t.x, gy: t.y });
    }
    let playerHidden = false;

    for (const d of L) {
      if (d.kind === 'o') {
        let s = this.objSprite(d);
        if (!w.isOpen(d.gx, d.gy)) s = dimSprite(s);
        const sh = d.shake > 0 ? Math.sin(this.time * 70) * 2.2 * (d.shake / 0.25) : 0;
        const fade = this.occludes(d, s, F);
        d.fade = (d.fade || 0) + (fade - (d.fade || 0)) * 0.3;
        if (d.fade < 0.02) d.fade = 0;
        if (fade && F[0].hit) playerHidden = true;
        if (d.fade) ctx.globalAlpha = 1 - 0.62 * d.fade;
        ctx.drawImage(s.canvas, d.wx - s.ax + sh, d.wy - s.ay, s.w, s.h);
        ctx.globalAlpha = 1;
      } else if (d.kind === 'c') {
        const b = d.bed, info = this.cropInfo(b);
        const s = S.crops[b.crop][info.stage];
        ctx.drawImage(s.canvas, b.wx - s.ax, b.wy - s.ay, s.w, s.h);
      } else {
        p.draw(r);
      }
    }

    // фермер за объектом: полупрозрачная копия поверх
    if (playerHidden) { ctx.globalAlpha = 0.4; p.draw(r); ctx.globalAlpha = 1; }

    // рамки поверх объектов: граница участка (бледно), клетка под курсором, тап
    ctx.globalAlpha = 0.45; this.drawBorder(ctx); ctx.globalAlpha = 1;
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
