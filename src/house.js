// Cấp nhà (L1 → L2 → …). Nhà bắt đầu ở L1; lên L2 thì mở tầng trên: Phòng Game, Bếp + hiên ăn, Phòng kỷ niệm, Vườn kính.
// L2 = file riêng assets/map-house-l2.glb (chỉ phần XẾP CHỒNG lên nhà L1) — map-exterior.glb giữ nguyên, không bị thay.
//
// HOUSE_RULES.mode:
//   'test' — bản thử (nhánh test): nút 🏡 nâng / hạ cấp MIỄN PHÍ, lưu trên máy (localStorage) + báo cho người kia.
//   'live' — bản chính: chỉ mở khi tới ngày openAt VÀ trả đủ Điểm Kiến Tạo (game_config.house_levels.costs). Làm khi chốt.
export const HOUSE_RULES = {mode: 'test', openAt: null, maxLevel: 2};

const KEY = 'vyHouseLv';
const top_ = () => { try { return window.top.location; } catch (e) { return location; } };

export function houseLevel() {
  try {
    const m = (top_().search.match(/[?&]house=(\d)/) || location.search.match(/[?&]house=(\d)/));
    if (m) return Math.max(1, Math.min(HOUSE_RULES.maxLevel, +m[1]));
  } catch (e) {}
  let v = 1;
  try { v = +(localStorage.getItem(KEY) || 1) || 1; } catch (e) {}
  return Math.max(1, Math.min(HOUSE_RULES.maxLevel, v));
}

export function setHouseLevel(n) {
  n = Math.max(1, Math.min(HOUSE_RULES.maxLevel, n | 0));
  try { localStorage.setItem(KEY, String(n)); } catch (e) {}
  return n;
}

// map nào cần cấp nhà bao nhiêu (khớp MAP_LIST[id].minHouse)
export function mapAllowed(list, id) {
  const m = list && list[id];
  return !!m && (m.minHouse || 1) <= houseLevel();
}
