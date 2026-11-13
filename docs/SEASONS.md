# Mùa lễ — Giáng sinh, Năm mới, Tết: cách bỏ đồ của bạn vào game

Phần hệ thống đã làm sẵn. Bạn chỉ cần dựng **đồ trang trí, trang phục, khung ảnh** rồi bỏ file vào `assets/`.
Sau đó chạy `python3 tools/quantize_normals.py` (cho file .glb) và `python3 tools/build_manifest.py` là game tự nhận, không phải sửa code.

| Mùa | id | Tự bật (giờ Việt Nam) |
|---|---|---|
| Giáng sinh | `christmas` | 01/12 → 26/12 (ngày đầu tiên vào game có tuyết rơi) |
| Năm mới | `newyear` | 27/12 → 02/01 · pháo hoa 0h ngày 1/1 |
| Tết Nguyên Đán | `tet` | 23 tháng Chạp → mùng 7 (Tết Đinh Mùi: 30/01 → 12/02/2027) · pháo hoa giao thừa |

Muốn sửa ngày, giờ bắn pháo hoa: `src/season/calendar.js`.

**Xem thử trước:**
- Thêm `?season=christmas` (hoặc `newyear`, `tet`, `off`) vào cuối địa chỉ.
- Hoặc bấm nút 🎄 trên thanh công cụ (chỉ có ở bản test).

---

## 1. Đồ trang trí — `assets/season-<id>.glb`

Mỗi mùa dùng **một file** chứa đồ cho mọi map, ví dụ `season-tet.glb` hoặc `season-christmas.glb`.

**Node gốc** (Empty hoặc Collection ở cấp cao nhất) phải **đặt tên theo map**. Đồ trong node đó chỉ hiện ở map đó:

| Tên node gốc | Hiện ở |
|---|---|
| `exterior` | Vườn ngoài nhà (và cả ngoại cảnh nhìn qua cửa sổ của các phòng) |
| `living`, `vy`, `bin` | Phòng khách, phòng Vy, phòng Bin |
| `game`, `workshop`, `memory`, `greenhouse` | Các phòng L2 |
| `karaoke`, `spa`, `library`, `cinema` | Các phòng L3 |
| `master`, `pets`, `cafe`, `bowling` | Các phòng L4 |

- **Đồ chỉ có khi nhà đã lên cấp:** thêm `@L<cấp>` vào tên. Ví dụ `exterior@L3` chỉ hiện khi nhà ≥ L3, hợp cho đồ đặt trên phần đất hoặc tầng mới.
- **Toạ độ:** dựng đồ ngay trong file map tương ứng (`map-living.glb`, `map-exterior.glb`…) để đúng chỗ, rồi chuyển đồ sang file mùa lễ và giữ nguyên toạ độ.
  - Gợi ý: append map vào Blender làm nền, đặt đồ vào node gốc, rồi xoá map trước khi export.
- **Đèn có ánh sáng toả (glow):** cần đủ 2 điều kiện, đồ khác giữ màu bình thường, không bị chói.
  - **Vật liệu** (không phải mesh) có tên chứa `Bulb`, `Lamp`, `Lantern`, `Neon`, `Candle`, `Festoon`, `Star_Light` hoặc `glow`. Ví dụ `Lantern_Red` cho đèn lồng, `Festoon_Warm` cho dây đèn, `Star_Light_Gold` cho ngôi sao đỉnh cây thông.
  - **Emission** trong vật liệu có màu (không để đen).
- **Đồ cao che nhân vật** (cây thông, cây nêu, cây mai lớn) tự mờ đi khi đứng sau, giống đồ có sẵn của nhà.

### Ghim hoạt động (PIN)

Thêm một Empty tên `PIN_<id>` ở chỗ muốn có ghim. Hoặc gắn lên một mesh 2 custom property `pin = <chữ hiện trên ghim>` và `id = <id>`: ghim sẽ nằm trên mesh đó.

| id | Khi bấm |
|---|---|
| `PIN_photobooth` | Mở chế độ chụp ảnh với khung mùa lễ. Gợi ý đặt ở phòng khách, cạnh cây thông hoặc cây mai. |
| Tên bất kỳ khác | Hiện "Sắp có" (để dành cho hoạt động sau này: gói bánh chưng, lì xì, treo câu đối…) |

Muốn đổi chữ hiện trên ghim của Empty `PIN_…`, gắn thêm custom property `pin = <chữ>`. Ví dụ: `pin = Chụp ảnh Tết`.

---

## 2. Trang phục — `assets/costume-<vy|bin>-<id>.glb`

Mỗi nhân vật dùng một file riêng vì dáng người khác nhau. Ví dụ: `costume-vy-aodai.glb`, `costume-bin-aodai.glb`.

1. Mở file nhân vật (`char-vy.glb` / `char-bin.glb`) trong Blender. Dựng đồ **trên đúng bộ xương đó** và **không đổi tên xương**.
2. **Áo, váy, áo dài, quần** (đồ co giãn theo người): mesh có Armature modifier, weight-paint vào các xương của nhân vật.
3. **Mũ, gạc tuần lộc, kính, khăn, bờm** (đồ cứng): làm mesh thường, parent vào một xương bằng *Parent → Bone*, thường là xương đầu hoặc cổ.
4. **Che đồ gốc:** nếu đồ mới che áo gốc mà áo gốc xuyên ra ngoài, thêm custom property `hide = Ten_Mesh_Ao_Goc` (nhiều mesh thì cách nhau bằng dấu phẩy). Game sẽ ẩn các mesh đó khi mặc.
5. Export glTF Binary, **chỉ gồm Armature và đồ mới**. Bỏ thân người gốc ra; không cần animation.

**Tên và mùa** của từng bộ ghi ở `src/season/costumes.js`. Tủ đồ 👗 chỉ hiện bộ thuộc mùa đang bật. Các id đã khai báo sẵn:

| id | Tên | Mùa |
|---|---|---|
| `noel` | Bộ Noel | christmas |
| `santahat` | Mũ Noel | christmas |
| `antler` | Gạc tuần lộc | christmas |
| `sweater` | Áo len đôi | christmas |
| `glasses` | Kính năm mới | newyear |
| `aodai` | Áo dài | tet |
| `phuc` | Áo len Phúc | tet |

- Muốn đổi tên hoặc thêm bộ: sửa file `src/season/costumes.js`. Bộ không khai báo vẫn hiện, với tên = id và mặc được quanh năm.
- Người kia thấy đúng bộ bạn đang mặc. Hết mùa thì nhân vật tự về đồ thường.

---

## 3. Khung ảnh photobooth — `assets/frame-<mùa>-<tỉ lệ>.png`

Dùng PNG nền trong suốt, phần giữa để trống cho ảnh. Khung được kéo vừa khít vùng chụp.

| File | Kích thước gợi ý | Dùng cho |
|---|---|---|
| `frame-tet-9x16.png` | 1080 × 1920 | Story Instagram / TikTok / Facebook |
| `frame-tet-1x1.png` | 1080 × 1080 | Bài đăng vuông |
| `frame-tet-full.png` | 1920 × 1080 | Toàn màn hình (máy tính) |

Mùa khác thì đổi `tet` thành `christmas` hoặc `newyear`. Thiếu tỉ lệ nào thì tỉ lệ đó chụp không có viền.

**Chế độ chụp ảnh 📸:**
- Ẩn toàn bộ giao diện; chọn tỉ lệ khung; bật hoặc tắt viền mùa lễ.
- Hẹn giờ 3 hoặc 10 giây, đủ thời gian chạy vào tạo dáng.
- Ảnh lưu PNG, cạnh ngắn ≥ 1080 px. Trên điện thoại sẽ mở bảng chia sẻ để đăng luôn.

---

## 4. Pháo hoa 🎆

- **Chỉ bắn khi cả hai cùng online**: đếm ngược 10 giây rồi bắn khoảng 2,5 phút trên trời sau nhà.
  - Thấy được ở vườn và trong các phòng có cửa sổ; tầng hầm (rạp phim, bowling) thì không.
- Tới giờ mà mới có một người: trong vòng 60 phút sau, lúc người kia vào sẽ đếm ngược rồi bắn.
- Giờ bắn ghi ở `FIREWORKS` trong `src/season/calendar.js`. Hiện để tạm 0h ngày 01/01/2027 và 0h giao thừa (06/02/2027) — **chờ bạn chốt giờ**.
- Bản test có nút 🎆 "Thử pháo hoa": đếm ngược rồi bắn 1 phút, cả hai cùng thấy.
