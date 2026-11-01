#!/usr/bin/env python3
"""Lưu NORMAL của mesh dạng int8 chuẩn hoá (KHR_mesh_quantization) thay cho float32 → phần normal nhỏ còn 1/3.
Dùng: python3 tools/quantize_normals.py in.glb out.glb
• chỉ đụng thuộc tính NORMAL của primitive (không đụng morph target, vị trí, UV) — toạ độ/scale node giữ nguyên
• glTF bắt buộc mỗi phần tử thuộc tính căn 4 byte → ghi (x,y,z,0) với byteStride 4
• src/assets.js đổi lại thành Float32 ngay sau khi parse, nên mọi code (merge, raycast, shader) thấy như cũ
"""
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from optimize_anim import load, save, read_acc


def main():
    src, dst = sys.argv[1], sys.argv[2]
    j, binc = load(src)
    A, BV = j['accessors'], j['bufferViews']
    out = bytearray(binc); done = {}
    for m in j['meshes']:
        for p in m['primitives']:
            ai = p['attributes'].get('NORMAL')
            if ai is None: continue
            if ai in done: p['attributes']['NORMAL'] = done[ai]; continue
            a = A[ai]
            if a.get('componentType') != 5126 or a.get('sparse') or 'bufferView' not in a: continue
            v = read_acc(j, binc, ai).astype(np.float64)
            v /= np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)
            q = np.zeros((len(v), 4), np.int8); q[:, :3] = np.round(np.clip(v, -1, 1) * 127)
            while len(out) % 4: out.append(0)
            BV.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': q.nbytes, 'byteStride': 4, 'target': 34962})
            out += q.tobytes()
            A.append({'bufferView': len(BV) - 1, 'componentType': 5120, 'normalized': True, 'count': a['count'], 'type': 'VEC3'})
            done[ai] = len(A) - 1; p['attributes']['NORMAL'] = done[ai]
    for k in ('extensionsUsed', 'extensionsRequired'):
        j.setdefault(k, [])
        if 'KHR_mesh_quantization' not in j[k]: j[k].append('KHR_mesh_quantization')
    j['buffers'] = [{'byteLength': len(out)}]
    save(dst, j, bytes(out))
    # dọn accessor/bufferView float cũ không còn dùng: chạy qua optimize_anim (đóng gói lại, giữ nguyên animation nếu không giảm được)
    print(len(done), 'normal accessor →', 'int8')


if __name__ == '__main__':
    main()
