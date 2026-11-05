// Походка через IK и вторая рука на рукояти. Общий код для игры и редактора.
// Стопа стоит на земле, пока тело проходит над ней, затем переносится вперёд
// по дуге. Шаг привязан к пройденному расстоянию, поэтому ноги не скользят.

export const STRIDE = 22;     // длина цикла из двух шагов, единицы мира
export const LIFT = 3.2;      // высота подъёма стопы
const smooth = (t) => t * t * (3 - 2 * t);

export function makeGait() { return { phase: 0, amt: 0, ux: 1, uy: 0, px: null, py: 0 }; }

// wx, wy — позиция на экране (мировые единицы); walking — персонаж в состоянии ходьбы.
// Возвращает true, если в этом кадре было движение.
export function advanceGait(g, wx, wy, walking, dt, anim) {
  const mdx = g.px === null ? 0 : wx - g.px, mdy = g.px === null ? 0 : wy - g.py;
  g.px = wx; g.py = wy;
  const md = Math.hypot(mdx, mdy);
  const moving = walking && md > 1e-4;
  if (moving) {
    g.phase = (g.phase + md / STRIDE) % 1;
    g.ux += (mdx / md - g.ux) * 0.5; g.uy += (mdy / md - g.uy) * 0.5;
    // ритм корпуса и рук — по фазе шага
    if (anim && anim.name === 'walk' && anim.cur) anim.time = g.phase * anim.cur.duration;
  }
  g.amt += ((walking ? 1 : 0) - g.amt) * Math.min(1, dt * 10);
  return moving;
}

// opts: { legs, grip2, flip, squat, twoHand, dt, legsIK = true, armIK = true }
export function solveRig(sk, g, opts) {
  const ik = sk.ikMap, L = opts.legs;
  if (!ik) return;
  if (L && ik.legF && opts.legsIK !== false) {
    const ux = opts.flip ? -g.ux : g.ux, uy = g.uy;
    const n = Math.hypot(ux, uy) || 1;
    // при приседании колени разводим в стороны, при ходьбе — вперёд
    for (const [name, baseX, off, out] of [['legF', -L.hipX, 0, 1], ['legB', L.hipX, 0.5, -1]]) {
      const k = ik[name];
      k.bend = opts.squat ? out : 1;
      const ph = (g.phase + off) % 1;
      let o, h = 0;
      if (ph < 0.5) o = STRIDE / 4 - ph * STRIDE;                  // опора: стопа стоит
      else { const t = (ph - 0.5) * 2; o = -STRIDE / 4 + smooth(t) * STRIDE / 2; h = Math.sin(Math.PI * t) * LIFT; }
      k.x = baseX + (ux / n) * o * g.amt * 0.9;
      k.y = (uy / n) * o * g.amt * 0.5 - h * g.amt;
      k.mix = 1;
    }
  } else if (ik.legF) { ik.legF.mix = 0; ik.legB.mix = 0; }
  const arm = ik.armB;
  if (arm) {
    const want = opts.twoHand && opts.armIK !== false ? 1 : 0;
    arm.mix += (want - arm.mix) * Math.min(1, opts.dt * 14);
    if (arm.mix < 0.01) arm.mix = 0;
    if (opts.instant) arm.mix = want;
    if (arm.mix) {
      const f = sk.boneMap.foreF, root = sk.bones[0];
      arm.x = f.c * opts.grip2 + f.tx - root.tx;
      arm.y = f.d * opts.grip2 + f.ty - root.ty;
    }
  }
  sk.solveIK();
}
