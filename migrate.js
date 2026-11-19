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
  function E(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  function ask(msg, fn) { if (typeof confirmBox === 'function') confirmBox(msg, fn); else if (confirm(msg)) fn(); }
  function fmtT(t) { return t ? new Date(t).toLocaleString('vi-VN') : 'chưa'; }
  function openMenu() {
    var d = dialog(), card = d.card, st = HatoStore.state, m = HatoStore.meta(), nd = Object.keys(m.dirty || {}).length;
    card.style.maxHeight = '90vh'; card.style.overflow = 'auto';
    card.appendChild(E('h3', 'margin:0 0 10px', 'Dữ liệu và đồng bộ'));
    var inf = E('div', 'color:#6b7280;font-size:13px;margin:0 0 10px;line-height:1.6');
    ['Tài khoản: ' + (m.email || '—'), 'Lần đồng bộ gần nhất: ' + fmtT(m.lastSync), 'Sao lưu gần nhất: ' + fmtT(m.lastBackup), nd ? '⏳ ' + nd + ' bảng mới lưu trên máy, chờ gửi lên Drive' : '✔ Không còn gì chờ gửi'].forEach(function (t) { inf.appendChild(E('div', '', t)); });
    try { var pf = HatoStore.perf(), ls = pf.syncs[pf.syncs.length - 1]; inf.appendChild(E('div', '', '⚡ Mở app: ' + (pf.ready / 1000).toFixed(1) + 's · Đồng bộ gần nhất: ' + (ls ? (ls.ms / 1000).toFixed(1) + 's' : '—') + ' · Dữ liệu: ' + Math.round(pf.total / 1024) + ' KB')); } catch (e) { }
    if (st.msg) inf.appendChild(E('div', 'color:#dc2626', st.msg));
    card.appendChild(inf);
    function btn(t, fn, css) { var b = E('button', 'display:block;width:100%;padding:10px;margin:6px 0;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer;text-align:left;' + (css || ''), t); b.onclick = fn; card.appendChild(b); return b; }
    (st.bad || []).forEach(function (n) {
      var w = E('div', 'border:1px solid #fecaca;background:#fef2f2;border-radius:8px;padding:10px;margin:6px 0;font-size:13px');
      w.appendChild(E('div', 'font-weight:600;color:#b91c1c', 'Tệp ' + n + '.json trên Drive bị lỗi hoặc rỗng bất thường'));
      w.appendChild(E('div', 'color:#6b7280;margin:4px 0', 'Máy này vẫn giữ dữ liệu cũ. Chọn cách xử lý (trước khi xử lý, app tự sao lưu):'));
      var b1 = E('button', 'margin:4px 6px 0 0;padding:6px 10px;border-radius:6px;border:1px solid #d1d5db;background:#fff;cursor:pointer', 'Ghi bản máy này lên Drive'), b2 = E('button', 'margin:4px 0 0;padding:6px 10px;border-radius:6px;border:1px solid #d1d5db;background:#fff;cursor:pointer', 'Dùng bản trên Drive');
      b1.onclick = function () { d.close(); HatoStore.backupNow('HA TO trước khi xử lý ' + n + ' ' + Date.now() + '.json').catch(function () { }).then(function () { return HatoStore.useLocal(n); }); };
      b2.onclick = function () { d.close(); ask('Dùng bản trên Drive cho bảng ' + n + '? Dữ liệu bảng này trên máy sẽ bị thay (đã tự sao lưu trước).', function () { HatoStore.backupNow('HA TO trước khi xử lý ' + n + ' ' + Date.now() + '.json').catch(function () { }).then(function () { return HatoStore.useRemote(n); }); }); };
      w.appendChild(b1); w.appendChild(b2); card.appendChild(w);
    });
    btn('⟳ Đồng bộ ngay', function () { d.close(); HatoStore.syncNow(); });
    btn('💾 Sao lưu ngay (lên Drive)', function () { d.close(); HatoStore.backupNow('HA TO sao lưu tay ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH-mm') + '.json').then(function () { if (window.toast) toast('Đã sao lưu lên Drive'); }, function (e) { if (window.toast) toast('Sao lưu lỗi: ' + e.message, true); }); });
    btn('🗂 Khôi phục từ bản sao lưu…', function () { d.close(); openRestore(); });
    btn('📜 Nhật ký đồng bộ', function () { d.close(); openLog(); });
    btn('📊 Hiệu năng', function () { d.close(); openPerf(); });
    btn('📥 Nhập dữ liệu từ HATO ERP cũ (.xlsx)', function () { d.close(); openImport(); });
    btn('⎋ Đăng xuất Google (xóa dữ liệu trên máy này)', function () {
      d.close(); ask('Đăng xuất và xóa dữ liệu HA TO trên máy này? Dữ liệu vẫn còn nguyên trên Google Drive, lần sau đăng nhập sẽ tải lại.', function () { HatoStore.signOut().catch(function (e) { if (window.toast) toast(e.message, true); else alert(e.message); }); });
    }, 'color:#b91c1c');
    btn('✕ Đóng', d.close);
  }
  function openLog() {
    var d = dialog(), card = d.card, lg = (HatoStore.meta().log || []).slice().reverse();
    card.style.maxHeight = '90vh'; card.style.overflow = 'auto';
    card.appendChild(E('h3', 'margin:0 0 10px', 'Nhật ký đồng bộ (40 sự kiện gần nhất)'));
    var IC = { pull: '⬇', push: '⬆', merge: '🔀', error: '⚠', backup: '💾', restore: '🗂' };
    if (!lg.length) card.appendChild(E('p', 'color:#6b7280', 'Chưa có sự kiện nào.'));
    lg.forEach(function (x) { var r = E('div', 'font-size:13px;padding:5px 0;border-bottom:1px solid #f3f4f6;' + (x.k === 'error' ? 'color:#b91c1c' : '')); r.appendChild(E('span', 'color:#6b7280;margin-right:6px', fmtT(x.t))); r.appendChild(E('span', '', (IC[x.k] || '•') + ' ' + x.m)); card.appendChild(r); });
    var b = E('button', 'margin-top:12px;padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer', 'Đóng'); b.onclick = d.close; card.appendChild(b);
  }
  /* Hiệu năng: số đo thật trên máy này, so với mục tiêu (mở app < 1s, đồng bộ không khóa giao diện) */
  function openPerf() {
    var d = dialog(), card = d.card, pf = HatoStore.perf();
    card.style.maxHeight = '90vh'; card.style.overflow = 'auto';
    card.appendChild(E('h3', 'margin:0 0 8px', 'Hiệu năng trên máy này'));
    function row(k, v, ok) { var r = E('div', 'display:flex;justify-content:space-between;font-size:14px;padding:4px 0;border-bottom:1px solid #f3f4f6'); r.appendChild(E('span', '', k)); r.appendChild(E('b', ok === false ? 'color:#d97706' : (ok ? 'color:#16a34a' : ''), v)); card.appendChild(r); }
    row('Mở app (từ dữ liệu trong máy)', (pf.ready / 1000).toFixed(2) + ' s', pf.ready < 1000);
    if (pf.firstLoad) row('Tải lần đầu từ Drive', (pf.firstLoad / 1000).toFixed(1) + ' s');
    var ss = pf.syncs.map(function (x) { return x.ms; }), avg = ss.length ? ss.reduce(function (a, b) { return a + b; }, 0) / ss.length : 0;
    row('Đồng bộ (trung bình ' + ss.length + ' lần gần nhất, chạy ngầm)', ss.length ? (avg / 1000).toFixed(1) + ' s' : '—', ss.length ? avg < 5000 : null);
    row('Tổng dữ liệu', Math.round(pf.total / 1024) + ' KB', pf.total < 8 * 1024 * 1024);
    card.appendChild(E('div', 'margin:10px 0 4px;font-weight:600', 'Bảng lớn nhất'));
    pf.sizes.slice(0, 8).forEach(function (x) { row(x.name + ' (' + x.rows + ' dòng)', Math.round(x.bytes / 1024) + ' KB', x.bytes < 3 * 1024 * 1024); });
    card.appendChild(E('p', 'color:#6b7280;font-size:12px', 'Xanh: đạt mục tiêu · Cam: cần xem lại. Một bảng vượt khoảng 3 MB thì nên tách hoặc lưu trữ bớt dữ liệu cũ. Thời gian từng thao tác hiện ở góc phải dưới màn hình sau mỗi lần lưu.'));
    var b = E('button', 'margin-top:8px;padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer', 'Đóng'); b.onclick = d.close; card.appendChild(b);
  }
  function openRestore() {
    var d = dialog(), card = d.card, list = E('div', 'margin:8px 0', 'Đang tải danh sách…');
    card.style.maxHeight = '90vh'; card.style.overflow = 'auto';
    card.appendChild(E('h3', 'margin:0 0 6px', 'Khôi phục từ bản sao lưu'));
    card.appendChild(E('p', 'color:#6b7280;font-size:13px;margin:0', 'Bản sao lưu nằm trong thư mục "HA TO/Sao lưu" trên Drive. Trước khi khôi phục, app tự sao lưu dữ liệu hiện tại để có thể quay lại.'));
    card.appendChild(list);
    var close = E('button', 'margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer', 'Đóng'); close.onclick = d.close; card.appendChild(close);
    HatoStore.listBackups().then(function (bs) {
      list.textContent = ''; if (!bs.length) { list.textContent = 'Chưa có bản sao lưu nào.'; return; }
      bs.forEach(function (b) {
        var r = E('div', 'display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px'), nm = E('div', 'flex:1', b.name);
        nm.appendChild(E('div', 'color:#6b7280;font-size:12px', fmtT(b.t) + (b.size ? ' · ' + Math.round(b.size / 1024) + ' KB' : '')));
        var go = E('button', 'padding:5px 10px;border-radius:6px;border:1px solid #d1d5db;background:#fff;cursor:pointer', 'Khôi phục');
        go.onclick = function () {
          ask('Khôi phục toàn bộ dữ liệu về bản: ' + b.name + '? Dữ liệu hiện tại sẽ được sao lưu trước.', function () {
          list.textContent = 'Đang sao lưu dữ liệu hiện tại và khôi phục…'; close.disabled = true;
          HatoStore.restoreBackup(b.id, b.name).then(function () { list.textContent = 'Đã khôi phục. Đang tải lại…'; try { localStorage.removeItem('hato_cache_v2'); } catch (e) { } window.__redirecting = true; setTimeout(function () { location.reload(); }, 600); }, function (e) { close.disabled = false; list.textContent = ''; list.appendChild(E('div', 'color:#b91c1c', 'Không khôi phục được: ' + e.message + ' — dữ liệu hiện tại không bị thay đổi.')); });
          });
        };
        r.appendChild(nm); r.appendChild(go); list.appendChild(r);
      });
    }, function (e) { list.textContent = ''; list.appendChild(E('div', 'color:#b91c1c', 'Không tải được danh sách: ' + e.message)); });
  }
  window.HatoMigrate = { importXlsx: importXlsx, toSnapshot: toSnapshot, openMenu: openMenu, openImport: openImport, openRestore: openRestore, openLog: openLog };
})();
