/* ============================================================================
 * shim.js — giả lập các dịch vụ Google Apps Script để chạy NGUYÊN code.js (Code.gs) trong trình duyệt.
 * Dữ liệu = các "trang tính" nằm trong bộ nhớ (mảng 2 chiều), có đánh dấu bảng nào đã đổi để store.js ghi lên Drive.
 * Dùng được cả trong trình duyệt (window) lẫn Node (kiểm thử).
 * ========================================================================== */
(function (root) {
  'use strict';
  var enc = new TextEncoder(), dec = new TextDecoder();

  function b64enc(bytes) {
    if (typeof bytes === 'string') bytes = enc.encode(bytes);
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + CH).map(function (b) { return b & 255; }));
    return btoa(s);
  }
  function b64dec(s) {
    var bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function toBytes(d) { return typeof d === 'string' ? enc.encode(d) : (d instanceof Uint8Array ? d : Uint8Array.from(d, function (b) { return b & 255; })); }

  /* ---- Blob ---- */
  function Blob_(data, mime, name) { this.data = toBytes(data); this.mime = mime || 'application/octet-stream'; this.name = name || ''; }
  Blob_.prototype.getBytes = function () { return this.data; };
  Blob_.prototype.getDataAsString = function () { return dec.decode(this.data); };
  Blob_.prototype.getContentType = function () { return this.mime; };
  Blob_.prototype.getName = function () { return this.name; };
  Blob_.prototype.setName = function (n) { this.name = n; return this; };
  Blob_.prototype.getAs = function (type) { if (/pdf/.test(type)) throw new Error('Bản này tạo PDF bằng nút In của trình duyệt.'); return new Blob_(this.data, type, this.name); };

  /* ---- Utilities ---- */
  var TZ_OFFSET = 7 * 3600e3;                     // Asia/Ho_Chi_Minh, không có giờ mùa hè
  function pad(n, w) { return String(n).padStart(w || 2, '0'); }
  function cyrb(str) {                            // băm 128 bit đơn giản (chỉ dùng làm khoá bộ nhớ, không cần MD5 thật)
    var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (var i = 0, k; i < str.length; i++) { k = str.charCodeAt(i); h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233); h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179); }
    var o = [], hs = [h1, h2, h3, h4]; hs.forEach(function (x) { for (var j = 0; j < 4; j++) o.push((x >>> (j * 8)) & 255); }); return o;
  }
  var Utilities = {
    DigestAlgorithm: { MD5: 'MD5' },
    formatDate: function (d, tz, f) {
      var t = new Date(d.getTime() + TZ_OFFSET), m = { yyyy: t.getUTCFullYear(), MM: pad(t.getUTCMonth() + 1), dd: pad(t.getUTCDate()), HH: pad(t.getUTCHours()), mm: pad(t.getUTCMinutes()), ss: pad(t.getUTCSeconds()), H: t.getUTCHours(), u: t.getUTCDay() === 0 ? 7 : t.getUTCDay() };
      return f.replace(/yyyy|MM|dd|HH|mm|ss|H|u/g, function (x) { return m[x]; });
    },
    getUuid: function () { return (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); },
    newBlob: function (d, m, n) { return new Blob_(d, m, n); },
    gzip: function (b) { return new Blob_(b.getBytes(), 'application/x-gzip', 'c.gz'); },     // không nén: dữ liệu nằm sẵn trong bộ nhớ
    ungzip: function (b) { return new Blob_(b.getBytes(), 'application/octet-stream', 'c'); },
    base64Encode: b64enc, base64Decode: b64dec,
    base64EncodeWebSafe: function (b) { return b64enc(b).replace(/\+/g, '-').replace(/\//g, '_'); },
    computeDigest: function (alg, v) { return cyrb(typeof v === 'string' ? v : dec.decode(toBytes(v))); }
  };

  /* ---- Bảng tính trong bộ nhớ ---- */
  function Workbook() { this.sheets = {}; this.props = {}; this.dirty = {}; this.onChange = null; this.failNextSet = null; }
  Workbook.prototype.touch = function (name) { this.dirty[name] = true; if (this.onChange) this.onChange(name); };
  Workbook.prototype.load = function (snap) {                     // snap: { sheets:{name:[[...]]}, props:{} }
    var self = this; this.sheets = {};
    Object.keys(snap.sheets || {}).forEach(function (n) { var s = new Sheet(self, n); s.g = snap.sheets[n]; s.max = Math.max(1000, s.g.length + 200); self.sheets[n] = s; });
    this.props = snap.props || {}; this.dirty = {};
  };
  Workbook.prototype.addSheet = function (name, rows) { var s = new Sheet(this, name); s.g = rows || []; s.max = Math.max(1000, s.g.length + 200); this.sheets[name] = s; return s; };
  Workbook.prototype.snapshot = function () {
    var o = { sheets: {}, props: this.props }, self = this;
    Object.keys(this.sheets).forEach(function (n) { o.sheets[n] = self.sheets[n].exportRows(); });
    return o;
  };

  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  Range.prototype.getValues = function () {
    var o = [], g = this.sh.g;
    for (var i = 0; i < this.nr; i++) { var src = g[this.r - 1 + i] || [], row = new Array(this.nc); for (var j = 0; j < this.nc; j++) { var v = src[this.c - 1 + j]; row[j] = v === undefined || v === null ? '' : v; } o.push(row); }
    return o;
  };
  Range.prototype.setValues = function (v) {
    var wb = this.sh.wb;
    if (wb.failNextSet === this.sh.name) { wb.failNextSet = null; throw new Error('SIMULATED FAILURE'); }
    var g = this.sh.g;
    for (var i = 0; i < v.length; i++) {
      while (g.length < this.r + i) g.push([]);
      var row = g[this.r - 1 + i];
      for (var j = 0; j < v[i].length; j++) { var x = v[i][j]; row[this.c - 1 + j] = x instanceof Date ? x.toISOString() : x; }
    }
    wb.touch(this.sh.name); return this;
  };
  Range.prototype.setValue = function (x) { return this.setValues([[x]]); };
  Range.prototype.clearContent = function () {
    var g = this.sh.g;
    for (var i = 0; i < this.nr; i++) { var row = g[this.r - 1 + i]; if (row) for (var j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; }
    this.sh.wb.touch(this.sh.name); return this;
  };
  ['setNumberFormat', 'setNumberFormats', 'setFontWeight', 'setBackground', 'setHorizontalAlignment', 'setWrap', 'setFontColor'].forEach(function (m) { Range.prototype[m] = function () { return this; }; });

  function Sheet(wb, name) { this.wb = wb; this.name = name; this.g = []; this.max = 1000; }
  Object.defineProperty(Sheet.prototype, 'failNextSet', { set: function (v) { this.wb.failNextSet = v ? this.name : null; }, get: function () { return this.wb.failNextSet === this.name; } });   // chỉ dùng khi kiểm thử
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr, nc); };
  Sheet.prototype.getLastRow = function () { for (var i = this.g.length - 1; i >= 0; i--) { var row = this.g[i]; if (row) for (var j = 0; j < row.length; j++) if (row[j] !== '' && row[j] != null) return i + 1; } return 0; };
  Sheet.prototype.getLastColumn = function () { var m = 0; for (var i = 0; i < this.g.length; i++) { var row = this.g[i] || []; for (var j = row.length - 1; j >= m; j--) if (row[j] !== '' && row[j] != null) { m = j + 1; break; } } return m; };
  Sheet.prototype.getMaxRows = function () { return this.max; };
  Sheet.prototype.insertRowsAfter = function (a, n) { this.max += n; };
  Sheet.prototype.setFrozenRows = function () { };
  Sheet.prototype.deleteRows = function (a, n) { this.g.splice(a - 1, n); this.wb.touch(this.name); };
  Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };
  Sheet.prototype.exportRows = function () {          // bỏ các dòng/ô trống ở cuối cho gọn file
    var n = this.getLastRow(), out = [];
    for (var i = 0; i < n; i++) { var row = (this.g[i] || []).slice(); while (row.length && (row[row.length - 1] === '' || row[row.length - 1] == null)) row.pop(); out.push(row); }
    return out;
  };

  /* ---- Drive (mô phỏng): file thật được tải lên sau, bởi store.js ---- */
  var PENDING = [];                                    // { token, blob, path:[tên thư mục…] }
  function VFolder(path) { this.path = path; }
  VFolder.prototype.getFoldersByName = function (n) { var p = this.path.concat([n]), ok = false; return { hasNext: function () { var r = !ok; ok = true; return r; }, next: function () { return new VFolder(p); } }; };
  VFolder.prototype.createFolder = function (n) { return new VFolder(this.path.concat([n])); };
  VFolder.prototype.getId = function () { return 'v:' + this.path.join('/'); };
  VFolder.prototype.getName = function () { return this.path[this.path.length - 1] || ''; };
  VFolder.prototype.createFile = function (blob) {
    var token = 'pending-' + Math.random().toString(36).slice(2, 12); PENDING.push({ token: token, blob: blob, path: this.path });
    return { getUrl: function () { return token; }, getId: function () { return token; }, setTrashed: function () { for (var i = PENDING.length - 1; i >= 0; i--) if (PENDING[i].token === token) PENDING.splice(i, 1); } };
  };
  VFolder.prototype.getFiles = function () { return { hasNext: function () { return false; } }; };
  var DriveApp = {
    getFolderById: function (id) { return new VFolder(String(id).indexOf('v:') === 0 ? String(id).slice(2).split('/').filter(Boolean) : []); },
    getFoldersByName: function (n) { return new VFolder([]).getFoldersByName(n); },
    createFolder: function (n) { return new VFolder([n]); },
    getRootFolder: function () { return new VFolder([]); },
    getFileById: function (id) { return { setTrashed: function () { root.__hatoTrash && root.__hatoTrash(id); } }; }
  };

  /* ---- Tạo môi trường ---- */
  function create(opts) {
    opts = opts || {};
    var wb = new Workbook(), mem = {}, cs = {
      get: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      put: function (k, v) { mem[k] = String(v); },
      getAll: function (ks) { var o = {}; ks.forEach(function (k) { if (k in mem) o[k] = mem[k]; }); return o; },
      putAll: function (o) { Object.keys(o).forEach(function (k) { mem[k] = o[k]; }); },
      remove: function (k) { delete mem[k]; }
    };
    var ss = { getSheetByName: function (n) { return wb.sheets[n] || null; }, insertSheet: function (n) { var s = new Sheet(wb, n); wb.sheets[n] = s; wb.touch(n); return s; }, getId: function () { return 'LOCAL'; } };
    var env = {
      email: opts.email || '', wb: wb, pending: PENDING, Utilities: Utilities, Blob: Blob_,
      resetCache: function () { mem = {}; cs = null; },
      globals: null
    };
    var cacheSvc = { getScriptCache: function () { return { get: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }, put: function (k, v) { mem[k] = String(v); }, getAll: cs.getAll, putAll: cs.putAll, remove: function (k) { delete mem[k]; } }; } };
    env.resetCache = function () { mem = {}; };
    env.globals = {
      SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, openById: function () { return ss; } },
      CacheService: cacheSvc,
      PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return Object.prototype.hasOwnProperty.call(wb.props, k) ? wb.props[k] : null; }, setProperty: function (k, v) { wb.props[k] = String(v); wb.touch('_props'); } }; } },
      LockService: { getScriptLock: function () { return { waitLock: function () { }, releaseLock: function () { } }; } },
      Session: { getActiveUser: function () { return { getEmail: function () { return env.email; } }; } },
      Utilities: Utilities, DriveApp: DriveApp, HtmlService: {},
      ScriptApp: { getProjectTriggers: function () { return []; }, newTrigger: function () { var t = { timeBased: function () { return t; }, everyDays: function () { return t; }, atHour: function () { return t; }, everyMinutes: function () { return t; }, create: function () { } }; return t; }, deleteTrigger: function () { } }
    };
    return env;
  }
  root.GasShim = { create: create, Utilities: Utilities, Blob: Blob_ };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GasShim;
})(typeof window !== 'undefined' ? window : globalThis);
