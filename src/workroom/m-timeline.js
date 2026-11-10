// PHÒNG VY — WORKROOM · TIMELINE STUDIO: kế hoạch truyền thông trước – trong – sau sự kiện, ghi đúng mẫu Google Sheets đang dùng.
// Nguồn chính: bản ghi trong Workroom. Google Sheets là bản xuất theo mẫu; mỗi lần đồng bộ đều xem trước và kiểm tra Sheet có bị sửa bên Google không.
import {h, icon, head, btn, run, errBox, fmtDT, dialog, confirmBox, download, pickFile} from './ui.js';
import {eventFacts} from './knowledge.js';

const PH = [['truoc', 'I. TRƯỚC'], ['trong', 'II. TRONG'], ['sau', 'III. SAU']];
// cột theo mẫu "Timeline truyền thông": [trường, tiêu đề trên Sheet, mẫu nhận diện tiêu đề]
const COLS = [['content', 'Nội dung thực hiện', /nội dung thực hiện/i], ['format', 'Hình thức đi bài', /hình thức/i], ['deadline', 'Deadline', /deadline|hạn/i], ['publish_at', 'Thời gian đăng', /thời gian đăng|ngày đăng/i],
  ['channel', 'Nơi đăng', /nơi đăng|kênh/i], ['a_content', 'Nội dung', /^nội dung$/i], ['a_media', 'Media', /^media$/i], ['a_editor', 'Biên tập', /^biên tập$/i], ['note', 'Ghi chú', /ghi chú/i], ['done', 'Trạng thái', /trạng thái/i]];
const n = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const word = ev => (ev.facts && ev.facts.short || 'SỰ KIỆN').toUpperCase();
const itemsOf = (S, ev) => S.timeline.filter(t => t.event_id === ev.id).sort((a, b) => a.pos - b.pos);

// đọc cấu trúc 1 bảng timeline (mẫu hoặc bảng đã ghi): dòng tiêu đề, cột nào là gì, vùng dữ liệu
export function mapSheet(vals) {
  const hRow = vals.findIndex(r => r.some(c => /^stt$/i.test(n(c))) && r.some(c => /nội dung/i.test(n(c))));
  if (hRow < 0) return null;
  const sub = vals[hRow + 1] && vals[hRow + 1].some(c => /^media$/i.test(n(c))) ? 1 : 0, cols = {stt: vals[hRow].findIndex(c => /^stt$/i.test(n(c)))};
  for (const [f, , re] of COLS) { let i = vals[hRow].findIndex(c => re.test(n(c))); if (i < 0 && sub) i = vals[hRow + 1].findIndex(c => re.test(n(c))); if (i >= 0) cols[f] = i; }
  const dataStart = hRow + 1 + sub; let dataEnd = vals.length; while (dataEnd > dataStart && !(vals[dataEnd - 1] || []).some(c => n(c))) dataEnd--;
  const isSec = r => /^(I{1,3}|IV|V)\.\s/.test(n((r || [])[cols.stt])), isItem = r => r && n(r[cols.content]) && !isSec(r) && (/^\d+$/.test(n(r[cols.stt])) || n(r[cols.format]) || n(r[cols.channel]));
  let secRow = -1, itemRow = -1; for (let i = dataStart; i < dataEnd; i++) { if (secRow < 0 && isSec(vals[i])) secRow = i; if (itemRow < 0 && isItem(vals[i])) itemRow = i; }
  const first = secRow >= 0 ? secRow : itemRow >= 0 ? itemRow : dataEnd;
  let title = null; for (let i = 0; i < hRow && !title; i++) { const j = (vals[i] || []).findIndex(c => /timeline/i.test(n(c))); if (j >= 0) title = [i, j]; }
  return {hRow, sub, cols, dataStart, dataEnd, keep: first - dataStart, secRow, itemRow, title, isSec, isItem, width: Math.max(...vals.slice(hRow, hRow + 2).map(r => r.length))};
}
export function parseItems(vals) {
  const m = mapSheet(vals); if (!m) throw new Error('Không nhận ra bảng timeline: thiếu dòng tiêu đề có "STT" và "Nội dung thực hiện".');
  const out = []; let phase = 'truoc';
  for (let i = m.dataStart; i < m.dataEnd; i++) { const r = vals[i] || [], s = n(r[m.cols.stt]);
    if (m.isSec(r)) { phase = /trong/i.test(s) ? 'trong' : /sau/i.test(s) ? 'sau' : 'truoc'; continue; }
    if (!n(r[m.cols.content])) continue;
    const it = {phase}; for (const [f] of COLS) if (m.cols[f] != null) it[f] = f === 'done' ? /^(true|x|✓|đã|done|1)$/i.test(n(r[m.cols[f]])) : n(r[m.cols[f]]);
    out.push(it); }
  return out;
}
// các dòng sẽ ghi (theo đúng thứ tự cột của bảng đích)
function targetRows(ev, items, m) {
  const rows = [], blank = () => Array(m.width).fill(''); let stt = 0;
  for (const [ph, label] of PH) { const list = items.filter(i => i.phase === ph); if (!list.length) continue;
    const s = blank(); s[m.cols.stt] = `${label} ${word(ev)}`; rows.push({type: 'sec', v: s});
    for (const it of list) { const r = blank(); r[m.cols.stt] = ++stt; for (const [f] of COLS) if (m.cols[f] != null) r[m.cols[f]] = f === 'done' ? !!it.done : it[f] || ''; rows.push({type: 'item', v: r}); } }
  return rows;
}
const HEADER = [['STT', 'Nội dung thực hiện', 'Hình thức đi bài', 'Deadline', 'Thời gian đăng', 'Nơi đăng', 'Phân công', '', '', 'Ghi chú', 'Trạng thái'], ['', '', '', '', '', '', 'Nội dung', 'Media', 'Biên tập', '', '']];
const titleOf = ev => `TIMELINE TRUYỀN THÔNG ${ev.name.toUpperCase()}${ev.event_date ? ` (${new Date(ev.event_date).toLocaleDateString('vi-VN', {day: 'numeric', month: 'numeric', year: 'numeric'})})` : ''}`;
const a1 = (sheet, r, c, r2, c2) => { const L = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; }; return `'${sheet.replace(/'/g, "''")}'!${L(c)}${r + 1}:${L(c2)}${r2 + 1}`; };

// Ghi lên Google Sheets. Bước 1: chuẩn bị (không ghi gì) → trả bản xem trước. Bước 2: người dùng đồng ý → ghi.
export async function syncSheet(ctx, ev) {
  const S = ctx.store, G = ctx.g, items = itemsOf(S, ev); if (!items.length) throw new Error('Timeline chưa có mục nào để ghi.');
  let link = ev.links && ev.links.timeline_sheet, meta = null, mode = 'new';
  if (link) { try { meta = await G.drive.meta(link.id); } catch (e) { if (e.code !== 'http') throw e; link = null; } }
  const tpl = S.knowledge.find(d => d.category === 'timeline_template' && d.status === 'official' && d.file_id) || null;
  if (link && meta) {
    const changed = meta.modifiedTime !== link.modified;
    const v = await dialog({title: changed ? 'Sheet đã được sửa trên Google' : 'Cập nhật Sheet timeline?', body: changed ? 'Bảng trên Google Sheets đã thay đổi sau lần đồng bộ trước. Chọn cách xử lý — Workroom không tự ghi đè.' : `Ghi ${items.length} mục hiện có trong Workroom lên bảng đã liên kết.`,
      buttons: [['Huỷ', null], ...(changed ? [['Lấy bản trên Sheet về Workroom', 'pull']] : []), [changed ? 'Ghi đè lên Sheet' : 'Ghi lên Sheet', 'push', changed ? 'danger' : 'primary']]});
    if (!v) return null; if (v === 'pull') return pullSheet(ctx, ev); mode = 'update';
  } else {
    const ok = await dialog({title: 'Tạo bảng timeline trên Google Sheets', body: h('div', {}, h('p', {}, tpl ? `Workroom sẽ tạo MỘT BẢN SAO của mẫu "${tpl.name}" (file mẫu gốc không bị đụng tới), giữ nguyên định dạng, rồi điền ${items.length} mục vào đúng cột.` : `Chưa có mẫu timeline chính thức kèm file Google trong Knowledge Hub, nên Workroom sẽ tạo bảng mới với đúng các cột của mẫu và điền ${items.length} mục.`),
      h('p', {class: 'wr-empty'}, 'Bảng được lưu trong thư mục của sự kiện trên Google Drive.')), buttons: [['Huỷ', null], ['Tạo bảng', true, 'primary']]});
    if (!ok) return null;
    const folder = await G.workFolder(ev), name = titleOf(ev).slice(0, 150);
    const f = tpl ? await G.drive.copy(tpl.file_id, name, {parent: folder.id, toMime: G.MIME.sheet}) : await G.sheets.create(name, folder.id);
    link = {id: f.id, url: f.webViewLink, template: tpl ? tpl.name : null};
  }
  const info = await G.sheets.info(link.id), sh = info.sheets[0].properties, sheet = sh.title; let vals = await G.sheets.values(link.id), m = mapSheet(vals);
  if (!m) { if (vals.some(r => r.some(c => n(c)))) throw new Error('Bảng đích không có dòng tiêu đề "STT / Nội dung thực hiện" nên Workroom không ghi để tránh sai cột.');
    await G.sheets.write(link.id, [{range: a1(sheet, 0, 0, 3, 10), values: [[titleOf(ev)], [], ...HEADER]}]); vals = [[titleOf(ev)], [], ...HEADER]; m = mapSheet(vals); }
  const missing = ['content'].filter(f => m.cols[f] == null); if (missing.length) throw new Error('Mẫu thiếu cột "Nội dung thực hiện" — không ghi để tránh sai cột.');
  const rows = targetRows(ev, items, m), start = m.dataStart + m.keep, have = m.dataEnd - start, T = rows.length, req = [], grid = sh.gridProperties.rowCount, W = sh.gridProperties.columnCount;
  const dim = (a, b) => ({sheetId: sh.sheetId, dimension: 'ROWS', startIndex: a, endIndex: b}), rng = r => ({sheetId: sh.sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: W});
  const fmt = m.secRow >= 0 && m.itemRow >= 0;       // có dòng mẫu để chép định dạng (màu, viền, ô tick)
  if (fmt) { req.push({appendDimension: {sheetId: sh.sheetId, dimension: 'ROWS', length: 2}});       // 2 dòng tạm ở cuối giữ định dạng mẫu
    for (const [src, k] of [[m.secRow, 0], [m.itemRow, 1]]) for (const pasteType of ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION']) req.push({copyPaste: {source: rng(src), destination: rng(grid + k), pasteType}}); }
  if (T > have) req.push({insertDimension: {range: dim(m.dataEnd, m.dataEnd + T - have), inheritFromBefore: m.dataEnd > 0}});
  if (T < have) req.push({deleteDimension: {range: dim(start + T, m.dataEnd)}});
  const shift = T - have;
  if (fmt) { rows.forEach((r, i) => { for (const pasteType of ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION']) req.push({copyPaste: {source: rng(grid + shift + (r.type === 'sec' ? 0 : 1)), destination: rng(start + i), pasteType}}); });
    req.push({deleteDimension: {range: dim(grid + shift, grid + shift + 2)}}); }
  if (req.length) await G.sheets.batch(link.id, req);
  const data = [{range: a1(sheet, start, 0, start + T - 1, m.width - 1), values: rows.map(r => r.v)}];
  if (m.title) data.push({range: a1(sheet, m.title[0], m.title[1], m.title[0], m.title[1]), values: [[titleOf(ev)]]});
  await G.sheets.write(link.id, data);
  const after = await G.drive.meta(link.id);
  await S.set('events', ev.id, {links: {...(S.eventOf(ev.id).links || {}), timeline_sheet: {...link, synced_at: new Date().toISOString(), modified: after.modifiedTime, rows: T}}}, {log: `${ev.code}: ${mode === 'update' ? 'cập nhật' : 'tạo'} timeline trên Google Sheets (${items.length} mục)`});
  return link;
}
async function replaceItems(ctx, ev, list, origin) {
  const S = ctx.store, old = itemsOf(S, ev);
  if (old.length && !await confirmBox('Thay timeline hiện có?', `Workroom đang có ${old.length} mục cho sự kiện này. Thay bằng ${list.length} mục đọc được?`, 'Thay thế', true)) return null;
  for (const o of old) await S.del('timeline', o.id, {silent: true});
  let pos = 0; for (const it of list) await S.add('timeline', {...it, event_id: ev.id, pos: pos++, origin}, {silent: true});
  await S.log('timeline.import', `${ev.code}: nhập ${list.length} mục timeline (${origin})`, ev.id); S.emit('change'); return list.length;
}
export async function pullSheet(ctx, ev) {
  const G = ctx.g, link = ev.links.timeline_sheet, list = parseItems(await G.sheets.values(link.id));
  if (await replaceItems(ctx, ev, list, 'sheet') == null) return null;
  const meta = await G.drive.meta(link.id); await ctx.store.set('events', ev.id, {links: {...ev.links, timeline_sheet: {...link, synced_at: new Date().toISOString(), modified: meta.modifiedTime}}}, {silent: true}); ctx.store.emit('change'); return link;
}
const SCHEMA = {type: 'object', required: ['pillars', 'items'], properties: {pillars: {type: 'array', items: {type: 'string'}}, items: {type: 'array', items: {type: 'object', required: ['phase', 'content', 'format'],
  properties: {phase: {type: 'string', enum: ['truoc', 'trong', 'sau']}, content: {type: 'string'}, format: {type: 'string'}, channel: {type: 'string'}, publish_at: {type: 'string'}, deadline: {type: 'string'}, note: {type: 'string'}}}}}};
export async function generateTimeline(ctx, ev, {goal = '', count = 12} = {}) {
  const S = ctx.store, tpl = S.knowledge.find(d => d.category === 'timeline_template' && d.status === 'official'), have = itemsOf(S, ev);
  const o = await ctx.ai.json({heavy: true, task: 'Lập timeline truyền thông', temperature: 0.5,
    system: `Bạn lập kế hoạch truyền thông cho một sự kiện. Chia nội dung theo 3 giai đoạn: truoc (trước sự kiện), trong (trong sự kiện), sau (sau sự kiện). Mỗi mục: content (tên nội dung/góc khai thác), format (ví dụ: Tin bài, Tin ảnh, Thiết kế, Clip, Ema, Gửi báo), channel (ví dụ: Web + Facebook), publish_at và deadline viết dạng ngày/tháng dựa trên ngày sự kiện, note (gợi ý ngắn, có thể rỗng). pillars: 3–5 trụ nội dung chính.
Không ghi tên người phụ trách. Không bịa tên khách mời, số liệu. Không trùng ý với các mục đã có.`,
    prompt: `SỰ KIỆN:\n${eventFacts(ev)}\n\n${goal ? 'MỤC TIÊU / ĐỐI TƯỢNG / KÊNH: ' + goal + '\n\n' : ''}${have.length ? 'CÁC MỤC ĐÃ CÓ (không lặp lại):\n' + have.map(i => '- ' + i.content).join('\n') + '\n\n' : ''}${tpl ? 'TIMELINE MẪU ĐÃ DÙNG TRƯỚC ĐÂY (học cách đặt tên nội dung, hình thức, nhịp đăng — không chép tên người):\n' + tpl.content.slice(0, 3500) + '\n\n' : ''}Đề xuất khoảng ${count} mục.`}, SCHEMA,
    o => { if (!Array.isArray(o.items) || !o.items.length) throw new Error('không có mục nào'); return o; });
  const seen = new Set(have.map(i => n(i.content).toLowerCase()));
  const items = o.items.filter(i => i && ['truoc', 'trong', 'sau'].includes(i.phase) && n(i.content)).map(i => ({phase: i.phase, content: n(i.content).slice(0, 300), format: n(i.format).slice(0, 60), channel: n(i.channel).slice(0, 60), publish_at: n(i.publish_at).slice(0, 30), deadline: n(i.deadline).slice(0, 30), note: n(i.note).slice(0, 300)}))
    .filter(i => { const k = i.content.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 40);
  return {pillars: (o.pillars || []).filter(p => typeof p === 'string').slice(0, 6), items};
}
// "30/7" hoặc "30/7/2026" → ISO (năm lấy theo ngày sự kiện)
export const parseDM = (s, ev) => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/); if (!m) return null; const y = +m[3] || (ev && ev.event_date ? new Date(ev.event_date).getFullYear() : new Date().getFullYear()); const d = new Date(y, +m[2] - 1, +m[1], 17, 0); return isNaN(d) ? null : d.toISOString(); };

export function timeline(ctx) {
  const S = ctx.store, ev = ctx.event(), err = errBox(), U = ctx.ui.timeline ||= {goal: '', count: 12};
  if (!ev) return h('div', {class: 'wr-wrap'}, head('Timeline Studio', 'Chọn một sự kiện ở thanh trên cùng để lập timeline.'));
  const items = itemsOf(S, ev), link = ev.links && ev.links.timeline_sheet, tpl = S.knowledge.find(d => d.category === 'timeline_template' && d.status === 'official');
  const dup = new Set(); { const seen = {}; items.forEach(i => { const k = n(i.content).toLowerCase(); if (k && seen[k]) { dup.add(i.id); dup.add(seen[k]); } else seen[k] = i.id; }); }
  const cell = (it, f, w) => h('input', {class: 'wr-cell', style: w ? `min-width:${w}px` : '', value: it[f] || '', 'aria-label': COLS.find(c => c[0] === f)[1], onchange: run(err, e => S.set('timeline', it.id, {[f]: e.target.value.trim()}, {silent: true}))});
  const addRow = ph => run(err, () => S.add('timeline', {event_id: ev.id, phase: ph, pos: (items.at(-1)?.pos ?? -1) + 1}));
  const gen = run(err, async () => { U.busy = true; ctx.render(); let o;
    try { o = await generateTimeline(ctx, ev, U); } finally { U.busy = false; ctx.render(); }
    const pick = new Set(o.items.map((_, i) => i));
    const ok = await dialog({title: `AI đề xuất ${o.items.length} mục — xem trước`, wide: true, body: h('div', {}, o.pillars.length > 0 && h('p', {}, h('b', {}, 'Trụ nội dung: '), o.pillars.join(' · ')),
      h('div', {class: 'wr-tablewrap'}, h('table', {class: 'wr-table'}, h('thead', {}, h('tr', {}, ['', 'Giai đoạn', 'Nội dung', 'Hình thức', 'Nơi đăng', 'Đăng', 'Deadline', 'Ghi chú'].map(t => h('th', {}, t)))),
        h('tbody', {}, o.items.map((i, k) => h('tr', {}, h('td', {}, h('input', {type: 'checkbox', checked: true, 'aria-label': 'Nhận mục này', onchange: e => e.target.checked ? pick.add(k) : pick.delete(k)})), h('td', {}, PH.find(p => p[0] === i.phase)[1].replace(/^\w+\.\s/, '')), h('td', {}, i.content), h('td', {}, i.format), h('td', {}, i.channel), h('td', {}, i.publish_at), h('td', {}, i.deadline), h('td', {}, i.note)))))),
      h('p', {class: 'wr-empty'}, 'Đây là đề xuất của AI. Chỉ những mục được tick mới thêm vào timeline; phần phân công để trống cho bạn điền.')), buttons: [['Bỏ', null], ['Thêm các mục đã chọn', true, 'primary']]});
    if (!ok) return; let pos = (items.at(-1)?.pos ?? -1) + 1, k = 0;
    for (const [i, it] of o.items.entries()) if (pick.has(i)) { await S.add('timeline', {...it, event_id: ev.id, pos: pos++, origin: 'ai'}, {silent: true}); k++; }
    await S.log('timeline.ai', `${ev.code}: thêm ${k} mục timeline do AI đề xuất`, ev.id); S.emit('change'); });
  if (U.auto) { U.auto = false; setTimeout(gen, 60); }     // được trợ lý mở kèm yêu cầu đề xuất
  const toTasks = run(err, async () => { const cand = items.filter(i => !i.done && n(i.content) && !S.tasks.some(t => t.ref && t.ref.timeline === i.id));
    if (!cand.length) return ctx.note('Mọi mục chưa xong đều đã có việc tương ứng.');
    if (!await confirmBox('Tạo việc từ timeline', `Tạo ${cand.length} việc trong Task Manager (mỗi mục chưa xong 1 việc, hạn theo cột Deadline)?`, 'Tạo việc')) return;
    for (const i of cand) await S.add('tasks', {title: i.content.slice(0, 280), description: [i.format, i.channel, i.note].filter(Boolean).join(' · ') || null, event_id: ev.id, owner_name: i.a_content || null, deadline: parseDM(i.deadline || i.publish_at, ev), source: 'timeline', ref: {timeline: i.id}}, {silent: true});
    await S.log('timeline.tasks', `${ev.code}: tạo ${cand.length} việc từ timeline`, ev.id); S.emit('change'); ctx.note(`Đã tạo ${cand.length} việc.`); });
  const xlsx = run(err, async () => { const {writeXlsx} = await import('./files.js'), rows = [[titleOf(ev)], [], ...HEADER], bold = new Set([0, 2, 3]); let stt = 0;
    for (const [ph, label] of PH) { const l = items.filter(i => i.phase === ph); if (!l.length) continue; bold.add(rows.length); rows.push([`${label} ${word(ev)}`]);
      for (const i of l) rows.push([++stt, i.content, i.format, i.deadline, i.publish_at, i.channel, i.a_content, i.a_media, i.a_editor, i.note, !!i.done]); }
    download(writeXlsx(rows, {bold, widths: [6, 46, 16, 11, 14, 16, 18, 22, 14, 34, 11], sheet: 'Timeline'}), titleOf(ev).slice(0, 90) + '.xlsx'); });
  const imp = run(err, async () => { const f = await pickFile('.xlsx,.csv'); if (!f) return; const {readAnyFile} = await import('./files.js'), r = await readAnyFile(f); const k = await replaceItems(ctx, ev, parseItems(r.rows), 'file ' + f.name); if (k != null) ctx.note(`Đã nhập ${k} mục.`); });
  const needs = (ev.needs_check || []).length > 0 && items.length > 0;
  return h('div', {class: 'wr-wrap wide'}, head('Timeline Studio', `${ev.code} — ${ev.name}`),
    needs && h('div', {class: 'wr-banner'}, icon('warn'), h('div', {}, h('b', {}, 'Thông tin sự kiện đã đổi — kiểm tra lại ngày đăng/deadline trong timeline: '), ev.needs_check.map(c => `${c.label}: "${c.old || '(trống)'}" → "${c.new || '(trống)'}"`).join('; ')),
      btn('Đã kiểm tra', run(err, () => S.set('events', ev.id, {needs_check: []}, {log: `${ev.code}: đã rà lại sau khi đổi thông tin`})), {ghost: true})),
    h('section', {class: 'wr-card', style: 'margin-bottom:16px'}, h('h3', {}, 'Lập kế hoạch'),
      h('div', {class: 'wr-form'}, h('label', {}, 'Tên gọi ngắn của sự kiện '), h('input', {class: 'wr-in', style: 'width:130px', value: ev.facts && ev.facts.short || '', placeholder: 'LỄ / TỌA ĐÀM…', title: 'Dùng cho tiêu đề nhóm: "I. TRƯỚC LỄ"', onchange: run(err, e => S.set('events', ev.id, {facts: {...(ev.facts || {}), short: e.target.value.trim()}}))}),
        h('input', {class: 'wr-in grow', placeholder: 'Mục tiêu, đối tượng, kênh truyền thông… (để AI đề xuất sát hơn)', value: U.goal, oninput: e => { U.goal = e.target.value; }}),
        h('input', {class: 'wr-in', type: 'number', min: 3, max: 40, style: 'width:76px', value: U.count, title: 'Số mục muốn AI đề xuất', 'aria-label': 'Số mục', oninput: e => { U.count = Math.max(3, Math.min(40, +e.target.value || 12)); }}),
        U.busy ? btn('Dừng', () => ctx.ai.stop(), {icon: 'stop', danger: true}) : btn('AI đề xuất timeline', gen, {icon: 'spark', disabled: !ctx.ai.ready, title: ctx.ai.ready ? '' : 'AI trên máy chưa sẵn sàng'}), U.busy && h('span', {class: 'wr-chip warn'}, h('i'), 'AI đang lập kế hoạch…')),
      h('p', {class: 'wr-empty'}, tpl ? `Mẫu timeline chính thức: ${tpl.name}` : 'Chưa có mẫu timeline được đánh dấu "Chính thức" trong Knowledge Hub — bảng sẽ dùng bộ cột chuẩn của mẫu.')),
    h('section', {class: 'wr-card'}, h('h3', {}, 'Timeline', h('span', {}, `${items.filter(i => i.done).length}/${items.length} mục đã xong`)),
      h('div', {class: 'wr-tablewrap'}, h('table', {class: 'wr-table edit'},
        h('thead', {}, h('tr', {}, ['STT', 'Nội dung thực hiện', 'Hình thức đi bài', 'Deadline', 'Thời gian đăng', 'Nơi đăng', 'Nội dung', 'Media', 'Biên tập', 'Ghi chú', 'Xong', ''].map(t => h('th', {}, t)))),
        h('tbody', {}, (() => { let stt = 0; return PH.flatMap(([ph, label]) => [h('tr', {class: 'sec'}, h('td', {colSpan: 12}, h('b', {}, `${label} ${word(ev)}`), ' ', h('button', {class: 'wr-linkbtn', onclick: addRow(ph)}, '+ thêm mục'))),
          ...items.filter(i => i.phase === ph).map(it => h('tr', {class: dup.has(it.id) ? 'dup' : ''}, h('td', {}, ++stt, it.origin === 'ai' && h('span', {class: 'wr-tag demo', title: 'Do AI đề xuất'}, 'AI')), h('td', {}, cell(it, 'content', 240), dup.has(it.id) && h('span', {class: 'wr-tag late'}, 'Trùng nội dung')), h('td', {}, cell(it, 'format', 100)), h('td', {}, cell(it, 'deadline', 70)), h('td', {}, cell(it, 'publish_at', 80)), h('td', {}, cell(it, 'channel', 110)),
            h('td', {}, cell(it, 'a_content', 110)), h('td', {}, cell(it, 'a_media', 110)), h('td', {}, cell(it, 'a_editor', 90)), h('td', {}, cell(it, 'note', 160)),
            h('td', {}, h('input', {type: 'checkbox', checked: it.done, 'aria-label': 'Đã xong', onchange: run(err, e => S.set('timeline', it.id, {done: e.target.checked}))})),
            h('td', {}, h('button', {class: 'wr-x', title: 'Xoá mục', 'aria-label': 'Xoá mục', onclick: run(err, async () => { if (await confirmBox('Xoá mục', `Xoá "${it.content || 'mục trống'}"?`, 'Xoá', true)) await S.del('timeline', it.id); })}, icon('x')))))]); })()))),
      h('div', {class: 'wr-form', style: 'margin-top:14px'},
        btn(link ? 'Đồng bộ Google Sheets' : 'Ghi lên Google Sheets theo mẫu', run(err, async () => { const r = await syncSheet(ctx, ev); if (r) ctx.note('Đã đồng bộ với Google Sheets.'); }), {icon: 'sheet', disabled: !ctx.g.has('drive') || !items.length, title: ctx.g.has('drive') ? '' : 'Cần kết nối Google ở Cài đặt & Kết nối'}),
        link && h('a', {class: 'wr-btn ghost', href: link.url, target: '_blank', rel: 'noopener'}, icon('ext'), 'Mở Sheet'),
        btn('Tải Excel (.xlsx)', xlsx, {ghost: true, icon: 'down', disabled: !items.length}), btn('Nhập từ Excel', imp, {ghost: true, icon: 'up'}), btn('Tạo việc từ timeline', toTasks, {ghost: true, icon: 'list', disabled: !items.length})),
      h('p', {class: 'wr-empty'}, link ? `Đã liên kết Sheet${link.template ? ' (bản sao của mẫu "' + link.template + '")' : ''} · đồng bộ lần cuối ${fmtDT(link.synced_at)}` : ctx.g.has('drive') ? 'Chưa ghi lên Google Sheets.' : 'Chưa kết nối Google — vẫn tải được file Excel đúng bộ cột của mẫu.'), err));
}
