// PHÒNG VY — WORKROOM · KNOWLEDGE HUB: thư viện tài liệu dùng chung. Mỗi tài liệu có loại, nguồn, phiên bản và TRẠNG THÁI:
//   Chính thức  — Vy đã xác nhận là chuẩn (AI được dùng làm mẫu / làm căn cứ)
//   Tham khảo   — chỉ để hiểu bối cảnh        Bản nháp — AI không dùng
// Tài liệu mới nhập luôn là "Tham khảo" cho tới khi Vy tự đổi — không file nào tự động thành chuẩn.
import {h, icon, head, btn, run, errBox, fmtDT, dialog, confirmBox, pickFile} from './ui.js';
import {CATS, catName, STATUS, KINDS, kindName, retrieve, guessCategory} from './knowledge.js';

const sel = (list, cur, on, label) => h('select', {class: 'wr-in', 'aria-label': label, onchange: e => on(e.target.value)}, list.map(([v, nm]) => h('option', {value: v, selected: v === (cur || '')}, nm)));
const KOPT = [['', '— loại nội dung —'], ...KINDS];
async function setStatus(ctx, d, v) {
  if (v === 'official' && !await confirmBox('Xác nhận là tài liệu chính thức', `"${d.name}" sẽ được AI coi là chuẩn (bài mẫu, căn cứ đối chiếu). Bạn xác nhận nội dung này đã được duyệt?`, 'Xác nhận chính thức')) return ctx.render();
  await ctx.store.set('knowledge', d.id, {status: v}, {log: `Knowledge Hub: "${d.name.slice(0, 60)}" → ${STATUS[v]}`});
}
// nhập từ 1 thư mục Google Drive do người dùng chỉ định: kiểm kê → người dùng chọn → mới đọc nội dung
async function importDrive(ctx, err) {
  const S = ctx.store, G = ctx.g, inp = h('input', {class: 'wr-in', style: 'width:100%', placeholder: 'Dán đường link thư mục Google Drive…', value: S.settings.drive_source || '', 'aria-label': 'Link thư mục Drive'});
  const link = await dialog({title: 'Nạp tài liệu từ Google Drive', body: h('div', {class: 'wr-stack'}, h('p', {}, 'Workroom chỉ đọc thư mục bạn dán vào đây (và thư mục con). File gốc không bị sửa.'), inp), buttons: [['Huỷ', null], ['Kiểm kê thư mục', () => inp.value.trim(), 'primary']]});
  if (!link) return; const id = G.idFromUrl(link); if (!id) throw new Error('Không đọc được mã thư mục từ đường link này.');
  ctx.note('Đang kiểm kê thư mục…'); const files = await G.drive.walk(id); await S.setSetting('drive_source', link);
  if (!files.length) throw new Error('Thư mục trống, hoặc tài khoản Google đang kết nối không có quyền xem.');
  const rows = files.map(f => { const had = S.knowledge.find(d => d.file_id === f.id), g = guessCategory(f.name, f.path); return {f, had, newer: had && had.version !== f.modifiedTime, pick: !had, ...g}; });
  const ok = await dialog({title: `Kiểm kê: ${files.length} file`, wide: true, body: h('div', {}, h('div', {class: 'wr-tablewrap'}, h('table', {class: 'wr-table'}, h('thead', {}, h('tr', {}, ['', 'File', 'Thư mục', 'Sửa lần cuối', 'Xếp vào', 'Tình trạng'].map(t => h('th', {}, t)))),
    h('tbody', {}, rows.map(r => h('tr', {}, h('td', {}, h('input', {type: 'checkbox', checked: r.pick, 'aria-label': 'Nhập file này', onchange: e => { r.pick = e.target.checked; }})), h('td', {}, r.f.name), h('td', {}, r.f.path || '—'), h('td', {}, fmtDT(r.f.modifiedTime)),
      h('td', {}, sel(CATS, r.category, v => { r.category = v; }, 'Loại')), h('td', {}, r.had ? (r.newer ? 'Đã có — Drive có bản mới hơn' : 'Đã có, không đổi') : 'Chưa nhập')))))),
    h('p', {class: 'wr-empty'}, 'Phần "Xếp vào" là gợi ý theo tên thư mục — sửa lại nếu chưa đúng. Tài liệu nhập vào ở trạng thái "Tham khảo"; bạn tự đánh dấu "Chính thức" sau khi xem.')), buttons: [['Huỷ', null], ['Nhập các file đã chọn', true, 'primary']]});
  if (!ok) return; let n = 0; const fail = [];
  for (const r of rows.filter(x => x.pick)) { try { ctx.note(`Đang đọc ${r.f.name}…`); const c = await G.readFile(r.f), row = {name: r.f.name.replace(/\.(docx|xlsx|txt|csv)$/i, ''), category: r.category, kind: r.kind, source: 'drive', file_id: r.f.id, url: r.f.webViewLink, version: r.f.modifiedTime, content: c.text, meta: {path: r.f.path, mime: r.f.mimeType}};
      if (r.had) await S.set('knowledge', r.had.id, {content: row.content, version: row.version, url: row.url}, {silent: true}); else await S.add('knowledge', row, {silent: true}); n++; } catch (e) { fail.push(`${r.f.name}: ${e.message}`); } }
  await S.log('knowledge.import', `Knowledge Hub: nhập ${n} file từ Google Drive`); S.emit('change');
  if (fail.length) throw new Error(`Đã nhập ${n} file. Không đọc được ${fail.length} file — ${fail.slice(0, 3).join('; ')}`); ctx.note(`Đã nhập ${n} file.`);
}
export function knowledge(ctx) {
  const S = ctx.store, err = errBox(), U = ctx.ui.knowledge ||= {q: '', cat: ''};
  const list = S.knowledge.filter(d => !U.cat || d.category === U.cat), hits = U.q.trim() ? retrieve(S, U.q, {k: 6, includeDrafts: true}) : null;
  const upload = run(err, async () => { const f = await pickFile('.docx,.xlsx,.csv,.txt,.md'); if (!f) return; const {readAnyFile} = await import('./files.js'), r = await readAnyFile(f), g = guessCategory(f.name);
    await S.add('knowledge', {name: f.name.replace(/\.\w+$/, ''), ...g, source: 'upload', content: r.text, version: new Date(f.lastModified).toISOString(), meta: {file: f.name}}, {log: 'Knowledge Hub: tải lên ' + f.name}); });
  const paste = run(err, async () => { const nm = h('input', {class: 'wr-in', style: 'width:100%', placeholder: 'Tên tài liệu', 'aria-label': 'Tên tài liệu'}), ta = h('textarea', {class: 'wr-in', rows: 10, placeholder: 'Dán nội dung vào đây…', 'aria-label': 'Nội dung'});
    const v = await dialog({title: 'Thêm tài liệu bằng cách dán văn bản', wide: true, body: h('div', {class: 'wr-stack'}, nm, ta), buttons: [['Huỷ', null], ['Thêm', () => ({name: nm.value.trim(), content: ta.value.trim()}), 'primary']]});
    if (!v) return; if (!v.name || !v.content) throw new Error('Cần cả tên và nội dung.'); await S.add('knowledge', {...v, ...guessCategory(v.name), source: 'upload', version: new Date().toISOString()}, {log: 'Knowledge Hub: thêm ' + v.name}); });
  const view = d => dialog({title: d.name, wide: true, body: h('div', {}, h('div', {class: 'wr-form', style: 'margin-bottom:10px'}, h('span', {class: 'wr-tag'}, catName(d.category)), h('span', {class: 'wr-tag ' + (d.status === 'official' ? 'ok' : '')}, STATUS[d.status]), h('span', {class: 'm'}, `Nguồn: ${({drive: 'Google Drive', upload: 'Tải lên', workroom: 'Workroom'})[d.source] || d.source}${d.version ? ' · bản ' + fmtDT(d.version) : ''}`), d.url && h('a', {href: d.url, target: '_blank', rel: 'noopener'}, 'Mở file gốc')), h('pre', {class: 'wr-pre tall'}, d.content || '(trống)'))});
  const row = d => h('div', {class: 'wr-row'}, h('button', {class: 't wr-linkbtn', title: d.name, onclick: () => view(d)}, d.name), d.event_id && S.eventOf(d.event_id) && h('span', {class: 'wr-tag code'}, S.eventOf(d.event_id).code),
    h('span', {class: 'm'}, `${Math.round((d.content || '').length / 100) / 10}k ký tự`),
    sel(KOPT, d.kind, v => run(err, () => S.set('knowledge', d.id, {kind: v || null}))(), 'Loại nội dung'), sel(CATS, d.category, v => run(err, () => S.set('knowledge', d.id, {category: v}))(), 'Phân loại'),
    sel(Object.entries(STATUS), d.status, v => run(err, () => setStatus(ctx, d, v))(), 'Trạng thái'),
    h('button', {class: 'wr-x', title: 'Xoá khỏi Knowledge Hub (file gốc trên Drive không bị xoá)', 'aria-label': 'Xoá ' + d.name, onclick: run(err, async () => { if (await confirmBox('Xoá khỏi Knowledge Hub', `Xoá "${d.name}" khỏi Knowledge Hub? File gốc (nếu ở Google Drive) vẫn còn nguyên.`, 'Xoá', true)) await S.del('knowledge', d.id, {log: 'Knowledge Hub: xoá ' + d.name.slice(0, 60)}); })}, icon('x')));
  const off = S.knowledge.filter(d => d.status === 'official').length;
  return h('div', {class: 'wr-wrap wide'}, head('Knowledge Hub', `${S.knowledge.length} tài liệu · ${off} chính thức`),
    h('section', {class: 'wr-card', style: 'margin-bottom:16px'},
      h('div', {class: 'wr-form'}, btn('Nạp từ thư mục Google Drive', run(err, () => importDrive(ctx, err)), {icon: 'link', disabled: !ctx.g.has('drive'), title: ctx.g.has('drive') ? '' : 'Cần kết nối Google ở Cài đặt & Kết nối'}), btn('Tải file lên (.docx, .xlsx, .csv, .txt)', upload, {ghost: true, icon: 'up'}), btn('Dán văn bản', paste, {ghost: true, icon: 'plus'}),
        h('span', {style: 'flex:1'}), sel([['', 'Mọi loại'], ...CATS], U.cat, v => { U.cat = v; ctx.render(); }, 'Lọc theo loại')),
      h('form', {class: 'wr-form', style: 'margin-top:10px', onsubmit: e => { e.preventDefault(); U.q = e.target.q.value; ctx.render(); }}, h('input', {class: 'wr-in grow', name: 'q', value: U.q, placeholder: 'Tìm trong tài liệu — đây cũng là cách AI tìm đoạn liên quan…', 'aria-label': 'Tìm'}), btn('Tìm', null, {type: 'submit', ghost: true})),
      !ctx.g.has('drive') && h('p', {class: 'wr-empty'}, 'Chưa kết nối Google — vẫn tải file lên hoặc dán văn bản được.'), err),
    hits && h('section', {class: 'wr-card', style: 'margin-bottom:16px'}, h('h3', {}, `Kết quả cho "${U.q}"`, h('span', {}, hits.length + ' đoạn')), hits.length ? hits.map(x => h('div', {class: 'wr-item'}, h('div', {class: 'wr-form'}, h('b', {}, x.name), h('span', {class: 'wr-tag ' + (x.status === 'official' ? 'ok' : '')}, STATUS[x.status]), h('span', {class: 'm'}, 'độ khớp ' + x.score)), h('p', {class: 'why'}, x.excerpt.slice(0, 420) + (x.excerpt.length > 420 ? '…' : '')))) : h('p', {class: 'wr-empty'}, 'Không có đoạn nào khớp.')),
    list.length ? CATS.filter(([c]) => list.some(d => d.category === c)).map(([c, nm]) => h('section', {class: 'wr-card', style: 'margin-bottom:16px'}, h('h3', {}, nm, h('span', {}, list.filter(d => d.category === c).length)), list.filter(d => d.category === c).map(row)))
      : h('section', {class: 'wr-card'}, h('p', {class: 'wr-empty'}, 'Chưa có tài liệu nào. Nạp bài đã duyệt, mẫu timeline, mẫu lịch công tác… để AI viết đúng quy chuẩn của bạn.')));
}
