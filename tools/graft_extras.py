#!/usr/bin/env python3
"""Chép custom properties LazyRig (khoá 'lazyrig*') từ bản GLB cũ sang bản mới khi bản mới lỡ xuất thiếu "Include > Custom Properties".
Khớp theo tên node / tên vật liệu. Dùng: python3 tools/graft_extras.py cu.glb moi.glb out.glb"""
import json, struct, sys, re
def load(p):
    d = open(p, 'rb').read(); jl = struct.unpack('<I', d[12:16])[0]; return json.loads(d[20:20 + jl]), d[20 + jl:]
src, _ = load(sys.argv[1]); dst, rest = load(sys.argv[2])
base = lambda n: re.sub(r'\.\d{3}$', '', n or '')
n = 0
for key in ('nodes', 'materials'):
    S = {base(o.get('name')): o for o in src.get(key, []) if any(k.startswith('lazyrig') for k in (o.get('extras') or {}))}
    for o in dst.get(key, []):
        s = S.get(base(o.get('name')))
        if not s: continue
        ex = o.setdefault('extras', {})
        for k, v in s['extras'].items():
            if k.startswith('lazyrig') and k not in ex: ex[k] = v; n += 1
jb = json.dumps(dst, separators=(',', ':')).encode(); jb += b' ' * ((4 - len(jb) % 4) % 4)
open(sys.argv[3], 'wb').write(b'glTF' + struct.pack('<II', 2, 12 + 8 + len(jb) + len(rest)) + struct.pack('<I', len(jb)) + b'JSON' + jb + rest)
print('đã chép', n, 'khoá lazyrig')
