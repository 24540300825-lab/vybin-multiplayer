# PHÒNG VY — WORKROOM · Tiến độ

Cập nhật: 10/11/2026 · **đã lên bản chính** (`main`), nhánh `workroom-m1` giữ lịch sử.

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
- Trong game 3D (backend giả lập 2 người): Bin không thấy ghim/mã Workroom; Vy bấm ghim → đi tới ghế → ngồi gõ phím → Work Mode mở, game giảm vẽ. Bước BACK TO ROOM trong game đã đạt ở bản M1; sau khi viết lại M2–M8 chưa chạy lại trọn trong game (máy kiểm thử đồ hoạ giả lập quá chậm), phần đóng/mở khung đã kiểm ở trang thử độc lập.
- Sửa trong lúc kiểm: bỏ giới hạn 30 giây khi chờ Vy ngồi xuống (đường đi dài thì Work Mode không mở).
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

## v3 — 11/11/2026: làm lại giao diện theo góp ý
- Giao diện tiếng Việt, gọn: Hôm nay · Kịch bản · Caption · Tin bài · Phân công · Timeline · Chương trình · Xuất bản · Cài đặt. Bỏ các module cũ (Content Studio, Editorial Desk, Knowledge Hub, Task Manager…).
- Định dạng theo MẪU THẬT: `tools/build-workroom-tpl.py` dựng khung (`src/workroom/tpl/`) từ file mẫu của Vy (không đưa nội dung mẫu vào repo); `fmt.js` điền chữ giữ nguyên XML định dạng → .docx/.xlsx đúng lề, cỡ chữ, cột, đánh số. Đã đối chiếu bằng LibreOffice.
- Thêm Kịch bản: Bản tin ULAW TV, Bản tin Tiếng Anh (script tiếng Việt), Kịch bản video storyboard.
- AI = Gemini (khoá miễn phí của Vy). Một Trợ lý AI duy nhất thao tác trực tiếp, có Hoàn tác.
- Chương trình lớn tách riêng, tài liệu thuộc chương trình liên thông thông tin; đổi thông tin → đánh dấu “Cần xem lại”.
- Giai đoạn thử: Bin cũng vào được (thêm vào `wr_owner`, migration 011). Khoá lại: xem chú thích trong 011.
- Camera: ngồi bàn → lướt ra sau lưng nhìn màn hình rồi mở Workroom (`api.deskCam`).
- Dữ liệu riêng tư đã nạp: 7 bài mẫu (văn phong) vào `wr_knowledge`, 45 nhân sự vào `wr_staff`.
