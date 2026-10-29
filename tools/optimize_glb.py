#!/usr/bin/env python3
"""Giảm dung lượng GLB bằng cách nén lại texture lớn (không đụng mesh/animation).
Dùng: python3 tools/optimize_glb.py in.glb out.glb [--max 1024] [--min-bytes 250000] [--q 85]
- chỉ xử lý ảnh > min-bytes; ảnh RGB -> JPEG, ảnh có alpha giữ PNG (chỉ thu nhỏ)
- cần: pip install pillow
"""
import json, struct, io, sys, argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--max', type=int, default=1024)
ap.add_argument('--min-bytes', type=int, default=250000)
ap.add_argument('--q', type=int, default=85)
a = ap.parse_args()

d = open(a.src, 'rb').read()
assert d[:4] == b'glTF'
jl = struct.unpack('<I', d[12:16])[0]
j = json.loads(d[20:20 + jl])
off = 20 + jl
bl = struct.unpack('<I', d[off:off + 4])[0]
binc = d[off + 8:off + 8 + bl]

bvs = j['bufferViews']
repl = {}
for im in j.get('images', []):
    bi = im.get('bufferView')
    if bi is None: continue
    bv = bvs[bi]
    raw = binc[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
    if len(raw) < a.min_bytes: continue
    img = Image.open(io.BytesIO(raw))
    has_a = img.mode in ('RGBA', 'LA', 'P') and ('A' in img.getbands() or 'transparency' in img.info)
    w, h = img.size
    s = min(1.0, a.max / max(w, h))
    if s < 1: img = img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    out = io.BytesIO()
    if has_a:
        img.convert('RGBA').save(out, 'PNG', optimize=True); mime = 'image/png'
    else:
        img.convert('RGB').save(out, 'JPEG', quality=a.q, optimize=True, progressive=True); mime = 'image/jpeg'
    nb = out.getvalue()
    if len(nb) < len(raw):
        repl[bi] = nb; im['mimeType'] = mime
        print(f"  {im.get('name')}: {w}x{h} {len(raw)//1024}KB -> {img.size[0]}x{img.size[1]} {len(nb)//1024}KB")

new = bytearray()
for i, bv in enumerate(bvs):
    data = repl.get(i)
    if data is None:
        o = bv.get('byteOffset', 0); data = binc[o:o + bv['byteLength']]
    while len(new) % 4: new.append(0)
    bv['byteOffset'] = len(new); bv['byteLength'] = len(data)
    new += data
while len(new) % 4: new.append(0)
j['buffers'][0]['byteLength'] = len(new)
jb = json.dumps(j, separators=(',', ':')).encode()
jb += b' ' * ((4 - len(jb) % 4) % 4)
total = 12 + 8 + len(jb) + 8 + len(new)
out = b'glTF' + struct.pack('<II', 2, total) + struct.pack('<I', len(jb)) + b'JSON' + jb + struct.pack('<I', len(new)) + b'BIN\x00' + bytes(new)
open(a.dst, 'wb').write(out)
print(f"{a.src}: {len(d)//1024}KB -> {len(out)//1024}KB")
