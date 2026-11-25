// Bản 15: Bảng giá (cột mới) · danh sách Khách hàng · hồ sơ khách hàng
const { launch, open } = require('./cdp'); const fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 400)); } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  if (fs.existsSync('/tmp/old.xlsx')) { const b64 = fs.readFileSync('/tmp/old.xlsx').toString('base64'); await E(`(async()=>{const bin=atob('${b64}'),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const x=await HatoMigrate.importXlsx(new File([u],'o.xlsx'));await HatoStore.importWorkbook(x.snap);await reloadLookups();return 1})()`); }
  const line = (n, q, p) => ({ name: n, unit: 'Cái', qty: q, price: p, price_offer: p, cost: p * 0.7 });
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty TNHH Thương mại Phòng cháy Minh Phát Sài Gòn', tax_code: '0312345678', address: '12 Nguyễn Văn Linh, Q.7, TP.HCM', contact: 'Anh Tuấn', phone: '0909 123 456' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'Kho lạnh Long An', customer_id: cu.id, status: 'Đang thực hiện' } })).data;
  await A('saveQuote', { rec: { project_id: pj.id, date: '2026-11-01' }, items: [line('Bình ABC', 10, 300000)] }).catch(() => { });
  const hd = (await A('save', { table: 'docs', rec: { type: 'HD', project_id: pj.id, doc_no: 'HĐ-01', sign_date: '2026-11-05', terms: [{ name: 'Đợt 1', pct: 100, days: 30 }] }, items: [line('Bình ABC 8kg', 10, 300000)] })).data.doc;
  await A('save', { table: 'payments', rec: { project_id: pj.id, doc_id: hd.id, date: '2026-11-10', amount: 1000000, kind: 'PHAI_THU', note: 'Tạm ứng đợt 1' } });
  await E(`reloadLookups()`);
  console.log('— Khách hàng: danh sách');
  await E(`MEMO={};location.hash='#/customers'`); await sleep(1500);
  const th = await E(`[...document.querySelectorAll('#view thead th:not(.ck)')].map(x=>x.textContent).join('|')`);
  T('cột: Mã KH · Tên · MST · Người liên hệ · Điện thoại · Số dự án · Trạng thái', th === 'Mã KH|Tên khách hàng|MST|Người liên hệ|Điện thoại|Số dự án|Trạng thái', th);
  T('địa chỉ trong dòng gợi ý của tên', await E(`[...document.querySelectorAll('#view tbody td span')].some(s=>/12 Nguyễn Văn Linh/.test(s.title||''))`));
  T('ô trống hiện "—"', await E(`[...document.querySelectorAll('#view tbody td')].some(td=>td.textContent==='—')`));
  await E(`[...document.querySelectorAll('#view tbody tr')].find(tr=>/Minh Phát/.test(tr.textContent)).click()`); await sleep(1500);
  T('bấm khách → mở hồ sơ', /#\/customer\//.test(await E('location.hash')) && /Minh Phát/.test(await E(`document.querySelector('#title').textContent`)));
  const kp = await E(`document.querySelector('#kpibar').textContent`);
  T('hồ sơ có tổng: giá trị ký 3.000.000, đã thu 1.000.000', /Giá trị ký.*3\.000\.000/.test(kp) && /Đã thu.*1\.000\.000/.test(kp), kp);
  T('tab Dự án có dự án', /Kho lạnh Long An/.test(await E(`document.querySelector('#view').textContent`)));
  for (const [k, re] of [['info', /0312345678.*12 Nguyễn Văn Linh/s], ['docs', /HĐ-01/], ['history', /Thu tiền.*Tạm ứng đợt 1|Ký hợp đồng/s]]) {
    await E(`[...document.querySelectorAll('#view .tabs a')].find(a=>a.textContent.startsWith(${JSON.stringify({ info: 'Thông tin', docs: 'HĐ / PO', history: 'Lịch sử' }[k])})).click()`); await sleep(1000);
    T('tab ' + k, re.test(await E(`document.querySelector('#view').textContent`)), (await E(`document.querySelector('#view').textContent`)).slice(0, 300));
  }
  const bdl = (await A('customerBundle', { id: cu.id })).data;
  T('lịch sử giao dịch đủ loại (ký HĐ, thu tiền)', bdl.events.some(e => e.kind === 'doc') && bdl.events.some(e => e.kind === 'pay'), bdl.events.map(e => e.kind));
  console.log('— Bảng giá: cột mới');
  await E(`MEMO={};location.hash='#/pricelist'`); await sleep(2000);
  const pth = await E(`[...document.querySelectorAll('#view thead th:not(.ck)')].map(x=>x.textContent).join('|')`);
  T('cột: Mã · Hãng · Nhóm · Tên hàng · Model · Size · ĐVT · Giá mua · Hệ số · Giá bán', pth === 'Mã|Hãng|Nhóm|Tên hàng|Model|Size|ĐVT|Giá mua|Hệ số ⓘ|Giá bán' || /Mã\|Hãng\|Nhóm\|Tên hàng\|Model\|Size\|ĐVT\|Giá mua\|Hệ số/.test(pth), pth);
  T('bỏ dòng hướng dẫn khỏi khu lọc', !/Giá bán = Giá mua × Hệ số \(riêng/.test(await E(`document.querySelector('#view .bar2').textContent`)));
  const rows = await E(`document.querySelectorAll('#view tbody tr').length`);
  if (rows) {
    const h1 = await E(`Math.max(...[...document.querySelectorAll('#view tbody tr')].slice(0,20).map(tr=>tr.getBoundingClientRect().height))`);
    T('mỗi dòng 1 hàng chữ (≤ 40px)', h1 <= 40, h1);
    T('giá căn phải', await E(`getComputedStyle(document.querySelector('#view tbody tr td:nth-child(8)')).textAlign`) === 'right');
  }
  console.log('Lỗi console:', JSON.stringify(pg.logs)); console.log(ok + ' đạt, ' + bad + ' lỗi'); c.proc.kill(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
