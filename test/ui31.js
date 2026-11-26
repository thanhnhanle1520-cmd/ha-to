// Bản 31: Tờ khai nhập khẩu — đọc file ECUS (mẫu GIẢ test/fixtures/tk_ecus_mau.xlsx), kiểm tra chéo, ghép mã, gắn HĐ/PO → giá vốn,
// gắn từ trang HĐ, báo cáo thuế NK, DS xuất hóa đơn, cảnh báo trùng thuế NK, xóa tờ khai bỏ giá vốn
const { launch, open } = require('./cdp'); const fs = require('fs'), path = require('path'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 600)); } };
const SHOT = process.env.SHOT_DIR || '/tmp';
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 860, deviceScaleFactor: 1, mobile: false });
  const b64 = n => fs.readFileSync(path.join(__dirname, 'fixtures', n)).toString('base64');
  await E(`window.__file=function(b,n){var s=atob(b),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return new File([u],n)};1`);
  const it = (name, model, qty, price) => ({ name, model, unit: 'Cái', qty, price, cost: '', disc_pct: 0 });
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty TNHH Xây dựng Minh Long', short_name: 'Minh Long', address: '8 Nguyễn Huệ, Q.1' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'Nhà máy Minh Long', customer_id: cu.id, status: 'Đang thực hiện' } })).data;
  const hdr = (await A('save', { table: 'docs', rec: { type: 'HD', project_id: pj.id, doc_no: 'HĐ-ML-01', sign_date: '2026-11-20', terms: [{ name: 'Đợt 1', pct: 100, days: 30 }] }, items: [it('Đầu phun sprinkler hướng lên 74°C', 'TY7126', 500, 600000), it('Lăng phun chữa cháy cố định DN100', 'FFM-1', 1, 12000000), it('Tủ chữa cháy trong nhà', '', 10, 2500000)] })); if (!hdr.ok) console.log('HD', hdr); const hd = hdr.data.doc;
  await E(`(()=>{const ss=ss_();if(ss.getSheetByName('DuLieu_Chung'))return;const sh=ss.insertSheet('DuLieu_Chung');const v=[['STT','Thương hiệu','Nhóm hàng','Tên tiếng Việt','Model','ĐVT','Giá vốn','Giá bán tham chiếu','Trạng thái'],[1,'Tyco','Sprinkler','Đầu phun sprinkler hướng lên 74°C K5.6','TY7126','Cái',450000,600000,'Đang bán'],[2,'Walter','Lăng phun','Lăng phun chữa cháy cố định DN100','FFM-1/FFM32','Cái',9000000,12000000,'Đang bán']];sh.getRange(1,1,v.length,v[0].length).setValues(v);})()`);
  await E('reloadLookups()');
  T('dữ liệu thử đã tạo', !!(pj && hd));

  console.log('— Bộ đọc tờ khai ECUS');
  const P = await E(`(async()=>{const f=__file(${JSON.stringify(b64('tk_ecus_mau.xlsx'))},'ToKhaiHQ7N_QDTQ_100000000001.xlsx');const r=await tkReadFile(f);window.__tk=r;return {head:r.head,items:r.items,checks:r.checks,errors:r.errors,warnings:r.warnings}})()`);
  T('đọc đúng số tờ khai, loại hình, ngày đăng ký, luồng', P.head.decl_no === '100000000001' && P.head.type_code === 'A11' && P.head.reg_date === '2026-11-13' && P.head.channel === 'VANG', P.head);
  T('đọc đủ 4 dòng hàng ở trang 3–6 (6 trang)', P.items.length === 4 && P.head.pages === 6, P.items.length);
  T('số kiểu Việt Nam: 1.100 → 1100, 16,5 → 16.5, tỷ giá 25.420', P.items[0].qty === 1100 && P.items[1].inv_price === 16.5 && P.head.exchange_rate === 25420 && P.head.invoice_total === 33160, [P.items[0].qty, P.items[1].inv_price, P.head.exchange_rate]);
  T('tách Model / Hiệu từ mô tả', P.items[0].model === 'TY7126' && P.items[0].brand === 'Tyco' && P.items[3].model === 'FFM-1/FFM32' && P.items[3].brand === 'Walter', P.items.map(x => x.model + '|' + x.brand));
  T('số HĐ ngoại lấy từ phần ghi chú trang 2', P.head.contract_no === '01.2026/HATO' && P.head.contract_date === '2026-10-26', P.head.contract_no);
  T('kiểm tra chéo: số dòng, số trang, trị giá tính thuế, VAT, trị giá HĐ đều khớp', P.checks.length === 5 && P.checks.every(x => x.ok) && !P.errors.length, P.checks);
  T('giá vốn = đơn giá tính thuế + thuế NK/đvt (dòng 4: 7.880.200 + 394.010)', P.items[0].cost.cost === 432140 && P.items[3].cost.base === 7880200 && P.items[3].cost.tax === 394010 && P.items[3].cost.cost === 8274210, P.items[3].cost);
  const mm = await E(`(async()=>{const book=await XlsxLite.read(await __file(${JSON.stringify(b64('tk_ecus_mau.xlsx'))},'a.xlsx').arrayBuffer());const rows=book.TKN;for(const row of rows){if(row)for(let j=0;j<row.length;j++)if(row[j]==='842.927.200')row[j]='842.900.000';}const r=TkParse.parse(rows);return {bad:r.checks.filter(c=>!c.ok).map(c=>c.label),w:r.warnings}})()`);
  T('lệch tổng trị giá tính thuế → báo đúng mục lệch', mm.bad.length === 1 && /trị giá tính thuế/i.test(mm.bad[0]), mm);
  const ne = await E(`(async()=>{const r=await tkReadFile(__file(${JSON.stringify(b64('rfq_sample.xlsx'))},'baogia.xlsx'));return r.errors})()`);
  T('file không phải tờ khai → báo lỗi rõ ràng', ne.length && /<IMP>/.test(ne[0]), ne);

  console.log('— Nhập file → xem lại → gắn dự án → lưu');
  await E(`MEMO={};location.hash='#/imports'`); await sleep(1200);
  T('menu có "Tờ khai nhập khẩu", trang trống có ô kéo thả', await E(`!!document.querySelector('#nav a[data-k="imports"]') && !!document.querySelector('.tkdrop')`));
  await E(`tkImportFiles([__file(${JSON.stringify(b64('tk_ecus_mau.xlsx'))},'ToKhaiHQ7N_QDTQ_100000000001.xlsx')])`); await sleep(1800);
  T('1 file → mở màn hình xem lại', await E(`location.hash==='#/import/new' && /Xem lại tờ khai 100000000001/.test(document.querySelector('#title').textContent)`), await E('location.hash'));
  T('bảng dòng hàng có 3 cột: Đơn giá tính thuế · Thuế NK/đvt · Giá vốn/đvt', await E(`(()=>{const t=[...document.querySelectorAll('table.tkitems th')].map(x=>x.textContent);return t.includes('Đơn giá tính thuế')&&t.includes('Thuế NK/đvt')&&t.includes('Giá vốn/đvt')})()`));
  T('dòng 4: giá vốn 8.274.210 hiển thị', await E(`[...document.querySelectorAll('table.tkitems tbody tr')][3].querySelector('td.tkcost').textContent==='8.274.210'`), await E(`[...document.querySelectorAll('table.tkitems tbody tr')][3].querySelector('td.tkcost').textContent`));
  const sg = await E(`[...document.querySelectorAll('table.tkitems tbody tr')].map(tr=>tr.querySelector('input[type=text]').value+'|'+(tr.querySelector('.badge')?tr.querySelector('.badge').textContent:''))`);
  T('gợi ý mã hàng theo model từ bảng giá (dòng 1 → SP0001, dòng 4 → SP0002)', sg[0] === 'SP0001|theo model' && sg[3] === 'SP0002|theo model' && sg[1] === '|', sg);
  T('kiểm tra chéo hiển thị "khớp"', await E(`/khớp/.test(document.querySelector('.tkchk').textContent) && document.querySelector('.tkchk').classList.contains('ok')`));
  await pg.shot(SHOT + '/s31_2_xem_lai_to_khai.png');
  // gắn dòng 1 cho HĐ
  await E(`[...document.querySelectorAll('table.tkitems tbody tr')][0].querySelector('button.mini:last-child') && [...[...document.querySelectorAll('table.tkitems tbody tr')][0].querySelectorAll('button')].find(b=>b.textContent==='Gắn dự án').click()`); await sleep(900);
  T('gợi ý dòng HĐ cùng model lên đầu', await E(`/cùng model/.test(document.querySelector('.md tbody tr').textContent) && /TY7126/.test(document.querySelector('.md tbody tr').textContent)`), await E(`document.querySelector('.md tbody tr') && document.querySelector('.md tbody tr').textContent`));
  await E(`(()=>{const tr=document.querySelector('.md tbody tr');tr.querySelector('input[type=checkbox]').click();const q=tr.querySelector('input[type=number]');q.value=500;})()`);
  await pg.shot(SHOT + '/s31_3_gan_du_an.png');
  await E(`[...document.querySelectorAll('.md .mf button')].find(b=>b.textContent==='Gắn các dòng đã chọn').click()`); await sleep(400);
  T('bảng "Gắn cho dự án" có 1 dòng, SL 500', await E(`/500/.test([...document.querySelectorAll('.card')].find(c=>/Gắn cho dự án/.test(c.textContent)).querySelector('tbody').textContent)`));
  await E(`document.querySelector('#acts button.pri').click()`); await sleep(1800);
  const saved = await E(`location.hash`);
  T('lưu → chuyển sang trang tờ khai đã lưu', /^#\/import\/TK/.test(saved), saved);
  const tkId = saved.split('/')[2];
  let g = (await A('get', { table: 'docs', id: hd.id })).data;
  let l1 = g.items.find(x => x.model === 'TY7126');
  T('giá vốn tờ khai tự điền vào dòng HĐ (432.140, nguồn = tờ khai)', l1.cost === 432140 && l1.cost_src === tkId, [l1.cost, l1.cost_src]);
  T('cột nguồn giá có chi tiết tờ khai (đơn giá TT + thuế NK)', g.buy[l1.id] && g.buy[l1.id].tk.length === 1 && g.buy[l1.id].tk[0].base === 432140, g.buy[l1.id]);
  const gl = (await A('importGet', { id: tkId })).data;
  T('tờ khai lưu đủ: 4 dòng, thuế NK 394.010, VAT 67.434.176, luồng Vàng', gl.items.length === 4 && gl.decl.nk_total === 394010 && gl.decl.vat_total === 67434176 && gl.decl.channel === 'VANG', gl.decl);

  console.log('— Trùng số tờ khai, bộ nhớ ghép mã');
  await E(`tkImportFiles([__file(${JSON.stringify(b64('tk_ecus_mau.xlsx'))},'lai.xlsx')])`); await sleep(1500);
  T('nhập lại cùng số tờ khai → hỏi cập nhật, không tạo trùng', await E(`/đã có/.test(document.querySelector('.md .mh').textContent)`));
  await E(`document.querySelector('.md .mf button:last-child').click()`); await sleep(200);
  const it0 = gl.items[1];
  await A('importSave', { rec: Object.assign({}, gl.decl), items: gl.items.map((x, i) => Object.assign({}, x, { item_code: i === 1 ? 'SP0001' : x.item_code })) });
  const pr = (await A('importPrepare', { decl_no: '999', items: [{ description: it0.description, model: it0.model, brand: it0.brand }] })).data;
  T('đã ghép mã 1 lần → lần sau tự gợi ý ("đã nhớ")', pr.suggest[0] && pr.suggest[0].by === 'nho' && pr.suggest[0].code === 'SP0001', pr.suggest);

  console.log('— Gắn tờ khai từ trang HĐ');
  await E(`MEMO={};location.hash='#/doc/${hd.id}'`); await sleep(1800);
  T('trang HĐ có nút "Gắn tờ khai" và "DS xuất hóa đơn"', await E(`!!document.querySelector('#btnTkLink') && !!document.querySelector('#btnInvList')`));
  T('cột "Đơn mua / TK" có link tới tờ khai', await E(`!![...document.querySelectorAll('a')].find(a=>a.getAttribute('href')==='#/import/${tkId}')`));
  await E(`document.querySelector('#btnTkLink').click()`); await sleep(1000);
  const sug = await E(`[...document.querySelectorAll('.md tbody tr')].map(tr=>tr.querySelector('select').selectedOptions[0].text)`);
  T('modal gợi ý: dòng TY7126 giữ TK dòng 1, dòng FFM-1 gợi ý TK dòng 4, tủ không gắn', /dòng 1/.test(sug[0]) && /dòng 4/.test(sug[1]) && /không gắn/.test(sug[2]), sug);
  T('modal hiện 3 cột giá: đơn giá TT · thuế NK · giá vốn', await E(`/8\\.274\\.210/.test(document.querySelectorAll('.md tbody tr')[1].textContent) && /394\\.010/.test(document.querySelectorAll('.md tbody tr')[1].textContent)`));
  await E(`[...document.querySelectorAll('.md .mf button')].find(b=>b.textContent==='Lưu gắn tờ khai').click()`); await sleep(2200);
  g = (await A('get', { table: 'docs', id: hd.id })).data;
  const l2 = g.items.find(x => x.model === 'FFM-1');
  T('dòng lăng phun nhận giá vốn 8.274.210 (gồm thuế NK)', l2.cost === 8274210 && l2.cost_src === tkId, [l2.cost, l2.cost_src]);
  T('dòng tủ không gắn → giữ trống', !(g.items.find(x => /Tủ/.test(x.name)).cost > 0));
  await E(`MEMO={};route()`); await sleep(1500);
  await E(`document.querySelector('#btnTkLink').scrollIntoView({block:'start'});document.querySelectorAll('#toasts > *').forEach(t=>t.remove())`); await sleep(300);
  await pg.shot(SHOT + '/s31_4_hd_gia_von_to_khai.png');
  const b = (await A('projectBundle', { id: pj.id })).data;
  T('lãi dự án tính theo giá vốn tờ khai: giá vốn hàng = 500×432.140 + 8.274.210 + tủ chưa có giá', b.summary.cost_goods === 500 * 432140 + 8274210, b.summary.cost_goods);
  T('tab dự án liệt kê hàng nhập khẩu đã gắn', b.imports.length === 2 && b.imports.some(x => x.cost === 8274210), b.imports);

  console.log('— DS xuất hóa đơn');
  await E(`document.querySelector('#btnInvList').click()`); await sleep(900);
  const inv = await E(`[...document.querySelectorAll('.md tbody tr')].map(tr=>tr.children[1].textContent)`);
  T('tên hàng theo tờ khai cho dòng đã gắn, dòng khác giữ tên HĐ', /^Đầu phun nước hướng lên 74oC/.test(inv[0]) && /TK$/.test(inv[0]) && /^Súng phun chữa cháy/.test(inv[1]) && /^Tủ chữa cháy trong nhà$/.test(inv[2]), inv);
  await E(`window.__dl=[];XlsxWrite.download=function(n,sh){__dl.push({n:n,rows:sh[0].rows})};[...document.querySelectorAll('.md .mf button')].find(b=>b.textContent==='Excel').click()`); await sleep(300);
  const dl = await E(`__dl.pop()`);
  T('Excel DS xuất hóa đơn: 3 dòng + tiêu đề', dl && dl.rows.length === 4 && dl.rows[0][1] === 'Tên hàng hóa, dịch vụ', dl);
  await E(`document.querySelector('.md .mf button:last-child').click()`);
  T('mô tả hải quan KHÔNG in ra chứng từ HĐ', !/Sử dụng chữa cháy trong các toà nhà/.test(((await A('export', { kind: 'hd', id: hd.id, format: 'html' })).data || {}).html || 'X') );

  console.log('— Báo cáo thuế NK, cảnh báo trùng thuế');
  await E(`MEMO={};location.hash='#/imports?tab=report'`); await sleep(1500);
  T('báo cáo: thuế NK 394.010, VAT 67.434.176', await E(`(()=>{const t=[...document.querySelectorAll('.kpi')].map(k=>k.textContent).join('|');return /394\\.010/.test(t)&&/67\\.434\\.176/.test(t)})()`), await E(`[...document.querySelectorAll('.kpi')].map(k=>k.textContent).join('|')`));
  await pg.shot(SHOT + '/s31_5_bao_cao_thue_nk.png');
  await A('save', { table: 'costs', rec: { project_id: pj.id, date: '2026-11-21', type: 'Hải quan / thuế nhập khẩu', amount: 394010, payer: 'HATO', note: 'thuế NK' } });
  const b2 = (await A('projectBundle', { id: pj.id })).data;
  T('chi phí "Hải quan / thuế nhập khẩu" khi giá vốn đã gồm thuế NK → cảnh báo', b2.imp_warn && b2.imp_warn.tk_tax === 394010, b2.imp_warn);
  await E(`MEMO={};location.hash='#/imports'`); await sleep(1300);
  T('danh sách: 1 tờ khai, đã gắn dự án', await E(`document.querySelectorAll('#view tbody tr').length===1 && /100000000001/.test(document.querySelector('#view tbody').textContent)`));
  await pg.shot(SHOT + '/s31_1_danh_sach_to_khai.png');

  console.log('— Điện thoại');
  await E(`MEMO={};location.hash='#/import/${tkId}'`); await sleep(1500);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await sleep(600);
  T('điện thoại: trang không tràn ngang (bảng cuộn trong khung)', await E(`document.documentElement.scrollWidth<=window.innerWidth+2`), await E(`[document.documentElement.scrollWidth,window.innerWidth]`));
  await pg.shot(SHOT + '/s31_6_dien_thoai.png');
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 860, deviceScaleFactor: 1, mobile: false });

  console.log('— Xóa tờ khai');
  await A('importRemove', { id: tkId });
  g = (await A('get', { table: 'docs', id: hd.id })).data;
  T('xóa tờ khai → bỏ giá vốn đã điền từ tờ khai', g.items.every(x => !(x.cost > 0) && !x.cost_src), g.items.map(x => [x.cost, x.cost_src]));
  T('không lỗi console', !pg.logs.length, pg.logs);
  console.log(`ui31: ${ok} đạt, ${bad} lỗi`);
  pg.close(); c.proc.kill(); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
