import {SFX} from './sfx.js';
// Danh sách map (metadata + asset phụ thuộc). Thêm map mới: xem README → "Thêm map mới".
export const MAP_LIST = {
  studio: {name: 'Studio (cũ)', icon: '🏢', desc: 'Gác lửng 1 cầu thang, vườn cây', assets: ['map-studio']},
  house:  {name: 'Nhà 2 tầng (mới)', icon: '🏠', desc: '2 cầu thang, giường & bàn làm việc', assets: ['map-house']},
};
export const DEFAULT_MAP = 'house';
export const isMap = id => Object.prototype.hasOwnProperty.call(MAP_LIST, id);

// Quản lý chuyển map: nạp trước (HTTP cache) + fade + tải lại có giữ phiên.
// (Mỗi map dựng collider/A*/shader riêng nên chuyển map = khởi tạo lại engine; xem README "Giới hạn".)
import {FILES} from './manifest.js';
const warmed = new Set();
export function prefetchMap(id) {
  if (!isMap(id) || warmed.has(id)) return;
  warmed.add(id);
  for (const a of MAP_LIST[id].assets) {
    const f = FILES[a]; if (!f) continue;
    fetch(`assets/${f.file}?v=${f.v}`, {priority: 'low'}).then(r => r.arrayBuffer()).catch(() => warmed.delete(id));
  }
}
export function goToMap(id, {fade = true} = {}) {
  try { SFX.play('whoosh'); } catch (e) {}
  try { localStorage.setItem('vyMap', id); } catch (e) {}
  if (fade) { try { sessionStorage.setItem('vyFade', '1'); } catch (e) {} }   // trang mới bắt đầu từ đen rồi hiện dần ra ảnh loading
  const fd = document.getElementById('fade');
  if (fade && fd) fd.classList.add('on');
  setTimeout(() => { location.hash = 'map=' + id; location.reload(); }, fade ? 620 : 0);
}
