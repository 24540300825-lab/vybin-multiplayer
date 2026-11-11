
## AI dự phòng — chạy liên tục, không gián đoạn (v3.3)

Workroom gọi AI theo một chuỗi: **Gemini (model mới nhất → model nhẹ hơn) → Groq → OpenRouter (:free) → Cerebras**.
- Lỗi tạm (quá tải 503, chậm, 429 mỗi phút) → thử lại 1 lần rồi chuyển ngay sang AI kế tiếp; model cuối cùng được thử kiên nhẫn hơn; nếu cả chuỗi đều bận → tự đợi và chạy lại cả chuỗi (tối đa 3 vòng). Hộp "đang chạy" hiện AI đang dùng.
- Trợ lý giữ cùng một model trong suốt một lượt nhiều bước.
- Khoá dự phòng thêm ở **Cài đặt → AI dự phòng** (nút "Lấy khoá" mở đúng trang). Tất cả miễn phí, không cần thẻ:
  - Groq — console.groq.com/keys (rất nhanh; gợi ý Kimi K2 / gpt-oss-120b / Llama 3.3 70B)
  - OpenRouter — openrouter.ai/keys (các model `:free`, ~50 lượt/ngày)
  - Cerebras — cloud.cerebras.ai (rất nhanh, ~1 triệu token/ngày)
- Khoá chỉ lưu trong trình duyệt máy đang dùng (localStorage), không lưu lên Supabase/GitHub.
- Chỉ Gemini đọc trực tiếp được ảnh/PDF; khi chạy bằng dự phòng, ảnh được bỏ qua và phần chữ đã trích từ nguồn vẫn được dùng.

## Lỗi "API chưa được bật" khi đẩy lên Google
Thông báo lỗi giờ có nút **"Bật Google Drive API"** (hoặc Gmail API) mở đúng trang Google Cloud của dự án dùng để đăng nhập → bấm **Enable** → đợi 1–2 phút → **Thử lại**. Cần Drive API (đẩy Docs/Sheets/Word/PDF); Gmail API chỉ khi tạo thư nháp bàn giao.
