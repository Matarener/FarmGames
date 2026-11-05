// Персонаж-призрак (чиби): тело-капля с волнистым хвостом, соломенная шляпа,
// маленькие парящие ручки без рук. Всё рисуется кодом один раз при старте.
// Кости и события анимаций совместимы с Player (hit — момент действия).

import { makeSprite } from '../engine/Sprite.js';
import { parts as farmerParts } from './farmer.js';

const OUT = '#3d2b1f';
const C = {
  body: '#f7f8ff', shade: '#d9def3', light: '#ffffff', blush: 'rgba(245,120,140,0.5)',
  hat: '#e9c46a', hatD: '#c99a3e', band: '#d65a3c',
};
const BW = 10;   // полуширина тела
const TOP = -26; // макушка (начало координат — низ тела)

function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }

// Контур тела: купол сверху, чуть расширяется книзу, снизу три «язычка» хвоста.
// phase сдвигает язычки — три кадра дают волну.
function bodyPath(phase, grow = 0) {
  const p = new Path2D();
  const r = BW + grow, cy = TOP + BW;
  p.moveTo(-r, cy);
  p.arc(0, cy, r, Math.PI, 0);
  p.quadraticCurveTo(r + 0.6, -6, r + 1.4, -1);
  const lobes = 3, x0 = r + 1.4, x1 = -(r + 1.4), step = (x1 - x0) / lobes;
  for (let i = 0; i < lobes; i++) {
    const a = x0 + step * i, b = a + step;
    const depth = 3 + Math.sin(phase * Math.PI * 2 / 3 + i * 2.1) * 1.4 + grow;
    const sway = Math.cos(phase * Math.PI * 2 / 3 + i * 2.1) * 1.2;
    p.quadraticCurveTo(a + step * 0.5 + sway, depth + 1.5, b, i === lobes - 1 ? -1 : -1.6);
  }
  p.quadraticCurveTo(-(r + 0.6), -6, -r, cy);
  p.closePath();
  return p;
}

function bodySprite(phase, back) {
  return makeSprite(30, 36, 15, 31, (g) => {
    g.fillStyle = OUT; g.fill(bodyPath(phase, 0.8));
    const path = bodyPath(phase);
    g.fillStyle = C.body; g.fill(path);
    g.save(); g.clip(path);
    // тень справа-снизу (свет сверху-слева) и блик
    g.fillStyle = C.shade; ell(g, 8, -6, 9, 13); g.fill();
    g.fillStyle = C.body; ell(g, 1.5, -12, 9.5, 13); g.fill();
    g.fillStyle = C.light; ell(g, -5, -19, 2.6, 3.6); g.fill();
    g.restore();
    if (back) return;
    // лицо смотрит вправо (+x), как у фермера
    g.fillStyle = OUT; ell(g, 1.6, -13.4, 1.7, 2.4); g.fill(); ell(g, 7, -13.4, 1.5, 2.2); g.fill();
    g.fillStyle = '#ffffff'; ell(g, 2.1, -14.3, 0.65, 0.75); g.fill(); ell(g, 7.4, -14.3, 0.55, 0.65); g.fill();
    g.fillStyle = C.blush; ell(g, -0.6, -10, 2, 1.2); g.fill(); ell(g, 8.8, -10.2, 1.4, 1.1); g.fill();
    g.strokeStyle = OUT; g.lineWidth = 0.8; g.beginPath(); g.arc(4.4, -10.6, 1.3, 0.35, Math.PI - 0.35); g.stroke();
  });
}

function hatSprite() {
  // начало координат — середина полей
  return makeSprite(28, 14, 14, 11, (g) => {
    g.fillStyle = OUT; ell(g, 0, 0, 12.2, 4.2); g.fill();
    g.fillStyle = C.hat; ell(g, 0, -0.1, 11.2, 3.3); g.fill();
    g.fillStyle = OUT; g.beginPath(); g.roundRect(-6.7, -8.5, 13, 9.6, [5, 5, 1, 1]); g.fill();
    g.fillStyle = C.hat; g.beginPath(); g.roundRect(-5.9, -7.7, 11.4, 8.4, [4.5, 4.5, 1, 1]); g.fill();
    g.fillStyle = C.hatD; g.fillRect(1, -7, 4.3, 7.5);
    g.fillStyle = C.band; g.fillRect(-5.9, -2.1, 11.4, 2.4);
  });
}

// Удочка: рукоять в ладони, кончик — по +y на 26 единиц (там крепится леска)
export const ROD_TIP = 26;
function rodSprite() {
  return makeSprite(10, 36, 5, 6, (g) => {
    g.strokeStyle = OUT; g.lineWidth = 2.6; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, ROD_TIP); g.stroke();
    g.strokeStyle = '#c98b4a'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(0, -3.4); g.lineTo(0, ROD_TIP - 0.6); g.stroke();
    g.fillStyle = OUT; g.fillRect(-1.9, -4.6, 3.8, 7.4); g.fillStyle = '#7a4b28'; g.fillRect(-1.2, -4, 2.4, 6.2);
    g.fillStyle = OUT; ell(g, -2.6, 4.6, 2.2, 2.2); g.fill(); g.fillStyle = '#b8c0c6'; ell(g, -2.6, 4.6, 1.4, 1.4); g.fill();
    g.fillStyle = OUT; ell(g, 0, ROD_TIP, 1.1, 1.1); g.fill();
  });
}

function handSprite(fill) {
  return makeSprite(8, 8, 4, 4, (g) => {
    g.fillStyle = OUT; ell(g, 0, 0, 2.9, 2.7); g.fill();
    g.fillStyle = fill; ell(g, 0, 0, 2.1, 1.9); g.fill();
    g.fillStyle = C.light; ell(g, -0.7, -0.7, 0.7, 0.6); g.fill();
  });
}

export function makeGhostData() {
  const T = farmerParts();
  const att = (sprite, x = 0, y = 0, rotation = 0) => ({ sprite, x, y, rotation });
  const HY = 3.4; // где кисть на кости предплечья
  const bones = [
    { name: 'root' },
    { name: 'float', parent: 'root', y: -6 },          // высота парения
    { name: 'body', parent: 'float' },                  // низ тела: сжатие/растяжение отсюда
    { name: 'hat', parent: 'body', x: 0.5, y: TOP + 4, rotation: -6 },
    { name: 'armB', parent: 'body', x: 6.5, y: -10 },
    { name: 'foreB', parent: 'armB', y: 4 },
    { name: 'armF', parent: 'body', x: -6.5, y: -8 },
    { name: 'foreF', parent: 'armF', y: 4 },
  ];
  const slots = [
    { name: 'foreB', bone: 'foreB', attachment: 'hand' },
    { name: 'body', bone: 'body', attachment: 'b0' },
    { name: 'hat', bone: 'hat', attachment: 'hat' },
    { name: 'tool', bone: 'foreF', attachment: null },
    { name: 'foreF', bone: 'foreF', attachment: 'hand' },
  ];
  const tools = {
    axe: att(T.axe, 0, HY), pickaxe: att(T.pickaxe, 0, HY), hoe: att(T.hoe, 0, HY),
    can: att(T.can, 0, HY + 0.2), seedbag: att(T.seedbag, 0, HY), rod: att(rodSprite(), 0, HY),
  };
  const hand = handSprite(C.body), handFar = handSprite(C.shade), hat = hatSprite();
  const skins = {
    default: {
      foreB: { hand: att(handFar, 0, HY) }, foreF: { hand: att(hand, 0, HY) },
      body: { b0: att(bodySprite(0)), b1: att(bodySprite(1)), b2: att(bodySprite(2)) },
      hat: { hat: att(hat) }, tool: tools,
    },
    back: {
      foreB: { hand: att(hand, 0, HY) }, foreF: { hand: att(handFar, 0, HY) },
      body: { b0: att(bodySprite(0, true)), b1: att(bodySprite(1, true)), b2: att(bodySprite(2, true)) },
    },
  };
  const drawOrders = { back: ['tool', 'foreF', 'body', 'hat', 'foreB'] };

  // волна хвоста: кадры тела по кругу
  const tail = (dur, n) => { const k = []; for (let i = 0; i < n; i++) k.push([dur * i / n, 'b' + (i % 3)]); return k; };

  // Углы — от позы покоя; отрицательный угол поворачивает руку вперёд (по взгляду).
  const animations = {
    idle: {
      duration: 1.8,
      slots: { body: tail(1.8, 6) },
      bones: {
        float: { translate: [[0, 0, 0, 2], [0.9, 0, -2.4, 2], [1.8, 0, 0]] },
        body: { scale: [[0, 1.03, 0.97, 2], [0.9, 0.98, 1.03, 2], [1.8, 1.03, 0.97]] },
        hat: { rotate: [[0, 0, 2], [1, -4, 2], [1.8, 0]] },
        armF: { rotate: [[0, 24, 2], [1, 34, 2], [1.8, 24]] },
        armB: { rotate: [[0, -26, 2], [1, -38, 2], [1.8, -26]] },
      },
    },
    // Полёт: наклон вперёд, ручки отстают, хвост полощется быстрее
    walk: {
      duration: 0.56,
      slots: { body: tail(0.56, 3) },
      bones: {
        float: { translate: [[0, 0, -0.6, 2], [0.28, 0, -2, 2], [0.56, 0, -0.6]] },
        body: { rotate: [[0, 9]], scale: [[0, 1.04, 0.96, 2], [0.28, 0.97, 1.04, 2], [0.56, 1.04, 0.96]] },
        hat: { rotate: [[0, -8, 2], [0.28, -4, 2], [0.56, -8]] },
        armF: { rotate: [[0, 48, 2], [0.28, 60, 2], [0.56, 48]] },
        armB: { rotate: [[0, 20, 2], [0.28, 32, 2], [0.56, 20]] },
      },
    },
    // Замах: тянется вверх, в момент удара сплющивается.
    swing: {
      duration: 0.72,
      events: [[0.44, 'hit']],
      slots: { body: tail(0.72, 4) },
      bones: {
        float: { translate: [[0, 0, 0, 2], [0.3, 0, -2.5, 3], [0.44, 0, 2.5, 2], [0.72, 0, 0]] },
        body: {
          rotate: [[0, 2, 2], [0.3, -10, 3], [0.44, 12, 2], [0.72, 2]],
          scale: [[0, 1, 1, 2], [0.3, 0.9, 1.12, 3], [0.44, 1.16, 0.84, 4], [0.58, 0.97, 1.04, 2], [0.72, 1, 1]],
        },
        hat: { rotate: [[0, 0, 2], [0.3, 6, 3], [0.44, -10, 2], [0.72, 0]] },
        armF: { rotate: [[0, -40, 2], [0.3, -190, 3], [0.44, -75, 2], [0.72, -40]] },
        foreF: { rotate: [[0, -10, 2], [0.3, -20, 3], [0.44, 0, 2], [0.72, -10]] },
        armB: { rotate: [[0, -50, 2], [0.3, -180, 3], [0.44, -70, 2], [0.72, -50]] },
      },
    },
    water: {
      duration: 1.1,
      events: [[0.84, 'hit']],
      slots: { body: tail(1.1, 6) },
      bones: {
        float: { translate: [[0, 0, 0, 2], [0.25, 0, -1.5, 2], [0.85, 0, -1.5, 2], [1.1, 0, 0]] },
        body: {
          rotate: [[0, 0, 2], [0.25, 8, 2], [0.85, 8, 2], [1.1, 0]],
          scale: [[0, 1, 1, 2], [0.45, 1.05, 0.95, 2], [0.75, 1.05, 0.95, 2], [1.1, 1, 1]],
        },
        hat: { rotate: [[0, 0, 2], [0.45, -6, 2], [0.85, -6, 2], [1.1, 0]] },
        armF: { rotate: [[0, -30, 2], [0.25, -68, 2], [0.85, -68, 2], [1.1, -30]] },
        foreF: { rotate: [[0, 0, 2], [0.25, -6, 2], [0.45, 38, 2], [0.75, 38, 2], [0.9, -6, 2], [1.1, 0]] },
        armB: { rotate: [[0, -20, 2], [0.5, -30, 2], [1.1, -20]] },
      },
    },
    // Рыбалка: замах назад, заброс, ожидание (поплавок рисует Farm), подсечка — hit
    fish: {
      duration: 2.5,
      events: [[2.3, 'hit']],
      slots: { body: tail(2.5, 12) },
      bones: {
        float: { translate: [[0, 0, 0, 2], [0.2, 0, -2, 2], [0.42, 0, 1, 2], [0.6, 0, 0, 2], [1.3, 0, -1.2, 2], [2, 0, 0, 2], [2.12, 0, -3, 2], [2.5, 0, 0]] },
        body: {
          rotate: [[0, 0, 2], [0.2, -8, 2], [0.42, 10, 2], [0.7, 4, 2], [2, 4, 2], [2.12, -8, 2], [2.5, 0]],
          scale: [[0, 1, 1, 2], [0.2, 0.94, 1.08, 2], [0.42, 1.1, 0.9, 2], [0.65, 1, 1, 2], [2.12, 0.92, 1.1, 2], [2.3, 1.06, 0.95, 2], [2.5, 1, 1]],
        },
        hat: { rotate: [[0, 0, 2], [0.2, 8, 2], [0.42, -8, 2], [0.7, 0, 2], [2.12, 8, 2], [2.5, 0]] },
        armF: { rotate: [[0, -60, 2], [0.2, -200, 3], [0.42, -112, 2], [1.1, -116, 2], [1.7, -112, 2], [1.85, -104, 2], [2.12, -175, 2], [2.5, -120]] },
        foreF: { rotate: [[0, 0, 2], [0.2, -10, 2], [0.42, 6, 2], [2.12, -6, 2], [2.5, 0]] },
        armB: { rotate: [[0, -30, 2], [0.42, -60, 2], [2, -60, 2], [2.12, -150, 2], [2.5, -40]] },
      },
    },
    // Нырок к земле: посадка, сбор урожая, набрать воды
    pick: {
      duration: 0.75,
      events: [[0.36, 'hit']],
      slots: { body: tail(0.75, 4) },
      bones: {
        float: { translate: [[0, 0, 0, 2], [0.28, 0, 4.5, 2], [0.46, 0, 4.5, 2], [0.75, 0, 0]] },
        body: {
          rotate: [[0, 0, 2], [0.28, 18, 2], [0.46, 18, 2], [0.75, 0]],
          scale: [[0, 1, 1, 2], [0.2, 0.94, 1.08, 2], [0.36, 1.14, 0.86, 2], [0.5, 1.1, 0.9, 2], [0.75, 1, 1]],
        },
        hat: { rotate: [[0, 0, 2], [0.28, 8, 2], [0.5, -4, 2], [0.75, 0]] },
        armF: { rotate: [[0, 0, 2], [0.28, -60, 2], [0.46, -45, 2], [0.75, 0]] },
        foreF: { rotate: [[0, 0, 2], [0.28, -20, 2], [0.75, 0]] },
        armB: { rotate: [[0, -20, 2], [0.28, -55, 2], [0.75, -20]] },
      },
    },
    // Радость: подпрыгивает, вытягивается в воздухе, сплющивается при «приземлении»
    happy: {
      duration: 0.9,
      loop: false,
      slots: { body: tail(0.9, 6) },
      bones: {
        root: { translate: [[0, 0, 0, 4], [0.2, 0, -9, 3], [0.4, 0, 0], [0.5, 0, 0, 4], [0.64, 0, -4, 3], [0.8, 0, 0]] },
        body: {
          scale: [[0, 1.12, 0.88, 4], [0.12, 0.88, 1.14, 2], [0.32, 1, 1, 3], [0.42, 1.16, 0.84, 4],
            [0.56, 0.94, 1.07, 2], [0.72, 1.1, 0.9, 4], [0.9, 1, 1]],
        },
        hat: { rotate: [[0, 0, 2], [0.2, 12, 2], [0.42, -10, 2], [0.64, 6, 2], [0.9, 0]] },
        armF: { rotate: [[0, 0, 2], [0.2, 150, 2], [0.65, 140, 2], [0.9, 24]] },
        armB: { rotate: [[0, 0, 2], [0.2, -150, 2], [0.65, -140, 2], [0.9, -26]] },
      },
    },
  };
  return { bones, slots, skins, drawOrders, animations };
}
