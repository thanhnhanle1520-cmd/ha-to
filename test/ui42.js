// Bản 42: thanh nút báo giá gọn — Lưu · In / PDF · Gửi báo giá luôn hiện; "Tạo từ báo giá ▾" và "⋯ Thêm"; nút theo trạng thái; thanh cố định; màn hẹp
const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 600)); } };
const SHOT = process.env.SHOT_DIR || '/tmp';
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  const W = (w, hgt) => pg.send('Emulation.setDeviceMetricsOverride', { width: w, height: hgt || 900, deviceScaleFactor: 1, mobile: false });
  await W(1366);
  await E(`(()=>{const ss=ss_();if(ss.getSheetByName('DuLieu_Chung'))return;const sh=ss.insertSheet('DuLieu_Chung');const v=[['STT','Thương hiệu','Nhóm hàng','Tên tiếng Việt','Model','ĐVT','Giá vốn','Giá bán tham chiếu','Trạng thái'],[1,'Sông Hồng','Bình','Bình chữa cháy bột ABC 4kg','SH.AP4','Bình',250000,360000,'Đang bán']];sh.getRange(1,1,v.length,v[0].length).setValues(v);})()`);
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty CP Kỹ thuật và Xây dựng Searefico', contact: 'Ms. Hương' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'GRAND MERCURE HỘI AN', customer_id: cu.id, status: 'Đang chào giá' } })).data;
  const li = (name, model, qty, price, cost) => ({ name, model, brand: 'Sông Hồng-Thái Dương', origin: 'Việt Nam', unit: 'Bình', qty, price, cost });
  const items = [li('Bình chữa cháy bột ABC 4kg', 'SH.AP4', 4, 453000, 300000), li('Bình chữa cháy khí CO2 5kg', 'SH.C5', 4, 782000, 580000)];
  const q = (await A('save', { table: 'quotes', rec: { project_id: pj.id, customer_id: cu.id, vat_pct: 8 }, items })).data.quote;
  await E(`reloadLookups()`); await sleep(400);
  const go = async id => { await E(`location.hash='#/'`); await sleep(500); await E(`MEMO={};location.hash='#/quote/${id}'`); await sleep(1800); };
  const outside = () => E(`[...document.querySelectorAll('#acts > button')].map(b=>(b.getAttribute('aria-label')||b.textContent).replace('▾','').trim())`);
  const pop = () => E(`[...document.querySelectorAll('.pop button')].map(b=>b.textContent.trim())`);

  console.log('— Báo giá nháp: thanh nút gọn');
  await go(q.id);
  let o = await outside();
  T('ra ngoài chỉ còn 5 nút: Tạo từ báo giá · Thêm · Gửi báo giá · In / PDF · Lưu', JSON.stringify(o) === JSON.stringify(['Tạo từ báo giá', 'Thêm thao tác', 'Gửi báo giá', 'In / PDF', 'Lưu']), o);
  T('Lưu màu đỏ, đứng cuối bên phải', await E(`(()=>{const b=[...document.querySelectorAll('#acts > button')].pop();return b.classList.contains('pri')&&b.textContent.trim()==='Lưu'})()`));
  T('thanh không bị tràn, tiêu đề (số báo giá) vẫn hiện', await E(`(()=>{const a=document.querySelector('#acts'),b=document.querySelector('#bar'),t=document.querySelector('#title');return b.scrollWidth<=b.clientWidth+1&&t.getBoundingClientRect().width>60&&a.getBoundingClientRect().right<=innerWidth})()`), await E(`[document.querySelector('#bar').scrollWidth,document.querySelector('#bar').clientWidth,document.querySelector('#title').getBoundingClientRect().width]`));
  T('báo giá nháp: chưa hiện "Chuyển thành HĐ" ra ngoài', !(await E(`!!document.querySelector('#btnConvert')`)));
  await E(`document.querySelector('#btnQNew').click()`); await sleep(300);
  let m = await pop();
  T('menu "Tạo từ báo giá": Phiên bản mới · Copy · Báo giá cho khách khác · Chuyển thành HĐ/PO', JSON.stringify(m) === JSON.stringify(['Phiên bản mới (sửa lại)', 'Copy báo giá', 'Báo giá cho khách khác', 'Chuyển thành HĐ / PO / Phụ lục HĐ']), m);
  T('menu có vạch ngăn trước "Chuyển thành HĐ"', await E(`document.querySelectorAll('.pop .psep').length`) === 1);
  T('nút menu báo đang mở (aria-expanded)', await E(`document.querySelector('#btnQNew').getAttribute('aria-expanded')`) === 'true');
  await pg.shot(SHOT + '/s42_1_menu_tao.png');
  await E(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(200);
  T('Esc đóng menu', !(await E(`!!document.querySelector('.pop')`)) && await E(`document.querySelector('#btnQNew').getAttribute('aria-expanded')`) === 'false');
  await E(`document.querySelector('#btnQMore').click()`); await sleep(300);
  m = await pop();
  T('menu "⋯ Thêm": Kiểm tra · Cân chi phí · Xuất Excel · Xuất Word · Xóa báo giá (cuối)', JSON.stringify(m) === JSON.stringify(['Kiểm tra', 'Cân chi phí', 'Xuất Excel', 'Xuất Word', 'Xóa báo giá']), m);
  T('"Xóa báo giá" chữ đỏ', await E(`getComputedStyle(document.querySelector('#miDelete')).color`) === 'rgb(220, 38, 38)', await E(`getComputedStyle(document.querySelector('#miDelete')).color`));
  await pg.shot(SHOT + '/s42_2_menu_them.png');
  await E(`document.body.click()`); await sleep(200);
  T('bấm ra ngoài đóng menu', !(await E(`!!document.querySelector('.pop')`)));
  await E(`document.querySelector('#btnQMore').click();document.querySelector('#miCheck').click()`); await sleep(600);
  T('Kiểm tra trong menu vẫn chạy', await E(`!!document.querySelector('.md') || /Không có điểm bất thường/.test(document.querySelector('#toasts').textContent)`));
  await E(`document.querySelectorAll('.md .mf button').forEach(b=>{if(/Đóng|Hủy|Quay lại/.test(b.textContent))b.click()})`); await sleep(300);
  await E(`document.querySelector('#btnQPrint').click()`); await sleep(800); await E(`(()=>{const b=[...document.querySelectorAll('.md .mf button')].find(b=>b.textContent==='Vẫn xuất');if(b)b.click()})()`); await sleep(2000);
  T('In / PDF mở xem trước bản in', await E(`!!document.querySelector('.md iframe')`), await E(`[document.querySelectorAll('.md').length, document.querySelector('.md')?.textContent.slice(0,200), document.querySelector('#toasts').textContent, document.querySelector('#btnQPrint')?.outerHTML]`));
  await E(`[...document.querySelectorAll('.md .mf button')].find(b=>b.textContent.trim()==='Đóng').click()`); await sleep(300);

  console.log('— Thanh cố định khi cuộn');
  await E(`document.scrollingElement.scrollTop=2000;(document.querySelector('#main')||document.body).scrollTop=2000`); await sleep(300);
  T('cuộn xuống: thanh nút vẫn ở trên cùng', await E(`Math.abs(document.querySelector('#bar').getBoundingClientRect().top)<=1 && document.querySelector('#acts').getBoundingClientRect().bottom>0`));
  await E(`document.scrollingElement.scrollTop=0`);

  console.log('— Nút theo trạng thái');
  await A('save', { table: 'quotes', rec: Object.assign({}, q, { status: 'Đã gửi' }), items });
  await go(q.id);
  o = await outside();
  T('báo giá "Đã gửi": "Chuyển thành HĐ / PO" hiện ra ngoài', o.includes('Chuyển thành HĐ / PO'), o);
  await pg.shot(SHOT + '/s42_3_da_gui.png');
  await E(`document.querySelector('#btnConvert').click()`); await sleep(500);
  T('bấm "Chuyển thành HĐ / PO" mở hộp chuyển', /Chuyển báo giá/.test(await E(`(document.querySelector('.md')||{}).textContent||''`)));
  await E(`[...document.querySelectorAll('.md .mf button')].find(b=>b.textContent==='Chuyển').click()`); await sleep(2200);
  await go(q.id);
  o = await outside();
  T('đã chuyển PO: "Cập nhật PO" hiện ra ngoài, không còn "Chuyển thành HĐ / PO"', o.includes('Cập nhật PO') && !o.includes('Chuyển thành HĐ / PO'), o);
  await E(`document.querySelector('#btnQNew').click()`); await sleep(200);
  T('menu Tạo có thêm "Cập nhật PO"', (await pop()).includes('Cập nhật PO'));
  await E(`document.body.click()`); await sleep(200);

  console.log('— Màn hẹp (điện thoại)');
  await W(390, 800); await sleep(500);
  T('màn 390px: không tràn ngang, nút Lưu vẫn thấy', await E(`(()=>{const b=document.querySelector('#bar');const s=[...document.querySelectorAll('#acts > button')].pop().getBoundingClientRect();return b.scrollWidth<=innerWidth+1&&s.right<=innerWidth&&s.width>0})()`), await E(`[document.querySelector('#bar').scrollWidth,innerWidth]`));
  await E(`document.querySelector('#btnQMore').click()`); await sleep(300);
  T('màn hẹp: menu nằm gọn trong màn hình', await E(`(()=>{const r=document.querySelector('.pop').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`));
  await pg.shot(SHOT + '/s42_4_man_hep.png');
  await E(`document.body.click()`); await W(1366); await sleep(300);

  console.log('— Báo giá mới');
  await E(`location.hash='#/quote/new?project=${pj.id}'`); await sleep(1500);
  o = await outside();
  T('báo giá mới: chỉ Thêm · Gửi báo giá · Lưu (chưa có Tạo / In)', JSON.stringify(o) === JSON.stringify(['Thêm thao tác', 'Gửi báo giá', 'Lưu']), o);
  await E(`document.querySelector('#btnQMore').click()`); await sleep(200);
  T('menu Thêm của báo giá mới chỉ có Kiểm tra', JSON.stringify(await pop()) === '["Kiểm tra"]', await pop());
  await E(`document.body.click()`);

  console.log(`\n${ok} đạt, ${bad} lỗi`); if (pg.logs.length) console.log('Lỗi console:', pg.logs);
  pg.close(); c.proc.kill(); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(2); });
