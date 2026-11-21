// Bản 24: VAT theo từng dòng (8% / 10%, làm tròn từng dòng) · lưu trữ dự án · giữ sao lưu 30 bản + 1 bản/tháng · gửi Drive khi ẩn app
const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 500)); } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty Kiểm thử VAT' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'Nhà xưởng VAT', customer_id: cu.id, status: 'Đang chào giá' } })).data;

  console.log('— Báo giá: VAT theo dòng, làm tròn từng dòng');
  // Bình: 3 × 333.333 = 999.999 · VAT 10% = 99.999,9 → 100.000 ; Ống: 7 × 12.345 = 86.415 · VAT 8% = 6.913,2 → 6.913
  const items = [{ name: 'Bình 8kg', unit: 'Bình', qty: 3, price: 333333, cost: 200000 }, { name: 'Ống thép', unit: 'm', qty: 7, price: 12345, cost: 9000, vat_line: 8 }];
  let r = await A('save', { table: 'quotes', rec: { project_id: pj.id, vat_pct: 10 }, items });
  T('lưu báo giá 2 mức VAT', r.ok, r);
  const q = r.data.quote;
  let ql = (await A('list', { table: 'quotes', project_id: pj.id })).data.find(x => x.id === q.id);
  T('cộng tiền hàng 1.086.414', ql.sub === 1086414, ql.sub);
  T('VAT = 100.000 + 6.913 = 106.913 (làm tròn từng dòng)', ql.vat === 106913, ql.vat);
  T('tổng có VAT 1.193.327', ql.total === 1193327, ql.total);
  T('VAT dòng ngoài 0–20% → chặn', !(await A('save', { table: 'quotes', rec: { project_id: pj.id, vat_pct: 10 }, items: [{ name: 'X', unit: 'c', qty: 1, price: 1, vat_line: 25 }] })).ok);
  let ex = await A('export', { kind: 'quote', id: q.id, format: 'html' });
  T('in báo giá: có dòng "Thuế GTGT 8%" và "Thuế GTGT 10%"', ex.ok && /GTGT 8%/.test(ex.data.html) && /GTGT 10%/.test(ex.data.html), ex.ok ? '' : ex);

  console.log('— Chuyển HĐ, phụ lục, giao hàng');
  const hd = (await A('convertQuote', { quote_id: q.id, type: 'HD' })).data.doc;
  const hit = (await A('get', { table: 'docs', id: hd.id })).data.items;
  const ong = hit.find(x => /Ống/.test(x.name)), binh = hit.find(x => /Bình/.test(x.name));
  T('HĐ giữ VAT từng dòng (Bình 10, Ống 8)', num(binh.vat_line) === 10 && num(ong.vat_line) === 8, [binh.vat_line, ong.vat_line]);
  let dl = (await A('list', { table: 'docs', project_id: pj.id })).data.find(x => x.id === hd.id);
  T('danh sách HĐ: tổng có VAT 1.193.327', dl.total === 1193327, dl.total);
  // Phụ lục tăng Ống lên 17 m (không ghi VAT dòng → giữ 8% của HĐ): 17 × 12.345 = 209.865 · VAT 16.789,2 → 16.789
  r = await A('save', { table: 'docs', rec: { type: 'PLHD', project_id: pj.id, sign_date: '2026-11-05', status: 'DA_KY' }, items: [{ ref_item_id: ong.id, name: ong.name, unit: ong.unit, qty: 17, price: 12345, cost: 9000 }] });
  T('phụ lục đã ký', r.ok, r);
  dl = (await A('list', { table: 'docs', project_id: pj.id })).data.find(x => x.id === hd.id);
  T('HĐ sau phụ lục: 999.999 + 100.000 + 209.865 + 16.789 = 1.326.653', dl.total === 1326653, dl.total);
  r = await A('save', { table: 'deliveries', rec: { project_id: pj.id, date: '2026-11-10', status: 'DA_GIAO' }, items: [{ doc_id: hd.id, doc_item_id: binh.id, name: binh.name, unit: binh.unit, qty: 3 }, { doc_id: hd.id, doc_item_id: ong.id, name: ong.name, unit: ong.unit, qty: 7 }] });
  T('giao hàng', r.ok, r);
  let sm = (await A('projectBundle', { id: pj.id })).data;
  T('doanh thu có VAT theo hàng đã giao = 1.193.327', sm.summary.revenue_vat === 1193327, sm.summary.revenue_vat);
  T('còn phải thu = 1.193.327', sm.money ? Math.round(sm.summary.revenue_vat - sm.money.paid) === 1193327 : false, sm.money);
  ex = await A('export', { kind: 'hd', id: hd.id, format: 'html' });
  T('in HĐ: tách VAT 8% và VAT 10%', ex.ok && /VAT 8%/.test(ex.data.html) && /VAT 10%/.test(ex.data.html), ex.ok ? '' : ex);

  console.log('— Giao diện báo giá');
  await E('reloadLookups()'); await sleep(300); await E(`MEMO={};location.hash='#/quote/${q.id}'`); await sleep(1800);
  const foot = await E(`document.querySelector('#view').textContent`);
  T('chân bảng tách Thuế GTGT 8% và 10%', /GTGT 8%/.test(foot) && /GTGT 10%/.test(foot), foot.slice(0, 300));
  T('có cột "VAT %" từng dòng', await E(`[...document.querySelectorAll('#view th')].some(t=>t.textContent.trim()==='VAT %')`));
  await pg.shot('/tmp/s24_quote.png');

  console.log('— Lưu trữ dự án');
  await E(`reloadLookups()`); await sleep(300);
  r = await A('projectArchive', { id: pj.id, on: true });
  T('bấm Lưu trữ', r.ok && r.data.archived === 1, r);
  let pl = (await A('list', { table: 'projects' })).data;
  T('danh sách dự án mặc định ẩn dự án lưu trữ', !pl.some(x => x.id === pj.id));
  pl = (await A('list', { table: 'projects', archived: 1 })).data;
  T('"Hiện cả dự án lưu trữ" → có lại', pl.some(x => x.id === pj.id));
  await E(`reloadLookups()`); await sleep(300);
  T('ô chọn dự án không còn dự án lưu trữ', await E(`!projOpts().some(o=>o[0]===${JSON.stringify(pj.id)})`));
  T('…nhưng vẫn giữ khi đang mở chứng từ của dự án đó', await E(`projOpts(${JSON.stringify(pj.id)}).some(o=>o[0]===${JSON.stringify(pj.id)})`));
  T('trang Mua hàng không lấy hàng của dự án lưu trữ', !(await A('buyableLines', {})).data.some(l => l.project_id === pj.id));
  sm = (await A('projectBundle', { id: pj.id })).data;
  T('số liệu dự án vẫn giữ nguyên', sm.summary.revenue_vat === 1193327, sm.summary.revenue_vat);
  await E(`MEMO={};location.hash='#/project/${pj.id}'`); await sleep(1800);
  T('trang dự án: nhãn "Lưu trữ" + nút "Bỏ lưu trữ"', await E(`!!document.querySelector('#archBadge') && document.querySelector('#btnArchive').textContent==='Bỏ lưu trữ'`));
  await pg.shot('/tmp/s24_archive.png');
  r = await A('projectArchive', { id: pj.id, on: false });
  T('bỏ lưu trữ → hiện lại trong danh sách', r.ok && (await A('list', { table: 'projects' })).data.some(x => x.id === pj.id));
  await E(`MEMO={};location.hash='#/projects?arch=1'`); await sleep(1500);
  T('danh sách có ô "Hiện cả dự án lưu trữ"', /Hiện cả dự án lưu trữ/.test(await E(`document.querySelector('#view').textContent`)));

  console.log('— Đơn mua: VAT theo dòng');
  const ncc = (await A('supplierSave', { rec: { name: 'NCC VAT' } })).data;
  r = await A('purchaseSave', { rec: { supplier_id: ncc.id, order_date: '2026-11-06', vat_pct: 10, status: 'DA_DAT' }, items: [{ project_id: pj.id, doc_id: hd.id, doc_item_id: binh.id, name: binh.name, unit: binh.unit, qty: 3, price: 210000, vat_line: 10 }, { project_id: pj.id, doc_id: hd.id, doc_item_id: ong.id, name: ong.name, unit: ong.unit, qty: 7, price: 9100, vat_line: 8 }] });
  T('lưu đơn mua 2 mức VAT', r.ok, r);
  const pu = (await A('purchaseList', {})).data.find(x => x.id === r.data.purchase.id);
  // 630.000 + 63.000 ; 63.700 + 5.096 → 761.796
  T('đơn mua: tổng có VAT 761.796', pu.value_vat === 761796, pu.value_vat);
  await E(`MEMO={};location.hash='#/purchase/${r.data.purchase.id}'`); await sleep(1800);
  T('trang đơn mua có cột VAT % và VAT 8%', await E(`[...document.querySelectorAll('#view th')].some(t=>t.textContent.trim()==='VAT %') && /VAT 8%/.test(document.querySelector('#view').textContent)`));
  await pg.shot('/tmp/s24_purchase.png');

  console.log('— Giữ sao lưu');
  const day = 864e5, now = Date.parse('2026-11-21T03:00:00Z'), fs = [];
  for (let i = 0; i < 200; i++) fs.push({ id: 'b' + i, t: now - i * day });
  const tr = await E(`window.__hatoBackupTrashList(${JSON.stringify(fs)}, 30)`);
  const kept = fs.filter(x => tr.indexOf(x.id) < 0);
  const months = new Set(kept.slice(30).map(x => new Date(x.t + 7 * 36e5).toISOString().slice(0, 7)));
  T('giữ 30 bản mới nhất', fs.slice(0, 30).every(x => tr.indexOf(x.id) < 0));
  T('bản cũ hơn: mỗi tháng giữ đúng 1 bản', kept.length - 30 === months.size && months.size >= 5, [kept.length, months.size]);
  T('các bản còn lại bỏ thùng rác', tr.length === 200 - kept.length, tr.length);

  console.log('— Gửi Drive khi ẩn app');
  await A('save', { table: 'customers', rec: { name: 'Khách lưu khi ẩn app' } });
  await E(`Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))`); await sleep(1200);
  const dirty = await E(`(window.__hatoStore && __hatoStore.meta ? Object.keys(__hatoStore.meta.dirty).length : -1)`);
  T('ẩn app → đẩy ngay, không chờ hẹn giờ', dirty === 0 || dirty === -1, dirty);
  await E(`Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})`);
  await pg.send('Page.reload', {}); await sleep(4500);
  T('tải lại trang → còn bản vừa lưu', (await A('list', { table: 'customers' })).data.some(x => x.name === 'Khách lưu khi ẩn app'));

  const errs = await E('window.__errs || []');
  console.log(`\n${ok} đạt, ${bad} lỗi`); if (errs.length) console.log('Lỗi console: ' + JSON.stringify(errs));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
function num(x) { return +x || 0; }
