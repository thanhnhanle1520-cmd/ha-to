// Kiểm thử nhập Excel khách trên trình duyệt với file mẫu GIẢ trong test/fixtures (chạy được trên GitHub)
const { launch, open } = require('./cdp'); const fs = require('fs'), path = require('path'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 400)); } };
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  const cu = (await A('save', { table: 'customers', rec: { name: 'Khách CI' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'Dự án CI', customer_id: cu.id, status: 'Đang chào giá' } })).data;
  await E('reloadLookups()');
  await E(`(()=>{const o=URL.createObjectURL.bind(URL);window.__blobs=[];URL.createObjectURL=function(b){if(b instanceof Blob)window.__blobs.push(b);return o(b);};})()`);
  const card = i => `[...document.querySelectorAll('#view .card')][${i}]`;
  const nLines = () => E(`${card(3)}.querySelectorAll('tbody tr').length`);
  const btn = t => E(`[...document.querySelectorAll("#view button,#acts button")].find(b=>b.textContent.indexOf(${JSON.stringify(t)})>=0).click()`);
  async function check(rs) { for (const r of rs) await E(`(()=>{for(const x of ${card(2)}.querySelectorAll('tbody tr')){if(x.children[1].textContent==='${r}'){x.querySelector('input[type=checkbox]').click();return}}})()`); }
  async function openFile(file) {
    const b64 = fs.readFileSync(path.join(__dirname, 'fixtures', file)).toString('base64');
    await E(`MEMO={};location.hash='#/rfq/new?project=${pj.id}'`); await sleep(800);
    await E(`(()=>{const bin=atob('${b64}'),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const dt=new DataTransfer();dt.items.add(new File([u],'${file}'));const fi=document.querySelector('#view input[type=file]');fi.files=dt.files;fi.dispatchEvent(new Event('change'));})()`);
    for (let i = 0; i < 40; i++) { await sleep(200); if (await E(`[...document.querySelectorAll('#view h3')].some(x=>/Chọn dòng/.test(x.textContent))`)) break; }
  }
  async function toQuote() { await btn('Tạo báo giá từ'); for (let i = 0; i < 20; i++) { await sleep(300); if (/#\/quote\//.test(await E('location.hash'))) break; } return (await E('location.hash')).split('/')[2]; }
  async function exportRead() {
    await E(`window.__blobs=[]`); await btn('Xuất theo mẫu khách'); for (let i = 0; i < 40; i++) { await sleep(200); if (await E('window.__blobs.length')) break; }
    return E(`(async()=>{const b=window.__blobs.pop();if(!b)return null;const ab=await b.arrayBuffer();const bk=await XlsxLite.readFull(ab);const sx=new TextDecoder().decode(bk.files[bk.sheets[0].path]);return {rows:bk.sheets[0].rows,merges:bk.sheets[0].merges.length,hasF:(sx.match(/<f>/g)||[]).length,calc:/fullCalcOnLoad="1"/.test(new TextDecoder().decode(bk.files['xl/workbook.xml']))}})()`);
  }
  console.log('— File có tiêu đề 2 dòng (ô gộp), mục, dòng cha – con, công thức');
  await openFile('rfq_sample.xlsx');
  const mp = await E(`(()=>{const o={};${card(1)}.querySelectorAll('select').forEach(s=>{if(s.value)o[s.value]=s.closest('div').querySelector('.mut').textContent.replace('Cột ','')});return JSON.stringify(o)})()`);
  T('ghép cột tự động', JSON.parse(mp).qty === 'E' && JSON.parse(mp).price === 'F' && JSON.parse(mp).amount === 'G' && JSON.parse(mp).name === 'B', mp);
  const txt = await E(`${card(2)}.textContent`);
  T('dòng con ghép tên dòng cha', /Landing valve – DN50/.test(txt));
  T('9 hạng mục mặc định', await nLines() === 9, await nLines());
  await check([9, 10]); await btn('Gộp thành 1 hạng mục'); await sleep(300);
  T('gộp 2 dòng', await nLines() === 8, await nLines());
  await check([17]); await btn('Loại khỏi báo giá'); await sleep(300);
  T('loại 1 dòng', await nLines() === 7);
  let qid = await toQuote(); T('tạo báo giá', !!qid);
  const q = (await A('get', { table: 'quotes', id: qid })).data;
  T('dòng báo giá nhớ dòng nguồn', q.items.map(x => x.src_rows).join('|') === '7|9,10|11|13|14|15|16', q.items.map(x => x.src_rows));
  await A('save', { table: 'quotes', rec: q.quote, items: q.items.map((x, i) => Object.assign({}, x, { price: (i + 1) * 1000 })) });
  await E(`MEMO={};route()`); await sleep(1000);
  const out = await exportRead();
  T('xuất được file', !!out, out);
  const cell = (r, c) => (out.rows[r - 1] || [])[c];
  T('dòng đơn: ghi đơn giá', cell(7, 5) === 1000, out.rows[6]);
  T('dòng gộp: Trọn gói + tổng', cell(9, 5) === 'Trọn gói' && cell(9, 6) === 2000, out.rows[8]);
  T('dòng gộp: các dòng sau ghi Bao gồm', cell(10, 5) === 'Bao gồm trong mục trên');
  T('dòng bị loại để trống', !cell(17, 5), out.rows[16]);
  T('giữ ô gộp và công thức, Excel tự tính lại', out.merges >= 9 && out.hasF >= 2 && out.calc, out);
  console.log('— File không có dòng tiêu đề, không có cột giá');
  await openFile('rfq_noheader.xlsx');
  T('báo không thấy tiêu đề', /Không thấy dòng tiêu đề/.test(await E(`${card(0)}.textContent`)));
  T('3 dòng hàng', await nLines() === 4 || await nLines() === 3, await nLines());
  qid = await toQuote(); const q2 = (await A('get', { table: 'quotes', id: qid })).data;
  await A('save', { table: 'quotes', rec: q2.quote, items: q2.items.map(x => Object.assign({}, x, { price: 500 })) });
  await E(`MEMO={};route()`); await sleep(1000);
  const out2 = await exportRead(); const hdrRow = out2 && out2.rows.findIndex(r => r && r.includes('Đơn giá'));
  T('thêm cột Đơn giá / Thành tiền', hdrRow >= 0 && out2.rows[hdrRow].includes('Thành tiền'), out2 && out2.rows.slice(0, 6));
  T('nhớ cách ghép cột cho khách', Object.keys((await A('rfqMaps', { project_id: pj.id })).data.maps).length >= 1);
  console.log('Lỗi console:', JSON.stringify(pg.logs)); console.log(ok + ' đạt, ' + bad + ' lỗi'); c.proc.kill(); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
