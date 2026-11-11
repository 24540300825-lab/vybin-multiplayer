// PHÒNG VY — WORKROOM · khung Work Mode (thanh bên, thanh trên, vùng làm việc, Trợ lý AI).
// Chạy ở TRANG VỎ (shell) nên game 3D bên dưới giữ nguyên trạng thái. Chỉ tải khi mở Work Mode lần đầu.
import {createStore} from './store.js';
import {createAI} from './ai.js';
import {createGoogle} from './google.js';
import {createCopilot} from './copilot.js';
import {GROUPS, KINDS} from './kinds.js';
import * as V from './views.js';
import {h, icon, btn, moreBtn, withMenu, confirmBox} from './ui.js';

let inst = null;
// tải sẵn (ẩn) để lúc ngồi xuống mở ngay, không phải chờ
export function prepareWorkroom(SH) { if (!inst) inst = build(SH); return inst.catch(e => { inst = null; throw e; }); }
export async function openWorkroom(SH, opt = {}) {
  if (!inst) inst = build(SH);
  const w = await inst.catch(e => { inst = null; throw e; });
  w.show(opt);
  return w;
}

const NAV = [
  {id: 'home', name: 'Hôm nay', icon: 'home'},
  {grp: 'Việc thường ngày'}, ...GROUPS.map(g => ({id: 'group:' + g.id, name: g.name, icon: g.icon, g})),
  {grp: 'Chương trình lớn'}, {id: 'programs', name: 'Chương trình', icon: 'flag'},
  {grp: 'Hoàn tất'}, {id: 'publish', name: 'Xuất & bàn giao', icon: 'drive'},
  {sp: 1}, {id: 'settings', name: 'Cài đặt', icon: 'gear'},
];
const navKey = v => v.screen === 'group' ? 'group:' + v.id : v.screen === 'program' ? 'programs' : v.screen;

async function build(SH) {
  await new Promise(res => {
    if (document.getElementById('wrCss')) return res();
    const l = h('link', {id: 'wrCss', rel: 'stylesheet', href: 'workroom.css?v=32'}); l.onload = l.onerror = res; document.head.append(l);
  });
  const store = await createStore(SH);          // ném 'not_owner' nếu máy chủ không xác nhận quyền vào
  const ai = createAI(store), g = createGoogle(SH, store);
  const st = {view: {screen: 'home'}, cop: false, onClose: null, open: false};
  try { const s = JSON.parse(localStorage.getItem('vyWorkroomUi3') || '{}'); if (s.view) st.view = s.view; st.cop = !!s.cop; } catch (e) {}
  const keep = () => { try { localStorage.setItem('vyWorkroomUi3', JSON.stringify({view: st.view, cop: st.cop})); } catch (e) {} };

  const root = h('div', {id: 'wr', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Phòng Vy — Workroom'});
  const side = h('nav', {class: 'wr-side', 'aria-label': 'Các mục'}), top = h('header', {class: 'wr-top'});
  const main = h('main', {class: 'wr-main', tabIndex: -1}), cop = h('aside', {class: 'wr-cop', 'aria-label': 'Trợ lý AI'}), noteEl = h('div', {class: 'wr-note', role: 'status'});
  root.append(side, top, h('div', {class: 'wr-body'}, main, cop), noteEl);
  document.body.append(root);

  let noteT = 0, busyEl = null;
  const ctx = {
    store, ai, g, SH, ui: {},
    get view() { return st.view; },
    go(v) { flush(); for (const k of ['undo', 'redo', 'exportMenu', 'handoff', 'aiWrite', 'download', 'toDrive', 'pdf']) delete ctx.ui[k]; st.view = typeof v === 'string' ? {screen: v} : v; keep(); ctx.render(); main.scrollTop = 0; main.focus({preventScroll: true}); },
    render: () => render(),
    note(m) { noteEl.textContent = m; noteEl.classList.add('on'); clearTimeout(noteT); noteT = setTimeout(() => noteEl.classList.remove('on'), 3800); },
    busy(m) { if (busyEl) { busyEl.remove(); busyEl = null; } if (m) { busyEl = h('div', {class: 'wr-dlg'}, h('div', {class: 'wr-dlg-box'}, h('h3', {}, '✨ ' + m), h('p', {class: 'wr-mute'}, 'Thường mất 10–40 giây.'), h('div', {class: 'wr-dlg-act'}, btn('Dừng', () => ai.stop(), {ghost: true})))); root.append(busyEl); } },
    toggleCop(v) { st.cop = v == null ? !st.cop : v; keep(); render(); },
  };
  ctx.cop = createCopilot(ctx);
  const flush = () => { try { ctx.ui.flush && ctx.ui.flush(); } catch (e) { console.error(e); } ctx.ui.flush = null; };
  const locked = () => !!store.settings.pin_hash && sessionStorage.getItem('vyWrUnlocked') !== '1';

  function renderSide() {
    const cur = navKey(st.view), n = {publish: store.docs.filter(d => d.status === 'revise' || (d.handoff && d.handoff.deadline && new Date(d.handoff.deadline) < Date.now() && !['approved', 'published'].includes(d.status))).length};
    side.replaceChildren(h('div', {class: 'wr-brand'}, 'PHÒNG VY', h('small', {}, 'Workspace')),
      ...NAV.map(x => x.grp ? h('div', {class: 'wr-grp'}, x.grp) : x.sp ? h('span', {class: 'sp'}) :
        withMenu(h('button', {class: 'wr-nav' + (cur === x.id ? ' on' : ''), 'aria-current': cur === x.id ? 'page' : null, onclick: () => ctx.go(x.id.startsWith('group:') ? {screen: 'group', id: x.id.slice(6)} : {screen: x.id})},
          icon(x.icon), h('span', {}, x.name), n[x.id] > 0 && h('em', {title: 'Cần sửa theo góp ý / quá hạn'}, n[x.id])), () => navMenu(x))),
      store.local ? h('div', {class: 'wr-dev'}, 'BẢN THỬ — dữ liệu chỉ lưu trên trình duyệt này.') : null);
  }
  // ⋯ trên thanh trên cùng: tạo nhanh + cài đặt nhanh
  const topMenu = () => [{head: 'Tạo mới'}, ...GROUPS.map(g => ({label: g.id === 'script' ? 'Kịch bản' : g.name, icon: g.icon, run: () => V.newDocFlow(ctx, g.id)})), {label: 'Chương trình lớn', icon: 'flag', run: () => V.newProgram(ctx)}, '-',
    {head: 'Nhanh'}, {label: st.cop ? 'Đóng Trợ lý AI' : 'Mở Trợ lý AI', icon: 'spark', kbd: '⌘J', run: () => ctx.toggleCop()},
    {label: g.status === 'connected' ? 'Google: đã kết nối' : 'Kết nối Google', icon: 'drive', disabled: g.status === 'connected', run: () => g.connect(['drive']).catch(e => ctx.note(e.message))},
    {label: ai.cfg.key ? 'AI: ' + (ai.model || 'Gemini') : 'Bật AI (dán khoá Gemini)', icon: 'gear', run: () => ctx.go('settings')},
    store.settings.pin_hash && {label: 'Khoá màn hình ngay', icon: 'stop', run: () => { sessionStorage.removeItem('vyWrUnlocked'); render(); }},
    {label: 'Phím tắt', icon: 'list', kbd: '⌘/', run: () => ctx.showKeys()}, {label: 'Cài đặt', icon: 'gear', run: () => ctx.go('settings')}, '-',
    {label: 'Về phòng', icon: 'door', run: hide}];
  const navMenu = x => x.g ? [{label: 'Mở ' + x.name, icon: 'ext', run: () => ctx.go({screen: 'group', id: x.g.id})}, {label: '+ Tạo ' + (x.g.id === 'script' ? 'kịch bản' : x.name.toLowerCase()), icon: 'plus', run: () => V.newDocFlow(ctx, x.g.id)}]
    : x.id === 'programs' ? [{label: 'Mở danh sách', icon: 'ext', run: () => ctx.go('programs')}, {label: '+ Tạo chương trình lớn', icon: 'plus', run: () => V.newProgram(ctx)}] : [{label: 'Mở', icon: 'ext', run: () => ctx.go(x.id)}];
  const TITLES = {home: 'Hôm nay', programs: 'Chương trình lớn', publish: 'Xuất bản', settings: 'Cài đặt'};
  function renderTop() {
    const v = st.view, s = store.save, d = v.screen === 'doc' && store.doc(v.id);
    const title = d ? KINDS[d.kind].name : v.screen === 'group' ? (GROUPS.find(x => x.id === v.id) || {}).name : v.screen === 'program' ? 'Chương trình' : TITLES[v.screen] || '';
    top.replaceChildren(h('h1', {}, 'PHÒNG VY · ' + (title || '')), h('span', {class: 'sp'}),
      h('span', {class: 'wr-save' + (s.state === 'error' ? ' err' : ''), title: s.error || ''}, s.state === 'saving' ? 'Đang lưu…' : s.state === 'error' ? 'Lưu lỗi' : s.at ? 'Đã lưu' : ''),
      moreBtn(() => topMenu(), 'Thao tác nhanh'),
      h('button', {class: 'wr-ai' + (st.cop ? ' on' : ''), 'aria-pressed': String(st.cop), title: 'Trợ lý AI (⌘J)', onclick: () => ctx.toggleCop()}, icon('spark'), h('span', {class: 'lbl'}, 'Trợ lý AI')),
      h('button', {class: 'wr-exit', onclick: hide}, icon('door'), h('span', {class: 'lbl'}, 'Về phòng')));
  }
  function lockScreen() {
    const inp = h('input', {class: 'wr-in', type: 'password', placeholder: 'Mã khoá', 'aria-label': 'Mã khoá', autocomplete: 'off'}), msg = h('p', {class: 'wr-err'});
    const go = async e => { e.preventDefault(); if (await V.pinOk(store, inp.value)) { sessionStorage.setItem('vyWrUnlocked', '1'); render(); } else { msg.textContent = 'Mã khoá không đúng.'; inp.select(); } };
    setTimeout(() => inp.focus(), 50);
    return h('form', {class: 'wr-card wr-lock wr-stack', onsubmit: go}, h('h3', {}, 'Workroom đang khoá'), inp, btn('Mở khoá', null, {type: 'submit'}), msg);
  }
  function screen() {
    const v = st.view;
    switch (v.screen) {
      case 'group': return GROUPS.some(x => x.id === v.id) ? V.group(ctx, v.id) : V.home(ctx);
      case 'doc': return V.editor(ctx, v.id);
      case 'programs': return V.programs(ctx);
      case 'program': return V.program(ctx, v.id);
      case 'publish': return V.publish(ctx);
      case 'settings': return V.settings(ctx);
      default: return V.home(ctx);
    }
  }
  function render() {
    if (!st.open) return;
    flush();
    const ae = document.activeElement, mark = ae && main.contains(ae) && ae !== main ? {label: ae.getAttribute('aria-label'), s: ae.selectionStart, e: ae.selectionEnd} : null, y = main.scrollTop;
    root.classList.toggle('cop', st.cop && !locked()); root.classList.toggle('locked', locked());
    renderSide(); renderTop();
    if (locked()) { cop.replaceChildren(); main.replaceChildren(lockScreen()); return; }
    if (st.cop && !cop.childElementCount) cop.replaceChildren(ctx.cop.panel()); else if (!st.cop) cop.replaceChildren();
    let el; try { el = screen(); } catch (e) { console.error('[workroom]', e); el = h('div', {class: 'wr-wrap'}, h('p', {class: 'wr-err'}, 'Màn hình này gặp lỗi: ' + e.message), btn('Về Hôm nay', () => ctx.go('home'))); }
    main.replaceChildren(el); main.scrollTop = y;
    if (mark && mark.label) { const t = [...main.querySelectorAll('[aria-label]')].find(x => x.getAttribute('aria-label') === mark.label && !x.disabled); if (t) { try { t.focus({preventScroll: true}); if (mark.s != null && t.setSelectionRange) t.setSelectionRange(mark.s, mark.e); } catch (e) {} } }
  }
  // trợ lý vẽ lại theo màn hình (để thấy "Đang mở…" đúng): khi đổi màn thì làm mới khung trợ lý
  let lastKey = '';
  const renderAll = () => { const k = JSON.stringify(st.view); if (k !== lastKey && st.cop) { lastKey = k; cop.replaceChildren(); } render(); };
  ctx.render = renderAll;
  store.on('change', renderAll);
  store.on('save', () => { if (st.open) renderTop(); });
  g.on(() => { if (st.open) renderAll(); });
  addEventListener('beforeunload', flush);
  // ---------- PHÍM TẮT (giống Google Docs/Sheets) ----------
  const KEYS = [['⌘Z', 'Hoàn tác'], ['⌘⇧Z  ·  ⌘Y', 'Làm lại'], ['⌘S', 'Lưu ngay'], ['⌘⇧A', 'AI viết / sửa tài liệu đang mở'], ['⌘J', 'Mở / đóng Trợ lý AI'], ['⌘⇧E', 'Xuất (Word, Excel, PDF, Google…)'],
    ['⌘⇧S', 'Cập nhật bản Google Docs/Sheets'], ['⌘⇧D', 'Tải file đúng mẫu về máy'], ['⌘P', 'Xuất PDF'], ['⌘⇧B', 'Bàn giao (gửi duyệt, góp ý)'], ['⌘Enter', 'Bấm nút chính trong hộp thoại'], ['Esc', 'Đóng hộp thoại'], ['⌘/', 'Xem bảng phím tắt'], ['Chuột phải · ⋯', 'Thao tác nhanh trên từng mục (đổi tên, nhân bản, chuyển, trạng thái, xoá…)']];
  const showKeys = () => import('./ui.js').then(({dialog}) => dialog({title: 'Phím tắt', body: h('table', {class: 'wr-table'}, KEYS.map(([k, l]) => h('tr', {}, h('td', {}, h('kbd', {}, /Mac|iPhone|iPad/.test(navigator.platform) ? k : k.replace(/⌘/g, 'Ctrl+').replace(/⇧/g, 'Shift+'))), h('td', {}, l))))}));
  root.addEventListener('keydown', e => {
    if (!st.open || locked()) return;
    const mod = e.metaKey || e.ctrlKey, k = (e.key || '').toLowerCase(), dlg = root.querySelector('.wr-dlg');
    if (dlg) { if (mod && k === 'enter') { const b = dlg.querySelector('.wr-dlg-act .wr-btn:not(.ghost)'); if (b) { e.preventDefault(); b.click(); } } return; }
    if (!mod) return;
    const inCop = cop.contains(e.target), U = ctx.ui, ed = st.view.screen === 'doc', go = fn => { e.preventDefault(); e.stopPropagation(); fn(); };
    if (k === 'z' && !inCop && ed && U.undo) return go(e.shiftKey ? U.redo : U.undo);
    if (k === 'y' && !inCop && ed && U.redo) return go(U.redo);
    if (k === 's' && !e.shiftKey) return go(() => { flush(); ctx.note('Đã lưu'); });
    if (k === 's' && e.shiftKey && ed && U.toDrive) return go(U.toDrive);
    if (k === 'j') return go(() => { ctx.toggleCop(!st.cop); if (st.cop) setTimeout(() => { const t = cop.querySelector('textarea'); t && t.focus(); }, 30); });
    if (k === '/' || k === '?') return go(showKeys);
    if (!ed) return;
    if (k === 'a' && e.shiftKey && U.aiWrite) return go(U.aiWrite);
    if (k === 'e' && e.shiftKey && U.exportMenu) return go(U.exportMenu);
    if (k === 'd' && e.shiftKey && U.download) return go(U.download);
    if (k === 'b' && e.shiftKey && U.handoff) return go(U.handoff);
    if (k === 'p' && !e.shiftKey && U.pdf) return go(U.pdf);
  }, true);
  ctx.showKeys = showKeys;

  function show(opt) {
    st.onClose = opt.onClose || null; st.open = true;
    renderAll(); root.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('in')));
    main.focus({preventScroll: true});
    store.reload().catch(e => ctx.note('Không tải lại được dữ liệu: ' + e.message));
    if (ai.cfg.key) ai.probe().then(() => { if (st.open && st.view.screen === 'settings') renderAll(); });
    g.afterReturn().catch(() => {});
  }
  function hide() {
    if (!st.open) return; flush(); st.open = false;
    root.classList.remove('in');
    setTimeout(() => { if (!st.open) root.classList.remove('on'); }, 300);
    const cb = st.onClose; st.onClose = null;
    try { cb && cb(); } catch (e) {}
    try { SH.frame.focus(); SH.frame.contentWindow.focus(); } catch (e) {}
  }
  return {show, hide, isOpen: () => st.open, store, ai, g, ctx};
}
