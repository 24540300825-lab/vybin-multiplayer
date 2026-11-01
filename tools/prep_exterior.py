#!/usr/bin/env python3
"""Chuẩn bị GLB map ngoài vườn (EXTERIOR.glb) để game nạp được.
Dùng: python3 tools/prep_exterior.py EXTERIOR.glb assets/map-exterior.glb [--max 1024]
Việc làm:
 1) Sửa clip ACT_OPEN_CLOSE__Gate_Leaf_L/R: kênh animation trỏ tới chỉ số node không tồn tại (11220/11221) → GLTFLoader báo lỗi.
    Gắn lại theo TÊN node (Gate_Leaf_L / Gate_Leaf_R).
 2) Bỏ clip mồ côi 'Flora_048_L_AniAction' (cũng trỏ node không tồn tại, không dùng).
 3) (tuỳ chọn) nén lại texture lớn bằng tools/optimize_glb.py.
Không đụng mesh / material / instancing → mọi thứ còn lại giữ nguyên như file gốc.
"""
import json, struct, sys, subprocess, os, tempfile

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
    binc = binc + b'\0' * ((4 - len(binc) % 4) % 4)
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(binc))
    out += struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(binc)) + b'BIN\0' + binc
    open(p, 'wb').write(out)

def main():
    src, dst = sys.argv[1], sys.argv[2]
    mx = '1024'
    if '--max' in sys.argv: mx = sys.argv[sys.argv.index('--max') + 1]
    j, binc = load(src)
    N = j['nodes']
    byname = {n.get('name'): i for i, n in enumerate(N)}
    keep = []
    for a in j.get('animations', []):
        ok = True
        for c in a['channels']:
            t = c['target']
            if t.get('node', 0) >= len(N):
                nm = a['name'].replace('ACT_OPEN_CLOSE__', '')
                if nm in byname:
                    t['node'] = byname[nm]
                else:
                    ok = False
        if ok: keep.append(a)
        else: print('bỏ clip mồ côi:', a['name'])
    j['animations'] = keep
    print('clip giữ lại:', [a['name'] for a in keep])
    tmp = tempfile.mktemp(suffix='.glb')
    save(tmp, j, binc)
    here = os.path.dirname(os.path.abspath(__file__))
    subprocess.check_call([sys.executable, os.path.join(here, 'optimize_glb.py'), tmp, dst, '--max', mx])
    os.unlink(tmp)
    print('→', dst, os.path.getsize(dst) // 1024, 'KB')

main()
