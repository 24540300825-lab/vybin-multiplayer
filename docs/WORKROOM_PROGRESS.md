# PHÒNG VY — WORKROOM · Tiến độ

Cập nhật: 10/11/2026 · nhánh `workroom-m1` (bản test). **Chưa lên bản chính.**

| Milestone | Trạng thái |
|---|---|
| M0 Khảo sát | Xong |
| M1 Nền Work Mode (ghim bàn phòng Vy, vào/ra, khung, cổng chủ phòng) | Xong |
| M2 AI trên máy (Ollama, lớp Provider, stream, dừng, hết giờ, tải model, thống kê, AI ngoài) | Xong — chưa chạy với Ollama thật trên máy Vy |
| M3 Dữ liệu chung + Knowledge Hub (nạp Drive/file, phân loại, Chính thức/Tham khảo/Nháp, tìm đoạn liên quan, ghi nguồn) | Xong |
| M4 Content Studio (AI viết nháp theo mẫu, soạn thảo, AI sửa đoạn chọn, phiên bản, Google Docs, .docx) | Xong |
| M5 Editorial Desk (kiểm tự động + AI, góc nhìn độc giả, chặn sửa dữ kiện, nhận/bỏ/sửa tay, so sánh, khôi phục) | Xong |
| M6 Timeline Studio (đọc mẫu, AI đề xuất, sửa trong bảng, sao chép mẫu sang Sheets và ghi đúng cột, đồng bộ 2 chiều có kiểm xung đột, Excel, tạo việc) | Xong |
| M7 Staff Assignment (danh bạ, lịch bận, xung đột tính bằng mã, AI đề xuất, duyệt, Lịch công tác tuần → Docs/.docx, Calendar, tạo việc) | Xong |
| M8 Quy trình liên module (Intake brief, 10 bước, đánh dấu phụ thuộc, Action Engine, Copilot, nhật ký, Gmail nháp, khoá, sao lưu/khôi phục) | Xong |

## Kiểm thử đã chạy (Chromium headless)
- Workroom độc lập (`dev/workroom.html`, kho cục bộ) + **Ollama giả** đúng hình dạng API + **Google API giả** ở tầng mạng: 110 kiểm tra, đạt hết (nền, AI online/offline/thiếu model/lỗi model/hết giờ/dừng/tải model, Intake, Action Engine, Knowledge, docx/xlsx ghi–đọc, Content, Editorial, Timeline ghi đúng cột mẫu thật, đồng bộ Sheet/Docs có xung đột, Staff xung đột, phụ thuộc dữ liệu, Gmail chỉ nháp, khoá, sao lưu/khôi phục, màn 390px/820px).
- Trong game 3D (backend giả lập 2 người): Bin không thấy gì; Vy bấm ghim → đi tới ghế → ngồi gõ phím → Work Mode; đủ 10 module; BACK TO ROOM về đúng chỗ, game vẽ lại; đứng dậy như cũ.
- Supabase THẬT: Bin đọc 0 dòng ở cả 12 bảng `wr_*`, bị chặn ghi; Vy đọc/ghi được.

## CHƯA kiểm chứng
- Ollama thật trên máy của Vy (chất lượng tiếng Việt của model, tốc độ, quyền "thiết bị trên máy" của Chrome).
- Google thật: cần bật API + thêm quyền trong Google Cloud Console (xem WORKROOM_INTEGRATIONS.md), rồi Vy kết nối.
- Đọc thư mục Drive mẫu bằng tài khoản của Vy (thư mục thuộc 24540300825@uah.edu.vn — Vy cần có quyền xem).

## Việc cần chủ dự án / Vy
1. Google Cloud Console: bật Drive, Sheets, Calendar, Gmail API; thêm 3 quyền vào màn đồng ý (WORKROOM_INTEGRATIONS.md).
2. Chia sẻ thư mục "MẪU CHO CLAUDE" cho Gmail của Vy (quyền xem).
3. Vy vào Workroom → làm theo thẻ "Bắt đầu sử dụng" ở Overview.

## Ghi chú kỹ thuật cho phiên sau
- Bộ kiểm thử nằm ngoài repo (scratchpad của phiên). Ollama giả: `/api/version|tags|chat|pull`; Google giả: Drive copy/create/upload/get, Sheets get/values/batchUpdate, Calendar insert, Gmail drafts.
- Dữ liệu thử của Workroom độc lập nằm ở `localStorage['vyWorkroomDev']`.
