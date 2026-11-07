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
import { createPixiApp, PixiScene } from './game/PixiScene.js';
import { UI } from './ui/UI.js';
import { Audio } from './engine/Audio.js';

// Редактор карты — инструмент разработчика: только при локальном запуске (tools/editor.cmd → /editor).
// В сборку для игроков (dist, GitHub Pages) его код не попадает: при сборке window.FARM_EDITOR = false.
const EDITOR = !!window.FARM_EDITOR;

// Карта из редактора (assets/map.json). Нет файла — мир генерируется случайно, как раньше.
async function loadMap() {
  const v = typeof __MAP_V__ !== 'undefined' ? __MAP_V__ : null;
  if (v === '') return null; // в сборке карты нет — не делаем лишний запрос
  try {
    const r = await fetch('assets/map.json' + (v ? '?v=' + v : ''), { cache: 'no-cache' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function main() {
  const mapP = loadMap();
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
  // Рисует WebGL (PixiJS). Без WebGL играть нельзя: старая отрисовка Canvas 2D убрана
  // (она осталась в ветке canvas2d), а WebGL есть во всех клиентах Telegram.
  const app = await createPixiApp(canvas, perf, BG);
  if (!app) { loadingError('Ваше устройство не поддерживает WebGL: без него игра не запустится. Попробуйте обновить Telegram или открыть игру на другом устройстве.'); return; }
  const renderer = new Renderer(canvas, perf, app);
  const camera = new Camera();
  const ui = new UI(document.getElementById('app'));
  const save = new Save(tg);
  { const fl = save.flush.bind(save); save.flush = () => { const t = performance.now(); fl(); perf.mark('сохранение', performance.now() - t); }; }
  const fill = document.getElementById('ld-fill'), ltext = document.getElementById('ld-text');
  // полоса двигается через transform (это анимирует видеокарта — плавно, даже пока JS занят), только вперёд
  let shown = 0, slowNet = false;
  const progress = (k) => {
    if (k <= shown) return; shown = k;
    fill.style.transform = `scaleX(${k.toFixed(3)})`;
    ltext.textContent = k < 1 ? `${slowNet ? 'Медленная сеть, догружаем' : 'Загрузка…'} ${Math.round(k * 100)}%` : 'Готово!';
  };
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  progress(0.05); await nextFrame();
  const farm = new Farm({ renderer, camera, ui, tg, save, perf, audio });
  farm.scene = new PixiScene(farm, app);
  farm.onArtProgress = (k) => progress(0.08 + k * 0.72);
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
    camera.minZoom = EDITOR ? 0.2 : big ? 0.6 : 0.5; // в редакторе можно отдалиться на всю карту
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

  let map = await mapP;
  let editorMod = null;
  if (EDITOR) {
    editorMod = await import('./editor/MapEditor.js');
    map = editorMod.startMap(map);
    save.disabled = true; // редактор не трогает сохранение игры
  }
  const saved = EDITOR ? null : await save.load();
  farm.init(saved, map);
  if (EDITOR) { /* без приветствий */ }
  else if (saved && farm.awaySec > 60) ui.toast(`С возвращением! Вас не было ${Math.round(farm.awaySec / 60)} мин, растения подросли.`);
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
  // Ждём ВСЕ картинки художника, сколько бы это ни заняло: графику из кода игрок видеть не должен.
  // Раньше через 15 с (или при одной оборвавшейся картинке) игра открывалась со старой графикой из кода.
  // Если картинки так и не загрузились (нет сети) — экран загрузки с кнопкой «Повторить».
  // Игровой цикл пока не запускаем: за экраном загрузки кадры никому не нужны и только мешают загрузке.
  const slow = setTimeout(() => { slowNet = true; if (shown < 0.8) ltext.textContent = `Медленная сеть, догружаем ${Math.round(shown * 100)}%`; }, 12000);
  try { await farm.artReady; } catch (e) {
    clearTimeout(slow);
    loadingError('Не удалось загрузить картинки. Проверьте интернет.');
    const b = document.createElement('button');
    b.className = 'ld-retry'; b.textContent = 'Повторить';
    b.onclick = () => location.reload(); // загруженные картинки уже в кэше браузера — повтор быстрый
    ltext.after(b);
    return;
  }
  clearTimeout(slow);
  progress(0.85); await nextFrame(); // полоса успевает показаться до тяжёлого шага
  try { farm.scene.warmup(); } catch (e) { console.warn('warmup', e); }
  // Разгон: ~2 с кадров с движением камеры ещё за экраном загрузки — движок JS успевает
  // оптимизировать горячий код, а сборка мусора после загрузки проходит здесь, а не в игре.
  {
    const cam = farm.cam, z0 = cam.zoom, x0 = cam.x, y0 = cam.y, gl = farm.scene.app.renderer.gl, px = new Uint8Array(4);
    const N = 120;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2;
      cam.x = x0 + Math.cos(a) * 260; cam.y = y0 + Math.sin(a) * 160;
      cam.zoom = z0 * (1 + 0.35 * Math.sin(a * 2));
      farm.scene.render();
      if (i % 10 === 9) { try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } catch { /* */ } progress(0.85 + 0.15 * (i + 1) / N); await nextFrame(); }
    }
    cam.zoom = z0; cam.x = x0; cam.y = y0;
    // и по факту: если на «Высокой» кадр не укладывается в 60 FPS — тоже «Средняя»
    if (perf.gfx === 'auto' && perf.renderScale > 1.5) {
      const t = performance.now();
      for (let i = 0; i < 10; i++) { cam.x = x0 + i * 3; farm.scene.render(); }
      try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } catch { /* */ }
      if ((performance.now() - t) / 10 > 15) perf.setGfx('mid');
      cam.x = x0;
    }
    farm.scene.render();
    await new Promise((r) => setTimeout(r, 300)); // время на сборку мусора
  }
  progress(1);
  game.start();
  perf.restart();
  await new Promise((r) => setTimeout(r, 450)); // дать полосе доехать до конца
  document.getElementById('loading').classList.add('hide'); if (!ui.panelOpen) audio.setTheme('farm');
  if (EDITOR) { new editorMod.MapEditor(farm, { input, map }).start(); return; }
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
        ` · ${perf.tier} · x${perf.renderScale}/${devicePixelRatio.toFixed(2)} · цель ${perf.targetFps}${perf.idle ? " · покой" : ""}` + `\nвызовов отрисовки ${farm.scene.calls} · треугольников ${Math.round(farm.scene.tris)} · холст ${canvas.width}×${canvas.height}` + (sp ? `\nфризы:\n${sp}` : '');
    };
    paint(); fpsTimer = setInterval(paint, 500);
  };
  perf.onShowFps = showFps;
  showFps(perf.showFps || debug);
  window.__farm = farm;
}

// Экран загрузки остаётся, вместо полосы — текст ошибки
function loadingError(text) {
  const bar = document.querySelector('#loading .ld-bar'), t = document.getElementById('ld-text');
  if (bar) bar.style.display = 'none';
  if (t) t.textContent = text;
}

main().catch((e) => {
  console.error(e);
  loadingError('Ошибка загрузки: ' + e.message);
});
