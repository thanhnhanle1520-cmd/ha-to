#!/usr/bin/env python3
"""Ghép src/ thành thư mục dist/ (trang tĩnh). Chạy: python3 build.py"""
import re, shutil, os, json
R = os.path.dirname(os.path.abspath(__file__)); S = R + '/src'; D = R + '/dist'
shutil.rmtree(D, ignore_errors=True); os.makedirs(D)
rd = lambda p: open(p, encoding='utf-8').read()
idx = rd(S + '/Index.html')
def inc(m):
    name = m.group(1)
    return rd(S + '/' + name + '.html')
idx = re.sub(r"<\?!= include\('([A-Za-z_]+)'\); \?>", inc, idx)
head_extra = ('<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#0f1b3d">'
              '<link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png">'
              '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
              '<script src="config.js"></script>')
idx = idx.replace('</head>', head_extra + '</head>', 1)
# thứ tự nạp: shim → store (đặt google.script, các dịch vụ giả) → code → overrides-gas → giao diện → overrides
loader = '<script src="shim.js"></script><script src="store.js"></script><script src="code.js"></script><script src="overrides-gas.js"></script>'
idx = idx.replace('<div id="loading"></div>', loader + '<div id="loading"></div>', 1) if False else idx
# chèn loader NGAY TRƯỚC khối Js_core (đoạn <script> đầu tiên của thân trang)
pos = idx.index('<script>', idx.index('<div id="toasts">'))
idx = idx[:pos] + loader + idx[pos:]
idx = idx.replace('</body>', '<script src="xlsx-lite.js"></script><script src="xlsx-write.js"></script><script src="xlsx-patch.js"></script><script src="rfq-core.js"></script><script src="migrate.js"></script><script src="overrides.js"></script></body>', 1)
open(D + '/index.html', 'w', encoding='utf-8').write(idx)
shutil.copy(S + '/Code.gs', D + '/code.js')
for f in ['shim.js', 'store.js', 'overrides-gas.js', 'overrides.js', 'xlsx-lite.js', 'xlsx-write.js', 'xlsx-patch.js', 'rfq-core.js', 'migrate.js', 'manifest.webmanifest']:
    shutil.copy(R + '/' + f, D + '/' + f)
# sw.js lấy từ mẫu có chỗ __BUILD__ (sw.js ở thư mục gốc là bản đã đóng gói, có số phiên bản)
shutil.copy(S + '/sw.template.js' if os.path.exists(S + '/sw.template.js') else R + '/sw.js', D + '/sw.js')
for f in os.listdir(R + '/icons'): shutil.copy(R + '/icons/' + f, D + '/' + f)
if os.path.exists(R + '/config.js'): shutil.copy(R + '/config.js', D + '/config.js')
else: open(D + '/config.js', 'w').write('window.HATO_CLIENT_ID = "";\n')
# số phiên bản cho service worker để máy tự cập nhật khi có bản mới
import hashlib
h = hashlib.md5(b''.join(open(D + '/' + f, 'rb').read() for f in sorted(os.listdir(D)) if os.path.isfile(D + '/' + f))).hexdigest()[:8]
sw = rd(D + '/sw.js').replace('__BUILD__', h); open(D + '/sw.js', 'w', encoding='utf-8').write(sw)
print('OK dist/ build', h)
