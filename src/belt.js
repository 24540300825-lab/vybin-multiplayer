// Vật lý 2 sợi dây đai lưng của Bin (skin "TIGHT BONE": 1 xương nút buộc + 2 chuỗi 3 xương, gắn dưới root.x của rig).
// • Nút buộc (xương lẻ) và gốc 2 sợi dây ghim cứng vào lưng/hông — không mô phỏng.
// • 2 sợi dây mô phỏng như vải áo choàng: lò xo-giảm chấn mềm về dáng animation (trễ êm theo quán tính), gió ngoài trời, tắt dần mượt.
// • Va chạm với quần: mỗi chân là 1 capsule (xương đùi → xương cẳng, kéo dài lên phía hông) — dây bị đẩy ra ngoài, không xuyên mesh quần.
// Chi phí: 2 sợi × 3 hạt, 2 bước con mỗi khung, không allocate; tự ngủ khi nhân vật ẩn / ở xa camera.
import * as THREE from 'three';

// Mô hình "vải mềm" (áo choàng): mỗi hạt là 1 lò xo-giảm chấn MỀM kéo về dáng animation (tần số riêng thấp dần về đầu dây, giảm chấn ~0.55–0.8
// → trễ êm theo quán tính, vượt đà rất nhẹ rồi tắt dần), + gió ngoài trời (cùng trường gió với cây cỏ) + ràng buộc độ dài + va chạm quần.
const OMEGA = [8.5, 6.2, 4.6];        // tần số riêng (rad/s) của hạt 1..3: đầu dây càng tự do/chậm → uốn lượn theo sóng trễ
const ZETA = [0.85, 0.7, 0.6];        // hệ số giảm chấn: <1 = còn lắc nhẹ rồi tắt dần êm; không dao động qua lại mạnh
const WIND_K = 6;                     // gia tốc gió tối đa ≈ WIND_K × cường độ gió (m/s²)
const DEV_MAX = 0.2;                  // lệch tối đa so với dáng animation (m) — kẹp mềm
const SUB = 2;                        // số bước con mỗi khung
const ITER = 3;                       // vòng ràng buộc độ dài + va chạm
const R_LEG = 0.078;                  // bán kính ống quần đo từ mesh (m) ở vùng đùi
const R_STR = 0.007;                  // độ dày sợi dây
const EXTEND = 0.9;                   // kéo capsule lên phía hông (tỉ lệ chiều dài đùi) để phủ cả vùng hông
const NT = 10, NA = 18, TMIN = -0.25, TMAX = 1.0;   // lưới bán kính quần theo (vị trí dọc đùi, góc quanh đùi)
const TELEPORT = 0.6;                 // gốc dây dịch > 0.6 m trong 1 khung → đặt lại (dịch chuyển / đổi map)

export function makeBelt(root) {
  let grp = null;
  root.traverse(o => { if (!grp && /^TIGHT_?BONE/i.test(o.name) && o.children.length) grp = o; });
  if (!grp) return null;
  // chuỗi = con trực tiếp của nhóm có ≥ 2 xương nối nhau (2 sợi dây); xương lẻ (nút buộc) giữ nguyên tư thế nghỉ
  const chains = [];
  for (const c of grp.children) {
    if (!c.isBone) continue;
    const bones = [c]; let b = c;
    while (b.children.length && b.children[0].isBone) { b = b.children[0]; bones.push(b); }
    if (bones.length >= 2) chains.push(bones);
  }
  if (!chains.length) return null;

  // capsule chân: đùi → cẳng (tên xương Auto-Rig: thighl/legl, thighr/legr; GLTFLoader bỏ dấu chấm)
  const legs = [];
  for (const s of ['l', 'r']) {
    const th = root.getObjectByName('thigh' + s), lg = root.getObjectByName('leg' + s);
    if (th && lg) legs.push({th, lg, a: new THREE.Vector3(), b: new THREE.Vector3(), r: R_LEG + R_STR});
  }

  // Bề mặt quần thật: đọc đỉnh mesh quần (ở tư thế nghỉ lúc khởi tạo) → lưới bán kính r(t, θ) trong hệ toạ độ xương đùi.
  // Dây bị đẩy ra đúng mặt quần (kể cả chỗ ống quần phình/nếp gấp) thay vì capsule tròn → không còn lẹm vào mesh.
  (function bake() {
    let pants = null;
    root.traverse(o => { if (!pants && o.isSkinnedMesh && /CLOTH_Retopo_GEO/.test(o.name)) pants = o; });
    if (!pants || !legs.length || !pants.getVertexPosition) return;
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3(), q = new THREE.Vector3(), w = new THREE.Vector3(), cnt = pants.geometry.attributes.position.count;
    for (const lg of legs) {
      lg.th.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(lg.th.matrixWorld).invert();
      const kl = new THREE.Vector3(); lg.lg.getWorldPosition(kl); kl.applyMatrix4(inv);        // vị trí gối trong hệ đùi
      lg.L = kl.length(); lg.ax = kl.clone().normalize();
      const front = new THREE.Vector3(0, 0, 1); front.addScaledVector(lg.ax, -front.dot(lg.ax)).normalize();   // hướng θ = 0 (phía trước)
      lg.fv = front; lg.uv = new THREE.Vector3().crossVectors(lg.ax, front);
      const R = new Float32Array(NT * NA);
      const cx = new THREE.Vector3(); lg.th.getWorldPosition(cx); root.worldToLocal(cx); const side = Math.sign(cx.x) || 1;
      for (let i = 0; i < cnt; i++) {
        pants.getVertexPosition(i, v); v.applyMatrix4(pants.matrixWorld).applyMatrix4(inv);
        const t = v.dot(lg.ax) / lg.L; if (t < TMIN || t > TMAX) continue;
        w.copy(v).addScaledVector(lg.ax, -v.dot(lg.ax)); const d = w.length(); if (d > 0.15) continue;
        cx.copy(v).applyMatrix4(lg.th.matrixWorld); root.worldToLocal(cx);          // vị trí trong hệ nhân vật: chân trái x>0, phải x<0
        if (Math.abs(cx.x) >= 0.012 && Math.sign(cx.x) !== side) continue;
        const th = Math.atan2(w.dot(lg.uv), w.dot(lg.fv)), ti = Math.min(NT - 1, Math.max(0, Math.floor((t - TMIN) / (TMAX - TMIN) * NT))),
              ai = ((Math.round(th / (2 * Math.PI) * NA) % NA) + NA) % NA;
        if (d > R[ti * NA + ai]) R[ti * NA + ai] = d;
      }
      // lấp ô trống từ ô lân cận, rồi nở nhẹ (đỉnh thưa: mặt quần giữa 2 đỉnh nằm ngoài dây cung)
      for (let pass = 0; pass < 8; pass++) {
        const R2 = R.slice();
        for (let ti = 0; ti < NT; ti++) for (let ai = 0; ai < NA; ai++) if (!R[ti * NA + ai]) {
          let sum = 0, n = 0;
          for (const [dt, da] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t2 = ti + dt; if (t2 < 0 || t2 >= NT) continue; const x = R[t2 * NA + (ai + da + NA) % NA]; if (x) { sum += x; n++; } }
          if (n) R2[ti * NA + ai] = sum / n;
        }
        R.set(R2);
      }
      let mean = 0, nn = 0; for (const x of R) if (x) { mean += x; nn++; } mean = nn ? mean / nn : 0.075;
      for (let k = 0; k < R.length; k++) if (!R[k]) R[k] = mean;
      const Rd = R.slice();
      for (let ti = 0; ti < NT; ti++) for (let ai = 0; ai < NA; ai++) {
        let m = R[ti * NA + ai];
        for (const [dt, da] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t2 = ti + dt; if (t2 < 0 || t2 >= NT) continue; m = Math.max(m, 0.94 * R[t2 * NA + (ai + da + NA) % NA]); }
        Rd[ti * NA + ai] = m + 0.004;
      }
      lg.prof = Rd; lg.inv = new THREE.Matrix4(); lg.off = 0;
    }
  })();

  const tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3(), cur = new THREE.Vector3(), des = new THREE.Vector3();
  const mid = new THREE.Vector3(), mid0 = new THREE.Vector3(), ab = new THREE.Vector3(), ap = new THREE.Vector3(), cp = new THREE.Vector3();
  const dq = new THREE.Quaternion(), nq = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), tq = new THREE.Quaternion();
  const sim = chains.map(bones => {
    const n = bones.length;
    return {
      bones, n,
      restQ: bones.map(b => b.quaternion.clone()),
      P: Array.from({length: n + 1}, () => new THREE.Vector3()),     // hạt: gốc từng xương + đầu mút
      V: Array.from({length: n + 1}, () => new THREE.Vector3()),     // vận tốc (m/s)
      O: Array.from({length: n + 1}, () => new THREE.Vector3()),     // vị trí đầu bước (để suy ra vận tốc sau ràng buộc)
      T: Array.from({length: n + 1}, () => new THREE.Vector3()),     // mục tiêu theo animation (thế giới)
      L: new Array(n).fill(0.05),                                    // độ dài đoạn
      Wq: bones.map(() => new THREE.Quaternion()),                   // quaternion thế giới ở tư thế nghỉ + animation hông
      tipLen: 0.06,
    };
  });

  function fillTargets(s) {
    const {bones, n, T, Wq} = s;
    for (let i = 0; i < n; i++) {
      const b = bones[i];
      b.quaternion.copy(s.restQ[i]);
      b.updateWorldMatrix(false, false);                 // cha đã cập nhật trước; xương theo thứ tự cha → con
      b.matrixWorld.decompose(T[i], Wq[i], tmpV);
    }
    tmpV.set(0, s.tipLen, 0).applyMatrix4(bones[n - 1].matrixWorld); T[n].copy(tmpV);   // đầu mút: dọc +Y xương cuối
  }

  function updateLegs() {
    for (const lg of legs) {
      lg.th.updateWorldMatrix(true, false); lg.lg.updateWorldMatrix(true, false);
      lg.th.getWorldPosition(lg.b); lg.lg.getWorldPosition(tmpV);         // b = đùi (gốc), tmpV = cẳng
      lg.a.copy(lg.b).sub(tmpV).multiplyScalar(EXTEND).add(lg.b);         // a = điểm kéo lên hông
      lg.b.copy(tmpV);                                                    // capsule a(hông) → b(gối)
      if (lg.prof) lg.inv.copy(lg.th.matrixWorld).invert();
    }
  }

  const pq = new THREE.Vector3(), pw = new THREE.Vector3();
  function profR(lg, t, th) {           // bán kính mặt quần (nội suy song tuyến)
    const ft = Math.min(NT - 1.001, Math.max(0, (t - TMIN) / (TMAX - TMIN) * NT - 0.5)), t0 = Math.floor(ft), a = ft - t0;
    let fa = th / (2 * Math.PI) * NA; fa = ((fa % NA) + NA) % NA; const a0 = Math.floor(fa) % NA, a1 = (a0 + 1) % NA, b = fa - Math.floor(fa), P = lg.prof;
    const r0 = P[t0 * NA + a0] * (1 - b) + P[t0 * NA + a1] * b, r1 = P[(t0 + 1) * NA + a0] * (1 - b) + P[(t0 + 1) * NA + a1] * b;
    return r0 * (1 - a) + r1 * a + R_STR + lg.off;
  }
  // khoảng hở có dấu giữa p và mặt quần của chân lg (âm = đang nằm trong quần); đặt pq/pw (hệ đùi) để đẩy ra
  function profClear(p, lg) {
    pq.copy(p).applyMatrix4(lg.inv);
    const t = pq.dot(lg.ax) / lg.L; if (t < TMIN || t > TMAX) return 9;
    pw.copy(pq).addScaledVector(lg.ax, -pq.dot(lg.ax)); const d = pw.length();
    const th = Math.atan2(pw.dot(lg.uv), pw.dot(lg.fv)); lg.cR = profR(lg, t, th); lg.cD = d; lg.cT = t;
    return d - lg.cR;
  }
  function pushProfile(p, lg) {
    const c = profClear(p, lg); if (c >= 0) return false;
    if (lg.cD < 1e-5) pw.copy(lg.fv); else pw.multiplyScalar(1 / lg.cD);
    pq.copy(lg.ax).multiplyScalar(lg.cT * lg.L).addScaledVector(pw, lg.cR);
    p.copy(pq).applyMatrix4(lg.th.matrixWorld);
    return true;
  }

  // đẩy điểm p ra khỏi capsule; trả về true nếu có chạm
  function pushOut(p, lg) {
    if (lg.prof) return pushProfile(p, lg);
    ab.copy(lg.b).sub(lg.a); const l2 = ab.lengthSq() || 1e-9;
    ap.copy(p).sub(lg.a); const t = Math.max(0, Math.min(1, ap.dot(ab) / l2));
    cp.copy(lg.a).addScaledVector(ab, t);
    tmpW.copy(p).sub(cp); const d2 = tmpW.lengthSq();
    if (d2 >= lg.r * lg.r) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-5) tmpW.set(0, 0, 1); else tmpW.multiplyScalar(1 / d);
    p.copy(cp).addScaledVector(tmpW, lg.r);
    return true;
  }

  let primed = false;
  const lastRoot = new THREE.Vector3();
  function prime() {
    updateLegs();
    for (const s of sim) {
      fillTargets(s);
      const {n, T, L} = s;
      for (let i = 0; i < n - 1; i++) L[i] = Math.max(0.01, T[i].distanceTo(T[i + 1]));
      s.tipLen = n > 1 ? L[n - 2] * 0.9 : 0.08;
      fillTargets(s);                                      // lần 2 với tipLen đúng
      L[n - 1] = Math.max(0.01, T[n - 1].distanceTo(T[n]));
      for (let i = 0; i <= n; i++) { s.P[i].copy(T[i]); s.V[i].set(0, 0, 0); }
    }
    // bán kính an toàn: ở tư thế nghỉ dây không được nằm trong capsule (tránh bị "đẩy" ngay khi khởi tạo)
    for (const lg of legs) {
      if (lg.prof) {            // đo độ hở của dây ở tư thế nghỉ (chẩn đoán)
        lg.off = 0; let m = 9;
        for (const s of sim) for (let i = 1; i <= s.n; i++) m = Math.min(m, profClear(s.T[i], lg));
        lg.off = 0; lg.restClear = m; continue;       // nếu rest đã lẹm vào quần thì va chạm đẩy dây ra ngoài mặt quần (≤ ~1 cm) thay vì hạ mặt quần
      }
      let r = R_LEG + R_STR;
      for (const s of sim) for (let i = 1; i <= s.n; i++) {
        ab.copy(lg.b).sub(lg.a); const l2 = ab.lengthSq() || 1e-9;
        ap.copy(s.T[i]).sub(lg.a); const t = Math.max(0, Math.min(1, ap.dot(ab) / l2));
        cp.copy(lg.a).addScaledVector(ab, t); r = Math.min(r, s.T[i].distanceTo(cp) - 0.003);
      }
      lg.r = Math.max(0.05, r);
    }
    lastRoot.copy(sim[0].T[0]);
    primed = true;
  }

  function step(dt, wind) {
    grp.updateWorldMatrix(true, false);                    // cập nhật cả chuỗi cha (root.x…) một lần
    if (!primed) { prime(); return; }
    updateLegs();
    for (const s of sim) fillTargets(s);
    if (sim[0].T[0].distanceToSquared(lastRoot) > TELEPORT * TELEPORT) { prime(); return; }
    lastRoot.copy(sim[0].T[0]);
    const h = dt / SUB;
    // gió: gia tốc theo hướng gió, mạnh/yếu theo từng đợt gió (cùng hàm với cây cỏ) + rung ngang nhẹ
    let wx = 0, wz = 0, wa = 0;
    if (wind && wind.a > 0.01) {
      const ph = wind.t * (1.1 + wind.a * 0.9), gust = 0.55 + 0.45 * (Math.sin(ph) * 0.6 + Math.sin(ph * 2.3 + 1.7) * 0.4);
      wa = wind.a * WIND_K * (0.35 + 0.65 * gust); wx = wind.x; wz = wind.z;
    }
    for (let sub = 0; sub < SUB; sub++) {
      for (let c = 0; c < sim.length; c++) {
        const s = sim[c], {n, P, V, O, T, L} = s;
        P[0].copy(T[0]); V[0].set(0, 0, 0);                // gốc dây ghim cứng vào lưng
        for (let i = 1; i <= n; i++) {
          const p = P[i], v = V[i], k = Math.min(i, OMEGA.length) - 1, w = OMEGA[k], w2 = w * w, zw = 2 * ZETA[k] * w;
          O[i].copy(p);
          const fl = wa ? Math.sin(wind.t * 3.1 + i * 1.7 + c * 2.3) * 0.35 * wa : 0;      // phấp phới ngang
          const ax = -w2 * (p.x - T[i].x) - zw * v.x + wx * wa + wz * fl;
          const ay = -w2 * (p.y - T[i].y) - zw * v.y;
          const az = -w2 * (p.z - T[i].z) - zw * v.z + wz * wa - wx * fl;
          v.x += ax * h; v.y += ay * h; v.z += az * h;
          p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
          tmpV.copy(p).sub(T[i]); const dv = tmpV.length();
          if (dv > DEV_MAX) p.copy(T[i]).addScaledVector(tmpV, DEV_MAX / dv);   // kẹp mềm quanh dáng animation
        }
        for (let it = 0; it < ITER; it++) {
          for (let i = 1; i <= n; i++) {                   // giữ độ dài đoạn
            tmpV.copy(P[i]).sub(P[i - 1]); const d = tmpV.length() || 1e-6;
            P[i].copy(P[i - 1]).addScaledVector(tmpV, L[i - 1] / d);
          }
          for (const lg of legs) for (let i = 1; i <= n; i++) {   // va chạm quần: hạt + điểm giữa đoạn
            pushOut(P[i], lg);
            if (i > 1) {                                                        // điểm giữa đoạn (i-1 → i) cũng không được xuyên
              mid.copy(P[i]).add(P[i - 1]).multiplyScalar(0.5); mid0.copy(mid);
              if (pushOut(mid, lg)) { mid.sub(mid0); P[i].add(mid); P[i - 1].add(mid); }
            }
          }
        }
        for (let i = 1; i <= n; i++) V[i].copy(P[i]).sub(O[i]).multiplyScalar(1 / h);   // vận tốc sau ràng buộc (PBD)
      }
    }
    // xoay xương: từ hướng mục tiêu → hướng mô phỏng
    for (const s of sim) {
      const {bones, n, P, T, Wq} = s;
      bones[0].parent.getWorldQuaternion(parentQ);
      for (let i = 0; i < n; i++) {
        const b = bones[i];
        cur.copy(T[i + 1]).sub(T[i]).normalize();
        des.copy(P[i + 1]).sub(P[i]).normalize();
        dq.setFromUnitVectors(cur, des);
        nq.copy(dq).multiply(Wq[i]);                       // quaternion thế giới mới của xương
        tq.copy(parentQ).invert().multiply(nq);
        b.quaternion.copy(tq);
        parentQ.copy(nq);                                  // cha của xương kế tiếp
      }
    }
  }

  return {
    chains: sim.length,
    // dt giây; near = true nếu nhân vật đang hiện & gần camera
    update(dt, near = true, wind = null) {
      if (!near) { primed = false; return; }       // ngủ: khi hiện lại thì khởi tạo lại tại chỗ (không văng)
      dt = Math.min(dt, 1 / 20);
      if (dt <= 0) return;
      step(dt, wind);
    },
    reset() { primed = false; },
    // chẩn đoán
    maxDev() { let m = 0; for (const s of sim) for (let i = 1; i <= s.n; i++) m = Math.max(m, s.P[i].distanceTo(s.T[i])); return m; },
    // khoảng cách nhỏ nhất từ hạt tới trục capsule chân trừ bán kính (âm = xuyên quần)
    minClear() { let m = 9; for (const lg of legs) for (const s of sim) for (let i = 1; i <= s.n; i++) {
      if (lg.prof) { m = Math.min(m, profClear(s.P[i], lg)); continue; }
      ab.copy(lg.b).sub(lg.a); const l2 = ab.lengthSq() || 1e-9; ap.copy(s.P[i]).sub(lg.a);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / l2)); cp.copy(lg.a).addScaledVector(ab, t); m = Math.min(m, s.P[i].distanceTo(cp) - lg.r); } return m; },
    dbg() { const o = []; for (const lg of legs) for (const s of sim) { o.push(s.P.slice(1).map((p, i) => { const c = lg.prof ? profClear(p, lg) : 0; return (c * 1000).toFixed(0) + '/t' + (lg.cT || 0).toFixed(2) + '/dev' + (p.distanceTo(s.T[i + 1]) * 100).toFixed(1); }).join(' ')); } return o.join('\n'); },
    legR() { return legs.map(l => l.prof ? 'profile rest=' + (l.restClear || 0).toFixed(3) + ' front R(t)=' + Array.from({length: NT}, (_, i) => l.prof[i * NA].toFixed(3)).join('/') : +l.r.toFixed(3)); },
  };
}
