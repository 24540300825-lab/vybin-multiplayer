// Cầu nối game <-> mạng. Mô hình: mỗi người sở hữu nhân vật của mình (authority = chủ nhân vật).
//  - Lệnh (move/sleep/sit/...) + trạng thái phím được gửi ngay khi đổi; bản sao điều khiển nhân vật remote bằng CHÍNH state-machine của game
//    (nên animation/leo giường/leo ghế y hệt, không phải đồng bộ từng clip).
//  - Snapshot vị trí 6Hz khi di chuyển, 1Hz khi đứng yên: remote nắn dần về snapshot (chống lệch), snap nếu lệch lớn.
//  - Không ghi DB cho tần suất cao.
import {CONFIG} from '../config.js';
import {OTHER} from './session.js';

const r3 = v => Math.round(v * 1000) / 1000;

export function bindSync(sess, api, loadChar) {
  let remoteLoading = false, queue = [], snapT = 0, lastIn = '', lastInT = 0, seq = 0;

  async function ensureRemote(slot) {
    if (api.remote && api.remote.id === slot) return;
    if (remoteLoading) return; remoteLoading = true;
    try {
      const glb = await loadChar(slot);
      api.addRemote(slot, glb);
      queue.splice(0).forEach(fn => fn());
      sess.send({k: 'hello'});           // xin trạng thái hiện tại của đối phương
    } catch (e) { console.error('[sync] load remote', e); }
    finally { remoteLoading = false; }
  }
  const whenRemote = fn => (api.remote ? fn() : queue.push(fn));

  // ----- local -> net -----
  api.emit = (t, a) => sess.send({k: 'c', t, a});
  api.sendInput = inp => {
    // chỉ gửi khi đổi (lượng tử hoá) hoặc nhắc lại 1Hz khi đang giữ phím
    const s = (inp.mag > 0.1 ? [r3(inp.x), r3(inp.z), inp.run ? 1 : 0].join() : '0');
    const now = performance.now();
    if (s !== lastIn || (s !== '0' && now - lastInT > 1000)) {
      if (s !== lastIn && now - lastInT < 45 && s !== '0') return;          // giới hạn ~20Hz
      lastIn = s; lastInT = now;
      sess.send({k: 'i', x: r3(inp.x), z: r3(inp.z), r: inp.run ? 1 : 0, m: inp.mag > 0.1 ? 1 : 0});
      if (s !== '0') snapT = Math.min(snapT, 0.1);
    }
  };
  api.onTick = dt => {
    snapT -= dt;
    if (snapT > 0) return;
    const st = api.snapshot(); if (!st) return;
    sess.send({k: 's', n: ++seq, ...st});
    snapT = (st.mv ? 1 / CONFIG.snapshotHz : 1 / CONFIG.idleHz);
  };

  // ----- net -> local -----
  sess.on('msg', m => {
    switch (m.k) {
      case 'i': whenRemote(() => api.setRemoteInput(m)); break;
      case 'c': whenRemote(() => api.applyCmd(m.t, m.a)); break;
      case 's': whenRemote(() => api.applyState(m)); break;
      case 'hello': { const st = api.snapshot(); if (st) sess.send({k: 's', n: ++seq, ...st, f: 1}); api.syncEnvOut && api.syncEnvOut(); break; }
      case 'env': api.applyEnv && api.applyEnv(m); break;
      default: break;   // 'sig','mic','map' do module khác xử lý
    }
  });
  sess.on('peer', ({present, slot}) => {
    if (present) ensureRemote(slot);
    else { api.removeRemote(); queue = []; }
    api.peerChanged && api.peerChanged(present, slot);
  });
  sess.on('reconnected', () => { sess.send({k: 'hello'}); snapT = 0; });
  sess.on('reclaimed', () => { snapT = 0; });
  if (sess.peer) ensureRemote(sess.peer.slot);
}
