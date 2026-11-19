/* rfq-core.js — "bộ não" nhập Excel của khách (không phụ thuộc giao diện, chạy được cả trong Node để kiểm thử).
 * 1. findHeader(rows, merges)      tìm dòng tiêu đề (kể cả tiêu đề 2 tầng, ô gộp)
 * 2. mapColumns(headerTexts, rows)  ghép cột theo từ điển đồng nghĩa + kiểm tra dữ liệu bên dưới
 * 3. classify(rows, start, map)     phân loại dòng: hàng / mục / dòng chữ / tổng; ghép tên dòng cha cho dòng con
 * 4. fillPlan(...)                  danh sách ô cần điền khi xuất ngược theo mẫu khách
 * Số dòng dùng trong kết quả là số dòng Excel (1 = dòng đầu tiên). */
(function (root) {
  'use strict';
  var FIELDS = [
    ['stt', 'STT'], ['code', 'Mã hàng'], ['name', 'Tên hàng / mô tả'], ['spec', 'Quy cách / thông số'], ['model', 'Model / mã hiệu'],
    ['brand', 'Hãng / nhãn hiệu'], ['origin', 'Xuất xứ'], ['unit', 'ĐVT'], ['qty', 'Số lượng'], ['price', 'Đơn giá'], ['amount', 'Thành tiền'], ['note', 'Ghi chú']
  ];
  /* Từ điển đồng nghĩa (đã bỏ dấu, chữ thường). Thêm từ mới vào đây là app tự nhận. */
  var SYN = {
    stt: ['stt', 'tt', 'so tt', 'no', 'no.', 'item no', 'item', 'sr', 's/n', 'sn', 'ord'],
    code: ['ma hang', 'ma vt', 'ma vat tu', 'ma sp', 'ma san pham', 'item code', 'code', 'part no', 'part number', 'p/n', 'sku'],
    name: ['ten hang', 'ten vat tu', 'ten thiet bi', 'ten san pham', 'mo ta cong viec', 'noi dung cong viec', 'mo ta', 'dien giai', 'noi dung', 'hang muc', 'description', 'descripition', 'product', 'ten', 'items'],
    spec: ['quy cach', 'thong so ky thuat', 'thong so', 'mo ta ky thuat', 'tieu chuan ky thuat', 'yeu cau ky thuat', 'dac tinh', 'technical', 'specification', 'specifications', 'spec', 'specs'],
    model: ['model', 'ma hieu', 'ky hieu', 'type', 'catalogue no'],
    brand: ['thuong hieu', 'nhan hieu', 'hang san xuat', 'hang sx', 'nha san xuat', 'brand', 'manufacturer', 'maker', 'make', 'hang'],
    origin: ['xuat xu', 'nuoc san xuat', 'nuoc sx', 'origin', 'country of origin', 'country'],
    unit: ['dvt', 'don vi tinh', 'don vi', 'dv', 'unit', 'uom', 'units'],
    qty: ['so luong', 'khoi luong', 'sl', 'kl', 'qty', 'q ty', 'q.ty', 'quantity', 'quantities', 'quan'],
    price: ['don gia', 'gia ban', 'unit price', 'unit rate', 'price', 'rate', 'gia'],
    amount: ['thanh tien', 'tong tien', 'gia tri', 'amount', 'line total', 'total amount', 'total price', 'total'],
    note: ['ghi chu', 'remarks', 'remark', 'note', 'notes', 'comment', 'comments']
  };
  function strip(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[’'`´]/g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function txt(v) { return v == null ? '' : String(v).trim(); }
  function isNum(v) { if (typeof v === 'number') return isFinite(v); var s = txt(v).replace(/\s/g, ''); return /^-?\d{1,3}([.,]\d{3})*([.,]\d+)?$|^-?\d+([.,]\d+)?$/.test(s); }
  function toNum(v) {
    if (typeof v === 'number') return v; var s = txt(v).replace(/\s/g, ''); if (!s) return 0;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');     // 1.234.567,5
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');                   // 1,234,567.5
    else s = s.replace(',', '.');
    var n = parseFloat(s); return isFinite(n) ? n : 0;
  }
  /* điểm khớp của một tiêu đề với một từ đồng nghĩa: trùng hẳn 100; đứng đầu 50+độ dài; nằm trong (đủ từ) = độ dài */
  function score(h, syn) {
    if (!h) return 0; if (h === syn) return 100;
    var re = new RegExp('(^|[^a-z0-9])' + syn.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '($|[^a-z0-9])');
    var m = re.exec(h); if (!m) return 0;
    return m.index === 0 ? 50 + syn.length : syn.length;
  }
  function bestField(h) { var best = null; FIELDS.forEach(function (f) { SYN[f[0]].forEach(function (s) { var sc = score(h, s); if (sc && (!best || sc > best.sc)) best = { f: f[0], sc: sc, syn: s }; }); }); return best; }

  /* Tìm dòng tiêu đề trong 40 dòng đầu: dòng nhận ra nhiều loại cột nhất. Tiêu đề 2 tầng (ô gộp dọc hoặc dòng con ngay dưới) được ghép chữ. */
  function cellText(rows, merges, r, c) {
    var v = (rows[r] || [])[c];
    if (txt(v) === '') for (var i = 0; i < merges.length; i++) { var m = merges[i]; if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) { v = (rows[m.r1] || [])[m.c1]; break; } }
    return txt(v);
  }
  function width(rows, from, to) { var w = 0; for (var r = from; r < Math.min(rows.length, to); r++) w = Math.max(w, (rows[r] || []).length); return w; }
  function findHeader(rows, merges) {
    merges = merges || []; var W = width(rows, 0, 300), best = null;
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var seen = {}, n = 0, filled = 0;
      for (var c = 0; c < W; c++) { var t = strip(cellText(rows, merges, r, c)); if (!t) continue; filled++; if (t.length > 60) continue; var b = bestField(t); if (b && b.sc >= 50 && !seen[b.f]) { seen[b.f] = 1; n++; } }
      if (n >= 2 && (!best || n > best.n)) best = { r: r, n: n };
    }
    if (!best) return null;
    var r0 = best.r, r1 = r0, sub = rows[r0 + 1] || [];
    var vMerge = merges.some(function (m) { return m.r1 === r0 && m.r2 > r0; });
    var subTexts = sub.filter(function (v) { return txt(v) !== ''; }), subNums = sub.filter(function (v) { return isNum(v) && txt(v) !== ''; });
    var subHasField = sub.some(function (v) { var b = bestField(strip(v)); return b && b.sc >= 50; });
    if (vMerge || (subTexts.length && subTexts.length < (rows[r0] || []).filter(function (v) { return txt(v) !== ''; }).length && subNums.length <= 1 && (subHasField || merges.some(function (m) { return m.r1 === r0 && m.c2 > m.c1; })))) r1 = r0 + 1;
    var texts = [];
    for (var c2 = 0; c2 < W; c2++) {
      var a = cellText(rows, merges, r0, c2), b2 = r1 > r0 ? cellText(rows, merges, r1, c2) : '';
      var hm = merges.some(function (m) { return m.r1 <= r0 && m.r2 >= r0 && c2 > m.c1 && c2 <= m.c2; });      // ô gộp ngang: chỉ cột đầu mang tiêu đề
      if (hm && !(b2 && b2 !== a)) { texts.push(''); continue; }
      texts.push(b2 && b2 !== a ? (a ? a + ' / ' + b2 : b2) : a);
    }
    return { row: r0 + 1, last: r1 + 1, texts: texts };      // số dòng Excel
  }

  /* Ghép cột: mỗi cột nhận 1 loại, mỗi loại tối đa 1 cột; chọn theo điểm cao trước. Sau đó kiểm tra dữ liệu bên dưới. */
  function mapColumns(texts, rows, start, saved) {
    var W = Math.max(texts.length, width(rows, start - 1, start + 300)), cand = [];
    for (var c = 0; c < W; c++) { var h = strip(texts[c]); if (!h) continue; FIELDS.forEach(function (f) { var top = 0; SYN[f[0]].forEach(function (s) { top = Math.max(top, score(h, s)); }); if (top) cand.push({ c: c, f: f[0], sc: top }); }); }
    cand.sort(function (a, b) { return b.sc - a.sc || a.c - b.c; });
    var map = {}, used = {}, conf = {};
    if (saved) Object.keys(saved).forEach(function (f) { var c = saved[f]; if (c != null && c >= 0 && c < W && !used[c]) { map[f] = c; used[c] = 1; conf[f] = 'saved'; } });
    cand.forEach(function (x) { if (map[x.f] == null && !used[x.c]) { map[x.f] = x.c; used[x.c] = 1; conf[x.f] = x.sc >= 50 ? 'high' : 'low'; } });
    var data = rows.slice(start - 1, start - 1 + 400), warn = [];
    function colVals(c) { return data.map(function (r) { return (r || [])[c]; }).filter(function (v) { return txt(v) !== ''; }); }
    // không có tiêu đề (hoặc thiếu cột chính): đoán theo dữ liệu
    if (map.qty == null) { var bestQ = null; for (var q = 0; q < W; q++) { if (used[q]) continue; var vs = colVals(q), nn = vs.filter(isNum).length; if (vs.length >= 2 && nn / vs.length >= 0.8 && (!bestQ || nn > bestQ.n)) bestQ = { c: q, n: nn }; } if (bestQ) { map.qty = bestQ.c; used[bestQ.c] = 1; conf.qty = 'guess'; } }
    if (map.name == null) { var bestN = null; for (var n2 = 0; n2 < W; n2++) { if (used[n2]) continue; var v2 = colVals(n2), tl = v2.filter(function (v) { return !isNum(v); }).reduce(function (s, v) { return s + txt(v).length; }, 0); if (v2.length && (!bestN || tl > bestN.t)) bestN = { c: n2, t: tl }; } if (bestN) { map.name = bestN.c; used[bestN.c] = 1; conf.name = 'guess'; } }
    if (map.spec == null && conf.name === 'guess') { var bestS = null; for (var s2 = 0; s2 < W; s2++) { if (used[s2]) continue; var v3 = colVals(s2), tl2 = v3.filter(function (v) { return !isNum(v); }).reduce(function (s, v) { return s + txt(v).length; }, 0); if (tl2 > 20 && (!bestS || tl2 > bestS.t)) bestS = { c: s2, t: tl2 }; } if (bestS) { map.spec = bestS.c; used[bestS.c] = 1; conf.spec = 'guess'; } }
    // kiểm tra dữ liệu: cột số lượng phải là số; thành tiền ≈ số lượng × đơn giá; STT phải ngắn
    if (map.qty != null) { var qv = colVals(map.qty); if (qv.length >= 3 && qv.filter(isNum).length / qv.length < 0.6) { warn.push('Cột "' + txt(texts[map.qty]) + '" được nhận là Số lượng nhưng nhiều ô không phải số — hãy kiểm tra.'); conf.qty = 'low'; } }
    if (map.stt != null) { var sv = colVals(map.stt); if (sv.length && sv.filter(function (v) { return txt(v).length > 8; }).length / sv.length > 0.4) { if (map.name == null) { map.name = map.stt; conf.name = 'low'; } delete map.stt; } }
    if (map.amount != null && map.qty != null && map.price != null) {
      var chk = 0, ok = 0; data.forEach(function (r) { r = r || []; var a = toNum(r[map.amount]), q2 = toNum(r[map.qty]), p = toNum(r[map.price]); if (a && q2 && p) { chk++; if (Math.abs(a - q2 * p) <= Math.max(1, Math.abs(a) * 0.01)) ok++; } });
      if (chk >= 2 && ok / chk < 0.5) { warn.push('Cột "' + txt(texts[map.amount]) + '" không bằng Số lượng × Đơn giá ở đa số dòng — có thể là cột tổng, hãy kiểm tra.'); conf.amount = 'low'; }
    }
    if (map.name == null) warn.push('Chưa xác định được cột Tên hàng — hãy chọn tay.');
    if (map.qty == null) warn.push('Chưa xác định được cột Số lượng — hãy chọn tay (file không có số lượng thì bỏ qua).');
    return { map: map, conf: conf, warn: warn, width: W };
  }

  /* Phân loại từng dòng dữ liệu. kind: item (dòng hàng) · section (tiêu đề mục) · text (dòng chữ / dòng cha) · total (dòng tổng) */
  var ROMAN = /^(?=[ivxlc]+$)c{0,3}(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;
  function classify(rows, start, map, opt) {
    opt = opt || {}; var inherit = opt.inherit !== false, out = [], parent = null;
    function g(r, f) { return map[f] == null ? '' : (r[map[f]] == null ? '' : r[map[f]]); }
    for (var i = start - 1; i < rows.length; i++) {
      var r = rows[i] || [], nonEmpty = r.some(function (v) { return txt(v) !== ''; }); if (!nonEmpty) continue;
      var o = { r: i + 1, stt: txt(g(r, 'stt')), code: txt(g(r, 'code')), name: txt(g(r, 'name')), spec: txt(g(r, 'spec')), model: txt(g(r, 'model')), brand: txt(g(r, 'brand')), origin: txt(g(r, 'origin')),
        unit: txt(g(r, 'unit')), qty: isNum(g(r, 'qty')) ? toNum(g(r, 'qty')) : null, price: isNum(g(r, 'price')) ? toNum(g(r, 'price')) : null, note: txt(g(r, 'note')) };
      if (!o.name && !o.spec && !o.code && !o.model) { var t0 = r.map(txt).filter(Boolean).filter(function (v) { return !isNum(v); })[0]; o.name = t0 || ''; }
      var nm = strip(o.name || o.spec), sttS = strip(o.stt);
      if (o.qty == null && /^(tong cong|tong gia tri|tong|cong|total|grand total|sub ?total|subtotal|vat|thue vat|thue gtgt|thanh tien bang chu|bang chu|chiet khau|discount)\b/.test(nm)) o.kind = 'total';
      else if ((o.qty != null && o.qty !== 0) || (o.qty == null && o.unit && !/^(note|ghi chu)$/i.test(strip(o.unit)) && (o.name || o.spec))) o.kind = 'item';
      else if (o.qty == null && (/^[a-z]$/i.test(o.stt) || ROMAN.test(sttS) || /^[ivx]+\.\d+$/i.test(sttS) || /^(phan|hang muc|he thong|part|section|bill|khu vuc|tang|block)\b/.test(nm) || (o.name.length > 3 && o.name === o.name.toUpperCase() && /[A-ZĐ]/.test(o.name) && !o.unit))) o.kind = 'section';
      else if (o.qty === 0 && o.unit) o.kind = 'item';
      else o.kind = 'text';
      // dòng con kế thừa tên dòng cha: tên trống, hoặc ngắn và không lặp lại tên cha
      o.full = o.name;
      if (o.kind === 'item') {
        var own = strip(o.name), short = !own || own.length <= 25;
        if (inherit && parent && short && !(own && strip(parent.name).slice(0, 6) === own.slice(0, 6))) {
          o.full = parent.name + (o.name ? ' – ' + o.name : ''); if (!o.spec && parent.spec) o.spec = parent.spec; else if (parent.spec && o.spec && parent.spec !== o.spec) o.spec = parent.spec + '\n' + o.spec;
          o.parent = parent.r;
        } else if (!short) parent = null;
      } else if (o.kind === 'text') { if (o.name) parent = o; }
      else if (o.kind === 'section') parent = null;
      if (!o.full) o.full = o.spec || o.model || o.code;
      out.push(o);
    }
    return out;
  }

  /* Kế hoạch điền ngược vào file khách.
     lines: [{ src: [số dòng Excel], qty, price (đã trừ chiết khấu), model, brand, origin }]
     Gộp nhiều dòng → dòng đầu: Đơn giá "Trọn gói", Thành tiền = tổng; các dòng còn lại: "Bao gồm trong mục trên".
     Không có cột Đơn giá / Thành tiền → thêm 2 cột ngay sau cột cuối của bảng. Dòng không chào giá: để trống. */
  function fillPlan(rfq, lines, rows, opt) {
    opt = opt || {}; var map = rfq.map || {}, edits = [], hdr = rfq.header_row, last = rfq.header_last || hdr, added = [];
    if (!hdr) { var mins = []; lines.forEach(function (l) { (l.src || []).forEach(function (r) { mins.push(r); }); }); hdr = Math.max(1, Math.min.apply(null, mins.length ? mins : [2]) - 1); }   // file không có tiêu đề: ghi tên cột thêm ngay trên dòng dữ liệu đầu
    var W = Math.max(rfq.width || 0, width(rows, hdr - 1, rows.length)), pc = map.price, ac = map.amount;
    if (pc == null) { pc = W; added.push([pc, 'Đơn giá']); W++; }
    if (ac == null) { ac = W; added.push([ac, 'Thành tiền']); W++; }
    added.forEach(function (a) { edits.push({ r: hdr, c: a[0], v: a[1], styleFrom: { r: hdr, c: Math.max(0, a[0] - 1) } }); });
    var INC = opt.incText || 'Bao gồm trong mục trên', LUMP = opt.lumpText || 'Trọn gói', total = 0;
    lines.forEach(function (l) {
      var src = (l.src || []).slice().sort(function (a, b) { return a - b; }); if (!src.length) return;
      var amt = Math.round(l.qty * l.price);
      total += amt;
      function sty(r, c) { return added.some(function (a) { return a[0] === c; }) ? { r: r, c: Math.max(0, c - 1) } : null; }
      if (src.length === 1) {
        var r = src[0], row = rows[r - 1] || [], rq = isNum(row[map.qty]) ? toNum(row[map.qty]) : null;
        edits.push({ r: r, c: pc, v: l.price, styleFrom: sty(r, pc) });
        edits.push({ r: r, c: ac, v: Math.round((rq != null ? rq : l.qty) * l.price), keepFormula: rq != null, styleFrom: sty(r, ac) });
      } else {
        edits.push({ r: src[0], c: pc, v: LUMP, styleFrom: sty(src[0], pc) });
        edits.push({ r: src[0], c: ac, v: amt, styleFrom: sty(src[0], ac) });
        src.slice(1).forEach(function (r2) { edits.push({ r: r2, c: pc, v: INC, styleFrom: sty(r2, pc) }); edits.push({ r: r2, c: ac, v: null, styleFrom: sty(r2, ac) }); });
      }
      ['model', 'brand', 'origin'].forEach(function (f) {   // khách để trống cột đề xuất (model / hãng / xuất xứ) thì điền vào dòng đầu
        if (map[f] == null || !l[f]) return; var rr = src[0], cur = txt((rows[rr - 1] || [])[map[f]]); if (!cur) edits.push({ r: rr, c: map[f], v: l[f] });
      });
    });
    return { edits: edits, added: added, total: total, priceCol: pc, amountCol: ac };
  }

  var api = { FIELDS: FIELDS, SYN: SYN, strip: strip, isNum: isNum, toNum: toNum, findHeader: findHeader, mapColumns: mapColumns, classify: classify, fillPlan: fillPlan, bestField: bestField };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RfqCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
