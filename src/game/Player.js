// Персонаж: перемещение по пути, очередь действий, скелетная анимация.

import { Skeleton } from '../skeleton/Skeleton.js';
import { AnimationState } from '../skeleton/Animation.js';
import { toWorld } from '../engine/Iso.js';
import { findPath } from '../engine/Pathfinding.js';
import { N } from './World.js';
import { QUEUE_MAX, FLY } from './data.js';

const TOOL_ANIM = {
  chop: ['swing', 'axe'], mine: ['swing', 'pickaxe'], dig: ['swing', 'hoe'],
  water: ['water', 'can'], fish: ['fish', 'rod'], fill: ['pick', 'can'], plant: ['pick', 'seedbag'], harvest: ['pick', null],
  pick: ['pick', null], sow: ['pick', 'seedbag'], mow: ['pick', null],
};

export class Player {
  constructor(world, data, x, y) {
    this.world = world;
    this.x = x + 0.5; this.y = y + 0.5;
    this.path = [];
    this.queue = [];
    this.current = null;
    this.state = 'idle';
    this.speed = 3.4; // клеток в секунду
    this.flip = false; this.back = false;
    this.fly = 0; // 0 — идёт по земле, 1 — летит над препятствием (плавно между ними)
    this.sk = new Skeleton(data);
    this.anim = new AnimationState(this.sk, data.animations);
    this.anim.play('idle');
    this.anim.onEvent = (name) => { if (name === 'hit' && this.current && this.state === 'work') this.onHit(); };
    this.anim.onComplete = (name) => { if (name === 'happy') this.anim.play('idle'); };
    this.handlers = null; // { perform(action) → bool продолжать, fail(action, reason) }
    this.idleTime = 0;
  }

  get tx() { return Math.floor(this.x); }
  get ty() { return Math.floor(this.y); }
  get busy() { return this.state !== 'idle' || this.queue.length > 0; }
  // На сколько единиц мира поднят над землёй (полёт над деревом, камнем, водой)
  get lift() { return this.fly * FLY.lift; }

  // Можно ли через клетку и во сколько обойдётся шаг (Pathfinding): по свободной земле — 1, над
  // препятствием на открытой земле — FLY.cost (перелетает), закрытый участок и край карты — нельзя
  pass(x, y) {
    const w = this.world;
    return w.walkable(x, y) ? 1 : w.isOpen(x, y) ? FLY.cost : 0;
  }

  // То же дело (тот же вид действия, тот же объект или клетка), что уже делается или ждёт в очереди, или null
  find(action) {
    const key = actionKey(action);
    if (this.current && actionKey(this.current) === key) return this.current;
    return this.queue.find((a) => actionKey(a) === key) || null;
  }

  // Поставить дело в конец очереди. → 'ok' | 'dup' (такое уже есть) | 'full' (очередь заполнена, QUEUE_MAX)
  enqueue(action) {
    if (this.find(action)) return 'dup';
    if (this.queue.length >= QUEUE_MAX) return 'full';
    this.queue.push(action);
    return 'ok';
  }

  // Сколько дел у призрачка: текущее и в очереди (просто идёт куда-то — не дело)
  get tasks() {
    let n = this.current && this.current.kind !== 'walk' ? 1 : 0;
    for (const a of this.queue) if (a.kind !== 'walk') n++;
    return n;
  }

  // Действие, которое нужно выполнить перед текущим (например, набрать воды).
  pushFront(action) { this.queue.unshift(action); }

  // Отменить все дела, и текущее тоже: призрачок сразу останавливается (кнопка «Отменить всё»)
  clear() { this.queue.length = 0; this.current = null; this.path = []; this.state = 'idle'; this.sk.override.tool = null; this.anim.play('idle', { mix: 0.2 }); }

  celebrate() { if (this.state === 'idle') this.anim.play('happy', { restart: true, loop: false }); }

  // Цели, где можно встать для действия: соседние свободные клетки объекта/тайла (встаёт призрачок
  // только на свободную клетку, а долететь может до любой)
  goals(a) {
    if (a.kind === 'walk') return this.world.walkable(a.x, a.y) ? [[a.x, a.y]] : [];
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
    const path = findPath(N, N, (x, y) => this.pass(x, y), this.tx, this.ty, goals);
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
    if (this.handlers.started) this.handlers.started(a);
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
        // клетка могла закрыться (или там, где встать, теперь что-то стоит) — перестроить путь
        if (!this.pass(nx, ny) || (this.path.length === 1 && !this.world.walkable(nx, ny))) { const a = this.current; this.path = []; this.state = 'idle'; this.start(a); return; }
        const tx = nx + 0.5, ty = ny + 0.5;
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        this.face(dx, dy);
        if (d <= move) { this.x = tx; this.y = ty; this.path.shift(); move -= d; }
        else { this.x += dx / d * move; this.y += dy / d * move; move = 0; }
      }
      if (!this.path.length) this.arrive();
    }
    // в полёте — над препятствием сейчас или на двух следующих клетках пути (между деревьями не ныряет
    // вниз); приземляется плавно
    const w = this.world, P = this.path, blocked = (c) => c && !w.walkable(c[0], c[1]);
    const up = !w.walkable(this.tx, this.ty) || blocked(P[0]) || blocked(P[1]) ? 1 : 0;
    this.fly += (up - this.fly) * Math.min(1, dt * 7);
    if (Math.abs(up - this.fly) < 0.005) this.fly = up;
    this.idleTime = this.busy || this.anim.name !== 'idle' ? 0 : this.idleTime + dt;
    this.anim.update(dt);
    this.anim.apply();
  }

  worldPos(out) { return toWorld(this.x, this.y, out); }
}

export function actionKey(a) {
  return a.kind + ':' + (a.obj ? 'o' + a.obj.id : a.x + ',' + a.y);
}
