// ===== TRANG VỎ (shell) =====
// Trang ngoài cùng chạy MỘT LẦN và KHÔNG BAO GIỜ tải lại khi đổi map. Nó giữ những thứ phải liên tục:
//   • phiên multiplayer (Session: kênh realtime + presence) → đối phương không thấy mình "rời phòng" mỗi lần đổi map
//   • cuộc gọi (Voice: WebRTC + thẻ <audio> phát tiếng) → gọi không đứt
//   • chat (Chat: kênh + lịch sử)
//   • nhạc (YouTube player + Lofi WebAudio) → nhạc chạy liền, không cần bấm lại
// Game 3D chạy trong <iframe> cùng nguồn (index.html?g=1#map=…). Đổi map = chỉ nạp lại iframe (engine dựng lại sạch sẽ như cũ).
// Iframe dùng thẳng các đối tượng trên (cùng origin → chia sẻ được object JS). Khi iframe cũ bị gỡ, mọi callback nó đã đăng ký
// vào các đối tượng chung được dọn (purge) để không gọi vào trang đã chết.
import {CONFIG} from './config.js';
import {MAP_LIST, isMap} from './maps.js';
import {FILES} from './manifest.js';
import {connectStep} from './boot-session.js';
import {APP_NAME} from './version.js';

const $ = id => document.getElementById(id);
const LB = (p, t) => { const b = $('lb'); if (b) b.style.width = Math.round(p) + '%'; const n = $('lpct'); if (n) n.textContent = Math.round(p) + '%'; if (t) $('lmsg').textContent = t; };
const GESTURES = ['pointerdown', 'keydown', 'touchstart'];

export async function bootShell() {
  document.documentElement.classList.add('shell');
  // tải sẵn BYTE (HTTP cache) của map + nhân vật đoán trước — iframe sẽ parse; vỏ không parse để khỏi tốn CPU 2 lần
  {
    let gm = (location.hash.match(/map=(\w+)/) || [])[1] || localStorage.getItem('vyMap'); if (!isMap(gm)) gm = 'living';
    const gc = (CONFIG.as === 'bin' || CONFIG.as === 'vy') ? CONFIG.as : (localStorage.getItem('vyChar') || '');
    const ids = [...MAP_LIST[gm].assets, ...(gc ? ['char-' + gc] : [])];
    ids.forEach(a => { const f = FILES[a]; if (f) fetch(`assets/${f.file}?v=${f.v}`).then(r => r.arrayBuffer()).catch(() => {}); });
  }
  const {mountGate, toast: ownToast} = await import('./ui/mp-ui.js');
  const gate = mountGate();
  const hide = () => { $('load').classList.add('out'); setTimeout(() => $('load').style.display = 'none', 750); };
  const r = await connectStep({gate, hide, LB});
  if (!r) return;
  const {sess, slot} = r; let mapId = r.mapId;

  const SH = window.VYSHELL = {sess, slot, mapId, chat: null, voice: null, ytm: null, Lofi: null, first: true, vol: 0.5, frame: null};
  // toast: hiện trong trang game đang chạy (cùng chỗ với toast của game), chưa có game thì hiện ở vỏ
  SH.toast = m => { try { const w = SH.frame && SH.frame.contentWindow; if (w && w.__vyToast) return w.__vyToast(m); } catch (e) {} ownToast(m); };
  SH.LB = LB;
  // PHÒNG VY — Workroom: cửa vào ở bàn phòng Vy; quyền thật do máy chủ xác nhận (wr_is_owner — giai đoạn thử: Vy + Bin). Mã + CSS chỉ tải khi mở.
  {
    let acc = null;
    SH.workroom = {
      access: () => (acc ||= import('./workroom/store.js').then(m => m.checkAccess(SH)).catch(() => false)),
      open: async opt => (await import('./workroom/index.js')).openWorkroom(SH, opt),
      preload: async () => (await import('./workroom/index.js')).prepareWorkroom(SH),
    };
  }

  // ---------- dịch vụ liên tục ----------
  if (sess) {
    const {Chat} = await import('./net/chat.js');
    const {Voice} = await import('./net/voice.js');
    const chat = SH.chat = new Chat(sess), voice = SH.voice = new Voice(sess);
    const send0 = chat.send.bind(chat);
    chat.send = async (...a) => { const res = await send0(...a); if (res && res.ok !== false) chat.emit('sent', res); return res; };
    chat.start().catch(e => console.warn('chat', e));
    addEventListener('pagehide', () => { try { voice.leave('reload'); } catch (e) {} });     // F5 / đóng tab thật sự
    voice.resume().catch(e => console.warn('call resume', e));
    addEventListener('pageshow', e => { if (e.persisted) voice.resume().catch(() => {}); });
  }
  {
    const {createYTMusic} = await import('./music-yt.js');
    const {Lofi} = await import('./lofi.js');
    SH.Lofi = Lofi;
    const dock = document.createElement('div'); dock.id = 'ytDock'; document.body.appendChild(dock);
    SH.ytm = createYTMusic({toast: m => SH.toast(m), auth: async () => sess ? {token: await sess.token(), room: sess.room} : null});
    SH.ytm.mount(dock);
    let vol = 0.5; try { const v = parseFloat(localStorage.getItem('vyVol')); if (v >= 0 && v <= 1) vol = v; } catch (e) {}
    SH.vol = vol; Lofi.vol(vol); SH.ytm.vol(vol);
    SH.setVol = v => { SH.vol = v; Lofi.vol(v); SH.ytm.vol(v); try { localStorage.setItem('vyVol', String(v)); } catch (e) {} };
    // F5: nghe tiếp đúng bài, đúng chỗ (YouTube) / bật lại Lofi ở cú bấm đầu tiên (trình duyệt chặn tự phát tiếng khi chưa bấm gì)
    let src = 'lofi'; try { src = JSON.parse(localStorage.getItem('vyMusicSrc') || '"lofi"') === 'yt' ? 'yt' : 'lofi'; } catch (e) {}
    if (src === 'yt') SH.ytm.restore().catch(() => {});
    else {
      let L = null; try { L = JSON.parse(localStorage.getItem('vyLofi') || 'null'); } catch (e) {}
      if (L && L.idx >= 0 && L.idx < Lofi.tracks.length) {
        Lofi.setTrack(L.idx);
        if (L.on) {
          const go = async () => { GESTURES.forEach(ev => removeEventListener(ev, go, true)); if (!Lofi.on) { await Lofi.toggle(); SH.ytm.emit && SH.ytm.emit('change'); } };
          GESTURES.forEach(ev => addEventListener(ev, go, true));
        }
      }
    }
  }
  // cú bấm/nhấn phím trong iframe không nổi lên trang vỏ → iframe chuyển tiếp để các bộ "chờ cú bấm đầu" (nhạc, tiếng cuộc gọi) chạy.
  // Kích hoạt người dùng (user activation) của iframe cũng lan lên trang cha nên play() gọi ở đây vẫn được phép.
  SH.gesture = type => {
    try { window.dispatchEvent(new Event(type)); } catch (e) {}
    const a = SH.voice && SH.voice.audioEl; if (a && a.srcObject && a.paused) a.play().catch(() => {});
  };
  // dọn mọi callback mà trang game cũ đã gắn vào đối tượng dùng chung
  SH.purge = win => {
    let F; try { F = win.Function; } catch (e) { return; }
    const old = f => { try { return f instanceof F; } catch (e) { return false; } };
    for (const o of [SH.sess, SH.chat, SH.voice, SH.ytm]) {
      if (!o || !o.h) continue;
      for (const k of Object.keys(o.h)) if (Array.isArray(o.h[k])) o.h[k] = o.h[k].filter(f => !old(f));
    }
    if (SH.ytm && SH.ytm.undock) SH.ytm.undock(win);
  };
  // chuyển tin từ service worker (bấm vào thông báo hệ thống) vào trang game
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
    try { const w = SH.frame.contentWindow; if (w && w.navigator.serviceWorker) w.navigator.serviceWorker.dispatchEvent(new w.MessageEvent('message', {data: e.data})); } catch (err) {}
  });

  // ---------- dựng iframe game ----------
  // gỡ HUD tĩnh của index.html ở trang vỏ (chỉ trang game cần) — giữ màn loading, cổng trạng thái, toast
  const KEEP = new Set(['load', 'mpGate', 'toast', 'ytDock']);
  [...document.body.children].forEach(el => { if (el.tagName !== 'SCRIPT' && !KEEP.has(el.id)) el.remove(); });
  // map nằm cả trong query (m=) chứ không chỉ trong #hash: chỉ đổi #hash thì trình duyệt KHÔNG tải lại trang → kẹt màn đen khi đổi map
  const url = id => location.pathname + (location.search ? location.search + '&' : '?') + 'g=1&m=' + id + '#map=' + id;
  const f = SH.frame = document.createElement('iframe');
  f.id = 'gameFrame'; f.title = APP_NAME;
  f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; camera; microphone; display-capture; clipboard-read; clipboard-write; encrypted-media; screen-wake-lock');
  f.setAttribute('allowfullscreen', '');
  f.src = url(mapId);
  document.body.prepend(f);
  f.addEventListener('load', () => { try { f.focus(); f.contentWindow.focus(); } catch (e) {} });
  SH.setTitle = t => { document.title = t; };
  SH.go = id => {
    if (!isMap(id)) return;
    mapId = SH.mapId = id; SH.first = false;
    try { localStorage.setItem('vyMap', id); } catch (e) {}
    history.replaceState(null, '', location.pathname + location.search + '#map=' + id);
    try { f.contentWindow.location.replace(url(id)); } catch (e) { f.src = url(id); }
  };
  // màn loading của vỏ che tới khi game trong iframe hiện ra lần đầu (iframe tự báo tiến độ qua SH.LB)
  SH.reveal = () => {
    const l = $('load'); if (!l || l.style.display === 'none') return;
    l.classList.add('black'); setTimeout(() => { l.classList.add('out'); setTimeout(() => l.style.display = 'none', 450); }, 280);
  };
  SH.fail = msg => { const m = $('lmsg'); if (m) { m.textContent = 'LỖI: ' + msg; m.style.color = '#ff8080'; } };
}
