"""Облака тумана: листы assets/source/fog_*.png (облака сеткой на тёмном фоне)
→ assets/art/<имя>_<n>.webp + записи в assets/art/manifest.json.

    python tools/slice_fog.py

Фон чёрный, без прозрачности: яркость пикселя становится непрозрачностью, цвет — цвет тумана
игры (FOG.color в src/game/data.js) с лёгкой тенью от оригинала.
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'art')
FOG = np.array([0xe4, 0xec, 0xee], np.float32)
PX_PER_UNIT = 1.5  # туман мягкий — хватает полутора пикселей на единицу (меньше места в атласе)
# лист: (рядов, ширина облака в мире (клетка = 64), яркость фона → 0, яркость середины → 1,
#        порог поиска пятен — None: лист режется на ряды целиком, полосы)
SHEETS = {
    'fog_clouds': (2, 300, 28, 215, 180),
    'fog_strips': (3, 520, 150, 225, None),
    'fog_wisps':  (2, 150, 28, 215, 180),
}


def main():
    man_path = os.path.join(OUT, 'manifest.json')
    man = json.load(open(man_path, encoding='utf-8'))
    for sheet, conf in SHEETS.items():
        src = os.path.join(ROOT, 'assets', 'source', sheet + '.png')
        if os.path.exists(src): cut(src, sheet, conf, man)
    json.dump(man, open(man_path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)


def cut(src, sheet, conf, man):
    """Облака ищутся как связные яркие пятна (сетка у генератора неровная)."""
    ROWS, WORLD_W, LO, HI, SEG = conf
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    L = im.mean(axis=2)
    H, W = L.shape
    if SEG is None:
        found = [(slice(r * H // ROWS + 70, (r + 1) * H // ROWS - 70), slice(70, W - 70)) for r in range(ROWS)]
    else:
        lab, n = ndimage.label(ndimage.gaussian_filter(L, 3) > SEG)
        found = [sl for sl in ndimage.find_objects(lab) if (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start) >= 4000]
    # порядок: ряды сверху вниз, в ряду слева направо
    rowh = im.shape[0] / ROWS
    found.sort(key=lambda sl: (int(((sl[0].start + sl[0].stop) / 2) // rowh), sl[1].start))
    M = 70
    for k, sl in enumerate(found):
        y0, y1 = max(0, sl[0].start - M), min(im.shape[0], sl[0].stop + M)
        x0, x1 = max(0, sl[1].start - M), min(im.shape[1], sl[1].stop + M)
        cell, l = im[y0:y1, x0:x1], L[y0:y1, x0:x1]
        ch, cw = l.shape
        a = np.clip((l - LO) / (HI - LO), 0, 1) ** 1.3
        # к краям вырезки — в ноль (свечение соседних облаков)
        yy = np.linspace(-1, 1, ch)[:, None]; xx = np.linspace(-1, 1, cw)[None, :]
        a = a * np.clip((1 - np.maximum(np.abs(xx) ** 6, np.abs(yy) ** 6)) * 2.2, 0, 1)
        shade = 0.9 + 0.1 * np.clip(l / 255, 0, 1)
        rgb = np.clip(FOG[None, None, :] * shade[..., None], 0, 255)
        img = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')
        img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 6 else 0).getbbox())
        k_px = WORLD_W * PX_PER_UNIT / img.width
        img = img.resize((round(img.width * k_px), round(img.height * k_px)), Image.LANCZOS)
        name = f'{sheet}_{k}'
        img.save(os.path.join(OUT, name + '.webp'), quality=88, method=6)
        w, h = img.width / PX_PER_UNIT, img.height / PX_PER_UNIT
        man[name] = {'w': round(w, 2), 'h': round(h, 2), 'ax': round(w / 2, 2), 'ay': round(h / 2, 2)}
        print(name, img.size)


if __name__ == '__main__':
    main()
