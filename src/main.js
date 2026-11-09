// Точка входа: собираем движок, сцену фермы, интерфейс и Telegram. Пока грузятся картинки
// художника, виден экран загрузки; игра открывается, когда всё загружено и прогрето.

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

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* global __MAP__ */
// Стартовая карта (assets/map.json, её рисует редактор карты). В сборке она вшита в код (tools/build.mjs),
// при локальном запуске читается из файла. Файла нет — мир генерируется случайно.
async function loadMap() {
  if (typeof __MAP__ !== 'undefined') return __MAP__;
  const r = await fetch('assets/map.json', { cache: 'no-cache' });
  return r.ok ? r.json() : null;
}

async function main() {
  const mapP = loadMap();
  const tg = new TelegramBridge();
  tg.init();
  const audio = startAudio();
  const perf = new Perf();
  setSpriteScale(perf.spriteScale);

  const canvas = document.getElementById('game');
  // Рисует WebGL (PixiJS). Без WebGL играть нельзя: старая отрисовка Canvas 2D убрана
  // (она осталась в ветке canvas2d), а WebGL есть во всех клиентах Telegram.
  const app = await createPixiApp(canvas, perf, BG);
  if (!app) return loadingError('Ваше устройство не поддерживает WebGL: без него игра не запустится. Попробуйте обновить Telegram или открыть игру на другом устройстве.');
  const bar = loadingBar();
  const renderer = new Renderer(canvas, perf, app);
  const camera = new Camera();
  const ui = new UI(document.getElementById('app'));
  const save = new Save(tg);
  { const fl = save.flush.bind(save); save.flush = () => { const t = performance.now(); fl(); perf.mark('сохранение', performance.now() - t); }; }
  bar.set(0.05); await nextFrame();

  const farm = new Farm({ renderer, camera, ui, tg, save, perf, audio });
  if (farm.devOn) window.farm = farm; // ?debug: ферма доступна из консоли (проверка заданий)
  farm.scene = new PixiScene(farm, app);
  farm.onArtProgress = (k) => bar.set(0.08 + k * 0.72);
  window.__farm = farm; // для тестов в браузере
  ui.bind(farm, farm.icons);
  const input = setupView(canvas, renderer, camera, farm, ui, perf);

  let map = await mapP;
  let editorMod = null;
  if (EDITOR) {
    editorMod = await import('./editor/MapEditor.js');
    map = editorMod.startMap(map);
    save.disabled = true; // редактор не трогает сохранение игры
  }
  const saved = EDITOR ? null : await save.load();

  window.addEventListener('pagehide', () => save.flush());

  // Ждём ВСЕ картинки художника, сколько бы это ни заняло: графику из кода игрок видеть не должен.
  // Не загрузились (нет сети) — экран загрузки с кнопкой «Повторить».
  // Игровой цикл пока не запускаем: за экраном загрузки кадры никому не нужны и только мешают загрузке.
  try { await farm.artReady; } catch (e) {
    bar.stop();
    loadingError('Не удалось загрузить картинки. Проверьте интернет.', true);
    return;
  }
  bar.stop();
  // мир собираем, когда картинки уже есть: рост растений и полоски над ними берут размеры спрайтов
  farm.init(saved, map);
  if (EDITOR) { /* без приветствий */ }
  else if (saved && farm.awaySec > 60) ui.toast(`С возвращением! Вас не было ${Math.round(farm.awaySec / 60)} мин, растения подросли.`);
  else if (!saved) ui.toast('Добро пожаловать на ферму! Нажмите на дерево или камень, чтобы добыть ресурсы.');
  bar.set(0.85); await nextFrame(); // полоса успевает показаться до тяжёлого шага
  try { farm.scene.warmup(); } catch (e) { console.warn('warmup', e); }
  // Всё, что иначе случилось бы в первые минуты игры, — сейчас, за экраном загрузки:
  // звуковой движок (раньше создавался при первом касании), окна и меню (первое открытие было вдвое дольше)
  audio.prepare();
  try { await ui.warmup(farm, (k) => bar.set(0.85 + 0.05 * k)); } catch (e) { console.warn('warmup ui', e); }
  await warmUpFrames(farm, perf, (k) => bar.set(0.9 + 0.1 * k));

  // Игровой цикл создаём только теперь: он сам запускается, когда вкладка снова видна,
  // а до farm.init обновлять ещё нечего.
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
  bar.set(1);
  game.start();
  perf.restart();
  await wait(450); // дать полосе доехать до конца
  const ld = document.getElementById('loading');
  ld.classList.add('hide');
  // после того как экран загрузки растаял — убрать его совсем: блик на полосе и картинка-заставка
  // иначе остаются всю игру под прозрачностью 0, и браузер каждый кадр перерисовывает лишний слой.
  // Картинку удаляем: иначе при повороте телефона браузер скачал бы заставку для другой ориентации
  setTimeout(() => { ld.style.display = 'none'; ld.querySelector('.ld-art')?.remove(); }, 600);
  if (!ui.panelOpen) audio.setTheme('farm');
  if (EDITOR) { new editorMod.MapEditor(farm, { input, map }).start(); return; }
  // начало истории и новые главы: задание сюжета, которое игрок ещё не читал, показываем сразу
  const story = farm.quests.views().find((v) => v.line === 'story');
  if (story && farm.quests.st.seen !== story.id) setTimeout(() => ui.questPanel(farm, { id: story.id }), 700);
  // счётчик FPS и времени кадра: включается в настройках (или ?debug в адресе)
  perf.onShowFps = (on) => fpsOverlay(on, farm, perf, canvas);
  fpsOverlay(perf.showFps || new URLSearchParams(location.search).has('debug'), farm, perf, canvas);
}

// Звук (настройки в окне «Настройки»). Браузер разрешает звук только после первого касания или клавиши.
function startAudio() {
  const audio = new Audio();
  audio.setTheme('menu');
  // нажатие пальцем браузер засчитывает, когда палец отпускают (pointerup/touchend), мышью — сразу
  const unlock = () => audio.unlock();
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(ev, unlock, true);
  return audio;
}

// Камера и ввод: масштаб под экран, поворот телефона, перетаскивание, щипок, тапы
function setupView(canvas, renderer, camera, farm, ui, perf) {
  const fitZoom = () => {
    // mobile-first: на телефоне ~6.5 клеток по ширине, на больших экранах — крупнее, но не огромно
    const w = renderer.cssW, hgt = renderer.cssH;
    if (w > hgt && hgt < 500) return Math.min(1.7, Math.max(0.8, Math.min(w / (64 * 10), hgt / (32 * 8)))); // горизонтальный телефон
    return Math.min(1.7, Math.max(0.8, Math.min(w / (64 * 6.5), hgt / (32 * 13))));
  };
  const input = new Input(canvas, {
    onDown: () => { camera.vx = camera.vy = 0; camera.glide = null; },
    onPanStart: () => { camera.dragging = true; ui.closePopup(); },
    onPan: (dx, dy) => camera.panBy(dx, dy),
    onPanEnd: (vx, vy) => { camera.dragging = false; camera.fling(vx, vy); },
    onZoom: (k, x, y) => { camera.zoomAt(k, x, y); ui.closePopup(); },
    onTap: (x, y) => farm.onTap(x, y),
    onHover: (x, y) => farm.onHover(x, y),
  });
  let lastLand = null;
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
  perf.onScaleChange = () => renderer.resize();
  new ResizeObserver(resize).observe(canvas);
  resize();
  camera.zoom = fitZoom();
  return input;
}

// Разгон: ~2 с кадров с движением камеры ещё за экраном загрузки — движок JS успевает
// оптимизировать горячий код, текстуры уходят в видеокарту, а сборка мусора после загрузки
// проходит здесь, а не в игре. onProgress(0..1) двигает полосу загрузки.
async function warmUpFrames(farm, perf, onProgress) {
  const cam = farm.cam, scene = farm.scene, z0 = cam.zoom, x0 = cam.x, y0 = cam.y;
  const gl = scene.app.renderer.gl, px = new Uint8Array(4);
  // readPixels ждёт, пока видеокарта дорисует, — иначе кадры копятся в очереди и разгон «пустой»
  const finish = () => { try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } catch { /* */ } };
  const N = 120;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    cam.x = x0 + Math.cos(a) * 260; cam.y = y0 + Math.sin(a) * 160;
    cam.zoom = z0 * (1 + 0.35 * Math.sin(a * 2));
    scene.render();
    if (i % 10 === 9) { finish(); onProgress((i + 1) / N); await nextFrame(); }
  }
  cam.zoom = z0; cam.x = x0; cam.y = y0;
  // и по факту: если на «Высокой» кадр не укладывается в 60 FPS — графика «Средняя»
  if (perf.gfx === 'auto' && perf.renderScale > 1.5) {
    const t = performance.now();
    for (let i = 0; i < 10; i++) { cam.x = x0 + i * 3; scene.render(); }
    finish();
    if ((performance.now() - t) / 10 > 15) perf.setGfx('mid');
    cam.x = x0;
  }
  scene.render();
  await wait(300); // время на сборку мусора
}

// Полоса загрузки. Двигается через transform (это анимирует видеокарта — плавно, даже пока JS занят),
// только вперёд. Через 12 с без конца загрузки подпись меняется на «Медленная сеть».
function loadingBar() {
  const fill = document.getElementById('ld-fill'), text = document.getElementById('ld-text');
  let shown = 0, slowNet = false;
  const label = (k) => `${slowNet ? 'Медленная сеть, догружаем' : 'Загрузка…'} ${Math.round(k * 100)}%`;
  const slow = setTimeout(() => { slowNet = true; if (shown < 0.8) text.textContent = label(shown); }, 12000);
  return {
    set(k) {
      if (k <= shown) return; shown = k;
      fill.style.transform = `scaleX(${k.toFixed(3)})`;
      text.textContent = k < 1 ? label(k) : 'Готово!';
    },
    stop() { clearTimeout(slow); },
  };
}

// Экран загрузки остаётся, вместо полосы — текст ошибки (и кнопка «Повторить»)
function loadingError(text, retry) {
  const bar = document.querySelector('#loading .ld-bar'), t = document.getElementById('ld-text');
  if (bar) bar.style.display = 'none';
  if (t) t.textContent = text;
  if (retry && t) {
    const b = document.createElement('button');
    b.className = 'ld-retry'; b.textContent = 'Повторить';
    b.onclick = () => location.reload(); // загруженные картинки уже в кэше браузера — повтор быстрый
    t.after(b);
  }
}

// Счётчик FPS, времени кадра и фризов (настройки → «Экран» или ?debug в адресе)
let fpsEl = null, fpsTimer = 0;
function fpsOverlay(on, farm, perf, canvas) {
  if (!on) { if (fpsEl) fpsEl.remove(); fpsEl = null; clearInterval(fpsTimer); return; }
  if (fpsEl) return;
  fpsEl = document.createElement('div');
  fpsEl.className = 'debug';
  document.body.appendChild(fpsEl);
  const paint = () => {
    const t = performance.now(), now = (t - perf._t0) / 1000;
    const sp = perf.spikes.map((x) => `${x.ms.toFixed(0)} мс ${Math.round(now - x.at)} с назад: ${x.tags}${x.why ? ` [${x.why}]` : ''}`).join('\n');
    // в покое (ничего не движется, экран не трогают) игра нарочно рисует не больше idleFps кадров — бережёт батарею;
    // сколько выходит, когда камера и призрак двигаются, — «в движении»
    const ago = Math.round((t - perf.fpsActiveAt) / 1000);
    const act = perf.fpsActive ? ` · в движении ${perf.fpsActive.toFixed(0)} fps${ago > 5 ? ` (${ago} с назад)` : ''}` : '';
    fpsEl.textContent =
      `${perf.fps.toFixed(0)} fps${perf.idle ? ` · покой: нарочно до ${perf.idleFps}` : ''}${act}${perf.hz ? ` · экран ${perf.hz} Гц` : ''}` +
      `\nкадр ${perf.frameMs.toFixed(1)} мс (макс ${perf.frameMax.toFixed(0)}) · ${perf.tier} · x${perf.renderScale}/${devicePixelRatio.toFixed(2)} · цель ${perf.targetFps}` +
      `\nвызовов отрисовки ${farm.scene.calls} · треугольников ${Math.round(farm.scene.tris)} · холст ${canvas.width}×${canvas.height}` +
      (perf.gpu ? `\nвидеокарта ${perf.gpu}` : '') +
      (sp ? `\nфризы:\n${sp}` : '');
  };
  paint(); fpsTimer = setInterval(paint, 500);
}

main().catch((e) => {
  console.error(e);
  loadingError('Ошибка загрузки: ' + e.message);
});
