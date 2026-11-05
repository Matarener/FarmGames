// Спрайты художника (assets/art, нарезаны tools/slice_art.py). Загружаются после старта:
// пока картинки грузятся, видна графика, нарисованная кодом.

import { loadImage, makeCanvas } from '../engine/Sprite.js';

/* global __ASSET_V__ */
const V = typeof __ASSET_V__ !== 'undefined' ? __ASSET_V__ : String(Date.now());
const BASE = 'assets/art/';

// Какие картинки у каких объектов (вариант выбирается по id объекта)
const OBJ = {
  oak: ['tree_oak', 'tree_birch'],
  oak2: ['tree_sakura', 'tree_blossom', 'tree_autumn'],
  apple: ['tree_apple'],
  pine: ['tree_pine'],
  rock: ['rock_mid', 'rock_small'],
  boulder: ['rock_big', 'rock_moss'],
  bush: ['bush_pink', 'bush_hydra', 'bush_lav', 'bush_rose'],
  berry: ['bush_blue', 'bush_rasp'],
  stump: ['stump_oak', 'stump_birch', 'stump_pine', 'stump_moss'],
};

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
  const man = await (await fetch(BASE + 'manifest.json?v=' + V)).json();
  const A = {};
  const list = Object.entries(man);
  let done = 0;
  await Promise.all(list.map(async ([name, m]) => {
    const img = await loadImage(BASE + name + '.webp?v=' + V);
    onProgress && onProgress(++done / list.length);
    A[name] = { canvas: img, w: m.w, h: m.h, ax: m.ax, ay: m.ay };
  }));
  const obj = {};
  for (const [type, names] of Object.entries(OBJ)) obj[type] = names.map((n) => A[n]).filter(Boolean);
  const crops = {};
  for (const name of Object.keys(A)) {
    const m = /^crop_(\w+)_(\d)$/.exec(name);
    if (m) (crops[m[1]] = crops[m[1]] || [])[+m[2]] = A[name];
  }
  return {
    obj, crops,
    house: [null, A.house_1, A.house_2, A.house_3, A.house_4, A.house_5],
    water: [A.water_0, A.water_spark, A.water_lily, A.water_reed],
    // варианты травы 0,1 — простая (55% и 25%), 2,3 — с цветами (по 10%)
    grass: [A.tile_grass, flipped(A.tile_grass), A.tile_flowers, flipped(A.tile_flowers)],
    path: [A.tile_sand, flipped(A.tile_sand)],
    soil: [A.tile_soil, A.tile_soil_wet || tinted(A.tile_soil, 'rgba(40,20,10,0.32)')],
  };
}
