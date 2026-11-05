// Vật lý 2 sợi dây đai lưng của Bin (skin "TIGHT BONE": 1 xương nút buộc + 2 chuỗi 3 xương, gắn dưới root.x của rig).
// • Nút buộc (xương lẻ) và gốc 2 sợi dây ghim cứng vào lưng/hông — không mô phỏng.
// • 2 sợi dây mô phỏng như dây vải mềm: verlet có quán tính + trọng lực thật + cản không khí, chỉ có lò xo RẤT yếu giữ dáng
//   (yếu dần về phía đầu dây) → rủ xuống, đung đưa theo chuyển động hông/nhảy/lao rồi lắng xuống nhẹ nhàng.
// • Va chạm với quần: mỗi chân là 1 capsule (xương đùi → xương cẳng, kéo dài lên phía hông) — dây bị đẩy ra ngoài, không xuyên mesh quần.
// Chi phí: 2 sợi × 3 hạt, 2 bước con mỗi khung, không allocate; tự ngủ khi nhân vật ẩn / ở xa camera.
import * as THREE from 'three';

const G = -9.8 * 0.6;                 // trọng lực hiệu dụng (vải nhẹ, có lực nâng của không khí)
const DRAG = 8;                       // cản (1/s) — vải: nhớt, tắt dần êm, không dao động qua lại
const DRAG_SLOW = 14;                 // cản thêm khi hạt gần như đứng yên → đoạn kết thúc chuyển động rất mượt
const DEV_MAX = 0.16;                 // lệch tối đa so với dáng animation (m) — kẹp mềm, dây không bay quá xa
const SPRING = [6, 4, 2.5];         // lò xo giữ dáng (1/s) theo hạt 1..3 — đầu dây tự do nhất
const SUB = 2;                        // số bước con mỗi khung (ổn định khi hông xoay nhanh)
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
      Q: Array.from({length: n + 1}, () => new THREE.Vector3()),     // vị trí bước trước (verlet)
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
      for (let i = 0; i <= n; i++) { s.P[i].copy(T[i]); s.Q[i].copy(T[i]); }
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

  function step(dt) {
    grp.updateWorldMatrix(true, false);                    // cập nhật cả chuỗi cha (root.x…) một lần
    if (!primed) { prime(); return; }
    updateLegs();
    for (const s of sim) fillTargets(s);
    if (sim[0].T[0].distanceToSquared(lastRoot) > TELEPORT * TELEPORT) { prime(); return; }
    lastRoot.copy(sim[0].T[0]);
    const h = dt / SUB, g = G * h * h, dragA = Math.exp(-DRAG * h), dragB = Math.exp(-(DRAG + DRAG_SLOW) * h);
    for (let sub = 0; sub < SUB; sub++) {
      for (const s of sim) {
        const {n, P, Q, T, L} = s;
        P[0].copy(T[0]); Q[0].copy(T[0]);                  // gốc dây ghim cứng vào lưng
        for (let i = 1; i <= n; i++) {
          const p = P[i], q = Q[i];
          tmpV.copy(p).sub(q);                               // vận tốc theo bước
          const sp = tmpV.length() / h;                      // m/s
          tmpV.multiplyScalar(sp < 0.6 ? dragB + (dragA - dragB) * (sp / 0.6) : dragA);   // chậm → cản mạnh hơn (tắt dần êm)
          q.copy(p);
          p.add(tmpV); p.y += g;
          const k = 1 - Math.exp(-SPRING[Math.min(i, SPRING.length) - 1] * h);   // lò xo yếu giữ dáng
          p.x += (T[i].x - p.x) * k; p.y += (T[i].y - p.y) * k; p.z += (T[i].z - p.z) * k;
          tmpV.copy(p).sub(T[i]); const dv = tmpV.length();
          if (dv > DEV_MAX) p.copy(T[i]).addScaledVector(tmpV, DEV_MAX / dv);   // kẹp mềm quanh dáng animation
        }
        for (let it = 0; it < ITER; it++) {
          for (let i = 1; i <= n; i++) {                   // giữ độ dài đoạn
            tmpV.copy(P[i]).sub(P[i - 1]); const d = tmpV.length() || 1e-6;
            P[i].copy(P[i - 1]).addScaledVector(tmpV, L[i - 1] / d);
          }
          for (const lg of legs) for (let i = 1; i <= n; i++) {   // va chạm quần: hạt + điểm giữa đoạn
            if (pushOut(P[i], lg)) Q[i].lerp(P[i], 0.25);                      // ma sát: mất bớt vận tốc khi cọ vào quần
            if (i > 1) {                                                        // điểm giữa đoạn (i-1 → i) cũng không được xuyên
              mid.copy(P[i]).add(P[i - 1]).multiplyScalar(0.5); mid0.copy(mid);
              if (pushOut(mid, lg)) { mid.sub(mid0); P[i].add(mid); P[i - 1].add(mid); }
            }
          }
        }
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
    update(dt, near = true) {
      if (!near) { primed = false; return; }       // ngủ: khi hiện lại thì khởi tạo lại tại chỗ (không văng)
      dt = Math.min(dt, 1 / 20);
      if (dt <= 0) return;
      step(dt);
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
