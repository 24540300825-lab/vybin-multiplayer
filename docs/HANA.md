# Cây cỏ HANA trong game

Cây, bụi, cỏ, hoa, đá, đá dẫn lối, chậu và mặt đất ngoài vườn (cả 4 cấp nhà) đều dùng asset HANA bạn làm trong Blender.

## Cập nhật khi export lại từ Blender

1. Đặt `hana_scene.glb` + thư mục `textures/` vào cùng một chỗ.
2. Chạy bộ chuyển đổi:
   ```
   python3 tools/hana_kit.py <hana_scene.glb> <thư mục textures> assets/flora-hana.glb
   ```
   - Tên object trong Blender phải giữ như hiện tại: `Tree_Leaf_1`, `Tree_Branch_1`, `Bush_2…`, hậu tố `_LOD1` / `_LOD2`, `Grass_plane`, `Rock_*`, `Rock_Flat_*`, `pot1–5`, hoa.
   - Đổi tên thì sửa bảng `TREES / BUSHES / SOLIDS` ở đầu file `tools/hana_kit.py`.
3. Mặt đất Moss: `assets/ground-hana.glb` (tấm plane của bạn; game tự lặp theo cạnh tấm).
4. Decal xa (tấm cây/bụi/cỏ cho đằng xa):
   ```
   node tools/hana_bake/bake.cjs <thư mục có hana_scene.glb + textures + hana-three.js> <three r160>
   ```
   - Kết quả ra `assets/decal/h_*.png` + `h_meta.json`.
   - Chép số trong `h_meta.json` vào `META_H` trong `src/decals.js`.
5. Chạy `python3 tools/build_manifest.py`.

## Màu

- Màu = đúng màu Blender (Standard) lúc 12h trời quang.
  - Game bù ngược tone mapping ACES và lớp hậu kỳ màu của game riêng cho HANA.
  - Giờ khác hoặc thời tiết khác: nhân theo ánh sáng môi trường (vùng nắng và vùng bóng riêng).
- Khối sáng tối, bóng đổ, gió, cúi khi đi qua, mờ khi che nhân vật, mưa ướt, sương: dùng chung hệ của game.
- Chỉnh nhanh trong `src/hana.js`:
  - `HU.uHSun` / `HU.uHAmb`: cường độ nắng / trời quy đổi (= Sun Strength 4 / World 0.35 của Blender).
  - `HU.uHSolidLift`: độ sáng đá và chậu.
  - `HUE_SYNC`: kéo hue của cỏ và mặt đất về tông cây bụi.
  - `HU.uHGBot`: vùng tối ở gốc cỏ.

## LOD

| Loại | LOD0 | LOD1 | LOD2 | Xa hơn |
|---|---|---|---|---|
| Cây | < 18 m | 18–26 m | 26–32 m | decal |
| Bụi | < 12 m | 12–16 m | 16–18 m | decal |
| Cỏ | cả tấm Grass_plane < 10 m | 40% cọng, 10–15 m | — | decal dải cỏ |

- Khoảng cách nhân theo mức chất lượng.
- Bụi 4 không có LOD2: tool tự làm thưa từ LOD1.
