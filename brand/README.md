# Bộ phôi thương hiệu VY · BIN

Tất cả là **SVG thuần** (mở thẳng trong Figma: kéo thả hoặc File → Place image / Import). Không phụ thuộc phần mềm nào.

## Có gì
| Thư mục | Nội dung |
|---|---|
| `logo/` | mark (màu / không nền / 1 màu), wordmark, lockup ngang & dọc |
| `app-icon/` | icon 1024, maskable 512, apple-touch 180, favicon 32 |
| `avatars/` | avatar Bin, Vy (placeholder chữ cái) |
| `social/` | ảnh chia sẻ link 1200×630, màn hình tải 1920×1080 |
| `ui-icons/` | ~60 icon nét 24×24 (thay cho emoji hiện tại) + `_sheet.svg` xem tất cả |
| `colors/` | bảng màu (`palette.svg`) |
| `tokens.json` | màu, font, bo góc, tên, link — dạng dữ liệu |
| `text-manifest.md` | mọi tên/chữ/đường link cần quyết định |

**Logo hiện tại chỉ là phôi đề xuất** (ngôi nhà nhỏ + hai vòng tròn giao nhau = hai người trong một căn phòng). Bạn thoải mái vẽ lại.

## Khi bạn làm xong trong Figma, trả lại theo quy ước này
- Xuất **SVG** (Figma: Export → SVG, bật "Outline text"), giữ **đúng tên file** như bộ phôi để mình thay thẳng vào game.
- Icon UI: khung **24×24**, nét **2px**, đầu nét tròn, tô bằng `currentColor` (để game đổi màu được).
- Màu: giữ tên token trong `tokens.json` (`sun`, `coral`, `accent`…); nếu đổi giá trị chỉ cần gửi lại bảng màu.
- Gửi kèm font (hoặc tên font + nguồn miễn phí, ví dụ Google Fonts) để game tải đúng.
- Muốn thêm icon mới: đặt tên `ten-icon.svg` (chữ thường, gạch ngang).
