// PHÒNG VY — WORKROOM · XUẤT & BÀN GIAO.
// Xuất: Word/Excel đúng mẫu · PDF · Google Docs/Sheets (bản sửa & góp ý trực tuyến) · file gốc trên Drive · chữ để đăng/gửi theo từng loại việc.
// Bàn giao: người nhận + hạn nộp + lời nhắn → chia sẻ quyền góp ý / thư nháp Gmail / sao chép gửi Zalo; lấy góp ý về → AI sửa theo góp ý.
// Nguyên tắc: không tự gửi gì. Chia sẻ quyền (Google báo email cho người nhận) chỉ chạy khi Vy bấm và xác nhận; Gmail chỉ tạo NHÁP.
import {h, icon, btn, dialog, confirmBox, download, fmtDT, errBox, run} from './ui.js';
import {KINDS, groupOf, toFile, fileName, copies, preview, asText} from './kinds.js';
import {writeDoc} from './gen.js';

const MSG = {news_tv: 'kịch bản Bản tin ULAW TV', news_en: 'kịch bản Bản tin ULAW Tiếng Anh', video: 'kịch bản video', caption: 'caption', article: 'tin bài', schedule: 'lịch công tác tuần', timeline: 'timeline truyền thông'};
export const STATUS = [['draft', 'Nháp'], ['review', 'Gửi duyệt'], ['revise', 'Cần sửa'], ['approved', 'Đã duyệt'], ['published', 'Đã đăng']];
export const statusName = s => (STATUS.find(x => x[0] === s) || STATUS[0])[1];
export const statusTag = s => h('span', {class: 'wr-tag st-' + (s || 'draft')}, statusName(s));
const isSheet = kind => kind === 'timeline';
const now = () => new Date().toISOString();

async function needGoogle(ctx, groups = ['drive']) {
  const G = ctx.g;
  if (G.status === 'connected' && groups.every(g => G.has(g))) return true;
  const what = groups.includes('gmail') ? 'Google Drive + Gmail (chỉ tạo thư nháp)' : 'Google Drive';
  if (await confirmBox('Kết nối Google', `Cần kết nối ${what} để làm việc này. Trang sẽ chuyển sang Google rồi quay lại đúng chỗ.`, 'Kết nối')) await G.connect(groups);
  return false;
}
// thư mục đích: “Nơi lưu” Vy chọn cho từng mục (Cài đặt) hoặc mặc định PHÒNG VY — Workroom/<Mục>; tài liệu chương trình → thêm thư mục chương trình
async function destFolder(ctx, doc) {
  const S = ctx.store, grp = groupOf(doc.kind), ev = doc.event_id && S.eventOf(doc.event_id), base = (S.settings.dest || {})[grp.id] || null;
  const names = base ? (ev ? [ev.name.slice(0, 100)] : []) : (ev ? ['Chương trình', ev.name.slice(0, 100), grp.name] : [grp.name]);
  return ctx.g.folderPath(names, base);
}
const srcs = doc => doc.sources || [];
async function fileOf(doc) { return {blob: await toFile(doc.kind, doc.data || {}, srcs(doc)), name: fileName(doc.kind, doc)}; }

// file gốc .docx/.xlsx trên Drive (giữ y định dạng mẫu)
export async function saveDrive(ctx, doc) {
  if (!await needGoogle(ctx)) return null;
  const {blob, name} = await fileOf(doc), dir = await destFolder(ctx, doc);
  let f; try { f = await ctx.g.drive.putFile(blob, {name, mime: blob.type, parent: dir.id, id: doc.drive && doc.drive.id}); }
  catch (e) { if (doc.drive && doc.drive.id && e.code === 'http') f = await ctx.g.drive.putFile(blob, {name, mime: blob.type, parent: dir.id}); else throw e; }
  await ctx.store.saveDoc(doc.id, {drive: {id: f.id, url: f.webViewLink, at: now()}});
  await ctx.store.log('doc.drive', `Lưu file lên Drive: ${name}`, doc.event_id || null, {id: doc.id});
  return f.webViewLink;
}
// bản Google Docs / Sheets (Google tự chuyển từ file đúng mẫu) — cùng 1 link cho mọi lần cập nhật để người duyệt góp ý liên tục
export async function saveGoogle(ctx, doc) {
  if (!await needGoogle(ctx)) return null;
  const G = ctx.g, {blob, name} = await fileOf(doc), dir = await destFolder(ctx, doc), to = isSheet(doc.kind) ? G.MIME.sheet : G.MIME.doc;
  const gname = name.replace(/\.(docx|xlsx)$/, '');
  let f = null;
  if (doc.gdoc && doc.gdoc.id) { try { f = await G.drive.putFile(blob, {name: gname, mime: blob.type, id: doc.gdoc.id}); } catch (e) { f = null; } }
  if (!f) f = await G.drive.putFile(blob, {name: gname, mime: blob.type, parent: dir.id, convertTo: to});
  await ctx.store.saveDoc(doc.id, {gdoc: {id: f.id, url: f.webViewLink, at: now()}});
  await ctx.store.log('doc.gdoc', `Cập nhật Google ${isSheet(doc.kind) ? 'Sheets' : 'Docs'}: ${gname}`, doc.event_id || null, {id: doc.id});
  return f.webViewLink;
}
// PDF: có Google → xuất từ bản Google (giống file thật nhất); chưa có → in từ bản xem trước (Lưu thành PDF)
export async function savePdf(ctx, doc) {
  if (ctx.g.status === 'connected') {
    await saveGoogle(ctx, doc); const d = ctx.store.doc(doc.id);
    download(await ctx.g.drive.exportAs(d.gdoc.id, 'application/pdf'), fileName(doc.kind, doc).replace(/\.(docx|xlsx)$/, '.pdf')); return;
  }
  printPreview(doc);
}
export function printPreview(doc) {
  const p = preview(doc.kind, doc.data || {}, srcs(doc)), w = window.open('', '_blank');
  if (!w) throw new Error('Trình duyệt chặn cửa sổ in. Cho phép cửa sổ bật lên rồi thử lại.');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${fileName(doc.kind, doc)}</title><style>@page{size:A4 ${p.land ? 'landscape' : 'portrait'};margin:2.54cm}body{font-family:'Times New Roman',serif;line-height:1.15;margin:0}p{margin:0 0 4pt}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #000;vertical-align:top;padding:4px}.pv-xh{display:flex;justify-content:space-between;text-align:center}.pv-xt{text-align:center;font-weight:700}img{max-width:100%}</style>${p.html}<script>onload=()=>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}
const copyText = async (ctx, text, what) => { try { await navigator.clipboard.writeText(text); ctx.note('Đã sao chép: ' + what); } catch (e) { await dialog({title: 'Sao chép thủ công', body: h('textarea', {class: 'wr-in', rows: 14, value: text, 'aria-label': 'Nội dung'})}); } };

// ===================== HỘP XUẤT =====================
export async function exportDialog(ctx, doc) {
  doc = ctx.store.doc(doc.id) || doc;
  const err = errBox(), K = KINDS[doc.kind], sheet = isSheet(doc.kind), C = copies(doc.kind, doc.data || {});
  const S = ctx.store, grp = groupOf(doc.kind), dest = (S.settings.dest || {})[grp.id];
  const link = (o, label) => o && o.url ? h('a', {class: 'wr-btn ghost sm', href: o.url, target: '_blank', rel: 'noopener'}, icon('ext'), label) : null;
  const act = (label, fn, o = {}) => btn(label, run(err, async () => { await fn(); }), o);
  await dialog({title: 'Xuất “' + (doc.title || K.name).slice(0, 60) + '”', wide: true, body: done => h('div', {class: 'wr-out'},
    h('section', {}, h('h4', {}, icon('down'), 'Tải về máy'),
      h('div', {class: 'wr-row'}, act(sheet ? 'Excel (.xlsx)' : 'Word (.docx)', async () => { const {blob, name} = await fileOf(doc); download(blob, name); }), act('PDF', () => savePdf(ctx, doc), {ghost: true}),
        act('Văn bản (.txt)', async () => download(new Blob([asText(doc.kind, doc.data || {})], {type: 'text/plain;charset=utf-8'}), fileName(doc.kind, doc).replace(/\.\w+$/, '.txt')), {ghost: true})),
      h('p', {class: 'wr-mute'}, 'File đúng mẫu của phòng: lề, khổ giấy, cỡ chữ, bảng, cột.')),
    h('section', {}, h('h4', {}, icon('drive'), 'Google Drive'),
      h('div', {class: 'wr-row'}, act(sheet ? 'Mở bằng Google Sheets' : 'Mở bằng Google Docs', async () => { const u = await saveGoogle(ctx, doc); if (u) window.open(u, '_blank', 'noopener'); }),
        act('Lưu file gốc (.' + K.ext + ') lên Drive', async () => { const u = await saveDrive(ctx, doc); if (u) ctx.note('Đã lưu file lên Drive'); }, {ghost: true})),
      h('div', {class: 'wr-row'}, link(doc.gdoc, sheet ? 'Google Sheets' : 'Google Docs'), link(doc.drive, 'File .' + K.ext), (doc.gdoc && doc.gdoc.at || doc.drive && doc.drive.at) ? h('span', {class: 'wr-mute'}, 'cập nhật ' + fmtDT((doc.gdoc && doc.gdoc.at) || doc.drive.at)) : null),
      h('p', {class: 'wr-mute'}, 'Lưu vào: ' + (dest ? 'thư mục bạn chọn cho mục ' + grp.name : 'PHÒNG VY — Workroom / ' + (doc.event_id ? 'Chương trình / …' : grp.name)) + '. Đổi nơi lưu ở Cài đặt. Cập nhật lại = cùng link, Drive giữ lịch sử phiên bản.')),
    C.length ? h('section', {}, h('h4', {}, icon('copy'), 'Sao chép để gửi / đăng'),
      h('div', {class: 'wr-stack'}, C.map(c => h('div', {class: 'wr-copy'}, h('div', {}, h('b', {}, c.label), h('small', {}, c.text.slice(0, 140).replace(/\n/g, ' ') + (c.text.length > 140 ? '…' : ''))), btn('Sao chép', () => copyText(ctx, c.text, c.label), {sm: 1}))))) : null, err),
    buttons: [['Đóng', null]]});
}

// ===================== HỘP BÀN GIAO =====================
export async function handoffDialog(ctx, doc) {
  const S = ctx.store; doc = S.doc(doc.id) || doc;
  const K = KINDS[doc.kind], H = {to: [], deadline: '', note: '', feedback: [], log: [], ...(doc.handoff || {})}, err = errBox();
  const contacts = S.settings.contacts || [], sheet = isSheet(doc.kind);
  const save = async (patch = {}, extra = {}) => { Object.assign(H, patch); await S.saveDoc(doc.id, {handoff: {...H}, ...extra}, {silent: true}); doc = S.doc(doc.id); };
  const toIn = h('input', {class: 'wr-in', placeholder: 'Thêm email người nhận', 'aria-label': 'Email người nhận', type: 'email'});
  const dl = h('input', {class: 'wr-in', type: 'datetime-local', 'aria-label': 'Hạn nộp', value: H.deadline || ''});
  const msg = h('textarea', {class: 'wr-in', rows: 5, 'aria-label': 'Lời nhắn'});
  const defMsg = () => `Chào anh/chị,\nEm gửi ${MSG[doc.kind]} “${doc.title || ''}” để anh/chị duyệt và góp ý giúp em.${doc.gdoc && doc.gdoc.url ? '\nLink: ' + doc.gdoc.url : ''}${dl.value ? '\nHạn phản hồi: ' + new Date(dl.value).toLocaleString('vi-VN', {hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'}) : ''}\nEm cảm ơn ạ.`;
  msg.value = H.note || defMsg();
  const chips = h('div', {class: 'wr-chips'}), fbList = h('div', {class: 'wr-stack'}), fbPaste = h('textarea', {class: 'wr-in', rows: 3, placeholder: 'Dán góp ý nhận qua Zalo / email…', 'aria-label': 'Dán góp ý'});
  const paintTo = () => chips.replaceChildren(...[...new Set([...contacts.map(c => c.email), ...H.to])].map(em => { const c = contacts.find(x => x.email === em), on = H.to.includes(em);
    return h('button', {class: 'wr-pick' + (on ? ' on' : ''), onclick: async () => { H.to = on ? H.to.filter(x => x !== em) : [...H.to, em]; await save(); paintTo(); }}, (on ? '✓ ' : '') + (c ? c.name + (c.role ? ' · ' + c.role : '') : em)); }));
  const paintFb = () => fbList.replaceChildren(...(H.feedback.length ? H.feedback.map((f, i) => h('label', {class: 'wr-fb' + (f.done ? ' done' : '')}, h('input', {type: 'checkbox', checked: !!f.done, onchange: async e => { H.feedback[i].done = e.target.checked; await save(); paintFb(); }}),
    h('span', {}, h('b', {}, (f.who || 'Góp ý') + (f.quote ? ' — “' + f.quote.slice(0, 60) + '”' : '') + ': '), f.text))) : [h('p', {class: 'wr-mute'}, 'Chưa có góp ý.')]));
  paintTo(); paintFb();
  const addTo = async () => { const v = toIn.value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { err.textContent = 'Email chưa đúng.'; return; } toIn.value = ''; if (!H.to.includes(v)) H.to.push(v); await save(); paintTo(); };
  const persistMeta = () => save({deadline: dl.value, note: msg.value});
  const share = run(err, async () => {
    await persistMeta(); if (!H.to.length) throw new Error('Chọn ít nhất 1 người nhận.');
    if (!await needGoogle(ctx)) return;
    if (!await confirmBox('Chia sẻ quyền góp ý', `Chia sẻ bản Google ${sheet ? 'Sheets' : 'Docs'} cho ${H.to.join(', ')} với quyền GÓP Ý (không sửa được nội dung). Google sẽ gửi email báo cho họ kèm lời nhắn của bạn.`, 'Chia sẻ')) return;
    await saveGoogle(ctx, doc); doc = S.doc(doc.id);
    for (const em of H.to) await ctx.g.drive.share(doc.gdoc.id, em, 'commenter', msg.value);
    await save({log: [...H.log, {at: now(), what: 'Chia sẻ góp ý cho ' + H.to.join(', ')}]}, {status: 'review'});
    await S.log('doc.share', `Gửi duyệt “${doc.title}” cho ${H.to.join(', ')}`, doc.event_id || null, {id: doc.id}); ctx.note('Đã chia sẻ — trạng thái: Gửi duyệt');
  });
  const draft = run(err, async () => {
    await persistMeta(); if (!await needGoogle(ctx, ['drive', 'gmail'])) return;
    await saveGoogle(ctx, doc); doc = S.doc(doc.id); if (!/Link:/.test(msg.value) && doc.gdoc.url) msg.value += '\nLink: ' + doc.gdoc.url;
    await ctx.g.gmail.draft({to: H.to.join(', '), subject: `[Duyệt] ${K.name} — ${doc.title || ''}`.slice(0, 180), html: msg.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')});
    await save({note: msg.value, log: [...H.log, {at: now(), what: 'Tạo thư nháp Gmail cho ' + (H.to.join(', ') || '(chưa có người nhận)')}]}, {status: 'review'});
    ctx.note('Đã tạo thư NHÁP trong Gmail — mở Gmail để kiểm tra rồi tự bấm Gửi.');
  });
  const fetchFb = run(err, async () => {
    if (!doc.gdoc || !doc.gdoc.id) throw new Error('Chưa có bản Google Docs/Sheets — bấm “Chia sẻ quyền góp ý” hoặc Xuất → Mở bằng Google Docs trước.');
    if (!await needGoogle(ctx)) return;
    const cs = (await ctx.g.drive.comments(doc.gdoc.id)).filter(c => !c.resolved);
    const have = new Set(H.feedback.map(f => f.id)), add = cs.filter(c => !have.has(c.id)).map(c => ({id: c.id, who: c.author && c.author.displayName, quote: c.quotedFileContent && c.quotedFileContent.value, text: [c.content, ...(c.replies || []).map(r => (r.author ? r.author.displayName + ': ' : '') + r.content)].join(' / '), at: c.createdTime, src: 'gdoc', done: false}));
    await save({feedback: [...H.feedback, ...add]}, add.length ? {status: 'revise'} : {}); paintFb(); ctx.note(add.length ? `Có ${add.length} góp ý mới — trạng thái: Cần sửa` : 'Không có góp ý mới');
  });
  const addFb = run(err, async () => { const t = fbPaste.value.trim(); if (!t) return; fbPaste.value = ''; await save({feedback: [...H.feedback, {id: 'm' + Date.now(), who: 'Góp ý', text: t, at: now(), src: 'paste', done: false}]}, {status: 'revise'}); paintFb(); });
  const aiFix = run(err, async () => {
    const open = H.feedback.filter(f => !f.done); if (!open.length) throw new Error('Không còn góp ý nào chưa xử lý.');
    ctx.busy('AI đang sửa theo ' + open.length + ' góp ý…');
    try {
      const data = await writeDoc(ctx, doc.kind, {current: doc.data, sources: srcs(doc), program: doc.event_id && S.eventOf(doc.event_id),
        instruction: 'Sửa theo các GÓP Ý của người duyệt dưới đây; chỉ sửa đúng chỗ được góp ý, giữ nguyên phần còn lại:\n' + open.map((f, i) => `${i + 1}. ${f.quote ? '(đoạn: “' + f.quote + '”) ' : ''}${f.text}`).join('\n')});
      const {applyData} = await import('./views.js'); await applyData(ctx, doc, data, 'Sửa theo góp ý');
      H.feedback = H.feedback.map(f => f.done ? f : {...f, done: true}); await save(); paintFb(); ctx.note('Đã sửa theo góp ý — xem lại rồi Xuất / gửi lại.');
    } finally { ctx.busy(null); }
  });
  await dialog({title: 'Bàn giao “' + (doc.title || K.name).slice(0, 50) + '”', wide: true, body: () => h('div', {class: 'wr-out'},
    h('section', {}, h('h4', {}, icon('users'), 'Gửi cho ai, hạn khi nào'), chips, h('div', {class: 'wr-row'}, h('div', {style: 'flex:1'}, toIn), btn('Thêm', addTo, {ghost: true, sm: 1})),
      h('label', {class: 'wr-f'}, h('span', {}, 'Hạn nộp / hạn phản hồi'), dl), h('label', {class: 'wr-f'}, h('span', {}, 'Lời nhắn'), msg),
      h('div', {class: 'wr-row'}, btn('Chia sẻ quyền góp ý (Google ' + (sheet ? 'Sheets' : 'Docs') + ')', share), btn('Tạo thư nháp Gmail', draft, {ghost: true}),
        btn('Sao chép lời nhắn (Zalo)', async () => { await persistMeta(); await copyText(ctx, msg.value, 'lời nhắn'); }, {ghost: true})),
      h('p', {class: 'wr-mute'}, 'Không có gì tự gửi đi: Gmail chỉ tạo thư nháp; chia sẻ chỉ chạy khi bạn xác nhận.')),
    h('section', {}, h('h4', {}, icon('chat'), 'Góp ý nhận về'), fbList, h('div', {class: 'wr-row'}, btn('Lấy góp ý từ Google ' + (sheet ? 'Sheets' : 'Docs'), fetchFb, {ghost: true}), btn('✨ AI sửa theo góp ý', aiFix)),
      h('div', {class: 'wr-row', style: 'align-items:flex-end'}, h('div', {style: 'flex:1'}, fbPaste), btn('Thêm góp ý', addFb, {ghost: true, sm: 1}))),
    H.log.length ? h('section', {}, h('h4', {}, icon('clock'), 'Đã làm'), h('div', {class: 'wr-stack'}, H.log.slice(-8).reverse().map(l => h('div', {class: 'wr-mute'}, fmtDT(l.at) + ' — ' + l.what)))) : null, err),
    buttons: [['Đóng', null]]});
  await persistMeta(); ctx.render();
}
