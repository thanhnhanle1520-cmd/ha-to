/* xlsx-lite.js — đọc file .xlsx ngay trong trình duyệt (không cần thư viện ngoài, dùng được khi offline).
 * XlsxLite.read(arrayBuffer) -> Promise<{ tênTrang: [[ô,…],…] }>   (số giữ nguyên là số, ô ngày đổi thành yyyy-MM-dd) */
(function (root) {
  'use strict';
  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }
  function inflate(bytes) { var ds = new DecompressionStream('deflate-raw'); var w = ds.writable.getWriter(); w.write(bytes); w.close(); return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function unzip(buf) {
    var d = new Uint8Array(buf), eocd = -1;
    for (var i = d.length - 22; i >= Math.max(0, d.length - 70000); i--) if (u32(d, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Không phải file .xlsx hợp lệ.');
    var n = u16(d, eocd + 10), off = u32(d, eocd + 16), files = {}, p = off, tasks = [];
    for (var k = 0; k < n; k++) {
      if (u32(d, p) !== 0x02014b50) break;
      var method = u16(d, p + 10), csize = u32(d, p + 20), nlen = u16(d, p + 28), elen = u16(d, p + 30), clen = u16(d, p + 32), lho = u32(d, p + 42);
      var name = new TextDecoder().decode(d.subarray(p + 46, p + 46 + nlen));
      (function (name, method, csize, lho) {
        var ln = u16(d, lho + 26), le = u16(d, lho + 28), start = lho + 30 + ln + le, data = d.subarray(start, start + csize);
        tasks.push((method === 0 ? Promise.resolve(data) : inflate(data)).then(function (b) { files[name] = new TextDecoder().decode(b); }));
      })(name, method, csize, lho);
      p += 46 + nlen + elen + clen;
    }
    return Promise.all(tasks).then(function () { return files; });
  }
  function xml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref)[1], n = 0; for (var i = 0; i < m.length; i++) n = n * 26 + (m.charCodeAt(i) - 64); return n - 1; }
  function textOf(si) { var ts = si.getElementsByTagName('t'), s = ''; for (var i = 0; i < ts.length; i++) { var par = ts[i].parentNode.nodeName; if (par === 'rPh') continue; s += ts[i].textContent; } return s; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function serialToStr(v) {
    var ms = Math.round((v - 25569) * 86400000), d = new Date(ms), t = d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds();
    var ds = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    return t ? ds + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) : ds;
  }
  function read(buf) {
    return unzip(buf).then(function (f) {
      var wbx = xml(f['xl/workbook.xml']), rels = xml(f['xl/_rels/workbook.xml.rels']), relMap = {};
      [].forEach.call(rels.getElementsByTagName('Relationship'), function (r) { var t = r.getAttribute('Target'); relMap[r.getAttribute('Id')] = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t; });
      var sst = []; if (f['xl/sharedStrings.xml']) [].forEach.call(xml(f['xl/sharedStrings.xml']).getElementsByTagName('si'), function (si) { sst.push(textOf(si)); });
      var dateStyle = {};                                  // chỉ số kiểu ô nào là ô ngày
      if (f['xl/styles.xml']) {
        var st = xml(f['xl/styles.xml']), custom = {};
        [].forEach.call(st.getElementsByTagName('numFmt'), function (nf) { custom[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode'); });
        var xfs = st.getElementsByTagName('cellXfs')[0]; if (xfs) [].forEach.call(xfs.getElementsByTagName('xf'), function (xf, i) {
          var id = xf.getAttribute('numFmtId'), code = custom[id] || '';
          if ((+id >= 14 && +id <= 22) || (+id >= 45 && +id <= 47) || (code && /[ymd]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/[#0]/.test(code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')))) dateStyle[i] = 1;
        });
      }
      var out = {};
      [].forEach.call(wbx.getElementsByTagName('sheet'), function (sh) {
        var name = sh.getAttribute('name'), rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'), path = relMap[rid], sx = f[path]; if (!sx) return;
        var rows = [], rowEls = xml(sx).getElementsByTagName('row');
        for (var i = 0; i < rowEls.length; i++) {
          var rn = +rowEls[i].getAttribute('r') - 1, cells = rowEls[i].getElementsByTagName('c'), row = [];
          for (var j = 0; j < cells.length; j++) {
            var c = cells[j], ci = colIdx(c.getAttribute('r')), t = c.getAttribute('t'), s = +c.getAttribute('s') || 0, v = c.getElementsByTagName('v')[0], val = '';
            if (t === 'inlineStr') val = textOf(c);
            else if (v) {
              var raw = v.textContent;
              if (t === 's') val = sst[+raw] || ''; else if (t === 'str' || t === 'e') val = raw; else if (t === 'b') val = raw === '1';
              else { var num = parseFloat(raw); val = dateStyle[s] ? serialToStr(num) : num; }
            }
            while (row.length < ci) row.push(''); row[ci] = val;
          }
          while (rows.length < rn) rows.push([]); rows[rn] = row;
        }
        out[name] = rows;
      });
      return out;
    });
  }
  root.XlsxLite = { read: read };
})(window);
