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

// Временная картинка «плоды собраны»: цвета плодов/цветов (диапазон оттенка) перекрашиваются в зелень листвы.
// Когда художник нарисует варианты без плодов, они заменят это.
// white — перекрашивать и белые лепестки
const BARE = {
  apple: { h: [[345, 15]] }, cherry: { h: [[300, 360], [0, 15]], white: true }, sakura: { h: [[300, 350]] }, blueberry: { h: [[215, 255]] },
  raspberry: { h: [[330, 360], [0, 12]] }, rosehip: { h: [[300, 350]] }, hydrangea: { h: [[200, 250]] }, lavender: { h: [[255, 300]] }, rose: { h: [[320, 360], [0, 10]] },
};
function bare(s, { h: ranges, white: wh }) {
  const c = makeCanvas(s.canvas.width, s.canvas.height), g = c.getContext('2d');
  g.drawImage(s.canvas, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 20) continue;
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), dl = mx - mn, sat = mx ? dl / mx : 0;
    let h = 0;
    if (dl) h = mx === r ? 60 * (((gg - b) / dl) % 6) : mx === gg ? 60 * ((b - r) / dl + 2) : 60 * ((r - gg) / dl + 4);
    if (h < 0) h += 360;
    // белые лепестки (у вишни) — по низкой насыщенности и яркости
    const white = wh && sat < 0.22 && mx > 0.8;
    if (!white && (sat < 0.35 || mx < 0.3 || !ranges.some(([a, z]) => a <= z ? h >= a && h <= z : h >= a || h <= z))) continue;
    const L = Math.min(1, 0.25 + mx * 0.55); // зелень той же светлоты
    d[i] = 70 * L; d[i + 1] = 170 * L; d[i + 2] = 55 * L;
  }
  g.putImageData(im, 0, 0);
  return { canvas: c, w: s.w, h: s.h, ax: s.ax, ay: s.ay, name: s.name + '_bare' };
}

// Уменьшенная копия (молодое растение) — своя картинка, чтобы видеокарта не тянула большую
function scaled(s, k) {
  const c = makeCanvas(Math.max(1, Math.round(s.canvas.width * k)), Math.max(1, Math.round(s.canvas.height * k))), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(s.canvas, 0, 0, c.width, c.height);
  return { canvas: c, w: s.w * k, h: s.h * k, ax: s.ax * k, ay: s.ay * k, name: s.name + '_young' };
}

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

function tinted(s, color) {
  const c = makeCanvas(s.canvas.width, s.canvas.height), g = c.getContext('2d');
  g.drawImage(s.canvas, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return { canvas: c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
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
  // растения: без плодов, молодое; иконки саженцев
  const flora = {}, floraIcons = {};
  for (const type of Object.keys(OBJ)) {
    const s = obj[type] && obj[type][0];
    if (!s || !/^(tree|bush)_/.test(s.name)) continue;
    // молодое: картинка художника (<имя>_young), иначе уменьшенная копия взрослого
    flora[type] = { bare: s, young: A[s.name + '_young'] || scaled(s, 0.6) };
    // file:// не даёт читать пиксели — тогда без перекраски и своих иконок
    // картинка художника «без плодов» (<имя>_bare), иначе — временная перекраска
    if (A[s.name + '_bare']) flora[type].bare = A[s.name + '_bare'];
    try { if (BARE[type] && !A[s.name + '_bare']) flora[type].bare = bare(s, BARE[type]); floraIcons['sap_' + type] = floraIcons['own_' + type] = iconOf(s); } catch (e) { /* */ }
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
  // дикая высокая трава: grass_tall_0, grass_tall_1, ... (когда художник нарисует)
  const wildGrass = Object.keys(A).filter((n) => /^grass_tall_\d+$/.test(n)).sort().map((n) => A[n]);
  return {
    wildGrass, fog, obj, crops, icons, flora, floraIcons, failed,
    sprouts: { tree: A.sprout_tree || null, bush: A.sprout_bush || null },
    // спрайт дерева → его пень (у дуба иногда мшистый)
    stumpOf: (tree, id) => {
      const k = tree && tree.name && tree.name.replace('tree_', '');
      if (!k) return null;
      return (k === 'oak' && id % 3 === 0 && A.stump_moss) || A['stump_' + k] || null;
    },
    house: [null, A.house_1, A.house_2, A.house_3, A.house_4, A.house_5],
    well: [A.well_broken, A.well_fixed],
    water: [A.water_0, A.water_spark, A.water_lily, A.water_reed],
    // варианты травы 0,1 — простая (55% и 25%), 2,3 — с цветами (по 10%)
    grass: [A.tile_grass, flipped(A.tile_grass), A.tile_flowers, flipped(A.tile_flowers)],
    path: [A.tile_sand, flipped(A.tile_sand)],
    // объёмные грядки: [сухая, политая] без каймы и с травяной каймой
    bed: A.bed_dry && { plain: [A.bed_dry, A.bed_wet], grass: [A.bed_dry_g, A.bed_wet_g] },
    waterTex: A.tex_water || null,
    // украшения пруда (World.genDecor): у берега и на воде
    decor: { cattail: A.pond_cattail, reeds: A.pond_reeds, rocks: A.pond_rocks, lily: A.pond_lily, leaves: A.pond_leaves },
    soil: [A.tile_soil, A.tile_soil_wet || tinted(A.tile_soil, 'rgba(40,20,10,0.32)')],
  };
}
