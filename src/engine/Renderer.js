// Canvas 2D рендерер. Отвечает за размер канваса с учётом DPR,
// матрицу вида камеры и отсечение невидимого.

export class Renderer {
  constructor(canvas, perf) {
    this.canvas = canvas;
    this.perf = perf;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cssW = 1; this.cssH = 1; this.scale = 1;
    // Матрица вида: экран = мир * va + (ve, vf)
    this.va = 1; this.ve = 0; this.vf = 0;
    this.view = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.scale = this.perf.renderScale;
    const w = Math.round(this.cssW * this.scale);
    const h = Math.round(this.cssH * this.scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = this.perf.tier === 'low' ? 'low' : this.perf.tier === 'mid' ? 'medium' : 'high';
  }

  begin(cam, bg) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    const s = this.scale * cam.zoom;
    this.va = s;
    this.ve = Math.round((this.cssW / 2 - cam.x * cam.zoom) * this.scale); // целые пиксели: слои ложатся без сдвига
    this.vf = Math.round((this.cssH / 2 - cam.y * cam.zoom) * this.scale);
    ctx.setTransform(s, 0, 0, s, this.ve, this.vf);
    const v = this.view;
    v.minX = cam.x - this.cssW / 2 / cam.zoom;
    v.maxX = cam.x + this.cssW / 2 / cam.zoom;
    v.minY = cam.y - this.cssH / 2 / cam.zoom;
    v.maxY = cam.y + this.cssH / 2 / cam.zoom;
  }

  resetView() { this.ctx.setTransform(this.va, 0, 0, this.va, this.ve, this.vf); }

  visible(x, y, w, h) {
    const v = this.view;
    return x < v.maxX && x + w > v.minX && y < v.maxY && y + h > v.minY;
  }

  // Спрайт: {canvas, w, h, ax, ay} — w/h в мировых единицах, (ax, ay) — точка опоры.
  sprite(s, x, y) {
    this.ctx.drawImage(s.canvas, x - s.ax, y - s.ay, s.w, s.h);
  }
}
