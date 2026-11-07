// Сборка в dist/: один минифицированный JS-бандл, CSS и index.html. Результат — статическая папка для
// GitHub Pages или любого HTTPS-хостинга Telegram Mini App.
//
//   npm install
//   npm run build

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const hash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 8);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Картинки художника: версия по содержимому manifest, чтобы Pages не отдавал старый кэш
const ART = join(ROOT, 'assets', 'art');
const ASSET_V = hash(Buffer.concat(readdirSync(ART).sort().map((f) => readFileSync(join(ART, f)))));
cpSync(ART, join(DIST, 'assets', 'art'), { recursive: true });

// Стартовая карта (assets/map.json, её пишет редактор карты) вшивается в код: если бы файл карты
// не загрузился по сети, игра собрала бы случайный мир, и сохранение игрока потеряло бы тропинки,
// посадки и перестановки. Файла нет — null: мир генерируется случайно.
let MAP = 'null';
try { MAP = JSON.stringify(JSON.parse(readFileSync(join(ROOT, 'assets', 'map.json'), 'utf8'))); } catch { /* карты нет */ }

// JS
const js = await build({
  // manifest, список иконок и карту вшиваем в код: так dist/index.html открывается и без сервера (file://)
  define: {
    __ASSET_V__: JSON.stringify(ASSET_V),
    __MAP__: MAP,
    // редактор карты — только для локального запуска, в сборку для игроков не попадает
    'window.FARM_EDITOR': 'false',
    __ART_MANIFEST__: readFileSync(join(ART, 'manifest.json'), 'utf8'),
    __ART_ICONS__: readFileSync(join(ART, 'icons.json'), 'utf8'),
  },
  entryPoints: [join(ROOT, 'src', 'main.js')],
  // код редактора карты в сборку для игроков не попадает вовсе (вместо него — пустой модуль)
  plugins: [{ name: 'no-editor', setup(b) {
    b.onResolve({ filter: /editor\/MapEditor\.js$/ }, () => ({ path: 'no-editor', namespace: 'no-editor' }));
    b.onLoad({ filter: /.*/, namespace: 'no-editor' }, () => ({ contents: 'export {};', loader: 'js' }));
  } }],
  bundle: true, minify: true, format: 'iife', target: ['es2020', 'safari14'],
  write: false, legalComments: 'none',
});
const jsCode = js.outputFiles[0].contents;
const jsName = `game.${hash(jsCode)}.js`;
writeFileSync(join(DIST, jsName), jsCode);


// CSS
const css = await build({ entryPoints: [join(ROOT, 'style.css')], minify: true, write: false, loader: { '.css': 'css' } });
const cssCode = css.outputFiles[0].contents;
const cssName = `style.${hash(cssCode)}.css`;
writeFileSync(join(DIST, cssName), cssCode);

// HTML
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
html = html.replace('href="style.css"', `href="${cssName}"`)
  .replace('<script type="module" src="src/main.js"></script>', `<script defer src="${jsName}"></script>`)
  .replace(/\n\s*\n/g, '\n');
writeFileSync(join(DIST, 'index.html'), html);

writeFileSync(join(DIST, '.nojekyll'), '');

const kb = (b) => (b / 1024).toFixed(0) + ' КБ';
console.log(`dist/ готов: ${jsName} ${kb(jsCode.length)}, ${cssName} ${kb(cssCode.length)}`);
