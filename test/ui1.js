const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1');
  await sleep(4000);
  ok(await pg.ev("!document.getElementById('hato-gate')"), 'không còn màn hình đăng nhập (chế độ thử)');
  ok(await pg.ev("document.title.indexOf('HA TO')>=0"), 'tiêu đề trang = HA TO: ' + await pg.ev('document.title'));
  const nav = await pg.ev("document.querySelectorAll('#nav a, #nav .item, #nav li, #nav button').length"); ok(nav > 5, 'menu có ' + nav + ' mục');
  const t0 = Date.now();
  const r = await pg.ev(`new Promise(res=>{ call('save',{table:'customers',rec:{name:'Cty Thử Nghiệm',tax_code:'0312345678',contact:'Anh A'}}).then(x=>res({ok:1,x}),e=>res({err:String(e)})) })`); ok(r.ok, 'tạo khách hàng qua giao diện: ' + JSON.stringify(r).slice(0, 80));
  console.log('   thời gian gọi lưu:', Date.now() - t0, 'ms');
  const cnt = await pg.ev(`new Promise(res=>call('list',{table:'customers'}).then(l=>res(l.length)))`); ok(cnt === 1, 'danh sách khách hàng có 1 dòng');
  await pg.ev("location.hash='#/customers'"); await sleep(1500);
  ok(await pg.ev("document.getElementById('view').innerText.indexOf('Cty Thử Nghiệm')>=0"), 'trang Khách hàng hiện đúng khách vừa tạo');
  ok(await pg.ev("[...document.querySelectorAll('button')].some(b=>b.textContent==='Nhập file')"), 'có nút Nhập file');
  await pg.shot('/tmp/ui1.png');
  // lưu IndexedDB rồi tải lại: dữ liệu còn
  await sleep(2500);
  await pg.send('Page.reload'); await sleep(4000);
  ok(await pg.ev(`new Promise(res=>call('list',{table:'customers'}).then(l=>res(l.length===1&&l[0].name==='Cty Thử Nghiệm')))`), 'tải lại trang: dữ liệu còn nguyên (IndexedDB)');
  console.log('Lỗi console:', pg.logs.slice(0, 6));
  console.log(`\n${pass} đạt, ${fail} lỗi`); c.proc.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
