// UI multiplayer: cổng trạng thái, thẻ người chơi còn lại, chat, voice. Chỉ thao tác DOM — không đụng vào vòng render 3D.
import {NAME} from '../net/session.js';
import {MAX_LEN} from '../net/chat.js';
import {ic, paintIcons} from './icons.js';
import {Notify} from './notify.js';
const AV = (s, off) => 'assets/ui/avatars/' + s + (off && s === 'vy' ? '-off' : '') + '.v1.png';

const $ = id => document.getElementById(id);
const esc = s => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const toast = m => { const t = $('toast'); if (!t) return; t.textContent = m; t.style.opacity = 1; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.opacity = 0, 2200); };
export {toast};

export function mountGate() {
  const g = document.createElement('div'); g.id = 'mpGate'; g.innerHTML = '<div class="box"><div class="ic" id="mgI"></div><div class="tt" id="mgT"></div><div class="ds" id="mgD"></div><div class="bt" id="mgB"></div></div>';
  document.body.appendChild(g);
  return {
    show(icon, title, desc, buttons = []) {
      $('mgI').innerHTML = ic({'⏳': 'dots', '🚪': 'out', '⚠️': 'info'}[icon] || '') || icon; $('mgT').textContent = title; $('mgD').textContent = desc;
      const b = $('mgB'); b.innerHTML = ''; buttons.forEach(([t, fn]) => { const e = document.createElement('button'); e.className = 'ib'; e.textContent = t; e.onclick = fn; b.appendChild(e); });
      g.classList.add('on');
    },
    hide() { g.classList.remove('on'); },
  };
}

export function mountMpUi({sess, chat, voice}) {
  const me = sess.slot, other = me === 'bin' ? 'vy' : 'bin';
  // ---- nút trên thanh trên cùng
  const note = $('iNote');
  note.insertAdjacentHTML('afterend', `<button class="ib" id="iChat" title="Chat (phím T)" aria-label="Chat"><i class="ic">${ic('chat')}</i><b class="bdg" id="cBdg" style="display:none">0</b></button><button class="ib" id="iVoice" title="Voice" aria-label="Voice"><i class="ic" id="vIc">${ic('mic')}</i><i class="sr" id="vTx">Voice</i></button><button class="ib" id="iVid" title="Video call" aria-label="Video call"><i class="ic">${ic('video')}</i></button><button class="ib" id="iVoiceX" style="display:none" title="Rời cuộc gọi" aria-label="Rời cuộc gọi"><i class="ic">${ic('phoneEnd')}</i></button>`);
  // ---- thẻ đối phương
  const pc = document.createElement('div'); pc.id = 'hPeer'; pc.className = 'hud cap off'; pc.dataset.s = other;
  pc.innerHTML = `<div class="av"><img id="peAv" src="${AV(other, true)}" alt="" width="64" height="64" draggable="false"></div><div class="tx"><div class="nm" id="peNm">${NAME[other].toUpperCase()}</div><div class="st" id="peSt">Chưa vào / Đã thoát</div></div><div id="peMic" class="pm"></div>`;
  $('hLeft').appendChild(pc);
  // ---- panel chat
  const cp = document.createElement('div'); cp.id = 'hChat'; cp.className = 'hud panel';
  cp.innerHTML = `<div class="ph"><h3>Chat</h3><span id="chSt" class="chst"></span><span class="sp"></span><button class="rb" id="chX" title="Đóng" aria-label="Đóng chat">${ic('x')}</button></div><div id="chList"></div>
    <div id="chIn"><textarea id="chTx" rows="1" maxlength="${MAX_LEN}" placeholder="Nhắn cho ${NAME[other]}…" title="Enter: gửi · Shift+Enter: xuống dòng"></textarea><button id="chGo" title="Gửi" aria-label="Gửi">${ic('send')}</button></div><div id="chErr"></div>`;
  $('hBR').prepend(cp);

  // ---------- peer card ----------
  function peer() {
    const on = !!sess.peer;
    pc.classList.toggle('off', !on); pc.classList.toggle('talk', on && voice.peerSpeaking);
    if (sess.netStats) { const q = sess.netStats(); pc.title = `Mạng game: gửi ${q.txPerSec}/s · nhận ${q.rxPerSec}/s · im lặng dài nhất ${q.maxGapMs} ms`; }
    $('peSt').textContent = on ? ('Online' + (sess.rtt != null ? ' · ' + sess.rtt + ' ms' : '') + (sess.p2pOn ? ' · P2P' : '')) : 'Chưa vào / Đã thoát';
    const src = AV(other, !on); if ($('peAv').getAttribute('src') !== src) $('peAv').src = src;
    $('peMic').innerHTML = !on ? '' : voice.peerVoice ? ic(voice.peerMuted ? 'micOff' : 'mic') : '';
  }
  sess.on('peer', ({present, slot}) => { peer(); const t = present ? NAME[slot] + ' đã vào phòng' : NAME[other] + ' đã rời phòng'; toast(t); Notify.add({type: 'peer', title: t}); });
  sess.on('rtt', peer); sess.on('p2p', peer); peer();
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

  // ---------- cuộc gọi (voice + video) ----------
  const PH = {idle: '', asking: 'Đang xin quyền…', waiting: `Chờ ${NAME[other]} vào cuộc gọi`, connecting: 'Đang kết nối…', connected: 'Đang gọi', weak: 'Mạng yếu', recovering: 'Đang nối lại…', lost: 'Mất kết nối — đang thử lại', ended: 'Cuộc gọi đã kết thúc'};
  const call = document.createElement('div'); call.id = 'hCall'; call.className = 'hud panel';
  call.innerHTML = `<div class="cH"><span class="cDot" id="cDot"></span><b id="cSt">—</b><i id="cTm"></i><span class="cSp"></span>
      <button class="pl" id="cSz" title="Đổi cỡ khung: nhỏ / vừa / lớn">${ic('angle')}</button><button class="pl" id="cFs" title="Toàn màn hình (Esc để thoát)">${ic('expand')}</button><button class="pl" id="cDg" title="Chẩn đoán">${ic('chart')}</button><button class="pl" id="cSet" title="Thiết bị & chất lượng">${ic('gear')}</button><button class="pl" id="cMin" title="Thu nhỏ">${ic('minus')}</button><button class="pl" id="cX" title="Đóng khung video (cuộc gọi vẫn tiếp tục)">${ic('x')}</button></div>
    <div class="cV"><video id="cRv" autoplay playsinline muted></video><div class="cNo" id="cNo"><div class="av"><img src="${AV(other)}" alt=""></div><span id="cNoT"></span></div><video id="cLv" autoplay playsinline muted></video></div>
    <div id="cErr"></div><div class="cRz" id="cRz" title="Kéo để phóng to / thu nhỏ"></div>
    <div class="cC"><button class="ib" id="cMic"><span>${ic('mic')}</span><i>Mic</i></button><button class="ib" id="cCam"><span>${ic('video')}</span><i>Camera</i></button><button class="ib end" id="cEnd"><span>${ic('phoneEnd')}</span><i>Kết thúc</i></button></div>
    <div class="cP" id="cSetP"><label>Micro <select id="cSelM"></select></label><label>Camera <select id="cSelC"></select></label>
      <div class="chips" id="cQ">${['auto:Tự động', 'high:Cao', 'mid:Vừa', 'low:Thấp'].map(x => `<span class="chip" data-q="${x.split(':')[0]}">${x.split(':')[1]}</span>`).join('')}</div></div>
    <div class="cP" id="cDgP"><pre id="cDgT"></pre><button class="pl" id="cDgCp">Sao chép</button></div>`;
  document.body.appendChild(call);
  const placeCall = () => { const pr = document.getElementById('hPeer'); if (pr) call.style.setProperty('--callTop', Math.round(pr.getBoundingClientRect().bottom + 8) + 'px'); };
  placeCall(); addEventListener('resize', placeCall); setTimeout(placeCall, 900);
  // ---- cỡ + vị trí khung gọi: kéo góc dưới-phải để đổi cỡ, kéo thanh trên để di chuyển, ⤢ đổi nhanh nhỏ/vừa/lớn, ⛶ toàn màn hình ----
  const LKEY = 'vyCallLayout', SIZES = [300, 480, 760];
  let lay = {w: 300, x: null, y: null};
  try { Object.assign(lay, JSON.parse(localStorage.getItem(LKEY) || '{}')); } catch (e) {}
  const saveLay = () => { try { localStorage.setItem(LKEY, JSON.stringify(lay)); } catch (e) {} };
  const isNarrow = () => innerWidth <= 900;
  function applyLay() {
    const maxW = Math.max(220, innerWidth - 20);
    const w = Math.max(220, Math.min(lay.w || 300, maxW, 1400));
    call.style.setProperty('--callW', w + 'px');
    if (lay.x != null && lay.y != null && !isNarrow()) {
      const x = Math.max(0, Math.min(lay.x, innerWidth - 120)), y = Math.max(0, Math.min(lay.y, innerHeight - 60));
      call.style.left = x + 'px'; call.style.top = y + 'px'; call.style.bottom = 'auto';
    } else { call.style.left = ''; call.style.top = ''; call.style.bottom = ''; }
  }
  applyLay(); addEventListener('resize', applyLay);
  const setFull = v => { call.classList.toggle('full', v); document.body.classList.toggle('callFull', v); $('cFs').innerHTML = ic(v ? 'shrink' : 'expand'); };
  $('cSz').onclick = () => { const i = SIZES.findIndex(w => w >= (lay.w || 300) - 5); lay.w = SIZES[(i + 1) % SIZES.length]; setFull(false); applyLay(); saveLay(); };
  $('cFs').onclick = () => setFull(!call.classList.contains('full'));
  $('cRv').ondblclick = () => setFull(!call.classList.contains('full'));
  addEventListener('keydown', e => { if (e.key === 'Escape' && call.classList.contains('full')) setFull(false); });
  const drag = (el, onMove, onEnd) => {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || call.classList.contains('full')) return;
      if (e.target.closest('button')) return;
      e.preventDefault(); const r = call.getBoundingClientRect(); const st = {sx: e.clientX, sy: e.clientY, l: r.left, t: r.top, w: r.width};
      el.setPointerCapture(e.pointerId);
      const mv = ev => onMove(st, ev.clientX - st.sx, ev.clientY - st.sy);
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); onEnd && onEnd(); saveLay(); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  };
  drag($('cRz'), (st, dx) => { lay.w = Math.round(st.w + dx); if (lay.x == null) { lay.x = st.l; lay.y = st.t; } applyLay(); });
  drag(call.querySelector('.cH'), (st, dx, dy) => { lay.x = Math.round(st.l + dx); lay.y = Math.round(st.t + dy); applyLay(); });
  call.querySelector('.cH').addEventListener('dblclick', e => { if (e.target.closest('button')) return; lay.x = lay.y = null; applyLay(); saveLay(); });
  const rv = $('cRv'), lv = $('cLv'), play = v => { const p = v.play && v.play(); p && p.catch && p.catch(() => {}); };
  let shown = false, collapsed = false, setOpenP = null, lastS = voice.state(), tmT = null, autoShown = false;
  const mmss = t => { const n = Math.max(0, Math.floor(t / 1000)), h = Math.floor(n / 3600); return (h ? h + ':' : '') + String(Math.floor(n % 3600 / 60)).padStart(h ? 2 : 1, '0') + ':' + String(n % 60).padStart(2, '0'); };
  const viewing = () => shown && !collapsed;
  function bindVideo() {
    const on = viewing() && !document.hidden;
    const ms = on && voice.remoteVideo && lastS.peerCam && lastS.active ? voice.remoteVideo : null;   // chưa nghe máy thì không hiện hình người gọi
    if (rv.srcObject !== ms) { rv.srcObject = ms; if (ms) play(rv); }
    const ls = on && voice.camStream ? voice.camStream : null;
    if (lv.srcObject !== ls) { lv.srcObject = ls; if (ls) play(lv); }
    $('cNo').style.display = ms ? 'none' : '';
    $('cNoT').textContent = !lastS.peerCam ? 'Camera của ' + NAME[other] + ' đang tắt' : !ms ? 'Đang tải hình…' : '';
    lv.style.display = ls ? '' : 'none';
  }
  function showCall(v) { shown = v; call.classList.toggle('on', v); voice.setPanelOpen(viewing()); bindVideo(); tick(); }
  function tick() { const s = lastS; $('cTm').textContent = (viewing() || collapsed) && s.connectedAt && s.active ? mmss(Date.now() - s.connectedAt) : ''; }
  function cui(s) {
    lastS = s; const ph = s.phase;
    call.dataset.ph = ph; $('cSt').textContent = s.outgoing && ph !== 'asking' && ph !== 'lost' && ph !== 'recovering' ? (s.peerHere ? 'Đang gọi ' + NAME[other] + '…' : 'Chờ ' + NAME[other] + ' vào phòng') : PH[ph] || '';
    $('cMic').classList.toggle('off', !s.micOn || s.muted); $('cMic').firstChild.innerHTML = ic(!s.micOn || s.muted ? 'micOff' : 'mic'); $('cMic').lastChild.textContent = !s.micOn ? 'Bật mic' : s.muted ? 'Bật tiếng' : 'Tắt tiếng';
    $('cCam').classList.toggle('off', !s.camOn); $('cCam').lastChild.textContent = s.camOn ? 'Tắt camera' : 'Bật camera';
    $('cCam').firstChild.innerHTML = ic(s.camOn ? 'video' : 'videoOff');
    const errs = []; if (s.micErr) errs.push('🎙️ ' + s.micErr); if (s.camErr) errs.push('📹 ' + s.camErr);
    if (!s.sigOk && s.active && s.phase !== 'lost') errs.push('📡 Tín hiệu tạm mất — cuộc gọi vẫn tiếp tục, đang nối lại tín hiệu…');
    // kẹt "đang nối" quá 12s mà server chưa cấp TURN (chỉ có STUN) => nói rõ nguyên nhân thay vì để người dùng đoán
    const stuck = s.active && !s.connectedAt && ['connecting', 'recovering', 'lost'].includes(ph);
    if (stuck) cui._since = cui._since || Date.now(); else cui._since = 0;
    if (stuck && s.turn === false && Date.now() - cui._since > 12000) errs.push('🌐 Hai máy đang ở 2 mạng khác nhau và mạng chặn gọi trực tiếp. Game chưa có máy chủ chuyển tiếp (TURN) nên chưa nối được. Thử cùng một wifi, hoặc báo người làm game cấu hình TURN.');
    if (s.vPause) errs.push('⏸️ Mạng yếu — tạm dừng hình để giữ tiếng');
    $('cErr').innerHTML = errs.map(e => `<div>${esc(e)}</div>`).join('');
    document.querySelectorAll('#cQ .chip').forEach(c => c.classList.toggle('on', c.dataset.q === s.quality));
    // nút trên thanh trên cùng
    const b = $('iVoice'); b.classList.toggle('live', s.active); b.classList.toggle('talk', s.speaking);
    $('vIc').innerHTML = ic(s.active && (!s.micOn || s.muted) ? 'micOff' : 'mic');
    $('vTx').textContent = s.incoming ? '📞 Nghe máy' : s.outgoing && !s.asking ? 'Đang gọi…' : !s.active ? (s.listening ? 'Voice' : 'Voice') : !s.micOn ? 'Bật mic' : s.muted ? 'Đã tắt tiếng' : s.phase === 'connected' ? 'Đang nói chuyện' : s.phase === 'weak' ? 'Mạng yếu' : s.phase === 'recovering' || s.phase === 'lost' ? 'Nối lại…' : s.phase === 'waiting' ? 'Chờ ' + NAME[other] : 'Đang kết nối…';
    $('iVoice').title = $('vTx').textContent; $('iVoiceX').style.display = s.active ? '' : 'none';
    $('iVid').classList.toggle('live', s.camOn || (s.active && shown));
    pc.classList.toggle('talk', !!s.peerSpeaking);
    $('peMic').innerHTML = !sess.peer ? '' : s.peerVoice ? ic(s.peerMuted ? 'micOff' : 'mic') + (s.peerCam ? ic('video') : '') : '';
    // tự mở khung video khi mình bật camera hoặc đối phương bật camera (lần đầu của cuộc gọi); cuộc gọi chỉ có tiếng thì không hiện gì
    if (!s.active && !s.listening) { autoShown = false; if (shown) showCall(false); }
    else if (!autoShown && (s.camOn || (s.peerCam && s.active))) { autoShown = true; collapsed = false; call.classList.remove('min'); showCall(true); }
    if (!s.peerCam && !s.camOn && s.phase === 'ended') showCall(false);
    bindVideo(); tick();
  }
  voice.on('state', cui);
  voice.on('video', () => bindVideo());
  voice.on('note', t => toast(t));
  voice.on('needGesture', () => toast('Chạm vào trang để nghe cuộc gọi'));
  voice.on('peerEnded', () => { autoShown = false; });
  addEventListener('visibilitychange', () => { bindVideo(); tick(); });
  tmT = setInterval(() => { if (!document.hidden) { tick(); if (lastS && lastS.active && !lastS.connectedAt && cui._since) cui(lastS); } }, 1000);
  $('iVoice').onclick = async () => { const s = voice.state(); if (!s.active) await voice.join({mic: true}); else voice.toggleMute(); };
  $('iVid').onclick = async () => { const s = voice.state(); if (!s.active) { await voice.setCamera(true); return; } if (shown && !collapsed) showCall(false); else { collapsed = false; call.classList.remove('min'); showCall(true); } };
  const endCall = () => { voice.leave(); autoShown = false; showCall(false); };
  $('iVoiceX').onclick = endCall; $('cEnd').onclick = endCall;
  $('cMic').onclick = () => voice.toggleMute(); $('cCam').onclick = () => voice.toggleCamera();
  $('cX').onclick = () => showCall(false);
  $('cMin').onclick = () => { setFull(false); collapsed = !collapsed; call.classList.toggle('min', collapsed); voice.setPanelOpen(viewing()); bindVideo(); tick(); };
  $('cSet').onclick = async () => { const p = $('cSetP'); p.classList.toggle('on'); if (p.classList.contains('on')) fillDevices(); };
  $('cDg').onclick = () => { $('cDgP').classList.toggle('on'); dg(); };
  document.querySelectorAll('#cQ .chip').forEach(c => c.onclick = () => voice.setQuality(c.dataset.q));
  async function fillDevices() {
    const d = await voice.devices(), fill = (el, list, cur) => { el.innerHTML = list.length ? list.map(x => `<option value="${esc(x.id)}"${x.id === cur ? ' selected' : ''}>${esc(x.label)}</option>`).join('') : '<option value="">(chưa cấp quyền — bấm Bật mic / Bật camera)</option>'; };
    fill($('cSelM'), d.mics, voice.micId); fill($('cSelC'), d.cams, voice.camId);
  }
  voice.on('devices', () => { if ($('cSetP').classList.contains('on')) fillDevices(); });
  $('cSelM').onchange = e => e.target.value && voice.switchMic(e.target.value);
  $('cSelC').onchange = e => e.target.value && voice.switchCam(e.target.value);
  const L = {high: 'Cao', mid: 'Vừa', low: 'Thấp'};
  function dg() {
    if (!$('cDgP').classList.contains('on')) return;
    const d = voice.diagnostics(), n = (v, u = '') => v == null || v === '' ? '—' : v + u;
    const relay = /relay/.test(d.route || '') ? ' ← qua TURN' : '';
    $('cDgT').textContent = [
      `Tín hiệu : ${d.sig}   Media: ${d.media}   ICE: ${n(d.ice)}`,
      `Đường đi : ${n(d.route)}${relay}   TURN cấp: ${d.turn == null ? '—' : d.turn ? 'có' : 'không (chỉ STUN)'}`,
      `RTT ${n(d.rtt, ' ms')} · mất gói ${n(d.lossIn, '%')} · jitter ${n(d.jitter, ' ms')}`,
      `Âm thanh vào ${n(d.kbpsAudioIn, ' kbps')}`,
      `Hình vào ${n(d.kbpsVideoIn, ' kbps')} ${n(d.fpsIn)} fps ${n(d.resIn)}`,
      `Hình ra  ${n(d.kbpsVideoOut, ' kbps')} ${n(d.fpsOut)} fps ${n(d.resOut)}  (giới hạn: ${n(d.limit || 'none')})`,
      `Mức hình : ${L[LEVELS_ID[d.level]] || '—'}${d.vPause ? ' (đã tạm dừng hình)' : ''}`,
      (() => { const q = sess.netStats ? sess.netStats() : null; return q ? `Mạng game : gửi ${q.txPerSec}/s · nhận ${q.rxPerSec}/s · im lặng dài nhất ${q.maxGapMs} ms · gửi lỗi ${q.sendFail}` : ''; })(),
      `Thời gian kết nối ${n(d.connectMs, ' ms')} · nối lại ${d.reconnects} lần · gián đoạn ${mmss(d.interruptMs)} · đã gọi ${mmss(d.duration * 1000)}`].join('\n');
  }
  const LEVELS_ID = ['high', 'mid', 'low'];
  voice.on('stats', dg); sess.on('status', dg);
  $('cDgCp').onclick = () => { try { navigator.clipboard.writeText(JSON.stringify(voice.diagnostics(), null, 1)); toast('Đã sao chép số liệu chẩn đoán'); } catch (e) {} };
  call.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });     // tránh phím cách/Enter bấm nhầm nút đang focus
  call.addEventListener('keydown', e => e.stopPropagation()); call.addEventListener('keyup', e => e.stopPropagation());
  cui(voice.state());
  addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.code === 'KeyT' && !e.repeat) { e.preventDefault(); setOpen(true); } if (e.code === 'KeyM' && !e.repeat && voice.active) voice.toggleMute(); });
  return {setOpen};
}
