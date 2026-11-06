# Срезать земляной блок у кустов: стенки и кайму убрать, газон сверху растушевать в прозрачность.
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd

def process(src, dst):
    a = np.array(Image.open(src).convert('RGBA')).astype(float)
    A = a[..., 3]; H, W = A.shape
    lab, n = nd.label(nd.binary_dilation(A > 20, iterations=4))
    newA = A.copy(); shadow = np.zeros((H, W))
    yy, xx = np.mgrid[0:H, 0:W]
    for i in range(1, n + 1):
        m = (lab == i) & (A > 20)
        if m.sum() < 3000: continue
        ys, xs = np.where(m); y0, y1 = ys.min(), ys.max(); h = y1 - y0
        # основание: снизу вверх ширина ромба растёт ровно (≈4 пикселя на строку) до боковых вершин;
        # остановка — когда рост кончился или резко скакнул (это уже листья шире основания)
        prev = None; flat = 0; vy, vw, vx = y1, 0, (xs.min() + xs.max()) / 2
        for y in range(y1, int(y1 - h * 0.45), -1):
            r = np.where(m[y])[0]
            if not len(r): continue
            w = r[-1] - r[0]
            if prev is not None and (w - prev > max(20, h * 0.1) or w < prev - 2): break
            if prev is None or w > prev: vy, vw, vx = y, w, (r[0] + r[-1]) / 2; flat = 0
            else:
                flat += 1
                if flat >= 3: break
            prev = w
        hw = vw / 2; hh = hw / 2; bx = vx
        t = max(1, hw * 0.12)            # толщина стенки блока
        cy = vy - t                       # боковые вершины верхней грани
        d = np.abs(xx - bx) / hw + np.abs(yy - cy) / hh  # 1 — край верхней грани
        top = d <= 1.0
        walls = m & ~top & (yy > cy - 2)                # стенки и кайма ниже граней
        newA[walls & (lab == i)] = 0
        # растушевать газон к краю: от 0.55 до 1.0 по d, только в нижней части (ниже верхней вершины)
        lowpart = (yy > cy - hh * 0.2) & (lab == i)
        k = np.clip((1.0 - d) / 0.45, 0, 1)
        k = k * k * (3 - 2 * k)
        fade = lowpart & top & (d > 0.55)
        newA[fade] = newA[fade] * k[fade]
        e = ((xx - bx) / (hw * 0.85)) ** 2 + ((yy - cy) / (hh * 0.85)) ** 2
        shadow = np.maximum(shadow, np.clip(1 - e, 0, 1) ** 0.8 * 0.4)
    o = a.copy(); o[..., 3] = newA
    sh = np.zeros((H, W, 4), np.uint8); sh[..., 0] = 20; sh[..., 1] = 45; sh[..., 2] = 10; sh[..., 3] = (shadow * 255).astype(np.uint8)
    s = Image.fromarray(sh).filter(ImageFilter.GaussianBlur(max(2, W / 250)))
    s.alpha_composite(Image.fromarray(o.astype(np.uint8)))
    s.save(dst)

# python tools/cut_bush_base.py              — все нарезанные кусты assets/art/bush_*.webp (на месте)
# Запускать после tools/slice_art.py для листов кустов: размеры и опора в manifest не меняются.
if __name__ == '__main__':
    import glob, os
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'art', 'bush_*.webp')))
    for f in files:
        tmp = f + '.png'; process(f, tmp)
        Image.open(tmp).save(f, 'WEBP', quality=88, method=6); os.remove(tmp)
        print(os.path.basename(f))
