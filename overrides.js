/* Nạp SAU các Js_*: chỉnh vài chỗ cho phù hợp khi chạy như một trang web độc lập */
function dl(name, mime, b64) {                      // tải file xuống máy (trang độc lập tải được trực tiếp)
  var bin = atob(b64), arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  var a = h('a', { href: URL.createObjectURL(new Blob([arr], { type: mime })), download: name }); document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500);
}
function exportDone(r) { toast('Đã tải ' + r.name); }
function doExport(kind, id, format) {
  if (format === 'pdf') return previewExport(kind, id);
  return safe(call('export', { kind: kind, id: id, format: format }).then(DocxWrite.convert)).then(function (r) { if (r) { dl(r.name, r.mime, r.base64); exportDone(r); } });     // Word: 1 file .docx
}
function previewExport(kind, id) {                   // PDF = xem trước rồi In → Lưu thành PDF (tức thì, không qua máy chủ)
  return safe(call('export', { kind: kind, id: id, format: 'html' })).then(function (r) {
    if (!r) return;
    var fr = h('iframe', { style: 'width:100%;height:72vh;border:1px solid #d1d5db;background:#fff' }); fr.srcdoc = r.html;
    modal({ title: r.title, wide: true, body: fr, buttons: [{ label: 'In / Lưu PDF', cls: 'pri', fn: function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Trình duyệt chặn in.', true); } } }], closeLabel: 'Đóng' });
  });
}

function loadXlsxLib() { return Promise.resolve(); }                // không cần thư viện ngoài
// readTableFile: đọc .xlsx bằng bộ đọc nội bộ đã chuyển vào Js_import (bản cũ ở đây gọi đệ quy chính nó khi nhập file .csv).

var __doExport0 = doExport;
doExport = function (kind, id, format) {     // báo giá: kiểm tra trước khi xuất
  if (kind === 'quote' && window.__quoteCheck) return window.__quoteCheck().then(function (ok) { if (ok) return __doExport0(kind, id, format); });
  return __doExport0(kind, id, format);
};
