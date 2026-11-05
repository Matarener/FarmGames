// Графика художника: спрайты из assets/sprites (нарезаны tools/slice_sprites.py).
// Для каждого задан размер в мире (ширина w) и точка опоры (ax, ay — доли
// ширины/высоты; точка опоры ставится в центр клетки объекта).
// Если файл не загрузился, игра использует процедурную графику из art.js.

import { loadImage } from '../engine/Sprite.js';

export const SPRITE_DIR = 'assets/sprites/';
// В сборке __ASSET_V__ — хеш всех спрайтов: новые картинки не застревают в кэше браузера
const EXT = '.webp' + (typeof __ASSET_V__ !== 'undefined' ? '?v=' + __ASSET_V__ : '');

export const DEFS = {
  tree_oak: { w: 86, ay: 0.93 }, tree_oak2: { w: 84, ay: 0.93 }, tree_apple: { w: 88, ay: 0.93 }, tree_pine: { w: 64, ay: 0.96 },
  stump: { w: 40, ay: 0.8 }, stump2: { w: 38, ay: 0.8 },
  rock_small: { w: 42, ay: 0.78 }, rock_small2: { w: 44, ay: 0.78 }, rock_big: { w: 112, ay: 0.74 },
  bush: { w: 44, ay: 0.86 }, bush_yellow: { w: 36, ay: 0.86 },
  house: { w: 156, ay: 0.74, ax: 0.5 }, shed: { w: 134, ay: 0.73 },
  well: { w: 56, ay: 0.86 },
  mailbox: { w: 22, ay: 0.92 }, barrel: { w: 24, ay: 0.88 }, lantern: { w: 16, ay: 0.95 },
  planter_white: { w: 30, ay: 0.9 }, pot_tulips: { w: 24, ay: 0.9 }, signpost: { w: 26, ay: 0.95 },
  haystack: { w: 48, ay: 0.85 }, sack: { w: 22, ay: 0.9 }, bench: { w: 40, ay: 0.8 },
  flowers_white: { w: 30, ay: 0.8 }, flowers_pink: { w: 24, ay: 0.8 }, flowers_purple: { w: 22, ay: 0.8 }, flowers_yellow: { w: 20, ay: 0.8 },
  grass_tuft: { w: 14, ay: 0.85 }, grass_tall: { w: 22, ay: 0.85 }, grass_reed: { w: 18, ay: 0.85 },
  sprout_1: { w: 16, ay: 0.7 }, sprout_3: { w: 22, ay: 0.7 },
  crop_wheat: { w: 24 }, crop_corn: { w: 22 }, crop_tomato: { w: 20 }, crop_carrot: { w: 16 }, crop_beet: { w: 20 },
  crop_cabbage: { w: 26 }, crop_pumpkin: { w: 30 }, crop_strawberry: { w: 22 }, crop_sunflower: { w: 26 }, crop_cotton: { w: 22 },
  boy_side: { w: 24 }, boy_back: { w: 24 },
  tex_soil: { w: 64 }, tex_water: { w: 64 }, tex_sand: { w: 64 }, tex_stone: { w: 64 },
};

// Значки интерфейса, которые берём из листа (остальные — процедурные)
export const ICON_FILES = {
  wood: 'res_wood', stone: 'res_stone', seed: 'res_seeds', bag: 'sack',
  carrot: 'item_carrot', corn: 'item_corn', tomato: 'item_tomato', strawberry: 'item_strawberry',
  wheat: 'crop_wheat', beet: 'crop_beet', cabbage: 'crop_cabbage', sunflower: 'crop_sunflower',
  pumpkin: 'crop_pumpkin', cotton: 'crop_cotton2',
};

export async function loadArt(onProgress) {
  const names = Object.keys(DEFS);
  const out = {};
  let done = 0;
  await Promise.all(names.map(async (n) => {
    try {
      const img = await loadImage(SPRITE_DIR + n + EXT);
      if (img.decode) await img.decode().catch(() => {});
      const d = DEFS[n];
      const w = d.w, h = w * img.naturalHeight / img.naturalWidth;
      out[n] = { canvas: img, img, w, h, ax: w * (d.ax ?? 0.5), ay: h * (d.ay ?? 0.9) };
    } catch (e) { /* нет файла — останется процедурная графика */ }
    onProgress && onProgress(++done / names.length);
  }));
  return out;
}

export function iconURL(key) { return ICON_FILES[key] ? SPRITE_DIR + ICON_FILES[key] + EXT : null; }

// Вырезать часть картинки (доли от размера) в отдельный канвас. flip — отразить.
export function cropImage(img, fx0, fy0, fx1, fy1, flip) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const sx = Math.round(fx0 * W), sy = Math.round(fy0 * H), sw = Math.round((fx1 - fx0) * W), sh = Math.round((fy1 - fy0) * H);
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const g = c.getContext('2d');
  if (flip) { g.translate(sw, 0); g.scale(-1, 1); }
  g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}
