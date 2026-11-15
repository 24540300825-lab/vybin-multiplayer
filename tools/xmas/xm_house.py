# Cottage shell (walls, stone plinth, half-timber frame, windows, door, porch, roof, chimney, snow, lights)
from xm_common import *

H_WALL = WALL_TOP - DECK            # wall height measured from the deck (3.75)
V_FLOOR = FLOOR - DECK              # 0.45
V_STONE = STONE_TOP - DECK          # 0.97
WIN = dict(v0=WIN_SILL - DECK, v1=WIN_TOP - DECK, w=WIN_W)
DOOR = dict(v0=V_FLOOR, v1=DOOR_TOP - DECK, w=DOOR_W)

def walls_def(front=True):
    """wall frames + openings. Side walls run between the inner faces of front/back (no coplanar corners);
    when the front wall is cut away (interior map) the side walls extend to the front face instead."""
    yS = HY0 if not front else HY0 + WT
    W = {}
    W['S'] = dict(F=WallFrame((HX0, HY0, DECK), (1, 0, 0), (0, -1, 0)), L=HX1 - HX0,
                  ops=[dict(u0=CX - HX0 - DOOR_W / 2, u1=CX - HX0 + DOOR_W / 2, v0=DOOR['v0'], v1=DOOR['v1'], arch=True, kind='door')] +
                      [dict(u0=x - HX0 - WIN_W / 2, u1=x - HX0 + WIN_W / 2, v0=WIN['v0'], v1=WIN['v1'], arch=True, kind='win') for x in (2.0, 8.0)])
    W['N'] = dict(F=WallFrame((HX1, HY1, DECK), (-1, 0, 0), (0, 1, 0)), L=HX1 - HX0,
                  ops=[dict(u0=HX1 - x - WIN_W / 2, u1=HX1 - x + WIN_W / 2, v0=WIN['v0'], v1=WIN['v1'], arch=True, kind='win') for x in (2.0, 8.0)])
    Lside = (HY1 - WT) - yS
    W['W'] = dict(F=WallFrame((HX0, HY1 - WT, DECK), (0, -1, 0), (-1, 0, 0)), L=Lside,
                  ops=[dict(u0=(HY1 - WT) - 4.55 - WIN_W / 2, u1=(HY1 - WT) - 4.55 + WIN_W / 2, v0=WIN['v0'], v1=WIN['v1'], arch=True, kind='win')])
    W['E'] = dict(F=WallFrame((HX1, yS, DECK), (0, 1, 0), (1, 0, 0)), L=Lside,
                  ops=[dict(u0=6.45 - yS - WIN_W / 2, u1=6.45 - yS + WIN_W / 2, v0=WIN['v0'], v1=WIN['v1'], arch=True, kind='win')])
    return W

# timber posts (u centres) per wall, chosen around the openings so no member crosses a window or the door
def post_us(key, L, ops):
    us = [0.11, L - 0.11]
    for o in ops:
        us += [o['u0'] - 0.2, o['u1'] + 0.2]
    if key == 'S': us += [4.62, 7.38]            # behind the porch posts (porch beam bears here)
    if key in ('W', 'E'): pass
    if key == 'N': us += [4.55, 7.45]            # either side of the chimney breast
    us = sorted(set(round(u, 3) for u in us))
    out = []
    for u in us:
        if not out or u - out[-1] > 0.45: out.append(u)
    return out

def half_timber(g, F, key, L, ops, inside=False):
    """exterior half-timbering (proud 5 cm) — sill beam on the stone, top plate, posts, rails under/over windows, braces in free bays.
    inside=True: the same logic on the inner face (posts + top beam + corner braces), proud into the room."""
    sgn = -1 if inside else 1
    w0 = -WT if inside else 0.0
    def B(u0, v0, u1, v1, d=0.055, wid=0.19, mat='XM_Beam_Honey'):
        p0 = F.p(u0, v0, w0 + sgn * d / 2); p1 = F.p(u1, v1, w0 + sgn * d / 2)
        g.beam(mat, p0, p1, d, wid, up=F.W, b=0.014)
    vb = V_FLOOR + 0.02 if inside else V_STONE
    vt = H_WALL
    # sill + top plate
    if not inside: B(-0.02, vb + 0.08, L + 0.02, vb + 0.08, wid=0.17, d=0.07)
    B(-0.02 if not inside else 0.0, vt - 0.1, L + 0.02 if not inside else L, vt - 0.1, wid=0.2, d=0.07)
    ps = post_us(key, L, ops)
    if inside: ps = [u for u in ps if 0.15 < u < L - 0.15] + [0.11, L - 0.11]
    ps = sorted(set(ps))
    for u in ps:
        hit = any(o['u0'] - 0.05 < u < o['u1'] + 0.05 and (o['v0'] < vt) for o in ops)
        if hit: continue
        B(u, vb + 0.16, u, vt - 0.2, wid=0.18 if 0.2 < u < L - 0.2 else 0.22)
    # rails below and above windows (between the jamb posts)
    for o in ops:
        if o['kind'] == 'win':
            B(o['u0'] - 0.29, o['v0'] - 0.09, o['u1'] + 0.29, o['v0'] - 0.09, wid=0.15)
        if o['kind'] == 'door' and not inside:
            pass
    # braces in free bays
    for a, b in zip(ps[:-1], ps[1:]):
        mid = (a + b) / 2
        if any(o['u0'] - 0.15 < bb < o['u1'] + 0.15 for o in ops for bb in (a + 0.1, mid, b - 0.1)): continue
        wdt = b - a
        if wdt < 0.7: continue
        v0, v1 = vb + 0.24, vt - 0.28
        if inside: v0 = max(v0, vt - 1.25)   # inside: only knee braces up high (keeps wall space free)
        if wdt > 1.45 and not inside:
            B(a + 0.09, v0, mid - 0.05, v1, wid=0.14); B(b - 0.09, v0, mid + 0.05, v1, wid=0.14)
            B(a + 0.09, (v0 + v1) / 2 + 0.05, b - 0.09, (v0 + v1) / 2 + 0.05, wid=0.13, d=0.045)
        elif not inside:
            B(a + 0.09, v0, b - 0.09, v1, wid=0.14)
        else:
            B(a + 0.09, v1 - 0.9, a + 0.75, v1, wid=0.13); B(b - 0.09, v1 - 0.9, b - 0.75, v1, wid=0.13)

def window_unit(gF, gG, gC, F, o, mode, frost=None):
    """arched window: green casing + inner frame ring + muntins + timber sill (+ snow), glass,
    mode 'ext' -> warm lit card + curtains + candles behind the glass;  'int' -> clear glass + inside curtains + inner sill."""
    u0, u1, v0, v1 = o['u0'], o['u1'], o['v0'], o['v1']; r = (u1 - u0) / 2; uc = (u0 + u1) / 2; sp = v1 - r
    fw = 0.085                                           # frame member
    wm = -WT * 0.42                                      # frame plane (inside the reveal)
    pts = arch_pts(uc, sp, r, 12)
    # inner frame ring (in the reveal)
    for (ua, va), (ub, vb) in zip(pts[:-1], pts[1:]):
        mu, mv = (ua + ub) / 2 - uc, (va + vb) / 2 - sp; nn = math.hypot(mu, mv); k = (nn - fw / 2) / nn
        gF.beam('XM_Frame_Pine', F.p(uc + (ua - uc) * (1 - fw / 2 / r), sp + (va - sp) * (1 - fw / 2 / r), wm),
                F.p(uc + (ub - uc) * (1 - fw / 2 / r), sp + (vb - sp) * (1 - fw / 2 / r), wm), 0.11, fw, up=F.W, b=0.0, ext=0.012)
    for u in (u0 + fw / 2, u1 - fw / 2):
        gF.beam('XM_Frame_Pine', F.p(u, v0, wm), F.p(u, sp, wm), 0.11, fw, up=F.U, b=0.01)
    gF.beam('XM_Frame_Pine', F.p(u0, v0 + fw / 2, wm), F.p(u1, v0 + fw / 2, wm), 0.11, fw, up=F.V, b=0.01)
    # muntins: centre bar, transom at the springline, two short arch spokes
    gF.beam('XM_Frame_Pine', F.p(uc, v0, wm), F.p(uc, v1 - 0.03, wm), 0.06, 0.05, up=F.U, b=0.008)
    gF.beam('XM_Frame_Pine', F.p(u0, sp, wm), F.p(u1, sp, wm), 0.06, 0.055, up=F.V, b=0.008)
    gF.beam('XM_Frame_Pine', F.p(u0, (v0 + sp) / 2, wm), F.p(u1, (v0 + sp) / 2, wm), 0.05, 0.04, up=F.V, b=0.006)
    for a in (math.radians(45), math.radians(135)):
        gF.beam('XM_Frame_Pine', F.p(uc, sp, wm), F.p(uc + r * math.cos(a) * 0.98, sp + r * math.sin(a) * 0.98, wm), 0.05, 0.045, up=F.W, b=0.006)
    # outer casing ring (proud) — the strong green band of the reference
    cw, cd = 0.13, 0.05
    if mode == 'ext' or True:
        for (ua, va), (ub, vb) in zip(pts[:-1], pts[1:]):
            s1 = 1 + cw / 2 / r
            gF.beam('XM_Frame_Pine', F.p(uc + (ua - uc) * s1, sp + (va - sp) * s1, cd / 2), F.p(uc + (ub - uc) * s1, sp + (vb - sp) * s1, cd / 2), cd, cw, up=F.W, b=0.0, ext=0.02)
        for u in (u0 - cw / 2, u1 + cw / 2):
            gF.beam('XM_Frame_Pine', F.p(u, v0 - 0.02, cd / 2), F.p(u, sp, cd / 2), cd, cw, up=F.U, b=0.012)
        # keystone
        gF.cbox('XM_Beam_Honey', *bbox_pts([F.p(uc - 0.09, v1 + 0.04, 0.0), F.p(uc + 0.09, v1 + 0.26, 0.08)]), b=0.015)
    # sill (outside) + snow
    sill0 = F.p(u0 - 0.2, v0 - 0.07, 0.17); sill1 = F.p(u1 + 0.2, v0 + 0.0, -0.06)
    gF.cbox('XM_Beam_Honey', *bbox_pts([sill0, sill1]), b=0.015)
    if frost is not None:
        nz = smooth_noise(int(abs(uc * 100)) % 997, 4)
        path = [F.p(u, v0 + 0.035, 0.07) for u in np.linspace(u0 - 0.12, u1 + 0.12, 12)]
        rad = [0.075 * (0.75 + 0.35 * (1 - abs(2 * t - 1)) + 0.12 * nz(t * 9)) for t in np.linspace(0, 1, 12)]
        frost.tube('XM_SnowFrost', path, rad, seg=8, flat=0.62, up=F.V)
    # glass
    gl = [F.p(u0, v0, wm - 0.01), F.p(u1, v0, wm - 0.01)] + [F.p(u, v, wm - 0.01) for (u, v) in pts[::-1]]
    P = np.array(gl); n = np.cross(P[1] - P[0], P[2] - P[0])
    if np.dot(n, F.W) < 0: P = P[::-1]
    gG.face('XM_WinGlass', P)
    if mode == 'ext':
        # lit room card (inside, at the inner face) with a deeper band low down + curtains + candles on the inner sill
        wc = -WT + 0.02
        card = [F.p(u0 - 0.05, v0 - 0.05, wc), F.p(u1 + 0.05, v0 - 0.05, wc)] + [F.p(uc + (u - uc) * 1.05, sp + (v - sp) * 1.05, wc) for (u, v) in pts[::-1]]
        P = np.array(card)
        if np.dot(np.cross(P[1] - P[0], P[2] - P[0]), F.W) < 0: P = P[::-1]
        gC.face('XM_WindowWarm', P)
        gC.face('XM_WindowWarmDeep', order_face([F.p(u0 - 0.04, v0 - 0.04, wc + 0.004), F.p(u1 + 0.04, v0 - 0.04, wc + 0.004), F.p(u1 + 0.04, v0 + 0.32, wc + 0.004), F.p(u0 - 0.04, v0 + 0.32, wc + 0.004)], F.W))
        for s in (-1, 1):
            ue = uc + s * (r - 0.02)
            cur = [F.p(ue, v0 + 0.02, wc + 0.06), F.p(ue - s * 0.34, v0 + 0.02, wc + 0.06), F.p(ue - s * 0.2, v0 + 0.55, wc + 0.06), F.p(ue - s * 0.30, sp + r * 0.75, wc + 0.06), F.p(ue, sp + r * 0.75, wc + 0.06)]
            gC.face('XM_Curtain_Red', order_face(cur, F.W))
        for k, du in enumerate((-0.32, 0.0, 0.3)):
            hc = (0.16, 0.22, 0.13)[k]
            c = F.p(uc + du, v0 + 0.02, wc + 0.13)
            gC.lathe('XM_Candle_Wax', [(0.032, 0), (0.032, hc)], c, seg=6)
            gC.lathe('XM_Candle_Flame', [(0.0, hc + 0.0), (0.018, hc + 0.025), (0.0, hc + 0.07)], c, seg=5, cap_bot=False, cap_top=False)
    else:
        # inside: deep timber sill + curtains on the room side
        si = F.p(u0 - 0.12, v0 - 0.06, -WT - 0.14); so = F.p(u1 + 0.12, v0 + 0.0, -WT + 0.02)
        gF.cbox('XM_Beam_Honey', *bbox_pts([si, so]), b=0.012)
        for s in (-1, 1):
            ue = uc + s * (r + 0.12)
            top = sp + r + 0.12
            path = [F.p(ue, top, -WT - 0.08), F.p(ue - s * 0.05, top - 0.6, -WT - 0.1), F.p(ue + s * 0.04, v0 + 0.35, -WT - 0.1), F.p(ue - s * 0.02, v0 - 0.05, -WT - 0.09)]
            gC.tube('XM_Curtain_Red', path, [0.1, 0.13, 0.11, 0.15], seg=7, flat=0.45, up=F.W)
        gC.beam('XM_Iron_Black', F.p(u0 - 0.35, sp + r + 0.15, -WT - 0.08), F.p(u1 + 0.35, sp + r + 0.15, -WT - 0.08), 0.03, 0.03)

def bbox_pts(ps):
    P = np.array(ps); return P.min(0), P.max(0)

def order_face(P, n):
    P = np.asarray(P, float)
    if np.dot(np.cross(P[1] - P[0], P[2] - P[0]), n) < 0: P = P[::-1]
    return P

def door_unit(gD, gF, F, o, frost=None):
    """arched cranberry plank door (closed), honey timber frame, small lit window, brass handle, wreath"""
    u0, u1, v0, v1 = o['u0'], o['u1'], o['v0'], o['v1']; r = (u1 - u0) / 2; uc = (u0 + u1) / 2; sp = v1 - r
    wd = -0.12
    # planks (5) with tiny gaps, each clipped by the arch
    n = 5; pw = (u1 - u0) / n
    for i in range(n):
        a, b = u0 + i * pw + 0.006, u0 + (i + 1) * pw - 0.006
        ta = sp + math.sqrt(max(0, r * r - (a - uc) ** 2)); tb = sp + math.sqrt(max(0, r * r - (b - uc) ** 2))
        poly = [(a, v0), (b, v0), (b, tb), ((a + b) / 2, sp + math.sqrt(max(0, r * r - ((a + b) / 2 - uc) ** 2))), (a, ta)]
        P0 = [F.p(u, v, wd + 0.03) for (u, v) in poly]; P1 = [F.p(u, v, wd - 0.03) for (u, v) in poly]
        gD.face('XM_Door_Cranberry', order_face(P0, F.W)); gD.face('XM_Door_Cranberry', order_face(P1, -F.W))
        for k in range(len(poly)):
            A, B = poly[k], poly[(k + 1) % len(poly)]
            q = [F.p(A[0], A[1], wd + 0.03), F.p(B[0], B[1], wd + 0.03), F.p(B[0], B[1], wd - 0.03), F.p(A[0], A[1], wd - 0.03)]
            mid = np.mean(q, 0); ctr = F.p((a + b) / 2, (v0 + ta) / 2, wd)
            gD.face('XM_Door_Cranberry', order_face(q, mid - ctr))
    # battens
    for v in (v0 + 0.35, v0 + 1.25):
        gD.beam('XM_Door_Cranberry', F.p(u0 + 0.08, v, wd + 0.05), F.p(u1 - 0.08, v, wd + 0.05), 0.035, 0.12, up=F.V, b=0.008)
    # little lit window near the top of the arch
    wv0, wv1 = sp - 0.05, sp + r * 0.62
    gD.face('XM_WindowWarm', order_face([F.p(uc - 0.24, wv0, wd + 0.035), F.p(uc + 0.24, wv0, wd + 0.035), F.p(uc + 0.24, wv1 - 0.06, wd + 0.035), F.p(uc, wv1, wd + 0.035), F.p(uc - 0.24, wv1 - 0.06, wd + 0.035)], F.W))
    for uu in (uc - 0.26, uc + 0.26): gD.beam('XM_Beam_Dark', F.p(uu, wv0, wd + 0.05), F.p(uu, wv1 - 0.05, wd + 0.05), 0.04, 0.05, up=F.U, b=0.006)
    gD.beam('XM_Beam_Dark', F.p(uc, wv0, wd + 0.05), F.p(uc, wv1, wd + 0.05), 0.04, 0.035, up=F.U, b=0.005)
    gD.beam('XM_Beam_Dark', F.p(uc - 0.27, wv0, wd + 0.05), F.p(uc + 0.27, wv0, wd + 0.05), 0.04, 0.05, up=F.V, b=0.006)
    gD.beam('XM_Beam_Dark', F.p(uc - 0.27, (wv0 + wv1) / 2, wd + 0.05), F.p(uc + 0.27, (wv0 + wv1) / 2, wd + 0.05), 0.04, 0.03, up=F.V, b=0.005)
    # brass ring handle + plate
    hp = F.p(u1 - 0.17, v0 + 1.02, wd + 0.04)
    gD.obox('XM_Brass', hp + F.W * 0.01, (0.06, 0.02, 0.2), np.stack([F.U, F.W, F.V], 1), b=0.006)
    gD.torus('XM_Brass', hp + F.W * 0.05 - F.V * 0.05, 0.055, 0.012, seg=12, tseg=5, axis_R=np.stack([F.U, F.V, F.W], 1))
    # heavy honey frame around the opening (arch + jambs), proud
    pts = arch_pts(uc, sp, r, 12); fw = 0.15
    for (ua, va), (ub, vb) in zip(pts[:-1], pts[1:]):
        s1 = 1 + fw / 2 / r
        gF.beam('XM_Beam_Honey', F.p(uc + (ua - uc) * s1, sp + (va - sp) * s1, 0.03), F.p(uc + (ub - uc) * s1, sp + (vb - sp) * s1, 0.03), 0.09, fw, up=F.W, b=0.015, ext=0.025)
    for u in (u0 - fw / 2, u1 + fw / 2):
        gF.beam('XM_Beam_Honey', F.p(u, v0 - 0.01, 0.03), F.p(u, sp, 0.03), 0.09, fw, up=F.U, b=0.015)
    gF.cbox('XM_Beam_Honey', *bbox_pts([F.p(uc - 0.12, v1 + 0.04, -0.02), F.p(uc + 0.12, v1 + 0.3, 0.1)]), b=0.02)
    # threshold
    gF.cbox('XM_Beam_Dark', *bbox_pts([F.p(u0 - 0.05, v0 - 0.04, 0.12), F.p(u1 + 0.05, v0 + 0.015, -WT)]), b=0.01)
    if frost is not None:
        wreath(frost, F.p(uc, v0 + 1.62, wd + 0.11), R=0.3, facing=F.W, seed=11)

# ------------------------------------------------------------------ roof
def roof_y_under(y):     # underside height of the main roof at plan-y (front slope y<=ridge, back slope y>=ridge)
    d = (y - HY0) if y <= RIDGE_Y else (HY1 - y)
    return WALL_TOP + 0.02 + d * TANP

def build_roof(gR, gS, gT):
    """main gable roof (ridge along X): slab + fascia + bargeboards + rafter tails + shingle rows + ridge cap.
    gR roof, gS snow, gT timber"""
    xa, xb = HX0 - GABLE_OV, HX1 + GABLE_OV; Lx = xb - xa
    run = RIDGE_Y - (HY0 - EAVE_OV)
    slope_len = run / math.cos(PITCH) + 0.03
    for side in (-1, 1):   # -1 front (toward -Y), +1 back
        d = np.array([0, side * math.cos(PITCH), -math.sin(PITCH)])        # down-slope direction
        nrm = np.array([0, side * math.sin(PITCH), math.cos(PITCH)])       # outward normal
        ridge_under = np.array([0, RIDGE_Y, roof_y_under(RIDGE_Y)])
        # slab: from ridge to eave, thickness ROOF_T above the underside
        c = ridge_under + d * slope_len / 2 + nrm * ROOF_T / 2; c[0] = (xa + xb) / 2
        R = np.stack([[1, 0, 0], d, nrm], 1)
        gR.obox('XM_Roof_PineDeep', c, (Lx, slope_len, ROOF_T), R, b=0.03)
        top0 = ridge_under + nrm * ROOF_T          # top surface at ridge
        # shingle rows (from the eave up)
        rowh = 0.46; nrow = int((slope_len - 0.2) / rowh)
        rr = np.random.default_rng(31 + side)
        for i in range(nrow):
            s_low = slope_len - 0.02 - i * rowh          # distance from ridge to the row's lower edge
            s_hi = s_low - rowh - 0.12
            if s_hi < 0.05: s_hi = 0.05
            x = xa - 0.02; off = rr.uniform(0, 0.4) if i % 2 else 0
            first = True
            while x < xb - 0.05:
                wdt = rr.uniform(0.55, 0.85) if not first else rr.uniform(0.3, 0.6) + off; first = False
                x1 = min(x + wdt, xb + 0.02)
                t = 0.045
                lift = 0.035 + 0.01 * rr.random()
                p_lo = top0 + d * s_low + nrm * (lift + t / 2); p_hi = top0 + d * s_hi + nrm * (t / 2 + 0.005)
                mid = (p_lo + p_hi) / 2; mid[0] = (x + x1) / 2 + 0.0
                dv = p_lo - p_hi; Ld = np.linalg.norm(dv); dv /= Ld; nv = np.cross([1, 0, 0], dv); nv = nv if np.dot(nv, nrm) > 0 else -nv
                gR.obox('XM_Roof_Pine' if rr.random() > 0.18 else 'XM_Roof_PineDeep', mid, (x1 - x - 0.03, Ld, t), np.stack([[1, 0, 0], dv, nv], 1))
                x = x1
        # fascia board along the eave + rafter tails under the overhang
        eave_top = top0 + d * slope_len
        fa = eave_top - nrm * ROOF_T * 0.5
        gT.beam('XM_Beam_Honey', [xa - 0.06, fa[1] + side * 0.03, fa[2] - 0.02], [xb + 0.06, fa[1] + side * 0.03, fa[2] - 0.02], 0.07, 0.26, up=nrm, b=0.018)
        for x in np.arange(HX0 + 0.15, HX1 - 0.1, 0.78):
            p0 = np.array([x, (HY0 if side < 0 else HY1) - side * 0.05, WALL_TOP - 0.05]); p1 = np.array([x, eave_top[1] - side * 0.1, eave_top[2] - ROOF_T - 0.07])
            gT.beam('XM_Beam_Dark', p0, p1, 0.09, 0.12, up=(0, 0, 1), b=0.012)
        # snow sheet: signed distance to a wavy outline -> rounded quarter-ellipse profile (thick soft lips, no tapering "cream")
        nz1 = smooth_noise(70 + side, 6); nz2 = smooth_noise(90 + side, 6); nz3 = smooth_noise(110 + side, 5); nz4 = smooth_noise(130 + side, 4)
        holes = [(rr.uniform(1.2, Lx - 1.2), rr.uniform(slope_len * 0.5, slope_len * 0.8), rr.uniform(0.45, 0.9), rr.uniform(0.3, 0.55)) for _ in range(3 if side < 0 else 4)]
        def lim_of(u): return slope_len - (0.3 + 0.85 * (0.5 + 0.5 * nz2(u * 0.5)) ** 1.5)
        def thick(u, w, side=side):     # w: distance from the ridge down the slope
            dside = min(u, Lx - u) - (0.38 + 0.3 * (0.5 + 0.5 * nz1(w * 1.2)))
            dbot = lim_of(u) - w
            d = min(dside, dbot)
            T = 0.34 + 0.06 * nz3(u * 0.45 + w * 0.3) + 0.025 * nz4(u * 0.9 - w * 0.7)
            # gentle layered terraces across the slope
            if d <= 0: return -0.12
            return T * math.sqrt(min(1.0, d / 0.32))
        org = top0 + np.array([xa, 0, 0]) + nrm * 0.07
        heightfield_snow(gS, org, np.array([1.0, 0, 0]), d, nrm, Lx, slope_len, thick, res=0.24, sink=0.06)
        # eave cornice lumps where the sheet reaches the eave
        k = xa + 0.4
        while k < xb - 0.6:
            ln = rr.uniform(1.0, 2.6)
            u_mid = k + ln / 2 - xa
            if lim_of(u_mid) > slope_len - 0.38 and lim_of(k - xa + 0.1) > slope_len - 0.45 and lim_of(k - xa + ln - 0.1) > slope_len - 0.45 and min(u_mid, Lx - u_mid) > 1.1:
                path = []; rad = []
                for t in np.linspace(0, 1, 10):
                    x = k + ln * t; e = eave_top + np.array([x - eave_top[0], 0, 0]) + d * 0.02 + nrm * 0.1
                    e[2] -= 0.05 * math.sin(math.pi * t) * 0.0
                    path.append(e); rad.append(0.06 + 0.15 * math.sin(math.pi * t) ** 0.6)
                gS.tube('XM_SnowFrost', path, rad, seg=9, flat=0.8, up=nrm)
            k += ln + rr.uniform(0.1, 0.6)
    # ridge cap + ridge snow roll
    rtop = np.array([0, RIDGE_Y, roof_y_under(RIDGE_Y) + ROOF_T / math.cos(PITCH)])
    gR.beam('XM_Roof_PineDeep', [xa - 0.03, RIDGE_Y, rtop[2] - 0.02], [xb + 0.03, RIDGE_Y, rtop[2] - 0.02], 0.34, 0.16, b=0.04)
    nz = smooth_noise(5, 6)
    path = [[x, RIDGE_Y + 0.03 * nz(x), rtop[2] + 0.12] for x in np.linspace(xa + 0.45, xb - 0.45, 26)]
    rad = [0.2 + 0.06 * nz(i * 0.7) for i in range(26)]
    gS.tube('XM_SnowFrost', path, rad, seg=10, flat=0.72)
    # bargeboards along both gable edges (front & back halves)
    for x in (xa - 0.04, xb + 0.04):
        for side in (-1, 1):
            d = np.array([0, side * math.cos(PITCH), -math.sin(PITCH)]); nrm = np.array([0, side * math.sin(PITCH), math.cos(PITCH)])
            p0 = np.array([x, RIDGE_Y, roof_y_under(RIDGE_Y) + ROOF_T * 0.4]); p1 = p0 + d * (slope_len + 0.02)
            gT.beam('XM_Beam_Honey', p0 + nrm * 0.03, p1 + nrm * 0.03, 0.08, 0.3, up=nrm, b=0.02, ext=0.04)

def build_gables(g, gT, frost):
    """triangular gable walls on the two side walls (above the top plate), half-timbered + louvred vent"""
    for x0, out in ((HX0, -1), (HX1, 1)):
        xi = x0 - out * WT
        ys = [HY0 + 0.02, HY1 - 0.02]
        apex = roof_y_under(RIDGE_Y) - 0.03
        tri = [(HY0 + 0.01, WALL_TOP), (HY1 - 0.01, WALL_TOP), (RIDGE_Y, apex)]
        P0 = [np.array([x0, y, z]) for (y, z) in tri]; P1 = [np.array([xi, y, z]) for (y, z) in tri]
        g.face('XM_Plaster_Cream', order_face(P0, [out, 0, 0])); g.face('XM_Plaster_Inner', order_face(P1, [-out, 0, 0]))
        for a, b in zip(tri, tri[1:] + tri[:1]):
            q = [np.array([x0, a[0], a[1]]), np.array([x0, b[0], b[1]]), np.array([xi, b[0], b[1]]), np.array([xi, a[0], a[1]])]
            mid = np.mean(q, 0); c = np.array([(x0 + xi) / 2, RIDGE_Y, (WALL_TOP * 2 + apex) / 3])
            g.face('XM_Plaster_Cream', order_face(q, mid - c))
        xo = x0 + out * 0.03
        # king post, collar, struts
        gT.beam('XM_Beam_Honey', [xo, RIDGE_Y, WALL_TOP + 0.05], [xo, RIDGE_Y, apex - 0.1], 0.06, 0.2, up=(out, 0, 0), b=0.014)
        zc = WALL_TOP + (apex - WALL_TOP) * 0.42
        half = (apex - zc) / TANP
        gT.beam('XM_Beam_Honey', [xo, RIDGE_Y - half + 0.05, zc], [xo, RIDGE_Y + half - 0.05, zc], 0.06, 0.18, up=(out, 0, 0), b=0.014)
        for s in (-1, 1):
            gT.beam('XM_Beam_Honey', [xo, RIDGE_Y + s * 0.12, WALL_TOP + 0.12], [xo, RIDGE_Y + s * (half * 0.95), zc - 0.08], 0.05, 0.14, up=(out, 0, 0), b=0.012)
            gT.beam('XM_Beam_Honey', [xo, RIDGE_Y + s * 1.25, WALL_TOP + 0.08], [xo, RIDGE_Y + s * 2.85, WALL_TOP + 0.08 + 0.85], 0.05, 0.14, up=(out, 0, 0), b=0.012)
        # louvred vent above the collar
        vz = zc + 0.25
        for k in range(4):
            z = vz + 0.12 + k * 0.13
            gT.beam('XM_Beam_Dark', [xo + out * 0.02, RIDGE_Y - 0.3, z], [xo + out * 0.02, RIDGE_Y + 0.3, z], 0.05, 0.07, up=(out, 0, 0), b=0.008)
        gT.cbox('XM_Soot', *bbox_pts([[x0 + out * 0.005, RIDGE_Y - 0.33, vz + 0.05], [x0 - out * 0.02, RIDGE_Y + 0.33, vz + 0.65]]), b=0.0)

def build_chimney(gR, gS, gStone):
    """stone stack rising from the chimney breast through the back slope (centred on the fireplace)"""
    x0, x1 = CX - 0.62, CX + 0.62; y0, y1 = HY1 - 0.95, HY1 - 0.05
    zb = roof_y_under(y1) - 0.3; zt = roof_y_under(RIDGE_Y) + ROOF_T + 1.05
    gStone.box('XM_Stone_Mortar', (x0 + 0.04, y0 + 0.04, zb), (x1 - 0.04, y1 - 0.04, zt))
    F1 = WallFrame((x0 + 0.04, y1 - 0.04, 0), (-1, 0, 0), (0, 1, 0))  # dummy for stones on each face
    faces = [WallFrame((x1 - 0.04, y1 - 0.04, 0), (-1, 0, 0), (0, 1, 0)), WallFrame((x0 + 0.04, y0 + 0.04, 0), (1, 0, 0), (0, -1, 0)),
             WallFrame((x0 + 0.04, y1 - 0.04, 0), (0, -1, 0), (-1, 0, 0)), WallFrame((x1 - 0.04, y0 + 0.04, 0), (0, 1, 0), (1, 0, 0))]
    for F, L in zip(faces, (x1 - x0 - 0.08, x1 - x0 - 0.08, y1 - y0 - 0.08, y1 - y0 - 0.08)):
        stone_band(gStone, F, 0, L, zb + 0.6, zt - 0.02, rowh=(0.2, 0.26), proud=(0.02, 0.05))
    # cap
    gStone.cbox('XM_Stone_Light', (x0 - 0.08, y0 - 0.08, zt - 0.02), (x1 + 0.08, y1 + 0.08, zt + 0.16), b=0.03)
    gStone.box('XM_Soot', (x0 + 0.16, y0 + 0.16, zt + 0.15), (x1 - 0.16, y1 - 0.16, zt + 0.17), faces='Z')
    for sx in (-1, 1):
        gStone.cbox('XM_Stone_Warm', (CX + sx * 0.28 - 0.12, (y0 + y1) / 2 - 0.12, zt + 0.16), (CX + sx * 0.28 + 0.12, (y0 + y1) / 2 + 0.12, zt + 0.42), b=0.025)
    # snow on the cap (two soft pillows, leaving the flue clear)
    for sx in (-1, 1):
        gS.sphere('XM_SnowFrost', [CX + sx * 0.28, (y0 + y1) / 2, zt + 0.43], 0.17, seg=10, rings=6, scale=(1.1, 1.0, 0.45))
    gS.tube('XM_SnowFrost', [[x0 - 0.02, y0 - 0.02, zt + 0.17], [x1 + 0.02, y0 - 0.02, zt + 0.17]], [0.07, 0.09], seg=7, flat=0.6)
    # snow piled behind the stack on the slope (upslope side)
    gS.sphere('XM_SnowFrost', [CX, y0 - 0.05, roof_y_under(y0) + ROOF_T + 0.12], 0.55, seg=12, rings=6, scale=(1.45, 0.75, 0.42))

def build_porch(gP, gT, gR, gS, gStone, gDec, gWalk):
    """gable porch: stone platform + 3 steps (walkable), two posts + beam + knee braces, small gable roof,
    plaster gable with star, low side rails."""
    # platform (stone) and steps
    gWalk.box('XM_Stone_Mortar', (PX0, PY0, DECK - 0.02), (PX1, HY0 + 0.02, FLOOR - 0.04), faces='xXyY')
    F = WallFrame((PX0, PY0, DECK), (1, 0, 0), (0, -1, 0))
    stone_band(gWalk, F, 0, PX1 - PX0, 0.0, FLOOR - DECK - 0.04, rowh=(0.19, 0.22), proud=(0.02, 0.04))
    for x0, U, W in ((PX0, (0, 1, 0), (-1, 0, 0)), (PX1, (0, -1, 0), (1, 0, 0))):
        Fs = WallFrame((x0, PY0 if U[1] > 0 else HY0, DECK), U, W)
        stone_band(gWalk, Fs, 0, HY0 - PY0, 0.0, FLOOR - DECK - 0.04, rowh=(0.19, 0.22), proud=(0.02, 0.04))
    # platform top: flagstones
    rr = np.random.default_rng(42)
    y = PY0 + 0.02
    while y < HY0 - 0.05:
        h = min(rr.uniform(0.42, 0.6), HY0 - y)
        x = PX0 + 0.02
        while x < PX1 - 0.05:
            w = min(rr.uniform(0.5, 0.85), PX1 - x)
            gWalk.cbox('XM_Stone_Light' if rr.random() < 0.5 else 'XM_Stone_Warm', (x + 0.012, y + 0.012, FLOOR - 0.06), (x + w - 0.012, y + h - 0.012, FLOOR), b=0.015)
            x += w
        y += h
    gWalk.box('XM_Stone_Mortar', (PX0 + 0.01, PY0 + 0.01, FLOOR - 0.07), (PX1 - 0.01, HY0, FLOOR - 0.04), faces='Z')
    # steps
    for i in range(STEP_N - 1):
        zt = DECK + (FLOOR - DECK) * (i + 1) / STEP_N
        ya = PY0 - STEP_RUN * (STEP_N - 1 - i); yb = ya + STEP_RUN + (0.0 if i < STEP_N - 2 else 0.0)
        gWalk.cbox('XM_Stone_Warm', (PX0 + 0.15, ya, DECK - 0.03), (PX1 - 0.15, PY0 + 0.01, zt), b=0.025)
    # cheek walls beside the steps
    for x in (PX0, PX1 - 0.18):
        gStone.cbox('XM_Stone_Light', (x, PY0 - STEP_RUN * (STEP_N - 1) - 0.02, DECK - 0.03), (x + 0.18, PY0 + 0.05, DECK + 0.2), b=0.02)
    # posts + beam + braces
    py = PY0 + 0.16
    for x in (PX0 + 0.2, PX1 - 0.2):
        gT.cbox('XM_Beam_Honey', (x - 0.12, py - 0.12, FLOOR), (x + 0.12, py + 0.12, FLOOR + 0.16), b=0.02)
        gT.cbox('XM_Beam_Honey', (x - 0.09, py - 0.09, FLOOR + 0.16), (x + 0.09, py + 0.09, FLOOR + 2.62), b=0.02)
        s = 1 if x < CX else -1
        gT.beam('XM_Beam_Honey', [x, py, FLOOR + 1.95], [x + s * 0.65, py, FLOOR + 2.6], 0.12, 0.13, up=(0, -1, 0), b=0.014)
        gT.beam('XM_Beam_Honey', [x, py, FLOOR + 2.0], [x, py + 0.7, FLOOR + 2.62], 0.12, 0.13, up=(1, 0, 0), b=0.014)
        gT.beam('XM_Beam_Honey', [x, py - 0.25, FLOOR + 2.7], [x, HY0 + 0.05, FLOOR + 2.7], 0.16, 0.18, up=(0, 0, 1), b=0.02)
    beam_z = FLOOR + 2.72
    gT.beam('XM_Beam_Honey', [PX0 - 0.15, py, beam_z], [PX1 + 0.15, py, beam_z], 0.18, 0.22, b=0.02)
    # porch gable roof: ridge along Y at CX
    pr_half = (PX1 - PX0) / 2 + 0.45
    ppitch = math.radians(42); tp = math.tan(ppitch)
    zr_under = beam_z + 0.11 + (pr_half - 0.3) * tp
    y_front = PY0 - 0.45
    y_back = HY0 + 1.6
    Lr = (pr_half) / math.cos(ppitch) + 0.02
    for s in (-1, 1):
        d = np.array([s * math.cos(ppitch), 0, -math.sin(ppitch)]); nrm = np.array([s * math.sin(ppitch), 0, math.cos(ppitch)])
        top_r = np.array([CX, 0, zr_under])
        c = top_r + d * Lr / 2 + nrm * 0.11; c[1] = (y_front + y_back) / 2
        gR.obox('XM_Roof_PineDeep', c, (Lr, y_back - y_front, 0.2), np.stack([d, [0, 1, 0], nrm], 1), b=0.03)
        rr2 = np.random.default_rng(55 + s)
        for i in range(int((Lr - 0.15) / 0.42)):
            s_lo = Lr - 0.02 - i * 0.42; s_hi = max(0.04, s_lo - 0.54)
            y = y_front - 0.02
            while y < y_back:
                w = rr2.uniform(0.5, 0.8); y1 = min(y + w, y_back)
                p_lo = top_r + d * s_lo + nrm * 0.25; p_hi = top_r + d * s_hi + nrm * 0.215
                dv = p_lo - p_hi; Ld = np.linalg.norm(dv); dv /= Ld; nv = np.cross(dv, [0, 1, 0]); nv = nv if np.dot(nv, nrm) > 0 else -nv
                mid = (p_lo + p_hi) / 2; mid[1] = (y + y1) / 2
                gR.obox('XM_Roof_Pine', mid, (Ld, y1 - y - 0.03, 0.045), np.stack([dv, [0, 1, 0], nv], 1))
                y = y1
        # fascia + bargeboard
        eave = top_r + d * Lr
        gT.beam('XM_Beam_Honey', [eave[0] - s * 0.02, y_front - 0.04, eave[2] + 0.02], [eave[0] - s * 0.02, y_back - 0.6, eave[2] + 0.02], 0.07, 0.22, up=nrm, b=0.016)
        gT.beam('XM_Beam_Honey', top_r + nrm * 0.16 + [0, y_front - 0.06, 0], eave + nrm * 0.16 + [0, y_front - 0.06, 0], 0.08, 0.3, up=nrm, b=0.02, ext=0.04)
        # snow on the porch slope
        nz1 = smooth_noise(300 + s, 5)
        def thick(u, w, s=s):
            ms = np.clip((u - (0.2 + 0.15 * nz1(w * 2))) / 0.3, 0, 1); ms = ms * ms * (3 - 2 * ms)
            lim = Lr - (0.12 + 0.2 * (0.5 + 0.5 * nz1(u * 1.7)))
            mb = np.clip((lim - w) / 0.25, 0, 1); mb = mb * mb * (3 - 2 * mb)
            return (0.28 + 0.05 * nz1(u * 1.3 + w)) * ms * mb
        org = top_r + nrm * 0.27 + np.array([0, y_front - 0.02, 0])
        heightfield_snow(gS, org, np.array([0, 1.0, 0]), d, nrm, (y_back - 0.2) - (y_front - 0.02), Lr, thick, res=0.16, sink=0.07)
        # cornice at the porch eave
        path = [eave + nrm * 0.12 + d * 0.03 + [0, y, 0] for y in np.linspace(y_front + 0.25, y_back - 1.0, 8)]
        gS.tube('XM_SnowFrost', path, [0.06, 0.1, 0.12, 0.13, 0.12, 0.11, 0.09, 0.05], seg=8, flat=0.8, up=nrm)
    rz = zr_under + 0.2 / math.cos(ppitch) + 0.02
    main_top = lambda y: roof_y_under(y) + ROOF_T / math.cos(PITCH) + 0.05
    y_meet = HY0 + (rz + 0.1 - (WALL_TOP + 0.02 + ROOF_T / math.cos(PITCH) + 0.05)) / TANP
    gR.beam('XM_Roof_PineDeep', [CX, y_front - 0.03, rz], [CX, y_meet + 0.25, rz], 0.28, 0.14, b=0.035)
    gS.tube('XM_SnowFrost', [[CX, y, rz + 0.12] for y in np.linspace(y_front + 0.15, y_meet + 0.1, 10)], [0.12, 0.17, 0.18, 0.18, 0.17, 0.18, 0.19, 0.2, 0.22, 0.2], seg=9, flat=0.7)
    # valley snow where the porch slopes run into the main roof
    for s in (-1, 1):
        pts = []
        for w in np.linspace(0.05, Lr - 0.15, 9):
            x = CX + s * w * math.cos(ppitch); z = zr_under + 0.27 - w * math.sin(ppitch)
            y = HY0 + (z - (WALL_TOP + 0.02 + ROOF_T / math.cos(PITCH) + 0.05)) / TANP
            pts.append([x, y - 0.05, z + 0.08])
        gS.tube('XM_SnowFrost', pts, [0.2, 0.22, 0.22, 0.21, 0.2, 0.19, 0.17, 0.15, 0.12], seg=8, flat=0.6)
    # gable triangle (plaster + timber) over the beam
    yg = py - 0.05
    tri = [(PX0 - 0.05, beam_z + 0.11), (PX1 + 0.05, beam_z + 0.11), (CX, zr_under - 0.02)]
    P0 = [np.array([x, yg, z]) for (x, z) in tri]; P1 = [np.array([x, yg + 0.12, z]) for (x, z) in tri]
    gP.face('XM_Plaster_Cream', order_face(P0, [0, -1, 0])); gP.face('XM_Plaster_Cream', order_face(P1, [0, 1, 0]))
    gT.beam('XM_Beam_Honey', [CX, yg - 0.03, beam_z + 0.15], [CX, yg - 0.03, zr_under - 0.15], 0.06, 0.16, up=(0, -1, 0), b=0.012)
    for s in (-1, 1):
        gT.beam('XM_Beam_Honey', [CX + s * 0.1, yg - 0.03, beam_z + 0.2], [CX + s * 1.0, yg - 0.03, beam_z + 0.2 + 0.8 * tp * 0.75], 0.05, 0.13, up=(0, -1, 0), b=0.01)
    star5(gDec, [CX, yg - 0.1, beam_z + 0.95], r=0.26, depth=0.07, facing=(0, -1, 0))
    bow(gDec, [CX, y_front - 0.12, zr_under + 0.08], size=0.26, facing=(0, -1, 0))
    # garland along both porch rakes with bulbs
    for s in (-1, 1):
        p_top = np.array([CX + s * 0.25, y_front - 0.12, zr_under - 0.05]); p_bot = np.array([CX + s * (pr_half - 0.05), y_front - 0.12, zr_under - (pr_half - 0.05) * tp + 0.05])
        pts = [p_top + (p_bot - p_top) * t + np.array([0, 0, -0.08 * math.sin(math.pi * t * 2) ** 2]) for t in np.linspace(0, 1, 16)]
        garland(gDec, pts, r=0.07, seed=20 + s, bulb_gap=0.28)
        bow(gDec, p_bot + [0, -0.02, -0.08], size=0.2, facing=(0, -1, 0))
    # low side rails on the porch (sides only, the front stays open for the steps)
    for x in (PX0 + 0.06, PX1 - 0.06):
        for y in (PY0 + 0.4, HY0 - 0.2):
            gT.cbox('XM_Beam_Honey', (x - 0.06, y - 0.06, FLOOR), (x + 0.06, y + 0.06, FLOOR + 0.82), b=0.012)
        gT.cbox('XM_Beam_Honey', (x - 0.05, PY0 + 0.36, FLOOR + 0.74), (x + 0.05, HY0 - 0.16, FLOOR + 0.84), b=0.012)
        gT.cbox('XM_Beam_Honey', (x - 0.03, PY0 + 0.4, FLOOR + 0.18), (x + 0.03, HY0 - 0.2, FLOOR + 0.24), b=0.008)
        for y in np.arange(PY0 + 0.55, HY0 - 0.25, 0.17):
            gT.cbox('XM_Beam_Honey', (x - 0.022, y - 0.022, FLOOR + 0.24), (x + 0.022, y + 0.022, FLOOR + 0.74), b=0.006)
        gS.tube('XM_SnowFrost', [[x, y, FLOOR + 0.86] for y in np.linspace(PY0 + 0.45, HY0 - 0.35, 6)], [0.035, 0.05, 0.055, 0.05, 0.045, 0.03], seg=6, flat=0.6)
    return dict(y_front=y_front, zr=zr_under)

def build_house(mode='ext'):
    """mode 'ext': full closed cottage (season decor + balcony map).
    mode 'int': interior map shell — no front wall / roof / porch roof; clear windows; inner timber."""
    G = {k: Geo() for k in ('shell', 'stone', 'timber', 'win_frame', 'win_glass', 'win_card', 'door', 'roof', 'snow', 'decor', 'porch', 'walk', 'porch_t')}
    W = walls_def(front=(mode == 'ext'))
    for key, w in W.items():
        if mode == 'int' and key == 'S':
            continue
        F, L, ops = w['F'], w['L'], w['ops']
        ex = [dict(o) for o in ops]
        wall_panel(G['shell'], F, L, H_WALL, WT, ex, 'XM_Plaster_Cream', 'XM_Plaster_Inner', 'XM_Plaster_Cream', band=(V_STONE, 'XM_Stone_Mortar'))
        skip = [(o['u0'] - 0.05, o['u1'] + 0.05, o['v0'] - 0.05, o['v1']) for o in ops]
        stone_band(G['stone'], F, 0.0, L, 0.0, V_STONE, skip=skip)
        half_timber(G['timber'], F, key, L, ops)
        if mode == 'int': half_timber(G['timber'], F, key, L, ops, inside=True)
        for o in ops:
            if o['kind'] == 'win': window_unit(G['win_frame'], G['win_glass'], G['win_card'], F, o, 'ext' if mode == 'ext' else 'int', frost=G['snow'])
            elif o['kind'] == 'door' and mode == 'ext': door_unit(G['door'], G['timber'], F, o, frost=G['decor'])
    if mode == 'int':
        # front: only the stone plinth below the floor (the section cut) + a floor-edge beam
        F = W['S']['F'] if 'S' in W else WallFrame((HX0, HY0, DECK), (1, 0, 0), (0, -1, 0))
        G['shell'].box('XM_Stone_Mortar', (HX0, HY0, DECK), (HX1, HY0 + WT, FLOOR - 0.06), faces='yZ')
        stone_band(G['stone'], WallFrame((HX0, HY0, DECK), (1, 0, 0), (0, -1, 0)), 0.0, HX1 - HX0, 0.0, V_FLOOR - 0.06, skip=[(PX0 - HX0, PX1 - HX0, 0, 1)], rowh=(0.19, 0.22))
        G['timber'].beam('XM_Beam_Dark', [HX0 + 0.02, HY0 + 0.1, FLOOR - 0.05], [HX1 - 0.02, HY0 + 0.1, FLOOR - 0.05], 0.2, 0.12, b=0.015)
    if mode == 'ext':
        build_roof(G['roof'], G['snow'], G['timber'])
        build_gables(G['shell'], G['timber'], G['snow'])
        build_chimney(G['roof'], G['snow'], G['stone'])
        pinfo = build_porch(G['porch'], G['porch_t'], G['roof'], G['snow'], G['stone'], G['decor'], G['walk'])
        build_eave_decor(G['decor'])
        # lanterns either side of the door (under the porch)
        for x in (CX - DOOR_W / 2 - 0.42, CX + DOOR_W / 2 + 0.42):
            lantern(G['decor'], [x, HY0 - 0.3, FLOOR + 2.02], (0, -1, 0))
    else:
        # porch platform + steps stay in the interior map (low, context below the cut)
        tmp = {k: Geo() for k in ('p', 't', 'r', 's', 'st', 'd', 'w')}
        build_porch(tmp['p'], tmp['t'], tmp['r'], tmp['s'], tmp['st'], tmp['d'], tmp['w'])
        G['walk'] = tmp['w']; G['stone'].merge(tmp['st'])
    return G

def build_eave_decor(g):
    """garland swags + warm bulbs under the front eave, bows at the hooks; short runs on the side eaves' front corners"""
    yE = HY0 - EAVE_OV + 0.06
    zE = roof_y_under(HY0 - EAVE_OV) - 0.06
    hooks = [HX0 - 0.35, 1.0, PX0 - 0.15, PX1 + 0.15, 9.0, HX1 + 0.35]
    for a, b in zip(hooks[:-1], hooks[1:]):
        if a == PX0 - 0.15: continue          # porch gable interrupts the main eave run
        sag = 0.28 if b - a > 1.5 else 0.16
        pts = catenary([a, yE, zE], [b, yE, zE], sag, n=18)
        garland(g, pts, r=0.08, seed=int(a * 10) % 50, bulb_gap=0.3)
    for x in hooks:
        bow(g, [x, yE - 0.06, zE - 0.03], size=0.25, facing=(0, -1, 0))
    # back eave: plain bulb string (no garland) so the back is lit but quieter
    yB = HY1 + EAVE_OV - 0.06
    for a, b in zip([HX0 - 0.35, 3.0, 7.0], [3.0, 7.0, HX1 + 0.35]):
        pts = catenary([a, yB, zE], [b, yB, zE], 0.22, n=16)
        g.tube('XM_Iron_Black', pts, 0.008, seg=4, caps=False)
        L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.array(pts), axis=0), axis=1))]
        for k in np.arange(0.15, L[-1], 0.36):
            p = np.array([np.interp(k, L, np.array(pts)[:, j]) for j in range(3)])
            g.sphere('XM_Festoon_Bulb', p + [0, 0, -0.05], 0.035, seg=4, rings=3, scale=(1, 1, 1.3))
