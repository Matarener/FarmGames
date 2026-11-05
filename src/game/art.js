// Временная процедурная графика в стиле концепта (уютная ферма, мягкие контуры).
// Все спрайты имеют тот же формат, что и будущие PNG от художника,
// поэтому замена — это просто загрузка картинок вместо вызовов make*.

import { makeSprite, makeCanvas, mulberry32 } from '../engine/Sprite.js';
import { HW, HH } from '../engine/Iso.js';

const OUT = '#3d2b1f';

function diamond(g, hw, hh, cx = 0, cy = 0) {
  g.beginPath();
  g.moveTo(cx, cy - hh); g.lineTo(cx + hw, cy); g.lineTo(cx, cy + hh); g.lineTo(cx - hw, cy);
  g.closePath();
}

function blob(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
function shadow(g, rx, ry, a = 0.2) { g.fillStyle = `rgba(20,40,10,${a})`; ell(g, 0, 0, rx, ry); g.fill(); }
// случайная точка внутри ромба тайла (k — отступ от края)
function inTile(rnd, k = 0.85) {
  const u = rnd() - 0.5, v = rnd() - 0.5;
  return [(u - v) * HW * 2 * k, (u + v) * HH * 2 * k];
}

// ---------------- Тайлы земли ----------------

const GRASS = [['#7cc44f', '#8fd35c', '#69b043'], ['#78c04c', '#90d45f', '#64aa40'], ['#80c853', '#9ad866', '#6cb246'], ['#74bb49', '#88cd58', '#61a63d']];

export function grassTile(variant) {
  const [base, light, dark] = GRASS[variant % 4];
  const rnd = mulberry32(100 + variant);
  return makeSprite(HW * 2 + 2, HH * 2 + 2, HW + 1, HH + 1, (g) => {
    g.fillStyle = base; diamond(g, HW + 0.7, HH + 0.35); g.fill();
    for (let i = 0; i < 14; i++) {
      const [x, y] = inTile(rnd);
      g.strokeStyle = rnd() < 0.5 ? light : dark; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1 + rnd() * 2, y - 2 - rnd() * 2); g.stroke();
    }
    if (variant === 2) {
      for (let i = 0; i < 3; i++) {
        const [x, y] = inTile(rnd, 0.7);
        g.fillStyle = ['#fff6d5', '#ffd1e3', '#ffe066'][i]; blob(g, x, y, 1.3);
        g.fillStyle = '#f4b73a'; blob(g, x, y, 0.5);
      }
    }
  });
}

export function pathTile(variant) {
  const rnd = mulberry32(300 + variant);
  return makeSprite(HW * 2 + 2, HH * 2 + 2, HW + 1, HH + 1, (g) => {
    g.fillStyle = '#d8b878'; diamond(g, HW + 0.7, HH + 0.35); g.fill();
    g.fillStyle = '#e6c98d'; diamond(g, HW * 0.8, HH * 0.8); g.fill();
    for (let i = 0; i < 9; i++) {
      const [x, y] = inTile(rnd, 0.8);
      g.fillStyle = rnd() < 0.5 ? '#c49d5f' : '#efd7a4';
      ell(g, x, y, 1.4 + rnd(), 0.8 + rnd() * 0.5); g.fill();
    }
  });
}

export function soilTile(wet) {
  return makeSprite(HW * 2 + 2, HH * 2 + 2, HW + 1, HH + 1, (g) => {
    g.fillStyle = '#78c04c'; diamond(g, HW + 0.7, HH + 0.35); g.fill();
    g.fillStyle = wet ? '#5a3a1f' : '#8a5a30'; diamond(g, HW * 0.9, HH * 0.9, 0, 0.6); g.fill();
    g.fillStyle = wet ? '#6b4526' : '#a06a3a'; diamond(g, HW * 0.86, HH * 0.86); g.fill();
    // борозды вдоль одной оси
    g.lineWidth = 2.2;
    for (let k = -2; k <= 2; k++) {
      const v = k * 0.17;
      const x0 = (-0.4 - v) * HW * 2 * 0.86, y0 = (-0.4 + v) * HH * 2 * 0.86;
      const x1 = (0.4 - v) * HW * 2 * 0.86, y1 = (0.4 + v) * HH * 2 * 0.86;
      g.strokeStyle = wet ? '#4a2f18' : '#7a4c26';
      g.beginPath(); g.moveTo(x0, y0 + 0.8); g.lineTo(x1, y1 + 0.8); g.stroke();
      g.strokeStyle = wet ? '#7a5230' : '#b47c48'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x0, y0 - 0.6); g.lineTo(x1, y1 - 0.6); g.stroke();
      g.lineWidth = 2.2;
    }
    if (wet) {
      g.fillStyle = 'rgba(140,200,255,0.35)';
      ell(g, -8, 2, 3, 1.2); g.fill(); ell(g, 9, -3, 2.5, 1); g.fill();
    }
  });
}

// mask: биты соседей-суши: 1 — (x, y-1) задний правый край, 2 — (x+1, y) передний правый,
// 4 — (x, y+1) передний левый, 8 — (x-1, y) задний левый
export function waterTile(mask, lily, base) {
  const rnd = mulberry32(500 + mask * 3 + (lily ? 1 : 0));
  const T = [0, -HH], R = [HW, 0], B = [0, HH], L = [-HW, 0];
  return makeSprite(HW * 2 + 2, HH * 2 + 2, HW + 1, HH + 1, (g) => {
    if (base) g.drawImage(base.canvas, -base.ax, -base.ay, base.w, base.h); // вода художника, берег — кодом
    else {
      g.fillStyle = '#78c04c'; diamond(g, HW + 0.7, HH + 0.35); g.fill();
      g.fillStyle = '#3f97d6'; diamond(g, HW + 0.5, HH + 0.25); g.fill();
      g.fillStyle = '#56ade6'; diamond(g, HW * 0.75, HH * 0.75, 0, 1.5); g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.9;
    for (let i = 0; i < (base ? 0 : 4); i++) {
      const [x, y] = inTile(rnd, 0.6);
      g.beginPath(); g.moveTo(x - 3, y); g.quadraticCurveTo(x, y - 1.2, x + 3, y); g.stroke();
    }
    const edge = (a, b, front) => {
      // полоса берега вдоль ребра внутрь тайла
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      const ix = -cx * 0.22, iy = -cy * 0.22;
      g.fillStyle = front ? '#e9d39a' : '#7a5a3a';
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      g.lineTo(b[0] + ix, b[1] + iy); g.lineTo(a[0] + ix, a[1] + iy); g.closePath(); g.fill();
      g.strokeStyle = front ? 'rgba(255,255,255,0.8)' : 'rgba(30,60,90,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(a[0] + ix, a[1] + iy); g.lineTo(b[0] + ix, b[1] + iy); g.stroke();
      g.fillStyle = '#78c04c';
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      g.lineTo(b[0] + ix * 0.35, b[1] + iy * 0.35); g.lineTo(a[0] + ix * 0.35, a[1] + iy * 0.35); g.closePath(); g.fill();
    };
    if (mask & 1) edge(T, R, false);
    if (mask & 8) edge(L, T, false);
    if (mask & 2) edge(R, B, true);
    if (mask & 4) edge(B, L, true);
    if (lily && !base) {
      for (let i = 0; i < 2; i++) {
        const [x, y] = inTile(rnd, 0.45);
        g.fillStyle = '#3f9a3a'; ell(g, x, y, 4, 2.2); g.fill();
        g.fillStyle = '#5cbf4f'; ell(g, x - 0.5, y - 0.4, 3.2, 1.6); g.fill();
        if (i === 0) { g.fillStyle = '#ffb3cf'; blob(g, x + 1, y - 1, 1.2); }
      }
    }
  });
}

// ---------------- Природа ----------------

function foliage(g, blobs, dark, mid, light, spec) {
  g.fillStyle = OUT; for (const [x, y, r] of blobs) blob(g, x, y, r + 1.2);
  g.fillStyle = dark; for (const [x, y, r] of blobs) blob(g, x, y, r);
  g.fillStyle = mid; for (const [x, y, r] of blobs) blob(g, x - r * 0.18, y - r * 0.2, r * 0.82);
  g.fillStyle = light; for (const [x, y, r] of blobs) blob(g, x - r * 0.35, y - r * 0.4, r * 0.45);
  if (spec) { g.fillStyle = spec; for (const [x, y, r] of blobs) blob(g, x - r * 0.45, y - r * 0.55, r * 0.15); }
}

function trunk(g, h, w = 4.5) {
  g.fillStyle = OUT;
  g.beginPath(); g.moveTo(-w - 2.5, 1); g.lineTo(-w, -h); g.lineTo(w, -h); g.lineTo(w + 2.5, 1); g.closePath(); g.fill();
  g.fillStyle = '#9a6538';
  g.beginPath(); g.moveTo(-w - 1.5, 0); g.lineTo(-w + 1, -h); g.lineTo(w - 1, -h); g.lineTo(w + 1.5, 0); g.closePath(); g.fill();
  g.fillStyle = '#7a4b28';
  g.beginPath(); g.moveTo(1, 0); g.lineTo(1, -h); g.lineTo(w - 1, -h); g.lineTo(w + 1.5, 0); g.closePath(); g.fill();
}

export function treeSprite(kind) {
  if (kind === 'pine') {
    return makeSprite(60, 112, 30, 100, (g) => {
      shadow(g, 17, 7);
      trunk(g, 18, 3.5);
      const tiers = [[-20, 24, 30], [-42, 20, 26], [-62, 15, 22], [-80, 10, 18]];
      for (const [y, w, h] of tiers) {
        g.fillStyle = OUT;
        g.beginPath(); g.moveTo(0, y - h - 1.5); g.lineTo(w + 2, y + 1.5); g.lineTo(-w - 2, y + 1.5); g.closePath(); g.fill();
        g.fillStyle = '#2f7444';
        g.beginPath(); g.moveTo(0, y - h); g.lineTo(w, y); g.lineTo(-w, y); g.closePath(); g.fill();
        g.fillStyle = '#4b9a55';
        g.beginPath(); g.moveTo(0, y - h); g.lineTo(-w, y); g.lineTo(-w * 0.2, y - 1); g.closePath(); g.fill();
        g.fillStyle = '#6cbb64';
        g.beginPath(); g.moveTo(0, y - h); g.lineTo(-w * 0.55, y - h * 0.45); g.lineTo(-w * 0.25, y - h * 0.5); g.closePath(); g.fill();
      }
    });
  }
  const apple = kind === 'apple';
  const alt = kind === 'oak2';
  return makeSprite(80, 108, 40, 96, (g) => {
    shadow(g, 22, 9);
    trunk(g, 34);
    const blobs = alt
      ? [[0, -58, 22], [-17, -46, 15], [17, -48, 16], [-8, -76, 15], [12, -72, 15]]
      : [[0, -54, 23], [-18, -44, 15], [18, -43, 15], [-11, -70, 16], [12, -71, 16], [0, -82, 12]];
    foliage(g, blobs, alt ? '#3f8a2f' : '#367f2c', alt ? '#5aa83a' : '#4f9e36', alt ? '#7cc24b' : '#6dbd47', '#a4e070');
    if (apple) {
      const rnd = mulberry32(77);
      for (let i = 0; i < 9; i++) {
        const x = (rnd() - 0.5) * 50, y = -40 - rnd() * 40;
        g.fillStyle = OUT; blob(g, x, y, 3.4);
        g.fillStyle = '#e2392f'; blob(g, x, y, 2.7);
        g.fillStyle = '#ff8a73'; blob(g, x - 0.9, y - 0.9, 0.9);
      }
    }
  });
}

export function stumpSprite() {
  return makeSprite(34, 30, 17, 20, (g) => {
    shadow(g, 13, 5.5);
    g.fillStyle = OUT; ell(g, 0, -3, 10.5, 6.5); g.fill(); g.fillRect(-10.5, -10, 21, 7);
    ell(g, 0, -10, 10.5, 5.5); g.fill();
    g.fillStyle = '#8a5a30'; ell(g, 0, -3, 9.3, 5.3); g.fill(); g.fillRect(-9.3, -10, 18.6, 7);
    g.fillStyle = '#6c4222'; g.fillRect(1, -10, 8.3, 7); ell(g, 4.5, -3, 4.8, 3.6); g.fill();
    g.fillStyle = '#e4bd7c'; ell(g, 0, -10, 9.3, 4.6); g.fill();
    g.strokeStyle = '#b98b52'; g.lineWidth = 0.8;
    ell(g, 0, -10, 6, 2.8); g.stroke(); ell(g, 0, -10, 3, 1.4); g.stroke();
  });
}

export function bushSprite(berries) {
  return makeSprite(44, 36, 22, 26, (g) => {
    shadow(g, 15, 6);
    foliage(g, [[-7, -8, 8], [7, -8, 8], [0, -14, 9]], '#357d2e', '#4f9e36', '#71c24a');
    if (berries) {
      const pts = [[-8, -10], [6, -14], [2, -6], [9, -8], [-3, -16]];
      for (const [x, y] of pts) { g.fillStyle = OUT; blob(g, x, y, 2); g.fillStyle = '#d6336c'; blob(g, x, y, 1.5); }
    }
  });
}

function rockShape(g, pts, base, darkC, lightC) {
  g.fillStyle = OUT; g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  g.lineWidth = 2.4; g.strokeStyle = OUT; g.stroke(); g.fillStyle = base; g.fill();
  // затенение правого низа
  let cx = 0, cy = 0; for (const [x, y] of pts) { cx += x; cy += y; } cx /= pts.length; cy /= pts.length;
  g.save(); g.clip();
  g.fillStyle = darkC; g.beginPath(); g.moveTo(cx - 30, cy + 30); g.lineTo(cx + 40, cy - 12); g.lineTo(cx + 40, cy + 40); g.closePath(); g.fill();
  g.fillStyle = lightC; ell(g, cx - 4, cy - 5, 6, 3); g.fill();
  g.restore();
}

export function rockSprite(big) {
  if (!big) {
    return makeSprite(40, 32, 20, 22, (g) => {
      shadow(g, 15, 6);
      rockShape(g, [[-12, 0], [-13, -7], [-7, -14], [3, -15], [11, -10], [13, -2], [7, 2], [-5, 2]], '#a3a9ae', '#7b8288', '#d3d8dc');
    });
  }
  return makeSprite(120, 88, 60, 56, (g) => {
    shadow(g, 46, 20);
    rockShape(g, [[-40, -6], [-42, -22], [-30, -38], [-12, -42], [0, -30], [-4, -8], [-20, 2]], '#9aa1a7', '#737a80', '#cfd4d8');
    rockShape(g, [[-10, 2], [-16, -22], [-4, -46], [18, -52], [36, -38], [40, -16], [30, 2], [8, 8]], '#a6acb1', '#7b8288', '#d8dde0');
    rockShape(g, [[18, 10], [14, -6], [26, -14], [42, -10], [46, 2], [36, 12]], '#959ca2', '#6d747a', '#c8cdd1');
    // прожилки руды
    g.fillStyle = '#c98a4b'; blob(g, 10, -30, 2); blob(g, 16, -24, 1.4); blob(g, -26, -24, 1.6);
  });
}

// ---------------- Дом ----------------

export function houseSprite(level) {
  const H = level >= 4 ? 50 : level >= 2 ? 44 : 36;
  const R = level >= 2 ? 32 : 28;
  const wood = level < 2;
  return makeSprite(156, 176, 78, 128, (g) => {
    const T = [0, -32], Rr = [64, 0], B = [0, 32], L = [-64, 0];
    const up = (p, h) => [p[0], p[1] - h];
    const poly = (pts, fill, stroke = true) => {
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fillStyle = fill; g.fill();
      if (stroke) { g.strokeStyle = OUT; g.lineWidth = 1.6; g.stroke(); }
    };
    // фундамент и тень
    g.fillStyle = 'rgba(20,40,10,0.22)'; diamond(g, 74, 37, 4, 4); g.fill();
    poly([L, B, Rr, up(Rr, 4), up(B, 4), up(L, 4)], '#8d8d86');
    const wallL = wood ? '#c98d55' : '#f4e6c8', wallR = wood ? '#a8703f' : '#dccaa6';
    // стены
    poly([up(B, 4), up(Rr, 4), up(Rr, H), up(B, H)], wallR);
    poly([up(L, 4), up(B, 4), up(B, H), up(L, H)], wallL);
    if (wood) {
      g.strokeStyle = 'rgba(60,35,20,0.45)'; g.lineWidth = 0.8;
      for (let k = 10; k < H; k += 6) {
        g.beginPath(); g.moveTo(L[0], L[1] - k); g.lineTo(B[0], B[1] - k); g.lineTo(Rr[0], Rr[1] - k); g.stroke();
      }
    } else {
      // фахверк
      g.strokeStyle = '#7a4b2a'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(B[0], B[1] - 4); g.lineTo(B[0], B[1] - H); g.stroke();
      g.beginPath(); g.moveTo(L[0], L[1] - H * 0.55); g.lineTo(B[0], B[1] - H * 0.55); g.lineTo(Rr[0], Rr[1] - H * 0.55); g.stroke();
    }
    // дверь на левой стене
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d0 = lerp(L, B, 0.56), d1 = lerp(L, B, 0.78);
    poly([up(d0, 4), up(d1, 4), up(d1, 26), up(d0, 26)], '#8a4f2a');
    g.fillStyle = '#f2c14e'; blob(g, d1[0] - 2.5, d1[1] - 15, 1.1);
    // окна
    const win = (a, b, t0, t1, y0, y1, side) => {
      const p0 = lerp(a, b, t0), p1 = lerp(a, b, t1);
      poly([up(p0, y0), up(p1, y0), up(p1, y1), up(p0, y1)], '#9fd8f5');
      g.strokeStyle = '#ffffff'; g.lineWidth = 1;
      const m0 = lerp(up(p0, y0), up(p1, y0), 0.5), m1 = lerp(up(p0, y1), up(p1, y1), 0.5);
      g.beginPath(); g.moveTo(m0[0], m0[1]); g.lineTo(m1[0], m1[1]); g.stroke();
      if (!wood) {
        // ставни
        const s = side < 0 ? '#3b6fc4' : '#2f5ca8';
        const q0 = lerp(a, b, t0 - 0.07), q1 = lerp(a, b, t1 + 0.07);
        poly([up(q0, y0), up(p0, y0), up(p0, y1), up(q0, y1)], s);
        poly([up(p1, y0), up(q1, y0), up(q1, y1), up(p1, y1)], s);
      }
      if (level >= 3) {
        const f0 = lerp(a, b, t0 - 0.03), f1 = lerp(a, b, t1 + 0.03);
        poly([up(f0, y0 - 1), up(f1, y0 - 1), up(f1, y0 - 5), up(f0, y0 - 5)], '#9a6538');
        g.fillStyle = '#ff7aa8'; const c = lerp(up(f0, y0 - 6), up(f1, y0 - 6), 0.3); blob(g, c[0], c[1], 1.8);
        g.fillStyle = '#ffd34d'; const c2 = lerp(up(f0, y0 - 6), up(f1, y0 - 6), 0.7); blob(g, c2[0], c2[1], 1.8);
      }
    };
    win(L, B, 0.16, 0.38, 14, 28, -1);
    win(B, Rr, 0.3, 0.6, 14, 28, 1);
    if (level >= 4) { win(L, B, 0.2, 0.36, 34, 44, -1); win(B, Rr, 0.36, 0.56, 34, 44, 1); }
    // крыша: конёк от середины заднего-левого ребра к середине переднего-правого
    const e = 6; // свес
    const TL = up(lerp(T, L, 0.5), H), FR = up(lerp(Rr, B, 0.5), H);
    const ridgeA = [TL[0], TL[1] - R], ridgeB = [FR[0], FR[1] - R];
    const roofMain = wood ? '#b9873e' : '#d8573a', roofDark = wood ? '#946a2c' : '#a94029', roofLight = wood ? '#d9a95a' : '#ef7b52';
    // фронтон на правой стене
    poly([up(B, H), up(Rr, H), ridgeB], wallR);
    if (!wood) { g.fillStyle = '#9fd8f5'; blob(g, ridgeB[0], ridgeB[1] + R * 0.55, 3); g.strokeStyle = OUT; g.lineWidth = 1; g.stroke(); }
    // задний скат
    poly([up([T[0], T[1] - e * 0.5], H), up([Rr[0] + e, Rr[1] - e * 0.5], H), [ridgeB[0] + e, ridgeB[1]], ridgeA], roofDark);
    // труба
    if (level >= 2) {
      const cx = TL[0] + 20, cy = TL[1] - R * 0.55;
      poly([[cx - 5, cy + 4], [cx + 5, cy + 4], [cx + 5, cy - 16], [cx - 5, cy - 16]], '#b5573a');
      poly([[cx - 6.5, cy - 15], [cx + 6.5, cy - 15], [cx + 6.5, cy - 19], [cx - 6.5, cy - 19]], '#8e8e8e');
    }
    // передний скат
    poly([up([L[0] - e, L[1] + e * 0.2], H), up([B[0], B[1] + e * 0.8], H), [ridgeB[0], ridgeB[1] + 1], [ridgeA[0] - e, ridgeA[1]]], roofMain);
    // черепица
    g.strokeStyle = roofDark; g.lineWidth = 1;
    for (let t = 0.2; t < 1; t += 0.2) {
      const a = lerp(up([L[0] - e, L[1] + e * 0.2], H), [ridgeA[0] - e, ridgeA[1]], t);
      const b = lerp(up([B[0], B[1] + e * 0.8], H), [ridgeB[0], ridgeB[1] + 1], t);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    g.strokeStyle = roofLight; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(ridgeA[0] - e + 1, ridgeA[1] + 1); g.lineTo(ridgeB[0] - 1, ridgeB[1] + 2); g.stroke();
    if (level >= 5) {
      // флажок на коньке
      g.strokeStyle = OUT; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(ridgeB[0] - 4, ridgeB[1]); g.lineTo(ridgeB[0] - 4, ridgeB[1] - 18); g.stroke();
      poly([[ridgeB[0] - 4, ridgeB[1] - 18], [ridgeB[0] + 8, ridgeB[1] - 14], [ridgeB[0] - 4, ridgeB[1] - 10]], '#e2392f');
    }
  });
}

// ---------------- Культуры ----------------

const PLANT_POS = [[0, -7], [-13, 0], [13, 0], [0, 7]];

function leaf(g, x, y, ang, len, w, c) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = OUT; ell(g, 0, -len / 2, w + 0.8, len / 2 + 0.8); g.fill();
  g.fillStyle = c; ell(g, 0, -len / 2, w, len / 2); g.fill();
  g.restore();
}

function plant(g, crop, stage, x, y) {
  const c = crop.leaf;
  const s = [0.45, 0.7, 0.95, 1.05][stage];
  if (stage === 0) {
    leaf(g, x - 1, y, -0.6, 4, 1.4, '#7ccf4f'); leaf(g, x + 1, y, 0.6, 4, 1.4, '#7ccf4f');
    return;
  }
  switch (crop.look) {
    case 'root': {
      if (stage === 3) {
        g.fillStyle = OUT; ell(g, x, y - 1, 3.8, 2.8); g.fill();
        g.fillStyle = crop.fruit; ell(g, x, y - 1.2, 3.1, 2.2); g.fill();
      }
      for (let i = -2; i <= 2; i++) leaf(g, x + i * 0.8, y - 1, i * 0.32, 9 * s, 1.5, i % 2 ? c : '#5fb03a');
      break;
    }
    case 'grain': {
      const col = stage === 3 ? crop.fruit : stage === 2 ? '#b9cf5a' : c;
      for (let i = -2; i <= 2; i++) {
        g.strokeStyle = OUT; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(x + i * 1.6, y); g.lineTo(x + i * 2.2, y - 15 * s); g.stroke();
        g.strokeStyle = col; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + i * 1.6, y); g.lineTo(x + i * 2.2, y - 15 * s); g.stroke();
        if (stage >= 2) { g.fillStyle = OUT; ell(g, x + i * 2.2, y - 15 * s, 1.6, 3.4); g.fill(); g.fillStyle = col; ell(g, x + i * 2.2, y - 15 * s, 1, 2.8); g.fill(); }
      }
      break;
    }
    case 'round': {
      const r = 5.5 * s;
      for (let i = 0; i < 5; i++) leaf(g, x, y, -1.2 + i * 0.6, 8 * s, 2.6 * s, '#5fb03a');
      if (stage >= 2) {
        g.fillStyle = OUT; blob(g, x, y - r * 0.8, r + 0.9);
        g.fillStyle = crop.fruit; blob(g, x, y - r * 0.8, r);
        g.fillStyle = crop.fruit2 || '#c8f08a'; blob(g, x - r * 0.3, y - r * 1.1, r * 0.45);
      }
      break;
    }
    case 'bush': {
      g.fillStyle = OUT; blob(g, x, y - 5 * s, 6 * s + 1);
      g.fillStyle = c; blob(g, x, y - 5 * s, 6 * s);
      g.fillStyle = '#7ccf4f'; blob(g, x - 2 * s, y - 7 * s, 3 * s);
      if (stage === 3) {
        for (const [dx, dy] of [[-3, -4], [3, -6], [0, -2], [2, -9]]) {
          g.fillStyle = OUT; blob(g, x + dx, y + dy, 2.1); g.fillStyle = crop.fruit; blob(g, x + dx, y + dy, 1.6);
          g.fillStyle = 'rgba(255,255,255,0.6)'; blob(g, x + dx - 0.5, y + dy - 0.5, 0.5);
        }
      }
      break;
    }
    case 'tall': {
      const h = 22 * s;
      g.strokeStyle = OUT; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
      g.strokeStyle = '#4f9e36'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
      leaf(g, x, y - h * 0.4, -1, 9 * s, 1.8, c); leaf(g, x, y - h * 0.55, 1, 9 * s, 1.8, c);
      if (stage === 3) {
        if (crop.key === 'sunflower') {
          g.fillStyle = OUT; blob(g, x, y - h, 6); g.fillStyle = '#ffcf33'; blob(g, x, y - h, 5.2);
          g.fillStyle = '#7a4a1f'; blob(g, x, y - h, 2.6);
        } else {
          g.fillStyle = OUT; ell(g, x + 2.5, y - h * 0.6, 2.4, 4.6); g.fill();
          g.fillStyle = crop.fruit; ell(g, x + 2.5, y - h * 0.6, 1.7, 3.9); g.fill();
        }
      }
      break;
    }
    case 'ground': {
      g.strokeStyle = '#4f9e36'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x - 6, y + 1); g.quadraticCurveTo(x, y - 4, x + 6, y + 1); g.stroke();
      leaf(g, x - 4, y, -0.9, 6 * s, 2.4, c); leaf(g, x + 4, y, 0.9, 6 * s, 2.4, c);
      if (stage >= 2) {
        const r = stage === 3 ? 5.5 : 3;
        g.fillStyle = OUT; ell(g, x, y - r * 0.7, r + 1, r * 0.8 + 1); g.fill();
        g.fillStyle = stage === 3 ? crop.fruit : '#a6c94a'; ell(g, x, y - r * 0.7, r, r * 0.8); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(x, y - r * 1.4); g.lineTo(x, y); g.stroke();
      }
      break;
    }
    case 'puff': {
      g.fillStyle = OUT; blob(g, x, y - 6 * s, 5.5 * s + 1); g.fillStyle = c; blob(g, x, y - 6 * s, 5.5 * s);
      if (stage === 3) for (const [dx, dy] of [[-3, -7], [3, -8], [0, -11], [1, -4]]) {
        g.fillStyle = OUT; blob(g, x + dx, y + dy, 2.5); g.fillStyle = '#ffffff'; blob(g, x + dx, y + dy, 2);
      }
      break;
    }
  }
}

export function cropSprite(crop, stage) {
  const single = crop.look === 'ground' && stage >= 2;
  return makeSprite(64, 60, 32, 44, (g) => {
    const pts = single ? [[-8, -2], [8, 3]] : PLANT_POS;
    for (const [x, y] of pts) plant(g, crop, stage, x, y);
  });
}

// ---------------- Значки поверх объектов ----------------

export function bubbleSprite(kind) {
  return makeSprite(22, 26, 11, 24, (g) => {
    g.fillStyle = OUT;
    g.beginPath(); g.arc(0, -13, 10, 0, Math.PI * 2); g.moveTo(-4, -5); g.lineTo(0, 0); g.lineTo(4, -5); g.fill();
    g.fillStyle = '#fffaf0';
    g.beginPath(); g.arc(0, -13, 8.8, 0, Math.PI * 2); g.moveTo(-3, -5); g.lineTo(0, -1.4); g.lineTo(3, -5); g.fill();
    if (kind === 'water') {
      g.fillStyle = '#3f97d6';
      g.beginPath(); g.moveTo(0, -20); g.quadraticCurveTo(6, -12, 0, -8); g.quadraticCurveTo(-6, -12, 0, -20); g.fill();
      g.fillStyle = '#bfe6ff'; blob(g, -1.5, -12, 1.2);
    } else if (kind === 'ready') {
      g.strokeStyle = '#3fae3a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-4.5, -13); g.lineTo(-1, -9.5); g.lineTo(5, -16.5); g.stroke();
    } else if (kind === 'lock') {
      g.fillStyle = '#c8962e'; g.fillRect(-5, -15, 10, 8);
      g.strokeStyle = '#c8962e'; g.lineWidth = 2; g.beginPath(); g.arc(0, -15, 3.2, Math.PI, 0); g.stroke();
    }
  });
}

// ---------------- Иконки интерфейса (dataURL) ----------------

function iconURL(draw, size = 64) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  g.scale(size / 32, size / 32); g.translate(16, 16);
  g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g);
  return c.toDataURL();
}

function cropIcon(crop) {
  return (g) => {
    const o = (f) => { g.strokeStyle = OUT; g.lineWidth = 1.6; f(); };
    switch (crop.key) {
      case 'carrot':
        leaf(g, -3, -6, -0.5, 9, 2, '#5fb03a'); leaf(g, 0, -6, 0, 10, 2, '#4f9e36'); leaf(g, 3, -6, 0.5, 9, 2, '#5fb03a');
        g.beginPath(); g.moveTo(-6, -6); g.quadraticCurveTo(0, -8, 6, -6); g.lineTo(0, 13); g.closePath();
        g.fillStyle = crop.fruit; g.fill(); o(() => g.stroke());
        g.strokeStyle = '#c96a12'; g.lineWidth = 1; for (const y of [-1, 4]) { g.beginPath(); g.moveTo(-3, y); g.lineTo(1, y); g.stroke(); }
        break;
      case 'wheat':
        for (let i = -1; i <= 1; i++) {
          g.strokeStyle = '#b8902d'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(i * 2, 13); g.lineTo(i * 5, -4); g.stroke();
          for (let k = 0; k < 4; k++) { g.fillStyle = OUT; ell(g, i * 5 - 1.8, -4 - k * 3.2, 2.1, 2.9); g.fill(); g.fillStyle = crop.fruit; ell(g, i * 5 - 1.8, -4 - k * 3.2, 1.5, 2.3); g.fill(); g.fillStyle = OUT; ell(g, i * 5 + 1.8, -3 - k * 3.2, 2.1, 2.9); g.fill(); g.fillStyle = crop.fruit; ell(g, i * 5 + 1.8, -3 - k * 3.2, 1.5, 2.3); g.fill(); }
        }
        break;
      case 'corn':
        leaf(g, -2, 12, -0.5, 18, 3, '#5fb03a'); leaf(g, 2, 12, 0.5, 18, 3, '#4f9e36');
        g.fillStyle = OUT; ell(g, 0, -1, 6, 12); g.fill(); g.fillStyle = crop.fruit; ell(g, 0, -1, 4.8, 10.8); g.fill();
        g.fillStyle = '#f7d75a'; for (let y = -9; y < 9; y += 3.2) for (let x = -2.5; x <= 2.5; x += 2.5) blob(g, x, y, 1);
        leaf(g, -3, 12, -0.15, 15, 3, '#6cbd47'); leaf(g, 3, 12, 0.15, 15, 3, '#6cbd47');
        break;
      case 'sunflower':
        g.fillStyle = OUT; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ell(g, Math.cos(a) * 8, Math.sin(a) * 8, 4.5, 4.5); g.fill(); }
        g.fillStyle = '#ffcf33'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ell(g, Math.cos(a) * 8, Math.sin(a) * 8, 3.6, 3.6); g.fill(); }
        g.fillStyle = OUT; blob(g, 0, 0, 7); g.fillStyle = '#7a4a1f'; blob(g, 0, 0, 6); g.fillStyle = '#9b6230'; blob(g, -1.5, -1.5, 2.5);
        break;
      case 'strawberry':
        g.beginPath(); g.moveTo(0, 13); g.bezierCurveTo(-14, 2, -10, -9, 0, -6); g.bezierCurveTo(10, -9, 14, 2, 0, 13);
        g.fillStyle = crop.fruit; g.fill(); o(() => g.stroke());
        g.fillStyle = '#ffe9a8'; for (const [x, y] of [[-4, -1], [3, -2], [0, 3], [-3, 6], [4, 5], [0, 9]]) blob(g, x, y, 0.8);
        leaf(g, 0, -6, -1.1, 7, 2, '#4f9e36'); leaf(g, 0, -6, 1.1, 7, 2, '#4f9e36'); leaf(g, 0, -6, 0, 6, 2, '#5fb03a');
        break;
      case 'cotton':
        g.strokeStyle = '#8a5a30'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 14); g.lineTo(0, 4); g.stroke();
        for (const [x, y] of [[-6, -2], [6, -2], [0, -8], [0, 2]]) { g.fillStyle = OUT; blob(g, x, y, 6.2); }
        for (const [x, y] of [[-6, -2], [6, -2], [0, -8], [0, 2]]) { g.fillStyle = '#ffffff'; blob(g, x, y, 5.2); }
        g.fillStyle = '#e8e4dc'; blob(g, 2, 1, 2.5);
        break;
      case 'tomato':
      case 'beet':
      case 'cabbage':
      case 'pumpkin': {
        const rx = crop.key === 'pumpkin' ? 12 : 10, ry = crop.key === 'pumpkin' ? 9.5 : 10;
        if (crop.key === 'beet') { leaf(g, -2, -6, -0.5, 10, 2.4, '#4f9e36'); leaf(g, 2, -6, 0.5, 10, 2.4, '#5fb03a'); }
        g.fillStyle = OUT; ell(g, 0, 3, rx + 1.3, ry + 1.3); g.fill();
        g.fillStyle = crop.fruit; ell(g, 0, 3, rx, ry); g.fill();
        if (crop.key === 'pumpkin') { g.strokeStyle = '#c45d12'; g.lineWidth = 1.2; for (const x of [-5, 0, 5]) { g.beginPath(); g.ellipse(x * 0.6, 3, Math.abs(x) * 0.9 + 1.5, ry, 0, 0, Math.PI * 2); g.stroke(); } g.fillStyle = '#5a8f2a'; g.fillRect(-1.5, -9, 3, 4); }
        if (crop.key === 'cabbage') { g.strokeStyle = '#4f9e36'; g.lineWidth = 1.2; g.beginPath(); g.arc(-5, 4, 7, -1, 1); g.stroke(); g.beginPath(); g.arc(5, 4, 7, 2.1, 4.2); g.stroke(); }
        if (crop.key === 'beet') { g.strokeStyle = '#7d1f45'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 13); g.lineTo(0, 16); g.stroke(); }
        if (crop.key === 'tomato') { leaf(g, 0, -6, -1.2, 5, 1.6, '#3f8a2f'); leaf(g, 0, -6, 1.2, 5, 1.6, '#3f8a2f'); leaf(g, 0, -6, 0, 4, 1.6, '#4f9e36'); }
        g.fillStyle = 'rgba(255,255,255,0.45)'; ell(g, -rx * 0.4, 3 - ry * 0.4, rx * 0.25, ry * 0.18); g.fill();
        break;
      }
    }
  };
}

export function makeIcons(crops) {
  const I = {};
  I.coin = iconURL((g) => {
    g.fillStyle = OUT; blob(g, 0, 0, 14); g.fillStyle = '#f2b51d'; blob(g, 0, 0, 12.5);
    g.fillStyle = '#ffd453'; blob(g, 0, 0, 9.5); g.strokeStyle = '#d6931a'; g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff3b0'; ell(g, -5, -6, 3, 1.8); g.fill();
  });
  I.gem = iconURL((g) => {
    const p = [[-12, -3], [-6, -11], [6, -11], [12, -3], [0, 13]];
    g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = '#2f7fe0'; g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = '#6fc2ff'; g.beginPath(); g.moveTo(-6, -11); g.lineTo(6, -11); g.lineTo(3, -3); g.lineTo(-3, -3); g.closePath(); g.fill();
    g.fillStyle = '#a9e1ff'; g.beginPath(); g.moveTo(-12, -3); g.lineTo(-3, -3); g.lineTo(0, 13); g.closePath(); g.fill();
  });
  I.energy = iconURL((g) => {
    g.beginPath(); g.moveTo(3, -14); g.lineTo(-9, 2); g.lineTo(-1, 2); g.lineTo(-4, 14); g.lineTo(9, -3); g.lineTo(1, -3); g.closePath();
    g.fillStyle = '#ffcf33'; g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.8; g.stroke();
  });
  I.star = iconURL((g) => {
    g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 14, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 1); } g.closePath();
    g.fillStyle = '#ffc93a'; g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = '#fff1a8'; ell(g, -3, -3, 2.5, 1.5); g.fill();
  });
  I.wood = iconURL((g) => {
    g.save(); g.rotate(-0.35);
    g.fillStyle = OUT; g.fillRect(-13, -7, 22, 14); g.fillStyle = '#9a6538'; g.fillRect(-12, -6, 20, 12);
    g.fillStyle = '#7a4b28'; g.fillRect(-12, 1, 20, 5);
    g.fillStyle = OUT; ell(g, 9, 0, 5, 7.5); g.fill(); g.fillStyle = '#e4bd7c'; ell(g, 9, 0, 4, 6.3); g.fill();
    g.strokeStyle = '#b98b52'; g.lineWidth = 1; ell(g, 9, 0, 2.2, 3.5); g.stroke();
    g.restore();
  });
  I.stone = iconURL((g) => rockShape(g, [[-12, 6], [-13, -2], [-7, -10], [4, -12], [12, -5], [13, 4], [6, 9], [-6, 9]], '#a3a9ae', '#7b8288', '#d3d8dc'));
  I.ore = iconURL((g) => {
    rockShape(g, [[-12, 6], [-13, -2], [-7, -10], [4, -12], [12, -5], [13, 4], [6, 9], [-6, 9]], '#7d6a5c', '#5c4c41', '#a8968a');
    g.fillStyle = '#e8a45a'; blob(g, -4, -2, 2.4); blob(g, 4, 2, 2); blob(g, 3, -6, 1.6); g.fillStyle = '#ffe0a8'; blob(g, -4.5, -2.5, 0.8);
  });
  I.water = iconURL((g) => {
    g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(12, 0, 0, 13); g.quadraticCurveTo(-12, 0, 0, -14);
    g.fillStyle = '#3f97d6'; g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = '#bfe6ff'; ell(g, -3, 2, 2, 3.5); g.fill();
  });
  I.seed = iconURL((g) => {
    g.beginPath(); g.moveTo(-9, -6); g.quadraticCurveTo(-13, 12, 0, 13); g.quadraticCurveTo(13, 12, 9, -6); g.closePath();
    g.fillStyle = '#d9b77a'; g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = '#c49d5f'; g.fillRect(-8, -9, 16, 4); g.strokeRect(-8, -9, 16, 4);
    leaf(g, 0, 6, -0.6, 8, 2, '#5fb03a'); leaf(g, 0, 6, 0.6, 8, 2, '#4f9e36');
  });
  I.house = iconURL((g) => {
    g.fillStyle = '#f4e6c8'; g.fillRect(-10, -2, 20, 14); g.strokeStyle = OUT; g.lineWidth = 1.6; g.strokeRect(-10, -2, 20, 14);
    g.beginPath(); g.moveTo(-14, 0); g.lineTo(0, -13); g.lineTo(14, 0); g.closePath(); g.fillStyle = '#d8573a'; g.fill(); g.stroke();
    g.fillStyle = '#8a4f2a'; g.fillRect(-3, 3, 6, 9);
  });
  I.market = iconURL((g) => {
    g.fillStyle = '#9a6538'; g.fillRect(-12, 0, 24, 12); g.strokeStyle = OUT; g.lineWidth = 1.6; g.strokeRect(-12, 0, 24, 12);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e2392f'; g.fillRect(-14 + i * 7, -12, 7, 9); }
    g.strokeRect(-14, -12, 28, 9);
    g.fillStyle = '#e2392f'; blob(g, -6, 3, 2.5); g.fillStyle = '#f08a24'; blob(g, 0, 3, 2.5); g.fillStyle = '#7ccf4f'; blob(g, 6, 3, 2.5);
  });
  I.bag = iconURL((g) => {
    g.fillStyle = '#b5773f'; g.beginPath(); g.roundRect(-11, -6, 22, 19, 5); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.6; g.stroke();
    g.beginPath(); g.arc(0, -6, 6, Math.PI, 0); g.stroke();
    g.fillStyle = '#d99b5c'; g.beginPath(); g.roundRect(-11, -6, 22, 8, 4); g.fill(); g.stroke();
    g.fillStyle = '#f2c14e'; g.fillRect(-2, 0, 4, 4);
  });
  I.build = iconURL((g) => {
    g.save(); g.rotate(-0.7);
    g.fillStyle = '#9a6538'; g.fillRect(-2, -4, 4, 18); g.strokeStyle = OUT; g.lineWidth = 1.4; g.strokeRect(-2, -4, 4, 18);
    g.fillStyle = '#9aa1a7'; g.fillRect(-9, -11, 18, 7); g.strokeRect(-9, -11, 18, 7);
    g.restore();
  });
  I.center = iconURL((g) => {
    g.strokeStyle = OUT; g.lineWidth = 2.4; g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e2392f'; blob(g, 0, 0, 4); for (const a of [0, 1, 2, 3]) { g.save(); g.rotate(a * Math.PI / 2); g.fillStyle = OUT; g.fillRect(-1.2, -15, 2.4, 5); g.restore(); }
  });
  I.lock = iconURL((g) => {
    g.strokeStyle = OUT; g.lineWidth = 3.4; g.beginPath(); g.arc(0, -3, 6, Math.PI, 0); g.stroke();
    g.fillStyle = '#e8b33a'; g.beginPath(); g.roundRect(-10, -4, 20, 16, 3); g.fill(); g.lineWidth = 1.6; g.stroke();
    g.fillStyle = OUT; blob(g, 0, 3, 2);
  });
  I.dig = iconURL((g) => {
    g.save(); g.rotate(0.6);
    g.fillStyle = '#9a6538'; g.fillRect(-1.5, -14, 3, 22); g.strokeStyle = OUT; g.lineWidth = 1.2; g.strokeRect(-1.5, -14, 3, 22);
    g.fillStyle = '#9aa1a7'; g.beginPath(); g.moveTo(-7, 6); g.lineTo(7, 6); g.lineTo(5, 14); g.lineTo(-5, 14); g.closePath(); g.fill(); g.stroke();
    g.restore();
  });
  I.walk = iconURL((g) => {
    g.fillStyle = '#6b4226'; ell(g, -5, 3, 4, 7); g.fill(); ell(g, 6, -4, 4, 7); g.fill();
    g.fillStyle = '#8a5a35'; ell(g, -5, 2, 2.6, 5.4); g.fill(); ell(g, 6, -5, 2.6, 5.4); g.fill();
  });
  I.speed = iconURL((g) => {
    g.fillStyle = OUT; blob(g, 0, 0, 13); g.fillStyle = '#ffffff'; blob(g, 0, 0, 11.5);
    g.strokeStyle = OUT; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -7); g.moveTo(0, 0); g.lineTo(5, 3); g.stroke();
  });
  I.food = iconURL((g) => {
    g.fillStyle = OUT; blob(g, 0, 2, 12); g.fillStyle = '#e2392f'; blob(g, 0, 2, 10.6);
    g.fillStyle = '#ff8a73'; blob(g, -4, -2, 3); leaf(g, 1, -8, 0.6, 7, 2.4, '#4f9e36');
  });
  for (const crop of Object.values(crops)) I[crop.key] = iconURL(cropIcon(crop));
  return I;
}
