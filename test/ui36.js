// Bản 36: mã hồ sơ mới (Loại + Năm Tháng - STT, sửa đổi .R1); báo giá in gọn 1 trang (lề 12/12/12/15 mm, giãn 1,15, thông tin 2 cột,
// chân trang mã · Trang x/y); bảng hàng chia lại cột, Hãng / Xuất xứ 2 dòng; tải Word ra 1 file .docx thật (logo nằm trong file)
const { launch, open } = require('./cdp'); const fs = require('fs'), path = require('path'), cp = require('child_process'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 600)); } };
const SHOT = process.env.SHOT_DIR || '/tmp';
const PREV = path.join(__dirname, '..', 'dist', '__xem_bao_gia36.html');
// đọc file zip kiểu "stored" (XlsxWrite.zip không nén)
function unzip(buf) {
  const out = {}; let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const size = buf.readUInt32LE(i + 18), nl = buf.readUInt16LE(i + 26), xl = buf.readUInt16LE(i + 28), name = buf.slice(i + 30, i + 30 + nl).toString('utf8');
    out[name] = buf.slice(i + 30 + nl + xl, i + 30 + nl + xl + size); i += 30 + nl + xl + size;
  }
  return out;
}
const has = c => { try { cp.execSync('which ' + c, { stdio: 'ignore' }); return true; } catch (e) { return false; } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 860, deviceScaleFactor: 1, mobile: false });
  const YM = await E(`(()=>{const d=today_();return d.slice(2,4)+d.slice(5,7)})()`);
  await A('saveConfig', { cfg: { company_name: 'Công ty TNHH Thương mại Dịch vụ Kỹ thuật Ha To', address: '123 Đường ABC, Phường X, Quận Y, TP. Đà Nẵng', phone: '0236 3 123 456', tax_code: '0401234567', email: 'info@hatoet.com', website: 'hatoet.com', bank1: 'STK 0041000123456 - Vietcombank CN Đà Nẵng' } }).catch(() => { });

  console.log('— 3. Mã hồ sơ mới');
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty CP Xây dựng Grand Mercure', contact: 'Anh Minh', phone: '0905 111 222', email: 'minh@gm.vn' } })).data;
  T('khách hàng giữ mã kiểu cũ KH-001 (không theo tháng)', /^KH-\d{3}$/.test(cu.code), cu.code);
  const pj = (await A('save', { table: 'projects', rec: { name: 'GRAND MERCURE HỘI AN', customer_id: cu.id, status: 'Đang thực hiện' } })).data;
  T('dự án: DA + năm tháng - số (DA' + YM + '-001)', new RegExp('^DA' + YM + '-\\d{3}$').test(pj.code), pj.code);
  const li = (name, model, brand, origin, unit, qty, price, note) => ({ name, model, brand, origin, unit, qty, price, cost: Math.round(price * .7), note });
  const items = [li('Bình chữa cháy bột ABC SÔNG HỒNG 4kg', 'SH.AP4', 'Sông Hồng-Thái Dương', 'Việt Nam', 'Bình', 4, 360000, 'Cấp phép lưu thông'),
    li('Bình chữa cháy khí CO2 SÔNG HỒNG 5kg', 'SH.C5', 'Sông Hồng-Thái Dương', 'Việt Nam', 'Bình', 4, 696000, 'Cấp phép lưu thông'),
    li('Đầu phun sprinkler hướng lên 68°C K5.6', 'TY3151', 'Tyco', 'Mỹ', 'Cái', 120, 95000, ''),
    li('Van góc chữa cháy DN50', 'FHIA', 'Shinyi', 'Đài Loan', 'Cái', 12, 378300, ''),
    li('Tủ chữa cháy trong nhà 600x900x220', 'TCC-01', 'Ha To', 'Việt Nam', 'Cái', 6, 1850000, 'Sơn tĩnh điện'),
    li('Chi phí giao hàng', '', '', '', 'Chuyến', 1, 800000, 'Cân vào đơn giá')];
  const q = (await A('save', { table: 'quotes', rec: { project_id: pj.id, vat_pct: 8, warranty_text: '12 tháng kể từ ngày giao hàng', deliver_place: 'Tại chân công trình', deliver_time: 'Có sẵn', pay_method: '100% sau khi giao hàng 30 ngày' }, items })).data.quote;
  T('báo giá: BG' + YM + '-001 (10 ký tự)', q.code === 'BG' + YM + '-001', q.code);
  const q2 = (await A('save', { table: 'quotes', rec: { project_id: pj.id, vat_pct: 8 }, items: items.slice(0, 2) })).data.quote;
  T('báo giá thứ 2 cùng tháng: số chạy tiếp -002', q2.code === 'BG' + YM + '-002', q2.code);
  const rv = (await A('reviseQuote', { id: q.id })).data;
  const xr = (await A('export', { kind: 'quote', id: rv.id, format: 'html' })).data;
  T('sửa đổi lần 1: số in "BG' + YM + '-001.R1", tên file BaoGia_BG' + YM + '-001.R1', /BG\d{4}-001\.R1/.test(xr.html) && xr.name === 'BaoGia_BG' + YM + '-001.R1.pdf', xr.name);
  const cv = (await A('convertQuote', { quote_id: q.id, type: 'HD' })).data.doc;
  T('HĐ: HD' + YM + '-001 (không dấu để tên file, tìm kiếm không lỗi)', cv && cv.code === 'HD' + YM + '-001', cv && cv.code);
  const po = (await A('save', { table: 'docs', rec: { type: 'PO', project_id: pj.id, sign_date: '2026-11-26' }, items: items.slice(0, 1) })).data;
  T('PO: PO' + YM + '-001', po && po.doc && /^PO\d{4}-001$/.test(po.doc.code), po && po.doc && po.doc.code);
  const hdi = (await A('get', { table: 'docs', id: cv.id })).data.items;
  const dv = (await A('save', { table: 'deliveries', rec: { project_id: pj.id, date: '2026-11-25', status: 'DA_GIAO' }, items: [{ doc_id: cv.id, doc_item_id: hdi[0].id, name: hdi[0].name, unit: hdi[0].unit, qty: 2 }] })).data.delivery;
  T('BBGH: GH' + YM + '-001', /^GH\d{4}-001$/.test(dv.code), dv.code);
  const ncc = (await A('supplierSave', { rec: { name: 'Công ty TNHH Thiết bị PCCC Sài Gòn' } })).data;
  const pu = (await A('purchaseSave', { rec: { supplier_id: ncc.id, order_date: '2026-11-21', vat_pct: 10, status: 'DA_DAT' }, items: [{ project_id: pj.id, name: 'Van góc', unit: 'Cái', qty: 2, price: 300000 }] })).data.purchase;
  T('đơn mua: DM' + YM + '-001', /^DM\d{4}-001$/.test(pu.code), pu.code);
  T('mã cũ giữ nguyên: số in báo giá kiểu cũ BG-2026-002 → "BG-2026-002V2"', await E(`quoteNo_({code:'BG-2026-002',version:2})==='BG-2026-002V2' && qNo({code:'BG-2026-002',version:2})==='BG-2026-002 v2' && qNo({code:'BG2611-003',version:3})==='BG2611-003.R2'`));
  await E(`MEMO={};location.hash='#/quotes'`); await sleep(1800);
  const qt = await E(`document.querySelector('#view').textContent`);
  T('danh sách báo giá: mã mới, cột Bản ghi Gốc / R1', qt.indexOf('BG' + YM + '-001') >= 0 && qt.indexOf('BG' + YM + '-002') >= 0 && /R1/.test(qt) && /Gốc/.test(qt), qt.slice(0, 300));
  await pg.shot(SHOT + '/s36_1_ma_ho_so.png');

  console.log('— 1, 4. Mẫu in báo giá');
  const x = (await A('export', { kind: 'quote', id: q.id, format: 'html' })).data.html;
  T('lề: trái 15 · phải 12 · trên 12 · dưới 12 mm', /padding:0 12mm 0 15mm/.test(x) && /@page\{size:A4;margin:0\}/.test(x) && /thead>tr>td\{height:12mm\}/.test(x), (x.match(/@page\{[^@]{0,80}/) || [''])[0]);
  T('giãn dòng 1,15; bảng hàng 11pt, đệm ô 3pt, căn giữa dọc', /line-height:1\.15/.test(x) && /table\.it td\{font-size:11pt;line-height:1\.15;padding:3pt;vertical-align:middle/.test(x));
  T('chân trang PDF: mã báo giá trong vùng lề dưới (lặp mỗi trang), không dùng lề của hộp thoại In', /<tfoot><tr><td><div class="pgft">BG\d{4}-001<\/div>/.test(x) && !/@bottom-right/.test(x));
  T('thông tin khách 2 cột: Khách hàng / Công trình bên trái, Số báo giá / Ngày / Người gửi bên phải', /Khách hàng:<\/td>.*Số báo giá:<\/td>/.test(x) && /Công trình:/.test(x) && /Ngày:<\/td>/.test(x));
  T('Hãng / Xuất xứ 2 dòng: "Sông Hồng-Thái Dương /<br>Việt Nam"', /Sông Hồng-Thái Dương \/<br>Việt Nam/.test(x));
  T('chia lại cột: STT 5%, Hãng / Xuất xứ 13%, Ghi chú 11%', /width:5%;white-space:nowrap">STT/.test(x) && /width:13%">Hãng \/<br>Xuất xứ/.test(x) && /width:11%;white-space:nowrap">Ghi chú/.test(x));
  T('đầu trang: logo + thông tin 1 hàng, kẻ mảnh', /<table class="hd lh"/.test(x) && /hr\.lh\{border:none;border-top:0\.75pt solid/.test(x));
  fs.writeFileSync(PREV, x);
  const pv = await open(c.port, 'http://127.0.0.1:8765/__xem_bao_gia36.html'); await sleep(1200);
  const pdf = await pv.send('Page.printToPDF', { preferCSSPageSize: true });
  const pdfBuf = Buffer.from(pdf.result.data, 'base64'), nPages = (pdfBuf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  T('báo giá 6 dòng hàng in vừa 1 trang A4', nPages === 1, nPages);
  // in như hộp thoại Chrome chọn Lề "Không có" (bản 37: lề vẫn đúng vì tạo trong nội dung)
  const pdf0 = await pv.send('Page.printToPDF', { preferCSSPageSize: false, paperWidth: 8.27, paperHeight: 11.69, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
  const p0 = Buffer.from(pdf0.result.data, 'base64');
  T('in với Lề "Không có": vẫn 1 trang', (p0.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length === 1);
  if (has('pdftoppm')) { const d0 = fs.mkdtempSync('/tmp/pdf37-'); fs.writeFileSync(d0 + '/a.pdf', p0); cp.execFileSync('pdftoppm', ['-r', '80', '-png', '-singlefile', d0 + '/a.pdf', d0 + '/a']); fs.copyFileSync(d0 + '/a.png', SHOT + '/s37_1_pdf_le_khong_co.png'); }
  await pv.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });
  await sleep(300); await pv.shot(SHOT + '/s36_2_mau_bao_gia.png'); pv.close();
  try { fs.unlinkSync(PREV); } catch (e) { }

  console.log('— 2. Tải Word: 1 file .docx');
  const dx = await E(`call('export',{kind:'quote',id:${JSON.stringify(q.id)},format:'doc'}).then(DocxWrite.convert).then(r=>({name:r.name,mime:r.mime,b:r.base64}))`);
  const zb = Buffer.from(dx.b, 'base64'), z = unzip(zb), names = Object.keys(z);
  T('tên file .docx, kiểu Word thật', dx.name === 'BaoGia_BG' + YM + '-001.docx' && dx.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', [dx.name, dx.mime]);
  T('logo nằm TRONG file (word/media), không còn thư mục "_files" bên ngoài', names.some(n => /^word\/media\/image1\.(png|jpeg)$/.test(n)) && !names.some(n => /_files|filelist|themedata/.test(n)), names);
  const dxml = z['word/document.xml'].toString('utf8');
  T('nội dung đầy đủ: tiêu đề, khách, dòng hàng, tổng tiền, chữ ký', /BÁO GIÁ/.test(dxml) && /Grand Mercure/.test(dxml) && /Bình chữa cháy khí CO2/.test(dxml) && /34\.628\.688/.test(dxml) && /XÁC NHẬN BÁO GIÁ/.test(dxml));
  T('lề trang Word đúng 12/12/12/15 mm', /<w:pgMar w:top="680" w:right="680" w:bottom="680" w:left="850"/.test(dxml), (dxml.match(/<w:pgMar[^>]*>/) || [''])[0]);
  T('bảng hàng là bảng Word thật (có viền, ô nền tiêu đề, gộp ô dòng tổng)', /<w:tbl>/.test(dxml) && /w:fill="EEF1F5"/.test(dxml) && /<w:gridSpan w:val="7"\/>/.test(dxml) && /<w:tblHeader\/>/.test(dxml));
  const ft = (z['word/footer1.xml'] || '').toString('utf8');
  T('chân trang Word: mã + Trang PAGE/NUMPAGES', /BG\d{4}-001 · Trang /.test(ft) && /NUMPAGES/.test(ft));
  const hx = await E(`call('export',{kind:'hd',id:${JSON.stringify(cv.id)},format:'doc'}).then(DocxWrite.convert).then(r=>({name:r.name,b:r.base64}))`);
  const hz = unzip(Buffer.from(hx.b, 'base64'));
  T('HĐ cũng tải ra .docx (lề NĐ 30, không chân trang)', /\.docx$/.test(hx.name) && /HỢP ĐỒNG KINH TẾ/.test(hz['word/document.xml'].toString('utf8')) && !hz['word/footer1.xml'], hx.name);
  const bx = await E(`call('export',{kind:'bbgh',id:${JSON.stringify(dv.id)},format:'doc'}).then(DocxWrite.convert).then(r=>r.name)`);
  T('BBGH tải ra .docx', /\.docx$/.test(bx), bx);
  if (has('soffice') && has('pdftoppm')) {      // xem thử file Word bằng LibreOffice (máy thử có thì chạy)
    const dir = fs.mkdtempSync('/tmp/docx36-'); fs.writeFileSync(dir + '/bg.docx', zb);
    try {
      cp.execSync(`cd ${dir} && soffice --headless --convert-to pdf bg.docx >/dev/null 2>&1 && pdftoppm -r 80 -png -singlefile bg.pdf bg`, { timeout: 90000 });
      const pages = +(cp.execSync(`pdfinfo ${dir}/bg.pdf | grep Pages | awk '{print $2}'`).toString().trim());
      T('file Word mở bằng LibreOffice: 1 trang, đúng bố cục', pages === 1, pages);
      fs.copyFileSync(dir + '/bg.png', SHOT + '/s36_3_file_word.png');
    } catch (e) { T('mở file Word bằng LibreOffice', false, String(e.message).slice(0, 200)); }
  } else console.log('  – bỏ qua mở thử file Word (máy không có LibreOffice)');

  console.log('— Xuất hàng loạt Word (zip) → mỗi báo giá 1 file .docx');
  await E(`window.__z=null;saveBlob=function(n,b){b.arrayBuffer().then(a=>{window.__z={n:n,u:[...new Uint8Array(a)]}})}`);
  await E(`bulkExport('quote',[${JSON.stringify(q.id)},${JSON.stringify(q2.id)}],'doc','BaoGia_test')`); await sleep(2500);
  const bz = await E(`window.__z`), bzf = bz ? Object.keys(unzip(Buffer.from(bz.u))) : [];
  T('zip gồm 2 file .docx', bzf.length === 2 && bzf.every(n => /\.docx$/.test(n)), bzf);

  console.log(`\n${ok} đạt, ${bad} lỗi`); if (pg.logs.length) console.log('Lỗi console:', pg.logs);
  pg.close(); c.proc.kill(); process.exit(bad ? 1 : 0);
})().catch(e => { try { fs.unlinkSync(PREV); } catch (x) { } console.log('CRASH', e && e.stack || e); process.exit(2); });
