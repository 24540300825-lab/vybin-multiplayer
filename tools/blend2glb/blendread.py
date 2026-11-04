# Bộ đọc file .blend tối giản (không cần Blender): SDNA + khối dữ liệu + struct theo tên trường.
import struct, re, numpy as np

class Blend:
    def __init__(self, path):
        self.f = open(path, 'rb'); self.data = self.f.read()
        h = self.data[:12]; assert h[:7] == b'BLENDER', h
        self.ptr = 8 if h[7:8] == b'-' else 4; self.le = h[8:9] == b'v'
        assert self.ptr == 8 and self.le
        self.blocks = []; self.by_ptr = {}
        off = 12
        while True:
            code = self.data[off:off+4]
            size, old, sdna, cnt = struct.unpack_from('<iQii', self.data, off + 4)
            boff = off + 24
            if code == b'ENDB': break
            blk = (code, size, old, sdna, cnt, boff)
            self.blocks.append(blk)
            if old: self.by_ptr[old] = blk
            if code == b'DNA1': self._dna(boff, size)
            off = boff + size

    def _dna(self, off, size):
        d = self.data; p = off
        assert d[p:p+4] == b'SDNA'; p += 4
        def rd_names(tag):
            nonlocal p
            assert d[p:p+4] == tag, (d[p:p+4], tag); p += 4
            n = struct.unpack_from('<i', d, p)[0]; p += 4
            out = []
            for _ in range(n):
                e = d.index(b'\0', p); out.append(d[p:e].decode('latin1')); p = e + 1
            p = (p + 3) & ~3
            return out
        self.names = rd_names(b'NAME'); self.types = rd_names(b'TYPE')
        assert d[p:p+4] == b'TLEN'; p += 4
        self.tlen = list(struct.unpack_from('<%dh' % len(self.types), d, p)); p += 2 * len(self.types); p = (p + 3) & ~3
        assert d[p:p+4] == b'STRC'; p += 4
        n = struct.unpack_from('<i', d, p)[0]; p += 4
        self.structs = []; self.sidx = {}
        for i in range(n):
            t, nf = struct.unpack_from('<hh', d, p); p += 4
            fields = []; o = 0
            for _ in range(nf):
                ft, fn = struct.unpack_from('<hh', d, p); p += 4
                name = self.names[fn]; tname = self.types[ft]
                is_ptr = name.startswith('*') or name.startswith('(*')
                arr = 1
                for m in re.findall(r'\[(\d+)\]', name): arr *= int(m)
                sz = (self.ptr if is_ptr else self.tlen[ft]) * arr
                clean = re.sub(r'\[.*', '', name).lstrip('*').replace('(*', '').replace(')()', '').replace(')', '')
                fields.append((clean, tname, is_ptr, arr, o, sz, name)); o += sz
            self.structs.append((self.types[t], fields, self.tlen[t]))
            self.sidx[self.types[t]] = i

    def sname(self, blk): return self.structs[blk[3]][0]
    def fields(self, sname): return {f[0]: f for f in self.structs[self.sidx[sname]][1]}

    def get(self, sname, base, field):
        F = self.fields(sname)[field]; _, tname, is_ptr, arr, o, sz, raw = F
        a = base + o; d = self.data
        if is_ptr:
            if arr == 1: return struct.unpack_from('<Q', d, a)[0]
            return list(struct.unpack_from('<%dQ' % arr, d, a))
        fmt = {'int': 'i', 'short': 'h', 'char': 'b', 'float': 'f', 'double': 'd', 'uchar': 'B', 'ushort': 'H', 'int64_t': 'q', 'uint64_t': 'Q', 'int8_t': 'b', 'uint8_t': 'B', 'uint': 'I', 'int32_t': 'i', 'uint32_t': 'I', 'int16_t': 'h'}.get(tname)
        if tname == 'char' and arr > 1: return d[a:a+arr].split(b'\0')[0].decode('utf8', 'replace')
        if fmt:
            v = struct.unpack_from('<%d%s' % (arr, fmt), d, a)
            return v[0] if arr == 1 else list(v)
        return a   # struct lồng: trả về địa chỉ để đọc tiếp

    def sub(self, sname, base, field):   # (tên struct con, địa chỉ)
        F = self.fields(sname)[field]; return F[1], base + F[4]

    def block(self, ptr): return self.by_ptr.get(ptr)
    def blocks_of(self, code): return [b for b in self.blocks if b[0][:2] == code or b[0] == code]
    def raw(self, ptr):
        b = self.by_ptr.get(ptr)
        return None if not b else self.data[b[5]:b[5] + b[1]]
