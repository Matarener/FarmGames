// Берег пруда. Сама вода — общая текстура художника (tex_water), её кладёт PixiScene по
// координатам карты. Поверх неё у клеток рядом с сушей кодом рисуется берег: светлое мелководье,
// у дальних краёв земляная стенка с тенью, у ближних пена, и неровный травяной край.

import { makeSprite, mulberry32 } from '../engine/Sprite.js';
import { HW, HH } from '../engine/Iso.js';

// Спрайт берега для одной клетки воды (размер клетки, опора — центр ромба).
// mask — с каких сторон суша: 1 — (x, y-1) задний правый край, 2 — (x+1, y) передний правый,
//        4 — (x, y+1) передний левый, 8 — (x-1, y) задний левый.
// dg   — суша только по диагонали (угол клетки): 1 — верхний, 2 — правый, 4 — нижний, 8 — левый.
// grass — цвет травы (средний цвет плитки травы художника), им рисуется край.
export function shoreTile(mask, dg, grass) {
  const rnd = mulberry32(500 + mask * 3); // форма волн своя у каждого вида берега, но одна и та же при каждом запуске
  const T = [0, -HH], R = [HW, 0], B = [0, HH], L = [-HW, 0];
  const GRASS = grass || '#78c04c';
  return makeSprite(HW * 2 + 2, HH * 2 + 2, HW + 1, HH + 1, (g) => {
    // Точка на ребре a→b со сдвигом внутрь клетки на d. Внутрь сдвигаемся вдоль соседнего ребра
    // (по сетке, а не к центру): у клеток одного берега направление одинаковое, и полосы на стыках совпадают.
    const inward = (a, b) => { const n = b === R ? B : b === B ? L : b === L ? T : R; return [(n[0] - b[0]) / 2, (n[1] - b[1]) / 2]; };
    const at = (a, b, t, d) => { const v = inward(a, b), x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; return [x + v[0] * d, y + v[1] * d]; };
    // волна гасится на концах ребра, поэтому соседние клетки одного берега стыкуются без ступенек
    const wave = (n, amp, ph) => (t) => amp * Math.sin(Math.PI * t * n + ph * Math.sin(Math.PI * t));
    // полоса вдоль ребра a→b: от самого ребра до линии d0 + f(t)
    const band = (a, b, d0, f) => {
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      for (let k = 20; k >= 0; k--) { const t = k / 20; const [x, y] = at(a, b, t, d0 + f(t)); g.lineTo(x, y); }
      g.closePath();
    };
    const edge = (a, b, front) => {
      const r1 = rnd(), r2 = rnd();
      const lip = wave(3 + ((r1 * 2) | 0), 0.035, r2 * 2);
      // мелководье: светлая полоса, плавно уходящая в глубину
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const gr = g.createLinearGradient(mid[0], mid[1], mid[0] * 0.45, mid[1] * 0.45);
      gr.addColorStop(0, 'rgba(170,230,225,0.42)'); gr.addColorStop(1, 'rgba(170,230,225,0)');
      // к концам ребра полоса сужается до нуля — на стыке с соседней клеткой нет ступеньки
      g.fillStyle = gr; band(a, b, 0, (t) => 0.5 * Math.pow(Math.sin(Math.PI * t), 0.6)); g.fill();
      if (!front) {
        // дальний берег: видна земляная стенка и тень от неё на воде
        g.fillStyle = 'rgba(10,35,60,0.24)'; band(a, b, 0.2, (t) => 0.1 * Math.pow(Math.sin(Math.PI * t), 0.5) + wave(2, 0.02, r1)(t)); g.fill();
        g.fillStyle = '#7a5634'; band(a, b, 0.2, lip); g.fill();
        g.fillStyle = '#5e4128'; band(a, b, 0.2, (t) => lip(t) * 0.6); g.globalAlpha = 0.5;
        g.fill(); g.globalAlpha = 1;
      } else {
        // ближний берег: пена у кромки
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.1; g.beginPath();
        for (let k = 0; k <= 20; k++) { const t = k / 20; const [x, y] = at(a, b, t, 0.17 + lip(t) * 1.2); k ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      // травяной край с неровной кромкой поверх
      g.fillStyle = GRASS; band(a, b, front ? 0.12 : 0.09, lip); g.fill();
      g.fillStyle = 'rgba(30,70,20,0.35)'; band(a, b, front ? 0.12 : 0.09, (t) => lip(t) - 0.02); g.globalAlpha = 0.6; g.fill(); g.globalAlpha = 1;
      g.fillStyle = GRASS; band(a, b, front ? 0.1 : 0.07, lip); g.fill();
    };
    // суша по диагонали: травяной уголок, чтобы на внутренних углах не было ступеньки
    const corner = (p, a, b) => {
      const k = 0.12, ax = p[0] + (a[0] - p[0]) * k, ay = p[1] + (a[1] - p[1]) * k, bx = p[0] + (b[0] - p[0]) * k, by = p[1] + (b[1] - p[1]) * k;
      g.fillStyle = GRASS;
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(ax, ay); g.quadraticCurveTo(p[0] * 0.93, p[1] * 0.93, bx, by); g.closePath(); g.fill();
    };
    if (dg & 1) corner(T, L, R);
    if (dg & 2) corner(R, T, B);
    if (dg & 4) corner(B, R, L);
    if (dg & 8) corner(L, B, T);
    if (mask & 1) edge(T, R, false);
    if (mask & 8) edge(L, T, false);
    if (mask & 2) edge(R, B, true);
    if (mask & 4) edge(B, L, true);
  });
}
