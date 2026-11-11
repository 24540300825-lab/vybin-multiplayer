# PHÒNG VY — WORKROOM · AI (Google Gemini)

Từ bản v3 (11/2026) Workroom dùng **Google Gemini** qua khoá API miễn phí của Vy — AI chạy trên máy chủ Google nên máy Mac không nặng.
(Ollama trên máy đã bỏ khỏi giao diện vì quá nặng với MacBook Air. Script `vy-ai.sh` vẫn còn trong repo nếu sau này muốn thử lại.)

## Bật AI (1 lần trên mỗi máy)
1. Mở https://aistudio.google.com/apikey bằng Gmail của Vy → **Create API key** → sao chép.
2. Workroom → Cài đặt → AI → **Dán khoá** → Lưu. (Hoặc bấm bất kỳ nút ✨ — Workroom tự hỏi khoá.)
3. Workroom tự đọc danh sách model của khoá và chọn **Gemini Flash bản mới nhất** (ổn định, gói miễn phí dùng được). Có thể đổi ở Cài đặt.

## Lưu ý
- Khoá chỉ lưu trong trình duyệt của máy đó (localStorage), gửi thẳng tới Google — không qua máy chủ game, không vào cơ sở dữ liệu.
- Gói miễn phí có giới hạn lượt/phút và lượt/ngày (lượt ngày làm mới khoảng 15h chiều giờ VN). Hết lượt → Workroom báo rõ, **không** tự chuyển sang dịch vụ trả phí.
- Gói miễn phí: Google có thể dùng nội dung gửi lên để cải thiện dịch vụ. Không đưa thông tin mật vào AI.

## AI làm gì, theo luật nào
- AI chỉ điền **nội dung** vào dàn ý (JSON schema) của từng loại mẫu; bố cục, nhãn, chữ cố định, định dạng do `kinds.js` + `fmt.js` dựng từ chính file mẫu → file ra luôn đúng mẫu.
- Văn phong: AI đọc các bài mẫu của phòng (bảng `wr_knowledge`, category `sample`, riêng tư theo RLS) và danh sách nhân sự (`wr_staff`) khi phân công.
- Luật dữ kiện: không bịa tên, chức danh, số liệu, ngày giờ, trích dẫn; thiếu ghi `[CẦN BỔ SUNG]`.
- Trợ lý AI (nút ✨ Trợ lý AI) dùng function calling của Gemini để thao tác trực tiếp: tạo/viết/sửa tài liệu, sửa từng trường, tạo/sửa chương trình, mở màn hình, lưu Drive. Mỗi lần sửa lưu bản cũ (`wr_doc_versions`) → nút **Hoàn tác** / **Lịch sử**. Không có công cụ xoá hay gửi email.
