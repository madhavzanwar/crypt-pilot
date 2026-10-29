// BUG-069 (app pages): /login and /pay* have a main landmark; evidence-room, my-data, twin, pay have an h1.
const { chromium } = require('/home/user/cryptiq/frontend/node_modules/playwright');
const base = process.argv[2] || 'http://127.0.0.1:3220';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); let fail = 0;
  const ok = (c, m) => { console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
  for (const r of ['/login','/pay','/pay/qr']) { await p.goto(base+r,{waitUntil:'networkidle'}); const n = await p.locator('main').count(); ok(n===1, r+' has exactly one main ('+n+')'); }
  await p.goto(base+'/pay',{waitUntil:'networkidle'}); ok(await p.locator('h1').count()>=1, '/pay has h1');
  await p.goto(base+'/login',{waitUntil:'networkidle'}); await p.getByText('Explore Demo App').first().click(); await p.waitForTimeout(3000);
  for (const r of ['/evidence-room','/my-data','/twin','/statement']) { await p.goto(base+r,{waitUntil:'networkidle'}); await p.waitForTimeout(800); const n = await p.locator('h1').count(); ok(n>=1, r+' h1 count '+n+(r==='/statement'?' (BUG-069 wants 1)':'')); }
  await b.close(); process.exit(fail?1:0);
})();
