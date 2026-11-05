// Vật lý thứ cấp cho đai lưng của Bin (skin "TIGHT BONE": 7 xương = 1 xương lẻ + 2 chuỗi 3 xương, gắn dưới root.x của rig).
// Mục tiêu: chạy trên web gần như miễn phí — chỉ ~7 hạt, không allocate mỗi khung, tự ngủ khi nhân vật ẩn / ở xa camera.
// Cách làm (verlet + lò xo về tư thế animation):
//   1) đặt lại xương về tư thế nghỉ (rest) → cập nhật ma trận thế giới → có "mục tiêu" T (đai nằm đúng chỗ theo animation hông)
//   2) hạt mô phỏng P: quán tính (verlet) + trọng lực nhẹ + lò xo kéo về T + ràng buộc độ dài đoạn
//   3) mỗi xương xoay sao cho trục +Y hướng tới hạt kế tiếp (xoay tối thiểu từ hướng mục tiêu → hướng mô phỏng)
// Nhân vật dịch chuyển/xoay/nhảy → hạt "tụt lại" rồi đung đưa về chỗ cũ, giống đai thật.
import * as THREE from 'three';

const G = -9.8 * 0.45;          // trọng lực nhẹ (đai ngắn, hơi cứng)
const STIFF = 16;               // lò xo về tư thế animation (1/s) — càng lớn càng cứng
const DAMP = 7;                 // cản vận tốc (1/s)
const MAXDEV = 0.07;            // lệch tối đa so với mục tiêu (m) — quá thì đặt lại (teleport/đổi map)

export function makeBelt(root, opts = {}) {
  let grp = null;
  root.traverse(o => { if (!grp && /^TIGHT_?BONE/i.test(o.name) && o.children.length) grp = o; });
  if (!grp) return null;
  // chuỗi = mỗi con trực tiếp của nhóm, đi theo con đầu tiên
  const chains = [];
  for (const c of grp.children) {
    if (!c.isBone) continue;
    const bones = [c]; let b = c;
    while (b.children.length && b.children[0].isBone) { b = b.children[0]; bones.push(b); }
    chains.push(bones);
  }
  if (!chains.length) return null;

  const tmpV = new THREE.Vector3(), cur = new THREE.Vector3(), des = new THREE.Vector3();
  const dq = new THREE.Quaternion(), nq = new THREE.Quaternion(), parentQ = new THREE.Quaternion();
  const sim = chains.map(bones => {
    const n = bones.length;
    return {
      bones, n,
      restQ: bones.map(b => b.quaternion.clone()),
      P: Array.from({length: n + 1}, () => new THREE.Vector3()),     // hạt: gốc từng xương + đầu mút
      Q: Array.from({length: n + 1}, () => new THREE.Vector3()),     // vị trí khung trước (verlet)
      T: Array.from({length: n + 1}, () => new THREE.Vector3()),     // mục tiêu theo animation
      L: new Array(n).fill(0.05),                                    // độ dài đoạn (thế giới)
      Wq: bones.map(() => new THREE.Quaternion()),                   // quaternion thế giới ở tư thế nghỉ
      tipLen: 0.06, ready: false,
    };
  });

  function fillTargets(s) {
    const {bones, n, T, Wq} = s;
    for (let i = 0; i < n; i++) {
      const b = bones[i];
      b.quaternion.copy(s.restQ[i]);
      b.updateWorldMatrix(false, false);                 // cha (nhóm TIGHT BONE) đã được cập nhật trước; các xương theo thứ tự cha → con
      b.matrixWorld.decompose(T[i], Wq[i], tmpV);
    }
    // đầu mút: dọc +Y của xương cuối, dài tipLen
    tmpV.set(0, s.tipLen, 0).applyMatrix4(bones[n - 1].matrixWorld); T[n].copy(tmpV);
  }

  let primed = false, lastT = 0;
  function prime() {
    for (const s of sim) {
      fillTargets(s);
      const {n, T, L} = s;
      for (let i = 0; i < n - 1; i++) L[i] = Math.max(0.01, T[i].distanceTo(T[i + 1]));
      s.tipLen = n > 1 ? L[n - 2] * 0.9 : 0.08;
      fillTargets(s);                                      // lần 2 với tipLen đúng
      L[n - 1] = Math.max(0.01, T[n - 1].distanceTo(T[n]));
      for (let i = 0; i <= n; i++) { s.P[i].copy(T[i]); s.Q[i].copy(T[i]); }
      s.ready = true;
    }
    primed = true;
  }

  function step(dt) {
    if (!primed) { grp.updateWorldMatrix(true, false); prime(); return; }
    grp.updateWorldMatrix(true, false);                    // cập nhật cả chuỗi cha (root.x…) một lần
    const k = 1 - Math.exp(-STIFF * dt), damp = Math.exp(-DAMP * dt), g = G * dt * dt;
    for (const s of sim) {
      const {bones, n, P, Q, T, L, Wq} = s;
      fillTargets(s);
      // đầu chuỗi bám cứng vào hông
      P[0].copy(T[0]); Q[0].copy(T[0]);
      for (let i = 1; i <= n; i++) {
        const p = P[i], q = Q[i];
        tmpV.copy(p).sub(q).multiplyScalar(damp);          // vận tốc có cản
        q.copy(p);
        p.add(tmpV); p.y += g;
        p.x += (T[i].x - p.x) * k; p.y += (T[i].y - p.y) * k; p.z += (T[i].z - p.z) * k;   // lò xo về animation
        if (p.distanceToSquared(T[i]) > MAXDEV * MAXDEV) { p.copy(T[i]); q.copy(T[i]); }
      }
      // ràng buộc độ dài (2 vòng)
      for (let it = 0; it < 2; it++) for (let i = 1; i <= n; i++) {
        tmpV.copy(P[i]).sub(P[i - 1]); const d = tmpV.length() || 1e-6;
        P[i].copy(P[i - 1]).addScaledVector(tmpV, L[i - 1] / d);
      }
      // xoay xương: từ hướng mục tiêu → hướng mô phỏng
      bones[0].parent.getWorldQuaternion(parentQ);
      for (let i = 0; i < n; i++) {
        const b = bones[i];
        cur.copy(T[i + 1]).sub(T[i]).normalize();
        des.copy(P[i + 1]).sub(P[i]).normalize();
        dq.setFromUnitVectors(cur, des);                   // xoay thế giới nhỏ: hướng mục tiêu → hướng mô phỏng
        nq.copy(dq).multiply(Wq[i]);                       // quaternion thế giới mới của xương
        b.quaternion.copy(parentQ).invert().multiply(nq);  // → quaternion cục bộ
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
    // chẩn đoán: độ lệch lớn nhất của hạt so với tư thế animation (m)
    maxDev() { let m = 0; for (const s of sim) for (let i = 1; i <= s.n; i++) m = Math.max(m, s.P[i].distanceTo(s.T[i])); return m; },
  };
}
