// Полоски времени роста над грядками, ростками и растениями без плодов: настройки и расчёт
// высоты над картинкой. Сами полоски считает Farm.syncBars, рисует PixiScene.syncBars.
import { makeCanvas } from '../engine/Sprite.js';

// Полоски времени роста: вид → цвет заливки (грядка, плоды, росток)
export const BAR_KIND = { crop: 0, fruit: 1, grow: 2 };
export const BAR_COLORS = [0x8fd14f, 0xff9a3c, 0x5fc7e8];
export const BAR_W = 26, BAR_H = 5;
// Полоски видны только при достаточном приближении (дальше они мелкие и только рябят)
export const BAR_MIN_ZOOM = 0.7;

// Высота над точкой опоры, где у картинки кончаются непрозрачные пиксели (+ отступ), кэш на картинку
const barTops = new WeakMap();
let barScratch = null;
export function barTop(s) {
  if (!s) return 30;
  let t = barTops.get(s.canvas);
  if (t !== undefined) return t;
  t = s.ay * 0.8;
  try {
    const img = s.canvas, w = img.width, h = img.height;
    if (!barScratch) barScratch = makeCanvas(1, 1);
    if (barScratch.width < w || barScratch.height < h) { barScratch.width = Math.max(barScratch.width, w); barScratch.height = Math.max(barScratch.height, h); }
    const g = barScratch.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let y0 = -1;
    for (let y = 0; y < h && y0 < 0; y++) for (let x = 0, r = y * w * 4; x < w; x++) if (d[r + x * 4 + 3] > 40) { y0 = y; break; }
    if (y0 >= 0) t = (s.ay - y0 * s.h / h) + 5;
  } catch { /* картинка недоступна для чтения — берём оценку */ }
  barTops.set(s.canvas, t);
  return t;
}
