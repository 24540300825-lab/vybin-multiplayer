// ===== AMBIENT OCCLUSION BAKE SẴN (khối 3D) =====
// Lúc load, voxel hoá hình học tĩnh của map (tường, sàn, đồ đạc…) vào lưới ~0.15 m, rồi với mỗi ô gần bề mặt bắn ~32–48 tia
// xuyên lưới (bán kính ~0.9 m) → tỉ lệ bị che. Trừ đi mức che của MỘT mặt phẳng phẳng cùng khoảng cách (để tường phẳng KHÔNG tối),
// chỉ còn phần "thêm" ở góc / gầm / sát đồ vật → mờ dần, mượt, không chia bậc. Lưu thành texture 3D 1 kênh (R8), làm mờ 3×3×3.
// Shader toon (game.js) đọc khối này 1 lần / điểm ảnh tại (vị trí + pháp tuyến × 0.12 m) rồi nhân nhẹ vào tông — không thêm lượt vẽ.
// Tính theo từng lát ~10 ms/khung (không khựng); nội thất đặt/dời thì bake lại sau ~0.7 s.
import * as THREE from 'three';

const SKIP_MAT = /glass|window|frost|leaf|leaves|foliage|grass|plant|fern|flower|water|haze|cloud|sky|rain/i;

// uniform dùng chung — tạo SỚM ở mức module (trước mọi lần biên dịch shader), vật liệu toon gắn vào khi onBeforeCompile
const t0 = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType); t0.minFilter = t0.magFilter = THREE.LinearFilter; t0.unpackAlignment = 1; t0.needsUpdate = true;
export const AOU = {uAOT: {value: t0}, uAOB: {value: new THREE.Vector3()}, uAOS: {value: new THREE.Vector3(1, 1, 1)}, uAOG: {value: new THREE.Vector4(1, 1, 1, 1)}, uAOA: {value: new THREE.Vector2(1, 1)}, uAOC: {value: new THREE.Vector3(0.52, 0.48, 0.62)}};

export function makeAO(TU, {getMeshes, groundY = null}) {
  let job = null, timer = 0, dirtyT = 0, cfg = null, tex = null, statOcc = null, statSig = '';

  // tia đều trên mặt cầu (Fibonacci)
  const rays = n => { const r = [], g = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const y = 1 - (i + 0.5) / n * 2, rad = Math.sqrt(1 - y * y), a = g * i; r.push([Math.cos(a) * rad, y, Math.sin(a) * rad]); } return r; };

  function collect() {
    const out = [];
    for (const o of getMeshes()) {
      if (!o || !o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) continue;
      let vis = true; for (let p = o; p; p = p.parent) if (p.visible === false) { vis = false; break; } if (!vis) continue;
      const ms = [].concat(o.material); const m = ms[0]; if (!m) continue;
      if (o.userData.glass || m.transparent || m.opacity < 1 || m.userData.ground || m.userData.fol2 || m.userData.grass || m.userData.leaf || SKIP_MAT.test(m.name || '') || SKIP_MAT.test(o.name || '')) continue;
      out.push(o);
    }
    return out;
  }

  function start(bounds, cell, R, nRays) {
    const T0 = performance.now(); const meshes = collect(); if (!meshes.length) { console.log('[ao] không có mesh'); return; }
    const bmin = bounds.min.clone(), size = bounds.getSize(new THREE.Vector3());
    const nx = Math.max(2, Math.ceil(size.x / cell)), ny = Math.max(2, Math.ceil(size.y / cell)), nz = Math.max(2, Math.ceil(size.z / cell)), N = nx * ny * nz;
    const sx = nx * cell, sy = ny * cell, sz = nz * cell, inv = 1 / cell, mx = bmin.x, my = bmin.y, mz = bmin.z;
    let occ = new Uint8Array(N); const idx = (x, y, z) => x + nx * (y + ny * z);
    // ---- 1) voxel hoá bề mặt ----
    const mark = (px, py, pz) => { const x = Math.floor((px - mx) * inv), y = Math.floor((py - my) * inv), z = Math.floor((pz - mz) * inv); if (x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz) occ[idx(x, y, z)] = 1; };
    const ex = mx + sx, ey = my + sy, ez = mz + sz, step = cell * 0.5;
    function tri(ax, ay, az, bx, by, bz, cx, cy, cz) {
      if (Math.max(ax, bx, cx) < mx || Math.min(ax, bx, cx) > ex || Math.max(ay, by, cy) < my || Math.min(ay, by, cy) > ey || Math.max(az, bz, cz) < mz || Math.min(az, bz, cz) > ez) return;
      const e = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
      if (e > 4) { const abx = (ax + bx) / 2, aby = (ay + by) / 2, abz = (az + bz) / 2, bcx = (bx + cx) / 2, bcy = (by + cy) / 2, bcz = (bz + cz) / 2, cax = (cx + ax) / 2, cay = (cy + ay) / 2, caz = (cz + az) / 2;
        tri(ax, ay, az, abx, aby, abz, cax, cay, caz); tri(abx, aby, abz, bx, by, bz, bcx, bcy, bcz); tri(cax, cay, caz, bcx, bcy, bcz, cx, cy, cz); tri(abx, aby, abz, bcx, bcy, bcz, cax, cay, caz); return; }
      const n = Math.max(1, Math.ceil(e / step));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const u = i / n, v = j / n; mark(ax + (bx - ax) * u + (cx - ax) * v, ay + (by - ay) * u + (cy - ay) * v, az + (bz - az) * u + (cz - az) * v); }
    }
    const v = new THREE.Vector3();
    const raster = list => { for (const o of list) {
      o.updateWorldMatrix(true, false); const g = o.geometry, pos = g.attributes.position, ix = g.index, W = o.matrixWorld;
      const wp = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(W); wp[i * 3] = v.x; wp[i * 3 + 1] = v.y; wp[i * 3 + 2] = v.z; }
      const nt = (ix ? ix.count : pos.count) / 3;
      for (let t = 0; t < nt; t++) { const a = (ix ? ix.getX(t * 3) : t * 3) * 3, b = (ix ? ix.getX(t * 3 + 1) : t * 3 + 1) * 3, c = (ix ? ix.getX(t * 3 + 2) : t * 3 + 2) * 3; tri(wp[a], wp[a + 1], wp[a + 2], wp[b], wp[b + 1], wp[b + 2], wp[c], wp[c + 1], wp[c + 2]); }
    } };
    // nhà (tĩnh) chỉ voxel hoá 1 lần; bake lại (đặt/dời nội thất) chỉ voxel hoá phần nội thất — nhanh
    const isDyn = o => { for (let p = o; p; p = p.parent) if (p.name === 'PlacedFurniture') return true; return false; };
    const sig = [mx, my, mz, nx, ny, nz, cell].join(',');
    if (!statOcc || statSig !== sig) {
      raster(meshes.filter(o => !isDyn(o)));
      if (groundY != null) { const y = Math.floor((groundY - my) * inv); if (y >= 0 && y < ny) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) occ[idx(x, y, z)] = 1; }
      statOcc = occ.slice(); statSig = sig;
    } else occ = statOcc.slice();
    raster(meshes.filter(isDyn));
    // ---- 2) vùng cần tính (≤2 ô quanh bề mặt) + khoảng cách tới bề mặt gần nhất ----
    const dist = new Uint8Array(N).fill(255);   // ×32 ô
    let cnt = 0;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { if (!occ[idx(x, y, z)]) continue;
      for (let dz = -2; dz <= 2; dz++) { const zz = z + dz; if (zz < 0 || zz >= nz) continue; for (let dy = -2; dy <= 2; dy++) { const yy = y + dy; if (yy < 0 || yy >= ny) continue; for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; if (xx < 0 || xx >= nx) continue;
        const d = Math.round(Math.hypot(dx, dy, dz) * 32), k = idx(xx, yy, zz); if (d < dist[k]) dist[k] = d; } } } }
    const list = []; for (let i = 0; i < N; i++) if (dist[i] !== 255 && !occ[i]) list.push(i);
    console.log('[ao] voxel hoá ' + meshes.length + ' mesh: ' + Math.round(performance.now() - T0) + ' ms, ô cần tính ' + list.length);
    // ---- 3) bảng mức che của mặt phẳng phẳng theo khoảng cách (trung bình 3 hướng) ----
    const RY = rays(nRays), t0c = cell * 0.45, wgt = t => 1 - 0.6 * t / R;
    const Btab = []; for (let k = 0; k <= 16; k++) { const d = k * 0.25 * cell; let s = 0; for (const r of RY) for (let ax = 0; ax < 3; ax++) { const dn = -r[ax]; if (dn <= 1e-4) continue; const t = d / dn; if (t <= R) s += wgt(Math.max(t, t0c)); } Btab.push(s / (RY.length * 3)); }
    const base = dcell => { const f = Math.max(0, Math.min(15.99, (dcell - 0.5) * 4)), i = Math.floor(f), a = f - i; return Btab[i] * (1 - a) + Btab[i + 1] * a; };
    const D = new Float32Array(N), steps = Math.max(2, Math.ceil(R / (cell * 0.5)));
    let li = 0;
    job = {gen: 0, run(budget) {
      const T = performance.now();
      while (li < list.length) {
        const i = list[li++], x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0;
        const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5; let F = 0;
        for (let r = 0; r < RY.length; r++) { const d = RY[r];
          for (let s = 0; s < steps; s++) { const t = t0c + s * cell * 0.5; if (t > R) break; const k = t * inv, px = Math.floor(cx + d[0] * k), py = Math.floor(cy + d[1] * k), pz = Math.floor(cz + d[2] * k);
            if (px < 0 || py < 0 || pz < 0 || px >= nx || py >= ny || pz >= nz) break; if (occ[idx(px, py, pz)]) { F += wgt(t); break; } } }
        F /= RY.length; D[i] = Math.max(0, Math.min(1, (F - base(dist[i] / 32)) * 2.4));
        if ((li & 255) === 0 && performance.now() - T > budget) return false;
      }
      return true; },
      finish() {
        // ô bề mặt (đặc) lấy trung bình ô trống kề bên → nội suy tuyến tính không bị sáng lên sát tường
        const D2 = new Float32Array(D);
        for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const i = idx(x, y, z); if (!occ[i]) continue;
          let s = 0, c = 0; for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy, zz = z + dz; if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue; const k = idx(xx, yy, zz); if (!occ[k] && dist[k] !== 255) { s += D[k]; c++; } }
          D2[i] = c ? s / c : 0; }
        // làm mờ 3 chiều (1-2-1) × 3 lượt
        let A = D2, B = new Float32Array(N);
        const blur = (a, b, sx_, sy_, sz_, st) => { for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const i = idx(x, y, z); const p = (st === 0 ? x > 0 : st === 1 ? y > 0 : z > 0) ? i - (st === 0 ? 1 : st === 1 ? nx : nx * ny) : i, q = (st === 0 ? x < nx - 1 : st === 1 ? y < ny - 1 : z < nz - 1) ? i + (st === 0 ? 1 : st === 1 ? nx : nx * ny) : i; b[i] = (a[p] + 2 * a[i] + a[q]) * 0.25; } };
        blur(A, B, 0, 0, 0, 0); blur(B, A, 0, 0, 0, 1); blur(A, B, 0, 0, 0, 2);
        // xếp các lát theo trục Y vào 1 ảnh 2D (atlas) — tránh sampler 3D (một số driver lỗi lẫn sampler); shader tự nội suy 2 lát
        const cols = Math.max(1, Math.floor(4096 / nx)), rows = Math.ceil(ny / cols), AW = cols * nx, AH = rows * nz;
        const u8 = new Uint8Array(AW * AH * 4);
        for (let y = 0; y < ny; y++) { const ox = (y % cols) * nx, oy = Math.floor(y / cols) * nz; for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) { const q = ((oy + z) * AW + ox + x) * 4; u8[q] = Math.round(Math.max(0, Math.min(1, B[idx(x, y, z)])) * 255); u8[q + 3] = 255; } }
        const tx = new THREE.DataTexture(u8, AW, AH, THREE.RGBAFormat, THREE.UnsignedByteType); tx.minFilter = tx.magFilter = THREE.LinearFilter; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.unpackAlignment = 1; tx.needsUpdate = true;
        if (tex) tex.dispose(); tex = tx; AOU.uAOT.value = tx; AOU.uAOB.value.set(mx, my, mz); AOU.uAOS.value.set(1 / sx, 1 / sy, 1 / sz); AOU.uAOG.value.set(nx, nz, cols, ny); AOU.uAOA.value.set(AW, AH);
        { let sm = 0, mxv = 0, c95 = 0; const hist = new Array(10).fill(0); for (const i of list) { const v = B[i]; sm += v; if (v > mxv) mxv = v; hist[Math.min(9, Math.floor(v * 10))]++; } console.log('[ao] D trung bình ' + (sm / list.length).toFixed(3) + ' max ' + mxv.toFixed(2) + ' hist ' + hist.join(',')); }
        console.log('[ao] khối ' + nx + '×' + ny + '×' + nz + ' (' + (N / 1e6).toFixed(2) + ' M ô, ' + list.length + ' ô tính, ô ' + cell.toFixed(2) + ' m)'); } };
    const tick = () => { if (!job) return; const done = job.run(9); if (done) { const j = job; job = null; j.finish(); } else timer = setTimeout(tick, 0); };
    clearTimeout(timer); if (cfg && cfg.sync) { job.run(1e9); const j = job; job = null; j.finish(); } else timer = setTimeout(tick, 0);
  }

  // cfg: {bounds: Box3, cell, R, rays}; gọi lại bất cứ lúc nào để bake lại
  function bake(c) { cfg = c || cfg; if (!cfg) return; if (cfg.defer) { cfg.defer = false; return; } clearTimeout(timer); job = null; start(cfg.bounds, cfg.cell, cfg.R || 0.9, cfg.rays || 36); }
  function bakeNow() { const c = cfg; if (!c) return; bake(Object.assign({}, c, {sync: true})); cfg.sync = false; }
  let want = false;
  function ensure() { if (!tex && cfg && !job && !want) { want = true; bake(); } }   // bật AO lần đầu (mức Tiết kiệm tắt AO nên không bake) → bake lúc này
  function dirty(ms = 700) { if (!tex && !want) return; clearTimeout(dirtyT); dirtyT = setTimeout(() => bake(), ms); }
  return {bake, bakeNow, dirty, ensure, setStrength: k => { TU.uAOK.value = k; }, get ready() { return !!tex; }};
}

// chọn lưới theo cỡ vùng: ≤ ~2.4 triệu ô
export function aoGrid(box, minCell = 0.15) {
  const s = box.getSize(new THREE.Vector3()); const cell = Math.max(minCell, Math.cbrt(s.x * s.y * s.z / 2.4e6)); return cell;
}
