# Giao diện (HUD) — theo thiết kế Figma

Nguồn: file Figma "Untitled" (Frame 2, 1920×1080). Mọi cỡ / khoảng cách / padding đều là **bội số của 4**.
Trong CSS dùng `rem` với **1rem = 16 px thiết kế** (4px = .25rem, 8 = .5rem, 12 = .75rem, 24 = 1.5rem, 64 = 4rem…).
Màn hình thật co giãn theo `--u` (1 px thiết kế): màn 1920×1080 → 1px; nhỏ hơn thì nhỏ theo; dưới 1180px ngang hoặc 640px cao → chế độ **gọn**.

## File
| File | Việc |
|---|---|
| `ui.css` | Toàn bộ giao diện HUD: token (màu, font, cỡ), thẻ nhân vật, thanh icon, nhạc, đồng hồ, thanh hành động, panel, hộp thoại, chat, cuộc gọi, responsive |
| `index.html` | Khung HTML của HUD (id các phần tử là "hợp đồng" với JS — đừng đổi id) |
| `src/hud.js` | Logic HUD: chỉ số, đồng hồ, việc, nhạc, cài đặt, bản đồ, thu gọn/mở rộng |
| `src/ui/icons.js` | Bộ icon SVG (`ic('tên')`, hoặc `<i data-ic="tên">`) |
| `src/ui/notify.js` + `src/announcements.js` | Trung tâm thông báo (chuông) + danh sách "Cập nhật game" |
| `src/ui/mp-ui.js`, `chat-notify.js`, `call-ring.js`, `music-ui.js` | UI multiplayer (thẻ đối phương, chat, cuộc gọi, popup, YouTube) |
| `assets/ui/` | Ảnh avatar Vy/Bin (+ bản xám), ảnh bìa nhạc — lấy từ Figma (đặt tên có `.v1` vì thư mục `assets/` cache 1 năm; đổi ảnh thì đổi `.v2`) |

## Token (từ Figma)
- **Capsule**: gradient `#7e7878 → #e4e4e4`, fill opacity **50%**, blend *multiply* ≡ phủ đen alpha `.26 → .052` (`--cap`; nhạc + đồng hồ dùng `--cap-h`: điểm dừng đầu ở 50%). Kèm **Background blur 10** của Figma = `backdrop-filter: blur(5px thiết kế)` (`--blur`, Figma tính blur theo đường kính, CSS theo bán kính nên 10 → 5). Thẻ Bin / đồng hồ bo 32, thẻ Vy / nhạc bo tròn hết.
- **Pill thời tiết / chip / ô nhập**: nền `rgba(0,0,0,.46)`, viền trắng 1px, bo tròn.
- **Thanh chỉ số**: rãnh `#242424`, cao 12, đầu trái thon; đỏ `#d25353` (Sức khỏe), cam `#ffb84d` (Thể lực), xanh lá `#8be28b` (Tâm trạng), **xanh dương `#6fa8ff` (Tập trung — màu thêm)**.
- **Chữ**: tên / giờ / tiêu đề = **Audex** (24 / 64 / 24); nội dung = **Nunito Sans Bold** (12–20); chữ phụ `#c3c1c1`. Màu nhấn (nút chính, mục đang chọn) `#ffd581`.
- Thanh icon trên cùng: mỗi icon nằm giữa **ô 36×36** (font-size 2.25rem), tâm cách đều 84; nút bấm 48. Icon giữ đúng kích thước thật trong Figma (đã thu nhỏ): bell 29×32, chat 34×32, mic 20×32, video 30×19, camera 33×25, ghim 24×32, cài đặt 33×32; căn tâm cả hai chiều. Nhạc: prev/next 20×16, pause 16×16 (font-size 1.5rem).

## Font Audex
Chưa có file font nên đang dùng **Nunito** thay tạm. Khi có `audex.woff2` (hoặc `.ttf`): đặt vào `assets/fonts/`, bỏ ghi chú khối `@font-face` ở đầu `ui.css`. Không cần sửa gì khác (biến `--f-d` đã ưu tiên Audex).

## Căn lề (quy tắc "thẳng hàng")
- **Tâm avatar thẳng trục x = 116**: avatar Bin (128) = avatar Vy (64) = album nhạc (64); capsule Vy/nhạc lùi vào cho đúng (hồ sơ thu gọn thì thẻ Vy lùi theo). Lề dưới chung **64**: capsule nhạc = đồng hồ = thông báo nhanh (toast). Lề phải chung **96**: mép capsule đồng hồ = mép phải icon cài đặt (đã bù khoảng trống 2 bên của icon, `#hTop` margin âm). Đỉnh chung **56**: đỉnh avatar Bin = đỉnh các icon.
- Chữ số lớn (giờ, số chỉ số) dùng `text-box: trim-both cap alphabetic` để **tâm chữ số** trùng tâm ô/thanh, không phụ thuộc font (trình duyệt cũ chưa hỗ trợ thì tự căn giữa theo dòng).
- Nút mở danh sách nhạc là "tay nắm" tròn giữa mép trên capsule nhạc (màn lớn) để capsule giữ đúng 552 như Figma.

## Icon
`src/ui/icons.js`: icon của Figma (chuông, chat, mic, video, camera, ghim, cài đặt, prev/next/pause, mây-thời-tiết) là **SVG gốc xuất từ Figma**, mỗi icon đặt giữa ô vuông (40×40; nhạc / mây 32×32) đúng cỡ thật — dùng `font-size: 2.5rem` (= 40 px thiết kế) cho thanh trên, `2rem` cho nhạc. Phần còn lại (tasks, hành động, đóng, cộng…) sinh từ react-icons (Bootstrap / Ant Design / Font Awesome 6 / Material / Phosphor).
Còn thiếu icon gốc trong Figma cho: tasks (đang dùng bi:clipboard2-check-fill), 7 nút thanh hành động, bộ icon thời tiết (trừ mây), mic-off / video-off, v.v.

## Thu gọn / mở rộng (nhớ trên máy từng người, khoá `vyUi`)
Hồ sơ (mũi tên trên thẻ Bin), thanh hành động (mũi tên bên phải), danh sách nhạc (mũi tên trên pill nhạc), panel Việc (nút trên thanh icon). Màn nhỏ: hồ sơ mặc định thu gọn, nhạc chỉ còn ảnh bìa, đồng hồ chỉ còn giờ, thanh hành động chỉ còn icon.

## Thông báo (chuông)
`Notify.add({type:'chat'|'call'|'peer', title, body, go})` từ bất kỳ module nào. Đã nối: tin nhắn mới, cuộc gọi nhỡ / bị từ chối, bạn vào / rời phòng. Thông báo cập nhật game: thêm 1 mục **đầu** `NEWS` trong `src/announcements.js` (id duy nhất) — chấm đỏ trên chuông hiện đến khi người chơi mở bảng.

## Thêm nút vào thanh icon (tính năng cắm thêm)
`ctx.ui.addButton({icon, label, title, onClick})` vẫn dùng được: nút nhận `icon` (emoji hoặc chuỗi SVG) hiển thị đơn giản; `label`/`title` hiện khi rê chuột.

## Phím tắt (thay cho thanh hành động cũ)
`src/ui/shortcuts.js`: mặc định Q đi · R chạy · C ngồi · F làm việc (gõ phím) · X rời ghế · Z ngủ · V dậy. Đổi / bỏ gán / khôi phục trong **Cài đặt → Phím tắt** (lưu `localStorage.vyKeys`). Phím cố định (không đổi): WASD, Shift, E, T, M, Esc, F3. Phím tắt tạm tắt khi đang gõ chữ hoặc mở hộp thoại. Cách chạy: shortcuts.js phát sự kiện `window` `vy:act` (`detail` = `walk|run|sit|type|off|sleep|wake`), `src/game.js` nghe và bấm đúng các nút ẩn trong `#ui` (cùng lệnh cũ).

## Chuyển động
Cuối `ui.css`, mục "CHUYỂN ĐỘNG": mọi chuyển ≤ .22s, đường cong `--ease`. Nút: sáng/mờ + toả sáng (glow) khi rê, co nhẹ khi bấm. Panel / hộp thoại: mờ + trượt nhẹ khi mở và khi đóng (`@starting-style` + `display allow-discrete`; trình duyệt cũ thì bật/tắt ngay). Tôn trọng `prefers-reduced-motion`.
