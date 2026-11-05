// Сборка в dist/: один минифицированный JS-бандл, CSS и index.html. Результат — статическая папка для
// GitHub Pages или любого HTTPS-хостинга Telegram Mini App.
//
//   npm install
//   npm run build

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const hash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 8);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Кадры фермера (assets/farmer): копируем, хеш — в адрес картинок, чтобы новые не застревали в кэше
const FARMER = join(ROOT, 'assets', 'farmer');
mkdirSync(join(DIST, 'assets', 'farmer'), { recursive: true });
const vh = createHash('sha1');
for (const f of readdirSync(FARMER).filter((n) => n.endsWith('.png')).sort()) {
  vh.update(readFileSync(join(FARMER, f)));
  copyFileSync(join(FARMER, f), join(DIST, 'assets', 'farmer', f));
}
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

writeFileSync(join(DIST, '.nojekyll'), '');

const kb = (b) => (b / 1024).toFixed(0) + ' КБ';
console.log(`dist/ готов: ${jsName} ${kb(jsCode.length)}, ${cssName} ${kb(cssCode.length)}`);
