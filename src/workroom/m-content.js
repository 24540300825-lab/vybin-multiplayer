// PHÒNG VY — WORKROOM · CONTENT STUDIO: tạo nội dung từ dữ kiện + bài mẫu đã duyệt, soạn thảo, phiên bản, xuất Google Docs / .docx.
import {h, icon, head, card, btn, run, errBox, fmtDT, textToHtml, htmlToText, cleanHtml, wordDiff, dialog, confirmBox, download, pickFile, debounce, esc} from './ui.js';
import {KINDS, kindName, samplesFor, guidelines, retrieve, eventFacts, FACT_RULES, srcRef, findPeople} from './knowledge.js';

export const A_STATUS = {draft: 'Bản nháp', review: 'Chờ biên tập', approved: 'Đã duyệt', published: 'Đã xuất bản'};
export const missingMarks = text => [...String(text || '').matchAll(/\[CẦN BỔ SUNG:?\s*([^\]]*)\]/g)].map(m => m[1].trim() || 'chưa rõ');
const FORMAT = {
  news: 'Tin bài: dòng đầu là TIÊU ĐỀ. Đoạn mở nêu thời gian, địa điểm, đơn vị tổ chức, tên và mục đích sự kiện. Thân bài đi theo diễn biến hoặc theo chủ đề, mỗi đoạn một ý. Kết bài nêu ý nghĩa.',
  caption: 'Caption mạng xã hội: dòng đầu là tiêu đề ngắn. Các đoạn ngắn, dễ đọc trên điện thoại. Kết bằng lời kêu gọi theo dõi/tham gia nếu dữ kiện có.',
  announce: 'Thông báo: tiêu đề rõ việc gì. Nêu ai, việc gì, khi nào, ở đâu, cần làm gì, liên hệ ai (chỉ khi dữ kiện có).',
  invite: 'Thư mời: kính gửi ai, mời tham dự gì, thời gian, địa điểm, nội dung chính, lời cảm ơn.',
  internal: 'Truyền thông nội bộ: ngắn gọn, đi thẳng vào việc, nêu rõ việc cần làm và hạn.',
  newsletter: 'Bản tin: tiêu đề, các mục tin ngắn có tiêu đề phụ.', script: 'Kịch bản / lời dẫn: câu ngắn, dễ đọc thành tiếng, chia theo cảnh/đoạn.',
};

// ---------- AI viết nháp: kết quả là 1 BÀI trong Content Studio (không phải 1 đoạn chat) ----------
export async function generateArticle(ctx, {ev, kind = 'news', notes = '', onToken}) {
  const S = ctx.store;
  if (!ev) throw new Error('Hãy chọn sự kiện trước (ô chọn ở thanh trên cùng).');
  if (!ev.brief && !notes.trim() && !ev.venue && !ev.attendees) throw new Error('Sự kiện chưa có brief hay thông tin nào để viết. Thêm brief ở Overview, hoặc ghi chú yêu cầu ở ô bên cạnh.');
  const samples = samplesFor(S, kind, 1), rules = guidelines(S);
  const found = retrieve(S, ev.name + ' ' + notes, {k: 3, cats: ['official', 'event_record', 'people', 'reference'], eventId: ev.id});
  const system = `Bạn là người viết nội dung truyền thông. ${FACT_RULES}\n\nĐỊNH DẠNG: ${FORMAT[kind] || FORMAT.news}\nChỉ trả về nội dung bài, không lời dẫn, không giải thích, không dùng ký hiệu markdown. Mỗi đoạn cách nhau 1 dòng trống.`;
  const prompt = [
    `DỮ KIỆN (nguồn duy nhất về sự kiện):\n${eventFacts(ev)}`,
    notes.trim() && `YÊU CẦU THÊM CỦA NGƯỜI VIẾT:\n${notes.trim()}`,
    found.length && `TÀI LIỆU LIÊN QUAN (có thể dùng làm dữ kiện nếu ghi "Chính thức"; "Tham khảo" thì chỉ để hiểu bối cảnh):\n${found.map(f => `[${f.status === 'official' ? 'Chính thức' : 'Tham khảo'} — ${f.name}]\n${f.excerpt}`).join('\n\n')}`,
    rules.length && `QUY CHUẨN BIÊN TẬP:\n${rules.map(r => r.content.slice(0, 1500)).join('\n')}`,
    samples.length ? `BÀI MẪU ĐÃ DUYỆT — chỉ học CẤU TRÚC và GIỌNG VĂN (cách đặt tiêu đề, mở bài, chú thích ảnh, phần ghi người thực hiện cuối bài). KHÔNG lấy bất kỳ tên người, số liệu, sự việc nào từ bài mẫu:\n${samples[0].content.slice(0, 3200)}` : null,
    `Hãy viết ${kindName(kind).toLowerCase()} cho sự kiện trên.`,
  ].filter(Boolean).join('\n\n———\n\n');
  const res = await ctx.ai.chat({heavy: true, task: 'Viết ' + kindName(kind).toLowerCase(), system, prompt, temperature: 0.5, onToken});
  const lines = res.text.replace(/^\s*(\*\*|#+\s*)/, '').trim().split('\n'), title = (lines.shift() || ev.name).replace(/^\*+|\*+$/g, '').replace(/^(Tiêu đề|TIÊU ĐỀ)\s*:\s*/, '').trim();
  const body = textToHtml(lines.join('\n').replace(/\*\*/g, ''));
  const sources = [{name: `Dữ kiện sự kiện ${ev.code}`, status: 'official', category: 'event'}, ...found.map(f => ({...f, excerpt: undefined, score: undefined})), ...samples.map(s => ({...srcRef(s), use: 'mẫu cấu trúc'}))];
  const art = await S.add('articles', {event_id: ev.id, kind, title, body, origin: 'ai', sources}, {log: `AI viết nháp ${kindName(kind).toLowerCase()}: ${title.slice(0, 80)}`});
  await S.add('versions', {article_id: art.id, label: 'Bản AI viết đầu tiên', title, body}, {silent: true});
  return art;
}
// AI sửa 1 đoạn được chọn. Trả {text, warn}: warn = những tên/số AI thêm vào mà đoạn gốc không có.
export async function aiEdit(ctx, mode, text, art) {
  const ask = {rewrite: 'Viết lại đoạn sau cho mạch lạc, rõ ý hơn.', shorten: 'Rút gọn đoạn sau còn khoảng một nửa, giữ ý chính.', expand: 'Diễn đạt đoạn sau đầy đủ, rõ hơn — KHÔNG thêm dữ kiện mới, chỉ làm rõ điều đã có.'}[mode];
  const res = await ctx.ai.chat({heavy: true, task: 'Sửa đoạn văn', temperature: 0.4,
    system: 'Bạn là biên tập viên tiếng Việt. Giữ NGUYÊN mọi tên người, chức danh, đơn vị, con số, ngày giờ, địa điểm và lời trích dẫn. Không thêm thông tin mới. Chỉ trả về đoạn đã sửa, không giải thích.',
    prompt: `${ask}\n\nBài: "${art.title}"\n\nĐOẠN CẦN SỬA:\n${text}`});
  const out = res.text.trim().replace(/^["“]|["”]$/g, ''), nums = s => new Set(String(s).match(/\d[\d.,/:]*/g) || []);
  const added = [...nums(out)].filter(n => !nums(text).has(n)), people = findPeople(out).filter(p => !text.includes(p.name)).map(p => p.full);
  return {text: out, warn: [...added, ...people]};
}

// ---------- xuất bản ra ngoài ----------
export async function exportDoc(ctx, art) {
  const S = ctx.store, G = ctx.g, ev = S.eventOf(art.event_id), html = `<h1>${esc(art.title)}</h1>${art.body}`;
  let mode = 'new';
  if (art.doc && art.doc.id) {
    let meta = null; try { meta = await G.drive.meta(art.doc.id); } catch (e) { if (e.code !== 'http') throw e; }
    if (meta) {
      const changed = meta.modifiedTime !== art.doc.modified;
      const v = await dialog({title: changed ? 'Google Docs đã được sửa từ lần xuất trước' : 'Cập nhật Google Docs đã có?',
        body: changed ? 'Bản trên Google Docs đã có thay đổi mà Workroom chưa biết. Ghi đè sẽ thay toàn bộ nội dung trên Docs bằng bản trong Workroom.' : 'Nội dung trên Google Docs sẽ được thay bằng bản hiện tại trong Workroom.',
        buttons: [['Huỷ', null], ['Tạo bản Docs mới', 'new'], [changed ? 'Ghi đè Docs' : 'Cập nhật Docs', 'update', changed ? 'danger' : 'primary']]});
      if (!v) return null; mode = v;
    }
  }
  const f = mode === 'update' ? await G.drive.updateDoc(art.doc.id, html, art.title) : await G.drive.createDoc(art.title || 'Bài viết', html, (await G.workFolder(ev)).id);
  await S.add('versions', {article_id: art.id, label: 'Xuất Google Docs', title: art.title, body: art.body}, {silent: true});
  return S.set('articles', art.id, {doc: {id: f.id, url: f.webViewLink, exported_at: new Date().toISOString(), modified: f.modifiedTime}}, {log: `${mode === 'update' ? 'Cập nhật' : 'Tạo'} Google Docs: ${art.title.slice(0, 80)}`});
}
// Duyệt bài: KHÔNG cho qua khi còn dữ kiện chưa xác minh
export async function approveArticle(ctx, art) {
  const S = ctx.store, text = art.title + '\n' + htmlToText(art.body), miss = missingMarks(text);
  const revs = await S.where('reviews', 'article_id', art.id), open = revs[0] ? revs[0].items.filter(i => ['fact', 'missing'].includes(i.type) && i.state === 'open') : [];
  const blocks = [miss.length && `${miss.length} chỗ còn ghi [CẦN BỔ SUNG]`, open.length && `${open.length} mục kiểm tra thông tin chưa xử lý ở Editorial Desk`, (art.stale || []).length && 'dữ kiện sự kiện đã đổi sau khi viết, chưa rà lại'].filter(Boolean);
  if (blocks.length) { await dialog({title: 'Chưa thể duyệt bài này', body: h('div', {}, h('p', {}, 'Bài còn thông tin chưa được xác minh:'), h('ul', {class: 'wr-list'}, blocks.map(b => h('li', {}, b))), h('p', {class: 'wr-empty'}, 'Xử lý xong các mục trên rồi duyệt lại.'))}); return null; }
  if (!await confirmBox('Duyệt bài', `Xác nhận "${art.title}" là bản đã duyệt?`, 'Duyệt')) return null;
  await S.add('versions', {article_id: art.id, label: 'Bản đã duyệt', title: art.title, body: art.body}, {silent: true});
  const r = await S.set('articles', art.id, {status: 'approved'}, {log: `Duyệt bài: ${art.title.slice(0, 80)}`});
  if (await confirmBox('Lưu vào Knowledge Hub?', 'Đưa bài đã duyệt này vào Knowledge Hub làm bài mẫu chính thức cho những lần viết sau?', 'Lưu làm bài mẫu'))
    await S.add('knowledge', {name: art.title, category: 'approved_article', status: 'official', kind: art.kind, source: 'workroom', content: htmlToText(art.body), event_id: art.event_id, url: art.doc && art.doc.url || null, version: new Date().toISOString().slice(0, 10)}, {log: `Thêm bài đã duyệt vào Knowledge Hub: ${art.title.slice(0, 80)}`});
  return r;
}

// ---------- giao diện ----------
export function content(ctx) {
  const S = ctx.store, U = ctx.ui.content ||= {id: null, panel: 'ai', kind: 'news', notes: ''};
  const art = U.id && S.articles.find(a => a.id === U.id);
  if (U.id && !art) U.id = null;
  return art ? editor(ctx, art, U) : listView(ctx, U);
}
function listView(ctx, U) {
  const S = ctx.store, ev = ctx.event(), err = errBox(), arts = S.articles.filter(a => !ev || a.event_id === ev.id), sample = samplesFor(S, U.kind, 1)[0];
  const out = h('div', {class: 'wr-stream', hidden: !U.busy}), kindSel = h('select', {'aria-label': 'Loại nội dung', onchange: e => { U.kind = e.target.value; ctx.render(); }}, KINDS.slice(0, 7).map(([v, n]) => h('option', {value: v, selected: U.kind === v}, n)));
  const notes = h('textarea', {class: 'wr-in', rows: 3, placeholder: 'Góc viết, điều cần nhấn mạnh, trích dẫn có sẵn… (không bắt buộc)', 'aria-label': 'Yêu cầu thêm', value: U.notes, oninput: e => { U.notes = e.target.value; }});
  const gen = run(err, async () => {
    U.busy = true; ctx.render();
    try { const a = await generateArticle(ctx, {ev, kind: U.kind, notes: U.notes, onToken: (c, all) => { const el = document.querySelector('#wr .wr-stream'); if (el) { el.hidden = false; el.textContent = all; el.scrollTop = el.scrollHeight; } }}); U.id = a.id; U.notes = ''; }
    finally { U.busy = false; ctx.render(); }
  });
  const blank = run(err, async () => { const a = await S.add('articles', {event_id: ev ? ev.id : null, kind: U.kind, title: 'Bài chưa đặt tên'}, {log: 'Tạo bài trống'}); U.id = a.id; ctx.render(); });
  const imp = run(err, async () => { const f = await pickFile('.docx,.txt,.md'); if (!f) return; const {readAnyFile} = await import('./files.js'), r = await readAnyFile(f), ls = r.text.split('\n').filter(Boolean);
    const a = await S.add('articles', {event_id: ev ? ev.id : null, kind: U.kind, origin: 'import', title: (ls.shift() || f.name).replace(/^#+\s*/, ''), body: textToHtml(ls.join('\n\n'))}, {log: 'Nhập bài từ file ' + f.name}); U.id = a.id; ctx.render(); });
  const ext = run(err, async () => { if (!ev) throw new Error('Hãy chọn sự kiện trước.'); const t = await ctx.ai.handoff(`Hãy viết ${kindName(U.kind).toLowerCase()} bằng tiếng Việt.\n\n${FACT_RULES}\n\nDỮ KIỆN:\n${eventFacts(ev)}\n\n${U.notes ? 'YÊU CẦU THÊM: ' + U.notes + '\n\n' : ''}${sample ? 'BÀI MẪU (chỉ học cấu trúc, giọng văn):\n' + sample.content.slice(0, 3000) : ''}`); if (!t) return;
    const ls = t.split('\n'); const a = await S.add('articles', {event_id: ev.id, kind: U.kind, origin: 'ai', title: (ls.shift() || ev.name).replace(/^[#*\s]+|\*+$/g, ''), body: textToHtml(ls.join('\n').replace(/\*\*/g, '')), sources: [{name: 'AI ngoài (ChatGPT/Gemini) — chưa kiểm chứng', status: 'draft'}]}, {log: 'Nhập bản nháp từ AI ngoài'}); U.id = a.id; ctx.render(); });
  return h('div', {class: 'wr-wrap'},
    head('Content Studio', ev ? `Đang làm cho ${ev.code} — ${ev.name}` : 'Chưa chọn sự kiện — đang xem mọi bài.'),
    h('div', {class: 'wr-grid'},
      h('section', {class: 'wr-card span'}, h('h3', {}, 'Viết bài mới'),
        h('div', {class: 'wr-form'}, h('label', {}, 'Loại nội dung '), kindSel,
          sample ? h('span', {class: 'wr-tag ok', title: sample.name}, 'Có bài mẫu chính thức') : h('span', {class: 'wr-tag late', title: 'AI sẽ viết theo cấu trúc chung. Thêm bài mẫu và đánh dấu "Chính thức" ở Knowledge Hub để bài sát giọng văn của đơn vị.'}, 'Chưa có bài mẫu chính thức cho loại này')),
        h('div', {style: 'margin:10px 0'}, notes),
        h('div', {class: 'wr-form'},
          U.busy ? btn('Dừng', () => ctx.ai.stop(), {icon: 'stop', danger: true}) : btn('AI viết nháp', gen, {icon: 'spark', disabled: !ctx.ai.ready, title: ctx.ai.ready ? '' : 'AI trên máy chưa sẵn sàng — xem Cài đặt & Kết nối'}),
          btn('Tạo bài trống', blank, {ghost: true, icon: 'plus'}), btn('Nhập từ file .docx / .txt', imp, {ghost: true, icon: 'up'}), btn('Dùng AI ngoài…', ext, {ghost: true, icon: 'ext'}),
          U.busy && h('span', {class: 'wr-chip warn'}, h('i'), 'AI đang viết…')),
        !ctx.ai.ready && h('p', {class: 'wr-empty'}, 'AI trên máy chưa sẵn sàng. Vẫn có thể tạo bài trống, nhập file, hoặc dùng AI ngoài.'), out, err),
      h('section', {class: 'wr-card span'}, h('h3', {}, 'Bài viết', arts.length > 0 && h('span', {}, arts.length + ' bài')),
        arts.length ? arts.map(a => h('div', {class: 'wr-row'},
          h('span', {class: 'wr-tag'}, kindName(a.kind)), a.origin === 'ai' && h('span', {class: 'wr-tag demo', title: 'Bản do AI đề xuất'}, 'AI'),
          h('button', {class: 't wr-linkbtn', title: a.title, onclick: () => { U.id = a.id; ctx.render(); }}, a.title || '(chưa đặt tên)'),
          (a.stale || []).length > 0 && h('span', {class: 'wr-tag late'}, 'Cần rà lại'), missingMarks(a.body).length > 0 && h('span', {class: 'wr-tag high'}, 'Thiếu thông tin'),
          a.doc && a.doc.url && h('a', {class: 'wr-tag', href: a.doc.url, target: '_blank', rel: 'noopener'}, 'Google Docs'),
          h('span', {class: 'wr-tag ' + (a.status === 'approved' ? 'ok' : '')}, A_STATUS[a.status]), h('span', {class: 'm'}, fmtDT(a.updated_at)))) : h('p', {class: 'wr-empty'}, 'Chưa có bài nào.'))));
}

function editor(ctx, art, U) {
  const S = ctx.store, err = errBox(), ev = S.eventOf(art.event_id);
  const title = h('input', {class: 'wr-title', value: art.title, placeholder: 'Tiêu đề', 'aria-label': 'Tiêu đề bài', maxLength: 300});
  const ed = h('div', {class: 'wr-ed', contentEditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Nội dung bài', spellcheck: true, html: art.body || '<p><br></p>'});
  const saveChip = h('span', {class: 'wr-chip ok'}, h('i'), 'Đã lưu');
  const cur = () => ({title: title.value.trim(), body: cleanHtml(ed.innerHTML)});
  let dirty = false;
  const persist = () => { if (!dirty) return Promise.resolve(); dirty = false; const c = cur(); Object.assign(art, c);   // cập nhật bản trong bộ nhớ ngay, rồi ghi xuống
    return S.set('articles', art.id, c, {silent: true}).then(() => { if (saveChip.isConnected) { saveChip.className = 'wr-chip ok'; saveChip.lastChild.textContent = 'Đã lưu ' + new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'}); } })
      .catch(e => { dirty = true; if (saveChip.isConnected) { saveChip.className = 'wr-chip bad'; saveChip.lastChild.textContent = 'Lưu lỗi — sẽ thử lại'; } }); };
  const save = debounce(persist, 1200);
  const touch = () => { dirty = true; saveChip.className = 'wr-chip warn'; saveChip.lastChild.textContent = 'Chưa lưu…'; save(); };
  ctx.ui.flush = () => persist();
  title.oninput = touch; ed.oninput = touch;
  ed.onpaste = e => { e.preventDefault(); const html = e.clipboardData.getData('text/html'), t = e.clipboardData.getData('text/plain'); document.execCommand('insertHTML', false, html ? cleanHtml(html) : textToHtml(t)); };
  let range = null;
  const keepSel = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode) && !s.isCollapsed) range = s.getRangeAt(0).cloneRange(); };
  ed.onmouseup = ed.onkeyup = keepSel;
  const cmd = (c, v) => () => { ed.focus(); document.execCommand(c, false, v); touch(); };
  const tb = (label, fn, t) => h('button', {class: 'wr-tb', title: t, 'aria-label': t, onmousedown: e => e.preventDefault(), onclick: fn}, label);
  const toolbar = h('div', {class: 'wr-toolbar', role: 'toolbar', 'aria-label': 'Định dạng'},
    tb('H2', cmd('formatBlock', 'h2'), 'Tiêu đề mục'), tb('H3', cmd('formatBlock', 'h3'), 'Tiêu đề phụ'), tb('¶', cmd('formatBlock', 'p'), 'Đoạn văn thường'), h('i', {class: 'sep'}),
    tb(h('b', {}, 'B'), cmd('bold'), 'In đậm'), tb(h('i', {}, 'I'), cmd('italic'), 'In nghiêng'), h('i', {class: 'sep'}),
    tb('• Danh sách', cmd('insertUnorderedList'), 'Danh sách chấm'), tb('1. Danh sách', cmd('insertOrderedList'), 'Danh sách số'), h('i', {class: 'sep'}),
    tb(icon('undo'), cmd('undo'), 'Hoàn tác'), tb(icon('redo'), cmd('redo'), 'Làm lại'), h('span', {style: 'flex:1'}), saveChip);
  const snapshot = label => persist().then(() => S.add('versions', {article_id: art.id, label, title: art.title, body: art.body}, {silent: true}));
  const back = async () => { await persist(); U.id = null; ctx.ui.flush = null; ctx.render(); };

  // ---- khung bên phải ----
  const side = h('div', {class: 'wr-side2'});
  const tab = (id, n) => h('button', {class: 'wr-tab' + (U.panel === id ? ' on' : ''), onclick: async () => { await persist(); U.panel = id; ctx.render(); }}, n);
  const tabs = h('div', {class: 'wr-tabs'}, tab('ai', 'AI'), tab('ver', 'Phiên bản'), tab('src', 'Nguồn'));
  const propBox = h('div', {});
  const propose = (orig, next, warn, apply) => {
    propBox.replaceChildren(h('div', {class: 'wr-prop'}, h('b', {}, 'Đề xuất của AI'), h('div', {class: 'wr-diff', html: wordDiff(orig, next)}),
      warn.length > 0 && h('p', {class: 'wr-err'}, 'Lưu ý: AI đã thêm thông tin đoạn gốc không có: ' + warn.join(', ') + '. Kiểm tra trước khi nhận.'),
      h('div', {class: 'wr-form'}, btn('Chấp nhận', async () => { await snapshot('Trước khi nhận đề xuất AI'); apply(); touch(); propBox.replaceChildren(); }, {icon: 'tick'}), btn('Bỏ', () => propBox.replaceChildren(), {ghost: true}))));
  };
  const selOp = mode => run(err, async () => {
    if (!range || !range.toString().trim()) throw new Error('Bôi đen đoạn cần sửa trong bài trước.');
    const r = range, orig = r.toString(); propBox.replaceChildren(h('p', {class: 'wr-empty'}, 'AI đang xử lý đoạn đã chọn…'));
    try { const o = await aiEdit(ctx, mode, orig, art); propose(orig, o.text, o.warn, () => { r.deleteContents(); r.insertNode(document.createTextNode(o.text)); range = null; }); } catch (e) { propBox.replaceChildren(); throw e; }
  });
  const headline = run(err, async () => {
    propBox.replaceChildren(h('p', {class: 'wr-empty'}, 'AI đang gợi ý tiêu đề…'));
    try {
      const o = await ctx.ai.json({heavy: true, task: 'Gợi ý tiêu đề', prompt: `Đề xuất 3 tiêu đề tiếng Việt cho bài sau. Không thêm dữ kiện ngoài bài.\n\nTiêu đề hiện tại: ${title.value}\n\n${htmlToText(ed.innerHTML).slice(0, 5000)}`},
        {type: 'object', properties: {titles: {type: 'array', items: {type: 'string'}}}, required: ['titles']}, o => { if (!Array.isArray(o.titles) || !o.titles.length) throw new Error('thiếu titles'); return o.titles.filter(t => typeof t === 'string' && t.trim()).slice(0, 4); });
      propBox.replaceChildren(h('div', {class: 'wr-prop'}, h('b', {}, 'Tiêu đề gợi ý'), o.map(t => h('button', {class: 'wr-pick', onclick: async () => { await snapshot('Trước khi đổi tiêu đề'); title.value = t; touch(); propBox.replaceChildren(); }}, t)), btn('Bỏ', () => propBox.replaceChildren(), {ghost: true})));
    } catch (e) { propBox.replaceChildren(); throw e; }
  });
  if (U.panel === 'ai') side.append(tabs, h('p', {class: 'wr-empty'}, 'Bôi đen một đoạn trong bài rồi chọn:'),
    h('div', {class: 'wr-form'}, btn('Viết lại', selOp('rewrite'), {ghost: true, disabled: !ctx.ai.ready}), btn('Rút gọn', selOp('shorten'), {ghost: true, disabled: !ctx.ai.ready}), btn('Mở rộng', selOp('expand'), {ghost: true, disabled: !ctx.ai.ready})),
    h('div', {class: 'wr-form', style: 'margin-top:8px'}, btn('Gợi ý tiêu đề', headline, {ghost: true, disabled: !ctx.ai.ready})), !ctx.ai.ready && h('p', {class: 'wr-empty'}, 'AI trên máy chưa sẵn sàng.'), propBox);
  if (U.panel === 'src') side.append(tabs, (art.sources || []).length ? art.sources.map(s => h('div', {class: 'wr-row'}, h('span', {class: 't', title: s.name}, s.name), s.use && h('span', {class: 'm'}, s.use), h('span', {class: 'wr-tag ' + (s.status === 'official' ? 'ok' : s.status === 'draft' ? 'late' : '')}, s.status === 'official' ? 'Chính thức' : s.status === 'draft' ? 'Chưa kiểm chứng' : 'Tham khảo')))
    : h('p', {class: 'wr-empty'}, art.origin === 'ai' ? 'Không ghi nhận nguồn.' : 'Bài viết tay — không có nguồn do AI dùng.'));
  if (U.panel === 'ver') { const box = h('div', {}, h('p', {class: 'wr-empty'}, 'Đang tải…')); side.append(tabs, btn('Lưu phiên bản hiện tại', run(err, async () => { await snapshot('Lưu tay'); ctx.render(); }), {ghost: true, icon: 'plus'}), box);
    S.where('versions', 'article_id', art.id).then(vs => box.replaceChildren(...(vs.length ? vs.map(v => h('div', {class: 'wr-row'}, h('span', {class: 't'}, v.label || 'Phiên bản'), h('span', {class: 'm'}, fmtDT(v.created_at)),
      btn('So sánh', () => dialog({title: `So với "${v.label}" (${fmtDT(v.created_at)})`, wide: true, body: h('div', {class: 'wr-diff big', html: wordDiff(v.title + '\n\n' + htmlToText(v.body), cur().title + '\n\n' + htmlToText(cur().body))})}), {ghost: true}),
      btn('Khôi phục', run(err, async () => { if (!await confirmBox('Khôi phục phiên bản', 'Bản hiện tại sẽ được lưu thành một phiên bản trước khi khôi phục.', 'Khôi phục')) return; await snapshot('Trước khi khôi phục'); await S.set('articles', art.id, {title: v.title, body: v.body}, {log: 'Khôi phục phiên bản: ' + art.title.slice(0, 60)}); }), {ghost: true}))) : [h('p', {class: 'wr-empty'}, 'Chưa có phiên bản nào.')]))).catch(e => { box.textContent = 'Không tải được: ' + e.message; }); }

  const miss = missingMarks(htmlToText(art.body)), stale = art.stale || [];
  const setStatus = run(err, async e => { const v = e.target.value; await persist(); if (v === 'approved') { const r = await approveArticle(ctx, art); if (!r) ctx.render(); return; } await S.set('articles', art.id, {status: v}, {log: `${art.title.slice(0, 60)} → ${A_STATUS[v]}`}); });
  return h('div', {class: 'wr-wrap wide'},
    h('div', {class: 'wr-form', style: 'margin-bottom:12px'}, btn('Danh sách bài', back, {ghost: true}), h('span', {class: 'wr-tag'}, kindName(art.kind)), ev && h('span', {class: 'wr-tag code'}, ev.code),
      h('span', {style: 'flex:1'}), h('label', {}, 'Trạng thái '), h('select', {class: 'wr-in', 'aria-label': 'Trạng thái bài', onchange: setStatus}, Object.entries(A_STATUS).map(([v, n]) => h('option', {value: v, selected: art.status === v}, n)))),
    stale.length > 0 && h('div', {class: 'wr-banner'}, icon('warn'), h('div', {}, h('b', {}, 'Dữ kiện sự kiện đã đổi sau khi bài này được viết — hãy rà lại:'), h('ul', {class: 'wr-list'}, stale.map(s => h('li', {}, `${s.label}: "${s.old || '(trống)'}" → "${s.new || '(trống)'}"${s.old && htmlToText(art.body).includes(s.old) ? ' — bài vẫn còn chứa giá trị cũ' : ''}`)))),
      btn('Đã rà xong', run(err, () => S.set('articles', art.id, {stale: []}, {log: 'Đã rà lại dữ kiện: ' + art.title.slice(0, 60)})), {ghost: true})),
    miss.length > 0 && h('div', {class: 'wr-banner soft'}, icon('warn'), h('div', {}, h('b', {}, `Còn ${miss.length} chỗ thiếu thông tin: `), miss.slice(0, 6).join(' · '))),
    h('div', {class: 'wr-edgrid'}, h('div', {class: 'wr-paper'}, title, toolbar, ed), side),
    h('div', {class: 'wr-form', style: 'margin-top:14px'},
      btn(art.doc && art.doc.id ? 'Cập nhật Google Docs' : 'Xuất sang Google Docs', run(err, async () => { await persist(); const r = await exportDoc(ctx, art); if (r) ctx.note('Đã lưu lên Google Docs.'); }), {icon: 'doc', disabled: !ctx.g.has('drive'), title: ctx.g.has('drive') ? '' : 'Cần kết nối Google ở Cài đặt & Kết nối'}),
      art.doc && art.doc.url && h('a', {class: 'wr-btn ghost', href: art.doc.url, target: '_blank', rel: 'noopener'}, icon('ext'), 'Mở Google Docs'),
      btn('Tải .docx', run(err, async () => { await persist(); const {writeDocx} = await import('./files.js'); download(writeDocx(art.title, art.body), (art.title || 'bai-viet').slice(0, 80) + '.docx'); }), {ghost: true, icon: 'down'}),
      btn('Gửi sang Editorial Desk', run(err, async () => { await persist(); await snapshot('Trước khi biên tập'); if (art.status === 'draft') await S.set('articles', art.id, {status: 'review'}, {silent: true, log: `${art.title.slice(0, 60)} → Chờ biên tập`}); (ctx.ui.editorial ||= {}).id = art.id; ctx.ui.flush = null; ctx.go('editorial'); }), {ghost: true, icon: 'check2'}),
      h('span', {style: 'flex:1'}), btn('Xoá bài', run(err, async () => { if (!await confirmBox('Xoá bài', `Xoá "${art.title}" cùng mọi phiên bản? Không khôi phục được. (File Google Docs nếu có vẫn giữ nguyên.)`, 'Xoá', true)) return; U.id = null; ctx.ui.flush = null; await S.del('articles', art.id, {log: 'Xoá bài: ' + art.title.slice(0, 60)}); }), {ghost: true, icon: 'trash'})),
    !ctx.g.has('drive') && h('p', {class: 'wr-empty'}, 'Chưa kết nối Google nên chưa xuất thẳng sang Google Docs được — vẫn tải được file .docx để mở bằng Google Docs.'), err);
}
