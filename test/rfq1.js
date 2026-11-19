// Kiểm thử nhập Excel khách với file thật (đặt trong RFQ_DIR, mặc định /tmp/rfqfiles — KHÔNG đưa file khách lên GitHub)
const { launch, open } = require('./cdp'); const fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const DIR = process.env.RFQ_DIR || '/tmp/rfqfiles', OUT = process.env.RFQ_OUT || '/tmp/rfqout';
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 400)); } };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  const cu = (await A('save', { table: 'customers', rec: { name: 'Khách thử' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'Dự án thử nhập Excel', customer_id: cu.id, status: 'Đang chào giá' } })).data;
  await E(`reloadLookups()`);
  await E(`(()=>{const o=URL.createObjectURL.bind(URL);window.__blobs=[];URL.createObjectURL=function(b){if(b instanceof Blob)window.__blobs.push(b);return o(b);};})()`);
  async function openFile(name) {
    const b64 = fs.readFileSync(DIR + '/' + name).toString('base64');
    await E(`MEMO={};location.hash='#/rfq/new?project=${pj.id}'`); await sleep(900);
    const t0 = Date.now();
    await E(`(()=>{const bin=atob('${b64}'),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const dt=new DataTransfer();dt.items.add(new File([u],'${name}'));const fi=document.querySelector('#view input[type=file]');fi.files=dt.files;fi.dispatchEvent(new Event('change'));})()`);
    for (let i = 0; i < 60; i++) { await sleep(250); if (await E(`!!document.querySelector('#view h3') && [...document.querySelectorAll('#view h3')].some(x=>/Chọn dòng/.test(x.textContent))`)) break; }
    return Date.now() - t0;
  }
  const rowsTxt = () => E(`[...document.querySelectorAll('#view .card')][2].textContent`);
  const mapOf = () => E(`(()=>{const o={};[...document.querySelectorAll('#view .card')][1].querySelectorAll('select').forEach((s,i)=>{if(s.value)o[s.value]=s.closest('div').querySelector('.mut').textContent.replace('Cột ','');});return JSON.stringify(o)})()`);
  const nLines = () => E(`[...document.querySelectorAll('#view .card')][3].querySelectorAll('tbody tr').length`);
  async function check(rs) { for (const r of rs) await E(`(()=>{const tr=[...document.querySelectorAll('#view .card')][2].querySelectorAll('tbody tr');for(const x of tr){if(x.children[1].textContent==='${r}'){const cb=x.querySelector('input[type=checkbox]');cb.click();return}}})()`); }
  const btn = t => E(`[...document.querySelectorAll("#view button,#acts button")].find(b=>b.textContent.indexOf(${JSON.stringify(t)})>=0).click()`);
  async function exportCustomer(tag) {
    await E(`window.__blobs=[]`);
    await btn('Xuất theo mẫu khách'); for (let i = 0; i < 40; i++) { await sleep(250); if (await E(`window.__blobs.length`)) break; }
    const b64 = await E(`(async()=>{const b=window.__blobs[window.__blobs.length-1];if(!b)return '';const u=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)})()`);
    if (b64) fs.writeFileSync(OUT + '/' + tag + '.xlsx', Buffer.from(b64, 'base64'));
    return { b64len: b64.length, toast: await E(`document.querySelector('#toasts').textContent`) };
  }
  async function setPrices(qid, fn) {
    const q = (await A('get', { table: 'quotes', id: qid })).data;
    const items = q.items.map((x, i) => Object.assign({}, x, { price: fn(x, i) }));
    const r = await A('save', { table: 'quotes', rec: q.quote, items }); return r;
  }

  console.log('— MIK (tiêu đề 2 tầng gộp ô, có cột Đơn giá / Thành tiền)');
  let ms = await openFile('mik.xlsx'); T('đọc file nhanh (<3s)', ms < 3000, ms);
  let mp = JSON.parse(await mapOf());
  T('ghép cột đúng', mp.name === 'B' && mp.spec === 'C' && mp.model === 'D' && mp.unit === 'G' && mp.qty === 'H' && mp.price === 'I' && mp.amount === 'J', mp);
  T('mặc định 6 dòng hàng thành 6 hạng mục', await nLines() === 6, await nLines());
  await check([8, 9]); await btn('Gộp thành 1 hạng mục'); await sleep(300);
  T('gộp 2 dòng → còn 5 hạng mục', await nLines() === 5, await nLines());
  T('dòng gộp hiện badge', /HM 1 \(gộp\)/.test(await rowsTxt()));
  await check([15]); await btn('Loại khỏi báo giá'); await sleep(300);
  T('loại 1 dòng → còn 4 hạng mục', await nLines() === 4);
  await btn('Tạo báo giá từ'); for (let i = 0; i < 20; i++) { await sleep(300); if (/#\/quote\//.test(await E('location.hash'))) break; }
  let qid = (await E('location.hash')).split('/')[2];
  T('đã chuyển sang báo giá', !!qid, await E('location.hash'));
  let q = (await A('get', { table: 'quotes', id: qid })).data;
  T('báo giá có rfq_id và 4 dòng có src_rows', q.quote.rfq_id && q.items.length === 4 && q.items[0].src_rows === '8,9', q.items.map(x => x.src_rows));
  T('tên hạng mục gộp lấy theo mục cha', /Hệ chữa cháy vách tường/.test(q.items[0].name), q.items[0].name);
  await setPrices(qid, (x, i) => [25000000, 1850000, 2100000, 3200000][i]);
  await E(`MEMO={};route()`); await sleep(1200);
  let ex = await exportCustomer('mik_out'); T('xuất file theo mẫu khách', ex.b64len > 1000, ex);
  const rl = (await A('rfqList', {})).data; T('danh sách bản nhập có 1 dòng', rl.length === 1 && rl[0].quote_code, rl);

  console.log('— Fire equipment (không có cột giá → thêm cột)');
  await openFile('fire.xlsx'); mp = JSON.parse(await mapOf());
  T('ghép cột Fire', mp.name === 'B' && mp.spec === 'C' && mp.unit === 'D' && mp.qty === 'E' && mp.note === 'F', mp);
  T('dòng con ghép tên dòng cha (DN50)', /Landing valves\/ Van góc – DN50/.test(await rowsTxt()));
  T('39 hạng mục mặc định', await nLines() === 39, await nLines());
  await btn('Tạo báo giá từ'); for (let i = 0; i < 20; i++) { await sleep(300); if (/#\/quote\//.test(await E('location.hash'))) break; }
  qid = (await E('location.hash')).split('/')[2];
  await setPrices(qid, (x, i) => 100000 + i * 1000); await E(`MEMO={};route()`); await sleep(1200);
  ex = await exportCustomer('fire_out'); T('xuất Fire: thêm cột giá', /đã thêm cột/.test(ex.toast), ex.toast);

  console.log('— Kamigumi (không có dòng tiêu đề)');
  await openFile('kami.xlsx'); mp = JSON.parse(await mapOf());
  T('đoán cột theo dữ liệu', mp.name === 'B' && mp.spec === 'C' && mp.qty === 'D', mp);
  T('báo không thấy tiêu đề', /Không thấy dòng tiêu đề/.test(await E(`[...document.querySelectorAll('#view .card')][0].textContent`)));
  T('15 hạng mục', await nLines() === 15, await nLines());
  await btn('Tạo báo giá từ'); for (let i = 0; i < 20; i++) { await sleep(300); if (/#\/quote\//.test(await E('location.hash'))) break; }
  qid = (await E('location.hash')).split('/')[2];
  await setPrices(qid, () => 50000); await E(`MEMO={};route()`); await sleep(1200);
  ex = await exportCustomer('kami_out'); T('xuất Kamigumi', ex.b64len > 1000, ex.toast);

  console.log('— Melia (1028 dòng, không có khối lượng)');
  ms = await openFile('melia.xlsx'); T('đọc file 2MB (<8s)', ms < 8000, ms);
  const n0 = await nLines(); T('chỉ tự chọn dòng có khối lượng (Melia: ' + n0 + ')', n0 < 10, n0);
  await E(`[...document.querySelectorAll('#view .card')][2].querySelector('select').value='item'`); await E(`(()=>{const s=[...document.querySelectorAll('#view .card')][2].querySelector('select');s.dispatchEvent(new Event('change'))})()`); await sleep(300);
  T('lọc chỉ dòng hàng có phân trang', /‹|›/.test(await rowsTxt()));
  await check([30, 32, 34]); await btn('Gộp thành 1 hạng mục'); await sleep(300);
  T('gộp 3 dòng Melia', await nLines() === n0 + 1, await nLines());
  await btn('Lưu bản nhập'); await sleep(1500);
  T('lưu bản nhập → có mã', /#\/rfq\/X/.test(await E('location.hash')), await E('location.hash'));
  const rid = (await E('location.hash')).split('/')[2];
  await E(`MEMO={};route()`); await sleep(1500);
  T('mở lại bản nhập: còn đủ hạng mục', await nLines() === n0 + 1, await nLines());
  console.log('— Nhớ cách ghép cột theo khách');
  const maps = (await A('rfqMaps', { project_id: pj.id })).data; T('đã lưu cách ghép của khách', Object.keys(maps.maps).length >= 3, Object.keys(maps.maps).length);
  console.log('Lỗi console:', JSON.stringify(pg.logs)); console.log(ok + ' đạt, ' + bad + ' lỗi'); c.proc.kill(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
