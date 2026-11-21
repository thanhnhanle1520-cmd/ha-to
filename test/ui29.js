// Bản 29: một tab làm việc · bản thử tách riêng · ghi nhớ dòng đã xóa · chống trùng mã + kiểm tra trùng mã · xóa chọn lọc từng dòng
const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 500)); } };
const URL = 'http://127.0.0.1:8765/index.html?local=1';
(async () => {
  const c = await launch(); const pg = await open(c.port, URL); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
  const SY = async () => { await E('HatoStore.syncNow()'); await sleep(1200); };
  const DRV = (file, fn) => E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.find(x=>x.name===${JSON.stringify(file)});if(!f) return null;const p=await D.read(f.id);${fn}})()`);

  console.log('— Bản thử tách riêng');
  T('đường dẫn /ha-to-test/ → bộ nhớ + thư mục Drive riêng; /ha-to/ → bản thật', await E(`__hatoNsOf('/ha-to-test/index.html')==='_test' && __hatoNsOf('/ha-to-test/')==='_test' && __hatoNsOf('/ha-to/')==='' && __hatoNsOf('/ha-to/index.html')==='' && __hatoNS===''`));

  console.log('— Ghi nhớ dòng đã xóa');
  const k1 = (await A('save', { table: 'customers', rec: { name: 'KH giữ lại' } })).data, k2 = (await A('save', { table: 'customers', rec: { name: 'KH cũ sẽ xóa' } })).data;
  await SY();
  let r = await A('remove', { table: 'customers', id: k2.id });
  T('xóa khách hàng', r.ok, r); await SY();
  const tomb = await DRV('_deleted.json', `return p.tomb.CUSTOMERS && !!p.tomb.CUSTOMERS[${JSON.stringify(k2.id)}]`);
  T('Drive có _deleted.json ghi nhớ dòng vừa xóa', tomb === true, tomb);
  // thiết bị cũ (chạy bản cũ) đẩy dòng đã xóa lên lại Drive; máy này cũng đang có thay đổi → gộp
  await DRV('CUSTOMERS.json', `const h=p.rows[0];const row=h.map(c=>c==='id'?${JSON.stringify(k2.id)}:c==='name'?'KH cũ sẽ xóa':c==='code'?'KH-999':'');p.rows.push(row);await D.write('CUSTOMERS.json',p,f.id);return 1`);
  await A('save', { table: 'customers', rec: { name: 'KH mới máy này' } }); await SY();
  let names = (await A('list', { table: 'customers' })).data.map(x => x.name);
  T('gộp với Drive: dòng đã xóa KHÔNG sống lại, dòng mới vẫn có', !names.includes('KH cũ sẽ xóa') && names.includes('KH mới máy này') && names.includes('KH giữ lại'), names);
  const onDrive = await DRV('CUSTOMERS.json', `return p.rows.some(r=>r[0]===${JSON.stringify(k2.id)})`);
  T('…và Drive cũng sạch dòng đó', onDrive === false, onDrive);

  console.log('— Một tab làm việc');
  const pg2 = await open(c.port, URL); await sleep(3500);
  T('mở tab thứ 2 → báo "đang mở ở tab khác", có nút "Dùng tab này"', await pg2.ev(`!!document.querySelector('#hato-take') && /tab khác/.test(document.querySelector('#hato-gate').textContent)`));
  await pg.shot('/tmp/s29_tab1.png'); await pg2.shot('/tmp/s29_tab2.png');
  await A('save', { table: 'customers', rec: { name: 'KH tạo ở tab 1' } });
  await pg2.ev(`document.querySelector('#hato-take').click()`);
  for (let i = 0; i < 20; i++) { await sleep(800); try { if (await pg2.ev(`!document.querySelector('#hato-gate') && typeof api==='function'`)) break; } catch (e) { } }
  T('tab 1 nhường quyền → tự khóa', await E(`!!document.querySelector('#hato-gate') && /chuyển sang làm việc ở tab khác/.test(document.querySelector('#hato-gate').textContent)`));
  T('tab 2 làm việc được, thấy dữ liệu tab 1 vừa tạo', await pg2.ev(`!document.querySelector('#hato-gate') && typeof api==='function'`) && (await pg2.ev(`api('list',{table:'customers'})`)).data.some(x => x.name === 'KH tạo ở tab 1'));
  await pg2.shot('/tmp/s29_tab2b.png');
  pg2.close();
  // trở lại tab 1 cho phần sau
  await E(`document.querySelector('#hato-take').click()`); await sleep(6000);
  T('bấm "Dùng tab này" ở tab 1 → làm việc lại', await E(`!document.querySelector('#hato-gate') && typeof api==='function'`));

  console.log('— Xóa chọn lọc từng dòng');
  const cu = (await A('save', { table: 'customers', rec: { name: 'KH Xóa chọn lọc' } })).data;
  const mk = async (name) => { const pj = (await A('save', { table: 'projects', rec: { name, customer_id: cu.id, status: 'Đang thực hiện' } })).data; const q = (await A('save', { table: 'quotes', rec: { project_id: pj.id, vat_pct: 10 }, items: [{ name: 'Bình ' + name, unit: 'Bình', qty: 5, price: 100000, cost: 60000 }] })).data.quote; const d = (await A('convertQuote', { quote_id: q.id, type: 'PO' })).data.doc; const it = (await A('get', { table: 'docs', id: d.id })).data.items[0]; await A('save', { table: 'deliveries', rec: { project_id: pj.id, date: '2026-11-21', status: 'NHAP' }, items: [{ doc_id: d.id, doc_item_id: it.id, name: it.name, unit: it.unit, qty: 2 }] }); return { pj, q, d, it }; };
  const P1 = await mk('Dự án sẽ xóa'), P2 = await mk('Dự án giữ lại');
  const ncc = (await A('supplierSave', { rec: { name: 'NCC Xóa lọc' } })).data;
  const L = (P) => ({ project_id: P.pj.id, doc_id: P.d.id, doc_item_id: P.it.id, name: P.it.name, unit: 'Bình', qty: 5, price: 60000 });
  const puOnly1 = (await A('purchaseSave', { rec: { supplier_id: ncc.id, status: 'DA_DAT' }, items: [L(P1)] })).data.purchase;
  const puBoth = (await A('purchaseSave', { rec: { supplier_id: ncc.id, status: 'DA_DAT' }, items: [L(P1), L(P2)] })).data.purchase;
  const rows = (await A('dataRows', { group: 'projects' })).data, row1 = rows.find(x => x.id === P1.pj.id);
  T('danh sách từng dự án kèm số chứng từ', row1 && row1.n.quotes === 1 && row1.n.docs === 1 && row1.n.deliveries === 1, row1);
  const pv = (await A('deletePreview', { sel: [{ group: 'projects', ids: [P1.pj.id] }] })).data;
  T('xem trước: 1 dự án · 1 báo giá · 1 HĐ/PO · 1 phiếu giao · 1 đơn mua', /1 dự án/.test(pv.text) && /1 báo giá/.test(pv.text) && /1 HĐ \/ PO \/ PL/.test(pv.text) && /1 phiếu giao/.test(pv.text) && /1 đơn mua/.test(pv.text), pv.text);
  // giao diện
  await E(`MEMO={};location.hash='#/config'`); await sleep(1500);
  await E(`[...document.querySelectorAll('#acts button')].find(b=>/Xóa dữ liệu/.test(b.textContent)).click()`); await sleep(1200);
  T('mặc định không tick nhóm nào', await E(`[...document.querySelectorAll('.ov input[type=checkbox]:not(#delTrash)')].every(c=>!c.checked)`));
  await E(`document.querySelector('.picktog[data-g="projects"]').click()`); await sleep(1200);
  await E(`(()=>{const tr=[...document.querySelectorAll('.pickbox tbody tr')].find(t=>/Dự án sẽ xóa/.test(t.textContent));const c=tr.querySelector('input');c.checked=true;c.dispatchEvent(new Event('change'))})()`); await sleep(2200);
  T('chọn từng dòng → hiện "đã chọn 1 dòng" + xem trước', /đã chọn 1 dòng/.test(await E(`document.querySelector('.picktog').parentNode.textContent`)) && /Xóa chọn lọc sẽ xóa: 1 dự án/.test(await E(`document.querySelector('#delPreview').textContent`)), await E(`document.querySelector('#delPreview').textContent`));
  await pg.shot('/tmp/s29_pick.png');
  await E(`document.querySelector('.ov input[placeholder="Gõ XOA để xác nhận"]').value='xoa'`);
  await E(`[...document.querySelectorAll('.ov button')].find(b=>b.textContent==='Sao lưu rồi xóa').click()`); await sleep(5000);
  const pjs = (await A('list', { table: 'projects' })).data.map(x => x.id);
  T('xóa xong: dự án 1 mất, dự án 2 còn', !pjs.includes(P1.pj.id) && pjs.includes(P2.pj.id), pjs.length);
  T('báo giá / HĐ / phiếu giao của dự án 1 mất theo', !(await A('get', { table: 'quotes', id: P1.q.id })).ok && !(await A('get', { table: 'docs', id: P1.d.id })).ok && (await A('get', { table: 'docs', id: P2.d.id })).ok);
  const pl = (await A('purchaseList', {})).data;
  T('đơn mua chỉ có hàng dự án 1 bị xóa; đơn chung chỉ bỏ dòng dự án 1', !pl.some(x => x.id === puOnly1.id) && (await A('purchaseGet', { id: puBoth.id })).data.items.length === 1, pl.map(x => x.code));
  const kept = (await A('list', { table: 'customers' })).data.some(x => x.id === cu.id);
  T('khách hàng và các nhóm khác không bị đụng', kept);
  const p3 = (await A('save', { table: 'projects', rec: { name: 'Dự án mới sau xóa', customer_id: cu.id, status: 'Đang thực hiện' } })).data;
  T('xóa chọn lọc không đặt lại số → mã mới không trùng mã đã dùng', p3.code !== P1.pj.code && p3.code !== P2.pj.code, [p3.code, P1.pj.code, P2.pj.code]);

  console.log('— Chống trùng mã');
  // dữ liệu cũ quay lại với mã sắp cấp (vd bộ đếm bị đặt lại)
  const nextNo = +p3.code.split('-')[2] + 1, nextCode = 'DA-2026-' + String(nextNo).padStart(3, '0');
  await DRV('PROJECTS.json', `const h=p.rows[0];const row=h.map(c=>c==='id'?'POLD1':c==='code'?${JSON.stringify(nextCode)}:c==='name'?'Dự án cũ quay lại':c==='customer_id'?${JSON.stringify(cu.id)}:c==='status'?'Đang thực hiện':'');p.rows.push(row);await D.write('PROJECTS.json',p,f.id);return 1`);
  await SY();
  const p4 = (await A('save', { table: 'projects', rec: { name: 'Dự án mới 2', customer_id: cu.id, status: 'Đang thực hiện' } })).data;
  T('cấp mã mới bỏ qua mã đã có (' + nextCode + ')', p4.code !== nextCode, [p4.code, nextCode]);
  // tạo trùng thật để kiểm tra
  await DRV('PROJECTS.json', `const h=p.rows[0];const row=h.map(c=>c==='id'?'POLD2':c==='code'?${JSON.stringify(p4.code)}:c==='name'?'Dự án cũ trùng mã':c==='customer_id'?${JSON.stringify(cu.id)}:c==='status'?'Đang thực hiện':'');p.rows.push(row);await D.write('PROJECTS.json',p,f.id);return 1`);
  await SY();
  let dup = (await A('dupCodes', {})).data;
  T('"Kiểm tra trùng mã" phát hiện ' + p4.code, dup.some(g => g.table === 'PROJECTS' && g.code === p4.code && g.rows.length === 2), dup);
  await E(`MEMO={};location.hash='#/config'`); await sleep(1500);
  await E(`document.querySelector('#btnDupCodes').click()`); await sleep(1200);
  await pg.shot('/tmp/s29_dup.png');
  await E(`(()=>{const tr=[...document.querySelectorAll('#dupBox tr')].find(t=>/Dự án cũ trùng mã/.test(t.textContent));tr.querySelector('button').click()})()`); await sleep(1800);
  dup = (await A('dupCodes', {})).data;
  T('bấm "Cấp mã mới" → hết trùng', !dup.some(g => g.code === p4.code), dup);

  const errs = await E('window.__errs || []');
  console.log(`\n${ok} đạt, ${bad} lỗi`); if (errs.length) console.log('Lỗi console: ' + JSON.stringify(errs));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
