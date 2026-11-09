// Правила грядок: чистые функции над грядкой { crop, p — секунд роста, w — сколько раз полита }.
// Без звуков, картинок и Date.now — их же потом сможет выполнять сервер.

import { CROPS } from './data.js';

// Культуру поливают дважды: после первого полива она растёт до 2/3, после второго — до конца.
const limitOf = (b, total) => (b.w >= 2 ? total : b.w >= 1 ? total * 2 / 3 : 0);

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

// Рост грядки за dt секунд: без полива культура доходит только до своей границы и ждёт.
// auto — грядку поливает поливалка (sprinklers.js): как только грядка просит воды, она поливается
// сама и растёт дальше в тот же промежуток (так и за время отсутствия урожай дорастает до конца).
// → сколько раз грядку полила поливалка
export function growBed(b, dt, auto) {
  if (!b.crop || !CROPS[b.crop]) return 0;
  const total = CROPS[b.crop].time;
  let n = 0;
  for (let k = 0; k < 4; k++) {
    if (auto && (cropFlags(b) & 8)) { b.w++; n++; }
    const limit = limitOf(b, total);
    if (b.p >= limit || !(dt > 0)) break;
    const step = Math.min(dt, limit - b.p);
    b.p += step; dt -= step;
  }
  return n;
}
