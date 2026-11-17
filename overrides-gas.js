/* Nạp SAU code.js: tắt bộ nhớ đệm kiểu Apps Script (dữ liệu đã nằm sẵn trong bộ nhớ trình duyệt nên đọc trực tiếp nhanh hơn) */
function cacheGet_() { return null; }
function cachePut_() { }
/* Sao lưu: ghi 1 file .json lên Drive (thư mục "HA TO/Sao lưu"), giữ 30 bản gần nhất */
function backup_(label) {
  var name = 'HA TO sao lưu ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') + '.json';
  HatoStore.queueBackup(name);
  return { name: name, url: '', label: label };
}
