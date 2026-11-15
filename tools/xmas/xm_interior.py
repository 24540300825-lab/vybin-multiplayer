# Interior of the Christmas cottage (interior map only): floor, stairwell to the Game room, fireplace, tree, gift bench,
# sofa corner, easel, card dresser, shelves, sconces, garlands. World Z-up; floor = FLOOR.
from xm_common import *
from xm_house import order_face, bbox_pts

Z = FLOOR
SX0, SX1 = STAIR_C[0] - STAIR_HALF, STAIR_C[0] + STAIR_HALF
SY0, SY1 = STAIR_C[1] - STAIR_HALF, STAIR_C[1] + STAIR_HALF
FIRE_X0, FIRE_X1 = CX - 1.25, CX + 1.25        # chimney breast
FIRE_Y0 = IY1 - 0.72                            # breast front face
HEARTH_Y0 = FIRE_Y0 - 0.62

def build_interior():
    N = {}            # node name -> Geo (each becomes its own node so pins / lamps / colliders can target it)
    def G(name):
        if name not in N: N[name] = Geo()
        return N[name]
    floor(G('XM_In_Floor'))
    stairwell(G('XM_In_Stairwell'), G('COL_Stairwell'))
    fireplace(G('XM_In_Fireplace'), G('Pendant_Hearth_Bulb'), G('XM_In_Mantel_Decor'), G('XM_In_Hearth'))
    tree(G('XM_In_Tree'), G('Pendant_Tree_Bulb'))
    ornament_box(G('XM_In_OrnamentBox'))
    gift_bench(G('XM_In_GiftBench'), G('DeskLamp_Head'))
    sofa_corner(G('Sofa'), G('XM_In_Rug'), G('XM_In_CoffeeTable'))
    easel(G('XM_In_Easel'))
    dresser(G('XM_In_CardDresser'))
    shelves(G('XM_In_Shelves'))
    sconces({'A': G('Pendant_SconceA_Bulb'), 'B': G('Pendant_SconceB_Bulb'), 'C': G('Pendant_SconceC_Bulb'), 'D': G('Pendant_SconceD_Bulb')}, G('XM_In_Sconce_Iron'))
    beam_garland(G('XM_In_Garland'))
    G('XM_In_Doormat').cbox('XM_Rug_Red', (CX - 0.55, IY0 - WT + 0.35, Z), (CX + 0.55, IY0 - WT + 1.0, Z + 0.018), b=0.008)
    skirting(G('XM_In_Skirting'))
    hearth_props(G('XM_In_HearthProps'))
    reading_nook(G('XM_In_Armchair'), G('Pendant_Reading_Bulb'))
    wall_wreaths(G('XM_In_WallDecor'))
    return N

def floor(g):
    rr = np.random.default_rng(3)
    y = HY0 + 0.003
    while y < IY1 - 0.01:
        h = min(0.22, IY1 - y)
        x = IX0
        xs_cut = [(SX0, SX1)] if SY0 - 0.01 < y + h / 2 < SY1 + 0.01 else []
        segs = [(IX0 - (WT if y < IY0 else 0), IX1 + (WT if y < IY0 else 0))]
        for c0, c1 in xs_cut:
            nxt = []
            for a, b in segs:
                if c0 > a: nxt.append((a, min(b, c0)))
                if c1 < b: nxt.append((max(a, c1), b))
            segs = nxt
        for a, b in segs:
            x = a
            while x < b - 0.02:
                ln = rr.uniform(1.4, 3.2); x1 = min(x + ln, b)
                g.box('XM_Floor_Board', (x + 0.004, y, Z - 0.05), (x1 - 0.004, y + h - 0.008, Z), faces='xXyYZ')
                x = x1
        y += h
    # dark underlay so plank gaps read as shadow, not see-through
    g.box('XM_Beam_Dark', (HX0 + 0.01, HY0 + 0.01, Z - 0.09), (HX1 - 0.01, IY1, Z - 0.05), faces='Z')
    # front cut edge: thick floor beam (section line)
    g.cbox('XM_Beam_Dark', (HX0, HY0 - 0.02, Z - 0.26), (HX1, HY0 + 0.16, Z - 0.04), b=0.02)

def stairwell(g, col):
    """opening for the spiral stair from the Game room (open on the +X side, where you arrive)"""
    # dark shaft + walls
    g.box('XM_Hole_Dark', (SX0, SY0, Z - 1.8), (SX1, SY1, Z - 1.8), faces='Z')
    for (lo, hi, f) in (((SX0, SY0, Z - 1.8), (SX0 + 0.001, SY1, Z - 0.05), 'X'), ((SX1 - 0.001, SY0, Z - 1.8), (SX1, SY1, Z - 0.05), 'x'),
                        ((SX0, SY0, Z - 1.8), (SX1, SY0 + 0.001, Z - 0.05), 'Y'), ((SX0, SY1 - 0.001, Z - 1.8), (SX1, SY1, Z - 0.05), 'y')):
        g.box('XM_Hole_Dark', lo, hi, faces=f)
    # stone rim
    for (a, b) in (((SX0 - 0.12, SY0 - 0.12), (SX1 + 0.12, SY0)), ((SX0 - 0.12, SY1), (SX1 + 0.12, SY1 + 0.12)), ((SX0 - 0.12, SY0), (SX0, SY1)), ((SX1, SY0), (SX1 + 0.12, SY1))):
        g.cbox('XM_Stone_Light', (a[0], a[1], Z - 0.05), (b[0], b[1], Z + 0.03), b=0.015)
    # spiral: centre pole + top treads going down
    cx, cy = STAIR_C
    g.lathe('XM_Beam_Dark', [(0.07, Z - 1.8), (0.07, Z + 0.95), (0.09, Z + 1.0), (0.0, Z + 1.06)], (cx, cy, 0), seg=10)
    for k in range(7):
        a0 = math.radians(-20 - k * 30); a1 = a0 - math.radians(32); zt = Z - 0.2 - k * 0.19
        pts = [(cx + 0.08 * math.cos(a0), cy + 0.08 * math.sin(a0)), (cx + 0.66 * math.cos(a0), cy + 0.66 * math.sin(a0)),
               (cx + 0.66 * math.cos(a1), cy + 0.66 * math.sin(a1)), (cx + 0.08 * math.cos(a1), cy + 0.08 * math.sin(a1))]
        g.prism('XM_Beam_Honey', pts, zt - 0.05, zt)
    # railing on 3 sides (open toward +X)
    H = 0.98
    posts = [(SX0 - 0.06, SY0 - 0.06), (SX0 - 0.06, SY1 + 0.06), (SX1 + 0.06, SY1 + 0.06), (SX1 + 0.06, SY0 - 0.06)]
    for p in posts:
        g.cbox('XM_Beam_Honey', (p[0] - 0.05, p[1] - 0.05, Z), (p[0] + 0.05, p[1] + 0.05, Z + H + 0.05), b=0.012)
    for a, b in ((posts[1], posts[0]), (posts[0], posts[3]), (posts[1], posts[2])):
        g.beam('XM_Beam_Honey', [a[0], a[1], Z + H], [b[0], b[1], Z + H], 0.08, 0.06, b=0.01)
        n = int(np.hypot(b[0] - a[0], b[1] - a[1]) / 0.16)
        for i in range(1, n):
            p = (a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)
            g.box('XM_Beam_Honey', (p[0] - 0.018, p[1] - 0.018, Z + 0.03), (p[0] + 0.018, p[1] + 0.018, Z + H - 0.03), faces='xXyY')
    # garland on the rail
    from xm_common import garland
    garland(g, catenary([posts[0][0], posts[0][1] - 0.02, Z + H + 0.03], [posts[3][0], posts[3][1] - 0.02, Z + H + 0.03], 0.12, 12), r=0.045, seed=61, bulb_gap=0.25)
    # invisible blocker over the hole (keeps players out of the shaft; the pin stands on the open side)
    col.box('XM_Collider', (SX0, SY0, Z + 0.1), (SX1 - 0.2, SY1, Z + 0.95))

def fireplace(g, fire, decor, hearth):
    x0, x1, y0 = FIRE_X0, FIRE_X1, FIRE_Y0
    top = WALL_TOP - 0.02
    # breast body (mortar) + stones on the faces
    g.box('XM_Stone_Mortar', (x0 + 0.03, y0 + 0.03, Z), (x1 - 0.03, IY1, top), faces='xXZ')
    ow, oh = 1.2, 1.05            # firebox opening (arched)
    F = WallFrame((x0 + 0.03, y0 + 0.03, 0), (1, 0, 0), (0, -1, 0))
    L = x1 - x0 - 0.06
    uc = L / 2
    from xm_common import wall_panel
    wall_panel(g, WallFrame((x0 + 0.03, y0 + 0.03, Z), (1, 0, 0), (0, -1, 0)), L, top - Z, 0.6,
               [dict(u0=uc - ow / 2, u1=uc + ow / 2, v0=0.13, v1=oh, arch=True)], 'XM_Stone_Mortar', 'XM_Stone_Mortar', 'XM_Soot', top=False, ends=False, inner=False)
    stone_band(g, F, 0, L, Z + 0.02, top - 0.05, skip=[(uc - ow / 2 - 0.05, uc + ow / 2 + 0.05, Z, Z + oh + 0.12)], rowh=(0.2, 0.28), proud=(0.03, 0.07))
    for Fs in (WallFrame((x0 + 0.03, IY1, 0), (0, -1, 0), (-1, 0, 0)), WallFrame((x1 - 0.03, y0 + 0.03, 0), (0, 1, 0), (1, 0, 0))):
        stone_band(g, Fs, 0, IY1 - y0 - 0.03, Z + 0.02, top - 0.05, rowh=(0.2, 0.28), proud=(0.03, 0.06))
    # arch voussoirs around the firebox
    cx = CX; sp = Z + oh - ow / 2
    for k in range(9):
        a0 = math.pi - math.pi * k / 9; a1 = math.pi - math.pi * (k + 1) / 9
        pts = []
        for (a, r) in ((a0, ow / 2 + 0.02), (a1, ow / 2 + 0.02), (a1, ow / 2 + 0.24), (a0, ow / 2 + 0.24)):
            for dy in (0.0, -0.1):
                pts.append([cx + r * math.cos(a), y0 + dy - 0.02, sp + r * math.sin(a)])
        g.hull('XM_Stone_Light', np.array(pts) + RNG.normal(0, 0.008, (8, 3)))
    for s in (-1, 1):
        g.cbox('XM_Stone_Light', (cx + s * (ow / 2 + 0.02) - (0.22 if s > 0 else 0), y0 - 0.12, Z + 0.12), (cx + s * (ow / 2 + 0.02) + (0.22 if s < 0 else 0), y0 + 0.02, sp), b=0.02)
    # firebox: soot box (inner faces) + floor
    fy1 = y0 + 0.62
    g.box('XM_Soot', (cx - ow / 2, y0 - 0.03, Z + 0.13), (cx + ow / 2, fy1, sp + ow / 2 + 0.02), faces='xXYz')
    # the front hole must be open: the stone body's front face is a single quad, cut it by drawing the box front without that face
    # (the stone body uses faces 'xXyZ' -> its front face y covers the opening; we overdraw the opening with soot recessed instead)
    g.box('XM_Soot', (cx - ow / 2, y0 + 0.02, Z + 0.13), (cx + ow / 2, fy1, Z + 0.135), faces='Z')
    # logs + fire
    for (ang, dz, ln) in ((0.12, 0.0, 0.85), (-0.15, 0.02, 0.8), (0.0, 0.13, 0.75)):
        c = np.array([cx, y0 + 0.32, Z + 0.21 + dz]); d = np.array([math.cos(ang), math.sin(ang), 0])
        g.beam('XM_Log_Dark', c - d * ln / 2, c + d * ln / 2, 0.13, 0.13, b=0.04)
    for (dx, h, r) in ((-0.22, 0.42, 0.11), (0.0, 0.58, 0.15), (0.2, 0.46, 0.12), (-0.08, 0.36, 0.09), (0.11, 0.33, 0.08)):
        c = (cx + dx, y0 + 0.3, Z + 0.24)
        fire.lathe('XM_Fire_Glow', [(r, 0), (r * 0.9, h * 0.3), (r * 0.45, h * 0.7), (0.0, h)], c, seg=7, rnoise=lambda t, z: 1 + 0.18 * math.sin(3 * t + z * 9))
        fire.lathe('XM_Fire_Core', [(r * 0.55, 0.01), (r * 0.45, h * 0.3), (0.0, h * 0.62)], (c[0], c[1] - 0.04, c[2]), seg=6)
    for k in range(10):
        fire.sphere('XM_Ember_Fire', [cx + RNG.uniform(-0.35, 0.35), y0 + RNG.uniform(0.15, 0.45), Z + 0.15], RNG.uniform(0.03, 0.06), seg=6, rings=4, scale=(1.2, 1.2, 0.5))
    # hearth slab
    hearth.cbox('XM_Stone_Light', (x0 - 0.12, HEARTH_Y0, Z), (x1 + 0.12, y0 + 0.05, Z + 0.13), b=0.025)
    for k, xx in enumerate(np.linspace(x0 - 0.05, x1 + 0.05, 6)[:-1]):
        pass
    # mantel shelf
    mz = Z + 1.42
    g.cbox('XM_Beam_Honey', (x0 - 0.18, y0 - 0.26, mz), (x1 + 0.18, y0 + 0.02, mz + 0.17), b=0.025)
    for s in (-1, 1):
        g.beam('XM_Beam_Honey', [cx + s * 1.05, y0 - 0.02, mz - 0.35], [cx + s * 1.05, y0 - 0.22, mz - 0.01], 0.1, 0.1, b=0.012)
    # mantel decor: garland with bulbs, candles, stockings, wreath above, two small lanterns
    path = [[x, y0 - 0.2 - 0.02 * math.sin(x * 5), mz + 0.21] for x in np.linspace(x0 - 0.1, x1 + 0.1, 14)]
    garland(decor, path, r=0.06, seed=17, bulb_gap=0.22, droop=0.02)
    for s in (-1, 1):
        decor.sphere('XM_Garland_Fir', [x0 - 0.12 if s < 0 else x1 + 0.12, y0 - 0.22, mz + 0.05], 0.09, seg=7, rings=5, scale=(1, 1, 1.8))
    for (dx, h) in ((-0.82, 0.24), (-0.66, 0.17), (0.7, 0.21)):
        c = (cx + dx, y0 - 0.12, mz + 0.17)
        decor.lathe('XM_Candle_Wax', [(0.04, 0), (0.04, h)], c, seg=8)
        decor.lathe('XM_Candle_Flame', [(0.0, h), (0.022, h + 0.03), (0.0, h + 0.09)], c, seg=6, cap_bot=False, cap_top=False)
        decor.lathe('XM_Brass', [(0.07, -0.005), (0.07, 0.015), (0.03, 0.02), (0.03, 0.04)], c, seg=10)
    for k, (dx, mat) in enumerate(((-0.5, 'XM_Sock_Red'), (0.0, 'XM_Sock_Cream'), (0.5, 'XM_Sock_Green'))):
        top_ = np.array([cx + dx, y0 - 0.27, mz + 0.02])
        leg = [top_ - [0, 0, 0.02], top_ - [0, 0, 0.3], top_ - [0, 0, 0.45]]
        decor.tube(mat, leg, [0.075, 0.072, 0.07], seg=8, flat=0.55, up=(0, 1, 0))
        decor.tube(mat, [top_ - [0, 0, 0.45], top_ - [-0.12, 0, 0.5]], [0.07, 0.06], seg=8, flat=0.55, up=(0, 1, 0))
        decor.tube('XM_Sock_Cream' if mat != 'XM_Sock_Cream' else 'XM_Sock_Red', [top_ + [0, 0, 0.02], top_ - [0, 0, 0.08]], [0.085, 0.085], seg=8, flat=0.55, up=(0, 1, 0))
        decor.beam('XM_Brass', top_ + [0, 0.04, 0.04], top_ + [0, 0.18, 0.04], 0.02, 0.02)
    wreath(decor, [cx, y0 - 0.07, mz + 0.85], R=0.34, facing=(0, -1, 0), seed=23)
    for s in (-1, 1):
        lantern_small(decor, [cx + s * 0.98, y0 - 0.12, mz + 0.17])

def lantern_small(g, base):
    b = np.asarray(base, float)
    g.cbox('XM_Iron_Black', b + [-0.08, -0.08, 0], b + [0.08, 0.08, 0.03], b=0.008)
    g.cbox('XM_Lantern_Glow', b + [-0.06, -0.06, 0.03], b + [0.06, 0.06, 0.2], b=0.0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.box('XM_Iron_Black', b + [sx * 0.065 - 0.012, sy * 0.065 - 0.012, 0.03], b + [sx * 0.065 + 0.012, sy * 0.065 + 0.012, 0.21])
    g.lathe('XM_Iron_Black', [(0.1, 0.0), (0.02, 0.08)], b + [0, 0, 0.21], seg=4)
    g.torus('XM_Iron_Black', b + [0, 0, 0.32], 0.035, 0.008, seg=8, tseg=4, axis_R=rotx(math.pi / 2))

def tree(g, bulbs):
    cx, cy = IX0 + 0.98, IY1 - 0.92
    base = Z
    # wooden crate stand + red skirt
    g.cbox('XM_Beam_Honey', (cx - 0.32, cy - 0.32, base), (cx + 0.32, cy + 0.32, base + 0.34), b=0.025)
    for k in range(3):
        g.box('XM_Beam_Dark', (cx - 0.325, cy - 0.325, base + 0.07 + k * 0.1), (cx + 0.325, cy + 0.325, base + 0.085 + k * 0.1), faces='xXyY')
    g.lathe('XM_Log_Dark', [(0.07, base + 0.3), (0.07, base + 0.55)], (cx, cy, 0), seg=8)
    tiers = [(0.95, 0.45, 1.05), (0.8, 0.9, 1.45), (0.64, 1.35, 1.85), (0.48, 1.8, 2.25), (0.32, 2.2, 2.62)]
    for i, (r, z0, z1) in enumerate(tiers):
        f = lambda t, z, i=i: 1 + 0.13 * math.sin(9 * t + i) + 0.05 * math.sin(23 * t)
        g.lathe('XM_Tree_Fir' if i % 2 == 0 else 'XM_Tree_FirLight', [(r, base + z0), (r * 0.92, base + z0 + 0.06), (r * 0.45, base + (z0 + z1) / 2 + 0.08), (0.04, base + z1)], (cx, cy, 0), seg=18, rnoise=f, cap_bot=True)
    # ornaments on the cone surfaces + bulbs on a spiral
    rr = np.random.default_rng(12)
    for i, (r, z0, z1) in enumerate(tiers):
        nb = int(10 * r)
        for k in range(nb):
            t = rr.uniform(0, 2 * math.pi)
            if -2.2 < t - math.pi < -0.4 and False: continue
            zz = rr.uniform(z0 + 0.05, z0 + 0.25)
            rad = r * (1 - (zz - z0) / (z1 - z0 + 0.3)) * 0.97
            p = [cx + rad * math.cos(t), cy + rad * math.sin(t), base + zz - 0.04]
            mat = ['XM_Ornament_Red', 'XM_Ornament_Gold', 'XM_Ornament_Cream'][k % 3]
            g.sphere(mat, p, rr.uniform(0.045, 0.065), seg=8, rings=6)
    for k in range(70):
        t = k * 0.55; zz = 0.5 + k * 0.03
        if zz > 2.55: break
        rad = None
        for (r, z0, z1) in tiers:
            if z0 <= zz <= z1 + 0.05: rad = r * (1 - (zz - z0) / (z1 - z0 + 0.25)) + 0.02
        if rad is None: continue
        bulbs.sphere('XM_Tree_Bulb', [cx + rad * math.cos(t), cy + rad * math.sin(t), base + zz], 0.03, seg=5, rings=3)
    star5(g, [cx, cy - 0.02, base + 2.78], r=0.18, depth=0.06, facing=(0.25, -1, 0))
    # gifts under the tree (part of the interior set dressing)
    for (dx, dy, s, h, m1, m2) in ((0.55, -0.45, 0.32, 0.26, 'XM_Paper_Red', 'XM_Ribbon_Gold'), (0.15, -0.7, 0.26, 0.22, 'XM_Paper_Green', 'XM_Bow_Red'), (0.8, -0.05, 0.24, 0.3, 'XM_Paper_Cream', 'XM_Bow_Red')):
        gift(g, (cx + dx, cy + dy, base), s, h, m1, m2, rot=dx * 2)

def gift(g, c, s, h, mat, rib, rot=0.0):
    R = rotz(rot); c = np.asarray(c, float)
    g.obox(mat, c + [0, 0, h / 2], (s, s * 0.9, h), R, b=0.012)
    g.obox(rib, c + [0, 0, h / 2], (s + 0.01, 0.04, h + 0.01), R)
    g.obox(rib, c + [0, 0, h / 2], (0.04, s * 0.9 + 0.01, h + 0.01), R)
    bow(g, c + [0, 0, h + 0.04], size=s * 0.32, facing=R @ np.array([0, -1, 0.6]) / 1.166, mat=rib if rib != 'XM_Ribbon_Gold' else 'XM_Bow_Red', tails=False)

def ornament_box(g):
    c = np.array([IX0 + 2.05, IY1 - 1.55, Z])
    g.cbox('XM_Beam_Honey', c + [-0.28, -0.2, 0], c + [0.28, 0.2, 0.2], b=0.015)
    g.box('XM_Soot', c + [-0.24, -0.16, 0.12], c + [0.24, 0.16, 0.2], faces='Z')
    for k in range(6):
        i, j = k % 3, k // 3
        g.sphere(['XM_Ornament_Red', 'XM_Ornament_Gold', 'XM_Ornament_Cream'][k % 3], c + [-0.15 + i * 0.15, -0.07 + j * 0.14, 0.22], 0.055, seg=8, rings=5)

def gift_bench(g, lamp):
    """wrapping table along the left wall (front), two stools, paper rolls, gifts, desk lamp"""
    x0, x1 = IX0 + 0.02, IX0 + 0.92; y0, y1 = IY0 + 0.75, IY0 + 2.65
    zt = Z + 0.78
    g.cbox('XM_Beam_Honey', (x0, y0, zt - 0.06), (x1, y1, zt), b=0.02)
    for (x, y) in ((x0 + 0.08, y0 + 0.08), (x1 - 0.08, y0 + 0.08), (x0 + 0.08, y1 - 0.08), (x1 - 0.08, y1 - 0.08)):
        g.cbox('XM_Beam_Honey', (x - 0.045, y - 0.045, Z), (x + 0.045, y + 0.045, zt - 0.06), b=0.01)
    g.cbox('XM_Beam_Honey', (x0 + 0.06, y0 + 0.1, Z + 0.18), (x1 - 0.06, y1 - 0.1, Z + 0.21), b=0.008)
    # runner (red, embroidered ends)
    g.box('XM_Plaid_Red', (x0 + 0.25, y0 - 0.02, zt), (x0 + 0.62, y1 + 0.02, zt + 0.008))
    for yy in (y0 - 0.02, y1 + 0.02):
        g.box('XM_Plaid_Red', (x0 + 0.25, yy - 0.006, zt - 0.22), (x0 + 0.62, yy + 0.006, zt + 0.008))
    # paper rolls lying on the table + a ribbon spool + two gifts
    for k, mat in enumerate(('XM_Paper_Red', 'XM_Paper_Green', 'XM_Paper_Cream')):
        y = y0 + 0.25 + k * 0.12
        g.beam(mat, [x0 + 0.15, y, zt + 0.05], [x1 - 0.12, y, zt + 0.05], 0.09, 0.09, b=0.03)
    g.lathe('XM_Ribbon_Gold', [(0.07, zt), (0.07, zt + 0.06)], (x0 + 0.45, y0 + 0.75, 0), seg=10)
    gift(g, (x0 + 0.45, y0 + 1.15, zt), 0.3, 0.2, 'XM_Paper_Green', 'XM_Bow_Red', rot=0.3)
    gift(g, (x0 + 0.5, y0 + 1.5, zt), 0.22, 0.16, 'XM_Paper_Red', 'XM_Ribbon_Gold', rot=-0.4)
    # desk lamp (brass) — its shade is a warm lamp pool in the game
    lb = np.array([x0 + 0.2, y1 - 0.25, zt])
    g.lathe('XM_Brass', [(0.09, 0), (0.09, 0.02), (0.02, 0.03), (0.02, 0.36)], lb, seg=10)
    lamp.lathe('XM_Lamp_Shade', [(0.13, 0.0), (0.06, 0.13), (0.0, 0.14)], lb + [0.0, 0, 0.32], seg=12, cap_bot=False)
    # stools
    for y in (y0 + 0.55, y1 - 0.55):
        c = np.array([x1 + 0.42, y, Z])
        g.lathe('XM_Beam_Honey', [(0.18, 0.44), (0.18, 0.48)], c, seg=12)
        g.lathe('XM_Sofa_Red', [(0.17, 0.48), (0.16, 0.52), (0.1, 0.545), (0.0, 0.55)], c, seg=12)
        for a in range(4):
            t = math.pi / 4 + a * math.pi / 2
            g.beam('XM_Beam_Honey', c + [0.07 * math.cos(t), 0.07 * math.sin(t), 0.44], c + [0.16 * math.cos(t), 0.16 * math.sin(t), 0.0], 0.04, 0.04, b=0.008)
        g.torus('XM_Beam_Honey', c + [0, 0, 0.18], 0.125, 0.015, seg=12, tseg=4)
    # basket of wrapping-paper rolls in the front corner
    c = np.array([IX0 + 0.3, IY0 + 0.38, Z])
    g.lathe('XM_Basket_Cane', [(0.17, 0.0), (0.21, 0.36), (0.22, 0.38)], c, seg=12, cap_top=False)
    g.lathe('XM_Basket_Cane', [(0.205, 0.36), (0.205, 0.0)], c, seg=12, cap_top=False, cap_bot=False)
    for k, (dx, dy, mat) in enumerate(((0.06, 0.03, 'XM_Paper_Red'), (-0.06, 0.05, 'XM_Paper_Green'), (0.0, -0.07, 'XM_Paper_Gold'), (0.08, -0.06, 'XM_Paper_Cream'))):
        g.beam(mat, c + [dx, dy, 0.05], c + [dx * 2.2, dy * 2.2, 0.82 - k * 0.05], 0.07, 0.07, b=0.025)

def sofa_corner(sofa, rug, table):
    cx, cy = CX, IY0 + 4.35          # sofa centre: faces the room / camera (-Y), fireplace behind it
    W, D = 2.3, 0.95
    x0, x1, y0, y1 = cx - W / 2, cx + W / 2, cy - D / 2, cy + D / 2
    sofa.cbox('XM_Sofa_Red', (x0 + 0.05, y0 + 0.05, Z + 0.08), (x1 - 0.05, y1, Z + 0.42), b=0.06)
    sofa.cbox('XM_Sofa_Red', (x0 + 0.1, y1 - 0.28, Z + 0.4), (x1 - 0.1, y1, Z + 0.9), b=0.08)
    for s in (-1, 1):
        xa = x0 if s < 0 else x1 - 0.24
        sofa.cbox('XM_Sofa_Red', (xa, y0 + 0.02, Z + 0.08), (xa + 0.24, y1, Z + 0.66), b=0.09)
    for k in range(2):
        xa = x0 + 0.26 + k * (W - 0.52) / 2
        sofa.cbox('XM_Sofa_Red', (xa + 0.01, y0 + 0.02, Z + 0.4), (xa + (W - 0.52) / 2 - 0.01, y1 - 0.26, Z + 0.53), b=0.06)
    for (x, y) in ((x0 + 0.12, y0 + 0.12), (x1 - 0.12, y0 + 0.12), (x0 + 0.12, y1 - 0.12), (x1 - 0.12, y1 - 0.12)):
        sofa.lathe('XM_Beam_Dark', [(0.04, Z), (0.05, Z + 0.09)], (x, y, 0), seg=8)
    # pillows + throw
    sofa.obox('XM_Plaid_Green', [x0 + 0.48, y1 - 0.33, Z + 0.72], (0.42, 0.14, 0.38), rotz(0.15) @ rotx(-0.25), b=0.06)
    sofa.obox('XM_Fabric_Cream', [x1 - 0.5, y1 - 0.33, Z + 0.72], (0.4, 0.14, 0.36), rotz(-0.12) @ rotx(-0.25), b=0.06)
    sofa.obox('XM_Plaid_Red', [x1 - 0.85, y1 - 0.32, Z + 0.69], (0.34, 0.13, 0.3), rotz(-0.05) @ rotx(-0.22), b=0.05)
    sofa.obox('XM_Fabric_Cream', [x0 + 0.13, (y0 + y1) / 2 - 0.05, Z + 0.62], (0.32, D - 0.02, 0.06), roty(0.0), b=0.02)
    sofa.obox('XM_Fabric_Cream', [x0 + 0.02, (y0 + y1) / 2 - 0.05, Z + 0.38], (0.05, D * 0.8, 0.5), None, b=0.02)
    # round rug: cream centre + red border (separate rings, no overlap)
    rc = (cx, cy - 1.15)
    rug.lathe('XM_Rug_Cream', [(1.38, Z + 0.004), (1.38, Z + 0.016)], (rc[0], rc[1], 0), seg=40, cap_bot=False)
    rug.lathe('XM_Rug_Red', [(1.62, Z + 0.003), (1.62, Z + 0.012), (1.6, Z + 0.015)], (rc[0], rc[1], 0), seg=40, cap_bot=False, cap_top=False)
    ring = []
    for k in range(41):
        t = 2 * math.pi * k / 40
        ring.append((t,))
    th = np.linspace(0, 2 * np.pi, 41)
    for a, b in zip(th[:-1], th[1:]):
        rug.face('XM_Rug_Red', [[rc[0] + 1.38 * math.cos(a), rc[1] + 1.38 * math.sin(a), Z + 0.0135], [rc[0] + 1.6 * math.cos(a), rc[1] + 1.6 * math.sin(a), Z + 0.015],
                                [rc[0] + 1.6 * math.cos(b), rc[1] + 1.6 * math.sin(b), Z + 0.015], [rc[0] + 1.38 * math.cos(b), rc[1] + 1.38 * math.sin(b), Z + 0.0135]])
    for k in range(8):
        t = 2 * math.pi * k / 8 + 0.2
        rug.face('XM_Rug_Red', [[rc[0] + 1.0 * math.cos(t - 0.07), rc[1] + 1.0 * math.sin(t - 0.07), Z + 0.0168], [rc[0] + 1.2 * math.cos(t), rc[1] + 1.2 * math.sin(t), Z + 0.0168],
                                [rc[0] + 1.0 * math.cos(t + 0.07), rc[1] + 1.0 * math.sin(t + 0.07), Z + 0.0168], [rc[0] + 0.8 * math.cos(t), rc[1] + 0.8 * math.sin(t), Z + 0.0168]])
    # round coffee table + candles + mug + berries
    tc = np.array([rc[0], rc[1] + 0.1, Z])
    table.lathe('XM_Beam_Honey', [(0.52, 0.36), (0.55, 0.38), (0.55, 0.43), (0.5, 0.45)], tc, seg=20)
    table.lathe('XM_Beam_Honey', [(0.4, 0.3), (0.42, 0.36)], tc, seg=16, cap_bot=False)
    for a in range(4):
        t = math.pi / 4 + a * math.pi / 2
        table.cbox('XM_Beam_Honey', tc + [0.3 * math.cos(t) - 0.04, 0.3 * math.sin(t) - 0.04, 0.0], tc + [0.3 * math.cos(t) + 0.04, 0.3 * math.sin(t) + 0.04, 0.36], b=0.012)
    table.lathe('XM_Garland_Fir', [(0.2, 0.45), (0.19, 0.47)], tc, seg=14, cap_bot=False)
    for (dx, dy, h) in ((-0.07, 0.03, 0.16), (0.08, 0.04, 0.12), (0.0, -0.08, 0.2)):
        c = tc + [dx, dy, 0.45]
        table.lathe('XM_Candle_Wax', [(0.04, 0), (0.04, h)], c, seg=8)
        table.lathe('XM_Candle_Flame', [(0.0, h), (0.02, h + 0.03), (0.0, h + 0.08)], c, seg=6, cap_bot=False, cap_top=False)
    for k in range(7):
        a = k * 0.9
        table.sphere('XM_Berry_Red', tc + [0.2 * math.cos(a), 0.2 * math.sin(a), 0.49], 0.025, seg=6, rings=4)
    m = tc + [0.33, -0.15, 0.45]
    table.lathe('XM_Mug_Red', [(0.05, 0), (0.055, 0.11), (0.0, 0.11)], m, seg=10, cap_top=False)
    table.lathe('XM_Soot', [(0.048, 0.1), (0.0, 0.1)], m, seg=10, cap_bot=False, cap_top=False)
    table.torus('XM_Mug_Red', m + [0.07, 0, 0.055], 0.032, 0.01, seg=8, tseg=4, axis_R=rotx(math.pi / 2))

def easel(g):
    c = np.array([IX1 - 1.55, IY1 - 1.45, Z])
    yaw = math.radians(-28)
    R = rotz(yaw)
    def P(x, y, z): return c + R @ np.array([x, y, z])
    for s in (-1, 1):
        g.beam('XM_Beam_Honey', P(s * 0.38, 0.12, 0), P(s * 0.12, 0.0, 1.75), 0.045, 0.045, b=0.01)
    g.beam('XM_Beam_Honey', P(0, 0.62, 0), P(0, 0.05, 1.65), 0.045, 0.045, b=0.01)
    g.beam('XM_Beam_Honey', P(-0.32, -0.03, 0.72), P(0.32, -0.03, 0.72), 0.06, 0.07, b=0.01)
    # canvas with a little painted snowy fir
    cv = P(0, -0.07, 1.12)
    g.obox('XM_Canvas_White', cv, (0.66, 0.035, 0.78), R @ rotx(math.radians(-8)), b=0.008)
    Rc = R @ rotx(math.radians(-8))
    g.obox('XM_Paint_Sky', cv + Rc @ np.array([0, -0.02, 0.12]), (0.58, 0.004, 0.42), Rc)
    for k, (w, dz) in enumerate(((0.36, -0.12), (0.27, 0.0), (0.18, 0.11))):
        tri = [cv + Rc @ np.array([-w / 2, -0.024, dz - 0.07]), cv + Rc @ np.array([w / 2, -0.024, dz - 0.07]), cv + Rc @ np.array([0, -0.024, dz + 0.1])]
        g.face('XM_Paint_Fir', order_face(tri, Rc @ np.array([0, -1, 0])))
    g.obox('XM_Canvas_White', cv + Rc @ np.array([0, -0.022, -0.28]), (0.58, 0.004, 0.12), Rc)
    # stool + paint jar
    s = c + R @ np.array([0.55, -0.45, 0])
    g.lathe('XM_Beam_Honey', [(0.16, 0.42), (0.16, 0.46)], s, seg=12)
    for a in range(3):
        t = a * 2 * math.pi / 3
        g.beam('XM_Beam_Honey', s + [0.08 * math.cos(t), 0.08 * math.sin(t), 0.42], s + [0.15 * math.cos(t), 0.15 * math.sin(t), 0], 0.035, 0.035, b=0.008)
    g.lathe('XM_Pot_Clay', [(0.05, 0.46), (0.05, 0.56)], s, seg=8)
    for k, mat in enumerate(('XM_Bow_Red', 'XM_Paint_Fir', 'XM_Paint_Sky')):
        g.beam('XM_Beam_Dark', s + [0.0 + (k - 1) * 0.02, 0, 0.5], s + [(k - 1) * 0.04, 0.01, 0.72], 0.012, 0.012)

def dresser(g):
    """card dresser against the right wall (front half): drawers + a stepped card display + plant"""
    x1 = IX1 - 0.02; x0 = x1 - 0.55; y0, y1 = IY0 + 0.6, IY0 + 2.05
    zt = Z + 0.92
    g.cbox('XM_Beam_Honey', (x0, y0, Z + 0.06), (x1, y1, zt), b=0.02)
    g.cbox('XM_Beam_Honey', (x0 - 0.03, y0 - 0.03, zt), (x1 + 0.0, y1 + 0.03, zt + 0.05), b=0.012)
    for k in range(3):
        z0 = Z + 0.12 + k * 0.26
        for j in range(2):
            ya = y0 + 0.06 + j * (y1 - y0 - 0.12) / 2
            g.cbox('XM_Beam_Dark', (x0 - 0.02, ya + 0.02, z0 + 0.02), (x0 + 0.02, ya + (y1 - y0 - 0.12) / 2 - 0.02, z0 + 0.22), b=0.008)
            g.sphere('XM_Brass', [x0 - 0.035, ya + (y1 - y0 - 0.12) / 4, z0 + 0.12], 0.022, seg=6, rings=4)
    for (x, y) in ((x0 + 0.05, y0 + 0.05), (x0 + 0.05, y1 - 0.05), (x1 - 0.05, y0 + 0.05), (x1 - 0.05, y1 - 0.05)):
        g.cbox('XM_Beam_Dark', (x - 0.04, y - 0.04, Z), (x + 0.04, y + 0.04, Z + 0.07), b=0.01)
    # stepped card rack
    for k in range(3):
        g.cbox('XM_Beam_Honey', (x1 - 0.2 - k * 0.1, y0 + 0.15, zt + 0.05), (x1 - 0.1 - k * 0.1, y1 - 0.15, zt + 0.12 + k * 0.12), b=0.01)
    rr = np.random.default_rng(5)
    for k in range(3):
        for j in range(5):
            y = y0 + 0.25 + j * 0.22
            mat = ['XM_Card_Mix', 'XM_Card_Red', 'XM_Card_Green'][(k + j) % 3]
            c = np.array([x1 - 0.17 - k * 0.1, y, zt + 0.12 + k * 0.12 + 0.09])
            g.obox(mat, c, (0.02, 0.16, 0.2), rotz(math.pi / 2) @ rotx(math.radians(-12)) @ rotz(-math.pi / 2) if False else roty(math.radians(-14)))
    # plant on the dresser
    pot = np.array([x1 - 0.22, y1 - 0.12, zt + 0.05])
    plant(g, pot, 0.11, 0.2)

def plant(g, c, r, h):
    c = np.asarray(c, float)
    g.lathe('XM_Pot_Clay', [(r * 0.75, 0), (r, h), (r * 1.08, h + 0.02), (r * 0.95, h + 0.03)], c, seg=10)
    rr = np.random.default_rng(int(abs(c[0] * 100 + c[1] * 7)) % 999)
    for k in range(7):
        t = k * 2 * math.pi / 7 + rr.uniform(-0.2, 0.2)
        p = c + [r * 0.55 * math.cos(t), r * 0.55 * math.sin(t), h + 0.12 + rr.uniform(0, 0.08)]
        g.sphere('XM_Plant_Leaf' if k % 2 else 'XM_Plant_LeafDark', p, r * rr.uniform(0.75, 1.0), seg=6, rings=4, scale=(1.2, 1.2, 0.8))
    g.sphere('XM_Plant_Leaf', c + [0, 0, h + 0.26], r * 0.9, seg=7, rings=5, scale=(1, 1, 0.9))

def trailing_plant(g, c, r, h, side_dir):
    plant(g, c, r, h)
    d = np.asarray(side_dir, float)
    for k in range(3):
        p0 = np.asarray(c, float) + [0, 0, h] + d * r * 0.8 + [0, 0.05 * (k - 1), 0]
        path = [p0 + d * 0.04 * i + np.array([0, 0.02 * (k - 1) * i, -0.13 * i]) for i in range(5)]
        for p in path[1:]:
            g.sphere('XM_Plant_LeafDark', p, 0.045, seg=6, rings=4, scale=(1.2, 1.2, 0.7))

def shelves(g):
    """small wall shelves with plants (left wall above the bench, right wall above the dresser, back wall right of the window)"""
    for (x0, x1, y0, y1, z, pots) in ((IX0, IX0 + 0.28, IY0 + 2.95, IY0 + 3.85, Z + 2.05, [(IX0 + 0.15, IY0 + 3.2), (IX0 + 0.15, IY0 + 3.6)]),
                                      (IX1 - 0.28, IX1, IY0 + 0.75, IY0 + 1.75, Z + 2.0, [(IX1 - 0.15, IY0 + 1.05), (IX1 - 0.15, IY0 + 1.45)])):
        g.cbox('XM_Beam_Honey', (x0, y0, z), (x1, y1, z + 0.05), b=0.01)
        for yy in (y0 + 0.12, y1 - 0.12):
            xa = x0 + 0.02 if x0 < 0 or abs(x0 - IX0) < 0.01 else x1 - 0.06
            g.beam('XM_Beam_Dark', [xa + 0.02, yy, z], [xa + 0.02, yy, z - 0.22], 0.03, 0.04)
        for k, (px, py) in enumerate(pots):
            if k == 0: trailing_plant(g, (px, py, z + 0.05), 0.085, 0.13, (-1 if px > CX else 1, 0, 0) if False else (0, 0, 0))
            else: plant(g, (px, py, z + 0.05), 0.075, 0.12)
    # back-wall shelf to the right of the right window
    x0, x1 = IX0 + 9.0, IX0 + 9.9
    z = Z + 2.1
    g.cbox('XM_Beam_Honey', (x0, IY1 - 0.26, z), (x1, IY1, z + 0.05), b=0.01)
    plant(g, (x0 + 0.25, IY1 - 0.13, z + 0.05), 0.08, 0.12)
    for k in range(3):
        g.cbox(['XM_Card_Red', 'XM_Card_Green', 'XM_Card_Mix'][k], (x0 + 0.5 + k * 0.1, IY1 - 0.2, z + 0.05), (x0 + 0.58 + k * 0.1, IY1 - 0.04, z + 0.27 - k * 0.03), b=0.005)

def sconces(B, iron):
    """wall sconces (iron arm + warm glass) — node names Pendant_Sconce?_Bulb make the game add warm light pools"""
    spots = [((CX - 1.72, IY1, Z + 1.95), (0, -1, 0), 'A'), ((CX + 1.72, IY1, Z + 1.95), (0, -1, 0), 'B'),
             ((IX0, IY0 + 4.75, Z + 1.95), (1, 0, 0), 'C'), ((IX1, IY0 + 3.0, Z + 1.95), (-1, 0, 0), 'D')]
    for (p, n, k) in spots:
        p = np.asarray(p, float); n = np.asarray(n, float)
        iron.cbox('XM_Iron_Black', *bbox_pts([p + n * 0.0 - [0.06, 0.06, 0.12] * (1 - abs(n)), p + n * 0.03 + [0.06, 0.06, 0.12] * (1 - abs(n))]), b=0.008)
        iron.beam('XM_Iron_Black', p + n * 0.02, p + n * 0.22 + [0, 0, 0.08], 0.025, 0.025)
        c = p + n * 0.24 + [0, 0, 0.0]
        B[k].lathe('XM_Lantern_Glow', [(0.06, -0.08), (0.075, 0.04), (0.06, 0.1)], c, seg=8)
        iron.lathe('XM_Iron_Black', [(0.09, 0.1), (0.04, 0.17), (0.0, 0.18)], c, seg=8)
        iron.lathe('XM_Iron_Black', [(0.0, -0.12), (0.07, -0.08)], c, seg=8, cap_top=False)
        if k in ('A', 'B'):
            bow(iron, p + n * 0.05 + [0, 0, 0.42], size=0.16, facing=n, tails=True)

def beam_garland(g):
    """fir garland with warm bulbs along the inner top beams (back + both sides), bows at the posts"""
    zt = WALL_TOP - 0.22
    runs = [((IX0 + 0.1, IY1 - 0.08), (IX1 - 0.1, IY1 - 0.08), 5), ((IX0 + 0.08, IY0 + 0.15), (IX0 + 0.08, IY1 - 0.1), 3), ((IX1 - 0.08, IY1 - 0.1), (IX1 - 0.08, IY0 + 0.15), 3)]
    for (a, b, nsw) in runs:
        pts_all = []
        for k in range(nsw):
            p0 = np.array([a[0] + (b[0] - a[0]) * k / nsw, a[1] + (b[1] - a[1]) * k / nsw, zt]); p1 = np.array([a[0] + (b[0] - a[0]) * (k + 1) / nsw, a[1] + (b[1] - a[1]) * (k + 1) / nsw, zt])
            seg = catenary(p0, p1, 0.2, 12)
            pts_all += seg if not pts_all else seg[1:]
            if k < nsw: bow(g, p0 + [0, 0, 0.02], size=0.17, facing=(np.array([0, -1, 0]) if abs(a[1] - b[1]) < 0.01 else np.array([1 if a[0] < CX else -1, 0, 0])), tails=True)
        garland(g, pts_all, r=0.065, seed=int(a[0] * 10 + a[1]) % 77, bulb_gap=0.32)

def skirting(g):
    for (lo, hi) in (((IX0, IY1 - 0.04, Z), (IX1, IY1, Z + 0.12)), ((IX0, IY0 - WT, Z), (IX0 + 0.04, IY1, Z + 0.12)), ((IX1 - 0.04, IY0 - WT, Z), (IX1, IY1, Z + 0.12))):
        g.cbox('XM_Beam_Dark', lo, hi, b=0.008)


def hearth_props(g):
    """firewood basket (right of the hearth) + iron tool stand (left)"""
    c = np.array([FIRE_X1 + 0.45, HEARTH_Y0 + 0.25, Z])
    g.lathe('XM_Basket_Cane', [(0.22, 0.0), (0.26, 0.3), (0.27, 0.32)], c, seg=12, cap_top=False)
    g.lathe('XM_Basket_Cane', [(0.255, 0.3), (0.255, 0.02)], c, seg=12, cap_top=False, cap_bot=False)
    g.box('XM_Soot', c + [-0.22, -0.22, 0.25], c + [0.22, 0.22, 0.25], faces='Z')
    rr = np.random.default_rng(9)
    for k in range(6):
        a = rr.uniform(0, math.pi); p = c + [0.08 * math.cos(k * 1.1), 0.08 * math.sin(k * 1.1), 0.3 + 0.07 * (k // 3)]
        d = np.array([math.cos(a), math.sin(a), 0.15])
        g.beam('XM_Log_Dark', p - d * 0.22, p + d * 0.22, 0.09, 0.09, b=0.03)
    for s_ in (-1, 1):
        g.beam('XM_Beam_Dark', c + [s_ * 0.26, 0, 0.3], c + [s_ * 0.2, 0, 0.5], 0.03, 0.03)
    g.beam('XM_Beam_Dark', c + [-0.2, 0, 0.5], c + [0.2, 0, 0.5], 0.03, 0.03)
    t = np.array([FIRE_X0 - 0.4, HEARTH_Y0 + 0.25, Z])
    g.lathe('XM_Iron_Black', [(0.12, 0.0), (0.12, 0.02), (0.02, 0.03), (0.02, 0.72), (0.0, 0.78)], t, seg=10)
    for k, a in enumerate((0.0, 2.1, 4.2)):
        p = t + [0.07 * math.cos(a), 0.07 * math.sin(a), 0.0]
        g.beam('XM_Iron_Black', t + [0, 0, 0.68], p + [0, 0, 0.06], 0.015, 0.015)
        g.cbox('XM_Iron_Black', p + [-0.03, -0.01, 0.02], p + [0.03, 0.01, 0.12], b=0.004)
    g.cbox('XM_Brass', t + [-0.06, -0.06, 0.66], t + [0.06, 0.06, 0.69], b=0.006)

def reading_nook(g, lamp):
    """armchair angled toward the fireplace (right half), small side table with cocoa, floor lamp"""
    c = np.array([IX1 - 2.6, IY0 + 4.2, Z]); R = rotz(math.radians(35))
    def P(x, y, z): return c + R @ np.array([x, y, z])
    g.obox('XM_Plaid_Green', P(0, 0, 0.3), (0.85, 0.8, 0.26), R, b=0.07)
    g.obox('XM_Plaid_Green', P(0, 0.33, 0.68), (0.85, 0.2, 0.62), R @ rotx(math.radians(-8)), b=0.08)
    for s in (-1, 1):
        g.obox('XM_Plaid_Green', P(s * 0.4, 0.0, 0.5), (0.16, 0.78, 0.36), R, b=0.07)
    g.obox('XM_Fabric_Cream', P(0, -0.02, 0.47), (0.62, 0.6, 0.1), R, b=0.04)
    g.obox('XM_Plaid_Red', P(0.1, 0.22, 0.75), (0.36, 0.12, 0.32), R @ rotx(math.radians(-18)), b=0.05)
    for (x, y) in ((-0.33, -0.3), (0.33, -0.3), (-0.33, 0.3), (0.33, 0.3)):
        g.lathe('XM_Beam_Dark', [(0.035, 0), (0.045, 0.17)], P(x, y, 0), seg=8)
    # side table
    t = P(0.75, -0.25, 0)
    g.lathe('XM_Beam_Honey', [(0.24, 0.52), (0.25, 0.54), (0.25, 0.57), (0.22, 0.58)], t, seg=14)
    g.lathe('XM_Beam_Honey', [(0.04, 0.0), (0.04, 0.53)], t, seg=8)
    g.lathe('XM_Beam_Honey', [(0.18, 0.0), (0.16, 0.04)], t, seg=12)
    m = t + [0.05, 0.02, 0.58]
    g.lathe('XM_Mug_Red', [(0.045, 0), (0.05, 0.1), (0.0, 0.1)], m, seg=10, cap_top=False)
    g.lathe('XM_Soot', [(0.043, 0.09), (0.0, 0.09)], m, seg=10, cap_bot=False, cap_top=False)
    g.lathe('XM_Fabric_Cream', [(0.05, 0.095), (0.035, 0.12), (0.0, 0.13)], m, seg=8, cap_bot=False)
    g.cbox('XM_Paper_Green', t + [-0.15, -0.08, 0.58], t + [0.0, 0.1, 0.62], b=0.006)
    # floor lamp
    f = P(-0.65, 0.35, 0)
    g.lathe('XM_Brass', [(0.15, 0.0), (0.15, 0.02), (0.025, 0.04), (0.02, 1.45)], f, seg=10)
    lamp.lathe('XM_Lamp_Shade', [(0.22, 1.36), (0.13, 1.62), (0.0, 1.63)], f, seg=12, cap_bot=False)

def wall_wreaths(g):
    """small wreaths + bows on the side-wall posts and above the side windows"""
    wreath(g, [IX0 + 0.06, IY0 + 4.55 - 0.0, Z + 2.86], R=0.2, facing=(1, 0, 0), seed=41, bow_at_bottom=True)
    wreath(g, [IX1 - 0.06, IY0 + 3.75, Z + 2.86], R=0.2, facing=(-1, 0, 0), seed=43, bow_at_bottom=True)
