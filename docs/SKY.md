# Bầu trời ASV5 (HDRI anime)

Nguồn: bộ 64 HDRI stylized anime **ASV5** (8 thời điểm × 8 thời tiết, 4096×2048 equirect).
Game không dùng HDR trực tiếp: mỗi map được chuyển sẵn thành ảnh JPG nhẹ trong `assets/sky/asv5/`.

## Ảnh

`assets/sky/asv5/<giờ>_<kiểu>.jpg` — equirect 3072×864 (JPEG q90, màu 4:4:4), từ đỉnh trời (90°) xuống **-12° dưới chân trời**
(mây ASV5 kéo dài xuống dưới chân trời nên không bị cắt cụt sau đồi/rặng cây).

- `<giờ>`: `dawn`, `sunrise`, `morning`, `noon`, `afternoon`, `sunset`, `blue` (blue hour), `night`
- `<kiểu>`: `01` Clear · `02` Fair Clouds · `03` Broken Clouds · `04` Overcast · `05` Fog · `06` Rain · `07` Thunderstorm · `08` Snow

Lúc chuyển đổi, đĩa mặt trời/mặt trăng vẽ sẵn trong HDRI bị xoá (game tự vẽ mặt trời/trăng), vùng sáng >1 được nén mềm.
Meta trong `SKYM` (src/game.js) gồm màu trung bình tuyến tính của 3 dải chân trời/giữa/đỉnh, đo đúng theo ánh xạ độ cao
trong shader, và `su` là vị trí ngang của vầng sáng, dùng để xoay ảnh trùng hướng mặt trời.

## Cấu hình: `SKYCFG` trong src/game.js (mỗi nhánh một bộ)

| khoá | ý nghĩa |
|---|---|
| `times` | lịch giờ game → bộ trời. Giữa 2 mốc thì hoà mượt (smoothstep); 2 mốc trùng tên thì giữ nguyên ảnh |
| `wx` | thời tiết game → kiểu ảnh (`clear`→`01`…). Đổi thời tiết = nạp bộ mới vào "khe" đang ẩn rồi hoà sang trong `wxT` giây, không nhảy ảnh |
| `look` | `[giờ, tương phản, bão hoà, phơi sáng, gk, độ rực mặt trời, màu ám trời, màu nắng]`, nội suy mượt theo giờ. Bình minh ám hồng đào, giờ vàng ám hổ phách, đêm sáng hơn cho khớp mood cũ. `gk` = mức kéo màu ảnh về dải màu theo giờ của game |
| `rep` | số lần lặp ảnh quanh vòng trời (2 = mây nhỏ bằng nửa, dày hơn, nét hơn) |
| `haze` | độ mờ đục về màu không khí theo thời tiết (sương, tuyết, mưa dày) |
| `wexp`, `dim` | làm tối trời khi mưa/giông |

Uniform shader:
- `uGK`: mức kéo màu ảnh về dải màu grading theo giờ/thời tiết (giữ mood của nhánh).
- Mặt trời điện ảnh: lõi sáng >1 (để bloom), quầng gần, dải nắng ấm sát chân trời khi mặt trời thấp. Mây phía mặt trời được rọi ấm. Độ mạnh lấy theo `look`.
- `uVG`: nén độ cao về phía chân trời (pow), để phần mây đẹp ở giữa HDRI nằm ngay tầm mắt người chơi thay vì trên đỉnh đầu.

Hướng xoay chạy liên tục cả 24h: ban ngày bám hướng mặt trời, ban đêm quay tiếp về hướng bình minh,
nên mây không giật lúc chuyển ngày/đêm.

## Thêm hoặc đổi map

1. `W=3072 GAM=0.62 python3 tools/sky_asv5.py <thư mục .hdr> <thư mục ra>`: cắt 90°…-12°, rộng W, xoá đĩa mặt trời/trăng, ghi meta.json (GAM phải bằng `uVG`).
2. Chép JPG vào `assets/sky/asv5/`, thêm meta vào `SKYM`, rồi tăng `SKYCFG.ver` để trình duyệt nạp lại ảnh.

## Bình minh và giờ vàng điện ảnh (grade toàn cảnh)

Khối `BÌNH MINH + GIỜ VÀNG ĐIỆN ẢNH` trong `envApply` (src/game.js) bật dần theo giờ và giảm theo mây:
bình minh 5:12 → 6:18 → 7:54, giờ vàng 16:00 → 18:09 → 19:45. Trời càng nhiều mây thì hiệu ứng càng yếu, mưa hoặc u ám thì tắt.

- Nắng gắt hơn, trời và ánh sáng môi trường yếu đi → tương phản sáng/tối rõ. Vùng khuất nắng ngả hồng đào thay vì tím xám.
- Grade: tăng tương phản, ám hổ phách, bóng tím ấm, vignette. LUT `uGold` trong Grade pass kéo lá xanh ngả vàng lục,
  có vai sáng mềm để trời quanh mặt trời không cháy trắng.
- Bloom mạnh hơn, ngưỡng thấp hơn trong khung giờ này.
- Áp sau khi HANA đã lấy grade gốc (`HU.uHG`), nên cây cỏ HANA cũng nhận đúng grade này.

Thông số `G` (dawn, dusk, con, sat, temp, vig, expo, tint, hi, sh, bloom, th, sun, amb, lut, ambC, ambMix) nằm ngay trong khối đó.
