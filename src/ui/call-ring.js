// Cuộc gọi đến / đi kiểu Messenger: popup "ai đó đang gọi" + chuông lặp + nhận/từ chối, tiếng chờ bên gọi, tiếng kết thúc.
// Chỉ NGHE trạng thái của Voice (không đổi logic WebRTC). Mọi âm thanh đi qua SFX (bật/tắt trong Cài đặt). Giao diện: ui.css (#ringPop).
import {NAME} from '../net/session.js';
import {SFX} from '../sfx.js';
import {ic} from './icons.js';
import {Notify} from './notify.js';

const $ = id => document.getElementById(id);
const RING_TIMEOUT = 45000;           // bên gọi tự dập máy nếu sau ngần này vẫn chưa ai nghe (chỉ tính khi người kia đang trong phòng)



export function mountCallRing({voice, sess, toast, other}) {
  const pop = document.createElement('div'); pop.id = 'ringPop'; pop.className = 'hud'; pop.setAttribute('role', 'alertdialog'); pop.setAttribute('aria-live', 'assertive'); pop.dataset.nosfx = '1';
  pop.innerHTML = `<div class="av"><img id="rpAv" alt=""></div><div class="nm" id="rpNm"></div><div class="ds"><span class="ph">${ic('phone')}</span> đang gọi cho bạn…</div><div class="bt"><button class="no" id="rpNo">${ic('phoneEnd')} Từ chối</button><button class="ok" id="rpOk">${ic('phone')} Nghe</button></div>`;
  document.body.appendChild(pop);
  const nm = NAME[other] || other;
  $('rpAv').src = 'assets/ui/avatars/' + (other === 'bin' ? 'bin' : 'vy') + '.v1.png'; $('rpNm').textContent = nm;
  // nút gọi/tắt/mic/cam có âm riêng theo trạng thái → bỏ tiếng "click" chung
  ['iVoice', 'iVoiceX', 'iVid', 'cEnd', 'cMic', 'cCam'].forEach(id => { const e = $(id); if (e) e.dataset.nosfx = '1'; });

  // ---- tiêu đề tab nhấp nháy + rung điện thoại khi có người gọi ----
  const title0 = document.title; let blinkT = null, vibT = null;
  const blink = on => {
    clearInterval(blinkT); blinkT = null; if (!on) { document.title = title0; return; }
    let f = 0; blinkT = setInterval(() => { document.title = (f++ % 2) ? title0 : '📞 ' + nm + ' đang gọi…'; }, 900);
  };
  const vibrate = on => {
    clearInterval(vibT); vibT = null; try { navigator.vibrate && navigator.vibrate(0); } catch (e) {}
    if (!on || !navigator.vibrate) return;
    const go = () => { try { navigator.vibrate([400, 200, 400]); } catch (e) {} }; go(); vibT = setInterval(go, 2500);
  };
  const showPop = on => { pop.classList.toggle('on', on); if (on) { setTimeout(() => { try { $('rpOk').focus({preventScroll: true}); } catch (e) {} }, 350); } };

  let prev = voice.state(), ringT = null, skipHangup = false, wasConnected = false, outSince = 0;
  const stopRing = () => { SFX.loop('ringIn', false); showPop(false); blink(false); vibrate(false); };

  $('rpOk').onclick = () => { voice.join({mic: true}); };
  $('rpNo').onclick = () => { voice.decline(); };

  // bên gọi: hết giờ không ai nghe → tự dập máy
  const armTimeout = s => {
    clearTimeout(ringT); ringT = null;
    if (s.outgoing && s.peerHere) ringT = setTimeout(() => { if (voice.outgoing) { SFX.play('noAnswer'); skipHangup = true; voice.leave(); toast(nm + ' không nghe máy'); } }, RING_TIMEOUT);
  };

  voice.on('declined', () => { SFX.play('decline'); skipHangup = true; toast(nm + ' đã từ chối cuộc gọi'); Notify.add({type: 'call', title: nm + ' đã từ chối cuộc gọi'}); });
  voice.on('peerEnded', info => {
    info = info || {};
    if (info.missed) { SFX.play('missed'); toast('📵 Cuộc gọi nhỡ từ ' + nm); Notify.add({type: 'call', title: 'Cuộc gọi nhỡ từ ' + nm}); }
    else if (info.wasActive && !info.reload) { SFX.play('hangup'); skipHangup = true; voice.leave(); }      // bên kia dập máy → mình cũng kết thúc (đóng mic/camera)
  });

  voice.on('state', s => {
    const p = prev; prev = s;
    // --- cuộc gọi đến ---
    if (s.incoming && !p.incoming) {
      SFX.loop('ringIn', true); showPop(true); blink(true); vibrate(true);
      if (document.hidden) toast('📞 ' + nm + ' đang gọi…');
    } else if (!s.incoming && p.incoming) {
      stopRing();
      if (s.declined) SFX.play('decline'); else if (s.active || s.asking) SFX.play('accept');      // (cuộc gọi nhỡ do bên gọi huỷ: phát ở sự kiện peerEnded)
    }
    // --- cuộc gọi đi: tiếng chờ ---
    if (s.outgoing && !p.outgoing && s.phase !== 'asking') { SFX.loop('ringOut', true); outSince = Date.now(); }
    else if (!s.outgoing && p.outgoing) { SFX.loop('ringOut', false); if (s.active && s.peerVoice) SFX.play('peerJoin'); }
    if (s.outgoing !== p.outgoing || s.peerHere !== p.peerHere) armTimeout(s);
    // --- vào / ra cuộc gọi ---
    if (s.active && !p.active && !p.outgoing && s.peerVoice) { /* mình nghe máy: tiếng accept đã phát lúc bấm */ }
    if (!s.active && p.active) {
      SFX.loop('ringOut', false); clearTimeout(ringT);
      if (skipHangup) skipHangup = false; else SFX.play('hangup');
      wasConnected = false;
    }
    // --- chất lượng kết nối ---
    if (s.active) {
      if (!p.active || (p.outgoing && !s.outgoing)) wasConnected = s.phase === 'connected';      // vừa vào/được nghe máy: tiếng accept/peerJoin đã báo rồi, chỉ chime nếu media nối chậm hơn
      else if (s.phase === 'connected' && !wasConnected && !s.outgoing) { wasConnected = true; SFX.play('connected'); }
      if (p.phase !== 'lost' && s.phase === 'lost') SFX.play('lost');
      if (p.phase === 'lost' && (s.phase === 'connected' || s.phase === 'weak')) SFX.play('recovered');
      if (p.active) {
        if (s.micOn && p.micOn && s.muted !== p.muted) SFX.play(s.muted ? 'mute' : 'unmute');
        if (s.camOn !== p.camOn) SFX.play(s.camOn ? 'camOn' : 'camOff');
      }
    }
  });
  // giữ trạng thái ban đầu (vd. vừa tải lại trang giữa lúc gọi)
  const s0 = voice.state(); if (s0.incoming) { SFX.loop('ringIn', true); showPop(true); blink(true); vibrate(true); }
  addEventListener('pagehide', () => { stopRing(); SFX.loop('ringOut', false); });
  return {stop: stopRing};
}
