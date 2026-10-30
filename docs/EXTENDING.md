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
