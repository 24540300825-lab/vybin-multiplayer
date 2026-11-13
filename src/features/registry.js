// DANH SÁCH TÍNH NĂNG ĐANG BẬT. Thêm 1 dòng để bật, xoá/ghi chú 1 dòng để tắt — không cần đụng file nào khác.
// Mỗi mục là hàm import động (chỉ tải khi bật). Xem docs/EXTENDING.md và src/features/_template.js.
export const FEATURES = [
  // () => import('./vi-du-vay-tay.js'),
  () => import('./khoai-nong.js'),   // minigame Khoai nóng (🥔) — rượt nhau ngoài vườn
  () => import('./tat-den-di-tron.js'),   // minigame Tắt đèn đi trốn (🔦) — trong nhà
  () => import('./workroom.js'),
  () => import('./house-upgrade.js'),   // NHÀ L2: nút 🏡 nâng cấp nhà (bản test: miễn phí) + đồng bộ cấp nhà 2 người   // PHÒNG VY — Workroom: ghim START WORKING ở bàn phòng Vy (chỉ chủ phòng)
  () => import('./seasons.js'),    // MÙA LỄ: lời chào, tuyết Giáng sinh, nút 🎄 đổi mùa (bản test)
  () => import('./photo.js'),      // 📸 chế độ chụp ảnh / photobooth (khung 9:16, 1:1, viền mùa lễ)
  () => import('./wardrobe.js'),   // 👗 tủ đồ: trang phục mùa lễ, đồng bộ cho người kia
  () => import('./fireworks.js'),  // 🎆 pháo hoa Năm mới + giao thừa (cả hai online, đếm ngược 10 giây)
];
