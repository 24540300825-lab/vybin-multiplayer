# PHÒNG VY — WORKROOM · Tiến độ

## Milestone 0 — Khảo sát: XONG (10/11/2026)
## Milestone 1 — Nền Work Mode: XONG trên nhánh `workroom-m1` (bản test), chưa lên bản chính
Đã có: ghim START WORKING ở bàn phòng Vy → ngồi + gõ phím → Work Mode; sidebar 10 mục, thanh trên, AI Copilot (bật/tắt, biết module + sự kiện); Overview, Task Manager, Hoạt động & Lịch sử, Cài đặt & Kết nối chạy bằng dữ liệu thật; sự kiện có mã EVENT-00N và 10 bước tiến trình; BACK TO ROOM; cổng chủ phòng 3 lớp; sao lưu .json.
Chưa có (đúng lộ trình): 6 module chuyên môn hiển thị "chưa hoạt động — cần gì — milestone nào".
Kiểm thử: `tools/` chưa chứa kịch bản này; đã chạy Chromium headless với backend giả lập (xem báo cáo trong chat). CHƯA chạy với đăng nhập Google thật của Vy trên bản test.

## Việc tiếp theo
- M2: kiểm tra máy của Vy (RAM/VRAM/ổ đĩa), cài Ollama, chọn model, nối vào AI Assistant + Copilot, lớp AI Provider. Xem thư mục `.vybin-bridge` và bảng `cc_bridge_*` có dùng lại được không.
- M3: đọc thư mục Drive "MẪU CHO CLAUDE" (chưa đọc được: cần kết nối Google Drive), phân loại, đưa vào Knowledge Hub.
- Đầu ra của mọi module phải đúng định dạng Google (Docs / Sheets) theo mẫu trong thư mục đó.

## Cần chủ dự án
- Kết nối Google Drive (để đọc thư mục mẫu) hoặc gửi file trực tiếp.
- Vy đăng nhập bản test và thử Work Mode một lần.
