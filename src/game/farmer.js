// Персонаж-фермер для скелетного движка: части тела (пока процедурные),
// кости, скины «спереди»/«сзади» и анимации.
// Когда появятся PNG частей от художника, заменяются только спрайты в parts().

import { makeSprite } from '../engine/Sprite.js';
import { cropImage } from './assets.js';

const OUT = '#3d2b1f';
const C = {
  // цвета взяты с кадров фермера из листа спрайтов
  skin: '#f5c6a5', skinD: '#dfa582', hair: '#7a4a25', hat: '#e9c46a', hatD: '#c99a3e', band: '#4a6fb0',
  shirt: '#d9ecf8', shirtD: '#a8cbe6', over: '#2a80d8', overD: '#1d5aa6', boot: '#6b4226',
};

function cap(g, w, len, fill, outline = OUT) {
  g.fillStyle = outline; g.beginPath(); g.roundRect(-w / 2 - 0.7, -0.7, w + 1.4, len + 1.4, w / 2 + 0.7); g.fill();
  g.fillStyle = fill; g.beginPath(); g.roundRect(-w / 2, 0, w, len, w / 2); g.fill();
}
function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }

function parts() {
  const P = {};
  const limb = (w, len, fill, extra) => makeSprite(w + 4, len + 6, w / 2 + 2, 2, (g) => { cap(g, w, len, fill); extra && extra(g); });

  P.upperArm = limb(4.4, 7, C.shirt);
  P.upperArmFar = limb(4.4, 7, C.shirtD);
  const hand = (sk) => (g) => { g.fillStyle = OUT; ell(g, 0, 7, 2.6, 2.6); g.fill(); g.fillStyle = sk; ell(g, 0, 7, 1.9, 1.9); g.fill(); };
  P.foreArm = limb(3.6, 6.5, C.skin, hand(C.skin));
  P.foreArmFar = limb(3.6, 6.5, C.skinD, hand(C.skinD));
  const boot = (b) => (g) => { g.fillStyle = OUT; g.beginPath(); g.roundRect(-2.9, 3.6, 7.4, 3.8, 1.8); g.fill(); g.fillStyle = b; g.beginPath(); g.roundRect(-2.2, 4.2, 6.2, 2.6, 1.3); g.fill(); };
  P.thigh = limb(5, 6.8, C.over);
  P.thighFar = limb(5, 6.8, C.overD);
  P.shin = limb(4.5, 5, C.over, boot(C.boot));
  P.shinFar = limb(4.5, 5, C.overD, boot('#553419'));

  P.torso = makeSprite(16, 17, 8, 15, (g) => {
    g.fillStyle = OUT; g.beginPath(); g.roundRect(-6.4, -13.6, 12.8, 14.4, 4); g.fill();
    g.fillStyle = C.shirt; g.beginPath(); g.roundRect(-5.6, -12.8, 11.2, 13, 3.4); g.fill();
    g.fillStyle = C.over; g.beginPath(); g.roundRect(-5.6, -6.5, 11.2, 6.7, [0, 0, 3.4, 3.4]); g.fill();
    g.fillRect(-1.5, -11, 6, 5); // нагрудник
    g.strokeStyle = C.overD; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-1, -11); g.lineTo(-3, -12.8); g.moveTo(4, -11); g.lineTo(4.5, -12.8); g.stroke();
    g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(-0.4, -10, 0.8, 0, 7); g.arc(3.4, -10, 0.8, 0, 7); g.fill();
    g.fillStyle = C.overD; g.fillRect(0.5, -8.6, 2.6, 1.8);
  });
  P.torsoBack = makeSprite(16, 17, 8, 15, (g) => {
    g.fillStyle = OUT; g.beginPath(); g.roundRect(-6.4, -13.6, 12.8, 14.4, 4); g.fill();
    g.fillStyle = C.shirt; g.beginPath(); g.roundRect(-5.6, -12.8, 11.2, 13, 3.4); g.fill();
    g.fillStyle = C.over; g.beginPath(); g.roundRect(-5.6, -6.5, 11.2, 6.7, [0, 0, 3.4, 3.4]); g.fill();
    g.strokeStyle = C.over; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-4, -12.6); g.lineTo(3, -6.5); g.moveTo(4, -12.6); g.lineTo(-3, -6.5); g.stroke();
  });

  const hat = (g) => {
    g.fillStyle = OUT; ell(g, 0.5, -12.5, 12.2, 4.2); g.fill();
    g.fillStyle = C.hat; ell(g, 0.5, -12.6, 11.2, 3.3); g.fill();
    g.fillStyle = OUT; g.beginPath(); g.roundRect(-6.2, -21, 13, 9.6, [5, 5, 1, 1]); g.fill();
    g.fillStyle = C.hat; g.beginPath(); g.roundRect(-5.4, -20.2, 11.4, 8.4, [4.5, 4.5, 1, 1]); g.fill();
    g.fillStyle = C.hatD; g.fillRect(1.5, -19.5, 4.3, 7.5);
    g.fillStyle = C.band; g.fillRect(-5.4, -14.6, 11.4, 2.4);
  };
  P.head = makeSprite(28, 26, 14, 23, (g) => {
    g.fillStyle = OUT; ell(g, 0.8, -7.6, 8.4, 8); g.fill();
    g.fillStyle = C.skin; ell(g, 0.8, -7.6, 7.5, 7.2); g.fill();
    // волосы сзади-слева
    g.fillStyle = C.hair; g.beginPath(); g.ellipse(-2.5, -9, 5.2, 5.8, 0.3, Math.PI * 0.55, Math.PI * 1.6); g.fill();
    g.fillStyle = C.hair; g.beginPath(); g.ellipse(-4.6, -6.5, 2.4, 3.6, 0, 0, 7); g.fill();
    // ухо
    g.fillStyle = C.skinD; ell(g, -3.4, -6.6, 1.5, 2); g.fill();
    // глаза
    g.fillStyle = OUT; ell(g, 2.6, -7.2, 1.05, 1.5); g.fill(); ell(g, 6.4, -7.2, 0.95, 1.4); g.fill();
    g.fillStyle = '#ffffff'; ell(g, 2.9, -7.7, 0.4, 0.45); g.fill(); ell(g, 6.65, -7.7, 0.35, 0.4); g.fill();
    // щёки и улыбка
    g.fillStyle = 'rgba(240,110,110,0.45)'; ell(g, 1.6, -4.4, 1.6, 1); g.fill(); ell(g, 7.2, -4.6, 1.2, 0.9); g.fill();
    g.strokeStyle = OUT; g.lineWidth = 0.8; g.beginPath(); g.arc(4.8, -4.6, 1.5, 0.3, Math.PI - 0.3); g.stroke();
    hat(g);
  });
  P.headBack = makeSprite(28, 26, 14, 23, (g) => {
    g.fillStyle = OUT; ell(g, 0, -7.6, 8.4, 8); g.fill();
    g.fillStyle = C.hair; ell(g, 0, -7.6, 7.5, 7.2); g.fill();
    g.fillStyle = '#8f5a2f'; ell(g, -2, -9, 3, 2.5); g.fill();
    g.fillStyle = C.skinD; ell(g, 6.6, -6.6, 1.4, 2); g.fill(); ell(g, -6.6, -6.6, 1.4, 2); g.fill();
    hat(g);
  });

  // Инструменты: начало координат — точка хвата, +y — вдоль предплечья.
  const handle = (g, len) => { g.fillStyle = OUT; g.fillRect(-1.3, -3, 2.6, len + 4); g.fillStyle = '#a66c3a'; g.fillRect(-0.7, -2.4, 1.4, len + 2.8); };
  P.axe = makeSprite(14, 22, 8, 4, (g) => {
    handle(g, 13);
    g.fillStyle = OUT; g.beginPath(); g.moveTo(0.8, 8.4); g.lineTo(-6.6, 7.4); g.quadraticCurveTo(-8.2, 11.5, -6.6, 15.6); g.lineTo(0.8, 14.4); g.closePath(); g.fill();
    g.fillStyle = '#b8c0c6'; g.beginPath(); g.moveTo(0, 9.2); g.lineTo(-5.8, 8.4); g.quadraticCurveTo(-7, 11.5, -5.8, 14.6); g.lineTo(0, 13.6); g.closePath(); g.fill();
    g.fillStyle = '#eef3f6'; g.fillRect(-6.4, 9.4, 1.2, 4.4);
  });
  P.pickaxe = makeSprite(20, 22, 10, 4, (g) => {
    handle(g, 13);
    g.fillStyle = OUT; g.beginPath(); g.moveTo(-9, 15.5); g.quadraticCurveTo(0, 8.5, 9, 15.5); g.quadraticCurveTo(0, 12.5, -9, 15.5); g.fill();
    g.strokeStyle = OUT; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-8.5, 15); g.quadraticCurveTo(0, 9.5, 8.5, 15); g.stroke();
    g.strokeStyle = '#9aa1a7'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-8.2, 14.8); g.quadraticCurveTo(0, 9.8, 8.2, 14.8); g.stroke();
  });
  P.hoe = makeSprite(14, 24, 8, 4, (g) => {
    handle(g, 15);
    g.fillStyle = OUT; g.fillRect(-6.4, 13.2, 7.4, 4.2);
    g.fillStyle = '#9aa1a7'; g.fillRect(-5.8, 13.8, 6.2, 3);
  });
  P.can = makeSprite(24, 24, 12, 8, (g) => {
    // тело лейки свисает в сторону −x (вниз, когда рука вытянута вперёд), носик вдоль +y
    g.strokeStyle = OUT; g.lineWidth = 3; g.beginPath(); g.moveTo(-6, 6); g.lineTo(-3, 13); g.stroke();
    g.strokeStyle = '#4f95d8'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-6, 6); g.lineTo(-3, 13); g.stroke();
    g.fillStyle = OUT; g.beginPath(); g.roundRect(-11.5, -4.5, 8.4, 11, 2.4); g.fill();
    g.fillStyle = '#5aa6e8'; g.beginPath(); g.roundRect(-10.8, -3.8, 7, 9.6, 2); g.fill();
    g.fillStyle = '#9fd0f7'; g.fillRect(-9.8, -2.6, 1.6, 7);
    g.strokeStyle = OUT; g.lineWidth = 1.4; g.beginPath(); g.arc(-3, 0.5, 3.2, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.fillStyle = OUT; ell(g, -2.6, 14, 2, 1.4); g.fill();
  });
  P.seedbag = makeSprite(14, 14, 7, 2, (g) => {
    g.fillStyle = OUT; ell(g, -2, 5, 4.6, 4.2); g.fill(); g.fillStyle = '#d9b77a'; ell(g, -2, 5, 3.8, 3.4); g.fill();
    g.fillStyle = '#5fb03a'; ell(g, -2, 5, 1.4, 1.4); g.fill();
  });
  return P;
}

// Части тела художника (второй лист): голова, туловище, рука, бедро, голень.
// Возвращает размеры костей под эти части или null, если частей нет.
// У туловищ на листе нарисованы руки по бокам — их срезаем (fx0..fx1),
// руки рисуются отдельными костями поверх.
function artParts(P, A) {
  const need = ['head_34', 'torso_34', 'arm_4', 'thigh_1', 'leg_1'];
  if (!need.every((n) => A[n])) return null;
  const part = (src, fx0, fy0, fx1, fy1, w, axF, ayF, shade = 0) => {
    const img = src.img;
    let c = cropImage(img, fx0, fy0, fx1, fy1);
    if (shade) {
      const g = c.getContext('2d');
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(20,30,60,${shade})`; g.fillRect(0, 0, c.width, c.height);
    }
    const h = w * c.height / c.width;
    return { canvas: c, w, h, ax: w * axF, ay: h * ayF };
  };
  const TX0 = 0.22, TX1 = 0.84, TW = 14 * (TX1 - TX0);
  P.head = part(A.head_34, 0, 0, 1, 1, 17, 0.5, 0.93);
  P.torso = part(A.torso_34, TX0, 0, TX1, 1, TW, 0.5, 0.8);
  P.torsoBack = A.torso_back ? part(A.torso_back, TX0, 0, TX1, 1, TW, 0.5, 0.8) : P.torso;
  if (A.farmer_back) P.headBack = part(A.farmer_back, 0.04, 0, 0.96, 0.3, 17, 0.5, 0.95);
  // Рука: рукав художника + плечо, предплечье и кисть, нарисованные кодом
  // в палитре листа: сужение к локтю и запястью, светлая и теневая сторона,
  // кисть с большим пальцем (на листе годных частей рук нет).
  const sleeve = cropImage(A.arm_4.img, 0, 0, 1, 0.42);
  const SW = 6.2, SH = SW * sleeve.height / sleeve.width;
  const UL = 6.2, FL = 5.4;
  const SK = { base: '#f0b994', light: '#f8d0b2', dark: '#d4936c' };
  const SKD = { base: '#e2ab88', light: '#ecc2a4', dark: '#c4865f' };
  // конечность-«веретено»: ширина w0 у начала, wm в середине, w1 в конце
  const limb = (g, len, w0, wm, w1, c) => {
    const path = (k) => {
      g.beginPath();
      g.moveTo(-w0 / 2 - k, 0);
      g.quadraticCurveTo(-wm / 2 - k, len * 0.45, -w1 / 2 - k, len);
      g.arc(0, len, w1 / 2 + k, Math.PI, 0, true);
      g.quadraticCurveTo(wm / 2 + k, len * 0.45, w0 / 2 + k, 0);
      g.arc(0, 0, w0 / 2 + k, 0, Math.PI, true);
      g.closePath();
    };
    g.fillStyle = OUT; path(0.55); g.fill();
    const gr = g.createLinearGradient(-wm / 2, 0, wm / 2, 0);
    gr.addColorStop(0, c.light); gr.addColorStop(0.45, c.base); gr.addColorStop(1, c.dark);
    g.fillStyle = gr; path(0); g.fill();
  };
  const handShape = (g, y, c) => {
    // ладонь-«варежка» и большой палец, пальцы вниз
    const draw = (k) => {
      g.beginPath(); g.ellipse(0.1, y + 1.6, 1.45 + k, 1.75 + k, 0, 0, Math.PI * 2);
      g.moveTo(-0.9, y + 0.9); g.ellipse(-1.25, y + 1.4, 0.6 + k, 1.05 + k, 0.5, 0, Math.PI * 2);
    };
    g.fillStyle = OUT; draw(0.55); g.fill();
    const gr = g.createLinearGradient(-1.8, 0, 1.8, 0);
    gr.addColorStop(0, c.light); gr.addColorStop(0.5, c.base); gr.addColorStop(1, c.dark);
    g.fillStyle = gr; draw(0); g.fill();
    g.strokeStyle = 'rgba(120,60,35,0.55)'; g.lineWidth = 0.35;
    g.beginPath(); for (const x of [-0.4, 0.35, 1.05]) { g.moveTo(x, y + 2.3); g.lineTo(x, y + 3.1); } g.stroke();
  };
  const upper = (shade) => makeSprite(SW + 2, UL + SH + 1, SW / 2 + 1, 1, (g) => {
    limb(g, UL, 2.9, 2.7, 2.4, shade ? SKD : SK);
    g.drawImage(sleeve, -SW / 2, -0.9, SW, SH);
    if (shade) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(20,30,60,0.1)'; g.fillRect(-SW, -2, SW * 2, UL + SH + 4); }
  });
  const fore = (shade) => makeSprite(6, FL + 6, 3, 1.5, (g) => {
    limb(g, FL, 2.4, 2.5, 1.9, shade ? SKD : SK);
    handShape(g, FL - 0.6, shade ? SKD : SK);
  });
  P.upperArm = upper(false); P.upperArmFar = upper(true);
  P.foreArm = fore(false); P.foreArmFar = fore(true);
  // у штанины снизу и у голени сверху нарисованы колени — срезаем, чтобы не торчали
  P.thigh = part(A.thigh_1, 0, 0, 1, 0.84, 6.6, 0.5, 0.08);
  P.thighFar = part(A.thigh_1, 0, 0, 1, 0.84, 6.6, 0.5, 0.08, 0.22);
  P.shin = part(A.leg_1, 0, 0.14, 1, 1, 6.2, 0.5, 0.04);
  P.shinFar = part(A.leg_1, 0, 0.14, 1, 1, 6.2, 0.5, 0.04, 0.22);
  return {
    hip: -15.4, head: -16.2, shoulderY: -13.6, shoulderX: 4.4, fore: UL - 0.4, hipX: 2.2, knee: 5.6, grip: 6.3, grip2: 9.8,
  };
}

// Голова из кадров художника: 3/4 (отражаем, чтобы смотрел вправо) и вид сзади.
function artHeads(P, A) {
  const head = (img, flip, neckX) => {
    const c = cropImage(img, 0, 0, 1, 0.465, flip);
    const w = 25, h = w * c.height / c.width;
    return { canvas: c, w, h, ax: w * neckX, ay: h * 0.97 };
  };
  if (A.boy_side) P.head = head(A.boy_side.img, true, 0.55);
  if (A.boy_back) P.headBack = head(A.boy_back.img, false, 0.5);
}

// Анимации (углы в градусах от позы покоя; 0 — конечность смотрит вниз,
// отрицательный угол — вперёд/вверх по направлению взгляда).
const clone = (o) => JSON.parse(JSON.stringify(o));

export const DEFAULT_ANIMS = {
  idle: {
    duration: 1.8,
    bones: {
      hip: { translate: [[0, 0, 0, 2], [0.9, 0, 0.5, 2], [1.8, 0, 0]] },
      torso: { scale: [[0, 1, 1, 2], [0.9, 1.02, 0.98, 2], [1.8, 1, 1]] },
      head: { rotate: [[0, 0, 2], [0.9, 2.5, 2], [1.8, 0]] },
      armF: { rotate: [[0, 4, 2], [0.9, 7, 2], [1.8, 4]] },
      armB: { rotate: [[0, -4, 2], [0.9, -7, 2], [1.8, -4]] },
    },
  },
  // Походка для вида 3/4: ноги не раскачиваются в стороны, а поочерёдно
  // поднимаются (подъём бедра + сгиб колена), корпус чуть пружинит,
  // руки — встречно ногам. Цикл = два шага.
  walk: {
    duration: 0.5,
    bones: {
      hip: { translate: [[0, 0, 0, 2], [0.125, 0, -0.9, 2], [0.25, 0, 0, 2], [0.375, 0, -0.9, 2], [0.5, 0, 0]] },
      torso: { rotate: [[0, -1.5, 2], [0.25, 1.5, 2], [0.5, -1.5]] },
      head: { rotate: [[0, 1, 2], [0.25, -1, 2], [0.5, 1]] },
      armF: { rotate: [[0, 9, 2], [0.25, -9, 2], [0.5, 9]] },
      foreF: { rotate: [[0, -8, 2], [0.25, -18, 2], [0.5, -8]] },
      armB: { rotate: [[0, -9, 2], [0.25, 9, 2], [0.5, -9]] },
      foreB: { rotate: [[0, -18, 2], [0.25, -8, 2], [0.5, -18]] },
    },
  },
  // Замах двумя руками: топор, кирка, мотыга. Событие hit — момент удара.
  swing: {
    duration: 0.72,
    events: [[0.44, 'hit']],
    bones: {
      hip: { translate: [[0, 0, 0, 2], [0.3, 0, -0.6, 3], [0.44, 0, 1.2, 2], [0.72, 0, 0]] },
      torso: { rotate: [[0, 2, 2], [0.3, -10, 3], [0.44, 14, 2], [0.72, 2]] },
      head: { rotate: [[0, 0, 2], [0.3, 8, 3], [0.44, -6, 2], [0.72, 0]] },
      armF: { rotate: [[0, -40, 2], [0.3, -190, 3], [0.44, -70, 2], [0.72, -40]] },
      foreF: { rotate: [[0, -20, 2], [0.3, -25, 3], [0.44, 0, 2], [0.72, -20]] },
      armB: { rotate: [[0, -35, 2], [0.3, -175, 3], [0.44, -62, 2], [0.72, -35]] },
      foreB: { rotate: [[0, -20, 2], [0.3, -30, 3], [0.44, -4, 2], [0.72, -20]] },
      thighF: { rotate: [[0, -14]] }, shinF: { rotate: [[0, 6]] },
      thighB: { rotate: [[0, 12]] }, shinB: { rotate: [[0, 4]] },
    },
  },
  water: {
    duration: 1.1,
    events: [[0.6, 'hit']],
    bones: {
      torso: { rotate: [[0, 0, 2], [0.25, 6, 2], [0.85, 6, 2], [1.1, 0]] },
      armF: { rotate: [[0, -30, 2], [0.25, -82, 2], [0.85, -82, 2], [1.1, -30]] },
      foreF: { rotate: [[0, 0, 2], [0.25, -6, 2], [0.45, 38, 2], [0.75, 38, 2], [0.9, -6, 2], [1.1, 0]] },
      armB: { rotate: [[0, 10, 2], [0.5, 16, 2], [1.1, 10]] },
      thighF: { rotate: [[0, -10]] }, thighB: { rotate: [[0, 8]] },
    },
  },
  // Наклон: посадка, сбор урожая, набрать воды
  pick: {
    // присесть: колени в стороны, корпус чуть вперёд, руки тянутся вниз
    duration: 0.75,
    kneesOut: true,
    events: [[0.36, 'hit']],
    bones: {
      hip: { translate: [[0, 0, 0, 2], [0.28, 0, 3.2, 2], [0.46, 0, 3.2, 2], [0.75, 0, 0]] },
      torso: { rotate: [[0, 0, 2], [0.28, 10, 2], [0.46, 10, 2], [0.75, 0]] },
      head: { rotate: [[0, 0, 2], [0.28, -6, 2], [0.46, -6, 2], [0.75, 0]] },
      armF: { rotate: [[0, 0, 2], [0.28, -22, 2], [0.46, -14, 2], [0.75, 0]] },
      foreF: { rotate: [[0, 0, 2], [0.28, -18, 2], [0.75, 0]] },
      armB: { rotate: [[0, 0, 2], [0.28, 14, 2], [0.75, 0]] },
      foreB: { rotate: [[0, 0, 2], [0.28, -12, 2], [0.75, 0]] },
      thighF: { rotate: [[0, 0, 2], [0.28, 26, 2], [0.46, 26, 2], [0.75, 0]] },
      shinF: { rotate: [[0, 0, 2], [0.28, -40, 2], [0.46, -40, 2], [0.75, 0]] },
      thighB: { rotate: [[0, 0, 2], [0.28, -26, 2], [0.46, -26, 2], [0.75, 0]] },
      shinB: { rotate: [[0, 0, 2], [0.28, 40, 2], [0.46, 40, 2], [0.75, 0]] },
    },
  },
  happy: {
    duration: 0.9,
    loop: false,
    bones: {
      root: { translate: [[0, 0, 0, 4], [0.18, 0, -7, 3], [0.36, 0, 0], [0.46, 0, 0, 4], [0.62, 0, -4, 3], [0.78, 0, 0]] },
      armF: { rotate: [[0, 0, 2], [0.18, -165, 2], [0.65, -160, 2], [0.9, 0]] },
      armB: { rotate: [[0, 0, 2], [0.18, -150, 2], [0.65, -150, 2], [0.9, 0]] },
      foreF: { rotate: [[0, 0], [0.18, -15], [0.9, 0]] },
      thighF: { rotate: [[0, 0], [0.18, -20], [0.36, 0]] },
      shinF: { rotate: [[0, 0], [0.18, 30], [0.36, 0]] },
    },
  },
};
// Фермер по частям (assets/source/body.png): голова, шея, туловище, плечо,
// предплечье, кисть и кулак, бедро, голень с ботинком. Координаты — пиксели
// листа: рамка части и её шарниры. Шкала одна на все части: S px = 1 единица мира.
const BODY_S = 23;
const BODY = {
  body_head: { box: [21, 19], pivot: [157, 230] },           // низ головы, куда входит шея
  body_neck: { box: [138, 275], pivot: [164, 342], top: [164, 292] },
  body_torso: {
    box: [58, 380], pivot: [160, 675],                          // середина таза
    neck: [178, 405], shoulderF: [93, 465], shoulderB: [238, 428], hipF: [116, 684], hipB: [205, 665],
  },
  body_upper: { box: [474, 23], pivot: [517, 61], end: [524, 183] },
  body_upper2: { box: [654, 23], pivot: [684, 49] },
  body_fore: { box: [498, 223], pivot: [524.5, 247.5], end: [525.5, 343.5] },
  body_fore2: { box: [670, 211], pivot: [698, 236] },
  body_hand: { box: [486, 384], pivot: [526, 400], grip: [528, 450] },
  body_fist: { box: [650, 395], pivot: [694, 412], grip: [695, 455] },
  body_hand2: { box: [50, 803], pivot: [87, 815] },
  body_fist2: { box: [206, 799], pivot: [250, 812] },
  body_thigh: { box: [486, 555], pivot: [535, 599], end: [536.5, 758.5] },
  body_shin: { box: [634, 547], pivot: [691, 596], end: [687, 1001] },  // конец — подошва
};

function bodyParts(P, A) {
  if (!Object.keys(BODY).every((n) => A[n])) return null;
  const S = BODY_S;
  const part = (name, shade = 0) => {
    const src = A[name], d = BODY[name];
    let canvas = src.img;
    if (shade) {
      canvas = cropImage(src.img, 0, 0, 1, 1);
      const g = canvas.getContext('2d');
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(20,30,60,${shade})`; g.fillRect(0, 0, canvas.width, canvas.height);
    }
    return { canvas, w: src.w, h: src.h, ax: (d.pivot[0] - d.box[0]) / S, ay: (d.pivot[1] - d.box[1]) / S };
  };
  const len = (name, key = 'end') => { const d = BODY[name]; return Math.hypot(d[key][0] - d.pivot[0], d[key][1] - d.pivot[1]) / S; };
  const FAR = 0.14;
  P.head = part('body_head'); P.neck = part('body_neck'); P.neckFar = part('body_neck', 0.15);
  P.torso = part('body_torso');
  P.upperArm = part('body_upper'); P.upperArmFar = part('body_upper2', FAR);
  P.foreArm = part('body_fore'); P.foreArmFar = part('body_fore2', FAR);
  P.hand = part('body_hand'); P.fist = part('body_fist');
  P.handFar = part('body_hand2', FAR); P.fistFar = part('body_fist2', FAR);
  P.thigh = part('body_thigh'); P.thighFar = part('body_thigh', FAR);
  P.shin = part('body_shin'); P.shinFar = part('body_shin', FAR);
  // вид сзади: пока со старого листа, подогнанный по ширине (новых частей сзади ещё нет)
  const T = BODY.body_torso;
  if (A.torso_back) {
    const c = cropImage(A.torso_back.img, 0.22, 0, 0.84, 1), w = A.body_torso.w, h = w * c.height / c.width;
    P.torsoBack = { canvas: c, w, h, ax: w * 0.5, ay: h * 0.8 };
  } else P.torsoBack = P.torso;
  if (A.farmer_back) {
    const c = cropImage(A.farmer_back.img, 0.04, 0, 0.96, 0.3), w = A.body_head.w * 0.95, h = w * c.height / c.width;
    P.headBack = { canvas: c, w, h, ax: w * 0.5, ay: h * 0.93 };
  } else P.headBack = P.head;
  const rel = (pt) => [(pt[0] - T.pivot[0]) / S, (pt[1] - T.pivot[1]) / S];
  const thigh = len('body_thigh'), shin = len('body_shin');
  const hipF = rel(T.hipF), hipB = rel(T.hipB);
  const handGrip = len('body_fist', 'grip');
  return {
    // таз чуть ниже полной длины ноги: колени слегка согнуты, IK не упирается в предел
    hip: -(thigh + shin) * 0.975 - (hipF[1] + hipB[1]) / 2,
    neck: rel(T.neck), neckLen: len('body_neck', 'top'),
    shoulderF: rel(T.shoulderF), shoulderB: rel(T.shoulderB),
    fore: len('body_upper'), hand: len('body_fore'),
    hipF, hipB, hipX: (hipB[0] - hipF[0]) / 2, knee: thigh, shin,
    toolY: handGrip, armLen2: len('body_fore') + handGrip, grip2: handGrip + 3.5,
    hands: true,
  };
}

// Размеры костей старых частей → общий формат
function legacyK(K) {
  return {
    hip: K.hip, neck: [0, K.head], neckLen: 0,
    shoulderF: [-K.shoulderX, K.shoulderY], shoulderB: [K.shoulderX, K.shoulderY],
    fore: K.fore, hand: K.grip, hipF: [-K.hipX, -0.6], hipB: [K.hipX, -0.6], hipX: K.hipX,
    knee: K.knee, shin: -K.hip + 0.6 - K.knee + 0.25, toolY: 0, armLen2: K.grip, grip2: K.grip2 - K.grip,
    hands: false,
  };
}

export function makeFarmerData(A = {}) {
  const animations = clone(DEFAULT_ANIMS);
  const P = parts();
  // размеры костей: под новые части, под старые части листа или под процедурные
  const K = bodyParts(P, A) || legacyK(artParts(P, A) || (artHeads(P, A), {
    hip: -12.6, head: -12, shoulderY: -10.5, shoulderX: 2.6, fore: 6.4, hipX: 2.3, knee: 6.3, grip: 6.6, grip2: 9.6,
  }));
  const att = (sprite, x = 0, y = 0, rotation = 0) => ({ sprite, x, y, rotation });
  const bones = [
    { name: 'root' },
    { name: 'hip', parent: 'root', y: K.hip },
    { name: 'torso', parent: 'hip' },
    { name: 'neck', parent: 'torso', x: K.neck[0], y: K.neck[1] },
    { name: 'head', parent: 'neck', y: -K.neckLen },
    { name: 'armB', parent: 'torso', x: K.shoulderB[0], y: K.shoulderB[1] },
    { name: 'foreB', parent: 'armB', y: K.fore },
    { name: 'handB', parent: 'foreB', y: K.hand },
    { name: 'armF', parent: 'torso', x: K.shoulderF[0], y: K.shoulderF[1] },
    { name: 'foreF', parent: 'armF', y: K.fore },
    { name: 'handF', parent: 'foreF', y: K.hand },
    { name: 'thighB', parent: 'hip', x: K.hipB[0], y: K.hipB[1] },
    { name: 'shinB', parent: 'thighB', y: K.knee },
    { name: 'thighF', parent: 'hip', x: K.hipF[0], y: K.hipF[1] },
    { name: 'shinF', parent: 'thighF', y: K.knee },
  ];
  const H = K.hands;
  const slots = [
    { name: 'armB', bone: 'armB', attachment: 'arm' },
    { name: 'foreB', bone: 'foreB', attachment: 'fore' },
    { name: 'handB', bone: 'handB', attachment: H ? 'hand' : null },
    { name: 'neck', bone: 'neck', attachment: P.neck ? 'neck' : null },
    { name: 'shinB', bone: 'shinB', attachment: 'shin' },
    { name: 'thighB', bone: 'thighB', attachment: 'thigh' },
    { name: 'shinF', bone: 'shinF', attachment: 'shin' },
    { name: 'thighF', bone: 'thighF', attachment: 'thigh' },
    { name: 'torso', bone: 'torso', attachment: 'torso' },
    { name: 'head', bone: 'head', attachment: 'head' },
    { name: 'armF', bone: 'armF', attachment: 'arm' },
    { name: 'foreF', bone: 'foreF', attachment: 'fore' },
    { name: 'tool', bone: 'handF', attachment: null },
    { name: 'handF', bone: 'handF', attachment: H ? 'hand' : null },
  ];
  // инструмент: начало координат — точка хвата, +y — вдоль предплечья
  const ty = K.toolY;
  const tools = {
    axe: att(P.axe, 0, ty), pickaxe: att(P.pickaxe, 0, ty), hoe: att(P.hoe, 0, ty),
    can: att(P.can, 0, ty + 0.2), seedbag: att(P.seedbag, 0, ty),
  };
  const hands = (near) => (H ? { hand: att(near ? P.hand : P.handFar), fist: att(near ? P.fist : P.fistFar) } : {});
  const skins = {
    default: {
      armB: { arm: att(P.upperArmFar) }, foreB: { fore: att(P.foreArmFar) }, handB: hands(false),
      thighB: { thigh: att(P.thighFar) }, shinB: { shin: att(P.shinFar) },
      thighF: { thigh: att(P.thigh) }, shinF: { shin: att(P.shin) },
      torso: { torso: att(P.torso) }, head: { head: att(P.head) }, neck: P.neck ? { neck: att(P.neck) } : {},
      armF: { arm: att(P.upperArm) }, foreF: { fore: att(P.foreArm) }, handF: hands(true),
      tool: tools,
    },
    back: {
      torso: { torso: att(P.torsoBack) }, head: { head: att(P.headBack) },
      // сзади «передняя» рука дальше от камеры
      armF: { arm: att(P.upperArmFar) }, foreF: { fore: att(P.foreArmFar) }, handF: hands(false),
      armB: { arm: att(P.upperArm) }, foreB: { fore: att(P.foreArm) }, handB: hands(true),
    },
  };
  const drawOrders = {
    back: ['armF', 'foreF', 'tool', 'handF', 'shinB', 'thighB', 'shinF', 'thighF', 'neck', 'torso', 'head', 'armB', 'foreB', 'handB'],
  };

  // IK: ноги (стопа на земле) и вторая рука на рукояти инструмента
  const ik = [
    { name: 'legF', bone1: 'thighF', bone2: 'shinF', len2: K.shin, bend: 1 },
    { name: 'legB', bone1: 'thighB', bone2: 'shinB', len2: K.shin, bend: 1 },
    { name: 'armB', bone1: 'armB', bone2: 'foreB', len2: K.armLen2, bend: -1 },
  ];
  return { bones, slots, skins, drawOrders, animations, ik, legs: { hipX: K.hipX }, grip2: K.grip2, gripBone: 'handF', hands: H };
}
