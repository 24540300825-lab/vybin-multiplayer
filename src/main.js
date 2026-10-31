// Điểm khởi động: cấu hình → (multiplayer) giữ slot BIN/VY → nạp asset của map + nhân vật của mình → dựng game → gắn mạng/chat/voice.
import {CONFIG} from './config.js';
import * as Assets from './assets.js';
import {MAP_LIST, DEFAULT_MAP, isMap, goToMap, prefetchMap} from './maps.js';
import {FILES} from './manifest.js';
import {SFX} from './sfx.js';
window.SFX = SFX; SFX.init();

const $ = id => document.getElementById(id);
const LB = (p, t) => { const b = $('lb'); if (b) b.style.width = Math.round(p) + '%'; const n = $('lpct'); if (n) n.textContent = Math.round(p) + '%'; if (t) $('lmsg').textContent = t; };
const fail = e => { console.error(e); $('lmsg').textContent = 'LỖI: ' + (e && e.message || e); $('lmsg').style.color = '#ff8080'; };
addEventListener('unhandledrejection', e => console.error('[unhandled]', e.reason));

async function boot() {
  let sess = null, slot, mapId, gate = null;
  const {mountGate} = await import('./ui/mp-ui.js');
  gate = mountGate();
  const hide = () => { $('load').classList.add('out'); setTimeout(() => $('load').style.display = 'none', 750); };   // dùng cho màn lỗi/cổng: mờ đi ngay
  // vào game: ảnh loading tối dần về đen (.5s) → đen mờ dần để lộ game (.6s)
  const reveal = () => { const l = $('load'); l.classList.add('black'); setTimeout(() => { l.classList.add('out'); setTimeout(() => l.style.display = 'none', 700); }, 520); };

  // ---------- 1) nhân vật + phiên ----------
  // Lần đầu: màn CHỌN NHÂN VẬT (BIN / VY). Máy nhớ lựa chọn (localStorage 'vyChar') → các lần sau tự vào đúng nhân vật, không hỏi lại.
  // ?as=bin|vy ép nhân vật (dùng khi test), không lưu.
  const {pickChar, savedChar, saveChar} = await import('./ui/pick.js');
  const forced = (CONFIG.as === 'bin' || CONFIG.as === 'vy') ? CONFIG.as : null;
  let pref = forced || savedChar(), note = '';
  if (CONFIG.multiplayer) {
    const {Session} = await import('./net/session.js');
    sess = new Session();
    sess.on('status', ({state, text}) => {
      if (state === 'full') { hide(); gate.show('🚪', 'Chỗ của bạn đã có người khác vào', 'Bạn rời đi khá lâu nên chỗ đã được nhường. Bấm Thử lại để vào lại nếu còn chỗ.', [['Thử lại', () => location.reload()]]); }
      if (state === 'dup') { hide(); gate.show('🪟', 'Đang mở ở tab khác', 'Tài khoản/slot này đang được dùng ở một tab khác. Dùng tab đó hoặc bấm nút bên dưới để chuyển sang tab này.', [['Dùng tab này', () => location.reload()]]); }
    });
    LB(5, 'Đang kết nối phòng "' + CONFIG.room + '"...');
    const fatal = e => {
      hide();
      if (e.code === 'full') gate.show('🚪', 'Phòng đã đủ 2 người', 'BIN và VY đều đã có người. Thử lại sau, hoặc vào phòng khác bằng ?room=ten-phong.', [['Thử lại', () => location.reload()]]);
      else gate.show('⚠️', 'Không kết nối được', String(e.message || e), [['Thử lại', () => location.reload()], ['Chơi một mình', () => { const u = new URL(location.href); u.searchParams.set('solo', '1'); location.href = u; }]]);
    };
    try { await sess.init(); } catch (e) { fatal(e); return; }
    for (;;) {
      if (!pref) {
        const taken = await sess.peek();
        if (taken.length >= 2) { fatal(Object.assign(new Error('full'), {code: 'full'})); return; }
        pref = await pickChar({taken, note}); note = '';
        if (!forced) saveChar(pref);
      }
      try { const r = await sess.connect(pref); slot = r.slot; mapId = (location.hash.match(/map=(\w+)/) || [])[1] || localStorage.getItem('vyMap'); if (!isMap(mapId)) mapId = r.map; break; }   // map là của RIÊNG từng người
      catch (e) {
        if (e.code === 'taken') { note = (pref === 'bin' ? 'Bin' : 'Vy') + ' đang có người khác dùng — hãy chọn nhân vật còn lại.'; pref = null; continue; }
        fatal(e); return;
      }
    }
  } else {
    if (!pref) { pref = await pickChar({}); }
    slot = pref;
    if (!forced) saveChar(slot);
    mapId = (location.hash.match(/map=(\w+)/) || [])[1] || localStorage.getItem('vyMap');
  }
  if (!isMap(mapId)) mapId = DEFAULT_MAP;
  window.MAPID = mapId; window.LOCAL_SLOT = slot;
  document.title = 'VY · BIN — ' + MAP_LIST[mapId].name;

  // ---------- 2) nạp song song: engine (JS) + asset map + nhân vật của mình ----------
  LB(10, 'Đang tải bản đồ & nhân vật ' + slot.toUpperCase() + '...');
  const enginePromise = import('./game.js');
  const ids = [...MAP_LIST[mapId].assets, 'char-' + slot];
  const files = await Assets.loadGroup(ids, p => LB(10 + p * 60));
  const eng = await enginePromise;
  LB(75, 'Dựng cảnh...');
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const mapKey = 'map-' + mapId;
  eng.init({env: files[mapKey], tree: files['tree'] || null, localGlb: files['char-' + slot], localSlot: slot, mapId});
  const api = eng.api;
  LB(88, 'Biên dịch shader...');
  try { await Promise.race([api.warm(), new Promise(r => setTimeout(r, 4000))]); } catch (e) { console.warn('warm', e); }
  if (CONFIG.perf) window.VY.Perf.toggle(true);

  // ---------- 3) chuyển map (có fade + loading; ĐỘC LẬP từng người, không kéo người kia theo) ----------
  window.__prefetchMap = prefetchMap;
  window.__switchMap = async m => {
    if (!isMap(m) || m === mapId) return;
    prefetchMap(m);
    goToMap(m);        // chỉ mình đổi map; người kia ở lại map của họ
  };

  // ---------- 4) mạng ----------
  if (sess) {
    const {bindSync} = await import('./net/sync.js');
    const {Chat} = await import('./net/chat.js');
    const {Voice} = await import('./net/voice.js');
    const {mountMpUi, toast} = await import('./ui/mp-ui.js');
    const other = slot === 'bin' ? 'vy' : 'bin';
    const loadChar = async s => { const g = await Assets.load('char-' + s); Assets.retain('char-' + s); return g; };
    bindSync(sess, api, loadChar);
    api.envOut = o => sess.send({k: 'env', ...o});
    sess.on('peer', ({present}) => { if (!present) return; });
    // Mỗi người có thể ở map KHÁC nhau. Mỗi snapshot kèm map của người gửi: khác map thì ẩn nhân vật kia (toạ độ map khác sẽ làm họ "đứng giữa không trung"),
    // cùng map thì hiện. (sync.js bỏ qua mọi lệnh/vị trí của đối phương khi khác map.)
    sess.on('msg', m => {
      if (m.k !== 's' || !m.mp || !isMap(m.mp) || !api.setRemoteVisible) return;
      api.setRemoteVisible(m.mp === mapId);
    });
    sess.on('version', v => toast(v.mismatch ? '⚠️ Hai máy đang chạy bản game khác nhau — bấm Ctrl+F5 (tải lại) để chơi đồng bộ' : 'Đối phương đang chạy bản game khác — nếu thấy lạ, bấm Ctrl+F5'));
    const chat = new Chat(sess), voice = new Voice(sess);
    const ui = mountMpUi({sess, chat, voice});
    try { const {mountCallRing} = await import('./ui/call-ring.js'); mountCallRing({voice, sess, toast, other}); } catch (e) { console.warn('call-ring', e); }
    try { const {mountChatNotify} = await import('./ui/chat-notify.js'); mountChatNotify({chat, openChat: ui.setOpen}); } catch (e) { console.warn('chat-notify', e); }
    chat.start().catch(e => console.warn('chat', e));
    window.VYNET = {sess, chat, voice, api};
    // tải nền byte của nhân vật kia (HTTP cache) để lúc họ vào không bị khựng
    setTimeout(() => { const f = FILES['char-' + other]; if (f) fetch(`assets/${f.file}?v=${f.v}`, {priority: 'low'}).then(r => r.arrayBuffer()).catch(() => {}); }, 4000);
    addEventListener('pagehide', () => { try { voice.leave('reload'); } catch (e) {} });
    voice.resume().catch(e => console.warn('call resume', e));
    addEventListener('pageshow', e => { if (e.persisted) voice.resume().catch(() => {}); });     // sau đổi map/F5: tự vào lại cuộc gọi nếu trước đó đang gọi
    $('mpLeave') && ($('mpLeave').onclick = async () => { await sess.leave(); location.reload(); });
  }
  // ---------- 5) tính năng cắm thêm (minigame…): lỗi 1 tính năng không ảnh hưởng game ----------
  try {
    const {createFeatureHost} = await import('./features/host.js'), {FEATURES} = await import('./features/registry.js');
    const {toast} = await import('./ui/mp-ui.js');
    const host = createFeatureHost({sess, api, slot, other: slot === 'bin' ? 'vy' : 'bin', mapId, toast});
    window.VYFEATURES = host;
    FEATURES.forEach(load => load().then(m => host.register(m.default)).catch(e => console.warn('[features] không nạp được', e)));
  } catch (e) { console.warn('[features]', e); }
  LB(100, 'Xong!'); setTimeout(reveal, 250);
}
boot().catch(fail);
