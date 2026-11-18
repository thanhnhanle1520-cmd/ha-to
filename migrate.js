/* migrate.js — menu của chip đồng bộ + nhập dữ liệu từ file Excel của HATO ERP cũ (File > Tải xuống > .xlsx) */
(function () {
  'use strict';
  function ask(text, ok) { return window.confirm(text) && ok(); }
  function toSnapshot(book) {
    var snap = { sheets: {}, props: {} }, found = [], rows;
    Object.keys(TABLES).forEach(function (name) {
      var src = book[name]; if (!src || !src.length) return;
      var hdr = src[0].map(function (x) { return String(x).trim(); }), cols = TABLES[name], idx = cols.map(function (c) { return hdr.indexOf(c); });
      var out = [cols.slice()];
      for (var i = 1; i < src.length; i++) {
        var r = src[i] || [], nr = idx.map(function (k) { var v = k < 0 ? '' : r[k]; return v === undefined || v === null ? '' : v; });
        if (nr.some(function (x) { return x !== ''; }) && nr[0] !== '') out.push(nr);      // bỏ dòng trống / dòng không có id
      }
      snap.sheets[name] = out; found.push(name + ' ' + (out.length - 1));
    });
    (PRICE_SHEETS || []).forEach(function (n) { var src = book[n]; if (src && src.length) { var w = Math.max.apply(null, src.map(function (r) { return r.length; })); snap.sheets[n] = src.map(function (r) { var o = []; for (var i = 0; i < w; i++) o.push(r[i] === undefined || r[i] === null ? '' : r[i]); return o; }); found.push(n + ' ' + (src.length - 1)); } }); return { snap: snap, found: found };
  }
  function importXlsx(file) {
    return file.arrayBuffer().then(XlsxLite.read).then(function (book) {
      var r = toSnapshot(book);
      if (!r.snap.sheets.USERS && !r.snap.sheets.CUSTOMERS) throw new Error('File không giống dữ liệu HATO ERP (không thấy các trang USERS, CUSTOMERS…).');
      ensureMe(r.snap); return r;
    });
  }
  function ensureMe(snap) {                      // app 1 người dùng: tài khoản đang đăng nhập luôn là Quản trị
    var me = String((HatoStore.env && HatoStore.env.email) || '').toLowerCase(), cols = TABLES.USERS; if (!me) return;
    var rows = snap.sheets.USERS || (snap.sheets.USERS = [cols.slice()]), iE = cols.indexOf('email'), iR = cols.indexOf('role'), iA = cols.indexOf('active'), iN = cols.indexOf('name'), hit = null;
    for (var i = 1; i < rows.length; i++) if (String(rows[i][iE]).toLowerCase() === me) hit = rows[i];
    if (!hit) { hit = cols.map(function () { return ''; }); hit[iE] = me; hit[iN] = me.split('@')[0]; rows.push(hit); }
    hit[iR] = 'ADMIN'; hit[iA] = 1;
  }
  function dialog() {
    var box = document.createElement('div'); box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;font:15px system-ui,sans-serif';
    var card = document.createElement('div'); card.style.cssText = 'background:#fff;border-radius:12px;padding:20px;max-width:460px;margin:16px;width:100%'; box.appendChild(card); document.body.appendChild(box);
    return { card: card, close: function () { box.remove(); } };
  }
  function openImport() {
    var d = dialog(), card = d.card, info = document.createElement('div'), inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx';
    card.innerHTML = '<h3 style="margin:0 0 8px">Nhập dữ liệu từ HATO ERP cũ</h3><p style="color:#6b7280;font-size:13px;margin:0 0 10px">Trong Google Sheet cũ: Tệp → Tải xuống → Microsoft Excel (.xlsx), rồi chọn file đó ở đây. <b>Dữ liệu hiện có trong app này sẽ bị thay thế.</b></p>';
    card.appendChild(inp); card.appendChild(info); info.style.cssText = 'margin:10px 0;font-size:13px';
    var go = document.createElement('button'), cancel = document.createElement('button'); go.textContent = 'Nhập'; cancel.textContent = 'Đóng';
    go.style.cssText = 'padding:8px 16px;border-radius:8px;border:0;background:#e11d48;color:#fff;cursor:pointer;margin-right:8px'; cancel.style.cssText = 'padding:8px 16px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer';
    card.appendChild(go); card.appendChild(cancel); cancel.onclick = d.close; var parsed = null;
    inp.onchange = function () { parsed = null; info.textContent = 'Đang đọc file…'; importXlsx(inp.files[0]).then(function (r) { parsed = r; info.innerHTML = 'Đọc được: ' + r.found.join(' · '); }, function (e) { info.innerHTML = '<span style="color:#dc2626">' + e.message + '</span>'; }); };
    go.onclick = function () {
      if (!parsed) { info.textContent = 'Chưa chọn file hợp lệ.'; return; }
      if (!window.confirm('Thay toàn bộ dữ liệu hiện có bằng dữ liệu trong file?')) return;
      info.textContent = 'Đang nhập…';
      HatoStore.importWorkbook(parsed.snap).then(function () { info.textContent = 'Xong. Đang tải lại…'; setTimeout(function () { location.reload(); }, 600); }, function (e) { info.textContent = 'Lỗi: ' + e.message; });
    };
  }
  function openMenu() {
    var d = dialog(), card = d.card, st = HatoStore.state, m = HatoStore.meta();
    card.innerHTML = '<h3 style="margin:0 0 10px">Dữ liệu và đồng bộ</h3><p style="color:#6b7280;font-size:13px;margin:0 0 10px">Tài khoản: ' + (m.email || '—') + '<br>Lần đồng bộ gần nhất: ' + (m.lastSync ? new Date(m.lastSync).toLocaleString('vi-VN') : 'chưa') + '<br>Sao lưu gần nhất: ' + (m.lastBackup ? new Date(m.lastBackup).toLocaleString('vi-VN') : 'chưa') + (st.msg ? '<br><span style="color:#dc2626">' + st.msg + '</span>' : '') + '</p>';
    function btn(t, fn) { var b = document.createElement('button'); b.textContent = t; b.style.cssText = 'display:block;width:100%;padding:10px;margin:6px 0;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer;text-align:left'; b.onclick = fn; card.appendChild(b); }
    btn('⟳ Đồng bộ ngay', function () { d.close(); HatoStore.syncNow(); });
    btn('💾 Sao lưu ngay (lên Drive)', function () { d.close(); HatoStore.queueBackup('HA TO sao lưu ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm') + '.json'); });
    btn('📥 Nhập dữ liệu từ HATO ERP cũ (.xlsx)', function () { d.close(); openImport(); });
    btn('✕ Đóng', d.close);
  }
  window.HatoMigrate = { importXlsx: importXlsx, toSnapshot: toSnapshot, openMenu: openMenu, openImport: openImport };
})();
