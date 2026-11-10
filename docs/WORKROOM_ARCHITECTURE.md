# PHÒNG VY — WORKROOM · Kiến trúc

Workroom là một chế độ làm việc nằm TRONG VIBE LAB, chỉ dành cho tài khoản gắn với nhân vật **Vy**.

## Hai nửa
| Nửa | File | Việc |
|---|---|---|
| Trong game (iframe) | `src/features/workroom.js` | Ghim **START WORKING** ở ghế bàn làm việc phòng Vy → Vy đi tới, ngồi, gõ phím → gọi trang vỏ mở Work Mode. Thoát thì trả game về bình thường. |
| Trang vỏ | `src/workroom/index.js` (khung), `modules.js` (các module), `store.js` (dữ liệu), `workroom.css` | Toàn bộ giao diện Work Mode. Tải lười: chỉ nạp khi mở lần đầu. |

Vì Work Mode nằm ở trang vỏ nên game 3D bên dưới **không bị nạp lại**: vị trí, camera, cuộc gọi, nhạc, chat giữ nguyên.

## Điểm nối vào engine (`src/game.js`) — 4 chỗ, đều là tuỳ chọn
- `api.chairPin = {label, act}`: đổi nhãn + hành động của ghim ghế (không đặt = ghế "Ngồi" như cũ).
- `api.onChairSeated()` / `api.onChairLeft()`: báo khi nhân vật của mình ngồi xong / rời ghế.
- `api.lowDraw = true`: vẫn chạy logic + mạng, chỉ vẽ 3D ~4 khung/giây (Work Mode đang che kín màn hình).

## Quyền truy cập (3 lớp)
1. Trang vỏ chỉ tạo `VYSHELL.workroom` khi nhân vật là `vy`.
2. `checkAccess()` hỏi máy chủ `wr_is_owner()`; sai → không có ghim, không tải mã.
3. **RLS ở Supabase**: mọi bảng `wr_*` chỉ trả dữ liệu cho tài khoản có trong `wr_owner`. Đây là lớp quyết định — kể cả ai đó tự gõ lệnh trong trình duyệt cũng không đọc được.

Chủ phòng = tài khoản đang giữ nhân vật Vy lúc chạy migration 009 (không ghi cứng email/id trong mã). Đổi chủ: sửa bảng `wr_owner` trong Supabase.

## Luồng dữ liệu
Module → `store.js` → Supabase (`wr_*`). Module không gọi Supabase trực tiếp.
`store.js` giữ trạng thái lưu (đang lưu / đã lưu / lỗi) cho thanh trên cùng và tự ghi nhật ký vào `wr_activity`.
Chạy thử (`?solo` hoặc `?mock=…`): dùng kho cục bộ trên trình duyệt, giao diện ghi rõ **BẢN THỬ**.

## Thêm module
Thêm 1 mục vào `MODULES` trong `src/workroom/modules.js`: `{id, name, icon, render(ctx)}`.
`ctx`: `store`, `event()` (sự kiện đang chọn), `setEvent(id)`, `go(moduleId)`, `render()`, `note(text)`.
Module chưa tới milestone dùng `planned(...)` — nêu rõ sẽ làm gì và còn thiếu gì, không có nút giả.

## Chưa có (theo lộ trình)
AI trên máy / lớp AI Provider (M2) · Knowledge Hub + nạp tài liệu (M3) · Content Studio + Google Docs (M4) · Editorial Desk (M5) · Timeline Studio + Sheets (M6) · Staff Assignment (M7) · workflow liên module, Calendar, Gmail nháp (M8).
Khi các phần kết nối hoàn thành, thẻ **Bắt đầu sử dụng** ở Overview là nơi nhắc Vy tự kết nối Google và bật AI trên máy của Vy.
