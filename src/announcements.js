// Thông báo "cập nhật game" hiện trong trung tâm thông báo (chuông). Thêm bản mới: chèn 1 mục ĐẦU danh sách — id phải duy nhất.
// Mỗi mục: {id, date, title, items:[các dòng ngắn]}. Trạng thái "đã đọc" lưu trên máy từng người (localStorage).
export const NEWS = [
  {id: 'quests-bag', date: '03/11/2026', title: 'Nhiệm vụ, Túi đồ & Kho nhà', items: [
    'Nhiệm vụ (lá cờ, phím J): 3 mục tiêu mỗi ngày, 3 mục tiêu mỗi tuần, và 1 nhiệm vụ chung Bin + Vy góp Điểm Kiến Tạo cho nhà. Bỏ lỡ không bị phạt',
    'Túi đồ (phím B): lưới đồ có lọc & tìm, xem chi tiết từng món; Kho nhà chung để cất / lấy đồ cho cả hai',
    'Nguyên liệu đầu tiên: Gỗ, Đá, Sợi thực vật, Vải, Linh kiện kim loại — nhận từ nhiệm vụ',
    'Hướng dẫn người mới 5 bước (bỏ qua được, bật lại trong Nhiệm vụ → Hướng dẫn)']},
  {id: 'sys-notify', date: '03/11/2026', title: 'Thông báo trên máy', items: [
    'Có tin nhắn, cuộc gọi, người kia vào nhà… khi bạn đang ở tab khác hoặc app khác → hiện thông báo ở góc màn hình như Zalo/Messenger',
    'Cuộc gọi đến có nút Nghe / Từ chối ngay trên thông báo',
    'Bật/tắt: Cài đặt → Thông báo trên máy. iPhone: thêm game vào Màn hình chính rồi mở từ đó']},
  {id: 'dot1-account', date: '03/11/2026', title: 'Tài khoản & tiến trình (Đợt 1)', items: [
    'Đăng nhập bằng Google — mỗi tài khoản gắn cố định 1 nhân vật, vào máy nào cũng đúng tiến trình',
    'Cấp độ + XP thật, ví Xu riêng, Điểm Kiến Tạo là quỹ chung của nhà',
    'Hộp quà (quà chào mừng 200 Xu, quà lên cấp, thành tựu) — nút sao trên thanh trên cùng',
    'Phiên tập trung 25/50 phút (nút bàn phím): làm việc thật, hết giờ nhận Xu + XP + điểm Sáng tạo',
    '"Việc hôm nay" đồng bộ giữa laptop và điện thoại; Cài đặt → Tài khoản để đăng xuất']},
  {id: 'ui-figma', date: '30/10/2026', title: 'Giao diện mới (bản xem thử)', items: [
    'HUD dựng theo thiết kế Figma: hồ sơ + 4 thanh chỉ số, nhạc, đồng hồ',
    'Thay thanh hành động bằng phím tắt: Q đi · R chạy · C ngồi · F làm việc · X rời ghế · Z ngủ · V dậy (đổi được trong Cài đặt → Phím tắt)',
    'Trung tâm thông báo (chuông): tin nhắn, cuộc gọi nhỡ, bạn vào/ra phòng và cập nhật game',
    'Thu gọn / mở rộng hồ sơ và danh sách nhạc; tự co giãn theo màn hình']},
  {id: 'stairs-anim', date: '30/10/2026', title: 'Cầu thang & hoạt ảnh mượt hơn', items: [
    'Cầu thang là dốc thẳng, chỉ lên/xuống qua chân và đỉnh cầu thang',
    'Giảm giật 1–2 khung hình trong hoạt ảnh; âm thanh gọn hơn, chú trọng âm gameplay']},
  {id: 'calls-sfx', date: '30/10/2026', title: 'Cuộc gọi & âm thanh', items: [
    'Cuộc gọi đến có popup + chuông, nhận / từ chối / báo cuộc gọi nhỡ',
    'Bộ âm thanh dịu hơn: gió, chim, dế, bước chân…']},
];
