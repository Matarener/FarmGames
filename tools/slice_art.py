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
YOUNG_K = 0.65  # молодое растение ниже взрослого во столько раз

# Имена картинок: <вид>_<вариант>. Деревья — tree_<вид>, кусты — bush_<вид> (вид — ключ FLORA в
# src/game/data.js), _bare — без плодов (после сбора), _young — молодое растение.

# Лист → объекты по порядку (сверху вниз, слева направо) и ширина «пятачка» под объектом
# в мировых единицах (по ней считается масштаб). Отрицательная ширина: «пятачок» — весь ромб
# объекта (ширина по краям картинки), опора — его центр.
SHEETS = {
    # ростки посаженных игроком растений (стадия 0): под деревья и под кусты
    'sprouts': [('sprout_tree', -30), ('sprout_bush', -32)],
    'stumps': [('stump_oak', -42), ('stump_birch', -38), ('stump_pine', -42), ('stump_oak_moss', -42)],
    'stumps2': [('stump_apple', -42), ('stump_sakura', -42), ('stump_cherry', -42), ('stump_maple', -42)],
    'well': [('well_broken', 41), ('well_fixed', 42)],
    # дикая высокая трава (WILD): 3 варианта, «пятачок» — ромб чуть меньше клетки
    'grass_tall': [('grass_tall_0', -44), ('grass_tall_1', -48), ('grass_tall_2', -48)],
}
# Листы с одной картинкой: лист называется так же, как картинка. Значение — ширина «пятачка».
# Каждый объект — на своей картинке: на общих листах «пиксели» стиля выходили крупными (пикселили).
SINGLE = {
    # взрослые деревья, камни, кусты (до 2026-11-07 были листы trees, trees2, rocks, bushes)
    'tree_oak': 62, 'tree_apple': 62, 'tree_sakura': 62, 'tree_pine': 60,
    'tree_cherry_bare': 62,  # вишня цветёт: так она выглядит, пока ягоды отрастают после сбора
    'tree_maple': 62, 'tree_birch': 60,
    'boulder': 118, 'rock': 54, 'rock_small': 40, 'boulder_moss': 116,
    'bush_blueberry': 40, 'bush_raspberry': 40, 'bush_rosehip': 40,
    'bush_hydrangea': 40, 'bush_lavender': 40, 'bush_rose': 40,
    # с плодами и без плодов: правка исходной картинки того же растения
    'tree_cherry': 62,  # вишня с ягодами (созревшая)
    'tree_apple_bare': 62, 'tree_sakura_bare': 62,
    'bush_blueberry_bare': 40, 'bush_raspberry_bare': 40, 'bush_rosehip_bare': 40,
    'bush_hydrangea_bare': 40, 'bush_lavender_bare': 40, 'bush_rose_bare': 40,
    # молодые растения (росток → молодое → взрослое): высота — YOUNG_K от взрослого (YOUNG_OF — от какого)
    'tree_oak_young': 62, 'tree_birch_young': 60, 'tree_sakura_young': 62, 'tree_cherry_young': 62,
    'tree_maple_young': 62, 'tree_apple_young': 62, 'tree_pine_young': 60,
    'bush_blueberry_young': 40, 'bush_raspberry_young': 40, 'bush_rosehip_young': 40,
    'bush_hydrangea_young': 40, 'bush_lavender_young': 40, 'bush_rose_young': 40,
    # дом по уровням
    'house_1': -132, 'house_2': -132, 'house_3': -132, 'house_4': -132, 'house_5': -132,
}
SHEETS.update({name: [(name, w)] for name, w in SINGLE.items()})
# молодое растение по высоте взрослого: по умолчанию — <имя без _young>
YOUNG_OF = {'tree_cherry_young': 'tree_cherry_bare'}  # молодая вишня — по цветущей
# Урожай: каждая стадия (0–3) — своя картинка crop_<культура>_<стадия>.png. Растения заполняют
# ромб грядки: масштаб по ширине (ширина стадии в мире), опора — центр ромба.
CROPS = ['wheat', 'carrot', 'beet', 'tomato', 'sunflower', 'pumpkin', 'strawberry', 'cotton', 'corn', 'cabbage']
CROP_W = 54
# капуста растёт вширь: маленький росток → кочан на всю грядку
CROP_STAGE_W = {'cabbage': [17.6, 29.65, 47.13, 56.7]}

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
WATER_GAIN, WATER_LIFT = 1.15, (30, 45, 55)
# плитки земли: каждая — своя картинка с одним ромбом
TILES = ['tile_grass', 'tile_grass_flowers', 'tile_path']


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
                # у деревьев «пятачок» травы — ромб, его самая широкая строка и есть центр
                # (как у пней, иначе пень встаёт выше дерева)
                if name.startswith('tree_'): by += bw / 4
                # у колодца самая широкая строка — середина круглой кладки; опора — от низа кладки
                # под центром (иначе колодец «съезжает» на клетку перед собой)
                if sheet == 'well':
                    mm = crop[..., 3] > 128; c = int(bx)
                    by = np.where(mm[:, max(0, c - 3):c + 3].any(1))[0].max()
            k = base_w / bw  # мир/пиксель
            if name.endswith('_young'):  # молодое — по высоте взрослого
                adult = YOUNG_OF.get(name, name[:-len('_young')])
                if adult in man: k = YOUNG_K * man[adult]['h'] / (y1 - y0)
            W, H = (x1 - x0) * k, (y1 - y0) * k
            img = Image.fromarray(crop).resize((max(1, round(W * DENSITY)), max(1, round(H * DENSITY))), Image.LANCZOS)
            # опора — центр ромба основания (низ минус четверть ширины)
            save(img, name, W, H, bx * k, (by - bw / 4) * k, man)
            print(f'{name:14s} {x1-x0}x{y1-y0}px -> {W:.0f}x{H:.0f} u')

    # Грядки: объёмный ромб (верх + бортик). Ширина — по краям картинки, центр ромба —
    # строка самой левой точки (левый угол верхней грани).
    if only:
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

    # Плитки земли: вырезаем ромб чуть внутри контура (без тёмной обводки)
    TW, TH = (TILE_W + 2) * DENSITY, (TILE_H + 1) * DENSITY
    yy, xx = np.mgrid[0:TH, 0:TW]
    diamond = (np.abs(xx + 0.5 - TW / 2) / (TW / 2) + np.abs(yy + 0.5 - TH / 2) / (TH / 2)) <= 1.0
    for name in TILES:
        a = load(name)
        boxes, lab = components(a, 1)
        y0, y1, x0, x1, i = boxes[0]
        inset = 0.045
        w, h = x1 - x0, y1 - y0
        crop = a[y0 + int(h * inset):y1 - int(h * inset), x0 + int(w * inset):x1 - int(w * inset)]
        img = np.array(Image.fromarray(crop).resize((TW, TH), Image.LANCZOS))
        img[..., 3] = np.where(diamond, 255, 0)
        save(Image.fromarray(img), name, TILE_W + 2, TILE_H + 1, (TILE_W + 2) / 2, (TILE_H + 1) / 2, man)
        print(f'{name:14s} tile')

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

    # Текстура воды: бесшовная, вид сверху. Игра кладёт её на весь пруд по координатам карты
    # (128 px на клетку). Делаем светлее и сочнее под общий стиль.
    src = os.path.join(SRC, 'tex_water.png')
    if os.path.exists(src):
        t = np.array(Image.open(src).convert('RGB')).astype(np.float32)
        t = np.clip(t * WATER_GAIN + np.array(WATER_LIFT), 0, 255).astype(np.uint8)
        img = Image.fromarray(t)
        img = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
        save(img, 'tex_water', img.width, img.height, 0, 0, man)
        print('tex_water', img.size)

    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1)
    icons()


if __name__ == '__main__':
    # python tools/slice_art.py [лист ...] — только эти листы деревьев/кустов, остальное не трогать
    main(sys.argv[1:] or None)
