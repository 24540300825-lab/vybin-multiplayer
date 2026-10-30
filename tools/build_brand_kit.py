#!/usr/bin/env python3
"""Sinh bộ phôi SVG thương hiệu vào brand/. Chạy: python3 tools/build_brand_kit.py"""
import os, json, textwrap
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'brand')
C = dict(sun='#ffc46b', coral='#ff8f6b', accent='#ffd27a', cream='#f8f1e1', cream2='#d9cfb8', brown='#3b2a1a', glass='#4a4634', bg='#12151b', bg2='#3a3524', green='#7cf08a', red='#c0392b')
FONT = "Nunito, 'Segoe UI', system-ui, sans-serif"

def w(path, s):
    p = os.path.join(R, path); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write(s.strip() + '\n')

GRAD = f'<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{C["sun"]}"/><stop offset="1" stop-color="{C["coral"]}"/></linearGradient>'

def mark_inner(roof=C['cream'], l=C['brown'], r=C['cream'], lens=C['coral']):
    return f'''<path id="roof" d="M56 120 L128 62 L200 120" fill="none" stroke="{roof}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <circle id="bin" cx="104" cy="160" r="36" fill="{l}"/>
  <circle id="vy" cx="152" cy="160" r="36" fill="{r}"/>
  <clipPath id="lensClip"><circle cx="104" cy="160" r="36"/></clipPath>
  <circle id="lens" cx="152" cy="160" r="36" fill="{lens}" clip-path="url(#lensClip)"/>'''

# ---- logo ----
w('logo/mark-color.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <title>VY·BIN — mark (color)</title><defs>{GRAD}</defs>
  <rect id="bg" width="256" height="256" rx="58" fill="url(#g)"/>
  {mark_inner()}
</svg>''')
w('logo/mark-symbol.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <title>VY·BIN — symbol (không nền)</title>
  {mark_inner(roof=C['sun'], l=C['brown'], r=C['cream'])}
</svg>''')
w('logo/mark-mono.svg', '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
  <title>VY·BIN — mark (1 màu, dùng currentColor)</title>
  <path d="M56 120 L128 62 L200 120"/><circle cx="104" cy="160" r="36"/><circle cx="152" cy="160" r="36"/>
</svg>''')
w('logo/wordmark.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 120" width="520" height="120">
  <title>VY·BIN — wordmark</title>
  <!-- LƯU Ý: chữ đang là <text> (font Nunito 800). Khi chốt font trong Figma, hãy "Outline stroke/Create outlines" rồi trả lại. -->
  <text id="wordmark" x="0" y="92" font-family="{FONT}" font-weight="800" font-size="96" letter-spacing="2" fill="{C['cream']}">VY<tspan fill="{C['sun']}"> · </tspan>BIN</text>
</svg>''')
w('logo/lockup-horizontal.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 144" width="640" height="144">
  <title>VY·BIN — lockup ngang</title><defs>{GRAD}</defs>
  <g transform="translate(0 0) scale(.5625)"><rect width="256" height="256" rx="58" fill="url(#g)"/>{mark_inner()}</g>
  <text x="176" y="94" font-family="{FONT}" font-weight="800" font-size="72" letter-spacing="2" fill="{C['cream']}">VY<tspan fill="{C['sun']}"> · </tspan>BIN</text>
</svg>''')
w('logo/lockup-stacked.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" width="360" height="360">
  <title>VY·BIN — lockup dọc</title><defs>{GRAD}</defs>
  <g transform="translate(88 12)"><rect width="184" height="184" rx="42" fill="url(#g)"/><g transform="scale(.71875)">{mark_inner()}</g></g>
  <text x="180" y="262" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="64" letter-spacing="2" fill="{C['cream']}">VY<tspan fill="{C['sun']}"> · </tspan>BIN</text>
  <text x="180" y="300" text-anchor="middle" font-family="{FONT}" font-weight="600" font-size="22" fill="{C['cream2']}">Căn phòng nhỏ của hai người</text>
</svg>''')

# ---- app icon / favicon ----
w('app-icon/icon-1024.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1024" height="1024">
  <title>App icon 1024 (bo góc)</title><defs>{GRAD}</defs><rect width="256" height="256" rx="58" fill="url(#g)"/>{mark_inner()}
</svg>''')
w('app-icon/icon-maskable-512.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="512" height="512">
  <title>App icon maskable (vùng an toàn 80% giữa; nền tràn viền, hệ điều hành tự bo)</title><defs>{GRAD}</defs>
  <rect width="256" height="256" fill="url(#g)"/><g transform="translate(25.6 25.6) scale(.8)">{mark_inner()}</g>
</svg>''')
w('app-icon/apple-touch-180.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="180" height="180">
  <title>Apple touch icon (nền vuông, iOS tự bo)</title><defs>{GRAD}</defs><rect width="256" height="256" fill="url(#g)"/><g transform="translate(12.8 12.8) scale(.9)">{mark_inner()}</g>
</svg>''')
w('app-icon/favicon.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <title>Favicon (đơn giản hoá cho cỡ nhỏ)</title><defs>{GRAD.replace('id="g"','id="f"')}</defs>
  <rect width="32" height="32" rx="8" fill="url(#f)"/>
  <path d="M7 15 L16 8 L25 15" fill="none" stroke="{C['cream']}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="13" cy="20.5" r="4.6" fill="{C['brown']}"/><circle cx="19" cy="20.5" r="4.6" fill="{C['cream']}"/>
</svg>''')

# ---- avatar ----
for slot, name, a, b in (('bin', 'B', C['sun'], '#ffa94d'), ('vy', 'V', C['coral'], '#ff6f91')):
    w(f'avatars/avatar-{slot}.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <title>Avatar {slot.upper()} (placeholder — thay bằng ảnh/nhân vật)</title>
  <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs>
  <circle cx="64" cy="64" r="64" fill="url(#a)"/>
  <text x="64" y="84" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="64" fill="{C['brown']}">{name}</text>
</svg>''')

# ---- social + loading ----
def scene(W, H, tag, size):
    s = W / 1920
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <title>{tag}</title>
  <defs>{GRAD}<linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{C['bg']}"/><stop offset="1" stop-color="{C['bg2']}"/></linearGradient>
  <radialGradient id="glow" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="{C['sun']}" stop-opacity=".28"/><stop offset="1" stop-color="{C['sun']}" stop-opacity="0"/></radialGradient></defs>
  <rect id="bg" width="{W}" height="{H}" fill="url(#bgG)"/><rect id="glow" width="{W}" height="{H}" fill="url(#glow)"/>
  <g transform="translate({W/2-size/2} {H*0.20}) scale({size/256})"><rect width="256" height="256" rx="58" fill="url(#g)"/>{mark_inner()}</g>
  <text id="name" x="{W/2}" y="{H*0.20+size+size*0.42}" text-anchor="middle" font-family="{FONT}" font-weight="800" font-size="{size*0.42}" letter-spacing="3" fill="{C['cream']}">VY<tspan fill="{C['sun']}"> · </tspan>BIN</text>
  <text id="tagline" x="{W/2}" y="{H*0.20+size+size*0.42+size*0.22}" text-anchor="middle" font-family="{FONT}" font-weight="600" font-size="{size*0.15}" fill="{C['cream2']}">Căn phòng nhỏ của hai người</text>
</svg>'''
w('social/og-image-1200x630.svg', scene(1200, 630, 'Ảnh chia sẻ link (Open Graph) 1200×630', 190))
w('social/loading-screen-1920x1080.svg', scene(1920, 1080, 'Màn hình tải 1920×1080', 260))

# ---- UI icons (24×24, nét 2, currentColor) ----
I = {
 'task': '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
 'camera': '<path d="M3 8h4l1.5-2.5h7L17 8h4v11H3z"/><circle cx="12" cy="13" r="3.6"/>',
 'map': '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
 'settings': '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
 'walk': '<circle cx="13" cy="4.5" r="1.7"/><path d="M12 8l-2.5 4.5 3 2.5V21M10 12.5l-3.5 1M13 14l3.5 2.5M12 8l2.5 2.5 3 .5"/>',
 'run': '<circle cx="14" cy="4.5" r="1.7"/><path d="M12.5 8l-3 4.5 4 2.5-1.5 5.5M9.5 12.5L5 11.5M13.5 15l4 .5M12.5 8l3 1.5 3-1"/>',
 'sit': '<circle cx="8" cy="5" r="1.7"/><path d="M8 8.5V14h7.5v6M8 14v6M5 20h14"/>',
 'work': '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19"/>',
 'leave-seat': '<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>',
 'sleep': '<path d="M3 19V6M3 15h18v4M21 15v-2.5A3 3 0 0 0 18 9.5h-7V15"/><circle cx="7" cy="11.5" r="1.7"/>',
 'wake': '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
 'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
 'mic-off': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16"/>',
 'video': '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
 'video-off': '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3zM3 3l18 18"/>',
 'call': '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
 'call-end': '<path d="M3 14c5-4.5 13-4.5 18 0l-2 3-4-1.5v-2.6c-2-.7-4-.7-6 0v2.6L5 17z"/>',
 'volume': '<path d="M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
 'music': '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
 'play': '<path d="M8 5l11 7-11 7z"/>',
 'pause': '<path d="M8 5v14M16 5v14"/>',
 'next': '<path d="M5 5l10 7-10 7zM19 5v14"/>',
 'prev': '<path d="M19 5L9 12l10 7zM5 5v14"/>',
 'shuffle': '<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/>',
 'repeat': '<path d="M4 11V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3"/>',
 'list': '<path d="M4 6h16M4 12h16M4 18h16"/>',
 'youtube': '<rect x="3" y="5.5" width="18" height="13" rx="4"/><path d="M10 9.5v5l4.5-2.5z"/>',
 'chat': '<path d="M4 5h16v11h-9l-4 4v-4H4z"/>',
 'expand': '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
 'shrink': '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
 'resize': '<path d="M21 14l-7 7M21 8L8 21"/>',
 'minimize': '<path d="M5 12h14"/>',
 'close': '<path d="M6 6l12 12M18 6L6 18"/>',
 'plus': '<path d="M12 5v14M5 12h14"/>',
 'edit': '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
 'trash': '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
 'download': '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
 'upload': '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
 'search': '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
 'diagnostics': '<path d="M4 20V11M10 20V4M16 20v-7M22 20H2"/>',
 'heart': '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
 'stamina': '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
 'focus': '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l8-8"/>',
 'mood': '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 2 2.5 3 4 3s3-1 4-3M9 9.5v.5M15 9.5v.5"/>',
 'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
 'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
 'weather-clear': '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
 'weather-cloud': '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 11a3.5 3.5 0 0 1 0 7z"/>',
 'weather-rain': '<path d="M7 15a4 4 0 0 1-.5-8A6 6 0 0 1 18 8a3.5 3.5 0 0 1 0 7zM8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
 'weather-storm': '<path d="M7 14a4 4 0 0 1-.5-8A6 6 0 0 1 18 7a3.5 3.5 0 0 1 0 7zM12 14l-2 4h4l-2 4"/>',
 'weather-snow': '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
 'weather-fog': '<path d="M5 9h14M3 13h18M6 17h12"/>',
 'moon': '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
 'home': '<path d="M4 11l8-7 8 7M6 10v10h12V10"/>',
 'stairs': '<path d="M4 20h4v-4h4v-4h4V8h4"/>',
 'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
 'wifi': '<path d="M3 9a14 14 0 0 1 18 0M6 12.5a9.5 9.5 0 0 1 12 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/>',
 'refresh': '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 5v4h4M4 13a8 8 0 0 0 14 4l2-2M20 19v-4h-4"/>',
 'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7"/>',
 'users': '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M2.5 20c0-4 3-6 6.5-6s6.5 2 6.5 6M16 14.5c3 0 5.5 1.5 5.5 5"/>',
}
SW = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
for k, d in I.items():
    w(f'ui-icons/{k}.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" {SW}><title>{k}</title>{d}</svg>')
# bảng tổng hợp
cols = 10; cell = 96; rows = (len(I) + cols - 1) // cols
body = ''
for n, (k, d) in enumerate(I.items()):
    x = (n % cols) * cell + 24; y = (n // cols) * (cell + 18) + 20
    body += f'<g transform="translate({x} {y}) scale(2)" color="{C["cream"]}" {SW}>{d}</g><text x="{x+24}" y="{y+68}" text-anchor="middle" font-family="{FONT}" font-size="10" fill="{C["cream2"]}">{k}</text>'
w('ui-icons/_sheet.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {cols*cell+24} {rows*(cell+18)+30}" width="{cols*cell+24}" height="{rows*(cell+18)+30}"><rect width="100%" height="100%" fill="{C["glass"]}"/>{body}</svg>')

# ---- bảng màu ----
sw = ''
for n, (k, v) in enumerate(C.items()):
    sw += f'<g transform="translate({(n%6)*150+20} {(n//6)*150+20})"><rect id="{k}" width="130" height="90" rx="14" fill="{v}" stroke="#fff3"/><text x="0" y="112" font-family="{FONT}" font-weight="700" font-size="14" fill="{C["cream"]}">{k}</text><text x="0" y="130" font-family="{FONT}" font-size="12" fill="{C["cream2"]}">{v}</text></g>'
w('colors/palette.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 330" width="920" height="330"><rect width="100%" height="100%" fill="{C["bg"]}"/>{sw}</svg>')

# ---- tokens + manifest ----
tokens = {
 'name': {'short': 'VY · BIN', 'full': 'VY · BIN — Studio', 'tagline': 'Căn phòng nhỏ của hai người (placeholder)', 'characters': {'bin': 'Bin', 'vy': 'Vy'}},
 'urls': {'production': 'https://vybin-multiplayer.vercel.app', 'github': 'https://github.com/24540300825-lab/vybin-multiplayer', 'note': 'Có thể đổi sang tên miền riêng sau (xem hướng dẫn trong chat).'},
 'colors': C,
 'type': {'family': 'Nunito', 'fallback': 'system-ui, sans-serif', 'weights': {'title': 800, 'ui': 600, 'body': 500}, 'note': 'Hiện game dùng Nunito cho tiêu đề; phần UI còn lại dùng font hệ thống.'},
 'radius': {'glass': 16, 'button': 12, 'avatar': 'full'},
 'icon': {'grid': 24, 'stroke': 2, 'cap': 'round', 'join': 'round'},
}
w('tokens.json', json.dumps(tokens, ensure_ascii=False, indent=2))

w('README.md', '''
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
''')

w('text-manifest.md', '''
# Danh sách tên / chữ / link (để bạn quyết định thương hiệu)

## Tên
- Tên game hiện tại: **VY · BIN** (tiêu đề tab, màn hình tải)
- Tên nhân vật: **Bin**, **Vy**
- Slogan (phôi đề xuất, chưa dùng trong game): *Căn phòng nhỏ của hai người*

## Link
- Bản chính: https://vybin-multiplayer.vercel.app
- Mã nguồn: https://github.com/24540300825-lab/vybin-multiplayer
- Link mời vào phòng: `…/?room=ten-phong` (ví dụ `?room=hai-dua-minh`)
- Tên miền riêng: chưa có (mua tên miền thường có phí hằng năm; dùng link Vercel miễn phí vẫn đầy đủ tính năng)

## Chữ trong giao diện (nút chính)
Việc · Chụp · Bản đồ · Cài đặt · Đi · Chạy · Ngồi · Làm việc · Rời ghế · Ngủ · Dậy · Voice · Video · Chat · Mic · Camera · Kết thúc ·
Sức khỏe · Thể lực · Tập trung · Tâm trạng · Nhạc YouTube · Playlist · Lofi

## Tên map
- Studio (cũ) — "Gác lửng 1 cầu thang, vườn cây"
- Nhà 2 tầng (mới) — "2 cầu thang, giường & bàn làm việc"

## Tên bản nhạc lofi trong game
Chill Beats · Rainy Window · Late Night Study · Golden Hour · Quiet Café · Sleepy Dawn

## Thẻ trang (SEO / chia sẻ link)
- `<title>`: VY · BIN
- Mô tả (đề xuất): "Căn phòng nhỏ để hai người ở cạnh nhau — đi lại, trò chuyện, gọi video, nghe nhạc cùng nhau."
- Ảnh chia sẻ: `social/og-image-1200x630.svg` (khi chốt, xuất thêm PNG 1200×630 vì nhiều app chưa hiển thị SVG)
''')
print('ok', len(I), 'icons')
