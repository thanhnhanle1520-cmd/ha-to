const { launch, open } = require('./cdp'); const fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 400)); } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s);
  const A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  const b64 = fs.readFileSync('/tmp/old.xlsx').toString('base64');
  await E(`(async()=>{const bin=atob('${b64}'),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const x=await HatoMigrate.importXlsx(new File([u],'o.xlsx'));await HatoStore.importWorkbook(x.snap);await reloadLookups();return 1})()`);
  for (let i = 0; i < 70; i++) await A('catalogSave', { rec: { brand: i % 2 ? 'Tomoken' : 'Dragon', group: i % 2 ? 'Nhóm thử B' : 'Nhóm thử A', name: 'Hàng ' + i, unit: i % 3 ? 'Cái' : 'Bộ', origin: 'Việt Nam', cost: 1000 + i } });
  await E(`MEMO={};location.hash='#/pricelist'`); await sleep(1500);
  console.log('— 1. Giữ bộ lọc / trang sau khi thêm, sửa');
  await E(`(()=>{const s=document.querySelectorAll('#view .bar2 select')[1];s.value='Nhóm thử A';s.dispatchEvent(new Event('change'));})()`); await sleep(700);
  T('đã lọc nhóm thử A (35)', /35 sản phẩm/.test(await E(`document.querySelector('#view .pager').textContent`)));
  // thêm hàng qua nút + Thêm hàng
  await E(`[...document.querySelectorAll('#acts button')].find(b=>/Thêm hàng/.test(b.textContent)).click()`); await sleep(500);
  T('có ô chọn ▾ cho Nhóm/Hãng/ĐVT/Xuất xứ', await E(`document.querySelectorAll('.ov .cb').length`) === 4, await E(`document.querySelectorAll('.ov .cb').length`));
  // mở danh sách nhóm
  await E(`(()=>{const lb=[...document.querySelectorAll('.ov label')].find(l=>/Nhóm hàng/.test(l.textContent));lb.querySelector('.cb-btn').click();})()`); await sleep(200);
  const gl = await E(`[...document.querySelectorAll('.ov .cb-list')].find(x=>x.style.display==='block').textContent`);
  T('danh sách nhóm có sẵn nhóm thử', /Nhóm thử B/.test(gl) && /Nhóm thử A/.test(gl), gl.slice(0,200));
  await E(`(()=>{const it=[...document.querySelectorAll('.ov .cb-it')].find(x=>x.textContent==='Nhóm thử A');it.dispatchEvent(new Event('mousedown'));})()`); await sleep(150);
  const fset = (lbl, v) => E(`(()=>{const lb=[...document.querySelectorAll('.ov label')].find(l=>l.querySelector('span').textContent.indexOf(${JSON.stringify(lbl)})===0);const i=lb.querySelector('input,textarea');i.focus();i.value=${JSON.stringify(v)};i.dispatchEvent(new Event('input',{bubbles:true}));i.blur();})()`);
  T('chọn từ danh sách điền vào ô', await E(`[...document.querySelectorAll('.ov label')].find(l=>/Nhóm hàng/.test(l.textContent)).querySelector('input').value`) === 'Nhóm thử A');
  await fset('ĐVT', 'Cuộn'); await sleep(150);
  await E(`(()=>{const lb=[...document.querySelectorAll('.ov label')].find(l=>/^ĐVT/.test(l.textContent));const i=lb.querySelector('input');i.focus();i.value='Thanh';i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(150);
  T('gõ giá trị mới → gợi ý "Dùng giá trị mới"', /Dùng giá trị mới: «Thanh»/.test(await E(`[...document.querySelectorAll('.ov .cb-list')].find(x=>x.style.display==='block').textContent`)));
  await E(`document.activeElement.blur()`); await sleep(200);
  await fset('Tên hàng', 'Hàng mới ZZZ'); await fset('Giá mua', '5000'); await sleep(100);
  await E(`[...document.querySelectorAll('.ov button')].find(b=>b.textContent==='Lưu').click()`); await sleep(1200);
  const sel = await E(`[...document.querySelectorAll('#view .bar2 select')].map(s=>s.value).join('|')`);
  T('sau khi thêm: bộ lọc nhóm vẫn giữ', sel === '|Nhóm thử A', sel);
  T('sau khi thêm: danh sách vẫn đang lọc (36)', /36 sản phẩm/.test(await E(`document.querySelector('#view .pager').textContent`)), await E(`document.querySelector('#view .pager').textContent`));
  const nr = await A('catalogList', { q: 'ZZZ' }); T('ĐVT gõ tay được lưu', nr.data.rows[0] && nr.data.rows[0].unit === 'Thanh', nr.data.rows[0]);
  // sang trang 2, sửa một hàng → vẫn ở trang 1? (36 dòng = 1 trang) → dùng bỏ lọc rồi sang trang 2
  await E(`(()=>{const s=document.querySelectorAll('#view .bar2 select')[1];s.value='';s.dispatchEvent(new Event('change'));})()`); await sleep(600);
  await E(`[...document.querySelectorAll('#view .pager button')].pop().click()`); await sleep(600);
  T('đang ở trang 2', /‹2\//.test(await E(`document.querySelector('#view .pager').textContent`)));
  await E(`document.querySelector('#view tbody tr.rw').click()`); await sleep(500);
  await fset('Ghi chú', 'đã sửa'); await E(`[...document.querySelectorAll('.ov button')].find(b=>b.textContent==='Lưu').click()`); await sleep(1000);
  T('sau khi sửa: vẫn ở trang 2', /‹2\//.test(await E(`document.querySelector('#view .pager').textContent`)), await E(`document.querySelector('#view .pager').textContent`));
  T('dòng vừa sửa được tô sáng', await E(`!!document.querySelector('#view tr.flash')`));
  // vẽ lại cả trang (như sau đồng bộ) vẫn giữ
  await E(`route()`); await sleep(800);
  T('vẽ lại trang (đồng bộ) vẫn ở trang 2', /‹2\//.test(await E(`document.querySelector('#view .pager').textContent`)));
  // mở lại từ menu → làm mới
  await E(`document.querySelector('#nav a[data-k=customers]').click()`); await sleep(500); await E(`document.querySelector('#nav a[data-k=pricelist]').click()`); await sleep(800);
  T('mở Bảng giá từ menu → về trang 1', /‹1\//.test(await E(`document.querySelector('#view .pager').textContent`)));
  // bảng chung (Khách hàng): tìm kiếm giữ sau khi vẽ lại
  for (let i = 0; i < 3; i++) await A('save', { table: 'customers', rec: { name: 'Khách ' + i } });
  await E(`MEMO={};location.hash='#/customers'`); await sleep(900);
  await E(`(()=>{const i=document.querySelector('#view .bar2 input[type=search]');i.value='Khách 1';i.dispatchEvent(new Event('input'));})()`); await sleep(400);
  await E(`route()`); await sleep(800);
  T('Khách hàng: ô tìm kiếm giữ sau khi vẽ lại', await E(`document.querySelector('#view .bar2 input[type=search]').value`) === 'Khách 1');
  T('Khách hàng: kết quả vẫn lọc', /1 dòng/.test(await E(`document.querySelector('#view .pager').textContent`)), await E(`document.querySelector('#view .pager').textContent`));

  console.log('— 2. Nút thu menu');
  T('có nút mũi tên ở menu', await E(`!!document.querySelector('#nav .navtg')`));
  const w0 = await E(`document.querySelector('#nav').classList.contains('open')`);
  await E(`document.querySelector('#nav .navtg').click()`); await sleep(300);
  T('bấm mũi tên đổi trạng thái thu/mở', await E(`document.querySelector('#nav').classList.contains('open')`) !== w0);
  T('nhớ trạng thái', await E(`localStorage.getItem('navOpen')`) === (w0 ? '0' : '1'));
  T('mũi tên đúng chiều', await E(`document.querySelector('#nav .navtg').textContent`) === (w0 ? '»' : '«'));

  console.log('— 3. Lỗi không bị nuốt');
  await E(`safe(Promise.reject(new Error('thử lỗi chương trình')))`); await sleep(200);
  T('safe(): lỗi chưa báo thì hiện thông báo đỏ', /thử lỗi chương trình/.test(await E(`document.querySelector('#toasts').textContent`)));

  console.log('— 4. Đồng bộ: tệp lỗi trên Drive không ghi đè');
  await E(`HatoStore.syncNow()`); await sleep(1500);
  const nCus = (await A('list', { table: 'customers' })).data.length;
  await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.find(x=>x.name==='CATALOG.json'||x.name==='CUSTOMERS.json'&&1);const g=l.find(x=>x.name==='CUSTOMERS.json');await D.write('CUSTOMERS.json',{rows:[]},g.id);})()`);
  // CUSTOMERS chỉ 3 dòng < 5 → thêm dòng cho đủ ngưỡng
  T('(chuẩn bị) số khách ≥ 3', nCus >= 3, nCus);
  for (let i = 3; i < 7; i++) await A('save', { table: 'customers', rec: { name: 'Khách ' + i } });
  await E(`HatoStore.syncNow()`); await sleep(1500);
  await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const g=l.find(x=>x.name==='CUSTOMERS.json');await D.write('CUSTOMERS.json',{rows:[]},g.id);})()`);
  await E(`HatoStore.syncNow()`); await sleep(1500);
  T('tệp rỗng bất thường bị bỏ qua', await E(`JSON.stringify(HatoStore.state.bad)`) === '["CUSTOMERS"]', await E(`JSON.stringify(HatoStore.state)`));
  const nLoc = (await A('list', { table: 'customers' })).data.length; T('dữ liệu khách trên máy còn nguyên', nLoc === nCus + 4, [nLoc, nCus]);
  T('thanh trạng thái báo đỏ', /Bỏ qua tệp lỗi/.test(await E(`document.getElementById('hato-sync').textContent`)));
  await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const g=l.find(x=>x.name==='CUSTOMERS.json');const m=await (async()=>{})();await D.write('CUSTOMERS.json','x',g.id);})()`);
  await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const g=l.find(x=>x.name==='PROJECTS.json');await D.write('PROJECTS.json',{rows:'hỏng'},g&&g.id);})()`);
  await E(`HatoStore.syncNow()`); await sleep(1500);
  T('tệp sai cấu trúc bị bỏ qua', /PROJECTS/.test(await E(`JSON.stringify(HatoStore.state.bad)`)), await E(`JSON.stringify(HatoStore.state.bad)`));
  T('nhật ký ghi lỗi', /PROJECTS.json trên Drive/.test(await E(`JSON.stringify(HatoStore.meta().log)`)));
  await E(`HatoStore.useLocal('CUSTOMERS')`); await sleep(1500); await E(`HatoStore.useLocal('PROJECTS')`); await sleep(1500);
  T('chọn "Ghi bản máy này" → hết lỗi', await E(`JSON.stringify(HatoStore.state.bad)`) === '[]', await E(`JSON.stringify(HatoStore.state.bad)`));
  const remC = await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const g=l.find(x=>x.name==='CUSTOMERS.json');return (await D.read(g.id)).rows.length})()`);
  T('Drive có lại đủ khách', remC === nLoc + 1, [remC, nLoc]);

  console.log('— 5. Sao lưu & khôi phục');
  await E(`HatoStore.backupNow('HA TO thử 1.json')`);
  let bl = await E(`HatoStore.listBackups()`); T('có bản sao lưu trong danh sách', bl.some(b => b.name === 'HA TO thử 1.json'), bl.map(b => b.name));
  await A('save', { table: 'customers', rec: { name: 'Khách sau sao lưu' } });
  const b1 = bl.find(b => b.name === 'HA TO thử 1.json');
  await E(`HatoStore.restoreBackup(${JSON.stringify(b1.id)}, 'HA TO thử 1.json')`); await sleep(1500);
  let names = (await A('list', { table: 'customers' })).data.map(x => x.name);
  T('khôi phục: mất khách thêm sau sao lưu', !names.includes('Khách sau sao lưu'), names);
  bl = await E(`HatoStore.listBackups()`); T('khôi phục tự sao lưu dữ liệu trước đó', bl.some(b => /trước khi khôi phục/.test(b.name)), bl.map(b => b.name));
  const remN = await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const g=l.find(x=>x.name==='CUSTOMERS.json');return JSON.stringify((await D.read(g.id)).rows.map(r=>r[2]))})()`);
  T('Drive cũng được khôi phục', !/sau sao lưu/.test(remN), remN);
  T('nhật ký có khôi phục', /Khôi phục từ/.test(await E(`JSON.stringify(HatoStore.meta().log)`)));
  // tệp sao lưu hỏng → từ chối, không đổi dữ liệu
  await E(`(async()=>{const D=window.__hatoDrive;await D.backup('HA TO hỏng.json',{sheets:{X:'abc'}});})()`);
  const bad1 = await E(`HatoStore.restoreBackup('backup/HA TO hỏng.json','hỏng').then(()=>'ok',e=>e.message)`);
  T('bản sao lưu hỏng bị từ chối', /lỗi|cấu trúc|không phải/.test(bad1), bad1);
  T('dữ liệu không đổi sau khi từ chối', (await A('list', { table: 'customers' })).data.length === names.length);
  console.log('— 6. Đăng xuất bị chặn khi còn dữ liệu chưa gửi (không áp dụng ở chế độ thử) — kiểm tra hàm có mặt');
  T('có hàm đăng xuất', await E(`typeof HatoStore.signOut`) === 'function');
  console.log('— 7. Menu dữ liệu');
  await E(`HatoMigrate.openMenu()`); await sleep(200);
  const mt = await E(`document.body.lastElementChild.textContent`);
  T('menu có Khôi phục, Nhật ký, Đăng xuất', /Khôi phục từ bản sao lưu/.test(mt) && /Nhật ký đồng bộ/.test(mt) && /Đăng xuất/.test(mt), mt);
  await E(`document.body.lastElementChild.remove()`); await E(`HatoMigrate.openLog()`); await sleep(200);
  T('nhật ký hiện sự kiện', /Gửi lên Drive/.test(await E(`document.body.lastElementChild.textContent`)));
  await E(`document.body.lastElementChild.remove()`);
  console.log('— 8. updated_at tự ghi');
  const pid = (await A('list', { table: 'projects' })).data[0];
  const cs = await A('save', { table: 'costs', rec: { project_id: pid.id, date: '2026-11-19', type: 'Khác', amount: 100 } });
  const cr = (await A('list', { table: 'costs' })).data.find(x => x.id === (cs.data && cs.data.id)) || cs;
  T('bảng Chi phí có updated_at', /^2026/.test(cr.updated_at || ''), cr);
  console.log('Lỗi console:', JSON.stringify(pg.logs.filter(x => !/thử lỗi chương trình|\[HATO\]/.test(x))));
  console.log(ok + ' đạt, ' + bad + ' lỗi'); c.proc.kill(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
