const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 300)); } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4000);
  const A = (a, p) => pg.ev(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  let r = await A('save', { table: 'customers', rec: { name: 'KH máy A 1' } }); const c1 = r.data;
  r = await A('save', { table: 'customers', rec: { name: 'KH sẽ bị máy B xóa' } }); const c2 = r.data;
  await pg.ev(`HatoStore.syncNow()`); await sleep(1500);
  const drv = async (fn) => pg.ev(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.filter(x=>x.name==='CUSTOMERS.json')[0];const p=await D.read(f.id);${fn};return 1})()`);
  T('đồng bộ ban đầu: không xung đột', await pg.ev(`!HatoStore.state.conflict && Object.keys(HatoStore.meta().dirty).length===0`), await pg.ev(`JSON.stringify(HatoStore.meta().dirty)`));
  // máy B: sửa dòng c1 (tên), thêm KH mới, xóa c2 — ghi thẳng lên "Drive"
  await drv(`p.rows=p.rows.filter(r=>r[0]!=='${c2.id}'); p.rows.forEach(r=>{ if(r[0]==='${c1.id}'){ r[2]='KH máy A 1 (B đã sửa)'; } }); p.rows.push(['CB1','KB1','KH máy B thêm']); await D.write('CUSTOMERS.json',p,f.id)`);
  // máy A: thêm KH khác (dirty) rồi đồng bộ
  r = await A('save', { table: 'customers', rec: { name: 'KH máy A 2' } }); const c3 = r.data;
  await pg.ev(`HatoStore.syncNow()`); await sleep(2500);
  T('không báo xung đột', await pg.ev(`!HatoStore.state.conflict`));
  r = await A('list', { table: 'customers' }); const names = r.data.map(x => x.name);
  T('có KH do máy B thêm', names.includes('KH máy B thêm'), names);
  T('có KH máy A 2 (thêm ở máy này)', names.includes('KH máy A 2'), names);
  T('máy B xóa → xóa theo', !names.includes('KH sẽ bị máy B xóa'), names);
  const row1 = r.data.filter(x => x.id === c1.id)[0]; T('sửa của máy B được lấy', row1 && /B đã sửa/.test(row1.name || (r.data.find(x=>x.id===c1.id)||{}).name || ''), row1);
  // Drive cũng phải chứa bản gộp
  const rem = await pg.ev(`(async()=>{const D=window.__hatoDrive;const l=await D.list();const f=l.filter(x=>x.name==='CUSTOMERS.json')[0];return JSON.stringify((await D.read(f.id)).rows.map(r=>r[2]))})()`);
  T('Drive chứa bản đã gộp', /KH máy A 2/.test(rem) && /KH máy B thêm/.test(rem) && !/bị máy B xóa/.test(rem), rem);
  T('không còn bảng chờ gửi', await pg.ev(`Object.keys(HatoStore.meta().dirty).length===0`), await pg.ev(`JSON.stringify(HatoStore.meta().dirty)`));
  // ghi đua: Drive đổi giữa lúc list và write → thử lại
  await drv(`p.rows.push(['CB2','KB2','KH máy B thêm lần 2']); await D.write('CUSTOMERS.json',p,f.id)`);
  await A('save', { table: 'customers', rec: { name: 'KH máy A 3' } }); await pg.ev(`HatoStore.syncNow()`); await sleep(2500);
  r = await A('list', { table: 'customers' }); const n2 = r.data.map(x => x.name);
  T('lần 2: đủ cả hai bên', n2.includes('KH máy B thêm lần 2') && n2.includes('KH máy A 3'), n2);
  console.log('Lỗi console:', JSON.stringify(pg.logs)); console.log(ok + ' đạt, ' + bad + ' lỗi'); c.proc.kill(); process.exit(0);
})();
