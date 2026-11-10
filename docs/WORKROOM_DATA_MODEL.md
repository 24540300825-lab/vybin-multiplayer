# PHÒNG VY — WORKROOM · Mô hình dữ liệu

Migration: `supabase/migrations/009_workroom.sql` (đã chạy trên project `vybin-studio`). Chỉ thêm bảng `wr_*`, không đụng `game_*`, `cc_*`, `rooms`.

| Bảng | Nội dung |
|---|---|
| `wr_owner` | Tài khoản chủ (1 dòng). Client không đọc/ghi được; chỉ hàm `wr_is_owner()` dùng. |
| `wr_events` | Bản ghi trung tâm. `code` tự sinh `EVENT-001…`, `name`, `stage` (10 bước: intake → archive), `event_date`, `venue`, `organizer`, `note`, `facts` (dữ kiện chính thức đã xác nhận — dùng từ M3), `is_demo`, `archived`. |
| `wr_tasks` | `title`, `description`, `event_id`, `owner_name`, `deadline`, `priority` (low/normal/high), `status` (todo/doing/done), `source` (manual/chat/timeline/editorial/assignment), `ref` (liên kết tài liệu / mục timeline / phân công), `done_at`. |
| `wr_activity` | Nhật ký: `at`, `kind`, `summary`, `event_id`, `ref`. |
| `wr_settings` | 1 dòng `data` (json) cho cài đặt workspace. |

RLS: `wr_events`, `wr_tasks`, `wr_activity`, `wr_settings` có policy duy nhất `using (wr_is_owner()) with check (wr_is_owner())`.
Đã kiểm trên máy chủ thật: tài khoản Bin thấy 0 dòng và bị chặn ghi; tài khoản Vy đọc/ghi được.

Quy ước mở rộng: bảng mới của các milestone sau cũng mang tiền tố `wr_`, có `event_id` trỏ về `wr_events`, và dùng cùng policy.
Nguồn chính của từng loại dữ liệu (sẽ áp dụng khi nối Google): sự kiện, việc, trạng thái workflow = Supabase · file bài viết = Google Docs · timeline, phân công = Google Sheets theo mẫu (Workroom lưu file ID + ánh xạ) · lịch = Google Calendar.
