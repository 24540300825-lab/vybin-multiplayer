// PHÂN CÔNG — Đội ngũ (danh sách nhân sự, chỉnh nhanh) + Chia người tự động cho lịch công tác tuần.
import {h, icon, btn, dialog, confirmBox, menu, moreBtn, withMenu, ask, errBox, run} from './ui.js';
import {tour, tourDone} from './tour.js';

export const ROLES = ['Content', 'Media', 'Biên tập', 'MC', 'Thiết kế'];
const norm = s => String(s || '').toLowerCase().normalize('NFC').trim();
const hasRole = (p, r) => (p.roles || []).some(x => norm(x) === norm(r));
const active = S => (S.staff || []).filter(p => p.active !== false);
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
export const teamsOf = S => [...new Set((S.staff || []).map(p => (p.team || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi', {numeric: true}));

// số việc mỗi người trong các lịch tuần gần đây (mặc định 28 ngày)
const PERSON_FIELDS = ['content', 'media', 'editor'];
export function workload(S, days = 28, skipId = null) {
  const since = Date.now() - days * 864e5, n = {};
  const names = (S.staff || []).map(p => p.name).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const d of S.docs || []) {
    if (d.kind !== 'schedule' || d.id === skipId || new Date(d.updated_at || d.created_at || 0).getTime() < since) continue;
    for (const day of (d.data && d.data.days) || []) for (const it of day.items || []) for (const f of PERSON_FIELDS) {
      let t = String(it[f] || ''); for (const nm of names) if (t.includes(nm)) { n[nm] = (n[nm] || 0) + 1; t = t.split(nm).join(''); }
    }
  }
  return n;
}
// "Thứ 3 sáng, CN" trong ghi chú bận → có trùng ngày của sự kiện không
const WD = [['chủ nhật', 'cn', 'chu nhat'], ['thứ hai', 'thứ 2', 't2'], ['thứ ba', 'thứ 3', 't3'], ['thứ tư', 'thứ 4', 't4'], ['thứ năm', 'thứ 5', 't5'], ['thứ sáu', 'thứ 6', 't6'], ['thứ bảy', 'thứ 7', 't7']];
const dayIdx = label => { const l = norm(label); return WD.findIndex(ws => ws.some(w => new RegExp('(^|[^\\p{L}\\d])' + w + '($|[^\\p{L}\\d])', 'u').test(l))); };
const busyOn = (p, label) => { const b = norm(p.busy); if (!b) return false; const i = dayIdx(label); if (i < 0) return false; return WD[i].some(w => new RegExp('(^|[^\\p{L}\\d])' + w + '($|[^\\p{L}\\d])', 'u').test(b)); };

export const MODES = [
  {id: 'role', name: 'Đúng chuyên môn, chia đều', desc: 'Content viết, Media quay chụp, Biên tập duyệt — ai đang ít việc trong tuần được giao trước.'},
  {id: 'fair', name: 'Xoay vòng công bằng', desc: 'Tính cả 4 tuần gần đây: ai ít được phân công nhất sẽ được ưu tiên.'},
  {id: 'team', name: 'Theo team', desc: 'Chỉ lấy người trong 1 team, hoặc mỗi sự kiện giao cho 1 team (xoay vòng).'},
  {id: 'random', name: 'Ngẫu nhiên', desc: 'Bốc ngẫu nhiên nhưng vẫn đúng vai trò, không trùng giờ. Bấm “Xáo lại” tới khi ưng.'},
  {id: 'ai', name: 'Để AI cân nhắc', desc: 'AI đọc tính chất từng sự kiện, ghi chú và lịch bận của mỗi người rồi chia.'},
];
const MEDIA_TASKS = {1: ['chụp + quay'], 2: ['chụp', 'quay'], 3: ['chụp', 'quay', 'dựng']};

// Chia người. Trả về {data (bản mới), load (số việc mới / người), gaps (ô thiếu người)}
export function autoAssign(S, data, o) {
  const d = JSON.parse(JSON.stringify(data || {})), off = new Set(o.exclude || []);
  const pool = active(S).filter(p => !off.has(p.id));
  const base = o.mode === 'fair' ? workload(S, 28, o.docId) : {}, load = {}, gaps = [];
  const teams = teamsOf(S).filter(t => pool.some(p => p.team === t));
  const score = p => (base[p.name] || 0) + (load[p.name] || 0) * 1.5;
  const slots = {};   // "ngày|giờ" → người đã có việc ở giờ đó
  let k = 0;
  (d.days || []).forEach(day => (day.items || []).forEach(it => {
    if (!String(it.title || '').trim()) return;
    const slot = norm(day.label) + '|' + norm(it.time || ('#' + k)), used = slots[slot] ||= new Set();
    let team = null;
    if (o.mode === 'team') team = o.team === '*rotate' ? teams[k % Math.max(1, teams.length)] : o.team;
    k++;
    const inItem = new Set();
    // giữ người đã điền sẵn (khi chỉ điền ô trống)
    for (const f of PERSON_FIELDS) if (o.onlyEmpty && String(it[f] || '').trim()) pool.forEach(p => { if (String(it[f]).includes(p.name)) { inItem.add(p.name); used.add(p.name); load[p.name] = (load[p.name] || 0) + 1; } });
    const pick = (role, n) => {
      const ok = p => hasRole(p, role) && !inItem.has(p.name) && !used.has(p.name) && !busyOn(p, day.label);
      let c = pool.filter(p => ok(p) && (!team || p.team === team));
      if (team && c.length < n && o.teamFallback !== false) c = [...c, ...pool.filter(p => ok(p) && p.team !== team)];
      c = shuffle(c); if (o.mode !== 'random') c.sort((a, b) => score(a) - score(b) || (team ? (b.team === team) - (a.team === team) : 0));
      const got = c.slice(0, n); got.forEach(p => { inItem.add(p.name); used.add(p.name); load[p.name] = (load[p.name] || 0) + 1; }); return got;
    };
    const fill = (f, role, n, tasks) => {
      if (o.onlyEmpty && String(it[f] || '').trim()) return;
      const got = pick(role, n);
      if (got.length < n) gaps.push(`${it.title.slice(0, 40)} — thiếu ${n - got.length} ${role}`);
      it[f] = got.map((p, i) => p.name + (o.tasks && tasks ? ` (${tasks[i] || tasks[tasks.length - 1]})` : '')).join(', ');
    };
    fill('content', 'Content', 1, ['tin bài']);
    fill('media', 'Media', o.mediaN || 1, MEDIA_TASKS[o.mediaN || 1]);
    fill('editor', 'Biên tập', 1, null);
  }));
  return {data: d, load, gaps};
}

// ===================== HỘP "CHIA NGƯỜI" (trong lịch công tác tuần) =====================
export async function assignDialog(ctx, doc, {apply, aiApply}) {
  const S = ctx.store, prefs = {mode: 'role', team: '*rotate', mediaN: 1, onlyEmpty: false, tasks: true, ...(S.settings.assign_prefs || {})};
  const o = {...prefs, exclude: [], docId: doc.id};
  const events = ((doc.data || {}).days || []).flatMap(d => (d.items || []).filter(x => String(x.title || '').trim()));
  if (!events.length) { await dialog({title: 'Chưa có sự kiện', body: 'Thêm các sự kiện trong tuần trước (hoặc bấm AI viết từ lịch nhận được), rồi mới chia người.'}); return; }
  if (!active(S).length) { await dialog({title: 'Chưa có đội ngũ', body: 'Vào Phân công → Đội ngũ để thêm người và vai trò trước.'}); return; }
  let res = null;
  const prev = h('div', {class: 'wr-asg-prev'}), modeBox = h('div', {class: 'wr-asg-modes'}), opts = h('div', {class: 'wr-asg-opts'});
  const teams = teamsOf(S);
  const recalc = () => {
    if (o.mode === 'ai') { prev.replaceChildren(h('p', {class: 'wr-mute'}, 'AI sẽ chia khi bạn bấm Áp dụng (mất 10–30 giây). Kết quả hiện thẳng trong lịch, bấm ⌘Z nếu muốn quay lại.')); return; }
    res = autoAssign(S, doc.data, o);
    const rows = []; (res.data.days || []).forEach(day => (day.items || []).forEach(it => { if (String(it.title || '').trim()) rows.push(h('tr', {}, h('td', {}, h('b', {}, it.title), h('small', {}, [day.label, it.time].filter(Boolean).join(' · '))), h('td', {}, it.content || '—'), h('td', {}, it.media || '—'), h('td', {}, it.editor || '—'))); }));
    const L = Object.entries(res.load).sort((a, b) => b[1] - a[1]);
    prev.replaceChildren(...[
      h('table', {class: 'wr-table wr-asg-t'}, h('thead', {}, h('tr', {}, ['Sự kiện', 'Content', 'Media', 'Biên tập'].map(x => h('th', {}, x)))), h('tbody', {}, rows)),
      h('div', {class: 'wr-asg-load'}, h('b', {}, 'Mỗi người tuần này: '), L.length ? L.map(([n, c]) => h('span', {class: 'wr-tag' + (c >= 3 ? ' warn' : '')}, `${n} · ${c}`)) : h('span', {class: 'wr-mute'}, 'chưa ai')),
      res.gaps.length ? h('p', {class: 'wr-asg-gap'}, icon('warn'), ' Thiếu người: ' + res.gaps.slice(0, 4).join('; ') + (res.gaps.length > 4 ? '…' : '') + '. Thêm vai trò cho người ở mục Đội ngũ, hoặc bỏ bớt người vắng.') : null].filter(Boolean));
  };
  const drawModes = () => modeBox.replaceChildren(...MODES.map(m => h('button', {class: 'wr-asg-mode' + (o.mode === m.id ? ' on' : ''), 'aria-pressed': String(o.mode === m.id), onclick: () => { o.mode = m.id; drawModes(); drawOpts(); recalc(); }},
    h('b', {}, m.name), h('small', {}, m.desc))));
  const out = new Set();
  const drawOpts = () => opts.replaceChildren(...[
    o.mode === 'team' ? h('label', {class: 'wr-f'}, h('span', {}, 'Team'), teams.length ? h('select', {class: 'wr-in', 'aria-label': 'Chọn team', onchange: e => { o.team = e.target.value; recalc(); }},
      h('option', {value: '*rotate', selected: o.team === '*rotate'}, 'Mỗi sự kiện 1 team (xoay vòng)'), teams.map(t => h('option', {value: t, selected: o.team === t}, t + ' — ' + active(S).filter(p => p.team === t).length + ' người')))
      : h('p', {class: 'wr-asg-gap'}, 'Chưa có team nào. Vào Đội ngũ → “Chia team” để tự chia, hoặc gán team cho từng người.')) : null,
    h('div', {class: 'wr-row'},
      h('label', {class: 'wr-f', style: 'flex:0 0 auto'}, h('span', {}, 'Media / sự kiện'), h('select', {class: 'wr-in', 'aria-label': 'Số người Media mỗi sự kiện', onchange: e => { o.mediaN = +e.target.value; recalc(); }}, [1, 2, 3].map(n => h('option', {value: n, selected: o.mediaN === n}, n + ' người' + (n === 1 ? ' (chụp + quay)' : n === 2 ? ' (chụp, quay)' : ' (chụp, quay, dựng)'))))),
      h('div', {class: 'wr-stack', style: 'gap:4px; padding-top:20px; flex:1; min-width:220px'},
        h('label', {class: 'wr-row'}, h('input', {type: 'checkbox', checked: o.onlyEmpty, onchange: e => { o.onlyEmpty = e.target.checked; recalc(); }}), 'Chỉ điền ô còn trống (giữ người đã phân)'),
        h('label', {class: 'wr-row'}, h('input', {type: 'checkbox', checked: o.tasks, onchange: e => { o.tasks = e.target.checked; recalc(); }}), 'Ghi kèm việc trong ngoặc, vd “(chụp + quay)”'))),
    h('details', {class: 'wr-asg-off'}, h('summary', {}, 'Người vắng tuần này' + (out.size ? ` (${out.size})` : '') + ' — bấm tên để loại ra'),
      h('div', {class: 'wr-asg-chips'}, active(S).map(p => h('button', {class: 'wr-pill' + (out.has(p.id) ? ' off' : ''), 'aria-pressed': String(out.has(p.id)), title: (p.roles || []).join(', ') + (p.busy ? ' · bận: ' + p.busy : ''),
        onclick: e => { out.has(p.id) ? out.delete(p.id) : out.add(p.id); o.exclude = [...out]; const det = e.currentTarget.closest('details'); drawOpts(); opts.querySelector('details').open = !!det; recalc(); }}, p.name))))].filter(Boolean));
  drawModes(); drawOpts(); recalc();
  const v = await dialog({title: 'Chia người cho ' + events.length + ' sự kiện', wide: true,
    body: done => h('div', {class: 'wr-asg'}, h('div', {class: 'wr-asg-side'}, modeBox, opts), h('div', {class: 'wr-asg-main'}, prev,
      h('div', {class: 'wr-row', style: 'margin-top:8px'}, btn('Xáo lại', () => recalc(), {ghost: true, sm: 1, icon: 'refresh', title: 'Chia lại (khác kết quả nếu có nhiều người phù hợp)'})))),
    buttons: [['Huỷ', null], ['Áp dụng vào lịch', 'go', 'primary']]});
  if (!v) return;
  await S.setSetting('assign_prefs', {mode: o.mode, team: o.team, mediaN: o.mediaN, onlyEmpty: o.onlyEmpty, tasks: o.tasks});
  if (o.mode === 'ai') {
    const off = active(S).filter(p => out.has(p.id)).map(p => p.name);
    return aiApply(`Phân công người cho từng sự kiện (cột Content, Media, Biên tập). Mỗi sự kiện ${o.mediaN} người Media. ${o.onlyEmpty ? 'Giữ nguyên các ô đã điền, chỉ điền ô trống.' : ''} ${o.tasks ? 'Ghi kèm việc trong ngoặc như mẫu.' : 'Chỉ ghi tên.'} Chia đều, đúng vai trò, không để 1 người ở 2 sự kiện trùng giờ, tránh người có ghi chú bận đúng ngày đó.${off.length ? ' Tuần này vắng: ' + off.join(', ') + ' — không phân công những người này.' : ''} Không thay đổi tên sự kiện, giờ, địa điểm, deadline.`);
  }
  await apply(res.data, 'Chia người: ' + MODES.find(m => m.id === o.mode).name);
}

// ===================== MÀN ĐỘI NGŨ =====================
const ROLE_CLS = {'Content': 'c', 'Media': 'm', 'Biên tập': 'e', 'MC': 'mc', 'Thiết kế': 'd'};
async function setTeam(S, ids, cur = '') {
  const teams = teamsOf(S), inp = h('input', {class: 'wr-in', value: cur, placeholder: 'vd Team 1, Team Sự kiện…', 'aria-label': 'Tên team', list: 'wr-teams'});
  const v = await dialog({title: ids.length > 1 ? `Gán team cho ${ids.length} người` : 'Gán team', body: h('div', {class: 'wr-stack'},
      h('label', {class: 'wr-f'}, h('span', {}, 'Team'), inp, h('datalist', {id: 'wr-teams'}, teams.map(t => h('option', {value: t})))),
      teams.length ? h('div', {class: 'wr-row', style: 'flex-wrap:wrap'}, teams.map(t => h('button', {class: 'wr-pill', onclick: () => { inp.value = t; }}, t))) : null,
      h('p', {class: 'wr-mute'}, 'Để trống = bỏ khỏi team.')),
    buttons: [['Huỷ', null], ['Lưu', () => inp.value.trim(), 'primary']]});
  if (v == null) return;
  for (const id of ids) await S.set('staff', id, {team: v}, {silent: true});
  S.emit('change');
}
async function splitTeams(ctx) {
  const S = ctx.store, P = active(S); if (P.length < 2) return;
  let n = Math.min(4, Math.max(2, Math.round(P.length / 8))), names = Array.from({length: 9}, (_, i) => 'Team ' + (i + 1));
  const cnt = h('select', {class: 'wr-in', 'aria-label': 'Số team'}, [2, 3, 4, 5, 6].map(k => h('option', {value: k, selected: k === n}, k + ' team (~' + Math.ceil(P.length / k) + ' người)')));
  const v = await dialog({title: 'Chia team tự động', body: h('div', {class: 'wr-stack'},
      h('p', {}, 'Chia ' + P.length + ' người đang làm thành các team cân bằng: team nào cũng có đủ Content, Media, Biên tập (bốc ngẫu nhiên trong từng vai trò).'),
      h('label', {class: 'wr-f'}, h('span', {}, 'Số team'), cnt),
      h('p', {class: 'wr-mute'}, 'Team cũ sẽ được thay. Có thể sửa tay từng người sau đó, hoặc chia lại bất cứ lúc nào.')),
    buttons: [['Huỷ', null], ['Chia team', () => +cnt.value, 'primary']]});
  if (!v) return;
  const rank = p => ['Biên tập', 'MC', 'Thiết kế', 'Content', 'Media'].findIndex(r => hasRole(p, r));
  const order = shuffle(P).sort((a, b) => ((rank(a) + 6) % 6) - ((rank(b) + 6) % 6)); // người hiếm vai trò chia trước
  const buckets = Array.from({length: v}, () => []);
  order.forEach(p => { const b = buckets.map((x, i) => [i, x.filter(q => (q.roles || []).some(r => hasRole(p, r))).length, x.length]).sort((a, b) => a[1] - b[1] || a[2] - b[2])[0][0]; buckets[b].push(p); });
  for (let i = 0; i < v; i++) for (const p of buckets[i]) await S.set('staff', p.id, {team: names[i]}, {silent: true});
  S.emit('change'); ctx.note('Đã chia ' + v + ' team');
}
async function addPeople(ctx) {
  const S = ctx.store, ta = h('textarea', {class: 'wr-in', rows: 6, placeholder: 'Mỗi dòng 1 người. Có thể ghi vai trò sau dấu “-”, vd:\nNgọc Ninh - Content\nHữu Đức - Media, MC', 'aria-label': 'Danh sách người mới'});
  const role = h('select', {class: 'wr-in', 'aria-label': 'Vai trò mặc định'}, ROLES.map(r => h('option', {}, r)));
  const team = h('input', {class: 'wr-in', placeholder: '(không bắt buộc)', 'aria-label': 'Team cho người mới'});
  const v = await dialog({title: 'Thêm người', body: h('div', {class: 'wr-stack'}, ta, h('div', {class: 'wr-row'}, h('label', {class: 'wr-f'}, h('span', {}, 'Vai trò nếu dòng không ghi'), role), h('label', {class: 'wr-f'}, h('span', {}, 'Team'), team))),
    buttons: [['Huỷ', null], ['Thêm', 'go', 'primary']]});
  if (!v) return;
  let n = 0;
  for (const line of ta.value.split('\n').map(x => x.trim()).filter(Boolean)) {
    const [nm, rs] = line.split(/\s+[-–:]\s+/), name = nm.trim(), roles = rs ? rs.split(/[,;/]/).map(x => ROLES.find(r => norm(r) === norm(x)) || x.trim()).filter(Boolean) : [role.value];
    const ex = (S.staff || []).find(p => norm(p.name) === norm(name));
    if (ex) await S.set('staff', ex.id, {roles: [...new Set([...(ex.roles || []), ...roles])], active: true, ...(team.value.trim() ? {team: team.value.trim()} : {})}, {silent: true});
    else await S.add('staff', {name, roles, team: team.value.trim()}, {silent: true});
    n++;
  }
  S.emit('change'); if (n) ctx.note('Đã thêm / cập nhật ' + n + ' người');
}
function personMenu(ctx, p) {
  const S = ctx.store;
  return [
    {label: 'Đổi tên', icon: 'pen', run: async () => { const v = await ask('Đổi tên', 'Tên', p.name); if (v) await S.set('staff', p.id, {name: v}); }},
    {label: 'Gán team…', icon: 'users', run: () => setTeam(S, [p.id], p.team || '')},
    {label: 'Ghi chú / lịch bận…', icon: 'clock', run: () => editNote(S, p)},
    {head: 'Vai trò'}, ...ROLES.map(r => ({label: r, on: hasRole(p, r), run: () => toggleRole(S, p, r)})), '-',
    p.active === false ? {label: 'Hoạt động lại', icon: 'tick', run: () => S.set('staff', p.id, {active: true})} : {label: 'Tạm nghỉ (không phân công)', icon: 'stop', run: () => S.set('staff', p.id, {active: false})},
    {label: 'Xoá khỏi danh sách', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Xoá ' + p.name + '?', 'Lịch đã phân công trước đây vẫn giữ tên người này.', 'Xoá', true)) await S.del('staff', p.id); }},
  ];
}
const toggleRole = (S, p, r) => S.set('staff', p.id, {roles: hasRole(p, r) ? (p.roles || []).filter(x => norm(x) !== norm(r)) : [...(p.roles || []), r]});
async function editNote(S, p) {
  const busy = h('input', {class: 'wr-in', value: p.busy || '', placeholder: 'vd Thứ 3, Thứ 5 sáng', 'aria-label': 'Ngày bận'}), note = h('textarea', {class: 'wr-in', rows: 3, value: p.note || '', placeholder: 'vd mạnh quay flycam, viết tiếng Anh tốt…', 'aria-label': 'Ghi chú'});
  const v = await dialog({title: p.name, body: h('div', {class: 'wr-stack'}, h('label', {class: 'wr-f'}, h('span', {}, 'Bận những ngày (tự động không phân công vào ngày đó)'), busy), h('label', {class: 'wr-f'}, h('span', {}, 'Ghi chú cho AI (sở trường, lưu ý)'), note)),
    buttons: [['Huỷ', null], ['Lưu', 'go', 'primary']]});
  if (v) await S.set('staff', p.id, {busy: busy.value.trim(), note: note.value.trim()});
}

export function teamView(ctx) {
  const S = ctx.store, U = ctx.ui.team ||= {q: '', role: 'all', by: 'role', sel: new Set()}, err = errBox();
  const all = S.staff || [], on = all.filter(p => p.active !== false), load = workload(S, 7);
  const cnt = r => r === 'all' ? on.length : r === 'off' ? all.length - on.length : r === 'none' ? on.filter(p => !(p.roles || []).length) : on.filter(p => hasRole(p, r)).length;
  const q = norm(U.q);
  let list = (U.role === 'off' ? all.filter(p => p.active === false) : on).filter(p => (U.role === 'all' || U.role === 'off' || hasRole(p, U.role)) && (!q || norm(p.name).includes(q) || norm(p.team).includes(q) || norm(p.note).includes(q)));
  list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const groups = U.by === 'az' ? [['', list]] : U.by === 'team' ? [...teamsOf(S), ''].map(t => [t || 'Chưa có team', list.filter(p => (p.team || '') === t)]).filter(g => g[1].length)
    : [...ROLES.map(r => [r, list.filter(p => (p.roles || [])[0] && norm(p.roles[0]) === norm(r))]), ['Chưa có vai trò', list.filter(p => !(p.roles || []).length || !ROLES.some(r => norm(r) === norm(p.roles[0])))]].filter(g => g[1].length);
  const sel = U.sel; [...sel].forEach(id => { if (!all.some(p => p.id === id)) sel.delete(id); });
  const ids = () => [...sel];
  const bulk = async fn => { for (const id of ids()) await fn(all.find(p => p.id === id)); S.emit('change'); };
  const card = p => withMenu(h('div', {class: 'wr-pc' + (sel.has(p.id) ? ' sel' : '') + (p.active === false ? ' off' : ''), 'data-id': p.id},
    h('input', {type: 'checkbox', checked: sel.has(p.id), 'aria-label': 'Chọn ' + p.name, onchange: e => { e.target.checked ? sel.add(p.id) : sel.delete(p.id); ctx.render(); }}),
    h('div', {class: 'wr-pc-main'},
      h('div', {class: 'wr-pc-top'}, h('b', {ondblclick: async () => { const v = await ask('Đổi tên', 'Tên', p.name); if (v) await S.set('staff', p.id, {name: v}); }, title: 'Bấm đúp để đổi tên'}, p.name),
        h('button', {class: 'wr-pc-team' + (p.team ? '' : ' none'), title: 'Gán team', onclick: () => setTeam(S, [p.id], p.team || '')}, p.team || '+ team'),
        load[p.name] ? h('span', {class: 'wr-pc-load', title: 'Số việc trong lịch 7 ngày gần đây'}, load[p.name] + ' việc') : null),
      h('div', {class: 'wr-pc-roles'}, ROLES.map(r => h('button', {class: 'wr-role ' + ROLE_CLS[r] + (hasRole(p, r) ? ' on' : ''), 'aria-pressed': String(hasRole(p, r)), title: (hasRole(p, r) ? 'Bỏ vai trò ' : 'Thêm vai trò ') + r, onclick: () => toggleRole(S, p, r)}, r))),
      (p.busy || p.note) ? h('small', {class: 'wr-pc-note', onclick: () => editNote(S, p)}, [p.busy && '⏰ Bận: ' + p.busy, p.note].filter(Boolean).join(' · ')) : null),
    moreBtn(() => personMenu(ctx, p))), () => personMenu(ctx, p));
  const search = h('input', {class: 'wr-in wr-team-q', type: 'search', placeholder: 'Tìm tên, team, ghi chú…', value: U.q, 'aria-label': 'Tìm trong đội ngũ', oninput: e => { U.q = e.target.value; ctx.render(); }});
  return h('div', {class: 'wr-team'}, err,
    h('div', {class: 'wr-team-bar'}, search,
      h('div', {class: 'wr-tabs wr-team-f', role: 'tablist'}, [['all', 'Tất cả'], ...ROLES.map(r => [r, r]), ['off', 'Tạm nghỉ']].map(([k, l]) => h('button', {class: U.role === k ? 'on' : '', onclick: () => { U.role = k; ctx.render(); }}, l, h('em', {}, cnt(k))))),
      h('span', {style: 'flex:1'}),
      h('label', {class: 'wr-team-by'}, 'Nhóm theo ', h('select', {class: 'wr-in', 'aria-label': 'Nhóm theo', onchange: e => { U.by = e.target.value; ctx.render(); }}, [['role', 'Vai trò chính'], ['team', 'Team'], ['az', 'A → Z']].map(([v, l]) => h('option', {value: v, selected: U.by === v}, l)))),
      btn('Chia team', () => splitTeams(ctx), {ghost: true, sm: 1, icon: 'users', cls: 'wr-t-split', title: 'Tự chia mọi người thành các team cân bằng vai trò'}),
      btn('Thêm người', () => addPeople(ctx), {sm: 1, icon: 'plus', cls: 'wr-t-add'})),
    sel.size ? h('div', {class: 'wr-bulk', role: 'toolbar', 'aria-label': 'Thao tác hàng loạt'}, h('b', {}, 'Đã chọn ' + sel.size),
      btn('Gán team…', () => setTeam(S, ids()), {ghost: true, sm: 1}),
      btn('Thêm vai trò…', e => menu(ROLES.map(r => ({label: r, run: () => bulk(p => S.set('staff', p.id, {roles: [...new Set([...(p.roles || []), r])]}, {silent: true}))})), e.currentTarget), {ghost: true, sm: 1}),
      btn('Bỏ vai trò…', e => menu(ROLES.map(r => ({label: r, run: () => bulk(p => S.set('staff', p.id, {roles: (p.roles || []).filter(x => norm(x) !== norm(r))}, {silent: true}))})), e.currentTarget), {ghost: true, sm: 1}),
      U.role === 'off' ? btn('Hoạt động lại', () => bulk(p => S.set('staff', p.id, {active: true}, {silent: true})), {ghost: true, sm: 1}) : btn('Tạm nghỉ', () => bulk(p => S.set('staff', p.id, {active: false}, {silent: true})), {ghost: true, sm: 1}),
      btn('Chọn hết', () => { list.forEach(p => sel.add(p.id)); ctx.render(); }, {ghost: true, sm: 1}),
      h('span', {style: 'flex:1'}), btn('Bỏ chọn', () => { sel.clear(); ctx.render(); }, {ghost: true, sm: 1})) : null,
    list.length ? groups.map(([g, L]) => h('section', {class: 'wr-team-g'}, g ? h('h4', {}, g, h('em', {}, L.length)) : null, h('div', {class: 'wr-team-grid'}, L.map(card))))
      : h('div', {class: 'wr-empty'}, all.length ? 'Không có ai khớp bộ lọc.' : 'Chưa có ai. Bấm “Thêm người” — dán cả danh sách, mỗi dòng 1 người.'));
}

// ===================== HƯỚNG DẪN =====================
export const TEAM_TOUR = ctx => [
  {el: '.wr-ph-tabs', title: 'Phân công có 2 phần', text: '“Lịch tuần” là các lịch công tác bạn soạn và gửi nhóm. “Đội ngũ” là danh sách mọi người — Workroom và AI chỉ phân công những người ở đây.', place: 'bottom'},
  {el: '.wr-team-f', title: 'Lọc theo vai trò', text: 'Bấm để chỉ xem Content, Media, Biên tập… Số bên cạnh là có bao nhiêu người. “Tạm nghỉ” là những người tạm không nhận việc.', place: 'bottom', before: () => { ctx.ui.ph = 'team'; ctx.render(); }},
  {el: '.wr-pc-roles', title: 'Bật / tắt vai trò ngay trên thẻ', text: 'Mỗi người có 5 nút vai trò. Bấm để bật (đậm màu) hoặc tắt. Một người có thể vừa Content vừa MC. Chia người tự động dựa vào đây.', place: 'bottom'},
  {el: '.wr-pc-team', title: 'Team', text: 'Bấm để gán người vào team. Khi chia lịch có thể chọn “Theo team” — giao cả sự kiện cho 1 team, hoặc xoay vòng các team.', place: 'right'},
  {el: '.wr-pc .wr-more', title: 'Thêm tuỳ chỉnh', text: 'Nút ⋯ (hoặc chuột phải vào thẻ): đổi tên, ghi chú sở trường, ngày bận (tự động không giao việc ngày đó), tạm nghỉ, xoá.', place: 'left'},
  {el: '.wr-pc input[type=checkbox]', title: 'Sửa nhiều người một lúc', text: 'Tick ô vuông để chọn nhiều người → thanh thao tác hiện ra: gán team, thêm/bỏ vai trò, tạm nghỉ cùng lúc.', place: 'right'},
  {el: '.wr-t-split', title: 'Chia team tự động', text: 'Chưa có team? Bấm đây — Workroom chia đều mọi người thành 2–6 team, team nào cũng đủ Content, Media, Biên tập.', place: 'bottom'},
  {el: '.wr-t-add', title: 'Thêm người hàng loạt', text: 'Dán cả danh sách, mỗi dòng 1 người, vd “Ngọc Ninh - Content”.', place: 'bottom'},
  {el: '.wr-ph-tabs', title: 'Chia người vào lịch', text: 'Mở 1 lịch tuần → bấm “Chia người”: chọn đúng chuyên môn, xoay vòng công bằng, theo team, ngẫu nhiên hoặc để AI chia; xem trước rồi mới áp dụng (⌘Z để hoàn tác). Muốn xem lại hướng dẫn này: bấm nút “Hướng dẫn” ở góc trên.', place: 'bottom'},
];
export const ASSIGN_TOUR = [
  {el: '.wr-t-assign', title: 'Chia người tự động', text: 'Bấm đây để Workroom tự điền Content, Media, Biên tập cho mọi sự kiện trong tuần — chọn cách chia, xem trước, rồi áp dụng. Bấm ⌘Z nếu muốn quay lại.', place: 'bottom'},
];
export {tour, tourDone};
