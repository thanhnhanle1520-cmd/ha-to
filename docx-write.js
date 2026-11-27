/* docx-write.js — dựng file Word .docx thật từ bản in HTML (bản 36). Không cần thư viện ngoài.
   Cách làm: hiển thị HTML trong một khung ẩn đúng bề rộng vùng in, đọc kiểu chữ / căn lề / viền / độ rộng cột
   đã tính sẵn của trình duyệt, rồi viết ra WordprocessingML. Hình (logo, chữ ký, con dấu) nằm luôn trong file .docx.
   Dùng: DocxWrite.fromHtml(html, { margin:[trên,phải,dưới,trái] mm, landscape, footer }) → Promise<Uint8Array> */
var DocxWrite = (function () {
  'use strict';
  var TW = 15;                         // 1px CSS = 15 twip (1/20 pt)
  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
  function utf8(s) { return new TextEncoder().encode(s); }
  function px(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function hex(c) {                    // rgb(a, b, c) → 'RRGGBB'; trong suốt → ''
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || ''); if (!m || (m[4] != null && +m[4] === 0)) return '';
    return [m[1], m[2], m[3]].map(function (x) { return ('0' + (+x).toString(16)).slice(-2); }).join('').toUpperCase();
  }
  function b64bytes(b64) { var bin = atob(b64), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function bytesB64(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }

  function Conv(win, contentPx) {
    var media = [], self = this;
    this.media = media;
    var cs = function (el) { return win.getComputedStyle(el); };
    function isBlock(el, st) { var d = st.display; return d === 'block' || d === 'list-item' || d === 'flex' || d === 'grid' || d === 'table' || /^table-/.test(d); }
    function rPr(st) {
      var o = '', sz = Math.round(px(st.fontSize) * 1.5);       // px → nửa pt: px × 0,75 × 2
      if (parseInt(st.fontWeight, 10) >= 600) o += '<w:b/><w:bCs/>';
      if (st.fontStyle === 'italic') o += '<w:i/><w:iCs/>';
      var col = hex(st.color); if (col && col !== '000000') o += '<w:color w:val="' + col + '"/>';
      if (sz) o += '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/>';
      if (/underline/.test(st.textDecorationLine || st.textDecoration || '')) o += '<w:u w:val="single"/>';
      return o ? '<w:rPr>' + o + '</w:rPr>' : '';
    }
    function lineRule(st) {
      var lh = st.lineHeight, fs = px(st.fontSize);
      if (/px$/.test(lh) && fs) return Math.max(200, Math.round(px(lh) / fs / 1.15 * 240));   // Times New Roman: dòng đơn của Word ≈ 1,15 cỡ chữ
      return 240;
    }
    function jc(st) { var a = st.textAlign; return a === 'center' ? 'center' : a === 'right' || a === 'end' ? 'right' : a === 'justify' ? 'both' : ''; }
    // ---- đoạn văn ----
    function newPara(blockEl) { return { el: blockEl, runs: [], before: 0, after: 0, ind: 0, empty: true }; }
    function paraXml(p) {
      var st = cs(p.el), o = '<w:pPr>', j = jc(st);
      if (p.keep) o += '<w:keepNext/>';
      if (p.border) o += '<w:pBdr><w:bottom w:val="single" w:sz="' + p.border.sz + '" w:space="1" w:color="' + (p.border.color || '000000') + '"/></w:pBdr>';
      var line = p.exact ? ' w:line="' + p.exact + '" w:lineRule="exact"' : ' w:line="' + lineRule(st) + '" w:lineRule="auto"';
      o += '<w:spacing w:before="' + Math.round(p.before * TW) + '" w:after="' + Math.round(p.after * TW) + '"' + line + '/>';
      if (p.ind) o += '<w:ind w:left="' + Math.round(p.ind * TW) + '"/>';
      if (j) o += '<w:jc w:val="' + j + '"/>';
      o += p.exact ? '<w:rPr><w:sz w:val="2"/></w:rPr>' : rPr(st);
      o += '</w:pPr>';
      return '<w:p>' + o + p.runs.join('') + '</w:p>';
    }
    function textRun(text, st) { return '<w:r>' + rPr(st) + '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>'; }
    function imgRun(img) {
      var src = img.getAttribute('src') || '', m = /^data:image\/(png|jpe?g|gif);base64,(.+)$/i.exec(src);
      if (!m) return '';
      var ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase(), n = media.length + 1;
      media.push({ name: 'image' + n + '.' + ext, ext: ext, data: b64bytes(m[2]) });
      var w = Math.round((img.width || 100) * 9525), h = Math.round((img.height || 100) * 9525), rid = 'rIdImg' + n;
      return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + w + '" cy="' + h + '"/><wp:docPr id="' + n + '" name="Hinh ' + n + '"/>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + n + '" name="image' + n + '.' + ext + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + w + '" cy="' + h + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }
    // Duyệt 1 khối: trả về danh sách phần tử khối (đoạn văn {para} hoặc bảng {xml})
    function blocks(container) {
      var out = [], cur = null;
      function flush() { if (cur && !cur.empty) out.push(cur); cur = null; }
      function ensure(blockEl) { if (!cur) cur = newPara(blockEl); return cur; }
      function walk(node, blockEl) {
        for (var ch = node.firstChild; ch; ch = ch.nextSibling) {
          if (ch.nodeType === 3) {
            var pst = cs(ch.parentNode), t = ch.nodeValue;
            if (!/^pre/.test(pst.whiteSpace)) t = t.replace(/[ \t\r\n]+/g, ' ');
            if (!cur || cur.empty || cur.lastBr) t = t.replace(/^ +/, '');
            if (!t) continue;
            var p = ensure(blockEl); p.runs.push(textRun(t, pst)); p.empty = false; p.lastBr = false;
            continue;
          }
          if (ch.nodeType !== 1) continue;
          var tag = ch.tagName.toLowerCase(), st = cs(ch);
          if (st.display === 'none' || tag === 'style' || tag === 'script' || tag === 'title') continue;
          if (tag === 'br') { var pb = ensure(blockEl); pb.runs.push('<w:r><w:br/></w:r>'); pb.empty = false; pb.lastBr = true; continue; }
          if (tag === 'img') { var r = imgRun(ch); if (r) { var pi = ensure(blockEl); pi.runs.push(r); pi.empty = false; } continue; }
          if (tag === 'table') { flush(); out.push({ xml: table(ch), mt: px(st.marginTop), mb: px(st.marginBottom) }); continue; }
          if (tag === 'hr') {
            flush(); var bw = Math.max(px(st.borderTopWidth), px(st.borderBottomWidth));
            out.push({ el: blockEl, runs: [], before: px(st.marginTop), after: px(st.marginBottom), exact: 20, border: { sz: Math.min(24, Math.max(4, Math.round(bw * 6))), color: hex(st.borderTopColor) || hex(st.borderBottomColor) } });
            continue;
          }
          if (isBlock(ch, st)) {
            flush(); var start = out.length;
            walk(ch, ch); flush();
            var ind = px(st.marginLeft) + px(st.paddingLeft);
            if (out.length === start && ch.offsetHeight > 0 && !ch.textContent.trim()) out.push({ el: ch, runs: [], before: 0, after: 0, exact: Math.max(20, Math.round(ch.offsetHeight * TW)) });   // đoạn trống làm khoảng cách
            else if (out.length === start) continue;
            var first = out[start], last = out[out.length - 1];
            if (first.xml) first.mt = (first.mt || 0) + px(st.marginTop) + px(st.paddingTop); else first.before += px(st.marginTop) + px(st.paddingTop);
            if (last.xml) last.mb = (last.mb || 0) + px(st.marginBottom) + px(st.paddingBottom); else last.after += px(st.marginBottom) + px(st.paddingBottom);
            if (ind) for (var k = start; k < out.length; k++) if (!out[k].xml) out[k].ind += ind;
            continue;
          }
          walk(ch, blockEl);         // chữ trong dòng (b, i, span…)
        }
      }
      walk(container, container); flush();
      return out;
    }
    // Ghép danh sách khối thành XML; khoảng cách trên/dưới bảng chuyển thành đoạn trống cao đúng bằng khoảng đó
    function emit(list, inCell) {
      var x = '';
      list.forEach(function (b, i) {
        if (b.xml) {
          if (b.mt > 0.5) x += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="' + Math.max(20, Math.round(b.mt * TW)) + '" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';
          x += b.xml;
          var nx = list[i + 1];
          if (b.mb > 0.5 || (nx && nx.xml) || (!nx && inCell)) x += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="' + Math.max(20, Math.round((b.mb || 1) * TW)) + '" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';
        } else x += paraXml(b);
      });
      return x;
    }
    function border(st, side) {
      var w = px(st['border' + side + 'Width']), s = st['border' + side + 'Style'];
      if (!w || s === 'none' || s === 'hidden') return '<w:' + side.toLowerCase() + ' w:val="nil"/>';
      return '<w:' + side.toLowerCase() + ' w:val="' + (s === 'double' ? 'double' : s === 'dashed' ? 'dashed' : s === 'dotted' ? 'dotted' : 'single') + '" w:sz="' + Math.min(24, Math.max(4, Math.round(w * 6))) + '" w:space="0" w:color="' + (hex(st['border' + side + 'Color']) || '000000') + '"/>';
    }
    function table(tb) {
      var rows = [].slice.call(tb.rows), tr0 = tb.getBoundingClientRect(), edges = {};
      rows.forEach(function (tr) { [].slice.call(tr.cells).forEach(function (td) { var r = td.getBoundingClientRect(); edges[Math.round(r.left - tr0.left)] = 1; edges[Math.round(r.right - tr0.left)] = 1; }); });
      var xs = Object.keys(edges).map(Number).sort(function (a, b) { return a - b; });
      xs = xs.filter(function (v, i) { return i === 0 || v - xs[i - 1] > 2; });          // gộp mép lệch nhau 1–2px
      var near = function (v) { var bi = 0; xs.forEach(function (x, i) { if (Math.abs(x - v) < Math.abs(xs[bi] - v)) bi = i; }); return bi; };
      var grid = []; for (var i = 1; i < xs.length; i++) grid.push(Math.round((xs[i] - xs[i - 1]) * TW));
      var total = grid.reduce(function (a, b) { return a + b; }, 0);
      var x = '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>' +
        '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>' +
        grid.map(function (g) { return '<w:gridCol w:w="' + g + '"/>'; }).join('') + '</w:tblGrid>';
      rows.forEach(function (tr, ri) {
        var cells = [].slice.call(tr.cells); if (!cells.length) return;
        var isHead = cells.every(function (c) { return c.tagName === 'TH'; }) && ri === 0, hgt = 0;
        cells.forEach(function (td) { var sh = td.style.height || td.getAttribute('height'); if (sh) hgt = Math.max(hgt, td.getBoundingClientRect().height); });
        x += '<w:tr><w:trPr><w:cantSplit/>' + (isHead && rows.length > 2 ? '<w:tblHeader/>' : '') + (hgt ? '<w:trHeight w:val="' + Math.round(hgt * TW) + '" w:hRule="atLeast"/>' : '') + '</w:trPr>';
        var col = 0;
        cells.forEach(function (td) {
          var r = td.getBoundingClientRect(), a = near(r.left - tr0.left), b = near(r.right - tr0.left), span = Math.max(1, b - a), st = cs(td);
          if (a > col) { x += '<w:tc><w:tcPr><w:tcW w:w="' + grid.slice(col, a).reduce(function (s, g) { return s + g; }, 0) + '" w:type="dxa"/>' + (a - col > 1 ? '<w:gridSpan w:val="' + (a - col) + '"/>' : '') + '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders></w:tcPr><w:p/></w:tc>'; }
          var w = grid.slice(a, a + span).reduce(function (s, g) { return s + g; }, 0), bg = hex(st.backgroundColor), va = st.verticalAlign;
          var mar = function (side, v) { return '<w:' + side + ' w:w="' + Math.round(px(v) * TW) + '" w:type="dxa"/>'; };
          x += '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
            '<w:tcBorders>' + border(st, 'Top') + border(st, 'Left') + border(st, 'Bottom') + border(st, 'Right') + '</w:tcBorders>' +
            (bg ? '<w:shd w:val="clear" w:color="auto" w:fill="' + bg + '"/>' : '') +
            '<w:tcMar>' + mar('top', st.paddingTop) + mar('left', st.paddingLeft) + mar('bottom', st.paddingBottom) + mar('right', st.paddingRight) + '</w:tcMar>' +
            '<w:vAlign w:val="' + (va === 'middle' ? 'center' : va === 'bottom' ? 'bottom' : 'top') + '"/></w:tcPr>';
          var inner = emit(blocks(td), true);
          x += (inner || '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>' + rPr(st) + '</w:pPr></w:p>') + '</w:tc>';
          col = a + span;
        });
        x += '</w:tr>';
      });
      return x + '</w:tbl>';
    }
    this.body = function (root) {
      var list = blocks(root), x = emit(list, false);
      if (!list.length || list[list.length - 1].xml) x += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';
      return x;
    };
  }

  function pkg(bodyXml, media, o) {
    var mm = function (v) { return Math.round(v * 56.6929); };          // mm → twip
    var mg = o.margin || [20, 15, 20, 30], land = !!o.landscape, W = land ? 16838 : 11906, H = land ? 11906 : 16838, ft = String(o.footer || '');
    var rels = '<Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSe" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      media.map(function (m, i) { return '<Relationship Id="rIdImg' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>'; }).join('') +
      (ft ? '<Relationship Id="rIdFt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : '');
    var sect = '<w:sectPr>' + (ft ? '<w:footerReference w:type="default" r:id="rIdFt"/>' : '') + '<w:pgSz w:w="' + W + '" w:h="' + H + '"' + (land ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="' + mm(mg[0]) + '" w:right="' + mm(mg[1]) + '" w:bottom="' + mm(mg[2]) + '" w:left="' + mm(mg[3]) + '" w:header="' + mm(6) + '" w:footer="' + mm(Math.max(4, mg[2] / 2 - 2)) + '" w:gutter="0"/></w:sectPr>';
    var doc = HEAD + '<w:document ' + NS + '><w:body>' + bodyXml + sect + '</w:body></w:document>';
    var F = 'w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"';
    var styles = HEAD + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><' + F + '/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
    var settings = HEAD + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    var R9 = '<w:rPr><w:color w:val="555555"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>';
    var fld = function (code) { return '<w:r>' + R9 + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + R9 + '<w:instrText xml:space="preserve"> ' + code + ' </w:instrText></w:r><w:r>' + R9 + '<w:fldChar w:fldCharType="separate"/></w:r><w:r>' + R9 + '<w:t>1</w:t></w:r><w:r>' + R9 + '<w:fldChar w:fldCharType="end"/></w:r>'; };
    var t = function (s) { return '<w:r>' + R9 + '<w:t xml:space="preserve">' + esc(s) + '</w:t></w:r>'; };
    var footer = HEAD + '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr>' + t(ft + ' · Trang ') + fld('PAGE') + t('/') + fld('NUMPAGES') + '</w:p></w:ftr>';
    var exts = {}; media.forEach(function (m) { exts[m.ext] = 1; });
    var ct = HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      Object.keys(exts).map(function (e) { return '<Default Extension="' + e + '" ContentType="image/' + e + '"/>'; }).join('') +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' + (ft ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '') + '</Types>';
    var files = [
      { name: '[Content_Types].xml', data: utf8(ct) },
      { name: '_rels/.rels', data: utf8(HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
      { name: 'word/document.xml', data: utf8(doc) },
      { name: 'word/_rels/document.xml.rels', data: utf8(HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>') },
      { name: 'word/styles.xml', data: utf8(styles) },
      { name: 'word/settings.xml', data: utf8(settings) }
    ];
    if (ft) files.push({ name: 'word/footer1.xml', data: utf8(footer) });
    media.forEach(function (m) { files.push({ name: 'word/media/' + m.name, data: m.data }); });
    return XlsxWrite.zip(files).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  function fromHtml(html, o) {
    o = o || {};
    var mg = o.margin || [20, 15, 20, 30], pageW = o.landscape ? 297 : 210, wPx = Math.round((pageW - mg[1] - mg[3]) * 96 / 25.4);
    var fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + wPx + 'px;height:1200px;border:0;visibility:hidden';
    var END = '</bo' + 'dy>';
    html = String(html).replace('</style>', 'html,body{margin:0;padding:0}.WordSection1{margin:0;padding:0}</style>');
    return new Promise(function (res, rej) {
      fr.onload = function () {
        try {
          var d = fr.contentDocument, imgs = [].slice.call(d.images);
          Promise.all(imgs.map(function (im) { return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; }); })).then(function () {
            try {
              var root = d.querySelector('.WordSection1') || d.body, cv = new Conv(fr.contentWindow, wPx), body = cv.body(root);
              fr.remove(); pkg(body, cv.media, o).then(res, rej);
            } catch (e) { fr.remove(); rej(e); }
          });
        } catch (e) { fr.remove(); rej(e); }
      };
      fr.srcdoc = html.indexOf(END) < 0 ? html : html;
      document.body.appendChild(fr);
    });
  }
  /* r: kết quả ACTIONS.export (format doc) có r.docx → đổi thành file .docx */
  function convert(r) {
    if (!r || !r.docx) return Promise.resolve(r);
    var x = r.docx;
    return fromHtml(x.html, x).then(function (u8) { return { name: x.name, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base64: bytesB64(u8), url: r.url }; });
  }
  return { fromHtml: fromHtml, convert: convert };
})();
