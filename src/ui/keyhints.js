// Dòng hướng dẫn phím luôn hiện (text) ở đáy màn hình — cùng một bộ lệnh cho phím lẫn chuột, tự cập nhật theo phím người chơi đã gán & chế độ đang chạy/đi bộ.
import {keyName, ACTIONS} from './shortcuts.js';

export function mountKeyHints(keys) {
  if (!matchMedia('(pointer:fine)').matches) return;        // cảm ứng: không có bàn phím
  const el = document.createElement('div'); el.id = 'kHint'; el.className = 'hud'; el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  const item = (k, t) => `<span class="ki"><kbd>${k}</kbd>${t}</span>`;
  let last = '';
  const render = () => {
    const run = !!(window.__runMode && window.__runMode.v);
    const k = id => keys[id] ? keyName(keys[id]) : null;
    const parts = [item('WASD', 'Di chuyển'), item('Click', 'Đi tới điểm')];
    if (k('run')) parts.push(item(k('run'), run ? 'Đang chạy · đi bộ' : 'Chạy'));
    if (k('walk') && run) parts.push(item(k('walk'), 'Đi bộ'));
    parts.push(item('E', 'Tương tác'));
    [['sit', 'Ngồi'], ['type', 'Làm việc'], ['off', 'Rời ghế'], ['sleep', 'Ngủ'], ['wake', 'Dậy']].forEach(([id, t]) => { if (k(id)) parts.push(item(k(id), t)); });
    parts.push(item('T', 'Chat'));
    const h = parts.join('');
    if (h !== last) { last = h; el.innerHTML = h; }
  };
  render();
  addEventListener('vy:mode', render); addEventListener('vy:act', () => setTimeout(render, 30));
  setInterval(render, 800);
}
