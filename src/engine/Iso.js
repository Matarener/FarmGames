// Изометрическая проекция 2:1. Мировые единицы: тайл = 64×32.
export const TILE_W = 64;
export const TILE_H = 32;
export const HW = TILE_W / 2;
export const HH = TILE_H / 2;

// Координаты сетки (могут быть дробными) → мировые (пиксели до камеры).
export function toWorld(gx, gy, out) {
  out.x = (gx - gy) * HW;
  out.y = (gx + gy) * HH;
  return out;
}

export function toGrid(wx, wy, out) {
  out.x = (wx / HW + wy / HH) / 2;
  out.y = (wy / HH - wx / HW) / 2;
  return out;
}
