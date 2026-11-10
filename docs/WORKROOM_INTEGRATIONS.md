# PHÒNG VY — WORKROOM · Kết nối

## Google Workspace
**Cách xin quyền:** dùng lại đăng nhập Google sẵn có của game (Supabase Auth). Khi Vy bấm **CONNECT GOOGLE WORKSPACE** (Cài đặt & Kết nối), trang chuyển sang Google xin THÊM quyền rồi quay lại, Workroom tự mở lại.
- Trình duyệt chỉ giữ **access token ngắn hạn (~1 giờ)** trong `sessionStorage` của tab. Không lưu refresh token, không có client secret ở frontend hay trong repo. Hết hạn → nút "Kết nối lại" (1 bấm). "Ngắt kết nối" thu hồi token ở Google.
- Nhóm quyền, xin đúng lúc cần:
  - `drive` — đọc thư mục mẫu, sao chép mẫu, tạo/cập nhật Docs & Sheets (API Docs/Sheets chấp nhận quyền này).
  - `calendar.events` — tạo/sửa sự kiện lịch (chỉ khi Vy xác nhận).
  - `gmail.compose` — **chỉ lưu thư nháp**. Workroom không có hàm gửi thư.

**Việc cần làm 1 lần trong Google Cloud Console** (project đang cấp đăng nhập Google cho Supabase):
1. APIs & Services → Library → bật: **Google Drive API, Google Sheets API, Google Calendar API, Gmail API**.
2. OAuth consent screen → Data access/Scopes → thêm 3 quyền trên.
3. Ứng dụng đang ở chế độ Testing: Gmail của Vy phải nằm trong **Test users** (đã có cho đăng nhập game). Ở chế độ Testing, Google có thể bắt cấp lại quyền định kỳ — Workroom chỉ cần bấm "Kết nối lại".
4. Supabase → Authentication → URL Configuration: địa chỉ bản test/bản chính phải nằm trong Redirect URLs (như đăng nhập game hiện nay).
Thiếu bước 1 → Workroom báo rõ "API này chưa được bật…".

**Nguyên tắc ghi:** không bao giờ sửa file mẫu/file gốc — luôn tạo bản sao (Timeline: sao chép mẫu sang Google Sheets rồi điền; giữ định dạng, màu, ô tick của dòng mẫu). Mọi ghi ra ngoài đều có bước xem trước / xác nhận. Kiểm tra giờ sửa trên Google trước khi ghi đè.
Lưu trữ trên Drive: thư mục `PHÒNG VY — Workroom` → mỗi sự kiện 1 thư mục con `EVENT-00N — tên`.

## AI trên máy (Ollama)
Xem WORKROOM_AI_SETUP.md. Trình duyệt (Chrome/Edge) gọi thẳng `http://127.0.0.1:11434` — không qua máy chủ, không ra Internet.
Không cần Local Bridge riêng: Ollama tự giới hạn nguồn gọi bằng `OLLAMA_ORIGINS` (chỉ địa chỉ trang Workroom), và Chrome hỏi quyền truy cập thiết bị trên máy lần đầu.

## Word / Excel
Đọc `.docx` `.xlsx` `.csv` `.txt` (nạp Knowledge Hub, nạp brief, nhập timeline, đính kèm cho trợ lý). Xuất `.docx` (bài viết, lịch công tác tuần), `.xlsx` (timeline đúng bộ cột mẫu). Không cần Microsoft 365.

## AI ngoài (ChatGPT / Gemini)
Không nhúng, không tự điều khiển, không đọc phiên đăng nhập. Workroom soạn yêu cầu + ngữ cảnh → mở tab mới → Vy tự dán và gửi → dán kết quả về; kết quả được gắn nhãn "chưa kiểm chứng".
