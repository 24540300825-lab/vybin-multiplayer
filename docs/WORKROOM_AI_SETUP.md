# PHÒNG VY — WORKROOM · Thiết lập AI trên máy (Ollama)

AI chạy trên **máy của Vy** (máy mở Workroom). Không tốn phí, không gửi dữ liệu ra ngoài. Mở Workroom trên điện thoại vẫn xem/sửa dữ liệu được nhưng AI sẽ báo offline.

## Các bước (Cài đặt & Kết nối → "Cách bật AI trên máy này" hiển thị đúng lệnh cho máy đang dùng)
1. Cài Ollama: https://ollama.com/download (đã cài thì bỏ qua).
2. Cho phép trang Workroom gọi Ollama — Windows (PowerShell, không cần admin):
   `setx OLLAMA_ORIGINS "<địa chỉ trang Workroom>"` (Workroom hiện sẵn lệnh có đúng địa chỉ, có nút Sao chép).
   macOS: `launchctl setenv OLLAMA_ORIGINS "<địa chỉ>"`.
   Muốn dùng cả bản test và bản chính: ghi 2 địa chỉ cách nhau bằng dấu phẩy, không dấu cách.
3. Thoát hẳn Ollama (khay hệ thống → Quit) rồi mở lại.
4. Workroom → Cài đặt & Kết nối → **Kiểm tra kết nối**. Lần đầu Chrome hỏi cho phép truy cập thiết bị trên máy → Cho phép.
5. Bấm **Tải** model phù hợp trong bảng (Workroom hỏi xác nhận, hiện tiến độ).

**An toàn:** Ollama mặc định chỉ nghe `127.0.0.1`. **Không** đặt `OLLAMA_HOST=0.0.0.0`. `OLLAMA_ORIGINS` chỉ chứa địa chỉ trang Workroom, không dùng `*`.

## Chọn model (dung lượng gần đúng — xem ollama.com/library trước khi tải)
| Model | Tải về | Phù hợp với | Ghi chú |
|---|---|---|---|
| gemma3:4b | ≈3,3 GB | RAM 8 GB, card 4–6 GB hoặc không có card rời | Nhẹ, nhanh; bài dài dễ hụt ý |
| qwen3:8b | ≈5,2 GB | RAM 16 GB, card 8 GB | Làm theo hướng dẫn, xuất dữ liệu có cấu trúc tốt |
| gemma3:12b | ≈8,1 GB | RAM 16–32 GB, card 12 GB | **Khuyên dùng** cho viết/biên tập tiếng Việt |
| gemma3:27b | ≈17 GB | RAM 32 GB+, card 16–24 GB | Chất lượng cao nhất nhóm này |
Workroom đọc tên card đồ hoạ để gợi ý — chỉ tham khảo. Nên bắt đầu với 1 model chính, thêm model khác sau.
Tuỳ chỉnh trong Cài đặt: bộ nhớ ngữ cảnh (4k–32k; lớn hơn = đọc bài dài hơn, tốn bộ nhớ hơn), thời gian chờ tối đa.

## Workroom dùng Ollama thế nào
`/api/chat` (stream, `think:false`, `format` = JSON schema cho dữ liệu có cấu trúc, `keep_alive` 20 phút), `/api/tags`, `/api/version`, `/api/pull`. Kết quả JSON luôn được mã kiểm lại; sai 2 lần → báo lỗi, không dùng.
Không dùng tool-calling gốc của model (model nhỏ làm chưa ổn định): AI đề xuất hành động dạng JSON theo danh sách cố định, mã kiểm rồi mới hiện thẻ xác nhận.

## Xử lý sự cố
| Workroom báo | Làm gì |
|---|---|
| AI: offline / Không kết nối được | Mở Ollama; kiểm tra bước 2–4 |
| Bị chặn (OLLAMA_ORIGINS) | Chạy lại lệnh bước 2 đúng địa chỉ trang, khởi động lại Ollama |
| Máy chưa có model … | Tải model trong Cài đặt hoặc chọn model khác |
| AI không phản hồi sau N giây | Model quá nặng cho máy → chọn model nhẹ hơn hoặc tăng thời gian chờ |
