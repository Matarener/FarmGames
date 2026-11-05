// Точка входа: собираем движок, сцену фермы, интерфейс и Telegram.

import { Perf } from './engine/Perf.js';
import { Game } from './engine/Game.js';
import { Renderer } from './engine/Renderer.js';
import { Camera } from './engine/Camera.js';
import { Input } from './engine/Input.js';
import { setSpriteScale } from './engine/Sprite.js';
import { TelegramBridge } from './telegram/TelegramBridge.js';
import { Save } from './game/Save.js';
import { Farm } from './game/Farm.js';
import { UI } from './ui/UI.js';
import { Audio } from './engine/Audio.js';

async function main() {
  const tg = new TelegramBridge();
  tg.init();
  // звук (настройки в окне «Настройки»)
  const audio = new Audio();
  audio.setTheme('menu');
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  const perf = new Perf();
  setSpriteScale(perf.spriteScale);

  const canvas = document.getElementById('game');
  const renderer = new Renderer(canvas, perf);
  const camera = new Camera();
  const ui = new UI(document.getElementById('app'));
  const save = new Save(tg);
  const fill = document.getElementById('ld-fill'), ltext = document.getElementById('ld-text');
  const progress = (k) => { fill.style.width = Math.round(k * 100) + '%'; ltext.textContent = k < 1 ? `Загрузка… ${Math.round(k * 100)}%` : 'Готово!'; };
  progress(0.05);
  const farm = new Farm({ renderer, camera, ui, tg, save, perf, audio });
  farm.onArtProgress = (k) => progress(0.1 + k * 0.85);
  window.__farm = farm; // для тестов в браузере
  ui.bind(farm, farm.icons);

  const fitZoom = () => {
    // mobile-first: на телефоне ~6.5 клеток по ширине, на больших экранах крупнее, но не огромно
    const w = renderer.cssW, hgt = renderer.cssH, cap = Math.min(w, hgt) > 600 ? 1.3 : 1.7;
    const z = w > hgt ? Math.min(w / (64 * 10), hgt / (32 * 8)) : Math.min(w / (64 * 6.5), hgt / (32 * 13));
    return Math.min(cap, Math.max(0.8, z));
  };
  // При любом изменении размера окна (поворот, растягивание) масштаб пересчитывается,
  // а приближение, выбранное игроком щипком, сохраняется относительно подобранного.
  let fit = 0;
  const resize = () => {
    renderer.resize();
    input.updateRect();
    camera.setViewport(renderer.cssW, renderer.cssH);
    const big = Math.min(renderer.cssW, renderer.cssH) > 600;
    camera.minZoom = big ? 0.6 : 0.5;
    camera.maxZoom = 2.6;
    const f = fitZoom();
    if (fit && Math.abs(f - fit) > 1e-4) { camera.zoom = Math.min(camera.maxZoom, Math.max(camera.minZoom, camera.zoom * f / fit)); camera.clamp(); camera.moved = true; }
    fit = f;
  };
  perf.onScaleChange = () => renderer.resize();

  const input = new Input(canvas, {
    onDown: () => { camera.vx = camera.vy = 0; },
    onPanStart: () => { camera.dragging = true; ui.closePopup(); },
    onPan: (dx, dy) => camera.panBy(dx, dy),
    onPanEnd: (vx, vy) => { camera.dragging = false; camera.fling(vx, vy); },
    onZoom: (k, x, y) => { camera.zoomAt(k, x, y); ui.closePopup(); },
    onTap: (x, y) => farm.onTap(x, y),
    onHover: (x, y) => farm.onHover(x, y),
  });

  new ResizeObserver(resize).observe(canvas);
  // запасной путь: эмулятор DevTools, поворот в Telegram и т.п. иногда не присылают ResizeObserver
  window.addEventListener('resize', resize);
  window.visualViewport && window.visualViewport.addEventListener('resize', resize);
  resize();
  camera.zoom = fitZoom();

  const saved = await save.load();
  farm.init(saved);
  if (saved && farm.awaySec > 60) ui.toast(`С возвращением! Вас не было ${Math.round(farm.awaySec / 60)} мин, растения подросли.`);
  else if (!saved) ui.toast('Добро пожаловать на ферму! Нажмите на дерево или камень, чтобы добыть ресурсы.');

  const game = new Game(perf);
  game.update = (dt) => {
    const ax = input.keyAxis();
    if (ax.x || ax.y) camera.panBy(-ax.x * 600 * dt, -ax.y * 600 * dt);
    camera.update(dt);
    farm.update(dt);
  };
  game.render = () => {
    // размер канваса разошёлся с экраном — подстроиться до отрисовки (иначе картинка сплющена)
    if (canvas.clientWidth !== Math.round(renderer.cssW) || canvas.clientHeight !== Math.round(renderer.cssH)) resize();
    farm.render();
  };
  game.isIdle = () => farm.isIdle() && input.pointers.size === 0;
  game.onPause = () => save.flush();
  window.addEventListener('pagehide', () => save.flush());
  game.start();

  // ждём картинки (но не дольше 15 с: на плохой связи игра откроется с графикой из кода)
  await Promise.race([farm.artReady, new Promise((r) => setTimeout(r, 15000))]);
  progress(0.97);
  await new Promise((r) => setTimeout(r, 0)); // дать экрану загрузки обновиться
  farm.warmup();
  progress(1);
  setTimeout(() => { document.getElementById('loading').classList.add('hide'); if (!ui.panelOpen) audio.setTheme('farm'); }, 150);
  // начало истории: новое задание показываем сразу
  if (farm.quests.current && !farm.quests.st.seen) setTimeout(() => ui.questPanel(farm), 700);
  // Счётчик FPS и времени кадра: включается в настройках (или ?debug в адресе)
  let fpsEl = null, fpsTimer = 0;
  const debug = new URLSearchParams(location.search).has('debug');
  const showFps = (on) => {
    if (!on) { if (fpsEl) fpsEl.remove(); fpsEl = null; clearInterval(fpsTimer); return; }
    if (fpsEl) return;
    fpsEl = document.createElement('div');
    fpsEl.className = 'debug';
    document.body.appendChild(fpsEl);
    const paint = () => {
      fpsEl.textContent = `${perf.fps.toFixed(0)} fps · кадр ${perf.frameMs.toFixed(1)} мс (макс ${perf.frameMax.toFixed(0)})` +
        (debug ? ` · ${perf.tier} · x${perf.renderScale} · квадратов ${farm.tiles ? farm.tiles.map.size : 0}, нарисовано ${farm.stats.layers}` : '');
    };
    paint(); fpsTimer = setInterval(paint, 500);
  };
  perf.onShowFps = showFps;
  showFps(perf.showFps || debug);
  window.__farm = farm;
}

main().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Ошибка загрузки: ' + e.message;
});
