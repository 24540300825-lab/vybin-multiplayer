#!/usr/bin/env python3
"""Dọn file nhân vật xuất từ Blender trước khi tối ưu: bỏ clip rác tên '_' / 'mixamo.com*', node trống 'SleepingArea' và armature mixamo thừa (không có mesh nào dùng) ở gốc cảnh.
Dùng: python3 tools/prep_char.py in.glb out.glb   (sau đó chạy optimize_glb.py rồi build_manifest.py)"""
import json, struct, sys
import numpy as np
src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read(); assert d[:4] == b'glTF'
jl = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + jl]); rest = bytearray(d[20 + jl:])
drop = {'_'}
before = len(j.get('animations', []))
j['animations'] = [a for a in j.get('animations', []) if a.get('name') not in drop and not str(a.get('name', '')).startswith('mixamo.com')]
names = {i: n.get('name') for i, n in enumerate(j['nodes'])}
for sc in j['scenes']:
    sc['nodes'] = [i for i in sc['nodes'] if not (names[i] == 'SleepingArea' and 'mesh' not in j['nodes'][i] and not j['nodes'][i].get('children'))]
def has_hips(i):
    n = j['nodes'][i]
    return n.get('name') == 'mixamorig:Hips' or any(has_hips(c) for c in n.get('children', []))
def has_mesh(i):
    n = j['nodes'][i]
    return 'mesh' in n or any(has_mesh(c) for c in n.get('children', []))
for sc in j['scenes']:
    sc['nodes'] = [i for i in sc['nodes'] if not (has_hips(i) and not has_mesh(i))]
# ---- sửa lệch bind của skin phụ (vd. "TIGHT BONE" đai lưng): Blender xuất node xương theo cha (root.x) nhưng ma trận bind (inverseBindMatrices)
# tính theo vị trí lúc gán trọng số → khi nạp, mesh bị dịch cứng (đai rớt xuống sát chân). Nếu MỌI xương của skin lệch cùng một phép biến đổi cứng D = bind·rest⁻¹
# thì chỉ cần nhân D vào node nhóm cha chung của các xương (chuỗi xương con giữ nguyên) → rest khớp bind, vẫn bám hông theo cha.
def _qmat(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), 0], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), 0], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), 0], [0, 0, 0, 1]])
def _local(n):
    if 'matrix' in n: return np.array(n['matrix'], float).reshape(4, 4).T
    T = np.eye(4); T[:3, 3] = n.get('translation', [0, 0, 0])
    return T @ _qmat(n.get('rotation', [0, 0, 0, 1])) @ np.diag(list(n.get('scale', [1, 1, 1])) + [1])

# Skin "TIGHT BONE": Blender xuất ma trận bind của xương lệch ~0.6 m so với mesh (armature bị dời so với mesh lúc gán trọng số) → xương xoay quanh điểm cách xa mesh,
# mô phỏng đai sẽ văng. Tìm độ dịch tịnh tiến t giữa vị trí bind của xương và trọng tâm các đỉnh nó điều khiển; nếu t lớn thì dời bind của mọi xương cùng t (mesh giữ nguyên).
def _acc(i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    nc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]; ct = {5126: '<f4', 5123: '<u2', 5122: '<i2', 5121: 'u1', 5120: 'i1'}[a['componentType']]
    arr = np.frombuffer(rest, dtype=ct, count=a['count'] * nc, offset=8 + o).reshape(a['count'], nc).astype(float)
    if a.get('normalized'): arr /= {'<u2': 65535, '<i2': 32767, 'u1': 255, 'i1': 127}.get(ct, 1)
    return arr
def fit_skin_offset(si, sk, ibm):
    meshes = [n['mesh'] for n in j['nodes'] if n.get('skin') == si and 'mesh' in n]
    if not meshes: return
    cs = {}
    for mi in meshes:
        for pr in j['meshes'][mi]['primitives']:
            at = pr['attributes']
            if 'JOINTS_0' not in at or 'WEIGHTS_0' not in at: continue
            pos, jn, wt = _acc(at['POSITION']), _acc(at['JOINTS_0']).astype(int), _acc(at['WEIGHTS_0'])
            for k in range(len(sk['joints'])):
                m = (jn == k) & (wt > 0.3); rows = np.where(m.any(1))[0]
                if len(rows): cs.setdefault(k, []).append(pos[rows])
    ks = sorted(cs)
    if len(ks) < 2: return
    B = np.array([np.linalg.inv(ibm[k].T)[:3, 3] for k in ks]); C = np.array([np.concatenate(cs[k]).mean(0) for k in ks])
    t = (C - B).mean(0)
    if np.linalg.norm(t) < 0.15: return
    t[1] += 0.02                                        # trọng tâm đỉnh nằm giữa đoạn xương, thấp hơn gốc xương chút
    Tm = np.eye(4); Tm[:3, 3] = -t
    for k in range(len(ibm)): ibm[k] = (ibm[k].T @ Tm).T   # bind' = T(t)·bind  ⇒  ibm' = ibm·T(−t)
    print('skin', sk.get('name'), ': dời bind xương', np.round(t, 3).tolist(), 'm để khớp mesh')
def realign_skins():
    nodes = j['nodes']; par = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []): par[c] = i
    cache = {}
    def world(i):
        if i not in cache: cache[i] = world(par[i]) @ _local(nodes[i]) if i in par else _local(nodes[i])
        return cache[i]
    bv, acc = j['bufferViews'], j['accessors']
    for si, sk in enumerate(j.get('skins', [])):
        a = acc[sk['inverseBindMatrices']]
        if a['componentType'] != 5126: continue
        v = bv[a['bufferView']]; o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        ibm = np.frombuffer(rest, dtype='<f4', count=a['count'] * 16, offset=8 + o).reshape(-1, 4, 4)   # rest = chunk BIN (sau 8 byte tiêu đề)
        fit_skin_offset(si, sk, ibm)
        Ds = [np.linalg.inv(ibm[k].T) @ np.linalg.inv(world(jn)) for k, jn in enumerate(sk['joints'])]
        if max(np.abs(D - Ds[0]).max() for D in Ds) > 1e-3 or np.abs(Ds[0] - np.eye(4)).max() < 1e-3: continue   # không lệch, hoặc lệch không đồng nhất → bỏ qua
        js = set(sk['joints']); grp = {par[jn] for jn in sk['joints'] if jn in par and par[jn] not in js}
        if len(grp) != 1: print('skin', sk.get('name'), 'lệch bind nhưng không có nhóm cha chung — bỏ qua'); continue
        g = grp.pop(); newL = (np.linalg.inv(world(par[g])) if g in par else np.eye(4)) @ Ds[0] @ world(g)
        for k in ('translation', 'rotation', 'scale'): nodes[g].pop(k, None)
        nodes[g]['matrix'] = [float(x) for x in newL.T.reshape(-1)]
        print('realign skin', sk.get('name'), '→ node', nodes[g].get('name'), '| dịch', np.round(Ds[0][:3, 3], 3).tolist())
        cache.clear()
realign_skins()
jb = json.dumps(j, separators=(',', ':')).encode(); jb += b' ' * ((4 - len(jb) % 4) % 4)
out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(jb) + len(rest)) + struct.pack('<I', len(jb)) + b'JSON' + jb + rest
open(dst, 'wb').write(out)
print('animations', before, '->', len(j['animations']), '| bytes', len(d), '->', len(out))
