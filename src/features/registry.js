// DANH SÁCH TÍNH NĂNG ĐANG BẬT. Thêm 1 dòng để bật, xoá/ghi chú 1 dòng để tắt — không cần đụng file nào khác.
// Mỗi mục là hàm import động (chỉ tải khi bật). Xem docs/EXTENDING.md và src/features/_template.js.
export const FEATURES = [
  // () => import('./vi-du-vay-tay.js'),
  () => import('./khoai-nong.js'),   // minigame Khoai nóng (🥔) — rượt nhau ngoài vườn
  () => import('./tat-den-di-tron.js'),   // minigame Tắt đèn đi trốn (🔦) — trong nhà
];
