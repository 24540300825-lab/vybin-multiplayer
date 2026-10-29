// Voice 2 chiều bằng WebRTC. Tín hiệu (offer/answer/ICE) đi qua kênh Broadcast; ÂM THANH đi P2P (không qua Supabase).
// - Chỉ xin quyền mic khi người dùng bấm. Tắt mic => dừng track + giải phóng.
// - Tránh glare bằng vai trò cố định: slot BIN luôn là bên tạo offer; VY chỉ trả lời (và gửi `req` khi cần dựng lại kết nối).
// - Mất kết nối => restartIce; peer reload => dựng lại.
import {CONFIG} from '../config.js';

export class Voice {
  constructor(sess) {
    this.s = sess; this.h = {}; this.pc = null; this.stream = null; this.track = null; this.audioEl = null;
    this.active = false;       // đã tham gia voice (có pc)
    this.micOn = false; this.muted = false; this.peerMuted = false; this.peerVoice = false;
    this.conn = 'idle';        // idle|connecting|connected|reconnecting|failed
    this.speaking = false; this.peerSpeaking = false; this.err = '';
    this._making = false; this._ignore = false; this._pendingIce = []; this._ctx = null; this._an = {}; this._lvT = null; this._disT = null;
    this.init = sess.slot === 'bin'; this.optOut = false;
    sess.on('msg', m => { if (m.k === 'sig') this._onSig(m); else if (m.k === 'voice') this._onVoice(m); });
    sess.on('peer', ({present}) => { if (!present) this._peerGone(); else this._hello(); });
    sess.on('reconnected', () => this._hello());
  }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); }
  emit(ev, a) { (this.h[ev] || []).forEach(f => { try { f(a); } catch (e) { console.error(e); } }); }
  get listening() { return !!this.pc; }
  state() { return {active: this.micOn, listening: !!this.pc, micOn: this.micOn, muted: this.muted, peerMuted: this.peerMuted, peerVoice: this.peerVoice, conn: this.conn, speaking: this.speaking, peerSpeaking: this.peerSpeaking, err: this.err}; }
  _upd() { this.emit('state', this.state()); }
  _ice() { const s = [...CONFIG.ice]; if (CONFIG.turn && CONFIG.turn.urls) s.push(CONFIG.turn); return s; }

  // đối phương (mới) xuất hiện / kênh nối lại: báo trạng thái voice; bên khởi tạo dựng offer mới
  _hello() {
    if (this.micOn || this.pc) this.s.send({k: 'voice', on: this.micOn ? 1 : 0, muted: this.muted, req: this.init ? 0 : 1});
    if (this.init && (this.micOn || this.peerVoice)) { this._closePc(); this._ensurePc(); this._attachTrack(); }
  }
  // ---- người dùng bấm "Bật voice" ----
  async join() {
    if (this.active && this.micOn) return;
    this.err = ''; this.optOut = false;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Trình duyệt không hỗ trợ mic (cần HTTPS).');
      this.stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}, video: false});
    } catch (e) {
      this.err = e.name === 'NotAllowedError' ? 'Bạn đã chặn quyền micro. Cho phép micro trong thanh địa chỉ rồi thử lại.' :
                 e.name === 'NotFoundError' ? 'Không tìm thấy micro.' : (e.message || 'Không mở được micro');
      this._upd(); return false;      // voice lỗi KHÔNG ảnh hưởng game
    }
    this.track = this.stream.getAudioTracks()[0]; this.track.enabled = !this.muted;
    this.track.onended = () => { this.err = 'Micro bị ngắt'; this.leave(); };
    this.micOn = true; this.active = true;
    this._ensurePc();
    this._attachTrack();
    this._meter('me', this.stream);
    this.s.send({k: 'voice', on: 1, muted: this.muted, req: (this.init || (this.pc && this.tx)) ? 0 : 1});
    this._upd(); return true;
  }
  setMuted(v) {
    this.muted = !!v; if (this.track) this.track.enabled = !this.muted;
    this.s.send({k: 'voice', on: this.micOn ? 1 : 0, muted: this.muted}); this._upd();
  }
  toggleMute() { this.setMuted(!this.muted); }
  leave() {
    const had = this.micOn;
    this.active = false; this.micOn = false; this.speaking = false; this.peerSpeaking = false;
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; this.track = null; }
    this._closePc(); this._stopMeters();
    this.conn = 'idle'; this.optOut = true;
    if (had) this.s.send({k: 'voice', on: 0});
    this._upd();
  }

  // ---- WebRTC ----
  _ensurePc() {
    if (this.pc) return this.pc;
    const pc = this.pc = new RTCPeerConnection({iceServers: this._ice()});
    this.tx = this.init ? pc.addTransceiver('audio', {direction: 'sendrecv'}) : null;   // VY nhận transceiver từ offer của BIN
    this.conn = 'connecting';
    pc.onicecandidate = e => { if (e.candidate) this.s.send({k: 'sig', t: 'ice', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate}); };
    pc.ontrack = e => this._onRemote(e);
    pc.onnegotiationneeded = async () => {
      if (!this.init) return;
      try { this._making = true; await pc.setLocalDescription(); this.s.send({k: 'sig', t: 'desc', d: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription}); }
      catch (e) { console.warn('[voice] negotiate', e); } finally { this._making = false; }
    };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') { clearTimeout(this._disT); this.conn = 'connected'; }
      else if (st === 'disconnected') { this.conn = 'reconnecting'; clearTimeout(this._disT); this._disT = setTimeout(() => { if (pc.iceConnectionState === 'disconnected') this._restart(); }, 3000); }
      else if (st === 'failed') { this.conn = 'reconnecting'; this._restart(); }
      this._upd();
    };
    return pc;
  }
  _attachTrack() { if (this.tx && this.track) this.tx.sender.replaceTrack(this.track).catch(e => console.warn('[voice] replaceTrack', e)); }
  _restart() { if (!this.pc) return; if (this.init) { try { this.pc.restartIce(); } catch (e) { console.warn(e); } } else this.s.send({k: 'voice', on: this.micOn ? 1 : 0, muted: this.muted, req: 1}); }
  _closePc() {
    clearTimeout(this._disT);
    if (this.pc) { this.pc.onicecandidate = this.pc.ontrack = this.pc.onnegotiationneeded = this.pc.oniceconnectionstatechange = null; try { this.pc.close(); } catch (e) {} this.pc = null; this.tx = null; }
    if (this.audioEl) { this.audioEl.srcObject = null; this.audioEl.remove(); this.audioEl = null; }
    this._pendingIce = []; this._making = false; this._ignore = false;
  }
  _onRemote(e) {
    const ms = e.streams[0] || new MediaStream([e.track]);
    if (!this.audioEl) { const a = this.audioEl = document.createElement('audio'); a.autoplay = true; a.playsInline = true; a.style.display = 'none'; document.body.appendChild(a); }
    this.audioEl.srcObject = ms; this.audioEl.play().catch(() => this.emit('needGesture'));
    this._meter('peer', ms); this._upd();
  }
  async _onSig(m) {
    if (!this.pc) { if ((!this.peerVoice && !this.micOn) || this.optOut) return; this._ensurePc(); this._upd(); }
    const pc = this.pc;
    try {
      if (m.t === 'desc') {
        const d = m.d;
        if (d.type === 'offer' && this.init) return;           // BIN không nhận offer
        if (d.type === 'answer' && pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription(d);
        for (const c of this._pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (d.type === 'offer') {
          if (!this.tx) { this.tx = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'audio') || null; if (this.tx) this.tx.direction = 'sendrecv'; this._attachTrack(); }
          await pc.setLocalDescription();
          this.s.send({k: 'sig', t: 'desc', d: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription});
        }
      } else if (m.t === 'ice') {
        if (!pc.remoteDescription) { this._pendingIce.push(m.c); return; }
        await pc.addIceCandidate(m.c).catch(e => console.debug('[voice] ice', e.message));
      }
    } catch (e) { console.warn('[voice] signal', e); }
  }
  _onVoice(m) {
    const prev = this.peerVoice; this.peerVoice = !!m.on; this.peerMuted = !!m.muted;
    if (!m.on) {
      this.peerSpeaking = false;
      if (prev) { this._closePc(); this.conn = this.micOn ? 'connecting' : 'idle'; if (this.init && this.micOn) { this._ensurePc(); this._attachTrack(); } }
    } else if (!this.optOut) {
      // BIN: dựng offer mới khi đối phương vào lại / yêu cầu (req); VY: chỉ chuẩn bị nhận
      if (this.init && (m.req || !prev || !this.pc)) { this._closePc(); this._ensurePc(); this._attachTrack(); }
      else if (!this.init && !prev && this.pc) { this._closePc(); }
    }
    this._upd();
  }
  _peerGone() {
    const had = this.peerVoice; this.peerVoice = false; this.peerSpeaking = false;
    if (this.pc) { this._closePc(); this.conn = this.micOn ? 'connecting' : 'idle'; }
    this._upd();
  }

  // ---- chỉ báo đang nói (AnalyserNode, ngưỡng có trễ) ----
  _meter(who, stream) {
    try {
      this._ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
      if (this._an[who]) { try { this._an[who].src.disconnect(); } catch (e) {} }
      const src = this._ctx.createMediaStreamSource(stream), an = this._ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      this._an[who] = {src, an, buf: new Uint8Array(an.fftSize), on: false, hold: 0};
      if (!this._lvT) this._lvT = setInterval(() => this._level(), 100);
    } catch (e) { console.warn('[voice] meter', e); }
  }
  _level() {
    let ch = false;
    for (const who of ['me', 'peer']) {
      const a = this._an[who]; if (!a) continue;
      a.an.getByteTimeDomainData(a.buf); let s = 0; for (let i = 0; i < a.buf.length; i++) { const v = (a.buf[i] - 128) / 128; s += v * v; }
      const rms = Math.sqrt(s / a.buf.length);
      let on = a.on;
      if (rms > 0.03) { on = true; a.hold = 4; } else if (a.hold > 0) a.hold--; else on = false;
      if (who === 'me' && this.muted) on = false;
      if (on !== a.on) { a.on = on; ch = true; if (who === 'me') this.speaking = on; else this.peerSpeaking = on; }
    }
    if (ch) this._upd();
  }
  _stopMeters() { clearInterval(this._lvT); this._lvT = null; for (const k in this._an) { try { this._an[k].src.disconnect(); } catch (e) {} } this._an = {}; if (this._ctx) { this._ctx.close().catch(() => {}); this._ctx = null; } }

  // thống kê cho benchmark
  async stats() {
    if (!this.pc) return null; const out = {}; (await this.pc.getStats()).forEach(r => {
      if (r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'audio') { out.bytesIn = r.bytesReceived; out.jitter = r.jitter; out.lost = r.packetsLost; }
      if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) out.rtt = r.currentRoundTripTime;
    }); return out;
  }
  destroy() { this.leave(); }
}
