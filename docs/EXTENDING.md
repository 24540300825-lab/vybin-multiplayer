# Cách mở rộng game (map, nhân vật, minigame…) mà không viết lại

Nguyên tắc: **mỗi thứ mới là 1 file/1 khối dữ liệu riêng**, đăng ký ở 1 chỗ. Không sửa code lõi (`game.js`, `net/`) trừ khi đổi luật chơi cốt lõi.

## 1. Thêm tính năng / minigame (không đụng code lõi)
1. Copy `src/features/_template.js` → `src/features/ten-cua-ban.js`, đổi `id`.
2. Thêm 1 dòng vào `src/features/registry.js`: `() => import('./ten-cua-ban.js'),`
3. Xong. Tắt tính năng = ghi chú dòng đó lại.

Trong `init(ctx)` bạn có:
| Thứ | Dùng để |
|---|---|
| `ctx.send(kind, data)` / `ctx.on(kind, fn)` | gửi/nhận tin cho người kia. Tự gắn nhãn theo `id` nên không đụng tính năng khác. Giới hạn 12 tin/giây/tính năng để khỏi cạn hạn mức Realtime. Bản game cũ chưa có tính năng này sẽ bỏ qua tin. |
| `ctx.slot`, `ctx.other`, `ctx.mapId`, `ctx.solo` | bạn là ai, map nào, có đang chơi một mình |
| `ctx.api` | engine (`snapshot()`, vị trí…) — chỉ đọc nếu có thể |
| `ctx.toast(text)` | thông báo nhỏ |
| `ctx.ui.addButton({icon,label,onClick})` | nút trên thanh trên cùng |
| `ctx.store.get/set` | lưu trên máy mình, tách theo `id` |
| `ctx.onPeer(fn)` | người kia vào/ra |

Dữ liệu nhỏ/hiếm → `ctx.send`. Dữ liệu phải lưu lâu → thêm bảng + RLS trong `supabase/migrations/00N_*.sql` (đừng sửa migration cũ).
Lỗi trong 1 tính năng chỉ làm **tính năng đó** tắt, game vẫn chạy.

## 2. Thêm map mới
1. Xuất `.glb` → `python3 tools/optimize_glb.py in.glb assets/map-xxx.glb`
2. `python3 tools/build_manifest.py` (sinh `src/manifest.js` + hash cache)
3. `src/assets.js`: `def('map-xxx', {owner:'xxx', priority:1})`
4. `src/maps.js` → `MAP_LIST.xxx = {name, icon, desc, assets:['map-xxx']}`
5. `src/map-configs.js` → `MAP_CONFIGS.xxx = {…}` (dữ liệu thuần):
   - `mezz`: tên mesh sàn gác (tầng 1); `seat`/`chair`: ghế ngồi; `treadNames` hoặc `tread` (regex): các bậc cầu thang
   - `walk0` `[xmin,xmax,zmin,zmax]` vùng đi tầng trệt; `l1` vùng tầng gác; `cl1` vùng giới hạn camera/di chuyển tầng gác
   - `tint`, `hide`, `hideFlat`, `gtex`, `out`, `lift`, `garden`: chỉnh màu/ẩn vật/đất/cây ngoài
6. Thử `?solo&as=bin#map=xxx`, rồi chơi thử 2 người.
Mẹo cầu thang: đặt các bậc có tên đúng mẫu, mỗi cầu thang 1 nhóm mesh; game tự đo độ cao bậc bằng tia ray nên không cần số liệu tay.

### Phòng trong nhà dùng chung ngoại cảnh (living / vy / bin)
- Mỗi phòng chỉ chứa NỘI THẤT (toạ độ x 0..10, z -8..0). Vỏ nhà + vườn lấy từ `map-exterior` (đúng bản đang chạy), dời bằng `MC.ext.dx/dz`.
- `MC.ext.hide`: regex các mảng vỏ của chính cánh nhà đang đứng (bị cắt để nhìn vào); `roofX`: tâm mái (instancing) cần ẩn.
- Tường/mái hàng xóm chắn giữa camera và nhân vật được "khoét" dither (`OCCW_GLSL`, cờ `material.userData.occW`).
- `MC.doors` = ghim chuyển map; `MC.spawnFrom[mapVừaRời]` = [x,z,yaw,tầng]; `camMirror` = camera nhìn từ bên trái.
- Cây cỏ ngoài vườn không mọc trong lòng nhà: `MAP_CONFIGS.exterior.noPlant` (hộp x0,x1,z0,z1 theo toạ độ vườn).
- Chuẩn bị file phòng mới: `tools/prune_glb.py file.glb out.glb --keep TÊN_ROOT --rename '^GD_='` → `quantize_normals.py` → `optimize_anim.py` → `build_manifest.py`.
  Cần các tên: `Stair` (cầu thang), `Mezzanine` (sàn gác), `Desk_Chair` + `Desk` (ghế quay về bàn), `Bed`, `Door_Entrance_Leaf` (cửa sang phòng khác).
- Ghép clip mở cửa từ file khác (tự đổi tâm xoay bản lề): `tools/graft_anim.py`.

### Tối ưu asset trước khi đưa vào `assets/`
- Nhân vật: `python3 tools/optimize_anim.py in.glb out.glb --rot 0.001 --pos 0.0003 --qrot` (bỏ khoá animation thừa + góc xoay int16; sai lệch < 1°).
- Map: `python3 tools/quantize_normals.py in.glb q.glb && python3 tools/optimize_anim.py q.glb out.glb` (normal int8; `src/assets.js` tự đổi lại Float32 sau khi parse).
- Sau đó luôn chạy `python3 tools/build_manifest.py` để đổi mã cache.

### 2c. Map ngoài trời (`MC.outdoor`, ví dụ `exterior`)
- **Mặt đi được (hiên/bục/bậc):** `MC.porch=[x0,x1,z0,z1]` + `porchMax` — lúc dựng map bắn tia xuống lấy độ cao thật (`EXT.walkHeight`), `heightAt` trong game.js dùng nó; ngoài vùng này là mặt đất phẳng `floorY`. Thêm bục mới = mở rộng vùng `porch`.
- **Vật liệu/mesh mới:** phân loại ở `CLASS`/`classOf`, màu & độ bão hoà ở `styleMat` (exterior.js); cờ shader đặt ở `material.userData` (`fol2`, `grass`, `bush`, `desat`, `ground`…) — xem `toonMat` trong game.js.
- Chuẩn bị GLB: `python3 tools/prep_exterior.py EXTERIOR.glb assets/map-exterior.glb` (sửa clip trỏ node lỗi), rồi `python3 tools/build_manifest.py`.
- Cỏ là card có UV trỏ vào atlas alpha → file `assets/grass-mask.png` (cắt hình bằng alphaMap); màu gốc cỏ lấy theo nền tại chỗ.
- `MC`: `outdoor, floorY, walk0` (giới hạn đi), `camBox, grid, spawn, fence, block, blockSmall, doorTo/doorLabel` (cửa chuyển map). Mức đồ hoạ: `LEVELS` trong `src/exterior.js`.
- Cây/đá/nhà/hàng rào có va chạm (vòng tròn/hộp); cỏ & hoa quanh chân người chơi cúi xuống, cây bụi chắn camera mờ dần (dither).

### 2b. Khi cập nhật / thay map đang có (checklist "giữ nguyên tính năng")
Các tính năng hiện có bám vào **tên node** và **số liệu trong `MC`** (`src/map-configs.js`). Khi nhận GLB map mới, giữ đúng các tên này (hoặc sửa `MC` cho khớp) thì mọi thứ tự chạy lại:
- **Điểm tương tác (pin)**: node `Bed`, `Desk_Chair` (hoặc `MC.seat/chair`), `Sofa`, `TV_Panel`/`TV_Screen`, cửa `Doormat`/`Landing_Doormat`/`Door_Entrance_Leaf`/`GD_Door_Entrance_Leaf`. Đổi tên → pin lệch hoặc mất.
- **Ghế**: `MC.chair`, `MC.chairFlip` (true nếu ghế trong file quay ngược hướng).
- **Đèn + vệt sáng**: node khớp regex `Pendant_*Bulb*`. Vùng nhà dùng cho đèn/mưa đang cố định x -0.2..10.2, z -8.2..0.8, y<6.3 trong `game.js` → map mới khác kích thước phải sửa hộp này.
- **Tường kính (mặt trước + đỉnh)**: `MC.glass = {front:{x0,x1,z,y0,y1}, top:{x0,x1,z0,z1,y}}` — đo lại theo khung nhà mới. Bệ kính chỉ vẽ ở y<0.4 (sàn trệt).
- **Tầng gác / cầu thang**: `MC.mezz`, `MC.treadNames`/`MC.tread`, `MC.walk0`, `MC.l1`, `MC.cl1`.
- **Ẩn / tô màu / nâng**: `MC.hide`, `MC.hideFlat`, `MC.tint`, `MC.lift`, `MC.out`, `MC.gtex`, `MC.garden`.
- **Không phụ thuộc map** (giữ nguyên khi đổi map): màn chọn nhân vật + nhớ máy (`localStorage.vyChar`), cuộc gọi, HUD, nhân vật.
Sau khi đổi map: chạy `?solo&as=bin#map=xxx`, kiểm: pin hiện đúng chỗ, ngồi ghế/ngủ/xem TV, đèn đêm, tường kính mờ khi camera sát, mưa không lọt vào trong nhà.

## 3. Thêm / đổi nhân vật hoặc animation
- File `assets/char-<slot>.glb` (slot = `bin` hoặc `vy`).
- Game nhận clip theo **tên** trong file GLB: các clip dạng `ACT_…` (không chứa `__`) được tự đăng ký làm hành động, ví dụ `ACT_WALK`, `ACT_RUN`, `ACT_STANDING_IDLE`, `ACT_SITTING_IDLE`, `ACT_TYPING_IDLE`, `ACT_SLEEP-LOOP BREATHE`; clip mắt bắt đầu bằng tiền tố mắt đóng/mở/chớp (khai báo trong `DEF.eye`). **Giữ nguyên tên clip cũ khi đổi file**; clip mới đặt tên `ACT_TENMOI` thì tự có trong bảng `acts`, rồi gọi từ code/tính năng.
- Đổi file → chạy `build_manifest.py` (hash mới tự phá cache; người chơi không cần xoá cache).

## 4. Giao thức & phiên bản
- `src/version.js`: `APP_VERSION` (đổi mỗi lần phát hành) và `PROTO` (chỉ tăng khi đổi **định dạng tin nhắn** theo cách bản cũ không hiểu).
- Hai máy lệch `PROTO` → tự hiện cảnh báo "Ctrl+F5". Lệch `APP_VERSION` nhưng cùng `PROTO` → báo nhẹ.
- Quy tắc tương thích: **chỉ thêm trường mới, không đổi nghĩa trường cũ; kiểu tin lạ thì bỏ qua**.

## 5. Quy trình mỗi vòng feedback
1. Làm trên nhánh riêng → Vercel tự tạo **bản test** (preview).
2. Hai người thử xong → gộp vào `main` → Vercel tự lên **bản chính**.
3. Không hài lòng → `Vercel → Deployments → Promote` bản cũ (rollback 1 cú bấm).


## Thêm / chỉnh âm thanh (SFX)

Toàn bộ hiệu ứng âm thanh nằm trong `src/sfx.js`, tổng hợp bằng Web Audio — **không có file mp3**.

- Thêm một âm mới: thêm một hàm vào bảng `LIB` (ví dụ `myPing: (t, o) => bell(t, 84, {peak: 0.1 * o.v})`), rồi gọi `SFX.play('myPing')` ở nơi cần. Nếu âm to/nhỏ lệch so với âm khác, chỉnh hệ số trong bảng `TRIM` (đo bằng cách render offline rồi đưa về đỉnh ~0.1–0.3).
- Âm theo khoảng cách (nhân vật kia, cửa ở xa): `SFX.playAt('step', khoảng_cách_m, {range: 13})`.
- Âm lặp (chuông gọi): thêm vào `LOOPS` rồi bật/tắt bằng `SFX.loop('tên', true/false)`.
- Giao diện đã được tinh gọn: chỉ còn tiếng bấm nút rất nhẹ (`button`, `.ib`), tick xong việc và cảnh báo lỗi. Hover, kéo thanh, gõ phím, mở/đóng bảng, toast thường, bật/tắt công tắc **không** có âm (ưu tiên âm nhân vật & gameplay: bước chân, ngồi/đứng, giường, cửa…). Nút nào muốn tự quản âm riêng thì gắn `data-nosfx`.
- Người chơi chỉnh trong Cài đặt → Âm thanh (bật/tắt, âm lượng, âm môi trường); lưu trong trình duyệt (khóa `vySfx`).
- Trình duyệt chỉ cho phát âm sau lần bấm đầu tiên — trước đó mọi lệnh `SFX.play` im lặng, không báo lỗi.

## Cuộc gọi đến / đi

`src/ui/call-ring.js` lắng nghe `Voice`: có người gọi (`state.incoming`) → popup + chuông lặp; bấm Nghe = `voice.join()`, Từ chối = `voice.decline()`; bên gọi (`state.outgoing`) nghe tiếng chờ, tự dập máy sau 45 giây nếu người kia đang trong phòng mà không nghe. Âm thanh của người gọi bị tắt (muted) cho tới khi bên nhận bấm Nghe.

## 6. Tài khoản, ví & phần thưởng (Đợt 1 — `supabase/migrations/003_players_economy.sql`)
- **Tài khoản:** đăng nhập Google (Supabase Auth). Mỗi tài khoản = 1 nhân vật cố định (`game_players`, slot `bin`/`vy` duy nhất). Chọn 1 lần, mọi máy đăng nhập cùng Gmail vào đúng nhân vật. Cài đặt → Tài khoản → Đăng xuất để đổi Gmail.
- **Sổ giao dịch:** mọi Xu / XP / Điểm Kiến Tạo / điểm kỹ năng đi qua hàm máy chủ `_grant` → bảng `game_ledger` (có `idem` chống cộng trùng, không âm). Client KHÔNG gửi số dư; chỉ gọi `game_*` (RPC).
- **Bảng cân bằng = bảng `game_config`** (sửa trong Supabase → Table editor, hoặc Command Center sau này; mỗi lần sửa tự lưu vào `game_config_history`):
  `welcome` quà chào mừng · `levels` ngưỡng XP · `level_rewards` quà lên cấp · `rewards` luật thưởng theo sự kiện (`once`, `daily`, `xu`, `xp`, `kt`) · `focus` phiên tập trung · `skills` nhánh kỹ năng (`live:false` = Sắp có) · `achievements` danh mục thành tựu · `house_levels` giá lên cấp nhà · `tz` múi giờ reset ngày.
- **Thêm nguồn thưởng mới:** (1) thêm mã vào `allowed` trong `game_report` (migration mới), (2) thêm luật vào `game_config.rewards`, (3) gọi `VYPROG.report('ma_su_kien', {...}, 'idem')` ở client. Thành tựu: thêm 1 mục vào `achievements` với `event` = mã đó — không cần code.
- **Hộp quà** (`game_inbox`): quà lên cấp, thành tựu, chào mừng, và sau này đồ dư khi túi đầy. Món `c:"soon:*"` chỉ hiển thị (Sắp có).
- Thử cục bộ không cần Google: `?mock=/dev/mock-supabase.js` (giả lập cũ, không có tiến trình). Luồng tài khoản thật chỉ chạy trên Supabase.
