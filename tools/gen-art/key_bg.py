"""Убрать однотонный фон (хромакей) у картинки из Codex: PNG с прозрачностью.

Codex рисует через gpt-image без прозрачного фона, поэтому мы просим залить фон чистым
цветом (по умолчанию пурпурный #FF00FF) и вырезаем его здесь.

    python tools/gen-art/key_bg.py in.png out.png [--key magenta|green|#RRGGBB|auto]

Цвет фона по умолчанию берётся с краёв картинки (auto): Codex редко попадает точно в #FF00FF.
Полупрозрачные края очищаются от цвета фона (despill), чтобы не было розовой каймы.
"""
import argparse
import numpy as np
from PIL import Image
from scipy import ndimage

KEYS = {'magenta': (255, 0, 255), 'green': (0, 255, 0)}


def border_color(rgb):
    b = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3),
                        rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
    return np.median(b, axis=0)


def key_out(a, key='auto', lo=40.0, hi=110.0):
    rgb = a[..., :3].astype(np.float32)
    if key == 'auto':
        k = border_color(rgb)
    elif key in KEYS:
        k = np.array(KEYS[key], np.float32)
    else:
        h = key.lstrip('#')
        k = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
    d = np.sqrt(((rgb - k) ** 2).sum(-1))
    al = np.clip((d - lo) / (hi - lo), 0, 1)
    # фон — всё похожее на ключ, и снаружи, и в дырках между листьями (на объектах ключевого
    # цвета нет: промпт это запрещает)
    # despill: наблюдаемый цвет = a*obj + (1-a)*key → obj = (obs - (1-a)*key)/a
    a3 = np.maximum(al, 1e-3)[..., None]
    obj = np.clip((rgb - (1 - al[..., None]) * k) / a3, 0, 255)
    rgb = np.where(al[..., None] < 1, obj, rgb)
    # кайма: тёмный контур, смешанный с фоном, остаётся непрозрачным, но с оттенком фона.
    # В полосе у края гасим «лишний» цвет ключа (для пурпурного: R и B выше G)
    hot, cold = k > 128, k <= 128
    if hot.any() and cold.any():
        band = ndimage.distance_transform_edt(al > 0.02) < 4
        spill = np.clip(rgb[..., hot].min(-1) - rgb[..., cold].max(-1), 0, None)
        spill = np.where(band, spill, 0)
        rgb[..., hot] -= spill[..., None]
    # одиночный мусор по краям
    solid = ndimage.binary_opening(al > 0.5, iterations=1)
    lab, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        tiny = np.isin(lab, np.where(sizes < 60)[0] + 1)
        al[tiny] = 0
    out = np.dstack([rgb, al * 255]).round().astype(np.uint8)
    return out, k


def main():
    p = argparse.ArgumentParser()
    p.add_argument('src')
    p.add_argument('dst')
    p.add_argument('--key', default='auto')
    args = p.parse_args()
    a = np.array(Image.open(args.src).convert('RGBA'))
    out, k = key_out(a, args.key)
    Image.fromarray(out).save(args.dst)
    clear = (out[..., 3] == 0).mean() * 100
    print(f'фон {tuple(int(x) for x in k)} убран: прозрачно {clear:.0f}% → {args.dst}')


if __name__ == '__main__':
    main()
