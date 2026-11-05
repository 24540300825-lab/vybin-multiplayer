#!/usr/bin/env python3
"""Ghi AO đã bake (tools/bake/char_ao.cjs → JSON) vào GLB nhân vật dưới dạng COLOR_0 (RGBA8 chuẩn hoá). three.js tự bật vertexColors → màu đỉnh nhân vào albedo.
Dùng: python3 tools/bake_char_ao.py in.glb ao.json out.glb [--strength 0.7] [--gamma 1.0]   (xong chạy build_manifest.py)
Ghép theo (số đỉnh, toạ độ đỉnh đầu/cuối). Bỏ qua: mắt, miệng (decal), lòng trắng, vật ẩn / đạo cụ (bắp rang…). Chạy lại được: COLOR_0 cũ bị thay."""
import json, struct, sys, argparse
import numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('ao'); ap.add_argument('dst')
ap.add_argument('--strength', type=float, default=0.7, help='độ tối tối đa (AO=0 → 1-strength)')
ap.add_argument('--gamma', type=float, default=1.0, help='>1 = chỉ tối ở khe sâu, <1 = tối rộng hơn')
ap.add_argument('--floor', type=float, default=0.0, help='AO ≤ floor coi như 0')
a = ap.parse_args()
SKIP_MAT = ('EYE', 'EYE_WHITE', 'LazyRig_MouthDecal')
SKIP_NAME = ('Object_3', 'cs_user', 'LazyRig_MouthDecal', 'Sphere00', 'MISC_GEO_Plane')
d = open(a.src, 'rb').read(); assert d[:4] == b'glTF'
jl = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + jl])
bl = struct.unpack('<I', d[20 + jl:24 + jl])[0]; binc = bytearray(d[28 + jl:28 + jl + bl])
ao = json.load(open(a.ao))
def acc(i):
    ac = j['accessors'][i]; bv = j['bufferViews'][ac['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[ac['type']]
    assert ac['componentType'] == 5126, 'POSITION phải float32'
    st = bv.get('byteStride', n * 4); off = bv.get('byteOffset', 0) + ac.get('byteOffset', 0)
    arr = np.ndarray((ac['count'], n), np.float32, bytes(binc), off, (st, 4)); return arr
used = set(); done = 0; skipped = []
for mi, m in enumerate(j['meshes']):
    for pi, p in enumerate(m['primitives']):
        P = acc(p['attributes']['POSITION']); n = len(P)
        cand = None
        for k, e in enumerate(ao):
            if k in used or e['n'] != n: continue
            if np.allclose(P[0], e['p0'], atol=1e-4) and np.allclose(P[-1], e['pN'], atol=1e-4): cand = k; break
        if cand is None: continue
        used.add(cand); e = ao[cand]
        matn = j['materials'][p['material']].get('name', '') if 'material' in p else ''
        if e['hid'] or matn in SKIP_MAT or any(e['name'].startswith(s) for s in SKIP_NAME):
            skipped.append(e['name']); p['attributes'].pop('COLOR_0', None); continue
        v = np.clip(np.array(e['ao'], np.float32), 0, 1)
        v = np.clip((v - a.floor) / max(1e-6, 1 - a.floor), 0, 1) ** a.gamma
        c = 1 - a.strength * (1 - v)
        rgba = np.empty((n, 4), np.uint8); rgba[:, :3] = np.round(c * 255).astype(np.uint8)[:, None]; rgba[:, 3] = 255
        while len(binc) % 4: binc.append(0)
        off = len(binc); binc += rgba.tobytes()
        j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': n * 4, 'target': 34962})
        j['accessors'].append({'bufferView': len(j['bufferViews']) - 1, 'componentType': 5121, 'normalized': True, 'count': n, 'type': 'VEC4'})
        p['attributes']['COLOR_0'] = len(j['accessors']) - 1; done += 1
while len(binc) % 4: binc.append(0)
j['buffers'][0]['byteLength'] = len(binc)
jb = json.dumps(j, separators=(',', ':')).encode()
while len(jb) % 4: jb += b' '
out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(jb) + 8 + len(binc)) + struct.pack('<I', len(jb)) + b'JSON' + jb + struct.pack('<I', len(binc)) + b'BIN\0' + bytes(binc)
open(a.dst, 'wb').write(out)
print('COLOR_0 cho %d primitive; bỏ qua %s; file %d KB' % (done, sorted(set(skipped)), len(out) // 1024))
