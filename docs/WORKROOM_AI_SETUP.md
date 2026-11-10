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

## Chọn model (tra tháng 11/2026 — model mới ra liên tục, xem ollama.com/library)
Workroom dùng **2 model**: *hằng ngày* (trò chuyện, tóm tắt) và *mạnh* (viết bài, sửa đoạn, gợi ý tiêu đề, biên tập, timeline, phân công, trích brief). Chưa chọn model mạnh thì mọi việc dùng model hằng ngày.

**Chạy trên máy — miễn phí, dữ liệu không rời máy**
| Model | Tải về | Phù hợp với |
|---|---|---|
| gemma4:e4b | ≈6,6 GB | Máy không có card rời mạnh |
| qwen3.5:9b | ≈6,6 GB | Card 8 GB |
| gemma4:12b | ≈7,7 GB | Card 12–16 GB (Gemma 4 hỗ trợ hơn 140 ngôn ngữ) |
| **qwen3.8:27b** | ≈18 GB | Card 24 GB (RTX 3090/4090/5090) hoặc Mac 32 GB+ — mạnh nhất chạy được trên máy cá nhân |

**Đám mây (Ollama Cloud) — mạnh nhất, máy yếu vẫn dùng được**
| Model | Ghi chú |
|---|---|
| **kimi-k3:cloud** | Nhóm model mở mạnh nhất hiện nay |
| deepseek-v4-pro:cloud | Rất mạnh về suy luận, viết dài |
| glm-5.3:cloud | Mạnh, nhanh |
Cách dùng: mở ứng dụng Ollama → **Sign in** (hoặc `ollama signin`) → Workroom → Cài đặt & Kết nối → bấm **Thêm** ở model đám mây → xác nhận cho phép.
Lưu ý: nội dung đưa cho AI được gửi lên máy chủ Ollama (Ollama cho biết không lưu, không dùng để huấn luyện). Gói miễn phí có ít lượt dùng; dùng nhiều cần gói trả phí của Ollama (Pro khoảng 20 USD/tháng — kiểm tra giá tại ollama.com). Workroom **không** tự trả phí và **không** tự chuyển sang đám mây khi model trên máy lỗi. Tắt đám mây → việc nặng tự quay về model trên máy.

**Gợi ý cấu hình cho Vy:** model hằng ngày = model "Gợi ý cho máy này"; model mạnh = `kimi-k3:cloud` (nếu chấp nhận gửi nội dung lên Ollama) hoặc `qwen3.8:27b` (nếu máy có card 24 GB). Dùng "Thử model…" với một đoạn tiếng Việt thật trước khi chốt.

## Workroom dùng Ollama thế nào
`/api/chat` (stream, `think:false`, `format` = JSON schema cho dữ liệu có cấu trúc, `keep_alive` 20 phút), `/api/tags`, `/api/version`, `/api/pull`. Kết quả JSON luôn được mã kiểm lại; sai 2 lần → báo lỗi, không dùng.
Workroom tắt chế độ "suy nghĩ" (`think:false`) để trả lời nhanh. Không dùng tool-calling gốc của model (model nhỏ làm chưa ổn định): AI đề xuất hành động dạng JSON theo danh sách cố định, mã kiểm rồi mới hiện thẻ xác nhận.

## Xử lý sự cố
| Workroom báo | Làm gì |
|---|---|
| AI: offline / Không kết nối được | Mở Ollama; kiểm tra bước 2–4 |
| Bị chặn (OLLAMA_ORIGINS) | Chạy lại lệnh bước 2 đúng địa chỉ trang, khởi động lại Ollama |
| Máy chưa có model … | Tải model trong Cài đặt hoặc chọn model khác |
| Model đám mây cần đăng nhập Ollama | Ứng dụng Ollama → Sign in |
| Đã hết lượt dùng model đám mây | Chọn model trên máy, hoặc xem gói tại ollama.com/settings |
| AI không phản hồi sau N giây | Model quá nặng cho máy → chọn model nhẹ hơn hoặc tăng thời gian chờ |
