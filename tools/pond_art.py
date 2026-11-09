"""Картинки прудов: один спрайт на весь пруд (вид — PONDS в src/game/data.js).

    python tools/pond_art.py            # все пруды → assets/art/pond_<вид>.webp + manifest.json
    python tools/pond_art.py pond_drop  # только эти
    python tools/pond_art.py --preview  # ещё и картинки для проверки: пруд на траве с сеткой клеток (.pond-art/)

Пруд собирается из картинок художника: вода — текстура tex_water.png (как раньше вода на клетках),
трава — та же бесшовная трава, что у плиток земли (grass_tiles.py), кувшинки и листья — с листа pond_decor.
Форма берега — по клеткам пруда (PONDS.cells), скруглённая и чуть неровная. Вода ниже земли: у дальнего
берега видна земляная стенка с тенью на воде, у ближнего — пена; трава нависает над водой пучками.

Опора картинки — середина прямоугольника w×h клеток пруда (как у объектов: World.add считает wx, wy так же).
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import grass_tiles as G
import path_tiles as PT
import slice_art as SA

ROOT = SA.ROOT
SRC, OUT = SA.SRC, SA.OUT
HW, HH = SA.TILE_W / 2, SA.TILE_H / 2
D = SA.DENSITY       # пикселей на мировую единицу (как у остальных спрайтов)
R = 48               # точек на клетку в сетке формы
P = 1                # запас вокруг пруда, клеток
DEPTH = 6.0          # насколько вода ниже земли (мировых единиц): высота стенки у дальнего берега
INSET = 0.07         # берег чуть внутри клеток пруда (доля клетки)
ROUND = 0.28         # скругление формы (доля клетки)
WOBBLE = 0.03        # неровность берега
LIP = 0.035          # насколько трава нависает над водой
MARGIN = 4.0         # поля картинки, мировых единиц

# кувшинки и листья на воде: (что, x, y, размер) — x, y в клетках от левого верхнего угла пруда, размер —
# доля ширины спрайта художника. Кувшинки — с листа pond_decor (как раньше на воде).
FLOATS = {
    'pond_small':  [('lily', 1.15, 0.9, 0.7)],
    'pond_drop':   [('lily', 1.35, 1.45, 0.8), ('leaves', 0.75, 0.75, 0.75)],
    'pond_long':   [('lily', 1.55, 1.2, 0.8), ('lily', 3.4, 1.75, 0.65), ('leaves', 2.6, 1.0, 0.8)],
    'pond_round':  [('lily', 2.4, 1.3, 0.85), ('lily', 1.3, 2.55, 0.65), ('leaves', 2.45, 2.4, 0.8)],
    'pond_big':    [('lily', 2.5, 1.4, 0.9), ('lily', 1.5, 3.3, 0.7), ('leaves', 3.3, 3.2, 0.8)],
}


def ponds():
    """PONDS из src/game/data.js (через node: таблица одна — в игре)."""
    js = "import('./src/game/data.js').then((m) => process.stdout.write(JSON.stringify(m.PONDS)))"
    out = subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


_cache = {}


def grass_square():
    if 'g' not in _cache:
        _cache['g'] = G.build(SA.tile_src('tile_grass')[..., :3].astype(np.float64),
                              SA.tile_src('tile_grass_flowers')[..., :3].astype(np.float64))[0]
    return _cache['g']


def water_tex():
    """Текстура воды (вид сверху, бесшовная): 256 пикселей на клетку, цвета — как раньше в игре."""
    if 'w' not in _cache:
        t = np.array(Image.open(os.path.join(SRC, 'tex_water.png')).convert('RGB')).astype(np.float64)
        _cache['w'] = np.clip(t * SA.WATER_GAIN + np.array(SA.WATER_LIFT), 0, 255)
    return _cache['w']


def sprite(name):
    im = Image.open(os.path.join(OUT, name + '.webp')).convert('RGBA')
    with open(os.path.join(OUT, 'manifest.json')) as f: m = json.load(f)[name]
    return np.array(im).astype(np.float64), m


def wrap(img, y, x, order=1):
    return np.stack([ndimage.map_coordinates(img[..., c], [y, x], order=order, mode='grid-wrap')
                     for c in range(img.shape[2])], -1)


def shape_field(mask, rnd, rng):
    """Клетки (маска в сетке R точек на клетку) → «расстояние до берега» в клетках (>0 — внутри),
    скруглённое и чуть неровное."""
    sd = (ndimage.distance_transform_edt(mask) - ndimage.distance_transform_edt(~mask)) / R
    sd = ndimage.gaussian_filter(sd, rnd * R)
    n1 = ndimage.gaussian_filter(rng.standard_normal(mask.shape), 0.3 * R)
    n2 = ndimage.gaussian_filter(rng.standard_normal(mask.shape), 0.12 * R)
    return sd + WOBBLE * n1 / (n1.std() + 1e-9) + 0.4 * WOBBLE * n2 / (n2.std() + 1e-9)


def render(key, p, seed):
    cells = p['cells']
    h, w = p['h'], p['w']
    rng = np.random.default_rng(seed)
    gh, gw = (h + 2 * P) * R, (w + 2 * P) * R
    pond = np.zeros((gh, gw), bool)
    for y, row in enumerate(cells):
        for x, c in enumerate(row):
            if c == 'w': pond[(y + P) * R:(y + P + 1) * R, (x + P) * R:(x + P + 1) * R] = True
    sp = shape_field(pond, ROUND, rng) - INSET
    X0, X1, Y0, Y1, W, H = frame(p)
    py, px = np.mgrid[0:H, 0:W].astype(np.float64)
    X = X0 + (px + 0.5) / D
    Y = Y0 + (py + 0.5) / D

    def grid(xs, ys): return (xs / HW + ys / HH) / 2, (ys / HH - xs / HW) / 2

    def field(f, xs, ys):
        u, v = grid(xs, ys)
        return ndimage.map_coordinates(f, [(v + P) * R - 0.5, (u + P) * R - 0.5], order=1, mode='constant', cval=-1.0)

    gsq = grass_square(); n = gsq.shape[0]
    ug, vg = grid(X, Y)
    grass = wrap(gsq, ug * n - 0.5, vg * n - 0.5)
    blade = ndimage.gaussian_filter(PT._sample(PT.blade_map(gsq), ug, vg), 0.8 * D / 4)
    dP = field(sp, X, Y)
    ground = dP <= LIP * (1 + 0.6 * blade)            # трава, с пучками над водой
    # Вода ниже земли на DEPTH: пиксель видит воду, если и край земли над ним, и вода под ним — внутри пруда;
    # иначе — стенку дальнего берега
    far = np.zeros(X.shape, bool)
    top = np.full(X.shape, DEPTH)
    for t in np.linspace(DEPTH / 8, DEPTH, 8):
        a = field(sp, X, Y - t) <= 0
        top = np.where(a & ~far, t, top); far |= a
    hole = ~ground
    wall = hole & far
    water = hole & ~wall
    # --- вода: текстура по клеткам поверхности воды, в глубине темнее, у берега светлее
    uw, vw = grid(X, Y - DEPTH)
    col = wrap(water_tex(), vw * 256 - 0.5, uw * 256 - 0.5)
    dist = ndimage.distance_transform_edt(sp > 0) / R
    dd = ndimage.map_coordinates(dist, [(vw + P) * R - 0.5, (uw + P) * R - 0.5], order=1)
    deep = np.clip(dd / 1.1, 0, 1)[..., None] ** 0.8
    col = col * (1 - 0.5 * deep) + np.array([22, 96, 132.0]) * 0.5 * deep
    shallow = np.clip(1 - dd / 0.25, 0, 1)[..., None] ** 1.5
    col = col * (1 - 0.4 * shallow) + np.array([140, 220, 205.0]) * 0.4 * shallow
    # --- стенка берега: земля, сверху светлее, к воде темнее, с пластами
    noise = ndimage.gaussian_filter(rng.standard_normal(X.shape), 0.8)

    def earth(depth):
        k = np.clip(depth / DEPTH, 0, 1)[..., None]
        base = np.array([150, 104, 60.0]) * (1 - k) + np.array([84, 56, 34.0]) * k
        return base + (np.sin((Y - depth) * 1.9 + 0.7 * blade) * 6)[..., None] + noise[..., None] * 14
    rgb = np.where(wall[..., None], earth(DEPTH - top), col)
    # тень от стенки на воде и мокрая полоса у воды
    sh = ndimage.gaussian_filter(np.roll(wall.astype(float), int(1.2 * D), 0), 2.0 * D / 4)
    rgb = rgb * (1 - 0.30 * np.clip(sh * 1.6, 0, 1) * water)[..., None]
    wet = ndimage.binary_dilation(wall, iterations=max(1, int(0.8 * D))) & water
    rgb = np.where(wet[..., None], rgb * 0.9 + np.array([200, 235, 230.0]) * 0.1, rgb)
    # пена у ближнего берега
    foam = water & ndimage.binary_dilation(ground & ~far, iterations=max(1, int(0.6 * D)))
    rgb = np.where(foam[..., None], rgb * 0.6 + np.array([235, 250, 245.0]) * 0.4, rgb)
    # --- кувшинки и листья (на воде, ниже травы)
    out = np.dstack([rgb, np.where(hole, 1.0, 0.0)])
    for kind, fx, fy, k in FLOATS.get(key, []):
        img, m = sprite('pond_' + kind)
        sc = k * (m['w'] * D) / img.shape[1]
        im2 = np.array(Image.fromarray(img.astype(np.uint8)).resize(
            (max(1, round(img.shape[1] * sc)), max(1, round(img.shape[0] * sc))), Image.LANCZOS)).astype(np.float64)
        cx = ((fx - fy) * HW - X0) * D + DEPTH * 0  # точка на поверхности воды
        cy = ((fx + fy) * HH - Y0 + DEPTH) * D
        x0, y0 = int(round(cx - im2.shape[1] / 2)), int(round(cy - im2.shape[0] / 2))
        ys, xs = slice(max(0, y0), min(H, y0 + im2.shape[0])), slice(max(0, x0), min(W, x0 + im2.shape[1]))
        sub = im2[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0]
        a = sub[..., 3:] / 255 * water[ys, xs][..., None]
        out[ys, xs, :3] = out[ys, xs, :3] * (1 - a) + sub[..., :3] * a
    # --- трава: пучки над водой (у самого края чуть темнее), снаружи — мягко в траву земли
    lip = ground & (dP > -0.04)
    gcol = np.where(lip[..., None], grass * 0.88, grass)
    out[..., :3] = np.where(ground[..., None], gcol, out[..., :3])
    out[..., 3] = np.where(hole, 1.0, np.clip((dP + 0.06) / 0.04, 0, 1))
    img = np.dstack([np.clip(out[..., :3], 0, 255), out[..., 3] * 255]).astype(np.uint8)
    return img, geo(p)


def frame(p):
    """Рамка картинки пруда в мировых единицах (начало — верхний угол клетки (0, 0) пруда) и размер в пикселях."""
    h, w = p['h'], p['w']
    X0, X1 = -h * HW - MARGIN, w * HW + MARGIN
    Y0, Y1 = -MARGIN, (w + h) * HH + MARGIN
    return X0, X1, Y0, Y1, int(round((X1 - X0) * D)), int(round((Y1 - Y0) * D))


def geo(p):
    """(ширина, высота, опора x, опора y) для manifest: опора — середина прямоугольника клеток пруда."""
    X0, X1, Y0, Y1, _, _ = frame(p)
    return X1 - X0, Y1 - Y0, (p['w'] / 2 - p['h'] / 2) * HW - X0, (p['w'] / 2 + p['h'] / 2) * HH - Y0


def preview(key, p, img, geo, path):
    """Пруд на траве (как в игре) с сеткой клеток и точками декора — для проверки."""
    gsq = grass_square(); n = gsq.shape[0]
    Hh, W = img.shape[:2]
    py, px = np.mgrid[0:Hh, 0:W].astype(np.float64)
    X = px / D - geo[2] + (p['w'] / 2 - p['h'] / 2) * HW
    Y = py / D - geo[3] + (p['w'] / 2 + p['h'] / 2) * HH
    u, v = (X / HW + Y / HH) / 2, (Y / HH - X / HW) / 2
    bg = wrap(gsq, u * n - 0.5, v * n - 0.5)
    a = img[..., 3:] / 255.0
    o = img[..., :3] * a + bg * (1 - a)
    line = (np.abs(u - np.round(u)) < 0.008) | (np.abs(v - np.round(v)) < 0.008)
    o[line] *= 0.8
    im = Image.fromarray(np.clip(o, 0, 255).astype(np.uint8))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(im)
    for kind, x, y in p.get('decor', []):
        sx = ((x - y) * HW) * D + geo[2] * D - (p['w'] / 2 - p['h'] / 2) * HW * D
        sy = ((x + y) * HH) * D + geo[3] * D - (p['w'] / 2 + p['h'] / 2) * HH * D
        dr.ellipse([sx - 6, sy - 6, sx + 6, sy + 6], fill=(255, 40, 40))
        dr.text((sx + 8, sy - 8), kind, fill=(255, 255, 255))
    im.save(path)


def main(args):
    pv = '--preview' in args
    only = [a for a in args if not a.startswith('--')]
    P_ = ponds()
    with open(os.path.join(OUT, 'manifest.json')) as f: man = json.load(f)
    if pv: os.makedirs(os.path.join(ROOT, '.pond-art'), exist_ok=True)
    for i, (key, p) in enumerate(P_.items()):
        if only and key not in only: continue
        drawn = os.path.join(SRC, key + '.png')
        if os.path.exists(drawn):
            # нарисованная художником картинка того же кадра (размер — как у собранной, опора та же)
            _, _, _, _, W, H = frame(p)
            img, g = np.array(Image.open(drawn).convert('RGBA').resize((W, H), Image.LANCZOS)), geo(p)
        else:
            img, g = render(key, p, 7 + i)
        SA.save(Image.fromarray(img), key, g[0], g[1], g[2], g[3], man)
        # рамка непрозрачной части (пиксели): по ней иконка пруда в рюкзаке и на рынке (artSprites.iconOf)
        ys, xs = np.nonzero(img[..., 3] > 8)
        man[key]['icon'] = [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]
        print(f'{key:12s} {img.shape[1]}x{img.shape[0]}' + (' (нарисованная)' if os.path.exists(drawn) else ''))
        if pv: preview(key, p, img, g, os.path.join(ROOT, '.pond-art', key + '.png'))
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1)


if __name__ == '__main__':
    main(sys.argv[1:])
