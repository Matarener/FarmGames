"""
Нарезка листа спрайтов (белый фон) на отдельные PNG с прозрачностью.

  pip install pillow numpy scipy
  python tools/slice_sprites.py

Объекты находятся автоматически: фон — белая область, связанная с краем листа,
всё остальное — связные компоненты. Имя спрайту даётся по точке внутри него
(координаты в листе 1536×1024), поэтому новый лист в той же раскладке
режется без правок. Результат: assets/sprites/<имя>.webp.

Чёткость: в листе объекты нарисованы с разной детализацией (дерево ~100 px,
бочка ~60 px), а в игре дерево в разы больше бочки. Чтобы всё выглядело
одинаково резко, цвет берётся из листа, увеличенного нейросетью ×4
(assets/source/sprites@4x.png, делает tools/upscale), и каждый спрайт
приводится к одной плотности DENSITY пикселей на единицу мира
(размеры объектов в мире — из DEFS в src/game/assets.js).
Если увеличенного листа нет, используется обычное увеличение Lanczos.
"""
import os, re, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source', 'sprites.png')
OUT = os.path.join(ROOT, 'assets', 'sprites')
HIRES = os.path.join(ROOT, 'assets', 'source', 'sprites@4x.png')
ASSETS_JS = os.path.join(ROOT, 'src', 'game', 'assets.js')
DENSITY = 3.0        # пикселей спрайта на единицу мира (экран ПК ×1.7, телефон ~×2)
FALLBACK_UP = 2      # увеличение для спрайтов без размера в DEFS (значки и т.п.)
TEX_PX = 256         # размер стороны текстуры земли
# у этих спрайтов белые области внутри — часть рисунка (шерсть, яйцо, глаза)
KEEP_WHITE = ('boy_', 'girl_', 'res_wool', 'res_milk', 'res_egg', 'res_cheese', 'ui_', 'item_', 'birdhouse')

# имя: (x, y) точки внутри объекта, необязательно ('split', x0, x1) — вырезать полосу
SPRITES = {
    # персонаж (целые кадры; голова и тело режутся в игре на части)
    'boy_front': (46, 100), 'boy_side': (108, 100), 'boy_profile': (170, 100), 'boy_back': (242, 100),
    'girl_front': (312, 100), 'girl_side': (384, 100),
    # природа
    'tree_oak': (62, 727), 'tree_oak2': (158, 727), 'tree_apple': (265, 723), 'tree_pine': (356, 726),
    'rock_small': (424, 672), 'rock_small2': (447, 784), 'rock_big': (449, 728),
    'stump': (497, 674), 'stump2': (533, 731), 'bush': (569, 673),
    'flowers_white': (643, 675), 'flowers_pink': (599, 729), 'flowers_purple': (653, 730),
    'flowers_yellow': (701, 731), 'flowers_lav': (706, 678), 'bush_yellow': (691, 785),
    'grass_tuft': (648, 785), 'grass_tall': (587, 784), 'grass_reed': (518, 784),
    'fence': (809, 727), 'fence_short': (826, 781),
    # здания и объекты фермы
    'house': (1076, 162), 'barn': (1280, 151, 'split', 1193, 1372), 'windmill': (1450, 151, 'split', 1372, 1529),
    'well': (67, 403), 'shed': (207, 402), 'hay_pen': (374, 398), 'haystack': (522, 423),
    'barrel': (621, 426), 'mailbox': (691, 433), 'sack': (758, 430), 'cart': (855, 423), 'wheelbarrow': (958, 423),
    'birdhouse': (1029, 397), 'birdhouse2': (1088, 362), 'bench': (1100, 440), 'bridge_pond': (1244, 399),
    'waterfall': (1434, 367), 'dock': (1442, 477),
    'signpost': (1396, 918), 'lantern': (1451, 901),
    # декор
    'pot_roses': (927, 560), 'pot_hydrangea': (1008, 558), 'pot_tulips': (1080, 555), 'planter_white': (1150, 553),
    'pot_blue': (1219, 552), 'planter_box': (1367, 558), 'planter_long': (1187, 636), 'barrel_small': (1269, 644),
    # растения
    'crop_wheat': (52, 565), 'crop_corn': (117, 569), 'crop_bean': (174, 564), 'crop_tomato': (230, 560),
    'crop_carrot': (279, 557), 'crop_beet': (383, 554), 'crop_beet2': (324, 553), 'crop_cabbage': (456, 561),
    'crop_pumpkin': (532, 558), 'crop_strawberry': (596, 557), 'crop_sunflower': (661, 557), 'crop_rose': (719, 558),
    'crop_cotton': (774, 557), 'crop_cotton2': (831, 553),
    'sprout_1': (903, 636), 'sprout_2': (945, 633), 'sprout_3': (842, 638), 'sprout_4': (1006, 634), 'sprout_5': (1081, 633),
    # ресурсы и предметы
    'res_wood': (885, 884), 'res_stone': (933, 885), 'res_brick': (981, 885), 'res_iron': (1027, 885), 'res_wool': (1078, 884),
    'res_milk': (1129, 881), 'res_egg': (1175, 883), 'res_cheese': (1220, 882), 'res_honey': (1268, 882), 'res_seeds': (1319, 884),
    'item_apple': (886, 952), 'item_corn': (937, 955), 'item_carrot': (995, 954), 'item_tomato': (1051, 954),
    'item_blueberry': (1116, 953), 'item_grapes': (1178, 955), 'item_strawberry': (1232, 954), 'item_flower': (1288, 954),
    # иконки интерфейса (с подложкой-кнопкой)
    'ui_coin': (48, 880), 'ui_gem': (113, 880), 'ui_star': (180, 880), 'ui_heart': (248, 880), 'ui_energy': (316, 880),
    'ui_plus': (384, 880), 'ui_gear': (455, 880), 'ui_mail': (521, 880), 'ui_trophy': (584, 880),
    'ui_house': (57, 955), 'ui_barn': (135, 955), 'ui_sprout': (213, 955), 'ui_can': (290, 955), 'ui_axe': (367, 955),
    'ui_shovel': (441, 955), 'ui_pickaxe': (515, 955), 'ui_hand': (584, 955),
}


# Текстуры земли: прямоугольники внутри тайлов из ряда «Environment Tiles» (x0, y0, x1, y1).
# В игре квадрат текстуры проецируется в изометрический ромб.
TEXTURES = {
    'tex_soil': (1326, 712, 1394, 780), 'tex_water': (1250, 715, 1308, 773),
    'tex_sand': (981, 725, 1021, 765), 'tex_stone': (1058, 725, 1098, 765), 'tex_grass': (890, 730, 930, 760),
}


def world_widths():
    try:
        src = open(ASSETS_JS, encoding='utf-8').read()
    except OSError:
        return {}
    return {n: float(w) for n, w in re.findall(r'(\w+): \{ w: (\d+(?:\.\d+)?)', src)}


def soft_alpha(a, bg):
    """Мягкая альфа: светлые пиксели у края полупрозрачны, белая кайма срезается."""
    fg = nd.binary_opening(~bg, iterations=1)
    dist = nd.distance_transform_edt(fg)
    light = a.min(axis=2).astype(np.float32)
    edge_alpha = np.clip((226 - light) / 70.0, 0, 1)
    inner = np.clip((dist - 2.0) / 2.0, 0, 1)
    al = np.where(fg, np.maximum(edge_alpha, inner), 0.0)
    # светлая кайма у самого края (1–2 px) — убираем полностью
    al[(dist < 2.5) & (light > 205)] = 0
    return fg, al


def main():
    im = Image.open(SRC).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    white = (a.min(axis=2) > 228) & ((a.max(axis=2) - a.min(axis=2)) < 22)
    lab, _ = nd.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # белые «дырки» внутри силуэта (просветы в кроне, между ветками) — тоже фон
    sizes = nd.sum(white, lab, index=np.arange(lab.max() + 1))
    holes = np.isin(lab, [i for i in range(1, len(sizes)) if sizes[i] >= 3 and i not in border])
    # вместе с их светлой каймой
    pale = (a.min(axis=2) > 200) & ((a.max(axis=2) - a.min(axis=2)) < 34)
    holes = holes | (nd.binary_dilation(holes, iterations=1) & pale)
    fg, alpha_keep = soft_alpha(a, bg)
    _, alpha_cut = soft_alpha(a, bg | holes)
    comp, _ = nd.label(fg, structure=np.ones((3, 3)))

    hires = None
    if os.path.exists(HIRES):
        hires = Image.open(HIRES).convert('RGB')
        F = hires.width // im.width
        print('цвет из увеличенного листа ×%d' % F)
    widths = world_widths()

    os.makedirs(OUT, exist_ok=True)
    for name, spec in SPRITES.items():
        x, y = spec[0], spec[1]
        c = comp[y, x]
        if c == 0:
            # точка попала в «дырку» — ищем ближайший компонент
            ys, xs = np.nonzero(comp[max(0, y - 6):y + 7, max(0, x - 6):x + 7])
            if not len(ys): print('!! нет объекта для', name); continue
            c = comp[max(0, y - 6) + ys[0], max(0, x - 6) + xs[0]]
        mask = comp == c
        if len(spec) > 2 and spec[2] == 'split':
            m2 = np.zeros_like(mask); m2[:, spec[3]:spec[4]] = mask[:, spec[3]:spec[4]]; mask = m2
        # дырки внутри объекта (белая шерсть, глаза) остаются непрозрачными
        keep = name.startswith(KEEP_WHITE)
        alpha = alpha_keep if keep else alpha_cut
        if keep:   # дырки внутри объекта (белая шерсть, глаза) остаются непрозрачными
            mask = nd.binary_fill_holes(mask) & ~bg | mask
        ys, xs = np.nonzero(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        al = (alpha[y0:y1, x0:x1] * mask[y0:y1, x0:x1]).astype(np.float32)
        nw, nh = x1 - x0, y1 - y0
        tw = round(widths[name] * DENSITY) if name in widths else nw * FALLBACK_UP
        th = max(1, round(nh * tw / nw))
        if hires is not None:
            rgb = np.asarray(hires.crop((x0 * F, y0 * F, x1 * F, y1 * F)).resize((tw, th), Image.LANCZOS)).astype(np.float32)
        else:
            rgb = np.asarray(im.crop((x0, y0, x1, y1)).resize((tw, th), Image.LANCZOS)).astype(np.float32)
        al = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).resize((tw, th), Image.LANCZOS)).astype(np.float32) / 255
        # чуть «поджимаем» край: убирает остаток светлой каймы после масштабирования
        al = np.clip((al - 0.12) / 0.88, 0, 1)
        # убираем примесь белого фона у полупрозрачных краёв
        k = np.clip(al, 0.05, 1)[..., None]
        rgb = np.clip((rgb - (1 - k) * 255) / k, 0, 255)
        out = np.dstack([rgb, al * 255]).astype(np.uint8)
        img = Image.fromarray(out, 'RGBA')
        if hires is None:
            img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=50, threshold=2))
        img.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90, method=6, alpha_quality=95)
    for name, box in TEXTURES.items():
        if hires is not None:
            t = hires.crop(tuple(v * F for v in box))
        else:
            t = im.crop(box)
        t = t.resize((TEX_PX, TEX_PX), Image.LANCZOS)
        t.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90, method=6)
    print('готово:', len(SPRITES), 'спрайтов и', len(TEXTURES), 'текстур →', OUT)


if __name__ == '__main__':
    sys.exit(main())
