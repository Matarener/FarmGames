// Спрайты художника (assets/art, нарезаны tools/slice_art.py). Загружаются за экраном загрузки:
// игра не открывается, пока не загружены все картинки, чтобы в игре не было подгрузок.

import { loadImageRetry, makeCanvas } from '../engine/Sprite.js';
import { FLORA, PATHS, PATH_KEYS, PONDS, POND_DECOR, pondDecorId, SPRINKLERS, BED_ITEM, WELL_ITEM, DECOR, FENCES } from './data.js';

/* global __ASSET_V__, __ART_MANIFEST__, __ART_ICONS__ */
const V = typeof __ASSET_V__ !== 'undefined' ? __ASSET_V__ : String(Date.now());
const BASE = 'assets/art/';

// Какие картинки у каких объектов (у камней и пней вариант выбирается по id объекта).
// Деревья и кусты — по имени вида: tree_<вид> / bush_<вид>, а ещё <имя>_bare (без плодов) и <имя>_young.
const OBJ = {
  rock: ['rock', 'rock_small'],
  boulder: ['boulder', 'boulder_moss'],
  stump: ['stump_oak', 'stump_birch', 'stump_pine', 'stump_oak_moss'],
};
for (const [k, f] of Object.entries(FLORA)) OBJ[k] = [f.kind + '_' + k];

// Иконка саженца: само растение в квадрате 64×64
// s.icon — [x, y, w, h]: только эта часть картинки (у прудов — без пустых полей вокруг)
function iconOf(s) {
  const [x, y, sw, sh] = s.icon || [0, 0, s.canvas.width, s.canvas.height];
  const c = makeCanvas(64, 64), g = c.getContext('2d'), k = Math.min(60 / sw, 60 / sh);
  const w = sw * k, h = sh * k;
  g.imageSmoothingQuality = 'high';
  g.drawImage(s.canvas, x, y, sw, sh, (64 - w) / 2, (64 - h) / 2, w, h);
  return c.toDataURL();
}

// Зеркальная копия спрайта (повёрнутый декор): опора отражается вместе с картинкой
export function mirrorSprite(s) {
  if (!s) return s;
  if (s.mirror) return s.mirror;
  const c = makeCanvas(s.canvas.width, s.canvas.height), g = c.getContext('2d');
  g.translate(c.width, 0); g.scale(-1, 1);
  g.drawImage(s.canvas, 0, 0);
  s.mirror = { canvas: c, w: s.w, h: s.h, ax: s.w - s.ax, ay: s.ay, name: s.name + '_m' };
  return s.mirror;
}

// Секция забора по соседям: столбик (post) и пролёты на полклетки (span) к соседям-заборам, склеенные в одну
// картинку. span нарисован от середины клетки (его опора) к соседу gx + 1 — на экране вправо-вниз на 16 × 8 единиц;
// к соседу gx − 1 — он же, сдвинутый на полклетки назад, к соседям по gy — его зеркало. mask: 1 — сосед gx + 1,
// 2 — gy + 1, 4 — gx − 1, 8 — gy − 1. Одиночная секция (0) — прямая вдоль gx. Столбик — поверх пролётов:
// они уходят в него (tools/fence_art.py).
export function fenceSprite(post, span, mask, name) {
  if (!mask) mask = 5;
  const parts = [];
  if (mask & 4) parts.push([span, false, -16, -8]);
  if (mask & 8) parts.push([span, true, 16, -8]);
  if (mask & 1) parts.push([span, false, 0, 0]);
  if (mask & 2) parts.push([span, true, 0, 0]);
  parts.push([post, false, 0, 0]);
  let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
  for (const [p, m, dx, dy] of parts) {
    const ax = m ? p.w - p.ax : p.ax;
    L = Math.min(L, dx - ax); R = Math.max(R, dx - ax + p.w);
    T = Math.min(T, dy - p.ay); B = Math.max(B, dy - p.ay + p.h);
  }
  const k = post.canvas.width / post.w; // пикселей на единицу мира
  const c = makeCanvas((R - L) * k, (B - T) * k), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  for (const [p, m, dx, dy] of parts) {
    const ax = m ? p.w - p.ax : p.ax, x = (dx - ax - L) * k, y = (dy - p.ay - T) * k, w = p.w * k, h = p.h * k;
    if (m) { g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(p.canvas, 0, 0, w, h); g.restore(); } else g.drawImage(p.canvas, x, y, w, h);
  }
  return { canvas: c, w: R - L, h: B - T, ax: -L, ay: -T, name: name + '_' + mask };
}

// Иконка «Повернуть» (кнопка в «Переставить»), пока у художника её нет: круговая стрелка по часовой
function rotateIcon() {
  const c = makeCanvas(64, 64), g = c.getContext('2d'), cx = 31, cy = 34, r = 18;
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.2; // по часовой: от левого низа через верх к правому боку
  const ex = cx + r * Math.cos(a1), ey = cy + r * Math.sin(a1);
  const tx = -Math.sin(a1), ty = Math.cos(a1), nx = Math.cos(a1), ny = Math.sin(a1); // касательная (по ходу) и нормаль
  const draw = (lw, col, head) => {
    g.strokeStyle = g.fillStyle = col; g.lineWidth = lw;
    g.beginPath(); g.arc(cx, cy, r, a0, a1 - 0.25); g.stroke();
    g.beginPath();
    g.moveTo(ex + tx * (11 + head), ey + ty * (11 + head));
    g.lineTo(ex + nx * (10 + head) - tx * (2 + head), ey + ny * (10 + head) - ty * (2 + head));
    g.lineTo(ex - nx * (10 + head) - tx * (2 + head), ey - ny * (10 + head) - ty * (2 + head));
    g.closePath(); g.fill();
  };
  g.lineCap = g.lineJoin = 'round';
  draw(14, '#3d2b1f', 3.5);
  draw(7, '#f5c242', 0);
  return c.toDataURL();
}

export async function loadArt(onProgress) {
  // в сборке manifest вшит в код (работает и с file://), в разработке — читаем файл
  const man = typeof __ART_MANIFEST__ !== 'undefined' ? __ART_MANIFEST__ : await (await fetch(BASE + 'manifest.json?v=' + V)).json();
  const A = {};
  const icList = typeof __ART_ICONS__ !== 'undefined' ? __ART_ICONS__ : await (await fetch(BASE + 'icons.json?v=' + V)).json();
  const list = Object.entries(man);
  const total = list.length + icList.length;
  let done = 0;
  const tick = () => onProgress && onProgress(++done / total);
  // Каждая картинка грузится с повторами; не загрузившиеся собираются в failed, и тогда
  // loadArt падает, а экран загрузки предлагает «Повторить».
  const failed = [];
  const sprites = Promise.all(list.map(async ([name, m]) => {
    try {
      const img = await loadImageRetry(BASE + name + '.webp?v=' + V);
      A[name] = { canvas: img, w: m.w, h: m.h, ax: m.ax, ay: m.ay, name };
      if (m.icon) A[name].icon = m.icon;
    } catch (e) { failed.push(name); }
    tick();
  }));
  // иконки интерфейса (ic_<имя>.webp) — тоже ждём, чтобы они не появлялись в интерфейсе с опозданием
  const icons = {};
  const iconsP = Promise.all(icList.map(async (n) => {
    const url = BASE + 'ic_' + n + '.webp?v=' + V;
    try { icons[n] = { url, img: await loadImageRetry(url) }; } catch (e) { failed.push('ic_' + n); }
    tick();
  }));
  await Promise.all([sprites, iconsP]);
  if (failed.length) {
    const e = new Error('не загрузилось картинок: ' + failed.length);
    e.failed = failed;
    throw e;
  }
  const obj = {};
  for (const [type, names] of Object.entries(OBJ)) obj[type] = names.map((n) => A[n]).filter(Boolean);
  // растения: картинка «без плодов» (<имя>_bare, у кого плоды не собираются — та же, что взрослая),
  // молодое растение (<имя>_young); иконки саженцев и своих растений в рюкзаке
  const flora = {}, floraIcons = {};
  for (const type of Object.keys(OBJ)) {
    const s = obj[type] && obj[type][0];
    if (!s || !/^(tree|bush)_/.test(s.name)) continue;
    flora[type] = { bare: A[s.name + '_bare'] || s, young: A[s.name + '_young'] };
    // иконки в рюкзаке: своё растение — картинка самого растения; саженец — иконка художника
    // (ic_sap_<вид>), а если её нет — тоже растение. file:// не даёт читать пиксели — тогда без них
    try {
      const ic = iconOf(s);
      floraIcons['own_' + type] = ic;
      if (!icons['sap_' + type]) floraIcons['sap_' + type] = ic;
    } catch (e) { /* */ }
  }
  // дорожки (data.js PATHS): две бесшовные плитки на вид (tools/path_tiles.py), иконка в рюкзаке — сама плитка
  const paths = PATH_KEYS.map((k) => {
    const p = PATHS[k], t = A[p.tile] || A.tile_path;
    return { key: k, grassy: !!p.grassy, tiles: [t, A[p.tile + '_2'] || t] };
  });
  for (const p of paths) try { floraIcons[p.key] = iconOf(p.tiles[0]); } catch (e) { /* */ }
  // поливалки (data.js SPRINKLERS): картинка по ключу вида, иконка на рынке и в рюкзаке — сама поливалка
  // (если художник не нарисовал отдельную ic_<вид>)
  const sprinkler = {};
  for (const k of Object.keys(SPRINKLERS)) {
    if (!A[k]) continue;
    sprinkler[k] = A[k];
    if (!icons[k]) try { floraIcons[k] = iconOf(A[k]); } catch (e) { /* */ }
  }
  // декор (data.js DECOR): картинка на каждое положение поворота — [лицом, зеркало, спиной (<ключ>_back), зеркало];
  // у симметричных вещей одна. Иконка на рынке и в рюкзаке — сама вещь в положении 0
  const deco = {};
  for (const [k, d] of Object.entries(DECOR)) {
    const front = A[k];
    if (!front) continue;
    const back = A[k + '_back'] || front, n = d.rot || 1;
    deco[k] = n === 1 ? [front] : n === 2 ? [front, mirrorSprite(front)] : [front, mirrorSprite(front), back, mirrorSprite(back)];
    if (!icons[k]) try { floraIcons[k] = iconOf(front); } catch (e) { /* */ }
  }
  if (!icons.rotate) try { floraIcons.rotate = rotateIcon(); } catch (e) { /* */ }
  // заборы (data.js FENCES): 16 секций на вид — по соседям (fenceSprite), иконка — прямая секция
  const fence = {};
  for (const k of Object.keys(FENCES)) {
    const post = A[k + '_post'], span = A[k + '_span'];
    if (!post || !span) continue;
    fence[k] = Array.from({ length: 16 }, (_, m) => m && fenceSprite(post, span, m, k));
    fence[k][0] = fence[k][5];
    if (!icons[k]) try { floraIcons[k] = iconOf(fence[k][5]); } catch (e) { /* */ }
  }
  // пруды (data.js PONDS): одна картинка на пруд (tools/pond_art.py), иконка в рюкзаке и на рынке — сам пруд
  const ponds = {};
  for (const k of Object.keys(PONDS)) {
    if (!A[k]) continue;
    ponds[k] = A[k];
    A[k].flat = true; // плоский, как земля: лежит в атласе земли (PixiScene.put)
    if (!icons[k]) try { floraIcons[k] = iconOf(A[k]); } catch (e) { /* */ }
  }
  // украшения прудов (камыш, рогоз, камни): иконка предмета — сама картинка pond_<что>
  for (const t of Object.keys(POND_DECOR)) {
    const id = pondDecorId(t);
    if (A[id] && !icons[id]) try { floraIcons[id] = iconOf(A[id]); } catch (e) { /* */ }
  }
  // грядка и колодец в рюкзаке: иконка — сама пустая грядка и починенный колодец
  for (const [id, s] of [[BED_ITEM, A.bed_dry], [WELL_ITEM, A.well_fixed]]) if (s && !icons[id]) try { floraIcons[id] = iconOf(s); } catch (e) { /* */ }
  // куски травяного края у дорожек (склеивает Farm.pathEdge): полосы вдоль сторон и углы
  const pathEdge = {};
  for (const name of Object.keys(A)) if (/^path_(edge|corner)_/.test(name)) pathEdge[name.slice(5)] = A[name];
  // куски перехода между видами дорожек (blend_<вид>_<кусок>): вид выше по слою заходит на соседний
  const pathBlend = {};
  for (const name of Object.keys(A)) {
    const m = /^blend_(.+)_(edge_\w\w|corner_\w_\w+)$/.exec(name);
    if (m) (pathBlend[m[1]] = pathBlend[m[1]] || {})[m[2]] = A[name];
  }
  const crops = {};
  for (const name of Object.keys(A)) {
    const m = /^crop_(\w+)_(\d)$/.exec(name);
    if (m) (crops[m[1]] = crops[m[1]] || [])[+m[2]] = A[name];
  }
  // облака тумана (tools/slice_fog.py): fog_clouds_*, fog_strips_*, fog_wisps_*
  const fog = { clouds: [], strips: [], wisps: [] };
  for (const name of Object.keys(A).sort()) { const m = /^fog_(clouds|strips|wisps)_\d+$/.exec(name); if (m) fog[m[1]].push(A[name]); }
  // дикая высокая трава: grass_tall_0, grass_tall_1, ...
  const wildGrass = Object.keys(A).filter((n) => /^grass_tall_\d+$/.test(n)).sort().map((n) => A[n]);
  return {
    wildGrass, fog, obj, crops, icons, flora, floraIcons, ponds, sprinkler, deco, fence,
    sprouts: { tree: A.sprout_tree, bush: A.sprout_bush }, // ростки посаженных растений
    // спрайт дерева → его пень (у дуба иногда мшистый)
    stumpOf: (tree, id) => {
      const k = tree && tree.name && tree.name.replace('tree_', '').replace(/_bare$/, '');
      if (!k) return null;
      return (k === 'oak' && id % 3 === 0 && A.stump_oak_moss) || A['stump_' + k] || null;
    },
    house: [null, A.house_1, A.house_2, A.house_3, A.house_4, A.house_5],
    well: [A.well_broken, A.well_fixed],
    // варианты травы 0,1 — простая (55% и 25%), 2,3 — с цветами (по 10%). Не отзеркаливать: плитки
    // бесшовные (tools/grass_tiles.py), у зеркальной край другой — будет шов
    grass: [A.tile_grass, A.tile_grass_2, A.tile_grass_flowers, A.tile_grass_flowers_2],
    paths, pathEdge, pathBlend,
    // объёмные грядки: [сухая, политая]; рисуются поверх травы
    bed: [A.bed_dry, A.bed_wet],
    // украшения прудов (World.genDecor): камыш, рогоз и камни (POND_DECOR); кувшинки и листья — в картинке пруда
    decor: { cattail: A.pond_cattail, reeds: A.pond_reeds, rocks: A.pond_rocks, lily: A.pond_lily, leaves: A.pond_leaves },
  };
}
