// Phiên multiplayer: đăng nhập ẩn danh → giữ slot BIN/VY (RPC nguyên tử) → kênh realtime private (broadcast + presence).
// Không ghi DB cho dữ liệu tần suất cao (vị trí/animation) — chỉ dùng Broadcast.
import {CONFIG} from '../config.js';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const OTHER = {bin: 'vy', vy: 'bin'};
export const NAME = {bin: 'Bin', vy: 'Vy'};

export class Session {
  constructor() {
    this.room = CONFIG.room; this.tab = uuid(); this.slot = null; this.uid = null; this.map = null;
    this.sb = null; this.ch = null; this.state = 'idle'; this.peer = null; this.rtt = null;
    this.h = {}; this._hb = null; this._pingT = null; this._joinedAt = Date.now(); this._dead = false;
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
      realtime: {params: {eventsPerSecond: 20}},
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
    this._hb = setInterval(() => this._beat(), 25000);
    document.addEventListener('visibilitychange', this._vis = () => { if (!document.hidden) this._beat(); });
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
  async _beat() {
    if (this._dead || this.state === 'dup') return;
    try {
      const {data, error} = await this.sb.rpc('touch_slot', {p_room: this.room});
      if (error) throw error;
      if (data === false) { await this._claim(); this.emit('reclaimed', {slot: this.slot}); }
    } catch (e) { console.warn('[session] heartbeat', e); }
  }

  async _subscribe() {
    const sb = this.sb;
    try { await sb.realtime.setAuth(this._token); } catch (e) { /* bản cũ: tự xử lý */ }
    const ch = this.ch = sb.channel('room:' + this.room, {config: {private: CONFIG.privateChannels, broadcast: {self: false, ack: false}, presence: {key: this.tab}}});
    ch.on('broadcast', {event: 'g'}, ({payload}) => this._onMsg(payload));
    ch.on('presence', {event: 'sync'}, () => this._presence());
    await new Promise((res, rej) => {
      let first = true;
      const to = setTimeout(() => { if (first) rej(new Error('Realtime timeout (kiểm tra RLS realtime.messages / Realtime đã bật?)')); }, 15000);
      ch.subscribe(async (st, err) => {
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
    this._pingT = setInterval(() => { if (this.peer) this.send({k: 'ping', t: performance.now()}); }, 5000);
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
    if (this._dead) return; this._dead = true; clearInterval(this._hb); clearInterval(this._pingT);
    try { this.ch.unsubscribe(); } catch (e) {}
    this.setState('dup', 'Phiên này đang được mở ở tab khác.');
  }

  _onMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'ping') { this.send({k: 'pong', t: m.t}); return; }
    if (m.k === 'pong') { this.rtt = Math.round(performance.now() - m.t); this.emit('rtt', this.rtt); return; }
    this.emit('msg', m);
  }
  // gửi broadcast (không đi qua DB)
  send(m) {
    if (!this.ch || this.state !== 'online') return false;
    this.ch.send({type: 'broadcast', event: 'g', payload: m});
    return true;
  }
  async setMap(map) {
    const {error} = await this.sb.rpc('set_room_map', {p_room: this.room, p_map: map});
    if (error) throw new Error(error.message || String(error));
    this.send({k: 'map', map});
  }
  async leave() {
    this._dead = true; clearInterval(this._hb); clearInterval(this._pingT);
    document.removeEventListener('visibilitychange', this._vis);
    try { await this.sb.rpc('leave_slot', {p_room: this.room}); } catch (e) {}
    try { await this.ch.unsubscribe(); } catch (e) {}
  }
  close() {
    this._dead = true; clearInterval(this._hb); clearInterval(this._pingT);
    document.removeEventListener('visibilitychange', this._vis);
    try { this.ch && this.ch.unsubscribe(); } catch (e) {}
  }
}
