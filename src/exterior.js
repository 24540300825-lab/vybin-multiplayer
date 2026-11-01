// Map NGOÀI VƯỜN: biến các InstancedMesh khổng lồ trong GLB (cỏ, hoa, bụi, cây, đá) thành các "ô" (cell) nhỏ để
//   • frustum-cull theo ô   • LOD theo khoảng cách (thưa dần, rồi biến mất)   • chỉ ô gần mới đổ bóng   • rải thêm cây/cỏ/đá ra ngoài hàng rào
//   • sinh vật cản (thân cây, đá, tường nhà) cho lưới va chạm   • sương mù xa kiểu "lớp mây thấp" (haze ring).
// Mọi con số chất lượng nằm ở LEVELS (low/medium/high) — nối với TP.quality của game.
import * as THREE from 'three';
import {FILES} from './manifest.js';
import {makeDepthMat} from './foliage.js';

// ---- mức chất lượng: mật độ, tầm nhìn, bóng, số lớp sương, hạt mưa -----------------------------------------
export const LEVELS = {
  low:    {dens: 0.40, dist: 0.62, shadowR: 9,  grassShadowR: 0,  haze: 1, rain: 2400, far: 0.45},
  medium: {dens: 0.66, dist: 0.85, shadowR: 10, grassShadowR: 5,  haze: 2, rain: 4200, far: 0.75},
  high:   {dens: 0.85, dist: 1.00, shadowR: 12, grassShadowR: 8,  haze: 2, rain: 6000, far: 1.00},
};
// theo loại: tầm nhìn tối đa (m), đường cong mật độ theo khoảng cách (d0 = bắt đầu thưa, d1 = còn tối thiểu), có đổ bóng không
const CLASS = {
  grass:  {maxD: 50,  d0: 22, d1: 46,  min: 0.04, shadow: true,  cell: 9,  lod: 0},
  flower: {maxD: 46,  d0: 22, d1: 42,  min: 0.03, shadow: false, cell: 10, lod: 30},
  bush:   {maxD: 110, d0: 45, d1: 105, min: 0.12, shadow: true,  cell: 11, lod: 48},
  tree:   {maxD: 230, d0: 70, d1: 220, min: 0.35, shadow: true,  cell: 12, lod: 70},
  rock:   {maxD: 130, d0: 55, d1: 120, min: 0.25, shadow: true,  cell: 10, lod: 55},
};

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
  let grassDepth = null;
  const group = new THREE.Group(); group.name = 'EXT_CELLS'; scene.add(group);
  const cells = [];          // {im, cls, n, cx, cz, r}
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
    if (grass) {
      r.userData.grass = true; r.color.set(0xffffff);
      r.alphaMap = grassMask(); r.alphaTest = 0.4;          // mỗi cọng/cụm cỏ là card có UV (TEXCOORD_0) trỏ vào atlas alpha 6400² → cắt hình đúng như trong Blender
    } else {
      r.userData.fol2 = true;
      if (gi.h < 0.9) r.userData.squash = true;             // hoa thấp: cúi xuống quanh chân người chơi
      else r.userData.occ = true;                           // bụi/cây cao: mờ dần khi chắn giữa camera và người
      // lá chưa có màu/texture (trắng): tô xanh lá theo palette của các lá có màu trong file
      if (!r.map && r.color.r > 0.95 && r.color.g > 0.95 && r.color.b > 0.95) {
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
  const tmpM = new THREE.Matrix4();
  for (const {set, cls} of items) {
    const CL = CLASS[cls];
    // ma trận thế giới của mọi bản thể (dùng bản của mesh đầu để đặt vị trí; các primitive cùng nút có chung ma trận)
    const ref = set[0]; ref.updateWorldMatrix(true, false);
    const W = ref.matrixWorld; let mats = [];
    const dt = MC.dropTrees;
    for (let i = 0; i < ref.count; i++) { ref.getMatrixAt(i, tmpM); const mm = tmpM.clone().premultiply(W); if (dt && cls === 'tree') { V3.setFromMatrixPosition(mm); if (dt.some(q => Math.hypot(V3.x - q[0], V3.z - q[1]) < 1.6)) continue; } 
      mats.push(mm); }
    if (!mats.length) { set.forEach(m => m.removeFromParent()); continue; }
    nIn += mats.length;
    templates[cls].push({set, mats});
    // vật cản: thân cây / đá
    if (cls === 'tree' || cls === 'rock') addColliders(cls, set, mats);
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
      const mat = styleMat(Array.isArray(src.material) ? src.material[0] : src.material, src.geometry, cls);
      const im = new THREE.InstancedMesh(src.geometry, mat, arr.length);
      arr.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.instanceMatrix.needsUpdate = true; im.matrixAutoUpdate = false; im.castShadow = false; im.receiveShadow = cls === 'tree' || cls === 'rock';     // cỏ chỉ ĐỔ bóng xuống thảm, không nhận bóng của chính cỏ → đồng màu, hoà vào thảm
      im.computeBoundingSphere();
      if (mat.userData.grass) { if (!grassDepth) grassDepth = makeDepthMat(grassMask()); im.customDepthMaterial = grassDepth; }
      else if (mat.userData.fol2) im.customDepthMaterial = depthMat;
      group.add(im);
      // mức LOD xa: cùng ma trận (dùng chung buffer), hình học đã giảm ~85% tam giác
      let im1 = null; const lg = CLASS[cls].lod ? simplified(src.geometry, 0.16) : null;
      if (lg) { im1 = new THREE.InstancedMesh(lg, mat, arr.length); im1.instanceMatrix = im.instanceMatrix; im1.matrixAutoUpdate = false; im1.castShadow = false; im1.receiveShadow = cls === 'tree' || cls === 'rock'; im1.boundingSphere = im.boundingSphere; im1.visible = false;
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
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, V3.y, z), Q, S3);
      const CL = CLASS[cls], k = (T.indexOf(t)) + '|' + Math.floor(x / CL.cell) + ',' + Math.floor(z / CL.cell);
      let b = per.get(k); if (!b) { b = {t, arr: []}; per.set(k, b); } b.arr.push(m);
    });
    for (const b of per.values()) makeCells(b.t.set, cls, b.arr, true);
    return out.length;
  }
  const farN = {};
  const F = MC.farDensity || 1;
  farN.tree = scatter('tree', Math.round(1100 * F), 2.2, 150, d => rnd() < 0.95 - d / 260);
  farN.bush = scatter('bush', Math.round(260 * F), 1.8, 90, d => rnd() < 0.95 - d / 120);
  farN.rock = scatter('rock', Math.round(70 * F), 3, 140, () => true);
  farN.grass = scatter('grass', Math.round(5200 * F), 0.9, 44, d => rnd() < 1.0 - d / 50);
  farN.flower = scatter('flower', Math.round(900 * F), 0.9, 36, d => rnd() < 1.0 - d / 42);

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

  console.log('exterior: instanced in GLB ' + nIn + ' → ' + cells.length + ' ô; rải ngoài ' + JSON.stringify(farN) + '; vật cản tròn ' + colliders.circles.length + ', hộp ' + colliders.boxes.length);

  // ---- 6) cập nhật mỗi vài khung: LOD theo khoảng cách tới tâm nhìn + chất lượng ----
  let level = 'medium', lv = LEVELS.medium;
  function setLevel(q) { if (!LEVELS[q]) return; level = q; lv = LEVELS[q]; hazes.forEach((h, i) => h.visible = i < lv.haze); }
  setLevel('medium');
  function update(target, camPos, fogColor, wcFog) {
    for (const ce of cells) {
      const CL = CLASS[ce.cls], d = Math.hypot(ce.cx - target.x, ce.cz - target.z);
      const dist = CL.maxD * lv.dist, vis = d < dist;
      const lod0 = !ce.im1 || d < CL.lod * lv.dist;            // gần: hình đủ chi tiết; xa: hình giảm tam giác
      const v0 = vis && lod0, v1 = vis && !lod0;
      if (ce.im.visible !== v0) ce.im.visible = v0;
      if (ce.im1 && ce.im1.visible !== v1) ce.im1.visible = v1;
      if (!vis) continue;
      // cây/đá trong hàng rào có VẬT CẢN → luôn đủ bản (không thưa) để không "va vào cây tàng hình"; còn lại thưa dần theo khoảng cách
      const solid = !ce.far && (ce.cls === 'tree' || ce.cls === 'rock');
      const f = solid ? 1 : Math.min(1, Math.max(CL.min, 1 - (d - CL.d0) / (CL.d1 - CL.d0) * (1 - CL.min))) * lv.dens;
      const dens = ce.cls === 'tree' && ce.far ? Math.max(f, lv.far * 0.4) : f;
      const n = Math.max(1, Math.ceil(ce.n * Math.min(1, dens)));
      if (ce.im.count !== n) { ce.im.count = n; if (ce.im1) ce.im1.count = n; }
      const sh = CL.shadow && d < (ce.cls === 'grass' ? lv.grassShadowR : lv.shadowR + 4);   // cỏ: bóng chỉ ở sát nhân vật (đắt nhất vì alpha-test + rất nhiều thể hiện)
      if (ce.im.castShadow !== sh) { ce.im.castShadow = sh; if (ce.im1) ce.im1.castShadow = sh; }
    }
    for (const h of hazes) { h.position.x = target.x; h.position.z = target.z; if (fogColor) h.material.uniforms.uCol.value.copy(fogColor);  }
  }
  return {tintMats, colliders, update, setLevel, getLevel: () => level, cells, hazes, group, depthMat, walkHeight: buildWalkHeight(scene, MC)};
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
