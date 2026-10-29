// Playwright smoke: node tests/smoke.cjs [baseUrl]
const { chromium } = require('/home/user/cryptiq/frontend/node_modules/playwright');
const base = process.argv[2] || 'http://127.0.0.1:3220';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type()==='error' && !/favicon|fonts|google|net::ERR|Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
  let fail = 0; const ok = (c, m) => { console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
  let r = await p.goto(base + '/login', {waitUntil:'networkidle'}); ok(r.status()===200, '/login 200');
  await p.getByText('Explore Demo App').first().click();
  await p.waitForURL(/dashboard|\/$/, {timeout: 20000}).catch(()=>{});
  await p.goto(base + '/dashboard', {waitUntil:'networkidle'}); ok(/dashboard/.test(p.url()), 'demo login reaches /dashboard (' + p.url() + ')');
  ok((await p.locator('h1').count())>=1, 'dashboard has h1');
  r = await p.goto(base + '/wallet-guard', {waitUntil:'networkidle'}); ok(r.status()===200, '/wallet-guard 200');
  ok((await p.locator('input').count())>=1, 'wallet-guard has input');
  console.log('errors:', JSON.stringify(errs.slice(0,8)));
  ok(errs.length===0, 'no page/console errors');
  await b.close(); process.exit(fail?1:0);
})();
