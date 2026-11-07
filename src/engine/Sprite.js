// Процедурные и загружаемые спрайты. Всё рисуется один раз в offscreen-канвас
// в нужном разрешении, а в кадре — только drawImage (дёшево на любом GPU).

let SCALE = 2;
export function setSpriteScale(s) { SCALE = s; }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// draw(g) рисует в мировых единицах, начало координат — точка опоры.
export function makeSprite(w, h, ax, ay, draw, scale = SCALE) {
  const c = makeCanvas(w * scale, h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.translate(ax, ay);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g);
  return { canvas: c, w: c.width / scale, h: c.height / scale, ax, ay };
}

// Затемнённая копия (для закрытых территорий) — создаётся лениво.
export function dimSprite(s, k = 0.62, tint = [16, 38, 26]) {
  if (s.dim) return s.dim;
  const c = makeCanvas(s.canvas.width, s.canvas.height);
  const g = c.getContext('2d');
  g.drawImage(s.canvas, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${1 - k})`;
  g.fillRect(0, 0, c.width, c.height);
  s.dim = { canvas: c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
  return s.dim;
}

export function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('не загрузилась картинка ' + url));
    img.src = url;
  });
}

// Картинка с повторами: на мобильной связи (и в Telegram) отдельные запросы иногда обрываются.
// Повтор идёт с меткой в адресе, чтобы не получить из кэша тот же оборванный ответ.
export async function loadImageRetry(url, tries = 5) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const img = await loadImage(i ? url + (url.includes('?') ? '&' : '?') + 'r=' + i : url);
      // распаковать заранее, вне основного потока — иначе это случится рывком при первом рисовании
      if (img.decode) await img.decode().catch(() => {});
      return img;
    } catch (e) { err = e; }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i)); // 0.5, 1, 2, 4 с
  }
  throw err;
}

// Детерминированный ГПСЧ
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
