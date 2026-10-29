// Visit every route and report CSP violations / page errors: node tests/csp-sweep.cjs [baseUrl]
const { chromium } = require('/home/user/cryptiq/frontend/node_modules/playwright');
const base = process.argv[2] || 'http://127.0.0.1:3220';
const routes = ['/','/login','/dashboard','/wallet-guard','/copilot','/transactions','/security','/evidence-room','/statement','/pay','/pay/qr','/plan','/simulate','/profile','/photos','/upload','/goals','/household','/twin','/scenarios','/forecast-risk','/my-data','/not-a-route'];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  const bad = [];
  p.on('pageerror', e => bad.push(p.url()+' pageerror '+e.message));
  p.on('console', m => { const t=m.text(); if (/Content Security Policy|Refused to/i.test(t)) bad.push(p.url()+' CSP '+t.slice(0,200)); });
  await p.goto(base+'/login',{waitUntil:'networkidle'}); await p.getByText('Explore Demo App').first().click(); await p.waitForTimeout(3000);
  for (const r of routes) { try { await p.goto(base+r,{waitUntil:'load'}); await p.waitForTimeout(1500);} catch(e){ bad.push(r+' nav '+e.message.slice(0,80)); } }
  console.log(bad.length? bad.join('\n') : 'no CSP violations or page errors on '+routes.length+' routes');
  await b.close(); process.exit(bad.length?1:0);
})();
