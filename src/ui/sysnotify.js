// THÔNG BÁO HỆ THỐNG (nổi ở góc màn hình như Zalo / Messenger) khi bạn đang ở tab khác, thu nhỏ trình duyệt hoặc dùng app khác.
// Báo: tin nhắn mới, cuộc gọi đến (kèm nút Nghe), cuộc gọi nhỡ, người kia vào nhà, xong phiên tập trung, lên cấp / thành tựu.
// Đang nhìn vào game thì KHÔNG bật thông báo hệ thống (đã có popup trong game).
// Bật/tắt: Cài đặt → Thông báo trên máy (lưu trên từng máy, khoá 'vySysNoti'). iPhone/iPad: chỉ chạy khi đã "Thêm vào Màn hình chính".
import {NAME} from '../net/session.js';

const $ = id => document.getElementById(id);
const KEY = 'vySysNoti', ASKED = 'vySysNotiAsked';
const supported = () => 'Notification' in window && 'serviceWorker' in navigator && window.isSecureContext;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const AV = s => 'assets/ui/avatars/' + (s === 'bin' ? 'bin' : 'vy') + '.v1.png';
const cut = (s, n = 120) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

let reg = null;
async function ensureReg() {
  if (reg || !('serviceWorker' in navigator)) return reg;
  try { reg = await navigator.serviceWorker.register('sw.js', {scope: './'}); await navigator.serviceWorker.ready; }
  catch (e) { console.warn('[sysnotify] sw', e); reg = null; }
  return reg;
}
const wantOn = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };
const setWant = v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} };
export const sysNotifyState = () => !supported() ? (isIOS() && !standalone() ? 'ios-browser' : 'unsupported')
  : Notification.permission === 'denied' ? 'denied' : Notification.permission === 'granted' ? (wantOn() ? 'on' : 'off') : 'ask';

// hiện thông báo (chỉ khi người chơi KHÔNG đang nhìn game)
async function show(title, {body = '', tag = 'vy', icon = 'assets/ui/icon-192.png', action = '', sticky = false, force = false, actions = null} = {}) {
  if (!supported() || Notification.permission !== 'granted' || !wantOn()) return;
  if (!force && document.visibilityState === 'visible' && document.hasFocus()) return;
  const opts = {body, tag, icon, badge: 'assets/ui/badge-96.png', renotify: true, requireInteraction: sticky, silent: false, data: {action, url: location.href}};
  if (actions) opts.actions = actions;
  try { const r = await ensureReg(); if (r) { await r.showNotification(title, opts); return; } } catch (e) { console.warn('[sysnotify] show', e); }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); handle(action); }; } catch (e) {}
}
async function closeTag(tag) { try { const r = await ensureReg(); if (!r) return; (await r.getNotifications({tag})).forEach(n => n.close()); } catch (e) {} }

let handlers = {};
function handle(action) { const f = handlers[action]; if (f) try { f(); } catch (e) { console.warn(e); } }

export function mountSysNotify({chat, voice, sess, prog, other, openChat, toast}) {
  handlers = {chat: () => openChat && openChat(true), answer: () => voice && voice.join({mic: true}), decline: () => voice && voice.decline(), gifts: () => window.__openProgress && window.__openProgress('inbox')};
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.vyNotify) handle(e.data.action); });
  if (supported() && Notification.permission === 'granted') ensureReg();
  const nm = NAME[other] || other;

  // ---- sự kiện → thông báo ----
  chat && chat.on('msg', ({m, mine, silent}) => { if (!mine && !silent && m) show(NAME[m.slot] || nm, {body: cut(m.body), tag: 'chat', icon: AV(m.slot), action: 'chat'}); });
  let ringing = false;
  voice && voice.on('state', s => {
    if (s.incoming && !ringing) { ringing = true; show('📞 ' + nm + ' đang gọi cho bạn', {body: 'Bấm để mở game và nghe máy', tag: 'call', icon: AV(other), sticky: true, actions: [{action: 'answer', title: 'Nghe'}, {action: 'decline', title: 'Từ chối'}]}); }
    else if (!s.incoming && ringing) { ringing = false; closeTag('call'); }
  });
  voice && voice.on('peerEnded', info => { if (info && info.missed) show('Cuộc gọi nhỡ từ ' + nm, {tag: 'missed', icon: AV(other)}); });
  sess && sess.on('peer', ({present, slot}) => { if (present) show((NAME[slot] || nm) + ' đã vào nhà', {body: 'Vào chơi cùng nhau nhé!', tag: 'peer', icon: AV(slot || other)}); });
  prog && prog.on('reward', r => {
    if (r.label === 'Xong phiên tập trung!') show('Xong phiên tập trung!', {body: 'Phần thưởng đã được cộng. Nghỉ chút rồi làm tiếp nhé.', tag: 'focus'});
    (r.achievements || []).forEach(a => show('Thành tựu mới: ' + a.name, {body: 'Quà đang chờ trong Hộp quà', tag: 'ach-' + a.id, action: 'gifts'}));
  });

  // ---- Cài đặt → Thông báo trên máy ----
  const sec = $('sNoti');
  const paint = () => {
    if (!sec) return;
    const st = sysNotifyState();
    const txt = {on: 'Đang bật — có tin nhắn, cuộc gọi… khi bạn ở tab khác sẽ hiện thông báo ở góc màn hình.', off: 'Đang tắt trên máy này.',
      ask: 'Chưa bật. Bấm "Bật" rồi chọn Cho phép (Allow) khi trình duyệt hỏi.', denied: 'Trình duyệt đang CHẶN thông báo của trang này. Bấm biểu tượng ổ khoá cạnh địa chỉ web → Thông báo → Cho phép, rồi tải lại trang.',
      'ios-browser': 'Trên iPhone/iPad: bấm nút Chia sẻ → "Thêm vào MH chính", rồi mở game từ biểu tượng ngoài màn hình chính để bật thông báo.', unsupported: 'Trình duyệt này không hỗ trợ thông báo hệ thống.'}[st];
    sec.querySelector('#nfTx').textContent = txt;
    const b = sec.querySelector('#nfBtn'); b.hidden = !(st === 'on' || st === 'off' || st === 'ask');
    b.textContent = st === 'on' ? 'Tắt' : 'Bật'; b.classList.toggle('on', st === 'on');
    sec.querySelector('#nfTest').hidden = st !== 'on';
  };
  const enable = async () => {
    if (!supported()) { paint(); return false; }
    let p = Notification.permission;
    if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) {} }
    try { localStorage.setItem(ASKED, '1'); } catch (e) {}
    if (p === 'granted') { setWant(true); await ensureReg(); toast && toast('Đã bật thông báo trên máy'); }
    paint(); return p === 'granted';
  };
  if (sec) {
    sec.querySelector('#nfBtn').onclick = async () => { const st = sysNotifyState(); if (st === 'on') { setWant(false); paint(); } else await enable(); };
    sec.querySelector('#nfTest').onclick = () => show('Thử thông báo', {body: 'Thông báo của VY · BIN sẽ trông như thế này.', tag: 'test', force: true});
    paint();
  }

  // ---- mời bật một lần (sau khi vào game ~15 giây, không làm phiền nếu đã trả lời) ----
  let asked = false; try { asked = localStorage.getItem(ASKED) === '1'; } catch (e) {}
  const st0 = sysNotifyState();
  if (!asked && (st0 === 'ask' || st0 === 'ios-browser')) setTimeout(() => {
    const bar = document.createElement('div'); bar.id = 'nfAsk'; bar.className = 'hud panel';
    bar.innerHTML = st0 === 'ask'
      ? `<b>Bật thông báo trên máy?</b><span>Biết ngay khi ${nm} nhắn tin hay gọi, kể cả khi bạn đang ở tab khác.</span><div><button class="pb" id="nfY">Bật</button><button class="pl" id="nfN">Để sau</button></div>`
      : `<b>Muốn nhận thông báo trên iPhone?</b><span>Bấm nút Chia sẻ → "Thêm vào MH chính", rồi mở game từ biểu tượng đó.</span><div><button class="pl" id="nfN">Đã hiểu</button></div>`;
    document.body.appendChild(bar);
    const done = () => { try { localStorage.setItem(ASKED, '1'); } catch (e) {} bar.remove(); };
    bar.querySelector('#nfN').onclick = done;
    const y = bar.querySelector('#nfY'); if (y) y.onclick = async () => { await enable(); done(); };
  }, 15000);
  return {show, enable, state: sysNotifyState};
}
