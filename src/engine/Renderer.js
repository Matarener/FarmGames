// Окно вывода: размер холста в CSS-пикселях, плотность пикселей (renderScale) и видимая
// часть мира для отсечения. Рисует PixiScene (WebGL) — здесь только размеры и камера.

export class Renderer {
  // app — приложение PixiJS (createPixiApp в PixiScene.js)
  constructor(canvas, perf, app) {
    this.canvas = canvas; this.perf = perf; this.app = app;
    this.cssW = 1; this.cssH = 1;
    this.scale = 1; // пикселей экрана на CSS-пиксель
    this.view = { minX: 0, minY: 0, maxX: 0, maxY: 0 }; // видимая область в мировых координатах
  }

  // Холст поменял размер (поворот телефона, окно браузера) или сменилось качество графики
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.scale = this.perf.renderScale;
    const R = this.app.renderer;
    if (R.resolution !== this.scale) R.resolution = this.scale;
    R.resize(this.cssW, this.cssH);
    this.canvas.style.width = ''; this.canvas.style.height = ''; // размер задаёт CSS
  }

  // Начало кадра: видимая область мира для этой камеры
  begin(cam) {
    const v = this.view, hw = this.cssW / 2 / cam.zoom, hh = this.cssH / 2 / cam.zoom;
    v.minX = cam.x - hw; v.maxX = cam.x + hw;
    v.minY = cam.y - hh; v.maxY = cam.y + hh;
  }

  // Пересекается ли прямоугольник мира (x, y, w, h) с экраном
  visible(x, y, w, h) {
    const v = this.view;
    return x < v.maxX && x + w > v.minX && y < v.maxY && y + h > v.minY;
  }
}
