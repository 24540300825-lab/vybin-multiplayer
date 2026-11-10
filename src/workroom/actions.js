// PHÒNG VY — WORKROOM · ACTION ENGINE. AI không được chạm thẳng vào dữ liệu: nó chỉ ĐỀ XUẤT một trong các hành động đăng ký ở đây.
// Mỗi hành động có: mức quyền, khai báo tham số (được kiểm lại bằng mã), bản xem trước cho người dùng, hàm chạy, và được ghi nhật ký.
//   propose  — thay đổi trong Workroom (tạo việc, tạo bài nháp…): hiện thẻ xem trước, người dùng bấm mới chạy.
//   execute  — ghi ra ngoài (Google Docs, Calendar, Gmail nháp): thẻ cảnh báo riêng, người dùng bấm mới chạy. Không có hành động gửi thư hay xoá.
// Việc ĐỌC (tìm tài liệu, lấy dữ kiện sự kiện, danh sách việc) do hệ thống tự làm trước khi hỏi AI — xem m-assistant.js.
import {KINDS, kindName} from './knowledge.js';
import {generateArticle, exportDoc} from './m-content.js';

const S_ = (max = 300, req = false) => ({t: 'string', max, req}), E_ = (list, req = false) => ({t: 'enum', list, req});
const day = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s));
export function createActions(ctx) {
  const S = ctx.store, G = ctx.g, needEv = () => { const e = ctx.event(); if (!e) throw new Error('Cần chọn sự kiện trước (thanh trên cùng).'); return e; };
  const findArt = t => { const k = String(t || '').toLowerCase(), l = S.articles.filter(a => a.title.toLowerCase().includes(k)); if (l.length !== 1) throw new Error(l.length ? `Có ${l.length} bài khớp "${t}" — nói rõ tiêu đề hơn.` : `Không tìm thấy bài nào có tiêu đề chứa "${t}".`); return l[0]; };
  const D = {
    create_event: {level: 'propose', label: 'Tạo sự kiện', desc: 'Tạo một sự kiện/dự án mới', args: {name: S_(200, true), date: S_(10), time: S_(40), venue: S_(200)},
      check: a => { if (a.date && !day(a.date)) throw new Error('date phải dạng YYYY-MM-DD'); },
      preview: a => `Tạo sự kiện "${a.name}"${a.date ? ' ngày ' + a.date.split('-').reverse().join('/') : ''}${a.time ? ' lúc ' + a.time : ''}${a.venue ? ' tại ' + a.venue : ''}.`,
      run: async a => { const e = await S.createEvent({name: a.name, event_date: a.date || null, event_time: a.time || null, venue: a.venue || null}); ctx.setEvent(e.id); return {text: `Đã tạo ${e.code} — ${e.name}.`, go: 'overview'}; }},
    create_task: {level: 'propose', label: 'Tạo việc', desc: 'Thêm một việc vào Task Manager', args: {title: S_(280, true), deadline: S_(16), priority: E_(['low', 'normal', 'high']), owner: S_(80)},
      check: a => { if (a.deadline && isNaN(new Date(a.deadline))) throw new Error('deadline phải dạng YYYY-MM-DD hoặc YYYY-MM-DDTHH:MM'); },
      preview: a => `Thêm việc "${a.title}"${a.owner ? ' cho ' + a.owner : ''}${a.deadline ? ', hạn ' + (a.deadline.length === 10 ? a.deadline.split('-').reverse().join('/') : new Date(a.deadline).toLocaleString('vi-VN', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})) : ''}${a.priority === 'high' ? ' (ưu tiên)' : ''}.`,
      run: async a => { const ev = ctx.event(); await S.createTask({title: a.title, deadline: a.deadline ? new Date(a.deadline.length === 10 ? a.deadline + 'T17:00' : a.deadline).toISOString() : null, priority: a.priority || 'normal', owner_name: a.owner || null, event_id: ev ? ev.id : null, source: 'chat'}); return {text: `Đã thêm việc "${a.title}".`, go: 'tasks'}; }},
    complete_task: {level: 'propose', label: 'Đánh dấu xong việc', desc: 'Đánh dấu một việc đang mở là đã xong (theo tên việc)', args: {title: S_(280, true)},
      preview: a => `Đánh dấu đã xong việc có tên chứa "${a.title}".`,
      run: async a => { const l = S.tasks.filter(t => t.status !== 'done' && t.title.toLowerCase().includes(a.title.toLowerCase())); if (l.length !== 1) throw new Error(l.length ? `Có ${l.length} việc khớp — nói rõ tên hơn.` : 'Không tìm thấy việc đang mở nào khớp.'); await S.updateTask(l[0].id, {status: 'done'}); return {text: `Đã đánh dấu xong: ${l[0].title}.`, go: 'tasks'}; }},
    write_article: {level: 'propose', label: 'Viết bài nháp', desc: 'AI viết một bản nháp cho sự kiện đang chọn và lưu vào Content Studio', args: {kind: E_(KINDS.slice(0, 7).map(k => k[0])), notes: S_(1500)},
      preview: a => { const e = ctx.event(); return `Viết bản nháp ${kindName(a.kind || 'news').toLowerCase()} cho ${e ? e.code + ' — ' + e.name : '(chưa chọn sự kiện)'} và lưu vào Content Studio${a.notes ? '. Yêu cầu: ' + a.notes : ''}.`; },
      run: async a => { const art = await generateArticle(ctx, {ev: needEv(), kind: a.kind || 'news', notes: a.notes || ''}); (ctx.ui.content ||= {}).id = art.id; return {text: `Đã tạo bản nháp "${art.title}" trong Content Studio.`, go: 'content'}; }},
    plan_timeline: {level: 'propose', label: 'Lập timeline', desc: 'Mở Timeline Studio và để AI đề xuất các mục nội dung cho sự kiện đang chọn', args: {goal: S_(600), count: {t: 'number', min: 3, max: 40}},
      preview: a => { const e = ctx.event(); return `Đề xuất khoảng ${a.count || 12} mục timeline cho ${e ? e.code : '(chưa chọn sự kiện)'} — bạn sẽ chọn mục nào giữ lại.`; },
      run: async a => { needEv(); ctx.ui.timeline = {goal: a.goal || '', count: a.count || 12, auto: true}; return {text: 'Đã mở Timeline Studio.', go: 'timeline'}; }},
    review_article: {level: 'propose', label: 'Mở biên tập', desc: 'Mở một bài trong Editorial Desk để biên tập (theo tiêu đề)', args: {title: S_(200, true)},
      preview: a => `Mở bài có tiêu đề chứa "${a.title}" trong Editorial Desk.`,
      run: async a => { const art = findArt(a.title); (ctx.ui.editorial ||= {}).id = art.id; return {text: `Đã mở "${art.title}" trong Editorial Desk.`, go: 'editorial'}; }},
    export_google_doc: {level: 'execute', label: 'Tạo Google Docs', desc: 'Xuất một bài viết (theo tiêu đề) sang Google Docs', args: {title: S_(200, true)}, need: 'drive',
      preview: a => `Xuất bài có tiêu đề chứa "${a.title}" sang Google Docs trong thư mục của sự kiện.`,
      run: async a => { const r = await exportDoc(ctx, findArt(a.title)); if (!r) return {text: 'Đã huỷ.'}; return {text: 'Đã lưu lên Google Docs.', url: r.doc.url}; }},
    create_calendar_event: {level: 'execute', label: 'Tạo lịch Google', desc: 'Tạo một sự kiện trên Google Calendar', args: {title: S_(200, true), date: S_(10, true), start: S_(5, true), end: S_(5), location: S_(200)}, need: 'calendar',
      check: a => { if (!day(a.date)) throw new Error('date phải dạng YYYY-MM-DD'); if (!/^\d{2}:\d{2}$/.test(a.start) || (a.end && !/^\d{2}:\d{2}$/.test(a.end))) throw new Error('giờ phải dạng HH:MM'); },
      preview: a => `Tạo lịch "${a.title}" ngày ${a.date.split('-').reverse().join('/')} ${a.start}${a.end ? '–' + a.end : ''}${a.location ? ' tại ' + a.location : ''} trên Google Calendar của bạn.`,
      run: async a => { const end = a.end || `${String(Math.min(23, +a.start.slice(0, 2) + 1)).padStart(2, '0')}:${a.start.slice(3)}`; const r = await G.calendar.insert({summary: a.title, location: a.location || '', start: {dateTime: `${a.date}T${a.start}:00`, timeZone: 'Asia/Ho_Chi_Minh'}, end: {dateTime: `${a.date}T${end}:00`, timeZone: 'Asia/Ho_Chi_Minh'}}); return {text: 'Đã tạo lịch.', url: r.htmlLink}; }},
    create_email_draft: {level: 'execute', label: 'Soạn thư nháp', desc: 'Lưu một thư NHÁP vào Gmail (không gửi)', args: {to: S_(200), subject: S_(200, true), body: S_(6000, true)}, need: 'gmail',
      preview: a => `Lưu thư nháp "${a.subject}"${a.to ? ' gửi ' + a.to : ''} vào Gmail. Thư KHÔNG được gửi — bạn tự xem và gửi trong Gmail.`,
      run: async a => { await G.gmail.draft({to: a.to || '', subject: a.subject, html: a.body.split(/\n+/).map(p => `<p>${p.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c])}</p>`).join('')}); return {text: 'Đã lưu thư nháp trong Gmail (chưa gửi).', url: 'https://mail.google.com/mail/u/0/#drafts'}; }},
  };
  const R = {defs: D};
  R.spec = () => Object.entries(D).map(([n, d]) => `- ${n}: ${d.desc}. Tham số: ${Object.entries(d.args).map(([k, v]) => `${k}${v.req ? '*' : ''}${v.t === 'enum' ? ' (' + v.list.join('|') + ')' : v.t === 'number' ? ' (số)' : ''}`).join(', ')}`).join('\n');
  R.schema = {type: 'object', required: ['actions'], properties: {actions: {type: 'array', items: {type: 'object', required: ['name', 'args'], properties: {name: {type: 'string', enum: Object.keys(D)}, args: {type: 'object'}}}}}};
  // KIỂM TRA một đề xuất của AI: tên phải có trong danh sách, tham số đúng kiểu/độ dài/bắt buộc; tham số lạ bị bỏ. Sai → ném lỗi (đề xuất bị loại).
  R.check = raw => {
    const d = raw && D[raw.name]; if (!d) throw new Error('hành động không được phép: ' + (raw && raw.name));
    const src = raw.args && typeof raw.args === 'object' ? raw.args : {}, a = {};
    for (const [k, v] of Object.entries(d.args)) { let x = src[k];
      if (x == null || x === '') { if (v.req) throw new Error(`thiếu ${k}`); continue; }
      if (v.t === 'number') { x = Number(x); if (!isFinite(x)) throw new Error(`${k} phải là số`); x = Math.max(v.min, Math.min(v.max, Math.round(x))); }
      else { if (typeof x !== 'string' && typeof x !== 'number') throw new Error(`${k} sai kiểu`); x = String(x).trim().slice(0, v.max || 300); if (v.t === 'enum' && !v.list.includes(x)) throw new Error(`${k} không hợp lệ`); if (!x && v.req) throw new Error(`thiếu ${k}`); }
      a[k] = x; }
    if (d.check) d.check(a);
    return {name: raw.name, args: a, level: d.level, label: d.label, preview: d.preview(a), need: d.need || null};
  };
  R.run = async act => {
    const d = D[act.name]; if (!d) throw new Error('hành động không được phép');
    if (d.need && !G.has(d.need)) throw new Error(d.need === 'drive' ? 'Cần kết nối Google ở Cài đặt & Kết nối.' : `Cần cấp quyền ${d.need === 'calendar' ? 'Lịch' : 'Gmail (soạn nháp)'} ở Cài đặt & Kết nối.`);
    const args = R.check(act).args;
    try { const r = await d.run(args); await S.log('action.' + act.name, `Trợ lý thực hiện: ${d.label} — ${r.text}`.slice(0, 300)); return r; }
    catch (e) { await S.log('action.error', `Trợ lý không thực hiện được "${d.label}": ${e.message}`.slice(0, 300)); throw e; }
  };
  return R;
}
