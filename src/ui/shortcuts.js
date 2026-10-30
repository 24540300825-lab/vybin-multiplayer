// Phím tắt cho các tác vụ nhân vật (thay cho thanh hành động cũ). Lưu trên máy từng người (localStorage "vyKeys").
// Phát sự kiện window "vy:act" {detail: id}; game.js nghe và chạy đúng lệnh (đi, chạy, ngồi, gõ phím, rời ghế, ngủ, dậy).
export const ACTIONS = [
  {id: 'walk',  label: 'Đi bộ',               def: 'KeyQ'},
  {id: 'run',   label: 'Chạy',                def: 'KeyR'},
  {id: 'sit',   label: 'Ngồi',                def: 'KeyC'},
  {id: 'type',  label: 'Làm việc (gõ phím)',  def: 'KeyF'},
  {id: 'off',   label: 'Rời ghế',             def: 'KeyX'},
  {id: 'sleep', label: 'Ngủ',                 def: 'KeyZ'},
  {id: 'wake',  label: 'Dậy',                 def: 'KeyV'},
];
// phím cố định của game (không đổi được) — hiển thị để biết, và để không gán trùng
const FIXED = [
  ['W A S D', 'Di chuyển'], ['Shift', 'Giữ để chạy'], ['E', 'Tương tác: ngồi / ngủ / dậy gần đồ vật'],
  ['T', 'Mở chat'], ['M', 'Tắt / bật mic khi đang gọi'], ['Esc', 'Đóng hộp thoại'], ['F3', 'Thông số hiệu năng'],
];
const RESERVED = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyT', 'KeyM']);
const OK_CODE = /^(Key[A-Z]|Digit\d|Numpad\d|Arrow(Up|Down|Left|Right)|Backquote|Minus|Equal|Bracket(Left|Right)|Semicolon|Quote|Comma|Period|Slash|Backslash)$/;
const LS = 'vyKeys';

export function keyName(code) {
  if (!code) return '—';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6);
  const m = {ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\'};
  return m[code] || code;
}

const load = () => {
  const k = {};
  ACTIONS.forEach(a => { k[a.id] = a.def; });
  try { const s = JSON.parse(localStorage.getItem(LS) || 'null'); if (s) ACTIONS.forEach(a => { if (a.id in s && (s[a.id] === '' || OK_CODE.test(s[a.id]))) k[a.id] = s[a.id]; }); } catch (e) {}
  return k;
};

export function mountShortcuts({toast = () => {}} = {}) {
  const keys = load();
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(keys)); } catch (e) {} };
  let cap = null;                                   // đang chờ người dùng nhấn phím mới: {btn, id}
  const root = document.getElementById('sKeys');

  const stopCap = () => { if (!cap) return; cap.btn.classList.remove('cap'); cap = null; render(); };
  function render() {
    if (!root) return;
    root.innerHTML = '';
    const hint = document.createElement('p'); hint.className = 'kh';
    hint.textContent = 'Bấm vào phím để đổi, rồi nhấn phím mới. Esc = huỷ, Backspace = bỏ gán.';
    root.appendChild(hint);
    const list = document.createElement('div'); list.className = 'kl';
    ACTIONS.forEach(a => {
      const r = document.createElement('div'); r.className = 'kr';
      const s = document.createElement('span'); s.textContent = a.label;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'kb'; b.dataset.id = a.id;
      b.textContent = keys[a.id] ? keyName(keys[a.id]) : '—'; if (!keys[a.id]) b.classList.add('none');
      b.setAttribute('aria-label', a.label + ': ' + (keys[a.id] ? keyName(keys[a.id]) : 'chưa gán') + '. Bấm để đổi phím');
      b.onclick = () => { if (cap && cap.btn === b) { stopCap(); return; } stopCap(); cap = {btn: b, id: a.id}; b.classList.add('cap'); b.textContent = 'Nhấn phím…'; };
      r.append(s, b); list.appendChild(r);
    });
    root.appendChild(list);
    const fh = document.createElement('p'); fh.className = 'kh k2'; fh.textContent = 'Phím cố định'; root.appendChild(fh);
    const fl = document.createElement('div'); fl.className = 'kl';
    FIXED.forEach(([k, t]) => { const r = document.createElement('div'); r.className = 'kr fx'; const s = document.createElement('span'); s.textContent = t; const b = document.createElement('kbd'); b.textContent = k; r.append(s, b); fl.appendChild(r); });
    root.appendChild(fl);
    const rs = document.createElement('button'); rs.type = 'button'; rs.className = 'pl kreset'; rs.textContent = 'Khôi phục mặc định';
    rs.onclick = () => { ACTIONS.forEach(a => { keys[a.id] = a.def; }); save(); cap = null; render(); toast('Đã khôi phục phím tắt mặc định'); };
    root.appendChild(rs);
  }
  render();

  // chế độ bắt phím (chạy ở pha capture để game/chat không nhận phím này)
  addEventListener('keydown', e => {
    if (!cap) return;
    e.preventDefault(); e.stopPropagation();
    const id = cap.id;
    if (e.code === 'Escape') { stopCap(); return; }
    if (e.code === 'Backspace' || e.code === 'Delete') { keys[id] = ''; save(); cap = null; render(); return; }
    if (!OK_CODE.test(e.code)) { toast('Chỉ dùng được chữ, số, phím mũi tên hoặc dấu'); return; }
    if (RESERVED.has(e.code)) { toast('Phím ' + keyName(e.code) + ' đã dành cho game (xem mục Phím cố định)'); return; }
    const other = ACTIONS.find(a => a.id !== id && keys[a.id] === e.code);
    if (other) { toast('Phím ' + keyName(e.code) + ' đang dùng cho "' + other.label + '"'); return; }
    keys[id] = e.code; save(); cap = null; render();
  }, true);
  addEventListener('pointerdown', e => { if (cap && !e.target.closest('.kb')) stopCap(); }, true);

  // kích hoạt tác vụ
  addEventListener('keydown', e => {
    if (cap || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return;
    if (document.querySelector('.modal.on,#mpGate.on')) return;
    const a = ACTIONS.find(x => keys[x.id] && keys[x.id] === e.code);
    if (!a) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('vy:act', {detail: a.id}));
  });
  return {keys, ACTIONS};
}
