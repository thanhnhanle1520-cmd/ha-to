/* tk-parse.js — đọc tờ khai hàng hóa nhập khẩu xuất từ ECUS (ToKhaiHQ7N_*.xlsx), bản 31.
 * TkParse.parse(rows) với rows = mảng dòng × cột của sheet nội dung (XlsxLite.read(...)['TKN']).
 * Cấu trúc: mỗi trang bắt đầu bằng ô "<IMP>"; trang 1–2 là thông tin chung; từ trang 3 mỗi dòng hàng bắt đầu bằng ô "<01>", "<02>"…
 * Đọc theo NHÃN CHỮ ("Mô tả hàng hóa", "Số lượng (1)"…) rồi lấy giá trị bên phải — không phụ thuộc ô cố định.
 * Số kiểu Việt Nam lưu dạng chữ: "1.100" = 1100, "16,5" = 16,5. Trả về { head, items, checks, errors, warnings }. */
(function (root) {
  'use strict';
  var MAX_LINES = 50;                 // VNACCS: tối đa 50 dòng hàng mỗi tờ khai
  function str(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function norm(v) { return str(v).toLowerCase().normalize('NFC'); }
  function isNumLike(v) { if (typeof v === 'number') return isFinite(v); var s = str(v); return /\d/.test(s) && /^-?[\d.,\s]+%?$/.test(s); }
  function vnNum(v) {                 // "1.234.567" → 1234567 · "16,5" → 16.5 · "8%" → 8 · số giữ nguyên
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = str(v).replace(/[%\s]/g, ''); if (!s || !/\d/.test(s)) return 0;
    s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s); return isFinite(n) ? n : 0;
  }
  function isoDate(v) {               // "13/11/2026 08:47:54" | "13/11/2026" | "2026-11-13" → "2026-11-13"
    var s = str(v), m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? m[0] : '';
  }
  function isCode(v) { var s = str(v); return s === '-' || /^[A-Z][A-Z0-9 ]{0,4}$/.test(s) || /^\[.*\]$/.test(s); }   // mã ngắn: VND, PCE, USD, A, B01, -, [  ]
  function cells(rows, r) { var row = rows[r] || [], o = []; for (var c = 0; c < row.length; c++) if (str(row[c]) !== '') o.push({ c: c, v: row[c] }); return o; }

  function Grid(rows) { this.rows = rows; }
  /* tìm ô nhãn trong khoảng dòng [r0, r1): exact = khớp đúng cả ô (bỏ khoảng trắng/hoa thường), không thì "bắt đầu bằng" */
  Grid.prototype.find = function (label, r0, r1, col) {
    var t = norm(label);
    for (var r = r0; r < r1; r++) { var cs = cells(this.rows, r); for (var i = 0; i < cs.length; i++) { if (col != null && cs[i].c !== col) continue; var s = norm(cs[i].v); if (s === t || (t.length > 6 && s.indexOf(t) === 0 && s.length - t.length <= 4)) return { r: r, c: cs[i].c }; } }
    return null;
  };
  Grid.prototype.right = function (at) { return at ? cells(this.rows, at.r).filter(function (x) { return x.c > at.c; }) : []; };
  /* chữ ngay bên phải nhãn (ô kế tiếp không trống) */
  Grid.prototype.text = function (label, r0, r1) { var a = this.find(label, r0, r1), rt = this.right(a); return rt.length ? str(rt[0].v) : ''; };
  /* số bên phải nhãn: bỏ qua mã ngắn (VND, USD, A, -), dừng khi gặp nhãn khác → trả 0 nếu ô số để trống */
  Grid.prototype.numAt = function (a) {
    var rt = this.right(a);
    for (var i = 0; i < rt.length; i++) { if (isNumLike(rt[i].v)) return { n: vnNum(rt[i].v), next: rt.slice(i + 1).map(function (x) { return str(x.v); }) }; if (!isCode(rt[i].v)) break; }
    return { n: 0, next: [], empty: true };
  };
  Grid.prototype.num = function (label, r0, r1) { return this.numAt(this.find(label, r0, r1)).n; };

  /* tách Model / Hiệu từ mô tả hải quan: "…Model:TY7126.Hiệu: Tyco. Sử dụng…" */
  function modelOf(d) {
    var m = /\bmodel\s*[:：]?\s*([^\s,;]+(?:\s*\/\s*[^\s,;]+)*)/i.exec(d || ''); if (!m) return '';
    return m[1].replace(/\.(hiệu|hãng|nhãn|xuất|sử|dùng|hàng|mới|size|kích).*$/i, '').replace(/[.:]+$/, '').trim();
  }
  function brandOf(d) {
    var m = /(?:nhãn hiệu|hiệu|hãng(?: sản xuất| sx)?)\s*[:：]?\s*([^.,;()]+)/i.exec(d || ''); if (!m) return '';
    return m[1].replace(/\s+(model|sử dụng|xuất xứ|hàng mới).*$/i, '').trim().slice(0, 40);
  }

  function parse(rows) {
    var g = new Grid(rows || []), n = rows ? rows.length : 0, errors = [], warnings = [];
    var pages = [];
    for (var r = 0; r < n; r++) { var cs = cells(rows, r); for (var i = 0; i < cs.length; i++) if (str(cs[i].v) === '<IMP>' || str(cs[i].v) === '<EXP>') { pages.push(r); break; } }
    if (str((cells(rows, pages[0] || 0)[0] || {}).v) === '<EXP>') errors.push('Đây là tờ khai XUẤT khẩu, không phải nhập khẩu.');
    if (!pages.length) return { head: {}, items: [], checks: [], errors: ['Không nhận ra tờ khai ECUS: thiếu dấu trang "<IMP>". Hãy xuất tờ khai từ ECUS ra Excel (mẫu ToKhaiHQ7N).'], warnings: [] };
    var p1 = [pages[0], pages[1] || n], p2 = pages[1] != null ? [pages[1], pages[2] || n] : [n, n];
    var H = {};
    H.decl_no = g.text('Số tờ khai', p1[0], p1[1]).replace(/\D/g, '');
    if (!H.decl_no) errors.push('Không đọc được số tờ khai.');
    H.type_code = g.text('Mã loại hình', p1[0], p1[1]).split(/\s+/)[0] || '';
    var kt = g.text('Mã phân loại kiểm tra', p1[0], p1[1]);
    H.channel = { '1': 'XANH', '2': 'VANG', '3': 'DO' }[kt.charAt(0)] || '';
    H.customs_office = g.text('Tên cơ quan Hải quan tiếp nhận tờ khai', p1[0], p1[1]);
    H.reg_date = isoDate(g.text('Ngày đăng ký', p1[0], p1[1]));
    var imp = g.find('Người nhập khẩu', p1[0], p1[1]), exp = g.find('Người xuất khẩu', p1[0], p1[1]), uyt = g.find('Người ủy thác xuất khẩu', p1[0], p1[1]);
    H.importer_tax = imp ? g.text('Mã', imp.r + 1, imp.r + 3).replace(/\s/g, '') : '';
    if (exp) {
      var e1 = uyt ? uyt.r : Math.min(exp.r + 9, p1[1]);
      H.exporter_name = g.text('Tên', exp.r + 1, e1);
      var ad = g.find('Địa chỉ', exp.r + 1, e1), mn = g.find('Mã nước', exp.r + 1, e1), addr = [];
      if (ad) for (var ar = ad.r; ar < (mn ? mn.r : ad.r + 2); ar++) cells(rows, ar).forEach(function (x) { if (x.c > ad.c) addr.push(str(x.v)); });
      H.exporter_address = addr.join(', ');
      H.exporter_country = mn ? str((g.right(mn)[0] || {}).v) : '';
    }
    var vd = g.find('Số vận đơn', p1[0], p1[1]);
    H.bill_no = vd ? str(((cells(rows, vd.r + 1).filter(function (x) { return x.c > vd.c && x.c < vd.c + 8 && !/^\d$/.test(str(x.v)); })[0]) || {}).v) : '';
    var dd = g.find('Địa điểm dỡ hàng', p1[0], p1[1]); H.port = dd ? g.right(dd).map(function (x) { return str(x.v); }).join(' · ') : '';
    H.arrival_date = isoDate(g.text('Ngày hàng đến', p1[0], p1[1]));
    var sl = g.numAt(g.find('Số lượng', p1[0], p1[1])); H.packages = sl.n; H.package_unit = sl.next[0] || '';
    H.gross_kg = g.num('Tổng trọng lượng hàng (Gross)', p1[0], p1[1]);
    H.invoice_no = g.text('Số hóa đơn', p1[0], p1[1]).replace(/^[A-Z]\s*-\s*/, '');
    H.invoice_date = isoDate(g.text('Ngày phát hành', p1[0], p1[1]));
    H.pay_method = g.text('Phương thức thanh toán', p1[0], p1[1]);
    var tg = g.find('Tổng trị giá hóa đơn', p1[0], p1[1]);
    if (tg) { var parts = str((g.right(tg)[0] || {}).v).split(/\s*-\s*/); H.incoterm = parts[1] || ''; H.currency = parts[2] || ''; var f0 = g.right(tg)[0]; H.invoice_total = f0 ? g.numAt({ r: tg.r, c: f0.c }).n : 0; }
    H.taxable_total = g.num('Tổng trị giá tính thuế', p1[0], p1[1]);
    H.exchange_rate = g.num('Tỷ giá tính thuế', p1[0], p1[1]);
    H.tax_payable = g.num('Tổng tiền thuế phải nộp', p1[0], p1[1]);
    var ts = g.find('Tên sắc thuế', p1[0], p1[1]); H.tax_summary = [];
    if (ts) for (var tr = ts.r + 1; tr < ts.r + 8 && tr < p1[1]; tr++) { var nm = str((rows[tr] || [])[ts.c]); if (!nm) continue; var am = g.numAt({ r: tr, c: ts.c }); H.tax_summary.push({ name: nm.replace(/^[A-Z]\s+/, ''), amount: am.n }); }
    H.pages_declared = g.num('Tổng số trang của tờ khai', p1[0], p1[1]);
    H.lines_declared = g.num('Tổng số dòng hàng của tờ khai', p1[0], p1[1]);
    var note = g.text('Phần ghi chú', p2[0], p2[1]); H.note_hq = note;
    var hm = /hợp đồng\s*[;:]?\s*([^,;]+?)\s*(?:,|;|$)/i.exec(note); H.contract_no = hm ? hm[1].trim() : '';
    var hd = /ngày\s*[:：]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(note); H.contract_date = hd ? isoDate(hd[1]) : '';
    H.release_date = isoDate(g.text('Ngày cấp phép', p2[0], p2[1]));
    H.pages = pages.length;

    /* dòng hàng: mỗi khối bắt đầu bằng ô "<01>" */
    var starts = [];
    for (var r2 = 0; r2 < n; r2++) { var c0 = cells(rows, r2); if (c0.length && /^<\d{2,3}>$/.test(str(c0[0].v))) starts.push({ r: r2, no: parseInt(str(c0[0].v).slice(1), 10) }); }
    if (starts.length > MAX_LINES) errors.push('Tờ khai có ' + starts.length + ' dòng hàng, vượt giới hạn ' + MAX_LINES + ' dòng.');
    var items = starts.slice(0, MAX_LINES).map(function (s, k) {
      var r0 = s.r, r1 = k + 1 < starts.length ? starts[k + 1].r : n, it = { line_no: s.no };
      pages.forEach(function (pr) { if (pr > r0 && pr < r1) r1 = pr; });       // khối kết thúc ở đầu trang kế
      it.hs_code = g.text('Mã số hàng hóa', r0, r1).replace(/\D/g, '');
      var md = g.find('Mô tả hàng hóa', r0, r1), desc = [];
      if (md) for (var dr = md.r; dr < md.r + 4 && dr < r1; dr++) { var t = cells(rows, dr).filter(function (x) { return x.c > md.c; }); if (dr > md.r && (!t.length || cells(rows, dr).some(function (x) { return x.c <= md.c; }))) break; t.forEach(function (x) { if (!/^(Số lượng|Số của mục)/.test(str(x.v))) desc.push(str(x.v)); }); }
      it.description = desc.join(' ').trim();
      it.model = modelOf(it.description); it.brand = brandOf(it.description);
      var q1 = g.numAt(g.find('Số lượng (1)', r0, r1)), q2 = g.numAt(g.find('Số lượng (2)', r0, r1));
      it.qty = q1.n; it.unit = (q1.next[0] || '').trim(); it.qty2 = q2.n; it.unit2 = (q2.next[0] || '').trim();
      it.inv_value = g.num('Trị giá hóa đơn', r0, r1);
      var up = g.numAt(g.find('Đơn giá hóa đơn', r0, r1)); it.inv_price = up.n; it.inv_currency = up.next[0] || H.currency || '';
      var nk0 = g.find('Thuế nhập khẩu', r0, r1), oth = g.find('Thuế và thu khác', r0, r1), a0 = nk0 ? nk0.r : r0, a1 = oth ? oth.r : r1;
      it.tax_value = g.num('Trị giá tính thuế(S)', a0, a1) || g.num('Trị giá tính thuế', a0, a1);
      it.tax_unit_price = g.num('Đơn giá tính thuế', a0, a1);
      it.nk_rate = g.num('Thuế suất', a0, a1);
      it.nk_amount = g.num('Số tiền thuế', a0, a1);
      it.nk_exempt = g.num('Số tiền miễn giảm', a0, a1);
      var xx = g.find('Nước xuất xứ', r0, r1), xr = g.right(xx).map(function (x) { return str(x.v); }).filter(function (x) { return x && x !== '-'; });
      it.origin = xr[0] || ''; it.origin_name = xr[1] || '';
      /* thuế khác (GTGT, TTĐB, BVMT…): các khối 1–5 dưới "Thuế và thu khác", tên ở ô cạnh nhãn "Tên" */
      it.vat_rate = 0; it.vat_amount = 0; it.other_tax = 0; it.other_taxes = [];
      if (oth) {
        var tens = []; for (var tr2 = oth.r + 1; tr2 < r1; tr2++) { var tc = cells(rows, tr2).filter(function (x) { return norm(x.v) === 'tên'; })[0]; if (tc) tens.push({ r: tr2, c: tc.c }); }
        tens.forEach(function (tn, j) {
          var b1 = j + 1 < tens.length ? tens[j + 1].r : r1, name = str((g.right(tn)[0] || {}).v);
          if (!name || /^mã áp dụng/i.test(name)) return;
          var rate = g.num('Thuế suất', tn.r, b1), amt = g.num('Số tiền thuế', tn.r, b1), ex = g.num('Số tiền miễn giảm', tn.r, b1);
          if (/gtgt|giá trị gia tăng|vat/i.test(name)) { it.vat_rate = rate; it.vat_amount = amt - ex; }
          else { it.other_tax += amt - ex; it.other_taxes.push({ name: name, rate: rate, amount: amt - ex }); }
        });
      }
      return it;
    });
    if (!items.length && !errors.length) errors.push('Không tìm thấy dòng hàng nào (trang 3 trở đi, ô "<01>").');

    /* kiểm tra chéo: lệch → đánh dấu đúng chỗ, không chặn nếu chỉ do làm tròn */
    var checks = [];
    function chk(label, a, b, tol) { if (!b && !a) return; var ok = Math.abs(a - b) <= (tol || 0.5); checks.push({ label: label, file: b, sum: a, ok: ok }); if (!ok) warnings.push(label + ': cộng các dòng = ' + a + ', tờ khai ghi ' + b + '.'); }
    if (H.lines_declared) chk('Số dòng hàng', items.length, H.lines_declared);
    if (H.pages_declared) chk('Số trang', pages.length, H.pages_declared);
    var stv = 0, svat = 0, sinv = 0; items.forEach(function (it) { stv += it.tax_value; svat += it.vat_amount; sinv += it.inv_value; });
    if (H.taxable_total) chk('Tổng trị giá tính thuế (VND)', stv, H.taxable_total, items.length);
    var vatSum = 0; (H.tax_summary || []).forEach(function (t) { if (/gtgt/i.test(t.name)) vatSum += t.amount; });
    if (vatSum) chk('Tổng thuế GTGT (VND)', svat, vatSum, items.length);
    if (H.invoice_total) chk('Tổng trị giá hóa đơn (' + (H.currency || 'nguyên tệ') + ')', Math.round(sinv * 1000) / 1000, H.invoice_total, 0.05 * items.length);
    items.forEach(function (it) {
      it.flags = [];
      if (!(it.qty > 0)) it.flags.push('Thiếu số lượng');
      if (!it.description) it.flags.push('Thiếu mô tả');
      if (it.inv_price > 0 && it.qty > 0 && Math.abs(it.inv_price * it.qty - it.inv_value) > Math.max(0.05, it.inv_value * 0.001)) it.flags.push('SL × đơn giá ≠ trị giá hóa đơn');
      if (!(it.tax_value > 0)) it.flags.push('Thiếu trị giá tính thuế');
      if (it.flags.length) warnings.push('Dòng ' + it.line_no + ': ' + it.flags.join(', ') + '.');
      it.cost = costOf(it);
    });
    return { head: H, items: items, checks: checks, errors: errors, warnings: warnings };
  }
  /* Giá vốn / đvt = đơn giá tính thuế (VND) + (thuế NK − miễn giảm + thuế khác không khấu trừ) / SL. Thuế GTGT NK không vào giá vốn. */
  function costOf(it) {
    var q = Number(it.qty) || 0; if (!(q > 0)) return { base: 0, tax: 0, cost: 0 };
    var base = Number(it.tax_unit_price) > 0 ? Number(it.tax_unit_price) : (Number(it.tax_value) || 0) / q;
    var tax = (Math.max(0, (Number(it.nk_amount) || 0) - (Number(it.nk_exempt) || 0)) + (Number(it.other_tax) || 0)) / q;
    return { base: Math.round(base), tax: Math.round(tax), cost: Math.round(base + tax) };
  }
  /* đọc cả file: chọn sheet có "<IMP>" (ECUS đặt tên TKN) */
  function pickSheet(book) {
    var names = Object.keys(book || {}), has = function (k, re) { return (book[k] || []).some(function (row) { return (row || []).some(function (v) { return re.test(str(v)); }); }); };
    return names.filter(function (k) { return has(k, /^<\d{2,3}>$/); })[0] || names.filter(function (k) { return has(k, /^<(IMP|EXP)>$/); })[0] || names[0];
  }
  var api = { parse: parse, parseBook: function (book) { var k = pickSheet(book); return parse(book[k] || []); }, vnNum: vnNum, isoDate: isoDate, modelOf: modelOf, brandOf: brandOf, costOf: costOf, MAX_LINES: MAX_LINES };
  root.TkParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
