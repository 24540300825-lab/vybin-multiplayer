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
export function grassTiles(kits, set, mats, skip) {
  const kit = kits.grassp; if (!kit) return null;
  const tpl = tplSize(set), C = 1.9, cells = new Map();
  let hs = 0, n = 0;
  for (const mm of mats) { V.setFromMatrixPosition(mm); const k = Math.floor(V.x / C) + ',' + Math.floor(V.z / C); if (!cells.has(k)) cells.set(k, V.y); hs += Math.hypot(mm.elements[4], mm.elements[5], mm.elements[6]); n++; }
  // chiều cao cỏ mới = cỏ cũ (trung bình) × 0.8; tấm HANA đo theo cọng (scale cọng trung vị)
  const target = tpl.h * (hs / Math.max(1, n)) * GRASS_K, bh = kit.lods[0].size.y * 0.62, s0 = Math.max(0.6, Math.min(1.8, target / bh));
  const out = [];
  for (const [k, y] of cells) {
    const [gx, gz] = k.split(',').map(Number), x = (gx + 0.5) * C + (hash(gx, gz, 1) - 0.5) * 0.6, z = (gz + 0.5) * C + (hash(gx, gz, 2) - 0.5) * 0.6;
    if (skip && skip(x, z)) continue;
    const s = s0 * (0.85 + 0.3 * hash(gx, gz, 3));
    out.push(new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E.set(0, hash(gx, gz, 4) * 6.283, 0)), S.set(s, s * (0.85 + 0.3 * hash(gx, gz, 5)), s)));
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
