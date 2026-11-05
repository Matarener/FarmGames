// Персонаж-фермер для скелетного движка: части тела (пока процедурные),
// кости, скины «спереди»/«сзади» и анимации.
// Когда появятся PNG частей от художника, заменяются только спрайты в parts().

import { makeSprite } from '../engine/Sprite.js';

const OUT = '#3d2b1f';
const C = {
  skin: '#f6c9a0', skinD: '#e2a77d', hair: '#7a4a25', hat: '#e9c46a', hatD: '#c99a3e', band: '#d65a3c',
  shirt: '#f6f1e4', shirtD: '#d9d1bd', over: '#3f7fd0', overD: '#2f62a8', boot: '#6b4226',
};

function cap(g, w, len, fill, outline = OUT) {
  g.fillStyle = outline; g.beginPath(); g.roundRect(-w / 2 - 0.7, -0.7, w + 1.4, len + 1.4, w / 2 + 0.7); g.fill();
  g.fillStyle = fill; g.beginPath(); g.roundRect(-w / 2, 0, w, len, w / 2); g.fill();
}
function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }

export function parts() {
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

export function makeFarmerData() {
  const P = parts();
  const att = (sprite, x = 0, y = 0, rotation = 0) => ({ sprite, x, y, rotation });
  const bones = [
    { name: 'root' },
    { name: 'hip', parent: 'root', y: -12.6 },
    { name: 'torso', parent: 'hip' },
    { name: 'head', parent: 'torso', y: -12 },
    { name: 'armB', parent: 'torso', x: 2.8, y: -10.6 },
    { name: 'foreB', parent: 'armB', y: 6.4 },
    { name: 'armF', parent: 'torso', x: -2.4, y: -10.4 },
    { name: 'foreF', parent: 'armF', y: 6.4 },
    { name: 'thighB', parent: 'hip', x: 2.3, y: -0.6 },
    { name: 'shinB', parent: 'thighB', y: 6.3 },
    { name: 'thighF', parent: 'hip', x: -2.3, y: -0.6 },
    { name: 'shinF', parent: 'thighF', y: 6.3 },
  ];
  const slots = [
    { name: 'armB', bone: 'armB', attachment: 'arm' },
    { name: 'foreB', bone: 'foreB', attachment: 'fore' },
    { name: 'thighB', bone: 'thighB', attachment: 'thigh' },
    { name: 'shinB', bone: 'shinB', attachment: 'shin' },
    { name: 'thighF', bone: 'thighF', attachment: 'thigh' },
    { name: 'shinF', bone: 'shinF', attachment: 'shin' },
    { name: 'torso', bone: 'torso', attachment: 'torso' },
    { name: 'head', bone: 'head', attachment: 'head' },
    { name: 'armF', bone: 'armF', attachment: 'arm' },
    { name: 'tool', bone: 'foreF', attachment: null },
    { name: 'foreF', bone: 'foreF', attachment: 'fore' },
  ];
  const tools = {
    axe: att(P.axe, 0, 6.6), pickaxe: att(P.pickaxe, 0, 6.6), hoe: att(P.hoe, 0, 6.6),
    can: att(P.can, 0, 6.8), seedbag: att(P.seedbag, 0, 6.6),
  };
  const skins = {
    default: {
      armB: { arm: att(P.upperArmFar) }, foreB: { fore: att(P.foreArmFar) },
      thighB: { thigh: att(P.thighFar) }, shinB: { shin: att(P.shinFar) },
      thighF: { thigh: att(P.thigh) }, shinF: { shin: att(P.shin) },
      torso: { torso: att(P.torso) }, head: { head: att(P.head) },
      armF: { arm: att(P.upperArm) }, foreF: { fore: att(P.foreArm) },
      tool: tools,
    },
    back: {
      torso: { torso: att(P.torsoBack) }, head: { head: att(P.headBack) },
      // сзади «передняя» рука дальше от камеры
      armF: { arm: att(P.upperArmFar) }, foreF: { fore: att(P.foreArmFar) },
      armB: { arm: att(P.upperArm) }, foreB: { fore: att(P.foreArm) },
    },
  };
  const drawOrders = {
    back: ['armF', 'tool', 'foreF', 'thighB', 'shinB', 'thighF', 'shinF', 'torso', 'head', 'armB', 'foreB'],
  };

  // Анимации (углы в градусах от позы покоя; 0 — конечность смотрит вниз,
  // отрицательный угол — вперёд/вверх по направлению взгляда).
  const animations = {
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
    walk: {
      duration: 0.56,
      bones: {
        hip: { translate: [[0, 0, 0, 2], [0.14, 0, -1.1, 2], [0.28, 0, 0, 2], [0.42, 0, -1.1, 2], [0.56, 0, 0]] },
        torso: { rotate: [[0, -4]] },
        head: { rotate: [[0, 2, 2], [0.14, 0, 2], [0.28, 2, 2], [0.42, 0, 2], [0.56, 2]] },
        thighF: { rotate: [[0, -28, 2], [0.28, 26, 2], [0.56, -28]] },
        shinF: { rotate: [[0, 4, 2], [0.28, 8, 2], [0.42, 42, 2], [0.56, 4]] },
        thighB: { rotate: [[0, 26, 2], [0.28, -28, 2], [0.56, 26]] },
        shinB: { rotate: [[0, 8, 2], [0.14, 42, 2], [0.28, 4, 2], [0.56, 8]] },
        armF: { rotate: [[0, 24, 2], [0.28, -24, 2], [0.56, 24]] },
        foreF: { rotate: [[0, -10, 2], [0.28, -30, 2], [0.56, -10]] },
        armB: { rotate: [[0, -24, 2], [0.28, 24, 2], [0.56, -24]] },
        foreB: { rotate: [[0, -30, 2], [0.28, -10, 2], [0.56, -30]] },
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
      duration: 0.75,
      events: [[0.36, 'hit']],
      bones: {
        hip: { translate: [[0, 0, 0, 2], [0.28, 0, 2.4, 2], [0.46, 0, 2.4, 2], [0.75, 0, 0]] },
        torso: { rotate: [[0, 0, 2], [0.28, 30, 2], [0.46, 30, 2], [0.75, 0]] },
        head: { rotate: [[0, 0, 2], [0.28, -14, 2], [0.46, -14, 2], [0.75, 0]] },
        armF: { rotate: [[0, 0, 2], [0.28, -58, 2], [0.46, -40, 2], [0.75, 0]] },
        foreF: { rotate: [[0, 0, 2], [0.28, -20, 2], [0.75, 0]] },
        armB: { rotate: [[0, 0, 2], [0.28, -34, 2], [0.75, 0]] },
        thighF: { rotate: [[0, 0, 2], [0.28, -26, 2], [0.46, -26, 2], [0.75, 0]] },
        shinF: { rotate: [[0, 0, 2], [0.28, 30, 2], [0.46, 30, 2], [0.75, 0]] },
        thighB: { rotate: [[0, 0, 2], [0.28, 14, 2], [0.46, 14, 2], [0.75, 0]] },
        shinB: { rotate: [[0, 0, 2], [0.28, 16, 2], [0.75, 0]] },
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
  return { bones, slots, skins, drawOrders, animations };
}
