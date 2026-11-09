"""Нарезка листов художника (assets/source/*.png, прозрачный фон) в спрайты игры.

    python tools/slice_art.py

Результат: assets/art/<имя>.webp и assets/art/manifest.json
(размеры и точка опоры в мировых единицах; клетка = 64×32).
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
import grass_tiles
import path_tiles

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets', 'art')
DENSITY = 4  # пикселей на мировую единицу
TILE_W, TILE_H = 64, 32

# Имена картинок: <вид>_<вариант>. Деревья — tree_<вид>, кусты — bush_<вид> (вид — ключ FLORA в
# src/game/data.js), _bare — без плодов (после сбора), _young — молодое растение.

# Лист → объекты по порядку (сверху вниз, слева направо) и ширина «пятачка» под объектом
# в мировых единицах (по ней считается масштаб). Отрицательная ширина: «пятачок» — весь ромб
# объекта (ширина по краям картинки), опора — его центр.
SHEETS = {
    # ростки посаженных игроком растений (стадия 0): под деревья и под кусты
    'sprouts': [('sprout_tree', -30), ('sprout_bush', -32)],
    'well': [('well_broken', 41), ('well_fixed', 42)],
}
# Листы с одной картинкой: лист называется так же, как картинка. Значение — ширина «пятачка».
# Каждый объект — на своей картинке: на общих листах «пиксели» стиля выходили крупными (пикселили).
SINGLE = {
    # камни (до 2026-11-07 был лист rocks); деревья, кусты, пни и высокая трава — в NOBASE ниже
    'boulder': 118, 'rock': 54, 'rock_small': 40, 'boulder_moss': 116,
    # дом по уровням
    'house_1': -132, 'house_2': -132, 'house_3': -132, 'house_4': -132, 'house_5': -132,
}
SHEETS.update({name: [(name, w)] for name, w in SINGLE.items()})
# Постройки без «пятачка» травы (поливалки): одна на картинку, масштаб — по высоте в мире; опора — середина
# клетки: по x — середина нижней части (столбик, ножки), по y — на lift единиц выше самого низа
# (у треноги задняя ножка стоит выше передних: середина клетки — между ними).
PROPS = {
    'sprinkler_drip': {'h': 32, 'lift': 4},
    'sprinkler_spin': {'h': 40, 'lift': 4},
    'sprinkler_rain': {'h': 56, 'lift': 5},
}
# Урожай: каждая стадия (0–3) — своя картинка crop_<культура>_<стадия>.png. Растения заполняют
# ромб грядки: масштаб по ширине (ширина стадии в мире), опора — центр ромба.
CROPS = ['wheat', 'carrot', 'beet', 'tomato', 'sunflower', 'pumpkin', 'strawberry', 'cotton', 'corn', 'cabbage']
CROP_W = 54
# капуста растёт вширь: маленький росток → кочан на всю грядку
CROP_STAGE_W = {'cabbage': [17.6, 29.65, 47.13, 56.7]}

# Растения без подложки (2026-11-09): деревья, кусты, пни и высокая трава нарисованы без травяного
# островка и земляного блока и стоят прямо на траве. Каждое — своя картинка <имя>.png. Размер — как
# у прежних картинок с подложкой, мерка: ('w', ширина) — самая широкая строка в верхних 60% картинки
# (крона; у травы и пней — во всей картинке), ('h', высота) — от верха до опоры. В мировых единицах.
# Опора — середина низа ствола или стеблей (foot_of), мягкую тень под растением рисует add_shadow.
NOBASE = {
    # взрослые деревья (у вишни с ягодами и без — своя картинка), без плодов, молодые
    'tree_oak': ('w', 97.8), 'tree_apple': ('w', 90.2), 'tree_sakura': ('w', 94.5), 'tree_pine': ('w', 58.2),
    'tree_cherry': ('w', 90.8), 'tree_cherry_bare': ('w', 95.2), 'tree_maple': ('w', 94.0), 'tree_birch': ('w', 97.8),
    'tree_linden': ('h', 122.3), 'tree_apple_bare': ('w', 87.5), 'tree_sakura_bare': ('w', 90.0),
    'tree_oak_young': ('w', 47.8), 'tree_birch_young': ('w', 58.5), 'tree_sakura_young': ('w', 42.8),
    'tree_cherry_young': ('w', 47.2), 'tree_maple_young': ('w', 52.2), 'tree_apple_young': ('w', 45.5),
    'tree_pine_young': ('w', 26.2), 'tree_linden_young': ('h', 77.2),  # липа по высоте: не выше берёзы
    # кусты: с плодами, без, молодые
    'bush_blueberry': ('w', 58.8), 'bush_raspberry': ('w', 56.5), 'bush_rosehip': ('w', 57.8),
    'bush_hydrangea': ('w', 58.5), 'bush_lavender': ('w', 53.2), 'bush_rose': ('w', 58.5),
    'bush_blueberry_bare': ('w', 58.0), 'bush_raspberry_bare': ('w', 61.2), 'bush_rosehip_bare': ('w', 59.5),
    'bush_hydrangea_bare': ('w', 57.0), 'bush_lavender_bare': ('w', 53.8), 'bush_rose_bare': ('w', 58.0),
    'bush_blueberry_young': ('w', 33.5), 'bush_raspberry_young': ('w', 30.2), 'bush_rosehip_young': ('w', 33.0),
    'bush_hydrangea_young': ('w', 34.0), 'bush_lavender_young': ('w', 31.8), 'bush_rose_young': ('w', 31.2),
    # пни (до 2026-11-09 — листы stumps, stumps2)
    # пни: ширина всей картинки (корни, листья) — около трёх четвертей прежнего травяного ромба
    'stump_oak': ('w', 31), 'stump_birch': ('w', 27), 'stump_pine': ('w', 31), 'stump_oak_moss': ('w', 31),
    'stump_apple': ('w', 31), 'stump_sakura': ('w', 31), 'stump_cherry': ('w', 31), 'stump_maple': ('w', 31),
    'stump_linden': ('w', 31),
    # дикая высокая трава (до 2026-11-09 — лист grass_tall из трёх)
    'grass_tall_0': ('w', 42), 'grass_tall_1': ('w', 46), 'grass_tall_2': ('w', 46), 'grass_tall_3': ('w', 38),
}
# Тень под растением: (доля ширины кроны, мин. и макс. ширина в мире, непрозрачность в середине).
# Эллипс 2:1 как клетка, чуть вправо-вниз (свет слева сверху), края мягкие.
SHADOW = {'tree': (0.64, 34, 66, 0.48), 'bush': (0.92, 25, 52, 0.42), 'stump': (1.2, 25, 46, 0.4),
          'grass': (0.9, 20, 44, 0.3)}
SHADOW_RGB = (28, 58, 6)
NOBASE_KIND = lambda name: 'grass' if name.startswith('grass_') else name.split('_')[0]

# None в списке листа — предмет нарисован, но игре не нужен: его место учитывается, картинка не сохраняется.

# Листы-сетки: каждый предмет в своей ячейке (части предмета могут быть отдельными кусками,
# например три кувшинки). (имя, ширина в мире, опора): base — центр основания растения,
# center — середина картинки (плоское на воде), (fx, fy) — доли ширины/высоты.
GRID_SHEETS = {
    # пятая ячейка — мостик (мостики убраны из игры)
    'pond_decor': (3, 2, [('pond_cattail', 40, 'base'), ('pond_lily', 56, 'center'), ('pond_rocks', 50, (0.5, 0.7)),
                          ('pond_reeds', 46, 'base'), None, ('pond_leaves', 36, 'center')]),
}
# грядки: сухая и политая; вторая пара — с травяной каймой (не используется)
BED_SHEETS = {'beds': [('bed_dry', 62), ('bed_wet', 62), None, None]}
WATER_GAIN, WATER_LIFT = 1.15, (30, 45, 55)  # вода прудов светлее и сочнее (tools/pond_art.py)
# плитки земли: каждая — своя картинка с одним ромбом. Трава собирается бесшовной из двух картинок
# (tile_grass.png, tile_grass_flowers.png) в 4 варианта; отзеркаливать их в игре нельзя
GRASS_TILES = ['tile_grass', 'tile_grass_2', 'tile_grass_flowers', 'tile_grass_flowers_2']
# Дорожки (виды — PATHS в src/game/data.js): каждая картинка-ромб → две бесшовные плитки <имя>, <имя>_2
# (tools/path_tiles.py). flat — насколько убирать крупные перепады света (больше — меньше убирает).
PATH_TILES = {'tile_path': 4, 'tile_path_sand': 4, 'tile_path_planks': 3, 'tile_path_cobble': 4}
# «Камни в траве»: камни с листа path_stones.png (по порядку) на траве. (камень, u, v, ширина в мире):
# середина камня в осях клетки (u — к соседу gx+1, v — к gy+1), камни не доходят до краёв клетки
PATH_STONES = {'tile_path_stones': [(0, 0.297, 0.641, 19), (1, 0.719, 0.406, 17)],
               'tile_path_stones_2': [(2, 0.297, 0.391, 17), (3, 0.781, 0.406, 15), (5, 0.406, 0.844, 10)]}


# Иконки интерфейса: листы на тёмном фоне со свечением (не прозрачные) — фон срезаем по контуру.
ICON_SHEETS = {
    'ui_res': ['coin', 'gem', 'energy', 'star', 'wood', 'stone', 'ore', 'water'],
    'ui_btn': ['bag', 'market', 'house', 'center', 'walk', 'dig', 'seed', 'lock'],
    'ui_crops': ['carrot', 'wheat', 'beet', 'cabbage', 'tomato', 'corn', 'sunflower', 'pumpkin', 'strawberry', 'cotton'],
    'ui_avatar': ['avatar'],
    'ui_fish': ['fish_carp', 'fish_perch', 'fish_gold', 'fish'],  # прозрачный фон
    'ui_tools': ['axe', 'pick', 'can', 'food'],  # инструменты и вкладка «Еда»
    'ui_menu1': ['more', 'move', 'note', 'gear'],  # меню «Ещё»
    'ui_menu2': ['paw', 'build', 'decor', 'trophy'],
    'ui_food': ['milk', 'bread', 'pie'],  # еда из магазина
    'ui_bubbles': ['bubble_ready', 'bubble_water'],  # значки над грядками (Farm.applyArt делает из них пузыри)
    # плоды деревьев и кустов
    'ui_flora1': ['acorn', 'birch_bark', 'sakura_petal', 'cherry', 'maple_leaf', 'apple', 'pinecone'],
    'ui_flora2': ['blueberry', 'raspberry', 'rosehip', 'hydrangea', 'lavender', 'rose_petal'],
    # саженцы деревьев (иконки в рюкзаке)
    'ui_saplings1': ['sap_oak', 'sap_birch', 'sap_sakura', 'sap_cherry', 'sap_maple', 'sap_apple', 'sap_pine'],
    'ui_hay': ['hay'],  # сено с дикой травы (свечение по краю срезано, контур тоньше)
    'ui_saplings2': ['sap_blueberry', 'sap_raspberry', 'sap_rosehip', 'sap_hydrangea', 'sap_lavender', 'sap_rose'],
    # липа (2026-11-08): липовый цвет и саженец — по одной иконке на картинку
    'ui_linden_blossom': ['linden_blossom'],
    'ui_sap_linden': ['sap_linden'],
    # стрелка-подсказка к заданию, кольцо под целью, кружок у края экрана (Farm.applyArt → PixiScene.syncHint)
    'ui_hints': ['hint_arrow', 'hint_ring', 'hint_badge'],
    # подарки: кнопка в интерфейсе, вкладки окна «Подарки», сундук 7-го дня
    'ui_gifts': ['gift', 'calendar', 'friends', 'invite', 'event', 'chest'],
    'ui_wheel': ['wheel'],  # колесо фортуны: кнопка в интерфейсе и пункт «Ещё» (само колесо в окне рисуется кодом)
}
ICON_PX = 128
# Иконки не в квадрате 128, а по контуру картинки (без полей), длинная сторона — столько пикселей:
# игра ставит их по краю картинки (кончик стрелки — её низ) и рисует крупнее обычных иконок
ICON_TIGHT = {'hint_arrow': 192, 'hint_ring': 256, 'hint_badge': 160}


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


def icons(only=None):
    names = []
    if only:
        with open(os.path.join(OUT, 'icons.json')) as f: names = json.load(f)
    for sheet, items in ICON_SHEETS.items():
        if only and sheet not in only: continue
        a = np.array(Image.open(os.path.join(SRC, sheet + '.png')).convert('RGBA'))
        if (a[..., 3] == 0).mean() > 0.2: a = load(sheet)  # уже прозрачный
        else: a[..., 3] = np.where(cut_dark_bg(a), 255, 0)
        boxes, lab = components(a, len(items))
        for (y0, y1, x0, x1, i), name in zip(boxes, items):
            c = a[y0:y1, x0:x1].copy()
            c[lab[y0:y1, x0:x1] != i, 3] = 0
            img = Image.fromarray(c)
            if name in ICON_TIGHT:
                k = ICON_TIGHT[name] / max(img.size)
                img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
                img.save(os.path.join(OUT, 'ic_' + name + '.webp'), 'WEBP', quality=90, method=6)
                if name not in names: names.append(name)
                print(f'ic_{name} {img.width}x{img.height}')
                continue
            k = ICON_PX / max(img.size)
            img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
            sq = Image.new('RGBA', (ICON_PX, ICON_PX))
            sq.paste(img, ((ICON_PX - img.width) // 2, (ICON_PX - img.height) // 2))
            sq.save(os.path.join(OUT, 'ic_' + name + '.webp'), 'WEBP', quality=90, method=6)
            if name not in names: names.append(name)
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


def tile_src(name):
    """Ромб плитки с картинки: чуть внутри контура (без тёмной обводки)."""
    a = load(name)
    boxes, lab = components(a, 1)
    y0, y1, x0, x1, i = boxes[0]
    inset = 0.045
    w, h = x1 - x0, y1 - y0
    return a[y0 + int(h * inset):y1 - int(h * inset), x0 + int(w * inset):x1 - int(w * inset)]


def tiles(man):
    """Плитки земли. Ромб чуть больше клетки (на 1 единицу), чтобы между клетками не было щелей."""
    TW, TH = (TILE_W + 2) * DENSITY, (TILE_H + 1) * DENSITY
    yy, xx = np.mgrid[0:TH, 0:TW]
    diamond = (np.abs(xx + 0.5 - TW / 2) / (TW / 2) + np.abs(yy + 0.5 - TH / 2) / (TH / 2)) <= 1.0
    out = {}
    # трава — бесшовная (tools/grass_tiles.py): у всех вариантов одинаковая кайма, любые две рядом стыкуются
    sq_grass = sq = grass_tiles.build(tile_src('tile_grass')[..., :3].astype(np.float64),
                                      tile_src('tile_grass_flowers')[..., :3].astype(np.float64))
    for name, s in zip(GRASS_TILES, sq):
        out[name] = grass_tiles.render(s, TILE_W + 2, TILE_H + 1, DENSITY)
    # дорожки: бесшовные, по две плитки с общей каймой
    sq_path = {}
    for name, flat in PATH_TILES.items():
        if not os.path.exists(os.path.join(SRC, name + '.png')): continue
        sq = sq_path[name] = path_tiles.build(tile_src(name)[..., :3].astype(np.float64), flat)
        for k, s in enumerate(sq):
            out[name + ('_2' if k else '')] = grass_tiles.render(s, TILE_W + 2, TILE_H + 1, DENSITY)
    # камни в траве: трава (простые варианты) + камни посередине клетки
    if os.path.exists(os.path.join(SRC, 'path_stones.png')):
        a = load('path_stones')
        boxes, lab = components(a, 6)
        stones = []
        for y0, y1, x0, x1, i in boxes:
            c = a[y0:y1, x0:x1].copy(); c[lab[y0:y1, x0:x1] != i, 3] = 0
            stones.append(c)
        for (name, layout), g in zip(PATH_STONES.items(), ('tile_grass', 'tile_grass_2')):
            out[name] = path_tiles.stones_tile(out[g], stones, layout, DENSITY)
    for name, img in out.items():
        img[..., 3] = np.where(diamond, 255, 0)
        save(Image.fromarray(img), name, TILE_W + 2, TILE_H + 1, (TILE_W + 2) / 2, (TILE_H + 1) / 2, man)
        print(f'{name:14s} tile')
    # травяной край дорожек: куски (игра склеивает их по соседям клетки, Farm.pathEdgeOf), обрезаны
    # по непрозрачному; опора — центр клетки, как у плиток (сдвиг куска в плитке — целые пиксели)
    pieces = path_tiles.edge_pieces(out['tile_grass'], sq_grass[0], TILE_W + 2, TILE_H + 1, DENSITY)
    # переходы между видами дорожек: blend_<вид>_* — вид выше по слою заходит на соседний (Farm.pathEdge)
    for name, prm in path_tiles.BLEND.items():
        if name in sq_path:
            pieces.update(path_tiles.edge_pieces(out[name], sq_path[name][0], TILE_W + 2, TILE_H + 1, DENSITY,
                                                 prm, 'blend_' + name[len('tile_'):] + '_'))
    for name, img in pieces.items():
        img[..., 3] = np.where(diamond, img[..., 3], 0)
        b = path_tiles.crop(img)
        if not b: continue
        x0, y0, x1, y1 = b
        save(Image.fromarray(img[y0:y1, x0:x1]), name, (x1 - x0) / DENSITY, (y1 - y0) / DENSITY,
             (TILE_W + 2) / 2 - x0 / DENSITY, (TILE_H + 1) / 2 - y0 / DENSITY, man)
    print(f'край дорожек (трава и переходы): {len(pieces)} кусков')


def crown_px(m, frac=0.6):
    """Ширина кроны в пикселях: самая широкая строка в верхних frac непрозрачного (m — маска)."""
    ys = np.where(m.any(1))[0]
    best = 0
    for y in range(ys[0], ys[0] + int((ys[-1] - ys[0]) * frac) + 1):
        xs = np.where(m[y])[0]
        if len(xs): best = max(best, xs[-1] - xs[0])
    return best


def foot_of(m):
    """Опора растения без подложки (m — маска): середина основания ствола или стеблей.
    Ствол меряем на 10% высоты над самой нижней точкой (там уже нет травинок): x — середина этого
    отрезка (мелкие просветы между стеблями не в счёт), y — выше нижней точки на четверть его ширины:
    основание ствола на земле — эллипс 2:1, его середина выше переднего края (не больше 12% высоты)."""
    ys = np.where(m.any(1))[0]
    y0, yb = ys[0], ys[-1]
    h = yb - y0 + 1
    band = m[max(y0, yb - int(h * 0.08)):yb + 1]
    cols = band.sum(0).astype(float)
    cx = (cols * np.arange(len(cols))).sum() / cols.sum()  # середина низа: корни и травинки
    row = ndimage.binary_closing(m[int(yb - h * 0.1)], np.ones(max(3, int(m.shape[1] * 0.05))))
    lab, n = ndimage.label(row)
    if not n: return cx, yb
    runs = [np.where(lab == i)[0] for i in range(1, n + 1)]
    run = min(runs, key=lambda r: 0 if r[0] <= cx <= r[-1] else min(abs(r[0] - cx), abs(r[-1] - cx)))
    tw = run[-1] - run[0] + 1
    return (run[0] + run[-1]) / 2, yb - min(tw / 4, h * 0.12)


def add_shadow(img, ax, ay, crown, kind):
    """Мягкая тень под растением (эллипс 2:1) под картинкой. img — PIL RGBA, ax, ay, crown — в пикселях.
    Возвращает новую картинку и сдвиг (dx, dy) старой внутри неё."""
    k, lo, hi, alpha = SHADOW[kind]
    sw = min(max(crown * k, lo * DENSITY), hi * DENSITY)
    sh = sw / 2
    cx, cy = ax + sw * 0.06, ay + sw * 0.02
    x0, y0 = min(0, int(np.floor(cx - sw / 2)) - 1), min(0, int(np.floor(cy - sh / 2)) - 1)
    x1, y1 = max(img.width, int(np.ceil(cx + sw / 2)) + 1), max(img.height, int(np.ceil(cy + sh / 2)) + 1)
    W, H = x1 - x0, y1 - y0
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx + 0.5 + x0 - cx) / (sw / 2)) ** 2 + ((yy + 0.5 + y0 - cy) / (sh / 2)) ** 2)
    t = np.clip((1 - r) / (1 - 0.3), 0, 1)
    a = alpha * t * t * (3 - 2 * t)  # smoothstep: плотная середина, мягкий край
    sh_img = np.zeros((H, W, 4), np.uint8)
    sh_img[..., :3] = SHADOW_RGB
    sh_img[..., 3] = np.round(a * 255).astype(np.uint8)
    out = Image.fromarray(sh_img)
    out.alpha_composite(img, (-x0, -y0))
    return out, -x0, -y0


def nobase(name, man):
    """Растение без подложки: размер по мерке NOBASE, опора — низ ствола, тень под ним."""
    kind = NOBASE_KIND(name)
    a = load(name)
    boxes, lab = components(a, 1)
    y0, y1, x0, x1, i = boxes[0]
    crop = a[y0:y1, x0:x1].copy()
    crop[lab[y0:y1, x0:x1] != i, 3] = 0
    m = crop[..., 3] > 128
    fx, fy = foot_of(m)
    how, size = NOBASE[name]
    if how == 'w': k = size / crown_px(m, 1.0 if kind in ('grass', 'stump') else 0.6)
    else: k = size / (fy - np.where(m.any(1))[0][0])
    W, H = (x1 - x0) * k, (y1 - y0) * k
    img = Image.fromarray(crop).resize((max(1, round(W * DENSITY)), max(1, round(H * DENSITY))), Image.LANCZOS)
    s = W * DENSITY / (x1 - x0)  # пиксели картинки игры на пиксель исходника
    crown = crown_px(m, 0.6) * s
    img, dx, dy = add_shadow(img, fx * s, fy * s, crown, kind)
    save(img, name, img.width / DENSITY, img.height / DENSITY, (fx * s + dx) / DENSITY, (fy * s + dy) / DENSITY, man)
    print(f'{name:20s} {x1-x0}x{y1-y0}px -> {img.width / DENSITY:.0f}x{img.height / DENSITY:.0f} u, тень {kind}')


def main(only=None):
    """only — нарезать только эти листы SHEETS и дописать их в существующий manifest.json"""
    os.makedirs(OUT, exist_ok=True)
    man = {}
    if only:
        with open(os.path.join(OUT, 'manifest.json')) as f: man = json.load(f)
    for sheet, items in SHEETS.items():
        if only and sheet not in only: continue
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
                # у колодца самая широкая строка — середина круглой кладки; опора — от низа кладки
                # под центром (иначе колодец «съезжает» на клетку перед собой)
                if sheet == 'well':
                    mm = crop[..., 3] > 128; c = int(bx)
                    by = np.where(mm[:, max(0, c - 3):c + 3].any(1))[0].max()
            k = base_w / bw  # мир/пиксель
            W, H = (x1 - x0) * k, (y1 - y0) * k
            img = Image.fromarray(crop).resize((max(1, round(W * DENSITY)), max(1, round(H * DENSITY))), Image.LANCZOS)
            # опора — центр ромба основания (низ минус четверть ширины)
            save(img, name, W, H, bx * k, (by - bw / 4) * k, man)
            print(f'{name:14s} {x1-x0}x{y1-y0}px -> {W:.0f}x{H:.0f} u')

    for name in NOBASE:
        if only and name not in only: continue
        nobase(name, man)

    for name, pr in PROPS.items():
        if only and name not in only: continue
        if not os.path.exists(os.path.join(SRC, name + '.png')): continue
        a = load(name)
        (y0, y1, x0, x1, i), = components(a, 1)[0]
        crop = a[y0:y1, x0:x1].copy()
        m = crop[..., 3] > 128
        ys = np.where(m.any(1))[0]
        low = m[int(ys[-1] - (ys[-1] - ys[0]) * 0.15):]  # нижние 15%: на чём стоит
        xs = np.where(low.any(0))[0]
        k = pr['h'] / (y1 - y0)  # мир/пиксель
        W, H = (x1 - x0) * k, (y1 - y0) * k
        img = Image.fromarray(crop).resize((max(1, round(W * DENSITY)), max(1, round(H * DENSITY))), Image.LANCZOS)
        save(img, name, W, H, (xs[0] + xs[-1]) / 2 * k, ys[-1] * k - pr['lift'], man)
        print(f'{name:14s} {x1-x0}x{y1-y0}px -> {W:.0f}x{H:.0f} u')

    # Грядки: объёмный ромб (верх + бортик). Ширина — по краям картинки, центр ромба —
    # строка самой левой точки (левый угол верхней грани).
    if only:
        if 'tiles' in only: tiles(man)
        with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
            json.dump(man, f, indent=1)
        ic = [n for n in only if n in ICON_SHEETS]
        if ic: icons(ic)
        return
    for sheet, items in BED_SHEETS.items():
        if not os.path.exists(os.path.join(SRC, sheet + '.png')): continue
        a = load(sheet)
        boxes, lab = components(a, len(items))
        for (y0, y1, x0, x1, i), item in zip(boxes, items):
            if item is None: continue
            name, tw = item
            crop = a[y0:y1, x0:x1].copy()
            crop[lab[y0:y1, x0:x1] != i, 3] = 0
            m = crop[..., 3] > 128
            xs = np.where(m.any(0))[0]
            left = xs[0]; ly = np.where(m[:, left])[0]; cy = ly.mean()
            right = xs[-1]; ry = np.where(m[:, right])[0].mean()
            k = tw / (right - left)
            W, H = (x1 - x0) * k, (y1 - y0) * k
            img = Image.fromarray(crop).resize((round(W * DENSITY), round(H * DENSITY)), Image.LANCZOS)
            save(img, name, W, H, (left + right) / 2 * k, (cy + ry) / 2 * k, man)
            print(f'{name:14s} bed {x1-x0}x{y1-y0}px -> {W:.0f}x{H:.0f} u')

    tiles(man)

    for crop in CROPS:
        for st in range(4):
            name = f'crop_{crop}_{st}'
            a = load(name)
            boxes, lab = components(a, 1, dilate=30)  # ростки одной стадии — вместе
            y0, y1, x0, x1, i = boxes[0]
            c = a[y0:y1, x0:x1].copy()
            c[lab[y0:y1, x0:x1] != i, 3] = 0
            k = CROP_STAGE_W.get(crop, [CROP_W] * 4)[st] / (x1 - x0)
            W, H = (x1 - x0) * k, (y1 - y0) * k
            img = Image.fromarray(c).resize((round(W * DENSITY), round(H * DENSITY)), Image.LANCZOS)
            save(img, name, W, H, W / 2, H - W / 4 - 2, man)
            print(f'{name}  {x1-x0}x{y1-y0}px -> {W:.0f}x{H:.0f} u')

    for sheet, (cols, rows, items) in GRID_SHEETS.items():
        if not os.path.exists(os.path.join(SRC, sheet + '.png')): continue
        a = load(sheet)
        ch, cw = a.shape[0] // rows, a.shape[1] // cols
        for n, item in enumerate(items):
            if item is None: continue
            name, wu, anchor = item
            r, c = divmod(n, cols)
            cell = a[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
            m = cell[..., 3] > 0
            # случайные крошки соседнего предмета ниже/выше пустой полосы — отбрасываем
            filled = np.where(m.any(1))[0]  # строки ячейки, где что-то нарисовано
            gaps = np.where(np.diff(filled) > 10)[0]
            if len(gaps):
                segs = np.split(filled, gaps + 1)
                keep = max(segs, key=len)
                m[:keep[0]] = False; m[keep[-1] + 1:] = False
                cell = cell.copy(); cell[..., 3] *= m
            ys, xs = np.where(m)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            crop = cell[y0:y1, x0:x1].copy()
            k = wu / (x1 - x0)
            W, H = (x1 - x0) * k, (y1 - y0) * k
            if anchor == 'base':
                bw, bx, by = base_of(crop); ax, ay = bx * k, (by - bw / 4) * k
            elif anchor == 'center': ax, ay = W / 2, H / 2
            else: ax, ay = W * anchor[0], H * anchor[1]
            img = Image.fromarray(crop).resize((round(W * DENSITY), round(H * DENSITY)), Image.LANCZOS)
            save(img, name, W, H, ax, ay, man)
            print(f'{name:14s} {x1-x0}x{y1-y0}px -> {W:.0f}x{H:.0f} u')

    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1)
    icons()


if __name__ == '__main__':
    # python tools/slice_art.py [лист ...] — только эти листы деревьев/кустов, остальное не трогать
    # python tools/slice_art.py tiles        — только плитки земли
    main(sys.argv[1:] or None)
