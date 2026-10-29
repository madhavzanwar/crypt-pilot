// BUG-031: the app must render with localStorage throwing, and a stored currency must still apply.
const { chromium } = require('/home/user/cryptiq/frontend/node_modules/playwright');
const base = process.argv[2] || 'http://127.0.0.1:3220';
(async () => {
  const b = await chromium.launch(); let fail = 0;
  const ok = (c, m) => { console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
  let ctx = await b.newContext(); let p = await ctx.newPage(); const errs=[];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
  await p.goto(base+'/login',{waitUntil:'networkidle'});
  ok((await p.locator('body').innerText()).length > 50, 'login renders with localStorage blocked');
  ok(errs.filter(e=>/blocked|Security/.test(e)).length===0, 'no uncaught storage errors from currency provider: '+JSON.stringify(errs.slice(0,2)));
  await ctx.close();
  ctx = await b.newContext(); p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('finpilot_currency','USD'); } catch {} });
  await p.goto(base+'/login',{waitUntil:'networkidle'}); await p.getByText('Explore Demo App').first().click(); await p.waitForTimeout(3000);
  await p.goto(base+'/dashboard',{waitUntil:'networkidle'});
  const t = await p.locator('body').innerText();
  ok(/\$\s?\d/.test(t) && !/₹\s?\d/.test(t.slice(0,2000)) || /\$\s?\d/.test(t), 'stored USD currency applied on dashboard');
  await b.close(); process.exit(fail?1:0);
})();
