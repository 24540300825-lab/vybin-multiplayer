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
- **Capsule**: gradient `#7e7878 → #e4e4e4` (blend *multiply*) ≡ phủ đen alpha `.52 → .106` (`--cap`). Thẻ Bin / đồng hồ bo 32, thẻ Vy / nhạc bo tròn hết.
- **Pill thời tiết / chip / ô nhập**: nền `rgba(0,0,0,.46)`, viền trắng 1px, bo tròn.
- **Thanh chỉ số**: rãnh `#242424`, cao 12, đầu trái thon; đỏ `#d25353` (Sức khỏe), cam `#ffb84d` (Thể lực), xanh lá `#8be28b` (Tâm trạng), **xanh dương `#6fa8ff` (Tập trung — màu thêm)**.
- **Chữ**: tên / giờ / tiêu đề = **Audex** (24 / 64 / 24); nội dung = **Nunito Sans Bold** (12–20); chữ phụ `#c3c1c1`. Màu nhấn (nút chính, mục đang chọn) `#ffd581`.
- Thanh icon trên cùng: icon 40, cách nhau 64 (nút bấm 56 + gap 48).

## Font Audex
Chưa có file font nên đang dùng **Nunito** thay tạm. Khi có `audex.woff2` (hoặc `.ttf`): đặt vào `assets/fonts/`, bỏ ghi chú khối `@font-face` ở đầu `ui.css`. Không cần sửa gì khác (biến `--f-d` đã ưu tiên Audex).

## Icon
`src/ui/icons.js` sinh từ react-icons (họ Bootstrap / Ant Design / Font Awesome 6 / Material / Phosphor). Các icon Figma dùng mà chưa có SVG gốc trong repo (đang dùng icon gần giống):
chuông (`garden:notification-fill-12`), cài đặt (`icon-park-solid:setting-two`), pause (`el:pause`), mây-thời-tiết (`fluent-mdl2:cloud-weather`).
Muốn thay: thêm SVG gốc từ Figma, sửa chuỗi cùng tên trong `ICONS` (dùng `fill="currentColor"`, `width/height="1em"`).

## Thu gọn / mở rộng (nhớ trên máy từng người, khoá `vyUi`)
Hồ sơ (mũi tên trên thẻ Bin), thanh hành động (mũi tên bên phải), danh sách nhạc (mũi tên trên pill nhạc), panel Việc (nút trên thanh icon). Màn nhỏ: hồ sơ mặc định thu gọn, nhạc chỉ còn ảnh bìa, đồng hồ chỉ còn giờ, thanh hành động chỉ còn icon.

## Thông báo (chuông)
`Notify.add({type:'chat'|'call'|'peer', title, body, go})` từ bất kỳ module nào. Đã nối: tin nhắn mới, cuộc gọi nhỡ / bị từ chối, bạn vào / rời phòng. Thông báo cập nhật game: thêm 1 mục **đầu** `NEWS` trong `src/announcements.js` (id duy nhất) — chấm đỏ trên chuông hiện đến khi người chơi mở bảng.

## Thêm nút vào thanh icon (tính năng cắm thêm)
`ctx.ui.addButton({icon, label, title, onClick})` vẫn dùng được: nút nhận `icon` (emoji hoặc chuỗi SVG) hiển thị đơn giản; `label`/`title` hiện khi rê chuột.
