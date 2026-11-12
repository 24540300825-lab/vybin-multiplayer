// ĐỒ HOẠ ULTRA — "thảm cỏ thật" phủ kín VƯỜN (trong hàng rào): cỏ mesh từng lá, cố định (không spawn/thưa theo khoảng cách → không nhấp nháy),
// sóng gió lăn qua cả cánh đồng, gốc sẫm → ngọn sáng nắng, mỗi khóm lệch sắc + từng mảng cao/thấp. Ngoài hàng rào vẫn là cỏ LOD + decal như cũ.
// Dùng chung đường ống shader cỏ của game (userData.grass → GRASSB trong foliage.js): màu lấy theo nền tại chỗ mọc, nhận bóng, bóng mây, ướt mưa,
// cúi rạp quanh chân 2 người chơi. Chỉ dựng khi chọn mức ULTRA (lần đầu bật mới dựng).
import * as THREE from 'three';

const BLADES = 9, SEG = 4;
let _s = 424242;
const rnd = () => { _s = (_s * 16807) % 2147483647; return _s / 2147483647; };

// 1 khóm = 9 lá thon, cong, dài ngắn khác nhau (gốc y = 0, cao tối đa ~0.8 m)
function clumpGeometry() {
  const pos = [], nor = [], uv = [], idx = [];
  for (let b = 0; b < BLADES; b++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.12, ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const h = 0.38 + rnd() * 0.42, w = 0.028 + rnd() * 0.022;
    const yaw = rnd() * Math.PI * 2, cy = Math.cos(yaw), sy = Math.sin(yaw);   // hướng mặt lá
    const lean = 0.08 + rnd() * 0.26, la = a + (rnd() - 0.5) * 1.2;             // ngọn ngả ra ngoài khóm
    const lx = Math.cos(la) * lean * h, lz = Math.sin(la) * lean * h;
    const base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, y = h * t, bend = t * t;
      const cx = ox + lx * bend, cz = oz + lz * bend;
      const ww = w * (1 - t * 0.92) * (i === SEG ? 0 : 1);
      for (const s of (i === SEG ? [0] : [-1, 1])) {
        pos.push(cx + cy * ww * s, y, cz + sy * ww * s);
        nor.push(-sy, 0.35, cy); uv.push(s < 0 ? 0 : 1, t);
      }
    }
    for (let i = 0; i < SEG - 1; i++) { const p = base + i * 2; idx.push(p, p + 1, p + 3, p, p + 3, p + 2); }
    const p = base + (SEG - 1) * 2; idx.push(p, p + 1, p + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// nhiễu mượt (mảng cỏ cao / thấp, đậm / nhạt như cánh đồng thật)
const hash2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// c = {scene, env, MC (fence, noPlant, floorY), toonMat, colliders, step}
export function makeMeadow(c) {
  const MC = c.MC, R0 = MC.fence, y0 = (MC.floorY || 0) - 0.02, step = c.step || 0.33;
  const x0 = R0[0] + 0.55, x1 = R0[1] - 0.55, z0 = R0[2] + 0.55, z1 = R0[3] - 0.55;
  // ---- bản đồ chỗ KHÔNG mọc cỏ (ô 0.2 m): nhà, thềm, lối đá, gốc cây/đá, chân tường rào/cổng ----
  const CEL = 0.2, W = Math.ceil((x1 - x0) / CEL) + 1, H = Math.ceil((z1 - z0) / CEL) + 1, block = new Uint8Array(W * H);
  const mark = (x, z, r) => {
    const i0 = Math.max(0, Math.floor((x - r - x0) / CEL)), i1 = Math.min(W - 1, Math.floor((x + r - x0) / CEL));
    const j0 = Math.max(0, Math.floor((z - r - z0) / CEL)), j1 = Math.min(H - 1, Math.floor((z + r - z0) / CEL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = x0 + (i + 0.5) * CEL, cz = z0 + (j + 0.5) * CEL;
      if ((cx - x) * (cx - x) + (cz - z) * (cz - z) <= r * r) block[j * W + i] = 1;
    }
  };
  const markBox = (a0, a1, b0, b1) => {
    for (let j = Math.max(0, Math.floor((b0 - z0) / CEL)); j <= Math.min(H - 1, Math.floor((b1 - z0) / CEL)); j++)
      for (let i = Math.max(0, Math.floor((a0 - x0) / CEL)); i <= Math.min(W - 1, Math.floor((a1 - x0) / CEL)); i++) block[j * W + i] = 1;
  };
  (MC.noPlant || []).forEach(b => markBox(b[0] - 0.35, b[1] + 0.35, b[2] - 0.35, b[3] + 0.35));
  // lối đá + thềm + mọi khối đá/bậc nằm sát mặt đất trong vườn: lấy theo đỉnh mesh thật
  const v = new THREE.Vector3();
  c.env.updateMatrixWorld(true);
  c.env.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const nm = (o.name || '') + ' ' + [].concat(o.material).map(m => (m && m.name) || '').join(' ');
    if (!/Path|PathStone|Entrance_Porch|Gate_|Fence|Foundation/i.test(nm)) return;
    const pa = o.geometry.attributes.position; if (!pa) return;
    const pad = /Path|PathStone/i.test(nm) ? 0.32 : 0.3;
    const add = M => { for (let k = 0; k < pa.count; k += 1) { v.fromBufferAttribute(pa, k).applyMatrix4(M); if (v.y < y0 + 0.6) mark(v.x, v.z, pad); } };
    if (o.isInstancedMesh) { const M = new THREE.Matrix4(); for (let n = 0; n < o.count; n++) { o.getMatrixAt(n, M); M.premultiply(o.matrixWorld); add(M); } }
    else add(o.matrixWorld);
  });
  (c.colliders && c.colliders.circles || []).forEach(cc => mark(cc.x, cc.z, (cc.r || 0.3) + 0.12));
  // ---- rải khóm theo lưới rung (jitter) → dày đều, không vón cục ----
  const geo = clumpGeometry(), CH = 6, chunks = new Map(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (let z = z0; z < z1; z += step) for (let x = x0; x < x1; x += step) {
    const px = x + rnd() * step, pz = z + rnd() * step;
    const i = Math.floor((px - x0) / CEL), j = Math.floor((pz - z0) / CEL);
    if (i < 0 || j < 0 || i >= W || j >= H || block[j * W + i]) continue;
    // cỏ thấp dần sát chỗ bị chặn (mép lối đi, chân tường) → viền mềm, không bị "cắt"
    let edge = 0; for (const [di, dj] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < W && b < H && block[b * W + a]) edge++; }
    const patch = vnoise(px * 0.18, pz * 0.18), fine = vnoise(px * 0.9 + 7, pz * 0.9 + 3);
    const sh = (0.6 + 0.75 * patch) * (0.85 + 0.3 * fine) * (1 - edge * 0.18);
    if (sh < 0.25) continue;
    Q.setFromAxisAngle(UP, rnd() * Math.PI * 2);
    const sw = 0.85 + rnd() * 0.35;
    S.set(sw, sh, sw); P.set(px, y0, pz); M4.compose(P, Q, S);
    const k = Math.floor(px / CH) + ',' + Math.floor(pz / CH);
    (chunks.get(k) || chunks.set(k, []).get(k)).push(M4.clone()); n++;
  }
  // ---- vật liệu: đi qua toon pipeline của game (GRASSB) + thêm gradient Ghibli (gốc sẫm → ngọn nắng) và sóng gió lăn qua cánh đồng ----
  const mat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide});
  mat.name = 'Meadow_Grass'; mat.userData.grass = true; mat.userData.center = new THREE.Vector3(0, 0.3, 0); mat.userData.hInv = 1 / 0.8; mat.userData.desat = 0.97;
  c.toonMat(mat);
  const ob = mat.onBeforeCompile, ok = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    ob && ob(sh, r);
    sh.vertexShader = sh.vertexShader.replace('wpos.xyz += windOffset( lp0, rootW, instScale );', `wpos.xyz += windOffset( lp0, rootW, instScale );
      { float hh = clamp( lp0.y / 0.8, 0.0, 1.0 ); hh *= hh;
        float ph = dot( rootW.xz, uWindDir ) * 0.42 - uWindT * ( 1.5 + uWindA * 1.2 );
        float wv = sin( ph ) * 0.5 + 0.5 + 0.25 * sin( ph * 2.7 + rootW.x * 0.3 );
        wpos.xz += uWindDir * ( 0.04 + 0.26 * wv ) * ( 0.35 + uWindA ) * hh * instScale;
        wpos.y -= 0.1 * wv * ( 0.35 + uWindA ) * hh * instScale; }`);
    sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb = varyCol( c * uGrTint, vHash, uGrVar ); }', `
      c = mix( gc * vec3( 0.52, 0.6, 0.5 ), gc * vec3( 1.28, 1.24, 0.92 ), smoothstep( 0.0, 1.0, vLeafH ) );   // MEADOW: gốc sẫm mát → ngọn sáng nắng
      diffuseColor.rgb = varyCol( c * uGrTint, vHash, uGrVar * 1.6 ); }`);
  };
  mat.customProgramCacheKey = () => (ok ? ok() : '') + 'MEADOW1';
  const group = new THREE.Group(); group.name = 'MEADOW'; group.visible = false;
  for (const arr of chunks.values()) {
    const im = new THREE.InstancedMesh(geo, mat, arr.length);
    arr.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; im.matrixAutoUpdate = false;
    im.computeBoundingSphere(); im.raycast = () => {}; im.name = 'MEADOW_CHUNK';
    group.add(im);
  }
  c.scene.add(group);
  console.log('[meadow] ' + n + ' khóm cỏ (' + (n * BLADES) + ' lá) trong ' + chunks.size + ' ô');
  return {group, count: n, fence: [x0, x1, z0, z1], setOn: on => { group.visible = !!on; }};
}
