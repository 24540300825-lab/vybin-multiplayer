// Chat realtime: lưu bền trong bảng `messages` (RLS), nhận qua postgres_changes, khử trùng theo id.
// Gửi lạc quan (optimistic): hiển thị ngay bằng id do client sinh; bản echo từ server bị bỏ qua nhờ khử trùng.
import {CONFIG} from '../config.js';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const MAX_LEN = 500;

export class Chat {
  constructor(sess) {
    this.s = sess; this.msgs = []; this.ids = new Set(); this.h = {}; this.unread = 0; this.open = false; this.ready = false;
    this.last = 0; this._ch = null; this._lastTs = null;
  }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); }
  emit(ev, a) { (this.h[ev] || []).forEach(f => { try { f(a); } catch (e) { console.error(e); } }); }

  async start() {
    const sb = this.s.sb, room = this.s.room;
    await this._history();
    this._ch = sb.channel('chat:' + room)
      .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'messages', filter: 'room_code=eq.' + room}, p => this._add(p.new))
      .subscribe(st => {
        if (st === 'SUBSCRIBED') { this.ready = true; this.emit('state', 'ready'); this._history(true); }   // vá khoảng trống sau reconnect
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { this.ready = false; this.emit('state', 'offline'); }
      });
  }
  async _history(gap) {
    const sb = this.s.sb;
    let q = sb.from('messages').select('id,slot,body,created_at').eq('room_code', this.s.room);
    q = gap && this._lastTs ? q.gt('created_at', this._lastTs).order('created_at', {ascending: true}).limit(200)
                            : q.order('created_at', {ascending: false}).limit(100);
    const {data, error} = await q;
    if (error) { console.warn('[chat] history', error); this.emit('state', 'error'); return; }
    (gap && this._lastTs ? data : data.reverse()).forEach(m => this._add(m, true));
    this.emit('history');
  }
  _add(m, silent) {
    if (!m || this.ids.has(m.id)) return;
    this.ids.add(m.id); this.msgs.push(m);
    if (!m.pending && (!this._lastTs || m.created_at > this._lastTs)) this._lastTs = m.created_at;
    const mine = m.slot === this.s.slot;
    if (!silent && !mine && !this.open) { this.unread++; this.emit('unread', this.unread); }
    this.emit('msg', {m, mine, silent: !!silent});
  }
  setOpen(v) { this.open = v; if (v && this.unread) { this.unread = 0; this.emit('unread', 0); } }

  async send(text) {
    text = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!text) return {ok: false, err: 'empty'};
    if (text.length > MAX_LEN) return {ok: false, err: 'Tin nhắn tối đa ' + MAX_LEN + ' ký tự'};
    const now = Date.now(); if (now - this.last < 400) return {ok: false, err: 'Gửi chậm lại một chút'}; this.last = now;
    const id = uuid(), local = {id, slot: this.s.slot, body: text, created_at: new Date().toISOString(), pending: true};
    this._add(local);
    const {error} = await this.s.sb.from('messages').insert({id, room_code: this.s.room, body: text});
    if (error) { this.emit('fail', id); return {ok: false, err: error.message}; }
    this.emit('sent', id);
    return {ok: true};
  }
  stop() { try { this._ch && this.s.sb.removeChannel(this._ch); } catch (e) {} }
}
