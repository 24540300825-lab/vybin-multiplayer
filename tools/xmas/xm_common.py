# Christmas rooftop storey for VIBE LAB house L2 — shared dimensions, materials and architectural helpers.
# WORLD frame = same Z-up frame as the house builders (X right, Y back, Z up). Rooftop of the Game room = Z 12.92.
import math, numpy as np
from xb import Geo, Mat, Node, earclip, vertex_normals, rotz, rotx, roty, M4

RNG = np.random.default_rng(1225)

# ------------------------------------------------------------------ dimensions (metres)
GAME_ROOF = 12.92          # top of L2_Game_Roof (existing)
DECK = 13.06               # top of the new deck boards  (= floor y 0 of the balcony map)
SLAB0 = 12.95              # underside of the deck slab (3 cm clear of the Game roof)
FLOOR = DECK + 0.45        # cottage floor (= floor y 0 of the interior map)
WALL_TOP = FLOOR + 3.30    # top plate
HX0, HX1, HY0, HY1 = -1.0, 11.0, 2.4, 10.4     # cottage outer wall faces
WT = 0.30                  # wall thickness
IX0, IX1, IY0, IY1 = HX0 + WT, HX1 - WT, HY0 + WT, HY1 - WT   # inner faces  (11.4 x 7.4)
CX = 5.0                   # facade centre (= Game room centre)
RIDGE_Y = (HY0 + HY1) / 2
PITCH = math.radians(40)
TANP = math.tan(PITCH)
ROOF_T = 0.24
EAVE_OV, GABLE_OV = 0.62, 0.50
STONE_TOP = FLOOR + 0.52   # stone plinth band (outside) up to here
# window / door sizes (v measured from DECK)
WIN_W, WIN_SILL, WIN_TOP = 1.56, FLOOR + 0.88, FLOOR + 2.62
DOOR_W, DOOR_TOP = 1.34, FLOOR + 2.42
# porch
PX0, PX1 = CX - 1.85, CX + 1.85          # porch platform
PY0, PY1 = 0.95, HY0                      # porch platform depth (front edge .. wall)
STEP_N, STEP_RUN = 3, 0.30                # 3 risers of 0.15 down to the deck
# deck outline (CCW, X/Y) — centre balcony + two side landings + two side pads (over the wing hip roofs)
PADL = (-9.35, HX0)          # photobooth pad X range
PADR = (HX1, 19.35)          # reindeer pad X range
DECK_POLY = [(-0.45, -2.0), (10.45, -2.0), (10.45, 0.6), (12.8, 0.6), (12.8, HY0), (PADR[1], HY0), (PADR[1], HY1),
             (PADL[0], HY1), (PADL[0], HY0), (-2.8, HY0), (-2.8, 0.6), (-0.45, 0.6)]
# stair from the Game room (spiral) — cap of the existing stair, world X/Y (L2_Roof_StairCap)
STAIR_C = (0.65, 7.32)
STAIR_HALF = 0.69

# room-local frames (glTF): local = (X + dx, Z + dy, -Y + dz)
BAL_LOCAL = (9.6, -DECK, -2.0)               # balcony map: deck front edge at z = 0, x 0.25..28.95
INT_LOCAL = (-IX0, -FLOOR, IY0)              # interior map: inner faces at x 0..11.4, z 0..-7.4
def to_local(p, L): return (p[0] + L[0], p[2] + L[1], -p[1] + L[2])

# ------------------------------------------------------------------ materials (sRGB). Names drive the game's stylizer:
#  'wood|timber|plank' -> painterly wood (texture colour, keeps relative lightness; 'Dark' = dark wood)
#  other opaque colours -> concrete-noise multiplied over the colour; 'frost|glass|leaf|...' keep their flat colour
#  emissive + Bulb/Lamp/Lantern/Candle/Fire/Star_Light/Festoon/glow -> allowed to bloom (capped); other emissive never blooms
MATS = [
    Mat('XM_Plaster_Cream', '#EFDDB6', 0.95),
    Mat('XM_Plaster_Inner', '#EBD7B2', 0.95),
    Mat('XM_Beam_Honey', '#A9784A', 0.85),
    Mat('XM_Beam_Dark', '#654330', 0.85),
    Mat('XM_Floor_Board', '#9C6E47', 0.85),
    Mat('XM_Deck_Board', '#8E6A4E', 0.9),
    Mat('XM_Deck_BoardDark', '#5E4433', 0.9),
    Mat('XM_Stone_Warm', '#A79A8A', 1.0),
    Mat('XM_Stone_Light', '#BDB2A2', 1.0),
    Mat('XM_Stone_Mortar', '#6F665C', 1.0),
    Mat('XM_Roof_Pine', '#2F5D47', 0.9),
    Mat('XM_Roof_PineDeep', '#24493A', 0.9),
    Mat('XM_Frame_Pine', '#2C5843', 0.8),
    Mat('XM_Door_Cranberry', '#8C2430', 0.8),
    Mat('XM_Brass', '#C79A4E', 0.45, 0.65),
    Mat('XM_Iron_Black', '#2A2522', 0.6, 0.55),
    Mat('XM_SnowFrost', '#EEF3FA', 0.92),
    Mat('XM_SnowFrost_Shade', '#E4ECF6', 0.95),
    Mat('XM_WinGlass', '#CFE3F2', 0.08, 0.0, alpha=0.16),
    Mat('XM_WindowWarm', '#F6C07A', 0.9, 0.0, emis='#FFB45A', emis_k=0.72),
    Mat('XM_WindowWarmDeep', '#D98C4A', 0.9, 0.0, emis='#F08A3A', emis_k=0.5),
    Mat('XM_Curtain_Red', '#B5323A', 0.95),
    Mat('XM_Garland_Fir', '#2E5D39', 1.0),
    Mat('XM_Garland_FirLight', '#3E7444', 1.0),
    Mat('XM_Festoon_Bulb', '#FFE2A8', 0.5, 0.0, emis='#FFC46A', emis_k=2.2),
    Mat('XM_Bow_Red', '#C2252F', 0.85),
    Mat('XM_Berry_Red', '#B0172A', 0.6),
    Mat('XM_Star_Light_Gold', '#F2C14E', 0.5, 0.2, emis='#FFC845', emis_k=1.6),
    Mat('XM_Lantern_Glow', '#FFE0A0', 0.5, 0.0, emis='#FFB955', emis_k=2.0),
    Mat('XM_Candle_Flame', '#FFE7A6', 0.5, 0.0, emis='#FFC060', emis_k=2.4),
    Mat('XM_Candle_Wax', '#F2E6CC', 0.9),
    Mat('XM_Soot', '#231C17', 1.0),
    # interior
    Mat('XM_Fire_Glow', '#FFB040', 0.6, 0.0, emis='#FF8A24', emis_k=2.6),
    Mat('XM_Fire_Core', '#FFE08A', 0.6, 0.0, emis='#FFD06A', emis_k=3.0),
    Mat('XM_Ember_Fire', '#C2401C', 0.8, 0.0, emis='#B83A14', emis_k=1.4),
    Mat('XM_Log_Dark', '#5B3B24', 0.95),
    Mat('XM_Sofa_Red', '#A3262F', 0.95),
    Mat('XM_Fabric_Cream', '#EEE3CC', 0.95),
    Mat('XM_Plaid_Red', '#9E2A2A', 0.95),
    Mat('XM_Plaid_Green', '#2F5A3C', 0.95),
    Mat('XM_Rug_Cream', '#EDE1C8', 1.0),
    Mat('XM_Rug_Red', '#B03535', 1.0),
    Mat('XM_Tree_Fir', '#2D6638', 0.95),
    Mat('XM_Tree_FirLight', '#3D7C43', 0.95),
    Mat('XM_Tree_Bulb', '#FFE6B0', 0.5, 0.0, emis='#FFC86E', emis_k=2.0),
    Mat('XM_Ornament_Red', '#C52A2C', 0.45, 0.25),
    Mat('XM_Ornament_Gold', '#D7A944', 0.4, 0.6),
    Mat('XM_Ornament_Cream', '#F1E4C8', 0.6),
    Mat('XM_Paper_Red', '#C33A36', 0.9),
    Mat('XM_Paper_Green', '#3C7046', 0.9),
    Mat('XM_Paper_Cream', '#EFE2C8', 0.9),
    Mat('XM_Paper_Gold', '#D9B05A', 0.7),
    Mat('XM_Ribbon_Gold', '#E0B654', 0.6, 0.3),
    Mat('XM_Pot_Clay', '#B3683F', 0.95),
    Mat('XM_Plant_Leaf', '#4E8A3E', 0.95),
    Mat('XM_Plant_LeafDark', '#356B33', 0.95),
    Mat('XM_Canvas_White', '#F4EFE3', 0.95),
    Mat('XM_Paint_Sky', '#8FB4D8', 0.95),
    Mat('XM_Paint_Fir', '#3D7A4A', 0.95),
    Mat('XM_Sock_Red', '#B7292F', 0.95),
    Mat('XM_Sock_Cream', '#F0E6D2', 0.95),
    Mat('XM_Sock_Green', '#2F6A43', 0.95),
    Mat('XM_Basket_Cane', '#B98B55', 0.95),
    Mat('XM_Lamp_Shade', '#F3D9A6', 0.8, 0.0, emis='#FFC97A', emis_k=1.2),
    Mat('XM_Card_Mix', '#E9D3B0', 0.9),
    Mat('XM_Card_Red', '#C4433F', 0.9),
    Mat('XM_Card_Green', '#4A7C55', 0.9),
    Mat('XM_Mug_Red', '#B63B35', 0.7),
    Mat('XM_Hole_Dark', '#120E0B', 1.0),
    Mat('XM_Collider', '#FF00FF', 1.0),
]
MATN = {m.name for m in MATS}

# ------------------------------------------------------------------ helpers
def ring_xy(cx, cy, r, n, a0=0):
    return [(cx + r * math.cos(a0 + 2 * math.pi * k / n), cy + r * math.sin(a0 + 2 * math.pi * k / n)) for k in range(n)]

def arch_pts(uc, spring, r, n=10):
    """semicircle points from left (pi) to right (0): list of (u, v)"""
    return [(uc + r * math.cos(math.pi - math.pi * k / n), spring + r * math.sin(math.pi - math.pi * k / n)) for k in range(n + 1)]

class WallFrame:
    """local wall frame: u along the wall (as seen from OUTSIDE, left->right), v up from DECK, w outward.
    O = world point of (u=0, v=0) on the OUTER face."""
    def __init__(self, O, U, W):
        self.O = np.asarray(O, float); self.U = np.asarray(U, float); self.W = np.asarray(W, float); self.V = np.array([0, 0, 1.0])
    def p(self, u, v, w=0.0): return self.O + self.U * u + self.V * (v - 0) + self.W * w
    def R(self): return np.stack([self.U, self.W, self.V], 1)   # columns: u, w, v  (local x=u, y=w, z=v)

def wall_panel(g, F, L, H, T, openings, mat_out, mat_in, mat_rev, band=None, top=True, ends=True, inner=True):
    """Solid wall slab with (arched) openings.  openings: dicts {u0,u1,v0,v1,arch(bool)} (v1 = apex).
    band = (v_split, mat_low): outer face below v_split uses mat_low (stone mortar)."""
    ops = []
    for o in openings:
        r = (o['u1'] - o['u0']) / 2
        spring = o['v1'] - r if o.get('arch') else o['v1']
        ops.append(dict(o, r=r, spring=spring, uc=(o['u0'] + o['u1']) / 2))
    us = {0.0, L}
    for o in ops:
        us |= {o['u0'], o['u1']}
        if o.get('arch'):
            for (u, v) in arch_pts(o['uc'], o['spring'], o['r'], 12): us.add(round(u, 6))
    us = sorted(us)
    def top_at(o, u):
        if not o.get('arch'): return o['spring']
        d = max(0.0, o['r'] ** 2 - (u - o['uc']) ** 2); return o['spring'] + math.sqrt(d)
    def solids(ua, ub):
        cuts_a, cuts_b = [], []
        for o in ops:
            if o['u0'] - 1e-6 <= ua and ub <= o['u1'] + 1e-6:
                cuts_a.append((o['v0'], top_at(o, ua))); cuts_b.append((o['v0'], top_at(o, ub)))
        segs = []
        cuts = sorted(zip(cuts_a, cuts_b), key=lambda c: c[0][0])
        lo_a = lo_b = 0.0
        for (a, b) in cuts:
            if a[0] > lo_a + 1e-6: segs.append(((lo_a, a[0]), (lo_b, b[0])))
            lo_a, lo_b = a[1], b[1]
        if H > lo_a + 1e-6: segs.append(((lo_a, H), (lo_b, H)))
        return segs
    def quad(mat, pts, nrm_sign):
        P = [F.p(u, v, w) for (u, v, w) in pts]
        if nrm_sign < 0: P = P[::-1]
        g.face(mat, P)
    for ua, ub in zip(us[:-1], us[1:]):
        if ub - ua < 1e-6: continue
        for (a, b) in solids(ua, ub):
            pieces = [(a, b)]
            if band:
                vs = band[0]; pieces = []
                if a[0] < vs < a[1]: pieces = [((a[0], vs), (b[0], vs)), ((vs, a[1]), (vs, b[1]))]
                else: pieces = [(a, b)]
            for (pa, pb) in pieces:
                mo = band[1] if band and pa[1] <= band[0] + 1e-6 else mat_out
                # outer face (normal +w): order u right, v up seen from outside -> CCW with normal W
                quad(mo, [(ua, pa[0], 0), (ub, pb[0], 0), (ub, pb[1], 0), (ua, pa[1], 0)], -1 if np.dot(np.cross(F.U, F.V), F.W) < 0 else 1)
                if inner:
                    quad(mat_in, [(ua, pa[0], -T), (ub, pb[0], -T), (ub, pb[1], -T), (ua, pa[1], -T)], 1 if np.dot(np.cross(F.U, F.V), F.W) < 0 else -1)
    # reveals
    for o in ops:
        u0, u1, v0, sp = o['u0'], o['u1'], o['v0'], o['spring']
        def rq(pts, inward):
            P = [F.p(u, v, w) for (u, v, w) in pts]; n = np.cross(P[1] - P[0], P[2] - P[0])
            if np.dot(n, inward) < 0: P = P[::-1]
            g.face(mat_rev, P)
        if v0 > 1e-6: rq([(u0, v0, 0), (u1, v0, 0), (u1, v0, -T), (u0, v0, -T)], F.V)
        rq([(u0, v0, 0), (u0, sp, 0), (u0, sp, -T), (u0, v0, -T)], F.U)
        rq([(u1, v0, 0), (u1, sp, 0), (u1, sp, -T), (u1, v0, -T)], -F.U)
        if o.get('arch'):
            pts = arch_pts(o['uc'], sp, o['r'], 12)
            for (ua, va), (ub, vb) in zip(pts[:-1], pts[1:]):
                mid = np.array([(ua + ub) / 2 - o['uc'], 0, (va + vb) / 2 - sp]); inward = -(F.U * mid[0] + F.V * mid[2])
                rq([(ua, va, 0), (ub, vb, 0), (ub, vb, -T), (ua, va, -T)], inward)
        else:
            rq([(u0, sp, 0), (u1, sp, 0), (u1, sp, -T), (u0, sp, -T)], -F.V)
    if top:
        P = [F.p(0, H, 0), F.p(L, H, 0), F.p(L, H, -T), F.p(0, H, -T)]
        if np.dot(np.cross(P[1] - P[0], P[2] - P[0]), F.V) < 0: P = P[::-1]
        g.face(mat_out, P)
    if ends:
        for u, s in ((0, -1), (L, 1)):
            P = [F.p(u, 0, 0), F.p(u, H, 0), F.p(u, H, -T), F.p(u, 0, -T)]
            if np.dot(np.cross(P[1] - P[0], P[2] - P[0]), F.U * s) < 0: P = P[::-1]
            g.face(mat_out, P)

def stone_band(g, F, u0, u1, v0, v1, mat='XM_Stone_Warm', mat2='XM_Stone_Light', skip=(), proud=(0.025, 0.065), rowh=(0.2, 0.3), wrap=None):
    """stylized stones laid in courses on the outer face (w>0). skip = [(u0,u1,v0,v1)] holes."""
    v = v0
    row = 0
    while v < v1 - 0.05:
        h = min(RNG.uniform(*rowh), v1 - v)
        if v1 - (v + h) < 0.1: h = v1 - v
        u = u0 + (RNG.uniform(0.0, 0.25) if row % 2 else 0)
        if row % 2 and u > u0: u = u0 - RNG.uniform(0.05, 0.2)
        while u < u1 - 0.04:
            ln = RNG.uniform(0.34, 0.72)
            ua, ub = max(u, u0 - 0.06), min(u + ln, u1 + 0.06)
            if ub - ua > 0.12:
                cu, cv = (ua + ub) / 2, v + h / 2
                if not any(s[0] - 0.02 < cu < s[1] + 0.02 and s[2] - 0.02 < cv < s[3] + 0.02 for s in skip):
                    gap = 0.026
                    pw = RNG.uniform(*proud)
                    ch = 0.04; j = lambda: RNG.uniform(-0.012, 0.012)
                    pts = [F.p(ua + gap + j(), v + gap + j(), -0.02), F.p(ub - gap + j(), v + gap + j(), -0.02), F.p(ub - gap + j(), v + h - gap + j(), -0.02), F.p(ua + gap + j(), v + h - gap + j(), -0.02)]
                    for (uu, vv, du, dv) in ((ua + gap, v + gap, 1, 1), (ub - gap, v + gap, -1, 1), (ub - gap, v + h - gap, -1, -1), (ua + gap, v + h - gap, 1, -1)):
                        pts.append(F.p(uu + du * ch + j(), vv + j(), pw - 0.01)); pts.append(F.p(uu + j(), vv + dv * ch + j(), pw - 0.01))
                    g.hull(mat if RNG.random() > 0.28 else mat2, pts)
            u += ln
        v += h; row += 1

def heightfield_snow(g, origin, ax_u, ax_w, n_up, Lu, Lw, thick_fn, res=0.22, mat='XM_SnowFrost', sink=0.06):
    """smooth snow sheet over a plane: surface = origin + u*ax_u + w*ax_w + n_up*(thick(u,w) - sink).
    thick_fn returns metres (<=0 -> below the surface, hidden in the roof)."""
    nu = max(2, int(Lu / res) + 1); nw = max(2, int(Lw / res) + 1)
    P = []
    for i in range(nw):
        w = Lw * i / (nw - 1)
        for k in range(nu):
            u = Lu * k / (nu - 1)
            t = thick_fn(u, w)
            P.append(origin + ax_u * u + ax_w * w + n_up * (t - sink))
    P = np.array(P); I = []
    for i in range(nw - 1):
        for k in range(nu - 1):
            a = i * nu + k; b = a + 1; c = a + nu; d = c + 1
            I += [a, b, d, a, d, c]
    # orient so normals face n_up
    I = np.array(I).reshape(-1, 3)
    fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
    if np.mean(fn @ n_up) < 0: I = I[:, ::-1]
    # drop triangles fully buried (keeps the mesh light)
    keep = []
    for t in I:
        hs = [(P[j] - origin) @ n_up for j in t]
        if max(hs) > -0.03: keep.append(t)
    I = np.array(keep).reshape(-1)
    N = vertex_normals(P, I)
    g.add(mat, P, N, I)

def smooth_noise(seed, n=6):
    r = np.random.default_rng(seed); A = r.uniform(0.3, 1.0, n); Fq = r.uniform(0.6, 2.8, n); Ph = r.uniform(0, 6.28, n)
    s = A.sum()
    return lambda x: float(np.sum(A * np.sin(Fq * x + Ph)) / s)

def catenary(p0, p1, sag, n=14):
    p0 = np.asarray(p0, float); p1 = np.asarray(p1, float); out = []
    for k in range(n + 1):
        t = k / n; p = p0 + (p1 - p0) * t; p[2] -= sag * 4 * t * (1 - t); out.append(p)
    return out

def garland(g, path, r=0.085, bulbs=True, bulb_gap=0.34, seed=0, mat='XM_Garland_Fir', mat2='XM_Garland_FirLight', bulb_mat='XM_Festoon_Bulb', droop=0.06):
    """fir garland rope: lumpy tube + needle tufts + warm bulbs hanging under it"""
    path = np.asarray(path, float); nz = smooth_noise(seed, 5)
    L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    rad = [r * (0.82 + 0.3 * abs(nz(s * 9.0))) for s in L]
    g.tube(mat, path, rad, seg=6, caps=True)
    # tufts (small flattened spheres) for a needle-y silhouette
    k = 0.0
    rr = np.random.default_rng(seed + 7)
    while k < L[-1]:
        p = np.array([np.interp(k, L, path[:, i]) for i in range(3)])
        off = rr.normal(0, r * 0.55, 3); off[2] = abs(off[2]) * 0.3
        g.sphere(mat2 if rr.random() < 0.45 else mat, p + off, r * rr.uniform(0.75, 1.05), seg=4, rings=3, scale=(1.3, 1.3, 0.85))
        k += r * 2.9
    if bulbs:
        k = bulb_gap * 0.5; i = 0
        while k < L[-1]:
            p = np.array([np.interp(k, L, path[:, j]) for j in range(3)])
            g.sphere(bulb_mat, p + [0, 0, -r - droop * (0.6 + 0.4 * (i % 2))], 0.037, seg=4, rings=3, scale=(1, 1, 1.3))
            k += bulb_gap; i += 1

def bow(g, c, size=0.22, facing=(0, -1, 0), mat='XM_Bow_Red', tails=True):
    """ribbon bow: two flattened loops + knot + two tails. facing = outward normal"""
    c = np.asarray(c, float); n = np.asarray(facing, float); n /= np.linalg.norm(n)
    up = np.array([0, 0, 1.0]); s = np.cross(up, n)
    if np.linalg.norm(s) < 1e-6: s = np.array([1.0, 0, 0])
    s /= np.linalg.norm(s); u = np.cross(n, s)
    R = np.stack([s, n, u], 1)
    for sg in (-1, 1):
        A = R @ np.diag([1, 1, 1]) @ rotx(0) ;
        # loop = torus squashed
        TR = R @ roty(sg * 0.35) @ np.diag([1.0, 0.45, 0.62])
        g.torus(mat, c + s * sg * size * 0.55 + u * size * 0.05, size * 0.4, size * 0.16, seg=12, tseg=6, axis_R=TR @ rotx(math.pi / 2))
    g.sphere(mat, c + n * size * 0.05, size * 0.2, seg=8, rings=5, scale=(1.1, 0.8, 1.0))
    if tails:
        for sg in (-1, 1):
            p0 = c - u * size * 0.15; p1 = c - u * size * 0.95 + s * sg * size * 0.45
            g.beam(mat, p0, p1, size * 0.28, 0.025, up=n, b=0.006)

def wreath(g, c, R=0.36, facing=(0, -1, 0), seed=3, bow_at_bottom=True):
    c = np.asarray(c, float); n = np.asarray(facing, float); n /= np.linalg.norm(n)
    s = np.cross([0, 0, 1.0], n);
    if np.linalg.norm(s) < 1e-6: s = np.array([1.0, 0, 0])
    s /= np.linalg.norm(s); u = np.cross(n, s)
    A = np.stack([s, u, n], 1)   # torus local XY = wall plane
    nz = smooth_noise(seed, 4)
    g.torus('XM_Garland_Fir', c, R, R * 0.3, seg=26, tseg=7, axis_R=A, rnoise=lambda a, b: 0.85 + 0.25 * abs(nz(a * 7)))
    rr = np.random.default_rng(seed)
    for k in range(18):
        a = 2 * math.pi * k / 18 + rr.uniform(-0.1, 0.1)
        p = c + (s * math.cos(a) + u * math.sin(a)) * R * rr.uniform(0.85, 1.12) + n * R * 0.22
        g.sphere('XM_Garland_FirLight', p, R * 0.18, seg=5, rings=3, scale=(1.2, 1.2, 0.7))
    for k in range(9):
        a = 2 * math.pi * k / 9 + 0.3
        p = c + (s * math.cos(a) + u * math.sin(a)) * R * 0.95 + n * R * 0.3
        for j in range(3):
            g.sphere('XM_Berry_Red', p + rr.normal(0, R * 0.05, 3), R * 0.06, seg=4, rings=3)
    if bow_at_bottom: bow(g, c - u * R * 0.95 + n * R * 0.28, size=R * 0.62, facing=n)

def lantern(g, c, facing, glow='XM_Lantern_Glow'):
    """wall lantern: bracket + square iron cage + glowing glass + cap"""
    c = np.asarray(c, float); n = np.asarray(facing, float); n /= np.linalg.norm(n); s = np.cross([0, 0, 1.0], n); s /= np.linalg.norm(s)
    wallp = c - n * 0.30
    g.beam('XM_Iron_Black', wallp + [0, 0, 0.28], c + [0, 0, 0.30], 0.035, 0.035)
    g.obox('XM_Iron_Black', wallp + [0, 0, 0.12], (0.05, 0.18, 0.3), np.stack([s, n, [0, 0, 1.0]], 1))
    R = np.stack([s, n, [0, 0, 1.0]], 1)
    g.obox(glow, c + [0, 0, -0.02], (0.17, 0.17, 0.24), R)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.obox('XM_Iron_Black', c + s * sx * 0.095 + n * sy * 0.095 + [0, 0, -0.02], (0.022, 0.022, 0.28), R)
    g.obox('XM_Iron_Black', c + [0, 0, -0.17], (0.23, 0.23, 0.04), R)
    g.lathe('XM_Iron_Black', [(0.17, 0.0), (0.15, 0.03), (0.05, 0.12), (0.02, 0.16)], c + [0, 0, 0.11], seg=4, cap_bot=True)
    g.sphere('XM_Iron_Black', c + [0, 0, 0.29], 0.025, seg=6, rings=4)

def star5(g, c, r=0.22, depth=0.06, facing=(0, -1, 0), mat='XM_Star_Light_Gold'):
    c = np.asarray(c, float); n = np.asarray(facing, float); n /= np.linalg.norm(n)
    s = np.cross([0, 0, 1.0], n); s /= np.linalg.norm(s); u = np.cross(n, s)
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5; rr = r if k % 2 == 0 else r * 0.45
        pts.append(np.array([rr * math.cos(a), rr * math.sin(a)]))
    front = [c + s * p[0] + u * p[1] + n * depth / 2 for p in pts]; back = [c + s * p[0] + u * p[1] - n * depth / 2 for p in pts]
    tip_f = c + n * depth * 1.1; tip_b = c - n * depth * 0.6
    for k in range(10):
        a, b = front[k], front[(k + 1) % 10]; g.face(mat, [tip_f, a, b] if np.dot(np.cross(a - tip_f, b - tip_f), n) > 0 else [tip_f, b, a])
        a, b = back[k], back[(k + 1) % 10]; g.face(mat, [tip_b, b, a] if np.dot(np.cross(b - tip_b, a - tip_b), -n) > 0 else [tip_b, a, b])
