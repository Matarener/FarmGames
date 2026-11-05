// Сборка в dist/: один минифицированный JS-бандл, CSS, index.html и только
// те спрайты, которые использует игра. Результат — статическая папка для
// GitHub Pages или любого HTTPS-хостинга Telegram Mini App.
//
//   npm install
//   npm run build

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const hash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 8);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'assets', 'sprites'), { recursive: true });

// Версия спрайтов для сброса кэша
const { DEFS, ICON_FILES, SPRITE_DIR } = await import('../src/game/assets.js');
const used = [...new Set([...Object.keys(DEFS), ...Object.values(ICON_FILES)])].sort();
const vh = createHash('sha1');
for (const name of used) { const f = join(ROOT, SPRITE_DIR, name + '.webp'); if (existsSync(f)) vh.update(readFileSync(f)); }
const assetV = vh.digest('hex').slice(0, 8);

// JS
const js = await build({
  define: { __ASSET_V__: JSON.stringify(assetV) },
  entryPoints: [join(ROOT, 'src', 'main.js')],
  bundle: true, minify: true, format: 'esm', target: ['es2020', 'safari14'],
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
  .replace('<script type="module" src="src/main.js"></script>', `<script type="module" src="${jsName}"></script>`)
  .replace(/\n\s*\n/g, '\n');
writeFileSync(join(DIST, 'index.html'), html);

// Спрайты: только используемые
let bytes = 0, n = 0;
for (const name of used) {
  const src = join(ROOT, SPRITE_DIR, name + '.webp');
  if (!existsSync(src)) { console.warn('нет файла', src); continue; }
  copyFileSync(src, join(DIST, SPRITE_DIR, name + '.webp'));
  bytes += readFileSync(src).length; n++;
}
writeFileSync(join(DIST, '.nojekyll'), '');

const kb = (b) => (b / 1024).toFixed(0) + ' КБ';
console.log(`dist/ готов: ${jsName} ${kb(jsCode.length)}, ${cssName} ${kb(cssCode.length)}, спрайтов ${n} (${kb(bytes)})`);
