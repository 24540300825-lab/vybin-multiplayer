// Cầu nối game <-> mạng. Mô hình: mỗi người sở hữu nhân vật của mình (authority = chủ nhân vật).
//  - Lệnh (move/sleep/sit/...) + trạng thái phím được gửi ngay khi đổi; bản sao điều khiển nhân vật remote bằng CHÍNH state-machine của game
//    (nên animation/leo giường/leo ghế y hệt, không phải đồng bộ từng clip).
//  - Snapshot vị trí 6Hz khi di chuyển, 1Hz khi đứng yên: remote nắn dần về snapshot (chống lệch), snap nếu lệch lớn.
//  - Không ghi DB cho tần suất cao.
import {CONFIG} from '../config.js';
import {OTHER} from './session.js';

const r3 = v => Math.round(v * 1000) / 1000;

export function bindSync(sess, api, loadChar) {
  let remoteLoading = false, queue = [], snapT = 0, lastInT = 0, seq = 0, goneT = 0, lastDr = '', needNow = false, wasMv = 0;

  async function ensureRemote(slot) {
    if (api.remote && api.remote.id === slot) return;
    if (remoteLoading) return; remoteLoading = true;
    try {
      const glb = await loadChar(slot);
      if (!sess.peer || sess.peer.slot !== slot) return;      // đối phương đã đi trong lúc tải nhân vật → không dựng bản sao "ma"
      api.addRemote(slot, glb);
      queue.splice(0).forEach(fn => fn());
      sess.send({k: 'hello'});           // xin trạng thái hiện tại của đối phương
    } catch (e) { console.error('[sync] load remote', e); }
    finally { remoteLoading = false; }
  }
  const whenRemote = fn => (api.remote ? fn() : queue.push(fn));

  // ----- local -> net -----
  // Lệnh (click-đi, ngồi, ngủ…) gửi xong thì gửi LUÔN 1 gói vị trí mới (~60ms sau, khi lộ trình đã dựng) — trước đây gói vị trí lúc đứng yên chỉ 2.5s/lần nên máy kia bị kéo về vị trí cũ rồi "nhảy".
  api.emit = (t, a) => { const r = sess.send({k: 'c', t, a}); snapT = Math.min(snapT, 0.06); return r; };
  // Ngân sách tin nhắn: Supabase Realtime giới hạn số tin/giây mỗi kết nối. Trước đây mỗi lần đổi hướng phím gửi ~20 tin/s + snapshot 6/s => vượt trần,
  // tin bị rơi/trễ => nhân vật kia "đứng im rồi giật". Giờ: chỉ gửi 'i' khi đổi trạng thái đi/dừng/chạy hoặc đổi hướng đáng kể (<=6/s);
  // hướng phím hiện tại luôn kèm theo trong snapshot (8/s) nên mất 1 tin cũng không làm nhân vật bị kẹt. Tổng khi di chuyển <= ~14 tin/s.
  let curIn = {x: 0, z: 0, r: 0, m: 0}, lastMv = 0, lastRun = 0, lastAng = 0;
  const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  api.sendInput = inp => {
    const mv = inp.mag > 0.1 ? 1 : 0, run = inp.run ? 1 : 0, now = performance.now(), ang = mv ? Math.atan2(inp.x, inp.z) : 0;
    curIn = {x: r3(inp.x), z: r3(inp.z), r: run, m: mv};
    const edge = mv !== lastMv || run !== lastRun;
    const turned = mv && Math.abs(angD(ang, lastAng)) > 0.35 && now - lastInT > 170;
    const keep = mv && now - lastInT > 1000;
    if (!(edge || turned || keep)) return;
    lastMv = mv; lastRun = run; lastAng = ang; lastInT = now;
    sess.send({k: 'i', x: curIn.x, z: curIn.z, r: run, m: mv});
    // Vừa đi (phím): gửi vị trí chính xác NGAY. (Dừng: gói chốt được gửi ở onTick khi nhân vật thật sự đứng yên.)
    if (mv) snapT = Math.min(snapT, 0.03);
    if (edge && mv) needNow = true;
  };
  api.onTick = dt => {
    snapT -= dt;
    const st = api.snapshot(); if (!st) return;
    if (wasMv && !st.mv) snapT = 0;           // vừa dừng hẳn (phím hoặc click-đi): gửi gói chốt ngay để máy kia không lướt quá đà rồi bị kéo ngược
    wasMv = st.mv;
    if (snapT > 0 && !needNow) return;
    needNow = false;
    const msg = {k: 's', n: ++seq, ...st, ix: curIn.x, iz: curIn.z, ir: curIn.r, im: curIn.m};
    // bảng trạng thái cửa: gửi khi đổi, khi đứng yên, và định kỳ (mất gói cũng tự khớp lại)
    if (api.doorSig) { const dr = api.doorSig(); if (dr !== lastDr || !st.mv || seq % 8 === 0) { msg.dr = dr; lastDr = dr; } }
    sess.send(msg);
    snapT = (st.mv ? 1 / CONFIG.snapshotHz : 1 / CONFIG.idleHz);
  };

  // ----- net -> local -----
  sess.on('msg', m => {
    switch (m.k) {
      case 'i': whenRemote(() => api.setRemoteInput(m)); break;
      case 'c': whenRemote(() => api.applyCmd(m.t, m.a)); break;
      case 's': if (m.dr && api.applyDoors) api.applyDoors(m.dr, sess.peer ? sess.peer.slot === 'bin' : m.slot === 'bin'); whenRemote(() => { api.applyState(m, Math.min(0.25, (sess.rtt || 0) / 2000)); if (m.ix !== undefined) api.setRemoteInput({x: m.ix, z: m.iz, r: m.ir, m: m.im}); }); break;
      case 'hello': { const st = api.snapshot(); if (st) sess.send({k: 's', n: ++seq, ...st, f: 1, dr: api.doorSig ? api.doorSig() : undefined}); api.syncEnvOut && api.syncEnvOut(); break; }
      case 'env': api.applyEnv && api.applyEnv(m); break;
      default: break;   // 'sig','mic','map' do module khác xử lý
    }
  });
  sess.on('peer', ({present, slot}) => {
    // Presence của Realtime hay "chớp" (mất rồi có lại trong vài giây khi mạng rung): đừng xoá-dựng lại nhân vật ngay, vì bản dựng lại mọc ở vị trí gốc
    // tới khi có snapshot kế (tới 2.5s) => thấy đối phương "dịch chuyển/nhân đôi". Đợi 2.5s xem có quay lại không.
    clearTimeout(goneT);
    if (present) ensureRemote(slot);
    else goneT = setTimeout(() => { if (!sess.peer) { api.removeRemote(); queue = []; } }, 2500);
    api.peerChanged && api.peerChanged(present, slot);
  });
  sess.on('reconnected', () => { sess.send({k: 'hello'}); snapT = 0; });
  sess.on('reclaimed', () => { snapT = 0; });
  if (sess.peer) ensureRemote(sess.peer.slot);
}
