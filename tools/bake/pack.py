# python3 tools/bake/pack.py → assets/decal/*_a.png, *_n.png, meta.json (nửa kích thước, trộn theo alpha, loang màu ra vùng trong suốt)
from PIL import Image
import numpy as np, json, os
here = os.path.dirname(os.path.abspath(__file__)); src = here + '/out/'; dst = os.path.join(here, '../../assets/decal/')
info = json.load(open(src + 'info.json')); meta = {}
def blur(X):
    P = np.pad(X, ((1, 1), (1, 1), (0, 0)), mode='edge'); return sum(P[1 + dy:P.shape[0] - 1 + dy, 1 + dx:P.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
def half(X, w):
    h, wd = X.shape[:2]; X = X[:h // 2 * 2, :wd // 2 * 2]; w = w[:h // 2 * 2, :wd // 2 * 2]; h, wd = X.shape[:2]
    s = (X * w).reshape(h // 2, 2, wd // 2, 2, -1).sum((1, 3)); ws = w.reshape(h // 2, 2, wd // 2, 2, 1).sum((1, 3)); return s / np.maximum(ws, 1e-5), ws / 4
for k in info:
    A = np.asarray(Image.open(src + k + '_alb.png').convert('RGBA')).astype(np.float32) / 255
    N = np.asarray(Image.open(src + k + '_nrm.png').convert('RGBA')).astype(np.float32) / 255
    a = A[..., 3:4]; col, al = half(A[..., :3], a); nrm, _ = half(N[..., :3] * 2 - 1, a); msk, _ = half(N[..., 3:4], a)
    cov = al[..., 0] > 0.02
    for it in range(12):
        m = cov.astype(np.float32)[..., None]; bm = blur(m)
        col = np.where(cov[..., None], col, blur(col * m) / np.maximum(bm, 1e-5)); nrm = np.where(cov[..., None], nrm, blur(nrm * m) / np.maximum(bm, 1e-5)); msk = np.where(cov[..., None], msk, blur(msk * m) / np.maximum(bm, 1e-5)); cov = bm[..., 0] > 0
    nrm = nrm / np.maximum(np.linalg.norm(nrm, axis=-1, keepdims=True), 1e-5)
    Image.fromarray((np.concatenate([np.clip(col, 0, 1), np.clip(al, 0, 1)], -1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(dst + k + '_a.png', optimize=True)
    Image.fromarray((np.concatenate([np.clip(nrm * 0.5 + 0.5, 0, 1), np.clip(msk, 0, 1)], -1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(dst + k + '_n.png', optimize=True)
    i = info[k]; h = i['fh']; w = h * i['cw'] / i['ch']; meta[k] = {'w': round(w, 3), 'h': round(h, 3), 'bh': round(i['bh'], 3)}
json.dump(meta, open(dst + 'meta.json', 'w')); print(meta)
