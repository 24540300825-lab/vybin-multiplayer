#!/usr/bin/env python3
"""Cắt GLB: chỉ giữ một phần cảnh (theo tên gốc hoặc theo hộp toạ độ), đổi tên node, rồi đóng gói lại gọn.
Dùng:
  python3 tools/prune_glb.py in.glb out.glb --keep VY_STUDIO                 # chỉ giữ cây con VY_STUDIO
  python3 tools/prune_glb.py in.glb out.glb --box -0.6,10.6,-8.6,0.6 --maxext 12   # giữ node gốc có tâm nằm trong hộp x0,x1,z0,z1
  --rename '^GD_=' --rename '^Chair$=Desk_Chair'   (regex=thay thế, áp cho mọi node; đổi tên giữ được animation vì kênh trỏ theo chỉ số node)
Những gì bị cắt: node + mesh + material + texture/ảnh + accessor/bufferView không còn dùng; kênh animation trỏ vào node đã bỏ; clip rỗng.
"""
import json, struct, sys, os, re, argparse
import numpy as np


def load(p):
    d = open(p, 'rb').read(); assert d[:4] == b'glTF'
    jl = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + jl]); off = 20 + jl
    bl = struct.unpack('<I', d[off:off + 4])[0]
    return j, d[off + 8:off + 8 + bl]


def save(p, j, b):
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    b += b'\0' * ((4 - len(b) % 4) % 4)
    open(p, 'wb').write(b'glTF' + struct.pack('<II', 2, 28 + len(js) + len(b)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(b)) + b'BIN\0' + b)


def q2m(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def mat(n):
    if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
    M = np.eye(4); M[:3, :3] = q2m(n.get('rotation', [0, 0, 0, 1])) * np.array(n.get('scale', [1, 1, 1])); M[:3, 3] = n.get('translation', [0, 0, 0]); return M


def subtree_box(j, i, M=np.eye(4)):
    N, A = j['nodes'], j['accessors']; lo = np.full(3, 1e9); hi = np.full(3, -1e9)
    def walk(k, P):
        nonlocal lo, hi
        n = N[k]; W = P @ mat(n)
        if 'mesh' in n:
            for p in j['meshes'][n['mesh']]['primitives']:
                a = A[p['attributes']['POSITION']]; mn, mx = np.array(a['min']), np.array(a['max'])
                c = np.array([[x, y, z, 1] for x in (mn[0], mx[0]) for y in (mn[1], mx[1]) for z in (mn[2], mx[2])]) @ W.T
                lo = np.minimum(lo, c[:, :3].min(0)); hi = np.maximum(hi, c[:, :3].max(0))
        for c in n.get('children', []): walk(c, W)
    walk(i, M)
    return lo, hi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--keep', action='append', default=[])
    ap.add_argument('--box'); ap.add_argument('--maxext', type=float, default=1e9)
    ap.add_argument('--rename', action='append', default=[])
    a = ap.parse_args()
    j, binc = load(a.src); N = j['nodes']
    roots = j['scenes'][j.get('scene', 0)]['nodes']
    if a.keep:
        keep_roots = [i for i in roots if N[i].get('name') in a.keep]
        missing = set(a.keep) - {N[i].get('name') for i in keep_roots}
        assert not missing, f'không thấy node gốc: {missing}'
    else:
        x0, x1, z0, z1 = map(float, a.box.split(','))
        keep_roots = []
        for i in roots:
            lo, hi = subtree_box(j, i)
            if lo[0] > 1e8: keep_roots.append(i); continue        # node rỗng (anchor, camera target): giữ
            c = (lo + hi) / 2
            if x0 < c[0] < x1 and z0 < c[2] < z1 and (hi - lo).max() <= a.maxext: keep_roots.append(i)
    # ---- node giữ lại ----
    keepN = set(); st = list(keep_roots)
    while st:
        i = st.pop(); keepN.add(i); st += N[i].get('children', [])
    nmap = {o: k for k, o in enumerate(sorted(keepN))}
    ren = [(re.compile(r.split('=', 1)[0]), r.split('=', 1)[1]) for r in a.rename]
    newN = []
    for o in sorted(keepN):
        n = dict(N[o])
        if 'children' in n: n['children'] = [nmap[c] for c in n['children'] if c in nmap]
        nm = n.get('name', '')
        for rx, rp in ren: nm = rx.sub(rp, nm)
        if nm: n['name'] = nm
        newN.append(n)
    # ---- mesh / skin / camera ----
    def compact(key, used_old):
        lst = j.get(key, []); m = {o: k for k, o in enumerate(sorted(used_old))}
        j[key] = [lst[o] for o in sorted(used_old)]
        return m
    mm = compact('meshes', {n['mesh'] for n in newN if 'mesh' in n})
    sm = compact('skins', {n['skin'] for n in newN if 'skin' in n}) if j.get('skins') else {}
    for n in newN:
        if 'mesh' in n: n['mesh'] = mm[n['mesh']]
        if 'skin' in n: n['skin'] = sm[n['skin']]
    for s in j.get('skins', []):
        s['joints'] = [nmap[x] for x in s['joints'] if x in nmap]
        if 'skeleton' in s: s['skeleton'] = nmap.get(s['skeleton'], s['joints'][0])
    j['nodes'] = newN
    j['scenes'] = [{'name': j['scenes'][0].get('name', 'Scene'), 'nodes': [nmap[i] for i in keep_roots]}]; j['scene'] = 0
    # ---- animation ----
    anims = []
    for an in j.get('animations', []):
        chs = [c for c in an['channels'] if c['target'].get('node') in nmap]
        if not chs: continue
        used_s = sorted({c['sampler'] for c in chs}); smap = {o: k for k, o in enumerate(used_s)}
        for c in chs: c['target']['node'] = nmap[c['target']['node']]; c['sampler'] = smap[c['sampler']]
        anims.append({**an, 'channels': chs, 'samplers': [an['samplers'][o] for o in used_s]})
    j['animations'] = anims
    if not anims: j.pop('animations')
    # ---- material / texture / image / sampler ----
    used_m = set()
    for me in j['meshes']:
        for p in me['primitives']:
            if 'material' in p: used_m.add(p['material'])
    matm = compact('materials', used_m)
    for me in j['meshes']:
        for p in me['primitives']:
            if 'material' in p: p['material'] = matm[p['material']]
    used_t = set()
    def find_tex(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == 'index' and isinstance(v, int) and 'texCoord' in o or (k == 'index' and isinstance(v, int)): used_t.add(v)
                else: find_tex(v)
        elif isinstance(o, list):
            for x in o: find_tex(x)
    find_tex(j.get('materials', []))
    if j.get('textures'):
        tm = compact('textures', used_t)
        def remap_tex(o):
            if isinstance(o, dict):
                for k, v in list(o.items()):
                    if k == 'index' and isinstance(v, int): o[k] = tm[v]
                    else: remap_tex(v)
            elif isinstance(o, list):
                for x in o: remap_tex(x)
        remap_tex(j['materials'])
        im = compact('images', {t['source'] for t in j['textures'] if 'source' in t})
        sa = compact('samplers', {t['sampler'] for t in j['textures'] if 'sampler' in t}) if j.get('samplers') else {}
        for t in j['textures']:
            if 'source' in t: t['source'] = im[t['source']]
            if 'sampler' in t: t['sampler'] = sa[t['sampler']]
    else:
        j.pop('images', None); j.pop('samplers', None)
    # ---- accessor / bufferView ----
    used_a = set()
    def acc_refs(o, f):
        if isinstance(o, dict):
            for k, v in list(o.items()):
                if k in ('indices', 'input', 'output', 'inverseBindMatrices') and isinstance(v, int): o[k] = f(v)
                elif k in ('attributes',) and isinstance(v, dict): o[k] = {kk: f(vv) for kk, vv in v.items()}
                elif k == 'targets' and isinstance(v, list): o[k] = [{kk: f(vv) for kk, vv in t.items()} for t in v]
                else: acc_refs(v, f)
        elif isinstance(o, list):
            for x in o: acc_refs(x, f)
    secs = [j[k] for k in ('meshes', 'animations', 'skins', 'nodes') if k in j]
    acc_refs(secs, lambda v: (used_a.add(v), v)[1])
    am = compact('accessors', used_a)
    acc_refs(secs, lambda v: am[v])
    used_bv = set()
    for acc in j['accessors']:
        if 'bufferView' in acc: used_bv.add(acc['bufferView'])
        if 'sparse' in acc: used_bv.update((acc['sparse']['indices']['bufferView'], acc['sparse']['values']['bufferView']))
    for img in j.get('images', []):
        if 'bufferView' in img: used_bv.add(img['bufferView'])
    out = bytearray(); bvm = {}; nb = []
    for o in sorted(used_bv):
        bv = dict(j['bufferViews'][o]); s = bv.get('byteOffset', 0)
        while len(out) % 4: out.append(0)
        bv['byteOffset'] = len(out); bv['buffer'] = 0; out += binc[s:s + bv['byteLength']]
        bvm[o] = len(nb); nb.append(bv)
    for acc in j['accessors']:
        if 'bufferView' in acc: acc['bufferView'] = bvm[acc['bufferView']]
        if 'sparse' in acc:
            for k in ('indices', 'values'): acc['sparse'][k]['bufferView'] = bvm[acc['sparse'][k]['bufferView']]
    for img in j.get('images', []):
        if 'bufferView' in img: img['bufferView'] = bvm[img['bufferView']]
    j['bufferViews'] = nb; j['buffers'] = [{'byteLength': len(out)}]
    save(a.dst, j, bytes(out))
    print(f'giữ {len(keep_roots)}/{len(roots)} node gốc, {len(newN)} node, {len(j["meshes"])} mesh, {len(j.get("animations", []))} clip  |  {os.path.getsize(a.src) // 1024} KB → {os.path.getsize(a.dst) // 1024} KB')


if __name__ == '__main__':
    main()
