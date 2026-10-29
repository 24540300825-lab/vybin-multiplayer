#!/usr/bin/env python3
"""Sinh src/manifest.js từ thư mục assets/ (kích thước + hash để cache-bust).
Chạy lại mỗi khi thay/ thêm file trong assets/:   python3 tools/build_manifest.py"""
import os, hashlib, json
root = os.path.join(os.path.dirname(__file__), '..')
ad = os.path.join(root, 'assets')
m = {}
for f in sorted(os.listdir(ad)):
    p = os.path.join(ad, f)
    if not os.path.isfile(p): continue
    h = hashlib.md5(open(p, 'rb').read()).hexdigest()[:8]
    m[os.path.splitext(f)[0]] = {'file': f, 'v': h, 'size': os.path.getsize(p)}
open(os.path.join(root, 'src', 'manifest.js'), 'w').write(
    '// TỰ SINH bởi tools/build_manifest.py — đừng sửa tay\nexport const FILES = ' + json.dumps(m, indent=1) + ';\n')
print(json.dumps(m, indent=1))
