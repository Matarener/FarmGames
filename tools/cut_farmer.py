"""Кадры ходьбы фермера: assets/source/walk_1..4.png → assets/farmer/walk_<dir>.png.

На каждом листе 8 кадров на светлом фоне с тенью под ногами. Фон и тень
убираются заливкой от краёв (тень игра рисует сама), кадры ищутся как
отдельные фигуры и складываются в полосу одинаковых ячеек, ноги — по низу.
    python tools/cut_farmer.py
"""
import os
import numpy as np
from PIL import Image
import scipy.ndimage as nd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets', 'farmer')
# лист → направление: dr — вниз-вправо, dl — вниз-влево, ur — вверх-вправо, ul — вверх-влево
SHEETS = {'walk_1.png': 'dl', 'walk_2.png': 'dr', 'walk_3.png': 'ur', 'walk_4.png': 'ul'}
SHADOW = np.array([196, 183, 167])


def cut(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    # фон почти ровный: цвет берём по краям листа
    edge_px = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(edge_px, axis=0)
    near_bg = np.linalg.norm(a - bg, axis=2) < 24
    near_sh = np.linalg.norm(a - SHADOW, axis=2) < 17
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = (r + g + b) / 3
    sat = a.max(2) - a.min(2)
    pale = (sat < 48) & (lum > 186)               # светлый серо-бежевый: фон, край тени, кайма
    passable = near_bg | near_sh
    lab, _ = nd.label(passable)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgm = np.isin(lab, list(border))
    fg = nd.binary_opening(~bgm, iterations=1)
    # светлая кайма по краю фигуры: снимаем слоями
    for _ in range(6):
        edge = fg & ~nd.binary_erosion(fg)
        fg = fg & ~(edge & (pale | near_sh))
    # просветы фона между рукой и телом, между ногами: они не связаны с краем листа
    fg = fg & ~(near_bg | (pale & (lum > 222)))
    fg = nd.binary_opening(fg, iterations=1)
    comp, n = nd.label(fg)
    sizes = nd.sum(fg, comp, range(1, n + 1))
    fg = np.isin(comp, [i + 1 for i, s in enumerate(sizes) if s > 3000])   # без цифр под кадрами
    # 8 кадров стоят ровно: границы ищем в провалах суммы по столбцам у ожидаемых мест
    cols = fg.sum(0)
    xs = np.nonzero(cols)[0]
    x0, x1 = xs.min(), xs.max() + 1
    step = (x1 - x0) / 8
    cuts = [x0]
    for k in range(1, 8):
        c = int(x0 + step * k)
        lo, hi = c - int(step * 0.3), c + int(step * 0.3)
        cuts.append(lo + int(np.argmin(cols[lo:hi])))
    cuts.append(x1)
    frames = []
    for i in range(8):
        m = fg[:, cuts[i]:cuts[i + 1]]
        ys, xx = np.nonzero(m)
        sl = (slice(ys.min(), ys.max() + 1), slice(cuts[i] + xx.min(), cuts[i] + xx.max() + 1))
        al = (fg[sl] * 255).astype(np.uint8)
        frames.append(np.dstack([a[sl].astype(np.uint8), al]))
    return frames


def main():
    os.makedirs(OUT, exist_ok=True)
    all_frames = {d: cut(os.path.join(SRC, f)) for f, d in SHEETS.items()}
    W = max(f.shape[1] for fr in all_frames.values() for f in fr) + 4
    H = max(f.shape[0] for fr in all_frames.values() for f in fr) + 4
    for d, fr in all_frames.items():
        strip = np.zeros((H, W * len(fr), 4), np.uint8)
        for i, f in enumerate(fr):
            h, w = f.shape[:2]
            x0 = i * W + (W - w) // 2
            strip[H - 2 - h:H - 2, x0:x0 + w] = f
        Image.fromarray(strip, 'RGBA').save(os.path.join(OUT, f'walk_{d}.png'), optimize=True)
        print(d, len(fr), 'кадров', W, '×', H)


if __name__ == '__main__':
    main()
