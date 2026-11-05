"""
Нарезка листов спрайтов на отдельные WebP с прозрачностью.

  cd tools/upscale && npm install && node upscale.js <лист> <лист>@4x.png && cd ../..
  pip install pillow numpy scipy
  python tools/slice_sprites.py

Листы (assets/source):
  sprites2.png — основной (фон-«шахматка»), из него берётся почти всё;
  sprites.png  — первый лист (белый фон), из него только то, чего нет во втором
                 (значки ресурсов и интерфейса, сарай 1-го уровня, почтовый ящик…).

Объекты находятся автоматически: фон — светлая область, связанная с краем листа,
остальное — связные компоненты. Имя спрайту даётся по точке внутри него,
поэтому новый лист в той же раскладке режется без правок.

Чёткость: цвет берётся из листа, увеличенного нейросетью ×4 (<лист>@4x.png,
делает tools/upscale), и каждый спрайт приводится к одной плотности DENSITY
пикселей на единицу мира (ширины объектов в мире — из DEFS в src/game/assets.js).
Без увеличенного листа используется Lanczos — мелкие объекты будут мягче.
"""
import os, re, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets', 'sprites')
ASSETS_JS = os.path.join(ROOT, 'src', 'game', 'assets.js')
DENSITY = 3.0        # пикселей спрайта на единицу мира (экран ПК ×1.7, телефон ~×2)
FALLBACK_UP = 2      # увеличение для спрайтов без размера в DEFS
TEX_PX = 256         # сторона квадратной текстуры земли

# Белые «дырки» внутри силуэта (просветы между листьями, ветками, досками)
# делаем прозрачными только у этих спрайтов: у остальных белое — часть рисунка.
CUT_HOLES = ('tree_', 'bush', 'stump', 'fence', 'gate', 'signpost', 'cart', 'wagon', 'wheelbarrow',
             'arch', 'bench', 'crop_', 'sprout', 'grass', 'windmill', 'lamp_post', 'market')

# Первый лист (белый фон): имя -> (x, y) точки внутри объекта, необязательно ('split', x0, x1)
SPRITES_1 = {
    # персонаж (целые кадры; голова и тело режутся в игре на части)
    'boy_front': (46, 100), 'boy_side': (108, 100), 'boy_profile': (170, 100), 'boy_back': (242, 100),
    'girl_front': (312, 100), 'girl_side': (384, 100),
    # природа
    'tree_oak': (62, 727), 'tree_sakura': (158, 727), 'tree_apple': (265, 723), 'tree_pine': (356, 726),
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

TEXTURES_1 = {
    'tex_soil': (1326, 712, 1394, 780), 'tex_water': (1250, 715, 1308, 773),
    'tex_sand': (981, 725, 1021, 765), 'tex_stone': (1058, 725, 1098, 765), 'tex_grass': (890, 730, 930, 760),
}

# Из первого листа берём только эти спрайты (остальное есть во втором)
FROM_1 = ('boy_', 'girl_', 'res_', 'item_', 'ui_', 'shed', 'mailbox', 'crop_cotton', 'crop_bean', 'crop_rose',
          'sprout_2', 'sprout_4', 'sprout_5', 'grass_reed', 'dock', 'bridge_pond', 'waterfall', 'hay_pen',
          'barrel_small', 'pot_', 'planter_box', 'birdhouse2', 'flowers_lav')

# Второй лист («шахматка»)
SPRITES_2 = {
    'house': (178, 159),
    'barn': (469, 153),
    'windmill': (707, 214),
    'silo': (846, 214),
    'well': (983, 205),
    'market': (1129, 159),
    'cart': (1298, 144),
    'fence_short': (1418, 160),
    'lamp_post': (1493, 115),
    'fence': (1299, 244),
    'signpost': (1430, 231),
    'lantern': (1489, 225),
    'tree_oak': (92, 351),
    'tree_apple': (259, 353),
    'tree_sakura': (424, 351),
    'tree_pine': (579, 382),
    'rock_small': (715, 341),
    'rock_tiny': (709, 413),
    'rock_small2': (823, 383),
    'rock_big': (975, 361),
    'bush': (1114, 361),
    'bush_pink': (1205, 375),
    'bush_white': (1296, 374),
    'bush_blue': (1394, 376),
    'bush_yellow': (1486, 370),
    'cow': (73, 508),
    'cow2': (193, 497),
    'pig': (337, 510),
    'sheep': (470, 506),
    'chicken': (591, 524),
    'rooster': (699, 515),
    'goose': (795, 520),
    'duck': (876, 519),
    'horse': (972, 516),
    'goat': (1098, 524),
    'cat': (1196, 520),
    'dogs': (1325, 524),
    'chick': (1421, 520),
    'rabbit': (1490, 521),
    'haystack': (67, 617),
    'haybale': (184, 620),
    'barrel': (273, 614),
    'sack': (349, 623),
    'crate': (440, 619),
    'wheelbarrow': (544, 616),
    'wagon': (658, 605),
    'lamp_post2': (762, 597),
    'birdhouse': (835, 591),
    'birdbath': (916, 592),
    'pump': (1026, 629),
    'bench': (1142, 610),
    'gate': (1245, 612),
    'arch': (1381, 599),
    'planter_white': (1475, 615),
    'planter_long': (1461, 706),
    'crop_wheat': (52, 719),
    'crop_corn': (132, 715),
    'crop_sunflower': (203, 698),
    'crop_tomato': (267, 702),
    'crop_tomato2': (352, 710),
    'crop_beet': (426, 724),
    'crop_carrot': (500, 720),
    'crop_potato': (579, 714),
    'crop_cabbage': (649, 712),
    'crop_cabbage2': (717, 710),
    'crop_blueberry': (786, 711),
    'crop_strawberry': (862, 710),
    'crop_pumpkin': (927, 716),
    'crop_watermelon': (996, 713),
    'crop_grapes': (1070, 714),
    'crop_eggplant': (1142, 709),
    'crop_pepper': (1203, 714),
    'crop_pepper2': (1267, 713),
    'flowers_purple': (50, 799),
    'flowers_lilac': (108, 798),
    'flowers_white': (174, 790),
    'pot_tulips': (240, 797),
    'tulip_red': (303, 803),
    'flowers_pink': (382, 786),
    'flowers_pink2': (457, 786),
    'sunflower_small': (533, 784),
    'sunflower_small2': (605, 785),
    'flowers_rose': (680, 787),
    'flowers_mix': (752, 786),
    'bush_flowers': (820, 785),
    'bush_small': (885, 783),
    'flowers_yellow': (949, 787),
    'stump2': (1015, 779),
    'mushrooms': (1092, 780),
    'mushroom_red': (1134, 772),
    'stump': (1203, 784),
    'grass_tall': (1294, 790),
    'grass_tuft': (1377, 790),
    'sprout_3': (1433, 779),
    'sprout_1': (1493, 787),
    'farmer_front': (53, 912),
    'farmer_34': (117, 911),
    'farmer_side': (183, 916),
    'farmer_side2': (249, 910),
    'farmer_back': (320, 912),
    'head_side': (406, 852),
    'head_34': (465, 852),
    'head_34b': (528, 853),
    'head_wink': (593, 851),
    'head_34c': (657, 852),
    'head_front': (720, 851),
    'head_front2': (783, 852),
    'head_front3': (846, 852),
    'head_front4': (911, 852),
    'torso_front': (407, 923),
    'torso_34': (464, 925),
    'torso_back': (516, 911),
    'torso_back2': (566, 911),
    'torso_back3': (616, 912),
    'torso_back4': (666, 910),
    'arm_1': (715, 908),
    'arm_2': (754, 908),
    'arm_3': (791, 907),
    'arm_4': (834, 908),
    'arm_5': (877, 911),
    'arm_6': (921, 907),
    'thigh_1': (407, 976),
    'thigh_2': (461, 974),
    'thigh_3': (510, 990),
    'fore_1': (568, 979),
    'fore_2': (606, 980),
    'hand_1': (642, 985),
    'hand_2': (681, 985),
    'leg_1': (725, 993),
    'leg_2': (758, 967),
    'leg_3': (793, 964),
    'leg_4': (832, 965),
    'leg_5': (872, 992),
    'leg_6': (913, 991),
    'tool_axe': (1020, 848),
    'tool_hammer': (1075, 835),
    'tool_shovel': (962, 979),
    'tool_hoe': (1048, 925),
    'tool_pickaxe': (1109, 939),
    'tool_can': (1108, 987),
    'tool_trowel': (1020, 988),
    'tile_water': (1200, 950),
    'tile_grass': (1310, 953),
    'tile_grass2': (1482, 931),
    'fence_post': (1418, 956),
}

# Изометрические плитки второго листа: (x0, y0, x1, y1) — коробка плитки.
# Верхняя грань (ромб) разворачивается обратно в квадратную текстуру.
TILES_2 = {
    'tex_grass': (1118, 824, 1208, 913), 'tex_soil': (1208, 824, 1299, 913),
    'tex_sand': (1299, 824, 1390, 913), 'tex_stone': (1390, 824, 1480, 913),
    'tex_water': (1147, 913, 1255, 988),
}


def world_widths():
    try:
        src = open(ASSETS_JS, encoding='utf-8').read()
    except OSError:
        return {}
    return {n: float(w) for n, w in re.findall(r'(\w+): \{ w: (\d+(?:\.\d+)?)', src)}


def find_bg(a, checker):
    mn = a.min(axis=2); sat = a.max(axis=2) - mn
    light = (mn > 205) & (sat < 20) if checker else (mn > 228) & (sat < 22)
    lab, _ = nd.label(light)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    sizes = nd.sum(light, lab, index=np.arange(lab.max() + 1))
    holes = np.isin(lab, [i for i in range(1, len(sizes)) if sizes[i] >= 3 and i not in border])
    pale = (mn > 200) & (sat < 34)
    holes = holes | (nd.binary_dilation(holes, iterations=1) & pale)
    return bg, holes


def soft_alpha(a, bg, bg_level):
    """Мягкая альфа: светлые пиксели у края полупрозрачны, светлая кайма срезается."""
    fg = nd.binary_opening(~bg, iterations=1)
    dist = nd.distance_transform_edt(fg)
    light = a.min(axis=2).astype(np.float32)
    edge_alpha = np.clip((bg_level - 12 - light) / 70.0, 0, 1)
    inner = np.clip((dist - 2.0) / 2.0, 0, 1)
    al = np.where(fg, np.maximum(edge_alpha, inner), 0.0)
    al[(dist < 2.5) & (light > bg_level - 33)] = 0
    return fg, al


def load_hires(path, im):
    hp = path[:-4] + '@4x.png'
    if not os.path.exists(hp):
        print('  нет', os.path.basename(hp), '— обычное увеличение')
        return None, 1
    h = Image.open(hp).convert('RGB')
    return h, h.width // im.width


def cut(im, hires, F, x0, y0, x1, y1, tw, th):
    src = hires.crop((x0 * F, y0 * F, x1 * F, y1 * F)) if hires is not None else im.crop((x0, y0, x1, y1))
    return np.asarray(src.resize((tw, th), Image.LANCZOS)).astype(np.float32)


def slice_sheet(path, sprites, checker, widths, only=None):
    print(os.path.basename(path))
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    bg_level = 230 if checker else 238
    bg, holes = find_bg(a, checker)
    fg, alpha_keep = soft_alpha(a, bg, bg_level)
    _, alpha_cut = soft_alpha(a, bg | holes, bg_level)
    comp, _ = nd.label(fg, structure=np.ones((3, 3)))
    hires, F = load_hires(path, im)
    # цвет фона под полупрозрачными краями (для «шахматки» — средний серый)
    bgc = 236.0 if checker else 255.0
    n = 0
    for name, spec in sprites.items():
        if only and not name.startswith(only):
            continue
        x, y = spec[0], spec[1]
        c = comp[y, x]
        if c == 0:
            ys, xs = np.nonzero(comp[max(0, y - 6):y + 7, max(0, x - 6):x + 7])
            if not len(ys): print('  !! нет объекта для', name); continue
            c = comp[max(0, y - 6) + ys[0], max(0, x - 6) + xs[0]]
        mask = comp == c
        if len(spec) > 2 and spec[2] == 'split':
            m2 = np.zeros_like(mask); m2[:, spec[3]:spec[4]] = mask[:, spec[3]:spec[4]]; mask = m2
        cut_holes = name.startswith(CUT_HOLES)
        alpha = alpha_cut if cut_holes else alpha_keep
        if not cut_holes:
            mask = nd.binary_fill_holes(mask) & ~bg | mask
        ys, xs = np.nonzero(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        al = (alpha[y0:y1, x0:x1] * mask[y0:y1, x0:x1]).astype(np.float32)
        nw, nh = x1 - x0, y1 - y0
        tw = round(widths[name] * DENSITY) if name in widths else nw * FALLBACK_UP
        th = max(1, round(nh * tw / nw))
        rgb = cut(im, hires, F, x0, y0, x1, y1, tw, th)
        al = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).resize((tw, th), Image.LANCZOS)).astype(np.float32) / 255
        al = np.clip((al - 0.12) / 0.88, 0, 1)      # поджимаем край
        k = np.clip(al, 0.05, 1)[..., None]
        rgb = np.clip((rgb - (1 - k) * bgc) / k, 0, 255)  # убираем примесь фона
        img = Image.fromarray(np.dstack([rgb, al * 255]).astype(np.uint8), 'RGBA')
        if hires is None:
            img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=50, threshold=2))
        img.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90, method=6, alpha_quality=95)
        n += 1
    return im, hires, F, fg, n


def unproject_tiles(im, hires, F, fg, tiles):
    """Верхняя грань изометрической плитки (ромб) -> квадратная текстура."""
    for name, (x0, y0, x1, y1) in tiles.items():
        m = fg[y0:y1, x0:x1]
        ys, xs = np.nonzero(m)
        top = (xs[ys == ys.min()].mean(), ys.min())
        lx = xs.min(); left = (lx, ys[xs <= lx + 1].min())
        rx = xs.max(); right = (rx, ys[xs >= rx - 1].min())
        # отступ внутрь ромба, чтобы не захватить кромку и обводку
        inset = 0.2
        T = np.array(top, float); L = np.array(left, float); R = np.array(right, float)
        u = R - T; v = L - T
        T2 = T + (u + v) * inset; u2 = u * (1 - 2 * inset); v2 = v * (1 - 2 * inset)
        src, s = (hires, F) if hires is not None else (im, 1)
        S = TEX_PX
        data = (u2[0] * s / S, v2[0] * s / S, (x0 + T2[0]) * s, u2[1] * s / S, v2[1] * s / S, (y0 + T2[1]) * s)
        t = src.transform((S, S), Image.AFFINE, data, resample=Image.BICUBIC)
        t.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90, method=6)


def main():
    os.makedirs(OUT, exist_ok=True)
    widths = world_widths()
    im1, hires1, F1, _, n1 = slice_sheet(os.path.join(SRC_DIR, 'sprites.png'), SPRITES_1, False, widths, only=FROM_1)
    _, _, _, _, n2 = slice_sheet(os.path.join(SRC_DIR, 'sprites2.png'), SPRITES_2, True, widths)
    # второй вариант дуба — зеркальный первый (сакура в листе — отдельное дерево)
    Image.open(os.path.join(OUT, 'tree_oak.webp')).transpose(Image.FLIP_LEFT_RIGHT).save(
        os.path.join(OUT, 'tree_oak2.webp'), 'WEBP', quality=90, method=6, alpha_quality=95)
    # Текстуры земли пока из первого листа: там они квадратные и детальнее,
    # чем верхние грани плиток второго (unproject_tiles + TILES_2 — если понадобятся).
    for name, box in TEXTURES_1.items():
        t = hires1.crop(tuple(v * F1 for v in box)) if hires1 is not None else im1.crop(box)
        t.resize((TEX_PX, TEX_PX), Image.LANCZOS).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90, method=6)
    print('готово:', n1 + n2, 'спрайтов и', len(TEXTURES_1), 'текстур →', OUT)


if __name__ == '__main__':
    sys.exit(main())
