// PHÒNG VY — WORKROOM · lớp dữ liệu dùng chung cho mọi module.
// Nguồn thật: Supabase (bảng wr_*, RLS chỉ cho tài khoản chủ — xem supabase/migrations/009_workroom.sql).
// Khi chạy thử không có Supabase thật (?solo hoặc ?mock=…): dùng kho CỤC BỘ trên trình duyệt, giao diện ghi rõ "BẢN THỬ".
// Module KHÔNG gọi Supabase trực tiếp — chỉ gọi các hàm ở đây, để sau này đổi nguồn không phải sửa module.
import {CONFIG} from '../config.js';

export const STAGES = [
  ['intake', 'Tiếp nhận'], ['brief', 'Brief'], ['planning', 'Lên kế hoạch nội dung'], ['assignment', 'Phân công'],
  ['production', 'Sản xuất nội dung'], ['editorial', 'Biên tập'], ['approval', 'Duyệt'], ['scheduling', 'Lên lịch'],
  ['publishing', 'Xuất bản'], ['archive', 'Lưu trữ'],
];
export const stageName = id => (STAGES.find(s => s[0] === id) || [0, id])[1];

const isLocalMode = SH => !SH.sess || !!CONFIG.mock;

// Ai được vào Workroom? Máy chủ quyết định (hàm wr_is_owner). Giao diện chỉ hỏi, không tự cho phép.
export async function checkAccess(SH) {
  if (SH.slot !== 'vy') return false;
  if (isLocalMode(SH)) return true;                       // chạy thử trên máy, không có dữ liệu thật
  try { const {data, error} = await SH.sess.sb.rpc('wr_is_owner'); return !error && data === true; }
  catch (e) { return false; }
}

// ---------- kho cục bộ (chỉ cho chạy thử) ----------
function localBackend() {
  const KEY = 'vyWorkroomDev';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const db = Object.assign({wr_events: [], wr_tasks: [], wr_activity: [], wr_settings: [], seq: 0}, load());
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  const now = () => new Date().toISOString();
  const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  return {
    async list(t, {order = 'created_at', asc = false, limit = 500} = {}) {
      return [...db[t]].sort((a, b) => (a[order] > b[order] ? 1 : -1) * (asc ? 1 : -1)).slice(0, limit);
    },
    async insert(t, row) {
      const r = {id: id(), created_at: now(), updated_at: now(), ...row};
      if (t === 'wr_events') Object.assign(r, {code: 'EVENT-' + String(++db.seq).padStart(3, '0'), stage: 'intake', archived: false, is_demo: false, facts: {}, ...row});
      if (t === 'wr_tasks') Object.assign(r, {status: 'todo', priority: 'normal', source: 'manual', ref: {}, ...row});
      if (t === 'wr_activity') r.at = now();
      db[t].push(r); save(); return r;
    },
    async update(t, rid, patch) {
      const r = db[t].find(x => x.id === rid); if (!r) throw new Error('Không tìm thấy bản ghi');
      Object.assign(r, patch, {updated_at: now()}); save(); return r;
    },
    async remove(t, rid) { db[t] = db[t].filter(x => x.id !== rid); save(); },
    async getSettings() { return (db.wr_settings[0] || {}).data || {}; },
    async setSettings(data) { db.wr_settings = [{id: true, data}]; save(); },
  };
}

// ---------- Supabase ----------
function supabaseBackend(sb) {
  const ok = ({data, error}) => { if (error) throw new Error(error.message || String(error)); return data; };
  return {
    async list(t, {order = 'created_at', asc = false, limit = 500} = {}) { return ok(await sb.from(t).select('*').order(order, {ascending: asc}).limit(limit)) || []; },
    async insert(t, row) { return ok(await sb.from(t).insert(row).select().single()); },
    async update(t, rid, patch) { return ok(await sb.from(t).update(patch).eq('id', rid).select().single()); },
    async remove(t, rid) { ok(await sb.from(t).delete().eq('id', rid)); },
    async getSettings() { const d = ok(await sb.from('wr_settings').select('data').maybeSingle()); return (d && d.data) || {}; },
    async setSettings(data) { ok(await sb.from('wr_settings').upsert({id: true, data})); },
  };
}

export async function createStore(SH) {
  if (!(await checkAccess(SH))) throw new Error('not_owner');
  const local = isLocalMode(SH);
  const be = local ? localBackend() : supabaseBackend(SH.sess.sb);
  const hs = {};
  const S = {
    local,                                             // true = bản thử, dữ liệu chỉ nằm trên trình duyệt này
    account: (!local && SH.sess.user && SH.sess.user.email) || '',
    events: [], tasks: [], activity: [], settings: {},
    save: {state: 'saved', at: null, error: ''},       // trạng thái lưu hiển thị trên thanh trên cùng
    on(ev, fn) { (hs[ev] ||= []).push(fn); return () => { hs[ev] = hs[ev].filter(f => f !== fn); }; },
    emit(ev, a) { (hs[ev] || []).forEach(f => { try { f(a); } catch (e) { console.error('[workroom]', e); } }); },
  };
  let pending = 0;
  // mọi thao tác GHI đi qua đây: cập nhật trạng thái lưu, báo lỗi rõ ràng, không nuốt lỗi
  async function write(fn) {
    pending++; S.save = {state: 'saving', at: S.save.at, error: ''}; S.emit('save');
    try { const r = await fn(); pending--; if (!pending) { S.save = {state: 'saved', at: new Date(), error: ''}; S.emit('save'); } return r; }
    catch (e) { pending--; S.save = {state: 'error', at: S.save.at, error: String(e.message || e)}; S.emit('save'); throw e; }
  }
  const log = (kind, summary, event_id = null, ref = {}) =>
    be.insert('wr_activity', {kind, summary, event_id, ref}).then(r => { S.activity.unshift(r); S.activity.length = Math.min(S.activity.length, 200); }).catch(e => console.warn('[workroom] nhật ký', e));

  S.reload = async () => {
    const [ev, tk, ac, st] = await Promise.all([
      be.list('wr_events'), be.list('wr_tasks'), be.list('wr_activity', {order: 'at', limit: 200}), be.getSettings(),
    ]);
    S.events = ev; S.tasks = tk; S.activity = ac; S.settings = st; S.emit('change');
  };
  S.eventOf = id => S.events.find(e => e.id === id) || null;

  S.createEvent = ({name, event_date = null, venue = null, organizer = null, note = null}) => write(async () => {
    const r = await be.insert('wr_events', {name: name.trim(), event_date: event_date || null, venue: venue || null, organizer: organizer || null, note: note || null});
    S.events.unshift(r); await log('event.create', `Tạo sự kiện ${r.code} — ${r.name}`, r.id); S.emit('change'); return r;
  });
  S.updateEvent = (id, patch, what = '') => write(async () => {
    const r = await be.update('wr_events', id, patch);
    S.events = S.events.map(e => e.id === id ? r : e); await log('event.update', `${r.code}: ${what || 'cập nhật thông tin'}`, id); S.emit('change'); return r;
  });

  S.createTask = t => write(async () => {
    const r = await be.insert('wr_tasks', {title: t.title.trim(), description: t.description || null, event_id: t.event_id || null, owner_name: t.owner_name || null,
      deadline: t.deadline || null, priority: t.priority || 'normal', source: t.source || 'manual', ref: t.ref || {}});
    S.tasks.unshift(r); await log('task.create', `Thêm việc: ${r.title}`, r.event_id, {task: r.id}); S.emit('change'); return r;
  });
  S.updateTask = (id, patch) => write(async () => {
    if (patch.status) patch.done_at = patch.status === 'done' ? new Date().toISOString() : null;
    const r = await be.update('wr_tasks', id, patch);
    S.tasks = S.tasks.map(t => t.id === id ? r : t);
    if (patch.status) await log('task.status', `${r.title} → ${({todo: 'Chưa làm', doing: 'Đang làm', done: 'Xong'})[r.status]}`, r.event_id, {task: r.id});
    S.emit('change'); return r;
  });
  S.removeTask = id => write(async () => {
    const t = S.tasks.find(x => x.id === id); await be.remove('wr_tasks', id);
    S.tasks = S.tasks.filter(x => x.id !== id); if (t) await log('task.delete', `Xoá việc: ${t.title}`, t.event_id); S.emit('change');
  });

  S.setSetting = (k, v) => write(async () => { S.settings = {...S.settings, [k]: v}; await be.setSettings(S.settings); S.emit('change'); });
  // xuất toàn bộ dữ liệu Workroom ra 1 file (sao lưu)
  S.exportAll = () => ({exported_at: new Date().toISOString(), source: local ? 'local-dev' : 'supabase', events: S.events, tasks: S.tasks, activity: S.activity, settings: S.settings});

  await S.reload();
  return S;
}
