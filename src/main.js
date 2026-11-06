// Точка входа: собираем движок, сцену фермы, интерфейс и Telegram.

import { Perf } from './engine/Perf.js';
import { Game } from './engine/Game.js';
import { Renderer } from './engine/Renderer.js';
import { Camera } from './engine/Camera.js';
import { Input } from './engine/Input.js';
import { setSpriteScale } from './engine/Sprite.js';
import { TelegramBridge } from './telegram/TelegramBridge.js';
import { Save } from './game/Save.js';
import { Farm, BG } from './game/Farm.js';
import { createPixiApp, GLRenderer, PixiScene } from './game/PixiScene.js';
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
  // WebGL (PixiJS), если есть; ?renderer=2d — старая отрисовка Canvas 2D для сравнения
  const want2d = new URLSearchParams(location.search).get('renderer') === '2d';
  const app = want2d ? null : await createPixiApp(canvas, perf, BG);
  if (app) perf.keepScale = true;
  const renderer = app ? new GLRenderer(canvas, perf, app) : new Renderer(canvas, perf);
  const camera = new Camera();
  const ui = new UI(document.getElementById('app'));
  const save = new Save(tg);
  { const fl = save.flush.bind(save); save.flush = () => { const t = performance.now(); fl(); perf.mark('сохранение', performance.now() - t); }; }
  const fill = document.getElementById('ld-fill'), ltext = document.getElementById('ld-text');
  const progress = (k) => { fill.style.width = Math.round(k * 100) + '%'; ltext.textContent = k < 1 ? `Загрузка… ${Math.round(k * 100)}%` : 'Готово!'; };
  progress(0.05);
  const farm = new Farm({ renderer, camera, ui, tg, save, perf, audio });
  if (app) farm.scene = new PixiScene(farm, app);
  farm.onArtProgress = (k) => progress(0.1 + k * 0.85);
  window.__farm = farm; // для тестов в браузере
  ui.bind(farm, farm.icons);

  const fitZoom = () => {
    // mobile-first: на телефоне ~6.5 клеток по ширине, на больших экранах — крупнее, но не огромно
    const w = renderer.cssW, hgt = renderer.cssH;
    if (w > hgt && hgt < 500) return Math.min(1.7, Math.max(0.8, Math.min(w / (64 * 10), hgt / (32 * 8)))); // горизонтальный телефон
    return Math.min(1.7, Math.max(0.8, Math.min(w / (64 * 6.5), hgt / (32 * 13))));
  };
  const resize = () => {
    renderer.resize();
    input.updateRect();
    camera.setViewport(renderer.cssW, renderer.cssH);
    const big = Math.min(renderer.cssW, renderer.cssH) > 600;
    camera.minZoom = big ? 0.6 : 0.5;
    camera.maxZoom = 2.6;
    // телефон повернули: подбираем масштаб под новую форму экрана
    const land = renderer.cssW > renderer.cssH;
    if (lastLand !== null && land !== lastLand) camera.zoom = fitZoom();
    lastLand = land;
  };
  let lastLand = null;
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
  game.render = () => farm.render();
  game.isIdle = () => farm.isIdle() && input.pointers.size === 0;
  game.onPause = () => save.flush();
  window.addEventListener('pagehide', () => save.flush());
  game.start();

  // ждём картинки (но не дольше 15 с: на плохой связи игра откроется с графикой из кода)
  await Promise.race([farm.artReady, new Promise((r) => setTimeout(r, 15000))]);
  if (farm.scene) { try { farm.scene.warmup(); } catch (e) { console.warn('warmup', e); } }
  perf.restart();
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
      const now = (performance.now() - perf._t0) / 1000;
      const sp = perf.spikes.map((x) => `${x.ms.toFixed(0)} мс ${Math.round(now - x.at)} с назад: ${x.tags}`).join('\n');
      fpsEl.textContent = `${perf.fps.toFixed(0)} fps · кадр ${perf.frameMs.toFixed(1)} мс (макс ${perf.frameMax.toFixed(0)})` +
        ` · ${app ? 'WebGL' : '2D'} · ${perf.tier} · x${perf.renderScale}/${devicePixelRatio.toFixed(2)} · цель ${perf.targetFps}${perf.idle ? " · покой" : ""}` + (sp ? `\nфризы:\n${sp}` : '');
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
