/* Service worker: lưu sẵn khung ứng dụng để mở nhanh và dùng được khi mất mạng. Dữ liệu nằm trong IndexedDB, không qua đây. */
var V = 'hato-814cced1', SHELL = ['./', 'index.html', 'code.js', 'shim.js', 'store.js', 'overrides.js', 'overrides-gas.js', 'xlsx-lite.js', 'tk-parse.js', 'xlsx-write.js', 'migrate.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || /googleapis\.com|accounts\.google\.com|gstatic\.com\/_/.test(u.host + u.pathname) && u.host !== 'cdn.jsdelivr.net') return;   // không đụng vào gọi Google API
  e.respondWith(caches.match(e.request).then(function (hit) {
    var net = fetch(e.request).then(function (r) { if (r && r.ok && (u.origin === location.origin || u.host === 'cdn.jsdelivr.net')) { var cp = r.clone(); caches.open(V).then(function (c) { c.put(e.request, cp); }); } return r; }).catch(function () { return hit; });
    return hit || net;
  }));
});
