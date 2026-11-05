"""Нарезка листов художника (assets/source/*.png, прозрачный фон) в спрайты игры.

    python tools/slice_art.py

Результат: assets/art/<имя>.webp и assets/art/manifest.json
(размеры и точка опоры в мировых единицах; клетка = 64×32).
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets', 'art')
DENSITY = 4  # пикселей на мировую единицу
TILE_W, TILE_H = 64, 32

# Лист → объекты по порядку (сверху вниз, слева направо) и ширина «пятачка» под объектом
# в мировых единицах (по ней считается масштаб).
SHEETS = {
    'trees':  [('tree_oak', 62), ('tree_apple', 62), ('tree_sakura', 62), ('tree_pine', 60)],
    'trees2': [('tree_blossom', 62), ('tree_autumn', 62), ('tree_birch', 60)],
    'rocks':  [('rock_big', 118), ('rock_mid', 54), ('rock_small', 40), ('rock_moss', 116)],
    'bushes': [('bush_blue', 40), ('bush_rasp', 40), ('bush_pink', 40),
               ('bush_hydra', 40), ('bush_lav', 40), ('bush_rose', 40)],
    # отрицательная ширина: «пятачок» — весь ромб объекта (ширина по краям картинки)
    'stumps': [('stump_oak', -42), ('stump_birch', -38), ('stump_pine', -42), ('stump_moss', -42)],
    'stumps2': [('stump_apple', -42), ('stump_sakura', -42), ('stump_blossom', -42), ('stump_autumn', -42)],
    'house1': [('house_1', -132)], 'house2': [('house_2', -132)], 'house3': [('house_3', -132)], 'house4': [('house_4', -132)], 'house5': [('house_5', -132)],
}
# Урожай: лист = 5 стадий слева направо, сверху вниз; в игре 4 стадии (третью пропускаем).
# Растения заполняют ромб грядки: масштаб по ширине, опора — центр ромба.
CROPS = {'crop_wheat': 'wheat', 'crop_carrot': 'carrot', 'crop_beet': 'beet',
         'crop_tomato': 'tomato', 'crop_sunflower': 'sunflower', 'crop_pumpkin': 'pumpkin',
         'crop_strawberry': 'strawberry', 'crop_cotton': 'cotton',
         'crop_corn': ('corn', [0, 1, 2, 3])}  # у кукурузы на 5-й стадии лишние корнеплоды
CROP_STAGES = [0, 1, 3, 4]
CROP_W = 54

TILE_SHEETS = [('tiles', ['tile_grass', 'tile_flowers', 'tile_soil', 'tile_sand']),
               ('tiles_water', ['water_0', 'water_lily', 'water_reed', 'water_spark']),
               ('tiles_path', ['tile_cobble', 'tile_planks', 'tile_sand2', 'tile_soil_wet'])]


# Иконки интерфейса: листы на тёмном фоне со свечением (не прозрачные) — фон срезаем по контуру.
ICON_SHEETS = {
    'ui_res': ['coin', 'gem', 'energy', 'star', 'wood', 'stone', 'ore', 'water'],
    'ui_btn': ['bag', 'market', 'house', 'center', 'walk', 'dig', 'seed', 'lock'],
    'ui_crops': ['carrot', 'wheat', 'beet', 'cabbage', 'tomato', 'corn', 'sunflower', 'pumpkin', 'strawberry', 'cotton'],
    'ui_avatar': ['avatar'],
}
ICON_PX = 128


def cut_dark_bg(a):
    """Маска объектов на гладком тёмном фоне: фон — всё, что связано с краем листа без резких перепадов."""
    rgb = ndimage.gaussian_filter(a[..., :3].astype(float), (1, 1, 0))
    g = sum(np.hypot(ndimage.sobel(rgb[..., c], 0), ndimage.sobel(rgb[..., c], 1)) for c in range(3))
    lab, k = ndimage.label(~ndimage.binary_dilation(g > 120))
    border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    bg = np.isin(lab, list(border))
    # фон, запертый внутри (кольцо прицела, дужка замка): большой гладкий кусок цвета фона
    bgc = ndimage.gaussian_filter(np.where(bg[..., None], rgb, 0), (40, 40, 0)) / \
        np.maximum(ndimage.gaussian_filter(bg.astype(float), 40), 1e-3)[..., None]
    idx = np.arange(1, k + 1)
    size = ndimage.sum(np.ones(lab.shape), lab, idx)
    diff = sum(np.abs(ndimage.mean(rgb[..., c], lab, idx) - ndimage.mean(bgc[..., c], lab, idx)) for c in range(3))
    enclosed = [i for i in idx[(size > 5000) & (diff < 40)] if i not in border]
    bg |= np.isin(lab, enclosed)
    obj = ndimage.binary_opening(~bg, iterations=2)
    lab, k = ndimage.label(obj)
    sizes = ndimage.sum(obj, lab, range(1, k + 1))
    return np.isin(lab, np.where(sizes > 1500)[0] + 1)


def icons():
    names = []
    for sheet, items in ICON_SHEETS.items():
        a = np.array(Image.open(os.path.join(SRC, sheet + '.png')).convert('RGBA'))
        a[..., 3] = np.where(cut_dark_bg(a), 255, 0)
        boxes, lab = components(a, len(items))
        for (y0, y1, x0, x1, i), name in zip(boxes, items):
            c = a[y0:y1, x0:x1].copy()
            c[lab[y0:y1, x0:x1] != i, 3] = 0
            img = Image.fromarray(c)
            k = ICON_PX / max(img.size)
            img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
            sq = Image.new('RGBA', (ICON_PX, ICON_PX))
            sq.paste(img, ((ICON_PX - img.width) // 2, (ICON_PX - img.height) // 2))
            sq.save(os.path.join(OUT, 'ic_' + name + '.webp'), 'WEBP', quality=90, method=6)
            names.append(name)
            print(f'ic_{name}')
    with open(os.path.join(OUT, 'icons.json'), 'w') as f:
        json.dump(names, f)


def load(name):
    a = np.array(Image.open(os.path.join(SRC, name + '.png')).convert('RGBA'))
    al = a[..., 3].astype(np.float32)
    # дымка/свечение генератора: слабая альфа вдали от объекта
    solid = al >= 200
    dist = ndimage.distance_transform_edt(~solid)
    al[(al < 200) & (dist > 2)] = 0
    al[al < 40] = 0
    a[..., 3] = al.astype(np.uint8)
    return a


def components(a, n, dilate=0):
    m = a[..., 3] > 0
    g = ndimage.binary_dilation(m, iterations=dilate) if dilate else m  # ростки по отдельности — склеить
    lab, k = ndimage.label(g, structure=np.ones((3, 3)))
    sizes = ndimage.sum(m, lab, range(1, k + 1))
    main = list(np.argsort(sizes)[::-1][:n] + 1)
    # мелкие кусочки (цветы, камешки у основания) — к ближайшему крупному объекту
    core = np.isin(lab, main)
    _, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    lab = np.where(m, lab[iy, ix], 0)
    boxes = []
    for i in main:
        ys, xs = np.where(lab == i)
        boxes.append((ys.min(), ys.max() + 1, xs.min(), xs.max() + 1, i))
    # строки: группируем по вертикальному центру
    boxes.sort(key=lambda b: (b[0] + b[1]) / 2)
    rows, cur = [], [boxes[0]]
    for b in boxes[1:]:
        if (b[0] + b[1]) / 2 - (cur[-1][0] + cur[-1][1]) / 2 > (cur[-1][1] - cur[-1][0]) * 0.45:
            rows.append(cur); cur = [b]
        else:
            cur.append(b)
    rows.append(cur)
    out = []
    for r in rows:
        out += sorted(r, key=lambda b: b[2])
    return out, lab


def base_of(crop):
    """Ширина и центр основания: самая широкая строка в нижних 18% объекта."""
    m = crop[..., 3] > 128
    h = m.shape[0]
    best = (0, 0, 0)
    for y in range(int(h * 0.82), h):
        xs = np.where(m[y])[0]
        if len(xs) and xs[-1] - xs[0] > best[0]:
            best = (xs[-1] - xs[0], (xs[0] + xs[-1]) / 2, y)
    return best


def save(img, name, w, h, ax, ay, man):
    img.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6)
    man[name] = {'w': round(w, 2), 'h': round(h, 2), 'ax': round(ax, 2), 'ay': round(ay, 2)}


def main():
    os.makedirs(OUT, exist_ok=True)
    man = {}
    for sheet, items in SHEETS.items():
        a = load(sheet)
        boxes, lab = components(a, len(items))
        for (y0, y1, x0, x1, i), (name, base_w) in zip(boxes, items):
            crop = a[y0:y1, x0:x1].copy()
            crop[lab[y0:y1, x0:x1] != i, 3] = 0
            if base_w < 0:  # ромб на всю ширину: опора — его центр
                m = crop[..., 3] > 128
                xs = np.where(m.any(0))[0]; ys = np.where(m.any(1))[0]
                bw, bx, by = xs[-1] - xs[0], (xs[0] + xs[-1]) / 2, ys[-1]
                base_w = -base_w
            else:
                bw, bx, by = base_of(crop)
                # у деревьев «пятачок» травы — ромб, его самая широкая строка и есть центр
                # (как у пней, иначе пень встаёт выше дерева)
                if sheet.startswith('trees'): by += bw / 4
            k = base_w / bw  # мир/пиксель
            W, H = (x1 - x0) * k, (y1 - y0) * k
            img = Image.fromarray(crop).resize((max(1, round(W * DENSITY)), max(1, round(H * DENSITY))), Image.LANCZOS)
            # опора — центр ромба основания (низ минус четверть ширины)
            save(img, name, W, H, bx * k, (by - bw / 4) * k, man)
            print(f'{name:14s} {x1-x0}x{y1-y0}px -> {W:.0f}x{H:.0f} u')

    # Плитки земли: вырезаем ромб чуть внутри контура (без тёмной обводки)
    for sheet, names in TILE_SHEETS:
        a = load(sheet)
        boxes, lab = components(a, len(names))
        TW, TH = (TILE_W + 2) * DENSITY, (TILE_H + 1) * DENSITY
        yy, xx = np.mgrid[0:TH, 0:TW]
        diamond = (np.abs(xx + 0.5 - TW / 2) / (TW / 2) + np.abs(yy + 0.5 - TH / 2) / (TH / 2)) <= 1.0
        for (y0, y1, x0, x1, i), name in zip(boxes, names):
            inset = 0.045
            w, h = x1 - x0, y1 - y0
            crop = a[y0 + int(h * inset):y1 - int(h * inset), x0 + int(w * inset):x1 - int(w * inset)]
            img = np.array(Image.fromarray(crop).resize((TW, TH), Image.LANCZOS))
            img[..., 3] = np.where(diamond, 255, 0)
            save(Image.fromarray(img), name, TILE_W + 2, TILE_H + 1, (TILE_W + 2) / 2, (TILE_H + 1) / 2, man)
            print(f'{name:14s} tile')

    for sheet, crop in CROPS.items():
        crop, stages = crop if isinstance(crop, tuple) else (crop, CROP_STAGES)
        a = load(sheet)
        # подбираем склейку: ростки одной стадии вместе, соседние стадии отдельно
        for d in (30, 24, 18, 14, 10):
            boxes, lab = components(a, 5, dilate=d)
            if len(boxes) == 5 and max(b[3] - b[2] for b in boxes) < a.shape[1] * 0.42:
                break
        for st, si in enumerate(stages):
            y0, y1, x0, x1, i = boxes[si]
            c = a[y0:y1, x0:x1].copy()
            c[lab[y0:y1, x0:x1] != i, 3] = 0
            k = CROP_W / (x1 - x0)
            W, H = (x1 - x0) * k, (y1 - y0) * k
            img = Image.fromarray(c).resize((round(W * DENSITY), round(H * DENSITY)), Image.LANCZOS)
            save(img, f'crop_{crop}_{st}', W, H, W / 2, H - W / 4 - 2, man)
            print(f'crop_{crop}_{st}  {x1-x0}x{y1-y0}px -> {W:.0f}x{H:.0f} u')

    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1)
    icons()


if __name__ == '__main__':
    main()
