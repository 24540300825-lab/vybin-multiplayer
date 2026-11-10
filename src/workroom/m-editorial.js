// PHÒNG VY — WORKROOM · EDITORIAL DESK: soát ngôn ngữ, đối chiếu dữ kiện với nguồn, đọc như một độc giả chưa dự sự kiện.
// Nguyên tắc cứng (được kiểm bằng mã, không chỉ dặn AI): mục "kiểm tra thông tin" và "thiếu thông tin" KHÔNG BAO GIỜ có câu sửa sẵn;
// đề xuất sửa nào thêm tên người / con số mà câu gốc không có thì bị chặn và chuyển thành mục cần xác minh.
import {h, icon, head, btn, run, errBox, fmtDT, htmlToText, wordDiff, dialog, confirmBox, esc} from './ui.js';
import {eventFacts, findPeople, kindName, guidelines} from './knowledge.js';
import {A_STATUS, approveArticle} from './m-content.js';

const TYPES = {error: 'Lỗi', fact: 'Kiểm tra thông tin', clarity: 'Chưa rõ', structure: 'Cấu trúc', style: 'Văn phong', missing: 'Thiếu thông tin'};
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const nums = s => new Set(String(s).match(/\d[\d.,/:]*\d|\d/g) || []);
const uid = () => Math.random().toString(36).slice(2, 9);

// các kiểm tra chắc chắn (không cần AI)
function ruleChecks(text, ev, sourceText) {
  const items = [], add = (type, quote, reason, suggestion = '') => items.push({id: uid(), type, quote, suggestion, reason, by: 'rule', state: 'open'});
  for (const m of text.matchAll(/\[CẦN BỔ SUNG:?[^\]]*\]/g)) add('missing', m[0], 'Bài còn để trống thông tin này. Cần tác giả bổ sung.');
  if (!sourceText.trim()) add('fact', '', 'Bài chưa gắn với sự kiện có brief hoặc tài liệu chính thức, nên không có căn cứ để đối chiếu tên người, chức danh, thời gian, địa điểm.');
  else for (const p of findPeople(text)) if (!norm(sourceText).includes(p.name)) add('fact', p.full, `Không tìm thấy "${p.name}" trong brief hay tài liệu chính thức của sự kiện. Cần xác minh họ tên và chức danh với nguồn.`);
  if (ev && ev.event_date) { const d = new Date(ev.event_date), dd = d.getDate(), mm = d.getMonth() + 1;
    for (const m of text.matchAll(/ngày\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/gi)) if ((+m[1] !== dd || +m[2] !== mm) && !norm(sourceText).includes(m[0].replace(/^ngày\s+/i, ''))) add('fact', m[0], `Ngày này khác ngày của sự kiện (${dd}/${mm}) và không có trong brief. Cần kiểm tra.`); }
  for (const m of text.matchAll(/(?<![\p{L}])([\p{L}]{2,})\s+\1(?![\p{L}])/giu)) if (!/^(luôn|dần|mãi|xa|cao|rất|đều|từ|ngày|người|nhà|năm)$/i.test(m[1])) add('error', m[0], 'Lặp từ liền nhau.', m[1]);
  for (const s of text.split(/(?<=[.!?…])\s+/)) if (s.split(/\s+/).length > 75) add('clarity', s.slice(0, 160), `Câu dài ${s.split(/\s+/).length} chữ, người đọc dễ mất ý. Nên tách câu.`);
  return items;
}
const SCHEMA = {type: 'object', required: ['reader', 'items'], properties: {
  reader: {type: 'object', required: ['understood', 'summary'], properties: {understood: {type: 'boolean'}, purpose_clear: {type: 'boolean'}, flow_ok: {type: 'boolean'}, summary: {type: 'string'},
    unclear: {type: 'array', items: {type: 'object', required: ['quote', 'question'], properties: {quote: {type: 'string'}, question: {type: 'string'}}}}}},
  items: {type: 'array', items: {type: 'object', required: ['type', 'quote', 'reason'], properties: {type: {type: 'string', enum: ['error', 'fact', 'clarity', 'structure', 'style', 'missing']}, quote: {type: 'string'}, suggestion: {type: 'string'}, reason: {type: 'string'}}}}}};

export async function runReview(ctx, art, onStage = () => {}) {
  const S = ctx.store, ev = S.eventOf(art.event_id), text = htmlToText(art.body);
  if (!text.trim()) throw new Error('Bài chưa có nội dung để biên tập.');
  const official = S.knowledge.filter(d => d.status === 'official' && ['official', 'people', 'event_record'].includes(d.category) && (!d.event_id || d.event_id === art.event_id));
  const sourceText = [eventFacts(ev), ...official.map(d => d.content)].join('\n');
  onStage('Đang đối chiếu với brief và tài liệu chính thức…');
  let items = ruleChecks(art.title + '\n' + text, ev, sourceText), reader = {}, note = '';
  if (ctx.ai.ready) {
    onStage('AI đang đọc bài như một độc giả chưa dự sự kiện…');
    const cut = text.slice(0, 7000), rules = guidelines(S);
    const o = await ctx.ai.json({task: 'Biên tập bài', system: `Bạn là biên tập viên tiếng Việt, KHÔNG có mặt tại sự kiện và chỉ biết những gì ghi trong NGUỒN.
Việc 1 — đọc như độc giả: độc giả có hiểu chuyện gì diễn ra, mục đích là gì, các đoạn có liền mạch không, bài có liệt kê hoạt động mà không nói ý nghĩa không? Chỗ nào không hiểu thì trích nguyên văn (quote) và đặt câu hỏi cho tác giả (question).
Việc 2 — liệt kê đề xuất, mỗi đề xuất 1 mục:
- error: lỗi chính tả, ngữ pháp, dấu câu. style: lặp từ, suồng sã, rườm rà. clarity: câu khó hiểu. structure: thứ tự/tách gộp đoạn.
- fact: tên người, chức danh, đơn vị, thời gian, địa điểm, tên sự kiện, lời phát biểu KHÔNG khớp hoặc KHÔNG có trong NGUỒN. missing: thiếu thông tin người đọc cần.
QUY TẮC: "quote" phải chép NGUYÊN VĂN một đoạn ngắn (dưới 40 chữ) từ bài. "suggestion" là câu thay thế cho đúng đoạn quote; với fact và missing thì để suggestion rỗng và nêu điều cần hỏi tác giả trong reason.
Tuyệt đối không thêm chi tiết, không đổi ý phát biểu, không đổi dữ kiện, không tạo trích dẫn. Không chắc thì hỏi, đừng sửa.`,
      prompt: `NGUỒN (brief và dữ kiện chính thức):\n${sourceText.slice(0, 5000) || '(không có)'}\n\n${rules.length ? 'QUY CHUẨN BIÊN TẬP:\n' + rules.map(r => r.content.slice(0, 1200)).join('\n') + '\n\n' : ''}LOẠI BÀI: ${kindName(art.kind)}\nTIÊU ĐỀ: ${art.title}\n\nBÀI:\n${cut}`}, SCHEMA, o => {
      if (!o || typeof o.reader !== 'object' || !Array.isArray(o.items)) throw new Error('thiếu reader/items'); return o; });
    if (text.length > cut.length) note = `Bài dài: AI chỉ đọc ${cut.length} ký tự đầu (trên tổng ${text.length}).`;
    const T = norm(art.title + '\n' + text), dropped = {n: 0};
    for (const it of o.items.slice(0, 40)) {
      const quote = norm(it.quote), type = TYPES[it.type] ? it.type : 'style'; let sug = norm(it.suggestion), reason = norm(it.reason).slice(0, 400), ty = type;
      if (!quote || !T.includes(quote)) { dropped.n++; continue; }                      // AI trích sai nguyên văn → bỏ
      if (ty === 'fact' || ty === 'missing') sug = '';                                    // không bao giờ tự sửa dữ kiện
      if (sug) { const addN = [...nums(sug)].filter(n => !nums(quote).has(n)), addP = findPeople(sug).filter(p => !quote.includes(p.name));
        if (addN.length || addP.length) { ty = 'fact'; reason = `AI muốn sửa thành câu có thông tin mới (${[...addN, ...addP.map(p => p.full)].join(', ')}) — đã chặn. ${reason}`; sug = ''; } }
      if (sug === quote) continue;
      if (items.some(x => x.quote === quote && x.type === ty)) continue;
      items.push({id: uid(), type: ty, quote, suggestion: sug, reason, by: 'ai', state: 'open'});
    }
    if (dropped.n) note += (note ? ' ' : '') + `Đã bỏ ${dropped.n} đề xuất vì AI trích không đúng nguyên văn.`;
    const r = o.reader; reader = {understood: !!r.understood, purpose_clear: r.purpose_clear !== false, flow_ok: r.flow_ok !== false, summary: norm(r.summary).slice(0, 600),
      unclear: (Array.isArray(r.unclear) ? r.unclear : []).filter(u => u && T.includes(norm(u.quote))).slice(0, 8).map(u => ({quote: norm(u.quote), question: norm(u.question).slice(0, 300)}))};
  } else note = 'AI trên máy chưa sẵn sàng: chỉ chạy các kiểm tra tự động (thiếu thông tin, đối chiếu tên người, ngày, lặp từ, câu quá dài).';
  reader.note = note;
  return S.add('reviews', {article_id: art.id, reader, items, model: ctx.ai.ready ? ctx.ai.cfg.model : null}, {log: `Biên tập "${art.title.slice(0, 60)}": ${items.length} mục`});
}
// thay đúng 1 chỗ trong HTML của bài; trả null nếu không tìm được (đoạn trích vắt qua chỗ in đậm/xuống dòng)
function applyToHtml(html, quote, sug) {
  const d = document.createElement('div'); d.innerHTML = html; const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const t = n.nodeValue, i = t.indexOf(quote); if (i >= 0) { n.nodeValue = t.slice(0, i) + sug + t.slice(i + quote.length); return d.innerHTML; }
    const tn = norm(t), j = tn.indexOf(quote); if (j >= 0) { n.nodeValue = tn.slice(0, j) + sug + tn.slice(j + quote.length); return d.innerHTML; } }
  return null;
}

export function editorial(ctx) {
  const S = ctx.store, U = ctx.ui.editorial ||= {id: null}, ev = ctx.event(), err = errBox();
  const arts = S.articles.filter(a => !ev || a.event_id === ev.id), art = U.id && S.articles.find(a => a.id === U.id);
  if (!art) return h('div', {class: 'wr-wrap'}, head('Editorial Desk', 'Chọn bài để biên tập.'),
    h('section', {class: 'wr-card'}, arts.length ? arts.map(a => h('div', {class: 'wr-row'}, h('span', {class: 'wr-tag'}, kindName(a.kind)), h('button', {class: 't wr-linkbtn', onclick: () => { U.id = a.id; U.rev = null; ctx.render(); }}, a.title || '(chưa đặt tên)'),
      h('span', {class: 'wr-tag ' + (a.status === 'review' ? 'high' : a.status === 'approved' ? 'ok' : '')}, A_STATUS[a.status]), h('span', {class: 'm'}, fmtDT(a.updated_at)))) : h('p', {class: 'wr-empty'}, 'Chưa có bài nào. Tạo bài ở Content Studio trước.')));
  const box = h('div', {}, h('p', {class: 'wr-empty'}, 'Đang tải kết quả biên tập…'));
  const paper = h('div', {class: 'wr-paper read'}, h('h2', {class: 'wr-title'}, art.title), h('div', {class: 'wr-ed', html: art.body}));
  const stage = h('span', {class: 'wr-chip warn', hidden: !U.busy}, h('i'), U.stage || '');
  const doRun = run(err, async () => { U.busy = true; U.stage = 'Bắt đầu…'; ctx.render();
    try { await S.add('versions', {article_id: art.id, label: 'Trước khi biên tập', title: art.title, body: art.body}, {silent: true}); await runReview(ctx, art, s => { U.stage = s; const el = document.querySelector('#wr .wr-stage'); if (el) el.lastChild.textContent = s; }); } finally { U.busy = false; ctx.render(); } });
  stage.classList.add('wr-stage');
  S.where('reviews', 'article_id', art.id).then(revs => {
    const rev = revs[0];
    if (!rev) return box.replaceChildren(h('p', {class: 'wr-empty'}, 'Bài này chưa được biên tập. Bấm "Chạy biên tập".'));
    const save = items => S.set('reviews', rev.id, {items}, {silent: true}).then(() => ctx.render());
    const setState = (ids, state) => save(rev.items.map(i => ids.includes(i.id) ? {...i, state} : i));
    const accept = run(err, async list => {
      let body = art.body, title = art.title; const done = [], manual = [];
      for (const it of list) { if (!it.suggestion && it.type !== 'error') continue; const sug = it.edited ?? it.suggestion;
        if (title.includes(it.quote)) { title = title.replace(it.quote, sug); done.push(it.id); continue; }
        const nb = applyToHtml(body, it.quote, sug); if (nb == null) manual.push(it.id); else { body = nb; done.push(it.id); } }
      if (done.length) await S.set('articles', art.id, {body, title}, {silent: true, log: `Nhận ${done.length} đề xuất biên tập: ${art.title.slice(0, 60)}`});
      await S.set('reviews', rev.id, {items: rev.items.map(i => done.includes(i.id) ? {...i, state: 'accepted'} : manual.includes(i.id) ? {...i, state: 'manual'} : i)}, {silent: true});
      if (manual.length) ctx.note(`${manual.length} mục không tự thay được (đoạn trích vắt qua định dạng) — sửa tay ở Content Studio.`);
      ctx.render();
    });
    const open = rev.items.filter(i => i.state === 'open'), fixable = open.filter(i => i.suggestion), sel = U.sel ||= new Set();
    const r = rev.reader || {};
    const item = it => { const inp = it.suggestion ? h('input', {class: 'wr-in', value: it.edited ?? it.suggestion, 'aria-label': 'Câu sửa', oninput: e => { it.edited = e.target.value; }}) : null;
      return h('div', {class: 'wr-item ' + it.type + (it.state !== 'open' ? ' closed' : '')},
        h('div', {class: 'wr-form'}, it.state === 'open' && it.suggestion && h('input', {type: 'checkbox', 'aria-label': 'Chọn mục này', checked: sel.has(it.id), onchange: e => { e.target.checked ? sel.add(it.id) : sel.delete(it.id); }}),
          h('span', {class: 'wr-tag t-' + it.type}, TYPES[it.type]), h('span', {class: 'm'}, it.by === 'ai' ? 'AI đề xuất' : 'Kiểm tra tự động'), h('span', {style: 'flex:1'}),
          it.state !== 'open' && h('span', {class: 'wr-tag ' + (it.state === 'accepted' || it.state === 'resolved' ? 'ok' : '')}, {accepted: 'Đã nhận', rejected: 'Đã bỏ', resolved: 'Đã xác minh', manual: 'Cần sửa tay'}[it.state])),
        it.quote && (it.suggestion ? h('div', {class: 'wr-diff', html: wordDiff(it.quote, it.edited ?? it.suggestion)}) : h('blockquote', {}, it.quote)),
        h('p', {class: 'why'}, it.reason),
        it.state === 'open' && h('div', {class: 'wr-form'}, inp,
          it.suggestion && btn('Nhận', () => accept([it]), {icon: 'tick'}),
          !it.suggestion && btn('Đã xác minh / đã xử lý', () => setState([it.id], 'resolved'), {ghost: true, icon: 'tick'}),
          !it.suggestion && btn('Tạo việc', run(err, async () => { await S.createTask({title: `Xác minh: ${(it.quote || it.reason).slice(0, 120)}`, description: it.reason, event_id: art.event_id, source: 'editorial', ref: {article: art.id, item: it.id}}); ctx.note('Đã thêm vào Task Manager.'); }), {ghost: true}),
          btn('Bỏ qua', () => setState([it.id], 'rejected'), {ghost: true})));
    };
    box.replaceChildren(
      h('section', {class: 'wr-card'}, h('h3', {}, 'Góc nhìn độc giả', h('span', {}, fmtDT(rev.created_at) + (rev.model ? ' · ' + rev.model : ''))),
        r.summary ? h('div', {}, h('div', {class: 'wr-form'}, h('span', {class: 'wr-tag ' + (r.understood ? 'ok' : 'late')}, r.understood ? 'Hiểu được sự kiện' : 'Chưa hiểu sự kiện'), h('span', {class: 'wr-tag ' + (r.purpose_clear ? 'ok' : 'late')}, r.purpose_clear ? 'Rõ mục đích' : 'Chưa rõ mục đích'), h('span', {class: 'wr-tag ' + (r.flow_ok ? 'ok' : 'late')}, r.flow_ok ? 'Mạch bài liền' : 'Mạch bài rời')),
          h('p', {style: 'margin-top:8px'}, r.summary), (r.unclear || []).map(u => h('div', {class: 'wr-item clarity'}, h('blockquote', {}, u.quote), h('p', {class: 'why'}, 'Câu hỏi cho tác giả: ' + u.question)))) : h('p', {class: 'wr-empty'}, 'Chưa có đánh giá của AI.'),
        r.note && h('p', {class: 'wr-empty'}, r.note)),
      h('section', {class: 'wr-card'}, h('h3', {}, 'Đề xuất', h('span', {}, `${open.length} đang mở / ${rev.items.length}`)),
        h('div', {class: 'wr-form', style: 'margin-bottom:10px'},
          btn('Nhận mục đã chọn', () => accept(open.filter(i => sel.has(i.id))), {ghost: true, disabled: !fixable.length}),
          btn(`Nhận tất cả câu sửa (${fixable.length})`, async () => { if (await confirmBox('Nhận tất cả', `Áp dụng ${fixable.length} câu sửa về ngôn ngữ? Các mục kiểm tra thông tin không bị đụng tới.`, 'Nhận tất cả')) accept(fixable); }, {ghost: true, disabled: !fixable.length}),
          btn('So với trước khi biên tập', run(err, async () => { const v = (await S.where('versions', 'article_id', art.id)).find(x => x.label === 'Trước khi biên tập'); if (!v) throw new Error('Không có bản trước khi biên tập.');
            dialog({title: 'Thay đổi so với trước khi biên tập', wide: true, body: h('div', {class: 'wr-diff big', html: wordDiff(v.title + '\n\n' + htmlToText(v.body), art.title + '\n\n' + htmlToText(art.body))})}); }), {ghost: true}),
          btn('Khôi phục bản trước biên tập', run(err, async () => { const v = (await S.where('versions', 'article_id', art.id)).find(x => x.label === 'Trước khi biên tập'); if (!v) throw new Error('Không có bản trước khi biên tập.');
            if (!await confirmBox('Khôi phục', 'Đưa bài về bản trước khi biên tập? Bản hiện tại được lưu thành một phiên bản.', 'Khôi phục')) return;
            await S.add('versions', {article_id: art.id, label: 'Trước khi khôi phục', title: art.title, body: art.body}, {silent: true}); await S.set('articles', art.id, {title: v.title, body: v.body}, {log: 'Khôi phục bản trước biên tập: ' + art.title.slice(0, 60)}); }), {ghost: true})),
        rev.items.length ? [...rev.items].sort((a, b) => (a.state !== 'open') - (b.state !== 'open')).map(item) : h('p', {class: 'wr-empty'}, 'Không có đề xuất nào.')));
  }).catch(e => { box.textContent = 'Không tải được: ' + e.message; });
  return h('div', {class: 'wr-wrap wide'},
    h('div', {class: 'wr-form', style: 'margin-bottom:12px'}, btn('Danh sách bài', () => { U.id = null; ctx.render(); }, {ghost: true}), h('span', {class: 'wr-tag'}, kindName(art.kind)), h('span', {class: 'wr-tag'}, A_STATUS[art.status]), h('span', {style: 'flex:1'}),
      stage, U.busy ? btn('Dừng', () => ctx.ai.stop(), {icon: 'stop', danger: true}) : btn('Chạy biên tập', doRun, {icon: 'check2'}),
      btn('Sửa trong Content Studio', () => { (ctx.ui.content ||= {}).id = art.id; ctx.go('content'); }, {ghost: true, icon: 'pen'}),
      btn('Duyệt bài', run(err, async () => { await approveArticle(ctx, art); }), {ghost: true, icon: 'tick', disabled: art.status === 'approved'})),
    err, h('div', {class: 'wr-edgrid rev'}, paper, box));
}
