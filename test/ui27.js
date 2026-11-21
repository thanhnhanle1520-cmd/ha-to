// Bản 27: BBGH / BBCT bỏ "tại …" và địa chỉ bên nhận · nút BBCT PDF, TBGH PDF · in A4 đứng đúng lề mọi trang · không in ngày giờ / tên file / đường dẫn
const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs'), { execSync } = require('child_process');
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 500)); } };
const txt = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty CP Cơ điện Kiểm thử', address: '122 Phổ Quang, Phường Đức Nhuận, TP.HCM' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'Trụ sở làm việc Kiểm thử', customer_id: cu.id, status: 'Đang thực hiện' } })).data;
  const items = []; for (let i = 1; i <= 45; i++) items.push({ name: 'Bình chữa cháy loại ' + i, model: 'SH.' + i, brand: 'Sông Hồng', unit: 'Bình', qty: i, price: 100000, cost: 60000 });
  const po = (await A('save', { table: 'docs', rec: { type: 'PO', project_id: pj.id, doc_no: 'CCDCAKH00004', vat_pct: 10, sign_date: '2026-11-21' }, items })).data.doc;
  const its = (await A('get', { table: 'docs', id: po.id })).data.items;
  const dl = (await A('save', { table: 'deliveries', rec: { project_id: pj.id, date: '2026-11-21', status: 'NHAP', place: 'Thôn Vĩnh Xuân, Vĩnh Thái, Nha Trang' }, items: its.map(x => ({ doc_id: po.id, doc_item_id: x.id, name: x.name, model: x.model, unit: x.unit, qty: x.qty })) })).data.delivery;

  console.log('— Nội dung BBGH / BBCT');
  for (const k of ['bbgh', 'bbct']) {
    const t = txt((await A('export', { kind: k, id: dl.id, format: 'html' })).data.html);
    T(k.toUpperCase() + ': "Hôm nay, ngày … , chúng tôi gồm:" không còn "tại …"', /Hôm nay, ngày 21 tháng 11 năm 2026, chúng tôi gồm:/.test(t), (t.match(/Hôm nay.{0,90}/) || [])[0]);
    T(k.toUpperCase() + ': bỏ địa chỉ bên nhận, giữ địa chỉ nhận hàng', !/122 Phổ Quang/.test(t) && /Địa chỉ nhận hàng: Thôn Vĩnh Xuân/.test(t));
  }

  console.log('— Nút in BBCT / TBGH');
  await E(`MEMO={};location.hash='#/delivery/${dl.id}'`); await sleep(2000);
  const bt = await E(`[...document.querySelectorAll('#acts button')].map(b=>b.textContent)`);
  T('phiếu giao có BBGH PDF, BBCT PDF, TBGH PDF', ['BBGH PDF', 'BBCT PDF', 'TBGH PDF'].every(x => bt.includes(x)), bt);
  await E(`[...document.querySelectorAll('#acts button')].find(b=>b.textContent==='BBCT PDF').click()`); await sleep(1800);
  T('BBCT PDF → xem trước, có nút In / Lưu PDF', await E(`!!document.querySelector('.ov iframe') && /BIÊN BẢN GIAO NHẬN CHỨNG TỪ/.test(document.querySelector('.ov iframe').contentDocument.body.textContent) && [...document.querySelectorAll('.ov button')].some(b=>/In/.test(b.textContent))`));
  T('xem trước hiển thị đúng khổ A4 đứng (rộng 210 mm)', Math.abs(await E(`document.querySelector('.ov iframe').contentDocument.querySelector('.sheet').getBoundingClientRect().width`) - 793.7) < 2);
  await pg.shot('/tmp/s27_preview.png');

  console.log('— In ra PDF như trình duyệt (bật đầu trang / chân trang)');
  const html = (await A('export', { kind: 'bbgh', id: dl.id, format: 'html' })).data.html;
  await E(`document.open();document.write(${JSON.stringify(html)});document.close()`); await sleep(800);
  const pdf = await pg.send('Page.printToPDF', { preferCSSPageSize: true, displayHeaderFooter: true, printBackground: false });
  fs.writeFileSync('/tmp/s27.pdf', Buffer.from(pdf.result.data, 'base64'));
  const pt = execSync('pdftotext -layout /tmp/s27.pdf -').toString(), pages = pt.split('\f').filter(x => x.trim()).length;
  T('2 trang A4', pages === 2, pages);
  T('không in ngày giờ / tên file / đường dẫn', !/https?:|about:blank|\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}|Biên bản giao nhận hàng GH-/.test(pt), pt.slice(0, 200));
  const sz = execSync('pdfinfo /tmp/s27.pdf').toString().match(/Page size:\s+([\d.]+) x ([\d.]+)/);
  T('khổ giấy A4 đứng 595 × 842 pt', Math.abs(+sz[1] - 595.3) < 2 && Math.abs(+sz[2] - 841.9) < 2, sz[0]);
  execSync('pdftoppm -r 72 -png /tmp/s27.pdf /tmp/s27p');
  const mm = px => px * 25.4 / 72, mg = execSync(`python3 -c "
from PIL import Image
import glob
for f in sorted(glob.glob('/tmp/s27p-*.png')):
  im=Image.open(f).convert('L'); w,h=im.size; px=im.load()
  rows=[y for y in range(h) if any(px[x,y]<200 for x in range(w))]; cols=[x for x in range(w) if any(px[x,y]<200 for y in range(h))]
  print(rows[0],h-1-rows[-1],cols[0],w-1-cols[-1])
"`).toString().trim().split('\n').map(l => l.split(' ').map(Number));
  console.log('    lề thực đo (mm) trên/dưới/trái/phải:', mg.map(m => m.map(v => mm(v).toFixed(1)).join(' / ')).join('  |  '));
  T('trang 1: lề trên ≥ 20, trái ≈ 30, phải ≥ 15 mm', mm(mg[0][0]) >= 19.5 && Math.abs(mm(mg[0][2]) - 30) < 1.5 && mm(mg[0][3]) >= 14.5, mg[0]);
  T('trang 2: vẫn có lề trên ≥ 20 và dưới ≥ 20 mm (lặp lại mỗi trang)', mm(mg[1][0]) >= 19.5 && mm(mg[0][1]) >= 19.5 && mm(mg[1][1]) >= 19.5, mg);
  execSync('pdftoppm -r 60 -png -f 2 -l 2 /tmp/s27.pdf /tmp/s27_page2');

  const errs = await E('window.__errs || []');
  console.log(`\n${ok} đạt, ${bad} lỗi`); if (errs.length) console.log('Lỗi console: ' + JSON.stringify(errs));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
