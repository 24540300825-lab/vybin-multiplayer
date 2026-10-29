# VY/BIN studio — multiplayer (Vercel + Supabase)

Web tĩnh (ES modules + importmap, **không cần build**) + Supabase (Auth ẩn danh, Postgres, Realtime) + WebRTC voice.
Người vào đầu = **BIN**, người thứ hai = **VY**, người thứ ba bị chặn ("phòng đã đủ").

## 1. Deploy (≈10 phút)

### Supabase
1. Tạo project tại supabase.com (free được).
2. **Authentication → Providers → Anonymous Sign-Ins → bật.**
3. **SQL Editor** → dán toàn bộ `supabase/migrations/001_init.sql` → Run. (Tạo bảng, RLS, RPC, publication, policy cho Realtime private channel.)
4. **Realtime → Settings**: để Realtime bật; nếu có tuỳ chọn "Allow public access" thì **tắt** (dùng private channel).
5. **Settings → API**: lấy `Project URL` và `anon/publishable key`.
6. Mở `config.js`, điền `supabaseUrl` + `supabaseAnonKey`. Đây là khoá CÔNG KHAI. **Không** dán `service_role` vào đâu cả.

### Vercel
- Cách dễ: đẩy thư mục này lên GitHub → vercel.com → *Add New Project* → import repo → Framework: **Other**, không build command, output = thư mục gốc → Deploy.
- Hoặc CLI: `npx vercel --prod` trong thư mục này.
- `vercel.json` đã có cache header (assets immutable, hash theo `?v=`) và Permissions-Policy cho micro. Vercel cấp HTTPS (bắt buộc cho voice).

### TURN (nên có nếu chơi khác mạng / 4G)
STUN Google có sẵn (đủ cho đa số mạng nhà). Mạng chặt (4G, wifi công ty, NAT đối xứng) cần TURN. Game dùng **thông tin TURN ngắn hạn (1 giờ) do backend cấp**: trình duyệt gọi `/api/turn` (file `api/turn.js`), hàm này kiểm tra đăng nhập + đang ở trong phòng rồi mới trả thông tin. Khóa bí mật nằm trong biến môi trường Vercel, KHÔNG nằm trong trình duyệt/repo.
- Cloudflare Realtime TURN: đặt `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`.
- Hoặc Metered Open Relay: đặt `METERED_APP`, `METERED_API_KEY`.
- Chưa đặt biến nào => cuộc gọi vẫn chạy bằng STUN (bảng chẩn đoán 📊 ghi "TURN cấp: không").
- Dòng `turn:` tĩnh trong `config.js` vẫn dùng được như phương án dự phòng (công khai, không khuyến khích).

### Kiểm tra sau deploy
Mở URL ở 2 trình duyệt/thiết bị: máy 1 = BIN, máy 2 = VY; thử di chuyển, ngủ giường, chat, bấm nút Voice. Mở máy thứ 3 → phải thấy "Phòng đã đủ 2 người". `?perf` hoặc F3 hiện overlay FPS.

## 2. Điều khiển
WASD + Shift (chạy) + E (tương tác) + click để đi; chuột phải/kéo xoay camera. Camera luôn bám nhân vật của mình. T mở chat, M tắt/mở tiếng. Nút 🎙️ Voice = vào cuộc gọi (chỉ tiếng); nút 📹 Video = mở khung video, bật camera trong khung đó.

## 3. Kiến trúc
- `src/main.js` boot: cổng → Session → nạp asset (map + nhân vật của mình) → game.
- `src/net/session.js` slot nguyên tử (RPC `claim_slot`), heartbeat 25s, stale 90s, phát hiện tab trùng (tab mới thắng), Broadcast + Presence.
- `src/net/sync.js` đồng bộ: lệnh (move/sleep/sit/…) + input + snapshot 6Hz (1Hz khi đứng yên), nội suy/ngoại suy, snap nếu lệch >3m. **Không ghi DB cho dữ liệu tần suất cao.**
- `src/net/chat.js` chat lưu DB (RLS, trigger điền slot/user phía server), dedupe, unread, bù tin khi mất kết nối.
- `src/net/voice.js` WebRTC 2 chiều; tín hiệu qua kênh Realtime; lỗi voice không ảnh hưởng game.
- `src/assets.js` + `src/manifest.js` registry asset: nạp theo yêu cầu, đếm tham chiếu, dispose.
- `src/maps.js` danh sách map, chuyển map (fade + reload, đồng bộ qua `rooms.map_id`).
- `src/perf.js` đo fps/p95/hitch/draw calls/tris.

## 4. Thêm map mới
1. Xuất `.glb` → chạy `python3 tools/optimize_glb.py in.glb assets/map-xxx.glb` (nén texture, không đụng mesh/animation).
2. `python3 tools/build_manifest.py` (sinh lại `src/manifest.js` kèm hash cache).
3. Khai báo trong `src/assets.js` (`def('map-xxx',{owner:'xxx'})`), `src/maps.js` (`MAP_LIST`), và cấu hình `MC.xxx` trong `src/game.js` (giống `MC.house`).

## 5. Thêm tính năng đồng bộ
Phát qua `api.emit(kind, data)` (game.js) và xử lý trong `bindSync` (sync.js). Dữ liệu nhỏ/hiếm → broadcast; dữ liệu cần lưu → bảng + RLS mới trong migration `002_*.sql`.

## 6. Benchmark (proxy, headless SwiftShader — KHÔNG phải GPU thật)
| Map | Tam giác trước | sau | Draw calls | CPU/khung (ms, headless) |
|---|---|---|---|---|
| house | 2.33M | 0.94M | 306 → 376 | 22.7 → 7.8 |
| studio | — | 0.63M | 438 | 10.0 |
Biện pháp: gộp mesh, InstancedMesh theo ô 8m + frustum culling + LOD mật độ theo khoảng cách, bóng chỉ gần camera và cập nhật 1/2 khung, nén texture, pixel ratio thích ứng, warm-up shader. **FPS thật trên thiết bị phải đo bằng F3 trên máy bạn.**

## 7. Báo cáo kiểm thử
Chạy với backend giả lập (2 tab Playwright, `dev/mock-supabase.js`) — **mô phỏng, không phải Supabase thật**:
PASS: gán slot BIN/VY, nhìn thấy nhau, đồng bộ click-move/WASD/giường, chat 2 chiều không trùng + unread, voice kết nối + có byte audio (mic giả), mute, rời/vào lại voice, F5 giữ slot, người thứ 3 bị chặn, đổi map đồng bộ.
**CHƯA kiểm chứng**: Supabase thật (RLS, policy `realtime.messages`, anonymous auth), Vercel thật, TURN/khác mạng, FPS trên GPU thật, ổn định phiên dài, thiết bị di động.

## 7b. Cuộc gọi video (BR-004) — kiểm thử
Chạy bằng Chromium thật (Playwright) với camera/mic **giả**, 2 cửa sổ cùng máy, mạng loopback (`host→host`), tín hiệu qua kênh giả lập (không phải Supabase thật):
- ĐÃ CHẠY, đạt: nối cuộc gọi (kể cả bên kia chưa bấm vào), tiếng + hình 2 chiều có byte/FPS thật, tắt/bật camera, tắt tiếng, thu nhỏ khung => bên kia ngừng gửi hình (tiếng không đổi), mất tín hiệu 12 giây (media không đứt, cùng 1 kết nối, không tạo trùng), ICE restart thật, dựng lại kết nối, F5 một bên / cả hai bên, tự vào lại sau đổi map/F5, rút micro/camera (mô phỏng sự kiện ngắt), từ chối quyền (mô phỏng), kết thúc => camera/mic/kết nối/timer/listener đều giải phóng.
- MÔ PHỎNG (số liệu mạng bịa để thử thuật toán, không phải mạng yếu thật): tự hạ chất lượng, tạm dừng hình, tự nâng lại.
- CHƯA CHẠY: hai máy thật / khác mạng / 4G, TURN thật (chưa có tài khoản TURN), Safari/iOS/Firefox, camera & micro thật, CPU/RAM trên máy thật khi đang chơi 3D, Supabase Realtime thật dưới tải cuộc gọi.

## 8. Giới hạn đã biết
- Đổi map = tải lại trang => cuộc gọi đứt vài giây rồi **tự nối lại** (nếu trình duyệt đã nhớ quyền mic/camera; Safari có thể phải bấm lại).
- Cuộc gọi có hình tốn băng thông: ~0.2–1.1 Mbps mỗi chiều (tự hạ khi mạng yếu); đi thẳng giữa 2 máy, không tốn quota Supabase. Chỉ **tín hiệu** (vài chục tin lúc nối) đi qua Realtime.
- Qua TURN: tốn băng thông của nhà cung cấp TURN (gói free có hạn mức, xem trang nhà cung cấp).
- Đổi map = tải lại trang (có fade).
- Remote có thể lệch nhẹ rồi tự hiệu chỉnh bằng snapshot.
- Free tier Supabase giới hạn ~2M message Realtime/tháng.
- Voice cần HTTPS; mạng chặt cần TURN.
- three.js và supabase-js tải từ CDN (jsdelivr); muốn tự host thì chép vào repo và sửa importmap/`supabaseJs`.

## 9. Bảo mật
Chỉ anon key ở frontend. Mọi ghi DB đi qua RPC SECURITY DEFINER hoặc RLS `is_room_member()`; slot/user của tin nhắn do trigger điền; kênh Realtime private có policy. Không có service_role trong repo.
