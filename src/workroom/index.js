// PHÒNG VY — WORKROOM · khung Work Mode (sidebar, thanh trên, vùng làm việc, AI Copilot).
// Chạy ở TRANG VỎ (shell) nên game 3D bên dưới giữ nguyên trạng thái; cuộc gọi, nhạc, chat không đứt.
// Chỉ được tải khi Vy mở Work Mode lần đầu (lazy) — không làm nặng lúc vào game.
import {createStore} from './store.js';
import {createAI} from './ai.js';
import {createGoogle} from './google.js';
import {createActions} from './actions.js';
import {MODULES, pinOk} from './modules.js';
import {chatPanel} from './m-assistant.js';
import {h, icon, chip, btn} from './ui.js';

let inst = null;
export async function openWorkroom(SH, opt = {}) {
  if (!inst) inst = build(SH);
  const w = await inst.catch(e => { inst = null; throw e; });
  w.show(opt);
  return w;
}

async function build(SH) {
  await new Promise(res => {
    if (document.getElementById('wrCss')) return res();
    const l = h('link', {id: 'wrCss', rel: 'stylesheet', href: 'workroom.css?v=2'}); l.onload = l.onerror = res; document.head.append(l);
  });
  const store = await createStore(SH);          // ném 'not_owner' nếu máy chủ không xác nhận là chủ phòng
  const ai = createAI(store), g = createGoogle(SH, store);
  const st = {mod: 'overview', eventId: null, cop: false, onClose: null, open: false};
  try { const s = JSON.parse(localStorage.getItem('vyWorkroomUi') || '{}'); if (MODULES.some(m => m.id === s.mod)) st.mod = s.mod; st.cop = !!s.cop; st.eventId = s.eventId || null; } catch (e) {}
  const keep = () => { try { localStorage.setItem('vyWorkroomUi', JSON.stringify({mod: st.mod, cop: st.cop, eventId: st.eventId})); } catch (e) {} };

  const root = h('div', {id: 'wr', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Phòng Vy — Workroom'});
  const side = h('nav', {class: 'wr-side', 'aria-label': 'Các khu làm việc'}), top = h('header', {class: 'wr-top'});
  const main = h('main', {class: 'wr-main', tabIndex: -1}), cop = h('aside', {class: 'wr-cop', 'aria-label': 'AI Copilot'}), noteEl = h('div', {class: 'wr-note', role: 'status'});
  root.append(side, top, h('div', {class: 'wr-body'}, main, cop), noteEl);
  document.body.append(root);

  let noteT = 0;
  const ctx = {
    store, ai, g, ui: {}, SH,
    event: () => store.eventOf(st.eventId) || null,
    setEvent(id) { st.eventId = id || null; keep(); render(); },
    go(id) { if (!MODULES.some(m => m.id === id)) return; flush(); st.mod = id; keep(); render(); main.scrollTop = 0; main.focus({preventScroll: true}); },
    render: () => render(),
    note(m) { noteEl.textContent = m; noteEl.classList.add('on'); clearTimeout(noteT); noteT = setTimeout(() => noteEl.classList.remove('on'), 3200); },
  };
  ctx.actions = createActions(ctx);
  const flush = () => { try { ctx.ui.flush && ctx.ui.flush(); } catch (e) { console.error(e); } };
  const locked = () => !!store.settings.pin_hash && sessionStorage.getItem('vyWrUnlocked') !== '1';

  function renderSide() {
    const n = {tasks: store.tasks.filter(t => t.status !== 'done').length, editorial: store.articles.filter(a => a.status === 'review').length};
    side.replaceChildren(h('div', {class: 'wr-brand'}, 'PHÒNG VY', h('small', {}, 'Workroom')),
      ...MODULES.flatMap(m => [m.sep && h('div', {class: 'wr-sep'}), h('button', {class: 'wr-nav' + (st.mod === m.id ? ' on' : ''), 'aria-current': st.mod === m.id ? 'page' : null, title: m.name, onclick: () => ctx.go(m.id)}, icon(m.icon), h('span', {}, m.name), n[m.id] > 0 && h('em', {}, n[m.id]))]).filter(Boolean),
      h('span', {class: 'sp'}), ...(store.local ? [h('div', {class: 'wr-dev'}, 'BẢN THỬ — dữ liệu chỉ lưu trên trình duyệt này, không phải dữ liệu thật.')] : []));
  }
  function renderTop() {
    const s = store.save, cur = ctx.event(), a = ai.state, gs = g.status;
    const saveChip = s.state === 'saving' ? ['warn', 'Đang lưu…'] : s.state === 'error' ? ['bad', 'Lưu lỗi'] : ['ok', s.at ? 'Đã lưu ' + s.at.toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'}) : 'Đã lưu'];
    const aiChip = a.busy ? ['warn', 'AI: ' + (a.task || 'đang xử lý') + '…'] : ai.ready ? ['ok', 'AI: ' + ai.cfg.model] : a.status === 'online' ? ['warn', 'AI: chưa có model'] : a.status === 'unknown' ? ['', 'AI: đang kiểm tra'] : ['bad', 'AI: offline'];
    const late = store.tasks.filter(t => t.status !== 'done' && t.deadline && new Date(t.deadline) < new Date()).length, stale = store.articles.filter(x => (x.stale || []).length).length + store.events.filter(e => (e.needs_check || []).length).length, nN = late + stale;
    top.replaceChildren(...[h('h1', {}, 'PHÒNG VY — WORKSPACE'),
      h('select', {class: 'wr-evsel', 'aria-label': 'Sự kiện đang làm', onchange: e => ctx.setEvent(e.target.value)}, h('option', {value: ''}, store.events.length ? 'Chưa chọn sự kiện' : 'Chưa có sự kiện'), store.events.filter(e => !e.archived || (cur && cur.id === e.id)).map(e => h('option', {value: e.id, selected: cur && cur.id === e.id}, `${e.code} — ${e.name}`))),
      h('span', {class: 'sp'}),
      h('span', {class: 'wr-chip ' + saveChip[0], title: s.error || 'Trạng thái lưu'}, h('i'), saveChip[1]),
      h('button', {class: 'wr-chip opt btnlike ' + (gs === 'connected' ? 'ok' : gs === 'expired' ? 'warn' : ''), title: 'Google Workspace — bấm để mở Cài đặt & Kết nối', onclick: () => ctx.go('settings')}, h('i'), gs === 'connected' ? 'Google: đã kết nối' : gs === 'expired' ? 'Google: cần kết nối lại' : 'Google: chưa kết nối'),
      h('button', {class: 'wr-chip opt btnlike ' + aiChip[0], title: a.error || 'AI trên máy — bấm để mở Cài đặt & Kết nối', onclick: () => ctx.go('settings')}, h('i'), aiChip[1]),
      a.busy > 0 && h('button', {class: 'wr-ib', title: 'Dừng tác vụ AI đang chạy', onclick: () => ai.stop()}, icon('stop'), 'Dừng'),
      h('button', {class: 'wr-ib', title: nN ? `${late} việc quá hạn · ${stale} mục cần rà lại` : 'Không có thông báo', 'aria-label': 'Thông báo', onclick: () => ctx.go(late ? 'tasks' : 'overview')}, icon('warn'), nN > 0 && h('em', {class: 'wr-badge'}, nN)),
      h('button', {class: 'wr-ib' + (st.cop ? ' on' : ''), 'aria-pressed': String(st.cop), title: 'Bật / tắt AI Copilot', onclick: () => { st.cop = !st.cop; keep(); render(); }}, icon('spark'), h('span', {class: 'lbl'}, 'Copilot')),
      h('button', {class: 'wr-exit', onclick: hide}, icon('door'), h('span', {class: 'lbl'}, 'BACK TO ROOM'))].filter(Boolean));
  }
  function renderCop() {
    if (!st.cop || st.mod === 'assistant') return cop.replaceChildren();
    const m = MODULES.find(x => x.id === st.mod), cur = ctx.event();
    cop.replaceChildren(h('header', {}, 'AI Copilot'), h('div', {class: 'ctx'}, h('div', {}, 'Đang ở: ', h('b', {}, m.name)), h('div', {}, 'Sự kiện: ', h('b', {}, cur ? `${cur.code} — ${cur.name}` : 'chưa chọn'))), chatPanel(ctx, {mod: st.mod, compact: true}));
  }
  function lockScreen() {
    const inp = h('input', {class: 'wr-in', type: 'password', placeholder: 'Mã khoá', 'aria-label': 'Mã khoá', autocomplete: 'off'}), msg = h('p', {class: 'wr-err'});
    const go = async e => { e.preventDefault(); if (await pinOk(store, inp.value)) { sessionStorage.setItem('vyWrUnlocked', '1'); render(); } else { msg.textContent = 'Mã khoá không đúng.'; inp.select(); } };
    setTimeout(() => inp.focus(), 50);
    return h('div', {class: 'wr-wrap'}, h('form', {class: 'wr-card wr-lock', onsubmit: go}, h('h3', {}, 'Workroom đang khoá'), h('p', {class: 'wr-empty'}, 'Nhập mã khoá để tiếp tục.'), h('div', {class: 'wr-form'}, inp, btn('Mở khoá', null, {type: 'submit'})), msg));
  }
  function render() {
    if (!st.open) return;
    flush();
    if (st.eventId && !store.eventOf(st.eventId)) st.eventId = null;
    const ae = document.activeElement, mark = ae && root.contains(ae) && ae !== main ? {label: ae.getAttribute('aria-label'), start: ae.selectionStart} : null, y = main.scrollTop;
    root.classList.toggle('cop', st.cop && st.mod !== 'assistant'); root.classList.toggle('locked', locked());
    renderSide(); renderTop();
    if (locked()) { cop.replaceChildren(); main.replaceChildren(lockScreen()); return; }
    renderCop();
    const m = MODULES.find(x => x.id === st.mod) || MODULES[0];
    let el; try { el = m.render(ctx); } catch (e) { console.error('[workroom] module ' + m.id, e); el = h('div', {class: 'wr-wrap'}, h('p', {class: 'wr-err'}, 'Module này gặp lỗi: ' + e.message)); }
    main.replaceChildren(el); main.scrollTop = y;
    if (mark && mark.label) { const t = [...root.querySelectorAll('[aria-label]')].find(x => x.getAttribute('aria-label') === mark.label && !x.disabled); if (t) { try { t.focus({preventScroll: true}); } catch (e) {} } }   // vẽ lại không làm mất chỗ đang gõ
  }
  store.on('change', render);
  store.on('save', () => { if (st.open) renderTop(); });
  ai.on(() => { if (st.open) renderTop(); });
  g.on(() => { if (st.open) render(); });
  let wasReady = ai.ready; ai.on(() => { if (ai.ready !== wasReady) { wasReady = ai.ready; render(); } });
  addEventListener('beforeunload', flush);

  function show(opt) {
    st.onClose = opt.onClose || null; st.open = true;
    render(); root.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('in')));
    main.focus({preventScroll: true});
    store.reload().catch(e => ctx.note('Không tải lại được dữ liệu: ' + e.message));
    ai.probe(); g.afterReturn().catch(() => {});
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
