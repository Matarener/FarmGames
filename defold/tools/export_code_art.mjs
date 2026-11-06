// Выгрузка графики, нарисованной кодом в JS-версии, в PNG для Defold.
// Запуск: node defold/tools/export_code_art.mjs  (из корня репозитория; нужен Playwright)
// Пишет defold/tools/out/code/*.png и code.json {name: {w,h,ax,ay,px}} (px — пикселей на единицу мира).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'defold/tools/out/code';
mkdirSync(OUT, { recursive: true });
const srv = spawn('node', ['tools/serve.mjs', '.', '8099'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:8099/index.html?renderer=2d');
await page.waitForFunction(() => window.__farm && window.__farm.S && window.__farm.S.waterTex, null, { timeout: 60000 });
const res = await page.evaluate(async () => {
  const Sp = await import('/src/engine/Sprite.js');
  const art = await import('/src/game/art.js');
  const ghost = await import('/src/game/ghost.js');
  const f = window.__farm;
  const out = {};
  const put = (name, s, px) => { out[name] = { w: s.w, h: s.h, ax: s.ax, ay: s.ay, px, png: s.canvas.toDataURL('image/png') }; };
  // призрак и инструменты — мелкие, поэтому в 4 раза
  Sp.setSpriteScale(4);
  const gd = ghost.makeGhostData();
  for (const [skin, slots] of Object.entries(gd.skins)) for (const [slot, atts] of Object.entries(slots)) for (const [an, a] of Object.entries(atts)) {
    put(`g_${skin}_${slot}_${an}`, a.sprite, 4);
  }
  Sp.setSpriteScale(2);
  for (const k of ['water', 'ready', 'lock']) put('bubble_' + k, art.bubbleSprite(k), 2);
  // берег пруда поверх текстуры воды: все сочетания соседей
  const grass = f.grassColor();
  for (let mask = 0; mask < 16; mask++) for (let dg = 0; dg < 16; dg++) {
    if ((dg & 1) && (mask & 9)) continue; if ((dg & 2) && (mask & 3)) continue;
    if ((dg & 4) && (mask & 6)) continue; if ((dg & 8) && (mask & 12)) continue;
    if (!mask && !dg) continue;
    put(`shore_${mask}_${dg}`, art.waterTile(mask, 0, 'none', grass, dg), 2);
  }
  // текстура воды: 6×4 ромба, каждый — своя клетка картинки 128 px (как в JS)
  const t = f.S.waterTex.canvas;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
    const c = document.createElement('canvas'); c.width = 132; c.height = 66;
    const g = c.getContext('2d');
    g.setTransform(64, 32, -64, 32, 66, 1);
    const p = g.createPattern(t, 'repeat');
    p.setTransform(new DOMMatrix().translate(-i, -j).scale(1 / 128));
    g.fillStyle = p; g.fillRect(-0.02, -0.02, 1.04, 1.04);
    out[`water_${i}_${j}`] = { w: 66, h: 33, ax: 33, ay: 16.5, px: 2, png: c.toDataURL('image/png') };
  }
  return { out, grass, ghost: { bones: gd.bones, slots: gd.slots, drawOrders: gd.drawOrders, animations: gd.animations,
    skins: Object.fromEntries(Object.entries(gd.skins).map(([sk, slots]) => [sk, Object.fromEntries(Object.entries(slots).map(([sl, atts]) => [sl,
      Object.fromEntries(Object.entries(atts).map(([an, a]) => [an, { x: a.x || 0, y: a.y || 0, rotation: a.rotation || 0, sprite: `g_${sk}_${sl}_${an}` }]))]))])) },
    rodTip: ghost.ROD_TIP };
});
const meta = {};
for (const [name, v] of Object.entries(res.out)) {
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(v.png.split(',')[1], 'base64'));
  meta[name] = { w: v.w, h: v.h, ax: v.ax, ay: v.ay, px: v.px };
}
writeFileSync(`${OUT}/code.json`, JSON.stringify(meta, null, 1));
writeFileSync(`${OUT}/ghost.json`, JSON.stringify({ ...res.ghost, rodTip: res.rodTip, grass: res.grass }, null, 1));
console.log('exported', Object.keys(meta).length, 'grass', res.grass);
await browser.close(); srv.kill();
