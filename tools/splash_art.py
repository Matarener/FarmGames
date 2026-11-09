"""Заставка экрана загрузки: assets/source/splash_<вид>.png → assets/splash/splash_<вид>.webp.

    python tools/splash_art.py

Два вида: portrait (телефон вертикально, 2:3) и landscape (горизонтально, 3:2). Браузер скачивает
только один — по ориентации экрана (<picture> в index.html). Заставка видна первой, пока грузится
всё остальное, поэтому файл должен быть лёгким: качество подбирается так, чтобы уложиться в LIMIT.
"""
import io
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets', 'splash')
# вид → размер (ш, в). Codex рисует 1024×1536; на 7/8 от него разница на телефоне не видна, а файл легче
KINDS = {'portrait': (896, 1344), 'landscape': (1344, 896)}
LIMIT = 160 * 1024  # байт на картинку
QUALITY = (76, 72, 68, 64, 60)


def webp(im, q):
    b = io.BytesIO()
    im.save(b, 'WEBP', quality=q, method=6)
    return b.getvalue()


def main():
    os.makedirs(OUT, exist_ok=True)
    for kind, (w, h) in KINDS.items():
        src = os.path.join(SRC, f'splash_{kind}.png')
        if not os.path.exists(src):
            print(f'нет {src}')
            continue
        im = Image.open(src).convert('RGB')
        if im.size != (w, h):
            # кадрируем по центру до нужных пропорций и приводим к размеру
            k = max(w / im.width, h / im.height)
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            x, y = (im.width - w) // 2, (im.height - h) // 2
            im = im.crop((x, y, x + w, y + h))
        for q in QUALITY:
            data = webp(im, q)
            if len(data) <= LIMIT:
                break
        with open(os.path.join(OUT, f'splash_{kind}.webp'), 'wb') as f:
            f.write(data)
        print(f'splash_{kind}.webp {w}x{h} q{q} {len(data) // 1024} КБ')


if __name__ == '__main__':
    sys.exit(main())
