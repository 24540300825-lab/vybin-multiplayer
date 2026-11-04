// Cột nút chức năng nhân vật ở MÉP PHẢI màn hình (kiểu danh sách nhân vật của Genshin): mỗi nút = 1 lệnh, bấm chuột hoặc nhấn phím đều chạy cùng một lệnh.
// Hiện phím đã gán (đổi được trong Cài đặt) và nhãn; nút Chạy sáng lên khi đang ở chế độ chạy.
import {keyName} from './shortcuts.js';

export function mountKeyHints(keys) {
  const el = document.createElement('div'); el.id = 'kSide'; el.className = 'hud';
  document.body.appendChild(el);
  const LIST = [['run', 'Chạy'], ['walk', 'Đi bộ'], ['sit', 'Ngồi'], ['type', 'Làm việc'], ['off', 'Rời ghế'], ['sleep', 'Ngủ'], ['wake', 'Dậy']];
  let last = '';
  const render = () => {
    const run = !!(window.__runMode && window.__runMode.v);
    const h = LIST.filter(([id]) => keys[id] && !(id === 'walk' && !run)).map(([id, t]) =>
      `<button type="button" class="ks${id === 'run' && run ? ' on' : ''}" data-a="${id}" title="${t}"><span>${id === 'run' && run ? 'Đang chạy' : t}</span><kbd>${keyName(keys[id])}</kbd></button>`).join('');
    if (h !== last) { last = h; el.innerHTML = h; }
  };
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) window.dispatchEvent(new CustomEvent('vy:act', {detail: b.dataset.a})); });
  render();
  addEventListener('vy:mode', render); addEventListener('vy:act', () => setTimeout(render, 30));
  setInterval(render, 800);
}
