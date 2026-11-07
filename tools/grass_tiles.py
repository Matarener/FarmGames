# Бесшовные плитки травы из одной картинки-ромба (tile_grass.png) + цветы с tile_grass_flowers.png.
#
# Ромб клетки раскладываем в квадрат в осях клеток: u — вправо-вниз (соседняя клетка по gx),
# v — влево-вниз (по gy). Сетка клеток в этих осях — обычная квадратная решётка, поэтому
# «бесшовно» значит: квадрат периодичен по u и v. Периодичным его делаем, как бесшовные текстуры:
# у края берём ту же картинку, сдвинутую на полквадрата, а границу между ними ведём по месту,
# где картинки меньше всего отличаются (кривой разрез, не прямая линия), — так шва не видно.
#
# Все варианты (простая трава 2 шт., с цветами 2 шт.) получают одинаковую кайму у краёв и разную
# середину, поэтому любые две плитки рядом стыкуются. Отзеркаливать плитки в игре нельзя: кайма
# зеркальной плитки другая (поэтому второй вариант — отдельная картинка).
import numpy as np
from PIL import Image
from scipy import ndimage

N = 512        # сторона квадрата в осях клеток
BAND = 0.22    # ширина полосы у края, в которой ищем разрез (доля стороны)
SS = 4         # плитку считаем в SS раз крупнее и уменьшаем (сглаживание)


def to_square(a, n=N):
    """Ромб на всю картинку a (H×W×C) → квадрат n×n×C, индексы [u, v]."""
    H, W = a.shape[:2]
    t = (np.arange(n) + 0.5) / n
    u, v = np.meshgrid(t, t, indexing='ij')
    x = (0.5 + (u - v) / 2) * W - 0.5
    y = (u + v) / 2 * H - 0.5
    return np.stack([ndimage.map_coordinates(a[..., c], [y, x], order=3, mode='nearest')
                     for c in range(a.shape[2])], -1)


def to_diamond(sq, tw, th, cw, ch, ox, oy):
    """Квадрат (периодичный) → картинка плитки tw×th пикселей. Клетка — ромб cw×ch пикселей,
    её левый верхний угол описанного прямоугольника — (ox, oy) в пикселях картинки."""
    n = sq.shape[0]
    py, px = np.mgrid[0:th, 0:tw].astype(np.float64)
    xc = (px + 0.5 - ox) / cw * 2 - 1    # -1..1 поперёк ромба
    yc = (py + 0.5 - oy) / ch * 2        # 0..2 сверху вниз
    u = (xc + yc) / 2
    v = (yc - xc) / 2
    return np.stack([ndimage.map_coordinates(sq[..., c], [u * n - 0.5, v * n - 0.5], order=3, mode='grid-wrap')
                     for c in range(sq.shape[2])], -1)


def _cut(err, lo, hi, fixed=None):
    """Разрез у края u=0: для каждой строки v — граница c[v] в [lo, hi), соседние отличаются не
    больше чем на 1, сумма err вдоль разреза минимальна. fixed — граница в первой и последней
    строке (чтобы разрез сам был периодичен по v)."""
    n = err.shape[1]
    e = err[lo:hi].T  # [v, c]
    k = hi - lo
    cost = np.full((n, k), np.inf); back = np.zeros((n, k), np.int64)
    if fixed is None: cost[0] = e[0]
    else: cost[0, fixed - lo] = e[0, fixed - lo]
    for j in range(1, n):
        prev = cost[j - 1]
        cand = np.stack([prev, np.r_[np.inf, prev[:-1]], np.r_[prev[1:], np.inf]])  # c, c-1, c+1
        arg = cand.argmin(0)
        cost[j] = cand[arg, np.arange(k)] + e[j]
        back[j] = np.arange(k) + np.array([0, -1, 1])[arg]
    c = np.empty(n, np.int64)
    c[-1] = (fixed - lo) if fixed is not None else cost[-1].argmin()
    for j in range(n - 1, 0, -1): c[j - 1] = back[j, c[j]]
    return c + lo


def _err(a, b):
    d = (a - b) ** 2
    return ndimage.uniform_filter(d.sum(-1), 3)


def _outer_mask(base, inner, lo, hi, periodic):
    """Маска «берём base» у всех четырёх краёв квадрата: по кривому разрезу в полосе [lo, hi)."""
    n = base.shape[0]
    m = np.zeros((n, n), bool)
    fixed = (lo + hi) // 2 if periodic else None
    idx = np.arange(n)
    for flip_u in (False, True):
        for tr in (False, True):
            b, i = base, inner
            if tr: b, i = b.transpose(1, 0, 2), i.transpose(1, 0, 2)
            if flip_u: b, i = b[::-1], i[::-1]
            c = _cut(_err(b, i), lo, hi, fixed)
            mm = idx[:, None] < c[None, :]
            if flip_u: mm = mm[::-1]
            if tr: mm = mm.T
            m |= mm
    return m


def _blend(outer, inner, m, sigma=1.5, wrap=True):
    w = ndimage.gaussian_filter(m.astype(np.float64), sigma, mode='wrap' if wrap else 'nearest')[..., None]
    return outer * w + inner * (1 - w)


def make_periodic(t):
    """Квадрат → периодичный по u и v (кайма — та же картинка, сдвинутая на полквадрата)."""
    n = t.shape[0]
    lo, hi = max(2, n // 40), int(n * BAND)
    p, idx = t, np.arange(n)
    for axis in (0, 1):
        r = np.roll(p, n // 2, axis)
        a, b = (p, r) if axis == 0 else (p.transpose(1, 0, 2), r.transpose(1, 0, 2))
        c0 = _cut(_err(a, b), lo, hi, (lo + hi) // 2)
        c1 = _cut(_err(a[::-1], b[::-1]), lo, hi, (lo + hi) // 2)
        mm = (idx[:, None] < c0[None, :]) | (idx[::-1][:, None] < c1[None, :])
        m = mm if axis == 0 else mm.T
        p = _blend(r, p, m)
    return p


def flatten(t, sigma):
    """Убрать крупные перепады яркости (свет на всю плитку): иначе на поле видна сетка."""
    low = np.stack([ndimage.gaussian_filter(t[..., c], sigma, mode='reflect') for c in range(3)], -1)
    return t - low + low.reshape(-1, 3).mean(0)


def match_colors(src, ref, mask_src=None):
    """Средний цвет и разброс src → как у ref (по каналам)."""
    s = src[mask_src] if mask_src is not None else src.reshape(-1, 3)
    r = ref.reshape(-1, 3)
    return (src - s.mean(0)) / (s.std(0) + 1e-6) * r.std(0) + r.mean(0)


def flower_layer(f, ref, margin):
    """Цветы с картинки f (квадрат) как отдельный слой: (цвет, альфа). Только те, что целиком
    внутри (дальше margin от краёв), — чтобы край плитки остался общим."""
    rgb = f[..., :3]
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    petals = (B > 95) | ((R > G + 8) & (R > 150))
    petals = ndimage.binary_opening(petals, iterations=1)
    lab, k = ndimage.label(ndimage.binary_dilation(petals, iterations=6))
    n = f.shape[0]
    keep = np.zeros_like(petals)
    for sl, i in zip(ndimage.find_objects(lab), range(1, k + 1)):
        (u0, u1), (v0, v1) = (sl[0].start, sl[0].stop), (sl[1].start, sl[1].stop)
        if min(u0, v0) > margin and max(u1, v1) < n - margin and (lab[sl] == i).sum() > 30:
            keep |= lab == i
    # цветок вместе с листиками вокруг (трава под ними перекрашена под основную)
    alpha = ndimage.gaussian_filter((ndimage.binary_dilation(petals & keep, iterations=7)).astype(np.float64), 3)
    grass = ~ndimage.binary_dilation(petals, iterations=8)
    # трава и листья вокруг — под цвет основной травы, сами лепестки — как нарисованы
    col = match_colors(rgb, ref, grass)
    pm = ndimage.gaussian_filter(ndimage.binary_dilation(petals, iterations=2).astype(np.float64), 1)[..., None]
    col = rgb * pm + col * (1 - pm)
    return col, np.clip(alpha * 1.6, 0, 1)


def build(grass, flowers):
    """Ромбы травы и травы с цветами (RGB, без обводки) → 4 квадрата: трава, трава-2 (другая
    середина), с цветами, с цветами-2. Кайма у краёв у всех одна и та же."""
    t = flatten(to_square(grass), N / 6)
    f = to_square(flowers)
    p = make_periodic(t)
    lo, hi = N // 20, int(N * 0.25)
    inner = t.transpose(1, 0, 2)  # середина второго варианта — та же трава, отражённая
    v1 = _blend(p, inner, _outer_mask(p, inner, lo, hi, False))
    out = [p, v1]
    margin = int(N * 0.07)
    for base, fl in ((p, f), (v1, np.roll(f, (N // 2, N // 2), (0, 1)))):
        col, al = flower_layer(fl, t, margin)
        out.append(base * (1 - al[..., None]) + col * al[..., None])
    return out


def render(sq, tw, th, density):
    """Квадрат → плитка tw×th мировых единиц (клетка 64×32 посередине, по краям запас на стык)."""
    W, H = round(tw * density), round(th * density)
    k = SS * density
    d = to_diamond(np.clip(sq, 0, 255), W * SS, H * SS, 64 * k, 32 * k, (tw - 64) / 2 * k, (th - 32) / 2 * k)
    img = Image.fromarray(np.clip(d, 0, 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
    return np.array(img.convert('RGBA'))
