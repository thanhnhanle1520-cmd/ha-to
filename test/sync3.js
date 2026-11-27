// Bản 39: lưu đúng lúc đang đồng bộ (thiết bị khác vừa đổi cùng bảng) → không được mất dữ liệu vừa lưu
const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 300)); } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4000);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  const UI = (a, p) => E(`new Promise(res=>google.script.run.withSuccessHandler(res).api(${JSON.stringify(a)},${JSON.stringify(p || {})}))`);   // đúng đường gọi của giao diện
  const remote = (file, js) => E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.filter(x=>x.name==='${file}')[0];const p=await D.read(f.id);${js};await D.write('${file}',p,f.id);return 1})()`);
  const slow = (fn, ms) => E(`(function(){const D=window.__hatoDrive;D.__o=D.__o||{};D.__o.${fn}=D.__o.${fn}||D.${fn};const o=D.__o.${fn};D.${fn}=function(){const a=arguments;return new Promise(r=>setTimeout(r,${ms})).then(()=>o.apply(D,a));};return 1})()`);
  const fast = () => E(`(function(){const D=window.__hatoDrive;Object.keys(D.__o||{}).forEach(k=>D[k]=D.__o[k]);return 1})()`);
  const titles = async () => (await A('taskList', {})).data.tasks.map(t => t.title);
  const idle = async () => { for (let i = 0; i < 40; i++) { await sleep(250); if (await E(`HatoStore.state.phase!=='syncing'&&Object.keys(HatoStore.meta().dirty).length===0`)) return; } };

  await A('taskSave', { rec: { title: 'Việc cũ', end_date: '2026-12-01' } }); await E(`HatoStore.syncNow()`); await idle();

  console.log('— 1. Thêm việc trong lúc đang tải bảng Công việc từ Drive');
  await remote('TASKS.json', `p.rows.push(['TB1','TASK','','Việc máy B'])`);
  await slow('read', 1000);
  await E(`(HatoStore.syncNow(),1)`); await sleep(300);
  await UI('taskSave', { rec: { title: 'Việc MỚI thêm', end_date: '2026-12-02' } });
  T('ngay sau khi thêm: thấy việc mới', (await titles()).includes('Việc MỚI thêm'));
  await sleep(1500); await fast(); await idle(); await sleep(500); await idle();
  let n = await titles();
  T('đồng bộ xong: việc mới vẫn còn', n.includes('Việc MỚI thêm'), n);
  T('đồng bộ xong: có cả việc của máy B', n.includes('Việc máy B'), n);
  const drv = await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.filter(x=>x.name==='TASKS.json')[0];return JSON.stringify((await D.read(f.id)).rows.map(r=>r[3]))})()`);
  T('Drive có đủ cả hai việc', /Việc MỚI thêm/.test(drv) && /Việc máy B/.test(drv), drv);
  T('nhật ký ghi lại lần gộp', await E(`HatoStore.meta().log.some(x=>/trong lúc đang tải/.test(x.m))`));

  console.log('— 2. Thêm việc trong lúc đang gửi lên Drive');
  await A('taskSave', { rec: { title: 'Việc A1', end_date: '2026-12-03' } });
  await slow('version', 800);
  await E(`(HatoStore.syncNow(),1)`); await sleep(200);
  await UI('taskSave', { rec: { title: 'Việc A2 (lúc đang gửi)', end_date: '2026-12-03' } });
  await sleep(1200); await fast(); await idle(); await sleep(500); await idle();
  // máy B lại sửa → máy này nhận về, việc A2 vẫn phải còn
  await remote('TASKS.json', `p.rows.push(['TB2','TASK','','Việc máy B lần 2'])`);
  await E(`HatoStore.syncNow()`); await idle();
  n = await titles();
  T('việc thêm lúc đang gửi vẫn còn và đã lên Drive', n.includes('Việc A2 (lúc đang gửi)') && n.includes('Việc máy B lần 2'), n);
  const drv2 = await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.filter(x=>x.name==='TASKS.json')[0];return JSON.stringify((await D.read(f.id)).rows.map(r=>r[3]))})()`);
  T('Drive có việc A2', /Việc A2/.test(drv2), drv2);

  console.log('— 3. Bảng khác (khách hàng) cũng không mất');
  await remote('CUSTOMERS.json', `p.rows.push(['CB9','KB9','KH máy B'])`);
  await slow('read', 1000); await E(`(HatoStore.syncNow(),1)`); await sleep(300);
  await UI('save', { table: 'customers', rec: { name: 'KH thêm lúc đồng bộ' } });
  await sleep(1500); await fast(); await idle(); await sleep(500); await idle();
  const cn = (await A('list', { table: 'customers' })).data.map(x => x.name);
  T('khách mới và khách máy B đều còn', cn.includes('KH thêm lúc đồng bộ') && cn.includes('KH máy B'), cn);

  console.log('— 4. Tốc độ đồng bộ');
  await A('taskSave', { rec: { title: 'Việc đo tốc độ', end_date: '2026-12-04' } });
  await E(`(()=>{const D=window.__hatoDrive;D.__w=0;const o=D.write;D.write=function(){D.__w=Date.now();D.write=o;return o.apply(D,arguments)};window.__t0=Date.now();return 1})()`);
  await UI('taskSave', { rec: { title: 'Việc đo tốc độ 2', end_date: '2026-12-04' } }); await sleep(1200);
  const dt = await E(`window.__hatoDrive.__w ? window.__hatoDrive.__w - window.__t0 : -1`);
  T('lưu xong gửi lên Drive trong vòng 1 giây', dt >= 0 && dt < 1000, dt);
  console.log('Lỗi console:', JSON.stringify(pg.logs)); console.log(ok + ' đạt, ' + bad + ' lỗi'); c.proc.kill(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
