// PHÒNG VY — WORKROOM · lớp dữ liệu dùng chung cho mọi module.
// Nguồn thật: Supabase (bảng wr_*, RLS chỉ cho tài khoản chủ — supabase/migrations/009, 010).
// Chạy thử không có Supabase thật (?solo, ?mock=…, dev/workroom.html): kho CỤC BỘ trên trình duyệt, giao diện ghi rõ "BẢN THỬ".
// Module KHÔNG gọi Supabase trực tiếp — chỉ dùng S.add / S.set / S.del / S.where và các hàm nghiệp vụ ở đây.
import {CONFIG} from '../config.js';

export const STAGES = [
  ['intake', 'Tiếp nhận'], ['brief', 'Brief'], ['planning', 'Lên kế hoạch nội dung'], ['assignment', 'Phân công'],
  ['production', 'Sản xuất nội dung'], ['editorial', 'Biên tập'], ['approval', 'Duyệt'], ['scheduling', 'Lên lịch'],
  ['publishing', 'Xuất bản'], ['archive', 'Lưu trữ'],
];
export const stageName = id => (STAGES.find(s => s[0] === id) || [0, id])[1];
// bảng nạp sẵn vào bộ nhớ khi mở Workroom: tên ngắn → [bảng, cột sắp xếp, tăng dần?, giới hạn]
const COLS = {
  events: ['wr_events', 'created_at', false, 500], tasks: ['wr_tasks', 'created_at', false, 1000], activity: ['wr_activity', 'at', false, 200],
  knowledge: ['wr_knowledge', 'created_at', false, 500], articles: ['wr_articles', 'updated_at', false, 500], timeline: ['wr_timeline', 'pos', true, 2000],
  staff: ['wr_staff', 'name', true, 500], chats: ['wr_chats', 'updated_at', false, 100], ailog: ['wr_ai_log', 'at', false, 300],
};
const TABLE = Object.fromEntries(Object.entries(COLS).map(([k, v]) => [k, v[0]]));
Object.assign(TABLE, {versions: 'wr_versions', reviews: 'wr_reviews'});
// giá trị mặc định (giống default của Postgres) cho kho cục bộ
const DEF = {
  wr_events: () => ({stage: 'intake', archived: false, is_demo: false, facts: {}, assign: {}, links: {}, needs_check: []}),
  wr_tasks: () => ({status: 'todo', priority: 'normal', source: 'manual', ref: {}}),
  wr_knowledge: () => ({category: 'reference', status: 'reference', source: 'upload', content: '', meta: {}}),
  wr_articles: () => ({kind: 'news', title: '', body: '', status: 'draft', origin: 'manual', sources: [], doc: {}, stale: []}),
  wr_timeline: () => ({pos: 0, phase: 'truoc', content: '', format: '', deadline: '', publish_at: '', channel: '', a_content: '', a_media: '', a_editor: '', note: '', done: false, origin: 'manual'}),
  wr_staff: () => ({roles: [], skills: '', busy: [], confirmed: false, active: true, source: 'manual'}),
  wr_chats: () => ({title: 'Cuộc trò chuyện mới', messages: []}),
  wr_ai_log: () => ({ok: true}), wr_versions: () => ({label: ''}), wr_reviews: () => ({reader: {}, items: []}),
};

const isLocalMode = SH => !SH.sess || !!CONFIG.mock || !!SH.devLocal;

// Ai được vào Workroom? Máy chủ quyết định (hàm wr_is_owner). Giao diện chỉ hỏi, không tự cho phép.
export async function checkAccess(SH) {
  if (SH.slot !== 'vy') return false;
  if (isLocalMode(SH)) return true;                       // chạy thử trên máy, không có dữ liệu thật
  try { const {data, error} = await SH.sess.sb.rpc('wr_is_owner'); return !error && data === true; }
  catch (e) { return false; }
}

function localBackend() {
  const KEY = 'vyWorkroomDev';
  let db = {}; try { db = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  const T = t => (db[t] ||= []);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  const now = () => new Date().toISOString(), id = () => crypto.randomUUID();
  const sort = (a, order, asc) => [...a].sort((x, y) => (x[order] > y[order] ? 1 : x[order] < y[order] ? -1 : 0) * (asc ? 1 : -1));
  return {
    async list(t, {order = 'created_at', asc = false, limit = 500} = {}) { return sort(T(t), order, asc).slice(0, limit); },
    async where(t, f, v, {order = 'created_at', asc = false} = {}) { return sort(T(t).filter(r => r[f] === v), order, asc); },
    async insert(t, row) {
      const r = {id: id(), created_at: now(), updated_at: now(), ...(DEF[t] ? DEF[t]() : {}), ...row};
      if (t === 'wr_events' && !r.code) { db.seq = (db.seq || 0) + 1; r.code = 'EVENT-' + String(db.seq).padStart(3, '0'); }
      if (t === 'wr_activity' || t === 'wr_ai_log') r.at = now();
      T(t).push(r); save(); return r;
    },
    async update(t, rid, patch) { const r = T(t).find(x => x.id === rid); if (!r) throw new Error('Không tìm thấy bản ghi'); Object.assign(r, patch, {updated_at: now()}); save(); return {...r}; },
    async remove(t, rid) { db[t] = T(t).filter(x => x.id !== rid); if (t === 'wr_articles') { db.wr_versions = T('wr_versions').filter(v => v.article_id !== rid); db.wr_reviews = T('wr_reviews').filter(v => v.article_id !== rid); } save(); },
    async getSettings() { return (T('wr_settings')[0] || {}).data || {}; },
    async setSettings(data) { db.wr_settings = [{id: true, data}]; save(); },
  };
}
function supabaseBackend(sb) {
  const ok = ({data, error}) => { if (error) throw new Error(error.message || String(error)); return data; };
  return {
    async list(t, {order = 'created_at', asc = false, limit = 500} = {}) { return ok(await sb.from(t).select('*').order(order, {ascending: asc}).limit(limit)) || []; },
    async where(t, f, v, {order = 'created_at', asc = false} = {}) { return ok(await sb.from(t).select('*').eq(f, v).order(order, {ascending: asc})) || []; },
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
    local, account: (!local && SH.sess.user && SH.sess.user.email) || '', settings: {},
    save: {state: 'saved', at: null, error: ''},
    on(ev, fn) { (hs[ev] ||= []).push(fn); return () => { hs[ev] = hs[ev].filter(f => f !== fn); }; },
    emit(ev, a) { (hs[ev] || []).forEach(f => { try { f(a); } catch (e) { console.error('[workroom]', e); } }); },
  };
  for (const k in COLS) S[k] = [];
  let pending = 0;
  // mọi thao tác GHI đi qua đây: cập nhật trạng thái lưu, báo lỗi rõ ràng, không nuốt lỗi
  async function write(fn) {
    pending++; S.save = {state: 'saving', at: S.save.at, error: ''}; S.emit('save');
    try { const r = await fn(); pending--; if (!pending) { S.save = {state: 'saved', at: new Date(), error: ''}; S.emit('save'); } return r; }
    catch (e) { pending--; S.save = {state: 'error', at: S.save.at, error: String(e.message || e)}; S.emit('save'); throw e; }
  }
  S.log = (kind, summary, event_id = null, ref = {}) =>
    be.insert('wr_activity', {kind, summary: String(summary).slice(0, 400), event_id, ref}).then(r => { S.activity.unshift(r); S.activity.length = Math.min(S.activity.length, 200); }).catch(e => console.warn('[workroom] nhật ký', e));

  S.reload = async () => {
    const ks = Object.keys(COLS);
    const res = await Promise.all([...ks.map(k => be.list(COLS[k][0], {order: COLS[k][1], asc: COLS[k][2], limit: COLS[k][3]})), be.getSettings()]);
    ks.forEach((k, i) => { S[k] = res[i]; }); S.settings = res[ks.length]; S.emit('change');
  };
  S.eventOf = id => S.events.find(e => e.id === id) || null;
  const keyOf = t => Object.keys(TABLE).find(k => TABLE[k] === t || k === t);
  // ---- ghi tổng quát. opt.silent: không vẽ lại giao diện (dùng cho lưu tự động khi đang gõ); opt.log: dòng nhật ký ----
  S.add = (col, row, opt = {}) => write(async () => {
    const r = await be.insert(TABLE[col], row); if (S[col]) S[col].unshift(r);
    if (opt.log) await S.log(col + '.create', opt.log, r.event_id || row.event_id || null, {id: r.id});
    if (!opt.silent) S.emit('change'); return r;
  });
  S.set = (col, id, patch, opt = {}) => write(async () => {
    const r = await be.update(TABLE[col], id, patch); if (S[col]) S[col] = S[col].map(x => x.id === id ? r : x);
    if (opt.log) await S.log(col + '.update', opt.log, r.event_id || null, {id});
    if (!opt.silent) S.emit('change'); return r;
  });
  S.del = (col, id, opt = {}) => write(async () => {
    await be.remove(TABLE[col], id); if (S[col]) S[col] = S[col].filter(x => x.id !== id);
    if (opt.log) await S.log(col + '.delete', opt.log); if (!opt.silent) S.emit('change');
  });
  S.where = (col, f, v, o) => be.where(TABLE[col], f, v, o);

  // ---- sự kiện: bản ghi trung tâm ----
  S.createEvent = row => write(async () => {
    const clean = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === '' ? null : v]));
    const r = await be.insert('wr_events', {...clean, name: row.name.trim()});
    S.events.unshift(r); await S.log('event.create', `Tạo sự kiện ${r.code} — ${r.name}`, r.id); S.emit('change'); return r;
  });
  // Đổi dữ kiện của sự kiện → KHÔNG tự sửa tài liệu đã viết; chỉ đánh dấu những đầu ra có thể bị ảnh hưởng để Vy rà lại.
  const FACT = {name: 'Tên sự kiện', event_date: 'Ngày', event_time: 'Giờ', venue: 'Địa điểm', organizer: 'Đơn vị tổ chức', attendees: 'Thành phần', brief: 'Brief'};
  S.updateEvent = (id, patch, what = '') => write(async () => {
    const old = S.eventOf(id), changed = Object.keys(FACT).filter(k => k in patch && (patch[k] || '') !== (old[k] || ''));
    if (changed.length) {
      const at = new Date().toISOString(), marks = changed.map(k => ({field: k, label: FACT[k], old: old[k] || '', new: patch[k] || '', at}));
      const affected = S.articles.filter(a => a.event_id === id && (a.body || a.title));
      const hasTl = S.timeline.some(t => t.event_id === id), hasAs = old.assign && (old.assign.content || old.assign.media || old.assign.editor);
      if (affected.length || hasTl || hasAs) patch = {...patch, needs_check: [...(old.needs_check || []), ...marks]};
      for (const a of affected) {
        const r = await be.update('wr_articles', a.id, {stale: [...(a.stale || []), ...marks]});
        S.articles = S.articles.map(x => x.id === a.id ? r : x);
      }
    }
    const r = await be.update('wr_events', id, patch);
    S.events = S.events.map(e => e.id === id ? r : e);
    await S.log('event.update', `${r.code}: ${what || (changed.length ? 'đổi ' + changed.map(k => FACT[k]).join(', ') : 'cập nhật')}`, id);
    S.emit('change'); return r;
  });

  S.createTask = t => S.add('tasks', {title: t.title.trim(), description: t.description || null, event_id: t.event_id || null, owner_name: t.owner_name || null,
    deadline: t.deadline || null, priority: t.priority || 'normal', source: t.source || 'manual', ref: t.ref || {}}, {log: `Thêm việc: ${t.title.trim()}`});
  S.updateTask = (id, patch) => {
    if (patch.status) patch.done_at = patch.status === 'done' ? new Date().toISOString() : null;
    const t = S.tasks.find(x => x.id === id);
    return S.set('tasks', id, patch, {log: patch.status ? `${t ? t.title : 'Việc'} → ${({todo: 'Chưa làm', doing: 'Đang làm', done: 'Xong'})[patch.status]}` : null});
  };
  S.removeTask = id => { const t = S.tasks.find(x => x.id === id); return S.del('tasks', id, {log: t ? `Xoá việc: ${t.title}` : null}); };

  S.setSetting = (k, v) => write(async () => { S.settings = {...S.settings, [k]: v}; await be.setSettings(S.settings); S.emit('change'); });
  // sao lưu / khôi phục toàn bộ dữ liệu Workroom
  S.exportAll = async () => {
    const out = {format: 'vy-workroom-backup', version: 2, exported_at: new Date().toISOString(), source: local ? 'local-dev' : 'supabase', settings: S.settings};
    for (const k of Object.keys(COLS)) if (k !== 'ailog') out[k] = S[k];
    out.versions = await be.list('wr_versions', {limit: 5000}); out.reviews = await be.list('wr_reviews', {limit: 2000});
    return out;
  };
  // khôi phục: chỉ THÊM những bản ghi chưa có (theo id) — không ghi đè, không xoá
  S.restore = data => write(async () => {
    if (!data || data.format !== 'vy-workroom-backup') throw new Error('File này không phải file sao lưu của Workroom');
    let n = 0;
    for (const k of ['events', 'knowledge', 'staff', 'articles', 'tasks', 'timeline', 'chats', 'versions', 'reviews']) {
      const have = new Set((S[k] || await be.list(TABLE[k], {limit: 5000})).map(r => r.id));
      for (const r of data[k] || []) if (r && r.id && !have.has(r.id)) { try { await be.insert(TABLE[k], r); n++; } catch (e) { console.warn('[workroom] khôi phục', k, e.message); } }
    }
    await S.log('backup.restore', `Khôi phục từ file sao lưu: thêm ${n} bản ghi`); await S.reload(); return n;
  });

  await S.reload();
  return S;
}
