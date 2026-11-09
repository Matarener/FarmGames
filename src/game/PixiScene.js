// Отрисовка фермы через WebGL (PixiJS). Сцена «держится» в видеопамяти: земля, объекты и
// растения — постоянные спрайты в атласах; каждый кадр меняется только то, что двигается
// (камера, фермер, частицы). Логика игры, камера, ввод и скелетная анимация — свои; Pixi только рисует.
import * as PIXI from '../vendor/pixi.min.mjs';
import { toWorld, HW, HH } from '../engine/Iso.js';
import { dimSprite, hash2 } from '../engine/Sprite.js';
import { N, CHUNK, CHUNKS, T, FOG_W, objCells } from './World.js';
import { areaCells } from './sprinklers.js';
import { HOUSE, FOG, OBJECTS, BED_ITEM } from './data.js';
import { BAR_COLORS, BAR_W, BAR_H, BAR_MIN_ZOOM, barTop, primeBarTop } from './bars.js';

const tmp = { x: 0, y: 0 };
const MX = new PIXI.Matrix();
// кружки с номерами очереди: радиус в мировых единицах и плотность картинки (пикселей на единицу)
const QBADGE_R = 6.5, QBADGE_RES = 12;
// Стрелка подсказки: прыжок раз в HINT_HOP с длиной HINT_HOP_T с (между прыжками стоит — игра может
// уйти в покой с редкими кадрами), высота прыжка; после того как призрак освободился — пауза HINT_WAIT с
const HINT_HOP = 2.4, HINT_HOP_T = 0.6, HINT_HOP_H = 9, HINT_WAIT = 0.35;
// сколько номеров очереди готовить заранее; остальные (до QUEUE_MAX + 1) рисуются, когда понадобятся:
// нажатие добавляет не больше одного дела, так что за кадр — не больше одной новой маленькой картинки
const QUEUE_SHOW = 7;
// Кольцо прочности над тем, что рубят (Farm.rings, chop.js): радиусы в мировых единицах (внутри помещается
// номер очереди QBADGE_R — он закрывает середину кольца), картинка 256×256 (степень двойки: мип-карты есть и на WebGL 1),
// сколько секунд кольцо видно после последнего удара и за сколько угасает, скорость заливки (долей в секунду)
const RING_RO = 11.8, RING_RI = 6.3, RING_PX = 256, RING_HOLD = 0.45, RING_FADE = 0.25, RING_SPEED = 4.5;
// Прозрачность того, что закрывает фермера или цель: непрозрачность 1 − FADE_A·fade (fade 1 → 0,38).
// В «Переставить» все высокие объекты (картинка от MOVER_TALL единиц: деревья, кусты, постройки)
// гаснут на MOVER_FADE (непрозрачность ≈ 0,57) — видно землю и грядки за ними
const FADE_A = 0.62, MOVER_TALL = 56, MOVER_FADE = 0.7;
const ATLAS = 2048, PAD = 6;
const Z = (depth, wy) => depth * 1e4 + wy * 0.1; // порядок отрисовки: глубина клетки, затем y

// прямоугольник непрозрачных пикселей картинки (с запасом в 1 px), null — если пусто;
// y40 — первая строка с непрозрачностью больше 40 (для высоты полосок над растениями, bars.js)
let scratch = null;
function opaqueBox(img, w, h) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
  const g = scratch.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, w, h); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, y40 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = d[row + x * 4 + 3];
      if (a) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; if (a > 40 && y40 < 0) y40 = y; }
    }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, y40 };
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
    // (у клеток земли рамка нужна целиком — сетки кусков; пруды — обычные спрайты, их обрезаем)
    const b = this.trim || s.flat ? opaqueBox(img, w, h) : { x: 0, y: 0, w, h };
    if (!b) { t = PIXI.Texture.EMPTY; this.map.set(img, t); return t; }
    if (b.y40 !== undefined) primeBarTop(s, b.y40);
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

  // поместится ли картинка w×h в текущий лист (без нового листа)
  fits(w, h) {
    const p = this.list[this.list.length - 1];
    if (!p) return true;
    const y = p.x + w + PAD > ATLAS ? p.y + p.rowH + PAD : p.y;
    return y + h + PAD <= ATLAS;
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
    // полёт над препятствием (Player.lift): тело выше, тень остаётся на земле и становится меньше
    const fl = p.lift || 0, f = p.sk.boneMap.float, lift = (f ? Math.max(0, -f.ty) : 0) + fl, k = Math.max(0.45, 1.15 - lift * 0.035);
    this.shadow.position.set(tmp.x, tmp.y); this.shadow.scale.set(k); this.shadow.alpha = 0.24 * k;
    let n = 0;
    p.sk.eachDraw(tmp.x, tmp.y - fl, 1, p.flip, (s, a, b, c, d, e, f2) => {
      let sp = this.parts[n];
      if (!sp) { sp = this.parts[n] = new PIXI.Sprite(); this.c.addChild(sp); }
      sp.visible = true;
      const t = this.scene.atlas.tex(s);
      if (sp.texture !== t) sp.texture = t;
      // спрайт рисуется с (-ax,-ay) размером (w,h) в системе вложения
      const kx = s.w / t.width, ky = s.h / t.height;
      sp.anchor.set(s.ax / s.w, s.ay / s.h);
      sp.setFromMatrix(MX.set(a * kx, b * kx, c * ky, d * ky, e, f2)); // одна матрица на всех: без мусора в каждом кадре
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
    // земля: по контейнеру на участок (одна сетка на кусок — отдельная группа рендера не нужна)
    for (let c = 0; c < CHUNKS * CHUNKS; c++) {
      const cc = new PIXI.Container(); cc.tiles = [];
      this.chunks.push(cc); world.addChild(cc);
    }
    // туман вокруг карты: одна сетка с плавной прозрачностью, над ней — лес (полупрозрачный, «в дымке»)
    this.fogMesh = null; this.fogForest = new PIXI.Container(); this.fogForest.eventMode = 'none';
    this.fogC = new PIXI.Container(); world.addChild(this.fogC); this.fogC.addChild(this.fogForest);
    // пруды: плоские, под всем остальным (одна картинка на пруд, Farm.objSprite)
    this.pondC = new PIXI.Container(); world.addChild(this.pondC);
    this.decorC = new PIXI.Container(); world.addChild(this.decorC); // плоский декор (сейчас не используется)
    this.bedsC = new PIXI.Container({ sortableChildren: true, isRenderGroup: true }); world.addChild(this.bedsC);
    this.border = new PIXI.Graphics(); world.addChild(this.border);
    // клетки, которые поливает поливалка (под растениями и объектами, над землёй)
    this.areaG = new PIXI.Graphics(); this.areaG.visible = false; world.addChild(this.areaG); this.areaKey = '';
    this.objC = new PIXI.Container({ sortableChildren: true }); world.addChild(this.objC);
    this.over = new PIXI.Container(); world.addChild(this.over);
    this.border2 = new PIXI.Graphics(this.border.context); this.border2.alpha = 0.45; this.over.addChild(this.border2);
    this.ghost2 = new PlayerView(this); this.ghost2.c.alpha = 0.4; this.over.addChild(this.ghost2.c);
    this.marks = new PIXI.Graphics(); this.over.addChild(this.marks);
    this.bubbles = new PIXI.Container(); this.over.addChild(this.bubbles);
    this.barsG = new PIXI.Graphics(); this.over.addChild(this.barsG); this.barsKey = { v: -1, x0: 0, y0: 0, x1: 0, y1: 0 };
    this.ringC = new PIXI.Container(); this.over.addChild(this.ringC); this.rings = []; // кольца прочности (syncRings)
    this.queueC = new PIXI.Container(); this.over.addChild(this.queueC);
    this.signsC = new PIXI.Container(); this.over.addChild(this.signsC);
    this.hintArrow = new PIXI.Sprite(); this.hintArrow.visible = false; this.over.addChild(this.hintArrow); // стрелка над целью задания
    this.moverC = new PIXI.Container(); this.over.addChild(this.moverC);
    this.moverG = new PIXI.Graphics(); this.moverC.addChild(this.moverG);
    this.moverHi = new PIXI.Sprite(); this.moverHi.blendMode = 'add'; this.moverC.addChild(this.moverHi);
    this.moverGhost = new PIXI.Sprite(); this.moverGhost.alpha = 0.6; this.moverC.addChild(this.moverGhost);
    this.fx = new PIXI.Graphics(); this.over.addChild(this.fx);
    this.floatC = new PIXI.Container(); this.over.addChild(this.floatC);
    this.player = new PlayerView(this); this.objC.addChild(this.player.c);
    // кольцо вокруг цели задания: задняя половина — под целью, передняя — над ней (сортируются с объектами)
    this.hintRing = [new PIXI.Sprite(), new PIXI.Sprite()];
    for (const r of this.hintRing) { r.visible = false; this.objC.addChild(r); }
    // цель мягко вспыхивает, когда стрелка подпрыгивает: в густом лесу видно, какое именно дерево
    this.hintGlow = new PIXI.Sprite(); this.hintGlow.blendMode = 'add'; this.hintGlow.visible = false; this.objC.addChild(this.hintGlow);
    // кружок подсказки у края экрана (цель задания за экраном) — поверх мира, в пикселях экрана
    this.hintEdge = new PIXI.Container(); this.hintEdge.visible = false; app.stage.addChild(this.hintEdge);
    this.hintBadge = new PIXI.Sprite(); this.hintIcon = new PIXI.Sprite(); this.hintPtr = new PIXI.Sprite();
    this.hintIcon.anchor.set(0.5);
    this.hintEdge.addChild(this.hintPtr, this.hintBadge, this.hintIcon);
    this.hintMoving = false; this.hintEdgeHit = null; this._ha = 0;
    this.objs = new Map(); this.crops = new Map(); this.bub = new Map();
    this.stamp = 0; this._obTick = 0;
    this.keys = {};
    this.textRes = Math.max(2, (window.devicePixelRatio || 1)) * 2.6; // текст чёткий и при сильном приближении
    // Надписи — растровые шрифты: буквы рисуются один раз в атлас, новая надпись ничего не грузит в видеокарту
    const chars = [['a', 'z'], ['A', 'Z'], ['0', '9'], ['а', 'я'], ['А', 'Я'], 'ёЁ +-−–—×·:;!?.,%()/«»"\'№'];
    const font = { fontFamily: 'system-ui, sans-serif', fontWeight: '700' };
    // Pixi рисует буквы шрифтом размера 100 и отступ между ними тоже меряет в нём: 36 ≈ 4 px при размере 11.
    // С маленьким отступом при отдалении (mip-уровни текстуры) в букву «затекали» края соседних —
    // тёмные полоски над буквами и сбоку от них.
    const pad = 36;
    // Лист с буквами: 2048 px вместо 4096 по умолчанию — все буквы и так влезают, а видеопамяти в 4 раза меньше
    PIXI.DynamicBitmapFont.defaultOptions.textureSize = Math.floor(2048 / this.textRes);
    PIXI.BitmapFont.install({ name: 'farm-dark', style: { ...font, fontSize: 11, fill: 0x3d2b1f }, chars, resolution: this.textRes, padding: pad });
    PIXI.BitmapFont.install({ name: 'farm-float', style: { ...font, fontSize: 11, fill: 0xfffbe8, stroke: { color: 0x3a2717, width: 3, join: 'round' } }, chars, resolution: this.textRes, padding: pad });
  }

  // спрайт игры → Pixi-спрайт в точке (x, y) — опорной точке спрайта. Плоские (пруды) — из атласа земли:
  // рисуются сразу после земли, и для них не нужен лишний лист в атласе объектов
  put(sp, s, x, y) {
    const t = (s.flat ? this.groundAtlas : this.atlas).tex(s);
    if (sp.texture !== t) { sp.texture = t; sp.anchor.set(s.ax / s.w, s.ay / s.h); sp.scale.set(s.w / t.width, s.h / t.height); }
    if (sp.x !== x || sp.y !== y) sp.position.set(x, y);
  }

  // ---------- земля ----------
  // Каждый кусок земли — одна сетка из ромбов (а не 100 прямоугольных спрайтов): у клетки рисуется
  // только сам ромб, прозрачные углы видеокарта не трогает — заливка экрана вдвое меньше.
  syncGround() { const _t = performance.now(); try { this._syncGround(); } finally { this.f.perf.mark('syncGround', performance.now() - _t); } }
  _syncGround() {
    const f = this.f, w = f.world, S = f.S;
    const per = this.chunks.map(() => []);
    const edges = this.chunks.map(() => []); // травяной край дорожек — поверх всей земли куска
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
      const i = gy * N + gx, t = w.tiles[i];
      const cx = (gx - gy) * HW, cy = (gx + gy + 1) * HH;
      let s, bed = null;
      // под прудом — тоже трава: пруд (одна картинка) лежит поверх неё, у берега трава видна
      if (t === T.GRASS || t === T.WATER) s = S.grass[w.variant[i]];
      else if (t === T.PATH) {
        // дорожка своего вида (две бесшовные плитки вперемешку), там, где рядом трава, — край из травы
        s = (S.paths[w.pathKind[i]] || S.paths[0]).tiles[w.variant[i] & 1];
        const e = f.pathEdge(gx, gy);
        if (e) edges[w.chunkOf(gx, gy)].push(e, cx, cy);
      }
      else {
        // грядка: трава, а поверх неё — объёмная грядка (сухая или политая)
        const b = f.beds.get(i);
        const wet = b && b.crop && !f.cropInfo(b).needsWater && !f.cropInfo(b).ready ? 1 : 0;
        s = S.grass[w.variant[i]]; bed = S.bed[wet];
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
    // трава под туманом (за краем карты) — в сетку ближайшего куска: затемняется вместе с ним
    const F = FOG_W, cl = (v) => Math.max(0, Math.min(CHUNKS - 1, Math.floor(v / CHUNK)));
    for (let gy = -F; gy < N + F; gy++) for (let gx = -F; gx < N + F; gx++) {
      if (gx >= 0 && gy >= 0 && gx < N && gy < N) { if (gy >= 0 && gy < N) gx = N - 1; continue; }
      const h = hash2(gx + 977, gy + 311);
      const s = S.grass[h < 0.6 ? 0 : h < 0.85 ? 1 : h < 0.93 ? 3 : 2];
      per[cl(gy) * CHUNKS + cl(gx)].push(s, (gx - gy) * HW, (gx + gy + 1) * HH);
    }
    for (let c = 0; c < per.length; c++) { if (edges[c].length) per[c].push(...edges[c]); this.chunkMesh(this.chunks[c], per[c]); }
    this.groundAtlas.flush();
    if (!this.fogMesh) this.makeFog();
  }

  chunkMesh(cc, list) {
    // пересобираем, только если в куске что-то поменялось
    const same = cc.list && cc.list.length === list.length && cc.list.every((v, i) => v === list[i]);
    if (same) return;
    cc.list = list;
    const by = new Map(); // страница атласа → вершины
    for (let j = 0; j < list.length; j += 3) {
      const s = list[j];
      const t = this.groundAtlas.tex(s), fr = t.frame, p = t.page || t.source;
      let m = by.get(p); if (!m) by.set(p, m = { t, pos: [], uv: [] });
      const W = t.source.width, H = t.source.height;
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

  // украшения прудов (камыш, рогоз, камни — World.genDecor): стоят на месте, пересобираются при открытии
  // участка (затемнение) и когда пруд или украшение переставили, убрали, поставили (World.decorV)
  syncDecor() {
    const f = this.f, w = f.world, D = f.S.decor;
    if (!this.decorSp) this.decorSp = [];
    const list = w.decor || [];
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      let s = D[d.type];
      if (!s) continue;
      let e = this.decorSp[i];
      if (!e) {
        e = this.decorSp[i] = new PIXI.Sprite();
        toWorld(d.x, d.y, tmp); e.wx = tmp.x; e.wy = tmp.y;
        const flat = d.type === 'lily' || d.type === 'leaves';
        if (!flat) e.zIndex = Z(d.x + d.y, tmp.y);
        (flat ? this.decorC : this.objC).addChild(e);
      }
      if (!w.isOpen(d.gx, d.gy)) s = dimSprite(s);
      this.put(e, s, e.wx, e.wy);
      e.bw = s.w; e.bh = s.h; e.bax = s.ax; e.bay = s.ay;
    }
  }

  // декор прудов заново (пруд переставили, убрали, поставили)
  resetDecor() {
    if (this.decorSp) for (const e of this.decorSp) if (e) e.destroy();
    this.decorSp = [];
    this.syncDecor();
  }

  // Туман: кольца квадрата сетки (в клетках от края карты), прозрачность — из столбика-градиента
  // в текстуре (v = непрозрачность). Внутренние кольца чуть «гуляют» — край тумана клубами.
  makeFog() {
    const c = document.createElement('canvas'); c.width = 2; c.height = 256;
    const g = c.getContext('2d'), col = FOG.color;
    const r = (col >> 16) & 255, gg = (col >> 8) & 255, b = col & 255;
    for (let y = 0; y < 256; y++) { g.fillStyle = `rgba(${r},${gg},${b},${y / 255})`; g.fillRect(0, y, 2, 1); }
    const texture = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: c, scaleMode: 'linear' }) });
    const F = FOG_W, D = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, F, F + 1.5, 80];
    const M = 64, L = 4 * M; // точек на сторону и на всё кольцо
    const pos = new Float32Array(D.length * L * 2), uv = new Float32Array(D.length * L * 2);
    for (let k = 0; k < D.length; k++) for (let i = 0; i < L; i++) {
      const a = (2 * Math.PI * i) / L;
      const jit = k > 0 && D[k] < F + 1 ? 0.32 * Math.sin(a * 23 + k * 1.7) + 0.18 * Math.sin(a * 41 + k * 0.6) : 0;
      const d = Math.max(0.05 * (k > 0), D[k] + jit), side = (i / M) | 0, t = (i % M) / M, len = N + 2 * d;
      let x, y;
      if (side === 0) { x = -d + t * len; y = -d; } else if (side === 1) { x = N + d; y = -d + t * len; } else if (side === 2) { x = N + d - t * len; y = N + d; } else { x = -d; y = N + d - t * len; }
      const o = (k * L + i) * 2;
      pos[o] = (x - y) * HW; pos[o + 1] = (x + y) * HH;
      uv[o] = 0.5; uv[o + 1] = (fogAlpha(D[k]) * 254 + 1) / 256;
    }
    const idx = new Uint16Array((D.length - 1) * L * 6);
    let q = 0;
    for (let k = 0; k < D.length - 1; k++) for (let i = 0; i < L; i++) {
      const a = k * L + i, b2 = k * L + (i + 1) % L, c2 = a + L, d2 = b2 + L;
      idx[q++] = a; idx[q++] = b2; idx[q++] = d2; idx[q++] = a; idx[q++] = d2; idx[q++] = c2;
    }
    this.fogMesh = new PIXI.Mesh({ geometry: new PIXI.MeshGeometry({ positions: pos, uvs: uv, indices: idx }), texture });
    this.fogMesh.eventMode = 'none';
    this.fogC.addChildAt(this.fogMesh, 0);
  }

  // лес под туманом: спрайты по глубине, у края почти чёткие, дальше тонут в дымке
  syncFogForest() {
    const f = this.f, w = f.world, FF = this.fogForest;
    for (const ch of FF.removeChildren()) ch.destroy();
    const list = w.fogTrees.slice().sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy) || (a.gy - b.gy));
    this.fogSp = [];
    for (const t of list) {
      const al = 1 - fogAlpha(t.d);
      if (al < 0.05) continue;
      const s = f.objSprite(t);
      if (!s) continue;
      const e = new PIXI.Sprite();
      toWorld(t.gx + 0.5, t.gy + 0.5, tmp);
      this.put(e, s, tmp.x, tmp.y);
      e.alpha = al; e.wx = tmp.x; e.wy = tmp.y; e.bw = s.w; e.bh = s.h; e.bax = s.ax; e.bay = s.ay;
      const cl = (v) => Math.max(0, Math.min(CHUNKS - 1, Math.floor(v / CHUNK)));
      e.chunk = cl(t.gy) * CHUNKS + cl(t.gx);
      FF.addChild(e); this.fogSp.push(e);
    }
    this.keys.fogTint = -1;
  }

  // Облака на краю тумана: неподвижные, закрывают ступеньки края сетки тумана.
  // Вдоль сторон — облака и клочки, на углах — длинные полосы. Расстановка по хешу, всегда одинаковая.
  syncFogClouds() {
    const FS = this.f.S.fog, C = this.fogClouds || (this.fogClouds = new PIXI.Container());
    for (const ch of C.removeChildren()) ch.destroy();
    this.cloudSp = [];
    if (!FS) return;
    if (!C.parent) this.fogC.addChild(C);
    const put = (s, gx, gy, k, flip, al) => {
      const e = new PIXI.Sprite(); toWorld(gx, gy, tmp);
      this.put(e, s, tmp.x, tmp.y);
      e.scale.set(e.scale.x * k * (flip ? -1 : 1), e.scale.y * k); e.alpha = al;
      const w = s.w * k, h = s.h * k;
      e.bx = tmp.x - w / 2; e.by = tmp.y - h / 2; e.bw = w; e.bh = h;
      C.addChild(e); this.cloudSp.push(e);
    };
    const pick = (arr, h) => arr[(h * arr.length) | 0];
    // точка на стороне side (0 — верх-право, 1 — низ-право, 2 — низ-лево, 3 — верх-лево) в t клетках от начала, d — за краем
    const at = (side, t, d) => side === 0 ? [t, -d] : side === 1 ? [N + d, t] : side === 2 ? [t, N + d] : [-d, t];
    for (let side = 0; side < 4; side++) {
      const back = side === 0 || side === 3; // с ближних сторон облако выше по экрану заходило бы на карту
      for (let t = 2, i = 0; t < N - 1; t += 5, i++) {
        const h = hash2(side * 101 + i * 7, i * 13 + 5), h2 = hash2(i * 17 + 3, side * 31 + 11);
        const [x, y] = at(side, t + (h - 0.5) * 2, (back ? 2.3 : 3) + (h2 - 0.5) * 0.8);
        put(pick(FS.clouds, h2), x, y, 0.8 + 0.35 * h, h > 0.5, 0.92);
        if (FS.wisps.length && h2 > 0.35) {
          const [wx, wy] = at(side, t + 2.5, (back ? 1.2 : 1.8) + h * 0.5);
          put(pick(FS.wisps, h), wx, wy, 0.7 + 0.4 * h2, h2 > 0.7, 0.65);
        }
      }
    }
    if (FS.strips.length) [[-2.5, -2.5], [N + 3, -2], [N + 3.5, N + 3.5], [-2, N + 3]].forEach(([x, y], i) => put(FS.strips[i % FS.strips.length], x, y, 0.75, i & 1, 0.9));
  }

  syncFog() { const _t = performance.now(); try { this._syncFog(); } finally { this.f.perf.mark('syncFog', performance.now() - _t); } }
  _syncFog() {
    const w = this.f.world;
    // закрытые куски — затемнение цветом самого куска (без лишнего слоя поверх)
    const gray = (k) => { const v = Math.round(k * 255); return (v << 16) | (v << 8) | v; };
    for (let c = 0; c < CHUNKS * CHUNKS; c++) this.chunks[c].tint = w.unlocked[c] ? 0xffffff : gray(w.canUnlock(c) ? 0.66 : 0.5);
    if (this.fogSp) for (const e of this.fogSp) e.tint = this.chunks[e.chunk].tint;
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
      const ls = new PIXI.Sprite(this.iconTex(f.iconImg.lock)); ls.width = 14; ls.height = 14; ls.position.set(-bw / 2 + 3, -7); box.addChild(ls);
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
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (w.tile(x, y) === T.PATH) f.pathEdge(x, y);
    const S = f.S;
    const GROUND = ['grass', 'paths', 'pathEdge', 'pathParts', 'pathBlend', 'ponds'];
    for (const v of S.grass) this.groundAtlas.tex(v);
    for (const p of S.paths) for (const v of p.tiles) this.groundAtlas.tex(v);
    // травяной край: какой есть на карте, и самые частые (прямые дорожки, углы, концы) — если в листе
    // атласа есть место (второй лист — лишние 16 МБ видеопамяти)
    for (const v of S.pathEdge.values()) this.groundAtlas.tex(v);
    // пруды: большие плоские картинки — в лист земли (там есть место), без затемнённых копий:
    // на закрытом участке их темнит оттенок (tint), как землю
    for (const v of Object.values(S.ponds)) this.groundAtlas.tex(v);
    for (let key = 1; key < 16; key++) {
      const e = f.pathEdgeOf(key);
      if (!e || this.groundAtlas.map.get(e.canvas)) continue;
      if (!this.groundAtlas.fits(e.canvas.width, e.canvas.height)) break;
      this.groundAtlas.tex(e);
    }
    for (const [k, v] of Object.entries(S)) if (typeof v !== 'function' && !GROUND.includes(k)) add(v, k !== 'bubble' && k !== 'fog' && k !== 'hint' && k !== 'deco' && k !== 'fence' && k !== 'animal'); // декор и животные только на открытой земле
    for (const o of w.objects || []) { if (!o || OBJECTS[o.type].flat) continue; const s = f.objSprite(o); if (s) { this.atlas.tex(s); this.atlas.tex(dimSprite(s)); } }
    for (const arr of Object.values(S.objArt)) for (const t of arr) for (const id of [0, 1, 3]) { const st = S.stumpOf(t, id); if (st) { this.atlas.tex(st); this.atlas.tex(dimSprite(st)); } }
    for (const im of Object.values(f.iconImg)) if (im.complete && im.naturalWidth) this.iconTex(im);
    // все вложения скелета фермера (кадры хвоста, инструменты) — иначе они грузятся в видеокарту
    // посреди игры, когда фермер впервые берёт топор или удочку
    const skins = f.player && f.player.sk && f.player.sk.data.skins;
    if (skins) for (const sk of Object.values(skins)) for (const slot of Object.values(sk || {})) for (const att of Object.values(slot || {})) if (att && att.sprite && att.sprite.canvas) this.atlas.tex(att.sprite);
    this.atlas.flush(); this.groundAtlas.flush();
    this.atlas.sealed = this.groundAtlas.sealed = true; this.atlas.perf = this.groundAtlas.perf = f.perf;
    const R = this.app.renderer;
    for (const p of [...this.atlas.list, ...this.groundAtlas.list]) R.texture?.initSource?.(p.source);
    // первые номера очереди дел — картинки рисуются и уходят в видеокарту сейчас,
    // а не когда игрок впервые поставит несколько дел подряд
    for (let n = 1; n <= QUEUE_SHOW; n++) for (const cur of [false, true]) R.texture?.initSource?.(this.queueTex(n, cur).source);
    // кольца прочности: пара картинок заранее (рубят обычно одно-два дерева сразу)
    for (let i = 0; i < 2; i++) { const r = this.ring(i); this.drawRing(r, 5, 2.5, 1); R.texture?.initSource?.(r.source); r.sp.visible = false; }
    // первые кадры (сборка сцены, загрузка в видеокарту, сборка шейдеров для всех видов
    // отрисовки: надписи, частицы, рамки) — ещё за экраном загрузки
    const cam = f.cam, z0 = cam.zoom, x0 = cam.x, y0 = cam.y;
    const p = f.player, tx = Math.floor(p.x), ty = Math.floor(p.y);
    // всплывающих надписей сразу несколько (за один удар их бывает до пяти): их спрайты создаются здесь
    for (let i = 0; i < 6; i++) f.float(x0, y0 - i * 12, i ? '+1 опыт' : '+1 Дерево', i ? 'star' : 'wood');
    f.burst(x0, y0, '#fff', 4, true); f.tapFx = { x: tx, y: ty, t: 0.35 };
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
        lines.push(`${name}: ${med.toFixed(1)} мс (${Math.round(1000 / med)} fps), вызовов ${this.calls}`);
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
    const K = this.keys;
    if (K.gv !== f.groundV || K.wet !== wet) { K.gv = f.groundV; K.wet = wet; this.syncGround(); }
    const uc = w.unlockedCount();
    if (K.uc !== uc || K.house !== f.st.house) { K.uc = uc; K.house = f.st.house; this.syncFog(); this.syncSigns(); this.syncDecor(); }
    if (K.decorV !== w.decorV || K.decorW !== w) { K.decorV = w.decorV; K.decorW = w; this.resetDecor(); }
    if (K.fogV !== w.fogV || K.fogW !== w) { K.fogV = w.fogV; K.fogW = w; this.syncFogForest(); this.syncFog(); }
    if (K.fogS !== f.S.fog) { K.fogS = f.S.fog; this.syncFogClouds(); }
    this.fogC.visible = !(f.editor && f.editor.hideFog);
    const FS = this.fogSp;
    if (FS && this.fogC.visible) for (let i = 0; i < FS.length; i++) { const e = FS[i]; const vis = r.visible(e.wx - e.bax, e.wy - e.bay, e.bw, e.bh); if (e.visible !== vis) e.visible = vis; }
    const CS = this.cloudSp;
    if (CS && this.fogC.visible) for (let i = 0; i < CS.length; i++) { const e = CS[i]; const vis = r.visible(e.bx, e.by, e.bw, e.bh); if (e.visible !== vis) e.visible = vis; }

    // видимость кусков земли
    const CB = this._cb || (this._cb = this.chunks.map((_, c) => w.chunkBounds(c))); // границы кусков не меняются
    // у крайних кусков в сетке ещё и трава под туманом — запас шире
    const GB = this._gb || (this._gb = CB.map((b, c) => {
      const cx = c % CHUNKS, cy = (c / CHUNKS) | 0, edge = !cx || !cy || cx === CHUNKS - 1 || cy === CHUNKS - 1;
      const m = 40 + (edge ? FOG_W * 2 * HW : 0);
      return { minX: b.minX - m, maxX: b.maxX + m, minY: b.minY - m, maxY: b.maxY + m };
    }));
    for (let c = 0; c < this.chunks.length; c++) {
      const b = GB[c];
      this.chunks[c].visible = b.maxX > v.minX && b.minX < v.maxX && b.maxY > v.minY && b.minY < v.maxY;
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
    const fo = this._fo || (this._fo = []); // переиспользуем, чтобы не плодить мусор
    const foc = (x0, y0, x1, y1, depth, gx, gy) => {
      const q = fo[F.length] || (fo[F.length] = {});
      q.x0 = x0; q.y0 = y0; q.x1 = x1; q.y1 = y1; q.depth = depth; q.gx = gx; q.gy = gy; q.hit = false; F.push(q);
    };
    // место w×h клеток с углом (gx, gy): рамка — ромб места, чуть меньше; gx, gy — сам объект там не гаснет
    const focArea = (gx, gy, cw, ch, sgx, sgy) => {
      toWorld(gx + cw / 2, gy + ch / 2, tmp);
      const k = (cw + ch) / 2;
      foc(tmp.x - HW * k + 6, tmp.y - HH * k + 3, tmp.x + HW * k - 6, tmp.y + HH * k - 3, gx + cw / 2 + gy + ch / 2, sgx, sgy);
    };
    // цель: дело в очереди или последнее нажатие ({ obj } или { x, y })
    const focAim = (a) => {
      const o = a.obj;
      if (o) { if (w.objects[o.id] === o) focArea(o.gx, o.gy, o.w, o.h, o.gx, o.gy); } else if (w.inside(a.x, a.y)) focArea(a.x, a.y, 1, 1, a.x, a.y);
    };
    const pl = p.lift || 0;
    foc(tmp.x - 11, tmp.y - 50 - pl, tmp.x + 11, tmp.y - pl, pdepth, -1, -1); // F[0] — фермер (его силуэт поверх, ghost2)
    if (f.hover) focAim(f.hover); // клетка под мышкой (ПК)
    // На телефоне наведения нет: прозрачным остаётся то, что закрывает место последнего нажатия
    // (пока открыто его меню, Farm.look) и цели очереди дел — пока призрачок туда идёт и работает
    if (f.look) focAim(f.look);
    if (p.current) focAim(p.current);
    for (let i = 0; i < p.queue.length; i++) focAim(p.queue[i]);
    // «Переставить»: все высокие объекты полупрозрачны, а то, что закрывает место, куда ставим, — как обычно
    const mv = f.mover.active ? f.mover : null, mvSel = mv && mv.sel && mv.sel.kind === 'obj' ? mv.sel.o : null;
    if (mv && mv.sel && mv.to) focArea(mv.to.gx, mv.to.gy, mv.sel.w || 1, mv.sel.h || 1, -1, -1);

    // объекты
    const P = this.f.perf;
    let tp = performance.now();
    const stamp = ++this.stamp;
    let playerHidden = false;
    const OB = w.objects;
    const one = (o) => {
      let e = this.objs.get(o);
      const flat = OBJECTS[o.type].flat;
      if (!e) { e = new PIXI.Sprite(); e.o = o; this.objs.set(o, e); (flat ? this.pondC : this.objC).addChild(e); }
      e.stamp = stamp;
      let s = f.objSprite(o);
      const vis = r.visible(o.wx - s.ax - 4, o.wy - s.ay, s.w + 8, s.h);
      if (e.visible !== vis) e.visible = vis;
      if (!vis) { o.fade = 0; return; }
      if (flat) {
        // пруд: плоский, призрака не закрывает; на закрытом участке темнеет вместе с землёй (тот же оттенок)
        const tint = this.chunks[w.chunkOf(o.gx + (o.w >> 1), o.gy + (o.h >> 1))].tint;
        if (e.tint !== tint) e.tint = tint;
        this.put(e, s, o.wx, o.wy);
        return;
      }
      const open = w.isOpen(o.gx, o.gy);
      if (!open) s = dimSprite(s);
      const sh = o.shake > 0 ? Math.sin(f.time * 70) * 2.2 * (o.shake / 0.25) : 0;
      // прыжок животного (animals.js HOP = 0,35 с): вверх на 5 единиц и обратно
      const hop = o.hop > 0 ? -Math.sin((1 - o.hop / 0.35) * Math.PI) * 5 : 0;
      let fade = o === mvSel ? 0 : f.occludes(o, s, F); // то, что переставляем, не гаснет: оно подсвечено
      if (mv && !fade && open && o !== mvSel && s.h >= MOVER_TALL) fade = MOVER_FADE;
      o.fade = (o.fade || 0) + (fade - (o.fade || 0)) * 0.3;
      if (o.fade < 0.02) o.fade = 0;
      if (fade && F[0].hit) playerHidden = true;
      const al = o.fade ? 1 - FADE_A * o.fade : 1;
      if (e.alpha !== al) e.alpha = al;
      this.put(e, s, o.wx + sh, o.wy + hop);
      const z = Z(o.depth, o.wy);
      if (e.zIndex !== z) e.zIndex = z;
    };
    // Обходим только объекты кусков рядом с экраном (на слабом процессоре обход всей карты — главная цена кадра).
    // Полный обход — когда объекты появились/исчезли/двигаются и изредка для надёжности.
    const full = !this.buckets || this._obN !== OB.length || f.mover.active || f.editor || ++this._obTick >= 90;
    if (full) {
      this._obN = OB.length; this._obTick = 0;
      const B = this.buckets = this.chunks.map(() => []);
      const FL = this.flats = []; // пруды большие и их мало: обходим каждый кадр, не по кускам
      for (let oi = 0; oi < OB.length; oi++) { const o = OB[oi]; if (o) { (OBJECTS[o.type].flat ? FL : B[w.chunkOf(o.gx, o.gy)]).push(o); one(o); } }
      this.objs.forEach((e) => { if (e.stamp !== stamp) { e.destroy(); this.objs.delete(e.o); } });
      this._cvis = this.chunks.map(() => true);
    } else {
      const B = this.buckets, CV = this._cvis, FL = this.flats;
      for (let i = 0; i < FL.length; i++) { const o = FL[i]; if (OB[o.id] === o) one(o); else this._obTick = 1e9; }
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
    tp = P.part(full ? 'объекты, все' : 'объекты', tp);

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
    // пузыри «готово» над зданиями с крафтом (Farm.syncBars → f.bldBub: x, y по 2 числа)
    const BB = f.bldBub || [], BP = this.bldBub || (this.bldBub = []);
    for (let i = 0; i * 2 < BB.length; i++) {
      let bu = BP[i];
      if (!bu) { bu = BP[i] = new PIXI.Sprite(); this.bubbles.addChild(bu); }
      bu.visible = r.visible(BB[i * 2] - 16, BB[i * 2 + 1] - 30, 32, 32);
      if (bu.visible) this.put(bu, S.bubble.ready, BB[i * 2], BB[i * 2 + 1] + bob);
    }
    for (let i = BB.length / 2; i < BP.length; i++) BP[i].visible = false;
    // пузыри над животными: корм, которого они ждут, или готовый продукт (Farm.syncBars → f.aniBub: x, y, картинка)
    const AB = f.aniBub || [], AP = this.aniBub || (this.aniBub = []);
    for (let i = 0; i * 3 < AB.length; i++) {
      let bu = AP[i];
      if (!bu) { bu = AP[i] = new PIXI.Sprite(); this.bubbles.addChild(bu); }
      bu.visible = r.visible(AB[i * 3] - 16, AB[i * 3 + 1] - 30, 32, 32);
      if (bu.visible) this.put(bu, AB[i * 3 + 2], AB[i * 3], AB[i * 3 + 1] + bob);
    }
    for (let i = AB.length / 3; i < AP.length; i++) AP[i].visible = false;

    this.syncBars();

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
    if (f.editor) f.editor.overlay(g, outline);

    this.syncRings();
    this.syncQueue();
    this.syncHint();
    this.syncMover(outline);
    this.syncArea();
    this.syncFx();
    this.syncFloaters();
    P.part('растения и значки', tp);

    this.atlas.flush(P);
    // Pixi пересобирает список отрисовки мира, когда у спрайта поменялись видимость, порядок или их число
    // (при движении камеры — почти каждый кадр): для фриза полезно знать, была ли пересборка
    const RG = this.world.renderGroup, rebuilt = !!(RG && RG.structureDidChange);
    const tr = performance.now(), DST = this.app.drawStats; DST.calls = 0; DST.tris = 0;
    this.app.renderer.render(this.app.stage);
    this.calls = DST.calls; this.tris = DST.tris;
    const pm = performance.now() - tr; if (pm >= 3) { P.mark('отрисовка', pm); if (rebuilt) P.mark('пересборка'); }
  }

  // Полоски времени роста — одна Graphics на всех. Пересобирается, когда Farm пересчитал полоски
  // (раз в секунду) или камера ушла из собранной области; в кадре между этим — ничего не делается.
  syncBars() {
    const f = this.f, g = this.barsG, BR = f.bars, K = this.barsKey, v = f.r.view;
    const show = !!(BR && BR.length) && f.cam.zoom >= BAR_MIN_ZOOM;
    if (g.visible !== show) g.visible = show;
    if (!show) return;
    if (K.v === f.barsV && v.minX >= K.x0 && v.maxX <= K.x1 && v.minY >= K.y0 && v.maxY <= K.y1) return;
    // область с запасом в полэкрана: при обычном движении камеры пересборка редкая
    const mx = (v.maxX - v.minX) / 2, my = (v.maxY - v.minY) / 2;
    K.v = f.barsV; K.x0 = v.minX - mx; K.x1 = v.maxX + mx; K.y0 = v.minY - my; K.y1 = v.maxY + my;
    g.clear();
    let n = 0;
    for (let i = 0; i < BR.length; i += 4) {
      const x = BR[i] - BAR_W / 2, y = BR[i + 1] - BAR_H / 2;
      if (x + BAR_W < K.x0 || x > K.x1 || y + BAR_H < K.y0 || y > K.y1) continue;
      g.rect(x - 1, y - 1, BAR_W + 2, BAR_H + 2); n++;
    }
    if (!n) return;
    g.fill({ color: 0x1e1810, alpha: 0.6 });
    for (let c = 0; c < BAR_COLORS.length; c++) {
      let any = false;
      for (let i = 0; i < BR.length; i += 4) {
        if (BR[i + 3] !== c) continue;
        const x = BR[i] - BAR_W / 2, y = BR[i + 1] - BAR_H / 2;
        if (x + BAR_W < K.x0 || x > K.x1 || y + BAR_H < K.y0 || y > K.y1) continue;
        g.rect(x, y, Math.max(1, BAR_W * BR[i + 2]), BAR_H); any = true;
      }
      if (any) g.fill(BAR_COLORS[c]);
    }
  }

  // ---------- подсказка к заданию ----------
  // Над целью (Farm.hint, считает hints.js) — стрелка, изредка подпрыгивает; на земле под целью — кольцо.
  // Цель за экраном или под панелями — у края экрана кружок с иконкой и стрелкой в её сторону
  // (нажатие — камера едет к цели). Пока призрак занят делом, подсказка прячется.
  syncHint() {
    const f = this.f, h = f.hint, HS = f.S.hint, cam = f.cam, p = f.player, t = f.time;
    const dt = Math.min(0.1, Math.max(0, t - (this._hT ?? t))); this._hT = t;
    if (p.state !== 'idle' || p.queue.length) this._hBusy = t;
    // в «Переставить» стрелки нет; когда ставим грядки из рюкзака — есть (трава у грядок по заданию)
    const moving = f.mover.active && f.mover.brush !== BED_ITEM;
    const want = !!h && h.kind !== 'ui' && !!HS && !moving && !f.editor && !f.benching && t - (this._hBusy ?? -9) > HINT_WAIT;
    // новая цель или подсказка снова появилась — сразу прыжок
    if (this._hV !== f.hintV || (want && !this._hWant)) { this._hV = f.hintV; this._hop0 = t; }
    this._hWant = want;
    const A = want ? 1 : 0;
    this._ha += (A - this._ha) * Math.min(1, dt * 10);
    if (Math.abs(A - this._ha) < 0.02) this._ha = A;
    const al = this._ha;
    if (!al || !h || h.kind === 'ui') {
      this.hintArrow.visible = this.hintRing[0].visible = this.hintRing[1].visible = this.hintEdge.visible = this.hintGlow.visible = false;
      this.hintMoving = al > 0 && al < 1; this.hintEdgeHit = null;
      return;
    }
    const ph = (t - this._hop0) % HINT_HOP, hop = ph < HINT_HOP_T ? Math.sin(Math.PI * ph / HINT_HOP_T) : 0;
    this.hintMoving = hop > 0 || al < 1;
    // где цель и на какой высоте над ней кончик стрелки (над картинкой, значком грядки, табличкой участка)
    f.hintPoint(h, tmp);
    const wx = tmp.x, wy = tmp.y;
    // ring — размер кольца (1 — на клетку), z — порядок цели среди объектов, glow — картинка цели для вспышки
    let top = 10, ring = 1.15, z, glow = null;
    if (h.kind === 'obj') { const o = h.obj; glow = f.objSprite(o); top = barTop(glow) + 6; ring = o.w > 1 ? 2.5 : 1; z = Z(o.depth, o.wy); }
    else if (h.kind === 'chunk') { top = 40; ring = 0; }
    else {
      z = Z(h.x + h.y + 1, wy);
      const b = f.beds.get(h.y * N + h.x);
      if (b && b.crop && f.world.tiles[b.i] === T.SOIL) { const fl = f.cropFlags(b); top = fl & 12 ? 54 : 36; glow = f.S.crops[b.crop][fl & 3]; }
    }
    // при отдалении стрелка на экране не мельче, чем при зуме 1.15
    const k = Math.max(1, 1.15 / cam.zoom), tipY = wy - top;
    const sx = (wx - cam.x) * cam.zoom + cam.viewW / 2, sy = (tipY - cam.y) * cam.zoom + cam.viewH / 2;
    const sa = f.ui.safeArea();
    const onScreen = sx > sa.l && sx < sa.r && sy > sa.t + 8 && sy < sa.b;
    this.hintArrow.visible = onScreen;
    this.hintRing[0].visible = this.hintRing[1].visible = onScreen && ring > 0;
    const G = this.hintGlow;
    G.visible = onScreen && !!glow && hop > 0.02;
    if (G.visible) {
      this.put(G, glow, wx, wy);
      G.alpha = 0.4 * hop * al;
      if (G.zIndex !== z + 0.004) G.zIndex = z + 0.004;
    }
    this.hintEdge.visible = !onScreen;
    this.hintEdgeHit = null;
    if (onScreen) {
      const A2 = this.hintArrow;
      this.put(A2, HS.arrow, wx, tipY - hop * HINT_HOP_H * k);
      const t0 = A2.texture, bx = HS.arrow.w / t0.width, by = HS.arrow.h / t0.height;
      A2.scale.set(bx * k * (1 - 0.06 * hop), by * k * (1 + 0.08 * hop));
      A2.alpha = al;
      if (ring > 0) {
        const rk = ring * (1 + 0.06 * hop);
        for (let i = 0; i < 2; i++) {
          const R = this.hintRing[i], s = i ? HS.ringFront : HS.ringBack;
          this.put(R, s, wx, wy);
          const t1 = R.texture;
          R.scale.set(s.w / t1.width * rk, s.h / t1.height * rk);
          R.alpha = al;
          const rz = z + (i ? 0.005 : -0.005);
          if (R.zIndex !== rz) R.zIndex = rz;
        }
      }
      return;
    }
    // у края экрана: на луче из середины свободной части экрана к цели
    const rad = HS.badge.w / 2, cx = (sa.l + sa.r) / 2, cy = (sa.t + sa.b) / 2;
    let vx = sx - cx, vy = sy - cy;
    if (!vx && !vy) vy = 1;
    // запас от края — на кружок и стрелку возле него
    const hx = Math.max(1, (sa.r - sa.l) / 2 - rad - 16), hy = Math.max(1, (sa.b - sa.t) / 2 - rad - 16);
    const m = Math.min(hx / Math.max(1e-6, Math.abs(vx)), hy / Math.max(1e-6, Math.abs(vy)));
    const ex = cx + vx * m, ey = cy + vy * m, ang = Math.atan2(vy, vx);
    const E = this.hintEdge;
    E.alpha = al;
    const pk = 1 + 0.08 * hop;
    this.put(this.hintBadge, HS.badge, ex, ey);
    const tb = this.hintBadge.texture;
    this.hintBadge.scale.set(HS.badge.w / tb.width * pk, HS.badge.h / tb.height * pk);
    // маленькая стрелка смотрит из кружка на цель (картинка стрелки смотрит вниз)
    const P = this.hintPtr, d = rad + 14 + hop * 3;
    this.put(P, HS.arrow, ex + Math.cos(ang) * d, ey + Math.sin(ang) * d);
    const tp = P.texture;
    P.scale.set(HS.arrow.w / tp.width * 0.72, HS.arrow.h / tp.height * 0.72);
    P.rotation = ang - Math.PI / 2;
    const img = h.icon && f.iconImg[h.icon];
    this.hintIcon.visible = !!(img && img.complete && img.naturalWidth);
    if (this.hintIcon.visible) {
      const it = this.iconTex(img);
      if (this.hintIcon.texture !== it) this.hintIcon.texture = it;
      this.hintIcon.width = this.hintIcon.height = rad * 1.25 * pk;
      this.hintIcon.position.set(ex, ey);
    }
    this.hintEdgeHit = { x: ex, y: ey, r: rad + 12 };
  }

  // Попал ли тап (пиксели экрана) в кружок подсказки у края экрана
  hintHit(sx, sy) {
    const e = this.hintEdgeHit;
    return !!e && this.hintEdge.visible && Math.hypot(sx - e.x, sy - e.y) <= e.r;
  }

  // номера в очереди дел: готовые картинки высокого разрешения с мип-картами,
  // чтобы кружок и цифра были гладкими и при сильном приближении, и при отдалении
  queueTex(n, cur) {
    const key = n + (cur ? 'c' : '');
    this._qTex = this._qTex || {};
    if (this._qTex[key]) return this._qTex[key];
    const S = QBADGE_RES, R = QBADGE_R, pad = 1.5, size = Math.ceil((R + pad) * 2 * S);
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), m = size / 2;
    g.scale(S, S);
    const o = m / S;
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(o, o + 0.9, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3d2b1f'; g.beginPath(); g.arc(o, o, R, 0, Math.PI * 2); g.fill();
    const gr = g.createLinearGradient(0, o - R, 0, o + R);
    if (cur) { gr.addColorStop(0, '#fff1a1'); gr.addColorStop(1, '#f5c531'); } else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#efe3c8'); }
    g.fillStyle = gr; g.beginPath(); g.arc(o, o, R - 1.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3d2b1f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const t = String(n);
    g.font = `800 ${t.length > 1 ? 6.6 : 8}px system-ui, sans-serif`;
    g.fillText(t, o, o + 0.5);
    const source = new PIXI.CanvasSource({ resource: c, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear', alphaMode: 'premultiply-alpha-on-upload' });
    return (this._qTex[key] = new PIXI.Texture({ source }));
  }

  // ---------- кольцо прочности ----------
  // Над деревом, кустом, пнём, камнем, по которому заказаны удары (Farm.rings): кольцо из долей по
  // прочности, сделанные удары залиты (после удара заливка плавно идёт по кругу), заказанные — светлые,
  // остальные — тусклые. В середине — номер очереди. Ударов не заказано — кольцо ещё RING_HOLD секунд
  // видно и угасает. Своя картинка на кольцо, перерисовывается, только когда на ней что-то поменялось.
  syncRings() {
    const f = this.f, p = f.player, R = f.rings, t = f.time;
    const dt = Math.min(0.1, Math.max(0, t - (this._rT ?? t))); this._rT = t;
    // сколько ударов ещё заказано по каждому объекту: текущее дело и очередь
    const ord = this._rOrd || (this._rOrd = new Map());
    ord.clear();
    if (p.current && p.current.n) ord.set(p.current.obj, p.current.n);
    for (const a of p.queue) if (a.n) ord.set(a.obj, (ord.get(a.obj) || 0) + a.n);
    let k = 0, moving = false;
    for (const [o, e] of R) {
      const live = !e.last && o.type === e.type && f.world.objects[o.id] === o;
      const n = live ? ord.get(o) || 0 : 0, age = t - e.t;
      if (!n && age > RING_HOLD + RING_FADE) { R.delete(o); continue; }
      if (e.shown !== e.done) { e.shown = e.shown < e.done ? Math.min(e.done, e.shown + dt * RING_SPEED) : e.done; moving = true; }
      if (!n) moving = true; // угасание — нужны кадры
      // там же, где номер очереди (syncQueue); срубленное — где было
      if (live || e.x == null) { const s = f.objSprite(o); e.x = o.wx; e.y = o.wy - Math.min(s.ay * 0.7, 60) - 6; }
      const r = this.ring(k++);
      // светлые доли: заказанные удары и сделанные, до которых заливка ещё не дошла
      const key = e.total + '|' + Math.round(e.shown * 48) + '|' + (e.done + n);
      if (r.key !== key) { this.drawRing(r, e.total, e.shown, e.done + n - Math.floor(e.shown)); r.key = key; }
      r.sp.visible = true;
      r.sp.position.set(e.x, e.y);
      r.sp.alpha = n || age < RING_HOLD ? 1 : Math.max(0, 1 - (age - RING_HOLD) / RING_FADE);
    }
    for (let i = k; i < this.rings.length; i++) this.rings[i].sp.visible = false;
    this.ringsMoving = moving;
  }

  // i-я картинка кольца (свой холст, своя текстура, свой спрайт)
  ring(i) {
    let r = this.rings[i];
    if (r) return r;
    const c = document.createElement('canvas'); c.width = c.height = RING_PX;
    const source = new PIXI.CanvasSource({ resource: c, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear', alphaMode: 'premultiply-alpha-on-upload' });
    const sp = new PIXI.Sprite(new PIXI.Texture({ source }));
    const k = RING_PX / ((RING_RO + 1.6) * 2); // пикселей на мировую единицу
    sp.anchor.set(0.5); sp.scale.set(1 / k);
    this.ringC.addChild(sp);
    r = this.rings[i] = { c, g: c.getContext('2d'), source, sp, k, key: '' };
    return r;
  }

  // Нарисовать кольцо: total долей, shown — сколько залито (дробное — заливка в пути), light — сколько долей
  // после залитых светлые (удары заказаны). Начало сверху, по часовой стрелке.
  drawRing(r, total, shown, light) {
    const g = r.g, k = r.k, m = RING_PX / 2 / k, rm = (RING_RO + RING_RI) / 2, lw = RING_RO - RING_RI;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, RING_PX, RING_PX);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.lineCap = 'butt';
    const arc = (y, a0, a1) => { g.beginPath(); g.arc(m, y, rm, a0, a1); g.stroke(); };
    g.lineWidth = lw; g.strokeStyle = 'rgba(0,0,0,.22)'; arc(m + 0.9, 0, Math.PI * 2); // тень
    g.strokeStyle = '#3d2b1f'; arc(m, 0, Math.PI * 2); // тёмная подложка — как ободок номера очереди
    const step = Math.PI * 2 / total, gap = total > 1 ? 1.15 / rm : 0, top = -Math.PI / 2, full = Math.floor(shown);
    g.lineWidth = lw - 1.5;
    for (let s = 0; s < total; s++) {
      const a0 = top + s * step + gap / 2, a1 = top + (s + 1) * step - gap / 2;
      const fr = Math.max(0, Math.min(1, shown - s));
      if (fr < 1) { g.strokeStyle = s < full + light ? '#fff1cf' : 'rgba(255,241,207,.3)'; arc(m, fr ? a0 + (a1 - a0) * fr : a0, a1); }
      if (fr > 0) { g.strokeStyle = '#ffa62b'; arc(m, a0, a0 + (a1 - a0) * fr); } // тёплый цвет: виден и на зелёной кроне
    }
    r.source.update();
  }

  syncQueue() {
    const f = this.f, p = f.player;
    const list = p.current && p.current.kind !== 'walk' ? [p.current, ...p.queue] : p.queue;
    const C = this.queueC;
    while (C.children.length < list.length) {
      const sp = new PIXI.Sprite(); sp.anchor.set(0.5); sp.scale.set(1 / QBADGE_RES);
      C.addChild(sp);
    }
    C.children.forEach((sp, i) => {
      const a = list[i];
      sp.visible = !!a;
      if (!a) return;
      let x, y;
      if (a.obj) { const s = f.objSprite(a.obj); x = a.obj.wx; y = a.obj.wy - Math.min(s.ay * 0.7, 60) - 6; }
      else { toWorld(a.x + 0.5, a.y + 0.5, tmp); x = tmp.x; y = tmp.y - 8; }
      sp.position.set(x, y);
      const cur = i === 0 && a === p.current;
      const tx = this.queueTex(i + 1, cur);
      if (sp.texture !== tx) sp.texture = tx;
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
    // клетки объекта (у постройки из рюкзака своего места на карте ещё нет)
    if (s && s.kind !== 'bag') {
      for (const [dx, dy] of m.curCells()) {
        toWorld(s.gx + dx + 0.5, s.gy + dy + 0.5, tmp);
        g.poly([tmp.x, tmp.y - HH + 1, tmp.x + HW - 2, tmp.y, tmp.x, tmp.y + HH - 1, tmp.x - HW + 2, tmp.y]).stroke({ width: 2.5, color: 0xffe65a, alpha: pulse });
      }
    }
    this.moverGhost.visible = !!(s && t);
    if (s && t) {
      for (const [dx, dy] of objCells(s)) {
        toWorld(t.gx + dx + 0.5, t.gy + dy + 0.5, tmp);
        g.poly([tmp.x, tmp.y - HH, tmp.x + HW, tmp.y, tmp.x, tmp.y + HH, tmp.x - HW, tmp.y]).fill({ color: t.ok ? 0x6edc5a : 0xeb4632, alpha: 0.38 });
        g.poly([tmp.x, tmp.y - HH + 1, tmp.x + HW - 2, tmp.y, tmp.x, tmp.y + HH - 1, tmp.x - HW + 2, tmp.y]).stroke({ width: 2, color: t.ok ? 0x8ff06a : 0xff6a50 });
      }
      if (s.kind === 'obj' || s.kind === 'bag' || s.kind === 'decor') {
        if (s.decor) f.decorPoint(t.gx, t.gy, tmp); // украшение пруда: у берега — ближе к земле
        else toWorld(t.gx + s.w / 2, t.gy + s.h / 2, tmp);
        // своя постройка — как встанет: в новом положении поворота, забор — с соседями на новом месте
        const sp = s.kind === 'obj' ? (s.placed ? f.objSprite({ type: s.o.type, id: s.o.id, gx: t.gx, gy: t.gy, rot: s.rot, self: s.o, preview: true }) : f.objSprite(s.o))
          : f.placeSprite(s.id, s.rot, t.gx, t.gy);
        this.moverGhost.visible = !!sp;
        if (sp) this.put(this.moverGhost, sp, tmp.x, tmp.y);
      } else {
        const sp = s.kind === 'path' ? (f.S.paths.find((p) => p.key === s.path) || f.S.paths[0]).tiles[0] : f.S.bed[0];
        toWorld(t.gx + 0.5, t.gy + 0.5, tmp); this.put(this.moverGhost, sp, tmp.x, tmp.y);
      }
    }
  }

  // Клетки полива поливалки (Farm.sprinklerArea): голубые ромбы; там, куда её ставят нельзя, — тусклее.
  // Перерисовываются, только когда поливалка или её место сменились; угасание — прозрачностью.
  syncArea() {
    const f = this.f, a = f.sprinklerArea(), G = this.areaG;
    G.visible = !!a;
    if (!a) { this.areaKey = ''; return; }
    G.alpha = a.k;
    const key = `${a.kind},${a.x},${a.y},${a.bad}`;
    if (key === this.areaKey) return;
    this.areaKey = key;
    const w = f.world, g = G.clear();
    for (const [x, y] of areaCells(a.kind, a.x, a.y)) {
      if (!w.inside(x, y) || !w.isOpen(x, y)) continue;
      toWorld(x + 0.5, y + 0.5, tmp);
      const bed = w.tile(x, y) === T.SOIL;
      g.poly([tmp.x, tmp.y - HH + 1.5, tmp.x + HW - 3, tmp.y, tmp.x, tmp.y + HH - 1.5, tmp.x - HW + 3, tmp.y])
        .fill({ color: 0x4fb6ff, alpha: a.bad ? 0.12 : bed ? 0.4 : 0.24 })
        .stroke({ width: 1.5, color: 0xa8e0ff, alpha: a.bad ? 0.35 : 0.8 });
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
      // плавно: быстро всплывает и замедляется (ease-out), в начале мягко «выпрыгивает», в конце тает
      const k = Math.min(1, fl.t / 1.3), tw = box.tx.width, iw = iconOk ? 12 : 0;
      const rise = 1 - (1 - k) * (1 - k) * (1 - k);
      const pop = k < 0.12 ? k / 0.12 : 1, sc = 0.7 + 0.3 * (1 - (1 - pop) * (1 - pop));
      box.alpha = k < 0.12 ? pop : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      box.scale.set(sc);
      box.position.set(fl.x - (tw + iw) * sc / 2, fl.y - rise * 28);
      box.ic.position.set(tw + 1, -6);
    });
  }
}

// Запуск Pixi на канвасе игры. null — WebGL недоступен (main.js покажет сообщение).
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
    // счётчик вызовов отрисовки (для профайлинга: показывается в счётчике FPS и в тесте видеокарты)
    { const gl = app.renderer.gl, st = app.drawStats = { calls: 0, tris: 0 };
      // без «...a»: массив аргументов на каждый вызов — лишний мусор в каждом кадре
      const de = gl.drawElements.bind(gl), da = gl.drawArrays.bind(gl);
      gl.drawElements = (mode, count, type, offset) => { st.calls++; st.tris += count / 3; return de(mode, count, type, offset); };
      gl.drawArrays = (mode, first, count) => { st.calls++; st.tris += count / 3; return da(mode, first, count); }; }
    // название видеокарты — для счётчика FPS; первый запуск на слабой видеокарте — сразу «Средняя» графика
    // (игрок может сменить в настройках)
    let name = '';
    try {
      const gl = app.renderer.gl, ext = gl.getExtension('WEBGL_debug_renderer_info');
      name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    } catch { /* нет данных о видеокарте */ }
    // «ANGLE (ARM, Mali-G57 MC2, OpenGL ES 3.2)» → «Mali-G57 MC2»
    const angle = /^ANGLE \(([^,]*), ([^,]*)/.exec(name);
    perf.gpu = (angle ? angle[2] : name).slice(0, 48);
    if (perf.gfx === 'auto' && (window.devicePixelRatio || 1) > 1.5 &&
      /PowerVR|Mali-(4|T[0-9]|G(31|51|52|57|68))|Adreno \(TM\) (3|4|50|51|60)\d/i.test(name)) perf.setGfx('mid');
    return app;
  } catch (e) {
    console.warn('WebGL', e);
    return null;
  }
}

// Непрозрачность тумана в d клетках от края карты: 0 у края, плотный к концу полосы
export function fogAlpha(d) {
  const t = Math.max(0, Math.min(1, d / (FOG_W + 0.2)));
  return t * t * (3 - 2 * t);
}
