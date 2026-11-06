# Срезать земляной блок под пучками травы (лист grass_tall) и подложить мягкую тень.
# python tools/cut_grass_base.py assets/source/grass_tall_raw.png assets/source/grass_tall.png
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd
src = Image.open(sys.argv[1]).convert('RGBA'); a = np.array(src).astype(float)
R,G,B,A = a[...,0],a[...,1],a[...,2],a[...,3]
H,W = A.shape
lab, n = nd.label(A > 20)
out = a.copy()
for i in range(1, n+1):
    m = lab == i
    if m.sum() < 5000: continue
    ys, xs = np.where(m); y0, y1 = ys.min(), ys.max(); h = y1 - y0
    low = np.zeros_like(m); low[int(y0 + h*0.62):, :] = True
    soil = (R > G*0.95) & (G < 140) & ~((R > 150) & (G > 110))   # бурая земля (не солома)
    carpet = (G > 120) & (R > G*0.62) & (B < 90)                  # светлый газон сверху блока
    rem = m & low & (soil | carpet)
    # плюс всё ниже самой нижней «тёмной травинки» по колонке
    dark = m & ~rem & (G < 150) & (R < G*0.85)
    for x in range(xs.min(), xs.max()+1):
        col = np.where(dark[:, x] & low[:, x])[0]
        lim = col.max() if len(col) else int(y0 + h*0.62)
        rem[lim+1:, x] |= m[lim+1:, x]
    rem = nd.binary_opening(rem, iterations=1) | (rem & ~nd.binary_dilation(dark, iterations=2))
    out[...,3][rem] = 0
o = Image.fromarray(out.astype(np.uint8))
# мягкая тень под пучками
al = np.array(o)[...,3] > 20
sh = np.zeros((H,W), float)
lab2, n2 = nd.label(nd.binary_dilation(al, iterations=3))
for i in range(1, n2+1):
    ys, xs = np.where(lab2 == i)
    if len(xs) < 5000: continue
    cx = (xs.min()+xs.max())/2; bot = ys.max(); rx = (xs.max()-xs.min())*0.42; ry = rx*0.33
    yy, xx = np.mgrid[0:H, 0:W]
    e = ((xx-cx)/rx)**2 + ((yy-(bot-ry*0.6))/ry)**2
    sh = np.maximum(sh, np.clip(1-e, 0, 1)**0.8 * 0.45)
shadow = np.zeros((H,W,4), np.uint8); shadow[...,0]=20; shadow[...,1]=45; shadow[...,2]=10; shadow[...,3]=(sh*255).astype(np.uint8)
s = Image.fromarray(shadow).filter(ImageFilter.GaussianBlur(6))
s.alpha_composite(o)
s.save(sys.argv[2])
