# PHÒNG VY — WORKROOM · Mô hình dữ liệu

Migration (đã chạy trên project Supabase `vybin-studio`): `009_workroom.sql`, `010_workroom_modules.sql`. Chỉ thêm bảng `wr_*`; không đụng `game_*`, `cc_*`, `rooms`.
Mọi bảng: RLS 1 policy `using (wr_is_owner()) with check (wr_is_owner())`.

| Bảng | Nội dung |
|---|---|
| `wr_owner` | Tài khoản chủ. Client không đọc/ghi được. Đổi chủ: sửa bảng này trong Supabase. |
| `wr_events` | **Bản ghi trung tâm** `EVENT-00N`: tên, `stage` (10 bước intake → archive), ngày, giờ, địa điểm, đơn vị tổ chức, thành phần, `brief`, `facts`, `assign` (content/media/editor/backup/deadline…/approved), `links` (thư mục Drive, Sheet timeline, lịch Google), `needs_check` (dữ kiện đã đổi, chờ rà), `is_demo`, `archived` |
| `wr_tasks` | Việc: người phụ trách, hạn, ưu tiên, trạng thái, `source` (manual/chat/timeline/editorial/assignment), `ref` (liên kết nguồn — để không tạo trùng) |
| `wr_knowledge` | Tài liệu: `category` (13 loại), `status` (official/reference/draft), `kind`, nguồn, `file_id`, `url`, `version` (giờ sửa trên Drive), nội dung chữ |
| `wr_articles` | Bài: loại, tiêu đề, nội dung HTML, trạng thái (draft/review/approved/published), `origin` (manual/ai/import), `sources` (nguồn AI dùng), `doc` (Google Docs id/url/giờ sửa), `stale` (dữ kiện đổi sau khi viết) |
| `wr_versions` | Phiên bản bài |
| `wr_reviews` | Kết quả biên tập: góc nhìn độc giả + danh sách đề xuất và trạng thái từng mục |
| `wr_timeline` | Mục timeline theo đúng cột mẫu: giai đoạn, nội dung, hình thức, deadline, thời gian đăng, nơi đăng, phân công (nội dung/media/biên tập), ghi chú, xong |
| `wr_staff` | Danh bạ: tên, vai trò, kỹ năng, lịch bận, `confirmed`, `active` |
| `wr_chats` | Hội thoại với trợ lý (kèm nguồn, đề xuất hành động và kết quả) |
| `wr_ai_log` | Nhật ký xử lý AI: model, việc, thời gian, lỗi, số token. Không có chi phí (Ollama miễn phí) |
| `wr_activity` | Nhật ký mọi thay đổi |
| `wr_settings` | Cài đặt (thư mục Drive gốc, nhóm quyền Google đã cấp, mã khoá đã băm…). Không chứa token. |

## Nguồn chính của từng loại dữ liệu
| Dữ liệu | Nguồn chính | Đồng bộ |
|---|---|---|
| Sự kiện, việc, trạng thái quy trình, nhân sự | Workroom (Supabase) | — |
| File bài viết | Google Docs (bản xuất) — Workroom giữ bản đang soạn | Lưu file id + giờ sửa. Docs bị sửa bên Google → hỏi trước khi ghi đè |
| Timeline | Workroom; Google Sheets là bản xuất theo mẫu | Lưu file id + giờ sửa. Sheet bị sửa → chọn kéo về hoặc ghi đè |
| Lịch công tác tuần | Google Docs (bản xuất) | Mỗi tuần 1 file, hỏi cập nhật hay tạo mới |
| Lịch | Google Calendar | Lưu id sự kiện lịch, lần sau cập nhật chứ không tạo trùng |

## Phụ thuộc giữa các bước
Đổi tên/ngày/giờ/địa điểm/đơn vị/thành phần/brief của sự kiện → các bài đã viết được gắn `stale`, sự kiện được gắn `needs_check` (khi đã có bài/timeline/phân công). **Không tự sửa** bài đã viết. Bài còn `stale` thì không duyệt được.
