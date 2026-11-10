// PHÒNG VY — WORKROOM · STAFF ASSIGNMENT: phân công Content / Media / Biên tập cho các sự kiện trong tuần, theo mẫu "Lịch công tác tuần".
// Xung đột (trùng giờ, bận, quá tải, thiếu vị trí, sai vai trò) do MÃ tính từ dữ liệu thật — không nhờ AI đoán. AI chỉ đề xuất người trong danh bạ.
import {h, icon, head, btn, run, errBox, fmtDT, dialog, confirmBox, download, esc} from './ui.js';

const ROLES = [['content', 'Content'], ['media', 'Media'], ['editor', 'Biên tập']];
const DOW = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY'];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monday = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const dm = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
// "Phước Trí (quay + chụp), Trâm Đoàn (VO) + Mai Hương" → ["Phước Trí","Trâm Đoàn","Mai Hương"]
export const namesIn = s => String(s || '').replace(/\([^)]*\)/g, '').split(/[,+;]|\svà\s/).map(x => x.trim()).filter(x => x && x.toLowerCase() !== 'x');
// "8h00", "14h30", "08h30 - 18h00", "8:00" → [phútBắtĐầu, phútKếtThúc] (không ghi giờ kết thúc → coi như 2 tiếng)
export const span = t => { const m = [...String(t || '').matchAll(/(\d{1,2})\s*[h:]\s*(\d{2})?/gi)].map(x => +x[1] * 60 + (+x[2] || 0)); return m.length ? [m[0], m[1] > m[0] ? m[1] : m[0] + 120] : null; };
// "21h00 ngày 12/10/2026" → ISO
const parseDL = (s, ev) => { const t = span(s), d = String(s || '').match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/); const base = d ? new Date(+d[3] || new Date(ev.event_date).getFullYear(), +d[2] - 1, +d[1]) : ev.event_date ? new Date(ev.event_date) : null; if (!base || isNaN(base)) return null; base.setHours(0, t ? t[0] : 17 * 60, 0, 0); return base.toISOString(); };

export function findConflicts(events, staff, maxLoad = 4) {
  const out = [], byName = Object.fromEntries(staff.map(s => [s.name.trim().toLowerCase(), s])), slots = [];
  for (const ev of events) { const a = ev.assign || {};
    for (const [r, label] of ROLES) for (const nm of namesIn(a[r])) { slots.push({ev, role: r, label, name: nm});
      const st = byName[nm.toLowerCase()];
      if (!st) out.push({level: 'warn', ev, text: `${nm} không có trong danh bạ nhân sự.`});
      else { if (!st.active) out.push({level: 'bad', ev, text: `${nm} đang được đánh dấu tạm nghỉ.`});
        if (st.confirmed && st.roles.length && !st.roles.includes(r)) out.push({level: 'warn', ev, text: `${nm} được giao ${label} nhưng danh bạ không ghi vai trò này.`});
        const t = span(ev.event_time); for (const b of st.busy || []) if (b.date === ev.event_date) { const bs = span(`${b.from || ''} - ${b.to || ''}`); if (!t || !bs || (t[0] < bs[1] && bs[0] < t[1])) out.push({level: 'bad', ev, text: `${nm} báo bận ${b.from || ''}${b.to ? '–' + b.to : ''} ngày ${dm(new Date(b.date))}${b.note ? ' (' + b.note + ')' : ''}.`}); } } }
    if (!namesIn(a.content).length) out.push({level: 'warn', ev, text: 'Chưa có người phụ trách Content.'});
    if (!namesIn(a.media).length) out.push({level: 'warn', ev, text: 'Chưa có người phụ trách Media.'}); }
  const per = {}; slots.forEach(s => (per[s.name.toLowerCase()] ||= []).push(s));
  for (const list of Object.values(per)) {
    const evs = [...new Set(list.map(s => s.ev))];
    if (evs.length > maxLoad) out.push({level: 'warn', ev: null, text: `${list[0].name} đang nhận ${evs.length} sự kiện trong tuần (ngưỡng ${maxLoad}).`});
    for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) { const a = evs[i], b = evs[j]; if (!a.event_date || a.event_date !== b.event_date) continue;
      const ta = span(a.event_time), tb = span(b.event_time);
      if (ta && tb) { if (ta[0] < tb[1] + 30 && tb[0] < ta[1] + 30) out.push({level: 'bad', ev: a, text: `${list[0].name} trùng giờ: "${a.name}" (${a.event_time}) và "${b.name}" (${b.event_time}) cùng ngày ${dm(new Date(a.event_date))}.`}); }
      else out.push({level: 'warn', ev: a, text: `${list[0].name} có 2 sự kiện cùng ngày ${dm(new Date(a.event_date))} ("${a.name}", "${b.name}") nhưng thiếu giờ nên chưa kiểm tra được trùng lịch.`}); } }
  return out;
}
// văn bản theo đúng mẫu "LỊCH CÔNG TÁC TUẦN"
export function weekHtml(events, mon, weekNo) {
  const sun = new Date(mon); sun.setDate(sun.getDate() + 6); const y = d => `${dm(d)}/${d.getFullYear()}`, P = (s, b) => `<p>${b ? '<b>' : ''}${esc(s)}${b ? '</b>' : ''}</p>`;
  let html = P(`LỊCH CÔNG TÁC TUẦN${weekNo ? ' ' + weekNo : ''} (${y(mon)} - ${y(sun)})`, true) + P('-----------------'); const days = {};
  events.forEach(e => (days[e.event_date] ||= []).push(e));
  Object.keys(days).sort().forEach((d, di) => { const D = new Date(d + 'T12:00:00'), list = days[d].sort((a, b) => (span(a.event_time) || [9999])[0] - (span(b.event_time) || [9999])[0]);
    html += P(`${di + 1}. ${DOW[D.getDay()]} (${dm(D)})`, true);
    list.forEach((e, i) => { const a = e.assign || {}; html += P(`${list.length > 1 ? `${di + 1}.${i + 1}. ` : ''}${e.name}`, true);
      for (const [l, v] of [['Thành phần', e.attendees], ['Thời gian', e.event_time], ['Địa điểm', e.venue], ['Content', a.content], ['Media', a.media], ['Biên tập', a.editor], ['Dự phòng', a.backup], ['Deadline tin bài', a.dl_article], ['Deadline biên tập', a.dl_edit], ['Deadline video', a.dl_video]]) if (v) html += P(`${l}: ${v}`); }); });
  return html + P('-----------------');
}
const SCHEMA = {type: 'object', required: ['assignments'], properties: {assignments: {type: 'array', items: {type: 'object', required: ['code'], properties: {code: {type: 'string'}, content: {type: 'string'}, media: {type: 'string'}, editor: {type: 'string'}, backup: {type: 'string'}, reason: {type: 'string'}}}}}};
export async function suggestAssign(ctx, events) {
  const S = ctx.store, staff = S.staff.filter(s => s.active);
  if (!staff.length) throw new Error('Danh bạ nhân sự đang trống — thêm nhân sự (vai trò, lịch bận) trước khi nhờ AI đề xuất. AI không được tự nghĩ ra người hay lịch rảnh.');
  const names = new Set(staff.map(s => s.name.trim().toLowerCase()));
  const o = await ctx.ai.json({task: 'Đề xuất phân công', system: `Bạn hỗ trợ phân công nhân sự truyền thông. Mỗi sự kiện cần: content (viết tin/kịch bản), media (chụp/quay/dựng), editor (biên tập), backup (dự phòng).
CHỈ dùng đúng tên trong DANH BẠ. Chỉ giao vai trò mà người đó có. Không giao người đang bận vào giờ đó. Tránh để một người nhận quá nhiều việc hoặc hai sự kiện trùng giờ. Thiếu người phù hợp thì để trống và nói lý do — không bịa.`,
    prompt: `DANH BẠ:\n${staff.map(s => `- ${s.name} | vai trò: ${s.roles.join(', ') || 'chưa ghi'}${s.skills ? ' | kỹ năng: ' + s.skills : ''}${(s.busy || []).length ? ' | bận: ' + s.busy.map(b => `${b.date} ${b.from || ''}-${b.to || ''}`).join('; ') : ''}`).join('\n')}\n\nSỰ KIỆN CẦN PHÂN CÔNG:\n${events.map(e => `- ${e.code} | ${e.name} | ${e.event_date} ${e.event_time || '(chưa có giờ)'} | ${e.venue || ''}${e.assign && e.assign.content ? ' | đã có content: ' + e.assign.content : ''}`).join('\n')}`}, SCHEMA,
    o => { if (!Array.isArray(o.assignments)) throw new Error('thiếu assignments'); return o; });
  const clean = v => namesIn(v).filter(nm => names.has(nm.toLowerCase())).join(', '), dropped = [];
  return {list: o.assignments.map(a => { const ev = events.find(e => e.code === String(a.code).trim()); if (!ev) return null;
    for (const k of ['content', 'media', 'editor', 'backup']) namesIn(a[k]).forEach(nm => { if (!names.has(nm.toLowerCase())) dropped.push(nm); });
    return {ev, content: clean(a.content), media: clean(a.media), editor: clean(a.editor), backup: clean(a.backup), reason: String(a.reason || '').slice(0, 300)}; }).filter(Boolean), dropped: [...new Set(dropped)]};
}

export function staff(ctx) {
  const S = ctx.store, err = errBox(), U = ctx.ui.staff ||= {week: iso(monday(ctx.event() && ctx.event().event_date ? new Date(ctx.event().event_date + 'T12:00:00') : new Date())), tab: 'week', weekNo: ''};
  const mon = new Date(U.week + 'T12:00:00'), sun = new Date(mon); sun.setDate(sun.getDate() + 6);
  const events = S.events.filter(e => !e.archived && e.event_date && e.event_date >= U.week && e.event_date <= iso(sun)).sort((a, b) => a.event_date.localeCompare(b.event_date) || (span(a.event_time) || [9999])[0] - (span(b.event_time) || [9999])[0]);
  const conflicts = findConflicts(events, S.staff, S.settings.max_load || 4), unconfirmed = S.staff.filter(s => !s.confirmed).length;
  const shift = d => () => { const x = new Date(mon); x.setDate(x.getDate() + d); U.week = iso(x); ctx.render(); };
  const tabs = h('div', {class: 'wr-tabs', style: 'margin-bottom:14px'}, [['week', 'Phân công tuần'], ['dir', `Danh bạ nhân sự (${S.staff.length})`]].map(([id, nm]) => h('button', {class: 'wr-tab' + (U.tab === id ? ' on' : ''), onclick: () => { U.tab = id; ctx.render(); }}, nm)));
  if (U.tab === 'dir') {
    const nm = h('input', {class: 'wr-in grow', placeholder: 'Họ tên nhân sự mới…', 'aria-label': 'Tên nhân sự', required: true});
    const busyTxt = s => (s.busy || []).map(b => `${dm(new Date(b.date))}/${b.date.slice(0, 4)} ${b.from || ''}-${b.to || ''}${b.note ? ' ' + b.note : ''}`).join('; ');
    const parseBusy = t => t.split(';').map(x => { const d = x.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/), tm = [...x.matchAll(/(\d{1,2})[h:](\d{2})/g)]; if (!d) return null; const pad = v => String(v).padStart(2, '0');
      return {date: `${d[3] || mon.getFullYear()}-${pad(d[2])}-${pad(d[1])}`, from: tm[0] ? `${pad(tm[0][1])}:${tm[0][2]}` : '', to: tm[1] ? `${pad(tm[1][1])}:${tm[1][2]}` : '', note: x.replace(d[0], '').replace(/\d{1,2}[h:]\d{2}/g, '').replace(/[-–]/g, '').trim()}; }).filter(Boolean);
    return h('div', {class: 'wr-wrap wide'}, head('Staff Assignment'), tabs,
      unconfirmed > 0 && h('div', {class: 'wr-banner soft'}, icon('warn'), h('div', {}, `${unconfirmed} người được trích từ tài liệu mẫu và chưa được xác nhận. Kiểm tra vai trò rồi tick "Đã xác nhận" — AI và phần kiểm tra vai trò chỉ tin dữ liệu đã xác nhận.`)),
      h('section', {class: 'wr-card'}, h('form', {class: 'wr-form', style: 'margin-bottom:10px', onsubmit: run(err, () => S.add('staff', {name: nm.value.trim(), confirmed: true}, {log: 'Thêm nhân sự: ' + nm.value.trim()}))}, nm, btn('Thêm nhân sự', null, {type: 'submit', icon: 'plus'})), err,
        h('div', {class: 'wr-tablewrap'}, h('table', {class: 'wr-table edit'}, h('thead', {}, h('tr', {}, ['Họ tên', 'Content', 'Media', 'Biên tập', 'Kỹ năng / ghi chú', 'Lịch bận (vd: 12/10 08:00-11:00; 15/10 14:00-17:00)', 'Đã xác nhận', 'Đang làm', ''].map(t => h('th', {}, t)))),
          h('tbody', {}, S.staff.length ? S.staff.map(s => h('tr', {class: s.active ? '' : 'off'},
            h('td', {}, h('input', {class: 'wr-cell', style: 'min-width:150px', value: s.name, 'aria-label': 'Họ tên', onchange: run(err, e => S.set('staff', s.id, {name: e.target.value.trim() || s.name}))})),
            ...ROLES.map(([r, l]) => h('td', {}, h('input', {type: 'checkbox', checked: s.roles.includes(r), 'aria-label': `${s.name}: ${l}`, onchange: run(err, e => S.set('staff', s.id, {roles: e.target.checked ? [...new Set([...s.roles, r])] : s.roles.filter(x => x !== r)}))}))),
            h('td', {}, h('input', {class: 'wr-cell', style: 'min-width:170px', value: s.skills, 'aria-label': 'Kỹ năng', onchange: run(err, e => S.set('staff', s.id, {skills: e.target.value.trim()}, {silent: true}))})),
            h('td', {}, h('input', {class: 'wr-cell', style: 'min-width:260px', value: busyTxt(s), 'aria-label': 'Lịch bận', onchange: run(err, e => S.set('staff', s.id, {busy: parseBusy(e.target.value)}))})),
            h('td', {}, h('input', {type: 'checkbox', checked: s.confirmed, 'aria-label': 'Đã xác nhận', onchange: run(err, e => S.set('staff', s.id, {confirmed: e.target.checked}))})),
            h('td', {}, h('input', {type: 'checkbox', checked: s.active, 'aria-label': 'Đang làm việc', onchange: run(err, e => S.set('staff', s.id, {active: e.target.checked}))})),
            h('td', {}, h('button', {class: 'wr-x', title: 'Xoá', 'aria-label': 'Xoá ' + s.name, onclick: run(err, async () => { if (await confirmBox('Xoá nhân sự', `Xoá ${s.name} khỏi danh bạ?`, 'Xoá', true)) await S.del('staff', s.id, {log: 'Xoá nhân sự: ' + s.name}); })}, icon('x'))))) : h('tr', {}, h('td', {colSpan: 9, class: 'wr-empty'}, 'Danh bạ trống.')))))));
  }
  const dl = h('datalist', {id: 'wrStaffNames'}, S.staff.filter(s => s.active).map(s => h('option', {value: s.name})));
  const setA = (ev, k) => run(err, e => S.set('events', ev.id, {assign: {...(ev.assign || {}), [k]: e.target.value.trim(), approved: false}}));
  const LBL = {content: 'Content', media: 'Media', editor: 'Biên tập', backup: 'Dự phòng', dl_article: 'Deadline tin bài', dl_edit: 'Deadline biên tập', dl_video: 'Deadline video'};
  const fld = (ev, k, ph, w) => h('input', {class: 'wr-cell', style: `min-width:${w}px`, list: /^dl_/.test(k) ? null : 'wrStaffNames', value: (ev.assign || {})[k] || '', placeholder: ph, 'aria-label': `${LBL[k]} — ${ev.name}`, onchange: setA(ev, k)});
  const addF = {name: h('input', {class: 'grow', placeholder: 'Tên sự kiện / hoạt động trong tuần…', required: true, 'aria-label': 'Tên sự kiện'}), date: h('input', {type: 'date', value: U.week, min: U.week, max: iso(sun), required: true, 'aria-label': 'Ngày'}), time: h('input', {placeholder: 'Giờ (8h00)', style: 'width:110px', 'aria-label': 'Giờ'}), venue: h('input', {placeholder: 'Địa điểm', style: 'width:180px', 'aria-label': 'Địa điểm'})};
  const ai = run(err, async () => { U.busy = true; ctx.render(); let r; try { r = await suggestAssign(ctx, events); } finally { U.busy = false; ctx.render(); }
    const trial = events.map(e => { const s = r.list.find(x => x.ev.id === e.id); return s ? {...e, assign: {...(e.assign || {}), content: s.content || (e.assign || {}).content, media: s.media || (e.assign || {}).media, editor: s.editor || (e.assign || {}).editor}} : e; });
    const cf = findConflicts(trial, S.staff, S.settings.max_load || 4).filter(c => c.level === 'bad');
    const ok = await dialog({title: 'AI đề xuất phân công — xem trước', wide: true, body: h('div', {}, h('div', {class: 'wr-tablewrap'}, h('table', {class: 'wr-table'}, h('thead', {}, h('tr', {}, ['Sự kiện', 'Content', 'Media', 'Biên tập', 'Dự phòng', 'Lý do'].map(t => h('th', {}, t)))),
      h('tbody', {}, r.list.map(s => h('tr', {}, h('td', {}, s.ev.name), h('td', {}, s.content || '—'), h('td', {}, s.media || '—'), h('td', {}, s.editor || '—'), h('td', {}, s.backup || '—'), h('td', {}, s.reason)))))),
      r.dropped.length > 0 && h('p', {class: 'wr-err'}, 'Đã bỏ tên không có trong danh bạ: ' + r.dropped.join(', ')),
      cf.length > 0 && h('div', {}, h('p', {class: 'wr-err'}, 'Đề xuất này vẫn còn xung đột:'), h('ul', {class: 'wr-list'}, cf.map(c => h('li', {}, c.text)))),
      h('p', {class: 'wr-empty'}, 'Nhận đề xuất sẽ điền vào các ô phân công (bạn vẫn sửa được). Chưa ghi gì lên Google.')), buttons: [['Bỏ', null], ['Nhận đề xuất', true, 'primary']]});
    if (!ok) return;
    for (const s of r.list) { const e = S.eventOf(s.ev.id), a = {...(e.assign || {})}; for (const k of ['content', 'media', 'editor', 'backup']) if (s[k]) a[k] = s[k]; a.approved = false; await S.set('events', e.id, {assign: a}, {silent: true}); }
    await S.log('assign.ai', `Nhận đề xuất phân công của AI cho ${r.list.length} sự kiện`); S.emit('change'); });
  const approve = run(err, async () => { const bad = conflicts.filter(c => c.level === 'bad');
    if (bad.length && !await confirmBox('Còn xung đột', `Còn ${bad.length} xung đột chưa xử lý (trùng giờ / báo bận). Vẫn duyệt phân công tuần này?`, 'Vẫn duyệt', true)) return;
    for (const e of events) await S.set('events', e.id, {assign: {...(e.assign || {}), approved: true}}, {silent: true});
    await S.log('assign.approve', `Duyệt phân công tuần ${dm(mon)}–${dm(sun)} (${events.length} sự kiện)`); S.emit('change'); });
  const approved = events.length > 0 && events.every(e => e.assign && e.assign.approved);
  const toDoc = run(err, async () => { const G = ctx.g, html = weekHtml(events, mon, U.weekNo), name = `LỊCH CÔNG TÁC TUẦN${U.weekNo ? ' ' + U.weekNo : ''} (${dm(mon)} - ${dm(sun)}/${sun.getFullYear()})`, docs = S.settings.week_docs || {}, old = docs[U.week];
    let f; if (old) { const v = await dialog({title: 'Tuần này đã có Google Docs', body: 'Cập nhật file đã có (thay toàn bộ nội dung) hay tạo file mới?', buttons: [['Huỷ', null], ['Tạo file mới', 'new'], ['Cập nhật file đã có', 'update', 'primary']]}); if (!v) return; if (v === 'update') f = await G.drive.updateDoc(old.id, html, name); }
    if (!f) f = await G.drive.createDoc(name, html, (await G.workFolder()).id);
    await S.setSetting('week_docs', {...docs, [U.week]: {id: f.id, url: f.webViewLink, at: new Date().toISOString()}}); await S.log('assign.doc', `Xuất ${name} sang Google Docs`); ctx.note('Đã lưu Lịch công tác tuần lên Google Docs.'); });
  const toDocx = run(err, async () => { const {writeDocx} = await import('./files.js'); download(writeDocx('', weekHtml(events, mon, U.weekNo)), `Lich cong tac tuan ${U.week}.docx`); });
  const toTasks = run(err, async () => { const mk = [];
    for (const e of events) { const a = e.assign || {}; for (const [k, title, who, d] of [['content', 'Viết tin', a.content, a.dl_article], ['editor', 'Biên tập', a.editor, a.dl_edit], ['media', 'Media', a.media, a.dl_video]])
      if (who && !S.tasks.some(t => t.ref && t.ref.assign === e.id && t.ref.role === k)) mk.push({title: `${title}: ${e.name}`.slice(0, 290), owner_name: who, event_id: e.id, deadline: parseDL(d, e), source: 'assignment', ref: {assign: e.id, role: k}}); }
    if (!mk.length) return ctx.note('Mọi phân công đều đã có việc tương ứng.');
    if (!await confirmBox('Tạo việc theo phân công', `Tạo ${mk.length} việc trong Task Manager?`, 'Tạo việc')) return;
    for (const t of mk) await S.add('tasks', t, {silent: true}); await S.log('assign.tasks', `Tạo ${mk.length} việc từ phân công tuần ${dm(mon)}`); S.emit('change'); ctx.note(`Đã tạo ${mk.length} việc.`); });
  const toCal = run(err, async () => { const G = ctx.g, list = events.filter(e => span(e.event_time));
    if (!list.length) throw new Error('Không có sự kiện nào có giờ để đưa lên lịch.');
    if (!await confirmBox('Đưa lên Google Calendar', `Tạo/cập nhật ${list.length} sự kiện trên lịch Google của bạn (tuần ${dm(mon)}–${dm(sun)})?`, 'Đưa lên lịch')) return;
    for (const e of list) { const t = span(e.event_time), at = m => `${e.event_date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`, a = e.assign || {};
      const body = {summary: e.name, location: e.venue || '', description: [`Mã: ${e.code}`, a.content && 'Content: ' + a.content, a.media && 'Media: ' + a.media, a.editor && 'Biên tập: ' + a.editor].filter(Boolean).join('\n'), start: {dateTime: at(t[0]), timeZone: 'Asia/Ho_Chi_Minh'}, end: {dateTime: at(Math.min(t[1], 23 * 60 + 59)), timeZone: 'Asia/Ho_Chi_Minh'}};
      const cur = S.eventOf(e.id), c = cur.links && cur.links.calendar; let r; try { r = c ? await G.calendar.patch(c.id, body) : await G.calendar.insert(body); } catch (x) { if (c && x.code === 'http') r = await G.calendar.insert(body); else throw x; }
      await S.set('events', e.id, {links: {...(cur.links || {}), calendar: {id: r.id, url: r.htmlLink}}}, {silent: true}); }
    await S.log('assign.calendar', `Đưa ${list.length} sự kiện lên Google Calendar`); S.emit('change'); ctx.note('Đã cập nhật Google Calendar.'); });
  const wd = (S.settings.week_docs || {})[U.week];
  return h('div', {class: 'wr-wrap wide'}, head('Staff Assignment', 'Phân công theo tuần, xuất đúng mẫu Lịch công tác tuần.'), tabs, dl,
    h('section', {class: 'wr-card', style: 'margin-bottom:16px'},
      h('div', {class: 'wr-form'}, btn('← Tuần trước', shift(-7), {ghost: true}), h('b', {}, `Tuần ${dm(mon)} – ${dm(sun)}/${sun.getFullYear()}`), btn('Tuần sau →', shift(7), {ghost: true}),
        h('input', {class: 'wr-in', style: 'width:110px', placeholder: 'Số tuần (09)', value: U.weekNo, 'aria-label': 'Số tuần', oninput: e => { U.weekNo = e.target.value.trim(); }}), h('span', {style: 'flex:1'}),
        approved ? h('span', {class: 'wr-chip ok'}, h('i'), 'Đã duyệt') : h('span', {class: 'wr-chip'}, h('i'), 'Chưa duyệt'),
        U.busy ? btn('Dừng', () => ctx.ai.stop(), {icon: 'stop', danger: true}) : btn('AI đề xuất phân công', ai, {icon: 'spark', disabled: !ctx.ai.ready || !events.length, title: ctx.ai.ready ? '' : 'AI trên máy chưa sẵn sàng'})),
      h('form', {class: 'wr-form', style: 'margin-top:12px', onsubmit: run(err, () => S.createEvent({name: addF.name.value, event_date: addF.date.value, event_time: addF.time.value.trim(), venue: addF.venue.value.trim()}))}, addF.name, addF.date, addF.time, addF.venue, btn('Thêm vào tuần', null, {type: 'submit', icon: 'plus', ghost: true}))),
    conflicts.length > 0 && h('section', {class: 'wr-card', style: 'margin-bottom:16px'}, h('h3', {}, 'Cần chú ý', h('span', {}, `${conflicts.filter(c => c.level === 'bad').length} xung đột · ${conflicts.filter(c => c.level !== 'bad').length} lưu ý`)),
      conflicts.map(c => h('div', {class: 'wr-row'}, h('span', {class: 'wr-tag ' + (c.level === 'bad' ? 'late' : 'high')}, c.level === 'bad' ? 'Xung đột' : 'Lưu ý'), c.ev && h('span', {class: 'wr-tag code'}, c.ev.code), h('span', {class: 't wrap'}, c.text)))),
    h('section', {class: 'wr-card'}, h('h3', {}, 'Phân công', h('span', {}, events.length + ' sự kiện')),
      events.length ? h('div', {class: 'wr-tablewrap'}, h('table', {class: 'wr-table edit'}, h('thead', {}, h('tr', {}, ['Ngày', 'Sự kiện', 'Content', 'Media', 'Biên tập', 'Dự phòng', 'Deadline tin bài', 'Deadline biên tập', 'Deadline video'].map(t => h('th', {}, t)))),
        h('tbody', {}, events.map(e => h('tr', {}, h('td', {}, h('b', {}, DOW[new Date(e.event_date + 'T12:00').getDay()].replace('THỨ ', 'T').replace('CHỦ NHẬT', 'CN')), ' ', dm(new Date(e.event_date + 'T12:00')), h('br'), h('span', {class: 'm'}, e.event_time || 'chưa có giờ')),
          h('td', {}, h('button', {class: 'wr-linkbtn', title: 'Chọn sự kiện này', onclick: () => ctx.setEvent(e.id)}, e.name), h('br'), h('span', {class: 'm'}, [e.code, e.venue].filter(Boolean).join(' · '))),
          h('td', {}, fld(e, 'content', 'Content', 120)), h('td', {}, fld(e, 'media', 'Media', 140)), h('td', {}, fld(e, 'editor', 'Biên tập', 110)), h('td', {}, fld(e, 'backup', 'Dự phòng', 110)),
          h('td', {}, fld(e, 'dl_article', '21h00 ngày 12/10', 130)), h('td', {}, fld(e, 'dl_edit', '22h00 ngày 12/10', 130)), h('td', {}, fld(e, 'dl_video', '9h30 ngày 13/10', 130))))))) : h('p', {class: 'wr-empty'}, 'Tuần này chưa có sự kiện nào có ngày. Thêm ở ô phía trên, hoặc đặt ngày cho sự kiện ở Overview.'),
      h('div', {class: 'wr-form', style: 'margin-top:14px'}, btn('Duyệt phân công tuần', approve, {icon: 'tick', disabled: !events.length || approved}),
        btn('Xuất Lịch công tác tuần → Google Docs', toDoc, {ghost: true, icon: 'doc', disabled: !events.length || !ctx.g.has('drive'), title: ctx.g.has('drive') ? '' : 'Cần kết nối Google'}), wd && h('a', {class: 'wr-btn ghost', href: wd.url, target: '_blank', rel: 'noopener'}, icon('ext'), 'Mở Docs'),
        btn('Tải .docx', toDocx, {ghost: true, icon: 'down', disabled: !events.length}), btn('Tạo việc theo phân công', toTasks, {ghost: true, icon: 'list', disabled: !events.length}),
        btn('Đưa lên Google Calendar', toCal, {ghost: true, icon: 'cal', disabled: !events.length || !ctx.g.has('calendar'), title: ctx.g.has('calendar') ? '' : 'Cần cấp quyền Lịch ở Cài đặt & Kết nối'})), err));
}
