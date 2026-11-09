"""Заборы (FENCES в src/game/data.js): столбик и пролёт на полклетки из двух картинок художника.

    python tools/fence_art.py                  # все виды
    python tools/fence_art.py fence_picket     # только этот вид
    python tools/fence_art.py --preview        # ещё и картинки для проверки в .fence-art/

assets/source/<вид>_post.png  — столбик в изометрии на прозрачном фоне (как другие постройки);
assets/source/<вид>_panel.png — пролёт забора спереди, плоско (без перспективы), на прозрачном фоне, повторяется
                                 по горизонтали без шва (правый край продолжает левый).
Результат: assets/art/<вид>_post.webp и <вид>_span.webp + записи в manifest.json.
Пролёт лежит от середины клетки (опора картинки) к соседу gx + 1: на экране на 16 единиц вправо и на 8 вниз.
Изометрия не меняет вертикали, поэтому плоский пролёт просто скашивается: низ — по линии земли, высота — H.
Игра склеивает из них секцию по соседям (artSprites.fenceSprite): пролёты к gx − 1 — тот же со сдвигом,
к соседям по gy — его зеркало; столбик — поверх пролётов.
"""
import json, os, sys
import numpy as np
from PIL import Image
from slice_art import load, components, save, OUT, SRC, DENSITY, ROOT

# вид: высота столбика и пролёта (единицы мира), насколько опора столбика выше его нижней точки,
# cut — какую часть пролёта по ширине брать (доли: одна повторяющаяся часть узора)
FENCES = {
    'fence_wattle': {'post_h': 24, 'post_lift': 2, 'panel_h': 17},
    'fence_picket': {'post_h': 25, 'post_lift': 2, 'panel_h': 19},
    'fence_stone': {'post_h': 17, 'post_lift': 3, 'panel_h': 12},
}
HALF = (16, 8)  # пролёт на полклетки: от середины клетки к середине её стороны (единицы мира)
SS = 3  # во сколько раз крупнее считать скос (потом — уменьшение с хорошим сглаживанием)


def crop_alpha(a):
    m = a[..., 3] > 0
    ys, xs = np.where(m.any(1))[0], np.where(m.any(0))[0]
    return a[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]


def post(kind, cfg, man):
    a = load(kind + '_post')
    (y0, y1, x0, x1, i), = components(a, 1)[0]
    crop = a[y0:y1, x0:x1].copy()
    m = crop[..., 3] > 128
    ys = np.where(m.any(1))[0]
    low = m[int(ys[-1] - (ys[-1] - ys[0]) * 0.15):]
    xs = np.where(low.any(0))[0]
    k = cfg['post_h'] / (y1 - y0)
    W, H = (x1 - x0) * k, (y1 - y0) * k
    img = Image.fromarray(crop).resize((max(1, round(W * DENSITY)), max(1, round(H * DENSITY))), Image.LANCZOS)
    save(img, kind + '_post', W, H, (xs[0] + xs[-1]) / 2 * k, ys[-1] * k - cfg['post_lift'], man)
    return img


def span(kind, cfg, man):
    a = crop_alpha(load(kind + '_panel'))
    c0, c1 = cfg.get('cut', (0, 1))
    a = a[:, int(a.shape[1] * c0):int(round(a.shape[1] * c1))]
    hp, wp = a.shape[:2]
    H = cfg['panel_h']
    W, Ht = HALF[0], H + HALF[1]  # картинка: x 0…16, y от −H (верх у столбика) до 8 (низ у края клетки)
    ow, oh = round(W * DENSITY * SS), round(Ht * DENSITY * SS)
    D = DENSITY * SS
    # выход (X, Y) → пролёт (u, v): u = X·wp/(16·D), v = (Y − X/2)·hp/(H·D)
    big = Image.fromarray(a).transform((ow, oh), Image.AFFINE,
                                       (wp / (W * D), 0, 0, -hp / (2 * H * D), hp / (H * D), 0), Image.BICUBIC)
    img = big.resize((round(W * DENSITY), round(Ht * DENSITY)), Image.LANCZOS)
    save(img, kind + '_span', W, Ht, 0, H, man)
    return img


def preview(kind, man):
    """Секции по соседям, как их склеит игра: прямая вдоль gx, угол, крест, одиночная."""
    pv = os.path.join(ROOT, '.fence-art')
    os.makedirs(pv, exist_ok=True)
    P = Image.open(os.path.join(OUT, kind + '_post.webp')).convert('RGBA')
    S = Image.open(os.path.join(OUT, kind + '_span.webp')).convert('RGBA')
    p, s = man[kind + '_post'], man[kind + '_span']
    Sm = S.transpose(Image.FLIP_LEFT_RIGHT)
    k = DENSITY
    cells = [(0, 0), (1, 0), (2, 0), (2, 1), (2, 2), (1, 2), (3, 1)]
    has = set(cells)
    out = Image.new('RGBA', (int(260 * k), int(150 * k)), (110, 160, 80, 255))
    ox, oy = 110 * k, 40 * k
    from PIL import ImageDraw
    d = ImageDraw.Draw(out)
    for gy in range(-1, 5):
        for gx in range(-1, 5):
            cx, cy = (gx - gy) * 32 * k + ox, (gx + gy + 1) * 16 * k + oy
            d.polygon([(cx, cy - 16 * k), (cx + 32 * k, cy), (cx, cy + 16 * k), (cx - 32 * k, cy)], outline=(80, 120, 60, 255))
    for gx, gy in sorted(cells, key=lambda c: c[0] + c[1]):
        cx, cy = (gx - gy) * 32 * k + ox, (gx + gy + 1) * 16 * k + oy
        mask = ((gx + 1, gy) in has) | ((gx, gy + 1) in has) << 1 | ((gx - 1, gy) in has) << 2 | ((gx, gy - 1) in has) << 3
        mask = mask or 5
        parts = []
        if mask & 4: parts.append((S, s['ax'], -16, -8))
        if mask & 8: parts.append((Sm, s['w'] - s['ax'], 16, -8))
        if mask & 1: parts.append((S, s['ax'], 0, 0))
        if mask & 2: parts.append((Sm, s['w'] - s['ax'], 0, 0))
        parts.append((P, p['ax'], 0, 0))
        for im, ax, dx, dy in parts:
            ay = s['ay'] if im is not P else p['ay']
            out.alpha_composite(im, (int(cx + (dx - ax) * k), int(cy + (dy - ay) * k)))
    out.save(os.path.join(pv, kind + '.png'))
    print('.fence-art/' + kind + '.png')


def main(args):
    only = [a for a in args if not a.startswith('--')]
    with open(os.path.join(OUT, 'manifest.json')) as f: man = json.load(f)
    for kind, cfg in FENCES.items():
        if only and kind not in only: continue
        if not (os.path.exists(os.path.join(SRC, kind + '_post.png')) and os.path.exists(os.path.join(SRC, kind + '_panel.png'))):
            print(kind, ': нет картинок', kind + '_post.png /', kind + '_panel.png')
            continue
        post(kind, cfg, man)
        span(kind, cfg, man)
        print(kind, 'ok')
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1)
    if '--preview' in args:
        for kind in FENCES:
            if (not only or kind in only) and kind + '_span' in man: preview(kind, man)


if __name__ == '__main__':
    main(sys.argv[1:])
