/* Kiểm tra tĩnh lệnh ghi: mọi ACTIONS có ghi dữ liệu phải nằm trong WRITES (client), có need_/quyền và chạy trong withLock_. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..', 'src');
var gs = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8'), core = fs.readFileSync(path.join(root, 'Js_core.html'), 'utf8');
var W = {}, m = core.match(/var WRITES = \{([^}]*)\}/); if (!m) { console.log('FAIL không thấy WRITES'); process.exit(1); }
m[1].split(',').forEach(function (x) { var k = x.split(':')[0].trim(); if (k) W[k] = 1; });
var R = {}, mr = core.match(/READS = \{([^}]*)\}/); if (mr) mr[1].split(',').forEach(function (x) { var k = x.split(':')[0].trim(); if (k) R[k] = 1; });
// tách thân từng ACTIONS.x = function
var re = /^ACTIONS\.(\w+) = function[^{]*\{/mg, acts = [], a;
while ((a = re.exec(gs))) acts.push({ name: a[1], start: a.index });
function block(start) {               // lấy thân hàm theo cặp ngoặc { } (bỏ qua chuỗi và chú thích)
  var i = gs.indexOf('{', start), d = 0, q = null;
  for (; i < gs.length; i++) {
    var c = gs[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '/' && gs[i + 1] === '/') { i = gs.indexOf('\n', i); continue; }
    if (c === '/' && gs[i + 1] === '*') { i = gs.indexOf('*/', i) + 1; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (!d) return gs.slice(start, i + 1); }
  }
  return gs.slice(start);
}
acts.forEach(function (x) { x.body = block(x.start); });
// hàm phụ có ghi (gọi gián tiếp): tên function ..._( có upsert_/replaceChildren_/removeByKey_
var fre = /^function (\w+)\([^)]*\)\s*\{/mg, funcs = [], f;
while ((f = fre.exec(gs))) funcs.push({ name: f[1], start: f.index });
funcs.forEach(function (x) { x.body = block(x.start); });
var WR = /\b(upsert_|replaceChildren_|removeByKey_|appendRow|deleteRow|setValues|clearContents)\s*\(/;
var writerFns = {}; funcs.forEach(function (x) { if (WR.test(x.body) && !/^(upsert_|replaceChildren_|removeByKey_|audit_|logErr_|bump_|ensure\w*|setup\w*|migrate\w*|logError_|currentUser_|images_|nextCode_|appendMany_|rowCount_)$/.test(x.name)) writerFns[x.name] = 1; });
var ALLOW_NO_LOCK = { bootstrap: 1, stockNocodeSet: 1 /* chỉ gọi lại importSetCodes / purchaseSetCodes / delSetCodes_, mỗi lệnh tự khóa */ }, fails = [], n = 0;
acts.forEach(function (x) {
  var b = x.body, writes = WR.test(b) || Object.keys(writerFns).some(function (fn) { return new RegExp('\\b' + fn + '\\(').test(b); });
  if (!writes) return; n++;
  if (!W[x.name] && !ALLOW_NO_LOCK[x.name]) fails.push(x.name + ': có ghi dữ liệu nhưng không có trong WRITES (client không đồng bộ sau khi ghi)');
  if (R[x.name]) fails.push(x.name + ': có ghi dữ liệu nhưng nằm trong READS');
  if (!/need_\(|can_\(|isAdmin_\(|u\.role\s*!==?\s*'ADMIN'/.test(b) && !ALLOW_NO_LOCK[x.name]) fails.push(x.name + ': thiếu kiểm tra quyền (need_)');
  if (!/withLock_\(/.test(b) && !ALLOW_NO_LOCK[x.name]) fails.push(x.name + ': không chạy trong withLock_');
});
Object.keys(W).forEach(function (k) { if (!acts.some(function (x) { return x.name === k; })) fails.push('WRITES có "' + k + '" nhưng Code.gs không có ACTIONS.' + k); });
if (fails.length) { fails.forEach(function (x) { console.log('FAIL ' + x); }); console.log('check_actions: ' + n + ' lệnh ghi · 0 đạt, ' + fails.length + ' lỗi'); process.exit(1); }
console.log('PASS mọi lệnh ghi có quyền + withLock_ + nằm trong WRITES\ncheck_actions: ' + n + ' đạt, 0 lỗi');
