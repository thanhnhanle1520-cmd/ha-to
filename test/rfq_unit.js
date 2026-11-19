// Kiểm thử "bộ não" nhập Excel (chạy bằng Node, không cần trình duyệt)
const C = require('../rfq-core.js'); require('../xlsx-patch.js'); const P = globalThis.XlsxPatch; const fs = require('fs');
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗ FAIL:', n, JSON.stringify(x === undefined ? '' : x).slice(0, 300)); } };
// 1. tiêu đề 2 tầng + từ đồng nghĩa
let rows = [['BẢNG KHỐI LƯỢNG'], [], ['STT', 'Description', 'Specification', 'Unit', "Q'ty", 'Unit price', 'Amount', 'Remarks'], ['', '', '', '', '', '', '', ''],
  ['A', 'HYDRANT SYSTEM'], ['1', 'Fire hose cabinet', 'Steel 1.2mm', 'set', 12, 1000, 12000], ['', 'Landing valve', 'PN16'], ['', 'DN50', '', 'pcs', 24, 50, 1200], ['', 'DN65', '', 'pcs', 6, 70, 420], ['', 'TOTAL', '', '', '', '', 13620]];
let h = C.findHeader(rows, [{ r1: 2, c1: 0, r2: 3, c2: 0 }]);
T('tìm dòng tiêu đề (gộp 2 dòng)', h && h.row === 3 && h.last === 4, h);
let m = C.mapColumns(h.texts, rows, h.last + 1);
T("Q'ty → Số lượng, Amount → Thành tiền", m.map.qty === 4 && m.map.amount === 6 && m.map.price === 5 && m.map.name === 1 && m.map.spec === 2 && m.map.note === 7, m.map);
let cl = C.classify(rows, h.last + 1, m.map);
const by = r => cl.find(x => x.r === r);
T('dòng A là mục', by(5).kind === 'section');
T('dòng con DN50 mang tên dòng cha', by(8).full === 'Landing valve – DN50' && by(8).spec === 'PN16', by(8));
T('dòng TOTAL là dòng tổng', by(10).kind === 'total');
// 2. kiểm tra dữ liệu: cột Amount là tổng chứ không phải thành tiền
let rows2 = [['Item', 'Description', 'Qty', 'Price', 'Amount'], ['1', 'A', 2, 10, 999], ['2', 'B', 3, 10, 999], ['3', 'C', 4, 10, 999]];
let m2 = C.mapColumns(rows2[0], rows2, 2);
T('cảnh báo cột Amount không bằng SL × giá', m2.warn.some(w => /Số lượng × Đơn giá/.test(w)), m2.warn);
// 3. không có tiêu đề → đoán theo dữ liệu
let rows3 = [[], ['', 'Sprinkler pendent'], ['', '', 'K=5.6, 68°C', 120], ['', '', 'K=8.0, 68°C', 40], ['', 'Fire extinguisher', 'CO2 5kg', 30]];
T('không thấy tiêu đề', C.findHeader(rows3, []) === null);
let m3 = C.mapColumns([], rows3, 1);
T('đoán cột tên / quy cách / SL', m3.map.name === 1 && m3.map.qty === 3 && m3.map.spec === 2, m3.map);
let cl3 = C.classify(rows3, 1, m3.map);
T('dòng chỉ có quy cách mang tên dòng cha', cl3.find(x => x.r === 3).full === 'Sprinkler pendent', cl3);
// 4. nhớ cách ghép theo khách
let m4 = C.mapColumns(h.texts, rows, h.last + 1, { spec: 7, note: 2 });
T('ưu tiên cách ghép đã lưu', m4.map.spec === 7 && m4.map.note === 2 && m4.conf.spec === 'saved', m4.map);
let m5 = C.mapColumns(h.texts, rows, h.last + 1, { qty: 3 });
T('cách ghép đã lưu sai (SL là chữ) vẫn bị cảnh báo', m5.conf.qty === 'low' && m5.warn.length, m5);
// 5. kế hoạch điền ngược
let plan = C.fillPlan({ map: m.map, header_row: 3, header_last: 4 }, [{ src: [6], qty: 12, price: 1500 }, { src: [8, 9], qty: 1, price: 5000, model: 'X1' }], rows);
const e = (r, c) => plan.edits.filter(x => x.r === r && x.c === c).pop();
T('dòng đơn: đơn giá + thành tiền (giữ công thức)', e(6, 5).v === 1500 && e(6, 6).v === 18000 && e(6, 6).keepFormula, plan.edits);
T('dòng gộp: "Trọn gói" + tổng ở dòng đầu', e(8, 5).v === 'Trọn gói' && e(8, 6).v === 5000);
T('dòng gộp: các dòng sau ghi "Bao gồm trong mục trên"', e(9, 5).v === 'Bao gồm trong mục trên' && e(9, 6).v == null);
T('dòng không báo giá để trống', !plan.edits.some(x => x.r === 7));
let plan2 = C.fillPlan({ map: { name: 1, qty: 4 }, header_row: 3 }, [{ src: [6], qty: 12, price: 1500 }], rows);
T('không có cột giá → thêm 2 cột sau cột cuối', plan2.added.length === 2 && plan2.added[0][0] === 8 && plan2.added[1][0] === 9, plan2.added);
// 6. vá XML trang tính
let xml = '<worksheet><dimension ref="A1:C3"/><sheetData><row r="1" spans="1:3"><c r="A1" s="2" t="s"><v>0</v></c><c r="C1" s="5"><f>A1*2</f><v>4</v></c></row><row r="3"><c r="B3" s="7"/></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>';
let out = P.patchSheet(xml, [{ r: 1, c: 1, v: 1500 }, { r: 1, c: 2, v: 9, keepFormula: true }, { r: 2, c: 0, v: 'Trọn gói & <x>', styleFrom: { r: 3, c: 1 } }, { r: 3, c: 1, v: 7 }]);
T('chèn ô mới đúng thứ tự cột', /<c r="A1"[^>]*>.*<c r="B1"><v>1500<\/v><\/c><c r="C1"/.test(out), out);
T('giữ công thức, bỏ kết quả cũ', /<c r="C1" s="5"><f>A1\*2<\/f><\/c>/.test(out), out);
T('thêm dòng mới, chữ được thoát ký tự, lấy kiểu ô mẫu', /<row r="2"><c r="A2" s="7" t="inlineStr"><is><t xml:space="preserve">Trọn gói &amp; &lt;x&gt;<\/t><\/is><\/c><\/row><row r="3">/.test(out), out);
T('giữ kiểu ô cũ khi ghi số', /<c r="B3" s="7"><v>7<\/v><\/c>/.test(out));
T('giữ ô gộp, bỏ dimension cũ', /<mergeCell ref="A1:B1"\/>/.test(out) && !/<dimension/.test(out));
// 7. (tuỳ chọn) file khách thật đã chuyển sang JSON — chỉ chạy trên máy có dữ liệu, không đưa lên GitHub
const FX = process.env.RFQ_JSON || '/tmp/rfqfx';
if (fs.existsSync(FX + '/mik.json')) {
  const exp = { mik: { name: 1, qty: 7, price: 8, amount: 9 }, fire: { name: 1, qty: 4, unit: 3 }, kami: { name: 1, qty: 3, spec: 2 }, melia: { name: 1, qty: 8, brand: 6, origin: 7 }, vtc: { code: 1, name: 3 }, mik1: { qty: 7, price: 8 } };
  Object.keys(exp).forEach(k => { const d = JSON.parse(fs.readFileSync(FX + '/' + k + '.json')); const hh = C.findHeader(d.rows, d.merges); const mm = C.mapColumns(hh ? hh.texts : [], d.rows, hh ? hh.last + 1 : 1); T('file thật ' + k + ': ghép cột chính', Object.keys(exp[k]).every(f => mm.map[f] === exp[k][f]), mm.map); });
}
console.log(ok + ' đạt, ' + bad + ' lỗi'); process.exit(bad ? 1 : 0);
