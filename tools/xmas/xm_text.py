# Extruded 3D text from a TTF (fontTools only): glyph outlines -> polygons (curves flattened) -> holes bridged -> ear-clipped -> extruded.
import os, math, numpy as np
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from xb import earclip as _earclip_simple

def earclip(poly):
    return _earclip2(poly)


FONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Nunito-Black.ttf')

class _Flat(BasePen):
    def __init__(self, gs, step=6):
        super().__init__(gs); self.contours = []; self.cur = []; self.step = step
    def _moveTo(self, p): self.cur = [p]
    def _lineTo(self, p): self.cur.append(p)
    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        for k in range(1, self.step + 1):
            t = k / self.step; a = (1 - t)
            self.cur.append((a**3 * p0[0] + 3 * a * a * t * p1[0] + 3 * a * t * t * p2[0] + t**3 * p3[0], a**3 * p0[1] + 3 * a * a * t * p1[1] + 3 * a * t * t * p2[1] + t**3 * p3[1]))
    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        for k in range(1, self.step + 1):
            t = k / self.step; a = 1 - t
            self.cur.append((a * a * p0[0] + 2 * a * t * p1[0] + t * t * p2[0], a * a * p0[1] + 2 * a * t * p1[1] + t * t * p2[1]))
    def _closePath(self):
        c = self.cur
        if len(c) > 1 and math.dist(c[0], c[-1]) < 1e-6: c = c[:-1]
        if len(c) >= 3: self.contours.append(c)
        self.cur = []
    _endPath = _closePath

def _area(c):
    return 0.5 * sum(c[i][0] * c[(i + 1) % len(c)][1] - c[(i + 1) % len(c)][0] * c[i][1] for i in range(len(c)))

def _inside(pt, poly):
    x, y = pt; ins = False; n = len(poly)
    for i in range(n):
        x0, y0 = poly[i]; x1, y1 = poly[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0): ins = not ins
    return ins

def _seg_x(a, b, c, d):
    def o(p, q, r): return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return (o(a, b, c) * o(a, b, d) < 0) and (o(c, d, a) * o(c, d, b) < 0)

def _bridge(outer, holes):
    """merge holes into the outer ring (CCW outer, CW holes) with zero-width bridges"""
    poly = list(outer)
    pending = sorted(holes, key=lambda h: -max(p[0] for p in h)); used = set()
    for hk, h in enumerate(pending):
        others = pending[hk + 1:]
        hi = max(range(len(h)), key=lambda i: h[i][0]); hp = h[hi]
        best = None
        for i, p in enumerate(poly):
            if p[0] < hp[0] - 1e-9 or tuple(p) in used: continue
            ok = True
            for j in range(len(poly)):
                a, b = poly[j], poly[(j + 1) % len(poly)]
                if i in (j, (j + 1) % len(poly)): continue
                if _seg_x(hp, p, a, b): ok = False; break
            if ok:
                for j in range(len(h)):
                    a, b = h[j], h[(j + 1) % len(h)]
                    if hi in (j, (j + 1) % len(h)): continue
                    if _seg_x(hp, p, a, b): ok = False; break
            if ok:
                for oh in others:
                    for j in range(len(oh)):
                        if _seg_x(hp, p, oh[j], oh[(j + 1) % len(oh)]): ok = False; break
                    if not ok: break
            if ok:
                d = math.dist(hp, p)
                if best is None or d < best[0]: best = (d, i)
        if best is None:
            best = (0, min(range(len(poly)), key=lambda i: math.dist(hp, poly[i])))
        i = best[1]; used.add(tuple(poly[i])); used.add(tuple(hp))
        ring = h[hi:] + h[:hi] + [h[hi]]
        poly = poly[:i + 1] + ring + [poly[i]] + poly[i + 1:]
    return poly

def glyph_polys(text, size=1.0, tracking=0.02, font=FONT):
    """-> list of (outer, holes) in metres, text box starting at x=0, baseline y=0; plus total width"""
    f = TTFont(font); gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm; hmtx = f['hmtx']
    s = size / upm; x = 0.0; shapes = []
    for ch in text:
        gname = cmap.get(ord(ch))
        if gname is None: x += size * 0.3; continue
        pen = _Flat(gs); gs[gname].draw(pen)
        cs = [[(x + p[0] * s, p[1] * s) for p in c] for c in pen.contours]
        if cs: shapes.append((cs, []))            # all contours of the glyph (filled by non-zero winding)
        x += hmtx[gname][0] * s + tracking * size
    return shapes, x - tracking * size

def add_text(g, mat, text, origin, U, V, size, depth=0.04, align='center', side_mat=None, tracking=0.02):
    """extruded text on a plane: U = reading direction, V = up, extruded toward U x V (front)."""
    shapes, w = glyph_polys(text, size, tracking)
    O = np.asarray(origin, float); U = np.asarray(U, float); V = np.asarray(V, float); N = np.cross(U, V)
    off = -w / 2 if align == 'center' else 0.0
    side_mat = side_mat or mat
    for outer, holes in shapes:
        ring, tri = _tri_holes(outer, holes, size)
        P2 = np.array(ring); P2[:, 0] += off
        F = np.array([O + U * p[0] + V * p[1] + N * depth for p in P2]); B = np.array([O + U * p[0] + V * p[1] for p in P2])
        g.add(mat, F, np.repeat(N[None], len(F), 0), tri)
        for c in outer:
            C = np.array(c); C[:, 0] += off; sgn = -1.0 if _area(c) < 0 else 1.0
            for i in range(len(C)):
                a, b = C[i], C[(i + 1) % len(C)]
                e = b - a; n2 = np.array([e[1], -e[0]]) * sgn
                nw = U * n2[0] + V * n2[1]
                if np.linalg.norm(nw) < 1e-9: continue
                q = np.array([O + U * a[0] + V * a[1], O + U * b[0] + V * b[1], O + U * b[0] + V * b[1] + N * depth, O + U * a[0] + V * a[1] + N * depth])
                if np.dot(np.cross(q[1] - q[0], q[2] - q[0]), nw) < 0: q = q[::-1]
                g.face(side_mat, q)
    return w


def _earclip2(poly):
    """ear clipping tolerant of bridge seams: strict inside test, points coincident with the ear's corners ignored"""
    P = [tuple(p) for p in poly]; n = len(P)
    area = sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n))
    idx = list(range(n)) if area > 0 else list(range(n))[::-1]
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    def strict_in(p, a, b, c):
        e = 1e-12
        return cross(a, b, p) > e and cross(b, c, p) > e and cross(c, a, p) > e
    out = []; guard = 0
    while len(idx) > 3 and guard < 20000:
        guard += 1; m = len(idx); found = False
        for k in range(m):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % m]
            a, b, c = P[i0], P[i1], P[i2]
            if cross(a, b, c) <= 1e-14: continue
            ok = True
            for j in idx:
                q = P[j]
                if q == a or q == b or q == c: continue
                if strict_in(q, a, b, c): ok = False; break
            if ok:
                out += [i0, i1, i2]; idx.pop(k); found = True; break
        if not found:
            # degenerate leftovers (collinear seam): drop a zero-area vertex
            for k in range(len(idx)):
                i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
                if abs(cross(P[i0], P[i1], P[i2])) <= 1e-14: idx.pop(k); found = True; break
            if not found: break
    if len(idx) == 3: out += idx
    return out


def _resample(c, mx):
    out = []
    for i in range(len(c)):
        a, b = np.array(c[i]), np.array(c[(i + 1) % len(c)]); L = np.linalg.norm(b - a); n = max(1, int(math.ceil(L / mx)))
        for k in range(n): out.append(tuple(a + (b - a) * k / n))
    return out

def _winding(pt, c):
    x, y = pt; w = 0; n = len(c)
    for i in range(n):
        x0, y0 = c[i]; x1, y1 = c[(i + 1) % n]
        if y0 <= y < y1 and (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0: w += 1
        elif y1 <= y < y0 and (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0: w -= 1
    return w

def _tri_holes(contours, _unused, size):
    """Delaunay of densely resampled glyph contours; keep triangles whose centroid has non-zero winding (handles overlapping contours)."""
    from scipy.spatial import Delaunay
    mx = 0.02 * size
    rings = [_resample(c, mx) for c in contours]
    pts = [p for r in rings for p in r]
    P = np.array(pts); d = Delaunay(P)
    tri = []
    for t in d.simplices:
        c = P[t].mean(0)
        if sum(_winding(c, r) for r in rings) != 0:
            a, b, cc = P[t]
            if (b[0] - a[0]) * (cc[1] - a[1]) - (b[1] - a[1]) * (cc[0] - a[0]) < 0: t = t[::-1]
            tri += list(t)
    return pts, tri
