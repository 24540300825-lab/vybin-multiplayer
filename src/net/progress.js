// Tiến trình người chơi (Đợt 1): ví Xu, XP/cấp, Điểm Kiến Tạo (quỹ nhà), kỹ năng, thành tựu, Hộp quà, phiên tập trung, lưu "Việc hôm nay".
// Máy chủ là nguồn sự thật: trình duyệt chỉ GỌI HÀM (game_*) và vẽ lại theo ảnh chụp game_me(). Không bao giờ tự gửi số dư.
// Lỗi mạng/máy chủ không làm hỏng game: mọi hàm bắt lỗi và trả null.
export const CUR = {
  xu: {name: 'Xu', short: 'Xu'},
  xp: {name: 'Kinh nghiệm', short: 'XP'},
  kt: {name: 'Điểm Kiến Tạo', short: 'Kiến Tạo'},
};
// danh mục vật phẩm (máy chủ gửi kèm game_me / game_bag) — để hiện tên "Gỗ" thay vì "item:wood"
export const ITEMS = {};
export const setItems = list => (list || []).forEach(i => { if (i && i.id) ITEMS[i.id] = i; });
const SKILL = {creative: 'Sáng tạo', garden: 'Làm vườn', fishing: 'Câu cá', explore: 'Khám phá', craft: 'Chế tạo'};
export function curName(c) {
  if (CUR[c]) return CUR[c].short;
  if (c && c.startsWith('item:')) { const it = ITEMS[c.slice(5)]; return it ? it.name : c.slice(5); }
  if (c && c.startsWith('skill:')) return 'điểm ' + (SKILL[c.slice(6)] || 'kỹ năng');
  return c;
}
// "+15 Xu · +20 XP"
export const fmtItems = items => (items || []).filter(i => i && i.c && !String(i.c).startsWith('soon:')).map(i => (i.n > 0 ? '+' : '') + i.n + ' ' + curName(i.c)).join(' · ');

export class Progress {
  constructor(sb, sess) {
    this.sb = sb; this.sess = sess; this.me = null; this.h = {}; this.ok = false; this._busy = null;
  }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); return () => { this.h[ev] = this.h[ev].filter(f => f !== fn); }; }
  emit(ev, a) { (this.h[ev] || []).forEach(f => { try { f(a); } catch (e) { console.error('[progress]', ev, e); } }); }

  async _rpc(fn, args) {
    const {data, error} = await this.sb.rpc(fn, args || {});
    if (error) { const e = new Error(String(error.message || error)); e.raw = error; throw e; }
    return data;
  }
  // tải lại ảnh chụp (gộp các lần gọi dồn dập thành 1)
  refresh() {
    if (this._busy) return this._busy;
    this._busy = (async () => {
      try { const d = await this._rpc('game_me'); if (d) { setItems(d.items); this.me = d; this.ok = true; this.emit('change', d); } return d; }
      catch (e) { console.warn('[progress] refresh', e); return null; }
      finally { setTimeout(() => { this._busy = null; }, 0); }
    })();
    return this._busy;
  }
  // báo cho máy người kia biết để họ tải lại (quỹ nhà / cấp của mình đổi)
  _poke() { try { this.sess && this.sess.send({k: 'eco'}); } catch (e) {} }
  _after(res) {
    if (!res) return res;
    const got = res.granted || res.items || [];
    if (got.length || (res.achievements && res.achievements.length)) { this.emit('reward', res); this._poke(); }
    if (res.quests && res.quests.length) { this.emit('quests', res.quests); this._poke(); }
    this.refresh();
    return res;
  }
  async report(kind, data = {}, idem = null) {
    if (!this.ok) return null;
    try { return this._after(await this._rpc('game_report', {p_kind: kind, p_data: data, p_idem: idem})); }
    catch (e) { console.warn('[progress] report', kind, e.message); return null; }
  }
  async claim(id = null) {
    const r = await this._rpc('game_claim_inbox', {p_id: id});
    if (r) r.label = 'Đã nhận quà';
    return this._after(r);
  }
  async history(house = false) { return this._rpc('game_history', {p_house: house, p_limit: 60}); }
  async focusStart(min) { const r = await this._rpc('game_focus_start', {p_minutes: min}); await this.refresh(); return r; }
  async focusCancel() { await this._rpc('game_focus_cancel'); await this.refresh(); }
  async focusFinish(id) { const r = await this._rpc('game_focus_finish', {p_id: id}); if (r) r.label = 'Xong phiên tập trung!'; return this._after(r); }
  // ---- nhiệm vụ & hướng dẫn (hạng mục 04) ----
  async quests() { return this._rpc('game_quests'); }
  async claimQuest(id, period) { const r = await this._rpc('game_quest_claim', {p_quest: id, p_period: period}); return r && r.dup ? r : this._after(r); }
  async tutorial(skip) { await this._rpc('game_tutorial', {p_skip: !!skip}); await this.refresh(); }
  // ---- túi đồ & kho nhà (hạng mục 05) ----
  async bag() { const b = await this._rpc('game_bag'); if (b) setItems(b.items); return b; }
  async transfer(item, n, toHouse) {
    const r = await this._rpc('game_transfer', {p_item: item, p_n: n, p_to_house: !!toHouse, p_idem: Date.now().toString(36) + Math.random().toString(36).slice(2, 8)});
    this._poke(); return r;
  }
  async save({settings = null, tasks = null, title = null, flags = null} = {}) {
    await this._rpc('game_save', {p_settings: settings, p_tasks: tasks, p_title: title, p_flags: flags});
  }
}
