// PHÒNG VY — WORKROOM · khung Work Mode (sidebar, thanh trên, vùng làm việc, AI Copilot).
// Chạy ở TRANG VỎ (shell) nên game 3D bên dưới giữ nguyên trạng thái; cuộc gọi, nhạc, chat không đứt.
// Chỉ được tải khi Vy mở Work Mode lần đầu (lazy) — không làm nặng lúc vào game.
import {createStore} from './store.js';
import {MODULES, h, icon} from './modules.js';

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
    const l = h('link', {id: 'wrCss', rel: 'stylesheet', href: 'workroom.css?v=1'}); l.onload = l.onerror = res; document.head.append(l);
  });
  const store = await createStore(SH);          // ném 'not_owner' nếu máy chủ không xác nhận là chủ phòng
  const st = {mod: 'overview', eventId: null, cop: false, onClose: null, open: false};
  try { const s = JSON.parse(localStorage.getItem('vyWorkroomUi') || '{}'); if (MODULES.some(m => m.id === s.mod)) st.mod = s.mod; st.cop = !!s.cop; st.eventId = s.eventId || null; } catch (e) {}
  const keep = () => { try { localStorage.setItem('vyWorkroomUi', JSON.stringify({mod: st.mod, cop: st.cop, eventId: st.eventId})); } catch (e) {} };

  const root = h('div', {id: 'wr', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Phòng Vy — Workroom'});
  const side = h('nav', {class: 'wr-side', 'aria-label': 'Các khu làm việc'});
  const top = h('header', {class: 'wr-top'});
  const main = h('main', {class: 'wr-main', tabIndex: -1});
  const cop = h('aside', {class: 'wr-cop', 'aria-label': 'AI Copilot'});
  const noteEl = h('div', {class: 'wr-note', role: 'status'});
  root.append(side, top, h('div', {class: 'wr-body'}, main, cop), noteEl);
  document.body.append(root);

  let noteT = 0;
  const ctx = {
    store, ui: {}, err: null,
    event: () => store.eventOf(st.eventId) || null,
    setEvent(id) { st.eventId = id || null; keep(); render(); },
    go(id) { if (MODULES.some(m => m.id === id)) { st.mod = id; keep(); render(); main.scrollTop = 0; main.focus({preventScroll: true}); } },
    render: () => render(),
    note(m) { noteEl.textContent = m; noteEl.classList.add('on'); clearTimeout(noteT); noteT = setTimeout(() => noteEl.classList.remove('on'), 2600); },
  };

  function renderSide() {
    side.replaceChildren(
      h('div', {class: 'wr-brand'}, 'PHÒNG VY', h('small', {}, 'Workroom')),
      ...MODULES.flatMap(m => [m.sep && h('div', {class: 'wr-sep'}),
        h('button', {class: 'wr-nav' + (st.mod === m.id ? ' on' : ''), 'aria-current': st.mod === m.id ? 'page' : null, title: m.ms ? `${m.name} — mở ở milestone ${m.ms}` : m.name, onclick: () => ctx.go(m.id)},
          icon(m.icon), h('span', {}, m.name), m.ms && h('em', {}, 'M' + m.ms))]).filter(Boolean),
      h('span', {class: 'sp'}),
      store.local && h('div', {class: 'wr-dev'}, 'BẢN THỬ — dữ liệu chỉ lưu trên trình duyệt này, không phải dữ liệu thật.'));
  }
  function renderTop() {
    const s = store.save, cur = ctx.event();
    const saveChip = s.state === 'saving' ? ['warn', 'Đang lưu…'] : s.state === 'error' ? ['bad', 'Lưu lỗi'] : ['ok', s.at ? 'Đã lưu ' + s.at.toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'}) : 'Đã lưu'];
    top.replaceChildren(
      h('h1', {}, 'PHÒNG VY — WORKSPACE'),
      h('select', {class: 'wr-evsel', 'aria-label': 'Sự kiện đang làm', onchange: e => ctx.setEvent(e.target.value)},
        h('option', {value: ''}, store.events.length ? 'Chưa chọn sự kiện' : 'Chưa có sự kiện'),
        store.events.filter(e => !e.archived).map(e => h('option', {value: e.id, selected: cur && cur.id === e.id}, `${e.code} — ${e.name}`))),
      h('span', {class: 'sp'}),
      h('span', {class: 'wr-chip ' + saveChip[0], title: s.error || 'Trạng thái lưu'}, h('i'), saveChip[1]),
      h('span', {class: 'wr-chip opt', title: 'Google Workspace — kết nối ở milestone 4'}, h('i'), 'Google: chưa kết nối'),
      h('span', {class: 'wr-chip opt', title: 'AI trên máy (Ollama) — thiết lập ở milestone 2'}, h('i'), 'AI: chưa thiết lập'),
      h('button', {class: 'wr-ib' + (st.cop ? ' on' : ''), 'aria-pressed': String(st.cop), title: 'Bật / tắt AI Copilot', onclick: () => { st.cop = !st.cop; keep(); render(); }}, icon('spark'), 'Copilot'),
      h('button', {class: 'wr-exit', onclick: hide}, icon('door'), 'BACK TO ROOM'));
  }
  function renderCop() {
    const m = MODULES.find(x => x.id === st.mod), cur = ctx.event();
    cop.replaceChildren(
      h('header', {}, 'AI Copilot'),
      h('div', {class: 'ctx'}, h('div', {}, 'Đang ở: ', h('b', {}, m.name)), h('div', {}, 'Sự kiện: ', h('b', {}, cur ? `${cur.code} — ${cur.name}` : 'chưa chọn'))),
      h('div', {class: 'msg'}, 'AI trên máy chưa được thiết lập nên Copilot chưa trả lời được. Khi xong milestone 2, Copilot sẽ tự biết Vy đang ở module nào và sự kiện nào như hiển thị phía trên.'),
      h('span', {class: 'sp'}),
      h('footer', {}, h('textarea', {disabled: true, placeholder: 'Chưa dùng được — đang chờ AI trên máy', 'aria-label': 'Nhắn cho Copilot'})));
  }
  function render() {
    if (st.eventId && !store.eventOf(st.eventId)) st.eventId = null;
    root.classList.toggle('cop', st.cop);
    renderSide(); renderTop(); renderCop();
    const m = MODULES.find(x => x.id === st.mod) || MODULES[0];
    let el; try { el = m.render(ctx); } catch (e) { console.error('[workroom] module ' + m.id, e); el = h('div', {class: 'wr-wrap'}, h('p', {class: 'wr-err'}, 'Module này gặp lỗi: ' + e.message)); }
    main.replaceChildren(el);
  }
  store.on('change', () => { if (st.open) render(); });
  store.on('save', () => { if (st.open) renderTop(); });

  function show(opt) {
    st.onClose = opt.onClose || null; st.open = true;
    render(); root.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('in')));
    main.focus({preventScroll: true});
    store.reload().catch(e => ctx.note('Không tải lại được dữ liệu: ' + e.message));
  }
  function hide() {
    if (!st.open) return; st.open = false;
    root.classList.remove('in');
    setTimeout(() => { if (!st.open) root.classList.remove('on'); }, 300);
    const cb = st.onClose; st.onClose = null;
    try { cb && cb(); } catch (e) {}
    try { SH.frame.focus(); SH.frame.contentWindow.focus(); } catch (e) {}
  }
  return {show, hide, isOpen: () => st.open, store};
}
