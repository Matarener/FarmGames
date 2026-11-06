// Отрисовка фермы через WebGL (PixiJS). Сцена «держится» в видеопамяти: земля, объекты и
// растения — постоянные спрайты в атласах; каждый кадр меняется только то, что двигается
// (камера, фермер, частицы). Логика игры, камера, ввод и скелетная анимация — свои; Pixi только рисует.
// Если WebGL недоступен, Farm рисует по-старому через Canvas 2D.
import * as PIXI from '../vendor/pixi.min.mjs';
import { toWorld, HW, HH } from '../engine/Iso.js';
import { dimSprite } from '../engine/Sprite.js';
import { N, CHUNK, CHUNKS, T } from './World.js';
import { HOUSE } from './data.js';

const tmp = { x: 0, y: 0 };
const ATLAS = 2048, PAD = 6;
const Z = (depth, wy) => depth * 1e4 + wy * 0.1; // порядок как в 2D: глубина, затем y

// прямоугольник непрозрачных пикселей картинки (с запасом в 1 px), null — если пусто
let scratch = null;
function opaqueBox(img, w, h) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
  const g = scratch.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, w, h); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) if (d[row + x * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---------- атласы: все спрайты игры в нескольких больших текстурах ----------
class Atlases {
  constructor() { this.list = []; this.dirty = new Set(); this.map = new WeakMap(); }

  page() {
    const c = document.createElement('canvas'); c.width = c.height = ATLAS;
    const g = c.getContext('2d');
    const source = new PIXI.CanvasSource({ resource: c, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear', alphaMode: 'premultiply-alpha-on-upload' });
    const p = { c, g, source, x: PAD, y: PAD, rowH: 0 };
    this.list.push(p);
    return p;
  }

  // текстура для спрайта {canvas, w, h, ax, ay}
  tex(s) {
    let t = this.map.get(s.canvas);
    if (t) return t;
    const img = s.canvas, w = img.width, h = img.height;
    // после прогрева страницы атласа больше не трогаем: дорисовка в лист 2048² заставила бы
    // заново отправить в видеокарту весь лист с мипмапами (фриз). Новый спрайт — своя маленькая текстура.
    if (this.sealed || w + 2 * PAD > ATLAS || h + 2 * PAD > ATLAS) {
      if (this.sealed && this.perf) this.perf.mark('новый спрайт');
      t = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: img, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear', alphaMode: 'premultiply-alpha-on-upload' }) });
      this.map.set(img, t); return t;
    }
    // пустые прозрачные поля обрезаем: видеокарта не тратит на них время, атлас меньше
    const b = this.trim ? opaqueBox(img, w, h) : { x: 0, y: 0, w, h };
    if (!b) { t = PIXI.Texture.EMPTY; this.map.set(img, t); return t; }
    let p = this.list[this.list.length - 1] || this.page();
    if (p.x + b.w + PAD > ATLAS) { p.x = PAD; p.y += p.rowH + PAD; p.rowH = 0; }
    if (p.y + b.h + PAD > ATLAS) { p = this.page(); }
    p.g.drawImage(img, b.x, b.y, b.w, b.h, p.x, p.y, b.w, b.h);
    const trimmed = b.w !== w || b.h !== h;
    t = new PIXI.Texture({
      source: p.source, frame: new PIXI.Rectangle(p.x, p.y, b.w, b.h),
      orig: trimmed ? new PIXI.Rectangle(0, 0, w, h) : undefined,
      trim: trimmed ? new PIXI.Rectangle(b.x, b.y, b.w, b.h) : undefined,
    });
    t.page = p;
    p.x += b.w + PAD; p.rowH = Math.max(p.rowH, b.h);
    this.dirty.add(p);
    this.map.set(img, t);
    return t;
  }

  // новые спрайты попадают в видеопамять раз за кадр
  flush(perf) { for (const p of this.dirty) { p.source.update(); perf && perf.mark('текстура в видеокарту'); } this.dirty.clear(); }
}

// ---------- фермер: спрайты вложений скелета ----------
class PlayerView {
  constructor(scene) {
    this.scene = scene;
    this.c = new PIXI.Container();
    this.shadow = new PIXI.Graphics().ellipse(0, 0, 9, 4).fill(0x14280a);
    this.c.addChild(this.shadow);
    this.parts = [];
  }

  sync(p) {
    toWorld(p.x, p.y, tmp);
    const f = p.sk.boneMap.float, lift = f ? Math.max(0, -f.ty) : 0, k = Math.max(0.55, 1.15 - lift * 0.035);
    this.shadow.position.set(tmp.x, tmp.y); this.shadow.scale.set(k); this.shadow.alpha = 0.24 * k;
    let n = 0;
    p.sk.eachDraw(tmp.x, tmp.y, 1, p.flip, (s, a, b, c, d, e, f2) => {
      let sp = this.parts[n];
      if (!sp) { sp = this.parts[n] = new PIXI.Sprite(); this.c.addChild(sp); }
      sp.visible = true;
      const t = this.scene.atlas.tex(s);
      if (sp.texture !== t) sp.texture = t;
      // спрайт рисуется с (-ax,-ay) размером (w,h) в системе вложения
      const kx = s.w / t.width, ky = s.h / t.height;
      sp.anchor.set(s.ax / s.w, s.ay / s.h);
      sp.setFromMatrix(new PIXI.Matrix(a * kx, b * kx, c * ky, d * ky, e, f2));
      n++;
    });
    for (let i = n; i < this.parts.length; i++) this.parts[i].visible = false;
  }
}

export class PixiScene {
  constructor(farm, app) {
    this.f = farm; this.app = app;
    this.atlas = new Atlases(); this.atlas.trim = true;
    this.groundAtlas = new Atlases(); // клетки земли — отдельно, для сеток по кускам
    const world = this.world = new PIXI.Container({ isRenderGroup: true });
    app.stage.addChild(world);
    this.chunks = [];
    for (let c = 0; c < CHUNKS * CHUNKS; c++) { const cc = new PIXI.Container(); cc.tiles = []; /* одна сетка на кусок — отдельная группа рендера не нужна */ this.chunks.push(cc); world.addChild(cc); }
    this.decorC = new PIXI.Container(); world.addChild(this.decorC); // кувшинки и листья на воде
    this.bedsC = new PIXI.Container({ sortableChildren: true, isRenderGroup: true }); world.addChild(this.bedsC);
    this.border = new PIXI.Graphics(); world.addChild(this.border);
    this.objC = new PIXI.Container({ sortableChildren: true }); world.addChild(this.objC);
    this.over = new PIXI.Container(); world.addChild(this.over);
    this.border2 = new PIXI.Graphics(this.border.context); this.border2.alpha = 0.45; this.over.addChild(this.border2);
    this.ghost2 = new PlayerView(this); this.ghost2.c.alpha = 0.4; this.over.addChild(this.ghost2.c);
    this.marks = new PIXI.Graphics(); this.over.addChild(this.marks);
    this.bubbles = new PIXI.Container(); this.over.addChild(this.bubbles);
    this.queueC = new PIXI.Container(); this.over.addChild(this.queueC);
    this.signsC = new PIXI.Container(); this.over.addChild(this.signsC);
    this.moverC = new PIXI.Container(); this.over.addChild(this.moverC);
    this.moverG = new PIXI.Graphics(); this.moverC.addChild(this.moverG);
    this.moverHi = new PIXI.Sprite(); this.moverHi.blendMode = 'add'; this.moverC.addChild(this.moverHi);
    this.moverGhost = new PIXI.Sprite(); this.moverGhost.alpha = 0.6; this.moverC.addChild(this.moverGhost);
    this.fx = new PIXI.Graphics(); this.over.addChild(this.fx);
    this.floatC = new PIXI.Container(); this.over.addChild(this.floatC);
    this.player = new PlayerView(this); this.objC.addChild(this.player.c);
    this.objs = new Map(); this.crops = new Map(); this.bub = new Map();
    this.stamp = 0; this._obTick = 0;
    this.keys = {};
    this.textRes = Math.max(2, (window.devicePixelRatio || 1)) * 2.6; // текст чёткий и при сильном приближении
    // Надписи — растровые шрифты: буквы рисуются один раз в атлас, новая надпись ничего не грузит в видеокарту
    const chars = [['a', 'z'], ['A', 'Z'], ['0', '9'], ['а', 'я'], ['А', 'Я'], 'ёЁ +-−–—×·:;!?.,%()/«»"\'№'];
    const font = { fontFamily: 'system-ui, sans-serif', fontWeight: '700' };
    PIXI.BitmapFont.install({ name: 'farm-dark', style: { ...font, fontSize: 11, fill: 0x3d2b1f }, chars, resolution: this.textRes, padding: 2 });
    PIXI.BitmapFont.install({ name: 'farm-float', style: { ...font, fontSize: 11, fill: 0xfffbe8, stroke: { color: 0x28190f, width: 3, alpha: 0.8 } }, chars, resolution: this.textRes, padding: 3 });
  }

  // спрайт игры → Pixi-спрайт в точке (x, y) — опорной точке спрайта
  put(sp, s, x, y) {
    const t = this.atlas.tex(s);
    if (sp.texture !== t) { sp.texture = t; sp.anchor.set(s.ax / s.w, s.ay / s.h); sp.scale.set(s.w / t.width, s.h / t.height); }
    if (sp.x !== x || sp.y !== y) sp.position.set(x, y);
  }

  // ---------- земля ----------
  // Каждый кусок земли — одна сетка из ромбов (а не 100 прямоугольных спрайтов): у клетки рисуется
  // только сам ромб, прозрачные углы видеокарта не трогает — заливка экрана вдвое меньше.
  syncGround() { const _t = performance.now(); try { this._syncGround(); } finally { this.f.perf.mark('syncGround', performance.now() - _t); } }
  _syncGround() {
    const f = this.f, w = f.world, S = f.S;
    this.makeWaterTex();
    const BS = S.bed && S.bed[f.bedStyleName()];
    const per = this.chunks.map(() => []);
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
      const i = gy * N + gx, t = w.tiles[i];
      const cx = (gx - gy) * HW, cy = (gx + gy + 1) * HH;
      let s, bed = null;
      if (t === T.GRASS) s = S.grass[w.variant[i]];
      else if (t === T.PATH) s = S.path[(gx + gy) & 1];
      else if (t === T.WATER) {
        const ws = f.waterSprite(gx, gy);
        if (this.waterT) {
          // вода — общей текстурой по координатам карты, поверх — берег (у клеток посреди пруда его нет)
          per[w.chunkOf(gx, gy)].push(this.waterT, gx, gy);
          s = ws.empty ? null : ws;
        } else s = ws;
      } else {
        const b = f.beds.get(i);
        const wet = b && b.crop && !f.cropInfo(b).needsWater && !f.cropInfo(b).ready ? 1 : 0;
        if (BS) { s = S.grass[w.variant[i]]; bed = BS[wet]; } else s = S.soil[wet];
      }
      if (s) per[w.chunkOf(gx, gy)].push(s, cx, cy);
      // объёмная грядка — поверх земли, ближние поверх дальних
      let bs = this.bedSp && this.bedSp[i];
      if (bed) {
        if (!this.bedSp) this.bedSp = [];
        if (!bs) { bs = this.bedSp[i] = new PIXI.Sprite(); this.bedsC.addChild(bs); bs.zIndex = cy; }
        bs.visible = true; this.put(bs, bed, cx, cy);
      } else if (bs) bs.visible = false;
    }
    for (let c = 0; c < per.length; c++) this.chunkMesh(this.chunks[c], per[c]);
    this.groundAtlas.flush();
  }

  chunkMesh(cc, list) {
    // пересобираем, только если в куске что-то поменялось
    const same = cc.list && cc.list.length === list.length && cc.list.every((v, i) => v === list[i]);
    if (same) return;
    cc.list = list;
    const by = new Map(); // страница атласа → вершины
    const WT = this.waterT;
    for (let j = 0; j < list.length; j += 3) {
      const s = list[j];
      const t = this.groundAtlas.tex(s), fr = t.frame, p = t.page || t.source;
      let m = by.get(p); if (!m) by.set(p, m = { t, pos: [], uv: [] });
      const W = t.source.width, H = t.source.height;
      if (s === WT) {
        // клетка (gx, gy) воды: углы ромба — узлы сетки, текстура повторяется через WT.px × WT.py клеток
        const gx = list[j + 1], gy = list[j + 2];
        const cx = (gx - gy) * HW, cy = (gx + gy + 1) * HH;
        const k = WT.cell, u0 = (fr.x + WT.m + (gx % WT.px) * k) / W, v0 = (fr.y + WT.m + (gy % WT.py) * k) / H, du = k / W, dv = k / H;
        m.pos.push(cx, cy - HH, cx + HW, cy, cx, cy + HH, cx - HW, cy);
        m.uv.push(u0, v0, u0 + du, v0, u0 + du, v0 + dv, u0, v0 + dv);
        continue;
      }
      const x0 = list[j + 1] - s.ax, y0 = list[j + 2] - s.ay;
      const u0 = fr.x / W, v0 = fr.y / H, u1 = (fr.x + fr.width) / W, v1 = (fr.y + fr.height) / H, um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
      m.pos.push(x0 + s.w / 2, y0, x0 + s.w, y0 + s.h / 2, x0 + s.w / 2, y0 + s.h, x0, y0 + s.h / 2);
      m.uv.push(um, v0, u1, vm, um, v1, u0, vm);
    }
    // сетки переиспользуем (новые данные в те же буферы) — иначе видеопамять копится с каждой правкой земли
    const meshes = cc.meshes || (cc.meshes = new Map());
    for (const [p, mesh] of meshes) if (!by.has(p)) mesh.visible = false;
    for (const [p, m] of by) {
      const n = m.pos.length / 8, idx = new Uint16Array(n * 6);
      for (let q = 0; q < n; q++) { const a = q * 4, o = q * 6; idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2; idx[o + 3] = a; idx[o + 4] = a + 2; idx[o + 5] = a + 3; }
      let mesh = meshes.get(p);
      if (mesh) {
        const g = mesh.geometry;
        g.positions = new Float32Array(m.pos); g.uvs = new Float32Array(m.uv); g.indices = idx;
        mesh.visible = true;
      } else {
        const geometry = new PIXI.MeshGeometry({ positions: new Float32Array(m.pos), uvs: new Float32Array(m.uv), indices: idx });
        const page = m.t.page;
        const texture = page ? (page.full || (page.full = new PIXI.Texture({ source: page.source }))) : m.t;
        mesh = new PIXI.Mesh({ geometry, texture });
        meshes.set(p, mesh); cc.addChild(mesh);
      }
    }
    let k = 0;
    for (const p of by.keys()) { const mesh = meshes.get(p); if (cc.getChildIndex(mesh) !== k) cc.setChildIndex(mesh, k); k++; }
  }

  // Текстура воды в атлас земли: с полями из противоположных краёв (бесшовный повтор без
  // швов на стыках, в том числе на уменьшенных копиях — мипмапах)
  makeWaterTex() {
    const t = this.f.S.waterTex;
    if (!t || this.waterT !== undefined) return;
    const img = t.canvas, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, M = 16;
    const c = document.createElement('canvas'); c.width = w + 2 * M; c.height = h + 2 * M;
    const g = c.getContext('2d');
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.drawImage(img, M + dx * w, M + dy * h);
    // 128 пикселей текстуры на клетку (как было в 2D): 768×512 → повтор через 6×4 клеток
    const cell = 128;
    this.waterT = { canvas: c, w: c.width, h: c.height, ax: 0, ay: 0, m: M, cell, px: Math.max(1, Math.round(w / cell)), py: Math.max(1, Math.round(h / cell)) };
  }

  // украшения пруда: стоят на месте, пересобираются только при открытии участка (затемнение)
  syncDecor() {
    const f = this.f, w = f.world, D = f.S.decor;
    if (!this.decorSp) this.decorSp = [];
    const list = (D && w.decor) || [];
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      let s = D[d.type];
      if (!s) continue;
      let e = this.decorSp[i];
      if (!e) {
        e = this.decorSp[i] = new PIXI.Sprite();
        toWorld(d.x, d.y, tmp); e.wx = tmp.x; e.wy = tmp.y;
        const flat = d.type === 'lily' || d.type === 'leaves';
        // мостик чуть «дальше» своей клетки: фермер на нём рисуется поверх
        if (!flat) e.zIndex = Z(d.type === 'pier' ? d.x + d.y - 0.5 : d.x + d.y, tmp.y);
        (flat ? this.decorC : this.objC).addChild(e);
      }
      if (!w.isOpen(d.gx, d.gy)) s = dimSprite(s);
      this.put(e, s, e.wx, e.wy);
      e.bw = s.w; e.bh = s.h; e.bax = s.ax; e.bay = s.ay;
    }
  }

  syncFog() { const _t = performance.now(); try { this._syncFog(); } finally { this.f.perf.mark('syncFog', performance.now() - _t); } }
  _syncFog() {
    const w = this.f.world;
    // закрытые куски — затемнение цветом самого куска (без лишнего слоя поверх)
    const gray = (k) => { const v = Math.round(k * 255); return (v << 16) | (v << 8) | v; };
    for (let c = 0; c < CHUNKS * CHUNKS; c++) this.chunks[c].tint = w.unlocked[c] ? 0xffffff : gray(w.canUnlock(c) ? 0.66 : 0.5);
    // граница открытой земли: пунктир
    const b = this.border.clear();
    const dash = (ax, ay, bx, by) => {
      toWorld(ax, ay, tmp); const x0 = tmp.x, y0 = tmp.y; toWorld(bx, by, tmp);
      const dx = tmp.x - x0, dy = tmp.y - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      for (let d = 0; d < L; d += 11) { const e = Math.min(L, d + 6); b.moveTo(x0 + ux * d, y0 + uy * d).lineTo(x0 + ux * e, y0 + uy * e); }
    };
    for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      if (!w.unlocked[c]) continue;
      const cx = c % CHUNKS, cy = (c / CHUNKS) | 0, x0 = cx * CHUNK, y0 = cy * CHUNK;
      const open = (dx, dy) => { const x = cx + dx, y = cy + dy; return x >= 0 && y >= 0 && x < CHUNKS && y < CHUNKS && w.unlocked[y * CHUNKS + x]; };
      if (!open(0, -1)) dash(x0, y0, x0 + CHUNK, y0);
      if (!open(1, 0)) dash(x0 + CHUNK, y0, x0 + CHUNK, y0 + CHUNK);
      if (!open(0, 1)) dash(x0, y0 + CHUNK, x0 + CHUNK, y0 + CHUNK);
      if (!open(-1, 0)) dash(x0, y0, x0, y0 + CHUNK);
    }
    b.stroke({ width: 1.5, color: 0xfff0be, alpha: 0.55 });
  }

  syncSigns() { const _t = performance.now(); try { this._syncSigns(); } finally { this.f.perf.mark('syncSigns', performance.now() - _t); } }
  _syncSigns() {
    const f = this.f, w = f.world;
    for (const ch of this.signsC.removeChildren()) ch.destroy({ children: true });
    const blocked = w.unlockedCount() >= HOUSE[f.st.house].chunks;
    const label = blocked ? 'Нужен дом выше' : 'Открыть участок';
    for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      if (!w.canUnlock(c)) continue;
      const cx = c % CHUNKS, cy = (c / CHUNKS) | 0;
      toWorld(cx * CHUNK + CHUNK / 2, cy * CHUNK + CHUNK / 2, tmp);
      const box = new PIXI.Container(); box.position.set(tmp.x, tmp.y - 24);
      const tx = new PIXI.BitmapText({ text: label, style: { fontFamily: 'farm-dark', fontSize: 9 } });
      const tw = tx.width, bw = tw + 30;
      box.addChild(new PIXI.Graphics()
        .roundRect(-bw / 2 - 2, -13, bw + 4, 26, 8).fill({ color: 0x3d2b1f, alpha: 0.92 })
        .roundRect(-bw / 2, -11, bw, 22, 7).fill(blocked ? 0xc9b48a : 0xf6d37a));
      tx.anchor.set(0.5); tx.position.set(8, 0.5); box.addChild(tx);
      const lock = f.iconImg.lock;
      if (lock && lock.complete && lock.naturalWidth) {
        const ls = new PIXI.Sprite(this.iconTex(lock)); ls.width = 14; ls.height = 14; ls.position.set(-bw / 2 + 3, -7); box.addChild(ls);
      }
      box.cx = tmp.x; box.cy = tmp.y;
      this.signsC.addChild(box);
    }
  }

  // Прогрев на экране загрузки: все спрайты игры (и затемнённые копии для закрытых участков)
  // сразу кладём в атласы и отправляем в видеопамять, чтобы в игре не было подгрузок.
  warmup() {
    const f = this.f, w = f.world, seen = new Set();
    const add = (s, dim) => {
      if (!s || seen.has(s)) return; seen.add(s);
      if (s.canvas) { this.atlas.tex(s); if (dim) this.atlas.tex(dimSprite(s)); return; }
      if (s instanceof Map) { for (const v of s.values()) add(v, dim); return; }
      if (Array.isArray(s) || typeof s === 'object') for (const v of Object.values(s)) add(v, dim);
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (w.tile(x, y) === T.WATER) f.waterSprite(x, y);
    const S = f.S;
    const GROUND = ['grass', 'path', 'soil', 'water'];
    this.makeWaterTex(); if (this.waterT) this.groundAtlas.tex(this.waterT);
    for (const k of GROUND) for (const v of (S[k] instanceof Map ? S[k].values() : S[k] || [])) this.groundAtlas.tex(v);
    for (const [k, v] of Object.entries(S)) if (typeof v !== 'function' && !GROUND.includes(k) && k !== 'waterArt' && k !== 'waterTex') add(v, k !== 'bubble');
    for (const o of w.objects || []) { if (!o) continue; const s = f.objSprite(o); if (s) { this.atlas.tex(s); this.atlas.tex(dimSprite(s)); } }
    if (S.stumpOf && S.objArt) for (const arr of Object.values(S.objArt)) for (const t of arr || []) for (const id of [0, 1, 3]) { const st = S.stumpOf(t, id); if (st) { this.atlas.tex(st); this.atlas.tex(dimSprite(st)); } }
    for (const im of Object.values(f.iconImg)) if (im.complete && im.naturalWidth) this.iconTex(im);
    this.atlas.flush(); this.groundAtlas.flush();
    this.atlas.sealed = this.groundAtlas.sealed = true; this.atlas.perf = this.groundAtlas.perf = f.perf;
    const R = this.app.renderer;
    for (const p of [...this.atlas.list, ...this.groundAtlas.list]) R.texture?.initSource?.(p.source);
    // первые кадры (сборка сцены, загрузка в видеокарту, сборка шейдеров для всех видов
    // отрисовки: надписи, частицы, рамки) — ещё за экраном загрузки
    const cam = f.cam, z0 = cam.zoom, x0 = cam.x, y0 = cam.y;
    const p = f.player, tx = Math.floor(p.x), ty = Math.floor(p.y);
    f.float(x0, y0, '+1 Дерево', 'wood'); f.burst(x0, y0, '#fff', 4, true); f.tapFx = { x: tx, y: ty, t: 0.35 };
    for (const z of [cam.minZoom, 1, cam.maxZoom, z0]) { cam.zoom = z; this.render(); }
    f.floaters.length = 0; f.particles.length = 0; f.tapFx = null;
    cam.zoom = z0; cam.x = x0; cam.y = y0;
    this.render();
    try { const gl = R.gl; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } catch { /* не важно */ }
    // листы атласа уже в видеопамяти — их копии в обычной памяти (по 16 МБ) больше не нужны
    for (const p of [...this.atlas.list, ...this.groundAtlas.list]) { p.c.width = p.c.height = 1; p.g = null; }
    // если система отберёт у игры видеокарту (свернули надолго), проще всего перезапуститься
    const cv = R.canvas || R.view?.canvas;
    if (cv) cv.addEventListener('webglcontextrestored', () => { try { f.save.flush(); } catch { /* */ } location.reload(); });
  }

  // Тест на устройстве: сколько видеокарта тратит на кадр в разных режимах (с ожиданием конца
  // отрисовки), чтобы понять, что именно её грузит.
  async bench(onText) {
    const f = this.f, R = this.app.renderer, gl = R.gl, cam = f.cam;
    const px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const z0 = cam.zoom, x0 = cam.x, y0 = cam.y, res0 = R.resolution;
    const lockedObjs = [];
    const set = (o) => {
      this.objC.visible = !o.noObj; this.over.visible = !o.noObj; this.bedsC.visible = !o.noObj;
      for (const c of this.chunks) c.renderable = !o.noGround;
      for (const e of this.objs.values()) if (!f.world.isOpen(e.o.gx, e.o.gy)) e.renderable = !o.noLocked;
      if (R.resolution !== (o.res || res0)) { R.resolution = o.res || res0; R.resize(f.r.cssW, f.r.cssH); }
    };
    const modes = [
      ['всё', {}], ['без объектов (деревья, дом…)', { noObj: true }], ['без земли', { noGround: true }],
      ['без объектов на закрытых участках', { noLocked: true }],
      ['разрешение x1.5', { res: 1.5 }], ['разрешение x1', { res: 1 }],
    ];
    const lines = [`экран ${Math.round(f.r.cssW * res0)}×${Math.round(f.r.cssH * res0)}, x${res0}, зум ${z0.toFixed(2)}`];
    const wait = () => new Promise((r) => setTimeout(r, 30));
    f.benching = true;
    try {
      for (const [name, o] of modes) {
        set(o); sync();
        // кадры подряд, ожидание видеокарты — раз в 10 кадров (как в игре: кадры идут конвейером)
        const runs = [];
        for (let k = 0; k < 4; k++) {
          const t = performance.now();
          for (let i = 0; i < 10; i++) { const j = k * 10 + i; cam.x = x0 + Math.sin(j / 6) * 40; cam.y = y0 + Math.cos(j / 6) * 20; this.render(); }
          sync(); runs.push((performance.now() - t) / 10);
          await wait();
        }
        runs.sort((a, b) => a - b);
        const med = (runs[1] + runs[2]) / 2;
        lines.push(`${name}: ${med.toFixed(1)} мс (${Math.round(1000 / med)} fps)`);
        onText && onText(lines.join('\n') + '\n…');
        await wait();
      }
    } finally {
      set({}); cam.zoom = z0; cam.x = x0; cam.y = y0; f.benching = false;
      for (const e of this.objs.values()) e.renderable = true;
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) lines.push('видеокарта: ' + gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    return lines.join('\n');
  }

  iconTex(img) { return this.atlas.tex({ canvas: img }); }

  // ---------- кадр ----------
  render() {
    const f = this.f, r = f.r, w = f.world, cam = f.cam, S = f.S, v = r.view;
    r.begin(cam);
    // камера: мир в CSS-пикселях, сдвиг — по целым пикселям экрана
    const res = r.scale;
    this.world.scale.set(cam.zoom);
    this.world.position.set(Math.round((r.cssW / 2 - cam.x * cam.zoom) * res) / res, Math.round((r.cssH / 2 - cam.y * cam.zoom) * res) / res);

    // постоянные части: пересобираются, только когда изменились
    let wet = 0;
    f.beds.forEach((b) => { if (b.crop && !(f.cropFlags(b) & 12)) wet = (wet * 31 + b.i) % 1e9; });
    const K = this.keys, bsn = f.bedStyleName();
    if (K.gv !== f.groundV || K.wet !== wet || K.bs !== bsn) { K.gv = f.groundV; K.wet = wet; K.bs = bsn; this.syncGround(); }
    const uc = w.unlockedCount();
    if (K.uc !== uc || K.house !== f.st.house || K.dec !== !!f.S.decor) { K.uc = uc; K.dec = !!f.S.decor; K.house = f.st.house; this.syncFog(); this.syncSigns(); this.syncDecor(); }
    if (this.keys.lock !== !!f.iconImg.lock) { this.keys.lock = !!f.iconImg.lock; this.syncSigns(); }

    // видимость кусков земли
    const CB = this._cb || (this._cb = this.chunks.map((_, c) => w.chunkBounds(c))); // границы кусков не меняются
    for (let c = 0; c < this.chunks.length; c++) {
      const b = CB[c];
      this.chunks[c].visible = b.maxX + 40 > v.minX && b.minX - 40 < v.maxX && b.maxY + 40 > v.minY && b.minY - 40 < v.maxY;
    }
    const DS = this.decorSp;
    if (DS) for (let i = 0; i < DS.length; i++) { const e = DS[i]; if (!e) continue; const vis = r.visible(e.wx - e.bax, e.wy - e.bay, e.bw, e.bh); if (e.visible !== vis) e.visible = vis; }
    const SC = this.signsC.children;
    for (let i = 0; i < SC.length; i++) { const s = SC[i]; s.visible = r.visible(s.cx - 50, s.cy - 40, 100, 60); }

    // фермер и что его не должно закрывать
    const p = f.player;
    toWorld(p.x, p.y, tmp);
    const pdepth = p.x + p.y, pwy = tmp.y;
    const F = f.focus; F.length = 0;
    const fo = this._fo || (this._fo = [{}, {}, {}]); // переиспользуем, чтобы не плодить мусор
    const foc = (i, x0, y0, x1, y1, depth, gx, gy) => { const q = fo[i]; q.x0 = x0; q.y0 = y0; q.x1 = x1; q.y1 = y1; q.depth = depth; q.gx = gx; q.gy = gy; q.hit = false; F.push(q); };
    foc(0, tmp.x - 11, tmp.y - 50, tmp.x + 11, tmp.y, pdepth, -1, -1);
    for (let ti = 0; ti < 2; ti++) {
      const t = ti ? f.tapFx : f.hover;
      if (!t || !w.inside(t.x, t.y)) continue;
      toWorld(t.x + 0.5, t.y + 0.5, tmp);
      foc(F.length, tmp.x - HW + 6, tmp.y - HH + 3, tmp.x + HW - 6, tmp.y + HH - 3, t.x + t.y + 1, t.x, t.y);
    }

    // объекты
    const stamp = ++this.stamp;
    let playerHidden = false;
    const OB = w.objects;
    const one = (o) => {
      let e = this.objs.get(o);
      if (!e) { e = new PIXI.Sprite(); e.o = o; this.objs.set(o, e); this.objC.addChild(e); }
      e.stamp = stamp;
      let s = f.objSprite(o);
      const vis = r.visible(o.wx - s.ax - 4, o.wy - s.ay, s.w + 8, s.h);
      if (e.visible !== vis) e.visible = vis;
      if (!vis) { o.fade = 0; return; }
      if (!w.isOpen(o.gx, o.gy)) s = dimSprite(s);
      const sh = o.shake > 0 ? Math.sin(f.time * 70) * 2.2 * (o.shake / 0.25) : 0;
      const fade = f.occludes(o, s, F);
      o.fade = (o.fade || 0) + (fade - (o.fade || 0)) * 0.3;
      if (o.fade < 0.02) o.fade = 0;
      if (fade && F[0].hit) playerHidden = true;
      const al = o.fade ? 1 - 0.62 * o.fade : 1;
      if (e.alpha !== al) e.alpha = al;
      this.put(e, s, o.wx + sh, o.wy);
      const z = Z(o.depth, o.wy);
      if (e.zIndex !== z) e.zIndex = z;
    };
    // Обходим только объекты кусков рядом с экраном (на слабом процессоре обход всей карты — главная цена кадра).
    // Полный обход — когда объекты появились/исчезли/двигаются и изредка для надёжности.
    const full = !this.buckets || this._obN !== OB.length || f.mover.active || ++this._obTick >= 90;
    if (full) {
      this._obN = OB.length; this._obTick = 0;
      const B = this.buckets = this.chunks.map(() => []);
      for (let oi = 0; oi < OB.length; oi++) { const o = OB[oi]; if (o) { B[w.chunkOf(o.gx, o.gy)].push(o); one(o); } }
      this.objs.forEach((e) => { if (e.stamp !== stamp) { e.destroy(); this.objs.delete(e.o); } });
      this._cvis = this.chunks.map(() => true);
    } else {
      const B = this.buckets, CV = this._cvis;
      for (let c = 0; c < B.length; c++) {
        const cb = CB[c]; // у высоких деревьев верхушка заходит в соседний кусок — запас вверх и в стороны
        const near = cb.maxX + 120 > v.minX && cb.minX - 120 < v.maxX && cb.maxY + 40 > v.minY && cb.minY - 300 < v.maxY;
        const L = B[c];
        if (near) {
          for (let i = 0; i < L.length; i++) { const o = L[i]; if (OB[o.id] === o) one(o); else this._obTick = 1e9; }
        } else if (CV[c]) {
          for (let i = 0; i < L.length; i++) { const e = this.objs.get(L[i]); if (e) e.visible = false; L[i].fade = 0; }
        }
        CV[c] = near;
      }
    }

    // растения и значки над грядками
    const bob = Math.sin(f.time * 4) * 1.5;
    f.beds.forEach((b) => {
      let e = this.crops.get(b), bu = this.bub.get(b);
      if (!b.crop) { if (e) e.visible = false; if (bu) bu.visible = false; return; }
      if (!e) { e = new PIXI.Sprite(); e.b = b; this.crops.set(b, e); this.objC.addChild(e); }
      const fl = f.cropFlags(b);
      e.visible = r.visible(b.wx - 32, b.wy - 44, 64, 60);
      if (e.visible) {
        this.put(e, S.crops[b.crop][fl & 3], b.wx, b.wy);
        const z = Z(b.dr.depth, b.dr.wy); if (e.zIndex !== z) e.zIndex = z;
      }
      const bs = fl & 4 ? S.bubble.ready : fl & 8 ? S.bubble.water : null;
      if (!bu) { bu = new PIXI.Sprite(); this.bub.set(b, bu); this.bubbles.addChild(bu); }
      bu.visible = !!bs && e.visible;
      if (bu.visible) this.put(bu, bs, b.wx, b.wy - 26 + bob);
    });
    this.crops.forEach((e) => { const b = e.b; if (f.beds.get(b.i) === b) return; e.destroy(); this.crops.delete(b); const bu = this.bub.get(b); if (bu) { bu.destroy(); this.bub.delete(b); } });

    // фермер
    this.player.sync(p);
    const pz = Z(pdepth, pwy); if (this.player.c.zIndex !== pz) this.player.c.zIndex = pz;
    this.ghost2.c.visible = playerHidden;
    if (playerHidden) this.ghost2.sync(p);

    // рамки: клетка под курсором, тап
    const g = this.marks.clear();
    const outline = (x, y, color, alpha, lw) => {
      toWorld(x + 0.5, y + 0.5, tmp);
      g.poly([tmp.x, tmp.y - HH + 1, tmp.x + HW - 2, tmp.y, tmp.x, tmp.y + HH - 1, tmp.x - HW + 2, tmp.y]).stroke({ width: lw, color, alpha });
    };
    if (f.hover && w.inside(f.hover.x, f.hover.y)) outline(f.hover.x, f.hover.y, 0xffffff, 0.75, 1.8);
    if (f.tapFx) outline(f.tapFx.x, f.tapFx.y, 0xfffac8, Math.min(1, f.tapFx.t * 2.4), 2.5);

    this.syncQueue();
    this.syncMover(outline);
    this.syncFx();
    this.syncFloaters();

    const P = this.f.perf; this.atlas.flush(P);
    const tr = performance.now();
    this.app.renderer.render(this.app.stage);
    const pm = performance.now() - tr; if (pm >= 3) P.mark('отрисовка', pm);
  }

  // номера в очереди дел
  syncQueue() {
    const f = this.f, p = f.player;
    const list = p.current && p.current.kind !== 'walk' ? [p.current, ...p.queue] : p.queue;
    const C = this.queueC;
    while (C.children.length < list.length) {
      const n = C.children.length;
      const box = new PIXI.Container();
      box.g = new PIXI.Graphics(); box.addChild(box.g);
      const tx = new PIXI.BitmapText({ text: String(n + 1), style: { fontFamily: 'farm-dark', fontSize: 8 } });
      tx.anchor.set(0.5); tx.y = 0.3; box.addChild(tx);
      C.addChild(box);
    }
    C.children.forEach((box, i) => {
      const a = list[i];
      box.visible = !!a;
      if (!a) return;
      let x, y;
      if (a.obj) { const s = f.objSprite(a.obj); x = a.obj.wx; y = a.obj.wy - Math.min(s.ay * 0.7, 60) - 6; }
      else { toWorld(a.x + 0.5, a.y + 0.5, tmp); x = tmp.x; y = tmp.y - 8; }
      box.position.set(x, y);
      const cur = i === 0 && a === p.current;
      if (box.cur !== cur) { box.cur = cur; box.g.clear().circle(0, 0, 6).fill({ color: 0x3d2b1f, alpha: 0.9 }).circle(0, 0, 4.8).fill(cur ? 0xffe066 : 0xffffff); }
    });
  }

  syncMover(outline) {
    const m = this.f.mover, f = this.f, g = this.moverG.clear();
    this.moverC.visible = m.active;
    if (!m.active) return;
    const s = m.sel, t = m.to;
    const pulse = 0.55 + 0.45 * Math.sin(f.time * 6);
    this.moverHi.visible = !!(s && s.kind === 'obj');
    if (this.moverHi.visible) { this.put(this.moverHi, f.objSprite(s.o), s.o.wx, s.o.wy); this.moverHi.alpha = 0.12 + 0.18 * pulse; }
    if (s) {
      for (let y = s.gy; y < s.gy + s.h; y++) for (let x = s.gx; x < s.gx + s.w; x++) {
        toWorld(x + 0.5, y + 0.5, tmp);
        g.poly([tmp.x, tmp.y - HH + 1, tmp.x + HW - 2, tmp.y, tmp.x, tmp.y + HH - 1, tmp.x - HW + 2, tmp.y]).stroke({ width: 2.5, color: 0xffe65a, alpha: pulse });
      }
    }
    this.moverGhost.visible = !!(s && t);
    if (s && t) {
      for (let y = t.gy; y < t.gy + s.h; y++) for (let x = t.gx; x < t.gx + s.w; x++) {
        toWorld(x + 0.5, y + 0.5, tmp);
        g.poly([tmp.x, tmp.y - HH, tmp.x + HW, tmp.y, tmp.x, tmp.y + HH, tmp.x - HW, tmp.y]).fill({ color: t.ok ? 0x6edc5a : 0xeb4632, alpha: 0.38 });
        g.poly([tmp.x, tmp.y - HH + 1, tmp.x + HW - 2, tmp.y, tmp.x, tmp.y + HH - 1, tmp.x - HW + 2, tmp.y]).stroke({ width: 2, color: t.ok ? 0x8ff06a : 0xff6a50 });
      }
      if (s.kind === 'obj') { toWorld(t.gx + s.w / 2, t.gy + s.h / 2, tmp); this.put(this.moverGhost, f.objSprite(s.o), tmp.x, tmp.y); }
      else {
        const sp = s.kind === 'path' ? f.S.path[0] : f.S.bed ? f.S.bed.grass[0] : f.S.soil[0];
        toWorld(t.gx + 0.5, t.gy + 0.5, tmp); this.put(this.moverGhost, sp, tmp.x, tmp.y);
      }
    }
  }

  // леска, частицы
  syncFx() {
    const f = this.f, g = this.fx.clear();
    const fs = f.fishingState();
    if (fs) {
      const { x, y, bx, by, k, bite, yank } = fs;
      g.moveTo(x, y).quadraticCurveTo((x + bx) / 2, Math.max(y, by) + 6, bx, by).stroke({ width: 0.5, color: 0xffffff, alpha: 0.85 });
      if (k >= 1 && !yank) g.ellipse(bx, by + 1.5, 4 + bite * 3, 1.8 + bite * 1.2).stroke({ width: 0.6, color: 0xffffff, alpha: 0.45 });
      g.circle(bx, by, 2.1).fill(0x3d2b1f);
      g.moveTo(bx + 1.5, by + 0.4).arc(bx, by + 0.4, 1.5, 0, Math.PI).fill(0xffffff);
      g.moveTo(bx - 1.5, by - 0.2).arc(bx, by - 0.2, 1.5, Math.PI, Math.PI * 2).fill(0xe2392f);
    }
    for (const q of f.particles) {
      g.rect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s).fill({ color: q.c, alpha: Math.max(0, 1 - q.t / q.life) });
    }
  }

  // всплывающие числа: «+3 дерево»
  syncFloaters() {
    const f = this.f, C = this.floatC;
    while (C.children.length < f.floaters.length) {
      const box = new PIXI.Container();
      box.tx = new PIXI.BitmapText({ text: '', style: { fontFamily: 'farm-float', fontSize: 11 } });
      box.tx.anchor.set(0, 0.5); box.addChild(box.tx);
      box.ic = new PIXI.Sprite(); box.ic.width = 12; box.ic.height = 12; box.addChild(box.ic);
      C.addChild(box);
    }
    C.children.forEach((box, i) => {
      const fl = f.floaters[i];
      box.visible = !!fl;
      if (!fl) return;
      if (box.tx.text !== fl.text) box.tx.text = fl.text;
      const img = fl.icon && f.iconImg[fl.icon];
      const iconOk = img && img.complete && img.naturalWidth;
      box.ic.visible = !!iconOk;
      if (iconOk) { const t = this.iconTex(img); if (box.ic.texture !== t) { box.ic.texture = t; box.ic.width = 12; box.ic.height = 12; } }
      const k = fl.t / 1.3, tw = box.tx.width, iw = iconOk ? 12 : 0;
      box.alpha = k < 0.75 ? 1 : (1 - k) * 4;
      box.position.set(fl.x - (tw + iw) / 2, fl.y - k * 26);
      box.ic.position.set(tw + 1, -6);
    });
  }
}

// Запуск Pixi на канвасе игры. null — WebGL недоступен (останется Canvas 2D).
export async function createPixiApp(canvas, perf, bg) {
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return null;
    const app = new PIXI.Application();
    const rect = canvas.getBoundingClientRect();
    // меньше текстур в пачке — проще шейдер на каждый пиксель (на телефонах это главная цена кадра)
    PIXI.Batcher.defaultOptions.maxTextures = +new URLSearchParams(location.search).get('maxtex') || 4;
    await app.init({
      canvas, preference: 'webgl', background: bg, antialias: false, autoStart: false, sharedTicker: false,
      resolution: perf.renderScale, autoDensity: false, width: Math.max(1, rect.width), height: Math.max(1, rect.height),
      powerPreference: 'high-performance', hello: false,
    });
    app.ticker && app.ticker.stop();
    // первый запуск на слабой видеокарте — сразу «Средняя» графика (игрок может сменить в настройках)
    if (perf.gfx === 'auto' && (window.devicePixelRatio || 1) > 1.5) {
      try {
        const gl = app.renderer.gl, ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
        if (/PowerVR|Mali-(4|T[0-9]|G(31|51|52|57|68))|Adreno \(TM\) (3|4|50|51|60)\d/i.test(name)) perf.setGfx('mid');
      } catch { /* нет данных о видеокарте */ }
    }
    return app;
  } catch (e) {
    console.warn('WebGL', e);
    return null;
  }
}

// Тот же интерфейс, что у Renderer (размер, матрица камеры, видимая область), но без 2D-контекста:
// рисует PixiScene.
export class GLRenderer {
  constructor(canvas, perf, app) {
    this.canvas = canvas; this.perf = perf; this.app = app; this.pixi = true;
    this.ctx = null;
    this.cssW = 1; this.cssH = 1; this.scale = 1;
    this.va = 1; this.ve = 0; this.vf = 0;
    this.view = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.scale = this.perf.renderScale;
    const R = this.app.renderer;
    if (R.resolution !== this.scale) R.resolution = this.scale;
    R.resize(this.cssW, this.cssH);
    this.canvas.style.width = ''; this.canvas.style.height = ''; // размер задаёт CSS
  }

  begin(cam) {
    const s = this.scale * cam.zoom;
    this.va = s;
    this.ve = Math.round((this.cssW / 2 - cam.x * cam.zoom) * this.scale);
    this.vf = Math.round((this.cssH / 2 - cam.y * cam.zoom) * this.scale);
    const v = this.view;
    v.minX = cam.x - this.cssW / 2 / cam.zoom;
    v.maxX = cam.x + this.cssW / 2 / cam.zoom;
    v.minY = cam.y - this.cssH / 2 / cam.zoom;
    v.maxY = cam.y + this.cssH / 2 / cam.zoom;
  }

  resetView() {}

  visible(x, y, w, h) {
    const v = this.view;
    return x < v.maxX && x + w > v.minX && y < v.maxY && y + h > v.minY;
  }
}
