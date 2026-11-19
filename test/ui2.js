const { launch, open } = require('./cdp'); const fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4000);
  const b64 = fs.readFileSync('/tmp/old.xlsx').toString('base64');
  const r = await pg.ev(`(async()=>{ const bin=atob('${b64}'), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    const f=new File([u],'old.xlsx'); const x=await HatoMigrate.importXlsx(f); return {found:x.found, cust:x.snap.sheets.CUSTOMERS}; })().catch(e=>({err:String(e)}))`);
  console.log(JSON.stringify(r));
  ok(!r.err && r.cust.length === 3, 'đọc 2 khách (bỏ dòng trống)');
  ok(r.cust && r.cust[1][9] === '2024-05-03' && r.cust[1][10] === '2024-05-04 10:30:00', 'ngày đổi đúng chuỗi');
  ok(r.cust && r.cust[2][3] === 312, 'số giữ nguyên');
  const r2 = await pg.ev(`(async()=>{ const bin=atob('${b64}'), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    const x=await HatoMigrate.importXlsx(new File([u],'old.xlsx')); await HatoStore.importWorkbook(x.snap); const l=api('list',{table:'customers'}).data; return l.map(a=>a.name); })().catch(e=>({err:String(e)}))`);
  console.log(JSON.stringify(r2)); ok(Array.isArray(r2) && r2.length === 2 && r2.join().indexOf('Ánh Dương') >= 0, 'importWorkbook → danh sách khách đúng');
  // Nhập file bảng (readTableFile) với xlsx
  const r3 = await pg.ev(`(async()=>{ const bin=atob('${b64}'), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); const rows=await readTableFile(new File([u],'a.xlsx')); return rows.length; })().catch(e=>String(e))`);
  ok(r3 >= 2, 'readTableFile đọc .xlsx: ' + r3);
  await pg.ev("HatoMigrate.openMenu()"); ok(await pg.ev("document.body.innerText.indexOf('Nhập dữ liệu từ HATO ERP cũ')>=0"), 'menu chip mở được');
  console.log('Lỗi console:', pg.logs.slice(0, 6)); console.log(`${pass} đạt, ${fail} lỗi`); c.proc.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
