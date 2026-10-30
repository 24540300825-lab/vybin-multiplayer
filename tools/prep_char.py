#!/usr/bin/env python3
"""Dọn file nhân vật xuất từ Blender trước khi tối ưu: bỏ clip rác tên '_' và node trống 'SleepingArea' ở gốc cảnh.
Dùng: python3 tools/prep_char.py in.glb out.glb   (sau đó chạy optimize_glb.py rồi build_manifest.py)"""
import json, struct, sys
src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read(); assert d[:4] == b'glTF'
jl = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + jl]); rest = d[20 + jl:]
drop = {'_'}
before = len(j.get('animations', []))
j['animations'] = [a for a in j.get('animations', []) if a.get('name') not in drop]
names = {i: n.get('name') for i, n in enumerate(j['nodes'])}
for sc in j['scenes']:
    sc['nodes'] = [i for i in sc['nodes'] if not (names[i] == 'SleepingArea' and 'mesh' not in j['nodes'][i] and not j['nodes'][i].get('children'))]
jb = json.dumps(j, separators=(',', ':')).encode(); jb += b' ' * ((4 - len(jb) % 4) % 4)
out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(jb) + len(rest)) + struct.pack('<I', len(jb)) + b'JSON' + jb + rest
open(dst, 'wb').write(out)
print('animations', before, '->', len(j['animations']), '| bytes', len(d), '->', len(out))
