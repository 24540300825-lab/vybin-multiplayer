# PHÒNG VY — WORKROOM · Kiến trúc

Workroom là một chế độ làm việc nằm TRONG VIBE LAB, chỉ dành cho tài khoản gắn với nhân vật **Vy**.
Vy đi tới bàn làm việc trong phòng Vy → ghim **START WORKING** → nhân vật ngồi, gõ phím → Work Mode mở. **BACK TO ROOM** đưa về đúng chỗ (vẫn ngồi ở bàn).

## Hai nửa
| Nửa | File | Việc |
|---|---|---|
| Trong game (iframe) | `src/features/workroom.js` | Ghim ghế, ngồi + gõ phím, gọi trang vỏ mở Work Mode; thoát → game vẽ lại bình thường. Tự mở lại sau khi quay về từ trang cấp quyền Google. |
| Trang vỏ | `src/workroom/*`, `workroom.css` | Toàn bộ Work Mode. Tải lười: chỉ nạp khi mở lần đầu. |

Work Mode nằm ở trang vỏ nên game 3D **không bị nạp lại**: vị trí, camera, cuộc gọi, nhạc, chat giữ nguyên. Khi Work Mode mở, game vẫn chạy logic + mạng nhưng chỉ vẽ ~4 khung/giây (`api.lowDraw`).

## File trong `src/workroom/`
| File | Vai trò |
|---|---|
| `index.js` | Khung: sidebar, thanh trên (sự kiện đang chọn, trạng thái lưu, Google, AI, thông báo), vùng chính, Copilot, màn khoá |
| `store.js` | Lớp dữ liệu dùng chung: Supabase `wr_*` (hoặc kho cục bộ khi chạy thử). Trạng thái lưu, nhật ký, đánh dấu phụ thuộc, sao lưu/khôi phục |
| `ai.js` | Lớp AI Provider: Ollama (mặc định, trên máy), stream, dừng, hết giờ, tải model, nhật ký xử lý, JSON có kiểm tra, AI ngoài (tự gửi – tự dán về) |
| `google.js` | Drive / Docs / Sheets / Calendar / Gmail-nháp qua API chính thức |
| `actions.js` | Action Engine: danh sách hành động AI được phép đề xuất, kiểm tham số, mức quyền, chạy + ghi nhật ký |
| `knowledge.js` | Phân loại tài liệu, tìm đoạn liên quan, dữ kiện sự kiện, quy tắc dữ kiện cho AI |
| `files.js` | Đọc/ghi .docx, .xlsx, .csv trong trình duyệt (không thư viện ngoài) |
| `ui.js` | Tiện ích giao diện: hộp thoại, so sánh văn bản, làm sạch HTML |
| `modules.js` | Danh sách module + Overview (kèm Intake brief), Task Manager, Hoạt động, Cài đặt & Kết nối |
| `m-assistant.js` | AI Assistant + Copilot (cùng bộ máy) |
| `m-content.js` | Content Studio |
| `m-editorial.js` | Editorial Desk |
| `m-timeline.js` | Timeline Studio |
| `m-staff.js` | Staff Assignment |
| `m-knowledge.js` | Knowledge Hub |

## Điểm nối vào engine (`src/game.js`) — 4 chỗ, đều tuỳ chọn
`api.chairPin = {label, act}` · `api.onChairSeated()` / `api.onChairLeft()` · `api.lowDraw`.

## Quyền truy cập (3 lớp)
1. Trang vỏ chỉ tạo `VYSHELL.workroom` khi nhân vật là `vy`.
2. `checkAccess()` hỏi máy chủ `wr_is_owner()`; sai → không có ghim, không tải mã.
3. **RLS ở Supabase**: mọi bảng `wr_*` chỉ trả dữ liệu cho tài khoản trong `wr_owner` (= tài khoản giữ nhân vật Vy). Đã kiểm trên máy chủ thật: Bin thấy 0 dòng ở cả 12 bảng, không ghi được.
Thêm: mã khoá màn hình (băm SHA-256, hỏi mỗi phiên trình duyệt mới).

## Nguyên tắc AI (được kiểm bằng mã, không chỉ dặn AI)
- Việc ĐỌC (dữ kiện sự kiện, tài liệu liên quan, việc đang mở, thứ đang mở trên màn hình) do hệ thống tự gom, chỉ phần liên quan, kèm nguồn.
- AI chỉ ĐỀ XUẤT hành động. Mỗi đề xuất được kiểm: tên trong danh sách, tham số đúng kiểu/độ dài, tham số lạ bị bỏ. Người dùng bấm mới chạy. Không có hành động gửi thư hay xoá.
- Bài AI viết luôn là "Bản nháp", ghi nguồn đã dùng. Chỗ thiếu dữ kiện ghi `[CẦN BỔ SUNG: …]`; bài còn chỗ này thì không duyệt được.
- Editorial: mục "kiểm tra thông tin" không bao giờ có câu sửa sẵn; câu sửa nào thêm tên người / con số mới bị chặn; trích dẫn không khớp nguyên văn bị loại.
- Staff: xung đột (trùng giờ, báo bận, quá tải, sai vai trò, thiếu vị trí) do mã tính từ dữ liệu; tên AI đề xuất không có trong danh bạ bị loại.
- Tài liệu chỉ thành "Chính thức" khi Vy tự xác nhận. Bản nháp / bản nháp AI không bao giờ được dùng làm mẫu.

## Thêm module
Viết `src/workroom/m-xxx.js` xuất hàm `render(ctx)`, thêm 1 dòng vào `MODULES` (modules.js).
`ctx`: `store`, `ai`, `g` (Google), `actions`, `event()`, `setEvent(id)`, `go(id)`, `render()`, `note(text)`, `ui` (trạng thái giao diện theo module).

## Kiểm thử
`dev/workroom.html` mở Workroom không cần game (kho cục bộ). Bộ kiểm thử dùng Chromium + Ollama giả (đúng hình dạng API) + Google API giả ở tầng mạng — xem WORKROOM_PROGRESS.md.
