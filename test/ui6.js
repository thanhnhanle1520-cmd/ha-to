const { launch, open } = require('./cdp'); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const c = await launch(); const pg = await open(c.port, 'http://127.0.0.1:8765/index.html?local=1'); await sleep(4000);
  await pg.ev(`api('taskSave',{rec:{title:'Gọi anh Bình chốt giá van',start_date:'2026-11-10',end_date:'2026-11-12',priority:'Cao',type:'Gọi khách',remind:'0',repeat:'week'}})`);
  await pg.ev(`MEMO={};location.hash='#/dashboard'`); await sleep(3000);
  await pg.ev(`REM.popped=false;refreshReminders()`); await sleep(1500); await pg.shot('/tmp/popup.png');
  await pg.ev(`document.querySelector('.md .mf button:last-child').click()`);
  await pg.ev(`taskModal(null,'',function(){})`); await sleep(600); await pg.shot('/tmp/taskmodal.png'); console.log(pg.logs); c.proc.kill(); process.exit(0);
})();
