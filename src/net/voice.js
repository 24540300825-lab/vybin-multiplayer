// Cuộc gọi 2 người bằng WebRTC: ÂM THANH + HÌNH ẢNH. Tín hiệu (offer/answer/ICE) đi qua kênh Broadcast của Supabase;
// âm thanh/hình đi P2P (hoặc qua TURN nếu mạng chặn) — KHÔNG đi qua Supabase, KHÔNG ghi lại, KHÔNG lưu.
//
// Nguyên tắc:
// - Chỉ xin quyền mic/camera khi người dùng bấm. Tắt => dừng track + giải phóng thiết bị.
// - Tránh glare bằng vai trò cố định: slot BIN luôn là bên tạo offer; VY chỉ trả lời (và gửi `req` khi cần dựng lại).
// - Mất TÍN HIỆU (Supabase rớt) KHÔNG làm chết cuộc gọi: media chỉ phụ thuộc trạng thái ICE của chính nó.
// - Mất MEDIA: chờ ngắn → ICE restart → dựng lại hẳn → báo "mất kết nối" nhưng vẫn tự thử lại khi đối phương còn trong phòng.
// - 1 RTCPeerConnection duy nhất; mọi thông điệp tín hiệu được xử lý tuần tự (hàng đợi) để không tạo trùng.
// - Âm thanh ưu tiên cao nhất: mạng yếu thì hạ chất lượng hình, rồi tạm dừng hình, giữ tiếng.
// - Không dùng canvas/WebGL/vòng render 3D: chỉ <audio>/<video> và setInterval thưa.
import {CONFIG} from '../config.js';

// Mức chất lượng hình (camera quay 960x540@24 rồi hạ bằng scaleResolutionDownBy)
export const LEVELS = [
  {id: 'high', label: 'Cao', scale: 1, fps: 24, kbps: 1100},
  {id: 'mid', label: 'Vừa', scale: 1.5, fps: 20, kbps: 500},
  {id: 'low', label: 'Thấp', scale: 2.25, fps: 15, kbps: 220},
];
const CAM = {width: {ideal: 960, max: 1280}, height: {ideal: 540, max: 720}, frameRate: {ideal: 24, max: 30}};
const MIC = {echoCancellation: true, noiseSuppression: true, autoGainControl: true};
const rid = () => Math.random().toString(36).slice(2, 10);
const sdp = d => (d && d.toJSON ? d.toJSON() : d);
// Giải thích lỗi quyền bằng lời dễ hiểu + chỉ rõ bước tiếp theo. perm = trạng thái quyền của trình duyệt ('granted'|'denied'|'prompt'|'').
const errText = (e, what, perm) => {
  const n = e && e.name, msg = String((e && e.message) || ''), W = what[0].toUpperCase() + what.slice(1);
  const why = ` [mã lỗi: ${n || '?'} — ${msg || '-'} — quyền: ${perm || '?'}]`;
  const r = errText0(e, what, perm, n, msg, W); return r + (/^Không mở được/.test(r) ? '' : why);
};
const errText0 = (e, what, perm, n, msg, W) => {
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    if (/system/i.test(msg)) return `Windows/máy đang chặn ${what} cho trình duyệt. Vào Cài đặt → Quyền riêng tư → ${what === 'camera' ? 'Camera' : 'Micrô'}, bật "Cho phép ứng dụng truy cập" và "Cho phép ứng dụng trên máy tính truy cập", rồi bấm Bật lại.`;
    if (perm === 'denied') return `Trình duyệt đang chặn ${what} cho trang này. Bấm biểu tượng 🔒 cạnh thanh địa chỉ → ${W} → Cho phép, rồi bấm Bật lại.`;
    return `Chưa được cấp quyền ${what} (bạn chưa bấm "Cho phép" hoặc hộp hỏi bị tắt). Bấm Bật ${what} lần nữa và chọn Cho phép.`;
  }
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return `Không thấy ${what}. Kiểm tra đã cắm/bật ${what} chưa, hoặc chọn thiết bị khác trong ⚙.`;
  if (n === 'NotSupportedError') return `Không dùng được ${what} (trình duyệt không hỗ trợ hoặc trang không có HTTPS).`;
  if (n === 'NotReadableError' || n === 'AbortError') return `${W} đang được ứng dụng hoặc cửa sổ khác dùng (vd. cửa sổ trình duyệt thứ 2, Zoom, Teams). Tắt chúng đi rồi bấm Bật lại.`;
  return msg || `Không mở được ${what}`;
};
const permState = async n => { try { return (await navigator.permissions.query({name: n})).state; } catch (e) { return ''; } };

export class Voice {
  constructor(sess) {
    this.s = sess; this.h = {}; this.pc = null; this.init = sess.slot === 'bin';
    // thiết bị
    this.micStream = null; this.micTrack = null; this.camStream = null; this.camTrack = null; this.micId = ''; this.camId = '';
    this.audioEl = null; this.remoteAudio = null; this.remoteVideo = null; this.txA = null; this.txV = null;
    // trạng thái cuộc gọi
    this.active = false; this.asking = false; this.micOn = false; this.camOn = false; this.muted = false;
    this.micErr = ''; this.camErr = ''; this.peerMuted = false; this.peerVoice = false; this.peerCam = false; this.peerViewing = true;
    this.conn = 'idle';            // idle|connecting|connected|recovering|lost  (CHỈ nói về media)
    this.weak = false; this.speaking = false; this.peerSpeaking = false; this.turnOk = null;
    this.viewing = true;           // mình có đang xem hình không (tab hiện + panel mở) — để bên kia ngừng gửi hình
    this.quality = 'auto'; this.level = 0; this._vPause = false; this._bad = 0; this._good = 0; this._worst = 0;
    this.endedUntil = 0;
    // thống kê / chẩn đoán
    this.diag = this._newDiag(); this.connectedAt = 0; this._joinAt = 0; this._downAt = 0;
    // nội bộ
    this.gen = ''; this.rgen = ''; this.iceServers = null; this._iceAt = 0; this._pendingIce = []; this._making = false;
    this._q = Promise.resolve(); this._wd = null; this._wdStep = 0; this._ctx = null; this._an = {}; this._lvT = null;
    this._statsT = null; this._statsTick = 0; this._prev = null; this._iceT = null; this._endT = null; this._unsub = [];

    sess.on('msg', m => { if (m.k === 'sig') this._enq(() => this._onSig(m)); else if (m.k === 'voice') this._enq(() => this._onVoice(m)); });
    sess.on('peer', ({present}) => this._enq(() => present ? this._hello() : this._peerGone()));
    sess.on('reconnected', () => this._enq(() => this._hello()));
    sess.on('status', () => this._upd());                       // trạng thái tín hiệu thay đổi => cập nhật UI, KHÔNG đụng media
  }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); }
  emit(ev, a) { (this.h[ev] || []).forEach(f => { try { f(a); } catch (e) { console.error(e); } }); }
  _enq(fn) { this._q = this._q.then(fn).catch(e => console.warn('[call]', e)); return this._q; }
  _note(t) { this.emit('note', t); }
  get listening() { return !!this.pc; }
  get sigOk() { return this.s.state === 'online'; }
  get phase() {
    if (this.asking) return 'asking';
    if (Date.now() < this.endedUntil && !this.active && !this.pc) return 'ended';
    if (!this.active && !this.pc) return 'idle';
    if (!this.pc) return this.peerVoice ? 'connecting' : 'waiting';
    if (this.conn === 'lost') return 'lost';
    if (this.conn === 'recovering') return 'recovering';
    if (this.conn === 'connected') return this.weak ? 'weak' : 'connected';
    return 'connecting';
  }
  state() {
    return {active: this.active, asking: this.asking, listening: !!this.pc, micOn: this.micOn, camOn: this.camOn, muted: this.muted, peerMuted: this.peerMuted,
      peerVoice: this.peerVoice, peerCam: this.peerCam, conn: this.conn, phase: this.phase, weak: this.weak, sigOk: this.sigOk, speaking: this.speaking,
      peerSpeaking: this.peerSpeaking, micErr: this.micErr, camErr: this.camErr, quality: this.quality, level: this.level, vPause: this._vPause, turn: this.turnOk,
      connectedAt: this.connectedAt, viewing: this.viewing};
  }
  _upd() { this.emit('state', this.state()); }
  _newDiag() { return {rtt: null, lossIn: null, jitter: null, kbpsAudioIn: 0, kbpsVideoIn: 0, kbpsVideoOut: 0, fpsIn: 0, fpsOut: 0, resIn: '', resOut: '', ice: '', route: '', connectMs: null, reconnects: 0, interruptMs: 0, limit: '', codec: ''}; }

  // ---------- ICE servers: STUN công cộng + TURN thông tin ngắn hạn do backend cấp (không có bí mật trong trình duyệt) ----------
  async _loadIce(force) {
    const now = Date.now();
    if (!force && this.iceServers && now - this._iceAt < 40 * 60e3) return;
    const servers = [...CONFIG.ice]; if (CONFIG.turn && CONFIG.turn.urls) servers.push(CONFIG.turn);
    let ok = false;
    try {
      const {data: {session}} = await this.s.sb.auth.getSession();
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 4000);
      try {
        const r = await fetch('/api/turn?room=' + encodeURIComponent(this.s.room), {headers: {Authorization: 'Bearer ' + (session && session.access_token)}, signal: ac.signal, cache: 'no-store'});
        if (r.ok) { const j = await r.json(); if (j.iceServers && j.iceServers.length) { servers.push(...j.iceServers); ok = true; } }
      } finally { clearTimeout(to); }
    } catch (e) { /* không có TURN => chỉ STUN */ }
    this.turnOk = ok; this.iceServers = servers; this._iceAt = now;
  }
  async _refreshIce() {
    await this._loadIce(true);
    if (this.pc) { try { const c = this.pc.getConfiguration(); c.iceServers = this.iceServers; this.pc.setConfiguration(c); } catch (e) { console.warn('[call] setConfiguration', e); } }
  }

  // ---------- thông báo trạng thái cho đối phương ----------
  _announce(extra) {
    return this.s.send({k: 'voice', on: this.active ? 1 : 0, muted: this.muted, cam: this.camOn ? 1 : 0, view: this.viewing ? 1 : 0, ...extra});
  }
  _mediaHealthy() { return !!this.pc && this.conn === 'connected'; }
  get _wantPc() { return this.active || this.peerVoice; }

  // đối phương (mới) xuất hiện / kênh tín hiệu nối lại: báo trạng thái; KHÔNG dựng lại nếu media đang tốt
  async _hello() {
    if (this.active || this.pc) this._announce({req: !this.init && !this._mediaHealthy() && this.active ? 1 : 0});
    if (this.init && this._wantPc && this.s.peer && !this.pc) await this._rebuild();
    else if (this.pc && this.conn === 'lost') { this._wdStep = 1; this._schedule(300); }     // đối phương vừa quay lại: thử dựng lại ngay
  }

  // ---------- người dùng bấm ----------
  async join({mic = true, cam = false} = {}) {
    if (this.active || this.asking) return true;
    this.asking = true; this.micErr = this.camErr = ''; this._joinAt = performance.now(); this.diag = this._newDiag(); this._prev = null;
    const healthy = this._mediaHealthy(); this.connectedAt = healthy ? Date.now() : 0; if (healthy) this.diag.connectMs = 0;
    this._upd();
    const iceP = this._loadIce();      // chạy song song với hộp thoại xin quyền
    try {
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { this.micErr = 'Trình duyệt không hỗ trợ mic/camera (cần HTTPS).'; mic = cam = false; }
      if (mic) await this._startMic();
      if (cam) await this._startCam();
      await iceP;
    } finally { this.asking = false; }
    this.active = true; this._startWatch();
    this._announce({req: !this.init && !this._mediaHealthy() ? 1 : 0});
    this._enq(async () => { if (this.init && this.s.peer && !this.pc) await this._rebuild(); else if (this.pc) { this._attachAll(); } });
    this._upd();
    if (this.micErr) this._note(this.micErr); if (this.camErr) this._note(this.camErr);
    return true;
  }
  // Đổi map / F5 = tải lại trang => cuộc gọi bị đứt vài giây. Ghi lại ý định để TỰ vào lại sau khi tải xong (chỉ khi quyền mic/camera đã được cấp từ trước).
  _saveResume() { if (!this.active) return; try { sessionStorage.setItem('vyCall', JSON.stringify({t: Date.now(), mic: this.micOn || !!this.micErr, cam: this.camOn})); } catch (e) {} }
  async resume() {
    let r = null; try { r = JSON.parse(sessionStorage.getItem('vyCall')); sessionStorage.removeItem('vyCall'); } catch (e) {}
    if (!r || Date.now() - r.t > 60000 || this.active) return false;
    const granted = async n => { try { return (await navigator.permissions.query({name: n})).state === 'granted'; } catch (e) { return false; } };
    const mic = !!r.mic && await granted('microphone'), cam = !!r.cam && await granted('camera');
    await this.join({mic, cam});
    if ((r.mic && !mic) || (r.cam && !cam)) this._note('Cuộc gọi đã nối lại — bấm Bật mic / Bật camera để dùng tiếp');
    else this._note('Đã nối lại cuộc gọi');
    return true;
  }
  leave(reason) {
    if (reason === 'reload') this._saveResume();
    const had = this.active || !!this.pc;
    this.active = false; this.asking = false; this.speaking = false; this.peerSpeaking = false; this.weak = false;
    this._stopCam(); this._stopMic(); this._stopWatch(); this._closePc(); this._stopMeters();
    this.conn = 'idle'; this.micErr = this.camErr = ''; this.peerVoice = false; this.peerCam = false; this.connectedAt = 0;
    if (had) { try { this.s.send(reason === 'reload' ? {k: 'voice', on: 0, rl: 1} : {k: 'voice', on: 0}); } catch (e) {} this.endedUntil = Date.now() + 3500; clearTimeout(this._endT); this._endT = setTimeout(() => this._upd(), 3600); }
    this._upd();
  }
  async toggleMic() {            // bật/tắt HẲN micro (giải phóng thiết bị); khác với tắt tiếng
    if (this.micOn) { this._stopMic(); this._attachAll(); this._announce(); this._upd(); return; }
    if (!this.active) return this.join({mic: true});
    await this._startMic(); this._attachAll(); this._announce(); this._upd(); if (this.micErr) this._note(this.micErr);
  }
  setMuted(v) { this.muted = !!v; if (this.micTrack) this.micTrack.enabled = !this.muted; this._announce(); this._upd(); }
  toggleMute() { if (!this.micOn) return this.toggleMic(); this.setMuted(!this.muted); }
  async setCamera(on) {
    if (on) {
      if (!this.active) return this.join({mic: true, cam: true});
      if (this.camOn) return;
      await this._startCam(); this._attachAll(); this._applyVideo(); this._announce(); this._upd(); if (this.camErr) this._note(this.camErr);
    } else { this._stopCam(); this._attachAll(); this._announce(); this._upd(); }
  }
  toggleCamera() { return this.setCamera(!this.camOn); }
  setViewing(v) { v = !!v; if (v === this.viewing) return; this.viewing = v; this._announce(); this._upd(); }
  setQuality(q) { this.quality = q; if (q !== 'auto') this.level = Math.max(0, LEVELS.findIndex(l => l.id === q)); this._bad = this._good = this._worst = 0; this._vPause = false; this._applyVideo(); this._upd(); }

  // ---------- thiết bị ----------
  async devices() {
    try { const l = await navigator.mediaDevices.enumerateDevices(); const f = k => l.filter(d => d.kind === k && d.deviceId).map(d => ({id: d.deviceId, label: d.label || (k === 'audioinput' ? 'Micro' : 'Camera')})); return {mics: f('audioinput'), cams: f('videoinput')}; }
    catch (e) { return {mics: [], cams: []}; }
  }
  async _startMic(deviceId) {
    this._stopMic();
    try {
      const a = {...MIC}; const id = deviceId || this.micId; if (id) a.deviceId = {exact: id};
      let st; try { st = await navigator.mediaDevices.getUserMedia({audio: a, video: false}); }
      catch (e) { if (id && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) { this.micId = ''; st = await navigator.mediaDevices.getUserMedia({audio: MIC, video: false}); } else throw e; }
      this.micStream = st; this.micTrack = st.getAudioTracks()[0]; this.micTrack.enabled = !this.muted; this.micId = (this.micTrack.getSettings() || {}).deviceId || id || '';
      this.micTrack.onended = () => this._micLost();
      this.micOn = true; this.micErr = ''; this._meter('me', st);
    } catch (e) { this.micOn = false; this.micErr = errText(e, 'micro', await permState('microphone')); }
  }
  _stopMic() { if (this.micStream) { this.micStream.getTracks().forEach(t => { t.onended = null; t.stop(); }); } this.micStream = null; this.micTrack = null; this.micOn = false; this.speaking = false; if (this._an.me) { try { this._an.me.src.disconnect(); } catch (e) {} delete this._an.me; } }
  async _micLost() {     // rút micro / thiết bị bị ngắt: thử lại bằng micro mặc định 1 lần, không được thì báo lỗi (cuộc gọi vẫn còn)
    this._stopMic(); this.micErr = 'Micro bị ngắt — đang thử micro khác…'; this._upd();
    this.micId = ''; await this._startMic();
    if (this.micOn) { this._note('Đã chuyển sang micro khác'); this._attachAll(); } else { this.micErr = 'Micro bị ngắt. Cắm lại hoặc chọn micro khác.'; this._note(this.micErr); }
    this._announce(); this._upd();
  }
  async _startCam(deviceId) {
    this._stopCam();
    try {
      const v = {...CAM}; const id = deviceId || this.camId; if (id) v.deviceId = {exact: id};
      let st; try { st = await navigator.mediaDevices.getUserMedia({audio: false, video: v}); }
      catch (e) { if (id && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) { this.camId = ''; st = await navigator.mediaDevices.getUserMedia({audio: false, video: CAM}); } else throw e; }
      this.camStream = st; this.camTrack = st.getVideoTracks()[0]; this.camId = (this.camTrack.getSettings() || {}).deviceId || id || '';
      try { this.camTrack.contentHint = 'motion'; } catch (e) {}
      this.camTrack.onended = () => { this._stopCam(); this.camErr = 'Camera bị ngắt. Cắm lại rồi bật lại.'; this._attachAll(); this._announce(); this._note(this.camErr); this._upd(); };
      this.camOn = true; this.camErr = '';
    } catch (e) { this.camOn = false; this.camErr = errText(e, 'camera', await permState('camera')); }
  }
  _stopCam() { if (this.camStream) this.camStream.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.camStream = null; this.camTrack = null; this.camOn = false; }
  async switchMic(id) { if (!this.active) { this.micId = id; return; } await this._startMic(id); this._attachAll(); this._announce(); this._upd(); if (this.micErr) this._note(this.micErr); }
  async switchCam(id) { if (!this.camOn) { this.camId = id; return; } await this._startCam(id); this._attachAll(); this._applyVideo(); this._announce(); this._upd(); if (this.camErr) this._note(this.camErr); }

  // ---------- quan sát: đổi thiết bị, ẩn/hiện tab, dọn dẹp khi rời ----------
  _on(t, ev, fn) { t.addEventListener(ev, fn); this._unsub.push(() => t.removeEventListener(ev, fn)); }
  _startWatch() {
    this._stopWatch();
    this._on(navigator.mediaDevices || document, 'devicechange', () => this.emit('devices'));
    this._on(document, 'visibilitychange', () => this.setViewing(!document.hidden && this._panelOpen !== false));
    this._statsT = setInterval(() => this._pollStats(), 2000);
    this._iceT = setInterval(() => { if (this.active) this._refreshIce().catch(() => {}); }, 45 * 60e3);   // làm mới thông tin TURN ngắn hạn
  }
  _stopWatch() { this._unsub.splice(0).forEach(f => { try { f(); } catch (e) {} }); clearInterval(this._statsT); this._statsT = null; clearInterval(this._iceT); this._iceT = null; clearTimeout(this._wd); this._wd = null; }
  setPanelOpen(v) { this._panelOpen = !!v; this.setViewing(!document.hidden && !!v); }

  // ---------- WebRTC ----------
  _newPc() {
    const pc = this.pc = new RTCPeerConnection({iceServers: this.iceServers || CONFIG.ice, bundlePolicy: 'max-bundle'});
    if (this.conn === 'idle' || this.conn === 'connected') this.conn = 'connecting';
    this._pendingIce = []; this._making = false;
    if (this.init) { this.txA = pc.addTransceiver('audio', {direction: 'sendrecv'}); this.txV = pc.addTransceiver('video', {direction: 'sendrecv'}); } else { this.txA = this.txV = null; }
    if (this.init) this.gen = rid();
    pc.onicecandidate = e => { if (e.candidate && pc === this.pc) this.s.send({k: 'sig', t: 'ice', g: this.init ? this.gen : this.rgen, c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate}); };
    pc.ontrack = e => { if (pc === this.pc) this._onRemote(e); };
    pc.onnegotiationneeded = async () => {
      if (!this.init || pc !== this.pc) return;
      try { this._making = true; await pc.setLocalDescription(); if (pc === this.pc) this.s.send({k: 'sig', t: 'desc', g: this.gen, d: sdp(pc.localDescription)}); }
      catch (e) { console.warn('[call] negotiate', e); } finally { this._making = false; }
    };
    pc.oniceconnectionstatechange = () => { if (pc === this.pc) this._onIce(pc); };
    return pc;
  }
  async _rebuild() {       // BIN: dựng lại hẳn (1 pc duy nhất)
    if (!this.init) return;
    this._closePc(false);
    if (!this.iceServers) await this._loadIce();
    this._newPc(); this._attachAll(); this._applyAudio(); this._upd();
  }
  _attachAll() {
    const a = this.txA && this.txA.sender, v = this.txV && this.txV.sender;
    if (a) a.replaceTrack(this.micTrack || null).catch(e => console.warn('[call] replaceTrack a', e));
    if (v) v.replaceTrack(this.camTrack || null).then(() => this._applyVideo()).catch(e => console.warn('[call] replaceTrack v', e));
  }
  _applyAudio() {
    const s = this.txA && this.txA.sender; if (!s || !s.getParameters) return;
    try { const p = s.getParameters(); if (!p.encodings || !p.encodings.length) return; p.encodings[0].maxBitrate = 48000; p.encodings[0].priority = 'high'; p.encodings[0].networkPriority = 'high'; s.setParameters(p).catch(() => {}); } catch (e) {}
  }
  // áp mức chất lượng hình + tạm dừng gửi hình khi bên kia không xem / mạng quá yếu
  _applyVideo() {
    const s = this.txV && this.txV.sender; if (!s || !s.getParameters) return;
    try {
      const p = s.getParameters(); if (!p.encodings || !p.encodings.length) return;
      const L = LEVELS[this.level], e = p.encodings[0];
      e.active = this.camOn && this.peerViewing && !this._vPause;
      e.maxBitrate = L.kbps * 1000; e.scaleResolutionDownBy = L.scale; e.maxFramerate = L.fps; e.priority = 'low'; e.networkPriority = 'low';
      s.setParameters(p).catch(() => { try { const q = s.getParameters(); q.encodings[0].active = e.active; q.encodings[0].maxBitrate = e.maxBitrate; s.setParameters(q).catch(() => {}); } catch (x) {} });
    } catch (e) { console.debug('[call] applyVideo', e); }
  }
  _closePc(clearMedia = true) {
    clearTimeout(this._wd); this._wd = null; this._wdStep = 0;
    if (this.pc) { const pc = this.pc; pc.onicecandidate = pc.ontrack = pc.onnegotiationneeded = pc.oniceconnectionstatechange = null; try { pc.close(); } catch (e) {} this.pc = null; }
    this.txA = this.txV = null; this._pendingIce = []; this._making = false; this._prev = null;
    if (clearMedia) this.rgen = '';
    if (this.audioEl) { this.audioEl.srcObject = null; this.audioEl.remove(); this.audioEl = null; }
    if (this._an.peer) { try { this._an.peer.src.disconnect(); } catch (e) {} delete this._an.peer; }
    this.remoteAudio = this.remoteVideo = null; this.weak = false; this.emit('video', null);
    if (this.conn !== 'lost') this.conn = this.active ? 'connecting' : 'idle';
  }
  _onRemote(e) {
    const t = e.track;
    if (t.kind === 'audio') {
      this.remoteAudio = new MediaStream([t]);
      if (!this.audioEl) { const a = this.audioEl = document.createElement('audio'); a.autoplay = true; a.playsInline = true; a.style.display = 'none'; document.body.appendChild(a); }
      this.audioEl.srcObject = this.remoteAudio; this.audioEl.play().catch(() => this.emit('needGesture'));
      this._meter('peer', this.remoteAudio);
    } else if (t.kind === 'video') {
      this.remoteVideo = new MediaStream([t]); this.emit('video', this.remoteVideo);
    }
    this._upd();
  }

  // ---------- theo dõi kết nối media: chờ ngắn → ICE restart → dựng lại → báo mất, vẫn tự thử lại ----------
  _onIce(pc) {
    const st = pc.iceConnectionState;
    if (st === 'connected' || st === 'completed') {
      clearTimeout(this._wd); this._wd = null; this._wdStep = 0;
      if (this._downAt) { this.diag.interruptMs += Date.now() - this._downAt; this.diag.reconnects++; this._downAt = 0; }
      if (!this.connectedAt) { this.connectedAt = Date.now(); this.diag.connectMs = Math.round(performance.now() - this._joinAt); }
      if (this.conn !== 'connected') { this.conn = 'connected'; this._applyAudio(); this._applyVideo(); }
    } else if (st === 'disconnected') {
      this._markDown(); this._schedule(2500);     // có thể chỉ là chớp mạng: chờ chút rồi mới can thiệp
    } else if (st === 'failed') {
      this._markDown(); this._schedule(0);
    }
    this._upd();
  }
  _markDown() { if (!this._downAt) this._downAt = Date.now(); if (this.conn !== 'lost') this.conn = 'recovering'; }
  _schedule(ms) { clearTimeout(this._wd); this._wd = setTimeout(() => this._enq(() => this._recover()), ms); }
  async _recover() {
    const pc = this.pc; if (!pc || !this._wantPc) return;
    const st = pc.iceConnectionState; if (st === 'connected' || st === 'completed') { this._wdStep = 0; this._onIce(pc); return; }     // đã tự khỏi
    const step = ++this._wdStep;
    if (step >= 2 && !this.s.peer) { this.conn = 'lost'; this._wdStep = 1; this._upd(); this._schedule(15000); return; }   // đối phương không còn trong phòng: đợi, không phát tín hiệu vô ích
    if (step === 1) {                      // 1) ICE restart (đổi cả TURN nếu hết hạn)
      this._refreshIce().catch(() => {});
      if (this.init) { try { pc.restartIce(); } catch (e) { console.warn(e); } } else this._announce({req: 2});
      this._schedule(12000);
    } else if (step === 2) {               // 2) dựng lại hẳn
      if (this.init) await this._rebuild(); else this._announce({req: 1});
      this._schedule(20000);
    } else {                               // 3) báo mất, vẫn thử lại định kỳ khi đối phương còn trong phòng
      this.conn = 'lost'; this._upd(); this._note('Mất kết nối cuộc gọi — đang thử lại…');
      this._wdStep = 1; this._schedule(15000);     // lần sau quay về bước 2 (dựng lại)
    }
    this._upd();
  }

  // ---------- tín hiệu ----------
  async _onSig(m) {
    if (!this._wantPc) return;
    if (m.t === 'desc') {
      const d = m.d;
      if (d.type === 'offer') {
        if (this.init) return;
        if (!this.iceServers) await this._loadIce();
        if (!this.pc || m.g !== this.rgen) {                 // offer của "thế hệ" mới (đối phương dựng lại/tải lại) => bỏ pc cũ
          this._closePc(false); this.rgen = m.g; this._newPc(); this._upd();
        }
        const pc = this.pc;
        await pc.setRemoteDescription(d);
        for (const c of this._pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        for (const t of pc.getTransceivers()) {
          const k = t.receiver && t.receiver.track && t.receiver.track.kind;
          if (k === 'audio') { this.txA = t; t.direction = 'sendrecv'; } else if (k === 'video') { this.txV = t; t.direction = 'sendrecv'; }
        }
        this._attachAll(); this._applyAudio();
        await pc.setLocalDescription();
        this.s.send({k: 'sig', t: 'desc', g: this.rgen, d: sdp(pc.localDescription)});
      } else if (d.type === 'answer') {
        const pc = this.pc; if (!pc || !this.init || m.g !== this.gen || pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription(d);
        for (const c of this._pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      }
    } else if (m.t === 'ice') {
      const pc = this.pc; if (!pc) return;
      if (m.g !== (this.init ? this.gen : this.rgen)) return;   // ICE của pc cũ
      if (!pc.remoteDescription) { this._pendingIce.push(m.c); return; }
      await pc.addIceCandidate(m.c).catch(e => console.debug('[call] ice', e.message));
    }
  }
  async _onVoice(m) {
    const prev = this.peerVoice, prevCam = this.peerCam, prevView = this.peerViewing;
    this.peerVoice = !!m.on; this.peerMuted = !!m.muted; this.peerCam = !!m.cam; if ('view' in m) this.peerViewing = !!m.view;
    if (!m.on) {
      this.peerSpeaking = false; this.peerCam = false;
      if (prev) {             // đối phương kết thúc cuộc gọi
        this._closePc(); if (!this.active) this.conn = 'idle';
        this._note(m.rl ? 'Đối phương đang tải lại trang (đổi map?) — sẽ tự nối lại' : 'Đối phương đã kết thúc cuộc gọi'); this.emit('peerEnded');
      }
    } else if (this.init) {
      // BIN: chỉ dựng offer khi cần. Tín hiệu nối lại / cập nhật mic-cam KHÔNG làm gián đoạn media đang tốt.
      if (this.s.peer && this._wantPc) {
        if (m.req === 1 || !this.pc) await this._rebuild();
        else if (m.req === 2) { try { this._refreshIce().catch(() => {}); this.pc.restartIce(); } catch (e) {} }
        else if (!prev && this.conn !== 'connected') await this._rebuild();
      }
    }
    if (this.peerViewing !== prevView || this.peerCam !== prevCam) this._applyVideo();
    this._upd();
  }
  _peerGone() {
    // đối phương rời phòng (presence) — nếu mới chớp thì họ sẽ quay lại và tự báo; nếu thật sự đi thì giải phóng pc
    this.peerSpeaking = false;
    if (this.pc && !this.peerVoice) this._closePc();     // còn đang trong cuộc gọi thì để ICE tự báo (chớp presence không được làm đứt media)
    this._upd();
  }

  // ---------- chỉ báo đang nói (AnalyserNode, ngưỡng có trễ) ----------
  _meter(who, stream) {
    try {
      this._ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
      if (this._an[who]) { try { this._an[who].src.disconnect(); } catch (e) {} }
      const src = this._ctx.createMediaStreamSource(stream), an = this._ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      this._an[who] = {src, an, buf: new Uint8Array(an.fftSize), on: false, hold: 0};
      if (!this._lvT) this._lvT = setInterval(() => this._level(), 100);
    } catch (e) { console.warn('[call] meter', e); }
  }
  _level() {
    if (document.hidden) return;
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

  // ---------- thống kê (getStats) → chẩn đoán + tự hạ/nâng chất lượng ----------
  async stats() {
    if (!this.pc) return null;
    const out = {}, rep = await this.pc.getStats(), now = performance.now(), cur = {};
    let pair = null; const cands = {};
    rep.forEach(r => {
      if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') pair = r;
      if (r.type === 'local-candidate' || r.type === 'remote-candidate') cands[r.id] = r;
      if (r.type === 'inbound-rtp') {
        const k = r.kind || r.mediaType;
        if (k === 'audio') { cur.aIn = r.bytesReceived; out.jitter = r.jitter; cur.aLost = r.packetsLost; cur.aRcv = r.packetsReceived; }
        if (k === 'video') { cur.vIn = r.bytesReceived; cur.vFr = r.framesDecoded; cur.vLost = r.packetsLost; cur.vRcv = r.packetsReceived; out.resIn = r.frameWidth ? r.frameWidth + 'x' + r.frameHeight : ''; }
      }
      if (r.type === 'outbound-rtp' && (r.kind || r.mediaType) === 'video') { cur.vOut = r.bytesSent; cur.vFrOut = r.framesEncoded; out.resOut = r.frameWidth ? r.frameWidth + 'x' + r.frameHeight : ''; out.limit = r.qualityLimitationReason || ''; }
    });
    if (pair) {
      out.rtt = pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null;
      const lc = cands[pair.localCandidateId], rc = cands[pair.remoteCandidateId];
      out.route = [lc && lc.candidateType, rc && rc.candidateType].filter(Boolean).join('→') + (lc && lc.relayProtocol ? ' (' + lc.relayProtocol + ')' : '');
    }
    const p = this._prev; this._prev = {t: now, ...cur};
    if (p) {
      const dt = (now - p.t) / 1000 || 1, kb = (a, b) => a != null && b != null ? Math.max(0, Math.round((a - b) * 8 / dt / 1000)) : 0, fps = (a, b) => a != null && b != null ? Math.max(0, Math.round((a - b) / dt)) : 0;
      out.kbpsAudioIn = kb(cur.aIn, p.aIn); out.kbpsVideoIn = kb(cur.vIn, p.vIn); out.kbpsVideoOut = kb(cur.vOut, p.vOut); out.fpsIn = fps(cur.vFr, p.vFr); out.fpsOut = fps(cur.vFrOut, p.vFrOut);
      const lost = (cur.aLost || 0) - (p.aLost || 0) + (cur.vLost || 0) - (p.vLost || 0), rcv = (cur.aRcv || 0) - (p.aRcv || 0) + (cur.vRcv || 0) - (p.vRcv || 0);
      out.lossIn = rcv + lost > 5 ? Math.max(0, Math.round(lost / (rcv + lost) * 1000) / 10) : 0;
    }
    return out;
  }
  async _pollStats() {
    if (!this.pc || this.conn !== 'connected') return;
    if (document.hidden && (++this._statsTick % 3)) return;           // tab ẩn: thưa hơn
    let s; try { s = await this.stats(); } catch (e) { return; }
    if (!s) return;
    const d = this.diag; d.ice = this.pc.iceConnectionState;
    for (const k of ['rtt', 'lossIn', 'kbpsAudioIn', 'kbpsVideoIn', 'kbpsVideoOut', 'fpsIn', 'fpsOut', 'resIn', 'resOut', 'route', 'limit']) if (s[k] !== undefined) d[k] = s[k];
    if (s.jitter != null) d.jitter = Math.round(s.jitter * 1000);
    const bad = (s.rtt != null && s.rtt > 450) || (s.lossIn != null && s.lossIn > 6) || (d.jitter != null && d.jitter > 80);
    const good = (s.rtt == null || s.rtt < 250) && (s.lossIn == null || s.lossIn < 2) && (d.jitter == null || d.jitter < 40);
    if (bad) { this._bad++; this._good = 0; } else if (good) { this._good++; this._bad = 0; this._worst = 0; } else { this._bad = 0; }
    this._badRun = bad ? (this._badRun || 0) + 1 : good ? 0 : this._badRun;
    const weak = this._badRun >= 2; let changed = weak !== this.weak; this.weak = weak;
    // tự điều chỉnh (chỉ khi chế độ Auto): hạ nhanh, nâng chậm. Âm thanh luôn được ưu tiên: hết đường hạ thì tạm dừng hình.
    if (this.quality === 'auto' && this.camOn) {
      if (this._bad >= 2 && this.level < LEVELS.length - 1) { this.level++; this._bad = 0; this._applyVideo(); changed = true; }
      else if (this._bad >= 2 && this.level === LEVELS.length - 1 && !this._vPause && ++this._worst >= 3) { this._vPause = true; this._applyVideo(); this._note('Mạng yếu — tạm dừng hình để giữ tiếng'); changed = true; }
      else if (this._good >= 10) { this._good = 0; if (this._vPause) { this._vPause = false; this._worst = 0; this._applyVideo(); changed = true; } else if (this.level > 0) { this.level--; this._applyVideo(); changed = true; } }
    }
    this.emit('stats', {...d, duration: this.connectedAt ? Math.round((Date.now() - this.connectedAt) / 1000) : 0, level: this.level, vPause: this._vPause});
    if (changed) this._upd();
  }
  diagnostics() { const d = this.diag; return {...d, duration: this.connectedAt ? Math.round((Date.now() - this.connectedAt) / 1000) : 0, level: this.level, vPause: this._vPause, turn: this.turnOk, sig: this.s.state, media: this.conn}; }
  destroy() { this.leave(); }
}
