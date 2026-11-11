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
export async function saveDrive(ctx, doc, o = {}) {
  if (!await needGoogle(ctx)) return null;
  doc = ctx.store.doc(doc.id) || doc;
  const f0 = await fileOf(doc), blob = f0.blob, name = o.name ? o.name + '.' + KINDS[doc.kind].ext : f0.name, dir = o.folder || await destFolder(ctx, doc), old = !o.fresh && doc.drive && doc.drive.id;
  let f; try { f = await ctx.g.drive.putFile(blob, {name, mime: blob.type, parent: dir.id, id: old}); }
  catch (e) { if (old && e.code === 'http') f = await ctx.g.drive.putFile(blob, {name, mime: blob.type, parent: dir.id}); else throw e; }
  await ctx.store.saveDoc(doc.id, {drive: {...(doc.drive || {}), id: f.id, url: f.webViewLink, at: now()}});
  await ctx.store.log('doc.drive', `Lưu file lên Drive: ${name}`, doc.event_id || null, {id: doc.id});
  return f.webViewLink;
}
// bản Google Docs / Sheets (Google tự chuyển từ file đúng mẫu) — cùng 1 link cho mọi lần cập nhật để người duyệt góp ý liên tục
export async function saveGoogle(ctx, doc, o = {}) {
  if (!await needGoogle(ctx)) return null;
  doc = ctx.store.doc(doc.id) || doc;
  const G = ctx.g, {blob, name} = await fileOf(doc), dir = o.folder || await destFolder(ctx, doc), to = isSheet(doc.kind) ? G.MIME.sheet : G.MIME.doc;
  const gname = o.name || name.replace(/\.(docx|xlsx)$/, '');
  let f = null;
  if (!o.fresh && doc.gdoc && doc.gdoc.id) { try { f = await G.drive.putFile(blob, {name: gname, mime: blob.type, id: doc.gdoc.id}); } catch (e) { f = null; } }
  if (!f) f = await G.drive.putFile(blob, {name: gname, mime: blob.type, parent: dir.id, convertTo: to});
  await ctx.store.saveDoc(doc.id, {gdoc: {id: f.id, url: f.webViewLink, at: now()}});
  await ctx.store.log('doc.gdoc', `Cập nhật Google ${isSheet(doc.kind) ? 'Sheets' : 'Docs'}: ${gname}`, doc.event_id || null, {id: doc.id});
  return f.webViewLink;
}
// PDF: có Google → xuất từ bản Google (giống file thật nhất); chưa có → in từ bản xem trước (Lưu thành PDF)
// PDF lưu thẳng lên Drive (xuất từ bản Google để giống file thật nhất)
export async function savePdfDrive(ctx, doc, o = {}) {
  if (!await needGoogle(ctx)) return null;
  await saveGoogle(ctx, doc, {folder: o.folder}); doc = ctx.store.doc(doc.id);
  const pdf = await ctx.g.drive.exportAs(doc.gdoc.id, 'application/pdf'), dir = o.folder || await destFolder(ctx, doc), name = (o.name || fileName(doc.kind, doc).replace(/\.\w+$/, '')) + '.pdf';
  const old = !o.fresh && doc.drive && doc.drive.pdf && doc.drive.pdf.id;
  let f; try { f = await ctx.g.drive.putFile(pdf, {name, mime: 'application/pdf', parent: dir.id, id: old}); } catch (e) { if (old) f = await ctx.g.drive.putFile(pdf, {name, mime: 'application/pdf', parent: dir.id}); else throw e; }
  await ctx.store.saveDoc(doc.id, {drive: {...(doc.drive || {}), pdf: {id: f.id, url: f.webViewLink, at: now()}}});
  return f.webViewLink;
}
// chọn thư mục Drive (Drive của tôi / được chia sẻ / dán link)
export async function pickFolder(ctx) {
  if (!await needGoogle(ctx)) return null;
  const G = ctx.g, path = [{id: 'root', name: 'Drive của tôi'}], list = h('div', {class: 'wr-stack wr-fold'}), crumbs = h('div', {class: 'wr-row'}), err = errBox();
  let shared = false;
  const load = async () => { list.replaceChildren(h('p', {class: 'wr-mute'}, 'Đang tải…')); err.textContent = '';
    try { const fs = await G.drive.folders(path[path.length - 1].id, shared && path.length === 1);
      list.replaceChildren(...(fs.length ? fs.map(f => h('button', {class: 'wr-item', onclick: () => { path.push({id: f.id, name: f.name, url: f.webViewLink}); paint(); }}, icon('flag'), h('span', {class: 't'}, f.name), h('span', {class: 'm'}, '›'))) : [h('p', {class: 'wr-mute'}, 'Không có thư mục con.')])); }
    catch (e) { list.replaceChildren(); err.textContent = e.message; } };
  const paint = () => { crumbs.replaceChildren(...path.map((p, i) => h('button', {class: 'wr-pick' + (i === path.length - 1 ? ' on' : ''), onclick: () => { path.length = i + 1; paint(); }}, i === 0 ? (shared ? 'Được chia sẻ với tôi' : 'Drive của tôi') : p.name))); load(); };
  const tabs = h('div', {class: 'wr-tabs'}, [[false, 'Drive của tôi'], [true, 'Được chia sẻ với tôi']].map(([v, l]) => h('button', {class: shared === v ? 'on' : '', onclick: e => { shared = v; path.length = 1; [...tabs.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); paint(); }}, l)));
  const link = h('input', {class: 'wr-in', placeholder: 'Hoặc dán link thư mục Drive', 'aria-label': 'Link thư mục'});
  paint();
  const v = await dialog({title: 'Chọn thư mục trên Drive', wide: true, body: h('div', {class: 'wr-stack'}, tabs, crumbs, list, link, err),
    buttons: [['Huỷ', null], ['Chọn thư mục đang mở', () => { const id = G.idFromUrl(link.value); if (id) return {id, url: link.value.trim(), name: 'Thư mục đã dán'}; const c = path[path.length - 1]; return c.id === 'root' && shared ? null : {id: c.id, name: c.name, url: c.url}; }, 'primary']]});
  if (v && v.id && v.name === 'Thư mục đã dán') { try { const m = await G.drive.meta(v.id); v.name = m.name; v.url = m.webViewLink; } catch (e) {} }
  return v;
}
// ===================== ĐẨY LÊN GOOGLE (chọn dạng, thư mục, tên, cách cập nhật) =====================
export async function pushDialog(ctx, doc) {
  const S = ctx.store, G = ctx.g; doc = S.doc(doc.id) || doc;
  if (!await needGoogle(ctx)) return;
  const sheet = isSheet(doc.kind), K = KINDS[doc.kind], prefs = {...((S.settings.push_prefs || {})[doc.kind] || {})}, err = errBox();
  const FMT = sheet ? [['google', 'Google Sheets', 'Sửa & góp ý trực tuyến, chia sẻ cho nhóm', doc.gdoc], ['file', 'Excel (.xlsx) trên Drive', 'Giữ nguyên file mẫu, mở bằng Excel', doc.drive && doc.drive.id ? doc.drive : null], ['pdf', 'PDF trên Drive', 'Bản chốt để gửi / in', doc.drive && doc.drive.pdf]]
    : [['google', 'Google Docs', 'Sửa & góp ý trực tuyến, chia sẻ cho nhóm', doc.gdoc], ['file', 'Word (.docx) trên Drive', 'Giữ nguyên file mẫu, mở bằng Word', doc.drive && doc.drive.id ? doc.drive : null], ['pdf', 'PDF trên Drive', 'Bản chốt để gửi / in', doc.drive && doc.drive.pdf]];
  const pick = new Set(prefs.fmts || ['google']);
  let folder = prefs.folder || null;
  const def = (S.settings.dest || {})[groupOf(doc.kind).id];
  const fmtEl = h('div', {class: 'wr-types'}, FMT.map(([k, l, d, ex]) => { const el = h('div', {class: 'wr-type' + (pick.has(k) ? ' on' : ''), role: 'checkbox', 'aria-checked': String(pick.has(k)), tabIndex: 0, onclick: () => { pick.has(k) ? pick.delete(k) : pick.add(k); el.classList.toggle('on', pick.has(k)); el.setAttribute('aria-checked', String(pick.has(k))); }},
    h('b', {}, (pick.has(k) ? '' : '') + l), h('small', {}, d), ex && ex.url ? h('small', {}, 'Đã có bản trước — ', h('a', {href: ex.url, target: '_blank', rel: 'noopener', onclick: e => e.stopPropagation()}, 'mở')) : null); return el; }));
  const folderLbl = h('b', {}), paintF = () => folderLbl.textContent = folder ? folder.name : def ? 'Nơi lưu đã đặt cho mục ' + groupOf(doc.kind).name : 'PHÒNG VY — Workroom / ' + (doc.event_id ? 'Chương trình / …' : groupOf(doc.kind).name);
  paintF();
  const recent = (S.settings.recent_folders || []).slice(0, 5);
  const name = h('input', {class: 'wr-in', value: (doc.title || K.name).replace(/[\\/:*?"<>|\n]+/g, ' ').trim().slice(0, 120), 'aria-label': 'Tên file'});
  const fresh = h('input', {type: 'checkbox', checked: !!prefs.fresh}), openAfter = h('input', {type: 'checkbox', checked: prefs.open !== false}), shareTo = h('input', {type: 'checkbox', checked: false, disabled: !(doc.handoff && (doc.handoff.to || []).length)});
  const v = await dialog({title: 'Đẩy lên Google', wide: true, body: h('div', {class: 'wr-stack'},
    h('div', {class: 'wr-f'}, h('span', {}, 'Đẩy lên dạng nào (chọn được nhiều)'), fmtEl),
    h('div', {class: 'wr-f'}, h('span', {}, 'Vào thư mục'), h('div', {class: 'wr-row'}, icon('flag'), folderLbl, btn('Đổi thư mục…', async () => { const f = await pickFolder(ctx); if (f) { folder = f; paintF(); } }, {ghost: true, sm: 1}), folder && btn('Về mặc định', () => { folder = null; paintF(); }, {ghost: true, sm: 1})),
      recent.length ? h('div', {class: 'wr-chips'}, h('span', {class: 'wr-mute'}, 'Gần đây:'), recent.map(f => h('button', {class: 'wr-pick', onclick: () => { folder = f; paintF(); }}, f.name))) : null),
    h('label', {class: 'wr-f'}, h('span', {}, 'Tên file'), name),
    h('label', {class: 'wr-row'}, fresh, 'Tạo bản MỚI (không cập nhật đè bản đã đẩy trước — link cũ giữ nguyên)'),
    h('label', {class: 'wr-row'}, openAfter, 'Mở ngay sau khi đẩy'),
    h('label', {class: 'wr-row'}, shareTo, 'Chia sẻ quyền góp ý cho người nhận bàn giao' + (doc.handoff && (doc.handoff.to || []).length ? ' (' + doc.handoff.to.join(', ') + ')' : ' (chưa chọn người nhận)')), err),
    buttons: [['Huỷ', null], ['Đẩy lên', 'go', 'primary']]});
  if (!v) return;
  if (!pick.size) return ctx.note('Chưa chọn dạng nào.');
  const o = {folder, name: name.value.trim() || undefined, fresh: fresh.checked};
  await S.setSetting('push_prefs', {...(S.settings.push_prefs || {}), [doc.kind]: {fmts: [...pick], folder, fresh: fresh.checked, open: openAfter.checked}});
  if (folder) await S.setSetting('recent_folders', [folder, ...(S.settings.recent_folders || []).filter(f => f.id !== folder.id)].slice(0, 6));
  ctx.busy('Đang đẩy lên Google…');
  const links = [];
  try {
    if (pick.has('google')) links.push(await saveGoogle(ctx, doc, o));
    if (pick.has('file')) links.push(await saveDrive(ctx, doc, o));
    if (pick.has('pdf')) links.push(await savePdfDrive(ctx, doc, o));
    if (shareTo.checked) { const d = S.doc(doc.id); for (const em of d.handoff.to) await G.drive.share(d.gdoc.id, em, 'commenter', d.handoff.note || ''); await S.saveDoc(doc.id, {status: 'review'}); }
  } catch (e) {
    ctx.busy(null);
    const again = await dialog({title: 'Chưa đẩy lên được', body: h('div', {}, h('p', {}, e.message),
        links.length ? h('p', {class: 'wr-mute'}, 'Đã xong ' + links.filter(Boolean).length + ' bản trước khi gặp lỗi.') : null,
        e.url ? h('p', {}, h('a', {class: 'wr-btn primary', href: e.url, target: '_blank', rel: 'noopener'}, e.urlLabel || 'Mở trang sửa lỗi'), ' ', h('small', {class: 'wr-mute'}, 'Bấm Bật (Enable), đợi ~1 phút rồi bấm Thử lại.')) : null),
      buttons: [['Đóng', null], ['Thử lại', 'again', 'primary']]});
    if (again) return pushDialog(ctx, ctx.store.doc(doc.id) || doc);
    return;
  } finally { ctx.busy(null); }
  ctx.note('Đã đẩy lên Google (' + links.filter(Boolean).length + ' bản)');
  if (openAfter.checked && links[0]) window.open(links[0], '_blank', 'noopener');
  ctx.render();
}
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
      h('div', {class: 'wr-row'}, btn('Đẩy lên Google…', () => { done(null); pushDialog(ctx, doc); }), act('Cập nhật nhanh bản ' + (sheet ? 'Google Sheets' : 'Google Docs'), async () => { const u = await saveGoogle(ctx, doc); if (u) ctx.note('Đã cập nhật'); }, {ghost: true})),
      h('div', {class: 'wr-row'}, link(doc.gdoc, sheet ? 'Google Sheets' : 'Google Docs'), link(doc.drive, 'File .' + K.ext), link(doc.drive && doc.drive.pdf, 'PDF'), (doc.gdoc && doc.gdoc.at || doc.drive && doc.drive.at) ? h('span', {class: 'wr-mute'}, 'cập nhật ' + fmtDT((doc.gdoc && doc.gdoc.at) || doc.drive.at)) : null),
      h('p', {class: 'wr-mute'}, 'Đẩy lên: chọn Google Docs/Sheets, file Word/Excel, PDF — vào thư mục bạn chọn (kể cả thư mục chung của phòng). Cập nhật lại = cùng link, Drive giữ lịch sử phiên bản.')),
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
