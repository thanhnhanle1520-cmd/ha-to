// Bản 39: Tổng quan = Công việc hằng ngày (trang riêng) + Dashboard (chỉ báo cáo)
const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 400)); } };
const SHOT = process.env.SHOT_DIR || '/tmp';
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), NOPOP = () => E(`document.querySelectorAll('#modals .ov').forEach(x=>x.remove());1`), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  const td = await E(`today()`), add = (n) => E(`addD(today(),${n})`);
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty CP Kỹ thuật và Xây dựng Searefico' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'GRAND MERCURE HỘI AN', customer_id: cu.id, status: 'Đang thực hiện' } })).data;
  await A('save', { table: 'quotes', rec: { project_id: pj.id, vat_pct: 8, status: 'Đã gửi' }, items: [{ name: 'Bình chữa cháy bột ABC 4kg', unit: 'Bình', qty: 10, price: 360000, cost: 250000 }] });
  const tk = [['Gửi báo giá bình chữa cháy cho Searefico', 'Báo giá', 'Cao', -2, pj.id], ['Gọi khách xác nhận lịch giao', 'Gọi khách', 'Thường', 0, pj.id], ['Mở tờ khai lô hàng van báo động', 'Mua hàng', 'Cao', 0, ''], ['Đặt hàng tủ chữa cháy', 'Mua hàng', 'Thường', 1, pj.id], ['Theo dõi thanh toán đợt 2', 'Thanh toán', 'Thấp', 5, pj.id]];
  for (const t of tk) await A('taskSave', { rec: { title: t[0], type: t[1], priority: t[2], start_date: t[3] < 0 ? await add(t[3] - 1) : td, end_date: await add(t[3]), project_id: t[4], remind: '1' } });
  await E(`HatoStore.syncNow()`); await sleep(1500); await E(`MEMO={};location.reload()`); await sleep(5000);

  console.log('— 1. Menu Tổng quan có 2 mục');
  const nav = await E(`[...document.querySelectorAll('#nav a[data-k]')].slice(0,2).map(a=>a.dataset.k+':'+a.textContent.trim())`);
  T('Tổng quan: Công việc hằng ngày, Dashboard', /^tasks:Công việc hằng ngày/.test(nav[0]) && /^dashboard:Dashboard/.test(nav[1]), nav);
  T('mở app vào thẳng trang Công việc', await E(`location.hash===''||/tasks/.test(location.hash)`) && /Công việc hằng ngày/.test(await E(`document.querySelector('#title').textContent`)));
  T('menu Công việc có số việc cần chú ý', /\d/.test(await E(`(document.querySelector('#nav a[data-k="tasks"] .cnt')||{}).textContent||''`)));

  console.log('— 2. Trang Công việc hằng ngày');
  await E(`location.hash='#/tasks'`); await sleep(1800);
  const vt = await E(`document.querySelector('#view').textContent`);
  T('có bảng công việc + thêm nhanh', /Thêm nhanh/.test(await E(`document.querySelector('#view').innerHTML`)) && /Gửi báo giá bình chữa cháy/.test(vt) && /Trễ 2 ngày/.test(vt), vt.slice(0, 300));
  T('trang Công việc không có báo cáo', !/Dự án đang thực hiện \(/.test(vt));
  await E(`document.querySelector('#nav').classList.add('open')`); await sleep(300);
  await NOPOP(); await pg.shot(SHOT + '/s39_1_cong_viec.png');
  await E(`document.querySelector('#nav').classList.remove('open')`);
  // thêm nhanh → hiện ngay
  await E(`(()=>{const i=document.querySelector('#view input[placeholder^="Thêm nhanh"]');i.value='Gửi hồ sơ nghiệm thu PCCC';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));return 1})()`); await sleep(1500);
  T('thêm nhanh: việc mới hiện ngay', /Gửi hồ sơ nghiệm thu PCCC/.test(await E(`document.querySelector('#view').textContent`)));
  await sleep(2500);
  T('thêm nhanh: đã gửi lên Drive (không còn bảng chờ gửi)', await E(`Object.keys(HatoStore.meta().dirty).length===0`), await E(`JSON.stringify(HatoStore.meta().dirty)`));
  await E(`location.reload()`); await sleep(5000); await E(`location.hash='#/tasks'`); await sleep(1500);
  T('tải lại trang: việc mới vẫn còn', /Gửi hồ sơ nghiệm thu PCCC/.test(await E(`document.querySelector('#view').textContent`)));

  console.log('— 3. Dashboard chỉ báo cáo');
  await E(`location.hash='#/dashboard'`); await sleep(2500);
  const dt = await E(`document.querySelector('#view').textContent`);
  T('Dashboard không còn khối công việc', !(await E(`!!document.querySelector('#view .taskbox')`)) && !/Công việc hằng ngày/.test(dt), dt.slice(0, 200));
  T('Dashboard có báo cáo', /Dự án đang thực hiện/.test(dt), dt.slice(0, 300));
  await NOPOP(); await pg.shot(SHOT + '/s39_2_dashboard.png');

  console.log('— 4. Điện thoại');
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await E(`location.hash='#/tasks'`); await sleep(1800);
  await NOPOP(); await pg.shot(SHOT + '/s39_3_dien_thoai.png');
  T('điện thoại: không tràn ngang', await E(`document.documentElement.scrollWidth<=window.innerWidth+2`), await E(`[document.documentElement.scrollWidth,window.innerWidth]`));
  console.log('Lỗi console:', JSON.stringify(pg.logs)); console.log(ok + ' đạt, ' + bad + ' lỗi'); c.proc.kill(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
