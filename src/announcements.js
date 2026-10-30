// Thông báo "cập nhật game" hiện trong trung tâm thông báo (chuông). Thêm bản mới: chèn 1 mục ĐẦU danh sách — id phải duy nhất.
// Mỗi mục: {id, date, title, items:[các dòng ngắn]}. Trạng thái "đã đọc" lưu trên máy từng người (localStorage).
export const NEWS = [
  {id: 'ui-figma', date: '30/10/2026', title: 'Giao diện mới (bản xem thử)', items: [
    'HUD dựng theo thiết kế Figma: hồ sơ + 4 thanh chỉ số, nhạc, đồng hồ, thanh hành động',
    'Trung tâm thông báo (chuông): tin nhắn, cuộc gọi nhỡ, bạn vào/ra phòng và cập nhật game',
    'Thu gọn / mở rộng hồ sơ, danh sách nhạc và thanh hành động; tự co giãn theo màn hình']},
  {id: 'stairs-anim', date: '30/10/2026', title: 'Cầu thang & hoạt ảnh mượt hơn', items: [
    'Cầu thang là dốc thẳng, chỉ lên/xuống qua chân và đỉnh cầu thang',
    'Giảm giật 1–2 khung hình trong hoạt ảnh; âm thanh gọn hơn, chú trọng âm gameplay']},
  {id: 'calls-sfx', date: '30/10/2026', title: 'Cuộc gọi & âm thanh', items: [
    'Cuộc gọi đến có popup + chuông, nhận / từ chối / báo cuộc gọi nhỡ',
    'Bộ âm thanh dịu hơn: gió, chim, dế, bước chân…']},
];
