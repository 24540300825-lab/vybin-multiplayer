// Popup báo tin nhắn kiểu Messenger + tiếng "ting" (dùng bộ SFX Web Audio, không cần file) + ghi vào trung tâm thông báo (chuông).
// Chỉ nghe sự kiện của Chat — không đổi dữ liệu chat. Giao diện: ui.css (.cpop, #chPops).
import {NAME} from '../net/session.js';
import {SFX} from '../sfx.js';
import {Notify} from './notify.js';

const $ = id => document.getElementById(id);
const MAX_POP = 3, LIFE = 4000, CUT = 90, KEY = 'vyChatSound';
const ting = () => SFX.play('msgIn');

export function mountChatNotify({chat, openChat}) {
  const box = document.createElement('div'); box.id = 'chPops'; box.setAttribute('aria-live', 'polite');
  ($('hBR') || document.body).prepend(box);

  // ---- nút bật/tắt âm báo tin nhắn: nằm trong bảng thông báo (chuông), vẽ lại mỗi lần bảng được dựng
  let sound = true; try { sound = localStorage.getItem(KEY) !== '0'; } catch (e) {}
  const paint = () => {
    const slot = $('nSlot'); if (!slot) return;
    slot.innerHTML = '<button class="pl" id="iChSnd"></button>';
    const sb = $('iChSnd'); sb.classList.toggle('on', sound); sb.textContent = sound ? 'Âm tin nhắn: Bật' : 'Âm tin nhắn: Tắt';
    sb.title = sound ? 'Tắt tiếng báo tin nhắn' : 'Bật tiếng báo tin nhắn';
    sb.onclick = () => { sound = !sound; try { localStorage.setItem(KEY, sound ? '1' : '0'); } catch (e) {} paint(); if (sound) setTimeout(ting, 30); };
  };
  addEventListener('vy-notify-render', paint); paint();

  // ---- popup
  function close(el) { if (!el || el._gone) return; el._gone = true; clearTimeout(el._t); el.classList.add('out'); setTimeout(() => el.remove(), 260); }
  const clearAll = () => [...box.children].forEach(close);
  function pop(m) {
    const name = NAME[m.slot] || m.slot || '?';
    let body = String(m.body || '').replace(/\s+/g, ' ').trim(); if (body.length > CUT) body = body.slice(0, CUT - 1).trimEnd() + '…';
    const el = document.createElement('div'); el.className = 'cpop hud panel';
    el.innerHTML = '<div class="av"><img alt=""></div><div class="tx"><div class="nm"></div><div class="bd"></div></div><button class="x" title="Đóng" aria-label="Đóng"></button>';
    el.querySelector('img').src = 'assets/ui/avatars/' + (m.slot === 'bin' ? 'bin' : 'vy') + '.v1.png';
    el.querySelector('.nm').textContent = name; el.querySelector('.bd').textContent = body;
    const x = el.querySelector('.x'); x.innerHTML = '&#10005;'; x.onclick = e => { e.stopPropagation(); close(el); };
    el.onclick = () => { clearAll(); openChat && openChat(true); };
    box.appendChild(el);
    const live = [...box.children].filter(c => !c._gone);
    live.slice(0, Math.max(0, live.length - MAX_POP)).forEach(close);   // tối đa 3 popup, bỏ cái cũ nhất
    el._t = setTimeout(() => close(el), LIFE);
  }

  chat.on('msg', ({m, mine, silent}) => {
    if (mine && m.pending && !silent) SFX.play('msgOut');
    if (mine || silent || m.pending) return;                                   // tin của mình / tin cũ tải lại → bỏ qua
    if (chat.open && document.visibilityState === 'visible') return;           // đang nhìn khung chat → không cần báo
    if (!chat.open) pop(m);
    let b = String(m.body || '').replace(/\s+/g, ' ').trim(); if (b.length > CUT) b = b.slice(0, CUT - 1).trimEnd() + '…';
    Notify.add({type: 'chat', title: (NAME[m.slot] || m.slot || '?') + ' nhắn tin', body: b, go: () => openChat && openChat(true)});
    if (sound) ting();
  });
  chat.on('unread', n => { if (!n) clearAll(); });                             // vừa mở khung chat → dọn popup
}
