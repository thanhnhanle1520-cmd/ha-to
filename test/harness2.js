// Chạy src/Code.gs + shim.js + overrides-gas.js trong Node, cùng giao diện với harness cũ để dùng lại bộ kiểm thử
const vm = require('vm'), fs = require('fs'), path = require('path');
const Shim = require('../shim.js');
function makeEnv(codePath, opts) {
  opts = opts || {};
  const env = Shim.create({ email: opts.email || 'admin@x.vn' });
  const clock = { now: opts.now || new Date('2026-11-17T10:00:00+07:00') };
  const trashed = [];
  global.__hatoTrash = id => trashed.push(id);
  const ctx = Object.assign({ console, JSON, Math, Object, Array, String, Number, Error, Set, Map, RegExp, parseInt, parseFloat, isNaN, TextEncoder, TextDecoder, btoa, atob, crypto: globalThis.crypto, Uint8Array,
    Date: class extends Date { constructor(...a) { a.length ? super(...a) : super(clock.now.getTime()); } static now() { return clock.now.getTime(); } } }, env.globals);
  vm.createContext(ctx);
  const code = fs.readFileSync(codePath, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../overrides-gas.js'), 'utf8') +
    '\n;this.__X={ACTIONS:ACTIONS,api:api,TABLES:TABLES,readTable_:readTable_,setRT:function(v){RT=v;},ensureSheets_:ensureSheets_,appendMany_:appendMany_,replaceChildren_:replaceChildren_,upsert_:upsert_,toRow_:toRow_,readSheet_:readSheet_,buildExport_:buildExport_,wrapHtml_:wrapHtml_,keepWarm:typeof keepWarm==="function"?keepWarm:null};';
  vm.runInContext(code, ctx);
  const sheets = new Proxy({}, { get: (_, n) => env.wb.sheets[n] });
  return { X: ctx.__X, env, sheets, clock, trashed, ctx };
}
module.exports = { makeEnv };
