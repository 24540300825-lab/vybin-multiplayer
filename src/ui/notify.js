// Trung tâm thông báo (nút chuông). Có 2 nguồn:
//  • sự kiện trong phiên: tin nhắn mới, cuộc gọi nhỡ/từ chối, bạn vào/ra phòng  → Notify.add({...})
//  • thông báo "cập nhật game" (src/announcements.js) kiểu bảng tin của game
// Chỉ thao tác DOM; không đụng vào mạng hay vòng render 3D.
import {ic, paintIcons} from './icons.js';
import {NEWS} from '../announcements.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const KEY = 'vyNewsRead', MAX = 40;
const TYPE = {chat: ['chat', 't-chat'], call: ['phoneMissed', 't-call'], peer: ['person', 't-peer'], news: ['stars', 't-news']};

let events = [], seq = 0, open = false, onOpen = null, readNews = new Set();
try { readNews = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) {}
const saveNews = () => { try { localStorage.setItem(KEY, JSON.stringify([...readNews])); } catch (e) {} };
const hhmm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const unreadCount = () => events.filter(e => !e.read).length + NEWS.filter(n => !readNews.has(n.id)).length;

function paintDot() { const d = $('nDot'); if (!d) return; const n = unreadCount(); d.hidden = !n; $('iNote') && ($('iNote').title = n ? `Thông báo (${n} mới)` : 'Thông báo'); }

function render() {
  const el = $('hNote'); if (!el) return;
  const evs = events.slice().reverse().map(e => `<div class="ni${e.read ? '' : ' unread'}"${e.go ? ' data-go="' + e.id + '"' : ''}><span class="ico ${TYPE[e.type][1]}">${ic(TYPE[e.type][0])}</span><div class="nb"><div class="nt">${esc(e.title)}</div>${e.body ? `<div class="nd">${esc(e.body)}</div>` : ''}<div class="nm2">${hhmm(e.t)}</div></div></div>`).join('');
  const news = NEWS.map(n => `<div class="ni${readNews.has(n.id) ? '' : ' unread'}"><span class="ico t-news">${ic('stars')}</span><div class="nb"><div class="nt">${esc(n.title)}</div><div class="nd"><ul>${n.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div><div class="nm2">${esc(n.date)}</div></div></div>`).join('');
  el.innerHTML = `<div class="ph" id="hNoteHd"><h3>Thông báo</h3><span class="sp"></span><button class="rb" id="nRead" title="Đánh dấu đã đọc" aria-label="Đánh dấu đã đọc" data-ic="check"></button><button class="rb" id="nClr" title="Xoá hoạt động" aria-label="Xoá hoạt động" data-ic="trash"></button><button class="rb" id="nX" title="Đóng" aria-label="Đóng" data-ic="x"></button></div>
    <div class="ns" id="nSlot"></div><div class="nlist"><div class="nsec">Hoạt động</div>${evs || '<div class="nempty">Chưa có hoạt động nào.</div>'}<div class="nsec">Cập nhật game</div>${news}</div>`;
  paintIcons(el);
  $('nRead').onclick = markRead; $('nClr').onclick = () => { events = []; markRead(); };
  $('nX').onclick = () => setOpen(false);
  el.querySelectorAll('[data-go]').forEach(n => n.onclick = () => { const e = events.find(x => String(x.id) === n.dataset.go); if (e && e.go) { setOpen(false); e.go(); } });
  window.dispatchEvent(new Event('vy-notify-render'));
}
function markRead() { events.forEach(e => e.read = true); NEWS.forEach(n => readNews.add(n.id)); saveNews(); paintDot(); if (open) render(); }
function setOpen(v) {
  v = !!v; if (v === open) return; open = v;
  const el = $('hNote'); el.classList.toggle('on', v); $('iNote').classList.toggle('on', v);
  if (v) { render(); onOpen && onOpen(); }
  else { markRead(); }     // đóng bảng = coi như đã xem
}

export const Notify = {
  init({onOpen: cb} = {}) {
    onOpen = cb || null;
    const b = $('iNote'); if (!b || b._ok) return; b._ok = true;
    b.onclick = () => setOpen(!open);
    addEventListener('keydown', e => { if (e.code === 'Escape' && open) setOpen(false); });
    paintDot();
  },
  add({type = 'peer', title, body = '', go = null}) {
    events.push({id: ++seq, type, title, body, go, t: Date.now(), read: open}); if (events.length > MAX) events.shift();
    if (open) render(); paintDot();
  },
  close() { setOpen(false); },
  get isOpen() { return open; },
};
