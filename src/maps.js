import {SFX} from './sfx.js';
// Danh sách map (metadata + asset phụ thuộc). Thêm map mới: xem README → "Thêm map mới".
export const MAP_LIST = {
  living:   {name: 'Phòng khách', icon: '🛋️', desc: 'Phòng khách 2 tầng, cửa sang phòng Vy & Bin', assets: ['map-living', 'map-exterior']},
  vy:       {name: 'Phòng Vy', icon: '🌸', desc: 'Studio của Vy (gác lửng)', assets: ['map-vy', 'map-exterior']},
  bin:      {name: 'Phòng Bin', icon: '🛠️', desc: 'Studio của Bin (gác lửng)', assets: ['map-bin', 'map-exterior']},
  exterior: {name: 'Vườn ngoài nhà', icon: '🌳', desc: 'Sân vườn quanh nhà, cổng & hàng rào', assets: ['map-exterior']},
};
export const DEFAULT_MAP = 'living';
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
  try { localStorage.setItem('vyMap', id); sessionStorage.setItem('vyFrom', window.MAPID || ''); } catch (e) {}
  if (fade) { try { sessionStorage.setItem('vyFade', '1'); } catch (e) {} }   // trang mới bắt đầu từ đen rồi hiện dần ra ảnh loading
  const fd = document.getElementById('fade');
  if (fade && fd) fd.classList.add('on');
  // có trang vỏ: chỉ nạp lại khung game (cuộc gọi, nhạc, chat, phiên ở vỏ chạy tiếp không gián đoạn); không có vỏ: tải lại cả trang như cũ
  const sh = window.__vyShell;
  setTimeout(() => { if (sh && sh.go) sh.go(id); else { location.hash = 'map=' + id; location.reload(); } }, fade ? 620 : 0);
}
