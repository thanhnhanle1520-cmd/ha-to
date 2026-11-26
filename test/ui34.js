// Bản 34: gán mã hàng ở Mua hàng (cột Mã hàng, gợi ý, + Bảng giá, gán hàng loạt; đơn đã lưu ghi ngay + điền dòng HĐ/PO trống mã)
// và gán mã ngay trong danh sách "chưa có mã" của Kho (đơn mua, tờ khai)
const { launch, open } = require('./cdp'); const fs = require('fs'), path = require('path'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 600)); } };
const SHOT = process.env.SHOT_DIR || '/tmp';
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 860, deviceScaleFactor: 1, mobile: false });
  const b64 = n => fs.readFileSync(path.join(__dirname, 'fixtures', n)).toString('base64');
  await E(`window.__file=function(b,n){var s=atob(b),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return new File([u],n)};1`);
  await E(`(()=>{const ss=ss_();if(ss.getSheetByName('DuLieu_Chung'))return;const sh=ss.insertSheet('DuLieu_Chung');const v=[['STT','Thương hiệu','Nhóm hàng','Tên tiếng Việt','Model','ĐVT','Giá vốn','Giá bán tham chiếu','Trạng thái'],[1,'Tyco','Sprinkler','Đầu phun sprinkler hướng lên 74°C K5.6','TY7126','Cái',450000,600000,'Đang bán'],[2,'Walter','Lăng phun','Lăng phun chữa cháy cố định DN100','FFM-1/FFM32','Cái',9000000,12000000,'Đang bán'],[3,'Ha To','Tủ','Tủ chữa cháy trong nhà','TCC-01','Cái',1500000,2500000,'Đang bán'],[4,'Pentax','Bơm','Bơm chữa cháy động cơ diesel 50HP','NFP-50','Bộ',120000000,150000000,'Đang bán']];sh.getRange(1,1,v.length,v[0].length).setValues(v);})()`);
  const it = (code, name, model, brand, unit, qty, price) => ({ code, name, model, brand, unit, qty, price, cost: '', disc_pct: 0 });
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty CP Đầu tư Phú An', short_name: 'Phú An' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'Kho lạnh Phú An', customer_id: cu.id, status: 'Đang thực hiện' } })).data;
  const hd = (await A('save', { table: 'docs', rec: { type: 'HD', project_id: pj.id, doc_no: 'HĐ-PA-07', sign_date: '2026-11-20', terms: [{ name: 'Đợt 1', pct: 100, days: 30 }] }, items: [
    it('', 'Bơm chữa cháy diesel', 'NFP-50', 'Pentax', 'Bộ', 1, 150000000), it('', 'Van báo động ướt DN150', 'AV-1-150', 'Tyco', 'Cái', 2, 18000000), it('', 'Đầu báo khói quang', 'SD-9', 'Hochiki', 'Cái', 40, 450000), it('SP0003', 'Tủ chữa cháy trong nhà', 'TCC-01', 'Ha To', 'Cái', 6, 2500000)] })).data.doc;
  let hdi = (await A('get', { table: 'docs', id: hd.id })).data.items;
  const ncc = (await A('supplierSave', { rec: { name: 'Công ty TNHH Thiết bị PCCC Đông Á' } })).data;
  const PL = (L, qty, price) => ({ project_id: pj.id, doc_id: hd.id, doc_item_id: L.id, code: L.code, name: L.name, model: L.model, brand: L.brand, unit: L.unit, qty, price });
  const pu = (await A('purchaseSave', { rec: { supplier_id: ncc.id, order_date: '2026-11-21', vat_pct: 10, status: 'DA_DAT' }, items: [PL(hdi[0], 1, 118000000), PL(hdi[1], 2, 15000000), PL(hdi[2], 40, 300000), PL(hdi[3], 6, 1500000)] })).data.purchase;
  let pg1 = (await A('purchaseGet', { id: pu.id })).data;
  await A('receiptSave', { rec: { purchase_id: pu.id, date: '2026-11-24' }, items: pg1.items.map(x => ({ purchase_item_id: x.id, qty: x.qty })) });
  await E('reloadLookups()');
  T('dữ liệu thử: HĐ 4 dòng (3 dòng chưa có mã), đơn mua đã về đủ', !!pu && pg1.items.length === 4);
  let sl = (await A('stockList', {})).data;
  T('Kho báo 3 dòng đơn mua chưa có mã', sl.nocode === 3, sl.nocode);
  T('purchaseGet: dòng 1 gợi ý SP0004 theo model + hãng, dòng 4 có tên mã SP0003', pg1.items[0].suggest && pg1.items[0].suggest.code === 'SP0004' && pg1.items[3].code_name === 'Tủ chữa cháy trong nhà', pg1.items.map(x => [x.code, x.suggest && x.suggest.code, x.code_name]));

  console.log('— 1. Đơn mua: cột Mã hàng, gợi ý, gán hàng loạt');
  await E(`MEMO={};location.hash='#/purchase/${pu.id}'`); await sleep(1800);
  const th = await E(`[...document.querySelectorAll('#view table.t thead th')].map(x=>x.textContent).slice(0,6).join('|')`);
  T('bảng dòng hàng có cột "Mã hàng" sau "Hàng hóa"', /Hàng hóa\|Mã hàng\|ĐVT/.test(th), th);
  const pv = await E(`(()=>{const tr=[...document.querySelectorAll('#view td.pucode')];return {n:tr.length,v:tr.map(t=>t.querySelector('input').value),sug:(tr[0].querySelector('.tksug')||{}).textContent||'',cat:tr.map(t=>!!t.querySelector('.pucat')),bs:document.querySelector('#btnPuSug').style.display===''?document.querySelector('#btnPuSug').textContent:'',bc:document.querySelector('#btnPuCat').textContent}})()`);
  T('dòng 1 hiện "Gợi ý: SP0004"; dòng chưa mã có "+ Bảng giá"; dòng 4 SP0003', pv.n === 4 && /SP0004/.test(pv.sug) && pv.cat.join() === 'true,true,true,false' && pv.v[3] === 'SP0003', pv);
  T('nút "Gán mã gợi ý (1 dòng)" và "+ Thêm 3 dòng chưa có mã vào Bảng giá"', pv.bs === 'Gán mã gợi ý (1 dòng)' && pv.bc === '+ Thêm 3 dòng chưa có mã vào Bảng giá', pv);
  await pg.shot(SHOT + '/s34_1_don_mua_cot_ma_hang.png');
  await E(`document.querySelector('#btnPuSug').click()`); await sleep(1800);
  pg1 = (await A('purchaseGet', { id: pu.id })).data;
  T('bấm "Gán mã gợi ý" → ghi ngay mã SP0004 vào đơn mua (không cần Lưu)', pg1.items[0].code === 'SP0004', pg1.items[0].code);
  hdi = (await A('get', { table: 'docs', id: hd.id })).data.items;
  T('dòng HĐ/PO đang trống mã được điền SP0004', hdi[0].code === 'SP0004', hdi.map(x => x.code));
  sl = (await A('stockList', {})).data;
  T('Kho cập nhật liền: SP0004 tồn 1, còn 2 dòng chưa có mã', (sl.rows.find(x => x.code === 'SP0004') || {}).qty === 1 && sl.nocode === 2, [sl.nocode, sl.rows.find(x => x.code === 'SP0004')]);
  T('màn đơn mua vẽ lại tại chỗ: dòng 1 hiện SP0004 + tên Bảng giá', await E(`(()=>{const t=document.querySelectorAll('#view td.pucode')[0];return t.querySelector('input').value==='SP0004' && /Bơm chữa cháy động cơ/.test(t.textContent) && !t.querySelector('.tksug')})()`));

  console.log('— 1b. "+ Bảng giá" từ dòng đơn mua');
  await E(`document.querySelectorAll('#view td.pucode')[1].querySelector('.pucat').click()`); await sleep(1000);
  const md = await E(`[...document.querySelectorAll('.md tbody tr')].map(tr=>[...tr.querySelectorAll('input')].map(i=>i.type==='checkbox'?i.checked:i.value))`);
  T('form điền sẵn theo dòng đơn mua: tên, hãng, model, ĐVT, giá mua = giá mua thực', md.length === 1 && md[0][1] === 'Van báo động ướt DN150' && md[0][2] === 'Tyco' && md[0][4] === 'AV-1-150' && md[0][5] === 'Cái' && md[0][6] === '15000000', md);
  await E(`document.querySelector('.md tbody tr').querySelectorAll('input[type=text]')[2].value='Van'`);
  await pg.shot(SHOT + '/s34_2_them_vao_bang_gia.png');
  await E(`[...document.querySelectorAll('.md .mf button')].find(b=>b.textContent==='Thêm vào Bảng giá').click()`); await sleep(2200);
  pg1 = (await A('purchaseGet', { id: pu.id })).data;
  T('mã mới SP0005 ghi ngay vào dòng đơn mua', pg1.items[1].code === 'SP0005', pg1.items[1].code);
  let cat = (await A('catalogList', { q: '', size: 50 })).data.rows;
  T('Bảng giá có SP0005: nhóm Van, giá mua 15.000.000', (cat.find(x => x.code === 'SP0005') || {}).cost === 15000000 && cat.find(x => x.code === 'SP0005').group === 'Van', cat.find(x => x.code === 'SP0005'));
  hdi = (await A('get', { table: 'docs', id: hd.id })).data.items;
  T('dòng HĐ/PO 2 điền SP0005', hdi[1].code === 'SP0005');
  await pg.shot(SHOT + '/s34_3_don_mua_da_gan_ma.png');

  console.log('— 1c. Dòng HĐ/PO đã có mã thì không ghi đè; sửa tay → "chưa lưu"');
  await A('purchaseSetCodes', { purchase_id: pu.id, codes: [{ item_id: pg1.items[3].id, item_code: 'SP0001' }] });
  hdi = (await A('get', { table: 'docs', id: hd.id })).data.items;
  T('đổi mã dòng đơn mua 4 sang SP0001 → dòng HĐ/PO vẫn giữ SP0003', hdi[3].code === 'SP0003', hdi[3].code);
  T('mã không có trong Bảng giá → báo lỗi', /không có trong Bảng giá/.test(JSON.stringify(await A('purchaseSetCodes', { purchase_id: pu.id, codes: [{ item_id: pg1.items[3].id, item_code: 'SP9999' }] }))));
  await A('purchaseSetCodes', { purchase_id: pu.id, codes: [{ item_id: pg1.items[3].id, item_code: 'SP0003' }] });
  await E(`MEMO={};route()`); await sleep(1500);
  await E(`(()=>{const i=document.querySelectorAll('#view td.pucode')[3].querySelector('input');i.value='SP0001';i.dispatchEvent(new Event('input'))})()`);
  T('sửa tay ô mã → nhãn "chưa lưu"; chưa ghi', /chưa lưu/.test(await E(`document.querySelectorAll('#view td.pucode')[3].textContent`)) && (await A('purchaseGet', { id: pu.id })).data.items[3].code === 'SP0003');
  await E(`(()=>{const i=document.querySelectorAll('#view td.pucode')[3].querySelector('input');i.value='SP0003';i.dispatchEvent(new Event('input'))})()`);

  console.log('— 2. Kho: gán mã ngay trong danh sách "chưa có mã"');
  await E(`MEMO={};location.hash='#/imports'`); await sleep(1000);
  await E(`tkImportFiles([__file(${JSON.stringify(b64('tk_ecus_mau.xlsx'))},'ToKhaiHQ7N_QDTQ_100000000001.xlsx')])`); await sleep(1800);
  await E(`document.querySelector('#acts button.pri').click()`); await sleep(2000);
  const tkId = (await E('location.hash')).split('/')[2];
  const sv = (await A('catalogSave', { rec: { name: 'Đầu báo khói quang học', model: 'SD-9', brand: 'Hochiki', unit: 'Cái', cost: 300000, group: 'Báo cháy' } })).data.code;
  await E(`MEMO={};location.hash='#/stock'`); await sleep(1800);
  T('trang Kho: cảnh báo có nút "Xem và gán mã"', await E(`!!document.querySelector('#btnStkNocode')`));
  await E(`document.querySelector('#btnStkNocode').click()`); await sleep(1500);
  const nc = await E(`(()=>{const rs=[...document.querySelectorAll('.md table.stknc tbody tr')];return {n:rs.length,src:rs.map(r=>r.dataset.src),txt:document.querySelector('.md').textContent,all:(document.querySelector('#btnStkSugAll')||{}).textContent||''}})()`);
  T('danh sách: 1 dòng đơn mua (đầu báo khói, gợi ý ' + sv + ') + 2 dòng tờ khai', nc.n === 3 && nc.src.filter(x => x === 'DM').length === 1 && nc.src.filter(x => x === 'TK').length === 2 && nc.txt.indexOf('Gợi ý: ' + sv) >= 0, nc);
  T('có nút "Gán mã gợi ý (1 dòng)", mỗi dòng có 🔍 Tìm mã và + Bảng giá', nc.all === 'Gán mã gợi ý (1 dòng)' && await E(`[...document.querySelectorAll('.md table.stknc tbody tr')].every(r=>/Tìm mã/.test(r.textContent) && /\\+ Bảng giá/.test(r.textContent))`), nc.all);
  await pg.shot(SHOT + '/s34_4_kho_gan_ma.png');
  await E(`document.querySelector('#btnStkSugAll').click()`); await sleep(2000);
  pg1 = (await A('purchaseGet', { id: pu.id })).data;
  T('gán gợi ý → dòng đơn mua 3 có mã ' + sv + ', dòng HĐ/PO 3 cũng điền', pg1.items[2].code === sv && (await A('get', { table: 'docs', id: hd.id })).data.items[2].code === sv);
  T('danh sách tự mở lại, còn 2 dòng tờ khai', await E(`document.querySelectorAll('.md table.stknc tbody tr').length===2`));
  await E(`[...document.querySelectorAll('.md table.stknc tbody tr')][0].querySelectorAll('button')[1].click()`); await sleep(1000);
  await E(`[...document.querySelectorAll('.md .mf button')].find(b=>b.textContent==='Thêm vào Bảng giá').click()`); await sleep(2500);
  const g = (await A('importGet', { id: tkId })).data;
  const nCode = g.items.filter(x => !x.item_code).length;
  T('"+ Bảng giá" từ Kho cho dòng tờ khai → tạo mã mới và ghi vào tờ khai (còn 1 dòng chưa mã)', nCode === 1 && g.items.some(x => /^SP00(0[7-9]|1\d)$/.test(x.item_code)), g.items.map(x => x.item_code));
  T('danh sách còn 1 dòng', await E(`document.querySelectorAll('.md table.stknc tbody tr').length===1`));
  await E(`document.querySelector('.md .mf button:last-child').click()`); await sleep(1500);
  sl = (await A('stockList', {})).data;
  T('đóng danh sách → trang Kho tải lại, còn 1 dòng chưa có mã', sl.nocode === 1 && /1 dòng chứng từ chưa có mã/.test(await E(`document.querySelector('#view').textContent`)), sl.nocode);

  console.log('— 3. Lưu đơn mua: điền mã vào dòng HĐ/PO trống mã + nhớ mã');
  const hd2 = (await A('save', { table: 'docs', rec: { type: 'PO', project_id: pj.id, doc_no: 'PO-PA-08', sign_date: '2026-11-22' }, items: [it('', 'Bơm chữa cháy diesel', 'NFP-50', 'Pentax', 'Bộ', 1, 150000000)] })).data.doc;
  const h2 = (await A('get', { table: 'docs', id: hd2.id })).data.items[0];
  const pu2 = (await A('purchaseSave', { rec: { supplier_id: ncc.id, status: 'DA_DAT' }, items: [{ project_id: pj.id, doc_id: hd2.id, doc_item_id: h2.id, code: 'SP0004', name: h2.name, model: h2.model, brand: h2.brand, unit: h2.unit, qty: 1, price: 118000000 }] })).data;
  T('purchaseSave có mã → điền mã vào dòng PO trống mã (doc_filled = 1)', pu2.doc_filled === 1 && (await A('get', { table: 'docs', id: hd2.id })).data.items[0].code === 'SP0004', pu2.doc_filled);

  console.log(`\nui34: ${ok} đạt, ${bad} lỗi`);
  pg.close(); c.proc.kill(); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(2); });
