// Фермер покадрово: 4 направления × 8 кадров ходьбы (assets/farmer/walk_*.png,
// нарезано tools/cut_farmer.py). Кадры — ячейки одинаковой ширины в полосе.
// dr — вниз-вправо, dl — вниз-влево, ur — вверх-вправо, ul — вверх-влево.

const DIRS = ['dr', 'dl', 'ur', 'ul'];
export const FRAMES = 8;
export const HEIGHT = 40;
// кадр, где ноги ближе всего друг к другу, — поза стоя
export const IDLE = { dr: 0, dl: 0, ur: 4, ul: 5 };          // высота ячейки в единицах мира
const FOOT = 9;                    // от низа ячейки до точки, где стопы касаются земли (px листа)
const V = typeof __ASSET_V__ !== 'undefined' ? '?v=' + __ASSET_V__ : '';

export const farmerSheets = {};
let ready = 0;
for (const d of DIRS) {
  const img = new Image();
  img.onload = () => { farmerSheets[d] = img; ready++; };
  img.src = 'assets/farmer/walk_' + d + '.png' + V;
}
export const farmerReady = () => ready === DIRS.length;

// Нарисовать кадр так, чтобы стопы стояли в точке (x, y) мира
export function drawFarmerFrame(ctx, dir, frame, x, y, sx = 1, sy = 1) {
  const img = farmerSheets[dir];
  const fw = img.naturalWidth / FRAMES, fh = img.naturalHeight;
  const k = HEIGHT / fh;
  const w = fw * k, h = fh * k;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.drawImage(img, (frame % FRAMES) * fw, 0, fw, fh, -w / 2, -h + FOOT * k, w, h);
  ctx.restore();
}
