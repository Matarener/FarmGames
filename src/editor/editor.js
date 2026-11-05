// Редактор анимаций фермера. Отдельная страница (editor.html), использует
// тот же скелет, части тела, IK и походку, что и игра.
// Результат — assets/anims.json, игра читает его при запуске.

import { Skeleton } from '../skeleton/Skeleton.js';
import { Animation } from '../skeleton/Animation.js';
import { setSpriteScale } from '../engine/Sprite.js';
import { loadArt, loadAnims, ANIMS_DRAFT_KEY } from '../game/assets.js';
import { makeFarmerData, DEFAULT_ANIMS } from '../game/farmer.js';
import { makeGait, solveRig, STRIDE } from '../game/gait.js';
import { formatAnims } from './serialize.js';

const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const DEG = 180 / Math.PI;
const wrapDeg = (a) => ((a + 540) % 360) - 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const GAME_SPEED = 2.6 * Math.hypot(32, 16);   // скорость фермера в игре, единиц мира в секунду
const USED = ['idle', 'walk', 'swing', 'water', 'pick', 'happy'];
const AUTO_TOOL = { swing: 'axe', water: 'can', pick: 'seedbag' };
const TWO_HANDED = { axe: 1, pickaxe: 1, hoe: 1 };
const LEG_BONES = { thighF: 1, shinF: 1, thighB: 1, shinB: 1 };
const CH = { rotate: '#f2b84b', translate: '#4fa3f7', scale: '#7bc96f' };

// ---------- состояние ----------
let doc = null;           // { имя: данные анимации }
let cur = 'idle';
let time = 0, playing = false, walkDist = 0;
let sel = 'armF';
let selEvent = -1;
let fileHandle = null;
const V = { back: false, flip: false, tool: null, grip: false, walkprev: true, onion: false, bones: true, zoom: 0, panX: 0, panY: 0 };
const undoStack = [], redoStack = [];
const compiled = {};
let flash = null;         // { name, until }

let data, sk, boneNames, tips;
const gait = makeGait();

// ---------- данные и ключи ----------
function anim() { return doc[cur]; }
function getAnim(name = cur) {
  if (!compiled[name]) compiled[name] = new Animation(name, clone(doc[name]));
  return compiled[name];
}
function invalidate(name = cur) { delete compiled[name]; }
function snapT(t) { const s = +$('snap').value; return r3(Math.round(t / s) * s); }

function keysOf(bone, ch, create = false) {
  const a = anim();
  if (!a.bones) { if (!create) return null; a.bones = {}; }
  let b = a.bones[bone];
  if (!b) { if (!create) return null; b = a.bones[bone] = {}; }
  if (!b[ch]) { if (!create) return null; b[ch] = []; }
  return b[ch];
}

// Значение канала в момент t (так же, как считает Animation)
function sample(bone, ch, t) {
  const tl = getAnim().bones[bone];
  const def = ch === 'rotate' ? [0] : ch === 'scale' ? [1, 1] : [0, 0];
  const k = tl && tl[ch];
  if (!k || !k.length) return def;
  if (t <= k[0][0]) return k[0].slice(1, def.length + 1);
  const n = k.length;
  if (t >= k[n - 1][0]) return k[n - 1].slice(1, def.length + 1);
  let i = 0;
  while (i < n - 1 && k[i + 1][0] <= t) i++;
  const k0 = k[i], k1 = k[i + 1];
  let u = (t - k0[0]) / (k1[0] - k0[0]);
  const c = k0[def.length + 1] || 0;
  u = c === 1 ? 0 : c === 2 ? u * u * (3 - 2 * u) : c === 3 ? u * u : c === 4 ? 1 - (1 - u) * (1 - u) : u;
  return def.map((_, j) => k0[j + 1] + (k1[j + 1] - k0[j + 1]) * u);
}

const nvals = (ch) => (ch === 'rotate' ? 1 : 2);
function keyAt(keys, t) { return keys ? keys.findIndex((k) => Math.abs(k[0] - t) < 1e-4) : -1; }

function setKey(bone, ch, t, vals) {
  const keys = keysOf(bone, ch, true);
  const n = nvals(ch);
  vals = vals.map((v) => Math.round(v * 100) / 100);
  const i = keyAt(keys, t);
  if (i >= 0) { for (let j = 0; j < n; j++) keys[i][j + 1] = vals[j]; return; }
  // переход берём от предыдущего ключа, по умолчанию — плавно
  let prev = null;
  for (const k of keys) if (k[0] < t) prev = k;
  const curve = prev ? prev[n + 1] ?? 0 : 2;
  keys.push([t, ...vals, curve]);
  keys.sort((a, b) => a[0] - b[0]);
}

function boneKeyTimes(bone) {
  const tl = anim().bones && anim().bones[bone];
  const m = new Map();
  if (!tl) return m;
  for (const ch of Object.keys(CH)) for (const k of tl[ch] || []) {
    const t = r3(k[0]);
    if (!m.has(t)) m.set(t, []);
    m.get(t).push(ch);
  }
  return m;
}

function deleteKeys(bone, t) {
  const tl = anim().bones && anim().bones[bone];
  if (!tl) return false;
  let any = false;
  for (const ch of Object.keys(CH)) {
    const k = tl[ch];
    if (!k) continue;
    const i = keyAt(k, t);
    if (i >= 0) { k.splice(i, 1); any = true; }
    if (!k.length) delete tl[ch];
  }
  if (!Object.keys(tl).length) delete anim().bones[bone];
  return any;
}

function moveKeys(bone, t0, t1, copy) {
  const tl = anim().bones && anim().bones[bone];
  if (!tl || Math.abs(t0 - t1) < 1e-4) return;
  for (const ch of Object.keys(CH)) {
    const k = tl[ch];
    if (!k) continue;
    const i = keyAt(k, t0);
    if (i < 0) continue;
    const key = k[i].slice();
    if (!copy) k.splice(i, 1);
    const j = keyAt(k, t1);
    if (j >= 0) k.splice(j, 1);
    key[0] = t1;
    k.push(key);
    k.sort((a, b) => a[0] - b[0]);
  }
}

// ---------- отмена, автосохранение ----------
function begin() {
  undoStack.push(JSON.stringify({ doc, cur }));
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
}
function restore(s) { const o = JSON.parse(s); doc = o.doc; cur = doc[o.cur] ? o.cur : Object.keys(doc)[0]; for (const k in compiled) delete compiled[k]; changed(false); }
function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify({ doc, cur })); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify({ doc, cur })); restore(redoStack.pop()); }

let saveTimer = 0, dirtyFile = false;
function changed(touch = true) {
  invalidate();
  if (touch) dirtyFile = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 250);
  refreshUI();
}
function saveDraft() {
  try { localStorage.setItem(ANIMS_DRAFT_KEY, JSON.stringify({ version: 1, animations: doc })); } catch (e) { /* приватный режим */ }
  status(dirtyFile ? 'Черновик в браузере · файл не сохранён' : 'Сохранено');
}
function status(s) { $('status').textContent = s; }

// ---------- файл ----------
const PICK = { types: [{ description: 'Анимации', accept: { 'application/json': ['.json'] } }], suggestedName: 'anims.json' };
async function saveFile() {
  const text = formatAnims(doc);
  try {
    if (window.showSaveFilePicker) {
      if (!fileHandle) fileHandle = await window.showSaveFilePicker(PICK);
      const w = await fileHandle.createWritable();
      await w.write(text); await w.close();
      dirtyFile = false; saveDraft();
      status(`Сохранено в ${fileHandle.name}`);
      return;
    }
  } catch (e) { if (e.name === 'AbortError') return; console.warn(e); fileHandle = null; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = 'anims.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  dirtyFile = false; saveDraft();
  status('Файл anims.json скачан — положите его в папку assets игры');
}
function useLoaded(j, name) {
  const anims = j && (j.animations || j);
  if (!anims || typeof anims !== 'object' || !Object.values(anims).every((a) => a && a.duration > 0)) { alert('Это не файл анимаций'); return; }
  begin();
  doc = { ...clone(DEFAULT_ANIMS), ...anims };
  for (const k in compiled) delete compiled[k];
  if (!doc[cur]) cur = Object.keys(doc)[0];
  dirtyFile = false;
  changed(false);
  status(`Открыт ${name}`);
}
async function openFile() {
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker(PICK);
      const j = JSON.parse(await (await h.getFile()).text());
      fileHandle = h;
      useLoaded(j, h.name);
    } catch (e) { if (e.name !== 'AbortError') alert('Не удалось открыть: ' + e.message); }
    return;
  }
  $('file').click();
}
$('file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { useLoaded(JSON.parse(await f.text()), f.name); } catch (err) { alert('Не удалось открыть: ' + err.message); }
  e.target.value = '';
};

// ---------- поза ----------
function ikState() {
  const a = getAnim();
  return {
    legs: a.footIK && !!data.legs,
    arm: V.grip && TWO_HANDED[V.tool],
  };
}
function pose(t) {
  const a = getAnim();
  sk.setToSetupPose();
  a.apply(sk, t, 1);
  sk.updateWorld();
  if (cur === 'walk' && V.walkprev) {
    gait.phase = ((t / a.duration) % 1 + 1) % 1; gait.amt = 1;
    gait.ux = V.flip ? -0.894 : 0.894; gait.uy = V.back ? -0.447 : 0.447;
  } else { gait.phase = 0; gait.amt = 0; }
  const ik = ikState();
  solveRig(sk, gait, {
    legs: data.legs, grip2: data.grip2, flip: V.flip, dt: 1, instant: true,
    squat: a.kneesOut, legsIK: ik.legs, twoHand: ik.arm,
  });
}

// ---------- вид ----------
const cv = $('view'), g = cv.getContext('2d');
let dpr = 1, W = 0, H = 0;
function resize() {
  dpr = Math.min(3, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect();
  W = cv.width = Math.max(1, Math.round(r.width * dpr));
  H = cv.height = Math.max(1, Math.round(r.height * dpr));
  const tr = tlc.getBoundingClientRect();
  tlc.width = Math.round(tr.width * dpr);
  tlc.height = Math.round(TL_H() * dpr);
  tlc.style.height = TL_H() + 'px';
}
const zoom = () => (V.zoom || H / 75);
const origin = () => [W / 2 + V.panX, H * 0.74 + V.panY];
const fs = () => (V.flip ? -1 : 1);
function toScreen(x, y) { const [cx, cy] = origin(), Z = zoom(); return [cx + fs() * Z * x, cy + Z * y]; }
function toSkel(sx, sy) { const [cx, cy] = origin(), Z = zoom(); return [(sx - cx) / Z * fs(), (sy - cy) / Z]; }

function boneTip(b) {
  const t = tips[b.data.name];
  if (!t) return null;
  return [b.a * t[0] + b.c * t[1] + b.tx, b.b * t[0] + b.d * t[1] + b.ty];
}

function drawGround() {
  const Z = zoom(), [cx, cy] = origin();
  g.save();
  g.translate(cx, cy); g.scale(Z, Z);
  // плитки 64×32, движутся навстречу при ходьбе
  const dir = [fs() * 0.894, V.back ? -0.447 : 0.447];
  const ox = -walkDist * dir[0], oy = -walkDist * dir[1];
  const gx0 = (ox / 32 + oy / 16) / 2, gy0 = (oy / 16 - ox / 32) / 2;
  const fx = gx0 - Math.floor(gx0), fy = gy0 - Math.floor(gy0);
  const R = 6;
  const pt = (gx, gy) => [(gx - gy) * 32, (gx + gy) * 16];
  g.fillStyle = '#4d8a3f';
  g.beginPath();
  g.moveTo(...pt(-R, -R)); g.lineTo(...pt(R, -R)); g.lineTo(...pt(R, R)); g.lineTo(...pt(-R, R));
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 1 / Z * dpr;
  g.beginPath();
  for (let k = -R; k <= R; k++) {
    let a = pt(k + fx, -R), b = pt(k + fx, R); g.moveTo(...a); g.lineTo(...b);
    a = pt(-R, k + fy); b = pt(R, k + fy); g.moveTo(...a); g.lineTo(...b);
  }
  g.stroke();
  g.restore();
  // затемнение краёв
  const grd = g.createRadialGradient(cx, cy, Z * 30, cx, cy, Math.max(W, H) * 0.7);
  grd.addColorStop(0, 'rgba(31,35,38,0)'); grd.addColorStop(1, 'rgba(31,35,38,1)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // тень
  g.fillStyle = 'rgba(20,40,10,0.25)';
  g.beginPath(); g.ellipse(cx, cy, 9 * Z, 4 * Z, 0, 0, Math.PI * 2); g.fill();
}

function drawSkeleton(alpha) {
  const [cx, cy] = origin();
  g.globalAlpha = alpha;
  g.imageSmoothingQuality = 'high';
  sk.override.tool = V.tool;
  sk.draw(g, { va: zoom(), ve: cx, vf: cy }, 0, 0, 1, V.flip);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
}

function drawBones() {
  const ik = ikState();
  for (const b of sk.bones) {
    const name = b.data.name, isSel = name === sel;
    const [x0, y0] = toScreen(b.tx, b.ty);
    const tip = boneTip(b);
    const byIK = (ik.legs && LEG_BONES[name]) || (ik.arm && (name === 'armB' || name === 'foreB'));
    const col = isSel ? '#4fa3f7' : byIK ? 'rgba(240,163,90,0.8)' : 'rgba(255,255,255,0.75)';
    g.lineWidth = (isSel ? 3 : 1.6) * dpr;
    g.strokeStyle = col; g.fillStyle = col;
    if (tip) {
      const [x1, y1] = toScreen(tip[0], tip[1]);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.beginPath(); g.arc(x1, y1, 1.6 * dpr, 0, 7); g.fill();
    } else {
      // корень и таз — квадратные ручки
      const s = (isSel ? 5 : 4) * dpr;
      g.strokeRect(x0 - s, y0 - s, s * 2, s * 2);
    }
    g.beginPath(); g.arc(x0, y0, (isSel ? 3.5 : 2.6) * dpr, 0, 7);
    g.fillStyle = '#1f2326'; g.fill(); g.stroke();
  }
}

function render() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#1f2326'; g.fillRect(0, 0, W, H);
  drawGround();
  const a = getAnim();
  if (V.onion) {
    for (const dt of [-0.1, 0.1]) {
      let t = time + dt;
      if (a.loop) t = (t + a.duration) % a.duration; else t = Math.max(0, Math.min(a.duration, t));
      pose(t); drawSkeleton(0.22);
    }
  }
  pose(time);
  drawSkeleton(1);
  if (V.bones) drawBones();
  if (flash && performance.now() < flash.until) {
    g.font = `600 ${16 * dpr}px system-ui`; g.fillStyle = '#e0604f'; g.textAlign = 'center';
    const [cx, cy] = origin();
    g.fillText('⚡ ' + flash.name, cx, cy - zoom() * 46);
  }
  drawTimeline();
}

// ---------- мышь на виде ----------
function pickBone(sx, sy) {
  pose(time);
  let best = null, bd = 12 * dpr;
  for (const b of sk.bones) {
    const p0 = toScreen(b.tx, b.ty), tip = boneTip(b);
    let d;
    if (tip) {
      const p1 = toScreen(tip[0], tip[1]);
      const vx = p1[0] - p0[0], vy = p1[1] - p0[1], L = vx * vx + vy * vy || 1;
      const u = Math.max(0, Math.min(1, ((sx - p0[0]) * vx + (sy - p0[1]) * vy) / L));
      d = Math.hypot(sx - p0[0] - vx * u, sy - p0[1] - vy * u);
    } else d = Math.hypot(sx - p0[0], sy - p0[1]) - 2 * dpr;
    if (d < bd) { bd = d; best = b.data.name; }
  }
  return best;
}

let drag = null;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  const sx = e.offsetX * dpr, sy = e.offsetY * dpr;
  if (e.button === 1 || e.button === 2) { drag = { pan: true, sx, sy, px: V.panX, py: V.panY }; return; }
  const name = pickBone(sx, sy);
  if (!name) { drag = { pan: true, sx, sy, px: V.panX, py: V.panY }; return; }
  sel = name; selEvent = -1;
  playing = false;
  time = snapT(time);
  pose(time);
  const b = sk.boneMap[name];
  const move = e.shiftKey || !tips[name];
  const [px, py] = toScreen(b.tx, b.ty);
  drag = {
    bone: name, move, sx, sy, started: false,
    ang0: Math.atan2(sy - py, (sx - px) * fs()), px, py,
    v0: sample(name, move ? 'translate' : 'rotate', time),
    parent: b.parent ? { a: b.parent.a, b: b.parent.b, c: b.parent.c, d: b.parent.d } : null,
  };
  refreshUI();
});
cv.addEventListener('pointermove', (e) => {
  const sx = e.offsetX * dpr, sy = e.offsetY * dpr;
  if (!drag) { cv.style.cursor = pickBone(sx, sy) ? 'grab' : 'crosshair'; return; }
  if (drag.pan) { V.panX = drag.px + sx - drag.sx; V.panY = drag.py + sy - drag.sy; return; }
  if (!drag.started) { if (Math.hypot(sx - drag.sx, sy - drag.sy) < 3 * dpr) return; begin(); drag.started = true; }
  if (drag.move) {
    const Z = zoom();
    const wx = (sx - drag.sx) / Z * fs(), wy = (sy - drag.sy) / Z;
    let lx = wx, ly = wy;
    const p = drag.parent;
    if (p) { const det = p.a * p.d - p.b * p.c || 1; lx = (p.d * wx - p.c * wy) / det; ly = (-p.b * wx + p.a * wy) / det; }
    setKey(drag.bone, 'translate', time, [drag.v0[0] + lx, drag.v0[1] + ly]);
  } else {
    const ang = Math.atan2(sy - drag.py, (sx - drag.px) * fs());
    setKey(drag.bone, 'rotate', time, [drag.v0[0] + wrapDeg((ang - drag.ang0) * DEG)]);
  }
  changed();
});
cv.addEventListener('pointerup', () => { drag = null; });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  V.zoom = Math.max(2, Math.min(60, zoom() * Math.exp(-e.deltaY * 0.0015)));
}, { passive: false });

// ---------- таймлайн ----------
const tlc = $('tl'), tg = tlc.getContext('2d');
const NAME_W = 92, RULER = 20, EVROW = 20, ROW = 16;
const TL_H = () => RULER + EVROW + (boneNames ? boneNames.length : 12) * ROW + 6;
function tx(t) { const w = tlc.width / dpr - NAME_W - 14; return NAME_W + 6 + (t / anim().duration) * w; }
function tAt(x) { const w = tlc.width / dpr - NAME_W - 14; return Math.max(0, Math.min(anim().duration, (x - NAME_W - 6) / w * anim().duration)); }
function rowY(i) { return RULER + EVROW + i * ROW; }

function diamond(x, y, r) { tg.beginPath(); tg.moveTo(x, y - r); tg.lineTo(x + r, y); tg.lineTo(x, y + r); tg.lineTo(x - r, y); tg.closePath(); }

function drawTimeline() {
  if (!boneNames) return;
  const Wc = tlc.width / dpr, Hc = tlc.height / dpr, a = anim();
  tg.setTransform(dpr, 0, 0, dpr, 0, 0);
  tg.fillStyle = '#262b2e'; tg.fillRect(0, 0, Wc, Hc);
  tg.font = '11px system-ui'; tg.textBaseline = 'middle';
  // линейка
  const step = a.duration > 3 ? 0.5 : a.duration > 1.2 ? 0.2 : 0.1;
  tg.strokeStyle = '#3a4146'; tg.fillStyle = '#9aa3a8'; tg.textAlign = 'center';
  for (let t = 0; t <= a.duration + 1e-6; t += step / 2) {
    const x = Math.round(tx(t)) + 0.5, major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    tg.beginPath(); tg.moveTo(x, major ? 4 : 12); tg.lineTo(x, Hc); tg.stroke();
    if (major) { tg.textAlign = 'left'; tg.fillText(t.toFixed(1), x + 3, 9); }
  }
  // события
  tg.textAlign = 'left';
  tg.fillStyle = '#9aa3a8'; tg.fillText('события', 8, RULER + EVROW / 2);
  (a.events || []).forEach((ev, i) => {
    const x = tx(ev[0]), y = RULER + EVROW / 2;
    tg.fillStyle = i === selEvent ? '#ffd2c9' : '#e0604f';
    tg.beginPath(); tg.moveTo(x - 5, y - 6); tg.lineTo(x + 5, y - 6); tg.lineTo(x, y + 5); tg.fill();
    tg.fillText(ev[1], x + 7, y);
  });
  // кости
  const ik = ikState();
  boneNames.forEach((name, i) => {
    const y = rowY(i);
    if (name === sel) { tg.fillStyle = '#33465c'; tg.fillRect(0, y, Wc, ROW); }
    else if (i % 2) { tg.fillStyle = '#2a2f33'; tg.fillRect(0, y, Wc, ROW); }
    const byIK = (ik.legs && LEG_BONES[name]) || (ik.arm && (name === 'armB' || name === 'foreB'));
    tg.fillStyle = name === sel ? '#fff' : byIK ? '#c98b55' : '#cfd5d8';
    tg.fillText(name + (byIK ? ' · IK' : ''), 8, y + ROW / 2);
    for (const [t, chs] of boneKeyTimes(name)) {
      const x = tx(t), cy = y + ROW / 2;
      diamond(x, cy, 5);
      tg.fillStyle = chs.length > 1 ? '#f4f4f0' : CH[chs[0]];
      tg.fill();
      if (name === sel && Math.abs(t - time) < 1e-4) { tg.strokeStyle = '#fff'; tg.lineWidth = 2; tg.stroke(); tg.lineWidth = 1; }
    }
  });
  // курсор времени
  const x = tx(time);
  tg.strokeStyle = '#e0604f'; tg.lineWidth = 1.5;
  tg.beginPath(); tg.moveTo(x, 0); tg.lineTo(x, Hc); tg.stroke(); tg.lineWidth = 1;
  tg.fillStyle = '#e0604f'; tg.fillRect(x - 4, 0, 8, 6);
  if (tldrag && tldrag.kind === 'key' && tldrag.started) {
    const nx = tx(tldrag.t1);
    tg.strokeStyle = '#fff'; diamond(nx, rowY(boneNames.indexOf(tldrag.bone)) + ROW / 2, 6); tg.stroke();
  }
}

let tldrag = null;
function tlHit(x, y) {
  if (y < RULER) return { kind: 'ruler' };
  if (y < RULER + EVROW) {
    const evs = anim().events || [];
    for (let i = 0; i < evs.length; i++) if (Math.abs(tx(evs[i][0]) - x) < 7) return { kind: 'event', i };
    return { kind: 'evrow' };
  }
  const i = Math.floor((y - RULER - EVROW) / ROW);
  const bone = boneNames[i];
  if (!bone) return { kind: 'ruler' };
  if (x < NAME_W) return { kind: 'name', bone };
  for (const t of boneKeyTimes(bone).keys()) if (Math.abs(tx(t) - x) < 7) return { kind: 'key', bone, t };
  return { kind: 'row', bone };
}
tlc.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const h = tlHit(e.offsetX, e.offsetY);
  if (h.kind === 'key') { begin(); deleteKeys(h.bone, h.t); changed(); }
  if (h.kind === 'event') { begin(); anim().events.splice(h.i, 1); selEvent = -1; changed(); }
});
tlc.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  tlc.setPointerCapture(e.pointerId);
  const h = tlHit(e.offsetX, e.offsetY);
  playing = false;
  if (h.kind === 'name') { sel = h.bone; selEvent = -1; refreshUI(); return; }
  if (h.kind === 'key') {
    sel = h.bone; selEvent = -1; time = h.t;
    tldrag = { kind: 'key', bone: h.bone, t0: h.t, t1: h.t, x0: e.offsetX, copy: e.altKey, started: false };
    refreshUI(); return;
  }
  if (h.kind === 'event') {
    selEvent = h.i; time = anim().events[h.i][0];
    tldrag = { kind: 'event', i: h.i, x0: e.offsetX, started: false };
    refreshUI(); return;
  }
  if (h.kind === 'row') { sel = h.bone; selEvent = -1; }
  tldrag = { kind: 'scrub' };
  time = snapT(tAt(e.offsetX));
  refreshUI();
});
tlc.addEventListener('pointermove', (e) => {
  if (!tldrag) return;
  const t = snapT(tAt(e.offsetX));
  if (tldrag.kind === 'scrub') { time = t; refreshUI(); return; }
  if (!tldrag.started && Math.abs(e.offsetX - tldrag.x0) < 3) return;
  if (tldrag.kind === 'key') { tldrag.started = true; tldrag.t1 = t; return; }
  if (tldrag.kind === 'event') {
    if (!tldrag.started) { begin(); tldrag.started = true; }
    anim().events[tldrag.i][0] = t; time = t; changed();
  }
});
tlc.addEventListener('pointerup', () => {
  const d = tldrag; tldrag = null;
  if (d && d.kind === 'key' && d.started && Math.abs(d.t1 - d.t0) > 1e-4) {
    begin(); moveKeys(d.bone, d.t0, d.t1, d.copy); time = d.t1; changed();
  }
  if (d && d.kind === 'event' && d.started) { anim().events.sort((a, b) => a[0] - b[0]); selEvent = -1; changed(); }
});
tlc.addEventListener('dblclick', (e) => {
  const h = tlHit(e.offsetX, e.offsetY);
  if (h.kind !== 'evrow') return;
  begin();
  const a = anim();
  a.events = a.events || [];
  a.events.push([snapT(tAt(e.offsetX)), 'hit']);
  a.events.sort((x, y) => x[0] - y[0]);
  selEvent = a.events.findIndex((ev) => ev[1] === 'hit' && Math.abs(ev[0] - snapT(tAt(e.offsetX))) < 1e-4);
  changed();
});

// ---------- панели ----------
function refreshUI() {
  const a = anim();
  // список анимаций
  const list = $('anims');
  list.innerHTML = '';
  for (const name of Object.keys(doc)) {
    const d = document.createElement('div');
    if (name === cur) d.className = 'sel';
    const changedMark = DEFAULT_ANIMS[name] && JSON.stringify(DEFAULT_ANIMS[name]) !== JSON.stringify(doc[name]) ? ' ●' : '';
    d.innerHTML = `<span>${name}${changedMark}</span><small>${USED.includes(name) ? doc[name].duration + ' с' : 'не в игре'}</small>`;
    d.title = changedMark ? 'Изменена относительно стандартной' : '';
    d.onclick = () => selectAnim(name);
    list.appendChild(d);
  }
  $('dur').value = a.duration;
  $('loop').checked = a.loop !== false;
  $('footik').checked = a.footIK !== false;
  $('kneesout').checked = !!a.kneesOut;
  $('a-reset').disabled = !DEFAULT_ANIMS[cur];
  // кость
  $('bname').textContent = sel;
  const ik = ikState();
  $('ikwarn').textContent = ik.legs && LEG_BONES[sel] ? 'Ноги сейчас ставит IK: стопы стоят на земле, ключи бедра и голени не видны. Чтобы присесть, опустите hip (Shift+тяни). Чтобы двигать ноги вручную, снимите «Ноги IK».'
    : ik.arm && (sel === 'armB' || sel === 'foreB') ? 'Эта рука держит рукоять (IK). Снимите «вторая рука на рукояти», чтобы двигать её вручную.' : '';
  const r = sample(sel, 'rotate', time), t = sample(sel, 'translate', time), s = sample(sel, 'scale', time);
  const hasKey = (ch) => keyAt(keysOf(sel, ch), time) >= 0;
  const setIn = (id, v, key) => { const el = $(id); if (document.activeElement !== el) el.value = Math.round(v * 100) / 100; el.style.borderColor = key ? '#f2b84b' : ''; };
  setIn('rot', r[0], hasKey('rotate'));
  setIn('tx', t[0], hasKey('translate')); setIn('ty', t[1], hasKey('translate'));
  setIn('sx', s[0], hasKey('scale')); setIn('sy', s[1], hasKey('scale'));
  // переход ключа
  const chs = boneKeyTimes(sel).get(r3(time));
  const cs = $('curve');
  cs.disabled = !chs;
  if (chs) { const k = keysOf(sel, chs[0]); const key = k[keyAt(k, time)]; cs.value = key[nvals(chs[0]) + 1] || 0; }
  $('k-del').disabled = !chs;
  // событие
  const box = $('evbox');
  const ev = (a.events || [])[selEvent];
  if (ev) {
    box.innerHTML = `<div class="row"><label>Имя</label><input id="ev-name" style="width:90px" value="${ev[1]}"></div>
      <div class="row"><label>Время</label><input id="ev-t" type="number" step="0.01" value="${ev[0]}"> <button id="ev-del">Удалить</button></div>`;
    $('ev-name').onchange = (e) => { begin(); ev[1] = e.target.value.trim() || 'hit'; changed(); };
    $('ev-t').onchange = (e) => { begin(); ev[0] = Math.max(0, Math.min(a.duration, +e.target.value)); a.events.sort((x, y) => x[0] - y[0]); selEvent = a.events.indexOf(ev); changed(); };
    $('ev-del').onclick = () => { begin(); a.events.splice(selEvent, 1); selEvent = -1; changed(); };
  } else box.innerHTML = 'Двойной щелчок по строке «события» добавляет событие, правый щелчок удаляет.';
  // время
  const walkNote = cur === 'walk' && V.walkprev ? ` · в игре цикл ${(STRIDE / GAME_SPEED).toFixed(2)} с` : '';
  $('time').textContent = `${time.toFixed(2)} / ${a.duration.toFixed(2)} с${walkNote}`;
  $('play').textContent = playing ? '⏸ Пауза' : '▶ Пуск';
  $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length;
  $('v-front').classList.toggle('on', !V.back); $('v-back').classList.toggle('on', V.back); $('v-flip').classList.toggle('on', V.flip);
  $('tool').value = V.tool || '';
  $('grip').checked = V.grip;
}

function selectAnim(name) {
  cur = name; time = 0; selEvent = -1; walkDist = 0;
  V.tool = AUTO_TOOL[name] || null;
  V.grip = name === 'swing' && !!TWO_HANDED[V.tool];
  refreshUI();
}

function newName(base) { let n = base, i = 2; while (doc[n]) n = base + i++; return n; }
$('a-new').onclick = () => {
  const name = prompt('Имя новой анимации', newName('anim'));
  if (!name || doc[name]) return;
  begin(); doc[name] = { duration: 1, bones: {} }; cur = name; changed(); selectAnim(name);
};
$('a-dup').onclick = () => { begin(); const n = newName(cur + '_copy'); doc[n] = clone(doc[cur]); changed(); selectAnim(n); };
$('a-ren').onclick = () => {
  const name = prompt('Новое имя', cur);
  if (!name || name === cur || doc[name]) return;
  begin();
  const o = {};
  for (const k of Object.keys(doc)) o[k === cur ? name : k] = doc[k];
  doc = o; invalidate(cur); cur = name; changed();
};
$('a-del').onclick = () => {
  if (Object.keys(doc).length < 2) return;
  if (USED.includes(cur) && !confirm(`Анимацию «${cur}» использует игра. Удалить? В игре вернётся стандартная.`)) return;
  begin(); delete doc[cur]; invalidate(cur); cur = Object.keys(doc)[0]; changed(); selectAnim(cur);
};
$('a-reset').onclick = () => {
  if (!DEFAULT_ANIMS[cur] || !confirm(`Вернуть стандартную «${cur}»? Изменения можно отменить через Ctrl+Z.`)) return;
  begin(); doc[cur] = clone(DEFAULT_ANIMS[cur]); changed();
};
$('dur').onchange = (e) => {
  const v = Math.max(0.05, +e.target.value || 1);
  const a = anim(), k = v / a.duration;
  if (Math.abs(k - 1) < 1e-6) return;
  begin();
  // растягиваем ключи и события вместе с длиной
  for (const tl of Object.values(a.bones || {})) for (const keys of Object.values(tl)) for (const key of keys) key[0] = r3(key[0] * k);
  for (const ev of a.events || []) ev[0] = r3(ev[0] * k);
  a.duration = r3(v); time = Math.min(time, a.duration); changed();
};
const flag = (id, key, def) => { $(id).onchange = (e) => { begin(); const a = anim(); if (e.target.checked === def) delete a[key]; else a[key] = e.target.checked; changed(); }; };
flag('loop', 'loop', true); flag('footik', 'footIK', true); flag('kneesout', 'kneesOut', false);

const numKey = (ch, ids) => ids.forEach((id) => { $(id).onchange = () => {
  begin(); time = snapT(time);
  setKey(sel, ch, time, ids.map((i) => +$(i).value || 0)); changed();
}; });
numKey('rotate', ['rot']); numKey('translate', ['tx', 'ty']); numKey('scale', ['sx', 'sy']);

function setAllKeys() {
  begin(); time = snapT(time);
  setKey(sel, 'rotate', time, sample(sel, 'rotate', time));
  changed();
}
$('k-set').onclick = setAllKeys;
function deleteKeyHere() { begin(); if (deleteKeys(sel, r3(time))) changed(); else undoStack.pop(); }
$('k-del').onclick = deleteKeyHere;
$('curve').onchange = (e) => {
  const c = +e.target.value, tl = anim().bones && anim().bones[sel];
  if (!tl) return;
  begin();
  for (const ch of Object.keys(CH)) { const k = tl[ch]; const i = keyAt(k, time); if (i >= 0) k[i][nvals(ch) + 1] = c; }
  changed();
};

$('v-front').onclick = () => { V.back = false; sk.setSkin('default'); refreshUI(); };
$('v-back').onclick = () => { V.back = true; sk.setSkin('back'); refreshUI(); };
$('v-flip').onclick = () => { V.flip = !V.flip; refreshUI(); };
$('tool').onchange = (e) => { V.tool = e.target.value || null; if (!TWO_HANDED[V.tool]) V.grip = false; refreshUI(); };
$('grip').onchange = (e) => { V.grip = e.target.checked; refreshUI(); };
$('walkprev').onchange = (e) => { V.walkprev = e.target.checked; walkDist = 0; refreshUI(); };
$('onion').onchange = (e) => { V.onion = e.target.checked; };
$('showbones').onchange = (e) => { V.bones = e.target.checked; };

function togglePlay() {
  const a = anim();
  if (!playing && !(a.loop !== false) && time >= a.duration - 1e-4) time = 0;
  playing = !playing; refreshUI();
}
function stepFrame(dir) { playing = false; const s = +$('snap').value; time = Math.max(0, Math.min(anim().duration, snapT(time + dir * s))); refreshUI(); }
$('play').onclick = togglePlay;
$('prev').onclick = () => stepFrame(-1);
$('next').onclick = () => stepFrame(1);
$('undo').onclick = undo; $('redo').onclick = redo;
$('save').onclick = saveFile;
$('load').onclick = openFile;
$('play-game').onclick = () => { saveDraft(); window.open('index.html?draft', '_blank'); };

window.addEventListener('keydown', (e) => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'checkbox';
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.code === 'KeyS') { e.preventDefault(); saveFile(); return; }
  if (typing) return;
  if (mod && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); stepFrame(-1); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); stepFrame(1); }
  else if (e.code === 'KeyK') setAllKeys();
  else if (e.code === 'Delete' || e.code === 'Backspace') {
    if (selEvent >= 0) { begin(); anim().events.splice(selEvent, 1); selEvent = -1; changed(); } else deleteKeyHere();
  }
});
window.addEventListener('beforeunload', (e) => { if (dirtyFile) { saveDraft(); e.preventDefault(); e.returnValue = ''; } });

// ---------- цикл ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) {
    const a = getAnim(), sp = +$('speed').value;
    // ходьба идёт с той же частотой шагов, что в игре
    const walk = cur === 'walk' && V.walkprev;
    const t0 = time;
    let t1 = time + dt * sp * (walk ? a.duration * GAME_SPEED / STRIDE : 1);
    if (walk) walkDist += dt * sp * GAME_SPEED;
    for (const ev of a.events) {
      if ((ev[0] > t0 && ev[0] <= t1) || (t1 >= a.duration && ev[0] <= t1 - a.duration)) flash = { name: ev[1], until: now + 350 };
    }
    if (t1 >= a.duration) {
      if (a.loop) t1 %= a.duration; else { t1 = a.duration; playing = false; }
    }
    time = t1;
    $('time').textContent = `${time.toFixed(2)} / ${a.duration.toFixed(2)} с`;
    if (!playing) refreshUI();
  }
  render();
  requestAnimationFrame(frame);
}

// ---------- запуск ----------
async function init() {
  status('Загрузка…');
  setSpriteScale(4);
  const [A, fileAnims] = await Promise.all([loadArt(), loadAnims()]);
  data = makeFarmerData(A, null);
  sk = new Skeleton(data);
  boneNames = data.bones.map((b) => b.name);
  // концы костей для рисования и выбора мышью (в своих координатах кости)
  const kids = {};
  for (const b of data.bones) if (b.parent) (kids[b.parent] = kids[b.parent] || []).push(b);
  const ikLen = Object.fromEntries((data.ik || []).map((k) => [k.bone2, k.len2]));
  tips = {};
  for (const b of data.bones) {
    if (b.name === 'root' || b.name === 'hip') continue;
    const ch = kids[b.name];
    if (ch) tips[b.name] = [ch.reduce((s, c) => s + (c.x || 0), 0) / ch.length, ch.reduce((s, c) => s + (c.y || 0), 0) / ch.length];
    else if (ikLen[b.name]) tips[b.name] = [0, ikLen[b.name]];
    else if (b.name === 'foreF') tips[b.name] = [0, ikLen.foreB || 6];
    else if (b.name === 'head') tips[b.name] = [0, -12];
    else tips[b.name] = [0, 6];
  }
  // инструменты
  const sel2 = $('tool');
  sel2.innerHTML = '<option value="">ничего</option>' + Object.keys(data.skins.default.tool || {}).map((t) => `<option value="${t}">${t}</option>`).join('');

  doc = { ...clone(DEFAULT_ANIMS), ...(fileAnims ? clone(fileAnims) : {}) };
  let draft = null;
  try { const d = localStorage.getItem(ANIMS_DRAFT_KEY); if (d) { const j = JSON.parse(d); draft = j.animations || j; } } catch (e) { /* нет доступа */ }
  if (draft && JSON.stringify(draft) !== JSON.stringify(doc)) {
    if (confirm('В браузере есть черновик анимаций, который отличается от файла игры. Продолжить с черновиком?\n\nОтмена — открыть анимации из игры.')) {
      doc = { ...doc, ...draft }; dirtyFile = true;
    }
  }
  resize();
  new ResizeObserver(resize).observe($('stage'));
  window.addEventListener('resize', resize);
  selectAnim(doc.walk ? 'walk' : Object.keys(doc)[0]);
  saveDraft();
  requestAnimationFrame(frame);
}
init().catch((e) => { console.error(e); status('Ошибка: ' + e.message); });
