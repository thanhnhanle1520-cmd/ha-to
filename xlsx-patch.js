/* xlsx-patch.js — điền giá trị vào CHÍNH file .xlsx của khách mà giữ nguyên định dạng, logo, ô gộp, công thức.
 * Cách làm: chỉ sửa nội dung từng ô trong XML của trang tính; mọi phần khác của file giữ nguyên từng byte.
 * XlsxPatch.apply(files, sheetPath, edits) -> Promise<Blob>
 *   files: { 'xl/...': Uint8Array } (từ XlsxLite.readFull)    sheetPath: 'xl/worksheets/sheet1.xml'
 *   edits: [{ r: số dòng (1 = dòng đầu), c: cột (0 = A), v: số | chữ | null (xóa giá trị), keepFormula: true (ô đang có công thức thì giữ công thức), style: chỉ số kiểu (tùy chọn) }]
 * Excel tự tính lại công thức khi mở (đặt fullCalcOnLoad). */
(function (root) {
  'use strict';
  function colName(c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref)[1], n = 0; for (var i = 0; i < m.length; i++) n = n * 26 + (m.charCodeAt(i) - 64); return n - 1; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function attr(tag, name) { var m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; }

  /* Tách trang tính thành: phần đầu · các dòng trong <sheetData> · phần cuối */
  function splitSheet(x) {
    var a = x.indexOf('<sheetData'), b = x.indexOf('</sheetData>');
    if (a < 0) throw new Error('Trang tính không có dữ liệu.');
    var openEnd = x.indexOf('>', a) + 1, selfClose = x.charAt(openEnd - 2) === '/';
    if (selfClose) return { head: x.slice(0, a) + '<sheetData>', body: '', tail: '</sheetData>' + x.slice(openEnd) };
    return { head: x.slice(0, openEnd), body: x.slice(openEnd, b), tail: x.slice(b) };
  }
  function parseRows(body) {            // -> [{ r, open, cells:[{c, xml}], close }]
    var out = [], re = /<row\b[^>]*?(\/>|>([\s\S]*?)<\/row>)/g, m;
    while ((m = re.exec(body))) {
      var full = m[0], openTag = /^<row\b[^>]*?\/?>/.exec(full)[0], r = +attr(openTag, 'r'), cells = [];
      if (m[2] != null) { var cre = /<c\b[^>]*?(\/>|>[\s\S]*?<\/c>)/g, cm; while ((cm = cre.exec(m[2]))) cells.push({ c: colIdx(attr(cm[0].match(/^<c\b[^>]*>/)[0], 'r')), xml: cm[0] }); }
      out.push({ r: r, open: openTag.replace(/\/>$/, '>'), cells: cells });
    }
    return out;
  }
  function cellXml(ref, old, e) {
    var s = e.style != null ? e.style : (old ? attr(old.match(/^<c\b[^>]*>/)[0], 's') : null), sa = s != null ? ' s="' + s + '"' : '';
    if (old && e.keepFormula && /<f[\s>\/]/.test(old)) return old.replace(/<v>[\s\S]*?<\/v>/, '').replace(/\st="(n|str|e|b)"/, '');   // giữ công thức, bỏ kết quả cũ để Excel tính lại
    if (e.v == null || e.v === '') return '<c r="' + ref + '"' + sa + '/>';
    if (typeof e.v === 'number' && isFinite(e.v)) return '<c r="' + ref + '"' + sa + '><v>' + e.v + '</v></c>';
    return '<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + esc(e.v) + '</t></is></c>';
  }
  function patchSheet(x, edits) {
    var parts = splitSheet(x), rows = parseRows(parts.body), byR = {};
    rows.forEach(function (row) { byR[row.r] = row; });
    function styleAt(r, c) { var row = byR[r]; if (!row) return null; for (var i = 0; i < row.cells.length; i++) if (row.cells[i].c === c) return attr(row.cells[i].xml.match(/^<c\b[^>]*>/)[0], 's'); return null; }
    edits.forEach(function (e) { if (e.style == null && e.styleFrom) { var st = styleAt(e.styleFrom.r, e.styleFrom.c); if (st != null) e.style = st; } });   // cột thêm mới: lấy kiểu của ô bên trái
    edits.forEach(function (e) {
      var row = byR[e.r];
      if (!row) { row = byR[e.r] = { r: e.r, open: '<row r="' + e.r + '">', cells: [] }; rows.push(row); }
      var ref = colName(e.c) + e.r, i = 0, found = -1;
      for (; i < row.cells.length; i++) { if (row.cells[i].c === e.c) { found = i; break; } if (row.cells[i].c > e.c) break; }
      var nx = cellXml(ref, found >= 0 ? row.cells[found].xml : null, e);
      if (found >= 0) row.cells[found].xml = nx; else row.cells.splice(i, 0, { c: e.c, xml: nx });
      row.open = row.open.replace(/\sspans="[^"]*"/, '');          // spans cũ có thể không còn đúng
    });
    rows.sort(function (a, b) { return a.r - b.r; });
    var body = rows.map(function (row) { return row.open + row.cells.map(function (c) { return c.xml; }).join('') + '</row>'; }).join('');
    var head = parts.head.replace(/<dimension\b[^>]*\/>/, '');       // để Excel tự tính lại vùng dữ liệu
    return head + body + parts.tail;
  }
  function setFullCalc(wbx) {
    if (/<calcPr\b/.test(wbx)) return wbx.replace(/<calcPr\b([^>]*?)\/?>/, function (m, a) { return '<calcPr' + a.replace(/\sfullCalcOnLoad="[^"]*"/, '') + ' fullCalcOnLoad="1"/>'; }).replace(/<calcPr([^>]*)\/>\s*<\/calcPr>/, '<calcPr$1/>');
    return wbx.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  }

  /* ---- ghi zip (nén deflate nếu trình duyệt hỗ trợ, nếu không thì lưu thẳng) ---- */
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function u16(n) { return [n & 255, (n >> 8) & 255]; }
  function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]; }
  function deflate(u8) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
    var cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter(); w.write(u8); w.close();
    return new Response(cs.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); }, function () { return null; });
  }
  function zip(entries) {                // entries: [{ name, data: Uint8Array }]
    return Promise.all(entries.map(function (e) { return (e.data.length > 64 ? deflate(e.data) : Promise.resolve(null)).then(function (z) { return { name: e.name, data: e.data, z: z && z.length < e.data.length ? z : null }; }); })).then(function (list) {
      var out = [], central = [], offset = 0, enc = new TextEncoder();
      list.forEach(function (f) {
        var name = enc.encode(f.name), crc = crc32(f.data), method = f.z ? 8 : 0, body = f.z || f.data;
        var head = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(method), u16(0), u16(0x21), u32(crc), u32(body.length), u32(f.data.length), u16(name.length), u16(0));
        out.push(new Uint8Array(head), name, body);
        central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(method), u16(0), u16(0x21), u32(crc), u32(body.length), u32(f.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
        offset += head.length + name.length + body.length;
      });
      var csize = 0; central.forEach(function (c) { csize += c.length; });
      var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(list.length), u16(list.length), u32(csize), u32(offset), u16(0)));
      return new Blob(out.concat(central, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    });
  }
  function apply(files, sheetPath, edits) {
    var dec = new TextDecoder(), enc = new TextEncoder(), names = Object.keys(files);
    if (!files[sheetPath]) return Promise.reject(new Error('Không tìm thấy trang tính trong file gốc.'));
    var entries = names.filter(function (n) { return n !== 'xl/calcChain.xml'; }).map(function (n) {      // bỏ chuỗi tính toán cũ, Excel tự lập lại
      var d = files[n];
      if (n === sheetPath) d = enc.encode(patchSheet(dec.decode(d), edits));
      else if (n === 'xl/workbook.xml') d = enc.encode(setFullCalc(dec.decode(d)));
      else if (n === '[Content_Types].xml') d = enc.encode(dec.decode(d).replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
      else if (n === 'xl/_rels/workbook.xml.rels') d = enc.encode(dec.decode(d).replace(/<Relationship[^>]*Target="[^"]*calcChain\.xml"[^>]*\/>/, ''));
      return { name: n, data: d };
    });
    entries.sort(function (a, b) { return (a.name === '[Content_Types].xml' ? -1 : 0) - (b.name === '[Content_Types].xml' ? -1 : 0); });
    return zip(entries);
  }
  root.XlsxPatch = { apply: apply, patchSheet: patchSheet, colName: colName };
})(typeof window !== 'undefined' ? window : globalThis);
