// Backend GIẢ LẬP để test multiplayer cục bộ (nhiều tab cùng trình duyệt) — KHÔNG dùng khi deploy thật.
// Mô phỏng đúng bề mặt API supabase-js mà game dùng: auth ẩn danh, rpc(claim_slot...), from('messages'), channel(broadcast/presence/postgres_changes).
// Mỗi tab = 1 "người dùng" (uid lưu trong sessionStorage). Dùng: index.html?mock=/dev/mock-supabase.js
const DB_KEY = 'vybin-mock-db', bc = new BroadcastChannel('vybin-mock');
const LAT = +(new URLSearchParams(location.search).get('mocklat') || 0);
const later = fn => (LAT ? setTimeout(fn, LAT) : queueMicrotask(fn));
const load = () => { try { return JSON.parse(localStorage.getItem(DB_KEY)) || {rooms: {}, slots: {}, messages: []}; } catch (e) { return {rooms: {}, slots: {}, messages: []}; } };
const save = d => localStorage.setItem(DB_KEY, JSON.stringify(d));
const uuid = () => crypto.randomUUID();
const uid = () => { let u = sessionStorage.getItem('mock-uid'); return u; };
const err = m => ({data: null, error: {message: m}});

const RPC = {
  claim_slot({p_room, p_default_map = 'house'}) {
    const u = uid(); if (!u) return err('not_authenticated');
    if (!/^[a-z0-9_-]{1,32}$/.test(p_room || '')) return err('bad_room');
    const d = load(); d.rooms[p_room] ||= {map_id: p_default_map}; const sl = d.slots[p_room] ||= {};
    const now = Date.now();
    for (const k of Object.keys(sl)) if (sl[k].uid !== u && now - sl[k].seen > 90000) delete sl[k];
    let s = Object.keys(sl).find(k => sl[k].uid === u);
    if (!s) { s = !sl.bin ? 'bin' : !sl.vy ? 'vy' : null; if (!s) return err('room_full'); sl[s] = {uid: u, seen: now}; } else sl[s].seen = now;
    save(d); return {data: {slot: s, map: d.rooms[p_room].map_id, user_id: u}, error: null};
  },
  touch_slot({p_room}) { const d = load(), sl = d.slots[p_room] || {}, k = Object.keys(sl).find(k => sl[k].uid === uid()); if (k) { sl[k].seen = Date.now(); save(d); } return {data: !!k, error: null}; },
  leave_slot({p_room}) { const d = load(), sl = d.slots[p_room] || {}; for (const k of Object.keys(sl)) if (sl[k].uid === uid()) delete sl[k]; save(d); return {data: null, error: null}; },
  set_room_map({p_room, p_map}) { const d = load(); const sl = d.slots[p_room] || {}; if (!Object.values(sl).some(x => x.uid === uid())) return err('not_in_room'); d.rooms[p_room].map_id = p_map; save(d); return {data: p_map, error: null}; },
};
const member = (d, room) => Object.values(d.slots[room] || {}).some(x => x.uid === uid());

class Query {
  constructor(t) { this.t = t; this.f = []; this.o = null; this.l = 1e9; this.ins = null; }
  select() { return this; } eq(k, v) { this.f.push(r => r[k] === v); return this; } gt(k, v) { this.f.push(r => r[k] > v); return this; }
  order(k, {ascending = true} = {}) { this.o = [k, ascending]; return this; } limit(n) { this.l = n; return this; }
  insert(row) { this.ins = row; return this; }
  maybeSingle() { this.one = true; return this; } single() { this.one = true; return this; }
  then(res, rej) { return Promise.resolve(this._run()).then(res, rej); }
  _run() {
    const d = load();
    if (this.ins) {
      const r = this.ins; if (!member(d, r.room_code)) return err('not_in_room');
      const s = Object.keys(d.slots[r.room_code]).find(k => d.slots[r.room_code][k].uid === uid());
      const body = String(r.body || '').trim(); if (!body || body.length > 500) return err('check constraint');
      const row = {id: r.id || uuid(), room_code: r.room_code, user_id: uid(), slot: s, body, created_at: new Date().toISOString()};
      d.messages.push(row); save(d); bc.postMessage({t: 'insert', row}); fire('insert', row); return {data: row, error: null};
    }
    if (this.t === 'rooms') {   // bảng rooms (RLS: chỉ thành viên đọc được)
      const rs = Object.entries(d.rooms).filter(([c]) => member(d, c)).map(([code, r]) => ({code, map_id: r.map_id})).filter(r => this.f.every(f => f(r)));
      return {data: this.one ? (rs[0] || null) : rs, error: null};
    }
    const rows = d.messages.filter(m => member(d, m.room_code) && this.f.every(f => f(m)));
    if (this.o) rows.sort((a, b) => (a[this.o[0]] < b[this.o[0]] ? -1 : 1) * (this.o[1] ? 1 : -1));
    return {data: rows.slice(0, this.l), error: null};
  }
}
const pgSubs = new Set();
const fire = (ev, row) => { for (const s of pgSubs) if (s.table === 'messages' && (!s.room || s.room === row.room_code) && member(load(), row.room_code)) later(() => s.cb({new: row})); };

const chans = new Set();
class Channel {
  constructor(name, opts) { this.name = name; this.id = uuid(); this.opts = opts || {}; this.b = []; this.p = []; this.pg = []; this.pres = {}; this.mine = null; this.on_ = false; }
  on(type, filter, cb) {
    if (type === 'broadcast') this.b.push({ev: filter.event, cb}); else if (type === 'presence') this.p.push({ev: filter.event, cb});
    else if (type === 'postgres_changes') { const m = /room_code=eq\.(.+)/.exec(filter.filter || ''); const s = {table: filter.table, room: m && m[1], cb}; this.pg.push(s); }
    return this;
  }
  subscribe(cb) { chans.add(this); this.pg.forEach(s => pgSubs.add(s)); this.on_ = true; setTimeout(() => { cb && cb('SUBSCRIBED'); bc.postMessage({t: 'preq', ch: this.name, from: this.id}); }, 5); return this; }
  send({event, payload}) { bc.postMessage({t: 'b', ch: this.name, from: this.id, event, payload}); return Promise.resolve('ok'); }
  track(payload) { this.mine = payload; this._ann(); this._sync(); return Promise.resolve('ok'); }
  _ann() { if (this.mine) bc.postMessage({t: 'pres', ch: this.name, from: this.id, key: this.opts.config?.presence?.key || this.id, payload: this.mine}); }
  presenceState() { const o = {}; const me = this.opts.config?.presence?.key || this.id; if (this.mine) o[me] = [this.mine]; for (const [k, v] of Object.entries(this.pres)) o[k] = [v.payload]; return o; }
  _sync() { this.p.filter(x => x.ev === 'sync').forEach(x => later(() => x.cb())); }
  unsubscribe() { if (!this.on_) return Promise.resolve('ok'); this.on_ = false; chans.delete(this); this.pg.forEach(s => pgSubs.delete(s)); bc.postMessage({t: 'leave', ch: this.name, from: this.id, key: this.opts.config?.presence?.key || this.id}); return Promise.resolve('ok'); }
}
bc.onmessage = ({data: m}) => {
  for (const c of chans) {
    if (c.name !== m.ch && m.t !== 'insert') continue;
    if (m.t === 'b' && m.from !== c.id) c.b.filter(x => x.ev === m.event).forEach(x => later(() => x.cb({payload: m.payload})));
    else if (m.t === 'pres' && m.from !== c.id) { c.pres[m.key] = {payload: m.payload, from: m.from}; c._sync(); }
    else if (m.t === 'leave') { delete c.pres[m.key]; c._sync(); }
    else if (m.t === 'preq' && m.from !== c.id) c._ann();
  }
  if (m.t === 'insert') fire('insert', m.row);
};
setInterval(() => chans.forEach(c => c._ann()), 3000);
addEventListener('pagehide', () => chans.forEach(c => c.unsubscribe()));

export function createClient() {
  return {
    auth: {
      async getSession() { const u = uid(); return {data: {session: u ? {user: {id: u}, access_token: 'mock'} : null}}; },
      async signInAnonymously() { const u = uuid(); sessionStorage.setItem('mock-uid', u); return {data: {session: {user: {id: u}, access_token: 'mock'}}, error: null}; },
    },
    realtime: {setAuth: async () => {}},
    rpc: async (n, a) => (RPC[n] ? RPC[n](a || {}) : err('no such rpc ' + n)),
    from: t => new Query(t),
    channel: (n, o) => new Channel(n, o),
    removeChannel: c => c.unsubscribe(),
  };
}
