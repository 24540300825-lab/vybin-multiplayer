// PHÒNG VY — WORKROOM · danh sách module + các module lõi (Overview, Task Manager, Hoạt động, Cài đặt & Kết nối).
// Thêm module mới: viết 1 file m-xxx.js xuất hàm render(ctx) rồi thêm 1 dòng vào MODULES.
import {STAGES, stageName} from './store.js';
import {h, icon, head, card, chip, btn, run, errBox, fmtD, fmtDT, dialog, confirmBox, download, pickFile} from './ui.js';
import {MODEL_GUIDE, detectMachine, isCloud} from './ai.js';
import {assistant} from './m-assistant.js';
import {content, A_STATUS} from './m-content.js';
import {editorial} from './m-editorial.js';
import {timeline} from './m-timeline.js';
import {staff} from './m-staff.js';
import {knowledge} from './m-knowledge.js';
export {h, icon};

const isLate = t => t.status !== 'done' && t.deadline && new Date(t.deadline) < new Date();
const byDeadline = (a, b) => (a.deadline || '9') < (b.deadline || '9') ? -1 : 1;
const evTag = (S, id) => { const e = S.eventOf(id); return e ? h('span', {class: 'wr-tag code', title: e.name}, e.code) : null; };
function taskRow(ctx, t, err) {
  const S = ctx.store;
  return h('div', {class: 'wr-row' + (t.status === 'done' ? ' done' : '')},
    h('button', {class: 'wr-check' + (t.status === 'done' ? ' on' : ''), title: t.status === 'done' ? 'Đánh dấu chưa xong' : 'Đánh dấu đã xong', 'aria-label': 'Hoàn thành: ' + t.title, onclick: run(err, () => S.updateTask(t.id, {status: t.status === 'done' ? 'todo' : 'done'}))}, icon('tick')),
    h('span', {class: 't', title: t.title + (t.description ? '\n' + t.description : '')}, t.title), t.owner_name && h('span', {class: 'm'}, t.owner_name),
    t.source !== 'manual' && h('span', {class: 'wr-tag', title: 'Nguồn tạo việc'}, {chat: 'Trợ lý', timeline: 'Timeline', editorial: 'Biên tập', assignment: 'Phân công'}[t.source]),
    t.priority === 'high' && h('span', {class: 'wr-tag high'}, 'Ưu tiên'), evTag(S, t.event_id),
    t.deadline && h('span', {class: 'wr-tag' + (isLate(t) ? ' late' : '')}, (isLate(t) ? 'Quá hạn · ' : '') + fmtDT(t.deadline)));
}

// ===================== OVERVIEW (kèm INTAKE: nhập brief → AI trích → Vy xác nhận) =====================
const X_SCHEMA = {type: 'object', properties: {name: {type: 'string'}, date: {type: 'string'}, time: {type: 'string'}, venue: {type: 'string'}, organizer: {type: 'string'}, attendees: {type: 'string'}, objectives: {type: 'string'}, activities: {type: 'string'}}};
async function extractBrief(ctx, ev, err) {
  const S = ctx.store, brief = ev.brief || ''; if (brief.trim().length < 40) throw new Error('Brief còn quá ngắn để trích thông tin.');
  const o = await ctx.ai.json({heavy: true, task: 'Trích thông tin từ brief', system: 'Trích thông tin sự kiện từ brief. Chỉ lấy điều CÓ GHI trong brief; không có thì để chuỗi rỗng, không suy đoán. date dạng YYYY-MM-DD, time như trong brief (vd 8h00). attendees: thành phần tham dự/khách mời, giữ nguyên họ tên và chức danh.',
    prompt: 'BRIEF:\n' + brief.slice(0, 7000)}, X_SCHEMA, o => { if (!o || typeof o !== 'object') throw new Error('không phải object'); return o; });
  const nz = s => String(s || '').replace(/\s+/g, ' ').trim(), B = nz(brief).toLowerCase();
  const F = [['name', 'Tên sự kiện', nz(o.name)], ['event_date', 'Ngày', /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : ''], ['event_time', 'Giờ', nz(o.time)], ['venue', 'Địa điểm', nz(o.venue)], ['organizer', 'Đơn vị tổ chức', nz(o.organizer)], ['attendees', 'Thành phần', nz(o.attendees)], ['note', 'Mục tiêu / hoạt động', [nz(o.objectives), nz(o.activities)].filter(Boolean).join(' · ')]]
    .filter(f => f[2]).map(([k, l, v]) => ({k, l, v, cur: ev[k] || '', inBrief: k === 'event_date' || k === 'note' ? null : B.includes(v.toLowerCase().slice(0, 40)), pick: !ev[k]}));
  if (!F.length) throw new Error('AI không trích được thông tin nào từ brief.');
  const tbody = h('tbody', {}, F.map(f => h('tr', {},
    h('td', {}, h('input', {type: 'checkbox', checked: f.pick, 'aria-label': 'Dùng ' + f.l, onchange: e => { f.pick = e.target.checked; }})),
    h('td', {}, f.l),
    h('td', {}, h('input', {class: 'wr-cell', style: 'min-width:260px', value: f.v, 'aria-label': f.l, oninput: e => { f.v = e.target.value; }})),
    h('td', {}, f.cur || '—'),
    h('td', {}, f.inBrief == null ? '—' : f.inBrief ? h('span', {class: 'wr-tag ok'}, 'Có nguyên văn trong brief') : h('span', {class: 'wr-tag late'}, 'Không thấy nguyên văn — kiểm tra')))));
  const table = h('div', {class: 'wr-tablewrap'}, h('table', {class: 'wr-table'}, h('thead', {}, h('tr', {}, ['Dùng', 'Mục', 'AI trích được', 'Đang có', 'Đối chiếu'].map(t => h('th', {}, t)))), tbody));
  const ok = await dialog({title: 'Thông tin AI trích từ brief — bạn xác nhận', wide: true, buttons: [['Bỏ', null], ['Xác nhận các mục đã chọn', true, 'primary']],
    body: h('div', {}, table, h('p', {class: 'wr-empty'}, 'Chỉ những mục được tick mới ghi vào sự kiện và trở thành dữ kiện chính thức cho các module khác.'))});
  if (!ok) return; const patch = Object.fromEntries(F.filter(f => f.pick && f.v.trim()).map(f => [f.k, f.v.trim()]));
  if (Object.keys(patch).length) await S.updateEvent(ev.id, {...patch, stage: ev.stage === 'intake' ? 'brief' : ev.stage}, 'xác nhận thông tin trích từ brief');
}
function overview(ctx) {
  const S = ctx.store, cur = ctx.event(), err = errBox();
  const open = S.tasks.filter(t => t.status !== 'done').sort(byDeadline), late = open.filter(isLate), events = S.events.filter(e => !e.archived);
  const soon = open.filter(t => t.deadline && !isLate(t) && new Date(t.deadline) - Date.now() < 7 * 864e5), waiting = S.articles.filter(a => a.status === 'review');
  const nm = h('input', {class: 'grow', placeholder: 'Tên sự kiện / dự án mới…', maxLength: 200, required: true, 'aria-label': 'Tên sự kiện'}), dt = h('input', {type: 'date', 'aria-label': 'Ngày diễn ra'});
  const setup = [
    [ctx.g.status === 'connected', 'Kết nối Google Workspace', 'Drive, Docs, Sheets là nơi lưu và soạn tài liệu.', 'settings'],
    [ctx.ai.ready, 'Bật trợ lý AI (Ollama)', 'Model chạy trên máy (miễn phí, riêng tư) và tuỳ chọn model đám mây mạnh nhất cho viết & biên tập.', 'settings'],
    [S.knowledge.some(d => d.status === 'official'), 'Xác nhận tài liệu mẫu chính thức', 'Xem các bài mẫu trong Knowledge Hub và đánh dấu "Chính thức" để AI viết đúng quy chuẩn.', 'knowledge'],
    [events.length > 0, 'Tạo sự kiện đầu tiên', 'Mọi bài viết, timeline, phân công và việc cần làm đều gắn vào một sự kiện.', null]];
  const fld = (k, label, type = 'text', w = '') => h('label', {class: 'wr-fld' + (w ? ' ' + w : '')}, h('span', {}, label), h('input', {class: 'wr-in', type, value: cur[k] || '', 'aria-label': label, onchange: run(err, e => S.updateEvent(cur.id, {[k]: e.target.value.trim() || null}))}));
  let evCard = null;
  if (cur) {
    const arts = S.articles.filter(a => a.event_id === cur.id), tl = S.timeline.filter(t => t.event_id === cur.id), a = cur.assign || {}, links = cur.links || {};
    const next = !cur.brief ? ['Thêm brief cho sự kiện (ô bên dưới).', null] : !tl.length ? ['Lập timeline truyền thông.', 'timeline'] : !(a.content || a.media) ? ['Phân công nhân sự.', 'staff'] : !arts.length ? ['Viết bài đầu tiên.', 'content'] : arts.some(x => x.status === 'draft' || x.status === 'review') ? ['Biên tập và duyệt bài.', 'editorial'] : ['Các bước chính đã xong — có thể lưu trữ.', null];
    const brief = h('textarea', {class: 'wr-in', rows: 6, placeholder: 'Dán brief của sự kiện vào đây, hoặc nạp từ file…', 'aria-label': 'Brief', value: cur.brief || '', onchange: run(err, e => S.updateEvent(cur.id, {brief: e.target.value.trim() || null}))});
    evCard = h('section', {class: 'wr-card span'}, h('h3', {}, `${cur.code} — ${cur.name}`, cur.is_demo && h('span', {class: 'wr-tag demo'}, 'DEMO')),
      (cur.needs_check || []).length > 0 && h('div', {class: 'wr-banner'}, icon('warn'), h('div', {}, h('b', {}, 'Thông tin sự kiện vừa đổi — các đầu ra sau cần rà lại: '), [arts.filter(x => (x.stale || []).length).length && `${arts.filter(x => (x.stale || []).length).length} bài viết`, tl.length && 'timeline', (a.content || a.media) && 'phân công'].filter(Boolean).join(', ') + '. ',
        cur.needs_check.map(c => `${c.label}: "${c.old || '(trống)'}" → "${c.new || '(trống)'}"`).join('; ')), btn('Đã rà xong', run(err, () => S.set('events', cur.id, {needs_check: []}, {log: `${cur.code}: đã rà lại sau khi đổi thông tin`})), {ghost: true})),
      h('div', {class: 'wr-fields'}, fld('name', 'Tên sự kiện', 'text', 'w2'), fld('event_date', 'Ngày', 'date'), fld('event_time', 'Giờ (vd 8h00)'), fld('venue', 'Địa điểm', 'text', 'w2'), fld('organizer', 'Đơn vị tổ chức'), fld('attendees', 'Thành phần tham dự', 'text', 'w3')),
      h('div', {class: 'wr-form', style: 'margin-top:12px'}, h('label', {}, 'Đang ở bước '), h('select', {class: 'wr-in', 'aria-label': 'Bước hiện tại', onchange: run(err, e => S.updateEvent(cur.id, {stage: e.target.value}, 'chuyển sang bước ' + stageName(e.target.value)))}, STAGES.map(([id, n]) => h('option', {value: id, selected: id === cur.stage}, n))),
        h('span', {class: 'm'}, 'Bước tiếp theo: ' + next[0]), next[1] && btn('Mở', () => ctx.go(next[1]), {ghost: true}),
        h('span', {style: 'flex:1'}), links.folder && h('a', {class: 'wr-tag', href: links.folder.url, target: '_blank', rel: 'noopener'}, 'Thư mục Drive'), links.timeline_sheet && h('a', {class: 'wr-tag', href: links.timeline_sheet.url, target: '_blank', rel: 'noopener'}, 'Sheet timeline'),
        btn('Lưu trữ sự kiện', run(err, async () => { if (await confirmBox('Lưu trữ sự kiện', `Đưa ${cur.code} vào lưu trữ? Dữ liệu vẫn giữ nguyên, chỉ ẩn khỏi danh sách đang chạy.`, 'Lưu trữ')) { await S.updateEvent(cur.id, {archived: true, stage: 'archive'}, 'lưu trữ'); ctx.setEvent(null); } }), {ghost: true})),
      h('div', {class: 'wr-stages'}, STAGES.map(([id, n], i) => h('span', {class: id === cur.stage ? 'now' : i < STAGES.findIndex(s => s[0] === cur.stage) ? 'past' : ''}, n))),
      h('div', {class: 'wr-form', style: 'margin:14px 0 6px'}, h('b', {}, 'Brief'), h('span', {class: 'm'}, `${arts.length} bài · ${tl.length} mục timeline`), h('span', {style: 'flex:1'}),
        btn('Nạp brief từ file', run(err, async () => { const f = await pickFile('.docx,.txt,.md'); if (!f) return; const {readAnyFile} = await import('./files.js'); await S.updateEvent(cur.id, {brief: (await readAnyFile(f)).text}, 'nạp brief từ ' + f.name); }), {ghost: true, icon: 'up'}),
        btn('AI trích thông tin từ brief', run(err, async () => { ctx.note('AI đang đọc brief…'); await extractBrief(ctx, S.eventOf(cur.id), err); }), {icon: 'spark', disabled: !ctx.ai.ready || !cur.brief, title: ctx.ai.ready ? '' : 'AI trên máy chưa sẵn sàng'})), brief);
  }
  return h('div', {class: 'wr-wrap'},
    head('Chào Vy', new Date().toLocaleDateString('vi-VN', {weekday: 'long', day: 'numeric', month: 'long'}) + ' — ' + (open.length ? `${open.length} việc đang chờ${late.length ? `, ${late.length} việc quá hạn` : ''}.` : 'chưa có việc nào đang chờ.')),
    h('div', {class: 'wr-grid'},
      setup.some(s => !s[0]) && h('section', {class: 'wr-card span'}, h('h3', {}, 'Bắt đầu sử dụng', h('span', {}, `${setup.filter(s => s[0]).length}/${setup.length} bước`)),
        h('div', {class: 'wr-steps'}, setup.map(([ok, t, d, go], i) => h('div', {class: 'wr-step' + (ok ? ' ok' : '')}, h('span', {class: 'n'}, ok ? icon('tick') : i + 1), h('div', {style: 'flex:1'}, h('b', {}, t), h('span', {}, d)), !ok && go && btn('Mở', () => ctx.go(go), {ghost: true}))))),
      h('section', {class: 'wr-card span'}, h('h3', {}, 'Sự kiện đang chạy', events.length > 0 && h('span', {}, events.length + ' sự kiện')),
        events.length ? events.slice(0, 12).map(e => h('div', {class: 'wr-row'}, h('span', {class: 'wr-tag code'}, e.code), e.is_demo && h('span', {class: 'wr-tag demo'}, 'DEMO'), h('span', {class: 't', title: e.name}, e.name),
          (e.needs_check || []).length > 0 && h('span', {class: 'wr-tag late'}, 'Cần rà lại'), e.event_date && h('span', {class: 'm'}, fmtD(e.event_date + 'T12:00')), h('span', {class: 'wr-tag'}, stageName(e.stage)),
          cur && cur.id === e.id ? h('span', {class: 'm'}, 'đang chọn') : h('button', {class: 'wr-btn ghost', onclick: () => ctx.setEvent(e.id)}, 'Chọn'))) : h('p', {class: 'wr-empty'}, 'Chưa có sự kiện nào. Tạo sự kiện đầu tiên ở ngay bên dưới.'),
        h('form', {class: 'wr-form', style: 'margin-top:12px', onsubmit: run(err, async () => { const e = await S.createEvent({name: nm.value, event_date: dt.value}); ctx.setEvent(e.id); })}, nm, dt, btn('Tạo sự kiện', null, {type: 'submit', icon: 'plus'})), err),
      evCard,
      card('Việc đang chờ', open.length || null, open.length ? open.slice(0, 6).map(t => taskRow(ctx, t, err)) : h('p', {class: 'wr-empty'}, 'Không có việc nào đang chờ.'), h('div', {style: 'margin-top:10px'}, btn('Mở Task Manager', () => ctx.go('tasks'), {ghost: true}))),
      card('Hạn trong 7 ngày tới', soon.length || null, soon.length ? soon.slice(0, 6).map(t => taskRow(ctx, t, err)) : h('p', {class: 'wr-empty'}, 'Không có hạn nào trong 7 ngày tới.')),
      card('Bài chờ biên tập', waiting.length || null, waiting.length ? waiting.slice(0, 6).map(a => h('div', {class: 'wr-row'}, h('button', {class: 't wr-linkbtn', onclick: () => { (ctx.ui.editorial ||= {}).id = a.id; ctx.go('editorial'); }}, a.title), evTag(S, a.event_id), h('span', {class: 'm'}, fmtDT(a.updated_at)))) : h('p', {class: 'wr-empty'}, 'Không có bài nào đang chờ biên tập.')),
      card('Timeline', null, (() => { const es = events.filter(e => S.timeline.some(t => t.event_id === e.id)); return es.length ? es.slice(0, 6).map(e => { const l = S.timeline.filter(t => t.event_id === e.id), d = l.filter(t => t.done).length; return h('div', {class: 'wr-row'}, h('span', {class: 'wr-tag code'}, e.code), h('button', {class: 't wr-linkbtn', onclick: () => { ctx.setEvent(e.id); ctx.go('timeline'); }}, e.name), h('span', {class: 'm'}, `${d}/${l.length} mục xong`)); }) : h('p', {class: 'wr-empty'}, 'Chưa có timeline nào.'); })()),
      h('section', {class: 'wr-card span'}, h('h3', {}, 'Hoạt động gần đây'), S.activity.length ? S.activity.slice(0, 6).map(a => h('div', {class: 'wr-row'}, evTag(S, a.event_id), h('span', {class: 't', title: a.summary}, a.summary), h('span', {class: 'm'}, fmtDT(a.at)))) : h('p', {class: 'wr-empty'}, 'Chưa có hoạt động nào.'))));
}

// ===================== TASK MANAGER =====================
function tasks(ctx) {
  const S = ctx.store, cur = ctx.event(), f = ctx.ui.taskFilter ||= {scope: 'all', status: 'open'}, err = errBox();
  let list = S.tasks.filter(t => (f.scope === 'all' || !cur || t.event_id === cur.id) && (f.status === 'all' || (f.status === 'open' ? t.status !== 'done' : f.status === 'late' ? isLate(t) : t.status === f.status)));
  list = list.sort((a, b) => (a.status === 'done') - (b.status === 'done') || byDeadline(a, b));
  const scoped = S.tasks.filter(t => f.scope === 'all' || !cur || t.event_id === cur.id), done = scoped.filter(t => t.status === 'done').length;
  const ti = h('input', {class: 'grow', placeholder: 'Việc cần làm…', maxLength: 300, required: true, 'aria-label': 'Tên việc'}), dl = h('input', {type: 'datetime-local', 'aria-label': 'Hạn chót'}), ow = h('input', {placeholder: 'Người phụ trách', style: 'width:150px', 'aria-label': 'Người phụ trách', list: 'wrOwners'});
  const pr = h('select', {'aria-label': 'Mức ưu tiên'}, h('option', {value: 'normal'}, 'Bình thường'), h('option', {value: 'high'}, 'Ưu tiên'), h('option', {value: 'low'}, 'Thấp'));
  const ev = h('select', {'aria-label': 'Thuộc sự kiện'}, h('option', {value: ''}, 'Không gắn sự kiện'), S.events.filter(e => !e.archived).map(e => h('option', {value: e.id, selected: cur && cur.id === e.id}, e.code + ' — ' + e.name)));
  const sel = (k, opts) => h('select', {class: 'wr-in', 'aria-label': 'Lọc', onchange: e => { f[k] = e.target.value; ctx.render(); }}, opts.map(([v, n]) => h('option', {value: v, selected: f[k] === v}, n)));
  return h('div', {class: 'wr-wrap'}, head('Task Manager', 'Mọi việc của Workroom nằm ở một chỗ, gắn với sự kiện.'), h('datalist', {id: 'wrOwners'}, S.staff.filter(s => s.active).map(s => h('option', {value: s.name}))),
    h('section', {class: 'wr-card', style: 'margin-bottom:16px'}, h('form', {class: 'wr-form', onsubmit: run(err, () => S.createTask({title: ti.value, deadline: dl.value ? new Date(dl.value).toISOString() : null, priority: pr.value, event_id: ev.value || null, owner_name: ow.value.trim() || null}))}, ti, ow, dl, pr, ev, btn('Thêm việc', null, {type: 'submit', icon: 'plus'})), err),
    h('section', {class: 'wr-card'}, h('h3', {}, 'Danh sách', h('span', {}, `${done}/${scoped.length} việc đã xong`)),
      h('div', {class: 'wr-bar', style: 'margin-bottom:12px', role: 'progressbar', 'aria-valuenow': scoped.length ? Math.round(done / scoped.length * 100) : 0, 'aria-valuemin': 0, 'aria-valuemax': 100}, h('i', {style: `width:${scoped.length ? done / scoped.length * 100 : 0}%`})),
      h('div', {class: 'wr-form', style: 'margin-bottom:6px'}, sel('status', [['open', 'Chưa xong'], ['doing', 'Đang làm'], ['late', 'Quá hạn'], ['done', 'Đã xong'], ['all', 'Tất cả']]), cur && sel('scope', [['all', 'Mọi sự kiện'], ['event', 'Chỉ ' + cur.code]])),
      list.length ? list.map(t => { const r = taskRow(ctx, t, err);
        r.append(h('select', {class: 'wr-in', 'aria-label': 'Trạng thái của ' + t.title, onchange: run(err, e => S.updateTask(t.id, {status: e.target.value}))}, [['todo', 'Chưa làm'], ['doing', 'Đang làm'], ['done', 'Xong']].map(([v, n]) => h('option', {value: v, selected: t.status === v}, n))),
          h('button', {class: 'wr-x', title: 'Xoá việc này', 'aria-label': 'Xoá ' + t.title, onclick: run(err, async () => { if (await confirmBox('Xoá việc', `Xoá việc "${t.title}"? Không khôi phục được.`, 'Xoá', true)) await S.removeTask(t.id); })}, icon('x')));
        return r; }) : h('p', {class: 'wr-empty'}, 'Không có việc nào khớp bộ lọc.')));
}
function activity(ctx) {
  const S = ctx.store;
  return h('div', {class: 'wr-wrap'}, head('Hoạt động & Lịch sử', 'Mọi thay đổi trong Workroom — kể cả việc trợ lý AI thực hiện — được ghi lại ở đây.'),
    h('section', {class: 'wr-card'}, S.activity.length ? S.activity.map(a => h('div', {class: 'wr-row'}, evTag(S, a.event_id), /^action\./.test(a.kind) && h('span', {class: 'wr-tag demo'}, 'Trợ lý'), h('span', {class: 't', title: a.summary}, a.summary), h('span', {class: 'm'}, fmtDT(a.at)))) : h('p', {class: 'wr-empty'}, 'Chưa có hoạt động nào.')));
}

// ===================== CÀI ĐẶT & KẾT NỐI =====================
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vy-workroom:' + s)))].map(b => b.toString(16).padStart(2, '0')).join('');
export const pinOk = async (store, pin) => !store.settings.pin_hash || await sha(pin) === store.settings.pin_hash;
function settings(ctx) {
  const S = ctx.store, AI = ctx.ai, G = ctx.g, U = ctx.ui.settings ||= {}, err = errBox(), st = AI.state, M = U.machine ||= detectMachine(ctx.ai.cfg.macRam), stats = AI.stats(), origin = location.origin;
  const row = (name, c, note) => h('div', {class: 'wr-row'}, h('span', {class: 't wrap'}, name), note && h('span', {class: 'm'}, note), c);
  const aiChip = st.status === 'online' ? (AI.ready ? chip('ok', 'Đang chạy') : chip('warn', AI.cfg.model ? 'Chưa dùng được model ' + AI.cfg.model : 'Chưa có model')) : st.status === 'origin' ? chip('bad', 'Bị chặn (OLLAMA_ORIGINS)') : st.status === 'offline' ? chip('bad', 'Không kết nối được') : chip('', 'Chưa kiểm tra');
  const out = h('p', {class: 'wr-empty'}, U.test || '');
  const test = which => run(err, async () => { U.test = 'Đang chờ model trả lời…'; ctx.render(); const t0 = performance.now(); try { const r = await AI.chat({heavy: which === 'heavy', task: 'Thử kết nối', prompt: 'Trả lời đúng một câu tiếng Việt ngắn: chào Vy và nói bạn đã sẵn sàng làm việc.', maxTokens: 80}); U.test = `${r.model} trả lời sau ${((performance.now() - t0) / 1000).toFixed(1)} giây: “${r.text.trim().slice(0, 200)}”`; } catch (e) { U.test = ''; throw e; } finally { ctx.render(); } });
  // bật model đám mây: hỏi rõ trước, vì nội dung công việc sẽ được gửi lên máy chủ Ollama
  const allowCloud = async () => { if (AI.cfg.cloudOk) return true;
    const ok = await dialog({title: 'Dùng model đám mây (Ollama Cloud)?', body: h('div', {class: 'wr-stack'},
      h('p', {}, 'Model đám mây chạy trên máy chủ của Ollama, không chạy trên máy này. Khi dùng, nội dung Vy đưa cho AI (brief, bài viết, danh sách nhân sự…) sẽ được gửi lên máy chủ đó để xử lý.'),
      h('p', {}, 'Theo Ollama: không lưu và không dùng dữ liệu này để huấn luyện. Cần đăng nhập tài khoản Ollama; gói miễn phí có ít lượt dùng, dùng nhiều cần gói trả phí của Ollama (Workroom không tự mua hay tự trả phí).'),
      h('p', {class: 'wr-empty'}, 'Có thể tắt lại bất cứ lúc nào. Workroom không bao giờ tự chuyển sang đám mây khi model trên máy lỗi.')), buttons: [['Không', null], ['Cho phép dùng model đám mây', true, 'primary']]});
    if (!ok) return false; AI.setCfg({cloudOk: true}); await S.log('ai.cloud', 'Cho phép dùng model đám mây (Ollama Cloud)'); return true; };
  const choose = (slot, tag) => async () => { if (isCloud(tag) && !await allowCloud()) return ctx.render(); AI.setCfg({[slot]: tag}); ctx.render(); };
  const pull = (tag, slot) => run(err, async () => { if (isCloud(tag) && !await allowCloud()) return; U.pull = {tag, text: 'Bắt đầu…'}; ctx.render();
    try { await AI.pull(tag, p => { U.pull.text = `${p.status || ''}${p.pct != null ? ' ' + p.pct + '%' : ''}`; const el = document.querySelector('#wr .wr-pull'); if (el) el.textContent = `Đang tải ${tag}: ${U.pull.text}`; }); AI.setCfg({[slot]: tag}); ctx.note('Đã sẵn sàng ' + tag); } finally { U.pull = null; ctx.render(); } });
  const opts = cur => [!AI.has(cur) && h('option', {value: cur}, cur ? cur + ' (chưa có trên máy)' : '— chưa chọn —'), ...st.models.map(m => h('option', {value: m.name, selected: m.name === cur}, `${m.name}${isCloud(m.name) ? ' ☁ đám mây' : m.size ? ' · ' + (m.size / 1e9).toFixed(1) + ' GB' : ''}`))];
  const pickSel = (slot, label) => h('select', {class: 'wr-in', 'aria-label': label, onchange: e => choose(slot, e.target.value)()}, slot === 'heavy' && h('option', {value: '', selected: !AI.cfg.heavy}, '— dùng model hằng ngày —'), opts(AI.cfg[slot]));
  const guideRow = g => { const have = AI.has(g.tag), cloud = g.where === 'cloud', rec = cloud ? g.tag === 'kimi-k3:cloud' : g.tag === M.pick;
    return h('tr', {}, h('td', {}, h('b', {}, g.tag), rec && h('span', {class: 'wr-tag ok'}, cloud ? 'Mạnh nhất' : 'Gợi ý cho máy này')), h('td', {}, g.size), h('td', {}, g.need), h('td', {}, g.note),
      h('td', {}, h('div', {class: 'wr-form'}, have ? [btn('Dùng hằng ngày', choose('model', g.tag), {ghost: true, disabled: AI.cfg.model === g.tag}), btn('Dùng cho việc nặng', choose('heavy', g.tag), {ghost: true, disabled: AI.cfg.heavy === g.tag})]
        : btn(cloud ? 'Thêm' : 'Tải', async () => { if (cloud || await confirmBox('Tải model', `Tải ${g.tag} (${g.size}) về máy này qua Ollama? Cần ổ đĩa trống tương ứng và mạng ổn định.`, 'Tải về')) pull(g.tag, cloud ? 'heavy' : 'model')(); }, {ghost: true, icon: 'down', disabled: st.status !== 'online' || !!U.pull})))); };
  const table = list => h('div', {class: 'wr-tablewrap', style: 'margin-top:8px'}, h('table', {class: 'wr-table'}, h('thead', {}, h('tr', {}, ['Model', 'Tải về', 'Phù hợp với', 'Ghi chú', ''].map(t => h('th', {}, t)))), h('tbody', {}, list.map(guideRow))));
  const cmdWin = `setx OLLAMA_ORIGINS "${origin}"`, cmdMac = `launchctl setenv OLLAMA_ORIGINS "${origin}"`;
  // giữ cài đặt sau khi khởi động lại Mac: LaunchAgent của riêng người dùng, chạy lại lệnh trên mỗi lần đăng nhập
  const cmdMacKeep = `mkdir -p ~/Library/LaunchAgents && printf '%s\\n' '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>vy.ollama.origins</string><key>ProgramArguments</key><array><string>/bin/launchctl</string><string>setenv</string><string>OLLAMA_ORIGINS</string><string>${origin}</string></array><key>RunAtLoad</key><true/></dict></plist>' > ~/Library/LaunchAgents/vy.ollama.origins.plist && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/vy.ollama.origins.plist 2>/dev/null; true`;
  const copy = t => btn('Sao chép', () => navigator.clipboard.writeText(t).then(() => ctx.note('Đã sao chép lệnh.')), {ghost: true, icon: 'copy'});
  const gs = G.status, backup = run(err, async () => { download(new Blob([JSON.stringify(await S.exportAll(), null, 2)], {type: 'application/json'}), 'workroom-' + new Date().toISOString().slice(0, 10) + '.json'); ctx.note('Đã tải file sao lưu về máy.'); });
  const restore = run(err, async () => { const f = await pickFile('.json'); if (!f) return; let d; try { d = JSON.parse(await f.text()); } catch (e) { throw new Error('File không đọc được.'); }
    if (!await confirmBox('Khôi phục từ file sao lưu', 'Chỉ THÊM những bản ghi chưa có. Không ghi đè, không xoá gì đang có.', 'Khôi phục')) return; ctx.note(`Đã thêm ${await S.restore(d)} bản ghi.`); });
  const setPin = run(err, async () => { const a = h('input', {class: 'wr-in', type: 'password', inputMode: 'numeric', placeholder: 'Mã khoá mới (4–12 ký tự)', 'aria-label': 'Mã khoá mới'});
    const v = await dialog({title: 'Đặt mã khoá Workroom', body: h('div', {class: 'wr-stack'}, h('p', {}, 'Mỗi lần mở Workroom trong một phiên trình duyệt mới sẽ hỏi mã này. Đây là lớp khoá thêm cho màn hình — quyền truy cập dữ liệu vẫn do tài khoản Google của bạn quyết định.'), a), buttons: [['Huỷ', null], ['Đặt mã', () => a.value, 'primary']]});
    if (v == null) return; if (v.length < 4 || v.length > 12) throw new Error('Mã khoá cần 4–12 ký tự.'); const hsh = await sha(v); sessionStorage.setItem('vyWrUnlocked', '1'); await S.setSetting('pin_hash', hsh); ctx.note('Đã đặt mã khoá.'); });
  return h('div', {class: 'wr-wrap'}, head('Cài đặt & Kết nối'), err,
    h('div', {class: 'wr-grid'},
      h('section', {class: 'wr-card span'}, h('h3', {}, 'Trợ lý AI (qua Ollama)', h('span', {}, 'Không gọi API trả phí')),
        row('Trạng thái', aiChip, st.version ? 'Ollama ' + st.version : ''), st.error && st.status !== 'online' && h('p', {class: 'wr-err'}, st.error),
        h('div', {class: 'wr-fields', style: 'margin:10px 0'},
          h('label', {class: 'wr-fld w2'}, h('span', {}, 'Model hằng ngày — trò chuyện, tóm tắt, trả lời nhanh'), pickSel('model', 'Model hằng ngày')),
          h('label', {class: 'wr-fld'}, h('span', {}, 'Model mạnh — viết bài, biên tập, timeline, phân công'), pickSel('heavy', 'Model mạnh')),
          h('label', {class: 'wr-fld'}, h('span', {}, 'Bộ nhớ ngữ cảnh (model trên máy)'), h('select', {class: 'wr-in', 'aria-label': 'Bộ nhớ ngữ cảnh', title: 'Lớn hơn = đọc được bài dài hơn nhưng tốn bộ nhớ card đồ hoạ hơn', onchange: e => AI.setCfg({ctx: +e.target.value})}, [8192, 16384, 32768, 65536].map(v => h('option', {value: v, selected: v === AI.cfg.ctx}, v / 1024 + 'k')))),
          h('label', {class: 'wr-fld'}, h('span', {}, 'Chờ tối đa'), h('select', {class: 'wr-in', 'aria-label': 'Thời gian chờ', onchange: e => AI.setCfg({timeout: +e.target.value})}, [60, 120, 180, 300, 600].map(v => h('option', {value: v, selected: v === AI.cfg.timeout}, v + ' giây')))),
          h('label', {class: 'wr-fld'}, h('span', {}, 'Model đám mây'), h('div', {class: 'wr-form'}, AI.cfg.cloudOk ? chip('warn', 'Đang cho phép') : chip('', 'Đang tắt'),
            AI.cfg.cloudOk ? btn('Tắt', run(err, async () => { AI.setCfg({cloudOk: false}); await S.log('ai.cloud', 'Tắt model đám mây'); ctx.render(); }), {ghost: true}) : btn('Cho phép…', run(err, async () => { await allowCloud(); ctx.render(); }), {ghost: true})))),
        h('div', {class: 'wr-form'}, btn('Kiểm tra kết nối', run(err, async () => { await AI.probe(); ctx.render(); }), {ghost: true, icon: 'refresh'}), btn('Thử model hằng ngày', test('model'), {ghost: true, disabled: !AI.ready}),
          AI.cfg.heavy && btn('Thử model mạnh', test('heavy'), {ghost: true, disabled: !AI.ready || !AI.has(AI.cfg.heavy)}), AI.state.busy > 0 && btn('Dừng tác vụ đang chạy', () => AI.stop(), {danger: true, icon: 'stop'})), out,
        AI.cfg.heavy && isCloud(AI.cfg.heavy) && !AI.cfg.cloudOk && h('p', {class: 'wr-err'}, 'Model mạnh đang chọn là model đám mây nhưng chưa được cho phép — việc nặng tạm dùng model hằng ngày.'),
        row('Thống kê', null, `${stats.n} lượt xử lý · trung bình ${stats.avg} giây · ${stats.errors} lỗi`),
        M.os === 'mac'
          ? row('Máy này (Mac)', h('select', {class: 'wr-in', 'aria-label': 'RAM của Mac', title: 'Apple menu → Giới thiệu về máy Mac → Bộ nhớ', onchange: e => { AI.setCfg({macRam: +e.target.value}); U.machine = null; ctx.render(); }},
              h('option', {value: 0, selected: !AI.cfg.macRam}, '— chọn RAM của Mac —'), [8, 16, 24, 32, 64].map(v => h('option', {value: v, selected: v === AI.cfg.macRam}, v + (v === 64 ? ' GB trở lên' : ' GB') + ' RAM'))),
              `Mac dùng chung RAM cho AI nên model gợi ý theo RAM (Apple menu → Giới thiệu về máy Mac). Gợi ý: ${M.pick}`)
          : row('Máy này', null, `Card đồ hoạ: ${M.gpu} (ước lượng nhóm ${M.tier}) · RAM trình duyệt báo: ${M.ram}`),
        h('h4', {class: 'wr-sub'}, 'Chạy trên máy này — miễn phí, dữ liệu không rời máy'), table(MODEL_GUIDE.filter(g => g.where === 'local')),
        h('h4', {class: 'wr-sub'}, 'Đám mây (Ollama Cloud) — model mạnh nhất, máy yếu vẫn dùng được, cần đăng nhập Ollama, gửi nội dung lên Ollama'), table(MODEL_GUIDE.filter(g => g.where === 'cloud')),
        U.pull && h('div', {class: 'wr-form'}, h('span', {class: 'wr-chip warn'}, h('i'), h('span', {class: 'wr-pull'}, `Đang tải ${U.pull.tag}: ${U.pull.text}`)), btn('Dừng tải', () => AI.stop(), {ghost: true})),
        h('form', {class: 'wr-form', style: 'margin-top:10px', onsubmit: e => { e.preventDefault(); const t = e.target.tag.value.trim(); if (t) pull(t, isCloud(t) ? 'heavy' : 'model')(); }}, h('input', {class: 'wr-in grow', name: 'tag', placeholder: 'Tên model khác trên ollama.com/library (vd: qwen3.8:27b, glm-5.3:cloud)…', 'aria-label': 'Tên model'}), btn('Tải / thêm model này', null, {type: 'submit', ghost: true, disabled: st.status !== 'online' || !!U.pull})),
        h('p', {class: 'wr-empty'}, 'Danh sách gợi ý tra tháng 11/2026 — model mới ra liên tục; gợi ý theo tên card đồ hoạ chỉ để tham khảo. Nên dùng "Thử model…" với một đoạn tiếng Việt thật trước khi chọn cố định.'),
        h('details', {class: 'wr-guide', open: st.status !== 'online'}, h('summary', {}, 'Cách bật AI (làm 1 lần)'),
          h('ol', {class: 'wr-list'}, h('li', {}, 'Cài Ollama từ ', h('a', {href: 'https://ollama.com/download', target: '_blank', rel: 'noopener'}, 'ollama.com/download'), ' (nếu đã cài thì cập nhật bản mới nhất).'),
            h('li', {}, 'Cho phép trang này gọi Ollama. ', M.os === 'mac' ? 'Mở Terminal, chạy:' : 'Mở PowerShell (không cần quyền admin), chạy:', h('div', {class: 'wr-form'}, h('code', {class: 'wr-code'}, M.os === 'mac' ? cmdMac : cmdWin), copy(M.os === 'mac' ? cmdMac : cmdWin))),
            M.os === 'mac' && h('li', {}, 'Lệnh trên chỉ có tác dụng đến khi Mac khởi động lại. Muốn giữ vĩnh viễn, dán thêm lệnh này vào Terminal (chạy 1 lần):', h('div', {class: 'wr-form'}, h('code', {class: 'wr-code'}, cmdMacKeep), copy(cmdMacKeep))),
            h('li', {}, M.os === 'mac' ? 'Thoát hẳn Ollama (bấm biểu tượng Ollama trên thanh menu phía trên → Quit Ollama) rồi mở lại từ Launchpad/Applications để nhận cài đặt.' : 'Thoát hẳn Ollama (bấm phải biểu tượng Ollama ở khay hệ thống → Quit) rồi mở lại để nhận cài đặt.'),
            h('li', {}, 'Quay lại đây bấm "Kiểm tra kết nối". Lần đầu, trình duyệt sẽ hỏi cho phép trang truy cập thiết bị/ứng dụng trên máy — chọn Cho phép.'),
            h('li', {}, 'Bấm "Tải" ở model "Gợi ý cho máy này" → chọn làm model hằng ngày.'),
            h('li', {}, 'Muốn chất lượng cao nhất cho viết & biên tập: mở ứng dụng Ollama → Sign in (hoặc chạy ', h('code', {class: 'wr-code'}, 'ollama signin'), '), rồi bấm "Thêm" ở một model đám mây → nó thành model mạnh.')),
          h('p', {class: 'wr-empty'}, 'An toàn: Ollama chỉ nghe trên máy này (127.0.0.1) và chỉ nhận lệnh từ đúng địa chỉ trang này. Không đổi OLLAMA_HOST thành 0.0.0.0. Nên dùng Chrome hoặc Edge trên máy tính.'))),
      h('section', {class: 'wr-card span'}, h('h3', {}, 'AI ngoài (ChatGPT / Gemini)', h('span', {}, 'Chỉ khi bạn chủ động chọn')),
        h('p', {}, 'Ở những chỗ có nút "Dùng AI ngoài…", Workroom soạn sẵn yêu cầu, bạn tự dán vào ChatGPT/Gemini ở tab mới rồi dán kết quả về.')),
      h('section', {class: 'wr-card span'}, h('h3', {}, 'Google Workspace'),
        row('Trạng thái', gs === 'connected' ? chip('ok', 'Đã kết nối') : gs === 'expired' ? chip('warn', 'Cần kết nối lại') : chip('', 'Chưa kết nối'), S.local ? 'Bản thử không kết nối Google được' : S.account),
        row('Drive · Docs · Sheets', G.has('drive') ? chip('ok', 'Đã cấp quyền') : chip('', 'Chưa cấp'), 'Đọc thư mục mẫu, tạo bản sao mẫu, tạo và cập nhật Docs/Sheets'),
        row('Google Calendar', G.has('calendar') ? chip('ok', 'Đã cấp quyền') : chip('', 'Chưa cấp'), 'Tạo/sửa sự kiện lịch khi bạn xác nhận'),
        row('Gmail', G.has('gmail') ? chip('ok', 'Đã cấp quyền') : chip('', 'Chưa cấp'), 'Chỉ lưu thư nháp — Workroom không gửi thư'),
        h('div', {class: 'wr-form', style: 'margin-top:10px'},
          btn(gs === 'none' ? 'CONNECT GOOGLE WORKSPACE' : 'Kết nối lại Google', run(err, () => G.connect(['drive'])), {icon: 'link', disabled: !G.available}),
          btn('Thêm quyền Lịch', run(err, () => G.connect(['calendar'])), {ghost: true, disabled: !G.available}), btn('Thêm quyền Gmail (nháp)', run(err, () => G.connect(['gmail'])), {ghost: true, disabled: !G.available}),
          gs !== 'none' && btn('Ngắt kết nối', run(err, async () => { if (await confirmBox('Ngắt kết nối Google', 'Thu hồi quyền Workroom đã được cấp? File đã tạo trên Drive vẫn giữ nguyên.', 'Ngắt kết nối', true)) { await G.disconnect(); ctx.render(); } }), {ghost: true}),
          S.settings.drive_root && h('a', {class: 'wr-btn ghost', href: S.settings.drive_root.url, target: '_blank', rel: 'noopener'}, icon('ext'), 'Thư mục Workroom trên Drive')),
        h('p', {class: 'wr-empty'}, 'Bấm kết nối sẽ chuyển sang trang Google để bạn cấp quyền, rồi tự quay lại đây. Vì lý do an toàn, Workroom chỉ giữ quyền trong phiên làm việc (khoảng 1 giờ) và không lưu khoá dài hạn; hết hạn chỉ cần bấm "Kết nối lại".')),
      h('section', {class: 'wr-card'}, h('h3', {}, 'Tài khoản chủ & khoá'), h('p', {}, S.local ? 'Đang chạy thử, không có tài khoản.' : S.account || '—'),
        h('p', {class: 'wr-empty'}, 'Workroom chỉ mở cho tài khoản gắn với nhân vật Vy. Người chơi khác không thấy Workroom và máy chủ cũng từ chối trả dữ liệu cho họ.'),
        h('div', {class: 'wr-form', style: 'margin-top:8px'}, btn(S.settings.pin_hash ? 'Đổi mã khoá' : 'Đặt mã khoá', setPin, {ghost: true}), S.settings.pin_hash && btn('Khoá ngay', () => { sessionStorage.removeItem('vyWrUnlocked'); ctx.render(); }, {ghost: true}),
          S.settings.pin_hash && btn('Bỏ mã khoá', run(err, async () => { if (await confirmBox('Bỏ mã khoá', 'Không hỏi mã khi mở Workroom nữa?', 'Bỏ mã')) await S.setSetting('pin_hash', null); }), {ghost: true}))),
      h('section', {class: 'wr-card'}, h('h3', {}, 'Sao lưu & khôi phục'), h('p', {class: 'wr-empty'}, `${S.events.length} sự kiện · ${S.articles.length} bài · ${S.tasks.length} việc · ${S.knowledge.length} tài liệu`),
        row('Nơi lưu dữ liệu', chip(S.local ? 'warn' : 'ok', S.local ? 'Bản thử — trình duyệt này' : 'Supabase — riêng tư')),
        h('div', {class: 'wr-form', style: 'margin-top:8px'}, btn('Tải file sao lưu (.json)', backup, {ghost: true, icon: 'down'}), btn('Khôi phục từ file', restore, {ghost: true, icon: 'up'})),
        h('p', {class: 'wr-empty'}, 'Dữ liệu nằm ở máy chủ nên không mất khi AI trên máy tắt.'))));
}

export const MODULES = [
  {id: 'overview', name: 'Overview', icon: 'home', render: overview},
  {id: 'assistant', name: 'AI Assistant', icon: 'spark', render: assistant},
  {id: 'content', name: 'Content Studio', icon: 'pen', render: content},
  {id: 'editorial', name: 'Editorial Desk', icon: 'check2', render: editorial},
  {id: 'timeline', name: 'Timeline Studio', icon: 'cal', render: timeline},
  {id: 'staff', name: 'Staff Assignment', icon: 'users', render: staff},
  {id: 'knowledge', name: 'Knowledge Hub', icon: 'book', render: knowledge},
  {id: 'tasks', name: 'Task Manager', icon: 'list', render: tasks},
  {id: 'activity', name: 'Hoạt động & Lịch sử', icon: 'clock', sep: true, render: activity},
  {id: 'settings', name: 'Cài đặt & Kết nối', icon: 'gear', render: settings},
];
