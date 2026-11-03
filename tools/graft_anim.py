#!/usr/bin/env python3
"""Ghép clip animation (chỉ kênh rotation) từ file khác vào GLB đích theo TÊN node, tự đổi tâm xoay:
nếu node đích có gốc toạ độ khác node nguồn (vd. cánh cửa: nguồn đặt gốc ở bản lề, đích đặt ở giữa) → sinh thêm kênh translation để cánh cửa vẫn xoay quanh bản lề.
Dùng: python3 tools/graft_anim.py src.glb dst.glb 'regex tên clip' [--map nguồn=đích ...]"""
import sys, re, argparse, numpy as np, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from optimize_anim import load, save, read_acc

def qrot(q, v):
    x, y, z, w = q; u = np.array([x, y, z]); return v + 2 * np.cross(u, np.cross(u, v) + w * v)

ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('clips'); ap.add_argument('--map', action='append', default=[])
a = ap.parse_args(); MP = dict(m.split('=', 1) for m in a.map)
js, bs = load(a.src); jd, bd = load(a.dst)
nd = {n.get('name'): i for i, n in enumerate(jd['nodes'])}; out = bytearray(bd); jd.setdefault('animations', [])
def add(arr, typ, mm=False):
    global out
    while len(out) % 4: out.append(0)
    b = np.ascontiguousarray(arr, np.float32).tobytes(); jd['bufferViews'].append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(b)}); out += b
    acc = {'bufferView': len(jd['bufferViews']) - 1, 'componentType': 5126, 'count': len(arr), 'type': typ}
    if mm: acc['min'] = [float(np.min(arr))]; acc['max'] = [float(np.max(arr))]
    jd['accessors'].append(acc); return len(jd['accessors']) - 1
for an in js['animations']:
    if not re.search(a.clips, an['name']): continue
    ch, sm = [], []
    for c in an['channels']:
        if c['target'].get('path') != 'rotation': continue
        sn = js['nodes'][c['target']['node']]; nm = MP.get(sn['name'], sn['name'])
        if nm not in nd: print('  thiếu node', nm); continue
        dn = jd['nodes'][nd[nm]]; s = an['samplers'][c['sampler']]
        t = read_acc(js, bs, s['input'])[:, 0]; q = read_acc(js, bs, s['output']).astype(np.float64)
        pf = np.array(sn.get('translation', [0, 0, 0])); ph = np.array(dn.get('translation', [0, 0, 0]))
        S = np.array(dn.get('scale', [1, 1, 1])); q0 = np.array(dn.get('rotation', [0, 0, 0, 1]), float)
        q0i = q0 * np.array([-1, -1, -1, 1]); cofs = qrot(q0i, ph - pf) / S
        ia = add(t, 'SCALAR', True)
        sm.append({'input': ia, 'output': add(q, 'VEC4'), 'interpolation': 'LINEAR'}); ch.append({'sampler': len(sm) - 1, 'target': {'node': nd[nm], 'path': 'rotation'}})
        if np.abs(ph - pf).max() > 1e-4:
            P = np.array([pf + qrot(qq, S * cofs) for qq in q])
            sm.append({'input': ia, 'output': add(P, 'VEC3'), 'interpolation': 'LINEAR'}); ch.append({'sampler': len(sm) - 1, 'target': {'node': nd[nm], 'path': 'translation'}})
    if ch: jd['animations'].append({'name': an['name'], 'channels': ch, 'samplers': sm}); print('  ghép', an['name'], len(ch), 'kênh')
jd['buffers'] = [{'byteLength': len(out)}]; save(a.dst, jd, bytes(out))
