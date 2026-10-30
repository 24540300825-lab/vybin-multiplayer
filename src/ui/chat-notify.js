// Popup báo tin nhắn kiểu Messenger + tiếng "ting" (Web Audio, không cần file). Chỉ nghe sự kiện của Chat — không đổi dữ liệu chat.
import {NAME} from '../net/session.js';

const $ = id => document.getElementById(id);
const MAX_POP = 3, LIFE = 4000, CUT = 90, KEY = 'vyChatSound';

const CSS = `
#chPops{position:fixed;right:14px;bottom:86px;z-index:11;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none}
.cpop{pointer-events:auto;display:flex;gap:10px;align-items:center;width:min(290px,80vw);padding:9px 12px;cursor:pointer;animation:cpIn .22s ease-out;transition:opacity .25s,transform .25s}
.cpop.out{opacity:0;transform:translateX(16px)}
.cpop .av{flex:none;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#ffc46b,#ff8f6b);display:grid;place-items:center;font-weight:800;color:#3b2a1a}
.cpop .tx{flex:1;min-width:0}.cpop .nm{font-weight:800;font-size:13px}
.cpop .bd{font-weight:500;font-size:12px;opacity:.9;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.cpop .x{flex:none;background:none;border:0;color:var(--tx);opacity:.6;cursor:pointer;font-size:13px;padding:2px 4px}.cpop .x:hover{opacity:1}
@keyframes cpIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.cpop{animation:none}.cpop.out{transform:none}}
`;

import {SFX} from '../sfx.js';
// âm báo tin nhắn dùng chung bộ SFX (một AudioContext); nút 🔔 ở đây chỉ bật/tắt riêng tiếng tin nhắn
const unlock = () => {};
const ting = () => SFX.play('msgIn');

export function mountChatNotify({chat, openChat}) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const box = document.createElement('div'); box.id = 'chPops'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box);
  
  // ---- nút bật/tắt âm báo, đặt ngay sau nút Chat
  let sound = true; try { sound = localStorage.getItem(KEY) !== '0'; } catch (e) {}
  const anchor = $('iChat');
  anchor && anchor.insertAdjacentHTML('afterend', '<button class="ib" id="iChSnd"><span id="csIc"></span><i id="csTx" style="font-style:normal"></i></button>');
  const sb = $('iChSnd');
  const paint = () => { if (!sb) return; $('csIc').textContent = sound ? '🔔' : '🔕'; $('csTx').textContent = sound ? 'Âm báo' : 'Tắt âm'; sb.title = sound ? 'Tắt tiếng báo tin nhắn' : 'Bật tiếng báo tin nhắn'; };
  if (sb) sb.onclick = () => { sound = !sound; try { localStorage.setItem(KEY, sound ? '1' : '0'); } catch (e) {} paint(); if (sound) { unlock(); setTimeout(ting, 30); } };
  paint();

  // ---- popup
  function close(el) { if (!el || el._gone) return; el._gone = true; clearTimeout(el._t); el.classList.add('out'); setTimeout(() => el.remove(), 260); }
  const clearAll = () => [...box.children].forEach(close);
  function pop(m) {
    const name = NAME[m.slot] || m.slot || '?';
    let body = String(m.body || '').replace(/\s+/g, ' ').trim(); if (body.length > CUT) body = body.slice(0, CUT - 1).trimEnd() + '…';
    const el = document.createElement('div'); el.className = 'cpop hud glass'; el.style.position = 'relative';
    el.innerHTML = '<div class="av"></div><div class="tx"><div class="nm"></div><div class="bd"></div></div><button class="x" title="Đóng">✕</button>';
    el.querySelector('.av').textContent = name[0]; el.querySelector('.nm').textContent = name; el.querySelector('.bd').textContent = body;
    el.querySelector('.x').onclick = e => { e.stopPropagation(); close(el); };
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
    if (sound) ting();
  });
  chat.on('unread', n => { if (!n) clearAll(); });                             // vừa mở khung chat → dọn popup
}
