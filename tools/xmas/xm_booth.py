# VIBE LAB PHOTOBOOTH — Christmas booth on the left rooftop pad (exterior shell + shallow display nook behind the curtain).
# Same kit as the Christmas cottage (stone plinth, cream plaster, honey timber, pine shingles, soft snow, garland, bows, lanterns).
# Players never walk inside: the door pin opens the existing photo mode (src/features/photo.js).
from xm_common import *
from xm_house import window_unit, order_face, bbox_pts
from xm_text import add_text

BX0, BX1 = -8.75, -2.3         # booth outer walls (X): fills the left pad, clear of the cottage's bargeboard
BY0, BY1 = 5.0, 9.95           # front / back (Y): 2.6 m forecourt in front
BWT = 0.25                     # wall thickness
FL = DECK + 0.22               # booth floor
PLATE = FL + 3.0               # top plate
BCX = (BX0 + BX1) / 2
BPITCH = math.radians(40); BTAN = math.tan(BPITCH)
B_ROOF_T = 0.2
OV_SIDE, OV_FRONT, OV_BACK = 0.35, 0.6, 0.3
# entry (arched, left part of the facade) and nook behind it
EU0, EU1 = 0.55, 2.25          # u along the facade (from BX0)
E_TOP = FL + 2.75
NOOK_X1 = BX0 + EU1 + 0.4      # partition closing the nook (right)
NOOK_Y1 = BY0 + 2.3            # backdrop plane
ENTRY_C = (BX0 + (EU0 + EU1) / 2, BY0)
V_FL = FL - DECK; V_PLATE = PLATE - DECK

def roof_under(x):           # underside of the booth roof at plan-x (ridge along Y at BCX)
    return PLATE + 0.02 + ((BX1 - BX0) / 2 - abs(x - BCX)) * BTAN

def build_booth():
    G = {k: Geo() for k in ('shell', 'stone', 'timber', 'roof', 'snow', 'sign', 'kiosk', 'glow', 'nook', 'decor', 'win_f', 'win_g', 'win_c', 'step', 'col')}
    # ---------------- walls (outer frames like the cottage: u left->right seen from outside, v from DECK)
    L_fb, L_side = BX1 - BX0, (BY1 - BWT) - (BY0 + BWT)
    W = {
        'S': (WallFrame((BX0, BY0, DECK), (1, 0, 0), (0, -1, 0)), L_fb, [dict(u0=EU0, u1=EU1, v0=V_FL, v1=E_TOP - DECK, arch=True, kind='door'),
              dict(u0=L_fb - 1.55, u1=L_fb - 0.4, v0=V_FL + 1.0, v1=V_FL + 2.55, arch=True, kind='win')]),
        'N': (WallFrame((BX1, BY1, DECK), (-1, 0, 0), (0, 1, 0)), L_fb, []),
        'W': (WallFrame((BX0, BY1 - BWT, DECK), (0, -1, 0), (-1, 0, 0)), L_side,
              [dict(u0=L_side / 2 - 0.6, u1=L_side / 2 + 0.6, v0=V_FL + 1.0, v1=V_FL + 2.55, arch=True, kind='win')]),
        'E': (WallFrame((BX1, BY0 + BWT, DECK), (0, 1, 0), (1, 0, 0)), L_side, []),
    }
    VS = V_FL + 0.4                 # stone band top
    for key, (F, L, ops) in W.items():
        wall_panel(G['shell'], F, L, V_PLATE, BWT, ops, 'XM_Plaster_Cream', 'XM_Plaster_Inner', 'XM_Plaster_Cream', band=(VS, 'XM_Stone_Mortar'))
        skip = [(o['u0'] - 0.04, o['u1'] + 0.04, o['v0'] - 0.04, o['v1']) for o in ops]
        stone_band(G['stone'], F, 0.0, L, 0.0, VS, skip=skip, rowh=(0.17, 0.22), proud=(0.02, 0.05))
        frame(G['timber'], F, key, L, ops, VS)
        for o in ops:
            if o['kind'] == 'win':
                window_unit(G['win_f'], G['win_g'], G['win_c'], F, o, 'ext', frost=G['snow'])
                flower_box(G['decor'], F, o)
    # corner posts (proud, wrap both faces)
    for (x, y) in ((BX0, BY0), (BX1, BY0), (BX0, BY1), (BX1, BY1)):
        sx = 1 if x > BCX else -1; sy = 1 if y > (BY0 + BY1) / 2 else -1
        G['timber'].beam('XM_Beam_Honey', [x - sx * 0.07, y - sy * 0.07, DECK + VS], [x - sx * 0.07, y - sy * 0.07, PLATE - 0.02], 0.2, 0.2, up=(1, 0, 0), b=0.025)
    for (x, y) in ((BX0, BY0), (BX1, BY0), (BX0, BY1), (BX1, BY1)):
        sx = 1 if x > BCX else -1; sy = 1 if y > (BY0 + BY1) / 2 else -1
        G['stone'].cbox('XM_Stone_Light', (min(x, x - sx * 0.3) - 0.04 * (sx < 0), min(y, y - sy * 0.3) - 0.04 * (sy < 0), DECK - 0.02),
                        (max(x, x - sx * 0.3) + 0.04 * (sx > 0), max(y, y - sy * 0.3) + 0.04 * (sy > 0), DECK + VS + 0.05), b=0.035)
    # ---------------- gable walls (front + back triangles above the plate)
    apex = roof_under(BCX) - 0.02
    for y0, out in ((BY0, -1), (BY1, 1)):
        yi = y0 - out * BWT
        tri = [(BX0 + 0.01, PLATE), (BX1 - 0.01, PLATE), (BCX, apex)]
        G['shell'].face('XM_Plaster_Cream', order_face([np.array([x, y0, z]) for (x, z) in tri], [0, out, 0]))
        G['shell'].face('XM_Plaster_Inner', order_face([np.array([x, yi, z]) for (x, z) in tri], [0, -out, 0]))
        for a, b in zip(tri, tri[1:] + tri[:1]):
            q = [np.array([a[0], y0, a[1]]), np.array([b[0], y0, b[1]]), np.array([b[0], yi, b[1]]), np.array([a[0], yi, a[1]])]
            G['shell'].face('XM_Plaster_Cream', order_face(q, np.mean(q, 0) - np.array([BCX, (y0 + yi) / 2, (PLATE * 2 + apex) / 3])))
        yo = y0 + out * 0.03
        if out > 0:     # back gable: king post + struts
            G['timber'].beam('XM_Beam_Honey', [BCX, yo, PLATE + 0.05], [BCX, yo, apex - 0.08], 0.05, 0.16, up=(0, out, 0), b=0.012)
            for s in (-1, 1):
                G['timber'].beam('XM_Beam_Honey', [BCX + s * 0.1, yo, PLATE + 0.1], [BCX + s * 1.05, yo, PLATE + 0.1 + 0.95 * BTAN * 0.75], 0.05, 0.13, up=(0, out, 0), b=0.01)
    build_roof(G['roof'], G['snow'], G['timber'])
    build_sign(G['sign'], G['decor'])
    build_kiosk(G['kiosk'], G['glow'])
    build_nook(G['nook'], G['glow'])
    build_entry_decor(G['decor'], G['glow'])
    # step in front of the entry
    G['step'].cbox('XM_Stone_Light', (BX0 + EU0 - 0.08, BY0 - 0.42, DECK - 0.02), (BX0 + EU1 + 0.08, BY0 + 0.02, DECK + 0.11), b=0.025)
    G['step'].cbox('XM_Rug_Red', (BX0 + EU0 + 0.1, BY0 - 0.36, DECK + 0.11), (BX0 + EU1 - 0.1, BY0 - 0.06, DECK + 0.125), b=0.004)
    # snow drifts against the base (sides / back; the front approach stays clear)
    for (x, y, r) in ((BX0 - 0.15, BY1 - 0.5, 0.55), (BX0 - 0.15, BY1 - 2.1, 0.45), (BX1 + 0.15, BY1 - 0.4, 0.45), (BX0 - 0.15, BY0 + 0.7, 0.42), (BCX - 1.2, BY1 + 0.12, 0.55), (BCX + 1.4, BY1 + 0.1, 0.45), (BX1 - 0.3, BY0 - 0.16, 0.36), (BX0 + 0.25, BY0 - 0.18, 0.33)):
        G['snow'].sphere('XM_SnowFrost', [x, y, DECK - 0.04], r, seg=10, rings=5, scale=(1.15, 1.0, 0.55))
    # collider for the balcony map only: closes the entry (players stop at the curtain; the pin opens the photo mode)
    G['col'].box('XM_Collider', (BX0 + EU0 - 0.05, BY0 - 0.02, DECK + 0.1), (BX0 + EU1 + 0.05, BY0 + 0.3, DECK + 0.95))
    return G

def frame(g, F, key, L, ops, VS):
    """half-timber of the booth: sill on the stone band, top plate, posts at the openings, braces in the free bays"""
    def B(u0, v0, u1, v1, wid=0.16, d=0.05):
        g.beam('XM_Beam_Honey', F.p(u0, v0, d / 2), F.p(u1, v1, d / 2), d, wid, up=F.W, b=0.012)
    cuts = sorted((o['u0'] - 0.08, o['u1'] + 0.08) for o in ops if o['v0'] < VS + 0.15)
    a = -0.02
    for c0, c1 in cuts + [(L + 0.02, L + 0.02)]:
        if c0 - a > 0.1: B(a, VS + 0.07, c0, VS + 0.07, wid=0.14, d=0.06)
        a = c1
    B(-0.02, V_PLATE - 0.09, L + 0.02, V_PLATE - 0.09, wid=0.18, d=0.065)
    posts = [0.12, L - 0.12]
    for o in ops: posts += [o['u0'] - 0.17, o['u1'] + 0.17]
    if key == 'S': posts += [EU1 + 1.68]                # between the kiosk and the photo-strip board
    posts = sorted(set(round(p, 3) for p in posts))
    for u in posts:
        if any(o['u0'] - 0.05 < u < o['u1'] + 0.05 for o in ops): continue
        B(u, VS + 0.14, u, V_PLATE - 0.18, wid=0.15)
    if key == 'S': return                                   # the facade carries the kiosk + strip board instead of braces
    for a, b in zip(posts[:-1], posts[1:]):
        if any(o['u0'] - 0.1 < (a + b) / 2 < o['u1'] + 0.1 for o in ops) or b - a < 0.7: continue
        m = (a + b) / 2
        B(a + 0.08, VS + 0.22, m - 0.04, V_PLATE - 0.26, wid=0.12); B(b - 0.08, VS + 0.22, m + 0.04, V_PLATE - 0.26, wid=0.12)

def flower_box(g, F, o):
    u0, u1, v0 = o['u0'] - 0.05, o['u1'] + 0.05, o['v0'] - 0.1
    g.cbox('XM_Door_Cranberry', *bbox_pts([F.p(u0, v0 - 0.24, 0.02), F.p(u1, v0, 0.26)]), b=0.02)
    for k, u in enumerate(np.linspace(u0 + 0.1, u1 - 0.1, 5)):
        g.sphere('XM_Garland_Fir' if k % 2 else 'XM_Garland_FirLight', F.p(u, v0 + 0.04, 0.14), 0.11, seg=6, rings=4, scale=(1.2, 1.0, 0.8))
        for j in range(2):
            g.sphere('XM_Berry_Red', F.p(u + 0.04 * (j - 0.5), v0 + 0.1, 0.22), 0.025, seg=4, rings=3)
    g.tube('XM_SnowFrost', [F.p(u, v0 + 0.12, 0.13) for u in np.linspace(u0 + 0.12, u1 - 0.3, 6)], [0.04, 0.07, 0.08, 0.07, 0.06, 0.03], seg=7, flat=0.6, up=F.V)

def build_roof(gR, gS, gT):
    """gable roof, ridge along Y (front gable carries the sign): slab + shingles + fascia/bargeboards + snow"""
    ya, yb = BY0 - OV_FRONT, BY1 + OV_BACK; Ly = yb - ya
    half = (BX1 - BX0) / 2 + OV_SIDE
    slope_len = half / math.cos(BPITCH) + 0.02
    r_under = roof_under(BCX)
    for s in (-1, 1):
        d = np.array([s * math.cos(BPITCH), 0, -math.sin(BPITCH)]); nrm = np.array([s * math.sin(BPITCH), 0, math.cos(BPITCH)])
        top_r = np.array([BCX, 0, r_under])
        c = top_r + d * slope_len / 2 + nrm * B_ROOF_T / 2; c[1] = (ya + yb) / 2
        gR.obox('XM_Roof_PineDeep', c, (slope_len, Ly, B_ROOF_T), np.stack([d, [0, 1, 0], nrm], 1), b=0.03)
        top0 = top_r + nrm * B_ROOF_T
        rr = np.random.default_rng(700 + s)
        nrow = int((slope_len - 0.12) / 0.38)
        for i in range(nrow):
            s_lo = slope_len - 0.02 - i * 0.38; s_hi = max(0.04, s_lo - 0.5)
            y = ya - 0.02; first = True
            while y < yb:
                w = rr.uniform(0.42, 0.66) if not first else rr.uniform(0.2, 0.5); first = False
                y1 = min(y + w, yb + 0.02)
                p_lo = top0 + d * s_lo + nrm * 0.045; p_hi = top0 + d * s_hi + nrm * 0.02
                dv = p_lo - p_hi; Ld = np.linalg.norm(dv); dv /= Ld; nv = np.cross(dv, [0, 1, 0]); nv = nv if np.dot(nv, nrm) > 0 else -nv
                mid = (p_lo + p_hi) / 2; mid[1] = (y + y1) / 2
                gR.obox('XM_Roof_Pine' if rr.random() > 0.15 else 'XM_Roof_PineDeep', mid, (Ld, y1 - y - 0.025, 0.04), np.stack([dv, [0, 1, 0], nv], 1))
                y = y1
        eave = top0 + d * slope_len
        gT.beam('XM_Beam_Honey', [eave[0] - s * 0.02, ya - 0.03, eave[2] - 0.1], [eave[0] - s * 0.02, yb + 0.03, eave[2] - 0.1], 0.06, 0.2, up=nrm, b=0.014)
        for yy in (ya - 0.05, yb + 0.05):
            gT.beam('XM_Beam_Honey', top_r + nrm * 0.12 + [0, yy, 0], eave + nrm * 0.12 + [0, yy, 0], 0.07, 0.26, up=nrm, b=0.018, ext=0.03)
        # snow sheet (rounded lips, bare strip at the eave and the verges)
        nz1 = smooth_noise(810 + s, 5); nz2 = smooth_noise(820 + s, 5); nz3 = smooth_noise(830 + s, 4)
        lim = lambda u: slope_len - (0.22 + 0.4 * (0.5 + 0.5 * nz2(u * 0.9)) ** 1.4)
        def thick(u, w, s=s):
            dside = min(u, Ly - u) - (0.18 + 0.16 * (0.5 + 0.5 * nz1(w * 1.5)))
            dd = min(dside, lim(u) - w)
            if dd <= 0: return -0.1
            return (0.27 + 0.05 * nz3(u * 0.8 + w * 0.6)) * math.sqrt(min(1.0, dd / 0.24))
        org = top0 + np.array([0, ya, 0]) + nrm * 0.06
        heightfield_snow(gS, org, np.array([0, 1.0, 0]), d, nrm, Ly, slope_len, thick, res=0.17, sink=0.05)
        k = ya + 0.3
        while k < yb - 0.5:
            ln = rr.uniform(0.7, 1.4); um = k + ln / 2 - ya
            if lim(um) > slope_len - 0.34 and min(um, Ly - um) > 0.5:
                path = [eave + nrm * 0.09 + d * 0.02 + np.array([0, k + ln * t - eave[1], 0]) for t in np.linspace(0, 1, 8)]
                gS.tube('XM_SnowFrost', path, [0.05 + 0.11 * math.sin(math.pi * t) ** 0.6 for t in np.linspace(0, 1, 8)], seg=8, flat=0.8, up=nrm)
            k += ln + rr.uniform(0.15, 0.5)
    rz = r_under + B_ROOF_T / math.cos(BPITCH) + 0.02
    gR.beam('XM_Roof_PineDeep', [BCX, ya - 0.04, rz - 0.02], [BCX, yb + 0.04, rz - 0.02], 0.26, 0.13, b=0.03)
    nz = smooth_noise(840, 5)
    gS.tube('XM_SnowFrost', [[BCX + 0.02 * nz(y), y, rz + 0.1] for y in np.linspace(ya + 0.25, yb - 0.2, 12)], [0.14 + 0.04 * nz(i * 0.8) for i in range(12)], seg=9, flat=0.72)

def sign_outline(w, h, n=10):
    """rounded 'scalloped' sign plate: flat bottom with rounded corners, arched top with three soft bumps"""
    pts = []
    r = 0.12
    for k in range(n + 1):        # bottom-right corner
        a = -math.pi / 2 + (math.pi / 2) * k / n; pts.append((w / 2 - r + r * math.cos(a), -h / 2 + r + r * math.sin(a)))
    for k in range(1, 40):        # top: gentle arch + 3 bumps
        t = k / 40; x = w / 2 - r - (w - 2 * r) * t
        y = h / 2 - 0.1 + 0.1 * math.sin(math.pi * t) + 0.035 * abs(math.sin(3 * math.pi * t))
        pts.append((x, y))
    for k in range(n + 1):        # bottom-left corner
        a = math.pi + (math.pi / 2) * k / n; pts.append((-w / 2 + r + r * math.cos(a), -h / 2 + r + r * math.sin(a)))
    # right side climbs from the bottom corner to the arch start
    return pts

def build_sign(g, decor):
    """front gable sign: cream rim + cranberry plate + raised cream letters VIBE LAB / PHOTOBOOTH (Nunito Black)"""
    c = np.array([BCX, BY0 - 0.1, PLATE + 0.5]); W_, H_ = 3.4, 1.28
    outer = sign_outline(W_ + 0.14, H_ + 0.14); inner = sign_outline(W_, H_)
    R = np.stack([[1, 0, 0], [0, 0, 1], [0, -1, 0]], 1)      # local x->X, local y->Z, extrude toward -Y
    g.prism('XM_Fabric_Cream', outer, 0.0, 0.07, R=R, origin=c)                  # rim (cream board)
    g.prism('XM_Door_Cranberry', inner, 0.07, 0.11, R=R, origin=c)                # plate
    # brackets tying the sign back to the gable
    for sx in (-1.2, 1.2):
        g.beam('XM_Iron_Black', [c[0] + sx, BY0 + 0.01, c[2] + 0.45], [c[0] + sx, c[1] - 0.04, c[2] + 0.45], 0.04, 0.04)
    face_y = c[1] - 0.11
    add_text(g, 'XM_Sign_Letters', 'VIBE LAB', [c[0], face_y, c[2] + 0.02], (1, 0, 0), (0, 0, 1), 0.56, depth=0.06, side_mat='XM_Sign_LetterSide')
    add_text(g, 'XM_Sign_Letters', 'PHOTOBOOTH', [c[0], face_y, c[2] - 0.44], (1, 0, 0), (0, 0, 1), 0.29, depth=0.045, side_mat='XM_Sign_LetterSide', tracking=0.06)
    # small sparkle dashes either side of VIBE LAB (no camera icon)
    for sx in (-1, 1):
        for k, a in enumerate((-0.45, 0.0, 0.45)):
            p0 = np.array([c[0] + sx * 1.42, face_y - 0.01, c[2] + 0.24]) + np.array([sx * 0.08 * math.cos(a), 0, 0.08 * math.sin(a)])
            p1 = p0 + np.array([sx * 0.13 * math.cos(a), 0, 0.13 * math.sin(a)])
            g.beam('XM_Sign_Letters', p0, p1, 0.03, 0.03, up=(0, -1, 0), b=0.008)
    bow(decor, [c[0], c[1] - 0.12, c[2] - H_ / 2 - 0.08], size=0.32, facing=(0, -1, 0))

def build_kiosk(G0, GL0):
    g, glow = Geo(), Geo()
    _kiosk(g, glow)
    x0 = BX0 + EU1 + 0.42
    M = M4(np.diag([1.25, 1.25, 1.25]), (0, 0, 0)); T1 = M4(None, (-x0, -BY0, -DECK)); T2 = M4(None, (x0, BY0, DECK))
    G0.merge(g.transformed(T2 @ M @ T1)); GL0.merge(glow.transformed(T2 @ M @ T1))

def _kiosk(g, glow):
    """photo kiosk on the facade (right of the entry): pine-green cabinet, soft screen, three buttons, print slot with a strip,
    and a red sample-strip board. No camera lens."""
    u0 = EU1 + 0.42; x0 = BX0 + u0; x1 = x0 + 0.86; y0 = BY0
    z0, z1 = DECK + 0.3, FL + 2.0
    cab = [(0, 0), (0.86, 0), (0.86, z1 - z0 - 0.3)] + [(0.43 + 0.43 * math.cos(a), z1 - z0 - 0.3 + 0.3 * math.sin(a)) for a in np.linspace(0, math.pi, 12)[1:-1]] + [(0, z1 - z0 - 0.3)]
    R = np.stack([[1, 0, 0], [0, 0, 1], [0, -1, 0]], 1)
    g.prism('XM_Frame_Pine', cab, 0.0, 0.2, R=R, origin=[x0, y0, z0])
    inner = [(0.07, 0.07), (0.79, 0.07), (0.79, z1 - z0 - 0.32)] + [(0.43 + 0.36 * math.cos(a), z1 - z0 - 0.32 + 0.26 * math.sin(a)) for a in np.linspace(0, math.pi, 12)[1:-1]] + [(0.07, z1 - z0 - 0.32)]
    g.prism('XM_Fabric_Cream', inner, 0.2, 0.215, R=R, origin=[x0, y0, z0])
    fy = y0 - 0.215
    # screen (soft, not blown out)
    sc0, sc1 = z0 + 1.02, z0 + 1.46
    g.cbox('XM_Beam_Dark', (x0 + 0.13, fy - 0.03, sc0 - 0.05), (x1 - 0.13, fy + 0.01, sc1 + 0.05), b=0.015)
    glow.box('XM_Kiosk_Screen', (x0 + 0.17, fy - 0.035, sc0), (x1 - 0.17, fy - 0.03, sc1), faces='y')
    # heart on the screen
    hc = np.array([(x0 + x1) / 2, fy - 0.04, (sc0 + sc1) / 2 - 0.02])
    heart = [(0.0, -0.09)] + [(0.045 + 0.045 * math.cos(a), 0.02 + 0.045 * math.sin(a)) for a in np.linspace(-0.6, math.pi, 8)] + \
            [(-0.045 + 0.045 * math.cos(a), 0.02 + 0.045 * math.sin(a)) for a in np.linspace(0, math.pi + 0.6, 8)]
    g.prism('XM_Card_Red', heart, 0.0, 0.006, R=R, origin=hc)
    # three buttons (arrow / round / arrow)
    for k, dx in enumerate((-0.2, 0.0, 0.2)):
        c = np.array([(x0 + x1) / 2 + dx, fy, z0 + 0.86])
        if k == 1:
            g.sphere('XM_Bow_Red', c - [0, 0.01, 0], 0.055, seg=10, rings=6, scale=(1, 0.5, 1))
        else:
            g.cbox('XM_Bow_Red', c + [-0.06, -0.035, -0.045], c + [0.06, 0.0, 0.045], b=0.012)
            tri = [(-0.025 * (1 if dx > 0 else -1), -0.025), (0.025 * (1 if dx > 0 else -1), 0.0), (-0.025 * (1 if dx > 0 else -1), 0.025)]
            g.prism('XM_Fabric_Cream', tri, 0.035, 0.042, R=R, origin=c)
    # print slot + a strip of photos coming out
    ps = z0 + 0.5
    g.cbox('XM_Brass', (x0 + 0.18, fy - 0.05, ps - 0.07), (x1 - 0.18, fy + 0.01, ps + 0.07), b=0.015)
    g.box('XM_Soot', (x0 + 0.24, fy - 0.051, ps - 0.02), (x1 - 0.24, fy - 0.05, ps + 0.02), faces='y')
    strip_x0, strip_x1 = (x0 + x1) / 2 - 0.1, (x0 + x1) / 2 + 0.1
    g.obox('XM_Fabric_Cream', [(strip_x0 + strip_x1) / 2, fy - 0.09, ps - 0.13], (0.2, 0.012, 0.26), rotx(math.radians(-18)))
    for k in range(2):
        g.obox('XM_Card_Red', [(strip_x0 + strip_x1) / 2, fy - 0.098 + k * 0.0, ps - 0.06 - k * 0.1], (0.15, 0.004, 0.075), rotx(math.radians(-18)))
    # small warm "ready" light (glow) at the top of the cabinet arch
    glow.sphere('XM_Lantern_Glow', [(x0 + x1) / 2, fy - 0.01, z1 - 0.22], 0.045, seg=8, rings=5)
    # sample photo-strip board (hung on the facade, right of the kiosk)
    bx0 = x1 + 0.28; bx1 = bx0 + 0.46; bz0, bz1 = FL + 0.45, FL + 1.85
    g.cbox('XM_Door_Cranberry', (bx0, BY0 - 0.06, bz0), (bx1, BY0 + 0.01, bz1), b=0.02)
    g.cbox('XM_Fabric_Cream', (bx0 + 0.06, BY0 - 0.075, bz0 + 0.07), (bx1 - 0.06, BY0 - 0.06, bz1 - 0.07), b=0.004)
    for k in range(4):
        zc = bz1 - 0.21 - k * 0.32
        g.box('XM_Card_Red', (bx0 + 0.1, BY0 - 0.08, zc - 0.12), (bx1 - 0.1, BY0 - 0.075, zc + 0.12), faces='y')
        for dx in (-0.06, 0.06):     # two little people (head + shoulders), cream
            cx = (bx0 + bx1) / 2 + dx
            g.sphere('XM_Fabric_Cream', [cx, BY0 - 0.083, zc + 0.03], 0.035, seg=8, rings=4, scale=(1, 0.2, 1))
            g.sphere('XM_Fabric_Cream', [cx, BY0 - 0.083, zc - 0.07], 0.055, seg=8, rings=4, scale=(1, 0.2, 0.55))
    g.beam('XM_Brass', [bx0 + 0.12, BY0 - 0.03, bz1 + 0.12], [(bx0 + bx1) / 2, BY0 - 0.03, bz1 + 0.26], 0.012, 0.012)
    g.beam('XM_Brass', [bx1 - 0.12, BY0 - 0.03, bz1 + 0.12], [(bx0 + bx1) / 2, BY0 - 0.03, bz1 + 0.26], 0.012, 0.012)
    g.sphere('XM_Brass', [(bx0 + bx1) / 2, BY0 - 0.03, bz1 + 0.27], 0.03, seg=6, rings=4)

def build_nook(g, glow):
    """shallow display nook behind the curtain: floor, side + back walls, low ceiling, backdrop, red loveseat, warm dome light"""
    x0, x1 = BX0 + BWT, NOOK_X1; y0, y1 = BY0 + BWT, NOOK_Y1; ztop = FL + 2.85
    for k, x in enumerate(np.arange(x0, x1, 0.18)):
        g.box('XM_Floor_Board', (x + 0.004, y0 - 0.02, FL - 0.04), (min(x + 0.176, x1), y1, FL), faces='Z')
    g.box('XM_Beam_Dark', (x0, y0 - 0.02, FL - 0.045), (x1, y1, FL - 0.045), faces='Z')
    g.box('XM_Plaster_Inner', (x1, y0, FL), (x1 + 0.02, y1, ztop), faces='x')        # partition (faces the nook)
    g.box('XM_Plaster_Inner', (x0, y0, ztop), (x1, y1, ztop + 0.02), faces='z')       # ceiling
    # backdrop: cream panel with a scalloped red top, gold stars
    g.box('XM_Plaster_Inner', (x0, y1, FL), (x1, y1 + 0.02, ztop), faces='y')
    g.cbox('XM_Fabric_Cream', (x0 + 0.12, y1 - 0.04, FL + 0.5), (x1 - 0.12, y1, FL + 2.3), b=0.02)
    for k, x in enumerate(np.linspace(x0 + 0.2, x1 - 0.2, 7)):
        g.sphere('XM_Card_Red', [x, y1 - 0.045, FL + 2.3], 0.13, seg=8, rings=4, scale=(1, 0.18, 0.75))
    for (dx, dz) in ((0.35, 1.85), (1.0, 2.0), (1.6, 1.75), (0.65, 1.45), (1.35, 1.35), (1.85, 1.95)):
        star5(g, [x0 + dx, y1 - 0.05, FL + dz], r=0.07, depth=0.02, facing=(0, -1, 0), mat='XM_Ribbon_Gold')
    # loveseat (red), against the backdrop
    sx0, sx1 = x0 + 0.12, x1 - 0.12; sy1 = y1 - 0.04; sy0 = sy1 - 0.6
    g.cbox('XM_Beam_Honey', (sx0, sy0, FL), (sx1, sy1, FL + 0.28), b=0.025)
    g.cbox('XM_Sofa_Red', (sx0 + 0.03, sy0 + 0.02, FL + 0.28), (sx1 - 0.03, sy1 - 0.2, FL + 0.42), b=0.05)
    mid = (sx0 + sx1) / 2
    for a, b in ((sx0 + 0.04, mid - 0.01), (mid + 0.01, sx1 - 0.04)):
        g.cbox('XM_Sofa_Red', (a, sy1 - 0.22, FL + 0.38), (b, sy1, FL + 0.95), b=0.07)
    g.obox('XM_Plaid_Green', [sx0 + 0.32, sy0 + 0.25, FL + 0.55], (0.32, 0.12, 0.28), rotz(0.3) @ rotx(-0.3), b=0.04)
    g.obox('XM_Fabric_Cream', [sx1 - 0.35, sy0 + 0.25, FL + 0.55], (0.3, 0.12, 0.26), rotz(-0.25) @ rotx(-0.3), b=0.04)
    # warm dome light + curtain rod inside the arch
    glow.lathe('XM_Lamp_Shade', [(0.17, 0.0), (0.12, 0.07), (0.0, 0.08)], [(x0 + x1) / 2, (y0 + y1) / 2 - 0.1, ztop - 0.08], seg=12, cap_bot=True)
    g.box('XM_Rug_Red', ((x0 + x1) / 2 - 0.5, y0 + 0.05, FL + 0.002), ((x0 + x1) / 2 + 0.5, y0 + 0.65, FL + 0.012), faces='Z')

def build_entry_decor(g, glow):
    """curtains tied back in the arch, honey arch frame, garland with bulbs along the plate, bows, two lanterns, apex lantern"""
    F = WallFrame((BX0, BY0, DECK), (1, 0, 0), (0, -1, 0))
    uc = (EU0 + EU1) / 2; r = (EU1 - EU0) / 2; sp = E_TOP - DECK - r; v0 = V_FL
    # heavy honey frame around the arch
    pts = arch_pts(uc, sp, r, 12); fw = 0.13
    for (ua, va), (ub, vb) in zip(pts[:-1], pts[1:]):
        s1 = 1 + fw / 2 / r
        g.beam('XM_Beam_Honey', F.p(uc + (ua - uc) * s1, sp + (va - sp) * s1, 0.03), F.p(uc + (ub - uc) * s1, sp + (vb - sp) * s1, 0.03), 0.08, fw, up=F.W, b=0.0, ext=0.02)
    for u in (EU0 - fw / 2, EU1 + fw / 2):
        g.beam('XM_Beam_Honey', F.p(u, v0 - 0.02, 0.03), F.p(u, sp, 0.03), 0.08, fw, up=F.U, b=0.013)
    # curtains: draped and tied back, plus a short valance
    for s in (-1, 1):
        ue = uc + s * (r - 0.05)
        path = [F.p(ue, sp + r * 0.9, -0.06), F.p(ue - s * 0.08, sp + 0.2, -0.07), F.p(ue + s * 0.02, v0 + 0.95, -0.06), F.p(ue - s * 0.05, v0 + 0.02, -0.07)]
        g.tube('XM_Curtain_Red', path, [0.09, 0.14, 0.09, 0.17], seg=8, flat=0.5, up=F.W)
        g.torus('XM_Ribbon_Gold', F.p(ue + s * 0.02, v0 + 0.95, -0.06), 0.1, 0.025, seg=10, tseg=4, axis_R=np.stack([F.U, F.W, F.V], 1))
    for k in range(5):
        a = math.pi * (0.15 + 0.7 * k / 4)
        c = F.p(uc + r * 0.8 * math.cos(a), sp + r * 0.8 * math.sin(a) - 0.04, -0.06)
        g.sphere('XM_Curtain_Red', c, 0.12, seg=8, rings=4, scale=(1.1, 0.5, 0.7))
    # garland with warm bulbs along the plate beam, bows at both corners and between the entry and the kiosk
    zg = PLATE - 0.18
    hooks = [BX0 - 0.1, BX0 + EU1 + 0.21, BX1 - 1.62, BX1 + 0.1]
    for a, b in zip(hooks[:-1], hooks[1:]):
        garland(g, catenary([a, BY0 - 0.12, zg], [b, BY0 - 0.12, zg], 0.22, 14), r=0.08, seed=int(abs(a) * 10), bulb_gap=0.28)
    for x in hooks:
        bow(g, [x, BY0 - 0.17, zg + 0.02], size=0.22, facing=(0, -1, 0))
    lantern(g, [BX0 - 0.32, BY0 + 0.45, FL + 2.2], (-1, 0, 0))
    lantern(g, F.p(EU1 + 0.21, V_FL + 2.3, 0.32), F.W)
    lantern(g, [BX1 + 0.32, BY0 + 0.5, FL + 2.2], (1, 0, 0))
    # apex lantern under the front ridge (warm), wreath on the back gable for the back view
    ap = np.array([BCX, BY0 - OV_FRONT + 0.15, roof_under(BCX) - 0.35])
    g.beam('XM_Iron_Black', ap + [0, 0, 0.32], ap + [0, 0, 0.15], 0.02, 0.02)
    lantern_hang(g, ap)
    wreath(g, [BCX, BY1 + 0.06, PLATE + 0.9], R=0.32, facing=(0, 1, 0), seed=91)

def lantern_hang(g, c):
    c = np.asarray(c, float)
    g.cbox('XM_Iron_Black', c + [-0.1, -0.1, 0.1], c + [0.1, 0.1, 0.14], b=0.01)
    g.cbox('XM_Lantern_Glow', c + [-0.075, -0.075, -0.12], c + [0.075, 0.075, 0.1], b=0.0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.box('XM_Iron_Black', c + [sx * 0.08 - 0.012, sy * 0.08 - 0.012, -0.13], c + [sx * 0.08 + 0.012, sy * 0.08 + 0.012, 0.11])
    g.cbox('XM_Iron_Black', c + [-0.09, -0.09, -0.16], c + [0.09, 0.09, -0.12], b=0.008)
