# blend2glb — xuất cây cối từ Poly Nature Pack (.blend) sang GLB, KHÔNG cần cài Blender
1. Giải nén file .blend (Blender 4.x nén zstd nhiều khung): `node unblend.js poly_nature_pack_assets.blend assets.blend`
2. Sửa `groups.json`: mỗi nhóm = 1 món bán trong cửa hàng, `variants` = tên object asset trong file .blend (biến thể khi rải).
3. `python3 build_glb.py ra/ tools/blend2glb/tex` → `ra/glb/<id>.glb` (mỗi biến thể là node v0, v1…). `tex/` chỉ dùng lúc xuất để LẤY MÀU (atlas-a..f.png) — GLB không chứa texture.
4. Chép `ra/glb` vào `assets/nature/glb/` (tăng `?v=` trong src/build/furniture.js để xoá cache).
Ghi chú: Z-up → Y-up, gốc = origin object (gốc thân cây). Bỏ hết shader/texture của pack, chỉ giữ màu: atlas → COLOR_0, lá → baseColorFactor (đúng màu lá trong map vườn). Giữ tên vật liệu `PolyFoliage_v01_*_Wind` / `PolyShader_v15_*_Wind` để exterior.js styleMat nhận là cây cỏ. Hoa/cỏ/lau/dương xỉ: mỗi đỉnh có `_ROOT` = gốc nhánh (cụm được tách thành nhánh) → gió & cúi tính theo từng nhánh.
Asset: Poly Nature Pack (polyperfect / Pirogy Studios) — bản quyền thương mại của chủ dự án, chỉ dùng trong game, không phát tán lại file gốc.
