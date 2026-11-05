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
const R_STR = 0.010;                  // độ dày sợi dây
const EXTEND = 0.9;                   // kéo capsule lên phía hông (tỉ lệ chiều dài đùi) để phủ cả vùng hông
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
    }
  }

  // đẩy điểm p ra khỏi capsule; trả về true nếu có chạm
  function pushOut(p, lg) {
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
      ab.copy(lg.b).sub(lg.a); const l2 = ab.lengthSq() || 1e-9; ap.copy(s.P[i]).sub(lg.a);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / l2)); cp.copy(lg.a).addScaledVector(ab, t); m = Math.min(m, s.P[i].distanceTo(cp) - lg.r); } return m; },
    legR() { return legs.map(l => +l.r.toFixed(3)); },
  };
}
