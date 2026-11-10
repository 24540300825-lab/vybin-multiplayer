#!/bin/bash
# PHÒNG VY — tự cài AI (Ollama) cho Workroom trên Mac.
# Dùng: curl -fsSL https://vybin-multiplayer.vercel.app/vy-ai.sh | bash
# Không cần mật khẩu, không sudo. Chỉ đụng tới: Ollama, ~/Library/LaunchAgents/vy.ollama.*.plist
# Ollama vẫn chỉ nghe trên chính máy này (127.0.0.1) và chỉ nhận lệnh từ trang game.
set -u
SITE="https://vybin-multiplayer.vercel.app"
ORIGINS="$SITE,https://vybin-multiplayer-git-workroom-m1-24540300825-lab.vercel.app"
LA="$HOME/Library/LaunchAgents"
ENV_PL="$LA/vy.ollama.origins.plist"
SRV_PL="$LA/vy.ollama.serve.plist"
UIDN=$(id -u)

P() { printf '\n\033[1;35m▸ %s\033[0m\n' "$1"; }
OK() { printf '  \033[32m✓ %s\033[0m\n' "$1"; }
BAD() { printf '  \033[31m✗ %s\033[0m\n' "$1"; }
ASK() { local a; printf '\033[1m%s [Y/n] \033[0m' "$1"; read -r a </dev/tty || a=n; case "$a" in ""|y|Y|c|C|co|có) return 0;; *) return 1;; esac; }
probe() { curl -s -o /dev/null -w '%{http_code}' -m 3 -H "Origin: $SITE" http://127.0.0.1:11434/api/version 2>/dev/null; }
wait_up() { local i; for i in $(seq 1 30); do c=$(probe); [ "$c" = "200" ] || [ "$c" = "403" ] && { echo "$c"; return; }; sleep 1; done; echo "000"; }
listener() { lsof -nP -iTCP:11434 -sTCP:LISTEN -t 2>/dev/null | head -1; }
stop_all() {
  osascript -e 'quit app "Ollama"' >/dev/null 2>&1
  launchctl bootout "gui/$UIDN" "$SRV_PL" >/dev/null 2>&1
  # dịch vụ Ollama cài qua Homebrew hoặc job launchd khác tự bật lại Ollama KHÔNG có quyền → tạm dừng chúng
  command -v brew >/dev/null 2>&1 && brew services stop ollama >/dev/null 2>&1
  for j in $(launchctl list 2>/dev/null | awk 'tolower($3) ~ /ollama/ && $3 !~ /^vy\.ollama/ {print $3}'); do launchctl bootout "gui/$UIDN/$j" >/dev/null 2>&1 && echo "  (đã dừng dịch vụ $j)"; done
  sleep 2; pkill -x Ollama >/dev/null 2>&1; pkill -f 'ollama serve' >/dev/null 2>&1; pkill -x ollama >/dev/null 2>&1
  local i; for i in 1 2 3 4 5 6 7 8 9 10; do [ -z "$(listener)" ] && return; sleep 1; done
  kill -9 $(listener) >/dev/null 2>&1; sleep 1
}
diag() {
  echo "  ── Thông tin để gửi Bin ──"
  echo "  macOS $(sw_vers -productVersion) · $(uname -m) · Ollama: $("$BIN" -v 2>/dev/null | tail -1)"
  local pid; pid=$(listener); echo "  Cổng 11434: ${pid:-không có gì} $( [ -n "$pid" ] && ps -o comm= -p "$pid")"
  [ -n "$pid" ] && { ps eww -p "$pid" 2>/dev/null | grep -o 'OLLAMA_ORIGINS=[^ ]*' || echo "  tiến trình KHÔNG có OLLAMA_ORIGINS"; }
  echo "  launchctl: $(launchctl getenv OLLAMA_ORIGINS)"
  launchctl list 2>/dev/null | grep -i ollama | sed 's/^/  job: /'
  tail -5 /tmp/vy-ollama.log 2>/dev/null | sed 's/^/  log: /'
}

clear 2>/dev/null
printf '\033[1;35m━━━ PHÒNG VY · Cài AI cho Workroom ━━━\033[0m\n'
echo "Máy sẽ tự: khởi động lại Ollama, cho phép trang game dùng Ollama (giữ cả sau khi tắt máy),"
echo "kiểm tra kết nối, và tải model AI hợp với máy. Không cần mật khẩu."
ASK "Bắt đầu?" || { echo "Đã huỷ. Không thay đổi gì."; exit 0; }

# 1) Ollama
P "1/4 · Kiểm tra Ollama"
APP=""; for d in /Applications/Ollama.app "$HOME/Applications/Ollama.app"; do [ -d "$d" ] && APP="$d"; done
BIN=""; for b in "$APP/Contents/Resources/ollama" /usr/local/bin/ollama /opt/homebrew/bin/ollama; do [ -x "$b" ] && { BIN="$b"; break; }; done
if [ -z "$APP" ] && [ -z "$BIN" ]; then
  BAD "Máy chưa cài Ollama."
  if ASK "Tải và cài Ollama ngay?"; then
    T=$(mktemp -d); echo "  Đang tải Ollama (khoảng vài trăm MB)…"
    if curl -fL --progress-bar -o "$T/o.zip" https://ollama.com/download/Ollama-darwin.zip && ditto -x -k "$T/o.zip" "$T" && [ -d "$T/Ollama.app" ]; then
      ditto "$T/Ollama.app" /Applications/Ollama.app 2>/dev/null || { mkdir -p "$HOME/Applications"; ditto "$T/Ollama.app" "$HOME/Applications/Ollama.app"; }
      for d in /Applications/Ollama.app "$HOME/Applications/Ollama.app"; do [ -d "$d" ] && APP="$d"; done
      BIN="$APP/Contents/Resources/ollama"; OK "Đã cài Ollama"
    else
      BAD "Không tải được. Mở trang tải để cài tay, cài xong chạy lại lệnh này."; open https://ollama.com/download; exit 1
    fi
  else exit 1; fi
fi
OK "Ollama: ${APP:-$BIN}"

# 2) Cho phép trang game + giữ sau khi khởi động lại
P "2/4 · Cho phép trang game dùng Ollama"
stop_all
mkdir -p "$LA"
launchctl setenv OLLAMA_ORIGINS "$ORIGINS"
cat > "$ENV_PL" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>vy.ollama.origins</string>
<key>ProgramArguments</key><array><string>/bin/launchctl</string><string>setenv</string><string>OLLAMA_ORIGINS</string><string>$ORIGINS</string></array>
<key>RunAtLoad</key><true/>
</dict></plist>
EOF
launchctl bootout "gui/$UIDN" "$ENV_PL" >/dev/null 2>&1; launchctl bootstrap "gui/$UIDN" "$ENV_PL" >/dev/null 2>&1
OK "Đã đặt quyền (giữ cả sau khi khởi động lại máy)"

# 3) Chạy Ollama nền có quyền gắn sẵn (không phụ thuộc ứng dụng Ollama có đọc cài đặt hay không)
P "3/4 · Khởi động Ollama có quyền và kiểm tra"
[ -z "$BIN" ] && BIN="$APP/Contents/Resources/ollama"
stop_all
cat > "$SRV_PL" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>vy.ollama.serve</string>
<key>ProgramArguments</key><array><string>$BIN</string><string>serve</string></array>
<key>EnvironmentVariables</key><dict><key>OLLAMA_ORIGINS</key><string>$ORIGINS</string><key>OLLAMA_HOST</key><string>127.0.0.1:11434</string><key>HOME</key><string>$HOME</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>/tmp/vy-ollama.log</string><key>StandardErrorPath</key><string>/tmp/vy-ollama.log</string>
</dict></plist>
EOF
: > /tmp/vy-ollama.log
launchctl bootstrap "gui/$UIDN" "$SRV_PL" >/dev/null 2>&1 || launchctl load -w "$SRV_PL" >/dev/null 2>&1
C=$(wait_up)
if [ "$C" != "200" ]; then
  # cách cuối: chạy trực tiếp từ Terminal này với quyền gắn sẵn
  launchctl bootout "gui/$UIDN" "$SRV_PL" >/dev/null 2>&1; stop_all
  OLLAMA_ORIGINS="$ORIGINS" OLLAMA_HOST=127.0.0.1:11434 nohup "$BIN" serve >>/tmp/vy-ollama.log 2>&1 &
  C=$(wait_up); [ "$C" = "200" ] && echo "  (Ollama đang chạy từ Terminal này — đừng đóng cửa sổ Terminal khi dùng AI)"
fi
if [ "$C" = "200" ]; then OK "Kết nối OK — trang game đã dùng được Ollama (không cần mở ứng dụng Ollama nữa)"
else BAD "Vẫn chưa kết nối được (mã $C). Chụp màn hình phần dưới gửi Bin."; diag; exit 1; fi

# 4) Model AI theo RAM của máy
P "4/4 · Model AI"
RAM=$(( $(sysctl -n hw.memsize) / 1073741824 ))
if   [ "$RAM" -ge 32 ]; then M="qwen3.8:27b"; S="≈18 GB"
elif [ "$RAM" -ge 16 ]; then M="gemma4:12b";  S="≈7,7 GB"
else                         M="gemma4:e4b";  S="≈6,6 GB"; fi
echo "  Máy có ${RAM} GB RAM → model hợp nhất: $M ($S)"
HAVE=$(curl -s -m 5 http://127.0.0.1:11434/api/tags | grep -c "\"$M\"")
if [ "$HAVE" -gt 0 ]; then OK "Đã có sẵn $M"
elif ASK "Tải $M ($S) bây giờ? (cần mạng ổn định, có thể mất 5–20 phút)"; then
  if "$BIN" pull "$M"; then OK "Đã tải xong $M"; else BAD "Tải $M lỗi — vào Workroom → Cài đặt & Kết nối để chọn model khác."; fi
fi

printf '\n\033[1;32m━━━ XONG ━━━\033[0m\n'
echo "Vào game → Workroom → Cài đặt & Kết nối → bấm \"Kiểm tra kết nối\"."
echo "Trình duyệt hỏi quyền truy cập thiết bị trên máy → bấm Cho phép."
ASK "Mở game ngay?" && open "$SITE"
