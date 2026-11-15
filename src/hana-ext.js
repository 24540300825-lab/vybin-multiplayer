// Thay cây cỏ của vườn (Poly Nature / Scatter trong GLB ngoại cảnh, cả 4 cấp nhà) bằng bộ HANA (src/hana.js) — gọi từ exterior.js.
//   • tương ứng: cây → cây, bụi → bụi, cỏ → cỏ, hoa → hoa; scale tự quy đổi để bằng kích thước cây cỏ hiện có (cỏ thấp hơn ~20%)
//   • đá thường: rải theo CỤM (1 hòn chính + 1–4 hòn nhỏ, xoay/nghiêng/lún ngẫu nhiên) quanh chỗ đá cũ
//   • đá dẫn lối (M_PathStone): mỗi viên → 1 đá phẳng HANA cùng chỗ, cùng hướng, cùng cỡ; cỏ/hoa/đá không mọc đè lên đá dẫn lối
import * as THREE from 'three';
import {kitParts, HU} from './hana.js';

const KITS = {
  tree: ['tree1', 'tree2'],
  bush: ['bush2', 'bush3', 'bush4', 'berry'],
  grass: ['grassp'],
  flower: ['flowerc', 'flower1', 'flower2'],
  rock: ['rock1', 'rock2', 'rock3', 'rock4', 'rock5', 'rock6'],
  flat: ['flat1', 'flat2'],
};
export const HANA_CLS = new Set(['tree', 'bush', 'grass', 'flower', 'rock']);
const GRASS_K = 0.62;      // cỏ HANA thấp hơn cỏ cũ (cỏ cũ ~0.55–0.75 m → ~0.4–0.5 m)
const V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), M = new THREE.Matrix4(), R = new THREE.Matrix4(), E = new THREE.Euler();
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

// bộ mảnh để makeCells dựng InstancedMesh: mọi cấp LOD của 1 kit (mỗi mảnh mang .lod, .lodMax)
export function kitSet(kit) {
  const out = [], nl = kit.lods.length;
  for (let l = 0; l < nl; l++) for (const p of kitParts(kit, l)) out.push({geometry: p.geometry, material: p.material, lod: nl > 1 ? l : null, lodMax: nl - 1, hana: true, leaf: p.leaf, name: 'HANA_' + l});
  return out;
}

// kích thước mẫu cũ (hộp bao của mọi primitive trong nút)
function tplSize(set) {
  const b = new THREE.Box3();
  set.forEach(m => { const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); b.union(g.boundingBox); });
  const s = b.getSize(new THREE.Vector3());
  return {w: Math.max(s.x, s.z), h: s.y};
}

// hệ số scale kit → khớp cỡ mẫu cũ
function fitScale(cls, tpl, kit) {
  const k = kit.lods[0].size, kw = Math.max(k.x, k.z), kh = k.y;
  if (cls === 'tree') return tpl.h / kh;
  if (cls === 'bush') return Math.cbrt((tpl.w * tpl.w * tpl.h) / (kw * kw * kh));
  if (cls === 'grass') return tpl.h * GRASS_K / kh;
  if (cls === 'flower') return (tpl.h < 0.3 ? 0.32 : tpl.h) / kh;       // thảm hoa dại thấp (bồ công anh) → bông HANA nhỏ
  return tpl.w / kw;
}

// ---------------- đá dẫn lối ----------------
// mỗi mesh M_PathStone = nhiều viên đá rời → tách thành phần liên thông → tâm, hướng (PCA), cỡ, mặt trên
export function pathStones(env, kits, noPlant) {
  const stones = [], meshes = [];
  env.updateMatrixWorld(true);
  env.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
    if (![].concat(o.material).some(m => m && /^M_PathStone/.test(m.name || ''))) return;
    meshes.push(o);
    const g = o.geometry, pos = g.attributes.position, idx = g.index, n = pos.count;
    const par = new Int32Array(n).map((_, i) => i);
    const f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const u = (a, b) => { a = f(a); b = f(b); if (a !== b) par[a] = b; };
    if (idx) for (let t = 0; t < idx.count; t += 3) { u(idx.getX(t), idx.getX(t + 1)); u(idx.getX(t), idx.getX(t + 2)); }
    // đỉnh trùng vị trí (lưới tách UV) cũng nối lại
    const key = new Map();
    for (let i = 0; i < n; i++) { const k = Math.round(pos.getX(i) * 1e3) + ',' + Math.round(pos.getY(i) * 1e3) + ',' + Math.round(pos.getZ(i) * 1e3); const j = key.get(k); if (j === undefined) key.set(k, i); else u(i, j); }
    const comp = new Map();
    for (let i = 0; i < n; i++) { const r = f(i); (comp.get(r) || comp.set(r, []).get(r)).push(i); }
    for (const ids of comp.values()) {
      if (ids.length < 4) continue;
      let cx = 0, cz = 0, y0 = 1e9, y1 = -1e9; const P = [];
      for (const i of ids) { V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); P.push(V.x, V.z); cx += V.x; cz += V.z; y0 = Math.min(y0, V.y); y1 = Math.max(y1, V.y); }
      cx /= ids.length; cz /= ids.length;
      let sxx = 0, szz = 0, sxz = 0;
      for (let k = 0; k < P.length; k += 2) { const dx = P[k] - cx, dz = P[k + 1] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
      const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ca = Math.cos(ang), sa = Math.sin(ang);
      let ea = 0, eb = 0;
      for (let k = 0; k < P.length; k += 2) { const dx = P[k] - cx, dz = P[k + 1] - cz; ea = Math.max(ea, Math.abs(dx * ca + dz * sa)); eb = Math.max(eb, Math.abs(-dx * sa + dz * ca)); }
      if (ea < 0.08 || ea > 2.5) continue;
      stones.push({x: cx, z: cz, ang, ea, eb, y0, y1, r: Math.max(ea, eb)});
    }
  });
  // đặt đá phẳng HANA
  const per = {};
  for (const s of stones) {
    const id = KITS.flat[hash(s.x, s.z) < 0.5 ? 0 : 1], kit = kits[id]; if (!kit) continue;
    const sz = kit.lods[0].size, mx = kit.lods[0].max;
    // trục dài của đá HANA (x hay z) quay theo trục dài của viên đá cũ; cỡ theo diện tích mặt
    const along = sz.x >= sz.z ? 0 : Math.PI / 2;
    const sc = Math.sqrt((2 * s.ea * 2 * s.eb) / (sz.x * sz.z)) * 1.04;
    const yaw = -(s.ang) + along + (hash(s.x, s.z, 3) - 0.5) * 0.25;
    const top = s.y1 + 0.015;                                    // mặt đá HANA cao hơn mặt đá cũ một chút (đi lên không lút)
    M.compose(V.set(s.x, top - mx.y * sc, s.z), Q.setFromEuler(E.set(0, yaw, 0)), S.set(sc, sc, sc));
    (per[id] || (per[id] = [])).push(M.clone());
  }
  // tra nhanh: (x,z) có nằm trên/sát đá dẫn lối không
  const G = 2, grid = new Map();
  stones.forEach(s => { const r = s.r + 0.6; for (let gx = Math.floor((s.x - r) / G); gx <= Math.floor((s.x + r) / G); gx++) for (let gz = Math.floor((s.z - r) / G); gz <= Math.floor((s.z + r) / G); gz++) { const k = gx + ',' + gz; (grid.get(k) || grid.set(k, []).get(k)).push(s); } });
  const near = (x, z, m = 0.1) => { const l = grid.get(Math.floor(x / G) + ',' + Math.floor(z / G)); if (!l) return false;
    for (const s of l) { const dx = x - s.x, dz = z - s.z, ca = Math.cos(s.ang), sa = Math.sin(s.ang), a = dx * ca + dz * sa, b = -dx * sa + dz * ca;
      if ((a * a) / ((s.ea + m) * (s.ea + m)) + (b * b) / ((s.eb + m) * (s.eb + m)) < 1) return true; } return false; };
  // mặt nạ đá dẫn lối cho shader cỏ (từng cọng mọc trên đá → ẩn): 1 px = 8 cm
  if (stones.length) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    stones.forEach(s => { x0 = Math.min(x0, s.x - s.r - 1); x1 = Math.max(x1, s.x + s.r + 1); z0 = Math.min(z0, s.z - s.r - 1); z1 = Math.max(z1, s.z + s.r + 1); });
    const px = 0.08, W = Math.min(4096, Math.ceil((x1 - x0) / px)), H = Math.min(4096, Math.ceil((z1 - z0) / px)), a = new Uint8Array(W * H);
    const sx = (x1 - x0) / W, sz = (z1 - z0) / H;
    for (const s of stones) {
      const r = s.r + 0.1, ca = Math.cos(s.ang), sa = Math.sin(s.ang), ea = s.ea + 0.07, eb = s.eb + 0.07;
      for (let j = Math.max(0, Math.floor((s.z - r - z0) / sz)); j <= Math.min(H - 1, Math.ceil((s.z + r - z0) / sz)); j++)
        for (let i = Math.max(0, Math.floor((s.x - r - x0) / sx)); i <= Math.min(W - 1, Math.ceil((s.x + r - x0) / sx)); i++) {
          const dx = x0 + (i + 0.5) * sx - s.x, dz = z0 + (j + 0.5) * sz - s.z, A = dx * ca + dz * sa, B = -dx * sa + dz * ca;
          if ((A * A) / (ea * ea) + (B * B) / (eb * eb) < 1) a[j * W + i] = 255;
        }
    }
    const t = new THREE.DataTexture(a, W, H, THREE.RedFormat, THREE.UnsignedByteType); t.needsUpdate = true; t.magFilter = t.minFilter = THREE.NearestFilter; t.flipY = false;
    HU.uPMask.value = t; HU.uPMB.value.set(x0, z0, x1 - x0, z1 - z0);
  }
  return {stones, meshes, per, near};
}

// ---------------- cỏ: phủ kín bằng tấm cỏ HANA ----------------
// chỗ nào trước đây có cỏ (bản thể cỏ cũ) → lưới ô 1.7 m, mỗi ô 1 tấm cỏ 2×2 m (lệch, xoay, cao thấp ngẫu nhiên) → thảm cỏ dày liền
export function grassTiles(kits, set, mats, skip, area) {
  const kit = kits.grassp; if (!kit) return null;
  const tpl = tplSize(set), C = 1.9;
  let hs = 0, n = 0, ys = 0;
  for (const mm of mats) { hs += Math.hypot(mm.elements[4], mm.elements[5], mm.elements[6]); ys += mm.elements[13]; n++; }
  // chiều cao cỏ mới = cỏ cũ (trung bình) × GRASS_K; tấm HANA đo theo cọng (scale cọng trung vị)
  const target = tpl.h * (hs / Math.max(1, n)) * GRASS_K, bh = kit.lods[0].size.y * 0.62, s0 = Math.max(0.6, Math.min(1.8, target / bh)), y = n ? ys / n : 0;
  const out = [];
  // phủ KÍN cả vùng (area = [x0,x1,z0,z1]): 2 lớp đầy đủ lệch nửa ô, vị trí ngẫu nhiên trong ô → thảm liền; skip = chỗ không lộ đất
  const [ax0, ax1, az0, az1] = area;
  for (let gz = Math.floor(az0 / C); gz <= Math.ceil(az1 / C); gz++) for (let gx = Math.floor(ax0 / C); gx <= Math.ceil(ax1 / C); gx++)
    for (let L = 0; L < 2; L++) {
      const x = (gx + (L ? 1.0 : 0.5)) * C + (hash(gx, gz, 1 + L * 10) - 0.5) * C * 0.9, z = (gz + (L ? 1.0 : 0.5)) * C + (hash(gx, gz, 2 + L * 10) - 0.5) * C * 0.9;
      if (x < ax0 || x > ax1 || z < az0 || z > az1 || (skip && skip(x, z))) continue;
      const s = s0 * (0.82 + 0.36 * hash(gx, gz, 3 + L * 10));
      out.push(new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E.set(0, hash(gx, gz, 4 + L * 10) * 6.283, 0)), S.set(s, s * (0.85 + 0.3 * hash(gx, gz, 5 + L * 10)), s)));
    }
  return [{id: 'grassp', mats: out}];
}

// ---------------- cây / bụi / cỏ / hoa: bản thể cũ → kit HANA ----------------
// trả [{id, mats}] (ma trận thế giới mới, đã nhân scale quy đổi + xoay ngẫu nhiên quanh trục đứng)
export function toKits(kits, cls, set, mats, skip) {
  const ids = KITS[cls].filter(id => kits[id]); if (!ids.length) return null;
  const tpl = tplSize(set), out = new Map();
  for (const mm of mats) {
    V.setFromMatrixPosition(mm);
    if (skip && skip(V.x, V.z)) continue;
    const id = ids[Math.floor(hash(V.x, V.z, cls.length) * ids.length) % ids.length], kit = kits[id];
    const s = fitScale(cls, tpl, kit);
    const m = mm.clone().multiply(R.makeRotationY(hash(V.x, V.z, 7) * Math.PI * 2)).multiply(M.makeScale(s, s, s));
    (out.get(id) || out.set(id, []).get(id)).push(m);
  }
  return [...out].map(([id, m]) => ({id, mats: m}));
}

// ---------------- đá: cụm ----------------
// mỗi chỗ đá cũ: đá vừa (≥0.7 m) → cụm 3–5 hòn; đá nhỏ → 40% chỗ thành cụm 1–3 hòn (bố cục tự nhiên, không rải đều)
export function rockClumps(kits, set, mats, skip) {
  const ids = KITS.rock.filter(id => kits[id]); if (!ids.length) return null;
  const tpl = tplSize(set), out = new Map(), anchors = [];
  const put = (id, x, y, z, s, yaw, tx, tz, sink) => {
    const k = kits[id], h = k.lods[0].size.y * s;
    const m = new THREE.Matrix4().compose(V.set(x, y - h * sink, z), Q.setFromEuler(E.set(tx, yaw, tz)), S.set(s, s * (0.8 + 0.4 * hash(x, z, 9)), s));
    (out.get(id) || out.set(id, []).get(id)).push(m);
    return m;
  };
  for (const mm of mats) {
    mm.decompose(V, Q, S);
    const x0 = V.x, y0 = V.y, z0 = V.z, sizeT = tpl.w * S.x, big = sizeT > 0.7;
    if (!big && hash(x0, z0, 1) > 0.4) continue;
    if (skip && skip(x0, z0, 0.6)) continue;
    const aId = ids[Math.floor(hash(x0, z0, 2) * ids.length) % ids.length], aK = kits[aId], kw = Math.max(aK.lods[0].size.x, aK.lods[0].size.z);
    const sA = (big ? sizeT * (0.95 + 0.35 * hash(x0, z0, 4)) : Math.max(0.35, sizeT) * (1.1 + 0.6 * hash(x0, z0, 4))) / kw;
    const rA = kw * sA * 0.5;
    const am = put(aId, x0, y0, z0, sA, hash(x0, z0, 5) * 6.283, (hash(x0, z0, 6) - 0.5) * 0.24, (hash(x0, z0, 8) - 0.5) * 0.24, 0.18);
    anchors.push({id: aId, m: am, x: x0, z: z0, r: rA, h: aK.lods[0].size.y * sA * 0.82});
    const nSat = big ? 2 + Math.floor(hash(x0, z0, 10) * 3) : Math.floor(hash(x0, z0, 10) * 3);
    let a0 = hash(x0, z0, 11) * 6.283;
    for (let k = 0; k < nSat; k++) {
      const id = ids[Math.floor(hash(x0, z0, 20 + k) * ids.length) % ids.length], K = kits[id], w = Math.max(K.lods[0].size.x, K.lods[0].size.z);
      const s = sA * (0.28 + 0.34 * hash(x0, z0, 30 + k)) * (kw / w), r = w * s * 0.5;
      a0 += 1.1 + hash(x0, z0, 40 + k) * 1.6;
      const d = (rA + r) * (0.72 + 0.35 * hash(x0, z0, 50 + k)), x = x0 + Math.cos(a0) * d, z = z0 + Math.sin(a0) * d;
      if (skip && skip(x, z, r)) continue;
      put(id, x, y0, z, s, hash(x, z, 5) * 6.283, (hash(x, z, 6) - 0.5) * 0.4, (hash(x, z, 8) - 0.5) * 0.4, 0.25);
    }
  }
  return {groups: [...out].map(([id, m]) => ({id, mats: m})), anchors};
}

// ---------------- chậu cây trong nhà → chậu sứ HANA (pot5) ----------------
// nút Plant_<tên> (chậu + đất + lá gộp 1 lưới) hoặc Plant_<tên>_Pot/_Soil/_Leaf.N (phòng khách) → ẩn, đặt pot5 cùng chỗ, cùng cỡ
export function replaceIndoorPots(root, kits, id = 'pot5') {
  const kit = kits && kits[id]; if (!kit) return 0;
  const parts = kitParts(kit, 0), groups = new Map();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    let n = null; for (let q = o; q && q !== root; q = q.parent) { const m = /^(Plant_[A-Za-z0-9]+(?:_[A-Z](?![a-z]))?)/.exec(q.name || ''); if (m && /^Plant_/.test(q.name)) { n = m[1].replace(/_(Pot|Soil|Leaf)$/, ''); break; } }
    if (!n) return;
    (groups.get(n) || groups.set(n, []).get(n)).push(o);
  });
  const sz = kit.lods[0].size, kh = sz.y, kw = Math.max(sz.x, sz.z);
  let k = 0;
  for (const [name, list] of groups) {
    const b = new THREE.Box3(); list.forEach(o => b.expandByObject(o));
    if (b.isEmpty()) continue;
    const s3 = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const onlyPot = list.every(o => /_(Pot|Soil)$/.test(o.name));
    const h = onlyPot ? s3.y / 0.42 : s3.y, w = Math.max(s3.x, s3.z);
    const s = Math.min(h / kh, (w * (onlyPot ? 1.9 : 1.15)) / kw);
    list.forEach(o => { o.visible = false; });
    const g = new THREE.Group(); g.name = 'HANA_POT_' + name;
    g.position.set(c.x, b.min.y, c.z); g.scale.setScalar(s); g.rotation.y = hash(c.x, c.z, 1) * 6.283;
    for (const p of parts) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    // node cha của chậu cũ (có thể là nhóm grafted P_Plant_*) → gắn vào gốc map để giữ toạ độ thế giới
    root.attach(g); k++;
  }
  return k;
}

// ---------------- bụi: xếp có chủ ý (không rải ngẫu nhiên) ----------------
// 1 hàng dọc theo mặt trong hàng rào (cách rào ~1 m, nhịp ~2.7 m, chừa cổng/lối đi/công trình), 1 hàng chân tường nhà (3 cánh nhà),
// 1 hàng thưa ngoài hàng rào. Mỗi cạnh lặp nhịp 2 loại bụi xen kẽ → gọn, có trật tự như vườn được chăm.
export function bushLayout(kits, MC, onPath) {
  const ids = KITS.bush.filter(id => kits[id]); if (!ids.length || !MC.fence) return null;
  const F = MC.fence, np = MC.noPlant || [], house = np.slice(0, 3), out = new Map(), spots = [];
  const blocked = (x, z, m) => np.some(b => x > b[0] - m && x < b[1] + m && z > b[2] - m && z < b[3] + m) || onPath(x, z, 0.9);
  const put = (id, x, z, s, yaw) => { const m = new THREE.Matrix4().compose(V.set(x, MC.floorY || 0, z), Q.setFromEuler(E.set(0, yaw, 0)), S.set(s, s * (0.9 + 0.2 * hash(x, z, 3)), s));
    (out.get(id) || out.set(id, []).get(id)).push(m); spots.push({x, z, id, s}); };
  const size = id => { const k = kits[id].lods[0].size; return Math.max(k.x, k.z); };
  // đi dọc 1 đoạn thẳng, đặt bụi theo nhịp; pair = cặp loại bụi xen kẽ của cạnh này
  const line = (x0, z0, x1, z1, step, target, pair, check, sideSeed) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / step), dx = (x1 - x0) / L, dz = (z1 - z0) / L, off = (L - n * step) / 2;
    for (let i = 0; i <= n; i++) {
      const t = off + i * step, x = x0 + dx * t, z = z0 + dz * t;
      if (!check(x, z)) continue;
      const id = pair[i % 2], s = target / size(id) * (0.92 + 0.16 * hash(x, z, sideSeed));
      put(id, x, z, s, Math.atan2(dx, dz) + (hash(x, z, 5) - 0.5) * 0.6);
    }
  };
  const pairOf = k => [ids[k % ids.length], ids[(k + 1) % ids.length]];
  // hàng trong hàng rào
  const d = 1.15, gx = F[4];
  const inFence = (x, z) => !blocked(x, z, 1.0) && !(Math.abs(x - gx) < 3.2 && z > F[3] - 4);
  line(F[0] + d, F[2] + d, F[1] - d, F[2] + d, 2.7, 1.7, pairOf(0), inFence, 11);   // rào sau
  line(F[0] + d, F[3] - d, F[1] - d, F[3] - d, 2.7, 1.7, pairOf(2), inFence, 12);   // rào trước (chừa cổng)
  line(F[0] + d, F[2] + d + 2.7, F[0] + d, F[3] - d - 2.7, 2.7, 1.7, pairOf(1), inFence, 13);   // rào trái
  line(F[1] - d, F[2] + d + 2.7, F[1] - d, F[3] - d - 2.7, 2.7, 1.7, pairOf(3), inFence, 14);   // rào phải
  // hàng chân tường nhà (bụi nhỏ hơn, sát tường ~0.9 m, không chắn lối vào / cửa)
  // bậc thềm cửa chính (trục cửa = trục cổng F[4]) → không trồng bụi lên thềm
  const fz = Math.max(...house.map(b => b[3])), onPorch = (x, z) => Math.abs(x - F[4]) < 2.7 && z > fz - 0.5 && z < fz + 3.2;
  const g = 0.95, nearWall = (x, z) => !onPath(x, z, 1.1) && !onPorch(x, z) && x > F[0] + 2 && x < F[1] - 2 && z > F[2] + 2 && z < F[3] - 2
    && !np.slice(3).some(b => x > b[0] - 0.8 && x < b[1] + 0.8 && z > b[2] - 0.8 && z < b[3] + 0.8)
    && !house.some(b => x > b[0] - 0.3 && x < b[1] + 0.3 && z > b[2] - 0.3 && z < b[3] + 0.3);
  house.forEach((b, k) => {
    const pr = pairOf(k + 1);
    line(b[0] - g, b[3] + g, b[1] + g, b[3] + g, 2.4, 1.45, pr, nearWall, 20 + k);    // mặt trước
    line(b[0] - g, b[2] - g, b[1] + g, b[2] - g, 2.4, 1.45, pr, nearWall, 30 + k);    // mặt sau
    line(b[0] - g, b[2] + 1.2, b[0] - g, b[3] - 1.2, 2.4, 1.45, pr, nearWall, 40 + k); // hai đầu hồi
    line(b[1] + g, b[2] + 1.2, b[1] + g, b[3] - 1.2, 2.4, 1.45, pr, nearWall, 50 + k);
  });
  // hàng thưa ngoài hàng rào
  const o = 1.6, outF = (x, z) => !onPath(x, z, 1.2) && !(Math.abs(x - gx) < 4 && z > F[3]) && hash(x, z, 60) < 0.55;
  line(F[0] - o, F[2] - o, F[1] + o, F[2] - o, 4.2, 1.9, pairOf(1), outF, 61);
  line(F[0] - o, F[3] + o, F[1] + o, F[3] + o, 4.2, 1.9, pairOf(3), outF, 62);
  line(F[0] - o, F[2], F[0] - o, F[3], 4.2, 1.9, pairOf(0), outF, 63);
  line(F[1] + o, F[2], F[1] + o, F[3], 4.2, 1.9, pairOf(2), outF, 64);
  return {groups: [...out].map(([id, mats]) => ({id, mats})), spots};
}

// ---------------- cỏ xa: "tấm cỏ" chéo nhau, tô bằng ĐÚNG vật liệu cỏ HANA ----------------
// Mặt nạ (alpha + độ cao cọng + rand từng cọng) bake lúc tải từ chính tấm Grass_plane (nhìn ngang) → tấm chéo 3 mặt cùng cỡ tấm cỏ thật,
// shader cỏ dùng tip/rand của mặt nạ thay cho dữ liệu cọng → cùng màu, cùng shade, cùng gió, cùng bóng, cùng ánh sáng môi trường mọi giờ / thời tiết.
export function bakeGrassCard(renderer, kit) {
  const part = kitParts(kit, 0)[0]; if (!part || !renderer) return null;
  const g = part.geometry; if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox, W = Math.max(b.max.x - b.min.x, b.max.z - b.min.z), H = b.max.y - Math.min(0, b.min.y);
  const rt = new THREE.WebGLRenderTarget(512, 192, {generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true});
  const mat = new THREE.ShaderMaterial({side: THREE.DoubleSide,
    vertexShader: 'attribute vec4 _leaf;varying vec2 vL;void main(){vL=vec2(_leaf.w,_leaf.x);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vL;void main(){gl_FragColor=vec4(vL.x,vL.y,0.0,1.0);}'});
  const scene = new THREE.Scene(), m = new THREE.Mesh(g, mat); m.position.set(-(b.min.x + b.max.x) / 2, 0, 0); scene.add(m);
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H, 0, -20, 20); cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
  const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA);
  mat.dispose();
  // 3 tấm chéo 60°, gốc từng cột = chân tấm (gió / né đá dẫn lối theo cột)
  const P = [], N = [], U = [], R = [], VO = [], LF = [], I = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a), o = P.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = (u - 0.5) * W * ca, z = (u - 0.5) * W * sa;
      P.push(x, v * H, z); N.push(0, 1, 0); U.push(u, v); R.push(x, 0, z); VO.push(0, 127, 0, 0); LF.push(128, 0, 128, Math.round(v * 255));
    }
    I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); cg.setAttribute('_root', new THREE.Float32BufferAttribute(R, 3));
  cg.setAttribute('_voln', new THREE.BufferAttribute(new Int8Array(VO), 4, true)); cg.setAttribute('_leaf', new THREE.BufferAttribute(new Uint8Array(LF), 4, true));
  cg.setIndex(I); cg.computeBoundingBox(); cg.computeBoundingSphere();
  return {geometry: cg, texture: rt.texture, W, H};
}

// lưới tấm cỏ xa: trong hàng rào = đúng các ô có cỏ thật (cùng lưới grassTiles), ngoài hàng rào = phủ kín tới `ext` m
export function grassCardSpots(grassMats, MC, ext, skip) {
  const out = [...grassMats], C = 1.45, F = MC.fence;
  let as = 0; grassMats.forEach(m => { as += Math.hypot(m.elements[0], m.elements[1], m.elements[2]); }); as = grassMats.length ? as / grassMats.length : 1;
  if (F) for (let gz = Math.floor((F[2] - ext) / C); gz <= Math.ceil((F[3] + ext) / C); gz++) for (let gx = Math.floor((F[0] - ext) / C); gx <= Math.ceil((F[1] + ext) / C); gx++) {
    const x = (gx + 0.5) * C + (hash(gx, gz, 1) - 0.5) * C * 0.95, z = (gz + 0.5) * C + (hash(gx, gz, 2) - 0.5) * C * 0.95;
    if (x > F[0] - 0.4 && x < F[1] + 0.4 && z > F[2] - 0.4 && z < F[3] + 0.4) continue;    // trong rào: đã có lưới cỏ thật
    if (skip && skip(x, z)) continue;
    const s = as * (0.82 + 0.4 * hash(gx, gz, 3));
    out.push(new THREE.Matrix4().compose(V.set(x, MC.floorY || 0, z), Q.setFromEuler(E.set(0, hash(gx, gz, 4) * 6.283, 0)), S.set(s, s * (0.85 + 0.3 * hash(gx, gz, 5)), s)));
  }
  return out;
}

// ---------------- bồn hoa / chậu ngoài nhà (khối hoa vuông của bồn cửa sổ, ban công, hiên) → hàng chậu HANA pot1–4 ----------------
// Lưới hoa/lá (M_L2_Leaf*, M_L2_Bloom_*) trong các khối nhà PLANTER → gom thành từng bồn → ẩn, đặt chậu HANA dọc bồn, gốc chậu = mặt đất trong bồn.
// mọi lưới cây placeholder (khối hoa/lá vuông) — trừ những thứ không phải chậu: giàn/cổng hoa, dây leo, hàng rào cây, vườn cây ăn quả, tre, sen, bờ hồ, bể cá, quả địa cầu
const NOT_POT = /Hedge|Arch|Vines|Orchard|Bamboo|Lilies|Shore|Island|Aquarium|Earth|Onsen|Picnic/;
const BED = /Bed/;      // luống hoa sát đất → trồng hoa HANA kín luống (không đặt chậu)
const PLANT_MAT = /^M_L2_(Leaf|Leaf_Dark|Bloom_\w+)$/;
export function replacePlanterPots(root, kits, group) {
  const ids = ['pot1', 'pot2', 'pot3', 'pot4'].filter(id => kits[id]); if (!ids.length) return 0;
  root.updateMatrixWorld(true);
  const pts = [], hide = [], beds = [];
  root.traverse(o => {
    if (!o.isMesh || !o.visible || ![].concat(o.material).some(m => m && PLANT_MAT.test(m.name || ''))) return;
    let ok = true, bed = false; for (let q = o; q && q !== root; q = q.parent) { if (NOT_POT.test(q.name || '')) { ok = false; break; } if (BED.test(q.name || '')) bed = true; }
    if (!ok) return;
    if (bed) { beds.push(o); return; }
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); pts.push(V.x, V.y, V.z); }
    hide.push(o);
  });
  // luống hoa: hoa HANA (3 loại) trồng theo lưới 0.32 m lệch ngẫu nhiên, phủ kín hộp bao của cây trong luống
  const fl = ['flowerc', 'flower1', 'flower2'].filter(id => kits[id]), perF = new Map();
  if (fl.length) beds.forEach(o => {
    const b = new THREE.Box3().setFromObject(o); o.visible = false;
    for (let x = b.min.x + 0.16; x < b.max.x; x += 0.32) for (let z = b.min.z + 0.16; z < b.max.z; z += 0.32) {
      const jx = x + (hash(x, z, 1) - 0.5) * 0.22, jz = z + (hash(x, z, 2) - 0.5) * 0.22, id = fl[Math.floor(hash(x, z, 3) * fl.length) % fl.length], kh = kits[id].lods[0].size.y;
      const sc = (0.4 + 0.25 * hash(x, z, 4)) / kh;
      (perF.get(id) || perF.set(id, []).get(id)).push(new THREE.Matrix4().compose(V.set(jx, b.min.y - 0.02, jz), Q.setFromEuler(E.set(0, hash(x, z, 5) * 6.283, 0)), S.set(sc, sc, sc)));
    }
  });
  for (const [id, mats] of perF) for (const p of kitParts(kits[id], 0)) {
    const im = new THREE.InstancedMesh(p.geometry, p.material, mats.length); mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; im.name = 'HANA_BED_' + id; im.computeBoundingSphere(); group.add(im);
  }
  if (!pts.length) return perF.size;
  // gom bồn: ô lưới 0.3 m, nối các ô kề nhau (cùng độ cao ±0.4 m)
  const G = 0.3, cells = new Map();
  for (let i = 0; i < pts.length; i += 3) { const k = Math.floor(pts[i] / G) + ',' + Math.floor(pts[i + 1] / 0.4) + ',' + Math.floor(pts[i + 2] / G); (cells.get(k) || cells.set(k, []).get(k)).push(i); }
  const seen = new Set(), boxes = [];
  for (const k0 of cells.keys()) {
    if (seen.has(k0)) continue; seen.add(k0);
    const st = [k0], b = {x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9};
    while (st.length) { const k = st.pop(); for (const i of cells.get(k)) { b.x0 = Math.min(b.x0, pts[i]); b.x1 = Math.max(b.x1, pts[i]); b.y0 = Math.min(b.y0, pts[i + 1]); b.y1 = Math.max(b.y1, pts[i + 1]); b.z0 = Math.min(b.z0, pts[i + 2]); b.z1 = Math.max(b.z1, pts[i + 2]); }
      const [a, c, d] = k.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const kk = (a + dx) + ',' + (c + dy) + ',' + (d + dz); if (cells.has(kk) && !seen.has(kk)) { seen.add(kk); st.push(kk); } } }
    boxes.push(b);
  }
  hide.forEach(o => { o.visible = false; });
  // đặt chậu dọc trục dài của mỗi bồn
  const per = new Map();
  boxes.forEach((b, bi) => {
    // lưới chậu phủ cả bồn (bồn dài → 1 hàng, bồn rộng / luống trên bàn nhà kính → nhiều hàng), mỗi chậu ~0.55 m
    const lx = b.x1 - b.x0, lz = b.z1 - b.z0, nx = Math.max(1, Math.round(lx / 0.55)), nz = Math.max(1, Math.round(lz / 0.55)), sx = lx / nx, sz = lz / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const id = ids[(bi + i + j * 3) % ids.length], k = kits[id], kh = k.lods[0].size.y, kw = Math.max(k.lods[0].size.x, k.lods[0].size.z);
      const s = Math.min(Math.max(0.42, Math.min(0.62, (b.y1 - b.y0) * 2.2)) / kh, (Math.min(Math.max(sx, 0.3), Math.max(sz, 0.3)) * 0.95) / kw);
      const cx = b.x0 + sx * (i + 0.5), cz = b.z0 + sz * (j + 0.5);
      const m = new THREE.Matrix4().compose(V.set(cx, b.y0 - 0.02, cz), Q.setFromEuler(E.set(0, hash(cx, cz, 2) * 6.283, 0)), S.set(s, s, s));
      (per.get(id) || per.set(id, []).get(id)).push(m);
    }
  });
  let nPot = 0;
  for (const [id, mats] of per) for (const p of kitParts(kits[id], 0)) {
    const im = new THREE.InstancedMesh(p.geometry, p.material, mats.length); mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = true; im.name = 'HANA_POTS_' + id; im.computeBoundingSphere(); group.add(im); nPot = Math.max(nPot, 0) + (p === kitParts(kits[id], 0)[0] ? mats.length : 0);
  }
  return nPot;
}

// ---------------- chỗ nào lộ mặt đất? (bản đồ độ cao chụp từ trên xuống) ----------------
// Chụp env bằng camera trực giao từ trên: mỗi px = độ cao vật cao nhất. Cỏ chỉ mọc nơi không có vật gì cao hơn mặt đất (luống, sàn gỗ, hồ, nhà, đường đất…)
// → cỏ phủ kín mọi khoảng đất trống (kể cả lane giữa luống, mép lối đi), không phụ thuộc chỗ cỏ cũ từng mọc.
export function groundFree(renderer, env, x0, x1, z0, z1, floorY, px = 0.25) {
  const W = Math.min(2048, Math.ceil((x1 - x0) / px)), H = Math.min(2048, Math.ceil((z1 - z0) / px));
  const rt = new THREE.WebGLRenderTarget(W, H, {type: THREE.FloatType, depthBuffer: true});
  const mat = new THREE.ShaderMaterial({side: THREE.DoubleSide, vertexShader: `varying float vY;void main(){vec4 w=modelMatrix*vec4(position,1.0);
      #ifdef USE_INSTANCING
       w=modelMatrix*instanceMatrix*vec4(position,1.0);
      #endif
      vY=w.y;gl_Position=projectionMatrix*viewMatrix*w;}`, fragmentShader: 'varying float vY;void main(){gl_FragColor=vec4(vY,1.0,0.0,1.0);}'});
  const skip = o => { const ms = [].concat(o.material); return ms.some(m => m && (m.userData.hana || m.userData.ground || /^(M_PathStone|Plant_01|Poly|ROCK$|M_L4_Sand)/.test(m.name || ''))) || /Hill_Ground|^Plane\d*$|Ground/i.test(o.name || ''); };
  const hidden = []; env.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible && skip(o)) { o.visible = false; hidden.push(o); } });
  const tmp = new THREE.Scene(); tmp.overrideMaterial = mat; const par = env.parent, idx = par ? par.children.indexOf(env) : -1; tmp.add(env);
  const cam = new THREE.OrthographicCamera(x0, x1, -z0, -z1, 0.1, 400); cam.position.set(0, floorY + 200, 0); cam.up.set(0, 0, -1); cam.lookAt(0, floorY, 0);
  // camera nhìn thẳng xuống, up = -z → trục dọc ảnh = -z; left/right = x
  const prevT = renderer.getRenderTarget(), pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(tmp, cam);
  const buf = new Float32Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  renderer.setRenderTarget(prevT); renderer.setClearColor(pc, pa);
  if (par) { par.add(env); if (idx >= 0) { par.children.splice(par.children.indexOf(env), 1); par.children.splice(idx, 0, env); } }
  hidden.forEach(o => { o.visible = true; }); rt.dispose(); mat.dispose();
  const occ = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) occ[i] = buf[i * 4 + 1] > 0.5 && buf[i * 4] > floorY + 0.08 ? 1 : 0;
  // ô ảnh: hàng 0 = z1 (đáy ảnh, vì trục dọc = -z) → (x, z) → (i, j)
  return (x, z, m = 0) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return true;
    const r = Math.ceil(m / px);
    const ci = Math.floor((x - x0) / px), cj = Math.floor((z1 - z) / px);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue; if (occ[j * W + i]) return false; }
    return true;
  };
}
