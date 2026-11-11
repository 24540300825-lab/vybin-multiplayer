// PHÒNG VY — WORKROOM · TRỢ LÝ AI (một chỗ duy nhất). Nói chuyện + THAO TÁC trực tiếp trên mọi task:
// tạo, viết, sửa từng chỗ, tạo chương trình, mở màn hình, lưu Drive. Mỗi lần sửa đều lưu bản cũ → nút Hoàn tác.
// Giới hạn cứng: không xoá tài liệu, không gửi email, không ghi đè file gốc trên Drive (chỉ ghi file do Workroom tạo).
import {h, icon, btn} from './ui.js';
import {KINDS, GROUPS, asText, copies} from './kinds.js';
import {statusName} from './out.js';
import {writeDoc, RULES, programFacts, staffList} from './gen.js';
import {applyData, exportDoc, docTitle, getP, setP} from './views.js';
import {plain} from './fmt.js';
import {askKey} from './ai.js';

const KIND_ENUM = Object.keys(KINDS);
const TOOLS = [
  {name: 'list_docs', description: 'Liệt kê tài liệu (kịch bản, caption, tin bài, lịch công tác, timeline). Lọc theo loại hoặc từ khoá.', parameters: {type: 'OBJECT', properties: {kind: {type: 'STRING', enum: KIND_ENUM}, query: {type: 'STRING'}, program_id: {type: 'STRING'}}}},
  {name: 'read_doc', description: 'Đọc toàn bộ nội dung (JSON) một tài liệu để biết đường dẫn trường trước khi sửa.', parameters: {type: 'OBJECT', properties: {id: {type: 'STRING'}}, required: ['id']}},
  {name: 'create_doc', description: 'Tạo tài liệu mới theo đúng mẫu và để AI viết nội dung từ thông tin. Mở luôn tài liệu cho Vy xem.', parameters: {type: 'OBJECT', properties: {kind: {type: 'STRING', enum: KIND_ENUM}, info: {type: 'STRING', description: 'mọi thông tin/tư liệu Vy đưa'}, program_id: {type: 'STRING'}, instruction: {type: 'STRING'}}, required: ['kind']}},
  {name: 'rewrite_doc', description: 'Viết lại / sửa lớn một tài liệu theo yêu cầu (AI viết theo mẫu, giữ phần không cần sửa).', parameters: {type: 'OBJECT', properties: {id: {type: 'STRING'}, instruction: {type: 'STRING'}, info: {type: 'STRING'}}, required: ['id', 'instruction']}},
  {name: 'edit_fields', description: 'Sửa CHÍNH XÁC từng trường trong tài liệu (sửa nhỏ). path dạng "news[0].intro", "cap.title", "days[1].items[0].media". value: chữ, hoặc JSON (mảng/đối tượng) khi thay cả cụm.', parameters: {type: 'OBJECT', properties: {id: {type: 'STRING'},
    changes: {type: 'ARRAY', items: {type: 'OBJECT', properties: {path: {type: 'STRING'}, value: {type: 'STRING'}}, required: ['path', 'value']}}}, required: ['id', 'changes']}},
  {name: 'set_status', description: 'Đổi trạng thái: draft=Nháp, review=Gửi duyệt, revise=Cần sửa, approved=Đã duyệt, published=Đã đăng.', parameters: {type: 'OBJECT', properties: {id: {type: 'STRING'}, status: {type: 'STRING', enum: ['draft', 'review', 'revise', 'approved', 'published']}}, required: ['id', 'status']}},
  {name: 'set_handoff', description: 'Đặt người nhận (email), hạn nộp (YYYY-MM-DDTHH:mm), lời nhắn bàn giao cho tài liệu. Không tự gửi.', parameters: {type: 'OBJECT', properties: {id: {type: 'STRING'}, to: {type: 'ARRAY', items: {type: 'STRING'}}, deadline: {type: 'STRING'}, note: {type: 'STRING'}}, required: ['id']}},
  {name: 'add_feedback', description: 'Ghi góp ý (của người duyệt) vào tài liệu để sau đó sửa.', parameters: {type: 'OBJECT', properties: {id: {type: 'STRING'}, text: {type: 'STRING'}, who: {type: 'STRING'}}, required: ['id', 'text']}},
  {name: 'copy_text', description: 'Lấy nội dung sao chép theo từng loại (caption FB, lời dẫn MC, lời VO, tin nhắn Zalo, phân việc theo người…) để đưa cho Vy.', parameters: {type: 'OBJECT', properties: {id: {type: 'STRING'}}, required: ['id']}},
  {name: 'list_programs', description: 'Liệt kê chương trình lớn.', parameters: {type: 'OBJECT', properties: {}}},
  {name: 'create_program', description: 'Tạo chương trình lớn.', parameters: {type: 'OBJECT', properties: {name: {type: 'STRING'}, event_date: {type: 'STRING', description: 'YYYY-MM-DD'}, event_time: {type: 'STRING'}, venue: {type: 'STRING'}, organizer: {type: 'STRING'}, attendees: {type: 'STRING'}, brief: {type: 'STRING'}}, required: ['name']}},
  {name: 'update_program', description: 'Sửa thông tin chương trình lớn.', parameters: {type: 'OBJECT', properties: {id: {type: 'STRING'}, name: {type: 'STRING'}, event_date: {type: 'STRING'}, event_time: {type: 'STRING'}, venue: {type: 'STRING'}, organizer: {type: 'STRING'}, attendees: {type: 'STRING'}, brief: {type: 'STRING'}}, required: ['id']}},
  {name: 'open', description: 'Mở một màn hình cho Vy xem.', parameters: {type: 'OBJECT', properties: {screen: {type: 'STRING', enum: ['home', 'doc', 'program', 'programs', 'publish', 'settings', ...GROUPS.map(g => 'group:' + g.id)]}, id: {type: 'STRING'}}, required: ['screen']}},
  {name: 'save_to_drive', description: 'Tạo/cập nhật bản Google Docs (hoặc Google Sheets với timeline) từ file đúng mẫu, trả link.', parameters: {type: 'OBJECT', properties: {id: {type: 'STRING'}}, required: ['id']}},
  {name: 'list_staff', description: 'Danh sách nhân sự để phân công.', parameters: {type: 'OBJECT', properties: {}}},
];

export function createCopilot(ctx) {
  const S = ctx.store, AI = ctx.ai;
  const C = {open: false, busy: false, msgs: [], undo: [], attach: []};   // msgs: {role:'user'|'model', text, did:[], undoIdx}
  let chat = null;
  const load = () => { chat = S.chats[0] || null; C.msgs = chat ? (chat.messages || []).slice(-40) : []; };
  const persist = async () => {
    const messages = C.msgs.slice(-40).map(m => ({role: m.role, text: m.text, did: m.did || []}));
    try { if (chat) chat = await S.set('chats', chat.id, {messages}, {silent: true}); else chat = await S.add('chats', {title: 'Trợ lý', messages}, {silent: true}); } catch (e) { console.warn('[workroom] lưu chat', e); }
  };
  const docBrief = d => ({id: d.id, loai: KINDS[d.kind].name, kind: d.kind, ten: docTitle(d), chuong_trinh: d.event_id ? (S.eventOf(d.event_id) || {}).name : null, trang_thai: statusName(d.status), han: d.handoff && d.handoff.deadline || null, google: d.gdoc && d.gdoc.url || null, sua_luc: d.updated_at});
  const findDoc = id => { const d = S.doc(id); if (!d) throw new Error('Không có tài liệu id ' + id); return d; };
  const remember = (doc, before, label) => { C.undo.push({id: doc.id, data: JSON.parse(JSON.stringify(before)), label}); return C.undo.length - 1; };

  async function exec(name, a, did) {
    switch (name) {
      case 'list_docs': { const q = (a.query || '').toLowerCase(); return S.docs.filter(d => (!a.kind || d.kind === a.kind) && (!a.program_id || d.event_id === a.program_id) && (!q || docTitle(d).toLowerCase().includes(q) || asText(d.kind, d.data || {}).toLowerCase().includes(q))).slice(0, 30).map(docBrief); }
      case 'read_doc': { const d = findDoc(a.id); return {...docBrief(d), data: d.data}; }
      case 'create_doc': {
        const K = KINDS[a.kind]; if (!K) throw new Error('Loại không hợp lệ');
        const prog = a.program_id && S.eventOf(a.program_id);
        const data = await writeDoc(ctx, a.kind, {brief: a.info || '', program: prog, instruction: a.instruction || '', current: K.blank(), sources: ctx.attach || []});
        const d = await S.createDoc(a.kind, {...data, _brief: a.info || ''}, {event_id: prog ? prog.id : null, title: plain(K.titleOf(data) || ''), label: K.short});
        if ((ctx.attach || []).length) await S.saveDoc(d.id, {sources: ctx.attach.slice()}, {silent: true});
        did.push({t: 'Tạo ' + K.short + ': ' + docTitle(d), open: d.id}); ctx.go({screen: 'doc', id: d.id}); return {ok: true, id: d.id, ten: docTitle(d)};
      }
      case 'rewrite_doc': {
        const d = findDoc(a.id), before = d.data;
        const data = await writeDoc(ctx, d.kind, {current: d.data, instruction: a.instruction, brief: [d.data._brief, a.info].filter(Boolean).join('\n\n'), sources: [...(d.sources || []), ...(ctx.attach || [])], program: d.event_id && S.eventOf(d.event_id)});
        await applyData(ctx, d, {...data, _brief: d.data._brief}, 'Trợ lý: ' + a.instruction.slice(0, 60));
        did.push({t: 'Sửa “' + docTitle(d) + '”', undo: remember(d, before, a.instruction), open: d.id}); return {ok: true};
      }
      case 'edit_fields': {
        const d = findDoc(a.id), before = d.data, data = JSON.parse(JSON.stringify(d.data || {}));
        for (const c of a.changes || []) { let v = c.value; if (/^\s*[[{]/.test(v)) { try { v = JSON.parse(v); } catch (e) {} } setP(data, c.path, v); }
        await applyData(ctx, d, data, 'Trợ lý sửa ' + (a.changes || []).map(c => c.path).join(', ').slice(0, 80));
        did.push({t: 'Sửa ' + (a.changes || []).length + ' chỗ trong “' + docTitle(d) + '”', undo: remember(d, before, 'sửa'), open: d.id}); return {ok: true};
      }
      case 'set_status': { const d = findDoc(a.id); await S.saveDoc(d.id, {status: a.status}); did.push({t: statusName(a.status) + ': ' + docTitle(d)}); return {ok: true}; }
      case 'set_handoff': { const d = findDoc(a.id), H = {...(d.handoff || {})}; if (a.to) H.to = a.to; if (a.deadline) H.deadline = a.deadline.slice(0, 16); if (a.note) H.note = a.note; await S.saveDoc(d.id, {handoff: H}); did.push({t: 'Cập nhật bàn giao: ' + docTitle(d), open: d.id}); return {ok: true}; }
      case 'add_feedback': { const d = findDoc(a.id), H = {feedback: [], ...(d.handoff || {})}; H.feedback = [...(H.feedback || []), {id: 'c' + Date.now(), who: a.who || 'Góp ý', text: a.text, at: new Date().toISOString(), src: 'chat', done: false}]; await S.saveDoc(d.id, {handoff: H, status: 'revise'}); did.push({t: 'Ghi góp ý vào: ' + docTitle(d), open: d.id}); return {ok: true}; }
      case 'copy_text': { const d = findDoc(a.id); return copies(d.kind, d.data || {}).map(c => ({loai: c.label, noi_dung: c.text})); }
      case 'list_programs': return S.events.filter(e => !e.archived).map(e => ({id: e.id, ten: e.name, ngay: e.event_date, gio: e.event_time, dia_diem: e.venue, so_tai_lieu: S.docs.filter(d => d.event_id === e.id).length}));
      case 'create_program': { const row = {...a}; if (!/^\d{4}-\d{2}-\d{2}$/.test(row.event_date || '')) delete row.event_date; const e = await S.createEvent(row); did.push({t: 'Tạo chương trình: ' + e.name, prog: e.id}); ctx.go({screen: 'program', id: e.id}); return {ok: true, id: e.id}; }
      case 'update_program': { const {id, ...p} = a; if (p.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(p.event_date)) delete p.event_date; const e = await S.updateEvent(id, p); did.push({t: 'Cập nhật chương trình: ' + e.name, prog: e.id}); return {ok: true}; }
      case 'open': { const [sc, gid] = a.screen.split(':'); ctx.go(sc === 'group' ? {screen: 'group', id: gid} : {screen: sc, id: a.id}); return {ok: true}; }
      case 'save_to_drive': { const d = findDoc(a.id); const url = await exportDoc(ctx, d, 'drive'); if (!url) return {ok: false, note: 'Cần kết nối Google trước (đã hỏi Vy).'}; did.push({t: 'Cập nhật Google Docs/Sheets: ' + docTitle(d), url}); return {ok: true, url}; }
      case 'list_staff': return staffList(S);
    }
    throw new Error('Không có công cụ ' + name);
  }

  function system() {
    const v = ctx.view, cur = v.screen === 'doc' && S.doc(v.id), prog = v.screen === 'program' && S.eventOf(v.id);
    return [RULES, '',
      'Bạn là TRỢ LÝ trong Workroom của Vy. Bạn THAO TÁC TRỰC TIẾP bằng công cụ: khi Vy nhờ tạo/viết/sửa/đổi bất cứ gì → gọi công cụ làm luôn, không chỉ hướng dẫn, không hỏi lại những gì đã đủ rõ.',
      'Sửa nhỏ (một câu, một tên, một giờ) → edit_fields (đọc read_doc trước nếu chưa biết đường dẫn). Sửa lớn / viết lại → rewrite_doc. Tạo mới → create_doc (đưa hết thông tin Vy cung cấp vào info).',
      'Không có công cụ xoá tài liệu hay gửi email — nếu được nhờ, nói Vy tự làm. Trả lời ngắn gọn bằng tiếng Việt, nói rõ đã làm gì; không bịa là đã làm khi chưa gọi công cụ.',
      'Các loại tài liệu: ' + Object.entries(KINDS).map(([k, K]) => `${k} = ${K.name}`).join('; ') + '.',
      'Hôm nay: ' + new Date().toLocaleDateString('vi-VN', {weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'}) + '.',
      cur ? `\nVY ĐANG MỞ TÀI LIỆU: id=${cur.id}, loại=${KINDS[cur.kind].name}, tên="${docTitle(cur)}". Nội dung JSON:\n${JSON.stringify(cur.data).slice(0, 14000)}` : '',
      prog ? `\nVY ĐANG MỞ CHƯƠNG TRÌNH: id=${prog.id}\n${programFacts(prog)}` : '',
      !cur && !prog ? '\nVy đang ở màn: ' + v.screen + (v.id ? ' ' + v.id : '') : ''].join('\n');
  }

  C.send = async text => {
    text = String(text || '').trim(); if (!text || C.busy) return;
    if (!AI.cfg.key && !await askKey(AI)) { ctx.render(); return; }
    ctx.attach = C.attach.splice(0); paintAtt();
    if (ctx.attach.length) text += '\n[Vy gửi kèm ' + ctx.attach.length + ' nguồn: ' + ctx.attach.map(s => s.name).join(', ') + ' — dùng khi tạo/sửa tài liệu.]';
    C.msgs.push({role: 'user', text}); const m = {role: 'model', text: '', did: [], busy: true}; C.msgs.push(m); C.busy = true; paint();
    const contents = C.msgs.slice(0, -1).slice(-14).filter(x => x.text).map(x => ({role: x.role, parts: [{text: x.text + (x.did && x.did.length ? '\n[đã làm: ' + x.did.map(d => d.t).join('; ') + ']' : '')}]}));
    try {
      for (let round = 0; round < 6; round++) {
        const r = await AI.generate({task: 'Trợ lý', system: system(), contents, tools: TOOLS, temperature: 0.4});
        contents.push(r.content);
        if (!r.calls.length) { m.text = r.text || (m.did.length ? 'Xong.' : '…'); break; }
        if (r.text) m.text = r.text;
        const resp = [];
        for (const c of r.calls) {
          m.text = '⏳ ' + ({create_doc: 'Đang tạo và viết theo mẫu…', rewrite_doc: 'Đang viết lại…', edit_fields: 'Đang sửa…', save_to_drive: 'Đang lưu lên Drive…'}[c.name] || 'Đang xử lý…'); paint();
          let out; try { out = await exec(c.name, c.args, m.did); } catch (e) { out = {error: e.message}; }
          resp.push({functionResponse: {name: c.name, response: {result: out}}});
        }
        contents.push({role: 'user', parts: resp});
        if (round === 5) m.text = 'Đã làm xong các bước trên.';
      }
    } catch (e) { m.text = '⚠️ ' + e.message; }
    m.busy = false; C.busy = false; paint(); persist();
  };
  C.undoAt = async i => {
    const u = C.undo[i]; if (!u) return; const d = S.doc(u.id); if (!d) return;
    await applyData(ctx, d, u.data, 'Hoàn tác'); C.undo[i] = null; ctx.note('Đã hoàn tác'); paint();
  };
  C.reset = async () => { C.msgs = []; C.undo = []; chat = null; paint(); };

  // ---------- giao diện ----------
  let el = null, list = null, ta = null, attEl = null;
  const paintAtt = () => { if (attEl) attEl.replaceChildren(...C.attach.map((s, i) => h('span', {class: 'wr-src'}, s.type === 'image' ? h('img', {src: 'data:' + s.mime + ';base64,' + s.data, alt: ''}) : icon('doc'), h('span', {}, s.name), h('button', {class: 'wr-x del', 'aria-label': 'Bỏ ' + s.name, onclick: () => { C.attach.splice(i, 1); paintAtt(); }}, icon('x'))))); };
  const attachFiles = async files => { const {ingestFile} = await import('./sources.js'); for (const f of files) { try { C.attach.push(await ingestFile(ctx, f)); } catch (e) { ctx.note(e.message); } } paintAtt(); };
  const SUGG = {
    home: ['Viết caption khai mạc tuần lễ sinh viên', 'Tạo lịch công tác tuần này', 'Có những việc nào đang dở?'],
    doc: ['Rút gọn phần mở đầu', 'Kiểm tra lỗi chính tả, câu chữ', 'Còn chỗ nào thiếu dữ kiện?'],
    program: ['Tạo bộ caption + tin bài + timeline cho chương trình này', 'Tóm tắt chương trình này'],
  };
  function msgEl(x) {
    return h('div', {class: 'wr-msg ' + x.role + (x.busy ? ' busy' : '')}, x.text,
      (x.did || []).length ? h('div', {class: 'acts'}, x.did.map(d => [h('span', {class: 'did'}, '✓ ' + d.t),
        d.open && btn('Mở', () => ctx.go({screen: 'doc', id: d.open}), {ghost: true, sm: 1}), d.prog && btn('Mở', () => ctx.go({screen: 'program', id: d.prog}), {ghost: true, sm: 1}),
        d.url && h('a', {class: 'wr-btn ghost sm', href: d.url, target: '_blank', rel: 'noopener'}, 'Mở Drive'), d.undo != null && C.undo[d.undo] && btn('Hoàn tác', () => C.undoAt(d.undo), {ghost: true, sm: 1})])) : null);
  }
  function paint() {
    if (!list) return;
    list.replaceChildren(...(C.msgs.length ? C.msgs.map(msgEl) : [h('div', {class: 'wr-msg model'}, 'Chào bạn! Mình viết, sửa, tạo mọi thứ trong Workroom theo đúng mẫu của phòng. Cứ nói việc cần làm — ví dụ “viết caption cho lễ ký kết MOU sáng mai ở A.905”.')]));
    list.scrollTop = list.scrollHeight;
    if (ta) ta.disabled = C.busy;
  }
  C.panel = () => {
    if (!chat && S.chats.length && !C.msgs.length) load();
    const v = ctx.view, cur = v.screen === 'doc' && S.doc(v.id);
    list = h('div', {class: 'wr-msgs', 'aria-live': 'polite'});
    ta = h('textarea', {class: 'wr-in', rows: 2, placeholder: 'Nhờ trợ lý làm gì… (kéo thả file vào đây)', onpaste: e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])]; if (fs.length) { e.preventDefault(); attachFiles(fs); } }, 'aria-label': 'Nhắn trợ lý', onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = ta.value; ta.value = ''; C.send(t); } }});
    const sugg = SUGG[v.screen] || SUGG.home;
    el = h('div', {style: 'display:contents'},
      h('header', {}, icon('spark'), 'Trợ lý AI', h('span', {class: 'sp'}), btn('Mới', () => C.reset(), {ghost: true, sm: 1}), h('button', {class: 'wr-x', 'aria-label': 'Đóng trợ lý', onclick: () => ctx.toggleCop(false)}, icon('x'))),
      h('div', {class: 'ctx'}, cur ? 'Đang mở: ' + docTitle(cur) : 'Trợ lý thấy màn hình bạn đang mở và làm trực tiếp trên đó.'),
      list, !C.msgs.length && h('div', {class: 'wr-sugg'}, sugg.map(s => h('button', {onclick: () => C.send(s)}, s))),
      attEl = h('div', {class: 'wr-chips', style: 'padding:0 12px'}),
      h('div', {class: 'wr-composer', ondragover: e => e.preventDefault(), ondrop: e => { e.preventDefault(); attachFiles([...e.dataTransfer.files]); }}, h('label', {class: 'wr-x', title: 'Đính kèm tài liệu / ảnh', 'aria-label': 'Đính kèm'}, icon('plus'), h('input', {type: 'file', multiple: true, accept: '.docx,.xlsx,.csv,.txt,.pdf,image/*', style: 'display:none', onchange: e => { attachFiles([...e.target.files]); e.target.value = ''; }})),
        ta, h('button', {class: 'wr-btn', 'aria-label': 'Gửi', onclick: () => { const t = ta.value; ta.value = ''; C.send(t); }}, icon('send'))));
    paintAtt();
    paint(); return el;
  };
  return C;
}
