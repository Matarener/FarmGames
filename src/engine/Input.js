// Ввод: тап, перетаскивание с инерцией, щипок, колесо мыши, наведение, клавиатура.
// Работает одинаково для пальца, мыши и стилуса через Pointer Events.

export class Input {
  constructor(el, h) {
    this.el = el;
    this.h = h;
    this.pointers = new Map();
    this.tap = null;
    this.dragging = false;
    this.pinch = null;
    this.vx = 0; this.vy = 0; this.lastMoveT = 0;
    this.rect = el.getBoundingClientRect();
    this.keys = new Set();

    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e, true));
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') h.onHover && h.onHover(-1, -1); });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this._pos(e);
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      h.onZoom && h.onZoom(Math.exp(-d * 0.0015), p.x, p.y);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => { if (!e.target.closest('input,textarea')) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  updateRect() { this.rect = this.el.getBoundingClientRect(); }

  _pos(e) { return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top }; }

  _down(e) {
    this.el.setPointerCapture && this.el.setPointerCapture(e.pointerId);
    const p = this._pos(e);
    this.pointers.set(e.pointerId, p);
    this.h.onDown && this.h.onDown();
    if (this.pointers.size === 1) {
      this.tap = { x: p.x, y: p.y, t: performance.now() };
      this.dragging = false;
      this.vx = this.vy = 0;
      this.lastMoveT = performance.now();
    } else if (this.pointers.size === 2) {
      this.tap = null;
      this.pinch = this._pinchState();
      this.dragging = true;
      this.h.onPanStart && this.h.onPanStart();
    }
  }

  _pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    const np = this._pos(e);
    if (!p) {
      if (e.pointerType === 'mouse') this.h.onHover && this.h.onHover(np.x, np.y);
      return;
    }
    const dx = np.x - p.x, dy = np.y - p.y;
    p.x = np.x; p.y = np.y;

    if (this.pointers.size === 1) {
      if (this.tap && Math.hypot(np.x - this.tap.x, np.y - this.tap.y) > 9) {
        this.tap = null;
        this.dragging = true;
        this.h.onPanStart && this.h.onPanStart();
      }
      if (this.dragging) {
        const now = performance.now();
        const dt = Math.max(1, now - this.lastMoveT) / 1000;
        this.lastMoveT = now;
        this.vx = this.vx * 0.6 + (dx / dt) * 0.4;
        this.vy = this.vy * 0.6 + (dy / dt) * 0.4;
        this.h.onPan && this.h.onPan(dx, dy);
      }
    } else if (this.pointers.size >= 2 && this.pinch) {
      const s = this._pinchState();
      this.h.onZoom && this.h.onZoom(s.d / this.pinch.d, s.x, s.y);
      this.h.onPan && this.h.onPan(s.x - this.pinch.x, s.y - this.pinch.y);
      this.pinch = s;
    }
  }

  _up(e, cancelled) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      if (!cancelled && this.tap && performance.now() - this.tap.t < 600) {
        this.h.onTap && this.h.onTap(this.tap.x, this.tap.y, e.pointerType);
      } else if (this.dragging) {
        const stale = performance.now() - this.lastMoveT > 80;
        this.h.onPanEnd && this.h.onPanEnd(stale ? 0 : this.vx, stale ? 0 : this.vy);
      }
      this.tap = null; this.dragging = false; this.pinch = null;
    } else if (this.pointers.size === 1) {
      this.pinch = null; // продолжаем панораму оставшимся пальцем
      this.lastMoveT = performance.now();
      this.vx = this.vy = 0;
    } else {
      this.pinch = this._pinchState();
    }
  }

  // Панорама клавиатурой (ПК): WASD / стрелки. Возвращает {x,y} в -1..1
  keyAxis() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    return { x, y };
  }
}
