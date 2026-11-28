// Bản 40: giảm giá tổng (gõ % · số tiền · tổng thanh toán mong muốn), in + chuyển HĐ trừ vào đơn giá; danh sách báo giá gộp theo mã
const { launch, open } = require('./cdp'); const fs = require('fs'), path = require('path'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 600)); } };
const SHOT = process.env.SHOT_DIR || '/tmp';
const PREV = path.join(__dirname, '..', 'dist', '__xem_bao_gia40.html');
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4500);
  const E = s => pg.ev(s), A = (a, p) => E(`api(${JSON.stringify(a)},${JSON.stringify(p || {})})`);
  await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await E(`(()=>{const ss=ss_();if(ss.getSheetByName('DuLieu_Chung'))return;const sh=ss.insertSheet('DuLieu_Chung');const v=[['STT','Thương hiệu','Nhóm hàng','Tên tiếng Việt','Model','ĐVT','Giá vốn','Giá bán tham chiếu','Trạng thái'],[1,'Sông Hồng','Bình','Bình chữa cháy bột ABC 4kg','SH.AP4','Bình',250000,360000,'Đang bán']];sh.getRange(1,1,v.length,v[0].length).setValues(v);})()`);
  const cu = (await A('save', { table: 'customers', rec: { name: 'Công ty CP Kỹ thuật và Xây dựng Searefico', contact: 'Ms. Hương' } })).data;
  const pj = (await A('save', { table: 'projects', rec: { name: 'GRAND MERCURE HỘI AN', customer_id: cu.id, status: 'Đang chào giá' } })).data;
  const li = (name, model, unit, qty, price, cost, note) => ({ name, model, brand: 'Sông Hồng-Thái Dương', origin: 'Việt Nam', unit, qty, price, cost, note });
  const items = [li('Bình chữa cháy bột ABC SÔNG HỒNG 4kg', 'SH.AP4', 'Bình', 4, 360000, 250000), li('Bình chữa cháy khí CO2 SÔNG HỒNG 5kg', 'SH.C5', 'Bình', 4, 696000, 500000), li('Chi phí giao hàng', '', 'Chuyến', 1, 800000, 0)];

  console.log('— Tính tổng có giảm giá');
  let r = (await A('save', { table: 'quotes', rec: { project_id: pj.id, vat_pct: 8, disc_mode: 'pct', disc_value: 5 }, items })).data;
  const q = r.quote; let t = r.totals;
  T('giảm 5%: 5.024.000 − 251.200 = 4.772.800; VAT 8% 381.824; tổng 5.154.624', t.gross === 5024000 && t.disc === 251200 && t.sub === 4772800 && t.vat === 381824 && t.total === 5154624, t);
  t = (await A('save', { table: 'quotes', rec: Object.assign({}, q, { disc_mode: 'amt', disc_value: 254000 }), items })).data.totals;
  T('gõ số tiền 254.000: sau giảm 4.770.000, VAT 381.600, tổng 5.151.600', t.disc === 254000 && t.sub === 4770000 && t.vat === 381600 && t.total === 5151600 && !t.disc_pct, t);
  const bad100 = await A('save', { table: 'quotes', rec: Object.assign({}, q, { disc_mode: 'pct', disc_value: 120 }), items });
  T('giảm quá 100% → báo lỗi', !bad100.ok && /100%/.test(bad100.error), bad100.error);
  const qm = (await A('save', { table: 'quotes', rec: { project_id: pj.id, vat_pct: 8, disc_mode: 'amt', disc_value: 100000 }, items: [li('Tủ', 'T', 'Cái', 1, 1000000, 0), Object.assign(li('Lắp đặt', '', 'Gói', 1, 1000000, 0), { vat_line: 10 })] })).data.totals;
  T('nhiều mức VAT: giảm chia theo tỷ lệ (50.000 mỗi mức) → VAT 76.000 + 95.000', qm.groups.length === 2 && qm.groups[0].vat === 76000 && qm.groups[1].vat === 95000 && qm.total === 2071000, qm.groups);
  const lst = (await A('list', { table: 'quotes' })).data.find(x => x.id === q.id);
  T('danh sách báo giá: tổng có VAT đã trừ giảm giá', lst.total === 5151600, lst.total);

  console.log('— Màn nhập: 3 ô giảm giá');
  await E(`reloadLookups()`); await sleep(500); await E(`window.__T=[];const _t=toast;toast=function(m,e){if(e)__T.push(m);return _t.apply(this,arguments)}`);
  await E(`MEMO={};location.hash='#/quote/${q.id}'`); await sleep(1800);
  const ft = () => E(`document.querySelector('#view tfoot').textContent`);
  T('đang lưu theo số tiền: ô % để trống (không hiện % lẻ), ô số tiền 254.000', await E(`document.querySelector('#discPct').value`) === '' && await E(`document.querySelector('#discAmt').value`) === '254.000', await E(`[discPct.value,discAmt.value,discWant.value]`));
  await E(`(()=>{const i=document.querySelector('#discPct');i.value='5';i.dispatchEvent(new Event('change'))})()`); await sleep(500);
  T('gõ 5% → số tiền 251.200, Cộng sau giảm giá 4.772.800, tổng 5.154.624', await E(`document.querySelector('#discAmt').value`) === '251.200' && /Cộng sau giảm giá4\.772\.800/.test(await ft()) && /5\.154\.624/.test(await ft()), await ft());
  await E(`(()=>{const i=document.querySelector('#discWant');i.value='5.150.000';i.dispatchEvent(new Event('change'))})()`); await sleep(500);
  const tw = await E(`(()=>{const m=document.querySelector('#view tfoot').textContent.match(/Tổng thanh toán([\\d.]+)/);return m?+m[1].replace(/\\./g,''):0})()`);
  T('gõ tổng mong muốn 5.150.000 → tự tính số tiền giảm, tổng sát (lệch ≤ 1đ), ô % trống', Math.abs(tw - 5150000) <= 1 && await E(`document.querySelector('#discPct').value`) === '', [tw, await E(`document.querySelector('#discAmt').value`)]);
  await E(`(()=>{const i=document.querySelector('#discAmt');i.value='254.000';i.dispatchEvent(new Event('change'))})()`); await sleep(500);
  T('lãi gộp nội bộ tính sau giảm giá (4.770.000 − 3.000.000 = 1.770.000)', /Lãi gộp \(sau giảm giá\)1\.770\.000/.test(await ft()), await ft());
  await E(`(()=>{const x=[...document.querySelectorAll('#view h3, #view b')].find(e=>/Dòng hàng/.test(e.textContent));if(x)x.scrollIntoView();})()`); await sleep(300);
  await pg.shot(SHOT + '/s40_1_giam_gia_nhap.png');
  await E(`(()=>{const i=document.querySelector('#discPct');i.value='45';i.dispatchEvent(new Event('change'))})()`); await sleep(400);
  T('giảm sâu dưới giá mua → dòng lãi gộp cảnh báo đỏ', /ĐANG BÁN DƯỚI GIÁ MUA/.test(await ft()));
  await E(`(()=>{const i=document.querySelector('#discAmt');i.value='254.000';i.dispatchEvent(new Event('change'))})()`); await sleep(400);
  await E(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Lưu').click()`); await sleep(1800);
  const g = (await A('get', { table: 'quotes', id: q.id })).data;
  const errT = await E(`window.__T`);
  T('bấm Lưu → lưu kiểu "số tiền" 254.000 (không báo lỗi)', !errT.length && g.quote.disc_mode === 'amt' && g.quote.disc_value === 254000 && g.totals.total === 5151600, [g.quote.disc_mode, g.quote.disc_value, errT]);

  console.log('— Mẫu in');
  let x = (await A('export', { kind: 'quote', id: q.id, format: 'html' })).data.html;
  T('in: Cộng tiền hàng 5.024.000 · Giảm giá −254.000 (không ghi %) · Cộng sau giảm giá 4.770.000 · VAT 381.600 · Tổng 5.151.600', /Cộng tiền hàng<\/td><td class="r">5\.024\.000/.test(x) && /Giảm giá<\/td><td class="r">-254\.000/.test(x) && /Cộng sau giảm giá<\/td><td class="r">4\.770\.000/.test(x) && /381\.600/.test(x) && /5\.151\.600/.test(x));
  const r5 = (await A('save', { table: 'quotes', rec: Object.assign({}, g.quote, { disc_mode: 'pct', disc_value: 5 }), items: g.items })).data;
  x = (await A('export', { kind: 'quote', id: q.id, format: 'html' })).data.html;
  T('nhập theo % → in "Giảm giá (5%)"', /Giảm giá \(5%\)<\/td><td class="r">-251\.200/.test(x));
  fs.writeFileSync(PREV, x);
  const pv = await open(c.port, 'http://127.0.0.1:8765/__xem_bao_gia40.html'); await sleep(1200);
  await pv.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false }); await sleep(300);
  await pv.shot(SHOT + '/s40_2_mau_in_giam_gia.png'); pv.close(); try { fs.unlinkSync(PREV); } catch (e) { }
  const wd = await E(`call('export',{kind:'quote',id:${JSON.stringify(q.id)},format:'doc'}).then(DocxWrite.convert).then(r=>r.name)`);
  T('file Word vẫn tải được', /\.docx$/.test(wd), wd);

  console.log('— Chuyển HĐ: giảm giá trừ vào đơn giá');
  await E(`location.hash='#/'`); await sleep(600); await E(`MEMO={};location.hash='#/quote/${q.id}'`); await sleep(1800);
  await E(`document.querySelector('#btnQNew').click();document.querySelector('#miConvert').click()`); await sleep(600);
  { const cvt = await E(`(document.querySelector('#cvDisc')||{}).textContent||document.querySelector('.modal')?.textContent||'NO MODAL'`); T('hộp chuyển: báo trước "Giảm giá tổng 5% sẽ được trừ thẳng vào đơn giá"', /Giảm giá tổng 5%.*trừ thẳng vào đơn giá/.test(cvt), cvt.slice(0,300)); }
  await pg.shot(SHOT + '/s40_3_chuyen_hd.png');
  await E(`(()=>{const s=document.querySelector('.md select');s.value='HD';s.dispatchEvent(new Event('change'))})()`);
  await E(`[...document.querySelectorAll('.md .mf button')].find(b=>b.textContent==='Chuyển').click()`); await sleep(2200);
  const did = (await E(`location.hash`)).split('/')[2];
  const dd = (await A('get', { table: 'docs', id: did })).data, sum = dd.items.reduce((s, i) => s + i.qty * i.price, 0);
  T('HĐ: 3 dòng, đơn giá đã giảm (tròn 100đ), tổng trước thuế sát 4.772.800 (lệch ≤ 200đ)', dd.items.length === 3 && dd.items.every(i => i.price % 100 === 0) && Math.abs(sum - 4772800) <= 200 && dd.items[0].price < 360000, [dd.items.map(i => i.price), sum]);
  T('HĐ giữ "đơn giá chào" = giá báo giá gốc để đối chiếu', dd.items[0].price_offer === 360000, dd.items[0].price_offer);

  console.log('— Danh sách báo giá gộp theo mã');
  const rv = (await A('reviseQuote', { id: q.id })).data; await A('reviseQuote', { id: rv.id });
  await E(`try{localStorage.removeItem('qAllVer')}catch(e){};MEMO={};location.hash='#/quotes'`); await sleep(1800);
  const rowsOf = () => E(`[...document.querySelectorAll('#view tbody tr')].filter(t=>t.textContent.indexOf(${JSON.stringify(q.code)})>=0).map(t=>t.textContent)`);
  let rs = await rowsOf();
  T('mỗi mã 1 dòng (bản mới nhất R2), ghi "3 bản"', rs.length === 1 && /R2/.test(rs[0]) && /3 bản/.test(rs[0]), rs);
  await E(`[...document.querySelectorAll('#view tbody tr')].find(t=>t.textContent.indexOf(${JSON.stringify(q.code)})>=0).querySelector('.qtog').click()`); await sleep(500);
  rs = await rowsOf();
  T('bấm ▸ → xổ 2 bản cũ (R1, Gốc) ngay bên dưới, ghi "Đã thay thế" / "Đã chốt"', rs.length === 3 && /R1/.test(rs[1]) && /Gốc/.test(rs[2]) && /Đã thay thế/.test(rs[1]) && /Đã chốt/.test(rs[2]) && await E(`document.querySelectorAll('#view tr.qold-row').length`) === 2, rs);
  await pg.shot(SHOT + '/s40_4_ds_bao_gia_gop.png');
  await E(`document.querySelector('.qtog').click()`); await sleep(400);
  await E(`document.querySelector('#qAllVer').click()`); await sleep(500);
  T('tick "Hiện tất cả các bản" → hiện đủ bản cũ của mọi mã', (await rowsOf()).length === 3);
  await E(`document.querySelector('#qAllVer').click()`); await sleep(300);

  console.log(`\n${ok} đạt, ${bad} lỗi`); if (pg.logs.length) console.log('Lỗi console:', pg.logs);
  pg.close(); c.proc.kill(); process.exit(bad ? 1 : 0);
})().catch(e => { try { fs.unlinkSync(PREV); } catch (x) { } console.log('CRASH', e && e.stack || e); process.exit(2); });
