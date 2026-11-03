#!/usr/bin/env python3
"""Bỏ custom properties rác của addon Blender (scatter5, als, autocam, toon_vfx, blenderkit, Anim_Layers, arp_*…) khỏi GLB.
GIỮ mọi khoá 'lazyrig*' (rig miệng/mắt LazyRig cần) và các khoá game có dùng. Dùng: python3 tools/strip_extras.py in.glb out.glb"""
import json, struct, sys
JUNK = ('scatter5', 'als', 'autocam', 'toon_vfx', 'pf', 'blenderkit', 'asset_data', 'Anim_Layers', 'arp_', 'auto_lips', 'lips_', 'eyebrows', 'eyelid', 'skull', 'facial', 'eye_', 'eyes_')
src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read(); assert d[:4] == b'glTF'
jl = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + jl]); rest = d[20 + jl:]
n0 = jl
def clean(o):
    ex = o.get('extras')
    if not isinstance(ex, dict): return
    for k in list(ex):
        if not k.startswith('lazyrig') and (k.startswith(JUNK) or k in JUNK): del ex[k]
    if not ex: o.pop('extras')
for key in ('nodes', 'materials', 'meshes', 'scenes', 'textures', 'images', 'animations'):
    for o in j.get(key, []): clean(o)
clean(j)
jb = json.dumps(j, separators=(',', ':')).encode(); jb += b' ' * ((4 - len(jb) % 4) % 4)
open(dst, 'wb').write(b'glTF' + struct.pack('<II', 2, 12 + 8 + len(jb) + len(rest)) + struct.pack('<I', len(jb)) + b'JSON' + jb + rest)
print(f'JSON {n0 // 1024} KB -> {len(jb) // 1024} KB')
