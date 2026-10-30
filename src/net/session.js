// Phiên multiplayer: đăng nhập ẩn danh → giữ slot BIN/VY (RPC nguyên tử) → kênh realtime private (broadcast + presence).
// Không ghi DB cho dữ liệu tần suất cao (vị trí/animation) — chỉ dùng Broadcast.
import {CONFIG} from '../config.js';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const OTHER = {bin: 'vy', vy: 'bin'};
export const NAME = {bin: 'Bin', vy: 'Vy'};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Bộ đếm chạy trong Web Worker: trình duyệt giảm tốc/ngủ timer của tab ẩn (tối đa 1 lần/phút), nhưng timer trong Worker thì không.
// Dùng để giữ slot sống (heartbeat) và giữ kết nối realtime khi tab bị ẩn lâu.
function makeTicker(ms, fn) {
  try {
    const url = URL.createObjectURL(new Blob([`const t=setInterval(()=>postMessage(1),${ms});onmessage=e=>{if(e.data==='stop'){clearInterval(t);close()}}`], {type: 'text/javascript'}));
    const w = new Worker(url);
    w.onmessage = () => { try { fn(); } catch (e) { console.error('[session] tick', e); } };
    return () => { try { w.postMessage('stop'); w.terminate(); } catch (e) {} try { URL.revokeObjectURL(url); } catch (e) {} };
  } catch (e) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}

export class Session {
  constructor() {
    this.room = CONFIG.room; this.tab = uuid(); this.slot = null; this.uid = null; this.map = null;
    this.sb = null; this.ch = null; this.state = 'idle'; this.peer = null; this.rtt = null;
    this.h = {}; this._hb = null; this._pingT = null; this._joinedAt = Date.now(); this._dead = false;
    this._tx = {n: 0, fail: 0, w: []}; this._rx = {w: [], s: []}; this._stopTick = null; this._reviving = false; this._hiddenAt = 0; this._lastIn = 0; this._badSince = 0; this._listeners = [];
  }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); return () => { this.h[ev] = this.h[ev].filter(f => f !== fn); }; }
  emit(ev, a) { (this.h[ev] || []).forEach(f => { try { f(a); } catch (e) { console.error('[session]', ev, e); } }); }
  setState(s, text) { if (this.state === s && !text) return; this.state = s; this.emit('status', {state: s, text: text || ''}); }

  async connect() {
    this.setState('connecting', 'Đang kết nối...');
    const mod = await import(/* @vite-ignore */ CONFIG.mock || CONFIG.supabaseJs);
    const createClient = mod.createClient || (mod.default && mod.default.createClient);
    this.sb = createClient(CONFIG.supabaseUrl || 'http://mock', CONFIG.supabaseAnonKey || 'mock', {
      auth: {persistSession: true, autoRefreshToken: true, storageKey: 'vybin-auth'},
      realtime: {params: {eventsPerSecond: 40}},
    });
    // 1) phiên ẩn danh (tự khôi phục sau F5 vì lưu trong localStorage)
    let {data: {session}} = await this.sb.auth.getSession();
    if (!session) {
      const r = await this.sb.auth.signInAnonymously();
      if (r.error) throw new Error('Đăng nhập ẩn danh thất bại: ' + r.error.message + ' (đã bật Anonymous sign-ins chưa?)');
      session = r.data.session;
    }
    this.uid = session.user.id; this._token = session.access_token;
    try { this.sb.auth.onAuthStateChange((ev, ss) => { if (ss && ss.access_token) { this._token = ss.access_token; try { this.sb.realtime.setAuth(ss.access_token); } catch (e) {} } }); } catch (e) {}
    // 2) giữ slot
    await this._claim();
    // 3) kênh realtime
    await this._subscribe();
    this._stopTick = makeTicker(20000, () => this._tick());
    this._listen(document, 'visibilitychange', () => { if (document.hidden) this._hiddenAt = Date.now(); else this._revive('visible'); });
    this._listen(window, 'online', () => this._revive('online', true));
    this._listen(window, 'pageshow', e => { if (e.persisted) this._revive('pageshow', true); });
    this._listen(document, 'resume', () => this._revive('resume', true));
    this._listen(window, 'focus', () => { if (!document.hidden && this.state !== 'online') this._revive('focus'); });
    return {slot: this.slot, map: this.map, uid: this.uid};
  }

  async _claim() {
    const {data, error} = await this.sb.rpc('claim_slot', {p_room: this.room});
    if (error) {
      const m = String(error.message || error);
      if (m.includes('room_full')) { this.setState('full', 'Phòng đã đủ 2 người (BIN & VY).'); const e = new Error('room_full'); e.code = 'full'; throw e; }
      throw new Error('claim_slot: ' + m);
    }
    this.slot = data.slot; this.map = data.map; this.uid = data.user_id || this.uid;
  }
  // giữ slot sống; trả true nếu slot đã bị dọn trong lúc vắng mặt và vừa được lấy lại
  async _beat() {
    if (this._dead || this.state === 'dup') return false;
    try {
      const {data, error} = await this.sb.rpc('touch_slot', {p_room: this.room});
      if (error) throw error;
      if (data === false) { await this._claim(); this.emit('reclaimed', {slot: this.slot}); return true; }
    } catch (e) {
      console.warn('[session] heartbeat', e);
      if (e && e.code === 'full') { this.setState('full', 'Chỗ của bạn đã có người khác vào.'); this._shutdown(); }
    }
    return false;
  }

  _listen(target, ev, fn) { target.addEventListener(ev, fn); this._listeners.push([target, ev, fn]); }
  _shutdown() { this._dead = true; clearInterval(this._hb); clearInterval(this._pingT); if (this._stopTick) { this._stopTick(); this._stopTick = null; } this._listeners.forEach(([t, e, f]) => t.removeEventListener(e, f)); this._listeners = []; }

  // nhịp 20s (chạy cả khi tab ẩn): giữ slot, giữ socket không bị nghỉ, và tự nối lại nếu kênh chết quá 20s
  _tick() {
    if (this._dead || this.state === 'dup') return;
    this._beat().then(re => { if (re) this._revive('reclaimed', true); });
    const joined = this.ch && this.ch.state === 'joined' && this.state === 'online';
    if (joined) { this._badSince = 0; try { this.ch.send({type: 'broadcast', event: 'g', payload: {k: 'ka'}}); } catch (e) {} }
    else { this._badSince ||= Date.now(); if (Date.now() - this._badSince > 20000) { this._badSince = 0; this._revive('watchdog', true); } }
  }

  // Quay lại tab / có mạng lại / kênh nghi chết: làm mới token, giữ slot, kiểm tra kênh; chết thì dựng lại kênh.
  async _revive(why, force = false) {
    if (this._dead || this.state === 'dup' || this._reviving) return;
    this._reviving = true;
    try {
      const hiddenFor = this._hiddenAt ? Date.now() - this._hiddenAt : 0; this._hiddenAt = 0;
      try {
        const {data: {session}} = await this.sb.auth.getSession();   // tự refresh nếu token hết hạn
        if (session) { this._token = session.access_token; try { await this.sb.realtime.setAuth(session.access_token); } catch (e) {} }
      } catch (e) { console.warn('[session] auth', e); }
      const reclaimed = await this._beat();
      if (this._dead) return;
      let healthy = !force && !reclaimed && this.ch && this.ch.state === 'joined' && this.state === 'online';
      if (healthy && hiddenFor > 120000) healthy = false;          // ẩn quá lâu: dựng lại cho chắc
      if (healthy && this.peer) healthy = await this._probe(3000);   // đối phương có mặt mà không thấy tín hiệu => kênh đã chết ngầm
      if (!healthy) await this._resubscribe();
    } catch (e) { console.warn('[session] revive', why, e); }
    finally { this._reviving = false; }
  }
  // gửi ping, coi là khỏe nếu có pong hoặc bất kỳ tin nào từ đối phương trong ms
  _probe(ms) {
    return new Promise(res => {
      let done = false; const since = Date.now();
      const fin = v => { if (done) return; done = true; clearTimeout(to); clearInterval(iv); res(v); };
      const to = setTimeout(() => fin(false), ms);
      const iv = setInterval(() => { if (this._lastIn >= since) fin(true); }, 150);
      if (!this.send({k: 'ping', t: performance.now()})) fin(false);
    });
  }
  async _resubscribe() {
    const old = this.ch; this.ch = null; clearInterval(this._pingT);
    this.setState('offline', 'Đang nối lại...');
    try { old && await this.sb.removeChannel(old); } catch (e) {}
    for (let i = 0; i < 4 && !this._dead; i++) {
      try { await this._subscribe(); this.emit('reconnected'); this.emit('revived'); return true; }
      catch (e) {
        console.warn('[session] resubscribe', e);
        try { this.ch && await this.sb.removeChannel(this.ch); } catch (e2) {} this.ch = null;
        await sleep(1000 * 2 ** i);
      }
    }
    this.setState('offline', 'Mất kết nối, đang thử lại...');   // watchdog sẽ thử tiếp
    return false;
  }

  async _subscribe() {
    const sb = this.sb;
    try { await sb.realtime.setAuth(this._token); } catch (e) { /* bản cũ: tự xử lý */ }
    const ch = this.ch = sb.channel('room:' + this.room, {config: {private: CONFIG.privateChannels, broadcast: {self: false, ack: false}, presence: {key: this.tab}}});
    ch.on('broadcast', {event: 'g'}, ({payload}) => this._onMsg(payload));
    ch.on('presence', {event: 'sync'}, () => { if (ch === this.ch) this._presence(); });
    await new Promise((res, rej) => {
      let first = true;
      const to = setTimeout(() => { if (first) rej(new Error('Realtime timeout (kiểm tra RLS realtime.messages / Realtime đã bật?)')); }, 15000);
      ch.subscribe(async (st, err) => {
        if (ch !== this.ch) return;      // kênh cũ đã bị thay thế
        if (st === 'SUBSCRIBED') {
          await ch.track({slot: this.slot, uid: this.uid, tab: this.tab, at: this._joinedAt});
          this.setState('online');
          if (first) { first = false; clearTimeout(to); res(); } else { this._beat(); this.emit('reconnected'); }
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          if (this._dead) return;
          if (first && st !== 'CLOSED') { first = false; clearTimeout(to); rej(new Error('Realtime lỗi: ' + (err && err.message || st))); }
          else this.setState('offline', 'Mất kết nối, đang thử lại...');
        }
      });
    });
    clearInterval(this._pingT);
    this._pingT = setInterval(() => { if (this.peer && !document.hidden) this.send({k: 'ping', t: performance.now()}); }, 15000);   // đo RTT, thưa để tiết kiệm quota realtime
  }

  _presence() {
    const st = this.ch.presenceState(); let peer = null, dup = false;
    for (const key of Object.keys(st)) for (const p of st[key]) {
      if (p.tab === this.tab) continue;
      if (p.uid === this.uid || p.slot === this.slot) { if (p.at > this._joinedAt) dup = true; continue; }   // cùng người, tab mới hơn
      peer = p;
    }
    if (dup) { this._kick(); return; }
    const was = this.peer && this.peer.slot, now = peer && peer.slot;
    this.peer = peer;
    if (was !== now) this.emit('peer', {present: !!peer, slot: now || null});
  }
  _kick() {
    if (this._dead) return; this._shutdown();
    try { this.ch.unsubscribe(); } catch (e) {}
    this.setState('dup', 'Phiên này đang được mở ở tab khác.');
  }

  _onMsg(m) {
    if (!m || typeof m !== 'object') return;
    this._lastIn = Date.now();
    if (m.k === 'ka') return;
    if (m.k === 'ping') { this.send({k: 'pong', t: m.t}); return; }
    if (m.k === 'pong') { this.rtt = Math.round(performance.now() - m.t); this.emit('rtt', this.rtt); return; }
    this._rx.w.push(performance.now()); if (m.k === 's') this._rx.s.push({t: performance.now()});
    this.emit('msg', m);
  }
  // gửi broadcast (không đi qua DB)
  send(m) {
    if (!this.ch || this.state !== 'online') { this._tx.fail++; return false; }
    this._tx.n++; this._tx.w.push(performance.now());
    this.ch.send({type: 'broadcast', event: 'g', payload: m});
    return true;
  }
  // Số liệu mạng game (để chẩn đoán lag): tin gửi/nhận mỗi giây, khoảng lặng dài nhất giữa 2 snapshot của đối phương trong 10s gần nhất
  netStats() {
    const now = performance.now(), cut = now - 10000, rx = this._rx;
    this._tx.w = this._tx.w.filter(t => t > cut); rx.w = rx.w.filter(t => t > cut); rx.s = rx.s.filter(t => t.t > cut);
    let gap = 0; for (let i = 1; i < rx.s.length; i++) gap = Math.max(gap, rx.s[i].t - rx.s[i - 1].t);
    if (rx.s.length) gap = Math.max(gap, now - rx.s[rx.s.length - 1].t > 1500 && this.peer ? now - rx.s[rx.s.length - 1].t : 0);
    return {txPerSec: +(this._tx.w.length / 10).toFixed(1), rxPerSec: +(rx.w.length / 10).toFixed(1), maxGapMs: Math.round(gap), sendFail: this._tx.fail, total: this._tx.n};
  }
  async setMap(map) {
    const {error} = await this.sb.rpc('set_room_map', {p_room: this.room, p_map: map});
    if (error) throw new Error(error.message || String(error));
    this.send({k: 'map', map});
  }
  async leave() {
    this._shutdown();
    try { await this.sb.rpc('leave_slot', {p_room: this.room}); } catch (e) {}
    try { await this.ch.unsubscribe(); } catch (e) {}
  }
  close() {
    this._shutdown();
    try { this.ch && this.ch.unsubscribe(); } catch (e) {}
  }
}
