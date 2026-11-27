// Bản 41: tệp trùng tên trên Drive, Drive trả nội dung cũ, máy chạy bản cũ hơn dữ liệu
const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOT = process.env.SHOT_DIR || '/tmp';
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 400)); } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4000);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 800, deviceScaleFactor: 1, mobile: false });
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  const titles = async () => (await A('taskList', {})).data.tasks.map(t => t.title + '|' + t.status).sort();
  const files = (nm) => E(`(async()=>{const l=await window.__hatoDrive.list();return l.filter(x=>x.name==='${nm}').map(x=>x.id)})()`);
  const sync = async () => { await E(`HatoStore.syncNow()`); await sleep(400); for (let i = 0; i < 30; i++) { if (await E(`HatoStore.state.phase!=='syncing'`)) break; await sleep(200); } };
  const logs = () => E(`HatoStore.meta().log.map(x=>x.m)`);

  const t1 = (await A('taskSave', { rec: { title: 'Cánh tủ Lake side', end_date: '2026-12-01', type: 'Giao hàng' } })).data;
  await sync();
  T('ban đầu: 1 tệp TASKS.json', (await files('TASKS.json')).length === 1);

  console.log('— 1. Hai tệp TASKS.json trùng tên (hai cửa sổ cùng tạo)');
  // tệp thứ hai: việc PO.05, PO.06 + Cánh tủ đã sửa "Đang làm" (sửa sau)
  await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.filter(x=>x.name==='TASKS.json')[0];const p=await D.read(f.id);const h=p.rows[0];const ix=k=>h.indexOf(k);
    const row=(id,title)=>{const r=h.map(()=>'');r[0]=id;r[ix('kind')]='TASK';r[ix('title')]=title;r[ix('status')]='Đang làm';r[ix('start_date')]='2026-11-27';r[ix('end_date')]='2026-12-01';r[ix('updated_at')]='2099-01-01 00:00:00';return r};
    const q={rows:[h].concat(p.rows.slice(1).map(r=>{r=r.slice();r[ix('status')]='Đang làm';r[ix('updated_at')]='2099-01-01 00:00:00';return r}),[row('TPO5','PO.05 Dự án B5-CT02'),row('TPO6','PO.06 Đợt 1 Dự án B5-CT06')])};
    await D.write('TASKS.json',q,'data/TASKS.json#2');return 1})()`);
  T('giả lập: Drive có 2 tệp TASKS.json', (await files('TASKS.json')).length === 2);
  await sync(); await sync();
  let n = await titles();
  T('gộp đủ 3 việc', n.length === 3 && n.some(x => /PO.05/.test(x)) && n.some(x => /PO.06/.test(x)), n);
  T('Cánh tủ lấy bản sửa sau cùng (Đang làm)', n.includes('Cánh tủ Lake side|Đang làm'), n);
  T('còn đúng 1 tệp TASKS.json', (await files('TASKS.json')).length === 1, await files('TASKS.json'));
  T('nhật ký ghi lại gộp tệp trùng tên', (await logs()).some(m => /trùng tên/.test(m)), await logs());
  const before = (await logs()).length; for (let i = 0; i < 3; i++) await sync();
  const after = (await logs()).slice(before);
  T('không còn nhận TASKS liên tục', !after.some(m => /Nhận từ Drive: .*TASKS/.test(m)), after);
  n = await titles(); T('đồng bộ thêm 3 lần: vẫn đủ 3 việc', n.length === 3, n);
  await E(`document.querySelectorAll('#modals .ov').forEach(x=>x.remove());MEMO={};location.hash='#/tasks'`); await sleep(1800); await E(`document.querySelectorAll('#modals .ov').forEach(x=>x.remove());1`);
  await pg.shot(SHOT + '/s41_1_cong_viec_da_gop.png');
  await E(`HatoMigrate.openLog()`); await sleep(800); await pg.shot(SHOT + '/s41_2_nhat_ky_gop_tep.png'); await E(`document.querySelectorAll('#modals .ov').forEach(x=>x.remove());[...document.querySelectorAll('body > div')].filter(d=>/Nhật ký đồng bộ/.test(d.textContent)&&getComputedStyle(d).position==='fixed').forEach(d=>d.remove());1`);

  console.log('— 2. Không tạo tệp thứ hai khi Drive đã có');
  await E(`(()=>{const m=HatoStore.meta();delete m.versions.TASKS;return 1})()`);
  await A('taskSave', { rec: { title: 'Việc lúc chưa biết tệp', end_date: '2026-12-05' } }); await sync(); await sync();
  T('vẫn 1 tệp TASKS.json', (await files('TASKS.json')).length === 1, await files('TASKS.json'));
  n = await titles(); T('đủ 4 việc', n.length === 4, n);

  console.log('— 3. Drive trả nội dung cũ (lệch mã kiểm tra)');
  const oldTxt = await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.filter(x=>x.name==='TASKS.json')[0];return await D.readText(f.id)})()`);
  await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.filter(x=>x.name==='TASKS.json')[0];const p=await D.read(f.id);const h=p.rows[0];const r=h.map(()=>'');r[0]='TB9';r[h.indexOf('kind')]='TASK';r[h.indexOf('title')]='Việc máy B mới';r[h.indexOf('status')]='Chưa làm';r[h.indexOf('end_date')]='2026-12-09';p.rows.push(r);await D.write('TASKS.json',p,f.id);
    D.__rt=D.readText;D.readText=function(id){return /TASKS/.test(id)?Promise.resolve(${JSON.stringify(oldTxt)}):D.__rt(id)};return 1})()`);
  await sync();
  n = await titles();
  T('nội dung cũ: không nhận (vẫn 4 việc, không mất việc nào)', n.length === 4, n);
  T('nhật ký: Drive chưa cập nhật xong', (await logs()).some(m => /chưa cập nhật xong/.test(m)));
  await E(`(()=>{const D=window.__hatoDrive;D.readText=D.__rt;return 1})()`); await sleep(3500); await sync();
  n = await titles(); T('Drive cập nhật xong: nhận việc mới (5 việc)', n.length === 5 && n.some(x => /máy B mới/.test(x)), n);

  console.log('— 4. Máy chạy bản cũ hơn dữ liệu');
  await E(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.filter(x=>x.name==='_props.json')[0];const p=await D.read(f.id);p.props.SCHEMA='9.0.0';await D.write('_props.json',p,f.id);return 1})()`);
  await sync(); await sleep(500);
  await pg.shot(SHOT + '/s41_3_can_tai_lai.png');
  T('hiện màn hình "Cần tải lại" và khóa', await E(`!!document.getElementById('hato-reload') && /Cần tải lại/.test(document.getElementById('hato-gate').textContent)`));
  const v0 = await E(`(async()=>{const l=await window.__hatoDrive.list();return l.filter(x=>x.name==='TASKS.json')[0].version})()`);
  await E(`(api('taskSave',{rec:{title:'Sửa ở bản cũ',end_date:'2026-12-10'}}),1)`); await E(`HatoStore.syncNow()`); await sleep(2500);
  const v1 = await E(`(async()=>{const l=await window.__hatoDrive.list();return l.filter(x=>x.name==='TASKS.json')[0].version})()`);
  T('bản cũ không ghi đè lên Drive', v0 === v1, [v0, v1]);
  const pv = await E(`(async()=>{const l=await window.__hatoDrive.list();const f=l.filter(x=>x.name==='_props.json')[0];return (await window.__hatoDrive.read(f.id)).props.SCHEMA})()`);
  T('không hạ số phiên bản dữ liệu trên Drive', pv === '9.0.0', pv);
  console.log('Lỗi console:', JSON.stringify(pg.logs)); console.log(ok + ' đạt, ' + bad + ' lỗi'); c.proc.kill(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
