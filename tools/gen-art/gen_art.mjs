// Генерация картинок через Codex CLI по подписке ChatGPT (без ключа API).
//
//   node tools/gen-art/gen_art.mjs <jobs.json> [имя ...] [--count N] [--model M] [--slice] [--dry] [--keep]
//
// Каждое задание в jobs.json: { name, prompt, refs?, size?, key?, count?, replace? } (см. README.md).
// Для каждого задания запускается `codex exec` (одна картинка за запуск). Codex рисует встроенным
// инструментом image_gen и кладёт PNG в ~/.codex/generated_images; скрипт забирает новые файлы,
// убирает однотонный фон (key_bg.py) и сохраняет в assets/source/<name>.png
// (варианты: <name>_2.png, <name>_3.png …). Сырые картинки остаются в .gen-art/<name>/.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'assets/source');
const WORK = path.join(ROOT, '.gen-art');
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const GEN_DIR = path.join(CODEX_HOME, 'generated_images');
const WIN = process.platform === 'win32';
const PY = process.env.PYTHON || (WIN ? 'python' : 'python3');
const KEY_HEX = { magenta: '#FF00FF', green: '#00FF00' };

const argv = process.argv.slice(2);
const flag = (f) => { const i = argv.indexOf(f); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (f) => { const i = argv.indexOf(f); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const DRY = flag('--dry'), SLICE = flag('--slice'), KEEP = flag('--keep');
const COUNT = opt('--count');
const MODEL = opt('--model') || process.env.GEN_ART_MODEL; // модель из ~/.codex/config.toml может не работать со входом ChatGPT
const [jobsFile, ...only] = argv;
if (!jobsFile) {
  console.log('node tools/gen-art/gen_art.mjs <jobs.json> [имя ...] [--count N] [--slice] [--dry] [--keep]');
  process.exit(1);
}
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'))
  .filter((j) => !only.length || only.includes(j.name));
if (!jobs.length) { console.log('нет заданий с такими именами'); process.exit(1); }

function buildPrompt(job, refs) {
  const key = job.key || 'magenta';
  const hex = KEY_HEX[key] || key;
  const size = job.size || '1536x1024';
  return [
    'Generate exactly ONE image with your built-in image generation tool (image_gen).',
    'Do not write or run any scripts, do not call any APIs, do not use an API key, do not edit files.',
    'Do not ask questions: just generate the image and reply "done".',
    refs.length ? `Use the attached reference image(s) as the style reference (${refs.join(', ')}): match their art style, outline, palette and lighting exactly. The reference is a style guide, not something to copy.` : '',
    `Image size: ${size}.`,
    `Background: one flat, perfectly uniform solid ${hex} color filling the whole background, no gradient, no texture, no vignette, no ground, no cast shadow on the background, no checkerboard. Do not use the ${hex} color anywhere on the objects themselves.`,
    'Objects must not touch each other or the image edges; leave generous empty space around every object.',
    '',
    'Image description:',
    job.prompt.trim(),
  ].filter((s) => s !== '').join('\n');
}

function listImages(dir, since, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listImages(p, since, out);
    else if (/\.(png|webp|jpe?g)$/i.test(e.name) && fs.statSync(p).mtimeMs >= since) out.push(p);
  }
  return out.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
}

function runCodex(prompt, cwd, images, logFile) {
  const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--cd', cwd];
  if (MODEL) args.push('--model', MODEL);
  if (images.length) args.push('--image', images.join(','));
  args.push('--', '-'); // промпт из stdin: так в Windows не ломаются кавычки и переносы
  const env = { ...process.env };
  delete env.OPENAI_API_KEY; // с ключом Codex пошёл бы через платный API
  delete env.CODEX_API_KEY;
  return new Promise((resolve) => {
    const q = (s) => (WIN && /[\s&()^]/.test(s) ? `"${s}"` : s);
    const child = spawn(WIN ? 'codex' : 'codex', WIN ? args.map(q) : args,
      { cwd, env, shell: WIN, stdio: ['pipe', 'pipe', 'pipe'] });
    const log = fs.createWriteStream(logFile);
    child.stdout.pipe(log); child.stderr.pipe(log);
    child.stderr.on('data', (d) => { if (/usage limit|rate limit|quota/i.test(d)) process.stderr.write(d); });
    child.on('error', (e) => { log.end(); resolve({ code: -1, error: e }); });
    child.on('close', (code) => { log.end(); resolve({ code }); });
    child.stdin.end(prompt);
  });
}

function nextName(name, replace) {
  if (replace || !fs.existsSync(path.join(SRC, name + '.png'))) return name;
  for (let i = 2; ; i++) if (!fs.existsSync(path.join(SRC, `${name}_${i}.png`))) return `${name}_${i}`;
}

if (!DRY) {
  const v = spawnSync('codex', ['--version'], { shell: WIN, encoding: 'utf8' });
  if (v.status !== 0) {
    console.log('Codex CLI не найден. Установите: npm i -g @openai/codex, потом войдите: codex login (через ChatGPT).');
    process.exit(1);
  }
  console.log(v.stdout.trim());
}

let made = [];
for (const job of jobs) {
  const count = Number(COUNT || job.count || 1);
  const dir = path.join(WORK, job.name);
  fs.mkdirSync(dir, { recursive: true });
  // референсы кладём рядом (Codex видит файлы только в своей папке) и прикладываем через --image
  const refs = [];
  for (const r of job.refs || []) {
    const from = path.resolve(ROOT, r);
    if (!fs.existsSync(from)) { console.log(`  нет референса ${r}, пропускаю его`); continue; }
    const to = path.join(dir, 'ref_' + path.basename(from));
    fs.copyFileSync(from, to);
    refs.push(to);
  }
  const prompt = buildPrompt(job, refs.map((r) => path.basename(r)));
  fs.writeFileSync(path.join(dir, 'prompt.txt'), prompt);
  for (let n = 1; n <= count; n++) {
    console.log(`\n[${job.name}] картинка ${n}/${count}…`);
    if (DRY) { console.log(prompt); continue; }
    const t0 = Date.now() - 1000;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const res = await runCodex(prompt, dir, refs, path.join(dir, `codex_${stamp}.log`));
    const imgs = listImages(GEN_DIR, t0).concat(listImages(dir, t0).filter((p) => !p.includes('ref_') && !p.includes('raw_')));
    if (!imgs.length) {
      console.log(`  Codex не дал картинку (код ${res.code}${res.error ? ', ' + res.error.message : ''}). Лог: ${path.relative(ROOT, dir)}`);
      continue;
    }
    const raw = path.join(dir, `raw_${stamp}${path.extname(imgs.at(-1))}`);
    fs.copyFileSync(imgs.at(-1), raw);
    const name = nextName(job.name, job.replace && n === 1);
    const out = path.join(SRC, name + '.png');
    const k = spawnSync(PY, [path.join(ROOT, 'tools/gen-art/key_bg.py'), raw, out, '--key', job.key && job.key !== 'magenta' ? job.key : 'auto'],
      { encoding: 'utf8', stdio: 'inherit' });
    if (k.status !== 0) { console.log(`  не удалось убрать фон; сырая картинка: ${path.relative(ROOT, raw)}`); continue; }
    console.log(`  готово: assets/source/${name}.png`);
    made.push(name);
  }
  if (!KEEP) for (const r of refs) fs.rmSync(r, { force: true });
}

if (SLICE && made.length) {
  const sheets = [...new Set(made)];
  console.log(`\nнарезка: python tools/slice_art.py ${sheets.join(' ')}`);
  spawnSync(PY, [path.join(ROOT, 'tools/slice_art.py'), ...sheets], { stdio: 'inherit', cwd: ROOT });
}
console.log(`\nготово картинок: ${made.length}${made.length ? ' → ' + made.map((m) => m + '.png').join(', ') : ''}`);
if (!DRY && !made.length) process.exit(1);
