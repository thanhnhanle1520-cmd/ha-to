/* ============================================================================
 * store.js — đăng nhập Google, lưu dữ liệu lên Drive, bộ nhớ đệm IndexedDB, và cầu nối google.script.run
 * (nhờ cầu nối này toàn bộ giao diện cũ chạy nguyên không sửa).
 * Chế độ thử không cần Google: mở trang với ?local=1 (dữ liệu chỉ nằm trong trình duyệt này).
 * ========================================================================== */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search), LOCAL = Q.get('local') === '1';
  var T0 = (window.performance && performance.now) ? performance.now() : 0, PERF = { ready: 0, from: '', syncs: [] };     // đo tốc độ thật trên máy người dùng
  var SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
  var ROOT_NAME = 'HA TO', DATA_NAME = 'data', BACKUP_NAME = 'Sao lưu';
  var CLIENT_ID = (window.HATO_CLIENT_ID || '') || localStorage.getItem('hato_client_id') || '';
  var env = GasShim.create({ email: localStorage.getItem('hato_email') || '' }), wb = env.wb;
  Object.keys(env.globals).forEach(function (k) { window[k] = env.globals[k]; });

  /* ---------- tiện ích ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, attrs, kids) { var e = document.createElement(tag); Object.keys(attrs || {}).forEach(function (k) { if (k === 'style') e.style.cssText = attrs[k]; else if (k.slice(0, 2) === 'on') e[k] = attrs[k]; else e.setAttribute(k, attrs[k]); }); [].concat(kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return e; }
  function clone(x) { return x === undefined ? x : JSON.parse(JSON.stringify(x)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- IndexedDB: bản sao dữ liệu trong máy (mở app tức thì, dùng được khi mất mạng) ---------- */
  var IDB = (function () {
    var dbp = null;
    function open() { if (dbp) return dbp; dbp = new Promise(function (res, rej) { var r = indexedDB.open(LOCAL ? 'hato_local' : 'hato_app', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); return dbp; }
    function tx(mode, fn) { return open().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction('kv', mode), s = t.objectStore('kv'), out = fn(s); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : undefined); }; t.onerror = function () { rej(t.error); }; }); }); }
    return {
      get: function (k) { return tx('readonly', function (s) { return s.get(k); }); },
      set: function (k, v) { return tx('readwrite', function (s) { s.put(v, k); }); },
      del: function (k) { return tx('readwrite', function (s) { s.delete(k); }); }
    };
  })();

  /* ---------- Trạng thái đồng bộ ---------- */
  var meta = { email: '', versions: {}, dirty: {}, lastBackup: 0, lastSync: 0, log: [] };     // versions[name] = { id, version }
  /* Nhật ký đồng bộ: 40 sự kiện gần nhất (kéo về, gửi lên, gộp, lỗi, sao lưu, khôi phục) — xem trong menu "Dữ liệu và đồng bộ" */
  function logEv(kind, text) { meta.log = (meta.log || []).concat([{ t: Date.now(), k: kind, m: String(text || '').slice(0, 300) }]).slice(-40); }
  var state = { phase: 'init', msg: '', needLogin: false, conflict: false }, chip;
  function setState(patch) { Object.assign(state, patch); drawChip(); }
  function drawChip() {
    /* Trạng thái đồng bộ: biểu tượng nhỏ trên thanh tiêu đề (chấm màu + chữ ngắn), câu đầy đủ ở dòng gợi ý khi rê chuột */
    var bar = document.getElementById('bar');
    if (!chip) { chip = el('div', { id: 'hato-sync', role: 'status', style: 'position:fixed;left:50%;transform:translateX(-50%);bottom:10px;z-index:9999;font:13px system-ui,sans-serif;background:#fff;border:1px solid #d1d5db;border-radius:999px;padding:6px 12px;box-shadow:0 2px 10px rgba(0,0,0,.12);display:flex;gap:8px;align-items:center' }); document.body.appendChild(chip); }
    if (bar && chip.parentNode !== bar) { bar.appendChild(chip); chip.className = 'inbar'; }
    chip.innerHTML = '';
    var nd = Object.keys(meta.dirty).length, txt, full, col = '#16a34a';
    if (state.conflict) { txt = 'Xung đột dữ liệu'; full = 'Dữ liệu trên Drive đã đổi ở thiết bị khác'; col = '#dc2626'; }
    else if (state.bad && state.bad.length) { txt = 'Tệp lỗi trên Drive'; full = 'Bỏ qua tệp lỗi trên Drive: ' + state.bad.join(', ') + ' — đang giữ dữ liệu máy này. Bấm để xử lý.'; col = '#dc2626'; }
    else if (state.note) { txt = 'Đã gộp thay đổi'; full = state.note; col = '#2563eb'; }
    else if (state.needLogin) { txt = 'Chưa đồng bộ'; full = 'Chưa đồng bộ — cần đăng nhập Google' + (nd ? ' (' + nd + ' bảng chỉ mới lưu trên máy)' : ''); col = '#d97706'; }
    else if (state.phase === 'syncing') { txt = 'Đang đồng bộ…'; full = 'Đang đồng bộ với Google Drive'; col = '#2563eb'; }
    else if (!LOCAL && !navigator.onLine) { txt = 'Mất mạng' + (nd ? ' · ' + nd + ' chờ gửi' : ''); full = 'Mất mạng — ' + (nd ? nd + ' bảng đã lưu trên máy, sẽ gửi khi có mạng' : 'đang dùng dữ liệu trên máy'); col = '#d97706'; }
    else if (state.err && nd) { txt = 'Chưa gửi được'; full = 'Chưa gửi được lên Drive (' + nd + ' bảng lưu trên máy) — bấm để xem'; col = '#dc2626'; }
    else if (nd) { txt = 'Chờ gửi · ' + nd; full = 'Đã lưu trên máy · ' + nd + ' bảng chờ gửi lên Drive'; col = '#d97706'; }
    else if (LOCAL) { txt = 'Chế độ thử'; full = 'Chế độ thử (chỉ lưu trong trình duyệt)'; col = '#7c3aed'; }
    else { txt = 'Đã lưu'; full = 'Đã lưu lên Google Drive'; }
    chip.style.color = '#374151';
    chip.appendChild(el('span', { class: 'dot', style: 'background:' + col + ';width:8px;height:8px;border-radius:50%;display:inline-block' }));
    chip.appendChild(el('span', { class: 'tx' }, '☁ ' + txt));
    if (state.needLogin) chip.appendChild(el('button', { style: 'border:0;background:#0b5ca8;color:#fff;border-radius:6px;padding:2px 9px;cursor:pointer', onclick: function () { signIn(true).then(function () { return syncNow(); }); } }, 'Đăng nhập'));
    if (state.conflict) chip.appendChild(el('button', { style: 'border:0;background:#dc2626;color:#fff;border-radius:6px;padding:2px 9px;cursor:pointer', onclick: resolveConflict }, 'Xử lý'));
    chip.title = full + (state.msg && state.msg !== full ? '\n' + state.msg : '') + '\nBấm để mở menu Dữ liệu và đồng bộ'; chip.setAttribute('aria-label', full); chip.style.cursor = 'pointer';
    chip.onclick = function (e) { if (e.target.tagName !== 'BUTTON' && window.HatoMigrate) HatoMigrate.openMenu(); };
  }

  /* ---------- Ổ đĩa: Google Drive thật hoặc giả lập trong trình duyệt (?local=1) ---------- */
  var token = { v: '', exp: 0 }, tokenClient = null;
  function loadGsi() { return new Promise(function (res, rej) { if (window.google && google.accounts && google.accounts.oauth2) return res(); var s = el('script', { src: 'https://accounts.google.com/gsi/client' }); s.onload = function () { res(); }; s.onerror = function () { rej(new Error('Không tải được thư viện đăng nhập Google (kiểm tra mạng).')); }; document.head.appendChild(s); }); }
  function signIn(interactive) {
    if (LOCAL) { token = { v: 'local', exp: Date.now() + 3e9 }; if (!env.email) { env.email = meta.email = 'local@hato'; } return Promise.resolve(env.email); }
    if (token.v && token.exp - 60000 > Date.now() && meta.email) return Promise.resolve(meta.email);
    if (!CLIENT_ID) return Promise.reject(new Error('Chưa có Client ID Google.'));
    return new Promise(function (res, rej) {
      if (!(token.v && token.exp - 60000 > Date.now())) {                       // dùng token đã lưu sau lần đăng nhập chuyển trang
        try { var st = JSON.parse(localStorage.getItem('hato_token') || 'null'); if (st && st.v && st.exp - 60000 > Date.now()) token = st; } catch (e) { }
      }
      if (token.v && token.exp - 60000 > Date.now()) return res();
      if (!interactive) return rej(new Error('Cần đăng nhập Google.'));
      var rs = Math.random().toString(36).slice(2) + Date.now().toString(36), hint = localStorage.getItem('hato_email') || '';
      sessionStorage.setItem('hato_state', rs); window.__redirecting = true;
      location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + ['client_id=' + encodeURIComponent(CLIENT_ID), 'redirect_uri=' + encodeURIComponent(location.origin + location.pathname), 'response_type=token', 'scope=' + encodeURIComponent(SCOPE), 'include_granted_scopes=true', 'state=' + rs, hint ? 'login_hint=' + encodeURIComponent(hint) : 'prompt=select_account'].join('&');
    }).then(function () {
      return fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token.v } }).then(function (r) { return r.json(); }).then(function (u) {
        if (!u.email) throw new Error('Không lấy được email Google.');
        meta.email = u.email; env.email = u.email; localStorage.setItem('hato_email', u.email); setState({ needLogin: false }); return u.email;
      });
    });
  }

  var authErr = '';
  (function readAuthHash() {
    var h = location.hash || ''; if (h.indexOf('access_token=') < 0 && h.indexOf('error=') < 0) return;
    var q = {}; h.replace(/^#/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    history.replaceState(null, '', location.pathname + location.search);
    if (q.error) { authErr = 'Google từ chối: ' + q.error; return; }
    if (q.state !== sessionStorage.getItem('hato_state')) { authErr = 'Phiên đăng nhập không khớp, hãy thử lại.'; return; }
    token = { v: q.access_token, exp: Date.now() + (+q.expires_in || 3600) * 1000 };
    try { localStorage.setItem('hato_token', JSON.stringify(token)); } catch (e) { }
  })();

  var Drive = (function () {
    if (LOCAL) {                                     // giả lập: mỗi "file" là một khoá trong IndexedDB
      var mem = null, memP = null, ver = 0;
      function all() { return memP || (memP = IDB.get('localdrive').then(function (m) { mem = m || { files: {}, n: 0 }; return mem; })); }
      function save() { return IDB.set('localdrive', mem); }
      return {
        init: function () { return all().then(function () { return 'local'; }); },
        list: function () { return all().then(function (m) { return Object.keys(m.files).filter(function (k) { return k.indexOf('data/') === 0; }).map(function (k) { return { id: k, name: k.slice(5), version: String(m.files[k].v) }; }); }); },
        read: function (id) { return all().then(function (m) { return JSON.parse(m.files[id].text); }); },
        version: function (id) { return all().then(function (m) { return m.files[id] ? String(m.files[id].v) : null; }); },
        write: function (name, obj, existing) { return all().then(function (m) { var id = existing || ('data/' + name); m.files[id] = { text: JSON.stringify(obj), v: (m.files[id] ? m.files[id].v : 0) + 1 }; return save().then(function () { return { id: id, version: String(m.files[id].v) }; }); }); },
        upload: function (path, blob) { return all().then(function (m) { m.n++; var id = 'files/' + m.n + '/' + blob.getName(); m.files[id] = { text: '(tệp thử)', v: 1 }; return save().then(function () { return { id: id, url: 'https://local.invalid/' + encodeURIComponent(id) }; }); }); },
        trash: function () { return Promise.resolve(); }, backup: function (name, obj) { return all().then(function (m) { m.files['backup/' + name] = { text: JSON.stringify(obj), v: 1, t: Date.now() }; return save(); }); }, pruneBackups: function () { return Promise.resolve(); },
        putBlob: function (segs, name, blob) { return all().then(function (m) { return blob.arrayBuffer().then(function (ab) { m.n++; var id = 'files/' + m.n + '/' + name; m.files[id] = { text: '', bin: ab, v: 1 }; return save().then(function () { return { id: id, url: 'https://local.invalid/' + encodeURIComponent(id) }; }); }); }); },
        download: function (id) { return all().then(function (m) { var f = m.files[id]; if (!f || !f.bin) throw new Error('Không tìm thấy file trên Drive (thử).'); return f.bin; }); },
        listBackups: function () { return all().then(function (m) { return Object.keys(m.files).filter(function (k) { return k.indexOf('backup/') === 0; }).map(function (k) { return { id: k, name: k.slice(7), t: m.files[k].t || 0, size: m.files[k].text.length }; }).sort(function (a, b) { return b.t - a.t; }); }); }
      };
    }
    var folderIds = {}, API = 'https://www.googleapis.com/drive/v3/', UP = 'https://www.googleapis.com/upload/drive/v3/';
    function f(url, opts, retry) {
      return signIn(false).then(function () { opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + token.v }, opts.headers || {}); return fetch(url, opts); }).then(function (r) {
        if (r.status === 401 && !retry) { token = { v: '', exp: 0 }; return f(url, opts, true); }
        if (!r.ok) return r.text().then(function (t) { throw new Error('Drive ' + r.status + ': ' + t.slice(0, 200)); });
        return r;
      });
    }
    function j(url, opts) { return f(url, opts).then(function (r) { return r.json(); }); }
    function q(s) { return encodeURIComponent(s); }
    function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function ensureFolder(name, parent) {
      var key = (parent || 'root') + '/' + name; if (folderIds[key]) return Promise.resolve(folderIds[key]);
      var query = "name='" + esc(name) + "' and mimeType='application/vnd.google-apps.folder' and trashed=false" + (parent ? " and '" + parent + "' in parents" : " and 'root' in parents");
      return j(API + 'files?q=' + q(query) + '&fields=files(id,name)&pageSize=5').then(function (r) {
        if (r.files && r.files.length) return r.files[0].id;
        return j(API + 'files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder', parents: [parent || 'root'] }) }).then(function (c) { return c.id; });
      }).then(function (id) { folderIds[key] = id; return id; });
    }
    function ensurePath(segs) { return segs.reduce(function (p, s) { return p.then(function (par) { return ensureFolder(s, par); }); }, Promise.resolve(null)); }
    function multipart(meta0, blobOrText, mime, id) {
      var b = '-----hato' + Math.random().toString(36).slice(2), body = new Blob(['--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta0) + '\r\n--' + b + '\r\nContent-Type: ' + mime + '\r\n\r\n', blobOrText, '\r\n--' + b + '--']);
      return j(UP + 'files' + (id ? '/' + id : '') + '?uploadType=multipart&fields=id,version,webViewLink', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: body });
    }
    var dataFolder = null;
    return {
      init: function () { return ensurePath([ROOT_NAME, DATA_NAME]).then(function (id) { dataFolder = id; return id; }); },
      list: function () { return j(API + 'files?q=' + q("'" + dataFolder + "' in parents and trashed=false") + '&fields=files(id,name,version)&pageSize=200').then(function (r) { return r.files || []; }); },
      read: function (id) { return f(API + 'files/' + id + '?alt=media').then(function (r) { return r.json(); }); },
      version: function (id) { return j(API + 'files/' + id + '?fields=version').then(function (r) { return r.version == null ? null : String(r.version); }); },
      write: function (name, obj, existing) { return multipart(existing ? {} : { name: name, parents: [dataFolder], mimeType: 'application/json' }, JSON.stringify(obj), 'application/json', existing).then(function (r) { return { id: r.id, version: String(r.version) }; }); },
      uploadBig: function (path, file) {       // tải lên dạng "resumable", từng khúc 8MB (file lớn đến 50MB)
        var segs = path.slice(); if (segs[0] === 'HATO ERP') segs[0] = ROOT_NAME;
        var CH = 8 * 1024 * 1024, mime = file.type || 'application/octet-stream';
        return ensurePath(segs).then(function (par) {
          return f(UP + 'files?uploadType=resumable&fields=id,webViewLink', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(file.size) }, body: JSON.stringify({ name: file.name, parents: [par] }) });
        }).then(function (r) {
          var loc = r.headers.get('Location'); if (!loc) throw new Error('Drive không trả địa chỉ tải lên.');
          function put(start, tries) {
            var end = Math.min(start + CH, file.size);
            return fetch(loc, { method: 'PUT', headers: { 'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + file.size }, body: file.slice(start, end) }).then(function (x) {
              if (x.status === 308) { if (window.__hatoUpProgress) window.__hatoUpProgress(end, file.size); return put(end, 0); }
              if (x.ok) return x.json();
              if (tries < 3 && x.status >= 500) return new Promise(function (ok) { setTimeout(ok, 1500 * (tries + 1)); }).then(function () { return put(start, tries + 1); });
              return x.text().then(function (t) { throw new Error('Drive ' + x.status + ': ' + t.slice(0, 160)); });
            }, function (e) { if (tries < 3) return new Promise(function (ok) { setTimeout(ok, 1500 * (tries + 1)); }).then(function () { return put(start, tries + 1); }); throw e; });
          }
          return put(0, 0);
        }).then(function (r) { return { id: r.id, url: r.webViewLink || ('https://drive.google.com/file/d/' + r.id + '/view') }; });
      },
      upload: function (path, blob) {
        var segs = path.slice(); if (segs[0] === 'HATO ERP') segs[0] = ROOT_NAME;
        return ensurePath(segs).then(function (par) { return multipart({ name: blob.getName(), parents: [par] }, new Blob([blob.getBytes()], { type: blob.getContentType() }), blob.getContentType() || 'application/octet-stream'); }).then(function (r) { return { id: r.id, url: r.webViewLink || ('https://drive.google.com/file/d/' + r.id + '/view') }; });
      },
      putBlob: function (segs, name, blob) { return ensurePath(segs).then(function (par) { return multipart({ name: name, parents: [par] }, blob, blob.type || 'application/octet-stream'); }).then(function (r) { return { id: r.id, url: r.webViewLink || ('https://drive.google.com/file/d/' + r.id + '/view') }; }); },
      download: function (id) { return f(API + 'files/' + id + '?alt=media').then(function (r) { return r.arrayBuffer(); }); },
      trash: function (id) { return j(API + 'files/' + id + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }).catch(function () { }); },
      backup: function (name, obj) { return ensurePath([ROOT_NAME, BACKUP_NAME]).then(function (par) { return multipart({ name: name, parents: [par], mimeType: 'application/json' }, JSON.stringify(obj), 'application/json'); }); },
      listBackups: function () { return ensurePath([ROOT_NAME, BACKUP_NAME]).then(function (par) { return j(API + 'files?q=' + q("'" + par + "' in parents and trashed=false") + '&orderBy=createdTime desc&fields=files(id,name,createdTime,size)&pageSize=100'); }).then(function (r) { return (r.files || []).map(function (x) { return { id: x.id, name: x.name, t: Date.parse(x.createdTime) || 0, size: +x.size || 0 }; }); }); },
      pruneBackups: function (keep) {
        return ensurePath([ROOT_NAME, BACKUP_NAME]).then(function (par) { return j(API + 'files?q=' + q("'" + par + "' in parents and trashed=false") + '&orderBy=createdTime desc&fields=files(id,name)&pageSize=200'); }).then(function (r) { return Promise.all((r.files || []).slice(keep).map(function (x) { return Drive.trash(x.id); })); }).catch(function () { });
      }
    };
  })();

  /* ---------- Kiểm tra tệp JSON trước khi nhận (tệp hỏng / rỗng bất thường thì không ghi đè dữ liệu máy này) ---------- */
  var acceptEmpty = {};
  function checkPayload(n, p) {
    if (!p || typeof p !== 'object') return 'không phải JSON hợp lệ';
    if (n === '_props') return (p.props && typeof p.props === 'object') ? '' : 'thiếu phần props';
    if (!Array.isArray(p.rows)) return 'thiếu danh sách dòng';
    for (var i = 0; i < p.rows.length; i++) if (!Array.isArray(p.rows[i])) return 'dòng ' + (i + 1) + ' sai cấu trúc';
    if (p.rows.length && !(p.rows[0] || []).length) return 'mất dòng tiêu đề';
    var sh = wb.sheets[n], have = sh ? Math.max(0, sh.exportRows().length - 1) : 0;
    if (have >= 5 && p.rows.length <= 1 && !LOGT[n] && !acceptEmpty[n]) return 'rỗng bất thường (máy này đang có ' + have + ' dòng)';
    return '';
  }
  function readChecked(n, id) {
    return Drive.read(id).then(function (p) { var e = checkPayload(n, p); if (e) throw new Error(e); return p; }, function (e) { throw new Error('không đọc được (' + ((e && e.message) || e) + ')'); });
  }

  /* ---------- Lưu / nạp dữ liệu ---------- */
  var FILE = function (n) { return n + '.json'; };
  var LOGT = { AUDIT: 1, ERRLOG: 1 };
  function sheetPayload(n) { return n === '_props' ? { props: wb.props } : { rows: wb.sheets[n].exportRows() }; }
  function applyPayload(n, p) { if (n === '_props') { wb.props = p.props || {}; return; } var s = wb.sheets[n]; if (!s) { wb.addSheet(n, p.rows || []); return; } s.g = p.rows || []; s.max = Math.max(1000, s.g.length + 200); }

  function persistLocal(names) {                      // ghi các bảng đã đổi vào IndexedDB
    var jobs = names.map(function (n) { return IDB.set('sheet:' + n, sheetPayload(n)); });
    jobs.push(IDB.set('meta', clone(meta)));
    return Promise.all(jobs);
  }
  function loadLocal() {
    return IDB.get('meta').then(function (m) {
      if (!m) return false;
      meta = Object.assign(meta, m); if (meta.email) env.email = meta.email;
      var names = Object.keys(meta.versions || {}).concat(Object.keys(meta.dirty || {})).filter(function (v, i, a) { return a.indexOf(v) === i; });
      return Promise.all(names.map(function (n) { return IDB.get('sheet:' + n).then(function (p) { return [n, p]; }); })).then(function (list) {
        var snap = { sheets: {}, props: {} }; var any = false;
        list.forEach(function (x) { if (!x[1]) return; any = true; if (x[0] === '_props') snap.props = x[1].props || {}; else snap.sheets[x[0]] = x[1].rows || []; });
        if (!any) return false; wb.load(snap); return true;
      });
    }).catch(function () { return false; });
  }


  var pushing = Promise.resolve(), pushTimer = null;
  wb.onChange = function (n) { meta.dirty[n] = 1; };
  function afterApi() {                                // gọi sau mỗi lần chạy api()
    var names = Object.keys(wb.dirty); if (!names.length) return;
    wb.dirty = {}; names.forEach(function (n) { meta.dirty[n] = 1; });
    persistLocal(names).catch(function () { }); drawChip();
    clearTimeout(pushTimer); pushTimer = setTimeout(function () { syncNow(); }, 1500);
  }
  function syncNow() {
    pushing = pushing.then(doSync, doSync); return pushing;
  }
  /* ---------- Gộp dữ liệu 3 bên: bản nền (lần đồng bộ trước) · máy này · Drive ----------
     Hai thiết bị sửa khác dòng → gộp, không báo xung đột. Cùng một dòng bị sửa khác nhau → bản có updated_at mới hơn thắng.
     Dòng bị xóa ở một bên (và bên kia không sửa) → xóa theo. Một bên xóa, bên kia sửa → giữ bản đã sửa. */
  function rowSig(r) { var a = r.slice(); while (a.length && (a[a.length - 1] === '' || a[a.length - 1] == null)) a.pop(); return JSON.stringify(a); }
  function mapRows(rows) {
    var m = {}, order = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i]; if (!r || !r.length) continue; var sg = rowSig(r); if (sg === '[]') continue;
      var k = (r[0] === '' || r[0] == null) ? '' : String(r[0]); if (k === '') k = '\u0001' + sg;
      if (!(k in m)) order.push(k); m[k] = r;
    }
    return { m: m, order: order };
  }
  function mergeRows(name, base, local, remote) {
    var hL = local[0] || [], hR = remote[0] || [], hdr = hL.length > hR.length ? hL : (hR.length ? hR : hL), out = [hdr];
    if (LOGT[name]) {                                   // nhật ký: hợp hai bên, không trùng
      var seen = {}; remote.slice(1).forEach(function (r) { if (r && r.length) { seen[rowSig(r)] = 1; out.push(r); } });
      local.slice(1).forEach(function (r) { if (r && r.length && !seen[rowSig(r)]) out.push(r); }); return out;
    }
    var L = mapRows(local), R = mapRows(remote), B = base ? mapRows(base) : null, tsI = hdr.indexOf('updated_at');
    var order = R.order.concat(L.order.filter(function (k) { return !(k in R.m); }));
    order.forEach(function (k) {
      var l = L.m[k], r = R.m[k], b = B ? B.m[k] : undefined, take = null;
      if (l && r) {
        var sl = rowSig(l), sr = rowSig(r);
        if (sl === sr) take = r;
        else if (b && sl === rowSig(b)) take = r;            // chỉ Drive sửa
        else if (b && sr === rowSig(b)) take = l;            // chỉ máy này sửa
        else if (name === 'COUNTERS') take = Number(l[1]) > Number(r[1]) ? l : r;
        else if (tsI > 0 && String(r[tsI] || '') > String(l[tsI] || '')) take = r;
        else take = l;
      } else if (l) take = (b && rowSig(l) === rowSig(b)) ? null : l;      // Drive đã xóa (máy này không sửa) → xóa theo
      else take = (b && rowSig(r) === rowSig(b)) ? null : r;               // máy này đã xóa (Drive không sửa) → xóa theo
      if (take) out.push(take);
    });
    return out;
  }
  function saveBase(n, p) { return n === '_props' ? Promise.resolve() : IDB.set('base:' + n, { rows: (p && p.rows) || [] }); }
  function seq(list, fn) { return list.reduce(function (p, x) { return p.then(function () { return fn(x); }); }, Promise.resolve()); }
  var RETRY = { retry: true };
  function doSync(attempt) {
    attempt = typeof attempt === 'number' ? attempt : 0;
    if (state.conflict) return Promise.resolve();
    var ts = Date.now(); setState({ phase: 'syncing' });
    var merged = [], pulled = false, bad = [], pushed = [], got = [];
    return signIn(false).then(function () { return Drive.init(); }).then(function () { return Drive.list(); }).then(function (remote) {
      var tasks = [];
      remote.forEach(function (x) {
        var n = x.name.replace(/\.json$/, ''), known = meta.versions[n];
        if (known && known.version === x.version && known.id === x.id) return;             // Drive không đổi
        tasks.push({ n: n, x: x, merge: !!meta.dirty[n] });
      });
      return seq(tasks, function (t) {
        return readChecked(t.n, t.x.id).then(function (p) {
          if (!t.merge) { applyPayload(t.n, p); meta.versions[t.n] = { id: t.x.id, version: t.x.version }; pulled = true; got.push(t.n); return saveBase(t.n, p).then(function () { return persistLocal([t.n]); }); }
          if (t.n === '_props') { wb.props = Object.assign({}, p.props || {}, wb.props || {}); meta.versions[t.n] = { id: t.x.id, version: t.x.version }; pulled = true; return persistLocal([t.n]); }
          return IDB.get('base:' + t.n).then(function (b) {
            var loc = wb.sheets[t.n] ? wb.sheets[t.n].exportRows() : [];
            applyPayload(t.n, { rows: mergeRows(t.n, b && b.rows, loc, p.rows || []) });
            meta.versions[t.n] = { id: t.x.id, version: t.x.version }; pulled = true; merged.push(t.n); return persistLocal([t.n]);
          });
        }, function (e) { bad.push(t.n); logEv('error', t.n + '.json trên Drive ' + e.message + ' — giữ dữ liệu máy này, không ghi đè'); });
      });
    }).then(function () {
      if (pulled) { env.resetCache(); try { if (typeof softRefresh === 'function') softRefresh(); } catch (e) { } }
      var names = Object.keys(meta.dirty).filter(function (n) { return (n === '_props' || wb.sheets[n]) && bad.indexOf(n) < 0; });   // bảng có tệp lỗi: không ghi đè, chờ xử lý
      return seq(names, function (n) {
        var k = meta.versions[n], pl = sheetPayload(n);
        return (n !== '_props' && merged.indexOf(n) < 0 && k && k.id ? IDB.get('base:' + n) : Promise.resolve(null)).then(function (b) {
          if (b && JSON.stringify(b.rows) === JSON.stringify(pl.rows)) { delete meta.dirty[n]; return IDB.set('meta', clone(meta)); }   // giống bản đã đồng bộ → khỏi ghi lên Drive
          meta.dirty[n] = 2;                                                                  // đang gửi; nếu trong lúc gửi có sửa thêm thì onChange đặt lại = 1
          return (k && k.id ? Drive.version(k.id) : Promise.resolve(null)).then(function (v) {
            if (k && k.id && v != null && String(v) !== String(k.version)) { meta.dirty[n] = 1; throw RETRY; }   // thiết bị khác vừa ghi: gộp lại trước khi ghi
            return Drive.write(FILE(n), pl, k && k.id);
          }).then(function (r) {
            meta.versions[n] = r; if (meta.dirty[n] === 2) delete meta.dirty[n]; pushed.push(n);
            return saveBase(n, pl).then(function () { return persistLocal([n]); });     // bản trong máy luôn khớp bản vừa gửi lên Drive
          }, function (e) { if (meta.dirty[n] === 2) meta.dirty[n] = 1; throw e; });
        });
      });
    }).then(function () {
      meta.lastSync = Date.now();
      if (got.length) logEv('pull', 'Nhận từ Drive: ' + got.join(', '));
      if (merged.length) { logEv('merge', 'Gộp với thiết bị khác: ' + merged.join(', ')); setState({ note: 'Đã gộp thay đổi từ thiết bị khác (' + merged.join(', ') + ')' }); setTimeout(function () { setState({ note: '' }); }, 8000); }
      if (pushed.length) logEv('push', 'Gửi lên Drive: ' + pushed.join(', '));
      PERF.syncs = PERF.syncs.concat([{ t: Date.now(), ms: Date.now() - ts, n: got.length + merged.length + pushed.length }]).slice(-20);
      return IDB.set('meta', clone(meta)).then(maybeBackup);
    }).then(function () { setState({ phase: 'idle', needLogin: false, msg: bad.length ? 'Tệp lỗi trên Drive: ' + bad.join(', ') : '', err: false, bad: bad }); }, function (e) {
      if (e === RETRY) { if (attempt < 3) return doSync(attempt + 1); setState({ phase: 'idle', msg: 'Thiết bị khác đang ghi liên tục — sẽ thử lại.' }); setTimeout(syncNow, 15000); return; }
      var m = String((e && e.message) || e), login = /popup|access_denied|immediate_failed|login|consent|401|Client ID|đăng nhập/i.test(m);
      if (!login) { logEv('error', m); IDB.set('meta', clone(meta)).catch(function () { }); }
      setState({ phase: 'idle', needLogin: login, msg: m, err: !login }); if (!login && !LOCAL) setTimeout(function () { if (Object.keys(meta.dirty).length) syncNow(); }, 30000);
    });
  }
  function resolveConflict() {
    var names = state.conflictNames || [];
    var box = el('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;font:15px system-ui,sans-serif' }, [el('div', { style: 'background:#fff;border-radius:12px;padding:20px;max-width:440px;margin:16px' }, [
      el('h3', { style: 'margin:0 0 8px' }, 'Dữ liệu đã đổi ở thiết bị khác'),
      el('p', null, 'Bảng: ' + names.join(', ') + '. Chọn bản muốn giữ:'),
      el('p', { style: 'color:#6b7280;font-size:13px' }, 'Nên chọn “Lấy bản trên Drive” nếu bạn vừa sửa ở máy khác. Các thay đổi chưa lưu ở máy này sẽ mất.'),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
        el('button', { style: 'padding:8px 14px;border-radius:8px;border:0;background:#2563eb;color:#fff;cursor:pointer', onclick: function () { names.forEach(function (n) { delete meta.dirty[n]; delete meta.versions[n]; }); state.conflict = false; box.remove(); syncNow(); } }, 'Lấy bản trên Drive'),
        el('button', { style: 'padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer', onclick: function () { names.forEach(function (n) { if (meta.versions[n]) meta.versions[n].version = '*'; }); Drive.list().then(function (rm) { rm.forEach(function (x) { var n = x.name.replace(/\.json$/, ''); if (names.indexOf(n) >= 0) meta.versions[n] = { id: x.id, version: x.version }; }); state.conflict = false; box.remove(); syncNow(); }); } }, 'Ghi đè bằng bản máy này'),
        el('button', { style: 'padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer', onclick: function () { box.remove(); } }, 'Để sau')])])]);
    document.body.appendChild(box);
  }

  /* ---------- Sao lưu ---------- */
  /* Bản sao lưu được chụp NGAY lúc gọi (không phải lúc tải lên), giữ 30 bản mới nhất trong thư mục "HA TO/Sao lưu". */
  function stamp() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH-mm'); }
  function backupNow(name) {
    var snap = clone(wb.snapshot());
    return signIn(false).then(function () { return Drive.init(); }).then(function () { return Drive.backup(name, snap); }).then(function () { return Drive.pruneBackups(30); })
      .then(function () { meta.lastBackup = Date.now(); logEv('backup', name); return IDB.set('meta', clone(meta)); })
      .catch(function (e) { logEv('error', 'Sao lưu lỗi: ' + e.message); setState({ msg: 'Sao lưu lỗi: ' + e.message }); throw e; });
  }
  function queueBackup(name) { return backupNow(name).catch(function () { }); }
  function checkSnapshot(sn) {
    if (!sn || typeof sn !== 'object' || !sn.sheets || typeof sn.sheets !== 'object') return 'Tệp sao lưu không đúng cấu trúc.';
    var ns = Object.keys(sn.sheets); if (!ns.length) return 'Tệp sao lưu không có bảng nào.';
    for (var i = 0; i < ns.length; i++) { var r = sn.sheets[ns[i]]; if (!Array.isArray(r) || r.some(function (x) { return !Array.isArray(x); })) return 'Bảng ' + ns[i] + ' trong tệp sao lưu bị lỗi.'; }
    if (!sn.sheets.PROJECTS && !sn.sheets.CUSTOMERS) return 'Tệp không phải bản sao lưu HA TO.';
    return '';
  }
  function listBackups() { return signIn(false).then(function () { return Drive.init(); }).then(function () { return Drive.listBackups(); }); }
  function restoreBackup(id, name) {
    var sn;
    return Drive.read(id).then(function (x) { sn = x; var e = checkSnapshot(sn); if (e) throw new Error(e); })
      .then(function () { return backupNow('HA TO trước khi khôi phục ' + stamp() + '.json'); })          // giữ lại dữ liệu hiện tại trước đã
      .then(function () {
        var counters = wb.sheets.COUNTERS ? wb.sheets.COUNTERS.exportRows() : null;
        wb.load({ sheets: sn.sheets, props: sn.props || {} }); env.resetCache();
        if (counters && wb.sheets.COUNTERS) wb.sheets.COUNTERS.g = mergeRows('COUNTERS', null, wb.sheets.COUNTERS.exportRows(), counters);   // giữ số thứ tự lớn nhất để không cấp trùng số chứng từ
        Object.keys(wb.sheets).forEach(function (n) { meta.dirty[n] = 1; }); meta.dirty._props = 1;
        logEv('restore', 'Khôi phục từ ' + name);
        return persistLocal(Object.keys(wb.sheets).concat(['_props']));
      }).then(function () { return syncNow(); });
  }
  function maybeBackup() {
    if (Date.now() - (meta.lastBackup || 0) < 24 * 3600e3 || !Object.keys(wb.sheets).length) return Promise.resolve();
    queueBackup('HA TO sao lưu ' + stamp() + '.json'); return Promise.resolve();
  }

  /* ---------- Tệp đính kèm: Code.gs "tạo file" giả → tải lên Drive thật rồi thay đường dẫn ---------- */
  window.__hatoTrash = function (id) { if (/^pending-/.test(id)) return; Drive.trash(id); };
  function flushUploads(res) {
    var jobs = env.pending.splice(0); if (!jobs.length) return Promise.resolve(res);
    return Drive.init().then(function () {
      return Promise.all(jobs.map(function (jb) { return (jb.blob.bigKey && window.__hatoBig && window.__hatoBig[jb.blob.bigKey] ? Drive.uploadBig(jb.path, window.__hatoBig[jb.blob.bigKey]) : Drive.upload(jb.path, jb.blob)).then(function (r) { return [jb.token, r.url]; }); }));
    }).then(function (pairs) {
      var map = {}; pairs.forEach(function (p) { map[p[0]] = p[1]; });
      var cols = TABLES.FILES, ui = cols.indexOf('url'), sh = wb.sheets.FILES;
      if (sh) sh.g.forEach(function (row) { if (row && map[row[ui]]) row[ui] = map[row[ui]]; });
      wb.touch('FILES'); if (res && res.data && map[res.data.url]) res.data.url = map[res.data.url];
      return res;
    }, function (e) {
      if (res && res.ok && res.data && res.data.id) { try { RT = {}; ACTIONS.remove({ email: env.email, role: 'ADMIN' }, { table: 'files', id: res.data.id }); } catch (x) { } }
      throw new Error('Không tải được file lên Drive: ' + e.message);
    });
  }

  /* ---------- Cầu nối google.script.run ---------- */
  var readyResolve, readyP = new Promise(function (r) { readyResolve = r; }), isReady = false;
  function Runner(ok, fail) { this.ok = ok; this.fail = fail; }
  Runner.prototype.withSuccessHandler = function (f) { return new Runner(f, this.fail); };
  Runner.prototype.withFailureHandler = function (f) { return new Runner(this.ok, f); };
  Runner.prototype.api = function (action, payload) {
    var self = this;
    readyP.then(function () {
      var res = clone(api(action, clone(payload) || {})); afterApi();
      return flushUploads(res).then(function (r) { afterApi(); return r; });
    }).then(function (r) { if (self.ok) self.ok(clone(r)); }, function (e) { if (self.fail) self.fail(e); });
  };
  function attachScript() { window.google = window.google || {}; if (!window.google.script) window.google.script = { run: new Runner(null, null) }; }
  attachScript(); setInterval(attachScript, 500);

  /* ---------- Màn hình khởi động / đăng nhập ---------- */
  var gate = null;
  function showGate(content) {
    if (!gate) { gate = el('div', { id: 'hato-gate', style: 'position:fixed;inset:0;background:#0f1b3d;z-index:10001;display:flex;align-items:center;justify-content:center;font:15px system-ui,sans-serif;color:#111' }); document.body.appendChild(gate); }
    gate.innerHTML = ''; gate.appendChild(el('div', { style: 'background:#fff;border-radius:14px;padding:26px;max-width:420px;width:calc(100% - 32px);text-align:center' }, content));
  }
  function hideGate() { if (gate) { gate.remove(); gate = null; } }
  var BTN = 'padding:11px 18px;border-radius:9px;border:0;background:#e11d48;color:#fff;font-size:15px;cursor:pointer;width:100%;margin-top:12px';
  function askClientId() {
    var inp = el('input', { placeholder: 'xxxxxxxx.apps.googleusercontent.com', style: 'width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-top:10px;box-sizing:border-box' });
    showGate([el('h2', { style: 'margin:0 0 6px' }, 'HA TO'), el('p', { style: 'color:#6b7280;margin:0' }, 'Dán Client ID Google của bạn (làm một lần, xem HUONG_DAN.md).'), inp,
      el('button', { style: BTN, onclick: function () { var v = inp.value.trim(); if (!/\.apps\.googleusercontent\.com$/.test(v)) { inp.style.borderColor = '#dc2626'; return; } localStorage.setItem('hato_client_id', v); CLIENT_ID = v; boot(); } }, 'Lưu và tiếp tục')]);
  }
  function askLogin(msg) {
    showGate([el('h2', { style: 'margin:0 0 6px' }, 'HA TO'), el('p', { style: 'color:#6b7280;margin:0' }, 'Đăng nhập Google để mở dữ liệu trên Drive của bạn.'), msg ? el('p', { style: 'color:#dc2626;font-size:13px' }, msg) : '',
      el('button', { style: BTN, onclick: function () { showGate([el('p', null, 'Đang đăng nhập…')]); firstLoad(true); } }, 'Đăng nhập Google')]);
  }
  function firstLoad(interactive) {
    signIn(interactive).then(function () { showGate([el('p', null, 'Đang tải dữ liệu từ Drive…')]); return Drive.init(); }).then(function () { return Drive.list(); }).then(function (remote) {
      return Promise.all(remote.map(function (x) { var n = x.name.replace(/\.json$/, ''); return readChecked(n, x.id).catch(function (e) { throw new Error('Tệp ' + x.name + ' trên Drive ' + e.message + '. Hãy khôi phục từ thư mục "HA TO/Sao lưu".'); }).then(function (p) { applyPayload(n, p); meta.versions[n] = { id: x.id, version: x.version }; return saveBase(n, p).then(function () { return n; }); }); }));
    }).then(function (names) { return persistLocal(names); }).then(function () { PERF.firstLoad = Math.round(performance.now() - T0); start(); }).catch(function (e) { askLogin('Không đăng nhập được: ' + e.message); });
  }
  function start() {
    var from = wb.props && wb.props.SCHEMA, to = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '';
    if (from && to && from !== to) {                 // bản mới sẽ thêm cột / đổi cấu trúc: chụp dữ liệu cũ trước (lưu cả trong máy lẫn trên Drive)
      var snap = clone(wb.snapshot()); IDB.set('preupgrade', { from: from, to: to, t: Date.now(), snap: snap }).catch(function () { });
      logEv('backup', 'Chụp dữ liệu trước nâng cấp ' + from + ' → ' + to);
      signIn(false).then(function () { return Drive.init(); }).then(function () { return Drive.backup('HA TO trước nâng cấp ' + from + ' sang ' + to + ' ' + stamp() + '.json', snap); }).catch(function () { });
    }
    isReady = true; hideGate(); readyResolve(); drawChip(); syncNow();
    PERF.ready = Math.round(performance.now() - T0);
  }
  function perfInfo() {               // dung lượng từng bảng + thời gian mở app / đồng bộ
    var sizes = Object.keys(wb.sheets).map(function (n) { var len = 0; try { len = JSON.stringify(wb.sheets[n].exportRows()).length; } catch (e) { } return { name: n, bytes: len, rows: Math.max(0, wb.sheets[n].exportRows().length - 1) }; }).sort(function (a, b) { return b.bytes - a.bytes; });
    return { ready: PERF.ready, firstLoad: PERF.firstLoad || 0, syncs: PERF.syncs.slice(), sizes: sizes, total: sizes.reduce(function (s, x) { return s + x.bytes; }, 0) };
  }
  function boot() {
    if (!LOCAL && !CLIENT_ID) return askClientId();
    loadLocal().then(function (has) {
      if (has) { start(); return; }
      if (LOCAL || token.v) return firstLoad(false);
      askLogin(authErr);
    });
  }
  window.addEventListener('beforeunload', function (e) { if (!window.__redirecting && Object.keys(meta.dirty).length && !state.needLogin) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('online', function () { syncNow(); });
  window.addEventListener('offline', function () { drawChip(); });
  /* Đăng xuất: xóa token và toàn bộ dữ liệu trong máy (dữ liệu vẫn nằm trên Drive). Không cho đăng xuất khi còn dữ liệu chưa gửi lên Drive. */
  function signOut() {
    var nd = Object.keys(meta.dirty).length;
    if (nd && !LOCAL) return Promise.reject(new Error('Còn ' + nd + ' bảng chưa gửi lên Drive. Hãy đồng bộ xong rồi mới đăng xuất.'));
    var t = token.v; token = { v: '', exp: 0 };
    ['hato_token', 'hato_email'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { } });
    if (t && !LOCAL) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(function () { });
    window.__redirecting = true;
    return new Promise(function (res) { var r = indexedDB.deleteDatabase(LOCAL ? 'hato_local' : 'hato_app'); r.onsuccess = r.onerror = r.onblocked = function () { res(); }; }).then(function () { location.replace(location.pathname + location.search); });
  }
  setInterval(function () { if (isReady && document.visibilityState === 'visible' && !LOCAL) syncNow(); }, 60000);     // tự lấy thay đổi từ thiết bị khác
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && isReady) syncNow(); });
  if (LOCAL) window.__hatoDrive = Drive;      // chỉ chế độ thử: để kiểm tra gộp dữ liệu giữa hai "thiết bị"
  /* Xử lý bảng có tệp lỗi trên Drive: dùng bản trên Drive (kể cả rỗng) hoặc ghi bản máy này đè lên */
  function useRemote(n) { acceptEmpty[n] = 1; delete meta.versions[n]; delete meta.dirty[n]; logEv('restore', 'Chọn dùng bản trên Drive cho ' + n); return syncNow(); }
  function useLocal(n) {
    return Drive.init().then(function () { return Drive.list(); }).then(function (rm) {
      rm.forEach(function (x) { if (x.name === FILE(n)) meta.versions[n] = { id: x.id, version: x.version }; });
      meta.dirty[n] = 1; logEv('restore', 'Chọn ghi bản máy này lên Drive cho ' + n); return syncNow();
    });
  }
  /* File gốc của khách (nhập Excel): lưu lên Drive + giữ một bản trong máy để dùng khi mất mạng / xuất ngược nhanh */
  function putFile(key, file, segs) {
    return file.arrayBuffer().then(function (ab) {
      return IDB.set('file:' + key, { name: file.name, type: file.type, bin: ab }).then(function () {
        return signIn(false).then(function () { return Drive.init(); }).then(function () { return Drive.putBlob([ROOT_NAME].concat(segs || []), file.name, new Blob([ab], { type: file.type || 'application/octet-stream' })); })
          .then(function (r) { logEv('push', 'Tải file lên Drive: ' + file.name); return r; }, function (e) { logEv('error', 'Chưa tải được file ' + file.name + ' lên Drive: ' + e.message + ' (vẫn giữ trong máy)'); return { id: '', url: '', err: e.message }; });
      });
    });
  }
  function getFile(key, driveId) {
    return IDB.get('file:' + key).then(function (x) {
      if (x && x.bin) return x.bin;
      if (!driveId) throw new Error('Không tìm thấy file gốc trong máy và chưa có bản trên Drive.');
      return signIn(false).then(function () { return Drive.download(driveId); }).then(function (ab) { IDB.set('file:' + key, { bin: ab }).catch(function () { }); return ab; });
    });
  }
  window.HatoStore = { perf: perfInfo, putFile: putFile, getFile: getFile, useRemote: useRemote, useLocal: useLocal, queueBackup: queueBackup, backupNow: backupNow, listBackups: listBackups, restoreBackup: restoreBackup, signOut: signOut, syncNow: syncNow, meta: function () { return meta; }, state: state, env: env, ready: readyP, signIn: signIn, isLocal: LOCAL,
    importWorkbook: function (snap) { wb.load(snap); env.resetCache(); Object.keys(wb.sheets).forEach(function (n) { meta.dirty[n] = 1; }); meta.dirty._props = 1; return persistLocal(Object.keys(wb.sheets).concat(['_props'])).then(function () { return syncNow(); }); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if ('serviceWorker' in navigator && !LOCAL) {
    var hadCtl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(function (reg) { setInterval(function () { reg.update().catch(function () { }); }, 30 * 60e3); }).catch(function () { });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadCtl) showUpdate(); hadCtl = true; });
  }
  function showUpdate() {                           // bản mới đã tải xong ngầm: mời tải lại (không tự tải lại để khỏi mất dữ liệu đang nhập)
    if (document.getElementById('hato-upd')) return;
    var b = el('div', { id: 'hato-upd', style: 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:10002;background:#0f1b3d;color:#fff;border-radius:10px;padding:9px 14px;font:14px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center' }, [
      el('span', null, '✨ Đã có bản HA TO mới'),
      el('button', { style: 'border:0;background:#e11d48;color:#fff;border-radius:6px;padding:5px 12px;cursor:pointer', onclick: function () { if (window.ACTIVE_DRAFTS) ACTIVE_DRAFTS.forEach(function (c) { try { c.flush(); } catch (e) { } }); location.reload(); } }, 'Tải lại'),
      el('button', { style: 'border:0;background:transparent;color:#cbd5e1;cursor:pointer', onclick: function () { b.remove(); } }, 'Để sau')]);
    document.body.appendChild(b);
  }
  window.__hatoShowUpdate = showUpdate;
})();
