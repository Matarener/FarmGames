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
  // звук и вибрация (настройки в окне «Настройки»)
  const audio = new Audio();
  const haptic = tg.haptic.bind(tg);
  tg.haptic = (k) => { if (audio.s.vibro) haptic(k); };
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
    // mobile-first: на телефоне ~6.5 клеток по ширине, на больших экранах — крупнее, но не огромно
    const w = renderer.cssW, hgt = renderer.cssH;
    return Math.min(1.7, Math.max(0.8, Math.min(w / (64 * 6.5), hgt / (32 * 13))));
  };
  const resize = () => {
    renderer.resize();
    input.updateRect();
    camera.setViewport(renderer.cssW, renderer.cssH);
    const big = Math.min(renderer.cssW, renderer.cssH) > 600;
    camera.minZoom = big ? 0.6 : 0.5;
    camera.maxZoom = 2.6;
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
  progress(1);
  setTimeout(() => { document.getElementById('loading').classList.add('hide'); if (!ui.panelOpen) audio.setTheme('farm'); }, 150);
  // начало истории: новое задание показываем сразу
  if (farm.quests.current && !farm.quests.st.seen) setTimeout(() => ui.questPanel(farm), 700);
  if (new URLSearchParams(location.search).has('debug')) {
    const d = document.createElement('div');
    d.className = 'debug';
    document.body.appendChild(d);
    setInterval(() => { d.textContent = `${perf.fps.toFixed(0)} fps · ${perf.tier} · x${perf.renderScale}`; }, 500);
  }
  window.__farm = farm;
}

main().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Ошибка загрузки: ' + e.message;
});
