# xb.py — tiny procedural mesh kit + GLB writer (no Blender needed).
# Author everything in WORLD Z-UP metres (X right, Y back, Z up) like the house builder scripts;
# the writer converts to glTF Y-up (x, z, -y) and an optional room-local offset.
import json, struct, math
import numpy as np
from scipy.spatial import ConvexHull

def srgb2lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def hexrgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)

class Mat:
    def __init__(self, name, color, rough=0.9, metal=0.0, emis=None, emis_k=1.0, alpha=None, double=False):
        self.name, self.color, self.rough, self.metal = name, color, rough, metal
        self.emis, self.emis_k, self.alpha, self.double = emis, emis_k, alpha, double
    def gltf(self):
        c = list(srgb2lin(hexrgb(self.color))) + [1.0 if self.alpha is None else self.alpha]
        m = {'name': self.name, 'pbrMetallicRoughness': {'baseColorFactor': [float(x) for x in c], 'roughnessFactor': self.rough, 'metallicFactor': self.metal}}
        if self.emis:
            e = srgb2lin(hexrgb(self.emis)); k = self.emis_k
            if k > 1:
                m['emissiveFactor'] = [float(x) for x in e]; m.setdefault('extensions', {})['KHR_materials_emissive_strength'] = {'emissiveStrength': k}
            else:
                m['emissiveFactor'] = [float(x * k) for x in e]
        if self.alpha is not None: m['alphaMode'] = 'BLEND'
        if self.double: m['doubleSided'] = True
        return m

# ---------------------------------------------------------------- geometry buffers
class Geo:
    """Geometry grouped by material name. Vertices in world Z-up."""
    def __init__(self): self.parts = {}
    def _p(self, mat):
        if mat not in self.parts: self.parts[mat] = [[], [], []]   # P, N, I (lists of arrays)
        return self.parts[mat]
    def add(self, mat, P, N, I):
        p = self._p(mat); base = sum(len(a) for a in p[0])
        p[0].append(np.asarray(P, float)); p[1].append(np.asarray(N, float)); p[2].append(np.asarray(I, np.int64) + base)
    def merge(self, other):
        for m, (Ps, Ns, Is) in other.parts.items():
            base = 0
            for P, N, I in zip(Ps, Ns, Is):
                self.add(m, P, N, I - base); base += len(P)
        return self
    def transformed(self, M):
        g = Geo(); R = M[:3, :3]
        nm = np.linalg.inv(R).T
        for m, (Ps, Ns, Is) in self.parts.items():
            base = 0
            for P, N, I in zip(Ps, Ns, Is):
                P2 = P @ R.T + M[:3, 3]; N2 = N @ nm.T; N2 /= np.linalg.norm(N2, axis=1, keepdims=True) + 1e-12
                if np.linalg.det(R) < 0: I = I.reshape(-1, 3)[:, ::-1].reshape(-1)
                g.add(m, P2, N2, I - base); base += len(P)
        return g
    def empty(self): return not self.parts
    def tri_count(self): return sum(sum(len(i) for i in p[2]) for p in self.parts.values()) // 3

    # --- flat polygon faces
    def face(self, mat, pts, flip=False):
        pts = np.asarray(pts, float)
        if flip: pts = pts[::-1]
        n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        for k in range(2, len(pts) - 1):   # robust normal for nearly degenerate first corner
            if np.linalg.norm(n) > 1e-9: break
            n = np.cross(pts[k] - pts[0], pts[k + 1] - pts[0])
        n = n / (np.linalg.norm(n) + 1e-12)
        I = [];
        for k in range(1, len(pts) - 1): I += [0, k, k + 1]
        self.add(mat, pts, np.repeat(n[None], len(pts), 0), I)

    def hull(self, mat, pts):
        """flat-shaded convex hull (stones, chamfered boxes)"""
        pts = np.asarray(pts, float); h = ConvexHull(pts); c = pts.mean(0)
        # merge coplanar triangles into polygons by equation
        eq = {}
        for s, e in zip(h.simplices, h.equations):
            key = tuple(np.round(e, 5)); eq.setdefault(key, []).append(s)
        for key, tris in eq.items():
            n = np.array(key[:3])
            idx = sorted(set(np.concatenate(tris)))
            P = pts[idx]; cc = P.mean(0)
            a = P[0] - cc; a /= np.linalg.norm(a) + 1e-12; b = np.cross(n, a)
            ang = np.arctan2((P - cc) @ b, (P - cc) @ a); P = P[np.argsort(ang)]
            if np.dot(np.cross(P[1] - P[0], P[2] - P[0]), n) < 0: P = P[::-1]
            I = []
            for k in range(1, len(P) - 1): I += [0, k, k + 1]
            self.add(mat, P, np.repeat(n[None], len(P), 0), I)

    def box(self, mat, lo, hi, faces='xyzXYZ'):
        """axis aligned box, faces = which sides (x=-x,X=+x ...)"""
        x0, y0, z0 = lo; x1, y1, z1 = hi
        F = {'x': [(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], 'X': [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)],
             'y': [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], 'Y': [(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)],
             'z': [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], 'Z': [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]}
        for f in faces: self.face(mat, F[f])

    def cbox(self, mat, lo, hi, b=0.02):
        """chamfered box (soft edges) via hull of 24 inset points"""
        lo = np.asarray(lo, float); hi = np.asarray(hi, float); b = min(b, *(0.45 * (hi - lo)))
        if b <= 1e-4: return self.box(mat, lo, hi)
        pts = []
        for sx in (0, 1):
            for sy in (0, 1):
                for sz in (0, 1):
                    c = np.array([hi[0] if sx else lo[0], hi[1] if sy else lo[1], hi[2] if sz else lo[2]])
                    d = np.array([-1 if sx else 1, -1 if sy else 1, -1 if sz else 1]) * b
                    for ax in range(3):
                        p = c + d; p[ax] = c[ax]; pts.append(p)
        self.hull(mat, pts)

    def obox(self, mat, center, size, R=None, b=0.0):
        """oriented box: R = 3x3 matrix whose columns are local axes"""
        g = Geo()
        h = np.asarray(size, float) / 2
        if b > 0: g.cbox(mat, -h, h, b)
        else: g.box(mat, -h, h)
        M = np.eye(4); M[:3, :3] = np.eye(3) if R is None else R; M[:3, 3] = center
        self.merge(g.transformed(M))

    def beam(self, mat, p0, p1, w, h, up=(0, 0, 1), b=0.015, ext=0.0):
        """box from p0 to p1, cross-section w (side) x h (up). b>0: only the 4 LONG edges are chamfered (octagonal section, 28 tris)"""
        p0 = np.asarray(p0, float); p1 = np.asarray(p1, float); a = p1 - p0; L = np.linalg.norm(a); a /= L
        u = np.asarray(up, float); s = np.cross(a, u)
        if np.linalg.norm(s) < 1e-6: s = np.cross(a, [1, 0, 0]) if abs(a[0]) < 0.9 else np.cross(a, [0, 1, 0])
        s /= np.linalg.norm(s); v = np.cross(s, a)
        R = np.stack([a, s, v], 1)
        b = min(b, 0.3 * w, 0.3 * h)
        if b <= 1e-4: return self.obox(mat, (p0 + p1) / 2, (L + 2 * ext, w, h), R)
        hl, hw, hh = L / 2 + ext, w / 2, h / 2
        sec = [(hw, hh - b), (hw - b, hh), (-hw + b, hh), (-hw, hh - b), (-hw, -hh + b), (-hw + b, -hh), (hw - b, -hh), (hw, -hh + b)]
        c = (p0 + p1) / 2
        pts = [c + R @ np.array([x, y, z]) for x in (-hl, hl) for (y, z) in sec]
        self.hull(mat, pts)

    # --- smooth primitives
    def lathe(self, mat, prof, center=(0, 0, 0), seg=16, axis=None, cap_top=True, cap_bot=True, rnoise=None):
        """profile = [(r, z)] bottom->top, revolved around +Z at center. rnoise(theta, z) -> factor"""
        prof = np.asarray(prof, float); n = len(prof); c = np.asarray(center, float)
        P = []; N = []
        th = np.linspace(0, 2 * np.pi, seg + 1)
        for i, (r, z) in enumerate(prof):
            for t in th:
                rr = r * (rnoise(t, z) if rnoise else 1.0)
                P.append(c + [rr * math.cos(t), rr * math.sin(t), z])
        P = np.array(P); W = seg + 1
        I = []
        for i in range(n - 1):
            for k in range(seg):
                a = i * W + k; b = a + 1; cc = a + W; d = cc + 1
                I += [a, b, d, a, d, cc]
        N = vertex_normals(P, I)
        # seam weld normals
        for i in range(n):
            avg = N[i * W] + N[i * W + seg]; avg /= np.linalg.norm(avg) + 1e-12; N[i * W] = N[i * W + seg] = avg
        self.add(mat, P, N, I)
        if cap_bot and prof[0][0] > 1e-4: self.face(mat, [c + [prof[0][0] * math.cos(t), prof[0][0] * math.sin(t), prof[0][1]] for t in th[:-1]][::-1])
        if cap_top and prof[-1][0] > 1e-4: self.face(mat, [c + [prof[-1][0] * math.cos(t), prof[-1][0] * math.sin(t), prof[-1][1]] for t in th[:-1]])

    def sphere(self, mat, c, r, seg=10, rings=7, scale=(1, 1, 1)):
        c = np.asarray(c, float); P = []; I = []
        for i in range(rings + 1):
            ph = math.pi * i / rings
            for k in range(seg + 1):
                t = 2 * math.pi * k / seg
                P.append([math.sin(ph) * math.cos(t), math.sin(ph) * math.sin(t), -math.cos(ph)])
        P = np.array(P); W = seg + 1
        for i in range(rings):
            for k in range(seg):
                a = i * W + k; I += [a, a + 1, a + W + 1, a, a + W + 1, a + W]
        N = P / np.asarray(scale, float); N /= np.linalg.norm(N, axis=1, keepdims=True)
        N = P.copy() / (np.asarray(scale, float) ** 2); N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
        self.add(mat, c + P * r * np.asarray(scale, float), N, I)

    def tube(self, mat, path, radius, seg=8, caps=True, flat=1.0, up=(0, 0, 1)):
        """sweep an ellipse (radius x radius*flat, flat along `up`) along polyline. radius: scalar or list"""
        path = np.asarray(path, float); n = len(path)
        rad = np.full(n, radius, float) if np.isscalar(radius) else np.asarray(radius, float)
        P = []
        upv = np.asarray(up, float)
        for i in range(n):
            t = path[min(i + 1, n - 1)] - path[max(i - 1, 0)]; t /= np.linalg.norm(t) + 1e-12
            s = np.cross(t, upv)
            if np.linalg.norm(s) < 1e-6: s = np.cross(t, [1, 0, 0])
            s /= np.linalg.norm(s); v = np.cross(s, t)
            for k in range(seg + 1):
                a = 2 * math.pi * k / seg
                P.append(path[i] + rad[i] * (math.cos(a) * s + math.sin(a) * v * flat))
        P = np.array(P); W = seg + 1; I = []
        for i in range(n - 1):
            for k in range(seg):
                a = i * W + k; I += [a, a + W, a + W + 1, a, a + W + 1, a + 1]
        N = vertex_normals(P, I)
        for i in range(n):
            avg = N[i * W] + N[i * W + seg]; avg /= np.linalg.norm(avg) + 1e-12; N[i * W] = N[i * W + seg] = avg
        self.add(mat, P, N, I)
        if caps:
            for end, sg in ((0, -1), (n - 1, 1)):
                ring = P[end * W:end * W + seg]
                # dome cap
                t = path[min(end + 1, n - 1)] - path[max(end - 1, 0)]; t /= np.linalg.norm(t) + 1e-12
                tip = path[end] + sg * t * rad[end] * 0.6
                Pc = np.vstack([ring, tip[None]]); Ic = []
                for k in range(seg):
                    Ic += ([k, (k + 1) % seg, seg] if sg > 0 else [(k + 1) % seg, k, seg])
                Nc = vertex_normals(Pc, Ic); self.add(mat, Pc, Nc, Ic)

    def torus(self, mat, c, R, r, seg=24, tseg=8, axis_R=None, rnoise=None):
        c = np.asarray(c, float); A = np.eye(3) if axis_R is None else axis_R
        P = []; I = []
        for i in range(seg + 1):
            u = 2 * math.pi * i / seg
            for k in range(tseg + 1):
                v = 2 * math.pi * k / tseg
                rr = r * (rnoise(u, v) if rnoise else 1)
                p = np.array([(R + rr * math.cos(v)) * math.cos(u), (R + rr * math.cos(v)) * math.sin(u), rr * math.sin(v)])
                P.append(c + A @ p)
        P = np.array(P); W = tseg + 1
        for i in range(seg):
            for k in range(tseg):
                a = i * W + k; I += [a, a + W, a + W + 1, a, a + W + 1, a + 1]
        N = vertex_normals(P, I)
        self.add(mat, P, N, I)

    def prism(self, mat, poly2, z0, z1, R=None, origin=(0, 0, 0)):
        """extrude convex/simple polygon (2D, CCW) in local XY from z0..z1, then rotate/translate"""
        poly = np.asarray(poly2, float); n = len(poly)
        g = Geo()
        tri = earclip(poly)
        bot = np.c_[poly, np.full(n, z0)]; top = np.c_[poly, np.full(n, z1)]
        g.add(mat, top, np.repeat([[0, 0, 1.0]], n, 0), tri)
        g.add(mat, bot, np.repeat([[0, 0, -1.0]], n, 0), [i for t in np.array(tri).reshape(-1, 3) for i in t[::-1]])
        for i in range(n):
            a, b = poly[i], poly[(i + 1) % n]
            g.face(mat, [(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)])
        M = np.eye(4); M[:3, :3] = np.eye(3) if R is None else R; M[:3, 3] = origin
        self.merge(g.transformed(M))

def vertex_normals(P, I):
    P = np.asarray(P, float); I = np.asarray(I).reshape(-1, 3)
    fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
    N = np.zeros_like(P)
    for k in range(3): np.add.at(N, I[:, k], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    return N

def earclip(poly):
    poly = [tuple(p) for p in poly]; n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    idx = list(range(n)) if area > 0 else list(range(n))[::-1]
    out = []
    def inside(p, a, b, c):
        def s(p1, p2, p3): return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
        d1, d2, d3 = s(p, a, b), s(p, b, c), s(p, c, a)
        return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-12: continue
            if any(inside(poly[j], a, b, c) for j in idx if j not in (i0, i1, i2)): continue
            out += [i0, i1, i2]; idx.pop(k); break
        else: break
    if len(idx) == 3: out += idx
    return out

def rotz(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])
def rotx(a):
    c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def roty(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def M4(R=None, t=(0, 0, 0)):
    M = np.eye(4); M[:3, :3] = np.eye(3) if R is None else R; M[:3, 3] = t; return M

# ---------------------------------------------------------------- scene graph + GLB writer
class Node:
    def __init__(self, name, geo=None, children=None, t=None, extras=None):
        self.name, self.geo, self.children, self.t, self.extras = name, geo, children or [], t, extras
    def add(self, *c): self.children += [x for x in c if x is not None]; return self

def write_glb(path, roots, mats, local=(0, 0, 0), origin_mode='center'):
    """local: (dx, dy, dz) added AFTER Z-up->Y-up conversion: gltf = (X + dx, Z + dy, -Y + dz).
    Mesh nodes get their translation = centre of their bbox (so pins / Box3 / sorting behave), vertices relative to it."""
    M = {m.name: m for m in mats}
    used = []; bufs = bytearray(); bviews = []; accs = []; meshes = []; nodes = []
    def add_view(data, target):
        nonlocal bufs
        while len(bufs) % 4: bufs += b'\0'
        off = len(bufs); bufs += data
        bviews.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': target}); return len(bviews) - 1
    def conv(P):  # z-up world -> gltf
        P = np.asarray(P, float); return np.c_[P[:, 0] + local[0], P[:, 2] + local[1], -P[:, 1] + local[2]]
    def convN(N):
        N = np.asarray(N, float); return np.c_[N[:, 0], N[:, 2], -N[:, 1]]
    def mk_mesh(geo, name):
        allP = np.vstack([np.vstack(p[0]) for p in geo.parts.values()]); allG = conv(allP)
        ctr = (allG.min(0) + allG.max(0)) / 2 if origin_mode == 'center' else np.zeros(3)
        prims = []
        for mname, (Ps, Ns, Is) in geo.parts.items():
            P = conv(np.vstack(Ps)) - ctr; N = convN(np.vstack(Ns)); I = np.concatenate(Is)
            if mname not in used: used.append(mname)
            pv = add_view(P.astype('<f4').tobytes(), 34962); nv = add_view(N.astype('<f4').tobytes(), 34962)
            big = P.shape[0] > 65535
            iv = add_view(I.astype('<u4' if big else '<u2').tobytes(), 34963)
            accs.append({'bufferView': pv, 'componentType': 5126, 'count': len(P), 'type': 'VEC3', 'min': [float(x) for x in P.min(0)], 'max': [float(x) for x in P.max(0)]}); pa = len(accs) - 1
            accs.append({'bufferView': nv, 'componentType': 5126, 'count': len(N), 'type': 'VEC3'}); na = len(accs) - 1
            accs.append({'bufferView': iv, 'componentType': 5125 if big else 5123, 'count': len(I), 'type': 'SCALAR'}); ia = len(accs) - 1
            prims.append({'attributes': {'POSITION': pa, 'NORMAL': na}, 'indices': ia, 'material': used.index(mname)})
        meshes.append({'name': name, 'primitives': prims}); return len(meshes) - 1, ctr
    def mk_node(nd, parent_abs):
        j = {'name': nd.name}; absT = np.zeros(3)
        if nd.geo is not None and not nd.geo.empty():
            mi, ctr = mk_mesh(nd.geo, nd.name); j['mesh'] = mi; absT = ctr
        elif nd.t is not None:
            absT = conv(np.array([nd.t]))[0]
        tr = absT - parent_abs
        if np.linalg.norm(tr) > 1e-9: j['translation'] = [float(x) for x in tr]
        if nd.extras: j['extras'] = nd.extras
        nodes.append(j); me = len(nodes) - 1
        kids = [mk_node(c, absT) for c in nd.children]
        if kids: nodes[me]['children'] = kids
        return me
    rootidx = [mk_node(r, np.zeros(3)) for r in roots]
    gl = {'asset': {'version': '2.0', 'generator': 'xb.py (VIBE LAB xmas)'}, 'scene': 0, 'scenes': [{'nodes': rootidx}], 'nodes': nodes,
          'meshes': meshes, 'materials': [M[n].gltf() for n in used], 'accessors': accs, 'bufferViews': bviews, 'buffers': [{'byteLength': len(bufs)}]}
    if any('extensions' in M[n].gltf() for n in used): gl['extensionsUsed'] = ['KHR_materials_emissive_strength']
    js = json.dumps(gl, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(bufs) % 4: bufs += b'\0'
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bufs)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bufs), 0x004E4942) + bytes(bufs)
    open(path, 'wb').write(out)
    return len(out)
