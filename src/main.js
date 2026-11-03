// Điểm khởi động: cấu hình → (multiplayer) giữ slot BIN/VY → nạp asset của map + nhân vật của mình → dựng game → gắn mạng/chat/voice.
import {CONFIG} from './config.js';
import * as Assets from './assets.js';
import {MAP_LIST, DEFAULT_MAP, isMap, goToMap, prefetchMap} from './maps.js';
import {FILES} from './manifest.js';
import {SFX} from './sfx.js';
import {MAP_CONFIGS} from './map-configs.js';
window.SFX = SFX; SFX.init();

const $ = id => document.getElementById(id);
const LB = (p, t) => { const b = $('lb'); if (b) b.style.width = Math.round(p) + '%'; const n = $('lpct'); if (n) n.textContent = Math.round(p) + '%'; if (t) $('lmsg').textContent = t; };
const fail = e => { console.error(e); $('lmsg').textContent = 'LỖI: ' + (e && e.message || e); $('lmsg').style.color = '#ff8080'; };
addEventListener('unhandledrejection', e => console.error('[unhandled]', e.reason));

async function boot() {
  let sess = null, slot, mapId, gate = null;
  // KHỞI ĐỘNG SỚM, SONG SONG với bước chọn nhân vật / kết nối phòng: đoán map + nhân vật (hash/localStorage) rồi tải & parse ngay GLB (engine JS đã được modulepreload trong index.html).
  // Đoán đúng (gần như luôn đúng ở lần vào sau) → tới bước 2 mọi thứ đã sẵn; đoán sai chỉ tốn một ít băng thông (asset có cache bền).
  {
    let gm = (location.hash.match(/map=(\w+)/) || [])[1] || localStorage.getItem('vyMap'); if (!isMap(gm)) gm = DEFAULT_MAP;
    const gc = (CONFIG.as === 'bin' || CONFIG.as === 'vy') ? CONFIG.as : (localStorage.getItem('vyChar') || '');
    const pre = [gm]; for (const id of pre) MAP_LIST[id].assets.forEach(a => Assets.load(a).catch(() => {}));
    if (gc === 'bin' || gc === 'vy') Assets.load('char-' + gc).catch(() => {});
  }
  const {mountGate} = await import('./ui/mp-ui.js');
  gate = mountGate();
  const hide = () => { $('load').classList.add('out'); setTimeout(() => $('load').style.display = 'none', 750); };   // dùng cho màn lỗi/cổng: mờ đi ngay
  // vào game: ảnh loading tối dần về đen (.5s) → đen mờ dần để lộ game (.6s)
  const reveal = () => { const l = $('load'); l.classList.add('black'); setTimeout(() => { l.classList.add('out'); setTimeout(() => l.style.display = 'none', 450); }, 280); };

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
      if (state === 'dup') { hide(); gate.show('🪟', 'Đang chơi ở thiết bị khác', 'Tài khoản này vừa được mở ở một tab hoặc thiết bị khác (laptop, điện thoại…). Bấm nút bên dưới để chơi tiếp ở đây.', [['Chơi ở đây', () => location.reload()]]); }
    });
    LB(5, 'Đang kết nối phòng "' + CONFIG.room + '"...');
    const fatal = e => {
      hide();
      if (e.code === 'full') gate.show('🚪', 'Phòng đã đủ 2 người', 'BIN và VY đều đã có người. Thử lại sau, hoặc vào phòng khác bằng ?room=ten-phong.', [['Thử lại', () => location.reload()]]);
      else gate.show('⚠️', 'Không kết nối được', String(e.message || e), [['Thử lại', () => location.reload()], ['Chơi một mình', () => { const u = new URL(location.href); u.searchParams.set('solo', '1'); location.href = u; }]]);
    };
    try { await sess.init(); } catch (e) { fatal(e); return; }
    // ---- tài khoản Google: chưa đăng nhập => màn đăng nhập (trang sẽ chuyển sang Google rồi quay lại) ----
    if (sess.needLogin) {
      const {loginScreen} = await import('./ui/login.js');
      const q = new URLSearchParams(location.hash.slice(1) + '&' + location.search.slice(1));
      const oerr = q.get('error_description') || q.get('error') || '';
      if (oerr) history.replaceState(null, '', location.pathname + location.search.replace(/([?&])(error|error_code|error_description)=[^&]*/g, '$1').replace(/[?&]+$/, ''));
      loginScreen({onGoogle: () => sess.signInGoogle(), note: oerr ? 'Đăng nhập chưa thành công: ' + oerr.replace(/\+/g, ' ') : ''});
      return;
    }
    // ---- mỗi tài khoản gắn cố định 1 nhân vật: đã có => vào thẳng; chưa có => chọn 1 lần ----
    if (sess.account) {
      const email = (sess.user && sess.user.email) || 'tài khoản này';
      for (;;) {
        const {data: roster, error} = await sess.sb.rpc('game_roster');
        if (error) { fatal(new Error('Không đọc được nhân vật: ' + (error.message || error))); return; }
        if (roster && roster.me) { pref = roster.me; break; }
        const owned = (roster && roster.owned) || [];
        if (owned.length >= 2) {
          hide(); gate.show('🚪', 'Bin và Vy đều đã có chủ', email + ' chưa gắn với nhân vật nào. Đăng xuất rồi đăng nhập bằng Gmail bạn đã dùng để chơi.', [['Đăng xuất', async () => { await sess.signOut(); location.reload(); }]]);
          return;
        }
        const pick = await pickChar({taken: owned, note, takenText: 'Đã có chủ', hint: 'Đã đăng nhập ' + email + '. Chọn nhân vật của bạn — chỉ chọn một lần, sau này mọi thiết bị đăng nhập bằng tài khoản này đều vào đúng nhân vật.'});
        note = '';
        const r = await sess.sb.rpc('game_create_player', {p_slot: pick});
        if (r.error) { note = /slot_owned/.test(r.error.message || '') ? 'Nhân vật đó vừa được chọn bởi tài khoản khác — hãy chọn nhân vật còn lại.' : 'Chưa tạo được nhân vật: ' + r.error.message; continue; }
        pref = pick; break;
      }
      saveChar(pref);
    }
    for (;;) {
      if (!pref) {
        const taken = await sess.peek();
        if (taken.length >= 2) { fatal(Object.assign(new Error('full'), {code: 'full'})); return; }
        pref = await pickChar({taken, note}); note = '';
        if (!forced) saveChar(pref);
      }
      try { const r = await sess.connect(pref); slot = r.slot; mapId = (location.hash.match(/map=(\w+)/) || [])[1] || localStorage.getItem('vyMap'); if (!isMap(mapId)) mapId = r.map; break; }   // map là của RIÊNG từng người
      catch (e) {
        if (e.code === 'taken' && sess.account) { fatal(new Error((pref === 'bin' ? 'Bin' : 'Vy') + ' đang được một phiên khác giữ chỗ. Thử lại sau ít phút.')); return; }
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
  const enginePromise = import('./game.js');   // KHÔNG import sớm: hud.js/game.js đọc LOCAL_SLOT/MAPID lúc nạp module (file đã được modulepreload nên vẫn nhanh)
  const ids = [...MAP_LIST[mapId].assets, 'char-' + slot];
  const files = await Assets.loadGroup(ids, p => LB(10 + p * 60));
  const eng = await enginePromise;
  LB(75, 'Dựng cảnh...');
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const mapKey = 'map-' + mapId;
  eng.init({env: files[mapKey], tree: files['tree'] || null, localGlb: files['char-' + slot], localSlot: slot, mapId});
  const api = eng.api;
  LB(88, 'Biên dịch shader...');
  let warmed = false; try { warmed = localStorage.getItem('vyWarm') === mapId; } catch (e) {}   // lần sau: trình duyệt đã cache shader → chờ ngắn hơn
  try { await Promise.race([api.warm(), new Promise(r => setTimeout(r, warmed ? 900 : 2200))]); } catch (e) { console.warn('warm', e); }
  try { localStorage.setItem('vyWarm', mapId); } catch (e) {}
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
    let peerMap = null;
    sess.on('msg', m => { if (m.k === 's' && m.mp) peerMap = m.mp; });
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

    // ---------- 4b) tiến trình người chơi (ví, XP, cấp, Hộp quà, thành tựu, phiên tập trung) — chỉ bản tài khoản ----------
    if (sess.account) {
      try {
        const {Progress} = await import('./net/progress.js');
        const prog = new Progress(sess.sb, sess); window.VYPROG = prog;
        await prog.refresh();
        const {mountProgressUi} = await import('./ui/progress-ui.js');
        mountProgressUi({prog, toast, sess});
        sess.on('msg', m => { if (m.k === 'eco') prog.refresh(); });
        sess.on('peer', ({present}) => { if (present) prog.refresh(); });
        $('sAcc') && ($('sAcc').textContent = (sess.user && sess.user.email) || '');
        const day = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
        // vào map => sự kiện (máy chủ tự áp giới hạn: về nhà lần đầu, dạo vườn 1 lần/ngày…)
        const mapEv = {house: 'enter_house', exterior: 'visit_garden', studio: 'enter_studio'}[mapId];
        if (mapEv) prog.report(mapEv, {map: mapId}, mapEv + ':' + day());
        // ngủ: game phát lệnh 'sleep' qua api.emit (cùng lệnh đồng bộ cho người kia)
        const emit0 = api.emit;
        api.emit = (t, a) => { if (t === 'sleep') prog.report('sleep', {}, 'sleep:' + Math.floor(Date.now() / 60000)); return emit0 ? emit0(t, a) : undefined; };
        // chat
        const send0 = chat.send.bind(chat);
        chat.send = async (...args) => { const r = await send0(...args); if (r && r.ok !== false) prog.report('chat_sent', {}, 'chat:' + Date.now()); return r; };
        // gọi cho nhau (mỗi cuộc gọi tính 1 lần; máy chủ giới hạn theo ngày)
        let inCall = false;
        voice.on && voice.on('state', st => { const on = st === 'connected' || st === 'weak'; if (on && !inCall) prog.report('call_together', {}, 'call:' + Math.floor(Date.now() / 1800000)); inCall = on; });
        // ở cạnh nhau: cùng online + cùng map, cộng dồn mỗi 10 phút
        let together = 0;
        setInterval(() => { if (document.hidden || !sess.peer || peerMap !== mapId) return; if (++together % 10 === 0) prog.report('together_10min', {map: mapId}, 'tg:' + Math.floor(Date.now() / 600000)); }, 60000);
        // "Việc hôm nay" đồng bộ giữa các máy
        const T = window.__vyTasks;
        if (T && prog.me) {
          const srv = prog.me.player.tasks || [], loc = T.get();
          if (srv.length) T.set(srv); else if (loc.length) prog.save({tasks: loc}).catch(e => console.warn('tasks', e));
          let tm = null; T.onChange = list => { clearTimeout(tm); tm = setTimeout(() => prog.save({tasks: list}).catch(e => console.warn('tasks', e)), 800); };
        }
      } catch (e) { console.warn('[progress]', e); }
    }
  }
  // ---------- 5) tính năng cắm thêm (minigame…): lỗi 1 tính năng không ảnh hưởng game ----------
  try {
    const {createFeatureHost} = await import('./features/host.js'), {FEATURES} = await import('./features/registry.js');
    const {toast} = await import('./ui/mp-ui.js');
    const host = createFeatureHost({sess, api, slot, other: slot === 'bin' ? 'vy' : 'bin', mapId, toast});
    window.VYFEATURES = host;
    FEATURES.forEach(load => load().then(m => host.register(m.default)).catch(e => console.warn('[features] không nạp được', e)));
  } catch (e) { console.warn('[features]', e); }
  LB(100, 'Xong!'); setTimeout(reveal, 60);
  // tải nền sẵn map mà cửa/cổng của map này dẫn tới (HTTP cache) → lúc bấm chuyển map chỉ còn dựng cảnh, vào nhanh
  setTimeout(() => { const t = (MAP_CONFIGS[mapId] || {}).doorTo; if (t) prefetchMap(t); }, 1200);
}
boot().catch(fail);
