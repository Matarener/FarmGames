// A* по сетке, 8 направлений без срезания углов. Несколько целей сразу
// (например, любая клетка рядом с деревом). Типизированные массивы и
// бинарная куча — быстро даже на слабых устройствах.
// pass(x, y) — можно ли через клетку: false/0 — нельзя, true/1 — обычный шаг, число > 1 — шаг
// во столько раз дороже (призрак перелетает через дерево, но обходит его, если обход недлинный).

const SQ2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

let cap = 0, g, came, state, heap, heapF;

function ensure(n) {
  if (n <= cap) return;
  cap = n;
  g = new Float32Array(n);
  came = new Int32Array(n);
  state = new Uint8Array(n); // 0 — не видели, 1 — открыта, 2 — закрыта
  heap = new Int32Array(n * 2);
  heapF = new Float32Array(n * 2);
}

export function findPath(w, h, pass, sx, sy, goals, maxNodes = 6000) {
  if (!goals.length) return null;
  const n = w * h;
  ensure(n);
  state.fill(0);
  const goalSet = new Set();
  for (const [x, y] of goals) goalSet.add(y * w + x);
  const start = sy * w + sx;
  if (goalSet.has(start)) return [];

  const hFn = (x, y) => {
    let best = Infinity;
    for (let i = 0; i < goals.length; i++) {
      const dx = Math.abs(goals[i][0] - x), dy = Math.abs(goals[i][1] - y);
      const v = dx + dy + (SQ2 - 2) * Math.min(dx, dy);
      if (v < best) best = v;
    }
    return best;
  };

  let size = 0;
  const push = (i, f) => {
    let k = size++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapF[p] <= f) break;
      heap[k] = heap[p]; heapF[k] = heapF[p]; k = p;
    }
    heap[k] = i; heapF[k] = f;
  };
  const pop = () => {
    const top = heap[0];
    const li = heap[--size], lf = heapF[size];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= size) break;
      if (c + 1 < size && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= lf) break;
      heap[k] = heap[c]; heapF[k] = heapF[c]; k = c;
    }
    heap[k] = li; heapF[k] = lf;
    return top;
  };

  g[start] = 0; came[start] = -1; state[start] = 1;
  push(start, hFn(sx, sy));
  let visited = 0;

  while (size > 0) {
    const cur = pop();
    if (state[cur] === 2) continue;
    state[cur] = 2;
    if (goalSet.has(cur)) {
      const path = [];
      for (let c = cur; c !== start; c = came[c]) path.push([c % w, (c / w) | 0]);
      return path.reverse();
    }
    if (++visited > maxNodes) return null;
    const cx = cur % w, cy = (cur / w) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (state[ni] === 2) continue;
      const k = +pass(nx, ny);
      if (!k) continue;
      if (d >= 4 && (!pass(cx + DIRS[d][0], cy) || !pass(cx, cy + DIRS[d][1]))) continue;
      const ng = g[cur] + DIRS[d][2] * k;
      if (state[ni] === 1 && ng >= g[ni]) continue;
      g[ni] = ng; came[ni] = cur; state[ni] = 1;
      push(ni, ng + hFn(nx, ny));
    }
  }
  return null;
}
