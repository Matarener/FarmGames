// Персонаж: перемещение по пути, очередь действий, скелетная анимация.

import { Skeleton } from '../skeleton/Skeleton.js';
import { AnimationState } from '../skeleton/Animation.js';
import { toWorld } from '../engine/Iso.js';
import { findPath } from '../engine/Pathfinding.js';
import { N } from './World.js';

const TOOL_ANIM = {
  chop: ['swing', 'axe'], mine: ['swing', 'pickaxe'], dig: ['swing', 'hoe'],
  water: ['water', 'can'], fill: ['pick', 'can'], plant: ['pick', 'seedbag'], harvest: ['pick', null],
};
const MAX_QUEUE = 6;
const tmp = { x: 0, y: 0 };
const TWO_HANDED = { axe: 1, pickaxe: 1, hoe: 1 };

// Походка через IK: стопа стоит на земле, пока тело проходит над ней,
// затем переносится вперёд по дуге. Шаг привязан к пройденному расстоянию,
// поэтому ноги не проскальзывают при любой скорости.
const STRIDE = 22;     // длина цикла из двух шагов, единицы мира
const LIFT = 3.2;      // высота подъёма стопы
const smooth = (t) => t * t * (3 - 2 * t);

export class Player {
  constructor(world, data, x, y) {
    this.world = world;
    this.x = x + 0.5; this.y = y + 0.5;
    this.path = [];
    this.queue = [];
    this.current = null;
    this.state = 'idle';
    this.speed = 2.6; // клеток в секунду
    this.flip = false; this.back = false;
    this.sk = new Skeleton(data);
    this.anim = new AnimationState(this.sk, data.animations);
    this.anim.play('idle');
    this.anim.onEvent = (name) => { if (name === 'hit' && this.current && this.state === 'work') this.onHit(); };
    this.anim.onComplete = (name) => { if (name === 'happy') this.anim.play('idle'); };
    this.handlers = null; // { perform(action) → bool продолжать, fail(action, reason) }
    this.idleTime = 0;
    this.gait = { phase: 0, amt: 0, ux: 1, uy: 0, px: null, py: 0 };
    this.legs = data.legs || null;  // { hipX, len } — опоры стоп для IK
    this.grip2 = data.grip2 || 0;   // где на рукояти вторая рука (вдоль предплечья)
  }

  get tx() { return Math.floor(this.x); }
  get ty() { return Math.floor(this.y); }
  get busy() { return this.state !== 'idle' || this.queue.length > 0; }

  enqueue(action) {
    if (this.queue.length >= MAX_QUEUE) return false;
    const key = actionKey(action);
    if ((this.current && actionKey(this.current) === key) || this.queue.some((a) => actionKey(a) === key)) return false;
    this.queue.push(action);
    return true;
  }

  // Действие, которое нужно выполнить перед текущим (например, набрать воды).
  pushFront(action) { this.queue.unshift(action); }

  clear() { this.queue.length = 0; this.current = null; this.path = []; this.state = 'idle'; this.sk.override.tool = null; this.anim.play('idle'); }

  celebrate() { if (this.state === 'idle') this.anim.play('happy', { restart: true, loop: false }); }

  // Цели, где можно встать для действия: соседние клетки объекта/тайла
  goals(a) {
    if (a.kind === 'walk') return [[a.x, a.y]];
    const x0 = a.obj ? a.obj.gx : a.x, y0 = a.obj ? a.obj.gy : a.y;
    const w = a.obj ? a.obj.w : 1, h = a.obj ? a.obj.h : 1;
    const out = [];
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
      if (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h) continue;
      if (this.world.walkable(x, y)) out.push([x, y]);
    }
    return out;
  }

  start(a) {
    this.current = a;
    const goals = this.goals(a);
    const path = findPath(N, N, (x, y) => this.world.walkable(x, y), this.tx, this.ty, goals);
    if (!path) { this.handlers.fail(a, 'path'); this.current = null; return; }
    this.path = path;
    if (path.length) { this.state = 'walk'; this.sk.override.tool = null; this.anim.play('walk'); }
    else this.arrive();
  }

  arrive() {
    const a = this.current;
    if (a.kind === 'walk') { this.current = null; this.state = 'idle'; this.anim.play('idle'); return; }
    if (!this.handlers.canStart(a)) { this.current = null; this.state = 'idle'; this.anim.play('idle'); return; }
    // повернуться к цели
    const cx = a.obj ? a.obj.gx + a.obj.w / 2 : a.x + 0.5, cy = a.obj ? a.obj.gy + a.obj.h / 2 : a.y + 0.5;
    this.face(cx - this.x, cy - this.y);
    const [anim, tool] = TOOL_ANIM[a.kind];
    this.sk.override.tool = tool;
    this.state = 'work';
    this.anim.play(anim, { restart: true, mix: 0.12 });
  }

  onHit() {
    const go = this.handlers.perform(this.current);
    if (!go) {
      this.current = null;
      this.state = 'idle';
      this.sk.override.tool = null;
      this.anim.play('idle', { mix: 0.2 });
    }
  }

  // Направление в координатах сетки → ракурс и отражение на экране
  face(dgx, dgy) {
    const sx = dgx - dgy, sy = dgx + dgy; // экранный вектор (масштаб не важен)
    if (Math.abs(sx) > 0.01) this.flip = sx < 0;
    if (Math.abs(sy) > 0.01) this.back = sy < 0;
    this.sk.setSkin(this.back ? 'back' : 'default');
  }

  update(dt) {
    if (this.state === 'idle' && this.queue.length) this.start(this.queue.shift());
    if (this.state === 'walk') {
      let move = this.speed * dt;
      while (move > 0 && this.path.length) {
        const [nx, ny] = this.path[0];
        // клетка могла стать непроходимой — перестроить путь
        if (!this.world.walkable(nx, ny)) { const a = this.current; this.path = []; this.state = 'idle'; this.start(a); return; }
        const tx = nx + 0.5, ty = ny + 0.5;
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        this.face(dx, dy);
        if (d <= move) { this.x = tx; this.y = ty; this.path.shift(); move -= d; }
        else { this.x += dx / d * move; this.y += dy / d * move; move = 0; }
      }
      if (!this.path.length) this.arrive();
    }
    this.idleTime = this.busy || this.anim.name !== 'idle' ? 0 : this.idleTime + dt;
    this.anim.update(dt);
    const g = this.gait;
    toWorld(this.x, this.y, tmp);
    const mdx = g.px === null ? 0 : tmp.x - g.px, mdy = tmp.y - g.py;
    g.px = tmp.x; g.py = tmp.y;
    const md = Math.hypot(mdx, mdy);
    const walking = this.state === 'walk' && md > 1e-4;
    if (walking) {
      g.phase = (g.phase + md / STRIDE) % 1;
      g.ux += (mdx / md - g.ux) * 0.5; g.uy += (mdy / md - g.uy) * 0.5;
      // ритм корпуса и рук — по фазе шага
      if (this.anim.name === 'walk') this.anim.time = g.phase * this.anim.cur.duration;
    }
    g.amt += ((walking || this.state === 'walk' ? 1 : 0) - g.amt) * Math.min(1, dt * 10);
    this.anim.apply();
    this.solveIK(dt);
  }

  solveIK(dt) {
    const sk = this.sk, ik = sk.ikMap, L = this.legs;
    if (!L || !ik.legF) return;
    const g = this.gait;
    const ux = this.flip ? -g.ux : g.ux, uy = g.uy;
    const n = Math.hypot(ux, uy) || 1;
    // при приседании колени разводим в стороны, при ходьбе — вперёд
    const squat = this.anim.name === 'pick';
    for (const [name, baseX, off, out] of [['legF', -L.hipX, 0, 1], ['legB', L.hipX, 0.5, -1]]) {
      const k = ik[name];
      k.bend = squat ? out : 1;
      const ph = (g.phase + off) % 1;
      let o, h = 0;
      if (ph < 0.5) o = STRIDE / 4 - ph * STRIDE;                  // опора: стопа стоит
      else { const t = (ph - 0.5) * 2; o = -STRIDE / 4 + smooth(t) * STRIDE / 2; h = Math.sin(Math.PI * t) * LIFT; }
      k.x = baseX + (ux / n) * o * g.amt * 0.9;
      k.y = (uy / n) * o * g.amt * 0.5 - h * g.amt;
      k.mix = 1;
    }
    // вторая рука на рукояти двуручного инструмента
    const arm = ik.armB;
    if (arm) {
      const want = this.state === 'work' && TWO_HANDED[sk.override.tool] && this.anim.name === 'swing' ? 1 : 0;
      arm.mix += (want - arm.mix) * Math.min(1, dt * 14);
      if (arm.mix < 0.01) arm.mix = 0;
      if (arm.mix) {
        const f = sk.boneMap.foreF, root = sk.bones[0];
        arm.x = f.c * this.grip2 + f.tx - root.tx;
        arm.y = f.d * this.grip2 + f.ty - root.ty;
      }
    }
    sk.solveIK();
  }

  worldPos(out) { return toWorld(this.x, this.y, out); }

  draw(r) {
    toWorld(this.x, this.y, tmp);
    const ctx = r.ctx;
    ctx.fillStyle = 'rgba(20,40,10,0.22)';
    ctx.beginPath(); ctx.ellipse(tmp.x, tmp.y, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    this.sk.draw(ctx, r, tmp.x, tmp.y, 1, this.flip);
  }
}

export function actionKey(a) {
  return a.kind + ':' + (a.obj ? 'o' + a.obj.id : a.x + ',' + a.y);
}
