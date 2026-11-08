# Плитки дорожек и травяной край у дорожек.
#
# 1) Плитка дорожки (tile_path*.png — ромб с картинки) → две бесшовные плитки: <имя> и <имя>_2.
#    Как с травой (grass_tiles.py): ромб раскладываем в квадрат в осях клеток, делаем его периодичным
#    (кайма — та же картинка, сдвинутая на полквадрата, граница — по кривому разрезу), у второго
#    варианта та же кайма, а середина другая. Картинку не отражаем и не поворачиваем: у досок
#    направление и у камней свет сверху-слева должны совпадать на всех плитках.
#
# 2) «Камни в траве» (path_stones.png — отдельные плоские камни) → трава + камни посередине клетки:
#    край у плитки — общий травяной, она стыкуется с любой травой.
#
# 3) Травяной край: там, где дорожка граничит с травой, на дорожку немного «заходит» трава
#    (неровно, по травинкам) и ложится мягкая тень. Край рисуется поверх плитки дорожки
#    кусками: 4 полосы вдоль сторон ромба и 4 угла по 4 вида (трава с одной стороны, с другой,
#    с обеих — скруглённый угол, только по диагонали — внутренний угол). Каждый пиксель клетки
#    принадлежит ровно одному куску, поэтому игра (Farm.pathEdge) склеивает нужные куски в одну
#    картинку без швов и наложений. Трава в кусках — та же, что у плитки травы на этих местах
#    (кайма у всех плиток травы общая), поэтому край продолжает соседнюю траву.
import numpy as np
from PIL import Image
from scipy import ndimage
import grass_tiles as G

N = G.N
# Стороны ромба клетки в осях (u, v): u — к соседу gx+1, v — к соседу gy+1.
# nw: u = 0 (сосед gx-1), ne: v = 0 (gy-1), se: u = 1 (gx+1), sw: v = 1 (gy+1)
SIDES = ['nw', 'ne', 'se', 'sw']
# вершины ромба и их стороны: n — верхняя (u=0, v=0), e — правая, s — нижняя, w — левая
VERTS = {'n': ('nw', 'ne'), 'e': ('ne', 'se'), 's': ('se', 'sw'), 'w': ('sw', 'nw')}
W_EDGE = 0.085   # ширина травы, заходящей на дорожку (доля стороны клетки)
R_OUT = 0.16     # радиус скругления внешнего угла дорожки
C_BOX = W_EDGE + R_OUT + 0.02  # угол клетки — квадрат C_BOX × C_BOX у вершины
SOFT = 0.012     # мягкость края травы
K_BLADE = 0.028  # насколько травинки выступают и западают
SH_W, SH_A = 0.07, 0.30  # тень на дорожке вдоль травы: ширина и сила
SH_RGB = np.array([38.0, 30.0, 12.0])


def build(src, flat=4.0):
    """Ромб дорожки (RGB) → [плитка, плитка-2] — квадраты, периодичные по u и v, с общей каймой."""
    t = G.flatten(G.to_square(src), N / flat)
    p = G.make_periodic(t)
    inner = np.roll(p, (N // 2, N // 2), (0, 1))  # середина второго варианта — та же картинка, сдвинутая
    lo, hi = N // 20, int(N * 0.25)
    v1 = G._blend(p, inner, G._outer_mask(p, inner, lo, hi, False))
    return [p, v1]


def _uv(tw, th, density):
    """Центры пикселей плитки tw×th мировых единиц → координаты (u, v) клетки 64×32 посередине."""
    W, H = round(tw * density), round(th * density)
    py, px = np.mgrid[0:H, 0:W].astype(np.float64)
    ox, oy = (tw - 64) / 2 * density, (th - 32) / 2 * density
    xc = (px + 0.5 - ox) / (64 * density) * 2 - 1
    yc = (py + 0.5 - oy) / (32 * density) * 2
    return (xc + yc) / 2, (yc - xc) / 2


def blade_map(grass_sq):
    """Травинки: светлые места травы (высокочастотная яркость) → −2…2, периодично."""
    lum = grass_sq[..., :3] @ np.array([0.3, 0.59, 0.11])
    hp = lum - ndimage.gaussian_filter(lum, N / 32, mode='wrap')
    hp = ndimage.gaussian_filter(hp, N / 200, mode='wrap')  # без мелкой ряби: край — пучками, не точками
    return np.clip(hp / (hp.std() + 1e-6), -2, 2)


def _sample(sq, u, v):
    n = sq.shape[0]
    return ndimage.map_coordinates(sq, [u * n - 0.5, v * n - 0.5], order=1, mode='grid-wrap')


def edge_pieces(grass_rgba, grass_sq, tw, th, density):
    """Куски травяного края. grass_rgba — готовая плитка травы (H×W×4, та же сетка пикселей),
    grass_sq — её квадрат. → {имя: RGBA H×W} (вне своего куска — прозрачно)."""
    u, v = _uv(tw, th, density)
    blade = _sample(blade_map(grass_sq), u, v)
    d = {'nw': u, 'ne': v, 'se': 1 - u, 'sw': 1 - v}  # расстояние до стороны

    def rgba(dist):
        g = np.clip((W_EDGE + K_BLADE * blade - dist) / SOFT + 0.5, 0, 1)        # трава
        s = SH_A * np.clip(1 - (dist - W_EDGE) / SH_W, 0, 1) ** 1.5              # тень под ней
        a = g + s * (1 - g)
        col = (grass_rgba[..., :3] * g[..., None] + SH_RGB * (s * (1 - g))[..., None]) / np.maximum(a, 1e-6)[..., None]
        return np.dstack([np.clip(col, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8)

    # зона пикселя: угол (в квадрате C_BOX у вершины) или ближайшая сторона
    inbox = {k: (d[a] < C_BOX) & (d[b] < C_BOX) for k, (a, b) in VERTS.items()}
    anybox = np.zeros_like(u, bool)
    for m in inbox.values(): anybox |= m
    near = np.argmin(np.stack([d[s] for s in SIDES]), 0)
    out = {}
    for i, s in enumerate(SIDES):
        img = rgba(d[s])
        img[(near != i) | anybox] = 0
        out['path_edge_' + s] = img
    for k, (a, b) in VERTS.items():
        q = np.hypot(np.maximum(C_BOX - d[a], 0), np.maximum(C_BOX - d[b], 0))
        kinds = {a: d[a], b: d[b], 'out': C_BOX - q, 'in': np.hypot(d[a], d[b])}
        for name, dist in kinds.items():
            img = rgba(dist)
            img[~inbox[k]] = 0
            out[f'path_corner_{k}_{name}'] = img
    return out


def crop(img):
    """Прямоугольник непрозрачных пикселей (x0, y0, x1, y1) или None."""
    ys, xs = np.where(img[..., 3] > 0)
    if not len(xs): return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def stones_tile(grass_rgba, stones, layout, density):
    """Трава + плоские камни. stones — список RGBA-картинок камней (уже в пикселях плитки),
    layout — [(номер камня, u, v, ширина в мировых единицах)] — середина камня в осях клетки."""
    out = grass_rgba[..., :3].astype(np.float64).copy()
    H, W = out.shape[:2]
    tw, th = W / density, H / density
    for idx, cu, cv, sw in layout:
        st = stones[idx]
        k = sw * density / st.shape[1]
        im = Image.fromarray(st).resize((max(1, round(st.shape[1] * k)), max(1, round(st.shape[0] * k))), Image.LANCZOS)
        a = np.array(im).astype(np.float64)
        # середина камня → пиксели плитки (клетка 64×32 посередине)
        x = ((cu - cv) * 32 + tw / 2) * density
        y = ((cu + cv) * 16 + (th - 32) / 2) * density
        h, w = a.shape[:2]
        x0, y0 = int(round(x - w / 2)), int(round(y - h * 0.55))
        # мягкая тень под камнем (чуть ниже и правее)
        sh = ndimage.gaussian_filter(a[..., 3] / 255, 2.2 * density / 4)
        _paste(out, np.zeros((h, w, 3)) + SH_RGB, sh * 0.35, x0 + 1, y0 + 2)
        _paste(out, a[..., :3], a[..., 3] / 255, x0, y0)
    return np.dstack([np.clip(out, 0, 255), np.full((H, W), 255.0)]).astype(np.uint8)


def _paste(dst, rgb, al, x0, y0):
    H, W = dst.shape[:2]
    h, w = al.shape
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(W, x0 + w), min(H, y0 + h)
    if dx1 <= dx0 or dy1 <= dy0: return
    a = al[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0][..., None]
    dst[dy0:dy1, dx0:dx1] = dst[dy0:dy1, dx0:dx1] * (1 - a) + rgb[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0] * a
