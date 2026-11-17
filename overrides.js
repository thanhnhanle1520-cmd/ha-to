/* Nạp SAU các Js_*: chỉnh vài chỗ cho phù hợp khi chạy như một trang web độc lập */
function dl(name, mime, b64) {                      // tải file xuống máy (trang độc lập tải được trực tiếp)
  var bin = atob(b64), arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  var a = h('a', { href: URL.createObjectURL(new Blob([arr], { type: mime })), download: name }); document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500);
}
function exportDone(r) { toast('Đã tải ' + r.name); }
function doExport(kind, id, format) {
  if (format === 'pdf') return previewExport(kind, id);
  return safe(call('export', { kind: kind, id: id, format: format })).then(function (r) { if (r) { dl(r.name, r.mime, r.base64); exportDone(r); } });
}
function previewExport(kind, id) {                   // PDF = xem trước rồi In → Lưu thành PDF (tức thì, không qua máy chủ)
  return safe(call('export', { kind: kind, id: id, format: 'html' })).then(function (r) {
    if (!r) return;
    var fr = h('iframe', { style: 'width:100%;height:72vh;border:1px solid #d1d5db;background:#fff' }); fr.srcdoc = r.html;
    modal({ title: r.title, wide: true, body: fr, buttons: [{ label: 'In / Lưu PDF', cls: 'pri', fn: function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Trình duyệt chặn in.', true); } } }], closeLabel: 'Đóng' });
  });
}

function loadXlsxLib() { return Promise.resolve(); }                // không cần thư viện ngoài
var __readTableFile = readTableFile;
function readTableFile(file) {                                       // Nhập file Excel: .xlsx đọc bằng bộ đọc nội bộ
  var ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'xls') return Promise.reject(new Error('File .xls cũ chưa hỗ trợ: hãy lưu lại thành .xlsx hoặc .csv.'));
  if (ext !== 'xlsx' && ext !== 'xlsm') return __readTableFile(file);
  if (file.size > IMPORT_MAX_BYTES) return Promise.reject(new Error('File quá lớn (tối đa 5MB).'));
  return file.arrayBuffer().then(XlsxLite.read).then(function (book) { var n = Object.keys(book)[0]; return (book[n] || []).map(function (r) { return r.map(function (c) { return c === null || c === undefined ? '' : String(c); }); }); });
}
