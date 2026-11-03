// Điểm khởi động: cấu hình → (multiplayer) giữ slot BIN/VY → nạp asset của map + nhân vật của mình → dựng game → gắn mạng/chat/voice.
import {CONFIG} from './config.js';
import * as Assets from './assets.js';
import {MAP_LIST, DEFAULT_MAP, isMap, goToMap, prefetchMap} from './maps.js';
import {FILES} from './manifest.js';
import {SFX} from './sfx.js';
import {MAP_CONFIGS} from './map-configs.js';
import {APP_NAME} from './version.js';
window.SFX = SFX; SFX.init();

const $ = id => document.getElementById(id);
let LB = (p, t) => { const b = $('lb'); if (b) b.style.width = Math.round(p) + '%'; const n = $('lpct'); if (n) n.textContent = Math.round(p) + '%'; if (t) $('lmsg').textContent = t; };
const fail = e => { console.error(e); $('lmsg').textContent = 'LỖI: ' + (e && e.message || e); $('lmsg').style.color = '#ff8080'; };
addEventListener('unhandledrejection', e => console.error('[unhandled]', e.reason));

// Trang vỏ (shell.js) giữ phiên/cuộc gọi/chat/nhạc; trang này (game) chạy trong iframe của vỏ. ?noshell = chạy gộp 1 trang như cũ (test).
const SH = (() => { try { return window.parent !== window && window.parent.VYSHELL || null; } catch (e) { return null; } })();
if (SH) {
  window.__vyShell = SH;
  window.__vyToast = m => { const t = $('toast'); if (!t) return; t.textContent = m; t.style.opacity = 1; clearTimeout(window.__vyToast._t); window.__vyToast._t = setTimeout(() => t.style.opacity = 0, 2200); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { try { SH.gesture(ev); } catch (e) {} }, true));
  addEventListener('pagehide', () => { try { SH.purge(window); } catch (e) {} });
}

async function boot() {
  let sess = null, slot, mapId, gate = null;
  if (SH && SH.first) { const l0 = LB; LB = (p, t) => { l0(p, t); try { SH.LB(p, t); } catch (e) {} }; }
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
  if (SH) {
    sess = SH.sess; slot = SH.slot;
    mapId = (location.hash.match(/map=(\w+)/) || [])[1] || SH.mapId; if (!isMap(mapId)) mapId = DEFAULT_MAP;
  } else {
    const {connectStep} = await import('./boot-session.js');
    const r = await connectStep({gate, hide, LB}); if (!r) return;
    ({sess, slot, mapId} = r);
  }
  window.MAPID = mapId; window.LOCAL_SLOT = slot;
  document.title = APP_NAME + ' — ' + MAP_LIST[mapId].name; if (SH) SH.setTitle(document.title);

  // ---------- 2) nạp song song: engine (JS) + asset map + nhân vật của mình ----------
  LB(10, 'Đang tải bản đồ & nhân vật ' + slot.toUpperCase() + '...');
  const enginePromise = import('./game.js');   // KHÔNG import sớm: hud.js/game.js đọc LOCAL_SLOT/MAPID lúc nạp module (file đã được modulepreload nên vẫn nhanh)
  const ids = [...MAP_LIST[mapId].assets, 'char-' + slot];
  const files = await Assets.loadGroup(ids, p => LB(10 + p * 60));
  const eng = await enginePromise;
  LB(75, 'Dựng cảnh...');
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const mapKey = 'map-' + mapId;
  eng.init({env: files[mapKey], ext: mapId !== 'exterior' ? files['map-exterior'] || null : null, localGlb: files['char-' + slot], localSlot: slot, mapId});
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
    const chat = SH ? SH.chat : new Chat(sess), voice = SH ? SH.voice : new Voice(sess);
    const ui = mountMpUi({sess, chat, voice});
    try { const {mountCallRing} = await import('./ui/call-ring.js'); mountCallRing({voice, sess, toast, other}); } catch (e) { console.warn('call-ring', e); }
    try { const {mountChatNotify} = await import('./ui/chat-notify.js'); mountChatNotify({chat, openChat: ui.setOpen}); } catch (e) { console.warn('chat-notify', e); }
    if (!SH) chat.start().catch(e => console.warn('chat', e));
    window.VYNET = {sess, chat, voice, api};
    // miệng nhân vật nhép theo tiếng nói trong cuộc gọi (máy mình: mic của mình; nhân vật kia: tiếng của họ)
    api.meTalk = () => !!(voice.active && voice.micOn && !voice.muted && voice.speaking);
    api.peerTalk = () => !!(voice.active && voice.peerVoice && voice.peerSpeaking);
    // tải nền byte của nhân vật kia (HTTP cache) để lúc họ vào không bị khựng
    setTimeout(() => { const f = FILES['char-' + other]; if (f) fetch(`assets/${f.file}?v=${f.v}`, {priority: 'low'}).then(r => r.arrayBuffer()).catch(() => {}); }, 4000);
    if (!SH) {     // có vỏ thì cuộc gọi sống ở vỏ — đổi map không đụng tới
      addEventListener('pagehide', () => { try { voice.leave('reload'); } catch (e) {} });
      voice.resume().catch(e => console.warn('call resume', e));
      addEventListener('pageshow', e => { if (e.persisted) voice.resume().catch(() => {}); });     // sau F5: tự vào lại cuộc gọi nếu trước đó đang gọi
    }
    $('mpLeave') && ($('mpLeave').onclick = async () => { await sess.leave(); (window.top || window).location.reload(); });

    // ---------- 4b) tiến trình người chơi (ví, XP, cấp, Hộp quà, thành tựu, phiên tập trung) — chỉ bản tài khoản ----------
    if (sess.account) {
      try {
        const {Progress} = await import('./net/progress.js');
        const prog = new Progress(sess.sb, sess); window.VYPROG = prog;
        await prog.refresh();
        const {mountProgressUi} = await import('./ui/progress-ui.js');
        const pui = mountProgressUi({prog, toast, sess}); window.__openProgress = pui.open;
        sess.on('msg', m => { if (m.k === 'eco') prog.refresh(); });
        sess.on('peer', ({present}) => { if (present) prog.refresh(); });
        $('sAcc') && ($('sAcc').textContent = (sess.user && sess.user.email) || '');
        const day = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
        // vào map => sự kiện (máy chủ tự áp giới hạn: về nhà lần đầu, dạo vườn 1 lần/ngày…)
        const mapEv = {house: 'enter_house', exterior: 'visit_garden', studio: 'enter_studio'}[mapId];
        if (mapEv) prog.report(mapEv, {map: mapId}, mapEv + ':' + day());
        // ngủ: game phát lệnh 'sleep' qua api.emit (cùng lệnh đồng bộ cho người kia)
        const emit0 = api.emit;
        api.emit = (t, a) => {
          if (t === 'sleep') prog.report('sleep', {}, 'sleep:' + Math.floor(Date.now() / 60000));
          if (t === 'sit') prog.report('sit', {}, 'sit:' + Math.floor(Date.now() / 120000));
          return emit0 ? emit0(t, a) : undefined;
        };
        // nhiệm vụ, túi đồ & kho nhà, hướng dẫn người mới (hạng mục 04 + 05)
        try { const {mountQuestsUi} = await import('./ui/quests-ui.js'); window.__vyQuests = mountQuestsUi({prog, toast, api, mapId}); }
        catch (e) { console.warn('[quests]', e); }
        // chat
        if (SH) chat.on('sent', () => prog.report('chat_sent', {}, 'chat:' + Date.now()));
        else { const send0 = chat.send.bind(chat); chat.send = async (...args) => { const r = await send0(...args); if (r && r.ok !== false) prog.report('chat_sent', {}, 'chat:' + Date.now()); return r; }; }
        // gọi cho nhau (mỗi cuộc gọi tính 1 lần; máy chủ giới hạn theo ngày)
        let inCall = false;
        voice.on && voice.on('state', st => { const on = !!(st && st.active && st.peerVoice && (st.phase === 'connected' || st.phase === 'weak')); if (on && !inCall) prog.report('call_together', {}, 'call:' + Math.floor(Date.now() / 1800000)); inCall = on; });
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
    // ---------- 4c) thông báo hệ thống (góc màn hình) khi đang ở tab khác ----------
    try { const {mountSysNotify} = await import('./ui/sysnotify.js'); mountSysNotify({chat, voice, sess, prog: window.VYPROG || null, other, openChat: ui.setOpen, toast}); }
    catch (e) { console.warn('[sysnotify]', e); }
  }
  // ---------- 4d) rạp chung (TV phòng khách): xem phim cùng nhau ----------
  try {
    if (api.hasTV && api.hasTV()) {
      const {mountCinema} = await import('./cinema/cinema.js');
      const {toast} = await import('./ui/mp-ui.js');
      const N = window.VYNET || {};
      api.cinema = mountCinema({api, sess, voice: N.voice || null, slot, other: slot === 'bin' ? 'vy' : 'bin', toast, music: SH ? {ytm: SH.ytm, Lofi: SH.Lofi} : null});
    }
  } catch (e) { console.warn('[cinema]', e); }
  // ---------- 5) tính năng cắm thêm (minigame…): lỗi 1 tính năng không ảnh hưởng game ----------
  try {
    const {createFeatureHost} = await import('./features/host.js'), {FEATURES} = await import('./features/registry.js');
    const {toast} = await import('./ui/mp-ui.js');
    const host = createFeatureHost({sess, api, slot, other: slot === 'bin' ? 'vy' : 'bin', mapId, toast});
    window.VYFEATURES = host;
    FEATURES.forEach(load => load().then(m => host.register(m.default)).catch(e => console.warn('[features] không nạp được', e)));
  } catch (e) { console.warn('[features]', e); }
  LB(100, 'Xong!');
  if (SH && SH.first) { $('load').style.display = 'none'; setTimeout(() => SH.reveal(), 60); } else setTimeout(reveal, 60);
  // tải nền sẵn map mà cửa/cổng của map này dẫn tới (HTTP cache) → lúc bấm chuyển map chỉ còn dựng cảnh, vào nhanh
  setTimeout(() => { const t = (MAP_CONFIGS[mapId] || {}).doorTo; if (t) prefetchMap(t); }, 1200);
}
if (!SH && window.parent === window && !CONFIG.noshell) import('./shell.js').then(m => m.bootShell()).catch(fail);
else boot().catch(e => { fail(e); try { SH && SH.fail(String(e && e.message || e)); } catch (x) {} });
