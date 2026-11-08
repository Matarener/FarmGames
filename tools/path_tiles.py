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
#
# 4) Переход между видами дорожек: так же кусками, только заходит не трава, а соседняя дорожка
#    вида выше по слою (data.js PATHS.layer): камни ложатся на песок неровным краем по самим камням
#    с тенью, настил — ровным краем с тенью. Плитки периодичные, поэтому картинка соседа в кусках
#    продолжает его плитку без шва. Куски — blend_<вид>_*, параметры — BLEND.
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


def blade_map(sq, hp=N / 32, blur=N / 200):
    """Неровность края: светлые места картинки (высокочастотная яркость) → −2…2, периодично.
    У травы — травинки, у камней — сами камни (тёмные щели между ними край обходит)."""
    lum = sq[..., :3] @ np.array([0.3, 0.59, 0.11])
    hpass = lum - ndimage.gaussian_filter(lum, hp, mode='wrap')
    hpass = ndimage.gaussian_filter(hpass, blur, mode='wrap')  # без мелкой ряби: край — пучками, не точками
    return np.clip(hpass / (hpass.std() + 1e-6), -2, 2)


def _sample(sq, u, v):
    n = sq.shape[0]
    return ndimage.map_coordinates(sq, [u * n - 0.5, v * n - 0.5], order=1, mode='grid-wrap')


def _disk(r):
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def stone_map(sq, r=20, t=14, rim=3, min_area=150):
    """Отдельные камни периодичной картинки (булыжник, плиты). Камень — светлее узких тёмных щелей вокруг
    (чёрная «шляпа» яркости: щель уже 2r пикселей), с тёмным контуром. → (n×n×4): для каждого пикселя
    квадрата — границы его камня целиком (и за краем квадрата) относительно самого пикселя в долях
    клетки: minU, maxU, minV, maxV (u — строки, v — столбцы); у щелей — nan."""
    n = sq.shape[0]
    lum = ndimage.gaussian_filter(sq[..., :3] @ np.array([0.3, 0.59, 0.11]), 1.5, mode='wrap')
    tophat = ndimage.grey_closing(lum, footprint=_disk(r), mode='wrap') - lum
    stone = ndimage.binary_opening(tophat < t, structure=_disk(3))
    lab, cnt = ndimage.label(np.tile(stone, (3, 3)))  # 3×3 квадрата: камень через край — целиком
    dist, (ir, ic) = ndimage.distance_transform_edt(lab == 0, return_indices=True)
    lab = np.where(dist <= rim, lab[ir, ic], 0)  # тёмный контур — к своему камню
    area = np.bincount(lab.ravel(), minlength=cnt + 1)
    lab[area[lab] < min_area] = 0  # крошки между камнями — щель
    ext = np.full((cnt + 1, 4), np.nan)
    for l, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl: ext[l] = sl[0].start, sl[0].stop - 1, sl[1].start, sl[1].stop - 1
    L = lab[n:2 * n, n:2 * n]
    rows, cols = np.mgrid[n:2 * n, n:2 * n]
    e = ext[L]
    e[L == 0] = np.nan
    return np.dstack([e[..., 0] - rows, e[..., 1] - rows, e[..., 2] - cols, e[..., 3] - cols]) / n


# Как край заходит на дорожку. w — ширина, k — неровность (по blade_map), soft — мягкость,
# r — скругление внешнего угла (там, где край с двух сторон), sharp — углы прямые (настил),
# sh_w/sh_a — тень вдоль края, blade — параметры blade_map.
# Неровность не должна доходить до стороны клетки: w − 2k > soft (иначе на стыке клеток — шов).
# stones — край из целых камней (stone_map: r, t): камень соседа, который заходит за сторону, ложится
# целиком (не глубже w_max); камень целиком в клетке ближе w_in к стороне (и не глубже w_dec) — тоже;
# щели между камнями — шириной w; тень — от камней вниз.
GRASS = dict(w=W_EDGE, k=K_BLADE, soft=SOFT, r=R_OUT, sh_w=SH_W, sh_a=SH_A)
# Переход между видами дорожек: вид выше по слою (data.js PATHS.layer) заходит на соседний нижний
BLEND = {
    'tile_path':        dict(w=0.008, k=0.0, soft=0.01, r=0.06, stones=(20, 14), w_in=0.07, w_dec=0.2, w_max=0.5, sh_a=0.38),
    'tile_path_cobble': dict(w=0.008, k=0.0, soft=0.01, r=0.06, stones=(20, 22), w_in=0.07, w_dec=0.2, w_max=0.5, sh_a=0.42),
    'tile_path_planks': dict(w=0.022, k=0.0, soft=0.006, r=0.0, sharp=True, sh_w=0.06, sh_a=0.30),
}


def edge_pieces(mat_rgba, mat_sq, tw, th, density, prm=GRASS, prefix='path_'):
    """Куски края: на дорожку заходит соседняя картинка mat (трава или другой вид дорожки).
    mat_rgba — её готовая плитка (H×W×4, та же сетка пикселей), mat_sq — её квадрат (периодичный:
    у клетки рядом картинка продолжается без шва). → {имя: RGBA H×W} (вне своего куска — прозрачно)."""
    W, K, SF, R = prm['w'], prm['k'], prm['soft'], prm['r']
    box = max(W + R, W + 2 * K + SF, prm.get('w_in', 0) + 0.04) + 0.02  # угол клетки — квадрат box × box у вершины
    u, v = _uv(tw, th, density)
    blade = _sample(blade_map(mat_sq, *prm.get('blade', (N / 32, N / 200))), u, v) if K else np.zeros_like(u)
    d = {'nw': u, 'ne': v, 'se': 1 - u, 'sw': 1 - v}  # расстояние до стороны
    if 'stones' in prm:
        n = mat_sq.shape[0]
        st = stone_map(mat_sq, *prm['stones'])
        i, j = np.floor(u * n).astype(int) % n, np.floor(v * n).astype(int) % n
        e = st[i, j]  # границы камня под пикселем: minU, maxU, minV, maxV
        is_st = ~np.isnan(e[..., 0])
        e = np.nan_to_num(e)
        dmin = {'nw': u + e[..., 0], 'ne': v + e[..., 2], 'se': 1 - u - e[..., 1], 'sw': 1 - v - e[..., 3]}
        dmax = {'nw': u + e[..., 1], 'ne': v + e[..., 3], 'se': 1 - u - e[..., 0], 'sw': 1 - v - e[..., 2]}
        inside = np.min(np.stack(list(dmin.values())), 0) >= 0  # камень целиком в клетке

    def paint(g, s):
        a = g + s * (1 - g)
        col = (mat_rgba[..., :3] * g[..., None] + SH_RGB * (s * (1 - g))[..., None]) / np.maximum(a, 1e-6)[..., None]
        return np.dstack([np.clip(col, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8)

    def piece(fn, zone):
        """fn(расстояния до сторон) → расстояние до края этого куска (неубывающее по каждой стороне);
        zone — пиксели куска. Камни кусок рисует целиком и за своей зоной: где камни решили класть
        несколько кусков, они совпадают пиксель в пиксель, а камень не режется на границе зон."""
        dist = fn(d)
        g = np.clip((W + K * blade - dist) / SF + 0.5, 0, 1)                      # картинка соседа
        if 'stones' not in prm:
            s = prm['sh_a'] * np.clip(1 - (dist - W) / prm['sh_w'], 0, 1) ** 1.5      # тень вдоль края
            img = paint(g, s)
            img[~zone] = 0
            return img
        lo, hi = fn(dmin), fn(dmax)
        # камень за стороной соседа — продолжается целиком (не глубже w_max); целый камень внутри
        # клетки у самого края — тоже кладём (край неровный); камни за другими сторонами — нет
        fade = np.clip((prm['w_max'] - dist) / SF + 0.5, 0, 1)
        deco = inside & (lo < prm['w_in']) & (hi < prm['w_dec'])
        sa = np.where(is_st, np.where(lo < 0.004, fade, deco.astype(float)), 0)
        gs = ndimage.gaussian_filter(sa, 0.6)                                         # гладкий контур камней
        gz = np.clip(gs + ndimage.gaussian_filter(np.where(is_st, 0, g), 0.6), 0, 1)  # и щели между ними
        sh = ndimage.shift(ndimage.gaussian_filter(gz, 1.6 * density / 4), (2.0 * density / 4, 1.0 * density / 4), order=1)
        img = paint(gz, prm['sh_a'] * np.clip(sh, 0, 1))                              # тень от камней вниз
        out = paint(gs, np.zeros_like(gs))
        return np.where(zone[..., None], img, out)

    # зона пикселя: угол (в квадрате box у вершины) или ближайшая сторона
    inbox = {k: (d[a] < box) & (d[b] < box) for k, (a, b) in VERTS.items()}
    anybox = np.zeros_like(u, bool)
    for m in inbox.values(): anybox |= m
    near = np.argmin(np.stack([d[s] for s in SIDES]), 0)
    out = {}
    for i, s in enumerate(SIDES):
        out[prefix + 'edge_' + s] = piece(lambda dd, s=s: dd[s], (near == i) & ~anybox)
    for k, (a, b) in VERTS.items():
        if prm.get('sharp'):  # прямые углы: снаружи — обе полосы, внутри — квадратик
            outer = lambda dd, a=a, b=b: np.minimum(dd[a], dd[b])
            inner = lambda dd, a=a, b=b: np.maximum(dd[a], dd[b])
        else:  # скруглённые: снаружи — дуга радиуса r, внутри — четверть круга
            outer = lambda dd, a=a, b=b: box - np.hypot(np.maximum(box - dd[a], 0), np.maximum(box - dd[b], 0))
            if 'stones' in prm:  # у камня за стороной расстояние отрицательное — считаем 0
                inner = lambda dd, a=a, b=b: np.hypot(np.maximum(dd[a], 0), np.maximum(dd[b], 0))
            else:
                inner = lambda dd, a=a, b=b: np.hypot(dd[a], dd[b])
        kinds = {a: lambda dd, a=a: dd[a], b: lambda dd, b=b: dd[b], 'out': outer, 'in': inner}
        for name, fn in kinds.items():
            out[f'{prefix}corner_{k}_{name}'] = piece(fn, inbox[k])
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
