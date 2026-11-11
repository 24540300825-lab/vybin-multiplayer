// PHÂN CÔNG — Đội ngũ chia theo bộ phận (mỗi bộ phận = 1 team) + Chia lịch: bốc ngẫu nhiên người trong từng bộ phận, Vy sửa tay.
import {h, icon, btn, dialog, confirmBox, menu, ask} from './ui.js';
import {tour, tourDone} from './tour.js';

export const ROLES = ['Content', 'Media', 'Biên tập', 'MC', 'Thiết kế'];
const COLOR = {'Content': '#d0703f', 'Media': '#3d7fb0', 'Biên tập': '#3f9b5c', 'MC': '#a0569b', 'Thiết kế': '#a8862a'};
const norm = s => String(s || '').toLowerCase().normalize('NFC').trim();
const hasRole = (p, r) => (p.roles || []).some(x => norm(x) === norm(r));
const working = S => (S.staff || []).filter(p => p.active !== false);
const pickOne = a => a[Math.floor(Math.random() * a.length)];

// số việc mỗi người trong các lịch tuần 7 ngày gần đây (để chia đều)
export function workload(S, days = 7, skipId = null) {
  const since = Date.now() - days * 864e5, n = {};
  const names = (S.staff || []).map(p => p.name).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const d of S.docs || []) {
    if (d.kind !== 'schedule' || d.id === skipId || new Date(d.updated_at || d.created_at || 0).getTime() < since) continue;
    for (const day of (d.data && d.data.days) || []) for (const it of day.items || []) for (const f of ['content', 'media', 'editor']) {
      let t = String(it[f] || ''); for (const nm of names) if (t.includes(nm)) { n[nm] = (n[nm] || 0) + 1; t = t.split(nm).join(''); }
    }
  }
  return n;
}
// ghi chú bận "Thứ 3, Thứ 5 sáng" → không giao việc ngày đó
const WD = [['chủ nhật', 'cn'], ['thứ hai', 'thứ 2', 't2'], ['thứ ba', 'thứ 3', 't3'], ['thứ tư', 'thứ 4', 't4'], ['thứ năm', 'thứ 5', 't5'], ['thứ sáu', 'thứ 6', 't6'], ['thứ bảy', 'thứ 7', 't7']];
const has = (txt, w) => new RegExp('(^|[^\\p{L}\\d])' + w + '($|[^\\p{L}\\d])', 'u').test(txt);
const busyOn = (p, label) => { const b = norm(p.busy), l = norm(label); if (!b) return false; const i = WD.findIndex(ws => ws.some(w => has(l, w))); return i >= 0 && WD[i].some(w => has(b, w)); };

// ===================== CHIA LỊCH =====================
const COLS = [['content', 'Content', 'Content'], ['media', 'Media', 'Media'], ['editor', 'Biên tập', 'Biên tập']];
const TASK = {content: () => 'tin bài', media: (i, n) => n === 1 ? 'chụp + quay' : ['chụp', 'quay', 'dựng'][i] || 'hỗ trợ'};
const fmtCell = (f, names) => names.filter(Boolean).map((nm, i, a) => TASK[f] ? `${nm} (${TASK[f](i, a.length)})` : nm).join(', ');

export async function assignDialog(ctx, doc, {apply}) {
  const S = ctx.store, team = working(S);
  const rows = []; ((doc.data || {}).days || []).forEach((day, di) => (day.items || []).forEach((it, ii) => { if (String(it.title || '').trim()) rows.push({di, ii, day: day.label || '', it}); }));
  if (!rows.length) { await dialog({title: 'Chưa có sự kiện', body: 'Thêm các sự kiện trong tuần trước (hoặc bấm ✨ AI viết từ lịch nhận được), rồi bấm Chia lịch.'}); return; }
  if (!team.length) { await dialog({title: 'Chưa có đội ngũ', body: 'Vào Phân công → Đội ngũ để thêm người vào từng bộ phận trước.'}); return; }
  const away = new Set(), base = workload(S, 7, doc.id);
  // bắt đầu từ người đã điền sẵn trong lịch (nếu có)
  const G = rows.map(r => Object.fromEntries(COLS.map(([f]) => [f, team.filter(p => String(r.it[f] || '').includes(p.name)).map(p => p.name)])));
  G.forEach(g => { if (!g.media.length) g.media = [''] ; if (!g.content.length) g.content = ['']; if (!g.editor.length) g.editor = ['']; });
  const slot = r => norm(r.day) + '|' + norm(r.it.time || ('#' + r.di + '.' + r.ii));
  const count = () => { const c = {}; G.forEach(g => COLS.forEach(([f]) => g[f].forEach(n => { if (n) c[n] = (c[n] || 0) + 1; }))); return c; };
  // bốc 1 người ngẫu nhiên trong bộ phận: đang làm, không vắng, không bận ngày đó, không trùng giờ, ưu tiên người ít việc
  const draw = (ri, f, k) => {
    const r = rows[ri], role = COLS.find(c => c[0] === f)[2], c = count();
    const busyNow = new Set(); rows.forEach((x, j) => { if (slot(x) === slot(r)) COLS.forEach(([g]) => G[j][g].forEach((n, m) => { if (n && !(j === ri && g === f && m === k)) busyNow.add(n); })); });
    const ok = team.filter(p => hasRole(p, role) && !away.has(p.id) && !busyOn(p, r.day) && !busyNow.has(p.name));
    if (!ok.length) return '';
    const load = p => (c[p.name] || 0) + (base[p.name] || 0) * 0.5, min = Math.min(...ok.map(load));
    return pickOne(ok.filter(p => load(p) <= min + 0.5)).name;
  };
  const fillEmpty = () => rows.forEach((_, i) => COLS.forEach(([f]) => G[i][f].forEach((n, k) => { if (!n) G[i][f][k] = draw(i, f, k); })));
  const reroll = () => { G.forEach(g => COLS.forEach(([f]) => { g[f] = g[f].map(() => ''); })); fillEmpty(); };
  fillEmpty();

  const body = h('div', {class: 'wr-asg'});
  const conflicts = () => { const bad = new Set(); const by = {}; rows.forEach((r, i) => COLS.forEach(([f]) => G[i][f].forEach(n => { if (!n) return; const k = slot(r) + '|' + n; if (by[k] != null && by[k] !== i) bad.add(k); by[k] = by[k] ?? i; }))); return bad; };
  const paint = () => {
    const c = count(), bad = conflicts();
    const cell = (i, f) => { const role = COLS.find(x => x[0] === f)[2], mem = team.filter(p => hasRole(p, role)), r = rows[i];
      return h('td', {}, h('div', {class: 'wr-cell'}, G[i][f].map((n, k) => h('div', {class: 'wr-pickrow'},
        h('select', {class: 'wr-in wr-pick' + (n && bad.has(slot(r) + '|' + n) ? ' bad' : '') + (n ? '' : ' empty'), 'aria-label': `${COLS.find(x => x[0] === f)[1]} · ${r.it.title}${k ? ' · ' + (k + 1) : ''}`, title: n && bad.has(slot(r) + '|' + n) ? 'Người này đã có việc khác cùng giờ' : '',
            onchange: e => { G[i][f][k] = e.target.value; paint(); }},
          h('option', {value: ''}, '— trống —'), mem.map(p => h('option', {value: p.name, selected: p.name === n, disabled: away.has(p.id)}, p.name + (c[p.name] ? ` · ${c[p.name]}` : '') + (busyOn(p, r.day) ? ' (bận)' : '')))),
        h('button', {class: 'wr-x sm', title: 'Bốc người khác', 'aria-label': 'Bốc người khác', onclick: () => { G[i][f][k] = draw(i, f, k); paint(); }}, '🎲'),
        f === 'media' && k > 0 ? h('button', {class: 'wr-x sm', title: 'Bớt 1 người', 'aria-label': 'Bớt 1 người Media', onclick: () => { G[i][f].splice(k, 1); paint(); }}, '−') : null)),
        f === 'media' && G[i][f].length < 3 ? h('button', {class: 'wr-addp', onclick: () => { G[i][f].push(''); G[i][f][G[i][f].length - 1] = draw(i, f, G[i][f].length - 1); paint(); }}, '+ thêm người') : null)); };
    const people = Object.entries(c).sort((a, b) => b[1] - a[1]);
    body.replaceChildren(...[
      h('div', {class: 'wr-asg-top'}, h('p', {class: 'wr-mute'}, 'Mỗi ô đã bốc ngẫu nhiên 1 người trong đúng bộ phận (ưu tiên người ít việc, không trùng giờ, tránh ngày bận). Đổi người bằng ô chọn hoặc 🎲.'),
        btn('Xáo lại tất cả', () => { reroll(); paint(); }, {ghost: true, sm: 1, icon: 'refresh'})),
      h('div', {class: 'wr-asg-scroll'}, h('table', {class: 'wr-table wr-asg-t'},
        h('thead', {}, h('tr', {}, h('th', {}, 'Sự kiện'), COLS.map(([, l, role]) => h('th', {}, h('i', {class: 'dot', style: 'background:' + COLOR[role]}), l)))),
        h('tbody', {}, rows.map((r, i) => h('tr', {}, h('td', {}, h('b', {}, r.it.title), h('small', {}, [r.day, r.it.time].filter(Boolean).join(' · '))), COLS.map(([f]) => cell(i, f))))))),
      bad.size ? h('p', {class: 'wr-asg-gap'}, icon('warn'), ' Có người bị xếp 2 việc cùng giờ (ô viền đỏ).') : null,
      h('div', {class: 'wr-asg-foot'},
        h('div', {class: 'wr-asg-load'}, h('b', {}, 'Tuần này: '), people.length ? people.map(([n, k]) => h('span', {class: 'wr-tag' + (k >= 3 ? ' warn' : '')}, `${n} ${k}`)) : h('span', {class: 'wr-mute'}, '—')),
        h('details', {class: 'wr-asg-off', open: away.size > 0}, h('summary', {}, 'Ai vắng tuần này?' + (away.size ? ` (${away.size})` : '')),
          h('div', {class: 'wr-asg-chips'}, team.map(p => h('button', {class: 'wr-pill' + (away.has(p.id) ? ' off' : ''), 'aria-pressed': String(away.has(p.id)),
            onclick: () => { if (away.has(p.id)) away.delete(p.id); else { away.add(p.id); G.forEach(g => COLS.forEach(([f]) => { g[f] = g[f].map(n => n === p.name ? '' : n); })); fillEmpty(); } paint(); }}, p.name)))))].filter(Boolean));
  };
  paint();
  const v = await dialog({title: 'Chia lịch cho ' + rows.length + ' sự kiện', wide: true, body, buttons: [['Huỷ', null], ['Điền vào lịch', 'go', 'primary']]});
  if (!v) return;
  const data = JSON.parse(JSON.stringify(doc.data));
  rows.forEach((r, i) => COLS.forEach(([f]) => { data.days[r.di].items[r.ii][f] = fmtCell(f, G[i][f]); }));
  await apply(data, 'Chia lịch');
  ctx.note('Đã điền vào lịch — sửa tay thoải mái, ⌘Z để quay lại');
}

// ===================== ĐỘI NGŨ (bảng theo bộ phận) =====================
const setRoles = (S, p, roles) => S.set('staff', p.id, {roles: [...new Set(roles)]});
async function editNote(S, p) {
  const busy = h('input', {class: 'wr-in', value: p.busy || '', placeholder: 'vd Thứ 3, Thứ 5', 'aria-label': 'Ngày bận'}), note = h('input', {class: 'wr-in', value: p.note || '', placeholder: 'vd quay flycam tốt', 'aria-label': 'Ghi chú'});
  const v = await dialog({title: p.name, body: h('div', {class: 'wr-stack'}, h('label', {class: 'wr-f'}, h('span', {}, 'Ngày bận hằng tuần — chia lịch sẽ tránh ngày này'), busy), h('label', {class: 'wr-f'}, h('span', {}, 'Ghi chú'), note)),
    buttons: [['Huỷ', null], ['Lưu', 'go', 'primary']]});
  if (v) await S.set('staff', p.id, {busy: busy.value.trim(), note: note.value.trim()});
}
function chipMenu(ctx, p, role) {
  const S = ctx.store, others = ROLES.filter(r => r !== role);
  return [
    {head: p.name},
    {label: 'Ngày bận / ghi chú…', icon: 'clock', run: () => editNote(S, p)},
    {label: 'Đổi tên', icon: 'pen', run: async () => { const v = await ask('Đổi tên', 'Tên', p.name); if (v) await S.set('staff', p.id, {name: v}); }},
    '-', {head: 'Chuyển sang bộ phận'}, ...others.map(r => ({label: r, run: () => setRoles(S, p, [...(p.roles || []).filter(x => role ? norm(x) !== norm(role) : true), r])})),
    {head: 'Làm thêm bộ phận'}, ...others.filter(r => !hasRole(p, r)).map(r => ({label: '+ ' + r, run: () => setRoles(S, p, [...(p.roles || []), r])})),
    '-', role && (p.roles || []).length > 1 ? {label: 'Bỏ khỏi ' + role, icon: 'x', run: () => setRoles(S, p, p.roles.filter(x => norm(x) !== norm(role)))} : null,
    p.active === false ? {label: 'Đi làm lại', icon: 'tick', run: () => S.set('staff', p.id, {active: true})} : {label: 'Tạm nghỉ (không chia lịch)', icon: 'stop', run: () => S.set('staff', p.id, {active: false})},
    {label: 'Xoá khỏi đội ngũ', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Xoá ' + p.name + '?', 'Lịch cũ vẫn giữ tên người này.', 'Xoá', true)) await S.del('staff', p.id); }},
  ];
}
async function addPeople(ctx) {
  const S = ctx.store, ta = h('textarea', {class: 'wr-in', rows: 7, placeholder: 'Mỗi dòng 1 người, ghi bộ phận sau dấu “-”:\nNgọc Ninh - Content\nHữu Đức - Media\nThanh Hảo - Content, Biên tập', 'aria-label': 'Danh sách người mới'});
  const v = await dialog({title: 'Thêm nhiều người', body: ta, buttons: [['Huỷ', null], ['Thêm', 'go', 'primary']]});
  if (!v) return;
  let n = 0;
  for (const line of ta.value.split('\n').map(x => x.trim()).filter(Boolean)) {
    const [nm, rs] = line.split(/\s+[-–:]\s+/), name = nm.trim(), roles = rs ? rs.split(/[,;/]/).map(x => ROLES.find(r => norm(r) === norm(x)) || x.trim()).filter(Boolean) : [];
    const ex = (S.staff || []).find(p => norm(p.name) === norm(name));
    if (ex) await S.set('staff', ex.id, {roles: [...new Set([...(ex.roles || []), ...roles])], active: true}, {silent: true}); else await S.add('staff', {name, roles}, {silent: true});
    n++;
  }
  S.emit('change'); if (n) ctx.note('Đã thêm ' + n + ' người');
}
async function addTo(ctx, role, name) {
  const S = ctx.store, nm = name.trim(); if (!nm) return;
  const ex = (S.staff || []).find(p => norm(p.name) === norm(nm));
  if (ex) await S.set('staff', ex.id, {roles: [...new Set([...(ex.roles || []), role])], active: true}); else await S.add('staff', {name: nm, roles: [role]});
  ctx.ui.addFocus = role;
}

export function teamView(ctx) {
  const S = ctx.store, all = (S.staff || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'vi')), load = workload(S, 7);
  const cols = [...ROLES.map(r => [r, all.filter(p => hasRole(p, r))]), ['', all.filter(p => !ROLES.some(r => hasRole(p, r)))]].filter(([r, L]) => r || L.length);
  const chip = (p, role) => h('div', {class: 'wr-mem' + (p.active === false ? ' off' : ''), tabIndex: 0, role: 'button', draggable: 'true', 'aria-label': p.name + (role ? ' — ' + role : ''),
      title: [p.active === false && 'Đang tạm nghỉ', p.busy && 'Bận: ' + p.busy, p.note].filter(Boolean).join(' · ') || 'Bấm để chỉnh · kéo sang cột khác để chuyển bộ phận',
      ondragstart: e => { e.dataTransfer.setData('text/plain', JSON.stringify({id: p.id, from: role})); e.dataTransfer.effectAllowed = 'move'; },
      onclick: e => menu(chipMenu(ctx, p, role), e.currentTarget), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu(chipMenu(ctx, p, role), e.currentTarget); } },
      oncontextmenu: e => { e.preventDefault(); menu(chipMenu(ctx, p, role), {x: e.clientX, y: e.clientY}); }},
    h('span', {class: 'n'}, p.name), p.busy ? h('span', {class: 'b', title: 'Bận: ' + p.busy}, '⏰') : null, (p.roles || []).length > 1 ? h('span', {class: 'x', title: 'Cũng ở: ' + p.roles.filter(r => norm(r) !== norm(role)).join(', ')}, '+' + (p.roles.length - 1)) : null,
    load[p.name] ? h('span', {class: 'c', title: 'Số việc trong lịch 7 ngày qua'}, load[p.name]) : null);
  const column = ([role, L]) => {
    const inp = h('input', {class: 'wr-in wr-memadd', placeholder: '+ Thêm tên', 'aria-label': 'Thêm người vào ' + (role || 'chưa có bộ phận'), onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); addTo(ctx, role, e.target.value); } }});
    if (ctx.ui.addFocus === role) { ctx.ui.addFocus = null; setTimeout(() => { const el = document.querySelector(`[aria-label="Thêm người vào ${role}"]`); el && el.focus(); }, 0); }
    return h('section', {class: 'wr-dept', style: '--c:' + (COLOR[role] || '#a8957d'),
        ondragover: e => { if (role) { e.preventDefault(); e.currentTarget.classList.add('over'); } }, ondragleave: e => e.currentTarget.classList.remove('over'),
        ondrop: async e => { e.preventDefault(); e.currentTarget.classList.remove('over'); try { const {id, from} = JSON.parse(e.dataTransfer.getData('text/plain')), p = all.find(x => x.id === id); if (!p || from === role) return;
          await setRoles(S, p, [...(p.roles || []).filter(x => !from || norm(x) !== norm(from)), role]); ctx.note(`${p.name} → ${role}`); } catch (er) {} }},
      h('header', {}, h('i', {class: 'dot'}), h('b', {}, role || 'Chưa có bộ phận'), h('em', {}, L.filter(p => p.active !== false).length)),
      h('div', {class: 'wr-mems'}, L.length ? L.map(p => chip(p, role)) : h('p', {class: 'wr-mute', style: 'font-size:13px'}, 'Chưa có ai')),
      role ? inp : null);
  };
  const off = all.filter(p => p.active === false).length;
  return h('div', {class: 'wr-team'},
    h('div', {class: 'wr-team-bar'}, h('p', {class: 'wr-mute', style: 'flex:1'}, `${all.length - off} người đang làm${off ? ` · ${off} tạm nghỉ` : ''}. Mỗi cột là 1 bộ phận — bấm vào tên để chỉnh, kéo tên sang cột khác để chuyển.`),
      btn('Thêm nhiều người', () => addPeople(ctx), {ghost: true, sm: 1, icon: 'plus', cls: 'wr-t-add'})),
    all.length ? h('div', {class: 'wr-depts'}, cols.map(column)) : h('div', {class: 'wr-empty'}, 'Chưa có ai. Gõ tên vào ô “+ Thêm tên” ở từng cột, hoặc bấm “Thêm nhiều người” để dán cả danh sách.', h('div', {class: 'wr-depts', style: 'margin-top:12px'}, cols.map(column))));
}

// ===================== HƯỚNG DẪN =====================
export const TEAM_TOUR = ctx => [
  {el: '.wr-ph-tabs', title: 'Phân công có 2 phần', text: '“Đội ngũ”: ai thuộc bộ phận nào. “Lịch tuần”: lịch công tác gửi nhóm — ở đó bấm “Chia lịch” để tự điền người.', place: 'bottom', before: () => { ctx.ui.ph = 'team'; ctx.render(); }},
  {el: '.wr-dept', title: 'Mỗi cột là 1 bộ phận', text: 'Content, Media, Biên tập… Khi chia lịch, ô Content sẽ bốc ngẫu nhiên 1 người ở cột Content, ô Media bốc ở cột Media…', place: 'right'},
  {el: '.wr-memadd', title: 'Thêm người', text: 'Gõ tên vào ô cuối cột rồi Enter. Muốn dán cả danh sách thì bấm “Thêm nhiều người”.', place: 'right'},
  {el: '.wr-mem', title: 'Chỉnh từng người', text: 'Bấm vào tên: chuyển bộ phận, làm thêm bộ phận, ghi ngày bận (sẽ không bị xếp ngày đó), tạm nghỉ, xoá. Hoặc kéo tên sang cột khác.', place: 'right'},
  {el: '.wr-ph-tabs', title: 'Chia lịch', text: 'Mở 1 lịch tuần → bấm “Chia lịch”. Mỗi ô có sẵn 1 người; đổi bằng ô chọn hoặc 🎲, rồi “Điền vào lịch”. Xem lại hướng dẫn: nút “Hướng dẫn” góc trên.', place: 'bottom'},
];
export const ASSIGN_TOUR = [
  {el: '.wr-t-assign', title: 'Chia lịch', text: 'Bấm để tự điền Content, Media, Biên tập cho mọi sự kiện — bốc ngẫu nhiên trong từng bộ phận. Xem, sửa, rồi mới điền vào lịch.', place: 'bottom'},
];
export {tour, tourDone};
