#!/usr/bin/env python3
"""Giảm dung lượng animation trong GLB (nhân vật xuất từ Blender bake mọi khung hình cho mọi xương).
Dùng: python3 tools/optimize_anim.py in.glb out.glb [--rot 0.0005] [--pos 0.0002] [--w 0.001]
Cách làm (gần như không đổi chuyển động):
  • mỗi kênh LINEAR: bỏ các khoá mà nội suy tuyến tính giữa 2 khoá giữ lại vẫn khớp trong sai số (Ramer–Douglas–Peucker, sai số tối đa có bảo đảm)
  • luôn giữ khoá đầu & cuối → thời lượng clip không đổi; kênh hằng số còn 2 khoá
  • gộp các mảng thời gian trùng nhau; dọn bufferView/accessor không còn dùng và đóng gói lại file
Mesh, skin, material, texture giữ nguyên byte-by-byte.
"""
import json, struct, sys, argparse, hashlib
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load(p):
    d = open(p, 'rb').read()
    assert d[:4] == b'glTF'
    jl = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', d[off:off + 4])[0]
    return j, d[off + 8:off + 8 + bl]


def save(p, j, binc):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    binc += b'\0' * ((4 - len(binc) % 4) % 4)
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(binc))
    out += struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(binc)) + b'BIN\0' + binc
    open(p, 'wb').write(out)


def read_acc(j, binc, ai):
    a = j['accessors'][ai]
    bv = j['bufferViews'][a['bufferView']]
    dt, nc = CT[a['componentType']], NC[a['type']]
    st = bv.get('byteStride', 0)
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    item = np.dtype(dt).itemsize * nc
    if st and st != item:
        raw = np.frombuffer(binc, np.uint8, count=st * (a['count'] - 1) + item, offset=o)
        rows = np.lib.stride_tricks.as_strided(raw, (a['count'], item), (st, 1))
        return np.frombuffer(rows.copy().tobytes(), dt).reshape(a['count'], nc)
    return np.frombuffer(binc, dt, count=a['count'] * nc, offset=o).reshape(a['count'], nc)


def norm_rows(v):
    return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)


def rdp(t, v, tol, quat):
    """Trả về chỉ số khoá giữ lại (luôn gồm đầu & cuối)."""
    n = len(t)
    if n <= 2: return list(range(n))
    keep = np.zeros(n, bool); keep[0] = keep[-1] = True
    st = [(0, n - 1)]
    while st:
        a, b = st.pop()
        if b - a < 2: continue
        idx = np.arange(a + 1, b)
        f = ((t[idx] - t[a]) / max(t[b] - t[a], 1e-12))[:, None]
        va, vb = v[a], v[b]
        if quat and np.dot(va, vb) < 0: vb = -vb
        p = va * (1 - f) + vb * f
        if quat:
            p = norm_rows(p)
            q = v[idx] * np.where(np.sum(v[idx] * p, axis=1, keepdims=True) < 0, -1, 1)   # q và -q là cùng một phép quay
            e = np.abs(q - p).max(axis=1)
        else:
            e = np.abs(v[idx] - p).max(axis=1)
        k = int(np.argmax(e))
        if e[k] > tol:
            m = int(idx[k]); keep[m] = True; st.append((a, m)); st.append((m, b))
    return list(np.nonzero(keep)[0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--rot', type=float, default=0.0005)
    ap.add_argument('--pos', type=float, default=0.0002)
    ap.add_argument('--w', type=float, default=0.001)
    a = ap.parse_args()
    j, binc = load(a.src)
    A, BV = j['accessors'], j['bufferViews']
    new_data = {}            # accessor index -> np array (thay dữ liệu)
    tin = tout = 0
    inputs = {}              # hash mảng thời gian -> accessor index (gộp trùng)
    for an in j.get('animations', []):
        for ch in an['channels']:
            s = an['samplers'][ch['sampler']]
            if s.get('interpolation', 'LINEAR') != 'LINEAR': continue
            path = ch['target'].get('path')
            ia, oa = s['input'], s['output']
            if A[oa].get('componentType') != 5126 or A[oa].get('sparse') or A[ia].get('sparse'): continue
            t = read_acc(j, binc, ia)[:, 0].astype(np.float64)
            v = read_acc(j, binc, oa).astype(np.float64)
            if path == 'weights':
                nw = len(v) // len(t)
                if nw * len(t) != len(v): continue
                v = v.reshape(len(t), nw)
            tol = a.rot if path == 'rotation' else a.w if path == 'weights' else a.pos
            keep = rdp(t, v, tol, path == 'rotation')
            tin += len(t); tout += len(keep)
            if len(keep) == len(t): continue
            nt = t[keep].astype(np.float32)
            nv = v[keep].astype(np.float32)
            if path == 'weights': nv = nv.reshape(-1, 1)
            # accessor mới cho output
            A.append({'componentType': 5126, 'count': int(len(nv)), 'type': A[oa]['type']})
            s['output'] = len(A) - 1; new_data[len(A) - 1] = nv
            h = hashlib.md5(nt.tobytes()).hexdigest()
            if h not in inputs:
                A.append({'componentType': 5126, 'count': int(len(nt)), 'type': 'SCALAR', 'min': [float(nt.min())], 'max': [float(nt.max())]})
                inputs[h] = len(A) - 1; new_data[len(A) - 1] = nt.reshape(-1, 1)
            s['input'] = inputs[h]
    # ---- đóng gói lại: chỉ giữ accessor/bufferView còn được tham chiếu ----
    used = set()
    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ('accessor', 'indices', 'input', 'output', 'inverseBindMatrices') and isinstance(v, int): used.add(v)
                elif k in ('attributes',) and isinstance(v, dict): used.update(x for x in v.values() if isinstance(x, int))
                elif k == 'targets' and isinstance(v, list):
                    for tg in v: used.update(x for x in tg.values() if isinstance(x, int))
                else: walk(v)
        elif isinstance(o, list):
            for x in o: walk(x)
    walk({k: v for k, v in j.items() if k not in ('accessors', 'bufferViews', 'buffers')})
    amap = {}; nA = []
    for i, acc in enumerate(A):
        if i in used: amap[i] = len(nA); nA.append(acc)
    # bufferView còn dùng: bởi accessor giữ lại (dữ liệu cũ) hoặc image
    bv_used = set(acc['bufferView'] for i, acc in enumerate(A) if i in used and 'bufferView' in acc and i not in new_data)
    for im in j.get('images', []):
        if 'bufferView' in im: bv_used.add(im['bufferView'])
    for ext in (j.get('extensions') or {}).values():
        pass
    out = bytearray(); bvmap = {}; nBV = []
    for i, bv in enumerate(BV):
        if i not in bv_used: continue
        o = bv.get('byteOffset', 0)
        while len(out) % 4: out.append(0)
        nb = dict(bv); nb['byteOffset'] = len(out); nb['buffer'] = 0
        out += binc[o:o + bv['byteLength']]
        bvmap[i] = len(nBV); nBV.append(nb)
    for i, acc in enumerate(A):
        if i not in used: continue
        if i in new_data:
            while len(out) % 4: out.append(0)
            data = new_data[i].astype(np.float32).tobytes()
            nBV.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)})
            out += data
            acc['bufferView'] = len(nBV) - 1; acc.pop('byteOffset', None)
        elif 'bufferView' in acc:
            acc['bufferView'] = bvmap[acc['bufferView']]
    for im in j.get('images', []):
        if 'bufferView' in im: im['bufferView'] = bvmap[im['bufferView']]
    def remap(o):
        if isinstance(o, dict):
            for k, v in list(o.items()):
                if k in ('accessor', 'indices', 'input', 'output', 'inverseBindMatrices') and isinstance(v, int): o[k] = amap[v]
                elif k == 'attributes' and isinstance(v, dict): o[k] = {kk: amap[vv] for kk, vv in v.items()}
                elif k == 'targets' and isinstance(v, list): o[k] = [{kk: amap[vv] for kk, vv in tg.items()} for tg in v]
                else: remap(v)
        elif isinstance(o, list):
            for x in o: remap(x)
    for k in list(j.keys()):
        if k not in ('accessors', 'bufferViews', 'buffers'): remap(j[k])
    j['accessors'] = nA; j['bufferViews'] = nBV
    j['buffers'] = [{'byteLength': len(out)}]
    save(a.dst, j, bytes(out))
    import os
    print(f'khoá animation: {tin} → {tout}  ({100 * tout / max(tin, 1):.1f}%)   file: {os.path.getsize(a.src) // 1024} KB → {os.path.getsize(a.dst) // 1024} KB')


main()
