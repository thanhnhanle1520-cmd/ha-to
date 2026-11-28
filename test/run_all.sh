#!/usr/bin/env bash
# Chạy toàn bộ kiểm thử. Dùng trên máy hoặc GitHub Actions.
#   bash test/run_all.sh          (tự build, tự mở máy chủ thử ở cổng 8765)
# Bài cần dữ liệu thật (/tmp/old.xlsx) tự bỏ qua nếu không có — dữ liệu khách KHÔNG đưa lên GitHub.
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
for t in check_actions smoke merge_unit sync2 sync3 sync4 ui10b ui12 ui15 ui16 ui17 ui18 ui19 ui20 ui21 ui22 ui23 ui24 ui25 ui26 ui27 ui28 ui29 ui30 ui31 ui32 ui33 ui34 ui35 ui36 ui38 ui39 ui40 ui42 ui1; do run $t; done
if [ -f /tmp/old.xlsx ]; then for t in ui4 ui10; do run $t; done; else SUM="$SUM\n  – bỏ qua ui4, ui10 (cần /tmp/old.xlsx)"; fi
pkill -f "http.server 8765" 2>/dev/null; pkill -f "remote-debugging-port=9333" 2>/dev/null
echo -e "KẾT QUẢ:$SUM"; exit $FAIL
