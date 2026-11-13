// MÙA LỄ (Giáng sinh, Năm mới, Tết Nguyên Đán…): tự bật theo NGÀY GIỜ VIỆT NAM (UTC+7), không phụ thuộc múi giờ của máy.
// Mỗi mùa có thể có (đều tuỳ chọn — thiếu file nào thì phần đó tự bỏ qua):
//   assets/season-<id>.glb            đồ trang trí (xem docs/SEASONS.md: node gốc đặt tên theo map, vd 'exterior', 'living@L2')
//   assets/frame-<id>-<tỉ lệ>.png      khung ảnh photobooth / chế độ chụp ảnh: tỉ lệ = 9x16 | 1x1 | full
//   assets/costume-<vy|bin>-<id>.glb   trang phục (tủ đồ hiện những bộ thuộc mùa đang bật — khai báo ở COSTUMES)
// Bản test: ?season=christmas (hoặc newyear / tet / off) trên URL, hoặc nút 🎄 trên thanh công cụ → ép mùa để thử.
export const SEASONS = {
  christmas: {name: 'Giáng sinh', icon: '🎄', weather: 'snow', ranges: [['12-01', '12-26']]},
  newyear: {name: 'Năm mới', icon: '🎆', ranges: [['12-27', '01-02']]},
  // Tết theo âm lịch → ghi theo từng năm: từ 23 tháng Chạp (ông Công ông Táo) tới mùng 7.
  tet: {name: 'Tết Nguyên Đán', icon: '🧧', dates: [['2027-01-30', '2027-02-12'], ['2028-01-19', '2028-02-01']]},
};

// Pháo hoa: bắn khi CẢ HAI cùng online (đếm ngược 10 giây trước giờ bắn). Giờ chính xác chốt sau → sửa `at` ở đây.
// Nếu tới giờ mà chưa đủ 2 người: trong `windowMin` phút sau đó, lúc cả hai cùng có mặt sẽ đếm ngược rồi bắn.
export const FIREWORKS = [
  {id: 'newyear-2027', label: 'Chào năm mới 2027', at: '2027-01-01T00:00:00+07:00', windowMin: 60, confirmed: false},
  {id: 'tet-2027', label: 'Giao thừa Tết Đinh Mùi', at: '2027-02-06T00:00:00+07:00', windowMin: 60, confirmed: false},
];

const KEY = 'vySeason';
const top_ = () => { try { return window.top.location; } catch (e) { return location; } };

// "giờ Việt Nam" của một thời điểm → {y, md:'MM-DD', ymd:'YYYY-MM-DD'}
export function vnDate(t = Date.now()) {
  const d = new Date(t + 7 * 3600e3);
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), dd = String(d.getUTCDate()).padStart(2, '0');
  return {y, md: m + '-' + dd, ymd: y + '-' + m + '-' + dd};
}

function inRange(md, a, b) { return a <= b ? md >= a && md <= b : md >= a || md <= b; }   // a > b: qua năm mới (27/12 → 02/01)

export function seasonOn(id, t = Date.now()) {
  const s = SEASONS[id]; if (!s) return false;
  const {md, ymd} = vnDate(t);
  if (s.ranges && s.ranges.some(([a, b]) => inRange(md, a, b))) return true;
  if (s.dates && s.dates.some(([a, b]) => ymd >= a && ymd <= b)) return true;
  return false;
}

// mùa đang bật: ép tay (URL ?season= / nút thử) > theo lịch. 'off' = tắt hẳn.
export function forcedSeason() {
  try { const m = (top_().search.match(/[?&]season=(\w+)/) || location.search.match(/[?&]season=(\w+)/)); if (m) return m[1]; } catch (e) {}
  try { return localStorage.getItem(KEY) || null; } catch (e) { return null; }
}
export function activeSeason(t = Date.now()) {
  const f = forcedSeason();
  if (f === 'off') return null;
  if (f && SEASONS[f]) return f;
  return Object.keys(SEASONS).find(id => seasonOn(id, t)) || null;
}
export function forceSeason(id) {      // null = theo lịch
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch (e) {}
}
