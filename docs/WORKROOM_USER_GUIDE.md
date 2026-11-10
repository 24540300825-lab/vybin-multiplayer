# PHÒNG VY — Hướng dẫn dùng Workroom (cho Vy)

## Vào / ra
Vào phòng Vy → đi tới bàn → bấm ghim **START WORKING** (hoặc nút 💼 trên thanh trên cùng). Vy ngồi xuống gõ phím, Workroom mở ra.
**BACK TO ROOM** (góc phải trên) để quay lại phòng — Vy vẫn ngồi ở bàn, bấm ghim lần nữa là vào lại ngay.

## Lần đầu (Overview có thẻ "Bắt đầu sử dụng")
1. **Cài đặt & Kết nối → CONNECT GOOGLE WORKSPACE** → chọn đúng Gmail của Vy → cho phép. (Muốn đưa lịch lên Google Calendar hay lưu thư nháp Gmail thì bấm thêm quyền tương ứng.)
2. **Cài đặt & Kết nối → Trợ lý AI**: làm theo hướng dẫn, tải model "Gợi ý cho máy này" làm model hằng ngày. Muốn bài viết và biên tập tốt nhất: đăng nhập ứng dụng Ollama rồi thêm `kimi-k3:cloud` làm model mạnh (xem lưu ý về gửi dữ liệu trong WORKROOM_AI_SETUP.md).
3. **Knowledge Hub → Nạp từ thư mục Google Drive** → dán link thư mục mẫu → chọn file → Nhập. Sau đó xem từng tài liệu và chuyển sang **Chính thức** những gì là chuẩn (bài đã duyệt, mẫu timeline…). AI chỉ học theo tài liệu Chính thức.
4. (Tuỳ chọn) Đặt mã khoá Workroom.

## Quy trình một sự kiện
1. **Overview**: tạo sự kiện → dán/nạp brief → **AI trích thông tin từ brief** → tick những mục đúng → Xác nhận. Từ đây mọi module dùng chung thông tin này.
2. **Timeline Studio**: **AI đề xuất timeline** → chọn mục giữ lại → sửa trực tiếp trong bảng → **Ghi lên Google Sheets theo mẫu** (tạo bản sao của mẫu, điền đúng cột) → **Tạo việc từ timeline**.
3. **Staff Assignment**: Danh bạ nhân sự (vai trò, lịch bận) → Phân công tuần → **AI đề xuất phân công** hoặc tự điền → xem mục "Cần chú ý" (trùng giờ, báo bận…) → **Duyệt** → **Xuất Lịch công tác tuần → Google Docs** / Calendar / Tạo việc.
4. **Content Studio**: chọn loại bài → **AI viết nháp** → sửa trong trình soạn thảo (bôi đen đoạn để AI viết lại/rút gọn/mở rộng; Gợi ý tiêu đề) → **Gửi sang Editorial Desk**.
5. **Editorial Desk**: **Chạy biên tập** → đọc "Góc nhìn độc giả" và trả lời câu hỏi cho tác giả → Nhận/Bỏ từng đề xuất; mục "Kiểm tra thông tin" phải tự xác minh rồi bấm "Đã xác minh" → **Duyệt bài** → **Xuất sang Google Docs** → lưu bài đã duyệt vào Knowledge Hub làm mẫu.
6. **Overview**: chuyển bước tiến trình, cuối cùng **Lưu trữ sự kiện**.

## Trợ lý AI
**AI Assistant** (trang riêng) hoặc **Copilot** (khung bên, bấm nút Copilot) — trợ lý tự biết đang ở module nào, sự kiện nào, bài nào đang mở.
Nhờ làm việc ("tạo việc…", "viết tin…", "đặt lịch…") → trợ lý hiện thẻ đề xuất → bấm **Thực hiện** mới chạy. Thẻ đỏ = ghi ra ngoài (Google) → bấm **Xác nhận thực hiện**.
Mỗi câu trả lời có "Nguồn đã dùng". Nút Dừng để ngắt khi AI đang chạy.

## Những điều Workroom KHÔNG làm
Không tự gửi email, không xoá file trên Google, không sửa file mẫu gốc, không tự sửa bài đã viết khi thông tin sự kiện đổi (chỉ đánh dấu để Vy rà), không cho duyệt bài còn thông tin chưa xác minh, không coi tài liệu nào là chuẩn khi Vy chưa xác nhận.

## Sao lưu
Cài đặt & Kết nối → Tải file sao lưu (.json). Khôi phục chỉ THÊM bản ghi bị thiếu, không ghi đè.
