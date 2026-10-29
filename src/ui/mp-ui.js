// UI multiplayer: cổng trạng thái, thẻ người chơi còn lại, chat, voice. Chỉ thao tác DOM — không đụng vào vòng render 3D.
import {NAME} from '../net/session.js';
import {MAX_LEN} from '../net/chat.js';

const $ = id => document.getElementById(id);
const esc = s => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const toast = m => { const t = $('toast'); if (!t) return; t.textContent = m; t.style.opacity = 1; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.opacity = 0, 2200); };
export {toast};

export function mountGate() {
  const g = document.createElement('div'); g.id = 'mpGate'; g.innerHTML = '<div class="box glass"><div class="ic" id="mgI">⏳</div><div class="tt" id="mgT"></div><div class="ds" id="mgD"></div><div class="bt" id="mgB"></div></div>';
  document.body.appendChild(g);
  return {
    show(icon, title, desc, buttons = []) {
      $('mgI').textContent = icon; $('mgT').textContent = title; $('mgD').textContent = desc;
      const b = $('mgB'); b.innerHTML = ''; buttons.forEach(([t, fn]) => { const e = document.createElement('button'); e.className = 'ib'; e.textContent = t; e.onclick = fn; b.appendChild(e); });
      g.classList.add('on');
    },
    hide() { g.classList.remove('on'); },
  };
}

export function mountMpUi({sess, chat, voice}) {
  const me = sess.slot, other = me === 'bin' ? 'vy' : 'bin';
  // ---- nút trên thanh trên cùng
  const top = $('hTop');
  top.insertAdjacentHTML('afterbegin', '<button class="ib" id="iChat"><span>💬</span>Chat<b class="bdg" id="cBdg" style="display:none">0</b></button><button class="ib" id="iVoice"><span id="vIc">🎙️</span><i id="vTx">Voice</i></button><button class="ib" id="iVoiceX" style="display:none" title="Rời voice"><span>✕</span></button>');
  // ---- thẻ đối phương
  const pc = document.createElement('div'); pc.id = 'hPeer'; pc.className = 'hud glass';
  pc.innerHTML = `<div class="av" id="peAv">${NAME[other][0]}</div><div style="flex:1;min-width:0"><div class="nm" id="peNm">${NAME[other]}</div><div class="lv" id="peSt">Đang chờ...</div></div><div id="peMic" class="pm"></div>`;
  document.body.appendChild(pc);
  const place = () => { const pr = document.getElementById('hProf'); if (pr) pc.style.setProperty('--peerTop', Math.round(pr.getBoundingClientRect().bottom + 8) + 'px'); };
  place(); addEventListener('resize', place); setTimeout(place, 800);
  // ---- panel chat
  const cp = document.createElement('div'); cp.id = 'hChat'; cp.className = 'hud glass';
  cp.innerHTML = `<h3>Chat <span id="chSt" class="chst"></span><button class="pl" id="chX">✕</button></h3><div id="chList"></div>
    <div id="chIn"><textarea id="chTx" rows="1" maxlength="${MAX_LEN}" placeholder="Nhắn cho ${NAME[other]}… (Enter gửi · Shift+Enter xuống dòng)"></textarea><button class="ib" id="chGo">➤</button></div><div id="chErr"></div>`;
  document.body.appendChild(cp);

  // ---------- peer card ----------
  function peer() {
    const on = !!sess.peer;
    pc.classList.toggle('off', !on); pc.classList.toggle('talk', on && voice.peerSpeaking);
    $('peSt').textContent = on ? ('Online' + (sess.rtt != null ? ' · ' + sess.rtt + ' ms' : '')) : 'Chưa vào / đã thoát';
    $('peMic').textContent = !on ? '' : voice.peerVoice ? (voice.peerMuted ? '🔇' : '🎙️') : '';
  }
  sess.on('peer', ({present, slot}) => { peer(); toast(present ? NAME[slot] + ' đã vào phòng' : NAME[other] + ' đã rời phòng'); });
  sess.on('rtt', peer); peer();
  sess.on('status', ({state, text}) => {
    let b = $('mpNet'); if (!b) { b = document.createElement('div'); b.id = 'mpNet'; document.body.appendChild(b); }
    b.textContent = text || ''; b.classList.toggle('on', state === 'offline' || state === 'connecting');
  });

  // ---------- chat ----------
  const list = $('chList'), tx = $('chTx');
  const fmt = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const near = () => list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  chat.on('msg', ({m, mine}) => {
    const stick = near() || mine, el = document.createElement('div');
    el.className = 'cm ' + (mine ? 'me' : 'ot') + (m.pending ? ' pend' : ''); el.dataset.id = m.id;
    el.innerHTML = `<div class="cn">${NAME[m.slot] || m.slot} · ${fmt(m.created_at)}</div><div class="cb">${esc(m.body).replace(/\n/g, '<br>')}</div>`;
    list.appendChild(el); while (list.children.length > 300) list.firstChild.remove();
    if (stick) list.scrollTop = list.scrollHeight;
  });
  chat.on('sent', id => { const e = list.querySelector(`[data-id="${id}"]`); e && e.classList.remove('pend'); });
  chat.on('fail', id => { const e = list.querySelector(`[data-id="${id}"]`); e && e.classList.add('bad'); err('Gửi thất bại — kiểm tra kết nối'); });
  chat.on('unread', n => { const b = $('cBdg'); b.style.display = n ? '' : 'none'; b.textContent = n > 9 ? '9+' : n; });
  chat.on('state', s => { $('chSt').textContent = s === 'ready' ? '' : s === 'offline' ? '· mất kết nối' : s === 'error' ? '· lỗi' : ''; });
  const err = t => { const e = $('chErr'); e.textContent = t; clearTimeout(err._t); err._t = setTimeout(() => e.textContent = '', 2500); };
  let open = false;
  function setOpen(v) { open = v; cp.classList.toggle('on', v); chat.setOpen(v); if (v) { list.scrollTop = list.scrollHeight; setTimeout(() => tx.focus(), 50); } else tx.blur(); }
  $('iChat').onclick = () => setOpen(!open); $('chX').onclick = () => setOpen(false);
  async function go() { const t = tx.value; if (!t.trim()) return; const r = await chat.send(t); if (r.ok) { tx.value = ''; grow(); } else if (r.err !== 'empty') err(r.err); }
  const grow = () => { tx.style.height = 'auto'; tx.style.height = Math.min(90, tx.scrollHeight) + 'px'; };
  tx.addEventListener('input', grow);
  tx.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } else if (e.key === 'Escape') setOpen(false); });
  tx.addEventListener('keyup', e => e.stopPropagation());
  $('chGo').onclick = go;

  // ---------- voice ----------
  function vui(s) {
    const b = $('iVoice');
    b.classList.toggle('live', s.active); b.classList.toggle('talk', s.speaking);
    $('vIc').textContent = !s.active ? '🎙️' : s.muted ? '🔇' : '🎙️';
    $('vTx').textContent = !s.active ? (s.listening ? 'Voice (nghe)' : 'Voice') : s.muted ? 'Đã tắt tiếng' : s.conn === 'connected' ? 'Đang nói chuyện' : s.conn === 'reconnecting' ? 'Kết nối lại…' : 'Đang kết nối…';
    $('iVoiceX').style.display = s.active ? '' : 'none';
    pc.classList.toggle('talk', !!s.peerSpeaking);
    $('peMic').textContent = !sess.peer ? '' : s.peerVoice ? (s.peerMuted ? '🔇' : '🎙️') : '';
    if (s.err) toast(s.err);
  }
  voice.on('state', vui); vui(voice.state());
  voice.on('needGesture', () => toast('Chạm vào trang để nghe voice'));
  $('iVoice').onclick = async () => { const s = voice.state(); if (!s.active) await voice.join(); else voice.toggleMute(); };
  $('iVoiceX').onclick = () => voice.leave();
  addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.code === 'KeyT' && !e.repeat) { e.preventDefault(); setOpen(true); } if (e.code === 'KeyM' && !e.repeat && voice.micOn) voice.toggleMute(); });
  return {setOpen};
}
