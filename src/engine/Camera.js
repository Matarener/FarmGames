// Камера: позиция центра в мировых координатах, зум, инерция, границы.
export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.zoom = 1;
    this.minZoom = 0.45; this.maxZoom = 2.6;
    this.viewW = 1; this.viewH = 1;
    this.bounds = null; // {minX,maxX,minY,maxY}
    this.vx = 0; this.vy = 0;
    this.dragging = false;
  }

  setViewport(w, h) { this.viewW = w; this.viewH = h; this.clamp(); }

  screenToWorld(sx, sy, out) {
    out.x = (sx - this.viewW / 2) / this.zoom + this.x;
    out.y = (sy - this.viewH / 2) / this.zoom + this.y;
    return out;
  }

  worldToScreen(wx, wy, out) {
    out.x = (wx - this.x) * this.zoom + this.viewW / 2;
    out.y = (wy - this.y) * this.zoom + this.viewH / 2;
    return out;
  }

  panBy(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  zoomAt(factor, sx, sy) {
    const z = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    if (z === this.zoom) return;
    const bx = (sx - this.viewW / 2) / this.zoom + this.x;
    const by = (sy - this.viewH / 2) / this.zoom + this.y;
    this.zoom = z;
    this.x = bx - (sx - this.viewW / 2) / z;
    this.y = by - (sy - this.viewH / 2) / z;
    this.clamp();
  }

  fling(vx, vy) { this.vx = vx; this.vy = vy; }

  centerOn(wx, wy) { this.x = wx; this.y = wy; this.clamp(); }

  clamp() {
    const b = this.bounds;
    if (!b) return;
    this.x = Math.min(b.maxX, Math.max(b.minX, this.x));
    this.y = Math.min(b.maxY, Math.max(b.minY, this.y));
  }

  update(dt) {
    if (this.dragging) return;
    if (Math.abs(this.vx) + Math.abs(this.vy) < 5) { this.vx = this.vy = 0; return; }
    this.panBy(this.vx * dt, this.vy * dt);
    const k = Math.exp(-5 * dt);
    this.vx *= k; this.vy *= k;
  }

  get animating() { return this.vx !== 0 || this.vy !== 0; }
}
