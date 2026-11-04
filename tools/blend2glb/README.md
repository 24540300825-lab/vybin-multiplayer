# blend2glb — xuất cây cối từ Poly Nature Pack (.blend) sang GLB, KHÔNG cần cài Blender
1. Giải nén file .blend (Blender 4.x nén zstd nhiều khung): `node unblend.js poly_nature_pack_assets.blend assets.blend`
2. Sửa `groups.json`: mỗi nhóm = 1 món bán trong cửa hàng, `variants` = tên object asset trong file .blend (biến thể khi rải).
3. `python3 build_glb.py ra/` → `ra/glb/<id>.glb` (mỗi biến thể là node v0, v1…), dùng chung texture `ra/tex/` (atlas-a..f.png 512, foliage-a..d.jpg 128 — thu nhỏ từ thư mục TEXTURES của pack).
4. Chép `ra/glb` + `ra/tex` vào `assets/nature/`.
Ghi chú: Z-up → Y-up, UV lật v, gốc = origin object (gốc thân cây). Giữ tên vật liệu `PolyFoliage_v01_*_Wind` / `PolyShader_v15_*_Wind` để shader toon của game cho lá đung đưa.
Asset: Poly Nature Pack (polyperfect / Pirogy Studios) — bản quyền thương mại của chủ dự án, chỉ dùng trong game, không phát tán lại file gốc.
