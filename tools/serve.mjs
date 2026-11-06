// Простой статический сервер без зависимостей: node tools/serve.mjs [папка] [порт]
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const root = join(process.cwd(), process.argv[2] || '.');
const port = +(process.argv[3] || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

// Редактор карты (инструмент разработчика): /editor — та же игра в режиме редактора,
// POST /__editor/map — запись assets/map.json. Только с этого компьютера и только из папки проекта (не dist).
const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const editorOn = !process.argv[2] || process.argv[2] === '.';

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (editorOn && (p === '/editor' || p === '/editor/' || p === '/editor.html')) {
    if (!local(req)) { res.writeHead(403).end('Редактор открывается только на этом компьютере'); return; }
    const html = (await readFile(join(root, 'index.html'), 'utf8'))
      .replace('<title>', '<base href="/"><title>')
      .replace('</head>', '  <link rel="stylesheet" href="src/editor/editor.css">\n  <script>window.FARM_EDITOR = 1;</script>\n</head>');
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' }).end(html);
    return;
  }
  if (editorOn && p === '/__editor/map' && req.method === 'POST') {
    if (!local(req)) { res.writeHead(403).end('forbidden'); return; }
    let body = '';
    for await (const ch of req) { body += ch; if (body.length > 2e6) { res.writeHead(413).end('too big'); return; } }
    try {
      const m = JSON.parse(body);
      if (!Array.isArray(m.tiles) || !Array.isArray(m.objects)) throw new Error('не карта');
      await writeFile(join(root, 'assets', 'map.json'), body);
      console.log(`Карта сохранена: assets/map.json (${m.objects.length} объектов)`);
      res.writeHead(200).end('ok');
    } catch (e) { res.writeHead(400).end(String(e.message)); }
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, () => console.log(`Ферма: http://localhost:${port}  (папка ${root})`));
