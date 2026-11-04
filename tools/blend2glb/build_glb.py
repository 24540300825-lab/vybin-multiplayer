# Xuất các nhóm asset Poly Nature Pack (.blend) → GLB, mỗi món bán = 1 GLB chứa nhiều biến thể (node v0, v1, …).
# Giữ tên vật liệu gốc (PolyFoliage_v01_X_Wind / PolyShader_v15_X_Wind) để shader toon của game tự cho lá đung đưa.
# Toạ độ Blender Z-up → glTF Y-up; UV lật v; gốc toạ độ = origin của object trong Blender (gốc thân cây).
import sys, json, struct, os, re, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from extract import objects, mesh_of

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
GROUPS = json.load(open(os.path.join(os.path.dirname(__file__), 'groups.json')))

def tex_for(mat):
    m = re.match(r'PolyFoliage_v01_([A-D])', mat or '')
    if m: return 'tex/foliage-%s.jpg' % m.group(1).lower()
    if re.match(r'PolyFoliage_v01_(BushDry|GrassDry)', mat or ''): return 'tex/foliage-d.jpg'
    if re.match(r'PolyFoliage_v01_(Leaf|Hyacinth)', mat or ''): return 'tex/foliage-a.jpg'
    m = re.match(r'PolyShader_v15_([A-F])', mat or '')
    if m: return 'tex/atlas-%s.png' % m.group(1).lower()
    return None

def build(group):
    obs = {o['name']: o for o in objects() if o['cat']}
    nodes, meshes, accessors, views, mats, mat_idx = [], [], [], [], [], {}
    images, textures, img_idx = [], [], {}
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
        t = tex_for(name); m = {'name': name or 'mat', 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1}, 'doubleSided': 'Foliage' in (name or '')}
        if t:
            if t not in img_idx: images.append({'uri': '../' + t}); textures.append({'source': len(images) - 1, 'sampler': 0}); img_idx[t] = len(textures) - 1
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': img_idx[t]}
        mats.append(m); mat_idx[name] = len(mats) - 1; return mat_idx[name]
    info = []
    for vi, name in enumerate(group['variants']):
        o = obs.get(name)
        if not o: print('  thiếu', name); continue
        me = mesh_of(o['ob'])
        R = me['M'][:3, :3].T     # obmat lưu theo cột → ma trận quay/tỉ lệ
        pos = me['pos'] @ R.T
        pos = np.stack([pos[:, 0], pos[:, 2], -pos[:, 1]], 1).astype('f4')   # Z-up → Y-up
        off, cv, uv, mi = me['off'], me['cv'], me['uv'], me['mi']
        prims = []
        for m in sorted(set(mi.tolist())):
            tri_c = []      # tam giác theo chỉ số GÓC (corner)
            for p in np.nonzero(mi == m)[0]:
                a, b = off[p], off[p + 1]
                for k in range(a + 1, b - 1): tri_c += [a, k, k + 1]
            tri_c = np.array(tri_c, 'i4')
            # gộp đỉnh trùng (cùng vị trí + UV)
            key = np.concatenate([cv[tri_c][:, None].astype('f8'), np.round(uv[tri_c], 5)], 1)
            uk, inv = np.unique(key, axis=0, return_inverse=True)
            P = pos[uk[:, 0].astype('i4')]; U = uk[:, 1:3].astype('f4').copy(); U[:, 1] = 1 - U[:, 1]
            idx = inv.reshape(-1).astype('u2' if len(uk) < 65535 else 'u4')
            # pháp tuyến phẳng theo mặt (low-poly): tính trung bình — client bật flatShading
            nrm = np.zeros_like(P); t = idx.reshape(-1, 3)
            fn = np.cross(P[t[:, 1]] - P[t[:, 0]], P[t[:, 2]] - P[t[:, 0]])
            for j in range(3): np.add.at(nrm, t[:, j], fn)
            nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
            prims.append({'attributes': {'POSITION': add_acc(P, 'VEC3', 5126, 34962, True), 'NORMAL': add_acc(nrm.astype('f4'), 'VEC3', 5126, 34962), 'TEXCOORD_0': add_acc(U, 'VEC2', 5126, 34962)},
                          'indices': add_acc(idx, 'SCALAR', 5123 if idx.dtype == np.uint16 else 5125, 34963), 'material': material(me['mats'][m] if m < len(me['mats']) else None)})
        meshes.append({'name': name, 'primitives': prims}); nodes.append({'name': 'v%d' % len(info), 'mesh': len(meshes) - 1, 'extras': {'src': name}})
        sz = pos.max(0) - pos.min(0); info.append({'src': name, 'h': round(float(sz[1]), 2), 'w': round(float(max(sz[0], sz[2])), 2)})
    gl = {'asset': {'version': '2.0', 'generator': 'vybin blend2glb'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
          'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}], 'materials': mats,
          'images': images, 'textures': textures, 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]}
    js = json.dumps(gl, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    while len(bin_) % 4: bin_.append(0)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    path = os.path.join(OUT, 'glb', group['id'] + '.glb'); os.makedirs(os.path.dirname(path), exist_ok=True); open(path, 'wb').write(out)
    return info, len(out)

summary = {}
for g in GROUPS:
    info, size = build(g); summary[g['id']] = info
    print(g['id'], len(info), 'biến thể', round(size / 1024), 'KB')
json.dump(summary, open(os.path.join(OUT, 'variants.json'), 'w'), indent=1, ensure_ascii=False)
