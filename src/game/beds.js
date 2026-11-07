// Правила грядок: чистые функции над грядкой { crop, p — секунд роста, w — сколько раз полита }.
// Без звуков, картинок и Date.now — их же потом сможет выполнять сервер.

import { CROPS } from './data.js';

// Состояние посадки: стадия 0–3 | готово << 2 | нужен полив << 3 (без создания объекта — для каждого кадра)
export function cropFlags(b) {
  const total = CROPS[b.crop].time, ready = b.p >= total;
  const stage = ready ? 3 : Math.min(2, Math.floor((b.p / total) * 3));
  const needsWater = !ready && (b.w === 0 || (b.w === 1 && b.p >= total * 2 / 3));
  return stage | (ready ? 4 : 0) | (needsWater ? 8 : 0);
}

export function cropInfo(b) {
  const c = CROPS[b.crop], total = c.time, fl = cropFlags(b);
  return { c, total, ready: !!(fl & 4), stage: fl & 3, needsWater: !!(fl & 8), left: Math.max(0, total - b.p) };
}
