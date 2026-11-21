// Bản 28: tạo đơn mua ngay từ trang HĐ / PO (nhiều nhà cung cấp) · cột "Đơn mua" trên dòng hàng
const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 500)); } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty Kiểm thử Bản 28' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'Nhà xưởng Bản 28', customer_id: cu.id, status: 'Đang chào giá' } })).data;
  await E('reloadLookups()'); await sleep(300);
  const q = (await A('save', { table: 'quotes', rec: { project_id: pj.id, vat_pct: 10 }, items: [
    { name: 'Bình bột 8kg', unit: 'Bình', qty: 10, price: 400000, cost: 250000 }, { name: 'Tủ chữa cháy', unit: 'Cái', qty: 4, price: 1500000, cost: 1000000 }, { name: 'Đầu báo khói', unit: 'Cái', qty: 30, price: 200000, cost: 120000 }] })).data.quote;
  const po = (await A('convertQuote', { quote_id: q.id, type: 'PO', doc_no: 'PO-KH-28' })).data.doc;
  const sA = (await A('supplierSave', { rec: { name: 'NCC Bình Tủ' } })).data, sB = (await A('supplierSave', { rec: { name: 'NCC Báo cháy' } })).data;

  console.log('— Tạo đơn mua từ trang PO');
  await E(`MEMO={};location.hash='#/doc/${po.id}'`); await sleep(2000);
  T('trang PO có nút "Tạo đơn mua"; chưa có đơn → chưa có cột Đơn mua', await E(`!!document.querySelector('#btnQuickBuy') && ![...document.querySelectorAll('#view table.le th')].some(t=>t.textContent==='Đơn mua')`));
  await E(`document.querySelector('#btnQuickBuy').click()`); await sleep(1500);
  T('hộp tạo đơn mua: 3 dòng còn cần mua, giá mặc định = giá dự kiến', await E(`document.querySelectorAll('#quickBuy tbody tr').length===3 && [...document.querySelectorAll('#quickBuy tbody tr')][0].querySelectorAll('input[type=number]')[1].value==='250000'`));
  // NCC A: bình + tủ; bỏ tick đầu báo
  await E(`(()=>{const b=document.querySelector('#quickBuy');const sel=b.querySelector('select');sel.value=${JSON.stringify(sA.id)};const tr=[...b.querySelectorAll('tbody tr')];tr[2].querySelector('input[type=checkbox]').checked=false;const p0=tr[0].querySelectorAll('input[type=number]')[1];p0.value='240000';p0.dispatchEvent(new Event('input'))})()`); await sleep(200);
  await pg.shot('/tmp/s28_quick.png');
  await E(`[...document.querySelectorAll('.ov button')].find(b=>b.textContent==='Tạo đơn mua').click()`); await sleep(2500);
  let g = (await A('get', { table: 'docs', id: po.id })).data;
  T('đơn NCC A tạo xong → bình 240.000, tủ 1.000.000 vào giá chốt', +g.items[0].cost === 240000 && +g.items[1].cost === 1000000 && !(+g.items[2].cost), g.items.map(x => x.cost));
  // NCC B: phần còn lại
  await E(`document.querySelector('#btnQuickBuy').click()`); await sleep(1500);
  T('lần 2: chỉ còn dòng đầu báo cần mua', await E(`document.querySelectorAll('#quickBuy tbody tr').length===1 && /Đầu báo khói/.test(document.querySelector('#quickBuy tbody').textContent)`));
  await E(`(()=>{const b=document.querySelector('#quickBuy');b.querySelector('select').value=${JSON.stringify(sB.id)};const p=b.querySelector('tbody tr').querySelectorAll('input[type=number]')[1];p.value='110000'})()`);
  await E(`[...document.querySelectorAll('.ov button')].find(b=>b.textContent==='Tạo đơn mua').click()`); await sleep(2500);
  g = (await A('get', { table: 'docs', id: po.id })).data;
  T('đơn NCC B → đầu báo 110.000', +g.items[2].cost === 110000, g.items.map(x => x.cost));
  const lst = (await A('purchaseList', { project_id: pj.id })).data;
  T('dự án có 2 đơn mua của 2 nhà cung cấp, đã liên kết dòng PO', lst.length === 2 && lst.map(x => x.supplier_name).sort().join('|') === 'NCC Báo cháy|NCC Bình Tủ', lst.map(x => x.supplier_name));
  const bc = await E(`[...document.querySelectorAll('#view table.le td a[href^="#/purchase/"]')].map(a=>[a.textContent,a.title])`);
  T('cột "Đơn mua" hiện mã đơn từng dòng (2 nhà cung cấp)', bc.length === 3 && bc.filter(x => /NCC Bình Tủ/.test(x[1])).length === 2 && /NCC Báo cháy/.test(bc[2][1]), bc);
  await E(`document.querySelector('#btnQuickBuy').scrollIntoView(); [...document.querySelectorAll('#view h3')].find(x=>/Dòng hàng/.test(x.textContent)).scrollIntoView()`); await sleep(300);
  await pg.shot('/tmp/s28_doc.png');
  await E(`document.querySelector('#view table.le td a[href^="#/purchase/"]').click()`); await sleep(2000);
  T('bấm mã đơn → mở trang đơn mua', /^#\/purchase\//.test(await E('location.hash')) && /NCC Bình Tủ/.test(await E(`document.querySelector('#view').textContent`)));
  await E(`MEMO={};location.hash='#/doc/${po.id}'`); await sleep(1800);
  await E(`document.querySelector('#btnQuickBuy').click()`); await sleep(1500);
  T('đã đặt đủ → báo không còn dòng cần mua', /đã đặt mua đủ/.test(await E(`document.querySelector('#quickBuy').textContent`)));

  const errs = await E('window.__errs || []');
  console.log(`\n${ok} đạt, ${bad} lỗi`); if (errs.length) console.log('Lỗi console: ' + JSON.stringify(errs));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
