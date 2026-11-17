/* ============================================================================
 * store.js — đăng nhập Google, lưu dữ liệu lên Drive, bộ nhớ đệm IndexedDB, và cầu nối google.script.run
 * (nhờ cầu nối này toàn bộ giao diện cũ chạy nguyên không sửa).
 * Chế độ thử không cần Google: mở trang với ?local=1 (dữ liệu chỉ nằm trong trình duyệt này).
 * ========================================================================== */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search), LOCAL = Q.get('local') === '1';
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
  var meta = { email: '', versions: {}, dirty: {}, lastBackup: 0, lastSync: 0 };     // versions[name] = { id, version }
  var state = { phase: 'init', msg: '', needLogin: false, conflict: false }, chip;
  function setState(patch) { Object.assign(state, patch); drawChip(); }
  function drawChip() {
    if (!chip) { chip = el('div', { id: 'hato-sync', style: 'position:fixed;left:50%;transform:translateX(-50%);bottom:10px;z-index:9999;font:13px system-ui,sans-serif;background:#fff;border:1px solid #d1d5db;border-radius:999px;padding:6px 12px;box-shadow:0 2px 8px rgba(0,0,0,.12);display:flex;gap:8px;align-items:center;max-width:90vw' }); document.body.appendChild(chip); }
    chip.innerHTML = '';
    var nd = Object.keys(meta.dirty).length, txt, col = '#16a34a';
    if (state.conflict) { txt = '⚠ Dữ liệu trên Drive đã đổi ở thiết bị khác'; col = '#dc2626'; }
    else if (state.needLogin) { txt = '🔒 Chưa đồng bộ — cần đăng nhập Google'; col = '#d97706'; }
    else if (state.phase === 'syncing') { txt = '⏳ Đang đồng bộ…'; col = '#2563eb'; }
    else if (nd) { txt = '⏳ Có ' + nd + ' bảng chưa lưu lên Drive'; col = '#d97706'; }
    else if (LOCAL) { txt = '🧪 Chế độ thử (chỉ lưu trong trình duyệt)'; col = '#7c3aed'; }
    else { txt = '☁ Đã lưu lên Drive'; }
    chip.style.color = col; chip.appendChild(document.createTextNode(txt));
    if (state.needLogin) chip.appendChild(el('button', { style: 'border:0;background:#2563eb;color:#fff;border-radius:6px;padding:3px 10px;cursor:pointer', onclick: function () { signIn(true).then(function () { return syncNow(); }); } }, 'Đăng nhập'));
    if (state.conflict) chip.appendChild(el('button', { style: 'border:0;background:#dc2626;color:#fff;border-radius:6px;padding:3px 10px;cursor:pointer', onclick: resolveConflict }, 'Xử lý'));
    chip.title = state.msg || 'Bấm để mở menu dữ liệu'; chip.style.cursor = 'pointer'; chip.onclick = function (e) { if (e.target.tagName !== 'BUTTON' && window.HatoMigrate) HatoMigrate.openMenu(); };
  }

  /* ---------- Ổ đĩa: Google Drive thật hoặc giả lập trong trình duyệt (?local=1) ---------- */
  var token = { v: '', exp: 0 }, tokenClient = null;
  function loadGsi() { return new Promise(function (res, rej) { if (window.google && google.accounts && google.accounts.oauth2) return res(); var s = el('script', { src: 'https://accounts.google.com/gsi/client' }); s.onload = function () { res(); }; s.onerror = function () { rej(new Error('Không tải được thư viện đăng nhập Google (kiểm tra mạng).')); }; document.head.appendChild(s); }); }
  function signIn(interactive) {
    if (LOCAL) { token = { v: 'local', exp: Date.now() + 3e9 }; if (!env.email) { env.email = meta.email = 'local@hato'; } return Promise.resolve(env.email); }
    if (token.v && token.exp - 60000 > Date.now()) return Promise.resolve(meta.email);
    if (!CLIENT_ID) return Promise.reject(new Error('Chưa có Client ID Google.'));
    return loadGsi().then(function () {
      return new Promise(function (res, rej) {
        tokenClient = tokenClient || google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: function () { } });
        tokenClient.callback = function (r) { if (r.error) return rej(new Error(r.error)); token = { v: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 }; res(); };
        tokenClient.error_callback = function (e) { rej(new Error((e && e.type) || 'popup')); };
        var hint = localStorage.getItem('hato_email') || '';
        tokenClient.requestAccessToken({ prompt: interactive && !hint ? 'consent' : '', hint: hint || undefined });
      });
    }).then(function () {
      return fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token.v } }).then(function (r) { return r.json(); }).then(function (u) {
        if (!u.email) throw new Error('Không lấy được email Google.');
        meta.email = u.email; env.email = u.email; localStorage.setItem('hato_email', u.email); setState({ needLogin: false }); return u.email;
      });
    });
  }

  var Drive = (function () {
    if (LOCAL) {                                     // giả lập: mỗi "file" là một khoá trong IndexedDB
      var mem = null, ver = 0;
      function all() { return mem ? Promise.resolve(mem) : IDB.get('localdrive').then(function (m) { mem = m || { files: {}, n: 0 }; return mem; }); }
      function save() { return IDB.set('localdrive', mem); }
      return {
        init: function () { return all().then(function () { return 'local'; }); },
        list: function () { return all().then(function (m) { return Object.keys(m.files).filter(function (k) { return k.indexOf('data/') === 0; }).map(function (k) { return { id: k, name: k.slice(5), version: String(m.files[k].v) }; }); }); },
        read: function (id) { return all().then(function (m) { return JSON.parse(m.files[id].text); }); },
        write: function (name, obj, existing) { return all().then(function (m) { var id = existing || ('data/' + name); m.files[id] = { text: JSON.stringify(obj), v: (m.files[id] ? m.files[id].v : 0) + 1 }; return save().then(function () { return { id: id, version: String(m.files[id].v) }; }); }); },
        upload: function (path, blob) { return all().then(function (m) { m.n++; var id = 'files/' + m.n + '/' + blob.getName(); m.files[id] = { text: '(tệp thử)', v: 1 }; return save().then(function () { return { id: id, url: 'https://local.invalid/' + encodeURIComponent(id) }; }); }); },
        trash: function () { return Promise.resolve(); }, backup: function (name, obj) { return all().then(function (m) { m.files['backup/' + name] = { text: JSON.stringify(obj), v: 1 }; return save(); }); }, pruneBackups: function () { return Promise.resolve(); }
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
      write: function (name, obj, existing) { return multipart(existing ? {} : { name: name, parents: [dataFolder], mimeType: 'application/json' }, JSON.stringify(obj), 'application/json', existing).then(function (r) { return { id: r.id, version: String(r.version) }; }); },
      upload: function (path, blob) {
        var segs = path.slice(); if (segs[0] === 'HATO ERP') segs[0] = ROOT_NAME;
        return ensurePath(segs).then(function (par) { return multipart({ name: blob.getName(), parents: [par] }, new Blob([blob.getBytes()], { type: blob.getContentType() }), blob.getContentType() || 'application/octet-stream'); }).then(function (r) { return { id: r.id, url: r.webViewLink || ('https://drive.google.com/file/d/' + r.id + '/view') }; });
      },
      trash: function (id) { return j(API + 'files/' + id + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }).catch(function () { }); },
      backup: function (name, obj) { return ensurePath([ROOT_NAME, BACKUP_NAME]).then(function (par) { return multipart({ name: name, parents: [par], mimeType: 'application/json' }, JSON.stringify(obj), 'application/json'); }); },
      pruneBackups: function (keep) {
        return ensurePath([ROOT_NAME, BACKUP_NAME]).then(function (par) { return j(API + 'files?q=' + q("'" + par + "' in parents and trashed=false") + '&orderBy=name desc&fields=files(id,name)&pageSize=200'); }).then(function (r) { return Promise.all((r.files || []).slice(keep).map(function (x) { return Drive.trash(x.id); })); }).catch(function () { });
      }
    };
  })();

  /* ---------- Lưu / nạp dữ liệu ---------- */
  var FILE = function (n) { return n + '.json'; };
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
  function doSync() {
    if (state.conflict) return Promise.resolve();
    setState({ phase: 'syncing' });
    return signIn(false).then(function () { return Drive.init(); }).then(function () { return Drive.list(); }).then(function (remote) {
      var byName = {}; remote.forEach(function (x) { byName[x.name] = x; });
      var pulled = false, conflicts = [];
      remote.forEach(function (x) {
        var n = x.name.replace(/\.json$/, ''), known = meta.versions[n];
        if (known && known.version === x.version && known.id === x.id) return;           // không đổi
        if (meta.dirty[n]) { if (!known || known.version !== x.version) conflicts.push(n); return; }
        x._pull = n;
      });
      if (conflicts.length) { state.conflictNames = conflicts; setState({ conflict: true, phase: 'idle', msg: 'Bảng: ' + conflicts.join(', ') }); return null; }
      var pulls = remote.filter(function (x) { return x._pull; });
      return Promise.all(pulls.map(function (x) { return Drive.read(x.id).then(function (p) { applyPayload(x._pull, p); meta.versions[x._pull] = { id: x.id, version: x.version }; pulled = true; return persistLocal([x._pull]); }); })).then(function () {
        if (pulled) { env.resetCache(); try { if (typeof softRefresh === 'function') softRefresh(); } catch (e) { } }
        var names = Object.keys(meta.dirty).filter(function (n) { return n === '_props' || wb.sheets[n]; });
        return names.reduce(function (p, n) {
          return p.then(function () { var k = meta.versions[n]; return Drive.write(FILE(n), sheetPayload(n), k && k.id).then(function (r) { meta.versions[n] = r; delete meta.dirty[n]; return IDB.set('meta', clone(meta)); }); });
        }, Promise.resolve());
      }).then(function () { meta.lastSync = Date.now(); return maybeBackup(); });
    }).then(function () { setState({ phase: 'idle', needLogin: false, msg: '' }); }, function (e) {
      var m = String((e && e.message) || e), login = /popup|access_denied|immediate_failed|login|consent|401|Client ID|đăng nhập/i.test(m);
      setState({ phase: 'idle', needLogin: login, msg: m }); if (!login && !LOCAL) setTimeout(function () { if (Object.keys(meta.dirty).length) syncNow(); }, 30000);
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
  var backups = [];
  function queueBackup(name) { backups.push(name); setTimeout(runBackups, 50); }
  function runBackups() {
    if (!backups.length) return;
    var name = backups.shift(), snap = wb.snapshot();
    signIn(false).then(function () { return Drive.init(); }).then(function () { return Drive.backup(name, snap); }).then(function () { return Drive.pruneBackups(30); }).then(function () { meta.lastBackup = Date.now(); return IDB.set('meta', clone(meta)); }).catch(function (e) { setState({ msg: 'Sao lưu lỗi: ' + e.message }); });
  }
  function maybeBackup() {
    if (Date.now() - (meta.lastBackup || 0) < 24 * 3600e3 || !Object.keys(wb.sheets).length) return Promise.resolve();
    var name = 'HA TO sao lưu ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm') + '.json'; queueBackup(name); return Promise.resolve();
  }

  /* ---------- Tệp đính kèm: Code.gs "tạo file" giả → tải lên Drive thật rồi thay đường dẫn ---------- */
  window.__hatoTrash = function (id) { if (/^pending-/.test(id)) return; Drive.trash(id); };
  function flushUploads(res) {
    var jobs = env.pending.splice(0); if (!jobs.length) return Promise.resolve(res);
    return Drive.init().then(function () {
      return Promise.all(jobs.map(function (jb) { return Drive.upload(jb.path, jb.blob).then(function (r) { return [jb.token, r.url]; }); }));
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
      return Promise.all(remote.map(function (x) { return Drive.read(x.id).then(function (p) { var n = x.name.replace(/\.json$/, ''); applyPayload(n, p); meta.versions[n] = { id: x.id, version: x.version }; return n; }); }));
    }).then(function (names) { return persistLocal(names); }).then(function () { start(); }).catch(function (e) { askLogin(e.message === 'popup_closed' ? '' : 'Không đăng nhập được: ' + e.message); });
  }
  function start() { isReady = true; hideGate(); readyResolve(); drawChip(); syncNow(); }
  function boot() {
    if (!LOCAL && !CLIENT_ID) return askClientId();
    loadLocal().then(function (has) {
      if (has) { start(); return; }
      if (LOCAL) return firstLoad(false);
      askLogin('');
    });
  }
  window.addEventListener('beforeunload', function (e) { if (Object.keys(meta.dirty).length && !state.needLogin) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('online', function () { syncNow(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && isReady) syncNow(); });
  window.HatoStore = { queueBackup: queueBackup, syncNow: syncNow, meta: function () { return meta; }, state: state, env: env, ready: readyP, signIn: signIn,
    importWorkbook: function (snap) { wb.load(snap); env.resetCache(); Object.keys(wb.sheets).forEach(function (n) { meta.dirty[n] = 1; }); meta.dirty._props = 1; return persistLocal(Object.keys(wb.sheets).concat(['_props'])).then(function () { return syncNow(); }); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if ('serviceWorker' in navigator && !LOCAL) navigator.serviceWorker.register('sw.js').catch(function () { });
})();
