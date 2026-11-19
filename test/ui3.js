const { launch, open } = require('./cdp'); const fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4000);
  const b64 = fs.readFileSync('/tmp/old.xlsx').toString('base64');
  const r = await pg.ev(`(async()=>{const bin=atob('${b64}'),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
   const x=await HatoMigrate.importXlsx(new File([u],'o.xlsx')); await HatoStore.importWorkbook(x.snap); const l=api('catalogList',{}); return {found:x.found, l: JSON.stringify(l).slice(0,300)}})().catch(e=>String(e))`);
  console.log(JSON.stringify(r)); c.proc.kill(); process.exit(0);
})();
