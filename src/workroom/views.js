// PHÒNG VY — WORKROOM · các màn hình: Hôm nay · từng loại việc · trình soạn theo mẫu · Chương trình · Xuất bản · Cài đặt.
// Nguyên tắc giao diện: tiếng Việt, ít chữ, mỗi màn một việc; nút chính luôn ở trên cùng; xem trước = đúng file sẽ xuất.
import {h, icon, btn, dialog, confirmBox, download, debounce, fmtDT, errBox, run, pickFile, menu, moreBtn, withMenu, ask} from './ui.js';
import {GROUPS, KINDS, groupOf, preview, DES, SCHED_FIELDS, SCRIPT_TYPES} from './kinds.js';
import {STATUS, statusTag, exportDialog, handoffDialog, saveGoogle, saveDrive, savePdf, pushDialog} from './out.js';
import {sourceBox, srcSummary} from './sources.js';
import {plain} from './fmt.js';
import {writeDoc, captionVariants, extractProgram} from './gen.js';
import {askKey, keyGuide, PROVIDERS, BACKUPS} from './ai.js';
import {teamView, assignDialog, TEAM_TOUR, ASSIGN_TOUR, tour, tourDone} from './team.js';

const S_ = v => String(v == null ? '' : v);
const ago = d => { if (!d) return ''; const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'vừa xong' : s < 3600 ? Math.floor(s / 60) + ' phút trước' : s < 86400 ? Math.floor(s / 3600) + ' giờ trước' : fmtDT(d); };
const evName = (store, id) => { const e = id && store.eventOf(id); return e ? e.name : ''; };
const docTitle = d => plain(d.title || KINDS[d.kind].titleOf(d.data || {}) || '').replace(/\s+/g, ' ').trim() || 'Chưa đặt tên';
// đường dẫn trong dữ liệu: "news[0].intro"
const keys = p => p.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
export const getP = (o, p) => keys(p).reduce((a, k) => a == null ? a : a[k], o);
export function setP(o, p, v) { const ks = keys(p); let a = o; ks.slice(0, -1).forEach((k, i) => { if (a[k] == null || typeof a[k] !== 'object') a[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[k]; }); a[ks[ks.length - 1]] = v; }

// ===================== VIỆC CHUNG: tạo, AI, xuất =====================
async function needAI(ctx) { if (ctx.ai.hasAny) return true; const ok = await askKey(ctx.ai); ctx.render(); return ok; }
// tạo mới theo MỤC (gid): chọn loại (nếu mục có nhiều loại) → thả nguồn → AI phân tích & dựng khung đúng mẫu
export async function newDocFlow(ctx, gid, o = {}) {
  const G = GROUPS.find(g => g.id === gid) || GROUPS.find(g => g.kinds.includes(gid)), S = ctx.store, ev = o.event_id ? S.eventOf(o.event_id) : null;
  let kind = G.kinds.includes(gid) ? gid : (o.kind || G.kinds[0]);
  const list = [], box = sourceBox(ctx, list, null, {rows: 3});
  const req = h('input', {class: 'wr-in', placeholder: 'Yêu cầu thêm (không bắt buộc) — vd “giọng sôi nổi”, “nhấn mạnh hạn đăng ký”', 'aria-label': 'Yêu cầu thêm'});
  const sel = h('select', {class: 'wr-in', 'aria-label': 'Thuộc chương trình'}, h('option', {value: ''}, 'Việc thường ngày'), S.events.filter(e => !e.archived).map(e => h('option', {value: e.id, selected: e.id === o.event_id}, 'Chương trình: ' + e.name)));
  const typeEl = gid === 'script' || G.id === 'script' ? (() => { const wrap = h('div', {class: 'wr-types'});
    const paintT = () => wrap.replaceChildren(...SCRIPT_TYPES.map(t => { const on = t.variants.some(v => v[0] === kind);
      return h('div', {class: 'wr-type' + (on ? ' on' : ''), role: 'button', tabIndex: 0, onclick: () => { if (!on) { kind = t.variants[0][0]; paintT(); } }}, h('b', {}, t.name), h('small', {}, t.desc),
        on && t.variants.length > 1 ? h('div', {class: 'wr-seg'}, t.variants.map(([k, l]) => h('button', {class: kind === k ? 'on' : '', onclick: e => { e.stopPropagation(); kind = k; paintT(); }}, l))) : null); }));
    paintT(); return wrap; })() : null;
  const v = await dialog({title: 'Tạo ' + (G.id === 'script' ? 'kịch bản' : KINDS[kind].name.toLowerCase()), wide: true, body: h('div', {class: 'wr-stack'}, typeEl,
      h('div', {class: 'wr-f'}, h('span', {}, 'Nguồn — AI đọc và dựng khung đúng mẫu cho bạn'), box), req, ev ? h('p', {class: 'wr-mute'}, 'Kèm thông tin chương trình “' + ev.name + '”.') : sel),
    buttons: [['Huỷ', null], ['Tạo trống', 'blank'], ['✨ Phân tích & dựng khung', 'ai', 'primary']]});
  if (!v) return null;
  box.flushText(); await new Promise(r => setTimeout(r, 30));
  const K = KINDS[kind], event_id = ev ? ev.id : sel.value || null, prog = event_id ? S.eventOf(event_id) : null;
  let data = K.blank();
  if (v === 'ai') {
    if (!await needAI(ctx)) return null;
    if (!list.length && !prog && !req.value.trim()) { ctx.note('Chưa có nguồn — tạo bản trống để bạn điền.'); }
    else {
      ctx.busy('AI đang đọc nguồn và dựng ' + K.short.toLowerCase() + ' theo mẫu…');
      try { data = await writeDoc(ctx, kind, {sources: list, program: prog, instruction: req.value.trim(), current: data}); }
      catch (e) { ctx.busy(null); if (!await confirmBox('AI chưa dựng được', e.message + '\n\nVẫn tạo bản trống (giữ nguồn)?', 'Tạo bản trống')) return null; }
      ctx.busy(null);
    }
  }
  const d = await S.createDoc(kind, data, {event_id, title: plain(K.titleOf(data) || ''), label: K.short});
  if (list.length) await S.saveDoc(d.id, {sources: list}, {silent: true});
  ctx.go({screen: 'doc', id: d.id}); return d;
}
// giữ cho Trợ lý: 'drive' = bản Google Docs/Sheets (để chia sẻ, góp ý); 'file' = file gốc; 'download' = tải về
export async function exportDoc(ctx, doc, to) {
  if (to === 'download') { const {toFile, fileName} = await import('./kinds.js'); download(await toFile(doc.kind, doc.data || {}, doc.sources || []), fileName(doc.kind, doc)); return null; }
  return to === 'file' ? saveDrive(ctx, doc) : saveGoogle(ctx, doc);
}

// ===================== HÔM NAY =====================
const TILE = {script: 'Bản tin thời sự hoặc video', caption: 'Đăng Facebook + nội dung DES', article: 'Tin bài web / Facebook', schedule: 'Lịch công tác tuần, phân người', timeline: 'Kế hoạch truyền thông (Excel)'};
const dueTag = d => { const t = d.handoff && d.handoff.deadline; if (!t) return null; const ms = new Date(t) - Date.now(), late = ms < 0;
  return h('span', {class: 'wr-tag ' + (late ? 'late' : ms < 864e5 ? 'warn' : '')}, (late ? 'Quá hạn ' : 'Hạn ') + new Date(t).toLocaleString('vi-VN', {hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'})); };
export function home(ctx) {
  const S = ctx.store, recent = S.docs.slice(0, 6), progs = S.events.filter(e => !e.archived).slice(0, 4);
  const due = S.docs.filter(d => d.handoff && d.handoff.deadline && !['approved', 'published'].includes(d.status)).sort((a, b) => a.handoff.deadline.localeCompare(b.handoff.deadline)).slice(0, 5);
  const setup = [!ctx.ai.hasAny && h('div', {class: 'wr-banner'}, icon('spark'), 'Chưa bật AI. ', btn('Bật AI (1 phút)', async () => { await askKey(ctx.ai); ctx.render(); }, {sm: 1}))].filter(Boolean);
  return h('div', {class: 'wr-wrap'}, ...setup,
    h('div', {class: 'wr-h'}, h('h2', {}, 'Hôm nay làm gì?')),
    h('div', {class: 'wr-tiles'}, GROUPS.map(g => h('button', {class: 'wr-tile', onclick: () => newDocFlow(ctx, g.id)}, icon(g.icon), g.id === 'schedule' ? 'Phân công (lịch tuần)' : g.name, h('small', {}, TILE[g.id])))),
    due.length ? h('div', {}, h('div', {class: 'wr-sec'}, 'Sắp đến hạn'), due.map(d => docItem(ctx, d))) : null,
    h('div', {class: 'wr-sec'}, 'Làm tiếp'),
    recent.length ? recent.map(d => docItem(ctx, d)) : h('div', {class: 'wr-empty'}, 'Chưa có tài liệu nào. Bấm một ô ở trên để bắt đầu.'),
    h('div', {class: 'wr-sec'}, 'Chương trình lớn'),
    progs.length ? progs.map(e => progItem(ctx, e)) : h('button', {class: 'wr-add', onclick: () => newProgram(ctx)}, '+ Tạo chương trình lớn'));
}
const clickable = (onOpen, attrs = {}) => ({class: 'wr-item', role: 'button', tabIndex: 0, onclick: onOpen, onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(); }, ...attrs});
function docItem(ctx, d) {
  const ev = evName(ctx.store, d.event_id), items = () => docMenu(ctx, d);
  return withMenu(h('div', clickable(() => ctx.go({screen: 'doc', id: d.id}), {'aria-label': docTitle(d)}), icon(groupOf(d.kind).icon), h('span', {class: 't'}, docTitle(d)),
    h('span', {class: 'wr-tag'}, KINDS[d.kind].short), ev && h('span', {class: 'wr-tag prog'}, ev), d.stale && h('span', {class: 'wr-tag warn'}, 'Cần xem lại'),
    statusTag(d.status), dueTag(d), h('span', {class: 'm'}, ago(d.updated_at)), moreBtn(items)), items);
}
// ---------- thao tác nhanh trên 1 tài liệu (⋯ / chuột phải) ----------
const TITLE_PATH = {news_tv: 'title', news_en: 'title', video: 'title', caption: 'title', article: 'title', timeline: 'title', schedule: 'week'};
export async function renameDoc(ctx, d) {
  const p = TITLE_PATH[d.kind], v = await ask('Đổi tên', d.kind === 'schedule' ? 'Tuần số' : 'Tên mới', S_(getP(d.data || {}, p)));
  if (v == null || !v) return; const data = JSON.parse(JSON.stringify(d.data || {})); setP(data, p, d.kind === 'timeline' && !/^TIMELINE/i.test(v) ? v : v);
  hist(ctx, d.id).push(d.data, null, true); await ctx.store.saveDoc(d.id, {data, title: plain(KINDS[d.kind].titleOf(data) || '')}); ctx.note('Đã đổi tên');
}
export async function duplicateDoc(ctx, d, o = {}) {
  const K = KINDS[d.kind], data = JSON.parse(JSON.stringify(d.data || {})), p = TITLE_PATH[d.kind];
  if (p !== 'week') setP(data, p, S_(getP(data, p)) + ' (bản sao)');
  const n = await ctx.store.createDoc(d.kind, data, {event_id: o.event_id !== undefined ? o.event_id : d.event_id, title: plain(K.titleOf(data) || ''), label: K.short + ' (bản sao)'});
  if ((d.sources || []).length) await ctx.store.saveDoc(n.id, {sources: d.sources}, {silent: true});
  ctx.note('Đã nhân bản'); return n;
}
export async function moveDoc(ctx, d) {
  const S = ctx.store, sel = h('select', {class: 'wr-in', 'aria-label': 'Chuyển tới'}, h('option', {value: ''}, 'Việc thường ngày'), S.events.filter(e => !e.archived).map(e => h('option', {value: e.id, selected: e.id === d.event_id}, 'Chương trình: ' + e.name)));
  const v = await dialog({title: 'Chuyển tài liệu', body: sel, buttons: [['Huỷ', null], ['Chuyển', () => sel.value || '__none', 'primary']]});
  if (v == null) return; await S.saveDoc(d.id, {event_id: v === '__none' ? null : v}); ctx.note(v === '__none' ? 'Đã chuyển về việc thường ngày' : 'Đã chuyển vào chương trình');
}
export async function deleteDoc(ctx, d, after) {
  if (!await confirmBox('Xoá tài liệu', `Xoá “${docTitle(d)}” khỏi Workroom? Bản đã lưu trên Google Drive (nếu có) vẫn giữ nguyên.`, 'Xoá', true)) return;
  await ctx.store.del('docs', d.id, {log: 'Xoá ' + KINDS[d.kind].short + ': ' + docTitle(d)}); ctx.note('Đã xoá'); after && after();
}
export function docMenu(ctx, d) {
  const S = ctx.store;
  return [{label: 'Mở', icon: 'ext', run: () => ctx.go({screen: 'doc', id: d.id})}, {label: 'Đổi tên', icon: 'pen', run: () => renameDoc(ctx, d)},
    {label: 'Nhân bản', icon: 'copy', run: async () => { const n = await duplicateDoc(ctx, d); ctx.go({screen: 'doc', id: n.id}); }},
    {label: d.event_id ? 'Chuyển chương trình / về việc thường ngày' : 'Đưa vào chương trình…', icon: 'flag', run: () => moveDoc(ctx, d)}, '-', {head: 'Trạng thái'},
    ...STATUS.map(([k, l]) => ({label: l, on: d.status === k, run: () => S.saveDoc(d.id, {status: k})})), '-',
    {label: 'Xuất…', icon: 'down', kbd: '⌘⇧E', run: () => exportDialog(ctx, d)}, {label: 'Đẩy lên Google…', icon: 'drive', kbd: '⌘⇧G', run: () => pushDialog(ctx, d).catch(e => ctx.note(e.message))}, {label: 'Bàn giao…', icon: 'send', kbd: '⌘⇧B', run: () => handoffDialog(ctx, d)},
    d.gdoc && d.gdoc.url && {label: 'Mở bản Google', icon: 'ext', run: () => window.open(d.gdoc.url, '_blank', 'noopener')},
    {label: 'Sao chép link Google', icon: 'link', disabled: !(d.gdoc && d.gdoc.url), run: () => navigator.clipboard.writeText(d.gdoc.url).then(() => ctx.note('Đã sao chép link'))}, '-',
    {label: 'Xoá', icon: 'trash', danger: true, run: () => deleteDoc(ctx, d, () => { if (ctx.view.screen === 'doc' && ctx.view.id === d.id) ctx.go(d.event_id ? {screen: 'program', id: d.event_id} : {screen: 'group', id: groupOf(d.kind).id}); })}];
}
export function progMenu(ctx, e) {
  const S = ctx.store;
  return [{label: 'Mở', icon: 'ext', run: () => ctx.go({screen: 'program', id: e.id})}, {label: 'Đổi tên', icon: 'pen', run: async () => { const v = await ask('Đổi tên chương trình', 'Tên mới', e.name); if (v) await S.updateEvent(e.id, {name: v}); }}, '-', {head: 'Tạo cho chương trình'},
    ...GROUPS.map(g => ({label: (g.id === 'script' ? 'Kịch bản' : g.name), icon: g.icon, run: () => newDocFlow(ctx, g.id, {event_id: e.id})})), '-',
    {label: 'Lưu trữ (ẩn)', icon: 'down', run: async () => { await S.updateEvent(e.id, {archived: true}); ctx.note('Đã lưu trữ'); }},
    {label: 'Xoá chương trình', icon: 'trash', danger: true, run: async () => { if (!await confirmBox('Xoá chương trình', `Xoá “${e.name}”? Các tài liệu bên trong KHÔNG bị xoá — chúng chuyển về việc thường ngày.`, 'Xoá', true)) return; await S.del('events', e.id, {log: 'Xoá chương trình: ' + e.name}); for (const d of S.docs.filter(x => x.event_id === e.id)) d.event_id = null; if (ctx.view.screen === 'program') ctx.go({screen: 'programs'}); else ctx.render(); }}];
}

// ===================== DANH SÁCH THEO LOẠI (việc thường ngày) =====================
export function group(ctx, gid) {
  const G = GROUPS.find(g => g.id === gid), S = ctx.store, U = ctx.ui[gid] ||= {f: 'all'};
  const TABS = G.tabs || G.kinds.filter(k => !KINDS[k].hidden).map(k => [k, KINDS[k].short, [k]]);
  const all = S.docs.filter(d => G.kinds.includes(d.kind) && !d.event_id), list = all.filter(d => U.f === 'all' || ((TABS.find(t => t[0] === U.f) || [])[2] || [U.f]).includes(d.kind));
  if (gid === 'schedule') {
    const tab = ctx.ui.ph || 'docs', guide = () => tour(S, 'team2', TEAM_TOUR(ctx), {force: true});
    if (!tourDone(S, 'team2') && !ctx.ui.tourTeam && (ctx.ui.tourTeam = 1)) setTimeout(() => { if (document.querySelector('.wr-ph-tabs')) { ctx.ui.ph = 'team'; ctx.render(); setTimeout(() => tour(S, 'team2', TEAM_TOUR(ctx)), 120); } }, 350);
    return h('div', {class: 'wr-wrap wide'},
      h('div', {class: 'wr-h'}, h('h2', {}, G.name), h('div', {class: 'wr-tabs wr-ph-tabs', role: 'tablist', style: 'margin:0 0 0 14px'},
          [['docs', 'Lịch tuần', all.length], ['team', 'Đội ngũ', (S.staff || []).filter(p => p.active !== false).length]].map(([k, l, n]) => h('button', {role: 'tab', 'aria-selected': String(tab === k), class: tab === k ? 'on' : '', onclick: () => { ctx.ui.ph = k; ctx.render(); }}, l, h('em', {}, n)))),
        h('span', {class: 'sp'}), btn('Hướng dẫn', guide, {ghost: true, sm: 1, icon: 'book', title: 'Xem lại hướng dẫn mục Phân công'}),
        tab === 'docs' && btn('+ Tạo lịch tuần', () => newDocFlow(ctx, gid))),
      tab === 'team' ? teamView(ctx) : list.length ? list.map(d => docItem(ctx, d)) : h('div', {class: 'wr-empty'}, 'Chưa có lịch tuần. Bấm “+ Tạo lịch tuần” — dán lịch nhận được, AI dựng đúng mẫu rồi bấm “Chia lịch”.'));
  }
  return h('div', {class: 'wr-wrap'},
    h('div', {class: 'wr-h'}, h('h2', {}, G.name), h('span', {class: 'sp'}), btn('+ Tạo ' + (gid === 'script' ? 'kịch bản' : G.name.toLowerCase()), () => newDocFlow(ctx, gid))),
    TABS.length > 1 && h('div', {class: 'wr-tabs'}, [['all', 'Tất cả'], ...TABS].map(([k, l]) => h('button', {class: U.f === k ? 'on' : '', onclick: () => { U.f = k; ctx.render(); }}, l))),
    list.length ? list.map(d => docItem(ctx, d)) : h('div', {class: 'wr-empty'}, 'Chưa có. Bấm nút + ở trên để tạo — AI sẽ viết theo đúng mẫu của phòng.'),
    S.docs.some(d => G.kinds.includes(d.kind) && d.event_id) && h('p', {class: 'wr-mute', style: 'margin-top:12px'}, 'Tài liệu thuộc chương trình lớn nằm trong mục Chương trình.'));
}

// ===================== TRÌNH SOẠN =====================
export function editor(ctx, id) {
  const S = ctx.store, doc = S.doc(id);
  if (!doc) return h('div', {class: 'wr-wrap'}, h('div', {class: 'wr-empty'}, 'Không tìm thấy tài liệu.'), btn('← Về Hôm nay', () => ctx.go({screen: 'home'})));
  const K = KINDS[doc.kind], D = doc.data = doc.data || K.blank(), err = errBox();
  const pvBox = h('div', {class: 'pv'}), pvWrap = h('div', {class: 'wr-pv'}, h('div', {class: 'wr-pv-bar'}, 'Xem trước — đúng định dạng file sẽ xuất (' + K.ext + ')'), pvBox);
  // trang giấy vẽ đúng khổ thật (A4 dọc 794px / ngang 1123px, lề 2,54 cm) rồi thu nhỏ cho vừa khung
  const fit = () => { const W = pvBox.classList.contains('land') ? 1123 : 794, avail = pvWrap.clientWidth - 32; if (avail > 50) pvBox.style.zoom = Math.min(1, avail / W).toFixed(3); };
  const paint = () => { try { const p = preview(doc.kind, D, doc.sources || []); pvBox.className = 'pv' + (p.land ? ' land' : ''); pvBox.innerHTML = p.html; fit(); } catch (e) { pvBox.textContent = 'Lỗi xem trước: ' + e.message; } };
  new ResizeObserver(fit).observe(pvWrap);
  const persist = () => S.saveDoc(doc.id, {data: D, title: plain(K.titleOf(D) || '')}, {silent: true}).catch(e => { err.textContent = 'Chưa lưu được: ' + e.message; });
  const save = debounce(persist, 700), repaint = debounce(paint, 200);
  ctx.ui.flush = () => save.flush();
  const Hs = hist(ctx, doc.id);
  const E = {
    D, doc, ctx: {aiPart: instr => aiApply(ctx, doc, instr).catch(e => ctx.note(e.message))},
    get: p => getP(D, p),
    set(p, v) { Hs.push(D, p); setP(D, p, v); doc.title = plain(K.titleOf(D) || ''); save(); repaint(); },
    change(fn) { Hs.push(D, null); fn(D); save.flush(); ctx.render(); },   // thay đổi cấu trúc (thêm/xoá/đổi chỗ) → lưu ngay + vẽ lại
  };
  // phím tắt của trình soạn (index.js gọi qua ctx.ui)
  const step = dir => { const x = dir < 0 ? Hs.undo(D) : Hs.redo(D); if (!x) return ctx.note(dir < 0 ? 'Không còn gì để hoàn tác' : 'Không còn gì để làm lại'); doc.data = x; S.saveDoc(doc.id, {data: x, title: plain(K.titleOf(x) || '')}, {silent: true}); ctx.render(); };
  ctx.ui.push = () => pushDialog(ctx, doc).catch(e => { err.textContent = e.message; });
  Object.assign(ctx.ui, {undo: () => step(-1), redo: () => step(1), exportMenu: () => exportDialog(ctx, doc), handoff: () => handoffDialog(ctx, doc), aiWrite: () => aiWrite(ctx, doc),
    download: () => exportDoc(ctx, doc, 'download'), toDrive: run(err, async () => { const u = await saveGoogle(ctx, doc); if (u) ctx.note('Đã cập nhật bản Google'); }), pdf: run(err, () => savePdf(ctx, doc))});
  paint();
  if (doc.kind === 'schedule' && !tourDone(S, 'assign2') && !ctx.ui.tourAssign && (ctx.ui.tourAssign = 1)) setTimeout(() => document.querySelector('.wr-t-assign') && tour(S, 'assign2', ASSIGN_TOUR), 400);
  const ev = doc.event_id && S.eventOf(doc.event_id);
  const acts = h('div', {class: 'wr-row wr-toolbar'},
    btn('✨ AI viết', () => aiWrite(ctx, doc), {title: 'AI viết / sửa (⌘⇧A)'}), doc.kind === 'caption' && btn('3 phương án', () => capVariants(ctx, doc), {ghost: true}),
    doc.kind === 'schedule' && btn('Chia lịch', run(err, () => assignDialog(ctx, S.doc(doc.id) || doc, {apply: (data, label) => applyData(ctx, doc, data, label)})), {ghost: true, icon: 'users', cls: 'wr-t-assign', title: 'Bốc ngẫu nhiên người trong từng bộ phận cho mọi sự kiện'}),
    h('button', {class: 'wr-x', title: 'Hoàn tác (⌘Z)', 'aria-label': 'Hoàn tác', disabled: !Hs.canUndo(), onclick: () => step(-1)}, icon('undo')),
    h('button', {class: 'wr-x', title: 'Làm lại (⌘⇧Z)', 'aria-label': 'Làm lại', disabled: !Hs.canRedo(), onclick: () => step(1)}, icon('redo')),
    h('select', {class: 'wr-in wr-status st-' + doc.status, style: 'width:auto', 'aria-label': 'Trạng thái', onchange: run(err, async e => { await S.saveDoc(doc.id, {status: e.target.value}); })}, STATUS.map(([k, l]) => h('option', {value: k, selected: doc.status === k}, l))),
    h('span', {class: 'sp', style: 'flex:1'}),
    btn('Lịch sử', () => history(ctx, doc), {ghost: true, icon: 'clock'}),
    btn('Xuất', () => exportDialog(ctx, doc), {ghost: true, icon: 'down', title: 'Tải Word/Excel/PDF, sao chép để đăng (⌘⇧E)'}),
    btn('Đẩy lên Google', () => pushDialog(ctx, doc).catch(e => { err.textContent = e.message; }), {ghost: true, icon: 'drive', title: 'Google Docs/Sheets, Word/Excel, PDF vào thư mục bạn chọn (⌘⇧G)'}),
    btn('Bàn giao', () => handoffDialog(ctx, doc), {icon: 'send', cls: 'dark', title: 'Gửi duyệt, hạn nộp, góp ý'}), moreBtn(() => edMenu()),
    doc.gdoc && doc.gdoc.url && h('a', {class: 'wr-btn ghost', href: doc.gdoc.url, target: '_blank', rel: 'noopener', title: 'Mở bản Google'}, icon('ext'), doc.kind === 'timeline' ? 'Sheets' : 'Docs'));
  const edMenu = () => [...docMenu(ctx, doc).filter(Boolean).filter(x => x === '-' || x.head || !/^Mở$/.test(x.label)).slice(0, 4), '-',
    {label: 'Hoàn tác', icon: 'undo', kbd: '⌘Z', disabled: !Hs.canUndo(), run: () => step(-1)}, {label: 'Làm lại', icon: 'redo', kbd: '⌘⇧Z', disabled: !Hs.canRedo(), run: () => step(1)},
    {label: 'Lịch sử bản', icon: 'clock', run: () => history(ctx, doc)}, '-',
    {label: 'Tải file đúng mẫu', icon: 'down', kbd: '⌘⇧D', run: () => exportDoc(ctx, doc, 'download')}, {label: 'Xuất PDF', icon: 'doc', kbd: '⌘P', run: () => savePdf(ctx, doc).catch(e => ctx.note(e.message))},
    {label: 'Cập nhật bản Google', icon: 'drive', kbd: '⌘⇧S', run: () => saveGoogle(ctx, doc).then(u => u && ctx.note('Đã cập nhật bản Google')).catch(e => ctx.note(e.message))}, '-',
    {label: 'Bỏ hết nguồn đã nạp', icon: 'x', disabled: !(doc.sources || []).length, run: async () => { if (await confirmBox('Bỏ nguồn', 'Bỏ tất cả nguồn đã nạp của tài liệu này?', 'Bỏ')) await S.saveDoc(doc.id, {sources: []}); }},
    {label: 'Phím tắt', icon: 'list', kbd: '⌘/', run: () => ctx.showKeys && ctx.showKeys()}, '-',
    {label: 'Xoá tài liệu', icon: 'trash', danger: true, run: () => deleteDoc(ctx, doc, () => ctx.go(ev ? {screen: 'program', id: ev.id} : {screen: 'group', id: groupOf(doc.kind).id}))}];
  const SB = (doc.sources || []).slice(), srcEl = sourceBox(ctx, SB, async L => { await S.saveDoc(doc.id, {sources: L.slice()}, {silent: true}); doc.sources = L.slice(); paint(); }, {rows: 2});
  const srcFold = Fold('Nguồn' + (SB.length ? ' (' + SB.length + ')' : '') + ' — thả thêm tài liệu, ảnh để AI dựng / bổ sung', !SB.length && !asTextLen(doc), srcEl,
    h('div', {class: 'wr-row'}, btn('✨ Dựng lại từ nguồn', run(err, () => aiApply(ctx, doc, 'Đọc kỹ toàn bộ NGUỒN, dựng lại tài liệu hoàn chỉnh theo đúng mẫu.', {fresh: true})), {sm: 1}),
      btn('✨ Bổ sung từ nguồn mới', run(err, () => aiApply(ctx, doc, 'Bổ sung vào bản hiện tại những thông tin mới có trong NGUỒN; giữ nguyên phần đã có.')), {ghost: true, sm: 1})));
  const form = ({news_tv: d => formNews(E, false), news_en: d => formNews(E, true), video: formVideo, caption: formCaption, article: formArticle, schedule: formSchedule, timeline: formTimeline})[doc.kind](E);
  return h('div', {class: 'wr-wrap wide'},
    h('div', {class: 'wr-h'}, h('button', {class: 'wr-x', title: 'Quay lại', 'aria-label': 'Quay lại', onclick: () => ctx.go(ev ? {screen: 'program', id: ev.id} : {screen: 'group', id: groupOf(doc.kind).id})}, '←'),
      withMenu(h('h2', {title: 'Chuột phải để xem thao tác', tabIndex: 0, ondblclick: () => renameDoc(ctx, doc)}, docTitle(doc)), () => edMenu()), h('span', {class: 'wr-tag'}, K.name), ev && h('span', {class: 'wr-tag prog'}, ev.name), dueTag(doc)),
    acts, err, doc.stale && h('div', {class: 'wr-banner', style: 'margin-top:12px'}, icon('warn'), 'Thông tin chương trình đã thay đổi sau khi viết bài này.',
      btn('AI cập nhật theo chương trình', run(err, () => aiApply(ctx, doc, 'Cập nhật mọi dữ kiện (tên, ngày, giờ, địa điểm, thành phần…) cho khớp THÔNG TIN CHƯƠNG TRÌNH mới; giữ nguyên phần còn lại.', {clearStale: true})), {sm: 1}),
      btn('Bỏ qua', run(err, () => S.saveDoc(doc.id, {stale: false})), {ghost: true, sm: 1})),
    h('div', {class: 'wr-ed' + (doc.kind === 'timeline' ? ' one' : ''), style: 'margin-top:14px'}, h('div', {class: 'wr-form'}, srcFold, form), pvWrap));
}
// áp kết quả AI vào tài liệu: lưu phiên bản cũ trước (để Hoàn tác / Lịch sử)
export async function applyData(ctx, doc, data, label, extra = {}) {
  hist(ctx, doc.id).push((ctx.store.doc(doc.id) || doc).data, null, true);
  await ctx.store.snapshot(doc, 'Trước khi: ' + label);
  const K = KINDS[doc.kind];
  await ctx.store.saveDoc(doc.id, {data, title: plain(K.titleOf(data) || ''), ...extra});
  await ctx.store.log('doc.ai', `${label}: ${docTitle({...doc, data, title: ''})}`, doc.event_id || null, {id: doc.id});
}
async function aiApply(ctx, doc, instruction, o = {}) {
  if (!await needAI(ctx)) return;
  ctx.busy('AI đang sửa…');
  doc = ctx.store.doc(doc.id) || doc;
  try { const data = await writeDoc(ctx, doc.kind, {current: o.fresh ? KINDS[doc.kind].blank() : doc.data, instruction, sources: doc.sources || [], program: doc.event_id && ctx.store.eventOf(doc.event_id), brief: doc.data._brief || ''});
    await applyData(ctx, doc, data, 'AI sửa', o.clearStale ? {stale: false} : {}); ctx.note('Đã sửa. Muốn quay lại: bấm Lịch sử.'); }
  finally { ctx.busy(null); }
}
async function aiWrite(ctx, doc) {
  if (!await needAI(ctx)) return;
  const K = KINDS[doc.kind], ta = h('textarea', {class: 'wr-in', rows: 6, placeholder: 'Ví dụ: “viết lại phần mở đầu gọn hơn”, “thêm tin về lễ ký kết MOU hôm 5/11”, hoặc dán thêm tư liệu…', 'aria-label': 'Yêu cầu cho AI'});
  const src = h('textarea', {class: 'wr-in', rows: 3, placeholder: 'Tư liệu thêm (không bắt buộc) — nguồn đã nạp (' + ((doc.sources || []).length) + ') luôn được gửi kèm', 'aria-label': 'Tư liệu'}); src.value = doc.data._brief || '';
  const opts = doc.kind === 'caption' ? capOpts(doc.data) : null;
  const v = await dialog({title: '✨ AI viết ' + K.short.toLowerCase(), wide: false, body: h('div', {class: 'wr-stack'}, h('label', {class: 'wr-f'}, h('span', {}, 'Bạn muốn AI làm gì?'), ta), h('label', {class: 'wr-f'}, h('span', {}, 'Tư liệu'), src), opts && opts.el,
    h('p', {class: 'wr-mute'}, 'AI viết đúng cấu trúc mẫu, chỗ thiếu dữ kiện sẽ ghi [CẦN BỔ SUNG]. Bản cũ được giữ trong Lịch sử.')),
    buttons: [['Huỷ', null], ['Viết', 'go', 'primary']]});
  if (!v) return;
  doc.data._brief = src.value.trim();
  if (opts) doc.data.opts = opts.get();
  ctx.busy('AI đang viết theo mẫu…');
  try { const data = await writeDoc(ctx, doc.kind, {current: doc.data, instruction: ta.value.trim(), brief: src.value.trim(), sources: doc.sources || [], program: doc.event_id && ctx.store.eventOf(doc.event_id), opts: opts && opts.get()});
    await applyData(ctx, doc, {...data, _brief: src.value.trim(), ...(opts ? {opts: opts.get()} : {})}, 'AI viết'); ctx.note('AI đã viết xong — kiểm tra các chỗ [CẦN BỔ SUNG].'); }
  catch (e) { ctx.note(e.message); } finally { ctx.busy(null); }
}
function capOpts(d) {
  const o = {...{tone: 'trang trọng, truyền cảm hứng', length: 'vừa', emoji: 'mỗi đoạn 1 emoji', extra: '', des: ''}, ...(d.opts || {})};
  const sel = (k, label, list) => h('label', {class: 'wr-f'}, h('span', {}, label), h('select', {class: 'wr-in', 'aria-label': label, onchange: e => { o[k] = e.target.value; }}, list.map(x => h('option', {value: x, selected: x === o[k]}, x))));
  const el = h('div', {class: 'wr-stack'}, h('div', {class: 'wr-f3'}, sel('tone', 'Giọng văn', ['trang trọng, truyền cảm hứng', 'thân thiện, gần gũi sinh viên', 'sôi nổi, trẻ trung', 'trang nghiêm (tin chính thức)']),
    sel('length', 'Độ dài', ['ngắn (2–3 đoạn)', 'vừa', 'dài (6–8 đoạn)']), sel('emoji', 'Emoji', ['mỗi đoạn 1 emoji', 'ít emoji', 'không emoji'])),
    h('label', {class: 'wr-row'}, h('input', {type: 'checkbox', checked: !!d.withDes, onchange: e => { d.withDes = e.target.checked; o.des = e.target.checked ? 'có — viết thêm phần NỘI DUNG DES cho thiết kế' : ''; }}), 'Kèm “Nội dung DES” cho thiết kế'),
    h('label', {class: 'wr-f'}, h('span', {}, 'Yêu cầu thêm (hashtag, lời kêu gọi…)'), h('input', {class: 'wr-in', value: o.extra, 'aria-label': 'Yêu cầu thêm', oninput: e => { o.extra = e.target.value; }})));
  if (d.withDes) o.des = 'có — viết thêm phần NỘI DUNG DES cho thiết kế';
  return {el, get: () => ({...o})};
}
async function capVariants(ctx, doc) {
  if (!await needAI(ctx)) return;
  const opts = capOpts(doc.data), src = h('textarea', {class: 'wr-in', rows: 4, placeholder: 'Tư liệu (thông báo, nội dung chương trình…)', 'aria-label': 'Tư liệu'}); src.value = doc.data._brief || '';
  if (!await dialog({title: '3 phương án caption', body: h('div', {class: 'wr-stack'}, src, opts.el), buttons: [['Huỷ', null], ['Viết 3 phương án', true, 'primary']]})) return;
  ctx.busy('AI đang viết 3 phương án…'); let vs;
  try { vs = await captionVariants(ctx, {current: doc.data, brief: src.value.trim(), sources: doc.sources || [], program: doc.event_id && ctx.store.eventOf(doc.event_id), opts: opts.get()}); } catch (e) { ctx.busy(null); return ctx.note(e.message); }
  ctx.busy(null);
  const pick = await dialog({title: 'Chọn 1 phương án', wide: true, body: h('div', {class: 'wr-variants'}, vs.map((v, i) => { const p = preview('caption', v); return h('div', {class: 'wr-variant'}, h('b', {}, 'Phương án ' + (i + 1)), h('div', {class: 'pv', html: p.html})); })),
    buttons: [['Huỷ', null], ...vs.map((v, i) => ['Dùng phương án ' + (i + 1), i, 'primary'])]});
  if (pick == null) return;
  await applyData(ctx, doc, {...vs[pick], _brief: src.value.trim(), opts: opts.get()}, 'Chọn phương án caption'); ctx.note('Đã dùng phương án ' + (pick + 1));
}
async function history(ctx, doc) {
  const vs = await ctx.store.versions(doc.id);
  const v = await dialog({title: 'Lịch sử bản', body: done => vs.length ? h('div', {class: 'wr-stack'}, vs.slice(0, 30).map(x => h('div', {class: 'wr-item'}, h('span', {class: 't'}, x.label || 'Bản lưu'), h('span', {class: 'm'}, fmtDT(x.created_at)),
    h('button', {class: 'wr-btn ghost sm', onclick: () => done(x.id)}, 'Quay về bản này')))) : h('div', {class: 'wr-empty'}, 'Chưa có bản cũ. Mỗi lần AI viết/sửa, bản trước được giữ ở đây.'), buttons: [['Đóng', null]]});
  const x = v && vs.find(y => y.id === v); if (!x) return;
  await applyData(ctx, doc, x.data, 'Quay về bản cũ'); ctx.note('Đã quay về bản ' + fmtDT(x.created_at));
}
// ---------- hoàn tác / làm lại theo từng tài liệu (cả thay đổi tay lẫn AI) ----------
export function hist(ctx, id) {
  const all = ctx.ui.hist ||= {}, H = all[id] ||= {past: [], fut: [], at: 0, path: ''};
  return {
    push(D, path, force) { const t = Date.now(); if (!force && path && path === H.path && t - H.at < 1500) { H.at = t; return; } H.past.push(JSON.stringify(D)); if (H.past.length > 200) H.past.shift(); H.fut = []; H.at = t; H.path = path || ''; },
    undo(D) { if (!H.past.length) return null; H.fut.push(JSON.stringify(D)); H.path = ''; return JSON.parse(H.past.pop()); },
    redo(D) { if (!H.fut.length) return null; H.past.push(JSON.stringify(D)); H.path = ''; return JSON.parse(H.fut.pop()); },
    canUndo: () => H.past.length > 0, canRedo: () => H.fut.length > 0,
  };
}
const asTextLen = doc => JSON.stringify(doc.data || {}).replace(/[\s"{}\[\],:]|null|true|false/g, '').length > 400;
// ---------- ô nhập gắn với dữ liệu ----------
const rowsOf = (v, min) => Math.min(16, Math.max(min, S_(v).split('\n').length + Math.floor(S_(v).length / 70)));
function F(E, label, path, o = {}) {
  const v = S_(E.get(path)), aria = label + ' · ' + path;
  const el = o.area ? h('textarea', {class: 'wr-in', rows: rowsOf(v, o.rows || 2), 'aria-label': aria, placeholder: o.ph || '', oninput: e => { E.set(path, e.target.value); }}) : h('input', {class: 'wr-in', 'aria-label': aria, placeholder: o.ph || '', oninput: e => E.set(path, e.target.value)});
  el.value = v;
  return h('label', {class: 'wr-f' + (o.cls ? ' ' + o.cls : '')}, label && h('span', {}, label), el);
}
const Box = (title, ...kids) => h('section', {class: 'wr-box'}, h('h4', {}, title), ...kids);
const Fold = (title, open, ...kids) => h('details', {class: 'wr-box', open}, h('summary', {}, title), ...kids);
function List(E, path, {title, item, add, addLabel, min = 0}) {
  const a = E.get(path) || [];
  const mv = (i, d) => E.change(D => { const L = getP(D, path); const [x] = L.splice(i, 1); L.splice(i + d, 0, x); });
  const items = (x, i) => [{label: 'Đưa lên', icon: 'up', disabled: i === 0, run: () => mv(i, -1)}, {label: 'Đưa xuống', icon: 'down', disabled: i === a.length - 1, run: () => mv(i, 1)},
    {label: 'Nhân bản mục', icon: 'copy', run: () => E.change(D => { const L = getP(D, path); L.splice(i + 1, 0, JSON.parse(JSON.stringify(L[i]))); })},
    {label: 'Chèn mục mới bên dưới', icon: 'plus', run: () => E.change(D => getP(D, path).splice(i + 1, 0, add()))},
    E.ctx && typeof x === 'object' && {label: '✨ AI viết lại mục này', icon: 'spark', run: async () => { const req = await ask('AI viết lại mục ' + title(x, i), 'Yêu cầu (vd: gọn hơn, trang trọng hơn)', ''); if (req != null) E.ctx.aiPart(`Chỉ viết lại mục "${title(x, i)}" (đường dẫn ${path}[${i}]) theo yêu cầu: ${req || 'hay hơn, đúng văn phong mẫu'}. Giữ nguyên mọi phần khác.`); }}, '-',
    {label: 'Xoá mục', icon: 'trash', danger: true, disabled: a.length <= min, run: () => E.change(D => getP(D, path).splice(i, 1))}];
  return h('div', {class: 'wr-stack'}, a.map((x, i) => withMenu(h('div', {class: 'wr-li'}, h('header', {}, h('b', {}, title(x, i)),
      i > 0 && h('button', {class: 'wr-x', title: 'Lên', 'aria-label': 'Đưa lên', onclick: () => mv(i, -1)}, icon('up')), i < a.length - 1 && h('button', {class: 'wr-x', title: 'Xuống', 'aria-label': 'Đưa xuống', onclick: () => mv(i, 1)}, icon('down')),
      moreBtn(() => items(x, i))), ...item(`${path}[${i}]`, x, i)), () => items(x, i))),
    h('button', {class: 'wr-add', onclick: () => E.change(D => { if (!getP(D, path)) setP(D, path, []); getP(D, path).push(add()); })}, '+ ' + addLabel));
}
// đoạn văn = mảng chuỗi, mỗi đoạn 1 ô
function Paras(E, path, label) {
  return List(E, path, {title: (x, i) => `Đoạn ${i + 1}`, item: p => [F(E, '', p, {area: 1, rows: 2})], add: () => '', addLabel: label || 'Thêm đoạn'});
}

// ---------- KỊCH BẢN BẢN TIN ----------
function formNews(E, en) {
  return [
    Box('Thông tin chung', F(E, 'Tên bản tin', 'title'), F(E, 'Mô tả', 'desc'), F(E, 'Thời lượng', 'duration'),
      h('div', {class: 'wr-f2'}, F(E, 'Kịch bản', 'staff.script'), F(E, 'Hình ảnh', 'staff.image'), F(E, 'Biên tập', 'staff.editor'), F(E, 'MC', 'staff.mc'))),
    Box('MC mở đầu', F(E, '', 'open', {area: 1, rows: 3, ph: 'Xin kính chào quý vị khán giả…'})),
    Box('Các tin', List(E, 'news', {title: (x, i) => `TIN ${i + 1}${x.title ? ': ' + x.title.slice(0, 50) : ''}`, addLabel: 'Thêm tin', min: 1, add: () => ({title: '', intro: '', detail: '', visual: '', parts: []}),
      item: p => [F(E, 'Tiêu đề tin', p + '.title', {area: 1, rows: 1}), F(E, '<Lời dẫn> — MC giới thiệu', p + '.intro', {area: 1, rows: 3}),
        ...(en ? [h('div', {class: 'wr-mute'}, 'Lời thu âm: viết chung, hoặc chia thành các ý nhỏ có dòng TEXT trên hình.'), F(E, '<Thu âm>', p + '.detail', {area: 1, rows: 3}),
          List(E, p + '.parts', {title: (x, j) => `Ý ${j + 1} (TEXT)`, addLabel: 'Thêm ý nhỏ có TEXT', add: () => ({title: '', detail: ''}), item: q => [F(E, 'TEXT trên hình', q + '.title'), F(E, '<Thu âm>', q + '.detail', {area: 1, rows: 3})]})]
          : [F(E, '<Thu âm> — chi tiết tin', p + '.detail', {area: 1, rows: 4})]),
        F(E, 'Hình ảnh / ghi chú dựng', p + '.visual', {ph: 'Slide hình/ Video sự kiện'})]})),
    Fold('Góc chuyên đề', !!(E.get('special.items') || []).length, en ? F(E, 'Tên chuyên đề', 'special.title') : null, F(E, '<Lời dẫn> mở chuyên đề', 'special.intro', {area: 1, rows: 2}),
      List(E, 'special.items', {title: (x, i) => `5.${i + 1} ${S_(x.title).slice(0, 50)}`, addLabel: 'Thêm mục chuyên đề', add: () => ({title: '', intro: '', detail: ''}),
        item: p => [F(E, 'Tiêu đề', p + '.title'), F(E, '<Lời dẫn>', p + '.intro', {area: 1, rows: 3}), F(E, '<Thu âm> (nếu có)', p + '.detail', {area: 1, rows: 2})]})),
    Box('Phần kết', F(E, '', 'close', {area: 1, rows: 3})),
    Fold('Caption đăng kèm', false, F(E, 'Dòng tiêu đề caption', 'cap.title'), F(E, 'Đoạn mở (📌…)', 'cap.intro', {area: 1, rows: 3}), !en && F(E, 'Lời mời theo dõi', 'cap.outro', {area: 1, rows: 2}),
      F(E, 'Link YouTube', 'cap.youtube'), en ? null : F(E, 'Tiêu đề TikTok/YouTube', 'short.title'), F(E, 'Hashtag (Caption Short)', 'short.tags'), F(E, 'Dòng cố định cuối caption', 'cap.footer', {area: 1, rows: 4})),
  ];
}
// ---------- KỊCH BẢN VIDEO ----------
function formVideo(E) {
  return [
    Box('Thông tin', F(E, 'Tên kịch bản', 'title'), F(E, 'Mô tả', 'desc', {area: 1}), h('div', {class: 'wr-f2'}, F(E, 'Nhạc nền', 'music'), F(E, 'Thời lượng', 'duration'))),
    Box('Các cảnh', h('p', {class: 'wr-mute'}, 'Mỗi dòng mô tả bắt đầu “- ”. Muốn in đậm nhãn: **- Text:**'),
      List(E, 'scenes', {title: (x, i) => x.name || `Cảnh ${i + 1}`, addLabel: 'Thêm cảnh', min: 1, add: () => ({name: '', desc: '', vo: '', note: ''}),
        item: p => [F(E, 'Tên cảnh (vd BƯỚC 1  GỬI Ý TƯỞNG (5-15s))', p + '.name'), F(E, 'Mô tả hình ảnh / text', p + '.desc', {area: 1, rows: 3}), F(E, 'Voice off', p + '.vo', {area: 1, rows: 3}), F(E, 'Ghi chú', p + '.note')]})),
    Fold('Caption', false, F(E, 'Tiêu đề', 'cap.title'), Paras(E, 'cap.paras'), F(E, 'Ký tên', 'cap.sign')),
    Fold('Infographic tổng hợp', !!E.get('withInfo'), h('label', {class: 'wr-row'}, h('input', {type: 'checkbox', checked: !!E.get('withInfo'), onchange: e => E.change(D => { D.withInfo = e.target.checked; })}), 'Có bảng infographic'),
      F(E, 'Tiêu đề', 'info.title'), F(E, 'Dòng đầu bảng', 'info.head'), List(E, 'info.steps', {title: (x, i) => x.title || `Bước ${i + 1}`, addLabel: 'Thêm bước', add: () => ({title: '', sub: ''}), item: p => [F(E, 'Bước', p + '.title'), F(E, 'Chi tiết', p + '.sub')]})),
  ];
}
// ---------- CAPTION ----------
function formCaption(E) {
  return [
    Box('Caption', F(E, 'Tiêu đề (dòng đầu)', 'title', {area: 1, rows: 1}), Paras(E, 'paras'), F(E, 'Ký tên', 'sign')),
    Fold('Nội dung DES (cho thiết kế)', !!E.get('withDes'), h('label', {class: 'wr-row'}, h('input', {type: 'checkbox', checked: !!E.get('withDes'), onchange: e => E.change(D => { D.withDes = e.target.checked; })}), 'Kèm nội dung DES'),
      List(E, 'des', {title: (x, i) => (DES.find(d => d[0] === x.type) || [0, 'Khối'])[1], addLabel: 'Thêm khối', add: () => ({type: 'body', text: ''}),
        item: (p, x) => [h('select', {class: 'wr-in', 'aria-label': 'Kiểu khối ' + p, onchange: e => E.change(D => setP(D, p + '.type', e.target.value))}, DES.map(([k, l]) => h('option', {value: k, selected: x.type === k}, l))), F(E, '', p + '.text', {area: 1, rows: 1})]})),
  ];
}
// ---------- TIN BÀI ----------
function formArticle(E) {
  const T = {p: 'Đoạn', sub: 'Tiêu đề phần', img: 'Ảnh'};
  return [
    Box('Tin bài', F(E, 'Tiêu đề', 'title', {area: 1, rows: 1}), F(E, 'Sapo (đoạn đầu in đậm)', 'lead', {area: 1, rows: 3})),
    Box('Thân bài', List(E, 'blocks', {title: x => T[x.type] || 'Đoạn', addLabel: 'Thêm đoạn', add: () => ({type: 'p', text: ''}),
      item: (p, x) => [h('div', {class: 'wr-seg'}, Object.entries(T).map(([k, l]) => h('button', {class: x.type === k ? 'on' : '', onclick: () => E.change(D => setP(D, p + '.type', k))}, l))),
        F(E, x.type === 'img' ? 'Ảnh cần chèn' : '', p + '.text', {area: 1, rows: x.type === 'p' ? 3 : 1}), x.type === 'img' && F(E, 'Chú thích ảnh', p + '.caption')]})),
    Box('Ký tên', h('div', {class: 'wr-f2'}, F(E, 'Nội dung', 'credits.content'), F(E, 'Hình ảnh', 'credits.image'))),
  ];
}
// ---------- LỊCH CÔNG TÁC (phân công) ----------
function formSchedule(E) {
  return [
    Box('Tuần', h('div', {class: 'wr-f3'}, F(E, 'Tuần số', 'week'), F(E, 'Từ ngày', 'from', {ph: '12/10/2026'}), F(E, 'Đến ngày', 'to', {ph: '18/10/2026'}))),
    Box('Các ngày', List(E, 'days', {title: (x, i) => `${i + 1}. ${x.label || 'Ngày'}`, addLabel: 'Thêm ngày', add: () => ({label: '', items: [{title: ''}]}),
      item: p => [F(E, 'Ngày (vd THỨ HAI (12/10))', p + '.label'), List(E, p + '.items', {title: (x, j) => x.title ? x.title.slice(0, 60) : `Sự kiện ${j + 1}`, addLabel: 'Thêm sự kiện', add: () => ({title: ''}),
        item: q => [F(E, 'Tên sự kiện', q + '.title', {area: 1, rows: 1}), h('div', {class: 'wr-f2'}, SCHED_FIELDS.map(([k, l]) => F(E, l, q + '.' + k, {area: k === 'attendees', rows: 1})))]})]})),
    Box('Lời chúc cuối', F(E, '', 'wish')),
  ];
}
// ---------- TIMELINE ----------
function formTimeline(E) {
  const C = [['content', 'Nội dung thực hiện'], ['format', 'Hình thức'], ['deadline', 'Deadline'], ['publish', 'Thời gian đăng'], ['channel', 'Nơi đăng'], ['a_content', 'Nội dung'], ['a_media', 'Media'], ['a_editor', 'Biên tập'], ['note', 'Ghi chú']];
  const cellIn = (p, k) => { const t = h('textarea', {class: 'wr-in', rows: 1, 'aria-label': k + ' ' + p, oninput: e => E.set(p + '.' + k, e.target.value)}); t.value = S_(E.get(p + '.' + k)); return h('td', {}, t); };
  return [
    Box('Thông tin', F(E, 'Tiêu đề (2 dòng)', 'title', {area: 1, rows: 2}), h('div', {class: 'wr-f2'}, F(E, 'Dòng ngày tháng', 'date'), F(E, 'Dải kênh', 'channel'))),
    ...(E.get('phases') || []).map((ph, i) => h('section', {class: 'wr-box'}, h('h4', {}, F(E, '', `phases[${i}].name`), h('button', {class: 'wr-x del', title: 'Xoá giai đoạn', 'aria-label': 'Xoá giai đoạn', onclick: () => E.change(D => D.phases.splice(i, 1))}, icon('x'))),
      h('div', {class: 'wr-grid-ed'}, h('table', {}, h('tr', {}, h('th', {}, '#'), C.map(([, l]) => h('th', {}, l)), h('th', {}, 'Xong'), h('th', {})),
        (ph.items || []).map((it, j) => { const p = `phases[${i}].items[${j}]`; return h('tr', {}, h('td', {class: 'c'}, j + 1), C.map(([k]) => cellIn(p, k)),
          h('td', {class: 'c'}, h('input', {type: 'checkbox', checked: !!it.done, 'aria-label': 'Xong ' + p, onchange: e => E.set(p + '.done', e.target.checked)})),
          h('td', {class: 'c'}, h('button', {class: 'wr-x del', 'aria-label': 'Xoá dòng', onclick: () => E.change(D => D.phases[i].items.splice(j, 1))}, icon('x')))); }))),
      h('button', {class: 'wr-add', onclick: () => E.change(D => D.phases[i].items.push({content: '', format: '', deadline: '', publish: '', channel: '', a_content: '', a_media: '', a_editor: '', note: '', done: false}))}, '+ Thêm dòng'))),
    h('button', {class: 'wr-add', onclick: () => E.change(D => D.phases.push({name: 'IV. ', items: []}))}, '+ Thêm giai đoạn'),
  ];
}

// ===================== CHƯƠNG TRÌNH LỚN =====================
function progItem(ctx, e) {
  const n = ctx.store.docs.filter(d => d.event_id === e.id).length, date = e.event_date ? e.event_date.split('-').reverse().join('/') : '';
  const items = () => progMenu(ctx, e);
  return withMenu(h('div', clickable(() => ctx.go({screen: 'program', id: e.id}), {'aria-label': e.name}), icon('flag'), h('span', {class: 't'}, e.name), date && h('span', {class: 'wr-tag'}, date), h('span', {class: 'm'}, n + ' tài liệu'), moreBtn(items)), items);
}
export async function newProgram(ctx) {
  const name = h('input', {class: 'wr-in', placeholder: 'Tên chương trình', 'aria-label': 'Tên chương trình'}), brief = h('textarea', {class: 'wr-in', rows: 6, placeholder: 'Dán thông báo / kế hoạch (AI sẽ tự điền ngày, giờ, địa điểm…)', 'aria-label': 'Brief chương trình'});
  const v = await dialog({title: 'Tạo chương trình lớn', body: h('div', {class: 'wr-stack'}, name, brief), buttons: [['Huỷ', null], ['Tạo', 'go', 'primary']]});
  if (!v) return;
  let row = {name: name.value.trim(), brief: brief.value.trim()};
  if (brief.value.trim() && ctx.ai.hasAny) {
    ctx.busy('AI đang đọc thông tin chương trình…');
    try { const x = await extractProgram(ctx, brief.value); row = {...x, name: row.name || x.name, brief: brief.value.trim()}; if (!/^\d{4}-\d{2}-\d{2}$/.test(row.event_date || '')) delete row.event_date; } catch (e) { ctx.note(e.message); }
    ctx.busy(null);
  }
  if (!row.name) row.name = 'Chương trình mới';
  const e = await ctx.store.createEvent(row); ctx.go({screen: 'program', id: e.id});
}
export function programs(ctx) {
  const L = ctx.store.events.filter(e => !e.archived);
  return h('div', {class: 'wr-wrap'}, h('div', {class: 'wr-h'}, h('h2', {}, 'Chương trình lớn'), h('span', {class: 'sp'}), btn('+ Tạo chương trình', () => newProgram(ctx))),
    h('p', {class: 'wr-mute', style: 'margin:-8px 0 14px'}, 'Mỗi chương trình gom đủ kịch bản, caption, tin bài, phân công, timeline của nó — tách riêng khỏi việc thường ngày.'),
    L.length ? L.map(e => progItem(ctx, e)) : h('div', {class: 'wr-empty'}, 'Chưa có chương trình nào.'));
}
export function program(ctx, id) {
  const S = ctx.store, e = S.eventOf(id), err = errBox();
  if (!e) return h('div', {class: 'wr-wrap'}, h('div', {class: 'wr-empty'}, 'Không tìm thấy chương trình.'));
  const D = {name: e.name, event_date: e.event_date || '', event_time: e.event_time || '', venue: e.venue || '', organizer: e.organizer || '', attendees: e.attendees || '', brief: e.brief || ''};
  const save = debounce(() => S.updateEvent(e.id, {...D, event_date: D.event_date || null}).catch(x => { err.textContent = x.message; }), 900); ctx.ui.flush = () => save.flush();
  const f = (label, k, o = {}) => { const el = o.area ? h('textarea', {class: 'wr-in', rows: o.rows || 3, 'aria-label': label}) : h('input', {class: 'wr-in', type: o.type || 'text', 'aria-label': label}); el.value = D[k]; el.oninput = ev => { D[k] = ev.target.value; save(); }; return h('label', {class: 'wr-f' + (o.cls ? ' ' + o.cls : '')}, h('span', {}, label), el); };
  const docs = S.docs.filter(d => d.event_id === e.id);
  return h('div', {class: 'wr-wrap'},
    h('div', {class: 'wr-h'}, h('button', {class: 'wr-x', 'aria-label': 'Quay lại', onclick: () => ctx.go({screen: 'programs'})}, '←'), h('h2', {}, e.name), h('span', {class: 'sp'}),
      btn('Lưu trữ', run(err, async () => { if (await confirmBox('Lưu trữ chương trình', 'Ẩn chương trình khỏi danh sách (không xoá tài liệu).', 'Lưu trữ')) { await S.updateEvent(e.id, {archived: true}); ctx.go({screen: 'programs'}); } }), {ghost: true})),
    err,
    Fold('Thông tin chương trình', !e.brief && !e.venue, h('div', {class: 'wr-stack'}, f('Tên', 'name'), h('div', {class: 'wr-f3'}, f('Ngày', 'event_date', {type: 'date'}), f('Giờ', 'event_time'), f('Địa điểm', 'venue')),
      h('div', {class: 'wr-f2'}, f('Đơn vị tổ chức', 'organizer'), f('Thành phần', 'attendees')), f('Brief / nội dung chính', 'brief', {area: 1, rows: 5}),
      h('p', {class: 'wr-mute'}, 'Sửa thông tin ở đây → các tài liệu đã viết được đánh dấu “Cần xem lại”, AI không tự sửa.'))),
    ...GROUPS.map(g => { const L = docs.filter(d => g.kinds.includes(d.kind));
      return h('div', {}, h('div', {class: 'wr-sec'}, g.name), L.map(d => docItem(ctx, d)), btn('+ Tạo ' + (g.id === 'script' ? 'kịch bản' : g.name.toLowerCase()) + ' cho chương trình', () => newDocFlow(ctx, g.id, {event_id: e.id}), {ghost: true, sm: 1})); }));
}

// ===================== XUẤT BẢN =====================
export function publish(ctx) {
  const S = ctx.store, U = ctx.ui.pub ||= {f: 'open'}, err = errBox();
  const F = {open: d => !['published'].includes(d.status), review: d => d.status === 'review' || d.status === 'revise', approved: d => d.status === 'approved', published: d => d.status === 'published', all: () => true};
  const L = S.docs.filter(F[U.f] || F.all), n = k => S.docs.filter(F[k]).length;
  const link = (o, l) => o && o.url ? h('a', {class: 'wr-btn ghost sm', href: o.url, target: '_blank', rel: 'noopener'}, l) : null;
  return h('div', {class: 'wr-wrap'}, h('div', {class: 'wr-h'}, h('h2', {}, 'Xuất bản & bàn giao'), h('p', {}, 'Theo dõi từng tài liệu: Nháp → Gửi duyệt → Cần sửa → Đã duyệt → Đã đăng. Xuất Word/Excel/PDF, Google Docs/Sheets, gửi duyệt, nhận góp ý.')), err,
    h('div', {class: 'wr-tabs'}, [['open', 'Đang làm'], ['review', 'Đang duyệt'], ['approved', 'Đã duyệt'], ['published', 'Đã đăng'], ['all', 'Tất cả']].map(([k, l]) => h('button', {class: U.f === k ? 'on' : '', onclick: () => { U.f = k; ctx.render(); }}, l + ' (' + n(k) + ')'))),
    L.length ? h('table', {class: 'wr-table'}, h('tr', {}, ['Tài liệu', 'Loại', 'Trạng thái', 'Hạn', 'Bản trên Google', ''].map(x => h('th', {}, x))),
      L.map(d => h('tr', {}, h('td', {}, h('a', {href: '#', onclick: ev => { ev.preventDefault(); ctx.go({screen: 'doc', id: d.id}); }}, docTitle(d)), evName(S, d.event_id) ? h('div', {class: 'wr-mute'}, evName(S, d.event_id)) : null), h('td', {}, KINDS[d.kind].short),
        h('td', {}, h('select', {class: 'wr-in wr-status st-' + d.status, 'aria-label': 'Trạng thái ' + docTitle(d), onchange: run(err, e => S.saveDoc(d.id, {status: e.target.value}))}, STATUS.map(([k, l]) => h('option', {value: k, selected: d.status === k}, l)))),
        h('td', {}, dueTag(d) || '—'), h('td', {}, h('div', {class: 'wr-row'}, link(d.gdoc, d.kind === 'timeline' ? 'Sheets' : 'Docs'), link(d.drive, '.' + KINDS[d.kind].ext)) ),
        h('td', {}, h('div', {class: 'wr-row', style: 'justify-content:flex-end'}, btn('Xuất', () => exportDialog(ctx, d), {ghost: true, sm: 1}), btn('Bàn giao', () => handoffDialog(ctx, d), {sm: 1})))))) : h('div', {class: 'wr-empty'}, 'Không có tài liệu nào ở đây.'));
}

// ===================== CÀI ĐẶT =====================
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vy-workroom:' + s)))].map(b => b.toString(16).padStart(2, '0')).join('');
export const pinOk = async (store, pin) => !store.settings.pin_hash || await sha(pin) === store.settings.pin_hash;
export function settings(ctx) {
  const S = ctx.store, A = ctx.ai, G = ctx.g, err = errBox(), st = A.state;
  const aiStatus = !A.cfg.key ? h('span', {class: 'wr-tag warn'}, 'Chưa bật') : st.status === 'ok' ? h('span', {class: 'wr-tag ok'}, 'Đang dùng ' + A.model) : st.status === 'unknown' ? h('span', {class: 'wr-tag'}, 'Chưa kiểm tra') : h('span', {class: 'wr-tag warn'}, st.error || 'Lỗi');
  return h('div', {class: 'wr-wrap'}, h('div', {class: 'wr-h'}, h('h2', {}, 'Cài đặt')), err,
    h('div', {class: 'wr-stack'},
      Box(h('span', {}, 'AI chính — Google Gemini ', aiStatus),
        !A.cfg.key ? keyGuide() : null,
        h('div', {class: 'wr-row'}, btn(A.cfg.key ? 'Đổi khoá' : 'Dán khoá', run(err, async () => { await askKey(A); ctx.render(); })), A.cfg.key && btn('Kiểm tra', run(err, async () => { await A.probe('gemini'); ctx.render(); }), {ghost: true}),
          st.models.length > 1 && h('select', {class: 'wr-in', style: 'width:auto', 'aria-label': 'Model Gemini', onchange: e => { A.setCfg({model: e.target.value}); ctx.render(); }}, st.models.map(m => h('option', {value: m.name, selected: m.name === A.model}, m.label + (m === st.models[0] ? ' (mới nhất)' : '')))),
          A.cfg.key && btn('Gỡ khoá', () => { A.setKey('gemini', ''); A.probe('gemini'); ctx.render(); }, {ghost: true})),
        h('p', {class: 'wr-mute'}, PROVIDERS.gemini.note + '. Khoá chỉ lưu trên trình duyệt máy này.')),
      Box('AI dự phòng — để không bao giờ bị gián đoạn (miễn phí, khuyên thêm ít nhất 1)',
        h('p', {class: 'wr-mute'}, 'Khi Gemini quá tải hoặc hết lượt, Workroom tự chuyển sang dịch vụ kế tiếp và làm tiếp — bạn không phải làm gì. Thứ tự: Gemini → ' + BACKUPS.map(p => PROVIDERS[p].name).join(' → ') + '.'),
        ...BACKUPS.map(p => { const x = (st.extra || {})[p] || {}, has = !!A.cfg.keys[p];
          return h('div', {class: 'wr-li'}, h('header', {}, h('b', {}, PROVIDERS[p].name), has ? (x.status === 'ok' ? h('span', {class: 'wr-tag ok'}, 'Sẵn sàng') : x.status === 'bad' ? h('span', {class: 'wr-tag warn', title: x.error || ''}, 'Lỗi khoá') : h('span', {class: 'wr-tag'}, 'Chưa kiểm tra')) : h('span', {class: 'wr-tag'}, 'Chưa thêm')),
            h('small', {class: 'wr-mute'}, PROVIDERS[p].note),
            h('div', {class: 'wr-row'}, btn(has ? 'Đổi khoá' : 'Thêm khoá', run(err, async () => { await askKey(A, p); ctx.render(); }), {sm: 1, ghost: has}),
              h('a', {class: 'wr-btn ghost sm', href: PROVIDERS[p].keyUrl, target: '_blank', rel: 'noopener'}, 'Lấy khoá'),
              has && (x.models || []).length ? h('select', {class: 'wr-in', style: 'width:auto;max-width:280px', 'aria-label': 'Model ' + PROVIDERS[p].name, onchange: e => A.setCfg({models: {...A.cfg.models, [p]: e.target.value}})}, x.models.slice(0, 25).map(m => h('option', {value: m.name, selected: m.name === A.cfg.models[p]}, m.name.replace(/:free$/, '') + (m === x.models[0] ? ' (gợi ý)' : '')))) : null,
              has && btn('Kiểm tra', run(err, async () => { await A.probe(p); ctx.render(); }), {ghost: true, sm: 1}), has && btn('Gỡ', () => { A.setKey(p, ''); A.probe(p); ctx.render(); }, {ghost: true, sm: 1}))); })),
      Box(h('span', {}, 'Google Drive ', G.status === 'connected' ? h('span', {class: 'wr-tag ok'}, 'Đã kết nối') : h('span', {class: 'wr-tag warn'}, G.status === 'expired' ? 'Cần kết nối lại' : 'Chưa kết nối')),
        h('div', {class: 'wr-row'}, G.status === 'connected' ? btn('Ngắt kết nối', run(err, async () => { await G.disconnect(); ctx.render(); }), {ghost: true}) : btn('Kết nối Google', run(err, () => G.connect(['drive'])))),
        S.settings.drive_root && h('a', {href: S.settings.drive_root.url, target: '_blank', rel: 'noopener'}, 'Mở thư mục “PHÒNG VY — Workroom” trên Drive'),
        h('p', {class: 'wr-mute'}, 'Dùng để đẩy file lên Drive/Docs/Sheets. Phiên Google hết hạn sau ~1 giờ — bấm Kết nối lại khi được nhắc. Lần đầu nếu báo “API chưa được bật”: bấm nút “Bật … API” trong thông báo lỗi → Enable → đợi 1–2 phút rồi Thử lại (cần Google Drive API; Gmail API nếu muốn tạo thư nháp).')),
      Box('Đội ngũ', h('div', {class: 'wr-row'}, h('p', {class: 'wr-mute', style: 'flex:1'}, (S.staff || []).filter(p => p.active !== false).length + ' người đang làm. Danh sách, vai trò, team và lịch bận đã chuyển sang mục Phân công.'),
        btn('Mở Đội ngũ', () => { ctx.ui.ph = 'team'; ctx.go({screen: 'group', id: 'schedule'}); }, {ghost: true, icon: 'users'}))),
      Box('Người nhận bàn giao (trưởng phòng, biên tập, thiết kế…)', h('div', {class: 'wr-stack'}, (S.settings.contacts || []).map((c, i) => h('div', {class: 'wr-item'}, h('span', {class: 't'}, c.name + ' · ' + c.email), h('span', {class: 'm'}, c.role || ''),
          h('button', {class: 'wr-x del', 'aria-label': 'Xoá ' + c.email, onclick: run(err, () => S.setSetting('contacts', (S.settings.contacts || []).filter((_, j) => j !== i)))}, icon('x'))))),
        (() => { const n = h('input', {class: 'wr-in', placeholder: 'Tên', 'aria-label': 'Tên người nhận'}), em = h('input', {class: 'wr-in', type: 'email', placeholder: 'Email', 'aria-label': 'Email người nhận mới'}), ro = h('input', {class: 'wr-in', placeholder: 'Vai trò (vd Trưởng phòng)', 'aria-label': 'Vai trò người nhận'});
          return h('div', {class: 'wr-row'}, h('div', {style: 'flex:1'}, n), h('div', {style: 'flex:1.3'}, em), h('div', {style: 'flex:1'}, ro), btn('Thêm', run(err, async () => { if (!/^\S+@\S+\.\S+$/.test(em.value.trim())) throw new Error('Email chưa đúng'); await S.setSetting('contacts', [...(S.settings.contacts || []), {name: n.value.trim() || em.value.trim(), email: em.value.trim(), role: ro.value.trim()}]); }))); })()),
      Box('Nơi lưu trên Drive cho từng mục', h('p', {class: 'wr-mute'}, 'Mặc định: “PHÒNG VY — Workroom / <Mục>”. Muốn lưu thẳng vào thư mục chung của phòng: dán link thư mục Drive.'),
        GROUPS.map(g => { const cur = (S.settings.dest || {})[g.id], inp = h('input', {class: 'wr-in', placeholder: 'Link thư mục Drive cho mục ' + g.name, 'aria-label': 'Nơi lưu ' + g.name, value: cur ? cur.url || cur.id : ''});
          return h('div', {class: 'wr-row'}, h('b', {style: 'width:110px'}, g.name), h('div', {style: 'flex:1'}, inp), btn('Lưu', run(err, async () => { const id = ctx.g.idFromUrl(inp.value); const d = {...(S.settings.dest || {})}; if (!inp.value.trim()) delete d[g.id]; else if (!id) throw new Error('Link thư mục chưa đúng'); else d[g.id] = {id, url: inp.value.trim()}; await S.setSetting('dest', d); ctx.note('Đã lưu nơi lưu cho ' + g.name); }), {ghost: true, sm: 1})); })),
      Box('Mã khoá màn hình', h('div', {class: 'wr-row'}, btn(S.settings.pin_hash ? 'Đổi mã' : 'Đặt mã', run(err, async () => setPin(ctx)), {ghost: true}), S.settings.pin_hash && btn('Bỏ mã', run(err, () => S.setSetting('pin_hash', null)), {ghost: true}))),
      Box('Sao lưu', h('div', {class: 'wr-row'}, btn('Tải bản sao lưu', run(err, async () => download(new Blob([JSON.stringify(await S.exportAll(), null, 2)], {type: 'application/json'}), 'workroom-' + new Date().toISOString().slice(0, 10) + '.json')), {ghost: true}),
        btn('Khôi phục…', run(err, async () => { const f = await pickFile('.json'); if (!f) return; const d = JSON.parse(await f.text()); if (await confirmBox('Khôi phục', 'Chỉ THÊM bản ghi chưa có, không ghi đè, không xoá.', 'Khôi phục')) ctx.note('Đã thêm ' + await S.restore(d) + ' bản ghi'); }), {ghost: true})))));
}
async function setPin(ctx) {
  const a = h('input', {class: 'wr-in', type: 'password', inputMode: 'numeric', placeholder: '4–12 ký tự', 'aria-label': 'Mã khoá mới'});
  const v = await dialog({title: 'Đặt mã khoá', body: h('div', {class: 'wr-stack'}, h('p', {}, 'Mỗi phiên trình duyệt mới sẽ hỏi mã này khi mở Workroom.'), a), buttons: [['Huỷ', null], ['Đặt mã', () => a.value, 'primary']]});
  if (v == null) return; if (v.length < 4 || v.length > 12) throw new Error('Mã khoá cần 4–12 ký tự.');
  const hsh = await sha(v); sessionStorage.setItem('vyWrUnlocked', '1'); await ctx.store.setSetting('pin_hash', hsh); ctx.note('Đã đặt mã khoá.');
}
export {docTitle};
