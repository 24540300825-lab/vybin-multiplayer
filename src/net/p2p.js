// Đường nối THẲNG giữa 2 máy (WebRTC DataChannel) cho dữ liệu game tần suất cao (vị trí, phím, lệnh).
// Vì sao: trước đây mọi gói vị trí đều đi vòng qua máy chủ Supabase (client → server → client) và bị giới hạn số tin/giây,
// nên chỉ gửi được ~8 lần/giây và trễ theo đường vòng → nhân vật kia giật, lướt quá đà rồi kéo ngược (rubber-band).
// Cách làm:
//  - Chỉ 2 người ⇒ 1 RTCPeerConnection, hai kênh "negotiated" (không cần bắt tay thêm):
//      fast  (id 0): không đảm bảo thứ tự, không gửi lại  → vị trí 's', phím 'i', ping  (gói cũ thì bỏ, luôn có gói mới hơn)
//      rel   (id 1): có thứ tự, đảm bảo đến                → lệnh 'c', 'hello', 'env' (ngồi/ngủ/…; mất là hỏng trạng thái)
//  - Tín hiệu bắt tay đi qua kênh Supabase sẵn có (k:'p2p'). BIN là bên tạo offer, VY trả lời.
//  - HOÀN TOÀN TUỲ CHỌN: chưa nối được / nối rồi mà im lặng >3s ⇒ session.send tự quay về đường Supabase cũ (không mất tính năng nào).
//  - Giọng nói/video vẫn dùng kết nối riêng của voice.js, không đụng tới.
import {CONFIG} from '../config.js';

const FAST = new Set(['s', 'i', 'ping', 'pong']);
const REL = new Set(['c', 'hello', 'env']);
const rid = () => Math.random().toString(36).slice(2, 8);
const DEAD_MS = 3000, PING_MS = 1000, RETRY_MS = 5000, MAX_TRIES = 6;

export class P2P {
  constructor(sess) {
    this.s = sess; this.pc = null; this.fast = null; this.rel = null; this.gen = '';
    this.pend = []; this.cand = {h: 0, s: 0, r: 0}; this.sig = {off: 0, ans: 0, ice: 0}; this.lastRx = 0; this.tries = 0; this._up = false; this._dead = false; this._madeAt = 0;
    this._offs = [sess.on('msg', m => { if (m.k === 'p2p') this._onSig(m); }),
      sess.on('peer', ({present}) => this._onPeer(present)),
      sess.on('reconnected', () => { this.tries = 0; this._onPeer(!!sess.peer); })];
    this._tm = setInterval(() => { this._tick(); const d = this.diag(); if (d !== this._lastDiag) { this._lastDiag = d; this.s.p2pDiag = d; this.s.emit('p2p', this._up); } }, 1000);
    this._pg = setInterval(() => { if (this.up() && !document.hidden) this.s.send({k: 'ping', t: performance.now()}); }, PING_MS);
    this._vis = () => { if (!document.hidden) { this.tries = 0; if (sess.peer && !this.up()) this._onPeer(true); } };
    document.addEventListener('visibilitychange', this._vis);
    if (sess.peer) this._onPeer(true);
  }
  get init() { return this.s.slot === 'bin'; }
  // đang dùng được: kênh mở và vừa nghe được gì đó từ đối phương qua kênh này
  up() { return !!(this.fast && this.rel && this.fast.readyState === 'open' && this.rel.readyState === 'open' && performance.now() - this.lastRx < DEAD_MS); }
  // thử gửi qua P2P; trả true nếu đã gửi (hoặc cố ý bỏ gói cũ), false => session gửi bằng đường Supabase
  route(m) {
    if (this._dead || !this.up()) return false;
    const k = m.k, ch = FAST.has(k) ? this.fast : REL.has(k) ? this.rel : null;
    if (!ch) return false;
    if (ch === this.fast && ch.bufferedAmount > 32768) return true;     // nghẽn: bỏ gói vị trí cũ
    try { ch.send(JSON.stringify(m)); return true; } catch (e) { return false; }
  }
  close() {
    this._dead = true; clearInterval(this._tm); clearInterval(this._pg); document.removeEventListener('visibilitychange', this._vis); this._offs.forEach(f => f()); this._teardown();
  }

  // Chẩn đoán ngắn hiện trên thẻ đối phương khi P2P chưa thông: bước tín hiệu + loại ứng viên mạng thu được (h=nội bộ, s=qua STUN, r=relay)
  diag() {
    if (this.up()) return 'ok';
    const pc = this.pc, c = this.cand, g = this.sig;
    if (!pc) return 'chưa dựng';
    return `${pc.iceConnectionState}/${pc.iceGatheringState} h${c.h} s${c.s} r${c.r}${this.turnOk ? '' : ' (chưa có TURN)'} · offer${g.off} ans${g.ans} ice${g.ice}${this.init ? '' : ' (vy)'}`;
  }
  _setUp(on) {
    on = !!on; if (on === this._up) return; this._up = on;
    this.s.p2pOn = on; this.s.emit('p2p', on);
  }
  _teardown() {
    const pc = this.pc; this.pc = null;
    for (const c of [this.fast, this.rel]) if (c) { c.onopen = c.onclose = c.onmessage = null; try { c.close(); } catch (e) {} }
    this.fast = this.rel = null;
    if (pc) { pc.onicecandidate = pc.onconnectionstatechange = pc.oniceconnectionstatechange = null; try { pc.close(); } catch (e) {} }
    this.lastRx = 0; this._setUp(false);
  }
  _onPeer(present) {
    if (this._dead) return;
    if (!present) { this._teardown(); this.tries = 0; return; }
    if (this.up()) return;
    if (this.init) setTimeout(() => { if (!this._dead && this.s.peer && !this.up()) this._make(); }, 300);
    else this.s.send({k: 'p2p', t: 'req'});          // VY nhắc BIN tạo offer (nếu BIN đã có mặt từ trước)
  }
  _tick() {
    if (this._dead || !this.s.peer) return;
    const open = this.fast && this.rel && this.fast.readyState === 'open' && this.rel.readyState === 'open';
    if (open && performance.now() - this.lastRx > DEAD_MS) { this._teardown(); this.tries++; }       // im lặng quá lâu ⇒ coi như chết, dựng lại
    if (this.up()) { this.tries = 0; this._setUp(true); return; }
    this._setUp(false);
    // đang dựng dở quá lâu ⇒ thử lại (có giới hạn để khỏi spam tín hiệu khi mạng chặn P2P hẳn, ví dụ NAT đối xứng không có TURN)
    if (performance.now() - this._madeAt > RETRY_MS && this.tries < MAX_TRIES) {
      this.tries++;
      if (this.init) this._make(); else this.s.send({k: 'p2p', t: 'req'});
    }
  }

  // STUN công cộng + TURN ngắn hạn do backend cấp (/api/turn, dùng chung nguồn với cuộc gọi). Chưa cấu hình TURN ⇒ chỉ STUN.
  async _ice() {
    const now = Date.now();
    if (this._servers && now - this._iceAt < 40 * 60e3) return this._servers;
    const servers = [...CONFIG.ice]; if (CONFIG.turn && CONFIG.turn.urls) servers.push(CONFIG.turn);
    this.turnOk = false;
    try {
      const {data: {session}} = await this.s.sb.auth.getSession();
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 4000);
      try {
        const r = await fetch('/api/turn?room=' + encodeURIComponent(this.s.room), {headers: {Authorization: 'Bearer ' + (session && session.access_token)}, signal: ac.signal, cache: 'no-store'});
        if (r.ok) { const j = await r.json(); if (j.iceServers && j.iceServers.length) { servers.push(...j.iceServers); this.turnOk = true; } }
      } finally { clearTimeout(to); }
    } catch (e) { /* chỉ STUN */ }
    this._servers = servers; this._iceAt = now; return servers;
  }
  _newPc(gen, servers) {
    this._teardown(); this.pend = this.pend.filter(x => x.g === gen);     // giữ ICE đã tới sớm của chính phiên này
    this.gen = gen; this._madeAt = performance.now();
    const pc = this.pc = new RTCPeerConnection({iceServers: servers || CONFIG.ice});
    this.fast = pc.createDataChannel('f', {negotiated: true, id: 0, ordered: false, maxRetransmits: 0});
    this.rel = pc.createDataChannel('r', {negotiated: true, id: 1, ordered: true});
    for (const ch of [this.fast, this.rel]) {
      ch.onmessage = ev => {
        this.lastRx = performance.now();
        if (!this._up && this.up()) this._setUp(true);
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        this.s._onMsg(m);
      };
      ch.onopen = () => {
        if (this.fast && this.rel && this.fast.readyState === 'open' && this.rel.readyState === 'open') {
          this.lastRx = performance.now(); this.tries = 0;
          this._setUp(true);
          this.s.send({k: 'ping', t: performance.now()});
        }
      };
      ch.onclose = () => { if (pc === this.pc) this._setUp(false); };
    }
    this.cand = {h: 0, s: 0, r: 0}; this.sig = {off: 0, ans: 0, ice: 0};
    pc.onicecandidate = e => { if (e.candidate && pc === this.pc) { const t = /typ (\w+)/.exec(e.candidate.candidate || ''); if (t) { const k = t[1] === 'host' ? 'h' : t[1] === 'srflx' ? 's' : t[1] === 'relay' ? 'r' : ''; if (k) this.cand[k]++; } } if (e.candidate && pc === this.pc) this.s.send({k: 'p2p', t: 'ice', g: gen, c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate}); };
    pc.onconnectionstatechange = () => { if (pc === this.pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) this._setUp(false); };
    return pc;
  }
  async _make() {
    if (this._dead || !this.init || typeof RTCPeerConnection === 'undefined') return;
    try {
      const servers = await this._ice(); if (this._dead) return;
      const pc = this._newPc(rid(), servers);
      const off = await pc.createOffer(); await pc.setLocalDescription(off);
      if (pc !== this.pc) return;
      this.sig.off++; this.s.send({k: 'p2p', t: 'offer', g: this.gen, sdp: pc.localDescription.sdp});
    } catch (e) { console.warn('[p2p] offer', e); }
  }
  async _flush(pc, gen) {
    const list = this.pend.filter(x => x.g === gen); this.pend = this.pend.filter(x => x.g !== gen);
    for (const x of list) { try { await pc.addIceCandidate(x.c); } catch (e) {} }
  }
  async _onSig(m) {
    if (this._dead || typeof RTCPeerConnection === 'undefined') return;
    try {
      if (m.t === 'req') {
        // chỉ BIN trả lời; không dựng lại nếu đang dựng dở còn mới (tránh hai bên đạp nhau)
        if (this.init && !this.up() && performance.now() - this._madeAt > 1500) this._make();
      } else if (m.t === 'offer') {
        if (this.init) return;
        this.sig.off++;
        if (this.up() && m.g === this.gen) return;
        const servers = await this._ice(); if (this._dead) return;
        const pc = this._newPc(m.g, servers);
        await pc.setRemoteDescription({type: 'offer', sdp: m.sdp});
        const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
        if (pc !== this.pc) return;
        this.s.send({k: 'p2p', t: 'answer', g: m.g, sdp: pc.localDescription.sdp});
        await this._flush(pc, m.g);
      } else if (m.t === 'answer') {
        this.sig.ans++;        const pc = this.pc; if (!pc || !this.init || m.g !== this.gen || pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription({type: 'answer', sdp: m.sdp});
        await this._flush(pc, m.g);
      } else if (m.t === 'ice') {
        this.sig.ice++;
        const pc = this.pc;
        if (pc && m.g === this.gen && pc.remoteDescription) { try { await pc.addIceCandidate(m.c); } catch (e) {} }
        else if (this.pend.length < 64) this.pend.push({g: m.g, c: m.c});     // ICE tới trước offer/answer → giữ lại
      }
    } catch (e) { console.warn('[p2p] sig', m.t, e); }
  }
}
