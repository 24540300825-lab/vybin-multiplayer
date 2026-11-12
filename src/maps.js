import {SFX} from './sfx.js';
// Danh sách map (metadata + asset phụ thuộc). Thêm map mới: xem README → "Thêm map mới".
export const MAP_LIST = {
  living:   {name: 'Phòng khách', icon: '🛋️', desc: 'Phòng khách 2 tầng, cửa sang phòng Vy & Bin', assets: ['map-living', 'map-exterior']},
  vy:       {name: 'Phòng Vy', icon: '🌸', desc: 'Studio của Vy (gác lửng)', assets: ['map-vy', 'map-exterior']},
  bin:      {name: 'Phòng Bin', icon: '🛠️', desc: 'Studio của Bin (gác lửng)', assets: ['map-bin', 'map-exterior']},
  exterior: {name: 'Vườn ngoài nhà', icon: '🌳', desc: 'Sân vườn quanh nhà, cổng & hàng rào', assets: ['map-exterior']},
  // ===== nhà L2 (tầng trên) — chỉ vào được khi nhà đã lên cấp 2 (src/house.js) =====
  game:       {name: 'Phòng Game', icon: '🕹️', desc: 'Tầng 2 trên phòng khách: arcade, bi lắc, cờ, sofa xem TV', assets: ['map-game', 'map-exterior'], minHouse: 2},
  workshop:   {name: 'Xưởng thủ công', icon: '🧵', desc: 'Tầng 2 trên phòng Bin: bàn chế tạo, tường dụng cụ, giá vẽ + hiên ăn ngoài trời', assets: ['map-workshop', 'map-exterior'], minHouse: 2},
  memory:     {name: 'Phòng kỷ niệm', icon: '💌', desc: 'Tầng 2 trên phòng Vy: tường ảnh, hộp thư, quỹ chung', assets: ['map-memory', 'map-exterior'], minHouse: 2},
  greenhouse: {name: 'Vườn kính', icon: '🌿', desc: 'Nhà kính trên sân thượng: trồng cây + góc nghe nhạc', assets: ['map-greenhouse', 'map-exterior'], minHouse: 2},
  // ===== nhà L3 — nhà vườn, tháp, tầng hầm (src/house.js) =====
  karaoke:    {name: 'Karaoke & phòng nhạc', icon: '🎤', desc: 'Nhà vườn cạnh phòng Bin: sân khấu, màn hình karaoke, đàn', assets: ['map-karaoke', 'map-exterior'], minHouse: 3},
  spa:        {name: 'Spa / onsen', icon: '♨️', desc: 'Nhà vườn cạnh phòng Vy: bồn onsen, giường massage', assets: ['map-spa', 'map-exterior'], minHouse: 3},
  library:    {name: 'Thư viện', icon: '📚', desc: 'Tháp trên Phòng kỷ niệm: kệ sách, góc đọc, sân ngắm sao', assets: ['map-library', 'map-exterior'], minHouse: 3},
  cinema:     {name: 'Rạp phim', icon: '🎬', desc: 'Tầng hầm dưới phòng khách: màn chiếu lớn, ghế đôi, bắp nước', assets: ['map-cinema'], minHouse: 3},
  // ===== nhà L4 — khu nghỉ dưỡng (src/house.js) =====
  master:     {name: 'Phòng ngủ master', icon: '🛏️', desc: 'Tháp trên Xưởng thủ công: giường đôi, ban công, bồn tắm cạnh cửa sổ', assets: ['map-master', 'map-exterior'], minHouse: 4},
  pets:       {name: 'Phòng thú cưng', icon: '🐾', desc: 'Nhà vườn cạnh đồi hoa: ổ nằm, bát ăn, bồn tắm thú, sân chơi có rào', assets: ['map-pets', 'map-exterior'], minHouse: 4},
  cafe:       {name: 'Café bên hồ', icon: '☕', desc: 'Sau khu BBQ: quầy, tủ bánh, lò nướng, hiên gỗ nhô ra mặt hồ', assets: ['map-cafe', 'map-exterior'], minHouse: 4},
  bowling:    {name: 'Hầm bowling & bể cá', icon: '🎳', desc: 'Tầng hầm dưới cánh Vy, cửa thông Rạp phim: 2 làn bowling, bể cá lớn, quầy nước', assets: ['map-bowling'], minHouse: 4},
};
export const DEFAULT_MAP = 'living';
export const isMap = id => Object.prototype.hasOwnProperty.call(MAP_LIST, id);
// nhà đã đủ cấp để vào map này chưa (map tầng trên cần nhà L2)
import {houseLevel} from './house.js';
export const mapOpen = id => isMap(id) && (MAP_LIST[id].minHouse || 1) <= houseLevel();
// asset thật sự cần nạp cho map (nhà ≥ L2: nạp thêm phần tầng trên)
// nhà ≥ L2: ngoại cảnh (vườn + vỏ nhà) đổi sang map-exterior-l2 = map-exterior bản chính, chỉ thay phần nhà bằng nhà L2
export const extAsset = () => (houseLevel() >= 4 ? 'map-exterior-l4' : houseLevel() >= 3 ? 'map-exterior-l3' : houseLevel() >= 2 ? 'map-exterior-l2' : 'map-exterior');
export const mapAssets = id => MAP_LIST[id].assets.map(a => (a === 'map-exterior' ? extAsset() : a));

// Quản lý chuyển map: nạp trước (HTTP cache) + fade + tải lại có giữ phiên.
// (Mỗi map dựng collider/A*/shader riêng nên chuyển map = khởi tạo lại engine; xem README "Giới hạn".)
import {FILES} from './manifest.js';
const warmed = new Set();
export function prefetchMap(id) {
  if (!isMap(id) || warmed.has(id)) return;
  warmed.add(id);
  for (const a of mapAssets(id)) {
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
