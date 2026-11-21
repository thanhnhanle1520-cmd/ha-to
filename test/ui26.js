// Bản 26: giá mua chốt tự lấy từ đơn mua (nhiều nhà cung cấp cho 1 HĐ) · BBGH cột "Thương hiệu / Xuất xứ"
const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 500)); } };
const txt = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty Kiểm thử Bản 26' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'Nhà máy Bản 26', customer_id: cu.id, status: 'Đang chào giá' } })).data;
  await E('reloadLookups()'); await sleep(300);
  const q = (await A('save', { table: 'quotes', rec: { project_id: pj.id, vat_pct: 10 }, items: [
    { name: 'Bình bột 8kg', brand: 'Tomoken', origin: 'Việt Nam', unit: 'Bình', qty: 10, price: 400000, cost: 250000 },
    { name: 'Tủ chữa cháy', brand: 'Hà Tô', origin: 'Việt Nam', unit: 'Cái', qty: 4, price: 1500000, cost: 1000000 },
    { name: 'Đầu phun Sprinkler', brand: 'Tyco', origin: 'Mỹ', unit: 'Cái', qty: 50, price: 90000, cost: 60000 }] })).data.quote;
  const hd = (await A('convertQuote', { quote_id: q.id, type: 'HD', doc_no: '15/2026/HĐMB' })).data.doc;
  let g = (await A('get', { table: 'docs', id: hd.id })).data; const [L1, L2, L3] = g.items;
  const its = g.items.map(x => Object.assign({}, x)); its[1].cost = 950000;           // dòng 2 chốt tay
  await A('save', { table: 'docs', rec: g.doc, items: its });
  const sA = (await A('supplierSave', { rec: { name: 'NCC Tomoken' } })).data, sB = (await A('supplierSave', { rec: { name: 'NCC Tyco' } })).data;
  const PL = (L, qty, price) => ({ project_id: pj.id, doc_id: hd.id, doc_item_id: L.id, name: L.name, unit: L.unit, qty, price });

  console.log('— Đơn mua "Đã đặt" → tự điền giá chốt');
  let r = await A('purchaseSave', { rec: { supplier_id: sA.id, order_date: '2026-11-21', vat_pct: 10, status: 'DA_DAT' }, items: [PL(L1, 10, 240000), PL(L2, 4, 980000)] });
  T('lưu đơn mua NCC A, báo đã điền 1 dòng', r.ok && r.data.cost_filled === 1, r.data);
  const puA = r.data.purchase;
  r = await A('purchaseSave', { rec: { supplier_id: sB.id, order_date: '2026-11-21', vat_pct: 10, status: 'DA_DAT' }, items: [PL(L3, 50, 55000)] });
  const puB = r.data.purchase;
  g = (await A('get', { table: 'docs', id: hd.id })).data;
  const by = id => g.items.find(x => x.id === id);
  T('dòng 1 lấy giá đơn NCC A (240.000)', +by(L1.id).cost === 240000 && by(L1.id).cost_src === puA.id, [by(L1.id).cost, by(L1.id).cost_src]);
  T('dòng 3 lấy giá đơn NCC B (55.000) — 1 HĐ nhiều nhà cung cấp', +by(L3.id).cost === 55000 && by(L3.id).cost_src === puB.id, [by(L3.id).cost, by(L3.id).cost_src]);
  T('dòng 2 đã chốt tay (950.000) → giữ nguyên', +by(L2.id).cost === 950000 && !by(L2.id).cost_src, [by(L2.id).cost]);
  T('văn bản biết giá đơn mua của 3 dòng', Object.keys(g.buy).length === 3 && g.buy[L2.id].price === 980000 && /NCC Tomoken/.test(g.buy[L2.id].refs), g.buy);
  let sm = (await A('projectBundle', { id: pj.id })).data.summary;
  // giá trị 4.000.000 + 6.000.000 + 4.500.000 = 14.500.000 ; vốn 2.400.000 + 3.800.000 + 2.750.000 = 8.950.000
  T('lãi dự kiến theo giá chốt = 5.550.000', sm.profit === 5550000, sm.profit);

  console.log('— Sửa / hủy đơn mua');
  const giA = (await A('purchaseGet', { id: puA.id })).data;
  r = await A('purchaseSave', { rec: Object.assign({}, giA.purchase || puA), items: (giA.items || []).map(x => Object.assign({}, x, { _saved: 1, price: x.doc_item_id === L1.id ? 245000 : x.price })) });
  g = (await A('get', { table: 'docs', id: hd.id })).data;
  T('đơn mua sửa giá 245.000 → giá chốt cập nhật theo', +by(L1.id).cost === 245000, [r.ok, r.error, by(L1.id).cost]);
  r = await A('purchaseSave', { rec: Object.assign({}, puB, { status: 'HUY' }), items: [Object.assign(PL(L3, 50, 55000), { id: (await A('purchaseGet', { id: puB.id })).data.items[0].id })] });
  g = (await A('get', { table: 'docs', id: hd.id })).data;
  T('hủy đơn NCC B → dòng 3 quay về giá bảng giá', r.ok && !(+by(L3.id).cost) && !by(L3.id).cost_src && !g.buy[L3.id], [r.error, by(L3.id).cost, by(L3.id).cost_src]);
  await A('purchaseSave', { rec: Object.assign({}, puB, { status: 'DA_DAT' }), items: [Object.assign(PL(L3, 50, 55000), { id: (await A('purchaseGet', { id: puB.id })).data.items[0].id })] });

  console.log('— Trang văn bản');
  await E(`MEMO={};location.hash='#/doc/${hd.id}'`); await sleep(2000);
  const refs = await E(`[...document.querySelectorAll('.buyref')].map(x=>x.textContent)`);
  T('cạnh giá chốt hiện mã đơn mua (✓ khớp, ≠ khác)', refs.length === 3 && refs.filter(x => /^✓ DM-/.test(x)).length === 2 && refs.some(x => /^≠ DM-.*980\.000/.test(x)), refs);
  T('nút "Lấy giá từ đơn mua" hiện vì dòng 2 khác giá', await E(`document.querySelector('#btnBuyFill').style.display!=='none' && /1 dòng giá chốt khác/.test(document.querySelector('#buyInfo').textContent)`));
  await E(`document.querySelector('#btnBuyFill').scrollIntoView()`); await sleep(300); await pg.shot('/tmp/s26_doc.png');
  await E(`document.querySelector('#btnBuyFill').click()`); await sleep(300); await E(`document.querySelector('.ov button.pri').click()`); await sleep(400);
  T('bấm → dòng 2 = 980.000, ẩn nút', await E(`document.querySelector('#btnBuyFill').style.display==='none'`));
  await E(`[...document.querySelectorAll('#acts button')].find(b=>b.textContent==='Lưu').click()`); await sleep(1800);
  g = (await A('get', { table: 'docs', id: hd.id })).data;
  T('lưu văn bản → dòng 2 ghi giá đơn mua, đánh dấu nguồn đơn mua', +by(L2.id).cost === 980000 && by(L2.id).cost_src === puA.id, [by(L2.id).cost, by(L2.id).cost_src]);

  console.log('— BBGH: Thương hiệu / Xuất xứ');
  const dl = (await A('save', { table: 'deliveries', rec: { project_id: pj.id, date: '2026-11-21', status: 'NHAP' }, items: [L1, L3].map(L => ({ doc_id: hd.id, doc_item_id: L.id, name: L.name, unit: L.unit, qty: 2 })) })).data.delivery;
  const t = txt((await A('export', { kind: 'bbgh', id: dl.id, format: 'html' })).data.html);
  T('cột "Thương hiệu / Xuất xứ": Tomoken - Việt Nam, Tyco - Mỹ', /Thương hiệu \/ Xuất xứ/.test(t) && /Tomoken - Việt Nam/.test(t) && /Tyco - Mỹ/.test(t), t.slice(700, 1300));
  T('TBGH cũng vậy', /Tyco - Mỹ/.test(txt((await A('export', { kind: 'tbgh', id: dl.id, format: 'html' })).data.html)));

  const errs = await E('window.__errs || []');
  console.log(`\n${ok} đạt, ${bad} lỗi`); if (errs.length) console.log('Lỗi console: ' + JSON.stringify(errs));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
