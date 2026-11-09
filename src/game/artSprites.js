// Спрайты художника (assets/art, нарезаны tools/slice_art.py). Загружаются за экраном загрузки:
// игра не открывается, пока не загружены все картинки, чтобы в игре не было подгрузок.

import { loadImageRetry, makeCanvas } from '../engine/Sprite.js';
import { FLORA, PATHS, PATH_KEYS, PONDS } from './data.js';

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
  // пруды (data.js PONDS): одна картинка на пруд (tools/pond_art.py), иконка в рюкзаке и на рынке — сам пруд
  const ponds = {};
  for (const k of Object.keys(PONDS)) {
    if (!A[k]) continue;
    ponds[k] = A[k];
    A[k].flat = true; // плоский, как земля: лежит в атласе земли (PixiScene.put)
    if (!icons[k]) try { floraIcons[k] = iconOf(A[k]); } catch (e) { /* */ }
  }
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
    wildGrass, fog, obj, crops, icons, flora, floraIcons, ponds,
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
    // украшения прудов (World.genDecor): камыш, рогоз и камни у берега
    decor: { cattail: A.pond_cattail, reeds: A.pond_reeds, rocks: A.pond_rocks, lily: A.pond_lily, leaves: A.pond_leaves },
  };
}
