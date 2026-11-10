// PHÒNG VY — WORKROOM · các module. Mỗi module = {id, name, icon, render(ctx) → HTMLElement}.
// Thêm module mới: thêm 1 mục vào MODULES. Module đang hoạt động thật: overview, tasks, activity, settings.
// Module chưa tới milestone của nó hiển thị đúng tình trạng (cần gì, mở khi nào) — không có nút giả.
import {STAGES, stageName} from './store.js';

export const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};
const P = {   // icon nét 24×24
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', spark: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  pen: 'M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3', check2: 'M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.8M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11', list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.4-1.4L17 5l-3-1-1 2h-2L10 4 7 5l.4 1.9L6 8.3 4 8l-1 3 2 1v2l-2 1 1 3 2-.3 1.4 1.4L7 21l3 1 1-2h2l1 2 3-1-.4-1.9 1.4-1.4 2 .3 1-3-2-1z',
  tick: 'M5 12.5l4.5 4.5L19 7.5', x: 'M6 6l12 12M18 6L6 18', door: 'M14 4h5v16h-5M10 12H3M6 8l-4 4 4 4M14 4L8 6v12l6 2z', plus: 'M12 5v14M5 12h14', down: 'M12 4v11M7 11l5 5 5-5M5 20h14',
};
export const icon = k => h('span', {html: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[k] || ''}"/></svg>`, style: 'display:inline-flex'});

const fmtD = d => d ? new Date(d).toLocaleDateString('vi-VN', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '';
const fmtDT = d => d ? new Date(d).toLocaleString('vi-VN', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : '';
const isLate = t => t.status !== 'done' && t.deadline && new Date(t.deadline) < new Date();
const byDeadline = (a, b) => (a.deadline || '9') < (b.deadline || '9') ? -1 : 1;
const head = (title, sub, ...right) => h('div', {class: 'wr-h'}, h('div', {}, h('h2', {}, title), sub && h('p', {}, sub)), h('span', {style: 'flex:1'}), ...right);
const card = (title, meta, ...body) => h('section', {class: 'wr-card'}, h('h3', {}, title, meta != null && h('span', {}, meta)), ...body);
const evTag = (S, id) => { const e = S.eventOf(id); return e ? h('span', {class: 'wr-tag code', title: e.name}, e.code) : null; };
// chạy thao tác ghi, lỗi thì hiện ngay dưới form (không im lặng)
const run = (ctx, box, fn) => async ev => {
  if (ev && ev.preventDefault) ev.preventDefault();
  box.textContent = '';
  try { await fn(); } catch (e) { box.textContent = 'Không lưu được: ' + (e.message || e); }
};

function taskRow(ctx, t) {
  const S = ctx.store, err = ctx.err;
  return h('div', {class: 'wr-row' + (t.status === 'done' ? ' done' : '')},
    h('button', {class: 'wr-check' + (t.status === 'done' ? ' on' : ''), title: t.status === 'done' ? 'Đánh dấu chưa xong' : 'Đánh dấu đã xong', 'aria-label': 'Hoàn thành: ' + t.title,
      onclick: run(ctx, err, () => S.updateTask(t.id, {status: t.status === 'done' ? 'todo' : 'done'}))}, icon('tick')),
    h('span', {class: 't', title: t.title}, t.title),
    t.priority === 'high' && h('span', {class: 'wr-tag high'}, 'Ưu tiên'),
    evTag(S, t.event_id),
    t.deadline && h('span', {class: 'wr-tag' + (isLate(t) ? ' late' : '')}, (isLate(t) ? 'Quá hạn · ' : '') + fmtDT(t.deadline)));
}

// ===================== OVERVIEW =====================
function overview(ctx) {
  const S = ctx.store, cur = ctx.event();
  const open = S.tasks.filter(t => t.status !== 'done').sort(byDeadline), late = open.filter(isLate);
  const events = S.events.filter(e => !e.archived);
  const err = ctx.err = h('div', {class: 'wr-err', role: 'alert'});
  const nm = h('input', {class: 'grow', placeholder: 'Tên sự kiện / dự án mới…', maxLength: 200, required: true, 'aria-label': 'Tên sự kiện'});
  const dt = h('input', {type: 'date', 'aria-label': 'Ngày diễn ra'});
  const setup = [
    [false, 'Kết nối Google Workspace', 'Drive, Docs, Sheets là nơi lưu và soạn tài liệu. Nút kết nối sẽ nằm ở Cài đặt & Kết nối khi phần này hoàn thành (milestone 4).'],
    [false, 'Bật AI trên máy (Ollama)', 'Trợ lý chạy ngay trên máy của Vy, không tốn phí. Thiết lập ở milestone 2.'],
    [false, 'Chọn thư mục tài liệu mẫu', 'Bài đã duyệt, brief, mẫu timeline, danh sách nhân sự — để AI viết đúng quy chuẩn (milestone 3).'],
    [events.length > 0, 'Tạo sự kiện đầu tiên', 'Mọi bài viết, timeline, phân công và việc cần làm đều gắn vào một sự kiện.'],
  ];
  return h('div', {class: 'wr-wrap'},
    head('Chào Vy', new Date().toLocaleDateString('vi-VN', {weekday: 'long', day: 'numeric', month: 'long'}) + ' — ' + (open.length ? `${open.length} việc đang chờ${late.length ? `, ${late.length} việc quá hạn` : ''}.` : 'chưa có việc nào đang chờ.')),
    h('div', {class: 'wr-grid'},
      setup.some(s => !s[0]) && h('section', {class: 'wr-card span'}, h('h3', {}, 'Bắt đầu sử dụng', h('span', {}, `${setup.filter(s => s[0]).length}/${setup.length} bước`)),
        h('div', {class: 'wr-steps'}, setup.map(([ok, t, d], i) => h('div', {class: 'wr-step' + (ok ? ' ok' : '')}, h('span', {class: 'n'}, ok ? icon('tick') : i + 1), h('div', {}, h('b', {}, t), h('span', {}, d)))))),
      h('section', {class: 'wr-card span'}, h('h3', {}, 'Sự kiện đang chạy', h('span', {}, events.length ? events.length + ' sự kiện' : null)),
        events.length ? events.map(e => h('div', {class: 'wr-row'},
          h('span', {class: 'wr-tag code'}, e.code), e.is_demo && h('span', {class: 'wr-tag demo'}, 'DEMO'),
          h('span', {class: 't', title: e.name}, e.name),
          e.event_date && h('span', {class: 'm'}, fmtD(e.event_date)),
          h('span', {class: 'wr-tag'}, stageName(e.stage)),
          cur && cur.id === e.id ? h('span', {class: 'm'}, 'đang chọn') : h('button', {class: 'wr-btn ghost', onclick: () => ctx.setEvent(e.id)}, 'Chọn'))) : h('p', {class: 'wr-empty'}, 'Chưa có sự kiện nào. Tạo sự kiện đầu tiên ở ngay bên dưới.'),
        h('form', {class: 'wr-form', style: 'margin-top:12px', onsubmit: run(ctx, err, async () => { const e = await S.createEvent({name: nm.value, event_date: dt.value}); ctx.setEvent(e.id); })},
          nm, dt, h('button', {class: 'wr-btn', type: 'submit'}, icon('plus'), 'Tạo sự kiện')), err),
      cur && h('section', {class: 'wr-card span'}, h('h3', {}, `${cur.code} — ${cur.name}`, h('span', {}, 'Tiến trình')),
        h('div', {class: 'wr-form'},
          h('label', {}, 'Đang ở bước '),
          h('select', {'aria-label': 'Bước hiện tại', onchange: ev => run(ctx, err, () => S.updateEvent(cur.id, {stage: ev.target.value}, 'chuyển sang bước ' + stageName(ev.target.value)))()},
            STAGES.map(([id, n]) => h('option', {value: id, selected: id === cur.stage}, n)))),
        h('div', {class: 'wr-stages'}, STAGES.map(([id, n], i) => h('span', {class: id === cur.stage ? 'now' : i < STAGES.findIndex(s => s[0] === cur.stage) ? 'past' : ''}, n)))),
      card('Việc đang chờ', open.length || null, open.length ? open.slice(0, 6).map(t => taskRow(ctx, t)) : h('p', {class: 'wr-empty'}, 'Không có việc nào đang chờ.'),
        h('div', {style: 'margin-top:10px'}, h('button', {class: 'wr-btn ghost', onclick: () => ctx.go('tasks')}, 'Mở Task Manager'))),
      card('Hoạt động gần đây', null, S.activity.length ? S.activity.slice(0, 6).map(a => h('div', {class: 'wr-row'}, h('span', {class: 't', title: a.summary}, a.summary), h('span', {class: 'm'}, fmtDT(a.at)))) : h('p', {class: 'wr-empty'}, 'Chưa có hoạt động nào.')),
      card('Bài chờ biên tập', null, h('p', {class: 'wr-empty'}, 'Sẽ hiện ở đây khi Content Studio và Editorial Desk hoạt động (milestone 4–5).')),
      card('Timeline', null, h('p', {class: 'wr-empty'}, 'Sẽ hiện ở đây khi Timeline Studio hoạt động (milestone 6).'))));
}

// ===================== TASK MANAGER =====================
function tasks(ctx) {
  const S = ctx.store, cur = ctx.event(), f = ctx.ui.taskFilter ||= {scope: 'all', status: 'open'};
  const err = ctx.err = h('div', {class: 'wr-err', role: 'alert'});
  let list = S.tasks.filter(t => (f.scope === 'all' || !cur || t.event_id === cur.id) && (f.status === 'all' || (f.status === 'open' ? t.status !== 'done' : f.status === 'late' ? isLate(t) : t.status === f.status)));
  list = list.sort((a, b) => (a.status === 'done') - (b.status === 'done') || byDeadline(a, b));
  const scoped = S.tasks.filter(t => f.scope === 'all' || !cur || t.event_id === cur.id), done = scoped.filter(t => t.status === 'done').length;
  const ti = h('input', {class: 'grow', placeholder: 'Việc cần làm…', maxLength: 300, required: true, 'aria-label': 'Tên việc'});
  const dl = h('input', {type: 'datetime-local', 'aria-label': 'Hạn chót'});
  const pr = h('select', {'aria-label': 'Mức ưu tiên'}, h('option', {value: 'normal'}, 'Bình thường'), h('option', {value: 'high'}, 'Ưu tiên'), h('option', {value: 'low'}, 'Thấp'));
  const ev = h('select', {'aria-label': 'Thuộc sự kiện'}, h('option', {value: ''}, 'Không gắn sự kiện'), S.events.filter(e => !e.archived).map(e => h('option', {value: e.id, selected: cur && cur.id === e.id}, e.code + ' — ' + e.name)));
  const sel = (k, opts) => h('select', {class: 'wr-in', 'aria-label': 'Lọc', onchange: e => { f[k] = e.target.value; ctx.render(); }}, opts.map(([v, n]) => h('option', {value: v, selected: f[k] === v}, n)));
  return h('div', {class: 'wr-wrap'},
    head('Task Manager', 'Mọi việc của Workroom nằm ở một chỗ, gắn với sự kiện.'),
    h('section', {class: 'wr-card', style: 'margin-bottom:16px'},
      h('form', {class: 'wr-form', onsubmit: run(ctx, err, () => S.createTask({title: ti.value, deadline: dl.value ? new Date(dl.value).toISOString() : null, priority: pr.value, event_id: ev.value || null}))},
        ti, dl, pr, ev, h('button', {class: 'wr-btn', type: 'submit'}, icon('plus'), 'Thêm việc')), err),
    h('section', {class: 'wr-card'},
      h('h3', {}, 'Danh sách', h('span', {}, `${done}/${scoped.length} việc đã xong`)),
      h('div', {class: 'wr-bar', style: 'margin-bottom:12px', role: 'progressbar', 'aria-valuenow': scoped.length ? Math.round(done / scoped.length * 100) : 0, 'aria-valuemin': 0, 'aria-valuemax': 100}, h('i', {style: `width:${scoped.length ? done / scoped.length * 100 : 0}%`})),
      h('div', {class: 'wr-form', style: 'margin-bottom:6px'},
        sel('status', [['open', 'Chưa xong'], ['doing', 'Đang làm'], ['late', 'Quá hạn'], ['done', 'Đã xong'], ['all', 'Tất cả']]),
        cur && sel('scope', [['all', 'Mọi sự kiện'], ['event', 'Chỉ ' + cur.code]])),
      list.length ? list.map(t => { const r = taskRow(ctx, t);
        r.append(
          h('select', {class: 'wr-in', 'aria-label': 'Trạng thái của ' + t.title, onchange: e => run(ctx, err, () => S.updateTask(t.id, {status: e.target.value}))()},
            [['todo', 'Chưa làm'], ['doing', 'Đang làm'], ['done', 'Xong']].map(([v, n]) => h('option', {value: v, selected: t.status === v}, n))),
          h('button', {class: 'wr-x', title: 'Xoá việc này', 'aria-label': 'Xoá ' + t.title, onclick: () => { if (confirm(`Xoá việc "${t.title}"? Không khôi phục được.`)) run(ctx, err, () => S.removeTask(t.id))(); }}, icon('x')));
        return r; }) : h('p', {class: 'wr-empty'}, 'Không có việc nào khớp bộ lọc.')));
}

// ===================== ACTIVITY =====================
function activity(ctx) {
  const S = ctx.store;
  return h('div', {class: 'wr-wrap'}, head('Hoạt động & Lịch sử', 'Mọi thay đổi trong Workroom được ghi lại ở đây.'),
    h('section', {class: 'wr-card'}, S.activity.length ? S.activity.map(a => h('div', {class: 'wr-row'}, evTag(S, a.event_id), h('span', {class: 't', title: a.summary}, a.summary), h('span', {class: 'm'}, fmtDT(a.at))))
      : h('p', {class: 'wr-empty'}, 'Chưa có hoạt động nào.')));
}

// ===================== SETTINGS & INTEGRATIONS =====================
function settings(ctx) {
  const S = ctx.store;
  const row = (name, state, cls, note) => h('div', {class: 'wr-row'}, h('span', {class: 't'}, name), h('span', {class: 'm'}, note), h('span', {class: 'wr-chip ' + cls}, h('i'), state));
  const exp = () => { const b = new Blob([JSON.stringify(S.exportAll(), null, 2)], {type: 'application/json'}), a = h('a', {href: URL.createObjectURL(b), download: 'workroom-' + new Date().toISOString().slice(0, 10) + '.json'}); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); ctx.note('Đã tải file sao lưu về máy.'); };
  return h('div', {class: 'wr-wrap'}, head('Cài đặt & Kết nối'),
    h('div', {class: 'wr-grid'},
      h('section', {class: 'wr-card span'}, h('h3', {}, 'Kết nối'),
        row('Google Workspace (Drive, Docs, Sheets, Calendar, Gmail nháp)', 'Chưa kết nối', '', 'Nút kết nối mở ở milestone 4'),
        row('AI trên máy (Ollama)', 'Chưa thiết lập', '', 'Thiết lập ở milestone 2'),
        row('Nơi lưu dữ liệu Workroom', S.local ? 'Bản thử — chỉ trên trình duyệt này' : 'Supabase — riêng tư', S.local ? 'warn' : 'ok', S.local ? '' : 'Chỉ tài khoản chủ đọc/ghi được')),
      h('section', {class: 'wr-card'}, h('h3', {}, 'Tài khoản chủ'),
        h('p', {}, S.local ? 'Đang chạy thử, không có tài khoản.' : S.account || '—'),
        h('p', {class: 'wr-empty'}, 'Workroom chỉ mở cho tài khoản gắn với nhân vật Vy. Người chơi khác không thấy Workroom và máy chủ cũng từ chối trả dữ liệu cho họ.')),
      h('section', {class: 'wr-card'}, h('h3', {}, 'Sao lưu'),
        h('p', {class: 'wr-empty'}, `${S.events.length} sự kiện · ${S.tasks.length} việc · ${S.activity.length} dòng nhật ký`),
        h('button', {class: 'wr-btn ghost', style: 'margin-top:8px', onclick: exp}, icon('down'), 'Tải file sao lưu (.json)'))));
}

// ===================== module chưa tới milestone =====================
const planned = (title, ms, does, needs) => ctx => h('div', {class: 'wr-wrap'},
  head(title, 'Chưa hoạt động — mở ở milestone ' + ms + '.'),
  h('div', {class: 'wr-grid'},
    card('Module này sẽ làm gì', null, h('ul', {class: 'wr-list'}, does.map(d => h('li', {}, d)))),
    card('Cần có trước khi mở', null, needs.map(([n, st]) => h('div', {class: 'wr-row'}, h('span', {class: 't'}, n), h('span', {class: 'wr-chip'}, h('i'), st)))),
    ctx.event() && h('section', {class: 'wr-card span'}, h('h3', {}, 'Sự kiện đang chọn'), h('p', {}, h('span', {class: 'wr-tag code'}, ctx.event().code), ' ', ctx.event().name),
      h('p', {class: 'wr-empty'}, 'Khi module mở, nó dùng đúng bản ghi sự kiện này — không phải nhập lại.'))));
const NEED_AI = ['AI trên máy (Ollama)', 'Chưa thiết lập'], NEED_G = ['Google Workspace', 'Chưa kết nối'], NEED_K = ['Tài liệu mẫu trong Knowledge Hub', 'Chưa nạp'];

export const MODULES = [
  {id: 'overview', name: 'Overview', icon: 'home', render: overview},
  {id: 'assistant', name: 'AI Assistant', icon: 'spark', ms: 2, render: planned('AI Assistant', 2, ['Trò chuyện tiếng Việt với AI chạy trên máy của Vy.', 'Hiểu sự kiện và tài liệu đang mở, không phải giải thích lại.', 'Đề xuất hành động (tạo bài, tạo việc…) và chỉ thực hiện sau khi Vy đồng ý.'], [NEED_AI])},
  {id: 'content', name: 'Content Studio', icon: 'pen', ms: 4, render: planned('Content Studio', 4, ['Viết tin bài, caption, thông báo, thư mời từ brief và bài mẫu đã duyệt.', 'Trình soạn thảo có lưu tự động và lịch sử phiên bản.', 'Xuất thẳng sang Google Docs.'], [NEED_AI, NEED_K, NEED_G])},
  {id: 'editorial', name: 'Editorial Desk', icon: 'check2', ms: 5, render: planned('Editorial Desk', 5, ['Soát chính tả, câu chữ, mạch văn.', 'Đối chiếu tên, chức danh, thời gian, địa điểm với nguồn chính thức.', 'Đọc như một độc giả chưa dự sự kiện; không tự thêm hay đổi dữ kiện.'], [NEED_AI, NEED_K])},
  {id: 'timeline', name: 'Timeline Studio', icon: 'cal', ms: 6, render: planned('Timeline Studio', 6, ['Lập kế hoạch nội dung trước – trong – sau sự kiện.', 'Điền đúng mẫu Google Sheets đang dùng, xem trước rồi mới ghi.', 'Tạo việc từ từng mục timeline.'], [NEED_AI, NEED_G, ['Mẫu timeline (Google Sheets)', 'Chưa nạp']])},
  {id: 'staff', name: 'Staff Assignment', icon: 'users', ms: 7, render: planned('Staff Assignment', 7, ['Đề xuất phân công theo vai trò, kỹ năng và lịch rảnh thật.', 'Báo trùng lịch, quá tải, vị trí còn thiếu.', 'Ghi vào bảng phân công Google Sheets sau khi Vy duyệt.'], [NEED_AI, NEED_G, ['Danh sách nhân sự', 'Chưa nạp']])},
  {id: 'knowledge', name: 'Knowledge Hub', icon: 'book', ms: 3, render: planned('Knowledge Hub', 3, ['Thư viện tài liệu chính thức, bài đã duyệt, bài mẫu, quy chuẩn, template.', 'Phân biệt rõ tài liệu chính thức, tham khảo và bản nháp.', 'AI chỉ dùng tài liệu đã được Vy xác nhận làm chuẩn.'], [NEED_G, ['Thư mục Google Drive chứa tài liệu mẫu', 'Chưa chọn']])},
  {id: 'tasks', name: 'Task Manager', icon: 'list', render: tasks},
  {id: 'activity', name: 'Hoạt động & Lịch sử', icon: 'clock', sep: true, render: activity},
  {id: 'settings', name: 'Cài đặt & Kết nối', icon: 'gear', render: settings},
];
