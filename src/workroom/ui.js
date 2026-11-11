// PHÒNG VY — WORKROOM · tiện ích giao diện dùng chung (không phụ thuộc module nào).
export const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v);
  }
  for (const c of kids.flat(3)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};
const P = {   // icon nét 24×24
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', spark: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  pen: 'M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3', check2: 'M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.8M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11', list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.4-1.4L17 5l-3-1-1 2h-2L10 4 7 5l.4 1.9L6 8.3 4 8l-1 3 2 1v2l-2 1 1 3 2-.3 1.4 1.4L7 21l3 1 1-2h2l1 2 3-1-.4-1.9 1.4-1.4 2 .3 1-3-2-1z',
  tick: 'M5 12.5l4.5 4.5L19 7.5', x: 'M6 6l12 12M18 6L6 18', door: 'M14 4h5v16h-5M10 12H3M6 8l-4 4 4 4M14 4L8 6v12l6 2z', plus: 'M12 5v14M5 12h14', down: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  up: 'M12 20V9M7 13l5-5 5 5M5 4h14', send: 'M4 12l16-8-6 16-3-7z', stop: 'M7 7h10v10H7z', copy: 'M9 9h10v11H9zM5 15V4h10', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5', sheet: 'M5 4h14v16H5zM5 9h14M5 14h14M10 4v16', undo: 'M9 7L4 12l5 5M4 12h10a5 5 0 0 1 0 10h-2', redo: 'M15 7l5 5-5 5M20 12H10a5 5 0 0 0 0 10h2',
  film: 'M4 5h16v14H4zM4 9h16M4 15h16M8 5v4M12 5v4M16 5v4M8 15v4M12 15v4M16 15v4', chat: 'M4 5h16v11H9l-5 4z', flag: 'M5 21V4h11l-2 4 2 4H5', drive: 'M8 3h8l6 11-4 7H6l-4-7zM8 3l6 11M2 14h20M16 3l-8 14',
  warn: 'M12 4l9 16H3zM12 10v4M12 17h.01', ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
};
export const icon = k => h('span', {class: 'wr-ic', html: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[k] || ''}"/></svg>`});

export const fmtD = d => d ? new Date(d).toLocaleDateString('vi-VN', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '';
export const fmtDT = d => d ? new Date(d).toLocaleString('vi-VN', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : '';
export const head = (title, sub, ...right) => h('div', {class: 'wr-h'}, h('div', {}, h('h2', {}, title), sub && h('p', {}, sub)), h('span', {style: 'flex:1'}), ...right);
export const card = (title, meta, ...body) => h('section', {class: 'wr-card'}, h('h3', {}, title, meta != null && meta !== false && h('span', {}, meta)), ...body);
export const chip = (cls, text, title) => h('span', {class: 'wr-chip ' + cls, title}, h('i'), text);
export const btn = (label, onclick, o = {}) => h('button', {class: 'wr-btn' + (o.ghost ? ' ghost' : '') + (o.danger ? ' danger' : '') + (o.sm ? ' sm' : '') + (o.cls ? ' ' + o.cls : ''), type: o.type || 'button', disabled: o.disabled, title: o.title, onclick}, o.icon && icon(o.icon), label);
export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
// chạy thao tác có ghi dữ liệu; lỗi thì hiện ngay cạnh nút (không im lặng)
export const run = (errBox, fn) => async ev => {
  if (ev && ev.preventDefault) ev.preventDefault();
  if (errBox) errBox.textContent = '';
  try { await fn(ev); } catch (e) { console.error('[workroom]', e); if (errBox) errBox.textContent = 'Lỗi: ' + (e.message || e); }
};
export const errBox = () => h('div', {class: 'wr-err', role: 'alert'});

// ---- văn bản ↔ HTML của trình soạn thảo ----
export function textToHtml(text) {
  return String(text || '').replace(/\r/g, '').split(/\n{2,}|\n(?=\S)/).map(s => s.trim()).filter(Boolean).map(p => {
    const m = p.match(/^(#{1,3})\s+(.*)$/); if (m) return `<h${m[1].length + 1}>${esc(m[2])}</h${m[1].length + 1}>`;
    return `<p>${esc(p)}</p>`;
  }).join('\n');
}
export function htmlToText(html) {
  const d = document.createElement('div'); d.innerHTML = html || '';
  const out = [];
  d.querySelectorAll('h1,h2,h3,h4,p,li,blockquote').forEach(b => { if (b.closest('li') && b.tagName !== 'LI') return; const t = b.textContent.replace(/\s+/g, ' ').trim(); if (t) out.push((b.tagName === 'LI' ? '- ' : '') + t); });
  if (!out.length) { const t = d.textContent.trim(); if (t) out.push(t); }
  return out.join('\n\n');
}
// chỉ giữ các thẻ định dạng cơ bản (khi dán / nhập file / nhận từ AI)
export function cleanHtml(html) {
  const d = document.createElement('div'); d.innerHTML = html || '';
  const OK = new Set(['P', 'H2', 'H3', 'H4', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'BLOCKQUOTE', 'A']);
  const walk = n => { [...n.childNodes].forEach(c => {
    if (c.nodeType === 8) return c.remove(); if (c.nodeType !== 1) return;
    if (/^(SCRIPT|STYLE|IFRAME|OBJECT|IMG|SVG|META|LINK)$/i.test(c.tagName)) return c.remove();
    walk(c);
    if (c.tagName === 'H1') { const x = document.createElement('h2'); x.append(...c.childNodes); c.replaceWith(x); return; }
    if (c.tagName === 'DIV') { const x = document.createElement('p'); x.append(...c.childNodes); c.replaceWith(x); return; }
    if (!OK.has(c.tagName)) return c.replaceWith(...c.childNodes);
    [...c.attributes].forEach(a => { if (!(c.tagName === 'A' && a.name === 'href' && /^https?:/i.test(a.value))) c.removeAttribute(a.name); });
  }); };
  walk(d); return d.innerHTML;
}
// so sánh 2 văn bản theo từ → HTML có <ins>/<del>
export function wordDiff(a, b) {
  const A = String(a || '').split(/(\s+)/), B = String(b || '').split(/(\s+)/), n = A.length, m = B.length;
  if (n * m > 4e6) return `<del>${esc(a)}</del><br><ins>${esc(b)}</ins>`;
  const L = Array.from({length: n + 1}, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, out = '';
  while (i < n && j < m) { if (A[i] === B[j]) { out += esc(A[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out += `<del>${esc(A[i++])}</del>`; else out += `<ins>${esc(B[j++])}</ins>`; }
  while (i < n) out += `<del>${esc(A[i++])}</del>`; while (j < m) out += `<ins>${esc(B[j++])}</ins>`;
  return out.replace(/\n/g, '<br>');
}
// hộp thoại trong Workroom. buttons: [[nhãn, giá trị, kiểu('primary'|'danger'|'')]] → Promise<giá trị | null khi đóng>
export function dialog({title, body, buttons = [['Đóng', null]], wide = false}) {
  return new Promise(res => {
    const root = document.getElementById('wr') || document.body, prev = document.activeElement;
    const done = v => { ov.remove(); document.removeEventListener('keydown', key, true); try { prev && prev.focus(); } catch (e) {} res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    const box = h('div', {class: 'wr-dlg-box' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title},
      h('h3', {}, title), h('div', {class: 'wr-dlg-body'}, typeof body === 'string' ? h('p', {style: 'white-space:pre-wrap'}, body) : typeof body === 'function' ? body(v => done(v)) : body),
      h('div', {class: 'wr-dlg-act'}, buttons.map(([l, v, k]) => h('button', {class: 'wr-btn' + (k === 'primary' ? '' : k === 'danger' ? ' danger' : ' ghost'), onclick: () => done(typeof v === 'function' ? v() : v)}, l))));
    const ov = h('div', {class: 'wr-dlg', onclick: e => { if (e.target === ov) done(null); }}, box);
    root.append(ov); document.addEventListener('keydown', key, true);
    (box.querySelector('input,textarea,select') || box.querySelector('.wr-btn:not(.ghost)') || box.querySelector('button')).focus();
  });
}
export const confirmBox = (title, text, yes = 'Đồng ý', danger = false) => dialog({title, body: text, buttons: [['Huỷ', null], [yes, true, danger ? 'danger' : 'primary']]});
export const download = (blob, name) => { const a = h('a', {href: URL.createObjectURL(blob)}); a.setAttribute('download', name); document.body.append(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 4000); };
export const pickFile = accept => new Promise(res => { const i = h('input', {type: 'file', accept, style: 'display:none', onchange: () => { res(i.files[0] || null); i.remove(); }}); document.body.append(i); i.click(); });
export const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); return fn(...a); }; return d; };

// ---- menu ngữ cảnh: nút ⋯ và chuột phải dùng chung 1 danh sách thao tác ----
// items: [{label, icon, kbd, danger, disabled, on (dấu ✓), run}] | '-' (gạch ngăn) | {head:'Tiêu đề nhỏ'}
let openMenu = null;
export function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
export function menu(items, at) {
  closeMenu();
  const root = document.getElementById('wr') || document.body, list = items.filter(Boolean);
  const m = h('div', {class: 'wr-menu', role: 'menu'}, list.map(it => it === '-' ? h('div', {class: 'sep'}) : it.head ? h('div', {class: 'hd'}, it.head) :
    h('button', {role: 'menuitem', class: (it.danger ? 'danger' : '') + (it.on ? ' on' : ''), disabled: it.disabled, onclick: e => { e.stopPropagation(); closeMenu(); it.run && it.run(); }},
      h('span', {class: 'ic'}, it.on ? '✓' : it.icon ? icon(it.icon) : ''), h('span', {class: 'l'}, it.label), it.kbd ? h('kbd', {}, it.kbd) : null)));
  root.append(m); openMenu = m;
  const r = at && at.getBoundingClientRect ? at.getBoundingClientRect() : null, W = innerWidth, H = innerHeight, mw = m.offsetWidth, mh = m.offsetHeight;
  let x = r ? r.right - mw : at.x, y = r ? r.bottom + 4 : at.y;
  if (x + mw > W - 8) x = W - mw - 8; if (x < 8) x = 8; if (y + mh > H - 8) y = r ? Math.max(8, r.top - mh - 4) : Math.max(8, H - mh - 8);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  const btns = () => [...m.querySelectorAll('button:not(:disabled)')];
  m.addEventListener('keydown', e => { const b = btns(), i = b.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); b[(i + 1) % b.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); b[(i - 1 + b.length) % b.length].focus(); } else if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); at && at.focus && at.focus(); } });
  (btns()[0] || m).focus({preventScroll: true});
  return m;
}
addEventListener('mousedown', e => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }, true);
addEventListener('blur', closeMenu); addEventListener('resize', closeMenu);
// nút ⋯
export const moreBtn = (itemsFn, label = 'Thêm thao tác') => h('button', {class: 'wr-x wr-more', title: label, 'aria-label': label, 'aria-haspopup': 'menu', onclick: e => { e.stopPropagation(); e.preventDefault(); menu(itemsFn(), e.currentTarget); }}, '⋯');
// gắn chuột phải (và phím Menu / Shift+F10) cho 1 phần tử
export function withMenu(el, itemsFn) {
  el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); menu(itemsFn(), {x: e.clientX, y: e.clientY}); });
  el.addEventListener('keydown', e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); menu(itemsFn(), el); } });
  return el;
}
export async function ask(title, label, value = '') {
  const inp = h('input', {class: 'wr-in', value, 'aria-label': label, placeholder: label});
  const v = await dialog({title, body: h('label', {class: 'wr-f'}, h('span', {}, label), inp), buttons: [['Huỷ', null], ['Lưu', () => inp.value.trim(), 'primary']]});
  return v == null ? null : v;
}
