#!/usr/bin/env python3
"""Запечённая земля: лист плиток для сеток участков + файлы сеток.

  python3 tools/make_ground_mesh.py

Создаёт assets/ground_sheet.png (основы клеток: трава, цветы, песок, 24 клетки воды),
farm/ground_sheet.lua (где какая плитка на листе) и main/gm/c<N>.mesh + .buffer —
по сетке на участок (25 штук); их вершины пишет farm/view.lua во время игры.
"""
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = ['tile_grass', 'tile_flowers', 'tile_sand'] + [f'water_{x}_{y}' for y in range(4) for x in range(6)]
SW, SH = 1024, 512
TW, TH = 132, 66
CW, CH = 144, 78  # клетка листа: плитка + поля по 6 px (повтор краёв от просачивания соседей на мипмапах)
COLS = SW // CW
CHUNKS = 25
VERTS = 10 * 10 * 6


def sheet():
    im = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
    cells = {}
    for k, name in enumerate(NAMES):
        src = Image.open(f'{ROOT}/assets/ground/{name}.png').convert('RGBA')
        assert src.size == (TW, TH), (name, src.size)
        px, py = (k % COLS) * CW + 6, (k // COLS) * CH + 6
        assert py + TH + 6 <= SH
        # края: копии со сдвигом под плиткой (утолщают непрозрачные края на 1–4 px)
        for d in (4, 3, 2, 1):
            for dx, dy in ((d, 0), (-d, 0), (0, d), (0, -d)):
                im.alpha_composite(src, (px + dx, py + dy))
        im.paste(src, (px, py), src)
        # UV: Defold переворачивает картинку при загрузке, v = 0 — низ листа
        cells[name] = (px / SW, 1 - py / SH, (px + TW) / SW, 1 - (py + TH) / SH)
    im.save(f'{ROOT}/assets/ground_sheet.png')
    out = ['-- Сгенерировано tools/make_ground_mesh.py: плитка → { u0, v_верх, u1, v_низ } на assets/ground_sheet.png',
           'return {']
    for name in NAMES:
        u0, v0, u1, v1 = cells[name]
        out.append(f'  ["{name}"] = {{ {u0:.6f}, {v0:.6f}, {u1:.6f}, {v1:.6f} }},')
    out.append('}')
    open(f'{ROOT}/farm/ground_sheet.lua', 'w').write('\n'.join(out) + '\n')


def meshes():
    os.makedirs(f'{ROOT}/main/gm', exist_ok=True)
    buf = [
        {'name': 'position', 'type': 'float32', 'count': 3, 'data': [0.0] * (VERTS * 3)},
        {'name': 'texcoord0', 'type': 'float32', 'count': 2, 'data': [0.0] * (VERTS * 2)},
        {'name': 'color', 'type': 'float32', 'count': 4, 'data': [0.0] * (VERTS * 4)},
    ]
    text = json.dumps(buf, separators=(',', ':'))
    for c in range(CHUNKS):
        open(f'{ROOT}/main/gm/c{c}.buffer', 'w').write(text)
        open(f'{ROOT}/main/gm/c{c}.mesh', 'w').write(
            'material: "/render/ground_mesh.material"\n'
            f'vertices: "/main/gm/c{c}.buffer"\n'
            'textures: "/assets/ground_sheet.png"\n'
            'primitive_type: PRIMITIVE_TRIANGLES\n'
            'position_stream: "position"\n'
            'normal_stream: "position"\n')


if __name__ == '__main__':
    sheet()
    meshes()
    print('ok')
