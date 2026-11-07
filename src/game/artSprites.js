// Спрайты художника (assets/art, нарезаны tools/slice_art.py). Загружаются за экраном загрузки:
// игра не открывается, пока не загружены все картинки (графика из кода игроку не показывается).

import { loadImageRetry, makeCanvas } from '../engine/Sprite.js';

/* global __ASSET_V__, __ART_MANIFEST__, __ART_ICONS__ */
const V = typeof __ASSET_V__ !== 'undefined' ? __ASSET_V__ : String(Date.now());
const BASE = 'assets/art/';

// Какие картинки у каких объектов (у камней и пней вариант выбирается по id объекта)
const OBJ = {
  oak: ['tree_oak'], birch: ['tree_birch'], sakura: ['tree_sakura'], cherry: ['tree_blossom'], maple: ['tree_autumn'],
  apple: ['tree_apple'], pine: ['tree_pine'],
  blueberry: ['bush_blue'], raspberry: ['bush_rasp'], rosehip: ['bush_pink'], hydrangea: ['bush_hydra'], lavender: ['bush_lav'], rose: ['bush_rose'],
  rock: ['rock_mid', 'rock_small'],
  boulder: ['rock_big', 'rock_moss'],
  stump: ['stump_oak', 'stump_birch', 'stump_pine', 'stump_moss'],
};

// Иконка саженца: само растение в квадрате 64×64
function iconOf(s) {
  const c = makeCanvas(64, 64), g = c.getContext('2d'), k = Math.min(60 / s.canvas.width, 60 / s.canvas.height);
  const w = s.canvas.width * k, h = s.canvas.height * k;
  g.imageSmoothingQuality = 'high';
  g.drawImage(s.canvas, (64 - w) / 2, (64 - h) / 2, w, h);
  return c.toDataURL();
}

function flipped(s) {
  const c = makeCanvas(s.canvas.width, s.canvas.height), g = c.getContext('2d');
  g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(s.canvas, 0, 0);
  return { canvas: c, w: s.w, h: s.h, ax: s.w - s.ax, ay: s.ay };
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
  // Одна оборвавшаяся картинка раньше роняла всю загрузку (Promise.all) — и игра оставалась
  // с графикой из кода. Теперь каждая грузится с повторами, а не загрузившиеся собираются в failed.
  const failed = [];
  const sprites = Promise.all(list.map(async ([name, m]) => {
    try {
      const img = await loadImageRetry(BASE + name + '.webp?v=' + V);
      A[name] = { canvas: img, w: m.w, h: m.h, ax: m.ax, ay: m.ay, name };
    } catch (e) { failed.push(name); }
    tick();
  }));
  // иконки интерфейса (ic_<имя>.webp) — тоже ждём, чтобы в интерфейсе не мелькали иконки из кода
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
    // file:// не даёт читать пиксели картинок — тогда без своих иконок
    try { floraIcons['sap_' + type] = floraIcons['own_' + type] = iconOf(s); } catch (e) { /* */ }
  }
  // вишня: цветёт, пока плоды отрастают, а созревшая — с ягодами (картинки художника наоборот)
  if (A.tree_blossom_bare && obj.cherry && obj.cherry[0] && flora.cherry) {
    const bloom = obj.cherry[0];
    obj.cherry = [A.tree_blossom_bare]; flora.cherry.bare = bloom;
  }
  try { if (A.tile_sand) floraIcons.path = iconOf(A.tile_sand); } catch (e) { /* */ }
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
    wildGrass, fog, obj, crops, icons, flora, floraIcons,
    sprouts: { tree: A.sprout_tree, bush: A.sprout_bush }, // ростки посаженных растений
    // спрайт дерева → его пень (у дуба иногда мшистый)
    stumpOf: (tree, id) => {
      const k = tree && tree.name && tree.name.replace('tree_', '').replace(/_bare$/, '');
      if (!k) return null;
      return (k === 'oak' && id % 3 === 0 && A.stump_moss) || A['stump_' + k] || null;
    },
    house: [null, A.house_1, A.house_2, A.house_3, A.house_4, A.house_5],
    well: [A.well_broken, A.well_fixed],
    // варианты травы 0,1 — простая (55% и 25%), 2,3 — с цветами (по 10%)
    grass: [A.tile_grass, flipped(A.tile_grass), A.tile_flowers, flipped(A.tile_flowers)],
    path: [A.tile_sand, flipped(A.tile_sand)],
    // объёмные грядки: [сухая, политая]; рисуются поверх травы
    bed: [A.bed_dry, A.bed_wet],
    // вода: бесшовная текстура на весь пруд, берег рисуется кодом (shore.js)
    waterTex: A.tex_water,
    // украшения пруда (World.genDecor): у берега и на воде
    decor: { cattail: A.pond_cattail, reeds: A.pond_reeds, rocks: A.pond_rocks, lily: A.pond_lily, leaves: A.pond_leaves },
  };
}
