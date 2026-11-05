// Map NGOÀI VƯỜN: biến các InstancedMesh khổng lồ trong GLB (cỏ, hoa, bụi, cây, đá) thành các "ô" (cell) nhỏ để
//   • frustum-cull theo ô   • LOD theo khoảng cách (thưa dần, rồi biến mất)   • chỉ ô gần mới đổ bóng   • rải thêm cây/cỏ/đá ra ngoài hàng rào
//   • sinh vật cản (thân cây, đá, tường nhà) cho lưới va chạm   • sương mù xa kiểu "lớp mây thấp" (haze ring).
// Mọi con số chất lượng nằm ở LEVELS (low/medium/high) — nối với TP.quality của game.
import * as THREE from 'three';
import {FILES} from './manifest.js';
import {makeDepthMat} from './foliage.js';
import {makeFoliageDecals} from './decals.js';

// ---- mức chất lượng: mật độ, tầm nhìn, bóng, số lớp sương, hạt mưa -----------------------------------------
export const LEVELS = {
  low:    {dens: 0.35, dist: 0.62, shadowR: 8,  grassShadowR: 0,  haze: 1, rain: 2400, far: 0.40, gNear: 0.45},
  medium: {dens: 0.55, dist: 0.85, shadowR: 9,  grassShadowR: 4,  haze: 2, rain: 4200, far: 0.60, gNear: 0.85},
  high:   {dens: 0.72, dist: 1.00, shadowR: 11, grassShadowR: 6,  haze: 2, rain: 6000, far: 0.80, gNear: 1.0},
  // map trong nhà (phòng khách / phòng Vy / phòng Bin): vườn chỉ thấy qua khung cửa → thưa hơn, gần hơn, cây cỏ không đổ bóng
  indoor: {dens: 0.80, dist: 1.00, shadowR: 0,  grassShadowR: 0,  haze: 1, rain: 2400, far: 0.45, gNear: 0.9},
};
// theo loại: tầm nhìn tối đa (m), đường cong mật độ theo khoảng cách (d0 = bắt đầu thưa, d1 = còn tối thiểu), có đổ bóng không
// "Đẹp chỗ cần đẹp": khoảng cách tính từ NHÂN VẬT (chỗ mắt người chơi nhìn). Quanh nhân vật đủ dày + đủ chi tiết;
// ra xa nhanh chóng thưa dần và đổi sang hình giảm tam giác (lod: từ khoảng này trở ra dùng bản ~12–16% tam giác).
const CLASS_OUT = {
  // KHÔNG còn mesh LOD giảm tam giác ở xa: cỏ/hoa/bụi thật chỉ trong ~15 m, cây/đá thật trong ~30 m; xa hơn là decal (src/decals.js)
  grass:  {maxD: 15,  d0: 7,  d1: 15,  min: 0.30, shadow: true,  cell: 9,  lod: 0},   // cỏ: ×2 bản thể, đủ dày trong ~7 m quanh nhân vật rồi thưa dần tới chỗ decal
  flower: {maxD: 9,   d0: 4,  d1: 9,   min: 0.20, shadow: false, cell: 10, lod: 0},   // hoa (938 tam giác/bông) chỉ hiện sát nhân vật
  bush:   {maxD: 18,  d0: 12, d1: 18,  min: 0.40, shadow: true,  cell: 12, lod: 0},
  tree:   {maxD: 32,  d0: 32, d1: 40,  min: 1.00, shadow: true,  cell: 14, lod: 0},
  rock:   {maxD: 34,  d0: 20, d1: 34,  min: 0.40, shadow: true,  cell: 12, lod: 0},
};
// 3 phòng trong nhà: chỉ giữ cây cỏ GẦN nhà, đủ chi tiết; xa hơn cũng là decal (thưa hơn)
const CLASS_IN = {   // trong nhà: khoảng cách tính từ HỘP NHÀ (không phải tâm nhìn) → chỉ phần sát cửa kính mới có mesh 3D, xa hơn là decal; ô nhỏ để cull chặt
  grass:  {maxD: 4.5, d0: 1,  d1: 4.5, min: 0.25, shadow: false, cell: 6,  lod: 0},
  flower: {maxD: 2.5, d0: 1,  d1: 2.5, min: 0.20, shadow: false, cell: 6,  lod: 0},
  bush:   {maxD: 8,   d0: 3,  d1: 8,   min: 0.35, shadow: false, cell: 8,  lod: 0},
  tree:   {maxD: 22,  d0: 8,  d1: 22,  min: 0.55, shadow: false, cell: 14, lod: 0},
  rock:   {maxD: 6,   d0: 3,  d1: 6,   min: 0.40, shadow: false, cell: 8,  lod: 0},
};
let CLASS = CLASS_OUT;

const M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), E = new THREE.Euler();
let _seed = 987654321;
const rnd = () => { _seed = (_seed * 16807) % 2147483647; return _seed / 2147483647; };

const isFoliageMat = n => /^Poly(Foliage|Shader)/i.test(n || '');
const isGrassMat = n => /^Plant_01/i.test(n || '');

// Giảm số tam giác bằng gom đỉnh theo lưới (vertex clustering): nhanh, không cần thư viện, giữ position/normal/uv. Dùng cho mức LOD xa.
const lodCache = new Map();
function simplified(g, ratio) {
  if (lodCache.has(g)) return lodCache.get(g);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, idx = g.index;
  const n = pos.count, tris = (idx ? idx.count : n) / 3;
  let out = null;
  if (tris > 160) {
    g.computeBoundingBox(); const b = g.boundingBox, ext = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) || 1;
    const target = Math.max(40, Math.floor(tris * ratio));
    const run = res => {
      const cell = ext / res, K = res + 2, map = new Map(), remap = new Int32Array(n);
      const P = [], N = [], U = [], C = [];
      for (let i = 0; i < n; i++) {
        const kx = Math.floor((pos.getX(i) - b.min.x) / cell), ky = Math.floor((pos.getY(i) - b.min.y) / cell), kz = Math.floor((pos.getZ(i) - b.min.z) / cell);
        const key = kx + K * (ky + K * kz); let j = map.get(key);
        if (j === undefined) { j = C.length; map.set(key, j); P.push(0, 0, 0); N.push(0, 0, 0); U.push(0, 0); C.push(0); }
        remap[i] = j; C[j]++; P[j * 3] += pos.getX(i); P[j * 3 + 1] += pos.getY(i); P[j * 3 + 2] += pos.getZ(i);
        if (nor) { N[j * 3] += nor.getX(i); N[j * 3 + 1] += nor.getY(i); N[j * 3 + 2] += nor.getZ(i); }
        if (uv) { U[j * 2] += uv.getX(i); U[j * 2 + 1] += uv.getY(i); }
      }
      const ind = [];
      for (let t = 0; t < tris; t++) {
        const a = remap[idx ? idx.getX(t * 3) : t * 3], b2 = remap[idx ? idx.getX(t * 3 + 1) : t * 3 + 1], c2 = remap[idx ? idx.getX(t * 3 + 2) : t * 3 + 2];
        if (a !== b2 && b2 !== c2 && a !== c2) ind.push(a, b2, c2);
      }
      return {P, N, U, C, ind};
    };
    let lo = 3, hi = 48, best = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1, r = run(mid); if (r.ind.length / 3 <= target) { best = r; lo = mid + 1; } else hi = mid - 1; }
    if (best && best.ind.length >= 24) {
      const m = best.C.length, P = new Float32Array(m * 3), N = new Float32Array(m * 3), U = new Float32Array(m * 2);
      for (let j = 0; j < m; j++) {
        const c = best.C[j]; P[j * 3] = best.P[j * 3] / c; P[j * 3 + 1] = best.P[j * 3 + 1] / c; P[j * 3 + 2] = best.P[j * 3 + 2] / c;
        const nx = best.N[j * 3], ny = best.N[j * 3 + 1], nz = best.N[j * 3 + 2], l = Math.hypot(nx, ny, nz) || 1; N[j * 3] = nx / l; N[j * 3 + 1] = ny / l; N[j * 3 + 2] = nz / l;
        U[j * 2] = best.U[j * 2] / c; U[j * 2 + 1] = best.U[j * 2 + 1] / c;
      }
      out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); if (uv) out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      out.setIndex(new THREE.BufferAttribute(m > 65535 ? new Uint32Array(best.ind) : new Uint16Array(best.ind), 1)); out.computeBoundingBox();
    }
  }
  lodCache.set(g, out); return out;
}

function geoInfo(g) {
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox, c = b.getCenter(new THREE.Vector3());
  return {b, c, h: Math.max(0.35, b.max.y)};
}

// c: {scene, env, MC, TU, toonMat, FU}
export function setupExterior(c) {
  const {scene, env, MC, toonMat} = c;
  const depthMat = makeDepthMat();
  let grassDepth = null, stemDepth = null;
  const group = new THREE.Group(); group.name = 'EXT_CELLS'; scene.add(group);
  const cells = [];          // {im, cls, n, cx, cz, r}
  const INDOOR = !!(c.MC && c.MC.indoor); CLASS = INDOOR ? CLASS_IN : CLASS_OUT;
  const colliders = {boxes: [], circles: []};
  env.updateMatrixWorld(true);

  // ---- 1) vật liệu: gắn cờ shader cho cây/cỏ (clone theo hình học để mỗi loại có tâm tán + chiều cao riêng) ----
  const matCache = new Map();
  let _gm = null;
  const grassMask = () => {
    if (_gm) return _gm;
    const f = FILES['grass-mask'];
    _gm = new THREE.TextureLoader().load('assets/' + f.file + '?v=' + f.v);
    _gm.colorSpace = THREE.NoColorSpace; _gm.flipY = false; _gm.anisotropy = 4; _gm.wrapS = _gm.wrapT = THREE.ClampToEdgeWrapping;
    return _gm;
  };
  function styleMat(m, geo, cls) {
    const nm = m.name || '';
    const grass = isGrassMat(nm), fol = !grass && isFoliageMat(nm);
    if (!grass && !fol) return m;
    const key = m.uuid + '|' + geo.uuid + '|' + cls;
    let r = matCache.get(key); if (r) return r;
    // vài vật liệu hoa trong file là KHR_materials_unlit (MeshBasic) → dựng lại thành Standard cùng màu để nhận ánh sáng/bóng như lá
    r = m.isMeshStandardMaterial ? m.clone() : new THREE.MeshStandardMaterial({color: m.color.clone(), map: m.map}); r.name = nm; r.side = THREE.DoubleSide;
    const gi = geoInfo(geo);
    r.userData = {...r.userData, cloudV: true, center: gi.c.clone(), hInv: 1 / gi.h};
    if (geo.attributes._root) r.userData.stemR = true;      // cây cỏ người chơi rải: gốc gió theo từng nhánh (foliage.js STEMR)
    if (grass) {
      r.userData.grass = true; r.color.set(0xffffff);
      r.alphaMap = grassMask(); r.alphaTest = 0.4;          // mỗi cọng/cụm cỏ là card có UV (TEXCOORD_0) trỏ vào atlas alpha 6400² → cắt hình đúng như trong Blender
    } else {
      r.userData.fol2 = true;
      if (gi.h < 0.9) r.userData.squash = true;             // hoa thấp: cúi xuống quanh chân người chơi
      else r.userData.occ = true;                           // bụi/cây cao: mờ dần khi chắn giữa camera và người
      // lá chưa có màu/texture (trắng): tô xanh lá theo palette của các lá có màu trong file
      if (!r.map && !geo.attributes.color && r.color.r > 0.95 && r.color.g > 0.95 && r.color.b > 0.95) {     // (có màu đỉnh = đã có màu thật → giữ)
        if (FOLMAP && /Foliage_v01_C/.test(nm)) { r.color.setRGB(0.3, 0.4, 0.2); r.userData.bush = true; }     // bụi: màu xanh phẳng + shading 'tự đổ bóng' trong shader (BUSHF, foliage.js) — không dùng gradient texture (gây dải màu lạ)
        else r.color.setRGB(0.30, 0.42, 0.04);
      }
    }
    if (fol && cls === 'bush' && gi.h >= 0.9) r.userData.bush = true;     // mọi bụi (kể cả bụi có texture): tô theo bảng màu cỏ/thảm + chiếu sáng như thảm (BUSHF)
    if (fol && r.map) r.color.multiply(new THREE.Color(0.94, 1.0, 1.1));     // bớt vàng: kéo cây/bụi về xanh lá cùng tông nền
    r.userData.desat = grass ? 0.95 : (r.userData.bush ? 0.95 : (r.userData.squash ? 0.8 : 0.88));     // hoa/bụi/cây bớt rực → tông điện ảnh
    r.metalness = 0; r.roughness = 1;
    toonMat(r); matCache.set(key, r); return r;
  }

  // ---- vật liệu & dọn dẹp theo feedback ----
  const tintMats = {rock: [], path: []};
  const PATHC = [0.86, 0.84, 0.74];      // đá dẫn đường: kem trắng (file gốc vàng đậm) — đá rời lấy cùng màu
  let FOLMAP = null, roofMat = null;
  const dropList = [];
  env.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m) continue;
      const nm = m.name || '';
      if (/^M_PathStone/.test(nm) && !tintMats.path.includes(m)) { tintMats.path.push(m); m.color.setRGB(...PATHC); }
      if (/^ROCK$/.test(nm) && !tintMats.rock.includes(m)) { tintMats.rock.push(m); m.color.setRGB(...PATHC); }
      if (m.map && m.map.name === 'foliage-a-v01') FOLMAP = m.map;
      if (m.map && m.map.name === 'roof_tiles_02_color_1k' && !roofMat) roofMat = m;
    }
    // mặt phẳng scatter (không vật liệu, phẳng, rộng) — chỉ dùng để rải cây ở Blender → bỏ
    if (!o.isInstancedMesh && !(o.material && (o.material.name || (Array.isArray(o.material) && o.material.length)))) {
      const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3());
      if (sz.y < 0.2 && sz.x * sz.z > 4) dropList.push(o);
    }
  });
  dropList.forEach(o => o.removeFromParent());
  // mái ngói hiên cửa chính: file gán nhầm vật liệu bê tông (nhạt) → dùng chung vật liệu ngói với mái nhà
  // mật độ texel = diện tích UV / diện tích thế giới của các tam giác dùng roofMat; mái hiên chỉnh UV để mật độ khớp mái chính
  const uvDensity = (o, only) => {
    const g = o.geometry, pos = g.attributes.position, uv = g.attributes.uv; if (!uv) return 0;
    const idx = g.index, n = (idx ? idx.count : pos.count), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    o.updateWorldMatrix(true, false); let wa = 0, ua = 0;
    const mats = Array.isArray(o.material) ? o.material : null, groups = g.groups.length ? g.groups : [{start: 0, count: n, materialIndex: 0}];
    for (const gr of groups) {
      const mm = mats ? mats[gr.materialIndex] : o.material; if (only && !(mm && mm.map === only.map)) continue;
      for (let t = gr.start; t < Math.min(n, gr.start + gr.count); t += 3) {
        const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
        wa += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
        const ux = uv.getX(i1) - uv.getX(i0), uy = uv.getY(i1) - uv.getY(i0), vx = uv.getX(i2) - uv.getX(i0), vy = uv.getY(i2) - uv.getY(i0);
        ua += Math.abs(ux * vy - uy * vx) / 2;
      }
    }
    return wa > 1e-6 ? ua / wa : 0;
  };
  if (roofMat) {
    let dMain = 0, nMain = 0; const hoods = [];
    env.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const ms = [].concat(o.material);
      if (/^Entrance_Hood_TileRoof/.test(o.name)) { hoods.push(o); return; }
      if (ms.some(m => m && m.map === roofMat.map)) { const d = uvDensity(o, roofMat); if (d > 0) { dMain += d; nMain++; } }
    });
    dMain = nMain ? dMain / nMain : 0;
    hoods.forEach(o => {
      const old = [].concat(o.material), isC = m => /^Stylized Concrete/.test((m && m.name) || '');
      if (!old.some(isC)) return;
      const swapped = Array.isArray(o.material) ? o.material.map(m => (isC(m) ? roofMat : m)) : roofMat;
      const prev = o.material; o.material = swapped;
      const dh = uvDensity(o, roofMat);
      if (dMain > 0 && dh > 0) {
        const k = Math.sqrt(dMain / dh), g = o.geometry = o.geometry.clone(), uv = g.attributes.uv, idx = g.index;
        const n = idx ? idx.count : g.attributes.position.count, groups = g.groups.length ? g.groups : [{start: 0, count: n, materialIndex: 0}];
        const mats = Array.isArray(swapped) ? swapped : null, seen = new Set();
        for (const gr of groups) {
          if ((mats ? mats[gr.materialIndex] : swapped) !== roofMat) continue;
          for (let t = gr.start; t < Math.min(n, gr.start + gr.count); t++) { const i = idx ? idx.getX(t) : t; if (seen.has(i)) continue; seen.add(i); uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); }
        }
        uv.needsUpdate = true;
      }
    });
  }
  // vật liệu công trình (gạch, hàng rào, tường…) hơi quá bão hoà → giảm rất nhẹ
  env.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m || !m.isMeshStandardMaterial) continue;
      const nm = m.name || '';
      if (isFoliageMat(nm) || isGrassMat(nm) || /^M_PathStone|^ROCK$/.test(nm)) continue;
      m.userData.desat = 0.9;
      // cân bằng độ nổi giữa các nhóm vật liệu (đá sáng hơn một chút, gỗ/gạch bớt rực) để không món nào lấn át
      if (/stone|Stone/.test(nm) && m.color) { m.color.multiplyScalar(1.14); m.userData.desat = 0.82; }
      else if (/wood|Wood/.test(nm)) m.userData.desat = 0.78;
      else if (/Roof_Tile|Brick/.test(nm)) m.userData.desat = 0.85;
    }
  });

  // ---- 2) gom InstancedMesh lớn ra khỏi env → chia ô ----
  const lst = [];
  env.traverse(o => { if (o.isInstancedMesh && o.count > 24 && !/^\.SF_/.test(o.name)) lst.push(o); });
  const templates = {grass: [], flower: [], bush: [], tree: [], rock: []};
  let nIn = 0;
  const classOf = (m, parts) => {
    const mn = (Array.isArray(m.material) ? m.material[0] : m.material).name || '';
    if (/^ROCK$/i.test(mn)) return 'rock';
    if (isGrassMat(mn)) return 'grass';
    const tris = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    const hasWood = parts.some(p => /wood/i.test(p.material.name || ''));
    if (hasWood) return 'tree';
    if (/bush/i.test(m.name || '')) return 'bush';       // bụi dại (blackberry…) là hàng rào cây thật, không phải hoa → giữ đủ tầm nhìn/mật độ như bush
    return tris > 1500 ? 'bush' : 'flower';
  };
  // một "nút" có thể là Group nhiều InstancedMesh (nhiều primitive: thân + tán) → gom theo cha để phân loại tree/bush
  const byParent = new Map();
  lst.forEach(m => { const k = m.parent; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(m); });
  const items = [];
  for (const [par, ms] of byParent) {
    const grouped = par && par !== env && par.isGroup && !par.isMesh && ms.length > 1 && ms.length === par.children.length && ms.every(m => m.count === ms[0].count);
    const sets = grouped ? [ms] : ms.map(m => [m]);
    sets.forEach(set => { const cls = classOf(set[0], set); items.push({set, cls}); });
  }
  const treeSpots = [];
  const treeH = set => { let h = 0; set.forEach(m => { const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); h = Math.max(h, g.boundingBox.max.y); }); return Math.max(2, h); };
  const tmpM = new THREE.Matrix4();
  for (const {set, cls} of items) {
    const CL = CLASS[cls];
    // ma trận thế giới của mọi bản thể (dùng bản của mesh đầu để đặt vị trí; các primitive cùng nút có chung ma trận)
    const ref = set[0]; ref.updateWorldMatrix(true, false);
    const W = ref.matrixWorld; let mats = [];
    const dt = MC.dropTrees;
    for (let i = 0; i < ref.count; i++) { ref.getMatrixAt(i, tmpM); const mm = tmpM.clone().premultiply(W); if (dt && cls === 'tree') { V3.setFromMatrixPosition(mm); if (dt.some(q => Math.hypot(V3.x - q[0], V3.z - q[1]) < 1.6)) continue; } if (MC.noPlant) { V3.setFromMatrixPosition(mm); const pd = cls === 'tree' ? 2.6 : cls === 'bush' ? 0.5 : 0; if (MC.noPlant.some(b => V3.x > b[0] - pd && V3.x < b[1] + pd && V3.z > b[2] - pd && V3.z < b[3] + pd)) continue; }   // cây to: chừa thêm 2.6 m quanh tường để tán không đâm xuyên vào phòng   // không mọc cây/cỏ trong lòng nhà (lộ ra ở các phòng mặt cắt) 
      mats.push(mm); }
    if (!mats.length) { set.forEach(m => m.removeFromParent()); continue; }
    nIn += mats.length;
    templates[cls].push({set, mats});
    if (cls === 'tree') { const hl = treeH(set); mats.forEach(mm => { V3.setFromMatrixPosition(mm); treeSpots.push({x: V3.x, y: V3.y, z: V3.z, h: hl * Math.hypot(mm.elements[4], mm.elements[5], mm.elements[6])}); }); }
    // vật cản: thân cây / đá
    if (cls === 'tree' || cls === 'rock') addColliders(cls, set, mats);
    // cỏ um tùm: thêm 1 bản sao lệch 0.35–0.9 m / xoay / nhỏ hơn chút cho mỗi cụm cỏ (×2 mật độ; vùng xa vẫn bị thưa bớt theo khoảng cách)
    if (cls === 'grass') { const add = [], mT = new THREE.Matrix4(), mR = new THREE.Matrix4(), mS = new THREE.Matrix4();
      for (const mm of mats) { const a = rnd() * 6.283, r = 0.35 + rnd() * 0.55; V3.setFromMatrixPosition(mm); const x = V3.x + Math.cos(a) * r, z = V3.z + Math.sin(a) * r;
        if (MC.noPlant && MC.noPlant.some(b => x > b[0] && x < b[1] && z > b[2] && z < b[3])) continue;
        const sc = 0.8 + rnd() * 0.25; add.push(mm.clone().multiply(mR.makeRotationY(rnd() * 6.283)).multiply(mS.makeScale(sc, sc * (0.85 + rnd() * 0.3), sc)).premultiply(mT.makeTranslation(x - V3.x, 0, z - V3.z))); }
      mats = mats.concat(add); }
    const buckets = new Map();
    mats.forEach(mm => { V3.setFromMatrixPosition(mm); const k = Math.floor(V3.x / CL.cell) + ',' + Math.floor(V3.z / CL.cell); let b = buckets.get(k); if (!b) { b = []; buckets.set(k, b); } b.push(mm); });
    for (const arr of buckets.values()) makeCells(set, cls, arr);
    set.forEach(m => m.removeFromParent());
  }

  function makeCells(set, cls, arr, far) {
    // xáo trộn → n phần tử đầu luôn là tập con đồng đều (LOD mật độ)
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    let cx = 0, cz = 0; arr.forEach(mm => { V3.setFromMatrixPosition(mm); cx += V3.x; cz += V3.z; }); cx /= arr.length; cz /= arr.length;
    for (const src of set) {
      // src.raw: vật cứng do người chơi rải (đá, gốc cây, nấm, xương rồng) — giữ vật liệu toon gốc, KHÔNG cờ lá (không lay gió / không cúi khi đi qua)
      const mat = src.raw ? src.material : styleMat(Array.isArray(src.material) ? src.material[0] : src.material, src.geometry, cls);
      const im = new THREE.InstancedMesh(src.geometry, mat, arr.length);
      arr.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.instanceMatrix.needsUpdate = true; im.matrixAutoUpdate = false; im.castShadow = false; im.receiveShadow = cls === 'tree' || cls === 'rock';     // cỏ chỉ ĐỔ bóng xuống thảm, không nhận bóng của chính cỏ → đồng màu, hoà vào thảm
      im.computeBoundingSphere();
      { const ids = arr.map(mm => mm.pid); if (ids[0] !== undefined) im.userData.ids = ids; }     // cây người chơi rải: id từng bản thể (bấm chọn được)
      if (mat.userData.grass) { if (!grassDepth) grassDepth = makeDepthMat(grassMask()); im.customDepthMaterial = grassDepth; }
      else if (mat.userData.fol2) im.customDepthMaterial = mat.userData.stemR ? (stemDepth ||= makeDepthMat(null, true)) : depthMat;
      group.add(im);
      // mức LOD xa: cùng ma trận (dùng chung buffer), hình học đã giảm ~85% tam giác
      let im1 = null; const lg = CLASS[cls].lod ? simplified(src.geometry, cls === 'tree' || cls === 'bush' ? 0.12 : 0.16) : null;
      if (lg) { im1 = new THREE.InstancedMesh(lg, mat, arr.length); im1.instanceMatrix = im.instanceMatrix; im1.matrixAutoUpdate = false; im1.castShadow = false; im1.receiveShadow = cls === 'tree' || cls === 'rock'; im1.boundingSphere = im.boundingSphere; im1.visible = false; im1.userData.ids = im.userData.ids;
        if (im.customDepthMaterial) im1.customDepthMaterial = im.customDepthMaterial; group.add(im1); }
      cells.push({im, im1, cls, n: arr.length, cx, cz, far: !!far});
    }
  }

  // ---- 3) vật cản ----
  function addColliders(cls, set, mats) {
    // thân cây: dùng primitive gỗ; đá: cả khối. Bán kính lấy từ hình học ở thấp (y<~1m) × scale từng bản thể.
    const src = cls === 'tree' ? (set.find(m => /wood/i.test((m.material.name || ''))) || set[0]) : set[0];
    const g = src.geometry, pos = g.attributes.position, ylim = cls === 'tree' ? 1.2 : 0.5;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ymax = 0;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > ymax) ymax = y; if (y > ylim) continue; const x = pos.getX(i), z = pos.getZ(i); if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (x0 > x1) return;
    const lc = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2), lr = Math.max(x1 - x0, z1 - z0) / 2 * (cls === 'rock' ? 0.82 : 1.0);
    for (const mm of mats) {
      const sc = Math.hypot(mm.elements[0], mm.elements[1], mm.elements[2]);
      const r = lr * sc * (cls === 'rock' ? 0.55 : 1) + (cls === 'tree' ? 0.03 : 0);   // đá: vùng cản nhỏ hơn hình thật → nhân vật lướt qua dễ
      if (r < (cls === 'rock' ? 0.3 : 0.18)) continue;              // đá nhỏ / thân mảnh: bước qua được
      if (cls === 'rock' && ymax * sc < 0.5) continue;
      const p = lc.clone().applyMatrix4(mm);
      colliders.circles.push({x: p.x, z: p.z, r});
    }
  }
  // vật thể lẻ (không instancing): đá/cây thả rời → hộp; tường nhà theo MC.block → hộp lớn
  env.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.visible === false) return;
    if (MC.block && MC.block.test(o.name)) { const b = new THREE.Box3().setFromObject(o); if (!b.isEmpty()) colliders.boxes.push(b); return; }
    if (MC.blockSmall && MC.blockSmall.test(o.name)) { const b = new THREE.Box3().setFromObject(o); if (!b.isEmpty() && b.max.y > (MC.floorY || 0) + 0.15) { const s = b.getSize(new THREE.Vector3()); b.expandByVector(new THREE.Vector3(-s.x * 0.12, 0, -s.z * 0.12)); colliders.boxes.push(b); } }
  });

  // ---- 4) rải thêm cây / bụi / đá / cỏ / hoa ra ngoài hàng rào (mẫu: bản thể có sẵn trong GLB → cùng kiểu, cùng màu) ----
  const R0 = MC.fence;           // [x0,x1,z0,z1] mặt ngoài hàng rào
  const inside = (x, z, m) => x > R0[0] - m && x < R0[1] + m && z > R0[2] - m && z < R0[3] + m;
  const distFence = (x, z) => { const dx = Math.max(R0[0] - x, 0, x - R0[1]), dz = Math.max(R0[2] - z, 0, z - R0[3]); return Math.hypot(dx, dz); };
  const gateClear = (x, z) => x > R0[4] - 3.2 && x < R0[4] + 3.2 && z > R0[3] - 1 && z < R0[3] + 16;     // chừa lối trước cổng
  function scatter(cls, count, rMin, rMax, pick) {
    const T = templates[cls]; if (!T.length) return;
    const R = MC.farR || 150, out = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 40) {
      const x = R0[0] - R + rnd() * (R0[1] - R0[0] + 2 * R), z = R0[2] - R + rnd() * (R0[3] - R0[2] + 2 * R);
      const d = distFence(x, z); if (d < rMin || d > rMax || inside(x, z, rMin)) continue;
      if (cls !== 'grass' && cls !== 'flower' && gateClear(x, z)) continue;
      if (!pick(d)) continue;
      out.push([x, z]);
    }
    // mỗi vị trí mượn xoay/scale của một bản thể gốc ngẫu nhiên → giữ đúng phân bố kích thước cây của bạn
    const per = new Map();
    out.forEach(([x, z]) => {
      const t = T[(rnd() * T.length) | 0], src = t.mats[(rnd() * t.mats.length) | 0];
      src.decompose(V3, Q, S3);
      // cây ngoài hàng rào: luôn có bản decal; chỉ cây sát hàng rào (người chơi có thể lại gần) mới có thêm cây 3D
      if (cls === 'tree') { treeSpots.push({x, y: V3.y, z, h: treeH(t.set) * S3.y, far: true}); if (distFence(x, z) > 30) return; }
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, V3.y, z), Q, S3);
      const CL = CLASS[cls], FC = CL.cell * 3, k = (T.indexOf(t)) + '|' + Math.floor(x / FC) + ',' + Math.floor(z / FC);   // rải ngoài hàng rào: ô to gấp 3 (thưa, ở xa → ít lượt vẽ)
      let b = per.get(k); if (!b) { b = {t, arr: []}; per.set(k, b); } b.arr.push(m);
    });
    for (const b of per.values()) makeCells(b.t.set, cls, b.arr, true);
    return out.length;
  }
  const farN = {};
  const F = MC.farDensity || 1;
  farN.tree = scatter('tree', Math.round(1100 * F), 2.2, 150, d => rnd() < 0.95 - d / 260);
  // cỏ/hoa/bụi/đá 3D ngoài hàng rào: chỉ dải sát hàng rào (xa hơn là thảm + decal cỏ)
  farN.bush = scatter('bush', Math.round(110 * F), 1.8, 18, () => true);
  farN.rock = scatter('rock', Math.round(24 * F), 3, 30, () => true);
  farN.grass = scatter('grass', Math.round(1700 * F), 0.9, 15, d => rnd() < 1.0 - d / 22);
  farN.flower = scatter('flower', Math.round(300 * F), 0.9, 14, d => rnd() < 1.0 - d / 20);
  // ---- 4c) DECAL: dải cỏ um tùm phủ khắp vườn + ra xa (hiện từ ~15 m), cây xa = tấm cây (hiện từ ~30 m) ----
  const decGrass = [];
  { const step0 = INDOOR ? 2.0 : 1.45, step1 = INDOOR ? 3.6 : 2.35, ext = INDOOR ? 70 : 95, y = MC.floorY || 0, np = MC.noPlant || [];
    for (let z = R0[2] - ext; z < R0[3] + ext; z += 1) {
      const inZ = z > R0[2] && z < R0[3];
      for (let x = R0[0] - ext; x < R0[1] + ext; x += 1) {
        const inn = inZ && x > R0[0] && x < R0[1], st = inn ? step0 : step1;
        if (rnd() > 1 / (st * st)) continue;                 // mật độ ~ 1 tấm / st² m²
        const jx = x + rnd(), jz = z + rnd();
        if (np.some(b => jx > b[0] - 1.2 && jx < b[1] + 1.2 && jz > b[2] - 1.2 && jz < b[3] + 1.2)) continue;
        const w = 2.0 + rnd() * 1.9;
        decGrass.push({x: jx, y: y - 0.04, z: jz, s: w / 8.932, hue: 0, val: (rnd() - 0.5) * 0.04});   // lệch màu rất nhẹ: cỏ phải tệp màu thảm
      }
    }
  }
  const DEC = makeFoliageDecals({scene, toonMat, trees: treeSpots, grass: decGrass, indoor: INDOOR});

  // ---- 4b) lớp CÂY NGƯỜI CHƠI RẢI (src/build/furniture.js): đi CHUNG đường ống với cây vườn — styleMat (gió, tâm tán, bụi, cúi khi đi qua,
  //      mờ khi chắn camera, giảm rực), bóng lá riêng, chia ô + frustum cull, LOD giảm tam giác, chỉ ô gần đổ bóng. Không bao giờ bị thưa theo khoảng cách.
  const userCells = new Map();
  function removeUser(key) {
    const l = userCells.get(key); if (!l) return;
    l.forEach(ce => { group.remove(ce.im); if (ce.im1) group.remove(ce.im1); const i = cells.indexOf(ce); if (i >= 0) cells.splice(i, 1); });
    userCells.delete(key);
  }
  // set = [{geometry, material}] (các mảnh của 1 biến thể, ma trận cục bộ = đơn vị), mats = ma trận thế giới (mm.pid = id món)
  function setUser(key, set, cls, mats) {
    removeUser(key); if (!mats.length || !CLASS[cls]) return;
    const CL = CLASS[cls], before = cells.length, buckets = new Map();
    mats.forEach(mm => { V3.setFromMatrixPosition(mm); const k = Math.floor(V3.x / CL.cell) + ',' + Math.floor(V3.z / CL.cell); (buckets.get(k) || buckets.set(k, []).get(k)).push(mm); });
    for (const arr of buckets.values()) makeCells(set, cls, arr);
    const mine = cells.slice(before); mine.forEach(ce => { ce.user = true; });
    userCells.set(key, mine);
  }
  const userKeys = () => [...userCells.keys()];
  const userMeshes = () => { const o = []; userCells.forEach(l => l.forEach(ce => { if (ce.im.visible) o.push(ce.im); if (ce.im1 && ce.im1.visible) o.push(ce.im1); })); return o; };

  // ---- 5) "haze ring": lớp sương thấp xa, đậm ở chân và tan dần lên cao → cây xa chìm vào sương, cảm giác không gian rộng ----
  const hazes = [];
  const hazeMat = (H, A) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    uniforms: {uCol: {value: new THREE.Color('#dfe9f2')}, uA: {value: A}, uH: {value: H}},
    vertexShader: 'varying float vY;uniform float uH;void main(){vY=(position.y)/uH+0.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 uCol;uniform float uA;varying float vY;void main(){float a=uA*pow(1.0-smoothstep(0.0,1.0,vY),1.6);gl_FragColor=vec4(uCol,a);}',
  });
  [[200, 11, 0.42], [105, 5, 0.2]].forEach(([r, h, a], i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true), hazeMat(h, a));
    m.position.y = (MC.floorY || 0) + h / 2 - 1.5; m.renderOrder = 4 + i; m.frustumCulled = false; m.raycast = () => {}; scene.add(m); hazes.push(m);
  });

  // cây/bụi lẻ (không instancing) sát tường nhà: tán cây đâm xuyên vào phòng → bỏ
  if (MC.noPlant) { const sp = new THREE.Sphere(); let nRm = 0; env.updateMatrixWorld(true);
    env.traverse(o => { if (!o.isMesh || o.isInstancedMesh || !o.visible) return; if (![].concat(o.material).some(m => m && /^Poly(Foliage|Shader)/i.test(m.name || ''))) return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); sp.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); if (sp.radius > 12) return;
      const pd = Math.min(3, sp.radius); if (MC.noPlant.some(b => sp.center.x > b[0] - pd && sp.center.x < b[1] + pd && sp.center.z > b[2] - pd && sp.center.z < b[3] + pd)) { let t = o; for (let q = o.parent; q && q !== env; q = q.parent) if (/^SF_|tree|bush/i.test(q.name)) t = q; t.visible = false; nRm++; } });   // ẩn cả cây (thân + cành + tán), không chỉ phần lá
    if (nRm) console.log('exterior: bỏ ' + nRm + ' cây/bụi lẻ sát tường nhà'); }
  console.log('exterior: instanced in GLB ' + nIn + ' → ' + cells.length + ' ô; rải ngoài ' + JSON.stringify(farN) + '; vật cản tròn ' + colliders.circles.length + ', hộp ' + colliders.boxes.length);

  // ---- 6) cập nhật mỗi vài khung: LOD theo khoảng cách tới tâm nhìn + chất lượng ----
  const IB = [-0.3, 10.3, -8.3, 0.6];   // hộp nội thất (khung camera chỉ pan trong đây) — ngoại cảnh chỉ cần cho vùng nhìn ra từ hộp này
  if (INDOOR) DEC.U.tree.uBox.value.set(IB[0], IB[1], IB[2], IB[3]);
  let level = 'medium', lv = LEVELS.medium;
  function setLevel(q) { if (!LEVELS[q]) return; level = q; lv = LEVELS[q]; hazes.forEach((h, i) => h.visible = i < lv.haze);
    // decal bắt đầu đúng chỗ cây cỏ 3D hết (theo chất lượng)
    const tr = CLASS.tree.maxD * lv.dist, gr = CLASS.grass.maxD * lv.dist; DEC.U.tree.uR0.value = tr - 7; DEC.U.tree.uR1.value = tr - 1.5; DEC.U.grass.uR0.value = gr - 4.5; DEC.U.grass.uR1.value = gr - 0.5; }
  setLevel('medium');
  function update(target, camPos, fogColor, wcFog) {
    DEC.update(target);
    for (const ce of cells) {
      const CL = CLASS[ce.cls];
      const d = INDOOR ? Math.max(0, Math.hypot(Math.max(IB[0] - ce.cx, 0, ce.cx - IB[1]), Math.max(IB[2] - ce.cz, 0, ce.cz - IB[3])) - CL.cell * 0.4) : Math.hypot(ce.cx - target.x, ce.cz - target.z);
      const dist = CL.maxD * lv.dist, vis = d < dist;
      const lod0 = !ce.im1 || d < CL.lod * lv.dist;            // gần: hình đủ chi tiết; xa: hình giảm tam giác
      const v0 = vis && lod0, v1 = vis && !lod0;
      if (ce.im.visible !== v0) ce.im.visible = v0;
      if (ce.im1 && ce.im1.visible !== v1) ce.im1.visible = v1;
      if (!vis) continue;
      // cây/đá trong hàng rào có VẬT CẢN → luôn đủ bản (không thưa) để không "va vào cây tàng hình"; còn lại thưa dần theo khoảng cách
      const solid = ce.user || (!INDOOR && !ce.far && (ce.cls === 'tree' || ce.cls === 'rock'));
      const t = Math.min(1, Math.max(0, (d - CL.d0) / (CL.d1 - CL.d0)));
      // cỏ: sát nhân vật gần đủ dày (lv.gNear), xa thưa dần về min×dens; các loại khác như cũ
      const f = solid ? 1 : ce.cls === 'grass' ? lv.gNear + (CL.min * lv.dens - lv.gNear) * t : Math.max(CL.min, 1 - t * (1 - CL.min)) * lv.dens * (ce.cls === 'flower' ? 0.6 : 1);   // hoa: thưa bớt 40%
      const dens = ce.cls === 'tree' && ce.far ? Math.max(f, lv.far * 0.4) : f;
      const n = Math.max(1, Math.ceil(ce.n * Math.min(1, dens)));
      if (ce.im.count !== n) { ce.im.count = n; if (ce.im1) ce.im1.count = n; }
      const sh = CL.shadow && d < (ce.cls === 'grass' ? lv.grassShadowR : lv.shadowR + 4);   // cỏ: bóng chỉ ở sát nhân vật (đắt nhất vì alpha-test + rất nhiều thể hiện)
      if (ce.im.castShadow !== sh) { ce.im.castShadow = sh; if (ce.im1) ce.im1.castShadow = sh; }
    }
    for (const h of hazes) { h.position.x = target.x; h.position.z = target.z; if (fogColor) h.material.uniforms.uCol.value.copy(fogColor);  }
  }
  return {decals: DEC, tintMats, colliders, update, setLevel, getLevel: () => level, cells, hazes, group, depthMat, walkHeight: buildWalkHeight(scene, MC), setUser, removeUser, userKeys, userMeshes, indoor: INDOOR};
}

// ---- độ cao mặt đi được (hiên / bục thềm / bậc) -------------------------------------------------------------
// Bắn tia thẳng xuống 1 lần lúc dựng map trong MC.porch=[x0,x1,z0,z1] (+ MC.porchMax = trần cao tối đa), lưu lưới thưa; trả (x,z)=>y nội suy.
// Ngoài vùng này (hoặc không có MC.porch) trả null → game dùng mặt đất phẳng floorY. Thêm bục/bậc mới: chỉ cần mở rộng MC.porch.
function buildWalkHeight(scene, MC) {
  if (!MC.porch) return () => null;
  const [x0, x1, z0, z1] = MC.porch, C = 0.2, base = MC.floorY || 0, top = base + (MC.porchMax || 0.6);
  const W = Math.ceil((x1 - x0) / C) + 1, H = Math.ceil((z1 - z0) / C) + 1, g = new Float32Array(W * H).fill(base);
  // lần vào sau: lấy lưới đã đo từ localStorage (khoá theo phiên bản file map + vùng) → khỏi bắn tia lại
  const f = FILES['map-' + window.MAPID], ck = 'vyWH:' + (f ? f.v : '') + ':' + MC.porch.join(',') + ':' + top;
  let cached = null;
  try { const t = localStorage.getItem(ck); if (t) { const a = JSON.parse(t); if (a.length === W * H) cached = a; } } catch (e) {}
  if (cached) g.set(cached); else {
  const meshes = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible || o.isSkinnedMesh || /Foliage|Shader|Wind|LazyRig|^GEO_|^Sphere|^mesh_|^$/.test(o.name)) return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.max.x > x0 && b.min.x < x1 && b.max.z > z0 && b.min.z < z1 && b.max.y > base && b.min.y < top) meshes.push(o);
  });
  const rc = new THREE.Raycaster(), org = new THREE.Vector3(), dn = new THREE.Vector3(0, -1, 0);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    rc.set(org.set(x0 + i * C, top, z0 + j * C), dn);
    const h = rc.intersectObjects(meshes, false)[0];
    if (h) g[j * W + i] = Math.max(base, Math.min(top, h.point.y));
  }
  try { for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); if (key && key.startsWith('vyWH:') && key !== ck) localStorage.removeItem(key); }
        localStorage.setItem(ck, JSON.stringify(Array.from(g, v => Math.round(v * 1000) / 1000))); } catch (e) {}
  }
  return (x, z) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return null;
    const fx = (x - x0) / C, fz = (z - z0) / C, i = Math.min(W - 2, fx | 0), j = Math.min(H - 2, fz | 0), u = fx - i, v = fz - j;
    const a = g[j * W + i], b = g[j * W + i + 1], c = g[(j + 1) * W + i], d = g[(j + 1) * W + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}
