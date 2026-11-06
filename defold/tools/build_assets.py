"""Готовит графику для Defold из JS-версии.

Запуск из корня репозитория:  python3 defold/tools/build_assets.py
Берёт assets/art/*.webp (картинки художника, 4 px на единицу мира) и
defold/tools/out/code/*.png (выгрузка export_code_art.mjs). Пишет:
  defold/assets/{world,ground,gui}/*.png и *.atlas
  defold/farm/art_meta.lua — масштаб каждого спрайта (1 / пикселей на единицу мира)
Каждая картинка дополняется прозрачными полями так, чтобы точка опоры спрайта
оказалась ровно в центре: в Defold спрайт рисуется от центра.
"""
import json, math, os, re, shutil
from PIL import Image

ROOT = 'defold'
ART = 'assets/art'
CODE = 'defold/tools/out/code'
man = json.load(open(f'{ART}/manifest.json'))
code = json.load(open(f'{CODE}/code.json'))

WORLD_PX = 2   # пикселей на единицу мира для мира (как «Высокая» графика в JS)
GHOST_PX = 4   # призрак мелкий — вдвое чётче

meta = {}
atlases = {'world': [], 'ground': [], 'gui': []}

def centered(im, ax, ay, w, h, px_src, px):
    k = px / px_src
    if abs(k - 1) > 1e-6:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    L, R = ax * px, (w - ax) * px
    T, B = ay * px, (h - ay) * px
    hw, hh = math.ceil(max(L, R)), math.ceil(max(T, B))
    out = Image.new('RGBA', (2 * hw, 2 * hh), (0, 0, 0, 0))
    out.paste(im, (round(hw - L), round(hh - T)))
    return out

def add(group, name, im, scale, trim=True, box=None):
    d = f'{ROOT}/assets/{group}'
    os.makedirs(d, exist_ok=True)
    im.save(f'{d}/{name}.png', optimize=True)
    atlases[group].append((name, trim))
    # box — размер исходного спрайта и точка опоры в единицах мира (для выбора нажатием)
    w, h, ax, ay = box or (im.width * scale, im.height * scale, im.width * scale / 2, im.height * scale / 2)
    meta[name] = (scale, w, h, ax, ay)

GROUND = re.compile(r'^(tile_|water_|bed_)')
for name, m in man.items():
    if name.startswith('tex_') or name == 'pond_pier':
        continue
    im = Image.open(f'{ART}/{name}.webp').convert('RGBA')
    px_src = im.width / m['w']
    group = 'ground' if GROUND.match(name) else 'world'
    add(group, name, centered(im, m['ax'], m['ay'], m['w'], m['h'], px_src, WORLD_PX), 1 / WORLD_PX, box=(m['w'], m['h'], m['ax'], m['ay']))

for name, m in code.items():
    im = Image.open(f'{CODE}/{name}.png').convert('RGBA')
    px_src = m['px']
    box = (m['w'], m['h'], m['ax'], m['ay'])
    if name.startswith('g_'):
        add('world', name, centered(im, m['ax'], m['ay'], m['w'], m['h'], px_src, GHOST_PX), 1 / GHOST_PX, box=box)
    elif name.startswith(('water_', 'shore_')):
        add('ground', name, centered(im, m['ax'], m['ay'], m['w'], m['h'], px_src, WORLD_PX), 1 / WORLD_PX, box=box)
    else:
        add('world', name, centered(im, m['ax'], m['ay'], m['w'], m['h'], px_src, WORLD_PX), 1 / WORLD_PX, box=box)

# Простые фигуры: белая точка (частицы, линии), круг (номера очереди), ромб-рамка клетки
def shape(name, size, draw, group='world', scale=0.5):
    from PIL import ImageDraw
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    draw(ImageDraw.Draw(im), im)
    add(group, name, im, scale, trim=False)

shape('px', (8, 8), lambda g, im: g.rectangle([0, 0, 7, 7], fill=(255, 255, 255, 255)))
def circ(g, im):
    big = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
    from PIL import ImageDraw
    ImageDraw.Draw(big).ellipse([2, 2, 93, 93], fill=(255, 255, 255, 255))
    im.paste(big.resize((24, 24), Image.LANCZOS))
shape('circle', (24, 24), circ)

# рамка клетки (ромб 64×32 единицы, 2 px на единицу), штрих границы участка
def outline(g, im):
    from PIL import ImageDraw
    k = 4
    big = Image.new('RGBA', (im.width * k, im.height * k), (0, 0, 0, 0))
    W, H = big.size
    pts = [(W / 2, 2 * k), (W - 4 * k, H / 2), (W / 2, H - 2 * k), (4 * k, H / 2)]
    ImageDraw.Draw(big).line(pts + [pts[0]], fill=(255, 255, 255, 255), width=4 * k, joint='curve')
    im.paste(big.resize(im.size, Image.LANCZOS))
shape('outline', (128, 64), outline)
shape('dash', (16, 4), lambda g, im: g.rectangle([0, 0, 15, 3], fill=(255, 255, 255, 255)))
def plate(g, im):
    from PIL import ImageDraw
    k = 4
    big = Image.new('RGBA', (im.width * k, im.height * k), (0, 0, 0, 0))
    ImageDraw.Draw(big).rounded_rectangle([0, 0, big.width - 1, big.height - 1], radius=16 * k, fill=(255, 255, 255, 255))
    im.paste(big.resize(im.size, Image.LANCZOS))
shape('plate', (48, 48), plate)

# Интерфейс: значки 128 px → 96 px и простые плашки
for f in sorted(os.listdir(ART)):
    if f.startswith('ic_') and f.endswith('.webp'):
        im = Image.open(f'{ART}/{f}').convert('RGBA').resize((96, 96), Image.LANCZOS)
        add('gui', f[:-5], im, 1)
        # те же значки в мире (всплывающие «+3 дерево», таблички): 48 px = 12 единиц
        add('world', 'w' + f[1:-5], im.resize((48, 48), Image.LANCZOS), 0.25)
def rrect(r, fill):
    def d(g, im):
        from PIL import ImageDraw
        s = im.width * 4
        big = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        ImageDraw.Draw(big).rounded_rectangle([0, 0, s - 1, s - 1], radius=r * 4, fill=fill)
        im.paste(big.resize(im.size, Image.LANCZOS))
    return d
shape('ui_round', (48, 48), rrect(16, (255, 255, 255, 255)), 'gui', 1)
shape('ui_pill', (64, 64), rrect(32, (255, 255, 255, 255)), 'gui', 1)
# углы разного радиуса для box(): радиус r, текстура (2r+2)², slice9 = r
for _r in (2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32):
    shape('ui_c%d' % _r, (2 * _r + 2, 2 * _r + 2), rrect(_r, (255, 255, 255, 255)), 'gui', 1)
# простые значки интерфейса, которых нет у художника: шестерёнка, «ещё», записка, крестик
def ink_icon(draw_fn):
    def d(g, im):
        from PIL import ImageDraw
        k = 4
        big = Image.new('RGBA', (im.width * k, im.height * k), (0, 0, 0, 0))
        draw_fn(ImageDraw.Draw(big), big.width)
        im.paste(big.resize(im.size, Image.LANCZOS))
    return d
INK, PAPER, GOLD = (61, 43, 31, 255), (255, 246, 227, 255), (233, 184, 90, 255)
def gear(g, S):
    c = S / 2
    pts = []
    for i in range(16):
        a = i / 16 * 2 * math.pi
        r = S * (0.46 if i % 2 == 0 else 0.36)
        for da in (-0.12, 0.12):
            pts.append((c + r * math.cos(a + da), c + r * math.sin(a + da)))
    g.polygon(pts, fill=PAPER, outline=INK, width=int(S * 0.05))
    g.ellipse([c - S * 0.15, c - S * 0.15, c + S * 0.15, c + S * 0.15], fill=GOLD, outline=INK, width=int(S * 0.05))
shape('ui_gear', (96, 96), ink_icon(gear), 'gui', 1)
def more(g, S):
    for i in range(3):
        x = S * (0.22 + i * 0.28)
        g.ellipse([x - S * 0.1, S * 0.4, x + S * 0.1, S * 0.6], fill=PAPER, outline=INK, width=int(S * 0.05))
shape('ui_more', (96, 96), ink_icon(more), 'gui', 1)
def note(g, S):
    g.rounded_rectangle([S * 0.2, S * 0.1, S * 0.8, S * 0.9], radius=S * 0.06, fill=(251, 240, 212, 255), outline=INK, width=int(S * 0.05))
    for i in range(4):
        y = S * (0.3 + i * 0.14)
        g.line([S * 0.3, y, S * 0.7, y], fill=(138, 90, 53, 255), width=int(S * 0.04))
shape('ui_note', (96, 96), ink_icon(note), 'gui', 1)
def cross(g, S):
    w = int(S * 0.14)
    g.line([S * 0.25, S * 0.25, S * 0.75, S * 0.75], fill=INK, width=w)
    g.line([S * 0.75, S * 0.25, S * 0.25, S * 0.75], fill=INK, width=w)
shape('ui_close', (64, 64), ink_icon(cross), 'gui', 1)
shape('ui_px', (8, 8), lambda g, im: g.rectangle([0, 0, 7, 7], fill=(255, 255, 255, 255)), 'gui', 1)

for group, items in atlases.items():
    lines = []
    for name, trim in sorted(items):
        lines.append('images {\n  image: "/assets/%s/%s.png"\n  sprite_trim_mode: %s\n}' % (group, name, 'SPRITE_TRIM_MODE_8' if trim else 'SPRITE_TRIM_MODE_OFF'))
    lines.append('margin: 0\nextrude_borders: 2\ninner_padding: 1\nmax_page_width: 0\nmax_page_height: 0')
    open(f'{ROOT}/assets/{group}.atlas', 'w').write('\n'.join(lines) + '\n')

with open(f'{ROOT}/farm/art_meta.lua', 'w') as f:
    f.write('-- Сгенерировано defold/tools/build_assets.py: масштаб спрайта (единиц мира на пиксель)\nreturn {\n')
    f.write('-- имя = { масштаб, w, h, ax, ay }\n')
    for k in sorted(meta):
        sc, w, h, ax, ay = meta[k]
        f.write(f'  ["{k}"] = {{ {sc:g}, {w:g}, {h:g}, {ax:g}, {ay:g} }},\n')
    f.write('}\n')

# данные призрака (кости, слоты, скины, анимации) → Lua
g = json.load(open(f'{CODE}/ghost.json'))
def lua(v, ind=''):
    if isinstance(v, dict):
        if not v: return '{}'
        parts = []
        for k, x in v.items():
            key = k if re.match(r'^[A-Za-z_]\w*$', k) and k not in ('end', 'and', 'or', 'not', 'nil', 'true', 'false') else '["%s"]' % k
            parts.append(f'{ind}  {key} = {lua(x, ind + "  ")}')
        return '{\n' + ',\n'.join(parts) + f'\n{ind}}}'
    if isinstance(v, list):
        if all(not isinstance(x, (dict, list)) for x in v):
            return '{' + ', '.join(lua(x) for x in v) + '}'
        return '{\n' + ',\n'.join(f'{ind}  {lua(x, ind + "  ")}' for x in v) + f'\n{ind}}}'
    if v is None: return 'false'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, str): return '"%s"' % v
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return repr(v)
with open(f'{ROOT}/farm/ghost_data.lua', 'w') as f:
    f.write('-- Сгенерировано defold/tools/build_assets.py из src/game/ghost.js (makeGhostData)\n')
    f.write('-- Пустое вложение (null в JS) записано как false.\nreturn ' + lua({k: g[k] for k in ('bones', 'slots', 'skins', 'drawOrders', 'animations', 'rodTip')}) + '\n')
print({k: len(v) for k, v in atlases.items()})
