#!/usr/bin/env bash
# Chạy toàn bộ kiểm thử. Dùng trên máy hoặc GitHub Actions.
#   bash test/run_all.sh          (tự build, tự mở máy chủ thử ở cổng 8765)
# Bài cần dữ liệu thật (/tmp/old.xlsx, /tmp/rfqfiles) tự bỏ qua nếu không có — dữ liệu khách KHÔNG đưa lên GitHub.
set -u
cd "$(dirname "$0")/.."
python3 build.py || exit 1
pkill -f "http.server 8765" 2>/dev/null; (cd dist && python3 -m http.server 8765 >/dev/null 2>&1 &) ; sleep 1
FAIL=0; SUM=""
run() {
  local t=$1; pkill -f "remote-debugging-port=9333" 2>/dev/null
  local out; out=$(cd test && timeout 400 node "$t.js" 2>&1)
  local line; line=$(echo "$out" | grep -E "[0-9]+ đạt, [0-9]+ lỗi" | tail -1)
  if echo "$line" | grep -q " 0 lỗi" && ! echo "$out" | grep -q "CRASH" && ! echo "$out" | grep -qE "Lỗi console: \[.+\]"; then SUM="$SUM\n  ✓ $t: $line"; else FAIL=1; SUM="$SUM\n  ✗ $t: ${line:-không chạy xong}"; echo "$out" | grep -E "FAIL|CRASH|Lỗi console" | head -20; fi
}
for t in smoke merge_unit rfq_unit sync2 ui10b rfq_ci ui1; do run $t; done
if [ -f /tmp/old.xlsx ]; then for t in ui4 ui10; do run $t; done; else SUM="$SUM\n  – bỏ qua ui4, ui10 (cần /tmp/old.xlsx)"; fi
if [ -d /tmp/rfqfiles ]; then run rfq1; else SUM="$SUM\n  – bỏ qua rfq1 (cần file khách thật trong /tmp/rfqfiles)"; fi
pkill -f "http.server 8765" 2>/dev/null; pkill -f "remote-debugging-port=9333" 2>/dev/null
echo -e "KẾT QUẢ:$SUM"; exit $FAIL
