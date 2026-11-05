# Xuất các nhóm asset Poly Nature Pack (.blend) → GLB, mỗi món bán = 1 GLB chứa nhiều biến thể (node v0, v1, …).
# KHÔNG mang theo shader/texture của pack: chỉ giữ MÀU, rồi để game vẽ bằng đúng shader cây cỏ của vườn (exterior.js styleMat → foliage.js):
#  - vật liệu atlas (PolyShader_v15_X: cánh hoa, thân, vỏ cây, đá…): lấy màu ô atlas tại tâm UV từng tam giác → màu đỉnh COLOR_0 (tuyến tính), không UV
#  - vật liệu lá (PolyFoliage_v01_X): 1 màu phẳng baseColorFactor — đúng giá trị các vật liệu cùng tên trong map vườn (C = trắng → styleMat tô theo palette)
#  - nhóm cây cỏ thấp (STEM_GROUPS): tách cụm thành từng nhánh/cọng (thành phần liên thông + gộp cánh/lá dính vào thân),
#    mỗi đỉnh mang _ROOT = gốc nhánh của nó (toạ độ cục bộ) → gió/cúi khi đi qua tính theo từng nhánh, cả cụm không lắc như 1 khối
# Toạ độ Blender Z-up → glTF Y-up; gốc toạ độ = origin của object trong Blender (gốc thân cây).
import sys, json, struct, os, re, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from extract import objects, mesh_of
from PIL import Image

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
TEX = sys.argv[2] if len(sys.argv) > 2 else os.path.join(OUT, 'tex')
GROUPS = json.load(open(os.path.join(os.path.dirname(__file__), 'groups.json')))
STEM_GROUPS = {'g_flower': 0.3, 'g_grass': 0.22, 'g_reed': 0.35, 'g_fern': 0.45}   # bán kính gộp tối đa (m) của 1 nhánh

def lin(a): return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
_img = {}
def atlas(letter):
    if letter not in _img: _img[letter] = lin(np.asarray(Image.open(os.path.join(TEX, 'atlas-%s.png' % letter.lower())).convert('RGB'), 'f8') / 255.0)
    return _img[letter]
# màu lá phẳng: lấy đúng màu các vật liệu cùng tên trong map-exterior.glb (vườn); D/khô: cam úa
LEAF = {'A': [0.494, 0.651, 0.0], 'B': [0.293, 0.391, 0.024], 'C': [1, 1, 1], 'D': [0.62, 0.30, 0.03]}
def leaf_color(mat):
    m = re.match(r'PolyFoliage_v01_([A-D])', mat or '')
    if m: return LEAF[m.group(1)]
    if re.match(r'PolyFoliage_v01_(BushDry|GrassDry)', mat or ''): return LEAF['D']
    if re.match(r'PolyFoliage_v01_', mat or ''): return LEAF['A']
    return None
def atlas_letter(mat):
    m = re.match(r'PolyShader_v15_([A-F])', mat or ''); return m.group(1) if m else None

def stems(P, T, lim):
    """P: đỉnh (n,3), T: tam giác (m,3) → gốc nhánh cho từng đỉnh (n,3)."""
    key = np.round(P, 4); u, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.reshape(-1)
    par = np.arange(len(u))
    def f(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    for a, b, c in inv[T]:
        ra = f(a); par[f(b)] = ra; par[f(c)] = ra
    lab = np.array([f(inv[i]) for i in range(len(P))]); ids = sorted(set(lab.tolist()))
    comps = [np.nonzero(lab == k)[0] for k in ids]
    # gộp single-linkage: cặp gần nhau (< 3 cm) gộp nếu cụm mới không rộng quá lim
    n = len(comps); cl = list(range(n)); mem = {i: [i] for i in range(n)}
    pairs = []
    for i in range(n):
        A = P[comps[i]]
        for j in range(i + 1, n):
            Bv = P[comps[j]]
            if np.any(A.min(0) - 0.03 > Bv.max(0)) or np.any(Bv.min(0) - 0.03 > A.max(0)): continue
            d = np.sqrt(((A[:, None, :] - Bv[None, :, :]) ** 2).sum(-1)).min()
            if d < 0.03: pairs.append((d, i, j))
    pairs.sort()
    def ext(idx): q = P[np.concatenate([comps[k] for k in idx])]; return max(np.ptp(q[:, 0]), np.ptp(q[:, 2]))
    for d, i, j in pairs:
        a, b = cl[i], cl[j]
        if a == b: continue
        if ext(mem[a] + mem[b]) > lim: continue
        for k in mem[b]: cl[k] = a
        mem[a] += mem.pop(b)
    groups = [np.concatenate([comps[k] for k in v]) for v in mem.values()]
    y0 = P[:, 1].min()
    grounded = [g for g in groups if P[g, 1].min() < y0 + 0.08]
    roots = np.zeros_like(P)
    def base(g):
        q = P[g]; lo = q[q[:, 1] < q[:, 1].min() + 0.05]; return np.array([lo[:, 0].mean(), q[:, 1].min(), lo[:, 2].mean()])
    gb = [(g, base(g)) for g in grounded] or [(np.arange(len(P)), base(np.arange(len(P))))]
    for g in groups:
        if P[g, 1].min() < y0 + 0.08: roots[g] = base(g); continue
        # mảnh lơ lửng (cánh/hạt không chạm thân): theo gốc của nhánh chạm đất gần nhất → không tách khỏi thân khi gió
        best = min(gb, key=lambda t: np.sqrt(((P[g][:, None] - P[t[0]][None]) ** 2).sum(-1)).min())
        roots[g] = best[1]
    return roots.astype('f4'), len(groups)

def build(group):
    obs = {o['name']: o for o in objects() if o['cat']}
    nodes, meshes, accessors, views, mats, mat_idx = [], [], [], [], [], {}
    bin_ = bytearray()
    def add_view(data, target=None):
        while len(bin_) % 4: bin_.append(0)
        off = len(bin_); bin_.extend(data); v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: v['target'] = target
        views.append(v); return len(views) - 1
    def add_acc(arr, typ, comp, target=None, minmax=False):
        vi = add_view(arr.tobytes(), target); a = {'bufferView': vi, 'componentType': comp, 'count': len(arr), 'type': typ}
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accessors.append(a); return len(accessors) - 1
    def material(name):
        if name in mat_idx: return mat_idx[name]
        lc = leaf_color(name)
        m = {'name': name or 'mat', 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1, 'baseColorFactor': (lc or [1, 1, 1]) + [1]}, 'doubleSided': True}
        mats.append(m); mat_idx[name] = len(mats) - 1; return mat_idx[name]
    info = []; lim = STEM_GROUPS.get(group['id'])
    for vi, name in enumerate(group['variants']):
        o = obs.get(name)
        if not o: print('  thiếu', name); continue
        me = mesh_of(o['ob'])
        R = me['M'][:3, :3].T
        pos = me['pos'] @ R.T
        pos = np.stack([pos[:, 0], pos[:, 2], -pos[:, 1]], 1).astype('f4')   # Z-up → Y-up
        off, cv, uv, mi = me['off'], me['cv'], me['uv'], me['mi']
        raw = []
        for m in sorted(set(mi.tolist())):
            mname = me['mats'][m] if m < len(me['mats']) else None
            tri_c = []
            for p in np.nonzero(mi == m)[0]:
                a, b = off[p], off[p + 1]
                for k in range(a + 1, b - 1): tri_c += [a, k, k + 1]
            tri_c = np.array(tri_c, 'i4').reshape(-1, 3)
            L = atlas_letter(mname); col = None
            if L:   # màu ô atlas tại tâm UV của tam giác
                img = atlas(L); H, W = img.shape[:2]; c = uv[tri_c].mean(1)
                x = np.clip((c[:, 0] % 1.0) * W, 0, W - 1).astype(int); y = np.clip((1 - (c[:, 1] % 1.0)) * H, 0, H - 1).astype(int)
                tc = np.round(img[y, x], 3)
                cu, cinv = np.unique(tc, axis=0, return_inverse=True); col = (cu, cinv.reshape(-1))
            # gộp đỉnh trùng (cùng vị trí + cùng màu tam giác)
            ck = np.repeat(col[1], 3) if col else np.zeros(tri_c.size, 'i8')
            key = np.stack([cv[tri_c.reshape(-1)].astype('i8'), ck], 1)
            uk, inv = np.unique(key, axis=0, return_inverse=True)
            P = pos[uk[:, 0]]; C = col[0][uk[:, 1]].astype('f4') if col else None
            raw.append((mname, P, inv.reshape(-1, 3), C))
        roots = None
        if lim:
            allP = np.concatenate([r[1] for r in raw]); offs = np.cumsum([0] + [len(r[1]) for r in raw])
            allT = np.concatenate([r[2] + offs[k] for k, r in enumerate(raw)])
            rt, ng = stems(allP, allT, lim); roots = [rt[offs[k]:offs[k + 1]] for k in range(len(raw))]
            print('   ', name, ng, 'nhánh')
        prims = []
        for k, (mname, P, t, C) in enumerate(raw):
            idx = t.reshape(-1).astype('u2' if len(P) < 65535 else 'u4')
            nrm = np.zeros_like(P)
            fn = np.cross(P[t[:, 1]] - P[t[:, 0]], P[t[:, 2]] - P[t[:, 0]])
            for j in range(3): np.add.at(nrm, t[:, j], fn)
            nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
            at = {'POSITION': add_acc(P, 'VEC3', 5126, 34962, True), 'NORMAL': add_acc(nrm.astype('f4'), 'VEC3', 5126, 34962)}
            if C is not None: at['COLOR_0'] = add_acc(C, 'VEC3', 5126, 34962)
            if roots is not None: at['_ROOT'] = add_acc(roots[k], 'VEC3', 5126, 34962)
            prims.append({'attributes': at, 'indices': add_acc(idx, 'SCALAR', 5123 if idx.dtype == np.uint16 else 5125, 34963), 'material': material(mname)})
        meshes.append({'name': name, 'primitives': prims}); nodes.append({'name': 'v%d' % len(info), 'mesh': len(meshes) - 1, 'extras': {'src': name}})
        sz = pos.max(0) - pos.min(0); info.append({'src': name, 'h': round(float(sz[1]), 2), 'w': round(float(max(sz[0], sz[2])), 2)})
    gl = {'asset': {'version': '2.0', 'generator': 'vybin blend2glb (colors only)'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
          'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}], 'materials': mats}
    js = json.dumps(gl, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    while len(bin_) % 4: bin_.append(0)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    path = os.path.join(OUT, 'glb', group['id'] + '.glb'); os.makedirs(os.path.dirname(path), exist_ok=True); open(path, 'wb').write(out)
    return info, len(out)

summary = {}
only = set(os.environ.get('ONLY', '').split(',')) - {''}
for g in GROUPS:
    if only and g['id'] not in only: continue
    info, size = build(g); summary[g['id']] = info
    print(g['id'], len(info), 'biến thể', round(size / 1024), 'KB')
json.dump(summary, open(os.path.join(OUT, 'variants.json'), 'w'), indent=1, ensure_ascii=False)
