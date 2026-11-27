// Bản 30: xuất hàng loạt (cột chọn, Excel danh sách, Word/Excel gói zip, PDF gộp, lọc theo khách) · nút có biểu tượng · menu TBGH/BBGH/BBCT
const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 500)); } };
const SHOT = process.env.SHOT_DIR || '/tmp';
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 860, deviceScaleFactor: 1, mobile: false });
  const item = (name, qty, price) => ({ name, unit: 'Cái', qty, price, cost: Math.round(price * 0.7), disc_pct: 0 });
  const ca = (await A('save', { table: 'customers', rec: { name: 'Công ty TNHH Xây dựng An Phát', short_name: 'An Phát', tax_code: '0312345678', address: '12 Lê Lợi, Q.1, TP.HCM', email: 'kt@anphat.vn' } })).data;
  const cb = (await A('save', { table: 'customers', rec: { name: 'Công ty CP Cơ điện Bình Minh', address: '45 Nguyễn Trãi, Hà Nội' } })).data;
  const pa = (await A('save', { table: 'projects', rec: { name: 'Nhà xưởng An Phát', customer_id: ca.id, status: 'Đang thực hiện' } })).data;
  const pb = (await A('save', { table: 'projects', rec: { name: 'Tòa nhà Bình Minh', customer_id: cb.id, status: 'Đang chào giá' } })).data;
  const q1 = (await A('save', { table: 'quotes', rec: { project_id: pa.id, vat_pct: 10 }, items: [item('Bình chữa cháy 8kg', 100, 300000)] })).data.quote;
  const q2 = (await A('save', { table: 'quotes', rec: { project_id: pa.id, vat_pct: 10 }, items: [item('Tủ chữa cháy', 10, 2000000)] })).data.quote;
  const q3 = (await A('save', { table: 'quotes', rec: { project_id: pb.id, vat_pct: 10 }, items: [item('Lăng phun', 5, 500000)] })).data.quote;
  const hd = (await A('save', { table: 'docs', rec: { type: 'HD', project_id: pa.id, doc_no: 'HĐ-AP-01', sign_date: '2026-11-20', terms: [{ name: 'Đợt 1', pct: 100, days: 30 }] }, items: [item('Bình chữa cháy 8kg', 100, 300000)] })).data.doc;
  const po = (await A('save', { table: 'docs', rec: { type: 'PO', project_id: pa.id, doc_no: 'PO-AP-02', sign_date: '2026-11-21' }, items: [item('Tủ chữa cháy', 10, 2000000)] })).data.doc;
  await E('reloadLookups()');
  T('dữ liệu thử đã tạo', !!(q1 && q2 && q3 && hd && po));
  // bắt file tải xuống thay vì lưu thật
  await E(`window.__dl=[];XlsxWrite.download=function(n,sh){__dl.push({n:n,rows:sh[0].rows})};saveBlob=function(n,b){b.arrayBuffer().then(function(a){var u=new Uint8Array(a),k=0,i=0,dv=new DataView(u.buffer);while(i+30<=u.length&&dv.getUint32(i,true)===0x04034b50){k++;i+=30+dv.getUint16(i+26,true)+dv.getUint16(i+28,true)+dv.getUint32(i+18,true);}__dl.push({n:n,size:u.length,files:k,type:b.type})})}`);

  console.log('— Khách hàng: cột chọn + Excel danh sách');
  await E(`MEMO={};location.hash='#/customers'`); await sleep(1500);
  T('bảng khách hàng có cột ô chọn và ô chọn tất cả', await E(`!!document.querySelector('#view table.t th.ck input') && document.querySelectorAll('#view table.t td.ck input').length>=2`));
  T('có nút Excel (chỉ biểu tượng, có chữ cho đọc màn hình)', await E(`(()=>{const b=[...document.querySelectorAll('#view .bar2 button')].find(b=>b.textContent==='Excel');return !!b && b.classList.contains('ionly') && !!b.querySelector('svg') && b.getAttribute('aria-label')==='Excel'})()`));
  await E(`[...document.querySelectorAll('#view tbody tr')].find(t=>/An Phát/.test(t.textContent)).querySelector('td.ck input').click()`); await sleep(200);
  T('chọn 1 dòng → thanh "Đã chọn 1"', await E(`(document.querySelector('.selbar')||{}).style.display!=='none' && /Đã chọn 1/.test(document.querySelector('.selbar').textContent)`));
  await pg.shot(SHOT + '/s30_1_khach_hang.png');
  await E(`[...document.querySelectorAll('#view .bar2 button')].find(b=>b.textContent==='Excel').click()`); await sleep(300);
  let d = await E(`__dl.pop()`);
  T('Excel khách hàng: chỉ dòng đã chọn, đủ cột Địa chỉ / Email', d && /^Danh_sach_khach_hang_\d{4}-\d\d-\d\d\.xlsx$/.test(d.n) && d.rows.length === 2 && d.rows[0].includes('Địa chỉ') && d.rows[0].includes('Email') && d.rows[1].includes('12 Lê Lợi, Q.1, TP.HCM'), d);
  await E(`[...document.querySelectorAll('.selbar button')].find(b=>b.textContent==='Bỏ chọn').click()`); await sleep(200);
  await E(`[...document.querySelectorAll('#view .bar2 button')].find(b=>b.textContent==='Excel').click()`); await sleep(300);
  d = await E(`__dl.pop()`);
  T('bỏ chọn → Excel xuất mọi dòng đang lọc', d && d.rows.length >= 3, d && d.rows.length);
  await E(`document.querySelector('#view tbody td.ck input').click()`); await sleep(200);
  await E(`[...document.querySelectorAll('.selbar button')].find(b=>b.textContent==='Excel danh sách').click()`); await sleep(300);
  d = await E(`__dl.pop()`);
  T('nút "Excel danh sách" trên thanh chọn: xuất đúng dòng đã chọn', d && d.rows.length === 2, d && d.rows.length);
  await E(`[...document.querySelectorAll('.selbar button')].find(b=>b.textContent==='Bỏ chọn').click()`); await sleep(200);
  T('bấm vào ô chọn không mở hồ sơ khách', await E(`location.hash==='#/customers'`));

  console.log('— Báo giá: lọc theo khách, chọn tất cả, Word zip, Excel zip, PDF gộp');
  await E(`MEMO={};location.hash='#/quotes'`); await sleep(1500);
  const fsel = await E(`(()=>{const s=[...document.querySelectorAll('#view .bar2 select')].find(s=>s.options[0].text==='Mọi khách hàng');return s?[...s.options].map(o=>o.text):null})()`);
  T('trang Báo giá có bộ lọc "Mọi khách hàng"', fsel && fsel.includes('Công ty TNHH Xây dựng An Phát'), fsel);
  await E(`(()=>{const s=[...document.querySelectorAll('#view .bar2 select')].find(s=>s.options[0].text==='Mọi khách hàng');s.value=${JSON.stringify(ca.id)};s.dispatchEvent(new Event('change'))})()`); await sleep(300);
  await E(`document.querySelector('#view table.t th.ck input').click()`); await sleep(200);
  T('lọc An Phát + chọn tất cả → chọn đúng 2 báo giá', await E(`/Đã chọn 2/.test(document.querySelector('.selbar').textContent)`), await E(`document.querySelector('.selbar').textContent`));
  const sb = await E(`[...document.querySelectorAll('.selbar button')].map(b=>b.textContent)`);
  T('thanh chọn có PDF gộp, Word (zip), Excel (zip)', ['PDF gộp', 'Word (zip)', 'Excel (zip)'].every(x => sb.includes(x)), sb);
  await pg.shot(SHOT + '/s30_2_bao_gia_chon.png');
  await E(`[...document.querySelectorAll('.selbar button')].find(b=>b.textContent==='Word (zip)').click()`); await sleep(2500);
  d = await E(`__dl.pop()`);
  T('Word (zip): 1 file .zip chứa 2 file', d && /^BaoGia_\d{4}-\d\d-\d\d\.zip$/.test(d.n) && d.files === 2 && d.type === 'application/zip', d);
  await E(`[...document.querySelectorAll('.selbar button')].find(b=>b.textContent==='Excel (zip)').click()`); await sleep(2500);
  d = await E(`__dl.pop()`);
  T('Excel (zip): 1 file .zip chứa 2 file', d && d.files === 2, d);
  await E(`[...document.querySelectorAll('.selbar button')].find(b=>b.textContent==='PDF gộp').click()`); await sleep(2500);
  const pv = await E(`(()=>{const f=document.querySelector('.ov iframe');if(!f)return null;const D=f.contentDocument;return {n:D.querySelectorAll('.bulkpg').length,bg:(D.body.textContent.match(/BÁO GIÁ/g)||[]).length,brk:getComputedStyle(D.querySelector('.bulkpg')).breakAfter,title:document.querySelector('.ov .mh b').textContent}})()`);
  T('PDF gộp: 1 trang xem trước, 2 báo giá, mỗi báo giá sang trang mới', pv && pv.n === 2 && pv.bg >= 2 && pv.brk === 'page' && /2 chứng từ/.test(pv.title), pv);
  T('xem trước có nút In / Lưu PDF', await E(`[...document.querySelectorAll('.ov button')].some(b=>/In \\/ Lưu PDF/.test(b.textContent))`));
  await pg.shot(SHOT + '/s30_3_pdf_gop.png');
  await E(`document.querySelector('.ov').remove()`);
  await E(`[...document.querySelectorAll('#view .bar2 button')].find(b=>b.textContent==='Excel').click()`); await sleep(300);
  d = await E(`__dl.pop()`);
  T('Excel danh sách báo giá: 2 dòng đã chọn, cột Tổng là số', d && /^Danh_sach_bao_gia_/.test(d.n) && d.rows.length === 3 && typeof d.rows[1][d.rows[0].indexOf('Tổng (có VAT)')] === 'number', d);

  console.log('— HĐ / PO: chỉ HĐ có mẫu xuất');
  await E(`MEMO={};location.hash='#/docs'`); await sleep(1500);
  T('trang HĐ có bộ lọc "Mọi khách hàng" (đã bật lại)', await E(`[...document.querySelectorAll('#view .bar2 select')].some(s=>s.options[0].text==='Mọi khách hàng')`));
  await E(`document.querySelector('#view table.t th.ck input').click()`); await sleep(200);
  await E(`[...document.querySelectorAll('.selbar button')].find(b=>b.textContent==='PDF gộp').click()`); await sleep(2500);
  const t2 = await E(`[...document.querySelectorAll('#toasts .toast')].map(t=>t.textContent).join(' | ')`);
  T('chọn HĐ + PO → báo bỏ qua PO, gộp 1 HĐ', /Bỏ qua 1 PO/.test(t2) && await E(`document.querySelector('.ov iframe').contentDocument.querySelectorAll('.bulkpg').length===1`), t2);
  await E(`document.querySelector('.ov').remove()`);
  T('thanh chọn HĐ không có Excel (zip)', !(await E(`[...document.querySelectorAll('.selbar button')].some(b=>b.textContent==='Excel (zip)')`)));

  console.log('— Hồ sơ khách hàng: xuất báo giá / HĐ theo khách');
  await E(`MEMO={};location.hash='#/customer/${ca.id}/quotes'`); await sleep(1500);
  await E(`document.querySelector('#view table.t th.ck input').click()`); await sleep(200);
  await E(`[...document.querySelectorAll('.selbar button')].find(b=>b.textContent==='Word (zip)').click()`); await sleep(2500);
  d = await E(`__dl.pop()`);
  T('tab Báo giá của khách: zip tên theo khách, đủ 2 báo giá', d && /^BaoGia_.+_\d{4}-\d\d-\d\d\.zip$/.test(d.n) && d.files === 2, d);
  await E(`MEMO={};location.hash='#/customer/${ca.id}/docs'`); await sleep(1500);
  T('tab HĐ / PO của khách có cột chọn', await E(`!!document.querySelector('#view table.t th.ck input')`));

  console.log('— Bảng giá: Excel theo bộ lọc');
  // chế độ thử chưa có sheet bảng giá (bản thật lấy từ dữ liệu cũ) → tạo sheet nhỏ 2 mặt hàng
  await E(`(()=>{const ss=ss_();if(ss.getSheetByName('DuLieu_Chung'))return;const sh=ss.insertSheet('DuLieu_Chung');const v=[['STT','Thương hiệu','Nhóm hàng','Tên tiếng Việt','Model','ĐVT','Giá vốn','Giá bán tham chiếu','Trạng thái'],[1,'Sông Hồng','Bình chữa cháy','Bình bột ABC 4kg','MFZL4','Bình',180000,250000,'Đang bán'],[2,'Tomoken','Đầu báo','Đầu báo khói','TM-S','Cái',300000,420000,'Đang bán']];sh.getRange(1,1,v.length,v[0].length).setValues(v);RT={user:RT.user,ss:RT.ss};})()`);
  const cs = await A('catalogSave', { rec: { brand: 'Sông Hồng', group: 'Bình chữa cháy', name: 'Bình bột ABC 8kg', model: 'MFZL8', unit: 'Bình', cost: 250000 } });
  if (!cs.ok) console.log('  (không tạo được hàng bảng giá: ' + cs.error + ')');
  await E(`MEMO={};PL_ST=null;location.hash='#/pricelist'`); await sleep(2000);
  T('Bảng giá có nút Excel theo bộ lọc', await E(`!!document.getElementById('btnPlXls') && document.getElementById('btnPlXls').classList.contains('ionly')`));
  await E(`(()=>{const s=[...document.querySelectorAll('#view .bar2 select')].find(s=>s.options[0].text==='Tất cả hãng');s.value='Tomoken';s.dispatchEvent(new Event('change'))})()`); await sleep(800);
  await E(`document.getElementById('btnPlXls').click()`); await sleep(800);
  d = await E(`__dl.pop()`);
  T('Excel bảng giá theo hãng Tomoken: chỉ hàng Tomoken, tên file có hãng', d && /^Bang_gia_tomoken_/.test(d.n) && d.rows.length === 2 && d.rows[1].includes('Tomoken'), d);

  console.log('— Nút biểu tượng');
  await E(`MEMO={};location.hash='#/quote/${q1.id}'`); await sleep(2000);
  const qb = await E(`[...document.querySelectorAll('#acts button')].map(b=>({t:b.textContent,ic:!!b.querySelector('svg.bi, .bi svg'),only:b.classList.contains('ionly')}))`);
  const f = t => qb.find(x => x.t === t) || {};
  T('trang báo giá: Lưu có biểu tượng + chữ', f('Lưu').ic && !f('Lưu').only, qb);
  T('trang báo giá: Excel / PDF / Word chỉ biểu tượng', ['Excel', 'PDF', 'Word'].every(t => f(t).ic && f(t).only), qb);
  await pg.shot(SHOT + '/s30_4_bao_gia_nut.png');
  await E(`MEMO={};location.hash='#/customers'`); await sleep(1200);
  T('"+ Khách hàng" có biểu tượng, chữ vẫn là "+ Khách hàng"', await E(`(()=>{const b=[...document.querySelectorAll('#acts button')].find(b=>b.textContent==='+ Khách hàng');return !!b && !!b.querySelector('.bi') && b.querySelector('.lb .vh').textContent==='+ ' && b.querySelector('.lb').lastChild.textContent==='Khách hàng'})()`));
  T('nút đổi chữ vẫn đúng (không lặp biểu tượng)', await E(`[...document.querySelectorAll('button')].every(b=>b.querySelectorAll(':scope > .bi').length<=1)`));

  console.log('— Phiếu giao: menu TBGH / BBGH / BBCT');
  const its = (await A('get', { table: 'docs', id: po.id })).data.items;
  const dv = (await A('save', { table: 'deliveries', rec: { project_id: pa.id, date: '2026-11-22', status: 'NHAP' }, items: its.map(x => ({ doc_id: po.id, doc_item_id: x.id, name: x.name, unit: x.unit, qty: 1 })) })).data.delivery;
  await E(`MEMO={};location.hash='#/delivery/${dv.id}'`); await sleep(2000);
  T('còn 3 nút thay cho 6 nút', await E(`document.querySelectorAll('#acts .mbtn').length===3 && ![...document.querySelectorAll('#acts button')].some(b=>/ PDF$/.test(b.textContent))`));
  await E(`document.getElementById('btnTBGH').click()`); await sleep(300);
  await pg.shot(SHOT + '/s30_5_menu_giao_hang.png');
  await E(`document.body.click()`); await sleep(200);
  T('bấm ra ngoài → đóng menu', await E(`!document.querySelector('.pop')`));

  console.log('— Điện thoại');
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await E(`MEMO={};location.hash='#/quote/${q1.id}'`); await sleep(2000);
  T('điện thoại: nút phụ trên thanh trên cùng chỉ còn biểu tượng', await E(`(()=>{const b=[...document.querySelectorAll('#acts button.hasic:not(.pri)')];return b.length>0 && b.every(x=>x.querySelector('.lb').getBoundingClientRect().width<=1)})()`));
  await pg.shot(SHOT + '/s30_6_dien_thoai.png');
  await E(`MEMO={};location.hash='#/quotes'`); await sleep(1500);
  await E(`document.querySelectorAll('#view table.t td.ck input')[0].click()`); await sleep(200);
  await pg.shot(SHOT + '/s30_7_dien_thoai_chon.png');

  const errs = await E('window.__errs || []');
  console.log(`\n${ok} đạt, ${bad} lỗi`); if (errs.length) console.log('Lỗi console: ' + JSON.stringify(errs));
  if (pg.logs.length) console.log('Lỗi console: ' + JSON.stringify(pg.logs));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
