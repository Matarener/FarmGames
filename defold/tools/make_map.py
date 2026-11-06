#!/usr/bin/env python3
"""Карта мира, которую рисуют в редакторе Defold.

  python3 tools/make_map.py palette          — палитра map/palette.png (+ .tilesource)
  python3 tools/make_map.py export [seed]    — выгрузить сгенерированный мир в map/farm.tilemap
                                               (ПЕРЕЗАПИСЫВАЕТ карту! только для первого раза)

Номера плиток палитры (0-based) должны совпадать с farm/map.lua.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

T = 32  # размер клетки палитры, px
COLS = 8

# номер → (картинка, подпись-подсказка). None — пусто.
GROUND = {0: 'ground/tile_grass', 1: 'ground/tile_sand', 2: 'ground/water_0', 3: 'ground/bed_dry'}
OBJECTS = {
    8: 'world/tree_oak', 9: 'world/tree_birch', 10: 'world/tree_sakura', 11: 'world/tree_blossom',
    12: 'world/tree_autumn', 13: 'world/tree_apple', 14: 'world/tree_pine', 15: 'world/bush_pink',
    16: 'world/bush_hydra', 17: 'world/bush_lav', 18: 'world/bush_rose', 19: 'world/bush_blue',
    20: 'world/bush_rasp', 21: 'world/rock_mid', 22: 'world/rock_small', 23: 'world/rock_big',
    24: 'world/rock_moss', 25: 'world/house_1', 26: 'world/well_broken', 27: 'world/g_default_body_b0',
}
OPEN = 32  # зона: участок открыт с начала
ROWS = 5


def palette():
    from PIL import Image, ImageDraw
    im = Image.new('RGBA', (COLS * T, ROWS * T), (0, 0, 0, 0))
    def cell(i):
        return (i % COLS) * T, (i // COLS) * T
    for i, name in GROUND.items():
        src = Image.open(f'{ROOT}/assets/{name}.png').convert('RGBA')
        # цвет из середины ромба — плотная заливка клетки, сверху маленький ромб
        c = src.resize((1, 1), Image.BOX, box=(src.width * 0.35, src.height * 0.35, src.width * 0.65, src.height * 0.65)).getpixel((0, 0))
        x, y = cell(i)
        ImageDraw.Draw(im).rectangle([x, y, x + T - 1, y + T - 1], fill=c[:3] + (255,))
    for i, name in OBJECTS.items():
        src = Image.open(f'{ROOT}/assets/{name}.png').convert('RGBA')
        bb = src.getbbox()
        if bb:
            src = src.crop(bb)
        k = min((T - 2) / src.width, (T - 2) / src.height)
        src = src.resize((max(1, int(src.width * k)), max(1, int(src.height * k))), Image.LANCZOS)
        x, y = cell(i)
        im.alpha_composite(src, (x + (T - src.width) // 2, y + (T - src.height) // 2))
    x, y = cell(OPEN)
    d = ImageDraw.Draw(im)
    d.rectangle([x, y, x + T - 1, y + T - 1], fill=(80, 220, 90, 110), outline=(40, 160, 50, 255), width=2)
    os.makedirs(f'{ROOT}/map', exist_ok=True)
    im.save(f'{ROOT}/map/palette.png')
    open(f'{ROOT}/map/palette.tilesource', 'w').write(
        'image: "/map/palette.png"\ntile_width: 32\ntile_height: 32\ntile_margin: 0\ntile_spacing: 0\n'
        'collision: ""\nmaterial_tag: "tile"\ncollision_groups: "default"\nextrude_borders: 2\ninner_padding: 0\n'
        'sprite_trim_mode: SPRITE_TRIM_MODE_OFF\n')
    print('palette ok')


def export(seed):
    import lupa.luajit21 as lj
    L = lj.LuaRuntime()
    L.execute(f"package.path = '{ROOT}/?.lua;' .. package.path")
    # имена модулей Defold: farm.world → farm/world.lua
    w = L.execute(f"local W = require('farm.world'); return W.new({seed})")
    N = w.N
    # обратная таблица картинок объектов: тип + номер варианта как в view.lua
    OBJ = {
        'oak': ['tree_oak', 'tree_birch'], 'oak2': ['tree_sakura', 'tree_blossom', 'tree_autumn'],
        'apple': ['tree_apple'], 'pine': ['tree_pine'], 'rock': ['rock_mid', 'rock_small'],
        'boulder': ['rock_big', 'rock_moss'], 'bush': ['bush_pink', 'bush_hydra', 'bush_lav', 'bush_rose'],
        'berry': ['bush_blue', 'bush_rasp'],
    }
    by_name = {v.split('/')[1]: k for k, v in OBJECTS.items()}
    ground, objs, zones = {}, {}, {}
    start_beds = set(w.start_beds[i] for i in range(1, len(w.start_beds) + 1))
    for y in range(N):
        for x in range(N):
            i = y * N + x
            t = w.tiles[i]
            ground[(x, y)] = 3 if i in start_beds else {0: 0, 1: 3, 2: 2, 3: 1}[t]
    for oid in range(w.nobj):
        o = w.objects[oid]
        if o is None:
            continue
        ty = o.type
        if ty == 'house':
            k = 25
        elif ty == 'well':
            k = 26
        else:
            lst = OBJ[ty]
            k = by_name[lst[oid % len(lst)]]
        objs[(o.gx, o.gy)] = k
    px, py = w.player_start[1], w.player_start[2]
    objs[(px, py)] = 27
    C = 10
    sc = 12  # стартовый участок
    for y in range((sc // 5) * C, (sc // 5) * C + C):
        for x in range((sc % 5) * C, (sc % 5) * C + C):
            zones[(x, y)] = OPEN

    def layer(name, z, cells):
        out = [f'layers {{\n  id: "{name}"\n  z: {z}\n  is_visible: 1']
        for (x, y), t in sorted(cells.items(), key=lambda e: (e[0][1], e[0][0])):
            # клетка (x, y) мира → строка y сверху вниз в редакторе (у Defold ось y вверх)
            out.append(f'  cell {{\n    x: {x}\n    y: {N - 1 - y}\n    tile: {t}\n    h_flip: 0\n    v_flip: 0\n  }}')
        out.append('}')
        return '\n'.join(out)

    text = '\n'.join([
        'tile_set: "/map/palette.tilesource"',
        layer('ground', 0.0, ground),
        layer('objects', 0.1, objs),
        layer('zones', 0.2, zones),
        'material: "/builtins/materials/tile_map.material"',
        'blend_mode: BLEND_MODE_ALPHA',
    ]) + '\n'
    open(f'{ROOT}/map/farm.tilemap', 'w').write(text)
    print('map ok', len(ground), 'ground', len(objs), 'objects')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'palette'
    if cmd == 'palette':
        palette()
    elif cmd == 'export':
        palette()
        export(int(sys.argv[2]) if len(sys.argv) > 2 else 20251105)
