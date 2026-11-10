// PHÒNG VY — WORKROOM · AI ASSISTANT + COPILOT (cùng một bộ máy trò chuyện).
// Mỗi lượt: (1) hệ thống tự ĐỌC ngữ cảnh liên quan (sự kiện, tài liệu, việc, thứ đang mở) → (2) AI trả lời dạng stream →
// (3) nếu người dùng nhờ làm việc gì, AI đề xuất hành động; mã kiểm tra lại; hiện thẻ xem trước; người dùng bấm mới chạy.
import {h, icon, head, btn, run, errBox, fmtDT, pickFile, textToHtml, htmlToText} from './ui.js';
import {retrieve, eventFacts, kindName} from './knowledge.js';

const WANT = /(tạo|thêm|viết|soạn|lập|lên (kế hoạch|timeline|lịch)|giao việc|đánh dấu|hoàn thành|xong việc|xuất|biên tập|đặt lịch|nhắc|lưu nháp|draft|google docs|calendar)/i;
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };

// ngữ cảnh "đang mở gì" — để không phải giải thích lại
export function openContext(ctx, mod) {
  const S = ctx.store, ev = ctx.event(), U = ctx.ui, out = [];
  if (mod === 'content' && U.content && U.content.id) { const a = S.articles.find(x => x.id === U.content.id); if (a) out.push(`BÀI ĐANG SOẠN (${kindName(a.kind)}): "${a.title}"\n${clip(htmlToText(a.body), 3500)}`); }
  if (mod === 'editorial' && U.editorial && U.editorial.id) { const a = S.articles.find(x => x.id === U.editorial.id); if (a) out.push(`BÀI ĐANG BIÊN TẬP: "${a.title}"\n${clip(htmlToText(a.body), 3500)}`); }
  if (mod === 'timeline' && ev) { const l = S.timeline.filter(t => t.event_id === ev.id); out.push(`TIMELINE TRUYỀN THÔNG ĐANG MỞ (${l.length} mục):\n${l.slice(0, 40).map(t => `- [${t.phase}] ${t.content} | ${t.format} | đăng ${t.publish_at || '?'} | ${t.a_content || 'chưa giao'}${t.done ? ' | xong' : ''}`).join('\n')}`); }
  if (mod === 'staff') { const wk = U.staff && U.staff.week, l = S.events.filter(e => e.event_date && wk && e.event_date >= wk).slice(0, 12); out.push(`PHÂN CÔNG ĐANG MỞ (tuần từ ${wk || '?'}):\n${l.map(e => `- ${e.code} ${e.name} | ${e.event_date} ${e.event_time || ''} | content: ${(e.assign || {}).content || '—'} | media: ${(e.assign || {}).media || '—'} | biên tập: ${(e.assign || {}).editor || '—'}`).join('\n')}\nDANH BẠ: ${S.staff.filter(s => s.active).map(s => `${s.name} (${s.roles.join('/') || '?'})`).join(', ') || '(trống)'}`); }
  if (mod === 'tasks' || mod === 'overview') { const l = S.tasks.filter(t => t.status !== 'done').slice(0, 20); if (l.length) out.push(`VIỆC ĐANG MỞ:\n${l.map(t => `- ${t.title}${t.deadline ? ' (hạn ' + fmtDT(t.deadline) + ')' : ''}${t.owner_name ? ' — ' + t.owner_name : ''}`).join('\n')}`); }
  return out.join('\n\n');
}
const MODNAME = {overview: 'Overview', assistant: 'AI Assistant', content: 'Content Studio', editorial: 'Editorial Desk', timeline: 'Timeline Studio', staff: 'Staff Assignment', knowledge: 'Knowledge Hub', tasks: 'Task Manager', activity: 'Hoạt động', settings: 'Cài đặt'};

async function turn(ctx, chat, text, attach, mod, ui) {
  const S = ctx.store, ev = ctx.event(), msgs = chat.messages;
  msgs.push({role: 'user', content: text, at: new Date().toISOString(), attach: attach ? {name: attach.name} : null});
  const bot = {role: 'assistant', content: '', at: new Date().toISOString(), sources: [], actions: [], stage: 'Đang đọc tài liệu…'}; msgs.push(bot); ui.draw();
  try {
    // (1) ĐỌC — tự động, chỉ lấy phần liên quan
    const found = retrieve(S, text + (ev ? ' ' + ev.name : ''), {k: 4, eventId: ev && ev.id});
    let drive = []; if (/drive|tìm file|tìm tài liệu trên/i.test(text) && ctx.g.has('drive')) { try { drive = await ctx.g.drive.search(text.replace(/.*?(tìm|drive)\s*/i, '').slice(0, 60)); } catch (e) {} }
    bot.sources = [...(ev ? [{name: `Dữ kiện sự kiện ${ev.code}`, status: 'official'}] : []), ...found.map(f => ({id: f.id, name: f.name, status: f.status, version: f.version, url: f.url})), ...(attach ? [{name: 'File đính kèm: ' + attach.name, status: 'reference'}] : [])];
    const context = [ev && `SỰ KIỆN ĐANG CHỌN:\n${clip(eventFacts(ev), 3500)}`, openContext(ctx, mod), found.length && `TÀI LIỆU TRONG KNOWLEDGE HUB:\n${found.map(f => `[${f.status === 'official' ? 'Chính thức' : 'Tham khảo'} — ${f.name}]\n${clip(f.excerpt, 900)}`).join('\n\n')}`,
      drive.length && `KẾT QUẢ TÌM TRÊN GOOGLE DRIVE:\n${drive.slice(0, 8).map(f => `- ${f.name} (${f.webViewLink})`).join('\n')}`, attach && `FILE ĐÍNH KÈM "${attach.name}":\n${clip(attach.text, 6000)}`].filter(Boolean).join('\n\n———\n\n');
    const system = `Bạn là trợ lý làm việc trong PHÒNG VY — Workroom (không gian làm việc truyền thông – biên tập). Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào việc.
Người dùng đang ở khu: ${MODNAME[mod] || mod}. Hôm nay: ${new Date().toLocaleDateString('vi-VN', {weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric'})}.
Chỉ khẳng định điều có trong NGỮ CẢNH; tài liệu ghi "Tham khảo" không phải nguồn chính thức. Không biết thì nói không có thông tin và hỏi lại — không bịa tên người, chức danh, số liệu, lời phát biểu.
Nếu người dùng nhờ THỰC HIỆN việc gì trong Workroom (tạo việc, tạo sự kiện, viết bài, lập timeline, xuất Google Docs, đặt lịch, soạn thư nháp…): nói ngắn gọn bạn đề xuất làm gì. Hệ thống sẽ hiện thẻ để người dùng xác nhận. Đừng nói là đã làm xong, đừng tự viết cả bài vào khung chat khi được nhờ viết bài.`;
    const history = msgs.slice(0, -2).slice(-8).map(m => ({role: m.role, content: clip(m.content, 1500)}));
    bot.stage = 'Đang suy nghĩ…'; ui.draw();
    // (2) TRẢ LỜI — stream
    const res = await ctx.ai.chat({task: 'Trò chuyện', system, messages: [...history, {role: 'user', content: (context ? `NGỮ CẢNH:\n${context}\n\n———\n\n` : '') + `YÊU CẦU: ${text}`}], onToken: (c, all) => { bot.content = all; bot.stage = ''; ui.stream(all); }});
    bot.content = res.text.trim(); bot.model = ctx.ai.cfg.model;
    // (3) HÀNH ĐỘNG — chỉ khi yêu cầu có vẻ nhờ làm việc; AI đề xuất, mã kiểm tra
    if (WANT.test(text)) {
      bot.stage = 'Đang xem có việc cần thực hiện…'; ui.draw();
      try {
        const o = await ctx.ai.json({task: 'Đề xuất hành động', system: `Bạn chuyển yêu cầu của người dùng thành các hành động của hệ thống. Chỉ dùng hành động trong DANH SÁCH. Chỉ đề xuất điều người dùng thực sự yêu cầu; nếu chỉ là câu hỏi thì trả actions rỗng. Ngày viết dạng YYYY-MM-DD (hôm nay là ${new Date().toISOString().slice(0, 10)}), giờ dạng HH:MM. Không bịa tham số còn thiếu — thiếu thì bỏ trống.\n\nDANH SÁCH:\n${ctx.actions.spec()}`,
          prompt: `${ev ? `Sự kiện đang chọn: ${ev.code} — ${ev.name}\n` : ''}Yêu cầu của người dùng: ${text}\n\nTrợ lý vừa trả lời: ${clip(bot.content, 800)}`}, ctx.actions.schema, o => { if (!Array.isArray(o.actions)) throw new Error('thiếu actions'); return o; });
        const bad = [];
        for (const a of o.actions.slice(0, 5)) { try { bot.actions.push({...ctx.actions.check(a), state: 'pending'}); } catch (e) { bad.push(`${a && a.name}: ${e.message}`); } }
        if (bad.length) bot.note = `Đã loại ${bad.length} đề xuất không hợp lệ (${clip(bad.join('; '), 200)}).`;
      } catch (e) { if (e.code === 'aborted') throw e; bot.note = 'Không đọc được đề xuất hành động: ' + e.message; }
    }
  } catch (e) { bot.error = e.code === 'aborted' ? '' : e.message; if (e.code === 'aborted') bot.content = (bot.content || '') + (bot.content ? '\n\n' : '') + '(đã dừng)'; }
  bot.stage = '';
  if (chat.title === 'Cuộc trò chuyện mới') chat.title = clip(text, 60);
  await S.set('chats', chat.id, {messages: msgs, title: chat.title, event_id: ev ? ev.id : null}, {silent: true}).catch(e => { bot.error = (bot.error ? bot.error + ' · ' : '') + 'Không lưu được hội thoại: ' + e.message; });
  ui.draw();
}

// khung trò chuyện dùng cho cả trang Assistant và panel Copilot
export function chatPanel(ctx, {mod, compact = false}) {
  const S = ctx.store, U = ctx.ui.chat ||= {id: null, busy: false, attach: null}, err = errBox();
  let chat = U.id && S.chats.find(c => c.id === U.id); if (!chat && !U.fresh && S.chats[0] && !compact) { chat = S.chats[0]; U.id = chat.id; }
  const list = h('div', {class: 'wr-msgs', role: 'log', 'aria-live': 'polite'}), stage = h('span', {class: 'wr-chip warn', hidden: true}, h('i'), '');
  let live = null;
  const actCard = (m, a) => h('div', {class: 'wr-act ' + a.level + ' ' + a.state},
    h('div', {class: 'wr-form'}, h('span', {class: 'wr-tag ' + (a.level === 'execute' ? 'late' : 'code')}, a.level === 'execute' ? 'Ghi ra ngoài · cần xác nhận' : 'Đề xuất · cần xác nhận'), h('b', {}, a.label)),
    h('p', {}, a.preview),
    a.state === 'pending' ? h('div', {class: 'wr-form'}, btn(a.level === 'execute' ? 'Xác nhận thực hiện' : 'Thực hiện', run(err, async () => { a.state = 'running'; draw(); try { const r = await ctx.actions.run(a); a.state = 'done'; a.result = r.text; a.url = r.url || null; a.go = r.go || null; } catch (e) { a.state = 'error'; a.result = e.message; }
        await S.set('chats', chat.id, {messages: chat.messages}, {silent: true}).catch(() => {}); if (a.state === 'done' && a.go && !compact) ctx.go(a.go); else { ctx.render(); } }), {icon: 'tick'}),
      btn('Bỏ qua', () => { a.state = 'skipped'; S.set('chats', chat.id, {messages: chat.messages}, {silent: true}).catch(() => {}); draw(); }, {ghost: true}))
      : h('p', {class: a.state === 'error' ? 'wr-err' : 'wr-empty'}, a.state === 'running' ? 'Đang thực hiện…' : a.state === 'skipped' ? 'Đã bỏ qua.' : a.result, a.url && h('a', {href: a.url, target: '_blank', rel: 'noopener'}, ' Mở'), a.state === 'done' && a.go && h('button', {class: 'wr-linkbtn', onclick: () => ctx.go(a.go)}, ' Xem trong ' + (MODNAME[a.go] || a.go))));
  function draw() {
    const msgs = chat ? chat.messages : []; live = null;
    list.replaceChildren(...(msgs.length ? msgs.map(m => { const body = h('div', {class: 'wr-bub'}, m.content);
      const el = h('div', {class: 'wr-msg ' + m.role}, m.attach && h('span', {class: 'wr-tag'}, 'Đính kèm: ' + m.attach.name), body,
        m.role === 'assistant' && m.stage && h('span', {class: 'wr-chip warn'}, h('i'), m.stage), m.error && h('p', {class: 'wr-err'}, m.error), m.note && h('p', {class: 'wr-empty'}, m.note),
        (m.actions || []).map(a => actCard(m, a)),
        m.role === 'assistant' && !m.stage && m.content && h('div', {class: 'wr-msgfoot'},
          (m.sources || []).length > 0 && h('details', {}, h('summary', {}, `Nguồn đã dùng (${m.sources.length})`), m.sources.map(s => h('div', {class: 'wr-row'}, h('span', {class: 't', title: s.name}, s.name), s.version && h('span', {class: 'm'}, 'bản ' + String(s.version).slice(0, 10)), h('span', {class: 'wr-tag ' + (s.status === 'official' ? 'ok' : '')}, s.status === 'official' ? 'Chính thức' : 'Tham khảo')))),
          h('button', {class: 'wr-linkbtn', onclick: () => navigator.clipboard.writeText(m.content).then(() => ctx.note('Đã sao chép.'))}, 'Sao chép'),
          !compact && h('button', {class: 'wr-linkbtn', title: 'Lưu câu trả lời này thành một bài nháp trong Content Studio', onclick: run(err, async () => { const ev = ctx.event(), ls = m.content.split('\n').filter(Boolean); const a = await S.add('articles', {event_id: ev ? ev.id : null, origin: 'ai', title: clip(ls.shift().replace(/^[#*\s]+|\*+$/g, ''), 200), body: textToHtml(ls.join('\n\n').replace(/\*\*/g, '')), sources: m.sources || []}, {log: 'Lưu câu trả lời của trợ lý thành bài nháp'}); (ctx.ui.content ||= {}).id = a.id; ctx.go('content'); })}, 'Đưa vào Content Studio'),
          m.model && h('span', {class: 'm'}, m.model)));
      if (m === msgs.at(-1) && m.role === 'assistant') live = body; return el; })
      : [h('div', {class: 'wr-empty', style: 'padding:24px 4px'}, ctx.ai.ready ? 'Hỏi về sự kiện đang chọn, nhờ tóm tắt brief, tạo việc, viết bài, lập timeline…' : 'AI trên máy chưa sẵn sàng. Vào Cài đặt & Kết nối để bật Ollama và chọn model.')]));
    list.scrollTop = list.scrollHeight; sendBtn.replaceChildren(...(U.busy ? [icon('stop'), 'Dừng'] : [icon('send'), 'Gửi'])); sendBtn.className = 'wr-btn' + (U.busy ? ' danger' : ''); ta.disabled = !ctx.ai.ready && !U.busy;
    attEl.replaceChildren(...(U.attach ? [h('span', {class: 'wr-tag'}, 'Đính kèm: ' + U.attach.name), h('button', {class: 'wr-x', 'aria-label': 'Bỏ đính kèm', onclick: () => { U.attach = null; draw(); }}, icon('x'))] : []));
  }
  U.cur = {draw, stream: all => { if (live && live.isConnected) { live.textContent = all; list.scrollTop = list.scrollHeight; const st = live.parentNode.querySelector('.wr-chip'); if (st) st.hidden = true; } }};
  const send = run(err, async () => {
    if (U.busy) return ctx.ai.stop();
    const text = ta.value.trim(); if (!text) return;
    if (!chat) { chat = await S.add('chats', {event_id: ctx.event() ? ctx.event().id : null}, {silent: true}); U.id = chat.id; U.fresh = false; }
    ta.value = ''; const att = U.attach; U.attach = null; U.busy = true;
    // giao diện có thể được vẽ lại giữa chừng (đổi module, dữ liệu đổi) → luôn gọi vào khung đang hiển thị (U.cur)
    try { await turn(ctx, chat, text, att, mod, {draw: () => U.cur.draw(), stream: t => U.cur.stream(t)}); } finally { U.busy = false; U.cur.draw(); ctx.render(); }
  });
  const ta = h('textarea', {class: 'wr-in', rows: compact ? 2 : 3, placeholder: 'Nhắn cho trợ lý… (Enter để gửi, Shift+Enter xuống dòng)', 'aria-label': 'Tin nhắn', onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } }});
  const sendBtn = h('button', {class: 'wr-btn', onclick: send}), attEl = h('span', {class: 'wr-form'});
  const attach = run(err, async () => { const f = await pickFile('.docx,.xlsx,.csv,.txt,.md'); if (!f) return; const {readAnyFile} = await import('./files.js'); U.attach = {name: f.name, text: (await readAnyFile(f)).text}; draw(); });
  const ev = ctx.event(), side = h('div', {class: 'wr-chatlist'});
  const drawSide = () => side.replaceChildren(btn('Cuộc trò chuyện mới', () => { U.id = null; U.fresh = true; ctx.render(); }, {ghost: true, icon: 'plus'}),
    ...S.chats.slice(0, 30).map(c => h('div', {class: 'wr-row'}, h('button', {class: 't wr-linkbtn' + (chat && c.id === chat.id ? ' cur' : ''), title: c.title, onclick: () => { U.id = c.id; U.fresh = false; ctx.render(); }}, c.title),
      h('button', {class: 'wr-x', 'aria-label': 'Xoá cuộc trò chuyện', title: 'Xoá', onclick: run(err, async () => { if (c.id === U.id) U.id = null; await S.del('chats', c.id); })}, icon('x')))));
  const composer = h('div', {class: 'wr-composer'}, attEl, ta, h('div', {class: 'wr-form'},
    btn('Đính kèm', attach, {ghost: true, icon: 'up'}), h('span', {class: 'wr-chip ' + (ev ? 'ok' : '')}, h('i'), ev ? ev.code : 'Chưa chọn sự kiện'),
    h('span', {class: 'wr-chip ' + (ctx.ai.ready ? 'ok' : 'bad'), title: 'Model đang dùng'}, h('i'), ctx.ai.ready ? ctx.ai.cfg.model : 'AI chưa sẵn sàng'), h('span', {style: 'flex:1'}), sendBtn), err);
  drawSide(); draw();
  return compact ? h('div', {class: 'wr-chat compact'}, list, composer) : h('div', {class: 'wr-chat'}, side, h('div', {class: 'wr-chatmain'}, list, composer));
}
export const assistant = ctx => h('div', {class: 'wr-wrap wide tall'}, head('AI Assistant', 'Trợ lý chạy trên máy này. Việc chuyên môn được đưa về đúng module, không nằm lại trong khung chat.'), chatPanel(ctx, {mod: 'assistant'}));
