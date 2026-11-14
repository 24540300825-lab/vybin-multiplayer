#!/usr/bin/env python3
"""HANA → bộ cây cỏ của game (assets/flora-hana.glb).

  python3 tools/hana_kit.py <hana_scene.glb> <thư mục textures/> assets/flora-hana.glb
  (rồi: python3 tools/quantize_normals.py assets/flora-hana.glb && python3 tools/build_manifest.py)

File export HANA (Dynamic) vẽ lá từng chiếc bằng instancing (1 cây = hàng nghìn bản thể lá). Game lại rải HÀNG NGHÌN cây/bụi bằng
instancing → ở đây gộp lá của MỖI cây thành 1 hình học (mỗi lá 4 đỉnh / 2 tam giác, đã đặt sẵn vị trí) để game instancing theo cây.
Thuộc tính HANA của từng lá đi theo đỉnh:
  NORMAL   = pháp tuyến của lá          _VOLN (byte4)  = mass normal của tán (xyz)
  _LEAF (ubyte4) = rand, độ sâu trong tán, độ cao trong cây, tip (0 gốc → 1 ngọn)      TEXCOORD_0 = UV của lá (cắt viền lá trong shader)
Lõi tối của bụi (core) gộp chung, UV = (0.5, 0.5) để không bị cắt.
Vật rắn (đá, cành, chậu, hoa) giữ nguyên lưới + vật liệu HANA gốc; data map (_data.png) nhúng vào làm occlusionTexture
(game đọc lại làm data map). Mỗi bộ (kit) = 1 node gốc KIT_<id>_L<lod>, gốc toạ độ = chân cây/đá (tâm đáy).
"""
import json, struct, sys, os, math
import numpy as np

SRC, TEXD, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

# ---- định nghĩa bộ: id → các cấp LOD (tên node trong file HANA, không có hậu tố _HANA/_HANA_Foliage) ----
TREES = {
    'tree1': [('Tree_Leaf_1', 'Tree_Branch_1'), ('Tree_Leaf_1_5_LOD1', 'Tree_Branch_1.001'), ('Tree_Leaf_1_5_LOD2', 'Tree_Branch_1_3_LOD2')],
    'tree2': [('Tree_Leaf_2', 'Tree_Branch_2'), ('Tree_Leaf_2_6_LOD1', 'Tree_Branch_2.001'), ('Tree_Leaf_2_6_LOD2', 'Tree_Branch_2_4_LOD2')],
}
BUSHES = {
    'bush2': ['Bush_2', 'Bush_2_1_LOD1', 'Bush_2.002'],
    'bush3': ['Bush_3', 'Bush_3_2_LOD1', 'Bush_3_1_LOD2'],
    'bush4': ['Bush_4', 'Bush_4_3_LOD1', None],              # thiếu LOD2 → tự làm thưa từ LOD1 (giống LOD thưa lá của HANA)
    'berry': ['Bush_bush-blackberry-eurasian-generic-mature-b_1', 'Bush_bush-blackberry-eurasian-generic-mature-b_1_4_LOD1',
              'Bush_bush-blackberry-eurasian-generic-mature-b_1_2_LOD2'],
}
BERRY_FRUIT = 'bush-blackberry-eurasian-generic-mature-b.001'   # quả đỏ (lưới rắn) của bụi berry LOD0
SOLIDS = {   # id: (tên node, loại)
    'rock1': ('Rock_1', 'rock'), 'rock2': ('Rock_2', 'rock'), 'rock3': ('Rock_3', 'rock'), 'rock4': ('Rock_4', 'rock'),
    'rock5': ('Rock_5', 'rock'), 'rock6': ('Rock_6', 'rock'), 'flat1': ('Rock_Flat_1', 'flat'), 'flat2': ('Rock_Flat_2', 'flat'),
    'flowerc': ('flower-calendula-single-mature-a', 'flower'), 'flower1': ('Flower_1', 'flower'), 'flower2': ('Flower_2', 'flower'),
    'pot1': ('pot1', 'pot'), 'pot2': ('pot2', 'pot'), 'pot3': ('pot3', 'pot'), 'pot4': ('pot4', 'pot'), 'pot5': ('pot5', 'pot'),
}
GRASS = 'Grass_plane'
GRASS_CLUMPS = [  # (tâm x, z trong tấm cỏ 2×2 m, số lá LOD0, LOD1)
    (-0.5, -0.5, 26, 12), (0.45, -0.4, 26, 12), (-0.1, 0.5, 26, 12)]
GRASS_R = 0.30

# ---------------------------------------------------------------------------------------------
b = open(SRC, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]
J = json.loads(b[20:20 + jl])
binoff = 20 + jl + 8
BIN = bytearray(b[binoff:binoff + struct.unpack('<I', b[20 + jl:24 + jl])[0]])
nodes = J['nodes']
byname = {n.get('name'): i for i, n in enumerate(nodes)}

def acc_np(ai):
    a = J['accessors'][ai]; bv = J['bufferViews'][a['bufferView']]
    nc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8, 5120: np.int8, 5122: np.int16}[a['componentType']]
    st = bv.get('byteStride') or nc * np.dtype(dt).itemsize
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    raw = np.frombuffer(BIN, dtype=np.uint8, count=st * (a['count'] - 1) + nc * np.dtype(dt).itemsize, offset=off)
    arr = np.lib.stride_tricks.as_strided(raw.view(np.uint8), shape=(a['count'], nc * np.dtype(dt).itemsize), strides=(st, 1)).copy().view(dt).reshape(a['count'], nc)
    if a.get('normalized'):
        arr = arr.astype(np.float32) / {np.uint8: 255., np.int8: 127., np.uint16: 65535., np.int16: 32767.}[dt]
    return arr

def node_mat(n):
    t = n.get('translation', [0, 0, 0]); r = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = r
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(s)[None, :]; M[:3, 3] = t
    return M

def find(name, suffix):
    for k in (name + suffix, name):
        if k in byname: return byname[k]
    raise KeyError(name + suffix)

def foliage(name):
    n = nodes[find(name, '_HANA_Foliage')]
    meta = json.loads(n['extras']['hana_foliage'])
    f = np.fromfile(os.path.join(TEXD, os.path.basename(meta['bin'])), dtype='<f4')
    sec = {k: f[v[0]:v[0] + v[1] * v[2]].reshape(v[1], v[2]) for k, v in meta['sections'].items()}
    return meta, sec

def quat_rot(q, v):   # q (N,4) xyzw, v (N,M,3) → quay
    x, y, z, w = q[:, 0:1, None], q[:, 1:2, None], q[:, 2:3, None], q[:, 3:4, None]
    u = np.concatenate([x, y, z], axis=2)
    uv = np.cross(np.broadcast_to(u, v.shape), v)
    uuv = np.cross(np.broadcast_to(u, v.shape), uv)
    return v + 2 * (w * uv + uuv)

def shape_dedupe(sec):
    """hình lá/cọng: gộp đỉnh trùng (6 → 4 với lá, 30 → 12 với cỏ) → (pos, nrm, uv, tip, chỉ số)"""
    sp, sn, su, stp = sec['shape_pos'], sec['shape_nrm'], sec['shape_uv'], sec['shape_tip'][:, 0]
    key = [tuple(np.round(np.r_[sp[i], su[i]], 5)) for i in range(len(sp))]
    uniq, idx = [], []
    for k in key:
        if k not in uniq: uniq.append(k)
        idx.append(uniq.index(k))
    first = [key.index(k) for k in uniq]
    return sp[first], sn[first], su[first], stp[first], np.array(idx)

# ---- ghi buffer / accessor mới ----
def align4():
    while len(BIN) % 4: BIN.append(0)

def add_acc(arr, comp, typ, normalized=False, target=None, minmax=False):
    align4()
    arr = np.ascontiguousarray(arr)
    off = len(BIN); BIN.extend(arr.tobytes())
    bv = {'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes}
    if target: bv['target'] = target
    J['bufferViews'].append(bv)
    a = {'bufferView': len(J['bufferViews']) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if normalized: a['normalized'] = True
    if minmax:
        a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    J['accessors'].append(a)
    return len(J['accessors']) - 1

def foliage_store(meta, sec, origin, keep=None, grow=1.0, core=True):
    """lưu dữ liệu lá thô (game tự dựng hình học lúc tải): inst = 16 float/lá (MAT4), toạ độ đã dời về gốc kit."""
    inst = sec['inst'] if keep is None else sec['inst'][keep]
    inst = inst.astype(np.float32).copy(); inst[:, 0:3] -= origin; inst[:, 7:10] *= grow
    assert np.allclose(inst[:, 7], inst[:, 8], rtol=1e-3) and np.allclose(inst[:, 7], inst[:, 9], rtol=1e-3), 'scale lá không đều'
    sp, sn, su, stp, si = shape_dedupe(sec)
    d = {'kind': meta['kind'], 'sil': bool(meta.get('silhouette')), 'n': int(len(inst)),
         # 1 lá = vị trí (float) + scale đều (float) + quaternion (byte) + mass normal (byte) + rand/độ sâu/độ cao (ubyte) → 28 byte
         'ip': add_acc(inst[:, 0:3], 5126, 'VEC3'), 'is': add_acc(inst[:, 7:8], 5126, 'SCALAR'),
         'iq': add_acc(np.clip(np.round(inst[:, 3:7] * 127), -127, 127).astype(np.int8), 5120, 'VEC4', normalized=True),
         'iv': add_acc(np.concatenate([np.clip(np.round(inst[:, 10:13] / np.maximum(np.linalg.norm(inst[:, 10:13], axis=1, keepdims=True), 1e-6) * 127), -127, 127), np.zeros((len(inst), 1))], 1).astype(np.int8), 5120, 'VEC4', normalized=True),
         'il': add_acc(np.concatenate([np.clip(np.round(inst[:, 13:16] * 255), 0, 255), np.zeros((len(inst), 1))], 1).astype(np.uint8), 5121, 'VEC4', normalized=True),
         'sp': add_acc(sp.astype(np.float32), 5126, 'VEC3'), 'sn': add_acc(sn.astype(np.float32), 5126, 'VEC3'),
         'su': add_acc(su.astype(np.float32), 5126, 'VEC2'), 'st': add_acc(stp.astype(np.float32), 5126, 'SCALAR'),
         'si': add_acc(si.astype(np.uint16), 5123, 'SCALAR'), 'params': meta['params']}
    if core and 'core_pos' in sec and len(sec['core_pos']):
        d['cp'] = add_acc((sec['core_pos'] - origin).astype(np.float32), 5126, 'VEC3')
        d['cn'] = add_acc(sec['core_nrm'].astype(np.float32), 5126, 'VEC3')
        d['ch'] = add_acc(sec['core_height'].astype(np.float32), 5126, 'SCALAR')
    P = quat_pts(inst, sp)
    lo, hi = P.min(0), P.max(0)
    if 'cp' in d: lo, hi = np.minimum(lo, (sec['core_pos'] - origin).min(0)), np.maximum(hi, (sec['core_pos'] - origin).max(0))
    return d, lo, hi

def quat_pts(inst, sp):
    P = quat_rot(inst[:, 3:7], sp[None, :, :] * inst[:, None, 7:10]) + inst[:, None, 0:3]
    return P.reshape(-1, 3)

# ---- data map của vật rắn → nhúng vào GLB làm occlusionTexture ----
img_cache = {}
def embed_png(path):
    if path in img_cache: return img_cache[path]
    from PIL import Image
    import io
    bio = io.BytesIO(); Image.open(path).convert('RGB').save(bio, 'WEBP', quality=92, method=6); data = bio.getvalue()   # data map: webp (nhẹ ~10×)
    align4(); off = len(BIN); BIN.extend(data)
    J['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
    J['images'].append({'name': os.path.basename(path)[:-4], 'mimeType': 'image/webp', 'bufferView': len(J['bufferViews']) - 1})
    J.setdefault('samplers', []).append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071})
    J['textures'].append({'sampler': len(J['samplers']) - 1, 'extensions': {'EXT_texture_webp': {'source': len(J['images']) - 1}}})
    img_cache[path] = len(J['textures']) - 1
    return img_cache[path]

for m in J['materials']:
    ex = m.get('extras', {})
    if ex.get('hana_data_map'):
        m['occlusionTexture'] = {'index': embed_png(os.path.join(TEXD, os.path.basename(ex['hana_data_map'])))}
    if ex.get('hana_mode') == 'dynamic' and 'KHR_materials_unlit' in m.get('extensions', {}):
        m['extensions'].pop('KHR_materials_unlit')     # GLTFLoader bỏ qua occlusionTexture (data map) của vật liệu unlit → game tự dựng lại vật liệu HANA

# ---- dựng các node KIT ----
new_nodes, roots, info = [], [], {}

def solid_world(ni):
    """→ (M thế giới, min, max) của 1 node lưới rắn."""
    n = nodes[ni]; M = node_mat(n)
    lo, hi = np.full(3, 1e9), np.full(3, -1e9)
    for p in J['meshes'][n['mesh']]['primitives']:
        P = acc_np(p['attributes']['POSITION'])[:, :3]
        W = P @ M[:3, :3].T + M[:3, 3]
        lo, hi = np.minimum(lo, W.min(0)), np.maximum(hi, W.max(0))
    return M, lo, hi

def mesh_node(name, mesh, M, origin):
    """node con: lưới có sẵn, ma trận = M dời về gốc kit."""
    T = M.copy(); T[:3, 3] -= origin
    # tách TRS (không có xoay lệch trục trong file HANA; vẫn giữ xoay nếu có)
    s = np.linalg.norm(T[:3, :3], axis=0); R = T[:3, :3] / s
    w = math.sqrt(max(0, 1 + R[0, 0] + R[1, 1] + R[2, 2])) / 2
    q = [0, 0, 0, 1] if w < 1e-6 else [(R[2, 1] - R[1, 2]) / (4 * w), (R[0, 2] - R[2, 0]) / (4 * w), (R[1, 0] - R[0, 1]) / (4 * w), w]
    nd = {'name': name, 'mesh': mesh, 'translation': T[:3, 3].tolist(), 'rotation': q, 'scale': s.tolist()}
    new_nodes.append(nd); return len(nodes) + len(new_nodes) - 1

def kit_root(kid, lod, children, extras):
    nd = {'name': f'KIT_{kid}_L{lod}', 'children': children, 'extras': extras}
    new_nodes.append(nd); roots.append(len(nodes) + len(new_nodes) - 1)

def fol_node(name, d):
    new_nodes.append({'name': name, 'extras': {'hana_fol': d}}); return len(nodes) + len(new_nodes) - 1

rng = np.random.default_rng(7)

def center_of(sec):
    cp = sec['core_pos'] if 'core_pos' in sec and len(sec['core_pos']) else sec['inst'][:, :3]
    return np.array([(cp[:, 0].min() + cp[:, 0].max()) / 2, sec['inst'][:, 1].min(), (cp[:, 2].min() + cp[:, 2].max()) / 2])

# cây: lá + cành. Cành của mọi cấp dùng chung lưới cành LOD0 (cùng hình, cùng texture) đặt theo node cành của cấp đó.
for kid, levels in TREES.items():
    b0 = find(levels[0][1], '_HANA')
    for lod, (lname, bname) in enumerate(levels):
        bi = find(bname, '_HANA'); Mb, blo, bhi = solid_world(bi)
        origin = np.array([Mb[0, 3], blo[1], Mb[2, 3]])
        meta, sec = foliage(lname)
        d, lo, hi = foliage_store(meta, sec, origin)
        ch = [fol_node(f'{kid}_leaves_L{lod}', d), mesh_node(f'{kid}_branch', nodes[b0]['mesh'], Mb, origin)]
        lo = np.minimum(lo, blo - origin); hi = np.maximum(hi, bhi - origin)
        kit_root(kid, lod, ch, {'kit': kid, 'kind': 'tree', 'lod': lod, 'size': (hi - lo).tolist(), 'min': lo.tolist(), 'max': hi.tolist()})
        info[f'{kid}_L{lod}'] = (d['n'], (hi - lo).round(2).tolist())

# bụi
for kid, levels in BUSHES.items():
    _, sec0 = foliage(levels[0]); o0 = center_of(sec0)
    for lod in range(3):
        lname = levels[lod]
        if lname is None:      # tự làm LOD2: giữ ~30% lá của LOD1, lá lớn hơn để giữ độ phủ (như LOD thưa lá của HANA)
            meta, sec = foliage(levels[1]); keep = np.sort(rng.choice(len(sec['inst']), int(len(sec['inst']) * 0.3), replace=False))
            origin = center_of(sec); d, lo, hi = foliage_store(meta, sec, origin, keep, 1.35)
        else:
            meta, sec = foliage(lname); origin = center_of(sec); d, lo, hi = foliage_store(meta, sec, origin)
        ch = [fol_node(f'{kid}_leaves_L{lod}', d)]
        if kid == 'berry':       # quả đỏ: lưới rắn đặt theo LOD0, dời theo gốc của từng cấp
            fi = find(BERRY_FRUIT, '_HANA'); Mf = node_mat(nodes[fi]).copy(); Mf[:3, 3] = Mf[:3, 3] - o0 + origin
            ch.append(mesh_node(f'{kid}_fruit', nodes[fi]['mesh'], Mf, origin))
        kit_root(kid, lod, ch, {'kit': kid, 'kind': 'bush', 'lod': lod, 'size': (hi - lo).tolist(), 'min': lo.tolist(), 'max': hi.tolist()})
        info[f'{kid}_L{lod}'] = (d['n'], (hi - lo).round(2).tolist())

# cỏ: dùng NGUYÊN tấm cỏ HANA (Grass_plane 2×2 m) làm đơn vị rải. LOD0 = đủ mọi cọng; LOD1 = ~40% cọng (to hơn chút để giữ độ phủ)
meta, sec = foliage(GRASS)
P0 = sec['inst'][:, :3]
origin = np.array([(P0[:, 0].min() + P0[:, 0].max()) / 2, P0[:, 1].min(), (P0[:, 2].min() + P0[:, 2].max()) / 2])
allb = np.arange(len(P0)); half = np.sort(rng.choice(allb, int(len(allb) * 0.4), replace=False))
for lod, (keep, grow) in enumerate(((None, 1.0), (half, 1.2))):
    d, lo, hi = foliage_store(meta, sec, origin, keep, grow, core=False)
    kit_root('grassp', lod, [fol_node(f'grassp_L{lod}', d)], {'kit': 'grassp', 'kind': 'grass', 'lod': lod, 'size': (hi - lo).tolist(), 'min': lo.tolist(), 'max': hi.tolist(),
             'blade_h': float(np.median(sec['inst'][:, 7]))})
    info[f'grassp_L{lod}'] = (d['n'], (hi - lo).round(2).tolist())

# vật rắn: đá, đá phẳng, hoa, chậu
for kid, (nm, kind) in SOLIDS.items():
    ni = find(nm, '_HANA'); M, lo, hi = solid_world(ni)
    origin = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    kit_root(kid, 0, [mesh_node(kid, nodes[ni]['mesh'], M, origin)], {'kit': kid, 'kind': kind, 'lod': 0, 'size': (hi - lo).tolist(), 'min': (lo - origin).tolist(), 'max': (hi - origin).tolist()})
    info[kid] = ('solid', (hi - lo).round(2).tolist())

# ---- ghi file: chỉ giữ các node KIT (bỏ node gốc của file HANA) ----
nodes.extend(new_nodes)
J['scenes'] = [{'name': 'HANA_KIT', 'nodes': roots}]; J['scene'] = 0
# dọn: bỏ extras foliage cũ khỏi node không dùng (nhẹ JSON)
for n in nodes:
    if 'extras' in n and 'hana_foliage' in n['extras']: n['extras'].pop('hana_foliage')
align4()
J['buffers'] = [{'byteLength': len(BIN)}]
js = json.dumps(J, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(BIN)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BIN), 0x004E4942) + bytes(BIN)
open(OUT, 'wb').write(out)
for k, v in info.items(): print(f'{k:12} {v}')
print('→', OUT, f'{len(out) / 1e6:.2f} MB')
