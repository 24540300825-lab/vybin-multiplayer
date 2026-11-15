# Rooftop deck: slab + planks + fascia, two side pads (photobooth / reindeer, left empty for later), railings, timber supports, snow.
from xm_common import *

def poly_x_intervals(poly, y):
    xs = []
    n = len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        if (y0 <= y < y1) or (y1 <= y < y0):
            xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
    xs.sort(); return list(zip(xs[0::2], xs[1::2]))

def subtract(iv, cuts):
    out = []
    for a, b in iv:
        segs = [(a, b)]
        for c0, c1 in cuts:
            nxt = []
            for s0, s1 in segs:
                if c1 <= s0 or c0 >= s1: nxt.append((s0, s1)); continue
                if c0 > s0: nxt.append((s0, c0))
                if c1 < s1: nxt.append((c1, s1))
            segs = nxt
        out += [s for s in segs if s[1] - s[0] > 0.05]
    return out

HOLES = [(HX0 + 0.02, HX1 - 0.02, HY0 + 0.02, HY1), (PX0 + 0.01, PX1 - 0.01, PY0 - STEP_RUN * (STEP_N - 1) + 0.02, HY0 + 0.1)]   # under the cottage / porch+steps: no planks
INLAY = (PADL[0] + 0.85, PADL[1] - 0.75, HY0 + 0.85, HY1 - 0.75)    # photobooth stage border (dark planks)

def build_deck():
    G = {k: Geo() for k in ('center', 'padL', 'padR', 'snow', 'rail', 'support')}
    def grp(x):
        return 'padL' if x < -0.45 - 1e-6 else ('padR' if x > 10.45 + 1e-6 else 'center')
    # --- slab (dark timber) with honey fascia
    for key, rng in (('center', (-0.45, 10.45)), ('padL', (-99, -0.45)), ('padR', (10.45, 99))):
        pass
    tri = earclip(DECK_POLY)
    P = np.array(DECK_POLY)
    # slab split in 3 bodies so each map can hide its own piece: centre, left pad (+link), right pad (+link)
    parts = {
        'center': [(-0.45, -2.0), (10.45, -2.0), (10.45, HY1), (-0.45, HY1)],
        'padL': [(PADL[0], HY0), (-2.8, HY0), (-2.8, 0.6), (-0.45, 0.6), (-0.45, HY1), (PADL[0], HY1)],
        'padR': [(10.45, 0.6), (12.8, 0.6), (12.8, HY0), (PADR[1], HY0), (PADR[1], HY1), (10.45, HY1)],
    }
    for k, poly in parts.items():
        G[k].prism('XM_Beam_Dark', poly, SLAB0, DECK - 0.04)
    # fascia boards on the outer edges
    n = len(DECK_POLY)
    for i in range(n):
        a = np.array(DECK_POLY[i]); b = np.array(DECK_POLY[(i + 1) % n])
        if abs(a[1] - HY1) < 1e-6 and abs(b[1] - HY1) < 1e-6:     # back edge
            pass
        d = b - a; L = np.linalg.norm(d); d /= L; out = np.array([d[1], -d[0]])   # CCW polygon -> right normal is outward
        m = (a + b) / 2; k = grp(m[0])
        p0 = np.r_[a + out * 0.04 - d * 0.04, DECK - 0.1]; p1 = np.r_[b + out * 0.04 + d * 0.04, DECK - 0.1]
        G[k].beam('XM_Beam_Honey', p0, p1, 0.07, 0.26, up=(0, 0, 1), b=0.015)
    # --- planks along X (0.2 wide), staggered joints
    rr = np.random.default_rng(7)
    y = -2.0 + 0.004
    row = 0
    while y < HY1 - 0.05:
        yc = y + 0.1
        ivs = poly_x_intervals(DECK_POLY, yc)
        cuts = [(h[0], h[1]) for h in HOLES if h[2] <= yc <= h[3]]
        ivs = subtract(ivs, cuts)
        inlay_row = INLAY[2] <= yc <= INLAY[3]
        ring_row = inlay_row and (yc < INLAY[2] + 0.42 or yc > INLAY[3] - 0.42)
        for a, b in ivs:
            x = a + 0.004
            first = True
            while x < b - 0.04:
                ln = rr.uniform(2.2, 4.2) if not first else rr.uniform(0.6, 3.6); first = False
                x1 = min(x + ln, b - 0.004)
                # split at the inlay band edges so the ring reads cleanly
                segs = [(x, x1)]
                if inlay_row:
                    cut = [INLAY[0], INLAY[0] + 0.42, INLAY[1] - 0.42, INLAY[1]]
                    nseg = []
                    for s0, s1 in segs:
                        pts = [s0] + [c for c in cut if s0 < c < s1] + [s1]
                        nseg += list(zip(pts[:-1], pts[1:]))
                    segs = nseg
                for s0, s1 in segs:
                    if s1 - s0 < 0.06: continue
                    mid = (s0 + s1) / 2
                    dark = inlay_row and INLAY[0] < mid < INLAY[1] and (ring_row or mid < INLAY[0] + 0.42 or mid > INLAY[1] - 0.42)
                    mat = 'XM_Deck_BoardDark' if dark else 'XM_Deck_Board'
                    G[grp(mid)].box(mat, (s0 + 0.006, y, DECK - 0.045), (s1 - 0.006, y + 0.19, DECK), faces='xXyYZ')
                x = x1 + 0.004
        y += 0.2; row += 1
    # --- railings
    rails = []
    for i in range(n):
        a = np.array(DECK_POLY[i]); b = np.array(DECK_POLY[(i + 1) % n])
        if abs(a[1] - HY1) < 1e-6 and abs(b[1] - HY1) < 1e-6:
            # back edge: only the pad parts (the cottage back wall is flush in the middle)
            for (x0, x1) in ((PADL[0], HX0), (HX1, PADR[1])):
                lo, hi = sorted((a[0], b[0]))
                s0, s1 = max(lo, x0), min(hi, x1)
                if s1 > s0 + 0.2: rails.append((np.array([s1, HY1]), np.array([s0, HY1])))
            continue
        rails.append((a, b))
    for a, b in rails:
        railing(G, a, b, grp)
    # --- supports
    build_supports(G['support'])
    # --- snow: reindeer pad blanket + soft drifts in deck corners
    snow_pad(G['padR'])
    for (cx, cy) in ((-0.2, -1.75), (10.2, -1.75), (PADL[0] + 0.25, HY1 - 0.25), (PADR[1] - 0.25, HY1 - 0.25), (PADL[0] + 0.25, HY0 + 0.25), (-2.55, 0.85), (12.55, 0.85)):
        G[grp(cx)].sphere('XM_SnowFrost', [cx, cy, DECK - 0.02], 0.42, seg=10, rings=5, scale=(1.0, 1.0, 0.32))
    return G

def railing(G, a, b, grp, H=1.02):
    """timber railing on a deck edge: posts (with caps) every <=1.9 m, top + bottom rail, balusters; patchy snow on the top rail"""
    d = b - a; L = np.linalg.norm(d); d = d / L; out = np.array([d[1], -d[0]])
    inset = 0.09
    A = a + out * -inset; B = b + out * -inset
    nseg = max(1, int(math.ceil(L / 1.9)))
    k = grp(((a + b) / 2)[0])
    g = G[k]
    for i in range(nseg + 1):
        p = A + (B - A) * i / nseg
        g.beam('XM_Beam_Honey', [p[0], p[1], DECK - 0.02], [p[0], p[1], DECK + H + 0.05], 0.15, 0.15, up=(1, 0, 0), b=0.02)
        g.cbox('XM_Beam_Honey', (p[0] - 0.095, p[1] - 0.095, DECK + H + 0.05), (p[0] + 0.095, p[1] + 0.095, DECK + H + 0.11), b=0.02)
        G['snow'].sphere('XM_SnowFrost', [p[0], p[1], DECK + H + 0.13], 0.1, seg=6, rings=3, scale=(1.1, 1.1, 0.5))
    pa = np.r_[A, DECK + H - 0.04]; pb = np.r_[B, DECK + H - 0.04]
    g.beam('XM_Beam_Honey', pa, pb, 0.12, 0.08, b=0.014)
    g.beam('XM_Beam_Honey', np.r_[A, DECK + 0.14], np.r_[B, DECK + 0.14], 0.07, 0.07, b=0.01)
    nb = int(L / 0.17)
    for i in range(1, nb):
        p = A + (B - A) * i / nb
        if any(np.linalg.norm(p - (A + (B - A) * j / nseg)) < 0.12 for j in range(nseg + 1)): continue
        g.box('XM_Beam_Honey', (p[0] - 0.022, p[1] - 0.022, DECK + 0.18), (p[0] + 0.022, p[1] + 0.022, DECK + H - 0.08), faces='xXyY')
    # patchy snow on the top rail
    rr = np.random.default_rng(int(abs(a[0] * 31 + a[1] * 17)) % 1000)
    t = rr.uniform(0, 0.3)
    while t < 1:
        ln = rr.uniform(0.12, 0.35); t1 = min(1, t + ln)
        if rr.random() < 0.65:
            path = [np.r_[A + (B - A) * s, DECK + H + 0.025] for s in np.linspace(t, t1, 6)]
            G['snow'].tube('XM_SnowFrost', path, [0.03, 0.05, 0.06, 0.06, 0.05, 0.03], seg=5, flat=0.55)
        t = t1 + rr.uniform(0.05, 0.2)

def build_supports(g):
    """visible structure under the new deck: struts off the Game room walls, posts + struts on the wing roofs, edge beams"""
    def strut(p0, p1, w=0.16): g.beam('XM_Beam_Honey', p0, p1, w, w, b=0.02)
    zU = SLAB0
    # edge beams under the slab
    for (p0, p1) in (((-0.45, -1.92), (10.45, -1.92)), ((PADL[0] + 0.1, HY0 + 0.1), (-2.8, HY0 + 0.1)), ((12.8, HY0 + 0.1), (PADR[1] - 0.1, HY0 + 0.1)),
                     ((-2.75, 0.68), (-0.45, 0.68)), ((10.45, 0.68), (12.75, 0.68)), ((PADL[0] + 0.1, HY1 - 0.12), (HX0, HY1 - 0.12)), ((HX1, HY1 - 0.12), (PADR[1] - 0.1, HY1 - 0.12)),
                     ((HX0 + 0.1, HY1 - 0.12), (HX1 - 0.1, HY1 - 0.12))):
        g.beam('XM_Beam_Dark', [p0[0], p0[1], zU - 0.12], [p1[0], p1[1], zU - 0.12], 0.2, 0.24, b=0.02)
    # front cantilever (0.9 m past the Game room front wall): knee struts above the big windows
    for x in (0.1, 2.6, 5.0, 7.4, 9.9):
        strut([x, -1.02, 11.95], [x, -1.85, zU - 0.22])
    # side landings off the tower walls
    for s, xw, xo in ((-1, -0.38, -2.65), (1, 10.32, 12.65)):
        for y in (0.85, 2.1):
            strut([xw, y, 11.6], [xo, y, zU - 0.22])
        g.beam('XM_Beam_Dark', [xo, 0.68, zU - 0.12], [xo, HY0 + 0.1, zU - 0.12], 0.2, 0.24, b=0.02)
    # back overhang of the cottage (past the Game room back wall, 8.37 -> 10.4)
    for x in (0.3, 2.7, 5.0, 7.3, 9.7):
        strut([x, 8.42, 11.7], [x, HY1 - 0.15, zU - 0.22])
    # pads: posts on the wing wall heads (Workshop / Memory shells: x -9.47..-0.73 / 10.73..19.47, y 4.88..10.30, head 9.77)
    for (xa, xb) in ((-9.25, -0.95), (10.95, 19.25)):
        for x in (xa, (xa + xb) / 2, xb):
            for y in (5.05, 10.15):
                g.cbox('XM_Beam_Honey', (x - 0.12, y - 0.12, 9.7), (x + 0.12, y + 0.12, zU - 0.2), b=0.02)
            # cross-brace between the two posts of each frame
            g.beam('XM_Beam_Dark', [x, 5.15, 10.9], [x, 10.05, 12.3], 0.12, 0.12, b=0.015)
            # front cantilever strut (pad front edge reaches y 2.4, ~2.5 m past the wing's upper wall)
            g.beam('XM_Beam_Honey', [x, 5.0, 10.3], [x, HY0 + 0.2, zU - 0.22], 0.16, 0.16, b=0.02)
            g.beam('XM_Beam_Dark', [x, HY0 + 0.1, zU - 0.12], [x, 10.3, zU - 0.12], 0.18, 0.24, b=0.02)

def snow_pad(g):
    """reindeer pad: thin snow blanket (walkable: <=4 cm in the middle) rising into soft drifts against the rails"""
    x0, x1, y0, y1 = PADR[0] + 0.02, PADR[1] - 0.02, HY0 + 0.02, HY1 - 0.02
    nz = smooth_noise(808, 6); nz2 = smooth_noise(809, 5)
    def thick(u, w):
        x = x0 + u; y = y0 + w
        # drifts only against the railings (outer side, back, and the front rail east of the 12.8 m landing) — never in the passage from the landing
        dr = min(PADR[1] - x, HY1 - y, (y - HY0) if x > 12.95 else 9)
        base = 0.03 + 0.005 * nz(u * 1.3 + w * 0.7)
        drift = 0.24 * math.exp(-max(0, dr - 0.1) / 0.28) * (0.7 + 0.3 * nz2(u * 0.9 + w))
        return base + drift
    org = np.array([x0, y0, DECK])
    heightfield_snow(g, org, np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0]), x1 - x0, y1 - y0, thick, res=0.25, sink=0.012)
